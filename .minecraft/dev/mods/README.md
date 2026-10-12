# dev/mods: what a mod jar ships, and the pack audited against it

Static tools. Nothing here runs the game, changes a mod, an index entry, a script or a config.

| File | What it is |
|---|---|
| `jarscan.py` | The one archive scanner: one record per jar, nested jars included. Shared with the loot audit (`dev/loot_audit/truth.py` merges its records), one cache for both (`dev/loot_audit/.cache/jars`, git-ignored). |
| `inventory.py` | Per-jar inventory. No argument: every installed jar. With a jar path: the intake skeleton for that candidate. |
| `inventory-summary.json` | Generated, committed: counts and flags per jar, so a jar that changes what it ships shows up in a diff. |
| `packlists.py` | Reads the pack's own lists from the repo: boss lists, dimension-to-tier lists, the three mod indexes, tracked configs, every id the scripts and configs name. |
| `pack_audit.py` | Joins the inventory, the loot audit and the pack's lists into a findings file and a report. |

```
python -I .minecraft/dev/mods/inventory.py                       # scan all, rewrite inventory-summary.json
python -I .minecraft/dev/mods/inventory.py --check               # exit 1 when the summary is out of date
python -I .minecraft/dev/mods/inventory.py --show mowziesmobs    # full record(s) of an installed jar, JSON
python -I .minecraft/dev/mods/inventory.py path\to\candidate.jar # intake skeleton (add --json FILE to keep it)
python -I .minecraft/dev/mods/pack_audit.py --out-dir <private folder> --logs auto
```

Needs Python 3.11+, the PrismLauncher instance (the only place the third-party jars are) and, for the audit, a JDK
(it runs `audit_loot.py` first). A cold scan of the 458 jars takes about 10 seconds; the audit about a minute.

## What a record holds

One record per archive; a nested jar is its own record with `parent` set.

- **identity**: loader (Forge, or Fabric through the connector), mod ids and versions, dependencies, nested-jar metadata.
- **side**: `clientSideOnly`, `displayTest`, the Fabric environment, the sizes of the common / client / server mixin
  lists, common-listed mixins that target client classes, the `@Mod` class naming client classes, and the resulting
  hint with its reasons.
- **code**: class counts, hints by event or class used (boss bar, key mapping, config spec and its types, loot code,
  attribute / spawn / damage hooks, screen init, trades, game-rule registration), boss-like entities.
- **mixins**: every config with where it is declared, its three lists and each mixin's targets (read from the
  `@Mixin` annotation).
- **data**, as lists: loot tables by kind, Forge loot modifiers, worldgen structures, structure sets, template pools,
  biome modifiers, dimensions and dimension types, recipes by type, advancements, functions and the ones on the tick
  and load tags, damage types, tags written into `minecraft` / `forge` / `c` / another namespace (with `replace`),
  overrides of vanilla data, 1.21-layout folders.
- **lang**: entity and item ids, `key.*` and `gamerule.*` keys, enchantments, effects, attributes.
- **flags** and **counts**: what the summary keeps.

## What a jar cannot tell you

A language key or a model is not a registration. These need a real boot (the boot gate's registry dump under
`dev/registry/`, which `packlists.load_registry_dump` reads when it exists):

- which items, blocks and entities are registered; an entity's category and attributes; which entities really show
  a boss bar (a bar set up in a shared base class is inherited by every subclass);
- the key mappings a mod registers and their default keys; the registered game rules; config file names and defaults;
- loot tables assigned from code; whether a mixin applies; whether a jar is safe on a dedicated server;
- which copy of a library nested in several jars loads.

The intake skeleton marks every such answer `NEEDS A BOOT`.

## The audit's output

`pack_audit.py` writes `<name>.md` and `<name>.findings.json`. They name mods, scripts and paths of this pack in
detail: keep them out of this repo (`--out-dir`); without the option they go to `dev/mods/.cache/` (git-ignored).
`--logs auto` also reads which mixin configs the server registered at its last boots (through `dev/server_logs.py`).

## Changing the scanner

`jarscan.py` feeds the loot audit. Before pushing a change to it, run `audit_loot.py --no-cache` before and after
on the same jars and compare the report, the `--json` findings and `truth.json`: they must not differ (apart from the
timestamp and the scanner version). Nothing may be added to a unit's `counts` or `notes` for the inventory's sake:
the loot audit prints both. Bump `SCANNER_VERSION` when a unit's content changes.
