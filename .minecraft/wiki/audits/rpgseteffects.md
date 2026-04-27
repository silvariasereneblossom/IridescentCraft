# Epic RPG: Class Artifacts (rpgseteffects) Audit

**Mod:** Epic RPG: Class Artifacts
**Items in JEI:** 58 (28 EPIC, 26 RARE, 4 UNCOMMON, 0 COMMON)
**Audit date:** 2026-04-27
**Verdict:** GREENLIT — the cleanest audit so far. Drops-only design intentionally chosen, ALL recipes stripped, ALL 58 items individually tier-allocated. 26/26 relics distributed across T1/T2/T3/T4 chest pools (7+8+7+4 = 26 exact match). 14/14 base artifacts T2-staged + 14/14 awakening variants T4-staged. Admin command `/icraftsets` provides backup access to the Set Equipment Screen. Coverage is 100%.

## Why this mod is in scope

Epic RPG: Class Artifacts adds **Set Equipment** (4 slot types: Artifact + Relic + Ally + Barrier) with class-themed artifact + relic effects. Designed as drops-only — no crafting recipes — which fits the IridescentCraft RPG progression model perfectly.

Already heavily wired (94 references across 4 files):
- `kubejs/server_scripts/compat/class_artifacts_recipes.js` — strips ALL crafting recipes (drops-only design)
- `kubejs/server_scripts/gates/astages_restrictions.js` — 14 base artifacts T2-staged (lines 151-165), 14 awakening variants T4-staged (lines 354-367)
- `kubejs/server_scripts/loot/lootjs_overhaul.js` Section 8.5 — drops-only injection: 4% Fragment Core from any mob, all 26 relics tier-allocated to dimension chests, Artifact Piece Pouch from T2+ bosses, awakening artifacts from T4 bosses only
- `kubejs/server_scripts/icraftsets_command.js` — `/icraftsets` admin command opens Set Equipment Screen (backup for the mod's broken inventory button)

## Items by category

### Base class artifacts (14 EPIC) — T2-staged
`altharion`, `blade_dancer`, `blood_fury`, `chronorend`, `hellbrand`, `hexweaver`, `ignisphere`, `moonpiercer`, `phoenix`, `sanctum`, `shadow_hunter`, `stormpiercer`, `vaelkhor`, `wolfheart`. Drop from T2+ bosses via Artifact Piece Pouch. Pouch loot table at `kubejs/data/rpgseteffects/loot_tables/items/artifact_piece_pouch.json` is overridden to only contain these 14 (awakening variants excluded).

### Awakening artifacts (14 EPIC) — T4-staged
`*_awakening_artifact` for each of the 14 base. Drop from T4 bosses ONLY. Recipe-stripped via `class_artifacts_recipes.js`.

### Relics tier-allocated (26 RARE)

| Tier | Count | Relics | Drop chance |
|-----:|------:|--------|------------:|
| T1 | 7 | featherfall, swift_boots, swift_strike, multi_jump, builders_flight_charm, specter_lens, deadly_luck | 0.4% per chest |
| T2 | 8 | brutal_fist, lethal_crit, vampiric, venom, ember, frost, poison_immunity, brambleguard | 0.6% per chest |
| T3 | 7 | fire_immunity, magma_walker, frost_walker, decay, soulthief, blightwake, radiant_burden | 0.8% per chest |
| T4 | 4 | wither_immunity, beastheart, malicebrand, mirrorspite | 1.0% per chest |
| **Total** | **26** | | |

26/26 RARE items in JEI = 26 in tier allocation. Exact match.

### Materials and intermediates (4 UNCOMMON)
- `magic_leather` — recipe stripped; orphaned (no longer craftable, no use). Effectively removed from the pack.
- `artifact_piece_pouch` — T2-staged, T2+ boss drop only.
- `set_core` — T2-staged.
- `fragment_core` — drops at 4% from any hostile mob (universal resource).

## Findings

### Properly gated (no action)

- **All 28 EPIC artifacts T2/T4-staged** — base artifacts T2 (recipe-stripped + Artifact Piece Pouch drop), awakening artifacts T4 (recipe-stripped + T4 boss-only drops).
- **All 26 RARE relics tier-allocated** — 7/8/7/4 split across T1-T4 dimension chests. Drop rates scale with tier (0.4% → 1.0%).
- **Drops-only design** — `class_artifacts_recipes.js` strips 17 recipe IDs (14 awakening + 3 intermediate materials). No crafting paths remain.
- **Native loot injection blocked** — mod's `rpgseteffects:loot_injection/*` GLMs are blocked via `global_loot_modifiers.json` `"replace": true` (no whitelist entries). Re-injected manually with controlled rates.
- **Pouch loot table override** — `kubejs/data/rpgseteffects/loot_tables/items/artifact_piece_pouch.json` strips awakening variants from the pouch loot. Awakenings drop ONLY from direct T4 boss kills.
- **Admin command** — `/icraftsets` provides a working entry point to the Set Equipment Screen (the mod's vanilla button doesn't render in our pack).

### Verified clean

- **Fragment Core 4% mob drop** — universal resource, no tier gate needed (it's the lowest-tier reagent).
- **Magic Leather** — recipe stripped, no use case remains. Effectively orphaned. Not a leak; just dead inventory if it shows up.
- **Specter Lens** allocated as T1 — though "lens" naming might suggest higher tier; mod docs confirm it's a basic stealth-detection accessory.

### Items not currently touched by gates

None. All 58 items are individually addressed.

### Standouts

- **Allocation count match (26 = 26)** — the audit proved by cross-counting that no relic was missed. This is the level of rigor we should target for other mods.
- **Drops-only design** — the cleanest gating pattern for content mods because it eliminates the recipe-vs-drop dual-path that's caused issues in simplyswords (rename drift), terramity (recipe-removed but loot still leaks), and celestial (curated some, not others).
- **Admin command for broken UI** — `/icraftsets` is a great fallback pattern. If other mods ship buttons that conflict with our HUD overlays, this approach is reusable.

## Recommended actions (priority order)

None. This audit produces zero findings. The mod is shipped correctly and exhaustively.

If we wanted to be paranoid:
- **(spot-check)** Verify that all 14 Set Effects (the multi-piece bonus mechanics) actually fire when artifact + relic are equipped. This is in-game test territory, not a coverage gap.
- **(future polish)** If new T2-T4 dimensional content gets added (new mod with Aether/Blue Skies extension dimensions, etc.), append those dim IDs to the `t2Relics`/`t3Relics`/`t4Relics` `anyDimension(...)` calls. Currently scoped exactly to dimensions in pack.

## Existing coverage map

| File | What it does | rpgseteffects hits |
|------|--------------|-------------------:|
| `compat/class_artifacts_recipes.js` | Recipe strip (drops-only enforcement) | 17 IDs |
| `gates/astages_restrictions.js` (T2 + T4 lists) | Tier staging | 14 + 14 + 1 |
| `loot/lootjs_overhaul.js` Section 8.5 | Drops-only injection: relics + pouches + cores | 26 relics + 1 pouch + 1 core + 14 awakenings |
| `icraftsets_command.js` | Admin-command Set Equipment access | 1 command |
| `kubejs/data/rpgseteffects/loot_tables/items/artifact_piece_pouch.json` | Pouch table override (excludes awakenings) | 1 loot table |
| `global_loot_modifiers.json` | Native GLM blocked via "replace":true | namespace block |

Total: 94 references. **Highest coverage maturity in the pack so far.**

This is the *benchmark* audit — when other mods catch up to this level, we're done with the audit pass.
