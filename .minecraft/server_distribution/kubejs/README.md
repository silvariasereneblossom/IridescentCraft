# IridescentCraft KubeJS scripts

Minecraft 1.20.1 Forge, KubeJS 6 (`kubejs-forge-2001.6.5`) on Rhino (`rhino-forge-2001.2.3`).
This page describes what is in this folder today. It lists no individual scripts on purpose: a
list typed here goes stale (the previous version of this page described an `astages/` folder, an
`events/` folder and a `recipes/tier_skip.js` that never existed in this pack).

## Layout

```
kubejs/
├── startup_scripts/   items, enchantment hooks, attribute tables (need a game restart)
│   └── enchants/
├── server_scripts/    everything that runs on the server (re-read on /reload)
│   ├── 0_*.js         shared libraries, loaded first (see "Shared libraries")
│   ├── <topic>/       abyss, affixes, attributes, bonfire, class, cleanup, compat, economy,
│   │                  enchantments, end, endgame, exploration, food, gates, integration, items,
│   │                  loot, origins, pregen, quests, recipes, respec, scaling, skills
│   └── *.js           single-purpose scripts at the top level
├── client_scripts/    tooltips and JEI hiding
├── assets/            lang files, models, textures
├── data/              tags, loot tables, advancements (datapack-style)
└── config/            KubeJS's own settings
```

## Three copies

The pack ships from three trees. This one (`.minecraft/kubejs`) is the source; the server and the
client distributions carry mirrors:

- `.minecraft/server_distribution/kubejs`
- `.minecraft/distribution/client/kubejs`

`startup_scripts`, `server_scripts`, `assets` and `data` must be byte-identical in all three.
Edit here, then run `.minecraft/dev/sync-distros.ps1 -Fix`; the pre-push hook refuses a push when
they differ. `client_scripts` is not mirrored by that tool (the server copy leaves out scripts
that touch client-only classes). `server_scripts/validate_recipe_removals.js` is a dev-only check
and is deliberately absent from both distributions.

Nothing here reaches the game until it is committed and pushed to `main`: the server and the
client instance both re-sync from there.

## Load order

KubeJS loads the files of a script type in the order the folder lists them, which on the Windows
server is by name, case-insensitively, with folders and files interleaved. A `// priority: N`
header sorts a file ahead of that order. Two consequences that have bitten:

- `0_` files load first, `zz_` files load late. Upper-cased, `Z` sorts before `_`, so `zzz_x.js`
  loads BEFORE `zz_x.js`.
- On a Linux filesystem the listing is not by name, so a test boot there loads in a different
  order unless the scripts sit on an NTFS path.

All files of one script type share a single scope. A top-level name declared in two files is one
name; wrap a file in `;(function () { ... })()` and publish through `global.icraft.*`.

## Shared libraries (server scripts)

| File | Publishes | For |
|---|---|---|
| `0_lib_core.js` | `global.icraft.core` | entity ids, damage-source accessors, the world clock, the guarded hurt dispatcher (`onHurt`), saved spawn buffs, enchantment levels, `mainSlotCount()` |
| `0_lib_origins.js` | `global.icraft.origin` | a player's class, race and origin |
| `0_lib_aptitudes.js` | `global.icraft.aptitude` | aptitude levels and XP |
| `0_tick_master.js` | `global.registerServerTick`, `global.registerPlayerTick` | every timed job, each isolated from the others |
| `0_iss_guard.js` | `global.icraftSkipIssMob` | skipping the Iron's Spellbooks mobs that crash on attribute calls |

The header of `0_lib_core.js` lists what scripts really see on this engine (which vanilla names
are renamed or hidden). Read it before using a vanilla method name.

## This is not Node

The engine accepts scripts that Node also accepts and then behaves differently, usually without
an error. The three lints carry the rules and run in the pre-push hook:

```
node --expose-internals .minecraft/dev/lint_kubejs_rhino.js
node --expose-internals .minecraft/dev/lint_kubejs_traps.js
python .minecraft/dev/lint_kubejs_scope.py
```

The ones met most often: a `const` in a loop body or in a `try` misbehaves (use `let x = ...` or
`var`); a string that comes back from Java (`stack.id`, `entity.type`) never matches in a `Set`
or `Map` until it goes through `String(...)`; `event.cancel()` ends the handler, so it must be
the last statement and outside any `try`; a `catch` must log, rethrow or be marked
`// swallow-ok: <reason>`.

## Tiers and commands

Progression has four stages held by AStages: `tier_1` (everyone), `tier_2`, `tier_3`, `tier_4`.
The gates are registered in `server_scripts/gates/astages_restrictions.js`, which prints what it
registered, per tier, at server start.

Player commands defined by these scripts:

```
/icraft codex submit [engineering|magic]     turn carried materials into Codex Tokens
/icraft codex balance                        held tokens per tier; spends a full threshold and grants the next tier
/icraft codex exchange <1|2|3> <amount|all>  tokens into experience (tier 4 only)
/icraft relics submit [confirm]              preview, then turn carried relics and curios into Relic Essence
/icraft relics balance
```

Submits read the main inventory only (hotbar and backpack), never worn armour or the off hand.
