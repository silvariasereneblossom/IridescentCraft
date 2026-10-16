---
name: tetra-module-wiring
description: >-
  Author and wire Tetra materials and modules in IridescentCraft the
  footgun-free way: pick the right material home (datapack icraft_tetra_materials,
  icraft_tetra_overrides for another mod's material, the
  iridescent_tetra_expansion jar, or KubeJS perks), write a valid material,
  wire it into modules / variants / schematics / improvements / replacements,
  keep the hammer forge-tier ladder and repairs consistent, add lang keys, and
  deploy via the correct transport. USE THIS SKILL whenever the user wants to add,
  edit or remove a Tetra material, override another mod's material, wire a
  material to a module or add a module variant, add a boss-drop / cm_* material,
  retier a material or touch the hammer ladder, or debug "the material doesn't
  show up", a greyed-out schematic, or an attribute that isn't applying — even if
  they just say "add a tetra material" or "wire the new boss material". The
  single-* attribute trap and the non-atomic-homes trap silently break things,
  so always route Tetra work through here.
---

# Tetra module/material wiring (IridescentCraft)

## Why this is error-prone (read first)

Two traps cause most Tetra breakage:
1. **Four material homes that do NOT sync atomically** (below) — edit one, forget the other, and the roster silently diverges or a material never registers. A datapack material's numbers also feed variants in the jar, so a retier touches two homes (see Retiering).
2. **Silent-failure schemas** — a single `*` attribute prefix drops at runtime; a renamed variant key orphans repairs; a circular `requiredTools` chain dead-locks a whole hammer tier; `replace:true` + directory-prefix material refs greys out a schematic.

## The four material homes + transport (pick the right one)

1. **Datapack, the pack's own materials** — `.minecraft\datapack_sources\icraft_tetra_materials\data\tetra\materials\<category>\*.json` (the base roster: metal / gem / bone / fibre / skin). The game loads the **Paxi zip** `config\paxi\datapacks\icraft_tetra_materials.zip`, not the source tree. `python iridescent-tetra-expansion-mod\tools\zip_paxi_datapack.py icraft_tetra_materials` rebuilds that zip in all three distros at once; nothing else turns the source into the zip (`wsl-build.sh` does not, and `sync-distros.ps1` mirrors and checks `config/paxi/datapacks` across the distros but never builds from the source). Commit the source and the three zips, push. Retiering one is a jar change too (see Retiering).
2. **Datapack, overrides of another mod's material** — `.minecraft\datapack_sources\icraft_tetra_overrides\data\tetra\materials\<category>\<key>.json`, at the jar material's OWN path, `"replace": true`, the jar's file copied whole and then changed; `zip_paxi_datapack.py icraft_tetra_overrides`. The Paxi packs are merged AFTER the mod jars (measured on the rig, pack `7cf262c5`: the pack's partial `metal/netherite.json`, `replace: false`, magic 155, beat Tetra's own 90). Tetra's merge (`MaterialStore.mergeData`): files are taken lowest pack first; a file with `"replace": true` drops everything below it; otherwise `MaterialData.copyFields` copies each field the higher file sets over the lower. Never put such an override in `icraft_tetra_materials`: `gen_per_material_variants.py`, `gen_fill_variant_gaps.py` and `gen_repair_definitions.py` read only that pack, so they would grow armour, book and wand variants for a material that never had any. Here today: the Aetheric Tetranomicon's zanite, gravitite, skyjade, valkyrie and phoenix, the disabled `deep_aether_stratus` (2026-10-16), and the hammer head module overrides.
3. **Compiled mod** — `iridescent-tetra-expansion-mod\src\main\resources\data\tetra\{materials,modules,schematics,improvements,replacements}\**` → built into `iridescent_tetra_expansion-1.0.0.jar` by `./wsl-build.sh` (the three distros; never the live server unless `--live` / `--live-only` is typed, see **custom-jar-release**) → ships through the **custom-jar-release** flow (regen manifest + 3 distro jars + push). **All module wiring, schematics, improvements, replacements, the per-material variants, and the spellbook/armor materials live here.**
4. **KubeJS** — `.minecraft\kubejs\server_scripts\tetra_terramity_perks.js` (functional perk gating, not material defs) → synced by `sync-distros.ps1 -Fix`.

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

### Retiering a datapack material is a jar change too

The expansion jar holds per-material variants DERIVED from an `icraft_tetra_materials` material's numbers: the 12 armour archetypes and the book modules by `tools\gen_per_material_variants.py` (armour multiplier = primary / 5, armour magic capacity = magicCapacity / 12, toughness and knockback by tool level), every other module (minors, wand) by `tools\gen_fill_variant_gaps.py` (the module's iron variant scaled by primary, or by magic for books). **The gap filler never updates a variant that exists**, so after a retier it leaves the old numbers. In order:

1. Edit the material source; `zip_paxi_datapack.py icraft_tetra_materials`.
2. Re-derive the variants of ONLY the retiered materials with both tools' own functions, in place, verify mode first (0 differences before the edit). Helpers: internal `dev\aether-c-2026-10-16\update_variants.py`, `dev\aether-a-2026-10-16\only_frostmaw_variants.py`. Running `gen_per_material_variants.py` whole also reorders the `aspects` / `extract` keys in the book modules against the committed files (no content change): keep only the material's own variants.
3. `./wsl-build.sh` (it stages `libs\tetra.jar` and regenerates `repairs\`), then **custom-jar-release**.

## Conversion-only materials, dead ingredients, removing a material

- **Conversion-only materials** (`icraft_tetra_materials`, ingredient `disable:this`): `fa_mortem`, `fa_tyr`, `fa_draco_arcanus`, `dd_warden`, `bs_pyrope`. They exist so the jar's replacements can turn a mod's armour set into modular armour with its own numbers; nothing can be made of them from scratch. (`diopside` was one, with a dead ingredient; since 2026-10-16 it is a craftable tier-2 gem made from the diopside gem.)
  - Never give one a real ingredient without checking who else claims the item (Tetranomicon, txdacompat and dimasctetracompat claim the Blue Skies gems). The probe internal `dev\aether-c-2026-10-16\zzzz_aetherc_probe.js` (section W) lists, from Tetra's own DataManager on a full-pack boot, every material whose ingredient matches an item and what the sword blade schematic applies. Rhino needs `SchematicRegistry['getSchematic(net.minecraft.resources.ResourceLocation)'](rl)` (the String overload is ambiguous); KubeJS hides `ItemStack.getTag()` from scripts (use `stack.nbt`).
  - Never turn a dead single-`*` attribute into `**` on a material that fills four modules of a piece: it compounds (the Neptune case, +107 % spell power a piece).
  - Their repairs come from `gen_repair_definitions.py` (`MATERIAL_ITEM_MAP`), whose items must exist: three FA lines named items that do not, so converted FA armour could not be repaired until 2026-10-16.
- **An ingredient that names an unknown item does not unload the material.** Tetra logs `Failed to parse item predicate` at DEBUG and keeps it with an invalid ingredient: it cannot be crafted or matched to an item, but module variants, armour replacements and repairs that name it still work (`aether_obsidian` and `aether_neptune`, both removed 2026-10-16, were "dead" only in that sense: the 8 Aether armour replacements used them).
- **Removing a material:** grep the jar resources (`replacements\`, `modules\`, `repairs\`) first, not just the datapack. What goes (the obsidian / Neptune removal, 2026-10-16): the datapack file, the Paxi zip (rebuild it), the module variants that name it, both lang files, its `MATERIAL_ITEM_MAP` line (the build regenerates `repairs\`). Helper: internal `dev\aether-followups-2026-10-16\neptune_remove.py` (byte-faithful rewrite check first).
- **A pack file cannot unload a material another mod's jar defines.** Tetra evaluates `conditions` per file (`mutil` `MergingDataStore.prepare` → `shouldLoad`), so an override whose condition fails is skipped and the jar's file stays. The only lever is a `replace: true` override at the same path in `icraft_tetra_overrides`, with the ingredient pointed at `disable:this` (how `deep_aether_stratus` is disabled).

## Lang keys

- Datapack materials: `.minecraft\kubejs\assets\tetra\lang\en_us.json`. Jar materials: `iridescent-tetra-expansion-mod\src\main\resources\assets\tetra\lang\en_us.json`.
- Convention: `tetra.material.<key>.name` + `tetra.material.<key>.prefix` (and `tetra.improvement.<id>`). A missing key renders the raw `tetra.material.x.name` string in-game — the material still **works**; it's cosmetic only — but ship the key anyway.

## Validate before you ship

- `python3 iridescent-tetra-expansion-mod\tools\audit_modules.py` — structural validation (slot topology, variant/material refs).
- `python3 …\tools\lang_audit.py` and `texture_audit.py` — catch missing lang/texture keys.
- The boss-tetra design doc enumerates ~8 silent-fallthrough failure modes; consult it for batch edits.
- CI builds the jar on every push to `main` that touches the mod (`build-tetra-expansion.yml`). A new compileOnly dependency must go in `tools\ci_libs.json` as well as `wsl-build.sh`'s `stage_lib` list, or CI goes red (see **custom-jar-release**).

## Deploy (by home)

- **Jar resources** (modules / schematics / improvements / replacements / jar materials): `./wsl-build.sh` → then run the **custom-jar-release** cycle (regen manifest, commit 3 jars + 3 manifests, push). See that skill — same flow as any iridescent_* jar.
- **Datapack materials and overrides** (`icraft_tetra_materials`, `icraft_tetra_overrides`): edit under `datapack_sources\…`, `python iridescent-tetra-expansion-mod\tools\zip_paxi_datapack.py <name>` (writes the zip in all three distros; `sync-distros.ps1` then checks they agree), commit the source and the three zips, push, then verify in-game after a re-sync. A retier also needs the jar (see Retiering).
- **KubeJS perks** (`tetra_terramity_perks.js`): edit, `sync-distros.ps1 -Fix`, commit, push.

## Footguns (each has cost a session)

- Single `*` attribute → silent drop. Always `**`.
- Editing jar resources without `./wsl-build.sh` → nothing ships.
- Editing the datapack and jar separately → silent divergence between the two rosters.
- Renaming a variant key without regenerating repairs → unrepairable items (the build does it; a stray hand edit won't).
- `replace:true` + directory-prefix material refs on an improvement schematic → greyed-out / unobtainable (lessons-learned-Tetra 2026-05-30).
- Forgetting the lang key → cosmetic only (raw key shows), but still ship it.
- Retiering a datapack material without re-deriving its jar variants → armour, books and wands keep the old numbers (the gap filler never updates an existing variant).
- Overriding another mod's material in `icraft_tetra_materials` instead of `icraft_tetra_overrides` → the generators grow variants and repairs for it.
- **Running `gen_repair_definitions.py` or `gen_fill_variant_gaps.py` on Windows without `iridescent-tetra-expansion-mod\libs\tetra.jar`** → without Tetra's builtin materials the repair generator wiped and failed to rewrite 213 repairs (wood, stone, wool, bone, …). Run them in WSL (`wsl-build.sh` stages the libs and runs the repair generator itself), or after a WSL build has staged the libs.

## Worked example — add a boss material (jar home)

1. **Material:** `iridescent-tetra-expansion-mod\src\main\resources\data\tetra\materials\metal\cm_newboss.json` — key/category/stat triad, `requiredTools.hammer_dig: "minecraft:diamond"`, `magicCapacity > 0`, `**`-prefixed attributes, `material.items` = the boss-drop item id.
2. **Wire it:** in an existing category it's already covered by the category-wildcard schematic; for a new module add a `variants[]` entry referencing `tetra:metal/cm_newboss` and a matching schematic.
3. **Lang:** add `tetra.material.cm_newboss.name` + `.prefix` to the jar's `assets\tetra\lang\en_us.json`.
4. **Validate:** `python3 tools\audit_modules.py` (and `lang_audit.py`).
5. **Build + ship:** `./wsl-build.sh` (auto-runs `gen_repair_definitions.py`, deploys to the 3 distros, never the live server) → **custom-jar-release** (regen manifest, commit, push).
6. **Test in-game (paste-ready):** give the ingredient, then forge at the Tetra Workbench and confirm the name/stats/repair:
```
/give @s aethersteel:aethersteel_ingot 16
# then craft/forge a modular tool at the Tetra Workbench and apply the material;
# for a boss material, summon/kill the boss to confirm it drops material.items
```
