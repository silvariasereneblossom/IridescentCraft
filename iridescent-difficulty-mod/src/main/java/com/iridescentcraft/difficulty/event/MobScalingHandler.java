package com.iridescentcraft.difficulty.event;

import com.iridescentcraft.difficulty.IridescentDifficulty;
import com.iridescentcraft.difficulty.config.DifficultyConfig;
import com.iridescentcraft.difficulty.scaling.DifficultyScaling;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.OwnableEntity;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.event.entity.EntityJoinLevelEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.registries.ForgeRegistries;

import java.util.UUID;

/**
 * Applies per-dimension scaling multipliers to hostile mobs at spawn time.
 *
 * <p>Filtering order (cheap-to-expensive):
 * <ol>
 *   <li>Server-side only ({@code level.isClientSide})</li>
 *   <li>Master enabled toggle</li>
 *   <li>Mob (subclass of Mob — players/items/projectiles excluded)</li>
 *   <li>Not already scaled (NBT flag check — respawned/loaded mobs already carry their modifiers via persistent attribute storage)</li>
 *   <li>Not a Player, not OwnableEntity (tamed/summoned)</li>
 *   <li>Category is MONSTER (hostile)</li>
 *   <li>Resource id not in excluded list (bosses + special mobs)</li>
 *   <li>Multiplier > 1.0 (skip if dim has 100% scaling)</li>
 * </ol>
 *
 * <p>Modifiers use stable per-attribute UUIDs so reloading a saved mob
 * doesn't apply twice. The NBT flag is belt-and-suspenders against entity
 * cross-loading paths that might bypass save/load attribute persistence.
 *
 * <p>Health is multiplied via MULTIPLY_BASE so a 2× modifier produces
 * exactly 2× the base value. After applying max_health, we call
 * {@code setHealth(getMaxHealth())} to top up the freshly-spawned mob to
 * its new max instead of leaving it at vanilla-base hp.
 */
public class MobScalingHandler {

    private static final UUID HP_UUID    = UUID.fromString("a3b1f001-0000-4000-8000-000000000001");
    private static final UUID DMG_UUID   = UUID.fromString("a3b1f001-0000-4000-8000-000000000002");
    private static final UUID ARMOR_UUID = UUID.fromString("a3b1f001-0000-4000-8000-000000000003");
    private static final UUID SPEED_UUID = UUID.fromString("a3b1f001-0000-4000-8000-000000000004");

    private static final String NBT_FLAG = "icraft_diff_scaled";

    @SubscribeEvent
    public static void onEntityJoin(EntityJoinLevelEvent e) {
        Entity entity = e.getEntity();
        if (entity.level().isClientSide) return;
        if (!DifficultyConfig.COMMON.enabled.get()) return;
        if (entity instanceof Player) return;
        if (!(entity instanceof Mob mob)) return;
        if (mob instanceof OwnableEntity own && own.getOwner() != null) return;

        // Don't double-apply if the mob was already scaled (loaded from save
        // or entered a portal already-scaled).
        if (mob.getPersistentData().getBoolean(NBT_FLAG)) return;

        ResourceLocation id = ForgeRegistries.ENTITY_TYPES.getKey(mob.getType());
        String idStr = id != null ? id.toString() : null;

        // Hostile mobs only (skip animals, water creatures, ambient, golems).
        // Exception: a force-include list catches clearly-hostile mobs that
        // some mods (MCreator packs like Terramity) mis-register under a
        // non-MONSTER category (MISC/CREATURE), which would otherwise let them
        // slip past this gate un-scaled. See DifficultyConfig.forceScaleEntities.
        MobCategory cat = mob.getType().getCategory();
        if (cat != MobCategory.MONSTER
                && (idStr == null || !DifficultyConfig.COMMON.forceScaleEntities.get().contains(idStr))) {
            return;
        }

        if (idStr != null && DifficultyConfig.COMMON.excludedEntities.get().contains(idStr)) return;

        if (!(e.getLevel() instanceof ServerLevel sl)) return;

        double mult = DifficultyScaling.getCurrentMultiplier(sl);
        if (mult <= 1.0) return; // no-op when dim multiplier is at vanilla

        applyScaling(mob, mult);
        mob.getPersistentData().putBoolean(NBT_FLAG, true);

        if (IridescentDifficulty.LOGGER.isDebugEnabled()) {
            IridescentDifficulty.LOGGER.debug(
                "[icraft-diff] scaled {} in {} by {}x (hp {} -> {})",
                id, sl.dimension().location(), String.format("%.2f", mult),
                String.format("%.1f", mob.getMaxHealth() / mult),
                String.format("%.1f", mob.getMaxHealth())
            );
        }
    }

    private static void applyScaling(LivingEntity entity, double mult) {
        if (DifficultyConfig.COMMON.scaleHealth.get()) {
            applyMultiplyBase(entity, Attributes.MAX_HEALTH, HP_UUID, mult, "icraft_diff_hp");
            entity.setHealth(entity.getMaxHealth()); // top off to new max
        }
        if (DifficultyConfig.COMMON.scaleDamage.get()) {
            applyMultiplyBase(entity, Attributes.ATTACK_DAMAGE, DMG_UUID, mult, "icraft_diff_dmg");
        }
        if (DifficultyConfig.COMMON.scaleArmor.get()) {
            applyMultiplyBase(entity, Attributes.ARMOR, ARMOR_UUID, mult, "icraft_diff_armor");
        }
        if (DifficultyConfig.COMMON.scaleSpeed.get()) {
            // sqrt — a 6× HP mob is not also 6× speed (that'd be unfair).
            applyMultiplyBase(entity, Attributes.MOVEMENT_SPEED, SPEED_UUID, Math.sqrt(mult), "icraft_diff_speed");
        }
    }

    /**
     * MULTIPLY_BASE math: result = base * (1 + sum_of_mb_modifiers).
     * For a target multiplier of 1.5× (150%), the modifier value is +0.5.
     * We pass the desired multiplier and convert here.
     */
    private static void applyMultiplyBase(LivingEntity e, Attribute attr, UUID uuid, double mult, String name) {
        AttributeInstance inst = e.getAttribute(attr);
        if (inst == null) return; // entity doesn't have that attribute (e.g., MAX_HEALTH on a non-living)

        // Defensive: remove an existing copy first. addPermanentModifier with
        // a duplicate UUID throws.
        if (inst.getModifier(uuid) != null) inst.removeModifier(uuid);

        inst.addPermanentModifier(new AttributeModifier(
            uuid, name, mult - 1.0, AttributeModifier.Operation.MULTIPLY_BASE
        ));
    }
}
