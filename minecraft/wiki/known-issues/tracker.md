# Known Issues Tracker

## Active Issues

### Codex Formatting Pass Needed
- **Status:** Low priority
- **Symptom:** Codex text content needs a formatting/polish pass across all entries
- **Note:** Categories and entries all load correctly. Just needs prose cleanup.

### Three-Prompt Character Creation
- **Status:** Working as intended (confirmed 2026-03-14)
- **Design:** Three sequential prompts on first join: Origin (Origins++) → Race (7 icraft) → Class (10 icraft)
- **Implementation:** Layer ordering via `order` field (0, 1, 2). Default Origins layer re-enabled.
- **TODO:** Remove Origins++ origins that overlap with icraft custom races


## Needs Testing

- [ ] AStages API method signatures — inferred from docs, never verified in-game
- [ ] Simply Swords unique weapon IDs — 6 Abyss weapons unverified
- [ ] Origins `action_on_callback` syntax for glass cannon auto-tagging
- [ ] Iron's Spells attribute names for skill effects
- [ ] Apotheosis affix JSON schema compatibility
- [ ] Custom enchantment registration via Apotheosis

## Resolved

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
