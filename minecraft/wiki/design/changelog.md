# Design Changelog

All changes to the master design document are logged here with date, description, and reason.

---

## 2026-03-20 — Client installer fixes, transmuted materials, Codex update

### Client Installer Fixes
- CurseForge CDN download (319/450 mods) confirmed working via `edge.forgecdn.net`
- Identified and fixed bat→PowerShell regex escaping bug: inline `[''\""]` character class was corrupted by CMD's quote parser, causing some TOML URL extractions to silently fail (including Iron's Spells base mod)
- Moved mod download logic to external `download_mods.ps1` — clean PowerShell syntax, no escaping layers
- Added 3x retry with 2s delay, `WebClient.DownloadFile` (streams to disk), error reporting with failed mod names
- Removed `irons_spells_js` KubeJS addon (crashed when base mod failed to download, addon unused)
- Re-run behavior: always checks for missing mods, skips existing ones instantly
- Linux `.sh` verified working locally — both Modrinth and CurseForge CDN paths parse and download correctly

### Transmuted Materials (Tier-Skip Fix)
- AStages gates entire mods (e.g., `thermal`=tier_2), which blocked tier-skip recipe outputs
- Created 5 ungated transmuted items: `kubejs:transmuted_steel`, `transmuted_manasteel`, `transmuted_osmium`, `transmuted_diamond`, `transmuted_ancient_debris`
- Added to same forge tags as originals — work in ALL tag-based recipes automatically
- Hidden from JEI via `jei_hiding.js` — discoverable through Codex or experimentation
- `tier_skip.js` updated to output transmuted versions

### Codex Update
- Origins Guide: 6 pages (fixed missing texture from odd page count), updated with Phantom undeath, Witch of Ink, Artificial Construct
- 7 class entries rewritten to match current implementations (Berserker, Samurai, Battlemage, Wanderer, Archmage, Vanguard, Void Summoner)
- Faefolk race entry: removed Iron Weakness reference
- 4 new race entries added: Demi-God, Ryu, Fallen Angel, Kirin

### OfflineSkins
- Added client-only OfflineSkins mod for skin display on offline-mode servers

### Wiki & Memory
- Added wiki update rule and memory update rule to CLAUDE.md
- Script parity rule (.bat ↔ .sh) added to CLAUDE.md

---

## 2026-03-19 — Class passives, magic system, balance pass, client installer

### Class Passive Implementations
All 10 classes now have fully functional passives (previously 6 were description-only):
- **Berserker:** Battle Trance converted to real +5% ATK/+1 armor attribute. Brutal Strikes changed from axe-conditional to +15% base melee.
- **Samurai:** Bushido converted to +10% attack speed. Focus reworked: movement builds absorption shield (10% max HP cap), 10s CD on break. Vorpal I-V via Strength scaling with progression tier.
- **Battlemage:** Reworked to +15% melee/+15% magic. Mana Shield replaced with scaling Resistance (I at base, II with Faefolk, III with Faefolk+affixes).
- **Wanderer:** Adaptable replaced with Seasoned Traveler (+5% XP/+2.5% speed per new dimension visited, permanent stacking).
- **Paladin:** Healing Aura implemented (0.5 HP/5s AoE, 1 HP/5s self above 50% HP).
- **Vanguard:** Guardian's Presence implemented (Weakness I to all mobs within 5 blocks).
- **Archmage:** +50% magic (up from 25%). Mana Attunement: -25% melee penalty + tier-scaling magic amplifier (T1:+0%, T2:+5%, T3:+10%, T4:+15%). Weak early, devastating late.
- **Void Summoner:** Soul Tether implemented (5% lifesteal from nearby mob deaths, 10% bonus XP within 16 blocks).

### Magic Damage System Fix
- `puffish_attributes:magic_damage` was registered but never read by magic mods. Added sync in `skill_effects.js` pushing bonuses to both `ars_nouveau:spell_damage` and `irons_spellbooks:spell_power`.
- Iron's Spells re-enabled (was disabled — only the KubeJS addon was broken, base mod always worked).
- Iron's Spells loot tiered: T1 copper/iron books, T2 iron/gold, T3 gold/diamond, T4 diamond/netherite. Inks scale similarly.

### Construct & Balance Changes
- Artificial Construct: iron upgrade scaling changed from flat +5% to 5/5/5/10/10% (max +35%, back-loaded). Iron eating now grants Regen III (400% healing). Offhand healing removed.
- Faefolk: iron_weakness.json removed (was orphaned, never in power list).

### Phantom Undeath
- Phantoms never truly die. At 0 HP, death cancelled, health locks to 0.5 hearts. Spectral Collapse: Weakness II, Slowness II, Mining Fatigue I for 5 minutes. Resistance II during collapse for survival.

### Loot Tier Fix
- Nether correctly placed at T3 (was grouped with T2). Enchanted books and spell books re-tiered: T1 OW, T2 TF/Aether/Blue Skies, T3 Nether/Undergarden, T4 End/Abyss.

### Compass of Return
- New item: right-click teleports to last bed, 10 minute cooldown. 2.5% drop in cave/structure chests (T1). Craftable at T2 (compass + ender pearls + gold).

### Stylistic Description Pass
- All 28 descriptions (11 origins, 11 races, 10 classes) rewritten in consistent evocative tone. Demi-God's god_punch renamed to Divine Fury.

### Client Installer Rewrite
- CurseForge mods (319/450) now use edge.forgecdn.net CDN (old API endpoint returned 403).
- All mods download to `.minecraft/mods/` (fixed path confusion). Re-run syncs configs without re-downloading mods.
- Linux `.sh` version added with full parity. Script parity rule added to CLAUDE.md.

### OfflineSkins
- Added OfflineSkins mod (client-only) for skin display on offline-mode servers.

---

## 2026-03-19 — Origins expansion: 4 new races, 2 new origins

### Race Layer Expansion (7 → 11 races)
- 4 new races added to the icraft Race layer:
  - **Demi-God:** +40% HP (8 hearts), 2x raw meat healing, strength ability, phase ability, fire damage 1.5x, mild Nether weakness.
  - **Ryu:** 25% damage reduction, slow fall, draconic food healing, meat preference, sparkles, clears debuffs.
  - **Fallen Angel:** +15% all damage, -20% HP (4 hearts), slow fall, velocity dash, meat preference, translucent.
  - **Kirin:** +0.1 movement speed, wall climbing, sprint jump, cat vision, -20% HP (4 hearts), speed boost.
- Design rules maintained: no lethal effects, food preferences not restrictions, each heart = 5% HP.

### Origin Layer Expansion (9+Mundane → 11 total)
- 2 new custom origins added:
  - **Witch of Ink:** Paint magic, 50% food reduction, feeds from paintings. Boss counter (200 max) scales damage/reduction/toughness progressively. Blessing of Penthesilea capstone ability.
  - **Artificial Construct:** 25% food efficiency, iron eating (ingots + blocks). Iron upgrade ladder progression: 1000→16000 iron consumed, +5% per level, max +25% bonus.
- Elytra flight remains reserved for Elytrian origin only.

---

## 2026-03-19 — Alpha distribution, dedicated server fixes, loot rebalance

### Server Distribution
- `iridescentserver.bat`: Added `cd /d %~dp0` to fix working directory issues
- Paxi Forge 4.0 loads datapacks from `config/paxi/datapacks/`, NOT `global_packs/required_data/` on dedicated servers. All 17 datapacks synced there.
- Phase 0 standalone download checks both `config/` and `global_packs/`
- Mod download only runs on first install (fewer than 50 JARs)
- `.gitignore` exceptions added for `config/paxi/datapacks/*.zip`
- `max-tick-time=-1` for modded server stability
- `online-mode=false` for alpha testing (production copy preserved)

### Client Distribution
- `iridescentcraft.bat`: downloads PrismLauncher, creates instance, downloads mods
- Instance uses `%AppData%\PrismLauncher` (no portable mode)
- `instance.cfg` has `ManagedPack=true` with `[General]` header
- Mods go at instance root `mods/`, configs in `.minecraft/`

### Mod Removals
- Cherry Village removed (unregistered worldgen feature crash). Added to strip/skip lists.
- Gods & Heroes RPG Classes `.pw.toml` removed (was being re-downloaded, injecting broken class origins)

### Origin Layers Fix
- Added `order` field (0, 1, 2) and `enabled: true` to all three layer JSONs
- Added `name` and `gui_title` to Origin layer override
- All three prompts (Origin → Race → Class) confirmed working on dedicated server

### Translations (185+ entries)
- 72 custom KubeJS item translations (tokens, boss materials, alloys, rings, endgame, MekaSuit Mk2, planetary elements)
- 29 custom enchantment translations (icraft namespace)
- 440 Apotheosis affix translations covering all key formats (.suf/.suffix/.pre/.prefix/bare)
- Gender layer translation (server-only mod needs client lang)

### Loot Rebalance
- Enchanted books: no longer globally removed. Scaled by dimension (7.5% OW → 15% End) with tier-appropriate enchant levels.
- Ars Nouveau spell books: Novice (OW 5%), Apprentice (T2 5%), Archmage (T3 3%, End 5%)
- Village smith chests: 20% artifact chance (8 starter artifacts at 2.5% each)
- Ocean structures: heavily oceanic-themed (snorkel/flippers 15%, fishing rods, heart of the sea)
- Towers of the Wild: ~12% per artifact type
- Village affix gear: epic+ rarity stripped, white/green only
- Magic materials: Iron's Spells inks and Ars source gems boosted in structure chests

### Datapacks
- 17 datapacks synced to `config/paxi/datapacks/` across all distributions
- Added: Towers of the Wild, ScalingHealth NoCrystalDrops, Infinity Ham Blocker, fix_stone_tags, keepinventory, BOP biome weights (cherry blossom 8x boost)

### KubeJS Optimization Audit
- 17 tick-based scripts audited — all properly gated with interval checks
- `codex_delivery.js` and `skill_effects.js` identified as most active but efficiently structured
- `AStageEvents.added` in milestone_detection.js flagged as potential issue (listed as unavailable in wiki)

---

## 2026-03-17 (session 2) — Server distribution testing, mod removals, bug fixes

### Mod Removals
- Connected Glass, Trash Cans, SuperMartijn642's Core Lib + Config Lib removed — Core Lib load order incompatibility cascaded to all dependents. All `.pw.toml` metadata deleted from pack.

### Server Distribution
- Unified `iridescentserver.bat` replaces separate install + start scripts. Auto-detects first run, installs Forge, downloads mods, strips client-only/crash mods, launches server, generates crash logs on failure.
- Added `mods/.index/` (452 `.pw.toml` files) to server distribution — was missing, causing installer to fail.
- `strip_client_mods.bat` audited — no false positives across all 30 patterns.
- Server mod channel mismatch tracker: 5 mods resolved (Decorative LGBT Wall Flags, Alex's Mobs EXTRA Music, Rechiseled + SuperMartijn642 + Connected Glass + Trash Cans).

### Bug Fixes
- Duplicate origin definitions: 17 origin JSONs + layer file existed in both `kubejs/data/` and Paxi datapacks. Caused malformed second class prompt on dedicated server. Removed KubeJS copies.
- `botania:lexicon` misclassified as Patchouli book in `codex_delivery.js`. Generated malformed `/clear` command every second on login, causing connection timeout on dedicated server (silent on single player). Moved to `OTHER_BOOKS_TO_CLEAR`.

---

## 2026-03-17 — Origins overhaul, race rebalance, class descriptions, Codex updates, terrain/balance tuning

### Gameplay & Balance Tuning
- Playtest feedback: LootJS clutter removal (horse armor, spider eyes, etc.), structure food reduction increased from 70% to 90%.
- Apotheosis affix rarity: fixed dimension key prefixes, reduced Overworld Affix Item generation from 50% to 25%.
- Tectonic terrain: vertical_scale reduced from 1.155 to 0.8 (-31% height), ridge_scale reduced for flatter terrain.
- Improved Mobs rebalance: 3 in-game day grace period added, equipment/damage caps halved, diamond downgraded to iron for mob breaking tools.
- Early magic access: Iron's Spells scrolls and copper spell book added to Overworld chest loot tables.
- Walkable Mekanism cables coremod added (v1.0.1), with LocalVariableTable fix.
- HDPE Circuit Board recipe added, plus alternative Mekanism machine recipes using HDPE components.
- IF latex/rubber pipeline rework: logs produce latex via Create/Thermal processing, HDPE converts to dry rubber.

### Vanilla Origins Overhaul
- Design philosophy: no lethal environmental effects, food preferences not restrictions.
- Avian: "fresh air" replaced with Sky Affinity altitude buffs (+buffs at Y=80 and Y=150).
- Blazeborn: water damage replaced with discomfort, Nether Spawn replaced with Nether Affinity (+10/20% damage in Nether).
- Phantom: sunlight burn replaced with weakness+slowness, half health retained.
- Shulk: extra inventory replaced with Hardened Shell (50% death durability reduction), +20% mining speed.
- Feline: -20% HP added as tradeoff.
- Enderian: new Ender Shift power (+15% damage for short time after teleport).
- Merling: suffocation replaced with land discomfort after 5 minutes dry.
- Mundane origin re-added (no buffs or nerfs, blank slate).
- All power descriptions updated to match new implementations.

### Race Layer Rebalance
- Elf: +15% ranged damage, +5% magic damage added.
- Dwarf: mining hunger penalty halved.
- Orc: +10% melee damage, fixed knockback double-apply bug.
- Halfling: food efficiency now functional (+20%).
- Faefolk: magic damage bonus increased from 15% to 30%, -50% armor toughness added, -10% HP added.
- Revenant: sunlight effect changed to weakness+slowness, night vision level 1.1, +20% damage + Resistance I in darkness/Abyss, healing penalty now functional (-20%).

### Class Descriptions
- All 10 class descriptions updated to match actual power implementations.

### Codex Updates
- New "Choosing Your Build" early game guide entry added.
- New "Origins Guide" entry added.
- Updated entries: Champions, Enchantments (29 total documented), Affixes (88 total documented), all 10 class entries.

### Removed Mods
- Rechiseled removed (SuperMartijn642 Core Lib load order incompatibility).
- Pretty Rain removed (Cloth Config incompatibility).

### Bug Fixes
- Fast Leaf Decay ConcurrentModificationException noted (intermittent, non-fatal).
- Walkable Mekanism cables coremod LocalVariableTable fix (v1.0.1).

---

## 2026-03-16 — Blue Skies, Undergarden, Aether/Abyss mechanics, End overhaul, Abyss overhaul, server distribution

### Blue Skies Balance Pass
- Dusk Arc weapon removed (overpowered for T2).
- Shadow Armor set removed (bypassed tier progression).
- Runic Arc changed to boss-drop only (was craftable).
- Diopside, Charoite, Horizonite nerfed to T2-appropriate stats and integrated into Tetra (23 materials total).

### Undergarden Balance Pass
- Tetra stat overrides added for 4 Undergarden metals, bringing total Tetra material count to 27.

### Aether + Abyss Dimension Mechanics
- Aether mechanics implemented: thin air (slow regen above cloud level), vertigo (screen effects near edges), updrafts (launch zones near cliffs).
- Abyss mechanics implemented: oppressive darkness (reduced visibility + slowness without light source), corruption (gradual wither in corrupt biomes), fear aura (boss proximity debuffs).

### Comprehensive End Overhaul
- Dragon Exploration Gate: players must explore End islands and complete objectives before the dragon fight becomes available (explore first, fight dragon last).
- 9 advancement overrides for End progression (replaces vanilla End advancement chain).
- 5 End-specific Apotheosis affixes added (End Apotheosis affixes).
- Void Blossom loot table fix (was dropping nothing).
- Entity ID fixes for End mobs (corrected registry names).
- Moog's End Structure loot tables populated with tier-appropriate rewards.

### Twilight Forest Portal Change
- TF portal activator changed from diamond to T1 boss token (makes TF accessible after first boss kill rather than requiring diamonds).

### Abyss Overhaul
- 30 original ring recipes removed (were too accessible).
- 8 custom rings created with progression-appropriate recipes.
- 7 armor set bonuses implemented for Abyss armor sets.
- Boss drop gating: key Abyss equipment now requires boss drops to craft.

### Server Distribution
- Server distribution folder created for packaged server deployment.

---

## 2026-03-16 — Ad Astra, Mekanism balance, food system, Tetra expansion, Farmer's Delight, bug fixes

### Ad Astra Integration
- Ad Astra added as post-T4 endgame space dimension mod. 5 planets (Moon, Mars, Mercury, Venus, Glacio) at 7x-12x difficulty.
- MekaSuit Mk2 designed as space-tier armor upgrade requiring T4 completion + Ad Astra materials.
- Planetary extraction system designed for unique resources per planet.
- Space enchantments designed for vacuum/radiation/gravity protection.
- Full integration design doc exists. Requires T4 gate + recipe gating. Implementation in progress.

### Mekanism Balance Overhaul
- Generator nerfs applied across all Mekanism generators to prevent early-game RF flooding.
- All Mekanism machine RF costs doubled (2x) to align with progression curve.
- Digital Miner recipe changed to require higher-tier materials (prevents T3 cheese).
- Mekanism tool and armor recipes removed entirely (MekaTool/MekaSuit remain T4-only via existing gating).

### Food System Overhaul
- Hunger drain rate increased to 2.5x vanilla baseline.
- Seed drops from grass reduced to 5% (from vanilla ~8%).
- Structure food loot reduced across all loot tables.
- Spawn protection area provides slower hunger drain for new players.

### Tetra Integration Expansion
- Tetra material count expanded from 15 to 20 modded metals.
- New materials include Abyss metals and Forbidden & Arcanus metals.
- Diamond hammer tier now required for high-tier material crafting.
- Full reference page updated in wiki.

### Farmer's Delight Cooking Conversion
- 70 recipes converted to use Farmer's Delight cooking mechanics.
- Cooking Station and Skillet now serve as primary food crafting stations.

### Design Decisions (Planned)
- Abyss ring and armor design documented for future implementation.

### Bug Fixes
- Apotheosis affix JSONs: uppercase rarity keys changed to lowercase (fixed world load crash).
- Cherry Village: template pool feature references fixed (unregistered feature crash).
- Zeta race condition: coremod jar added to synchronize ForgeZetaEventBus.

---

## 2026-03-16 — New mod additions and Ad Astra integration

### New Mods Added
- Ad Astra added as post-T4 endgame space dimension mod. 5 planets (Moon, Mars, Mercury, Venus, Glacio) at 7x-12x difficulty. Full integration design doc exists. Requires T4 gate + recipe gating. Implementation in progress.
- Tetra + Tetracelium added for weapon/tool overhaul. Custom material datapack (`icraft_tetra_materials`) created with 15 modded metals across all 4 tiers.
- Soul Fire'd added for Nether soul fire mechanics. No gating needed.
- Cobweb (Crystal Nest library) and mutil (Tetra library dependency) added as library mods.

### Previously Recommended/Optional Mods Now Installed
- ImmediatelyFast, Oculus, Equipment Compare, Jade Addons, Light Overlay (all previously recommended — now installed)
- LazyDFU [UNOFFICIAL PORT], Alternate Current, Ksyxis, JEED, Transmog (all previously optional — now installed)

### GitHub Wiki Audit Updated
- "ADD recommended" count reduced from 5 to 0
- All optional mods marked as resolved
- New mods categorized in audit

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
