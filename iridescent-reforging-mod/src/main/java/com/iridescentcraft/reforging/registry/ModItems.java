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

    // Module slot keys — 4 modules per piece in Tetra's weapon style
    // (sword has blade/hilt/pommel/guard). Layout per piece:
    //   major   — material identity, drives base armor + body texture
    //   lining  — interior padding, magical attunement (spell power, mana regen)
    //   trim    — visible decoration, small affinity bonus
    //   utility — structural (KB resist, mobility, durability)
    // Major is the only slot the renderer reads for body texture; the other
    // three are pure stat carriers with empty texture overlays.
    // All 4 slots per piece are marked REQUIRED so Tetra's RemoveSchematic
    // suppresses the "Remove module" context-menu entry on every slot.
    // Players can SWAP modules via install schematics (replace=true) but
    // never end up with an empty slot — armor visual + stat identity stays
    // coherent at all times. Mirrors the user-spec "no Remove module" call.
    private static final String[] HELMET_MAJOR    = { "helmet/crown" };
    private static final String[] HELMET_MINOR    = { "helmet/visor", "helmet/crest", "helmet/strap" };
    private static final String[] HELMET_REQUIRED = { "helmet/crown", "helmet/visor", "helmet/crest", "helmet/strap" };

    private static final String[] CHESTPLATE_MAJOR    = { "chestplate/chest_plate" };
    private static final String[] CHESTPLATE_MINOR    = { "chestplate/chest_lining", "chestplate/trim", "chestplate/pauldrons" };
    private static final String[] CHESTPLATE_REQUIRED = { "chestplate/chest_plate", "chestplate/chest_lining", "chestplate/trim", "chestplate/pauldrons" };

    private static final String[] LEGGINGS_MAJOR    = { "leggings/leg_plate" };
    private static final String[] LEGGINGS_MINOR    = { "leggings/belt", "leggings/greaves", "leggings/cuisses" };
    private static final String[] LEGGINGS_REQUIRED = { "leggings/leg_plate", "leggings/belt", "leggings/greaves", "leggings/cuisses" };

    private static final String[] BOOTS_MAJOR    = { "boots/boot_sole" };
    private static final String[] BOOTS_MINOR    = { "boots/boot_lining", "boots/heel", "boots/lacing" };
    private static final String[] BOOTS_REQUIRED = { "boots/boot_sole", "boots/boot_lining", "boots/heel", "boots/lacing" };

    public static final RegistryObject<Item> REFORGED_HELMET = ITEMS.register(
            "reforged_helmet",
            () -> new ItemModularArmor(
                    com.iridescentcraft.reforging.item.ReforgingArmorMaterial.INSTANCE,
                    ArmorItem.Type.HELMET,
                    new Item.Properties(),
                    HELMET_MAJOR, HELMET_MINOR, HELMET_REQUIRED));

    public static final RegistryObject<Item> REFORGED_CHESTPLATE = ITEMS.register(
            "reforged_chestplate",
            () -> new ItemModularArmor(
                    com.iridescentcraft.reforging.item.ReforgingArmorMaterial.INSTANCE,
                    ArmorItem.Type.CHESTPLATE,
                    new Item.Properties(),
                    CHESTPLATE_MAJOR, CHESTPLATE_MINOR, CHESTPLATE_REQUIRED));

    public static final RegistryObject<Item> REFORGED_LEGGINGS = ITEMS.register(
            "reforged_leggings",
            () -> new ItemModularArmor(
                    com.iridescentcraft.reforging.item.ReforgingArmorMaterial.INSTANCE,
                    ArmorItem.Type.LEGGINGS,
                    new Item.Properties(),
                    LEGGINGS_MAJOR, LEGGINGS_MINOR, LEGGINGS_REQUIRED));

    public static final RegistryObject<Item> REFORGED_BOOTS = ITEMS.register(
            "reforged_boots",
            () -> new ItemModularArmor(
                    com.iridescentcraft.reforging.item.ReforgingArmorMaterial.INSTANCE,
                    ArmorItem.Type.BOOTS,
                    new Item.Properties(),
                    BOOTS_MAJOR, BOOTS_MINOR, BOOTS_REQUIRED));

    private ModItems() {}
}
