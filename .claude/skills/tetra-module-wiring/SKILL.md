---
name: tetra-module-wiring
description: >-
  Author and wire Tetra materials and modules in IridescentCraft the
  footgun-free way: pick the right material home (datapack icraft_tetra_materials
  vs the iridescent_tetra_expansion jar vs KubeJS perks), write a valid material,
  wire it into modules / variants / schematics / improvements / replacements,
  keep the hammer forge-tier ladder and repairs consistent, add lang keys, and
  deploy via the correct transport. USE THIS SKILL whenever the user wants to add
  or edit a Tetra material, wire a material to a module or add a module variant,
  add a boss-drop / cm_* material, retier a material or touch the hammer ladder,
  or debug "the material doesn't show up", a greyed-out schematic, or an attribute
  that isn't applying — even if they just say "add a tetra material" or "wire the
  new boss material". The single-* attribute trap and the three-non-atomic-homes
  trap silently break things, so always route Tetra work through here.
---

# Tetra module/material wiring (IridescentCraft)

## Why this is error-prone (read first)

Two traps cause most Tetra breakage:
1. **Three material homes that do NOT sync atomically** (below) — edit one, forget the other, and the roster silently diverges or a material never registers.
2. **Silent-failure schemas** — a single `*` attribute prefix drops at runtime; a renamed variant key orphans repairs; a circular `requiredTools` chain dead-locks a whole hammer tier; `replace:true` + directory-prefix material refs greys out a schematic.

## The three material homes + transport (pick the right one)

1. **Datapack** — `.minecraft\datapack_sources\icraft_tetra_materials\data\tetra\materials\<category>\*.json` (the base roster: metal / gem / bone / fibre / skin). Delivered via **Paxi** under `.minecraft\paxi\datapacks\`. NOT watched by `sync-distros.ps1` (which only mirrors kubejs scripts); it lives in `.minecraft\` and is committed/deployed with the repo. After editing the source, propagate to the Paxi datapack location the way the pack already builds it, commit the `.minecraft\` change, and push.
2. **Compiled mod** — `iridescent-tetra-expansion-mod\src\main\resources\data\tetra\{materials,modules,schematics,improvements,replacements}\**` → built into `iridescent_tetra_expansion-1.0.0.jar` by `./wsl-build.sh` → ships through the **custom-jar-release** flow (regen manifest + 3 distro jars + push). **All module wiring, schematics, improvements, replacements, and the spellbook/armor materials live here.**
3. **KubeJS** — `.minecraft\kubejs\server_scripts\tetra_terramity_perks.js` (functional perk gating, not material defs) → synced by `sync-distros.ps1 -Fix`.

⇒ Identify which home you touched; that dictates the deploy. **Editing the jar's resources without `./wsl-build.sh` ships nothing** (the jar is unchanged). Editing the datapack but not the jar (or vice-versa) silently diverges.

## Material schema (real — `…\materials\metal\aethersteel.json`)

```json
{
  "key": "aethersteel",
  "category": "metal",
  "primary": 8.5,
  "secondary": 3.2,
  "tertiary": 4.5,
  "durability": 2500,
  "integrityCost": 4,
  "integrityGain": 12,
  "magicCapacity": 210,
  "toolLevel": "minecraft:netherite",
  "toolEfficiency": 11,
  "tints": { "glyph": "7ad6e8", "texture": "7ad6e8" },
  "textures": ["shiny", "heavy", "metal"],
  "material": { "items": ["aethersteel:aethersteel_ingot"] },
  "requiredTools": { "hammer_dig": 7 },
  "attributes": {
    "**irons_spellbooks:spell_power": 0.1,
    "**irons_spellbooks:max_mana": 0.1
  }
}
```

- `key` / `category` (`metal|gem|bone|fibre|skin|fabric|…`); `primary/secondary/tertiary` stat triad; `durability`; `integrityCost`/`integrityGain`; `magicCapacity` (**> 0 required to occupy a major-module slot**); `toolLevel`; `toolEfficiency`; `requiredTools.hammer_dig` (the forge-tier gate — integer or `minecraft:<tier>`); `tints.{glyph,texture}`; `textures[]`; `material.items[]` (the ingredient that IS the material).
- **`attributes` MUST use `**` (MULTIPLY_TOTAL), never a single `*`.** A lone `*` (MULTIPLY_BASE with no ADDITION sibling) silently drops at runtime — this bit 7 ISS materials (task #38).

## Module wiring (materials → modules → variants → schematics → improvements → replacements)

All under `iridescent-tetra-expansion-mod\src\main\resources\data\tetra\`:

- **Module variant** binds a material — in `modules\<type>\<module>.json`, each `variants[]` entry lists `"materials": ["tetra:<category>/<key>"]` plus an `extract` stat block:
  ```json
  { "materials": ["tetra:metal/aethersteel"], "key": "front_cover/",
    "extract": { "primaryAttributes": { "**ars_nouveau:ars_nouveau.perk.spell_damage": 0.0105 },
                 "integrity": 0, "magicCapacity": 8 } }
  ```
- **Schematic** (workbench recipe) aggregates by **category wildcard** — `schematics\<module>\<name>.json`:
  ```json
  { "slots": ["ars_book/front_cover"], "materialSlotCount": 1, "displayType": "major",
    "outcomes": [ { "materials": ["tetra:metal/", "tetra:gem/", "tetra:bone/", "tetra:skin/"],
                    "moduleKey": "ars_book/front_cover", "moduleVariant": "front_cover/" } ] }
  ```
  A new material in an existing category is picked up by the wildcard automatically; a new module needs its own schematic.
- **Improvement** — stat bonus keyed by id+level (`improvements\…\<id>.json`): `[ { "key": "ars_book_lining_fabric", "level": 1, "attributes": { "**irons_spellbooks:mana_regen": 0.02 } } ]`.
- **Replacement** — converts a vanilla/mod item into preset modular gear (`replacements\<item>.json`): predicate → `item` + a `modules` map of `slot: [module, module/material]`.
- **Repairs** are per-variant. After adding/renaming a variant key, regenerate with `python3 tools\gen_repair_definitions.py` — **`./wsl-build.sh` runs this automatically** before gradle, so a normal build keeps repairs in sync; a hand edit that skips the build will orphan them.

## The hammer / forge-tier ladder (retiering)

Ladder: `wood/stone → iron/copper → blackstone → diamond (the bridge) → obsidian → netherite → aethersteel` (terminal, `hammer_dig: 7`). A material's `requiredTools.hammer_dig` sets which hammer head can forge it. **Circular-lock hazard:** the diamond head was dead (category mismatch), which locked obsidian → netherite → aethersteel; the diamond-bridge fix (design-evolution 2026-06-02) unlocked the top. Head overrides live under `…\icraft_tetra_overrides\…\double\basic_hammer.json`.

- **Boss-only set (#58, refight-to-repair):** `cm_ignitium`, `cm_cursium`, `cm_witherite`, `cm_ender_guard` (Cataclysm bosses), `requiredTools.hammer_dig: "minecraft:diamond"`, `magicCapacity > 0`. **Lucifer is EXCLUDED** (pure progression capstone). Full spec: `IridescentCraft-internal\design\boss-tetra-and-structure-loot-scope.md`. Tiering rationale: `IridescentCraft-internal\design\design-evolution.md`.

## Lang keys

- Datapack materials: `.minecraft\kubejs\assets\tetra\lang\en_us.json`. Jar materials: `iridescent-tetra-expansion-mod\src\main\resources\assets\tetra\lang\en_us.json`.
- Convention: `tetra.material.<key>.name` + `tetra.material.<key>.prefix` (and `tetra.improvement.<id>`). A missing key renders the raw `tetra.material.x.name` string in-game — the material still **works**; it's cosmetic only — but ship the key anyway.

## Validate before you ship

- `python3 iridescent-tetra-expansion-mod\tools\audit_modules.py` — structural validation (slot topology, variant/material refs).
- `python3 …\tools\lang_audit.py` and `texture_audit.py` — catch missing lang/texture keys.
- The boss-tetra design doc enumerates ~8 silent-fallthrough failure modes; consult it for batch edits.

## Deploy (by home)

- **Jar resources** (modules / schematics / improvements / replacements / jar materials): `./wsl-build.sh` → then run the **custom-jar-release** cycle (regen manifest, commit 3 jars + 3 manifests, push). See that skill — same flow as any iridescent_* jar.
- **Datapack materials** (`icraft_tetra_materials`): edit under `datapack_sources\…`, propagate to the Paxi datapack artifact (NOT handled by `sync-distros.ps1`), commit the `.minecraft\` change across distros, push, then verify in-game after a re-sync.
- **KubeJS perks** (`tetra_terramity_perks.js`): edit, `sync-distros.ps1 -Fix`, commit, push.

## Footguns (each has cost a session)

- Single `*` attribute → silent drop. Always `**`.
- Editing jar resources without `./wsl-build.sh` → nothing ships.
- Editing the datapack and jar separately → silent divergence between the two rosters.
- Renaming a variant key without regenerating repairs → unrepairable items (the build does it; a stray hand edit won't).
- `replace:true` + directory-prefix material refs on an improvement schematic → greyed-out / unobtainable (lessons-learned-Tetra 2026-05-30).
- Forgetting the lang key → cosmetic only (raw key shows), but still ship it.

## Worked example — add a boss material (jar home)

1. **Material:** `iridescent-tetra-expansion-mod\src\main\resources\data\tetra\materials\metal\cm_newboss.json` — key/category/stat triad, `requiredTools.hammer_dig: "minecraft:diamond"`, `magicCapacity > 0`, `**`-prefixed attributes, `material.items` = the boss-drop item id.
2. **Wire it:** in an existing category it's already covered by the category-wildcard schematic; for a new module add a `variants[]` entry referencing `tetra:metal/cm_newboss` and a matching schematic.
3. **Lang:** add `tetra.material.cm_newboss.name` + `.prefix` to the jar's `assets\tetra\lang\en_us.json`.
4. **Validate:** `python3 tools\audit_modules.py` (and `lang_audit.py`).
5. **Build + ship:** `./wsl-build.sh` (auto-runs `gen_repair_definitions.py`, deploys to 3 distros) → **custom-jar-release** (regen manifest, commit, push).
6. **Test in-game (paste-ready):** give the ingredient, then forge at the Tetra Workbench and confirm the name/stats/repair:
```
/give @s aethersteel:aethersteel_ingot 16
# then craft/forge a modular tool at the Tetra Workbench and apply the material;
# for a boss material, summon/kill the boss to confirm it drops material.items
```
