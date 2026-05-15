package com.iridescentcraft.reforging.mixin;

import com.hollingsworth.arsnouveau.common.capability.ManaCap;
import io.redspace.ironsspellbooks.api.magic.MagicData;
import io.redspace.ironsspellbooks.api.registry.AttributeRegistry;

import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attribute;

import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Overwrite;
import org.spongepowered.asm.mixin.Shadow;

/**
 * Unified mana pool: routes every Ars ManaCap operation through the ISS
 * MagicData / AttributeRegistry.MAX_MANA pipeline.
 *
 * Design intent (Silvaria, 2026-05-15): one mana system across the two
 * magic ecosystems. ISS is the canonical pool; Ars spells deduct from it
 * at 1/3 of nominal cost so Ars keeps its "reliable, spammable" identity
 * versus ISS's "high-impact, long-CD" identity.
 *
 * Overwrites:
 *   getCurrentMana() -> MagicData.getMana()
 *   getMaxMana()     -> player attribute irons_spellbooks:max_mana
 *   removeMana(c)    -> MagicData.setMana(mana - c/3)
 *   addMana(_)       -> no-op (ISS owns regen, MagicManager.regenPlayerMana)
 *   setMana(_)       -> no-op (ISS owns the pool)
 *   setMaxMana(_)    -> no-op (ISS attribute owns the cap)
 *
 * Untouched:
 *   getGlyphBonus/setGlyphBonus, getBookTier/setBookTier -- Ars's caster
 *   progression metadata, persisted via NBT, used for spell tier gating.
 *
 * Replaces the prior mana_bridge.js attribute-mirror approach.
 */
@Mixin(value = ManaCap.class, remap = false)
public abstract class ArsManaCapMixin {

    @Shadow @Final
    private LivingEntity livingEntity;

    /**
     * @author IridescentCraft
     * @reason Unified mana pool -- delegate to ISS MagicData
     */
    @Overwrite
    public double getCurrentMana() {
        if (this.livingEntity == null) return 0;
        try {
            MagicData md = MagicData.getPlayerMagicData(this.livingEntity);
            return md != null ? md.getMana() : 0;
        } catch (Throwable t) {
            return 0;
        }
    }

    /**
     * @author IridescentCraft
     * @reason Unified mana pool -- delegate to ISS max_mana attribute
     */
    @Overwrite
    public int getMaxMana() {
        if (this.livingEntity == null) return 0;
        try {
            Attribute max = AttributeRegistry.MAX_MANA.get();
            return (int) this.livingEntity.getAttributeValue(max);
        } catch (Throwable t) {
            return 0;
        }
    }

    /**
     * @author IridescentCraft
     * @reason Unified mana pool -- deduct discounted cost from ISS
     */
    @Overwrite
    public double removeMana(double manaToRemove) {
        if (this.livingEntity == null) return 0;
        try {
            MagicData md = MagicData.getPlayerMagicData(this.livingEntity);
            if (md == null) return 0;
            // 1/3 discount: Ars is the "reliable, spammable" side of the
            // unified pool. Displayed spell cost is divided by 3 when
            // actually deducted from the ISS mana pool. Negative inputs
            // clamped to 0 (matches Ars's original removeMana contract).
            double discounted = Math.max(0.0, manaToRemove) / 3.0;
            float newMana = (float) Math.max(0.0, md.getMana() - discounted);
            md.setMana(newMana);
            return newMana;
        } catch (Throwable t) {
            return 0;
        }
    }

    /**
     * @author IridescentCraft
     * @reason Unified mana pool -- ISS owns regen via MagicManager
     */
    @Overwrite
    public double addMana(double manaToAdd) {
        // ISS's MagicManager.regenPlayerMana already drives regen on the
        // ISS pool. Ars's own per-tick addMana would double-regen.
        return getCurrentMana();
    }

    /**
     * @author IridescentCraft
     * @reason Unified mana pool -- ISS owns absolute mana state
     */
    @Overwrite
    public double setMana(double mana) {
        // Ars internals call setMana on the client when receiving
        // PacketUpdateMana from server; ignore -- we always read fresh
        // from ISS MagicData (which has its own sync mechanism).
        return getCurrentMana();
    }

    /**
     * @author IridescentCraft
     * @reason Unified mana pool -- ISS attribute owns the cap
     */
    @Overwrite
    public void setMaxMana(int maxMana) {
        // No-op: the cap is derived from the ISS max_mana attribute.
    }
}
