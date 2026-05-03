package com.iridescentcraft.difficulty.config;

import net.minecraftforge.common.ForgeConfigSpec;

import java.util.List;

/**
 * TOML config for Iridescent Difficulty. Generated at
 * {@code config/iridescent_difficulty-common.toml} on first server launch.
 *
 * <h2>Default values</h2>
 * Magnitudes match the spec in {@code wiki/progression/overview.md}'s
 * tier system + the bespoke mod design discussion (2026-05-03):
 *
 * <pre>
 * Tier  Dimensions                                     Start %   Cap %   Cap Hours
 * ───── ─────────────────────────────────────────────  ────────  ──────  ─────────
 * T1    Overworld                                      150       300     100
 * T2    Twilight Forest, Blue Skies, Aether            200       350     100
 * T3    Undergarden, Deeper Darker, Nether, Abyss      300       450     100
 * T4    Deep Aether, The End                           600       1000    200
 * </pre>
 *
 * <p>Plus a per-dimension {@code uncapAfterEnderDragon} flag that defaults
 * {@code true} only on {@code minecraft:the_end}. When set, killing the
 * Ender Dragon in-world removes the cap for that dimension entirely
 * (Deep Aether stays capped).
 *
 * <h2>How scaling is applied</h2>
 * For each non-boss, non-passive mob spawn:
 * <pre>
 * t = current dim timer (hours)
 * mult = clamp(start + (cap - start) * (t / capHours), start, cap)
 *        // unless uncap flag set + ender dragon killed -> no upper bound
 * mob.max_health *= mult
 * mob.attack_damage *= mult
 * mob.armor *= mult
 * mob.movement_speed *= sqrt(mult)   // milder so a 6x HP mob isn't 6x speed
 * </pre>
 */
public final class DifficultyConfig {

    public static final ForgeConfigSpec SPEC;
    public static final Common COMMON;

    static {
        ForgeConfigSpec.Builder builder = new ForgeConfigSpec.Builder();
        COMMON = new Common(builder);
        SPEC = builder.build();
    }

    private DifficultyConfig() {}

    public static final class Common {
        // Master switches
        public final ForgeConfigSpec.BooleanValue enabled;
        public final ForgeConfigSpec.BooleanValue scaleHealth;
        public final ForgeConfigSpec.BooleanValue scaleDamage;
        public final ForgeConfigSpec.BooleanValue scaleArmor;
        public final ForgeConfigSpec.BooleanValue scaleSpeed;

        // Per-tier curves (all percentages — 100 = 1.0× vanilla)
        public final TierCurve t1;
        public final TierCurve t2;
        public final TierCurve t3;
        public final TierCurve t4;

        // Dimension → tier mapping
        public final ForgeConfigSpec.ConfigValue<List<? extends String>> t1Dimensions;
        public final ForgeConfigSpec.ConfigValue<List<? extends String>> t2Dimensions;
        public final ForgeConfigSpec.ConfigValue<List<? extends String>> t3Dimensions;
        public final ForgeConfigSpec.ConfigValue<List<? extends String>> t4Dimensions;

        // Uncap-on-ed dimensions (only End by default)
        public final ForgeConfigSpec.ConfigValue<List<? extends String>> uncapAfterEnderDragonDimensions;

        // Skip lists
        public final ForgeConfigSpec.ConfigValue<List<? extends String>> excludedEntities;

        // Idle detection (pause timer when no active players in dim)
        public final ForgeConfigSpec.BooleanValue idleDetectionEnabled;
        public final ForgeConfigSpec.DoubleValue idleThresholdMinutes;
        public final ForgeConfigSpec.BooleanValue idleAtSpawnEnabled;
        public final ForgeConfigSpec.IntValue spawnIdleRadius;

        Common(ForgeConfigSpec.Builder b) {
            b.comment(
                "Iridescent Difficulty — bespoke time-based mob scaling per dimension.",
                "Magnitudes are percentages of vanilla baseline (100 = 1.0x).",
                "Each dimension has a tier (t1..t4) with a start%, cap%, and capHours.",
                "Multiplier interpolates linearly between start and cap as the dimension's",
                "loaded-time timer ticks up. The End uniquely uncaps after killing the",
                "Ender Dragon (configurable per dimension via uncapAfterEnderDragon).",
                "",
                "Boss scaling stacks ON TOP via ProgressiveBosses + boss_progressive.js."
            ).push("general");

            enabled = b.comment("Master toggle. Set false to disable all scaling (e.g., for QA).")
                .define("enabled", true);
            scaleHealth = b.comment("Apply multiplier to max_health.").define("scaleHealth", true);
            scaleDamage = b.comment("Apply multiplier to attack_damage.").define("scaleDamage", true);
            scaleArmor  = b.comment("Apply multiplier to armor.").define("scaleArmor", true);
            scaleSpeed  = b.comment("Apply sqrt(multiplier) to movement_speed.").define("scaleSpeed", true);

            b.pop();

            // ── Tier curves ────────────────────────────────────────────────
            b.push("tiers");

            b.comment("T1 — Overworld. Starts hardish for tier-1 scaling classes; manageable.")
                .push("t1");
            t1 = new TierCurve(b, 150.0, 300.0, 100.0);
            b.pop();

            b.comment("T2 — Twilight Forest, Blue Skies, The Aether.").push("t2");
            t2 = new TierCurve(b, 200.0, 350.0, 100.0);
            b.pop();

            b.comment("T3 — Undergarden, Deeper Darker, Nether, The Abyss.").push("t3");
            t3 = new TierCurve(b, 300.0, 450.0, 100.0);
            b.pop();

            b.comment("T4 — Deep Aether, The End. Hard regardless. End uncaps after Ender Dragon kill.").push("t4");
            t4 = new TierCurve(b, 600.0, 1000.0, 200.0);
            b.pop();

            b.pop();

            // ── Dimension → tier mapping ──────────────────────────────────
            b.comment(
                "Dimension → tier mapping. Anything not listed defaults to t1.",
                "Resource locations (mod:dimension_id). Source: wiki/progression/overview.md."
            ).push("dimensions");

            t1Dimensions = b.comment("T1 dimensions (Overworld).")
                .defineList("t1",
                    List.of("minecraft:overworld"),
                    o -> o instanceof String);

            t2Dimensions = b.comment("T2 dimensions (Twilight Forest, Blue Skies, Aether).")
                .defineList("t2",
                    List.of(
                        "twilightforest:twilight_forest",
                        "blue_skies:everbright",
                        "blue_skies:everdawn",
                        "aether:the_aether"
                    ),
                    o -> o instanceof String);

            t3Dimensions = b.comment("T3 dimensions (Undergarden, Deeper Darker, Nether, Abyss).")
                .defineList("t3",
                    List.of(
                        "undergarden:undergarden",
                        "deeperdarker:otherside",
                        "minecraft:the_nether",
                        "theabyss:abyss"
                    ),
                    o -> o instanceof String);

            t4Dimensions = b.comment("T4 dimensions (Deep Aether, The End).")
                .defineList("t4",
                    List.of(
                        "deep_aether:deep_aether",
                        "minecraft:the_end"
                    ),
                    o -> o instanceof String);

            uncapAfterEnderDragonDimensions = b.comment(
                "Dimensions whose cap is removed once the Ender Dragon is killed",
                "in-world. By default only the End (Deep Aether stays capped at T4).")
                .defineList("uncapAfterEnderDragon",
                    List.of("minecraft:the_end"),
                    o -> o instanceof String);

            b.pop();

            // ── Skip list ─────────────────────────────────────────────────
            b.comment(
                "Entities to skip (boss IDs, special mobs, mod-broken entities).",
                "Bosses are also detected automatically via persistent boss tag,",
                "so this is mainly for non-boss mobs you want exempt."
            ).push("excludes");

            excludedEntities = b.comment("Resource IDs of entities to skip entirely.")
                .defineList("entities",
                    List.of(
                        // ProgressiveBosses-handled (skip, they self-scale)
                        "minecraft:wither",
                        "minecraft:ender_dragon",
                        "minecraft:elder_guardian",
                        // Modded bosses handled by boss_progressive.js
                        "twilightforest:naga",
                        "twilightforest:lich",
                        "twilightforest:hydra",
                        "twilightforest:knight_phantom",
                        "twilightforest:ur_ghast",
                        "twilightforest:snow_queen",
                        "twilightforest:minoshroom",
                        "twilightforest:alpha_yeti",
                        "twilightforest:final_boss",
                        "aether:slider",
                        "aether:valkyrie_queen",
                        "aether:sun_spirit",
                        "cataclysm:ignis",
                        "cataclysm:netherite_monstrosity",
                        "cataclysm:ender_guardian",
                        "cataclysm:ancient_remnant",
                        "cataclysm:harbinger",
                        "cataclysm:leviathan",
                        "cataclysm:maledictus",
                        "irons_spellbooks:dead_king_boss"
                    ),
                    o -> o instanceof String);

            b.pop();

            // ── Idle detection ────────────────────────────────────────────
            b.comment(
                "Pause the per-dimension scaling timer when no active players",
                "are in the dimension. An 'active' player is one who has moved",
                "(>0.1 blocks), dealt damage, or taken damage within the last",
                "idleThresholdMinutes. AFK pool farms and idle servers will",
                "not advance the difficulty timer. Set enabled=false to revert",
                "to plain time-based scaling regardless of player presence."
            ).push("idle_detection");

            idleDetectionEnabled = b.comment("Master toggle.")
                .define("enabled", true);

            idleThresholdMinutes = b.comment(
                    "Minutes a player must be motionless + non-combat to be considered idle.")
                .defineInRange("idleThresholdMinutes", 5.0, 0.5, 60.0);

            idleAtSpawnEnabled = b.comment(
                    "Treat players within spawnIdleRadius blocks of their respawn",
                    "point (bed if set, world spawn otherwise) as idle regardless",
                    "of activity. Hanging out at base / sleeping / sorting chests",
                    "shouldn't tick the difficulty timer.")
                .define("idleAtSpawnEnabled", true);

            spawnIdleRadius = b.comment(
                    "Cube radius (blocks) around respawn point that counts as 'at spawn'.",
                    "Chebyshev distance — max of |dx|,|dy|,|dz|. 10 = 21x21x21 cube.")
                .defineInRange("spawnIdleRadius", 10, 1, 256);

            b.pop();
        }
    }

    /**
     * Per-tier scaling curve. Linear interpolation from {@code start} at
     * t=0 hours to {@code cap} at t={@code capHours} hours, clamped to
     * {@code cap} thereafter (unless dimension is uncapAfterEnderDragon and
     * the dragon has been killed).
     */
    public static final class TierCurve {
        public final ForgeConfigSpec.DoubleValue start;
        public final ForgeConfigSpec.DoubleValue cap;
        public final ForgeConfigSpec.DoubleValue capHours;

        TierCurve(ForgeConfigSpec.Builder b, double defStart, double defCap, double defHours) {
            start = b.comment("Starting multiplier % (100 = 1.0x vanilla)")
                .defineInRange("startPct", defStart, 50.0, 10000.0);
            cap = b.comment("Cap multiplier % (must be >= startPct)")
                .defineInRange("capPct", defCap, 50.0, 10000.0);
            capHours = b.comment("Hours of dimension-loaded time to reach cap from start.")
                .defineInRange("capHours", defHours, 0.1, 10000.0);
        }
    }
}
