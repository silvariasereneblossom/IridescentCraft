# IridescentCraft Wiki

Living documentation for IridescentCraft, a progression-focused expert-lite Minecraft 1.20.1 Forge modpack with 420+ mods.

---

## Sections

### Design
The canonical design reference for all modpack systems.

- [Master Design Document](design/master.md) — Complete system specifications (Parts I-XXIX)
- [Design Changelog](design/changelog.md) — Tracked changes to design across sessions

### Progression
- [Progression Overview](progression/overview.md) — Tier system, dimension gates, unlock paths

### Classes & Races
- [Classes & Races Overview](classes/overview.md) — 10 classes, 11 races, 13 origins, glass cannon mechanics

### Systems
- [Systems Overview](systems/overview.md) — Death penalty, scaling, enchantments, affixes, skills, loot, food

### KubeJS & Technical
- [KubeJS Overview](kubejs/overview.md) — Script reference, event compatibility, datapack loading

### Mods
- [Mod Overview](mods/overview.md) — Key mods by tier, config changes

### Known Issues
- [Issue Tracker](known-issues/tracker.md) — Active bugs, testing needed, resolved

### Dev (internal-only)
- [Lessons Learned](dev/lessons-learned.md) — Postmortems for stalled/failed implementations. **Not mirrored to public wiki.**
- [Deployment and Utility Guide](dev/deployment-and-utility-guide.md) — How code reaches client/server, phase0_sync flow, custom-jar allowlist, utility scripts. **Not mirrored to public wiki.**
- [Code Review 2026-04-23](dev/code-review-2026-04-23.md) — Full-codebase audit findings + 11 remaining followups. **Not mirrored to public wiki.**
- [Game Mechanics](mechanics/game-mechanics.md) — Implementation deep-dive: which scripts fire, in what order, with what math. Companion to the design doc (intent vs reality). **Not mirrored to public wiki.**

### Roadmap
- [Planned Changes](roadmap/planned.md) — Future features, improvements, and technical debt

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
| Skill trees (Pufferfish) | Implemented | Datapack + `skill_effects.js` (all effects functional) |
| Custom enchantments | Implemented | `custom_enchantments.js` + `enchant_effects.js` (24 enchants) |
| Apotheosis affixes | Implemented | 84 JSON + 65 event-driven affixes |
| Champions custom affixes | Implemented | 5 custom affixes (Commanding, Draining, Hexing, Leaping, Summoning) + per-dimension spawn scaling |
| AStages derivative gating | Implemented | Diamond/netherite/End derivatives fully gated + 6 advancement overrides |
| Origin layer cleanup | Implemented | Vanilla origins:human removed; 3-prompt flow: Origin (13 total) → Race (11 custom) → Class (10 custom) |
| Class respec | Implemented | `class_respec.js` |
| Equipment HP halving | Implemented | `equipment_hp_halving.js` |
| Heracles quest system | In progress | Proof of concept added, replacing FTB Quests |
| Patchouli Codex | Working | 11 categories, 80 entries. Formatted, advancement-gated |
| Book suppression | Working | `/clear` with NBT matching, 9 mod books suppressed |
| Endgame loops (Part VIII) | Implemented | Rift Shards, Mythic Forge, 12 endgame items, boss drops |
| Prestige/Ascension (Part IX) | Implemented | 5 ascension levels, mob scaling, stat bonuses, `!ascend` |
| Loot table overhaul | Implemented | `lootjs_overhaul.js` — 35+ structure mods, boss drops, tier tokens |
| Villager trade rework | Implemented | Forge VillagerTradesEvent — books removed, XP trades added |
| Waystone recipes | Implemented | Boss-drop gated crafting, all variants |
| Cross-mod recipe audit | Implemented | 30+ tier-breaking recipes blocked across 8 mods |
| Mod config audit | Implemented | ScalingMobs, Champions, Apotheosis configs aligned to design |
| Config review pass | Implemented | Easy Anvils verified, Disenchanting/Table of XP/DarkOrb T2-gated, Azukaar's stat scaling zeroed, Icarus T3-gated, Aethersteel T4, Terramity guns/armor removed |
| Tetra integration | Implemented | 27 modded metal materials via Paxi datapack (`icraft_tetra_materials`), T1-T4, including Blue Skies + Undergarden + Abyss + F&A metals |
| Serene Seasons documentation | Implemented | 4-page Patchouli Codex entry for seasonal farming |
| Mekanism balance overhaul | Implemented | Generator nerfs, 2x RF costs, Digital Miner recipe change, tool/armor removal |
| Food system overhaul | Implemented | Hunger drain 2.5x, seed drops 5%, structure food reduction, spawn protection |
| Farmer's Delight cooking conversion | Implemented | 70 recipes converted to Farmer's Delight cooking |
| Ad Astra integration | In progress | 5 planets, post-T4 endgame, MekaSuit Mk2, planetary extraction, space enchantments |
| Blue Skies balance pass | Implemented | Dusk Arc removed, Shadow Armor removed, Runic Arc boss-drop only, 3 materials nerfed to T2 + Tetra integration |
| Undergarden balance pass | Implemented | Tetra stat overrides for 4 metals (27 materials total) |
| Aether dimension mechanics | Implemented | Thin air, vertigo, updrafts |
| Abyss dimension mechanics | Implemented | Oppressive darkness, corruption, fear aura |
| End overhaul | Implemented | Dragon Exploration Gate, 9 advancement overrides, 5 End Apotheosis affixes, Void Blossom loot fix, entity ID fixes, Moog's End Structure loot |
| TF portal activator | Implemented | Changed from diamond to T1 boss token |
| Abyss overhaul | Implemented | 30 ring recipes removed, 8 custom rings, 7 armor set bonuses, boss drop gating |
| Server distribution | Implemented | Unified `iridescentserver.bat` (auto-install + launch + crash logging). Strip script, force-skip list, mod channel mismatch tracker (5 mods resolved). |
| Vanilla Origins overhaul | Implemented | No lethal environmental effects, food preferences not restrictions. All 9 origins rebalanced. No Mundane, no Human. |
| Race layer rebalance | Implemented | Elf/Dwarf/Orc/Halfling/Faefolk/Revenant stat adjustments, bug fixes, functional effects |
| Origins expansion | Implemented | 4 new races (Demi-God, Ryu, Fallen Angel, Kirin) — 11 races total. 4 custom origins (Witch of Ink, Artificial Construct, Witherborn, Slimebodied) — 13 origins total. |
| Class descriptions update | Implemented | All 10 class descriptions updated to match actual power implementations |
| Codex expansion | Implemented | "Choosing Your Build" guide, "Origins Guide", updated Champions/Enchantments/Affixes/class entries |
| Tectonic terrain tuning | Implemented | vertical_scale 1.155→0.8 (-31%), ridge_scale reduced |
| Improved Mobs rebalance | Implemented | 3-day grace period, caps halved, diamond→iron for mob tools |
| Early magic access | Implemented | Iron's Spells scrolls + copper spell book in Overworld chests |
| Walkable Mekanism cables | Implemented | Coremod v1.0.1, LocalVariableTable fix |
| HDPE/rubber pipeline | Implemented | HDPE Circuit Board, alternative Mekanism recipes, IF latex/rubber rework |
| LootJS clutter/food tuning | Implemented | Horse armor/spider eyes removed, food reduction 70%→90% |
| Apotheosis affix tuning | Implemented | Dimension key prefixes fixed, Overworld generation 50%→25% |
| Rechiseled removed | Implemented | SuperMartijn642 Core Lib load order incompatibility |
| Connected Glass removed | Implemented | Depends on SuperMartijn642 libs |
| Trash Cans removed | Implemented | Depends on SuperMartijn642 libs |
| Pretty Rain removed | Implemented | Cloth Config incompatibility |
| Duplicate origin definitions fixed | Implemented | KubeJS/data had duplicate origin JSONs causing malformed class prompt on server |
| Codex book suppression fix | Implemented | botania:lexicon misclassified as Patchouli book, caused login timeout on server |
| Relics curation | Implemented | 15 Relics removed, 3 special drops (Ender's Hand, Space Dissector, Shadow Glaive) |
| Village loot overhaul | Implemented | Gear removed, T1 materials added, food capped at 1 |
| Mod side labels fixed | Implemented | 30 mods corrected from `side='server'` to `side='both'` (pig rift shard root cause) |
| Improved Mobs equipment disabled | Implemented | Equipment Chance = 0 |
| Loot Integrations removed | Implemented | Redundant mod caused item leakage |
| Client installer rework | Implemented | Switched to repo zip download for reliable binary handling |
| Resource pack distribution | Implemented | Resource packs now distributed via Paxi |
| Datapack source reorganization | Implemented | `global_packs/required_data` moved to `datapack_sources` to prevent double-loading |
| Epic RPG Class Artifacts integration | Implemented | 14 class-themed artifacts + awakening variants + 25 relics. Drops-only (no crafting). T2/T4 AStages gating. Mod's elite system disabled in favor of Progressive Difficulty |

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
