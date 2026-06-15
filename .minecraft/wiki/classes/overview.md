# Classes, Races & Origins Overview

Four layered character systems define player builds, with the first three presented as sequential prompts on first join.

## Systems

| System | Layer | Role | When Active |
|--------|-------|------|-------------|
| Origins (vanilla + icraft) | Origin | Flavor powers — unique abilities and tradeoffs (13 origins, no Human) | Character creation prompt 1 |
| Origins (icraft) | Race | 11 custom races — stat modifiers and thematic flavor | Character creation prompt 2 |
| Iridescent Classes (icraft) | Class | 13 combat roles — playstyle, HP tier, glass cannon | Character creation prompt 3 |
| Pufferfish's Skills (+ AStages bridge) | — | Skill Points — stat investment trees | Earned through progression |
| JustLevelingFork | — | Passive stat scaling via XP leveling | Always active |

## Three-Prompt Character Creation

On first join, players choose in order:
1. **Origin** (13 origins, no Human) — Flavor powers (e.g., Arachnid wall climbing, Blazeborn fire immunity, Merling underwater breathing, Witch of Ink passive hyperscaling, Artificial Construct iron eating, Witherborn DOT melee, Slimebodied food tank)
2. **Race** (11 custom) — IridescentCraft race with stat bonuses/penalties (Human, Elf, Dwarf, Orc, Halfling, Faefolk, Revenant, Demi-God, Ryu, Fallen Angel, Kirin)
3. **Class** (13 custom) — Combat role (Berserker, Samurai, Battlemage, the Trinity mages, etc.)

Origins layer provides flavor powers, Race layer provides stat bonuses/penalties, and Class layer provides combat role. The vanilla `origins:human` has been removed to avoid overlap with the custom Human race.

## 13 Classes

| Class | Role | HP Tier | Equipment HP |
|-------|------|---------|-------------|
| Berserker | Melee DPS | Standard (-5%) | Full |
| Samurai | Melee/Ranged Hybrid | Standard (+5%) | Full |
| Battlemage | Melee/Magic Hybrid | Standard (+5%) | Full |
| Wanderer | Hybrid Multiclass | Standard (+5%) | Full |
| Paladin | Tank/Support/Healer | High (+10%) | Full |
| Vanguard | Pure Tank | Highest (+20%) | Full |
| Ranger | Ranged DPS | Low (-20%) | **Halved** (glass cannon) |
| Archmage | Offensive Caster | Low (-20%) | **Halved** (glass cannon) |
| Artificer | Crafter/Non-Combat | Standard | Full |
| Void Summoner | Summoner/Necromancer | Low (-10%) | **Halved** (glass cannon) |
| Elemental (Stormcaller) | Magic specialist — fire/ice/lightning burst | Low (-20%) | **Halved** (glass cannon) |
| Blessed (Hierophant) | Magic specialist — holy/nature/evocation sustain/support | High (+10%) | Full |
| Corrupted (Hollow) | Magic specialist — blood/ender/eldritch attrition/lifesteal | Low (-10%) | Full |

### Trinity Mages (added 2026-06-14, Phase 1a)

Three **magic specialists** that invert the Archmage's generalist bargain: each is exceptional in **three** Iron's Spellbooks schools and weak in the other six (depth over breadth). They form a rock-paper-scissors triangle, and each out-damages the Archmage *within* its triad while falling behind across the other schools.

| Mage | Schools (+80% spell power each) | Role | HP | Strong vs / Weak vs |
|------|--------------------------------|------|----|---------------------|
| Elemental | fire · ice · lightning | Burst/AoE artillery, glass cannon | Low (-20%, halved) | beats Blessed / loses to Corrupted |
| Blessed | holy · nature · evocation | Sustain/support, anti-undead | High (+10%) | beats Corrupted / loses to Elemental |
| Corrupted | blood · ender · eldritch | DoT/lifesteal attrition | Low (-10%) | beats Elemental / loses to Blessed |

Each also carries generic `spell_power 1.40` plus per-mage identity stats (Elemental: crit; Blessed: healing + magic resist; Corrupted: lifesteal + cooldown + armor-pen), a 2× mana pool, edge resistances in its winning matchup, and a vulnerability in its losing one — backed by Iron's Spellbooks per-school `*_spell_power` / `*_magic_resist` attributes. **Phase 1a (live):** selectable, triad spell power, resists, HP tier, mana, themed starter kit. **Phase 1b (planned):** signature active abilities, the offensive half of the triangle, optional intra-triad sub-specialization, and a fix so Ars Nouveau elemental spells respect the resistance triangle.

### Class Details (updated 2026-03-19)

| Class | Key Passives | KubeJS Mechanic |
|-------|-------------|-----------------|
| Berserker | +15% base melee (Brutal Strikes), +5% ATK/+1 armor (Battle Trance), +10% armor (Thick Skinned), +20% melee below 40% HP (Blood Fury) | — |
| Samurai | +8% speed, +10% attack speed (Bushido), Focus (movement shield up to 10% HP, Vorpal I-V by tier) | `class_passives.js` |
| Battlemage | +15% melee/+15% magic (Arcane Strikes), +2 armor (Spell Armor), Mana Shield (Resistance I-III scaling with magic bonuses), **Arcane Cleave** (+1 melee AD per 50% bonus spell power, costs 10 mana/hit), **Mana Reaver** (+15 mana per melee kill) | `battlemage_mana_shield.js`, `battlemage_arcane_cleave.js` |
| Wanderer | +5% ATK/speed/atkspd (Jack of All Trades), +10% XP (Wanderlust), Seasoned Traveler (+5% XP/+2.5% speed per dimension visited) | `class_passives.js` |
| Paladin | +3 armor/+1 toughness (Holy Armor), +10% KB resist, Healing Aura (0.5 HP/5s to allies in 8 blocks, 1 HP/5s self above 50%) | `class_passives.js` |
| Vanguard | +6 armor/+3 toughness (Fortress), +40% KB resist (Immovable), -15% damage (Damage Penalty), Guardian's Presence (Weakness I to mobs in 5 blocks) | `class_passives.js` |
| Ranger | +15% speed, +10% atkspd, +20% projectile damage, -3 armor | — |
| Archmage | +50% magic (Arcane Supremacy), -25% melee + tier-scaling magic amp T1:0%→T4:+15% (Mana Attunement), -4 armor/-2 toughness | `class_passives.js` |
| Artificer | +15% mining, +10% atkspd, +10% ore drops, Speed I near crafting tables | — |
| Void Summoner | +15% tamed damage (Dark Pact), +10% ATK in dark (Shadow Cloak), Soul Tether (5% lifesteal/10% XP from nearby mob deaths) | `class_passives.js` |

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
| Orc | +10% attack speed, +20% HP, +10% melee damage, Bloodlust (+20% damage scaling with hunger) | +50% hunger drain |
| Halfling | +20% food efficiency | — |
| Faefolk | +30% magic damage, +10% mana regen, +10% speed, slow fall | -30% melee damage, -50% armor toughness when wearing any non-light armor (full robes bypass), -15% HP |
| Revenant | +20% damage + Resistance I in darkness/Abyss, Night Vision 1.1 | Weakness+slowness in sunlight, -20% healing |
| Demi-God | +40% HP (8 hearts), 2x raw meat healing, strength ability, phase ability, fire damage 1.5x | Mild Nether weakness |
| Ryu | 25% damage reduction, slow fall, draconic food healing, sparkles, clears debuffs | Meat preference |
| Fallen Angel | +15% all damage, slow fall, velocity dash, translucent | -20% HP (4 hearts), meat preference |
| Kirin | +0.1 movement speed, wall climbing, sprint jump, cat vision, speed boost | -20% HP (4 hearts) |

Notable fixes: Orc knockback double-apply bug fixed. Halfling food efficiency now functional. Revenant healing penalty now functional.

## Origin System (Overhauled 2026-03-17, expanded 2026-03-30)

Uses 9 vanilla origins + 4 custom origins = 13 total (no Mundane, no Human). The vanilla `origins:human` has been removed to avoid overlap with the custom Human race. Origins are ungated — early flight from Origins is intentional.

**Design philosophy:** No lethal environmental effects. Food preferences, not restrictions. Tradeoffs should be interesting, not punishing. Elytra flight reserved for Elytrian. Each heart = 5% HP.

### Origin Details (updated 2026-03-30)

| Origin | Key Powers | Changes from Vanilla |
|--------|-----------|---------------------|
| Arachnid | Wall climbing, cobweb immunity | Unchanged |
| Avian | Sky Affinity: altitude buffs at Y=80 and Y=150 | "Fresh air" replaced with Sky Affinity |
| Blazeborn | Fire immunity, Nether Affinity (+10/20% damage in Nether) | Water damage→discomfort, Nether Spawn→Nether Affinity |
| Elytrian | Elytra flight, launch ability | Unchanged |
| Enderian | Teleport, Ender Shift (+15% damage after teleport) | New Ender Shift power added |
| Feline | Cat-like abilities, night vision | -20% HP added as tradeoff |
| Merling | Underwater breathing, aqua affinity | Suffocation→land discomfort after 5 min dry |
| Phantom | Phasing, invisibility, half health, **Spectral Undeath** | Sunlight burn→weakness+slowness. Never dies — locks to 0.5 hearts + 5min debuffs instead (`phantom_undeath.js`) |
| Shulk | Hardened Shell (50% death durability reduction), +20% mining speed | Extra inventory→Hardened Shell |
| Witch of Ink | Pure passive hyperscaler. 50% food reduction, 20% less HP, fire weakness. Boss-kill counter (max 200): Apotheosis/Champions +1, dimensional bosses +10. **Per counter: +0.1% TOTAL damage** (applied multiplicatively to final damage via LivingHurtEvent — affects melee, ranged, and all magic) **+ +0.1 armor toughness ADD_VALUE**. Caps at +20% damage / +20 toughness at counter=200. **Capstone (Blessing of Penthesilea, at 200):** +10% additive total damage (final = 1.30× at cap), +15% SP-to-AD conversion (15% of `spell_power - 1.0` adds to outgoing damage), +15% max HP, **permanent Haste I + Resistance I + Fire Resistance + Regeneration I** (renewed every 2 minutes). All paint actives stripped 2026-03-30. Tracker: `/icraft witch_status`. | Custom origin. Hyperscaling fantasy — weak early, monster late (`witch_of_ink_progression.js`) |
| Artificial Construct | 25% food efficiency from normal food. Iron Ingot right-click eats 1 ingot → +1 food + Regen III for 10s; Iron Block eats 1 block → +9 food + 4.5 saturation + Regen III. Iron-consumed counter unlocks 5 upgrade levels at thresholds 1000 / 2000 / 4000 / 8000 / 16000 iron. **Per-level bonuses (cumulative on max_health and attack_damage as MULTIPLY_BASE; on armor and armor_toughness as ADD_VALUE × 4):** +5% (L1) → +10% (L2) → +15% (L3) → +25% (L4) → **+35% (L5)**. **Capstone (Iron Apotheosis, unlocked at L5):** additional +25% HP MULTIPLY_BASE + +25% melee damage MULTIPLY_BASE + +1.0 armor toughness ADD_VALUE on top of the L5 totals. Tracker: `/icraft construct_status`. | Custom origin. Hyperscaling fantasy — back-loaded power curve (`artificial_construct_progression.js`) |
| Witherborn | DOT melee fighter. Wither on hit, hunger-based damage penalty. | Custom origin. Decay-themed attacker with sustain tradeoff |
| Slimebodied | Food management tank. 5% food efficiency, satiety damage reduction. | Custom origin. Tanky through food sustain mechanics |

### Custom Items

| Item | Source | Mechanic |
|------|--------|----------|
| Compass of Return | 2.5% in cave/structure chests (T1), craftable T2 | Right-click teleports to last bed, 10min CD (`compass_of_return.js`) |

### Magic Damage Sync

`puffish_attributes:magic_damage` is set by Origins powers but not read by magic mods. The magic damage sync in `skill_effects.js` detects Archmage/Battlemage/Faefolk/Elf origins and pushes bonuses to both `ars_nouveau:spell_damage` and `irons_spellbooks:spell_power`.

All power descriptions updated to match new implementations.

## Related Pages

- [Master Design Document](../design/master.md) — Part III: Class & Race System, Part IV: Skill Trees
- [Progression](../progression/overview.md) — Tier system context
- [Systems](../systems/overview.md) — Death penalty interaction with glass cannons
