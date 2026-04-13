# FTB Quests Structure Template — IridescentCraft

> **Purpose:** Complete checklist for building the quest book in the in-game FTB Quests editor.
> Every quest is listed with detection type, detection value, reward commands, dependencies, and required/optional status.
> Work through each chapter top-to-bottom. Tick off quests as you create them.

---

## Command Reference

| Action | Command Syntax |
|--------|---------------|
| Tier unlock | `/astages add @p tier_2` (or `tier_3`, `tier_4`) |
| Skill point (universal) | `/puffish_skills points add @p <category> <amount>` |
| Iron Loot Box | `/give @p kubejs:iron_loot_box 1` |
| Steel Loot Box | `/give @p kubejs:steel_loot_box 1` |
| Tier 3 Loot Box | `/give @p kubejs:tier3_loot_box 1` |
| Tier 4 Loot Box | `/give @p kubejs:tier4_loot_box 1` |
| Crucible Loot Box | `/give @p kubejs:crucible_loot_box 1` |
| Mythic Loot Box | `/give @p kubejs:mythic_loot_box 1` |
| Tier 1 Loot Box | `/give @p kubejs:tier1_loot_box 1` |

**Skill point categories:** `melee`, `ranged`, `defense`, `magic`, `utility`, `survival`
Use "choice reward" in FTB Quests so the player picks which tree gets the point, OR use a universal pool command if available.

---

## Detection Type Key

| Code | Meaning | Value Format |
|------|---------|--------------|
| `item` | Player has item in inventory | `minecraft:iron_ingot` / `modid:item_id` + count |
| `kill` | Kill entity | `modid:entity_id` + count |
| `advancement` | Has advancement | `namespace:path/to/advancement` |
| `dimension` | Visit dimension | `modid:dimension_id` |
| `stat` | Minecraft stat check | `minecraft:custom/minecraft:stat_name` + value |
| `checkmark` | Manual completion | *(player clicks to complete)* |
| `submit` | Submit items (consumed) | `modid:item_id` + count |

---

## Chapter Icons & Colors

| Chapter | Color | Icon Item |
|---------|-------|-----------|
| Getting Started | White | `minecraft:book` |
| Tier 1: Foundations | Green | `minecraft:wooden_pickaxe` |
| Tier 2: Expansion | Blue | `minecraft:diamond` |
| Tier 3: Dominion | Purple | `minecraft:nether_star` |
| Tier 4: Ascension | Gold | `minecraft:dragon_egg` |
| The Crucible | Red | `minecraft:netherite_sword` |
| Side Quests | Orange | `minecraft:compass` |
| Compendium | Black | `minecraft:enchanted_book` |

---

## Chapter 1: Getting Started (Welcome)

> Tutorial chapter. No tier advancement. Pure onboarding. Unlocked from the start.

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 1.1 | Welcome to IridescentCraft | `checkmark` | *(read description)* | Quest book guide text | None | Yes |
| 1.2 | Choose Your Race | `advancement` | `origins:origin_selected` | `/puffish_skills points add @p utility 1` | 1.1 | Yes |
| 1.3 | Choose Your Class | `advancement` | `godsandheroes:class_selected` | `/puffish_skills points add @p utility 1` | 1.1 | Yes |
| 1.4 | First Blood | `kill` | `minecraft:zombie` x1 *(any hostile — use tag `#minecraft:hostile`)* | `/give @p kubejs:iron_loot_box 1` | 1.1 | Yes |
| 1.5 | Craft a Weapon | `item` | `#minecraft:swords` x1 *(any sword)* | *(none — tutorial step)* | 1.1 | Yes |
| 1.6 | Your First Meal | `advancement` | `minecraft:husbandry/eat_something` | *(none — tutorial step)* | 1.1 | Yes |
| 1.7 | Open Your Skills | `checkmark` | *(open Pufferfish Skills menu — press K)* | `/puffish_skills points add @p utility 1` | 1.1 | Yes |
| 1.8 | Find a Waystone | `advancement` | `waystones:activate_waystone` | *(none — tutorial step)* | 1.1 | Optional |

**Chapter total: 3 Skill Points**

---

## Chapter 2: Tier 1 — Foundations (Overworld)

> 5 branching paths, all converging on the Tier 2 Gate quest. Complete ANY ONE path to unlock Tier 2.

### Path A: Grinding (Resource Gathering)

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 2A.1 | Iron Age | `item` | `minecraft:iron_ingot` x64 | `/give @p kubejs:iron_loot_box 1` | 1.1 | Yes (within path) |
| 2A.2 | Copper Collection | `item` | `minecraft:copper_ingot` x64 | `/give @p kubejs:iron_loot_box 1` | 2A.1 | Yes |
| 2A.3 | Bronze Forging | `item` | `create:brass_ingot` x32 | `/puffish_skills points add @p utility 1` | 2A.2 | Yes |
| 2A.4 | Bulk Production | `item` | `minecraft:iron_ingot` x192 *(any single ingot, 3 stacks)* | `/give @p kubejs:iron_loot_box 1` | 2A.3 | Yes |
| 2A.5 | Stockpile | `checkmark` | *(have 10 different material types in storage)* | `/give @p kubejs:iron_loot_box 1` | 2A.4 | Yes |
| 2A.6 | Industrial Scale | `stat` | `minecraft:custom/minecraft:crafted` x512 *(approx — use item detection for 512 mixed ingots)* | `/puffish_skills points add @p utility 1` | 2A.5 | Yes |
| 2A.7 | **Path Complete: Material Master** | `checkmark` | *(auto — all above)* | `/give @p kubejs:tier1_loot_box 1` + `/puffish_skills points add @p utility 1` | 2A.1–2A.6 | Yes |

### Path B: Magic (Spellcasting & Mana)

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 2B.1 | Mana Spark | `item` | `botania:mana_pool` x1 | `/give @p kubejs:iron_loot_box 1` | 1.1 | Yes |
| 2B.2 | First Spell | `item` | `irons_spellbooks:scroll` x1 *(any spell scroll/cast detection)* | `/give @p kubejs:iron_loot_box 1` | 2B.1 | Yes |
| 2B.3 | Floral Arrangement | `checkmark` | *(create 5 different Botania functional flowers)* | `/puffish_skills points add @p magic 1` | 2B.2 | Yes |
| 2B.4 | Spellbook | `item` | `irons_spellbooks:iron_spell_book` x1 | `/give @p kubejs:iron_loot_box 1` | 2B.2 | Yes |
| 2B.5 | Mana Network | `checkmark` | *(3+ Mana Pools connected with Mana Spreaders)* | `/puffish_skills points add @p magic 1` | 2B.3 | Yes |
| 2B.6 | Spell Repertoire | `checkmark` | *(learn 5 different spells)* | `/give @p kubejs:iron_loot_box 1` | 2B.4 | Yes |
| 2B.7 | **Path Complete: Apprentice Mage** | `checkmark` | *(auto — all above)* | `/give @p kubejs:tier1_loot_box 1` + `/puffish_skills points add @p magic 1` | 2B.1–2B.6 | Yes |

### Path C: Boss (Combat)

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 2C.1 | Armed and Ready | `item` | `minecraft:iron_chestplate` x1 *(any full iron+ armor set — 4 detection quests or checkmark)* | `/give @p kubejs:iron_loot_box 1` | 1.1 | Yes |
| 2C.2 | Monster Hunter | `kill` | `#minecraft:hostile` x100 *(use stat: `minecraft:custom/minecraft:mob_kills` >= 100)* | `/puffish_skills points add @p melee 1` | 2C.1 | Yes |
| 2C.3 | Champion Slayer | `advancement` | `champions:kill_champion` *(or KubeJS custom advancement)* | `/give @p kubejs:iron_loot_box 1` | 2C.2 | Yes |
| 2C.4 | Mini-Boss Down | `checkmark` | *(kill any Overworld mini-boss — dungeon boss, Apotheosis boss)* | `/puffish_skills points add @p melee 1` | 2C.3 | Yes |
| 2C.5 | **Path Complete: Proven Warrior** | `checkmark` | *(auto — all above)* | `/give @p kubejs:tier1_loot_box 1` + `/puffish_skills points add @p melee 1` | 2C.1–2C.4 | Yes |

### Path D: Exploration

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 2D.1 | Wanderer | `stat` | `minecraft:custom/minecraft:walk_one_cm` *(or use advancement for 5 biomes)* | `/give @p kubejs:iron_loot_box 1` | 1.1 | Yes |
| 2D.2 | Dungeon Delver | `checkmark` | *(enter any dungeon structure — Dungeon Crawl, Battle Tower, etc.)* | `/give @p kubejs:iron_loot_box 1` | 2D.1 | Yes |
| 2D.3 | Dungeon Cleared | `checkmark` | *(clear a dungeon — reach final loot chest)* | `/puffish_skills points add @p survival 1` | 2D.2 | Yes |
| 2D.4 | Cartographer | `checkmark` | *(visit 10 different biomes)* | `/puffish_skills points add @p survival 1` | 2D.3 | Yes |
| 2D.5 | Structure Hunter | `checkmark` | *(find 5 different structure types)* | `/give @p kubejs:iron_loot_box 1` | 2D.4 | Yes |
| 2D.6 | **Path Complete: Explorer** | `checkmark` | *(auto — all above)* | `/give @p kubejs:tier1_loot_box 1` + `/puffish_skills points add @p survival 1` | 2D.1–2D.5 | Yes |

### Path E: Engineering (Automation)

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 2E.1 | First Machine | `item` | `create:cogwheel` x1 *(any Create mechanical component)* | `/give @p kubejs:iron_loot_box 1` | 1.1 | Yes |
| 2E.2 | Rotation | `item` | `create:water_wheel` x1 *(or `create:windmill_bearing`)* | `/give @p kubejs:iron_loot_box 1` | 2E.1 | Yes |
| 2E.3 | Assembly Line | `checkmark` | *(set up Create mechanical crafting or mixing)* | `/puffish_skills points add @p utility 1` | 2E.2 | Yes |
| 2E.4 | Pretty Pipes | `item` | `prettypipes:pipe` x3 | `/give @p kubejs:iron_loot_box 1` | 2E.3 | Yes |
| 2E.5 | Automated Processing | `checkmark` | *(automate ore processing — input raw ore, output ingots, no player intervention)* | `/puffish_skills points add @p utility 1` | 2E.4 | Yes |
| 2E.6 | **Path Complete: Engineer** | `checkmark` | *(auto — all above)* | `/give @p kubejs:tier1_loot_box 1` + `/puffish_skills points add @p utility 1` | 2E.1–2E.5 | Yes |

### Tier 2 Gate Quest

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 2G.1 | **Tier 2: Expansion Awaits** | `checkmark` | *(auto — ANY ONE path complete)* | `/astages add @p tier_2` + `/puffish_skills points add @p utility 1` + `/give @p kubejs:tier2_loot_box 1` | ANY of 2A.7, 2B.7, 2C.5, 2D.6, 2E.6 | Yes |

### Tier 1 Bonus Rewards (Multiple Path Completion)

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 2X.1 | Two Paths Walked | `checkmark` | *(2 paths complete)* | `/puffish_skills points add @p utility 1` + `/give @p kubejs:tier1_loot_box 1` | 2 of 2A.7/2B.7/2C.5/2D.6/2E.6 | Optional |
| 2X.2 | Three Paths Walked | `checkmark` | *(3 paths complete)* | `/puffish_skills points add @p utility 1` + `/give @p kubejs:tier1_loot_box 1` | 3 of above | Optional |
| 2X.3 | Four Paths Walked | `checkmark` | *(4 paths complete)* | `/puffish_skills points add @p utility 2` + `/give @p kubejs:tier2_loot_box 1` | 4 of above | Optional |
| 2X.4 | **Renaissance** | `checkmark` | *(all 5 paths complete)* | `/puffish_skills points add @p utility 2` + `/give @p kubejs:tier2_loot_box 1` + Cosmetic Title: "Renaissance" | All 5 path completes | Optional |

**Chapter total: up to 12 Skill Points (min 5 from one path + gate)**

---

## Chapter 3: Tier 2 — Expansion (First Dimensions)

> Same 5-path branching structure. Locked until Tier 2 unlocked. Quests are harder, rewards are better.
> Dimensions: Twilight Forest, Blue Skies, The Aether. Tech: Thermal, IF basic. Magic: Ars Nouveau.

### Path A: Grinding

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 3A.1 | Steel Production | `item` | `thermal:steel_ingot` x64 *(or `mekanism:ingot_steel` depending on recipe source)* | `/give @p kubejs:steel_loot_box 1` | 2G.1 | Yes |
| 3A.2 | Manasteel Forging | `item` | `botania:manasteel_ingot` x32 | `/give @p kubejs:steel_loot_box 1` | 3A.1 | Yes |
| 3A.3 | Thermal Processing | `item` | `thermal:machine_pulverizer` x1 + `thermal:machine_furnace` x1 *(two detection tasks)* | `/puffish_skills points add @p utility 1` | 3A.2 | Yes |
| 3A.4 | Mass Production | `checkmark` | *(produce 1024 total ingots of any Tier 2 materials)* | `/puffish_skills points add @p utility 1` | 3A.3 | Yes |
| 3A.5 | Dimensional Harvest | `checkmark` | *(collect materials from 2+ Tier 2 dimensions)* | `/give @p kubejs:steel_loot_box 1` | 3A.4 | Yes |
| 3A.6 | **Path Complete: Industrial Baron** | `checkmark` | *(all above)* | `/give @p kubejs:tier2_loot_box 1` + `/puffish_skills points add @p utility 1` | 3A.1–3A.5 | Yes |

### Path B: Magic

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 3B.1 | Ars Nouveau Initiate | `item` | `ars_nouveau:novice_spell_book` x1 | `/give @p kubejs:steel_loot_box 1` | 2G.1 | Yes |
| 3B.2 | Advanced Botania | `item` | `botania:terrasteel_ingot` x1 | `/puffish_skills points add @p magic 1` | 3B.1 | Yes |
| 3B.3 | Spell Customization | `checkmark` | *(create a custom Ars Nouveau spell with 3+ augments)* | `/give @p kubejs:steel_loot_box 1` | 3B.2 | Yes |
| 3B.4 | Terra Blade | `item` | `botania:terra_sword` x1 | `/puffish_skills points add @p magic 1` | 3B.3 | Yes |
| 3B.5 | Mana Mastery | `checkmark` | *(generate 100,000 mana — Botania tracker)* | `/give @p kubejs:steel_loot_box 1` | 3B.4 | Yes |
| 3B.6 | **Path Complete: Journeyman Mage** | `checkmark` | *(all above)* | `/give @p kubejs:tier2_loot_box 1` + `/puffish_skills points add @p magic 1` | 3B.1–3B.5 | Yes |

### Path C: Boss

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 3C.1 | Twilight Awakening | `kill` | `twilightforest:naga` x1 | `/give @p kubejs:steel_loot_box 1` | 2G.1 | Yes |
| 3C.2 | Lich King | `kill` | `twilightforest:lich` x1 | `/puffish_skills points add @p melee 1` | 3C.1 | Yes |
| 3C.3 | Hydra Slayer | `kill` | `twilightforest:hydra` x1 | `/give @p kubejs:steel_loot_box 1` | 3C.2 | Yes |
| 3C.4 | Ur-Ghast | `kill` | `twilightforest:ur_ghast` x1 | `/puffish_skills points add @p melee 1` | 3C.3 | Yes |
| 3C.5 | Cross-Dimensional Champion | `checkmark` | *(kill Champions in 2+ different Tier 2 dimensions)* | `/give @p kubejs:steel_loot_box 1` | 3C.4 | Yes |
| 3C.6 | **Path Complete: Dimensional Slayer** | `checkmark` | *(all above)* | `/give @p kubejs:tier2_loot_box 1` + `/puffish_skills points add @p melee 1` | 3C.1–3C.5 | Yes |

### Path D: Exploration

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 3D.1 | Twilight Tourism | `dimension` | `twilightforest:twilight_forest` | `/give @p kubejs:steel_loot_box 1` | 2G.1 | Yes |
| 3D.2 | Sky Explorer | `dimension` | `blue_skies:everbright` *(or `blue_skies:everdawn`)* | `/give @p kubejs:steel_loot_box 1` | 3D.1 | Yes |
| 3D.3 | Aether Pioneer | `dimension` | `aether:the_aether` | `/puffish_skills points add @p survival 1` | 3D.2 | Yes |
| 3D.4 | Dimensional Dungeons | `checkmark` | *(clear a dungeon in 2+ Tier 2 dimensions)* | `/puffish_skills points add @p survival 1` | 3D.3 | Yes |
| 3D.5 | All Three Realms | `checkmark` | *(auto — entered all 3 Tier 2 dimensions)* | `/give @p kubejs:steel_loot_box 1` | 3D.1 + 3D.2 + 3D.3 | Yes |
| 3D.6 | **Path Complete: Planeswalker** | `checkmark` | *(all above)* | `/give @p kubejs:tier2_loot_box 1` + `/puffish_skills points add @p survival 1` | 3D.1–3D.5 | Yes |

### Path E: Engineering

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 3E.1 | Thermal Foundation | `item` | `thermal:dynamo_stirling` x1 *(any Thermal dynamo)* | `/give @p kubejs:steel_loot_box 1` | 2G.1 | Yes |
| 3E.2 | Industrial Start | `item` | `industrialforegoing:dissolution_chamber` x1 *(any IF machine)* | `/give @p kubejs:steel_loot_box 1` | 3E.1 | Yes |
| 3E.3 | Power Grid | `checkmark` | *(generate 10,000 RF/tick from any source)* | `/puffish_skills points add @p utility 1` | 3E.2 | Yes |
| 3E.4 | Cross-Mod Automation | `checkmark` | *(use 2+ different tech mods in one automation chain)* | `/puffish_skills points add @p utility 1` | 3E.3 | Yes |
| 3E.5 | Smart Storage | `checkmark` | *(set up storage system with 100+ unique item types accessible)* | `/give @p kubejs:steel_loot_box 1` | 3E.4 | Yes |
| 3E.6 | **Path Complete: Industrialist** | `checkmark` | *(all above)* | `/give @p kubejs:tier2_loot_box 1` + `/puffish_skills points add @p utility 1` | 3E.1–3E.5 | Yes |

### Tier 3 Gate Quest

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 3G.1 | **Tier 3: Dominion Calls** | `checkmark` | *(auto — ANY ONE Tier 2 path complete)* | `/astages add @p tier_3` + `/puffish_skills points add @p utility 1` + `/give @p kubejs:tier3_loot_box 1` | ANY of 3A.6, 3B.6, 3C.6, 3D.6, 3E.6 | Yes |

### Tier 2 Bonus Rewards

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 3X.1 | Two Paths Mastered | `checkmark` | *(2 paths)* | `/puffish_skills points add @p utility 1` + `/give @p kubejs:tier2_loot_box 1` | 2 of paths | Optional |
| 3X.2 | Three Paths Mastered | `checkmark` | *(3 paths)* | `/puffish_skills points add @p utility 1` + `/give @p kubejs:tier2_loot_box 1` | 3 of paths | Optional |
| 3X.3 | Four Paths Mastered | `checkmark` | *(4 paths)* | `/puffish_skills points add @p utility 2` + `/give @p kubejs:tier3_loot_box 1` | 4 of paths | Optional |
| 3X.4 | **Polymath** | `checkmark` | *(all 5 paths)* | `/puffish_skills points add @p utility 2` + `/give @p kubejs:tier3_loot_box 1` + Cosmetic Title: "Polymath" | All 5 path completes | Optional |

**Chapter total: up to 20 Skill Points**

---

## Chapter 4: Tier 3 — Dominion (Deep Dimensions)

> Dimensions: Nether, Undergarden, Deeper Darker. Tech: Mekanism basic, Refined Storage, IF advanced. Magic: Occultism, Forbidden & Arcanus.
> Locked until Tier 3 unlocked.

### Path A: Grinding

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 4A.1 | Diamond Automation | `item` | `minecraft:diamond` x64 | `/give @p kubejs:tier3_loot_box 1` | 3G.1 | Yes |
| 4A.2 | Enderium Production | `item` | `thermal:enderium_ingot` x16 | `/give @p kubejs:tier3_loot_box 1` | 4A.1 | Yes |
| 4A.3 | Osmium Stockpile | `item` | `mekanism:ingot_osmium` x64 | `/puffish_skills points add @p utility 1` | 4A.2 | Yes |
| 4A.4 | Refined Obsidian | `item` | `mekanism:ingot_refined_obsidian` x16 | `/puffish_skills points add @p utility 1` | 4A.3 | Yes |
| 4A.5 | Tier 3 Mass Production | `checkmark` | *(2048+ total ingots of Tier 3 materials)* | `/give @p kubejs:tier3_loot_box 1` | 4A.4 | Yes |
| 4A.6 | **Path Complete: Resource Overlord** | `checkmark` | *(all above)* | `/give @p kubejs:tier3_loot_box 1` + `/puffish_skills points add @p utility 1` | 4A.1–4A.5 | Yes |

### Path B: Magic

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 4B.1 | Occultism Initiate | `item` | `occultism:spirit_fire` x1 *(or `occultism:golden_sacrificial_bowl`)* | `/give @p kubejs:tier3_loot_box 1` | 3G.1 | Yes |
| 4B.2 | Spirit Binding | `checkmark` | *(bind a Djinni or Afrit spirit via Occultism)* | `/puffish_skills points add @p magic 1` | 4B.1 | Yes |
| 4B.3 | Forbidden Knowledge | `item` | `forbidden_arcanus:eternal_stella` x1 *(or any F&A key item)* | `/give @p kubejs:tier3_loot_box 1` | 4B.2 | Yes |
| 4B.4 | Ars Nouveau Master | `item` | `ars_nouveau:archmage_spell_book` x1 | `/puffish_skills points add @p magic 1` | 4B.3 | Yes |
| 4B.5 | Terrasteel Mastery | `item` | `botania:terrasteel_ingot` x32 | `/give @p kubejs:tier3_loot_box 1` | 4B.4 | Yes |
| 4B.6 | **Path Complete: Archmage** | `checkmark` | *(all above)* | `/give @p kubejs:tier3_loot_box 1` + `/puffish_skills points add @p magic 1` | 4B.1–4B.5 | Yes |

### Path C: Boss

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 4C.1 | Harbinger | `kill` | `cataclysm:harbinger` x1 | `/give @p kubejs:tier3_loot_box 1` | 3G.1 | Yes |
| 4C.2 | Ignis | `kill` | `cataclysm:ignis` x1 | `/puffish_skills points add @p melee 1` | 4C.1 | Yes |
| 4C.3 | Wither Conquered | `kill` | `minecraft:wither` x1 | `/puffish_skills points add @p melee 1` | 4C.2 | Yes |
| 4C.4 | Meet Your Fight | `checkmark` | *(kill any Meet Your Fight boss)* | `/give @p kubejs:tier3_loot_box 1` | 4C.3 | Yes |
| 4C.5 | Undergarden/DD Boss | `checkmark` | *(kill a boss in Undergarden or Deeper Darker)* | `/give @p kubejs:tier3_loot_box 1` | 4C.4 | Yes |
| 4C.6 | **Path Complete: Empowered Slayer** | `checkmark` | *(all above)* | `/give @p kubejs:tier3_loot_box 1` + `/puffish_skills points add @p melee 1` | 4C.1–4C.5 | Yes |

### Path D: Exploration

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 4D.1 | Into the Undergarden | `dimension` | `undergarden:undergarden` | `/give @p kubejs:tier3_loot_box 1` | 3G.1 | Yes |
| 4D.2 | Deeper and Darker | `dimension` | `deeperdarker:otherside` | `/give @p kubejs:tier3_loot_box 1` | 4D.1 | Yes |
| 4D.3 | Nether Arrival | `dimension` | `minecraft:the_nether` | `/puffish_skills points add @p survival 1` | 4D.2 | Yes |
| 4D.4 | Nether Fortress | `checkmark` | *(locate and enter a Nether Fortress)* | `/puffish_skills points add @p survival 1` | 4D.3 | Yes |
| 4D.5 | Bastion Remnant | `checkmark` | *(locate and enter a Bastion Remnant)* | `/give @p kubejs:tier3_loot_box 1` | 4D.4 | Yes |
| 4D.6 | **Path Complete: Deep Explorer** | `checkmark` | *(all above)* | `/give @p kubejs:tier3_loot_box 1` + `/puffish_skills points add @p survival 1` | 4D.1–4D.5 | Yes |

### Path E: Engineering

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 4E.1 | Mekanism Foundation | `item` | `mekanism:steel_casing` x1 | `/give @p kubejs:tier3_loot_box 1` | 3G.1 | Yes |
| 4E.2 | Refined Storage Network | `item` | `refinedstorage:controller` x1 | `/give @p kubejs:tier3_loot_box 1` | 4E.1 | Yes |
| 4E.3 | IF Laser Drill | `item` | `industrialforegoing:laser_drill` x1 | `/puffish_skills points add @p utility 1` | 4E.2 | Yes |
| 4E.4 | Mekanism Enrichment | `item` | `mekanism:enrichment_chamber` x1 | `/puffish_skills points add @p utility 1` | 4E.3 | Yes |
| 4E.5 | Digital Network | `checkmark` | *(RS or AE2 autocrafting functional with 10+ recipes)* | `/give @p kubejs:tier3_loot_box 1` | 4E.4 | Yes |
| 4E.6 | **Path Complete: Master Engineer** | `checkmark` | *(all above)* | `/give @p kubejs:tier3_loot_box 1` + `/puffish_skills points add @p utility 1` | 4E.1–4E.5 | Yes |

### Tier 4 Gate Quest

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 4G.1 | **Tier 4: Ascension Begins** | `checkmark` | *(auto — ANY ONE Tier 3 path complete)* | `/astages add @p tier_4` + `/puffish_skills points add @p utility 1` + `/give @p kubejs:tier4_loot_box 1` | ANY of 4A.6, 4B.6, 4C.6, 4D.6, 4E.6 | Yes |

### Tier 3 Bonus Rewards

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 4X.1 | Two Paths Conquered | `checkmark` | *(2 paths)* | `/puffish_skills points add @p utility 1` + `/give @p kubejs:tier3_loot_box 1` | 2 of paths | Optional |
| 4X.2 | Three Paths Conquered | `checkmark` | *(3 paths)* | `/puffish_skills points add @p utility 1` + `/give @p kubejs:tier3_loot_box 1` | 3 of paths | Optional |
| 4X.3 | Four Paths Conquered | `checkmark` | *(4 paths)* | `/puffish_skills points add @p utility 2` + `/give @p kubejs:tier4_loot_box 1` | 4 of paths | Optional |
| 4X.4 | **Dominator** | `checkmark` | *(all 5 paths)* | `/puffish_skills points add @p utility 2` + `/give @p kubejs:tier4_loot_box 1` + Cosmetic Title: "Dominator" | All 5 path completes | Optional |

**Chapter total: up to 20 Skill Points**

---

## Chapter 5: Tier 4 — Ascension (Endgame)

> Dimensions: The End, Deep Aether. Tech: Mekanism advanced, RFTools Dimensions. Magic: Mahou Tsukai.
> Locked until Tier 4 unlocked.

### Path A: Grinding

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 5A.1 | Netherite Automation | `item` | `minecraft:netherite_ingot` x16 | `/give @p kubejs:tier4_loot_box 1` | 4G.1 | Yes |
| 5A.2 | Gaia Ingot Production | `item` | `botania:gaia_ingot` x8 | `/give @p kubejs:tier4_loot_box 1` | 5A.1 | Yes |
| 5A.3 | Antimatter Generation | `item` | `mekanism:pellet_antimatter` x4 | `/puffish_skills points add @p utility 1` | 5A.2 | Yes |
| 5A.4 | Atomic Alloy | `item` | `mekanism:alloy_atomic` x16 | `/puffish_skills points add @p utility 1` | 5A.3 | Yes |
| 5A.5 | **Path Complete: Titan of Industry** | `checkmark` | *(all above)* | `/give @p kubejs:tier4_loot_box 1` + `/puffish_skills points add @p utility 1` | 5A.1–5A.4 | Yes |

### Path B: Magic

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 5B.1 | Mahou Tsukai Initiate | `item` | `mahou_tsukai:mahou_book` x1 *(or mod-appropriate starter item)* | `/give @p kubejs:tier4_loot_box 1` | 4G.1 | Yes |
| 5B.2 | Gaia Guardian Preparation | `item` | `botania:life_essence` x1 *(Gaia Spirit)* | `/puffish_skills points add @p magic 1` | 5B.1 | Yes |
| 5B.3 | Ultimate Spell | `checkmark` | *(craft an ultimate-tier spell from any magic mod)* | `/give @p kubejs:tier4_loot_box 1` | 5B.2 | Yes |
| 5B.4 | Elementium Mastery | `item` | `botania:elementium_ingot` x32 | `/puffish_skills points add @p magic 1` | 5B.3 | Yes |
| 5B.5 | **Path Complete: Arcane Sovereign** | `checkmark` | *(all above)* | `/give @p kubejs:tier4_loot_box 1` + `/puffish_skills points add @p magic 1` | 5B.1–5B.4 | Yes |

### Path C: Boss

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 5C.1 | Dragon Slayer | `kill` | `minecraft:ender_dragon` x1 | `/give @p kubejs:tier4_loot_box 1` | 4G.1 | Yes |
| 5C.2 | Gaia Guardian | `kill` | `botania:doppleganger` x1 | `/puffish_skills points add @p melee 1` | 5C.1 | Yes |
| 5C.3 | Ender Guardian | `kill` | `cataclysm:ender_guardian` x1 | `/give @p kubejs:tier4_loot_box 1` | 5C.2 | Yes |
| 5C.4 | Ancient Remnant | `kill` | `cataclysm:ancient_remnant` x1 | `/puffish_skills points add @p melee 1` | 5C.3 | Yes |
| 5C.5 | **Path Complete: God-Killer** | `checkmark` | *(all above)* | `/give @p kubejs:tier4_loot_box 1` + `/puffish_skills points add @p melee 1` | 5C.1–5C.4 | Yes |

### Path D: Exploration

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 5D.1 | Deep Aether | `dimension` | `deep_aether:deep_aether` | `/give @p kubejs:tier4_loot_box 1` | 4G.1 | Yes |
| 5D.2 | The End | `dimension` | `minecraft:the_end` | `/puffish_skills points add @p survival 1` | 5D.1 | Yes |
| 5D.3 | End Cities | `checkmark` | *(locate and enter an End City)* | `/give @p kubejs:tier4_loot_box 1` | 5D.2 | Yes |
| 5D.4 | Moog's End Structures | `checkmark` | *(discover 3 Moog's End structures)* | `/puffish_skills points add @p survival 1` | 5D.3 | Yes |
| 5D.5 | **Path Complete: Dimension Walker** | `checkmark` | *(all above)* | `/give @p kubejs:tier4_loot_box 1` + `/puffish_skills points add @p survival 1` | 5D.1–5D.4 | Yes |

### Path E: Engineering

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 5E.1 | Fusion Reactor | `item` | `mekanism:fusion_reactor_controller` x1 | `/give @p kubejs:tier4_loot_box 1` | 4G.1 | Yes |
| 5E.2 | QIO Network | `item` | `mekanism:qio_drive_array` x1 | `/puffish_skills points add @p utility 1` | 5E.1 | Yes |
| 5E.3 | MekaSuit | `item` | `mekanism:mekasuit_helmet` x1 *(any MekaSuit piece)* | `/give @p kubejs:tier4_loot_box 1` | 5E.2 | Yes |
| 5E.4 | MekaTool | `item` | `mekanism:meka_tool` x1 | `/puffish_skills points add @p utility 1` | 5E.3 | Yes |
| 5E.5 | **Path Complete: Supreme Engineer** | `checkmark` | *(all above)* | `/give @p kubejs:tier4_loot_box 1` + `/puffish_skills points add @p utility 1` | 5E.1–5E.4 | Yes |

### Endgame Unlock Quests

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 5G.1 | **The Crucible Awaits** | `checkmark` | *(ANY ONE Tier 4 path + Dragon killed)* | Crucible Key recipe unlocked + `/puffish_skills points add @p utility 2` | ANY path complete + 5C.1 | Yes |
| 5G.2 | **The Paragon** | `checkmark` | *(kill Ancient Remnant + complete God-Killer chapter)* | `/give @p kubejs:paragons_proof 1` + Title: "Paragon" | 5C.4 + all Tier 4 paths | Optional |
| 5G.3 | Prestige Eligible | `checkmark` | *(complete ALL Tier 4 gate requirements)* | Prestige option unlocked | All 5 path completes | Optional |

### Tier 4 Bonus Rewards

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 5X.1 | Two Paths Ascended | `checkmark` | *(2 paths)* | `/puffish_skills points add @p utility 1` + `/give @p kubejs:tier4_loot_box 1` | 2 of paths | Optional |
| 5X.2 | Three Paths Ascended | `checkmark` | *(3 paths)* | `/puffish_skills points add @p utility 1` + `/give @p kubejs:tier4_loot_box 1` | 3 of paths | Optional |
| 5X.3 | **Transcendent** | `checkmark` | *(all 5 paths)* | `/puffish_skills points add @p utility 2` + `/give @p kubejs:mythic_loot_box 1` + Cosmetic Title: "Transcendent" | All 5 path completes | Optional |

**Chapter total: up to 15 Skill Points**

---

## Chapter 6: The Crucible (Endgame Arena)

> Wave-based arena progression. Not part of tier advancement. Pure endgame challenge content.
> Locked until Crucible Key obtained (5G.1).

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 6.1 | Enter the Crucible | `checkmark` | *(complete a Crucible run — any wave count)* | `/give @p kubejs:crucible_loot_box 1` | 5G.1 | Yes |
| 6.2 | Wave 10 | `checkmark` | *(clear Wave 10)* | `/puffish_skills points add @p melee 1` + `/give @p kubejs:crucible_loot_box 1` | 6.1 | Yes |
| 6.3 | Wave 25 | `checkmark` | *(clear Wave 25)* | `/puffish_skills points add @p melee 1` + `/give @p kubejs:crucible_loot_box 1` | 6.2 | Yes |
| 6.4 | Wave 50 | `checkmark` | *(clear Wave 50)* | `/puffish_skills points add @p melee 1` + `/give @p kubejs:mythic_loot_box 1` | 6.3 | Yes |
| 6.5 | Wave 75 | `checkmark` | *(clear Wave 75)* | `/give @p kubejs:mythic_loot_box 1` | 6.4 | Optional |
| 6.6 | Wave 100 | `checkmark` | *(clear Wave 100)* | `/puffish_skills points add @p melee 1` + `/give @p kubejs:mythic_loot_box 1` + Cosmetic Title: "Crucible Champion" | 6.5 | Optional |
| 6.7 | Challenge Dimension I | `checkmark` | *(complete a Difficulty 10+ Challenge Dimension)* | `/puffish_skills points add @p survival 1` | 5G.1 | Optional |
| 6.8 | Oblivion's Rift: Floor 10 | `checkmark` | *(reach Rift Floor 10)* | `/give @p kubejs:mythic_loot_box 1` | 5G.1 | Optional |
| 6.9 | Oblivion's Rift: Floor 25 | `checkmark` | *(reach Rift Floor 25)* | `/give @p kubejs:mythic_loot_box 1` + Title: "Rift Diver" | 6.8 | Optional |
| 6.10 | Oblivion's Rift: Floor 40 | `checkmark` | *(reach Rift Floor 40)* | `/give @p kubejs:mythic_loot_box 1` + Title: "The Unfathomable" | 6.9 | Optional |

**Chapter total: 5 Skill Points**

---

## Chapter 7: Side Quests

> Available from Tier 1 onward. Not required for any tier advancement. Bonus rewards only.
> These run parallel to the main progression and span all tiers.

### Food Diversity (Spice of Life Integration)

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 7F.1 | Varied Diet | `stat` | `spiceoflife:foods_eaten` >= 5 *(or checkmark)* | `/give @p kubejs:iron_loot_box 1` | 1.1 | Optional |
| 7F.2 | Home Cook | `checkmark` | *(eat 15 different food items)* | `/puffish_skills points add @p survival 1` | 7F.1 | Optional |
| 7F.3 | Gourmet | `checkmark` | *(eat 30 different food items)* | `/give @p kubejs:steel_loot_box 1` | 7F.2 | Optional |
| 7F.4 | Dimensional Chef | `checkmark` | *(eat food from 3+ different dimensions)* | `/puffish_skills points add @p survival 1` | 7F.3 | Optional |
| 7F.5 | Master Chef | `checkmark` | *(eat 50 different food items)* | `/give @p kubejs:tier3_loot_box 1` + Title: "Master Chef" | 7F.4 | Optional |

### Boss Hunting Challenges

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 7B.1 | Twilight Full Clear | `checkmark` | *(kill all Twilight Forest bosses in one session without dying)* | `/give @p kubejs:tier3_loot_box 1` + Title: "Twilight Conqueror" | 3C.6 | Optional |
| 7B.2 | Cataclysm Collector | `checkmark` | *(kill all Cataclysm bosses)* | `/give @p kubejs:tier4_loot_box 1` + Title: "Cataclysm Victor" | 4C.6 | Optional |
| 7B.3 | Progressive Slayer I | `checkmark` | *(kill any boss at Progressive difficulty 3+)* | `/give @p kubejs:tier3_loot_box 1` | 3G.1 | Optional |
| 7B.4 | Progressive Slayer II | `checkmark` | *(kill any boss at Progressive difficulty 5+)* | `/give @p kubejs:tier4_loot_box 1` | 7B.3 | Optional |
| 7B.5 | Simply Swords Collector | `checkmark` | *(obtain 5 different Simply Swords unique drops from bosses)* | `/give @p kubejs:mythic_loot_box 1` + Title: "Arms Dealer" | 3C.6 | Optional |

### Exploration Challenges

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 7E.1 | Biome Marathon | `checkmark` | *(visit 25 different biomes)* | `/give @p kubejs:steel_loot_box 1` | 2D.1 | Optional |
| 7E.2 | Structure Completionist | `checkmark` | *(find 20 different structure types across all dimensions)* | `/give @p kubejs:tier3_loot_box 1` | 3D.6 | Optional |
| 7E.3 | All Dimensions Visited | `checkmark` | *(visit every dimension in the pack)* | Title: "Planeswalker" | 5D.5 | Optional |
| 7E.4 | Aether Aerialist | `kill` | *(kill 50 mobs while airborne in the Aether)* | `/give @p kubejs:steel_loot_box 1` | 3D.3 | Optional |
| 7E.5 | Undergarden Survivor | `checkmark` | *(survive 30 minutes in Undergarden without being poisoned)* | `/give @p kubejs:tier3_loot_box 1` | 4D.1 | Optional |
| 7E.6 | Sculk Stealth | `checkmark` | *(clear a Deeper Darker Sculk nest without triggering a shrieker)* | `/give @p kubejs:tier3_loot_box 1` | 4D.2 | Optional |

### Automation Milestones

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 7A.1 | First Automated Farm | `checkmark` | *(fully automated crop farm — planting + harvesting + storage)* | `/give @p kubejs:iron_loot_box 1` | 2E.1 | Optional |
| 7A.2 | Mob Farm | `checkmark` | *(build a functional mob farm producing items/XP)* | `/give @p kubejs:steel_loot_box 1` | 2E.6 | Optional |
| 7A.3 | Ore Doubling | `checkmark` | *(set up ore doubling via any method)* | `/give @p kubejs:steel_loot_box 1` | 3E.1 | Optional |
| 7A.4 | Ore Tripling | `checkmark` | *(set up ore tripling via Mekanism)* | `/give @p kubejs:tier3_loot_box 1` | 4E.1 | Optional |

---

## Chapter 8: Compendium (Collection Tracking)

> Completionist goals. Cosmetic rewards. Long-term chase targets.
> Available from Tier 2 onward (earliest meaningful content).

### Boss Chronicle

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 8B.1 | First Boss Kill | `checkmark` | *(kill any boss for the first time)* | Entry in Compendium | None | Optional |
| 8B.2 | Twilight Bosses Complete | `kill` | All 4 TF bosses: `twilightforest:naga`, `twilightforest:lich`, `twilightforest:hydra`, `twilightforest:ur_ghast` | Title: "Twilight Champion" | 3C.6 | Optional |
| 8B.3 | Cataclysm Bosses Complete | `kill` | `cataclysm:harbinger` + `cataclysm:ignis` + `cataclysm:ender_guardian` + `cataclysm:ancient_remnant` | Title: "Cataclysm Conqueror" | 5C.4 | Optional |
| 8B.4 | Every Boss Killed | `checkmark` | *(kill every unique boss in the pack at least once)* | Title: "Boss Chronicle Complete" + `/give @p kubejs:mythic_loot_box 1` | 8B.2 + 8B.3 | Optional |

### Gear Collection

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 8G.1 | First Legendary | `checkmark` | *(equip 1 Legendary affix item)* | Entry in collection | 3G.1 | Optional |
| 8G.2 | Well-Equipped | `checkmark` | *(equip items from every material tier)* | Title: "Well-Equipped" | 4G.1 | Optional |
| 8G.3 | Mythic Collector | `checkmark` | *(obtain all 7 Mythic Unique blueprints)* | Title: "Mythic Collector" | 5G.1 | Optional |
| 8G.4 | Mythic Forgemaster | `checkmark` | *(craft all 7 Mythic Unique items)* | Title: "Mythic Forgemaster" | 8G.3 | Optional |
| 8G.5 | Blessed by RNG | `checkmark` | *(obtain a "perfect" affix item — max affixes, all Legendary)* | Title: "Blessed by RNG" | 8G.1 | Optional |
| 8G.6 | Void-Tempered | `checkmark` | *(apply Mythic V to any item)* | Title: "Void-Tempered" | 5G.1 | Optional |

### Dimensional Explorer

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 8D.1 | Planeswalker | `checkmark` | *(visit every dimension)* | Title: "Planeswalker" + map art | 5D.5 | Optional |
| 8D.2 | Dimension Veteran | `checkmark` | *(spend 10 hours in each dimension)* | +3% damage in all dimensions (permanent) | 8D.1 | Optional |
| 8D.3 | Cartographer Supreme | `checkmark` | *(find every unique structure across all dimensions)* | Title: "Cartographer" + unique compass curio | 8D.1 | Optional |

### Crafting Mastery

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 8C.1 | Artisan | `stat` | `minecraft:custom/minecraft:crafted` >= 500 *(unique recipes)* | Title: "Artisan" | 3G.1 | Optional |
| 8C.2 | Master Artisan | `checkmark` | *(craft 1000 unique recipes)* | +5% crafting speed (Artificer passive) | 8C.1 | Optional |
| 8C.3 | Renaissance Crafter | `checkmark` | *(use every mod's crafting system at least once)* | Title: "Renaissance Crafter" | 8C.2 | Optional |

### Compendium Completion Tiers

| # | Quest Name | Detection | Value | Rewards | Dependencies | Req? |
|---|-----------|-----------|-------|---------|-------------|------|
| 8X.1 | 25% Compendium | `checkmark` | *(25% of all Compendium entries)* | Unique banner pattern | Multiple | Optional |
| 8X.2 | 50% Compendium | `checkmark` | *(50% of all Compendium entries)* | Unique movement-speed curio | 8X.1 | Optional |
| 8X.3 | 75% Compendium | `checkmark` | *(75% of all Compendium entries)* | Unique particle effect | 8X.2 | Optional |
| 8X.4 | 90% Compendium | `checkmark` | *(90% of all Compendium entries)* | Title: "Completionist" + unique animated cape | 8X.3 | Optional |
| 8X.5 | **The Absolute** | `checkmark` | *(100% of all Compendium entries)* | Title: "The Absolute" + unique cosmetic set + permanent +5% all stats | 8X.4 | Optional |

---

## Quest Count Summary

| Chapter | Required | Optional | Total |
|---------|----------|----------|-------|
| 1. Getting Started | 7 | 1 | 8 |
| 2. Tier 1: Foundations | 31 | 4 | 35 |
| 3. Tier 2: Expansion | 31 | 4 | 35 |
| 4. Tier 3: Dominion | 31 | 4 | 35 |
| 5. Tier 4: Ascension | 24 | 5 | 29 |
| 6. The Crucible | 4 | 6 | 10 |
| 7. Side Quests | 0 | 20 | 20 |
| 8. Compendium | 0 | 18 | 18 |
| **TOTAL** | **128** | **62** | **190** |

## Skill Point Budget

| Source | Points | Cumulative |
|--------|--------|------------|
| Welcome chapter | 3 | 3 |
| Tier 1 (all paths + bonuses) | 12 | 15 |
| Tier 2 (all paths + bonuses) | 20 | 35 |
| Tier 3 (all paths + bonuses) | 20 | 55 |
| Tier 4 (all paths + bonuses) | 15 | 70 |
| Crucible / Endgame | 5 | 75 |
| **Total** | **75** | |
| Minimum (speedrun, 1 path/tier) | ~26 | |
| Maximum (completionist) | 75 | |

---

## FTB Quests Editor Notes

### Setting Up Branching Paths
- Each path's first quest should depend ONLY on the previous tier's gate quest (or Welcome for Tier 1)
- Each path's "Path Complete" quest depends on ALL quests within that path
- The tier gate quest uses FTB Quests' **OR dependency** — depends on ANY ONE of the path complete quests
- Bonus quests (2X, 3X, etc.) count the number of completed path-complete quests

### Detection Tips
- `checkmark` quests: Set to "Manual" completion in FTB Quests. Player clicks to confirm. Use for subjective or hard-to-detect goals.
- `item` quests: Use FTB Quests "Item" task type. Set "Consume Items" to false unless noted as `submit`.
- `kill` quests: Use FTB Quests "Kill" task type with the entity ID.
- `dimension` quests: Use FTB Quests "Dimension" task type with the dimension ID.
- `stat` quests: Use FTB Quests "Stat" task type with the stat ID and threshold.
- `advancement` quests: Use FTB Quests "Advancement" task type.

### Reward Setup
- **Command rewards:** Use FTB Quests' "Command" reward type. The `@p` placeholder is automatically replaced with the completing player's name.
- **Multiple rewards per quest:** Add multiple reward entries. Example: a skill point command + a loot box give command.
- **Choice rewards:** For skill points, consider using FTB Quests' "Choice" reward with 6 options (one per skill tree). Each option runs the appropriate `/puffish_skills points add @p <tree> 1` command.
- **Loot boxes:** These are KubeJS custom items that open a loot table on right-click. The `/give` command delivers them.

### Visual Layout
- **Chapter icons & colors:** Listed in the table above. Set in chapter properties.
- **Gate quests:** Make these LARGE nodes, centered. All path-complete quests connect to them visually.
- **Path layout:** Arrange each path as a horizontal or vertical chain. 5 parallel chains converging on the gate.
- **Locked chapters:** Set Tier 3 chapter to require `tier_2` stage, Tier 4 to require `tier_3`, etc. This prevents overwhelm.
- **Quest descriptions:** Write teaching text in each quest description. The quest book IS the documentation.

### Prestige Reset
On prestige, run: `/ftbquests change_progress @p reset`
Skill points already earned are tracked separately and NOT re-earnable on subsequent prestiges.

---

## Entity ID Reference

| Boss | Entity ID | Tier |
|------|-----------|------|
| Twilight Naga | `twilightforest:naga` | 2 |
| Twilight Lich | `twilightforest:lich` | 2 |
| Twilight Hydra | `twilightforest:hydra` | 2 |
| Twilight Ur-Ghast | `twilightforest:ur_ghast` | 2 |
| Cataclysm Harbinger | `cataclysm:harbinger` | 3 |
| Cataclysm Ignis | `cataclysm:ignis` | 3 |
| Wither | `minecraft:wither` | 3 |
| Ender Dragon | `minecraft:ender_dragon` | 4 |
| Gaia Guardian | `botania:doppleganger` | 4 |
| Cataclysm Ender Guardian | `cataclysm:ender_guardian` | 4 |
| Cataclysm Ancient Remnant | `cataclysm:ancient_remnant` | 4 |

## Dimension ID Reference

| Dimension | ID | Tier |
|-----------|----|------|
| Overworld | `minecraft:overworld` | 1 |
| Twilight Forest | `twilightforest:twilight_forest` | 2 |
| Blue Skies (Everbright) | `blue_skies:everbright` | 2 |
| Blue Skies (Everdawn) | `blue_skies:everdawn` | 2 |
| The Aether | `aether:the_aether` | 2 |
| Undergarden | `undergarden:undergarden` | 3 |
| Deeper Darker (Otherside) | `deeperdarker:otherside` | 3 |
| The Nether | `minecraft:the_nether` | 3 |
| Deep Aether | `deep_aether:deep_aether` | 4 |
| The End | `minecraft:the_end` | 4 |
