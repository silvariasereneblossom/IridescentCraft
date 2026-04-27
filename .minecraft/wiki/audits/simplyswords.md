# Simply Swords Audit

**Mod:** Simply Swords
**Items in JEI:** 127 (52 EPIC, 15 RARE, 60 COMMON)
**Audit date:** 2026-04-27
**Verdict:** MEDIUM REWORK — design intent is sound and well-documented, but the recipe-removal list has drifted out of sync with the mod's current item IDs and missed ~17 items that `loot_overhaul.js` now allocates to bosses. The gap means some "boss-only uniques" are still craftable.

## Why this mod is in scope

Simply Swords contributes most of our T2-T4 boss-themed unique weapons (28 weapons mapped to 28 bosses across Twilight, Blue Skies, Aether, Cataclysm, Stalwart, etc.) plus a tier of "runic" entry weapons that intentionally keep recipes as the standard upgrade path from vanilla iron/diamond. Already deeply wired:

- `kubejs/server_scripts/loot/loot_overhaul.js` — Section 8 (lines 962-990) is the master allocation table. 28 weapons assigned to bosses, 11 reserved, 1 explicitly placeholder. Drops at 0.10-0.25 chance.
- `kubejs/server_scripts/recipes/tier_gated_recipes.js` — Section E (lines 203-217) removes recipes for "named uniques" so they're boss-drop-only.
- `kubejs/server_scripts/endgame/mythic_forge.js` — `awakened_lichblade` is the base for the Voidheart Blade Mythic Forge endgame recipe.
- `kubejs/server_scripts/codex_delivery.js` — `runic_grimoire` and `runic_tablet` listed as starter codex items.

## EPIC items (52) by category

### Boss-drop uniques (allocated)
Per `loot_overhaul.js` Section 8, 28 are dropped from specific bosses. T2: `tempest`, `soulrender`, `emberblade`, `whisperwind`, `enigma`, `frostfall`, `icewhisper`, `hiveheart`, `toxic_longsword`, `stars_edge`, `waxweaver`, `thunderbrand`, `caelestis`, `sunfire`, `flamewind`. T3: `brimstone_claymore`, `molten_edge`, `shadowsting`, `livyatan`, `twisted_blade`, `emberlash`, `bramblethorn`, `soulstealer`, `soulpyre`, `soulkeeper`. T4: `waking_lichblade`, `magiblade`, `arcanethyst`, `awakened_lichblade`, `stormbringer`, `watching_warglaive`.

### Boss-drop uniques (unassigned reserve)
11 items reserved per Section 8 comment for future boss mods (NovaBosses, Ultimate Bosses, Ultris, Brutal Bosses): `harbinger`, `hearthflame`, `magiscythe`, `magispear`, `mjolnir`, `ribboncleaver`, `slumbering_lichblade`, `sword_on_a_stick`, `storms_edge`, `watcher_claymore`, `wickpiercer`.

### Lichblade upgrade chain
3-stage progression: `slumbering_lichblade` → `waking_lichblade` (T4 EnderDragon drop) → `awakened_lichblade` (T4 AncientRemnant drop) → Voidheart Blade (Mythic Forge endgame).

### Relic chain
`dormant_relic` (recipe removed) → `righteous_relic`, `tainted_relic`, `decaying_relic` (status: drop-only or upgrade-only per recipe_audit.js comment "relics = true (keep, they're boss-gated naturally)").

### Reagents
`runefused_gem`, `netherfused_gem`, `empowered_remnant`, `contained_remnant`, `tampered_remnant`, `runic_tablet`. Used for upgrade/relic crafting.

### Codex
`runic_tablet` (in codex_delivery.js — T1 starter; EPIC rarity is mod-default, not a balance signal).

### RARE: standard runic weapons (15 total)
`runic_longsword`, `runic_twinblade`, `runic_rapier`, `runic_katana`, `runic_sai`, `runic_spear`, `runic_glaive`, `runic_cutlass`, `runic_claymore`, `runic_chakram`, `runic_greataxe`, `runic_greathammer`, `runic_warglaive`, `runic_scythe`, `runic_halberd`. Per design intent ("Standard weapon types keep recipes"), these keep recipes — they are the T1-T2 entry-tier upgrade from iron/diamond.

## Findings

### Properly gated (no action)

- **Lichblade T4 drops** (`waking_lichblade`, `awakened_lichblade`) — wired into loot_overhaul T4 brackets. Mythic_forge consumes awakened as the Voidheart base, which is exactly the design intent. Greenlit.
- **15 RARE runic weapons** — keep recipes by design as standard upgrade. No issue.
- **Codex starters** (`runic_grimoire`, `runic_tablet`) — handled by `codex_delivery.js`. Greenlit.

### CONCERN — stale recipe-removal IDs (Section E drift)

`tier_gated_recipes.js` Section E removes 29 IDs but at least 7 of them do NOT appear in the current JEI dump:

| Remove-list ID | Current JEI ID | Status |
|----------------|----------------|--------|
| `simplyswords:brimstone` | `brimstone_claymore` | renamed |
| `simplyswords:longsword_of_the_plague` | `toxic_longsword` | renamed |
| `simplyswords:contained_remnants` (plural) | `contained_remnant` (singular) | renamed |
| `simplyswords:tidebreaker` | (not in dump) | removed from mod |
| `simplyswords:runic_edge` | (not in dump) | removed from mod |
| `simplyswords:void_saber` | (not in dump) | removed from mod |
| `simplyswords:searing_light` | (not in dump) | removed from mod |

`event.remove({ output: id })` against a non-existent item is a silent no-op, so currently 7 of the 29 entries do nothing. The 4 renamed ones leave the new-ID recipes intact (the gate is bypassed for those weapons).

**Action:** prune the 7 dead IDs and replace the 4 renamed ones with their current names.

### CONCERN — missing recipe-removal coverage

These items are dropped by bosses in `loot_overhaul.js` but are NOT in the Section E removal list. If any of them have crafting recipes, both gates exist simultaneously:

`whisperwind`, `enigma`, `hiveheart`, `waxweaver`, `tempest`, `caelestis`, `sunfire`, `flamewind`, `shadowsting`, `emberlash`, `bramblethorn`, `soulstealer`, `soulpyre`, `soulkeeper`, `magiblade`, `waking_lichblade`, `awakened_lichblade`.

(`toxic_longsword`, `brimstone_claymore`, `contained_remnant` are also missing but covered by the rename fixes above.)

**Action:** in-game JEI uses-lookup on each. For any with a recipe, add the current ID to Section E. Estimated coverage: 17 items.

### CONCERN — lichblade chain entry point

`slumbering_lichblade` is listed as "unassigned" in Section 8, and there's no recipe-removal entry. If it has a recipe, the entire lichblade chain bypasses the boss-drop gate (acquire slumbering → craft-upgrade through waking → awakened). If it has no recipe, the chain is broken (no entry point).

**Action:** verify slumbering_lichblade source. Either add a removal + a T2-tier loot entry to bridge into the chain, OR confirm it's already drop-only and document where.

### CONCERN — relic chain partial coverage

Only `dormant_relic` is in the Section E removal list. `righteous_relic`, `tainted_relic`, `decaying_relic` are not removed but `recipe_audit.js` line 197 comments "relics = true (keep, they're boss-gated naturally)" — suggesting they're already drop-only natively.

**Action:** verify in JEI. If they have recipes, add to Section E. If not, the recipe_audit comment is correct.

### CONCERN — reagent gems sourcing

`runefused_gem`, `netherfused_gem`, `empowered_remnant`, `tampered_remnant` (plus the renamed `contained_remnant`) — these are upgrade reagents but their sourcing isn't audited in our scripts. If they have over-world ore or smelting recipes, they may be acquirable below their EPIC tier.

**Action:** JEI uses-lookup. Likely fine (mod's own balance) but worth one-minute verification.

### Items not currently touched by gates

The 11 "unassigned" boss-drop weapons (harbinger, hearthflame, magiscythe, magispear, mjolnir, ribboncleaver, slumbering_lichblade, sword_on_a_stick, storms_edge, watcher_claymore, wickpiercer) are intentionally pool-reserved. Out of those, `mjolnir`, `storms_edge`, `watcher_claymore`, `sword_on_a_stick` ARE in the recipe-removal list — so they're correctly gated to "creative or future-boss-drop only." The other 7 (`harbinger`, `hearthflame`, `magiscythe`, `magispear`, `ribboncleaver`, `slumbering_lichblade`, `wickpiercer`) are not in the removal list — if they have recipes, they leak.

### Standouts

- **`magiscythe`, `magispear`, `magiblade`, `caelestis`** — naming pattern suggests a "magi-" themed set; only `magiblade` and `caelestis` are boss-allocated. The other two `magi-` items are unassigned. Consider unifying as a single endgame magi-set drop pool.
- **`harbinger`** the weapon is unassigned, but `cataclysm:the_harbinger` the boss already drops `simplyswords:shadowsting`. Tempting to also drop `simplyswords:harbinger` for thematic match — would require tier check (T3-T4 ratio).
- **`mjolnir`** is in the removal list and unassigned — currently a creative-only "ghost item." Worth assigning to a Norse-themed boss (Vanilla Wither Storm? Twilight Lich? Add to whoever fits).

## Recommended actions (priority order)

1. **(rewrite Section E)** Refresh the recipe-removal list. Drop 7 stale IDs, rename 4, add ~17 boss-allocated items, plus optionally the 7 unassigned-without-removal items. Estimated final list: ~38 entries.
2. **(verify in JEI)** Lichblade slumbering source, relic chain (3 items), reagent gems (5 items). 9-item spot check.
3. **(design)** Decide whether the 7 currently-unprotected unassigned weapons (harbinger, hearthflame, magiscythe, magispear, ribboncleaver, slumbering_lichblade, wickpiercer) should be added to Section E now (creative-only until assigned) or left craftable as "freebie weapons until we wire bosses."
4. **(future)** When NovaBosses / Ultimate Bosses / Brutal Bosses get integrated, allocate the 11 reserved weapons to specific bosses per the Section 8 plan.

## Existing coverage map

| File | What it does | Simply Swords hits |
|------|--------------|---------------:|
| `loot/loot_overhaul.js` | T2-T4 boss drops | 28 weapons, 1 placeholder |
| `recipes/tier_gated_recipes.js` (Section E) | Recipe removal | 29 entries (7 stale, 4 renamed, 18 valid) |
| `endgame/mythic_forge.js` | Voidheart Blade base | 1 (awakened_lichblade) |
| `codex_delivery.js` | Codex items | 2 (runic_grimoire, runic_tablet) |
| `recipes/recipe_audit.js` | Relic-keep comment | 1 reference |

Total: ~62 simplyswords references across `server_scripts/`. Coverage is dense but stale.
