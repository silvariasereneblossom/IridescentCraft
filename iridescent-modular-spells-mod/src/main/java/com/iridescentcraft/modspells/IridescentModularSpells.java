package com.iridescentcraft.modspells;

import com.iridescentcraft.modspells.enchant.ModEnchantmentRegistry;
import com.iridescentcraft.modspells.item.ModularItemRegistry;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import org.slf4j.Logger;
import com.mojang.logging.LogUtils;

/**
 * Iridescent Modular Spells -- @Mod entrypoint.
 *
 * Phase 1 scope: one modular ISS Copper Spell Book with two NBT-based
 * module slots (cover, pages), three materials (leather, iron, diamond),
 * smithing-table upgrade recipe, server-tick attribute application.
 *
 * Tetra integration deferred to Phase 2 -- Phase 1 uses plain NBT for
 * module storage to validate the player experience cheaply.
 *
 * License: MIT.
 */
@Mod(IridescentModularSpells.MODID)
public class IridescentModularSpells {

    public static final String MODID = "iridescent_modular_spells";
    public static final Logger LOGGER = LogUtils.getLogger();

    public IridescentModularSpells() {
        IEventBus modBus = FMLJavaModLoadingContext.get().getModEventBus();

        // Item registration (DeferredRegister)
        ModularItemRegistry.ITEMS.register(modBus);
        // Enchantment registration (Phase 4 -- book-exclusive enchants)
        ModEnchantmentRegistry.ENCHANTMENTS.register(modBus);

        LOGGER.info("[IridescentModularSpells] Phase 4 loaded -- ISS+Ars modular books, custom enchants");
    }
}
