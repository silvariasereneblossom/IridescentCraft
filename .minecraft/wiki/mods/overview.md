# Mod Overview

The pack's 455 mods (as of 2026-10-18), sorted by function and by the tier at which each becomes available.

## Core Tech (Tiered)

| Mod | Tier | Notes |
|-----|------|-------|
| Create | 1 | Kinetic automation, 1.5x ore processing |
| Pretty Pipes | 1 | Early logistics |
| Thermal Series | 2 | RF power, 2x ore processing, Phytogenic automation |
| Industrial Foregoing (basic) | 2 | Basic mob interaction, simple automation |
| Industrial Foregoing (advanced) | 3 | Laser Drill, Mob Crusher, auto-mining |
| Mekanism (basic) | 3 | Up to 5x ore processing, basic machines (2x RF costs, generator nerfs) |
| Refined Storage | 3 | Digital storage (dual-path recipes: tech or magic) |
| Mekanism (advanced) | 4 | Digital Miner (recipe changed), Fusion Reactor, MekaTool, Mekasuit, QIO. Tool/armor recipes removed. Fusion/fission output buffed (ERA 4) so reactors carry the late-game power load. |
| RFTools Dimensions | 4 | Dimension creation |

## Core Magic (Tiered)

| Mod | Tier | Notes |
|-----|------|-------|
| Botania | 1 | Mana generation, runic crafting, Orechid |
| Iron's Spells 'n Spellbooks | 1 | Combat magic from the start |
| Ars Nouveau | 2 | Source generation, spell crafting |
| Occultism | 3 | Spirit automation, ritual crafting |
| Forbidden & Arcanus | 3 | Dark magic |
| Mahou Tsukai | 4 | Ultimate magic combat |

## Core Player Systems (Tiered)

| Mod | Tier | Notes |
|-----|------|-------|
| Heracles | 1 | Quest system |
| JustLevelingFork | All | Stat/skill progression via XP leveling |

## Combat & Scaling

Apotheosis, `iridescent_difficulty` (bespoke time-based scaling; it replaced ScalingMobs / Improved Mobs / Azukaar's), Majrusz's Progressive Difficulty (elite mobs; it replaced Champions Unofficial), Progressive Bosses, Cataclysmic Combat, Better Combat, Simply Swords, Too Many Bows, Iron's Spells, JustLevelingFork, the Tetra stack (Tetra + `art_of_forging` + `adtetra`: the crafted-weapon/tool system formerly documented as "Truly Modular", which is not in the pack) with the Iridescent Reforging armor extension (bundled in `iridescent_tetra_expansion`), Soul Fire'd

## Player Systems

Origins (Forge), Iridescent Origins, Pufferfish's Skills (+AStages), JustLevelingFork, Heracles (quest system), Relics, Artifacts, More Artifacts, Celestial Artifacts, Epic RPG: Class Artifacts (+XP: Attribute Core dep)

## Dimensions

Twilight Forest, Blue Skies, The Aether, The Undergarden, Deeper and Darker, Deep Aether, The Abyss, Ad Astra

| Dimension | Tier | Notes |
|-----------|------|-------|
| Twilight Forest | 2 | AStages-gated (Tier 2). The portal is lit with a Codex Token I or a diamond; anyone can light it, only a Tier 2 player can step through. |
| Blue Skies | 2 | AStages-gated. Dusk Arc removed, Shadow Armor removed, Runic Arc boss-drop only. |
| The Aether | 4 | AStages-gated (Tier 2 until 2026-10-16). Dimension mechanics: faster mobs, thin air, vertigo, updrafts. |
| Deep Aether | 4 | No dimension of its own: its biomes, bosses and materials are part of the Aether. |
| The Undergarden | 3 | AStages-gated. 4 metals integrated into Tetra. |
| Deeper and Darker | 3 | AStages-gated |
| The Abyss | 3 | Dimension mechanics: oppressive darkness, corruption, fear aura. 30 ring recipes removed, 8 custom rings, 7 armor set bonuses, boss drop gating. |
| Ad Astra (Moon, Mars, Mercury, Venus, Glacio, and their six orbits) | 4 | Each planet and orbit has its own Tier 4 gate; the rocket workbench is a Tier 4 recipe. Tier 4 difficulty curve. Loot and space enchantments still in progress. |
| Iron's Spellbooks pocket dimension, Mahou Tsukai Reality Marble | 4 | The Pocket Dimension spell is refused before Tier 4. |

## Boss Mods

Cataclysm, Meet Your Fight, Mutant Monsters, Ultimate Bosses, Ultris: Boss Expansion, Brutal Bosses, Majestic Menaces, Cardinal Sins (the 7 sins → Lucifer → Drakara ladder; Lucifer is the T3→T4 combat capstone; the seven sins' and Drakara's arenas are in the Abyss, Lucifer's in the Nether). *(NovaBosses and LuMoreBossesAndMobs are NOT in the pack. The "Cataclysm Apotheosis addon" is unverified, as there is no such jar; see #47.)*

## Food & Farming

Farmer's Delight (+Alex's/Nether's/Cultural/Delightful/Brewin'), Pam's HarvestCraft 2 (Crops/Trees/Food Core/Extended), Cooking for Blockheads, Simple Farming, Hunger Overhaul, Spice of Life: Carrot Edition, Serene Seasons

## Storage & Logistics

Refined Storage (+addons), Sophisticated Backpacks/Storage, Storage Drawers, Pretty Pipes, EnderChests (Tier 4), EnderStorage (Tier 4)

## Scripting

KubeJS (+addons), LootJS, AStages

## Ungated Mods

Building: Chipped, Macaw's suite, Decorative Blocks, ConnectedTexturesMod, Structurize

QoL: JourneyMap, Jade, Jade Addons, AppleSkin, Mouse Tweaks, LiteMiner (veinmining), Simple Voice Chat, Equipment Compare, Light Overlay, JEED, Transmog

Multiplayer: Open Parties and Claims (chunk claiming), Simple Voice Chat

Libraries/Dependencies: Majrusz Library, Amber

Performance: ImmediatelyFast, Oculus, Alternate Current, Ksyxis

Other: CC: Tweaked, Quark, Disenchanting (T1-gated recipe), Enchantment Transfer (ungated; the XP cost is the gate), Flux Networks, Iron Jetpacks (tiered by materials, single dynamic item ID with NBT), Table of Experience (T2-gated recipe), DarkOrb Orb of Origin (T2-gated recipe)

## Config Changes Made

| Mod | Config File | Change |
|-----|------------|--------|
| Ars Nouveau | `ars_nouveau-common.toml` | `spawnBook = false` |
| The Abyss | `theabyss.toml` | `"Spawn Book" = false` |
| TA The Other Side | `ta_theotherside.toml` | `GuideBook = false` |
| Celestial Artifacts | `celestial_artifacts-common.toml` | `giveItemsOnStart = false` |
| Azukaar's Fair Difficulty | none | **REMOVED 2026-05-03** (with ScalingMobs / Improved Mobs); replaced by the bespoke `iridescent_difficulty` mod. |
| Icarus | recipes | All default wing recipes removed. 5 new T3 recipes (diamond + phantom membrane). |
| Disenchanting Table | recipe | T1-gated (same pattern as the enchanting table: 1 book + 2 gold ingots + 2 Apotheosis gems + 4 deepslate; 2026-05-16) |
| Table of Experience | recipe | T2-gated (requires 4x `thermal:steel_ingot`) |
| DarkOrb Orb of Origin | recipe | T2-gated (4x steel + 4x amethyst + heart of the sea) |
| Aethersteel | datapack/config | T4 endgame. Worldgen disabled, 17 items AStages-restricted, ore replacement. |
| Terramity | recipes | 22 gun recipes removed, 64 armor pieces removed, gunsmith station removed. |
| Tetra | datapack (`icraft_tetra_materials`) | 27 modded metal material definitions including Blue Skies, Undergarden, F&A, and theabyss (TATOS) metals (4 live theabyss entries: garnite/knight/phantom/unorithe). Diamond hammer tier. |
| Ad Astra | recipes/config | Tier 4 space dimensions: rocket workbench locked to Tier 4, a Tier 4 gate on every planet and orbit, the Tier 4 difficulty curve, death penalty 22-30 %. Loot and space enchantments in progress. |
| Mekanism | config/recipes | Generator nerfs, 2x RF costs, Digital Miner recipe change, tool/armor removal. ERA 4 (2026-06-06): fusion output buffed (`energyPerFusionFuel` 15M, x1.5) and fission output buffed (`energyPerFissionFuel` 1.5M, x1.25) so big reactors keep up with the higher machine costs; radiation and meltdowns disabled (an over-damaged fission reactor force-shuts-down instead of exploding, which is dangerous but recoverable); new T4 stage pins on the fusion chain, SPS/antimatter, the Digital Miner and ultimate-tier facilities (intermediate machines left open). |
| Blue Skies | recipes/loot | Dusk Arc removed, Shadow Armor removed, Runic Arc boss-drop only. Diopside/Charoite/Horizonite nerfed to T2. |
| Custom Abyss-themed rings | scripts | 8 `kubejs:ring_*` curios form a curated T3 chain that replaces the 30 stock rings of theabyss (TATOS) (the stock rings and the arcane workbench are stripped in `recipe_audit.js` §K); they drop from TATOS chests and Abyss bosses (`abyss_boss_loot.js`). The Abyss darkness/corruption/fear/void-whispers effects fire in `theabyss:the_abyss`. |
| Twilight Forest | tags | Portal activator: the Codex Token I (`icraft:progression_token_t1`) added to the mod's own diamond (since 17 October 2026; from April to October 2026 the only activator was a legacy token nothing gave). Entry to the dimension is gated at Tier 2. |
| End (vanilla + mods) | datapacks/scripts | Dragon Exploration Gate, Eyes of Ender staged at T4 (an End Compass → End Bastion unlock is planned to replace them), 9 advancement overrides, 5 End Apotheosis affixes, entity ID fixes, Moog's End Structure loot. |
| Mob equipment (`mob_equipment.js`) | scripts | 3-day grace, equipment/damage caps, diamond→iron mob breaking tools. (This was an Improved Mobs config; that mod was removed 2026-05-03, and the handler now holds these targets.) |
| Tectonic | config | Lower, flatter terrain: `vertical_scale` 0.38 (down from 1.155), `ultrasmooth` on, `flat_terrain_skew` 0.65, ridge_scale reduced. Mountains still present but much less extreme (worldgen rebalance 2026-06-06). |
| TerraBlender | config | `vanilla_overworld_region_weight` 9→16, which raises vanilla's share of the overworld so plains and other vanilla biomes are more common (worldgen rebalance 2026-06-06). |
| Biomes O' Plenty | biome_toggles | Lush Desert, Volcano, and Volcanic Plains turned off (desert/volcanic biome presence reduced); Dryland and Wasteland kept (worldgen rebalance 2026-06-06). |
| Towers of the Wild | config | Tower frequency reduced (36/25 → 28/20) so overworld towers are a little rarer (worldgen rebalance 2026-06-06). |
| Apotheosis (tome towers) | config | Tome-tower generation reduced to 24/14-16 (worldgen rebalance 2026-06-06). |
| LootJS | scripts | Clutter removal (horse armor, spider eyes), food reduction 70%→90%. |
| Apotheosis | config | Dimension key prefixes fixed, Overworld Affix Item generation 50%→25%. |
| Iron's Spells | loot tables | Scrolls + copper spell book added to Overworld chest loot for early magic access. |
| Walkable Cables | coremod | v1.0.1: makes Mekanism cables walkable; LocalVariableTable fix. |
| Mekanism (HDPE) | recipes | HDPE Circuit Board recipe, alternative machine recipes using HDPE components. |
| Industrial Foregoing | recipes | Latex/rubber pipeline rework: logs→latex via Create/Thermal, HDPE→dry rubber. |
| Origins | power JSONs | All 9 vanilla origins rebalanced (no lethal effects; food preferences instead of restrictions). 4 custom origins added (Witch of Ink, Artificial Construct, Witherborn, Slimebodied). No Mundane, no Human. |

## Removed Mods

These mods were in earlier builds and have since been dropped. Where a mod was replaced, the note names the replacement.

| Mod | Note |
|-----|------|
| Rechiseled | Removed: library incompatibility |
| SuperMartijn642's Core Lib | Removed: incompatibility |
| SuperMartijn642's Config Lib | Removed: incompatibility |
| Connected Glass | Removed: dependency removed |
| Trash Cans | Removed: dependency removed |
| Pretty Rain | Removed: incompatibility |
| Cherry Village | Removed: worldgen crash |
| Gods & Heroes RPG Classes | Removed: conflicted with the class system |
| Tetra Attribute Rebalancing | Removed: incompatibility |
| Champions Unofficial | Removed: replaced by Majrusz's Progressive Difficulty |
| FTB Backups | Removed: replaced by FastBack (itself removed later) |
| FastBack | Removed: it needs git on the host and never ran on the dedicated server; the server launcher backs the world up instead |
| FTB Chunks | Removed: replaced by Open Parties and Claims |
| FTB Essentials / Library / Ranks / Teams | Removed: FTB suite cleanup |
| FTB Quests | Removed: replaced by Heracles |
| FTB Ultimine | Removed: replaced by LiteMiner + Amber |
| Truly Modular family (Armory / Arsenal / Archery / modular-item-api / Create-compat) | Removed: superseded by the Tetra stack + Iridescent Reforging |
| ScalingMobs · Improved Mobs · Azukaar's Fair Difficulty | Removed: replaced by the bespoke `iridescent_difficulty` mod |

## Custom Mods

The pack ships custom-bundled jars (in-house source builds, bytecode-patched jars and utilities). They are listed, each with its checksum, in the pack's custom-jar manifest, so the stale-jar cleanup keeps them and replaces a copy that does not match. Highlights:

- iridescent_tetra_expansion-1.0.0.jar: bundles two `[[mods]]`, Iridescent Modular Spells (15 modular spell books, 12 ISS + 3 Ars, full Tetra workbench integration, BookKind intrinsic overlay, 4-slot model with lining improvements; blaze/evoker/necronomicon are first-kill drops from ISS bosses) and Iridescent Reforging (Tetra-armor extension). Item IDs keep their `iridescent_modular_spells:` / `iridescent_reforging:` namespaces; the full ID merge into a single `iridescent_tetra_expansion` namespace is deferred to the alpha→beta step. Built via `iridescent-tetra-expansion-mod/wsl-build.sh`.
- iridescent_origins-1.0.0.jar: Origins/races/classes (3-prompt selection on first join).
- iridescent_biomes-1.0.0.jar: TerraBlender region for cherry_river_valley + cherry_mountains.
- iridescent_codex_data.jar: Patchouli Codex book (modId `icraft`).
- iridescent_difficulty-0.1.0.jar: bespoke time-based per-dimension mob scaling (it replaced ScalingMobs / Improved Mobs / Azukaar's). See [Systems](../systems/overview.md#difficulty-engine--iridescent_difficulty-time-based).
- Patchouli + ars_nouveau: bytecode-patched (they need the `-noverify` JVM flag).

[Custom Mods](custom.md) has the full list, build instructions and architecture notes.

## Related Pages

- [Master Design Document](../design/master.md): design intent and tier assignments (its appendix holds the mod roster by tier)
- [Progression](../progression/overview.md): how tiers gate mod access
- [Custom Mods](custom.md): in-house and bytecode-patched mod reference
