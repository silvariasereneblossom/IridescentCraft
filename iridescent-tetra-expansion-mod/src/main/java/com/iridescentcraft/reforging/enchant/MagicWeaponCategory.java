package com.iridescentcraft.reforging.enchant;

import net.minecraft.resources.ResourceLocation;
import net.minecraft.tags.ItemTags;
import net.minecraft.tags.TagKey;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.EnchantmentCategory;
import net.minecraftforge.common.util.Lazy;

import java.util.function.Predicate;

/**
 * Custom EnchantmentCategory that accepts any item in the
 * {@code #icraft:magic_weapon} tag. Mirrors the same tag the runtime
 * Apoth LootCategory (registered in
 * {@code kubejs/startup_scripts/magic_weapon_category.js}) uses for
 * membership.
 *
 * <p>Why a custom category instead of vanilla {@code WEAPON}:
 * vanilla {@code WEAPON} (used by sharpness etc.) only accepts
 * {@code Items.SWORD} subclasses. Wands and spellbooks extend Item
 * directly. Our magic-weapon enchants need to land on wands + staves
 * + spellbooks across mods (ISS, Ars, Simple Staves, DM), so a tag-
 * based membership is the right abstraction.
 *
 * <p>EnchantmentCategory in 1.20.1 is a Forge-extension-style enum;
 * to add custom values we use the Forge IEnchantmentCategory helper
 * via the {@code create} factory.
 */
public final class MagicWeaponCategory {

    public static final TagKey<Item> MAGIC_WEAPON_TAG =
            ItemTags.create(new ResourceLocation("icraft", "magic_weapon"));

    /** Predicate used by the EnchantmentCategory implementation. */
    private static final Predicate<Item> PREDICATE = item -> {
        if (item == null) return false;
        ItemStack stack = new ItemStack(item);
        return stack.is(MAGIC_WEAPON_TAG);
    };

    /** Lazy because {@link EnchantmentCategory#create} runs through
     *  ASM-injected dispatch and isn't safe before mod-init phase. */
    private static final Lazy<EnchantmentCategory> CATEGORY = Lazy.of(() ->
            EnchantmentCategory.create("ICRAFT_MAGIC_WEAPON", PREDICATE::test));

    public static EnchantmentCategory get() {
        return CATEGORY.get();
    }

    private MagicWeaponCategory() {}
}
