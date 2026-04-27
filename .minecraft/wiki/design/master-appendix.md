# IridescentCraft Master Design — Appendix

**Numerical reference + tables + lists for the [master design doc](master.md).**

> This appendix holds all the numbers: tier material lists, recipe state, boss-drop tables, Apotheosis rates, custom item registry, mod roster, KubeJS script index, datapack override index. The companion [`master.md`](master.md) holds design intent and system descriptions; everything quantitative lives here.
>
> **Status:** scaffolding shipped 2026-04-27 alongside the master rewrite. Section A is the first to be populated; the rest are stubs waiting for migration over the next 1-2 sessions. Where a section is empty, the source data is in [`master-LEGACY.md`](master-LEGACY.md) — find it via the legacy-section reference at the top of each stub.

---

## Table of Contents

| § | Section | Status |
|---|---------|--------|
| A | [Tier Material Reference](#a-tier-material-reference) | populated |
| B | [Tier-Skip Recipe State](#b-tier-skip-recipe-state) | stub — pending |
| C | [Boss → Loot Mapping](#c-boss--loot-mapping) | stub — pending |
| D | [Apotheosis Tables](#d-apotheosis-tables) | stub — pending |
| E | [Custom Items Registry](#e-custom-items-registry) | stub — pending |
| F | [Mod Roster by Tier](#f-mod-roster-by-tier) | stub — pending |
| G | [Stage Restrictions](#g-stage-restrictions) | stub — pending |
| H | [Datapack Override Index](#h-datapack-override-index) | stub — pending |
| I | [KubeJS Script Index](#i-kubejs-script-index) | stub — pending |
| J | [Bytecode Patches](#j-bytecode-patches) | stub — pending |

---

## A. Tier Material Reference

What is in / out of the player's accessible material set per tier. Cross-tier mechanisms (transmutation, boss tier-peek) live in Section B.

### A.1 Tier 1 (Overworld only)

**Available**
- Vanilla: iron, copper, gold, redstone, lapis, coal, emerald (limited to natural village trades), wheat, all overworld farming, all overworld stone variants.
- Create: brass, andesite alloy, kinetic components.
- Bronze (Thermal alloy from copper + tin).
- Tin (worldgen via Thermal).
- Mid-tier woods + saplings (vanilla + Botania Livingwood / Dreamwood).

**NOT available**
- Diamonds (worldgen replaced; recipe-tier-gated to T3).
- Steel (Thermal alloy gated to T2).
- Netherite (Nether is T3).
- Any modded mid-tier materials (Manasteel, Ironwood, etc. — gated to T2).

**Not gated, intentionally**
- Wood-tier and iron-tier weapons (vanilla + Truly Modular Tier 1).
- Botania starter chain (apothecary, manasteel pre-stage, mana pool entry tier).
- Iron's Spellbooks copper spell book + starter scrolls (for the Mage origin path).
- Ars Nouveau novice spell book + Scribes Table (T1 entry per 2026-04-24 design correction).
- Tetra basic-tier modular workbench access.

### A.2 Tier 2 (Twilight / Aether / Blue Skies dimensional access)

**New available (gated by tier_2 stage)**
- Steel (Thermal): the workhorse T2 alloy.
- Manasteel (Botania): magic-tier T2 metal. Block + ingot + nugget + 4-piece armor + sword/pick/axe/shovel.
- Mana diamond + Mana pearl (Botania): T2 transmutation outputs. (Diamond ore itself stays T3-gated.)
- Botania T2 workstations: Runic Altar, Spreader fundamentals, basic Mana Pool tier.
- Twilight Forest dimensional metals: Steeleaf, Ironwood, Fiery, Knightmetal, Carminite (post-Lich progression). Full TF tool/armor sets in their respective metals.
- Aether: Skyroot + Holystone + Zanite + Gravitite (mid-Aether materials).
- Blue Skies: Aquite, Diopside / Charoite / Horizonite raw materials (the *vanilla* tools/armor crafted from these are recipe-stripped — see Section B; players use Tetra integration for proper T2 stats).
- Apotheosis T2 workstations: Simple Reforging Table, Gem Cutting Table, Sigil of Socketing.
- Ars Nouveau T2: Apprentice spell book, Enchanting Apparatus, Arcane Core, Imbuement Chamber (for non-shortcut recipes — diamond/netherite removed in Section B).

**Limited**
- Diamonds via expensive transmutation only (Thermal Smeltery, Create Mixing — see Section B for current state).

### A.3 Tier 3 (Nether / Undergarden / Deeper Darker / Abyss)

**New available (gated by tier_3 stage)**
- Diamonds (worldgen unlocked, recipes accessible).
- Mekanism osmium + osmium ore + deepslate variant.
- Terrasteel + Elementium (Botania T3 alloys). Full armor, sword, pick, axe, shovel, shears for elementium.
- Dragonstone (Botania T3 gem).
- Enderium (Thermal T3 alloy).
- Refined Obsidian + Refined Glowstone (Mekanism). Note: Refined Obsidian armor is recipe-stripped (Section B).
- Forbidden Arcanus: Arcane Crystal + dust + ore + deepslate variant (T3 entry to F&A); Hephaestus Forge (T3 with custom recipe).
- Occultism: Spirit Attuned Crystal/Gem; Foliot/Djinni/Afrit summon books; Iesnium chain (the master-tier ore).
- Nether materials: ancient debris (T3 gates Nether access).
- Theabyss: Knight/Unorithe/Ragnarok/Dragon/Death armor materials (boss-drop only, recipes stripped — see Section B).
- Cataclysm: Witherite, Enderite, Ignitium, Cursium ingots (boss-drop chain — see Section C).
- Apotheosis T3: Reforging Table, Sigil of Rebirth, Sigil of Withdrawal.
- Aether: Valkyrie/Slider/Sun Spirit boss-tier materials.
- Modular Spell Books T3: Diamond + Archmage variants.
- ISS T3: Rare Ink, Diamond Spell Book, T3 Runes (fire/ice/blood/ender/lightning), upgrade orbs.

### A.4 Tier 4 (Deep Aether / End / Ad Astra)

**New available (gated by tier_4 stage)**
- Netherite (processable now — Ancient Debris drops + smithing template).
- Gaia Ingot + Gaia Block (Botania endgame).
- Aethersteel chain (Deep Aether T4 metal): scrap, ingot, nugget, block, full tool set + armor + smithing template + aether_debris ore + aetherslate ore.
- Mekanism advanced: Atomic Alloy, Antimatter Pellet (SPS), Refined Obsidian armor recipes (still stripped, gated to T4 if reintroduced), Ultimate Control Circuit, MekaSuit + 4 pieces, Meka-Tool, Antiprotonic Nucleosynthesizer, Digital Miner, Fusion Reactor Controller, QIO core 4-piece set.
- Mahou Tsukai endgame reagents: attuned_diamond (T3-T4 boundary), kodoku, fae_essence (cross-tier per design).
- Cataclysm endgame: bulwark/incinerator/tidal/void_forge/infernal_forge/ender_guardian gear.
- ISS T4: Epic Ink, Legendary Ink, Netherite Spell Book + 7 themed modular variants (dragonskin, druidic, blaze, evoker, necronomicon, villager, rotten), upgrade orbs (fire/ender/lightning).
- Modular Spell Books T4: full 12-ISS + 3-Ars roster; Voidheart Blade Mythic Forge endgame.
- Custom items: kubejs:icraft_rift_shard, kubejs:void_fragment, kubejs:primordial_essence, kubejs:rift_keystone, kubejs:rift_core, kubejs:mythic_forge, kubejs:mythic_catalyst_1-5, kubejs:mythic_reforge_token, mythic uniques (Voidheart Blade, Oblivion Aegis, Riftwalker Boots, Oblivion Crown).
- RFTools Dimensions: Dimension Builder, Dimension Editor, dimensional_shard_ore (T4 master-only via Occultism datapack; T4 worldgen).
- Ad Astra: NASA Workbench (T4-gated recipe), 4-tier rocket progression (each tier requires increasingly rare reagents up through Primordial Essence at T4 Glacio rocket).
- Apotheosis T4: Augmenting Table, Sigil of Enhancement, Sigil of Unnaming.

### A.5 Tier 4+ (Post-Glacio Endgame)

After T4 unlock, post-Glacio content is the "endgame after the endgame" — Mythic Forge crafts, Ascension cycles, Rift dives. These don't gate via a fifth AStages stage; they're gated by content access (Mythic Forge requires gaia_ingot which is T4, etc.). See `master.md` Part X (Endgame Loops) once migrated.

---

## B. Tier-Skip Recipe State

> **Status:** stub. Migrate from `master-LEGACY.md` Part XVII (Tier-Skip Mechanics) + Part XXVIII (Known Exploit Vectors) + the recipe state captured in `kubejs/server_scripts/recipes/recipe_audit.js` Sections E-J + `tier_gated_recipes.js` Section B.
>
> Should include: every `event.remove({...output:...})` call in the codebase, plus the `event.shaped(...)` re-recipes for tier-gated workbenches. Plus the 6 audit-driven datapack overrides (Botania Orechid + Occultism miner + Worldgen + Terramity + Aethersteel + Tetra). The `validate_recipe_removals.js` script's REMOVAL_TARGETS list is a starting snapshot.

---

## C. Boss → Loot Mapping

> **Status:** stub. Migrate from `master-LEGACY.md` Part XXVI (Boss → Loot Mapping). Heavily expanded since 2026-04-27 audit + Phase 6F-2/3 modded mob coverage:
>
> - 88 entities with explicit LootJS rules (was 17 pre-Phase-6F).
> - 8 boss-drop loot files: `iss_boss_drops.js`, `iss_boss_first_kill.js`, `cataclysm_boss_drops.js`, `twilight_boss_drops.js`, `blue_skies_drops.js`, `alexsmobs_drops.js`, `stalwart_dungeons_drops.js`, `mahou_synergy_drops.js`, `dimensional_boss_drops.js`, `terramity_boss_drops.js`.
> - Cross-mod ink/rune/upgrade-orb economy distributed across every dimensional boss tier.
> - Simply Swords 28 named uniques mapped to 28 bosses (per `loot_overhaul.js` Section 8).
> - Mahou reagents seeded into other-mod boss drops (post-2026-04-27 design — Mahou is player-spell-only natively, no native drops).

---

## D. Apotheosis Tables

> **Status:** stub. Migrate from `master-LEGACY.md` Part XI (Apotheosis Configuration). Must include:
>
> - Affix rates per tier (Common / Uncommon / Rare / Epic / Mythic by dimension).
> - Reforging cost table per tier.
> - Gem tier table (apotheosis-internal Common → Mythic).
> - Sigil unlock progression (T2 socketing, T3 reforging/rebirth/withdrawal, T4 enhancement/unnaming/augmenting).
> - 84 JSON affixes + 65 event-driven affixes count + Champions custom-affixes (5: Commanding/Draining/Hexing/Leaping/Summoning).

---

## E. Custom Items Registry

> **Status:** stub. Migrate from `master-LEGACY.md` Part XXV (Custom Items & Materials). Must include the full `kubejs:*` registry (custom_items.js + endgame_items.js):
>
> - Progression tokens: t1/t2/t3/t4 token fragments, dimensional progression token T1-T4, reality progression token T1-T4.
> - Boss materials: dragon_heart, void_essence, harbinger_eye, hydra_fang, lich_soul, naga_scale, ur_ghast_tear, t2 reforging_token (via boss_drop), waystone_core.
> - Endgame: icraft_rift_shard (renamed from kubejs:rift_shard, 2026-04-27), void_fragment, primordial_essence, rift_keystone, rift_core, rift_blueprint, mythic_forge (block-item), mythic_catalyst_1-5, mythic_reforge_token, void_coffer.
> - Cross-mod alt-recipe outputs: enderium_via_occultism, helium_3, titanium_dust, ferric_oxide, cryogenic_crystal.
> - Mythic uniques: Voidheart Blade (renamed `simplyswords:awakened_lichblade`), Oblivion Aegis (netherite chestplate), Riftwalker Boots (netherite boots), Oblivion Crown (netherite helmet).
> - MekaSuit Mk2 (4 pieces): mekasuit_mk2_helmet/chestplate/leggings/boots.
> - Note: `kubejs:rift_shard` remains registered as a deprecated alias for migration; remove after tester confirmation (~2026-05-15).

---

## F. Mod Roster by Tier

> **Status:** stub. Migrate from `master-LEGACY.md` "Mod Categories" section (post-Part XXIX). Must include:
>
> - Side label per mod (`both` / `client` / `server`) per distribution.
> - Custom-bundled-jar marker for the 9 custom JARs (see CLAUDE.md).
> - Tier assignment per mod.
> - "Why" annotation for non-obvious assignments (e.g., Botania at T1 entry but T3-staged for endgame materials).

---

## G. Stage Restrictions

> **Status:** stub. Auto-generated from `kubejs/server_scripts/gates/astages_restrictions.js`. Must include:
>
> - Items staged per tier (T2 ~30 entries, T3 ~50 entries, T4 ~40 entries — counts as of 2026-04-27 audit).
> - Dimensions staged per tier (4 at T2, 4 at T3, 7 at T4 including 5 Ad Astra planets).
> - Ore replacements per tier (8 entries at T3, 4 at T4).
> - Mod-blanket gates (mekanism + mekanismgenerators T3, refinedstorage + extras T3, rftoolsdim T4).
> - Comments on which mods are intentionally NOT mod-gated (occultism + forbidden_arcanus, due to passive items leaking to early game).

---

## H. Datapack Override Index

> **Status:** stub. Validated by `tools/validate_datapack_references.sh`. Must include:
>
> - icraft_aethersteel_overrides — T4 Aethersteel chain ore replacements.
> - icraft_apotheosis_affixes — custom Apotheosis affix definitions.
> - icraft_botania_overrides — Orechid weight overrides (5 ores).
> - icraft_dungeon_crawl_overrides — Dungeon Crawl loot tier alignment.
> - icraft_loot_overrides — global loot table overrides.
> - icraft_occultism_overrides — Occultism miner tier-skip prevention (8 ore-recipe overrides, audit Phase 1, 2026-04-27).
> - icraft_progdiff_overrides — Progressive Difficulty tuning.
> - icraft_skills — Pufferfish's Skills tree definitions.
> - icraft_terramity_overrides — Terramity gem ore biome injection.
> - icraft_tetra_materials — 27 modded metal materials + 5 gems for Tetra integration.
> - icraft_tetra_overrides — Tetra material stat tweaks.
> - icraft_tower_overrides — Towers of the Wild spawn frequency adjustments.
> - icraft_worldgen_overrides — vanilla iron/copper/zinc/nickel/silver/lead distribution overrides.

---

## I. KubeJS Script Index

> **Status:** stub. One-line summary of every script in `kubejs/server_scripts/` and `kubejs/startup_scripts/`. Plus the `migrations/` subdirectory. Must include:
>
> - Audit Phase 2.2 added `kubejs/server_scripts/migrations/rift_shard_rename.js`.
> - Audit Phase 4.1 added `kubejs/server_scripts/loot/terramity_boss_drops.js`.
> - Audit Phase 3.3 added `kubejs/server_scripts/validate_recipe_removals.js`.
> - All 8 boss-drop files in `loot/`.
> - Existing scripts: `lootjs_overhaul.js` (~2200 lines, primary loot orchestrator), `recipe_audit.js`, `tier_gated_recipes.js`, `tier_skip.js`, `astages_restrictions.js`, etc.

---

## J. Bytecode Patches

> **Status:** stub. Public-safe summary (the full re-apply checklist lives in [`wiki/protocols/8-client-sync.md`](../protocols/8-client-sync.md), and the deep technical detail lives in the private internal repo).
>
> Two custom-bundled JARs ship with bytecode-level modifications:
>
> - `Patchouli-1.20.1-85-FORGE.jar` — patched to disable resource-pack enforcement on the codex book.
> - `ars_nouveau-1.20.1-4.12.7-all.jar` — patched to disable Dungeon Loot Enhancer chest injection.
>
> Both require `-noverify` JVM arg (server: in `iridescentserver.bat`; client: PrismLauncher Java settings).
