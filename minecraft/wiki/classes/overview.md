# Classes, Races & Origins Overview

Four layered character systems define player builds, with the first three presented as sequential prompts on first join.

## Systems

| System | Layer | Role | When Active |
|--------|-------|------|-------------|
| Origins++ | Origin | Species-level identity — unique abilities and tradeoffs (148 origins) | Character creation prompt 1 |
| Origins (icraft) | Race | 7 custom races — stat modifiers and thematic flavor | Character creation prompt 2 |
| Iridescent Classes (icraft) | Class | 10 combat roles — playstyle, HP tier, glass cannon | Character creation prompt 3 |
| Pufferfish's Skills (+ AStages bridge) | — | Skill Points — stat investment trees | Earned through progression |
| JustLevelingFork | — | Passive stat scaling via XP leveling | Always active |

## Three-Prompt Character Creation

On first join, players choose in order:
1. **Origin** — Broad species fantasy from Origins++ (e.g., Avian, Blazeborn, Merling)
2. **Race** — IridescentCraft race with stat identity (Human, Elf, Dwarf, Orc, Halfling, Faefolk, Revenant)
3. **Class** — Combat role (Berserker, Samurai, Battlemage, etc.)

This creates more build diversity than a two-layer system — Origin provides the species fantasy, Race adds stat flavor, and Class defines combat role.

## 10 Classes

| Class | Role | HP Tier | Equipment HP |
|-------|------|---------|-------------|
| Berserker | Melee DPS | Standard | Full |
| Samurai | Melee/Ranged Hybrid | Standard | Full |
| Battlemage | Melee/Magic Hybrid | Standard | Full |
| Wanderer | Hybrid Multiclass | Standard | Full |
| Paladin | Tank/Support/Healer | High | Full |
| Vanguard | Pure Tank | Highest | Full |
| Ranger | Ranged DPS | Low | **Halved** (glass cannon) |
| Archmage | Offensive Caster | Low | **Halved** (glass cannon) |
| Artificer | Crafter/Non-Combat | Standard | Full |
| Void Summoner | Summoner/Necromancer | Low | **Halved** (glass cannon) |

### Glass Cannon Mechanic

Ranger, Archmage, and Void Summoner have their equipment HP bonus halved. This is enforced by `equipment_hp_halving.js` using an attribute modifier. Origins class power JSONs auto-tag these classes via `glass_cannon_tag.json`.

### Class Respec

Implemented via `class_respec.js`. Class Altar item + 3 recipe variants (one per tier boss material). Consumes offhand boss trophy + 30 levels, then triggers Origins class re-selection.

## Estimated Tier 4 Power

| Stat | Glass Cannon | Hybrid | Tank |
|------|-------------|--------|------|
| Max HP | 80-120 (40-60 hearts) | 140-180 (70-90 hearts) | 220-300 (110-150 hearts) |
| Effective HP (after DR) | 160-300 | 350-540 | 700-1200 |
| Damage Per Hit | 50-90 | 40-65 | 25-45 |
| DPS (sustained) | 80-140 | 60-100 | 30-55 |

## Skill Trees (Pufferfish's Skills)

6 trees with trunk + 2 branches each:

1. **Warfare** — Melee combat (Berserker's Path / Duelist's Path)
2. **Marksman** — Ranged combat (Sniper's Path / Volley Path)
3. **Sorcery** — Magic combat (Destruction Path / Enchanter's Path)
4. **Fortitude** — Defense & survival (Iron Wall / Survivor's Path)
5. **Gathering** — Resource collection (Prospector's Path / Harvester's Path)
6. **Engineering** — Crafting & tech (Artificer's Path / Engineer's Path)

### Implementation Status

- 10 fully functional effects (native KubeJS event hooks)
- 4 attribute-proxied (mapped to Iron's Spells attributes)
- 2 approximated (closest viable mechanic)
- 6 informational (scoreboard tracks value, needs per-mod config)

## Race System

7 custom races implemented as an Origins layer in the `icraft` namespace. Races provide stat modifiers and thematic identity, separate from the Origins++ origin selection.

## Origin System

Uses Origins++ mod defaults. Origins are ungated — early flight from Origins is intentional. Tradeoffs built into each Origin balance innate power (e.g., Avian gets flight but takes more damage).

## Related Pages

- [Master Design Document](../design/master.md) — Part III: Class & Race System, Part IV: Skill Trees
- [Progression](../progression/overview.md) — Tier system context
- [Systems](../systems/overview.md) — Death penalty interaction with glass cannons
