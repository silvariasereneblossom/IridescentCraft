package com.iridescentcraft.modspells.item;

import com.iridescentcraft.modspells.IridescentModularSpells;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

/**
 * DeferredRegister for our modular spell book items.
 *
 * Phase 1: just `modular_copper_spell_book`. Phase 2 adds iron/gold/diamond/
 * netherite + the Ars items.
 */
public class ModularItemRegistry {

    public static final DeferredRegister<Item> ITEMS =
            DeferredRegister.create(ForgeRegistries.ITEMS, IridescentModularSpells.MODID);

    public static final RegistryObject<Item> MODULAR_COPPER_SPELL_BOOK =
            ITEMS.register("modular_copper_spell_book",
                    () -> new ModularSpellBookItem(
                            5,                                // 5 spell slots, matching copper_spell_book
                            new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON)
                    ));

    // Phase 2: full ISS book tier coverage. Spell-slot counts mirror ISS upstream.
    public static final RegistryObject<Item> MODULAR_IRON_SPELL_BOOK =
            ITEMS.register("modular_iron_spell_book",
                    () -> new ModularSpellBookItem(
                            10,
                            new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON)
                    ));

    public static final RegistryObject<Item> MODULAR_GOLD_SPELL_BOOK =
            ITEMS.register("modular_gold_spell_book",
                    () -> new ModularSpellBookItem(
                            10,
                            new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON)
                    ));

    public static final RegistryObject<Item> MODULAR_DIAMOND_SPELL_BOOK =
            ITEMS.register("modular_diamond_spell_book",
                    () -> new ModularSpellBookItem(
                            15,
                            new Item.Properties().stacksTo(1).rarity(Rarity.RARE)
                    ));

    public static final RegistryObject<Item> MODULAR_NETHERITE_SPELL_BOOK =
            ITEMS.register("modular_netherite_spell_book",
                    () -> new ModularSpellBookItem(
                            15,
                            new Item.Properties().stacksTo(1).rarity(Rarity.RARE).fireResistant()
                    ));
}
