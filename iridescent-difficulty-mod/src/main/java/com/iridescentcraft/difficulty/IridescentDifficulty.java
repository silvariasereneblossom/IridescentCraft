package com.iridescentcraft.difficulty;

import com.iridescentcraft.difficulty.config.DifficultyConfig;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.fml.ModLoadingContext;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.config.ModConfig;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * Iridescent Difficulty — bespoke time-based mob scaling per dimension.
 *
 * <p>Replaces the four "automatic scaling" mods that were previously stacking
 * their multipliers compounding-ly on top of each other:
 * <ul>
 *   <li>ScalingMobs — unbounded per-player tracker (the {@code PlayerScaling: 2754}
 *       NBT we observed)</li>
 *   <li>ImprovedMobs — per-tick accumulator (+0.001 HP/tick = ~24 HP/day if
 *       the mob persists)</li>
 *   <li>MajruszsDifficulty — game-stage progression</li>
 *   <li>AzukaarsFairDifficultyOverhaul — alternate fair-difficulty curve</li>
 * </ul>
 *
 * <p>Replaced with a single coherent rule: each dimension has a per-tier
 * <i>start%</i> and <i>cap%</i>, and a configurable timer (default ~100 hours)
 * that linearly interpolates between them while that dimension is loaded.
 * Beyond cap, multipliers freeze. The End uniquely uncaps once the Ender
 * Dragon is killed in-world, opening unbounded scaling for endgame players
 * who want it.
 *
 * <p>Tier mapping (from {@code wiki/progression/overview.md}):
 * <ul>
 *   <li>T1 — Overworld</li>
 *   <li>T2 — Twilight Forest, Blue Skies, The Aether</li>
 *   <li>T3 — Undergarden, Deeper Darker, Nether, The Abyss</li>
 *   <li>T4 — Deep Aether, The End (End uncaps after ED kill)</li>
 * </ul>
 *
 * <p>Multiplier scope: applied to {@code generic.max_health},
 * {@code generic.attack_damage}, {@code generic.armor} linearly.
 * {@code generic.movement_speed} uses {@code sqrt(multiplier)} so a 6× HP
 * mob is not also a 6× speed mob.
 *
 * <p>Boss scaling stacks ON TOP via the existing ProgressiveBosses mod (vanilla
 * bosses) + {@code kubejs/server_scripts/scaling/boss_progressive.js}
 * (modded bosses). Bosses are explicitly skipped in this mod's spawn handler.
 */
@Mod(IridescentDifficulty.MODID)
public class IridescentDifficulty {
    public static final String MODID = "iridescent_difficulty";
    public static final Logger LOGGER = LogManager.getLogger(MODID);

    public IridescentDifficulty() {
        IEventBus modBus = FMLJavaModLoadingContext.get().getModEventBus();

        // Register TOML config — generates config/iridescent_difficulty-common.toml
        // on first launch with the wiki-aligned defaults.
        ModLoadingContext.get().registerConfig(ModConfig.Type.COMMON,
                DifficultyConfig.SPEC,
                MODID + "-common.toml");

        // Forge event bus — entity spawn handler, world tick (timers),
        // ender dragon death (End uncap), command registration.
        MinecraftForge.EVENT_BUS.register(com.iridescentcraft.difficulty.event.DimensionTimerTracker.class);
        MinecraftForge.EVENT_BUS.register(com.iridescentcraft.difficulty.event.MobScalingHandler.class);
        MinecraftForge.EVENT_BUS.register(com.iridescentcraft.difficulty.event.EnderDragonUncapHandler.class);
        MinecraftForge.EVENT_BUS.register(com.iridescentcraft.difficulty.command.DifficultyCommands.class);

        LOGGER.info("[{}] loaded — per-dimension time-based mob scaling active", MODID);
    }
}
