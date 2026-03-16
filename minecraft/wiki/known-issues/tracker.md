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

### Missing Icon/Texture Assets for Custom Items
- **Status:** Known, low priority
- **Symptom:** New boss drop items, endgame materials (Rift Shard, Rift Core, Primordial Essence, Mythic Catalysts, etc.) use default purple/black missing texture icons
- **Fix needed:** Create item textures in `assets/kubejs/textures/item/` for all custom items registered in `custom_items.js` and `endgame_items.js`

## Needs Testing

- [ ] AStages API method signatures — inferred from docs, looking good per user testing
- [ ] Simply Swords unique weapon IDs — 6 Abyss weapons unverified
- [ ] Origins `action_on_callback` syntax for glass cannon auto-tagging
- [ ] Iron's Spells attribute names for skill effects
- [ ] Apotheosis affix JSON schema compatibility (84 JSON affixes deployed, untested)
- [ ] Custom enchantment registration via Apotheosis
- [ ] Mob equipment setItemSlot API — fixed, needs in-game verification

## Resolved

### Config Review Pass Complete (2026-03-16)
- **Resolved:** Easy Anvils verified correct (repair costs meaningful). Disenchanting Table and Table of Experience T2-gated. DarkOrb Orb of Origin T2-gated. Enchantment Transfer fine (XP cost is gate). Azukaar's stat scaling zeroed. Icarus wings T3-gated (5 new recipes). Configurable Extra Mob Drops audited (empty, safe). Aethersteel moved to T4.

### Terramity Content Removal (2026-03-16)
- **Resolved:** 22 gun recipes removed, 64 armor pieces across 16 sets removed, gunsmith station removed. Bosses, structures, mobs, accessories untouched.

### Bug Fixes (2026-03-16)
- **Apotheosis affix JSONs:** Uppercase rarity keys changed to lowercase (fixed world load crash).
- **Cherry Village:** Template pool feature references fixed (unregistered feature crash).
- **Zeta race condition:** Coremod jar added to synchronize ForgeZetaEventBus.

### Tetra Modded Materials (2026-03-16)
- **Resolved:** 15 modded metal material definitions created as Paxi datapack. Covers T1-T4 metals for Tetra tool crafting.

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
