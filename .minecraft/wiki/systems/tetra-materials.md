# Tetra Modded Metal Materials

This is the reference for all custom Tetra material definitions added by IridescentCraft. These JSON files (in `global_packs/required_data/icraft_tetra_materials/data/tetra/materials/metal/`) allow modded metals to be used as Tetra tool and weapon components.

Vanilla reference values (approximate, from Tetra defaults) are included for comparison. Actual vanilla Tetra values may vary slightly by component.

---

## Master Comparison Table

All 27 custom materials sorted by tier, with vanilla benchmarks for context. Expanded from 15 to 20 on 2026-03-16 with the addition of Abyss and Forbidden & Arcanus metals. Expanded to 23 with Blue Skies materials (Diopside, Charoite, Horizonite). Expanded to 27 with Undergarden metals (4 metals with Tetra stat overrides).

| Tier | Material | Source Mod | Durability | Primary Dmg | Secondary Dmg | Tertiary | Tool Efficiency | Tool Level | Magic Capacity | Tint | Repair Item |
|------|----------|------------|------------|-------------|---------------|----------|-----------------|------------|----------------|------|-------------|
| -- | *Iron (vanilla ref)* | *Vanilla* | *250* | *4.0* | *3.0* | *--* | *6.0* | *iron* | *32* | -- | *iron_ingot* |
| T1 | Brass | Create | 240 | 4.5 | 4.0 | 2.5 | 6 | iron | 80 | #c4963a | `create:brass_ingot` |
| -- | *Diamond (vanilla ref)* | *Vanilla* | *1561* | *5.0* | *3.0* | *--* | *8.0* | *diamond* | *64* | -- | *diamond* |
| T2 | Ironwood | Twilight Forest | 340 | 5.0 | 3.6 | 3.0 | 6.5 | iron | 96 | #6b4e35 | `twilightforest:ironwood_ingot` |
| T2 | Signalum | Thermal | 300 | 5.0 | 4.2 | 2.5 | 7.5 | diamond | 96 | #d84b20 | `thermal:signalum_ingot` |
| T2 | Manasteel | Botania | 350 | 5.2 | 3.6 | 2.8 | 7 | diamond | 120 | #4a90c4 | `botania:manasteel_ingot` |
| T2 | Steeleaf | Twilight Forest | 380 | 5.3 | 3.8 | 3.0 | 7 | diamond | 90 | #3a7a2c | `twilightforest:steeleaf_ingot` |
| T2 | Steel | Thermal | 400 | 5.5 | 3.5 | 3.2 | 7 | diamond | 72 | #8a8a8a | `thermal:steel_ingot` |
| T2 | Knightmetal | Twilight Forest | 500 | 5.6 | 3.2 | 3.5 | 7.5 | diamond | 78 | #c4b57a | `twilightforest:knightmetal_ingot` |
| T2 | Fiery | Twilight Forest | 460 | 5.8 | 3.4 | 3.2 | 7.5 | diamond | 86 | #d45a10 | `twilightforest:fiery_ingot` |
| T2 | Lumium | Thermal | 320 | 4.8 | 4.4 | 2.3 | 7.5 | diamond | 100 | #f5e16f | `thermal:lumium_ingot` |
| T2 | Diopside | Blue Skies | 350 | 5.0 | 4.5 | 3.0 | 8.0 | iron | 60 | #2d8f4e | `blue_skies:diopside` |
| T2 | Charoite | Blue Skies | 400 | 5.2 | 4.8 | 3.0 | 7.0 | iron | 100 | #7b2d8f | `blue_skies:charoite` |
| T2 | Horizonite | Blue Skies | 450 | 5.5 | 5.0 | 3.5 | 7.5 | diamond | 70 | #c4761a | `blue_skies:horizonite_ingot` |
| T3 | Osmium | Mekanism | 650 | 6.0 | 3.2 | 3.2 | 8 | diamond | 88 | #8eadb5 | `mekanism:ingot_osmium` |
| T3 | Elementium | Botania | 720 | 6.2 | 3.4 | 2.5 | 8.5 | diamond | 150 | #e565c9 | `botania:elementium_ingot` |
| T3 | Terrasteel | Botania | 800 | 6.5 | 3.0 | 3.0 | 9 | diamond | 140 | #3dba4e | `botania:terrasteel_ingot` |
| T3 | Enderium | Thermal | 900 | 6.8 | 3.0 | 3.5 | 9.5 | netherite | 110 | #1a6b6b | `thermal:enderium_ingot` |
| T3 | Refined Obsidian | Mekanism | 1000 | 7.0 | 2.8 | 4.0 | 9 | netherite | 76 | #5c3b8e | `mekanism:ingot_refined_obsidian` |
| -- | *Netherite (vanilla ref)* | *Vanilla* | *2031* | *6.0* | *3.0* | *--* | *9.0* | *netherite* | *128* | -- | *netherite_ingot* |
| T4 | Aethersteel | Aethersteel | 2500 | 8.5 | 3.2 | 4.5 | 11 | netherite | 100 | #7ad6e8 | `aethersteel:aethersteel_ingot` |

> **Column notes:** Primary = main attack damage. Secondary = sweeping/off-hand damage. Tertiary = armor/blocking value. Tool Level = what blocks the tool can mine (iron < diamond < netherite). Magic Capacity = how many enchantment improvements the material can hold in Tetra's system.

---

## Tier Breakdown

### Tier 1 -- Early Game

Entry-level modded metal available during the Overworld exploration phase. Sits alongside iron.

| Material | Source Mod | Durability | Primary | Secondary | Tertiary | Efficiency | Tool Level | Magic Cap | Tint | Repair Item |
|----------|------------|------------|---------|-----------|----------|------------|------------|-----------|------|-------------|
| Brass | Create | 240 | 4.5 | 4.0 | 2.5 | 6 | iron | 80 | #c4963a | `create:brass_ingot` |

**Notes:**
- Brass has slightly lower durability than iron (240 vs 250) but significantly higher magic capacity (80 vs ~32), making it a sidegrade favoring enchantment-heavy builds.
- Balanced secondary damage (4.0) makes it the best T1 option for sweeping attacks.
- Required hammer tier: gold (lowest crafting requirement).

---

### Tier 2 -- Mid Game

The largest tier with 11 materials spanning Twilight Forest, Thermal, Botania, and Blue Skies metals. These bridge the gap between iron and diamond, with diamond-level mining capability.

| Material | Source Mod | Durability | Primary | Secondary | Tertiary | Efficiency | Tool Level | Magic Cap | Tint | Repair Item |
|----------|------------|------------|---------|-----------|----------|------------|------------|-----------|------|-------------|
| Ironwood | Twilight Forest | 340 | 5.0 | 3.6 | 3.0 | 6.5 | iron | 96 | #6b4e35 | `twilightforest:ironwood_ingot` |
| Signalum | Thermal | 300 | 5.0 | 4.2 | 2.5 | 7.5 | diamond | 96 | #d84b20 | `thermal:signalum_ingot` |
| Manasteel | Botania | 350 | 5.2 | 3.6 | 2.8 | 7 | diamond | 120 | #4a90c4 | `botania:manasteel_ingot` |
| Steeleaf | Twilight Forest | 380 | 5.3 | 3.8 | 3.0 | 7 | diamond | 90 | #3a7a2c | `twilightforest:steeleaf_ingot` |
| Steel | Thermal | 400 | 5.5 | 3.5 | 3.2 | 7 | diamond | 72 | #8a8a8a | `thermal:steel_ingot` |
| Knightmetal | Twilight Forest | 500 | 5.6 | 3.2 | 3.5 | 7.5 | diamond | 78 | #c4b57a | `twilightforest:knightmetal_ingot` |
| Fiery | Twilight Forest | 460 | 5.8 | 3.4 | 3.2 | 7.5 | diamond | 86 | #d45a10 | `twilightforest:fiery_ingot` |
| Lumium | Thermal | 320 | 4.8 | 4.4 | 2.3 | 7.5 | diamond | 100 | #f5e16f | `thermal:lumium_ingot` |
| Diopside | Blue Skies | 350 | 5.0 | 4.5 | 3.0 | 8.0 | iron | 60 | #2d8f4e | `blue_skies:diopside` |
| Charoite | Blue Skies | 400 | 5.2 | 4.8 | 3.0 | 7.0 | iron | 100 | #7b2d8f | `blue_skies:charoite` |
| Horizonite | Blue Skies | 450 | 5.5 | 5.0 | 3.5 | 7.5 | diamond | 70 | #c4761a | `blue_skies:horizonite_ingot` |

**Notes:**
- **Ironwood** has iron tool level (not diamond) but better stats than iron -- it is the Twilight Forest entry point.
- **Manasteel** has the highest magic capacity in T2 (120), making it ideal for enchantment-focused Tetra builds. Botania metals consistently trade raw damage for magic capacity.
- **Lumium** has the highest secondary damage in T2 (4.4) but the lowest tertiary (2.3) and low durability -- a glass cannon support material.
- **Signalum** mirrors Lumium's support role with high secondary (4.2) but slightly more balanced stats.
- **Steel** and **Knightmetal** are the durability picks (400 and 500), favoring sustained use over burst damage.
- **Fiery** has the highest primary damage in T2 (5.8) with solid durability (460) -- the straightforward DPS choice.
- **Diopside** is a Blue Skies gem with the highest tool efficiency in T2 (8.0) but iron tool level and the lowest magic capacity (60) -- a precision mining gem.
- **Charoite** is a balanced Blue Skies metal with high secondary damage (4.8) and high magic capacity (100) -- the dimensional magic-affinity pick.
- **Horizonite** is the strongest Blue Skies metal with the highest durability in T2 (450), highest primary damage tied with Steel (5.5), and diamond tool level -- the T2 endgame workhorse.
- Blue Skies materials (Diopside, Charoite) require a gold-level hammer; Horizonite requires iron.
- All other T2 materials require an iron-level hammer to craft in Tetra.

---

### Tier 3 -- Late Game

Five materials that rival or exceed diamond. This tier includes the strongest pre-endgame options, with two materials reaching netherite tool level.

| Material | Source Mod | Durability | Primary | Secondary | Tertiary | Efficiency | Tool Level | Magic Cap | Tint | Repair Item |
|----------|------------|------------|---------|-----------|----------|------------|------------|-----------|------|-------------|
| Osmium | Mekanism | 650 | 6.0 | 3.2 | 3.2 | 8 | diamond | 88 | #8eadb5 | `mekanism:ingot_osmium` |
| Elementium | Botania | 720 | 6.2 | 3.4 | 2.5 | 8.5 | diamond | 150 | #e565c9 | `botania:elementium_ingot` |
| Terrasteel | Botania | 800 | 6.5 | 3.0 | 3.0 | 9 | diamond | 140 | #3dba4e | `botania:terrasteel_ingot` |
| Enderium | Thermal | 900 | 6.8 | 3.0 | 3.5 | 9.5 | netherite | 110 | #1a6b6b | `thermal:enderium_ingot` |
| Refined Obsidian | Mekanism | 1000 | 7.0 | 2.8 | 4.0 | 9 | netherite | 76 | #5c3b8e | `mekanism:ingot_refined_obsidian` |

**Notes:**
- **Elementium** has the highest magic capacity of any material in the entire pack (150). Combined with good damage and durability, it is the premier magic-build material.
- **Terrasteel** is the second-highest magic capacity (140) with better raw damage and durability than Elementium -- the Botania endgame material.
- **Enderium** reaches netherite tool level with the highest efficiency in T3 (9.5), making it the best mining material before T4.
- **Refined Obsidian** has the highest primary damage (7.0), highest tertiary/armor value (4.0), and highest durability (1000) in T3. The tradeoff is the lowest magic capacity (76) and lowest secondary damage (2.8) -- a pure physical powerhouse.
- **Osmium** is the T3 entry point with balanced stats and no standout weakness.
- Enderium and Refined Obsidian can mine everything netherite tools can.

---

### Tier 4 -- Endgame

The single pinnacle material, requiring the most advanced progression.

| Material | Source Mod | Durability | Primary | Secondary | Tertiary | Efficiency | Tool Level | Magic Cap | Tint | Repair Item |
|----------|------------|------------|---------|-----------|----------|------------|------------|-----------|------|-------------|
| Aethersteel | Aethersteel | 2500 | 8.5 | 3.2 | 4.5 | 11 | netherite | 100 | #7ad6e8 | `aethersteel:aethersteel_ingot` |

**Notes:**
- Aethersteel surpasses vanilla netherite in every combat stat: 8.5 primary damage (vs ~6.0), 2500 durability (vs 2031), and 11 tool efficiency (vs 9.0).
- Magic capacity of 100 is moderate -- lower than the Botania T3 metals. Players wanting maximum enchantment potential may prefer Elementium or Terrasteel components for specific slots.
- Requires a diamond-level hammer to craft (the highest hammer requirement of any material).
- Uses the "shiny" + "heavy" + "metal" texture set, giving it a distinctive visual.

---

## Design Notes: Stat Scaling Philosophy

The material progression follows these principles:

1. **Durability scales exponentially.** T1 starts around iron (240), T2 ranges 300-500, T3 jumps to 650-1000, and T4 reaches 2500. This mirrors vanilla's iron (250) -> diamond (1561) -> netherite (2031) curve but extends beyond it.

2. **Primary damage scales linearly.** From 4.5 (T1 Brass) through 5.0-5.8 (T2), 6.0-7.0 (T3), to 8.5 (T4). Each tier adds roughly 1-1.5 base damage.

3. **Tool efficiency tracks tier boundaries.** T1 = 6, T2 = 6.5-7.5, T3 = 8-9.5, T4 = 11. This ensures higher-tier tools noticeably outperform lower ones in mining speed.

4. **Magic capacity rewards specialization, not raw power.** The highest magic capacity materials (Elementium 150, Terrasteel 140, Manasteel 120) are all Botania metals. The highest-damage material (Aethersteel, 100) and the toughest physical material (Refined Obsidian, 76) have moderate-to-low magic capacity. This creates meaningful build choices: raw stats vs enchantability.

5. **Secondary damage favors support/utility metals.** Lumium (4.4), Signalum (4.2), and Brass (4.0) lead in secondary damage despite lower primary damage. This makes alloy/utility metals useful for sweeping and off-hand roles even when they are not the primary damage pick.

6. **Tertiary (armor) scales with physical toughness.** Aethersteel (4.5) and Refined Obsidian (4.0) lead. Fragile or magic-focused metals like Lumium (2.3) and Elementium (2.5) have the lowest values.

7. **Integrity cost/gain scales with tier.** T1-T2 materials cost 2 integrity, T3 costs 3, T4 costs 4. Integrity gain follows similarly (5 at T1-T2, 6-7 at T2-T3, 10 at T4). This gates more powerful materials behind higher-quality Tetra tool frames.

---

## Source Coverage: Addon Mods vs IridescentCraft Datapack

All 27 materials are defined by the **IridescentCraft custom datapack** (`icraft_tetra_materials`). None come from external Tetra addon mods -- they are all original definitions authored for this modpack. The count was expanded from 15 to 20 on 2026-03-16 with the addition of Abyss and Forbidden & Arcanus metals, then to 23 with Blue Skies materials, then to 27 with Undergarden metals.

The materials draw from the following source mods (the mod that provides the ingot):

| Source Mod | Materials | Count |
|------------|-----------|-------|
| Twilight Forest | Ironwood, Steeleaf, Knightmetal, Fiery | 4 |
| Thermal Series | Steel, Signalum, Lumium, Enderium | 4 |
| Undergarden | *(4 metals with Tetra stat overrides)* | 4 |
| Blue Skies | Diopside, Charoite, Horizonite | 3 |
| Botania | Manasteel, Elementium, Terrasteel | 3 |
| Mekanism | Osmium, Refined Obsidian | 2 |
| Create | Brass | 1 |
| Aethersteel | Aethersteel | 1 |

---

## Additional JSON Parameters

For completeness, here are the parameters not shown in the main tables:

| Material | Integrity Cost | Integrity Gain | Textures | Required Hammer |
|----------|---------------|----------------|----------|-----------------|
| Brass | 2 | 5 | shiny, metal, default | gold |
| Ironwood | 2 | 5 | metal, default | iron |
| Signalum | 2 | 5 | shiny, metal | iron |
| Manasteel | 2 | 5 | shiny, metal | iron |
| Steeleaf | 2 | 5 | metal, default | iron |
| Steel | 2 | 6 | heavy, metal | iron |
| Knightmetal | 2 | 6 | heavy, metal | iron |
| Fiery | 2 | 6 | shiny, metal | iron |
| Lumium | 2 | 5 | shiny, metal | iron |
| Osmium | 2 | 7 | metal, default | iron |
| Elementium | 3 | 6 | shiny, metal | iron |
| Terrasteel | 3 | 7 | shiny, metal | iron |
| Enderium | 3 | 7 | heavy, metal | iron |
| Refined Obsidian | 3 | 8 | heavy, metal | iron |
| Diopside | 2 | 5 | shiny, metal, default | gold |
| Charoite | 2 | 5 | shiny, metal | gold |
| Horizonite | 2 | 6 | heavy, metal | iron |
| Aethersteel | 4 | 10 | shiny, heavy, metal | diamond |
