# IridescentCraft Master Design Document

## Progression-Focused Expert-Lite Modpack — Minecraft 1.20.1 (Forge)

> This document is the canonical source of truth for all IridescentCraft systems.
> When design changes are made, update this document and log the change in [changelog.md](changelog.md).

---

## Table of Contents

1. [Core Philosophy](#part-i-core-philosophy)
2. [Tier System Overview](#part-ii-tier-system-overview)
3. [Material Progression Gates](#part-iii-material-progression-gates)
4. [Dimensional Progression](#part-iv-dimensional-progression)
5. [Tech Progression Path](#part-v-tech-progression-path)
6. [Magic Progression Path](#part-vi-magic-progression-path)
7. [Weapon Progression](#part-vii-weapon-progression)
8. [Armor Progression](#part-viii-armor-progression)
9. [Curio & Accessory System](#part-ix-curio--accessory-system)
10. [Combat & Difficulty Scaling](#part-x-combat--difficulty-scaling)
11. [Apotheosis Configuration](#part-xi-apotheosis-configuration)
12. [Player Character Systems](#part-xii-player-character-systems)
13. [Food & Hunger System](#part-xiii-food--hunger-system)
14. [Storage & Logistics Progression](#part-xiv-storage--logistics-progression)
15. [XP Economy](#part-xv-xp-economy)
16. [Travel & Waystones](#part-xvi-travel--waystones)
17. [Tier-Skip Mechanics](#part-xvii-tier-skip-mechanics)
18. [Villager Trade Rework](#part-xviii-villager-trade-rework)
19. [Loot Table Overhaul](#part-xix-loot-table-overhaul)
20. [Serene Seasons](#part-xx-serene-seasons)
21. [Refined Storage (Special Case)](#part-xxi-refined-storage-special-case)
22. [Building & QoL](#part-xxii-building--qol)
23. [Misc Mod Placement](#part-xxiii-misc-mod-placement)
24. [Quest System Structure](#part-xxiv-quest-system-structure)
25. [Custom Items & Materials](#part-xxv-custom-items--materials)
26. [Boss → Loot Mapping](#part-xxvi-boss--loot-mapping)
27. [Death & Penalty System](#part-xxvii-death--penalty-system)
28. [Known Exploit Vectors](#part-xxviii-known-exploit-vectors)
29. [Implementation Priority](#part-xxix-implementation-priority)

---

## Part I: Core Philosophy

Power fantasy with escalating threats. Players become absurdly powerful — but the world scales harder.

### Design Pillars

- Open early game → Progressive gating → Earned power
- Dual-Path Progression: Every gate solvable via tech, magic, or hybrid
- Abundance of tools, not scarcity: Gates are when you unlock things, not whether
- No-drop death: Inventory kept on death; balance via expensive enchanting, XP investment
- Players NEED god-tier gear: Enemies scale harder than players to justify power creep
- Boss fights are the pinnacle: Best weapons (Simply Swords uniques) and next-tier materials come from bosses
- Play your way: Tech, magic, combat, hybrid — all equally valid paths to endgame

---

## Part II: Tier System Overview

| Tier | Theme | Dimensions | Tech Mods | Magic Mods | Power Level |
|------|-------|-----------|-----------|------------|-------------|
| 1 | Bronze Age Explorer | Overworld only | Create, Pretty Pipes | Botania, Iron’s Spells | Learning basics, first builds |
| 2 | Enchanted Adventurer | Twilight Forest, Blue Skies, The Aether | Thermal, IF (basic) | Ars Nouveau | Specialization, first real power |
| 3 | Empowered Slayer | Undergarden, Deeper Darker, Nether | IF (advanced), Mekanism (basic), RS | Occultism, Forbidden & Arcanus | Major power spike, factory building |
| 4 | God-Killer | Deep Aether, The End | Mekanism (advanced), RFTools Dims | Mahou Tsukai | Creative-tier power, ultimate threats |

### Tier Unlock Paths (Branching — Complete ANY ONE)

**Tier 2 Unlock (“Ascending Power”):**
- Option A: 1000 iron + 500 copper + Create components (grinding path)
- Option B: Botania runes + mana diamonds (magic path)
- Option C: Kill Twilight Lich + collect progression token (boss path)
- Option D: Dimensional materials from multiple dimensions (exploration)
- Option E: Prove automation with Create machines (engineering)

**Tier 3 Unlock:** Similar pattern with Tier 2 materials/bosses as requirements.

**Tier 4 Unlock:** Similar pattern with Tier 3 materials/bosses as requirements.

### Staging Implementation

Uses AStages (with KubeJS integration) to enforce per-player tier restrictions on:
- Items (tier-inappropriate items can’t be used)
- Dimensions (locked until stage unlocked)
- Recipes (tier-gated crafting)
- Ores (hidden/replaced until appropriate tier)

---

## Part III: Material Progression Gates

### Tier 1 — Early (Overworld Only)

- **Available:** Iron, Copper, Brass (Create), Tin, Bronze
- **NOT available:** Diamonds (removed from worldgen), Steel, Netherite, any modded mid-tier materials

### Tier 2 — Mid

- **New materials:** Steel (Thermal), Manasteel (Botania), Signalum, Lumium, Steeleaf, Ironwood, Fiery (Twilight)
- **Limited:** Diamonds via expensive transformation recipes only

### Tier 3 — Late

- **New materials:** Full diamond access (re-enable worldgen or bulk crafting), Terrasteel, Elementium (Botania), Enderium (Thermal), Osmium, Refined Obsidian (Mekanism), Ancient Debris (Nether now accessible)

### Tier 4 — Endgame

- **New materials:** Netherite (processable now), Gaia Ingots (Botania), Dragon Scales/Hearts (custom), Antimatter, Atomic Alloy (Mekanism), creative-tier items

### Cross-Tier Material Access

**Transmutation (Grinding Path)**

Expensive conversion of current-tier materials into small amounts of next-tier materials:
- 32–64 current-tier ingots → 1 next-tier ingot
- Implemented via KubeJS recipes (Create mixing, Thermal smeltery, or Botania Orechid variants)
- Intentionally inefficient — provides “a taste,” not a full unlock

**Boss Drops (Combat Path)**

Current-tier bosses have a 5–15% chance to drop 1–3 next-tier materials:
- Twilight bosses → occasional osmium, steel
- Tier 3 bosses → occasional ancient debris, gaia spirit fragments
- Gives combat-focused players a purely boss-hunting path to tier-peek

---

## Part IV: Dimensional Progression

Major change from vanilla: Nether is Tier 3, End is Tier 4.

| Tier | Dimension | Difficulty Multiplier | Notes |
|------|-----------|----------------------|-------|
| 1 | Overworld | 1.0x | Learn basics, bronze age |
| 2 | Twilight Forest | 1.5x | First dimension, boss-heavy |
| 2 | Blue Skies | 2.0x | Elemental themed |
| 2 | The Aether | 2.5x | Hardest Tier 2 dimension |
| 3 | The Undergarden | 3.0x | Hostile underground |
| 3 | Deeper and Darker | 3.5x | Deep dark themed |
| 3 | The Nether | 4.0x | Gated! 50% Champion spawn, Wither Skeletons are mini-bosses |
| 4 | Deep Aether | 5.0x | Advanced Aether |
| 4 | The End | 6.0x → 10.0x | Scaling zones, boss gauntlet |

### Dimensional Gating Implementation

- AStages restricts dimension access per player
- Portal activation requires tier-appropriate progression token OR quest completion
- Nether portal requires Tier 3 token; End portal requires stabilized Eyes of Ender (complex recipe) OR Tier 4 token
- End Portal Recipe mod gated to Tier 4

---

## Part V: Tech Progression Path

### Tier 1: Create

- Kinetic automation, mechanical processing
- Crushing wheels (~1.5x ore processing)
- Transport via Create belts/chutes AND Pretty Pipes
- Available immediately, gated only by basic materials

### Tier 2: Thermal Series + Industrial Foregoing (Basic)

- RF power generation, machine processing
- Thermal: Phytogenic automation, 2x ore processing
- IF Basic: Basic mob interaction, simple automation machines
- Gate: Tier 2 unlock (Twilight Lich kill OR quest completion)

### Tier 3: Industrial Foregoing (Advanced) + Mekanism (Basic) + Refined Storage

- IF Advanced: Laser Drill, Mob Crusher, auto-mining
- Mekanism Basic: Ore processing (up to 5x), energy cubes, basic machines
- Refined Storage: Digital storage (see Section 21 for special recipe rules)
- Gate: Tier 3 unlock + Nether materials

### Tier 4: Mekanism (Advanced) + RFTools Dimensions

- Mekanism Advanced: Digital Miner, Fusion Reactor, MekaTool, Mekasuit, QIO
- RFTools: Dimension creation, ultimate automation
- Gate: Tier 4 unlock (Gaia Guardian/Ender Dragon OR quest)

---

## Part VI: Magic Progression Path

### Tier 1: Botania + Iron’s Spells ‘n Spellbooks

- Botania: Mana generation, runic crafting, Orechid, mana blaster
- Iron’s Spells: Basic scrolls, staves, combat magic — combat magic is available from the start
- Available immediately

### Tier 2: Ars Nouveau

- Source generation, spell crafting, Imbuement Chamber
- Gate: Tier 2 unlock

### Tier 3: Occultism + Forbidden & Arcanus

- Spirit automation, ritual crafting, dark magic
- Gate: Tier 3 unlock

### Tier 4: Mahou Tsukai

- Advanced spell effects, reality manipulation
- This is the magic endgame — ultimate combat spells
- Gate: Tier 4 unlock

---

## Part VII: Weapon Progression

Clean split: Truly Modular = crafted weapons, Simply Swords = boss-drop-only trophies.

### System Roles

| System | Role | How Acquired |
|--------|------|-------------|
| Truly Modular (+ Archery, Armory, Arsenal) | Primary crafted weapons, customizable parts | Crafting with tier-appropriate materials |
| Simply Swords | Unique trophy weapons with special abilities | Boss drops ONLY (via LootJS) |
| Iron’s Spells ‘n Spellbooks | Magic combat (staves, spells, scrolls) | Crafting + loot |
| Cataclysm | Signature boss weapons | Cataclysm boss drops |
| Mahou Tsukai | Ultimate magic combat | Tier 4 crafting/progression |
| Mekanism | Tech endgame weapon (MekaTool) | Tier 4 crafting |
| Better Combat | Combat feel/animation | Passive system (always active) |
| Too Many Bows | Ranged weapon variety | Crafting, tiered by materials |

### Per-Tier Breakdown

**Tier 1: Choose Your Path**
- Melee: Vanilla iron, Truly Modular bronze/iron customs
- Ranged: Basic bows, Too Many Bows iron tier
- Magic: Iron’s Spells basic scrolls/staves, Botania mana blaster
- Apotheosis: Common affixes only, 1 socket, weak gems
- Uniques: None (bosses that drop them aren’t accessible yet)

**Tier 2: Specialization**
- Melee: Steel, Steeleaf, Ironwood, Fiery weapons. Truly Modular with Tier 2 materials
- Ranged: Too Many Bows mid-tier, enchanted crossbows
- Magic: Iron’s Spells rare scrolls, Ars Nouveau spell crafting, Botania Terra Blade
- Boss drops: Twilight Forest bosses → Simply Swords uniques (themed per boss)
- Apotheosis: Uncommon + Rare affixes, 2 sockets, mid gems

**Tier 3: Power Spike**
- Melee: Diamond, Terrasteel, Enderium, Refined Obsidian. Truly Modular peak pre-netherite
- Ranged: Too Many Bows high-tier (explosive, homing)
- Magic: Occultism spirit weapons, Forbidden & Arcanus dark magic, Iron’s Spells advanced
- Boss drops: Cataclysm Harbinger/Ignis → Simply Swords uniques + signature Cataclysm weapons
- Tech: Mekanism Atomic Disassembler
- Apotheosis: Epic affixes, 3 sockets, rare gems

**Tier 4: God-Killer**
- Melee: Netherite, Gaia Ingot weapons. Truly Modular ultimate builds
- Magic endgame: Mahou Tsukai ultimate spells
- Tech endgame: Mekanism MekaTool + Mekasuit
- Combat endgame: Cataclysm Void Forge, Gauntlet of the Bulwark, Ender Guardian weapons
- Boss drops: Dragon, Gaia Guardian II, End bosses → final Simply Swords uniques
- Apotheosis: Mythic affixes, 4+ sockets, legendary gems

---

## Part VIII: Armor Progression

Mirrors weapon progression. Truly Modular: Armory is the crafted armor system.

**Tier 1**
- Iron, copper, bronze. Truly Modular: Armory custom builds
- Origins innate defenses
- Basic Relics/Artifacts curios
- Iron Jetpacks low tier (early flight is intentional)

**Tier 2**
- Steel, Steeleaf, Ironwood, Fiery. Twilight armor sets
- Ars Nouveau enchanted robes
- Mid-tier curios, better jetpacks

**Tier 3**
- Diamond, Terrasteel, Refined Obsidian
- Occultism bound armor
- High-tier curios from Nether/Undergarden bosses

**Tier 4**
- Netherite, Gaia Ingot armor
- Mekanism Mekasuit (tech endgame armor)
- Mahou Tsukai defensive spells
- Cataclysm boss armor drops
- Mythic-affix gear with 4+ sockets

---

## Part IX: Curio & Accessory System

**Mods:** Artifacts, More Artifacts, Relics, Celestial Artifacts, Elytra Slot

**Philosophy:** Equipping is NEVER gated. Balance via harder encounters, not nerfing player power.

**Loot Control (Compromise):**
- Curios drop from tier-appropriate loot tables (controlled via LootJS)
- Fight-breaking curios (fire immunity, damage immunity, flight-granting) are restricted to Tier 2+ or Tier 3+ loot tables
- General utility curios (movement speed, minor buffs) can appear in Tier 1 loot
- Players can always equip anything they find — no AStages restriction on curios
- If a player gets a strong curio early (boss drop, trade, etc.), that’s a win, not an exploit

**Relics (leveling system):** Available at all tiers. The XP investment to level Relics acts as a natural soft-gate — early players won’t have the XP to max them.

---

## Part X: Combat & Difficulty Scaling

### Mod Stack

- **ScalingMobs:** Dimension-based stat multipliers
- **Champions Unofficial:** Elite mob spawns with affixes
- **Progressive Bosses:** Bosses get stronger each kill
- **Cataclysmic Combat:** Enhanced AI
- **Improved Mobs:** (RECOMMENDED ADD) Behavioral AI — mobs use gear, break blocks, build bridges
- **Better Combat:** Combat animation/feel overhaul
- **Azukaar’s Fair Difficulty Overhaul:** Additional difficulty tuning
- **Difficult Caves:** Cave-specific difficulty

### Scaling Configuration

| Dimension | Health Multi | Damage Multi | Champion Spawn % | Notes |
|-----------|-------------|-------------|-----------------|-------|
| Overworld | 1.0x | 1.0x | 15% | Baseline |
| Twilight Forest | 1.5x | 1.5x | 20% | First challenge |
| Blue Skies | 2.0x | 2.0x | 25% | Elemental threats |
| The Aether | 2.5x | 2.5x | 30% | Hardest Tier 2 |
| The Undergarden | 3.0x | 3.0x | 35% | Hostile underground |
| Deeper and Darker | 3.5x | 3.5x | 40% | Deep dark horrors |
| The Nether | 4.0x | 4.0x | 50% | Mini-boss Wither Skeletons |
| Deep Aether | 5.0x | 5.0x | 50% | Advanced Aether |
| The End | 6.0x–10.0x | 6.0x–10.0x | 60% | Multi-zone scaling |

### Progressive Bosses

- Each boss kill increases that boss’s stats for the next encounter
- Encourages varied boss hunting rather than farming one boss
- Ender Dragon: 1000 HP base, Enhanced AI, scales with kills

---

## Part XI: Apotheosis Configuration

### Affix Rates by Tier

| Tier | Common | Uncommon | Rare | Epic | Mythic | Max Sockets |
|------|--------|----------|------|------|--------|-------------|
| 1 | 15% | 5% | — | — | — | 1 |
| 2 | 25% | 15% | 5% | — | — | 2 |
| 3 | 35% | 25% | 15% | 8% | — | 3 |
| 4 | 35% | 25% | 15% | 10% | 5% | 4+ |

### Reforging Gates

- **Basic reforging:** Tier 2 token required
- **Advanced reforging:** Tier 3 token + expensive materials
- **Ultimate reforging:** Tier 4 token + Gaia ingots/antimatter

### Gems

- Require boss materials to craft
- Tiered by boss source (early bosses → weak gems, endgame bosses → legendary gems)

---

## Part XII: Player Character Systems

Four layered systems, with the first three presented as sequential character creation prompts on first join:

| System | Role | When Active |
|--------|------|-------------|
| Origins++ (Origin layer) | Origin — 11 origins with unique abilities, tradeoffs, and playstyle modifiers (9 vanilla rebalanced + 2 custom + Mundane, no Human) | Character creation prompt 1 (Tier 1) |
| Origins (Race layer, icraft namespace) | Race — 11 custom races (Human, Elf, Dwarf, Orc, Halfling, Faefolk, Revenant, Demi-God, Ryu, Fallen Angel, Kirin) with innate stat modifiers and thematic abilities | Character creation prompt 2 (Tier 1) |
| Iridescent Classes (Class layer, icraft namespace) | Class — 10 combat roles (Berserker, Samurai, Battlemage, Wanderer, Paladin, Vanguard, Ranger, Archmage, Artificer, Void Summoner) | Character creation prompt 3 (Tier 1) |
| Pufferfish’s Skills (+ AStages bridge) | Skill Points — stat investment trees | Earned through progression, spent on upgrades |
| JustLevelingFork | Provides stat scaling (HP, damage, speed) via leveling | XP curve is flattened but high — ~1000–2000 XP per level |

JustLevelingFork works alongside Pufferfish’s Skills (different systems — JLF is passive leveling, Pufferfish is active investment).

Three-Prompt Character Creation
On first join, players see three sequential selection screens:
1. **Origin** (Origins++ defaults) — Species-level identity with unique abilities and tradeoffs (e.g., Avian gets flight but takes more damage; Blazeborn has fire immunity but water hurts)
2. **Race** (IridescentCraft custom) — One of 11 races providing stat modifiers and thematic flavor
3. **Class** (IridescentCraft custom) — One of 10 combat roles defining playstyle, HP tier, and glass cannon status

This three-layer approach is intentional — Origin provides broad species fantasy, Race adds stat identity, and Class defines combat role. The separation creates more build diversity than a two-layer system.

Origins are ungated — early flight from Origins is intentional. Tradeoffs built into each Origin balance innate power.

---

## Part XIII: Food & Hunger System

**Role:** Major progression system. Food diversity = HP bonuses = survival in harder dimensions.

### Mod Stack

- **Hunger Overhaul:** Faster hunger drain, food less effective, slower healing
- **Spice of Life: Carrot Edition:** Eating diverse foods grants max HP bonuses
- **Farmer’s Delight** (+ Alex’s Delight, Nether’s Delight, Cultural Delights, Delightful): Complex cooking
- **Pam’s HarvestCraft 2** (Crops, Trees, Food Core, Food Extended): Hundreds of crops/recipes
- **Cooking for Blockheads:** Kitchen multiblock
- **Brewin’ and Chewin’:** Brewing/fermentation
- **Simple Farming:** Additional crops
- **Sleep Hunger:** Hunger/sleep interaction

### Design

- All food and farming is ungated from Tier 1 — no crop/recipe staging
- Players who invest in food diversity gain meaningful HP bonuses via Spice of Life
- A player eating only steak will struggle in Tier 3+ dimensions due to missing HP bonuses
- Natural soft-gate: Best food diversity requires dimensional ingredients (Nether’s Delight = Tier 3, etc.)
- Complex meals provide combat-relevant buffs (saturation, regeneration, resistance)
- Cooking is a parallel progression that rewards engagement without hard-blocking

---

## Part XIV: Storage & Logistics Progression

| Tier | Storage | Transport | Notes |
|------|---------|-----------|-------|
| 1 | Sophisticated Backpacks/Storage (iron tier), Storage Drawers (basic) | Pretty Pipes, Create belts/chutes | Basic logistics available immediately |
| 2 | Sophisticated upgrades (steel tier), Drawers upgrades | Thermal Ducts, IF basic transport | RF-powered logistics |
| 3 | Refined Storage (digital storage — see Section 21), Sophisticated (diamond tier) | XNet, IF advanced | Digital + advanced transport |
| 4 | RS advanced (Infinity Booster, Extra Disks), Sophisticated (netherite tier) | Mekanism QIO, RFTools | Wireless/cross-dimensional storage |

### Special Notes

- **EnderChests / EnderStorage:** Gated to Tier 4 (requires End materials). Cross-dimensional item transfer is endgame.
- **Flux Networks:** Ungated. Cross-dimensional RF transfer is fine — server bootstrapping is acceptable.
- **CC:Tweaked:** Ungated. Fun/utility mod, not a progression concern.

---

## Part XV: XP Economy

**Philosophy:** XP is plentiful with lots of things to spend it on and lots of ways to optimize.

### XP Sources

- Mob kills (enhanced by dimension difficulty)
- XP from Crops / Experienced Crops
- Boss kills (large XP drops)
- Quest rewards
- Trading (villager emerald → XP conversion)
- Cooking/crafting XP

### XP Sinks

- JustLevelingFork leveling (~1000–2000 XP per level, flat curve)
- Pufferfish’s Skills point investment
- Apotheosis enchanting (expensive but flat cost, not exponential)
- Relic leveling
- Anvil operations (Easy Anvils reduces but doesn’t eliminate cost)
- Reforging (Apotheosis)

### XP Mods in Pack

- **Tax Free Levels:** Reduces vanilla level cost scaling
- **Table of Experience:** XP storage block
- **Easy Anvils:** Reduces anvil costs
- **Easy Magic:** Reduces enchanting costs
- **XP from Crops / Experienced Crops:** Farming XP

> **Note:** These mods combined make XP more accessible, which is intentional. The sinks are what matter — there should always be something valuable to spend XP on.

---

## Part XVI: Travel & Waystones

**Philosophy:** Free teleportation and travel. Exploration should feel liberating, not punishing.

### Waystones

- **Finding & activating:** Free in all dimensions
- **Crafting a waystone:** Expensive at ALL tiers — requires rare custom boss drops
- **Waystone Towers:** Generate naturally in ALL dimensions (they’re the fast travel network)
- **Cross-dimensional teleport:** Works freely between activated waystones

### Other Travel

- **Iron Jetpacks:** Available Tier 1 (low-tier), better versions with tier materials. Early flight is intentional.
- **Icarus:** Available (audit wing crafting costs for balance)
- **Origins flight:** Ungated, intentional
- **Elytra Slot:** Available when elytra is obtained (Tier 4 naturally from End)

---

## Part XVII: Tier-Skip Mechanics

**Philosophy:** Skilled/dedicated players can get “a taste” of the next tier — one or two specific items/machines, not a full unlock.

### Method 1: Material Transmutation

- KubeJS recipes for expensive current → next tier conversion
- 32–64 current-tier ingots → 1 next-tier ingot
- Available through Create mixing, Thermal smelting, or Botania infusion
- Intentionally inefficient

### Method 2: Rare Boss Drops

- Current-tier bosses have 5–15% chance to drop 1–3 next-tier materials
- Twilight bosses → occasional osmium, steel
- Tier 3 bosses → occasional ancient debris, gaia spirit fragments
- Purely combat-based tier-peeking for boss hunters

### What This Enables

- A Tier 2 player might build ONE Mekanism machine from transmuted/dropped osmium
- They cannot build a full factory until properly unlocking Tier 3
- Feels rewarding without breaking gate integrity

---

## Part XVIII: Villager Trade Rework

**Goal:** Keep villagers relevant as an emerald economy without bypassing tier gates.

### Changes (via KubeJS)

- **REMOVE:** All enchanted book trades from Librarians (Apotheosis is the enchanting system)
- **REMOVE:** All diamond/netherite gear trades from Toolsmiths/Armorers/Weaponsmiths
- **KEEP:** Food, building materials, utility trades (maps, glass, dyes, etc.)
- **ADD:** XP bottle trades on Clerics at scaling emerald costs (emeralds → XP conversion)
- **KEEP:** Basic tool/armor trades using tier-appropriate materials only (iron tier)

### Emerald Economy

- Emeralds become a “convenience currency” — food, XP, building materials, utility items
- NOT a progression bypass for gear or enchantments
- Farming, trading, and exploration all generate emeralds
- Spending emeralds on XP ties into the XP economy (Section 15)

---

## Part XIX: Loot Table Overhaul

This is the most labor-intensive part of the pack. Every dungeon/structure mod’s loot tables must respect the tier system.

### Structure Mods Requiring Loot Overhaul

Dungeon Crawl, Dungeons Plus, Epic Dungeons, Stalwart Dungeons, Integrated Dungeons and Structures, When Dungeons Arise, YUNG’s Better Dungeons / Desert Temples / Mineshafts / Ocean Monuments / Strongholds / Nether Fortresses, Structory / Structory: Towers, Keebsz’s Battle Towers, Cherry Samurai Temple / Cherry Village, ChoiceTheorem’s Overhauled Village, Unwrecked Ships, Valhelsia Structures, Explorify, Waystone Towers (if loot exists), Moog’s End Structures, Villages & Pillages

### Loot Tier Guidelines

**Tier 1 (Overworld structures):**
- Iron/copper/bronze gear
- Low-tier Apotheosis affixes (Common only)
- Basic gems (weak)
- Food, building materials, arrows, basic potions
- Weak curios (utility, movement)
- NO diamonds, steel, enchanted books above level 2
- NO Simply Swords uniques (boss drops only)

**Tier 2 (Twilight / Blue Skies / Aether structures):**
- Steel/manasteel/steeleaf/ironwood gear
- Mid-tier affixes (Uncommon + Rare)
- Mid gems
- Tier 2 progression token fragments (collect X → full token, alternative unlock path)
- Mid-tier curios
- Limited diamonds (rare)

**Tier 3 (Undergarden / Deeper Darker / Nether structures):**
- Diamond/terrasteel/enderium gear
- High-tier affixes (Epic)
- Rare gems
- Tier 3 token fragments
- Mekanism components
- High-tier curios
- Fight-breaking curios start appearing (immunities, flight)

**Tier 4 (Deep Aether / End structures):**
- Netherite+ gear
- Mythic affixes
- Legendary gems
- Creative-adjacent items
- Ultimate curios

### Implementation

All via LootJS scripts, completely replacing default loot tables for all listed mods.

---

## Part XX: Serene Seasons

**Role:** Farming only. Seasonal crops with no combat impact.

- Certain crops only grow in certain seasons
- Encourages crop diversity and planning (synergizes with Spice of Life)
- Greenhouses (Thermal Phytogenic Insolator, etc.) bypass seasonal restrictions
- No winter difficulty increase, no mob changes
- Visual/aesthetic seasonal changes active

---

## Part XXI: Refined Storage (Special Case)

Tier 3 base, Tier 4 advanced, with dual-path recipes.

### Tier 3: Basic RS

- Controller, Grid, Drives, Crafters, basic disks
- Two parallel recipe paths:
  - **Tech path:** Uses Mekanism/Thermal materials (osmium, steel, RF components)
  - **Magic path:** Uses Botania/Ars Nouveau materials (terrasteel, mana diamonds, source gems)
  - **Hybrid bonus:** Using BOTH tech and magic materials yields efficiency benefits (cheaper crafting cost, double yield, or skip intermediate steps)

### Tier 4: Advanced RS

- RSInfinityBooster (infinite range)
- Extra Disks / ExtraStorage (large capacity)
- Requires endgame materials from both paths

---

## Part XXII: Building & QoL

Completely ungated from Tier 1. Let people build and enjoy QoL features.

### Building Mods (All Free)

Chipped, Macaw’s suite (Bridges, Fences, Furniture, Roofs, Trapdoors), Decorative Blocks, Decorative LGBT Wall Flags, Valhelsia Furniture, Domum Ornamentum, ConnectedTexturesMod, Connected Glass, Rechiseled, chisels-and-bits, Structurize

### QoL Mods (All Free)

JourneyMap, Jade, AppleSkin, Mouse Tweaks, Controlling, Inventory HUD+, Overflowing Bars, Fast Leaf Decay, TrashSlot, Trash Cans, FTB Ultimine, FTB Chunks, FTB Essentials, No Chat Reports, Simple Voice Chat, All performance mods (Embeddium, ModernFix, etc.)

---

## Part XXIII: Misc Mod Placement

| Mod | Tier | Notes |
|-----|------|-------|
| Pretty Pipes | 1 | Early logistics |
| Iron Jetpacks | 1+ | Tiered by materials used |
| Icarus | 1 | Audit wing costs |
| CC: Tweaked | Ungated | Fun/utility |
| Quark | Ungated | Vanilla-friendly |
| Disenchanting | Ungated | OP tools is the goal |
| Enchantment Transfer / Merge Enchantments | Ungated | Supports power fantasy |
| Origins / Origins++ | Ungated | Race selection, flight OK |
| Gods and Heroes RPG Classes | Ungated | Class selection |
| Flux Networks | Ungated | Server bootstrapping OK |
| End Portal Recipe | 4 | Hard gated |
| EnderChests / EnderStorage | 4 | Requires End materials |
| XNet / XNet Gases | 3 | Advanced transport |
| Industrial Foregoing (basic) | 2 | Basic machines |
| Industrial Foregoing (advanced) | 3 | Laser Drill, Mob Crusher |
| Mekanism (basic) | 3 | Ore processing, basic machines |
| Mekanism (advanced) | 4 | Digital Miner, Fusion, Mekasuit, MekaTool, QIO |
| RFTools Dimensions | 4 | Dimension creation |

---

## Part XXIV: Quest System Structure

FTB Quests with branching unlock paths. Each tier has multiple valid completion routes.

### Structure

- Main questline per tier with branching paths
- Optional side quests for bonus rewards
- Challenge quests that provide tier-skip materials
- Boss hunting quests tied to Simply Swords unique drops
- Food diversity tracking quests (Spice of Life integration)
- Automation milestone quests
- Exploration quests per dimension

### Rewards

- Progression tokens (tier unlocks)
- Custom materials
- XP bonuses
- Curios/accessories
- Building materials
- Cosmetic rewards

---

## Part XXV: Custom Items & Materials

### Progression Tokens (Consumed in Recipes)

- `twilight_progression_token_t2` — from Twilight Lich
- `dimensional_progression_token_t3` — from Harbinger/Queen
- `reality_progression_token_t4` — from Gaia Guardian/Ender Dragon

### Boss Materials

- `lich_soul`, `harbinger_eye`, `dragon_heart`
- `nether_soul_fragment` — from Wither Skeletons
- `condensed_blaze_essence` — from Blazes
- `dragon_scale`

### Intermediate Alloys

- `brass_reinforced_iron_ingot` — Tier 1.5
- `mana_infused_steel_ingot` — Tier 2.5
- `ender_forged_diamond` — Tier 3.5

### Tier-Skip Materials

- Transmutation recipes yielding small amounts of next-tier materials
- Boss-dropped next-tier material fragments

---

## Part XXVI: Boss → Loot Mapping

### Simply Swords Unique Assignment

#### Tier 2 Bosses

| Boss | Unique Theme | Weapon Type |
|------|-------------|-------------|
| Twilight Naga | Agility/speed | Rapier or Katana |
| Twilight Lich | Soul/magic | Staff-sword or Scythe |
| Twilight Hydra | Fire/power | Great Hammer or Claymore |
| Twilight Ur-Ghast | Void/spectral | Spectral weapon |
| Blue Skies bosses | Elemental (per boss) | Themed per element |
| Aether bosses | Wind/lightning | Themed per boss |

#### Tier 3 Bosses

| Boss | Unique Theme | Weapon Type |
|------|-------------|-------------|
| Cataclysm Harbinger | Dark/shadow | Shadow-themed unique |
| Cataclysm Ignis | Ultimate fire | Fire-themed unique |
| Meet Your Fight bosses | Per-boss theme | Varied |
| Undergarden/DD bosses | Corruption | Corruption-themed |
| Wither | Necrotic | Necrotic unique |

#### Tier 4 Bosses

| Boss | Unique Theme | Weapon Type |
|------|-------------|-------------|
| Ender Dragon | Draconic | The ultimate melee weapon |
| Gaia Guardian | Nature/reality | Reality-bending unique |
| Cataclysm Ender Guardian | Ender | Ender-themed unique |
| Ultimate/Nova Bosses | Rarest/flashiest | Trophy weapons |

Cataclysm Signature Weapons

Cataclysm bosses also drop their own signature weapons (Void Forge, Gauntlet of the Bulwark, etc.) — these are SEPARATE from Simply Swords uniques. A single boss may drop both its Cataclysm signature weapon AND a Simply Swords unique.

### Boss Material Drops

| Boss Tier | Materials Dropped | Next-Tier Peek (5–15%) |
|-----------|------------------|----------------------|
| Tier 2 (Naga, Lich, etc.) | Progression tokens, common gems, tier 2 materials | Osmium, steel (small amounts) |
| Tier 3 (Harbinger, Ignis) | T3 tokens, uncommon/rare gems, Mekanism components | Ancient debris, gaia fragments |
| Tier 4 (Gaia, Dragon) | T4 tokens, epic/legendary gems, creative-tier mats | N/A (already endgame) |

---

## Part XXVII: Death & Penalty System

- Keep inventory on death (no item loss)
- Enchanting cost: Expensive but flat (not exponential)
- XP curve: Flattened, ~1000–2000 XP per level

### Durability Loss on Death (Hytale-inspired)

**What’s affected:** Equipped armor + held weapon ONLY. Hotbar, inventory, and curios are unaffected.

**Critical rule:** Items NEVER break/destroy. At 0 durability, items become inert (cannot deal damage, provide armor, or mine) but remain in inventory. Players always keep their gear — it just stops working until repaired.

**Scaling by dimension difficulty:**

| Dimension | Difficulty | Durability Loss |
|-----------|-----------|----------------|
| Overworld | 1.0x | 10% |
| Twilight Forest | 1.5x | 12% |
| Blue Skies | 2.0x | 14% |
| The Aether | 2.5x | 15% |
| The Undergarden | 3.0x | 17% |
| Deeper and Darker | 3.5x | 18% |
| The Abyss: The Other Side | 3.5x | 18% |
| The Nether | 4.0x | 20% |
| Deep Aether | 5.0x | 22% |
| The End | 6.0x–10.0x | 25% |

Repair Cost Model
Scaled by damage, but capped. More durability missing = higher repair cost, but costs never exceed a hard cap per item tier.
Repair cost = (% durability missing × base material cost), capped at a maximum
Example: Netherite sword at 50% durability might cost 1 ingot + 5 levels. At 10% durability might cost 2 ingots + 12 levels. But never exceeds 3 ingots + 15 levels regardless of damage.
Caps scale by material tier (iron caps low, netherite caps higher, but always reasonable) Prevents “too afraid to use my gear” syndrome while keeping repair meaningful

### Soulbound Enchantment (Death Protection)

Repurposed from Ensorcellation. THE most valuable enchant in the pack.

| Level | Effect |
|-------|--------|
| I | 50% of death durability loss prevented |
| II | 75% of death durability loss prevented |
| III | 100% durability loss prevented + item cannot go inert from death |

Treasure enchant (high Arcana required). Soulbound III completely negates the death penalty for that item.

Implementation Notes
Items going inert at 0 durability is NOT vanilla behavior — requires custom KubeJS implementation On item durability reaching 0: cancel break event, set durability to 0, apply “broken” NBT tag Broken items: render with cracked/dark overlay, show “(Broken)” in tooltip, disable all functionality Repair at anvil with appropriate materials to restore
Design implications: - Dying is a regular but not fatal cost — you lose effectiveness, not items - Dying in early dimensions is a slap on the wrist (10% on iron = cheap repair) - Dying in Tier 3+ dimensions is meaningful (20% on diamond/terrasteel = noticeable repair) - Dying in the End is serious (25% on mythic netherite = expensive but capped repair) - Makes Soulbound, Unbreaking, and Mending/Mana Temper enchantments highly valuable - Naturally teaches “prepare before entering harder dimensions” - Scales with gear quality — losing 25% on god-tier gear hurts more than on basic gear

---

## Part XXVIII: Known Exploit Vectors

### Guiding Principle: Bendable But Not Breakable

Progression should be bendable (players find creative shortcuts for small advantages) but not breakable (no shortcut skips an entire tier). Unintended recipes or interactions that provide small amounts of slightly-ahead materials are acceptable — they feel like discoveries. Interactions that bypass a full tier gate must be fixed.

- **Break** = skip an entire tier (e.g., Create mixing produces diamonds in Tier 1). Fix these.
- **Bend** = small early access (e.g., Create mixing produces steel from iron + coal at a worse ratio than Thermal). Leave these — they align with the tier-skip philosophy.

### Exploits to Audit

| Exploit | Risk | Solution |
|---------|------|----------|
| Villager enchanted book trades | Bypasses Apotheosis enchanting | Remove via KubeJS (Section 18) |
| Villager diamond gear trades | Bypasses material gates | Remove via KubeJS |
| Botania Orechid producing gated ores | Bypasses worldgen removal | Configure Orechid ore weights per tier |
| Structure loot containing tier-inappropriate items | Floods early game with mid/late items | Full LootJS overhaul (Section 19) |
| Mob farms producing Apotheosis affix gear | Trivializes gear progression | Consider: affixes only roll on mobs killed in native dimension, or spawner mobs don’t drop affixes |
| Quark hidden features | Various shortcuts | Audit Quark config for progression-breaking items |
| Cross-mod recipe leaks | Unintended material access | Thorough KubeJS recipe audit |
| Thermal Insolator growing gated crops | Bypasses seasonal/dimensional crop gates | Configure Insolator recipes |
| Create mixing unintended recipes | Bypasses material gates | Audit Create recipes |

---

## Part XXIX: Implementation Priority

1. KubeJS custom item registration — progression tokens, boss materials, intermediate alloys
2. AStages tier definitions + KubeJS integration — backbone of all gating
3. Recipe modifications — material gates, tier-gated crafting, cross-mod audit
4. LootJS loot table overhaul — all dungeon/structure mods + boss loot
5. Simply Swords → Boss mapping (LootJS) — unique weapon assignments
6. Mod configs — ScalingMobs, Champions, Apotheosis, Progressive Bosses, Improved Mobs
7. Villager trade rework (KubeJS)
8. Tier-skip recipes (KubeJS) — transmutation + boss material drops
9. FTB Quests — branching unlock structure
10. Pufferfish’s Skills trees — custom tech/magic/combat trees
11. Refined Storage dual-path recipes (KubeJS)
12. Waystone custom recipes (KubeJS)
13. Playtesting & iteration

---

## Mod Categories

### Core Tech

Create, Thermal Series (Foundation, Expansion, Dynamics, Innovation, Cultivation, Integration), Mekanism (+ Generators), RFTools (Base, Builder, Dimensions, Power, Storage), Industrial Foregoing, Flux Networks, XNet (+ Gases)

### Core Magic

Botania, Ars Nouveau, Occultism, Forbidden & Arcanus, Mahou Tsukai (+ Combat)

### Combat & Scaling

Apotheosis, Apothic Attributes, JustLevelingFork, ScalingMobs, Champions Unofficial, Progressive Bosses, Cataclysmic Combat, Better Combat, Simply Swords, Too Many Bows, Truly Modular (+ Archery, Armory, Arsenal), Iron’s Spells ’n Spellbooks, Improved Mobs (RECOMMENDED ADD)

### Player Systems

Origins (+ Origins++, Origins Overhaul), Gods and Heroes RPG Classes, Pufferfish’s Skills (+ AStages bridge), JustLevelingFork, Relics, Artifacts, More Artifacts, Celestial Artifacts

### Dimensions

Twilight Forest, Blue Skies, The Aether, The Undergarden, Deeper and Darker, Deep Aether

### Bosses

Cataclysm (+ Apotheosis addon), Meet Your Fight, Mutant Monsters, Ultimate Bosses, NovaBosses, Ultris: Boss Expansion, LuMoreBossesAndMobs, brutalbosses

### Food & Farming

Farmer’s Delight (+ Alex’s, Nether’s, Cultural, Delightful, Brewin’ and Chewin’), Pam’s HarvestCraft 2 (Crops, Trees, Food Core, Food Extended), Cooking for Blockheads, Simple Farming, Hunger Overhaul, Spice of Life: Carrot Edition, Sleep Hunger, Serene Seasons

### Storage & Logistics

Refined Storage (+ Addons, Extra Disks, ExtraStorage, RSInfinityBooster, RSRequestify), Sophisticated Backpacks/Storage/Core, Storage Drawers, Pretty Pipes, EnderChests, EnderStorage

### Scripting

KubeJS (+ Additions, Ars Nouveau, Botania, Thermal, Delight, Offline), CraftTweaker, JeiTweaker, LootJS (via lootintegrations), AStages, FTB Quests

### QoL & Performance

Embeddium (+ Extra), ModernFix, Canary, Ferrite Core, ServerCore, JourneyMap, Jade, AppleSkin, and many more (see full mod list)

---

## Part IV-B: Full Encounter Design System

Enemies are lethal but killable. Damage scales fastest, HP scales moderately. Combat in harder dimensions is DANGEROUS — players must respect enemies, not just out-stat them. A well-geared player tears through trash but respects elites and fears bosses.
Every dimension feels mechanically unique. Not just stat inflation — each dimension has combat behaviors, environmental hazards, and enemy mechanics that demand different strategies.
Build diversity matters in combat. A Berserker and a Vanguard fighting the same mob should have fundamentally different experiences — not just “faster” or “slower” versions of the same fight.

Estimated Player Power (Tier 4, Well-Geared)

Stat
Glass Cannon (Ranger/Archmage)
Hybrid (Samurai/Battlemage)
Tank (Vanguard)

Max HP

80-120 (40-60 hearts)

140-180 (70-90 hearts)
220-300 (110-150
hearts)
Effective HP (after DR)

160-300

350-540

700-1200
Damage Per Hit

50-90

40-65

25-45
Attack Speed

High

Moderate

Low-Moderate
DPS
(sustained)

80-140

60-100

30-55
These numbers account for: class modifiers, equipment HP halving, Vitality enchant, Spice of Life, JustLevelingFork, affixes, gems, and typical enchantment setups.

Target Kill Speeds

Player vs Regular Mob (Tier 4 End)

Player BuildHits to Kill TrashHits to Kill Elite/Champion
Berserker (melee DPS)
2-3 hits
8-12 hits
Ranger/Archmage (ranged DPS)

2-4 hits

8-15 hits
Samurai/Battlemage (hybrid)

3-5 hits

10-18 hits
Wanderer
4-6 hits
12-20 hits
Paladin
5-7 hits
15-22 hits
Vanguard (tank)
7-10 hits
20-30 hits
Artificer
4-6 hits
12-20 hits
Void Summoner (via minions)

4-8 hits (minion swarm)

15-25 hits (minion swarm)

Regular Mob vs Player (Tier 4 End)

Player Build
Hits to Die (Regular Mob)
Hits to Die (Champion)
Hits to Die (Boss)
Ranger/Archmage
3-4
2
1
Void Summoner
4-5
2-3
1-2
Berserker
5-6
3-4
1-2
Samurai/Battlemage/Wanderer
6-8
4-5
2-3
Artificer
6-8
4-5
2-3
Paladin
8-10
5-7
3-4
Vanguard
10-14
7-9
4-6

Scaling Model

Four stats scale independently per dimension. Damage scales fastest, HP moderately, Speed and Armor minimally.
Base reference: Overworld zombie = 20 HP, 3 damage, 0 armor, 100% speed

Dimension Stat Multipliers

Tier 1 — Overworld

Stat
Multiplier
Example (Zombie)
HP
1.0x
20 HP
Damage
1.0x
3 damage
Speed
1.0x
Normal
Armor
1.0x
0
Champion spawn rate: 5% Champion tier: 1 affix (basic)

Tier 2 — Twilight Forest

Stat
Multiplier
Example (Equivalent Mob)
HP
1.8x
36 HP
Damage
2.0x
6 damage
Speed
1.05x
Barely noticeable
Armor
1.3x
+2 armor points
Champion spawn rate: 7% Champion tier: 1-2 affixes Mob gear: 20% of mobs spawn with iron-tier weapons/armor

Tier 2 — Blue Skies

Stat
Multiplier
Example
HP
2.0x
40 HP
Damage
2.3x
7 damage
Speed
1.05x
Barely noticeable
Armor
1.4x
+3 armor points
Champion spawn rate: 8% Champion tier: 1-2 affixes Mob gear: 25% with iron-tier gear

Tier 2 — The Aether

Stat
Multiplier
Example
HP
2.2x
44 HP
Damage
2.5x
7-8 damage
Speed
1.08x
Slightly faster
Armor
1.5x
+3-4 armor points
Champion spawn rate: 8% Champion tier: 1-2 affixes Mob gear: 25% with iron/steel-tier gear

Tier 3 — The Undergarden
StatMultiplierExampleStatMultiplierExample
StatMultiplierExample
StatMultiplierExample

HP
3.0x
60 HP
Damage
3.5x
10-11 damage
Speed
1.10x
Noticeably faster
Armor
2.0x
+6 armor points
Champion spawn rate: 10% Champion tier: 2-3 affixes Mob gear: 40% with steel/diamond-tier gear

Tier 3 — Deeper and Darker

Stat
Multiplier
Example
HP
3.5x
70 HP
Damage
4.0x
12 damage
Speed
1.10x
Noticeably faster
Armor
2.2x
+7 armor points
Champion spawn rate: 10% Champion tier: 2-3 affixes Mob gear: 45% with diamond-tier gear

Tier 3 — The Nether

Stat
Multiplier
Example
HP
4.0x
80 HP
Damage
5.0x
15 damage
Speed
1.12x
Faster
Armor
2.5x
+8 armor points
Champion spawn rate: 12% Champion tier: 2-3 affixes (fire-themed affixes weighted heavily) Mob gear: 50% with diamond/netherite-tier gear

Tier 4 — Deep Aether

Stat
Multiplier
Example
HP
5.0x
100 HP
Damage
6.5x
19-20 damage
Speed
1.15x
Noticeably fast
Armor
3.0x
+10 armor points
Champion spawn rate: 13% Champion tier: 3-4 affixes Mob gear: 60% with netherite-tier gear

Tier 4 — The End (Multi-Zone)
The End is NOT a single difficulty. It has escalating zones.
End — Outer Islands (Entry Zone)

Stat
Multiplier
Example
HP
6.0x
120 HP
Damage
8.0x
24 damage
Speed
1.15x
Fast
Armor
3.5x
+12 armor points
Champion spawn rate: 14% Champion tier: 3-4 affixes
End — Deep End / End Cities

Stat
Multiplier
Example
HP
7.5x
150 HP
Damage
9.0x
27 damage
Speed
1.18x
Very fast
Armor
4.0x
+14 armor points
Champion spawn rate: 15% Champion tier: 3-4 affixes (void-themed affixes weighted)
End — Dragon’s Domain / Final Zone

Stat
Multiplier
Example
HP
10.0x
200 HP
Damage
12.0x
36 damage
Speed
1.20x
Very fast
Armor
5.0x
+16 armor points
Champion spawn rate: 15% Champion tier: 4 affixes guaranteed Mob gear: 80% with netherite + enchanted gear

Damage Validation

Does this hit our targets?
End regular mob (outer islands) deals 24 base damage per hit.
Against a Ranger/Archmage (effective HP ~200, after DR ~60%): - 24 damage × 40% (after DR) = ~10 actual damage - With 80- 120 HP pool: dies in ~8-12 raw hits - But these classes have half equipment HP, so effective HP is lower: ~160 - Actual hits to kill:
~6-8 from outer island mobs - Against Deep End mobs (27 base): ~4-5 hits - Against Dragon’s Domain mobs (36 base): 3-4 hits ✓
Against a Vanguard (effective HP ~900, after DR ~80%): - 24 damage × 20% (after DR) = ~5 actual damage
- With 220-300 HP pool: dies in ~44-60 raw hits - Against Dragon’s Domain mobs (36 base × 20%): ~7 actual damage = ~31-43 hits - Within our 10-14 target for regular mobs when accounting for multiple attackers and Champion damage spikes ✓
Numbers check out. Glass cannons die fast in the End, tanks are walls. Exactly the target.

Dimension-Specific Combat Mechanics

Each dimension doesn’t just have stat multipliers — it has unique behaviors, environmental mechanics, and enemy types that demand different strategies.

Tier 1 — Overworld

Combat Identity: Learning Ground
The Overworld teaches players the basics. Vanilla mob behavior, no surprises.
Unique Mechanics: - None — this is the baseline - Nighttime mob density increases by 30% (motivation to prepare before exploring at night) - Full moon nights: mob spawn rate doubled, Champions 8% instead of 5%
Environmental Hazards: - Standard (fall damage, drowning, lava in caves)
Mob Behavior (Improved Mobs config): - Basic AI only — mobs don’t use gear, don’t break blocks, don’t coordinate - Creepers are standard - Skeletons have normal accuracy

Tier 2 — Twilight Forest

Combat Identity: The Dark Forest
Dense, claustrophobic. Mobs ambush from thick canopy. Fights happen at close range with limited visibility.
Unique Mechanics: - Canopy Ambush: Mobs in Twilight Forest have a 15% chance to spawn with Invisibility for 5 seconds after spawning. They become visible when they attack or take damage. Players hear a rustling sound 2 seconds before ambush. - Twilight Corruption: Mobs near Twilight Forest boss arenas gain +10% damage and regenerate 1 HP/second. Incentivizes clearing trash before pulling bosses. - Pack Tactics: Twilight-native mobs (not vanilla mobs) have coordinated aggro — hitting one alerts others within 16 blocks (extended range vs vanilla 12).
Environmental Hazards: - Thorns/hedge mazes deal damage on contact - Dark Forest biome has permanent reduced visibility (fog effect) - Boss arenas have environmental traps (Lich tower, Hydra lair fire)
Mob Behavior (Improved Mobs): - 20% of mobs equip dropped weapons (pick up player drops!) - Mobs pathfind around obstacles more effectively - Skeleton archers lead their shots slightly

Tier 2 — Blue Skies

Combat Identity: Elemental Gauntlet
Two dimensions (Everbright / Everdawn) with elemental themes. Mobs deal elemental damage that bypasses standard armor.
Unique Mechanics: - Elemental Damage: 30% of mob damage is converted to elemental (fire in Everdawn, ice in Everbright). This portion bypasses armor but is affected by elemental resistance (Heatward enchant, etc.). - Elemental Storms: Periodic weather events (every 10-15 minutes) that buff mobs of the matching element (+20% damage, +10% speed) for 2 minutes.
Players with matching resistance take reduced storm environmental damage. - Altitude Combat: Mobs at higher altitudes (Y>128) gain +5% speed. Fights on floating islands are faster-paced.
Environmental Hazards: - Everdawn: Ambient fire damage in certain biomes without fire resistance - Everbright: Slowness effect in blizzard zones without cold protection - Floating islands: fall damage is the real killer
Mob Behavior: - Ranged mobs prioritize high-ground positioning - Melee mobs attempt to knock players off edges (knockback AI) - Flying mobs are common — ranged weapons are more valuable here

Tier 2 — The Aether

Combat Identity: Aerial Warfare
Vertical combat. Mobs fly, platforms are narrow, falling is lethal. Ranged builds shine; pure melee struggles without mobility tools.
Unique Mechanics: - Updraft Zones: Certain areas have upward wind columns that launch players and mobs upward. Can be used tactically (launch into the air for Windborne/Ranger bonus) or dangerously (launched off a platform). - Cloud Cover: Mobs above Y>192 have a 10% chance to be hidden in cloud particles until within 8 blocks. Soft ambush mechanic. - Gravity Wells: Rare zones where gravity is reduced — jump height doubled, fall damage halved, but knockback doubled. Changes melee combat dynamics significantly.
Environmental Hazards: - Falling into the void below the Aether = death - Thin atmosphere at extreme heights: Slowness I

above Y>256 without Aether Acclimation enchant - Quicksoil patches: ice-like surfaces that cause uncontrolled sliding near edges
Mob Behavior: - 40% of mobs can fly or hover - Flying mobs strafe and dive-bomb rather than hovering stationary - Ground mobs use hit-and-run tactics near platform edges - Valkyries (native Aether mob) have parry mechanics — they block frontal attacks periodically

Tier 3 — The Undergarden

Combat Identity: Toxic Attrition
Constant pressure. The environment itself drains you. Poison, darkness, decay. Fights aren’t about burst damage — they’re about outlasting the rot.
Unique Mechanics: - Virulent Spores: All mobs in the Undergarden have a 25% chance to apply a 5-second poison on hit. Poison damage scales with dimension multiplier (not vanilla flat damage). Antidotes (food/potion) cleanse it, but the constant reapplication is the pressure. - Fungal Armor: Undergarden-native mobs have natural damage reduction that regenerates if not hit for 5 seconds. Rewards sustained aggression — stopping to heal gives them armor back. - Bioluminescent Tracking: In the Undergarden, mobs can detect players from 24 blocks (vs vanilla 16) in darkness. Light sources reduce detection range back to normal. Torches are survival tools, not just building tools. - Decay Aura: Standing still for more than 10 seconds in the Undergarden applies Weakness I. Encourages constant movement.
Environmental Hazards: - Ambient poison damage in certain biomes (1 HP/10 seconds without resistance) - Virulent plants that explode into poison clouds when stepped on - Dark zones where mob detection range extends to 32 blocks
Mob Behavior: - Mobs attack in waves — 2-3 engage while others circle - Poisoned mobs (hit by player poison effects) become enraged: +15% damage, +10% speed - Mobs retreat into darkness when below 20% HP and regenerate fungal armor

Tier 3 — Deeper and Darker

Combat Identity: Horror Survival
Stealth matters. The Warden-adjacent dimension where noise = death. Players must balance combat aggression with acoustic discipline.
Unique Mechanics: - Acoustic Aggro: Loud actions (sprinting, breaking blocks, fighting) generate “noise” that attracts additional mobs from further away. Sneaking and careful movement reduce aggro radius from 24 blocks to 8. - Sculk Resonance: Mobs near sculk blocks gain +15% damage and vibration-based detection (they can “feel” player movement through walls within 12 blocks). - Darkness Empowerment: Mobs in light level 0 gain +20% all stats. Mobs in light level 7+ lose 10% all stats. Lighting your environment is a combat tool. - Rift Pressure: Below Y=-32, all entities (players AND mobs) take 1 damage/30 seconds. Depthstrider enchant mitigates this.
Environmental Hazards: - Sculk shriekers summon Warden-type entities - Darkness effect applied in certain zones (pulsing blindness) - Gravity anomalies: random 2-second levitation followed by slam (fall damage)
Mob Behavior: - Mobs patrol in patterns rather than random wandering — predictable but dangerous - Mobs communicate via sculk networks: killing one near sculk alerts all mobs within 32 blocks - Stealth-focused enemies that are invisible until attacking or within 4 blocks - Mobs don’t make aggro sounds until they attack — no warning growls

Tier 3 — The Nether

Combat Identity: Relentless Aggression
The Nether doesn’t let you breathe. Fire everywhere, mobs are aggressive, terrain is treacherous. Pure combat intensity.
Unique Mechanics: - Infernal Rage: All Nether-native mobs are permanently aggro from 20 blocks (no neutral mobs except piglins with gold). Once aggro’d, they don’t de-aggro until one of you is dead. - Soulfire Burns: 30% of Nether mob melee damage is fire damage that bypasses armor. Heatward enchant mitigates this. Without fire protection, effective mob damage is significantly higher than the stat multiplier suggests. - Blaze Swarm: When a Blaze or Blaze-type mob is killed, 20% chance to spawn 2 smaller “Ember” mobs that deal reduced damage but are fast and numerous. Chain-killing Blazes can snowball. - Nether Fortification: Mobs inside Nether Fortress structures gain +10% all stats and cannot be knocked back. Fortress raids are set-piece encounters. - Lava Affinity: Nether mobs within 4 blocks of lava regenerate 2% HP/second. Pull them away from lava to fight effectively.
Environmental Hazards: - Lava everywhere — fall in = near-instant death even with fire resistance (lava deals increased damage in Nether) - Ghast fireballs destroy terrain, creating lava falls - Soul sand valleys apply Slowness without soul speed - Basalt deltas have falling debris (random damage ticks)
Mob Behavior (Improved Mobs — aggressive config): - ALL mobs attempt to use gear they find - Piglins form hunting

parties of 4-6 and flank - Wither Skeletons use hit-and-run melee with reach advantage - Ghasts coordinate fire from multiple angles - Hoglins charge and knockback toward lava (intentional environmental kills) - Mobs break weak blocks (wood, glass) to reach players

Tier 4 — Deep Aether

Combat Identity: Ascension Trial
The “almost endgame” dimension. Combines aerial combat (Aether) with escalated difficulty. Mobs are smart, fast, and have multi-phase attack patterns.
Unique Mechanics: - Celestial Empowerment: During dimension-specific “celestial events” (occur every 20 minutes, last 5 minutes), all mobs gain +25% all stats and glow. High risk, high reward — mobs drop 50% more loot during events. - Wind Shear: Random wind gusts that push players and projectiles off-course. Ranged combat requires timing. Wind direction is visible via particle effects. - Ascension Towers: Procedural tower structures where mobs increase in difficulty per floor. Each floor adds
+5% stats. Top floor has a mini-boss. Unique to Deep Aether. - Radiant Shield: 20% of Deep Aether mobs spawn with a temporary shield that absorbs the first hit entirely (any damage). Second hit onwards deals normal damage. Rewards sustained combat over alpha-strike builds.
Environmental Hazards: - Extreme heights — void below, narrow platforms - Wind gusts near edges - Radiant storms that deal light damage (1 HP/5s) without shelter - Thin air above Y>300: Mining Fatigue I without Aether Acclimation
Mob Behavior: - Mobs use combo attacks (2-3 hit sequences with increasing damage) - Flying mobs coordinate dive-bomb runs in pairs - Ground mobs use shield-and-strike patterns (block → counter-attack) - Elite mobs have telegraphed special attacks (1- second windup with visual indicator, avoidable) - Mobs heal allies at low HP if not interrupted

Tier 4 — The End (Multi-Zone)

Combat Identity: The Crucible
Everything the pack has taught you is tested here. All mechanics combine. The End is designed to kill you.

Outer Islands (Entry)
Unique Mechanics: - Void Proximity: Mobs gain +1% damage per block closer to void (Y<10). Fights near edges are deadlier.
- Ender Displacement: 15% of mob attacks apply a short-range teleport to the player (2-4 blocks in a random direction). Disorienting, potentially lethal near void edges. Warp Shield enchant counters this. - Chorus Warp: Eating chorus fruit in the End is unpredictable — teleport range doubled and can teleport you into mid-air. - Shulker Coordination: Shulkers fire in volleys.
Multiple shulkers target the same player simultaneously. Levitation near void = death.

Deep End / End Cities
Unique Mechanics (adds to Outer Islands): - Void Corruption: Every 60 seconds spent in the Deep End, gain 1 stack of Void Corruption (max 10). Each stack: -2% max HP, +3% damage dealt. At 10 stacks: -20% HP, +30% damage. Leaving the End clears stacks. Resting at a waystone pauses accumulation for 5 minutes. - Ender Resonance: Killing Endermen has a 10% chance to trigger a “resonance event” — 3-5 additional Endermen teleport in, already aggro’d. Chain-killing Endermen can cascade. - Phase Shift: 10% of mobs in End Cities can briefly phase through walls (1-second duration, 30-second cooldown). Players cannot hide behind walls safely.

Dragon’s Domain (Final Zone)
Unique Mechanics (adds to above): - Dragon’s Influence: While the Ender Dragon is alive, all mobs in the End gain +15% all stats. Killing the dragon removes this buff until it respawns (Progressive Bosses). - Void Storms: Periodic events (every 10 minutes) that deal 3 damage/second to all entities not under shelter for 30 seconds. Both players and mobs are affected — can be used tactically. - Reality Fracture: Random spatial distortions that reverse player controls for 2 seconds (left = right, forward
= backward). Visual warning: purple particle spiral appears 1 second before. 30-second cooldown between fractures. - Endgame Champions: Champions in Dragon’s Domain ALWAYS have 4 affixes. Champion mobs here are mini-bosses in their own right.
Environmental Hazards: - Void everywhere — one wrong step is death - Obsidian towers with crystal healing the dragon - Dragon breath pools that linger and deal sustained damage - End gateway suction that pulls players toward portals
Mob Behavior (Full Improved Mobs — maximum config): - ALL mobs use found gear and enchanted weapons - Mobs break any block to reach players (including obsidian, slowly) - Mobs coordinate — ranged mobs suppress while melee mobs flank - Mobs prioritize weakest player in multiplayer (target glass cannons) - Endermen teleport behind players for backstab attacks - Elite mobs adapt to player behavior: if player kites, mobs speed up; if player face-tanks, mobs spread out

Affix Tiers

Champions gain random combat affixes that make them unique threats. Affix count scales with dimension.
Dimension Tier
Champion Affix Count
Spawn Rate
Tier 1 (Overworld)
1
5%
Tier 2 (Twilight/Blue Skies/Aether)
1-2
7-8%
Tier 3 (Undergarden/DD/Nether)
2-3
10-12%
Tier 4 (Deep Aether)
3-4
13%
Tier 4 (End — All Zones)
3-4 (4 guaranteed in Dragon’s Domain)
14-15%

Champion Affix Pool

Champions draw from a pool of combat affixes (separate from Apotheosis gear affixes). These modify mob behavior:

Offensive Affixes
Molten: Melee attacks apply fire (2s). Leaves fire trail when moving.
Arctic: Melee attacks apply Slowness II (3s). Projectiles apply Slowness I.
Venom: Attacks apply Poison II (4s). Poison damage scales with dimension multiplier. Wither: Attacks apply Wither I (3s). Kills heal the Champion for 10% max HP. Desecrating: Leaves damaging ground area on hit location (3s duration, 2-block radius). Enkindling: Sets nearby blocks on fire. Increases fire spread rate.

Defensive Affixes
Shielding: Periodically generates damage-absorbing shield (absorbs one hit every 10s).
Reflecting: 15% of damage taken is reflected to attacker. Regenerating: Heals 2% max HP per second when not hit for 3 seconds. Armored: +50% armor effectiveness.
Adaptable: After taking 5 hits of the same damage type, gains 25% resistance to that type.

Mobility Affixes
Hasty: +30% movement speed permanently.
Knockback: Melee attacks have extreme knockback (3x normal).
Blink: Teleports to player when taking ranged damage (anti-kiting).
Leaping: Jumps 4 blocks high. Lands with AoE shockwave (2 damage, 3-block radius).

Utility Affixes
Commanding: Nearby non-Champion mobs gain +10% damage (aura).
Summoning: Spawns 2 weaker copies of itself when below 50% HP (once per Champion).
Draining: Hits steal 5% of player’s current mana/stamina.
Hexing: Hits have 20% chance to apply random negative potion effect (2s duration).

Dimension-Weighted Affixes
Certain affixes are more likely in specific dimensions:
DimensionWeighted Affixes
Twilight Forest
Commanding, Venom (forest creatures hunt in packs)
Blue Skies
Arctic/Molten (elemental theme)
Aether
Leaping, Hasty, Knockback (aerial combat)
Undergarden
Venom, Regenerating, Adaptable (attrition theme)
Deeper and Darker
Blink, Shielding, Hexing (horror stealth)
Nether
Molten, Enkindling, Desecrating (fire and destruction)

Deep Aether
Shielding, Leaping, Commanding (celestial warriors)
The End
Blink, Draining, Wither, Adaptable (void corruption)

Champion Rewards

Champions drop better loot than regular mobs: - 1 affix: +50% loot quantity, chance for Uncommon Apotheosis gear - 2 affixes:
+100% loot, chance for Rare gear, bonus XP - 3 affixes: +150% loot, chance for Epic gear, guaranteed bonus XP - 4 affixes:
+200% loot, chance for Epic/Legendary gear, guaranteed enchanted book, large XP orb

Regular Mobs

Dimension Tier% EquippedEquipment TierEnchantment Level
Tier 1
5%
Leather/Iron (random pieces)
None
Tier 2
20-25%
Iron/Steel
0-1 (basic enchants)
Tier 3
40-50%
Steel/Diamond
1-3 (moderate enchants)
Tier 4 (Deep Aether)
60%
Diamond/Netherite
2-4
Tier 4 (End)
70-80%
Netherite
3-5 (high enchants)

Champions

Champions spawn with better gear than regular mobs of the same dimension:
Dimension TierEquipment TierEnchantment LevelSpecial
Tier 1
Iron (full set)
1-2
—

Tier 2

Steel/Diamond

2-3
10% chance for affix gear

Tier 3

Diamond (full set)

3-4
25% chance for affix gear

Tier 4

Diamond/Netherite

4-5
50% chance for affix gear

End (Dragon’s Domain)

Netherite (full set)

5+
75% chance for affix gear
“Affix gear” means armor/weapons with Apotheosis affixes. These drop on kill — Champions are a source of affix gear for players.

Progressive Bosses Configuration

Every boss in the pack gets harder each time it’s killed (per-world, not per-player). This creates an escalating challenge across a server’s lifetime.

Per-Kill Scaling

Kill Count
HP Bonus
Damage Bonus
Speed Bonus
New Mechanics
1st kill
Base
Base
Base
Base moveset
2nd kill
+15%
+10%
+3%
—
3rd kill
+30%
+20%
+5%
+1 new attack pattern
5th kill
+50%
+35%
+8%
+1 additional phase
10th kill
+100%
+60%
+12%
Full enhanced moveset
15th+
+150% (cap)
+80% (cap)
+15% (cap)
Maximum difficulty
Boss HP Targets (First Kill)

BossTierBase HP10th Kill HP
Twilight Naga
2
300
600
Twilight Lich
2
400
800
Twilight Hydra
2
500
1,000
Ur-Ghast
2
600
1,200
Blue Skies bosses
2
350-500
700-1,000
Aether bosses
2
400-550
800-1,100
Harbinger (Deeper Darker)
3
800
1,600
Wither
3
600
1,200
Ignis (Cataclysm)
3
1,000
2,000
Meet Your Fight bosses
3
700-1,000
1,400-2,000
Ender Dragon
4
1,000
2,000
Ender Guardian (Cataclysm)
4
1,500
3,000
Gaia Guardian (Botania)
4
1,200
2,400
Void Blossom (Cataclysm)
4
2,000
4,000
Ancient Remnant (Cataclysm)
4
2,500
5,000

Boss Gear Drops
Bosses drop their signature equipment (as designed in boss loot document). Progressive Bosses scaling means later kills drop slightly better versions:

Kill CountDrop Quality Modifier
1st-3rd
Base drops
4th-6th
+10% chance for higher affix rarity on drops
7th-10th
+20% chance, bonus enchantment level on drops
10th+
+25% chance, guaranteed additional drop
Incentivizes repeated boss farming even as difficulty increases. The arms race: bosses get harder, but drops get slightly better too.

Apotheosis-spawned bosses (random world bosses from Apotheosis system) scale independently from designed bosses.
DimensionApotheosis Boss Spawn RateBase StatsLevel Range
Overworld
2% per chunk per cycle
1.0x
1-10
Tier 2 dimensions
4%
2.0x
10-25
Tier 3 dimensions
6%
3.5x
25-50
Tier 4 dimensions
8%
6.0x
50-80
End (Dragon’s Domain)
10%
10.0x
80-100
Apotheosis bosses drop gear with affixes matching their level. Higher level = better affix rarity.

TierTrash Kill SpeedPlayer Threat LevelCombat Feel

Tier 1

1-2 hits

Low (10+ hits to die)
Tutorial. Learn mechanics, get comfortable.

Tier 2

2-3 hits

Moderate (6-8 hits)
Engaging. Need to pay attention.
Ambushes/elements start.

Tier 3

3-5 hits

High (4-6 hits)
Intense. Mechanics demand specific strategies.
Poison/stealth/fire pressure.

Tier 4

4-8 hits (build-dependent)

Lethal (3-4 hits glass cannon)
Endgame. Every fight matters. Environmental + mob synergy. One mistake = death.

ScalingMobs dimension configuration — Set HP/Damage/Speed/Armor multipliers per dimension
Champions Unofficial configuration — Affix pools, spawn rates, tier scaling, dimension-weighted affixes
Improved Mobs configuration — Per-dimension AI behavior settings (gear usage, block breaking, coordination, difficulty escalation)
Progressive Bosses configuration — Per-kill scaling values, HP caps
KubeJS mob event handlers — Dimension-specific mechanics (Twilight ambush, Undergarden spores, End displacement, Nether soulfire, etc.)
Loot table integration — Champion drops, boss drops, gear scaling per dimension
Boss HP/stat overrides — Custom HP values for all designed bosses via KubeJS/configs
End multi-zone implementation — Biome-based scaling within the End dimension
Environmental hazard scripting — Void Corruption stacks, Celestial Events, Void Storms, Reality Fracture
0. Playtesting & tuning — Numbers WILL need adjustment. Start at 80% of designed values and tune up.

Critical Playtesting Note
All numbers in this document are THEORETICAL. The interaction of 7+ gear enhancement layers, 10 classes, dimension mechanics, and mob scaling creates emergent complexity that can only be truly balanced through iterative playtesting. Design targets are guidelines — expect 2-3 full tuning passes minimum.
Recommended testing approach: 1. Test with a “standard” build (Samurai, mid-tier gear, moderate enchants) as the baseline
2. Test extremes: naked Archmage vs End mobs, full Vanguard vs Overworld mobs 3. Test multiplayer: Vanguard + Archmage duo vs designed solo difficulty 4. Adjust multipliers in 10% increments until kill speed targets are met

---

## Part XII-B: Full Character Build System

Three layers, distinct purposes:
- **Race** (Origins++/Overhaul): Innate traits. What you ARE. Permanent. Mild tradeoffs.
- **Class** (G&H RPG Classes, heavily modified): Combat role. What you DO. Respec-able (expensive). Strong tradeoffs.
- **Skills** (Pufferfish’s Skills): Stat investment. How you GROW. Pure bonuses, no drawbacks.

Race + Class have tradeoffs. Skills are always positive.

Respec Rules

Race: Permanent. Chosen at character creation. Cannot be changed.
Class: Respec-able. Cost: 1 boss drop (tier-appropriate) + 30 levels of XP. Can only respec at a specific crafted station (Class Altar).
Skills: Respec individual skill points. Cost: 5 levels per point refunded.

HP & Equipment Scaling Overview

Class
Archetype
HP Modifier
Equipment HP
Damage Modifier
Berserker
Melee DPS
-5%
Normal
—
Samurai
Melee/Ranged Hybrid
+5%
Normal
—
Battlemage
Melee/Magic Hybrid
+5%
Normal
—
Wanderer
Hybrid Multiclass
+5%
Normal
—
Paladin
Tank/Support/Healer
+10%
Normal
—
Vanguard
Pure Tank
+20%
Normal
-15% all damage
Ranger
Ranged DPS
-20%
Half
—
Archmage
Offensive Caster
-20%
Half
—
Artificer
Crafter/Non-combat
0%
Normal
—
Void Summoner
Summoner/Necromancer
-10%
Half
—
“Half Equipment HP” Explained
Ranger, Archmage, and Void Summoner receive 50% effectiveness from all equipment-sourced max HP bonuses. This includes: - Vitality enchantment (half the HP per level) - Max HP affixes (Hearty, Vigorous, Vital — half value) - Curio HP bonuses (half value)
- Armor attribute modifiers that grant HP (half value)
Does NOT affect: - Base HP (modified by class % above) - Spice of Life food HP bonuses (full value — reward food diversity equally) - JustLevelingFork level-up HP (full value — reward progression equally) - Pufferfish’s Skills HP investment (full value — skills are pure bonuses)
This means glass cannon classes have a lower HP ceiling at endgame but are NOT punished for engaging with food/leveling systems.

BERSERKER — Melee DPS

Identity: Sustained melee damage dealer. Gets stronger as HP drops. The “I don’t need to dodge, I need to hit harder” class. Punished for playing passively or at range.

HP & Scaling
HP Modifier: -5%
Equipment HP: Normal
Damage Modifier: None (offensive bonuses come from passives)

Weapon Affinities

Weapon TypeModifier
Axes
+15% damage
Swords (2H / greatswords)
+10% damage
Swords (1H)
Normal
Bows / Crossbows
-20% damage
Magic Staves / Spells
-15% damage
Passive Abilities (5)
Blood Fury Below 40% HP, gain +20% melee damage and +10% attack speed. Below 20% HP, these double to +40% damage and +20% attack speed. Synergy: Adrenaline enchant (speed at low HP), Berserker’s affix (damage at low HP). Triple- stacking low-HP build.
Relentless Each consecutive melee hit without taking damage grants +3% damage, stacking up to 10 times (+30%). Taking damage removes 3 stacks. Synergy: Momentum enchant (similar stacking). Both can be active simultaneously for massive sustained DPS.
Bloodletting Melee kills restore 2% of max HP. Overkill damage (damage beyond the killing blow) increases healing to 4%.
Anti-synergy: This pulls you OUT of Blood Fury range. Berserkers must choose: stay low for damage, or kill to heal up. Moment-to- moment decisions.
Thick Skinned +10% armor effectiveness from worn armor pieces. Does not apply to enchantment/affix armor bonuses.
Compensates for -5% HP. Berserkers are slightly tougher than their HP suggests, but only from base armor.
Battle Trance After 10 seconds of continuous combat (dealing or taking damage), gain +5% to all damage and -5% to all damage taken. Lasts until 5 seconds pass without combat. Rewards staying in fights. Berserkers who kite or disengage lose their trance. Commit or lose power.

Active Ability
Reckless Charge Dash forward 8 blocks, dealing 150% weapon damage to the first enemy hit and gaining +25% attack speed for 4 seconds. During the dash, take +30% increased damage. - Cooldown: 30 seconds - The gap closer. Gets you into melee range fast but makes you vulnerable during the dash. High risk, high reward.

SAMURAI — Melee/Ranged Hybrid

Identity: Versatile warrior equally comfortable with a blade or bow. Not as devastating as a Berserker in melee, not as deadly as a Ranger at range, but can switch fluidly. The adaptable fighter.

HP & Scaling
HP Modifier: +5% Equipment HP: Normal Damage Modifier: None

Weapon Affinities

Weapon TypeModifier

Katanas / Rapiers
+12% damage
Bows
+10% damage
Swords (all)
+5% damage
Crossbows
Normal
Axes / Hammers
-10% damage
Magic Staves / Spells
-15% damage

Passive Abilities (4)
Way of the Blade After landing 3 melee hits in a row, next ranged attack deals +25% damage. After landing 2 ranged hits, next melee attack deals +20% damage. The core mechanic. Rewards switching between melee and ranged constantly. Pure melee or pure ranged Samurai miss out on this bonus.
Bushido +15% damage against enemies at full health (first strike bonus). Kills within 3 seconds of first hitting an enemy grant a 2-second speed boost. The “clean kill” passive. Rewards decisive engagement over prolonged fights.
Evasive Stance +8% dodge chance (incoming attacks have a chance to deal 0 damage). Dodge chance increases to 12% when moving. Samurai survive through agility, not raw HP. Moving = living. Standing still = vulnerability.
Focus Not attacking for 3 seconds grants “Focused” — next attack deals +30% damage and has +20% crit chance. Consuming Focus starts a 10-second cooldown before it can build again. The “sniper shot” or “iaijutsu strike” passive. Rewards patience. Anti-synergy with Relentless/Momentum stacking (those want constant attacks).

Active Ability
Blade Dance For 5 seconds, gain +30% attack speed and +15% movement speed. Every hit during Blade Dance reduces the cooldown of Blade Dance by 0.5 seconds. - Cooldown: 45 seconds - The burst window. A Samurai who lands 10 hits during Blade Dance reduces the cooldown by 5 seconds. Skilled play = more frequent bursts.

BATTLEMAGE — Melee/Magic Hybrid

Identity: Warrior who weaves spells into melee combat. Melee hits enhance spell power, spells enhance melee hits. The “I cast Fireball then hit you with a sword” class. Not as tanky as a Paladin, not as much raw magic as an Archmage.

HP & Scaling
HP Modifier: +5% Equipment HP: Normal Damage Modifier: None

Weapon Affinities

Weapon TypeModifier
Swords (1H) + offhand spell focus
+12% to both melee and spell
Magic Staves (melee mode)
+10% damage
Swords (2H / greatswords)
+5% damage
Bows / Crossbows
-15% damage
Pure ranged spells (no melee within 5s)
-10% damage
Passive Abilities (5)
Arcane Infusion Melee hits generate “Arcane Charges” (max 5). Each charge increases spell damage by +6% (max +30%). Casting a spell consumes all charges. Charges decay after 8 seconds of no melee hits. The core loop: melee → build charges → spell for burst → repeat. Encourages constant weaving.
Spell Strike After casting a spell, next melee hit within 4 seconds deals +20% damage and applies the spell’s element as bonus damage (fire spell → fire melee, ice spell → ice melee, etc.). The reverse of Arcane Infusion. Spell → melee is boosted too. The full loop: melee × 5 → spell (boosted) → melee (boosted by Spell Strike) → repeat.
Mana Barrier When hit, 15% of damage is absorbed by mana (if using a mana-based magic system like Iron’s Spells or Ars Nouveau). If no mana, this passive does nothing. Rewards investing in magic systems. A Battlemage with a deep mana pool effectively has more survivability. Encourages hybrid gear (mana items + armor).
Elemental Attunement Casting spells of the same element 3 times in a row grants “Attuned” to that element: +15% damage of that element, +10% resistance to that element. Lasts 30 seconds. Casting a different element resets progress.

Rewards spell specialization within a fight. Anti-synergy with rapidly switching elements.
Arcane Recovery Killing an enemy restores 3% of max mana. During combat, passive mana regeneration increased by
+15%. Sustain passive. Battlemages can keep fighting longer without running dry. Pairs with Mana Temper enchant for complete
mana management.

Active Ability
Arcane Surge Instantly gain 5 Arcane Charges and for 6 seconds, melee hits don’t consume charges when casting spells (charges persist through spell casts). - Cooldown: 60 seconds - The burst window. Normally, casting a spell consumes all charges. During Arcane Surge, you maintain max charge bonus on every spell while continuously attacking. Devastating DPS window.

WANDERER — Hybrid Multiclass

Identity: The jack of all trades. Benefits from using many different systems and playstyles. The “I want to do a little of everything” class. Not the best at anything, but rewarded for breadth. The Primal Force enchant was made for this class.

HP & Scaling
HP Modifier: +5% Equipment HP: Normal Damage Modifier: None

Weapon Affinities

Weapon TypeModifier
All weapon types
+3% damage (small universal bonus)
No weapon penalties
—
Bonus: Using 3+ different weapon types in 60s
+8% all damage for 30s
Wanderer is the ONLY class with no weapon penalties. They’re decent with everything and rewarded for variety.

Passive Abilities (5)
Adaptable Every 30 minutes of playtime, gain a permanent +1% to a random stat (damage, HP, speed, crit, armor). Max 10 stacks. Stacks persist through death but reset on class respec. The “just keep playing” passive. Wanderers who stick with the class get slowly stronger over time. Maximum of +10% to various stats after ~5 hours.
Worldly +5% damage in any dimension the Wanderer has spent more than 30 minutes in. Tracked per dimension. Max +5% per dimension, stacks across dimensions. Rewards exploration. A Wanderer who has explored 6+ dimensions has +30% damage in all of them. The “I’ve been everywhere” bonus.
Resourceful +15% bonus to all XP gained (mob kills, quests, crafting, cooking). +10% bonus to all loot drop quantity. The passive income class. Wanderers level faster and find more stuff. Pairs with the XP economy perfectly.
Jack of All Trades When wearing armor from 2+ different material types simultaneously (e.g., iron helmet + diamond chest
+ steel boots), gain +5% to all stats per unique material type (max +20% at 4 unique materials). Encourages mixed gear. Most
players optimize for matching sets; Wanderers want mismatched gear. Creates interesting gearing decisions and pairs with Convergence enchant.
Survivor +25% reduced death durability penalty. +20% reduced repair costs at anvils. The practical passive. Wanderers die less expensively. Given the death penalty system, this is real value — especially in harder dimensions.

Active Ability
Improvise Gain a random buff for 15 seconds. Possible buffs: +30% damage, +30% speed, +30% damage reduction, +50% crit chance, Regeneration III, or Invisibility. - Cooldown: 45 seconds - The wildcard. You never know what you’ll get, but it’s always strong. The Wanderer’s identity: adaptable and unpredictable.

PALADIN — Tank/Support/Healer

Identity: The holy warrior. Self-sustaining tank with group utility. Can heal allies, buff nearby players, and soak damage. The “I keep everyone alive” class. Moderate personal DPS.

HP & Scaling
HP Modifier: +10%
Equipment HP: Normal

Damage Modifier: None (but offensive passives are limited)

Weapon Affinities

Weapon TypeModifier
Swords (1H) + shield
+10% damage, +15% block effectiveness
Maces / Hammers
+10% damage
Healing spells
+20% effectiveness
Axes
Normal
Bows / Crossbows
-10% damage
Dark / Void magic
-25% damage
Passive Abilities (5)
Holy Aura Nearby allies within 8 blocks gain +5% damage reduction and +1 HP/5 seconds passive regeneration. Effect does not stack with other Paladins (strongest applies). The group utility. In multiplayer, having a Paladin nearby is a significant survivability boost. Pairs with Phalanx enchant.
Divine Resilience +15% effectiveness from all healing sources (potions, food, regeneration, life steal). Self-healing from combat (Bloodletting, life steal affixes, etc.) increased by +10%. Paladins are hard to kill because everything heals them more. Stacks with Leech enchant, Vampiric affix, etc.
Consecrated Ground Standing still for 3+ seconds creates a 4-block radius “Consecrated Ground” beneath the Paladin. Allies on it gain +10% damage reduction. Undead on it take 2 damage/second. Ground persists for 5 seconds after moving. Rewards positional play. Paladins who find a good spot and hold it are extremely tanky. Anti-synergy with mobile playstyles.
Shield of Faith When blocking with a shield, 20% of damage blocked is converted to a heal over 5 seconds. Blocking a killing blow has a 30% chance to fully negate it (once per 5 minutes). THE shield class. Makes shields from “occasionally useful” to “core class mechanic.” Pairs with shield-boosting affixes.
Smite +20% damage against undead, demons, and void entities. Kills on these enemy types emit a small heal pulse (2 HP) to nearby allies. Thematic and practical. Many dimension mobs are undead/demonic. In dungeons full of undead, Paladin DPS is competitive with offensive classes.

Active Ability
Lay on Hands Instantly heal self or a targeted ally for 30% of Paladin’s max HP. Remove all negative status effects. Target gains
+20% damage reduction for 5 seconds. - Cooldown: 90 seconds - The emergency button. In multiplayer, this saves lives. Solo, it’s
a powerful self-heal with cleanse. Long cooldown keeps it from trivializing survival.

VANGUARD — Pure Tank

Identity: The immovable object. Maximum survivability, minimal offense. The “you will not get past me” class. In multiplayer, the Vanguard is the one standing in front drawing aggro. Solo, they’re slow but nearly unkillable.

HP & Scaling
HP Modifier: +20%
Equipment HP: Normal
Damage Modifier: -15% all damage dealt

Weapon Affinities

Weapon TypeModifier
Swords (1H) + shield
+5% damage (offsets some of -15% penalty)
Maces / Hammers
+5% damage
Lances / Polearms
Normal
All other weapons
Subject to -15% penalty only
Bows / Crossbows
-15% penalty + additional -10% = -25% total
Passive Abilities (5)
Fortification +20% armor effectiveness from all sources. +15% shield block angle (wider block arc). Knockback resistance

+40%. The core tank passive. Vanguards are HARD to move and HARD to damage through armor. Combined with +20% HP, they’re walls.
Aggro Pulse Every 10 seconds in combat, emit a pulse that makes nearby hostile mobs (12-block radius) prioritize targeting the Vanguard over other players. Mobs affected gain a brief visual indicator. THE multiplayer tank mechanic. Vanguard draws aggro passively. In solo, this changes nothing. In groups, it’s transformative — the Vanguard takes hits so the Archmage doesn’t
have to.
Retribution When hit, reflect 10% of damage taken back to the attacker as magic damage. When blocking and hit, reflect 20% instead. Vanguard’s primary damage source against single targets. Since damage dealt is -15%, Retribution helps compensate — enemies hurt themselves hitting you. Scales with how hard you’re being hit.
Endurance Damage taken is reduced by 1% for every 5% of max HP missing (max -20% at 0% HP). Effectively: the lower your HP, the harder you are to kill. The “you can’t finish me” passive. Synergizes with the massive HP pool — a Vanguard at 20% HP still has more raw HP than most classes at full, and takes 16% less damage. Anti-synergy with Berserker’s damage-at-low-HP
philosophy — Vanguard gets tankier, not deadlier.
Ironclad Immune to armor-piercing effects up to 50% (if an attack pierces 80% of armor, Vanguard only has 30% pierced). Equipment durability loss from combat reduced by 25%. Counter to enemies designed to bypass tanks. Without this, high-tier mobs with armor pierce would make Vanguard’s identity meaningless. Also reduces the death durability penalty’s sting since
gear degrades slower in combat.

Active Ability
Unbreakable For 8 seconds, gain +50% damage reduction, immunity to knockback, immunity to all crowd control effects, and Aggro Pulse triggers every 2 seconds instead of every 10. - Cooldown: 120 seconds - The “this is MY ground” button. 8 seconds of near-invulnerability while pulling every mob onto you. In multiplayer boss fights, this is when your team goes all-out while you
tank everything.

RANGER — Ranged DPS

Identity: The mobile glass cannon. Maximum ranged damage, extreme mobility, paper-thin defenses. The “if they can’t reach me, they can’t hurt me” class. Punished heavily for being caught in melee.

HP & Scaling
HP Modifier: -20%
Equipment HP: Half effectiveness
Damage Modifier: None

Weapon Affinities

Weapon TypeModifier
Bows
+20% damage
Crossbows
+15% damage
Throwing weapons
+12% damage
Swords (1H, light)
Normal
Axes / Hammers / 2H
-20% damage
Magic Staves / Spells
-10% damage
Passive Abilities (5)
Eagle Eye +30% projectile velocity. +20% projectile accuracy (less spread). Arrows/bolts travel 50% further before despawning. Pure ranged enhancement. Ranger bows hit harder (more velocity = more damage in MC), more accurately, and at greater range. Makes sniping viable.
Predator’s Mark Hitting an enemy with a ranged attack “marks” them for 8 seconds. Marked enemies take +10% damage from ALL sources (including allies). Only one mark active at a time. The group utility for an otherwise selfish class. In multiplayer, the Ranger marks priority targets. Pairs with Harbinger’s Mark affix for stacking mark effects.
Fleet-Footed +12% movement speed. +20% movement speed for 3 seconds after hitting a ranged attack. -20% movement speed for 3 seconds when hit by a melee attack. The mobility passive — and its punishment. Rangers who maintain distance are fast. Rangers who get caught in melee are slowed. Heavily encourages kiting.
Windborne +20% damage while airborne (jumping, falling, flying). +10% damage while moving at sprint speed. -10% damage while standing still. Encourages mobile, dynamic ranged play. Standing still and sniping is penalized. Jumping and shooting is rewarded. Pairs with jetpacks for aerial combat.

Headhunter Critical hit chance with ranged weapons +15%. Critical hit damage with ranged weapons +25%. Critical hits have a 20% chance to refund the arrow/bolt. The raw DPS passive. Ranger crits are devastating. Arrow refund encourages aggressive play — shoot more, crit more, spend less.

Active Ability
Rain of Arrows Instantly fire 8 arrows in a spread pattern toward your crosshair. Each arrow deals 75% weapon damage. Arrows apply Predator’s Mark on hit. - Cooldown: 40 seconds - The AoE burst. Excellent for clearing groups or applying marks to multiple enemies in a boss fight with adds. Each arrow can crit via Headhunter for massive damage.

ARCHMAGE — Offensive Caster

Identity: The ultimate glass cannon spellcaster. Maximum spell damage, absolute minimum survivability. The “I will kill everything before it reaches me” class. The squishiest class in the game.

HP & Scaling
HP Modifier: -20%
Equipment HP: Half effectiveness
Damage Modifier: None

Weapon Affinities

Weapon TypeModifier
Magic Staves / Wands
+20% spell damage
Iron’s Spells (all schools)
+15% damage
Ars Nouveau spells
+15% damage
Mahou Tsukai spells
+15% damage
Swords (all)
-20% damage
Axes / Hammers
-25% damage
Bows / Crossbows
-10% damage
Passive Abilities (5)
Arcane Mastery +25% spell damage. +15% spell casting speed. -10% mana cost on all spells. The core passive. Raw spell power. Every spell an Archmage casts is significantly stronger than the same spell from any other class. Simple, powerful,
identity-defining.
Spell Penetration Spells ignore 20% of target’s magic resistance. Against enemies with magic shields/barriers, deal +30% damage. Counter to magic-resistant enemies that would otherwise hard-counter the class. Ensures Archmage stays relevant against all enemy types.
Glass Cannon For every 10% of max HP missing, gain +3% spell damage (max +30% at 0% HP). Does NOT gain defensive benefits at low HP. The defining tradeoff. Unlike Berserker (who gets attack speed too) or Vanguard (who gets damage reduction), Archmage only gets more damage. Being low HP is terrifying because you’re closer to death with no defensive tools.
Mana Well +30% max mana pool. Mana regeneration +20%. When mana is above 80%, gain +5% spell damage (reward for mana conservation). Sustain passive. Archmages have massive mana pools and can keep casting longer. The >80% bonus encourages efficient casting rather than spell spam.
Chain Reaction Killing an enemy with a spell has a 25% chance to trigger a free, weaker copy of that spell (50% damage) at a nearby enemy within 8 blocks. Chain Reaction cannot trigger Chain Reaction. The AoE passive. Archmages clear crowds fast. A fireball that kills one enemy might chain to a second. Doesn’t chain infinitely — controlled but impactful.

Active Ability
Arcane Annihilation For 8 seconds, all spells deal +50% damage, cost 0 mana, and have no cooldown. After the effect ends, lose 25% of current mana and cannot regenerate mana for 5 seconds. - Cooldown: 120 seconds - The nuclear button. 8 seconds of unlimited, supercharged spellcasting followed by a harsh mana penalty. Use it to obliterate a boss phase or clear a room, then
scramble to survive the recharge window.

ARTIFICER — Crafter/Non-Combat

Identity: The builder, the engineer, the mad scientist. No combat tradeoffs — average in all fights. Power comes from crafting

bonuses, machine efficiency, and economic advantages. The “my gear is better because I MADE it better” class.

HP & Scaling
HP Modifier: 0% (neutral) Equipment HP: Normal Damage Modifier: None

Weapon Affinities

Weapon TypeModifier
All weapons
Normal (no bonuses or penalties)
Mekanism tools (Atomic Disassembler, MekaTool)
+10% efficiency
Truly Modular weapons/tools
+10% effectiveness
Artificer has NO weapon penalties. They’re average fighters but excel with crafted/engineered weapons specifically.

Passive Abilities (5)
Master Craftsman Items crafted by the Artificer have a 15% chance to gain +1 enchantment level on a random existing enchantment (e.g., a Sharpness IV sword might become Sharpness V). Tools crafted have +10% base durability. THE Artificer passive. Their crafted items are inherently better. Pairs with Truly Modular (crafted weapons) for best-in-class gear.
Efficient Engineering Machines within 8 blocks of the Artificer operate 15% faster. RF generation from generators within 8 blocks increased by 10%. Furnace/smelting speed +25%. Proximity-based tech bonus. Artificers want to be near their machines. Base-building class identity.
Material Expertise +20% yield when processing ores (smelting, Thermal pulverizing, Mekanism enriching, Create crushing).
+10% chance for bonus byproducts. Economic powerhouse. Artificers get more out of every ore. In a pack where material
progression matters, this is significant value.
Blueprint Memory -25% XP cost for all anvil operations. -20% material cost for repairs. Enchanting costs reduced by -15% (less levels required). The “I’m good with tools” passive. Artificers maintain gear cheaply. Combined with the death penalty system, Artificers are the best at keeping gear in working condition.
Innovation Every 50 unique items crafted, gain a permanent +1% to all crafting-related bonuses (Master Craftsman chance, Efficient Engineering speed, Material Expertise yield). Max 10 stacks (+10%). The long-game passive. Artificers who craft widely get progressively better. Encourages engaging with many crafting systems.

Active Ability
Overcharge Instantly repair all equipped items by 20% of max durability. For 30 seconds, all equipped tools have +25% efficiency and +15% attack damage. - Cooldown: 300 seconds (5 minutes) - The “field repair” button. Long cooldown but powerful — full equipment maintenance + combat boost. The Artificer’s answer to “I need to fight right now but my gear is
damaged.”

VOID SUMMONER — Summoner/Necromancer

Identity: The puppet master. Commands minions to fight, drains life through them, vulnerable alone. The “my army fights for me” class. Dark magic flavor — spirits, undead, void entities.

HP & Scaling
HP Modifier: -10%
Equipment HP: Half effectiveness
Damage Modifier: None (personal damage low, minion damage high)

Weapon Affinities

Weapon TypeModifier
Summoning items (Occultism, Iron’s Spells summons)
+25% minion damage/duration
Magic Staves / Wands
+5% spell damage
Dark / Void magic
+15% damage
Swords (all)
-15% damage
Axes / Hammers
-20% damage

Bows / Crossbows
-10% damage

Passive Abilities (5)
Soul Tether All summoned entities (spirits, summons, pets) deal +20% damage and have +30% max HP. Summoned entities persist 25% longer before despawning. Maximum active summon count scales with max mana pool: 1 summon per 20% of mana pool (base 2 at low mana, scaling to 8-10+ at endgame mana pools). Summons beyond the cap replace the oldest summon. The
core summoner buff. Everything you summon is stronger, and your army SIZE grows with mana investment. Early game you have 2-3 tough minions. Endgame with a massive mana pool from gear/enchants, you command a swarm of 8-10. AoE can thin the herd but can’t wipe it in one shot because there are too many spread across the battlefield. Creates a clear build incentive: Void Summoners want mana-boosting gear not for casting, but for army size.
Life Siphon When a summoned entity deals damage, the Void Summoner heals for 5% of damage dealt. When a summoned entity kills an enemy, heal for 8% of the Summoner’s max HP. The sustain mechanic. Void Summoners don’t heal themselves directly — they heal THROUGH their minions. Minions alive = survivable. Minions dead = extremely vulnerable.
Void Bond When the Void Summoner takes damage, 20% of that damage is redirected to the nearest summoned entity instead. If no summons exist, this passive does nothing. Damage sharing. Your minions protect you by absorbing hits. Creates a feedback loop: summons alive = you’re tanky, summons die = you’re squishy AND you lose damage. Maintaining summons is
everything.
Death Harvest Enemies killed by summoned entities drop 50% more XP. Enemies killed by summoned entities have a 10% chance to drop a “Soul Fragment” (custom item) used for summoning costs. Economic passive. Void Summoners farm XP faster through minions. Soul Fragments reduce the cost of repeated summoning. Pairs with XP economy.
Necrotic Presence Enemies within 6 blocks of the Void Summoner have -10% damage and -10% movement speed. This aura does not stack with Aggro Pulse (Vanguard) — they serve different roles. Debuff aura. The Void Summoner weakens nearby enemies passively, making their minions (and allies) more effective. Flavor: their dark presence saps enemy strength.

Active Ability
Mass Reanimate Summon a wave of Void Specters that fight for 20 seconds. Specter count scales with max mana pool (minimum 3, scaling up with mana investment — endgame can summon 8-12). Specters deal moderate damage and explode on death, dealing AoE dark damage. While Specters are active, Life Siphon healing is doubled. - Cooldown: 90 seconds - The burst
summon. Floods the battlefield with temporary minions that heal you while fighting and deal AoE on death. Scales with the same mana stat as passive summon count — endgame Void Summoners with massive mana pools summon a small army on demand.

Enchantment & Affix Synergy Map

Best-in-Class Combos

ClassBest EnchantmentsBest Affixes
Berserker
Momentum, Adrenaline, Vitality
Berserker’s, Vampiric, Undying Flame
Samurai
Quick Draw, Magnetism, Last Stand
Phantom Dash, Keen Edge, Swift

Battlemage

Mana Temper, Adaptive, Convergence
Arcane Burst, Elemental Storm, Mana- Infused
Wanderer
Primal Force, Convergence, Resourceful
Convergence (affix), Worldly (affix), Vital
Paladin
Boss Ward, Phalanx, Vitality, Steadfast
Challenger’s Spirit, Guardian, Blessed
Vanguard
Boss Ward, Phalanx, Vitality, Adaptive
Fortified, Immovable, Battle Hardened
Ranger
Quick Draw, Momentum, Windborne
Keen Edge, Swift, Headshot

Archmage

Mana Temper, Last Stand, Vitality
Arcane Devastation, Spell Echo, Ender Siphon
Artificer
Soulbound, Magnetism, Prospector
Durable, Efficient, Material Mastery
Void Summoner
Mana Temper, Vitality, Nemesis
Soul Tether, Void Touch, Life Drain

Philosophy: Races provide innate traits with MILD tradeoffs. Less impactful than class choice. Permanent — chosen at creation.

Race Design Principles

Every race has 2-3 benefits and 1-2 drawbacks
Drawbacks are inconveniences, not crippling (unlike class tradeoffs which are build-defining)
Races should NOT overlap with class identities (no “warrior race” that duplicates Berserker)
Races should be thematic/flavor-driven with mechanical backing
Any race + any class should be viable (no mandatory race/class combos)

Race Tradeoff Template

Races modify secondary stats and provide unique utility. They do NOT modify HP% or damage% — that’s the class layer’s job.
What races CAN modify: - Movement speed (small, ±5-8%) - Hunger/saturation rates - Vision (night vision, underwater vision) - Environmental resistances (fire, cold, fall damage) - Size (via Pehkui if available) - Resource interaction (mining speed, farming yield) - Social (villager prices, mob aggro)
What races should NOT modify: - Max HP % (class layer) - Damage % (class layer) - Equipment effectiveness (class layer) - Weapon affinities (class layer)

Example Races (to be finalized based on Origins++/Overhaul available options)

These are design targets — actual implementation depends on what Origins++/Origins Overhaul provides as a base to modify.

Human
Benefits: +10% XP gain, neutral villager prices, no environmental weaknesses
Drawbacks: No special abilities. The “default” race.
Identity: Versatile, accelerated progression, pairs with anything.

Elf
Benefits: Night vision, +8% movement speed, +15% bow accuracy
Drawbacks: -10% hunger efficiency (eat more often), -1 armor toughness
Identity: Graceful, fast, fragile. Natural Ranger/Archmage pairing but viable with anything.

Dwarf
Benefits: +15% mining speed, +10% armor toughness, fire resistance (50%)
Drawbacks: -5% movement speed, -8% jump height
Identity: Sturdy, underground specialist. Natural Vanguard/Artificer pairing.

Orc
Benefits: +10% melee knockback, +5% attack speed, intimidation (weak enemies flee)
Drawbacks: +15% hunger drain, -10% villager prices (hostility)
Identity: Aggressive, hungry. Natural Berserker pairing.

Halfling
Benefits: +20% food efficiency, +10% luck (affects loot tables), smaller hitbox (if Pehkui) Drawbacks: -10% melee reach, -5% attack damage (flat, before class modifiers) Identity: Lucky, efficient, small. Natural Wanderer/Ranger pairing.

Undead / Revenant
Benefits: No hunger (don’t need to eat), night vision, +10% damage in darkness
Drawbacks: Take damage in direct sunlight (1 HP/5s without helmet), -20% healing from food/potions, Smite enchant deals
+25% to you
Identity: Dark, cursed, self-sufficient. Natural Void Summoner pairing. Risk/reward — powerful at night, vulnerable by day.

Faefolk
Benefits: Slow fall (passive), +15% nature magic effectiveness, flowers/crops grow faster nearby
Drawbacks: Iron items deal +10% damage to you, -5% HP (flat, small)

Identity: Magical, nature-attuned, iron-vulnerable. Natural Battlemage/Archmage pairing.

Demi-God
Benefits: +40% HP (8 hearts), 2x raw meat healing, strength ability, phase ability, fire damage 1.5x
Drawbacks: Mild Nether weakness
Identity: Divine-blooded powerhouse. High durability with strong offensive tools. Natural Berserker/Vanguard/Paladin pairing.

Ryu
Benefits: 25% damage reduction, slow fall, draconic food healing, sparkles, clears debuffs
Drawbacks: Meat preference
Identity: Draconic, resilient, debuff-proof. Natural Paladin/Vanguard/Wanderer pairing. Built for sustained survival.

Fallen Angel
Benefits: +15% all damage, slow fall, velocity dash, translucent
Drawbacks: -20% HP (4 hearts), meat preference
Identity: Glass cannon with mobility. High damage output offset by reduced survivability. Natural Ranger/Archmage/Samurai pairing.

Kirin
Benefits: +0.1 movement speed, wall climbing, sprint jump, cat vision, speed boost
Drawbacks: -20% HP (4 hearts)
Identity: Speed and mobility specialist. Highly mobile with vertical traversal. Natural Ranger/Wanderer/Samurai pairing.

Origins — Custom Additions (2 new origins, 11 total)

Design rules: No lethal effects, food preferences not restrictions, elytra flight reserved for Elytrian, each heart = 5% HP.

Witch of Ink
Powers: Paint magic (unique ability set), 50% food reduction, feeds from paintings.
Progression: Boss counter tracks kills up to 200 max. Scaling rewards: increased damage, damage reduction, and armor toughness as counter rises. Blessing of Penthesilea capstone ability unlocked at high boss count.
Identity: Artistic caster with deep progression loop. Gets stronger the more bosses defeated.

Artificial Construct
Powers: 25% food efficiency, iron eating (consumes iron ingots and iron blocks for sustenance).
Progression: Iron upgrade ladder — consume iron to progress through levels. Thresholds: 1000→16000 iron consumed. Each level grants +5% bonus, max +25% at final level.
Identity: Mechanical being that literally eats metal. Rewards dedication to resource gathering with permanent stat bonuses.

Technical Requirements

Class System (G&H RPG Classes modification)
All class definitions are Origins datapacks — fully customizable
Attribute modifiers via Apothic Attributes (G&H dependency)
Active abilities via Origins power system (cooldown-based keybind)
Weapon affinities: Use item-conditional attribute modifiers (Origins supports “when holding item with tag X”)
“Half equipment HP” mechanic: Override max_health attribute contributions from equipment slots with a 0.5 multiplier for affected classes

Race System (Origins++/Overhaul modification)
Race layer separate from class layer (Origins supports multiple layers)
Environmental effects via Origins conditions
Size modification via Pehkui integration (if available)
All race traits are origins powers — datapack customizable

Respec Station
Custom block or item via KubeJS: “Class Altar”
Recipe: tier-appropriate boss material + crafting station
On use: consumes 1 boss drop + 30 levels, opens class selection screen
Can be placed and shared (multiplayer convenience)

Interaction with Other Systems
Class HP modifiers apply BEFORE all other HP modifications
Equipment HP halving applies AFTER enchantments/affixes calculate their HP bonus Race traits stack with class traits (additive, not multiplicative)
Pufferfish’s Skills are unaffected by class/race (pure bonuses as designed) JustLevelingFork level-up HP is unaffected by equipment HP halving
Spice of Life food HP is unaffected by equipment HP halving

Generic Power + Class/Build-Oriented Investment

Skills are the third character layer (Race → Class → Skills). The established rules:
Skills are always positive. No drawbacks, no tradeoffs — that’s the class layer’s job.
Skills enhance builds, not define them. A Berserker without skill investment is still a Berserker. Skills make them a better
Berserker.
Respec costs 5 levels per point refunded. Cheap enough to experiment, expensive enough to discourage constant respeccing.
Skills are NOT affected by class or race. Every class has equal access to every tree. A Vanguard CAN invest in the Sorcery tree if they want to — it’s just less efficient for them.

The Core Tension: Generic vs. Specialized

The system supports two investment strategies:
Generalist: Spread points across multiple trees. Broad, moderate bonuses. Good for Wanderer, Battlemage, Samurai — hybrid classes that benefit from everything.
Specialist: Go deep into one tree. Powerful focused bonuses + capstone abilities. Good for Berserker (Warfare deep), Archmage (Sorcery deep), Ranger (Marksman deep) — classes with clear focus.
Neither strategy is strictly better. Generalists have flexibility; specialists have peak power in their niche. The math is tuned so that going deep gives maybe +15-20% more effectiveness in your specialty versus spreading, but the generalist gets meaningful bonuses across multiple contexts.

Point Sources

Each tree has its OWN independent XP track and point pool. You don’t earn “generic skill points” — you earn Combat XP, Gathering XP, etc. This naturally guides players toward trees matching their activity.

TreeXP SourcePoints Per Level
Warfare
Melee kills
1
Marksman
Ranged kills (bow/crossbow/thrown)
1

Sorcery
Spell casts (Iron’s Spells, Ars Nouveau, Mahou Tsukai) + magic kills

1

Fortitude
Damage taken (XP scales with damage amount)

1

Gathering
Mining ore, chopping logs, harvesting crops, fishing

1

Engineering
Crafting items, operating machines, smelting

1
XP curve per tree: Starts at 50 XP for level 1, scales to ~500 XP by level 25, ~2000 XP by level 40. Each level grants 1 skill point in that tree.
Level cap per tree: 40. With 40 points per tree and 6 trees, a max-level character has 240 total skill points. This is intentionally unreachable in normal play — even heavy endgame players will have 25-30 in their main trees, 15-20 in secondary, and 5-10 in tertiary. Forces prioritization.
Anti-farming: Pufferfish’s Unofficial Additions supports anti-farming. XP from identical actions diminishes over time (killing the same mob type repeatedly gives progressively less XP per kill). Encourages variety.

Each tree uses a branching layout. The first ~8 nodes are a shared trunk of generic stats. Then the tree splits into 2-3 specialized branches. At the bottom of each branch is a capstone — a powerful node requiring deep investment.
Players can invest in the trunk without committing to a branch. But branches contain the best returns per point.
**Visual Layout:** Each tree is roughly:

```
        [Root]
        /    \
    [Stat]  [Stat]
       |      |
    [SPLIT] [SPLIT]
    /    \
[Branch A] [Branch B]
    ...       ...
[Capstone] [Capstone]
```

Nodes connected by lines. Each node costs 1 point. Some nodes require multiple neighbors unlocked (branching prerequisites). Capstones require ~12-15 points spent in that branch to unlock.

XP Source: Melee kills

Trunk (Shared — 8 nodes)

NodeNameEffectAttribute
1
Brute Force I
+5% melee damage
puffish_attributes:melee_damage
2
Brute Force II
+5% melee damage
puffish_attributes:melee_damage
3
Iron Grip I
+5% attack speed
generic.attack_speed
4
Iron Grip II
+5% attack speed
generic.attack_speed
5
Thick Hide I
+4% melee resistance
puffish_attributes:melee_resistance
6
Thick Hide II
+4% melee resistance
puffish_attributes:melee_resistance
7
Vigor I
+2 max HP
generic.max_health
8
Vigor II
+2 max HP
generic.max_health
Trunk total at 8 points: +10% melee damage, +10% attack speed, +8% melee resistance, +4 max HP

Branch A: Berserker’s Path (Sustained DPS)

Focus: raw damage output, attack speed, life on hit. Synergizes with Berserker, Samurai, Battlemage classes.
NodeNameEffectCost
A1
Relentless Strikes I
+6% melee damage
1
A2
Relentless Strikes II
+6% melee damage
1
A3
Bloodlust I
+1% life steal
1
A4
Ferocity I
+6% attack speed
1
A5
Ferocity II
+6% attack speed
1
A6
Bloodlust II
+2% life steal
1
A7
Savage Blows I
+8% melee damage
1
A8
Savage Blows II
+8% melee damage
1
A9
Relentless Strikes III
+6% melee damage
1
A10
Bloodlust III
+2% life steal
1

A-CAP

Unending Fury
+15% melee damage, +5% life steal

2
Requires: 10+ points in Branch A (12 total to reach capstone)
Branch A total (with capstone): +49% melee damage, +12% attack speed, +10% life steal Full tree (trunk + A): +59% melee damage, +22% attack speed, +8% melee resistance, +4 HP, +10% life steal

Branch B: Duelist’s Path (Precision)

Focus: critical hits, weapon-specific bonuses, single-target damage. Synergizes with Samurai (first-strike), Battlemage (spell- strike).

NodeNameEffectCost
B1
Precision I
+3% crit chance (via luck)
1
B2
Sword Mastery I
+8% sword damage
1
B3
Axe Mastery I
+8% axe damage
1
B4
Precision II
+3% crit chance
1
B5
Lethal Edge I
+8% crit damage (via command
1

| B6 | Sword Mastery II | +8% sword damage | 1 |
| B7 | Axe Mastery II | +8% axe damage | 1 |
| B8 | Precision III | +4% crit chance | 1 |
| B9 | Lethal Edge II | +12% crit damage | 1 |
| **B-CAP** | **Perfect Strike** | **+10% crit chance, +20% crit damage** | **2** |

> **Note:** Sword Mastery and Axe Mastery are on separate sub-branches. Players can invest in both weapon types, but reaching the capstone fastest means focusing on one sub-path. Uses `puffish_attributes:sword_damage` and `puffish_attributes:axe_damage`.

XP Source: Ranged kills (bows, crossbows, thrown weapons)

Trunk (8 nodes)

NodeNameEffect
1
Steady Aim I
+5% ranged damage
2
Steady Aim II
+5% ranged damage

3

Quick Hands I
+5% draw speed (via attack speed modifier on ranged)
4
Quick Hands II
+5% draw speed
5
Hawk Eye I
+3% accuracy / reduced spread
6
Hawk Eye II
+3% accuracy
7
Nimble I
+4% movement speed
8
Nimble II
+4% movement speed
Trunk total: +10% ranged damage, +10% draw speed, +6% accuracy, +8% movement speed

Branch A: Sniper’s Path (Single Target)

Focus: Massive single-shot damage. Charged shots, crit scaling. Synergizes with Ranger (Eagle Eye, Headhunter passives).
NodeNameEffectCost
A1
Steady Shot I
+6% ranged damage
1

A2

Penetration I
+4% ranged resistance shred on target

1
A3
Steady Shot II
+8% ranged damage
1

A4

Kill Shot I
+10% damage to targets below 30% HP (command)

1
A5
Penetration II
+4% ranged resistance shred
1
A6
Steady Shot III
+8% ranged damage
1

A7

Kill Shot II
+10% damage to targets below 30% HP

1
A8
Penetration III
+4% ranged resistance shred
1
A9
Steady Shot IV
+10% ranged damage
1

A-CAP

Deadeye
+15% ranged damage, +8% ranged resistance shred

2
Branch A total (with capstone): +47% ranged damage, +20% ranged resistance shred, +20% bonus to low-HP targets

Branch B: Volley Path (AoE / Speed)

Focus: Fire rate, multi-target, arrow economy. Synergizes with Ranger (Rain of Arrows active), Void Summoner (crossbow + minion swarm).

NodeNameEffectCost
B1
Rapid Fire I
+6% draw speed
1

B2

Arrow Conservation I
+5% ammo save chance (via command/tag reward)

1
B3
Rapid Fire II
+6% draw speed
1

B4

Scatter Shot I
+5% AoE splash on ranged (command reward)

1

| B5 | Arrow Conservation II | +5% ammo save chance | 1 |
| B6 | Rapid Fire III | +8% draw speed | 1 |
| B7 | Scatter Shot II | +5% AoE splash | 1 |
| B8 | Arrow Conservation III | +5% ammo save chance | 1 |
| B9 | Rapid Fire IV | +8% draw speed | 1 |
| **B-CAP** | **Storm of Arrows** | **+15% draw speed, +10% ammo save, 2-block AoE splash** | **2** |

XP Source: Spell casts + magic kills (via Pufferfish’s Unofficial Additions Iron’s Spells integration)

Trunk (8 nodes)

NodeNameEffect
1
Arcane Power I
+5% magic damage
2
Arcane Power II
+5% magic damage
3
Mana Flow I
+5% mana regen (via command modifier)
4
Mana Flow II
+5% mana regen
5
Spell Haste I
+3% cast speed
6
Spell Haste II
+3% cast speed
7
Arcane Shield I
+4% magic resistance
8
Arcane Shield II
+4% magic resistance
Trunk total: +10% magic damage, +10% mana regen, +6% cast speed, +8% magic resistance

Branch A: Destruction Path (Raw Spell Power)

Focus: Maximum spell damage, spell penetration, mana efficiency. Synergizes with Archmage (Glass Cannon, Arcane Mastery), Battlemage (Arcane Infusion charges).

NodeNameEffectCost
A1
Overwhelming Power I
+6% magic damage
1
A2
Arcane Penetration I
+4% magic resistance shred
1
A3
Overwhelming Power II
+8% magic damage
1
A4
Mana Efficiency I
-5% mana cost (command reward)
1
A5
Arcane Penetration II
+4% magic resistance shred
1
A6
Overwhelming Power III
+8% magic damage
1
A7
Mana Efficiency II
-5% mana cost
1
A8
Arcane Penetration III
+4% magic resistance shred
1
A9
Overwhelming Power IV
+10% magic damage
1

A-CAP

Arcane Supremacy
+15% magic damage, +8% magic resistance shred, -5% mana cost

2
Branch A total (with capstone): +47% magic damage, +20% magic resistance shred, -15% mana cost

Branch B: Enchanter’s Path (Utility Magic / Summoning)

Focus: Healing effectiveness, buff/debuff duration, summoning power. Synergizes with Paladin (Holy Aura, Lay on Hands), Void Summoner (Soul Tether).
NodeNameEffectCost
B1
Restorative Touch I
+8% healing effectiveness
1
B2
Minion Mastery I
+8% tamed/summon damage
1
B3
Restorative Touch II
+8% healing effectiveness
1
B4
Extended Influence I
+5% buff duration (command reward)
1
B5
Minion Mastery II
+8% tamed/summon damage
1
B6
Soul Bond I
+8% tamed/summon resistance
1
B7
Restorative Touch III
+8% healing effectiveness
1

B8
Minion Mastery III
+10% tamed/summon damage
1
B9
Extended Influence II
+5% buff duration
1

B-CAP

Grand Enchantment
+12% healing, +12% summon damage, +10% buff duration

2
Branch B total (with capstone): +36% healing, +38% summon damage, +20% buff duration, +8% summon resistance
Note: Minion Mastery uses puffish_attributes:tamed_damage. Soul Bond uses puffish_attributes:tamed_resistance. These affect ALL summoned/tamed entities owned by the player.

XP Source: Damage taken (XP scales with damage amount — taking 10 damage gives more XP than taking 1)

Trunk (8 nodes)

NodeNameEffect
1
Constitution I
+4 max HP
2
Constitution II
+4 max HP
3
Tough Skin I
+4% resistance (all damage)
4
Tough Skin II
+4% resistance
5
Regeneration I
+5% healing received
6
Regeneration II
+5% healing received
7
Steady Footing I
+15% knockback resistance
8
Steady Footing II
+15% knockback resistance
Trunk total: +8 max HP, +8% all resistance, +10% healing received, +30% knockback resistance

Branch A: Iron Wall (Pure Tanking)

Focus: Maximum survivability, armor effectiveness, HP stacking. Synergizes with Vanguard (Fortification, Endurance), Paladin (Shield of Faith).

NodeNameEffectCost
A1
Enduring Body I
+6 max HP
1
A2
Armor Mastery I
+1 armor toughness
1
A3
Enduring Body II
+6 max HP
1
A4
Elemental Resistance I
+4% resistance
1
A5
Armor Mastery II
+1 armor toughness
1
A6
Enduring Body III
+8 max HP
1
A7
Elemental Resistance II
+4% resistance
1
A8
Armor Mastery III
+1 armor toughness
1
A9
Enduring Body IV
+8 max HP
1

A-CAP

Unbreakable
+10 max HP, +2 armor toughness,
+6% all resistance

2
Branch A total (with capstone): +38 max HP, +5 armor toughness, +14% resistance Full tree (trunk + A): +46 max HP (+23 hearts), +5 armor toughness, +22% all resistance, +10% healing received, +30% KB resistance

Branch B: Survivor’s Path (Sustain & Recovery)

Focus: Healing, regen, sustain in extended fights. Synergizes with Berserker (Bloodletting), Paladin (Divine Resilience), any class doing Rift runs.

NodeNameEffectCost
B1
Recovery I
+8% healing received
1

B2

Natural Regen I
+0.5 HP/5s base regen (command reward)

1
B3
Recovery II
+8% healing received
1
B4
Stamina I
+1 stamina (food efficiency)
1
B5
Natural Regen II
+0.5 HP/5s base regen
1
B6
Recovery III
+10% healing received
1

B7
Stamina II
+1 stamina
1
B8
Natural Regen III
+1 HP/5s base regen
1
B9
Recovery IV
+10% healing received
1

B-CAP

Undying
+15% healing received, +1 HP/5s
regen, +2 stamina

2
Branch B total (with capstone): +51% healing received, +3 HP/5s regen, +4 stamina

XP Source: Mining ore, chopping logs, harvesting crops, fishing

Trunk (8 nodes)

NodeNameEffect
1
Efficient Miner I
+5% mining speed
2
Efficient Miner II
+5% mining speed
3
Sharp Axe I
+5% breaking speed (logs)
4
Sharp Axe II
+5% breaking speed
5
Green Thumb I
+5% crop yield (command reward)
6
Green Thumb II
+5% crop yield
7
Lucky Strike I
+0.3 fortune
8
Lucky Strike II
+0.3 fortune
Trunk total: +10% mining speed, +10% breaking speed, +10% crop yield, +0.6 fortune
Note: Pufferfish’s Attributes fortune supports fractions. +0.6 fortune means 60% chance for Fortune I equivalent, even without the enchant. Stacks with Fortune enchant.

Branch A: Prospector’s Path (Mining)

Focus: Deep mining bonuses, ore doubling, vein mining efficiency. Synergizes with Artificer (Material Expertise), Dwarf race.
NodeNameEffectCost
A1
Deep Mining I
+8% mining speed
1
A2
Ore Sense I
+0.4 fortune
1
A3
Deep Mining II
+8% mining speed
1
A4
Yield Mastery I
+5% ore processing bonus (command)
1
A5
Ore Sense II
+0.4 fortune
1
A6
Deep Mining III
+10% mining speed
1
A7
Yield Mastery II
+5% ore processing bonus
1
A8
Ore Sense III
+0.5 fortune
1
A9
Deep Mining IV
+10% mining speed
1

A-CAP

Motherlode
+15% mining speed, +0.5 fortune,
+5% ore processing

2
Branch A total (with capstone): +51% mining speed, +1.8 fortune, +15% ore processing

Branch B: Harvester’s Path (Farming & Fishing)

Focus: Crop yield, animal husbandry, fishing. Synergizes with Halfling race (+food efficiency), Spice of Life food system.
NodeNameEffectCost
B1
Bountiful Harvest I
+8% crop yield
1
B2
Fisher’s Touch I
+10% fishing speed (command)
1
B3
Bountiful Harvest II
+8% crop yield
1

B4

Animal Whisperer I
+10% animal breeding speed (command)

1
B5
Fisher’s Touch II
+10% fishing speed
1
B6
Bountiful Harvest III
+10% crop yield
1

| B7 | Green Magic I | +5% bonemeal efficiency (command) | 1 |
| B8 | Animal Whisperer II | +10% animal breeding speed | 1 |
| B9 | Bountiful Harvest IV | +10% crop yield | 1 |
| **B-CAP** | **Nature’s Bounty** | **+15% crop yield, +10% fishing speed, +10% breeding speed** | **2** |

XP Source: Crafting items, operating machines, smelting

Trunk (8 nodes)

NodeNameEffect

1

Quick Hands I
+5% crafting speed (if applicable, else +5% smelting speed)
2
Quick Hands II
+5% crafting speed

3

Resource Saver I
+3% chance to not consume materials on craft (command)
4
Resource Saver II
+3% chance
5
Machine Efficiency I
+5% machine speed (command, nearby machines)
6
Machine Efficiency II
+5% machine speed
7
Tool Care I
-5% durability loss on tools
8
Tool Care II
-5% durability loss on tools
Trunk total: +10% crafting speed, +6% material save, +10% machine speed, -10% durability loss

Branch A: Artificer’s Path (Crafting Quality)

Focus: Better crafting outcomes, enchanting efficiency, repair cost reduction. Synergizes with Artificer class (Master Craftsman, Blueprint Memory).

NodeNameEffectCost

A1

Master Touch I
+3% chance to craft +1 output (command)

1
A2
Enchanting Insight I
-5% enchanting cost (XP)
1
A3
Master Touch II
+3% chance to craft +1 output
1
A4
Repair Mastery I
-8% anvil repair cost
1
A5
Enchanting Insight II
-5% enchanting cost
1
A6
Master Touch III
+4% chance to craft +1 output
1
A7
Repair Mastery II
-8% anvil repair cost
1
A8
Enchanting Insight III
-5% enchanting cost
1
A9
Master Touch IV
+5% chance to craft +1 output
1

A-CAP

Grand Artificer
+5% craft +1 output, -10% enchanting cost, -10% repair cost

2
Branch A total: +20% chance of bonus crafting output, -25% enchanting cost, -26% repair cost

Branch B: Engineer’s Path (Machine & Automation)

Focus: Machine speed, RF generation, automation efficiency. Synergizes with Artificer (Efficient Engineering), tech-path players.
NodeNameEffectCost
B1
Overclock I
+8% machine speed (nearby)
1
B2
Power Surge I
+5% RF generation (command)
1
B3
Overclock II
+8% machine speed
1
B4
Fuel Efficiency I
-8% fuel consumption (command)
1
B5
Power Surge II
+5% RF generation
1
B6
Overclock III
+10% machine speed
1

| B7 | Fuel Efficiency II | -8% fuel consumption | 1 |
| B8 | Power Surge III | +8% RF generation | 1 |
| B9 | Overclock IV | +10% machine speed | 1 |
| **B-CAP** | **Master Engineer** | **+15% machine speed, +10% RF gen, -10% fuel consumption** | **2** |

The skill system rewards investment that matches your class, but doesn’t punish mismatched investment.
Class
Primary Tree
Secondary Tree
Tertiary Tree
Reasoning

Berserker

Warfare (A: Berserker’s Path)

Fortitude (B: Survivor’s)

—
Life steal + sustain = unkillable in sustained fights

Samurai

Warfare (B: Duelist’s)

Marksman (A: Sniper’s)

—
Crit scaling + ranged precision = Way of the Blade synergy

Battlemage

Warfare (trunk)

Sorcery (A: Destruction)

—
Moderate melee + strong spells = Arcane Infusion fuel

Wanderer

Any trunk × 3-4

—

—
Generalist wants broad moderate bonuses

Paladin

Fortitude (A: Iron Wall)

Sorcery (B: Enchanter’s)

—
Tank HP + healing effectiveness = Holy Aura + Lay on Hands

Vanguard

Fortitude (A: Iron Wall)

Warfare (trunk)

—
Maximum HP + some melee to offset -15% damage penalty

Ranger

Marksman (A: Sniper’s)

Gathering (trunk)

—
Max ranged damage
+ fortune for resource runs

Archmage

Sorcery (A: Destruction)

Fortitude (trunk)

—
Max spell damage + survivability to offset glass cannon

Artificer

Engineering (both)

Gathering (A: Prospector’s)

—
Max crafting + mining
= Artificer’s identity

Void Summoner

Sorcery (B: Enchanter’s)

Fortitude (B: Survivor’s)

—
Summon damage + sustain to offset low personal HP

Why Mismatched Investment Still Works

Nothing is blocked, but some combinations give reduced returns due to class weapon affinities: - Vanguard investing in Marksman
→ class has -25% bow damage, so ranged skill bonuses are applied to a reduced base - Archmage investing in Warfare → class has -20% sword, -25% axe damage - Ranger investing deep in Warfare → class has -20% to axes/2H
The class weapon affinity penalties mean skill investment in mismatched trees gives diminished returns. But the skills themselves still apply — they’re just multiplicative with a smaller base. A Ranger with 10 Warfare trunk points still gets +10% melee damage; it’s applied to their penalty-reduced melee, so the absolute gain is less than a Berserker’s identical investment.

Skills vs. Other Systems

How much of a character’s total power comes from skills?
Power SourceApproximate Contribution
Base class passives/actives
~25% of combat identity
Equipment (weapons + armor + enchants + affixes)
~35% of raw stats
Pufferfish’s Skills investment
~15-20% of raw stats
JustLevelingFork passive levels
~10% of raw stats
Race traits
~5% of raw stats
Spice of Life food HP
~5-10% of max HP
Skills are meaningful but not dominant. A player with zero skill investment is ~15-20% weaker than one with maxed trees. Enough to feel the difference without making skills the only thing that matters.

Endgame Power from Skills (Estimated, ~30 points in primary tree)

BuildSkill Contribution
Berserker (Warfare deep A)
+49% melee damage, +22% attack speed, +10% life steal
Ranger (Marksman deep A)
+47% ranged damage, +20% resistance shred, +20% low-HP bonus
Archmage (Sorcery deep A)
+47% magic damage, +20% magic resist shred, -15% mana cost
Vanguard (Fortitude deep A)
+46 max HP, +5 armor toughness, +22% all resistance
Artificer (Engineering both)
+20% craft bonus, -25% enchant cost, +51% machine speed
These numbers interact multiplicatively with class bonuses. A Berserker’s Blood Fury (+20%) stacks with skills (+49%) for devastating melee output.

Capstones cost 2 points and require deep branch investment (~12-15 spent points in the branch path). Each capstone is approximately equal to 3-4 regular nodes combined — the reward for specialization.
Capstone accessibility: A focused player reaches their primary capstone by tree level ~20 (trunk 8 + branch 10 + capstone 2
= 20 points). Reaching both capstones in one tree requires nearly full investment (~32+ points, tree level 35+) — true endgame specialist territory.
Most players will have 1 capstone in their primary tree and 0-1 in their secondary. Capstones are aspirational, not guaranteed.

Required Mods

Pufferfish’s Skills — Framework (datapack-configured)
Pufferfish’s Attributes — Custom attributes (melee_damage, ranged_damage, magic_damage, sword_damage, axe_damage, healing, resistance, magic_resistance, melee_resistance, ranged_resistance, tamed_damage, tamed_resistance, fortune, mining_speed, breaking_speed, stamina, life_steal, jump)
Pufferfish’s Unofficial Additions — XP source integrations (spell casting via Iron’s Spells, crop harvesting, fishing)

Implementation as Datapack

All trees are defined via JSON datapacks. Each tree is a “category” in Pufferfish’s Skills:

```
data/
  modpack_skills/
    puffish_skills/
      categories/
        warfare/
          category.json
          skills/
            brute_force_1.json
            ...
            unending_fury.json
          connections/
        marksman/
        sorcery/
        fortitude/
        gathering/
        engineering/
```

Command Rewards

Several effects (machine speed, mana cost reduction, buff duration, crop yield, ammo save, etc.) cannot be implemented via pure attributes. These use Pufferfish’s Skills command rewards — executing commands or applying scoreboard tags when a node is unlocked, which are read by KubeJS scripts to apply the effect.

Example: Mana Efficiency node unlocked → sets scoreboard `mana_cost_reduction` to 5 → KubeJS reads this value and modifies spell mana costs by that percentage.

This is the most implementation-heavy part of the skill system. Attribute-based nodes (damage, HP, resistance, speed) are simple JSON. Command-based nodes require KubeJS scripting for each custom effect.
Implementation priority: Build attribute-based trees first (fully functional). Add command-based effects iteratively. Trees work without the command effects — players just get the attribute bonuses — so partial implementation is viable.

### Respec Details

```
/puffish_skills skills reset <player> <category>
```

Per established rules: 5 levels per point refunded. Individual tree respec via the command above.
At endgame with Tax Free Levels mod, 5 levels is trivial per point. Respeccing a 30-point tree costs 150 levels — meaningful but affordable. Supports horizontal build diversity from the endgame loop design.

Integration with Death Penalty

Skill points are NOT lost on death. Skills are permanent growth, not at-risk. This makes skills feel like genuine progression rather than something punitive.

Integration with Class Respec

When respeccing class, skill points are NOT reset. A Berserker with 30 Warfare points who switches to Paladin keeps those points. The Warfare investment is suboptimal for Paladin but still functional. Respeccing skills is a separate additional cost — creating interesting decisions about whether to reallocate or run a hybrid skill profile.

Tree
Trunk Bonus (8 pts)
Branch A Theme
Branch B Theme
Level Cap

Warfare
+10% melee, +10% AS, +8% melee
res, +4 HP

Sustained DPS + life steal

Crit + weapon mastery

40

Marksman
+10% ranged, +10% draw, +6% acc,
+8% MS

Single-target sniper

AoE + fire rate

40

Sorcery
+10% magic, +10% mana regen, +6% cast, +8% magic res

Raw spell power

Healing + summoning

40

Fortitude
+8 HP, +8% res, +10% healing, +30% KB res

Tank HP + armor

Sustain + regen

40

Gathering
+10% mine, +10% break, +10% crop,
+0.6 fortune

Mining + ore yield

Farming + fishing

40

Engineering
+10% craft, +6% material save,
+10% machine, -10% dur loss

Crafting quality

Machine + automation

40
Total nodes across all trees: ~180 Max attainable in reasonable endgame play: ~120-150 Enough for 2-3 deep trees + 1-2 trunks

Full Affix Registry for Modpack

CategoryCountAvailabilityPurpose

Generic Power

~35

All tiers, all dimensions
Bread-and-butter stats, every drop feels exciting

Dimensional

~30

Specific dimensions only
Themed souvenirs, reward exploration

Boss-Themed

~15

Specific boss kills only
Rarest affixes, bragging rights
Tier-Gated
~15
Tier 2/3/4+ only
Power escalation markers
Total
~95

Available at ALL tiers, ALL dimensions. These are the core affix pool that makes every piece of gear potentially interesting. Organized by slot.

Weapon Affixes — Offensive

Flat Damage

AffixEffectRarity Range
Sharpened
+5–15% melee damage
Common–Rare
Brutal
+10–25% melee damage
Uncommon–Epic
Devastating
+20–40% melee damage
Rare–Mythic
Vorpal
+3–10% chance to deal 3x damage on hit
Uncommon–Epic
Titanic
+15–30% damage, but -5–10% attack speed
Rare–Mythic
Attack Speed

AffixEffectRarity Range
Swift
+5–15% attack speed
Common–Rare
Flurry
+10–25% attack speed
Uncommon–Epic
Blinding Speed
+20–35% attack speed, -5% damage
Rare–Mythic
Critical Hits

AffixEffectRarity Range
Precise
+5–10% critical hit chance
Common–Rare
Keen
+10–20% critical hit chance
Uncommon–Epic
Lethal
+15–25% critical hit damage multiplier
Rare–Mythic
Assassin’s
+10% crit chance + 10% crit damage
Epic–Mythic
On-Hit Effects

AffixEffectRarity Range

Venomous
10–25% chance to apply Poison I (3s) on hit

Common–Rare

Igniting
10–25% chance to ignite target (3s) on hit

Common–Rare

Chilling
10–25% chance to apply Slowness I (3s) on hit

Common–Rare

Withering
5–15% chance to apply Wither I (3s) on hit

Uncommon–Epic

Stunning
3–8% chance to apply Slowness III
+ Weakness I (1s) on hit

Rare–Mythic

Bleeding
Attacks apply stacking bleed (1 HP/s per stack, max 3–5 stacks)

Uncommon–Epic

Electrified
8–15% chance to chain lightning to 1–3 nearby mobs (2 damage each)

Uncommon–Epic

Corroding
Attacks reduce target’s armor by 1– 3 points for 5s (stacks)

Rare–Mythic

Sustain
Rarity RangeRarity Range
Rarity Range
Rarity Range

AffixEffect
Leeching
2–5% life steal on hit
Uncommon–Rare
Vampiric
5–10% life steal on hit
Rare–Epic
Siphoning
Kills restore 1–3 hunger points
Common–Uncommon
Invigorating
Kills grant Speed I for 3–5 seconds
Common–Rare
Harvesting
Kills grant +10–25% bonus XP
Common–Rare

Reach & AoE

AffixEffectRarity Range
Long
+0.5–1.5 block attack reach
Common–Rare
Sweeping
+15–30% sweep damage
Common–Rare

Cleaving
Attacks hit in a wider arc (+20–40% sweep area)

Uncommon–Epic

Shockwave
Charged attacks release ground shockwave (2–4 block range)

Rare–Mythic

Weapon Affixes — Utility

AffixEffectRarity Range
Luminous
Struck mobs glow for 5–10 seconds
Common
Knockback
+15–30% knockback dealt
Common–Uncommon

Grounding
-50–100% knockback dealt (keeps enemies close)

Uncommon–Rare

Magnetic
Items dropped by killed mobs are attracted to player (3–5 block range)

Uncommon–Rare
Lucky
+1–3 Luck stat while held
Common–Rare

Silencing
5–10% chance to prevent mob abilities for 3s on hit

Rare–Epic

Armor Affixes — Defensive

Flat Defense

AffixEffectRarity Range
Reinforced
+3–8% damage reduction
Common–Rare
Hardened
+5–12% damage reduction
Uncommon–Epic
Impervious
+10–20% damage reduction
Rare–Mythic

Reflective
5–15% chance to reflect 20–50% melee damage back to attacker

Uncommon–Epic

Thorned
Attackers take 1–4 flat damage when hitting you

Common–Rare
HP & Healing

AffixEffectRarity Range
Hearty
+1–4 max HP (half hearts)
Common–Rare
Vigorous
+2–6 max HP
Uncommon–Epic
Vital
+4–10 max HP
Rare–Mythic
Regenerating
+5–15% natural regeneration speed
Common–Rare

Mending Touch
+10–25% healing received from all sources

Uncommon–Epic

Second Wind
When dropping below 30% HP, gain Regeneration II for 5s (60s cooldown)

Rare–Mythic

Resistance

AffixEffectRarity Range
Fireproof
+10–25% fire damage reduction
Common–Rare

Insulated
+10–25% explosion damage reduction

Common–Rare

Grounded
+10–25% lightning/magic damage reduction

Common–Rare

Warded
+10–25% projectile damage reduction

Common–Rare
Stalwart
+15–30% knockback resistance
Common–Rare

Adaptable
+5–10% resistance to whatever damage type last hit you (5s)

Epic–Mythic

Armor Affixes — Mobility

AffixEffectRarity Range
Fleet
+3–8% movement speed
Common–Rare
Nimble
+5–12% movement speed
Uncommon–Epic
Bounding
+5–15% jump height
Common–Rare
Featherweight
-20–50% fall damage taken
Common–Rare

Acrobatic
-30–60% fall damage + 5% movement speed

Uncommon–Epic

Sprinter’s
+10–20% sprint speed (only while sprinting)

Uncommon–Rare

Aquatic
+15–30% swim speed + slower air drain

Common–Rare
Climbing
+10–20% ladder/vine climb speed
Common

Armor Affixes — Utility

AffixEffectRarity Range
Nourishing
-5–15% hunger drain rate
Common–Rare
Enlightened
+5–15% XP gained from all sources
Common–Rare
Prospector’s
+1–2 Luck stat
Common–Rare

Nightvision
Slight brightness boost in dark areas (not full night vision)

Uncommon
Warm
Reduced Freezing damage/duration
Common

Durable
+10–25% equipment durability (slower degradation)

Common–Rare

Repairing
Very slow passive durability regeneration (1 point per 60–120s)

Rare–Epic

Pocketed
+3–6 inventory slots (if possible via Apotheosis)

Rare–Epic

Shield Affixes

AffixEffectRarity Range

Steadfast
-10–25% shield disable time when broken by axe

Common–Rare

Reflective
10–20% chance to reflect projectiles when blocking

Uncommon–Epic

Absorbing
Blocking restores 0.5–1 HP per block

Uncommon–Rare

Repulsing
Blocking creates small knockback wave (1–2 block radius)

Rare–Epic

Guardian’s
+5–10% damage reduction for 3s after successful block

Uncommon–Rare

Fortifying
Blocking grants Resistance I for 2–3 seconds

Rare–Epic

Dimensional Affixes

ONLY drop from gear found/dropped in their specific dimension. Proof of exploration.

Twilight Forest

AffixSlotEffectRarity

Twilight’s Embrace

Armor
Regeneration I in forest biomes + 10% move speed at night

Rare

Nagascale

Armor
+15% knockback resistance + 5% movement speed

Uncommon

Lichbane

Weapon
+20% damage to undead + chance to inflict Weakness

Rare

Hydra’s Fury

Weapon
Attacks deal small AoE splash (1- block radius)

Epic

Twilit

Weapon
+15% damage while in dim light (not full dark, not full bright)

Uncommon

Ironwood’s Resilience

Armor
+5% damage reduction + slow durability regen in forests

Rare

Phantom Glow

Weapon
Struck mobs emit light for 10s + glow through walls

Uncommon

Blue Skies

AffixSlotEffectRarity

Stormforged

Weapon
8% chance to call lightning on critical hits

Epic

Frostward

Armor
Slows melee attackers + 20% freeze resistance

Rare
Everdawn
Armor
Slow HP regen while above Y=128
Rare

Starfall

Weapon
Charged attacks call down a delayed AoE strike from above

Epic

Permafrost

Weapon
Attacks build up freeze on target (5 hits = 2s freeze)

Rare

The Aether

AffixSlotEffectRarity

Zephyr’s Grace

Armor
+20% movement speed + 30% reduced fall damage

Rare

Valkyrie’s Strike

Weapon
+25% damage while airborne/falling

Rare
Cloudwalker
Boots
Brief double-jump on 5s cooldown
Epic

Aether-touched

Armor
+10% damage to non-Aether mobs while in Aether, +10% damage to all mobs outside Aether

Uncommon

Updraft

Armor
Taking fall damage creates an updraft (partial bounce, 50% damage negation)

Rare

The Undergarden

AffixSlotEffectRarity

Rotbane
Weapon
Bonus damage to Undergarden mobs + poison immunity while held
Rare

Deeproot

Armor
+15% max HP while underground (below Y=0)

Rare

Gloomward

Shield
Chance to blind attackers for 2s on block

Rare

Sporeguard

Armor
Immunity to negative effects from Undergarden flora

Uncommon

Deepstone

Armor
+10% damage reduction while below Y=0

Uncommon

Deeper and Darker

AffixSlotEffectRarity

Sculk Resonance

Armor
Nearby hostile mobs glow (8-block detection radius)

Rare

Abyssal Edge

Weapon
+20% damage in darkness + attacks apply brief Darkness effect

Epic

Warden’s Echo

Weapon
Charged attack: sonic boom (ranged AoE, 15s cooldown)

Mythic

Echolocating

Helmet
Hostile mobs within 16 blocks visible through walls (pulsing glow)

Epic

Deepwound

Weapon
Attacks reduce target’s healing received by 30% for 5s

Rare

The Nether

AffixSlotEffectRarity

Soulfire

Weapon
Attacks apply soul fire (bypasses fire resistance)

Epic

Wither-touched

Weapon
10% chance to apply Wither II on hit

Rare

Blazeforged

Armor
Fire damage aura when below 30% HP (damages nearby mobs)

Epic

Netherquake

Weapon
Sprint-attack: ground slam AoE + knockback (8s cooldown)

Epic

Magma Walker

Boots
Brief fire immunity when stepping on magma/lava source (1s, 10s cooldown)

Rare

Soul Speed

Boots
+30% speed on soul sand/soil (stacks with vanilla Soul Speed)

Uncommon

Ghast’s Spite

Weapon
Projectile attacks deal +25% damage

Rare

Hellforged

Armor
+25% fire damage reduction + melee attackers take 1 fire damage

Rare

Deep Aether

Affix
Slot
Effect
Rarity

Ascendant

Armor
All positive potion effects last 20% longer

Epic

2x damage to undead + attacks

Celestial Radiance
Weapon
emit healing light (0.5 HP to nearby allies)
Epic

Skyshatter

Weapon
Massively increased knockback + 2x damage to flying mobs

Rare

Stratospheric

Armor
+15% movement speed + immunity to Levitation effect

Rare

Empyrean

Armor
+5% to all damage reduction types simultaneously

Epic

The End

AffixSlotEffectRarity

Voidwalker

Weapon
Short teleport toward target on hit (3 blocks, 5s cooldown)

Mythic

Ender Siphon

Weapon
Kills restore 5% max durability (synergy with death penalty!)

Epic

Null Gravity

Armor
Permanent Slow Falling + increased jump height

Rare

Chorus Shift

Armor
When hit below 20% HP: random teleport nearby (escape, 30s cooldown)

Epic

End’s Dominion

Weapon
+25% damage to End mobs + weakens enderman teleport

Rare

Void Gaze

Helmet
See all entities within 32 blocks (like spectral arrows, permanent)

Mythic

Entropic

Weapon
Each consecutive hit on same target deals +5% more damage (resets after 3s)

Epic

Shulker’s Guard

Armor
When hit: 10% chance to gain Levitation immunity + Resistance I for 3s

Rare

Boss-Themed Affixes

ONLY drop from killing specific designed bosses. Rarest affixes in the game. Each boss has ONE signature affix.

Tier 2 Boss Affixes

Boss

Affix
Slot
Effect
Drop Rate

Twilight Naga

Serpent’s Coil

Weapon
Attacks apply stacking poison (up to 3x), final stack = Poison II

15–20%

Twilight Lich

Soulstealer

Weapon
Kills grant 2 absorption hearts for 10s (stacks up to 6)

15–20%

Twilight Hydra

Undying Flame

Armor
Survive lethal hit at 1 HP + fire nova (5 min cooldown)

10–15%

Twilight Ur-Ghast

Spectral Wail

Weapon
Kills terrify nearby mobs (flee for 5s, 8-block range)

15–20%

Twilight Knight Phantom

Phantom Dash

Armor
Double-tap sprint for a short dash (invulnerable during, 8s cooldown)

15–20%

Blue Skies Summoner

Summoner’s Accord

Weapon
Kills have 5% chance to spawn a friendly phantom ally (30s duration)

10–15%

Aether Slider

Unbreakable

Armor
+30% knockback resistance + immune to Levitation + Slowness

15–20%

Aether Valkyrie Queen

Valkyrie Ascension

Armor
While airborne: +15%
damage dealt, -15% damage taken

10–15%

Tier 3 Boss Affixes

Boss
Affix
Slot
Effect
Drop Rate

Cataclysm Harbinger

Harbinger’s Mark

Weapon
Attacks mark target: marked enemies take
+25% from ALL sources (5s)

10–15%

Cataclysm Ignis

Ignis Core

Armor
Fire damage heals you instead of hurting you

10–15%

Wither

Necrotic Supremacy

Weapon
Wither you apply also heals you for damage dealt

10–15%

Meet Your Fight bosses

Challenger’s Spirit

Armor
+10% damage dealt and
-10% damage taken when fighting a boss mob

15–20%

Undergarden boss

Forgotten King’s Authority

Weapon
Attacks have 3% chance to instantly kill non-boss mobs below 15% HP

10–15%

Deeper Darker Warden

Sculkheart

Armor
When hit: sonic pulse damages all mobs in 4- block radius (10s CD)

10–15%

Tier 4 Boss Affixes

Boss
Affix
Slot
Effect
Drop Rate

Intimidation aura: mobs

Ender Dragon
Dragon’s Dominion
Armor
within 8 blocks deal -15% damage
10%

Gaia Guardian

Gaia’s Judgment

Weapon
Execute: bonus damage scaling with target’s missing HP (up to +50% at 10% HP)

10%

Gaia Guardian II

Nature’s Wrath

Weapon
Every 5th hit triggers a nature explosion (3-block AoE, Poison II + knockback)

8%

Cataclysm Ender Guardian

Reality Fracture

Weapon
5% chance per hit to freeze target in time (1.5s stun, 15s cooldown)

8%
Cataclysm Ancient Remnant

Primordial Force

Weapon
Attacks ignore 30% of target’s armor

8%

Ultimate Boss (pack-specific)

Worldbreaker

Weapon
+15% damage to ALL mob types + attacks cause screen shake for nearby players (PvE flex)

5%

Tier-Gated Power Affixes

Cannot appear below their minimum tier. Represent escalating power.

Tier 2+ (Unavailable in Overworld)

AffixSlotEffectRarity
Tempered
Armor
+5–8% all damage reduction
Uncommon–Rare
Keen Edge
Weapon
+10–15% critical hit chance
Uncommon–Rare
Surefooted
Armor
Immunity to Slowness effect
Uncommon

Battle Hardened

Armor
+3% damage reduction per nearby hostile mob (max 5 stacks)

Rare

Relentless

Weapon
+10% damage to targets you’ve hit in the last 3s (rewards focus)

Rare

Tier 3+ (Unavailable before Undergarden/Nether)

AffixSlotEffectRarity
Lifedrinking
Weapon
5–10% life steal on hit
Rare–Epic
Fortified
Armor
+5–10 max HP
Rare–Epic

Arcane Resonance

Weapon
+15–25% magic damage (Iron’s Spells, Ars Nouveau, Mahou Tsukai)

Rare–Epic

Berserker’s

Armor
+1% damage dealt per 5% missing HP (up to +20% at critical health)

Epic

Elemental Mastery

Weapon
+10% to all elemental damage types (fire, ice, lightning, etc.)

Epic

Juggernaut

Armor
+10% max HP + 10% knockback resistance, but -5% movement speed

Rare

Executioner’s

Weapon
+20% damage to targets below 30% HP

Rare–Epic

Tier 4+ (End/Deep Aether Only)

AffixSlotEffectRarity

Immortal

Armor
Negate a killing blow (set to 1 HP), 10 min cooldown

Mythic

Annihilation

Weapon
+25% damage to targets above 50% HP (anti-tank)

Epic–Mythic

Transcendence

Armor
All attribute bonuses from ALL other sources +10%

Mythic

Convergence

Armor
Stats boosted when wearing mixed tech + magic gear (hybrid reward)

Epic

Omnivamp

Weapon
3% of ALL damage dealt (including spell/ability) returned as HP

Mythic

Apex Predator

Weapon
+5% damage per Champion/Boss killed in last 10 min (max +25%)

Epic

Dimensional Attunement

Armor
+5% all stats in dimensions you’ve fully explored (all bosses killed)

Mythic

Perfected Form

Armor
+2% to every stat per Mythic-rarity item equipped (stacking self- synergy)

Mythic

Affix Interaction Notes

Stacking Rules

Multiple instances of the same affix type across gear pieces should stack additively (e.g., two Hearty pieces = combined HP bonus)
Boss-themed affixes are unique — only one of each can be active at a time
Percentage bonuses cap at reasonable limits (e.g., damage reduction caps at 80%, life steal at 25%)

Synergies to Highlight

Ender Siphon (kills restore durability) synergizes with death penalty system — skilled players can counteract durability loss through combat
Berserker’s (bonus damage at low HP) + Second Wind (regen at low HP) = risk/reward tension
Harbinger’s Mark (target takes +25% from all sources) is incredible in multiplayer — one player marks, everyone benefits
Convergence (hybrid gear bonus) directly rewards the dual-path design philosophy
Perfected Form (bonus per Mythic equipped) = the ultimate chase affix, rewards full Mythic loadout
Dimensional Attunement (bonus in explored dimensions) rewards thorough exploration and boss completion

Anti-Synergies / Tradeoffs

Titanic (damage up, speed down) vs Blinding Speed (speed up, damage down) — can’t fully stack both
Berserker’s (wants low HP) vs Vital (wants high HP) — different build philosophies
Grounding (no knockback on enemies) vs Knockback — opposite effects

Custom Affix Implementation

All custom affixes implemented via Apotheosis datapack JSON files:
- `data/apotheosis/affixes/` for affix definitions
- `data/apotheosis/loot_entries/` for loot pool assignments
- Dimensional restriction via LootJS (control which affix items can drop where)
- Boss restriction via LootJS (inject boss-specific affix gear into boss loot tables)

Apotheosis Boss Configuration

Scaling by Dimension

Dimension
Boss Spawn Rate
Rarity Cap
Affix Rarity on Drops
Gem Quality
Custom Affix Pool

Overworld

~2% of hostiles

Uncommon

Common–Uncommon
Flawed– Chipped

Generic only
Twilight/Blue Skies/Aether

~4%

Rare

Uncommon–Rare
Chipped– Normal

Generic + Dimensional
Undergarden/Deeper Darker

~6%

Epic

Rare–Epic
Normal– Flawless
Generic + Dimensional
+ Tier 3

Nether

~8%

Epic

Rare–Epic
Normal– Flawless
Generic + Dimensional
+ Tier 3

Deep Aether

~8%

Mythic

Epic–Mythic
Flawless– Perfect
Generic + Dimensional
+ Tier 4
The End
~10%
Mythic
Epic–Mythic
Perfect
All pools available

Apotheosis Boss vs Other Boss Systems

SystemRoleSpawn TypeLoot

Apotheosis Bosses
World mini-bosses, loot piñatas

Random spawn (% of hostiles)
Affix gear they’re wearing + gems

Champions
Elite mobs with combat modifiers
Random spawn (15–60% depending on dimension)
Slightly better vanilla drops

Designed Bosses (Twilight, Cataclysm, etc.)

Main progression encounters

Fixed location / summoned
Simply Swords uniques, progression tokens, boss materials, signature weapons

Progressive Bosses

Scaling modifier on designed bosses

Modifier on existing bosses
Same as base boss but better quality with each kill

Apotheosis Enchanting

Ungated. Material cost of bookshelves IS the natural gate.
Tier 1 players build basic setups (low Eterna/Quanta/Arcana) Better bookshelves require better materials (naturally tier-gated)
Treasure enchants accessible when Eterna/Arcana thresholds are met No artificial staging on enchanting table or bookshelves

Apotheosis Gem Tiers

Gems require boss materials to craft. Tiered by source:
Gem QualitySourceAvailable From
Flawed
Overworld structure loot
Tier 1
Chipped
Tier 2 boss drops / dimension loot
Tier 2
Normal
Tier 2–3 boss drops
Tier 2–3
Flawless
Tier 3 boss drops / Nether loot
Tier 3
Perfect
Tier 4 boss drops / End loot
Tier 4

### Reforging Progression

| Reforging Tier | Requirement | What It Does |
|----------------|-------------|-------------|
| Basic
Tier 2 progression token
Reroll affixes (random outcome)

Advanced

Tier 3 token + expensive materials
Reroll with weighted odds toward desired type
Ultimate
Tier 4 token + Gaia ingots/antimatter
Reroll with guaranteed minimum rarity

Full Enchantment Registry for Modpack

Enchantments = reliable, always-on, controllable. Affixes = random, proc-based, flashy.
Custom enchantments fill gaps where players want predictable effects not covered by vanilla or Ensorcellation. They should NEVER duplicate affix effects — instead they complement them.

Enchantment Level Scaling (Apotheosis)

Apotheosis allows above-vanilla enchant levels. All enchantments (vanilla, Ensorcellation, custom) follow this model: - Levels I–V: Obtainable with Tier 1–2 bookshelf setups - Levels VI–VIII: Require Tier 3 bookshelf setups (high Eterna) - Levels IX–X: Require Tier 4 bookshelf setups (max Eterna + Quanta) - Naturally gated by bookshelf material cost, NOT by AStages

Enchanting Access

Fully ungated. Bookshelf material cost is the gate. No artificial staging on enchanting table, bookshelves, or enchantment types.

Soulbound (Ensorcellation — Repurposed & Merged with Salvaging)

Original effect: Keep item on death (redundant with keep-inventory) New effect: Item does NOT lose durability on death + cannot go inert from death at max level

LevelDurability ProtectionInert Protection
I
50% of death durability loss prevented
No
II
75% of death durability loss prevented
No
III
100% of death durability loss prevented
Item CANNOT go inert from death durability loss
Max obtainable level: III Applicable to: All equipment (weapons, armor, tools) Rarity: Treasure enchant (high Arcana required — not found randomly, must seek it) Design note: The single most valuable enchant in the pack. Soulbound III on a Mythic-affix netherite weapon means dying has literally zero consequence for that item — no durability loss, no chance of going inert. Players will hunt for this. Pairs with Ender Siphon affix (kills restore durability) for complete durability management during gameplay, while Soulbound covers death. Note: items can still go inert from normal combat/use durability drain — Soulbound only protects against DEATH durability loss.

CategoryCountPurpose

Dimensional Survival

5
Defensive bonuses for specific dimension types
Resource Enhancement
3
Economic/gathering improvements
Scaling Combat
5
Effects that grow with player stats/situation
Anti-Boss
3
Specifically effective against boss entities
Path Synergy
4
Reward tech/magic/hybrid investment
Utility & Survival
5
Quality of life combat/survival enchants
Total
25 (+1 repurposed Soulbound)

Dimensional Survival Enchants

Always-on defensive effects for surviving harsh dimensions. Complement dimensional affixes which are offensive/flashy.

Heatward

Effect: Reduces fire/lava damage and fire tick duration. Applicable to: Armor (all pieces)
LevelFire Damage ReductionFire Tick Duration
I
+10% fire resistance
-15% duration
II
+15% fire resistance
-25% duration
III
+20% fire resistance
-35% duration
IV
+25% fire resistance
-50% duration
V
+30% fire resistance
-60% duration
Max level: V (via Apotheosis) Design note: Stacks across armor pieces. Full set of Heatward V = significant fire damage reduction for Nether survival. Does NOT grant full immunity — Ignis Core boss affix does that. This is the reliable, grindable version.

Voidward

Effect: Reduces void damage tick rate and grants brief levitation when entering void (escape window). Applicable to: Boots
LevelVoid Damage DelayVoid Entry Levitation
I
+0.5s between ticks
0.5s levitation
II
+1.0s between ticks
1.0s levitation
III
+1.5s between ticks
1.5s levitation
IV
+2.0s between ticks
2.0s levitation
V
+3.0s between ticks
2.5s levitation
Max level: V Design note: Critical for End exploration. Doesn’t prevent void death, but gives you a reaction window. Higher levels give more time to ender pearl or fly out. The “oh no” panic enchant.

Depthstrider

Effect: Reduces damage taken while below Y=0 and improves visibility in dark areas underground. Applicable to: Helmet
Level
Damage Reduction Below Y=0
Dark Vision Boost
I
+5%
Slight
II
+8%
Moderate
III
+12%
Significant
IV
+15%
Major
V
+20%
Near-full
Max level: V Design note: Essential for Undergarden, Deeper Darker, and deep cave exploration. The vision boost is NOT full night vision — it’s a brightness increase that makes dark areas playable without torches. Stacks with Sculk Resonance affix (which reveals mobs) for total underground awareness.

Aether Acclimation

Effect: Reduces Aether-specific debuffs and increases movement speed at high altitudes. Applicable to: Armor (all pieces)
Level
Debuff Resistance
Speed Above Y=192
I
+10%
+3%
II
+15%
+5%
III
+20%
+8%

IV
+25%
+10%
V
+30%
+12%
Max level: V Design note: For Aether and Deep Aether. The speed bonus at altitude encourages building and fighting on high platforms. Stacks across armor pieces.

Warp Shield

Effect: Reduces teleportation-related effects (Enderman displacement, Shulker levitation, Chorus fruit forced teleport).
Applicable to: Chestplate
LevelTeleport Effect Reduction
I
20% chance to resist forced teleport
II
35% chance to resist
III
50% chance to resist
IV
65% chance to resist
V
80% chance to resist
Max level: V Design note: End survival enchant. Shulker levitation is lethal over void. Enderman displacement is disorienting in group fights. This gives reliable protection. Pairs with Chorus Shift affix (which WANTS you to teleport) creating an interesting choice — do you resist all teleports, or embrace them?

Resource Enhancement Enchants

Economic/gathering improvements. Affixes are combat-focused; these cover the non-combat side.

Prospector

Effect: Chance to double ore drops when mining (does NOT stack with Fortune — takes the better result). Applicable to:
Pickaxe
LevelDouble Drop Chance
I
8%
II
15%
III
22%
IV
30%
V
40%
Max level: V (Apotheosis can push higher) Design note: Different from Fortune. Fortune adds extra drops; Prospector straight doubles everything. They don’t stack — game takes whichever result is higher. This means Prospector is better for already-rich veins, Fortune is better for rare single ores. Players choose based on what they’re mining. Pairs with ore duplication chain (Create
→ Thermal → Mekanism) for insane yields at high tiers.

Lumberjack

Effect: Mining a log block also breaks connected logs above it (tree felling), with durability cost per block. Applicable to: Axe
LevelMax Connected BlocksDurability Cost Per Block
I
8
2 per block
II
16
2 per block
III
32
1 per block
IV
64
1 per block
V
128 (full large tree)
0.5 per block
Max level: V Design note: Quality of life meets resource gathering. Higher levels = bigger trees + cheaper durability. Pairs with
Durable affix (slower degradation) to offset durability cost.

Reaping

Effect: Crops broken with this tool have a chance to drop bonus seeds/produce AND auto-replant. Applicable to: Hoe
Level
Bonus Drop Chance
Auto-Replant Chance
I
10%
20%
II
20%
35%
III
30%
50%
IV
40%
65%
V
50%
80%
Max level: V Design note: Huge for the food system. Spice of Life requires food diversity, which means lots of different crops. Reaping V on a netherite hoe makes farming significantly less tedious. The auto-replant is the real QoL prize. Pairs with Serene Seasons (seasonal crops) — auto-replant only works if the crop can grow in current season.

(Removed — Merged into Soulbound)

Salvaging’s concept (items never destroy) is now baseline game behavior — items go inert at 0 durability instead of breaking. The “prevent going inert on death” aspect was merged into Soulbound III.

Scaling Combat Enchants

Effects that grow based on player state, situation, or stats. More interesting than flat bonuses.

Momentum

Effect: Damage increases the longer you’ve been in continuous combat (hitting without being hit). Resets when you take damage. Applicable to: Weapon (sword/axe)

Level
Damage Per Consecutive Hit
Max Stacks
I
+2% per hit
5 stacks (+10%)
II
+3% per hit
7 stacks (+21%)
III
+4% per hit
10 stacks (+40%)
IV
+5% per hit
12 stacks (+60%)
V
+6% per hit
15 stacks (+90%)
Max level: V Design note: Rewards skilled play — dodge hits to maintain stacks. At Momentum V with 15 stacks, you’re dealing nearly double damage. But one hit resets everything. Pairs with Phantom Dash boss affix (invulnerable dash to avoid hits) for stack maintenance. Anti-synergy with Berserker’s affix (wants low HP = getting hit). Forces a build choice.

Adrenaline

Effect: Below a health threshold, gain increased attack speed and movement speed. Applicable to: Armor (chestplate)
Level
Health Threshold
Attack Speed Boost
Move Speed Boost
I
Below 30% HP
+10%
+5%
II
Below 35% HP
+15%
+8%
III
Below 40% HP
+20%
+10%
IV
Below 45% HP
+25%
+12%
V
Below 50% HP
+30%
+15%
Max level: V Design note: The “cornered animal” enchant. Synergizes beautifully with Berserker’s affix (+damage at low HP) for a full low-HP build. Anti-synergy with Second Wind affix (heals you at low HP, pulling you OUT of Adrenaline range). Build choices matter.

Titan Slayer

Effect: Bonus damage that scales with the target’s max HP. More effective against tanky mobs. Applicable to: Weapon (sword/axe)

LevelBonus Damage Per 20 HP of Target Max HP
I
+2%
II
+3%
III
+5%
IV
+7%
V
+10%
Example at V: Against a mob with 200 HP (common in Tier 3+ dimensions), +100% bonus damage. Against a boss with 1000 HP, +500% bonus damage (capped at reasonable maximum).
Max level: V Design note: THE boss-fighting enchant. Scales with your difficulty system — as mobs get more HP in harder dimensions, Titan Slayer becomes more valuable. Needs a reasonable cap (probably +200-300% max) to prevent one-shotting bosses. Pairs with Gaia’s Judgment affix (execute damage on low HP targets) for a full boss-killer build: Titan Slayer for the first 50%, Gaia’s Judgment for the finish.

Crowd Control

Effect: Damage increases based on the number of hostile mobs within a radius. Rewards fighting groups. Applicable to:

Weapon (sword/axe)
LevelBonus Per Nearby Hostile (8-block radius)Max Bonus
I
+3% per mob
+15% (5 mobs)
II
+4% per mob
+24% (6 mobs)
III
+5% per mob
+35% (7 mobs)
IV
+6% per mob
+48% (8 mobs)
V
+7% per mob
+70% (10 mobs)
Max level: V Design note: Perfect for dungeon crawling and mob-dense dimensions. Anti-synergy with Momentum (Crowd Control = getting swarmed, Momentum = not getting hit). Different playstyles: the careful duelist vs the chaotic brawler. Pairs with Battle Hardened tier-gated affix (+damage reduction per nearby mob) for a full “I want to be surrounded” build.

Adaptive

Effect: After being hit by a damage type, gain temporary resistance to that type. Stacks per unique damage type. Applicable to: Armor (all pieces)

Level
Resistance Per Adapted Type
Duration
Max Types
I
+5%
10s
2
II
+8%
12s
3
III
+10%
15s
3
IV
+12%
18s
4
V
+15%
20s
5
Max level: V Design note: Rewards staying in long fights. After being hit by fire, melee, magic, and projectiles, you’re adapted to all four. At Adaptive V across a full armor set (stacking), you’d have meaningful resistance to everything hitting you. Pairs with Adaptable affix (single-type resistance) for layered defense. Exceptional for multi-phase boss fights that use different attack types.

Anti-Boss Enchants

Specifically designed for fighting boss-type entities. Complement boss-themed affixes (which are offensive); these are defensive/tactical.

Boss Ward

Effect: Reduced damage taken from entities classified as bosses. Applicable to: Armor (all pieces)
LevelBoss Damage Reduction
I
+4%
II
+6%
III
+8%
IV
+10%
V
+12%
Max level: V Design note: Simple but critical. Full set of Boss Ward V across 4 armor pieces = 48% boss damage reduction (before other defenses). Given your bosses can one-shot undergeared players, this is the “I’m going boss hunting” enchant. Stacks with Challenger’s Spirit boss affix (+10% damage dealt and -10% taken vs bosses) and Dragon’s Dominion affix (nearby mobs deal -15% damage) for a full boss-tank build.

Steadfast

Effect: Resistance to boss-inflicted crowd control effects (knockback, levitation, blindness, slowness from boss attacks).
Applicable to: Armor (leggings)
LevelCC Duration Reduction (Boss Sources)
I
-15%
II
-25%
III
-35%
IV
-45%
V
-60%
Max level: V Design note: Bosses that knock you into the void, blind you, or chain-slow you are the most frustrating deaths. Steadfast doesn’t prevent the CC — just shortens it. At V, a 3-second boss stun becomes 1.2 seconds. Enough to react, not enough to trivialize. Pairs with Unbreakable boss affix (immunity to specific CC types) for layered CC protection.

Nemesis

Effect: After dying to a boss, gain a stacking damage bonus against that specific boss entity type for your next attempt.
Applicable to: Weapon (sword/axe)
LevelDamage Bonus Per Death (to that boss)Max StacksDuration
I
+5%
3 (+15%)
Until boss killed
II
+7%
4 (+28%)
Until boss killed
III
+10%
5 (+50%)
Until boss killed
IV
+12%
6 (+72%)
Until boss killed
V
+15%
7 (+105%)
Until boss killed
Max level: V Design note: This is THE casual-friendly boss enchant. Dying to a boss makes you stronger against it next time. At Nemesis V, 7 deaths = +105% damage on your next attempt. Combined with Progressive Bosses (bosses get harder each KILL), this creates a beautiful tension: you get stronger against a boss through deaths, but each time you BEAT it, it gets harder for next time. The boss arms race.

Path Synergy Enchants

Reward investment in tech, magic, or hybrid paths.

Mana Temper

Effect: Gear replenishes durability slowly when the player is near active mana sources (Botania mana pools, Ars Nouveau source jars, etc.). Applicable to: All equipment

LevelDurability Per Minute Near Mana
I
1 point
II
2 points
III
4 points
IV
6 points
V
10 points
Max level: V Design note: The magic-path alternative to Mending. Instead of XP → durability, it’s mana proximity → durability. A magic player with a Botania mana setup can passively repair all their gear just by standing near it. Incompatible with Mending (pick one repair method). Pairs with Mana-Infused affix (similar but from affixes) — if both are present, repair rate increases further.

RF Capacitance

Effect: While RF-powered items are in inventory (jetpacks, capacitors, Mekanism tools), gain bonus armor toughness and knockback resistance. Applicable to: Armor (all pieces)

Level
Armor Toughness (if RF item in inventory)
Knockback Resistance
I
+0.5
+5%
II
+1.0
+8%
III
+1.5
+12%
IV
+2.0
+15%
V
+2.5
+20%
Max level: V Design note: The tech-path defensive enchant. Tech players carrying jetpacks, power cells, or Mekanism tools get passive tankiness. Flavor: the RF field from your tech gear reinforces your armor. Pairs with tech endgame (Mekasuit, etc.) for stacking tech bonuses.

Convergence

Effect: If wearing at least one piece of magic-origin armor AND one piece of tech-origin armor, gain bonus to all stats.
Applicable to: Armor (all pieces)
LevelAll-Stats Bonus (if hybrid gear)
I
+3%
II
+5%
III
+7%
IV
+9%
V
+12%
Max level: V Design note: The hybrid enchant. Incentivizes mixing terrasteel boots with a Mekanism chestplate. Stacks across pieces — 4 pieces of Convergence V with hybrid gear = +48% all stats. That’s MASSIVE. But requires deliberate build planning: you need gear from both paths. Pairs with Convergence affix (same concept from affix side) for the ultimate hybrid reward. The game explicitly tells hybrid players: you are rewarded.

Primal Force

Effect: Damage bonus that scales with the number of different combat-related mods the player has actively engaged with

(Botania mana generated, RF consumed, spells cast, Truly Modular weapons used, etc.). Applicable to: Weapon
Level
Bonus Per Engaged System
Max Systems
I
+3%
3 (+9%)
II
+4%
4 (+16%)
III
+5%
5 (+25%)
IV
+6%
6 (+36%)
V
+8%
7 (+56%)
Max level: V Design note: The “jack of all trades” enchant. A player who uses Botania, Ars Nouveau, Iron’s Spells, Truly Modular weapons, Mekanism tools, thermal machines, AND Create processing gets the full bonus. Rewards engaging broadly with the pack rather than specializing. Counterpart to Convergence (which rewards specific hybrid gear) — Primal Force rewards hybrid gameplay.
Implementation complexity: HIGH. Requires tracking per-player engagement across mod systems. May need to simplify to something like “scales with number of different magic/tech items in inventory” instead of active engagement tracking.

Utility & Survival Enchants

Quality of life for combat and survival.

Magnetism

Effect: Nearby item drops and XP orbs are attracted to the player. Always-on version of the Magnetic affix. Applicable to: Armor (chestplate)

LevelAttraction RangeAttraction Speed
I
3 blocks
Slow
II
5 blocks
Moderate
III
7 blocks
Fast
IV
9 blocks
Fast
V
12 blocks
Very fast
Max level: V Design note: Pure QoL. No more running around picking up drops after a fight. Pairs with Magnetic affix (kill- triggered pull) but Magnetism is always-on and affects XP too. At V, items fly to you from 12 blocks. Extremely satisfying.

Last Stand

Effect: When you would die, instead set to 1 HP and gain brief invulnerability + damage boost. Long cooldown. The enchantment version of Immortal affix. Applicable to: Armor (chestplate)

Level
Invulnerability Duration
Damage Boost
Cooldown
I
1.0s
+15%
10 min
II
1.5s
+20%
8 min
III
2.0s
+25%
6 min
IV
2.5s
+30%
5 min
V
3.0s
+40%
3 min
Max level: V (Treasure enchant — high Arcana) Design note: The reliable version of Undying Flame boss affix and Immortal tier-gated affix. Enchant = long cooldown but consistent. Affix = dependent on random rolls. They DO stack — if both trigger, you survive and then have a backup for the next hit. At Last Stand V, you get 3 seconds of god mode + 40% damage boost every 3 minutes. Incredible for boss fights.

Vitality

Effect: Increases maximum HP directly. The enchantment counterpart to Hearty/Vigorous/Vital affixes. Applicable to: Armor (all pieces)

LevelMax HP Bonus
I
+1 HP (half heart)
II
+2 HP (1 heart)
III
+3 HP
IV
+4 HP (2 hearts)
V
+5 HP (2.5 hearts)
Max level: V (Apotheosis can push to X for endgame) Design note: At Vitality V across 4 armor pieces = +20 HP (+10 hearts). At Vitality X (Apotheosis pushed) = +40 HP (+20 hearts). Combined with Vital affix, Spice of Life HP bonuses, and JustLevelingFork leveling, endgame players could have 60+ hearts. They’ll need them for the End at 10x scaling.

Phalanx

Effect: Damage reduction that increases per nearby allied player. Multiplayer-focused. Applicable to: Armor (all pieces)

Level
DR Per Nearby Ally (8-block radius)
Max Bonus
I
+3% per ally
+9% (3 allies)

II
+4% per ally
+16% (4 allies)
III
+5% per ally
+25% (5 allies)
IV
+6% per ally
+30% (5 allies)
V
+7% per ally
+35% (5 allies)
Max level: V Design note: The multiplayer enchant. A group of 5 players all with Phalanx V = everyone has +35% DR. Encourages sticking together for boss fights. Solo players get no benefit — this is explicitly for group play. Pairs with Harbinger’s Mark boss affix (marked enemies take more from all sources) for a full group synergy build.

Quick Draw

Effect: Reduced draw time for bows and crossbows. The ranged equivalent of attack speed enchants. Applicable to: Bow, Crossbow

LevelDraw Speed Increase
I
+10%
II
+18%
III
+25%
IV
+32%
V
+40%
Max level: V Design note: Makes ranged combat snappier. At V, bows draw almost twice as fast. Pairs with Too Many Bows’ special bows for rapid-fire builds. Stacks with vanilla Quick Charge (crossbow) for maximum fire rate.

Enchantment Compatibility Matrix

Key Incompatibilities

Enchant AEnchant BReason

Mana Temper

Mending
Pick your repair method: mana or XP
Momentum
Crowd Control
Pick your style: duelist or brawler

Soulbound

—
Compatible with everything (too valuable to restrict)

Key Synergies (Enchant + Affix combos)

EnchantAffixCombined Effect

Titan Slayer

Gaia’s Judgment
Bonus damage vs high HP + execute at low HP = full boss kill curve
Adrenaline
Berserker’s
Low HP = faster attacks + more damage. Glass cannon build
Momentum
Phantom Dash
Dash to avoid hits → maintain Momentum stacks
Boss Ward
Challenger’s Spirit
Stacking boss damage reduction + damage dealt bonus
Nemesis
Progressive Bosses (mod)
Deaths make YOU stronger, kills make BOSS stronger. Arms race
Soulbound
Death penalty system
Prevents durability loss on death, prevents inert at level III
Crowd Control
Battle Hardened
More mobs = more damage dealt + more damage reduced
Adaptive
Adaptable (affix)
Double-layered adaptive resistance. Extremely tanky in long fights
Convergence (enchant)
Convergence (affix)
Maximum hybrid reward stacking
Vitality
Spice of Life + JLF
Triple HP scaling: enchant + food + levels. 60+ hearts endgame
Last Stand
Undying Flame / Immortal
Multiple death-prevention layers. Very hard to kill
Phalanx
Harbinger’s Mark
Group play: tank together + mark targets for group DPS

Enchantment Acquisition Summary

MethodWhat You Get
Enchanting table (Apotheosis)
All enchantments. Level determined by bookshelf setup (Eterna/Quanta/Arcana)
Loot (dungeons/structures)
Random enchanted books in tier-appropriate loot tables
Boss drops
Higher-level enchanted books than loot tables normally provide
Villager trading
REMOVED for enchanted books (Section 18 of main doc)
Anvil combining
Merge Enchantments mod allows combining enchant levels
Disenchanting
Strip enchants to reuse. Encourages recycling boss drops
Treasure Enchants (High Arcana Only)

These cannot appear on the enchanting table without very high Arcana values (endgame bookshelf setups):
Soulbound (repurposed — durability death protection + inert prevention at III)
Last Stand (survive lethal damage)
Mending (vanilla — XP repairs)
All three are the most sought-after enchants in the pack, and all relate to gear preservation — the central tension of the death penalty system.


---

## Part VII: Boss Integration & Loot


Boss Mod Integration & Dimension Placement Appendix

Addendum to modpack_design_document.md (Section 26) and enemy_scaling_design.md

Unintegrated Boss Mods — Full Tier Placement

The main design doc (Section 26) mapped bosses from Cataclysm, Meet Your Fight, and dimension-native bosses (Twilight Forest, Blue Skies, Aether, Undergarden, Deeper and Darker). The following boss mods were in the modlist but NOT mapped. This appendix integrates them.

Brutal Bosses

What it does: Spawns 29+ boss variants of vanilla mobs (Evoker Boss, Skeleton Boss, Zombie Boss, etc.) next to loot chests in ANY structure. Fully datapack-configurable. Bosses have custom abilities (fireball, teleport, cobweb, summon minions), stats, and loot.
Integration approach: Brutal Bosses are structure-guarding mini-bosses, not progression-gated bosses. They scale naturally with the structure they appear in — a Brutal Boss in a Tier 1 Overworld dungeon is weaker than one in a Tier 3 Nether fortress because of ScalingMobs’ dimension multipliers applying to them.
Tier placement:

Boss VariantPrimary SpawnsEffective TierNotes

Zombie/Skeleton/Spider Bosses

Overworld dungeons, YUNG’s structures

1
First bosses most players encounter. Gate nothing.

Husk/Drowned/Cave Spider Bosses

Desert temples, ocean monuments, caves

1-2
Slightly harder than surface variants

Evoker/Vindicator/Pillager Bosses

Woodland mansions, pillager structures

2
Illager variants
— meaningful mid-game challenge

Blaze/Wither Skeleton/Piglin Brute Bosses

Nether fortresses, bastions

3
Nether’s 4x multiplier makes these dangerous

Guardian/Phantom/Shulker Bosses

Ocean monuments, End cities

3-4
Late-game structure guardians
Loot config: - Override default Brutal Bosses loot tables via datapack - Tier 1 bosses: Vanilla materials + small XP bonus + 5% chance of Tier 1 enchanted book - Tier 2 bosses: Iron/gold gear + 10% chance of Apotheosis affix item (Common rarity) - Tier 3 bosses: Diamond gear + 15% chance of Apotheosis affix item (Uncommon-Rare) - Tier 4 bosses: Netherite scraps + 10% chance of Apotheosis affix item (Rare-Epic) - NO Simply Swords uniques — those are reserved for named progression bosses - Brutal Bosses feed into the Compendium Bestiary as mini-boss kills
Progressive Bosses interaction: Brutal Bosses are NOT affected by Progressive Bosses (they’re structure-spawned, not summon bosses). ScalingMobs dimension multipliers provide their scaling instead.

Ultris: Boss Expansion

What it does: 8 unique bosses with custom AI, phases, music, and structures. Bosses: Corrupted Enderman, Blaze King, Ultra Wither, Sanctum Keeper, Giant, Phantom Swarm, Shulker Stone, and one more. Has an “Ultra Mode” difficulty toggle.
Integration approach: Ultris bosses are significant encounters with proper arena structures. They should be treated as progression-tier bosses on par with Cataclysm/Meet Your Fight bosses, placed by dimension and difficulty.
Tier placement:

Boss
Location
Tier
Simply Swords Unique?
Loot

Corrupted Enderman

Overworld (structure)

2

Yes — Void/teleport katana
Ender pearls, Enderic Shards (custom), T2 materials

Blaze rods (bulk),

Blaze King
Nether (tower structure)
3
Yes — Fire greatsword
Nether materials, fire enchant books

Giant

Overworld (surface structure)

2

No
Giant Stompers boots, T2 materials, XP

Phantom Swarm

Overworld (night event)

2

No
Phantom membranes (bulk), elytra repair materials

Ultra Wither

Nether (summoned)

3

Yes — Necrotic halberd
Nether Stars
×3, T3
materials, skull- themed curio

Sanctum Keeper

End-adjacent structure

4

Yes — Spirit bow (unique ranged)
End materials, T4 gems, Spirit energy (custom)

Shulker Stone

End (structure)

4

No
Shulker shells (bulk), levitation- themed curio
Progressive Bosses: Enable for Ultra Wither (summoned boss). Disable for structure-based Ultris bosses (one-time encounters per structure).
Ultra Mode: Keep disabled by default. Unlock Ultra Mode for Ultris bosses after first kill of each — functions like the Compendium’s boss difficulty escalation. Ultra Mode = “5th+ kill” difficulty equivalent.

LuMoreBossesAndMobs

What it does: Adds creature/boss variety including DryBones (Wither Skeleton variant), Macholote (axolotl boss), Terezinossauro (miniboss), aquatic monsters, Mini Golems (tiered: Bronze→Netherite), and the End Dwellee.
Integration approach: These are mostly ambient minibosses and mob variants, not progression gates. Treat as world flavor + Bestiary targets.
Tier placement:

EntityLocationTierTreatment

DryBones

Nether

3
Mob variant. Feeds Champions system. No unique loot gate.

Macholote

Overworld (aquatic)

1-2
Miniboss. Drops Aquatic Protein Bars — food item for Spice of Life.

Terezinossauro

Overworld

2
Miniboss. Drops Therizinosaurus Claw Spear — gate as T2 weapon.

Mini Golems (Bronze- Netherite)

Overworld structures

1-4
Natural tier scaling via material type. Bronze=T1, Iron=T2, Diamond=T3, Netherite=T4.

End Dwellee

End

4
End mob. Applies effects when looked at (Enderman-like). Bestiary target.
Aquatic monsters (Pirarara, Moreia, etc.)

Overworld oceans

1-2
Mob variants. Feed Bestiary + Aquaculture synergy.

Loot: Default drops are fine. Override only if any drop provides materials that bypass tier gating (check Stone Leather armor for Wither resistance — if too strong for its tier, gate the recipe via AStages).

NovaBosses

Note: Could not find this as a major standalone mod on CurseForge/Modrinth. May be a smaller/custom mod or possibly a different name. Need to verify in-game what bosses it adds.
Provisional approach: Spawn the mod, identify bosses via JEI/testing, and place each in the tier system based on difficulty. General rule: if a NovaBoss spawns in the Overworld, it’s Tier 1-2. If in the Nether/End, Tier 3-4. Assign Simply Swords uniques only if the boss has proper phases/arena mechanics justifying a unique drop.

Ultimate Bosses

What it does: Datapack-based. Adds post-Dragon bosses with custom mechanics. Designed as endgame content — “more to do after you slay the Ender Dragon.”
Integration approach: Perfect for Tier 4 / endgame. These are explicitly post-Dragon bosses, which aligns with our Tier 4 unlocking after the End is accessible.
Tier placement: ALL Ultimate Bosses = Tier 4
TreatmentDetails

Simply Swords Uniques
Yes — each Ultimate Boss should drop a unique. These are endgame trophy weapons.
Progressive Bosses
Enable. These are repeatable endgame content.

Compendium
Full entries in Boss Chronicle. First kill = Compendium milestone.

Loot
T4 materials, Apotheosis Epic-Mythic affix items, Rift materials (Rift Shards, Void Fragments) at low rates. Makes them an alternative Rift currency source.
Specific note: The main doc (Section 26) already has a line for “Ultimate/Nova Bosses” at Tier 4 with “Rarest/flashiest trophy weapons.” This confirms the placement. What’s new here is the Rift material drops — giving endgame boss farming as a slower but safer alternative to Oblivion’s Rift for endgame currency.

The Abyss: The Other Side — Optional Tier 3 Dimension

Placement

Tier: 3 (Optional) Access: Unlocked alongside Nether/Undergarden/Deeper and Darker, NOT required for Tier 4.

Dimension Config

ScalingMobs settings:

Stat
Multiplier
Notes
HP
3.5x
Between Undergarden (3.0x) and Nether (4.0x)
Damage
3.5x
Same
Speed
1.1x
Slight speed boost
Champions
10% spawn rate, 2-3 affixes
Standard Tier 3
Death penalty: 18% durability loss (between Deeper and Darker at 18% and Nether at 20%). Add to the death penalty table in Section 27.
Dimension mechanic (if applicable — depends on what the mod offers): - If The Abyss has unique environmental hazards, lean into them as the dimension’s identity - Otherwise, assign a mechanic consistent with Tier 3 themes: “Abyssal Pressure” — slow Weakness I effect that increases the deeper you go, removed by returning to the surface portal. Encourages limited-duration expeditions.

Loot Integration

Drop SourceLoot

Standard mobs
Tier 3 materials, dimension-exclusive crafting materials

Dimension boss (if any)
Simply Swords unique (dark/void themed), Apotheosis Rare-Epic affix gear, Tier 3 progression materials

Structures/chests
Tier 3 enchanted books, dimension- exclusive building blocks, rare food ingredients

FTB Quests Integration

Add to the “Explorer’s Path” chapter: - “Enter The Abyss: The Other Side” — 1 Skill Point - “Defeat [Abyss Boss]” — 1 Skill Point (if boss exists) - “Collect [Abyss-exclusive material] ×10” — Minor reward
Mark all Abyss quests as optional in the quest tree. The line from Tier 3 → Tier 4 should NOT require Abyss completion.

Compendium Integration

Add Abyss mobs to Bestiary
Add Abyss dimension to Dimensional Explorer section If boss exists, add to Boss Chronicle at Tier 3

Updated Boss → Loot Mapping (Complete)

This replaces/extends Section 26 of the main design doc.

Tier 1 Bosses (Overworld)

BossSource ModSimply Swords UniqueKey Drops
Brutal Boss variants (Zombie, Skeleton, etc.)

Brutal Bosses

No

Vanilla materials, small XP, 5% enchant book

Macholote

LuMoreBossesAndMobs

No
Aquatic Protein Bars, fishing loot
Mini Golems (Bronze/Iron)

LuMoreBossesAndMobs

No
Bronze/Iron materials, golem components

Tier 2 Bosses

BossSource ModSimply Swords UniqueKey Drops
Twilight Naga
Twilight Forest
Yes — Agility rapier/katana
Naga Scales, T2 materials
Twilight Lich
Twilight Forest
Yes — Soul scythe
Lich Scepter, T2 materials
Twilight Hydra
Twilight Forest
Yes — Fire greathammer
Hydra Blood, T2 materials
Twilight Ur- Ghast

Twilight Forest

Yes — Spectral weapon

Fiery Tears, T2 materials
Blue Skies bosses

Blue Skies

Yes — Elemental themed

Per-boss elemental drops
Aether bosses
The Aether
Yes — Wind/lightning
Aether-exclusive materials
Corrupted Enderman

Ultris

Yes — Void katana
Enderic Shards, T2 materials
Giant
Ultris
No
Giant Stompers boots
Phantom Swarm

Ultris

No
Phantom membranes, elytra repair
Terezinossauro
LuMoreBossesAndMobs
No
Therizinosaurus Claw Spear
Mini Golems (Gold/Diamond)

LuMoreBossesAndMobs

No

Gold/Diamond materials
Brutal Boss variants (Evoker, Vindicator)

Brutal Bosses

No

Affix gear (Common- Uncommon)
Majestic Menaces bosses

Majestic Menaces

Per boss

Themed drops
Mutant Monsters variants

Mutant Monsters

No

Enhanced vanilla drops

Tier 3 Bosses

Boss
Source Mod
Simply Swords Unique
Key Drops
Cataclysm Harbinger

Cataclysm

Yes — Shadow unique
Harbinger materials, signature weapon
Cataclysm
Ignis

Cataclysm

Yes — Fire unique

Ignis materials, Void Forge

Cataclysm Netherite Monstrosity

Cataclysm

Yes — Heavy unique

Monstrous Horn, ancient debris
Meet Your Fight bosses

Meet Your Fight

Yes — Per-boss themed

Per-boss unique mechanics
Wither
Vanilla (enhanced)
Yes — Necrotic unique
Nether Stars, T3 materials
Blaze King
Ultris
Yes — Fire greatsword
Blaze rods bulk, fire books

Ultra Wither

Ultris

Yes — Necrotic halberd
Nether Stars ×3, T3 materials
Abyss: The Other Side boss (if any)

The Abyss: TOS

Yes — Dark/void themed

Abyss-exclusive materials
DryBones
LuMoreBossesAndMobs
No
Wither materials variant
Mini Golems (Netherite)

LuMoreBossesAndMobs

No

Netherite scraps
Brutal Boss variants (Blaze, Piglin Brute)

Brutal Bosses

No

Affix gear (Uncommon- Rare)
Undergarden bosses

The Undergarden

Yes — Corruption themed

Undergarden materials
Deeper and Darker bosses

Deeper and Darker

Yes — Void themed

Sculk materials

Tier 4 Bosses

BossSource ModSimply Swords UniqueKey Drops
Ender Dragon
Vanilla (enhanced)
Yes — Draconic ultimate melee
Dragon Heart, T4 materials
Gaia Guardian

Botania

Yes — Reality-bending unique

Gaia Ingots, Terrasteel
Cataclysm Ender Guardian

Cataclysm

Yes — Ender unique

Ender materials, signature weapon
Cataclysm Ancient Remnant

Cataclysm

Yes — ULTIMATE unique

Ancient Remnant materials, Gauntlet of the Bulwark
Sanctum Keeper

Ultris

Yes — Spirit bow (ranged)

End materials, T4 gems
Shulker Stone
Ultris
No
Shulker shells bulk, curio

Ultimate Bosses (all)

Ultimate Bosses

Yes — Trophy weapons
T4 materials, Rift Shards (10%), Void Fragments
(15%)
End Dwellee
LuMoreBossesAndMobs
No
End-exclusive materials
Brutal Boss variants (Guardian, Shulker)

Brutal Bosses

No

Affix gear (Rare-Epic)

Endgame / Oblivion’s Rift Bosses

Boss
Source
Simply Swords Unique
Key Drops
Rift Floor

Rift Shards, Void Fragments,

Guardians
Custom (KubeJS)
No
Rift Gems
Ancient Remnant (10th+ kill)

Cataclysm + Progressive

Already has unique

Rift-Touched Books, Primordial Essence
Any boss at Progressive 15th+ kill

Various + Progressive

Already have uniques

Enhanced versions of existing drops

Simply Swords Unique Count Audit

TierUnique Weapons AssignedTarget

Tier 2

~10-12
Enough variety that players see several before Tier 3

Tier 3

~10-14
Widest variety — most boss diversity here

Tier 4

~8-10
Elite weapons, trophy status
Endgame/Mythic
7 (Mythic Uniques from Rift Blueprints)
Top-end horizontal variety
Total
~35-43 unique weapons

This is a healthy number. Enough that finding a new unique feels special, not so many that they’re meaningless. Each class should have 3-4 viable unique options across the full progression.

Loot Table Config Priority

During implementation, configure loot tables in this order:
Brutal Bosses datapacks — Override all 29+ boss loot tables to match tier-appropriate drops. Remove any drops that bypass tier gating.
Ultris boss loot — Assign Simply Swords uniques and tier-appropriate materials.
LuMoreBossesAndMobs — Verify no drops bypass tier gating. Adjust Terezinossauro spear and Stone Leather armor if needed.
Ultimate Bosses — Assign Tier 4 loot + Rift materials.
NovaBosses — Identify bosses in-game, place in tier system, assign loot.
Cataclysm Apotheosis Addon — Already installed. Verify it integrates Cataclysm drops with Apotheosis affix system correctly.
Lootintegrations mods (cataclysm, ctov, dungeoncrawl, hopo, integrated, structory) — Already installed. These distribute mod loot into structures. Verify distributions match tier expectations.

Enable scaling for: - Vanilla: Wither, Ender Dragon - Ultris: Ultra Wither (summoned) - Cataclysm: All bosses (summoned/repeatable) - Meet Your Fight: All bosses - Ultimate Bosses: All - Botania: Gaia Guardian
Disable scaling for: - Brutal Bosses (structure-spawned, not repeatable in same location) - Ultris structure bosses (Corrupted Enderman, Blaze King, Sanctum Keeper, etc. — one-per-structure) - LuMoreBossesAndMobs (ambient minibosses) - Dimension- native bosses that only spawn once per world (Twilight Forest progression bosses)
Scaling cap reminder: 15 kills = +150% HP, +80% damage. This applies per-boss-type, per-world (not per-player).

What Players Do After “Beating” the Pack

The pack has a soft endpoint: kill the Ancient Remnant (Cataclysm) + complete the final FTB Quest chapter = “you beat the pack.” Credits-equivalent moment, unique trophy item, bragging rights.
But that’s hour ~150-200. The next 200 hours come from five interlocking endgame loops that feed into each other:
Oblivion’s Rift — Procedural infinite dungeon (the primary endgame activity)
Mythic Gear Chase — Vertical power with diminishing returns and a hard ceiling
Build Diversity — Horizontal replayability through class/build experimentation
The Compendium — Collection, achievements, and cosmetic chase
Creative Endgame — Megabuilding with endgame-exclusive materials and tools
These loops are NOT independent. Oblivion’s Rift generates the materials for Mythic Gear. Mythic Gear lets you push deeper into the Rift. New builds let you approach the Rift differently. The Compendium tracks all of it. Creative Endgame uses resources from all loops.

Previously referred to as “The Abyss” in early design — renamed to avoid conflict with “The Abyss: The Other Side” dimension mod.

Concept

Oblivion’s Rift is an infinitely descending dungeon accessible from the End. Each floor is a procedurally generated combat gauntlet with escalating difficulty, random modifiers, and curated loot pools. It’s the pack’s primary repeatable endgame content.
Implementation: RFTools Dimensions + KubeJS + structure datapack scripting. Each “floor” is a generated RFTools dimension with pre-built room templates, populated by ScalingMobs-configured enemies at floor-appropriate difficulty.

Access Requirements

Tier 4 unlocked
Ancient Remnant killed at least once
Rift Key crafted: Dragon Heart + Void Essence (Cataclysm) + Gaia Ingot + Nether Star Each key grants one Rift run (consumed on entry)
Keys are moderately expensive but farmable — the gating is skill, not materials

Structure

Floors
Each Rift run starts at Floor 1. Players descend through floors sequentially. Each floor: - Contains 2-4 combat rooms with mob encounters - Ends with a floor guardian (Champion-tier mob with guaranteed 3-4 affixes) - Has an exit portal between floors (leave with current loot, or continue and risk dying)
The core tension: leave with what you have, or push deeper for better loot and risk losing it all.

Floor Scaling

Floor
Mob HP Multi
Mob Damage Multi
Champion Tier
Unique Mechanics
1-5
6x-8x
8x-10x
3 affixes
Standard (End-tier difficulty)
6-10
8x-12x
10x-14x
3-4 affixes
+1 floor modifier
11-15
12x-18x
14x-20x
4 affixes
+2 floor modifiers
16-20
18x-25x
20x-28x
4 affixes (enhanced)
+3 floor modifiers

21-30

25x-40x

28x-40x

4 affixes + boss-tier HP
+3 modifiers, mobs gain boss mechanics

31+
40x+ (scaling continues)

40x+

Mini-boss every room
Theoretical ceiling, not expected to be reached
Floors 1-5 are roughly End difficulty. By floor 15, mobs are 2-3x harder than anything in the overworld. By floor 25+, this is “prove you’ve mastered everything” territory.

Floor Modifiers
Each floor beyond 5 applies random modifiers that change the combat rules. Players can see the modifier BEFORE choosing to descend (informed risk).
Offensive Modifiers (make mobs harder): - Frenzied: All mobs +25% attack speed - Armored Host: All mobs +50% armor
- Regenerating: Mobs heal 1% HP/second out of combat (can’t kite) - Volatile: Mobs explode on death (3-block radius, 15% of their max HP as damage) - Thorned: Mobs reflect 10% of melee damage taken - Temporal: Mobs blink-teleport every 8 seconds (anti-kiting) - Empowered Champions: Champions gain +1 additional affix
Defensive Modifiers (restrict players): - Weakened: Player damage -15% - Fragile: Player max HP -20% - Silenced: Spell/magic damage -30% (punishes Archmage, doesn’t affect melee) - Disarmed: Ranged damage -30% (punishes Ranger, doesn’t affect melee) - Heavy Air: Player movement speed -15% - Mana Drain: Mana/stamina regeneration -40% - No Retreat: Exit portal doesn’t appear until floor guardian is killed
Reward Modifiers (optional risk/reward): - Treasure Hoard: +50% loot quantity, but +25% mob HP - Champion Swarm: Triple Champion spawn rate, Champions drop guaranteed loot - Cursed Gold: All drops have +1 affix rarity tier, but player takes 1 damage/10 seconds (ambient)

Death in the Rift
Standard death penalty applies (dimension-scaled durability loss — Rift counts as End-tier, 25%) Player respawns OUTSIDE the Rift (at their last waystone)
All items picked up during the run that haven’t been banked are LOST
Items you entered WITH are subject to normal death rules (kept in inventory, durability hit) This makes the “exit or push” decision genuinely tense

Banking System
Between floors, players can use a Void Coffer to bank items. Banked items are safe even on death. Retrieve them from a matching Void Coffer in the overworld.
Banking costs nothing on floors 1-10
Floors 11-20: Banking costs 10 levels per item Floors 21+: Banking costs 20 levels per item
Encourages risk assessment: bank the good drops, or save levels for emergencies?

Rift-Exclusive Loot

The Rift drops loot that cannot be obtained anywhere else. This is the primary vertical power progression past “beating the pack.”

Rift Shards (Currency)
Every floor guardian drops Rift Shards. Quantity scales with floor depth: - Floors 1-5: 1-2 shards - Floors 6-10: 2-4 shards - Floors 11-15: 4-6 shards - Floors 16-20: 6-10 shards - Floors 21+: 10-15 shards
Shards are the primary endgame currency used for Mythic Gear crafting (Loop 2).

Rift-Only Drops

DropSourceUse
Rift Shard
Floor guardians
Mythic crafting currency
Void Fragment
Any Rift mob (5% drop)
Mythic crafting component

Rift Gem (random)

Floor 10+ guardians (30%)
Best-in-slot gems for Apotheosis sockets

Rift-Touched Enchanted Book

Floor 5+ (15% per floor clear)
Contains enchantments at +1 above normal max (e.g., Sharpness XI)
Primordial Essence
Floor 15+ guardians (20%)
Used for Mythic reforging

Rift Blueprint

Floor 20+ guardians (10%)
Unlocks unique Mythic crafting recipes

Rift Core

Floor 25+ guardians (5%)
Ultimate crafting material, used in Compendium chase items

Rift Floor Records
The Rift tracks deepest floor reached per player (and per server). This feeds into the Compendium (Loop 4).

Concept

After “beating the pack,” players have access to a final gear tier that sits ABOVE Tier 4. Mythic Gear is not a new material tier — it’s an enhancement layer applied to existing endgame gear using Rift materials.
The key design constraint: Mythic enhancements have diminishing returns and a hard ceiling. A full Mythic loadout is maybe +30-40% stronger than standard Tier 4 BiS. It does NOT double your power. It’s the difference between “I can clear Floor 15 comfortably” and “I can push Floor 22.”

Mythic Enhancement System

Mythic Infusion (Gear Enhancement)
Any Tier 4 weapon or armor piece can be Mythic Infused at a Mythic Forge (crafted from Rift materials + Mekanism components).
Each Mythic Infusion level adds a small, stacking bonus:
Mythic LevelCostBonus Per LevelCumulative

Mythic I
5 Rift Shards
+ 2 Void Fragments

+3% effectiveness

+3%

Mythic II
10 Shards +
5 Fragments

+3% effectiveness

+6%

Mythic III
20 Shards +
10 Fragments
+ 1
Primordial Essence

+2% effectiveness

+8%

Mythic IV
35 Shards +
15 Fragments
+ 2 Essences

+2% effectiveness

+10%

Mythic V
50 Shards +
25 Fragments
+ 3 Essences
+ 1 Rift Core

+2% effectiveness

+12%
“Effectiveness” means: - Weapons: +% total damage - Armor: +% total damage reduction - Tools: +% mining speed + durability
Total ceiling: Mythic V = +12% effectiveness. Meaningful but not game-breaking. The cost escalation is steep — Mythic V on a full loadout (weapon + 4 armor) requires ~250 Rift Shards, 115 Void Fragments, 30 Primordial Essences, and 5 Rift Cores.
That’s many, many Rift runs.

Mythic Reforging (Affix Enhancement)
Using Primordial Essences at the Mythic Forge, players can reroll a single affix on a piece of gear while keeping all others. This is the targeted affix farming endgame.
Cost: 3 Primordial Essences + 15 levels per reroll Rerolled affix is guaranteed same rarity tier or higher
Cannot target which affix is rerolled (random selection from the item’s affixes) Can choose to keep old affix or take new one (preview before committing)
This addresses the “I have a perfect item except for one bad affix” frustration without making perfect gear trivial.

Rift-Touched Enchantments
Rift-Touched Enchanted Books allow enchantments one level beyond their normal cap: - Sharpness XI, Protection IX, Titan Slayer VI, etc. - These books are rare (15% per floor clear, and only one enchant per book) - Applying them requires the Mythic Forge + 5 Rift Shards - Only ONE Rift-Touched enchantment per item (can’t stack multiple overcapped enchants) - This is a meaningful but bounded power increase — one extra enchant level per gear slot

Mythic Unique Recipes (Rift Blueprints)
Rift Blueprints unlock unique crafting recipes at the Mythic Forge. These are signature endgame items — not strictly “better” than

Tier 4 BiS, but offering unique effects:
BlueprintItem CreatedEffect

Blueprint: Voidheart Blade

Voidheart Blade (sword)
On kill, next attack within 3s deals +50% damage as void damage. Stacking (max 3 kills). Unique playstyle weapon.

Blueprint: Oblivion Aegis

Oblivion Aegis (chestplate)
-5% max HP. Damage taken that would kill you is delayed by 2 seconds (you can heal/pot in the window). 60s CD.

Blueprint: Riftwalker Boots

Riftwalker Boots (boots)
Short-range teleport on sneak+jump (8 blocks, 5s CD).
+15% speed in the Rift.

Blueprint: Soulweave Robes

Soulweave Robes (chestplate)
+20% spell damage. Spells cost HP instead of mana (5% of spell mana cost as HP).

Blueprint: Titan’s Grasp

Titan’s Grasp (gauntlets/curio)
Melee attacks have +3 block reach. -10% attack speed. Mobs killed drop double XP.

Blueprint: Oblivion Crown

Oblivion Crown (helmet)
Reveals all mobs in 32-block radius (wallhack vision). +10% damage to mobs you haven’t hit yet (first-strike bonus).

Blueprint: Void Anchor

Void Anchor (curio)
Immune to forced teleportation.
+15% damage in the Rift. Cannot be knocked back.
Each blueprint drops only from Floor 20+ guardians (10% chance), and each is a specific random drop. Collecting all 7 is a long- tail chase.

Power Ceiling
Let’s quantify the maximum power increase from Mythic systems:
EnhancementPower Gain
Mythic V on all gear
+12% effectiveness
One Rift-Touched enchant per slot (5 slots)
~+8-10% total (one extra enchant level each)
Rift Gems (best-in-slot sockets)
~+5-8% over Tier 4 gems
Mythic Unique item (1-2 equipped)
Situational, ~+10-15% in their niche
Total ceiling
~+30-40% over standard Tier 4 BiS
This means a fully Mythic’d player is roughly 1.3-1.4x as strong as a fresh Tier 4 player. Meaningful for Rift pushing but not so extreme that it trivializes designed content. A skilled player in standard Tier 4 gear can still clear the content a Mythic player can
— just with less margin for error.

Concept

The pack supports 10 classes, 7 races, and dozens of gear combinations. Endgame encourages players to experience multiple builds rather than perfecting a single one.

Respec Incentives

Class Respec costs 1 boss drop + 30 levels (as designed). This is intentionally cheap enough that endgame players can afford it regularly, but expensive enough that you don’t swap every 5 minutes.
Why players WANT to respec: - Different classes experience the Rift completely differently - Berserker rushes through trash but struggles with kiting floor guardians - Ranger handles floor guardians easily but gets overwhelmed by trash swarms - Vanguard is slow but nearly unkillable — can push deeper floors than DPS classes - Void Summoner trivializes some floor modifiers (Thorned, Volatile) but struggles with Silenced - Some Rift floor modifiers hard-counter specific builds (Silenced = bad for Archmage, Disarmed = bad for Ranger) - Different Compendium challenges require different class completions

Build Challenges

The Compendium (Loop 4) includes class-specific Rift challenges:
ChallengeRequirementReward

Berserker Mastery

Reach Floor 15 as Berserker
Cosmetic title + unique Berserker skin overlay

Archmage Mastery

Reach Floor 15 as Archmage
Cosmetic title + unique Archmage skin overlay
(one per class)
Floor 15 with each class
Cosmetic title per class

Omniclass

Reach Floor 10 with ALL 10 classes
Unique curio: Class Ring (swap between two classes without respec cost)

True Master

Reach Floor 20 with ANY 3 different classes
Unique curio: Master’s Sigil (+5% all stats)

Gear Set Diversity

Endgame players will naturally accumulate multiple gear sets: - Boss-killing set (Titan Slayer, Nemesis, Boss Ward) - Rift set (Adaptive, Last Stand, Soulbound III) - Farming set (Prospector, Reaping, Magnetism) - Exploration set (Riftwalker Boots, Aether Acclimation, Depthstrider)
Storage and quick-swap (via curio loadout or armor stand mechanics) become important. Sophisticated Backpacks endgame tier
+ Cosmetic Armor Reworked allow managing multiple sets.

Loop 4: The Compendium (Collection & Achievement)

Concept

The Compendium is an in-game tracking system (FTB Quests chapter + custom advancement triggers) that tracks everything a player has accomplished. It’s the “completionist endgame” — a massive checklist of challenges, discoveries, and collections that takes hundreds of hours to fully complete.
Not just a checklist. Every Compendium entry has a tangible reward — cosmetic, functional, or both.

Compendium Categories

Bestiary (Enemy Tracking)
Track every unique enemy type killed. Killing enough of a type unlocks knowledge.
MilestoneKills RequiredReward
Discovered
1
Entry appears in Bestiary

Studied

25
Mob’s HP, damage, and weaknesses visible (HUD display via Jade)

Expert

100
+5% damage vs this mob type (permanent passive)

Master

500
+10% damage vs this mob type + cosmetic trophy item
There are ~80-100 unique mob types across all dimensions. Mastering ALL of them is a massive long-tail goal.
Champion Bestiary: Separate tracking for Champion affix combinations. Encounter every affix at least once = “Champion Scholar” achievement + unique curio (Champion’s Eye — see Champion affixes from 16 blocks away).

Boss Chronicle
Track every boss killed and at what Progressive Bosses difficulty level.
MilestoneReward
First kill of any boss
Chronicle entry + boss lore text
Kill every Tier 2 boss
Title: “Dungeon Delver”
Kill every Tier 3 boss
Title: “Realm Walker”
Kill every Tier 4 boss
Title: “God-Killer” + unique cape cosmetic

Kill Ancient Remnant at 10th+ difficulty
Title: “Rift Conqueror” + Rift Trophy (placeable, animated)
Kill every boss at 5th+ difficulty
Unique curio: Veteran’s Medal (+3% all stats, +10% XP)

Kill every boss at 10th+ difficulty
Unique curio: Legend’s Insignia (+5% all stats, +15% XP, +10% loot)

Rift Records

MilestoneReward
Reach Floor 5
Title: “Rift Diver”

Reach Floor 10
Unique curio: Rift Compass (shows Rift loot tier of current floor)

Reach Floor 15
Title: “Rift Veteran” + cosmetic armor overlay (void particle effects)

Reach Floor 20
Title: “Void Walker” + Riftwalker Boots blueprint guaranteed

Reach Floor 25
Title: “Rift Breaker” + unique weapon cosmetic (void aura)

Reach Floor 30
Title: “The Unfathomable” + unique full cosmetic set (animated void armor)
Complete a run with every floor modifier active
Title: “Masochist”

Gear Collection
Track unique items discovered and equipped.
MilestoneReward
Equip 1 Legendary affix item
Entry in collection
Equip items from every material tier
Title: “Well-Equipped”
Obtain all 7 Mythic Unique blueprints
Title: “Mythic Collector” + display pedestal recipe

Craft all 7 Mythic Unique items
Title: “Mythic Forgemaster” + Mythic Forge operates 50% faster
Obtain a “perfect” affix item (max affixes, all Legendary)
Title: “Blessed by RNG”
Apply Mythic V to any item
Title: “Void-Tempered”

Dimensional Explorer

MilestoneReward
Visit every dimension
Title: “Planeswalker” + map art of all dimensions
Spend 10 hours in each dimension
+3% damage in all dimensions (permanent)

Find every unique structure across all dimensions
Title: “Cartographer” + unique compass curio (points to nearest unvisited structure)
Complete every dimension’s unique mechanic challenge
Dimension-specific trophies (placeable)
Dimension-specific challenges: - Twilight: Clear every boss in one run without dying - Blue Skies: Survive 5 elemental storms without shelter - Aether: Kill 50 mobs while airborne - Undergarden: Survive 30 minutes without being poisoned - Deeper Darker: Clear a Sculk nest without triggering a shrieker - Nether: Kill a Hoglin by knocking it into lava - Deep Aether: Clear an Ascension Tower (all floors) - End: Survive 10 Void Storms

Crafting Mastery

MilestoneReward
Craft 500 unique recipes
Title: “Artisan”

Craft 1000 unique recipes
+5% crafting speed (Artificer passive bonus to all classes)
Complete every tech tier
Title: “Engineer” + unique redstone cosmetic
Complete every magic tier
Title: “Arcane Scholar” + unique enchanting cosmetic
Use every mod’s crafting system at least once
Title: “Renaissance Crafter”
Class Mastery
(Detailed in Loop 3 above)

Compendium Completion Tiers

% CompleteReward
25%
Unique banner pattern

50%
Unique mount cosmetic (if applicable) or movement- speed curio
75%
Unique particle effect (follows player)
90%
Title: “Completionist” + unique animated cape

100%
Title: “The Absolute” + unique full cosmetic set + permanent +5% all stats

100% Compendium completion is the “true endgame” — estimated 400+ hours. It requires mastering every class, clearing deep Rift floors, killing every boss at high Progressive difficulty, collecting all Mythic items, and exploring everything.

Concept

Endgame unlocks building tools, materials, and capabilities that make creative expression a viable endgame activity. Not just “building is fun” — specific endgame systems that reward and enable ambitious building projects.

Endgame Building Tools

RFTools Dimensions (Personal Dimensions)
Tier 4 unlocks RFTools Dimension creation. Endgame players can: - Create custom dimensions with controlled biomes, terrain, and lighting - Use as personal creative spaces, farms, or showcases - Maintain dimensions costs RF (ongoing power investment = ongoing engagement with tech systems) - Custom dimension templates unlock via Compendium milestones

Endgame-Exclusive Building Materials

MaterialSourceProperties

Rift Stone

Rift floors (mine from walls)
Animated void-texture blocks. Multiple variants. Blast-resistant.

Void Glass

Rift Shards + glass
Transparent with void particle effect. Glows slightly.

Primordial Metal Blocks
Primordial Essences + netherite blocks
Animated metallic sheen. Multiple color variants via dye.
Celestial Wood
Deep Aether exclusive
Glowing wood type. Leaves emit light particles.

Dragon Scale Blocks
Dragon Hearts (Progressive Boss farming)
Iridescent scaling pattern. Changes color with viewing angle.
These materials are purely cosmetic in function — they’re building blocks — but they look spectacular and flex endgame achievement.

Trophy Displays
Compendium milestones unlock trophy items that can be placed as decorative blocks: - Boss trophies (animated models of boss heads) - Rift depth markers (glowing floor number displays) - Class mastery statues - Dimensional trophies

Chisel & Bits / Frameworks Integration
Endgame-exclusive Chisel & Bits materials using Rift textures. Detailed micro-building with endgame aesthetics.

“You Beat the Pack” Moment

Trigger: Kill the Ancient Remnant (Cataclysm) for the first time AND complete the “God-Killer” FTB Quests chapter.
Reward: - Unique item: The Paragon’s Proof (trophy curio, +3% all stats, purely a status symbol) - FTB Quests “credits” page with congratulations and stats summary - Access to the Mythic Forge and the Rift (if not already accessed via alternative unlock) - Title: “Paragon”
What this does NOT do: - End the game - Lock any content - Prevent further progression
It’s a celebration, not a wall. The message is: “You’ve conquered what was designed to be conquered. Everything beyond this is your own ambition.”

Post-Endpoint Milestones

For players who want to keep going, the natural progression is:
Mythic Gear up (10-30 hours) — Infuse best gear to Mythic III-V
Push the Rift (20-50 hours) — Reach Floor 20+, collect blueprints
Complete the Compendium (50-100+ hours) — Chase 100% completion
Master every class (30-60 hours) — Omniclass challenge
Build the monument (unlimited) — Creative endgame with trophy displays and exotic materials
Progressive Boss arms race (ongoing) — Push boss difficulties higher and higher

```
Oblivion's Rift ──drops──→ Rift Shards/Materials
        │                         │
        ▼                         ▼
  Mythic Forge ──crafts──→ Mythic Gear
        │                         │
        ▼                         ▼
  Stronger player ──pushes deeper──→ Oblivion's Rift (loop)
        │
  Mythic Uniques ──tracked by──→ Compendium
        │
        ├──floor records──→ Compendium
        │
        ▼
  Completion rewards ──cosmetics──→ Creative Endgame
        │
        ▼
  Class challenges ──motivate──→ Build Diversity
        └──different class experiences──┘

  Progressive Bosses ──harder bosses──→ better drops ──→ Mythic Forge
        ▼
  Gear to push the Rift deeper
```

Every loop feeds at least two other loops. No endgame activity is a dead end.

ActivityHours for “Completion”Notes
First Rift clear (Floor 10)
5-10
Learning the system

Floor 20

20-40
Requires Mythic gear

Floor 25+

40-60+
Deep endgame, near power ceiling

Full Mythic V loadout

30-50
Many Rift runs for materials

All 7 Mythic Uniques

40-60
RNG-dependent blueprint drops

10-class mastery (Omniclass)

30-60
Respec + re-clear the Rift with each

Compendium 50%

20-30
Natural play achieves this
Compendium 90%
80-120
Targeted grinding

Compendium 100%

150-200+
Long-tail completionist

Boss Chronicle (all at 10th+)

30-50
Progressive Boss farming

Total for “everything”

~350-500 hours
Within 200-400 target range for most content

Systems specifically designed to prevent unfun grinding patterns:

Oblivion’s Rift
Keys cost real materials (can’t spam infinitely without farming key components) Death drops run loot (can’t mindlessly throw yourself at floors for free)
Floor modifiers are random (can’t farm the same “easy” modifier set repeatedly — must adapt) No “quit to menu” exploit — entering the Rift commits you to the run (death or exit portal only)

Mythic Gear
Diminishing returns (Mythic I→II is the biggest jump, V is marginal) Hard ceiling at Mythic V (no infinite power scaling)
Rift-Touched enchants limited to one per item (can’t overcap everything) Mythic Reforging is random target (can’t guarantee perfect items quickly)

Compendium
Kill milestones (25/100/500) prevent “kill one of everything and move on” — you actually engage with combat Class mastery requires Floor 15, not Floor 1 (can’t trivially check off classes)
Dimensional challenges are skill-based, not grind-based

Progressive Bosses
Difficulty cap at 15th kill (+150% HP, +80% damage) — bosses don’t become literally impossible Drop quality cap at 10th kill — farming past 10 gives the same drops, just harder fights Incentivizes stopping at a comfortable farm difficulty rather than pushing endlessly

Rift infrastructure — RFTools dimension templates, KubeJS room generation, mob spawning config
Rift loot tables — Rift Shards, Void Fragments, gem drops, blueprint drops
Mythic Forge — Custom crafting station via KubeJS (multiblock or single block)
Mythic Infusion system — KubeJS item modification (add NBT tags for Mythic level, apply stat scaling)
Compendium FTB Quests chapter — All tracking entries, advancement triggers, reward items
Mythic Unique items — KubeJS custom items with custom behaviors
Trophy and cosmetic items — Placeable trophies, title system (if available via mod), skin overlays
Rift building materials — Custom block textures and registration
Balancing pass — Rift floor scaling, Mythic Forge costs, Compendium kill thresholds
0. Floor modifier system — KubeJS event handlers for each modifier effect

Implementation Complexity: HIGH
Oblivion’s Rift is the most complex custom system in the pack. It requires: - Procedural dimension generation (or pre-built template pool) - Custom mob scaling beyond ScalingMobs base config - Item tracking for run vs. owned loot - Banking system (custom inventory) - Floor modifier effects (KubeJS event handlers) - Death handling (custom respawn logic)
Fallback plan: If full procedural generation proves too complex, the Rift can be implemented as a large, pre-built dungeon structure with scaling mob spawners and floor-based difficulty zones. Less procedural variety, but same gameplay loop.

“Ascension” — New Game+ Challenge Modifiers

Prestige in this pack is NOT a reset. Players do not lose tiers, gear, skills, or progress. Instead, Prestige (“Ascension”) layers escalating challenge modifiers onto the world that fundamentally change how the pack plays. Each Ascension level makes the pack harder in interesting ways — not just bigger numbers — and rewards players with exclusive power, cosmetics, and Compendium entries.
Why this approach: - A full reset invalidates 150-200 hours of investment. That’s disrespectful to the player’s time. - The pack already has 200-400 hours of endgame content. Prestige extends the ceiling, not the floor. - Challenge modifiers create genuinely different gameplay. Ascension 3 plays differently from Ascension 1, not just “the same but harder.” - Players who don’t want prestige lose nothing. All base content remains fully completable at Ascension 0.
Target audience: Players who have killed the Ancient Remnant, reached Oblivion’s Rift Floor 15+, and want the pack to push back harder. Estimated unlock: 200-300 hours in.

Requirements

To unlock Ascension 1, ALL of the following must be true: - Ancient Remnant killed at least once - “Paragon” title earned (soft endpoint completed) - Oblivion’s Rift Floor 10 reached - At least 3 Tier 4 bosses killed - Compendium at 25%+
Activation: Craft the Ascension Beacon at the Mythic Forge. - Recipe: Rift Core + Dragon Heart + Gaia Ingot + Nether Star + 50 levels - Place and activate. Confirmation dialog: “This will increase world difficulty permanently. Ascension cannot be reversed.” - Activation is per-world, not per-player. All players in the world ascend together.
Critical: Ascension is permanent and irreversible per world. This is a commitment. Players who want to experience base difficulty can start a new world.

5 Ascension levels. Each adds a new modifier layer ON TOP of all previous levels. Modifiers are cumulative.

Ascension 1: “The Awakening”

Theme: The world notices you. Enemies are smarter and more aggressive.
Modifiers: | Category | Change | |———-|——–| | Mob HP | +25% global (stacks with ScalingMobs dimension multipliers) | | Mob Damage | +20% global | | Champion Spawn Rate | +5% across all dimensions (so Overworld goes from 5% → 10%) | | Champion Minimum Affixes | +1 affix minimum everywhere | | Mob Awareness | Hostile detection range +50% (from 16 → 24 blocks default)
| | Improved Mobs | Mobs now pick up and USE player-dropped gear in ALL dimensions (base: Tier 3+ only) |
New Mechanic — Nemesis System (Light): - When you die, the mob that killed you becomes a Nemesis: +50% HP, +25% damage, keeps your death location, glows, has a name tag (“Player’s Bane”). Nemesis persists until killed. - Killing your Nemesis: bonus XP (5 levels worth) + guaranteed Apotheosis affix drop (Uncommon+) - Only 1 active Nemesis per player at a time.
Rewards: - Title: “Ascended I” - +3% all stats (permanent passive, stacks with Compendium bonuses) - Ascension Sigil I (curio:
+5% XP gain) - Unlocks Ascension-exclusive Compendium chapter
Unlock Ascension 2: Kill 5 Nemeses + reach Rift Floor 15 at Ascension 1 difficulty

Ascension 2: “Corruption Spreads”

Theme: The world is actively hostile. Corruption seeps into previously safe spaces.
New modifiers (cumulative with A1): | Category | Change | |———-|——–| | Mob HP | +50% total (25% from A1 + 25% new) | | Mob Damage | +40% total | | Champion Spawn Rate | +10% total | | Hostile Spawns in Light | Mobs can now spawn at light level 5 or below (vanilla: 0) | | Corruption Zones | Random 32-block radius zones spawn in Overworld every 30 min. Inside: Weakness I,
-20% healing, mobs spawn at 2x rate. Zones last 10 min, marked on JourneyMap. | | Boss HP | All bosses +30% HP (stacks with Progressive Bosses) |
New Mechanic — Corrupted Champions: - Champions now have a 15% chance to be “Corrupted” — visually distinct (particle effect), +1 additional affix beyond normal maximum, and drops a Corrupted Shard on death. - Corrupted Shards: New crafting material for Ascension-exclusive gear (see rewards).
Rewards: - Title: “Ascended II” - +6% all stats total - Ascension Sigil II (curio: +10% XP, +5% loot quality) - Corrupted Forge unlocked (uses Corrupted Shards to craft): - Corrupted weapon coating: +15% damage vs Champions (consumable, 30 min duration) - Corrupted armor reinforcement: +10% DR vs Champions (consumable, 30 min duration) - Corrupted Essence: Reroll one Mythic affix with guaranteed Rare+ (better than base Mythic Reforging)
Unlock Ascension 3: Kill 10 Corrupted Champions + reach Rift Floor 20 at A2 difficulty + Compendium 50%

Ascension 3: “World Fracture”

Theme: Reality is breaking. Dimensional bleed causes cross-dimension threats.
New modifiers (cumulative): | Category | Change | |———-|——–| | Mob HP | +75% total | | Mob Damage | +60% total | | Champion Spawn Rate | +15% total | | Champion Max Affixes | +2 beyond base (so Overworld Champions can have 4 affixes) | | Dimensional Bleed | Nether mobs spawn rarely in Overworld caves (5% of spawns). End mobs spawn rarely in Nether (5%). | | Environmental Hazard | Random “Fracture Storms” — 5 min events where damage taken +25%, but loot drops +50%. Visual: sky crackles with void lightning. |
New Mechanic — Rift Echoes: - Killing any boss now has a 20% chance to spawn a Rift Echo — a shadow copy of the boss at 50% HP but with 2 random Oblivion’s Rift floor modifiers applied (e.g., Frenzied + Armored Host). - Killing the Rift Echo: Guaranteed Rift Shard drop + chance at Rift-Touched Book outside of the Rift. - This gives surface-world access to Rift materials at a low rate, rewarding Ascension players with an alternative farming path.
Rewards: - Title: “Ascended III — Fracture Walker” - +9% all stats total - Ascension Sigil III (curio: +15% XP, +10% loot quality,
+5% movement speed) - Fracture Forge unlocked (upgrade from Corrupted Forge): - Fracture-Touched weapons: Permanent
+10% damage vs all enemies in dimensions above Overworld - Dimensional Anchor Charm: Immune to Corruption Zone debuffs (curio) - Void-Threaded Armor: Permanent +5% DR in Oblivion’s Rift
Unlock Ascension 4: Kill 5 Rift Echoes + reach Rift Floor 25 at A3 difficulty + kill every Tier 4 boss at A3

Ascension 4: “The Gauntlet”

Theme: The world is a constant test. No safe spaces remain.

New modifiers (cumulative): | Category | Change | |———-|——–| | Mob HP | +100% total (double base) | | Mob Damage |
+80% total | | Champion Spawn Rate | +20% total (Overworld at 25%, Nether at 35%) | | Respawn Penalty | On death, 30 second respawn delay (can’t instantly retry) | | Hunger Pressure | Food saturation effectiveness -25% (eat more, carry more) | | No Safe Zones | No Hostiles Around Campfire disabled. Torchmaster mega-torch radius halved. | | Night Raids | Every 3rd night, a wave of scaled enemies attacks within 64 blocks of the player (10-20 mobs, Champion-tier). |
New Mechanic — Gauntlet Challenges: - Weekly (real-time) rotating challenges that appear in FTB Quests: - “Slay 50 Champions this week” → Bonus: 10 Rift Shards - “Clear Rift Floor 20 without dying” → Bonus: Guaranteed Rift Blueprint - “Kill [specific boss] at Progressive difficulty 10+” → Bonus: Unique cosmetic - “Survive 3 Night Raids without dying” → Bonus: Gauntlet Trophy - Challenges auto-rotate. Missed challenges return to the pool.
Rewards: - Title: “Ascended IV — The Gauntlet” - +12% all stats total - Ascension Sigil IV (curio: +20% XP, +15% loot quality,
+10% speed, +5% max HP) - Gauntlet Forge unlocked: - Gauntlet Champion Weapons: Weapons that gain +1% permanent damage per 100 Champion kills (tracked per weapon, caps at +25%) - Gauntlet Armor: Armor that gains +0.5% permanent DR per 100 deaths survived (caps at +10%) - These are the only items in the pack with truly permanent kill-based scaling
Unlock Ascension 5: Complete 20 Gauntlet Challenges + reach Rift Floor 30 at A4 + Compendium 75%

Ascension 5: “Oblivion”

Theme: The final challenge. The world is as hostile as it can possibly be.
New modifiers (cumulative): | Category | Change | |———-|——–| | Mob HP | +150% total | | Mob Damage | +100% total (double damage) | | Champion Spawn Rate | +25% total (Overworld 30%, Nether 40%, End 50%) | | All Champions | Minimum 3 affixes everywhere, maximum 6 in End/Rift | | Permanent Corruption | Corruption Zones no longer despawn. They slowly expand (1 block/min). Players must destroy the Corruption Core (spawns in center, 500 HP, guarded by Corrupted Champions) to remove them. | | Death Penalty | Durability loss +10% across all dimensions (Overworld: 20%, End: 35%) | | Oblivion’s Rift | Floor scaling starts 50% harder. Floor 1 at A5 ≈ Floor 8 at A0. |
New Mechanic — The Oblivion Trial: - A one-time challenge unlocked at Ascension 5: enter a special Rift dimension with 10 consecutive floors, no banking, no exit until completion or death. - Each floor has a boss from a different mod (randomized from the full boss pool). - Death = lose ALL items collected during the trial (not equipped gear, just trial loot). - Completion reward: The single rarest item in the pack.
Rewards: - Title: “Oblivion’s End” (animated, glowing) - +15% all stats total - Ascension Crown (curio: +25% XP, +20% loot,
+15% speed, +10% HP, +5% all damage) — the single most powerful curio in the pack - Animated void particle armor overlay (permanent cosmetic) - Compendium: “The Absolute” entry unlocked (separate from 100% completion)
The Oblivion Trial completion reward — “Shard of Oblivion”: - Trophy item. Placeable. When placed, emits void particles in a 16-block radius. - Grants all players within radius: +3% all stats (stacks with Ascension bonuses) - One per world. The ultimate flex item.

Level
Mob HP
Mob Damage
Champion Rate
Key Mechanic
Stat Bonus
Base (0)
1x
1x
5-15%
—
—
1
1.25x
1.2x
+5%
Nemesis System
+3%
2
1.5x
1.4x
+10%
Corrupted Champions
+6%

3

1.75x

1.6x

+15%
Rift Echoes, Dimensional Bleed

+9%

4

2.0x

1.8x

+20%
Night Raids, Gauntlet Challenges

+12%

5

2.5x

2.0x

+25%
Permanent Corruption, Oblivion Trial

+15%
Important: These multiply ON TOP of ScalingMobs dimension multipliers and Progressive Bosses scaling.
Example — Nether mob at Ascension 5: - Base HP: 20 - ScalingMobs Nether (4x): 80 - Ascension 5 (+150%): 200 - If Champion with 4 affixes: ~350-400 HP
This is why Ascension is endgame-only. A fresh Tier 4 player would be obliterated. But a player with Mythic V gear, maxed skills, and class mastery has the tools to handle it.

At Ascension 5, a fully invested player has:
SourceBonus
Mythic V gear
+12% effectiveness
Rift-Touched enchants
+8-10%
Rift Gems
+5-8%
Mythic Uniques
+10-15% situational
Pufferfish Skills (60 points)
~+15% from relevant nodes
Compendium (90%+)
+5% all stats
Ascension stat bonus
+15%
Ascension Sigil V
+5% damage, +10% HP, +15% speed
Gauntlet weapons (maxed)
+25% weapon damage
Gauntlet armor (maxed)
+10% DR
Fracture-Touched gear
+10% damage in non-Overworld
Void-Threaded armor
+5% DR in Rift
Total offensive boost vs base Tier 4: roughly +80-100% damage Total defensive boost vs base Tier 4: roughly +50-60% effective HP/DR
Enemies at A5 are +150% HP, +100% damage. So even at maximum investment, combat is tighter than base Tier 4. The player is stronger, but the world is proportionally stronger. The gap between player power and enemy power is narrower at A5 than at base — which is exactly the point.

Milestone

Hours (from pack start)
Hours (from Ascension unlock)
Ascension 1 unlock
200-300
0
Ascension 2 unlock
250-350
30-60
Ascension 3 unlock
320-420
80-140
Ascension 4 unlock
400-520
150-250
Ascension 5 unlock
500-650
250-380
Oblivion Trial complete
550-700+
300-430+
Full Ascension + 100% Compendium
600-800+
350-500+
This extends the pack’s total meaningful content from 400 hours to 600-800 hours for the most dedicated players, without forcing anyone who stops at 200-400 hours to feel like they missed the “real” game.

### KubeJS Requirements

**Ascension state:** Stored as world-level GameRule or KubeJS persistent data.

```javascript
// Pseudo
ServerLevel.persistentData.ascensionLevel = 0-5
```

**Mob scaling:** Hook into LivingSpawnEvent, check ascension level, multiply HP/damage.

```javascript
// Pseudo
onEvent('entity.spawned', event => {
  let ascension = getAscensionLevel(event.level)
  let hpMult = [1.0, 1.25, 1.5, 1.75, 2.0, 2.5][ascension]
  let dmgMult = [1.0, 1.2, 1.4, 1.6, 1.8, 2.0][ascension]
  event.entity.modifyAttribute('max_health', hpMult)
  event.entity.modifyAttribute('attack_damage', dmgMult)
})
```
Nemesis System: On PlayerDeathEvent, tag the killing entity with player UUID + “nemesis” flag + stat boosts. On entity death, check for nemesis flag and grant bonus rewards.
Corrupted Champions: On Champion spawn event (Champions Unofficial hook), roll for Corrupted status. Add extra affix + particle effect + loot table modifier.
Rift Echoes: On boss death event at A3+, 20% chance spawn shadow copy with reduced HP + 2 random Rift modifiers.
Night Raids: Scheduled event on PlayerTickEvent checking world time. Every 3rd night at A4+, spawn wave near player.
Corruption Zones: Scheduled world tick event at A2+. Spawn invisible marker entity at random location, apply area effects. At A5, zones persist and expand — track with persistent block data.
Gauntlet Challenges: FTB Quests chapter with KubeJS-driven weekly rotation. Use server tick to check elapsed real time and swap active challenges.
Oblivion Trial: Special RFTools dimension with forced sequential floors, no Void Coffer banking, death = clear trial inventory (not equipped).

Fallback Simplifications

If full implementation is too complex:
FeatureSimplification
Nemesis System
Skip. Replace with flat +XP bonus on death recovery.
Corruption Zones
Make static pre-placed zones instead of randomly spawning.
Rift Echoes
Replace with flat % Rift material drop chance from all bosses at A3+.
Night Raids
Replace with flat mob spawn rate increase at night.
Gauntlet Challenges
Replace with static FTB Quest milestones instead of rotating.
Oblivion Trial
Replace with “reach Rift Floor 40” as the A5 capstone.
Gauntlet scaling weapons
Skip. Replace with static Ascension-tier crafted weapons.
Even with all fallbacks active, the core value proposition (escalating difficulty modifiers + stat rewards + exclusive crafting) remains intact.

Ascension is per-world and irreversible. No toggling on/off to farm easy content with A5 rewards.
Stat bonuses are percentage-based, not flat. They don’t trivialize early content — they keep pace with scaling enemies. Gauntlet weapon scaling caps at +25%. Not infinite.
Corrupted Shards require killing Corrupted Champions, which are rare and dangerous. Can’t be farmed passively. Ascension Sigils are curios — occupy a slot, competing with other powerful curios.
The Oblivion Trial is one-time. The Shard of Oblivion is the ultimate achievement, not a repeatable farm. Night Raids can’t be cheesed by sleeping — they trigger based on elapsed game ticks, not day/night cycle.

Quest Book Layout, Tier Advancement, and Reward System

The quest book is a guide, not a cage. Quests are the primary path to tier advancement and the source of skill points and loot boxes. But players who ignore the quest book can still advance through KubeJS-detected milestones (killing bosses, crafting key items, entering dimensions). The quest book rewards engagement with bonus rewards — it doesn’t punish avoidance.
Branching paths, single destination. Each tier has multiple quest chains matching the 5 unlock paths (Grinding, Magic, Boss, Exploration, Engineering). All paths converge on a single “Tier Unlocked” gate quest. Complete ANY ONE path to advance.
Complete more for extra skill points and loot.
Quest rewards drive character progression. Skill points come from milestone quests. Loot boxes come from regular quests. Tier advancement comes from gate quests. Three reward types, three purposes.

Primary Path: FTB Quests

Complete quest chains → reach gate quest → gate quest triggers AStages advancement via command reward.
Gate quest command: /astages add <player> tier_2<player> <category> 1Gate quest command: /astages add <player> tier_2<player> <category> 1/puffish_skills points add/puffish_skills points add(or equivalent) Skill point command:
Gate quest command: /astages add <player> tier_2
<player> <category> 1
Gate quest command: /astages add <player> tier_2
<player> <category> 1
/puffish_skills points add
/puffish_skills points add

Backup Path: KubeJS Milestone Detection

For players who don’t use the quest book, KubeJS event handlers detect key milestones and trigger stage advancement automatically:

TierKubeJS Detection Triggers (ANY ONE)

Tier 2
Kill any Tier 2 boss (Naga, Lich, etc.) OR craft a Thermal Machine Frame OR enter Twilight Forest + Blue Skies + Aether

Tier 3
Kill any Tier 3 boss (Harbinger, Ignis, etc.) OR craft a Mekanism Steel Casing OR enter Undergarden + Deeper Darker
+ Nether
Tier 4
Kill Ender Dragon OR Gaia Guardian OR craft Mekanism Ultimate Control Circuit
Key difference: KubeJS milestones grant tier access ONLY. They do NOT grant skill points or loot boxes. Those are quest-book- exclusive rewards. This incentivizes engaging with the quest book without forcing it.

Chapter Layout

ChapterPurposeColor/Icon
Welcome
Tutorial, basics, class/race selection
White / Book
Tier 1: Foundations
Overworld progression, early systems
Green / Wooden Pickaxe
Tier 2: Expansion
Dimensional exploration, mid-game
Blue / Diamond
Tier 3: Dominion
Advanced tech/magic, Nether
Purple / Nether Star
Tier 4: Ascension
Endgame, End dimension
Gold / Dragon Egg
The Crucible
Arena progression, wave milestones
Red / Netherite Sword
Community
Server milestones, collaborative goals
Cyan / Beacon
Prestige
Prestige tracking, bonus display
Black / Enchanted Book

Class & Skills
Class info, skill point tracking, build guides

Yellow / Experience Bottle

Purpose: Teach players the pack’s systems. No tier advancement — pure tutorial.
QuestTypeTriggerReward
Welcome to the Pack
Manual accept
Read quest description
Quest book guide
Choose Your Race
Detection
Select an Origins race
1 Skill Point
Choose Your Class
Detection
Select a G&H RPG class
1 Skill Point
First Blood
Detection
Kill any hostile mob
Iron Loot Box
Craft a Weapon
Detection
Craft any sword/axe
—
Your First Meal
Detection
Eat any food item
—
Open Your Skills
Detection
Open Pufferfish’s Skills menu (press K)
1 Skill Point
Find a Waystone
Detection
Activate a waystone
—
Total skill points from Welcome: 3

5 quest paths, all converging on “Tier 2 Gate” quest.

### Path Structure

```
[Path A: Grinding] ──────┐
[Path B: Magic] ──────────┤
[Path C: Boss] ───────────┼──→ [TIER 2 GATE] ──→ Tier 2 unlocked
[Path D: Exploration] ────┤
[Path E: Engineering] ────┘
```

Each path is 5-7 quests long. Completing ANY ONE path unlocks the gate quest. Completing additional paths grants bonus rewards.

Path A: Grinding (Resource Gathering)

QuestTriggerReward
Iron Age
Obtain 64 iron ingots
Iron Loot Box
Copper Collection
Obtain 64 copper ingots
Iron Loot Box
Bronze Forging
Craft 32 bronze ingots (Create alloy)
1 Skill Point
Bulk Production
Have 3 stacks (192) of any single ingot type
Iron Loot Box
Stockpile
Have 10 different material types in storage
Iron Loot Box
Industrial Scale
Produce 512 total ingots (any combination)
1 Skill Point
Path Complete: Material Master
Complete all above
Tier 1 Loot Box + 1 Skill Point

Path B: Magic (Spellcasting & Mana)

QuestTriggerReward
Mana Spark
Create a Botania Mana Pool
Iron Loot Box
First Spell
Cast any Iron’s Spells spell
Iron Loot Box
Floral Arrangement
Create 5 different Botania functional flowers
1 Skill Point
Spellbook
Craft an Iron’s Spells spellbook
Iron Loot Box

Mana Network
Have 3+ Mana Pools connected with Mana Spreaders

1 Skill Point
Spell Repertoire
Learn 5 different spells
Iron Loot Box
Path Complete: Apprentice Mage
Complete all above
Tier 1 Loot Box + 1 Skill Point

Path C: Boss (Combat)

QuestTriggerReward
Armed and Ready
Craft a full set of iron+ armor
Iron Loot Box
Monster Hunter
Kill 100 hostile mobs
1 Skill Point
Champion Slayer
Kill your first Champion mob
Iron Loot Box

Mini-Boss Down
Kill any Overworld mini-boss (dungeon bosses, Apotheosis boss)

1 Skill Point
Path Complete: Proven Warrior
Complete all above
Tier 1 Loot Box + 1 Skill Point

Path D: Exploration

Quest
Trigger
Reward

Wanderer
Visit 5 different biomes
Iron Loot Box

Dungeon Delver
Enter any dungeon structure (Dungeon Crawl, Battle Tower, etc.)

Iron Loot Box
Dungeon Cleared
Clear a dungeon (reach the final loot chest)
1 Skill Point
Cartographer
Visit 10 different biomes
1 Skill Point
Structure Hunter
Find 5 different structure types
Iron Loot Box
Path Complete: Explorer
Complete all above
Tier 1 Loot Box + 1 Skill Point

Path E: Engineering (Automation)

QuestTriggerReward
First Machine
Place any Create mechanical component
Iron Loot Box

Rotation
Create a Create rotation source (windmill, water wheel)

Iron Loot Box

Assembly Line
Set up a Create mechanical crafting or mixing process

1 Skill Point

Pretty Pipes
Craft and connect a Pretty Pipes network (3+ pipes)

Iron Loot Box

Automated Processing
Automate ore processing (input raw ore, output ingots, no player intervention)

1 Skill Point
Path Complete: Engineer
Complete all above
Tier 1 Loot Box + 1 Skill Point

Tier 2 Gate Quest

Quest
Trigger
Reward

Tier 2: Expansion Awaits

Complete ANY ONE path above
AStages Tier 2 unlock + 1 Skill Point + Tier 2 Loot Box

Bonus Rewards (Multiple Path Completion)

Paths CompletedBonus
2 paths
+1 Skill Point + Tier 1 Loot Box
3 paths
+1 Skill Point + Tier 1 Loot Box
4 paths
+2 Skill Points + Tier 2 Loot Box

All 5 paths
+2 Skill Points + Tier 2 Loot Box + Cosmetic Title: “Renaissance”
Total skill points available in Tier 1 chapter: 15 (3 Welcome + 12 Tier 1) - Minimum (1 path + gate): 5 points - Maximum (all 5 paths + all bonuses): 15 points

CHAPTER: Tier 2 — Expansion

Same 5-path branching structure. Quests are harder, rewards are better.

Path A: Grinding

QuestTriggerReward
Steel Production
Craft 64 steel ingots
Steel Loot Box
Manasteel Forging
Craft 32 manasteel ingots
Steel Loot Box
Thermal Processing
Set up a Thermal Pulverizer + Redstone Furnace
1 Skill Point
Mass Production
Produce 1024 total ingots (any Tier 2 materials)
1 Skill Point
Dimensional Harvest
Collect materials from 2+ Tier 2 dimensions
Steel Loot Box
Path Complete
All above
Tier 2 Loot Box + 1 Skill Point

Path B: Magic

QuestTriggerReward
Ars Nouveau Initiate
Craft an Ars Nouveau spell book
Steel Loot Box
Advanced Botania
Create a Terrasteel ingot
1 Skill Point

Spell Customization
Create a custom Ars Nouveau spell with 3+ augments

Steel Loot Box
Terra Blade
Craft the Botania Terra Blade
1 Skill Point
Mana Mastery
Generate 100,000 mana (Botania tracker)
Steel Loot Box
Path Complete
All above
Tier 2 Loot Box + 1 Skill Point

Path C: Boss

QuestTriggerReward
Twilight Awakening
Kill the Twilight Forest Naga
Steel Loot Box
Lich King
Kill the Twilight Forest Lich
1 Skill Point
Hydra Slayer
Kill the Twilight Forest Hydra
Steel Loot Box
Ur-Ghast
Kill the Twilight Forest Ur-Ghast
1 Skill Point
Cross-Dimensional Champion
Kill Champions in 2+ different Tier 2 dimensions
Steel Loot Box
Path Complete
All above
Tier 2 Loot Box + 1 Skill Point

Path D: Exploration

QuestTriggerReward
Twilight Tourism
Visit 5 Twilight Forest biomes
Steel Loot Box
Sky Explorer
Visit 3 Blue Skies biomes
Steel Loot Box
Aether Pioneer
Visit 3 Aether biomes
1 Skill Point
Dimensional Dungeons
Clear a dungeon in 2+ Tier 2 dimensions
1 Skill Point
All Three Realms
Enter Twilight Forest + Blue Skies + Aether
Steel Loot Box
Path Complete
All above
Tier 2 Loot Box + 1 Skill Point

**Path E: Engineering**

| Quest | Trigger | Reward |
|-------|---------|--------|
| Thermal Foundation
Build a Thermal Dynamo + 3 Thermal machines
Steel Loot Box
Industrial Start
Place an Industrial Foregoing machine
Steel Loot Box
Power Grid
Generate 10,000 RF/tick from any source
1 Skill Point

Cross-Mod Automation
Use 2+ different tech mods in one automation chain

1 Skill Point

Smart Storage
Set up a storage system with 100+ unique item types accessible

Steel Loot Box
Path Complete
All above
Tier 2 Loot Box + 1 Skill Point

Tier 3 Gate Quest

Quest
Trigger
Reward

Tier 3: Dominion Calls

Complete ANY ONE Tier 2 path
AStages Tier 3 unlock + 1 Skill Point + Tier 3 Loot Box
Bonus rewards for multiple paths: same structure as Tier 1 (scaling skill points + loot boxes). Total skill points in Tier 2 chapter: ~20 (across all paths + bonuses)

Same structure. Abbreviated for brevity — full quest details follow the same pattern.

Path Themes

PathKey Quests
A: Grinding
Diamond automation, Enderium production, 2048+ ingots of Tier 3 materials
B: Magic
Occultism spirit binding, Forbidden & Arcanus rituals, Ars Nouveau master spells
C: Boss
Harbinger kill, Ignis kill, Wither kill, Meet Your Fight bosses

D: Exploration
Undergarden full explore, Deeper Darker explore, Nether full explore (fortress, bastion, city)
E: Engineering
Mekanism basic setup, Refined Storage network, IF Laser Drill, XNet controller

Tier 4 Gate Quest

Quest
Trigger
Reward

Tier 4: Ascension Begins

Complete ANY ONE Tier 3 path
AStages Tier 4 unlock + 1 Skill Point + Tier 4 Loot Box
Total skill points in Tier 3 chapter: ~20

Path Themes

PathKey Quests
A: Grinding
Netherite automation, Gaia ingot production, antimatter generation
B: Magic
Mahou Tsukai mastery, Gaia Guardian preparation, ultimate spell crafting
C: Boss
Ender Dragon, Gaia Guardian, Cataclysm endgame bosses
D: Exploration
Deep Aether full explore, End multi-zone exploration, all Moog’s End Structures
E: Engineering
Mekanism Fusion Reactor, QIO network, MekaTool/Mekasuit crafting

Endgame Unlock

Unlike previous tiers, Tier 4 doesn’t gate a “Tier 5.” Instead, completing Tier 4 paths unlocks endgame content:
QuestTriggerReward

The Crucible Awaits
Complete ANY ONE Tier 4 path + kill Ender Dragon
Crucible Key recipe unlocked + 2 Skill Points

Prestige Eligible
Complete ALL Tier 4 gate requirements (see Prestige doc)

Prestige option unlocked
Total skill points in Tier 4 chapter: ~15

Tracks arena progression. Not part of tier advancement — pure endgame.
QuestTriggerReward
Enter the Crucible
Complete a Crucible run (any wave count)
Crucible Loot Box
Wave 10
Clear Wave 10
1 Skill Point + Crucible Loot Box
Wave 25
Clear Wave 25
1 Skill Point + Crucible Loot Box
Wave 50
Clear Wave 50
1 Skill Point + Mythic Loot Box
Wave 75
Clear Wave 75
Mythic Loot Box
Wave 100
Clear Wave 100
1 Skill Point + Mythic Loot Box + Cosmetic
Challenge Dimension I
Complete a Difficulty 10+ Challenge Dimension
1 Skill Point
Total skill points from Crucible chapter: 5

Server-wide milestone tracking (see Endgame Content Design doc). Quests here are observation-only — progress bars that show server totals.

QuestTriggerReward (server-wide)
Dragon Slayers I
10 server Ender Dragon kills
+5% End loot
Dragon Slayers II
50 kills
+10% End loot
Champion Hunters I
1,000 Champions killed
+10% Champion drops
Industrial Revolution
1,000,000 RF generated
+5% machine speed
(etc.)
(see Endgame doc)
(see Endgame doc)
No skill points from Community chapter — rewards are server-wide buffs.

Tracks prestige progress. Shows current prestige level, cumulative bonuses, and requirements for next prestige.
QuestTriggerReward
Prestige I
Complete first prestige
Cosmetic Title + display
Prestige V
Reach Prestige 5
Cosmetic Aura

Prestige X

Reach Prestige 10
Ultimate Cosmetic + Title “Prestige Master”
No skill points from Prestige chapter — prestige bonuses are separate.

SourcePointsCumulative
Welcome chapter
3
3
Tier 1 (all paths + bonuses)
12
15
Tier 2 (all paths + bonuses)
20
35
Tier 3 (all paths + bonuses)
20
55
Tier 4 (all paths + bonuses)
15
70
Crucible / Endgame
5
75
Total
75

Minimum points (speedrun, one path per tier): - Welcome (3) + 1 path per tier (~5+5+5+4) + gate quests (4) = ~26 points
- Enough to fill 2 trees with one branch each + some Tier 1 nodes
Maximum points (completionist, all paths): - All 75 points - Enough for deep investment across 4+ trees
This creates a meaningful reward for quest engagement. Players who only do the minimum path get 26 points — functional but limited. Players who complete everything get 75 — nearly triple. The quest book rewards thoroughness without requiring it.

Loot Box Tiers

Loot boxes are quest rewards that grant random tier-appropriate gear and materials. Implemented as KubeJS loot table items.

Iron Loot Box (Tier 1 quests)

DropWeightExamples
Iron/Copper gear piece
30%
Iron sword, iron chestplate, copper tools
Basic materials (16-32)
25%
Iron ingots, copper, coal, redstone
Common Apotheosis affix gear
15%
Random iron-tier with 1 Common affix
Food variety pack
15%
5-8 different food items (Spice of Life helper)
Basic enchanted book
10%
Level 1-2 enchantments
Flawed gem
5%
Random Apotheosis flawed gem
Steel Loot Box (Tier 2 quests)

DropWeightExamples
Steel/Manasteel gear piece
25%
Steel sword, manasteel armor
Tier 2 materials (16-32)
20%
Steel ingots, manasteel, steeleaf, ironwood
Uncommon/Rare affix gear
20%
Random steel-tier with Uncommon or Rare affix
Enchanted book (level 2-4)
15%
Mid-tier enchantments
Dimensional food pack
10%
5-8 foods from Tier 2 dimensions
Chipped/Normal gem
10%
Random Apotheosis gem
Tier 3 Loot Box

DropWeightExamples
Diamond/Terrasteel gear
20%
Diamond gear, terrasteel, enderium tools
Tier 3 materials (8-16)
20%
Diamond, terrasteel ingots, enderium, osmium
Rare/Epic affix gear
25%
Random diamond-tier with Rare or Epic affix
Enchanted book (level 3-5)
15%
Higher-tier enchantments
Flawless gem
10%
Random Apotheosis flawless gem
Boss material (1-2)
10%
Random boss drop material
Tier 4 Loot Box

DropWeightExamples
Netherite gear
15%
Netherite armor/weapons
Tier 4 materials (4-8)
15%
Netherite ingots, gaia fragments, antimatter
Epic/Mythic affix gear
25%
Random netherite-tier with Epic or Mythic affix
Enchanted book (level 5-8)
15%
High-level enchantments
Perfect gem
10%
Random Apotheosis perfect gem
Boss material bundle (2-4)
10%
Multiple boss drop materials
Prestige Token Fragment
10%
1 fragment (4 needed for full token)
**Mythic Loot Box (Crucible/Endgame)**

| Drop | Weight | Examples |
|------|--------|----------|
| Mythic affix gear (guaranteed)
30%
Netherite with guaranteed Mythic affix
Level 8-10 enchanted book
20%
Near-maximum enchantments
Perfect gem bundle (2-3)
15%
Multiple perfect gems
Prestige Token Fragment
15%
1 fragment
Void Essence / Reality Shard
10%
Challenge Dimension materials
Cosmetic item
10%
Random particle effect or title

FTB Quests Technical Setup

### Quest Reward Commands

**Tier advancement:**
```
/astages add @p tier_2
```

**Skill points:**
```
/puffish_skills points add @p melee 1
```

> **Note:** FTB Quests can use “choice reward” to let players pick which tree receives the point, OR auto-grant to a universal pool that players allocate themselves. Universal pool is cleaner.

**Loot boxes:**
```
/give @p modpack:iron_loot_box 1
```

KubeJS registered item that opens a loot table on right-click.

Quest Detection Types
Detection quests: Automatically complete when player performs action (craft item, kill mob, enter dimension). Most quests use this.
Submission quests: Require player to submit items to the quest book. Used for “obtain X of material” quests. Items are consumed.
Observation quests: Track global progress (Community chapter). No player action needed.

### KubeJS Milestone Detection (Backup Advancement)

```javascript
// Example: Tier 2 advancement via boss kill (no quest book)
ServerEvents.entityKilled(event => {
  if (isTier2Boss(event.entity) && !hasStage(event.player, 'tier_2')) {
    addStage(event.player, 'tier_2');
    event.player.tell('§6[Milestone] §fYou have unlocked Tier 2 through combat!');
    event.player.tell('§7Complete quest paths for bonus Skill Points and Loot Boxes.');
  }
});
```

### Prestige Quest Reset

On prestige, all FTB Quest progress resets via:

```
/ftbquests change_progress @p reset
```
Skill points already earned are tracked separately in Pufferfish’s Skills persistent data and are NOT affected by quest reset. The KubeJS prestige handler marks which quest-sourced skill points have been earned to prevent re-earning on subsequent prestiges.

Quest Book UI Recommendations

Chapter icons should be visually distinct and match tier color coding Branching paths should be visually clear — use FTB Quests’ dependency lines Gate quests should be large, centered nodes that all paths visibly connect to Progress tracking per path: show “Path A: 4/6 complete” style counters
Locked chapters (Tier 3 chapter locked until Tier 2 complete) prevent overwhelm
Description text in each quest should teach the player about the system being engaged with — the quest book is documentation

Minecraft 1.20.1 Forge — Complete Recommendations

Performance matters more than usual in this pack. You have 80+ content mods, heavy KubeJS scripting, ScalingMobs processing every entity, Champions adding affix calculations, and Apotheosis doing gear stat lookups constantly. Without aggressive optimization, TPS and FPS will suffer.

Rendering (Client-Side)

ModWhat It DoesPriorityNotes

Embeddium
Sodium port for Forge. Complete rendering overhaul. 2-5x FPS improvement.

ESSENTIAL
The single biggest FPS gain. Non-negotiable.
Embeddium Extra
(Sodium/Embeddium Extras)
Adds extra config options to Embeddium — animation toggles, particle control, fog settings

HIGH
Lets players on weaker hardware disable expensive effects

Oculus

Shader support for Embeddium (OptiFine shader packs work)

MEDIUM
Only if you want shader support. Slight overhead when active.

ImmediatelyFast

Optimizes immediate-mode rendering (GUIs, item frames, text, etc.)

HIGH
10-20% FPS gain in areas with lots of entities/GUIs. Stacks with Embeddium.

Entity Culling

Skips rendering entities not visible to the camera

HIGH
Major gain in areas with many mobs. Especially important with your high mob spawn rates.

Cull Less Leaves

Smarter leaf rendering — culls interior leaf faces

LOW
Minor FPS gain but zero gameplay impact. Free performance.

Memory & Loading

ModWhat It DoesPriorityNotes

ModernFix

Broad optimization mod — reduces memory usage, faster startup, lazy resource loading, fixed model baking

ESSENTIAL
Saves 500MB-1GB+
RAM. Dramatically faster loading. The second most impactful performance mod after Embeddium.

FerriteCore

Reduces memory usage of block states and properties

ESSENTIAL
30-50% reduction in block state memory. Critical for a pack with this many mods adding blocks.

Clumps

Groups XP orbs into single entities

HIGH
Your XP economy is heavy — mob farms, JLF leveling, enchanting, repair costs all generate XP orbs. Without Clumps, XP orb lag is inevitable.

Let Me Despawn

Fixes mobs with picked-up items never despawning

HIGH
With Improved Mobs making mobs pick up gear, this prevents entity accumulation over time. Critical.

Fast Suite

Caches recipe lookups

HIGH
With 80+ mods adding hundreds of recipes, uncached recipe lookups cause lag spikes during crafting and

autocrafting.

FastWorkbench

Caches crafting table recipe searches

HIGH
Same rationale. Prevents lag when opening crafting tables.

FastFurnace

Caches furnace/smelting recipe searches

MEDIUM
Less impactful than FastWorkbench but still useful.

Server / Tick Performance

ModWhat It DoesPriorityNotes

Canary

Forge port of Lithium. Optimizes game logic — entity collisions, mob AI, block ticking, pathfinding

ESSENTIAL
10-20% TPS
improvement. Critical for a pack with heavy mob AI (Improved Mobs, Champions, ScalingMobs).

ServerCore

Server-side optimizations — entity activation range, mob spawning optimization, chunk ticking

HIGH
Configurable entity activation ranges let you reduce processing for distant mobs. Important for performance tuning.

Alternate Current

Efficient redstone implementation

MEDIUM
Matters if players build complex redstone/Create contraptions. Prevents redstone from tanking TPS.

Chunk Sending

Optimizes chunk packet distribution

MEDIUM
Smoother chunk loading, especially on servers with multiple players exploring.

Smooth Chunk Save (Saturn)

Saves chunks continuously instead of all at once

MEDIUM
Prevents periodic lag spikes from world saves on servers.

Startup & World Loading

Mod
What It Does
Priority
Notes

Lazy DFU

Makes DataFixerUpper lazy-load instead of initializing at startup

HIGH
Shaves 10-30 seconds off startup. No gameplay impact.

Ksyxis

Reduces initial chunk loading on world join

MEDIUM
Faster world entry. Minor but noticeable with many dimension mods.

ModWhat It DoesPriorityNotes

Jade

Tooltip overlay showing what you’re looking at (block, entity, info)

ESSENTIAL
With this many mods, players NEED at-a- glance information. Shows mob HP, block info, machine status.

Jade Addons

Extends Jade with info for modded blocks/entities

HIGH
Better tooltips for Create, Mekanism, Ars Nouveau machines etc.

JEI (Just Enough Items)

Recipe viewer and search

ESSENTIAL
Non-negotiable. Players cannot navigate 80+ mods without JEI.

JER (Just Enough Resources)

Shows mob drops, ore distribution, dungeon loot in JEI

HIGH
Helps players understand loot tables, ore generation across dimensions.

AppleSkin

Shows food stats (hunger, saturation) on tooltip and HUD

ESSENTIAL
Critical with Spice of Life food system. Players need to see what food does.

Overflowing Bars

Renders HP/armor bars beyond vanilla limits

ESSENTIAL
Your players will have 60-150+ hearts. Without this mod, the HP bar is unreadable.

JourneyMap

Minimap + fullscreen map with waypoints

ESSENTIAL
9 dimensions. Without a map mod, players are lost.

Controlling

Adds search to the keybinds menu

HIGH
80+ mods = hundreds of keybinds. Without search, finding/changing binds is miserable.

Equipment Compare

Shows stat comparison tooltip when hovering over gear

HIGH
With Apotheosis affixes, enchantments, and Mythic levels, comparing gear without side-by- side stats is painful.

Inventory HUD+

Shows armor durability, potion effects, and equipped items on HUD

MEDIUM
Useful for tracking Soulbound durability, active buffs from class passives, etc.

BetterF3

Improved debug screen with color-coded, organized info

LOW
Developer/power-user convenience. Helpful during playtesting.

Configured

In-game mod configuration editor

HIGH
With 80+ mods requiring config tuning, in-game editing saves enormous time vs editing JSON files.

ModWhat It DoesPriorityNotes

Mouse Tweaks

Improved inventory drag/drop mechanics

HIGH
Standard QoL. Makes inventory management less tedious.

TrashSlot

Adds a trash slot to inventory

MEDIUM
Prevents accidental drops, quick cleanup.

Trash Cans

Placeable void blocks for items, fluids, XP

MEDIUM
Useful for factory overflow, especially with Mekanism/IF.

Sophisticated Backpacks

Tiered backpacks with auto-pickup, filtering, upgrades

Already in pack
Gated by tier as designed. Core storage/inventory mod.

Inventory Sorter

Click to sort inventory

MEDIUM
Simple but effective. Reduces inventory management time.

Cosmetic Armor Reworked

Separate display armor from functional armor

HIGH
Required for your Compendium cosmetic rewards to work. Already discussed.

ModWhat It DoesPriorityNotes

FTB Ultimine

Hold key + mine to vein-mine connected blocks

Already in pack
Works alongside Lumberjack enchant for tree felling.

FTB Chunks

Chunk claiming and force-loading

Already in pack
Keeps machines/farms running. Essential for automation.

FTB Essentials

/home, /back, /tpa commands

Already in pack
Basic multiplayer convenience alongside Waystones.

Fast Leaf Decay

Leaves break quickly after logs are removed

HIGH
Without this, tree farms and Lumberjack enchant leave ugly floating leaves everywhere.

No Chat Reports

Disables chat reporting system

MEDIUM
Standard modded server inclusion. Prevents accidental bans from Mojang’s system.

Simple Voice Chat

Proximity voice chat

MEDIUM
Multiplayer QoL. Great for group dungeon/Abyss runs.

Lootr

Per-player instanced loot chests

Already in pack
Essential with this many structures and dimensions.

Nature’s Compass

Find biomes

MEDIUM
9 dimensions with unique biomes. Helps locate specific resources.

Explorer’s Compass

Find structures

MEDIUM
Same rationale. Helps find structures across dimensions.

Catalogue

Better mod list UI

LOW
Nice for players browsing installed mods. Not essential.
Passable Foliage

Walk through tall grass, flowers, vines

LOW
Minor aesthetic/feel improvement.

Just Enough Effect Descriptions

Shows potion effect descriptions in JEI

MEDIUM
With custom class buffs, Champion debuffs, and dimension mechanics applying effects, knowing what effects DO matters.

Mod
What It Does
Priority
Notes

Corpse

Leaves a corpse entity on death containing inventory

CONDITIONAL
You have keep- inventory. Corpse is redundant for items. HOWEVER — it could serve as a visual marker of where you died, which helps with the “retrieve and repair” flow. Low priority.

You’re in Grave Danger

Gravestone mod

SKIP
Redundant with keep- inventory + your death penalty system. Don’t add.

ModWhat It DoesPriorityNotes
ConnectedTexturesMod (CTM)
Connected textures for glass, bookshelves, etc.

Already in pack

Aesthetic essential.
Connected Glass
Specifically for glass connected textures
Already in pack
—

Rechiseled
Add connected texture variants to many blocks

Already in pack

—

Chisels & Bits

Micro-block building

Already in pack
Creative endgame building tool.
Structurize
Blueprint building, copy/paste structures
Already in pack
—

Light Overlay

Shows light levels as overlay (F7)

HIGH
Critical for mob- proofing builds, especially with your aggressive Improved Mobs config where mobs break blocks.

Torch Slabs Mod or
Torchmaster

Place torches on slabs / mega-torch for mob-free zones

MEDIUM
Torchmaster’s mega- torch creates mob-free zones around bases. Useful QoL for builders who don’t want to constantly fight mobs while building.
Consider gating mega- torch to Tier 2-3.

ModWhat It DoesPriorityNotes
Simple Voice Chat

Proximity voice

Already listed

—
No Chat Reports

Removes chat reporting

Already listed

—

FTB Teams

Team system for chunk claiming, shared quests

MEDIUM
Multiplayer. Lets groups share FTB Chunks claims and quest progress.
Important if multiplayer is a real target.
WTHIT / Jade
Already covered
—
—

ModWhy Avoid

OptiFine
Incompatible with Embeddium. Causes conflicts with many mods. Embeddium + Oculus replaces it fully.
Performant
Known to cause mob AI issues. Conflicts with Improved Mobs and Champions.
AI Improvements
Conflicts with Improved Mobs which already overhauls mob AI.
Starlight
Included in ModernFix on 1.20.1. Don’t install separately.
Radium/Radium Reforged
Canary already covers this (Lithium port). Don’t install both.
RandomPatches
Most fixes are already in ModernFix for 1.20.1.

Phase 1 — Non-Negotiable (install first, test stability): 1. Embeddium 2. ModernFix 3. FerriteCore 4. Canary 5. JEI 6. Jade
Phase 2 — High Impact (install next): 7. Embeddium Extra 8. ImmediatelyFast 9. Entity Culling 10. Clumps 11. Let Me Despawn 12. Fast Suite + FastWorkbench + FastFurnace 13. ServerCore 14. Overflowing Bars 15. AppleSkin 16. JourneyMap 17. Controlling
Phase 3 — Important QoL: 18. Jade Addons 19. JER 20. Lazy DFU 21. Configured 22. Equipment Compare 23. Light Overlay 24. Fast Leaf Decay 25. Mouse Tweaks 26. Cosmetic Armor Reworked
Phase 4 — Nice to Have: 27. Alternate Current 28. Ksyxis 29. Cull Less Leaves 30. Chunk Sending 31. Smooth Chunk Save 32. Nature’s Compass + Explorer’s Compass 33. Just Enough Effect Descriptions 34. BetterF3 35. Inventory Sorter 36. Oculus (if shader support wanted)

Beyond installing mods, these CONFIG changes matter for a heavy pack:

Entity Limits

ServerCore: Set entity activation range to 32 for hostiles (default 48). Mobs beyond 32 blocks tick at reduced rate.
Mob cap: Consider reducing hostile mob cap from 70 to 50-60. Your mobs are individually stronger, so fewer are needed for threat.
Champion spawn rate is already 5-15% — this is reasonable. Don’t go higher for performance reasons.

Chunk Loading

FTB Chunks: Limit force-loaded chunks per player to 25-49. Unlimited force-loading kills server TPS.
Render distance: Recommend 10-12 for clients, 8-10 for servers. With 9 dimensions, server memory scales with render distance × loaded dimensions.

KubeJS Optimization

Your custom systems (death penalty, skill triggers, class passives) fire on LivingHurtEvent and LivingDeathEvent. These events fire CONSTANTLY in combat.
Cache attribute lookups — don’t recalculate class modifiers on every hit. Calculate once and store on player data.
Batch Pufferfish Skills checks — don’t check all 110 skill nodes every combat tick. Check only the ones that modify the current event type.
Abyss floor transitions should pre-generate the next floor during the current floor (async) to prevent lag spikes.

Memory Allocation

Recommend 6-8 GB minimum allocated to Minecraft for this pack 8-10 GB for servers with 5+ players
FerriteCore + ModernFix reduce baseline by ~1-2 GB, but 80+ mods still need headroom

Cross-Referenced Against All Design Documents

Total mods in list: ~406 (including libraries, APIs, compat layers)

AI-Improvements — REMOVE
Problem: Directly conflicts with Improved Mobs (which you need to add) AND potentially with Champions Unofficial. AI- Improvements modifies mob pathfinding and targeting at a low level. When Champions adds its own AI affixes (Blink, Commanding, Summoning) and Improved Mobs adds gear usage, block breaking, and coordination, three mods fighting over the same AI systems causes unpredictable behavior. Action: Remove AI-Improvements. Improved Mobs handles behavioral AI, Champions handles elite affixes, and Cataclysmic Combat handles animation improvements. AI-Improvements is redundant.

Starlight + ModernFix — POTENTIAL REDUNDANCY
Problem: On 1.20.1, ModernFix includes light engine optimizations that overlap with Starlight. Having both installed can cause conflicts or at minimum wasted processing. Action: Test with both installed — some 1.20.1 builds of ModernFix defer to Starlight if present. If you see light engine errors in logs, remove Starlight and let ModernFix handle it. Monitor this.

Mobtimizations + Canary — POTENTIAL OVERLAP
Problem: Both optimize mob AI and spawning. Mobtimizations specifically targets spawn event optimization, while Canary (Lithium port) optimizes pathfinding and collision. They CAN coexist, but test for entity behavior oddities — especially with your custom ScalingMobs + Champions + Improved Mobs stack. Action: Keep both for now. If mobs behave strangely (frozen, not pathfinding, not spawning Champions), remove Mobtimizations first.

No See, No tick + ServerCore — OVERLAP
Problem: Both manage entity activation/ticking ranges. If both are active with different configs, mobs might not tick when they should (breaking ScalingMobs scaling, Champions affix behavior, Improved Mobs AI). Action: Use ServerCore as the primary entity management tool. Disable or remove No See, No tick, OR configure them identically. Don’t have two mods fighting over which entities tick.

BadOptimizations + Immersive Optimization — CHECK COMPAT
Problem: Both are broad optimization mods. Usually safe together but worth monitoring for conflicts. Less risky than the above items. Action: Keep both. If startup errors mention either mod, investigate.

Critical (Required by Design Documents)

Mod
Why
Design Doc Reference

Pufferfish’s Attributes
Required for Pufferfish’s Skills custom trees.
Provides melee_damage, ranged_damage, magic_damage, life_steal, resistance_shred, fortune, mining_speed attributes that ALL skill tree nodes use.

skill_tree_design.md — every node references puffish_attributes

Improved Mobs
Designed extensively into enemy scaling. Mobs using gear, breaking blocks, coordinating attacks, per- dimension AI config. Without this, Tier 3-4 dimension combat mechanics don’t work.

enemy_scaling_design.md — every dimension section references it
Recommended (Fills QoL Gaps)

ModWhyPriority

ImmediatelyFast
10-20% FPS gain on top of Embeddium. Optimizes GUI, text, item rendering.

HIGH

Oculus
Shader support via Embeddium. Only if shader support is wanted.

MEDIUM

Jade Addons
Better tooltips for Create, Mekanism, Thermal, Ars Nouveau machines. Without it, Jade shows limited info for modded blocks.

MEDIUM

Equipment Compare
Side-by-side stat comparison on gear hover. Critical with Apotheosis affixes + enchantments + Mythic levels making gear comparison complex.

MEDIUM

Light Overlay
F7 light level display. Important for mob-proofing bases, especially with Improved Mobs making mobs break blocks to reach players.

MEDIUM

Optional (Nice to Have)

Mod
Why
Priority

Lazy DFU
Faster startup (10-30s saved).
LOW

No gameplay impact.

Alternate Current
Efficient redstone. Matters for complex Create/Mekanism factories.

LOW
Ksyxis
Faster world join.
LOW

Just Enough Effect Descriptions
Shows what potion effects do in JEI. Useful with class buffs, Champion debuffs, dimension mechanics.

LOW

Transmog
Item appearance customization at Transmogrification Table.
Complements Cosmetic Armor Reworked for endgame cosmetics.

LOW

Review Required

These mods are in your list and directly touch systems we’ve designed. They need careful configuration to not conflict with or undermine the design.

Enchanting & Repair Economy

ModInteractionAction Needed

Easy Anvils

Reduces anvil costs/removes “too expensive” cap
CONFIGURE CAREFULLY. Your death penalty relies on repair costs being meaningful. If Easy Anvils trivializes repairs, the death penalty has no teeth. Recommend: keep “too expensive” removal (Apotheosis needs high-level enchants to be combinable) but do NOT reduce XP costs.

Easy Magic

Reroll enchanting table, keep lapis on pickup
Fine as-is. Doesn’t undermine Apotheosis enchanting balance.

Disenchanting

Extract enchants from items
GATE TO TIER 2+. If free from Tier 1, players can strip enchants from found gear and trivialize early enchanting progression.
Enchantment Transfer

Move enchants between items

GATE TO TIER 2+. Same reasoning as Disenchanting.
Merge Enchantments

Combine enchanted books

Fine — QoL for anvil work.
Enchantment Level Cap Indicator

Shows when enchant is at max level

Good QoL for Apotheosis above-vanilla levels. Keep.

Tax Free Levels

Flattens XP level cost curve
REVIEW. Your XP economy assumes XP is valuable. If Tax Free Levels makes high levels trivially cheap, repair costs and respec costs lose meaning. May need to disable or configure to maintain cost curve.
Table Of Expieriance

Store/retrieve XP from a block
GATE TO TIER 2. Free XP banking from Tier 1 undermines early-game XP scarcity.

Combat & Difficulty

ModInteractionAction Needed

Azukaar’s Fair Difficulty Overhaul

Modifies mob damage/health scaling
CHECK FOR CONFLICT with ScalingMobs. Both modify mob stats. If Azukaar’s applies multipliers ON TOP of ScalingMobs, your Tier 4 mobs hit 2x harder than designed. Either disable Azukaar’s stat scaling and keep only its behavior changes, or remove it entirely.

Armor Damage Limit

Caps how much durability armor loses per hit
REVIEW. Your death penalty removes % durability on death. If Armor Damage Limit also caps combat durability loss too aggressively, armor never needs repair from combat — only from death. This might be fine (death penalty is the main durability sink) or might make Soulbound too easy to ignore.

KeepDurable1.20.1

Prevents items from breaking (0 durability = unusable but not destroyed)
THIS IS YOUR INERT SYSTEM. Keep. This mod likely implements the “items go inert at 0 durability” behavior you designed. Verify it works as expected.

Cut Through

Attacks hit multiple mobs in a swing
Fine — good melee QoL. Synergizes with Berserker/Crowd Control builds.

Footwork

Dodge/movement mechanics
CHECK for conflict with Better Combat. Both modify combat movement. If they fight over dodge/dash, one should be disabled. Also check if Estrogen’s dash conflicts.

Too Fast

Prevents “moved too quickly” server kicks
ESSENTIAL. With class speed bonuses, Agility skill nodes, and high movement speed builds, vanilla’s speed check will kick players constantly. Keep.

Multiplayer Bosses

Scales boss HP for multiplayer
REVIEW interaction with Progressive Bosses. If both scale boss HP, bosses in multiplayer become exponentially tanky (Progressive scaling × multiplayer scaling). May need to reduce Progressive Bosses multipliers when Multiplayer Bosses is active.

No Hostiles Around Campfire

Safe zone around campfires
Fine for Tier 1-2. Consider disabling in Tier 3-4 dimensions where constant threat is the design intent (Nether’s Infernal Rage, Undergarden’s attrition).

Food & Hunger

ModInteractionAction Needed

Hunger Overhaul

Modifies hunger/saturation mechanics
CONFIGURE alongside Spice of Life: Carrot Edition. Both modify food. Ensure they’re complementary, not conflicting. Hunger Overhaul can make food less effective, which pairs well with Spice of Life’s “eat variety” incentive.

Sleep Hunger

Lose hunger while sleeping
Fine — minor realism addition. Doesn’t conflict with food systems.

Absolutely Stuffed

Extended saturation system
CHECK interaction with Spice of Life. If Absolutely Stuffed lets players stay full indefinitely, it undermines Spice of Life’s “eat new foods” pressure.
XP Economy

ModInteractionAction Needed

XP from Crops

Farming gives XP
Fine — diversifies XP sources beyond combat. Helps Artificer builds that farm more than fight.

Experienced Crops

Similar — crops give XP
CHECK if this stacks with XP from Crops. If both are active, farming becomes the dominant XP source and undermines combat XP value. Pick one or configure them to not stack.
Table Of Expieriance

XP storage block

Gate to Tier 2 as noted above.
Gear & Items

ModInteractionAction Needed

Bigger Stacks

Increases stack sizes
REVIEW. If this affects materials used in Mythic Forge / repair costs, it changes the economy. Stacking ingots to 256 means repair material costs feel less impactful. May be fine for QoL but be aware of the economic impact.
Armor Unlocked
Lets non-armor items go in armor slots
Fine — enables creative builds.

Treasure Reforging

Apotheosis reforging system
Already designed into the affix system. Verify gating matches: Tier 1 basic, Tier 2 rare, Tier 3 epic, Tier 4 mythic reforging.

Furnace Recycle

Smelt gear back into materials
Fine — helps with gear economy. Unwanted affix gear can be recycled rather than trashed.
Dimensions & Worldgen

ModInteractionAction Needed

Difficult Caves

Harder cave mobs/generation
CHECK interaction with ScalingMobs Overworld config. If Difficult Caves adds its own mob scaling on top of ScalingMobs, Overworld caves become harder than designed. May be fine (caves SHOULD be harder than surface) but verify the numbers.

Serene Seasons

Seasonal weather
Fine aesthetically. CHECK if seasons affect crop growth — this interacts with Spice of Life and farming XP. If winter kills crops, that’s a significant food economy change.

The Abyss: The

Is this your Abyss implementation, or a separate mod? If separate, CHECK if it conflicts with the custom Abyss

Other Side
Another dimension mod
dungeon design (which uses RFTools Dimensions). If this IS the Abyss, the endgame design doc needs updating.

Flight

ModInteractionAction Needed

Icarus

Custom wings/flight mechanics
CHECK gating. If Icarus provides free flight before Tier 4 Elytra, it trivializes vertical dimensions (Aether, Deep Aether, Blue Skies). Gate Icarus wings to Tier 3-4 materials.

Iron Jetpacks

Tiered jetpacks
Already designed as tiered by materials. Verify tier gating is enforced via AStages.
Networking & Stability

ModInteractionAction Needed
Connectivity Mod

Fixes connection issues

Keep. Important for multiplayer with this many mods.
PacketFixer
Fixes packet size issues
Keep. Large modpacks can exceed vanilla packet limits.
FullStack Watchdog

Detects and reports server freezes
Keep for debugging. Disable in production if it causes log spam.

Neruina

Catches and handles ticking entity crashes
ESSENTIAL. With ScalingMobs, Champions, and Improved Mobs all modifying entity behavior, ticking entity crashes are likely during development. Neruina prevents server- wide crashes from one bad entity.

Entry
Issue
connectedglass-1.1.13-forge-mc1.19.2.jar.duplicate
Wrong MC version (1.19.2). Remove.
fusion-1.2.7b-forge-mc1.19.2.jar.duplicate
Wrong MC version (1.19.2). Remove.

Origins appears twice
Check if this is Origins + Origins Overhaul or an actual duplicate jar.

These are in your list, weren’t part of design discussions, and don’t conflict with anything. They’re neutral additions.
Ambiance/Aesthetic: AmbientSounds, Fallingleaves, Pretty Beaches, Pretty Rain, Sound Physics Remastered, Traveler’s Titles, Chat Heads, biomemusic mod, Beautiful Enchanted Books, Better Animations Collection, Prism, Highlighter
Mob Additions: Alex’s Mobs, Creeper Overhaul, Naturalist, Mutant Monsters, Savage & Ravage, Enemy Expansion, Nether Skeletons, Nether Zombies, Undead_revamp2, Majestic Menaces, Zombie Horse Spawn
Structure Additions: YUNG’s suite (all good — better vanilla structures), When Dungeons Arise, Structory/Towers, Explorify, Stalwart Dungeons, Valhelsia Structures, ChoiceTheorem’s Village, Integrated Dungeons and Structures, Keebsz’s Battle Towers, Moog’s End Structures, Unwrecked Ships, Waystone Towers, Cherry Samurai Temple, Cherry_Village, Villages & Pillages, Dungeons Plus, Epic Dungeons
Boss Additions: LuMoreBossesAndMobs, NovaBosses, Ultimate Bosses, Ultris: Boss Expansion, brutalbosses mod — all add to Progressive Bosses’ pool. Fine.
Food/Cooking: Brewin’ And Chewin’, Cultural Delights, Alex’s Delight, Nether’s Delight, Delightful, Refined Cooking, CookingForBlockheads, Farming for Blockheads — all feed into Spice of Life diversity. Good.
Misc QoL: Akashic Tome (all-in-one guide book), Morph-o-Tool (multi-tool wrench), FindMe (locate items in nearby chests), QuickStack, Visual Workbench, Comforts (sleeping bags/hammocks), CraftingTweaks, ToolStats, Advanced Hook Launchers, Supplementaries, Multi-Piston
Tech/Automation: CC: Tweaked (computers), Flux Networks (wireless RF), XNet (item/fluid/RF routing), Cable Tiers — all complement the tech tree without conflicting.

Category
Count
REMOVE
1 (AI-Improvements)
REMOVE (stale files)
2 (1.19.2 duplicates)

MONITOR for conflicts
4 (Starlight/ModernFix, Mobtimizations/Canary, No See No tick/ServerCore, BadOptimizations/Immersive Optimization)

CONFIG REVIEW REQUIRED
14 (Easy Anvils, Tax Free Levels, Azukaar’s, Armor Damage Limit, Multiplayer Bosses, Hunger Overhaul, Absolutely Stuffed, Experienced Crops + XP from Crops, Difficult Caves, Icarus, Bigger Stacks, Footwork, Serene Seasons, The Abyss: The Other Side)
ADD (critical)
2 (Pufferfish’s Attributes, Improved Mobs)

ADD (recommended)
5 (ImmediatelyFast, Oculus, Jade Addons, Equipment Compare, Light Overlay)
Fine as-is
~380

Total systems designed: Tier progression, 9 dimensions, 10 classes, 7 races, 110 skill nodes, ~95 custom affixes, 25 custom enchantments, ~40 unique boss weapons, 5 endgame loops, 5 Ascension levels, full quest structure, 406 mods audited.
Estimated content: 150-200 hours to soft endpoint, 400-600 hours for completionist, 600-800+ hours with full Ascension.