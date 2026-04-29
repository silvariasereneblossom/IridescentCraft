package com.iridescentcraft.durabilityclamp;

import net.minecraftforge.fml.common.Mod;

/**
 * Iridescent Durability Clamp — minimal @Mod entrypoint.
 *
 * The actual behavior lives entirely in
 * {@code com.iridescentcraft.durabilityclamp.mixin.ItemStackHurtAndBreakMixin}.
 * This class exists only because Forge requires a mod entrypoint registered
 * via the {@link Mod} annotation; the JVM scans for it during mod-load to
 * activate our mixin config (declared in {@code mods.toml} →
 * {@code MixinConfigs} jar manifest entry → {@code iridescent_durability_clamp.mixins.json}).
 */
@Mod(DurabilityClamp.MODID)
public class DurabilityClamp {
    public static final String MODID = "iridescent_durability_clamp";

    public DurabilityClamp() {
        // Nothing to register. The mixin config is loaded by the jar
        // manifest's MixinConfigs attribute before this constructor fires.
    }
}
