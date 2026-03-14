# Known Issues Tracker

## Active Issues

### Patchouli Codex — "Invalid Book" Error
- **Status:** Multiple fixes deployed, awaiting test (2026-03-14)
- **Symptom:** Right-clicking the Iridescent Codex shows "invalid book" error
- **Root cause:** Patchouli 1.20+ requires `use_resource_pack: true` and content in `assets/`, not `data/`. Mod JAR approach kept failing.
- **Fix (latest):** Moved to external `patchouli_books/` folder which Patchouli reads directly. Codex JAR stripped to advancements only.
- **Verification:** Pull, create new world, right-click codex. Should open with 11 categories.

### Mod Books in Inventory on Join
- **Status:** Fix v2 deployed, awaiting test (2026-03-14)
- **Symptom:** Terramity, Simply Swords (Runic Grimoire), and other mod guidebooks appear in inventory
- **Root cause:** Mods inject books via mechanisms that may bypass `inventoryChanged` or fire before scripts load
- **Fix v2:** `codex_delivery.js` now uses direct slot clearing (`inv.setItem(slot, Item.empty)`) instead of `item.count = 0`. Added 60-second periodic inventory sweep on `ServerEvents.tick` to catch delayed injections.
- **Note:** Exact item IDs still need `/kubejs hand` verification. Pattern matching provides fallback.

### Three-Prompt Character Creation
- **Status:** Working as intended (confirmed 2026-03-14)
- **Design:** Three sequential prompts on first join: Origin (Origins++) → Race (7 icraft) → Class (10 icraft)
- **Implementation:** Layer ordering via `order` field (0, 1, 2). Default Origins layer re-enabled.
- **TODO:** Remove Origins++ origins that overlap with icraft custom races

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

### LootJS setCount() API Error (2026-03-14)
- **Fix:** `LootEntry.of(item).setCount([min, max])` is not valid in LootJS 2.13.1. Changed to `LootEntry.of(item, [min, max])`. All 15 occurrences in `lootjs_overhaul.js` fixed.

### Diagnostic Scripts Disabled (2026-03-14)
- **Fix:** `loot_discovery.js` (99% of server.log — 18k lines) and `registry_verify.js` disabled. Job done.

### KubeJS Script Errors — Resolved (2026-03-14)
- `PlayerEvents.death` — no active code uses this (already worked around)
- `ItemEvents.tooltip` — already correctly in `client_scripts/broken_tooltip.js`
- `AStagesEvents` — never used in active code
- `PlayerEvents.changeDimension` — already worked around with tick-based tracking
- `MoreJS` — `villager_trades.js` already `.disabled`

### Paxi Not Loading Datapacks (2026-03-12)
- **Fix:** Discovered Paxi only loads zips. Created zip versions of all datapacks.

### Changes Not Reaching Game (2026-03-12)
- **Fix:** All changes must be committed AND pushed. User pulls via GitHub Desktop.

### Stray Windows Installer in Config (2026-03-12)
- **Fix:** Deleted `config/paxi/datapacks/Ground Control_x64_en-US.msi`

### pack_format Wrong (2026-03-12)
- **Fix:** Changed codex `pack.mcmeta` from format 15 to 12 (correct for 1.20.1)
