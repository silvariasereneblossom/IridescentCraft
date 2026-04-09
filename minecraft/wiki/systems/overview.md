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
- **The Abyss:** Oppressive Darkness (reduced visibility + slowness without light source), Corruption (gradual wither in corrupt biomes), Fear Aura (boss proximity debuffs)
- **The End:** Void Proximity, Ender Displacement, Void Corruption, Reality Fracture. Dragon Exploration Gate: explore End islands first, fight dragon last. 9 advancement overrides, 5 End Apotheosis affixes.

## Champions System (REMOVED 2026-04-07)

Champions Unofficial has been removed from the modpack. The mod had a broken rank config system, was unmaintained, and generated error spam on every mob spawn event causing server lag. Elite mob encounters are now handled by Majrusz's Progressive Difficulty (see below).

## Mob Tier HP Scaling

Custom HP multipliers applied via `mob_scaling_unified.js` based on mob category. Stacks multiplicatively with dimension scaling and ascension systems.

| Tier | Multiplier | Examples |
|------|-----------|----------|
| Basic | 3x HP | Zombie (60 HP), Skeleton, Spider, Creeper, Drowned, Husk, Stray, Witch, Slime |
| Mid-tier | 1.5x HP | Blaze, Wither Skeleton, Piglin Brute, TF/Aether/Blue Skies mobs, dungeon mobs |
| Champion | 1.25x HP | Stacks on top of other affixes (from Progressive Difficulty) |
| Boss | 1x HP | Unchanged, custom HP managed via boss_hp.js |
| Catch-all | 3x HP | Any unlisted hostile mob defaults to basic tier |

## Progressive Difficulty (Majrusz's)

Three-stage world difficulty scaling tied to progression milestones. Replaces Champions as the primary mob challenge system.

| Stage | Tier Range | Trigger | Effects |
|-------|-----------|---------|---------|
| Normal | T1-T2 | Default | Base difficulty, standard mob spawns |
| Expert | T3 | Nether entry | T3-level mob enhancements, new mob abilities |
| Master | T4 | Dragon kill | T4-level mob enhancements, full difficulty |

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

## Apotheosis Affixes

~95 total designed, 149 implemented (84 JSON datapacks + 65 event-driven).

Categories: Generic Power, Weapon (Offensive/Utility), Armor (Defensive/Mobility/Utility), Shield, Dimensional, Boss-Themed, Tier-Gated.

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
| Truly Modular | Primary crafted weapons | Crafting with tier materials |
| Simply Swords | Unique trophy weapons | Boss drops ONLY (via LootJS) |
| Iron's Spells | Magic combat | Crafting + loot |
| Cataclysm | Signature boss weapons | Cataclysm boss drops |
| Mahou Tsukai | Ultimate magic combat | Tier 4 crafting |
| Mekanism | Tech endgame (MekaTool) | Tier 4 crafting |

## Food & Hunger

Hunger drain rate increased to 2.5x vanilla baseline. Seed drops from grass reduced to 5%. Structure food loot reduced across all loot tables. Spawn protection area provides slower hunger drain for new players.

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

27 modded metal material definitions integrated via Paxi datapack (`icraft_tetra_materials`). Enables Tetra tool crafting with modded metals. Includes Blue Skies, Undergarden, Abyss, and Forbidden & Arcanus metals. Diamond hammer tier required for high-tier crafting.

| Tier | Materials |
|------|-----------|
| T1 | Brass |
| T2 | Steel, Signalum, Lumium, Manasteel, Steeleaf, Ironwood, Fiery, Knightmetal, Diopside, Charoite, Horizonite |
| T3 | Osmium, Refined Obsidian, Terrasteel, Elementium, Enderium, + Undergarden metals, Abyss metals, F&A metals |
| T4 | Aethersteel |

See [Tetra Materials](tetra-materials.md) for full reference.

## Seasonal Farming (Serene Seasons)

Serene Seasons adds seasonal crop growth. Crops die in winter unless grown in a greenhouse (glass-enclosed, torch-lit). Documented in a 4-page Patchouli Codex entry.

## Azukaar's Fair Difficulty

All stat scaling (damage, luck, XP multipliers) zeroed out to avoid conflicts with ScalingMobs. Behavior features retained: hunger nerf, night purge, no-sleep enforcement, respawn distance.

## Mekanism Balance

Generators nerfed across the board to prevent early RF flooding. All machine RF costs doubled (2x). Digital Miner recipe requires higher-tier materials. Mekanism tool and armor recipes removed (MekaTool/MekaSuit remain T4-only via existing gating).

## Abyss Ring & Armor System

The Abyss mod received a full overhaul. 30 original ring recipes removed (too accessible for their power level). 8 custom rings created with progression-appropriate recipes gated behind boss drops. 7 armor set bonuses implemented for Abyss armor sets. Key equipment requires Abyss boss drops to craft.

## Blue Skies Balance

Dusk Arc weapon and Shadow Armor set removed (overpowered for T2). Runic Arc changed to boss-drop only. Diopside, Charoite, and Horizonite nerfed to T2-appropriate stats and integrated into Tetra.

## End Overhaul

Dragon Exploration Gate: players must explore End islands and complete objectives before the dragon fight becomes available. 9 advancement overrides replace the vanilla End advancement chain. 5 End-specific Apotheosis affixes. Void Blossom loot table fixed. Entity ID corrections for End mobs. Moog's End Structure loot tables populated.

## Improved Mobs

Rebalanced for fairer early game. 3 in-game day grace period before mobs gain equipment/abilities. Equipment and damage caps halved from defaults. Mob breaking tools downgraded from diamond to iron tier.

## Tectonic Terrain

Tectonic worldgen tuned for flatter terrain: vertical_scale reduced from 1.155 to 0.8 (-31% height reduction), ridge_scale reduced. Mountains are still present but less extreme.

## Walkable Mekanism Cables

Coremod (v1.0.1) that makes Mekanism cables/pipes walkable instead of having tiny hitboxes. Includes LocalVariableTable fix.

## HDPE & Rubber Pipeline

HDPE Circuit Board added as a craftable component for alternative Mekanism machine recipes. IF latex/rubber pipeline reworked: logs produce latex via Create/Thermal processing routes, HDPE converts to dry rubber for recipe chains.

## Related Pages

- [Master Design Document](../design/master.md) — Parts I, II, V, VI, VII
- [Progression](../progression/overview.md) — Tier and dimension details
- [Classes](../classes/overview.md) — How scaling interacts with class roles
