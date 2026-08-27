# IridescentCraft Wiki

Living documentation for IridescentCraft, a progression-focused expert-lite Minecraft 1.20.1 Forge modpack with 450+ mods.

---

## Sections

### Design
The canonical design reference for all modpack systems.

- [Master Design Document](design/master.md) — Complete system specifications (Parts I–XVI; Part III = the token economy)
- [Design Changelog](design/changelog.md) — Tracked changes to design across sessions

### Progression
- [Progression Overview](progression/overview.md) — Tier system, dimension gates, unlock paths

### Classes & Races
- [Classes & Races Overview](classes/overview.md) — 10 classes, 11 races, 13 origins, glass cannon mechanics

### Systems
- [Systems Overview](systems/overview.md) — Death penalty, scaling, enchantments, affixes, skills, loot, food
- [Controls](systems/controls.md) — The pack's default keybind layout: every important function on its own working key

### KubeJS & Technical
- [KubeJS Overview](kubejs/overview.md) — Script reference, event compatibility, datapack loading

### Mods
- [Mod Overview](mods/overview.md) — Key mods by tier, config changes

### Known Issues
- [Issue Tracker](known-issues/tracker.md) — Active bugs, testing needed, resolved

### Roadmap
- [Planned Changes](roadmap/planned.md) — Future features, improvements, and technical debt

### Meta
- [Style Guide](meta/style-guide.md) — Writing conventions for wiki pages
- [License](LICENSE.md) — Standard's Petty Software License v2.0

---

## Implementation Status

| System | Status | Notes |
|--------|--------|-------|
| Tier gating (AStages) | Implemented | Per-player tier gating for items, dimensions, and recipes |
| Dimension scaling | Implemented | Mob stats scale per dimension |
| Death penalty | Implemented | Custom on-death penalty |
| Loot tables (LootJS) | Implemented | LootJS-driven custom loot tables |
| Skill trees (Pufferfish) | Implemented | Skill-point investment trees |
| Custom enchantments | Implemented | 24 custom enchantments |
| Apotheosis affixes | Implemented | Custom gear affix system |
| Difficulty engine (`iridescent_difficulty`) | Implemented | Time-based per-dimension mob scaling |
| AStages derivative gating | Implemented | Diamond, netherite, and End derivatives gated behind progression |
| Origin layer cleanup | Implemented | 3-prompt flow: Origin (13) → Race (11) → Class (10) |
| Class respec | Implemented | Respec your class |
| Equipment HP halving | Implemented | Glass-cannon: equipment max-HP bonuses halved |
| Progression: token economy (Codex/Heracles) | In progress | Four-lane token economy (Engineering / Magic / Exploration / Combat) |
| Heracles quest tree | In progress | Quest tree driving the token economy |
| Engineering questline | Implemented | 14-quest Heracles engineering line (intro through T4 fusion/antimatter capstone) plus an Engineering Lane Codex category with 5 entries |
| Patchouli Codex | Working | 11 categories, 80 entries, advancement-gated |
| Book suppression | Working | Duplicate mod guidebooks suppressed |
| Endgame loops (Part VIII) | Implemented | Rift Shards, Mythic Forge, 12 endgame items, boss drops |
| Prestige/Ascension (Part IX) | Implemented | 5 ascension levels with mob scaling and stat bonuses |
| Loot table overhaul | Implemented | 35+ structure mods, boss drops, tier tokens |
| Villager trade rework | Implemented | Books removed, XP trades added |
| Waystone recipes | Implemented | Boss-drop gated crafting |
| Cross-mod recipe audit | Implemented | Tier-breaking recipes blocked to preserve progression |
| Mod config audit | Implemented | Mod balance configs aligned to design |
| Config review pass | Implemented | Disenchanting, Table of XP, and DarkOrb T2-gated; Icarus T3; Aethersteel T4 |
| Tetra integration | Implemented | 27 modded metal materials (T1–T4) |
| Serene Seasons documentation | Implemented | Patchouli Codex entry for seasonal farming |
| Mekanism balance overhaul | Implemented | Generator nerfs, 2× RF costs, tool/armor removal; ERA-4 pass buffs fusion/fission output, disables radiation + meltdowns (force-shutdown), and T4-pins the fusion/antimatter/Digital-Miner/ultimate facilities |
| Food system overhaul | Implemented | Faster hunger drain, reduced structure food, spawn protection |
| Farmer's Delight cooking conversion | Implemented | 70 recipes converted to Farmer's Delight cooking |
| Ad Astra integration | In progress | 5 planets, post-T4 endgame, planetary extraction, space enchantments |
| Blue Skies balance pass | Implemented | Materials rebalanced to T2 + Tetra integration |
| Undergarden balance pass | Implemented | Tetra stat overrides for 4 metals |
| Aether dimension mechanics | Implemented | Thin air, vertigo, updrafts |
| The Abyss (TATOS) dimension mechanics | Implemented | Oppressive darkness, corruption, fear aura, void whispers |
| End overhaul | Implemented | Dragon Exploration Gate, End Bastion unlock, End-themed loot and affixes |
| TF portal activator | Implemented | Twilight Forest portal activated with a T1 boss token |
| Custom Abyss-themed curio rings | Implemented | 8 curio rings as a curated T3 chain |
| Server distribution | Implemented | Dedicated server distribution with a unified launcher |
| Vanilla Origins overhaul | Implemented | All 9 origins rebalanced; no lethal environmental effects; food preferences, not restrictions |
| Race layer rebalance | Implemented | Race stat adjustments and functional effects |
| Origins expansion | Implemented | 4 new races (Demi-God, Ryu, Fallen Angel, Kirin) — 11 total; 4 custom origins (Witch of Ink, Artificial Construct, Witherborn, Slimebodied) — 13 total |
| Class descriptions update | Implemented | Class descriptions match in-game power |
| Codex expansion | Implemented | Build guide, Origins guide, and updated entries |
| Tectonic terrain tuning | Implemented | Flatter vertical terrain |
| Early magic access | Implemented | Iron's Spells scrolls + copper spell book in Overworld chests |
| Walkable Mekanism cables | Implemented | Mekanism cables are walkable |
| HDPE/rubber pipeline | Implemented | HDPE Circuit Board + alternative Mekanism rubber recipes |
| LootJS clutter/food tuning | Implemented | Clutter loot removed, food drops reduced |
| Apotheosis affix tuning | Implemented | Overworld affix generation reduced |
| Relics curation | Implemented | Curated Relics pool; 3 special boss drops: Ender's Hand, Space Dissector, Shadow Glaive |
| Village loot overhaul | Implemented | Gear removed, T1 materials added, food capped |
| Epic RPG Class Artifacts integration | Implemented | 14 class artifacts + awakening variants + 25 relics; drops only, T2/T4 gated |
