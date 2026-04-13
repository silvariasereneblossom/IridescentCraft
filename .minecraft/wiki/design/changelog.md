# Design Changelog

All changes to the master design document are logged here with date, description, and reason.

---

## 2026-04-12 — iridescentserver bat/sh now self-updates

### Self-Update Mechanism
- Previously `iridescentserver.bat` and `iridescentserver.sh` were self-excluded from the Phase 0 overlay — meaning the self-updater couldn't update itself. Any fix to Phase 0 required the server operator to manually replace the bat file before the fix took effect
- New behavior: Phase 0 SHA1-compares the incoming bat/sh against the current version. If they differ, stages the new file as `iridescentserver.bat.new` / `.sh.new` alongside the current one
- Immediately after Phase 0, a Phase 0.5 block checks for the `.new` file:
  - **Windows (`.bat`):** invokes PowerShell to `Move-Item -Force` the `.new` over the current bat (works on Win10+ because cmd.exe holds the bat with `FILE_SHARE_DELETE`), then `Start-Process` launches a new cmd.exe with the updated bat, then `exit /b 0` terminates the original cmd
  - **Linux (`.sh`):** plain `mv -f`, `chmod +x`, then `exec` replaces the current process with the updated script, inheriting args
- **One-time manual step required** to transition to this system: the operator must manually copy the new `iridescentserver.bat/.sh` to their server **once**. After that, all future updates happen automatically

### Why It's Safe to Overwrite a Running Bat
- On Windows 10+, cmd.exe opens batch files with share modes that include `FILE_SHARE_DELETE`, so another process can delete or rename the file while cmd holds it open. The existing handle continues to reference the old file content, allowing cmd to finish reading its current line, then exit cleanly. The relaunched cmd.exe opens the new file from scratch
- On Linux, `exec` replaces the process image entirely — the kernel loads the new script fresh, no handle issues

---

## 2026-04-12 — Server Phase 0 paxi datapack verification pass

### Root Cause
- `icraft_loot_overrides.zip` (549K, Apr 10) and `icraft_progdiff_overrides.zip` (14K, Apr 8) were failing to deploy to the tester's dedicated server during `iridescentserver.bat` Phase 0 overlay, even though the files existed in the repo and `sync_client.ps1` was deploying them correctly to the client
- `/datapack list` on the running server confirmed neither zip was loaded by Paxi — all older paxi zips (Mar 19) were active
- Most likely cause: PowerShell 5.1's `Copy-Item -Recurse -Force` hitting some mid-tree condition (large file, write lock, timing) and silently aborting the remainder of that recursion. The two newest files happened to be the last ones reached in the directory walk

### Fix
- Added an explicit verification pass after the main overlay in `iridescentserver.bat` Phase 0 (and `iridescentserver.sh` for parity)
- New logic: enumerate every `.zip` in `$src/config/paxi/datapacks/`, check if the destination file exists AND has matching byte count; if not, force-copy individually
- Also force-copies `datapack_load_order.json` in the same block so stale load orders can't persist
- Belt-and-suspenders — if the main Copy-Item / cp -rf pass works correctly, the verification pass is a no-op. If the main pass drops files, the verification pass catches them

### Stale Load Order Cleanup
- `datapack_load_order.json` had 8 duplicate entries (no-extension variants) that Paxi always reported as missing, plus 3 entries for removed mods (iridescent_origins — now a JAR, champions_datapack — Champions removed, and their `.zip` variants). Removed all 11 stale entries, added 4 missing ones (tetra_materials, tetra_overrides, aethersteel_overrides, progdiff_overrides)

---

## 2026-04-11 — PrismLauncher pre-launch client sync

### SHA-Check Sync Script for Testers
- Added `sync_client.ps1` + `sync_client.bat` wrapper in both `minecraft/` (dev instance) and `minecraft/distribution/client/` (tester install source)
- Script logic: detect instance via `$env:INST_MC_DIR` (PrismLauncher provides it) → hit GitHub API for latest main commit SHA → compare to `.icraft_last_sha` → if match, exit fast; if differ, download zip, overlay non-runtime dirs (config/kubejs/global_packs/datapack_sources/defaultconfigs/patchouli_books/resourcepacks/shaderpacks), mirror mods/.index, invoke download_mods.ps1 for new JARs
- Preserved: world/, logs/, crash-reports/, backups/, libraries/, mods/*.jar, options.txt
- Failure handling: 10s API timeout + 60s zip timeout, graceful fallback on any error ("Continuing with existing files..." + exit 0). Network hiccups never block a play session
- `install.ps1` updated to copy both sync_client files into the instance's `.minecraft` during initial install

### Two Sync Modes (Protocol 8)
- **Mode A (dev):** `git -C "%INST_DIR%" pull --ff-only` as pre-launch — works because Silvaria's instance is a GitHub Desktop clone of the repo. Instant, git-native
- **Mode B (testers):** `powershell -ExecutionPolicy Bypass -File "%INST_MC_DIR%\sync_client.ps1"` — SHA-check path for installed-not-cloned instances
- New `wiki/protocols/8-client-sync.md` documents both modes, install location, failure behavior, and exclusion list

---

## 2026-04-11 — Awakening tuning: halved rate, T2 locked out

### Pouch Reverted to Normals-Only
- `kubejs/data/rpgseteffects/loot_tables/items/artifact_piece_pouch.json` now contains only the 14 normal artifacts (weight 10 each). Awakenings removed entirely from the pouch pool
- **Why:** pouches are item-keyed loot tables, so the same pouch item behaves identically regardless of drop source. To guarantee T2 bosses can't produce awakenings even indirectly, awakenings had to move off the pouch

### Awakenings = T4 Direct Drops, Halved Rate
- Each of 14 awakenings rolled independently at **0.7%** per T4 boss kill (5 bosses: Ender Dragon, Ender Guardian, Harbinger, Shattered, Watcher)
- Combined any-awakening chance per T4 boss ≈ **9.3%** (down from ~30.5% when pouches held them)
- T4 bosses still drop 2 pouches for normal artifact variety

### T2 Awakening Lockout
- T2 boss kills now yield 0% awakening drops (only normal artifacts via single pouch). Matches user tuning request

---

## 2026-04-11 — Class Artifacts loot table audit + pouch awakening merge

### Boss Entity ID Corrections
- **Fixed `alexscaves:entities/revenant`** → `alexscaves:entities/atlatitan`. The `revenant` ID doesn't exist in Alex's Caves; I invented it. Audited against the mod jar's loot_tables/entities/ directory and swapped to `atlatitan` (a real Primordial Caves mini-boss)
- **Fixed `deeperdarker:entities/warden_shrine`** → `deeperdarker:entities/shattered`. `warden_shrine` is a **structure**, not an entity. Cross-referenced with the canonical boss list in `loot_discovery.js.disabled` (`stalker`, `shattered`, `shriek_worm`, `sculk_centipede`, `sculk_leech`) — `shattered` is Deeper Darker's named boss
- **Verified `alexscaves:entities/watcher`** is valid (I initially flagged it, but it's a real Abyssal Chasm entity)

### Awakenings Merged into Pouch Loot Table
- Overrode `rpgseteffects:items/artifact_piece_pouch` via KubeJS virtual datapack at `kubejs/data/rpgseteffects/loot_tables/items/artifact_piece_pouch.json`
- Pool: 14 normal artifacts at weight 10 + 14 awakening variants at weight 2
- Opening a pouch now has ~17% chance of an awakening (28 total weight, 28 awakening weight out of 168)
- **Design rationale (from user suggestion):** "awakened versions could be good additions to boss loot pouches" — unified acquisition path. Every boss pouch has a chance at awakening, no separate direct-drop path needed
- **Removed direct awakening drops from T4 bosses** (were 14 individual 1.4% chances per boss). Replaced with: T4 bosses now drop **2 pouches** instead of 1, giving ~34% chance of at least one awakening per T4 boss kill, vs ~17% at T2
- AStages T4 gate on awakenings still prevents pre-endgame equipping — a T1 player lucking into an awakening from a T2 pouch just holds it as a trophy until they unlock T4

---

## 2026-04-11 — Epic RPG: Class Artifacts integration (drops-only, tier-gated)

### New Mods
- **Epic RPG: Class Artifacts** (`rpgseteffects:`, forge 2.0.5) — 14 class-themed curios each with an Awakening variant, plus 25 standalone Relics. Items added to all three distributions
- **XP: Attribute Core** (`attributecore:`, 2.0.3) — required dependency. Adds ~20 RPG attributes (life_steal, crit_chance, crit_damage, dodge_chance, aoe_healing, golden_guard, extra_jumps, stealth, poison_damage, pet stats, etc.)
- **Note:** Attribute Core's attributes exist alongside Puffish Attributes (which we use for magic_damage sync). Long-term plan is the Iridescent Attributes consolidation library — see Roadmap / Iron's Spells entry area

### Drops-Only Design
- **Recipe strip:** `kubejs/server_scripts/compat/class_artifacts_recipes.js` removes all 14 awakening upgrade recipes + magic_leather + artifact_piece_pouch + relics_to_fragment_smelting. No crafting paths remain
- **LootJS injection in `lootjs_overhaul.js` SECTION 8.5:**
  - Fragment Core: 4% drop from any `@monster`
  - 7 T1 Relics: ~0.4% per chest in Overworld / Twilight Forest
  - 8 T2 Relics: ~0.6% per chest in Blue Skies / Aether
  - 7 T3 Relics: ~0.8% per chest in Nether / Undergarden
  - 4 T4 Relics: ~1.0% per chest in End / Deeper Darker / Abyss
  - Artifact Piece Pouch: guaranteed drop from 7 T2+ boss tables (Naga, Lich, Hydra, Ignis, Slider, Summoner, Revenant). The pouch's internal table picks one of the 14 normal artifacts on open
  - Awakening artifacts: 1.4% drop from 5 T4 boss tables (Ender Dragon, Ender Guardian, Harbinger, Warden Shrine, Watcher) — each awakening has independent roll
- **Native GLMs blocked:** `rpgseteffects:loot_injection/{overworld,nether,end,treasure}_artifacts` are never whitelisted in our `global_loot_modifiers.json` `replace: true` list, so the mod's aggressive auto-injection (100% pouch in treasure chests, ~72% relic in overworld chests) is inert

### Config Pre-Seed
- `rpgseteffects-common.toml`: disables the mod's parallel elite-mob system (`ELITE_CHANCE_TIER_1/2/3 = 0`, `ELITE_SHOW_BOSS_BAR = false`). IridescentCraft uses Majrusz's Progressive Difficulty for elite enemies; running both would create redundant skull-marked mobs with competing boss bars

### AStages Tier Gating
- All 14 normal artifacts + `artifact_piece_pouch` → T2 (`modpack/item_t2`). T1 players can pick up but not equip
- All 14 awakening artifacts → T4 (`modpack/item_t4`). Prevents early-game lottery wins from T4 boss drops

### Keybind Fix
- Journeymap `map_toggle_alt` unbound from `J` (now `key.keyboard.unknown`) so Class Artifacts' inventory menu (default J) doesn't conflict. Journeymap's primary toggle is still `M`

### Long-Term Roadmap Addition
- Added "Iridescent Attributes Library (post-1.0)" to `wiki/roadmap/planned.md` — goal is to unify Puffish + Attribute Core + Apotheosis attribute concepts under one namespace with a shim that lets mods like Class Artifacts still resolve the attributes they expect

---

## 2026-04-11 — Village artifact rate rework

### Flat 4% Village Artifacts
- Removed 11 `artifacts:inject/chests/village/*` GLM entries + `celestial_artifacts:chests/village_plains_house` from `kubejs/data/forge/loot_modifiers/global_loot_modifiers.json`
- **Why:** stacked GLMs were producing ~25-30% artifact rates with 1-2 artifacts per chest, far above the target of 4% flat
- Added curated pool of 25 artifacts in `lootjs_overhaul.js` (section 6), each rolled at 0.16% per village chest for ~4% combined rate
- **Excluded artifacts:** `artifacts:plastic_drinking_hat`, `artifacts:novelty_drinking_hat` (user dislike); a "horse one" is also to be excluded pending user identification
- Applies to all 15 village chest types (smith, house, temple, tannery, fisher, shepherd, butcher, cartographer, mason, etc.)
- Side benefit: reduces load spike on chest open by cutting the per-chest GLM chain from ~14 modifiers down to our single LootJS modifier

---

## 2026-04-11 — Equipment Compare full removal + Chunky auto-pregen

### Equipment Compare Purged
- Removed lingering `.pw.toml` metadata and `equipmentcompare-common.toml` from all three distributions (main instance, server_distribution, distribution/client). A previous commit dropped the JAR but left metadata, which would have caused `update_mods.ps1` to re-download on next server launch
- **Reason:** Equipment Compare's shift-hold tooltip handler intercepted the tooltip render pipeline and broke shift-expand for Relics research tooltips, Mekanism details, Tag Viewer, and Jade details. All four were frozen on "Hold Shift..." prompts with no response

### Chunky Auto-Pregen on First World Load
- Added `kubejs/server_scripts/pregen/auto_chunky.js` — ServerEvents.loaded hook that runs `/chunky start` around spawn (radius 1500, dimension minecraft:overworld) exactly once per world, tracked via `server.persistentData.icraft_chunky_pregen_started`
- Set `config/chunky/config.json continueOnRestart: true` in all three distributions so interrupted pre-gens resume automatically
- chunky-player-pause keeps the task off the main thread while players are online
- Protocol 7 updated to document the automatic trigger
- **Why:** prevents recurrence of the 115s main-thread stall from 2026-04-10 by generating all structure-dense chunks (including Dungeon Crawl multi-node dungeons) in the background before testers walk into them

---

## 2026-04-11 — CurseForge download URL fallback order

### forgecdn.net Preferred Over curseforge.com/api/v1
- `update_mods.ps1`, `server_install.ps1`, `update_mods.sh` now try `edge.forgecdn.net/files/<part1>/<part2>/<filename>` **first**, with `curseforge.com/api/v1/mods/<projectId>/files/<fileId>/download` as fallback
- Previously api/v1 was used whenever projectId was present, with forgecdn only as a last resort when projectId was missing — backwards from what works
- **Why:** api/v1 frequently returns 403 for automated scripts without an API key. forgecdn is the actual CDN and has no auth requirement
- Triggered by Iron's Patreon Library (`irons_patreon_lib-1.20.1-1.0.1.jar`, file-id 7830104) failing to download
- Both scripts now walk a candidate URL list per mod and move on to the fallback if the first URL returns a non-jar response
- Added `Mozilla/5.0 IridescentCraft-Updater` User-Agent to download requests
- Client-side scripts (`distribution/client/download_mods.ps1`, `install.ps1`) already used forgecdn first — only server-side scripts had the wrong order

---

## 2026-04-11 — Server self-update SHA check

### SHA-Based Self-Update
- `iridescentserver.bat` / `iridescentserver.sh` Phase 0 now hits the GitHub API (`/repos/.../commits/main`) to get the latest commit SHA before doing anything
- Compares against `.icraft_last_sha` stored in the server directory. If they match, skips the zip download entirely and prints "Up to date (commit abc1234)"
- If different (or no stored SHA), downloads + extracts + overlays as before, then records the new SHA
- **Why:** every launch was re-downloading the full repo zip even when nothing had changed, adding 30s–2min of startup overhead. SHA check is a ~200ms API call
- `sync_from_repo.bat` / `sync_from_repo.sh` now exclude `.icraft_last_sha` and `.icraft_server` from the mirror so local state isn't wiped
- Note: `update_mods.ps1` was already diff-based; the slow step was Phase 0 itself, not mod downloads

---

## 2026-04-11 — Enchanted book loot fix + LootJS parse error + DC debug spam

### LootJS Overhaul Was Failing to Parse
- `kubejs/server_scripts/loot/lootjs_overhaul.js:1292` had an unescaped apostrophe inside a single-quoted string (`'Iron's Spellbooks ...'`), which terminated the string early and produced `rhino.EvaluatorException: missing ) after argument list`
- Effect: the **entire** loot overhaul file failed to load on the server. No structure-chest cleanup, no enchanted-book re-adds, no token injection, no clutter cleanup, no village restrictions ever ran
- Fixed by switching that line to a double-quoted string
- Discovered while diagnosing the blank enchanted book report — the books were a downstream symptom of the parse failure, not just the `applyLootFunction` issue (that fix is still correct and now actually runs)

### Dungeon Crawl Debug Logging Disabled
- `config/dungeon_crawl.toml`: `extended_debug` flipped from `true` → `false` in all three distributions
- Reason: DC debug spam (`Building dungeoncrawl:default/multipart/node_connector...`) flooded the server log during structure generation. Removing it cuts log noise and reduces overhead during dungeon worldgen
- Discovered while investigating a 115-second main-thread stall on 2026-04-10 caused by DC generating a multi-node dungeon while a tester was nearby

### Blank Enchanted Books
- `kubejs/server_scripts/loot/lootjs_overhaul.js` T1–T4 enchanted-book re-adds now use `.enchantWithLevels(min, max, treasure)` instead of `.applyLootFunction({function:'minecraft:enchant_with_levels', ...})`
- Reason: LootJS 2.x silently discards loot functions passed as plain JSON, so books were being placed with no `StoredEnchantments` tag — visible tooltip but zero enchants
- Affected tiers: Overworld (10–25), TF/Aether/Blue Skies (15–30), Nether/Undergarden (20–30), End/Deeper Darker/Abyss (30)

---

## 2026-04-09 — Server bat improvements, NPC debug text fix

### Server Bat Improvements
- Server bat now creates a dedicated folder for server files
- Cleaner separation of server runtime from repo files

### NPC Debug Text Fix
- Fixed NPC debug text showing in Jade tooltips (Jade + MCA interaction)
- Debug info no longer leaks into player-facing UI

---

## 2026-04-08 — FTB removal, Progressive Difficulty, treasure bags, tick consolidation, server optimization

### All FTB Mods Removed (8 mods)
- Removed: FTB Backups, FTB Chunks, FTB Essentials, FTB Library, FTB Quests, FTB Ranks, FTB Teams, FTB Ultimine
- Replacements: FastBack (git-based backups), LiteMiner + Amber (veinmining), Open Parties and Claims (chunk claiming)

### Majrusz's Progressive Difficulty Added
- Majrusz's Progressive Difficulty + Majrusz Library added
- Three-stage difficulty: Normal (T1-T2), Expert (T3, triggered on Nether entry), Master (T4, triggered on Dragon kill)
- Treasure bags rewritten for all 7 bosses/events with tier-appropriate loot
- Creeperlings disabled, bleeding kept (symmetrical design), Enderium removed

### Tick Handler Consolidation
- Reduced from 35 tick handlers to 2 master handlers in `0_tick_master.js`
- Significant reduction in per-tick overhead

### KubeJS Error Fixes
- Fixed Ignis Core TypeError
- Fixed `getItemSlot` usage (not in KubeJS 6 API)
- Fixed `source.type.includes` on non-string values

### Village Artifact Rates Boosted
- Smith chest artifact rate: 0.5% -> 5%
- House chest artifact rate: 0.5% -> 3%

### Stale Mod JAR Cleanup
- Added stale mod JAR cleanup to `sync_from_repo` script
- Old/renamed mod JARs no longer persist after sync

### Server Properties Optimized
- Entity broadcast range: 65% (down from default)
- Simulation distance: 4 chunks
- View distance: 6 chunks

---

## 2026-04-07 — Champions removed, Lootr aggressive mode

### Champions Mod Removed
- Champions Unofficial removed entirely from the modpack
- Broken rank config system that could not be fixed
- Unmaintained mod with no upstream activity
- Server lag from error spam on every mob spawn event

### Lootr Aggressive Mode
- Enabled `aggressive_mode` in Lootr config
- Forces more consistent per-player loot chest generation

---

## 2026-04-06 — NecromancerEntity crash fix, PowerShell script fixes

### NecromancerEntity Crash Fix
- NecromancerEntity from a broken mod caused server crashes during mob scaling
- Added `BROKEN_ENTITIES` early-exit list in `mob_scaling_unified.js`
- Entities in the list are skipped before any scaling logic runs

### Trans Flag Banner PowerShell Fix
- Fixed trans flag banners for PowerShell 5.1 compatibility
- Replaced backtick-e escape (`\`e`) with `$([char]27)` for ANSI codes
- Backtick-e only works in PowerShell 7+; 5.1 needs explicit char cast

### Non-ASCII Character Fix in PS1 Files
- Em-dashes and other non-ASCII characters broke PowerShell 5.1 parsing
- Replaced all non-ASCII characters with ASCII equivalents in `.ps1` files

---

## 2026-04-05 — Tetra Attribute Rebalancing removed

### Tetra Attribute Rebalancing Removed
- Mod delisted from CurseForge (no longer available for download)
- Was already broken by Tetra 6.13.0 mixin changes (rolled back to 6.12.0 on 2026-04-03)
- Removed from mod index, distributions, and force-skip lists

---

## 2026-04-04 — New mods review, mob HP scaling, spell scroll fix, tower loot

### New Mods Reviewed + Duplicate Cleanup
- Removed 3 duplicate mod index entries: Origins (Fabric dupe), CTOV dupe, Pufferfish Skills dupe
- Fixed Sleep Hunger: wrong version (NeoForge 1.21.1 -> Forge 1.20.1)
- Added Iron's Patreon Library (new required dep for Iron's Spellbooks 3.15.5.1)
- Re-removed Connected Glass + Trash Cans (still depend on SuperMartijn642 libs)
- Synced 20 new mod .pw.toml files to server + client distributions

### Mob Tier HP Scaling (NEW SYSTEM)
- Basic mobs (zombie, skeleton, spider, creeper, etc.): 3x HP — zombie now 60 HP
- Mid-tier mobs (blaze, wither skeleton, TF/Aether/Blue Skies mobs, dungeon mobs): 1.5x HP
- Champions: 1.25x HP (stacks on top of Champion affixes)
- Bosses: 1x (unchanged, custom HP via boss_hp.js)
- Catch-all: any unlisted hostile mob defaults to 3x
- Stacks multiplicatively with dimension_scaling.js and ascension.js

### Spell Scroll Fix
- Bare `irons_spellbooks:scroll` items dropped with no spell ("None" scrolls)
- Added `irons_spellbooks:randomize_spell` custom function to all scroll loot entries
- Quality ranges: T1 0.0-0.3, T2 0.2-0.5, T3 0.3-0.7, T4 0.5-1.0

### Waystone Tower Loot + ToTW Worldgen
- Waystone Towers now share ToTW loot (curios, artifacts, scrolls, ink, spell books)
- Waystone Towers use minecraft:chests/stronghold_corridor — added to ToTW LootJS sections
- ToTW spawn frequency increased: regular spacing 62->45, derelict 55->42

---

## 2026-04-03 — Tetra 6.13.0 rollback, Heracles quest fix, distribution updates

### Tetra 6.13.0 → 6.12.0 Rollback
- Tetra 6.13.0 broke TSB (ModuleModel class removed), Tetra Attribute Rebalancing (mixin injection fail), and module model deserialization ("no deserializer for type: static")
- Attempted binary bytecode patch for TSB — failed due to Forge module classloading restrictions
- Art of Forging downgraded 1.8.5 → 1.8.4 (1.8.5 caused MaterialData NPE on 6.12.0)
- All Tetra addons confirmed working on 6.12.0

### Heracles Quest Fix
- First Blood quest copied to config/heracles/quests/main/ (global path, works for existing worlds)
- defaultconfigs/ only applies on new world creation

### Distribution + Script Updates
- Trans flag banners added to all .bat and .sh scripts (ANSI RGB via Console.Write/echo -e)
- Missing .sh counterparts created: strip_client_mods.sh, update_configs.sh
- Public GitHub wiki Home page links fixed (file paths → [[Page Name]] wiki syntax)

---

## 2026-04-01 — Origins++ port, JustLeveling redesign, Heracles POC, loot/artifact overhaul

### Origins++ → icraft Namespace Port
- All 6 Origins++ origins/races fully ported to `icraft` namespace (80 powers, 15 mcfunctions, 3 tags)
- Origins++ mod removed as dependency — all data self-contained in Iridescent Origins mod
- Iridescent Origins now builds as a proper Forge mod via Gradle (compiled @Mod class)
- Origin layers must live under `data/origins/origin_layers/` (Origins Forge only scans that namespace)
- Missing race powers created: Ryu (slow_fall, meat_preference, food_healing), Fallen Angel (slow_fall, damage_bonus, meat_preference)
- All 37 ported powers given names/descriptions or set to hidden
- `origins:falling` condition doesn't exist in Origins Forge — removed from slow fall powers (always-on Slow Falling effect)

### JustLeveling Fork Overhaul
- Lock items list cleared entirely — AStages handles all item/tier gating
- 24 skills redesigned across 8 aptitudes (10/20/30 unlock levels):
  - STR: One Handed / Hemorrhage / True Strength
  - CON: Hearty Meals / Overflow / Iron Stomach
  - DEX: Fleet of Foot / Rapid Fire [WIP] / Excitement
  - DEF: Second Wind / Turtle Shield / Lion Heart
  - INT: Haggler / Potion Manipulation / Enlightenment
  - BLD: Obsidian Smasher / Resourceful [WIP] / Master Craftsman [WIP]
  - MAG: Arcane Efficiency [WIP] / Spell Attunement / Mystic Ward
  - LCK: Lucky Strike / Fortune's Favor / Motherlode [WIP]
- 13 skills implemented via KubeJS (justleveling_skills.js)
- Mastery tax system: quadratic XP drain for aptitude breadth beyond 32 total levels
- Lang overrides rename all skills in the UI
- Scholar skill disabled (enchanting no longer level-gated)

### Heracles Quest Mod (Proof of Concept)
- Heracles (Odyssey Quests) 1.1.13 added to modpack
- Proof-of-concept integration chain: Quest → command reward → advancement grant → Codex entry unlocks
- "First Blood" quest: kill 1 zombie → unlocks Combat Guide in Codex
- Advancements use `trigger: minecraft:impossible` (only grantable via command)

### Loot & Artifact Overhaul
- Village loot tables overridden via Paxi datapack (kubejs/data doesn't override loot tables on Forge)
- Village food reduced to weight 1 / count 1, seeds/plants reduced, T1 materials added (iron nuggets, raw copper, string, leather, torches)
- 2.5% spell scroll chance in village chests
- Artifact injection rates tiered via loot table overrides: ~1% village, ~5% overworld structures, ~10% endgame
- Artifacts mod `artifact_rarity` config is overwritten on startup — bypassed via datapack loot table overrides
- `Ingredient.custom()` silently fails in LootJS — all instances replaced with `@mod` syntax
- Tower loot: diamonds/manasteel removed, guaranteed magic scroll + 40% second scroll
- RFTools/Mahou items removed from chest loot via `@mod` syntax

### Codex Overhaul
- Complete rebuild for 3-layer system: 37 entries (3 overviews + 13 origins + 11 races + 10 classes)
- All multi-page entries condensed to single pages (85 entries total — second pages rendered as broken textures)
- Race/origin stats verified against actual power JSON values
- Welcome guides updated for 13 origins / 11 races / 10 classes

### Combat & Spawn
- Spawn protection zone (64 blocks): hostile mob spawns cancelled, existing hostiles killed every 5s
- Cute Villagers UV fix: non-integer UVs (89.1/93.1) rounded to integers for EMF compatibility

### Technical Discoveries
- Forge 1.20.1 ignores pure datapack JARs in mods/ — needs compiled @Mod class
- `kubejs/data/` does NOT override loot tables on Forge — use Paxi datapacks instead
- LootJS `group()` and `modifyLoot(Ingredient.of())` silently fail — datapack overrides are reliable
- Artifacts mod config is overwritten on startup — use Forge `global_loot_modifiers.json` overrides

---

## 2026-03-30 — New origins, Orc rework, loot curation, mod fixes, distribution overhaul

### New Origins (11 → 13)
- **Witherborn:** DOT melee origin. Wither on hit, hunger-based damage penalty.
- **Slimebodied:** Food management tank. 5% food efficiency, satiety damage reduction.

### Race & Origin Reworks
- **Orc rework:** +10% attack speed, +20% HP, +10% melee, +50% hunger drain, Bloodlust (+20% damage scaling with hunger).
- **Witch of Ink:** Paint actives stripped, now pure passive hyperscaler.
- **Construct:** Description updated to reflect 5/5/5/10/10% scaling, Regen III, +35% max.

### Relics Curation
- 15 Relics removed from loot tables.
- 3 special drops added: Ender's Hand (dragon-only), Space Dissector (T4 1%), Shadow Glaive (T2/T3 1%).

### Loot Overhaul
- Village loot: gear removed, T1 materials added, food capped at 1.
- Curio drop rates halved (~10% cumulative).
- Infinity Ham removed from all loot tables.
- RFTools/Mahou items removed from chest loot.

### Mod & Config Fixes
- 30 mods fixed from `side='server'` to `side='both'` (root cause of pig rift shard bug and other missing client content).
- `Platform.isLoaded` guards added on modded entity loot modifiers.
- Improved Mobs equipment disabled (Equipment Chance = 0).
- Loot Integrations mod removed (redundant, caused item leakage).
- APTweaks passive mob caps tripled.
- AStages mod-wide gates removed for mods with food/crops (Thermal, Ars, etc.).

### Distribution & Packaging
- Client installer switched to repo zip download (reliable binary file handling).
- Resource packs now distributed via Paxi.
- `iridescent_classes.jar` rebuilt without baked-in origin layers.
- `global_packs/required_data` moved to `datapack_sources` (prevents double-loading).

---

## 2026-03-20 — Client installer fixes, transmuted materials, Codex update

### Client Installer Fixes
- CurseForge CDN download (319/450 mods) confirmed working via `edge.forgecdn.net`
- Identified and fixed bat→PowerShell regex escaping bug: inline `[''\""]` character class was corrupted by CMD's quote parser, causing some TOML URL extractions to silently fail (including Iron's Spells base mod)
- Moved mod download logic to external `download_mods.ps1` — clean PowerShell syntax, no escaping layers
- Added 3x retry with 2s delay, `WebClient.DownloadFile` (streams to disk), error reporting with failed mod names
- Removed `irons_spells_js` KubeJS addon (crashed when base mod failed to download, addon unused)
- Re-run behavior: always checks for missing mods, skips existing ones instantly
- Linux `.sh` verified working locally — both Modrinth and CurseForge CDN paths parse and download correctly

### Transmuted Materials (Tier-Skip Fix)
- AStages gates entire mods (e.g., `thermal`=tier_2), which blocked tier-skip recipe outputs
- Created 5 ungated transmuted items: `kubejs:transmuted_steel`, `transmuted_manasteel`, `transmuted_osmium`, `transmuted_diamond`, `transmuted_ancient_debris`
- Added to same forge tags as originals — work in ALL tag-based recipes automatically
- Hidden from JEI via `jei_hiding.js` — discoverable through Codex or experimentation
- `tier_skip.js` updated to output transmuted versions

### Codex Update
- Origins Guide: 6 pages (fixed missing texture from odd page count), updated with Phantom undeath, Witch of Ink, Artificial Construct
- 7 class entries rewritten to match current implementations (Berserker, Samurai, Battlemage, Wanderer, Archmage, Vanguard, Void Summoner)
- Faefolk race entry: removed Iron Weakness reference
- 4 new race entries added: Demi-God, Ryu, Fallen Angel, Kirin

### OfflineSkins
- Added client-only OfflineSkins mod for skin display on offline-mode servers

### Wiki & Memory
- Added wiki update rule and memory update rule to CLAUDE.md
- Script parity rule (.bat ↔ .sh) added to CLAUDE.md

---

## 2026-03-19 — Class passives, magic system, balance pass, client installer

### Class Passive Implementations
All 10 classes now have fully functional passives (previously 6 were description-only):
- **Berserker:** Battle Trance converted to real +5% ATK/+1 armor attribute. Brutal Strikes changed from axe-conditional to +15% base melee.
- **Samurai:** Bushido converted to +10% attack speed. Focus reworked: movement builds absorption shield (10% max HP cap), 10s CD on break. Vorpal I-V via Strength scaling with progression tier.
- **Battlemage:** Reworked to +15% melee/+15% magic. Mana Shield replaced with scaling Resistance (I at base, II with Faefolk, III with Faefolk+affixes).
- **Wanderer:** Adaptable replaced with Seasoned Traveler (+5% XP/+2.5% speed per new dimension visited, permanent stacking).
- **Paladin:** Healing Aura implemented (0.5 HP/5s AoE, 1 HP/5s self above 50% HP).
- **Vanguard:** Guardian's Presence implemented (Weakness I to all mobs within 5 blocks).
- **Archmage:** +50% magic (up from 25%). Mana Attunement: -25% melee penalty + tier-scaling magic amplifier (T1:+0%, T2:+5%, T3:+10%, T4:+15%). Weak early, devastating late.
- **Void Summoner:** Soul Tether implemented (5% lifesteal from nearby mob deaths, 10% bonus XP within 16 blocks).

### Magic Damage System Fix
- `puffish_attributes:magic_damage` was registered but never read by magic mods. Added sync in `skill_effects.js` pushing bonuses to both `ars_nouveau:spell_damage` and `irons_spellbooks:spell_power`.
- Iron's Spells re-enabled (was disabled — only the KubeJS addon was broken, base mod always worked).
- Iron's Spells loot tiered: T1 copper/iron books, T2 iron/gold, T3 gold/diamond, T4 diamond/netherite. Inks scale similarly.

### Construct & Balance Changes
- Artificial Construct: iron upgrade scaling changed from flat +5% to 5/5/5/10/10% (max +35%, back-loaded). Iron eating now grants Regen III (400% healing). Offhand healing removed.
- Faefolk: iron_weakness.json removed (was orphaned, never in power list).

### Phantom Undeath
- Phantoms never truly die. At 0 HP, death cancelled, health locks to 0.5 hearts. Spectral Collapse: Weakness II, Slowness II, Mining Fatigue I for 5 minutes. Resistance II during collapse for survival.

### Loot Tier Fix
- Nether correctly placed at T3 (was grouped with T2). Enchanted books and spell books re-tiered: T1 OW, T2 TF/Aether/Blue Skies, T3 Nether/Undergarden, T4 End/Abyss.

### Compass of Return
- New item: right-click teleports to last bed, 10 minute cooldown. 2.5% drop in cave/structure chests (T1). Craftable at T2 (compass + ender pearls + gold).

### Stylistic Description Pass
- All 28 descriptions (11 origins, 11 races, 10 classes) rewritten in consistent evocative tone. Demi-God's god_punch renamed to Divine Fury.

### Client Installer Rewrite
- CurseForge mods (319/450) now use edge.forgecdn.net CDN (old API endpoint returned 403).
- All mods download to `.minecraft/mods/` (fixed path confusion). Re-run syncs configs without re-downloading mods.
- Linux `.sh` version added with full parity. Script parity rule added to CLAUDE.md.

### OfflineSkins
- Added OfflineSkins mod (client-only) for skin display on offline-mode servers.

---

## 2026-03-19 — Origins expansion: 4 new races, 2 new origins

### Race Layer Expansion (7 → 11 races)
- 4 new races added to the icraft Race layer:
  - **Demi-God:** +40% HP (8 hearts), 2x raw meat healing, strength ability, phase ability, fire damage 1.5x, mild Nether weakness.
  - **Ryu:** 25% damage reduction, slow fall, draconic food healing, meat preference, sparkles, clears debuffs.
  - **Fallen Angel:** +15% all damage, -20% HP (4 hearts), slow fall, velocity dash, meat preference, translucent.
  - **Kirin:** +0.1 movement speed, wall climbing, sprint jump, cat vision, -20% HP (4 hearts), speed boost.
- Design rules maintained: no lethal effects, food preferences not restrictions, each heart = 5% HP.

### Origin Layer Expansion (9+Mundane → 11 total)
- 2 new custom origins added:
  - **Witch of Ink:** Paint magic, 50% food reduction, feeds from paintings. Boss counter (200 max) scales damage/reduction/toughness progressively. Blessing of Penthesilea capstone ability.
  - **Artificial Construct:** 25% food efficiency, iron eating (ingots + blocks). Iron upgrade ladder progression: 1000→16000 iron consumed, +5% per level, max +25% bonus.
- Elytra flight remains reserved for Elytrian origin only.

---

## 2026-03-19 — Alpha distribution, dedicated server fixes, loot rebalance

### Server Distribution
- `iridescentserver.bat`: Added `cd /d %~dp0` to fix working directory issues
- Paxi Forge 4.0 loads datapacks from `config/paxi/datapacks/`, NOT `global_packs/required_data/` on dedicated servers. All 17 datapacks synced there.
- Phase 0 standalone download checks both `config/` and `global_packs/`
- Mod download only runs on first install (fewer than 50 JARs)
- `.gitignore` exceptions added for `config/paxi/datapacks/*.zip`
- `max-tick-time=-1` for modded server stability
- `online-mode=false` for alpha testing (production copy preserved)

### Client Distribution
- `iridescentcraft.bat`: downloads PrismLauncher, creates instance, downloads mods
- Instance uses `%AppData%\PrismLauncher` (no portable mode)
- `instance.cfg` has `ManagedPack=true` with `[General]` header
- Mods go at instance root `mods/`, configs in `.minecraft/`

### Mod Removals
- Cherry Village removed (unregistered worldgen feature crash). Added to strip/skip lists.
- Gods & Heroes RPG Classes `.pw.toml` removed (was being re-downloaded, injecting broken class origins)

### Origin Layers Fix
- Added `order` field (0, 1, 2) and `enabled: true` to all three layer JSONs
- Added `name` and `gui_title` to Origin layer override
- All three prompts (Origin → Race → Class) confirmed working on dedicated server

### Translations (185+ entries)
- 72 custom KubeJS item translations (tokens, boss materials, alloys, rings, endgame, MekaSuit Mk2, planetary elements)
- 29 custom enchantment translations (icraft namespace)
- 440 Apotheosis affix translations covering all key formats (.suf/.suffix/.pre/.prefix/bare)
- Gender layer translation (server-only mod needs client lang)

### Loot Rebalance
- Enchanted books: no longer globally removed. Scaled by dimension (7.5% OW → 15% End) with tier-appropriate enchant levels.
- Ars Nouveau spell books: Novice (OW 5%), Apprentice (T2 5%), Archmage (T3 3%, End 5%)
- Village smith chests: 20% artifact chance (8 starter artifacts at 2.5% each)
- Ocean structures: heavily oceanic-themed (snorkel/flippers 15%, fishing rods, heart of the sea)
- Towers of the Wild: ~12% per artifact type
- Village affix gear: epic+ rarity stripped, white/green only
- Magic materials: Iron's Spells inks and Ars source gems boosted in structure chests

### Datapacks
- 17 datapacks synced to `config/paxi/datapacks/` across all distributions
- Added: Towers of the Wild, ScalingHealth NoCrystalDrops, Infinity Ham Blocker, fix_stone_tags, keepinventory, BOP biome weights (cherry blossom 8x boost)

### KubeJS Optimization Audit
- 17 tick-based scripts audited — all properly gated with interval checks
- `codex_delivery.js` and `skill_effects.js` identified as most active but efficiently structured
- `AStageEvents.added` in milestone_detection.js flagged as potential issue (listed as unavailable in wiki)

---

## 2026-03-17 (session 2) — Server distribution testing, mod removals, bug fixes

### Mod Removals
- Connected Glass, Trash Cans, SuperMartijn642's Core Lib + Config Lib removed — Core Lib load order incompatibility cascaded to all dependents. All `.pw.toml` metadata deleted from pack.

### Server Distribution
- Unified `iridescentserver.bat` replaces separate install + start scripts. Auto-detects first run, installs Forge, downloads mods, strips client-only/crash mods, launches server, generates crash logs on failure.
- Added `mods/.index/` (452 `.pw.toml` files) to server distribution — was missing, causing installer to fail.
- `strip_client_mods.bat` audited — no false positives across all 30 patterns.
- Server mod channel mismatch tracker: 5 mods resolved (Decorative LGBT Wall Flags, Alex's Mobs EXTRA Music, Rechiseled + SuperMartijn642 + Connected Glass + Trash Cans).

### Bug Fixes
- Duplicate origin definitions: 17 origin JSONs + layer file existed in both `kubejs/data/` and Paxi datapacks. Caused malformed second class prompt on dedicated server. Removed KubeJS copies.
- `botania:lexicon` misclassified as Patchouli book in `codex_delivery.js`. Generated malformed `/clear` command every second on login, causing connection timeout on dedicated server (silent on single player). Moved to `OTHER_BOOKS_TO_CLEAR`.

---

## 2026-03-17 — Origins overhaul, race rebalance, class descriptions, Codex updates, terrain/balance tuning

### Gameplay & Balance Tuning
- Playtest feedback: LootJS clutter removal (horse armor, spider eyes, etc.), structure food reduction increased from 70% to 90%.
- Apotheosis affix rarity: fixed dimension key prefixes, reduced Overworld Affix Item generation from 50% to 25%.
- Tectonic terrain: vertical_scale reduced from 1.155 to 0.8 (-31% height), ridge_scale reduced for flatter terrain.
- Improved Mobs rebalance: 3 in-game day grace period added, equipment/damage caps halved, diamond downgraded to iron for mob breaking tools.
- Early magic access: Iron's Spells scrolls and copper spell book added to Overworld chest loot tables.
- Walkable Mekanism cables coremod added (v1.0.1), with LocalVariableTable fix.
- HDPE Circuit Board recipe added, plus alternative Mekanism machine recipes using HDPE components.
- IF latex/rubber pipeline rework: logs produce latex via Create/Thermal processing, HDPE converts to dry rubber.

### Vanilla Origins Overhaul
- Design philosophy: no lethal environmental effects, food preferences not restrictions.
- Avian: "fresh air" replaced with Sky Affinity altitude buffs (+buffs at Y=80 and Y=150).
- Blazeborn: water damage replaced with discomfort, Nether Spawn replaced with Nether Affinity (+10/20% damage in Nether).
- Phantom: sunlight burn replaced with weakness+slowness, half health retained.
- Shulk: extra inventory replaced with Hardened Shell (50% death durability reduction), +20% mining speed.
- Feline: -20% HP added as tradeoff.
- Enderian: new Ender Shift power (+15% damage for short time after teleport).
- Merling: suffocation replaced with land discomfort after 5 minutes dry.
- Mundane origin re-added (no buffs or nerfs, blank slate).
- All power descriptions updated to match new implementations.

### Race Layer Rebalance
- Elf: +15% ranged damage, +5% magic damage added.
- Dwarf: mining hunger penalty halved.
- Orc: +10% melee damage, fixed knockback double-apply bug.
- Halfling: food efficiency now functional (+20%).
- Faefolk: magic damage bonus increased from 15% to 30%, -50% armor toughness added, -10% HP added.
- Revenant: sunlight effect changed to weakness+slowness, night vision level 1.1, +20% damage + Resistance I in darkness/Abyss, healing penalty now functional (-20%).

### Class Descriptions
- All 10 class descriptions updated to match actual power implementations.

### Codex Updates
- New "Choosing Your Build" early game guide entry added.
- New "Origins Guide" entry added.
- Updated entries: Champions, Enchantments (29 total documented), Affixes (88 total documented), all 10 class entries.

### Removed Mods
- Rechiseled removed (SuperMartijn642 Core Lib load order incompatibility).
- Pretty Rain removed (Cloth Config incompatibility).

### Bug Fixes
- Fast Leaf Decay ConcurrentModificationException noted (intermittent, non-fatal).
- Walkable Mekanism cables coremod LocalVariableTable fix (v1.0.1).

---

## 2026-03-16 — Blue Skies, Undergarden, Aether/Abyss mechanics, End overhaul, Abyss overhaul, server distribution

### Blue Skies Balance Pass
- Dusk Arc weapon removed (overpowered for T2).
- Shadow Armor set removed (bypassed tier progression).
- Runic Arc changed to boss-drop only (was craftable).
- Diopside, Charoite, Horizonite nerfed to T2-appropriate stats and integrated into Tetra (23 materials total).

### Undergarden Balance Pass
- Tetra stat overrides added for 4 Undergarden metals, bringing total Tetra material count to 27.

### Aether + Abyss Dimension Mechanics
- Aether mechanics implemented: thin air (slow regen above cloud level), vertigo (screen effects near edges), updrafts (launch zones near cliffs).
- Abyss mechanics implemented: oppressive darkness (reduced visibility + slowness without light source), corruption (gradual wither in corrupt biomes), fear aura (boss proximity debuffs).

### Comprehensive End Overhaul
- Dragon Exploration Gate: players must explore End islands and complete objectives before the dragon fight becomes available (explore first, fight dragon last).
- 9 advancement overrides for End progression (replaces vanilla End advancement chain).
- 5 End-specific Apotheosis affixes added (End Apotheosis affixes).
- Void Blossom loot table fix (was dropping nothing).
- Entity ID fixes for End mobs (corrected registry names).
- Moog's End Structure loot tables populated with tier-appropriate rewards.

### Twilight Forest Portal Change
- TF portal activator changed from diamond to T1 boss token (makes TF accessible after first boss kill rather than requiring diamonds).

### Abyss Overhaul
- 30 original ring recipes removed (were too accessible).
- 8 custom rings created with progression-appropriate recipes.
- 7 armor set bonuses implemented for Abyss armor sets.
- Boss drop gating: key Abyss equipment now requires boss drops to craft.

### Server Distribution
- Server distribution folder created for packaged server deployment.

---

## 2026-03-16 — Ad Astra, Mekanism balance, food system, Tetra expansion, Farmer's Delight, bug fixes

### Ad Astra Integration
- Ad Astra added as post-T4 endgame space dimension mod. 5 planets (Moon, Mars, Mercury, Venus, Glacio) at 7x-12x difficulty.
- MekaSuit Mk2 designed as space-tier armor upgrade requiring T4 completion + Ad Astra materials.
- Planetary extraction system designed for unique resources per planet.
- Space enchantments designed for vacuum/radiation/gravity protection.
- Full integration design doc exists. Requires T4 gate + recipe gating. Implementation in progress.

### Mekanism Balance Overhaul
- Generator nerfs applied across all Mekanism generators to prevent early-game RF flooding.
- All Mekanism machine RF costs doubled (2x) to align with progression curve.
- Digital Miner recipe changed to require higher-tier materials (prevents T3 cheese).
- Mekanism tool and armor recipes removed entirely (MekaTool/MekaSuit remain T4-only via existing gating).

### Food System Overhaul
- Hunger drain rate increased to 2.5x vanilla baseline.
- Seed drops from grass reduced to 5% (from vanilla ~8%).
- Structure food loot reduced across all loot tables.
- Spawn protection area provides slower hunger drain for new players.

### Tetra Integration Expansion
- Tetra material count expanded from 15 to 20 modded metals.
- New materials include Abyss metals and Forbidden & Arcanus metals.
- Diamond hammer tier now required for high-tier material crafting.
- Full reference page updated in wiki.

### Farmer's Delight Cooking Conversion
- 70 recipes converted to use Farmer's Delight cooking mechanics.
- Cooking Station and Skillet now serve as primary food crafting stations.

### Design Decisions (Planned)
- Abyss ring and armor design documented for future implementation.

### Bug Fixes
- Apotheosis affix JSONs: uppercase rarity keys changed to lowercase (fixed world load crash).
- Cherry Village: template pool feature references fixed (unregistered feature crash).
- Zeta race condition: coremod jar added to synchronize ForgeZetaEventBus.

---

## 2026-03-16 — New mod additions and Ad Astra integration

### New Mods Added
- Ad Astra added as post-T4 endgame space dimension mod. 5 planets (Moon, Mars, Mercury, Venus, Glacio) at 7x-12x difficulty. Full integration design doc exists. Requires T4 gate + recipe gating. Implementation in progress.
- Tetra + Tetracelium added for weapon/tool overhaul. Custom material datapack (`icraft_tetra_materials`) created with 15 modded metals across all 4 tiers.
- Soul Fire'd added for Nether soul fire mechanics. No gating needed.
- Cobweb (Crystal Nest library) and mutil (Tetra library dependency) added as library mods.

### Previously Recommended/Optional Mods Now Installed
- ImmediatelyFast, Oculus, Equipment Compare, Jade Addons, Light Overlay (all previously recommended — now installed)
- LazyDFU [UNOFFICIAL PORT], Alternate Current, Ksyxis, JEED, Transmog (all previously optional — now installed)

### GitHub Wiki Audit Updated
- "ADD recommended" count reduced from 5 to 0
- All optional mods marked as resolved
- New mods categorized in audit

---

## 2026-03-16 — Config review implementation pass

### Enchanting & Repair
- Easy Anvils verified correct — "too expensive" removed, repair costs at 1.0+, no changes needed
- Disenchanting Table recipe gated to T2 (requires 4x `thermal:steel_ingot`)
- Table of Experience recipe gated to T2 (requires 4x `thermal:steel_ingot`)
- Enchantment Transfer: no gating needed — works through vanilla anvil, XP cost is the gate
- DarkOrb Orb of Origin recipe gated to T2 (4x steel + 4x amethyst + heart of the sea). Resets ALL Origins layers (can't be configured per-layer).

### Combat & Difficulty
- Azukaar's Fair Difficulty: all stat scaling zeroed out (damage, luck, XP multipliers). Behavior features kept (hunger nerf, night purge, no-sleep enforcement, respawn distance).
- Icarus wings: all default recipes removed. 5 new T3 recipes added requiring diamond + phantom membrane.
- Configurable Extra Mob Drops: audited — all entries empty, no tier-breaking drops.

### Dimensions
- Aethersteel moved to T4 endgame. Worldgen disabled via biome modifier override datapack. 17 items added to T4 AStages restrictions. Ore replacement added (appears as holystone until T4).

### Content Removal
- Terramity: 22 gun recipes removed, 64 armor pieces across 16 sets removed, gunsmith station removed. Bosses, structures, mobs, accessories untouched. No custom enchantments found.

### Documentation
- Serene Seasons: 4-page Patchouli Codex entry added explaining seasonal farming, winter crop death, greenhouse bypass
- Iron Jetpacks: verified — uses single dynamic item ID with NBT, material gating already enforces tier progression. Documented in code.

### Tetra Integration
- 15 modded metal material definitions created as Paxi datapack (`icraft_tetra_materials`)
- Covers: Brass (T1), Steel/Signalum/Lumium/Manasteel/Steeleaf/Ironwood/Fiery/Knightmetal (T2), Osmium/Refined Obsidian/Terrasteel/Elementium/Enderium (T3), Aethersteel (T4)
- Full reference page added to wiki

### Bug Fixes
- Apotheosis affix JSONs: uppercase rarity keys → lowercase (fixed world load crash)
- Cherry Village: template pool feature references fixed (unregistered feature crash)
- Zeta race condition: coremod jar added to synchronize ForgeZetaEventBus
- Vanilla Origin layer: origins:human removed to prevent overlap with icraft:human race

---

## 2026-03-15 — Champions, affixes, skills, and gating expansion

- 5 custom Champions affixes implemented: Commanding (buffs nearby mobs), Draining (leeches XP), Hexing (random debuffs), Leaping (lunges at players), Summoning (spawns reinforcements)
- Per-dimension Champion spawn rate scaling (demotes champions in lower-tier dimensions)
- 54 new Apotheosis JSON affixes (30→84 total), ~50 new event-driven effects (15→65) in affix_effects.js
- All 6 Engineering skill placeholders made functional (crafting_speed, machine_speed, rf_generation, fuel_reduction, material_save, craft_bonus)
- AStages gating expanded: mod-gated Twilight Forest/Blue Skies/Aether entirely, added all diamond/netherite/End/Botania derivatives, beacon, shulker boxes, elytra
- 6 vanilla advancement overrides (diamond/netherite advancements hidden until appropriate tier)
- Milestone detection auto-grants blocked advancements on tier unlock
- Vanilla Origin layer: removed origins:human to avoid overlap with icraft:human race. Three-prompt flow is now Origin (9 vanilla) → Race (7 custom) → Class (10 custom)

---

## 2026-03-14 — Final implementation push

- Endgame loops: Rift Shards, Mythic Forge, 12 endgame items, boss Rift drops, Compendium tracking
- Prestige/Ascension: 5 levels, multiplicative mob scaling, player stat bonuses, Ascension Beacon
- Villager trade rework: Forge VillagerTradesEvent, books/diamond gear removed, XP trades added
- Waystone recipes: All variants gated behind boss drops
- Cross-mod recipe audit: 30+ tier-breaking recipes blocked (Create, Thermal, Mekanism, etc.)
- Mod configs: ScalingMobs per-dimension, Champions 15% base, Apotheosis corrections

## 2026-03-14 — Batch implementation pass

- Codex fully working: 11 categories, 80 entries, formatted, advancement-gated (T2+)
- Mod book suppression working: `/clear` with NBT matching for 9+ mod books
- LootJS loot overhaul fixed: `setCount()` API corrected, 35+ structure mods covered
- Apotheosis affixes complete: 142 JSON files (was 30), covering all tiers/dimensions/bosses
- Mob equipment scaling fixed: `setItemSlot` API (was `setArmorSlot`)
- Origins++ overlap: investigated, no removals needed
- Diagnostic scripts disabled, KubeJS event errors all resolved

## 2026-03-14 — Three-prompt character creation (Origin / Race / Class)

- Updated master design doc: character system now has four layers instead of three
- Origin (Origins++ defaults) is now the first selection prompt — species-level identity
- Race (7 custom icraft races) is the second prompt — stat modifiers and thematic flavor
- Class (10 icraft combat roles) is the third prompt — combat role and glass cannon status
- This three-layer approach emerged from in-game testing and creates more build diversity
- Re-enabled the default Origins layer to allow Origins++ origin selection
- Updated wiki classes/overview.md to reflect the new structure

## 2026-03-13 — Wiki creation and initial conversion

- Converted master design document from `.docx` to `wiki/design/master.md`
- No design changes — faithful reproduction of original document

## 2026-03-12 — Initial implementation session

- Implemented Phase 2 KubeJS command rewards (59 effects across 4 skill trees)
- Implemented 24 custom enchantments (Part VI)
- Implemented class respec station (Part III addendum)
- Implemented equipment HP halving for glass cannon classes
- Implemented ~45 of ~95 Apotheosis affixes (Part V)
- Fixed glass cannon auto-tagging via Origins power JSON
- Integrated Warp Shield into dimension_mechanics.js

## 2026-03-07 — Implementation priorities completed

- All 13 numbered priorities from Section 29 completed
- Skill effects: 10 fully functional, 4 attribute-proxied, 2 approximated, 6 informational
- Custom enchantments registered via Apotheosis-compatible startup script
- 30 Apotheosis affix JSONs + 15 event-driven affix effects

## Pre-session — Original design

- Parts I-XII authored in `master_design_document IridescentCraft.docx`
- FTB Quests implementation reference authored separately
