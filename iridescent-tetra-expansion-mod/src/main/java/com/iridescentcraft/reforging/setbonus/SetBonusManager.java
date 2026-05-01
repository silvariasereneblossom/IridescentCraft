package com.iridescentcraft.reforging.setbonus;

import com.iridescentcraft.reforging.item.ItemModularArmor;
import com.iridescentcraft.reforging.item.ItemModularArmorClient;
import com.iridescentcraft.reforging.skin.SkinDefinition;
import com.iridescentcraft.reforging.skin.SkinRegistry;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.event.entity.living.LivingEquipmentChangeEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.WeakHashMap;

/**
 * Maintains active set bonuses on living entities.
 *
 * On any equipment change, scan the entity's 4 armor slots, count
 * pieces per setId among ItemModularArmor stacks, and:
 *   - For each set whose count >= requiredPieces, ensure its modifiers
 *     are present on the entity
 *   - For each previously-active set no longer met, strip its modifiers
 *
 * Potion effects fade on their own duration; the player tick refresh
 * re-applies them every 4s while a set is still active so they appear
 * permanent. Stripping = stop refreshing; effects expire naturally.
 *
 * Tracking state: per-entity last known active set list, used so we
 * know which sets need their attribute modifiers cleaned up when a
 * set is broken. WeakHashMap keyed on the entity to avoid leaking
 * references on entity discard.
 */
@Mod.EventBusSubscriber(modid = "iridescent_reforging")
public class SetBonusManager {

    private static final Map<UUID, Set<String>> activeSetsByEntity = new HashMap<>();
    private static final WeakHashMap<LivingEntity, Object> trackedEntities = new WeakHashMap<>();

    @SubscribeEvent
    public static void onEquipmentChange(LivingEquipmentChangeEvent event) {
        // Only armor slots matter for this system.
        EquipmentSlot slot = event.getSlot();
        if (slot.getType() != EquipmentSlot.Type.ARMOR) return;
        recompute(event.getEntity());
    }

    @SubscribeEvent
    public static void onPlayerTick(TickEvent.PlayerTickEvent event) {
        if (event.phase != TickEvent.Phase.END) return;
        Player player = event.player;
        if (player.level().isClientSide) return;
        // Refresh potion effects every 80 ticks (~4s) for active sets so
        // they don't run out while still equipped. Avoids a per-tick
        // rescan: just looks at the cached active set list.
        if (player.tickCount % 80 != 0) return;
        Set<String> active = activeSetsByEntity.get(player.getUUID());
        if (active == null || active.isEmpty()) return;
        for (String setId : active) {
            SetBonusRegistry.get().getDefinition(setId).ifPresent(def -> {
                for (SetBonusDefinition.EffectBonusEntry e : def.effectBonuses()) {
                    player.addEffect(new MobEffectInstance(
                            e.effect(), e.durationTicks(), e.amplifier(),
                            true, false, true));
                }
            });
        }
    }

    /**
     * Recompute active sets for an entity. Called on equipment change.
     * Diffs the new active set list against the previous, applying or
     * stripping attribute modifiers as needed. Potion effects are
     * applied here on first activation; the tick refresh keeps them
     * fresh thereafter.
     */
    public static void recompute(LivingEntity entity) {
        Map<String, Integer> setCounts = new HashMap<>();
        for (EquipmentSlot s : new EquipmentSlot[]{
                EquipmentSlot.HEAD, EquipmentSlot.CHEST,
                EquipmentSlot.LEGS, EquipmentSlot.FEET}) {
            ItemStack stack = entity.getItemBySlot(s);
            if (!(stack.getItem() instanceof ItemModularArmor)) continue;
            String skinId = ItemModularArmorClient.readSkinId(stack);
            if (skinId == null) continue;
            SkinDefinition def = SkinRegistry.get().getDefinition(skinId).orElse(null);
            if (def == null || def.setId() == null || def.setId().isEmpty()) continue;
            setCounts.merge(def.setId(), 1, Integer::sum);
        }

        Set<String> nowActive = new HashSet<>();
        for (Map.Entry<String, Integer> e : setCounts.entrySet()) {
            SetBonusRegistry.get().getDefinition(e.getKey()).ifPresent(bonus -> {
                if (e.getValue() >= bonus.requiredPieces()) {
                    nowActive.add(e.getKey());
                }
            });
        }

        Set<String> previouslyActive = activeSetsByEntity
                .getOrDefault(entity.getUUID(), new HashSet<>());

        // Strip modifiers from sets no longer active
        for (String setId : previouslyActive) {
            if (nowActive.contains(setId)) continue;
            SetBonusRegistry.get().getDefinition(setId).ifPresent(def -> {
                stripAttributeModifiers(entity, def);
                // Potion effects fade naturally — no manual strip.
            });
        }

        // Apply modifiers to newly active sets
        for (String setId : nowActive) {
            if (previouslyActive.contains(setId)) continue;
            SetBonusRegistry.get().getDefinition(setId).ifPresent(def -> {
                applyAttributeModifiers(entity, def);
                if (entity instanceof Player p && !p.level().isClientSide) {
                    for (SetBonusDefinition.EffectBonusEntry e : def.effectBonuses()) {
                        p.addEffect(new MobEffectInstance(
                                e.effect(), e.durationTicks(), e.amplifier(),
                                true, false, true));
                    }
                }
            });
        }

        activeSetsByEntity.put(entity.getUUID(), nowActive);
        trackedEntities.put(entity, Boolean.TRUE);
    }

    private static void applyAttributeModifiers(LivingEntity entity, SetBonusDefinition def) {
        for (SetBonusDefinition.AttributeBonusEntry e : def.attributeBonuses()) {
            AttributeInstance inst = entity.getAttribute(e.attribute());
            if (inst == null) continue;
            // Idempotent: remove existing modifier with this UUID first
            inst.removeModifier(e.modifier().getId());
            inst.addPermanentModifier(e.modifier());
        }
    }

    private static void stripAttributeModifiers(LivingEntity entity, SetBonusDefinition def) {
        for (SetBonusDefinition.AttributeBonusEntry e : def.attributeBonuses()) {
            AttributeInstance inst = entity.getAttribute(e.attribute());
            if (inst != null) inst.removeModifier(e.modifier().getId());
        }
    }
}
