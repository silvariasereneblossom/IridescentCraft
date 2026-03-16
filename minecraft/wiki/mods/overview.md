# Mod Overview

420+ mods organized by function and tier availability.

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

## Combat & Scaling

Apotheosis, ScalingMobs, Champions Unofficial, Progressive Bosses, Cataclysmic Combat, Better Combat, Simply Swords, Too Many Bows, Truly Modular (+Archery/Armory/Arsenal), Iron's Spells, Improved Mobs, JustLevelingFork, Tetra (+Tetracelium compat, mutil library), Soul Fire'd

## Player Systems

Origins (+Origins++, Origins Overhaul), Gods and Heroes RPG Classes, Pufferfish's Skills (+AStages), JustLevelingFork, Relics, Artifacts, More Artifacts, Celestial Artifacts

## Dimensions

Twilight Forest, Blue Skies, The Aether, The Undergarden, Deeper and Darker, Deep Aether, Ad Astra

| Dimension | Tier | Notes |
|-----------|------|-------|
| Twilight Forest | 2 | AStages-gated |
| Blue Skies | 2 | AStages-gated |
| The Aether | 2 | AStages-gated |
| Deep Aether | 2 | Aether extension |
| The Undergarden | 3 | AStages-gated |
| Deeper and Darker | 3 | AStages-gated |
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

KubeJS (+addons), CraftTweaker, JeiTweaker, LootJS, AStages, FTB Quests

## Ungated Mods

Building: Chipped, Macaw's suite, Decorative Blocks, ConnectedTexturesMod, Rechiseled, Structurize

QoL: JourneyMap, Jade, Jade Addons, AppleSkin, Mouse Tweaks, FTB Ultimine/Chunks/Essentials, Simple Voice Chat, Equipment Compare, Light Overlay, JEED, Transmog

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
| Tetra | datapack (`icraft_tetra_materials`) | 20 modded metal material definitions including Abyss + F&A metals. Diamond hammer tier. |
| Ad Astra | recipes/config | Post-T4 space dimension. T4 gate + recipe gating. BEING IMPLEMENTED. |
| Mekanism | config/recipes | Generator nerfs, 2x RF costs, Digital Miner recipe change, tool/armor removal. |

## Related Pages

- [Master Design Document](../design/master.md) — Full mod list and tier assignments
- [Progression](../progression/overview.md) — How tiers gate mod access
