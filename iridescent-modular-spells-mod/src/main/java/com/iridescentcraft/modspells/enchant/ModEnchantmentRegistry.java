package com.iridescentcraft.modspells.enchant;

import com.iridescentcraft.modspells.IridescentModularSpells;
import com.iridescentcraft.modspells.item.ModularArsSpellBookItem;
import com.iridescentcraft.modspells.item.ModularSpellBookItem;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.EnchantmentCategory;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

/**
 * Custom enchantments for the modular spell book line. All four are
 * BOOK-EXCLUSIVE -- canEnchant checks the stack's class against our two
 * modular item types ({@link ModularSpellBookItem} for ISS variants,
 * {@link ModularArsSpellBookItem} for Ars variants).
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

    public static final RegistryObject<Enchantment> MAGIC_CRIT_CHANCE =
            ENCHANTMENTS.register("magic_crit_chance",
                    () -> new ModularBookEnchantment(
                            Enchantment.Rarity.RARE, 3, 7));

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

        protected ModularBookEnchantment(Rarity rarity, int maxLevel, int costStep) {
            // EquipmentSlot[] is for ITEM-stack-on-equip behavior; book is
            // held in MAINHAND when active. Use MAINHAND.
            super(rarity, MODULAR_BOOK_CATEGORY, new EquipmentSlot[]{ EquipmentSlot.MAINHAND });
            this.maxLevel = maxLevel;
            this.costStep = costStep;
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
            // Our category check already filters; this is belt-and-suspenders
            // for /enchant command compatibility.
            return stack.getItem() instanceof ModularSpellBookItem ||
                   stack.getItem() instanceof ModularArsSpellBookItem;
        }
    }
}
