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
 * <p>Phase 6G (2026-04-28) — Tetra-pure architecture: a single modular item
 * per side. The book "type" (iron / diamond / archmage / ...) lives entirely
 * on the {@code core} slot's material. Vanilla ISS / Ars books are converted
 * to one of these via {@code data/tetra/replacements/} on workbench
 * interaction.
 *
 * <p>The 15 prior per-tier item registrations were removed in this phase.
 * Migration is intentionally non-graceful for alpha: stale per-tier items
 * in pre-6G saves get stripped on world load.
 */
public class ModularItemRegistry {

    public static final DeferredRegister<Item> ITEMS =
            DeferredRegister.create(ForgeRegistries.ITEMS, IridescentModularSpells.MODID);

    /**
     * Single ISS modular spell book. Identity (iron / diamond / etc) comes
     * from the core slot's material — see {@code data/tetra/materials/icraft_iss_books/}.
     * Default 15 spell slots; ISS native cap.
     */
    public static final RegistryObject<Item> MODULAR_SPELL_BOOK = ITEMS.register("modular_spell_book",
            () -> new ModularSpellBookItem(ModularSpellBookItem.BookKind.IRON, 15,
                    new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON)));

    /**
     * Single Ars Nouveau modular spell book. SpellTier.THREE (archmage) so the
     * item supports any spell level; the core material on the workbench
     * determines the apparent tier and stat profile.
     */
    public static final RegistryObject<Item> MODULAR_ARS_SPELL_BOOK = ITEMS.register("modular_ars_spell_book",
            () -> new ModularArsSpellBookItem(
                    new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON), SpellTier.THREE));
}
