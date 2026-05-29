# IridescentCraft Master Design — Appendix

**Numerical reference + tables + lists for the [master design doc](master.md).**

> This appendix holds all the numbers: tier material lists, recipe state, boss-drop tables, Apotheosis rates, custom item registry, mod roster, KubeJS script index, datapack override index. The companion [`master.md`](master.md) holds design intent and system descriptions; everything quantitative lives here.
>
> **Status:** fully populated 2026-04-27. All 10 sections are reference content. Numbers reflect implementation reality as of the audit fix plan completion (commits aeff0891 → 11df1f71). The pre-rewrite 8,370-line legacy master has been removed; this appendix replaces it.

---

## Table of Contents

| § | Section |
|---|---------|
| A | [Tier Material Reference](#a-tier-material-reference) |
| B | [Tier-Skip Recipe State](#b-tier-skip-recipe-state) |
| C | [Boss → Loot Mapping](#c-boss--loot-mapping) |
| D | [Apotheosis Tables + Scaling](#d-apotheosis-tables--scaling) |
| E | [Custom Items Registry](#e-custom-items-registry) |
| F | [Mod Roster by Tier](#f-mod-roster-by-tier) |
| G | [Stage Restrictions](#g-stage-restrictions) |
| H | [Datapack Override Index](#h-datapack-override-index) |
| I | [KubeJS Script Index](#i-kubejs-script-index) |
| J | [Bytecode Patches](#j-bytecode-patches) |
| K | [Character Build Reference](#k-character-build-reference) |
| L | [Iridescent Reforging Honing System](#l-iridescent-reforging-honing-system) |
| M | [ISS + Ars Nouveau Cross-Mod Integration](#m-iss--ars-nouveau-cross-mod-integration) |

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
- Wood-tier and iron-tier weapons (vanilla + Tetra-modular Tier 1).
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
- Mekanism advanced: Atomic Alloy, Antimatter Pellet (SPS), Ultimate Control Circuit, MekaSuit + 4 pieces, Meka-Tool, Antiprotonic Nucleosynthesizer, Digital Miner, Fusion Reactor Controller, QIO 4-piece set.
- Mahou Tsukai endgame reagents: attuned_diamond (T3-T4 boundary), kodoku, fae_essence (cross-tier per design).
- Cataclysm endgame: bulwark/incinerator/tidal/void_forge/infernal_forge/ender_guardian gear.
- ISS T4: Epic Ink, Legendary Ink, Netherite Spell Book + 7 themed modular variants (dragonskin, druidic, blaze, evoker, necronomicon, villager, rotten), upgrade orbs (fire/ender/lightning).
- Modular Spell Books T4: full 12-ISS + 3-Ars roster; Voidheart Blade Mythic Forge endgame.
- Custom items: kubejs:icraft_rift_shard, kubejs:void_fragment, kubejs:primordial_essence, kubejs:rift_keystone, kubejs:rift_core, kubejs:mythic_forge, kubejs:mythic_catalyst_1-5, kubejs:mythic_reforge_token, mythic uniques (Voidheart Blade, Oblivion Aegis, Riftwalker Boots, Oblivion Crown).
- RFTools Dimensions: Dimension Builder, Dimension Editor, dimensional_shard_ore (T4 master-only via Occultism datapack; T4 worldgen).
- Ad Astra: NASA Workbench (T4-gated recipe), 4-tier rocket progression (each tier requires increasingly rare reagents up through Primordial Essence at T4 Glacio rocket).
- Apotheosis T4: Augmenting Table, Sigil of Enhancement, Sigil of Unnaming.

### A.5 Tier 4+ (Post-Glacio Endgame)

After T4 unlock, post-Glacio content is the "endgame after the endgame" — Mythic Forge crafts, Ascension cycles, Rift dives. These don't gate via a fifth AStages stage; they're gated by content access (Mythic Forge requires gaia_ingot which is T4, Mythic Catalysts require icraft_rift_shard from T4 boss drops, etc.).

### A.6 Character Layer Reference

**13 origins** (9 vanilla rebalanced + 4 custom): Avian, Arachnid, Blazeborn, Elytrian, Enderian, Feline, Merling, Phantom, Shulk (vanilla rebalanced); Witch of Ink, Artificial Construct, Witherborn, Slimebodied (custom).

**11 races** (Iridescent Origins): Human, Elf, Dwarf, Orc, Halfling, Faefolk, Revenant, Demi-God, Ryu, Fallen Angel, Kirin.

**10 classes** (Iridescent Classes): Berserker, Samurai, Battlemage, Wanderer, Paladin, Vanguard, Ranger, Archmage, Artificer, Void Summoner.

Per-origin/race/class stat tables and ability descriptions live in `kubejs/data/icraft/` JSON files and the Patchouli codex (categories: Choosing Your Build / Origins Guide / Classes). The pack does not duplicate that data here — the codex is the authoritative reference for character creation choices.

---

## B. Tier-Skip Recipe State

All `event.remove` and `event.shaped` (override) calls across `kubejs/server_scripts/recipes/` and `compat/`, organized by file. The `validate_recipe_removals.js` script (run at server start) holds the same target list as a sanity check for stale IDs.

### B.1 `recipes/recipe_audit.js` — cross-mod tier-skip blocks

**Section A — vanilla loot table cleanup**: removes diamond/emerald from natural-stone loot tables.

**Section B — Create tier-skip blocks**:
- `create:mixing` removed for `mekanism:ingot_osmium` (cross-mod — Create rotation produces osmium without Mekanism processing).

**Section C — Vanilla recipe removal**: lodestone-without-netherite, beacon variants.

**Section D — Ars Nouveau Imbuement**:
- E.1: `ars_nouveau:imbuement` removed for `minecraft:diamond` and `minecraft:netherite_ingot`.

**Section E — Mekanism processing**:
- E.2: `mekanism:enriching` removed for `minecraft:diamond` and `minecraft:emerald`.
- E.3: `mekanism:combining` removed for `minecraft:emerald_ore` and `minecraft:deepslate_emerald_ore`.
- E.4: Occultism dimensional miners — handled via `icraft_occultism_overrides` datapack (audit Phase 1, 2026-04-27).
- E.5: Botania Orechid — handled via `icraft_botania_overrides` datapack.
- E.6: `botania:mana_infusion` removed for `minecraft:diamond` and `minecraft:emerald`.

**Section F — Cross-mod misc**:
- F.1: `forbidden_arcanus:clibano_combustion` removed for `minecraft:diamond` and `minecraft:netherite_ingot`.
- F.2: `minecraft:blasting` removed for `minecraft:netherite_scrap` (catches modded furnace variants).
- F.3: Elytra crafting blocked (per Section G of `tier_gated_recipes.js`).

**Section H — Cataclysm combining**:
- H.1: `mekanism:combining` removed for `minecraft:nether_star`.
- H.2: `mekanism:purifying` removed for `mekanism:clump_diamond`.
- H.3: `mekanism:injecting` removed for `mekanism:shard_diamond`.

**Section I — Terramity gun + armor strip**:
- I.1: 22 firearm + ammo crafting recipes removed.
- I.2: 60+ armor pieces (15 Terramity armor sets) recipes removed.
- I.3 (audit Phase 4.1, 2026-04-27): 7 non-gun melee EPIC weapons + 8 EPIC curios recipes removed.

**Section J — Mekanism multi-tools + Refined Obsidian armor**:
- J.1: `mekanism:atomic_disassembler`, `mekanism:meka_tool` recipes removed (re-added to T4 with custom recipe in `tier_gated_recipes.js`).
- J.2: 4 Refined Obsidian armor pieces recipes removed.
- J.3 (audit Phase 8.4, 2026-04-27): `cataclysm:mechanical_fusion_anvil` recipe removed (merged with `void_forge`/`infernal_forge`).

**Section K — Theabyss rings + Arcane Workbench + boss armor** *(DEAD CODE: theabyss mod is not currently in pack; the strip rules below are no-ops against the unloaded namespace. Retained as documentation of intended strip behavior should the mod be re-added; safe to remove if the absence is permanent — see #47)*:
- K.1: `event.remove({ mod: 'theabyss', type: 'minecraft:crafting_shaped', output: /theabyss:ring_/ })` (regex bulk strip).
- K.2: Catch-all `event.remove({ output: /theabyss:ring_/ })` for shapeless/special.
- K.3: 29-item individual ring removal list (belt-and-suspenders); audit Phase 3.2 fixed `ring_of_ghost` → `ring_of_ghosts` plural drift.
- K.4: `theabyss:arcane_workbench` (ring crafting station) removed.
- K.5: 5 boss-drop armor sets (Knight, Unorithe, Ragnarok, Dragon, Death) — 20 pieces total — recipes removed.

**Section L — Blue Skies removals**:
- L.1: `blue_skies:dusk_arc/*` regex strip.
- L.2: 4 Shadow armor pieces recipes removed.
- L.3: `blue_skies:runic_arc` recipe removed (now boss-drop only).

**Section M — Blue Skies material tools/armor strip** (Diopside / Charoite / Horizonite — hardcoded vanilla stats; Tetra integration replaces).
- ~27 tool + armor pieces recipes removed.

### B.2 `recipes/tier_gated_recipes.js` — re-recipes + Section E

**Section A**: T1-tier replacements for vanilla recipes.

**Section B — Tech progression workstations**:
- B.1: Lodestone re-gated to T4 (chiseled stone bricks + netherite ingot).
- B.2: Beacon naturally gated (nether star = Wither = T3+).
- B.3: Mekanism Meka-Tool re-recipe at T4 (alloy_atomic + netherite + configurator + ultimate_control_circuit + reality_progression_token_t4).
- B.4-B.5: Ars Nouveau (T2), Occultism (T3) — natural material gate, no override.
- B.6: Forbidden Arcanus Hephaestus Forge re-recipe at T3 (deorum + obsidian + diamond + dimensional_progression_token_t3).
- B.7: Mahou Tsukai (T4) — natural material + AStages gate, no override.
- B.8: RFTools Dimensions T4 re-recipes (dimension_builder, dimension_editor).

**Section C — Botania Orechid datapack-handled** (no override needed — see `icraft_botania_overrides`).

**Section D — End Portal Recipe T4 gate**.

**Section E — Simply Swords named uniques**: 43-entry recipe-removal list. Audit Phase 3.1 (2026-04-27) refresh — see [audits/simplyswords.md in the private repo](../../../IridescentCraft-internal/audits/simplyswords.md). Categories: 15 T2 boss-allocated + 10 T3 + 6 T4 + 11 unassigned (creative-only) + 1 dormant_relic.

**Section F — Apotheosis salvaging** (T1 ungated).

**Section G — Elytra crafting** blocked (T4 from End drops only).

### B.3 `recipes/tier_skip.js` — transmutation (intentional bend mechanism)

The "bend not break" mechanism. Cross-tier conversion recipes at deliberately inefficient ratios:
- T2 → T3 transmutation: ~32-64 T2 ingots for 1 T3 ingot via Create mixing or Thermal smelter.
- Vanilla item ↔ Mekanism processing duplicates (e.g., `kubejs:enderium_via_occultism` provides a Thermal-bypass alt).
- Cross-mod dual-paths for vanilla items (Mekanism + Botania routes for same outcome).

Plus the Rift Keystone recipe: 8 `kubejs:icraft_rift_shard` + 4 `kubejs:void_fragment` + 1 `minecraft:nether_star` → `kubejs:rift_keystone`.

### B.4 `recipes/ad_astra_gating.js` — rocket progression

- NASA Workbench: netherite + Mekanism Steel Casing + ad_astra:steel_block + reality_progression_token_t4.
- Tier 1 Rocket → Moon: netherite + thermal:enderium_ingot + ad_astra:steel_plate + ad_astra:engine_frame.
- Tier 2 Rocket → Mars: + kubejs:aethersteel_ingot + ad_astra:moon_stone.
- Tier 3 Rocket → Venus/Mercury: + 2x aethersteel + ad_astra:mars_stone.
- Tier 4 Rocket → Glacio: + kubejs:primordial_essence + ad_astra:venus_stone (most expensive single craft in the pack).
- 4 Jet Suit pieces removed (MekaSuit replaces).
- 4 MekaSuit Mk2 pieces (helmet/chestplate/leggings/boots) at Mythic Forge: aethersteel + glacio_stone + base MekaSuit piece + primordial_essence each.

### B.5 `recipes/refined_storage_dualpath.js` — dual-path RS recipes

Tech path (Mekanism + Thermal) and Magic path (Botania + Ars Nouveau) for the same RS components. Hybrid bonus for using both paths.

### B.6 `recipes/planetary_extraction.js` — Create Crushing Wheel planet stones

- Moon Stone → 25% Helium-3 + 15% Titanium Dust + 50% Iron Nugget.
- Mars Stone → 30% Ferric Oxide + 15% Cryogenic Crystal + 40% Redstone.
- Venus / Mercury / Glacio similar with unique outputs.

### B.7 `recipes/cooking_conversion.js` + `recipes/if_latex_rework.js` + `recipes/waystone_recipes.js`

- 70 vanilla recipes converted to Farmer's Delight cooking workflow.
- HDPE / IF latex alternative pipeline (replaces vanilla rubber chain).
- Waystone craft requires custom boss drops at all tiers.

### B.8 `compat/class_artifacts_recipes.js` — rpgseteffects drops-only enforcement

Strips 17 IDs: 14 awakening artifact upgrade recipes + 3 intermediate materials (`magic_leather`, `artifact_piece_pouch`, `relics_to_fragment_smelting`).

### B.9 Counts

- `tier_gated_recipes.js`: 75 `event.remove` / `event.shaped` calls.
- `recipe_audit.js`: 67 `event.remove` calls.
- `tier_skip.js`: ~30 dual-path / transmutation recipes.
- `ad_astra_gating.js`: 9 recipes (4 rockets + workbench + 4 Mk2 pieces).
- `class_artifacts_recipes.js`: 17 removals.
- `refined_storage_dualpath.js`: ~15 RS dual-path recipes.

**Total recipe-state ledger: ~200 calls** validated against the JEI registry by `validate_recipe_removals.js` at server start.

---

## C. Boss → Loot Mapping

Summary of the boss-drop allocation across 10 boss-drop loot files. Drop chances are typical; see source files for exact rates.

### C.1 ISS bosses (`loot/iss_boss_drops.js` + `loot/iss_boss_first_kill.js`)

| Boss | Tier | Sustained drops (per kill) | First-kill guaranteed |
|------|-----:|----------------------------|----------------------|
| `irons_spellbooks:dead_king` | T4 | blood_staff @ 50% | necronomicon_spell_book |
| `irons_spellbooks:archevoker` | T3 | rare_ink + ender_rune | evoker_spell_book |
| `irons_spellbooks:fire_boss` | T3 | epic_ink + fire_upgrade_orb | blaze_spell_book |
| `irons_spellbooks:citadel_keeper` | T3 | keeper_flamberge @ 40% | — |
| `irons_spellbooks:cryomancer` (mob) | T2 | ice_staff @ 15%, ice_rune @ 25% | — |
| `irons_spellbooks:pyromancer` (mob) | T2 | pyromancer 4-piece armor @ 8-12%/piece + fire_rune @ 20% | — |
| `irons_spellbooks:magehunter` (mob) | T3 | rare_ink @ 15% | magehunter weapon @ 30% |

Plus mob-drop overrides for `aether:cockatrice` (lightning_rod 25%), `twilight:snow_queen` (ice_staff 50%), `twilight:alpha_yeti` (ice_staff 25%), `aether:valkyrie_queen` (magehunter 30%), vanilla `phantom` during thunderstorm (lightning_rod 5%).

### C.2 Cataclysm bosses (`loot/cataclysm_boss_drops.js`)

| Boss | Tier | Sustained drops |
|------|-----:|-----------------|
| `cataclysm:netherite_monstrosity` | T3 | rare_ink + fire_rune + protection_rune + simplyswords:brimstone_claymore |
| `cataclysm:ignis` | T3 | epic_ink + fire_upgrade_orb + diamond_spell_book @ 15% + simplyswords:molten_edge |
| `cataclysm:the_harbinger` | T3-T4 | epic_ink + ender_rune + ender_upgrade_orb + simplyswords:shadowsting |
| `cataclysm:ender_guardian` | T4 | epic_ink + legendary_ink + ender_rune + ender_upgrade_orb + netherite_spell_book @ 10% + simplyswords:arcanethyst |
| `cataclysm:maledictus` | T3 | rare_ink + ender_rune + simplyswords:twisted_blade |
| `cataclysm:ancient_remnant` | T3-T4 | rare_ink + blood_rune + simplyswords:awakened_lichblade |
| `cataclysm:the_leviathan` | T3-T4 | rare_ink + ice_rune + diamond_spell_book @ 10% + simplyswords:livyatan |
| `cataclysm:coralssus` | T3 | uncommon_ink + nature_rune |

### C.3 Twilight Forest bosses (`loot/twilight_boss_drops.js`)

| Boss | Tier | Token | Simply Swords drop |
|------|-----:|-------|-------------------|
| Naga | T2 | t2_token_fragment + naga_scale | tempest @ 15% |
| Lich | T2 | t2_token_fragment + lich_soul + basic_reforging_token | soulrender @ 15% |
| Hydra | T2 | t2_token_fragment + hydra_fang + waystone_core | emberblade @ 15% |
| Ur-Ghast | T2-T3 | t2_token_fragment + t3_token_fragment + ur_ghast_tear | whisperwind @ 20% |
| Knight Phantom | T2 | t2_token_fragment | enigma @ 12% |
| Snow Queen | T2 | t2_token_fragment | frostfall @ 15% |
| Minoshroom | T2 | t2_token_fragment @ 35% | — |
| Alpha Yeti | T2 | t2_token_fragment @ 35% | icewhisper @ 10% |

### C.4 Blue Skies bosses (`loot/blue_skies_drops.js`)

| Boss | Tier | Token + drops | Simply Swords drop |
|------|-----:|---------------|-------------------|
| Summoner | T2 | t2_token_fragment + basic_reforging_token + waystone_core + irons_spellbooks:gold_spell_book + ars_nouveau:source_gem | hiveheart @ 15% |
| Alchemist | T2 | t2_token_fragment + irons_spellbooks:oakskin_elixir + evasion_elixir | toxic_longsword @ 15% |
| Starlit Crusher | T2 | t2_token_fragment + lightning_upgrade_orb @ 15% | stars_edge @ 15% |
| Arachnarch | T2 | t2_token_fragment | waxweaver @ 12% |

All four BS bosses also drop `blue_skies:runic_arc` @ 5% (recipe-stripped per Section B; boss-drop only).

### C.5 Aether bosses (`loot/loot_overhaul.js` Section 2 + `loot/dimensional_boss_drops.js`)

| Boss | Tier | Drops |
|------|-----:|-------|
| Slider | T2 | t2_token_fragment + basic_reforging_token + waystone_core + simplyswords:thunderbrand |
| Valkyrie Queen | T2 | t2_token_fragment + simplyswords:caelestis |
| Sun Spirit | T2 | t2_token_fragment + simplyswords:sunfire |

Deep Aether: `deep_aether:eots_controller` (T4 sky-end) drops `simplyswords:flamewind` @ 15%.

### C.6 Alex's Mobs (`loot/alexsmobs_drops.js`, 21 modifiers)

- **Mimicream nerf**: `alexsmobs:mimicube` natural drops stripped, re-injected at 1% (vanilla rate ~50% breaks economy).
- **T4 mobs** (void_worm, mimicube, enderiophage, laviathan): legendary/epic ink + ender/fire runes + matching upgrade orbs.
- **T3 nether/underground** (bone_serpent, straddler, soul_vulture, crimson_mosquito, warped_mosco, murmur, hammerhead_shark, frostmoth, cosmaw): rare/uncommon ink + element-themed runes.
- **T2 dangerous overworld** (crocodile, komodo_dragon, anaconda, caiman, snow_leopard, dropbear, leafcutter_ant_queen, cachalot_whale): common/uncommon ink + minor rune drops.
- **T1 passive entities** untouched.

### C.7 Stalwart Dungeons (`loot/stalwart_dungeons_drops.js`, 7 modifiers)

7 nether mini-bosses (awful_ghast, nether_keeper, incomplete_wither, giddy_blaze, reinforced_blaze, shelterer, shelterer_without_armor) with T3 ISS magic synergy. Tougher mini-bosses get rare_ink + fire/blood/cooldown runes; weaker get uncommon_ink + fire_rune. `incomplete_wither` has 10% diamond_spell_book chance.

### C.8 Mahou synergy (`loot/mahou_synergy_drops.js`, 14 modifiers)

Cross-mod injection of Mahou reagents:
- **T2 reagents** (attuned_emerald + fae_essence) on TF Lich, TF Hydra, Aether Sun Spirit, BS Summoner, vanilla Evoker.
- **T3 reagents** (attuned_diamond + kodoku) on Cataclysm Ignis, Harbinger, Maledictus, Ancient Remnant, ISS Dead King.
- **T4 reagents** (attuned_diamond at higher count) on Cataclysm Ender Guardian, vanilla Warden, Ender Dragon.

### C.9 Dimensional / Mutant Mobs (`loot/dimensional_boss_drops.js`, 11 modifiers)

- Aether: slider (thunderbrand), sun_spirit (sunfire).
- Deep Aether: eots_controller (T4 sky-end).
- Vanilla: Warden (T4 sculk-themed).
- Undergarden: forgotten_guardian, forgotten, rotbeast.
- Mutant Monsters: mutant zombie/skeleton/creeper/enderman.

### C.10 Terramity non-gun melee (`loot/terramity_boss_drops.js`, audit Phase 4.1)

7 non-gun EPIC weapons allocated to themed bosses:
- `unholy_lance` → Dead King (T4 ISS undead) @ 10%
- `blasphemic_rapture` → Ignis (T3 fire) @ 10%
- `davy_jones` → The Leviathan (T3-T4 ocean) @ 10%
- `olympus` → Aether Slider (T2 storm) @ 5%
- `divine_intervention` → Aether Sun Spirit (T2 holy) @ 10%
- `planet_buster` → Ender Dragon (T4 cosmic) @ 15%
- `kamehameha` → Ancient Remnant (T4 placeholder until Mythic Forge recipe) @ 5%

### C.10a Terramity ingot-family weapons + curios (`loot/terramity_structure_drops.js`, audit 2026-05-19)

Audit revisit: 3 ingot families (nyxium / exodium / reverium) cut from sourcing
entirely (40 items removed in recipe_audit.js I.4). The 5 ingot-family weapons
and 10 curios that previously needed those ingots reappear as T3/T4 drops:

**T3 Exodium (warlock theme) → Nether structures**
- chthonic_dungeon: exodium_sword 8%, exodium_waraxe 6%, exodium_twin_bracelets 8%, exodium_shield_amulet 6%, tome_of_ascension 8%, guardian_grimoire 8%
- chthonian_breach: exodium_sword 8%, exodium_waraxe 8%, exodium_twin_bracelets 10%, gaias_tempest 8%, tome_of_ascension 8%

**T3 Reverium (paladin / anti-undead) → underground structures**
- catacombs: reverium_sword 10%, reverium_axe 8%, angel_feather 8%, guardian_grimoire 10%, malediction_bracelets 8%
- subterranean_shrine: reverium_sword 10%, reverium_axe 10%, sacred_speed_bracelets 8%, angel_feather 10%, electron_bracelets 8%, malediction_bracelets 8%
- overgrown_facility: fortunes_favor 10%, electron_bracelets 8%

**T2 tomes → T2 Terramity structures**
- fire_lookout_tower: tome_of_commotion 10%, galebounce_tome 10%, velocity_flip 8%
- suspicious_shrine: tome_of_commotion 8%, dimensional_poof 8%, galebounce_tome 8%
- mudhut: velocity_flip 10%, dimensional_poof 10%

**T4 Nyxium (knight + cosmic-purple) → T4 boss drops**
Originally allocated to infested_lab + ancient_outcrop (both overworld despite
late-game loot — T1-accessible by dimension alone). Moved to T4 bosses:
- cataclysm:netherite_monstrosity: nyxium_greatsword 15%, nyxs_necklace 10%
- cataclysm:ender_guardian: antimatter_pacemaker 10%, null_scarf 12%
- minecraft:ender_dragon: antiprism 10%, dragon_band 12%

### C.10b Terramity reforging + socketing wiring (audit 2026-05-19)

All 26 Terramity drops (12 weapons + 14 curios/tomes) routed to Apoth
LootCategories via `config/apotheosis/adventure.cfg` Equipment Type Overrides
so the reforging table accepts them and sigil-of-socketing recipes apply.
- 7 audit weapons (6 guns + unholy_lance) → sword (these extend Item, not SwordItem)
- 5 ingot weapons (auto via SwordItem/AxeItem)
- 6 tomes → magic_weapon (picks up 47 magic_weapon-typed affixes)
- 2 ranged firearms (fortunes_favor → bow; gaias_tempest → crossbow) — both
  initially mis-routed; decompile in the 2026-05-19 curio survey showed
  these are GeoItem-rendered guns with reload mechanics, not curios/tomes.
- 5 bracelets/bands → shield
- 3 chest curios (necklaces/amulets/pacemaker) → chestplate
- 2 head curios (null_scarf, antiprism) → helmet
- 1 boots curio (angel_feather) → boots

### C.10b.1 Terramity curio effect catalog (2026-05-19 survey)

Decompile-confirmed effect magnitudes for the 11 worn curios. Values logged
for future tuning; current state is shipped as-is except for the two speed
bracelets which are flagged in known-issues/tracker.md as setBaseValue
proc-trap items pending a post-cutover mixin pass.

| Item | Effect | Magnitude |
|------|--------|-----------|
| nyxs_necklace | +max_health (Forge attribute permanent) | +4 (4 hearts) |
| sacred_speed_bracelets | +movement_speed (mcreator setBaseValue proc) | +0.75 (~Speed VIII) |
| electron_bracelets | +movement_speed (mcreator setBaseValue proc) | +0.5 (~Speed V) |
| dragon_band | outgoing damage on LivingHurtEvent | x1.2 (+20%) |
| exodium_twin_bracelets | outgoing damage on LivingHurtEvent | x1.2 (+20%) |
| exodium_shield_amulet | incoming damage on LivingHurtEvent | x0.8 (-20%) |
| angel_feather | incoming damage + pushback attacker | x0.5 (-50%) / -0.5 Y velocity |
| antimatter_pacemaker | revive (sets death amount to -1.0f) | once per death |
| null_scarf | applies MISPROGRAMMED effect (custom) | flavor / particle / sound |
| malediction_bracelets | 3 MobEffectInstances applied on wearer-kill | flavor / curse |
| antiprism | (plain Item, no proc class registered) | placeholder / decorative |

### C.10c Terramity weapon clamp (audit 2026-05-19)

`kubejs/startup_scripts/terramity_weapon_durability.js` reflects on
`Item.maxDamage` to clamp all 12 Terramity weapons to 2500 durability.
Native values: 8124 ingot weapons (4x netherite), 16256 guns (8x netherite),
50000 unholy_lance (24x netherite).

`kubejs/server_scripts/terramity_weapon_attributes.js` strips native
ATTACK_DAMAGE/SPEED on exodium_waraxe + reverium_axe and re-adds clamped
values. Both had `Tier.getAttackDamageBonus = 14/12` vs vanilla netherite
axe = 7. Clamped to tier-bonus 8 (displayed +14, vs netherite +9). The
swords (tier-bonus 7-9.5) weren't outliers and were left alone.

### C.11 Custom Abyss-themed curio system (`loot/abyss_boss_loot.js`)

The Abyss mod (originally planned T3 dimension) is not currently in pack. The 7 custom `kubejs:ring_*` items below ship as a standalone curio chain replacing the originally-planned theabyss ring economy:

`kubejs:ring_of_shadows`, `ring_of_the_phantom`, `ring_of_embers`, `ring_of_frost`, `ring_of_void_sight`, `ring_of_the_knight`, `ring_of_dark_pact`, `ring_of_unorithe` — 8 rings total.

**Drop source reallocation — TBD (per #47 cleanup).** Original sources (Knight boss, Nightblade boss, final Abyss boss, ice_knight, soul_guard, guard) are entities from the absent mod. Pending operator decision on whether to reallocate to in-pack T3 bosses (e.g., Cataclysm Witherite-tier bosses, Twilight Hydra, Aether Sun Spirit) or rip the LootJS hooks entirely.

The 5 boss-drop armor sets (Knight, Unorithe, Ragnarok, Dragon, Death) originally tied here cannot drop — the source items are from the absent mod and have no in-pack equivalent.

### C.12 Boss mod integration — additional mods (design notes)

These boss mods are in the modlist but not yet enumerated in the dedicated `*_drops.js` files. They integrate via dimension-multiplier scaling rather than per-entity LootJS rules.

**Brutal Bosses.** 29+ structure-guarding mini-boss variants of vanilla mobs (Evoker Boss, Skeleton Boss, etc.). Spawn next to loot chests in any structure. Datapack-configurable. Scales naturally with the structure they appear in via ScalingMobs dimension multipliers — no separate Progressive Bosses scaling.

| Variant family | Primary spawn | Effective tier |
|----------------|---------------|:--------------:|
| Zombie / Skeleton / Spider | Overworld dungeons + YUNG's structures | T1 |
| Husk / Drowned / Cave Spider | Desert temples, ocean monuments, caves | T1–T2 |
| Evoker / Vindicator / Pillager | Woodland mansions, pillager structures | T2 |
| Blaze / Wither Skeleton / Piglin Brute | Nether fortresses, bastions | T3 |
| Guardian / Phantom / Shulker | Ocean monuments, End cities | T3–T4 |

**Ultris: Boss Expansion.** 8 unique bosses with custom AI, phases, music, and arena structures (Corrupted Enderman, Blaze King, Ultra Wither, Sanctum Keeper, Giant, Phantom Swarm, Shulker Stone, +1). Treated as progression-tier bosses on par with Cataclysm/Meet Your Fight; placed by dimension and difficulty.

| Boss | Location | Tier | Simply Swords unique? |
|------|----------|:---:|:---:|
| Corrupted Enderman | Overworld structure | T2 | Yes — void/teleport katana |
| Giant | Overworld surface structure | T2 | No |
| Phantom Swarm | Overworld night event | T2 | No |
| Blaze King | Nether tower | T3 | Yes — fire greatsword |
| Sanctum Keeper | T3-T4 structure | T3-T4 | TBD |
| Ultra Wither | Summoned (T3+) | T3-T4 | Yes — wither unique |
| Shulker Stone | End | T4 | Yes — End-themed |

> Ultra Mode (the mod's hard-mode difficulty toggle) unlocks per-boss after first kill — functions like Progressive Bosses 5th-kill difficulty.

**LuMoreBossesAndMobs.** Macholote, Terezinossauro, Mini Golems (Gold/Diamond), End Dwellee. Treated as ambient mini-bosses; ScalingMobs handles their scaling.

| Boss | Tier | Notes |
|------|:---:|-------|
| Macholote | T1 | Overworld surface |
| Terezinossauro | T2 | Therizinosaurus Claw Spear unique drop |
| Gold Mini Golem | T1 | Gold-themed loot |
| Diamond Mini Golem | T2 | Diamond-themed loot |
| End Dwellee | T4 | End-exclusive materials |

**Majestic Menaces.** Per-boss thematic drops; treated as named encounters (Teikoku Senshi line). T2-T3 placement.

**Mutant Monsters.** Variants of vanilla zombie/skeleton/creeper/enderman with enhanced AI and drops. Block-break suppression in `mutant_monsters_no_griefing.js` — mutant zombie pillar-up and mutant creeper charged explosion bypass mobGriefing=false defaults. Wired via `dimensional_boss_drops.js`.

**Ultimate Bosses.** In pack (`ultimate-bosses-1.0.4.jar`) but not yet enumerated in the dedicated `*_drops.js` files. Pending T4 loot + Rift materials allocation against the 14-weapon Simply Swords reserve.

#### Loot config priorities

Boss-mod loot tables should be configured in this order during implementation:

1. Brutal Bosses datapacks — override default loot tables; tier 1 → vanilla materials + small XP; tier 4 → netherite scraps + Rare-Epic Apotheosis affix item; never includes Simply Swords uniques.
2. Ultris — assign Simply Swords uniques + tier-appropriate materials per the table above.
3. LuMoreBossesAndMobs — verify no drops bypass tier gating.
4. Ultimate Bosses — assign T4 loot + Rift materials.
5. Cataclysm-Apotheosis integration — *verify source: per #47 cleanup audit, no `cataclysm*apoth*` jar in the live mods folder; integration may be supplied by `cataclysm_ut` or similar. Operator confirmation needed.*

### C.13 Simply Swords unique-count audit

The pack's named-unique distribution targets healthy variety per tier without making any single drop feel non-special.

| Tier | Unique weapons assigned | Target |
|:----:|------------------------:|--------|
| T2 | ~10–12 | Enough variety that players see several before T3 |
| T3 | ~10–14 | Widest variety — most boss diversity here |
| T4 | ~8–10 | Elite weapons, trophy status |
| Endgame / Mythic | 7 (Mythic Uniques from Rift Blueprints) | Top-end horizontal variety |
| **Total** | **~35–43** unique weapons | |

Each class should have 3–4 viable unique options across the full progression — enough that build identity feels authored without forcing a single best-in-slot.

### C.14 Counts

**88 entities** with explicit LootJS rules (was 17 pre-Phase-6F; +71 from Phase 6F + audit Phase 4.1). Plus the additional boss mods covered in C.12 that integrate via ScalingMobs without dedicated LootJS files.

---

## D. Apotheosis Tables + Scaling

### D.1 Affix rates by tier

Per-dimension rarity clamps (controls both fresh-spawn ceiling and convert/reroll cap).
Updated 2026-05-14: clamps bumped to match natural fresh-spawn ceilings; convert
path was previously more restrictive than fresh spawns. Both `config/apotheosis/
adventure.cfg` "Affix Convert Rarities" and "Gem Dimensional Rarities" mirror
these clamps.

| Tier | Dimensions | Rarity range | Max Sockets |
|------|-----------|--------------|------------:|
| 1 | Overworld | Common-Rare | 1 |
| 2 | Twilight Forest / Blue Skies / Aether | Common-Epic | 2 |
| 3 | Nether / Undergarden / Deeper Darker / Abyss | Common-Mythic | 3 |
| 4 | Deep Aether / End | Common-Ancient | 4+ |

Per-dimension floor (min rarity) keeps natural floors for higher tiers: Nether
mob drops floor at Rare, Deep Aether floors at Rare, End floors at Epic — no
"junk Common rolls in T4" pollution.

Configured in `config/apotheosis/affixes/` + `config/apotheosis/adventure.cfg` with per-dimension tier inference. Total: 84 JSON affixes + 65 event-driven affixes (`affixes/affix_effects.js`).

### D.2 Reforging gates

**Workstations are NOT AStages-gated** (changed 2026-05-14). All 9 Apotheosis
workstations (simple_reforging_table, reforging_table, augmenting_table,
gem_cutting_table, sigil_of_socketing, sigil_of_rebirth, sigil_of_withdrawal,
sigil_of_enhancement, sigil_of_unnaming) are available from T1. Crafting them
is a T1 activity.

The actual progression gate is the **rarity ladder** (D.1 above) plus boss-drop
tokens for reroll operations:

- **Basic reroll** at simple_reforging_table: Tier 2 boss `basic_reforging_token` required.
- **Advanced reroll** at reforging_table: Tier 3 boss `advanced_reforging_token` + expensive materials.
- **Ultimate reroll** at augmenting_table: Tier 4 boss `ultimate_reforging_token` + Gaia ingots / antimatter.

Rationale: previous workstation gating was belt-and-suspenders. Three caps
already constrain affix/gem progression (dimensional rarity clamp + boss-drop
tokens + Apotheosis's source-tier inference). Workstation gates added nothing
functional; they just blocked crafting/placement. Removed.

### D.3 Gem tiers

Boss-source determined gem tier:
- T1-T2 bosses → Common / Uncommon gems.
- T3 bosses (Cataclysm, F&A, Stalwart) → Rare / Epic gems.
- T4 bosses (Ender Dragon, Gaia Guardian, Ancient Remnant, Wither) → Legendary / Mythic gems.

### D.4 Dimension stat multipliers (full)

Four stats scale independently per dimension. **Damage scales fastest, HP moderately, Speed and Armor minimally.**

Base reference: Overworld zombie = 20 HP, 3 damage, 0 armor, 100% speed.

| Dimension | Tier | HP × | DMG × | Speed × | Armor × | Mob gear % | Notes |
|-----------|-----:|-----:|------:|--------:|--------:|-----------:|-------|
| Overworld | 1 | 1.0 | 1.0 | 1.0 | 1.0 | 5% leather/iron | Baseline |
| Twilight Forest | 2 | 1.8 | 2.0 | 1.05 | 1.3 | 20% iron-tier | Canopy ambushes |
| Blue Skies | 2 | 2.0 | 2.3 | 1.05 | 1.4 | 25% iron-tier | Elemental damage |
| The Aether | 2 | 2.2 | 2.5 | 1.08 | 1.5 | 25% iron/steel | Aerial combat |
| Undergarden | 3 | 3.0 | 3.5 | 1.10 | 2.0 | 40% steel/diamond | Toxic attrition |
| Deeper Darker (Otherside) | 3 | 3.5 | 4.0 | 1.10 | 2.2 | 45% diamond-tier | Horror stealth + Abyss-themed custom mechanics |
| The Nether | 3 | 4.0 | 5.0 | 1.12 | 2.5 | 50% diamond/netherite | Soulfire bypass |
| Deep Aether | 4 | 5.0 | 6.5 | 1.15 | 3.0 | 60% netherite | Multi-phase |
| End — Outer Islands | 4 | 6.0 | 8.0 | 1.15 | 3.5 | 70% netherite | Void proximity |
| End — Deep End / Cities | 4 | 7.5 | 9.0 | 1.18 | 4.0 | 75% netherite | Phase shift |
| End — Dragon's Domain | 4 | 10.0 | 12.0 | 1.20 | 5.0 | 80% netherite + enchanted | Dragon influence |
| Ad Astra (any planet) | 4 | 5.0-7.0 | 5.0-7.0 | 1.15-1.18 | 3.0-4.0 | 60-75% | Per-planet atmospheric |

Implementation: `kubejs/server_scripts/scaling/mob_scaling_unified.js`.

Per-dimension elite-mob density is now handled by **Majrusz's Progressive Difficulty** (Master-stage scaling) since the 2026-04-07 Champions Unofficial removal. Per-mob affix layering remains via Apotheosis adventure affixes (D.1).

### D.5 Death durability loss by dimension

| Dimension | Loss % |
|-----------|------:|
| Overworld | 10% |
| Twilight Forest | 12% |
| Blue Skies | 14% |
| The Aether | 15% |
| The Undergarden | 17% |
| Deeper Darker / Abyss | 18% |
| The Nether | 20% |
| Deep Aether | 22% |
| The End | 25% |

Soulbound enchant: I = 50% prevention, II = 75%, III = 100% (and items don't go inert from death). Implementation: `kubejs/server_scripts/death_penalty.js`.

### D.6 Boss HP base values + Progressive Bosses scaling

Per-boss base HP at first kill. All bosses scale with Progressive Bosses (per-world, not per-player).

| Boss | Tier | First kill HP | 10th kill HP |
|------|-----:|--------------:|-------------:|
| Twilight Naga | 2 | 300 | 600 |
| Twilight Lich | 2 | 400 | 800 |
| Twilight Hydra | 2 | 500 | 1,000 |
| Ur-Ghast | 2 | 600 | 1,200 |
| Blue Skies bosses (Summoner / Alchemist / Starlit Crusher / Arachnarch) | 2 | 350-500 | 700-1,000 |
| Aether bosses (Slider / Valkyrie Queen / Sun Spirit) | 2 | 400-550 | 800-1,100 |
| `irons_spellbooks:citadel_keeper` | 3 | 600 | 1,200 |
| `irons_spellbooks:fire_boss` | 3 | 700 | 1,400 |
| `irons_spellbooks:dead_king` | 3 | 800 | 1,600 |
| Wither | 3 | 600 | 1,200 |
| Cataclysm Harbinger (Deeper Darker boss) | 3 | 800 | 1,600 |
| `cataclysm:the_leviathan` | 3 | 850 | 1,700 |
| `cataclysm:maledictus` | 3 | 900 | 1,800 |
| `cataclysm:netherite_monstrosity` | 3 | 900 | 1,800 |
| `cataclysm:ignis` | 3 | 1,000 | 2,000 |
| `cataclysm:ignited_revenant` | 3 | 1,000 | 2,000 |
| Meet Your Fight bosses | 3 | 700-1,000 | 1,400-2,000 |
| `cataclysm:ender_golem` | 4 | 1,200 | 2,400 |
| Ender Dragon | 4 | 1,000 | 2,000 |
| Gaia Guardian | 4 | 1,200 | 2,400 |
| `cataclysm:ender_guardian` | 4 | 1,500 | 3,000 |
| `cataclysm:ancient_remnant` | 4 | 2,500 | 5,000 |

Implementation: `kubejs/server_scripts/scaling/boss_hp.js` + `boss_progressive.js`.

#### Progressive Bosses per-kill scaling

Per-world, not per-player. Encourages varied boss hunting rather than farming one boss.

| Kill count | HP bonus | Damage bonus | Speed bonus | New mechanics |
|-----------:|---------:|-------------:|------------:|---------------|
| 1st | base | base | base | Base moveset |
| 2nd | +15% | +10% | +3% | — |
| 3rd | +30% | +20% | +5% | +1 new attack pattern |
| 5th | +50% | +35% | +8% | +1 additional phase |
| 10th | +100% | +60% | +12% | Full enhanced moveset |
| 15th+ | +150% (cap) | +80% (cap) | +15% (cap) | Maximum difficulty |

#### Progressive Bosses drop-quality scaling

Bosses drop slightly better gear at higher kill counts — incentivizes repeated farming as difficulty rises.

| Kill count | Drop quality |
|-----------:|--------------|
| 1st-3rd | Base drops |
| 4th-6th | +10% chance for higher affix rarity |
| 7th-10th | +20% chance, bonus enchantment level |
| 10th+ | +25% chance, guaranteed additional drop |

### D.7 Apotheosis-spawned random world bosses

Independent from designed bosses. Spawn at random per-chunk-per-cycle in each dimension, level scales with dimension tier.

| Dimension | Spawn rate | Base stats × | Level range |
|-----------|-----------:|-------------:|------------:|
| Overworld | 2% | 1.0 | 1-10 |
| Tier 2 dimensions | 4% | 2.0 | 10-25 |
| Tier 3 dimensions | 6% | 3.5 | 25-50 |
| Tier 4 dimensions | 8% | 6.0 | 50-80 |
| End — Dragon's Domain | 10% | 10.0 | 80-100 |

Apotheosis bosses drop gear with affixes matching their level. Higher level → better affix rarity.

### D.8 Estimated player power (Tier 4, well-geared)

Power across class archetypes after accounting for class modifiers, equipment HP halving, Vitality enchant, Spice of Life HP bonuses, JustLevelingFork, Apotheosis affixes, gem socketing, and typical enchantment setups.

| Stat | Glass Cannon (Ranger / Archmage / Void Summoner) | Hybrid (Samurai / Battlemage / Wanderer / Artificer) | Tank (Vanguard / Paladin) |
|------|--------------------------------------------------|------------------------------------------------------|---------------------------|
| Max HP | 80-120 (40-60 hearts) | 140-180 (70-90 hearts) | 220-300 (110-150 hearts) |
| Effective HP (after damage reduction) | 160-300 | 350-540 | 700-1,200 |
| Damage Per Hit | 50-90 | 40-65 | 25-45 |
| Attack Speed | High | Moderate | Low-Moderate |
| Sustained DPS | 80-140 | 60-100 | 30-55 |

### D.9 Target kill speeds (Tier 4 End, regular mob)

How long T4 fights should feel from each side. These are the design targets that drive the multipliers in D.4.

**Player vs regular mob**

| Player build | Hits to kill trash | Hits to kill Elite/Champion |
|--------------|-------------------:|----------------------------:|
| Berserker (melee DPS) | 2-3 | 8-12 |
| Ranger / Archmage (ranged DPS) | 2-4 | 8-15 |
| Samurai / Battlemage (hybrid) | 3-5 | 10-18 |
| Wanderer | 4-6 | 12-20 |
| Paladin | 5-7 | 15-22 |
| Vanguard (tank) | 7-10 | 20-30 |
| Artificer | 4-6 | 12-20 |
| Void Summoner (via minions) | 4-8 (minion swarm) | 15-25 (minion swarm) |

**Regular mob vs player**

| Player build | Hits to die (regular mob) | Hits to die (Champion) | Hits to die (Boss) |
|--------------|--------------------------:|-----------------------:|-------------------:|
| Ranger / Archmage | 3-4 | 2 | 1 |
| Void Summoner | 4-5 | 2-3 | 1-2 |
| Berserker | 5-6 | 3-4 | 1-2 |
| Samurai / Battlemage / Wanderer | 6-8 | 4-5 | 2-3 |
| Artificer | 6-8 | 4-5 | 2-3 |
| Paladin | 8-10 | 5-7 | 3-4 |
| Vanguard | 10-14 | 7-9 | 4-6 |

These numbers are the design targets — actual gameplay numbers WILL drift via emergent interaction of 7+ gear-enhancement layers, 10 classes, dimension mechanics, and mob scaling. Expect 2-3 full tuning passes minimum during playtesting; start at 80% of designed values and tune up.

### D.10 ~~Champion affix pool~~ — REMOVED 2026-04-07

> **Historical reference.** This section documented the Champions Unofficial affix pool. The mod was removed from the pack 2026-04-07 and replaced by **Majrusz's Progressive Difficulty** (per `wiki/systems/overview.md:54`). Master-stage scaling now handles per-dimension elite-mob density without the Champions affix layer. Per-mob affix overlays are handled by Apotheosis adventure affixes (D.1).
>
> The original Champions affix pool — Molten / Arctic / Venom / Wither / Desecrating / Enkindling / Shielding / Reflecting / Regenerating / Armored / Adaptable / Hasty / Knockback / Blink / Leaping / Commanding / Summoning / Draining / Hexing — and the dimension-weighted assignment table are retained in git history (this section pre-2026-05-28). Restore only if Champions Unofficial is re-added.

### D.11 Regular mob equipment progression

Mob spawn-with-gear rates per dimension (Improved Mobs config). Independent from Champion gear.

| Dimension | % equipped | Equipment tier | Enchantment level |
|-----------|-----------:|----------------|------------------:|
| Tier 1 | 5% | Leather / iron (random pieces) | None |
| Tier 2 | 20-25% | Iron / steel | 0-1 (basic) |
| Tier 3 | 40-50% | Steel / diamond | 1-3 (moderate) |
| Tier 4 (Deep Aether) | 60% | Diamond / netherite | 2-4 |
| Tier 4 (End — outer/deep) | 70-80% | Netherite | 3-5 |
| Tier 4 (End — Dragon's Domain) | 80% | Netherite + enchanted | 5+ |

Champion mobs spawn with one tier above the base for their dimension, plus a chance at affix-bearing gear (which drops on kill — Champions are a player-affix-gear source).

### D.12 Implementation notes

These targets drive 6 implementation layers (was 7 — Champions Unofficial layer removed 2026-04-07; replaced by Majrusz Master-stage scaling):

1. **ScalingMobs** — dimension HP / damage / speed / armor multipliers (D.4).
2. **Majrusz's Progressive Difficulty** — per-dimension elite-mob density via Master-stage scaling (replaces former Champions Unofficial layer).
3. **Improved Mobs** — per-dimension AI (gear usage, block-breaking, coordination, difficulty escalation).
4. **Progressive Bosses** — per-kill scaling (D.6).
5. **KubeJS mob event handlers** — dimension-specific mechanics (Twilight ambush, Undergarden spores, End displacement, Nether soulfire).
6. **Loot table integration** — elite drops, boss drops, gear scaling per dimension.
7. **Boss HP overrides** — custom HP via `kubejs/server_scripts/scaling/boss_hp.js` (D.6).

End multi-zone implementation (Outer Islands / Deep End / Dragon's Domain) lives in `kubejs/server_scripts/end/dragon_exploration_gate.js` with biome-based scaling. Environmental hazard scripting (Void Corruption stacks, Celestial Events, Void Storms, Reality Fracture) lives in `kubejs/server_scripts/scaling/dimension_mechanics.js`.

**Critical playtesting note:** all numbers in D.4-D.11 are *theoretical*. The interaction of 7+ gear-enhancement layers, 10 classes, dimension mechanics, and mob scaling creates emergent complexity that can only be balanced through iterative playtesting. Recommended testing approach:

1. Test with a "standard" build (Samurai, mid-tier gear, moderate enchants) as the baseline.
2. Test extremes: naked Archmage vs End mobs, full Vanguard vs Overworld mobs.
3. Test multiplayer: Vanguard + Archmage duo vs designed solo difficulty.
4. Adjust multipliers in 10% increments until kill-speed targets are met.

---

## E. Custom Items Registry

All `kubejs:*` items, ~80 total. Organized by category. Source: `kubejs/startup_scripts/custom_items.js` + `endgame_items.js`.

### E.1 Progression tokens (T1-T4)

- `kubejs:tier1_token`, `kubejs:tier2_token`, `kubejs:tier3_token`, `kubejs:tier4_token` — full tier unlock tokens (from quests / boss completion paths).
- `kubejs:t2_token_fragment`, `kubejs:t3_token_fragment`, `kubejs:t4_token_fragment` — collectible fragments (drop from T2-T4 bosses; combine to full tokens).
- `kubejs:tier2_token_fragment`, `kubejs:tier3_token_fragment` — alternate fragment names (legacy; both work).
- `kubejs:dimensional_progression_token_t3` — Hephaestus Forge crafting reagent.
- `kubejs:reality_progression_token_t4` — NASA Workbench crafting reagent.

### E.2 Boss materials (drop-only)

- `kubejs:lich_soul`, `kubejs:harbinger_eye`, `kubejs:dragon_heart`, `kubejs:dragon_scale`, `kubejs:naga_scale`, `kubejs:hydra_fang`, `kubejs:ur_ghast_tear` — boss-specific drop reagents.
- `kubejs:nether_soul_fragment` (Wither Skeleton drop), `kubejs:condensed_blaze_essence` (Blaze drop), `kubejs:ignis_core` (Ignis drop).
- `kubejs:gaia_spirit_fragment` (Gaia Guardian).
- `kubejs:waystone_core` — boss-drop reagent for Waystone crafting.
- `kubejs:basic_reforging_token`, `kubejs:advanced_reforging_token` — boss-drop reforging-tier reagents.

### E.3 Endgame materials

- `kubejs:icraft_rift_shard` — primary endgame currency. Renamed 2026-04-27 from `kubejs:rift_shard` to resolve `too_many_bows:rift_shard` namespace collision. Old ID still registered as deprecated alias for migration window (~2 weeks). Migration script: `kubejs/server_scripts/migrations/rift_shard_rename.js`.
- `kubejs:rift_shard` — deprecated alias (migration target).
- `kubejs:void_fragment` — secondary endgame currency.
- `kubejs:rift_keystone` — Rift entry item (consumed on Rift entry).
- `kubejs:rift_core` — rare Mythic Catalyst V reagent.
- `kubejs:rift_blueprint` — Mythic unique recipe slot ingredient.
- `kubejs:rift_gem` — Mythic Forge intermediate.
- `kubejs:primordial_essence` — most expensive crafting reagent (Glacio rocket + Mythic catalysts III-V).
- `kubejs:mythic_forge` (block-item) — endgame crafting station.
- `kubejs:mythic_catalyst_1` … `kubejs:mythic_catalyst_5` — escalating Mythic effect tokens.
- `kubejs:mythic_reforge_token` — gear-modifier reset.
- `kubejs:void_coffer` — Rift-banking storage.
- `kubejs:dragon_summoning_crystal` — Ender Dragon respawn reagent.

### E.4 Mythic uniques (Mythic Forge crafted)

- `kubejs:mekasuit_mk2_helmet`, `kubejs:mekasuit_mk2_chestplate`, `kubejs:mekasuit_mk2_leggings`, `kubejs:mekasuit_mk2_boots` — MekaSuit Mk2 4-piece set (consume base MekaSuit + Aethersteel + Glacio Stone + Primordial Essence).
- Voidheart Blade, Oblivion Aegis, Riftwalker Boots, Oblivion Crown — these are renamed-with-NBT Mythic Forge outputs based on existing items (Awakened Lichblade / netherite armor) rather than fully-custom items. Recognized via NBT display.Name match in `endgame/rift_mechanics.js`.

### E.5 Cross-mod alt-recipe outputs

- `kubejs:enderium_via_occultism` — Thermal-bypass enderium alternative.
- `kubejs:hdpe_circuit_board` — IF latex rework alternative.
- `kubejs:brass_reinforced_iron_ingot` — Tier 1.5 alloy.
- `kubejs:mana_infused_steel_ingot` — Tier 2.5 alloy.
- `kubejs:ender_forged_diamond` — Tier 3.5 alloy.

### E.6 Planetary materials (Create Crushing extraction)

- `kubejs:helium_3` — Moon extraction.
- `kubejs:titanium_dust` — Moon byproduct.
- `kubejs:ferric_oxide` — Mars primary.
- `kubejs:cryogenic_crystal` — Mars rare.
- `kubejs:cryogenic_element` — Mars chain product.
- `kubejs:rare_earth_dust` — Mercury / Venus.
- `kubejs:solar_crystal`, `kubejs:pressure_crystal` — Venus.
- `kubejs:sulfuric_compound` — Venus chain.
- `kubejs:alien_isotope` — Mercury / Glacio rare.

### E.7 Custom Abyss-themed curio rings

- `kubejs:ring_of_shadows`, `kubejs:ring_of_the_phantom`, `kubejs:ring_of_embers`, `kubejs:ring_of_frost`, `kubejs:ring_of_void_sight`, `kubejs:ring_of_the_knight`, `kubejs:ring_of_dark_pact`, `kubejs:ring_of_unorithe` — 8 custom rings shipped as a standalone curio chain. Originally designed as substitutes for The Abyss mod's 30-ring system; the source mod is not currently shipped, so the rings remain as standalone in-pack content (drop sources TBD per #47 — see C.11).

### E.8 Misc

- `kubejs:compass_of_return` — return-to-spawn item.

### E.9 Counts

**~80 custom items** registered across `custom_items.js` + `endgame_items.js` + a few in `startup_scripts/iridescent_codex.js`.

---

## F. Mod Roster by Tier

Per-mod tier placement, side label (per server_distribution `.pw.toml`), custom-jar marker. Side label key: `B` = both, `C` = client-only (server skips), `S` = server-only (client skips). Custom-jar marker `*` = bundled JAR (not in packwiz, see CLAUDE.md "Custom Bundled JARs").

### F.1 Tier 1 (Overworld, Day 1)

| Mod | Side | Notes |
|-----|:----:|-------|
| Create | B | T1 kinetic automation |
| Create: Addition / Estrogen / Genderless | B | Create addons |
| Pretty Pipes | B | Early item logistics |
| Botania | B | T1 mana entry; full chain unlocks at higher tiers |
| Iron's Spellbooks | B | T1 starter scrolls + copper book |
| Ars Nouveau | B | T1 novice book + Scribes Table (corrected 2026-04-24) |
| Origins (Forge) + Iridescent Origins (`*`) | B | 13 origins; Iridescent Origins is custom JAR |
| Iridescent Classes (in `iridescent_origins-1.0.0.jar`) | B | 10 classes |
| Iridescent Modular Spells (`*`) | B | Tetra integration mod (Phase 6); custom JAR |
| Iridescent Biomes (`*`) | B | Custom Cherry biomes; custom JAR (TerraBlender region registration) |
| Iridescent Codex Data (`*`) | B | Patchouli codex content; custom JAR (modId `icraft`) |
| zeta_racefix (`*`) | B | Race selection fix; custom JAR |
| Aquaculture | B | Fishing |
| Pam's HarvestCraft 2 (Crops/Trees/Food Core/Food Extended) | B | Food economy entry |
| Farmer's Delight + addons (Alex's/Nether's/Cultural/Delightful) | B | Cooking |
| Cooking for Blockheads | B | Kitchen multiblock |
| Brewin' and Chewin' | B | Fermentation |
| Simple Farming | B | Additional crops |
| Iron Jetpacks | B | Tiered flight (intentional T1 entry) |
| Sophisticated Backpacks/Storage | B | T1+ storage |
| Storage Drawers | B | T1+ storage |
| Quark | B | Vanilla-friendly extras |
| Patchouli (`*`) | B | Bytecode-patched (resource-pack enforcement disabled) |
| Apotheosis | B | T1+ affix system |
| Tetra | B | Modular crafting |
| Tetra Tables | B | Tetra workbench |
| Tetracelium | B | Tetra material extension |
| Decorative Blocks / LGBT Wall Flags / Connected Glass / Domum Ornamentum / Macaw's suite | B | Building |
| JourneyMap, Jade, AppleSkin, Mouse Tweaks, Controlling, Inventory HUD+, Overflowing Bars, Fast Leaf Decay, TrashSlot, Trash Cans | C | QoL (client-only) |
| FTB Ultimine, FTB Chunks, FTB Essentials | B | Server utilities |
| Embeddium, ModernFix, ImmediatelyFast, Oculus | C | Client performance |

### F.2 Tier 2 (Twilight, Aether, Blue Skies — dimensional access)

| Mod | Side | Notes |
|-----|:----:|-------|
| Twilight Forest | B | T2 dimension + 8-boss progression |
| Blue Skies | B | Everbright/Everdawn duality |
| The Aether (+ Deep Aether at T4) | B | T2 dim |
| Aether Treasure Reforging | B | Aether reforging |
| Aether Protect Your Moa | B | Aether companion |
| Aetheric Tetranomicon | B | Aether-Tetra bridge |
| Thermal Series (Foundation, Innovation, Expansion, Cultivation, Dynamics, Integration) | B | T2 RF + ore processing |
| Industrial Foregoing (basic) | B | T2 mob interaction + automation |
| Mekanism Tools | B | Tools (T2 entry) |
| Ad Astra protect-your-moa equiv | B | (none — Ad Astra is T4) |
| Apotheosis | B | T2 affixes (Uncommon + Rare) |

### F.3 Tier 3 (Nether, Undergarden, Deeper Darker, Abyss)

| Mod | Side | Notes |
|-----|:----:|-------|
| Mekanism (basic) | B | Mod-blanket T3 stage |
| Mekanism Generators | B | Mod-blanket T3 stage |
| Mekanism AAA (refined obsidian armor variants — recipe-stripped) | B | T3+ |
| Refined Storage | B | Mod-blanket T3 stage |
| Refined Storage Addons / Extra Storage / Extra Disks / RSRequestify | B | RS expansion (T3 stage) |
| XNet | B | T3 mod-blanket |
| Industrial Foregoing (advanced) | B | Laser Drill, Mob Crusher (T3 entry) |
| Forbidden & Arcanus | B | T3 chokepoint (per-item gated, NOT mod-blanket) |
| Occultism | B | T3 chokepoint (per-item gated, NOT mod-blanket) |
| L_Ender's Cataclysm | B | T3 nether boss line |
| Cataclysm UT | B | Cataclysm utility addon |
| Deeper Darker | B | T3 dimension (Otherside) — hosts the custom Abyss-themed mechanics in lieu of a dedicated Abyss mod |
| Mahou Tsukai | B | T4 actually (mod is T4-staged); mahou-related drops at T2-T4 cross-mod |
| Stalwart Dungeons | B | T3 nether mini-bosses |
| Mutant Monsters | B | T3 boss-tier mobs |
| Apotheosis | B | T3 affixes (Epic) |

### F.4 Tier 4 (Deep Aether, End, Ad Astra)

| Mod | Side | Notes |
|-----|:----:|-------|
| Mekanism (advanced) | B | Items individually staged at T4 (MekaSuit, MekaTool, etc.) |
| Cable Tiers | B | Mekanism cable upgrade tiers |
| Walkable Mekanism Cables (`*`) | B | Coremod (custom JAR, walkable cables QoL) |
| RFTools Dimensions | B | T4 mod-blanket |
| RFTools Builder / Power / Storage / Base | B | RFTools support |
| Ad Astra | B | T4 dim mod (5 planets) |
| Mahou Tsukai | B | T4 mod-blanket |
| Aethersteel | B | T4 endgame metal chain |
| RSInfinityBooster | B | T4 mod-blanket |
| EnderChests | B | T4 mod-blanket (cross-dimensional storage = endgame) |
| EnderStorage | B | T4 mod-blanket |
| Apotheosis | B | T4 Mythic affixes |
| End Portal Recipe | B | T4 hard-gated |

### F.5 Crosscutting / always-active

| Mod | Side | Notes |
|-----|:----:|-------|
| Origins (Forge) + Iridescent Origins | B | Three-prompt character creation |
| Pufferfish's Skills + skill tree | B | Active skill investment |
| JustLevelingFork | B | Passive level scaling |
| Better Combat | B | Combat animation/feel |
| Cataclysmic Combat | B | Enhanced AI |
| Improved Mobs | B | Behavior + equipment |
| ScalingMobs | B | Dimension-keyed scaling |
| Progressive Bosses | B | Per-kill boss buffing |
| Azukaar's Fair Difficulty Overhaul | B | Difficulty tuning |
| Difficult Caves | B | Cave-specific aggression |
| Spice of Life: Carrot Edition | B | Food diversity HP bonuses |
| Hunger Overhaul | B | Faster hunger drain |
| Sleep Hunger | B | Sleep-hunger interaction |
| Naturalist | B | Mob cosmetics (passive animals) |
| Creeper Overhaul | B | Biome-themed creepers |
| Nether Zombies / Nether Skeletons | B | Mob expansion |
| Enemy Expansion | B | Mob expansion |
| Savage and Ravage | B | Illager expansion |
| Bygone Nether | B | Nether content expansion |
| Twilight Aether | B | Cross-mod (TF + Aether) |
| Mutant Monsters | B | Mob expansion (block-break suppressed in `mutant_monsters_no_griefing.js`) |
| Meet Your Fight | B | Boss mod |
| Multiplayer Bosses | B | Boss mod |
| Majestic Menaces | B | Boss mod |
| Majruszsdifficulty | B | Difficulty advancement items |
| Too Many Bows | B | Bow content (T1-T4 chest pool allocation per audit Phase 2.2) |
| Toe (T.O.E.) | B | Single-token integration |
| Simply Swords | B | Boss-drop unique weapons |
| Cataclysm | B | Boss-drop weapons |
| Iron's Patreon Lib | B | ISS support library |
| Tetra | B | Modular workbench |
| Tetra + art_of_forging + adtetra + tetra_re_enlarged | B | Crafted modular weapons + armor + tools (formerly documented as "Truly Modular"; verify naming during #47 followup) |
| Apotheosis | B | Affixes / reforging / gem cutting / sigils |
| Citadel | B | Library mod |
| Geckolib (in many mods) | B | Animation library |

### F.6 Custom-bundled JARs (not in packwiz)

Per CLAUDE.md "Custom Bundled JARs" section. Allowlist in `iridescentserver.bat` + `sync_from_repo.bat` + `update_mods.sh`.

| JAR | Purpose | Bytecode-patched? |
|-----|---------|:-----------------:|
| `iridescent_codex_data.jar` | Patchouli codex content (modId `icraft`) | No |
| `iridescent_origins-1.0.0.jar` | 13 origins / 11 races / 10 classes | No |
| `iridescent_biomes-1.0.0.jar` | TerraBlender region registration | No |
| `iridescent_modular_spells-0.2.0.jar` | Tetra-integrated modular spell books (Phase 6) | No |
| `mek_walkable_cables-1.0.1.jar` | Walkable Mekanism cables coremod | No |
| `offlineskins-1.20.1-v1.jar` | Offline-mode skin support | No |
| `zeta_racefix-1.0.0.jar` | Race selection fix | No |
| `Patchouli-1.20.1-85-FORGE.jar` | Codex framework | **Yes** (athrow→pop in Book.class) |
| `ars_nouveau-1.20.1-4.12.7-all.jar` | Ars Nouveau core | **Yes** (DungeonLootEnhancerModifier disabled) |

`-noverify` JVM arg required (server: in `iridescentserver.bat`; client: PrismLauncher Java settings).

---

## G. Stage Restrictions

Direct dump from `kubejs/server_scripts/gates/astages_restrictions.js` as of 2026-04-27 audit completion. Content evolves; this is a snapshot.

### G.1 Tier 2 stage

**Mod blanket gate**: `industrialforegoing` (T2 since IF basic is T2 entry).

**Items** (~30 entries):
- Ars Nouveau: `apprentice_spell_book`, `enchanting_apparatus`, `arcane_core`.
- Iridescent Modular Spells: `modular_iron_spell_book`, `modular_gold_spell_book`, `modular_apprentice_spell_book`.
- Botania: `manasteel_ingot`, `mana_diamond`, `mana_pearl`, `manasteel_block`, 4-piece manasteel armor, manasteel tools (sword, pick, axe, shovel), `mana_diamond_block`.
- Apotheosis T2 workstations: `simple_reforging_table`, `gem_cutting_table`, `sigil_of_socketing`.
- rpgseteffects: 14 base class artifacts (altharion / blade_dancer / blood_fury / chronorend / hellbrand / hexweaver / ignisphere / moonpiercer / phoenix / sanctum / shadow_hunter / stormpiercer / vaelkhor / wolfheart) + `artifact_piece_pouch`.
- art_of_forging T2 (audit Phase 2.3): `ancient_axe`, `ancient_blade`, `ancient_flail`.

**Dimensions**: `twilightforest:twilight_forest`, `blue_skies:everbright`, `blue_skies:everdawn`, `aether:the_aether`.

### G.2 Tier 3 stage

**Mod blanket gates**: `mekanism`, `mekanismgenerators`, `refinedstorage`, `extrastorage`, `extradisks`, `rsrequestify`, `xnet`.

**Items** (~50 entries):
- Quartz chain: `nether_quartz_ore`, `quartz`, `quartz_block`, smooth/chiseled/pillar/bricks variants, stairs/slab + smooth equivalents, `overworld_quartz:overworld_quartz_ore`, `overworld_quartz:deepslate_quartz_ore`.
- Diamond chain: `diamond`, `diamond_block`, 4-piece diamond armor, 4-piece diamond tools + diamond_horse_armor, `diamond_ore`, `deepslate_diamond_ore`, `enchanting_table`.
- Nether: `ancient_debris`, `respawn_anchor`.
- Ars Nouveau T3: `archmage_spell_book`, `imbuement_chamber`.
- Iridescent Modular Spells: `modular_diamond_spell_book`, `modular_archmage_spell_book`.
- Botania T3: `terrasteel_ingot`, `terrasteel_block`, 4-piece terrasteel armor, `elementium_ingot`, `elementium_block`, 4-piece elementium armor, `elementium_sword`, `elementium_pickaxe`, `elementium_axe`, `elementium_shovel`, `elementium_shears`, `dragonstone`, `dragonstone_block`.
- Thermal T3: `enderium_ingot`.
- T3 vanilla derivatives: `beacon`.
- Apotheosis T3: `reforging_table`, `sigil_of_rebirth`, `sigil_of_withdrawal`.
- Forbidden Arcanus T3: `arcane_crystal`, `arcane_crystal_block`, `arcane_crystal_ore`, `deepslate_arcane_crystal_ore`.
- art_of_forging T3 (audit Phase 2.3): `sigil_of_eden`, `devils_soul_gem`.

**Ore replacements**: 8 ore replacements (diamond/deepslate-diamond/ancient-debris → vanilla; osmium/deepslate-osmium → stone/deepslate; arcane_crystal/deepslate-arcane-crystal → stone/deepslate).

**Dimensions**: `undergarden:undergarden`, `deeperdarker:otherside`, `minecraft:the_nether`.

### G.3 Tier 4 stage

**Mod blanket gates**: `rftoolsdim`, `mahoutsukai`, `rsinfinitybooster`, `enderchests`, `enderstorage`.

**Items** (~40 entries):
- Vanilla T4: `netherite_ingot`, netherite armor + tools.
- End / Chorus chain: `purpur_block`, `purpur_pillar`, `purpur_slab`, `purpur_stairs`, `chorus_fruit`, `popped_chorus_fruit`, `chorus_flower`, `chorus_plant`.
- 17 Shulker Box variants + `shulker_shell`.
- Botania T4: `gaia_ingot`, `gaia_block`.
- End Portal Recipe T4: `endportalrecipe:portal_catalyst`.
- Apotheosis T4: `augmenting_table`, `sigil_of_enhancement`, `sigil_of_unnaming`.
- Aethersteel T4 (15+ items): `aethersteel_ingot`, `aethersteel_block`, `aethersteel_nugget`, `aethersteel_scrap`, `aether_debris`, full tool set (sword/pick/axe/shovel/hoe/shears/knife), 4-piece armor, `aethersteel_upgrade_smithing_template`.
- rpgseteffects awakening: 14 awakening artifacts.
- Mekanism T4 specific (11 items): `digital_miner`, `fusion_reactor_controller`, 4 MekaSuit pieces, `meka_tool`, 4 QIO pieces, `ultimate_control_circuit`, `antiprotonic_nucleosynthesizer`, `atomic_alloy`.
- art_of_forging T4 (audit Phase 2.3): `demonic_axe`, `demonic_blade`, `demonic_flail`, `enigmatic_construct`.
- cataclysm T4 (audit Phase 8.4): `mechanical_fusion_anvil`.

**Ore replacements**: `aethersteel:aether_debris` and `aethersteel:aetherslate` replaced with `aether:holystone` until T4.

**Dimensions**: `deep_aether:the_aether`, `minecraft:the_end`, plus 5 Ad Astra planets (`ad_astra:moon`, `ad_astra:mars`, `ad_astra:mercury`, `ad_astra:venus`, `ad_astra:glacio`).

### G.4 Intentionally NOT mod-gated

Per `astages_restrictions.js` line 187:
- `occultism` — has passive items (Demon's Dream essence, otherworld saplings) that fit early game; gated per-item instead.
- `forbidden_arcanus` — same rationale (Aureal bottles, edelwood); gated per-item.

---

## H. Datapack Override Index

Validated by `tools/validate_datapack_references.sh`. Each entry is a Paxi datapack zip in `config/paxi/datapacks/` referenced from `config/paxi/datapack_load_order.json`.

| Datapack | Purpose | Audit context |
|----------|---------|---------------|
| `icraft_aethersteel_overrides` | T4 Aethersteel chain ore replacement (aether_debris, aetherslate) | T4 metal chain |
| `icraft_apotheosis_affixes` | Custom Apotheosis affix definitions | 84 JSON affixes ship here |
| `icraft_botania_overrides` | Orechid weight overrides — diamond/deepslate-diamond/ancient-debris/osmium/deepslate-osmium set to 0 | Tier-skip prevention |
| `icraft_dungeon_crawl_overrides` | Dungeon Crawl tier alignment | Loot tier consistency |
| `icraft_loot_overrides` | Global loot table overrides | Misc loot tuning |
| `icraft_occultism_overrides` | **Audit Phase 1 (2026-04-27).** 8 miner-recipe overrides: diamond/emerald/arcane_crystal/osmium/nether_quartz/nether_gold/xpetrified_ore restricted from `ores` tag (any miner) to `deeps` tag (T3+ Afrit/Marid). dimensional_shard_ore restricted to `master` (T4 Marid only). | P0 fix |
| `icraft_progdiff_overrides` | Progressive Difficulty tuning | Difficulty consistency |
| `icraft_skills` | Pufferfish's Skills tree definitions | 6 skill trees |
| `icraft_terramity_overrides` | Terramity gem ore biome injection (sapphire/topaz/iridium/gaianite into Aether/Twilight/BS) | T2 ore distribution |
| `icraft_tetra_materials` | 27 modded metals + 5 gems for Tetra integration (cataclysm/blue_skies/abyss/F&A metals) | T2-T4 Tetra entries |
| `icraft_tetra_overrides` | Tetra material stat tweaks | Balance |
| `icraft_tower_overrides` | Towers of the Wild spawn frequency | Worldgen tuning |
| `icraft_worldgen_overrides` | Vanilla iron/copper + modded zinc/nickel/silver/lead distribution | Worldgen base |

Plus 3rd-party datapacks loaded via Paxi without modification: `ScalingHealth_NoCrystalDrops_AllVanilla`, `Towers_Of_The_Wild_Reworked` + `_v4.2.1_Waystone`, `fix_stone_tags`, `infinity_ham_blocker`, `keepinventory_datapack`.

---

## I. KubeJS Script Index

One-line summary per file in `kubejs/server_scripts/` and `kubejs/startup_scripts/`. ~70 active scripts.

### I.1 Top-level `server_scripts/`

| Script | Role |
|--------|------|
| `0_tick_master.js` | Server-tick master; named `0_` to load first; provides global tick handlers other scripts subscribe to |
| `cap_player_knockback.js` | Caps knockback received by players (LivingKnockBackEvent strength + ratio normalization) |
| `cap_player_levitation.js` | Cancels Levitation effect amp > 5 on Players (defense-in-depth against skyward-launch sources beyond the disabled Apotheosis Shulkers affix) |
| `cherry_spawn_biome.js` | Cherry biome spawn override |
| `codex_delivery.js` | First-join codex book + spell scrolls + starter spell-book delivery (NBT-baked) |
| `death_penalty.js` | Inventory-kept death model + scaled durability damage + items-go-inert-not-broken |
| `diag_empty_display_name.js` / `diag_player_velocity.js` / `diag_player_launch.js` | Diagnostic logging for tester reports. `diag_player_launch.js` is the third-layer launch monitor (MobEffectEvent.Added handler + 4Hz per-tick player Y-velocity scan with effect-list snapshot) — caught the Apotheosis Shulkers Levitation-amp-50 launch (see known-issues tracker 2026-05-04). |
| `disable_zombie_door_break.js` | Suppresses zombie door breaking |
| `dump_items.js` | One-shot JEI item dump for audit purposes (logs to kubejs-server.log with `[ITEM_DUMP]` prefix) |
| `enemyexpansion_explosive_launch_blocker.js` | Suppresses Enemy Expansion explosive launch behavior |
| `fix_empty_display_name.js` | Auto-fix for items with empty display names |
| `icraft_despawn_command.js` | `/icraft_despawn` admin command |
| `icraftsets_command.js` | `/icraftsets` admin command — opens rpgseteffects Set Equipment Screen (backup for broken inventory button) |
| `magic_crit_hook.js` | ISS magic-crit attribute trigger mechanic |
| `mobgriefing_default.js` | Sets mobGriefing=false default for new worlds |
| `more_curios_slots_cap.js` | Caps additional curio slots |
| `mutant_monsters_no_grief.js` / `mutant_monsters_no_griefing.js` | BlockEvents.broken cancellation for mutantmonsters: namespace (mutant zombie pillar-up + mutant creeper explosion bypass mobGriefing) |
| `player_t1_damage_softener.js` | T1-tier damage softener (early-game survival) |
| `spawn_protection.js` | Spawn-area protection enforcement |
| `sunlight_smite.js` | Sunlight damage to specific mobs (vampire-themed ?) |
| `tatos_dimension_lock.js` | Dimension entry lock helper (per-dimension stage check) |
| `tetra_terramity_perks.js` | Server-tick perk hook for Tetra-Terramity integration |
| `validate_recipe_removals.js` | **Audit Phase 3.3.** Server-start validator: scans REMOVAL_TARGETS list against the live item registry; logs warnings for stale IDs |
| `villager_trades.js.disabled` | Villager trade rework (currently disabled — incorporated elsewhere) |

### I.2 `gates/`

| Script | Role |
|--------|------|
| `astages_restrictions.js` | Authoritative stage definitions: stageMod / stageItems / stageDimension / stageOre per tier |
| `milestone_detection.js` | Per-player T2/T3/T4 boss-kill counter; auto-grants tier flag at threshold |
| `dimension_gates.js.disabled` / `item_gates.js.disabled` | Older AStages-direct integrations; superseded |

### I.3 `recipes/`

| Script | Role |
|--------|------|
| `recipe_audit.js` | Cross-mod tier-skip blocks (Sections A-N): create:mixing, ars:imbuement, mek:enriching/combining/purifying/injecting, F&A clibano, terramity guns/armor, mek tools, theabyss rings + abyss boss armor *(Section K dead-code — mod not in pack)*, BS dusk_arc / shadow / runic_arc, BS Diopside/Charoite/Horizonite material strip, mech_fusion_anvil. ~67 removals |
| `tier_gated_recipes.js` | Re-recipe overrides for tier-gated workstations (Hephaestus Forge T3, Meka-Tool T4, RFTools dim builders T4, etc.) + Section E Simply Swords removal list (43 entries post-audit-Phase-3.1) |
| `tier_skip.js` | Cross-tier transmutation recipes (the "bend" mechanism) + Rift Keystone recipe + cross-mod dual-paths |
| `ad_astra_gating.js` | Ad Astra rocket progression (4-tier) + NASA Workbench T4-gate + 4 MekaSuit Mk2 piece recipes at Mythic Forge |
| `cooking_conversion.js` | 70 vanilla-recipe → Farmer's Delight cooking conversion |
| `if_latex_rework.js` | HDPE / IF latex alternative pipeline |
| `planetary_extraction.js` | Create Crushing Wheel recipes for planet stones → unique elements |
| `refined_storage_dualpath.js` | Tech-path / Magic-path RS recipes + hybrid bonus |
| `waystone_recipes.js` | Boss-drop-gated Waystone crafting at all tiers |

### I.4 `loot/`

| Script | Role |
|--------|------|
| `lootjs_overhaul.js` | Primary loot orchestrator (~2200 lines): 4 chest pools (T1/T2/T3/T4) + structure-loot tuning + village artifact whitelist + Ars glyph injection + 30+ structure mod loot tuning |
| `loot_overhaul.js` | T2 boss group: TF + BS + Aether bosses with ISS reagent + Simply Swords allocation (Section 8 master list) |
| `iss_boss_drops.js` | ISS bosses themed drops (5 bosses + ISS mob types) |
| `iss_boss_first_kill.js` | First-kill guaranteed ISS drops via persistentData |
| `cataclysm_boss_drops.js` | 8 Cataclysm bosses with ISS reagents + Simply Swords drops |
| `twilight_boss_drops.js` | 8 Twilight bosses with ISS reagents + Simply Swords drops |
| `blue_skies_drops.js` | 4 BS bosses + Runic Arc allocation @ 5% |
| `alexsmobs_drops.js` | 21 Alex's Mobs entities (with mimicream nerf 1%) |
| `stalwart_dungeons_drops.js` | 7 nether mini-bosses with T3 ISS magic synergy |
| `mahou_synergy_drops.js` | 14 cross-mod Mahou reagent injections |
| `dimensional_boss_drops.js` | 11 cross-dimensional bosses (Aether, Deep Aether, Undergarden, Mutant Monsters, Warden) |
| `terramity_boss_drops.js` | **Audit Phase 4.1.** 7 non-gun terramity EPIC weapons allocated to themed bosses |
| `abyss_boss_loot.js` | 7 custom replacement rings (4 chest + 3 boss) + 5 boss-drop armor sets |
| `crop_seed_reduction.js` | Crop seed drop reduction (anti-spam) |
| `planetary_loot.js` | Ad Astra planetary chest loot tuning |
| `diagnose_mob_drops.js` | Diagnostic helper for tester reports |
| `loot_discovery.js.disabled` | Older loot pipeline; superseded |

### I.5 `scaling/`

| Script | Role |
|--------|------|
| `mob_scaling_unified.js` | Dimension-keyed HP/damage multipliers (Champion-rate logic was Champions Unofficial-dependent; verify whether the script still references that mod's API or has been refactored — see #47) |
| `boss_hp.js` | Per-boss HP base values (table in Section D.6) |
| `boss_progressive.js` | Per-kill boss buffing (Progressive Bosses supplement) |
| `dimension_mechanics.js` | Per-dimension scripted mechanics (Aether thin-air, Otherside corruption/Abyss-themed mechanics, End multi-zone, Ad Astra atmospheric) |
| `mob_equipment.js` | Improved Mobs equipment-spawn handler with iron-tier cap |
| `dimension_scaling.js.disabled` / `mob_tier_hp.js.disabled` | Older systems; superseded |

### I.6 `endgame/`

| Script | Role |
|--------|------|
| `rift_mechanics.js` | T4 boss Rift material drops (12 bosses) + End mob drops + persistentData tracking + Compendium milestones |
| `mythic_forge.js` | Mythic Forge crafting station + 5 Mythic Catalysts + Reforge Token + 4 unique-item recipes (Voidheart/Aegis/Boots/Crown) |
| `ascension.js` | 5-level prestige cycle + mob scaling + persistentData tracking |

### I.7 `attributes/`

| Script | Role |
|--------|------|
| `attribute_commands.js` | `/icraft_attr` admin command |
| `attribute_sync.js` | Cross-system attribute synchronization |
| `class_attribute_bonuses.js` | Per-class stat baseline application |
| `mana_pool_bonuses.js` | ISS mana_pool integration |

### I.8 `origins/`

| Script | Role |
|--------|------|
| `origin_effects.js` | Per-origin effect handlers |
| `class_passives.js` | Per-class passive ability hooks |
| `magic_class_starter.js` | NBT-baked starter spell scrolls for Mage classes |
| `battlemage_mana_shield.js` | Battlemage mana-shield mechanic |
| `phantom_undeath.js` | Phantom origin's revive mechanic |
| `artificial_construct_progression.js` | Artificial Construct origin progression |
| `witch_of_ink_progression.js` | Witch of Ink origin progression |
| `witherborn_slimebodied.js` | Witherborn + Slimebodied custom origins |

### I.9 `class/`, `respec/`, `skills/`, `enchantments/`, `affixes/`, `food/`, `items/`, `pregen/`, `tags/`, `compat/`, `migrations/`, `abyss/`, `end/`

| Script | Role |
|--------|------|
| `class/equipment_hp_halving.js` | Class HP-halving when wearing wrong equipment type |
| `respec/class_respec.js` | `/icraft_respec` command — Class layer only (Origin/Race permanent) |
| `skills/skill_effects.js` | Pufferfish skill effect handlers + JustLevelingFork bridge |
| `skills/justleveling_skills.js` | Magic skill tree integration |
| `enchantments/enchant_effects.js` | 24 custom enchantment effect handlers |
| `affixes/affix_effects.js` | 65 event-driven Apotheosis affix handlers |
| `food/hunger_management.js` | Hunger Overhaul integration |
| `items/compass_of_return.js` | Compass-of-Return item behavior |
| `pregen/auto_chunky.js` | Chunky pre-generation automation |
| `tags/transmuted_tags.js` | Tag-based recipe alternatives |
| `compat/class_artifacts_recipes.js` | rpgseteffects drops-only recipe strip |
| `compat/disable_creeperlings.js` | Suppresses creeperling spawning |
| `migrations/rift_shard_rename.js` | **Audit Phase 2.2.** PlayerEvents.loggedIn migration: kubejs:rift_shard → kubejs:icraft_rift_shard for inventory + Ender Chest |
| `abyss/abyss_armor_effects.js` | 7 elemental abyss armor set bonuses |
| `abyss/abyss_ring_effects.js` | Custom abyss ring effect handlers |
| `end/dragon_exploration_gate.js` | End multi-zone scaling + 9 advancement overrides |

### I.10 `startup_scripts/`

| Script | Role |
|--------|------|
| `custom_items.js` | ~50 kubejs:* item registrations (progression tokens, boss materials, intermediate alloys, custom Abyss-themed rings — see E.7) |
| `endgame_items.js` | ~30 endgame kubejs:* registrations (rift_shard, void_fragment, primordial_essence, mythic_forge, mythic_catalysts, MekaSuit Mk2 4-piece, planetary materials) |
| `custom_enchantments.js` | 24 custom enchantment registrations |
| `iridescent_codex.js` | Patchouli codex setup helpers |

### I.11 Counts

- **~70 active server scripts** across all subdirectories.
- **5 startup scripts** (custom_items, endgame_items, custom_enchantments, iridescent_codex, example).
- **~12 disabled scripts** preserved for reference (`*.disabled`).
- **1 migration script** (rift_shard_rename, audit Phase 2.2).
- **2 validator scripts**: `validate_recipe_removals.js` (server-side) + `tools/validate_datapack_references.sh` (dev-time, outside server_scripts).

---

## K. Character Build Reference

Full numerical content for the character system (Origin / Race / Class / Skills). Companion to [`master.md` Part VI](master.md#part-vi--player-character).

### K.1 Class HP + equipment scaling

| Class | Archetype | HP modifier | Equipment HP | Damage modifier | Notes |
|-------|-----------|------------:|:------------:|:---------------:|-------|
| Berserker | Melee DPS | -5% | Normal | — | Life-steal sustain |
| Samurai | Melee/Ranged Hybrid | +5% | Normal | — | Way of the Blade synergy (crit + ranged precision) |
| Battlemage | Melee/Magic Hybrid | +5% | Normal | — | Arcane Infusion (melee + spells) |
| Wanderer | Hybrid Multiclass | +5% | Normal | — | Broad-bonus generalist |
| Paladin | Tank/Support/Healer | +10% | Normal | — | Holy Aura + Lay on Hands |
| **Vanguard** | Pure Tank | +20% | Normal | **-15% all damage** | Pure damage-soak role |
| **Ranger** | Ranged DPS | -20% | Half | — | Glass cannon |
| **Archmage** | Offensive Caster | -20% | Half | — | Glass cannon |
| Artificer | Crafter / Non-combat | 0% | Normal | — | Crafting + machine specialist |
| **Void Summoner** | Summoner / Necromancer | -10% | Half | — | Glass-cannon-ish; minions tank |

#### Half-equipment-HP explanation

Ranger, Archmage, and Void Summoner receive **50% effectiveness** from all equipment-sourced max HP bonuses:
- Vitality enchantment (half HP per level)
- Max HP affixes (Hearty, Vigorous, Vital — half value)
- Curio HP bonuses (half value)
- Armor attribute modifiers granting HP (half value)

Vanilla armor base values + JustLevelingFork level-up HP + Spice of Life HP + race traits are *unaffected* by the halving — only equipment-sourced bonuses are halved.

#### HP-modifier stacking order

1. Class HP modifier applies first (multiplicative on base 20 HP).
2. Race traits stack additively.
3. JustLevelingFork level-up HP additive.
4. Spice of Life food HP additive.
5. Equipment HP halving applied AFTER enchantments/affixes calculate their HP bonus (so the halving is on the post-enchant total).

### K.2 Class passives reference

Each class is defined by 3-5 Origins powers (in `iridescent-origins-mod/.../powers/class/<name>/`) plus tick-based logic in `kubejs/server_scripts/origins/class_passives.js`. The table below lists every active passive per class with its canonical numbers (matched to the wiki overview at `wiki/classes/overview.md`). The "weapon affinities" approximation that lived here previously was misleading — most classes have stat-based, not weapon-type-based, identities.

| Class | Key passives | Tradeoffs |
|-------|-------------|-----------|
| **Berserker** | +15% base melee (Brutal Strikes), Battle Trance (+5% ATK / +1 armor after 10s combat), Thick Skinned (+10% armor), Blood Fury (+20% melee below 40% HP, +40% below 20%) | −5% max HP |
| **Samurai** | +8% speed, +10% atkspd (Bushido), Focus (3s no-attack → next hit +30% damage / +20% crit, Vorpal I-V scaling by tier via `class_passives.js`) | +5% HP only — the "agility tradeoff" |
| **Battlemage** | +15% melee / +15% magic (Arcane Strikes), +2 armor (Spell Armor), Mana Shield (Resistance I-III scaling with magic bonus), ~1.9× mana pool, **Arcane Cleave** (+1 melee AD per 50% bonus spell power, 10 mana/hit — converts caster damage into hybrid weapon damage) and **Mana Reaver** (+15 mana per melee kill — sustains the cleave loop in multi-mob fights). Handled by `battlemage_mana_shield.js` + `battlemage_arcane_cleave.js`. | +5% HP |
| **Wanderer** | +5% ATK / speed / atkspd (Jack of All Trades), +10% XP (Wanderlust), Seasoned Traveler (+5% XP and +2.5% speed per unique dimension visited, ticks via `class_passives.js`) | +5% HP |
| **Paladin** | +3 armor / +1 toughness (Holy Armor), +10% KB resist, Healing Aura (allies in 8 blocks regen 0.5 HP/5s; self regens 1 HP/5s above 50% HP) | +10% HP — pure support tank |
| **Vanguard** | +6 armor / +3 toughness (Fortress), +40% KB resist (Immovable), Guardian's Presence (Weakness I to mobs in 5 blocks), −15% damage dealt (Pacifist's Burden) | +20% HP — hardest tank in the pack |
| **Ranger** | +15% speed, +10% atkspd (Swift), +20% projectile damage (Eagle Eye), Glass Cannon (−3 armor) | −20% HP, **equipment HP halved** |
| **Archmage** | **+50% magic damage** (Arcane Supremacy), Mana Attunement: **mana pool runs at 2.5× baseline**, standing still for 3s grants +10% spell damage, melee damage reduced 25%, plus tier-scaling magic amp ticked every 10s (**T1: +0%, T2: +5%, T3: +10%, T4: +15%**), Frail Frame (−4 armor / −2 toughness). Mana-on-kill moved to Battlemage (cont. 16) — Archmage stays pure caster offense without a melee feedback loop. | −20% HP, **equipment HP halved** — the back-loaded glass nuke |
| **Artificer** | +15% mining speed all tools (Crafting Mastery), +10% atkspd (Engineer's Efficiency), Resourceful (+10% bonus drops on ore mining, Speed I near crafting tables, +10% machine processing speed planned for Phase 2) | None — non-combat focus |
| **Void Summoner** | +15% tamed/summon damage (Dark Pact), Shadow Cloak (+10% damage in darkness, −10% in bright light), Soul Tether (5% lifesteal from nearby mob deaths within 16 blocks, +10% bonus XP from minion kills), Expanded Mana (~1.9× mana pool) | −10% HP, **equipment HP halved** |

#### Magic-damage attribute sync

`puffish_attributes:magic_damage` is set by Origins powers (Archmage's Arcane Supremacy, Battlemage's Arcane Strikes, Faefolk race, Elf race) but is **not directly read by Iron's Spellbooks or Ars Nouveau**. The bridge in `kubejs/server_scripts/skill_effects.js` detects these classes/races and pushes the bonus to both `ars_nouveau:spell_damage` and `irons_spellbooks:spell_power` so the magic boost actually applies in-game.

#### Mana Attunement tier table (Archmage)

Magic damage bonus from Mana Attunement, applied multiplicatively to all magic damage channels (`puffish_attributes:magic_damage`, `irons_spellbooks:spell_power`, `ars_nouveau:ars_nouveau.perk.spell_damage`):

| Detected tier | Trigger dimension | Bonus |
|:-:|---|:-:|
| T1 | Overworld | +0% |
| T2 | Twilight Forest / Aether / Blue Skies | +5% |
| T3 | Nether | +10% |
| T4 | End / Otherside / Abyss | +15% |

Tier auto-detected by the highest-tier dimension the player has visited (monotonic — once T4 is reached, the bonus persists). Combined with the +25% Arcane Supremacy base + 10% standing-still bonus + race/origin bonuses, peak Archmage burst at T4 multi-stacks well past 50% magic damage.

### K.3 Race tradeoffs

Permanent at character creation. Mild tradeoffs (vs. class's strong tradeoffs).

| Race | Benefits | Drawbacks | Natural pairing |
|------|----------|-----------|-----------------|
| Human | +10% XP gain, neutral villager prices, no environmental weaknesses | None — the "default" race | Anything (versatile) |
| Elf | Night vision, +8% movement, +15% bow accuracy | -10% hunger efficiency, -1 armor toughness | Ranger, Archmage |
| Dwarf | +15% mining speed, +10% armor toughness, 50% fire resistance | -5% movement, -8% jump height | Vanguard, Artificer |
| Orc | +10% melee knockback, +5% attack speed, intimidation aura | +15% hunger drain, -10% villager prices | Berserker |
| Halfling | +20% food efficiency, +10% luck, smaller hitbox (Pehkui) | -10% melee reach, -5% attack damage flat | Wanderer, Ranger |
| Revenant (Undead) | No hunger, night vision, +10% damage in darkness | Sunlight damage (1 HP/5s without helmet), -20% potion healing, +25% Smite damage taken | Void Summoner |
| Faefolk | Slow fall (passive), Nature's Blessing (+30% magic damage, +10% mana regen), Fae Swiftness (+10% speed) | Frail Strikes (-30% melee damage), Ethereal Form (-50% armor toughness on Med/Heavy armor — bypassed by 4/4 light robes), Fae Fragility (-15% max HP) | Archmage (best fit — pure caster, full robes); offmeta Battlemage (Arcane Cleave converts spell power to AD, partly offsetting the melee malus) |
| Demi-God | +40% HP (8 hearts), 2× raw meat healing, strength + phase abilities, fire damage 1.5× | Mild Nether weakness | Berserker, Vanguard, Paladin |
| Ryu | 25% damage reduction, slow fall, draconic food healing, debuff cleanse | Meat preference | Paladin, Vanguard, Wanderer |
| Fallen Angel | +15% all damage, slow fall, velocity dash | -20% HP (4 hearts), meat preference | Ranger, Archmage, Samurai |
| Kirin | +0.1 movement speed, wall climbing, sprint jump, cat vision, speed boost | -20% HP (4 hearts) | Ranger, Wanderer, Samurai |

### K.4 Origin notes

13 origins total. 9 vanilla rebalanced (Avian, Arachnid, Blazeborn, Elytrian, Enderian, Feline, Merling, Phantom, Shulk) + 4 custom. **No Human and no Mundane origins** — those collapse to no-tradeoff defaults that undermine the species-fantasy layer.

#### Custom origins (4)

| Origin | Theme | Progression hook |
|--------|-------|------------------|
| **Witch of Ink** | Pure passive hyperscaler — 50% food reduction, 20% less HP, fire weakness. Paint actives were stripped 2026-03-30 (`58e4834c`); no painting consumption mechanic. | Boss-kill counter (max 200): Apotheosis/Champions bosses +1, dimensional bosses +10. **Per counter:** +0.1% TOTAL damage (multiplicative on final damage via LivingHurtEvent — affects melee, ranged, all magic) + 0.1 armor toughness (ADD_VALUE). Caps at +20% / +20 at counter=200. **Capstone (Blessing of Penthesilea, at 200):** +10% additive total damage (1.30× at cap) + 15% Spell-Power-to-Attack-Damage conversion (`(SP - 1.0) × 0.15` extra MULTIPLY_BASE damage) + 15% max HP + **permanent Haste I, Resistance I, Fire Resistance, Regeneration I** (renewed every 2 min). Player command: `/icraft witch_status`. |
| **Artificial Construct** | Machine-themed tech bias — 25% food efficiency, eats iron ingots/blocks for sustenance (Regen III for 10 s on consume). | 5-level iron-consumed ladder at thresholds 1000 / 2000 / 4000 / 8000 / 16000. **Per-level bonuses** (cumulative MULTIPLY_BASE on max_health + attack_damage; ADD_VALUE × 4 on armor + armor_toughness): +5% (L1) → +10% (L2) → +15% (L3) → +25% (L4) → **+35% (L5)**. **Capstone (Iron Apotheosis, unlocked at L5):** +25% MULTIPLY_BASE HP + +25% MULTIPLY_BASE melee damage + +1.0 ADD_VALUE armor toughness on top of L5 totals. Player command: `/icraft construct_status`. |
| **Witherborn** | Undead aesthetic + Wither immunity | Undead-aligned bonuses; pairs with Void Summoner |
| **Slimebodied** | Slime physics + bouncing combat | Bouncy-mobility + slime-combo identity |

> **Origin design rules.** No lethal effects. Food preferences not restrictions. Elytra flight reserved for Elytrian. Each heart = 5% HP.

### K.5 Skill tree framework

Pufferfish's Skills, six trees, each level-capped at 40, ~180 total nodes across the system.

| Tree | XP source | Per-level points | Level cap |
|------|-----------|:----------------:|:---------:|
| **Warfare** | Melee kills | 1 | 40 |
| **Marksman** | Ranged kills (bow / crossbow / thrown) | 1 | 40 |
| **Sorcery** | Spell casts (ISS, Ars, Mahou) + magic kills | 1 | 40 |
| **Fortitude** | Damage taken (XP scales with damage amount) | 1 | 40 |
| **Gathering** | Mining ore, chopping logs, harvesting crops, fishing | 1 | 40 |
| **Engineering** | Crafting, operating machines, smelting | 1 | 40 |

XP curve per tree: 50 XP for level 1, ~500 XP by level 25, ~2000 XP by level 40.

**Anti-farming.** Pufferfish's Unofficial Additions diminishes XP from repeated identical actions over time (killing the same mob type repeatedly gives progressively less XP per kill). Encourages variety.

#### Tree layout

Each tree uses a branching layout: 8-node Trunk (shared) → 2-way Split → Branch A / Branch B (specialized paths) → Capstone (deep-investment payoff requiring ~12–15 points in that branch).

```
        [Root]
        /    \
    [Stat]  [Stat]
       |      |
    [SPLIT] [SPLIT]
    /    \
[Branch A] [Branch B]
    ...       ...
[Capstone] [Capstone]
```

Players can invest in the Trunk without committing to a Branch. But Branches contain the best returns per point.

### K.6 Per-tree breakdown

#### K.6.1 Warfare (XP: melee kills)

**Trunk (8 nodes, +1 each):** Brute Force I/II (+5% melee dmg each), Iron Grip I/II (+5% attack speed each), Thick Hide I/II (+4% melee resistance each), Vigor I/II (+2 max HP each).
**Trunk total at 8 pts:** +10% melee damage, +10% attack speed, +8% melee resistance, +4 max HP.

**Branch A — Berserker's Path (Sustained DPS).** Focus: raw damage output, attack speed, life-on-hit. Synergizes with Berserker, Samurai, Battlemage. Capstone: ~+15% melee + life steal.

**Branch B — Duelist's Path (Precision).** Focus: critical hits, weapon mastery. Synergizes with Samurai (crit scaling). Capstone: crit chance + crit damage payoff.

#### K.6.2 Marksman (XP: ranged kills)

**Trunk (8 nodes):** ranged damage, draw speed, accuracy, movement speed.
**Trunk total:** +10% ranged damage, +10% draw speed, +6% accuracy, +8% movement speed.

**Branch A — Sniper's Path (Single Target).** Steady Shot stacking, Penetration (resistance shred), Kill Shot (low-HP execution). Capstone: Deadeye (+15% ranged dmg, +8% resistance shred). Branch A total: +47% ranged dmg, +20% shred, +20% bonus to low-HP targets.

**Branch B — Volley Path (AoE / Speed).** Rapid Fire stacking, multi-target, arrow economy. Synergizes with Ranger Rain of Arrows + Void Summoner crossbow.

#### K.6.3 Sorcery (XP: spell casts + magic kills)

**Trunk (8 nodes):** magic damage, mana regen, cast speed, magic resistance.
**Trunk total:** +10% magic damage, +10% mana regen, +6% cast speed, +8% magic resistance.

**Branch A — Destruction Path (Raw Spell Power).** Direct-damage spell scaling. Pairs with Archmage, Battlemage.

**Branch B — Enchanter's Path (Utility Magic / Summoning).** Healing, buffs, summon strength. Pairs with Paladin, Void Summoner.

#### K.6.4 Fortitude (XP: damage taken)

**Trunk (8 nodes):** HP, all-resistance, healing received, knockback resistance.
**Trunk total:** +8 max HP, +8% all resistance, +10% healing received, +30% knockback resistance.

**Branch A — Iron Wall (Tank HP + Armor).** Pure damage-soak progression. Pairs with Vanguard, Paladin.

**Branch B — Survivor's Path (Sustain & Recovery).** Regen, lifesteal-from-defense, comeback mechanics.

#### K.6.5 Gathering (XP: mining, chopping, harvesting, fishing)

**Trunk (8 nodes):** mining speed, breaking speed, crop yield, fortune.
**Trunk total:** +10% mining speed, +10% breaking speed, +10% crop yield, +0.6 fortune.

**Branch A — Prospector's Path (Mining).** Ore yield, ore vein detection, deeper-strata bonuses.

**Branch B — Harvester's Path (Farming & Fishing).** Crop multipliers, fishing rare chances.

#### K.6.6 Engineering (XP: crafting + machines + smelting)

**Trunk (8 nodes):** crafting speed, material save, machine speed, durability.
**Trunk total:** +10% crafting speed, +6% material save, +10% machine speed, -10% durability loss.

**Branch A — Artificer's Path (Crafting Quality).** Higher-rarity crafting, refined output, quality-of-craft bonuses.

**Branch B — Engineer's Path (Machines & Automation).** Machine throughput, RF efficiency, smelting bonuses.

### K.7 Class → tree affinity (recommended)

| Class | Primary tree | Secondary | Tertiary | Reasoning |
|-------|--------------|-----------|----------|-----------|
| Berserker | Warfare (Branch A: Berserker's) | Fortitude (Branch B: Survivor's) | — | Life-steal + sustain = unkillable in sustained fights |
| Samurai | Warfare (Branch B: Duelist's) | Marksman (Branch A: Sniper's) | — | Crit scaling + ranged precision = Way of the Blade synergy |
| Battlemage | Warfare (trunk) | Sorcery (Branch A: Destruction) | — | Moderate melee + strong spells = Arcane Infusion fuel |
| Wanderer | Any trunk × 3–4 | — | — | Generalist wants broad moderate bonuses |
| Paladin | Fortitude (Branch A: Iron Wall) | Sorcery (Branch B: Enchanter's) | — | Tank HP + healing effectiveness = Holy Aura + Lay on Hands |
| Vanguard | Fortitude (Branch A: Iron Wall) | Warfare (trunk) | — | Maximum HP + some melee to offset -15% damage penalty |
| Ranger | Marksman (Branch A: Sniper's) | Gathering (trunk) | — | Max ranged damage + fortune for resource runs |
| Archmage | Sorcery (Branch A: Destruction) | Marksman (trunk) | — | Spell power deep + ranged utility |
| Artificer | Engineering (Branch A: Artificer's) | Gathering (Branch B: Harvester's) | — | Crafting quality + farming/fishing supply |
| Void Summoner | Sorcery (Branch B: Enchanter's) | Fortitude (Branch B: Survivor's) | — | Summoning depth + sustain to keep summons alive |

Wanderer is the only class without a clear primary tree — by design. The class is built for hybrid playstyles, so spreading across 3–4 trunks is the optimal strategy.

### K.8 Respec rules

| Layer | Respec? | Cost | Where |
|-------|---------|------|-------|
| Origin | Permanent | — | — |
| Race | Permanent | — | — |
| Class | Yes | 1 tier-appropriate boss drop + 30 XP levels | Class Altar (custom block) |
| Skill point | Yes (per-point) | 5 XP levels per point refunded | `/puffish_skills skills reset <player> <category>` |

#### Death + skill interactions

- **Skill points are NOT lost on death.** Skills are permanent growth, never at-risk.
- **Skill points are NOT lost on Class respec.** A Berserker with 30 Warfare points who switches to Paladin keeps those points (suboptimal for Paladin but still functional). Respeccing skills is a separate additional cost.

This creates interesting hybrid-build space without forcing a full reset on every class switch.

#### Class Altar mechanics

Custom block via KubeJS. Recipe: tier-appropriate boss material + crafting station. On use: consumes 1 boss drop + 30 levels, opens class selection screen. Can be placed and shared (multiplayer convenience).

### K.9 Reforging progression

Apotheosis-style affix-rerolling, gated by reforging-tier tokens (boss drops).
Workstations themselves are ungated (T1-accessible per 2026-05-14 design call);
the **tokens** are the actual gate.

| Tier | Requirement | Behavior |
|------|-------------|----------|
| **Basic** | T2 progression token | Reroll affixes (random outcome) |
| **Advanced** | T3 token + expensive materials | Reroll with weighted odds toward desired type |
| **Ultimate** | T4 token + Gaia ingots / antimatter | Reroll with guaranteed minimum rarity |

Reroll operations at three Apotheosis workstations (Reforging Table → Advanced
→ Augmenting Table). Tokens drop from tier-appropriate bosses. All three
workstations are crafable from T1.

The **rarity ladder** (D.1) is the second gate — even with tokens, a player in
Overworld can't reroll above Rare, in Twilight/Aether can't reroll above Epic,
etc. So token + dimension form the joint gate; workstation crafting is free.

### K.10 Implementation notes

- **Class definitions** — Origins datapacks (fully customizable).
- **Class attribute modifiers** — via Apothic Attributes.
- **Class active abilities** — Origins power system (cooldown-based keybind).
- **Class weapon affinities** — Origins item-conditional attribute modifiers ("when holding item with tag X").
- **Half-equipment-HP** — overrides max_health attribute contributions from equipment slots with a 0.5 multiplier for affected classes.
- **Race system** — separate Origins layer (Iridescent Origins).
- **Race environmental effects** — Origins conditions.
- **Race size modification** — Pehkui integration where applicable.
- **Class Altar** — KubeJS custom block + script.
- **Skill trees** — Pufferfish's Skills datapack (`icraft_skills`).

---

## L. Iridescent Reforging Honing System

Added 2026-05-14. Two parallel hone systems share the same Tetra workbench
infrastructure; values + paths differ.

### L.1 Wand honing (multi-option)

Each of the 4 wand modules has **3 mutually-exclusive hone paths**. Applying
level 1 of any path locks out the other two paths for that module (via
`tetra:not` requirements on each schematic). 5 levels per path. Total:
4 × 3 × 5 = 60 schematics + 12 improvement files.

| Module | Path A (current) | Path B | Path C |
|--------|------------------|--------|--------|
| handle | cooldown_reduction | spell_power | mana_regen |
| core   | max_mana           | mana_regen | cooldown_reduction |
| cap    | mana_regen         | max_mana   | spell_resist |
| inlay  | spell_power        | crit_chance (Apothic) | crit_damage (Apothic) |

Tool gate per level: L1 gold / L2 iron / L3 thermal:steel / L4 diamond / L5 netherite hammers.

### L.2 Armor honing (archetype-gated, major-slot only)

Honing on armor is restricted to the 4 archetype-coded major slots
(chestplate/chest_plate, helmet/crown, boots/boot_sole, leggings/leg_plate).
Minor slots (linings/pauldrons/trim/etc.) are not honable in v1 — Tetra's
requirement types only test the target module, so cross-slot archetype
gating on minors needs a custom Java requirement (deferred).

Gating via synthetic `tetra:armor/<archetype>_hone/` improvement type declared
on each major-slot module. `tetra:accepts_improvement` requirement on the
hone schematic gates by archetype.

| Archetype | Chestplate | Helmet | Boots | Leggings |
|-----------|------------|--------|-------|----------|
| **Warrior** | Armor (big, +2..+6) | Armor | Armor | Armor |
| **Balanced** | Armor (modest, +1..+5) | Armor | Movement Speed | Armor |
| **Rogue** | Attack Damage | Arrow Damage | Movement Speed | Movement Speed |
| **Mage** | Spell Power | Spell Power | Cooldown Reduction | Max Mana |

5 levels each, same tool gate ladder as wand. Total: 4 × 4 × 5 = 80 schematics + 16 improvement files.

### L.3 Tetra MULTIPLY_BASE display rule

**ISS percent attributes on Tetra modular items MUST use the `**` prefix
(MULTIPLY_TOTAL)**, not `*` (MULTIPLY_BASE). Tetra's `AttributeHelper.collapse()`
math drops MULTIPLY_BASE modifiers to 0 when no ADDITION sibling exists on the
same attribute, silently making those stats invisible on tooltips.

Hard rule: any new module variant or improvement file targeting a percent
attribute (spell_power, mana_regen, cooldown_reduction, cast_time_reduction,
spell_resist, school SP, summon_damage) gets `**` prefix.

Stacking effect: MULTIPLY_TOTAL compounds across modules (vs near-additive
MULTIPLY_BASE). At small per-module values (5-10%) the difference is < 5%;
at high stacks it compounds noticeably. Aligned with the mage glass-cannon
uncapped-multiplicative-stacking design intent.

---

## M. ISS + Ars Nouveau Cross-Mod Integration

Added 2026-05-14, restructured 2026-05-15. Design intent: "mana regen and
mana are universal" — sources that boost one system's mana should affect
the other equivalently.

### M.1 Unified mana pool via ManaCap mixin (replaces the 2026-05-14 bridge)

**Architecture:** Ars's `IManaCap` is mixin-redirected to the ISS pool.
There is one source of truth (ISS) and one visible bar (ISS HUD).

| Ars method | Redirect target |
|------------|-----------------|
| `getCurrentMana()` | `MagicData.getPlayerMagicData(le).getMana()` |
| `getMaxMana()` | `le.getAttributeValue(AttributeRegistry.MAX_MANA.get())` |
| `removeMana(cost)` | `MagicData.setMana(mana - cost / 2.0)` -- **half-cost discount** |
| `addMana(_)` / `setMana(_)` / `setMaxMana(_)` | no-op (ISS owns regen + state) |
| `getGlyphBonus` / `setGlyphBonus` / `getBookTier` / `setBookTier` | unchanged (Ars caster progression metadata) |

**Cost model.** Ars spells deduct half their displayed cost from the ISS
pool. Settled on `/2` after two playtest iterations:
- 2026-05-15 initial: `/3` discount. Felt invisible — small Ars spells barely moved the bar.
- 2026-05-15 v2: 1:1 (no discount). Felt prohibitive — ~50 mana per cast burned the pool in 2-3 casts.
- 2026-05-15 v3 (shipped): `/2`. Middle ground. Ars stays "reliable spammable" relative to ISS's "high-impact" spells while a single cast still visibly dents the bar.

### M.1a Magic class mana-pool boost

`kubejs/server_scripts/attributes/mana_pool_bonuses.js` applies a flat
**MULTIPLY_TOTAL +0.5** (= 1.5× effective) to `irons_spellbooks:max_mana`
for the three magic classes:
- Archmage
- Battlemage
- Void Summoner

Applied via `addTransientModifier` (not `addPermanentModifier`) — the
modifier stays attached for the session but doesn't persist in player
NBT. Reverting the buff is just deleting the script; no UUID-scrub pass
needed. Lesson from the two prior cleanup-after-revert cycles (legacy
`mana_pool_bonuses` 2026-04-25 and `mana_bridge` 2026-05-14).

Cleanup of the legacy 8 UUIDs (4 from the 2026-04-25 layered pool buff +
4 from the 2026-05-14 attribute-mirror bridge) continues running in the
same script until the alpha-tester roster has cycled through.

**HUD.** `ArsGuiManaHudMixin` injects on `GuiManaHUD.shouldDisplayBar` and
returns false unconditionally. The Ars bar would visually duplicate the ISS
bar otherwise (both reading the same pool).

**Mixin location.** `iridescent-tetra-expansion-mod` mixin package
`com.iridescentcraft.reforging.mixin`, classes `ArsManaCapMixin` (common
bus) and `ArsGuiManaHudMixin` (client bus).

**Items granting Ars perk attributes.** All `ars_nouveau:ars_nouveau.perk.*`
references in our codebase were migrated to `irons_spellbooks:*` on
2026-05-15. The Ars perk attributes still exist on the player (Ars registers
them via `EntityAttributeModificationEvent`) but become decorative — nothing
in our codebase grants them, and the cap reads ISS regardless of their
value. `HidePerkTooltips` continues to suppress those attributes on tooltips
if anything else ever applies them.

**Predecessor.** The original 2026-05-14 bridge (`mana_bridge.js`,
1Hz tick mirroring `irons_spellbooks:max_mana` <-> `ars_nouveau.perk.max_mana`
modifiers between the two attributes) was deleted in the 2026-05-15 unified
pool migration. The cap mixin is strictly cleaner: no tick overhead, no
double-counting risk, no MULTIPLY_BASE collapse-to-zero on the Ars side
(which would have happened because the Ars perk attribute has base=0).

### M.2 ISS school SP → Ars elemental damage

Two-handler architecture for boosting Ars elemental glyph damage by the
player's matching ISS school SP attribute.

| Handler | Trigger | Coverage |
|---------|---------|----------|
| `iss_school_to_ars_spell.js` (LivingHurtEvent) | damage_type ∈ {flare, frost, windshear, crush} | Direct Ars elemental damage |
| `iss_school_to_ars_glyph.js` (SpellDamageEvent.Pre) | spell.recipe has fire/water/air/earth school glyph | Other glyphs with spell context (EffectHarm, EffectExplosion, etc.) |

Mapping (both handlers):
- fire → `irons_spellbooks:fire_spell_power`
- water/ice → `irons_spellbooks:ice_spell_power`
- air/lightning → `irons_spellbooks:lightning_spell_power`
- earth/nature → `irons_spellbooks:nature_spell_power`

Anti-double-count: SpellDamageEvent handler skips damage types in the
LivingHurtEvent map. Mutual exclusion.

Residual gap: damage from Ars-spawned entities after spell context drops
(delayed lightning from EffectLightning, on_fire ticks from EffectIgnite)
doesn't carry SpellDamageEvent context. Acknowledged, deferred (would need
NBT-tag-on-cast pattern).

### M.3 ISS Apotheosis gems (buffed values, repurposed spell_resist)

ISS ships 13 Apotheosis-compatible gems under namespace `irons_spellbooks`
(loaded as `data/irons_spellbooks/gems/*.json`). Native values were uniformly
weak (1/3/5/7/10/15% MULTIPLY_TOTAL flat). Override via Paxi datapack
`icraft_iss_gem_buffs`:

| Gem set | Values (Common / Uncommon / Rare / Epic / Mythic / Ancient) |
|---------|-------------------------------------------------------------|
| 8 school SP + summoning | 6-8 / 9-13 / 15-21 / 23-31 / 33-43 / 45-60% |
| cast_time / cooldown | 5-7 / 8-11 / 12-17 / 18-25 / 26-35 / 34-45% |
| **spell_resist (REPURPOSED as generic SP)** | 3-5 / 6-9 / 8-12 / 13-17 / 18-23 / 24-30% |
| intelligent: max_mana | flat 5-14 / 15-29 / 30-49 / 50-79 / 80-119 / 120-180 |
| intelligent: mana_regen | 3-5 / 6-9 / 8-12 / 13-17 / 18-23 / 24-30% (MULTIPLY_BASE) |

All gems have `steps`/`step` ranges per rarity for tier-internal roll variance
(native ISS gems had no variance). spell_resist filename preserved so ISS's
bundled model/texture/lang hooks line up; KubeJS lang override renames display
to "Gem of Arcane Affinity".

### M.4 Tier-gated Sigils of Socketing + elemental Apotheosis gems → school SP

Added 2026-05-18. Two coupled changes that together unlock Apotheosis socketing for caster builds across the tier ladder.

**Tier-gated Sigil of Socketing.** Four sigils, each with a different socket cap:

| Sigil | Item ID | Socket cap | AStages gate | Recipe gate |
|-------|---------|-----------:|--------------|-------------|
| T1 | `icraft:sigil_of_socketing_t1` | 2 | tier_1 (default) | gem_dust + gem_fused_slate + iron_ingot |
| T2 | `icraft:sigil_of_socketing_t2` | 3 | tier_2 | gem_dust + gem_fused_slate + emerald |
| T3 | `icraft:sigil_of_socketing_t3` | 4 | tier_3 | gem_dust + gem_fused_slate + diamond |
| T4 (vanilla) | `apotheosis:sigil_of_socketing` | 5 | tier_4 | gem_dust + gem_fused_slate + amethyst + **echo_shard** (replaces vanilla dragon_breath) |

The vanilla Apotheosis recipe was originally gated by `minecraft:dragon_breath`, requiring an Ender Dragon fight before any socketing was possible. The new gate uses `minecraft:echo_shard` (Ancient City — Deep Dark) so a player can reach socketing in early T4 without engaging the dragon. Recipes yield 3 sigils each (matching vanilla ratio).

**Use mechanic.** Sigil in main hand, gear in off hand, right-click: if current sockets < tier cap, increments by 1 and consumes the sigil; otherwise no-op with chat feedback explaining the cap. Implementation in `kubejs/server_scripts/sigil_socket_handler.js` — direct NBT manipulation at `affix_data.sockets` (CompoundTag API per `apotheosis_gem_repair.js` pattern). The vanilla smithing-table use path still works for the Apotheosis sigil.

**Elemental gems → school spell power.** 11 of Apotheosis's 21 gems have clear elemental flavor and now grant ISS school-specific `*_spell_power` when socketed into a **magic weapon** (wands + staves only — items in the `#icraft:magic_weapon` tag). Datapack overrides at `icraft_loot_overrides/data/apotheosis/gems/*.json`. All 11 carry a bonus on `gem_class.key = "magic_weapon"` (types `["magic_weapon"]`). Canonical sword/trident bonuses on these gems are preserved unchanged — socketing into a sword still gives the canonical effect.

> **Scope note (2026-05-18 evening):** The tag covers *main-hand cast-when-held* items only, NOT off-hand spellbook containers. ISS *spellbooks* (the 32 `irons_spellbooks:*_spell_book` items + iridescent_modular_spells variants) are deliberately excluded — they're curio/off-hand containers, not weapons. The tag holds 26 items: the Tetra-modular `iridescent_reforging:reforged_wand`, the 5 ISS staves (blood/graybeard/ice/pyrium/staff_of_the_nines), Dan's Magic's 5 T1 element staves (`dna:*_staff`), and Simple Staves' 15 wands (6 tier + 9 element). Mahou Tsukai's T4 ritual weapons are deferred — pack them into the tag when their progression is firmed up.

> **The collision problem and how we solved it.** Apotheosis builds a `Map<LootCategory, GemBonus>` per gem via `Collectors.toMap` (two-arg form, which throws on duplicate keys). The map is keyed by **LootCategory** (e.g., `SWORD`, `TRIDENT`, `HEAVY_WEAPON`), not by `gem_class.key`. A gem JSON that adds a second bonus whose `gem_class.types` overlaps with an existing bonus's types fails to deserialize entirely — the gem disappears from the registry, and existing in-world stacks render as "Errored gem" with the fallback lang key `item.apotheosis.gem`.
>
> Our first attempt (2026-05-18 morning) typed 32 spellbooks as `sword` via Apotheosis's `Equipment Type Overrides` config (Path A), then added per-school spell-power bonuses on `gem_class.key = "light_weapon"` (types `["sword","trident"]`) to each elemental gem. This collided for 6 of the 11 gems — earth, inferno, forest, splendor, endersurge, queen — because their canonical bonuses already cover sword or trident:
>
> - earth: `melee_weapon ["sword","trident","heavy_weapon"]` → sharpness enchantment
> - inferno: `light_weapon ["sword","trident"]` → detonation mob_effect
> - forest: `weapon ["heavy_weapon","sword","trident","bow","crossbow"]` → twilight_treasure_goblin
> - splendor: `weapon_or_tool ["sword","trident","bow","crossbow","heavy_weapon","shovel","pickaxe"]` → xp_gained attribute
> - endersurge: `anything [all 12 categories]` → global enchantment
> - queen: `ranged_weapon ["bow","crossbow","trident"]` → frosted mob_effect (trident collision only)
>
> The Path B fix (2026-05-18 afternoon) replaced Path A wholesale:
>
> 1. A new `LootCategory.magic_weapon` is registered at runtime by `kubejs/startup_scripts/magic_weapon_category.js` via `LootCategory.register(null, "magic_weapon", predicate, [MAINHAND, OFFHAND])`. The predicate checks `ItemStack.is(TagKey<Item>(icraft:magic_weapon))`. `LootCategory.BY_ID` is `Collections.unmodifiableMap(BY_ID_INTERNAL)` per the jar's static init, so late additions via `register()` are visible to Apotheosis's gem-JSON codec at datapack-reload time (verified by bytecode inspection on Apotheosis-1.20.1-7.4.8.jar).
> 2. The `#icraft:magic_weapon` item tag (`kubejs/data/icraft/tags/items/magic_weapon.json`) lists the 32 spellbook IDs that were previously aliased as `sword`. Tag membership controls LootCategory membership.
> 3. All 11 gem overrides use `gem_class: { key: "magic_weapon", types: ["magic_weapon"] }` for the spell-power bonus. No collision because no canonical gem references `magic_weapon`.
> 4. The 4 multi_attribute merges (solar / lunar / guardian / blood_lord) were reverted to the canonical single-attribute form on `light_weapon`. Spell power lives on the new `magic_weapon` bonus instead.
> 5. The 31 `|sword` lines in `config/apotheosis/adventure.cfg`'s `Equipment Type Overrides` were removed (spellbooks no longer need to be typed as swords).
> 6. Lang entries `text.apotheosis.category.magic_weapon` / `.plural` added in `kubejs/assets/apotheosis/lang/en_us.json`.

| Gem | Subdir | School | Attribute |
|-----|--------|--------|-----------|
| solar | core | Fire | `irons_spellbooks:fire_spell_power` |
| inferno | the_nether | Fire | `irons_spellbooks:fire_spell_power` (rarer source, Nether-locked) |
| lightning | core | Lightning | `irons_spellbooks:lightning_spell_power` |
| lunar | core | Ice | `irons_spellbooks:ice_spell_power` |
| blood_lord | the_nether | Blood | `irons_spellbooks:blood_spell_power` |
| endersurge | the_end | Ender | `irons_spellbooks:ender_spell_power` |
| earth | overworld | Nature | `irons_spellbooks:nature_spell_power` |
| forest | twilight | Nature | `irons_spellbooks:nature_spell_power` (Twilight-locked) |
| tyrannical | core | Eldritch | `irons_spellbooks:eldritch_spell_power` (moved from Guardian 2026-05-19 — tyranny + cosmic dread is a closer fit) |
| guardian | core | (no school) | Mystic-Ward-flavor magic damage reduction on chestplate (2.5-10% across rarities; non-stacking via `unique:true` + chestplate-only slot) |
| splendor | core | Holy | `irons_spellbooks:holy_spell_power` |
| queen | twilight | Evocation | `irons_spellbooks:evocation_spell_power` |

Bonus scaling (MULTIPLY_TOTAL):

| Rarity | Spell power bonus | ISS school gem (universal) at same rarity | Ratio |
|--------|-------------------|-------------------------------------------|-------|
| Common | +15% | 6-8% | ~2x |
| Uncommon | +25% | 9-13% | ~2.2x |
| Rare | +40% | 15-21% | ~2.2x |
| Epic | +60% | 23-31% | ~2.2x |
| Mythic | +90% | 33-43% | ~2.3x |
| Ancient | +130% | 45-60% | ~2.4x |

The ratio is intentional: ISS school gems are universal (work for any school the player casts), Apotheosis elemental gems are specialized (lock to one school). Specialized = stronger per gem; universal = more flexible per gem. 2026-05-18 bump (commit pending) shifted the curve up — initial 5%/10%/.../80% collided with ISS values at low rarities, defeating the specialization gradient.

Existing gem bonuses (e.g., Solar's `fire_damage`, `gravity`, `step_height`) are preserved unchanged from the canonical Apotheosis data. The spell-power bonus is purely **additive** on a new `magic_weapon` LootCategory — socketing one of these gems into a sword gives the canonical bonus; socketing into a spellbook gives the spell-power bonus. Martial-only gems (ballast, brawlers, breach, combatant, samurai, slipstream, tyrannical, warlord, royalty) are untouched. Mageslayer skipped per design (anti-magic flavor — opposite direction).

**`magic_weapon` LootCategory (Path B, 2026-05-18 afternoon).** Registered at runtime by `kubejs/startup_scripts/magic_weapon_category.js`. Membership: items in the `#icraft:magic_weapon` item tag. Slots: MAINHAND + OFFHAND. The startup script is idempotent (re-running no-ops via `LootCategory.byId('magic_weapon') != null` guard).

Items in `#icraft:magic_weapon` (26 total, wands + staves only — corrected 2026-05-18 evening; the earlier 32-spellbook list was off-design):

- `iridescent_reforging:reforged_wand` — Tetra-modular wand (core/cap/handle/inlay slots, see §L.1)
- ISS staves (5): `irons_spellbooks:blood_staff` / `graybeard_staff` / `ice_staff` / `pyrium_staff` / `staff_of_the_nines`
- Dan's Magic T1 staves (5): `dna:ice_staff` / `lightning_staff` / `magma_staff` / `toxic_staff` / `tnt_staff`
- Simple Staves tier wands (6): `simple_staves:woodenwand` / `stone_wand` / `iron_wand` / `gold_wand` / `diamond_wand` / `netherite_wand`
- Simple Staves element wands (9): `flame_wand` / `wind_essence_wand` / `thunder_wand` / `venomite_wand` / `viritium_wand` / `veil_wand` / `void_wand` / `tenebrium_wand` / `explosion_wand`

ISS *spellbooks* (off-hand curio containers, distinct from staves) are deliberately excluded — they hold spells but aren't main-hand cast weapons. Ars Nouveau spell books excluded too (uses Source/perk system, not ISS spell_power). Mahou Tsukai T4 ritual weapons deferred. Extending the tag for new items (e.g., Forbidden Arcanus arcane wands) is a single-line edit to the tag JSON; no other plumbing.

**Path A → Path B switch rationale.** Path A (TYPE_OVERRIDES alias to `sword`) was originally chosen for lowest engineering cost, but it (a) couldn't differentiate spellbooks from swords in gem design, and (b) collided when we tried to add per-school spell-power bonuses on the `light_weapon` key for 6 of the 11 gems. The Path B fix (a tiny KubeJS startup script + an item tag + one lang file) eliminates both problems. Future gem additions get a dedicated mage slot with zero collision risk.

---

## J. Bytecode Patches

Public-safe summary. Full re-apply checklist lives in [`wiki/protocols/8-client-sync.md`](../protocols/8-client-sync.md). Deeper technical detail (the actual bytecode delta) lives in the private internal repo.

Two custom-bundled JARs ship with bytecode-level modifications:

| JAR | Patch | Purpose | Required JVM arg |
|-----|-------|---------|------------------|
| `Patchouli-1.20.1-85-FORGE.jar` | `athrow → pop` in `Book.class` | Disables resource-pack enforcement on the codex book (we ship our own resource-pack-independent codex) | `-noverify` |
| `ars_nouveau-1.20.1-4.12.7-all.jar` | `doApply → immediate return` in `DungeonLootEnhancerModifier.class` | Disables Ars Nouveau's automatic chest-loot injection (would override our curated chest pools) | `-noverify` |

Both patches create dead code paths the JVM verifier rejects, so `-noverify` is **required** on both server and client.

- **Server**: already in `iridescentserver.bat` JVM args.
- **Client**: must be added manually in PrismLauncher → Instance → Settings → Java → JVM arguments → `-noverify`.

Per CLAUDE.md "Custom Bundled JARs" + the protocol checklist, when updating either jar via packwiz/Modrinth/CurseForge, the patches must be re-applied to the new version. Reviewers must check before merging mod updates touching these jars.

## N. Marquee Structures

The marquee-structure roster + per-structure themed pool definitions, paired with the canonical four-pool dimensional baseline in [master.md Part XIII §The four chest pools](master.md#part-xiii--loot-economy). Added 2026-05-17.

### N.1 Roster

14 marquee structures across the four tiers. Each receives a themed pool calibrated at ~70% of the tier's combined rate, **layered on top of** the dimensional baseline (which fires at full tier rate everywhere including marquees). Combined per-chest artifact rate at marquees is therefore ~1.7× the tier rate (~17% T1, ~20% T2, ~24% T3, ~27% T4); generic chests remain at the tier rate (~10/12/14/16%).

Implementation note: LootJS 2.13.1's filter API supports `anyDimension`/`anyStructure`/`anyBiome` but not loot-table-based exclusion, so the strict "reduce dimensional at marquees only" model isn't cleanly achievable without per-marquee structure-ID mapping for every mod. The layered-on-top model is the pragmatic alternative — it also rewards intentional exploration with both more frequent AND more thematic drops, which fits the player-intentional design criterion.

| Tier | Marquee structure | Theme | Loot table ID(s) |
|------|-------------------|-------|------------------|
| T1 | Apotheosis tome_tower | Magic | `apotheosis:chests/tome_tower` |
| T1 | TotW Reworked tower | Magic | `totw_reworked:tower_chest` |
| T1 | TotW Reworked ocean tower | Magic | `totw_reworked:ocean_tower_chest` |
| T1 | Structory towers | Generic exploration | `structory_towers:.*chests.*` (regex) |
| T1 | Aquatic ruins | Aquatic | `minecraft:chests/buried_treasure`, `minecraft:chests/underwater_ruin_big`, `minecraft:chests/underwater_ruin_small` |
| T1 | Woodland Mansion | Illager / dark | `minecraft:chests/woodland_mansion` |
| T1 | Stronghold | Ancient / eldritch | `minecraft:chests/stronghold_corridor`, `minecraft:chests/stronghold_crossing`, `minecraft:chests/stronghold_library` |
| T2 | Twilight Lich Tower | Eldritch | `twilightforest:structures/lichtower/*` (TBD exact IDs) |
| T2 | Aether dungeons | Sky / cloud | aether boss-dungeon tables (TBD exact IDs) |
| T2 | Blue Skies dungeons | Elemental | blue_skies dungeon tables (TBD exact IDs) |
| T3 | Nether Fortress | Fire / blaze | `minecraft:chests/nether_bridge` |
| T3 | Bastion Remnant | Piglin / gold | `minecraft:chests/bastion_treasure`, `minecraft:chests/bastion_hoglin_stable`, `minecraft:chests/bastion_bridge`, `minecraft:chests/bastion_other` |
| T3 | Undergarden ruins | Underdark | undergarden ruin tables (TBD exact IDs) |
| T4 | End City | End / levitation | `minecraft:chests/end_city_treasure` |
| T4 | Ancient City | Sculk / echo | `minecraft:chests/ancient_city`, `minecraft:chests/ancient_city_ice_box` |

### N.2 Theme catalog

| Theme | Identity | Sourced from |
|-------|----------|--------------|
| Magic | Mystic / arcane items, scrolls, source materials | Ars Nouveau, ISS scrolls/spell books (capped), magic-flavored curios |
| Generic exploration | Utility / movement gear for tower climbing | Movement boots, magnets, timepieces, traveler gear |
| Aquatic | Underwater traversal + monument lore | Snorkel / flippers / aqua_walker family, sea-themed, anti-drowned |
| Illager / dark | Trickster / hidden + anti-illager | Invisibility, antidote, panic, mirror items, dark-flavored |
| Ancient / eldritch | Old-knowledge + library + end-portal-adjacent | Books, scrolls, time / repentance mirrors, ancient curios |
| Eldritch (T2 Lich) | Death / wraith / corruption + Twilight Forest | Cursed talismans, spectral / decay amulets, midnight robe |
| Sky / cloud | Flight / jump + Aether lore | Helium flamingo, jump boots, sky / moa / phyg-flavored |
| Elemental | Blue Skies fire / ice / lightning duality | Element-typed rings, elemental shields, ele-stones |
| Fire / blaze | Fire immunity + blaze materials | Obsidian skull, fire gauntlet, blazing flask, fire stone |
| Piglin / gold | Gold-flavored | Gold headgear / ring, treasure hunter, precious bracelets |
| Underdark | Mushroom / cave / Undergarden | Ancient ruin curios, fungal / cave-themed |
| End / levitation | End-themed + flight | Ender curios, dragon items, levitation |
| Sculk / echo | Sculk + Ancient City stealth lore | Sculk lens / shades / treads, echo glove, silent-walking |
<!-- Abyssal theme row removed 2026-05-28 (#47): consumer was the absent The Abyss marquees row at N.1; original entry was "Abyssal | Abyss-tier dark / corruption | Chorus inhibitor, twisted heart, abyss core, cursed totems". If a future operator pass reassigns the 14-item curated pool (see T4 Abyssal item list below) to a different T4 structure, restore this row retargeted there. -->

### N.3 Per-structure themed pools (T1)

**T1 Magic** — used by `tome_tower`, `totw_reworked:tower_chest`, `totw_reworked:ocean_tower_chest` (15 items, ~7% combined):

```
ars_nouveau:source_gem                 ars_nouveau:novice_spell_book
irons_spellbooks:common_ink            irons_spellbooks:scroll (uncapped, T1 quality)
irons_spellbooks:copper_spell_book (CAPPED @ 2%)
artifacts:flame_pendant                artifacts:shock_pendant
artifacts:thorn_pendant                artifacts:scarf_of_invisibility
moreartifacts:purification_charm       moreartifacts:bezoar
celestial_artifacts:traveler_scroll    celestial_artifacts:sakura_hairpin
relics:magic_mirror                    relics:reflection_necklace
```

**T1 Generic exploration** — used by Structory towers (15 items):

```
artifacts:bunny_hoppers                artifacts:running_shoes
artifacts:helium_flamingo              artifacts:universal_attractor
artifacts:digging_claws                artifacts:rooted_boots
artifacts:steadfast_spikes             moreartifacts:fast_clock
moreartifacts:high_jumpers             moreartifacts:leather_treads
celestial_artifacts:gallop_necklace    relics:roller_skates
relics:leather_belt                    relics:horse_flute
relics:amphibian_boot
```

**T1 Aquatic** — used by buried_treasure + underwater_ruin tables (12 items + 2% ISS cap):

```
artifacts:snorkel                      artifacts:flippers
artifacts:aqua_dashers                 artifacts:rooted_boots
relics:aqua_walker                     relics:amphibian_boot
relics:drowned_belt                    relics:jellyfish_necklace
relics:spore_sack
celestial_artifacts:treasure_hunter_necklace
moreartifacts:ankh_charm
irons_spellbooks:copper_spell_book (CAPPED @ 2%)
```

**T1 Illager / dark** — used by `woodland_mansion` (14 items + 2% ISS cap):

```
artifacts:scarf_of_invisibility        artifacts:lucky_scarf
artifacts:superstitious_hat            artifacts:cross_necklace
artifacts:antidote_vessel              artifacts:panic_necklace
artifacts:thorn_pendant
moreartifacts:ankh_charm               moreartifacts:tainted_mirror
moreartifacts:purification_charm       moreartifacts:spectre_amulet
relics:midnight_robe
celestial_artifacts:undead_charm
irons_spellbooks:copper_spell_book (CAPPED @ 2%)
```

**T1 Ancient / eldritch** — used by stronghold tables (15 items + 2% ISS cap):

```
artifacts:night_vision_goggles         artifacts:universal_attractor
moreartifacts:fast_clock               moreartifacts:tainted_mirror
celestial_artifacts:repent_mirror      celestial_artifacts:backtrack_mirror
celestial_artifacts:heirloom_necklace  celestial_artifacts:nostalgic_butterfly_ring
celestial_artifacts:traveler_scroll
ars_nouveau:novice_spell_book          ars_nouveau:source_gem
irons_spellbooks:scroll                irons_spellbooks:common_ink
relics:magic_mirror                    relics:reflection_necklace
irons_spellbooks:copper_spell_book (CAPPED @ 2%)
```

### N.4 Per-structure themed pools (T2)

**T2 Eldritch** — Twilight Lich Tower (14 items, ~8.4% combined):

```
celestial_artifacts:cursed_talisman    celestial_artifacts:cursed_protector
celestial_artifacts:hidden_bracelet    celestial_artifacts:shadow_pendant
moreartifacts:spectre_amulet           moreartifacts:venom_amulet
moreartifacts:decay_amulet             moreartifacts:tainted_mirror
relics:midnight_robe
artifacts:obsidian_skull               artifacts:antidote_vessel
artifacts:vampiric_glove
ars_nouveau:apprentice_spell_book      irons_spellbooks:uncommon_ink
```

**T2 Sky / cloud** — Aether dungeons (12 items):

```
artifacts:cloud_in_a_bottle            artifacts:helium_flamingo
artifacts:lucky_scarf
moreartifacts:high_jumpers             moreartifacts:balloon
celestial_artifacts:nostalgic_butterfly_ring
celestial_artifacts:skywalker_scroll
celestial_artifacts:gallop_necklace    celestial_artifacts:magic_horseshoe
celestial_artifacts:deers_mercy_amulet celestial_artifacts:deer_inscribed_amulet
ars_nouveau:apprentice_spell_book
```

**T2 Elemental** — Blue Skies dungeons (12 items):

```
celestial_artifacts:freeze_ring        celestial_artifacts:thunder_ring
celestial_artifacts:emerald_ring
moreartifacts:ice_crystal              moreartifacts:sunglasses
moreartifacts:cobalt_shield
artifacts:flame_pendant                artifacts:shock_pendant
artifacts:thorn_pendant                artifacts:obsidian_skull
celestial_artifacts:sands_talisman
ars_nouveau:apprentice_spell_book
```

### N.5 Per-structure themed pools (T3)

**T3 Fire / blaze** — `minecraft:chests/nether_bridge` (12 items, ~9.8% combined):

```
relics:blazing_flask                   relics:magma_walker
moreartifacts:fire_stone               moreartifacts:blazing_treads
moreartifacts:molten_quiver            moreartifacts:obsidian_shield
artifacts:obsidian_skull               artifacts:fire_gauntlet
celestial_artifacts:nether_fire        moreartifacts:gilded_scarf
ars_nouveau:archmage_spell_book        irons_spellbooks:rare_ink
```

**T3 Piglin / gold** — bastion tables (12 items):

```
moreartifacts:gilded_scarf             moreartifacts:golden_headgear
moreartifacts:mechanical_glove
celestial_artifacts:gold_ring          celestial_artifacts:precious_bracelet
celestial_artifacts:treasure_hunter_necklace
celestial_artifacts:emerald_bracelet
artifacts:golden_hook
moreartifacts:ruby_ring                moreartifacts:lucky_emerald_ring
ars_nouveau:archmage_spell_book        irons_spellbooks:rare_ink
```

**T3 Underdark** — Undergarden ruin tables (13 items):

```
moreartifacts:enderian_scarf           moreartifacts:shadow_dust
moreartifacts:obsidian_shield
relics:bastion_ring                    relics:spore_sack
celestial_artifacts:cursed_protector
celestial_artifacts:demon_curse        celestial_artifacts:abyss_will_badge
celestial_artifacts:lock_of_abyss
artifacts:antidote_vessel              artifacts:obsidian_skull
ars_nouveau:archmage_spell_book        irons_spellbooks:rare_ink
```

### N.6 Per-structure themed pools (T4)

**T4 End / levitation** — `minecraft:chests/end_city_treasure` (13 items, ~11.2% combined):

```
celestial_artifacts:ender_jump_scepter (active scepter — verify in playtest, may pull to boss-drop)
celestial_artifacts:angel_pearl        celestial_artifacts:angel_heart
moreartifacts:enderian_eye             moreartifacts:ender_dragon_claw
moreartifacts:dragon_eye               moreartifacts:enderian_treads
moreartifacts:true_enderian_scarf
relics:enders_hand                     relics:elytra_booster
relics:space_dissector                 relics:arrow_quiver
relics:chorus_inhibitor
```

**T4 Sculk / echo** — Ancient City tables (13 items):

```
moreartifacts:sculk_lens               moreartifacts:sculk_shades
moreartifacts:sculk_treads             moreartifacts:shulker_heart
moreartifacts:shulked_clock            moreartifacts:echo_glove
celestial_artifacts:soul_box           celestial_artifacts:lock_of_abyss
celestial_artifacts:cursed_totem       celestial_artifacts:twisted_heart
relics:wool_mitten                     relics:shadow_glaive
artifacts:scarf_of_invisibility
```

**T4 Abyssal — orphaned item pool** *(originally targeted at The Abyss marquees structure which is not in pack; per #47, this 14-item curated pool awaits reassignment to a different T4 structure — e.g., Ancient City, End City, or a Cataclysm endgame structure. Items themselves are in pack via the `celestial_artifacts` / `relics` mods)*:

```
celestial_artifacts:abyss_core         celestial_artifacts:abyss_will_badge
celestial_artifacts:lock_of_abyss      celestial_artifacts:demon_heart
celestial_artifacts:demon_curse        celestial_artifacts:twisted_heart
celestial_artifacts:twisted_scroll     celestial_artifacts:twisted_scabbard
celestial_artifacts:catastrophe_scroll celestial_artifacts:heart_of_revenge
celestial_artifacts:chaotic_etching    celestial_artifacts:nihility_etching
relics:shadow_glaive                   relics:space_dissector
```

### N.7 Notes

- **ISS spellbook cap (2%).** `irons_spellbooks:copper_spell_book` (T1), `apprentice_spell_book` (T2), `archmage_spell_book` (T3) appear in themed pools where lore-fitting, capped at 2% per chest. Per the rationale in master.md Part XIII, the starter kit handles "hard to start magic" onboarding so higher legacy rates aren't justified.
- **ISS scrolls are uncapped** and remain a primary mage-progression vector. They appear in T1 Magic and T1 Ancient / Eldritch pools per their tier.
- **Cataclysm structures** are *intentionally not* in this roster. Cataclysm boss drops handle Cataclysm flavor; per-structure marquee pools on top would be double-coverage.
- **Tables marked TBD** require packwiz/jar verification before final code wiring: T2 Lich Tower exact loot table IDs, T2 Aether dungeon tables, T2 Blue Skies dungeon tables, T3 Undergarden ruin tables, T4 Abyss marquee tables. Initial implementation may use partial coverage on TBD entries.
- **`celestial_artifacts:ender_jump_scepter`** is flagged from the celestial_artifacts audit as ungated. Including in T4 End / levitation pool but mark for in-playtest verification — pull to boss-drop only if rate proves too generous.
