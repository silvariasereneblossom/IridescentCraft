package com.iridescentcraft.modspells;

import com.iridescentcraft.modspells.enchant.ModEnchantmentRegistry;
import com.iridescentcraft.modspells.item.ModularItemRegistry;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.event.lifecycle.FMLClientSetupEvent;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import org.slf4j.Logger;
import com.mojang.logging.LogUtils;

/**
 * Iridescent Modular Spells -- @Mod entrypoint.
 *
 * Modular spell books for Iron's Spellbooks + Ars Nouveau. Both books
 * implement Tetra's IModularItem: modules are installed at the Tetra
 * workbench and their stats arrive as ordinary item attribute modifiers.
 * (The Phase 1 prototype -- plain-NBT cover / pages slots filled at an
 * anvil -- was retired in 6D and its code has been removed.)
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

        // Client-side: register source_index ItemProperty for icon dispatch.
        // Mirrors armor's ClientSkinIcon. Gated to client dist so server
        // load doesn't try to call client-only ItemProperties.register.
        modBus.addListener(IridescentModularSpells::onClientSetup);

        LOGGER.info("[IridescentModularSpells] Phase 6B loaded -- IModularItem skeleton on ISS+Ars books (Tetra workbench-aware)");
    }

    private static void onClientSetup(FMLClientSetupEvent event) {
        event.enqueueWork(() ->
            DistExecutor.unsafeRunWhenOn(Dist.CLIENT, () -> () ->
                com.iridescentcraft.modspells.client.ClientSpellbookIcon.register())
        );
    }
}
