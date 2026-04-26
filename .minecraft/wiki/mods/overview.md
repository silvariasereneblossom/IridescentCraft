# Mod Overview

415+ mods organized by function and tier availability.

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
| Mekanism (advanced) | 4 | Digital Miner (recipe changed), Fusion Reactor, MekaTool, Mekasuit, QIO. Tool/armor recipes removed. |
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

Apotheosis, ScalingMobs, Majrusz's Progressive Difficulty, Progressive Bosses, Cataclysmic Combat, Better Combat, Simply Swords, Too Many Bows, Truly Modular (+Archery/Armory/Arsenal), Iron's Spells, Improved Mobs, JustLevelingFork, Tetra (+Tetracelium compat, mutil library), Soul Fire'd

## Player Systems

Origins (Forge), Iridescent Origins, Pufferfish's Skills (+AStages), JustLevelingFork, Heracles (quest system), Relics, Artifacts, More Artifacts, Celestial Artifacts, Epic RPG: Class Artifacts (+XP: Attribute Core dep)

## Dimensions

Twilight Forest, Blue Skies, The Aether, The Undergarden, Deeper and Darker, Deep Aether, The Abyss, Ad Astra

| Dimension | Tier | Notes |
|-----------|------|-------|
| Twilight Forest | 2 | AStages-gated. Portal activator changed to T1 boss token (was diamond). |
| Blue Skies | 2 | AStages-gated. Dusk Arc removed, Shadow Armor removed, Runic Arc boss-drop only. |
| The Aether | 2 | AStages-gated. Dimension mechanics: thin air, vertigo, updrafts. |
| Deep Aether | 4 | AStages-gated. Advanced Aether endgame dimension. |
| The Undergarden | 3 | AStages-gated. 4 metals integrated into Tetra. |
| Deeper and Darker | 3 | AStages-gated |
| The Abyss | 3 | Dimension mechanics: oppressive darkness, corruption, fear aura. 30 ring recipes removed, 8 custom rings, 7 armor set bonuses, boss drop gating. |
| Ad Astra (Moon) | Post-T4 | 7x difficulty. BEING IMPLEMENTED |
| Ad Astra (Mars) | Post-T4 | 8x difficulty. BEING IMPLEMENTED |
| Ad Astra (Mercury) | Post-T4 | 9x difficulty. BEING IMPLEMENTED |
| Ad Astra (Venus) | Post-T4 | 10x difficulty. BEING IMPLEMENTED |
| Ad Astra (Glacio) | Post-T4 | 12x difficulty. BEING IMPLEMENTED |

## Boss Mods

Cataclysm (+Apotheosis addon), Meet Your Fight, Mutant Monsters, Ultimate Bosses, NovaBosses, Ultris: Boss Expansion, LuMoreBossesAndMobs, Brutal Bosses

## Food & Farming

Farmer's Delight (+Alex's/Nether's/Cultural/Delightful/Brewin'), Pam's HarvestCraft 2 (Crops/Trees/Food Core/Extended), Cooking for Blockheads, Simple Farming, Hunger Overhaul, Spice of Life: Carrot Edition, Serene Seasons

## Storage & Logistics

Refined Storage (+addons), Sophisticated Backpacks/Storage, Storage Drawers, Pretty Pipes, EnderChests (Tier 4), EnderStorage (Tier 4)

## Scripting

KubeJS (+addons), CraftTweaker, JeiTweaker, LootJS, AStages

## Ungated Mods

Building: Chipped, Macaw's suite, Decorative Blocks, ConnectedTexturesMod, Structurize

QoL: JourneyMap, Jade, Jade Addons, AppleSkin, Mouse Tweaks, LiteMiner (veinmining), Simple Voice Chat, Equipment Compare, Light Overlay, JEED, Transmog

Multiplayer: Open Parties and Claims (chunk claiming), Simple Voice Chat

Utilities: FastBack (git-based backups)

Libraries/Dependencies: Majrusz Library, Amber

Performance: ImmediatelyFast, Oculus, LazyDFU [UNOFFICIAL PORT], Alternate Current, Ksyxis

Other: CC: Tweaked, Quark, Disenchanting (T2-gated recipe), Enchantment Transfer (ungated — XP cost is gate), Flux Networks, Iron Jetpacks (tiered by materials, single dynamic item ID with NBT), Table of Experience (T2-gated recipe), DarkOrb Orb of Origin (T2-gated recipe)

## Config Changes Made

| Mod | Config File | Change |
|-----|------------|--------|
| Ars Nouveau | `ars_nouveau-common.toml` | `spawnBook = false` |
| The Abyss | `theabyss.toml` | `"Spawn Book" = false` |
| TA The Other Side | `ta_theotherside.toml` | `GuideBook = false` |
| Celestial Artifacts | `celestial_artifacts-common.toml` | `giveItemsOnStart = false` |
| Azukaar's Fair Difficulty | config | All stat scaling zeroed (damage, luck, XP multipliers). Behavior features kept. |
| Icarus | recipes | All default wing recipes removed. 5 new T3 recipes (diamond + phantom membrane). |
| Disenchanting Table | recipe | T2-gated (requires 4x `thermal:steel_ingot`) |
| Table of Experience | recipe | T2-gated (requires 4x `thermal:steel_ingot`) |
| DarkOrb Orb of Origin | recipe | T2-gated (4x steel + 4x amethyst + heart of the sea) |
| Aethersteel | datapack/config | T4 endgame. Worldgen disabled, 17 items AStages-restricted, ore replacement. |
| Terramity | recipes | 22 gun recipes removed, 64 armor pieces removed, gunsmith station removed. |
| Tetra | datapack (`icraft_tetra_materials`) | 27 modded metal material definitions including Blue Skies, Undergarden, Abyss + F&A metals. Diamond hammer tier. |
| Ad Astra | recipes/config | Post-T4 space dimension. T4 gate + recipe gating. BEING IMPLEMENTED. |
| Mekanism | config/recipes | Generator nerfs, 2x RF costs, Digital Miner recipe change, tool/armor removal. |
| Blue Skies | recipes/loot | Dusk Arc removed, Shadow Armor removed, Runic Arc boss-drop only. Diopside/Charoite/Horizonite nerfed to T2. |
| The Abyss | recipes/config | 30 ring recipes removed, 8 custom rings, 7 armor set bonuses, boss drop gating. Dimension mechanics (darkness, corruption, fear). |
| Twilight Forest | recipes | Portal activator changed from diamond to T1 boss token. |
| End (vanilla + mods) | datapacks/scripts | Dragon Exploration Gate, 9 advancement overrides, 5 End Apotheosis affixes, Void Blossom loot fix, entity ID fixes, Moog's End Structure loot. |
| Improved Mobs | config | 3 in-game day grace period, equipment/damage caps halved, diamond→iron for mob breaking tools. |
| Tectonic | config | vertical_scale 1.155→0.8 (-31%), ridge_scale reduced. |
| LootJS | scripts | Clutter removal (horse armor, spider eyes), food reduction 70%→90%. |
| Apotheosis | config | Dimension key prefixes fixed, Overworld Affix Item generation 50%→25%. |
| Iron's Spells | loot tables | Scrolls + copper spell book added to Overworld chest loot for early magic access. |
| Walkable Cables | coremod | v1.0.1 — makes Mekanism cables walkable, LocalVariableTable fix. |
| Mekanism (HDPE) | recipes | HDPE Circuit Board recipe, alternative machine recipes using HDPE components. |
| Industrial Foregoing | recipes | Latex/rubber pipeline rework: logs→latex via Create/Thermal, HDPE→dry rubber. |
| Origins | power JSONs | All 9 vanilla origins rebalanced (no lethal effects, food prefs not restrictions). 4 custom origins added (Witch of Ink, Artificial Construct, Witherborn, Slimebodied). No Mundane, no Human. |

## Removed Mods

| Mod | Reason | Date |
|-----|--------|------|
| Rechiseled | SuperMartijn642 Core Lib load order incompatibility | 2026-03-17 |
| SuperMartijn642's Core Lib | Load order incompatibility (dependency of Rechiseled, Connected Glass, Trash Cans) | 2026-03-17 |
| SuperMartijn642's Config Lib | Dependency of above | 2026-03-17 |
| Connected Glass | Depends on SuperMartijn642 libs (removed) | 2026-03-17 |
| Trash Cans | Depends on SuperMartijn642 libs (removed) | 2026-03-17 |
| Pretty Rain | Cloth Config incompatibility | 2026-03-17 |
| Cherry Village | Unregistered worldgen feature crash | 2026-03-19 |
| Gods & Heroes RPG Classes | Conflicts with icraft class layer, broken origin translations | 2026-03-19 |
| Tetra Attribute Rebalancing | Delisted from CurseForge, broken by Tetra 6.13.0 mixin changes | 2026-04-05 |
| Champions Unofficial | Broken rank config, unmaintained, error spam causing server lag | 2026-04-07 |
| FTB Backups | Replaced by FastBack (git-based backups) | 2026-04-08 |
| FTB Chunks | Replaced by Open Parties and Claims | 2026-04-08 |
| FTB Essentials | Removed (FTB suite cleanup) | 2026-04-08 |
| FTB Library | Removed (FTB suite cleanup, no longer needed) | 2026-04-08 |
| FTB Quests | Removed (FTB suite cleanup, Heracles used instead) | 2026-04-08 |
| FTB Ranks | Removed (FTB suite cleanup) | 2026-04-08 |
| FTB Teams | Removed (FTB suite cleanup) | 2026-04-08 |
| FTB Ultimine | Replaced by LiteMiner + Amber (veinmining) | 2026-04-08 |

## Custom Mods

The pack ships 9 custom-bundled jars (4 in-house source builds + 2 bytecode-patched + 3 utility), tracked in the **custom-JAR allowlist** so the self-updater doesn't delete them. Highlights:

- **iridescent_modular_spells-0.2.0.jar** — 15 modular spell books (12 ISS + 3 Ars) with full Tetra workbench integration. Per-book intrinsic stat overlay (BookKind enum) stacks on top of ISS vanilla. 4-slot model (front/back covers + spine + pages) with Tetra-canonical lining improvements on covers. Phase 6F-1 added 7 themed books (dragonskin/druidic/blaze/evoker/necronomicon/villager/rotten); blaze/evoker/necronomicon are guaranteed first-kill drops from ISS bosses. Magic enchants + magic-crit hook from earlier phases remain.
- **iridescent_origins-1.0.0.jar** — Origins/races/classes (3-prompt selection on first join).
- **iridescent_biomes-1.0.0.jar** — TerraBlender region for cherry_river_valley + cherry_mountains.
- **iridescent_codex_data.jar** — Patchouli Codex book (modId `icraft`).
- **Patchouli + ars_nouveau** — bytecode-patched (require `-noverify` JVM flag).

See [Custom Mods](custom.md) for the full list, build instructions, and architectural notes.

## Related Pages

- [Master Design Document](../design/master.md) — Full mod list and tier assignments
- [Progression](../progression/overview.md) — How tiers gate mod access
- [Custom Mods](custom.md) — In-house + bytecode-patched mod reference
