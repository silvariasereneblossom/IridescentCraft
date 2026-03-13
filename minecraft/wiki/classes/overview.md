# Classes & Races Overview

Three layered character systems define player builds.

## Systems

| System | Role | When Active |
|--------|------|-------------|
| Origins / Origins++ | Race — innate traits, abilities, tradeoffs | Character creation (Tier 1) |
| Gods and Heroes RPG Classes | Class — combat role definition | Unlocked early, develops over time |
| Pufferfish's Skills (+ AStages bridge) | Skill Points — stat investment trees | Earned through progression |
| JustLevelingFork | Passive stat scaling via XP leveling | Always active |

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

Uses Origins mod. Races are ungated — early flight from Origins is intentional. Tradeoffs built into each Origin balance innate power.

## Related Pages

- [Master Design Document](../design/master.md) — Part III: Class & Race System, Part IV: Skill Trees
- [Progression](../progression/overview.md) — Tier system context
- [Systems](../systems/overview.md) — Death penalty interaction with glass cannons
