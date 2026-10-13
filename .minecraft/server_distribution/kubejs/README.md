# IridescentCraft KubeJS scripts: how to write one

Minecraft 1.20.1 Forge, KubeJS 6 (`kubejs-forge-2001.6.5`) on Rhino (`rhino-forge-2001.2.3`).

This page is the conventions for a script in this folder. It lists no individual scripts on purpose: a list
typed by hand goes stale. The list is generated: **`.minecraft/dev/catalogue/CATALOGUE.md`** says, for every
script, what it registers, sets and reads, where it loads, and which handlers of an event run in which order.

## Start from the template

Copy `.minecraft/dev/catalogue/script_template.js` to `kubejs/<type>_scripts/<folder>/<name>.js`. It shows the
header, the wrapper function, how to ask for a library, a guarded handler, a tick function and a feature line.

A new script begins with its header fields. Each starts the line with `// @`:

| Field | Value | Needed |
|---|---|---|
| `@file` | `kubejs/server_scripts/<folder>/<name>.js` | always |
| `@events` | every group the script registers on, as its liveness ids name them: a KubeJS event, `tick.server`, `tick.player`, `hurt`, `hurt.late`, `<Registry>.<method>`; `none` when it registers nothing | always |
| `@registry` | `bosses`, `dimensions` | when it reads one |
| `@live` | the `icraft.live.fired` names it reports | when it reports one |
| `@after` | `<folder>/<other>.js  <why>`, one line per script | only when it must load after another script (below) |
| `@last` | an event, as `@events` names it | only when its handler must be the last one of that event (below) |

You do not have to work the values out. Write the code, then:

```
node --expose-internals .minecraft/dev/catalogue/load_order.js --header server:<folder>/<name>.js
```

prints the lines the code implies. The fields are **checked** against the code on every push; nothing is
generated from them. Older scripts have no fields yet and get them when they are next rewritten.

**A comment line can switch a script off.** KubeJS reads every comment line that is one or two words long as a
file property, anywhere in the file: `// ignored true` skips the file without a log line, `// priority 5` moves
it. Keep comment lines longer than two words. A header field is safe because it starts with `@`.

## Three copies

The pack ships from three trees. This one (`.minecraft/kubejs`) is the source; `server_distribution/kubejs` and
`distribution/client/kubejs` are mirrors. Edit here, then run `.minecraft/dev/sync-distros.ps1 -Fix`: it copies
`startup_scripts`, `server_scripts`, `assets`, `data` and `config/icraft` and regenerates the two manifests.
`client_scripts` and this page are copied by hand. Nothing reaches the game until it is committed and pushed
to `main`.

## Load order

KubeJS loads the files of one script type in the order the folder lists them, and sorts only by the
`// priority: N` line (highest first; files of one priority keep the listing order). On Windows the listing is
by name, upper-cased, folders and files interleaved, so letters sort before `_`: `zzz_x.js` loads **before**
`zz_x.js`, and `lootjs_overhaul.js` before `loot_overhaul.js`. A Linux folder lists in another order.

Who has a priority, and nobody else gets one:

| Priority | Scripts |
|---|---|
| 1000 | `00_icraft_guard.js` (every script calls it while loading) |
| 900 to 840 | the server libraries, each its own number (table below) |
| 0 | every feature script |
| -1000 | `zzz_icraft_live.js` (it reports what the others registered) |

A feature script that needs another feature script to load first says so: `// @after <path>  <why>`. That is
the case when it reads a `global` of the other script while it loads, or when its handler relies on what the
other script's handler of the same event did (a loot strip before an add, a health value another handler set).
The check finds the first kind in the code by itself and tells you the line to add; the second kind you declare,
with the reason. Never write `@after` for a library.

A script whose handler must run after EVERY other handler of an event (a loot strip that has to see what every
other script added) cannot name them all. It says `// @last LootJS.modifiers`: the check then fails as soon as a
script that loads later registers on that event, and names it. Neither field moves a script; the order is still
the one the file names give.

```
node --expose-internals .minecraft/dev/catalogue/load_order.js                 the check
node --expose-internals .minecraft/dev/catalogue/load_order.js --order server  the order, one script per line
node --expose-internals .minecraft/dev/catalogue/load_order.js --constraints   every constraint and what holds it
```

All files of one script type share a single scope. Wrap a file in `;(function () { ... })()` and publish
through `global`.

## Registering an event handler

Every registration goes through the event guard:

```js
ServerEvents.recipes(icraft.guard('recipes/my_script', 'ServerEvents.recipes', event => {
  ...
}))
```

- First argument: this script's path below its `*_scripts` folder, without `.js` (`#2` for a second handler of
  the same event in the file). Second: the registration it is passed to, as written.
- KubeJS leaves an event at the first handler that throws. A guarded handler that throws prints one line,
  `[icraft.guard] FAILED <name> in <event>: <message>`, and the handlers of the other scripts still run.
- `event.cancel()`, `success()` and `exit()` work behind the guard. Do not wrap them in your own `try`: they
  work by throwing, and a catch swallows them.
- A long handler that registers many rules is cut into blocks, so one bad rule costs its block and not the
  file: `icraft.section('loot/my_script/village-strips', function () { ... })`.
- A function put straight on one of the mod's Java registries is wrapped the same way:
  `icraft.handler('my_script', '<Registry>.<method>', fn)`.
- Handlers of one event run in load order. A handler registered for a target
  (`ItemEvents.rightClicked('minecraft:stick', ..)`) runs before the untargeted ones when that target fires.

## Libraries (server scripts)

| Library | File | Priority | Gives you |
|---|---|---|---|
| | `00_icraft_guard.js` (all three script types) | 1000 | `icraft.guard`, `icraft.section`, `icraft.handler`, `icraft.live`, `icraft.lib` |
| `iss-guard` | `0_iss_guard.js` | 900 | `global.icraftSkipIssMob`: skip the Iron's Spellbooks mobs that crash on attribute calls |
| `aptitudes` | `0_lib_aptitudes.js` | 890 | `global.icraft.aptitude`: aptitude levels and the XP wallet |
| `core` | `0_lib_core.js` | 880 | `global.icraft.core`: the helpers below |
| `origins` | `0_lib_origins.js` | 870 | `global.icraft.origin`: a player's class, race and origin |
| `registry` | `0_lib_registry.js` | 860 | `icraft.bosses`, `icraft.dims` |
| `ticks` | `0_tick_master.js` | 840 | `global.registerServerTick`, `global.registerPlayerTick` |
| `entity-mod` | `loot/0_entity_id_validator.js` | | `global.icraftEntityMod(event, id)`: an entity loot modifier whose id is checked |

A script that cannot work without a library asks for it first:

```js
if (!icraft.lib.need('core', 'scaling/my_script')) return
```

A missing library is then one line, `[icraft.lib] MISSING core: scaling/my_script needs this library ...`, and
at the end of every script load the game names any library that did not load
(`[icraft.lib] NOT LOADED x1: core (0_lib_core.js)`). Both are error lines.

**Core helpers** (`global.icraft.core`; the header of `0_lib_core.js` is the reference). Use them instead of
the engine member they replace:

| Helper | Instead of |
|---|---|
| `core.entityId(entity)` | `entity.type` (a Java value that matches no `Set`) |
| `core.idSet([...])` | a `Set` or `Map` of ids |
| `core.eachMainSlot(player, fn)` | a loop to `inv.size` (which does not exist) |
| `core.playerTier(player)` | reading the `tier_N` stages yourself |
| `core.blockIfLoaded(level, x, y, z)` | `level.getBlock` (which loads the chunk) |
| `core.now(entityOrLevel)` | a saved `server.tickCount` (it restarts at 0 on every boot) |
| `core.warnOnce(key, message)` | an empty `catch`, or a line per tick |
| `core.onHurt(key, fn, who, gate)` / `core.onHurtLate` | a handler straight on the damage registry |
| `core.spawnBuff(entity, flag)` | `entity.modifyAttribute` for a once-per-mob buff (it is not saved) |
| `core.isBoss(entityOrId)` | a list of boss ids |

**A hurt handler.** `core.onHurt('<key>', function (event, ctx) { ... }, '<who>')` puts a handler on the one
dispatcher of the pack: it runs after the handlers of the scripts that load before it, it is skipped for
secondary damage (a splash, a chain, thorns: anything dealt through `core.dealDamage`) and for a hit an earlier
handler cancelled, and the amount it leaves is checked. That is what a NEW handler wants. Never put one
straight on `DamageModifierRegistry`: that registry runs its entries in the hash order of their keys, not in the
order they were registered, and a twelfth key reorders the other eleven (lint rule DIRECT-HURT-REG).

The fourth argument may be an options object (`gate`, `place`, `secondary`, `cancelled`, `unchecked`; the
comment above `OPTIONS` in `0_lib_core.js` says what each does). They exist for the handlers that were moved off
the registry and must do exactly what they did there; the handlers that have a `place` are a closed list in the
library (`PLACED`). Adding one of these options to a handler, or taking one off, changes damage numbers: it
needs a decision and a row in the hit table (`dev/engine-tests`, suite `hit-table`).

**Registries.** Which entities are bosses and which tier a dimension has is data, in
`kubejs/config/icraft/registry/bosses.json` and `dimensions.json`. A script asks `icraft.bosses` and
`icraft.dims` and never keeps its own list of ids. `.minecraft/dev/rosters/README.md` has every key.

## Liveness: did it run?

A script that loaded has proved nothing. Three tiers, and a new script gets the first two for free:

- **LOADED**: the file was read without an error.
- **ARMED**: a registration was made. Recorded by `icraft.guard`, `icraft.handler`, the tick master and
  `core.onHurt` themselves.
- **FIRED**: it ran to its end at least once. Recorded by the same four; `/icraft live` lists what has not.

Where "the handler ran" does not mean "the feature worked", add one line in the branch that did the work:
`icraft.live.fired('my-feature')` (a lower-case name joined by `-`, never a player's name). Do not print a
"loaded" line for a checker's sake.

## This is not Node

The engine accepts scripts that Node also accepts and then behaves differently, usually without an error.
Three lints carry the rules; a flag blocks the push:

- `const` in a loop body or a `try` misbehaves; a closure sees the **last** value of any loop variable.
- A string from Java (`stack.id`, `entity.type`) never matches in a `Set` or `Map` until it goes through
  `String(...)`; `charCodeAt` returns a Java character, and arithmetic on it is `NaN`.
- Members that do not exist here: `inv.size`, `level.dayTime` as a number, `entity.hurt()`, `source.entity`.
- `level.getBlock` loads the chunk it reads; a saved `server.tickCount` is wrong after a restart.
- A `catch` must report, rethrow or be marked `// swallow-ok: <reason>`.
- A registration without the guard; a local copy of a core helper; a comment line that is a file property.

## Before you push

```
node --expose-internals .minecraft/dev/loud/gen_liveness.js          the liveness lists (after any registration change)
node --expose-internals .minecraft/dev/catalogue/gen_catalogue.js    the catalogue (after any script change)
powershell -File .minecraft\dev\sync-distros.ps1 -Fix                the two mirrors and the manifests
python .minecraft/dev/engine-tests/run.py all                        the scripts on the real script engine
powershell -File .minecraft\dev\boot\boot.ps1 -Compare origin/main   a full-pack offline boot, compared with main
```

Commit what the first three wrote together with the change. The pre-push hook
(`.minecraft/dev/install-hooks.ps1 -Install`, once per clone) runs the lints, the load-order check, the
catalogue and liveness freshness checks, the engine suite and the mirror check, and refuses a push that
fails one. `.minecraft/dev/engine-tests/README.md` and `.minecraft/dev/boot/README.md` explain the last two.

## Tiers and commands

Progression has four stages held by AStages: `tier_1` (everyone), `tier_2`, `tier_3`, `tier_4`. The gates are
registered in `server_scripts/gates/astages_restrictions.js`.

Player commands defined by these scripts:

```
/icraft codex submit [engineering|magic]     turn carried materials into Codex Tokens
/icraft codex balance                        held tokens per tier; spends a full threshold and grants the next tier
/icraft codex exchange <1|2|3> <amount|all>  tokens into experience (tier 4 only)
/icraft relics submit [confirm]              preview, then turn carried relics and curios into Relic Essence
/icraft relics balance
/icraft live [filter]                        operators: what has not run since the scripts loaded
```

Submits read the main inventory only (hotbar and backpack), never worn armour or the off hand.
