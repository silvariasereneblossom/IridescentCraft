# Iridescent Modular Spells — Phase 6: Tetra Integration Migration

**Status**: 6A done; 6B in progress — 2026-04-26
**Reason**: Tester directive — design intent was always Tetra-native (mirroring TSB on CurseForge for ISS books, plus Ars). Current Phases 1-5 use a parallel NBT slot system (`imodspells_slots`) which doesn't interface with the Tetra workbench.

**License note**: TSB (Tetra Spell Books, by Inolia_Zaicek on CurseForge) is **All Rights Reserved**. The modpack ships as a public release, so Phase 6 is a license-clean reimplementation: we mirror TSB's *structure* (slot model, schema layout, ISS/Ars stat keys — all dictated by the Tetra/ISS/Ars APIs and uncopyrightable), but we author our own Java code, our own JSON values, and use our own textures. Decompiled TSB sources at `/tmp/tsb_probe` and `/tmp/tsb_decomp` are reference only.

## Current state (Phase 1-5 baseline)

- 8 modular books (5 ISS metal-cover + 3 Ars cloth-cover)
- Slot system: `imodspells_slots` NBT key with `cover` + `pages` strings
- Material installation: `AnvilModuleInstaller.java` — anvil pattern, consumes a stack to install
- Stat aggregation: `AttributeApplier.java` — server-tick scan of held stack, sums per-material bonus map → applies AttributeModifier
- Tetra workbench compatibility: NONE — books aren't recognized by Tetra UI

## Target state (Phase 6 endpoint)

- Books implement `se.mickelus.tetra.items.modular.IModularItem`
- Slots registered as Tetra schemas under `data/tetra/modules/double/<slot>.json`
- Per-material variants registered as Tetra modules / improvements
- Material installation via Tetra workbench (UI-driven, replaces `AnvilModuleInstaller`)
- Stat aggregation via Tetra's `getStat`/`getDamageModifier` chain (replaces `AttributeApplier` for module bonuses)
- Existing `imodspells_slots` NBT migrated to Tetra `Modules` NBT on first interaction

## Constraints

- Cannot extend both `ISS.SpellBook` and `ItemModular` (Java single inheritance) → must implement `IModularItem` interface directly on our existing subclasses
- Same applies to `ArsSpellBook` for Ars side
- Tetra hard-deps Geckolib + tetra-mutil; both already in libs/
- Backwards compatibility for existing modular books in tester saves: NBT migration on read

## Phase 6 sub-phases

### 6A: Build infrastructure (NO behavior change)
- Enable `compileOnly tetra-1.20.1-6.12.0.jar` in build.gradle
- Add `tetra` as mandatory mod dep in mods.toml (versionRange `[0,)`)
- Bump mod version 0.1.0 → 0.2.0 to mark migration start
- Update custom-JAR allowlists in 4 locations (.bat scripts + .sh + .gitignore)
- Verify build still passes with all Phase 1-5 functionality intact
- **Commit target**: `Phase 6A: enable Tetra compile dep, bump 0.2.0`

### 6B: IModularItem skeleton with empty modules
- ModularSpellBookItem + ModularArsSpellBookItem implement IModularItem
- 12 abstract methods (per Tetra 6.12.0): `getItem`, `clearCaches`, `getMajorModuleKeys`, `getMinorModuleKeys`, `getRequiredModules`, `getHoneBase`, `getHoneIntegrityMultiplier`, `canGainHoneProgress`, `getAllSynergyData`, `getAttributeModifierCache`, `getEffectDataCache`, `getPropertyCache`
- Slot keys (final, derived from TSB pattern, our namespace):
  - ISS: `["iss_book/core", "iss_book/front_cover", "iss_book/back_cover", "iss_book/spine", "iss_book/pages"]` — 5 majors, no minors
  - Ars: `["ars_book/front_cover", "ars_book/back_cover", "ars_book/dye", "ars_book/spine"]` — 4 majors, no minors
- `getRequiredModules` returns empty array for now (so books work without modules, AttributeApplier stays authoritative through 6C)
- `getHoneBase` 450, `getHoneIntegrityMultiplier` 200, `canGainHoneProgress` false (per TSB convention — non-tool items)
- 4 Guava caches per class (attribute / tool / effect / properties), 1000-entry / 5-min TTL
- `appendHoverText` chains: super (vanilla/ISS/Ars draws spell list) → existing iridescent slot tooltip → Tetra `getTooltip` for module breakdown
- Books appear on Tetra workbench (UI recognizes them) but have no installed modules yet
- AttributeApplier remains authoritative for stat bonuses (read from `imodspells_slots`)
- **Commit target**: `Phase 6B: IModularItem skeleton — books appear in Tetra workbench`

### 6C: Module slot schemas + per-material modules
Files under `src/main/resources/data/iridescent_modular_spells/tetra/`:
- `modules/iss_book/core/iss_core.json` — 5 majors definition for the core slot, references custom material category `iridescent_modular_spells:iss_books/`
- `modules/iss_book/{front_cover,back_cover,spine,pages}/base_*.json` — uses Tetra built-in mat tags `metal/ wood/ stone/ gem/ skin/ fabric/ fibre/ bone/`
- `modules/ars_book/{front_cover,back_cover,spine,dye}/base_*.json` — same mat tag set
- `schematics/...` — workbench install recipes mirroring `modules/`
- `materials/iss_books/{copper,iron,gold,diamond,netherite}_spell_book.json` — per-base-book stat overrides (each entry's `material.items: [<iss_id>]` registers the ISS book as a core variant)
- Stat values (start point — rebalance-able):
  - `front_cover`: `**irons_spellbooks:spell_power = 0.005` (multiplied by Tetra material count)
  - `back_cover`: `irons_spellbooks:max_mana = 5` (flat) + `**mana_regen = 0.005`
  - `spine`: `**cooldown_reduction = 0.01`
  - `pages`: `**cast_time_reduction = 0.01` (tertiary)
  - Ars `front_cover`: `ars_nouveau:ars_nouveau.perk.mana_regen = 0.3`
  - Ars `back_cover`: `ars_nouveau:ars_nouveau.perk.max_mana = 3`
- `**` prefix = multiplicative (Tetra convention); plain prefix = additive
- **Commit target**: `Phase 6C: module schemas + per-material variants`

### 6D: NBT migration + remove parallel system
- One-time migration on first stack interaction:
  - Read existing `imodspells_slots.cover` + `pages` strings
  - Use `IModularItem.putModuleInSlot(stack, ...)` to seed Tetra Modules NBT
  - Clear old `imodspells_slots` key
- Remove `AttributeApplier` (Tetra handles stat aggregation now)
- Remove `AnvilModuleInstaller` (Tetra workbench replaces it)
- Recipe revisions: shapeless `<base_book> + <cloth/leather>` → modular variant with default cover module pre-installed
- **Commit target**: `Phase 6D: NBT migration + remove imodspells_slots parallel system`

### 6E: Tooltips + codex update + tester polish
- Tooltips: rely on Tetra's built-in module display (replace our manual tooltip in Phase 1)
- Codex entry update: rewrite Modular Spell Books page to reflect Tetra workflow
- Update CLAUDE.md notes about NBT migration
- Test all 6 ISS materials × 5 books = 30 valid combos + all 4 Ars materials × 3 books = 12 combos
- **Commit target**: `Phase 6E: tooltip cleanup + codex rewrite + Tetra workflow docs`

## Estimated effort

- 6A: 30 minutes (build config)
- 6B: 1-2 hours (interface implementation)
- 6C: 2-3 hours (schema authoring × 4 schemas + variant JSONs)
- 6D: 1-2 hours (migration logic + cleanup)
- 6E: 1 hour (docs)

**Total: 5-8 hours focused work**, spread across multiple sessions.

## Risks / open questions

- Tetra workbench UI may not handle non-tool items elegantly. The TSB mod (CurseForge) reportedly works, so it's possible — but visual quirks possible.
- Stat translation: Tetra's stat keys (`damage`, `attackSpeed`, etc.) don't all map cleanly to spell-book bonuses (`max_mana`, `mana_regen`). May need custom stat keys + a stat→attribute bridge, similar to how Tetra integrates with attribute system.
- Module visual: Tetra renders modules with overlay textures. Spell book covers may need texture authoring (or accept basic-tinted defaults).
- Backwards compat for in-game stacks: if a tester has a Phase 1-5 modular book with `imodspells_slots`, the migration must run on next interaction without losing data.

## Out of scope for Phase 6

- Custom Tetra schematics (no-recipe synthesis at workbench) — defer to Phase 7
- Module enchantments via Tetra's improvement system — defer to Phase 7
- Multi-slot modules (e.g., a single material affecting both cover + pages) — defer to Phase 7
