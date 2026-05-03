# Progression Overview

IridescentCraft uses a 4-tier progression system gated by AStages, with multiple unlock paths per tier.

## Tier System

| Tier | Theme | Dimensions | Tech Mods | Magic Mods | Power Level |
|------|-------|------------|-----------|------------|-------------|
| 1 | Bronze Age Explorer | Overworld only | Create, Pretty Pipes | Botania, Iron's Spells | Learning basics |
| 2 | Enchanted Adventurer | Twilight Forest, Blue Skies, The Aether | Thermal, IF (basic) | Ars Nouveau | Specialization |
| 3 | Empowered Slayer | Undergarden, Deeper Darker, Nether | IF (advanced), Mekanism (basic), RS | Occultism, Forbidden & Arcanus | Major power spike |
| 4 | God-Killer | Deep Aether, The End | Mekanism (advanced), RFTools Dims | Mahou Tsukai | Creative-tier power |

## Unlock Paths (Branching — Complete ANY ONE)

Each tier gate has 5 parallel paths. Players choose their style:

- **Path A: Grinding** — Resource gathering milestones
- **Path B: Magic** — Spellcasting and mana progression
- **Path C: Boss** — Kill tier-appropriate bosses
- **Path D: Exploration** — Dimensional exploration goals
- **Path E: Engineering** — Automation milestones

## Dimensional Progression

Major change from vanilla: Nether is Tier 3, End is Tier 4.

**Difficulty scaling is now time-based** (added 2026-05-03 via the bespoke `iridescent_difficulty` mod). Each dimension has a starting multiplier, a cap, and a "cap hours" curve — multipliers ramp up linearly while the dimension is loaded, then freeze at cap. The End uniquely uncaps after the Ender Dragon is killed.

| Tier | Dimensions | Start % | Cap % | Cap Hours | Champion Spawn % |
|------|------------|---------|-------|-----------|------------------|
| 1 | Overworld | 150% | 300% | 100h | 5% |
| 2 | Twilight Forest, Blue Skies (Everbright/Everdawn), The Aether | 200% | 350% | 100h | 7-8% |
| 3 | The Undergarden, Deeper and Darker, The Nether, The Abyss | 300% | 450% | 100h | 10-12% |
| 4 | Deep Aether, The End | 600% | 1000% | 200h | 13-15% |

After Ender Dragon is killed in-world: **The End uncaps** — multiplier extrapolates past 1000% indefinitely. Deep Aether stays capped at 1000%.

All values configurable via `config/iridescent_difficulty-common.toml` (per-tier `startPct`/`capPct`/`capHours`, per-dimension tier mapping, per-dimension `uncapAfterEnderDragon` flag).

**Boss scaling stacks on top** via ProgressiveBosses (vanilla bosses) + `boss_progressive.js` (modded bosses). **Mob-tier static HP** (basic 3×, mid 1.5×, champion 1.25×) from `mob_scaling_unified.js` also composes with the dimension multiplier.

**Replaces** the previous flat-multiplier scaling (which compounded with ScalingMobs's per-player tracker, ImprovedMobs's per-tick accumulator, MajruszsDifficulty's game stages, and Azukaars' fair-difficulty curve in unpredictable ways). All four are removed/disabled.

## Staging Implementation

AStages enforces per-player tier restrictions on:
- Items (tier-inappropriate items cannot be used)
- Dimensions (locked until stage unlocked)
- Recipes (tier-gated crafting)
- Ores (hidden/replaced until appropriate tier)

## Material Progression

- **Tier 1:** Iron, Copper, Brass, Tin, Bronze. No diamonds.
- **Tier 2:** Steel, Manasteel, Signalum, Lumium, Steeleaf, Ironwood, Fiery. Limited diamonds. Plus **Terramity sapphire / topaz / ruby / dimlite / gaianite** (T2 dim-bound — see below).
- **Tier 3:** Full diamond, Terrasteel, Elementium, Enderium, Osmium, Refined Obsidian, Ancient Debris. Plus **Terramity iridium / profaned / iridescent**, vanilla **quartz** (overworld_quartz mod's injection killed; quartz from Nether only).
- **Tier 4:** Netherite, Gaia Ingots, Dragon materials, Antimatter, Atomic Alloy. Plus **Terramity onyx** (End-only).

## Terramity ore tier-dim mapping (2026-04-26)

Per the 2026-04-26 worldgen rebalance, all 11 Terramity overworld ores were stripped from overworld via `forge:none` biome_modifier overrides and re-injected into tier-appropriate dimensions. Stat-driven tier assignment per the Terramity armor/tool audit:

| Material | Tier | Stat tier (audit) | Target dim(s) |
|---|---|---|---|
| sapphire (cold) | T2 | Diamond-tier dura, T1 attack | Aether + Blue Skies Everdawn |
| topaz (hot) | T2 | identical to sapphire | Twilight Forest + Blue Skies Everbright |
| igneo_ruby | T2 | identical to sapphire | Twilight Forest |
| gaianite_cluster | T2 | (lush flora) | Twilight Forest |
| dimlite | T2 | T2 tools, no armor | Twilight Forest |
| iridium | T3 | netherite-tier (atk 14, dura 3046) | Undergarden + Deeper Darker |
| profaned | T3 | crafting reagent | Undergarden + Deeper Darker |
| iridescent | T3 | crafting reagent | Undergarden + Deeper Darker |
| daemonium | T4 | endgame | Nether (unchanged) |
| onyx | T4 | endgame End | End (unchanged) |
| nether_iridium / nether_ruby / bedrock_black_matter | -- | (multi-source variants) | Nether (unchanged) |
| end_iridium / end_onyx | T4 | (End-only) | End (unchanged) |

**Tetra integration:** 6 ore-mined Terramity materials (sapphire, topaz, ruby, onyx, dimlite, iridium) have Tetra material entries with unique perks. Sapphire/topaz/ruby/onyx have IDENTICAL raw stats per audit, so differentiation is via perks (Fire Resistance / Fire-on-hit / +50% fire damage / +15% minion damage). See [Tetra-Materials](https://github.com/silvariasereneblossom/IridescentCraft/wiki/Tetra-Materials) on the public wiki.

## Related Pages

- [Master Design Document](../design/master.md) — Full specification (Parts I-XII)
- [Classes & Races](../classes/overview.md) — Character build system
- [Systems](../systems/overview.md) — Combat scaling, death penalty, loot
