package com.iridescentcraft.reforging.replacement;

import com.iridescentcraft.reforging.IridescentReforging;
import com.iridescentcraft.reforging.item.ItemModularArmor;
import com.iridescentcraft.reforging.item.ItemModularArmorClient;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.Tag;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.ArmorItem;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.registries.ForgeRegistries;
import se.mickelus.tetra.module.ItemUpgradeRegistry;

import java.util.Map;
import java.util.function.BiFunction;

/**
 * Replacement hook registered with Tetra's ItemUpgradeRegistry.
 *
 * Tetra fires hooks AFTER applying a vanilla replacement (item-class swap
 * + default modules). Signature: (original, replaced) -> finalStack.
 *
 * For specialized armor (e.g., Cultist Hood), Tetra's own replacement JSON
 * swapped the item class and applied default modules — but lost identity
 * NBT (skin tag, Apotheosis affixes, enchantments). This hook restores
 * those from the original stack:
 *   - Sets tag.Skin = skin_id from SpecializedReplacementRegistry lookup
 *   - Copies tag.affix_data, tag.affixes (Apotheosis affix nbt)
 *   - Copies Enchantments list
 *   - Copies tag.rarity (Apotheosis tier marker)
 *
 * No-op if:
 *   - Result is not an ItemModularArmor (e.g., vanilla iron sword path)
 *   - Original's item ID has no specialized_replacements entry (vanilla
 *     iron armor → drops out, generic Tetra replacement applies as-is)
 */
public final class SpecializedReplacementHook {

    public static void register() {
        if (ItemUpgradeRegistry.instance == null) {
            IridescentReforging.LOGGER.warn(
                    "[SpecializedReplacementHook] ItemUpgradeRegistry not initialized yet -- hook NOT registered");
            return;
        }
        ItemUpgradeRegistry.instance.registerReplacementHook(HOOK);
        IridescentReforging.LOGGER.info(
                "[SpecializedReplacementHook] registered Tetra replacement hook");
    }

    private static final BiFunction<ItemStack, ItemStack, ItemStack> HOOK = (original, replaced) -> {
        // Only act if the result is one of our reforged items.
        if (replaced == null || replaced.isEmpty()) return replaced;
        if (!(replaced.getItem() instanceof ItemModularArmor)) return replaced;

        // Look up specialized replacement enrichment for the original's item.
        var sourceId = ForgeRegistries.ITEMS.getKey(original.getItem());
        if (sourceId == null) {
            IridescentReforging.LOGGER.info(
                    "[SpecializedReplacementHook] DIAG fired but original item has no registry key");
            return replaced;
        }
        var defOpt = SpecializedReplacementRegistry.get().getForSourceItem(sourceId);
        if (defOpt.isEmpty()) {
            IridescentReforging.LOGGER.info(
                    "[SpecializedReplacementHook] DIAG fired for {} -> no specialized_replacements entry; returning unenriched",
                    sourceId);
            return replaced;
        }
        var def = defOpt.get();
        IridescentReforging.LOGGER.info(
                "[SpecializedReplacementHook] DIAG enriching {} -> skin {}", sourceId, def.skinId());

        // Set skin tag — drives attribute aggregation, renderer dispatch,
        // set bonuses, display name.
        CompoundTag tag = replaced.getOrCreateTag();
        tag.putString(ItemModularArmorClient.SKIN_NBT_KEY, def.skinId());

        // Copy identity-preserving NBT from original.
        //
        // 2026-05-20: previously enumerated only 4 keys (affix_data, affixes,
        // Enchantments, rarity). That dropped ISS armor's stat NBT
        // (irons_spellbooks:mana_modifier, irons_spellbooks:spell_power_modifier,
        // and other mod-specific keys) during the replacement -- tester report
        // "Tetra-upgraded ISS armor stats are getting replaced, not added to."
        // Switched to copy-missing-keys: for every key in srcTag that the new
        // replaced stack's tag doesn't already own, copy it over. Generic and
        // resilient to future mod-specific NBT additions (no per-mod schema
        // enumeration needed). Tetra-controlled keys (module slots, _material,
        // integrity, honing, improvements) are written by the replacement
        // BEFORE this hook runs, so they're already present in `tag` and
        // skipped by the contains() guard below.
        CompoundTag srcTag = original.getTag();
        if (srcTag != null) {
            // Explicit copies first -- documents the common identity keys for
            // future readers. Generic pass below catches everything else.
            if (srcTag.contains("affix_data", Tag.TAG_COMPOUND)) {
                tag.put("affix_data", srcTag.getCompound("affix_data").copy());
            }
            if (srcTag.contains("affixes", Tag.TAG_COMPOUND)) {
                tag.put("affixes", srcTag.getCompound("affixes").copy());
            }
            if (srcTag.contains("Enchantments", Tag.TAG_LIST)) {
                tag.put("Enchantments", srcTag.getList("Enchantments", Tag.TAG_COMPOUND).copy());
            }
            if (srcTag.contains("rarity", Tag.TAG_STRING)) {
                tag.putString("rarity", srcTag.getString("rarity"));
            }

            // Generic preservation: copy any source key the new stack doesn't
            // already own. Excludes vanilla `Damage` so the upgraded item
            // starts at full durability rather than carrying the source's
            // wear, and excludes the Skin key we set above (defensive --
            // shouldn't be in srcTag anyway). Tetra's module/material/honing
            // keys are written to `tag` before this hook fires, so they're
            // skipped by the contains() guard.
            for (String key : srcTag.getAllKeys()) {
                if (tag.contains(key)) continue;                // already written by Tetra or explicit copy above
                if ("Damage".equals(key)) continue;             // start at full durability post-upgrade
                if (ItemModularArmorClient.SKIN_NBT_KEY.equals(key)) continue;
                Tag value = srcTag.get(key);
                if (value != null) {
                    tag.put(key, value.copy());
                }
            }
        }

        // 2026-05-21: Capture mod-specific attribute modifiers from the
        // source item BEFORE the swap loses them. ISS armor (Wizard
        // Leggings, Wandering Mage Robes, Cultist Hood, etc.) stores its
        // mana / spell_power / cooldown bonuses in the item class's
        // getDefaultAttributeModifiers(slot) override, NOT in NBT. The
        // earlier "copy missing NBT keys" pass can't preserve those
        // because they were never in NBT. Result: tester report 2026-05-21
        // "Wizard Leggings -> Tetra modular replacement lost a notable
        // amount of mana."
        //
        // Strategy: read original.getAttributeModifiers(slot) (which
        // returns the merged Item+NBT view), filter out vanilla minecraft:*
        // attributes (Tetra modular armor adds those itself via modules),
        // serialize the mod-specific ones to NBT under icraft_inherited_
        // modifiers. InheritedAttributeHandler reads this at runtime via
        // ItemAttributeModifierEvent and layers the modifiers onto the
        // reforged stack.
        if (original.getItem() instanceof ArmorItem armorOriginal) {
            EquipmentSlot armorSlot = armorOriginal.getEquipmentSlot();
            var sourceMods = original.getAttributeModifiers(armorSlot);
            ListTag inheritedList = new ListTag();
            // Track vanilla baseline values for the specialization-comfort
            // pass below. We accumulate ADDITION operations on
            // minecraft:generic.armor / armor_toughness here, then take 25%
            // (floor) as the baseline. MULTIPLY operations are intentionally
            // ignored -- those scale armor relative to whatever's there,
            // which doesn't translate cleanly to a flat baseline.
            double vanillaArmorAddition = 0.0;
            double vanillaToughnessAddition = 0.0;
            for (Map.Entry<Attribute, AttributeModifier> entry : sourceMods.entries()) {
                Attribute attr = entry.getKey();
                ResourceLocation attrId = ForgeRegistries.ATTRIBUTES.getKey(attr);
                if (attrId == null) continue;
                AttributeModifier mod = entry.getValue();
                if ("minecraft".equals(attrId.getNamespace())) {
                    // Vanilla armor / toughness from source -- feed baseline
                    // accumulators, then SKIP from icraft_inherited_modifiers
                    // (Tetra module aggregation handles vanilla armor).
                    if (mod.getOperation() == AttributeModifier.Operation.ADDITION) {
                        if (attr == Attributes.ARMOR) {
                            vanillaArmorAddition += mod.getAmount();
                        } else if (attr == Attributes.ARMOR_TOUGHNESS) {
                            vanillaToughnessAddition += mod.getAmount();
                        }
                    }
                    continue;
                }
                // Mod-specific stat -- serialize for InheritedAttributeHandler.
                CompoundTag entryTag = new CompoundTag();
                entryTag.putString("attribute", attrId.toString());
                entryTag.putString("slot", armorSlot.getName());
                entryTag.putString("name", mod.getName() == null ? "" : mod.getName());
                entryTag.putUUID("uuid", mod.getId());
                entryTag.putDouble("amount", mod.getAmount());
                entryTag.putString("operation", mod.getOperation().name());
                inheritedList.add(entryTag);
            }
            if (!inheritedList.isEmpty()) {
                tag.put("icraft_inherited_modifiers", inheritedList);
                IridescentReforging.LOGGER.info(
                        "[SpecializedReplacementHook] inherited {} mod-specific attribute modifier(s) from {}",
                        inheritedList.size(), sourceId);
            }

            // -------------------------------------------------------------
            // Specialization-comfort baselines: per user 2026-05-21, carry
            // forward a fraction of the source's durability + armor so a
            // Tetra-converted unique armor doesn't immediately downgrade
            // the player on raw defense + lifespan stats. Tetra modules
            // can recover the gap later via honing; the baselines just
            // soften the early-game hit.
            //   durability: 50% of source maxDamage, floor
            //   armor:      25% of vanilla armor ADDITION sum, floor
            //   toughness:  25% of vanilla toughness ADDITION sum, floor
            // -------------------------------------------------------------
            int sourceMaxDamage = original.getMaxDamage();
            if (sourceMaxDamage > 0) {
                int durBaseline = sourceMaxDamage / 2;  // 50% floor via int division
                if (durBaseline > 0) {
                    tag.putInt("icraft_baseline_durability", durBaseline);
                }
            }
            if (vanillaArmorAddition > 0) {
                double armorBaseline = Math.floor(vanillaArmorAddition * 0.25);
                if (armorBaseline > 0) {
                    tag.putDouble("icraft_baseline_armor", armorBaseline);
                }
            }
            if (vanillaToughnessAddition > 0) {
                double toughBaseline = Math.floor(vanillaToughnessAddition * 0.25);
                if (toughBaseline > 0) {
                    tag.putDouble("icraft_baseline_toughness", toughBaseline);
                }
            }
            IridescentReforging.LOGGER.info(
                    "[SpecializedReplacementHook] baselines from {}: dura={} armor={} toughness={}",
                    sourceId, sourceMaxDamage / 2, vanillaArmorAddition * 0.25, vanillaToughnessAddition * 0.25);
        }

        return replaced;
    };

    private SpecializedReplacementHook() {}
}
