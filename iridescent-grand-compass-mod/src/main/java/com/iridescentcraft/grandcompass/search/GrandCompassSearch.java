package com.iridescentcraft.grandcompass.search;

import com.iridescentcraft.grandcompass.GrandCompass;
import com.iridescentcraft.grandcompass.item.GrandCompassItem;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderSet;
import net.minecraft.core.registries.Registries;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Registry;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.levelgen.structure.Structure;

import java.util.ArrayList;
import java.util.List;

/**
 * Server-side search engine for the Grand Compass. Instead of letting Nature's /
 * Explorer's Compass run their own search (which casts the held stack to THEIR
 * item type and gates every write behind {@code verifyNBT} — both fatal for a
 * foreign item), the search-packet mixins reroute here when the sender holds a
 * Grand Compass. We run the SAME vanilla locate the /locate command uses and
 * write the result onto OUR stack's NBT, which {@code GrandCompassClient} reads
 * for the directional HUD. Zero dependency on the two mods' item internals.
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
            var result = level.findClosestBiome3d(h -> h.is(key), pos, BIOME_RADIUS, BIOME_H_STEP, BIOME_V_STEP);
            if (result != null) writeFound(stack, player, result.getFirst().getX(), result.getFirst().getZ());
            else writeNotFound(stack, player);
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
            for (ResourceLocation rl : structureKeys) {
                reg.getHolder(ResourceKey.create(Registries.STRUCTURE, rl)).ifPresent(holders::add);
            }
            if (holders.isEmpty()) { writeNotFound(stack, player); return; }
            var result = level.getChunkSource().getGenerator()
                    .findNearestMapStructure(level, HolderSet.direct(holders), pos, STRUCTURE_RADIUS, false);
            if (result != null) writeFound(stack, player, result.getFirst().getX(), result.getFirst().getZ());
            else writeNotFound(stack, player);
        } catch (Throwable t) {
            writeNotFound(stack, player);
        }
    }

    private static void writeFound(ItemStack stack, Player player, int x, int z) {
        var tag = stack.getOrCreateTag();
        tag.putBoolean(FOUND, true);
        tag.putInt(FOUND_X, x);
        tag.putInt(FOUND_Z, z);
        player.displayClientMessage(Component.literal("§6Grand Compass §7— target located"), true);
    }

    private static void writeNotFound(ItemStack stack, Player player) {
        stack.getOrCreateTag().putBoolean(FOUND, false);
        player.displayClientMessage(Component.literal("§cGrand Compass §7— nothing of that kind nearby"), true);
    }
}
