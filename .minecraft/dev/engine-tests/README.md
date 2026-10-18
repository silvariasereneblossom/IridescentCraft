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
| `hit-table` | every check of both scopes (the walk of the registry, the options, the order line, each row against its golden line), every console line, and the final mock world. The rows themselves are a COMMITTED golden file, so this snapshot adds the console lines and the world. |
| `ascension`, `ascension-open`, `onboarding-bridge`, `inventory-scan`, `codex-submit`, `boss-rush` | every check, every console line, and the final mock world: per entity its health, attribute modifiers, effects, gear, inventory, saved data and the messages it was sent; commands the server ran. |

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
| `registry-data` | `dev/rosters/validate.py`: every id of the boss and dimension registries (`kubejs/config/icraft/registry/*.json`) is something the game registers (`dev/registry`), the files are consistent, and nothing deviates from the expectations without a reason in `dev/rosters/accepted.json` |
| `registry` | `kubejs/server_scripts/0_lib_registry.js` (`icraft.bosses`, `icraft.dims`) answers every id and every system exactly as `dev/rosters/rosters.py` does (`run.py` generates the expectation from it: `{"gen": "registry-expect"}`); a Java string id works; what it hands out is a copy; a misspelt system throws; a registry that cannot be read is an error on every call, never an empty roster; `core.isBoss` asks it |
| `core-helpers` | the engine-safe helpers of `global.icraft.core` (`0_lib_core.js`): `idSet` answers a Java string, a JS string and a ResourceLocation alike; `eachMainSlot` walks slots 0 to 35 of an inventory that has no `size`; `playerTier` is the highest tier stage held (the `AStages` binding, held to its jar); `blockIfLoaded` never reads a block of an unloaded chunk; `warnOnce`, `now` |
| `inventory-scan` | `economy/relic_sink.js`: the scan visits the main inventory, the deny list denies, the cap is read back |
| `codex-submit` | `gates/codex_progression_engine.js`, what `/icraft codex submit [lane]`, `balance` and `exchange` take and leave: the sweep is the main inventory (slots 0 to 35; worn armour and the off hand are neither counted nor taken), whole conversion units only, from the lowest slot up, the remainder stays; a resource stops at its lifetime cap (counted in items, per tier for the bulk metals); the bulk metals mint the tier the player is working towards and nothing at tier 4; a held threshold of tokens is spent exactly, once, for the next tier, and only with the stage below held (the strict ladder, ruling 8: 1,000 tier-2 tokens buy nothing without `tier_2`); the exchange pays experience at tier 4 only. It calls the script's own functions (the Brigadier tree is not built). Two limits of the mocks, said where they matter: `player.give()` records the stack and does not put it into the inventory, and a stack has no display name. Written before the engine's slot loops were touched, so its snapshot is the "before" |
| `boss-rush` | `gates/codex_boss_rush.js` through its two handlers: a player kill (`EntityEvents.death`) and `/icraft codex bosses`, run through the Brigadier tree the script registers (a small stand-in of `Commands.literal`). A roster boss counts once, a phase entity (`phaseOf`) for its boss, a kill by no player or of a mob on no roster counts nothing; tier 1's threshold (9 of 11) grants `tier_2`; tier 2's (18 of 20) and tier 3's (43 of 43) grant nothing without `tier_2` / `tier_3` held (the strict ladder of the Codex, ruling 8, carried to the rush: decision entry 91), the kills are kept and the player is told to unlock the stage first; the kill that buys the stage below climbs on (tier 2 and tier 3 on one kill); a stage below from another route is honoured at the next `/icraft codex bosses`. Rosters read from the boss registry. Against the script before 2026-10-15, 10 of its 31 checks fail (the strict-ladder rows) |
| `ascension`, `ascension-open` | `endgame/ascension.js` + `scaling/zz_ascension_scaling.js` |
| `onboarding-bridge` | `quests/onboarding_bridge.js`: the Level Up dummy at any aptitude 2+, the dependency wait, an unreadable capability; and a dummy that never lands is warned about ONCE, through `core.warnOnce` (the script's own copy of that helper is gone, as in fourteen other scripts) |
| `spawn-buff` | the five `scaling/` scripts and `core.spawnBuff`, against the same scripts as of `ffe5cef3` (`fixtures/`) ; since 2026-10-15 per-kill scaling no longer acts at spawn (S7: a boss joins as under the old scripts) |
| `per-kill` | `scaling/boss_progressive.js`, per-kill boss scaling PER PLAYER (ruling 23): the flag `perKill` under its switch (not the Wither, the Dragon, a zombie); fight n = the row "kill n" of the old table, as `multiply_total` on health, attack damage and speed (a share of the boss as the pack builds it: a Harbinger stand-in of 2,925 is 4,387.5 at fight 5); the three Cardinal Sins first phases carry the flag like Lucifer's and count their own kills (decision entry 92); the first hit a boss trades with a player fixes it at the highest count among the players within 64 blocks, keeps its share of health and tells those players one line; later hits and later players change nothing; a death adds a kill to every player within 64 blocks (not a spectator), per boss id; fixed at base stays at base; a save and load changes nothing, and a modifier that could not be saved comes back with the SAME count; `/icraft bosskills`; the switch off. On the spawn harness (its players are entities with `player` set, in the boss's level); the hurt event goes through `core.hurtHandlers()`. Planted defects caught: `multiply_base`, the old one-fight-late lookup, a radius of 80 |
| `event-guard` | `kubejs/*_scripts/00_icraft_guard.js` on KubeJS's REAL handler chain (`guard/GuardChain.java`: `EventJS`, `EventExit` and `EventHandlerContainer.handle` from the KubeJS jar, so it needs that jar and Architectury next to Rhino and is not a `ci` suite). A guarded `cancel()` / `success(value)` / `exit()` reaches KubeJS intact; a throw is one `[icraft.guard] FAILED` line and the chain goes on; an engine-level throw is isolated with a line and never masks an exit; a `java.lang.Error` is not isolated; the guard switched off (no `java.util.Optional`, or its own switch) behaves like no guard; the three copies of the file are one file. Liveness: a registration is ARMED when `guard()` is called and FIRED once, the first time its handler finishes; a cancel counts as fired; a throw is FAILED and not fired; the summary line, `NOT ARMED` / `UNLISTED` against an expected list, and the digest `dev/loud/gen_liveness.js` computes. `guard/real_engine_probe.js` is the same on a real server (run by hand, its header says how) |
| `lib-need` | eleven scripts that ask for the core library (`icraft.lib.need('core', ..)`; the eleven of 2026-10-13, seven more ask since the hurt handlers moved and are not on this suite's load list), loaded WITHOUT it: each loads without an error of its own, the missing library is ONE `[icraft.lib] MISSING core: <first script>` error line, the other asks are counted (`icraft.lib.missing()`: eleven in all, one per script; `death_penalty.js` asked for two of its blocks until its armour clamp was removed, 2026-10-14), no script prints a "did not load" line itself, and the eight whose whole file is behind the question register nothing. Run against the scripts from before 2026-10-13 it fails: eight error lines, two warnings and one script that throws at load |
| `liveness` | ARMED and FIRED outside the guard (`icraft.live`): a tick function of `0_tick_master.js` and a hurt handler of `0_lib_core.js` are armed when registered and fired the first time they return (not when they throw, not behind a closed gate); a curated feature (`icraft.live.fired`, here the relic sink and its deny list) fires where it did its work; `zzz_icraft_live.js` prints the one summary line, compares with `kubejs/config/icraft/live/expected.json`, collects the FIRED lines of a second into one, and never prints a player name. The guard's own half is in `event-guard` |
| `liveness-manifest` | `node --expose-internals dev/loud/gen_liveness.js --check`: `dev/loud/liveness_manifest.json` and `kubejs/config/icraft/live/expected.json` (x3) are exactly what the scripts register (`icraft.guard`, `registerServerTick` / `registerPlayerTick`, `core.onHurt`), name (`icraft.section`) and report (`icraft.live.fired`) today. Add, rename or remove one and this fails until you regenerate (the same command without `--check`) and commit the files. Needs `node` on `PATH`, like the script lints |
| `hit-table` | the handlers that sit, or sat, straight on the Java damage registry (`DamageModifierRegistry`), and the dispatcher of `0_lib_core.js` they move onto. **First scope, the library alone:** the registry walks its keys in HASH order (the mock is a `ConcurrentHashMap`, like the jar, and is held to the order a full-pack server printed from the registry's own maps on 2026-10-13); a twelfth key reorders the other eleven; the entry `icraft.core.then` is walked last in a table of 16 and of 32; the options of `core.onHurt` (`place`, `secondary`, `cancelled`, `unchecked`) do what they say, and a registration that cannot be honoured is refused with an ERROR line. **Second scope, the pack's own scripts** (the nine scripts with such a handler, the startup script `deathskin_undead_bonus.js`, stand-ins for the keys of the two Vorpal handlers): the order every handler runs in is ONE line that never changes, wherever each handler is registered today; and the hit table: per handler the attacker's class, origin or weapon, a primary and a secondary hit, a hit an earlier handler cancelled, what each handler did to the amount in the order they ran, and what the hit left (health, mana, effects, stamps, armour durability). The rows are `suites/hit_table.golden.js`, recorded before any handler moved and changed since only on a ruling, each named in its header (`lib/hit/record.py`; `--check --pack <older checkout>/.minecraft` compares another tree's scripts with it). Script-side stand-ins, named in `lib/hit/before_scripts.js`: ISS `MagicData`, `MobEffects`, `Projectile`; the class and the aptitudes of a test player are answered by the suite. The same rows on a full-pack server are the probe of the internal repo (`dev/hit-table-d-2026-10-13/`) |
| `magic-bonuses` | each magic bonus counts once on an Iron's spell (decision list entry 120, 2026-10-17). `origins/class_passives.js`: the Archmage's Mana Attunement (+5 % a tier from tier 2) is on `irons_spellbooks:spell_power` only, never on `puffish_attributes:magic_damage`; `skills/justleveling_skills.js`: Mana Spark, Mana Blaze and Mana Inferno on spell power only (+20 max mana and Conservation's mana regen unchanged); `skills/skill_effects.js` no longer copies the Archmage / Battlemage / Faefolk / Elf bonuses onto spell power; the class spell power (1.25 for the Archmage, `class_attribute_bonuses.js` through `attribute_sync.js`) multiplies a magic hit once. Two engine steps no script holds are PORTS held to a full-pack server (internal `dev/archmage-2026-10-17/`): Iron's spell power (firebolt level 1 = 18 x the caster's spell power) and Pufferfish's magic damage (applied at the head of `hurt` to every hit of `minecraft:magic`, `indirect_magic`, `#c:is_magic` or `#neoforge:is_magic`, which is all nine Iron's schools; never Ars Nouveau or melee); the suite first checks the ports reproduce the measured rows. Then the Archmage's firebolt at tiers 1 to 4 against a classless caster (16.2): 30.375 / 31.894 / 33.413 / 34.931. Against the scripts before the fix 22 of its 77 checks fail, and the mock gives 45.56 / 48.65 / 51.84 / 55.13, the numbers the full-pack probe measured on them. Since ruling 129 (the same day): the three mage classes' max mana is their Origins pool power alone (250 / 190 / 190 from 100, with `attributes/mana_pool_bonuses.js` loaded; before, 375 / 285 / 285: the 4 checks fail on the older script). The mock carries `puffish_attributes:magic_damage` with the engine's default, NaN |
| `overload-calls` | `overload_calls.py`: no script calls a Java method with a value that fits two of its overloads. On this engine such a call throws at the call (`entity.spawnAtLocation(Item.of(id))`: "the choice of Java method ... is ambiguous"), a handler's own `catch` swallows it, and the feature never works: no first-kill reward dropped for two days. The risky overload groups are computed from `truth/engine-members.json`; every call shape the scripts use carries the verdict of a real full-pack server (`VERDICTS` in the tool). A call of a method nobody has tried on the engine fails until it is tried |
| `script-model` | `dev/catalogue/script_model.test.js` (needs `node`): the model the load-order check and the catalogue are built on, against the ENGINE: what KubeJS reads from a script's comment lines (an `@` header field is never a file property; one word is), how it sorts scripts (highest `// priority` first, equal priorities in listing order) and in which order the handlers of one event run. The cases are `real-engine/0_script_file_facts.js`, the answers `truth/engine-facts.txt` (the lines `script file:`, `script sort:`, `handler order:`), recorded by `run.py real-engine record` from KubeJS's own `ScriptFileInfo`, `ScriptFile` and `EventHandler`. Then `dev/catalogue/load_order.js` against small packs with ONE planted defect each, and the script template as a new script |
| `load-order` | `dev/catalogue/load_order.js` on the pack (needs `node`): in all three trees, every order the code proves (a global read while a script loads; a global set and read in handlers of one event) holds in the order the engine really loads the scripts in, and is structural (a library's priority) or declared with `// @after`; every `@after` holds and can be shown; header fields that are there say what the code does; a new script has them; no file is switched off or mis-prioritised by a comment line. `dev/catalogue/README.md` |
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

**A test that makes a temporary git repository** (any test of any tool, not only here) must start its
git children WITHOUT git's repository variables. Git runs a hook with `GIT_DIR` set to the repository
being pushed, and a child `git -C <temp folder> ...` obeys `GIT_DIR`, not `-C`: on 2026-10-13 the first
run of `dev/lint_kubejs_traps.test.js` from the real pre-push hook did its `git init` and `git config`
on the real clone (`core.bare = true`, a test identity) and git failed in every worktree of it until
the config was put back by hand. Run by hand, or in CI, the same test was clean: only a hook sets the
variable. Three rules, each enough alone (that test's `newRepo` is the pattern): clear the variables
`git rev-parse --local-env-vars` prints from the child's environment; after `git init`, ask git where
the repository is and stop unless it is inside the temp folder; never write with `git config` (pass
identity and settings as `-c` options). And test it with `GIT_DIR` pointed at a second throwaway
repository, never at a real one. The same variable makes `git -C <dir> rev-parse --show-prefix` answer
an empty prefix: a tool that works out its own path inside the repository must clear it too.

## The event guard in the suites

Pack scripts register through `icraft.guard`, so every load list in `suites.json` starts with
`server:00_icraft_guard.js`, and the harness lets the two classes it loads through under their own names
(`java.util.Optional`, and the `EventExit` stand-in). A guarded handler that throws is caught by the guard, not by
`T_fire`: `lib/summary.js` counts it (`N guarded handler failures` in the RESULT line) and the suite fails.

## The registries in the suites

Scripts read the boss and dimension registries through `0_lib_registry.js`, which calls `JsonIO.readString(path)`.
In a suite that call reads the registry files of the pack under test (`--pack`): `H.java` `readJsonText` makes
the same two calls KubeJS makes (Gson's `JsonParser.parseReader`, then Rhino's own `JsonUtils.toString`), and the
`JsonIO` facts of `real-engine/0_engine_facts.js` hold its answers to the real engine's (what a script gets, the
exact text, a file that does not exist, the same call from a startup script). So a load list that has
`server:0_lib_core.js` also has `server:0_lib_registry.js`, and a suite sees the real roster. A suite that needs a
boss the pack does not have wraps the reader (`lib/spawn/stubs.js`), it does not edit the file.

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
`real-engine/0_script_file_facts.js` holds the facts about script FILES (the comment-line parser, the sort, the
handler order; `0_handler_order_probe.js` registers the four handlers it needs): it asks KubeJS's own classes,
which `Java.loadClass` refuses, through the class of an object a script already holds (`console.getClass()`).

## Where it runs

- **Pre-push hook** (`dev/install-hooks.ps1`, step 3b): `run.py fast` plus the method-ref validator,
  when a pushed commit touches a kubejs script, this folder, `dev/rhino_parse/` or the pinned engine
  metafiles. The installed hook is a copy: re-run `install-hooks.ps1 -Install` after the template changes.
- **GitHub Action** `kubejs-script-checks.yml`: the three script lints and `run.py ci` (every suite
  but `loot`), with the Rhino jar fetched from its metafile URL.
