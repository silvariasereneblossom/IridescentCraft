package com.iridescentcraft.reforging.event;

import com.iridescentcraft.reforging.IridescentReforging;
import com.iridescentcraft.reforging.item.ItemModularArmor;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.event.entity.living.LivingHurtEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import se.mickelus.tetra.items.modular.IModularItem;

/**
 * Drives armor honing progression. Tetra ships tickProgression for weapons
 * and tools but not armor; we plug in two trigger sources:
 *
 *   1. LivingHurtEvent on the player target → +1 tick per equipped
 *      ItemModularArmor piece per hit. Scales with how much combat the
 *      player engages in.
 *   2. PlayerTickEvent (server side) every 1200 ticks (= 60s at 20 TPS)
 *      → +1 tick per equipped piece passively. Floor for non-combat play.
 *
 * IModularItem.tickProgression handles the gating internally
 * (ConfigHandler.moduleProgression flag, canGainHoneProgress check, NBT
 * counter increment). We only have to call it.
 */
@Mod.EventBusSubscriber(modid = IridescentReforging.MODID)
public final class ArmorHoneHandler {

    /** 60 seconds at 20 TPS. */
    private static final int PASSIVE_TICK_INTERVAL = 1200;

    private ArmorHoneHandler() {}

    @SubscribeEvent
    public static void onLivingHurt(LivingHurtEvent event) {
        if (!(event.getEntity() instanceof Player player)) return;
        if (player.level().isClientSide) return;
        progressEquippedArmor(player, 1);
    }

    @SubscribeEvent
    public static void onPlayerTick(TickEvent.PlayerTickEvent event) {
        if (event.phase != TickEvent.Phase.END) return;
        Player player = event.player;
        if (player.level().isClientSide) return;
        if (player.tickCount % PASSIVE_TICK_INTERVAL != 0) return;
        progressEquippedArmor(player, 1);
    }

    private static void progressEquippedArmor(Player player, int amount) {
        for (EquipmentSlot slot : EquipmentSlot.values()) {
            if (slot.getType() != EquipmentSlot.Type.ARMOR) continue;
            ItemStack stack = player.getItemBySlot(slot);
            if (stack.isEmpty()) continue;
            if (!(stack.getItem() instanceof ItemModularArmor)) continue;
            try {
                ((IModularItem) stack.getItem()).tickProgression(player, stack, amount);
            } catch (Throwable t) {
                // Tetra's tickProgression no-ops if module progression is
                // disabled; any other throw should not crash the hurt path.
            }
        }
    }
}
