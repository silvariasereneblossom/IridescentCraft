package com.iridescentcraft.modspells.event;

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
 * The mixin then queries this map instead of the (null) shadow field.
 *
 * Map keying: `WeakHashMap<IManaCap, LivingEntity>`. IManaCap inherits
 * Object.equals (identity); WeakHashMap also weak-refs keys, so when the
 * player despawns and the cap is no longer reachable, the entry GCs
 * naturally.
 */
@Mod.EventBusSubscriber(modid = IridescentModularSpells.MODID, bus = Mod.EventBusSubscriber.Bus.FORGE)
public final class ArsManaCapOwnerTracker {

    private ArsManaCapOwnerTracker() {}

    public static final Map<IManaCap, LivingEntity> OWNERS =
            Collections.synchronizedMap(new WeakHashMap<>());

    private static void trackPlayer(Player player) {
        if (player == null) return;
        try {
            CapabilityRegistry.getMana(player).ifPresent(cap -> OWNERS.put(cap, player));
        } catch (Throwable ignored) {
            // ISS / Ars absent -- silent skip.
        }
    }

    @SubscribeEvent
    public static void onJoinLevel(EntityJoinLevelEvent event) {
        if (event.getEntity() instanceof Player p) trackPlayer(p);
    }

    @SubscribeEvent
    public static void onClone(PlayerEvent.Clone event) {
        // After death/respawn / dimension change, the player object may
        // be a fresh instance with a fresh cap.
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
}
