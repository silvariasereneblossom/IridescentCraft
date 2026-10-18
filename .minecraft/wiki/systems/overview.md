# Systems Overview

The core gameplay systems of IridescentCraft.

## Death & Penalty System

Keep inventory is on, so you lose no items when you die. The penalty is durability instead.

### Durability Loss on Death

- Affects only equipped armor and the held weapon
- Items never break or get destroyed: at 0 durability they become inert (non-functional)
- Scaling by dimension:

| Dimension | Tier | Durability Loss |
|-----------|-----:|----------------|
| Overworld | 1 | 10% |
| Twilight Forest | 2 | 12% |
| Blue Skies (Everbright, Everdawn) | 2 | 14% |
| The Undergarden | 3 | 17% |
| Deeper and Darker (Otherside), The Abyss | 3 | 18% |
| The Nether | 3 | 20% |
| The Aether (Deep Aether's biomes included) | 4 | 22% |
| The Moon, Earth orbit, Moon orbit | 4 | 22% |
| Mars and its orbit | 4 | 25% |
| Mercury and its orbit | 4 | 27% |
| Venus and its orbit | 4 | 28% |
| Glacio and its orbit | 4 | 30% |
| The End, Iron's Spellbooks' pocket dimension, the Reality Marble | 4 | 25% |
| Anywhere else (the Abyss's Frost World and pocket dimension included) | - | 15% |

How fast mobs grow in each dimension is a separate curve: see [Difficulty engine](#difficulty-engine--iridescent_difficulty-time-based) below.

### Soulbound Enchantment

| Level | Effect |
|-------|--------|
| I | 50% of death durability loss prevented |
| II | 75% of death durability loss prevented |
| III | 100% durability loss prevented + item cannot go inert |

It is a treasure enchantment and needs high Arcana.

## Combat Scaling

Four stats scale independently per dimension. Damage scales fastest.

For reference, an Overworld zombie has 20 HP, 3 damage, 0 armor and 100% speed.

Each dimension also has its own combat mechanics on top of stat scaling:
- Twilight Forest: Canopy Ambush (invisibility), Pack Tactics, Twilight Corruption
- Blue Skies: Elemental damage (30% bypasses armor), Elemental Storms
- Undergarden: Virulent Spores (poison), Fungal Armor (regen), Decay Aura
- Deeper and Darker: Acoustic Aggro, Sculk Resonance, Darkness Empowerment
- The Nether: Infernal Rage, Soulfire Burns (30% bypasses armor), Blaze Swarm
- The Aether (Tier 4; Deep Aether's biomes included): its mobs move with Speed I, and its flyers also hit with Strength I. Thin Air: above Y 180 you get Weakness unless your armor has Aether Acclimation. Vertigo: sprinting above Y 200 sometimes brings nausea. Updraft: if you fall below Y 0, you get Slow Falling once.
- The Abyss (TATOS): Oppressive Darkness (holding no light in low light brings mining fatigue and slowness), Corruption (periodic hunger ticks), Fear Aura (Darkness within 16 blocks of Abyss bosses), Void Whispers (Weakness below Y=20). These run in `theabyss:the_abyss` from `dimension_mechanics.js`. TATOS ("The Abyss: The Other Side") is installed, and the dimension is gated at T3.
- The End: Void Proximity, Ender Displacement, Void Corruption, Reality Fracture. Dragon Exploration Gate: you explore the End islands first and fight the dragon last. The End is reached with Eyes of Ender (staged at T4); an End Compass → End Bastion route, with the compass crafted from the Aether's materials, is planned to replace them. It has 9 advancement overrides and 5 End Apotheosis affixes.

### Sunlight Smite

By day, a hostile undead mob standing under open sky near a player in the Overworld takes 2 damage every half second and burns briefly, on top of vanilla sunlight burning. An Overworld zombie lasts about 15 seconds instead of a minute, and nothing dies in one hit. Bosses, your own summons and pets, and wild zombie and skeleton horses are spared, and a roof keeps any mob safe. (Until October 2026 it had never damaged anything.)

### The spawn village

Hostile mobs cannot appear within 96 blocks of the world spawn. A Wither built inside that circle is refused: the last skull is not placed, the soul sand and skulls stay where they are, the skull stays in your hand, and a message tells you to build at least 96 blocks out.

### Invasion bosses

Apotheosis "invader" bosses (named mobs in affixed gear) can appear in the Overworld, the Nether, the End, the Twilight Forest, Everbright, Everdawn, the Undergarden, the Otherside, the Abyss and its Frost World, the Aether and the five Ad Astra planets. They are more frequent in higher tiers (2% in the Overworld to 10% in the End; table in [Appendix §D.7](../design/master-appendix.md#d7-apotheosis-spawned-random-world-bosses)). Until October 2026 only the Overworld, the Nether, the End and the Twilight Forest had invaders that could actually spawn. The orbits, the pocket dimensions and the Reality Marble have none.

### Bosses far from players keep fighting

With two or more players online, the server pauses creatures far from every player. Every boss the pack knows (named bosses and minibosses alike, the Wither and the Ender Dragon included) is exempt and keeps going.

### Armor damage reduction

Armor has diminishing returns, for players and mobs alike. Each point is worth less than the one before it, and the share blocked is the same for a small hit and a big one. Armor toughness does not enter this step.

| Armor | Blocked | Damage taken |
|---|---|---|
| 0 | 0% | 100% |
| 10 | 24% | 76% |
| 20 | 35% | 65% |
| 30 | 42% | 58% |
| 50 | 51% | 49% |
| 100 | 63% | 37% |
| 200 | 77% | 23% |
| 400 | 90% | 10% |
| about 520 and up | 95% (cap) | 5% |

This curve has been in force since October 2026 (see the [changelog](../design/changelog.md)). General Protection adds flat armor (+0.75 per level), so it goes through the same table.

## Champions System (REMOVED 2026-04-07)

Champions Unofficial was removed from the modpack. Its rank config system was broken, the mod was unmaintained, and it spammed errors on every mob spawn, which lagged the server. Majrusz's Progressive Difficulty now handles elite mob encounters (see below).

## Mob Tier HP Scaling

`mob_scaling_unified.js` applies custom HP multipliers by mob category. They stack multiplicatively with dimension scaling and the ascension systems.

| Tier | Multiplier | Examples |
|------|-----------|----------|
| Basic | 3x HP | Zombie (60 HP), Skeleton, Spider, Creeper, Drowned, Husk, Stray, Witch, Slime |
| Mid-tier | 1.5x HP | Blaze, Wither Skeleton, Piglin Brute, TF/Aether/Blue Skies mobs, dungeon mobs |
| Elite | 1.25x HP | Stacks on top of other affixes (Majrusz Progressive Difficulty elites) |
| Boss | 1x HP | No mob-tier bonus, minibosses included (since October 2026); a designed health where the pack sets one (see [Appendix §D.6](../design/master-appendix.md#d6-boss-health-and-per-kill-scaling)) |
| Catch-all | 3x HP | Any unlisted hostile mob defaults to the basic tier |

## Progressive Difficulty (Majrusz's)

World difficulty rises in three stages tied to progression milestones. This replaces Champions as the main mob challenge system.

| Stage | Tier Range | Trigger | `damage_bonus` | `health_bonus` |
|-------|-----------|---------|----------------|----------------|
| Normal | T1-T2 | Default | +1.5 flat | +50% |
| Expert | T3 | Nether entry | +3.0 flat | +75% |
| Master | T4 | Dragon kill | +5.0 flat | +155% |

The flat damage bonus from `mobs_spawn_stronger` stacks on top of the per-dimension damage multiplier in `mob_scaling_unified.js`. The damage values were tuned on 2026-04-17 after testers reported one-shot deaths. The health bonus stays at its defaults: tester feedback on 2026-04-18 confirmed that the problem was incoming damage rather than how tanky mobs were.

### Treasure Bags
Majrusz's Progressive Difficulty has a treasure bag system. The bags for all 7 bosses and events were rewritten with tier-appropriate loot, and their contents scale with the current difficulty stage.

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

The pack controls all chest loot through several layers in `lootjs_overhaul.js`:

### Layer 1: GLM Whitelist (global_loot_modifiers.json)
With `"replace": true`, only whitelisted GLM entries fire, and every unlisted mod GLM (`rpgseteffects:loot_injection/*` included) is inert. The whitelisted mods:
- `artifacts:` has 18 chest injections, 5 archaeology, 2 entity drops and 1 utility (pickaxe heater smelting)
- `celestial_artifacts:` has 8 chest injections, 11 entity drops and 5 fishing boxes
- `relics:` has a single `relic_loot` GLM
- `irons_spellbooks:` has 5 entity drops and 8 chest loot modifiers
- `alexsmobs:` has 4 entries (ancient_dart, banana_drop, blossom_drop, pigshoes)
- `tetra:` has 1 entry (bartering_additions)

The global LootJS strip for `@artifacts`, `@celestial_artifacts` and `@relics` was removed because of the persistent filter issue: `removeLoot(@namespace)` also catches items that earlier modifiers re-added in the same LootJS evaluation pass, so it stripped the tiered re-injections right after they were added. These mods now rely on the GLM whitelist to control their injection rates.

### Layer 2: Bytecode Patches
- Ars Nouveau: bytecode-patched to disable `dungeon_loot` GLM injection at the class level. A `dungeon_loot.json` override with 0% chances, deployed through Paxi and KubeJS, backs this up.
- Patchouli: bytecode-patched (`athrow` -> `pop`) for book rendering stability

### Layer 3: LootJS Strip (Section 1B)
LootJS strips the remaining mods from all chest loot:
- `@ars_nouveau`: Ars Nouveau spell books (after the bytecode patch prevents GLM injection)
- `@irons_spellbooks`: Iron's Spellbooks scrolls and books

### Layer 4: Tiered Re-Injection (Section 1C+)
After stripping, curated item pools are re-injected at tier-appropriate rates per dimension:

| Tier | Dimensions | Combined Artifact Rate | Items |
|------|-----------|----------------------|-------|
| Village | Village chests | 8% | Curated village artifact pool |
| T1 | Overworld | 10% | Utility/movement artifacts (snorkel, running shoes, etc.) |
| T2 | Twilight Forest, Blue Skies | 12% | Combat/defensive artifacts (power glove, crystal heart, etc.) |
| T3 | Nether, Undergarden, Deeper Darker (Otherside), The Abyss | 14% | Powerful offense artifacts + celestial items |
| T4 | End, Aether | 16% | Endgame artifacts + relics items |

Per-structure theming (2026-05-17): marquee structures (high-profile landmarks as defined in [master.md §XIII](../design/master.md#part-xiii--loot-economy)) get a themed pool on top of a reduced dimensional baseline, split 70% themed / 30% baseline inside the tier's combined rate. There are 14 marquees across the 4 tiers. The roster, theme catalog and per-structure item lists are in [master-appendix.md §N](../design/master-appendix.md#n-marquee-structures). ISS spellbooks are capped at 2% per chest, since the starter kit handles onboarding; ISS scrolls stay uncapped.

### Ars Nouveau Glyph Pools
Ars Nouveau spell books are blank caster tools: they need glyphs inscribed at a Scribes Table. Glyphs are seeded into chests by tier, with Forms front-loaded in T1 to T2:

| Tier | Dimensions | Glyphs | Combined Rate |
|------|-----------|--------|---------------|
| T1 | Overworld | 18 (Forms: projectile/touch/self + basic effects/augments) | ~12% |
| T2 | TF, Blue Skies | 25 (aoe/underfoot + mobility/utility effects) | ~14% |
| T3 | Nether, Undergarden, Deeper Darker (Otherside), The Abyss | 22 (linger + advanced effects: lightning, wall, fangs, blink, etc.) | ~15% |
| T4 | End, Aether | 12 (summons, rune, wither, dispel, randomize) | ~18% |

### Custom Patched JARs
These mods ship as custom bytecode-patched JARs (on the custom JAR allowlist in the server scripts):
- Patchouli: `athrow` -> `pop` crash fix
- Ars Nouveau: dungeon_loot GLM injection disabled

### Other Loot Controls
- Enchanted books: removed globally, re-added with `.enchantWithLevels()` at dimension-scaled rates
- Diamond/netherite gear: stripped from T1/T2 chests
- Village chests: cleaned up, with a curated 25-artifact pool at ~4% combined rate
- Clutter items (horse armor, spider eyes, rotten flesh, etc.): removed from structure chests
- Food mods: stripped from chest loot so they cannot bypass the food/hunger system *(village chests are exempt: they get a thematic food and seed boost on top; see below)*

## Apotheosis Affixes

About 95 were designed and 149 are implemented (84 JSON datapacks + 65 event-driven). The JSON affix definitions all come from one custom datapack: an earlier duplicate copy next to the scripts was removed in the 2026-06-06 cleanup, so each affix has exactly one home.

Categories: Generic Power, Weapon (Offensive/Utility), Armor (Defensive/Mobility/Utility), Shield, Dimensional, Boss-Themed, Tier-Gated.

Scorching (formerly Ignition) is the fire-themed weapon affix. It was reworked on 2026-06-06: it used to buff the target by accident, and now it adds a small attack-damage bump and marks whatever it hits with a timed fire vulnerability, so follow-up fire damage lands harder. The amount scales with rarity (provisionally 15-50%). The display name changed from "Ignition" to "Scorching", but it is still the same affix underneath.

### Affix Rates by Tier

| Tier | Common | Uncommon | Rare | Epic | Mythic | Max Sockets |
|------|--------|----------|------|------|--------|-------------|
| 1 | 15% | 5% | - | - | - | 1 |
| 2 | 25% | 15% | 5% | - | - | 2 |
| 3 | 35% | 25% | 15% | 8% | - | 3 |
| 4 | 35% | 25% | 15% | 10% | 5% | 4+ |

## Weapon Progression

| System | Role | Acquisition |
|--------|------|-------------|
| Tetra stack (Tetra + `art_of_forging` + `adtetra`) | Primary crafted weapons + tools | Crafting with tier materials at the Tetra workbench (formerly documented as "Truly Modular", which is not in the pack) |
| Iridescent Reforging (in `iridescent_tetra_expansion`) | Modular armor (Tetra-extension) | Leather base recipe + Tetra workbench, or convert specialized armor |
| Simply Swords | Unique trophy weapons | Boss drops only (via LootJS) |
| Iron's Spells | Magic combat | Crafting + loot |
| Cataclysm | Signature boss weapons | Cataclysm boss drops |
| Mahou Tsukai | Ultimate magic combat | Tier 4 crafting |
| Mekanism | Tech endgame (MekaTool) | Tier 4 crafting |

## Class Artifacts (Epic RPG)

There are 14 class-themed curio items in the `rpgseteffects:` namespace, each with a stronger "Awakening" variant, plus 25 standalone Relics with single-effect passives. They come only from drops; there is no crafting path.

### Acquisition

| Item type | Source | Rate |
|-----------|--------|------|
| Fragment Core | Any hostile mob | 4% drop |
| T1 Relics (movement, utility) | Overworld / Twilight Forest chests | ~0.4% per chest |
| T2 Relics (combat, immunity) | Blue Skies chests | ~0.6% per chest |
| T3 Relics (fire, decay) | Nether / Undergarden / Deeper Darker (Otherside) / Abyss chests | ~0.8% per chest |
| T4 Relics (endgame passives) | End / Aether chests | ~1.0% per chest |
| Artifact Piece Pouch | T2+ boss kills | 1× from T2 bosses, 2× from T4 bosses |
| Normal artifacts | Pouch open | 14-way weighted pool, one per pouch |
| Awakening artifacts | T4 boss direct drops only | 0.7% per awakening × 14 = ~9.3% combined per T4 boss |

### T2 Boss Sources
Naga, Lich, Hydra (Twilight Forest), Ignis (Cataclysm), Summoner (Blue Skies).

### T4 Boss Sources
Ender Dragon, Ender Guardian, Harbinger (Cataclysm), Shattered (Deeper Darker), Slider (Aether).

### AStages Tier Gating
- Normal artifacts and artifact_piece_pouch: T2 (you can pick them up, but not equip them until the T2 unlock)
- Awakening artifacts: T4 (held as trophies until T4)

### Configuration
Class Artifacts' own elite mob system (tier 1/2/3 Elite/Master/Legendary spawns) is disabled in `rpgseteffects-common.toml`, because IridescentCraft uses Majrusz's Progressive Difficulty for elite enemies. Running both would create duplicate skull-marked mobs with competing boss bars.

## Food & Hunger

Hunger drains at 2.5x the vanilla rate. Seed drops from grass are cut to 5%. Structure food loot is reduced in every loot table except village chests: as of 2026-05-17 villages get a flat food and seed boost (about 1.4 food and 0.6 seeds expected per chest). This walks back the original blanket food cut, which proved too harsh alongside the 2.5x hunger drain. The boost targets vanilla biome houses (plains/desert/savanna/snowy/taiga), CTOV village chests and Villages and Pillages chests. Hunger drains more slowly inside the spawn protection area, for new players.

The seed economy is weighted toward Farmer's Delight (2026-05-17). FD is the pack's baseline farming mod, so its seeds (`cabbage_seeds`, `tomato_seeds`, `onion`, `rice`) make up ~68% of the village seed roll, and vanilla wheat/beetroot/pumpkin/melon seeds the remaining ~31%. Cabbage and tomato seeds also drop from the grass and tall_grass loot tables (3-4% each), so the onboarding path of finding seeds by breaking grass covers FD too.

Village butcher chests have guaranteed meat (2026-05-17). The vanilla butcher chest tables gave all meat low random-roll weights, so a butcher chest could hold no meat at all. They now add a guaranteed 1-3 porkchop, 1-3 chicken and 1-2 beef on top of the vanilla rolls. This fits the theme and answers a tester report that butcher chests felt broken.

Farm animals are denser in the biomes around villages (2026-05-17). A Forge biome_modifier (`icraft_worldgen_overrides/data/icraft/forge/biome_modifier/village_animals.json`) adds passive spawn entries for pig/cow/chicken/sheep in the 9 biomes where vanilla villages generate (plains, sunflower_plains, savanna, savanna_plateau, taiga, old_growth_pine_taiga, old_growth_spruce_taiga, snowy_plains, meadow). This approximates "villages have more farm animals" by raising the density across those biomes; limiting the spawns to the village structure's bounding box would need per-biome village structure JSON overrides. Desert villages are skipped, since rabbits suit the biome better than pigs, cows or sheep.

Spice of Life: Carrot Edition rewards a varied diet with HP bonuses. Food is ungated from Tier 1, but the best variety needs dimensional ingredients. The Farmer's Delight Cooking Station and Skillet are the main food crafting stations (70 recipes converted).

## XP Economy

XP is plentiful, and there are many ways to spend it: JustLevelingFork leveling, skill point investment, Apotheosis enchanting, relic leveling, anvil operations, reforging.

## Storage Progression

| Tier | Storage | Transport |
|------|---------|-----------|
| 1 | Sophisticated Backpacks (iron), Storage Drawers | Pretty Pipes, Create belts |
| 2 | Sophisticated (steel), Drawer upgrades | Thermal Ducts, IF basic |
| 3 | Refined Storage, Sophisticated (diamond) | XNet, IF advanced |
| 4 | RS advanced, Sophisticated (netherite) | Mekanism QIO, RFTools |

## Tetra Modded Materials

A Paxi datapack (`icraft_tetra_materials`) adds 27 modded metal material definitions, so Tetra tools can be crafted from modded metals. They include Blue Skies, Undergarden, Forbidden & Arcanus and theabyss (TATOS) metals; the 4 theabyss entries (`garnite`, `knight`, `phantom`, `unorithe`, keyed to `theabyss:*_ingot`, diamond tool level) are live because TATOS is in the pack. High-tier crafting needs the diamond hammer tier.

| Tier | Materials |
|------|-----------|
| T1 | Brass |
| T2 | Steel, Signalum, Lumium, Manasteel, Steeleaf, Ironwood, Fiery, Knightmetal, Diopside, Charoite, Horizonite |
| T3 | Osmium, Refined Obsidian, Terrasteel, Elementium, Enderium, + Undergarden metals, F&A metals |
| T4 | Aethersteel; the Aether's materials (zanite, gravitite, skyjade, valkyrie, phoenix, stratus) since the Aether became Tier 4 |

See [Tetra Materials](tetra-materials.md) for the full reference.

## Seasonal Farming (Serene Seasons)

Serene Seasons adds seasonal crop growth. Crops die in winter unless grown in a greenhouse (glass-enclosed, torch-lit). A 4-page Patchouli Codex entry explains it.

## Azukaar's Fair Difficulty (REMOVED 2026-05-03)

It was removed together with ScalingMobs and Improved Mobs when the custom `iridescent_difficulty` mod took over dimension scaling (see "Difficulty engine" above). Its stat scaling had already been zeroed, and its remaining behavior features (hunger nerf, night purge, no-sleep enforcement, respawn distance) are now covered by the dedicated mods for those mechanics (Hunger Overhaul, Sleep Hunger, etc.).

## Mekanism Balance

Every machine's RF cost is raised to 2.5x stock. This is the demand-side lever: generator outputs stay stock, and as of ERA 4 the fusion and fission outputs are buffed so reactors carry the late-game load. The Digital Miner recipe needs higher-tier materials. Mekanism tool and armor recipes are removed (MekaTool and MekaSuit stay T4-only through the existing gating).

ERA 4 endgame rebalance (2026-06-06): with machine costs raised, the late-game reactors are the intended answer. Fusion output is buffed x1.5 (energy-per-fusion-fuel up to 15M) and fission output x1.25 (energy-per-fission-fuel up to 1.5M), so building a real reactor pays off. Radiation and meltdowns are both disabled: an over-damaged fission reactor force-shuts-down instead of exploding or irradiating your base, so a fission build can go wrong and still be recovered. The fusion chain, SPS/antimatter, the Digital Miner and the ultimate-tier facilities sit behind the T4 stage, while the intermediate machines that lead up to them stay open so the ramp still feels continuous.

## Custom Abyss-themed Curio System

A curated T3 curio chain of 8 `kubejs:ring_*` curio items replaces theabyss (TATOS)'s 30 stock rings. TATOS is in the pack: its stock rings and arcane workbench are stripped in `recipe_audit.js` §K, and the 8 custom rings drop from TATOS structure chests and Abyss bosses through `abyss_boss_loot.js` (effects in `abyss_ring_effects.js`). See `master-appendix.md` §C.11.

## Blue Skies Balance

The Dusk Arc weapon and the Shadow Armor set are removed (overpowered for T2). The Runic Arc is a boss drop only. Diopside, Charoite and Horizonite are nerfed to T2-appropriate stats and integrated into Tetra.

## End Overhaul

Dragon Exploration Gate: players must explore the End islands and complete objectives before the dragon fight opens. 9 advancement overrides replace the vanilla End advancement chain, and there are 5 End-specific Apotheosis affixes. End mob entity IDs are corrected, and Moog's End Structure loot tables are filled in.

## Difficulty engine — `iridescent_difficulty` (time-based)

As of 2026-05-03, the custom `iridescent_difficulty` mod is the dimension-scaling engine. It replaced ScalingMobs, the Improved Mobs difficulty accumulator and Azukaar's Fair Difficulty Overhaul (all removed). Per-dimension HP / damage / armor multipliers ramp linearly from a per-tier start% to a cap% over capHours of dimension-loaded time, then freeze. Only the End uncaps, once the Ender Dragon is killed.

| Tier | Start % | Cap % | Cap Hours |
|------|---------|-------|-----------|
| T1 (Overworld) | 150% | 300% | 100 |
| T2 (Twilight / Blue Skies / the Abyss's pocket dimension) | 200% | 350% | 100 |
| T3 (Undergarden / Deeper Darker / Nether / Abyss + Frost World) | 300% | 450% | 100 |
| T4 (End / Aether, incl. Deep Aether's biomes / the Ad Astra planets and orbits / Iron's Spellbooks' pocket dimension / the Reality Marble) | 600% | 1000% | 200 |

- Scope: linear on `max_health` / `attack_damage` / `armor`, `sqrt` on `movement_speed`. Tamed and non-MONSTER mobs are skipped (except a short list that is scaled anyway, which since 2026-10-16 includes the Aether's own hostile creatures: swets, whirlwinds, the aechor plant, cockatrices, zephyrs, baby zephyrs and venomites), and so are the bosses on the exclusion list. Since October 2026 that list holds every boss with a designed health or the boss x3 (78 entity ids, the Wither and the Ender Dragon among them), so their health is the same in every dimension. Minibosses without a designed health are not on it and grow with the curve like the mobs around them. A dimension on no tier list runs the Tier 1 curve; until October 2026 that was the case for the planets, the orbits and the pocket dimensions.
- Idle gating: the per-dimension timer ticks at the `active / total` player ratio in that dimension (a player is idle after N minutes with no movement or combat, or while inside the spawn radius).
- Stacks on top of (does not replace): per-kill boss scaling, per player (`boss_progressive.js`; not the Wither, the Ender Dragon, the Warden or the Elder Guardian), the static `mob_scaling_unified.js` tier-HP block (basic 3× / mid 1.5× / elite 1.25×), and Majrusz's content features (treasure bags and spawn variants; Majrusz's own stat scaling is disabled in its config).

Full curve and commands: [`mods/custom.md`](../mods/custom.md#iridescent_difficulty-010jar) and `config/iridescent_difficulty-common.toml`.

## Mob equipment (iron-tier cap)

Mobs spawn with gear at dimension-scaled rates (from 5% in the Overworld to 80% in the End), capped at iron-tier breaking tools, through `scaling/mob_equipment.js`. (This was originally an Improved Mobs config; that mod was removed on 2026-05-03, so the handler now holds these targets itself. See [master-appendix §D.11](../design/master-appendix.md#d11-regular-mob-equipment-progression).)

## Tectonic Terrain

Tectonic worldgen is tuned for much lower, flatter terrain: vertical_scale is cut from 1.155 to 0.38, ultrasmooth is on, a flat_terrain_skew of 0.65 pulls generation toward flatter ground, and ridge_scale is reduced. Mountains still appear but are far less extreme (worldgen rebalance 2026-06-06).

## Walkable Mekanism Cables

A coremod (v1.0.1) that makes Mekanism cables and pipes walkable instead of giving them tiny hitboxes. It includes a LocalVariableTable fix.

## HDPE & Rubber Pipeline

The HDPE Circuit Board is a craftable component for alternative Mekanism machine recipes. The IF latex/rubber pipeline is reworked: logs produce latex through Create/Thermal processing routes, and HDPE converts to dry rubber for recipe chains.

## Related Pages

- [Master Design Document](../design/master.md): Parts I, II, V, VI, VII
- [Progression](../progression/overview.md): tier and dimension details
- [Classes](../classes/overview.md): how scaling interacts with class roles
