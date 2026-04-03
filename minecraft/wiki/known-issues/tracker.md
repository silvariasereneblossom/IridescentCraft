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

## Resolved

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

### Create + Starlight Contraption Crash (2026-04-03)
- **Active:** Tester crash: `IllegalStateException` in `BlockStarLightEngine.initNibble` when Create contraption renders. Known Create + Starlight incompatibility. Sporadic — occurs when contraption assembles in chunk with incomplete light data. Low priority.

### Heracles Quest Not Triggering (2026-04-03)
- **Resolved:** First Blood quest was only in `defaultconfigs/` (new worlds only). Copied to `config/heracles/quests/main/` for existing worlds.

### AStages Food Blocking (2026-03-30)
- **Resolved:** AStages mod-wide gates for Thermal, Ars Nouveau, and other mods with food/crop items blocked players from eating/harvesting those items at any tier. Removed mod-wide gates for affected mods.
