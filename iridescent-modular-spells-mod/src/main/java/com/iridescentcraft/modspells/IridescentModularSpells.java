package com.iridescentcraft.modspells;

import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import org.slf4j.Logger;
import com.mojang.logging.LogUtils;

/**
 * Iridescent Modular Spells -- @Mod entrypoint.
 *
 * Phase 0 scope: empty registration; the mod loads on the test server
 * without crashing and produces a build-pipeline-validated jar that the
 * three distros can pick up via the custom-jar allowlist.
 *
 * Phase 1+ will add:
 *  - DeferredRegister<Item> for the modular item set
 *  - Tetra ModularItem subclasses for ISS spell books
 *  - Soft-dep handlers for Iron's Spellbooks + Ars Nouveau
 *
 * License: MIT (mod is our own implementation; design influenced by but
 * not derived from the ARR-licensed [TSB] Tetra Spell Book mod).
 */
@Mod(IridescentModularSpells.MODID)
public class IridescentModularSpells {

    public static final String MODID = "iridescent_modular_spells";
    public static final Logger LOGGER = LogUtils.getLogger();

    public IridescentModularSpells() {
        IEventBus modBus = FMLJavaModLoadingContext.get().getModEventBus();
        // Phase 0: no registration yet. Logged so we can confirm the
        // mod loaded on the dedicated test server.
        LOGGER.info("[IridescentModularSpells] Phase 0 scaffolding loaded -- no items registered yet");
    }
}
