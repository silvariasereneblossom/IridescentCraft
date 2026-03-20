# Planned Changes & Roadmap

Future features, improvements, and technical debt. Organized by priority.

---

## High Priority

### Modrinth Pack Publication
- Convert modpack to Modrinth's pack format for one-click installation
- Eliminates all custom client deployment complexity
- Requires: final mod list audit, pack metadata, icon, description
- **Blocked by:** alpha testing completion

### Server Mod Update System (`update_mods.ps1`)
- After `sync_from_repo` syncs new `.pw.toml` files, mod JARs need updating
- Script should:
  1. Read all `.pw.toml` files
  2. Check if the filename in the TOML matches an existing JAR
  3. If TOML filename doesn't exist (new version), download it
  4. If old version of same mod exists (different filename, same mod ID), delete old JAR
  5. Run automatically after `sync_from_repo`
- Solves: manual mod version management on dedicated servers
- **Why:** Currently, updating a mod version requires manually deleting the old JAR and downloading the new one. With 420+ mods this is error-prone.

### FTB Quests Integration
- Quest book needs in-game GUI editor (can't be built externally)
- Should guide players through tier progression
- Integrate with token system and advancement gates

---

## Medium Priority

### Client Installer Polish
- Current approach: build importable zip → PrismLauncher import
- Works but requires GitHub API for standalone deployment
- Long-term: Modrinth publication replaces this entirely
- Consider: pre-built instance zip as GitHub release asset for interim

### Custom Item Artwork (72 items)
- All custom items use tinted vanilla placeholder textures
- Need proper 16x16 pixel art for: progression tokens, boss materials, alloys, rings, endgame items, MekaSuit Mk2, planetary elements, Compass of Return
- Location: `assets/kubejs/textures/item/` as 16x16 PNGs

### Balance Testing Backlog
- Witch of Ink progression (boss counter, Penthesilea capstone)
- Artificial Construct iron eating + upgrade ladder
- Phantom Undeath (EntityEvents.death cancel)
- All class passives (Focus shield, Seasoned Traveler, Healing Aura, etc.)
- Magic damage sync (puffish → ars_nouveau + irons_spellbooks)
- Transmuted materials in recipes
- See known-issues/tracker.md for full list

---

## Low Priority

### Ad Astra Endgame Completion
- 5 planets as post-T4 content
- Remaining: recipe gating, dimension scaling, loot tables, space enchantments
- MekaSuit Mk2 recipes

### Config Hot-Reload System
- Allow config/kubejs changes without full server restart
- KubeJS supports `/kubejs reload` for server scripts
- Configs require restart — investigate which can be hot-reloaded

### Pack Optimization
- Profile KubeJS tick handlers for TPS impact
- Consolidate tick-based scripts (class_passives.js, battlemage_mana_shield.js, etc.)
- Consider caching origin/class detection results longer

### Iron's Spells Compatibility
- Base mod works, KubeJS addon removed (client class references crash server)
- If custom spell creation needed in future, investigate server-safe alternatives

---

## Completed (moved from roadmap)

Items move here when implemented. See [Design Changelog](../design/changelog.md) for details.

- ~~Server distribution automation~~ → `iridescentserver.bat/.sh`, `sync_from_repo.bat/.sh`
- ~~Origins expansion (4 races + 2 origins)~~ → Implemented 2026-03-19
- ~~Class passive implementations~~ → All 10 classes functional 2026-03-19
- ~~Magic damage sync~~ → `skill_effects.js` syncs to ars_nouveau + irons_spellbooks
- ~~Phantom Undeath~~ → `phantom_undeath.js`
- ~~Compass of Return~~ → `compass_of_return.js` + loot + recipe
- ~~Transmuted materials~~ → 5 items, forge tags, JEI hidden
- ~~Codex update~~ → 80+ entries current
- ~~Tier loot fix (Nether = T3)~~ → Corrected in lootjs_overhaul.js
- ~~Iron's Spells loot tiering~~ → Spell books + inks scale T1-T4
- ~~OfflineSkins~~ → Client-only mod for offline-mode servers
