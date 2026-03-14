# IridescentCraft Wiki

Living documentation for IridescentCraft, a progression-focused expert-lite Minecraft 1.20.1 Forge modpack with 420+ mods.

---

## Sections

### Design
The canonical design reference for all modpack systems.

- [Master Design Document](design/master.md) — Complete system specifications (Parts I-XII)
- [Design Changelog](design/changelog.md) — Tracked changes to design across sessions

### Progression
- [Progression Overview](progression/overview.md) — Tier system, dimension gates, unlock paths

### Classes & Races
- [Classes & Races Overview](classes/overview.md) — 10 classes, 7+ races, glass cannon mechanics

### Systems
- [Systems Overview](systems/overview.md) — Death penalty, scaling, enchantments, affixes, skills, loot, food

### KubeJS & Technical
- [KubeJS Overview](kubejs/overview.md) — Script reference, event compatibility, datapack loading

### Mods
- [Mod Overview](mods/overview.md) — Key mods by tier, config changes

### Known Issues
- [Issue Tracker](known-issues/tracker.md) — Active bugs, testing needed, resolved

### Meta
- [Style Guide](meta/style-guide.md) — Writing conventions for wiki pages
- [License](LICENSE.md) — Standard's Petty Software License v2.0

---

## Implementation Status

| System | Status | Notes |
|--------|--------|-------|
| Tier gating (AStages) | Implemented | Scripts in place, needs in-game API verification |
| Dimension scaling | Implemented | `dimension_scaling.js` |
| Death penalty | Implemented | `death_penalty.js` |
| Loot tables (LootJS) | Implemented | `lootjs_overhaul.js` (setCount API fixed) |
| Skill trees (Pufferfish) | Implemented | Datapack + `skill_effects.js` (34% placeholder effects) |
| Custom enchantments | Implemented | `custom_enchantments.js` + `enchant_effects.js` (24 enchants) |
| Apotheosis affixes | Implemented | 142 JSON + 15 event-driven affixes |
| Class respec | Implemented | `class_respec.js` |
| Equipment HP halving | Implemented | `equipment_hp_halving.js` |
| FTB Quests | Not started | Quest book needs in-game GUI editor |
| Patchouli Codex | Working | 11 categories, 80 entries. Formatted, advancement-gated |
| Book suppression | Working | `/clear` with NBT matching, 9 mod books suppressed |
| Endgame loops (Part VIII) | Implemented | Rift Shards, Mythic Forge, 12 endgame items, boss drops |
| Prestige/Ascension (Part IX) | Implemented | 5 ascension levels, mob scaling, stat bonuses, `!ascend` |
| Loot table overhaul | Implemented | `lootjs_overhaul.js` — 35+ structure mods, boss drops, tier tokens |
| Villager trade rework | Implemented | Forge VillagerTradesEvent — books removed, XP trades added |
| Waystone recipes | Implemented | Boss-drop gated crafting, all variants |
| Cross-mod recipe audit | Implemented | 30+ tier-breaking recipes blocked across 8 mods |
| Mod config audit | Implemented | ScalingMobs, Champions, Apotheosis configs aligned to design |

---

## Quick Reference

| Resource | Location |
|----------|----------|
| Game Instance | `C:\Users\Silvaria Zemaitis\AppData\Roaming\PrismLauncher\instances\IridescentCraft\minecraft\` |
| Linux Dev | `/root/IridescentCraft/minecraft/` |
| GitHub Repo | synced via GitHub Desktop |
| Design Docs (original) | `designdocs/master_design_document IridescentCraft.docx` |
| KubeJS Logs | `logs/kubejs/server.log` |
| Game Logs | `logs/latest.log` |
