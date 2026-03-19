# Classes, Races & Origins Overview

Four layered character systems define player builds, with the first three presented as sequential prompts on first join.

## Systems

| System | Layer | Role | When Active |
|--------|-------|------|-------------|
| Origins (vanilla + icraft) | Origin | Flavor powers — unique abilities and tradeoffs (11 origins, no Human) | Character creation prompt 1 |
| Origins (icraft) | Race | 11 custom races — stat modifiers and thematic flavor | Character creation prompt 2 |
| Iridescent Classes (icraft) | Class | 10 combat roles — playstyle, HP tier, glass cannon | Character creation prompt 3 |
| Pufferfish's Skills (+ AStages bridge) | — | Skill Points — stat investment trees | Earned through progression |
| JustLevelingFork | — | Passive stat scaling via XP leveling | Always active |

## Three-Prompt Character Creation

On first join, players choose in order:
1. **Origin** (11 origins, no Human) — Flavor powers (e.g., Arachnid wall climbing, Blazeborn fire immunity, Merling underwater breathing, Witch of Ink paint magic, Artificial Construct iron eating)
2. **Race** (11 custom) — IridescentCraft race with stat bonuses/penalties (Human, Elf, Dwarf, Orc, Halfling, Faefolk, Revenant, Demi-God, Ryu, Fallen Angel, Kirin)
3. **Class** (10 custom) — Combat role (Berserker, Samurai, Battlemage, etc.)

Origins layer provides flavor powers, Race layer provides stat bonuses/penalties, and Class layer provides combat role. The vanilla `origins:human` has been removed to avoid overlap with the custom Human race.

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

All 22 scoreboard objectives are now functional (updated 2026-03-15):
- 10 fully functional effects (native KubeJS event hooks)
- 4 attribute-proxied (mapped to Iron's Spells attributes)
- 2 approximated (closest viable mechanic)
- 6 Engineering effects — previously placeholders, now fully working

## Race System

11 custom races implemented as an Origins layer in the `icraft` namespace. Races provide stat modifiers and thematic identity, separate from the origin selection.

### Race Details (updated 2026-03-19)

| Race | Bonuses | Penalties |
|------|---------|-----------|
| Human | None | None (baseline) |
| Elf | +15% ranged damage, +5% magic damage | — |
| Dwarf | Mining hunger halved | — |
| Orc | +10% melee damage | — |
| Halfling | +20% food efficiency | — |
| Faefolk | +30% magic damage | -50% armor toughness, -10% HP |
| Revenant | +20% damage + Resistance I in darkness/Abyss, Night Vision 1.1 | Weakness+slowness in sunlight, -20% healing |
| Demi-God | +40% HP (8 hearts), 2x raw meat healing, strength ability, phase ability, fire damage 1.5x | Mild Nether weakness |
| Ryu | 25% damage reduction, slow fall, draconic food healing, sparkles, clears debuffs | Meat preference |
| Fallen Angel | +15% all damage, slow fall, velocity dash, translucent | -20% HP (4 hearts), meat preference |
| Kirin | +0.1 movement speed, wall climbing, sprint jump, cat vision, speed boost | -20% HP (4 hearts) |

Notable fixes: Orc knockback double-apply bug fixed. Halfling food efficiency now functional. Revenant healing penalty now functional.

## Origin System (Overhauled 2026-03-17)

Uses 9 vanilla origins + 2 custom origins + Mundane (11 total, no Human). The vanilla `origins:human` has been removed to avoid overlap with the custom Human race. Origins are ungated — early flight from Origins is intentional.

**Design philosophy:** No lethal environmental effects. Food preferences, not restrictions. Tradeoffs should be interesting, not punishing. Elytra flight reserved for Elytrian. Each heart = 5% HP.

### Origin Details (updated 2026-03-19)

| Origin | Key Powers | Changes from Vanilla |
|--------|-----------|---------------------|
| Arachnid | Wall climbing, cobweb immunity | Unchanged |
| Avian | Sky Affinity: altitude buffs at Y=80 and Y=150 | "Fresh air" replaced with Sky Affinity |
| Blazeborn | Fire immunity, Nether Affinity (+10/20% damage in Nether) | Water damage→discomfort, Nether Spawn→Nether Affinity |
| Elytrian | Elytra flight, launch ability | Unchanged |
| Enderian | Teleport, Ender Shift (+15% damage after teleport) | New Ender Shift power added |
| Feline | Cat-like abilities, night vision | -20% HP added as tradeoff |
| Merling | Underwater breathing, aqua affinity | Suffocation→land discomfort after 5 min dry |
| Phantom | Phasing, invisibility, half health | Sunlight burn→weakness+slowness |
| Shulk | Hardened Shell (50% death durability reduction), +20% mining speed | Extra inventory→Hardened Shell |
| Mundane | No powers | Re-added as blank slate option |
| Witch of Ink | Paint magic, 50% food reduction, feeds from paintings. Boss counter (200 max) scales damage/reduction/toughness. Blessing of Penthesilea capstone. | New custom origin |
| Artificial Construct | 25% food efficiency, iron eating (ingots + blocks), iron upgrade ladder (1000→16000 iron, +5% per level, max +25%) | New custom origin |

All power descriptions updated to match new implementations.

## Related Pages

- [Master Design Document](../design/master.md) — Part III: Class & Race System, Part IV: Skill Trees
- [Progression](../progression/overview.md) — Tier system context
- [Systems](../systems/overview.md) — Death penalty interaction with glass cannons
