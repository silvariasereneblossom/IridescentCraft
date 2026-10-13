# The script catalogue and the load-order check

Dev tools: nothing in this folder ships to a client or the server. How to write a script is
`.minecraft/kubejs/README.md`; this page is how the tools behind it work.

| File | What it is |
|---|---|
| `CATALOGUE.md`, `catalogue.json` | **generated**: every script's place in the load order, what it registers, sets and reads; every event with its handlers in the order they run; every order constraint; the globals; the libraries |
| `gen_catalogue.js` | writes those two files from the code; `--check` fails when they are stale |
| `load_order.js` | computes the order the engine really loads scripts in and holds every constraint to it |
| `script_model.js` | the one reading of the scripts both tools share: the engine's rules, the header fields, the code facts |
| `script_model.test.js` | the model against answers recorded on a real server; the check against planted defects; the template |
| `script_template.js` | what a new script starts from |
| `headers_grandfathered.json` | the scripts that existed before header fields did; the list only shrinks |
| `accepted.json` | known findings of the check, each with its reason (empty today) |

Everything runs with `node --expose-internals` (the tools use the parser bundled with Node, like the lints).

## The commands

```
node --expose-internals .minecraft/dev/catalogue/load_order.js                  the check: exit 1 on a failure
node --expose-internals .minecraft/dev/catalogue/load_order.js --order server   the load order, one script per line
node --expose-internals .minecraft/dev/catalogue/load_order.js --constraints    every order constraint and what holds it
node --expose-internals .minecraft/dev/catalogue/load_order.js --header server:<path>.js   the header fields the code implies
node --expose-internals .minecraft/dev/catalogue/load_order.js --claims         comment lines that talk about order
node --expose-internals .minecraft/dev/catalogue/load_order.js --compare-log <kubejs/server.log> --tree server
node --expose-internals .minecraft/dev/catalogue/gen_catalogue.js               write the catalogue
node --expose-internals .minecraft/dev/catalogue/gen_catalogue.js --check       exit 1 when it is stale
node --expose-internals .minecraft/dev/catalogue/script_model.test.js           the tools' own test
```

`--pack <another .minecraft>` runs any of them on another checkout. `--tree root|server|client` picks the tree
for the listing commands (`root` = `.minecraft/kubejs`); the check always judges all three.

## The engine's rules, and how they are known

Read in the bytecode of `kubejs-forge-2001.6.5`, then asked of KubeJS's own classes on a real Forge server
(`engine-tests/real-engine/0_script_file_facts.js`; the answers are committed in
`engine-tests/truth/engine-facts.txt`, and `script_model.test.js` puts the same cases to the model):

- **Which files.** A script folder is walked depth first, every folder in the order the file system lists it;
  regular files ending `.js`, at most 10 levels deep.
- **The order.** After the walk, one stable sort by `// priority`, highest first. Files of one priority stay in
  the order of the walk. No name is sorted by the engine.
- **The listing.** NTFS (the server, every client) lists names upper-cased, code unit by code unit, folders and
  files interleaved: `affixes/` before `affix_x.js`, `zzz_x.js` before `zz_x.js`. A Linux folder lists by a hash.
  The tools sort the names themselves, so they give the NTFS order on any machine; `dev/boot` builds its run
  folder so that the game sees that order too, and compares the order of every boot with the computed one.
- **Comment lines.** Every line that, trimmed, starts with `//` and whose rest is `<word> <word>`, or one word of
  two or more characters, is a file property, anywhere in the file; the last one of a key wins. `priority` must
  be a whole number or the file does not load; `ignored` / `ignore` `true` switches the file off.
- **Header fields** start with `@`, so they can never be a property (`// after x` without the `@` is one, and
  so is `// last hurt`). Each of the six field names was put to the engine in the form a script writes it.
- **Handlers of one event** run in the order they were registered. Handlers registered for a target run before
  the untargeted ones when that target fires.

`python .minecraft/dev/engine-tests/run.py real-engine` boots the server again and compares; `record` rewrites
the answers after an engine update.

## What the check holds

1. **An order the code proves.** A script reads `global.X` (or `icraft.x`, or a top-level name of another
   script) while it loads, and another script sets it while it loads: the setter must load first. Or one script
   sets `global.X` inside a handler and another reads it inside a handler of the same event: the setter must
   load first, because handlers run in load order.
   Such an order is **structural** when the setter has the higher priority (the guard, the libraries).
   Otherwise only the file names hold it, and the reader must **declare** it: `// @after <path>`. The failure
   line says which line to add.
2. **An order somebody declared.** `// @after <path>  <why>` for what no tool can read: a handler that relies on
   what another script's handler did to the same entity or the same loot list. The two scripts must share an
   event, the line must say why, and the order must hold.
   **A handler somebody declared last.** `// @last <event>` for a handler that must run after EVERY other handler
   of an event (a loot strip after every add): "every script that registers this event" names no script, so
   `@after` cannot say it. The script must register on that event, and no script that loads after it may. The
   failure names the later script. Like `@after`, the field moves nothing: the order is still the file names'.
   (A handler registered for a target runs before the untargeted ones whatever the order; the field is about
   registration order.)
3. **Header fields** that are there say what the code does (`@file`, `@events`, `@registry`, `@live`). A script
   that is not on `headers_grandfathered.json` is new and has `@file` and `@events`.
4. **Libraries.** A name is announced by one script; `icraft.lib.need('x')` names a library that exists and
   loads first.
5. **No global is read that no script sets.**
6. **Nothing the engine would trip on:** a comment line that switches a file off or is not a whole-number
   priority, a byte order mark, a file that is not UTF-8, two names that differ only by case, a script deeper
   than the engine walks.

What it cannot see: an order that exists only in what two handlers do (rule 2 covers the ones somebody wrote
down); a global reached through a computed name (`global[name]`); a value passed through an entity's saved
data. A read inside a function is taken to happen later unless that function is called while the file loads.

A finding that is known and not fixed goes into `accepted.json` with its reason and is printed on every run.
An entry that matches nothing fails, so the list cannot rot.

## Priorities

| Priority | Who | Why |
|---|---|---|
| 1000 | `00_icraft_guard.js` | every script calls `icraft.guard` while it loads |
| 900 | `0_iss_guard.js` | the first `EntityEvents.spawned` handler of the pack |
| 890, 880, 870, 860 | `0_lib_aptitudes.js`, `0_lib_core.js`, `0_lib_origins.js`, `0_lib_registry.js` | libraries |
| 850 | `0_server_ready_banner.js` | keeps the place its name gave it; nothing depends on it |
| 840 | `0_tick_master.js` | library |
| 0 | every other script | |
| -1000 | `zzz_icraft_live.js` | reports what the others registered |

The seven numbers from 900 to 840 were given on 2026-10-13 in the order the files already loaded in, so the
load order of no script changed. A priority is a decision: each one is recorded with its reason in
`dev/lint_kubejs_traps.exceptions.json`, and the lint refuses a `// priority` line that is not.
A new library takes a free number in that range and announces itself; a feature script never gets one.

## The catalogue

`gen_catalogue.js` reads the canonical tree and writes the two files. It takes registrations, sections and
features from its own reading of the code and **compares them with the liveness manifest**
(`dev/loud/liveness_manifest.json`); when the two disagree it writes nothing. So after a registration change the
order is: `gen_liveness.js`, then `gen_catalogue.js`.

Nothing in the output depends on where code sits inside a file (no line numbers, no dates, no commit), so the
files change only when a fact changes: a script added or renamed, a registration, a global, a constraint.

## Where it runs

- **Pre-push hook** (`dev/install-hooks.ps1`): its own block runs `load_order.js` and `gen_catalogue.js --check`
  when a pushed commit touches a script, this folder or the liveness manifest. The engine suite's block runs
  `script-model` and `load-order` as suites of `run.py fast`.
- **GitHub Action** `kubejs-script-checks.yml`: the same two commands as steps of the lint job, and the two
  suites in the engine job.
