package com.iridescentcraft.reforging.registry;

import com.iridescentcraft.reforging.IridescentReforging;
import com.iridescentcraft.reforging.item.ItemModularArmor;
import net.minecraft.world.item.ArmorItem;
import net.minecraft.world.item.ArmorMaterials;
import net.minecraft.world.item.Item;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

/**
 * Item registration for Iridescent Reforging.
 *
 * Phase 1: register four base items (helmet/chestplate/leggings/boots) using
 * vanilla iron as a placeholder ArmorMaterial. Skin dispatch (phase 6) will
 * override visuals + base attributes per stack via NBT, so the underlying
 * material is irrelevant at the visual layer once skins land. Iron is chosen
 * for its mid-tier durability + neutral defense baseline.
 */
public final class ModItems {
    public static final DeferredRegister<Item> ITEMS =
            DeferredRegister.create(ForgeRegistries.ITEMS, IridescentReforging.MODID);

    // Module slot keys — namespaced as <slot_type>/<position> so schematics
    // and modules in data/tetra/... can target them unambiguously without
    // colliding with other modular item types' slot names.
    private static final String[] HELMET_MAJOR    = { "helmet/crown" };
    private static final String[] HELMET_MINOR    = { "helmet/visor" };
    private static final String[] HELMET_REQUIRED = { "helmet/crown" };

    private static final String[] CHESTPLATE_MAJOR    = { "chestplate/chest_plate" };
    private static final String[] CHESTPLATE_MINOR    = { "chestplate/chest_lining" };
    private static final String[] CHESTPLATE_REQUIRED = { "chestplate/chest_plate" };

    private static final String[] LEGGINGS_MAJOR    = { "leggings/leg_plate" };
    private static final String[] LEGGINGS_MINOR    = { "leggings/belt" };
    private static final String[] LEGGINGS_REQUIRED = { "leggings/leg_plate" };

    private static final String[] BOOTS_MAJOR    = { "boots/boot_sole" };
    private static final String[] BOOTS_MINOR    = { "boots/boot_lining" };
    private static final String[] BOOTS_REQUIRED = { "boots/boot_sole" };

    public static final RegistryObject<Item> REFORGED_HELMET = ITEMS.register(
            "reforged_helmet",
            () -> new ItemModularArmor(
                    ArmorMaterials.IRON,
                    ArmorItem.Type.HELMET,
                    new Item.Properties(),
                    HELMET_MAJOR, HELMET_MINOR, HELMET_REQUIRED));

    public static final RegistryObject<Item> REFORGED_CHESTPLATE = ITEMS.register(
            "reforged_chestplate",
            () -> new ItemModularArmor(
                    ArmorMaterials.IRON,
                    ArmorItem.Type.CHESTPLATE,
                    new Item.Properties(),
                    CHESTPLATE_MAJOR, CHESTPLATE_MINOR, CHESTPLATE_REQUIRED));

    public static final RegistryObject<Item> REFORGED_LEGGINGS = ITEMS.register(
            "reforged_leggings",
            () -> new ItemModularArmor(
                    ArmorMaterials.IRON,
                    ArmorItem.Type.LEGGINGS,
                    new Item.Properties(),
                    LEGGINGS_MAJOR, LEGGINGS_MINOR, LEGGINGS_REQUIRED));

    public static final RegistryObject<Item> REFORGED_BOOTS = ITEMS.register(
            "reforged_boots",
            () -> new ItemModularArmor(
                    ArmorMaterials.IRON,
                    ArmorItem.Type.BOOTS,
                    new Item.Properties(),
                    BOOTS_MAJOR, BOOTS_MINOR, BOOTS_REQUIRED));

    private ModItems() {}
}
