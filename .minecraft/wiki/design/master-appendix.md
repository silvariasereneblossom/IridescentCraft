# IridescentCraft Master Design: Appendix

Numerical reference, tables and lists for the [master design doc](master.md).

> This appendix holds all the numbers: tier material lists, recipe state, boss-drop tables, Apotheosis rates, the custom item registry, the mod roster, the KubeJS script index and the datapack override index. The companion [`master.md`](master.md) holds design intent and system descriptions.
>
> Status: fully populated 2026-04-27. All 14 sections (A to N) are reference content. The numbers match the implementation as of the end of the audit fix plan (commits aeff0891 to 11df1f71). The 8,370-line legacy master from before the rewrite has been removed; this appendix replaces it.

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
| N | [Marquee Structures](#n-marquee-structures) |

---

## A. Tier Material Reference

Which materials the player can and cannot get at each tier. Cross-tier mechanisms (transmutation, boss tier-peek) are in Section B.

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
- Modded mid-tier materials such as Manasteel and Ironwood (gated to T2).

**Not gated, intentionally**
- Wood-tier and iron-tier weapons (vanilla + Tetra-modular Tier 1).
- Botania starter chain (apothecary, manasteel pre-stage, mana pool entry tier).
- Iron's Spellbooks copper spell book + starter scrolls (for the Mage origin path).
- Ars Nouveau novice spell book + Scribes Table (T1 entry per 2026-04-24 design correction).
- Tetra basic-tier modular workbench access.

### A.2 Tier 2 (Twilight / Blue Skies dimensional access)

**New available (gated by tier_2 stage)**
- Steel (Thermal): the workhorse T2 alloy.
- Manasteel (Botania): magic-tier T2 metal. Block + ingot + nugget + 4-piece armor + sword/pick/axe/shovel.
- Mana diamond + Mana pearl (Botania): T2 transmutation outputs. (Diamond ore itself stays T3-gated.)
- Botania T2 workstations: Runic Altar, Spreader fundamentals, basic Mana Pool tier.
- Twilight Forest dimensional metals: Steeleaf, Ironwood, Fiery, Knightmetal, Carminite (post-Lich progression). Full TF tool/armor sets in their respective metals.
- Blue Skies: Aquite, Diopside / Charoite / Horizonite raw materials (the recipes for *vanilla* tools/armor made from these are stripped, see Section B; players use the Tetra integration for proper T2 stats).
- Apotheosis T2 workstations: Simple Reforging Table, Gem Cutting Table, Sigil of Socketing.
- Ars Nouveau T2: Apprentice spell book, Enchanting Apparatus, Arcane Core, Imbuement Chamber (for non-shortcut recipes; the diamond/netherite ones are removed in Section B).

**Limited**
- Diamonds only through expensive transmutation (Thermal Smeltery, Create Mixing; Section B has the current state).

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
- Cataclysm: Witherite, Enderite, Ignitium, Cursium ingots (boss-drop chain, see Section C).
- Apotheosis T3: Reforging Table, Sigil of Rebirth, Sigil of Withdrawal.
- Modular Spell Books T3: Diamond + Archmage variants.
- ISS T3: Rare Ink, Diamond Spell Book, T3 Runes (fire/ice/blood/ender/lightning), upgrade orbs.

### A.4 Tier 4 (The Aether incl. Deep Aether's biomes / End / Ad Astra)

**New available (gated by tier_4 stage)**
- Aether (T4 since 2026-10-16; T2 before): Skyroot + Holystone + Zanite + Gravitite, and the Valkyrie/Slider/Sun Spirit boss-tier materials.
- Netherite (processable now: Ancient Debris drops + smithing template).
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

After the T4 unlock, post-Glacio content is the "endgame after the endgame": Mythic Forge crafts, Ascension cycles and Rift dives. No fifth AStages stage gates them; content access does (the Mythic Forge requires gaia_ingot, which is T4; Mythic Catalysts require icraft_rift_shard from T4 boss drops; and so on).

### A.6 Character Layer Reference

13 origins (9 vanilla rebalanced + 4 custom): Avian, Arachnid, Blazeborn, Elytrian, Enderian, Feline, Merling, Phantom, Shulk (vanilla rebalanced); Witch of Ink, Artificial Construct, Witherborn, Slimebodied (custom).

11 races (Iridescent Origins): Human, Elf, Dwarf, Orc, Halfling, Faefolk, Revenant, Demi-God, Ryu, Fallen Angel, Kirin.

13 classes (Iridescent Classes): Berserker, Samurai, Battlemage, Wanderer, Paladin, Vanguard, Ranger, Archmage, Artificer, Void Summoner, Elemental, Blessed, Corrupted.

The stat tables and ability descriptions for each origin, race and class are in the JSON files under `kubejs/data/icraft/` and in the Patchouli codex (categories: Choosing Your Build / Origins Guide / Classes). This appendix does not repeat them; the codex is the authoritative reference for character creation choices.

### A.7 Tier unlock options — the token economy

The token economy is described in [master.md Part III](master.md#part-iii--progression-the-token-economy). A player advances a tier by reaching either its token threshold or its boss-rush %. There is one combined pool with four lanes (Engineering / Magic / Exploration / Combat); each lane reaches the threshold on its own, and hybrids mix the lanes freely. The design was locked on 2026-05-31. The values are the design; exact item IDs are verified at build.

| Transition | Token threshold | Boss-rush % |
|---|---:|---:|
| T1 → T2 | 500 | 80% of T1 bosses (8 of 9) |
| T2 → T3 | 1000 | 90% of T2 bosses (17 of 18) |
| T3 → T4 | 2000 | 100% of T3 bosses (all 45, incl. Lucifer) |
| T4 → finale | none | defeat the Ender Dragon (pack finale; no gate: the Ad Astra planets open with T4) |

The boss-rush denominator is the per-tier boss roster: the `rush` field of each entry in the pack's boss registry (read by `kubejs/server_scripts/gates/codex_boss_rush.js`). A roster holds the tier's named bosses and some minibosses (the three Mutant Monsters and Mowzie's Naga in T1; Swampjaw, the Bellringer and the Mutant Enderman in T2; Coralssus, Iron's Spellbooks' four casters, the Stalwart Dungeons bosses and others in T3): 9 / 18 / 45 entries. The counts are the bosses that exist in the pack as of 2026-10-12, recounted on 2026-10-16 when Frostmaw moved from T1 to T2, the Aether's three dungeon bosses from T2 to T4 (T4 has no boss rush) and Merlin and Circe to T3; `/icraft codex bosses` shows the live numbers. Until 2026-10-12 the rosters also listed bosses the pack does not have, so the route could not be completed. The ladder is strict (since 2026-10-15): a threshold of tokens or of roster kills buys its tier only while the player holds the tier below; kills made early are kept and count once that tier is held. The default rate for bulk metal is 1 token per 100. Every resource and block has a cap, and the tables below are the complete conversion set (no universal default, no unlisted long tail), so each tier's total is that lane's ceiling.

#### A.7.1 Engineering lane (material → token)

**T1: Create, subtotal ≈ 590 (118% of 500)**

| Source | Cap | Rate/Value | Tokens |
|---|---:|---|---:|
| Iron Ingots | 7500 | 1/100 | 75 |
| Copper · Gold · Redstone | 2500 ea | 1/100 | 75 |
| Brass · Andesite Alloy · Steel | 500 ea | 1/50 | 30 |
| Crushing Wheel · Steam Engine | 2 ea | 25 | 100 |
| Mechanical Press · Mixer | 2 ea | 20 | 80 |
| Mechanical Saw · Drill · Deployer | 2 ea | 15 | 90 |
| Millstone · Windmill Bearing | 2 ea | 15 | 60 |
| Mechanical Crafter · Water Wheel | 4 ea | 10 | 80 |

**T2: Thermal, subtotal ≈ 1200 (120% of 1000)**

| Source | Cap | Rate/Value | Tokens |
|---|---:|---|---:|
| Gold · Iron · Copper · Redstone | 15000 ea | 1/100 | 600 |
| Invar ore · Electrum ore | 500 ea | 1/50 | 20 |
| Induction Smelter | 2 | 50 | 100 |
| Pulverizer · Centrifugal Separator | 2 ea | 40 | 160 |
| Redstone Furnace · Sawmill | 2 ea | 30 | 120 |
| Magmatic Dynamo · Energy Cell | 2 ea | 25 | 100 |
| Magma Crucible | 2 | 20 | 40 |
| Stirling Dynamo | 4 | 15 | 60 |

**T3: Mekanism, subtotal ≈ 2400 (120% of 2000)**

| Source | Cap | Rate/Value | Tokens |
|---|---:|---|---:|
| Gold · Iron · Copper · Redstone | 30000 ea | 1/100 | 1200 |
| Diamonds | 500 | 1/50 | 10 |
| Netherite | 500 | 1/25 | 20 |
| Biofuel | 5000 | 1/100 | 50 |
| Gas-Burning Generator | 2 | 100 | 200 |
| Basic Factory | 2 | 80 | 160 |
| Purification Chamber · Osmium Compressor | 2 ea | 70 | 280 |
| Enrichment Chamber | 2 | 60 | 120 |
| Metallurgic Infuser · Crusher | 2 ea | 50 | 200 |
| Energized Smelter · Energy Cube (Basic) | 2 ea | 40 | 160 |

> The ore-only share rises 36% / 62% / 64% across T1/T2/T3 by design, since higher tiers unlock ore multiplication and automation. Machines are still needed to cross the line; ore alone never reaches the threshold. **Action item:** tier the Mekanism recipes so the tech economy lines up with these gates.

#### A.7.2 Magic lane (cultivation → token)

This lane draws only from the generation, cultivation and ritual side (mana/source farms, infusion altars), never from spellcasting. Its sources are Reagents (capped, "the ore") and Apparatus (low cap, high value, "the machines").

**T1: Botania, subtotal 600**

| Source | Cap | Rate/Value | Tokens |
|---|---:|---|---:|
| `manasteel_ingot` | 10000 | 1/50 | 200 |
| `mana_pearl` | 2000 | 1/20 | 100 |
| Mystical Petals (any) | 4000 | 1/80 | 50 |
| Runic Altar runes | 16 | 5 | 80 |
| Runic Altar / Mana Pool | 2 / 4 | 20 / 10 | 80 |
| Mana Spreaders | 4 | 10 | 40 |
| Generating flora (Endoflame…) | 8 | 5 | 40 |
| Alchemy Catalyst | 2 | 5 | 10 |

**T2: Ars Nouveau, subtotal 1250**

| Source | Cap | Rate/Value | Tokens |
|---|---:|---|---:|
| `source_gem` | 30000 | 1/50 | 600 |
| `magebloom_fiber` | 4000 | 1/50 | 80 |
| Sourceberries | 6000 | 1/100 | 60 |
| `mana_diamond` *(re-tiered from T1)* | 500 | 1/10 | 50 |
| Sourcelinks (agronomic/alchemical/mycelial) | 2 ea | 30 | 180 |
| Source Jars | 4 | 20 | 80 |
| Imbuement Chamber / Enchanting Apparatus | 2 ea | 20 | 80 |
| Drygmy Henge | 2 | 25 | 50 |
| Ritual Brazier / premium Sourcelinks | 2 / 2 | 15 / 20 | 70 |

**T3: advanced Botania + Occultism + F&A, subtotal 2360**

| Source | Cap | Rate/Value | Tokens |
|---|---:|---|---:|
| `terrasteel_ingot` | 2000 | 1/4 | 500 |
| `arcane_crystal` (F&A) | 4000 | 1/10 | 400 |
| `elementium_ingot` / `spirit_attuned_gem` | 3000 / 1500 | 1/10 / 1/5 | 600 |
| `deorum_ingot` / `iesnium_ingot` | 1500 / 1000 | 1/10 | 250 |
| Otherworld / Demon's Dream essence | 600 | 1/5 | 120 |
| Hephaestus Forge / Terra Plate / Alfheim Portal | 1 / 2 / 2 | 80 / 30 / 20 | 180 |
| Occultism ore-miner spirit lamps | 3 | 40 | 120 |
| Dimensional Storage / Eternal Stella / Clibano | 2 ea | 30 / 25 / 20 | 150 |
| `conjuration_catalyst` *(re-tiered from T1)* | 2 | 20 | 40 |

> Recipe tier-gating fixes built in: `mana_diamond` → T2, `conjuration_catalyst` → T3, and Gaia Spirit dropped (a boss drop would force a fight, which breaks the non-combat lane). Botania T1 bootstraps itself; the Enchanting Apparatus needs the `diamond → mana_diamond` override (shipped, see §B and master.md Part III).

#### A.7.3 Exploration + Combat lanes (drops + dimensions)

| Source | T1 | T2 | T3 | T4 |
|---|---:|---:|---:|---:|
| **Miniboss** kill | 2 | 4 | 6 | 8 |
| **Boss**: first kill (named-boss token, convert once) | 10 | 15 | 20 | ⚠ TBD |
| **Boss**: repeat kills | 4 | 8 | 12 | ⚠ TBD |
| **Non-overworld dimension** (per tier) | n/a (OW) | 20 | 20 | 20 |

- Tokens are also found in chests and barrels and occasionally dropped by enemies, more densely in structures and dimensions.
- The Combat lane is the boss-rush % (clear 80/90/100% → auto-advance) plus boss and miniboss kills, which feed the pool as the Combat source.
- Open (tuning only): T4 boss-token values, and whether "20 per tier in non-overworld dimensions" is per dimension or total. This is the last open framework item.

#### A.7.4 T3 → T4 Lucifer + the End

- Lucifer (`cardinal_sins:lucifer`) is the T3 → T4 combat capstone. Non-combat lanes skip him by banking the 2000-token threshold. The boss-rush route requires him: he is the final T3 boss in the 100% clear. A unique Lucifer's Token (the "pure-except-for-the-fight" submission, a second combat door) was never built and was retired from the design on 2026-10-17. A Lucifer kill grants no tier on its own; the old single-kill milestone routes were retired on 2026-06-01.
- The End uses the vanilla stronghold and End Portal process with Eyes of Ender (staged at T4). **Planned, not built:** an "End Compass" crafted from the Aether's materials is to replace the Eye of Ender. It would direct the player to an "End Bastion" (reusing the `boss_compass` waystone system), which makes the End post-Aether.
- T4 is terminal: it has no token gate. The Ender Dragon is the pack finale. The Ad Astra planets were designed as the post-game after it; since 2026-10-17 they are not, by design. They and their orbits are T4 dimensions that need the T4 stage and a rocket, not a dragon kill.

> Supply-vs-threshold pacing (rough): the threshold is always reachable, because repeat boss kills can be farmed. The supply from doing each thing once (~550 / ~900 / ~1450) grows more slowly (~1.6×/tier) than the threshold curve (2×/tier), so the upper tiers, especially T3 → T4, may lean on grind. The estimate depends on the open Exploration values and on the large T3 Mekanism economy (likely lowballed), and it needs a real model to settle.

---

## B. Tier-Skip Recipe State

Every `event.remove` and `event.shaped` (override) call in `kubejs/server_scripts/recipes/` and `compat/`, by file. The `validate_recipe_removals.js` script (run at server start) holds the same target list and uses it to check for stale IDs.

### B.1 `recipes/recipe_audit.js`: cross-mod tier-skip blocks

**Section A (vanilla loot table cleanup)**: removes diamond/emerald from natural-stone loot tables.

**Section B (Create tier-skip blocks)**:
- `create:mixing` removed for `mekanism:ingot_osmium` (cross-mod: Create rotation produces osmium without Mekanism processing).

**Section C (Vanilla recipe removal)**: lodestone-without-netherite, beacon variants.

**Section D (Ars Nouveau Imbuement)**:
- E.1: `ars_nouveau:imbuement` removed for `minecraft:diamond` and `minecraft:netherite_ingot`.

**Section E (Mekanism processing)**:
- E.2: `mekanism:enriching` removed for `minecraft:diamond` and `minecraft:emerald`.
- E.3: `mekanism:combining` removed for `minecraft:emerald_ore` and `minecraft:deepslate_emerald_ore`.
- E.4: Occultism dimensional miners: handled by the `icraft_occultism_overrides` datapack (audit Phase 1, 2026-04-27).
- E.5: Botania Orechid: handled by the `icraft_botania_overrides` datapack.
- E.6: `botania:mana_infusion` removed for `minecraft:diamond` and `minecraft:emerald`.

**Section F (Cross-mod misc)**:
- F.1: `forbidden_arcanus:clibano_combustion` removed for `minecraft:diamond` and `minecraft:netherite_ingot`.
- F.2: `minecraft:blasting` removed for `minecraft:netherite_scrap` (catches modded furnace variants).
- F.3: Elytra crafting blocked (per Section G of `tier_gated_recipes.js`).

**Section H (Cataclysm combining)**:
- H.1: `mekanism:combining` removed for `minecraft:nether_star`.
- H.2: `mekanism:purifying` removed for `mekanism:clump_diamond`.
- H.3: `mekanism:injecting` removed for `mekanism:shard_diamond`.

**Section I (Terramity gun + armor strip)**:
- I.1: 22 firearm + ammo crafting recipes removed.
- I.2: 60+ armor pieces (15 Terramity armor sets) recipes removed.
- I.3 (audit Phase 4.1, 2026-04-27): 7 non-gun melee EPIC weapons + 8 EPIC curios recipes removed.

**Section J (Mekanism multi-tools + Refined Obsidian armor)**:
- J.1: `mekanism:atomic_disassembler`, `mekanism:meka_tool` recipes removed (re-added to T4 with custom recipe in `tier_gated_recipes.js`).
- J.2: 4 Refined Obsidian armor pieces recipes removed.
- J.3 (audit Phase 8.4, 2026-04-27): `cataclysm:mechanical_fusion_anvil` recipe removed (merged with `void_forge`/`infernal_forge`).

**Section K (Theabyss rings + Arcane Workbench + boss armor)** *(LIVE: theabyss/TATOS is installed, so these strips fire. The 30 stock rings and the arcane workbench are removed so the 8 custom `kubejs:ring_*` curios are the only ring economy; the Unorithe armor set's crafting recipes are removed so that set is boss-drop-only, see §C.11)*:
- K.1: `event.remove({ mod: 'theabyss', type: 'minecraft:crafting_shaped', output: /theabyss:ring_/ })` (regex bulk strip).
- K.2: Catch-all `event.remove({ output: /theabyss:ring_/ })` for shapeless/special.
- K.3: 29-item individual ring removal list (belt-and-suspenders); audit Phase 3.2 fixed `ring_of_ghost` → `ring_of_ghosts` plural drift.
- K.4: `theabyss:arcane_workbench` (ring crafting station) removed.
- K.5: recipes removed for the boss-drop Unorithe armor set, 4 pieces. (The Knight, Ragnarok, Dragon and Death sets once listed here are not items in the installed mod.)

**Section L (Blue Skies removals)**:
- L.1: `blue_skies:dusk_arc/*` regex strip.
- L.2: 4 Shadow armor pieces recipes removed.
- L.3: `blue_skies:runic_arc` recipe removed (now boss-drop only).

**Section M (Blue Skies material tools/armor strip)**: Diopside / Charoite / Horizonite have hardcoded vanilla stats; the Tetra integration replaces them.
- ~27 tool + armor pieces recipes removed.

### B.2 `recipes/tier_gated_recipes.js`: re-recipes + Section E

**Section A**: T1-tier replacements for vanilla recipes.

**Section B (Tech progression workstations)**:
- B.1: Lodestone re-gated to T4 (chiseled stone bricks + netherite ingot).
- B.2: Beacon naturally gated (nether star = Wither = T3+).
- B.3: Mekanism Meka-Tool re-recipe at T4 (alloy_atomic + netherite + configurator + ultimate_control_circuit + reality_progression_token_t4).
- B.4-B.5: Ars Nouveau (T2), Occultism (T3): natural material gate, no override.
- B.6: Forbidden Arcanus Hephaestus Forge re-recipe at T3 (deorum + obsidian + diamond + dimensional_progression_token_t3).
- B.7: Mahou Tsukai (T4): natural material + AStages gate, no override.
- B.8: RFTools Dimensions T4 re-recipes (dimension_builder, dimension_editor).

**Section C (Botania Orechid, handled by datapack)**: no override needed, see `icraft_botania_overrides`.

**Section D (End Portal Recipe T4 gate)**.

**Section E (Simply Swords named uniques)**: a 43-entry recipe-removal list, refreshed in audit Phase 3.1 (2026-04-27). Categories: 15 T2 boss-allocated + 10 T3 + 6 T4 + 11 unassigned (creative-only) + 1 dormant_relic.

**Section F (Apotheosis salvaging)**: ungated at T1.

**Section G (Elytra crafting)**: blocked (T4, from End drops only).

### B.3 `recipes/tier_skip.js`: transmutation (retired)

The "bend not break" transmutation (cross-tier conversion at deliberately inefficient ratios, ~32-64 T2 ingots for 1 T3 ingot) is **not in the game**: `tier_skip.js` was retired with the legacy purge of 2026-06-01, and the five `kubejs:transmuted_*` placeholder items were removed on 2026-10-11 because nothing made or used them. Boss tier-peek drops are the remaining bend mechanism.

The Rift Keystone recipe that lived in the same file (4 `kubejs:icraft_rift_shard` + 4 `kubejs:void_fragment` + 1 `minecraft:nether_star` → `kubejs:rift_keystone`) is now in the Mythic Forge script (I.6), with other ingredients: one each of Void Essence, Dragon Heart, Gaia Ingot, Nether Star and Rift Shard.

### B.4 `recipes/ad_astra_gating.js`: rocket progression

- NASA Workbench: netherite + Mekanism Steel Casing + ad_astra:steel_block, the recipe locked to the T4 stage (since 2026-10-10; it asked for `reality_progression_token_t4`, a retired token with no source, so no rocket could be built). Every planet and orbit also has its own T4 dimension gate (since 2026-10-14).
- Tier 1 Rocket → Moon: netherite + thermal:enderium_ingot + ad_astra:steel_plate + ad_astra:engine_frame.
- Tier 2 Rocket → Mars: + aethersteel:aethersteel_ingot + ad_astra:moon_stone.
- Tier 3 Rocket → Venus/Mercury: + 2x aethersteel:aethersteel_ingot + ad_astra:mars_stone.
- Tier 4 Rocket → Glacio: + kubejs:primordial_essence + ad_astra:venus_stone (most expensive single craft in the pack).
- 4 Jet Suit pieces removed (MekaSuit replaces).
- 4 MekaSuit Mk2 in-place upgrade recipes (helmet/chestplate/leggings/boots; SECTION G) at Mythic Forge: aethersteel:aethersteel_ingot + mekanism:pellet_antimatter (apex reagent, swapped in for ad_astra:glacio_stone in the 2026-06-06 antimatter-sink pass) + the player's existing `mekanism:mekasuit_*` piece + primordial_essence each. (The dead `kubejs:aethersteel_ingot` id was corrected to `aethersteel:aethersteel_ingot` x7 on 2026-06-06; the recipes had been uncraftable.)

### B.5 `recipes/refined_storage_dualpath.js`: dual-path RS recipes

A Tech path (Mekanism + Thermal) and a Magic path (Botania + Ars Nouveau) for the same RS components, with a hybrid bonus for using both paths.

### B.6 `recipes/planetary_extraction.js`: Create Crushing Wheel planet stones

- Moon Stone → 25% Helium-3 + 15% Titanium Dust + 50% Iron Nugget.
- Mars Stone → 30% Ferric Oxide + 15% Cryogenic Crystal + 40% Redstone.
- Venus / Mercury / Glacio: similar, each with unique outputs.

### B.7 `recipes/cooking_conversion.js` + `recipes/if_latex_rework.js` + `recipes/waystone_recipes.js`

- 70 vanilla recipes converted to Farmer's Delight cooking workflow.
- HDPE / IF latex alternative pipeline (replaces vanilla rubber chain).
- Waystone craft requires custom boss drops at all tiers.

### B.8 `compat/class_artifacts_recipes.js`: rpgseteffects drops-only enforcement

Strips 17 IDs: 14 awakening artifact upgrade recipes + 3 intermediate materials (`magic_leather`, `artifact_piece_pouch`, `relics_to_fragment_smelting`).

### B.9 Counts

Call sites in the scripts as of 2026-10-18 (comments excluded; a removal inside a loop counts once per id it removes):

- `tier_gated_recipes.js`: 93 calls (55 `event.remove`, 35 `event.shaped` / `event.shapeless`, 3 custom recipes).
- `recipe_audit.js`: 65 calls (64 `event.remove`, 1 `event.shaped`).
- `tier_skip.js`: retired on 2026-06-01 (B.3), so no recipes.
- `ad_astra_gating.js`: 18 calls: 9 removals and 9 recipes (4 rockets + workbench + 4 Mk2 pieces).
- `class_artifacts_recipes.js`: 17 removals.
- `refined_storage_dualpath.js`: 39 calls (34 dual-path and hybrid recipes, 5 removals).
- `planetary_extraction.js`: 9 calls (8 crushing and pulverizing recipes, 1 removal).

Total recipe-state ledger: about 240 calls, validated against the JEI registry by `validate_recipe_removals.js` at server start.

---

## C. Boss → Loot Mapping

A summary of the boss-drop allocation across 10 boss-drop loot files. Drop chances are typical values; the source files have the exact rates.

### C.1 ISS bosses (`loot/iss_boss_drops.js` + `loot/iss_boss_first_kill.js`)

| Boss | Tier | Sustained drops (per kill) | First-kill guaranteed |
|------|-----:|----------------------------|----------------------|
| `irons_spellbooks:dead_king` | T3 | blood_staff @ 50% | necronomicon_spell_book |
| `irons_spellbooks:archevoker` | T3 | rare_ink + ender_rune | evoker_spell_book |
| `irons_spellbooks:fire_boss` | T3 | epic_ink + fire_upgrade_orb | blaze_spell_book |
| `irons_spellbooks:citadel_keeper` | T3 | keeper_flamberge @ 40% | none |
| `irons_spellbooks:cryomancer` (mob) | T3 | ice_staff @ 15%, ice_rune @ 25% | none |
| `irons_spellbooks:pyromancer` (mob) | T3 | pyromancer 4-piece armor @ 8-12%/piece + fire_rune @ 20% | none |
| `irons_spellbooks:magehunter` (mob) | T3 | rare_ink @ 15% | magehunter weapon @ 30% |

There are also mob-drop overrides for `aether:cockatrice` (lightning_rod 25%), `twilight:snow_queen` (ice_staff 50%), `twilight:alpha_yeti` (ice_staff 25%), `aether:valkyrie_queen` (magehunter 30%) and vanilla `phantom` during a thunderstorm (lightning_rod 5%).

### C.2 Cataclysm bosses (`loot/cataclysm_boss_drops.js`)

| Boss | Tier | Sustained drops |
|------|-----:|-----------------|
| `cataclysm:netherite_monstrosity` | T3 | rare_ink + fire_rune + protection_rune + simplyswords:brimstone_claymore |
| `cataclysm:ignis` | T3 | epic_ink + fire_upgrade_orb + diamond_spell_book @ 15% + simplyswords:molten_edge |
| `cataclysm:the_harbinger` | T3-T4 | epic_ink + ender_rune + ender_upgrade_orb + simplyswords:shadowsting |
| `cataclysm:ender_guardian` | T4 | epic_ink + legendary_ink + ender_rune + ender_upgrade_orb + netherite_spell_book @ 10% + simplyswords:arcanethyst |
| `cataclysm:maledictus` | T3 | rare_ink + ender_rune + simplyswords:twisted_blade |
| `cataclysm:ancient_remnant` | T4 | rare_ink + blood_rune + simplyswords:awakened_lichblade |
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
| Minoshroom | T2 | t2_token_fragment @ 35% | mjolnir @ 15% (since 2026-10-16) |
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

Tier 4 since 2026-10-16 (Tier 2 before). As for the End's bosses, a first kill pays the tier-4 amount (25 tokens) in tier-3 tokens, since there is no tier-4 token. Each of the three also drops 1-2 Rift Shards and a Void Fragment.

| Boss | Tier | Drops |
|------|-----:|-------|
| Slider | T4 | advanced_reforging_token @ 60% (was basic) + waystone_core + epic_ink (was uncommon) + lightning_upgrade_orb (was the lightning rune) + simplyswords:thunderbrand + too_many_bows:scatter_bow + Artifact Piece Pouch on the T4 rule (2 pouches + a small chance at an awakening artifact) |
| Valkyrie Queen | T4 | simplyswords:caelestis + too_many_bows:wind_bow + too_many_bows:radiance |
| Sun Spirit | T4 | legendary_ink 30 % (was rare ink 50 %, 1-2) + fire and holy upgrade orbs (were the runes) + simplyswords:sunfire + too_many_bows:aethers_call + Sunfeather Charm (now a T4 relic, 500 relic essence) |

Deep Aether: `deep_aether:eots_controller` (T4 sky-end) drops `simplyswords:flamewind` @ 15%.

### C.6 Alex's Mobs (`loot/alexsmobs_drops.js`, 21 modifiers)

- Mimicream nerf: `alexsmobs:mimicube` natural drops are stripped and re-injected at 1% (the vanilla rate of ~50% breaks the economy).
- T4 mobs (void_worm, mimicube, enderiophage, laviathan): legendary/epic ink + ender/fire runes + matching upgrade orbs.
- T3 nether/underground (bone_serpent, straddler, soul_vulture, crimson_mosquito, warped_mosco, murmur, hammerhead_shark, frostmoth, cosmaw): rare/uncommon ink + element-themed runes.
- T2 dangerous overworld (crocodile, komodo_dragon, anaconda, caiman, snow_leopard, dropbear, leafcutter_ant_queen, cachalot_whale): common/uncommon ink + minor rune drops.
- T1 passive entities: untouched.

### C.7 Stalwart Dungeons (`loot/stalwart_dungeons_drops.js`, 7 modifiers)

7 nether mini-bosses (awful_ghast, nether_keeper, incomplete_wither, giddy_blaze, reinforced_blaze, shelterer, shelterer_without_armor) with T3 ISS magic synergy. The tougher ones get rare_ink + fire/blood/cooldown runes; the weaker ones get uncommon_ink + fire_rune. `incomplete_wither` has a 10% diamond_spell_book chance.

### C.8 Mahou synergy (`loot/mahou_synergy_drops.js`, 14 modifiers)

Cross-mod injection of Mahou reagents:
- T2 reagents (attuned_emerald + fae_essence) on TF Lich, TF Hydra, Aether Sun Spirit, BS Summoner, vanilla Evoker.
- T3 reagents (attuned_diamond + kodoku) on Cataclysm Ignis, Harbinger, Maledictus, Ancient Remnant, ISS Dead King.
- T4 reagents (attuned_diamond at a higher count) on Cataclysm Ender Guardian, vanilla Warden, Ender Dragon.

### C.9 Dimensional / Mutant Mobs (`loot/dimensional_boss_drops.js`, 11 modifiers)

- Aether: slider (thunderbrand), sun_spirit (sunfire).
- Deep Aether: eots_controller (T4 sky-end).
- Vanilla: Warden (T4 sculk-themed).
- Undergarden: forgotten_guardian, forgotten, rotbeast.
- Mutant Monsters: mutant zombie/skeleton/creeper/enderman.

### C.10 Terramity non-gun melee (`loot/terramity_boss_drops.js`, audit Phase 4.1)

7 non-gun EPIC weapons allocated to themed bosses:
- `unholy_lance` → Dead King (T3 ISS undead) @ 10%
- `blasphemic_rapture` → Ignis (T3 fire) @ 10%
- `davy_jones` → The Leviathan (T3-T4 ocean) @ 10%
- `olympus` → Aether Slider (T4 storm; T2 until 2026-10-16) @ 5%
- `divine_intervention` → Aether Sun Spirit (T4 holy; T2 until 2026-10-16) @ 10%
- `planet_buster` → Ender Dragon (T4 cosmic) @ 15%
- `kamehameha` → Ancient Remnant (T4; placeholder until Mythic Forge recipe) @ 5%

### C.10a Terramity ingot-family weapons + curios (`loot/terramity_structure_drops.js`, audit 2026-05-19)

The audit revisit cut 3 ingot families (nyxium / exodium / reverium) from sourcing
entirely (40 items removed in recipe_audit.js I.4). The 5 ingot-family weapons
and 10 curios that needed those ingots come back as T3/T4 drops:

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
Originally allocated to infested_lab + ancient_outcrop, which are both in the overworld
despite their late-game loot (T1-accessible by dimension alone). Moved to T4 bosses:
- cataclysm:netherite_monstrosity: nyxium_greatsword 15%, nyxs_necklace 10%
- cataclysm:ender_guardian: antimatter_pacemaker 10%, null_scarf 12%
- minecraft:ender_dragon: antiprism 10%, dragon_band 12%

### C.10b Terramity reforging + socketing wiring (audit 2026-05-19)

All 26 Terramity drops (12 weapons + 14 curios/tomes) are routed to Apoth
LootCategories through the Equipment Type Overrides in `config/apotheosis/adventure.cfg`,
so the reforging table accepts them and the sigil-of-socketing recipes apply.
- 7 audit weapons (6 guns + unholy_lance) → sword (these extend Item, not SwordItem)
- 5 ingot weapons (auto via SwordItem/AxeItem)
- 6 tomes → magic_weapon (picks up 47 magic_weapon-typed affixes)
- 2 ranged firearms (fortunes_favor → bow; gaias_tempest → crossbow). Both were
  routed wrongly at first; a decompile in the 2026-05-19 curio survey showed
  that they are GeoItem-rendered guns with reload mechanics, not curios/tomes.
- 5 bracelets/bands → shield
- 3 chest curios (necklaces/amulets/pacemaker) → chestplate
- 2 head curios (null_scarf, antiprism) → helmet
- 1 boots curio (angel_feather) → boots

### C.10b.1 Terramity curio effect catalog (2026-05-19 survey)

Effect magnitudes for the 11 worn curios, confirmed by decompiling. The values
are recorded for future tuning. Everything ships as it is except the two speed
bracelets, which known-issues/tracker.md flags as setBaseValue
proc-trap items awaiting a post-cutover mixin pass.

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
values. Both had `Tier.getAttackDamageBonus = 14/12`, against 7 for the vanilla
netherite axe. They are clamped to tier-bonus 8 (displayed +14, against netherite's +9).
The swords (tier-bonus 7-9.5) weren't outliers and were left alone.

### C.11 Custom Abyss-themed curio system (`loot/abyss_boss_loot.js`)

The Abyss / TATOS (`theabyss`, T3 dimension `theabyss:the_abyss`) is installed. Its 30 stock rings + arcane workbench are stripped (`recipe_audit.js` §K) and replaced by 8 custom `kubejs:ring_*` curios:

`kubejs:ring_of_shadows`, `ring_of_the_phantom`, `ring_of_embers`, `ring_of_frost`, `ring_of_void_sight`, `ring_of_the_knight`, `ring_of_dark_pact`, `ring_of_unorithe`: 8 rings in total. Their effects are in `abyss/abyss_ring_effects.js`.

Drop sources (live, `abyss_boss_loot.js`): all eight rings are boss drops, since The Abyss has no chest that rolls loot. Shadows and Phantom: Nightblade (15% each); Embers: The Roka (15%); Frost: Ice Knight (15%); Void Sight: Elder (10%); Knight: Ice Knight (25%); Dark Pact: Soul Guard (20%); Unorithe: Guard (15%).

Abyssal Celestial Artifacts (since 2026-10-11): the same three bosses carry the Abyss-themed Celestial Artifacts. Elder (20%) and The Roka (50%) drop one of Demon Curse, Twisted Scabbard, Catastrophe Scroll, Abyss Will Badge or Lock of Abyss. Nightblade always drops one of Abyss Core, Demon Heart, Twisted Heart, Twisted Scroll, Heart of Revenge, Chaotic Etching or Nihility Etching. Each of the three also has a 10% chance of an enchanted book (levels 20 to 30). These rates are provisional. The Elder spawns in Blue Mountain and The Roka in Blue Jungle. Nightblade is summoned at a Night Altar: light the altar's eight upper pillars with Soul Hearts (Soul Guards drop them only to a Looting weapon), then use an Eye of Abyss (Roka Horn + Elder Eye + Crystal Hand + Eye of Ender + Ghast Tear) on the altar.

The Unorithe armor set is boss-drop-only (its crafting recipes are stripped in §K): Soul Guard 15% per piece, Guard 12% per piece. (The Knight, Ragnarok, Dragon and Death sets listed here earlier are not items in the installed mod.) 7 elemental armor-set bonuses for the in-pack theabyss sets (Garnite, Aberythe, Incorythe, Fusion, Phantom, Glacerythe, Ignisithe) are in `abyss/abyss_armor_effects.js`.

### C.12 Boss mod integration: additional mods (design notes)

These boss mods are in the modlist but not yet listed in the dedicated `*_drops.js` files. They integrate through dimension-multiplier scaling instead of per-entity LootJS rules.

**Brutal Bosses.** 29+ structure-guarding mini-boss variants of vanilla mobs (Evoker Boss, Skeleton Boss and others). They spawn next to loot chests in any structure and can be configured by datapack. They scale with the structure they appear in through the `iridescent_difficulty` dimension multipliers, with no separate Progressive Bosses scaling.

| Variant family | Primary spawn | Effective tier |
|----------------|---------------|:--------------:|
| Zombie / Skeleton / Spider | Overworld dungeons + YUNG's structures | T1 |
| Husk / Drowned / Cave Spider | Desert temples, ocean monuments, caves | T1-T2 |
| Evoker / Vindicator / Pillager | Woodland mansions, pillager structures | T2 |
| Blaze / Wither Skeleton / Piglin Brute | Nether fortresses, bastions | T3 |
| Guardian / Phantom / Shulker | Ocean monuments, End cities | T3-T4 |

**Ultris: Boss Expansion.** 8 bosses with custom AI, phases, music and arena structures. Ultris is a datapack packaged as a mod: it registers no entity types, and each of its bosses is a vanilla mob that its functions take over (checked 2026-10-16 against the game's entity list and the mod's data). The pack therefore cannot tell an Ultris boss from the mob it is made of: Ultris bosses are on no boss list, pay no kill tokens, count for no boss rush, and get no pack loot (no Simply Swords unique is assigned to any of them; each drops the mod's own items). The tier in the table below is the tier of the place where the boss is met.

| Boss | Made from | How it appears | Area tier | Notes |
|------|-----------|----------------|:---:|-------|
| Corrupted Enderman | an Enderman | a rare random event near a player in the Overworld | T1 | drops the Ominous Pearl (the Ultra Wither's summon, which cannot work here) |
| Giant | a Zombie | throw a Potion of Strength at a zombie near you (Overworld) | T1 | Giant Stompers |
| Illusioner | an Illusioner | a rare random event near a player in the Overworld | T1 | |
| Sanctum Keeper | a Stray | Ultris's Sanctum, underground in Overworld stronghold biomes | T1 | the Spirit Bow |
| Blaze King | a Blaze | Ultris's Blaze King Tower, in Nether fortress biomes | T3 | Blaze King's Helmet; the Endstone Key that opens the Shulker Stone's fight |
| Phantom Swarm | Phantoms | a random event on the End's outer islands, away from End Cities | T4 | |
| Shulker Stone | Ultris's own construct | Ultris's End pyramid beside End Cities: insert the Endstone Key at the pedestal on top | T4 | the Shulker Shell Helmet |
| Ultra Wither | a Wither | **cannot be made in this pack.** Ultris turns a vanilla Wither hit by a thrown Ominous Pearl into the Ultra Wither, but every Wither in this pack is Progressive Bosses' own entity, so Ultris never finds one to transform | none | the pack's stronger Wither is the Ultimate Wither (D.6) |

> Ultra Mode (the mod's hard-mode difficulty toggle) unlocks per boss after the first kill. The pack's per-kill scaling (D.6) does not reach these bosses.

**Cardinal Sins.** The 7 sins → Lucifer → Drakara ladder. The arenas of the seven sins and Drakara generate in the Abyss, and Lucifer's in the Nether (October 2026; the earlier move to the Undergarden and the Nether placed no arena at all, because the mod builds its arenas only in the Overworld). Every shrine takes the previous sin's Soul Orb and works once: Sloth → Gluttony → Lust → Greed → Envy → Wrath → Pride → Lucifer; Drakara waits in its arena. Lucifer (`cardinal_sins:lucifer`) is the T3 → T4 combat capstone (the last entry of the T3 boss-rush roster; his kill alone grants no tier); see [boss-catalog.md](boss-catalog.md) T3 and [master.md Part X](master.md#part-x--endgame-loops). Loot allocation is TBD; the mod integrates through `iridescent_difficulty` scaling.

> **Removed (2026-06-01 #47 sweep):** the LuMoreBossesAndMobs block (Macholote / Terezinossauro / Mini Golems / End Dwellee). The mod is not installed (no `lu_more`/`lumore` jar; `macholote` / `gold_mini_golem` are not registered entities), so its catalog rows and this design block were dropped.

**Majestic Menaces.** Per-boss thematic drops. Teikoku Senshi (`majestic_menaces:teikoku_senshi`) is a Tier 2 boss: designed health 1,000, the boss x3, on the Tier 2 boss rush, no kill tokens.

**Mutant Monsters.** Variants of the vanilla zombie, skeleton, creeper and enderman with enhanced AI and drops. `mutant_monsters_no_griefing.js` suppresses their block breaking, because the mutant zombie's pillar-up and the mutant creeper's charged explosion bypass the mobGriefing=false defaults. Their drops are wired through `dimensional_boss_drops.js`.

**Ultimate Bosses.** In the pack (`ultimate-bosses-1.0.4.jar`). Its bosses are called inside its towers on Overworld hills and mountains: the Storm with five Phantom Membranes (Tier 1), the Sorcerer with a Nether Star (Tier 3), the Lost Angel with Dragon's Breath; a fourth, the Eye, appears beside Blazes. They keep the mod's own drops and are not part of the pack's boss systems (no kill tokens, no boss rush, no boss scaling). The Simply Swords reserve once meant for them was given to other bosses on 2026-10-18.

#### Loot config priorities

Boss-mod loot tables should be configured in this order during implementation:

1. Brutal Bosses datapacks: override the default loot tables; tier 1 → vanilla materials + small XP; tier 4 → netherite scraps + a Rare-Epic Apotheosis affix item; never Simply Swords uniques.
2. Ultris: not possible with per-entity loot rules, because its bosses are vanilla mobs (see above). Any Ultris loot would have to key on the mod's own entity tags.
3. Cardinal Sins: allocate the sins/Lucifer/Drakara ladder (T3; Lucifer carries the Cursed Sigil of Pride relic and no tier token, since the designed Lucifer's Token is not in the game). Verify that no drop bypasses tier gating.
4. Ultimate Bosses: their own loot; whether the pack's boss systems should take them in is an open design question (2026-10-18).
5. Cataclysm-Apotheosis integration: *verify the source. The #47 cleanup audit found no `cataclysm*apoth*` jar in the live mods folder; the integration may come from `cataclysm_ut` or something similar. Needs operator confirmation.*

### C.13 Simply Swords unique-count audit

The named-unique distribution aims for variety at each tier while every single drop still feels special.

| Tier | Unique weapons assigned | Target |
|:----:|------------------------:|--------|
| T2 | ~10 to 12 | Enough variety that players see several before T3 |
| T3 | ~10 to 14 | Widest variety; most of the boss diversity is here |
| T4 | ~8 to 10 | Elite weapons, trophy status |
| Endgame / Mythic | 7 (Mythic Uniques from Rift Blueprints) | Top-end horizontal variety |
| **Total** | ~35 to 43 unique weapons | |

Each class should have 3 to 4 viable unique options across the full progression, enough that build identity feels authored without forcing a single best-in-slot.

### C.14 Counts

88 entities have explicit LootJS rules (17 before Phase 6F; +71 from Phase 6F and audit Phase 4.1). The additional boss mods covered in C.12 integrate through `iridescent_difficulty` dimension scaling without dedicated LootJS files.

---

## D. Apotheosis Tables + Scaling

### D.1 Affix rates by tier

Per-dimension rarity clamps (each sets both the fresh-spawn ceiling and the convert/reroll cap).
Updated 2026-05-14: the clamps were raised to match the natural fresh-spawn ceilings; before that the
convert path was more restrictive than fresh spawns. Both `config/apotheosis/
adventure.cfg` "Affix Convert Rarities" and "Gem Dimensional Rarities" mirror
these clamps.

| Tier | Dimensions | Rarity range | Max Sockets |
|------|-----------|--------------|------------:|
| 1 | Overworld | Common-Rare | 1 |
| 2 | Twilight Forest / Blue Skies | Common-Epic | 2 |
| 3 | Nether / Undergarden / Deeper Darker / Abyss | Common-Mythic | 3 |
| 4 | Aether (Deep Aether's biomes included) / End | Common-Ancient | 4+ |

The per-dimension floor (minimum rarity) keeps natural floors for higher tiers: Nether
mob drops floor at Rare, the Aether floors at Rare (Rare-Ancient since 2026-10-16; it was Uncommon-Epic as a T2 dimension)
and the End floors at Epic, so T4 is not polluted with junk Common rolls.

Every tiered dimension has a clamp (since 2026-10-16). Before that, fifteen dimensions had no line, so affixes and gems found there rolled
unclamped (up to Ancient at any tier). Now the Abyss's Frost World is clamped as the Abyss (Rare-Mythic), the Abyss's pocket dimension as
Tier 2 (Common-Epic), and the five Ad Astra planets, their six orbits, Iron's Spellbooks' pocket dimension and the Reality Marble
as the End (Epic-Ancient). The lists are generated from the pack's dimension registry.

Single-sourced 2026-06-06: the JSON affix definitions ship only through the `icraft_apotheosis_affixes` Paxi datapack zip (the 83-file `kubejs/data/.../affixes/` shadow tree was retired in all 3 distros). Per-dimension tier inference is still configured in `config/apotheosis/adventure.cfg`. Total: 84 JSON affixes + 65 event-driven affixes (`affixes/affix_effects.js`). Single-sourcing did not change the count, since it moved definitions without adding or removing any. The same 2026-06-06 pass fixed 9 `mob_effect`-carrier affix schemas to use per-rarity duration/amplifier.

> **Scorching (ex-Igniting).** The fire affix was reworked on 2026-06-06. Its old `mob_effect` carrier gave the *attack target* fire_resistance, a wrong-way buff that helped the enemy. It is now a thin `attack_damage` carrier whose real effect is an on-hit fire-vulnerability mark (15 to 50% by rarity, provisional), applied through `DamageModifierRegistry` in `affix_effects.js`. The player-facing name changed from Igniting to Scorching in lang; the affix JSON file is still `igniting.json` (the id was kept to preserve in-world stacks).

### D.2 Reforging gates

**Workstations are NOT AStages-gated** (changed 2026-05-14). All 9 Apotheosis
workstations (simple_reforging_table, reforging_table, augmenting_table,
gem_cutting_table, sigil_of_socketing, sigil_of_rebirth, sigil_of_withdrawal,
sigil_of_enhancement, sigil_of_unnaming) are available from T1. Crafting them
is a T1 activity.

The progression gate is the rarity ladder (D.1 above) plus boss-drop
tokens for reroll operations:

- Basic reroll at simple_reforging_table: needs the Tier 2 boss `basic_reforging_token`.
- Advanced reroll at reforging_table: Tier 3 boss `advanced_reforging_token` + expensive materials.
- Ultimate reroll at augmenting_table: Tier 4 boss `ultimate_reforging_token` + Gaia ingots. (Wiring antimatter into the reroll is tabled long term by operator decision, 2026-06-06; the token is loot-only and no reroll recipe exists in code.)

Rationale: the earlier workstation gating was redundant. Three caps
already constrain affix/gem progression (dimensional rarity clamp + boss-drop
tokens + Apotheosis's source-tier inference). Workstation gates added nothing
functional and only blocked crafting/placement, so they were removed.

### D.3 Gem tiers

The boss a gem comes from sets its tier:
- T1-T2 bosses → Common / Uncommon gems.
- T3 bosses (Cataclysm, F&A, Stalwart, the Wither) → Rare / Epic gems.
- T4 bosses (Ender Dragon, Gaia Guardian) → Legendary / Mythic gems.

### D.4 Dimension stat multipliers (full)

> **Engine note (2026-05-03 → reconfirmed 2026-06-01).** Per-dimension stat scaling now belongs to the bespoke time-based `iridescent_difficulty` mod (`iridescent_difficulty-0.1.0.jar`), which replaced ScalingMobs / Improved-Mobs-accumulator / Azukaar's (all removed). Multipliers ramp linearly from a per-tier start% to a cap% over capHours of dimension-loaded time, then freeze; the End uncaps after the Ender Dragon dies. The per-tier start/cap/capHours curve (T1 150→300% / T2 200→350% / T3 300→450% / T4 600→1000%) is in [Progression Overview](../progression/overview.md#dimensional-progression) and `config/iridescent_difficulty-common.toml`. The table below is the legacy flat-multiplier reference, kept for the *relative* shape across dimensions and for the mob-gear% column. Treat its absolute HP/DMG values as indicative; `iridescent_difficulty`'s time curve is the live source. Under the live engine, The Abyss (and its Frost World) runs the T3 curve, and Deep Aether runs the Aether's curve: it is not a separate dimension, since its biomes generate inside the Aether, so the Deep Aether row below is only a design target. The Aether has run the T4 curve since 2026-10-16 (T2 before); its row below keeps the old T2 reference values. Since the same day, the Ad Astra planets and orbits, Iron's Spellbooks' pocket dimension and the Reality Marble run the T4 curve, and the Abyss's pocket dimension runs the T2 curve; before that they were on no list and ran the T1 curve. Bosses with a designed health or the x3 are on the exclusion list, and no curve scales them (D.6).

Four stats scale independently per dimension. Damage scales fastest, HP moderately, and Speed and Armor minimally.

Base reference: Overworld zombie = 20 HP, 3 damage, 0 armor, 100% speed.

| Dimension | Tier | HP × | DMG × | Speed × | Armor × | Mob gear % | Notes |
|-----------|-----:|-----:|------:|--------:|--------:|-----------:|-------|
| Overworld | 1 | 1.0 | 1.0 | 1.0 | 1.0 | 5% leather/iron | Baseline |
| Twilight Forest | 2 | 1.8 | 2.0 | 1.05 | 1.3 | 20% iron-tier | Canopy ambushes |
| Blue Skies | 2 | 2.0 | 2.3 | 1.05 | 1.4 | 25% iron-tier | Elemental damage |
| The Aether | 4 (T2 until 2026-10-16) | 2.2 | 2.5 | 1.08 | 1.5 | 25% iron/steel | Aerial combat (legacy T2 values; see the engine note) |
| Undergarden | 3 | 3.0 | 3.5 | 1.10 | 2.0 | 40% steel/diamond | Toxic attrition |
| Deeper Darker (Otherside) | 3 | 3.5 | 4.0 | 1.10 | 2.2 | 45% diamond-tier | Horror stealth + Abyss-themed custom mechanics |
| The Nether | 3 | 4.0 | 5.0 | 1.12 | 2.5 | 50% diamond/netherite | Soulfire bypass |
| Deep Aether | 4 | 5.0 | 6.5 | 1.15 | 3.0 | 60% netherite | Multi-phase |
| End: Outer Islands | 4 | 6.0 | 8.0 | 1.15 | 3.5 | 70% netherite | Void proximity |
| End: Deep End / Cities | 4 | 7.5 | 9.0 | 1.18 | 4.0 | 75% netherite | Phase shift |
| End: Dragon's Domain | 4 | 10.0 | 12.0 | 1.20 | 5.0 | 80% netherite + enchanted | Dragon influence |
| Ad Astra (any planet) | 4 | 5.0-7.0 | 5.0-7.0 | 1.15-1.18 | 3.0-4.0 | 60-75% | Per-planet atmospheric |

Implementation: the dimension multipliers come from the `iridescent_difficulty` mod (time-based, see the engine note above); the static mob-tier HP block (basic 3× / mid 1.5× / elite 1.25×) stays in `kubejs/server_scripts/scaling/mob_scaling_unified.js` and stacks on top.

Since Champions Unofficial was removed on 2026-04-07, Majrusz's Progressive Difficulty (Master-stage scaling) handles per-dimension elite-mob density. (Majrusz's own per-mob *stat* scaling is disabled in its config, because `iridescent_difficulty` owns dimension stats.) Per-mob affix layering still comes from Apotheosis adventure affixes (D.1).

### D.5 Death durability loss by dimension

| Dimension | Loss % |
|-----------|------:|
| Overworld | 10% |
| Twilight Forest | 12% |
| Blue Skies | 14% |
| The Undergarden | 17% |
| Deeper Darker / Abyss | 18% |
| The Nether | 20% |
| The Aether (Deep Aether's biomes included; 15% until 2026-10-16) | 22% |
| The Moon, Earth orbit, Moon orbit | 22% |
| Mars + orbit | 25% |
| Mercury + orbit | 27% |
| Venus + orbit | 28% |
| Glacio + orbit | 30% |
| The End | 25% |
| Iron's Spellbooks' pocket dimension, the Reality Marble | 25% |
| Any other dimension (the Abyss's Frost World and pocket dimension included) | 15% |

Soulbound enchant: I = 50% prevention, II = 75%, III = 100% (and items don't go inert from death). Implementation: `kubejs/server_scripts/death_penalty.js`.

### D.6 Boss health and per-kill scaling

**Designed** is the health the pack gives a boss; a trophy boss then gets the boss x3, which gives the health of
your **first fight**. Since October 2026 every boss with a designed health or the x3 is left out of the dimension's
difficulty curve, so its first fight is the same in every dimension (the Wither 1,800 everywhere); minibosses without a
designed health still grow with the curve. **From fight 15** is the cap of per-kill scaling (below).

| Boss | Tier | Designed | First fight | From fight 15 |
|------|-----:|---------:|------------:|--------------:|
| Twilight Naga | 2 | 300 | 900 | 2,250 |
| Twilight Lich | 2 | 400 | 1,200 | 3,000 |
| Twilight Hydra | 2 | 500 | 1,500 | 3,750 |
| Ur-Ghast | 2 | 600 | 1,800 | 4,500 |
| Blue Skies bosses (Summoner / Alchemist / Starlit Crusher / Arachnarch) | 2 | 350-500 | 1,050-1,500 | 2,625-3,750 |
| Frostmaw (Everbright; T1 on the difficulty curve until 2026-10-16) | 2 | 500 | 1,500 | 3,750 |
| Citadel Keeper | 3 | 600 | 1,800 | 4,500 |
| Fire Boss (Iron's Spellbooks) | 3 | 700 | 2,100 | 5,250 |
| Dead King | 3 | 800 | 2,400 | 6,000 |
| Wither | 3 | 600 | 1,800 | not scaled |
| Ultimate Wither (built in the Nether with Corrupted Soul Sand) | 4 | 1,000 | 3,000 | not scaled |
| The Harbinger | 3 | 800 | 2,400 | 6,000 |
| The Leviathan | 3 | 850 | 2,550 | 6,375 |
| Maledictus | 3 | 900 | 2,700 | 6,750 |
| Netherite Monstrosity | 3 | 900 | 2,700 | 6,750 |
| Ignis | 3 | 1,000 | 3,000 | 7,500 |
| Meet Your Fight (Dame Fortuna / Rosalyne) | 3 | 700-800 | 2,100-2,400 | 5,250-6,000 |
| Ignited Revenant | 4 | 1,000 | 3,000 | 7,500 |
| Ancient Remnant (tier 3 until 2026-10-18) | 4 | 2,500 | 7,500 | 18,750 |
| Slider (Aether, Bronze Dungeon; T2 with 400 until 2026-10-16) | 4 | 1,000 | 3,000 | 7,500 |
| Valkyrie Queen (Aether, Silver Dungeon; T2 with 550 until 2026-10-16) | 4 | 1,200 | 3,600 | 9,000 |
| Sun Spirit (Aether, Gold Dungeon; T2 with 500 until 2026-10-16) | 4 | 1,200 | 3,600 | 9,000 |
| Ender Golem (miniboss, no x3) | 4 | 1,200 | 1,200 | 3,000 |
| Ender Dragon | 4 | 1,000 | 3,000 | not scaled |
| Gaia Guardian | 4 | 1,200 | 3,600 | 9,000 |
| Ender Guardian | 4 | 1,500 | 4,500 | 11,250 |

#### Per-kill scaling (per player)

A boss remembers the players who have beaten it. The first time it trades a hit with a player, it takes the
highest kill count of that boss among the players within 64 blocks, and keeps it for the whole fight: a
veteran who joins later changes nothing. Every player within 64 blocks when it dies counts the kill. Your counts
are your own (they survive death); `/icraft bosskills` lists them with what your next fight of each will be. When
a boss is stronger than its first fight, the players near it are told so in chat.

| Fight | Health | Damage | Speed |
|------:|-------:|-------:|------:|
| 1st | base | base | base |
| 2nd | +15% | +10% | +3% |
| 3rd-4th | +30% | +20% | +5% |
| 5th-6th | +50% | +35% | +8% |
| 7th-9th | +75% | +48% | +10% |
| 10th-14th | +100% | +60% | +12% |
| 15th and on | +150% (cap) | +80% (cap) | +15% (cap) |

The percentages are of the boss as you would meet it otherwise (its designed health, the x3, the difficulty
curve). Damage is the boss's melee: many bosses' spells and projectiles hit for their own numbers and are not
scaled. Nothing else changes: the moveset, the drops and the tokens are those of the first fight.

Which bosses: the trophy bosses of every tier and the pack's designed minibosses (78 kinds; in the two-phase fights of
Envy, Pride, Wrath and Lucifer each phase counts its own kills). Not scaled:
the Wither and the Ultimate Wither, the Ender Dragon, the Warden, the Elder Guardian, and the minibosses the pack
has not designed.

### D.7 Apotheosis-spawned random world bosses

These are separate from the designed bosses. They spawn at random per chunk per cycle in each dimension, and their level scales with the dimension's tier.

| Dimension | Spawn rate | Base stats × | Level range |
|-----------|-----------:|-------------:|------------:|
| Overworld | 2% | 1.0 | 1-10 |
| Tier 2 dimensions | 4% | 2.0 | 10-25 |
| Tier 3 dimensions | 6% | 3.5 | 25-50 |
| Tier 4 dimensions | 8% | 6.0 | 50-80 |
| End: Dragon's Domain | 10% | 10.0 | 80-100 |

Apotheosis bosses drop gear with affixes matching their level. Higher level → better affix rarity.

Where they actually spawn (the server's config, October 2026): Overworld 2 %; Twilight Forest, Everbright, Everdawn 4 %;
Undergarden, Otherside, the Abyss, its Frost World 6 %; the Nether 8 %; the Aether and the five Ad Astra planets 8 %; the End
10 %. The orbits, both pocket dimensions and the Reality Marble have none. A dimension's line only works if a boss file names
it: until 2026-10-16 only the Overworld, the Nether, the End and the Twilight Forest had one, so the other lines spawned nothing.
Since then six pack boss files cover the other twelve (tier 2: a vindicator and a witch; tier 3: a wither skeleton and a
zombified piglin; tier 4: an enderman and an evoker), each with Apotheosis's own gear templates and that tier's rarity range.

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

These numbers are design targets. Actual gameplay numbers will drift through the interaction of 7+ gear-enhancement layers, 13 classes, dimension mechanics and mob scaling. Expect at least 2-3 full tuning passes during playtesting; start at 80% of the designed values and tune up.

### D.10 ~~Champion affix pool~~: REMOVED 2026-04-07

> **Historical reference.** This section documented the Champions Unofficial affix pool. The mod was removed from the pack on 2026-04-07 and replaced by Majrusz's Progressive Difficulty (per `wiki/systems/overview.md:54`). Master-stage scaling now handles per-dimension elite-mob density without the Champions affix layer, and Apotheosis adventure affixes handle per-mob affix overlays (D.1).
>
> The original Champions affix pool (Molten / Arctic / Venom / Wither / Desecrating / Enkindling / Shielding / Reflecting / Regenerating / Armored / Adaptable / Hasty / Knockback / Blink / Leaping / Commanding / Summoning / Draining / Hexing) and the dimension-weighted assignment table are kept in git history (this section before 2026-05-28). Restore them only if Champions Unofficial is re-added.

### D.11 Regular mob equipment progression

Design targets for how often mobs spawn with gear in each dimension. They were originally an Improved Mobs config; since that mod was removed (2026-05-03), they are the targets the `scaling/mob_equipment.js` handler aims to hold (iron-tier cap). They are independent of elite-mob (Majrusz) scaling.

| Dimension | % equipped | Equipment tier | Enchantment level |
|-----------|-----------:|----------------|------------------:|
| Tier 1 | 5% | Leather / iron (random pieces) | None |
| Tier 2 | 20-25% | Iron / steel | 0-1 (basic) |
| Tier 3 | 40-50% | Steel / diamond | 1-3 (moderate) |
| Tier 4 (the Aether, Deep Aether's biomes included) | 60% | Diamond / netherite | 2-4 |
| Tier 4 (End: outer/deep) | 70-80% | Netherite | 3-5 |
| Tier 4 (End: Dragon's Domain) | 80% | Netherite + enchanted | 5+ |

Champion mobs used to spawn one tier above the base for their dimension, with a chance at affix-bearing gear that dropped on kill. Champions Unofficial was removed on 2026-04-07 (D.10), so there are no Champion mobs now.

### D.12 Implementation notes

These targets drive the live difficulty stack. It still has 7 layers, but not the original 7 (the Champions Unofficial layer was removed on 2026-04-07, and ScalingMobs / Improved Mobs were retired on 2026-05-03 in favor of the bespoke `iridescent_difficulty` mod):

1. `iridescent_difficulty`: time-based per-dimension HP / damage / armor multipliers (D.4), ramping to a per-tier cap; the End uncaps after the Ender Dragon. Replaces ScalingMobs, the Improved-Mobs accumulator and Azukaar's.
2. `mob_scaling_unified.js` tier-HP block: static per-category HP (basic 3× / mid 1.5× / elite 1.25×), applied on top of the dimension multiplier.
3. Majrusz's Progressive Difficulty: per-dimension elite-mob density through Master-stage scaling (replaces the former Champions Unofficial layer; Majrusz's own stat scaling is disabled in its config).
4. Per-kill boss scaling, per player (`boss_progressive.js`): each boss is stronger for players who have beaten it before (D.6). Progressive Bosses runs the Wither and does not scale per kill.
5. KubeJS mob event handlers: dimension-specific mechanics (Twilight ambush, Undergarden spores, End displacement, Nether soulfire); environmental hazards in `scaling/dimension_mechanics.js`.
6. Loot table integration: elite drops, boss drops, gear scaling per dimension.
7. Boss HP overrides: custom HP through `kubejs/server_scripts/scaling/boss_hp.js` (D.6).

The End's multi-zone implementation (Outer Islands / Deep End / Dragon's Domain) is in `kubejs/server_scripts/end/dragon_exploration_gate.js`, with biome-based scaling. Environmental hazard scripting (Void Corruption stacks, Void Storms, Reality Fracture; there are no Celestial Events) is in `kubejs/server_scripts/scaling/dimension_mechanics.js`.

**Playtesting note:** all numbers in D.4-D.11 are theoretical. The interaction of 7+ gear-enhancement layers, 13 classes, dimension mechanics and mob scaling can only be balanced through repeated playtesting. Recommended testing approach:

1. Test with a "standard" build (Samurai, mid-tier gear, moderate enchants) as the baseline.
2. Test extremes: naked Archmage vs End mobs, full Vanguard vs Overworld mobs.
3. Test multiplayer: Vanguard + Archmage duo vs designed solo difficulty.
4. Adjust multipliers in 10% increments until kill-speed targets are met.

---

## E. Custom Items Registry

All `kubejs:*` items, ~80 in total, by category. Source: `kubejs/startup_scripts/custom_items.js` + `endgame_items.js`.

### E.1 Progression tokens (T1-T4)

- `kubejs:tier1_token`, `kubejs:tier2_token`, `kubejs:tier3_token`, `kubejs:tier4_token`: full tier unlock tokens (from quests / boss completion paths).
- `kubejs:t2_token_fragment`, `kubejs:t3_token_fragment`, `kubejs:t4_token_fragment`: collectible fragments (drop from T2-T4 bosses; combine into full tokens).
- `kubejs:tier2_token_fragment`, `kubejs:tier3_token_fragment`: alternate fragment names (legacy; both work).
- `kubejs:dimensional_progression_token_t3`: Hephaestus Forge crafting reagent.
- `kubejs:reality_progression_token_t4`: NASA Workbench crafting reagent.

### E.2 Boss materials (drop-only)

- `kubejs:lich_soul`, `kubejs:harbinger_eye`, `kubejs:dragon_heart`, `kubejs:dragon_scale`, `kubejs:naga_scale`, `kubejs:hydra_fang`, `kubejs:ur_ghast_tear`: boss-specific drop reagents.
- `kubejs:nether_soul_fragment` (Wither Skeleton drop), `kubejs:condensed_blaze_essence` (Blaze drop), `kubejs:ignis_core` (Ignis drop).
- `kubejs:gaia_spirit_fragment` (Gaia Guardian).
- `kubejs:waystone_core`: boss-drop reagent for Waystone crafting.
- `kubejs:basic_reforging_token`, `kubejs:advanced_reforging_token`: boss-drop reforging-tier reagents.

### E.3 Endgame materials

- `kubejs:icraft_rift_shard`: primary endgame currency. Renamed from `kubejs:rift_shard` on 2026-04-27 to resolve a namespace collision with `too_many_bows:rift_shard`. The old ID is still registered as a deprecated alias for the migration window (~2 weeks). Migration script: `kubejs/server_scripts/migrations/rift_shard_rename.js`.
- `kubejs:rift_shard`: deprecated alias (migration target).
- `kubejs:void_fragment`: secondary endgame currency.
- `kubejs:rift_keystone`: Rift entry item (consumed on Rift entry).
- `kubejs:rift_core`: rare Mythic Catalyst V reagent.
- `kubejs:rift_blueprint`: Mythic unique recipe slot ingredient.
- `kubejs:rift_gem`: Mythic Forge intermediate.
- `kubejs:primordial_essence`: most expensive crafting reagent (Glacio rocket + Mythic catalysts III-V).
- `kubejs:mythic_forge` (block-item): endgame crafting station.
- `kubejs:mythic_catalyst_1` … `kubejs:mythic_catalyst_5`: escalating Mythic effect tokens.
- `kubejs:mythic_reforge_token`: gear-modifier reset.
- `kubejs:void_coffer`: Rift-banking storage.
- `kubejs:dragon_summoning_crystal`: Ender Dragon respawn reagent.

### E.4 Mythic uniques (Mythic Forge crafted)

- MekaSuit Mk2: the Mythic Forge upgrade is an in-place, per-piece transform of the real `mekanism:mekasuit_*` piece (no separate `kubejs:` shell item; the earlier `kubejs:mekasuit_mk2_*` shells were retired on 2026-06-06). Each piece is upgraded on its own. The craft consumes that one MekaSuit piece + Aethersteel + an Antimatter Pellet (`mekanism:pellet_antimatter`, the apex reagent, swapped in for Glacio Stone in the 2026-06-06 antimatter-sink pass) + Primordial Essence, and returns the same Mekanism piece with its NBT preserved (installed modules, stored energy, enchantments and affixes all survive), plus an `icraft_mekasuit_mk2` marker and a pinnacle display name/lore. A runtime stat layer keyed on the marker (`startup_scripts/mekasuit_mk2_stats.js`) adds a provisional pinnacle band over the native MekaSuit (additive only, no native nerf).
- Voidheart Blade, Oblivion Aegis, Riftwalker Boots, Oblivion Crown: Mythic Forge outputs that are existing items (Awakened Lichblade / netherite armor) renamed with NBT, not fully custom items. `endgame/rift_mechanics.js` recognizes them by matching the NBT display.Name.

### E.5 Cross-mod alt-recipe outputs

- `kubejs:enderium_via_occultism`: Thermal-bypass enderium alternative.
- `kubejs:hdpe_circuit_board`: IF latex rework alternative.
- `kubejs:brass_reinforced_iron_ingot`: Tier 1.5 alloy.
- `kubejs:mana_infused_steel_ingot`: Tier 2.5 alloy.
- `kubejs:ender_forged_diamond`: Tier 3.5 alloy.

### E.6 Planetary materials (Create Crushing extraction)

- `kubejs:helium_3`: Moon extraction.
- `kubejs:titanium_dust`: Moon byproduct.
- `kubejs:ferric_oxide`: Mars primary.
- `kubejs:cryogenic_crystal`: Mars rare.
- `kubejs:cryogenic_element`: Mars chain product.
- `kubejs:rare_earth_dust`: Mercury / Venus.
- `kubejs:solar_crystal`, `kubejs:pressure_crystal`: Venus.
- `kubejs:sulfuric_compound`: Venus chain.
- `kubejs:alien_isotope`: Mercury / Glacio rare.

### E.7 Custom Abyss-themed curio rings

- `kubejs:ring_of_shadows`, `kubejs:ring_of_the_phantom`, `kubejs:ring_of_embers`, `kubejs:ring_of_frost`, `kubejs:ring_of_void_sight`, `kubejs:ring_of_the_knight`, `kubejs:ring_of_dark_pact`, `kubejs:ring_of_unorithe`: 8 custom rings. theabyss/TATOS is in the pack; its 30 stock rings and arcane workbench are stripped (`recipe_audit.js` §K) and these 8 replace them. Live drop sources: Abyss bosses only (Nightblade, The Roka, Elder, Ice Knight, Soul Guard, Guard), since The Abyss has no chest that rolls loot; per C.11.

### E.8 Misc

- `kubejs:compass_of_return`: return-to-spawn item.

### E.9 Counts

~80 custom items are registered across `custom_items.js` + `endgame_items.js`, plus a few in `startup_scripts/iridescent_codex.js`.

---

## F. Mod Roster by Tier

Each mod's tier placement, side label (per server_distribution `.pw.toml`) and custom-jar marker. Side label key: `B` = both, `C` = client-only (server skips), `S` = server-only (client skips). Custom-jar marker `*` = bundled JAR (not in packwiz, see CLAUDE.md "Custom Bundled JARs").

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
| Iridescent Classes (in `iridescent_origins-1.0.0.jar`) | B | 13 classes |
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

### F.2 Tier 2 (Twilight, Blue Skies: dimensional access)

| Mod | Side | Notes |
|-----|:----:|-------|
| Twilight Forest | B | T2 dimension + 8-boss progression |
| Blue Skies | B | Everbright/Everdawn duality |
| Thermal Series (Foundation, Innovation, Expansion, Cultivation, Dynamics, Integration) | B | T2 RF + ore processing |
| Industrial Foregoing (basic) | B | T2 mob interaction + automation |
| Mekanism Tools | B | Tools (T2 entry) |
| Ad Astra protect-your-moa equiv | B | (none; Ad Astra is T4) |
| Apotheosis | B | T2 affixes (Uncommon + Rare) |

### F.3 Tier 3 (Nether, Undergarden, Deeper Darker, Abyss)

| Mod | Side | Notes |
|-----|:----:|-------|
| Mekanism (basic) | B | Mod-blanket T3 stage |
| Mekanism Generators | B | Mod-blanket T3 stage |
| Mekanism AAA (refined obsidian armor variants, recipe-stripped) | B | T3+ |
| Refined Storage | B | Mod-blanket T3 stage |
| Refined Storage Addons / Extra Storage / Extra Disks / RSRequestify | B | RS expansion (T3 stage) |
| XNet | B | T3 mod-blanket |
| Industrial Foregoing (advanced) | B | Laser Drill, Mob Crusher (T3 entry) |
| Forbidden & Arcanus | B | T3 chokepoint (per-item gated, NOT mod-blanket) |
| Occultism | B | T3 chokepoint (per-item gated, NOT mod-blanket) |
| L_Ender's Cataclysm | B | T3 nether boss line |
| Cataclysm UT | B | Cataclysm utility addon |
| Deeper Darker | B | T3 dimension (Otherside) with real sculk/darkness flavor (darkness empowerment + hexing). It is separate from theabyss/TATOS, which has its own T3 dim `theabyss:the_abyss`. |
| The Abyss / TATOS (`theabyss`, `TATOS 1.0.5_beta.jar`) | B | T3 dimension `theabyss:the_abyss` (gated T3 via `dimension_gates.js`). Oppressive-darkness/corruption/fear-aura/void-whispers mechanics (`dimension_mechanics.js`); 30 stock rings + arcane workbench stripped → 8 custom rings; 7 armor-set bonuses + boss-drop gating; 4 Tetra metals. `tatos_dimension_lock.js` confines theabyss mobs to the 4 TATOS dims. |
| Mahou Tsukai | B | Actually T4 (the mod is T4-staged); mahou-related drops at T2-T4 cross-mod |
| Stalwart Dungeons | B | T3 nether mini-bosses |
| Mutant Monsters | B | T3 boss-tier mobs |
| Apotheosis | B | T3 affixes (Epic) |

### F.4 Tier 4 (the Aether incl. Deep Aether's biomes, End, Ad Astra)

| Mod | Side | Notes |
|-----|:----:|-------|
| The Aether (+ Deep Aether, whose biomes generate inside it) | B | T4 dim (T2 until 2026-10-16) |
| Aether Treasure Reforging | B | Aether reforging |
| Aether Protect Your Moa | B | Aether companion |
| Aetheric Tetranomicon | B | Aether-Tetra bridge |
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
| `iridescent_difficulty` (custom) | B | Time-based per-dimension HP/damage scaling (replaced ScalingMobs / Improved Mobs / Azukaar's, all removed 2026-05-03) |
| Majrusz's Progressive Difficulty | B | Elite-mob Master-stage density (replaced Champions Unofficial); stat scaling config-disabled |
| Progressive Bosses | B | Runs the Wither (and the optional Ultimate Wither); no per-kill scaling |
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
| Tetra + art_of_forging + adtetra + tetra_re_enlarged | B | Crafted modular weapons + armor + tools (this replaces the Truly Modular family, which was removed on 2026-05-10; #47 resolved) |
| Apotheosis | B | Affixes / reforging / gem cutting / sigils |
| Citadel | B | Library mod |
| Geckolib (in many mods) | B | Animation library |

### F.6 Custom-bundled JARs (not in packwiz)

Per the "Custom Bundled JARs" section of CLAUDE.md. The allowlist is in `iridescentserver.bat` + `sync_from_repo.bat` + `update_mods.sh`.

| JAR | Purpose | Bytecode-patched? |
|-----|---------|:-----------------:|
| `iridescent_codex_data.jar` | Patchouli codex content (modId `icraft`) | No |
| `iridescent_origins-1.0.0.jar` | 13 origins / 11 races / 13 classes | No |
| `iridescent_biomes-1.0.0.jar` | TerraBlender region registration | No |
| `iridescent_modular_spells-0.2.0.jar` | Tetra-integrated modular spell books (Phase 6) | No |
| `mek_walkable_cables-1.0.1.jar` | Walkable Mekanism cables coremod | No |
| `offlineskins-1.20.1-v1.jar` | Offline-mode skin support | No |
| `zeta_racefix-1.0.0.jar` | Race selection fix | No |
| `Patchouli-1.20.1-85-FORGE.jar` | Codex framework | **Yes** (athrow→pop in Book.class) |
| `ars_nouveau-1.20.1-4.12.7-all.jar` | Ars Nouveau core | **Yes** (DungeonLootEnhancerModifier disabled) |

The `-noverify` JVM arg is required (server: in `iridescentserver.bat`; client: PrismLauncher Java settings).

---

## G. Stage Restrictions

Taken directly from `kubejs/server_scripts/gates/astages_restrictions.js` when the audit was completed on 2026-04-27. The content changes over time; this is a snapshot.

### G.1 Tier 2 stage

**Mod blanket gate**: `industrialforegoing` (T2, because basic IF is the T2 entry).

**Items** (~30 entries):
- Ars Nouveau: `apprentice_spell_book`, `enchanting_apparatus`, `arcane_core`.
- Iridescent Modular Spells: `modular_iron_spell_book`, `modular_gold_spell_book`, `modular_apprentice_spell_book`.
- Botania: `manasteel_ingot`, `mana_diamond`, `mana_pearl`, `manasteel_block`, 4-piece manasteel armor, manasteel tools (sword, pick, axe, shovel), `mana_diamond_block`.
- Apotheosis T2 workstations: `simple_reforging_table`, `gem_cutting_table`, `sigil_of_socketing`.
- rpgseteffects: 14 base class artifacts (altharion / blade_dancer / blood_fury / chronorend / hellbrand / hexweaver / ignisphere / moonpiercer / phoenix / sanctum / shadow_hunter / stormpiercer / vaelkhor / wolfheart) + `artifact_piece_pouch`.
- art_of_forging T2 (audit Phase 2.3): `ancient_axe`, `ancient_blade`, `ancient_flail`.

**Dimensions**: `twilightforest:twilight_forest`, `blue_skies:everbright`, `blue_skies:everdawn`. (`aether:the_aether` moved to the Tier 4 stage on 2026-10-16.)

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

**Dimensions**: `undergarden:undergarden`, `deeperdarker:otherside`, `minecraft:the_nether`, `theabyss:the_abyss`.

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
- Mekanism rebalance pins (2026-06-06, locked decision C): fusion chain (`mekanismgenerators:fusion_reactor_controller` [namespace fix; the old `mekanism:` pin was dead], `fusion_reactor_frame`, `fusion_reactor_port`, `fusion_reactor_logic_adapter`, `laser_focus_matrix`, `hohlraum`), SPS/antimatter (`sps_casing`, `sps_port`, `supercharged_coil`, `pellet_antimatter`), ultimate-tier facilities (`ultimate_tier_installer`, 9 ultimate factories, `ultimate_energy_cube`, `ultimate_induction_cell`, `ultimate_induction_provider`). Intermediates (alloys, circuits, HDPE) are deliberately left ungated per Axis H. Note: the `atomic_alloy` pin above is a latent dead id (`mekanism:alloy_atomic` is the real id) and is left dead on purpose, because gating it would violate Axis H.
- art_of_forging T4 (audit Phase 2.3): `demonic_axe`, `demonic_blade`, `demonic_flail`, `enigmatic_construct`.
- cataclysm T4 (audit Phase 8.4): `mechanical_fusion_anvil`.

**Ore replacements**: `aethersteel:aether_debris` and `aethersteel:aetherslate` replaced with `aether:holystone` until T4.

**Dimensions**: `aether:the_aether` (since 2026-10-16; Deep Aether registers no dimension of its own, its biomes are part of the Aether), `minecraft:the_end`, plus 5 Ad Astra planets (`ad_astra:moon`, `ad_astra:mars`, `ad_astra:mercury`, `ad_astra:venus`, `ad_astra:glacio`) and, since 2026-10-14, their six orbits (`ad_astra:earth_orbit`, `moon_orbit`, `mars_orbit`, `mercury_orbit`, `venus_orbit`, `glacio_orbit`). The Reality Marble needs no gate of its own (Mahou Tsukai is gated whole); Iron's Spellbooks' pocket dimension is closed by refusing the Pocket Dimension spell before T4 (since 2026-10-15).

### G.4 Intentionally NOT mod-gated

Per `astages_restrictions.js`:
- `occultism`: has passive items (Demon's Dream essence, otherworld saplings) that fit the early game, so it is gated per item instead.
- `forbidden_arcanus`: same reason (Aureal bottles, edelwood); gated per item.

---

## H. Datapack Override Index

Validated by `tools/validate_datapack_references.sh`. Each entry is a Paxi datapack zip in `config/paxi/datapacks/` referenced from `config/paxi/datapack_load_order.json`.

| Datapack | Purpose | Audit context |
|----------|---------|---------------|
| `icraft_aethersteel_overrides` | T4 Aethersteel chain ore replacement (aether_debris, aetherslate) | T4 metal chain |
| `icraft_apotheosis_affixes` | Custom Apotheosis affix definitions | 84 JSON affixes ship here |
| `icraft_botania_overrides` | Orechid weight overrides: diamond/deepslate-diamond/ancient-debris/osmium/deepslate-osmium set to 0 | Tier-skip prevention |
| `icraft_dungeon_crawl_overrides` | Dungeon Crawl tier alignment | Loot tier consistency |
| `icraft_loot_overrides` | Global loot table overrides (incl. the Supplementaries ash_blacklist that keeps passive mobs out of ash drops, since the mod's own config toggle is dead code) | Misc loot tuning |
| `icraft_occultism_overrides` | Audit Phase 1 (2026-04-27). 8 miner-recipe overrides: diamond/emerald/arcane_crystal/osmium/nether_quartz/nether_gold/xpetrified_ore moved from the `ores` tag (any miner) to the `deeps` tag (T3+ Afrit/Marid), and dimensional_shard_ore restricted to `master` (T4 Marid only). | P0 fix |
| `icraft_progdiff_overrides` | Progressive Difficulty tuning | Difficulty consistency |
| `icraft_skills` | Pufferfish's Skills tree definitions | 6 skill trees |
| `icraft_terramity_overrides` | Terramity gem ore biome injection (sapphire/topaz/iridium/gaianite into Aether/Twilight/BS) | T2 ore distribution |
| `icraft_tetra_materials` | 27 modded metals + 5 gems for Tetra integration (cataclysm / blue_skies / Undergarden / F&A / theabyss metals; the 4 theabyss entries, garnite / knight / phantom / unorithe, are live because the mod is in the pack) | T2-T4 Tetra entries |
| `icraft_tetra_overrides` | Tetra material stat tweaks | Balance |
| `icraft_tower_overrides` | Towers of the Wild + Apotheosis tome-tower spawn frequency (post-2026-06-06 worldgen rebalance: TOTW `regular` spacing 28 / separation 20; Apoth `tower_main`/`tower_leaf`/`tower_sand`/`tower_spruce` spacing 24 / separation 14-16) | Worldgen tuning |
| `icraft_worldgen_overrides` | Vanilla iron/copper + modded zinc/nickel/silver/lead distribution | Worldgen base |

3rd-party datapacks loaded through Paxi without modification: `ScalingHealth_NoCrystalDrops_AllVanilla`, `Towers_Of_The_Wild_Reworked` + `_v4.2.1_Waystone`, `fix_stone_tags` (revived 2026-06-06), `keepinventory_datapack`. (`infinity_ham_blocker` was deleted on 2026-06-06; the Infinity Ham kill-switch is now config + JEI hide + a strip script instead of a datapack.)

---

## I. KubeJS Script Index

A one-line summary of each file in `kubejs/server_scripts/` and `kubejs/startup_scripts/`. There are ~70 active scripts.

### I.1 Top-level `server_scripts/`

| Script | Role |
|--------|------|
| `0_tick_master.js` | Server-tick master; named `0_` to load first; provides global tick handlers other scripts subscribe to |
| `cap_player_knockback.js` | Caps knockback received by players (LivingKnockBackEvent strength + ratio normalization) |
| `cap_player_levitation.js` | Cancels Levitation effect amp > 5 on Players (defense-in-depth against skyward-launch sources beyond the disabled Apotheosis Shulkers affix) |
| `cherry_spawn_biome.js` | Cherry biome spawn override |
| `codex_delivery.js` | First-join codex book + spell scrolls + starter spell-book delivery (NBT-baked) |
| `death_penalty.js` | Inventory-kept death model + scaled durability damage + items-go-inert-not-broken |
| `diag_empty_display_name.js` / `diag_player_velocity.js` / `diag_player_launch.js` | Diagnostic logging for tester reports. `diag_player_launch.js` is the third-layer launch monitor (MobEffectEvent.Added handler + 4Hz per-tick player Y-velocity scan with effect-list snapshot); it caught the Apotheosis Shulkers Levitation-amp-50 launch (see known-issues tracker 2026-05-04). |
| `disable_zombie_door_break.js` | Suppresses zombie door breaking |
| `dump_items.js` | One-shot JEI item dump for audit purposes (logs to kubejs-server.log with `[ITEM_DUMP]` prefix) |
| `enemyexpansion_explosive_launch_blocker.js` | Suppresses Enemy Expansion explosive launch behavior |
| `fix_empty_display_name.js` | Auto-fix for items with empty display names |
| `icraft_despawn_command.js` | `/icraft_despawn` admin command |
| `icraftsets_command.js` | `/icraftsets` admin command: opens the rpgseteffects Set Equipment Screen (a backup for the broken inventory button) |
| `magic_crit_hook.js` | ISS magic-crit attribute trigger mechanic |
| `mobgriefing_default.js` | Sets mobGriefing=false default for new worlds |
| `more_curios_slots_cap.js` | Caps additional curio slots |
| `mutant_monsters_no_grief.js` / `mutant_monsters_no_griefing.js` | BlockEvents.broken cancellation for mutantmonsters: namespace (mutant zombie pillar-up + mutant creeper explosion bypass mobGriefing) |
| `player_t1_damage_softener.js` | T1-tier damage softener (early-game survival) |
| `spawn_protection.js` | Spawn-area protection enforcement |
| `sunlight_smite.js` | Sunlight Smite: by day, hostile undead under open sky near a player in the Overworld take 2 damage every 10 ticks and burn 2 s; bosses and owned mobs are spared (live since 2026-10-15; it had never damaged a mob before) |
| `tetra_terramity_perks.js` | Server-tick perk hook for Tetra-Terramity integration |
| `ultris_randomizer_janitor.js` | Janitor sweep for stranded Ultris RNG-paper marker items (`{UltrisRandomizerItem:1}` paper that the datapack's same-tick read-then-kill missed under load), preventing them from leaking into the player loot stream |
| `validate_recipe_removals.js` | Audit Phase 3.3. Server-start validator: scans the REMOVAL_TARGETS list against the live item registry and logs warnings for stale IDs |
| `villager_trades.js.disabled` | Villager trade rework (currently disabled; incorporated elsewhere) |

### I.2 `gates/`

| Script | Role |
|--------|------|
| `astages_restrictions.js` | Authoritative stage definitions: stageMod / stageItems / stageDimension / stageOre per tier |
| `milestone_detection.js` | Tier infrastructure only: tier_1 on first join, creative bypass, the lower-tier cascade, the vanilla End advancements on a dragon kill (the old boss-kill tier routes were retired on 2026-06-01) |
| `codex_progression_engine.js` / `codex_boss_rush.js` | The token bank and the boss-rush route (strict ladder since 2026-10-15) |
| `dimension_gates.js.disabled` / `item_gates.js.disabled` | Older AStages-direct integrations; superseded |

### I.3 `recipes/`

| Script | Role |
|--------|------|
| `recipe_audit.js` | Cross-mod tier-skip blocks (Sections A-N): create:mixing, ars:imbuement, mek:enriching/combining/purifying/injecting, F&A clibano, terramity guns/armor, mek tools, theabyss rings + abyss boss armor *(Section K live; TATOS in pack)*, BS dusk_arc / shadow / runic_arc, BS Diopside/Charoite/Horizonite material strip, mech_fusion_anvil. ~67 removals |
| `tier_gated_recipes.js` | Re-recipe overrides for tier-gated workstations (Hephaestus Forge T3, Meka-Tool T4, RFTools dim builders T4, etc.) + Section E Simply Swords removal list (43 entries post-audit-Phase-3.1) |
| `tier_skip.js` | Retired on 2026-06-01 (B.3). The Rift Keystone recipe moved to the Mythic Forge script (I.6), and the boss-material conversions to a recipe script of their own |
| `ad_astra_gating.js` | Ad Astra rocket progression (4-tier) + NASA Workbench T4-gate + 4 MekaSuit Mk2 piece recipes at Mythic Forge |
| `cooking_conversion.js` | 70 vanilla-recipe → Farmer's Delight cooking conversion |
| `if_latex_rework.js` | HDPE / IF latex alternative pipeline |
| `mek_biofuel_squeeze.js` | Biofuel production squeeze: all 101 stock `mekanism:crushing` → `mekanism:bio_fuel` recipes re-issued at `ceil(N / SQUEEZE_FACTOR)` (factor 4, provisional), floored at 1, so ethylene generation scales with automated farming |
| `planetary_extraction.js` | Create Crushing Wheel recipes for planet stones → unique elements |
| `refined_storage_dualpath.js` | Tech-path / Magic-path RS recipes + hybrid bonus |
| `waystone_recipes.js` | Boss-drop-gated Waystone crafting at all tiers |

### I.4 `loot/`

| Script | Role |
|--------|------|
| `lootjs_overhaul.js` | Primary loot orchestrator (~2200 lines): 4 chest pools (T1/T2/T3/T4) + structure-loot tuning + village artifact whitelist + Ars glyph injection + 30+ structure mod loot tuning |
| `loot_overhaul.js` | T2 boss group: TF + BS bosses, plus the Aether bosses (T4 since 2026-10-16), with ISS reagent + Simply Swords allocation (Section 8 master list) |
| `iss_boss_drops.js` | Themed drops for ISS bosses (5 bosses + ISS mob types) |
| `iss_boss_first_kill.js` | First-kill guaranteed ISS drops via persistentData |
| `cataclysm_boss_drops.js` | 8 Cataclysm bosses with ISS reagents + Simply Swords drops |
| `twilight_boss_drops.js` | 8 Twilight bosses with ISS reagents + Simply Swords drops |
| `blue_skies_drops.js` | 4 BS bosses + Runic Arc allocation @ 5% |
| `alexsmobs_drops.js` | 21 Alex's Mobs entities (with mimicream nerf 1%) |
| `stalwart_dungeons_drops.js` | 7 nether mini-bosses with T3 ISS magic synergy |
| `mahou_synergy_drops.js` | 14 cross-mod Mahou reagent injections |
| `dimensional_boss_drops.js` | 11 cross-dimensional bosses (Aether, Deep Aether, Undergarden, Mutant Monsters, Warden) |
| `terramity_boss_drops.js` | Audit Phase 4.1. 7 non-gun terramity EPIC weapons allocated to themed bosses |
| `fragment_core_drops.js` | Monster-gated `EntityEvents.death` handler dropping the rpgseteffects Fragment Core at 4% from hostile mobs only (`!entity.monster` skip; Ultris-excluded). Relocated from `lootjs_overhaul.js` §8.5 because LootJS `LootType.ENTITY` matched every entity loot table (passive animals included), leaking the drop onto pigs |
| `abyss_boss_loot.js` | 8 custom replacement rings (all boss drops) + the boss-drop Unorithe armor set |
| `crop_seed_reduction.js` | Crop seed drop reduction (anti-spam) |
| `planetary_loot.js` | Ad Astra planetary chest loot tuning |
| `diagnose_mob_drops.js` | Diagnostic helper for tester reports |
| `loot_discovery.js.disabled` | Older loot pipeline; superseded |

### I.5 `scaling/`

| Script | Role |
|--------|------|
| `mob_scaling_unified.js` | Static mob-tier HP block (basic 3× / mid 1.5× / elite 1.25×) that stacks on top of the `iridescent_difficulty` mod's dimension multipliers. (The former Champions-dependent dimension-scaling block was retired on 2026-05-03, when `iridescent_difficulty` took over dimension stats.) |
| `boss_hp.js` | Per-boss HP base values (table in Section D.6) |
| `boss_progressive.js` | Per-kill boss scaling, per player (D.6) |
| `dimension_mechanics.js` | Per-dimension scripted mechanics (Aether thin-air, Otherside darkness-empowerment/hexing, theabyss oppressive-darkness/corruption/fear-aura/void-whispers, End multi-zone, Ad Astra atmospheric) |
| `mob_equipment.js` | Mob equipment-spawn handler with an iron-tier cap (paired with Improved Mobs, which was removed on 2026-05-03; verify whether the script still fires or is now dormant) |
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
| `respec/class_respec.js` | `/icraft_respec` command: Class layer only (Origin/Race are permanent) |
| `skills/skill_effects.js` | Pufferfish skill effect handlers + JustLevelingFork bridge |
| `skills/justleveling_skills.js` | Magic skill tree integration |
| `enchantments/enchant_effects.js` | Effect handlers for 25 of the 29 custom enchantments (Warp Shield, Thermal Regulation, Pressure Shell and Void Adaptation are handled in the dimension mechanics script, I.5) |
| `affixes/affix_effects.js` | 65 event-driven Apotheosis affix handlers |
| `food/hunger_management.js` | Hunger Overhaul integration |
| `items/compass_of_return.js` | Compass-of-Return item behavior |
| `pregen/auto_chunky.js` | Chunky pre-generation automation |
| `tags/transmuted_tags.js` | Tag-based recipe alternatives |
| `compat/class_artifacts_recipes.js` | rpgseteffects drops-only recipe strip |
| `compat/disable_creeperlings.js` | Suppresses creeperling spawning |
| `migrations/rift_shard_rename.js` | Audit Phase 2.2. PlayerEvents.loggedIn migration: kubejs:rift_shard → kubejs:icraft_rift_shard for inventory + Ender Chest |
| `abyss/abyss_armor_effects.js` | 7 elemental abyss armor set bonuses |
| `abyss/abyss_ring_effects.js` | Custom abyss ring effect handlers |
| `end/dragon_exploration_gate.js` | End multi-zone scaling + 9 advancement overrides |

### I.10 `startup_scripts/`

| Script | Role |
|--------|------|
| `custom_items.js` | ~50 kubejs:* item registrations (progression tokens, boss materials, intermediate alloys, custom Abyss-themed rings; see E.7) |
| `endgame_items.js` | ~30 endgame kubejs:* registrations (rift_shard, void_fragment, primordial_essence, mythic_forge, mythic_catalysts, planetary materials). The former `kubejs:mekasuit_mk2_*` shell items were retired on 2026-06-06; Mk2 is now an in-place upgrade of the real `mekanism:mekasuit_*` piece (see E.4) |
| `mekasuit_mk2_stats.js` | Startup. Additive pinnacle stat layer for MekaSuit Mk2 via `ItemAttributeRegistry`, applied only to a worn `mekanism:mekasuit_*` piece carrying the `icraft_mekasuit_mk2: 1b` NBT marker. Provisional +2 armor / +1 toughness / +0.05 knockback resistance per piece; never removes a native attribute |
| `custom_enchantments.js` | 29 custom enchantment registrations |
| `iridescent_codex.js` | Patchouli codex setup helpers |
| `mekasuit_mk2_tooltip.js` *(client_scripts/)* | Marker-keyed tooltip: per-id `addAdvanced` line on `mekanism:mekasuit_*` stacks carrying the `icraft_mekasuit_mk2` NBT marker, independent of the recipe-set display Name/Lore |

### I.11 Counts

- ~72 active server scripts across all subdirectories (net +2 on 2026-06-06: +fragment_core_drops, +ultris_randomizer_janitor, +mek_biofuel_squeeze, −diamond_leak_probe deleted).
- 6 startup scripts (custom_items, endgame_items, custom_enchantments, iridescent_codex, mekasuit_mk2_stats, example), plus the new `mekasuit_mk2_tooltip.js` in `client_scripts/`.
- ~12 disabled scripts kept for reference (`*.disabled`).
- 1 migration script (rift_shard_rename, audit Phase 2.2).
- 2 validator scripts: `validate_recipe_removals.js` (server-side) + `tools/validate_datapack_references.sh` (dev-time, outside server_scripts).

---

## K. Character Build Reference

The full numbers for the character system (Origin / Race / Class / Skills), companion to [`master.md` Part VI](master.md#part-vi--player-character).

### K.1 Class HP + equipment scaling

| Class | Archetype | HP modifier | Equipment HP | Damage modifier | Notes |
|-------|-----------|------------:|:------------:|:---------------:|-------|
| Berserker | Melee DPS | -5% | Normal | none | Life-steal sustain |
| Samurai | Melee/Ranged Hybrid | +5% | Normal | none | Way of the Blade synergy (crit + ranged precision) |
| Battlemage | Melee/Magic Hybrid | +5% | Normal | none | Arcane Infusion (melee + spells) |
| Wanderer | Hybrid Multiclass | +5% | Normal | none | Broad-bonus generalist |
| Paladin | Tank/Support/Healer | +10% | Normal | none | Holy Aura + Lay on Hands |
| **Vanguard** | Pure Tank | +20% | Normal | -30% melee damage | Pure damage-soak role |
| **Ranger** | Ranged DPS | -20% | Half | none | Glass cannon |
| **Archmage** | Offensive Caster | -20% | Half | none | Glass cannon |
| Artificer | Crafter / Non-combat | 0% | Normal | none | Crafting + machine specialist |
| **Void Summoner** | Summoner / Necromancer | -10% | Half | none | Glass-cannon-ish; minions tank |

#### Half-equipment-HP explanation

Ranger, Archmage and Void Summoner get 50% effectiveness from all equipment-sourced max HP bonuses:
- Vitality enchantment (half HP per level)
- Max HP affixes (Hearty, Vigorous, Vital; half value)
- Curio HP bonuses (half value)
- Armor attribute modifiers granting HP (half value)

Vanilla armor base values, JustLevelingFork level-up HP, Spice of Life HP and race traits are not affected by the halving; only equipment-sourced bonuses are halved.

#### HP-modifier stacking order

1. Class HP modifier applies first (multiplicative on base 20 HP).
2. Race traits stack additively.
3. JustLevelingFork level-up HP is additive.
4. Spice of Life food HP is additive.
5. Equipment HP halving applies after enchantments/affixes calculate their HP bonus (so the halving is on the post-enchant total).

### K.2 Class passives reference

Each class is defined by 3-5 Origins powers (in `iridescent-origins-mod/.../powers/class/<name>/`) plus tick-based logic in `kubejs/server_scripts/origins/class_passives.js`. The table below lists every active passive per class with its canonical numbers (matched to the wiki overview at `wiki/classes/overview.md`). Most classes have stat-based identities, not weapon-type ones, so the "weapon affinities" approximation that used to be here was misleading.

| Class | Key passives | Tradeoffs |
|-------|-------------|-----------|
| **Berserker** | +15% base melee (Brutal Strikes), Battle Trance (+5% ATK / +1 armor after 10s combat), Thick Skinned (+10% armor), Blood Fury (+20% melee below 40% HP, +40% below 20%) | −5% max HP |
| **Samurai** | +8% speed, +10% atkspd (Bushido), Focus (3s no-attack → next hit +30% damage / +20% crit, Vorpal I-V scaling by tier via `class_passives.js`) | +5% HP only (the "agility tradeoff") |
| **Battlemage** | +10% melee (Arcane Strikes), +15% on every magic hit (the class spell power), +2 armor (Spell Armor), Mana Shield (Resistance I; Resistance II for a Faefolk; gear does not raise it), 1.9× mana pool (190), Arcane Cleave (+1 melee AD per 50% bonus spell power, 10 mana/hit; turns caster damage into hybrid weapon damage) and Mana Reaver (+15 mana per melee kill; sustains the cleave loop in multi-mob fights). Handled by `battlemage_mana_shield.js` + `battlemage_arcane_cleave.js`. | +5% HP |
| **Wanderer** | +5% ATK / speed / atkspd (Jack of All Trades), +10% XP (Wanderlust), Seasoned Traveler (+5% XP and +2.5% speed per unique dimension visited, ticks via `class_passives.js`) | +5% HP |
| **Paladin** | +3 armor / +1 toughness (Holy Armor), +10% KB resist, Healing Aura (allies in 8 blocks regen 0.5 HP/5s; self regens 1 HP/5s above 50% HP) | +10% HP; pure support tank |
| **Vanguard** | +6 armor / +3 toughness (Fortress), +40% KB resist (Immovable), Guardian's Presence (Weakness I to mobs in 5 blocks), −30% melee damage dealt (Pacifist's Burden) | +20% HP; hardest tank in the pack |
| **Ranger** | +15% speed, +10% atkspd (Swift), +20% projectile damage (Eagle Eye), Glass Cannon (−3 armor) | −20% HP, equipment HP halved |
| **Archmage** | +50% magic damage (Arcane Supremacy), -50% melee damage (Frail Melee), Mana Attunement: tier-scaling spell power ticked every 10s (T1: +0%, T2: +5%, T3: +10%, T4: +15%), Mana Reservoir: +150% max mana, a pool of 2.5× baseline (250; `mana_pool_bonuses.js` multiplied it by 1.5 more from 2026-10-10 to 10-17), Frail Frame (−28.6% armor / −20% toughness). No spell-kill mana and no standing-still bonus (the Origins text promised both until 2026-10-17); mana-on-kill moved to Battlemage (cont. 16). | −20% HP, equipment HP halved; the back-loaded glass nuke |
| **Artificer** | +15% mining speed all tools (Crafting Mastery), +10% atkspd (Engineer's Efficiency), Resourceful (+10% bonus drops on ore mining, Speed I near crafting tables, +10% machine processing speed planned for Phase 2) | None (non-combat focus) |
| **Void Summoner** | +15% damage by tamed animals (Pufferfish's tamed damage) and Iron's Spells summons (a hurt handler in `class_passives.js` since 2026-10-17) (Dark Pact), Shadow Cloak (+10% melee damage at light level 9 or lower; no penalty in light), Soul Tether (every non-player death within 16 blocks, in the same dimension: heal 5% of the mob's max health, up to 2, and +1 XP), 8% lifesteal on its own hits (class bonus), Expanded Mana (1.9× mana pool) | −10% HP, equipment HP halved |

#### Magic damage and spell power (no sync)

`puffish_attributes:magic_damage` is set by Origins powers (Archmage's Arcane Supremacy +50%, Faefolk +30%, Elf +5%; the Battlemage's Arcane Strikes is attack damage, not magic) and by the Sorcery tree. Pufferfish's Attributes applies it per hit, at the start of the damage, to every hit whose type is `minecraft:magic`, `minecraft:indirect_magic`, `#c:is_magic` or `#neoforge:is_magic`; Iron's Spellbooks tags all nine school damage types `#neoforge:is_magic`, so it multiplies every Iron's spell. Ars Nouveau's spell damage is tagged only `#forge:is_magic` and is not reached. (The attribute's own value reads NaN: a Pufferfish dynamic attribute.) A bridge in `skill_effects.js` that copied these bonuses onto `irons_spellbooks:spell_power`, believing magic mods ignore the attribute, made each of them count twice on Iron's spells; it was removed 2026-10-17 (it never wrote Ars Nouveau).

#### Mana Attunement tier table (Archmage)

Spell power bonus from Mana Attunement (`irons_spellbooks:spell_power`, multiply_base; one channel since 2026-10-17: it was also put on `puffish_attributes:magic_damage`, so an Iron's spell got it twice, x1.3225 at T4):

| Detected tier | Trigger dimension | Bonus |
|:-:|---|:-:|
| T1 | Overworld | +0% |
| T2 | Twilight Forest / Blue Skies | +5% |
| T3 | Nether / Undergarden / Otherside / Abyss and its Frost World | +10% |
| T4 | End / Aether (since 2026-10-16) / the Ad Astra orbits / the Reality Marble | +15% |

The dimensions and their tiers are the pack's dimension registry (the Otherside and the Abyss counted as T4 here until 2026-10-12; the stage-gate tier, 3, is the rule). The Ad Astra planets themselves are not on this list.

The tier is detected from the highest-tier dimension the player has visited and never goes down: once T4 is reached, the bonus persists. It multiplies with Arcane Supremacy's +50% magic damage (a separate multiplier, together with any race magic damage) and with the class's +25% spell power on magic hits (`class_attribute_bonuses.js` through `attribute_sync.js`).

### K.3 Race tradeoffs

Chosen permanently at character creation. Races have mild tradeoffs, compared with the strong tradeoffs of classes. The benefits and drawbacks below are the powers in `iridescent_origins-1.0.0.jar` (2026-10-18).

| Race | Benefits | Drawbacks | Natural pairing |
|------|----------|-----------|-----------------|
| Human | +10% XP from all sources | None (the "default" race) | Anything (versatile) |
| Elf | Night vision, +8% movement speed, +15% ranged damage, +5% magic damage | -10% armor toughness, extra hunger (a little exhaustion every 10 s) | Ranger, Archmage |
| Dwarf | +15% mining speed, +2 armor toughness, fire damage halved, a moment of Saturation on each block broken | -5% movement speed | Vanguard, Artificer |
| Orc | +20% max health, +10% melee damage, +10% attack speed, Bloodlust (up to +20% attack damage as hunger drops) | Extra hunger (exhaustion every 4 s) | Berserker |
| Halfling | +1 luck, +20% hunger and saturation from food | -5% attack damage | Wanderer, Ranger |
| Revenant (Undead) | Night vision, +20% attack damage at light level 9 or lower or in the Abyss, Resistance I at light level 4 or lower or in the Abyss | Weakness and Slowness in direct sunlight without a helmet, 20% less from food | Void Summoner |
| Faefolk | Slow fall (passive), Nature's Blessing (+30% magic damage, +10% mana regen), Fae Swiftness (+10% speed) | Frail Strikes (-30% melee damage), Ethereal Form (-50% armor toughness on Med/Heavy armor; 4/4 light robes bypass it), Fae Fragility (-15% max HP) | Archmage (best fit: pure caster, full robes); offmeta Battlemage (Arcane Cleave converts spell power to AD, partly offsetting the melee malus) |
| Demi-God | +40% HP (4 hearts), 2× nourishment from raw meat, strength + phase abilities | Fire damage 1.5×, Weakness in the Nether | Berserker, Vanguard, Paladin |
| Ryu | 25% less damage taken, +4 max health, slow fall, heals 1 health every 2 s while the food bar is at 18 or more, Poison, Slowness and Weakness cleared within seconds, Dragon's Sight (nearby creatures glow, 15 s cooldown) | Non-meat food gives half, healing potions half as effective | Paladin, Vanguard, Wanderer |
| Fallen Angel | +15% all damage, permanent Strength I, slow fall, velocity dash | -20% HP (2 hearts), meat preference | Ranger, Archmage, Samurai |
| Kirin | +0.1 movement speed, wall climbing, sprint jump, cat vision, speed boost | -10% HP (1 heart) | Ranger, Wanderer, Samurai |

### K.4 Origin notes

13 origins in total: 9 vanilla rebalanced (Avian, Arachnid, Blazeborn, Elytrian, Enderian, Feline, Merling, Phantom, Shulk) + 4 custom. There are no Human and no Mundane origins, because those collapse to no-tradeoff defaults that undermine the species-fantasy layer.

#### Custom origins (4)

| Origin | Theme | Progression hook |
|--------|-------|------------------|
| **Witch of Ink** | Pure passive hyperscaler: 50% food reduction, 20% less HP, fire weakness. Paint actives were stripped on 2026-03-30 (`58e4834c`); there is no painting consumption mechanic. | Boss-kill counter (max 200): Apotheosis bosses +1, dimensional bosses +10. Per counter: +0.1% TOTAL damage (multiplicative on final damage through LivingHurtEvent, so it affects melee, ranged and all magic) and -0.1% incoming damage (both applied in the mod jar on LivingHurtEvent). Caps at +20% / -20% at counter=200. Capstone (Blessing of Penthesilea, at 200): +10% additive total damage (1.30× at cap) + 15% Spell-Power-to-Attack-Damage conversion (`(SP - 1.0) × 0.15` extra MULTIPLY_BASE damage) + 15% max HP + permanent Haste I, Resistance I, Fire Resistance, Regeneration I (renewed every 2 min). Player command: `/icraft witch_status`. |
| **Artificial Construct** | Machine-themed tech bias: 25% food efficiency; eats iron ingots/blocks for sustenance (Regen III for 10 s on consume). | 5-level iron-consumed ladder at thresholds 1000 / 2000 / 4000 / 8000 / 16000. Per-level bonuses (cumulative MULTIPLY_BASE on max_health + attack_damage; ADD_VALUE × 4 on armor + armor_toughness): +5% (L1) → +10% (L2) → +15% (L3) → +25% (L4) → +35% (L5). Capstone (Iron Apotheosis, unlocked at L5): +25% MULTIPLY_BASE HP + +25% MULTIPLY_BASE melee damage + +1.0 ADD_VALUE armor toughness on top of the L5 totals. Player command: `/icraft construct_status`. |
| **Witherborn** | Undead aesthetic + Wither immunity | Undead-aligned bonuses; pairs with Void Summoner |
| **Slimebodied** | Slime physics + bouncing combat | Bouncy-mobility + slime-combo identity |

> Origin design rules: no lethal effects; food preferences, not restrictions; Elytra flight is reserved for the Elytrian; each heart = 5% HP.

### K.5 Skill tree framework

Pufferfish's Skills: six trees, each capped at level 40, with ~180 nodes in total.

| Tree | XP source | Per-level points | Level cap |
|------|-----------|:----------------:|:---------:|
| **Warfare** | Melee kills | 1 | 40 |
| **Marksman** | Ranged kills (bow / crossbow / thrown) | 1 | 40 |
| **Sorcery** | Spell casts (ISS, Ars, Mahou) + magic kills | 1 | 40 |
| **Fortitude** | Damage taken (XP scales with damage amount) | 1 | 40 |
| **Gathering** | Mining ore, chopping logs, harvesting crops, fishing | 1 | 40 |
| **Engineering** | Crafting, operating machines, smelting | 1 | 40 |

XP curve per tree: 50 XP for level 1, ~500 XP by level 25, ~2000 XP by level 40.

Anti-farming: Pufferfish's Unofficial Additions reduces the XP from repeated identical actions over time (killing the same mob type again and again gives less XP per kill each time), which encourages variety.

#### Tree layout

Each tree uses a branching layout: 8-node Trunk (shared) → 2-way Split → Branch A / Branch B (specialized paths) → Capstone (deep-investment payoff requiring ~12 to 15 points in that branch).

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

Players can invest in the Trunk without committing to a Branch, but the Branches give the best return per point.

### K.6 Per-tree breakdown

#### K.6.1 Warfare (XP: melee kills)

**Trunk (8 nodes, +1 each):** Brute Force I/II (+5% melee dmg each), Iron Grip I/II (+5% attack speed each), Thick Hide I/II (+4% melee resistance each), Vigor I/II (+2 max HP each).
**Trunk total at 8 pts:** +10% melee damage, +10% attack speed, +8% melee resistance, +4 max HP.

**Branch A: Berserker's Path (Sustained DPS).** Focus: raw damage output, attack speed, life-on-hit. Synergizes with Berserker, Samurai, Battlemage. Capstone: ~+15% melee + life steal.

**Branch B: Duelist's Path (Precision).** Focus: critical hits, weapon mastery. Synergizes with Samurai (crit scaling). Capstone: crit chance + crit damage payoff.

#### K.6.2 Marksman (XP: ranged kills)

**Trunk (8 nodes):** ranged damage, draw speed, accuracy, movement speed.
**Trunk total:** +10% ranged damage, +10% draw speed, +6% accuracy, +8% movement speed.

**Branch A: Sniper's Path (Single Target).** Steady Shot stacking, Penetration (resistance shred), Kill Shot (low-HP execution). Capstone: Deadeye (+15% ranged dmg, +8% resistance shred). Branch A total: +47% ranged dmg, +20% shred, +20% bonus to low-HP targets.

**Branch B: Volley Path (AoE / Speed).** Rapid Fire stacking, multi-target, arrow economy. Synergizes with Ranger Rain of Arrows + Void Summoner crossbow.

#### K.6.3 Sorcery (XP: spell casts + magic kills)

**Trunk (8 nodes):** magic damage, mana regen, cast speed, magic resistance.
**Trunk total:** +10% magic damage, +10% mana regen, +6% cast speed, +8% magic resistance.

**Branch A: Destruction Path (Raw Spell Power).** Direct-damage spell scaling. Pairs with Archmage, Battlemage.

**Branch B: Enchanter's Path (Utility Magic / Summoning).** Healing, buffs, summon strength. Pairs with Paladin, Void Summoner.

#### K.6.4 Fortitude (XP: damage taken)

**Trunk (8 nodes):** HP, all-resistance, healing received, knockback resistance.
**Trunk total:** +8 max HP, +8% all resistance, +10% healing received, +30% knockback resistance.

**Branch A: Iron Wall (Tank HP + Armor).** Pure damage-soak progression. Pairs with Vanguard, Paladin.

**Branch B: Survivor's Path (Sustain & Recovery).** Regen, lifesteal-from-defense, comeback mechanics.

#### K.6.5 Gathering (XP: mining, chopping, harvesting, fishing)

**Trunk (8 nodes):** mining speed, breaking speed, crop yield, fortune.
**Trunk total:** +10% mining speed, +10% breaking speed, +10% crop yield, +0.6 fortune.

**Branch A: Prospector's Path (Mining).** Ore yield, ore vein detection, deeper-strata bonuses.

**Branch B: Harvester's Path (Farming & Fishing).** Crop multipliers, fishing rare chances.

#### K.6.6 Engineering (XP: crafting + machines + smelting)

**Trunk (8 nodes):** crafting speed, material save, machine speed, durability.
**Trunk total:** +10% crafting speed, +6% material save, +10% machine speed, -10% durability loss.

**Branch A: Artificer's Path (Crafting Quality).** Higher-rarity crafting, refined output, quality-of-craft bonuses.

**Branch B: Engineer's Path (Machines & Automation).** Machine throughput, RF efficiency, smelting bonuses.

### K.7 Class → tree affinity (recommended)

| Class | Primary tree | Secondary | Tertiary | Reasoning |
|-------|--------------|-----------|----------|-----------|
| Berserker | Warfare (Branch A: Berserker's) | Fortitude (Branch B: Survivor's) | none | Life-steal + sustain = unkillable in sustained fights |
| Samurai | Warfare (Branch B: Duelist's) | Marksman (Branch A: Sniper's) | none | Crit scaling + ranged precision = Way of the Blade synergy |
| Battlemage | Warfare (trunk) | Sorcery (Branch A: Destruction) | none | Moderate melee + strong spells = Arcane Infusion fuel |
| Wanderer | Any trunk × 3 to 4 | none | none | Generalist wants broad moderate bonuses |
| Paladin | Fortitude (Branch A: Iron Wall) | Sorcery (Branch B: Enchanter's) | none | Tank HP + healing effectiveness = Holy Aura + Lay on Hands |
| Vanguard | Fortitude (Branch A: Iron Wall) | Warfare (trunk) | none | Maximum HP + some melee to offset the -30% melee damage penalty |
| Ranger | Marksman (Branch A: Sniper's) | Gathering (trunk) | none | Max ranged damage + fortune for resource runs |
| Archmage | Sorcery (Branch A: Destruction) | Marksman (trunk) | none | Deep spell power + ranged utility |
| Artificer | Engineering (Branch A: Artificer's) | Gathering (Branch B: Harvester's) | none | Crafting quality + farming/fishing supply |
| Void Summoner | Sorcery (Branch B: Enchanter's) | Fortitude (Branch B: Survivor's) | none | Summoning depth + sustain to keep summons alive |

Wanderer is the only class without a clear primary tree, by design. The class is built for hybrid playstyles, so spreading across 3 to 4 trunks is the best strategy.

### K.8 Respec rules

| Layer | Respec? | Cost | Where |
|-------|---------|------|-------|
| Origin | Permanent | n/a | n/a |
| Race | Permanent | n/a | n/a |
| Class | Yes | 1 tier-appropriate boss drop + 30 XP levels | Class Altar (custom block) |
| Skill point | Not available (designed: per point, 5 XP levels) | n/a | the Class Altar's skill trigger answers "not available yet" and takes nothing |

#### Death + skill interactions

- Skill points are not lost on death. Skills are permanent growth and never at risk.
- Skill points are not lost on a Class respec. A Berserker with 30 Warfare points who switches to Paladin keeps those points (suboptimal for Paladin but still functional). A skill-point respec is not available (K.8 above).

This leaves room for hybrid builds without forcing a full reset on every class switch.

#### Class Altar mechanics

A custom block made with KubeJS. Recipe: tier-appropriate boss material + crafting station. On use it consumes 1 boss drop + 30 levels and opens the class selection screen. It can be placed and shared (multiplayer convenience).

### K.9 Reforging progression

Apotheosis-style affix rerolling, gated by reforging-tier tokens (boss drops).
The workstations themselves are ungated (T1-accessible per the 2026-05-14 design call);
the tokens are the gate.

| Tier | Requirement | Behavior |
|------|-------------|----------|
| **Basic** | T2 progression token | Reroll affixes (random outcome) |
| **Advanced** | T3 token + expensive materials | Reroll with weighted odds toward desired type |
| **Ultimate** | T4 token + Gaia ingots (antimatter reroll wiring tabled long-term) | Reroll with guaranteed minimum rarity |

Rerolls happen at three Apotheosis workstations (Reforging Table → Advanced
→ Augmenting Table). Tokens drop from tier-appropriate bosses. All three
workstations are craftable from T1.

The rarity ladder (D.1) is the second gate. Even with tokens, a player in the
Overworld can't reroll above Rare, one in Twilight/Blue Skies can't reroll above Epic,
and so on. Token and dimension together form the gate; workstation crafting is free.

### K.10 Implementation notes

- Class definitions: Origins datapacks (fully customizable).
- Class attribute modifiers: through Apothic Attributes.
- Class active abilities: Origins power system (cooldown-based keybind).
- Class weapon affinities: Origins item-conditional attribute modifiers ("when holding item with tag X").
- Half-equipment-HP: overrides max_health attribute contributions from equipment slots with a 0.5 multiplier for affected classes.
- Race system: a separate Origins layer (Iridescent Origins).
- Race environmental effects: Origins conditions.
- Race size modification: Pehkui integration where applicable.
- Class Altar: KubeJS custom block + script.
- Skill trees: Pufferfish's Skills datapack (`icraft_skills`).

---

## L. Iridescent Reforging Honing System

Added 2026-05-14. Two parallel hone systems share the same Tetra workbench
infrastructure, with different values and paths.

### L.1 Wand honing (multi-option)

Each of the 4 wand modules has 3 mutually exclusive hone paths. Applying
level 1 of any path locks out the other two paths for that module (through
`tetra:not` requirements on each schematic). Each path has 5 levels. Total:
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
Minor slots (linings/pauldrons/trim/etc.) are not honable in v1: Tetra's
requirement types only test the target module, so cross-slot archetype
gating on minors needs a custom Java requirement (deferred).

The gate is a synthetic `tetra:armor/<archetype>_hone/` improvement type declared
on each major-slot module; a `tetra:accepts_improvement` requirement on the
hone schematic gates by archetype.

| Archetype | Chestplate | Helmet | Boots | Leggings |
|-----------|------------|--------|-------|----------|
| **Warrior** | Armor (big, +2..+6) | Armor | Armor | Armor |
| **Balanced** | Armor (modest, +1..+5) | Armor | Movement Speed | Armor |
| **Rogue** | Attack Damage | Arrow Damage | Movement Speed | Movement Speed |
| **Mage** | Spell Power | Spell Power | Cooldown Reduction | Max Mana |

5 levels each, with the same tool gate ladder as the wand. Total: 4 × 4 × 5 = 80 schematics + 16 improvement files.

### L.3 Tetra MULTIPLY_BASE display rule

**ISS percent attributes on Tetra modular items MUST use the `**` prefix
(MULTIPLY_TOTAL)**, not `*` (MULTIPLY_BASE). Tetra's `AttributeHelper.collapse()`
math drops MULTIPLY_BASE modifiers to 0 when no ADDITION sibling exists on the
same attribute, so those stats silently disappear from tooltips.

Hard rule: any new module variant or improvement file targeting a percent
attribute (spell_power, mana_regen, cooldown_reduction, cast_time_reduction,
spell_resist, school SP, summon_damage) gets the `**` prefix.

Stacking effect: MULTIPLY_TOTAL compounds across modules (MULTIPLY_BASE is close to
additive). At small per-module values (5-10%) the difference is < 5%;
at high stacks it compounds noticeably. This matches the mage glass-cannon
design intent of uncapped multiplicative stacking.

---

## M. ISS + Ars Nouveau Cross-Mod Integration

Added 2026-05-14, restructured 2026-05-15. Design intent: "mana regen and
mana are universal", so sources that boost one system's mana should affect
the other equivalently.

### M.1 Unified mana pool via ManaCap mixin (replaces the 2026-05-14 bridge)

Architecture: a mixin redirects Ars's `IManaCap` to the ISS pool.
There is one source of truth (ISS) and one visible bar (ISS HUD).

| Ars method | Redirect target |
|------------|-----------------|
| `getCurrentMana()` | `MagicData.getPlayerMagicData(le).getMana()` |
| `getMaxMana()` | `le.getAttributeValue(AttributeRegistry.MAX_MANA.get())` |
| `removeMana(cost)` | `MagicData.setMana(mana - cost / 2.0)` (half-cost discount) |
| `addMana(_)` / `setMana(_)` / `setMaxMana(_)` | no-op (ISS owns regen + state) |
| `getGlyphBonus` / `setGlyphBonus` / `getBookTier` / `setBookTier` | unchanged (Ars caster progression metadata) |

Cost model: Ars spells deduct half their displayed cost from the ISS
pool. `/2` was settled on after two playtest iterations:
- 2026-05-15 initial: `/3` discount. It felt invisible; small Ars spells barely moved the bar.
- 2026-05-15 v2: 1:1 (no discount). It felt prohibitive: ~50 mana per cast burned the pool in 2-3 casts.
- 2026-05-15 v3 (shipped): `/2`, the middle ground. Ars stays "reliable spammable" next to ISS's "high-impact" spells, while a single cast still visibly dents the bar.

### M.1a Magic class mana-pool boost

Since 2026-10-17 the three magic classes' pools come from their Origins
powers alone (multiply_base on `irons_spellbooks:max_mana`), from a base of 100:
- Archmage: 250 (Mana Reservoir, +1.5)
- Battlemage: 190 (+0.9)
- Void Summoner: 190 (+0.9)

`kubejs/server_scripts/attributes/mana_pool_bonuses.js` no longer boosts them.
From 2026-05-15 it put a transient MULTIPLY_TOTAL +0.5 (1.5×) on the same
attribute for these classes. Its class check first worked in 2026-10, and from
10-10 the two multiplied (Archmage 375, Battlemage and Void Summoner 285) until
the script's x1.5 was dropped on 2026-10-17. The buff was applied with
`addTransientModifier` (not `addPermanentModifier`), so it was never saved in
player NBT, and the restart that deployed the change took it off everyone. This
is the lesson of the two earlier cleanup-after-revert cycles (legacy
`mana_pool_bonuses` 2026-04-25 and `mana_bridge` 2026-05-14).

What the script still does: it scrubs the legacy 8 UUIDs (4 from the
2026-04-25 layered pool buff + 4 from the 2026-05-14 attribute-mirror bridge)
once per player, at login, because those were permanent modifiers saved in
player NBT.

HUD: `ArsGuiManaHudMixin` injects on `GuiManaHUD.shouldDisplayBar` and
always returns false. Otherwise the Ars bar would duplicate the ISS
bar (both read the same pool).

Mixin location: `iridescent-tetra-expansion-mod` mixin package
`com.iridescentcraft.reforging.mixin`, classes `ArsManaCapMixin` (common
bus) and `ArsGuiManaHudMixin` (client bus).

Items granting Ars perk attributes: all `ars_nouveau:ars_nouveau.perk.*`
references in our codebase were migrated to `irons_spellbooks:*` on
2026-05-15. The Ars perk attributes still exist on the player (Ars registers
them through `EntityAttributeModificationEvent`) but are now decorative: nothing
in our codebase grants them, and the cap reads ISS whatever their
value. `HidePerkTooltips` still hides those attributes on tooltips
if anything else ever applies them.

Predecessor: the original 2026-05-14 bridge (`mana_bridge.js`, a
1Hz tick mirroring `irons_spellbooks:max_mana` <-> `ars_nouveau.perk.max_mana`
modifiers between the two attributes) was deleted in the 2026-05-15 unified
pool migration. The cap mixin is cleaner: it has no tick overhead, no
double-counting risk and no MULTIPLY_BASE collapse-to-zero on the Ars side
(which would have happened because the Ars perk attribute has base=0).

### M.2 ISS school SP → Ars elemental damage

Two handlers boost Ars elemental glyph damage by the
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

Anti-double-count: the SpellDamageEvent handler skips damage types in the
LivingHurtEvent map, so the two handlers never both apply.

Remaining gap: damage from Ars-spawned entities after the spell context drops
(delayed lightning from EffectLightning, on_fire ticks from EffectIgnite)
doesn't carry SpellDamageEvent context. Known and deferred (it would need an
NBT-tag-on-cast pattern).

### M.3 ISS Apotheosis gems (buffed values, repurposed spell_resist)

ISS ships 13 Apotheosis-compatible gems under the namespace `irons_spellbooks`
(loaded as `data/irons_spellbooks/gems/*.json`). Their native values were all
weak (1/3/5/7/10/15% MULTIPLY_TOTAL flat). The Paxi datapack
`icraft_iss_gem_buffs` overrides them:

| Gem set | Values (Common / Uncommon / Rare / Epic / Mythic / Ancient) |
|---------|-------------------------------------------------------------|
| 8 school SP + summoning | 6-8 / 9-13 / 15-21 / 23-31 / 33-43 / 45-60% |
| cast_time / cooldown | 5-7 / 8-11 / 12-17 / 18-25 / 26-35 / 34-45% |
| **spell_resist (REPURPOSED as generic SP)** | 3-5 / 6-9 / 8-12 / 13-17 / 18-23 / 24-30% |
| intelligent: max_mana | flat 5-14 / 15-29 / 30-49 / 50-79 / 80-119 / 120-180 |
| intelligent: mana_regen | 3-5 / 6-9 / 8-12 / 13-17 / 18-23 / 24-30% (MULTIPLY_BASE) |

All gems have `steps`/`step` ranges per rarity, so rolls vary within a tier
(native ISS gems had no variance). The spell_resist filename is kept so ISS's
bundled model/texture/lang hooks line up; a KubeJS lang override renames the display
to "Gem of Arcane Affinity".

### M.4 Tier-gated Sigils of Socketing + elemental Apotheosis gems → school SP

Added 2026-05-18. Two linked changes that together open Apotheosis socketing to caster builds across the tier ladder.

Tier-gated Sigil of Socketing: four sigils, each with a different socket cap:

| Sigil | Item ID | Socket cap | AStages gate | Recipe gate |
|-------|---------|-----------:|--------------|-------------|
| T1 | `icraft:sigil_of_socketing_t1` | 2 | tier_1 (default) | gem_dust + gem_fused_slate + iron_ingot |
| T2 | `icraft:sigil_of_socketing_t2` | 3 | tier_2 | gem_dust + gem_fused_slate + emerald |
| T3 | `icraft:sigil_of_socketing_t3` | 4 | tier_3 | gem_dust + gem_fused_slate + diamond |
| T4 (vanilla) | `apotheosis:sigil_of_socketing` | 5 | tier_4 | gem_dust + gem_fused_slate + amethyst + echo_shard (replaces vanilla dragon_breath) |

The vanilla Apotheosis recipe was originally gated by `minecraft:dragon_breath`, which required an Ender Dragon fight before any socketing was possible. The new gate uses `minecraft:echo_shard` (Ancient City, Deep Dark), so a player can reach socketing in early T4 without fighting the dragon. Each recipe yields 3 sigils (matching the vanilla ratio).

Use mechanic: with the sigil in the main hand and the gear in the off hand, right-click. If the gear has fewer sockets than the tier cap, the count goes up by 1 and the sigil is consumed; otherwise nothing happens and a chat message explains the cap. Implementation: `kubejs/server_scripts/sigil_socket_handler.js`, which edits the NBT at `affix_data.sockets` directly (CompoundTag API, following the `apotheosis_gem_repair.js` pattern). The vanilla smithing-table path still works for the Apotheosis sigil.

Elemental gems → school spell power: 11 of Apotheosis's 21 gems have a clear elemental flavor and now grant an ISS school-specific `*_spell_power` when socketed into a magic weapon (wands + staves only: items in the `#icraft:magic_weapon` tag). The datapack overrides are at `icraft_loot_overrides/data/apotheosis/gems/*.json`. All 11 carry a bonus on `gem_class.key = "magic_weapon"` (types `["magic_weapon"]`). The canonical sword/trident bonuses on these gems are unchanged, so socketing into a sword still gives the canonical effect.

> **Scope note (2026-05-18 evening):** the tag covers only *main-hand cast-when-held* items, not off-hand spellbook containers. ISS *spellbooks* (the 32 `irons_spellbooks:*_spell_book` items + iridescent_modular_spells variants) are deliberately excluded, since they are curio/off-hand containers and not weapons. The tag holds 26 items: the Tetra-modular `iridescent_reforging:reforged_wand`, the 5 ISS staves (blood/graybeard/ice/pyrium/staff_of_the_nines), Dan's Magic's 5 T1 element staves (`dna:*_staff`), and Simple Staves' 15 wands (6 tier + 9 element). Mahou Tsukai's T4 ritual weapons are deferred; add them to the tag once their progression is settled.

> **The collision problem and how we solved it.** Apotheosis builds a `Map<LootCategory, GemBonus>` per gem with `Collectors.toMap` (the two-argument form, which throws on duplicate keys). The map is keyed by LootCategory (e.g., `SWORD`, `TRIDENT`, `HEAVY_WEAPON`), not by `gem_class.key`. A gem JSON that adds a second bonus whose `gem_class.types` overlap an existing bonus's types fails to deserialize entirely: the gem disappears from the registry, and existing in-world stacks render as "Errored gem" with the fallback lang key `item.apotheosis.gem`.
>
> Our first attempt (2026-05-18 morning) typed 32 spellbooks as `sword` through Apotheosis's `Equipment Type Overrides` config (Path A), then added per-school spell-power bonuses on `gem_class.key = "light_weapon"` (types `["sword","trident"]`) to each elemental gem. This collided for 6 of the 11 gems (earth, inferno, forest, splendor, endersurge, queen), because their canonical bonuses already cover sword or trident:
>
> - earth: `melee_weapon ["sword","trident","heavy_weapon"]` → sharpness enchantment
> - inferno: `light_weapon ["sword","trident"]` → detonation mob_effect
> - forest: `weapon ["heavy_weapon","sword","trident","bow","crossbow"]` → twilight_treasure_goblin
> - splendor: `weapon_or_tool ["sword","trident","bow","crossbow","heavy_weapon","shovel","pickaxe"]` → xp_gained attribute
> - endersurge: `anything [all 12 categories]` → global enchantment
> - queen: `ranged_weapon ["bow","crossbow","trident"]` → frosted mob_effect (trident collision only)
>
> The Path B fix (2026-05-18 afternoon) replaced Path A entirely:
>
> 1. A new `LootCategory.magic_weapon` is registered at runtime by `kubejs/startup_scripts/magic_weapon_category.js` via `LootCategory.register(null, "magic_weapon", predicate, [MAINHAND, OFFHAND])`. The predicate checks `ItemStack.is(TagKey<Item>(icraft:magic_weapon))`. `LootCategory.BY_ID` is `Collections.unmodifiableMap(BY_ID_INTERNAL)` per the jar's static init, so late additions via `register()` are visible to Apotheosis's gem-JSON codec at datapack-reload time (verified by bytecode inspection on Apotheosis-1.20.1-7.4.8.jar).
> 2. The `#icraft:magic_weapon` item tag (`kubejs/data/icraft/tags/items/magic_weapon.json`) listed the 32 spellbook IDs that were previously aliased as `sword`; the same evening it was replaced by 26 wands and staves (see the scope note above). Tag membership controls LootCategory membership.
> 3. All 11 gem overrides use `gem_class: { key: "magic_weapon", types: ["magic_weapon"] }` for the spell-power bonus. There is no collision, because no canonical gem references `magic_weapon`.
> 4. The 4 multi_attribute merges (solar / lunar / guardian / blood_lord) were reverted to the canonical single-attribute form on `light_weapon`. Spell power lives on the new `magic_weapon` bonus instead.
> 5. The 31 `|sword` lines in `config/apotheosis/adventure.cfg`'s `Equipment Type Overrides` were removed (spellbooks no longer need to be typed as swords).
> 6. Lang entries `text.apotheosis.category.magic_weapon` / `.plural` were added in `kubejs/assets/apotheosis/lang/en_us.json`.

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
| tyrannical | core | Eldritch | `irons_spellbooks:eldritch_spell_power` (moved from Guardian on 2026-05-19; tyranny + cosmic dread is a closer fit) |
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

The ratio is intentional: ISS school gems are universal (they work for any school the player casts), while Apotheosis elemental gems are specialized (locked to one school). A specialized gem is stronger; a universal gem is more flexible. The 2026-05-18 bump (commit pending) shifted the curve up, because the initial 5%/10%/.../80% collided with the ISS values at low rarities and defeated the specialization gradient.

Existing gem bonuses (e.g., Solar's `fire_damage`, `gravity`, `step_height`) are unchanged from the canonical Apotheosis data. The spell-power bonus is purely additive, on a new `magic_weapon` LootCategory: socketing one of these gems into a sword gives the canonical bonus, and socketing it into a wand or staff (the items of the magic-weapon tag) gives the spell-power bonus. Martial-only gems (ballast, brawlers, breach, combatant, samurai, slipstream, warlord, royalty) are untouched. Mageslayer is skipped by design (its anti-magic flavor points the other way).

`magic_weapon` LootCategory (Path B, 2026-05-18 afternoon): registered at runtime by `kubejs/startup_scripts/magic_weapon_category.js`. Membership: items in the `#icraft:magic_weapon` item tag. Slots: MAINHAND + OFFHAND. The startup script is idempotent (a re-run does nothing, through a `LootCategory.byId('magic_weapon') != null` guard).

Items in `#icraft:magic_weapon` (26 in total, wands + staves only; corrected 2026-05-18 evening, since the earlier 32-spellbook list was off-design):

- `iridescent_reforging:reforged_wand`: Tetra-modular wand (core/cap/handle/inlay slots, see §L.1)
- ISS staves (5): `irons_spellbooks:blood_staff` / `graybeard_staff` / `ice_staff` / `pyrium_staff` / `staff_of_the_nines`
- Dan's Magic T1 staves (5): `dna:ice_staff` / `lightning_staff` / `magma_staff` / `toxic_staff` / `tnt_staff`
- Simple Staves tier wands (6): `simple_staves:woodenwand` / `stone_wand` / `iron_wand` / `gold_wand` / `diamond_wand` / `netherite_wand`
- Simple Staves element wands (9): `flame_wand` / `wind_essence_wand` / `thunder_wand` / `venomite_wand` / `viritium_wand` / `veil_wand` / `void_wand` / `tenebrium_wand` / `explosion_wand`

ISS *spellbooks* (off-hand curio containers, distinct from staves) are deliberately excluded: they hold spells but are not main-hand cast weapons. Ars Nouveau spell books are excluded too (they use the Source/perk system, not ISS spell_power). Mahou Tsukai T4 ritual weapons are deferred. Adding new items to the tag (e.g., Forbidden Arcanus arcane wands) is a single-line edit to the tag JSON and needs no other plumbing.

Path A → Path B switch rationale: Path A (TYPE_OVERRIDES alias to `sword`) was first chosen because it cost the least engineering, but it (a) couldn't tell spellbooks from swords in gem design, and (b) collided for 6 of the 11 gems when we tried to add per-school spell-power bonuses on the `light_weapon` key. The Path B fix (a tiny KubeJS startup script + an item tag + one lang file) removes both problems, and future gem additions get a dedicated mage slot with no collision risk.

---

## J. Bytecode Patches

A summary that is safe to publish. The full re-apply checklist is in [`wiki/protocols/8-client-sync.md`](../protocols/8-client-sync.md); the deeper technical detail (the actual bytecode delta) is in the private internal repo.

Two custom-bundled JARs ship with bytecode-level modifications:

| JAR | Patch | Purpose | Required JVM arg |
|-----|-------|---------|------------------|
| `Patchouli-1.20.1-85-FORGE.jar` | `athrow → pop` in `Book.class` | Disables resource-pack enforcement on the codex book (we ship our own resource-pack-independent codex) | `-noverify` |
| `ars_nouveau-1.20.1-4.12.7-all.jar` | `doApply → immediate return` in `DungeonLootEnhancerModifier.class` | Disables Ars Nouveau's automatic chest-loot injection (would override our curated chest pools) | `-noverify` |

Both patches create dead code paths the JVM verifier rejects, so `-noverify` is **required** on both server and client.

- Server: already in the `iridescentserver.bat` JVM args.
- Client: must be added by hand in PrismLauncher → Instance → Settings → Java → JVM arguments → `-noverify`.

Per the "Custom Bundled JARs" section of CLAUDE.md and the protocol checklist, when either jar is updated through packwiz/Modrinth/CurseForge, the patches must be re-applied to the new version. Reviewers must check this before merging mod updates that touch these jars.

## N. Marquee Structures

The marquee-structure roster and each structure's themed pool, which pair with the canonical four-pool dimensional baseline in [master.md Part XIII §The four chest pools](master.md#part-xiii--loot-economy). Added 2026-05-17.

### N.1 Roster

15 marquee structures across the four tiers. Each gets a themed pool set at ~70% of the tier's combined rate, layered on top of the dimensional baseline (which fires at the full tier rate everywhere, marquees included). The combined per-chest artifact rate at marquees is therefore ~1.7× the tier rate (~17% T1, ~20% T2, ~24% T3, ~27% T4); generic chests stay at the tier rate (~10/12/14/16%).

Implementation note: LootJS 2.13.1's filter API supports `anyDimension`/`anyStructure`/`anyBiome` but not loot-table-based exclusion, so the strict model (reduce the dimensional pool at marquees only) can't be done cleanly without mapping structure IDs per marquee for every mod. The layered model is the practical alternative, and it also rewards intentional exploration with drops that are both more frequent and more thematic, which fits the player-intentional design criterion.

| Tier | Marquee structure | Theme | Loot table ID(s) |
|------|-------------------|-------|------------------|
| T1 | Apotheosis tome_tower | Magic | `apotheosis:chests/tome_tower` |
| T1 | TotW Reworked tower | Magic | `totw_reworked:tower_chest` |
| T1 | TotW Reworked ocean tower | Magic | `totw_reworked:ocean_tower_chest` |
| T1 | Structory towers | Generic exploration | `structory_towers:top/*`: the chest at the top of each tower, Overworld towers only |
| T1 | Aquatic ruins | Aquatic | `minecraft:chests/buried_treasure`, `minecraft:chests/underwater_ruin_big`, `minecraft:chests/underwater_ruin_small` |
| T1 | Woodland Mansion | Illager / dark | `minecraft:chests/woodland_mansion` |
| T1 | Stronghold | Ancient / eldritch | `minecraft:chests/stronghold_corridor`, `minecraft:chests/stronghold_crossing`, `minecraft:chests/stronghold_library` |
| T2 | Twilight Lich Tower | Eldritch | `twilightforest:chests/tower_room`, `twilightforest:chests/tower_library` |
| T2 | Blue Skies dungeons | Elemental | blue_skies dungeon tables (TBD exact IDs) |
| T3 | Nether Fortress | Fire / blaze | `minecraft:chests/nether_bridge` |
| T3 | Bastion Remnant | Piglin / gold | `minecraft:chests/bastion_treasure`, `minecraft:chests/bastion_hoglin_stable`, `minecraft:chests/bastion_bridge`, `minecraft:chests/bastion_other` |
| T3 | Undergarden catacombs | Underdark | `undergarden:chests/catacombs` |
| T4 | End City | End / levitation | `minecraft:chests/end_city_treasure` |
| T4 | Ancient City | Sculk / echo | `minecraft:chests/ancient_city`, `minecraft:chests/ancient_city_ice_box` |
| T4 (T2 until 2026-10-16) | Aether dungeons | Sky / cloud | aether boss-dungeon tables (TBD exact IDs) |

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
<!-- Abyssal theme row removed 2026-05-28 (#47): consumer was the absent The Abyss marquees row at N.1; original entry was "Abyssal | Abyss-tier dark / corruption | Chorus inhibitor, twisted heart, abyss core, cursed totems". If a future operator pass reassigns the 14-item curated pool (see T4 Abyssal item list below) to a different T4 structure, restore this row retargeted there. 2026-10-11: the pool went to the three Abyss bosses (C.11), not to a structure, so this row stays out. -->

### N.3 Per-structure themed pools (T1)

**T1 Magic**: used by `tome_tower`, `totw_reworked:tower_chest`, `totw_reworked:ocean_tower_chest` (15 items, ~7% combined):

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

**T1 Generic exploration**: used by Structory towers (15 items):

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

**T1 Aquatic**: used by buried_treasure + underwater_ruin tables (12 items + 2% ISS cap):

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

**T1 Illager / dark**: used by `woodland_mansion` (14 items + 2% ISS cap):

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

**T1 Ancient / eldritch**: used by stronghold tables (15 items + 2% ISS cap):

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

**T2 Eldritch**: Twilight Lich Tower (14 items, ~8.4% combined):

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

**T2 Elemental**: Blue Skies dungeons (12 items):

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

**T3 Fire / blaze**: `minecraft:chests/nether_bridge` (12 items, ~9.8% combined):

```
relics:blazing_flask                   relics:magma_walker
moreartifacts:fire_stone               moreartifacts:blazing_treads
moreartifacts:molten_quiver            moreartifacts:obsidian_shield
artifacts:obsidian_skull               artifacts:fire_gauntlet
celestial_artifacts:nether_fire        moreartifacts:gilded_scarf
ars_nouveau:archmage_spell_book        irons_spellbooks:rare_ink
```

**T3 Piglin / gold**: bastion tables (12 items):

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

**T3 Underdark**: Undergarden catacombs (13 items):

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

**T4 End / levitation**: `minecraft:chests/end_city_treasure` (13 items, ~11.2% combined):

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

**T4 Sculk / echo**: Ancient City tables (13 items):

```
moreartifacts:sculk_lens               moreartifacts:sculk_shades
moreartifacts:sculk_treads             moreartifacts:shulker_heart
moreartifacts:shulked_clock            moreartifacts:echo_glove
celestial_artifacts:soul_box           celestial_artifacts:lock_of_abyss
celestial_artifacts:cursed_totem       celestial_artifacts:twisted_heart
relics:wool_mitten                     relics:shadow_glaive
artifacts:scarf_of_invisibility
```

**T4 Sky / cloud**: Aether dungeons (12 items; a T2 pool until 2026-10-16, same items, now at the T4 rate):

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

**Abyssal pool: Abyss boss drops since 2026-10-11** *(this list was written for an Abyss chest marquee that could never exist, because The Abyss has no chest that rolls a loot table. Its twelve Celestial Artifacts now drop from Elder, The Roka and Nightblade (see C.11). Shadow Glaive and Space Dissector are not part of the boss drops and keep their other sources. Every item also keeps its T3/T4 dimension-pool source)*:

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

- ISS spellbook cap (2%): `irons_spellbooks:copper_spell_book` is added at 2% per chest to the T1 marquees where it fits the lore. The T2 and T3 pools carry Ars Nouveau's `apprentice_spell_book` and `archmage_spell_book` as ordinary pool entries, not under the cap. Per the rationale in master.md Part XIII, the starter kit handles the "hard to start magic" onboarding, so the higher legacy rates aren't justified.
- ISS scrolls are uncapped and remain a main vector of mage progression. They appear in the T1 Magic and T1 Ancient / Eldritch pools for their tier.
- Cataclysm structures are left out of this roster on purpose. Cataclysm boss drops carry the Cataclysm flavor, and marquee pools on top would cover it twice.
- Tables marked TBD need packwiz/jar verification before the final code wiring: T4 Aether dungeon tables, T2 Blue Skies dungeon tables. The first implementation may cover TBD entries only in part. (Jar-verified 2026-10-11: the Lich Tower, Structory tower-top and Undergarden catacombs ids in the N.1 table.)
- `celestial_artifacts:ender_jump_scepter` was flagged as ungated by the celestial_artifacts audit. It is in the T4 End / levitation pool but marked for verification in playtest; pull it to boss-drop only if the rate proves too generous.
