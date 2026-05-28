# Tetra Materials Reference (Pack-Wide)

This is the canonical reference for every Tetra material currently in the IridescentCraft pack. It covers Tetra's built-in materials, the IridescentCraft datapack additions, the custom materials shipped by the unified `iridescent_tetra_expansion-1.0.0.jar` (which bundles the former `iridescent-reforging-mod` + `iridescent-modular-spells-mod` source repos and is the canonical deployed name post-2026-05-02), and the Tetra-extending compat addons.

Use this doc when authoring per-material reforging variants, balancing module values, choosing repair items for new modules, or reasoning about which materials are duplicated across multiple sources.

**Last full audit:** 2026-05-28. **Total catalogued material entries:** ~845 (by source, before dedupe). **Unique by category/key:** ~800 (49 cross-source duplicates).

> **2026-05-28 audit delta.** Fixed silent single-asterisk drop on 7 custom materials (`arcane_cloth`, `magebloom`, `paper`, `deathskin`, `rotten_leather`, `tf_arctic`, `tf_yeti`) — see [Section 5](#section-5---critical-tetra-finickyness-rules). Boosted `arcane_cloth` to T2 magical-cloth tier (was at bare minimum stats). Added missing [Section 2d](#2d-bundle-jar-magical-fabric--skin-materials-iridescent_tetra_expansion-100jar) covering `arcane_cloth`, `manaweave`, `spellbinding_cloth`, `magebloom` (none documented in the 2026-04-29 audit). **Rewrote Section 4** to reflect actual per-material variant architecture — the prior "plate modules accept only 5 materials" claim was based on the deprecated standalone `iridescent-reforging-mod/` source and contradicted the unified bundle's per-material variant model. Added [Section 5 — Critical Tetra Finickyness Rules](#section-5---critical-tetra-finickyness-rules) mirroring `IridescentCraft-internal/dev/lessons-learned-Tetra.md`. **Material per-tier-parity audit still pending** — see [Future work](#future-work--open-questions). The canonical hierarchy: T1 = iron/copper/brass; T2 = steel/manasteel/etc.; T3 = terrasteel/elementium/etc.; T4 = netherite + Terramity onyx; **T4 peak = Aethersteel** (pinnacle of crafted progression, sits below the Ad Astra postgame chain).

---

## Table of Contents

1. [How Tetra material registration works](#how-tetra-material-registration-works)
2. [Section 1 - Tetra built-in materials](#section-1---tetra-built-in-materials)
3. [Section 2 - IridescentCraft custom materials](#section-2---iridescentcraft-custom-materials)
4. [Section 3 - Modded Tetra extensions](#section-3---modded-tetra-extensions)
5. [Section 4 - Reforging armor variant architecture](#section-4---reforging-armor-variant-architecture)
6. [Section 5 - Critical Tetra finickyness rules](#section-5---critical-tetra-finickyness-rules)
7. [Cross-source duplicate keys](#cross-source-duplicate-keys)
8. [Future work / open questions](#future-work--open-questions)

---

## How Tetra material registration works

A Tetra material is a JSON file at `data/<namespace>/tetra/materials/<category>/[<subdir>/]<file>.json`. Tetra's reload listener walks every datapack/jar's `data/tetra/materials/...` tree and registers each file as a material whose ID is `<namespace>:<category>/<key>`. The file's directory determines the **category** (used by module variant matchers like `tetra:metal/`, `tetra:fabric/`). The `key` field inside the JSON is the leaf identifier the variant matcher binds to (e.g. `"key": "iron"` -> matches `tetra:metal/iron`).

Standard fields:

| Field | Type | Meaning |
|---|---|---|
| `key` | string | Unique within category. Becomes the second half of the variant-match string (`<cat>/<key>`). |
| `category` | string | Mirrors directory name. Tetra modules accept materials by category (or by exact `<cat>/<key>`). |
| `primary`, `secondary`, `tertiary` | number | Multiplier values. Modules apply them to attribute extracts (e.g. helmet armor scalar x material primary). |
| `durability` | int | Base durability granted to a tool/armor that uses this material. |
| `integrityCost`, `integrityGain` | int | Tetra's integrity budget. Cost = how much frame integrity the material consumes; gain = how much it adds to a frame. |
| `magicCapacity` | int | Tetra's enchantment-equivalent budget for honing/improvements. |
| `toolLevel`, `toolEfficiency` | string, number | Mining tier and base mining speed when used as a tool head. `toolLevel` is a tier string like `minecraft:iron`. |
| `tints` | obj | RGB hex strings that tint the material textures. |
| `textures` | string[] | Texture set names. Common sets: `default`, `metal`, `shiny`, `heavy`. |
| `material.items` or `material.tag` | items[] / tag | The repair / crafting source ingredient. Tag form is preferred for forge-tagged metals. |
| `requiredTools.hammer_dig` | string | Minimum hammer tool tier to forge with this material in a Tetra workbench. |

Modules accept materials via two patterns in their variant matchers:
- **Exact match**: `"materials": ["tetra:metal/iron"]` - only iron qualifies.
- **Category prefix**: `"materials": ["tetra:fabric/", "tetra:fibre/", "tetra:skin/"]` - any material in any of those categories qualifies (the trailing slash is the wildcard marker). Note that the **namespace prefix matters**: `tetra:fabric/` matches only Tetra-namespace fabrics, not `iridescent_reforging:fabric/...`. Cross-namespace use requires either a wildcard with no namespace or explicit listing.

When two datapacks/mods register the same `<category>/<key>`, **last loaded wins**. Datapack load order is alphabetical by datapack name unless overridden. In practice the four Blue Skies materials (`charoite`, `diopside`, `horizonite`, etc.) are registered by both our datapack AND `txdacompat` / `dimasctetracompat` / `tetracelium`; see [Cross-source duplicate keys](#cross-source-duplicate-keys) for the full list and which version typically wins.

---

## Section 1 - Tetra built-in materials

From `tetra-1.20.1-6.12.0.jar` at `data/tetra/materials/`. **66 materials in 12 categories.** All keys live under namespace `tetra:`.

### bone (1)

| Key | Primary | Sec | Tert | Dur | IC | IG | MC | Eff | Tool Level | Repair Item |
|---|---|---|---|---|---|---|---|---|---|---|
| `bone` | 5 | 1.9 | 4.5 | 120 | 1 | 5 | 108 | 4.5 | `minecraft:stone` | `minecraft:bone` |

### fabric (16) - all wools

All wool variants share identical stats. The base `wool` entry is tagged (`#minecraft:wool`); the colored variants pin to specific items.

| Key | Primary | Sec | Tert | Dur | IC | IG | MC | Repair Item |
|---|---|---|---|---|---|---|---|---|
| `wool` (any color) | 1 | 1 | 5 | 200 | 1 | 4 | 90 | `#minecraft:wool` |
| `wool_black` ... `wool_yellow` (15 colors) | 1 | 1 | 5 | 200 | 1 | 4 | 90 | `minecraft:<color>_wool` |

Color list: `black, blue, brown, cyan, gray, green, light_blue, light_gray, lime, magenta, orange, pink, purple, red, yellow`.

### fibre (6)

| Key | Primary | Sec | Tert | Dur | IC | IG | MC | Repair Item |
|---|---|---|---|---|---|---|---|---|
| `dragon_sinew` | 1 | 1.5 | 4 | 1150 | 2 | 8 | 84 | `tetra:dragon_sinew` |
| `phantom_membrane` | 1.2 | 1.4 | 3 | 1150 | 2 | 6 | 84 | `minecraft:phantom_membrane` |
| `string` | 1 | 0.8 | 3 | 200 | 1 | 3 | 90 | `#forge:string` |
| `twisting_vine` | 1.5 | 2.4 | 3 | 200 | 1 | 5 | 90 | `minecraft:twisting_vines` |
| `vine` | 0.6 | 1.6 | 3 | 180 | 1 | 4 | 86 | `minecraft:vine` |
| `weeping_vine` | 0.8 | 2.8 | 3 | 320 | 1 | 4 | 110 | `minecraft:weeping_vines` |

### gem (3)

| Key | Primary | Sec | Tert | Dur | IC | IG | MC | Eff | Tool Level | Repair Item |
|---|---|---|---|---|---|---|---|---|---|---|
| `amethyst` | 5 | 2.7 | 0 | 850 | 2 | 2 | 72 | 7 | `minecraft:iron` | `minecraft:amethyst_shard` |
| `diamond` | 6 | 2.9 | 0 | 1561 | 2 | 2 | 60 | 8 | `minecraft:diamond` | `minecraft:diamond` |
| `emerald` | 5.5 | 2.5 | 0 | 850 | 2 | 2 | 72 | 7 | `minecraft:iron` | `minecraft:emerald` |

### metal (4)

| Key | Primary | Sec | Tert | Dur | IC | IG | MC | Eff | Tool Level | Repair Item |
|---|---|---|---|---|---|---|---|---|---|---|
| `copper` | 4 | 4.2 | 2.5 | 180 | 1 | 5 | 78 | 5 | `minecraft:iron` | `minecraft:copper_ingot` |
| `gold` | 3 | 4.6 | 1 | 32 | 2 | 3 | 132 | 12 | `minecraft:gold` | `minecraft:gold_ingot` |
| `iron` | 5 | 3.8 | 3 | 250 | 2 | 5 | 84 | 6 | `minecraft:iron` | `minecraft:iron_ingot` |
| `netherite` | 7.24 | 2.9 | 3.5 | 2031 | 2 | 8 | 90 | 9 | `minecraft:netherite` | `minecraft:netherite_ingot` |

### misc (1)

| Key | Primary | Sec | Tert | Dur | IC | IG | MC | Repair Item |
|---|---|---|---|---|---|---|---|---|
| `vent_plate` | 5 | 4.2 | 5 | 600 | 2 | 5 | 84 | `tetra:vent_plate` |

### rod (5)

| Key | Primary | Sec | Tert | Dur | IC | IG | MC | Repair Item |
|---|---|---|---|---|---|---|---|---|
| `bamboo` | 1 | 0.1 | 6 | 15 | 1 | 3 | 104 | `minecraft:bamboo` |
| `blaze_rod` | 5 | 0.4 | 1 | 111 | 2 | 7 | 108 | `minecraft:blaze_rod` |
| `end_rod` | 5 | 0.4 | 1 | 142 | 2 | 9 | 102 | `minecraft:end_rod` |
| `forged_beam` | 1 | 4.2 | 1 | 950 | 2 | 8 | 84 | `tetra:forged_beam` |
| `stick` | 2 | 0.5 | 5.5 | 40 | 1 | 3 | 90 | `minecraft:stick` |

### scale (2)

| Key | Primary | Sec | Tert | Dur | IC | IG | MC | Repair Item |
|---|---|---|---|---|---|---|---|---|
| `shulker_shell` | 5 | 0.4 | 1 | 200 | 1 | 4 | 90 | `minecraft:shulker_shell` |
| `turtle_scute` | 5 | 0.4 | 1 | 200 | 1 | 4 | 90 | `minecraft:scute` |

### skin (2)

| Key | Primary | Sec | Tert | Dur | IC | IG | MC | Repair Item |
|---|---|---|---|---|---|---|---|---|
| `hide` | 5 | 1.5 | 1 | 200 | 1 | 5 | 90 | `minecraft:rabbit_hide` |
| `leather` | 5 | 2 | 1 | 200 | 1 | 4 | 90 | `minecraft:leather` |

### socket (10)

Sockets are zero-stat materials used for slotting gem/charm-like enhancements. Durability listed is socket lifetime (number of uses before consumption).

| Key | Dur | IC | Eff | Repair / Source Item |
|---|---|---|---|---|
| `socket_amethyst` | 48 | 1 | 0 | `minecraft:amethyst_shard` |
| `socket_diamond` | 512 | 1 | 2 | `minecraft:diamond` |
| `socket_emerald` | 48 | 1 | 0 | `minecraft:emerald` |
| `socket_ender_pearl` | 48 | 1 | 0 | `minecraft:ender_pearl` |
| `socket_lapis` | 48 | 1 | 0 | `minecraft:lapis_lazuli` |
| `socket_nether_star` | 512 | 1 | 0 | `minecraft:nether_star` |
| `socket_pristine_amethyst` | 48 | 1 | 0 | `tetra:pristine_amethyst` |
| `socket_pristine_diamond` | 714 | 1 | 4 | `tetra:pristine_diamond` |
| `socket_pristine_emerald` | 48 | 1 | 0 | `tetra:pristine_emerald` |
| `socket_pristine_lapis` | 48 | 1 | 0 | `tetra:pristine_lapis` |

### stone (7)

| Key | Primary | Sec | Tert | Dur | IC | IG | MC | Eff | Tool Level | Repair Item |
|---|---|---|---|---|---|---|---|---|---|---|
| `andesite` | 4 | 3.5 | 0 | 180 | 1 | 4 | 90 | 4.5 | `minecraft:stone` | `minecraft:andesite` |
| `blackstone` | 4.5 | 4.5 | 0 | 500 | 1 | 4 | 90 | 5 | `minecraft:iron` | `#forge:blackstone` |
| `diorite` | 4 | 3.5 | 0 | 180 | 1 | 4 | 90 | 4.5 | `minecraft:stone` | `minecraft:diorite` |
| `flint` | 5 | 2.3 | 0 | 131 | 1 | 4 | 80 | 5 | `minecraft:stone` | `minecraft:flint` |
| `granite` | 4 | 3.5 | 0 | 180 | 1 | 4 | 90 | 4.5 | `minecraft:stone` | `minecraft:granite` |
| `obsidian` | 6 | 5.5 | 0 | 580 | 3 | 1 | 90 | 9 | `minecraft:diamond` | `#forge:obsidian` |
| `stone` | 4 | 3 | 0 | 131 | 1 | 4 | 90 | 4 | `minecraft:stone` | `#forge:cobblestone/normal` |

### wood (9)

| Key | Primary | Sec | Tert | Dur | IC | IG | MC | Eff | Tool Level | Repair Item |
|---|---|---|---|---|---|---|---|---|---|---|
| `acacia` | 3 | 1.7 | 6 | 59 | 1 | 4 | 90 | 2 | `minecraft:wood` | `minecraft:acacia_planks` |
| `birch` | 3 | 1.7 | 6 | 59 | 1 | 4 | 90 | 2 | `minecraft:wood` | `minecraft:birch_planks` |
| `cherry` | 3.5 | 1.7 | 6.5 | 70 | 1 | 5 | 80 | 2 | `minecraft:wood` | `minecraft:cherry_planks` |
| `crimson` | 4 | 2.5 | 7.5 | 150 | 2 | 5 | 90 | 4 | `minecraft:gold` | `minecraft:crimson_planks` |
| `dark_oak` | 3 | 1.7 | 6 | 59 | 1 | 4 | 90 | 2 | `minecraft:wood` | `minecraft:dark_oak_planks` |
| `jungle` | 3 | 1.7 | 6 | 59 | 1 | 4 | 90 | 2 | `minecraft:wood` | `minecraft:jungle_planks` |
| `oak` | 3 | 1.7 | 6 | 59 | 1 | 4 | 90 | 2 | `minecraft:wood` | `#minecraft:planks` |
| `spruce` | 3 | 1.7 | 6 | 59 | 1 | 4 | 90 | 2 | `minecraft:wood` | `minecraft:spruce_planks` |
| `warped` | 3 | 1.2 | 8.5 | 65 | 2 | 6 | 90 | 4 | `minecraft:gold` | `minecraft:warped_planks` |

---

## Section 2 - IridescentCraft custom materials

These materials are defined by IridescentCraft-authored sources and are unique to this pack.

### 2a. Datapack metals + gems (`icraft_tetra_materials`)

The original 27 modded metal materials shipped via `global_packs/required_data/icraft_tetra_materials/` (datapack namespace `tetra:`). Expanded over time to add gems and skin variants (now 35 total: 28 metal, 5 gem, 2 skin).

#### Master metal comparison table (sorted by tier)

Vanilla reference values are included for comparison.

| Tier | Material | Source Mod | Dur | Prim | Sec | Tert | Eff | Tool Level | Magic Cap | Tint | Repair Item |
|---|---|---|---|---|---|---|---|---|---|---|---|
| -- | *Iron (vanilla ref)* | *Vanilla* | *250* | *5.0* | *3.8* | *3.0* | *6.0* | *iron* | *84* | -- | *iron_ingot* |
| T1 | Brass | Create | 240 | 4.5 | 4.0 | 2.5 | 6 | iron | 80 | #c4963a | `create:brass_ingot` |
| -- | *Diamond (vanilla ref)* | *Vanilla* | *1561* | *6.0* | *2.9* | *0* | *8.0* | *diamond* | *60* | -- | *diamond* |
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
| T2 | Garnite | Forbidden & Arcanus | 400 | 5.5 | 5.0 | 3.0 | 7.5 | diamond | 70 | -- | `forbidden_arcanus:dragon_scale` |
| T2 | Phantom | Forbidden & Arcanus | 600 | 6.0 | 5.5 | 3.5 | 8 | diamond | 95 | -- | `forbidden_arcanus:reinforced_deorum` |
| T2 | Deorum | Forbidden & Arcanus | 700 | 6.0 | 5.5 | 3.5 | 8 | diamond | 110 | -- | `forbidden_arcanus:deorum_ingot` |
| T2 | Knight | Forbidden & Arcanus | 750 | 6.5 | 6.0 | 4.0 | 8.5 | diamond | 85 | -- | (TYR-tier) |
| T2 | Cloggrum | Undergarden | 350 | 5.5 | 3.0 | 2.5 | 6.5 | iron | 50 | -- | `undergarden:cloggrum_ingot` |
| T2 | Froststeel | Undergarden | 450 | 5.8 | 3.5 | 2.8 | 7 | diamond | 75 | -- | `undergarden:froststeel_ingot` |
| T3 | Osmium | Mekanism | 650 | 6.0 | 3.2 | 3.2 | 8 | diamond | 88 | #8eadb5 | `mekanism:ingot_osmium` |
| T3 | Forgotten Metal | Undergarden | 800 | 6.8 | 4.2 | 3.5 | 8.0 | diamond | 60 | -- | `undergarden:forgotten_ingot` |
| T3 | Elementium | Botania | 720 | 6.2 | 3.4 | 2.5 | 8.5 | diamond | 150 | #e565c9 | `botania:elementium_ingot` |
| T3 | Terrasteel | Botania | 800 | 6.5 | 3.0 | 3.0 | 9 | diamond | 140 | #3dba4e | `botania:terrasteel_ingot` |
| T3 | Enderium | Thermal | 900 | 6.8 | 3.0 | 3.5 | 9.5 | netherite | 110 | #1a6b6b | `thermal:enderium_ingot` |
| T3 | Refined Obsidian | Mekanism | 1000 | 7.0 | 2.8 | 4.0 | 9 | netherite | 76 | #5c3b8e | `mekanism:ingot_refined_obsidian` |
| T3 | Unorithe | Forbidden & Arcanus | 1200 | 7.0 | 6.5 | 4.5 | 9.5 | netherite | 90 | -- | (Tyr / endgame F&A) |
| T3 | Dimlite | Mekanism | 1400 | 6.5 | 3.0 | 5.5 | 8 | diamond | 130 | -- | -- |
| -- | *Netherite (vanilla ref)* | *Vanilla* | *2031* | *7.24* | *2.9* | *3.5* | *9.0* | *netherite* | *90* | -- | *netherite_ingot* |
| T4 | Iridium | Mekanism | 2200 | 8.0 | 4.0 | 4.0 | 10 | netherite | 100 | -- | `mekanism:ingot_iridium` |
| T4 | Aethersteel | Aethersteel | 2500 | 8.5 | 3.2 | 4.5 | 11 | netherite | 100 | #7ad6e8 | `aethersteel:aethersteel_ingot` |

> **Column notes:** Primary = main attack damage. Secondary = sweeping/off-hand damage. Tertiary = armor/blocking value. Tool Level = what blocks the tool can mine (iron < diamond < netherite). Magic Capacity = how many enchantment improvements the material can hold in Tetra's system.

#### Custom gems (`icraft_tetra_materials`)

5 gem materials. The first four are themed onyx/sapphire/topaz/ruby gems for end-game crafting; `undergarden_utherium` ports Undergarden's purple gem into Tetra-compatible stats.

| Key | Primary | Sec | Tert | Dur | MC | Eff | Tool Level | Repair / Source |
|---|---|---|---|---|---|---|---|---|
| `onyx` | 7.5 | 3.5 | 4.0 | 1500 | 110 | 9 | netherite | (custom onyx item) |
| `ruby` | 7.0 | 3.0 | 3.5 | 1000 | 90 | 7.5 | diamond | (custom ruby item) |
| `sapphire` | 6.5 | 3.5 | 3.0 | 1000 | 90 | 7.5 | diamond | (custom sapphire item) |
| `topaz` | 6.5 | 3.5 | 3.2 | 950 | 90 | 7.5 | diamond | (custom topaz item) |
| `undergarden_utherium` | 6.2 | 3.8 | 3.2 | 600 | 120 | 7.5 | diamond | `undergarden:utherium` |

> **Note:** `undergarden_utherium` is also defined by `undergardenpatch-1.4.2-1.20.1.jar` with stats `prim=6.5, dur=1279, mc=102, eff=8.5`. Datapack vs jar load order determines which wins; see [duplicate keys](#cross-source-duplicate-keys).

#### Custom skins (`icraft_tetra_materials`)

| Key | Primary | Sec | Tert | Dur | MC | Repair Item |
|---|---|---|---|---|---|---|
| `rotten_flesh` | 3 | 1 | 1 | 80 | 70 | `minecraft:rotten_flesh` |
| `rotten_leather` | 5 | 2 | 1 | 180 | 110 | (custom rotten_leather) |

### 2b. Themed reforging materials (`iridescent_reforging:themed/*`)

Eight themed materials at `/root/IridescentCraft/iridescent-reforging-mod/src/main/resources/data/tetra/materials/themed/*.json`. Namespace is `iridescent_reforging:`. These are zero-stat material wrappers (primary/secondary/tertiary all 1.0, durability 0) used purely as **selectors** for themed reforging variants in the helmet/visor, chestplate/chest_lining, leggings/belt, and boots/boot_lining modules. They have no standalone power; the bound module variants apply spell-power buffs.

| Key | Theme | Lining-Slot Buff Applied (per slot) |
|---|---|---|
| `themed/fire` | Fire | `irons_spellbooks:fire_spell_power` +0.05 |
| `themed/ice` | Ice | `irons_spellbooks:ice_spell_power` +0.05 |
| `themed/shadow` | Shadow | `irons_spellbooks:blood_spell_power` +0.05 (note: shadow shares blood SP) |
| `themed/holy` | Holy | `irons_spellbooks:holy_spell_power` +0.05 |
| `themed/lightning` | Lightning | `irons_spellbooks:lightning_spell_power` +0.05 |
| `themed/nature` | Nature | `irons_spellbooks:mana_regen` +0.06 |
| `themed/ender` | Ender | `irons_spellbooks:ender_spell_power` +0.05 |
| `themed/blood` | Blood | `irons_spellbooks:blood_spell_power` +0.05 |

> **Implementation note:** Themed materials only carry meaning when bound to one of the four `*_lining` / `belt` / `visor` modules in the reforging mod. They are not consumable and are not produced from any single ingredient - the conversion recipe sets the themed flag based on the magic_cloth variant used.

### 2c. Spell-book materials (`iridescent-modular-spells-mod`)

15 custom material entries used to back per-spellbook conversion recipes for Iron's Spells & Spellbooks (ISS) and Ars Nouveau (Ars) spell books. Located at `/root/IridescentCraft/iridescent-modular-spells-mod/src/main/resources/data/tetra/materials/{icraft_iss_books,icraft_ars_books}/`. These use **non-standard categories** (`icraft_iss_books`, `icraft_ars_books`) so they don't pollute Tetra's general matchers; the `iss_book` / `ars_book` modules in the same mod accept these explicitly.

| Category | Key | Magic Cap | Source Mod |
|---|---|---|---|
| `icraft_iss_books` | `copper_spell_book` | 30 | Iron's Spells |
| `icraft_iss_books` | `iron_spell_book` | 60 | Iron's Spells |
| `icraft_iss_books` | `gold_spell_book` | 60 | Iron's Spells |
| `icraft_iss_books` | `druidic_spell_book` | 60 | Iron's Spells |
| `icraft_iss_books` | `villager_spell_book` | 60 | Iron's Spells |
| `icraft_iss_books` | `rotten_spell_book` | 60 | Iron's Spells |
| `icraft_iss_books` | `evoker_spell_book` | 100 | Iron's Spells |
| `icraft_iss_books` | `blaze_spell_book` | 100 | Iron's Spells |
| `icraft_iss_books` | `diamond_spell_book` | 100 | Iron's Spells |
| `icraft_iss_books` | `dragonskin_spell_book` | 100 | Iron's Spells |
| `icraft_iss_books` | `netherite_spell_book` | 150 | Iron's Spells |
| `icraft_iss_books` | `necronomicon_spell_book` | 150 | Iron's Spells (Necronomicon) |
| `icraft_ars_books` | `novice_spell_book` | 30 | Ars Nouveau |
| `icraft_ars_books` | `apprentice_spell_book` | 60 | Ars Nouveau |
| `icraft_ars_books` | `archmage_spell_book` | 100 | Ars Nouveau |

All other stats (primary/secondary/tertiary/durability/efficiency) are 0; books only matter for magic capacity scaling. The book module variants in `data/tetra/modules/{iss_book,ars_book}/*.json` apply max-mana / mana-regen / cast-time / spell-power / cooldown improvements.

### 2d. Bundle-jar magical fabric + skin materials (`iridescent_tetra_expansion-1.0.0.jar`)

Three magical fabric materials and one magical skin shipped by the unified bundle jar. **Registered under namespace `tetra:`** (path is `data/tetra/materials/<cat>/<key>.json` inside the jar, so the namespace == `tetra` not `iridescent_modular_spells`). They join the `tetra:fabric/` and `tetra:skin/` category pools alongside vanilla wool/leather/hide, so any module variant that targets `tetra:fabric/` or `tetra:skin/` (or an exact key in those categories) can use them.

| Cat | Key | Prim | Sec | Tert | Dur | iC | iG | MC | Repair Item | Attributes (post-2026-05-28 `**` fix) |
|---|---|---|---|---|---|---|---|---|---|---|
| fabric | `arcane_cloth` | 1 | 1 | 5 | 250 | 1 | 4 | 160 | `irons_spellbooks:magic_cloth` | `**mana_regen 0.05` + `**max_mana 0.05` + `**spell_power 0.025` |
| fabric | `manaweave` | 1 | 1 | 5 | 240 | 1 | 4 | 150 | `botania:manaweave_cloth` | -- (relies on tertiary stat) |
| fabric | `spellbinding_cloth` | 1 | 1 | 5 | 320 | 1 | 4 | 200 | `botania:spell_cloth` | -- (relies on tertiary + 200 MC) |
| skin | `magebloom` | 0.6 | 4.5 | 1 | 90 | 1 | 3 | 130 | `ars_nouveau:magebloom_fiber` | `**spell_power 0.05` |

> **Tier positioning.** `arcane_cloth` is the T2 magical-cloth entry tier (post-boost; was bare-minimum stats before 2026-05-28). `manaweave` is mid-tier Botania-flavored. `spellbinding_cloth` is upper-tier (MC 200 — between manaweave and ISS upstream `irons_spellbooks_arcane_cloth` MC 180). `magebloom` is a magic-skin from Ars Nouveau's magebloom fiber, themed as "tough but flexible high-magic skin substitute" — high secondary (4.5) reflects the spinning/weaving identity.

> **`**` prefix is non-negotiable.** All four use `**`-prefixed ISS percent attributes (MULTIPLY_TOTAL). Single-asterisk `*` (MULTIPLY_BASE) silently drops to 0 on ISS percent attrs in Tetra's `AttributeHelper.collapse()` when no ADDITION sibling exists. See [Section 5](#section-5---critical-tetra-finickyness-rules) for the full rule and `IridescentCraft-internal/dev/lessons-learned-Tetra.md` 2026-05-14 entry for the bytecode-level explanation. Pre-2026-05-28, `arcane_cloth` + `magebloom` shipped with the broken `*` prefix and their magic bonuses were silently invisible in-game; fixed in the deployed jar via in-place JSON patch (jar isn't signed).

> **ISS arcane_cloth (separate entry).** `irons_spellbooks` ships its own `arcane_cloth` material under namespace `tetra:` but with key prefix `irons_spellbooks_` (full key: `tetra:fabric/irons_spellbooks_arcane_cloth`). Stats: P=1, S=1, T=5, dur=300, MC=180, `**cooldown_reduction=0.15`. Coexists with our `tetra:fabric/arcane_cloth` (no key collision, different identifiers). See [Section 3.10](#310-irons_spellbooks-120131551jar-17-materials).

### 2e. Datapack-side magical attribute carriers (`icraft_tetra_materials`, post-2026-05-28)

Five datapack materials carry `**`-prefixed ISS attributes for spell-tier flavor on top of their base stats:

| Cat | Key | Attributes |
|---|---|---|
| fibre | `paper` | `**spell_power 0.05` |
| skin | `deathskin` | `**mana_regen 0.025` + `iridescent_reforging:damage_vs_undead 0.05` (plain ADDITION on a custom Forge attr — renders cleanly per lesson 2026-05-13 #4) |
| skin | `rotten_leather` | `**holy_spell_power 0.1` + `**mana_regen 0.05` + `**spell_power 0.15` |
| skin | `tf_arctic` | `**ice_magic_resist 0.1` + `**spell_power 0.1` |
| skin | `tf_yeti` | `**ice_magic_resist 0.12` + `**spell_power 0.1` |

Pre-2026-05-28 these all shipped with single-asterisk and were silently invisible. The 2026-05-28 fix converted 8 attributes across 7 materials (including 2 in Section 2d) to `**`. Player-visible impact: every player lined-up with any of these was getting +0 magic stat contribution from the material attribute despite the file declaring the bonus.

---

## Section 3 - Modded Tetra extensions

These compat / addon mods register additional Tetra materials. Total: **711 modded extension materials** across 11 jars.

### 3.1. tetranomicon-1.6.1-1.20.1.jar (497 materials)

The dominant external source. Provides Tetra material registrations for nearly every modded ore / wood / vine in the pack. Coverage by category:

| Category | Count | Notable mods covered |
|---|---|---|
| `bone` | 11 | alexscaves, alexsmobs, deep_dark_regrowth, deeperdarker, unusualprehistory |
| `fibre` | 34 | atmospheric, betterend, betternether, biomesoplenty, blue_skies, deeperdarker, regions_unexplored, silentgear, tropicraft, voidscape |
| `gem` | 63 | ms_*, oresabovediamonds, organics, phantasm, silentgems_*, tropicraft, voidscape, deeperdarker, blue_skies, betterend |
| `metal` | 73 | ad_astra, betterend, betternether, blue_skies, create, embers, enderitemod, epicsamurai, forbidden_arcanus, iceandfire, l2complements, majruszdifficulty, ms_*, nature_arise, organics, samurai_dynasty, silentgear, twilightforest |
| `rod` | 4 | ms_*, tropicraft, betternether |
| `scale` | 7 | alexsmobs, twilightforest, unusualprehistory |
| `skin` | 8 | alexscaves, alexsmobs, ms_*, tropicraft |
| `socket` | 111 | broad coverage of every gem-providing mod |
| `stone` | 67 | ad_astra, alexscaves, betterend, blue_skies, create, deeperdarker, ms_*, quark, regions_unexplored, unearthed |
| `wood` | 119 | atmospheric, autumnity, betterend, betternether, biomesoplenty, blue_skies, ecologics, environmental, ms_*, regions_unexplored, twilightforest, tropicraft |

**Tetranomicon spotlight - top primary by category** (highlights for module balance reference):

| Category | Top Key | Prim | Sec | Tert | Dur | MC | Tool Level |
|---|---|---|---|---|---|---|---|
| metal | `iceandfire_fire_dragonsteel` | 24 | 4.5 | 2 | 8000 | 60 | `tetra:maxed_forge_hammer` |
| metal | `iceandfire_ice_dragonsteel` | 24 | 4.5 | 2 | 8000 | 60 | `tetra:maxed_forge_hammer` |
| metal | `iceandfire_lightning_dragonsteel` | 24 | 4.5 | 2 | 8000 | 60 | `tetra:maxed_forge_hammer` |
| gem | `voidscape_astral_crystal` | 12 | 2.6 | 0 | 4550 | 150 | `tetranomicon:tier_eleven` |
| gem | `organics_endium` | 11 | 2.5 | 0 | 3200 | 12 | `tetranomicon:tier_ten` |
| gem | `voidscape_ichor` | 11 | 3.8 | 0 | 4047 | 138 | `tetranomicon:tier_ten` |
| bone | `alexsmobs_void_chitin` | 7.5 | 1.7 | 2.5 | 2196 | 168 | `tetra:maxed_forge_hammer` |
| stone | `deeperdarker_sculk_stone` | 7.4 | 7.8 | 0 | 1561 | 72 | `minecraft:stone` |
| wood | `phantasm_pream` / `betterend_pythadendron` | 5.5 | -- | -- | 1561+ | -- | `minecraft:iron` |
| skin | `ms_brown_bear_hide` / `ms_polar_bear_hide` | 6 | 3 | 1 | 200 | 105-120 | -- |
| scale | `alexsmobs_straddlite` / `twilightforest_naga_scale` | 6 | -- | -- | 448 | 102-108 | -- |

> **Tetranomicon introduces custom tool tiers** (`tetranomicon:tier_ten`, `tetranomicon:tier_eleven`, `tetra:maxed_forge_hammer`) used by its highest-end materials. These tiers are not equivalent to vanilla netherite; they require Tetra hammers fully upgraded. Iceandfire's dragonsteel materials and voidscape's astral_crystal sit at the absolute ceiling.

> **Tetranomicon has the FULL list of twilight forest, blue skies, undergarden, etc. modded metals** under its own keys (e.g. `tetranomicon`'s `twilightforest_knightmetal` vs our datapack's plain `knightmetal`). The two namespaces don't conflict because the keys differ. See [duplicate keys](#cross-source-duplicate-keys) for actual conflicts.

The full per-key table for tetranomicon's 497 entries is too large to inline. To inspect a specific material, decompile from `/root/IridescentCraft/iridescent-biomes-mod/tools/.cache/all-mods/tetranomicon-1.6.1-1.20.1.jar` at `data/tetra/materials/<cat>/<key>.json`.

### 3.2. tetraextras-0.1.4-1.20.1.jar (41 materials)

High-end netherite-tier metals plus a handful of fibre/scale/skin/wood/stone/gem additions. Many are absurdly powerful (intentional - tetraextras is designed for late-game progression beyond vanilla netherite).

| Cat | Key | Prim | Sec | Tert | Dur | MC | Eff | Tool Level |
|---|---|---|---|---|---|---|---|---|
| metal | `insanium_ingot` | 28 | 11.2 | 2.8 | 200000 | 845 | 18 | netherite |
| metal | `supremium_ingot` | 24 | 9.6 | 2.8 | 100000 | 545 | 14 | netherite |
| metal | `imperium_ingot` | 17 | 6.8 | 2.8 | 6000 | 545 | 12 | netherite |
| metal | `ultimerite_ingot` | 15.2 | 6.8 | 5.8 | 921 | 295 | 10 | netherite |
| metal | `nefarious` | 14.24 | 3.4 | 3.5 | 3431 | 170 | 10 | netherite |
| metal | `tertium_ingot` | 13 | 5.2 | 2.8 | 4000 | 445 | 10 | netherite |
| metal | `corrupterite_ingot` | 12.4 | 4.8 | 5.8 | 2231 | 95 | 9 | netherite |
| metal | `enderite_ingot` | 12 | 4.0 | 2 | 2031 | 185 | 9 | netherite |
| metal | `etherium` | 11.2 | 1.4 | 4.5 | 2426 | 216 | 11 | netherite |
| metal | `netherite_diamond` | 11 | 4.4 | 2.8 | 2313 | 245 | 8.4 | netherite |
| metal | `prudentium_ingot` | 10 | 4 | 2.8 | 2800 | 345 | 9 | netherite |
| metal | `netherite_emerald` | 10 | 4.4 | 2.8 | 2313 | 245 | 8.4 | netherite |
| metal | `ignitium_ingot` | 9.8 | 3.6 | 3.8 | 8630 | 185 | 9.3 | netherite |
| metal | `echorite_ingot` | 9.8 | 3.4 | 3.5 | 2031 | 135 | 9 | netherite |
| metal | `enderium_ingot` | 9.4 | 3.4 | 3.8 | 2137 | 135 | 9.4 | netherite |
| metal | `netherite_gold` | 9 | 4.4 | 2.8 | 2313 | 245 | 8.4 | netherite |
| metal | `spiderite_ingot` | 8.8 | 2.8 | 3.4 | 2031 | 135 | 9 | netherite |
| metal | `phanterite_ingot` | 8.7 | 2.9 | 3.4 | 2031 | 135 | 9 | netherite |
| metal | `cwitherite_ingot` / `witherite_ingot` | 8.6 | 3.2 | 3.5 | 2031 | 135 | 9 | netherite |
| metal | `prismarite_ingot` | 8.6 | 2.9 | 1.8 | 2031 | 135 | 9 | netherite |
| metal | `neptunium_ingot` | 8.4 | 2.4 | 2.8 | 1796 | 235 | 8.4 | netherite |
| metal | `blackopal` | 8.4 | 3.2 | 3.5 | 2431 | 235 | 9 | netherite |
| metal | `blazerite_ingot` | 8.4 | 3.2 | 3.5 | 2431 | 235 | 9 | netherite |
| metal | `inferium_ingot` / `netherite_iron` | 8 | 3.2 | 2.8 | 2000-2313 | 245 | 8.4 | netherite |
| metal | `golderite_ingot` | 6.8 | 4.0 | 2 | 1843 | 135 | 14 | netherite |
| metal | `featherite_ingot` | 6.4 | 1.8 | 1.4 | 2031 | 135 | 9 | netherite |
| metal | `brass` (TE2 version) | 5.5 | 4 | 4.5 | 520 | 70 | 5.5 | diamond |
| metal | `zinc` | 4.7 | 2.2 | 2.6 | 360 | 90 | 4 | iron |
| metal | `andesite_alloy` | 2 | 4.0 | 2 | 220 | 85 | 2 | gold |
| skin | `ravager_hide` | 8 | 6.5 | 0.2 | 600 | 60 | 0 | -- |
| bone | `thrasher_tooth` | 6.1 | 3.5 | 2.2 | 105 | 120 | 6 | gold |
| stone | `myalite` | 6.5 | 2.5 | 0 | 750 | 110 | 7 | diamond |
| rod | `ender_rod` | 5 | 0.4 | 1 | 574 | 142 | 0 | -- |
| scale | `crab_shell`, `dragon_scale` | 5 | 0.4 | 1 | 200 | 90 | 0 | -- |
| gem | `amethyst` (TE2 override) | 5.0 | 2.7 | 0 | 850 | 72 | 7.0 | iron |
| fibre | `cloth` | 2.4 | 2.2 | 2.6 | 274 | 85 | 0 | -- |
| wood | `azalea`, `blossom` | 3 | 1.7 | 6 | 59 | 90 | 2 | wood |

> **Conflict:** tetraextras' `brass` (5.5/4/4.5/520) vs our datapack's `brass` (4.5/4/2.5/240). Last loaded wins.
> **Conflict:** tetraextras overrides `amethyst` (gem) with iron tool level.

### 3.3. tetracelium-1.20.1-1.3.1.jar (34 materials)

Compat layer for Botania, Twilight Forest, Mekanism, AE2, Thermal, and gems-related mods. **Heavily overlapping with our datapack** - it ships its own `manasteel`, `terrasteel`, `elementium`, `ironwood`, `knightmetal`, `steeleaf`, `osmium`, `steel`, `fiery_ingot` (different key), `ruby`, `sapphire`, etc.

| Cat | Key | Prim | Sec | Tert | Dur | MC | Eff | Tool Level |
|---|---|---|---|---|---|---|---|---|
| bone | `dragon_bone` | 7 | 3 | 3.5 | 1660 | 108 | 10 | netherite |
| bone | `wither_bone` | 6.5 | 4 | 6 | 958 | 182 | 8 | iron |
| fabric | `canvas` | 1 | 2 | 4.8 | 132 | 94 | 0 | -- |
| fibre | `mana_string` | 0.5 | 4 | 2 | 250 | 120 | 6 | iron |
| fibre | `hemp` | 0.8 | 1 | 3 | 380 | 98 | 0 | -- |
| fibre | `straw` | 1 | 0.5 | 3.5 | 40 | 82 | 0 | -- |
| gem | `agate`, `citrine`, `ruby`, `sapphire` (all share stats) | 6 | 2.9 | 0 | 1561 | 60 | 9 | iron |
| gem | `certus_quartz` | 5 | 3.8 | 3 | 250 | 98 | 6 | iron |
| metal | `bronze`, `infused_iron`, `nickel` | 5-5.5 | 3.8 | 3 | 200-250 | 72-96 | 6 | iron |
| metal | `electrum` | 5 | 4.6 | 1 | 58 | 144 | 13 | gold |
| metal | `silver` | 4 | 4.2 | 1 | 50 | 126 | 11 | gold |
| metal | `tin` | 4 | 3.2 | 3 | 126 | 72 | 6 | iron |
| metal | `lead` | 6 | 5.5 | 2 | 120 | 66 | 6 | iron |
| metal | `osmium` (TC override) | 7 | 4 | 1 | 500 | 80 | 10 | iron |
| metal | `steel` (TC override) | 6 | 3.8 | 3 | 650 | 72 | 8 | iron |
| metal | `manasteel` (TC override) | 6 | 4 | 2 | 300 | 120 | 6.2 | diamond |
| metal | `elementium` (TC override) | 5 | 4 | 2 | 720 | 120 | 6.2 | diamond |
| metal | `terrasteel` (TC override) | 7 | 5 | 1 | 2300 | 144 | 9 | netherite |
| metal | `ironwood` (TC override) | 5 | 3.5 | 2.5 | 512 | 150 | 6.5 | iron |
| metal | `steeleaf` (TC override) | 6 | 3 | 4.5 | 131 | 54 | 8 | diamond |
| metal | `knightmetal` (TC override) | 6 | 2.5 | 3.8 | 512 | 54 | 8 | diamond |
| metal | `fiery_ingot` (TC override; note `_ingot` suffix vs our `fiery`) | 7 | 5 | 1 | 1024 | 60 | 9 | netherite |
| metal | `sky` | 6 | 3 | 3.5 | 1500 | 72 | 8 | diamond |
| wood | `ancient_wood`, `livingwood`, `dreamwood` (Botania) | 3-4 | 1.7-2.5 | 6-7.5 | 60-150 | 102-120 | 2-4 | wood/gold |
| wood | `baobab`, `maple`, `treated_wood` | 3-4.5 | 1.7-2.2 | 6-7.5 | 70-180 | 78-96 | 2-4 | wood/gold |

> **Major conflict surface:** `manasteel`, `terrasteel`, `elementium`, `ironwood`, `knightmetal`, `steeleaf`, `osmium`, `steel`, `ruby`, `sapphire`. Tetracelium values differ significantly from our datapack values for the same keys. Datapack load order determines which wins. **In practice**, datapacks under `Paxi:required_data` load AFTER mod-jar datapacks, so our `icraft_tetra_materials` should override tetracelium for these shared keys; verify in-game with `/tetra debug material` if uncertain.

### 3.4. aetheric_tetranomicon-1.2.0-1.20.1.jar (34 materials)

Aether / Deep Aether / Aether Redux / Ancient Aether compat. Stats track the source mod's actual armor materials.

| Cat | Key | Prim | Sec | Tert | Dur | MC | Eff | Tool Level |
|---|---|---|---|---|---|---|---|---|
| metal | `aether_phoenix` | 7 | 2.9 | 3 | 1561 | 72 | 8 | diamond |
| metal | `aether_valkyrie` | 6 | 2.8 | 3.7 | 1561 | 60 | 8 | diamond |
| metal | `ancient_aether_valkyrum` | 7 | 2.8 | 3.7 | 2031 | 90 | 9 | `tetra:maxed_forge_hammer` |
| metal | `deep_aether_stratus` | 7 | 2.7 | 3.2 | 2031 | 90 | 9 | netherite |
| metal | `aether_redux_veridium` | 4 | 3 | 3 | 750 | 1 | 2.25 | iron |
| gem | `aether_gravitite` / `aether_redux_gravitite` | 6 | 1.2 | 0 | 1561 | 60 | 8 | diamond |
| gem | `aether_zanite` | 5 | 2.4 | 0 | 250 | 84 | 6 | iron |
| gem | `deep_aether_skyjade` | 5 | 3.2 | 0 | 150 | 1 | 10 | iron |
| stone | `aether_holystone` | 4 | 4.5 | 0 | 131 | 30 | 4 | stone |
| stone | `aether_redux_vitrium` | 5.4 | 6.5 | 0 | 768 | 90 | 4 | iron |
| stone | `deep_aether_aseterite` | 4.4 | 4 | 0 | 448 | 90 | 6 | stone |
| stone | `deep_aether_clorite` | 3.8 | 3 | 0 | 448 | 120 | 4 | stone |
| wood | (14 entries: aether_skyroot, aether_redux_*, ancient_aether_*, deep_aether_*) | 3-5.5 | 1.3-2.8 | 2.2-8.7 | 59-1280 | 84-144 | 2-12 | wood/gold/stone |
| fibre | (4 entries: aether_redux_gilded_vine, aether_redux_golden_vine, deep_aether_sunroot_hanger, deep_aether_yagroot_vines) | 2-4 | 2.2-3.4 | 3-3.5 | 768-1024 | 24-120 | 0 | -- |
| socket | `socket_aether_golden_amber`, `socket_aether_zanite`, `socket_deep_aether_skyjade` | 0 | 0 | 0 | 0-512 | 0 | 0-2 | -- |

### 3.5. art_of_forging-1.8.4-1.20.1.jar (22 materials)

Art of Forging is itself a Tetra extension mod that adds a forging mechanic; its materials reflect the new endgame metals it adds.

| Cat | Key | Prim | Sec | Tert | Dur | MC | Eff | Tool Level |
|---|---|---|---|---|---|---|---|---|
| metal | `diabolium_ingot` | 8.5 | 2.8 | 2 | 2550 | 96 | 10 | netherite |
| metal | `endsteel_ingot` | 8 | 3.0 | 2.5 | 2000 | 70 | 10 | netherite |
| metal | `forged_steel_ingot` | 8 | 3.5 | 1.8 | 2059 | 20 | 10 | netherite |
| metal | `vobrivium_ingot` | 8 | 2.1 | 3.6 | 1115 | 70 | 10 | netherite |
| fibre | `life_fiber` | 7.8 | 4.5 | 7.2 | 1360 | 100 | 0 | -- |
| fibre | `warped_muscle` | 6.5 | 7.8 | 6.9 | 1250 | 85 | 0 | -- |
| misc | `echo_shard` | 0 | 0 | 0 | 10 | 100 | 0 | -- |
| misc | `eerie_shard` | 0 | 0 | 0 | 10 | 300 | 0 | -- |
| reagent | (8: `blaze_powder`, `reagent_emerald`, `ghast_tear`, `glass`, `glowstone_dust`, `magma_cream`, `redstone_dust`, `shard_of_malice`) | 0 | 0 | 0 | 0 | 0 | 0 | -- |
| socket | `fang_charm`, `socket_heart_of_ender`, `socket_shard_of_malice`, `sigil_of_eden`, `vobrite_crystal`, `socket_void_worm_eye` | 0 | 0 | 0 | 15-50 | 0 | 0 | -- |

> **Reagents** are a category unique to Art of Forging - they are consumed by its forging recipes, not used as plate materials.

### 3.6. dimasctetracompat-1.20.1-1.5.0.0.jar (17 materials)

Compat for "Dim Asc" (Dimensional Ascension Blue Skies). Overlaps heavily with `txdacompat` and our datapack on Blue Skies materials.

| Cat | Key | Prim | Sec | Tert | Dur | MC | Eff | Tool Level |
|---|---|---|---|---|---|---|---|---|
| metal | `aquite` | 5 | 3.8 | 3 | 250 | 84 | 6 | iron |
| metal | `falsite` | 2.4 | 2 | 4.6 | 450 | 84 | 5 | iron |
| metal | `horizonite` | 5 | 3.8 | 3 | 250 | 84 | 6 | iron |
| metal | `ventium` | 5.5 | 4.5 | 4 | 200 | 90 | 6 | iron |
| gem | `charoite` | 6 | 2.9 | 0 | 1561 | 80 | 9 | diamond |
| gem | `diopside` | 8 | 2.9 | 0 | 1661 | 80 | 8 | diamond |
| gem | `moonstone` | 4 | 3.7 | 0 | 200 | 90 | 4 | stone |
| gem | `pyrope` | 4.7 | 2.2 | 0 | 200 | 90 | 5 | stone |
| stone | `lunar_stone`, `turquoise_stone` | 4 | 3 | 0 | 131 | 90 | 4 | stone |
| wood | `bluebright`, `comet`, `dusk`, `frostbright`, `lunar_wood`, `maple`, `starlit` | 3 | 1.3-2.2 | 6 | 45-131 | 90 | 2 | stone |

> **Three-way conflict** on `charoite`, `diopside`, `horizonite`: our datapack vs `dimasctetracompat` vs `txdacompat`. All three define the same key with different stats. Confirm winner in-game.

### 3.7. txdacompat-1.0.3-forge-1.20.1.jar (31 materials)

Another Blue Skies / Tales from the Dim Ascended compat. Strong overlap with `tetranomicon` Blue Skies entries.

| Cat | Sample keys | Top stats |
|---|---|---|
| metal | `blue_skies_horizonite` | 5 / 3.8 / 3 / dur 250 / iron |
| gem | `blue_skies_aquite`, `blue_skies_charoite`, `blue_skies_diopside`, `blue_skies_moonstone`, `blue_skies_pyrope`, `moonstone` | up to 8 prim (diopside) / 1661 dur |
| fibre | `blue_skies_bluebright_vine`, `blue_skies_brumble_vine`, `blue_skies_dusk_vine`, `blue_skies_frostbright_vine`, `blue_skies_lunar_vine`, `blue_skies_maple_vine`, `blue_skies_starlit_vine` | 3-5 prim, 200-320 dur |
| stone | `blue_skies_cinderstone`, `blue_skies_lunar_stone`, `blue_skies_rimestone`, `blue_skies_taratite`, `blue_skies_turquoise_stone`, `blue_skies_umber` | 4-4.6 prim, 131-512 dur |
| wood | `blue_skies_bluebright`, `blue_skies_comet`, `blue_skies_dusk`, `blue_skies_frostbright`, `blue_skies_lunar_wood`, `blue_skies_maple`, `blue_skies_starlit_wood` | 3-3.5 prim, 59-100 dur |
| socket | `socket_blue_skies_charoite`, `socket_blue_skies_diopside`, `socket_blue_skies_moonstone`, `socket_blue_skies_pyrope` | dur 512-714 |

> **Total overlap with tetranomicon**: All 31 of these keys also appear in `tetranomicon`. With identical stats? No - they differ. See [duplicate keys](#cross-source-duplicate-keys).

### 3.8. undergardenpatch-1.4.2-1.20.1.jar (12 materials)

Undergarden compat. **All four metals + utherium gem also exist in our datapack** under the same keys (`undergarden_*`).

| Cat | Key | Prim | Sec | Tert | Dur | MC | Eff | Tool Level |
|---|---|---|---|---|---|---|---|---|
| metal | `undergarden_cloggrum` | 6 | 2.9 | 2 | 286 | 48 | 6 | iron |
| metal | `undergarden_forgotten_metal` | 6 | 4.3 | 3 | 1876 | 12 | 8 | netherite |
| metal | `undergarden_froststeel` | 5 | 4 | 2.5 | 575 | 120 | 7 | iron |
| gem | `undergarden_utherium` | 6.5 | 3.5 | 3.2 | 1279 | 102 | 8.5 | diamond |
| socket | `socket_undergarden_forgotten`, `socket_undergarden_froststeel`, `socket_undergarden_utherium` | 0 | 0 | 0 | 0 | 0 | 0 | -- |
| stone | `undergarden_depthrock`, `undergarden_shiverstone` | 4-4.2 | 3.5-4 | 0 | 180-250 | 90 | 4.5 | stone |
| wood | `undergarden_grongle`, `undergarden_smogstem`, `undergarden_wigglewood` | 2.6-3 | 1.4-2.3 | 6-6.9 | 59-512 | 90-108 | 3-4 | wood/stone |

> **Datapack vs jar conflict on all four metals + utherium**. Datapack values are generally more conservative (e.g. cloggrum dur 350 vs patch's 286). See [duplicate keys](#cross-source-duplicate-keys).

### 3.9. adtetra-2.1.0.jar (6 materials)

Ad Astra (space mod) compat.

| Cat | Key | Prim | Sec | Tert | Dur | MC | Eff | Tool Level |
|---|---|---|---|---|---|---|---|---|
| metal | `calorite` | 7.5 | 3.2 | 4 | 2200 | 105 | 9 | netherite |
| metal | `desh` | 4.2 | 4.3 | 2.7 | 250 | 51 | 5 | iron |
| metal | `ostrum` | 6.3 | 3 | 4 | 1100 | 110 | 8 | diamond |
| wood | `aeronos`, `glacian`, `strophar` | 3-4 | 1.1-2 | 7-9.3 | 87-175 | 25-90 | 5 | gold |

### 3.10. irons_spellbooks-1.20.1-3.15.5.1.jar (17 materials)

Iron's Spells & Spellbooks ships its own Tetra material registrations baked into its main jar (not via separate addon).

| Cat | Key | Prim | Sec | Tert | Dur | MC | Eff | Tool Level |
|---|---|---|---|---|---|---|---|---|
| metal | `irons_spellbooks_arcane_ingot` | 5.5 | 3.8 | 3 | 750 | 184 | 7 | diamond |
| fabric | `irons_spellbooks_arcane_cloth` | 1 | 1 | 5 | 300 | 180 | 0 | -- |
| bone | `irons_spellbooks_frozen_bone` | 5.5 | 1.9 | 4.5 | 180 | 158 | 4.5 | stone |
| skin | `irons_spellbooks_hogskin` | 1.5 | 1 | 5 | 250 | 80 | 0 | -- |
| rod | `frosted_helve` | 3.7 | 1.9 | 1 | 56 | 152 | 0 | -- |
| socket | 12 rune sockets (`irons_spellbooks_*_rune_socket` + `permafrost_shard`) | 0 | 0 | 0 | 0-256 | 0 | 0-5 | -- |

> **High magic capacity is the theme** - arcane_cloth (180), frozen_bone (158), arcane_ingot (184), frosted_helve (152). These are intentionally above-average MC for spellbook synergy. The 12 rune sockets bind to specific schools.

### 3.11. Other tetra-related jars with no material datapacks

- `[Forge1.20.1]TetraClip-1.0.6.jar` - tool-tier configuration mod, no materials
- `tetra_re_enlarged-1.3.0.jar` - texture / size mod, no materials
- `tetrasdelight-1.20.1-1.jar` - Farmer's Delight tool integration, no datapack materials (registers via Java)
- `tetra_tables--mc1.20--1.1.jar` - workbench table block additions, no materials

> **Caveat:** Some addons may register materials via Java code instead of datapacks. Confirmed via grep: the four jars above contain no `data/tetra/materials/` paths in their archives. If gameplay shows materials missing from this catalog, decompile the suspect jar and search for `MaterialManager.register` calls.

---

## Section 4 - Reforging armor variant architecture

> **2026-05-28 rewrite.** The previous version of this section described the deprecated standalone `iridescent-reforging-mod/` source's category-wildcard model (which claimed "plate modules accept only 5 materials"). After the 2026-05-02 bundle merge into `iridescent-tetra-expansion-mod/` (which ships as `iridescent_tetra_expansion-1.0.0.jar`), the actual architecture is fundamentally different: **per-material variants with explicit armor multipliers**, not category wildcards. The old version was stale by ~1 month.

### 4.1 Actual architecture

Each of the **52 armor modules** in the bundle source has **16-64 explicit per-material variants**, each binding ONE specific material to a unique stat extract. There is no `tetra:metal/` category wildcard; there is a `tetra:metal/copper` variant, a `tetra:metal/iron` variant, a `tetra:metal/aethersteel` variant, etc., each authored independently.

The per-material variant pattern was put in place during Phase A of the Tetra-armor extension work (2026-04-30, ~25 commits) once the team understood Tetra's lookup chain: 3-segment variant keys break Tetra's template fallback for material-name substring extraction. The chosen mitigation was 2-segment variant keys (`<module>/<material>`) authored explicitly per material. See `IridescentCraft-internal/dev/lessons-learned-Tetra.md` 2026-04-30 entry "Tetra armor extension: the undocumented lookup chain" for the full bytecode-driven story.

**Total variants across all 52 modules: ~1500-2000.**

### 4.2 The 4-archetype plate model

Per `master-appendix.md` Section L.2, each armor piece (helmet / chestplate / leggings / boots) has **4 plate modules**, one per **archetype**. The honing system gates by archetype via synthetic `tetra:armor/<archetype>_hone/` improvement types declared on each major-slot module:

| Archetype | Helmet | Chestplate | Leggings | Boots |
|---|---|---|---|---|
| **Warrior** | `heavy_crown` | `breastplate` | `heavy_leg_plate` | `heavy_boot_sole` |
| **Balanced** | `basic_crown` | `cuirass` | `full_leg_plate` | `basic_boot_sole` |
| **Rogue** | `light_crown` | `scaled_chest` | `light_leg_plate` | `light_boot_sole` |
| **Mage** | `circlet` | `robe_chest` | `robed_leg_plate` | `robed_boot_sole` |

Stat priorities (also from L.2):

| Archetype | Chestplate | Helmet | Boots | Leggings |
|---|---|---|---|---|
| **Warrior** | Armor (big, +2..+6) | Armor | Armor | Armor |
| **Balanced** | Armor (modest, +1..+5) | Armor | Movement Speed | Armor |
| **Rogue** | Attack Damage | Arrow Damage | Movement Speed | Movement Speed |
| **Mage** | Spell Power | Spell Power | Cooldown Reduction | Max Mana |

The remaining 36 modules cover minor slots (linings, trim, crests, lacings, pauldrons, straps, etc.) — 9 per piece on average. They typically contribute small armor + flavor stats.

### 4.3 What `extract.primaryAttributes.X: N` actually does

`MaterialVariantData.combine()` MULTIPLIES the variant's `primaryAttributes` value by the material's `primary` stat. So an iron variant of `basic_crown` with armor extract `1.429` yields `5 × 1.429 = 7.145` armor in-game. Copper (primary=4) with armor extract `1.429` yields `4 × 1.429 = 5.716` armor.

This is also how copper auto-scales to ~80% of iron without per-module authoring (per master.md line 660): both variants can use the same multiplier value (or different ones) and the material's primary determines the final number.

Stored variant primary-attribute values should be **pre-divided by the intended material's primary** to express the final armor number in a readable way. So if the intended in-game armor for an iron basic_crown is `7.145`, the stored multiplier is `7.145 / iron.primary (5) = 1.429`.

### 4.4 Currently-accepted materials per module type (sampled)

The exact material set varies per module. Notable patterns:

**Plate modules (4 archetypes × 4 pieces = 16 modules)** — `basic_crown` (representative Balanced helmet) has 64 variants covering:
- vanilla: copper, iron, gold, netherite, diamond, leather
- 8 themed materials (fire/ice/shadow/holy/lightning/nature/ender/blood)
- 27 datapack metals (steel, manasteel, aethersteel, iridium, etc.)
- 5 datapack gems (ruby, sapphire, topaz, onyx, undergarden_utherium)
- 3 modded-via-condition (aether_neptune, dd_warden, cm_ignitium, etc.)
- 1 bundle (arcane_ingot)
- 1 each: tf_arctic, tf_yeti, bs_pyrope, tf_naga (cross-mod)

**Lining-style modules (silk_lining, padded_lining, etc.)** — `silk_lining` has 16 variants — much narrower than plate. Covers vanilla copper/iron/gold/diamond/netherite/leather + 8 themed + deathskin + arcane_ingot. **Does NOT yet accept**: wool, the 3 bundle fabrics (arcane_cloth/manaweave/spellbinding_cloth), hide, rotten_leather, tf_*, magebloom, OR any of the 6 vanilla Tetra fibres + dozens of modded fibres. Adding fibre + fabric materials to lining modules is **deferred work** (see [Future work](#future-work--open-questions)).

**Plate-only modules (full_visor, goggles, agile_greaves, etc.)** — accept metal + themed only, narrower than the 4-archetype plate set.

**Bridge modules (cloth_strap, leather_strap, iron_lacing, chain_belt, etc.)** — mixed acceptance (metal + skin + sometimes fabric + themed).

### 4.5 Known design issues (to be addressed in the per-tier-parity audit)

1. **Vanilla > Modded inversion in many slots.** Iron's basic_crown variant carries armor multiplier `1.429` (so iron crown = 7.145 armor) while Aethersteel's variant carries `0.68` (so aethersteel crown = `8.5 × 0.68 = 5.78` armor). **This is backwards from design intent.** Per master.md and the user's 2026-05-28 confirmation, Aethersteel is the pinnacle of crafted pre-postgame progression and should give noticeably more armor than vanilla iron, not less. The Phase A authoring pass calibrated vanilla and the early-modded metals (iron, diamond, netherite) to higher multipliers than the bulk of the modded T2-T4 metals (whose multipliers cluster around 0.36-0.68). The fix is to rewrite the T3/T4 modded-metal variant multipliers to reflect the canonical tier hierarchy.
2. **Every variant fails the "≥1 armor" floor per the 2026-05-28 user directive in lining-style modules.** silk_lining variants produce 0.11 - 0.46 armor depending on material. The floor rule requires every variant to yield material-primary × variant-armor ≥ 1.0. ~26 modules + ~500 variants are affected.
3. **Lining modules accept far fewer materials than the spell-book design pattern implies.** The migration doc (`iridescent-modular-spells-tetra-migration.md` Phase 6C) defines fabric/fibre/skin as the canonical lining categories with differentiated stat themes (fabric → mana_regen, fibre → cast_time_reduction, skin → max_mana). Armor lining modules currently mostly don't accept fabric or fibre at all.

### 4.6 The per-tier-parity audit (planned, not yet shipped)

The proper way to address (4.5) is **per-material variant rewrites at the tier-architecture level**, not wildcard inflation. The tooling for this is `iridescent-tetra-expansion-mod/tools/gen_per_material_variants.py` (existing — extended for the next pass). Input: a stat-tier matrix per material with intended in-game armor / max_mana / spell_power / etc. contribution per (material, archetype, piece) combo. Output: 1500-2000 variant blocks generated mechanically with verification via `tools/audit_modules.py`.

This is its own focused half-day to full-day work item.

---

## Section 5 - Critical Tetra Finickyness Rules

> **What this section is.** Tetra has zero behavioral documentation outside its bytecode. Every time we ship a custom integration, we learn 3-8 new gotchas from tester screenshots showing raw lang text or broken stat lines. The `IridescentCraft-internal/dev/lessons-learned-Tetra.md` postmortem holds the full per-incident detail. This section mirrors the **hard rules** distilled from those incidents so contributors can find them by wiki search instead of digging in a 700+ line postmortem. Each rule cites the incident date for the full context.

### 5.1 ISS percent attributes MUST use `**` prefix (MULTIPLY_TOTAL), never `*` (MULTIPLY_BASE) [2026-05-14]

Tetra's `AttributeHelper.collapse()` math drops MULTIPLY_BASE modifiers to 0 when no ADDITION sibling exists on the same attribute, silently making those stats invisible. Hard rule: any module variant, improvement file, or material `attributes` block targeting a percent attribute (`spell_power`, `mana_regen`, `cooldown_reduction`, `cast_time_reduction`, `spell_resist`, school SP, `summon_damage`, `max_mana` percent) gets `**` prefix. Audit script catches this; tester screenshots catch the residue.

Pre-2026-05-28, 7 custom materials shipped with broken `*` (see [Section 2d](#2d-bundle-jar-magical-fabric--skin-materials-iridescent_tetra_expansion-100jar)). All fixed.

### 5.2 Wildcard variant keys MUST end in `/` [2026-05-12]

`MaterialVariantData.combine()` CONCATENATES `variant.key + material.key`. A variant with `key: "padded_lining/dd_warden"` (named, no trailing slash) combined with material `dd_warden` produces `padded_lining/dd_wardendd_warden` — doubled. Wildcard variant keys MUST end in `/` (e.g., `key: "padded_lining/"`) so combine produces clean `padded_lining/<material_key>`. Per-material override variants (with one material in the list, like `"materials": ["tetra:metal/iron"]`) use 2-segment keys WITHOUT trailing slash (e.g., `basic_crown/iron`).

### 5.3 `magicCapacity` on every major variant gates BookEnchantSchematic [2026-05-06]

`BookEnchantSchematic.lambda$isApplicableForSlot$4` reads `VariantData.magicCapacity` from the major module's variant. If unset (default 0), the workbench enchant schematic silently disappears from the slot's context menu. No warning logged. Every major-slot variant needs explicit `magicCapacity` set; audit script CHECK 5 catches missing values.

### 5.4 Variant cloning scrubs incidental attributes [2026-05-13]

When authoring new material variants by copying a template, the template's incidental attributes leak through. Default policy: cloned variants get their `primaryAttributes` SCRUBBED to `{generic.armor, generic.armor_toughness, generic.knockback_resistance, etc.}` — drop all `irons_spellbooks:*` and `ars_nouveau:*` keys carried over from the source. Material-level attributes (in the material JSON's `attributes` block) carry the magic-bonus identity, not module-variant overrides. Audit script flags unexpected attributes on new-material variants.

### 5.5 Material reference path = file path, not `category` field [2026-05-12]

The category prefix in `materials: ["tetra:metal/iron"]` MUST match the on-disk directory under `data/<ns>/materials/`, not the JSON file's `category` field. Mismatches fall through silently (the variant just doesn't apply). When adding a new material file, the reference path = the directory chain from `data/<ns>/materials/` to the JSON file (without `.json`).

### 5.6 Bare `tetra.variant.<vk>` is the canonical lang form [2026-04-30]

No `.name`, no `.prefix`, no `.description` suffixes on variant keys (those exist as optional overlays for special-named variants only). Tetra's `getName(moduleKey, variantKey)` lookup does bare lookup first; the template fallback path breaks on 3-segment keys anyway. For variant keys ending in `/`, author BOTH bare `tetra.variant.<vk>` (with material applied) AND trailing-slash `tetra.variant.<vk>/` (empty default).

### 5.7 Schematic outcomes write `moduleVariant` verbatim to NBT [2026-04-30]

`SchematicDefinition.applyOutcome` writes the `moduleVariant` field LITERALLY to NBT — no material auto-suffix. To get per-material variant keys at the workbench, EITHER enumerate each material as a separate outcome with the corresponding `moduleVariant` OR use trailing-slash wildcard + category-wildcard materials. `SchematicRegistry.expandMaterialOutcome` runs at load time, walks each material in the category, and creates one UniqueOutcomeDefinition per material via `source::combine` — the wildcard path is preferred over hand-authored per-material outcomes.

### 5.8 `replace: true` required for swap-over-populated-slot [2026-05-06]

`SchematicDefinition.replace` defaults to false. False-replace schematics are only applicable on EMPTY slots. To allow material swaps (cuirass → cuirass with different metal), `replace: true` is required on the install schematic. Tetra's basic_blade.json ships with `replace: true` for this reason.

### 5.9 `variantData[0]` fallback MASKS NBT-mismatch bugs [2026-04-30 + 2026-05-02]

When module's `getVariantData(stack)` reads NBT and finds no matching variant key, it falls back to `getDefaultData()` = `variantData[0]` (the catch-all variant). UI looks correct (catch-all lang label appears), but the stack uses the catch-all's stats, not the intended material's stats. **Never trust a visual smoke test alone** when migrating variant key shapes; spot-check stat aggregation with a tester screenshot.

### 5.10 Cross-namespace `models[].location` doesn't work with `tetra:modular_loader` [2026-04-30]

Tetra's `ItemLayerModel.bake()` registers atlas references at bake time. Pointing `models[].location` at sprites from another mod's namespace (e.g., `minecraft:item/iron_helmet` from a Tetra variant) blows up at first render of any block entity holding a previewable stack. For per-material inventory icons pointing at vanilla/source-mod sprites, use Forge `ItemProperties` + `overrides` instead.

### 5.11 Tetra identifiers must obey `[a-z0-9/._-]` [2026-04-26]

Tetra item identifiers and schematic identifiers get composed into ResourceLocation paths. Colons (`:`) are NOT legal inside the path portion — they're the namespace/path separator. An identifier like `iridescent_modular_spells:iss_book` fails registration with `ResourceLocationException`. Use underscore-only: `iridescent_iss_book`.

### 5.12 `AddReloadListenerEvent` is server-only [2026-05-06]

The event fires only on the server's resource manager. In multiplayer with a remote dedicated server, the client never runs that listener and any registry it populates stays empty. For data that must be available on both sides (e.g., `SpecializedReplacementRegistry`, `SkinRegistry`), use `FMLCommonSetupEvent` to eagerly read JSON from the mod jar's classpath — fires on both client AND server.

### 5.13 Tetra MULTIPLY_BASE display rule (Section L.3 of master-appendix.md)

Mirrored here for searchability: per-attribute display formatting for Tetra modular items depends on which Forge attribute operation is applied. Apothic Attributes' `IFormattableAttribute` interface controls percent-vs-flat rendering. ISS percent attributes must use `**` (MULTIPLY_TOTAL) to render as "+X%" through the post-collapse path; ADDITION on a base-1.0 ISS attribute also renders linearly but as ugly decimals.

---

## Cross-source duplicate keys

49 `<category>/<key>` pairs are registered by 2+ sources. Last loaded wins; in IridescentCraft, datapack load order is alphabetical with `paxi` data anchors loading after vanilla and before mod datapacks - in practice we expect mod-jar datapacks to load first, then our `icraft_tetra_materials` datapack overrides on top. For the few cases where jar-vs-jar collide (no datapack involvement), Tetra's resolution depends on `ResourceManagerReloadListener` ordering, which is roughly mod load order.

| Category / Key | Sources | Notes |
|---|---|---|
| `gem/amethyst` | tetra (built-in), tetraextras | tetraextras overrides with iron tool level |
| `gem/ruby` | icraft datapack, tetracelium | datapack expected to win |
| `gem/sapphire` | icraft datapack, tetracelium | datapack expected to win |
| `gem/moonstone` | dimasctetracompat, txdacompat | jar load order |
| `gem/undergarden_utherium` | icraft datapack, undergardenpatch | datapack expected to win (more conservative stats) |
| `gem/blue_skies_aquite` | tetranomicon, txdacompat | jar load order |
| `gem/blue_skies_charoite` | tetranomicon, txdacompat | jar load order |
| `gem/blue_skies_diopside` | tetranomicon, txdacompat | jar load order |
| `gem/blue_skies_moonstone` | tetranomicon, txdacompat | jar load order |
| `gem/blue_skies_pyrope` | tetranomicon, txdacompat | jar load order |
| `metal/brass` | icraft datapack, tetraextras | datapack expected to win (T1 stats vs T3+ in tetraextras) |
| `metal/elementium` | icraft datapack, tetracelium | datapack expected to win |
| `metal/horizonite` | icraft datapack, dimasctetracompat | datapack expected to win |
| `metal/ironwood` | icraft datapack, tetracelium | datapack expected to win |
| `metal/knightmetal` | icraft datapack, tetracelium | datapack expected to win |
| `metal/manasteel` | icraft datapack, tetracelium | datapack expected to win |
| `metal/osmium` | icraft datapack, tetracelium | datapack expected to win |
| `metal/steel` | icraft datapack, tetracelium | datapack expected to win |
| `metal/steeleaf` | icraft datapack, tetracelium | datapack expected to win |
| `metal/terrasteel` | icraft datapack, tetracelium | datapack expected to win |
| `metal/undergarden_cloggrum` | icraft datapack, undergardenpatch | datapack expected to win |
| `metal/undergarden_forgotten_metal` | icraft datapack, undergardenpatch | datapack expected to win |
| `metal/undergarden_froststeel` | icraft datapack, undergardenpatch | datapack expected to win |
| `metal/blue_skies_horizonite` | tetranomicon, txdacompat | jar load order |
| `wood/maple` | dimasctetracompat, tetracelium | jar load order |
| `socket/socket_blue_skies_charoite` | tetranomicon, txdacompat | jar load order |
| `socket/socket_blue_skies_diopside` | tetranomicon, txdacompat | jar load order |
| `socket/socket_blue_skies_moonstone` | tetranomicon, txdacompat | jar load order |
| `socket/socket_blue_skies_pyrope` | tetranomicon, txdacompat | jar load order |
| `stone/blue_skies_cinderstone` | tetranomicon, txdacompat | jar load order |
| `stone/blue_skies_lunar_stone` | tetranomicon, txdacompat | jar load order |
| `stone/blue_skies_rimestone` | tetranomicon, txdacompat | jar load order |
| `stone/blue_skies_taratite` | tetranomicon, txdacompat | jar load order |
| `stone/blue_skies_turquoise_stone` | tetranomicon, txdacompat | jar load order |
| `stone/blue_skies_umber` | tetranomicon, txdacompat | jar load order |
| `wood/blue_skies_bluebright` | tetranomicon, txdacompat | jar load order |
| `wood/blue_skies_comet` | tetranomicon, txdacompat | jar load order |
| `wood/blue_skies_dusk` | tetranomicon, txdacompat | jar load order |
| `wood/blue_skies_frostbright` | tetranomicon, txdacompat | jar load order |
| `wood/blue_skies_lunar_wood` | tetranomicon, txdacompat | jar load order |
| `wood/blue_skies_maple` | tetranomicon, txdacompat | jar load order |
| `wood/blue_skies_starlit_wood` | tetranomicon, txdacompat | jar load order |
| `fibre/blue_skies_bluebright_vine` | tetranomicon, txdacompat | jar load order |
| `fibre/blue_skies_brumble_vine` | tetranomicon, txdacompat | jar load order |
| `fibre/blue_skies_dusk_vine` | tetranomicon, txdacompat | jar load order |
| `fibre/blue_skies_frostbright_vine` | tetranomicon, txdacompat | jar load order |
| `fibre/blue_skies_lunar_vine` | tetranomicon, txdacompat | jar load order |
| `fibre/blue_skies_maple_vine` | tetranomicon, txdacompat | jar load order |
| `fibre/blue_skies_starlit_vine` | tetranomicon, txdacompat | jar load order |

**Action item:** for any of these where the IridescentCraft team has stat opinions, ship an override JSON in `icraft_tetra_materials` with the desired stats. Datapack overrides are more durable than relying on jar load order.

---

## Design Notes (from existing custom-metal section)

The metal progression follows these principles - retained from prior 191-line wiki version, refined here for the new context.

1. **Durability scales exponentially.** T1 starts around iron (240), T2 ranges 300-500, T3 jumps to 650-1400, T4 reaches 2200-2500. Tetraextras (insanium 200000) and tetranomicon (iceandfire dragonsteel 8000) blow past T4 for explicit late-game progression beyond our normal curve.
2. **Primary damage scales linearly.** From 4.5 (T1 Brass) through 5.0-5.8 (T2), 6.0-7.0 (T3), to 8.5 (T4 Aethersteel). Tetraextras' insanium reaches 28 - intentionally outside our balance band.
3. **Tool efficiency tracks tier boundaries.** T1 = 6, T2 = 6.5-8, T3 = 8-9.5, T4 = 10-11.
4. **Magic capacity rewards specialization, not raw power.** The highest-MC materials in the pack are Iron's Spells arcane_ingot (184), tetraextras supremium/imperium (545), tetranomicon void_chitin (168) - all from external sources. Within our datapack, Elementium (150) leads, followed by Terrasteel (140), Dimlite (130), Manasteel (120). The highest-damage material (Aethersteel, 100) and the toughest physical material (Refined Obsidian, 76) intentionally have moderate-to-low MC.
5. **Secondary damage favors support/utility metals.** Lumium (4.4), Signalum (4.2), Brass (4.0), Charoite (4.8) lead in secondary among our datapack metals.
6. **Tertiary (armor) scales with physical toughness.** Aethersteel (4.5), Unorithe (4.5), Refined Obsidian (4.0), Iridium (4.0), Dimlite (5.5) lead our datapack. Fragile or magic-focused metals like Lumium (2.3) and Elementium (2.5) have the lowest values.
7. **Integrity cost/gain scales with tier.** T1-T2 metals cost 2 integrity, T3 costs 3, T4 costs 4. Integrity gain follows similarly (5 at T1-T2, 6-7 at T2-T3, 8-10 at T4).

---

## Source Coverage Summary

| Source | Materials | Categories Covered | Notes |
|---|---|---|---|
| Tetra (built-in) | 66 | 12 (bone/fabric/fibre/gem/metal/misc/rod/scale/skin/socket/stone/wood) | Vanilla baseline |
| `icraft_tetra_materials` (our datapack) | 35 | 3 (metal, gem, skin) | Curated 27 modded metals + custom gems + rotten skins |
| `iridescent-reforging-mod` | 8 | 1 (themed/) | Selector-only zero-stat materials |
| `iridescent-modular-spells-mod` | 15 | 2 (icraft_iss_books, icraft_ars_books) | MC-only spell book backings |
| `tetranomicon` | 497 | 9 | Pack-wide modded coverage; the catch-all |
| `tetraextras` | 41 | 9 | High-end netherite+ metals + cosmic-tier insanium/supremium |
| `tetracelium` | 34 | 6 | Botania/TF/Mekanism/AE2/gems compat - heavily overlaps datapack |
| `aetheric_tetranomicon` | 34 | 7 | Aether family compat |
| `art_of_forging` | 22 | 5 (incl. unique reagent + misc) | Endgame forging mod with own materials |
| `dimasctetracompat` | 17 | 4 | Dim-Asc Blue Skies compat |
| `irons_spellbooks` | 17 | 6 | Spell-school sockets + arcane materials |
| `txdacompat` | 31 | 6 | Tales from the Dim Ascended Blue Skies compat |
| `undergardenpatch` | 12 | 5 | Undergarden compat (overlaps datapack metals) |
| `adtetra` | 6 | 2 | Ad Astra compat |
| **Total** | **835** | -- | 49 cross-source duplicate keys |

---

## Future work / open questions

- [ ] **Per-tier-parity audit** (highest-value next pass). Rewrite per-material variant armor multipliers across ~1500-2000 variants in 52 armor modules to reflect the canonical tier hierarchy: T1 (iron/copper/brass) baseline; T2 (steel/manasteel/etc.) parity; T3 (terrasteel/elementium/etc.) parity at diamond+; T4 (netherite + Terramity onyx); **T4 peak = Aethersteel** (pinnacle of crafted progression, sits below Ad Astra postgame). Current state has a **vanilla-vs-modded inversion** (iron crown gives more armor than aethersteel crown) which is backwards from design intent. Tool: extend `iridescent-tetra-expansion-mod/tools/gen_per_material_variants.py` with a stat-tier matrix and regenerate. Verification: `tools/audit_modules.py` + tester screenshot.
- [ ] **≥1 armor floor across every (material, module) combination**. Per the 2026-05-28 user directive — the pack's difficulty is meaningfully above vanilla, so every material slot should contribute. Currently most lining-style modules produce <1 armor for every material. Bundled with the per-tier-parity audit above since the fixes are identical mechanics.
- [ ] **Lining + bridge modules don't accept fabric or fibre**. Despite the master design (`master.md` Part VII + `iridescent-modular-spells-tetra-migration.md` Phase 6C) defining fabric/fibre/skin as the canonical lining categories with differentiated stat themes, the bundle's `silk_lining`, `padded_lining`, `silk_boot_lining`, `padded_boot_lining`, `fur_boot_lining`, `cushioned_heel`, `silk_lacing`, `sash`, `cloth_strap`, `cloth_cuisses` all reject wool/manaweave/spellbinding_cloth/arcane_cloth/all fibres today. Adding per-material variants for the lore-fitting fabric/fibre materials to these 10 lining modules is bundled with the per-tier-parity audit.
- [ ] **Conflict resolution** for the 49 duplicate keys: decide which version is canonical and either (a) ship our own override in the datapack with intended stats, or (b) explicitly accept that the jar-load-order winner is fine. The Blue Skies key cluster (~25 dupes) is the highest-volume case.
- [ ] **Tetranomicon full per-key dump** — this doc summarises tetranomicon by category; if module authoring needs per-key stats, decompile the jar or extend the audit script.
- [ ] **Java-registered materials** — decompile `tetrasdelight`, `tetra_re_enlarged`, and `tetra_tables` if any user-visible Tetra material appears that this doc doesn't list. These three jars contain no datapack `tetra/materials/*.json` paths.
- [ ] **Tool-tier requirements for forge hammers** — tetranomicon introduces `tetranomicon:tier_ten` and `tetranomicon:tier_eleven` plus `tetra:maxed_forge_hammer`. Document the upgrade path for these custom tiers in a separate progression-flow page.
- [ ] **Per-spell-book magic capacity ramp** — currently 30/60/100/150 across copper -> netherite. Consider adding T0 (parchment) and T5 (archmage / necronomicon-tier sockets) for more granularity.
- [ ] **Fix gradle build env on the Windows dev host** — `build_mod.sh` fails with `java.io.IOException: Unable to establish loopback connection` at `sun.nio.ch.UnixDomainSockets.connect0` (Java 17+ Windows NIO bug, unrelated to our code). Until resolved, expansion-jar changes require in-place jar patching (the jar isn't signed, just zip-of-JSON). Tracked as IridescentCraft task #39.

---

## Method notes (for future audits)

- Tetra's canonical material location is `data/<namespace>/materials/<category>/[<subdir>/]<key>.json` inside any datapack OR mod jar. The `<namespace>` is whatever dir sits right under `data/` — usually `tetra` since most contributors register into the `tetra:` namespace by convention, but any mod CAN register into its own namespace if it wants its materials to coexist under a different key prefix. In practice, `iridescent_tetra_expansion-1.0.0.jar`, ISS, Botania, etc. all drop files under `data/tetra/materials/<cat>/`, so they all share the `tetra:` namespace pool (last-loaded wins on conflicts).
- Category is determined by the first directory under `materials/`; `key` is the JSON's `key` field (usually matches filename).
- To re-run this audit on the Windows dev host: walk every jar in the server's live `mods/` directory (`Z:\Users\<user>\Desktop\IridescentCraft Dedicated Server\mods\` on the server VM, or wherever locally), extract `data/*/materials/{skin,fabric,fibre,metal,gem,bone,rod,scale,stone,wood,socket,misc}/*.json` from each, parse JSON, group by source/category/key. Reference Python audit walker at `C:\tmp\skin_fabric_audit.py` from the 2026-05-28 session (the path-translation gotcha there: Windows Python's `os.path.join` mixes slashes; convert input paths to native Windows backslashes upfront).
- Modded jars sometimes register materials via Java code (not datapack); confirm with grep and decompile when materials appear in-game but not in this catalog.
- Datapack JSONs in `global_packs/required_data/` ship via Paxi; their effective load order is AFTER mod jars but BEFORE world saves, so they override jar registrations of the same `<namespace>/<category>/<key>`.
- The bundle source for the canonical custom materials lives at `iridescent-tetra-expansion-mod/src/main/resources/data/tetra/materials/<cat>/<key>.json`. The datapack source for ours lives at `.minecraft/datapack_sources/icraft_tetra_materials/data/tetra/materials/<cat>/<key>.json`. Always edit source-of-truth, not the deployed jar/zip — the deploy path rebuilds from source.

---

*This doc is a snapshot. When new mods are added or the existing ones are updated, re-run the audit and refresh the section counts. Never trust the count without re-running.*
