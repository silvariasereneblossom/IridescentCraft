# IridescentCraft Status Report

**Date:** 2026-03-15
**Minecraft Version:** 1.20.1 Forge
**Mod Count:** 420+
**KubeJS Version:** 6.x (2001.6.5-build.16)

---

## 1. Project Overview

IridescentCraft is a progression-focused expert-lite Minecraft 1.20.1 Forge modpack with 420+ mods. It features a full RPG layer built on top of the modded Minecraft ecosystem, including:

- **4-tier progression system** gated by AStages (per-player stage tracking)
- **10 character classes** and **7 playable races** implemented through Origins, with a three-prompt character creation flow on first join
- **6 skill trees** via Pufferfish's Skills with command-based rewards
- **Custom enchantments** (24 total) via Apotheosis registration
- **142 Apotheosis affixes** + 15 event-driven affixes spanning all tiers and equipment types
- **Endgame loops** including Oblivion's Rift, Mythic Forge, and a 5-level Ascension/Prestige system
- **Patchouli guidebook** (Iridescent Codex) with 80 entries across 11 categories, delivered on first join with 9 competing mod books suppressed
- **Cross-mod recipe audit** blocking 30+ tier-breaking recipes across 8 mods
- **Dimension-specific combat mechanics** for Twilight Forest, Undergarden, Deeper Darker, and more
- **Death penalty system** with equipment durability damage and XP loss
- **LootJS loot table overhaul** covering 35+ structure mods, boss drops, and tier token seeding

The modpack is developed on Linux, synced to a Windows gaming PC via GitHub Desktop and PrismLauncher.

---

## 2. Implementation Status

| System | Status | Notes |
|--------|--------|-------|
| Tier gating (AStages) | Implemented | Scripts in place, needs in-game API verification |
| Dimension scaling | Implemented | `dimension_scaling.js` |
| Death penalty | Implemented | `death_penalty.js` |
| Loot tables (LootJS) | Implemented | `lootjs_overhaul.js` (setCount API fixed) |
| Skill trees (Pufferfish) | Implemented | Datapack + `skill_effects.js` (34% placeholder effects) |
| Custom enchantments | Implemented | `custom_enchantments.js` + `enchant_effects.js` (24 enchants) |
| Apotheosis affixes | Implemented | 142 JSON + 15 event-driven affixes |
| Class respec | Implemented | `class_respec.js` |
| Equipment HP halving | Implemented | `equipment_hp_halving.js` |
| FTB Quests | Not started | Quest book needs in-game GUI editor |
| Patchouli Codex | Working | 11 categories, 80 entries. Formatted, advancement-gated |
| Book suppression | Working | `/clear` with NBT matching, 9 mod books suppressed |
| Endgame loops (Part VIII) | Implemented | Rift Shards, Mythic Forge, 12 endgame items, boss drops |
| Prestige/Ascension (Part IX) | Implemented | 5 ascension levels, mob scaling, stat bonuses, `!ascend` |
| Loot table overhaul | Implemented | `lootjs_overhaul.js` — 35+ structure mods, boss drops, tier tokens |
| Villager trade rework | Implemented | Forge VillagerTradesEvent — books removed, XP trades added |
| Waystone recipes | Implemented | Boss-drop gated crafting, all variants |
| Cross-mod recipe audit | Implemented | 30+ tier-breaking recipes blocked across 8 mods |
| Mod config audit | Implemented | ScalingMobs, Champions, Apotheosis configs aligned to design |
| Three-prompt character creation | Working | Origin -> Race -> Class, confirmed 2026-03-14 |
| Milestone detection | Implemented | Auto-advance tiers on boss kills / key crafts |
| Tier-skip mechanics | Implemented | Material transmutation (32-64 ingots -> 1 next-tier) |
| Boss progressive scaling | Implemented | Per-kill world-global scaling for modded bosses |
| Dimension combat mechanics | Implemented | Canopy Ambush, Virulent Spores, Darkness Empowerment, etc. |
| Mob equipment scaling | Implemented | Dimension-aware gear on spawned mobs |
| Refined Storage dual-path | Implemented | Two crafting paths to RS components |

---

## 3. File Tree

### KubeJS Scripts (`.js` files)

```
kubejs/
├── client_scripts/
│   ├── broken_tooltip.js
│   ├── example.js
│   └── predicates.js
├── server_scripts/
│   ├── affixes/
│   │   └── affix_effects.js
│   ├── astages/
│   │   ├── dimension_gates.js
│   │   ├── item_gates.js
│   │   ├── ore_gates.js
│   │   └── recipe_gates.js
│   ├── class/
│   │   └── equipment_hp_halving.js
│   ├── codex_delivery.js
│   ├── death_penalty.js
│   ├── enchantments/
│   │   └── enchant_effects.js
│   ├── endgame/
│   │   ├── ascension.js
│   │   ├── mythic_forge.js
│   │   └── rift_mechanics.js
│   ├── example.js
│   ├── gates/
│   │   └── milestone_detection.js
│   ├── loot/
│   │   ├── loot_overhaul.js
│   │   └── lootjs_overhaul.js
│   ├── recipes/
│   │   ├── recipe_audit.js
│   │   ├── refined_storage_dualpath.js
│   │   ├── tier_gated_recipes.js
│   │   ├── tier_skip.js
│   │   └── waystone_recipes.js
│   ├── respec/
│   │   └── class_respec.js
│   ├── scaling/
│   │   ├── boss_hp.js
│   │   ├── boss_progressive.js
│   │   ├── dimension_mechanics.js
│   │   ├── dimension_scaling.js
│   │   └── mob_equipment.js
│   ├── skills/
│   │   └── skill_effects.js
│   └── villager_trades.js
└── startup_scripts/
    ├── custom_enchantments.js
    ├── custom_items.js
    ├── endgame_items.js
    ├── example.js
    └── iridescent_codex.js
```

### KubeJS Assets (91 JSON files)

```
kubejs/assets/icraft/patchouli_books/iridescent_codex/en_us/
├── categories/                           (11 category JSONs)
│   ├── bosses.json
│   ├── classes.json
│   ├── loot.json
│   ├── mods_t1.json ... mods_t4.json
│   ├── progression.json
│   ├── skills.json
│   ├── systems.json
│   └── welcome.json
└── entries/                              (80 entry JSONs)
    ├── bosses/        (6 entries)
    ├── classes/       (18 entries — 10 classes, 7 races, 1 overview)
    ├── loot/          (5 entries)
    ├── mods_t1/       (14 entries)
    ├── mods_t2/       (6 entries)
    ├── mods_t3/       (5 entries)
    ├── mods_t4/       (4 entries)
    ├── progression/   (5 entries)
    ├── skills/        (7 entries)
    ├── systems/       (6 entries)
    └── welcome/       (3 entries)
```

### KubeJS Data (143 JSON files)

```
kubejs/data/
├── apotheosis/affixes/             (30 affix JSONs — base set)
├── botania/orechid/                (5 ore weight overrides)
├── champions/affix_setting/        (16 champion affix settings)
├── icraft/
│   ├── advancements/              (3 tier advancement triggers: T2, T3, T4)
│   ├── origins/                   (17 origin definitions: 10 classes + 7 races)
│   ├── patchouli_books/           (1 book.json definition)
│   ├── powers/
│   │   ├── class/                 (10 class dirs, ~44 power JSONs total)
│   │   └── race/                  (7 race dirs, ~21 power JSONs total)
│   └── puffish_skills/categories/ (6 skill tree definitions)
└── improvedmobs/config/           (1 attribute config)
```

### Global Packs (Paxi Datapacks)

```
global_packs/required_data/
├── champions_datapack/            (folder) + champions_datapack.zip
├── icraft_apotheosis_affixes/     (folder) + icraft_apotheosis_affixes.zip    [142 affix JSONs]
├── icraft_botania_overrides/      (folder) + icraft_botania_overrides.zip
├── icraft_skills/                 (folder) + icraft_skills.zip
├── improvedmobs_datapack/         (folder) + improvedmobs_datapack.zip
├── iridescent_classes/            (folder) + iridescent_classes.zip
├── iridescent_codex/              (folder) + iridescent_codex.zip
└── iridescent_races/              (folder) + iridescent_races.zip
```

Note: Paxi 4.0 only loads ZIP files, not folders. Folders are kept as working copies.

### Custom Mod JARs

```
mods/
├── iridescent_classes.jar         Origins class layer (mod JAR for layer registration)
└── iridescent_codex_data.jar      Patchouli book data (use_resource_pack: true)
```

### Wiki

```
wiki/
├── CLAUDE.md                      Session guidance for Claude Code
├── LICENSE.md                     Standard's Petty Software License v2.0
├── home.md                        Wiki homepage + implementation status table
├── classes/overview.md            10 classes, 7+ races, glass cannon mechanics
├── design/
│   ├── master.md                  Master design document (canonical source of truth)
│   └── changelog.md               Tracked design changes across sessions
├── known-issues/tracker.md        Active bugs, verification needed, resolved
├── kubejs/overview.md             Script reference, event compatibility
├── meta/style-guide.md            Writing conventions
├── mods/overview.md               Key mods by tier, config changes
├── progression/overview.md        Tier system, dimension gates
├── protocols/
│   ├── 1-harmonize.md             Full harmonization pass protocol
│   ├── 2-spot-check.md            Random-sample spot-check protocol
│   └── 6-homepage-coverage.md     Homepage coverage check protocol
└── systems/overview.md            Death penalty, scaling, enchantments, etc.
```

### Design Docs

```
designdocs/
├── Master-Design-Document.md                           Markdown copy of master design
├── master_design_document IridescentCraft.docx         Original Word document
├── IridescentCraft_Implementation_Recap.docx           Implementation recap
├── ftbquests_implementation_reference.md                FTB Quests technical reference
├── ftbquests_template.md                               FTB Quests quest template
├── Missing Context.txt                                 Notes on missing information
├── LICENSE.md                                          License
├── LAGh4dJ.png                                        Reference image
├── status_report.md                                   This file
├── wiki-template/                                     Wiki template directory
└── wiki-template.tar.gz                               Archived wiki template
```

---

## 4. Script Inventory

### server_scripts/ (29 files, 8,138 lines total)

| File | Lines | Description |
|------|------:|-------------|
| `affixes/affix_effects.js` | 295 | Runtime effects for 15 event-driven Apotheosis affixes (on-hit, on-kill triggers) |
| `astages/dimension_gates.js` | 53 | AStages dimension restrictions — locks dimensions behind tier stages |
| `astages/item_gates.js` | 164 | AStages item restrictions — prevents equipping/using tier-gated items |
| `astages/ore_gates.js` | 62 | AStages ore restrictions — hides/blocks mining of tier-gated ores |
| `astages/recipe_gates.js` | 71 | AStages recipe restrictions — hides tier-gated recipes from JEI |
| `class/equipment_hp_halving.js` | 155 | Glass cannon mechanic — halves max HP for glass cannon classes based on equipment |
| `codex_delivery.js` | 111 | First-join Codex delivery, recovery recipe, and 9-book suppression system |
| `death_penalty.js` | 268 | Death penalty — XP loss, equipment durability damage, "broken" item tagging |
| `enchantments/enchant_effects.js` | 503 | Runtime effects for 24 custom enchantments (on-hit, on-block, passive) |
| `endgame/ascension.js` | 407 | 5-level prestige/ascension system with mob scaling and stat bonuses |
| `endgame/mythic_forge.js` | 262 | Mythic Forge crafting — endgame gear creation from boss materials |
| `endgame/rift_mechanics.js` | 286 | Oblivion's Rift mechanics — Rift Shard drops, Rift Core assembly, portal logic |
| `example.js` | 6 | KubeJS example stub (unused) |
| `gates/milestone_detection.js` | 304 | Auto-detects tier milestones (boss kills, key crafts) and grants AStages |
| `loot/loot_overhaul.js` | 918 | Legacy loot table modifications (superseded by lootjs_overhaul.js in some areas) |
| `loot/lootjs_overhaul.js` | 890 | LootJS loot overhaul — boss drops, structure loot tiering, token seeding |
| `recipes/recipe_audit.js` | 201 | Cross-mod recipe audit — blocks 30+ tier-breaking recipes across 8 mods |
| `recipes/refined_storage_dualpath.js` | 502 | Dual crafting paths for Refined Storage components |
| `recipes/tier_gated_recipes.js` | 250 | Core tier-gated recipe removals and replacements |
| `recipes/tier_skip.js` | 280 | Tier-skip material transmutation (32-64 ingots -> 1 next-tier ingot) |
| `recipes/waystone_recipes.js` | 271 | Boss-drop gated Waystone crafting recipes for all variants |
| `respec/class_respec.js` | 147 | Class respec mechanic — allows changing class via consumable item |
| `scaling/boss_hp.js` | 123 | Base boss HP scaling by dimension/tier |
| `scaling/boss_progressive.js` | 160 | Per-kill progressive scaling for modded bosses (world-global counter) |
| `scaling/dimension_mechanics.js` | 392 | Dimension-specific combat mechanics (Canopy Ambush, Virulent Spores, etc.) |
| `scaling/dimension_scaling.js` | 199 | Mob stat multipliers per dimension (HP, damage, speed, armor) |
| `scaling/mob_equipment.js` | 238 | Dimension-aware equipment on spawned mobs |
| `skills/skill_effects.js` | 326 | Pufferfish Skills effect application — command-based rewards (34% placeholder) |
| `villager_trades.js` | 294 | Villager trade rework — removes guide books, adds XP/progression trades |

### startup_scripts/ (5 files, 618 lines total)

| File | Lines | Description |
|------|------:|-------------|
| `custom_enchantments.js` | 174 | Registers 24 custom enchantments via Apotheosis |
| `custom_items.js` | 281 | Registers 37 custom items — progression tokens, boss materials, alloys |
| `endgame_items.js` | 136 | Registers 12 endgame items — Rift Core, Mythic Catalysts, Primordial Essence |
| `example.js` | 6 | KubeJS example stub (unused) |
| `iridescent_codex.js` | 21 | Patchouli book registration for the Iridescent Codex |

### client_scripts/ (3 files, 28 lines total)

| File | Lines | Description |
|------|------:|-------------|
| `broken_tooltip.js` | 13 | Adds "(BROKEN)" tooltip to death-penalty-damaged items |
| `example.js` | 6 | KubeJS example stub (unused) |
| `predicates.js` | 9 | Placeholder for AStages predicate-based item restrictions (unused) |

### Grand Total: 37 script files, 8,784 lines of KubeJS

---

## 5. Custom Content Summary

| Content Type | Count | Source |
|-------------|------:|--------|
| Custom items (startup registry) | 49 | `custom_items.js` (37) + `endgame_items.js` (12) |
| Custom enchantments | 24 | `custom_enchantments.js` |
| Apotheosis affixes (datapack ZIP) | 142 | `icraft_apotheosis_affixes.zip` |
| Apotheosis affixes (KubeJS data) | 30 | `kubejs/data/apotheosis/affixes/` |
| Event-driven affixes (runtime) | 15 | `affix_effects.js` |
| Codex categories | 11 | `kubejs/assets/.../categories/` |
| Codex entries | 80 | `kubejs/assets/.../entries/` |
| Patchouli books suppressed | 9 | terramity, simplyswords, footwork, ars_nouveau, irons_spellbooks, thermal, botania, create, theabyss |
| Origins (classes) | 10 | `kubejs/data/icraft/origins/` |
| Origins (races) | 7 | `kubejs/data/icraft/origins/` |
| Origin powers (class) | ~44 | `kubejs/data/icraft/powers/class/` |
| Origin powers (race) | ~21 | `kubejs/data/icraft/powers/race/` |
| Skill trees | 6 | Warfare, Fortitude, Marksman, Sorcery, Engineering, Gathering |
| Champions affix settings | 16 | `kubejs/data/champions/affix_setting/` |
| Botania Orechid overrides | 5 | `kubejs/data/botania/orechid/` |
| Tier advancements | 3 | T2, T3, T4 trigger advancements |
| Paxi datapack ZIPs | 7 | `global_packs/required_data/` |
| Custom mod JARs | 2 | `iridescent_classes.jar`, `iridescent_codex_data.jar` |

---

## 6. Known Issues & Testing Needed

### Active Issues

**Missing Icon/Texture Assets for Custom Items**
- Status: Known, low priority
- All 49 custom items (boss drops, endgame materials, Rift Shards, Mythic Catalysts, etc.) display the default purple/black missing-texture icon
- Fix: Create PNG textures in `assets/kubejs/textures/item/` for each item

### Needs In-Game Verification

These systems have been implemented but never tested in a running game:

1. **AStages API method signatures** — inferred from documentation, never verified
2. **Simply Swords unique weapon IDs** — 6 Abyss weapons referenced but unverified
3. **Origins `action_on_callback` syntax** — used for glass cannon auto-tagging
4. **Iron's Spells attribute names** — used in skill effects
5. **Apotheosis affix JSON schema** — 142 affixes deployed, compatibility untested
6. **Custom enchantment registration via Apotheosis** — 24 enchants registered, untested
7. **Mob equipment `setItemSlot` API** — fixed from old API, needs in-game verification

### Resolved Issues (Recent)

- Mob Equipment API (setArmorSlot -> setItemSlot) — fixed 2026-03-14
- Codex formatting + advancement gating — fixed 2026-03-14
- 112 new Apotheosis affixes added (30 -> 142) — 2026-03-14
- Origins++ overlap investigated (no conflicts) — 2026-03-14
- Patchouli Codex working after ~10 iterations — 2026-03-14
- LootJS setCount() API error fixed — 2026-03-14
- Paxi ZIP-only loading discovered — 2026-03-12
- pack_format corrected (15 -> 12) — 2026-03-12

---

## 7. Remaining Work

### FTB Quests (Not Started)
- A quest template has been created (`designdocs/ftbquests_template.md`) and a technical reference exists (`designdocs/ftbquests_implementation_reference.md`)
- FTB Quests requires the in-game GUI editor to build the quest tree — cannot be done via file editing
- The quest book is the primary player-facing progression guide and the main path for tier advancement (grants `!astages add` commands on completion)
- Currently, milestone_detection.js provides a backup auto-advance system

### Missing Item Textures
- All 49 custom items need PNG textures at `kubejs/assets/kubejs/textures/item/`
- Items include: progression tokens (T2-T4), boss materials, intermediate alloys, Rift Shards, Rift Core, Primordial Essence, Mythic Catalysts, endgame crafting components
- Without textures, items display the purple/black missing-texture placeholder

### In-Game Verification Backlog
- Every system listed in "Needs Testing" (Section 6) requires launching the game and checking
- Recommended approach: Use `/kubejs hand` to inspect items, `/astages` to test gating, and check `logs/kubejs/server.log` for errors
- The AStages API is the highest-risk unknown — if method signatures differ from docs, all 4 gate scripts (dimension, item, ore, recipe) will fail

### Config-Only Fixes (Documented in recipe_audit.js)
- **Botania Orechid ore weights:** Handled via `icraft_botania_overrides` datapack (already deployed)
- **Industrial Foregoing Laser Drill ore tables:** Requires manual edits to `config/industrialforegoing/laser_drill/*.json`
- These cannot be done via KubeJS and are noted in `recipe_audit.js` header comments for manual audit

### Skill Effects Completion
- `skill_effects.js` has 34% placeholder effects — these are stubbed with comments but lack real implementations
- Completing them requires knowing exact attribute names for Iron's Spells and other mods (needs in-game `/kubejs hand` inspection)

---

## 8. Architecture Notes

### Custom Mod JAR System

Two custom JAR files live in `mods/`:

- **`iridescent_codex_data.jar`** — Contains the Patchouli book definition with `use_resource_pack: true`. This is necessary because Patchouli discovers books from `data/<namespace>/patchouli_books/` inside mod JARs. The book content itself (categories, entries) lives in `kubejs/assets/` and `kubejs/data/`, but the book registration must come from a JAR. The JAR contains both `data/` and `assets/` directories with the book.json and pack.mcmeta (pack_format 12 for 1.20.1).

- **`iridescent_classes.jar`** — Registers the custom Origins layer for the class selection prompt. Origins requires layers to be declared inside a mod JAR to create the three-prompt character creation flow (Origin layer -> Race layer -> Class layer). Without this JAR, the class selection screen would not appear.

### Paxi Datapack System

Paxi 4.0 Forge loads datapacks from `global_packs/required_data/` as **ZIP files only** (folders are silently ignored). The workflow is:

1. Edit files in the unzipped folder (e.g., `icraft_apotheosis_affixes/`)
2. Re-zip the folder to create the `.zip` file that Paxi actually loads
3. Both the folder and ZIP are kept in the directory — the folder is the working copy, the ZIP is what the game reads

Current datapacks:
- `champions_datapack.zip` — Champions mob affix configuration
- `icraft_apotheosis_affixes.zip` — 142 Apotheosis affix definitions
- `icraft_botania_overrides.zip` — Botania Orechid ore weight overrides
- `icraft_skills.zip` — Pufferfish Skills tree definitions
- `improvedmobs_datapack.zip` — Improved Mobs configuration
- `iridescent_classes.zip` — Origins class definitions and powers
- `iridescent_codex.zip` — Patchouli Codex book data
- `iridescent_races.zip` — Origins race definitions and powers

### Book Suppression System

Nine competing mod guidebooks are suppressed to funnel players into the Iridescent Codex. The system works via `/clear` commands because KubeJS inventory slot manipulation is broken in 1.20.1 Forge:

1. On `PlayerEvents.loggedIn`, a sweep timer is armed (stored in `persistentData`)
2. `ServerEvents.tick` runs `/clear @s patchouli:guide_book{patchouli:book:"<mod>:<book>"}` for each suppressed book
3. Sweep runs every 1 second for the first 10 seconds after login, then every 10 seconds for 2 minutes
4. This catches books given by mods on login, on dimension change, or on recipe unlock

Suppressed books: terramity, simplyswords, footwork, ars_nouveau, irons_spellbooks, thermal, botania, create, theabyss

### Tier Gating System (AStages + KubeJS)

The tier system uses AStages for per-player stage tracking, with KubeJS scripts enforcing restrictions:

1. **Stages:** `tier_1` (default), `tier_2`, `tier_3`, `tier_4` — granted via FTB Quests or milestone detection
2. **Four gate scripts** enforce the stages:
   - `dimension_gates.js` — Blocks entering tier-locked dimensions
   - `item_gates.js` — Prevents equipping/using tier-locked items
   - `ore_gates.js` — Blocks mining tier-locked ores
   - `recipe_gates.js` — Hides tier-locked recipes from JEI
3. **Milestone detection** (`milestone_detection.js`) provides a backup path: killing a T2 boss or crafting a key item auto-grants the next tier stage (without the skill points that FTB Quests would also give)
4. **Tier-skip** (`tier_skip.js`) allows limited access to next-tier materials via expensive transmutation recipes (32-64 current-tier ingots for 1 next-tier ingot)

### Three-Prompt Character Creation

On first join, players see three sequential selection screens:

1. **Origin** (Origins++ mod layer, order 0) — Standard Origins selection
2. **Race** (icraft namespace, order 1) — 7 races: Human, Elf, Dwarf, Orc, Halfling, Faefolk, Revenant
3. **Class** (icraft namespace, order 2) — 10 classes: Berserker, Paladin, Vanguard, Ranger, Samurai, Archmage, Battlemage, Void Summoner, Artificer, Wanderer

This works because Origins supports multiple layers via separate namespaces. Each layer has an `order` field controlling prompt sequence. The `iridescent_classes.jar` mod JAR registers the class layer. Race and class definitions live in `kubejs/data/icraft/origins/` with corresponding powers in `kubejs/data/icraft/powers/`.

Classes fall into three HP categories:
- **Tank** (Berserker, Paladin, Vanguard, Battlemage): Full HP
- **Balanced** (Samurai, Wanderer, Artificer): Standard HP
- **Glass Cannon** (Archmage, Ranger, Void Summoner): Halved HP via `equipment_hp_halving.js`, tagged with `glass_cannon_tag` power

---

*Generated 2026-03-15. This is a point-in-time snapshot of the IridescentCraft project state.*
