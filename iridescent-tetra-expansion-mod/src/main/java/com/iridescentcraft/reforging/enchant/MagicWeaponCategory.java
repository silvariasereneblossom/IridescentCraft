package com.iridescentcraft.reforging.enchant;

import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.EnchantmentCategory;
import net.minecraftforge.common.util.Lazy;
import net.minecraftforge.registries.ForgeRegistries;

import java.util.Set;
import java.util.function.Predicate;

/**
 * Custom EnchantmentCategory that accepts the wand/staff "magic weapon" set
 * (wands + staves across ISS, Dan's Magic, Simple Staves, and our own
 * reforged_wand). Membership mirrors the Apoth {@code magic_weapon}
 * LootCategory registered in
 * {@code kubejs/startup_scripts/magic_weapon_category.js}.
 *
 * <p>Why a custom category instead of vanilla {@code WEAPON}:
 * vanilla {@code WEAPON} (used by sharpness etc.) only accepts
 * {@code Items.SWORD} subclasses. Wands and spellbooks extend Item
 * directly. Our magic-weapon enchants need to land on wands + staves
 * across mods (ISS, Ars, Simple Staves, DM), so an explicit membership
 * set is the right abstraction.
 *
 * <p><b>Why a hardcoded ID set, not the {@code #icraft:magic_weapon} tag.</b>
 * The previous implementation gated membership on
 * {@code new ItemStack(item).is(#icraft:magic_weapon)}. The pack's own
 * diagnostic ({@code magic_weapon_category.js}, diag 2026-05-18) found that
 * identical {@code stack.is(#icraft:magic_weapon)} test mis-resolves for
 * ~20 of 26 items — they fall through to NONE/SWORD instead of
 * magic_weapon — which is exactly why the Apoth {@code LootCategory} side
 * was already switched to a hardcoded ID set. The enchant side kept the
 * fragile tag, so magic enchants inconsistently failed to attach to legit
 * wands/staves. This mirrors the proven hardcoded-set workaround so the
 * enchants attach reliably (enchanting table / anvil / {@code /enchant}).
 *
 * <p>EnchantmentCategory in 1.20.1 is a Forge-extension-style enum;
 * to add custom values we use the Forge IEnchantmentCategory helper
 * via the {@code create} factory.
 */
public final class MagicWeaponCategory {

    /**
     * The 26 wand/staff ids that may carry the magic-weapon enchants.
     *
     * <p><b>Single source of truth:</b>
     * {@code .minecraft/kubejs/data/icraft/tags/items/magic_weapon.json}.
     * Regenerate this set from that file (and keep it in lockstep with the
     * matching set in {@code magic_weapon_category.js}) if the roster changes.
     */
    public static final Set<ResourceLocation> MAGIC_WEAPON_IDS = Set.of(
            // Iridescent Reforging Tetra-modular wand
            new ResourceLocation("iridescent_reforging", "reforged_wand"),
            // Dan's Magic T1 element staves
            new ResourceLocation("dna", "ice_staff"),
            new ResourceLocation("dna", "lightning_staff"),
            new ResourceLocation("dna", "magma_staff"),
            new ResourceLocation("dna", "toxic_staff"),
            new ResourceLocation("dna", "tnt_staff"),
            // Iron's Spellbooks named staves (NOT the spellbook curio items)
            new ResourceLocation("irons_spellbooks", "blood_staff"),
            new ResourceLocation("irons_spellbooks", "graybeard_staff"),
            new ResourceLocation("irons_spellbooks", "ice_staff"),
            new ResourceLocation("irons_spellbooks", "pyrium_staff"),
            new ResourceLocation("irons_spellbooks", "staff_of_the_nines"),
            // Simple Staves tier wands
            new ResourceLocation("simple_staves", "woodenwand"),
            new ResourceLocation("simple_staves", "stone_wand"),
            new ResourceLocation("simple_staves", "iron_wand"),
            new ResourceLocation("simple_staves", "gold_wand"),
            new ResourceLocation("simple_staves", "diamond_wand"),
            new ResourceLocation("simple_staves", "netherite_wand"),
            // Simple Staves element wands
            new ResourceLocation("simple_staves", "flame_wand"),
            new ResourceLocation("simple_staves", "wind_essence_wand"),
            new ResourceLocation("simple_staves", "thunder_wand"),
            new ResourceLocation("simple_staves", "venomite_wand"),
            new ResourceLocation("simple_staves", "viritium_wand"),
            new ResourceLocation("simple_staves", "veil_wand"),
            new ResourceLocation("simple_staves", "void_wand"),
            new ResourceLocation("simple_staves", "tenebrium_wand"),
            new ResourceLocation("simple_staves", "explosion_wand")
    );

    /** True if the item is one of the 26 magic-weapon wands/staves. */
    public static boolean isMagicWeapon(Item item) {
        if (item == null) return false;
        ResourceLocation id = ForgeRegistries.ITEMS.getKey(item);
        return id != null && MAGIC_WEAPON_IDS.contains(id);
    }

    /** True if the stack holds a magic-weapon wand/staff. */
    public static boolean isMagicWeapon(ItemStack stack) {
        return stack != null && !stack.isEmpty() && isMagicWeapon(stack.getItem());
    }

    /** Predicate used by the EnchantmentCategory implementation. */
    private static final Predicate<Item> PREDICATE = MagicWeaponCategory::isMagicWeapon;

    /** Lazy because {@link EnchantmentCategory#create} runs through
     *  ASM-injected dispatch and isn't safe before mod-init phase. */
    private static final Lazy<EnchantmentCategory> CATEGORY = Lazy.of(() ->
            EnchantmentCategory.create("ICRAFT_MAGIC_WEAPON", PREDICATE::test));

    public static EnchantmentCategory get() {
        return CATEGORY.get();
    }

    private MagicWeaponCategory() {}
}
