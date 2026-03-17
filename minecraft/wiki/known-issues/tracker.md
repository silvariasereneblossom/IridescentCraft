# Known Issues Tracker

## Active Issues

### Three-Prompt Character Creation
- **Status:** Working as intended (confirmed 2026-03-14)
- **Design:** Three sequential prompts on first join: Origin (Origins++) → Race (7 icraft) → Class (10 icraft)
- **Implementation:** Layer ordering via `order` field (0, 1, 2). Default Origins layer re-enabled.
- **Origins++ overlap:** Investigated — no removals needed. Zero name collisions, separate layers.


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

- [ ] AStages API method signatures — inferred from docs, looking good per user testing
- [ ] Simply Swords unique weapon IDs — 6 Abyss weapons unverified
- [ ] Origins `action_on_callback` syntax for glass cannon auto-tagging
- [ ] Iron's Spells attribute names for skill effects
- [ ] Apotheosis affix JSON schema compatibility (84 JSON affixes deployed, untested)
- [ ] Custom enchantment registration via Apotheosis
- [ ] Mob equipment setItemSlot API — fixed, needs in-game verification
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

### Rechiseled Removed (2026-03-17)
- **Resolved:** Removed due to SuperMartijn642 Core Lib load order incompatibility.

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
