# The Iridescent Codex, kept current from the pack's sources

The Codex is the pack's Patchouli book (`iridescent_codex_data.jar`, the same jar in the three distros). Since
2026-10-17 the facts it states are **not typed**: they are filled from the sources of truth when the jar is built,
and a gate (pre-push hook and CI) fails while the committed jar is not what those sources build now.

```bash
python .minecraft/dev/codex/codex.py check      # the gate: exit 0 current, 1 stale or wrong, 2 could not run
python .minecraft/dev/codex/codex.py release    # build, validate, deploy x3, manifests + markers, expected_state
python .minecraft/dev/codex/codex.py diff       # what a release would change, page by page
python .minecraft/dev/codex/codex.py facts      # the facts as the sources say them
python .minecraft/dev/codex/codex_test.py       # the tests (CI: .github/workflows/codex.yml)
```

## How a content change reaches the book

1. Change the content: a boss's tier or arena in `bosses.json`, a dimension's gate or death penalty in
   `dimensions.json`, a band in the difficulty config, a boss-rush share, a token threshold, a unique's boss.
2. `python .minecraft/dev/codex/codex.py release`. It prints which pages changed and the files to commit (the three
   jars, the three `custom_jars_manifest.json`, the three markers `mods/.index/iridescent-codex.pw.toml`, the two
   `expected_state.json`).
3. Commit them **with** the content change, push. Forgotten: the hook and CI fail with `STALE` and say step 2.

A boss or dimension added to a registry also needs its name in `names.json` (the gate says which). A unique weapon
added to `unique_itemset_registry.js` too (`items`).

Hand-written text that contradicts a registry fails the gate whether or not anything else changed (below): fix the
words, or write a placeholder so the number follows the source from then on.

## Where each fact comes from (`codex_facts.py`)

| Fact | Source |
|---|---|
| a boss's tier, kind, designed health (with the x3), boss-rush tier, arena (place, dimension) | `kubejs/config/icraft/registry/bosses.json`; the x3 from `scaling/zz_boss_global_3x.js` |
| a dimension's tier, stage gate, death penalty (default from `death_penalty.js`) | `kubejs/config/icraft/registry/dimensions.json` |
| the difficulty band (start, cap, hours, damage) and which dimension is on which tier | `config/iridescent_difficulty-common.toml` |
| the boss-rush shares (and roster sizes, kills needed) | `gates/codex_boss_rush.js` `BOSS_RUSH_TIERS` + the registry |
| the token thresholds | `gates/codex_progression_engine.js` |
| tokens per kill (boss first / repeat, miniboss), per first arrival, the token item | `exploration/codex_exploration_kills.js` |
| every unique weapon: tier, kind, who drops it and how often | `loot/unique_itemset_registry.js` (+ `boss_unique_drops.js`'s chance), `loot/loot_overhaul.js` |
| the names players read | `dev/codex/names.json` (the game's English names; the only hand-kept data here) |

A script constant is found by a pattern that must match exactly once. A rewritten line makes the gate fail with the
file and the constant (exit 1: "a fact source"), never a silent default: update the pattern in `codex_facts.py`.

## Writing the book

The source is `.minecraft/datapack_sources/iridescent_codex/data/icraft/patchouli_books/iridescent_codex/`
(`book.json`, `en_us/categories`, `en_us/entries`). Write prose as before; for a fact, write a placeholder:

| Placeholder | Gives |
|---|---|
| `{{boss <id> name}}` `tier` `kind` `place` `where` `dim` `health` `health@<level>` `rush` `first` `repeat` `each` | "Thunker", "Tier 4", "miniboss", "Chthonic Dungeon", "Chthonic Dungeon, the Nether", "the Nether", "3,000", the Ultimate Wither's "3,000", "Tier 3", token amounts |
| `{{dim <id> name}}` `Name` `tier` `gate` `death` `difficulty` `damage` `hours` | "the Moon", "Tier 4", "22%", "6x to 10x", "+30%", "200" |
| `{{tier <n> difficulty}}` `damage` `hours` `deathrange` `dims` `Dims` `token` `threshold` `rushpct` `rushsize` `rushneed` `first` `repeat` `each` | "6x to 10x", "12% to 14%", "the Twilight Forest, Everbright and Everdawn", "Codex Token III", "1,000", "90%", "18", "17" |
| `{{bosses mod=… tier=… rush=… kind=boss\|miniboss dim=… <format>}}` | `count` `word` `Word` `names` `Names` `list` |
| `{{dims tier=… flag=… <format>}}` | `count` `word` `names` `Names` |
| `{{uniques tier=… kind=sword\|bow dropped=yes\|no <format>}}` | `count` `word` `names` `list` `minchance` `maxchance` |
| `{{const dimentry}}` | tokens for a first arrival |

A generated page is written as `{"type": "icraft:generated", "generator": "<name>", ...}` and becomes as many text
pages as it needs (continuations titled "..., cont."):

| Generator | Pages |
|---|---|
| `boss_roster` `{"tier": n}` | every boss and miniboss of tier n: place, health, boss-rush exceptions, the token rule |
| `rush_targets` | each tier's boss rush: roster size, share, kills needed |
| `dimension_glance` `{"tier": n}` | the tier's dimensions: gate, death penalty; the difficulty band |
| `unique_list` `{"tier": n}` | the tier's unique weapons by the boss that drops each, with the chance; the ones no boss drops yet |

Generated pages are sized with the uniform font's widths (`book.json` `use_blocky_font: false`), 14 lines to a page:
on the safe side of the 16 a page holds. The hand-written pages measure 15 lines at the median (`codex_render.count_lines`).

## What the gate checks (`codex.py check`)

1. every fact source reads (a missing file, a constant the pattern no longer finds);
2. every registry boss, dimension and unique weapon has a name in `names.json`, and no name is left for one the
   registries dropped;
3. every placeholder and generated page fills (a boss the registry no longer has is named with the page);
4. the hand-written text (`codex_prose.py`):
   - **TYPED FACT**: a difficulty multiplier, a death penalty, a boss-rush share, a token threshold or a boss's health
     typed as a number. The message names the placeholder to write.
   - **TIER**: a boss named under a tier it is not at. The tier a phrase speaks of is a tier word ("Tier 3", "T3",
     "T3+", "T3-T4") in its clause, else the heading before it on the line ("Tier 1 -- Gob ..."), else later in the
     same sentence, else the page title, else the entry name ("Tier 1 Bosses"). A boss passes when its tier, its
     boss-rush tier or its arena's tier is in range; a name two bosses share passes when either does. Which words name
     a boss: `names.json` `match` (and `ignore` for longer phrases that are something else: "Ultimate Wither").
   - **PLACE**: a boss name followed by a parenthesis naming a place that is not its arena: "Thunker (Chthonic
     Cathedral)".
   - **ID**: a namespaced id the game does not register (`dev/registry`), for the namespaces the snapshot knows.
5. the three committed jars are byte for byte what the sources build (`STALE` otherwise, with the pages that differ);
6. the three manifests and the three markers carry the jar's hash;
7. `validate_codex.py` passes on the built jar (Patchouli's load rules, links, items, keybinds, textures).

## The jar (`codex_jar.py`)

Built in Python, no JDK: `META-INF/mods.toml`, a fixed `MANIFEST.MF`, `pack.mcmeta`, the committed class
(`classes/`, remade from `src/` by `build_codex.sh` only when the Java changes), `book.json` under `data/`, the
rendered content under `data/` and `assets/` (Patchouli 1.20.1-85 reads book.json from data/ and the content only
from assets/). Entries sorted, one fixed date, stored (not deflated: no zlib version changes a byte), no extra
fields: the same sources give the same bytes on every machine, so "current" is a hash compare and a release moves
the hash only when the book changed.

Why the book stays in a jar (decided 2026-10-17, on recommendation, for review): the content could be read from
`kubejs/assets` (KubeJS's resource pack, already mirrored by `sync-distros.ps1`), which would remove the release
step. It is the delivery path that once shadowed the book for months (a Paxi resource pack, 2026-08-27), Patchouli
would read the book from two places again, and only a client can show that it loads; the jar path is the one proven
in game. The release is one command and the gate makes it impossible to forget, which removes the reason to move.

## Files

| File | What |
|---|---|
| `codex.py` | the command line: check, release, diff, facts, inputs, build |
| `codex_facts.py` | the facts model, read from the sources |
| `codex_render.py` | placeholders, generators, the page-fit estimate |
| `codex_prose.py` | the checks of the hand-written text |
| `codex_jar.py` | the deterministic jar |
| `names.json` | the names players read; the words the prose check recognises |
| `codex_test.py` | tests on a small pack built in a temporary folder, and two on the real pack |
