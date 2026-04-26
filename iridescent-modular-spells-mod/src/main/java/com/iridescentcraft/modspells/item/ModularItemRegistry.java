package com.iridescentcraft.modspells.item;

import com.hollingsworth.arsnouveau.api.spell.SpellTier;
import com.iridescentcraft.modspells.IridescentModularSpells;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

/**
 * DeferredRegister for our modular spell book items.
 *
 * <p>Phase 6F-1: 12 ISS modular variants (5 metal-tier + 7 themed) + 3 Ars
 * tier variants. Each ISS item is constructed with its {@link
 * ModularSpellBookItem.BookKind} so the per-book intrinsic stat overlay
 * applies. Max-spell-slot counts mirror ISS's vanilla per-book values.
 *
 * <p>The 7 new themed variants (dragonskin, druidic, blaze, evoker,
 * necronomicon, villager, rotten) are gated by AStages tier + boss-drop
 * loot tables — see Phase 6F LootJS edits.
 */
public class ModularItemRegistry {

    public static final DeferredRegister<Item> ITEMS =
            DeferredRegister.create(ForgeRegistries.ITEMS, IridescentModularSpells.MODID);

    // --- ISS metal-tier (T1-T4) ------------------------------------------
    public static final RegistryObject<Item> MODULAR_COPPER_SPELL_BOOK = ITEMS.register("modular_copper_spell_book",
            () -> new ModularSpellBookItem(ModularSpellBookItem.BookKind.COPPER, 5,
                    new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON)));

    public static final RegistryObject<Item> MODULAR_IRON_SPELL_BOOK = ITEMS.register("modular_iron_spell_book",
            () -> new ModularSpellBookItem(ModularSpellBookItem.BookKind.IRON, 10,
                    new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON)));

    public static final RegistryObject<Item> MODULAR_GOLD_SPELL_BOOK = ITEMS.register("modular_gold_spell_book",
            () -> new ModularSpellBookItem(ModularSpellBookItem.BookKind.GOLD, 10,
                    new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON)));

    public static final RegistryObject<Item> MODULAR_DIAMOND_SPELL_BOOK = ITEMS.register("modular_diamond_spell_book",
            () -> new ModularSpellBookItem(ModularSpellBookItem.BookKind.DIAMOND, 15,
                    new Item.Properties().stacksTo(1).rarity(Rarity.RARE)));

    public static final RegistryObject<Item> MODULAR_NETHERITE_SPELL_BOOK = ITEMS.register("modular_netherite_spell_book",
            () -> new ModularSpellBookItem(ModularSpellBookItem.BookKind.NETHERITE, 15,
                    new Item.Properties().stacksTo(1).rarity(Rarity.RARE).fireResistant()));

    // --- ISS themed (Phase 6F-1) ----------------------------------------
    public static final RegistryObject<Item> MODULAR_DRAGONSKIN_SPELL_BOOK = ITEMS.register("modular_dragonskin_spell_book",
            () -> new ModularSpellBookItem(ModularSpellBookItem.BookKind.DRAGONSKIN, 12,
                    new Item.Properties().stacksTo(1).rarity(Rarity.RARE)));

    public static final RegistryObject<Item> MODULAR_DRUIDIC_SPELL_BOOK = ITEMS.register("modular_druidic_spell_book",
            () -> new ModularSpellBookItem(ModularSpellBookItem.BookKind.DRUIDIC, 10,
                    new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON)));

    public static final RegistryObject<Item> MODULAR_BLAZE_SPELL_BOOK = ITEMS.register("modular_blaze_spell_book",
            () -> new ModularSpellBookItem(ModularSpellBookItem.BookKind.BLAZE, 12,
                    new Item.Properties().stacksTo(1).rarity(Rarity.RARE).fireResistant()));

    public static final RegistryObject<Item> MODULAR_EVOKER_SPELL_BOOK = ITEMS.register("modular_evoker_spell_book",
            () -> new ModularSpellBookItem(ModularSpellBookItem.BookKind.EVOKER, 12,
                    new Item.Properties().stacksTo(1).rarity(Rarity.RARE)));

    public static final RegistryObject<Item> MODULAR_NECRONOMICON_SPELL_BOOK = ITEMS.register("modular_necronomicon_spell_book",
            () -> new ModularSpellBookItem(ModularSpellBookItem.BookKind.NECRONOMICON, 15,
                    new Item.Properties().stacksTo(1).rarity(Rarity.EPIC)));

    public static final RegistryObject<Item> MODULAR_VILLAGER_SPELL_BOOK = ITEMS.register("modular_villager_spell_book",
            () -> new ModularSpellBookItem(ModularSpellBookItem.BookKind.VILLAGER, 8,
                    new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON)));

    public static final RegistryObject<Item> MODULAR_ROTTEN_SPELL_BOOK = ITEMS.register("modular_rotten_spell_book",
            () -> new ModularSpellBookItem(ModularSpellBookItem.BookKind.ROTTEN, 8,
                    new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON)));

    // --- Ars Nouveau tier-locked ----------------------------------------
    public static final RegistryObject<Item> MODULAR_NOVICE_SPELL_BOOK = ITEMS.register("modular_novice_spell_book",
            () -> new ModularArsSpellBookItem(
                    new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON), SpellTier.ONE));

    public static final RegistryObject<Item> MODULAR_APPRENTICE_SPELL_BOOK = ITEMS.register("modular_apprentice_spell_book",
            () -> new ModularArsSpellBookItem(
                    new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON), SpellTier.TWO));

    public static final RegistryObject<Item> MODULAR_ARCHMAGE_SPELL_BOOK = ITEMS.register("modular_archmage_spell_book",
            () -> new ModularArsSpellBookItem(
                    new Item.Properties().stacksTo(1).rarity(Rarity.RARE), SpellTier.THREE));
}
