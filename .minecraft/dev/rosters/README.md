# Boss and dimension registries

The pack's boss roster and its dimension tiers each have ONE home:

| File | One entry per | Read by |
|---|---|---|
| `kubejs/config/icraft/registry/bosses.json` | entity type | 17 systems in 17 scripts |
| `kubejs/config/icraft/registry/dimensions.json` | dimension | 6 systems in 9 scripts |

Scripts ask `icraft.bosses` / `icraft.dims` (`kubejs/server_scripts/0_lib_registry.js`, the only reader). Dev tools
read the same files through `rosters.py` in this folder. Until 2026-10-13 the boss roster was copied by hand into
ten script files that disagreed, and dimension tiers into five; a boss added to four lists and forgotten in four
failed without a word.

## After any edit

```bash
python .minecraft/dev/rosters/validate.py --notes
```

The pre-push hook and CI run it (`dev/engine-tests/run.py fast`, suite `registry-data`), together with suite
`registry`, which holds the script-side reader to `rosters.py` on the production script engine.

What the edit changes, cell by cell (one cell = what one consuming system gets from one entry), against
`origin/main` or another commit:

```bash
python .minecraft/dev/rosters/registry_diff.py              # put the output in the commit message
python .minecraft/dev/rosters/registry_diff.py --expect 46  # exit 1 unless exactly that many cells differ
```

A flag two systems read counts twice: `boss` answers `core.isBoss` and the mob-tier exclusion. Nothing it does
not print has moved (it also compares the order of the entries, the arena keys, the switches and the boot line).

## Adding a boss

One entry in `bosses.json`, next to related entries (the order of the file is the order scripts iterate):

```json
"somemod:some_boss": { "tier": 2, "kind": "named", "hp": 400, "flags": ["boss", "x3"], "rush": 2 }
```

| Key | Meaning | Script that reads it |
|---|---|---|
| `tier` | 1-4 | the kill tokens (their tier) |
| `kind` | `named` = trophy boss: first-kill bonus, then repeat tokens. `miniboss` = tokens on every kill. `unlisted` = on neither kill roster | `exploration/codex_exploration_kills.js` |
| `hp` | designed health | `scaling/boss_hp.js` |
| flag `boss` | `core.isBoss` (affixes, enchants, skills, both Vorpal decapitations) AND no mob-tier health multiplier | `0_lib_core.js`, `scaling/mob_scaling_unified.js` |
| flag `x3` | health x3, melee x3, Iron's Spellbooks spell power x2 | `scaling/zz_boss_global_3x.js` |
| flag `x3DamageSkip` | keeps the health x3, skips both damage buffs (no boss has it) | same |
| flag `perKill` | per-kill scaling, which is SWITCHED OFF (`switches.perKill`) | `scaling/boss_progressive.js` |
| `rush` | the boss-rush roster (1-3) it counts for. The roster SIZE is the denominator of a ruled percentage | `gates/codex_boss_rush.js` |
| `phaseOf` | a kill of this entity is credited to that boss in the boss rush | same |
| `relic` | `{ item, chance, looting }`: the relic it drops | `relic_boss_drops.js` |
| `arena` | the Boss Compass / bonfire row: `key`, `display`, `tier`, `dimension`, `structure` or `signatureBlock` (+ `locator`), `waystone`, optional `ritual`, `summonEntity` | `bonfire/boss_arena_registry.js` |
| flag `witchInk` | +10 on the Witch of Ink kill counter | `origins/witch_of_ink_progression.js` |
| flag `abyssBoss` | The Abyss boss rules | `scaling/dimension_mechanics.js` |
| flags `vorpalMelee`, `vorpalArcane` | never beheaded (a `boss` is spared anyway) | the two startup scripts in `enchants/` |
| flag `caster` | the five spellcasters the spawn scripts must not touch | five spawn scripts |
| `absent` | the reason an entry is kept although its id is NOT a registered entity type | the validator |
| `note` | free text | nobody |

What an entry does NOT do, and still has to be done by hand: the boss's own drops (`loot/*_boss_drops.js`,
`loot/unique_itemset_registry.js`, `loot/boss_refight_repair_floors.js`), quests, the Codex pages, the wiki, the
structure tag of a structure arena (`kubejs/data/icraft/tags/worldgen/structure/<arena key>.json`; the validator
checks it), and the two lists outside the scripts (below).

A flag that is forgotten is not silent: `validate.py` expects a named boss to be `boss` and `x3`, a miniboss to be
`boss` (ruled 2026-10-12: minibosses are bosses; they keep their own health, without the mob-tier multiplier), a boss with a
designed health to be `x3`, a named or miniboss entry of tier 1-3 to be on a rush roster, and so on (the rules are
at the top of `validate.py`). A deviation fails until it is written into `accepted.json` with its reason.

## Adding a dimension

One entry in `dimensions.json`:

```json
"somemod:some_dimension": { "tier": 3, "flags": ["loot", "classPassives"], "stageGate": "modpack/dim_some",
  "exploration": "some", "deathPenalty": 0.18,
  "mobEquipment": { "chance": 0.4, "enchantLevel": 2, "fullSetChance": 0.4,
    "weapons": ["minecraft:diamond_sword"], "helmets": ["minecraft:diamond_helmet"],
    "chests": ["minecraft:diamond_chestplate"], "legs": ["minecraft:diamond_leggings"], "boots": ["minecraft:diamond_boots"] } }
```

| Key | Meaning | Script that reads it |
|---|---|---|
| `tier` | 1-4 | everything below |
| `stageGate` | the AStages restriction id; the dimension is closed until the player has stage `tier_<tier>` | `gates/astages_restrictions.js` |
| `exploration` | the key of the first-arrival token bonus (tokens of the dimension's tier). It is part of a saved player flag: never rename one | `exploration/codex_exploration_kills.js` |
| `deathPenalty` | share of durability lost on death there (no key: the default, 15%) | `death_penalty.js` |
| `mobEquipment` | the gear roll for hostile mobs spawning there | `scaling/mob_equipment.js` |
| flag `classPassives` | standing there raises the player's detected tier for the class passives | `origins/class_passives.js` |
| flag `loot` | member of its tier's dimension group in the tiered loot rules: `icraft.dims.inTier(2, 'loot')` | four loot scripts, 22 rules |

Not covered by the loot flag: a loot rule that names ONE dimension still names it in the script (21 Overworld
rules, 14 End rules, the Ad Astra planets). No rule asks for the tier-4 group yet.

## The lists that are still copies

They are not script lists and the registries do not feed them; `dev/mods/pack_audit.py` compares them:

- `config/iridescent_difficulty-common.toml`: the difficulty mod's boss exclude list and its dimension tiers;
- `config/apotheosis/adventure.cfg`: "Affix Convert Rarities", "Gem Dimensional Rarities", "Boss Spawn Dimensions".

## How a script asks

```js
icraft.bosses.is(id)                 // the flag `boss` (core.isBoss asks this)
icraft.bosses.has(id, 'x3')          // is the id in that system
icraft.bosses.get(id, 'relic')       // the value that system gets, or null (records are fresh copies)
icraft.bosses.tier(id)   .hp(id)   .kind(id)
icraft.bosses.byTier(2)  .byTier(2, 'rush')  .ids('x3')  .arenas()  .enabled('perKill')
icraft.dims.tier(id)   .has(id, 'loot')   .get(id, 'deathPenalty')
icraft.dims.inTier(2, 'loot')   .inTiers([1, 2], 'loot')   .ids('stageGate')
```

- An id is normalised inside (`String(id)`): a raw Java string from `entity.type` works. On this engine
  `new Set([...]).has(javaString)` is false, which is how per-kill scaling never ran.
- **A registry that cannot be read is an error, never an empty roster.** The reader prints
  `[icraft.registry] NOT LOADED -- ...` and every call throws; `core.isBoss` throws with it. A file with a shape
  problem (an unknown key or flag, a missing tier) is refused whole.
- A system name that does not exist throws.
- The systems: `isBoss`, `tierHpExcluded`, `hp`, `x3`, `x3DamageSkip`, `perKill`, `tokensNamed`, `tokensMiniboss`,
  `rush`, `phase`, `relic`, `arena`, `witchInk`, `abyssBoss`, `vorpalMelee`, `vorpalArcane`, `caster`; for
  dimensions `stageGate`, `exploration`, `mobEquipment`, `deathPenalty`, `classPassives`, `loot`.
- Startup-script HANDLERS may ask through `global.icraft.bosses` (the map `global` is shared by all script
  types); a startup or client script that is still loading runs before the server scripts and reads the file
  itself if it needs it (`JsonIO.readString`, then `JSON.parse(String(text))`).
- At boot the reader prints one line, which is in the liveness manifest:
  `[icraft.registry] loaded -- bosses: 111 entries (58 named, ...), dimensions: 16 entries (tier 1-4: 1 / 4 / 5 / 6)`.

## Why `kubejs/config/icraft/registry`

The files must reach all three distributions and the live server exactly as scripts do, and nothing but the
reader may load them.

- **Not `kubejs/data`.** That was the first choice (already mirrored and pruned). A datapack folder is a shared
  space: every mod's reload listener scans its own folder name in every namespace. Sophisticated Core reads every
  `data/<namespace>/registry/*.json`, and the first full-pack test boot logged
  `ERROR [sophisticatedbackpacks/]: No loader defined for bosses` (and `for dimensions`). The boot gate
  (`dev/boot`) found it; nothing else would have before the live server.
- `kubejs/config` is outside the game's resource system. KubeJS reads its own `.properties` files there and
  ignores a subfolder. The whole `kubejs` tree is a managed root of `expected_state.json`, and both sync paths (the
  server launcher, the client sync) copy it whole.
- `kubejs/config/icraft` is watched by `sync-distros.ps1` since 2026-10-13 (identical x3; the rest of
  `kubejs/config` holds per-machine KubeJS files and stays unwatched).
- One thing it does not get: the launcher prunes five script and data trees to the repo after a sync, and
  `kubejs/config` is not one of them. A registry file that is deleted or renamed in the repo would stay on a
  server or client. The reader reads two fixed names, so a leftover file is never read; do not rename the two.

## The tools here

| File | What it does |
|---|---|
| `rosters.py` | reads the two files; `BOSS_SYSTEMS` / `DIM_SYSTEMS` say what each system gets from an entry (the same table as in the reader) |
| `validate.py` | strict JSON and shape; every id against `dev/registry` (the dump of a real boot); consistency; the expectations and `accepted.json`. Exit 0 / 1 / 2 |
| `accepted.json` | every place where the registry deviates from the expectations, with the reason: the disagreements of the old script lists, kept exactly, awaiting a ruling |
| `table.py` | the proof that the registries equal the lists the scripts held: every id against every system, old against new, cell for cell. Needs node and git |
| `legacy_lists.js` | reads the old lists out of the script sources of a commit that still has them (`table.py` runs it) |

`dev/registry` is a snapshot of one boot (`SOURCE.json` names its commit). After mods change, refresh it
(`dev/boot/README.md`) before trusting a "not a registered entity type" finding, or an "ok".
