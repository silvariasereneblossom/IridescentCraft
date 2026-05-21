package com.iridescentcraft.reforging;

import com.iridescentcraft.reforging.registry.ModItems;
import com.iridescentcraft.reforging.registry.ModRecipeTypes;
import com.iridescentcraft.reforging.replacement.SpecializedReplacementHook;
import com.iridescentcraft.reforging.replacement.SpecializedReplacementLoader;
import com.iridescentcraft.reforging.setbonus.SetBonusDataLoader;
import com.iridescentcraft.reforging.skin.IssRendererFactories;
import com.iridescentcraft.reforging.skin.SkinDataLoader;
import com.iridescentcraft.reforging.skin.SkinRegistry;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.AddReloadListenerEvent;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.event.lifecycle.FMLClientSetupEvent;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Mod(IridescentReforging.MODID)
public class IridescentReforging {
    public static final String MODID = "iridescent_reforging";
    public static final Logger LOGGER = LoggerFactory.getLogger(MODID);

    public IridescentReforging() {
        IEventBus modBus = FMLJavaModLoadingContext.get().getModEventBus();
        ModItems.ITEMS.register(modBus);
        ModRecipeTypes.SERIALIZERS.register(modBus);
        ModRecipeTypes.TYPES.register(modBus);
        // Custom Forge attributes (damage_vs_undead, etc.) -- must register
        // BEFORE the EntityAttributeModificationEvent fires.
        com.iridescentcraft.reforging.attribute.IcraftAttributes.register(modBus);

        // Custom magic-weapon enchants (icraft:mana_boost / mana_regen /
        // arcane_focus / spell_echo / mana_siphon / resonance / vorpal_arcane).
        // Effect logic lives in kubejs/server_scripts/enchants/; this just
        // registers the enchants and binds them to the #icraft:magic_weapon
        // category.
        com.iridescentcraft.reforging.enchant.IcraftEnchantments.register(modBus);

        // Server-side: register data-pack reload listener for skins.
        // Forge bus, not mod bus — AddReloadListenerEvent fires on world
        // load and /reload, both of which we need to honor for hot-edits.
        MinecraftForge.EVENT_BUS.register(this);

        // Client-side: register Geckolib renderer factories at FMLClientSetup.
        // Mod bus event, gated to client dist via DistExecutor at the
        // event-method side.
        modBus.addListener(IridescentReforging::onClientSetup);

        // Common-setup: register Tetra replacement hook for specialized armor.
        // Must run after Tetra's ItemUpgradeRegistry.instance is initialized,
        // which happens during common setup. Mod load ordering (we declare
        // tetra as 'AFTER' in mods.toml) ensures Tetra's setup runs first.
        modBus.addListener(IridescentReforging::onCommonSetup);

        LOGGER.info("[{}] mod entrypoint initialized", MODID);
    }

    @SubscribeEvent
    public void onAddReloadListener(AddReloadListenerEvent event) {
        event.addListener(new SkinDataLoader());
        event.addListener(new SetBonusDataLoader());
        event.addListener(new SpecializedReplacementLoader());
        LOGGER.info("[{}] registered Skin + SetBonus + SpecializedReplacement data-pack reload listeners", MODID);
    }

    private static void onCommonSetup(net.minecraftforge.fml.event.lifecycle.FMLCommonSetupEvent event) {
        event.enqueueWork(SpecializedReplacementHook::register);
        // Eager-load bundled data files from the mod jar. Runs on BOTH client
        // and server. Required because AddReloadListenerEvent only fires for
        // the server's resource manager -- multiplayer clients never run it
        // and would otherwise have empty registries, breaking client-side
        // Tetra getReplacement enrichment.
        event.enqueueWork(com.iridescentcraft.reforging.replacement.BundledDataLoader::loadAll);
    }

    private static void onClientSetup(FMLClientSetupEvent event) {
        // Per-source-mod factory classes register their renderers here.
        // Each is internally gated on ModList.isLoaded so absent source
        // mods don't crash the client.
        event.enqueueWork(() -> {
            IssRendererFactories.register(SkinRegistry.get());
            com.iridescentcraft.reforging.client.MaterialIndexProperty.register();
            com.iridescentcraft.reforging.client.WandMaterialIndexProperty.register();
            com.iridescentcraft.reforging.skin.ClientSkinIcon.register();
            // TODO(phase 7): Aether/TF/Cataclysm factory classes here.
        });
    }
}
