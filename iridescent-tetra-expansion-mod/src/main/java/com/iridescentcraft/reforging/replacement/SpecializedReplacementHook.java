package com.iridescentcraft.reforging.replacement;

import com.iridescentcraft.reforging.IridescentReforging;
import com.iridescentcraft.reforging.item.ItemModularArmor;
import com.iridescentcraft.reforging.item.ItemModularArmorClient;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.Tag;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.registries.ForgeRegistries;
import se.mickelus.tetra.module.ItemUpgradeRegistry;

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
        CompoundTag srcTag = original.getTag();
        if (srcTag != null) {
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
        }

        return replaced;
    };

    private SpecializedReplacementHook() {}
}
