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
}
