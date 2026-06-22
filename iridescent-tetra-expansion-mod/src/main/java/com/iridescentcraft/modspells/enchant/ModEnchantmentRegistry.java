package com.iridescentcraft.modspells.enchant;

import com.iridescentcraft.modspells.IridescentModularSpells;
import com.iridescentcraft.modspells.item.ModularArsSpellBookItem;
import com.iridescentcraft.modspells.item.ModularSpellBookItem;
import com.iridescentcraft.reforging.enchant.MagicWeaponCategory;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.EnchantmentCategory;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

/**
 * Custom enchantments for the modular spell book line. Three are
 * BOOK-EXCLUSIVE -- canEnchant checks the stack's class against our two
 * modular item types ({@link ModularSpellBookItem} for ISS variants,
 * {@link ModularArsSpellBookItem} for Ars variants). The fourth,
 * {@code magic_crit_chance} ("Arcane Edge"), is ALSO a magic-weapon enchant
 * (MagicWeaponCategory) so it reaches the modular wand + mage gear via the
 * Tetra workbench aspect path; its effect ({@code magic_crit_hook.js}) reads
 * the held main-hand item generically, so it fires on a wand the same as a book.
 *
 * <p>Bonuses are applied at attribute-aggregation time by
 * {@code AttributeApplier} (sum: slot materials + enchant levels).
 *
 * <p>Phase 4.5 will add armor-slot enchants (arcane warding, spell focus,
 * etc.) once these foundational ones validate.
 */
public class ModEnchantmentRegistry {

    public static final DeferredRegister<Enchantment> ENCHANTMENTS =
            DeferredRegister.create(ForgeRegistries.ENCHANTMENTS, IridescentModularSpells.MODID);

    /** Custom category that gates enchant application to our modular books only. */
    private static final EnchantmentCategory MODULAR_BOOK_CATEGORY =
            EnchantmentCategory.create("modular_spell_book", item ->
                    item instanceof ModularSpellBookItem ||
                    item instanceof ModularArsSpellBookItem);

    public static final RegistryObject<Enchantment> MANA_CAPACITY =
            ENCHANTMENTS.register("mana_capacity",
                    () -> new ModularBookEnchantment(
                            Enchantment.Rarity.UNCOMMON, 5, 1));

    public static final RegistryObject<Enchantment> MANA_FLOW =
            ENCHANTMENTS.register("mana_flow",
                    () -> new ModularBookEnchantment(
                            Enchantment.Rarity.UNCOMMON, 3, 5));

    // "Arcane Edge" -- the spell-crit-CHANCE enchant. Unlike the other three
    // book enchants, this one is also a MAGIC-WEAPON enchant: it carries
    // MagicWeaponCategory so it's applicable on the modular wand (+ mage gear)
    // via the Tetra workbench aspect path, and its canEnchant accepts magic
    // weapons too (anvil). vorpal_arcane remains the crit-DAMAGE half on wands;
    // magic_crit_damage stays book-only. The effect (magic_crit_hook.js) reads
    // the held main-hand item generically, so it already fires on a wand.
    public static final RegistryObject<Enchantment> MAGIC_CRIT_CHANCE =
            ENCHANTMENTS.register("magic_crit_chance",
                    () -> new ModularBookEnchantment(
                            Enchantment.Rarity.RARE, 3, 7,
                            MagicWeaponCategory.get(), true));

    public static final RegistryObject<Enchantment> MAGIC_CRIT_DAMAGE =
            ENCHANTMENTS.register("magic_crit_damage",
                    () -> new ModularBookEnchantment(
                            Enchantment.Rarity.RARE, 3, 8));

    /**
     * Read the enchantment level from a stack's NBT. Used by
     * AttributeApplier to sum enchant-driven bonuses alongside slot
     * material bonuses.
     */
    public static int getLevel(ItemStack stack, RegistryObject<Enchantment> ench) {
        if (stack == null || stack.isEmpty() || ench == null) return 0;
        try {
            return net.minecraft.world.item.enchantment.EnchantmentHelper
                    .getItemEnchantmentLevel(ench.get(), stack);
        } catch (Throwable t) {
            return 0;
        }
    }

    /**
     * Generic book-exclusive enchantment. Instances vary in rarity, max
     * level, and cost-step (per-level enchanting-table cost increment).
     */
    public static class ModularBookEnchantment extends Enchantment {
        private final int maxLevel;
        private final int costStep;
        private final boolean magicWeapon;

        protected ModularBookEnchantment(Rarity rarity, int maxLevel, int costStep) {
            this(rarity, maxLevel, costStep, MODULAR_BOOK_CATEGORY, false);
        }

        /** Overload: choose the category + whether magic weapons (wands/staves)
         *  may also receive it. Used by "Arcane Edge" (magic_crit_chance): its
         *  category is MagicWeaponCategory so the Tetra workbench aspect path
         *  accepts it on the modular wand + mage gear, while it still lands on
         *  books (canEnchant below keeps the book branch). */
        protected ModularBookEnchantment(Rarity rarity, int maxLevel, int costStep,
                                         EnchantmentCategory category, boolean magicWeapon) {
            // EquipmentSlot[] is for ITEM-stack-on-equip behavior; book/wand is
            // held in MAINHAND when active. Use MAINHAND.
            super(rarity, category, new EquipmentSlot[]{ EquipmentSlot.MAINHAND });
            this.maxLevel = maxLevel;
            this.costStep = costStep;
            this.magicWeapon = magicWeapon;
        }

        @Override
        public int getMaxLevel() {
            return maxLevel;
        }

        @Override
        public int getMinCost(int level) {
            return level * costStep;
        }

        @Override
        public int getMaxCost(int level) {
            return getMinCost(level) + 30;
        }

        @Override
        public boolean canEnchant(ItemStack stack) {
            // Book branch always applies; magic-weapon variants ("Arcane Edge")
            // also accept wands/staves so they land via the anvil too. The Tetra
            // workbench aspect path is separate and doesn't consult canEnchant --
            // it gates on the enchant's category vs the module's aspect.
            boolean isBook = stack.getItem() instanceof ModularSpellBookItem ||
                             stack.getItem() instanceof ModularArsSpellBookItem;
            return isBook || (magicWeapon && MagicWeaponCategory.isMagicWeapon(stack));
        }
    }
}
