---
name: mod-intake
description: >-
  Add, update, remove or audit a mod of the IridescentCraft pack the one
  supported way: `.minecraft/dev/mods/intake.py` (metafile into the source
  index, generated indexes, static inventory, a full-pack offline boot diff,
  and an INTAKE RECORD that lists every integration surface with its default
  and the decision it needs), then the decisions applied through the boss and
  dimension registries, the registry snapshot refreshed, and the gate. USE
  THIS SKILL whenever the user wants to add a mod, try a mod, bump or update a
  mod's version, drop / remove / retire a mod, asks "what does this mod touch",
  "what do we still owe on mod X", "which mods need review", or when the
  pre-push hook or CI prints `[mod-intake] FAIL` (NO RECORD, OWED, NOT
  APPLIED, RECORD WITHOUT A MOD) - even if they only say "add Friends and
  Foes" or "take Champions out". Copying a metafile by hand skips the boot,
  the record and every decision, and the gate then refuses the push. NOT for
  the pack's own jars (iridescent_*, managed forks): those are
  custom-jar-release.
---

# mod-intake

One tool, one record per mod, one gate. The page a person reads is
`.minecraft/dev/mods/README.md`, section "Mod intake"; this skill is the same procedure with the
judgment calls spelled out.

**Which mods the pack carries, and every answer to a record's decision, is the operator's.** You run
the tool, read the record, propose answers with a recommendation, and record what the operator rules.
Never answer a `boss:`, `dimension:`, `side` or `boot` decision on your own authority.

## Before anything

- The jar must be on this PC. Downloading one needs the operator's yes for that file (name, source,
  size); a jar the launcher already put into the instance needs none.
- One full-pack boot at a time on this PC (`dev/boot/README.md`, the lock). A boot is about 6 minutes. It also
  reads the feature order of every dimension and generates a chunk in each: a cycle or a chunk that fails is a
  finding (exit 1), and `add` / `update` then leave the record's `boot` decision owed.
- Everything on `main` is deployed by the server's next policy Cycle with nobody watching. A mod change
  is never pushed with a `boot` decision owed.
- Do not edit `server_distribution/mods/.index`, `distribution/client/mods/.index` or a generated block:
  `mod_index.py generate` writes them (the tool calls it).

## add

```
python -I .minecraft/dev/mods/intake.py add <jar> --side both --modrinth <project id>:<version id>
python -I .minecraft/dev/mods/intake.py add <jar> --side both --curseforge <project id>:<file id>
python -I .minecraft/dev/mods/intake.py add <jar> --side client --metafile <instance>\mods\.index\<name>.pw.toml
```

1. Run it. It refuses a mod id the pack already has (that is `update`), a jar name a deny or skip
   pattern would delete, and a missing mandatory dependency (add the dependency first, its own record).
2. Read the record it prints (`intake.py show <mod>` prints it again). For each decision give the
   operator: what the mod does by default (the `default` line), the options, and your recommendation
   with its reason from the `ships` and `pack` lines. Typical readings:
   - `boot` owed with REGRESSION lines: fix the cause or drop the mod. `decide <mod> boot accepted
     --note "..."` exists for a finding the operator accepts; it is rare.
   - `side`: a jar that leans client-only and was added as `both` boots anyway when its client code is
     guarded; the boot proves the server, never the client.
   - `boss:<id>`: named = trophy boss (designed health, x3, kill tokens, usually a rush roster and an
     arena); miniboss = a boss without the x3; mob = leave it to the mob scaling. A rush roster's size
     is the denominator of a ruled percentage: adding to it is a ruling.
   - `dimension:<id>`: tier 2 to 4 needs a stage gate, the loot flag, class passives, an exploration
     key, a death penalty and a mob-equipment roll, or a reason in `dev/rosters/accepted.json`.
     Orbits and pocket dimensions are usually `untiered`.
   - `loot:chests`: by default its chests roll the mod's own tables plus the pools of the dimension.
     A structure in the Overworld that rolls `end_city_treasure` hands out tier-4 loot (it happened).
3. Record the rulings: `intake.py decide <mod> <key> <answer> [field=value ...] [--note "..."]`;
   `decide <mod> --defaults --note "..."` only for what the operator said to leave at its default.
4. Commit the metafile, the generated indexes and the record. Then refresh the snapshot from that
   commit and commit it:
   `powershell -ExecutionPolicy Bypass -File .minecraft\dev\boot\boot.ps1 -Ref HEAD -WriteSnapshot`.
5. `intake.py apply <mod>`; `powershell -ExecutionPolicy Bypass -File .minecraft\dev\sync-distros.ps1 -Fix`;
   commit. When the validator refuses an entry, `apply` keeps nothing and prints the rule: answer again
   with the field it asks for, or write the reason into `dev/rosters/accepted.json`.
   (`-ExecutionPolicy Bypass`: from Git Bash a bare `powershell -File` is refused, scripts are disabled
   on this PC; the PowerShell tool already runs with Bypass.)
6. What no registry does, as far as the answers ask for it: the difficulty mod's exclude list and
   Apotheosis's three dimension lists, boss drops, loot rules, armor weight tags, the game-rule
   defaults file, a tracked config per distro, quests, Codex pages, the wiki.
7. `intake.py check`; `boot.ps1 -Compare origin/main` when step 5 or 6 changed anything a boot reads;
   push. Tell the operator what to look at in game (key mappings, screens, the structures, the bosses:
   paste-ready `/locate structure` and `/summon` lines with the ids from the record).

Back out before the commit: `intake.py remove <mod> --apply --no-deny`.

## update

```
python -I .minecraft/dev/mods/intake.py update <mod> <new jar> --version <Modrinth version id>
python -I .minecraft/dev/mods/intake.py update <mod> <new jar> --file-id <CurseForge file id>
```

Read the report top to bottom: REGRESSION lines, ids VANISHED from a registry, recipes and loot tables
gone or newly rejected, loot tables whose content changed, then every place in the pack that still
names one. Every reference is work: a script that names a vanished item fails quietly, a registry
entry that names a vanished entity fails the validator once the snapshot is refreshed. A question the
new version raises is asked `by update`; the gate holds the push until it is answered. Then steps 4
to 7 of `add`.

If the launcher already moved the metafile to the new jar (its own "update"), run the same command with
that jar: it takes the metafile as it is and rewrites the record.

One of the pack's own jars (`custom_jars_manifest.json`): this tool never moves its metafile, its jar
copies or its manifest line; the release is the custom-jar-release skill. A rebuild under the same file
name needs nothing here. A release under a NEW file name makes the gate say `NO RECORD OF THIS JAR`:
after the release, `intake.py update <mod> <the released jar>` rewrites the record (with its boot diff).
To compare two builds without writing anything: `update <mod> <new jar> --old-jar <old jar> --diff-only`.

## remove

```
python -I .minecraft/dev/mods/intake.py remove <mod>
python -I .minecraft/dev/mods/intake.py remove <mod> --apply --why "<reason>"
```

Show the operator the dry run first: what breaks without it, how many references in which areas, which
registry entries and rush rosters, the deny pattern. After `--apply`, the references are yours to
clear, file by file, in the same change; the tool never edits one. Registry entries: edit the registry,
`python .minecraft/dev/rosters/validate.py --notes`. A both-sides removal reaches a client only when it
syncs: a client that still has the jar cannot join (`Registry Object not present`). The launcher's
deny list takes a new pattern only with a launcher build; until then the index removes the jar.
Config files stay on consumers. Then `sync-distros.ps1 -Fix`, `boot.ps1 -Compare origin/main`, the
snapshot refresh, `intake.py check`, push.

## audit and the backlog

`python -I .minecraft/dev/mods/intake.py audit` prints the gate's verdict and the grandfathered backlog
by priority (dimensions, bosses, structures, loot, other). Work it from the top, one mod at a time:
`show`, propose, `decide`, `apply`. `audit --refresh` after a registry ruling or a new snapshot.
`--out-dir` writes the full report: keep it out of the pack repo (it goes to the internal repo).

## When the gate fails

| Line | Meaning | Do |
|---|---|---|
| `NO RECORD <mod>` | a metafile was added by hand | `intake.py add` (remove the hand-made metafile first) |
| `NO RECORD OF THIS JAR <mod>` | the metafile names another jar than the record was made from (the launcher's update, a hand edit, a custom-jar release under a new name) | `intake.py update <mod> <that jar>`: it takes the metafile as it is and rewrites the record |
| `OWED <mod> ...` | a new mod, or an update, has open questions | ask the operator, `intake.py decide` |
| `NOT APPLIED <mod> ...` | a boss or dimension answer is not in the registry | `intake.py apply <mod>` |
| `SIDE <mod>` | the index and the record disagree on the side | `intake.py decide <mod> side <side>` (it edits the metafile and regenerates) |
| `RECORD WITHOUT A MOD` | a metafile was deleted by hand | `intake.py remove` does both; or restore the metafile |

Never `--no-verify`, and never add a mod to `intake_baseline.json`: the baseline is the pack as it was
at the first audit.

## What the tool cannot tell you

No client boot: key mappings, screens, inventory buttons. One clean boot of a fresh world on Linux: no
player, no old world, no second boot. `boss-like` is evidence (a boss bar of its own, a bosses tag, a
registry entry), not every strong mob. Say what was not verified when you hand over.
