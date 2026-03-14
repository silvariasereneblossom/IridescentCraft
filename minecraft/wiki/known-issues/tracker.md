# Known Issues Tracker

## Active Issues

### Patchouli Codex — "Invalid Book" Error
- **Status:** Fix deployed, awaiting test (2026-03-13)
- **Symptom:** Right-clicking the Iridescent Codex shows "invalid book" error
- **Root cause:** Paxi 4.0 only loads ZIP datapacks, not folders. The codex datapack was a folder.
- **Fix:** Created `iridescent_codex.zip` in `global_packs/required_data/`. Updated `datapack_load_order.json` to use `.zip` suffix names.
- **Verification:** After pull, create new world, run `/datapack list`, check for `iridescent_codex.zip`

### Mod Books in Inventory on First Join
- **Status:** Fix deployed, awaiting test (2026-03-13)
- **Symptom:** Terramity, Simply Swords, and other mod guidebooks appear in inventory on new character
- **Root cause:** Some mods inject books directly into inventory with no config toggle (Simply Swords, Terramity, Primal Magick)
- **Fix:** `codex_delivery.js` rewritten with broad suppression: exact IDs + Patchouli NBT check + namespace+keyword pattern matching
- **Note:** Exact item IDs still need `/kubejs hand` verification in-game. Pattern matching should catch most cases.

### Three-Prompt Character Creation
- **Status:** Working as intended (confirmed 2026-03-14)
- **Design:** Three sequential prompts on first join: Origin (Origins++ defaults) → Race (7 icraft races) → Class (10 icraft classes)
- **Implementation:** Layer ordering via `order` field in origin_layers (0, 1, 2). Default Origins layer re-enabled with `replace: false` to preserve Origins++ origins.
- **Previous issue:** Duplicate prompts from conflicting namespaces — resolved by consolidating layers into the classes JAR with explicit ordering

### KubeJS Script Errors (5 remaining)
- **Status:** Known, not yet fixed
- `PlayerEvents.death` — does not exist in KubeJS 6.x Forge
- `ItemEvents.tooltip` in wrong script type (needs client_scripts)
- `AStagesEvents` — not a real KubeJS event class
- `PlayerEvents.changeDimension` — does not exist
- `MoreJS` — not installed

### Book Suppression Item IDs Unverified
- **Status:** Needs in-game testing
- Current IDs in `codex_delivery.js` are best guesses
- Use `/kubejs hand` while holding each mod book to get exact item IDs
- Pattern matching provides broad coverage as fallback

## Needs Testing

- [ ] AStages API method signatures — inferred from docs, never verified in-game
- [ ] Simply Swords unique weapon IDs — 6 Abyss weapons unverified
- [ ] Origins `action_on_callback` syntax for glass cannon auto-tagging
- [ ] Iron's Spells attribute names for skill effects
- [ ] Apotheosis affix JSON schema compatibility
- [ ] Custom enchantment registration via Apotheosis

## Resolved

### Paxi Not Loading Datapacks (2026-03-12)
- **Fix:** Discovered Paxi only loads zips. Created zip versions of all datapacks.

### Changes Not Reaching Game (2026-03-12)
- **Fix:** All changes must be committed AND pushed. User pulls via GitHub Desktop.

### Stray Windows Installer in Config (2026-03-12)
- **Fix:** Deleted `config/paxi/datapacks/Ground Control_x64_en-US.msi`

### pack_format Wrong (2026-03-12)
- **Fix:** Changed codex `pack.mcmeta` from format 15 to 12 (correct for 1.20.1)
