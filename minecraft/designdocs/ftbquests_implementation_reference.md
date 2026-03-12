# FTB Quests Implementation Reference
## IridescentCraft — Complete Quest Specification

> **Build guide for FTB Quests GUI editor.** Every quest listed here needs to be created
> in-game. Gate quests use command rewards to trigger AStages advancement.

---

## Chapters Overview

| Chapter | Color | Icon | Purpose |
|---------|-------|------|---------|
| Welcome | White | `minecraft:book` | Tutorial, class/race selection |
| Tier 1: Foundations | Green | `minecraft:wooden_pickaxe` | Overworld progression |
| Tier 2: Expansion | Blue | `minecraft:diamond` | Dimensional exploration |
| Tier 3: Dominion | Purple | `minecraft:nether_star` | Advanced tech/magic |
| Tier 4: Ascension | Gold | `minecraft:dragon_egg` | Endgame, End dimension |
| The Crucible | Red | `minecraft:netherite_sword` | Arena progression |
| Community | Cyan | `minecraft:beacon` | Server milestones |
| Prestige | Black | `minecraft:enchanted_book` | Prestige tracking |
| Class & Skills | Yellow | `minecraft:experience_bottle` | Build guides |

---

## Command Templates

**Tier advancement (gate quest command reward):**
```
/astages add @p tier_2
/astages add @p tier_3
/astages add @p tier_4
```

**Skill point grant (quest command reward):**
```
/puffish_skills points add @p <category> 1
```
> Use "choice reward" to let players pick which tree, OR grant to universal pool.

**Loot box give (quest command reward):**
```
/give @p kubejs:iron_loot_box 1
/give @p kubejs:steel_loot_box 1
/give @p kubejs:tier3_loot_box 1
/give @p kubejs:tier4_loot_box 1
/give @p kubejs:crucible_loot_box 1
/give @p kubejs:mythic_loot_box 1
```

---

## CHAPTER: Welcome (3 skill points)

| Quest | Type | Trigger | Reward |
|-------|------|---------|--------|
| Welcome to the Pack | Manual accept | Read description | Quest book guide |
| Choose Your Race | Detection | Select Origins race | 1 Skill Point |
| Choose Your Class | Detection | Select G&H RPG class | 1 Skill Point |
| First Blood | Detection | Kill any hostile mob | Iron Loot Box |
| Craft a Weapon | Detection | Craft any sword/axe | — |
| Your First Meal | Detection | Eat any food | — |
| Open Your Skills | Detection | Open Pufferfish Skills menu (K) | 1 Skill Point |
| Find a Waystone | Detection | Activate a waystone | — |

---

## CHAPTER: Tier 1 — Foundations (12 skill points max)

### Structure
```
[Path A: Grinding] ──────┐
[Path B: Magic] ──────────┤
[Path C: Boss] ───────────┼──→ [TIER 2 GATE] ──→ Tier 2 unlocked
[Path D: Exploration] ────┤
[Path E: Engineering] ────┘
```
Complete ANY ONE path → gate quest unlocks.

### Path A: Grinding (Resource Gathering)

| Quest | Trigger | Reward |
|-------|---------|--------|
| Iron Age | Obtain 64 iron ingots | Iron Loot Box |
| Copper Collection | Obtain 64 copper ingots | Iron Loot Box |
| Bronze Forging | Craft 32 bronze ingots (Create alloy) | 1 Skill Point |
| Bulk Production | Have 192 of any single ingot type | Iron Loot Box |
| Stockpile | Have 10 different material types in storage | Iron Loot Box |
| Industrial Scale | Produce 512 total ingots (any combo) | 1 Skill Point |
| **Path Complete: Material Master** | All above | Tier 1 Loot Box + 1 Skill Point |

### Path B: Magic (Spellcasting & Mana)

| Quest | Trigger | Reward |
|-------|---------|--------|
| Mana Spark | Create a Botania Mana Pool | Iron Loot Box |
| First Spell | Cast any Iron's Spells spell | Iron Loot Box |
| Floral Arrangement | Create 5 different Botania functional flowers | 1 Skill Point |
| Spellbook | Craft an Iron's Spells spellbook | Iron Loot Box |
| Mana Network | Have 3+ Mana Pools + Mana Spreaders | 1 Skill Point |
| Spell Repertoire | Learn 5 different spells | Iron Loot Box |
| **Path Complete: Apprentice Mage** | All above | Tier 1 Loot Box + 1 Skill Point |

### Path C: Boss (Combat)

| Quest | Trigger | Reward |
|-------|---------|--------|
| Armed and Ready | Craft full iron+ armor set | Iron Loot Box |
| Monster Hunter | Kill 100 hostile mobs | 1 Skill Point |
| Champion Slayer | Kill first Champion mob | Iron Loot Box |
| Mini-Boss Down | Kill any OW mini-boss (dungeon/Apotheosis boss) | 1 Skill Point |
| **Path Complete: Proven Warrior** | All above | Tier 1 Loot Box + 1 Skill Point |

### Path D: Exploration

| Quest | Trigger | Reward |
|-------|---------|--------|
| Wanderer | Visit 5 different biomes | Iron Loot Box |
| Dungeon Delver | Enter any dungeon structure | Iron Loot Box |
| Dungeon Cleared | Reach final loot chest of a dungeon | 1 Skill Point |
| Cartographer | Visit 10 different biomes | 1 Skill Point |
| Structure Hunter | Find 5 different structure types | Iron Loot Box |
| **Path Complete: Explorer** | All above | Tier 1 Loot Box + 1 Skill Point |

### Path E: Engineering (Automation)

| Quest | Trigger | Reward |
|-------|---------|--------|
| First Machine | Place any Create mechanical component | Iron Loot Box |
| Rotation | Create a Create rotation source (windmill/waterwheel) | Iron Loot Box |
| Assembly Line | Set up Create mechanical crafting/mixing | 1 Skill Point |
| Pretty Pipes | Craft and connect 3+ Pretty Pipes | Iron Loot Box |
| Automated Processing | Automate ore→ingot (no player input) | 1 Skill Point |
| **Path Complete: Engineer** | All above | Tier 1 Loot Box + 1 Skill Point |

### Tier 2 Gate Quest

| Quest | Trigger | Reward |
|-------|---------|--------|
| **Tier 2: Expansion Awaits** | Complete ANY ONE path | `/astages add @p tier_2` + 1 Skill Point + Tier 2 Loot Box |

### Bonus Rewards (Multiple Path Completion)

| Paths Done | Bonus |
|------------|-------|
| 2 paths | +1 Skill Point + Tier 1 Loot Box |
| 3 paths | +1 Skill Point + Tier 1 Loot Box |
| 4 paths | +2 Skill Points + Tier 2 Loot Box |
| All 5 paths | +2 Skill Points + Tier 2 Loot Box + Title: "Renaissance" |

---

## CHAPTER: Tier 2 — Expansion (~20 skill points)

### Path A: Grinding

| Quest | Trigger | Reward |
|-------|---------|--------|
| Steel Production | Craft 64 steel ingots | Steel Loot Box |
| Manasteel Forging | Craft 32 manasteel ingots | Steel Loot Box |
| Thermal Processing | Set up Pulverizer + Redstone Furnace | 1 Skill Point |
| Mass Production | 1024 total ingots (T2 materials) | 1 Skill Point |
| Dimensional Harvest | Collect materials from 2+ T2 dimensions | Steel Loot Box |
| **Path Complete** | All above | Tier 2 Loot Box + 1 Skill Point |

### Path B: Magic

| Quest | Trigger | Reward |
|-------|---------|--------|
| Ars Nouveau Initiate | Craft Ars Nouveau spellbook | Steel Loot Box |
| Advanced Botania | Create a Terrasteel ingot | 1 Skill Point |
| Spell Customization | Create Ars spell with 3+ augments | Steel Loot Box |
| Terra Blade | Craft Botania Terra Blade | 1 Skill Point |
| Mana Mastery | Generate 100,000 mana (Botania) | Steel Loot Box |
| **Path Complete** | All above | Tier 2 Loot Box + 1 Skill Point |

### Path C: Boss

| Quest | Trigger | Reward |
|-------|---------|--------|
| Twilight Awakening | Kill Twilight Forest Naga | Steel Loot Box |
| Lich King | Kill Twilight Forest Lich | 1 Skill Point |
| Hydra Slayer | Kill Twilight Forest Hydra | Steel Loot Box |
| Ur-Ghast | Kill Twilight Forest Ur-Ghast | 1 Skill Point |
| Cross-Dimensional Champion | Kill Champions in 2+ T2 dimensions | Steel Loot Box |
| **Path Complete** | All above | Tier 2 Loot Box + 1 Skill Point |

### Path D: Exploration

| Quest | Trigger | Reward |
|-------|---------|--------|
| Twilight Tourism | Visit 5 Twilight Forest biomes | Steel Loot Box |
| Sky Explorer | Visit 3 Blue Skies biomes | Steel Loot Box |
| Aether Pioneer | Visit 3 Aether biomes | 1 Skill Point |
| Dimensional Dungeons | Clear dungeon in 2+ T2 dimensions | 1 Skill Point |
| All Three Realms | Enter TF + BS + Aether | Steel Loot Box |
| **Path Complete** | All above | Tier 2 Loot Box + 1 Skill Point |

### Path E: Engineering

| Quest | Trigger | Reward |
|-------|---------|--------|
| Thermal Foundation | Build Dynamo + 3 Thermal machines | Steel Loot Box |
| Industrial Start | Place Industrial Foregoing machine | Steel Loot Box |
| Power Grid | Generate 10,000 RF/tick | 1 Skill Point |
| Cross-Mod Automation | Use 2+ tech mods in one automation chain | 1 Skill Point |
| Smart Storage | Storage system with 100+ unique items | Steel Loot Box |
| **Path Complete** | All above | Tier 2 Loot Box + 1 Skill Point |

### Tier 3 Gate Quest

| Quest | Trigger | Reward |
|-------|---------|--------|
| **Tier 3: Dominion Calls** | Complete ANY ONE T2 path | `/astages add @p tier_3` + 1 Skill Point + Tier 3 Loot Box |

Bonus rewards: same scaling structure as Tier 1.

---

## CHAPTER: Tier 3 — Dominion (~20 skill points)

### Path Themes (abbreviated — same 5-path structure)

| Path | Key Quests |
|------|------------|
| A: Grinding | Diamond automation, Enderium production, 2048+ T3 ingots |
| B: Magic | Occultism spirit binding, F&A rituals, Ars Nouveau master spells |
| C: Boss | Harbinger kill, Ignis kill, Wither kill, Meet Your Fight bosses |
| D: Exploration | Undergarden full, Deeper Darker explore, Nether (fortress+bastion+city) |
| E: Engineering | Mekanism basic, Refined Storage network, IF Laser Drill, XNet controller |

### Tier 4 Gate Quest

| Quest | Trigger | Reward |
|-------|---------|--------|
| **Tier 4: Ascension Begins** | Complete ANY ONE T3 path | `/astages add @p tier_4` + 1 Skill Point + Tier 4 Loot Box |

---

## CHAPTER: Tier 4 — Ascension (~15 skill points)

### Path Themes

| Path | Key Quests |
|------|------------|
| A: Grinding | Netherite automation, Gaia ingot, antimatter generation |
| B: Magic | Mahou Tsukai mastery, Gaia Guardian prep, ultimate spells |
| C: Boss | Ender Dragon, Gaia Guardian, Cataclysm endgame bosses |
| D: Exploration | Deep Aether full, End multi-zone, all Moog's End Structures |
| E: Engineering | Mekanism Fusion Reactor, QIO network, MekaTool/Mekasuit |

### Endgame Unlocks

| Quest | Trigger | Reward |
|-------|---------|--------|
| The Crucible Awaits | ANY ONE T4 path + Dragon kill | Crucible Key recipe + 2 Skill Points |
| Prestige Eligible | Complete ALL T4 requirements | Prestige option unlocked |

---

## CHAPTER: The Crucible (5 skill points)

| Quest | Trigger | Reward |
|-------|---------|--------|
| Enter the Crucible | Complete any Crucible run | Crucible Loot Box |
| Wave 10 | Clear Wave 10 | 1 Skill Point + Crucible Loot Box |
| Wave 25 | Clear Wave 25 | 1 Skill Point + Crucible Loot Box |
| Wave 50 | Clear Wave 50 | 1 Skill Point + Mythic Loot Box |
| Wave 75 | Clear Wave 75 | Mythic Loot Box |
| Wave 100 | Clear Wave 100 | 1 Skill Point + Mythic Loot Box + Cosmetic |
| Challenge Dimension I | Complete Difficulty 10+ Challenge Dim | 1 Skill Point |

---

## CHAPTER: Community (0 skill points — server buffs)

| Quest | Trigger | Server Reward |
|-------|---------|---------------|
| Dragon Slayers I | 10 server Ender Dragon kills | +5% End loot |
| Dragon Slayers II | 50 kills | +10% End loot |
| Champion Hunters I | 1,000 Champions killed | +10% Champion drops |
| Industrial Revolution | 1,000,000 RF generated | +5% machine speed |

---

## Skill Point Budget

| Source | Points | Cumulative |
|--------|--------|------------|
| Welcome | 3 | 3 |
| Tier 1 (all paths + bonuses) | 12 | 15 |
| Tier 2 (all paths + bonuses) | 20 | 35 |
| Tier 3 (all paths + bonuses) | 20 | 55 |
| Tier 4 (all paths + bonuses) | 15 | 70 |
| Crucible / Endgame | 5 | 75 |
| **TOTAL** | **75** | |

- **Speedrun (1 path/tier):** ~26 points → 2 trees, 1 branch each
- **Completionist (all paths):** 75 points → deep investment across 4+ trees

---

## Loot Box Contents (implement as KubeJS loot table items)

### Iron Loot Box (Tier 1)
| Drop | Weight | Examples |
|------|--------|----------|
| Iron/copper gear | 30% | Iron sword, chestplate, copper tools |
| Basic materials (16-32) | 25% | Iron, copper, coal, redstone |
| Common Apotheosis affix gear | 15% | Iron-tier + 1 Common affix |
| Food variety pack | 15% | 5-8 foods (Spice of Life helper) |
| Basic enchanted book | 10% | Level 1-2 enchants |
| Flawed gem | 5% | Random Apotheosis flawed gem |

### Steel Loot Box (Tier 2)
| Drop | Weight | Examples |
|------|--------|----------|
| Steel/manasteel gear | 25% | Steel sword, manasteel armor |
| T2 materials (16-32) | 20% | Steel, manasteel, steeleaf, ironwood |
| Uncommon/Rare affix gear | 20% | Steel-tier + Uncommon/Rare affix |
| Enchanted book (2-4) | 15% | Mid-tier enchants |
| Dimensional food pack | 10% | 5-8 T2 dimension foods |
| Chipped/Normal gem | 10% | Random Apotheosis gem |

### Tier 3 Loot Box
| Drop | Weight | Examples |
|------|--------|----------|
| Diamond/terrasteel gear | 20% | Diamond, terrasteel, enderium |
| T3 materials (8-16) | 20% | Diamond, terrasteel, enderium, osmium |
| Rare/Epic affix gear | 25% | Diamond-tier + Rare/Epic affix |
| Enchanted book (3-5) | 15% | Higher-tier enchants |
| Flawless gem | 10% | Random Apotheosis flawless gem |
| Boss material (1-2) | 10% | Random boss drop material |

### Tier 4 Loot Box
| Drop | Weight | Examples |
|------|--------|----------|
| Netherite gear | 15% | Netherite armor/weapons |
| T4 materials (4-8) | 15% | Netherite, gaia fragments, antimatter |
| Epic/Mythic affix gear | 25% | Netherite-tier + Epic/Mythic affix |
| Enchanted book (5-8) | 15% | High-level enchants |
| Perfect gem | 10% | Random Apotheosis perfect gem |
| Boss material (2-4) | 10% | Random boss materials |
| Simply Swords chance | 5% | Random unique weapon |
| XP cache (500 XP) | 5% | Large XP orb |
