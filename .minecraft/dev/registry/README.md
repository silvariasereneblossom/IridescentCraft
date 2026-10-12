# Registry snapshot: what the game really registers

Generated, never edited by hand. These files are what a dedicated server of the pack holds after a full boot: the
ids the game registered, not the ids a jar's assets or a wiki page suggest. `SOURCE.json` names the commit they were
taken from.

They are the id lists for validators (does this item, entity, structure, loot table, attribute, effect exist?) and
they replace the item list of 2026-04-27 (`TesterLogs\Item Audit\all_items.tsv`), which has no row for any mod added
since.

| File | One line per |
|---|---|
| `items.txt`, `blocks.txt`, `entity_types.txt`, `fluids.txt`, `block_entity_types.txt` | registered id |
| `enchantments.txt`, `attributes.txt`, `mob_effects.txt`, `potions.txt`, `villager_professions.txt` | registered id |
| `structures.txt`, `structure_sets.txt`, `biomes.txt`, `dimension_types.txt` | id in the datapack registry |
| `dimensions.txt` | dimension (level) the server has |
| `game_rules.txt`, `game_rule_values.tsv` | game rule; rule and its value in a fresh world |
| `loot_tables.txt` | loot table the game holds after the data load |
| `loot_tables_rejected.txt` | loot table a jar or datapack ships and the game's parser rejected (it does not exist in game) |
| `recipes.tsv` | recipe id, recipe type, serializer, tab-separated, AFTER the pack's scripts ran (a removed recipe is not in it). The type reads `unregistered` when the recipe's type is in no registry (28 recipes of `theabyss` at `59ee40da`) |
| `recipe_type_counts.tsv`, `recipe_types.txt` | recipes per type; registered recipe types |
| `advancements.txt` | advancement id |
| `entities.json` | entity type: mob category, tags, base attributes (see below) |
| `mixin_configs_applied.txt` | mixin config that applied at least one mixin on a dedicated server |
| `mods.txt` | jar the server runs with (the launcher's filter applied to the server index) |

`entities.json`: `entities` maps an entity type to its `category` (`monster`, `creature`, `misc`, ...), its `tags`
when it has any, and for a living entity its `attributes` with their BASE values and an `attribute_count`. The pack's
mods give every living entity about 170 attributes; listed are the vanilla combat and movement attributes the type
has, and every other attribute whose base is not that attribute's default. `attribute_defaults` has the defaults.
These are the values of the entity TYPE: what scripts and difficulty mods add when a mob spawns is not in them.

To refresh after a change of mods or of registrations, from a checkout of `main`:

    powershell -File .minecraft\dev\boot\boot.ps1 -Ref origin/main -WriteSnapshot

then commit this folder. The tool, its limits and the full dump of a boot (every registry, about 200 of them) are
described in `.minecraft\dev\boot\README.md`.
