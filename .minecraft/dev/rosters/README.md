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
| `levelHp` | `{ "<level>": designed health }` for a Progressive Bosses level of the same entity type (the entity's `getLvl()` at its join); a level not listed takes `hp`, so it needs an `hp`. The Wither: `{ "3": 1000 }`, the Ultimate Wither (ruled 2026-10-14) | `scaling/boss_hp.js` through `icraft.bosses.hp(id, level)` |
| flag `boss` | `core.isBoss` (affixes, enchants, skills, both Vorpal decapitations) AND no mob-tier health multiplier | `0_lib_core.js`, `scaling/mob_scaling_unified.js` |
| flag `x3` | health x3, melee x3, Iron's Spellbooks spell power x2 | `scaling/zz_boss_global_3x.js` |
| flag `x3DamageSkip` | keeps the health x3, skips both damage buffs (no boss has it) | same |
| flag `perKill` | per-kill scaling, per player: the highest kill count among the players within 64 blocks fixes the boss at its first exchange with a player (ON since 2026-10-15, `switches.perKill`; the Wither is not flagged) | `scaling/boss_progressive.js` |
| `rush` | the boss-rush roster (1-3) it counts for. The roster SIZE is the denominator of a ruled percentage | `gates/codex_boss_rush.js` |
| `phaseOf` | a kill of this entity is credited to that boss in the boss rush | same |
| `relic` | `{ item, chance, looting }`: the relic it drops | `relic_boss_drops.js` |
| `arena` | the Boss Compass / bonfire row: `key`, `display`, `tier`, `dimension`, `structure` or `signatureBlock` (+ `locator`), `waystone`, optional `ritual`, `summonEntity` | `bonfire/boss_arena_registry.js` |
| flag `witchInk` | +10 on the Witch of Ink kill counter | `origins/witch_of_ink_progression.js` |
| flag `abyssBoss` | The Abyss boss rules | `scaling/dimension_mechanics.js` |
| flags `vorpalMelee`, `vorpalArcane` | never beheaded (a `boss` is spared anyway) | the two startup scripts in `enchants/` |
| flag `caster` | the five spellcasters the spawn scripts must not touch | five spawn scripts |
| `absent` | the reason an entry is kept although its id is NOT a registered entity type | the validator |
| `sameAs` | this id is a second entity id of that boss (see below); the entry carries nothing else | the reader: every question, `canon`, `entityIds` |
| `seenAs` | `{ type, class, baseHealth, mainHand }`: the game hands this boss out under ANOTHER entity type; how to tell it from that type's ordinary mobs (see below) | `0_lib_core.js` `core.entityId` / `core.seenAsId`, through `icraft.bosses.seenAs()` |
| `note` | free text | nobody |

What an entry does NOT do, and still has to be done by hand: the boss's own drops (`loot/*_boss_drops.js`,
`loot/unique_itemset_registry.js`, `loot/boss_refight_repair_floors.js`), quests, the wiki, the
structure tag of a structure arena (`kubejs/data/icraft/tags/worldgen/structure/<arena key>.json`; the validator
checks it), and the two lists outside the scripts (below).

The Codex follows an entry by itself (since 2026-10-17: its roster pages, places, health, rush and tokens are
filled from this file when the jar is built), once the boss has a name in `dev/codex/names.json`. After the
edit: `python .minecraft/dev/codex/codex.py release`, and commit what it lists; the pre-push hook and CI fail
until then and name the page (`dev/codex/README.md`).

A flag that is forgotten is not silent: `validate.py` expects a named boss to be `boss` and `x3`, a miniboss to be
`boss` (ruled 2026-10-12: minibosses are bosses; they keep their own health, without the mob-tier multiplier), a boss with a
designed health to be `x3`, a named or miniboss entry of tier 1-3 to be on a rush roster, and so on (the rules are
at the top of `validate.py`). A deviation fails until it is written into `accepted.json` with its reason.

## A boss the game hands out under another entity id (`sameAs`)

```json
"minecraft:wither": { "tier": 3, "kind": "named", "hp": 600, "flags": ["boss", "x3"], "rush": 3 },
"progressivebosses:wither": { "sameAs": "minecraft:wither", "note": "why the game uses this id" }
```

Progressive Bosses cancels the join of every `minecraft:wither` and adds its own `progressivebosses:wither`, so the
Wither a player fights never has the id the pack wrote everywhere (measured 2026-10-13: until then the designed
health, the boss x3, the kill tokens, the boss rush, the first-kill relic and every loot rule missed it). An entry
with `sameAs` is a SECOND ID of another entry and nothing else (`note` is required, every other key is refused):

- a question asked with either id (`is`, `has`, `get`, `tier`, `hp`, `kind`) is answered from the boss;
- no list holds the second id (`ids`, `byTier`, `arenas`): the named roster stays 58 and the tier-3 rush 43;
- `icraft.bosses.canon(id)` is the boss an entity id is. A script that keeps a table built from `ids()` or saves
  something under a boss id (a first-kill flag, a rush credit) keys it on `canon(id)`, so one boss is paid once;
- `icraft.bosses.entityIds(id)` is `[boss id, second ids...]`. A rule registered per entity TYPE covers them all:
  `global.icraftEntityMod` (every LootJS entity modifier of the pack goes through it) does that by itself, so a
  loot script keeps naming the boss.

When to use it: the validator cannot tell that a registered id is never handed to a script. For a boss a mod
replaces or whose class extends a vanilla mob, check on a full-pack boot what `getEncodeId()` of the spawned
entity says (internal `dev/registries-2026-10-13/zzzz_wither_probe.js`). The other case, an entity whose OWN id is
never handed out (`irons_spellbooks:magehunter_vindicator` is typed `minecraft:vindicator`), is not solved by
`sameAs`: there the id a script sees belongs to an ordinary mob. That is `seenAs` (next section).

What `sameAs` does not reach: everything outside the scripts that names the boss by id (the difficulty mod's
exclude list, quests, other mods' config lists). `dev/mods/pack_audit.py` counts a second id as a script boss, so
it shows up there when the difficulty mod does not exclude it.

## A boss the game hands out under ANOTHER type (`seenAs`)

```json
"irons_spellbooks:magehunter_vindicator": { "tier": 3, "kind": "unlisted", "hp": 500, "flags": ["boss"],
  "seenAs": { "type": "minecraft:vindicator", "class": "io.redspace.ironsspellbooks.entity.mobs.MagehunterVindicator",
              "baseHealth": 50, "mainHand": "irons_spellbooks:magehunter" }, "note": "..." }
```

Iron's Spellbooks creates its Magehunter with the TYPE `minecraft:vindicator` and saves it under that id. The Evoker
Fort's tower places it during worldgen, so a fort's Magehunter is a plain `Vindicator` before any script sees it; a
summoned one keeps its own class only until it is saved (measured on a full-pack boot, 2026-10-14). Its own id is
never handed to a script, and the id it is handed out under belongs to every ordinary vindicator, so neither the id
nor `sameAs` can say which one is the boss. `seenAs` says how: by its Java `class`, or by its marks, `baseHealth`
(the base max health) AND `mainHand` (the item in its main hand), both or neither. At least one of the two.

- `core.entityId(entity)` (`0_lib_core.js`) answers the boss's id for such an entity, and so does every script that
  reads an id through it (`core.isBoss`, the registry questions, the scaling scripts); `core.seenAsId(entity)` answers
  that id or `''` (the two Vorpal startup scripts ask it). The first answer stamps the entity
  (`persistentData icraft_entity_id`, saved with it), and later reads, after any reload, answer from the stamp: a
  Magehunter that loses its sword stays the Magehunter. The log says it once per script load:
  `[icraft.core] recognised <boss id> in a <type> by <how>; stamped icraft_entity_id`; liveness feature
  `boss-seen-as`.
- One type is the `seenAs` type of one entry at most, and never a type that has an entry of its own.
- What it does not reach: anything that reads the entity's TYPE itself, inside the scripts or outside them: a
  LootJS modifier per entity type (the boss drops the type's loot table), entity-type tags, the difficulty mod and
  every other mod's config list. A script that reads `getType()` itself (and not `core.entityId`) does not see it
  either; ask with the entity (`core.isBoss(entity)`), not with a type string.
- `validate.py` checks the shape, that the type and the item are registered, and that the entry has a `note`.

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

## A list generated from the registry: `#icraft:registry_bosses`

`kubejs/data/icraft/tags/entity_types/registry_bosses.json` is an entity-type tag of every entry with the flag `boss`
and its second ids (`sameAs`), plus the separate body entities of two of them (`BODY` in `boss_tag.py`: the void
worm's parts, the Eye of the Storm's segments). NoSeeNoTick reads it (`config/noseenotick-common.toml`, three
distros): with 2 or more players online, the types in it keep ticking far from every player. After an edit that adds,
removes or flags a boss:

```bash
python .minecraft/dev/rosters/boss_tag.py --write    # then sync-distros.ps1 -Fix
```

`validate.py` fails while the committed tag differs from what the registry says.

## The lists that are still copies

They are not script lists and the registries do not feed them (each mod reads its own config, in each of the three
distros):

- `config/iridescent_difficulty-common.toml`: the difficulty mod's dimension tiers (`[dimensions] t1..t4`; a
  dimension not listed is t1) and its boss exclude list (`[excludes] entities`, the ONLY exemption from the curve,
  exact ids);
- `config/apotheosis/adventure.cfg`: "Affix Convert Rarities", "Gem Dimensional Rarities" (a dimension not listed has
  no rarity clamp: the whole ladder by weight) and "Boss Spawn Dimensions" (not listed: no Apotheosis boss spawns).

`external_lists.py` holds them to the registry (ruling 25, 2026-10-14):

```bash
python .minecraft/dev/rosters/external_lists.py                     # the report (check): exit 0, it changes nothing
python .minecraft/dev/rosters/external_lists.py check --summary     # one line; the pre-push hook prints it
python .minecraft/dev/rosters/external_lists.py generate --dry-run  # what generate would write, as a diff
python .minecraft/dev/rosters/external_lists_test.py                # its tests (CI: external-lists.yml)
```

`check` names registry bosses (and second ids) missing from the exclude list, exclude entries that name no entity,
dimensions on another tier or on none, Apotheosis entries that are no dimension, registry dimensions missing from an
Apotheosis list, and distros that disagree. `generate` writes exactly those keys from the registry and
`external_lists.policy.json`, keeping every other byte of each file and each list's order (entries that stay keep
their place, new ones are appended); it refuses while the policy holds a `null` (a ruling the operator owes).

**Generated since 2026-10-16** (the operator ruled the policy that day): the bosses with a designed health or the x3
are off the difficulty curve (and the Elder Guardian, kept by name), every registry dimension is on the curve at its
registry tier, and Apotheosis lists every registry dimension except the orbits, the pocket dimensions and the Reality
Marble on its boss spawn list. So after a registry edit that adds or retiers a boss or a dimension:

```bash
python .minecraft/dev/rosters/external_lists.py                     # the report names what is now missing
python .minecraft/dev/rosters/external_lists.py generate            # rewrite the keys (all three distros)
```

then regenerate the two `expected_state.json` (the configs are a managed root) and commit them with the six configs.
A new dimension needs its Apotheosis values in the policy first (`generate` says which are missing). The pre-push hook
prints the report's summary line; it does not block. `dev/mods/pack_audit.py` counts the same differences.

## How a script asks

```js
icraft.bosses.is(id)                 // the flag `boss` (core.isBoss asks this)
icraft.bosses.has(id, 'x3')          // is the id in that system
icraft.bosses.get(id, 'relic')       // the value that system gets, or null (records are fresh copies)
icraft.bosses.tier(id)   .hp(id)   .kind(id)
icraft.bosses.byTier(2)  .byTier(2, 'rush')  .ids('x3')  .arenas()  .enabled('perKill')
icraft.bosses.canon(id)              // the boss this entity id is (itself, unless `sameAs`)
icraft.bosses.entityIds(id)          // [boss id, its second ids]: the entity types a per-type rule must cover
icraft.bosses.seenAs()               // [{ id, type, class, baseHealth, mainHand }]: core.entityId reads it
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
