# dev/mods: what a mod jar ships, and the pack audited against it

The first five tools are static: they run no game and change no mod, index entry, script or config.
Two tools write, each in its own section below: `mod_index.py generate` (the two distro indexes and the skip lists
from the root index) and `intake.py` (add, update and remove a mod; the intake records).
**To add, update or remove a mod, start at "Mod intake" at the end of this page.**

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

## The mod index: one source, the rest generated

| File | What it is |
|---|---|
| `mod_index.py` | The generator and the gate. Source: `.minecraft/mods/.index` (one metafile per mod) and `mod_index.policy.json`. `generate` writes the server index, the client distribution's index, `client_only_mods.txt` and the skip lists inside the server scripts. `check` is the pre-push block and the GitHub Action. |
| `mod_index.policy.json` | The facts a metafile cannot carry: the metafiles that exist only in the client distribution's index (none since 2026-10-18, when FancyMenu, Konkrete and Melody left), the two CurseForge mods pinned to a CDN url there, and the name patterns of retired mods a server must never keep. |
| `mod_index_sets.py` | Which jars every consumer of the indexes would install and keep (server launcher, dev client, tester client, the legacy scripts), each modelled from its own code. Run it before and after any change to an index and `diff` the two. |
| `mod_index_test.py` | Plants each past failure in a temporary copy and requires `check` to refuse it. |

```
python -I .minecraft/dev/mods/mod_index.py generate              # after editing a metafile or the policy
python -I .minecraft/dev/mods/mod_index.py check                 # the gate; exit 1 on a finding
python -I .minecraft/dev/mods/mod_index_sets.py sets --ref origin/main --out before.json
python -I .minecraft/dev/mods/mod_index_sets.py sets --out after.json
python -I .minecraft/dev/mods/mod_index_sets.py diff before.json after.json
```

`side` has one meaning, in the source: where the pack installs the jar. `both` = clients and the dedicated server;
`client` = clients only, and the metafile is then absent from the server index; `server` = the dedicated server only.
So the server index lists exactly what a server installs, and a client-only mod needs one edit: its `side`.

Add, update or remove a mod with `intake.py` (next section): it edits the metafile under `.minecraft/mods/.index`,
runs `generate`, and does the rest of the procedure. By hand, at the index level only: edit (or add, or delete) the
metafile, run `generate`, commit everything it wrote, and compare the sets before and after. Never edit a file under
`server_distribution/mods/.index` or `distribution/client/mods/.index`, or a block between `>>> mod_index.py` and
`<<< mod_index.py`: the gate refuses the push.

## Mod intake: add, update, remove and audit a mod

One tool, `intake.py`, and one record per mod. Until 2026-10-13 a mod was added by copying a metafile, and nobody
was asked what its dimension's tier, its boss, its chests or its side should be: a boss mod ran four months as trash
mobs for scaling, a dimension five months on tier 1, a client renderer took the server down.

| File | What it is |
|---|---|
| `intake.py` | The commands: `add`, `update`, `remove`, `audit`, `check` (the gate), `show`, `decide`, `apply`. |
| `intake_core.py` | What a record is, how it is read, and the gate. Reads the repo only (no jar, no boot). |
| `intake_derive.py` | From evidence to a record: one function per surface. |
| `intake_test.py` | The tool on a jar it builds itself, in a temporary copy; and every case the gate must refuse. |
| `records/grandfathered.json` | The records of the mods the pack had at the first audit. One file (see "Why one file"). |
| `records/<metafile name>.json` | The record of a mod added since. |
| `intake_baseline.json` | Which mods are grandfathered. Every other mod of the index is NEW. |

### The record

`python -I .minecraft/dev/mods/intake.py show <mod>` prints one. It lists every surface the mod touches as a
DECISION: what the jar ships (`ships`), what the pack already says (`pack`), what happens while nobody decides
(`default`), and the question with its short answers. A surface the mod does not touch is listed under
`not touched`.

| Decision key | The question |
|---|---|
| `side` | both, client or server |
| `boot` | does the dedicated server boot with it, with no regression (new mods and updates only) |
| `nested` | is each mod nested in the jar wanted |
| `tier-gate` | which tier its items belong to and how they are gated |
| `dimension:<id>` | the tier of each dimension it registers, or untiered |
| `boss:<entity id>` | named, miniboss, unlisted or mob, for each boss-like entity (a boss bar of its own, or a bosses tag) |
| `loot:chests` | what each structure's chests roll |
| `loot:modifiers`, `loot:vanilla` | whether each loot modifier stays; whether each vanilla table it replaces stays replaced |
| `duplicates` | which copy of an item or ore several mods ship is canonical |
| `armor-class`, `weapon-class`, `apotheosis` | weight class, weapon class, affix category |
| `keys`, `game-rules`, `config` | default keys, rule values, which config values the pack sets and where the file is tracked |
| `worldgen`, `shared-data` | structure spacing, ores; replace:true tags, vanilla overrides, per-tick functions, dead data |
| `codex` | Codex page, quest, or none |

Three rules:

- **The boss roster and the dimension tiers have one home, the registries** (`kubejs/config/icraft/registry`,
  `dev/rosters/README.md`). A record never holds a copy. A `boss:` or `dimension:` decision is decided when the
  registry has the entry; a tier or a kind written into a record is an answer waiting for `intake.py apply`, which
  writes the entry and runs the registry validator. Nobody edits five scripts.
- **A grandfathered decision counts as answered only when the pack holds an answer for exactly that subject that a
  tool can read**: the metafile's side, a registry entry, `stageMod` naming the mod, every armor piece in a weight
  tag, a key mapping in the keybind baseline, the game-rule defaults file, a tracked config in every distro the jar
  installs to, a quest or Codex file naming the mod, the loot audit naming a rule for every chest table. Anything
  else is OWED. (The rule is in the header of `intake_derive.py`; changing it is one function per surface.)
- **Evidence is ranked**: a boot diff (what the game registered), the registry snapshot `dev/registry` (by
  namespace), the static inventory (what the jar ships: a language key is not a registration).

### Add a mod

Have the jar on this PC. If the launcher downloaded it, its metafile is in the instance's `mods\.index`: pass it
with `--metafile`. Otherwise say where the jar comes from; the tool writes the metafile and hashes the jar itself.

```
python -I .minecraft/dev/mods/intake.py add <jar> --side both --modrinth <project id>:<version id>
python -I .minecraft/dev/mods/intake.py add <jar> --side both --curseforge <project id>:<file id>
python -I .minecraft/dev/mods/intake.py add <jar> --side client --metafile <instance>\mods\.index\<name>.pw.toml
```

What it does, in this order, in this checkout, committing nothing:

1. Refuses a jar whose mod id the pack already has (that is `update`), whose name a deny or skip pattern would
   delete on consumers, or whose mandatory dependency no jar of the pack provides. Provided = a jar in the instance
   (`--mods`), or a mod the tree's index names whose jar is in a jar cache (`--mods`, `.minecraft/mods`,
   `ICRAFT_BOOT_JAR_CACHE`, the new jar's own folder): a library added a minute earlier counts.
2. Writes `.minecraft/mods/.index/<name>.pw.toml` with the side you gave, runs `mod_index.py generate` and `check`.
3. `boot.ps1 -ModSet`: the server's mod set of this tree, every jar verified against its metafile.
4. Boots the full pack with the mod in and diffs it against `--base` (default `origin/main`; a saved result is
   reused): about 6 minutes, twice that when the base has to be booted first. One boot at a time on this PC.
5. Writes the record from the jar's inventory and from what the boot registered, and prints it.

Exit code 0: booted, no regression. 1: the boot or its diff found something (the record's `boot` decision is then
owed and says what). 2 / 3: it could not run, or the server did not boot. A client-only mod gets no server boot:
its record says so, and a client launch is your check.

Then:

1. **Answer every decision.** `intake.py decide <mod> <key> <answer> [field=value ...] [--note "..."]`, for example
   `decide some-mod boss:somemod:warlord named tier=2 hp=400 rush=2`,
   `decide some-mod dimension:somemod:depths 3 flags=loot,classPassives stageGate=modpack/dim_depths exploration=depths deathPenalty=0.18`,
   `decide some-mod boss:somemod:big_golem mob`, `decide some-mod loot:chests keep --note "tier 1 ruins"`.
   `decide <mod> --defaults --note "..."` answers "default" to everything still owed except side, boot, bosses and
   dimensions. An answer that is none of the listed options needs `--note` to say what it means.
2. **Commit** the metafile, the generated indexes and the record.
3. **Refresh the registry snapshot** from that commit and commit `dev/registry`:
   `powershell -File .minecraft\dev\boot\boot.ps1 -Ref HEAD -WriteSnapshot`. The snapshot gate refuses a push whose
   mod set it does not describe, and the registry validator must know the new ids before step 4.
4. **Apply** the boss and dimension answers: `intake.py apply <mod>`, then
   `powershell -File .minecraft\dev\sync-distros.ps1 -Fix` and commit. `apply` keeps nothing when the validator
   refuses the entry and prints the rule; the entry then needs the field the rule asks for, or its reason in
   `dev/rosters/accepted.json`.
5. **Do what no registry does**, as far as the record's answers ask for it: the difficulty mod's exclude list and
   Apotheosis's three dimension lists (`dev/rosters/README.md`, "The lists that are still copies"), boss drops,
   loot rules, armor weight tags, the game-rule defaults file, a tracked config in each distro, quests, Codex.
6. `intake.py check`, `boot.ps1 -Compare origin/main` if step 4 or 5 changed anything a boot reads, and push.

To back out before the commit: `intake.py remove <mod> --apply --no-deny`.

### Update a mod

```
python -I .minecraft/dev/mods/intake.py update <mod> <new jar> --version <Modrinth version id>
python -I .minecraft/dev/mods/intake.py update <mod> <new jar> --file-id <CurseForge file id>
```

It checks the new jar's mandatory dependencies as `add` does (the old jar provides nothing) and refuses before
anything is written when one is missing (`--force` goes on; `--diff-only` reports it). It compares what the two jars
ship (the old jar is taken from the instance), moves the metafile to the new jar,
regenerates the indexes, boots the tree and diffs it against `--base`, and reports: every id that vanished from a
registry, loot tables and recipes that are gone or newly rejected, loot tables whose content changed, and every
place in the pack that still names one of them (scripts, kubejs data, the registries, quests, configs of the three
trees, datapack zips, dev tool lists, wiki). The record is rewritten for the new jar; answers already given are
kept; a question the new version raises is asked `by update` and the gate holds the push until it is answered.

`--diff-only` compares and sweeps and writes nothing; give it `--old-jar` and, to include a boot diff,
`--boot-result <a saved boot result of the new side that holds a diff against the old>`.

**One of the pack's own jars** (`custom_jars_manifest.json`) is rebuilt and released by the custom-jar-release
procedure, and this command never moves its metafile, its three jar copies or its manifest line. A rebuild under
the same file name needs nothing here. A release under a NEW file name does: the gate then says
`NO RECORD OF THIS JAR`, and `intake.py update <mod> <the released jar>`, run after the release, finds the
metafile already on the new jar and rewrites only the record (with its boot diff, like any update). The same
holds when the launcher moved a third-party mod's metafile itself.

With a boot, the references are swept for the ids the GAME stopped registering (the boot diff). An id that only left
the jar's files (a recipe file named like an item, a language key) is checked against the new boot's registries: still
registered as anything is not vanished; registered nowhere is listed apart, with its references, and not counted.
Without a boot (`--no-boot`) only the files that left the jar are known, not what the game stops registering: then
every id that left the jar is swept.

### Remove a mod

```
python -I .minecraft/dev/mods/intake.py remove <mod>            # the report; changes nothing
python -I .minecraft/dev/mods/intake.py remove <mod> --apply --why "<reason>"
```

The report: which jars cannot load without it; every reference to its ids and to its mod id, by area; the registry
entries that go with it and what that does to the boss-rush rosters; its tracked config files; the deny pattern
and where it goes; how the jar leaves each consumer and what stays behind. `--apply` deletes the metafile and the
record, regenerates the indexes, and writes the deny pattern into `$denyList` of `cleanup_stale_jars.ps1` and
`DENY_LIST_PATTERNS` of the launcher (which enforces it on the server from its next build; until then the index
alone removes the jar). **It never edits a reference**: the list is the work that is left. Then
`sync-distros.ps1 -Fix`, `boot.ps1 -Compare origin/main`, and the snapshot refresh as for `add`.

### Audit, and the backlog

```
python -I .minecraft/dev/mods/intake.py audit [--top 0] [--out-dir <a folder outside this repo>]
python -I .minecraft/dev/mods/intake.py audit --refresh [<mod> ...] [--findings <pack_audit findings.json>]
```

`audit` prints the gate's verdict and the backlog of the grandfathered mods in priority order: mods that add a
dimension first, then boss-like entities, then structures, then loot modifiers and vanilla loot overrides, then
other content; inside a class the heaviest first (an owed dimension counts 100, a boss 30, a loot question 8 to
10, anything else 1). `--refresh` derives the evidence again (after a registry ruling, a new snapshot, a scanner
change) and keeps every answer.

### The gate

`python -I .minecraft/dev/mods/intake.py check`, in the pre-push hook (its own block) and in the workflow
`mod-intake.yml`. It fails on a mod of the index with no record, a record made from another jar than the index
names, a NEW mod with a decision owed or decided and not applied, a record no mod belongs to, a record whose side
is not the index's. It never fails on the grandfathered backlog. One of the pack's own jars
(`custom_jars_manifest.json`) is held to its file name only: a rebuild under the same name needs no new record.

### Why one file for the grandfathered records

A push of 300 or more changed files turns the server's next sync into a full download of the repository. 458
record files would do that once for everybody; one file does not. New mods get a file each, because a new mod's
record is what a reviewer reads in the commit.

### What it does not do

- **No client.** Key mappings, screens, inventory buttons and anything a client-only mod does are not seen by any
  boot here. The record asks; the answer comes from a look in game.
- **`boss-like` is evidence, not a list of every strong mob**: a boss bar in the entity's own class, a bosses tag,
  or a registry entry. Entities that only inherit a bar from a shared base class are a note in the record.
- **A game rule has no namespace**: for a grandfathered mod the record cannot say which registered rule is whose.
  A new mod's rules come from its boot diff.
- **A boot that passes is one clean boot of a fresh world on Linux** (`dev/boot/README.md`, "The rig against the
  live server"): no player, no old world, no second boot.
- **`remove` does not delete config files on consumers and does not touch the world.**
