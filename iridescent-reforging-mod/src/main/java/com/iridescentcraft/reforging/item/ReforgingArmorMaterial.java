package com.iridescentcraft.reforging.item;

import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.item.ArmorItem;
import net.minecraft.world.item.ArmorMaterial;
import net.minecraft.world.item.crafting.Ingredient;

/**
 * A blank ArmorMaterial used by ItemModularArmor as the base. Defenses are
 * all zero — the actual armor stats come from the equipped major-slot
 * module via Tetra's primaryAttributes scaling.
 *
 * Why: previously ItemModularArmor used ArmorMaterials.IRON as a placeholder
 * material, which meant the item's vanilla armor (helmet 2, chest 6, etc.)
 * was added on top of the module's contribution. Iron-converted reforged
 * chestplate showed 26 armor (6 vanilla + 20 module = 26) instead of 6.
 *
 * This material contributes nothing on its own; the equipped crown / chest
 * plate / leg plate / boot sole module is the entire source of armor.
 *
 * Toughness, KB resist, enchantability, durability are all "frame" values:
 * a basic shell that lets the item exist as ArmorItem before modules apply.
 */
public final class ReforgingArmorMaterial implements ArmorMaterial {
    public static final ReforgingArmorMaterial INSTANCE = new ReforgingArmorMaterial();

    private static final int[] DURABILITY_PER_SLOT = {130, 150, 140, 130};

    private ReforgingArmorMaterial() {}

    @Override public int getDurabilityForType(ArmorItem.Type type) {
        return DURABILITY_PER_SLOT[type.getSlot().getIndex()];
    }

    @Override public int getDefenseForType(ArmorItem.Type type) { return 0; }
    @Override public int getEnchantmentValue() { return 9; }
    @Override public SoundEvent getEquipSound() { return SoundEvents.ARMOR_EQUIP_GENERIC; }
    @Override public Ingredient getRepairIngredient() { return Ingredient.EMPTY; }
    @Override public String getName() { return "iridescent_reforging:reforging"; }
    @Override public float getToughness() { return 0; }
    @Override public float getKnockbackResistance() { return 0; }
}
