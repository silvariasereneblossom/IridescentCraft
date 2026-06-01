# KubeJS & Technical Overview

KubeJS 2001.6.5-build.16 for Minecraft 1.20.1 Forge. Primary scripting system for all custom gameplay.

## Script Locations

| Directory | Purpose | Load Time |
|-----------|---------|-----------|
| `kubejs/server_scripts/` | Server-side logic (events, recipes, loot) | World load |
| `kubejs/startup_scripts/` | Item/block registration, enchantments | Game startup |
| `kubejs/client_scripts/` | Tooltips, UI modifications | Client connect |
| `kubejs/data/` | Virtual datapack (recipes, tags, loot tables) | Resource reload |

## Event Compatibility (1.20.1 Forge)

### Working Events

- `PlayerEvents.loggedIn` — Player joins server
- `PlayerEvents.inventoryChanged` — Item added/removed from inventory
- `ServerEvents.recipes` — Recipe modification
- `ServerEvents.tick` — Server tick (use sparingly)
- `EntityEvents.spawned` — Entity spawn
- `EntityEvents.death` — Entity death
- `LootJS.modifiers` — Loot table modification
- `ItemEvents.tooltip` — Tooltip modification (**client_scripts only**)

### NOT Available (will crash)

- `PlayerEvents.pickedUpItem` — Does not exist
- `PlayerEvents.death` — Does not exist
- `PlayerEvents.changeDimension` — Does not exist
- `AStagesEvents` — Not a real KubeJS event class
- `MoreJS` — Not installed

## Implemented Scripts

| Script | Lines | Purpose |
|--------|-------|---------|
| `codex_delivery.js` | ~80 | First-join Codex delivery + mod book suppression |
| `dimension_scaling.js` | — | Per-dimension mob stat multipliers |
| `death_penalty.js` | — | Durability loss on death |
| `loot_tables.js` | — | LootJS tier-appropriate loot |
| `skill_effects.js` | 701 | 22 scoreboard-based skill effects (all functional) |
| `enchant_effects.js` | 503 | 24 custom enchantment effect handlers |
| `affix_effects.js` | 997 | Complex affix event handlers (65 event-driven effects) |
| `class_respec.js` | 147 | Class Altar respec system |
| `equipment_hp_halving.js` | 155 | Glass cannon HP penalty |
| `astages_restrictions.js` | — | AStages item/dimension gating (expanded derivative gating 2026-03-15) |
| `custom_enchantments.js` | 174 | Enchantment registration (startup) |

## Datapack Loading (Paxi)

Paxi 4.0 Forge loads datapacks from `global_packs/required_data/` as **ZIP files only**.

### Active Datapacks

| Datapack | Contents |
|----------|----------|
| `iridescent_codex.zip` | Patchouli book data |
| `icraft_skills.zip` | Pufferfish's Skills tree definitions |
| `icraft_apotheosis_affixes.zip` | Custom Apotheosis affix JSONs |
| `icraft_botania_overrides.zip` | Botania recipe/config overrides |
| `iridescent_classes.zip` | Origins class definitions |
| `iridescent_races.zip` | Origins race definitions |
| `improvedmobs_datapack.zip` | Improved Mobs configuration — **removed** (Improved Mobs dropped 2026-05-03, replaced by the `iridescent_difficulty` mod; source + zips deleted from all distros 2026-06-01) |
| `champions_datapack.zip` | Champions mob affix configuration — **removed** (Champions Unofficial dropped 2026-04-07, replaced by Majrusz's Progressive Difficulty; source deleted 2026-06-01 — shipped as source only, never built to a loaded zip) |

### Load Order

Configured in `config/paxi/datapack_load_order.json`. Names must include `.zip` suffix to match Paxi's internal naming.

### Known Issue: KubeJS Virtual Datapack

`kubejs/data/` serves recipes/tags/loot correctly but Patchouli's `BookContentResourceListenerLoader` cannot see files from it. Patchouli books must be in real datapacks (zip files via Paxi).

## Known KubeJS Errors (as of 2026-03-12)

1. `PlayerEvents.death` — does not exist, use `EntityEvents.death` with player check
2. `ItemEvents.tooltip` in server_scripts — must be in client_scripts
3. `AStagesEvents` — not a real class, use command-based approach
4. `PlayerEvents.changeDimension` — does not exist
5. `MoreJS` — not installed

## Related Pages

- [Master Design Document](../design/master.md) — Implementation details
- [Known Issues](../known-issues/tracker.md) — Current bugs
- [Systems](../systems/overview.md) — What the scripts implement
