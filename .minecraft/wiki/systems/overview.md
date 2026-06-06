# Systems Overview

Core gameplay systems that define the IridescentCraft experience.

## Death & Penalty System

Keep inventory on death (no item loss). Penalty is durability-based.

### Durability Loss on Death

- Affects equipped armor + held weapon ONLY
- Items NEVER break/destroy — at 0 durability they become inert (non-functional)
- Scaling by dimension:

| Dimension | Difficulty | Durability Loss |
|-----------|-----------|----------------|
| Overworld | 1.0x | 10% |
| Twilight Forest | 1.5x | 12% |
| Blue Skies | 2.0x | 14% |
| The Aether | 2.5x | 15% |
| The Undergarden | 3.0x | 17% |
| Deeper and Darker | 3.5x | 18% |
| The Nether | 4.0x | 20% |
| Deep Aether | 5.0x | 22% |
| The End | 6.0x-10.0x | 25% |

### Soulbound Enchantment

| Level | Effect |
|-------|--------|
| I | 50% of death durability loss prevented |
| II | 75% of death durability loss prevented |
| III | 100% durability loss prevented + item cannot go inert |

Treasure enchant requiring high Arcana.

## Combat Scaling

Four stats scale independently per dimension. Damage scales fastest.

Base reference: Overworld zombie = 20 HP, 3 damage, 0 armor, 100% speed.

Each dimension has unique combat mechanics beyond stat scaling:
- **Twilight Forest:** Canopy Ambush (invisibility), Pack Tactics, Twilight Corruption
- **Blue Skies:** Elemental damage (30% bypasses armor), Elemental Storms
- **The Aether:** Thin Air (slow regen above cloud level), Vertigo (screen effects near edges), Updrafts (launch zones near cliffs)
- **Undergarden:** Virulent Spores (poison), Fungal Armor (regen), Decay Aura
- **Deeper and Darker:** Acoustic Aggro, Sculk Resonance, Darkness Empowerment
- **The Nether:** Infernal Rage, Soulfire Burns (30% bypasses armor), Blaze Swarm
- **Deep Aether:** Celestial Empowerment, Wind Shear, Radiant Shield
- **The Abyss (TATOS):** Oppressive Darkness (no held light + low light → mining-fatigue + slowness), Corruption (periodic hunger ticks), Fear Aura (Darkness within 16 blocks of Abyss bosses), Void Whispers (Weakness below Y=20). These fire in `theabyss:the_abyss` via `dimension_mechanics.js`. TATOS ("The Abyss: The Other Side") is installed; the dimension is gated T3.
- **The End:** Void Proximity, Ender Displacement, Void Corruption, Reality Fracture. Dragon Exploration Gate: explore End islands first, fight dragon last. Reached via the Deep-Aether End Compass → End Bastion (replaces the Eye of Ender). 9 advancement overrides, 5 End Apotheosis affixes.

## Champions System (REMOVED 2026-04-07)

Champions Unofficial has been removed from the modpack. The mod had a broken rank config system, was unmaintained, and generated error spam on every mob spawn event causing server lag. Elite mob encounters are now handled by Majrusz's Progressive Difficulty (see below).

## Mob Tier HP Scaling

Custom HP multipliers applied via `mob_scaling_unified.js` based on mob category. Stacks multiplicatively with dimension scaling and ascension systems.

| Tier | Multiplier | Examples |
|------|-----------|----------|
| Basic | 3x HP | Zombie (60 HP), Skeleton, Spider, Creeper, Drowned, Husk, Stray, Witch, Slime |
| Mid-tier | 1.5x HP | Blaze, Wither Skeleton, Piglin Brute, TF/Aether/Blue Skies mobs, dungeon mobs |
| Elite | 1.25x HP | Stacks on top of other affixes (Majrusz Progressive Difficulty elites) |
| Boss | 1x HP | Unchanged, custom HP managed via boss_hp.js |
| Catch-all | 3x HP | Any unlisted hostile mob defaults to basic tier |

## Progressive Difficulty (Majrusz's)

Three-stage world difficulty scaling tied to progression milestones. Replaces Champions as the primary mob challenge system.

| Stage | Tier Range | Trigger | `damage_bonus` | `health_bonus` |
|-------|-----------|---------|----------------|----------------|
| Normal | T1-T2 | Default | +1.5 flat | +50% |
| Expert | T3 | Nether entry | +3.0 flat | +75% |
| Master | T4 | Dragon kill | +5.0 flat | +155% |

Flat damage bonus from `mobs_spawn_stronger` stacks on top of the per-dimension damage multiplier in `mob_scaling_unified.js`. Damage values tuned 2026-04-17 after tester feedback on one-shot deaths. Health bonus left at defaults (tester feedback confirmed 2026-04-18 that tankiness wasn't the issue — incoming damage was).

### Treasure Bags
Majrusz's Progressive Difficulty includes a treasure bag system. Bags have been rewritten for all 7 bosses/events with tier-appropriate loot. Bag contents scale with the current difficulty stage.

### Configuration
- Creeperlings: disabled
- Bleeding: kept (symmetrical design with player combat)
- Enderium: removed

## Custom Enchantments (24 total)

| Category | Enchantments |
|----------|-------------|
| Dimensional Survival (5) | Heatward, Voidward, Depthstrider, Aether Acclimation, Warp Shield |
| Resource Enhancement (3) | Prospector, Lumberjack, Reaping |
| Scaling Combat (5) | Momentum, Adrenaline, Titan Slayer, Crowd Control, Adaptive |
| Anti-Boss (3) | Boss Ward, Steadfast, Nemesis |
| Path Synergy (4) | Mana Temper, RF Capacitance, Convergence, Primal Force |
| Utility & Survival (5) | Magnetism, Last Stand, Vitality, Phalanx, Quick Draw |

## Loot System Architecture

Chest loot is fully controlled via a multi-layer approach in `lootjs_overhaul.js`:

### Layer 1: GLM Whitelist (global_loot_modifiers.json)
`"replace": true` ensures only whitelisted GLM entries fire. All unlisted mod GLMs (including `rpgseteffects:loot_injection/*`) are inert. Whitelisted mods:
- `artifacts:` — 18 chest injections + 5 archaeology + 2 entity drops + 1 utility (pickaxe heater smelting)
- `celestial_artifacts:` — 8 chest injections + 11 entity drops + 5 fishing boxes
- `relics:` — single `relic_loot` GLM
- `irons_spellbooks:` — 5 entity drops + 8 chest loot modifiers
- `alexsmobs:` — 4 entries (ancient_dart, banana_drop, blossom_drop, pigshoes)
- `tetra:` — 1 entry (bartering_additions)

**Note:** Global LootJS strip for `@artifacts`, `@celestial_artifacts`, `@relics` was **removed** due to the persistent filter issue -- `removeLoot(@namespace)` catches items re-added by earlier modifiers in the same LootJS evaluation pass, which was stripping the tiered re-injections immediately after adding them. These mods now rely on the GLM whitelist for controlled injection rates.

### Layer 2: Bytecode Patches
- **Ars Nouveau** — bytecode-patched to disable `dungeon_loot` GLM injection at the class level. Complementary `dungeon_loot.json` override with 0% chances deployed via Paxi + KubeJS as belt-and-suspenders
- **Patchouli** — bytecode-patched (`athrow` -> `pop`) for book rendering stability

### Layer 3: LootJS Strip (Section 1B)
Remaining mods stripped from ALL chest loot via LootJS:
- `@ars_nouveau` — Ars Nouveau spell books (after bytecode patch prevents GLM injection)
- `@irons_spellbooks` — Iron's Spellbooks scrolls/books

### Layer 4: Tiered Re-Injection (Section 1C+)
After stripping, curated item pools are re-injected at tier-appropriate rates per dimension:

| Tier | Dimensions | Combined Artifact Rate | Items |
|------|-----------|----------------------|-------|
| Village | Village chests | 8% | Curated village artifact pool |
| T1 | Overworld | 10% | Utility/movement artifacts (snorkel, running shoes, etc.) |
| T2 | Twilight Forest, Aether, Blue Skies | 12% | Combat/defensive artifacts (power glove, crystal heart, etc.) |
| T3 | Nether, Undergarden | 14% | Powerful offense artifacts + celestial items |
| T4 | End, Deeper Darker (Otherside) | 16% | Endgame artifacts + relics items |

**Per-structure theming (2026-05-17).** Marquee structures (high-profile landmarks per [master.md §XIII](../design/master.md#part-xiii--loot-economy)) receive a themed pool layered on top of a reduced dimensional baseline — 70% themed / 30% baseline inside the tier's combined rate. 14 marquees across the 4 tiers. Roster, theme catalog, and per-structure item lists: [master-appendix.md §N](../design/master-appendix.md#n-marquee-structures). ISS spellbooks capped at 2% per chest (starter kit handles onboarding). ISS scrolls remain uncapped.

### Ars Nouveau Glyph Pools
Ars Nouveau spell books are blank caster tools that require glyphs inscribed at a Scribes Table. Glyphs are seeded into chests per tier (Forms front-loaded in T1–T2):

| Tier | Dimensions | Glyphs | Combined Rate |
|------|-----------|--------|---------------|
| T1 | Overworld | 18 (Forms: projectile/touch/self + basic effects/augments) | ~12% |
| T2 | TF, Aether, Blue Skies | 25 (aoe/underfoot + mobility/utility effects) | ~14% |
| T3 | Nether, Undergarden | 22 (linger + advanced effects: lightning, wall, fangs, blink, etc.) | ~15% |
| T4 | End, Deeper Darker (Otherside) | 12 (summons, rune, wither, dispel, randomize) | ~18% |

### Custom Patched JARs
The following mods ship as custom bytecode-patched JARs (added to custom JAR allowlist in server scripts):
- **Patchouli** — `athrow` -> `pop` crash fix
- **Ars Nouveau** — dungeon_loot GLM injection disabled

### Other Loot Controls
- Enchanted books: removed globally, re-added with `.enchantWithLevels()` at dimension-scaled rates
- Diamond/netherite gear: stripped from T1/T2 chests
- Village chests: sanitized with curated 25-artifact pool at ~4% combined rate
- Clutter items (horse armor, spider eyes, rotten flesh, etc.): removed from structure chests
- Food mods: stripped from chest loot to prevent bypassing the food/hunger system *(village chests exempt — they receive a thematic food + seed boost on top; see below)*

## Apotheosis Affixes

~95 total designed, 149 implemented (84 JSON datapacks + 65 event-driven). The JSON affix definitions are single-sourced from one custom datapack — an earlier duplicate copy living alongside the scripts was removed in the 2026-06-06 cleanup, so there is now exactly one home for each affix.

Categories: Generic Power, Weapon (Offensive/Utility), Armor (Defensive/Mobility/Utility), Shield, Dimensional, Boss-Themed, Tier-Gated.

**Scorching (formerly Ignition).** The fire-themed weapon affix was reworked on 2026-06-06: instead of accidentally buffing the target, it now adds a small attack-damage bump and marks whatever it hits with a timed fire vulnerability, so follow-up fire damage lands harder. The amount scales with rarity (provisionally 15-50%). The display name changed from "Ignition" to "Scorching"; the affix is the same one under the hood.

### Affix Rates by Tier

| Tier | Common | Uncommon | Rare | Epic | Mythic | Max Sockets |
|------|--------|----------|------|------|--------|-------------|
| 1 | 15% | 5% | — | — | — | 1 |
| 2 | 25% | 15% | 5% | — | — | 2 |
| 3 | 35% | 25% | 15% | 8% | — | 3 |
| 4 | 35% | 25% | 15% | 10% | 5% | 4+ |

## Weapon Progression

| System | Role | Acquisition |
|--------|------|-------------|
| Tetra stack (Tetra + `art_of_forging` + `adtetra`) | Primary crafted weapons + tools | Crafting with tier materials at the Tetra workbench (formerly documented as "Truly Modular", which is not in pack) |
| Iridescent Reforging (in `iridescent_tetra_expansion`) | Modular armor (Tetra-extension) | Leather base recipe + Tetra workbench, OR convert specialized armor |
| Simply Swords | Unique trophy weapons | Boss drops ONLY (via LootJS) |
| Iron's Spells | Magic combat | Crafting + loot |
| Cataclysm | Signature boss weapons | Cataclysm boss drops |
| Mahou Tsukai | Ultimate magic combat | Tier 4 crafting |
| Mekanism | Tech endgame (MekaTool) | Tier 4 crafting |

## Class Artifacts (Epic RPG)

14 class-themed curio items from the `rpgseteffects:` namespace, each with a stronger "Awakening" variant. Plus 25 standalone Relics providing single-effect passives. Drops-only — no crafting path exists.

### Acquisition

| Item type | Source | Rate |
|-----------|--------|------|
| Fragment Core | Any hostile mob | 4% drop |
| T1 Relics (movement, utility) | Overworld / Twilight Forest chests | ~0.4% per chest |
| T2 Relics (combat, immunity) | Blue Skies / Aether chests | ~0.6% per chest |
| T3 Relics (fire, decay) | Nether / Undergarden chests | ~0.8% per chest |
| T4 Relics (endgame passives) | End / Deeper Darker (Otherside) chests | ~1.0% per chest |
| Artifact Piece Pouch | T2+ boss kills | 1× from T2 bosses, 2× from T4 bosses |
| Normal artifacts | Pouch open | 14-way weighted pool, one per pouch |
| Awakening artifacts | T4 boss direct drops only | 0.7% per awakening × 14 = ~9.3% combined per T4 boss |

### T2 Boss Sources
Naga, Lich, Hydra (Twilight Forest), Ignis (Cataclysm), Slider (Aether), Summoner (Blue Skies).

### T4 Boss Sources
Ender Dragon, Ender Guardian, Harbinger (Cataclysm), Shattered (Deeper Darker).

### AStages Tier Gating
- Normal artifacts + artifact_piece_pouch → T2 (picked up but not equipped until T2 unlock)
- Awakening artifacts → T4 (held as trophies until T4)

### Configuration
Class Artifacts' native elite mob system (tier 1/2/3 Elite/Master/Legendary spawns) is **disabled** via `rpgseteffects-common.toml` — IridescentCraft uses Majrusz's Progressive Difficulty for elite enemies. Both systems at once would create redundant skull-marked mobs with competing boss bars.

## Food & Hunger

Hunger drain rate increased to 2.5x vanilla baseline. Seed drops from grass reduced to 5%. Structure food loot reduced across all loot tables **except village chests** — villages receive a flat food + seed boost (~1.4 food + ~0.6 seeds per chest expected) as of 2026-05-17, walking back the original blanket food reduction which proved overly onerous given the 2.5x hunger drain. Targets: vanilla biome houses (plains/desert/savanna/snowy/taiga), CTOV village chests, Villages and Pillages chests. Spawn protection area provides slower hunger drain for new players.

**Seed economy is Farmer's-Delight-weighted (2026-05-17).** FD is the pack's farming-mod baseline, so its seeds (`cabbage_seeds`, `tomato_seeds`, `onion`, `rice`) make up ~68% of the village seed roll; vanilla wheat/beetroot/pumpkin/melon seeds the remaining ~31%. Cabbage and tomato seeds also drop from grass + tall_grass loot tables (3-4% each) so the discovery-via-grass-breaking onboarding flow covers FD too.

**Village butcher chests have guaranteed meat (2026-05-17).** Vanilla butcher chest tables had all meat at low random-roll weights; a butcher chest could produce zero meat. Now adds 1-3 porkchop + 1-3 chicken + 1-2 beef guaranteed on top of vanilla rolls. Thematically correct, addresses tester report that butcher chests felt broken.

**Village farm-animal density boosted in surrounding biomes (2026-05-17).** Forge biome_modifier (`icraft_worldgen_overrides/data/icraft/forge/biome_modifier/village_animals.json`) adds passive spawn entries for pig/cow/chicken/sheep in the 9 biomes where vanilla villages generate (plains, sunflower_plains, savanna, savanna_plateau, taiga, old_growth_pine_taiga, old_growth_spruce_taiga, snowy_plains, meadow). Approximates "villages have more farm animals" by raising surrounding biome density rather than gating spawns to the village structure bounding box (which would require per-biome village structure JSON overrides). Desert villages skipped (rabbits suit the biome more than pigs/cows/sheep).

Spice of Life: Carrot Edition rewards food diversity with HP bonuses. Food is ungated from Tier 1 but best diversity requires dimensional ingredients. Farmer's Delight Cooking Station and Skillet serve as primary food crafting stations (70 recipes converted).

## XP Economy

XP is plentiful with many sinks: JustLevelingFork leveling, skill point investment, Apotheosis enchanting, relic leveling, anvil operations, reforging.

## Storage Progression

| Tier | Storage | Transport |
|------|---------|-----------|
| 1 | Sophisticated Backpacks (iron), Storage Drawers | Pretty Pipes, Create belts |
| 2 | Sophisticated (steel), Drawer upgrades | Thermal Ducts, IF basic |
| 3 | Refined Storage, Sophisticated (diamond) | XNet, IF advanced |
| 4 | RS advanced, Sophisticated (netherite) | Mekanism QIO, RFTools |

## Tetra Modded Materials

27 modded metal material definitions integrated via Paxi datapack (`icraft_tetra_materials`). Enables Tetra tool crafting with modded metals. Includes Blue Skies, Undergarden, Forbidden & Arcanus, and theabyss (TATOS) metals — the 4 theabyss entries (`garnite`, `knight`, `phantom`, `unorithe`, keyed to `theabyss:*_ingot`, diamond tool level) are live since TATOS is in pack. Diamond hammer tier required for high-tier crafting.

| Tier | Materials |
|------|-----------|
| T1 | Brass |
| T2 | Steel, Signalum, Lumium, Manasteel, Steeleaf, Ironwood, Fiery, Knightmetal, Diopside, Charoite, Horizonite |
| T3 | Osmium, Refined Obsidian, Terrasteel, Elementium, Enderium, + Undergarden metals, F&A metals |
| T4 | Aethersteel |

See [Tetra Materials](tetra-materials.md) for full reference.

## Seasonal Farming (Serene Seasons)

Serene Seasons adds seasonal crop growth. Crops die in winter unless grown in a greenhouse (glass-enclosed, torch-lit). Documented in a 4-page Patchouli Codex entry.

## Azukaar's Fair Difficulty (REMOVED 2026-05-03)

Removed alongside ScalingMobs / Improved Mobs when the bespoke `iridescent_difficulty` mod took over dimension scaling (see "Difficulty engine" above). Its former stat scaling was already zeroed; the remaining behavior features (hunger nerf, night purge, no-sleep enforcement, respawn distance) are now covered by the dedicated mods that own those mechanics (Hunger Overhaul, Sleep Hunger, etc.).

## Mekanism Balance

All machine RF costs raised to 2.5x stock (the demand-side lever; generator outputs stay stock - and as of ERA 4, fusion/fission outputs are buffed so reactors carry the late-game load). Digital Miner recipe requires higher-tier materials. Mekanism tool and armor recipes removed (MekaTool/MekaSuit remain T4-only via existing gating).

**ERA 4 endgame rebalance (2026-06-06).** With machine costs raised, the late-game reactors are now the intended answer: fusion output is buffed x1.5 (energy-per-fusion-fuel up to 15M) and fission output x1.25 (energy-per-fission-fuel up to 1.5M), so building a real reactor pays off. Radiation is disabled and meltdowns are disabled — an over-damaged fission reactor force-shuts-down instead of exploding or irradiating your base, making fission a dangerous-but-recoverable build rather than a base-ending mistake. The fusion chain, SPS/antimatter, the Digital Miner, and the ultimate-tier facilities are now pinned behind the T4 stage, while the intermediate machines that lead up to them stay open so the ramp still feels continuous.

## Custom Abyss-themed Curio System

8 `kubejs:ring_*` curio items shipped as a curated T3 curio chain replacing theabyss (TATOS)'s 30 stock rings. TATOS is in pack: its stock rings + arcane workbench are stripped in `recipe_audit.js` §K, and the 8 custom rings drop from TATOS structure chests + Abyss bosses via `abyss_boss_loot.js` (effects in `abyss_ring_effects.js`). See `master-appendix.md` §C.11.

## Blue Skies Balance

Dusk Arc weapon and Shadow Armor set removed (overpowered for T2). Runic Arc changed to boss-drop only. Diopside, Charoite, and Horizonite nerfed to T2-appropriate stats and integrated into Tetra.

## End Overhaul

Dragon Exploration Gate: players must explore End islands and complete objectives before the dragon fight becomes available. 9 advancement overrides replace the vanilla End advancement chain. 5 End-specific Apotheosis affixes. Entity ID corrections for End mobs. Moog's End Structure loot tables populated.

## Difficulty engine — `iridescent_difficulty` (time-based)

**As of 2026-05-03, the bespoke `iridescent_difficulty` mod is the dimension-scaling engine.** It replaced **ScalingMobs**, the **Improved Mobs** difficulty accumulator, and **Azukaar's Fair Difficulty Overhaul** (all removed). Per-dimension HP / damage / armor multipliers ramp linearly from a per-tier **start%** to a **cap%** over **capHours** of dimension-loaded time, then freeze; the End uniquely uncaps after the Ender Dragon is killed.

| Tier | Start % | Cap % | Cap Hours |
|------|---------|-------|-----------|
| T1 (Overworld) | 150% | 300% | 100 |
| T2 (Twilight / Blue Skies / Aether) | 200% | 350% | 100 |
| T3 (Undergarden / Deeper Darker / Nether) | 300% | 450% | 100 |
| T4 (Deep Aether / End) | 600% | 1000% | 200 |

- **Scope:** linear on `max_health` / `attack_damage` / `armor`, `sqrt` on `movement_speed`; bosses + tamed + non-MONSTER mobs skipped (configurable exclusion list).
- **Idle gating:** the per-dimension timer ticks at the `active / total` player ratio in that dimension (idle = no movement/combat for N minutes, or within the spawn radius).
- **Stacks on top of (not replaced):** ProgressiveBosses + `boss_progressive.js` (boss scaling), the static `mob_scaling_unified.js` tier-HP block (basic 3× / mid 1.5× / elite 1.25×), and Majrusz's content features (treasure bags + spawn variants — Majrusz's own stat scaling is config-disabled).

Full curve + commands: [`mods/custom.md`](../mods/custom.md#iridescent_difficulty-010jar) and `config/iridescent_difficulty-common.toml`.

## Mob equipment (iron-tier cap)

Mobs spawn with gear at dimension-scaled rates (5% Overworld → 80% End), capped at iron-tier breaking tools, via `scaling/mob_equipment.js`. (Originally an Improved Mobs config; that mod was removed 2026-05-03, so the handler now holds these targets directly. See [master-appendix §D.11](../design/master-appendix.md#d11-regular-mob-equipment-progression).)

## Tectonic Terrain

Tectonic worldgen tuned for much lower, flatter terrain: vertical_scale reduced from 1.155 to 0.38, with ultrasmooth enabled and a flat_terrain_skew of 0.65 pulling generation toward flatter ground, plus reduced ridge_scale. Mountains are still present but far less extreme (worldgen rebalance 2026-06-06).

## Walkable Mekanism Cables

Coremod (v1.0.1) that makes Mekanism cables/pipes walkable instead of having tiny hitboxes. Includes LocalVariableTable fix.

## HDPE & Rubber Pipeline

HDPE Circuit Board added as a craftable component for alternative Mekanism machine recipes. IF latex/rubber pipeline reworked: logs produce latex via Create/Thermal processing routes, HDPE converts to dry rubber for recipe chains.

## Related Pages

- [Master Design Document](../design/master.md) — Parts I, II, V, VI, VII
- [Progression](../progression/overview.md) — Tier and dimension details
- [Classes](../classes/overview.md) — How scaling interacts with class roles
