# Classes, Races & Origins Overview

Five layered character systems shape a player's build. The first three appear as prompts, one after another, on first join.

## Systems

| System | Layer | Role | When Active |
|--------|-------|------|-------------|
| Origins (vanilla + icraft) | Origin | Flavor powers: unique abilities and tradeoffs (13 origins, no Human) | Character creation prompt 1 |
| Origins (icraft) | Race | 11 custom races: stat modifiers and thematic flavor | Character creation prompt 2 |
| Iridescent Classes (icraft) | Class | 13 combat roles: playstyle, HP tier, glass cannon | Character creation prompt 3 |
| Pufferfish's Skills (+ AStages bridge) | - | Skill Points: stat investment trees | Earned through progression |
| Iridescent Aptitudes (the pack's JustLevelingFork) | - | Passive stat scaling via XP leveling | Always active |

## Three-Prompt Character Creation

On first join, players choose in order:
1. Origin (13 origins, no Human): flavor powers (e.g., Arachnid wall climbing, Blazeborn fire immunity, Merling underwater breathing, Witch of Ink passive hyperscaling, Artificial Construct iron eating, Witherborn DOT melee, Slimebodied food tank)
2. Race (11 custom): an IridescentCraft race with stat bonuses/penalties (Human, Elf, Dwarf, Orc, Halfling, Faefolk, Revenant, Demi-God, Ryu, Fallen Angel, Kirin)
3. Class (13 custom): combat role (Berserker, Samurai, Battlemage, the Trinity mages, etc.)

The vanilla `origins:human` was removed so it would not overlap with the custom Human race.

## 13 Classes

| Class | Role | HP Tier | Equipment HP |
|-------|------|---------|-------------|
| Berserker | Melee DPS | Standard (-5%) | Full |
| Samurai | Melee/Ranged Hybrid | Standard (+5%) | Full |
| Battlemage | Melee/Magic Hybrid | Standard (+5%) | Full |
| Wanderer | Hybrid Multiclass | Standard (+5%) | Full |
| Paladin | Tank/Support/Healer | High (+10%) | Full |
| Vanguard | Pure Tank | Highest (+20%) | Full |
| Ranger | Ranged DPS | Low (-20%) | Halved (glass cannon) |
| Archmage | Offensive Caster | Low (-20%) | Halved (glass cannon) |
| Artificer | Crafter/Non-Combat | Standard | Full |
| Void Summoner | Summoner/Necromancer | Low (-10%) | Halved (glass cannon) |
| Elemental (Stormcaller) | Magic specialist: fire/ice/lightning burst | Low (-20%) | Halved (glass cannon) |
| Blessed (Hierophant) | Magic specialist: holy/nature/evocation sustain/support | High (+10%) | Full |
| Corrupted (Hollow) | Magic specialist: blood/ender/eldritch attrition/lifesteal | Low (-10%) | Full |

### Trinity Mages (added 2026-06-14, Phase 1a)

Three magic specialists that reverse the Archmage's generalist bargain: each is exceptional in three Iron's Spellbooks schools and weak in the other six (depth over breadth). They form a rock-paper-scissors triangle, and each out-damages the Archmage *within* its triad while falling behind in the other schools.

| Mage | Schools (+80% spell power each) | Role | HP | Strong vs / Weak vs |
|------|--------------------------------|------|----|---------------------|
| Elemental | fire · ice · lightning | Burst/AoE artillery, glass cannon | Low (-20%, halved) | beats Blessed / loses to Corrupted |
| Blessed | holy · nature · evocation | Sustain/support, anti-undead | High (+10%) | beats Corrupted / loses to Elemental |
| Corrupted | blood · ender · eldritch | DoT/lifesteal attrition | Low (-10%) | beats Elemental / loses to Blessed |

Each also has a generic `spell_power 1.40`, per-mage identity stats (Elemental: crit; Blessed: healing + magic resist; Corrupted: lifesteal + cooldown + armor-pen), a 2× mana pool, edge resistances in its winning matchup and a vulnerability in its losing one, all built on Iron's Spellbooks' per-school `*_spell_power` / `*_magic_resist` attributes. Phase 1a (live): selectable, triad spell power, resists, HP tier, mana, themed starter kit. Phase 1b (planned): signature active abilities, the offensive half of the triangle, optional intra-triad sub-specialization, and a fix so Ars Nouveau elemental spells respect the resistance triangle.

### Class Details (updated 2026-03-19)

| Class | Key Passives | KubeJS Mechanic |
|-------|-------------|-----------------|
| Berserker | +15% base melee (Brutal Strikes), +5% ATK/+1 armor (Battle Trance), +10% armor (Thick Skinned), +20% melee below 40% HP (Blood Fury) | - |
| Samurai | +8% speed, +10% attack speed (Bushido), Focus (a movement shield up to 10% of max HP, 10 s to recharge after it breaks), Vorpal (Strength I at tier 1 up to Strength IV at tier 4, by passive tier*) | `class_passives.js` |
| Battlemage | +10% melee/+15% magic (Arcane Strikes), +2 armor (Spell Armor), Mana Shield (Resistance I, Resistance II for a Faefolk), Arcane Cleave (+1 melee AD per 50% bonus spell power, costs 10 mana/hit), Mana Reaver (+15 mana per melee kill) | `battlemage_mana_shield.js`, `battlemage_arcane_cleave.js` |
| Wanderer | +5% ATK/speed/atkspd (Jack of All Trades), +10% XP (Wanderlust), Seasoned Traveler (+5% XP/+2.5% speed per dimension visited) | `class_passives.js` |
| Paladin | +3 armor/+1 toughness (Holy Armor), +10% KB resist, Healing Aura (0.5 HP/5s to allies in 8 blocks, 1 HP/5s self above 50%) | `class_passives.js` |
| Vanguard | +6 armor/+3 toughness (Fortress), +40% KB resist (Immovable), -30% melee damage (Pacifist's Burden), Guardian's Presence (Weakness I to mobs in 5 blocks) | `class_passives.js` |
| Ranger | +15% speed, +10% atkspd, +20% projectile damage, -15% armor | - |
| Archmage | +50% magic damage (Arcane Supremacy), -50% melee (Frail Melee), +5% spell power per passive tier above 1, T1:0%→T4:+15%* (Mana Attunement), mana pool 2.5x (Mana Reservoir +150%), -28.6% armor / -20% toughness (Frail Frame) | `class_passives.js` |
| Artificer | +15% mining, +10% atkspd, Speed I near crafting tables | - |
| Void Summoner | +15% damage by tamed animals and Iron's Spells summons (Dark Pact), +10% melee damage in darkness, light level 9 or lower, no penalty in light (Shadow Cloak), Soul Tether (each mob that dies within 16 blocks heals you 5% of its max health, up to 1 heart, and gives +1 XP) | `class_passives.js` |

\* Passive tier is the highest tier of dimension the player has entered, and it never goes down: Tier 2 for the Twilight Forest, Everbright and Everdawn; Tier 3 for the Nether, the Undergarden, the Otherside, the Abyss and its Frost World; Tier 4 for the End, the Aether, the five Ad Astra planets and their six orbits, and the Reality Marble. The Overworld and the two pocket dimensions do not raise it. It is separate from the Codex tier you buy with tokens (as of 2026-10-17).

### Glass Cannon Mechanic

Ranger, Archmage, Void Summoner and Elemental have their equipment HP bonus halved. `equipment_hp_halving.js` enforces this with an attribute modifier, and the Origins class power JSONs tag these classes automatically through `glass_cannon_tag.json`.

### Class Respec

Implemented in `class_respec.js`: a Class Altar item with 3 recipe variants (one per tier boss material). It consumes the boss trophy in your off hand and 30 levels, then triggers the Origins class selection again.

## Estimated Tier 4 Power

| Stat | Glass Cannon | Hybrid | Tank |
|------|-------------|--------|------|
| Max HP | 80-120 (40-60 hearts) | 140-180 (70-90 hearts) | 220-300 (110-150 hearts) |
| Effective HP (after DR) | 160-300 | 350-540 | 700-1200 |
| Damage Per Hit | 50-90 | 40-65 | 25-45 |
| DPS (sustained) | 80-140 | 60-100 | 30-55 |

## Skill Trees (Pufferfish's Skills)

6 trees, each with a trunk and 2 branches:

1. Warfare: melee combat (Berserker's Path / Duelist's Path)
2. Marksman: ranged combat (Sniper's Path / Volley Path)
3. Sorcery: magic combat (Destruction Path / Enchanter's Path)
4. Fortitude: defense and survival (Iron Wall / Survivor's Path)
5. Gathering: resource collection (Prospector's Path / Harvester's Path)
6. Engineering: crafting and tech (Artificer's Path / Engineer's Path)

### Implementation Status

All 22 scoreboard objectives are now functional (updated 2026-03-15):
- 10 fully functional effects (native KubeJS event hooks)
- 4 attribute-proxied (mapped to Iron's Spells attributes)
- 2 approximated (closest viable mechanic)
- 6 Engineering effects (previously placeholders, now fully working)

## Race System

The 11 custom races are an Origins layer in the `icraft` namespace. Races give stat modifiers and a thematic identity, separate from the origin selection.

### Race Details (updated 2026-03-19)

| Race | Bonuses | Penalties |
|------|---------|-----------|
| Human | +10% XP from all sources | None (baseline) |
| Elf | +15% ranged damage, +5% magic damage | -10% armor toughness, faster hunger drain |
| Dwarf | +15% mining speed, +2 armor toughness, fire damage halved, mining hunger offset by Saturation | -5% movement speed |
| Orc | +10% attack speed, +20% HP, +10% melee damage, Bloodlust (+20% damage scaling with hunger) | +50% hunger drain |
| Halfling | +1 luck, +20% hunger and saturation from food | -5% attack damage |
| Faefolk | +30% magic damage, +10% mana regen, +10% speed, slow fall | -30% melee damage, -50% armor toughness when wearing any non-light armor (full robes bypass), -15% HP |
| Revenant | +20% attack damage at light level 9 or lower or in the Abyss, Resistance I at light level 4 or lower or in the Abyss, night vision | Weakness and Slowness in sunlight without a helmet, 20% less from food |
| Demi-God | +40% HP (4 hearts), 2x nourishment from raw meat, strength ability, phase ability | Fire damage 1.5x, Weakness in the Nether |
| Ryu | 25% damage reduction, +4 max HP, slow fall, heals while well fed, clears Poison, Slowness and Weakness within seconds, Dragon's Sight (nearby creatures glow) | Meat preference, healing potions half as effective |
| Fallen Angel | +15% all damage, permanent Strength I, slow fall, a dash (Dark Expulsion), a wither-skull shot, immune to Wither, Poison, Instant Damage and Nausea | -20% HP (2 hearts), non-meat food gives half, slowed with a block right above the head, extra fire damage |
| Kirin | +0.1 movement speed (twice the base), wall climbing, sprint jump, cat vision, Speed II for 12 s on a 60 s cooldown, a pounce | -10% HP (1 heart), faster hunger |

Notable fixes: the Orc knockback double-apply bug is fixed, Halfling food efficiency now works, and the Revenant healing penalty now works.

## Origin System (Overhauled 2026-03-17, expanded 2026-03-30)

There are 9 vanilla origins + 4 custom origins = 13 total (no Mundane, no Human). The vanilla `origins:human` was removed so it would not overlap with the custom Human race. Origins are ungated, and early flight from Origins is intentional.

Design philosophy: no environmental effect is lethal, food comes as preferences rather than restrictions, and tradeoffs should be interesting without being punishing. Elytra flight is reserved for the Elytrian. Each heart = 5% HP.

### Origin Details (updated 2026-03-30)

| Origin | Key Powers | Changes from Vanilla |
|--------|-----------|---------------------|
| Arachnid | Wall climbing, cobweb immunity | Unchanged |
| Avian | Sky Affinity: altitude buffs at Y=80 and Y=150 | "Fresh air" replaced with Sky Affinity |
| Blazeborn | Fire immunity, Nether Affinity (+10/20% damage in Nether) | Water damage→discomfort, Nether Spawn→Nether Affinity |
| Elytrian | Elytra flight, launch ability | Unchanged |
| Enderian | Teleport, Ender Shift (+15% damage after teleport) | New Ender Shift power added |
| Feline | Cat-like abilities, night vision | -10% HP (1 heart) |
| Merling | Underwater breathing, aqua affinity | Suffocation→land discomfort after 5 min dry |
| Phantom | Phasing, invisibility, 3 fewer hearts, Spectral Undeath | Sunlight burn→weakness+slowness. Cheats death: a lethal hit locks it to 0.5 hearts + 5min debuffs instead, and a death while they last is final (`phantom_undeath.js`) |
| Shulk | Hoarder (9 extra inventory slots whose items are kept on death), natural armor, breaks natural stone without a pickaxe | Cannot hold a shield; large appetite |
| Witch of Ink | Pure passive hyperscaler. 50% food reduction, 20% less HP, fire weakness. Boss-kill counter (max 200): Apotheosis bosses +1, dimensional bosses +10. Per counter: +0.1% total damage (applied multiplicatively to final damage via LivingHurtEvent, so it affects melee, ranged and all magic) and -0.1% damage taken. Caps at +20% damage / -20% damage taken at counter=200. Capstone (Blessing of Penthesilea, at 200): +10% additive total damage (final = 1.30× at cap), +15% SP-to-AD conversion (15% of `spell_power - 1.0` adds to outgoing damage), +15% max HP, permanent Haste I + Resistance I + Fire Resistance + Regeneration I (renewed every 2 minutes). All paint actives stripped 2026-03-30. Tracker: `/icraft witch_status`. | Custom origin. Hyperscaling fantasy: weak early, monster late (`witch_of_ink_progression.js`) |
| Artificial Construct | 25% food efficiency from normal food. Right-clicking an Iron Ingot eats 1 ingot for +1 food and Regen III for 10s; an Iron Block eats 1 block for +9 food, 4.5 saturation and Regen III. A counter of iron consumed unlocks 5 upgrade levels at thresholds 1000 / 2000 / 4000 / 8000 / 16000 iron. Per-level bonuses (cumulative on max_health and attack_damage as MULTIPLY_BASE; on armor and armor_toughness as ADD_VALUE × 4): +5% (L1) → +10% (L2) → +15% (L3) → +25% (L4) → +35% (L5). Capstone (Iron Apotheosis, unlocked at L5): an additional +25% HP MULTIPLY_BASE, +25% melee damage MULTIPLY_BASE and +1.0 armor toughness ADD_VALUE on top of the L5 totals. Tracker: `/icraft construct_status`. | Custom origin. Hyperscaling fantasy: back-loaded power curve (`artificial_construct_progression.js`) |
| Witherborn | DOT melee fighter. Wither on hit, hunger-based damage penalty. | Custom origin. Decay-themed attacker with sustain tradeoff |
| Slimebodied | Food management tank. 5% food efficiency, satiety damage reduction. | Custom origin. Tanky through food sustain mechanics |

### Custom Items

| Item | Source | Mechanic |
|------|--------|----------|
| Compass of Return | 2.5% in cave/structure chests (T1), craftable T2 | Right-click teleports to last bed, 10min CD (`compass_of_return.js`) |

### Magic damage and spell power

Two kinds of magic bonus, each counted once:

- Magic damage (`puffish_attributes:magic_damage`): Arcane Supremacy (+50%), Faefolk (+30%), Elf (+5%) and the Sorcery tree's Magic Damage nodes. It multiplies every Iron's Spells hit you deal (all nine schools) and vanilla magic damage (harming potions). It does not reach Ars Nouveau spells. Its value reads as "NaN" in attribute lists, which is normal for this attribute: it is worked out per hit.
- Spell power (`irons_spellbooks:spell_power`): Mana Attunement (+5% a tier) and the Magic aptitude skills (Mana Spark +5%, Mana Blaze +15%, Mana Inferno +30%). It multiplies an Iron's spell's own power, heals and shields included.

Until 2026-10-17 a "magic damage sync" also copied the Origins bonuses onto spell power, and Mana Attunement and the three skills sat on both attributes, so an Iron's spell got each of those bonuses twice. That sync is gone.

All power descriptions are updated to match the new implementations.

## Related Pages

- [Master Design Document](../design/master.md): Part III (Class & Race System) and Part IV (Skill Trees)
- [Progression](../progression/overview.md): tier system context
- [Systems](../systems/overview.md): death penalty interaction with glass cannons
