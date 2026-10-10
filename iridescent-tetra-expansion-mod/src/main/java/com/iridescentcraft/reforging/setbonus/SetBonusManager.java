package com.iridescentcraft.reforging.setbonus;

import com.iridescentcraft.reforging.item.ItemModularArmor;
import com.iridescentcraft.reforging.item.SkinNbt;
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
import net.minecraftforge.event.entity.EntityLeaveLevelEvent;
import net.minecraftforge.event.entity.living.LivingEquipmentChangeEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

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
 * Tracking state: per-entity last known active set list, keyed by entity
 * UUID (no entity reference is held), used so we know which sets need
 * their attribute modifiers cleaned up when a set is broken and which
 * sets the player tick should keep refreshing. Only entities with at
 * least one ACTIVE set have an entry: an empty result removes the key,
 * and entries are dropped when a player logs out or a non-player entity
 * leaves its level, so the map stays bounded by "online players + loaded
 * mobs currently wearing a full set". The set attribute modifiers
 * themselves are permanent (saved with the entity) and so can outlive
 * the entry -- recompute() rebuilds the missing state from the modifiers
 * actually present, see there. Server thread only.
 */
@Mod.EventBusSubscriber(modid = "iridescent_reforging")
public class SetBonusManager {

    private static final Map<UUID, Set<String>> activeSetsByEntity = new HashMap<>();

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
            String skinId = SkinNbt.readSkinId(stack);
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

        UUID entityId = entity.getUUID();
        Set<String> previouslyActive = activeSetsByEntity.get(entityId);
        if (previouslyActive == null) {
            // No cached entry: either nothing was active at the last check,
            // or the entry is gone (logout / level leave / server restart)
            // while the entity kept its PERMANENT set modifiers. Rebuild the
            // "needs stripping" half from the modifiers actually present, so
            // a set that is no longer worn still loses its bonus. Sets that
            // ARE worn are left out on purpose: they take the apply path
            // below, which is idempotent and refreshes a stale amount.
            previouslyActive = new HashSet<>();
            for (SetBonusDefinition def : SetBonusRegistry.get().allDefinitions()) {
                if (nowActive.contains(def.setId())) continue;
                if (hasAnyAttributeModifier(entity, def)) previouslyActive.add(def.setId());
            }
        }

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

        // Never keep an empty entry -- this runs for EVERY living entity whose
        // armor changes, almost none of which wear a set.
        if (nowActive.isEmpty()) {
            activeSetsByEntity.remove(entityId);
        } else {
            activeSetsByEntity.put(entityId, nowActive);
        }
    }

    @SubscribeEvent
    public static void onPlayerLoggedOut(PlayerEvent.PlayerLoggedOutEvent event) {
        activeSetsByEntity.remove(event.getEntity().getUUID());
    }

    @SubscribeEvent
    public static void onEntityLeaveLevel(EntityLeaveLevelEvent event) {
        if (event.getLevel().isClientSide()) return;
        // Players are dropped on logout instead. A ServerPlayer changing
        // dimension leaves and re-joins as the SAME object with its
        // equipment snapshot intact, so no LivingEquipmentChangeEvent
        // follows to rebuild the entry -- dropping it here would silently
        // stop the 4s set-effect refresh until the next armor swap. Every
        // other entity re-enters a level as a fresh instance (chunk reload,
        // dimension change) whose first tick re-fires the equipment event.
        if (!(event.getEntity() instanceof LivingEntity) || event.getEntity() instanceof Player) return;
        activeSetsByEntity.remove(event.getEntity().getUUID());
    }

    /** True if any of the set's attribute modifiers is on the entity. Never creates attribute instances. */
    private static boolean hasAnyAttributeModifier(LivingEntity entity, SetBonusDefinition def) {
        for (SetBonusDefinition.AttributeBonusEntry e : def.attributeBonuses()) {
            if (entity.getAttributes().hasModifier(e.attribute(), e.modifier().getId())) return true;
        }
        return false;
    }

    private static void applyAttributeModifiers(LivingEntity entity, SetBonusDefinition def) {
        for (SetBonusDefinition.AttributeBonusEntry e : def.attributeBonuses()) {
            AttributeInstance inst = entity.getAttribute(e.attribute());
            if (inst == null) continue;
            // Idempotent. The modifier is permanent, so it is usually already
            // there when the cached entry was dropped (relog, level change):
            // leave an identical one alone (addPermanentModifier throws on a
            // duplicate UUID, and remove+add would only dirty the attribute);
            // replace one whose amount / operation went stale.
            AttributeModifier wanted = e.modifier();
            AttributeModifier existing = inst.getModifier(wanted.getId());
            if (existing != null) {
                if (existing.getOperation() == wanted.getOperation()
                        && Double.compare(existing.getAmount(), wanted.getAmount()) == 0) continue;
                inst.removeModifier(wanted.getId());
            }
            inst.addPermanentModifier(wanted);
        }
    }

    private static void stripAttributeModifiers(LivingEntity entity, SetBonusDefinition def) {
        for (SetBonusDefinition.AttributeBonusEntry e : def.attributeBonuses()) {
            AttributeInstance inst = entity.getAttribute(e.attribute());
            if (inst != null) inst.removeModifier(e.modifier().getId());
        }
    }
}
