# Consolidated Audit Findings — Fix Plan Source

<!-- INTERNAL ONLY -->

Single source of truth for actionable findings across all per-mod audits. Updated after each new audit. Use this to assemble the comprehensive fix plan once the audit pass is complete.

**Format:** each finding is one row with mod + verdict severity + concrete action. P0 = blocks progression integrity, P1 = bypasses tier gating, P2 = balance polish, P3 = rename drift / cosmetic / nice-to-have.

## P0 — Critical (progression integrity)

| # | Mod | Finding | Action | Source |
|---|-----|---------|--------|--------|
| 1 | occultism | **Dimensional miners (Foliot/Djinni/Afrit/Marid) ungated** — `recipe_audit.js:137` TODO never closed; `icraft_occultism_overrides` datapack does not exist; players can craft a Djinni miner at T2 and get diamonds without entering Nether, or Afrit miner at T3 for ancient_debris-equivalents | **Create `datapack_sources/icraft_occultism_overrides/data/occultism/recipes/miners/` mirroring botania pattern; strip diamond/ancient_debris/netherite_scrap from each miner's result table** | [occultism.md](occultism.md) |

## P1 — High (tier-skip vectors, recipe drift)

| # | Mod | Finding | Action | Source |
|---|-----|---------|--------|--------|
| 2 | simplyswords | Section E removal list has 7 stale IDs (silent no-ops) and 4 renamed-but-not-updated IDs (recipe gates are bypassed for those weapons). Plus ~17 boss-allocated weapons missing from the removal list entirely | Refresh `tier_gated_recipes.js` Section E: drop 7 stale, rename 4, add 17 missing. Final list ~38 entries | [simplyswords.md](simplyswords.md) |
| 3 | simplyswords | Lichblade chain entry point unclear — `slumbering_lichblade` not in removal list and not in any boss-drop allocation. Either chain has no entry point OR can be crafted bypassing the gate | Verify slumbering_lichblade source; either add to Section E + add T2 loot drop, or document drop source | [simplyswords.md](simplyswords.md) |
| 4 | terramity | ~15 EPIC non-gun items completely ungated (7 melee weapons + 8 curios). Includes `kamehameha`, `planet_buster`, `divine_intervention`, `nyxs_necklace`, `dragon_band`, `sacred_speed_bracelets`, etc. | Add I.3 sub-block to `recipe_audit.js` for non-gun EPIC content. Create `kubejs/server_scripts/loot/terramity_boss_drops.js` to allocate 7 melee EPICs to specific bosses | [terramity.md](terramity.md) |
| 5 | celestial_artifacts | 14 EPIC curios ungated; `ender_jump_scepter` (active teleport), `gaia_totem` and `cursed_totem` (revive semantics), `magic_horseshoe`, `the_end_dust` are highest concern | Triage each: add to existing T3/T4 chest pool OR add to recipe-removal OR allocate to bosses | [celestial_artifacts.md](celestial_artifacts.md) |
| 6 | celestial_artifacts | 32 chat-color "tier" items completely outside gating system (mod uses ChatFormatting colors, not vanilla Rarity) | Triage by chat-color: gold→T4, dark_purple/dark_aqua→T3-T4, green/dark_green→T2, pink/red/yellow→T1 | [celestial_artifacts.md](celestial_artifacts.md) |
| 7 | botania | `spawner_mover` UNCOMMON, ungated — if it preserves spawner type on placement, it's a Witch-Hut→Blaze-Spawner dupe vector | JEI verify behavior; if preserves type, gate to T3 or remove recipe | [botania.md](botania.md) |
| 8 | theabyss | Singular/plural drift on `ring_of_ghost` (singular) vs `ring_of_ghosts` (plural in JEI). Individual entry is dead code, but regex catches it | Rename Section K.3 entry to plural form for accuracy | [theabyss.md](theabyss.md) |
| 9 | theabyss | 12 EPIC items ungated: 3 totems (thunder/abyss/time — revive semantics highest concern), nosaj trophies, exotic reagents | JEI uses-lookup on each; add to T3 list or boss-drop allocations | [theabyss.md](theabyss.md) |

## P2 — Medium (balance polish)

| # | Mod | Finding | Action | Source |
|---|-----|---------|--------|--------|
| 10 | cataclysm | Materials sourcing chain unverified — witherite/enderite/ignitium/cursium ore→ingot smelting may be bypassable | JEI uses-lookup; if bypassable, add tier guard in `tier_gated_recipes.js` | [cataclysm.md](cataclysm.md) |
| 11 | cataclysm | `emp` item — verify it doesn't trivialize Mekanism reactor / IF Laser Drill | In-game test against Mekanism reactor + IF Laser Drill | [cataclysm.md](cataclysm.md) |
| 12 | cataclysm | `mechanical_fusion_anvil` overlap with our `void_forge`/`infernal_forge` | Design decision: keep, disable, or merge | [cataclysm.md](cataclysm.md) |
| 13 | forbidden_arcanus | `soul_extractor` recipe — verify requires arcane_crystal (T3) for transitive gating | JEI uses-lookup | [forbidden_arcanus.md](forbidden_arcanus.md) |
| 14 | forbidden_arcanus | RARE/UNCOMMON curios (spectral_eye_amulet, eternal_obsidian_skull, obsidian_skull/_shield, orb_of_temporary_flight, xpetrified_orb, darkstone_upgrade_smithing_template) — verify each routes through Hephaestus Forge or arcane_crystal | JEI uses-lookup x6 | [forbidden_arcanus.md](forbidden_arcanus.md) |
| 15 | botania | `missile_rod`, `terraform_rod`, `astrolabe`, `flight_tiara`, `diva_charm`, `laputa_shard` — verify recipes transitively gate to T3 via terrasteel/elementium | JEI uses-lookup x6 | [botania.md](botania.md) |
| 16 | celestial_artifacts | T3 chest pool has zero celestial items (T2→T4 cliff in coverage) | Add 4-8 celestial items to `artifactT3Pool` themed for Nether/Undergarden | [celestial_artifacts.md](celestial_artifacts.md) |
| 17 | celestial_artifacts | Potential duplicate-curio stacking — `celestial_artifacts:cross_necklace` AND `artifacts:cross_necklace` both in T2 pool. Three obsidian_skull items across mods (artifacts, celestial, F&A) | In-game test: do duplicates stack in curio slots? If yes, remove duplicates from pools | [celestial_artifacts.md](celestial_artifacts.md) |
| 18 | terramity | RARE bracelets (`electron_bracelets`, `malediction_bracelets`) and tomes (`tome_of_commotion`, `tome_of_ascension`, `galebounce_tome`, `dimensional_poof`, `velocity_flip`, `guardian_grimoire`, `gaias_tempest`) — JEI sweep for proc abuse | JEI uses-lookup x9 | [terramity.md](terramity.md) |
| 19 | terramity | nyxium/exodium/reverium ingot sourcing — verify not accessible from low-tier ores | JEI uses-lookup | [terramity.md](terramity.md) |
| 20 | occultism | `iesnium_ingot/nugget/ore` (T3-T4 metal) not in any stage list — verify Dreamworld dimension gating; if missing, add | Check `astages_restrictions.js` for dim gating | [occultism.md](occultism.md) |
| 21 | occultism | `spirit_attuned_pickaxe_head` — verify what slot/recipe it serves; may bypass material-tier requirements | JEI uses-lookup | [occultism.md](occultism.md) |
| 22 | occultism | Books of Binding chain: verify the books don't appear in chest loot tables (would skip the spirit-tier progression) | LootJS strip if present | [occultism.md](occultism.md) |

## P3 — Low (cosmetic, nice-to-have, design decisions)

| # | Mod | Finding | Action | Source |
|---|-----|---------|--------|--------|
| 23 | cataclysm | `netherite_effigy` — investigate item type (block vs craftable) | One-minute in-game inspection | [cataclysm.md](cataclysm.md) |
| 24 | cataclysm | `sandstorm_in_a_bottle` — verify not abusable for mob farms | In-game test | [cataclysm.md](cataclysm.md) |
| 25 | simplyswords | 11 Simply Swords weapons reserved for future bosses (NovaBosses/Ultimate Bosses/Brutal Bosses) — when those mods are integrated, allocate per Section 8 plan | Future work; not actionable now | [simplyswords.md](simplyswords.md) |
| 26 | simplyswords | 7 unassigned weapons (harbinger, hearthflame, magiscythe, magispear, ribboncleaver, slumbering_lichblade, wickpiercer) currently leak (not in removal list) | Decision: add to Section E now (creative-only until assigned) OR leave craftable as freebies | [simplyswords.md](simplyswords.md) |
| 27 | terramity | `mechanical_fusion_anvil` (also a F&A reference) — design decision on tool overlap | Design pass | [terramity.md](terramity.md) |
| 28 | forbidden_arcanus | `reinforced_deorum_blacksmith_gavel` whitelist as Tetra hammer-equivalent for modular spell book repair (cross-mod synergy) | Design decision | [forbidden_arcanus.md](forbidden_arcanus.md) |
| 29 | theabyss | When next abyss boss gets explicit treatment, allocate the unallocated EPIC trophy/reagent items to those bosses per Knight/Unorithe pattern | Future work | [theabyss.md](theabyss.md) |
| 30 | (cross-cutting) | Add a startup-scripts check that all `icraft_*_overrides` datapacks referenced in code comments actually exist on disk. The occultism TODO silently rotted because nothing validated the contract | Process improvement | [occultism.md](occultism.md) |

## Cross-cutting patterns

These reinforce the README's cross-cutting findings and inform the eventual fix-plan structure.

### A. Recipe-removal ID drift
- **simplyswords**: 7 stale + 4 renamed in Section E
- **theabyss**: 1 singular/plural rename (caught by regex safety net)

→ **Suggested fix-plan item:** one-time sweep over every `event.remove({output: '<modid>:<itemid>'})` call across `recipes/*.js`. Validate every ID against the JEI dump. Generate a "stale removal" report.

### B. Three-layer gate pattern (terramity gun strip)
Recipe removal + chest+entity loot strip + Apotheosis enchant disable. **Used: terramity.** Worth replicating for any mod where we want broad content removal.

### B2. Chokepoint (transitive) gating pattern
Gate one workstation or required reagent → dozens of items inherit. **Used: forbidden_arcanus (Hephaestus Forge + Arcane Crystal), botania (Gaia Guardian + tier ingots).** Most efficient model.

### C. Non-vanilla rarity (mod-internal tier system)
Mods that use ChatFormatting colors or no rarity at all instead of vanilla `Rarity` enum. **Confirmed: forbidden_arcanus (0 EPIC despite endgame), celestial_artifacts (32 chat-color), occultism (0 EPIC, 1 RARE, 225 COMMON).** Future audits should not trust the rarity column.

### D. Dimensional/automation tier-skip
Spirit miners, Mana Pool conversions, Imbuement, Clibano combustion, Crushing recipes — every auto-craft mod has a "convert lower into higher" pathway that needs blocking. **Mostly addressed in `recipe_audit.js` Section E-F**, but the occultism dimensional miner TODO shows the addressing isn't complete.

→ **Suggested fix-plan item:** comprehensive audit of EVERY auto-conversion mechanic in the pack (Mana Pool, Imbuement, Crusher, Spirit Trade, Combustion, Hephaestus Forge, etc.) with a "what's the cheap input → expensive output path?" check.

### E. Curio stacking risk
Three `obsidian_skull` items across mods, two `cross_necklace` items, three rings-of-X overlaps. → **Fix-plan item:** in-game curio-slot duplication test. Bonus question: do the curio mods all use compatible slot types, or do some bypass slot competition?

## Counts so far

- **9 mods audited** (cataclysm, simplyswords, terramity, forbidden_arcanus, theabyss, celestial_artifacts, botania, occultism, rpgseteffects)
- **30 actionable findings** (1 P0, 8 P1, 13 P2, 8 P3)
- **~50 items needing JEI spot-checks** across all mods
- **159 mods remaining** in priority queue
- **rpgseteffects is the benchmark** (GREENLIT, 100% coverage, zero findings) — when other content mods reach this maturity, audit pass is done
