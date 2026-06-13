# Progression Overview

IridescentCraft uses a 4-tier progression system gated by AStages. Tiers advance through a **four-lane progression-token economy** tracked by the Iridescent Codex (Heracles-backed) — not the older "5 parallel paths / internal boss-counter" model. See [master.md Part III](../design/master.md#part-iii--progression-the-token-economy) for the full design.

## Tier System

| Tier | Theme | Dimensions | Tech Mods | Magic Mods | Power Level |
|------|-------|------------|-----------|------------|-------------|
| 1 | Bronze Age Explorer | Overworld only | Create, Pretty Pipes | Botania, Iron's Spells | Learning basics |
| 2 | Enchanted Adventurer | Twilight Forest, Blue Skies, The Aether | Thermal, IF (basic) | Ars Nouveau | Specialization |
| 3 | Empowered Slayer | Undergarden, Deeper Darker, Nether | IF (advanced), Mekanism (basic), RS | Occultism, Forbidden & Arcanus | Major power spike |
| 4 | God-Killer | Deep Aether, The End | Mekanism (advanced), RFTools Dims | Mahou Tsukai | Creative-tier power |

## The Token Economy (advance via threshold OR boss-rush)

Tier progression runs on **one combined pool of physical, tiered progression tokens**, submitted to the Iridescent Codex. Advance a tier by hitting **either** its token threshold **or** its boss-rush %:

| Transition | Token threshold | Boss-rush % |
|---|---:|---:|
| T1 → T2 | **500** | 80% of T1 bosses |
| T2 → T3 | **1000** | 90% of T2 bosses |
| T3 → T4 | **2000** | 100% of T3 bosses (incl. Lucifer) |
| T4 → post-game | — | **defeat the Ender Dragon** (the pack finale) |

### Four lanes feed the pool

Each tier is reachable by a single pure playstyle; hybrids mix freely.

- **Engineering** — submit bulk metals (capped, 1 token / 100) + milestone machine blocks (Create @ T1 · Thermal @ T2 · Mekanism @ T3). Per-tier subtotals ~590 / 1200 / 2400 (the tables are the *complete* conversion set — no unlisted long-tail).
- **Magic** — submit generation/cultivation/ritual reagents (the "ore", capped) + apparatus blocks (the "machines"), never spellcasting (Botania @ T1 · Ars Nouveau @ T2 · advanced Botania + Occultism + F&A @ T3). Subtotals ~600 / 1250 / 2360.
- **Exploration** — miniboss/boss first-kill + repeat-kill tokens, non-overworld dimension entry, chest/barrel finds.
- **Combat** — boss + miniboss kills, which both feed the pool *and* count toward the boss-rush %.

**Engine:** Heracles (the quest mod) does the token submission, kill-tracking, and stage-granting; the Patchouli Codex book is the documentation skin. **Lucifer** is the T3 → T4 combat capstone (non-combat lanes skip him). **The End** unlocks via a Deep-Aether **End Compass → End Bastion** (replacing the Eye of Ender). T4 is terminal — beating the **Ender Dragon** is the pack finale and opens the Ad Astra post-game.

→ Full conversion tables + caps: [master.md Part III](../design/master.md#part-iii--progression-the-token-economy).

## Dimensional Progression

Major change from vanilla: Nether is Tier 3, End is Tier 4.

**Difficulty scaling is now time-based** (added 2026-05-03 via the bespoke `iridescent_difficulty` mod). Each dimension has a starting multiplier, a cap, and a "cap hours" curve — multipliers ramp up linearly while the dimension is loaded, then freeze at cap. The End uniquely uncaps after the Ender Dragon is killed.

| Tier | Dimensions | Start % | Cap % | Cap Hours | Elite Spawn % |
|------|------------|---------|-------|-----------|------------------|
| 1 | Overworld | 150% | 300% | 100h | 5% |
| 2 | Twilight Forest, Blue Skies (Everbright/Everdawn), The Aether | 200% | 350% | 100h | 7-8% |
| 3 | The Undergarden, Deeper and Darker (Otherside), The Nether | 300% | 450% | 100h | 10-12% |
| 4 | Deep Aether, The End | 600% | 1000% | 200h | 13-15% |

After Ender Dragon is killed in-world: **The End uncaps** — multiplier extrapolates past 1000% indefinitely. Deep Aether stays capped at 1000%.

All values configurable via `config/iridescent_difficulty-common.toml` (per-tier `startPct`/`capPct`/`capHours`, per-dimension tier mapping, per-dimension `uncapAfterEnderDragon` flag).

**Incoming damage runs +30% hotter than the table.** As of 2026-06-13, every tier carries a damage-only multiplier (`damageMultiplierPct = 130`) applied to mob **attack damage only** -- mob health, armor, and speed still follow the Start/Cap curve above, but mobs hit 30% harder than those percentages alone, at every point on the curve. Tunable per tier; 100 = damage tracks the curve.

**Boss scaling stacks on top** via ProgressiveBosses (vanilla bosses) + `boss_progressive.js` (modded bosses). **Mob-tier static HP** (basic 3×, mid 1.5×, elite 1.25×) from `mob_scaling_unified.js` also composes with the dimension multiplier. **Elite-mob density** (the Elite Spawn % column) is handled by **Majrusz's Progressive Difficulty** (Master-stage scaling, replacing the removed Champions Unofficial).

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

- [Master Design Document](../design/master.md) — Full specification (Parts I–XVI; Part III = the token economy)
- [Classes & Races](../classes/overview.md) — Character build system
- [Systems](../systems/overview.md) — Combat scaling, death penalty, loot
