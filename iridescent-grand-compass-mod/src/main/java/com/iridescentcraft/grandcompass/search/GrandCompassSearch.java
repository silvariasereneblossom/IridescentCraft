package com.iridescentcraft.grandcompass.search;

import com.iridescentcraft.grandcompass.GrandCompass;
import net.minecraft.Util;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderSet;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.event.server.ServerStoppedEvent;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Server-side search engine for the Grand Compass. Instead of letting Nature's /
 * Explorer's Compass run their own search (which casts the held stack to THEIR
 * item type and gates every write behind {@code verifyNBT} — both fatal for a
 * foreign item), the search-packet mixins reroute here when the sender holds a
 * Grand Compass. We run the SAME vanilla locate the /locate command uses and
 * write the result onto OUR stack's NBT, which {@code GrandCompassClient} reads
 * for the directional HUD. Zero dependency on the two mods' item internals.
 *
 * <p><b>Throttling.</b> The locate is synchronous on the server thread (a 6400
 * block biome scan / a 100-chunk structure scan with
 * {@code skipKnownStructures=false}) and one runs per search packet, so a
 * spam-clicked — or scripted — search button stalled the whole server once per
 * click. Two per-player guards now sit in front of it:
 * <ul>
 *   <li><b>Replay cache</b>: the last finished result is kept for
 *       {@link #CACHE_TTL_MS}. An identical repeat (same dimension + same
 *       target, asked from within {@link #CACHE_ORIGIN_TOLERANCE} blocks of the
 *       original origin) is answered from it instantly, with the same NBT
 *       write and the same message a real locate would produce.</li>
 *   <li><b>Cooldown</b>: any other search within {@link #COOLDOWN_MS} of the
 *       previous real locate FINISHING is refused with an action-bar notice
 *       (the stack's NBT is left as it was). Anchoring on the finish time
 *       means a burst of packets queued behind one slow locate is refused too,
 *       instead of each one running as soon as the previous returns.</li>
 * </ul>
 * A normal single search is unaffected: it reaches the very same locate call
 * with the very same arguments. State is one small record per player who has
 * searched, dropped on logout and cleared when the server stops.
 *
 * Common (server) class only — no client refs.
 */
public final class GrandCompassSearch {

    // NBT result keys (read by GrandCompassClient HUD).
    public static final String FOUND = "GrandFound";
    public static final String FOUND_X = "GrandFoundX";
    public static final String FOUND_Z = "GrandFoundZ";

    private static final int BIOME_RADIUS = 6400, BIOME_H_STEP = 32, BIOME_V_STEP = 64;
    private static final int STRUCTURE_RADIUS = 100; // chunks, matches Explorer's default

    /** Minimum gap between two real locates per player, measured from the previous one finishing. */
    private static final long COOLDOWN_MS = 5_000L;
    /** How long a finished result may be replayed for an identical repeat search. */
    private static final long CACHE_TTL_MS = 30_000L;
    /**
     * A repeat only counts as "identical" if it is asked from within this many
     * blocks of the cached search's origin — one chunk, i.e. at or below the
     * resolution of both locates (structures are chunk-granular, the biome
     * scan samples every {@link #BIOME_H_STEP} blocks), so a replayed answer
     * is the answer a fresh locate would give.
     */
    private static final double CACHE_ORIGIN_TOLERANCE = 16.0;

    /** Last real locate per player. Touched on the server thread only; concurrent map as a belt. */
    private static final Map<UUID, LastSearch> LAST = new ConcurrentHashMap<>();

    /**
     * Outcome of a player's most recent real locate.
     *
     * @param finishedAtMs monotonic ms when it finished (cooldown + cache-age anchor)
     * @param targetKey    dimension + kind + target id(s); {@code null} when the
     *                     locate threw — nothing to replay, but the cooldown still applies
     * @param origin       search origin the result was computed from
     */
    private record LastSearch(long finishedAtMs, String targetKey, BlockPos origin,
                              boolean found, int x, int z) {}

    /** The actual locate; returns the hit, or {@code null} for "nothing in range". */
    @FunctionalInterface
    private interface Locator {
        BlockPos locate();
    }

    private GrandCompassSearch() {}

    /** Is this player holding a Grand Compass in either hand? (gate for the mixins) */
    public static boolean isHolding(Player player) {
        return held(player) != null;
    }

    private static ItemStack held(Player player) {
        if (player.getMainHandItem().getItem() == GrandCompass.GRAND_COMPASS.get()) return player.getMainHandItem();
        if (player.getOffhandItem().getItem() == GrandCompass.GRAND_COMPASS.get()) return player.getOffhandItem();
        return null;
    }

    /** Native biome locate (mirrors /locate biome): writes nearest match to our NBT. */
    public static void runBiome(ServerPlayer player, ResourceLocation biomeKey, BlockPos pos) {
        ItemStack stack = held(player);
        if (stack == null || biomeKey == null) return;
        try {
            ServerLevel level = (ServerLevel) player.level();
            ResourceKey<Biome> key = ResourceKey.create(Registries.BIOME, biomeKey);
            String targetKey = level.dimension().location() + "|biome|" + biomeKey;
            throttled(player, stack, targetKey, pos, () -> {
                var result = level.findClosestBiome3d(h -> h.is(key), pos, BIOME_RADIUS, BIOME_H_STEP, BIOME_V_STEP);
                return result == null ? null : result.getFirst();
            });
        } catch (Throwable t) {
            writeNotFound(stack, player);
        }
    }

    /** Native structure locate (mirrors /locate structure): nearest of any of the keys. */
    public static void runStructure(ServerPlayer player, List<ResourceLocation> structureKeys, BlockPos pos) {
        ItemStack stack = held(player);
        if (stack == null || structureKeys == null || structureKeys.isEmpty()) return;
        try {
            ServerLevel level = (ServerLevel) player.level();
            Registry<Structure> reg = level.registryAccess().registryOrThrow(Registries.STRUCTURE);
            List<Holder<Structure>> holders = new ArrayList<>();
            List<String> ids = new ArrayList<>();
            for (ResourceLocation rl : structureKeys) {
                reg.getHolder(ResourceKey.create(Registries.STRUCTURE, rl)).ifPresent(holders::add);
                ids.add(String.valueOf(rl));
            }
            // Unknown ids only: answered without a locate, so no cooldown / cache involved.
            if (holders.isEmpty()) { writeNotFound(stack, player); return; }
            ids.sort(null); // the result depends on the SET of structures, not the packet's order
            String targetKey = level.dimension().location() + "|structure|" + String.join(",", ids);
            throttled(player, stack, targetKey, pos, () -> {
                var result = level.getChunkSource().getGenerator()
                        .findNearestMapStructure(level, HolderSet.direct(holders), pos, STRUCTURE_RADIUS, false);
                return result == null ? null : result.getFirst();
            });
        } catch (Throwable t) {
            writeNotFound(stack, player);
        }
    }

    /**
     * Replay-cache + cooldown gate in front of a locate (see the class doc).
     * Runs on the server thread (the mixins hand off via {@code enqueueWork}).
     */
    private static void throttled(ServerPlayer player, ItemStack stack, String targetKey, BlockPos pos, Locator locator) {
        UUID id = player.getUUID();
        LastSearch last = LAST.get(id);
        if (last != null) {
            long age = Util.getMillis() - last.finishedAtMs();
            if (age < CACHE_TTL_MS && targetKey.equals(last.targetKey())
                    && last.origin().closerThan(pos, CACHE_ORIGIN_TOLERANCE)) {
                // Identical repeat: same answer, same feedback, no locate.
                if (last.found()) writeFound(stack, player, last.x(), last.z());
                else writeNotFound(stack, player);
                return;
            }
            if (age < COOLDOWN_MS) {
                long secs = Math.max(1L, (COOLDOWN_MS - age + 999L) / 1000L);
                player.displayClientMessage(Component.literal(
                        "§eGrand Compass§7: still recalibrating, try again in " + secs + "s"), true);
                return;
            }
        }

        BlockPos origin = pos.immutable();
        try {
            BlockPos hit = locator.locate();
            if (hit != null) {
                LAST.put(id, new LastSearch(Util.getMillis(), targetKey, origin, true, hit.getX(), hit.getZ()));
                writeFound(stack, player, hit.getX(), hit.getZ());
            } else {
                LAST.put(id, new LastSearch(Util.getMillis(), targetKey, origin, false, 0, 0));
                writeNotFound(stack, player);
            }
        } catch (Throwable t) {
            // A locate that blew up may well have burned time first: start the
            // cooldown, but leave nothing replayable behind.
            LAST.put(id, new LastSearch(Util.getMillis(), null, origin, false, 0, 0));
            throw t;
        }
    }

    /** Forge-bus listener (registered in {@link GrandCompass}): don't keep state for players who left. */
    public static void onPlayerLoggedOut(PlayerEvent.PlayerLoggedOutEvent event) {
        LAST.remove(event.getEntity().getUUID());
    }

    /** Forge-bus listener: nothing may leak into the next world (integrated server on a client). */
    public static void onServerStopped(ServerStoppedEvent event) {
        LAST.clear();
    }

    private static void writeFound(ItemStack stack, Player player, int x, int z) {
        var tag = stack.getOrCreateTag();
        tag.putBoolean(FOUND, true);
        tag.putInt(FOUND_X, x);
        tag.putInt(FOUND_Z, z);
        player.displayClientMessage(Component.literal("§6Grand Compass§7: target located"), true);
    }

    private static void writeNotFound(ItemStack stack, Player player) {
        stack.getOrCreateTag().putBoolean(FOUND, false);
        player.displayClientMessage(Component.literal("§cGrand Compass§7: nothing of that kind nearby"), true);
    }
}
