# Per-Mod Item Audits

<!-- INTERNAL ONLY -->

Fine-toothed-comb balance review of every modded item in IridescentCraft. Goal: identify items untouched by gates, weird sourcing, balance issues, items needing buffs, recipe changes, design-framework alignment, and interesting/problematic standouts. Organized by mod.

This index is internal-only — never mirror to the public wiki. Individual audit files live alongside it under `wiki/audits/<modid>.md`.

## Source data

- **JEI dump:** `TesterLogs/Item Audit/all_items.tsv` (30,173 items, 168 mods, columns: namespace, id, display_name, rarity, max_stack)
- **Capture method:** `kubejs/server_scripts/dump_items.js` runs once per server start with `[ITEM_DUMP]` prefix to `kubejs-server.log`. `server_distribution/extract_item_dump.ps1` post-processes the log into TSV.
- **Refresh:** rerun the server with the dump script enabled when major mod updates land. The flag `dumpRan` and the existing-tsv check prevent re-dumps on `/reload`.

## Audit framework

Each audit file follows this template:

```
# <Mod Name> Audit
**Mod:**           <full name>
**Items in JEI:**  <total> (<EPIC count> EPIC, <RARE>, <UNCOMMON>, <COMMON>)
**Audit date:**    YYYY-MM-DD
**Verdict:**       LIGHT POLISH | MEDIUM REWORK | HEAVY POLISH | LARGE REWORK

## Why this mod is in scope
<scope reasoning + existing wired files>

## EPIC items by category
<grouped breakdown>

## Findings
### Properly gated (no action)
### Verified clean (one-line each)
### CONCERN — <specific issue>
### Items not currently touched by gates
### Standouts

## Recommended actions (priority order)
1. ...

## Existing coverage map
| File | What it does | <Mod> hits |
```

**Verdict scale:**
- **GREENLIT** — 100% coverage; zero findings; benchmark for other audits
- **LIGHT POLISH** — design is sound, 1-3 small spot-checks
- **MEDIUM POLISH** — coverage drift or gaps; ~10-30 items need touching
- **MEDIUM REWORK** — coverage exists but missing/broken pieces (e.g., undeployed datapack)
- **HEAVY POLISH** — half the mod is well-handled, half is unhandled (cataclysm/terramity split pattern)
- **LARGE REWORK** — most items leak; gates need rebuilding

## Status — completed

| # | Mod | Verdict | Date | Key finding |
|---|-----|---------|------|-------------|
| 1 | [cataclysm](cataclysm.md) | LIGHT POLISH | 2026-04-27 | Materials sourcing chain to verify |
| 2 | [simplyswords](simplyswords.md) | MEDIUM REWORK | 2026-04-27 | 7 stale removal IDs + 4 renames + ~17 missing IDs in `tier_gated_recipes.js` Section E |
| 3 | [terramity](terramity.md) | HEAVY POLISH | 2026-04-27 | Gun strip is gold-standard; ~15 EPIC curios/non-gun weapons completely ungated |
| 4 | [forbidden_arcanus](forbidden_arcanus.md) | LIGHT POLISH | 2026-04-27 | Transitive gating via Hephaestus Forge + Arcane Crystal is the most leveraged pattern in the pack; ~7 items need spot-checks |
| 5 | [theabyss](theabyss.md) | MEDIUM POLISH | 2026-04-27 | Most-wired mod in pack (118 refs across 16 files); singular/plural drift on `ring_of_ghost`(s); ~12 EPIC totems/trophies/reagents need spot-checks |
| 6 | [celestial_artifacts](celestial_artifacts.md) | MEDIUM POLISH | 2026-04-27 | 16 EPIC curios half-allocated to T2/T4 pools; 14 EPIC + 32 chat-color items outside gating; potential duplicate-curio stacking with Artifacts mod |
| 7 | [botania](botania.md) | LIGHT POLISH | 2026-04-27 | Cleanest tier model in the pack (mana→manasteel→terrasteel→elementium→gaia); Orechid datapack covers tier-skip; main concern is `spawner_mover` dupe-vector check |
| 8 | [occultism](occultism.md) | **MEDIUM REWORK** | 2026-04-27 | **CRITICAL: dimensional miners ungated** — `recipe_audit.js:137` TODO never closed, `icraft_occultism_overrides` datapack does not exist. Players can craft a Djinni miner at T2 and get diamonds without entering Nether. Highest-priority fix in audit pass so far. |
| 9 | [rpgseteffects](rpgseteffects.md) | **GREENLIT** | 2026-04-27 | Cleanest audit so far — drops-only design, 100% coverage (28 EPIC + 26 RARE + 4 UNCOMMON all individually allocated). Benchmark audit; zero findings. |

## Status — priority queue

Order chosen by design-surface weight (heaviest first). Adjust based on what surfaces in earlier audits.

1. **mekanism** + **ad_astra** — tech tree pair (audit together)
3. **ars_nouveau, irons_spellbooks** — magic mods
4. **alexsmobs, twilightforest, blue_skies, aether** — boss mods
5. **all remaining** — sweep pass for the long tail (~140 mods)

## Cross-cutting findings

Findings that span multiple mods and warrant their own remediation, separate from per-mod work:

### A. Recipe-removal ID drift
Identified in simplyswords. Section E in `tier_gated_recipes.js` and similar lists may have stale IDs that silently no-op. Worth a one-time sweep: collect every `event.remove({output: 'mod:id'})` call across `recipes/*.js`, validate every ID against the JEI dump, report stale/renamed entries.

### B. Three-layer gate pattern
Terramity's gun strip is the cleanest model in the pack — `recipes/recipe_audit.js` (recipe removal) + `loot/lootjs_overhaul.js` (chest+entity loot strip) + Apotheosis config (enchant disable). When future audits surface "doesn't-fit-the-pack" content, replicate this triple-lock.

### B2. Transitive (chokepoint) gating
Forbidden Arcanus's Hephaestus Forge + Arcane Crystal pattern is the *most efficient* gating model — gate one or two chokepoints (workstations or required reagents) and dozens of downstream items inherit the gate without per-item flags. When auditing a mod with a clear progression chokepoint (workbench, station, key reagent), prefer this over per-item lists.

### C. Mod uses non-vanilla rarity
Forbidden Arcanus surfaced an oddity: zero EPIC items in JEI despite having endgame content, because the mod uses its own internal Soul/Aureal tier system rather than vanilla `Rarity`. Other "magic mod" audits should expect this pattern. Any future "rarity-based" sweeps (loot strips, filters, balance heuristics) need to NOT rely on the rarity column alone — verify against the gating chain instead.

### C. Audit cadence
Each audit is ~120-200 lines and consumes meaningful context per session. Pace at 2-4 audits per session. Some big mods (botania, mekanism+ad_astra, forbidden_arcanus) probably warrant their own session.

## Workflow

1. Pull subset: `awk -F'\t' '$1=="<modid>"' "TesterLogs/Item Audit/all_items.tsv"`
2. Find existing references: `grep -rln "<modid>" kubejs/server_scripts/`
3. Categorize EPIC items, then RARE, then UNCOMMON
4. Cross-check each EPIC against existing recipe-removal lists, loot allocation tables, and ascension/codex/mythic_forge references
5. Write the report; commit + push (audits are internal but live in the IridescentCraft repo)
6. Update this README's status table

## See also

- [FINDINGS.md](FINDINGS.md) — consolidated actionable findings tracker (P0/P1/P2/P3 priority list, fix-plan source)
- `wiki/dev/lessons-learned.md` — postmortem log (also internal-only)
- `wiki/design/master.md` — canonical design doc (sourcing reference)
