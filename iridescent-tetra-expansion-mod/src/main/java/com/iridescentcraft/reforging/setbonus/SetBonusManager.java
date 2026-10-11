package com.iridescentcraft.reforging.setbonus;

import com.iridescentcraft.reforging.item.ItemModularArmor;
import com.iridescentcraft.reforging.item.SkinNbt;
import com.iridescentcraft.reforging.skin.SkinDefinition;
import com.iridescentcraft.reforging.skin.SkinRegistry;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
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
 * The bonuses are a pure function of what is WORN, so they are kept in
 * step with the entity rather than with this class's memory of it:
 *   - Set attribute modifiers are TRANSIENT, like vanilla's own equipment
 *     modifiers. They are never written to the entity's save data, so a
 *     set definition that is edited or deleted while a player is offline
 *     cannot strand a modifier nobody can find again. (Consequence, same
 *     as vanilla armor: a max_health-style bonus is re-granted after a
 *     relog rather than restored with the saved health.)
 *   - Every recompute re-asserts the modifiers of every worn set, not just
 *     newly completed ones, and the player tick does the same every 4s.
 *     Both are idempotent (an identical modifier is left alone), so this
 *     costs a few map lookups and heals anything that removed a modifier
 *     behind our back.
 *   - A player is recomputed on login and on respawn, and the cached entry
 *     is dropped when the player entity is replaced (death, End return).
 *     The replacement is a NEW entity under the SAME UUID with a fresh
 *     attribute map: trusting the old entity's entry is what used to leave
 *     a keepInventory respawn without its set attributes, and kept
 *     refreshing set effects on a player whose armor had dropped.
 *
 * Tracking state: per-entity last known active set list, keyed by entity
 * UUID (no entity reference is held), used so we know which sets need
 * their attribute modifiers cleaned up when a set is broken and which
 * sets the player tick should keep refreshing. Only entities with at
 * least one ACTIVE set have an entry: an empty result removes the key,
 * and entries are dropped when a player logs out or a non-player entity
 * leaves its level, so the map stays bounded by "online players + loaded
 * mobs currently wearing a full set". Server thread only.
 *
 * Legacy: builds before 2026-10 applied these as PERMANENT modifiers. An
 * entity saved by such a build may still carry one; recompute() finds
 * them by the definitions' modifier ids when it has no cached entry for
 * the entity -- stripping the ones whose set is no longer worn and
 * replacing the ones that are with a transient modifier.
 */
@Mod.EventBusSubscriber(modid = "iridescent_reforging")
public class SetBonusManager {

    private static final Map<UUID, Set<String>> activeSetsByEntity = new HashMap<>();

    private static final EquipmentSlot[] ARMOR_SLOTS = {
            EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};

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
        // Refresh every 80 ticks (~4s) for active sets: potion effects so
        // they don't run out while still equipped, attribute modifiers so
        // one that went missing comes back. Avoids a per-tick rescan: just
        // looks at the cached active set list.
        if (player.tickCount % 80 != 0) return;
        Set<String> active = activeSetsByEntity.get(player.getUUID());
        if (active == null || active.isEmpty()) return;
        for (String setId : active) {
            SetBonusRegistry.get().getDefinition(setId).ifPresent(def -> {
                applyAttributeModifiers(player, def, false);
                applyEffects(player, def);
            });
        }
    }

    /**
     * Recompute active sets for an entity. Called on equipment change, and
     * for players on login and respawn. Diffs the new active set list
     * against the previous: strips the modifiers of sets no longer worn,
     * (re-)asserts the modifiers of every set that is. Potion effects are
     * applied here on first activation; the tick refresh keeps them
     * fresh thereafter.
     */
    public static void recompute(LivingEntity entity) {
        if (entity.level().isClientSide) return;

        Map<String, Integer> setCounts = new HashMap<>();
        for (EquipmentSlot s : ARMOR_SLOTS) {
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
        Set<String> cached = activeSetsByEntity.get(entityId);
        // No cached entry: either nothing was active at the last check, or
        // this is the first look at this entity instance (login, respawn,
        // level join, server restart). In the second case it may still
        // carry set modifiers we did not put there this session -- the
        // PERMANENT ones older builds saved with the entity.
        boolean firstLook = cached == null;
        Set<String> previouslyActive;
        if (firstLook) {
            // Rebuild the "needs stripping" half from the modifiers actually
            // present, so a set that is no longer worn still loses its bonus.
            // Sets that ARE worn are left out on purpose: they take the apply
            // path below, which replaces whatever is there.
            previouslyActive = new HashSet<>();
            for (SetBonusDefinition def : SetBonusRegistry.get().allDefinitions()) {
                if (nowActive.contains(def.setId())) continue;
                if (hasAnyAttributeModifier(entity, def)) previouslyActive.add(def.setId());
            }
        } else {
            previouslyActive = cached;
        }

        // Strip modifiers from sets no longer active
        for (String setId : previouslyActive) {
            if (nowActive.contains(setId)) continue;
            SetBonusRegistry.get().getDefinition(setId).ifPresent(def -> {
                stripAttributeModifiers(entity, def);
                // Potion effects fade naturally — no manual strip.
            });
        }

        // (Re-)assert the modifiers of EVERY active set, not only the newly
        // active ones: the cached list says what was worn, not what the
        // entity still has. Idempotent, so an intact set costs nothing. On a
        // first look an existing modifier is replaced outright, which is
        // what turns a legacy permanent one into a transient one.
        for (String setId : nowActive) {
            boolean newlyActive = !previouslyActive.contains(setId);
            SetBonusRegistry.get().getDefinition(setId).ifPresent(def -> {
                applyAttributeModifiers(entity, def, firstLook);
                if (newlyActive) applyEffects(entity, def);
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
    public static void onPlayerLoggedIn(PlayerEvent.PlayerLoggedInEvent event) {
        // Don't lean on the first-tick equipment events alone: they only
        // fire for slots that hold something, so a player who logs in with
        // bare armor slots would keep a stale saved set modifier.
        recompute(event.getEntity());
    }

    @SubscribeEvent
    public static void onPlayerClone(PlayerEvent.Clone event) {
        // Death respawn and End return both hand the player a NEW entity
        // (same UUID, fresh attribute map, effects gone). The entry
        // describes the entity being replaced, so forget it; the respawn
        // handler below rebuilds it from what the new entity wears.
        activeSetsByEntity.remove(event.getEntity().getUUID());
    }

    @SubscribeEvent
    public static void onPlayerRespawn(PlayerEvent.PlayerRespawnEvent event) {
        // The new entity is in the world and has its inventory back (or
        // not: armor that dropped on death simply leaves no set active).
        recompute(event.getEntity());
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

    /**
     * Put the set's attribute modifiers on the entity as transient modifiers.
     *
     * @param replaceExisting false: idempotent -- an identical modifier is
     *                        left alone (adding a duplicate UUID throws, and
     *                        remove + add would only dirty the attribute and
     *                        re-sync it), one whose amount / operation went
     *                        stale is replaced. true: whatever carries the
     *                        modifier's id is removed first, so a permanent
     *                        modifier left by an older build cannot survive
     *                        as-is.
     */
    private static void applyAttributeModifiers(LivingEntity entity, SetBonusDefinition def,
                                                boolean replaceExisting) {
        for (SetBonusDefinition.AttributeBonusEntry e : def.attributeBonuses()) {
            AttributeInstance inst = entity.getAttribute(e.attribute());
            if (inst == null) continue;
            AttributeModifier wanted = e.modifier();
            AttributeModifier existing = inst.getModifier(wanted.getId());
            if (existing != null) {
                if (!replaceExisting
                        && existing.getOperation() == wanted.getOperation()
                        && Double.compare(existing.getAmount(), wanted.getAmount()) == 0) continue;
                inst.removeModifier(wanted.getId());
            }
            inst.addTransientModifier(wanted);
        }
    }

    /** (Re-)apply the set's potion effects. Players only, as before. */
    private static void applyEffects(LivingEntity entity, SetBonusDefinition def) {
        if (!(entity instanceof Player p) || p.level().isClientSide) return;
        for (SetBonusDefinition.EffectBonusEntry e : def.effectBonuses()) {
            p.addEffect(new MobEffectInstance(
                    e.effect(), e.durationTicks(), e.amplifier(),
                    true, false, true));
        }
    }

    private static void stripAttributeModifiers(LivingEntity entity, SetBonusDefinition def) {
        for (SetBonusDefinition.AttributeBonusEntry e : def.attributeBonuses()) {
            AttributeInstance inst = entity.getAttribute(e.attribute());
            if (inst != null) inst.removeModifier(e.modifier().getId());
        }
    }
}
