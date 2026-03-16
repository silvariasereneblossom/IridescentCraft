# Design Changelog

All changes to the master design document are logged here with date, description, and reason.

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
