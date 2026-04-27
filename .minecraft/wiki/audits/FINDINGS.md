# Consolidated Audit Findings — Fix Plan Source

<!-- INTERNAL ONLY -->

Single source of truth for actionable findings across all per-mod audits. Updated after each new audit. Use this to assemble the comprehensive fix plan once the audit pass is complete.

**Format:** each finding is one row with mod + verdict severity + concrete action. P0 = blocks progression integrity, P1 = bypasses tier gating, P2 = balance polish, P3 = rename drift / cosmetic / nice-to-have.

## P0 — Critical (progression integrity)

| # | Mod | Finding | Action | Source | Status |
|---|-----|---------|--------|--------|--------|
| 1 | occultism | **Dimensional miners (Foliot/Djinni/Afrit/Marid) ungated** — `recipe_audit.js:137` TODO never closed; `icraft_occultism_overrides` datapack did not exist; players could craft a Foliot/Djinni miner at T1-T2 and get diamonds (weight 218) without any tier gating | **FIXED 2026-04-27 (Phase 1):** Created `datapack_sources/icraft_occultism_overrides/` with 8 ore-recipe overrides. Restricts diamond/emerald/arcane_crystal/osmium/nether_quartz/nether_gold/xpetrified_ore from `ores` tag (any miner) to `deeps` tag (T3+ Afrit/Marid). Dimensional_shard_ore restricted to `master` (T4 Marid only). Datapack zipped + deployed to all 3 distros + load order updated. recipe_audit.js:137 TODO closed. | [occultism.md](occultism.md) |

## P1 — High (tier-skip vectors, recipe drift)

| # | Mod | Finding | Action | Source |
|---|-----|---------|--------|--------|
| 1.5a | art_of_forging | **22 EPIC/RARE items completely ungated, 0 refs** — multi-tier weapons (ancient/demonic axe/blade/flail), sigils, demonic curios, rending scissors chain | **FIXED 2026-04-27 (Phase 2.3):** JEI uses-lookup revealed mod is mostly natively-gated through boss drops (Ancient City, Wither Skeleton, Wither, Ender Dragon). Added 9 stage-gates as defense-in-depth: T2 (3) ancient_axe/blade/flail; T3 (2) sigil_of_eden + devils_soul_gem; T4 (4) demonic_axe/blade/flail + enigmatic_construct. Items not staged (mark_of_the_architect, rending_scissor_*, mod materials) have no recipe + no native loot table → likely creative-only or advancement rewards; not gating to avoid breaking unknown legitimate paths. | [long_tail_magic_and_bosses.md](long_tail_magic_and_bosses.md) |
| 1.5b | too_many_bows | **31 EPIC/RARE items ungated, 0 refs** — 14 EPIC named bows + 4 reagents. Bow-class build was broken-OP. Plus `rift_shard` namespace collision with our `kubejs:rift_shard` | **FIXED 2026-04-27 (Phase 2.2):** All 31 items allocated. T1 (4): dark/hunter/flame/torchbearer bows. T2 (8): frostbite/tidal/verdant + 5 RARE. T3 (10): arcane/ancient_sage/auroras/crimson/necro_flame + cursed_stone + soul_fragment + 3 RARE. T4 (8): dragons_breath/astral/spectral/shulker_blast/arc_heavens/twin_shadows + power_crystal + dead_eyes_pendant. Rift_shard stripped from chest pools globally. Our internal `kubejs:rift_shard` renamed to `kubejs:icraft_rift_shard` across 5 files (rift_mechanics, mythic_forge, tier_skip, custom_items, endgame_items). One-time migration script at `kubejs/server_scripts/migrations/rift_shard_rename.js` converts old items in inventory + ender chest on player login. Old item registration deprecated for ~2 weeks before removal. | [long_tail_magic_and_bosses.md](long_tail_magic_and_bosses.md) |
| 1.5c | moreartifacts | **32 EPIC/RARE curios mostly ungated, 2 refs** — Dragon → T4, Hero → mid-tier, Sculk → T4 theming clear | **FIXED 2026-04-27 (Phase 2.1):** Added all 32 items (11 EPIC + 21 RARE) to `lootjs_overhaul.js` T1/T2/T3/T4 chest pools. T1 (2): melody/lucky. T2 (5): hero/ankh/vanir/tainted defensive curios. T3 (16): fire/decay/Nether-themed RARE. T4 (9): dragon/sculk endgame. Combined drop rates unchanged (per-tier %% holds; pool size grew). | [long_tail_magic_and_bosses.md](long_tail_magic_and_bosses.md) |
| 2 | simplyswords | Section E removal list has stale IDs and missing entries | **FIXED 2026-04-27 (Phase 3.1):** Cross-referenced full Section E against current JEI registry. Removed 4 stale (`tidebreaker`, `runic_edge`, `void_saber`, `searing_light`). Renamed 3 (`brimstone`→`brimstone_claymore`, `longsword_of_the_plague`→`toxic_longsword`, `contained_remnants`→`contained_remnant`). Added 13 missing boss-allocated weapons. Added 6 unassigned weapons per locked-in decision 4. Final list: 43 entries (was 29; 7 actually-stale-or-renamed in old list). All entries validated to match current `simplyswords` namespace. | [simplyswords.md](simplyswords.md) |
| 3 | simplyswords | Lichblade chain entry point unclear | **FIXED 2026-04-27 (Phase 4.4 / resolved by 3.1):** slumbering_lichblade added to Section E via Phase 3.1 (creative-only). Chain works via direct boss drops: waking_lichblade @ 25% from Ender Dragon (loot_overhaul.js:437), awakened_lichblade @ 15% from Ancient Remnant (line 491), Voidheart Blade endgame via Mythic Forge consuming Awakened. Players can ALSO find slumbering in mod's native chest loot and upgrade via altar — `event.remove({output:})` only blocks crafting slumbering as output, not using it as input. | [simplyswords.md](simplyswords.md) |
| 4 | terramity | ~15 EPIC non-gun items completely ungated | **FIXED 2026-04-27 (Phase 4.1):** Three-layer gate (mirrors gun-strip pattern): (1) `recipe_audit.js` Section I.3 removes recipes for 7 melee + 8 curios; (2) `lootjs_overhaul.js` `terramityCurioStrip` strips all 15 from chest+entity generic pools; (3) new `loot/terramity_boss_drops.js` allocates the 7 melee weapons to themed T3-T4 bosses (unholy_lance→Dead King, blasphemic_rapture→Ignis, davy_jones→Leviathan, olympus→Slider, divine_intervention→Sun Spirit, planet_buster→Ender Dragon, kamehameha→Ancient Remnant). The 8 curios remain creative-only (pack-incompatible accessories conflicting with our origins/classes/Tetra system). | [terramity.md](terramity.md) |
| 5 | celestial_artifacts | 14 EPIC curios ungated | **FIXED 2026-04-27 (Phase 4.3):** All 14 EPIC + 32 chat-color items added to T1/T2/T3/T4 chest pools per locked-in mapping. ender_jump_scepter, evil_eye, the_end_dust, chaotic_pendant → T4. cursed_protector, destroyer_badge, gluttony_badge, greedy_heart, magic_horseshoe, twisted_brain, sacrificial_object, soul_box, ender_protector → T3. precious_bracelet → T2. | [celestial_artifacts.md](celestial_artifacts.md) |
| 6 | celestial_artifacts | 32 chat-color items completely outside gating system | **FIXED 2026-04-27 (Phase 4.3):** Triaged per locked-in chat-color mapping. T1 (3): yellow_duck, angel_desire, sakura_hairpin. T2 (12): green/dark_green/red curios + spirit_necklace. T3 (10): dark_purple corruption + 2 dark_aqua. T4 (4): cursed_totem/twisted_heart/twisted_scroll + heart_of_revenge (gold). 4 already-pooled (forest_cloak/fang_necklace/abyss_core/spirit_crown). Combined celestial pool count: 16 → 58 items. T2→T4 cliff fixed (T3 had 0 celestial pre-fix; now 10). | [celestial_artifacts.md](celestial_artifacts.md) |
| 7 | botania | `spawner_mover` UNCOMMON, ungated — if it preserves spawner type on placement, it's a Witch-Hut→Blaze-Spawner dupe vector | JEI verify behavior; if preserves type, gate to T3 or remove recipe | [botania.md](botania.md) |
| 8 | theabyss | Singular/plural drift on `ring_of_ghost` (singular) vs `ring_of_ghosts` (plural in JEI). Individual entry is dead code, but regex catches it | **FIXED 2026-04-27 (Phase 3.2):** Renamed `theabyss:ring_of_ghost` → `theabyss:ring_of_ghosts` in `recipe_audit.js` Section K.3. Regex still provides safety net. | [theabyss.md](theabyss.md) |
| 9 | theabyss | 12 EPIC items ungated | **FIXED 2026-04-27 (Phase 4.2):** 9 items added to T3 stage gate, 3 to T4. T3: 3 totems (thunder/abyss/time — locks pre-T3 revive farming) + 6 trophies/curios/reagents (eye_of_abyss, dream_shifter, node_shard, enchanted_bottle_of_somnium, clock_of_time, artifact_of_after_life). T4: crown_of_nosaj, amuled_of_nosaj (Nosaj boss = endgame), immortal_substance (immortality semantic). | [theabyss.md](theabyss.md) |

## P2 — Medium (balance polish)

### Items added 2026-04-27 (ars_nouveau + irons_spellbooks audit)

| # | Mod | Finding | Action | Source |
|---|-----|---------|--------|--------|
| 31 | irons_spellbooks | 10 IRONS_SPELLBOOKS_CINDEROUS-rarity items have no entries in our drop tables (pyrium_staff, legionnaire_flamberge, hellrazor, unchained_book, pyrium_ingot, cinderous_soulcaller, cinderous_soul_rune, betrayer_signet, music_disc + disc_fragment) | Verify native ISS structure or boss source; if unobtainable in survival, document or remove | [ars_nouveau_irons_spellbooks.md](ars_nouveau_irons_spellbooks.md) |
| 32 | irons_spellbooks | 5+ EPIC structure-loot items (paladin_chestplate, infernal_sorcerer_chestplate, gold_crown, eldritch_manuscript, hither_thither_wand, etc.) — verify they come from intended ISS structures only | LootJS spot-check; if leak to generic chest pools, add strips | [ars_nouveau_irons_spellbooks.md](ars_nouveau_irons_spellbooks.md) |
| 33 | irons_spellbooks | `eldritch_manuscript` is a progression-unlock for Eldritch Spellbook tier; verify acquisition path is gated | Highest priority of the structure-loot concerns | [ars_nouveau_irons_spellbooks.md](ars_nouveau_irons_spellbooks.md) |
| 34 | (cross-cutting) | When updating ars_nouveau jar, must re-apply DungeonLootEnhancerModifier athrow→pop bytecode patch (currently in `ars_nouveau-1.20.1-4.12.7-all.jar`); same for Patchouli jar's Book.use_resource_pack patch | Add a checklist item to mod-update protocol | [ars_nouveau_irons_spellbooks.md](ars_nouveau_irons_spellbooks.md) |

### Items added 2026-04-27 (boss mods batch audit)

| # | Mod | Finding | Action | Source |
|---|-----|---------|--------|--------|
| 35 | blue_skies | 4 EPIC boss spawn eggs ungated (`summoner_spawn_egg`, `alchemist_spawn_egg`, `starlit_crusher_spawn_egg`, `arachnarch_spawn_egg`). If craftable or chest-droppable = boss-summon-on-demand exploit | JEI uses-lookup; if recipes exist, add to Section L removal; if in chest loot, lootjs strip | [boss_mods.md](boss_mods.md) |
| 36 | blue_skies | `debug_sword` (EPIC) — developer/debug item; verify creative-only (no recipe, no loot path) | JEI spot-check | [boss_mods.md](boss_mods.md) |

### Items added 2026-04-27 (long-tail magic + boss mods batch)

| # | Mod | Finding | Action | Source |
|---|-----|---------|--------|--------|
| 37 | bygonenether | `netherite_bell` (EPIC, ungated) — verify not in low-tier chest loot | LootJS spot-check | [long_tail_magic_and_bosses.md](long_tail_magic_and_bosses.md) |
| 38 | multiplayerbosses | `lootbag` (EPIC, ungated) — verify mod's bosses spawn only in tier-appropriate dimensions | Check spawn tables | [long_tail_magic_and_bosses.md](long_tail_magic_and_bosses.md) |
| 39 | majestic_menaces | `ancient_eye` (RARE, ungated) — likely Teikoku Senshi summon item | Verify acquisition path | [long_tail_magic_and_bosses.md](long_tail_magic_and_bosses.md) |
| 40 | savage_and_ravage | 27 items, 0 refs — verify no OP weapons/curios | Spot-check items | [long_tail_magic_and_bosses.md](long_tail_magic_and_bosses.md) |
| 41 | meetyourfight | 4 bosses partially gated (16 refs) — verify all have HP scaling + tier-appropriate drops | Spot-check | [long_tail_magic_and_bosses.md](long_tail_magic_and_bosses.md) |
| 42 | (cross-cutting) | 5th non-vanilla rarity confirmed in mahoutsukai (uses internal Mahou tiers) | Update README cross-cutting C count | [long_tail_magic_and_bosses.md](long_tail_magic_and_bosses.md) |
| 43 | (process) | Add a "any items not in any of our gating files?" check before merging new content mods | Process improvement; surfaced because art_of_forging + too_many_bows + moreartifacts each shipped without gating | [long_tail_magic_and_bosses.md](long_tail_magic_and_bosses.md) |

(Earlier P2 items unchanged below)


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
| 26 | simplyswords | 7 unassigned weapons leaking via crafting | **DECIDED 2026-04-27: ADD ALL TO SECTION E.** Stat lookup confirmed mixed power (+3.0 to +8.0 dmgMod, hearthflame is netherite-tier). Slumbering_lichblade is endgame chain entry — freebie access breaks Voidheart Mythic Forge gate. Section E creative-only until allocated to future bosses. | [simplyswords.md](simplyswords.md) |
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

- **13 audits done covering 42 mods** (the per-mod audits + 2 batch audits covering 5 + 24 mods)
- **43 actionable findings** (1 P0, 11 P1, 23 P2, 8 P3)
- **~155 items needing fixes** across all mods (the 3 P1 ungated mods alone account for ~85)
- **2 GREENLIT audits** (rpgseteffects, mekanism+ad_astra)
- **126 mods remaining** in priority queue
- **5 cross-cutting patterns identified:** (A) recipe-removal ID drift, (B) three-layer gate, (B2) chokepoint gating, (C) non-vanilla rarity (now 5 mods), (D) Tetra replacement files
