# Engine tests

The pack's KubeJS scripts, run on the **production script engine** (the `rhino-forge` jar the game
loads) before they reach `main`. Dev tool: nothing here ships to a client or the server.

## Before and after a refactor (the two commands)

```bash
python .minecraft/dev/engine-tests/run.py snapshot record   # on the tree you start from
python .minecraft/dev/engine-tests/run.py snapshot check    # on the tree you ended with
```

`record` writes what each suite observably does to `golden/` (git-ignored); `check` runs the suites
again and prints a diff for anything that changed, exit code 1. Add suite names to do only some
(`snapshot record loot spawn-buff`). What is recorded:

| Suite | Recorded |
|---|---|
| `loot` | every handler, modifier (targets, conditions, actions, in registration order), filter and recorded recipe call of the loot harness, plus the console lines. Line numbers are left out, so moving code keeps it equal. |
| `spawn-buff` | per scenario: max health, health, damage, speed, the modifier names on each attribute (`*` = not saved), the persistent flags; every check; every console line. |
| `ascension`, `ascension-open`, `onboarding-bridge`, `inventory-scan` | every check, every console line, and the final mock world: per entity its health, attribute modifiers, effects, gear, inventory, saved data and the messages it was sent; commands the server ran. |

A snapshot proves "the same as before" only for what the suites exercise. It is not committed: a
snapshot is for one refactor, not a standing test.

## Running

```bash
python .minecraft/dev/engine-tests/run.py                 # every suite (about a minute; the loot audit is most of it)
python .minecraft/dev/engine-tests/run.py fast            # what the pre-push hook runs (about 10 s)
python .minecraft/dev/engine-tests/run.py suite ascension # one suite, full output
python .minecraft/dev/engine-tests/run.py list
python .minecraft/dev/engine-tests/run.py --pack <another checkout>\.minecraft fast   # test other scripts
```

One line per suite; exit code 1 if a suite fails, 2 if the runner could not run. `PEND` marks a
suite whose `pending` line in `suites.json` says which fix it is waiting for: it is reported on
every run and not counted.

| Suite | What it proves |
|---|---|
| `truth-fresh` | the engine tables in `truth/` were recorded from the KubeJS, Rhino and Architectury jars the pack index names today |
| `known-false` | every name on `truth/known-false.json` (`inv.size`, `level.gameTime`, `source.entity`, ...) is still absent on the engine and its replacement still exists |
| `mock-honesty` | no mock offers a member, a kind of member or an arity the real class lacks (see below) |
| `dialect` | what this Rhino build does with `const` / `let` / `var`, closures, unsupported syntax, strings from Java |
| `mock-facts` | the mocks answer the engine facts exactly as the real engine answered them |
| `inventory-scan` | `economy/relic_sink.js`: the scan visits the main inventory, the deny list denies, the cap is read back |
| `ascension`, `ascension-open` | `endgame/ascension.js` + `scaling/zz_ascension_scaling.js` |
| `onboarding-bridge` | `quests/onboarding_bridge.js` |
| `spawn-buff` | the five `scaling/` scripts and `core.spawnBuff`, against the same scripts as of `ffe5cef3` (`fixtures/`) |
| `parse` | every script compiles on the real parser (`dev/rhino_parse/ParseAll.java`) |
| `loot` | `dev/audit_loot.py` (the loot harness; needs the whole instance, reads the server's last boot log) |

## How the runner finds its jars

- **Mod jars** (Rhino; for the real-engine boot also KubeJS and Architectury): in the instance `mods`
  folder: `--mods`, or `$ICRAFT_INSTANCE_MODS`, default the PrismLauncher instance. The file name
  and hash come from the packwiz metafile in `.minecraft/mods/.index/`; a jar with another hash is
  refused (exit 2).
- **gson and commons-lang3** (Rhino cannot start without them): the launcher's `libraries` folder
  (`--libs` / `$ICRAFT_LIBRARIES`, default next to the instance), by pinned sha256.
- `--fetch-dir DIR`: a jar that is not on this machine is downloaded there (Rhino from the URL in
  its metafile, the two libraries from Maven Central) and verified the same way. The hook and CI use it.
- **JDK**: `--jdk`, `$ICRAFT_JDK`, `$JAVA_HOME`, the usual install folders, then `PATH`; 17 or
  newer, compiled with `--release 17`. Build products go to `.out/` (git-ignored).

## Adding a test for a script

1. Write `suites/<name>.js`. It runs after the prelude, in the same scope as the scripts, so it can
   call their top-level functions and fire their handlers:
   `var p = T_newPlayer('Tester')`, `T_mob('minecraft:zombie')`, `T_fire('E.death', { entity: m, source: s })`,
   `T_tick(100)`, `chat(p, '!ascension')`; assert with `ok(condition, 'what')` inside
   `T_run('group', function () { ... })`. `mk.T` / `mk.A` read and write mock state (`T.slot(p, 3, stack)`,
   `A.told(p)`). Use placeholder player names: this repository is public.
2. Add an entry to `suites.json`: the prelude files, then `{"load": ["server:0_lib_core.js", "server:<your script>"]}`
   (every script yours needs, in the order the game loads them), your test, `lib/summary.js`. Set
   `expect` to the number of checks once it passes: a check that silently stops running then fails the suite.
3. If the script calls a member the mocks lack, add it to the mock (`harness/mk/W.java`) **under the
   name the engine has**. `run.py suite mock-honesty` refuses anything else. A member that only tests
   use is named `t_...` or listed under `harness` in `harness/mock-map.json` with its reason.
4. A script that moved or was renamed makes the suite fail with the path it wanted: fix the load
   list, not the script. When `main` changes a file a suite loads, re-run the suite (a suite went
   from 73/0 to 65/8 that way on 2026-10-12).

## Mock honesty

A mock that offers something the engine lacks makes dead code look alive (the `inv.size` loops were
"verified" on a mock inventory that had `size`). Three checks hold the mocks to the engine:

- **`mock-honesty`** (`harness/MemberCheck.java`): for every mock class, the production Rhino build is
  asked what a script sees on it, and each member is compared with the real class named in
  `harness/mock-map.json`: the **name** must exist, the **kind** must match (method, property, or a
  field and a method under one name), and each **overload** must have a real one with the same number
  of arguments. A mock class missing from the map fails. The checker tests itself on `harness/mk/Bad.java`
  (nine planted defects that must all be reported).
- **Script-side mocks** (`lib/honest.js`): the event names a prelude offers, the keys of the event
  objects it hands to handlers, and its JS bindings are checked the same way while a suite runs.
- **`mock-facts`**: about a hundred expressions (`real-engine/0_engine_facts.js`) are evaluated on the
  mocks, and where a mock answers at all it must give the answer the real engine gave.

`event.cancel()` in a suite throws `dev.latvian.mods.kubejs.event.EventExit` out of a Java method, as in
game (`harness/dev/.../EventExit.java` stands in for the class under its own name; the real one needs
Minecraft to load). A script `catch`, or a guard that must let the exit through, therefore receives what
it receives on the engine: `e.name === 'JavaException'`, `e.javaException` an `EventExit` (recorded on the
real engine in `truth/engine-facts.txt`).

The real side is **`truth/engine-members.json`**: member tables of about 130 classes (player, inventory,
item stack, entity, living entity, damage source, level, server, the 74 KubeJS events, ...) read on a
real Forge server through the engine's own `JavaMembers` and name remapper, with the mixins applied.
For seven of them the probe also proved the table equal to what a script enumerates on a live
instance. A mod's own class that the bare server does not load (the damage registry, Ars, Apotheosis,
the aptitude capability) is read from its jar with `javap` instead.

**Not covered:** argument types and return types; what a member *does* (only `mock-facts` and the
suites themselves touch behaviour); anonymous objects a mock returns; members that another mod adds
to a vanilla class in the full pack (the tables are from a server with KubeJS, Rhino and Architectury
only, so a mock is held to the smaller set); client-only classes.

## The real engine (`run.py real-engine`)

```bash
python .minecraft/dev/engine-tests/run.py real-engine          # boot, compare with truth/
python .minecraft/dev/engine-tests/run.py real-engine record   # boot, rewrite truth/ (then review git diff)
```

One offline boot (about 30 s) of a real Forge 1.20.1 dedicated server with the pack's own KubeJS,
Rhino and Architectury jars and the probe scripts of `real-engine/`: it builds real players, stacks
and entities, answers the engine facts, and prints the member tables. On the dev PC it runs in WSL
and needs a Forge server install (`--forge-server`, default `~/icraft-backstop/server`; made with
`java -jar forge-1.20.1-<v>-installer.jar --installServer`). Loopback only; it never touches the live
server. Run `record` when `truth-fresh` says an engine jar changed, or after adding a class to
`truth/classes.txt` or a fact to `0_engine_facts.js`. The probe reads its inputs inside
`ServerEvents.loaded`, so it does not depend on script load order (which on ext4 is not alphabetical).

## Where it runs

- **Pre-push hook** (`dev/install-hooks.ps1`, step 3b): `run.py fast` plus the method-ref validator,
  when a pushed commit touches a kubejs script, this folder, `dev/rhino_parse/` or the pinned engine
  metafiles. The installed hook is a copy: re-run `install-hooks.ps1 -Install` after the template changes.
- **GitHub Action** `kubejs-script-checks.yml`: the three script lints and `run.py ci` (every suite
  but `loot`), with the Rhino jar fetched from its metafile URL.
