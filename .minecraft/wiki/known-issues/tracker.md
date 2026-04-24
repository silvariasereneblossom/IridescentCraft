# Known Issues Tracker

## Server Mod Channel Mismatches (Running Count)

Forge requires network channel lists to match between client and server. Mods that register channels must be present on both sides, even if they're "client-only". This tracks mods that caused `mismatched mod channel list` on connect.

| # | Mod | Problem | Fix |
|---|-----|---------|-----|
| 1 | Decorative LGBT Wall Flags | `side='client'` but registers channel | Changed to `side='both'` |
| 2 | Alex's Mobs EXTRA Music | Filename uses double quotes in `.pw.toml` (apostrophe in `Alex's`), installer regex only matched single quotes | Fixed TOML parser to accept both quote types |
| 3 | Rechiseled + SuperMartijn642 libs | Removed from pack but `.pw.toml` still present — both sides re-download, causing channel mismatch | Deleted `.pw.toml` files + `.disabled` jar. Also in server force-skip + strip list as safety net |
| 4 | Connected Glass | Depends on SuperMartijn642 libs (removed) | Deleted `.pw.toml`, added to force-skip + strip list |
| 5 | Trash Cans | Depends on SuperMartijn642 libs (removed) | Deleted `.pw.toml`, added to force-skip + strip list |

## Active Issues

### Apotheosis Tower Loot
- **Status:** Active
- **Description:** Some Apotheosis tower chests show gold only. Paxi override may have load order issue causing incomplete loot table replacement.

### Lootr Chest Conversion
- **Status:** Retuning 2026-04-19 — flipped `aggressive_mode` from `true` to `false` (all 3 distros). Lootr's own comment warns aggressive mode "may prevent certain chests from properly converted even though eligible"; tester report of "every village chest is vanilla" suggests it was blocking village worldgen conversions. Non-aggressive mode checks all block entities naively — slight TPS cost but reliable conversion.
- **Previous description:** Some chests near spawn generate as vanilla (not Lootr per-player chests). Possibly timing-related during initial worldgen chunk generation.


### Three-Prompt Character Creation
- **Status:** Working as intended (confirmed 2026-03-14)
- **Design:** Three sequential prompts on first join: Origin (13 origins, 9 vanilla + 4 custom) → Race (11 icraft) → Class (10 icraft)
- **Implementation:** Layer ordering via `order` field (0, 1, 2). Default Origins layer re-enabled. All custom content in Iridescent Origins mod.


### Aethersteel T4 Worldgen Replacement
- **Status:** Implemented (2026-03-16), needs in-game verification
- **Design:** Aethersteel ore worldgen disabled via biome modifier override. Ore appears as holystone until T4 unlock. 17 items added to T4 AStages restrictions.
- **Verify:** Confirm ore replacement renders correctly and T4 unlock reveals Aethersteel ore.

### Ad Astra Integration
- **Status:** In progress (2026-03-16)
- **Design:** 5 planets (Moon, Mars, Mercury, Venus, Glacio) as post-T4 endgame. MekaSuit Mk2, planetary extraction, space enchantments.
- **Remaining:** Recipe gating, dimension scaling, loot tables, space enchantment implementation.

### Undergarden Tetra Stat Overrides
- **Status:** Implemented (2026-03-16), needs in-game verification
- **Design:** 4 Undergarden metals added to Tetra with stat overrides. Total material count now 27.
- **Verify:** Confirm Undergarden materials appear correctly in Tetra crafting UI.

### Fast Leaf Decay ConcurrentModificationException
- **Status:** Known issue (2026-03-17), intermittent
- **Description:** Fast Leaf Decay occasionally throws ConcurrentModificationException. Non-fatal, does not crash the game. Monitoring.

### IF Latex Rework Script Error
- **Status:** Known, low priority (pre-existing)
- **Description:** `if_latex_rework` script occasionally logs a non-fatal error during recipe event. Does not affect gameplay. Will be cleaned up in a future pass.

### Planetary Loot withNBT Error
- **Status:** Known, low priority (pre-existing)
- **Description:** `planetary_loot` script has a `withNBT` call that silently fails on certain item types. Ad Astra integration is still in-progress so this is deferred until the planetary loot system is fully implemented.

### Three-distro parity audit + server_distribution/global_packs cleanup (2026-04-24)
- **Status:** Resolved — no tester verification needed; preemptive cleanup
- **Description:** Walked main, server_distribution, and distribution/client for kubejs/, config/, datapack_sources/, global_packs/, mods/, and top-level KubeJS assets. KubeJS server_scripts (71), startup_scripts (5), client_scripts (with `attribute_tooltips.js` correctly server-omitted), data/ (181 files), assets/ (7 files), and all 7 custom mod jars — byte-identical across three distros. config/paxi/datapacks/ (17 zips) — byte-identical. Config drift in top-level config/ was expected shape (client-only `.toml` files absent from server, runtime `.bak` files, mod caches).
- **Drift found + fixed:** `server_distribution/global_packs/required_data/` held 9 orphan zips that neither main nor client had. 7 were byte-identical duplicates of files already in `config/paxi/datapacks/` — Paxi was loading each twice per server boot (wasted work + latent conflict if copies ever diverged). 2 (`iridescent_classes.zip`, `iridescent_races.zip`) were leftovers from the pre-mod-migration era, silently registering `icraft:class` and `icraft:race` origin layers alongside the mod's authoritative `origins:class` / `origins:race`. Same class of issue as the `icraft_biomes.zip` orphan that caused the FeatureSorter biome-cycle crash in April — caught here before it manifested. race.json in the orphan even referenced stale `origins-plus-plus:*` IDs (the mod has since reimplemented those four races under `icraft:*`). Deleted all 9. Also swept three dead `iridescent_classes.jar` allowlist entries from `.minecraft/.gitignore` (jar never existed; remnant from same migration). Commit `02564333`.
- **Verification that no script repopulates:** `iridescentserver.sh` only checks `global_packs/` directory existence, not content; `sync_from_repo.sh/bat`, `phase0_sync.ps1`, and `server_install.sh/ps1` have no logic to restore these zips. Deletion is permanent.
- **Follow-on:** if tester notices *fewer* origin-creation prompts after the fix landed, it would mean the orphan `icraft:race` layer was being prompted as a distinct step alongside `origins:race` — silent bug this cleanup fixes. More likely they notice nothing (layers were ignored by Origins due to namespace mismatch). Either outcome is acceptable; this change only removes redundant/broken state.

### Mob Behavior Audit (2026-04-24)
- **Status:** Two issues resolved, one cause-unknown with defensive mitigation — needs in-game verification
- **Issue 1 — mobs breaking blocks:** `config/improvedmobs-common.toml` had `Enable Block Breaking = true`. The mod is global (no per-dimension setting), so even though the design-doc intent was for T3/T4 mobs to break weak blocks, the behavior was active in the Overworld at T1 too, destroying player torches / planks / doors at starter bases. Disabled globally. Secondary: `config/Undead_mobs.toml` `"Allows hunter to destroy fence or doors"` also flipped to false. Cataclysm boss arena-break zones (`ignore_mobgriefing = true`) left alone since those are boss-fight mechanics, not everyday griefing.
- **Issue 2 — spider dropped diamond + ender_eye:** Could NOT identify the specific injector. Checked: no mod overrides `data/minecraft/loot_tables/entities/spider.json`, no mod's GLM JSON contains literal `"minecraft:diamond"` or `"minecraft:ender_eye"`, no KubeJS script adds either to entity drops, our `replace: true` in `global_loot_modifiers.json` should be blocking Apotheosis's `affix_loot` and `gems` GLMs, and it wasn't an Apotheosis boss (no name, no glow). The injector must be a Java-side mixin from a mod we haven't pinned down. **Defensive fix:** added a second `addLootTypeModifier(LootType.ENTITY)` block in `loot_overhaul.js` that strips `minecraft:diamond`, `minecraft:diamond_block`, `minecraft:emerald_block`, `minecraft:ender_eye`, `minecraft:netherite_ingot/scrap/block`, `minecraft:ancient_debris`, and `minecraft:elytra` from every entity loot pool unconditionally. Intentionally NOT stripped: ender_pearl (enderman), totem_of_undying (evoker), nether_star (wither), emerald (villager throws) — these are legitimate vanilla mob drops we don't want to break.
- **Verify:** Tester to (a) confirm mobs no longer destroy planks/doors/glass at their Overworld base, (b) kill a large sample of normal spiders and confirm no diamond/ender_eye drops.

### T1 Magic Audit Fixes (2026-04-24)
- **Status:** Resolved — needs in-game verification
- **Description:** Six connected issues found during T1 magic audit:
  1. Ars Nouveau was documented as T2 but shipped a vanilla-workbench novice_spell_book recipe (book + 4 iron tools), so the entry path was actually T1 all along. Design doc updated to reflect that.
  2. Village house chests had a Pool 3 magic roll stacking with the overworld T1 rule — total ~100%+ magic item coverage per chest. Pool 3 removed.
  3. Village house JSON overrides had a scroll entry at weight 1 vs empty 39 (~2.5%) but no `irons_spellbooks:randomize_spell` function — scrolls dropped with blank NBT and no spell attached (unusable). Added the randomize_spell function to all 5 village house JSONs.
  4. Magic-class starter kits (archmage/battlemage/void_summoner) gave a copper_spell_book with no spell inscribed — useless until players learned a spell. Added two pre-NBT'd scrolls per kit using `ISpellContainer.createScrollContainer` bridge.
  5. No Codex entry for T1 magic. Added `early_magic.json` (sortnum=2) covering scrolls, spell books, Ars entry path, Scribes Table, and casting.
  6. `ars_nouveau:novice_spell_book` was checked — already craftable on vanilla workbench, no recipe override needed.
- **Verify:** Tester to: (a) break 10+ village chests and confirm scrolls drop usable with a random spell, (b) roll a magic class and confirm kit includes two scrolls with specific pre-rolled spells, (c) confirm village chests have ~one magic-related item instead of two, (d) confirm Early Magic Tutorial entry appears in Codex T1 category, (e) confirm novice_spell_book crafts at vanilla workbench.

### Alpha Testing Status
- **Status:** Active (as of 2026-04-18)
- **Description:** Stable alpha build deployed to test server. Loot rates finalized, worldgen tuned, distribution tooling in place. Codex shipped as proper Forge content mod. 2 known low-priority pre-existing errors (if_latex_rework, planetary_loot withNBT). All major systems functional.

### Custom Item Artwork Needed (72 items)
- **Status:** TODO — tinted placeholder textures in place, need proper pixel art
- **Current state:** All 72 custom items use tinted vanilla base textures (e.g. tinted ender pearl for tokens, tinted amethyst shard for crystals). Functional and color-coded but not unique artwork.
- **Items needing art:** Progression tokens (T1-T4 + fragments), boss materials (12+), intermediate alloys, 8 Abyss rings, endgame items (Rift Core, Primordial Essence, Mythic Catalysts I-V, Rift Gem, Rift Blueprint, Void Coffer), MekaSuit Mk2 (4 pieces), Dragon Summoning Crystal, Dragon Heart, Dragon Scale, planetary extracted elements (10), Class Altar, Waystone Core, reforging tokens
- **Location:** Textures go in `assets/kubejs/textures/item/` as 16x16 PNGs matching the item registry names
- **Priority:** Medium — placeholders work but proper art would significantly improve visual polish

## Needs Testing

- [ ] Witherborn wither on hit — confirm wither effect applies on melee, hunger damage penalty functions
- [ ] Slimebodied food cooldown/DR — confirm 5% food efficiency, satiety-based damage reduction
- [ ] Orc Bloodlust — confirm +20% damage scaling with hunger level, +20% HP, +10% attack speed
- [ ] Witch of Ink progression system — origin detection via NBT, boss counter scaling, Blessing of Penthesilea capstone
- [ ] Artificial Construct iron eating — iron ingot/block consumption, Regen III on eat, 5/5/5/10/10% upgrade ladder
- [ ] Phantom Undeath — EntityEvents.death cancel on players, Spectral Collapse debuffs
- [ ] Samurai Focus — movement shield via absorption, Vorpal (Strength) by progression tier
- [ ] Wanderer Seasoned Traveler — dimension tracking and stacking speed/XP bonuses
- [ ] Paladin Healing Aura — AoE regen to nearby players
- [ ] Vanguard Guardian's Presence — Weakness I to nearby mobs via @e selector
- [ ] Archmage Mana Attunement — tier-scaling magic amplifier (T1:0%→T4:15%)
- [ ] Void Summoner Soul Tether — lifesteal and XP from nearby mob deaths
- [ ] Battlemage Mana Shield — Resistance scaling with magic damage bonuses
- [ ] Magic damage sync — puffish_attributes → ars_nouveau + irons_spellbooks
- [ ] Compass of Return — bed tracking via BlockEvents.rightClicked, cross-dimension teleport
- [ ] Client installer — instance creation works, mod download mostly works, verifying final fix for regex escaping bug
- [ ] Transmuted materials — verify forge tags work in recipes, JEI hiding functional
- [ ] Iron's Spells loot tiering — spell books and inks by dimension tier
- [ ] AStages API method signatures — inferred from docs, looking good per user testing
- [ ] Simply Swords unique weapon IDs — 6 Abyss weapons unverified
- [ ] Apotheosis affix JSON schema compatibility (84 JSON affixes deployed, untested)
- [ ] Mekanism balance changes — generator nerfs, 2x RF costs, Digital Miner recipe
- [ ] Food system overhaul — hunger drain 2.5x, seed drops 5%, structure food reduction
- [ ] Farmer's Delight cooking conversion — 70 recipes

## LMFT (Load My Fucking Tags) Audit — 2026-04-22

LMFT intercepts invalid tag entries that would otherwise crash the server at datapack reload, logging each as an `[ERROR]` and skipping that one entry. The `[ERROR]` level is misleading — these are **non-fatal** by design; they're LMFT doing its job. Each line means "this entry in this tag was dropped; continue." Categorized below:

### Fixed this session

- **`twilightforest:portal/activator` ← `kubejs:reality_progression_token_t1`** — OUR bug. Our `kubejs/data/twilightforest/tags/items/portal/activator.json` referenced a nonexistent item. The T1 token was renamed `kubejs:twilight_progression_token_t2` (T2 was the pack's naming scheme for the TF-tier unlock). Swapped the tag to reference the correct item. TF portals will now actually accept the token.

### External mod data — not fixable from our side

| Tag | Missing entry | Mod shipping bad data | Impact |
|-----|---------------|----------------------|--------|
| `forge:bosses` | `cataclysm:old_netherite_monstrosity` | cataclysm_ut | Deprecated entity — same mod also ships the `cataclysm_ut:kill_monstrosity2` advancement against the same missing id. Remove cataclysm_ut or wait for update. |
| `ad_astra:can_survive_in_acid_rain` | `minecraft:lander` | ad_astra_more_structures | Wrong registry — `lander` is an entity, not a biome. Mod bug. |
| `forge:is_eyestalker` | `#forge:is_end` | enemyexpansion | References `#forge:is_end` biome tag which doesn't exist on this build. |
| `idas:has_structure/byg_redwood_biomes` | `byg:redwood_thicket` | idas_forge | BYG biome not registered. Either BYG version mismatch or biome removed. |
| `idas:has_structure/bygmohogany_biomes` | `byg:tropical_rainforest` | idas_forge | Same. |
| `ctov:wares/cardboard_box` | `wares:cardboard_box` | ctov | Wares mod not installed. Benign — CTOV gracefully handles Wares absence otherwise. |
| `ctov:wares/sealed_delivery_agreement` | `wares:sealed_delivery_agreement` | ctov | Same. |
| `minecraft:mineable/pickaxe` | `theabyss:infused_magma` | TATOS | Abyss item renamed/removed. |
| `quark:wraith_spawnable` | `quark:soul_stone` | bygonenether | Quark renamed `soul_stone`. Bygonenether points at old id. |
| `minecraft:tick` | `cataclysm_ut:main` | cataclysm_ut | Function tag references a function that doesn't exist. |
| `minecraft:load` | `chunky_player_pause:main` | chunky-player-pause | Same. |

### Option to suppress the noise

We could ship per-mod override tag files in `kubejs/data/<namespace>/tags/**/*.json` that re-declare each affected tag without the bad entry (`"replace": true` + our preferred list). That would make LMFT silent. But each file has to be hand-maintained when the upstream mod updates, and the current behavior — gracefully logging + skipping — is already correct; only the log volume changes. Left as-is for now.

## Session Log Audit — 2026-04-21 (02:23 server start)

### Fixed this session
- **Lootr `aggressive_mode` regressed to `true` across all 3 distros.** The 2026-04-19 fix flipped it to `false` to stop "every village chest is vanilla"; somehow it came back as `true`. Flipped back to `false` in `main/config/lootr-common.toml`, `server_distribution/config/lootr-common.toml`, `distribution/client/config/lootr-common.toml`. This is the root cause of the tester's "Wizard Tower non-converted chests" report — aggressive mode skips the per-block-entity check and misses structures whose chests arrive through non-standard placement paths (Structory Towers' wizard tower included).
- **`PlayerEvents.xpChange` doesn't exist in KubeJS 2001.6.5-build.16.** Startup log had `Unknown event 'PlayerEvents.xpChange'` on `attribute_sync.js:171`. Disabled that block with a comment explaining the fork/version gap. `xp_multiplier` attribute is inert until we find a working hook (candidate: tick-based diff of `player.totalExperience`).
- **`create:mixing` constructor signature rejected in `if_latex_rework.js`.** `Constructor for create:mixing with 2 arguments not found` on line 35. Wrapped that one recipe in try/catch so it fails loud-but-isolated — the rest of the latex pipeline (crushing, crucible, HDPE conversion) still registers cleanly.

### Documented, low severity (benign or external)

- **`AttributeFix` emits ~50 "Attribute ID 'apotheosis:X' does not belong to a known attribute" warnings on startup.** Apotheosis registers `apotheosis:mining_speed`, `apotheosis:fire_damage`, `apotheosis:crit_damage`, etc. at a later load phase than AttributeFix's verification pass. This is a well-known AttributeFix+Apotheosis load-order quirk — the attributes *are* registered at runtime; AttributeFix just skips validating them. The "Apotheosis gem in tower showing undefined attribute" tester report may be downstream of this: if a gem's affix references one of these attributes and the client's translation file doesn't have `attribute.name.apotheosis.*` entries populated, the tooltip renders the raw key. Not actionable from the server side — needs a client-side en_us lang audit.
- **Recipe parse warnings (~40 lines):** `botania:brew/*` failing because Botania's brew registry is null at recipe-parse time; `*_smithing` recipes missing `template` ingredient (1.20.1 smithing API changes); `deeperdarker:resonarium_*` smithing, `stalwart_dungeons:wartedtungsten*`, `traveloptics:*_weapon` etc. — all fall back to vanilla gracefully. These are mod-shipped recipes, not our code. Harmless.
- **Apotheosis enchantment level warnings (~15 lines):** `Enchantment minecraft:protection has min/max power 232/200 at level 9, making this level unobtainable.` Intentional — we've raised max levels to 10 via config; natural enchanting tables can't reach those levels but Apotheosis gear can via affixes. Not an error.
- **`cataclysm_ut:kill_monstrosity2` advancement unknown entity.** Cataclysm Ultimate Tweaks ships an advancement referencing `cataclysm:old_netherite_monstrosity` which the currently-loaded Cataclysm version no longer registers. Benign (advancement is just unobtainable). Remove Cataclysm Ultimate Tweaks or wait for it to update.
- **`NecromancerEntity` / `CryomancerEntity` AbstractMethodError in `EntityEvents.spawned`.** Ongoing known issue — `BROKEN_ENTITIES` guard in `mob_scaling_unified.js` covers Necromancer; need to extend the same set + early-exit to `CryomancerEntity` (class path: `io.redspace.ironsspellbooks.entity.mobs.wizards.cryomancer`). Tracked separately in the "Active Issues" block below.

### Active Issues (new)

### Magic Class Starter Kit — verification pending on NBT probe (ROOT CAUSE FOUND)
- **Status:** Root cause identified 2026-04-21 by decompiling the Origins-Forge jar. `OriginContainer.serializeNBT` writes `Origins` as a CompoundTag of `{layer_id: origin_id_string}`, not a ListTag of `{origin}` objects. Every probe in the codebase used the list shape and silently returned 0. Rewrote all 17 probes across 9 scripts to use the correct compound shape with explicit layer ids. Unblocked, but still needs an in-game test — tester to restart, roll a magic class, confirm the kit arrives within ~5s of class selection.

## Resolved

### Village Chest Accessory Double-Stack (2026-04-21)
- **Reported:** Tester saw the curated village artifact pool land, but occasionally two accessories in one chest.
- **Root cause:** `artifacts:cloud_in_a_bottle` lived in BOTH `villageArtifactPool` (the weighted per-village pool) and `artifactT1Pool` (the Overworld-wide type-level broadcast). The whitelist-based village predicate let cloud through, so a village chest could pull one artifact from the weighted roll AND a cloud from the T1 broadcast in the same generation pass.
- **Resolved:** Removed `cloud_in_a_bottle` from `villageArtifactPool` and tightened the village predicate to strip any item in `artifactT1Pool` unconditionally. Village pool is now 11 items at weight 5 each (≈ 11% artifact rate against air weight 440). Cloud still appears in non-village Overworld chests via the T1 broadcast.

### Codex Macro Rendering: `$(/bold)` showing as literal text (2026-04-21)
- **Reported:** Tester saw grammatical/formatting errors inside the codex.
- **Root cause:** 151 codex entry files used HTML-style closing macros `$(/bold)`, `$(/italic)`, `$(/warn)` (572 occurrences total) to close formatting. Patchouli only recognizes `$()` as the formatting reset — unrecognized `$(/name)` macros render as literal text on screen.
- **Resolved:** Replaced all three variants with `$()` across `datapack_sources/iridescent_codex/data/` and `.../assets/`. `$(/l)` (valid link closer) left untouched. Rebuilt jar via `build_codex.sh`, identical MD5 across all 3 distros.

### Magic Class Starter Kit: Duplicate Worker-Thread Chat Handler (2026-04-21)
- **Reported:** Audit during starter-kit status check.
- **Root cause:** `magic_class_starter.js` had a `!magicstart` chat handler that called `runCommandSilent` directly, matching the known worker-thread pattern that throws `JavaException: EventExit: result`. Same bug we fixed in `codex_delivery.js` two sessions ago, but the duplicate copy in this file slipped through. Also a stale `MAGIC_CLASSES` reference that would throw if the file ever loaded before `codex_delivery.js`.
- **Resolved:** Deleted the duplicate chat handler. Primary `!kit` / `!magicstart` handler lives in `codex_delivery.js` and defers through `tick_codexChatProcessor`. Fixed the `MAGIC_CLASSES` vs `MAGIC_CLASSES_SHARED` reference.

### Village Chest Loot: Double-Beds and Non-Curated Artifacts (2026-04-21)
- **Reported:** Tester feedback from a 14-chest /loot give sweep: "I saw 2 beds in one chest once, and there's an artifact in every chest. The artifacts don't seem to be restricted to our curated list either." Three distinct bugs stacked.
- **Root cause A — double-bed:** `white_bed` appeared in two overlapping weighted pools for the 5 `villageHouseChests` tables (plains/desert/savanna/snowy/taiga): once in their dedicated house QoL flavor pool at weight 30, and again in the general `villageQoLPool` at weight 35. Houses rolled on both pools in the same pass.
- **Root cause B — 100% artifact rate:** An earlier diagnostic commit had rebuilt `villageArtifactWeighted` as 12 artifacts only, no air slot. Any weighted pool without an air entry guarantees a hit every roll.
- **Root cause C — non-curated leak:** Section 1C broadcasts the full 15-item `artifactT1Pool` to every Overworld chest via `addLootTypeModifier(LootType.CHEST).anyDimension('minecraft:overworld').addLoot(...)`. The village sanitization tried to strip those with per-item string `removeLoot('id')`, but the type-level injection isn't reliably stripped by table-level string removals in a sibling modifier pipeline.
- **Resolved:**
  - Removed bed entry from `villageQoLPool` (houses still get one from their flavor pool).
  - Restored `Item.of('minecraft:air').withChance(440)` at the front of `villageArtifactWeighted` (12 artifacts at weight 5 = total 60, vs 440 air = ~12% artifact rate).
  - Added a predicate-based `removeLoot(function(stack) {...})` that whitelists `villageArtifactPool` and strips anything else from `artifacts:` / `relics:` / `celestial_artifacts:` namespaces. Predicate evaluates at roll time against the actual pool, so it catches type-level broadcast leaks regardless of registration order. Full rationale in `wiki/dev/lessons-learned.md` (2026-04-21).

### Create + Starlight Crash — removed (2026-04-19)
- **Reported:** Sporadic `IllegalStateException` in `BlockStarLightEngine.initNibble` when Create contraptions rendered in chunks with incomplete light data. Known Create + Starlight incompatibility, first seen 2026-04-03.
- **Previous state:** Starlight's `.pw.toml` deletions had been staged in the working tree but never committed, so a `-Force` full-zip resync re-pulled the file and the installer re-downloaded the jar.
- **Resolved:** Committed the `.pw.toml` deletions in `server_distribution/mods/.index/` and `distribution/client/mods/.index/`. Added `"starlight"` to the `$forceSkip` array in `server_install.ps1` (installer won't fetch the jar) and `delete_mod "*starlight*"` to `strip_client_mods.bat`/`.sh` (any leakage gets stripped post-install). Belt-and-suspenders.

### Sync Pipeline Silent Drift (2026-04-19)
- **Reported:** Tester's server had `.icraft_last_sha` matching latest commit but 3 config files were still at vanilla defaults (Majrusz damage_bonus 3.5/7/10, ScalingMobs uncapped, ImprovedMobs 0.15 / 0.4).
- **Root cause:** `phase0_sync.ps1` (server) and `sync_client.ps1` (client) had two bugs in their diff-based sync path: (a) SHA marker was written even if individual file downloads failed, so failed files never retried; (b) GitHub compare API caps `.files` at 300 and the threshold was `> 300`, meaning diffs of exactly 300 were treated as complete but were actually silently truncated.
- **Resolved:** Only write SHA on clean sync (`$errors -eq 0`). Treat `>= 300` files as API-truncated and fall back to full-zip. Full-zip path now uses `robocopy /E` instead of `Copy-Item -Recurse -Force` for reliable directory overwrites. Added `-Force` flag to both bats so drift can be cleared without manually deleting the marker. Also shipped `diagnose.ps1` + `diagnose.bat` in `server_distribution/` to capture server state into a single diagnostic file for remote review.

### Codex Category "Loading Error" — flag vs advancement gating (2026-04-19)
- **Reported:** Codex opened but one category showed "Loading error! (Hover for info)"; hover revealed "Entry does not have a valid category."
- **Root cause:** 6 categories + 36 entries used Patchouli's `"flag": "icraft:stage_tier_N"` field. Patchouli's `flag` checks config flags registered via `/patchouli flag` or `patchouli_flags` config — `icraft:stage_tier_N` was never registered there, so flag check returned false, categories stayed hidden, and entries referencing them were reported as orphaned.
- **Resolved:** Replaced `"flag":` with `"advancement":` across all 6 categories + 36 entries. Patchouli's `advancement` field reads Minecraft advancements — AStages grants `icraft:stage_tier_2/3/4` as real advancements via `kubejs/data/icraft/advancements/stage_tier_*.json`. Same intent, wired through the actually-implemented mechanism.

### Codex Landing-Page Text/Progress-Bar Overlap (2026-04-19)
- **Reported:** Book opens correctly but `landing_text` "Chapters expand as you grow in power" was overlapping the `show_progress: true` progress bar.
- **Resolved:** Set `"show_progress": false` in `book.json`. The codex is a reference guide, not a progression tracker.

### Codex "Invalid book" — modId mismatch with book.json path (2026-04-19)
- **Reported:** Persistent "Invalid book: icraft:iridescent_codex" tooltip on the codex item, through multiple attempted fixes (lowcodefml → javafml → KubeJS fallback).
- **Root cause:** Patchouli's `BookRegistry.init()` scans `data/{modId}/patchouli_books/` where `{modId}` is the scanning mod's own modId (confirmed via bytecode inspection of `lambda$init$2`). Our jar's modId was `iridescent_codex_data` but the book.json lives at `data/icraft/patchouli_books/iridescent_codex/book.json` — Patchouli was scanning the wrong directory and silently not registering the book.
- **Resolved:** Changed the mod's modId from `iridescent_codex_data` to `icraft` in both `META-INF/mods.toml` and the `@Mod` annotation. Jar filename unchanged (custom-JAR allowlists unaffected). Path now aligns with Patchouli's scan. Rebuilt via `build_codex.sh`; synced to all 3 distros.

### Blank Enchanted Books — wrong loot entry item type (2026-04-19)
- **Reported:** Enchanted books in chest loot spawn with no visible enchantments, despite the 2026-04-11 `.enchantWithLevels` fix and the 2026-04-18 persistent-filter-strip removal.
- **Root cause:** Vanilla `EnchantmentHelper.enchantItem()` checks `stack.is(Items.BOOK)` (plain book). On a plain book it creates a new enchanted_book ItemStack and writes to `StoredEnchantments` NBT via `EnchantedBookItem.addEnchantment()`. If the input stack is already `enchanted_book`, that check is false and the function falls into the `else` branch that calls `stack.enchant()`, which writes to `Enchantments` NBT — but enchanted books display from `StoredEnchantments`, so the book appears blank.
- **Resolved:** Changed all 8 `LootEntry.of('minecraft:enchanted_book')` uses in `lootjs_overhaul.js` to `LootEntry.of('minecraft:book')`. The `.enchantWithLevels(...)` function now converts the plain book to an enchanted book itself and writes to the correct NBT tag, matching vanilla loot tables.

### NecromancerEntity Crash — Incomplete Guard (2026-04-19)
- **Reported:** Log review showed `NecromancerEntity.getItemBySlot ... is abstract` crash still firing on every Necromancer spawn; the 2026-04-06 fix was incomplete.
- **Root cause:** `BROKEN_ENTITIES` guard only lived in `mob_scaling_unified.js`. `mob_equipment.js` accesses item slots too (via `entity.mainHandItem` + `entity.getItemBySlot('chest')` in `hasExistingGear()`) with no guard. Try/catch in that function doesn't help — Rhino's JS `catch` doesn't intercept Java `Error` subclasses like `AbstractMethodError`; they propagate unwrapped to KubeJS's event-handler wrapper.
- **Resolved:** Added `MOB_EQUIP_BROKEN_ENTITIES` set + early-exit guard at the top of `mob_equipment.js`'s spawned handler. Documented cross-file sync requirement in both files.

### Blank Enchanted Books in Loot (2026-04-18)
- **Reported:** Tester feedback — enchanted books in chests still appearing empty (no stored enchantments) despite the 2026-04-11 `.enchantWithLevels` fix.
- **Root cause:** A global `removeLoot('minecraft:enchanted_book')` at lines 118-130 of `lootjs_overhaul.js` created a persistent filter (documented 2026-04-15) that caught our tier re-adds in the same evaluation pass, stripping either the entries or their `.enchantWithLevels(...)` function and leaving blank books.
- **Resolved:** Deleted the global strip. Vanilla loot tables now generate their own naturally-enchanted books; our tier re-adds layer tier-scaled enchants on top at per-dimension rates. Synced to all 3 distros.

### Iridescent Codex "Invalid book ID" on World Join (2026-04-18 → 2026-04-19)
- **Reported:** Tester — "Invalid book ID" on world join, both singleplayer and dedicated server.
- **Diagnostic (tester screenshot of in-game Mods list, 2026-04-19):** The `lowcodefml` codex mod **was loading** (State: done), but Patchouli still reported "Invalid book". Rules out Forge-side loading; pins the issue on Patchouli's `BookRegistry.init()` not iterating `lowcodefml` mods' `data/` the way it does `javafml` mods.
- **Resolved (2026-04-19):** Rebuilt the codex jar as a proper `javafml` mod with a compiled `@Mod` class (`com.iridescentcraft.codex.IridescentCodex`), mirroring the working `iridescent_origins-1.0.0.jar` pattern. Build pipeline: `src/` contains the @Mod entrypoint, `stub/` contains a Forge annotation stub so `javac` can compile without the Forge jar on classpath (only the real class ends up in the output). `mods.toml` switched to `modLoader="javafml"` with forge/minecraft/patchouli dependencies. KubeJS fallback kept in place as a harmless safety net.
- **Reported:** Tester feedback — "Invalid book ID" error on world join, both singleplayer and dedicated server.
- **Root cause:** Four copies of `book.json` existed across the modpack with inconsistent `use_resource_pack` config. KubeJS datapack had `true`, Paxi zip had it missing (defaults to `false`), mod jar had no `mods.toml` so Forge ignored it entirely. Patchouli registered whichever source won the load-order race, and client vs server could land on different winners.
- **First attempt (morning):** Added `META-INF/mods.toml` to the codex jar (`lowcodefml` loader) to register via Forge's mod loading. Deleted Paxi zip + KubeJS copies to eliminate duplicates.
- **Tester follow-up:** Screenshot showed "Invalid book" still present — either lowcodefml doesn't expose the jar's `data/` to Patchouli's scanner, or client `sync_client.ps1` size-diff missed the jar update.
- **Resolved (evening):** Belt-and-suspenders — restored the KubeJS `data/` + `assets/` registration alongside the mod jar. Both ship **identical** `book.json` (byte-for-byte matched), so whichever path Patchouli honors, the book registers consistently. Paxi zip (the original conflict source) stays deleted.

### Full-Iron One-Shots on Overworld (2026-04-17 / revised 2026-04-18)
- **Reported:** Tester feedback — players in full iron getting one-shotted on Overworld.
- **Root cause:** Three compounding systems pushed T1 damage past the 1.0x design envelope: Majrusz's `mobs_spawn_stronger` added +3.5 flat damage at Normal stage (turning a 3-damage zombie into 6.5), ScalingMobs had uncapped daily damage scaling (+3%/day), and Improved Mobs' difficulty-scaled equipment enchants layered on top.
- **Resolved:** Tiered damage values. Majrusz `damage_bonus` 3.5/7.0/10.0 → 1.5/3.0/5.0 (Normal/Expert/Master). ScalingMobs `Damage Scale Rate` 0.03 → 0.015, `Max Scaled Damage` capped at 0.20. Improved Mobs `Equipment Addition` 0.15 → 0.05, `Damage Increase Multiplier` 0.4 → 0.2. Synced to all three distributions.
- **Revision (2026-04-18):** Initial pass also reduced Majrusz `health_bonus` (0.5/0.75/1.55 → 0.25/0.5/1.0). Reverted to defaults after tester feedback confirmed incoming damage was the issue — mob tankiness wasn't the problem and reducing HP made mobs feel squishy.

### Ars Nouveau Glyphs Missing from Loot (2026-04-17)
- **Reported:** Tester feedback — Ars Nouveau spell books "blank" / useless.
- **Root cause:** Spell books are caster tools that require glyphs inscribed at a Scribes Table, but no glyphs existed in any chest loot. Players couldn't obtain glyphs without deep research progression.
- **Resolved:** Added tiered glyph pools to `lootjs_overhaul.js` — T1 18 glyphs (Forms + basic effects/augments) at ~12%, T2 25 at ~14%, T3 22 at ~15%, T4 12 at ~18%. Forms (projectile/touch/self/aoe) front-loaded so spellbooks function from T1.

### KubeJS TypeError Spam (2026-04-08)
- **Resolved:** Fixed `source.type.includes` called on non-string values, `getItemSlot` not available in KubeJS 6 API. Ignis Core TypeError also resolved. All three errors eliminated from server logs.

### FTB Mods Removed (2026-04-08)
- **Resolved:** All 8 FTB mods removed (Backups, Chunks, Essentials, Library, Quests, Ranks, Teams, Ultimine). Replaced with FastBack (git-based backups), LiteMiner + Amber (veinmining), Open Parties and Claims (chunk claiming).

### Champions Removed (2026-04-07)
- **Resolved:** Champions Unofficial removed entirely. Broken rank config system that could not be fixed, unmaintained with no upstream activity, error spam on every mob spawn event causing server lag.

### NecromancerEntity Crash (2026-04-06)
- **Resolved:** Added `BROKEN_ENTITIES` early-exit list in `mob_scaling_unified.js`. NecromancerEntity and other broken entities are skipped before any scaling logic runs, preventing server crashes.

### Tetra Attribute Rebalancing Removed (2026-04-05)
- **Resolved:** Mod delisted from CurseForge, no longer available for download. Was already broken by Tetra 6.13.0 mixin changes. Removed from all distributions.

### Blue Skies Balance Pass (2026-03-16)
- **Resolved:** Dusk Arc removed, Shadow Armor removed, Runic Arc boss-drop only. Diopside/Charoite/Horizonite nerfed to T2 + Tetra integration (23 materials).

### Abyss Overhaul (2026-03-16)
- **Resolved:** 30 ring recipes removed, 8 custom rings created, 7 armor set bonuses implemented, boss drop gating added. Replaces earlier "Planned" status.

### End Overhaul (2026-03-16)
- **Resolved:** Dragon Exploration Gate implemented (explore first, fight dragon last). 9 advancement overrides, 5 End Apotheosis affixes, Void Blossom loot fix, entity ID fixes, Moog's End Structure loot populated.

### Aether + Abyss Dimension Mechanics (2026-03-16)
- **Resolved:** Aether mechanics (thin air, vertigo, updrafts) and Abyss mechanics (oppressive darkness, corruption, fear aura) implemented.

### TF Portal Activator Change (2026-03-16)
- **Resolved:** Twilight Forest portal activator changed from diamond to T1 boss token.

### Undergarden Tetra Integration (2026-03-16)
- **Resolved:** 4 Undergarden metals added to Tetra (27 materials total).

### Server Distribution (2026-03-16)
- **Resolved:** Server distribution folder created for packaged deployment.

### Mekanism Balance Overhaul (2026-03-16)
- **Resolved:** Generator nerfs, 2x RF costs for all machines, Digital Miner recipe changed, tool/armor recipes removed.

### Food System Overhaul (2026-03-16)
- **Resolved:** Hunger drain 2.5x, seed drops 5%, structure food reduction, spawn protection.

### Farmer's Delight Cooking Conversion (2026-03-16)
- **Resolved:** 70 recipes converted to Farmer's Delight cooking mechanics.

### Config Review Pass Complete (2026-03-16)
- **Resolved:** Easy Anvils verified correct (repair costs meaningful). Disenchanting Table and Table of Experience T2-gated. DarkOrb Orb of Origin T2-gated. Enchantment Transfer fine (XP cost is gate). Azukaar's stat scaling zeroed. Icarus wings T3-gated (5 new recipes). Configurable Extra Mob Drops audited (empty, safe). Aethersteel moved to T4.

### Terramity Content Removal (2026-03-16)
- **Resolved:** 22 gun recipes removed, 64 armor pieces across 16 sets removed, gunsmith station removed. Bosses, structures, mobs, accessories untouched.

### Bug Fixes (2026-03-16)
- **Apotheosis affix JSONs:** Uppercase rarity keys changed to lowercase (fixed world load crash).
- **Cherry Village:** Template pool feature references fixed (unregistered feature crash).
- **Zeta race condition:** Coremod jar added to synchronize ForgeZetaEventBus.

### Tetra Modded Materials (2026-03-16)
- **Resolved:** 20 modded metal material definitions created as Paxi datapack (expanded from 15 to include Abyss + F&A metals). Covers T1-T4 metals for Tetra tool crafting. Diamond hammer tier added.

### Champions Custom Affixes Implemented (2026-03-15)
- **Fix:** 5 custom affixes (Commanding, Draining, Hexing, Leaping, Summoning) implemented in `custom_champion_affixes.js`. Per-dimension spawn scaling added.

### Skill Effects Fully Functional (2026-03-15)
- **Fix:** All 22 scoreboard objectives now functional. 6 Engineering placeholders replaced with working implementations in `skill_effects.js`.

### Vanilla Origin Layer Overlap Fixed (2026-03-15)
- **Fix:** `origins:human` removed from vanilla Origin layer. 3-prompt flow is now Origin (9 vanilla) → Race (7 custom) → Class (10 custom). No more overlap between vanilla origins and custom races.

### Diamond/Netherite Derivative Items Gated (2026-03-15)
- **Fix:** AStages restrictions expanded to gate diamond/netherite/End derivative items. 6 advancement overrides added in `astages_restrictions.js`.

### Mob Equipment API Fixed (2026-03-14)
- **Fix:** Replaced `setArmorSlot`/`getArmorSlot` with `setItemSlot`/`getItemBySlot` (KubeJS 6.x API). Fixes log spam.

### Codex Formatting + Advancement Gating (2026-03-14)
- **Fix:** All 80 entries formatted with tier color macros, $(thing)/(item)/(warn)/(note) markup. Fixed unclosed tags.
- T2+ categories and entries gated via `advancement` field (not `flag`).

### Apotheosis Affixes Complete (2026-03-14)
- **Fix:** 112 new affix JSONs added (30→142 total). Covers all tiers, dimensions, bosses, equipment types.

### Origins++ Overlap Investigated (2026-03-14)
- **Result:** No removals needed. Zero name collisions with icraft races, different layers.

### Patchouli Codex Working (2026-03-14)
- **Fix:** Multiple issues resolved over ~10 iterations:
  - Mod JAR with `use_resource_pack: true`, content in both `data/` and `assets/`
  - `flag` fields removed (Patchouli flags are config flags, not advancements)
  - Categories use `icraft:` namespace, landing text shortened, progress bar disabled
  - Book ID: `icraft:iridescent_codex`, delivered via `codex_delivery.js`

### Mod Book Suppression Working (2026-03-14)
- **Fix:** `/clear` commands with NBT matching for patchouli books. Runs every 1s for first 10s after login, then every 10s for 2 min. KubeJS inventory slot manipulation is broken — only `/clear` works.
- Suppressed: terramity, simplyswords, footwork, ars_nouveau, irons_spellbooks, thermal, botania, create, theabyss

### LootJS setCount() API Error (2026-03-14)
- **Fix:** `LootEntry.of(item, [min, max])` instead of `.setCount()`. 15 occurrences fixed.

### Diagnostic Scripts Disabled (2026-03-14)
- **Fix:** `loot_discovery.js` and `registry_verify.js` disabled.

### KubeJS Script Errors — All Resolved (2026-03-14)
- All 5 reported errors were already handled via workarounds or correct placement.

### Paxi Not Loading Datapacks (2026-03-12)
- **Fix:** Discovered Paxi only loads zips. Created zip versions of all datapacks.

### Changes Not Reaching Game (2026-03-12)
- **Fix:** All changes must be committed AND pushed. User pulls via GitHub Desktop.

### Stray Windows Installer in Config (2026-03-12)
- **Fix:** Deleted `config/paxi/datapacks/Ground Control_x64_en-US.msi`

### pack_format Wrong (2026-03-12)
- **Fix:** Changed codex `pack.mcmeta` from format 15 to 12 (correct for 1.20.1)

### Vanilla Origins Overhaul (2026-03-17)
- **Resolved:** All 9 vanilla origins rebalanced. No lethal environmental effects, food preferences not restrictions. Mundane origin re-added. All power descriptions updated.

### Race Layer Rebalance (2026-03-17)
- **Resolved:** Elf (+15% ranged, +5% magic), Dwarf (halved mining hunger), Orc (+10% melee, knockback fix), Halfling (+20% food efficiency functional), Faefolk (magic 15%→30%, -50% armor toughness, -10% HP), Revenant (sunlight→weakness+slow, night vision, darkness bonuses, -20% healing functional).

### SuperMartijn642 Mod Family Removed (2026-03-17)
- **Resolved:** Rechiseled, Connected Glass, Trash Cans all removed — depend on SuperMartijn642's Core Lib which has a load order incompatibility. All `.pw.toml` metadata deleted, added to server force-skip + strip lists.

### Duplicate Origin Definitions Fixed (2026-03-17)
- **Resolved:** All 17 origin JSONs (7 races + 10 classes) + origin layer definition were duplicated in `kubejs/data/` alongside the Paxi datapacks. Caused malformed second class prompt on dedicated server. Removed KubeJS copies.

### Codex Book Suppression Login Timeout Fixed (2026-03-17)
- **Resolved:** `botania:lexicon` was in `PATCHOULI_BOOKS_TO_CLEAR` but is its own item, not a Patchouli guide book. Generated malformed `/clear` command every second on login, causing connection timeout on dedicated server. Moved to `OTHER_BOOKS_TO_CLEAR`.

### Server Distribution Overhaul (2026-03-17)
- **Resolved:** Unified `iridescentserver.bat` (auto-install Forge + download mods + strip client mods + launch + crash logging). Added `mods/.index/` with 452 `.pw.toml` files. `strip_client_mods.bat` verified — no false positives.

### Pretty Rain Removed (2026-03-17)
- **Resolved:** Removed due to Cloth Config incompatibility.

### Walkable Mekanism Cables Coremod (2026-03-17)
- **Resolved:** v1.0.1 deployed with LocalVariableTable fix.

### Apotheosis Affix Tuning (2026-03-17)
- **Resolved:** Dimension key prefixes fixed, Overworld Affix Item generation reduced from 50% to 25%.

### Tectonic Terrain Tuning (2026-03-17)
- **Resolved:** vertical_scale 1.155→0.8 (-31%), ridge_scale reduced.

### Village loot: catch-all tag strips killing glyphs + books, white_bed only on houses, rotten flesh on modded villages (2026-04-20)
- **Resolved:** Full audit of village chest pipeline after tester reported three persistent complaints: rotten flesh still appearing, Ars Nouveau glyph tiering not landing, no beds. Three distinct bugs:
  1. `@ars_nouveau`, `@irons_spellbooks`, `@moreartifacts` tag-based `removeLoot` calls in the village sanitization block (`lootjs_overhaul.js:1450`) were silently eating every same-namespace item re-added later in the same pass. Per the LootJS persistent-filter rule, `removeLoot('@modid')` establishes a filter on that namespace for the rest of the evaluation → T1 glyphs from SECTION 2's global Overworld adds AND the `common_ink`/`copper_spell_book`/`novice_spell_book`/`source_gem` re-adds in SECTION 6B were all being stripped before they could land. Replaced the three catch-all strips with specific-item strips only for items we explicitly don't want in villages (apprentice + archmage spell books, tier tokens).
  2. `white_bed` was only being added inside `villageHouseChests.forEach` (5 tables: plains/desert/savanna/snowy/taiga). Tester was opening butcher/tannery/fisher/weaponsmith chests where no bed code ran. Added 20%-chance white_bed adds to both `villageChests.forEach` (15 tables) and `moddedVillagePatterns.forEach` (CTOV/VnP regex patterns).
  3. Rotten flesh strip only covered the 15 vanilla villageChests tables, not modded village variants. Added `.removeLoot('minecraft:rotten_flesh')` to every modded village pattern.

### Lootr aggressive_mode: flipped back to true (2026-04-20)
- **Resolved:** Tester: "first village chests aren't converting at all — shared inventory, regular vanilla chest." Server log showed `LootrAPI: There are over 5000 entries in the pending conversion list.` Under `aggressive_mode = false`, Lootr's ticker queue couldn't keep up with IridescentCraft's ~30 structure mods spawning chests — village chests opened before the ticker processed them. Flipped back to `aggressive_mode = true` across all 3 distros. Tradeoff documented in `wiki/dev/lessons-learned.md`: this is the third flip of the same bit, neither mode is "correct" under our load profile — aggressive may miss a small % of chests, non-aggressive misses most under current backlog. If aggressive starts missing specific chest types, fix additively via `additional_chests` entries in `lootr-common.toml`, not by flipping the flag.

### Starter kit tied to Codex delivery (2026-04-20)
- **Resolved:** Tester reported Archmage starter kit still not firing despite magic_class_starter.js login hook. Codex delivery via `PlayerEvents.loggedIn` is now confirmed working reliably, so the starter kit logic was piggybacked on it: on login, the codex is delivered immediately, and a 60-tick (3s) countdown arms via `persistentData.icraft_starter_check_ticks`. When it hits zero, class detection + grant runs from the `tick_codexStarterCheck` handler in `codex_delivery.js`. `!codex` also re-arms this countdown so the tester can manually trigger a re-check. Standalone `magic_class_starter.js` stays in place for its 5-second polling fallback and `!magicstart` manual command. Shared persistent flag `icraft_magic_starter_<class>` between both files prevents double-grant.

### Village Clutter (Ferns, Feathers) + Blank Enchanted Book Strip (2026-04-19)
- **Resolved:** Two more issues from tester feedback. (1) Ferns, large ferns, grass, tall_grass, feathers, emeralds, and tree saplings kept appearing in village chests. Root cause: `kubejs/data/minecraft/loot_tables/chests/village/village_{desert,plains,savanna,snowy,taiga}_house.json` — KubeJS overrides of the vanilla village house tables that included all that clutter in their native pools (biome-flavor items that felt like junk). Stripped 17 clutter entries across the 5 tables (`fern`, `large_fern`, `grass`, `tall_grass`, `feather`, `emerald`, `oak_sapling`, `acacia_sapling`, `spruce_sapling`, `dandelion`, `poppy`, `dead_bush`, `green_dye`). Kept iron_nugget, raw_copper, string, torch, leather, food, book, `irons_spellbooks:scroll`, and biome-appropriate non-junk (spruce_log, snow_block, cactus, pumpkin_seeds). (2) Tester reported `minecraft:enchanted_book{}` (empty StoredEnchantments) still showing up despite the 2026-04-18 `book.enchantWithLevels` fix — likely a modded loot table injecting raw enchanted_book without the enchant function. Added a predicate-based `removeLoot` at the top of SECTION 1 that targets only blank enchanted books (empty `StoredEnchantments` NBT), letting vanilla and our tier re-adds pass through untouched.

### Village Weapon Strip Bug + QoL Additions (2026-04-19)
- **Resolved:** Tester feedback: "I never see any beds, still see a lot of random junk, never see iron bars, rarely see weapons." Root cause of the weapon rarity was a persistent-filter violation at `lootjs_overhaul.js` line ~901 — the `vanillaVillageSmithChests.forEach` block stripped `minecraft:iron_sword`, `iron_pickaxe`, `iron_helmet/chestplate/leggings/boots` before the later `addWeightedLoot` block at line ~1316 added them back with weighted chances (iron_sword 20, iron_pickaxe 20, iron_axe 15, leather set 10–15 each). Per the 2026-04-15 LootJS persistent-filter discovery, `removeLoot(specific_id)` catches same-item re-adds in the same evaluation pass, so the weighted pool was being fully consumed by the earlier strip. Removed the iron gear strip. Vanilla tables + curated weighted layer now stack additively. Also added to each village house chest: `white_bed` @ 20%, `iron_bars` × 2-6 @ 15%, `lantern` × 1-2 @ 12%, `bell` @ 4%, `oak_boat` @ 6%, `hay_block` × 1-3 @ 10%. Clutter strip added (`feather`, raw `porkchop`/`chicken`, `rabbit_foot`, `rabbit_hide`) — these don't conflict with later re-adds.

### Blank "Enchanted Books" Showing as Codex (2026-04-19 — INFO NEEDED)
- **Investigation:** Tester reports "blank enchanted books are still being injected, but apparently as the codex item." Scanned the active loot scripts — no code path injects `patchouli:guide_book` into chest loot (only `codex_delivery.js` gives it to players on login or via book+lapis recipe). Leading hypothesis: `config/paxi/resourcepack_load_order.json` references `iridescent_codex_resources.zip` which is not in the repo but may exist on the user's Windows client. If that resource pack overrides `minecraft:enchanted_book` model or textures, it would make real enchanted books *appear* as the codex model — giving the visual "codex-looking book" effect while the item is genuinely a blank enchanted book. **Need from tester:** exact item ID when hovering the book in inventory (F3+H for advanced tooltips shows the real namespace:item).

### Epic Dungeons Namespace Miss + Magic Class Starter (2026-04-19)
- **Resolved:** Two fixes shipped together after verified structure-mod audit. (1) Epic Dungeons mod slug is `epic-dungeons-a-roguelike-minecraft` but its *internal data namespace* is `overhauledstructures` — a prior audit had mistakenly marked this "dead" and removed its LootJS block. Overworld-spawning dungeons (`#minecraft:is_overworld`, spacing 32/24) were dropping netherite (~4.5%) and diamond armor (~1.5%) out of three dungeon families (`ovdb_*`, `ovdp_*`, `ovds_*`) × 4 tiers (`chest_1/2/3/m`). Added a full overhaul block in `lootjs_overhaul.js` SECTION 4B: strips diamond/netherite gear across all 12 tables, adds a universal T1 magic/progression kit (tier1_token, source_gem, common_ink, enchanted books, copper_spell_book @ 6%), and applies per-family thematic additions (ovdb=torches/bread/iron/map, ovdp=chains/soul_lantern/bones/rotten_flesh, ovds=string/cobweb/spider_eye), with `chest_3` + `chest_m` getting a bonus magic-item drop layer. (2) Tester feedback: "variable whether you can even play the [magic] class early" — Archmage/Battlemage/Void Summoner need a catalyst to cast spells but none were guaranteed. New `kubejs/server_scripts/origins/magic_class_starter.js` gives a one-time kit on first class detection (persistent flag `icraft_magic_starter_given`): Archmage = copper_spell_book + novice_spell_book + 5 source_gem + 2 common_ink; Battlemage = copper_spell_book + 3 source_gem + 1 common_ink; Void Summoner = copper_spell_book + 1 common_ink + 1 ender_pearl. Also verified via jar inspection: all 5 newly-audited mods (brutalbosses, cataclysm_ut, stalwart-dungeons, ad-astra-more, epic-dungeons) use vanilla chests → no Lootr `additional_chests` edits needed.

### Codex Still Empty After modId Fix (2026-04-19)
- **Resolved:** Book was registering correctly after the `modId="icraft"` fix, but the client still showed empty contents with error `Entry in file icraft:patchouli_books/iridescent_codex/en_us/entries/bosses/t1_bosses.json does not have a valid category` and warnings `Queried for unknown config flag: icraft:stage_tier_3/4`. Root cause: Minecraft's resource pack priority (mod_resources → vanilla → KubeJS Resource Pack [assets]) means `kubejs/assets/` **overrides** the jar's `assets/`. The stale `kubejs/assets/icraft/patchouli_books/iridescent_codex/` folder (left over from the pre-jar KubeJS-fallback era) had all categories using the OLD `"flag":` gating, which Patchouli 1.20.1-85 doesn't recognize — category parse failed → every entry's category lookup failed → book rendered empty. Deleted `kubejs/assets/icraft/patchouli_books/iridescent_codex/` and `kubejs/data/icraft/patchouli_books/iridescent_codex/` in all 3 distros (jar ships both `assets/` and `data/` so no content is lost). Also removed `server_distribution/global_packs/required_data/iridescent_codex.zip` (legacy Paxi 3.x path also carrying the old `"flag":` content).

### Rivers Never Generating (2026-04-19)
- **Resolved:** Two issues combined. (1) Prior "more water" commit 3b14ec9d had direction inverted: `ridge_scale 0.08` and `erosion_scale 0.10` are both *below* Tectonic defaults and produce flatter, less-carved terrain with fewer river channels. Restored above defaults: `ridge_scale 0.3`, `erosion_scale 0.4`. (2) `bop_biome_weights.zip` → `bop_custom_region.json` (a `terra:overworld` region) listed 20 landmass biomes but neither `minecraft:river` nor `minecraft:frozen_river`, so BoP's region was outcompeting vanilla for the river parameter slots. Added `minecraft:river` (weight 20) + `minecraft:frozen_river` (weight 6). Source-tracked the zip at `datapack_sources/bop_biome_weights/` (previously it was a pre-built zip with no source). New chunks only.

### Improved Mobs Rebalance (2026-03-17)
- **Resolved:** 3 in-game day grace period, equipment/damage caps halved, diamond→iron for mob breaking tools.

### LootJS Clutter and Food Tuning (2026-03-17)
- **Resolved:** Horse armor, spider eyes, etc. removed from loot tables. Structure food reduction increased from 70% to 90%.

### Early Magic Access (2026-03-17)
- **Resolved:** Iron's Spells scrolls and copper spell book added to Overworld chest loot.

### HDPE/Rubber Pipeline (2026-03-17)
- **Resolved:** HDPE Circuit Board recipe added. Alternative Mekanism machine recipes. IF latex/rubber rework (logs→latex via Create/Thermal, HDPE→dry rubber).

### Paxi Datapacks Not Loading on Dedicated Server (2026-03-19)
- **Resolved:** Paxi Forge 4.0 loads from `config/paxi/datapacks/`, not `global_packs/required_data/` on dedicated servers. All 17 datapacks moved. Added `cd /d %~dp0` to bat for correct working directory.

### Cherry Village Removed (2026-03-19)
- **Resolved:** Removed due to unregistered worldgen feature crash. Added to force-skip + strip lists.

### Gods & Heroes RPG Classes Removed (2026-03-19)
- **Resolved:** `.pw.toml` still present, installer re-downloaded the mod every run. Injected broken class origins (hunter, warrior) into Origins class layer. Deleted metadata, added to force-skip + strip lists.

### Origin Layer Order Missing (2026-03-19)
- **Resolved:** Added `order` (0, 1, 2), `enabled: true`, `name`, and `gui_title` to all three origin layer JSONs. All three prompts confirmed working on dedicated server.

### Custom Content Missing Translations (2026-03-19)
- **Resolved:** Added 185+ translation entries: 72 KubeJS items, 29 enchantments, 440 Apotheosis affix key variations, Gender layer. All synced to server and client distributions.

### Enchanted Book Loot Rebalance (2026-03-19)
- **Resolved:** Enchanted books no longer globally removed. Scaled by dimension difficulty (7.5% OW → 15% End). Ars Nouveau spell books added by tier.

### Loot Table Overhaul (2026-03-19)
- **Resolved:** Village smith chests get 20% artifact chance. Ocean structures heavily oceanic-themed. Towers of the Wild get artifact drops. Village affix gear limited to white/green. Magic materials boosted in structure chests.

### Pig Rift Shard Bug (2026-03-30)
- **Resolved:** Root cause was 30 mods with `side='server'` instead of `side='both'` in client `.pw.toml` index. Client never downloaded those mods, causing missing entity registrations and loot modifier failures. All 30 mods corrected.

### Class Layer Duplication (2026-03-30)
- **Resolved:** `iridescent_classes.jar` had baked-in origin layers that duplicated the datapack layers. Rebuilt jar without baked-in layers. `global_packs/required_data` moved to `datapack_sources` to prevent double-loading.

### Tetra 6.13.0 Incompatibility (2026-04-03)
- **Resolved:** Rolled back Tetra to 6.12.0. Tetra 6.13.0 broke: TSB (ModuleModel removed), Tetra Attribute Rebalancing (mixin fail), module model deserialization. Art of Forging downgraded 1.8.5→1.8.4. Upgrade blocked until TSB + addons update.

### "None" Spell Scrolls (2026-04-03)
- **Resolved:** Iron's Spellbooks scrolls in LootJS loot tables were bare items without `randomize_spell` function. Added `irons_spellbooks:randomize_spell` custom function with tier-scaled quality ranges.

### Heracles Quest Not Triggering (2026-04-03)
- **Resolved:** First Blood quest was only in `defaultconfigs/` (new worlds only). Copied to `config/heracles/quests/main/` for existing worlds.

### AStages Food Blocking (2026-03-30)
- **Resolved:** AStages mod-wide gates for Thermal, Ars Nouveau, and other mods with food/crop items blocked players from eating/harvesting those items at any tier. Removed mod-wide gates for affected mods.

### LootJS Overhaul Parse Failure (2026-04-11)
- **Resolved:** Unescaped apostrophe in single-quoted string (`'Iron's Spellbooks ...'`) broke entire loot overhaul file. Switched to double quotes.

### Blank Enchanted Books (2026-04-11)
- **Resolved:** LootJS 2.x silently discarded loot functions passed as plain JSON. Switched T1-T4 enchanted book re-adds to `.enchantWithLevels(min, max, treasure)`.

### Equipment Compare Tooltip Breakage (2026-04-11)
- **Resolved:** Equipment Compare's shift-hold tooltip handler broke shift-expand for Relics, Mekanism, Tag Viewer, and Jade. Fully removed from all three distributions.

### ArchevokerEntity Crash (2026-04-12)
- **Resolved:** Added to `BROKEN_ENTITIES` early-exit list in `mob_scaling_unified.js`.

### Tiered Artifact Loot System (2026-04-12)
- **Resolved:** Implemented global strip (Section 1B) + per-dimension re-injection (Section 1C) architecture. Artifacts now appear at tier-appropriate rates instead of random mod injection.

### Village Loot Flooding (2026-04-12)
- **Resolved:** Stacked GLMs were producing ~25-30% artifact rates in village chests. Replaced with curated 25-artifact pool at ~4% combined rate. Diamond/iron gear stripped.

### Class Artifacts Integration (2026-04-11)
- **Resolved:** Epic RPG: Class Artifacts integrated as drops-only system. Native loot GLMs blocked, LootJS re-adds at controlled tier-gated rates. Native elite mob system disabled.

### Server Self-Update (2026-04-12)
- **Resolved:** `iridescentserver.bat/.sh` can now update themselves via Phase 0.5 staging mechanism. One-time manual copy required to bootstrap.

### Server Main-Thread Stall During Dungeon Crawl Worldgen (2026-04-12)
- **Resolved:** Chunky auto-pregen now runs on first world load (radius 1500). Dungeon Crawl `extended_debug` disabled, chunky-player-pause keeps pregen off main thread while players are online.

### Loot Rate Finalization (2026-04-15)
- **Resolved:** Artifact rates finalized: Village 8%, T1 10%, T2 12%, T3 14%, T4 16%. LootJS persistent filter issue resolved (global strip removed for artifact/celestial/relics namespaces). Ars Nouveau bytecode-patched. Kitty Slippers removed. Village pool fix applied.

### Worldgen Tuning (2026-04-15)
- **Resolved:** Snow biome reduction (temperature_offset 0.15, BOP snow biomes disabled). More water worldgen (ridge 0.08, ocean -0.35, erosion 0.10).

### Distribution Sync Tooling (2026-04-15)
- **Resolved:** `verify_distros.ps1/.bat` added with `-Fix` auto-copy mode. 21 missing distro files discovered and synced.
