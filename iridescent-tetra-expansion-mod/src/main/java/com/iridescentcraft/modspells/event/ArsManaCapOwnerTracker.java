package com.iridescentcraft.modspells.event;

import java.lang.ref.WeakReference;
import java.util.Collections;
import java.util.Map;
import java.util.WeakHashMap;

import com.hollingsworth.arsnouveau.api.mana.IManaCap;
import com.hollingsworth.arsnouveau.setup.registry.CapabilityRegistry;
import com.iridescentcraft.modspells.IridescentModularSpells;

import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.event.entity.EntityJoinLevelEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

/**
 * Tracks the owning player for each Ars `IManaCap` instance.
 *
 * Ars's `ManaCapAttacher.ManaCapProvider` constructs the backend cap with
 * `new ManaCap(null)` -- the cap's `livingEntity` field is never populated.
 * Our `ArsManaCapMixin` needs the player to route reads/writes through the
 * ISS pool, so we maintain a side-channel weak map: every time a player's
 * cap becomes reachable (join, clone, respawn) we record `cap -> player`.
 * The mixin then queries this map (via {@link #getOwner}) instead of the
 * (null) shadow field.
 *
 * Map keying: `WeakHashMap<IManaCap, WeakReference<LivingEntity>>`. IManaCap
 * inherits Object.equals (identity) and WeakHashMap weak-refs its KEYS only --
 * values are held strongly. The player strongly references its own cap
 * (player -> capability dispatcher -> provider -> cap), so storing the player
 * directly as the value kept the key reachable through the map itself and the
 * entry could never clear: every login / death / respawn pinned a whole
 * ServerPlayer (and, on clients, the ClientLevel it points at) for the life
 * of the JVM. The value is therefore a WeakReference too, so the map holds
 * neither side strongly and an entry dies with its player. On top of that we
 * drop entries eagerly on logout and for the replaced entity on Clone rather
 * than waiting on a GC cycle.
 */
@Mod.EventBusSubscriber(modid = IridescentModularSpells.MODID, bus = Mod.EventBusSubscriber.Bus.FORGE)
public final class ArsManaCapOwnerTracker {

    private ArsManaCapOwnerTracker() {}

    public static final Map<IManaCap, WeakReference<LivingEntity>> OWNERS =
            Collections.synchronizedMap(new WeakHashMap<>());

    /**
     * Owner of {@code cap}, or null when the cap was never tracked or its
     * owner has since been untracked / garbage-collected.
     */
    public static LivingEntity getOwner(IManaCap cap) {
        WeakReference<LivingEntity> ref = OWNERS.get(cap);
        return ref != null ? ref.get() : null;
    }

    private static void trackPlayer(Player player) {
        if (player == null) return;
        try {
            CapabilityRegistry.getMana(player).ifPresent(cap -> OWNERS.put(cap, new WeakReference<>(player)));
        } catch (Throwable ignored) {
            // ISS / Ars absent -- silent skip.
        }
    }

    /**
     * Drop every entry owned by {@code player} (plus any whose owner was
     * already collected). Matches by referent identity instead of looking the
     * cap up through the player, because a removed / replaced player's caps
     * are invalidated and the lookup would come back empty.
     */
    private static void untrackPlayer(LivingEntity player) {
        if (player == null) return;
        synchronized (OWNERS) {
            OWNERS.values().removeIf(ref -> {
                LivingEntity owner = ref.get();
                return owner == null || owner == player;
            });
        }
    }

    @SubscribeEvent
    public static void onJoinLevel(EntityJoinLevelEvent event) {
        if (event.getEntity() instanceof Player p) trackPlayer(p);
    }

    @SubscribeEvent
    public static void onClone(PlayerEvent.Clone event) {
        // After death/respawn / End return, the player object is a fresh
        // instance with a fresh cap: retire the entity it replaces, then
        // track the new one.
        untrackPlayer(event.getOriginal());
        trackPlayer(event.getEntity());
    }

    @SubscribeEvent
    public static void onRespawn(PlayerEvent.PlayerRespawnEvent event) {
        trackPlayer(event.getEntity());
    }

    @SubscribeEvent
    public static void onDimChange(PlayerEvent.PlayerChangedDimensionEvent event) {
        trackPlayer(event.getEntity());
    }

    @SubscribeEvent
    public static void onLoggedOut(PlayerEvent.PlayerLoggedOutEvent event) {
        untrackPlayer(event.getEntity());
    }
}
