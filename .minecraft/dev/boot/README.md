# The boot gate: a full-pack offline server boot before a push

`boot.ps1` boots the pack's dedicated server offline in WSL and says what happened: whether it reached `Done`, how
long it took, idle TPS and memory, what the game really registered, which mixins applied, which loot tables the game
rejected, and what the boot-log checker says about the logs. It can do that for a commit, for a working tree with
uncommitted changes, and it can diff two boots.

Nothing booted the pack before a push until this existed. Loot tables the game rejects, mixins that never apply and
script chains that abort at load were found four to six months late, on the live server.

It never reads or writes the live server, a world backup or player data. The world of a run is generated from a pinned
seed, lives in memory, and is deleted when the run ends.

## The recipe for a change (A/B)

From the checkout that holds your change, committed or not:

    powershell -File .minecraft\dev\boot\boot.ps1 -Ref origin/main
    powershell -File .minecraft\dev\boot\boot.ps1 -Compare origin/main

The first line boots `origin/main` (fetched first) and keeps the result under the commit's hash; it is skipped when
that result already exists. The second line boots your tree as it is on disk and prints the diff. The second line
alone does both. Exit code 0 means: both boot, the checker found nothing new, and the diff shows no regression.

A checkout that does not have this folder yet (a branch cut before it landed) can be booted from one that has:
`boot.ps1 -Tree <path to that checkout> -Compare origin/main`.

**Then the push.** The pre-push gate will refuse it with `expected_state.json is STALE` unless the two manifests
were regenerated after your LAST commit or merge, whatever that commit touched. Nothing is wrong with `main`: the
gate writes the current short HEAD into `generated_from` and compares bytes with the file in your working tree, so
every new HEAD reads stale until you regenerate. After the last commit, in Windows PowerShell 5.1 (the shell the
hook uses), in-process:

    & .\.minecraft\dev\generate_expected_state.ps1

and push. Leave the two `expected_state.json` files modified and uncommitted: committing them makes a new HEAD and
the stamp is one behind again. (Commit them only with a change that deletes a file under `kubejs`, `config` or
`mods\.index`; the tools that delete on consumers read the committed copy.)

Other calls:

| Call | What it does |
|---|---|
| `boot.ps1` | boots this checkout as it is on disk |
| `boot.ps1 -Ref <commit>` | boots a commit; reused until `-Fresh` |
| `boot.ps1 -Diff <base>,<new>` | diffs two saved results (names, folders or commits; a commit without a result is booted) |
| `boot.ps1 -ModSet [-Ref <commit>]` | only computes the server's mod set and verifies the jars, in seconds |
| `boot.ps1 -ModSet -ExpectList <file>` | ... and compares it with a listing of a server's `mods` folder (one jar name per line) |
| `boot.ps1 -Ref origin/main -WriteSnapshot` | refreshes `.minecraft\dev\registry` from that commit |
| `boot.ps1 -List` | the saved results |
| `boot.ps1 -Name <n> -ConsoleFile <file>` | boots this checkout and then sends the server console commands of a text file (one per line, `#` starts a comment), three seconds apart, after every measurement. What they print is in the captured logs. For a check that needs an action and no player: `icraft live`, a `summon`, a `loot spawn ... kill`. Use a name of its own: such a run is not a clean result to compare with |
| `boot.ps1 -Setup` | first-time setup only |

Options (`-Heap`, `-Seed`, `-IdleSeconds`, `-JvmArg`, `-JarCache`, `-ResultsRoot`, `-Name`, `-Keep`, ...) are listed
at the top of `boot.ps1`.

## Exit code

| Code | Meaning |
|---|---|
| 0 | booted, stopped cleanly, nothing new found; with `-Compare` / `-Diff`, no regression |
| 1 | findings: the checker reports something that is not a known defect, or the diff shows a regression |
| 2 | could not run: a prerequisite, a missing or wrong-hash jar, the lock, bad arguments |
| 3 | the server did not boot, or did not stop cleanly |

## Prerequisites and first-time setup

- Windows with WSL 2. In the distribution: a JDK 17 (`sudo apt install openjdk-17-jdk-headless`; `jcmd` comes with
  it) and python 3.11 or newer. Nothing else: the engine uses the standard library only.
- `git` on the Windows side (a commit is exported with `git archive`).
- The mod jars on this PC. Default: the PrismLauncher instance `IridescentCraft` under `%APPDATA%`; otherwise
  `-JarCache <folder>[,<folder>]` or `$env:ICRAFT_BOOT_JAR_CACHE`. **Nothing is downloaded.** 89 server-side
  metafiles are CurseForge-mode with an empty URL, so a jar that is missing or has the wrong hash stops the run
  (exit 2) with the list. The custom jars come from the tree under test itself.
- About 13 GB of memory free inside WSL for the default 8 GB heap: the heap, the JVM's own memory, and the run
  folder, which is in memory (see "Script load order"). The run refuses to start (exit 2) when less than the heap
  plus 4 GB is available. That is per full-pack server: a second one running at the same time, of this tool or of a
  hand-made rig, needs as much again, and each makes the other slow (see "Traps").
- `boot.ps1 -Setup` once (the first boot does it too): it downloads the Forge installer named in the launcher source
  and runs `--installServer` into `~/icraft-boot/forge/<version>` in WSL. That needs the network and takes about a
  minute and a half. Everything after that runs offline, except that mods still try their own update checks.

Where things live:

| Where | What |
|---|---|
| `~/icraft-boot/forge/<version>` (WSL) | the Forge server install, shared by all runs |
| `~/icraft-boot/pool` (WSL) | every jar once, stored by its sha256, after it was verified |
| `~/icraft-boot/src/<hash>` (WSL) | the last few commits that were booted, unpacked |
| `/dev/shm/icraft-boot-<user>/run` (WSL, memory) | the one run folder; deleted after the run unless `-Keep` |
| `%USERPROFILE%\icraft-boot\results\<name>` | one folder per result (`-ResultsRoot`, `$env:ICRAFT_BOOT_RESULTS`) |

All of it can be deleted at any time; the next run rebuilds what it needs.

## What a run does

1. **The tree under test.** A commit is exported with `git archive`; a working tree is read as it is on disk.
2. **The mod set is computed, not copied.** `compute_modset()` in `icboot.py` applies the launcher's own rules to the
   tree's `server_distribution\mods\.index` (a parameter: `-IndexDir`):
   - an index entry is installed unless its `side` is `client` or its file name matches one of the launcher's
     `FORCE_SKIP_PATTERNS` (an empty `side` counts as `both`, as in the launcher);
   - every jar committed next to the index is copied by the sync;
   - then the launcher's clean-up: force-skip patterns again, the deny list, and the allow list (index, custom-jar
     manifest, fallback list).

   The patterns and lists are read from the launcher source **of the tree under test**
   (`iridescent-launcher\icraft-core\src\packwiz.rs`, `config.rs`), so there is one source for them.
   The run prints the arithmetic. Checked on 2026-10-12 against listings of the live server's `mods` folder, name
   for name, for both shapes of the index:
   - pack `13a94cc4` (hand-kept index): 454 metafiles - 19 client-side - 5 force-skipped = 430 entries = 428 jar
     names (two jars were named by two metafiles each) + 1 committed jar the index marked `client`
     (`offlineskins`) = **429**, the server's 429 jars of that morning;
   - pack `53b75211` (generated index, since `7c1c2f88`): 429 metafiles, all `both`, none force-skipped = **429**;
   - pack `59ee40da` (Entity Culling relabelled client-only in `0449ca14`): 428 metafiles = **428**, the server's
     428 jars after it had synced that commit.

   `boot.ps1 -ModSet -Ref origin/main -ExpectList <listing>` repeats that check against any listing (one jar name
   per line) and exits 1 on a difference.
3. **Every jar is verified** against the hash in its metafile (sha1, sha256 or sha512), a custom jar against
   `custom_jars_manifest.json`. A metafile without a hash cannot be verified: its jar is taken by name, the run says
   so, and its sha256 is recorded in the result (`mods.tsv`). The hand-kept index had seven such metafiles; the
   generated one has none.
4. **The sandbox** is assembled in memory: the jars, `config`, `defaultconfigs` and `kubejs` of the tree, the Forge
   libraries, `eula.txt`, and a `server.properties` from the tree's with `online-mode=false`, `server-ip=127.0.0.1`,
   the pinned seed and free ports.
5. **The JVM** gets the launcher's flags (`AIKAR_FLAGS` in `config.rs`) with the heap replaced by `-Heap`.
6. **Boot, wait for `Done`, wait for the registry dump, idle 45 s, read TPS and memory, `stop`.**
7. **Capture**: the whole `logs` folder (`latest.log`, `debug.log`, `kubejs\*`), crash reports, the console, the
   exit code.
8. **Extract**: registries, entity facts, loot tables and recipes; from the logs the mixins that applied, the data
   the game rejected, the scripts that loaded and in which order, and every WARN / ERROR line reduced to a signature.
9. **Check**: `dev\loud\loud-check.ps1` on the captured logs (see "The checker on the rig").

Timings measured on the dev PC on 2026-10-12 (32 threads, WSL with 30 GB), pack `13a94cc4`, 8 GB heap, no other
JVM running:

| Step | Time |
|---|---|
| computing the mod set and verifying jars | 1 s (the first time 35 s: the jars are hashed and copied into the pool) |
| assembling the sandbox | 10 s for a commit, 30 to 65 s for a working tree (its files are read through the Windows mount) |
| JVM start to `Done` | 2 min 30 s (151 s); the `Done (..s)` figure itself, which counts from a later point, was 62 s |
| registry dump, idle, measurements | 1 min |
| stop | 2 to 9 s |
| checker and extraction | 20 s |
| **one boot, end to end** | **about 5 minutes** (307 s) |

At idle after `Done`: 20.0 TPS at about 2 ms a tick, 2,250 MB of live heap after a full GC, about 7 GB resident
(the launcher's flags pre-touch the minimum heap, 4 GB here).

With two other sessions' full-pack servers running in WSL at the same time, the same boot took 400 s from the JVM
start to `Done` (`Done (139 s)`). The run notes every other JVM it finds, and the diff says when a side was measured
that way: do not compare times across such runs.

## The result folder

| File | Content |
|---|---|
| `result.json` | everything in one place: source, parameters, mod set, boot, memory, counts, the checker's findings, verdict |
| `logs\`, `crash-reports\`, `console.log` | as the server wrote them |
| `loud-check.txt` | the checker's report |
| `modset.json`, `mods.txt`, `mods.tsv` | the computed mod set with the reason for every exclusion; names; names with sha256 |
| `registry\*.txt` | one sorted id list per registry (the same files as the committed snapshot) |
| `registry\all\*.txt` | every registry the server holds, static and datapack, one file each |
| `registry\entities.json` | entity type: mob category, tags, base attributes |
| `registry\loot_tables.txt`, `loot_tables_rejected.txt`, `recipes.tsv`, `advancements.txt`, `game_rule_values.tsv` | what their names say |
| `mixins\applied.tsv`, `configs_applied.txt`, `configs_registered.txt` | from `debug.log`: config, mixin class, target class |
| `extract\signatures.json`, `scripts.json`, `data_rejected.json` | the log reduced to what the diff compares |
| `config_generated.txt` | config files the boot created that the tree does not track |
| `diff-vs-<base>.txt` / `.json` | the comparison, when one was asked for |

## The registry dump

After `Done` a helper script, `sandbox\icboot_registry_dump.js`, walks the server's registries and writes JSON into the
run folder. The tool copies it into the **sandbox's** `kubejs\server_scripts` and nowhere else; it must never be in a
distro tree. It logs at INFO only, so it cannot add a finding of its own, and it is counted as one extra server script
(158 loaded where the pack has 157).

What it records:
- every registry of the server, static and datapack (items, blocks, entity types, enchantments, attributes, mob
  effects, structures, structure sets, biomes, dimension types, fluids, block entity types, potions, recipe types,
  villager professions, and about 150 more under `registry\all`);
- entity types with their mob category, their tags (`forge:bosses` among them) and, for living entities, the base
  attributes: the vanilla combat and movement attributes, and any other attribute whose base is not the attribute's
  default (`attribute_defaults` in the same file has the defaults; `attribute_count` says how many it has in all);
- dimensions, game rules and their values in a fresh world, loot table ids, advancement ids;
- every recipe after the script pass with its recipe type and its serializer. (On a recipe object `getType()` is
  KubeJS's own helper and returns the serializer id, so the helper asks the recipe manager type by type; a recipe
  whose type no mod registered is listed as `unregistered`.)

From the logs: loot tables, recipes, advancements and other elements the game rejected at load, and which mixin
configs applied (a `Mixing <class> from <config> into <target>` line in `debug.log`; a config is registered by every
jar that ships one, and applies only when a class it targets is loaded on a dedicated server).

**The committed snapshot** is `.minecraft\dev\registry\`: the compact, sorted id lists of `main`, one text file per
registry, plus `entities.json` (its own README lists the files). It is the authoritative id list for validators and
replaces the item list of 2026-04-27 (`TesterLogs\Item Audit\all_items.tsv`). Refresh it with
`boot.ps1 -Ref origin/main -WriteSnapshot`, then commit the folder; `SOURCE.json` names the commit it describes.
Nothing checks that it is current: refresh it when mods or registrations change.

What a dump does not say:
- base attributes are those of the entity TYPE. What the pack's scripts and difficulty mods add at spawn is not in it;
- item facts beyond the id (display name, rarity, stack size, tags) are not dumped;
- key mappings, widgets and anything else that exists only on a client;
- which loot table a chest in a generated structure rolls (that is `audit_loot.py`);
- a Forge registry that is neither wrapped as a vanilla registry nor synced to clients is not listed.

## The checker on the rig

`loud-check.ps1` runs on the captured logs with:
- the liveness manifest of the tree under test;
- the script list of the tree under test (every script in the tree must print its `Loaded script` line);
- the baseline of the tree under test **plus** `rig_baseline.json` in this folder. The live baseline is read and
  never edited for the rig.

A known defect of the pack (the baseline's `defects` list) is reported and does not fail the gate; anything the
baselines do not list does (exit 1).

The checker's ARMED line is the exact comparison: `registrations server N/N, startup M/M` means the digest the game
printed (`[icraft.live] ARMED <type>: ... digest ...`) is the one `dev/loud/gen_liveness.js` computed from the scripts
of the tree under test. A registration that was not made is a red finding by name (`armed:<name>@<event>`). The
`FIRED` lines below it say what ran in the boot; they are a report and never fail the gate. With nobody online a rig
boot fires the registration-time events and the server tick functions, and nothing a player has to do.

### The rig against the live server

The rig is a fresh world on Linux with nobody online; the live server is Windows on a world from June. On 2026-10-12
(pack `13a94cc4`) a rig boot printed 154 of the live baseline's 160 accepted signatures and 7 of its 9 defects, all
133 liveness lines, and loaded every script. The differences, each of them:

| Difference | Why |
|---|---|
| Six accepted signatures are not printed: the Patreon-library network failures | They depend on the network at that minute; the live baseline marks them `runtime` |
| The Crust defect (`Failed first-time loading of config file config\Crust\default_game_rules.toml`) is not printed | Crust reads the pack's copy without error and then saves it in a form it cannot read back. The failure appears at the SECOND boot of the same folder; the rig always boots a pristine copy |
| The `cataclysm_ut:kill_monstrosity2` advancement defect is printed with another ending | The line lists the valid entity types. In a fresh world they come in registration order; on the live world Forge has re-read the ids from `level.dat`. `rig_baseline.json` lists the rig's wording as the same defect |
| A path in a log line has `/` where the live server prints `\` | Linux. No signature of either baseline depends on it today except the Crust one above |
| Server-local settings are not applied | The live server puts its override list (`.icraft_config_overrides.json`: worldgen settings, access settings) back before every start. The rig boots the pack's defaults |
| No Chunky pregeneration | See "Traps" |
| One more server script | The dump helper |

So a rig boot tells you about the pack at a commit, booted once from clean files. It does not tell you about a fault
that needs a second boot, a player, an old world, or Windows.

## The diff

`-Compare` and `-Diff` print, and write as text and JSON next to the newer result:
- boot time, idle TPS, live heap, peak resident memory, loaded classes;
- mod jars added, removed, and rebuilt under the same name (other sha256);
- per registry: ids added and removed; entity types whose category, tags or base attributes changed; game rules;
- loot tables, recipes, advancements added and removed, and the ones **newly rejected** by the game;
- mixin configs and mixin classes that stopped or started applying;
- scripts loaded, and scripts in the tree that did not load;
- log signatures that are new and that are gone, ERROR first;
- the checker's findings that are new or gone.

A **regression** makes the exit code 1: the new tree no longer boots; data newly rejected at load; a mixin config
that is still registered and no longer applies anything; a mixin class that no longer applies although its config
is registered and its target class is loaded; a script in the tree that did not load; a handler that now aborts; a
new ERROR signature; a new red finding of the checker. Ids added or removed are reported, not judged.

An example, `boot.ps1 -Diff a43766b4,59ee40da` (a day of commits on 2026-10-12), in full: one jar gone (Entity
Culling), two rebuilt under their name (`iridescent_durability_clamp`, `lovely_sparkle_pieces`), one registry entry
added (`minecraft:painting_variant` `lovely_sparkle_pieces:lsp_painting1`), one mixin class started
(`LevelEmptyFreshBlockEntityPruneMixin` into `Level`), two ERROR signatures gone (the refused Armor Formula entry and
the painting tag that named an unregistered variant), one WARN gone (Forge's "1 files which are client-side-only
mods ... will be skipped" for that jar), two of the checker's known defects gone, 0 regressions.

Read the numbers with the noise in mind (see "What two boots of the same tree differ in").

## Script load order (why the run folder is in memory)

KubeJS loads the scripts of a folder in the order the directory listing gives them (`Files.walk`), then sorts by the
`// priority` header, which one script of the pack sets (`00_icraft_guard.js`, 1000: the event guard, first on any
file system; by name it is first on NTFS as well). The live server and every client sit on NTFS, which lists
names sorted (upper-cased, so `affixes\` comes before `affix_overworld_strip.js`). ext4 lists them by a hash.

A full-pack server whose `kubejs` folder is on ext4 loads `0_lib_core.js` and `0_tick_master.js` about fiftieth. Six
scripts that register through them then fail at load (`TypeError: Cannot find function registerPlayerTick ...`), two
more say `0_lib_core.js did not load`, and the log reads `Loaded 151/157 KubeJS server scripts ... with 6 errors`.
None of that happens on the live server, and a script that works only by the luck of the hash order would pass.
Every hand-made full-pack boot of 2026-10-12 had this.

The rig therefore builds the run folder on a tmpfs (`/dev/shm`), where a directory lists its entries in the order
they were created (newest first on the WSL kernel; the tool measures which), and creates every pack tree in NTFS
name order. It then verifies every directory listing, and after the boot it compares the order of the
`Loaded script` lines with the order computed from the tree. A mismatch is reported as a problem of the run. The
computed order was checked against the live server's own log: 157 of 157 scripts in the same order.

`$ICRAFT_BOOT_RUN_DIR` (inside WSL) moves the run folder; it must be on a filesystem that lists in creation order.

## Traps

- **`-noverify` is required.** The pack's patched Ars Nouveau jar throws `VerifyError` in mod loading without it. It
  is in the launcher's flags; the tool warns when a tree's flags lack it.
- **One full-pack server per host.** Two of them collide on Simple Voice Chat's UDP port, and the loser stops its
  server right after `Done`. The tool takes a lock (`~/icraft-boot/lock`): a second `boot.ps1` waits for the first
  to finish, says who holds the rig, and gives up with exit 2 after `-LockWaitMinutes` (default 30). It also picks a
  free server port and a free voice-chat port for every run. A rig that is not this tool does not take the lock:
  the run then notes the other JVM, needs its memory on top (about 13 GB each), and is slow (400 s to `Done` instead
  of 151 s with two others running). So boot through `boot.ps1`, and one session at a time.
- **Chunky.** In a world that has not had one, `kubejs\server_scripts\pregen\auto_chunky.js` starts a pregeneration
  200 ticks after the load. It would run for the whole idle window and drown timings and logs. The tool writes the
  flag that script checks into the empty world folder before the first boot
  (`world\kubejs_persistent_data.nbt`); the script itself is not touched. If a pregeneration starts anyway (the flag
  was renamed), the run cancels it and reports a problem.
- **Never boot force-skipped mods.** An index entry with an empty `side` is not safe on a server by itself: ProbeJS
  is one, and it kills mod loading on a dedicated server. The launcher's `FORCE_SKIP_PATTERNS` is what keeps it off
  the live server, and the mod set here is computed with it.
- **`kubejs` on ext4 loads scripts in another order.** See above.
- **The Forge maven answers 403** to a client without a browser-like user agent. The setup sends the launcher's.
- **In a KubeJS script, a private JDK collection cannot be read.** `stream.toList()` returns one, and `size()` on
  it throws `IllegalAccessException`. Copy it first: `new ArrayList(x)`. The helper does.
- **A fault that needs a second boot is invisible here** (the Crust config above).

## What two boots of the same tree differ in

Measured on 2026-10-12 by booting the same server tree twice (a working tree at `13a94cc4` against the commit
`3bcd10b7`, whose server trees are identical). The same in both: every registry, the loot tables and the rejected
ones, the recipes, the advancements, the scripts loaded and their order, the mixin configs that applied, every ERROR
signature, the checker's findings. What differed:
- times: `Done` by several seconds on a quiet host, by minutes when another JVM runs;
- memory: live heap by 8 MB, resident memory by some hundreds of MB, loaded classes by about 50;
- mixin classes: up to seven of some 2,460 between any two of four boots of one tree, before `Done` as well as
  after it. A mixin applies when its target class is first loaded, and which classes a boot loads depends on what
  the spawn area generated and which mob spawned (`ProjectileUtil`, a mob's goal, a Create train carriage). The
  diff therefore counts a mixin class as stopped or started only when the other boot DID load its target class
  (some other mixin went into it there) or its config is not registered there at all; the rest are counted in one
  line. With that rule the four boots show no mixin change among them, and a real one is still found (the diff of
  `a43766b4` against `59ee40da` names the one mixin class a rebuilt jar added, into `net.minecraft.world.level.Level`);
- five WARN signatures of `latest.log`: a load time that crossed from seconds to minutes, two `Can't keep up`
  lines with the lag glued to its unit, and a config default printed as a list in hash order. The diff reduces
  signatures one step further than the checker does, so that these three kinds do not show as new and gone.

A new WARN signature of `latest.log` is reported and never counted as a regression.

## Not in scope

A scheduled nightly run, a CI job (CI has no mod jars), the client, the test PC with a GPU, and the pre-push hook: a
4.5-minute boot does not belong in it.
