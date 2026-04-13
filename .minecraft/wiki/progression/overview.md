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

| Tier | Dimension | Difficulty | Health Multi | Damage Multi | Champion Spawn % |
|------|-----------|------------|-------------|-------------|-----------------|
| 1 | Overworld | 1.0x | 1.0x | 1.0x | 5% |
| 2 | Twilight Forest | 1.5x | 1.8x | 2.0x | 7% |
| 2 | Blue Skies | 2.0x | 2.0x | 2.3x | 8% |
| 2 | The Aether | 2.5x | 2.2x | 2.5x | 8% |
| 3 | The Undergarden | 3.0x | 3.0x | 3.5x | 10% |
| 3 | Deeper and Darker | 3.5x | 3.5x | 4.0x | 10% |
| 3 | The Nether | 4.0x | 4.0x | 5.0x | 12% |
| 4 | Deep Aether | 5.0x | 5.0x | 6.5x | 13% |
| 3 | The Abyss | 3.5x | 3.5x | 4.0x | 10% |
| 4 | The End | 6.0x-10.0x | 6.0x-10.0x | 8.0x-12.0x | 14-15% |

## Staging Implementation

AStages enforces per-player tier restrictions on:
- Items (tier-inappropriate items cannot be used)
- Dimensions (locked until stage unlocked)
- Recipes (tier-gated crafting)
- Ores (hidden/replaced until appropriate tier)

## Material Progression

- **Tier 1:** Iron, Copper, Brass, Tin, Bronze. No diamonds.
- **Tier 2:** Steel, Manasteel, Signalum, Lumium, Steeleaf, Ironwood, Fiery. Limited diamonds.
- **Tier 3:** Full diamond, Terrasteel, Elementium, Enderium, Osmium, Refined Obsidian, Ancient Debris.
- **Tier 4:** Netherite, Gaia Ingots, Dragon materials, Antimatter, Atomic Alloy.

## Related Pages

- [Master Design Document](../design/master.md) — Full specification (Parts I-XII)
- [Classes & Races](../classes/overview.md) — Character build system
- [Systems](../systems/overview.md) — Combat scaling, death penalty, loot
