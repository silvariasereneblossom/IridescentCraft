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
- **The Aether:** Updraft Zones, Cloud Cover, Gravity Wells
- **Undergarden:** Virulent Spores (poison), Fungal Armor (regen), Decay Aura
- **Deeper and Darker:** Acoustic Aggro, Sculk Resonance, Darkness Empowerment
- **The Nether:** Infernal Rage, Soulfire Burns (30% bypasses armor), Blaze Swarm
- **Deep Aether:** Celestial Empowerment, Wind Shear, Radiant Shield
- **The End:** Void Proximity, Ender Displacement, Void Corruption, Reality Fracture

## Champions System

Elite mob spawns with combat affixes. Affix count and spawn rate scale with dimension tier. Per-dimension Champion spawn scaling now implemented.

16 built-in affixes + 5 custom IridescentCraft affixes:

- **Custom affixes:** Commanding (rally nearby mobs), Draining (lifesteal attacks), Hexing (debuff application), Leaping (gap-closing lunges), Summoning (spawn reinforcements)

Categories: Offensive (Molten, Arctic, Venom, Wither, Desecrating, Enkindling), Defensive (Shielding, Reflecting, Regenerating, Armored, Adaptable), Mobility (Hasty, Knockback, Blink, Leaping), Utility (Commanding, Summoning, Draining, Hexing).

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

Spice of Life: Carrot Edition rewards food diversity with HP bonuses. Food is ungated from Tier 1 but best diversity requires dimensional ingredients.

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

15 modded metal material definitions integrated via Paxi datapack (`icraft_tetra_materials`). Enables Tetra tool crafting with modded metals.

| Tier | Materials |
|------|-----------|
| T1 | Brass |
| T2 | Steel, Signalum, Lumium, Manasteel, Steeleaf, Ironwood, Fiery, Knightmetal |
| T3 | Osmium, Refined Obsidian, Terrasteel, Elementium, Enderium |
| T4 | Aethersteel |

## Seasonal Farming (Serene Seasons)

Serene Seasons adds seasonal crop growth. Crops die in winter unless grown in a greenhouse (glass-enclosed, torch-lit). Documented in a 4-page Patchouli Codex entry.

## Azukaar's Fair Difficulty

All stat scaling (damage, luck, XP multipliers) zeroed out to avoid conflicts with ScalingMobs. Behavior features retained: hunger nerf, night purge, no-sleep enforcement, respawn distance.

## Related Pages

- [Master Design Document](../design/master.md) — Parts I, II, V, VI, VII
- [Progression](../progression/overview.md) — Tier and dimension details
- [Classes](../classes/overview.md) — How scaling interacts with class roles
