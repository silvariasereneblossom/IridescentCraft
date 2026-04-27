# Per-Mod Audit — Comprehensive Fix Plan

<!-- INTERNAL ONLY -->

Source data: [FINDINGS.md](FINDINGS.md) (43 findings) + 13 audit reports.

This plan sequences the work into 8 phases. Each phase is a deliverable unit — sized to fit a single session, focused on a coherent theme, and committable as 1-3 PRs. Phases 1-2 are the highest-impact fixes; phases 3-5 are coverage closure; phases 6-8 are verification + cleanup + process.

**Total scope:** ~155 items affected across the audit. Estimated 4-6 sessions to complete (see effort breakdown per phase).

## Sequencing principles

1. **Ship integrity-blockers first** — anything that lets players bypass progression goes before polish work.
2. **Bundle by similarity** — chest-pool additions ship together, recipe-list refreshes ship together, etc. Avoid scattered touches across many files in the same week.
3. **Verifications batch** — all "JEI spot-check" findings hold until a single in-game session can rip through them. Don't half-fix in the dark.
4. **Process changes ship last** — the validator scripts close the loop so future audits don't repeat these surprises, but they don't fix anything that's currently broken.
5. **No design-pending items leak in** — anything needing user decision (P3 design items, ambiguous tier assignments) is flagged distinctly, not hidden in a phase.

---

## Phase 1 — P0 CRITICAL: occultism miners (1 deliverable)

**Goal:** close the largest tier-skip vector in the pack.
**Estimated effort:** 1-2 hours.
**Blocks:** any "alpha tester ready to play" claim — current state lets a T2 player get diamonds without entering the Nether.

### 1.1 Create `icraft_occultism_overrides` datapack

Mirror the `icraft_botania_overrides` pattern. Directory structure:

```
datapack_sources/icraft_occultism_overrides/
├── pack.mcmeta
└── data/
    └── occultism/
        └── recipes/
            └── miners/
                ├── miner_foliot_unspecialized.json   (Foliot — strip nothing, T1-tier)
                ├── miner_djinni_ores.json            (Djinni — strip diamond, ancient_debris)
                ├── miner_afrit_deeps.json            (Afrit — strip ancient_debris, netherite_scrap)
                └── miner_marid_master.json           (Marid — strip nothing if T4 native, but verify dimension scope)
```

For each miner, override the result loot table to either:
- **(simpler)** Strip diamond/ancient_debris/netherite_scrap from the result list entirely
- **(richer)** Replace with a tier-appropriate result table (Foliot → iron/copper/coal; Djinni → adds diamond if dimension is Nether-or-higher; etc.)

Pick the simpler approach for v1; the richer version can come later if simple feels too restrictive.

### 1.2 Update `recipe_audit.js:137` comment

Replace the TODO with a confirming comment that points to the datapack:

```javascript
// E.4: Occultism Ritual Miners — handled via datapack
// See datapack_sources/icraft_occultism_overrides/data/occultism/recipes/miners/
// Strips T3+ ores from miner result tables, preventing dimension-skip.
```

### 1.3 Test in-game

- Spawn each miner via `/give`
- Verify result tables exclude the stripped ores
- Confirm Foliot still works for basic ores (we don't want to break the mod entirely)

### Deliverable

1 PR: "occultism: close miner tier-skip via override datapack."

---

## Phase 2 — P1 CRITICAL: 3 ungated content mods (~85 items)

**Goal:** wire the 3 mods that shipped without any gating.
**Estimated effort:** 4-6 hours total (split across the 3 mods).
**Order matters — do moreartifacts first (mechanically simplest), then too_many_bows (needs theme→tier mapping), then art_of_forging (needs recipe verification).**

### 2.1 moreartifacts (32 items, mechanical)

Mirror the existing `lootjs_overhaul.js` artifacts/relics/celestial chest pools. Allocate the 11 EPIC + 21 RARE items by mod-internal theming:

- **T1** chest pool (Overworld): `lucky_emerald_ring`, `melody_plushie`, low-tier scarves/hats
- **T2** chest pool (Twilight/Aether/BS): `vanir_mask`, `tainted_mirror`, `hero_shield`, `ankh_charm`, `ankh_shield`
- **T3** chest pool (Nether/Undergarden): TBD — review the RARE items for T3-themed
- **T4** chest pool (End/Deeper Darker/Abyss): `ender_dragon_claw`, `dragon_eye`, `enderian_treads`, `sculk_treads`

**Deliverable:** add ~32 LootEntry lines to `lootjs_overhaul.js` Section 1 pools.

### 2.2 too_many_bows (31 items, theme mapping required)

14 EPIC bows + 4 reagents. Theme→tier mapping (refine in design pass):

- **T2 chest/boss pool**: `frostbite`, `tidal_bow`, `verdant_viper`
- **T3 chest/boss pool**: `arcane_bow`, `ancient_sage_bow`, `auroras_grace`, `crimson_nexus`, `necro_flame_bow`
- **T4 chest/boss pool**: `dragons_breath`, `astral_bound`, `spectral_whisper`, `shulker_blast`, `arc_heavens`, `twin_shadows`
- **Reagents**: `cursed_stone` (T2-T3), `soul_fragment` (T2-T3), `rift_shard` (rename to avoid collision), `power_crystal` (T3-T4)

**Sub-task: rift_shard collision — locked to OPTION B (strip + rename).**

Tasks (do in order to avoid breakage):
1. Strip `too_many_bows:rift_shard` from chest loot via lootjs (likely just a `removeLoot` call where the mod's GLM injects)
2. Add rename mapping: `kubejs:rift_shard` → `kubejs:icraft_rift_shard`
3. Update all references in `endgame/rift_mechanics.js`, `endgame/ascension.js`, `loot/lootjs_overhaul.js`
4. Add a one-time KubeJS migration: on player login, convert any old `kubejs:rift_shard` items in inventory/Ender Chest to the new ID (avoids destroying tester progress)

**Deliverable:** ~18 LootEntry additions + rift_shard rename across the endgame stack.

### 2.3 art_of_forging (22 items, recipe verification required)

Multi-tier weapon ladder + ritual progression. Per-item review needed.

**Step 1: JEI uses-lookup in-game.** For each item, document:
- Does it have a crafting recipe?
- What ingredients?
- What tier-equivalent?

**Step 2: Apply gating per item:**
- **Ancient weapons (3)** → T2 (mid-tier base)
  - If recipe-craftable: stage at T2
  - If boss-drop only: native loot, no action
- **Demonic weapons (3)** → T4 endgame
  - Likely upgrade-craftable from Ancient + reagents
  - Stage upgrade ingredients at T3-T4 to gate access
- **`devils_soul_gem`, `sigil_of_eden`, `enigmatic_construct`** → T3 (mid-game ritual reagents)
- **Rending scissor chain (red → purple → complete)** → review per piece; likely T3-T4 progression
- **`mark_of_the_architect`** → lore/quest item; verify acquisition path

**Deliverable:** stage list updates in `astages_restrictions.js` + (if needed) recipe overrides in `tier_gated_recipes.js`.

### Deliverable

3 PRs (1 per mod) or 1 bundled "P1 ungated content closure" PR. Recommend 1 bundled PR — the changes are coordinated and easier to review together.

---

## Phase 3 — P1 RECIPE DRIFT: refresh removal lists + add validator

**Goal:** fix simplyswords' Section E drift, theabyss singular/plural drift, and prevent recurrence.
**Estimated effort:** 2-3 hours.

### 3.1 Refresh simplyswords Section E

In `tier_gated_recipes.js` Section E:

- **Drop 7 stale IDs** (don't exist in current JEI registry):
  - `simplyswords:tidebreaker`, `simplyswords:runic_edge`, `simplyswords:void_saber`, `simplyswords:searing_light`
  - And 3 more confirmed by Section E audit

- **Rename 4 IDs** to current names:
  - `brimstone` → `brimstone_claymore`
  - `longsword_of_the_plague` → `toxic_longsword`
  - `contained_remnants` → `contained_remnant`
  - 1 more

- **Add 17 missing IDs** (boss-allocated weapons currently leaking via crafting):
  - `whisperwind`, `enigma`, `hiveheart`, `waxweaver`, `tempest`, `caelestis`, `sunfire`, `flamewind`, `shadowsting`, `emberlash`, `bramblethorn`, `soulstealer`, `soulpyre`, `soulkeeper`, `magiblade`, `waking_lichblade`, `awakened_lichblade`

**Deliverable:** Section E rewrite, ~38 final entries.

### 3.2 Fix theabyss ring_of_ghost(s) drift

In `recipe_audit.js` Section K.3, single-line rename: `ring_of_ghost` → `ring_of_ghosts`. The regex catches it, but the individual list should be accurate.

### 3.3 Build the stale-ID validator (cross-cutting A)

Create a startup-scripts validation script that:
- Collects every `event.remove({output: 'modid:itemid'})` call across `recipes/*.js`
- Validates each ID against the JEI dump (or live registry on server start)
- Logs warnings for any stale ID

**Deliverable:** new file `kubejs/startup_scripts/validate_recipe_removals.js` that runs once at server start. Output goes to console + log file for tester review.

### Deliverable

1 PR: "recipes: refresh simplyswords Section E + theabyss singular drift + add stale-ID validator." Bundled because they all relate to the same cross-cutting finding.

---

## Phase 4 — P1 COVERAGE GAPS: ungated curios + boss drops

**Goal:** close the remaining P1 ungated items in mods that *do* have partial coverage.
**Estimated effort:** 3-4 hours.

### 4.1 terramity I.3 sub-block + boss-drop allocation

- **`recipe_audit.js` Section I.3**: add 8 EPIC curios + 7 EPIC non-gun weapons to recipe-removal list
- **New file `kubejs/server_scripts/loot/terramity_boss_drops.js`**: allocate 7 melee EPICs to specific bosses (per audit's proposed mapping)
- **`lootjs_overhaul.js`**: add `terramityCurioStrip` array similar to `terramityGunStrip`

**Items to handle:** 7 melee weapons (`blasphemic_rapture`, `unholy_lance`, `davy_jones`, `olympus`, `divine_intervention`, `planet_buster`, `kamehameha`) + 8 curios (`antimatter_pacemaker`, `nyxs_necklace`, `antiprism`, `null_scarf`, `dragon_band`, `sacred_speed_bracelets`, `angel_feather`, `fortunes_favor`).

### 4.2 theabyss totems + curio gates

- **3 EPIC totems** (`totem_of_thunder`, `totem_of_abyss`, `totem_of_time`) — highest priority due to revive semantics. Either: stage at T3, recipe-strip + boss-allocate, or both.
- **9 EPIC trophies/curios/reagents** (`crown_of_nosaj`, `amuled_of_nosaj`, `eye_of_abyss`, `dream_shifter`, `node_shard`, `enchanted_bottle_of_somnium`, `immortal_substance`, `clock_of_time`, `artifact_of_after_life`) — JEI verify, then add to existing K-section or boss-drop allocation.

### 4.3 celestial_artifacts triage (14 EPIC + 32 chat-color)

Add to existing T2/T3/T4 chest pools (`lootjs_overhaul.js` Section 1) per the chat-color → tier mapping in the audit:
- gold → T4
- dark_purple/dark_aqua → T3-T4
- green/dark_green → T2
- pink/red/yellow → T1-T2

**Plus**: add 4-8 celestial items to T3 pool to fill the T2→T4 cliff.

### 4.4 simplyswords lichblade entry point

`slumbering_lichblade` is the chain entry. Verify in JEI — either add to Section E (if craftable) or add to T2 boss-drop pool (if drop-only).

### Deliverable

1 PR: "Ungated curios + totems closure (terramity, theabyss, celestial_artifacts, simplyswords lichblade)."

This is the single biggest mechanical PR in the plan — ~50 items affected. Recommend reviewer-ready before opening.

---

## Phase 5 — P1 MISC: botania spawner_mover

**Goal:** close the spawner_mover dupe vector.
**Estimated effort:** 30 min.

### 5.1 In-game verification

Test the actual behavior of `botania:spawner_mover`:
- Pick up a Witch Hut spawner
- Place at a Blaze farm location
- Verify: does the placed spawner spawn witches (preserved type) or blazes (generic)?

If preserves type → **fix immediately** (it's a known dupe vector).

### 5.2 Fix (if needed)

Either:
- **(A)** Stage at T3 in `astages_restrictions.js` — gates access but doesn't fix the underlying dupe
- **(B)** Recipe-strip via `tier_gated_recipes.js` — removes from crafting entirely
- **(C)** Datapack override of the spawner-mover use behavior (if mod supports)

Recommend B if mod doesn't have a config to disable type preservation.

### Deliverable

1 PR (if fix needed): "botania: gate spawner_mover (verified dupe vector)."

If verification shows it doesn't preserve type, close the finding without code change.

---

## Phase 6 — P2 SPOT-CHECK SWEEP (in-game session)

**Goal:** rip through ~70 items in a single play session, recording results.
**Estimated effort:** 2-3 hours of focused play.
**Output:** a "Phase 6 results" doc that converts each spot-check into either a confirmed fix-needed (escalate to P1) or a confirmed clean (close finding).

### 6.1 Workflow

Pre-set the player to creative + open JEI. For each item:
1. JEI search for the item
2. Click "Uses" tab → does any recipe craft it?
3. If recipe exists: note ingredients + tier-equivalent
4. If no recipe: search loot tables / mob drops in JEI
5. Record outcome in a spreadsheet

### 6.2 Items to verify (~70 total, by mod)

| Mod | Items | Source |
|-----|------:|--------|
| cataclysm | 7 (`witherite/enderite/ignitium/cursium` ingot sourcing, `emp`, `mechanical_fusion_anvil`, `netherite_effigy`, `sandstorm_in_a_bottle`) | cataclysm.md |
| forbidden_arcanus | 7 (`soul_extractor`, 6 RARE/UNCOMMON curios) | forbidden_arcanus.md |
| botania | 6 (`missile_rod`, `terraform_rod`, `astrolabe`, `flight_tiara`, `diva_charm`, `laputa_shard`) | botania.md |
| theabyss | 12 (3 totems + 9 trophies/reagents) | theabyss.md |
| simplyswords | 8 (slumbering_lichblade source, 3 relics, 4 reagent gems + remnants) | simplyswords.md |
| irons_spellbooks | 15 (10 Cinderous + 5 EPIC structure-loot items) | ars_nouveau_irons_spellbooks.md |
| celestial_artifacts | 14 (per audit) | celestial_artifacts.md |
| occultism | 4 (Dreamworld dim, spirit_attuned_pickaxe_head, books-of-binding chest leak, iesnium chain) | occultism.md |
| terramity | ~10 (RARE bracelets + tomes) | terramity.md |
| blue_skies | 5 (4 spawn eggs + debug_sword) | boss_mods.md |
| long-tail | 4 (bygonenether bell, multiplayerbosses lootbag, majestic_menaces ancient_eye, savage_and_ravage scan) | long_tail_magic_and_bosses.md |

### Deliverable

1 doc: `wiki/audits/PHASE_6_VERIFICATIONS.md`. Each row: mod / item / verification result / next action.

Some results will close findings outright. Some will escalate to needing fixes — those go into Phase 7.

---

## Phase 7 — P2 REACTIVE FIXES (post-verification)

**Goal:** fix whatever Phase 6 surfaces as actually-broken.
**Estimated effort:** unknown until Phase 6 completes. Estimate 2-4 hours conservatively.

### 7.1 Likely fix shapes (educated guesses)

- **Curio recipe-removals**: probably 5-10 items need their recipes stripped
- **Boss-drop allocations**: probably 3-5 items need adding to existing loot files
- **Stage-list additions**: probably 5-10 items need adding to `astages_restrictions.js`
- **Loot-strips for spawn eggs / debug items**: 1-5 items if Blue Skies eggs leak

### 7.2 Decision points (likely to surface)

- **Mechanical_fusion_anvil overlap with void_forge/infernal_forge** — design decision
- **Reinforced_deorum_blacksmith_gavel as Tetra hammer** — design decision
- **rift_shard collision option A vs B** — confirmation
- **simplyswords 7 unassigned weapons** — keep craftable or strip?

These should be flagged to user for decision rather than batched into the fix PR.

### Deliverable

1 PR: "P2 fixes from Phase 6 verifications" with itemized changelog of everything addressed.

---

## Phase 8 — PROCESS + P3 CLEANUP

**Goal:** close the loop on cross-cutting findings + handle low-priority cleanup.
**Estimated effort:** 2-3 hours.

### 8.1 Datapack-existence validator (cross-cutting from occultism finding)

Create a startup script that scans `recipes/*.js` for `icraft_*_overrides` references and validates that each named datapack exists on disk. Logs error at server start if any are missing.

This closes the "occultism TODO silently rotted" pattern (FINDINGS.md #30, also #43 — "process improvement").

**Deliverable:** `kubejs/startup_scripts/validate_datapack_references.js`.

### 8.2 New-mod-audit checklist

Add to `wiki/protocols/` a one-page checklist for adding new content mods:
1. Add to `.pw.toml` index
2. Run JEI dump after first server start
3. Diff with previous dump → identify new items
4. Categorize new items by rarity/role
5. Add to appropriate gating files (recipe-removal list, stage list, loot pool)
6. Update relevant audit doc OR create new audit if substantial mod

**Deliverable:** `wiki/protocols/9-new-mod-audit.md`.

### 8.3 Bytecode patch survival checklist

Add to mod-update protocol: when updating Patchouli or ars_nouveau jars, must re-apply bytecode patches. (FINDINGS.md #34.)

**Deliverable:** addition to existing protocols/8-client-sync.md or similar.

### 8.4 P3 cleanup items (optional, can defer)

- Cataclysm netherite_effigy investigation
- Cataclysm sandstorm_in_a_bottle mob-farm test
- simplyswords 11 reserved weapons (note: future work, no action now)
- simplyswords 7 unassigned weapons decision (covered in Phase 7)
- terramity mechanical_fusion_anvil decision (covered in Phase 7)
- forbidden_arcanus reinforced_deorum_blacksmith_gavel as Tetra hammer (design)
- theabyss next-boss EPIC trophy allocations (future work)

### Deliverable

1 PR: "Process improvements + P3 cleanup" bundling validators, protocols, and any remaining cosmetic fixes.

---

## Effort summary by phase

| Phase | Goal | Effort | Items affected | PR count |
|-------|------|--------|---------------:|---------:|
| 1 | P0 occultism miners | 1-2 hr | 4 miners | 1 |
| 2 | 3 ungated content mods | 4-6 hr | ~85 | 1-3 |
| 3 | Recipe drift refresh + validator | 2-3 hr | ~30 IDs | 1 |
| 4 | Coverage gaps closure | 3-4 hr | ~50 | 1 |
| 5 | Botania spawner_mover | 30 min | 1 | 0-1 |
| 6 | P2 verification sweep | 2-3 hr (in-game) | ~70 (verify) | 0 (doc) |
| 7 | P2 reactive fixes | 2-4 hr | TBD | 1 |
| 8 | Process + P3 cleanup | 2-3 hr | infrastructure | 1 |
| **Total** | | **17-25 hr** | **~155 items** | **6-9 PRs** |

Across 4-6 sessions, this is a 3-4 week part-time effort or a focused 2-week sprint.

## Decision points — RESOLVED 2026-04-27

All 6 decision points answered by user. Locked in:

1. **`too_many_bows:rift_shard` collision → STRIP + RENAME** (option B)
   - LootJS strip `too_many_bows:rift_shard` from chest pools
   - Rename our internal reference from `kubejs:rift_shard` to `kubejs:icraft_rift_shard` (or similar) for unambiguous identification
   - Update all references in `endgame/rift_mechanics.js`, `loot/lootjs_overhaul.js`, ascension reagents, etc.

2. **`mechanical_fusion_anvil` → MERGE with void_forge/infernal_forge**
   - Disable/remove `cataclysm:mechanical_fusion_anvil` recipe and loot
   - Existing `cataclysm:void_forge` (Ender Guardian) and `cataclysm:infernal_forge` (Ignis) cover the boss-tier crafting station role
   - Avoids triple-overlap of T4 crafting stations

3. **`reinforced_deorum_blacksmith_gavel` → WHITELIST as Tetra hammer-equivalent**
   - Add to Tetra hammer tool tag (or equivalent material list) so it can be used for modular spell book repair at Tetra workbench
   - Cross-mod synergy without breaking balance: gavel itself is Hephaestus-Forge-gated (T3-T4)

4. **`simplyswords` 7 unassigned weapons → ADD ALL TO SECTION E (creative-only until assigned)**
   - Confirmed via stat lookup in `simplyswords_main/weapon_attributes.json5`
   - Damage modifiers range +3.0 (harbinger, T2-T3 baseline) to +8.0 (hearthflame, netherite-tier)
   - **Slumbering_lichblade is the entry point to the awakened_lichblade endgame chain** — freebie access bypasses the Voidheart Blade Mythic Forge gate
   - Section 8 design intent already states "reserved for future bosses" — making them freebies contradicts that
   - All 7 to Section E: `harbinger`, `hearthflame`, `magiscythe`, `magispear`, `ribboncleaver`, `slumbering_lichblade`, `wickpiercer`

5. **art_of_forging tier mapping → CONFIRMED** (Ancient → T2, Demonic → T4, sigils/devils_soul_gem → T3)

6. **moreartifacts T3 pool additions → CONFIRMED** (Dragon → T4, Hero/Ankh → T2 mid-tier, Sculk → T4)

These decisions feed Phase 2.2-2.3, Phase 4, Phase 7. No further user input needed before Phase 1 starts.

## Risk register

- **Phase 6 may explode in scope** — if many Phase 2 verifications fail, Phase 7 ballooning is possible. Mitigation: Phase 6 produces a triaged doc with clear actions, so we can budget Phase 7 accurately before starting.
- **Phase 2 art_of_forging may need design pass** — the tier mapping is currently inferred from item names only. If the actual mod intent differs (e.g., Demonic is supposed to be a T2 reskin, not T4), the work won't fit our tier model cleanly. Mitigation: do JEI uses-lookup as Step 1 in Phase 2.3, before any code changes.
- **Phase 3 validator may surface more drift than expected** — running the stale-ID check across the whole codebase may identify additional renames beyond simplyswords + theabyss. If so, Phase 3 expands. Mitigation: scope check the validator output before fixing — fix only obviously stale entries; document the rest.
- **Bytecode-patched jars may break on mod updates** — Patchouli and ars_nouveau jars are bytecode-patched. If those mods get updated mid-fix-plan, the patches need re-applying. Mitigation: hold mod updates to those two during the fix-plan window.

## Success criteria

The fix plan is complete when:
- All P0 + P1 findings have shipped fixes
- P2 findings are either fixed or documented as "verified clean / no action needed"
- P3 findings are either fixed or explicitly deferred to future work
- 5 cross-cutting patterns each have either a code-level fix (validators, checklists) or a documented practice
- FINDINGS.md is updated with status per finding (FIXED / DEFERRED / VERIFIED CLEAN)

After completion, the audit pass continues with the remaining ~126 mods (mid-tier, performance, decoration, etc.) at a more relaxed cadence — those should produce mostly LIGHT POLISH or GREENLIT verdicts.
