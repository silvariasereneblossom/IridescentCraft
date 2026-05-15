package com.iridescentcraft.reforging.mixin;

import com.hollingsworth.arsnouveau.api.mana.IManaCap;
import com.hollingsworth.arsnouveau.common.capability.ManaCap;
import com.iridescentcraft.modspells.event.ArsManaCapOwnerTracker;
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
public abstract class ArsManaCapMixin implements IManaCap {

    @Shadow @Final
    private LivingEntity livingEntity;

    /**
     * Resolve the owning player. Ars's `ManaCapAttacher` constructs the
     * cap via `new ManaCap(null)`, so the shadow `livingEntity` field is
     * always null in practice. We fall back to the
     * {@link ArsManaCapOwnerTracker} side-channel map populated by
     * AttachCapabilities / Clone / Respawn / DimensionChange events.
     */
    private LivingEntity icraft_resolveOwner() {
        if (this.livingEntity != null) return this.livingEntity;
        return ArsManaCapOwnerTracker.OWNERS.get(this);
    }

    /**
     * @author IridescentCraft
     * @reason Unified mana pool -- delegate to ISS MagicData
     */
    @Overwrite
    public double getCurrentMana() {
        LivingEntity owner = icraft_resolveOwner();
        if (owner == null) return 0;
        try {
            MagicData md = MagicData.getPlayerMagicData(owner);
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
        LivingEntity owner = icraft_resolveOwner();
        if (owner == null) return 0;
        try {
            Attribute max = AttributeRegistry.MAX_MANA.get();
            return (int) owner.getAttributeValue(max);
        } catch (Throwable t) {
            return 0;
        }
    }

    /**
     * @author IridescentCraft
     * @reason Unified mana pool -- deduct half displayed cost from ISS
     */
    @Overwrite
    public double removeMana(double manaToRemove) {
        LivingEntity owner = icraft_resolveOwner();
        if (owner == null) return 0;
        try {
            MagicData md = MagicData.getPlayerMagicData(owner);
            if (md == null) return 0;
            // 2026-05-15: 1/2 discount per playtest. The earlier 1/3 cut
            // felt invisible; 1:1 ran ~50 mana/cast which was prohibitive
            // for sustained casting. Half-cost is the middle ground: Ars
            // is still cheaper than ISS spell costs but Ars casts now
            // actually drain a noticeable portion of the pool. Negative
            // inputs clamped to 0 (matches Ars's original contract).
            double deduction = Math.max(0.0, manaToRemove) / 2.0;
            float newMana = (float) Math.max(0.0, md.getMana() - deduction);
            md.setMana(newMana);
            // ISS's MagicData.setMana mutates the server field but does NOT
            // emit a sync packet -- ISS's own callers (MagicManager.tick)
            // always pair setMana with PacketDistributor.sendToPlayer +
            // SyncManaPacket. Without this dispatch the client bar stays at
            // its pre-cast value and the next regen tick (~0.5 s later)
            // re-syncs the server's *also-old* number after partial regen
            // erases our deduction. Push the packet immediately so the bar
            // drops the instant the spell resolves.
            if (owner instanceof net.minecraft.server.level.ServerPlayer sp) {
                try {
                    io.redspace.ironsspellbooks.setup.PacketDistributor.sendToPlayer(sp,
                            new io.redspace.ironsspellbooks.network.SyncManaPacket(md));
                } catch (Throwable ignored) {
                    // ISS network missing or API moved -- silently skip.
                    // setMana already updated server state; client will
                    // catch up at next ISS regen-tick sync.
                }
            }
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
