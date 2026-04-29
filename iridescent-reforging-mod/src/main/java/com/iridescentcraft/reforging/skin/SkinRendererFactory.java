package com.iridescentcraft.reforging.skin;

import software.bernie.geckolib.renderer.GeoArmorRenderer;

/**
 * Client-side factory that produces a single GeoArmorRenderer instance
 * for a specific skin. Called once per skin (the resulting renderer is
 * cached in SkinRegistry and shared across all wearers, mirroring how
 * Iron's Spellbooks caches one renderer per ExtendedArmorItem instance).
 *
 * Implementations live in per-source-mod factory classes (e.g.
 * IssRendererFactories) and are registered at FMLClientSetupEvent time
 * gated by ModList.isLoaded so optional source mods don't crash the
 * client when absent.
 */
@FunctionalInterface
public interface SkinRendererFactory {
    GeoArmorRenderer<?> createRenderer();
}
