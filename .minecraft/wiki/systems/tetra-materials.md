# Tetra Materials Reference (Pack-Wide)

This is the canonical reference for every Tetra material in the IridescentCraft pack: Tetra's built-in materials, the pack's datapack additions, the custom materials in the unified `iridescent_tetra_expansion-1.0.0.jar`, and the compat addons that extend Tetra. The expansion jar bundles the former `iridescent-reforging-mod` and `iridescent-modular-spells-mod` source repos, and it has been the official deployed name since 2026-05-02.

Use it when you author per-material reforging variants, balance module values, choose repair items for new modules, or need to know which materials more than one source registers.

Last full audit: 2026-05-28. As of 2026-10-18 the pack ships 913 material files counted by source before dedupe (12 mod jars and 2 Paxi zips), 854 of them unique by file path (59 cross-source duplicates).

> Changes in the 2026-05-28 audit: 7 custom materials (`arcane_cloth`, `magebloom`, `paper`, `deathskin`, `rotten_leather`, `tf_arctic`, `tf_yeti`) were silently dropping their single-asterisk attributes, and that is fixed (see [Section 5](#section-5---critical-tetra-finickyness-rules)). `arcane_cloth` went from bare-minimum stats up to the T2 magical-cloth tier. The new [Section 2d](#2d-bundle-jar-magical-fabric--skin-materials-iridescent_tetra_expansion-100jar) covers `arcane_cloth`, `manaweave`, `spellbinding_cloth` and `magebloom`, none of which the 2026-04-29 audit documented. Section 4 was rewritten to describe the real per-material variant architecture: its earlier claim that "plate modules accept only 5 materials" came from the deprecated standalone `iridescent-reforging-mod/` source and contradicted the unified bundle's per-material variant model. [Section 5 (Critical Tetra Finickyness Rules)](#section-5---critical-tetra-finickyness-rules) is new. The per-tier-parity audit of the materials is still pending (see [Future work](#future-work--open-questions)). The canonical hierarchy: T1 = iron/copper/brass; T2 = steel/manasteel/etc.; T3 = terrasteel/elementium/etc.; T4 = netherite + Terramity onyx; the T4 peak is Aethersteel, the top of crafted progression, which sits below the Ad Astra postgame chain.

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

A Tetra material is a JSON file at `data/<namespace>/materials/<category>/[<subdir>/]<file>.json`. Tetra's reload listener walks every datapack/jar's `data/<namespace>/materials/...` tree (in this pack nearly always `data/tetra/materials/...`) and registers each file as a material whose ID is `<namespace>:<category>/<key>`. The file's directory sets the category, which module variant matchers such as `tetra:metal/` and `tetra:fabric/` use. The `key` field inside the JSON is the leaf identifier the variant matcher binds to: `"key": "iron"` matches `tetra:metal/iron`.

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

Modules accept materials through two patterns in their variant matchers:
- Exact match: `"materials": ["tetra:metal/iron"]` accepts only iron.
- Category prefix: `"materials": ["tetra:fabric/", "tetra:fibre/", "tetra:skin/"]` accepts any material in those categories (the trailing slash marks the wildcard). The namespace prefix matters: `tetra:fabric/` matches only Tetra-namespace fabrics, not `iridescent_reforging:fabric/...`. To use materials from another namespace, either use a wildcard with no namespace or list them explicitly.

When two datapacks or mods register the same `<category>/<key>`, the last one loaded wins. In this pack the Paxi zips load after every mod jar's data. For example, our datapack and `dimasctetracompat` both register the Blue Skies materials `diopside` and `horizonite`; our `charoite` is filed under metal/ and does not collide with theirs, the Blue Skies entries in `txdacompat` carry a blue_skies_ prefix, and `tetracelium` registers none. [Cross-source duplicate keys](#cross-source-duplicate-keys) has the full list and which version usually wins.

---

## Section 1 - Tetra built-in materials

From `tetra-1.20.1-6.12.0.jar` at `data/tetra/materials/`: 66 materials in 12 categories, all under the `tetra:` namespace.

### bone (1)

| Key | Primary | Sec | Tert | Dur | IC | IG | MC | Eff | Tool Level | Repair Item |
|---|---|---|---|---|---|---|---|---|---|---|
| `bone` | 5 | 1.9 | 4.5 | 120 | 1 | 5 | 108 | 4.5 | `minecraft:stone` | `minecraft:bone` |

### fabric (16) - all wools

All wool variants have the same stats. The base `wool` entry uses the tag (`#minecraft:wool`); each colored variant names its own item.

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

Sockets are zero-stat materials for slotting gem- or charm-like enhancements. The durability shown is the socket's lifetime: the number of uses before it is consumed.

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

IridescentCraft's own sources define these materials, and they exist only in this pack.

### 2a. Datapack metals + gems (`icraft_tetra_materials`)

The datapack's source is `.minecraft/datapack_sources/icraft_tetra_materials/` (namespace `tetra:`); Paxi loads it from `config/paxi/datapacks/icraft_tetra_materials.zip`. It first shipped 27 modded metal materials. Gems, skins and other materials were added later, and as of 2026-10-18 it has 101 in total: 59 metal, 36 gem, 4 skin, 1 bone, 1 fibre.

Every number in the tables below is read from the zip the game loads (2026-10-18). **Hammer** is the hammer head a Tetra workbench needs to forge the material (`requiredTools.hammer_dig`; "-" means any head). **Gate** is the stage that locks the material's repair item in game (AStages, `astages_restrictions.js`): "T3 (mod)" when the whole mod is staged, "none" when no stage locks the item (it may still come only from a gated dimension). A material has no tier of its own beyond these two: Dimlite and Iridium, for example, come from Terramity (not Mekanism) and no stage locks them.

#### Metals (27)

| Key | Source | Dur | Prim | Sec | Tert | Eff | Tool Level | Hammer | Magic Cap | Gate | Repair Item |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `undergarden_cloggrum` | Undergarden | 350 | 5.5 | 3 | 2.5 | 6.5 | iron | stone | 90 | none | `undergarden:cloggrum_ingot` |
| `brass` | Create | 240 | 4.5 | 4 | 2.5 | 6 | iron | gold | 85 | none | `create:brass_ingot` |
| `lumium` | Thermal | 320 | 4.8 | 4.4 | 2.3 | 7.5 | diamond | iron | 130 | T2 | `thermal:lumium_ingot` |
| `ironwood` | Twilight Forest | 340 | 5 | 3.6 | 3 | 6.5 | iron | iron | 95 | none | `twilightforest:ironwood_ingot` |
| `signalum` | Thermal | 300 | 5 | 4.2 | 2.5 | 7.5 | diamond | iron | 130 | T2 | `thermal:signalum_ingot` |
| `charoite` | Blue Skies | 400 | 5.2 | 4.8 | 3 | 7 | iron | gold | 160 | none | `blue_skies:charoite` |
| `dimlite` | Terramity | 400 | 5.2 | 3 | 4 | 7 | iron | iron | 130 | none | `terramity:dimlite_ingot` |
| `manasteel` | Botania | 350 | 5.2 | 3.6 | 2.8 | 7 | diamond | iron | 150 | T2 | `botania:manasteel_ingot` |
| `steeleaf` | Twilight Forest | 380 | 5.3 | 3.8 | 3 | 7 | diamond | iron | 110 | none | `twilightforest:steeleaf_ingot` |
| `garnite` | The Abyss | 400 | 5.5 | 5 | 3 | 7.5 | diamond | iron | 100 | none | `theabyss:garnite_ingot` |
| `horizonite` | Blue Skies | 450 | 5.5 | 5 | 3.5 | 7.5 | diamond | iron | 105 | none | `blue_skies:horizonite_ingot` |
| `steel` | Thermal | 400 | 5.5 | 3.5 | 3.2 | 7 | diamond | iron | 90 | T2 | `thermal:steel_ingot` |
| `knightmetal` | Twilight Forest | 500 | 5.6 | 3.2 | 3.5 | 7.5 | diamond | iron | 95 | none | `twilightforest:knightmetal_ingot` |
| `fiery` | Twilight Forest | 460 | 5.8 | 3.4 | 3.2 | 7.5 | diamond | iron | 165 | none | `twilightforest:fiery_ingot` |
| `undergarden_froststeel` | Undergarden | 450 | 5.8 | 3.5 | 2.8 | 7 | diamond | iron | 105 | none | `undergarden:froststeel_ingot` |
| `deorum` | Forbidden & Arcanus | 700 | 6 | 5.5 | 3.5 | 8 | diamond | iron | 155 | none | `forbidden_arcanus:deorum_ingot` |
| `osmium` | Mekanism | 650 | 6 | 3.2 | 3.2 | 8 | diamond | iron | 110 | T3 (mod) | `mekanism:ingot_osmium` |
| `phantom` | The Abyss | 600 | 6 | 5.5 | 3.5 | 8 | diamond | iron | 145 | none | `theabyss:phantom_ingot` |
| `elementium` | Botania | 720 | 6.2 | 3.4 | 2.5 | 8.5 | diamond | iron | 175 | T3 | `botania:elementium_ingot` |
| `terrasteel` | Botania | 800 | 6.5 | 3 | 3 | 9 | diamond | iron | 155 | T3 | `botania:terrasteel_ingot` |
| `enderium` | Thermal | 900 | 6.8 | 3 | 3.5 | 9.5 | netherite | iron | 170 | T3 | `thermal:enderium_ingot` |
| `undergarden_forgotten_metal` | Undergarden | 800 | 6.8 | 4.2 | 3.5 | 8 | diamond | iron | 150 | none | `undergarden:forgotten_ingot` |
| `refined_obsidian` | Mekanism | 1000 | 7 | 2.8 | 4 | 9 | netherite | iron | 150 | T3 (mod) | `mekanism:ingot_refined_obsidian` |
| `iridium` | Terramity | 900 | 6.5 | 3.5 | 3.5 | 8.5 | diamond | diamond | 160 | none | `terramity:iridium` |
| `knight` | The Abyss | 750 | 6.5 | 6 | 4 | 8.5 | diamond | diamond | 145 | none | `theabyss:knight_ingot` |
| `unorithe` | The Abyss | 1200 | 7 | 6.5 | 4.5 | 9.5 | netherite | diamond | 140 | none | `theabyss:unorithe_ingot` |
| `aethersteel` | Aethersteel | 2500 | 8.5 | 3.2 | 4.5 | 11 | netherite | 7 | 210 | T4 | `aethersteel:aethersteel_ingot` |

> Columns: Primary is the main attack damage, Secondary the sweeping/off-hand damage, Tertiary the armor/blocking value. Tool Level is what blocks the tool can mine (iron < diamond < netherite). Magic Capacity is how many enchantment improvements the material can hold in Tetra's system. Rows are sorted by hammer, then primary.

#### Gems (7)

| Key | Source | Dur | Prim | Sec | Tert | Eff | Tool Level | Hammer | Magic Cap | Gate | Repair Item |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `diamond_no_t` | Vanilla | 380 | 5.4 | 3.8 | 3 | 6 | iron | - | 130 | T3 | `minecraft:diamond` |
| `diopside` | Blue Skies | 350 | 5 | 4.5 | 3 | 8 | iron | gold | 90 | none | `blue_skies:diopside_gem` |
| `ruby` | Terramity | 600 | 5.5 | 3.5 | 3 | 7 | iron | iron | 125 | none | `terramity:ruby` |
| `sapphire` | Terramity | 600 | 5.5 | 3.5 | 3 | 7 | iron | iron | 125 | none | `terramity:sapphire` |
| `topaz` | Terramity | 600 | 5.5 | 3.5 | 3 | 7 | iron | iron | 125 | none | `terramity:topaz` |
| `undergarden_utherium` | Undergarden | 600 | 6.2 | 3.8 | 3.2 | 7.5 | diamond | iron | 140 | none | `undergarden:utherium_crystal` |
| `onyx` | Terramity | 1500 | 7.5 | 3.5 | 4 | 9 | netherite | netherite | 165 | none | `terramity:onyx` |

#### Skins, bone and fibre (5)

| Key | Source | Dur | Prim | Sec | Tert | Eff | Tool Level | Hammer | Magic Cap | Gate | Repair Item |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `paper` | Vanilla | 80 | 1 | 0.5 | 2 | 0 | 0 | - | 90 | none | `minecraft:paper` |
| `deathskin` | Vanilla | 80 | 3 | 1 | 1 | 0 | 0 | - | 80 | none | `minecraft:rotten_flesh` |
| `tf_arctic` | Twilight Forest | 220 | 4.8 | 3.8 | 3 | 6 | iron | - | 100 | none | `twilightforest:arctic_fur` |
| `rotten_leather` | Forbidden & Arcanus | 180 | 5 | 2 | 1 | 0 | 0 | - | 100 | none | `forbidden_arcanus:rotten_leather` |
| `tf_yeti` | Twilight Forest | 340 | 5.2 | 3.8 | 3 | 6 | iron | - | 110 | none | `twilightforest:alpha_yeti_fur` |

#### Boss and trophy materials (58)

Each is made from one boss's drop or trophy (the repair item); a `disable:this` repair item means the material cannot be repaired or crafted.

| Key (category) | Source | Dur | Prim | Sec | Tert | Eff | Tool Level | Hammer | Magic Cap | Gate | Repair Item |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `bs_pyrope` (gem) | - | 280 | 5 | 3.8 | 3 | 6 | iron | - | 145 | - | `disable:this` |
| `fa_mortem` (metal) | - | 300 | 5.2 | 3.8 | 3 | 6 | iron | - | 160 | - | `disable:this` |
| `dd_resonarium` (gem) | Deeper & Darker | 360 | 5.4 | 3.8 | 3 | 6 | iron | - | 165 | none | `deeperdarker:resonarium` |
| `bm_gob` (metal) | Terramity | 360 | 5.5 | 3.2 | 3.2 | 6 | iron | - | 120 | none | `terramity:gobs_gilded_hat_helmet` |
| `bm_mnaga` (gem) | Mowzie's Mobs | 360 | 5.5 | 3.2 | 3.2 | 6 | iron | - | 120 | none | `mowziesmobs:naga_fang` |
| `bm_sculptor` (gem) | Mowzie's Mobs | 360 | 5.5 | 3.2 | 3.2 | 6 | iron | - | 120 | none | `mowziesmobs:sculptor_staff` |
| `bm_sniffer` (gem) | Terramity | 360 | 5.5 | 3.2 | 3.2 | 6 | iron | - | 120 | none | `terramity:gaianite_cluster` |
| `bm_umvuthi` (metal) | Mowzie's Mobs | 360 | 5.5 | 3.2 | 3.2 | 6 | iron | - | 120 | none | `mowziesmobs:sol_visage` |
| `bm_wroughtnaut` (metal) | Mowzie's Mobs | 360 | 5.5 | 3.2 | 3.2 | 6 | iron | - | 120 | none | `mowziesmobs:wrought_helmet` |
| `tf_naga` (bone) | Twilight Forest | 400 | 5.6 | 3.8 | 3 | 6 | iron | - | 105 | none | `twilightforest:naga_scale` |
| `dd_warden` (metal) | - | 540 | 6.2 | 3.8 | 3 | 6 | iron | - | 120 | - | `disable:this` |
| `fa_draco_arcanus` (metal) | - | 580 | 6.4 | 3.8 | 3 | 6 | iron | - | 175 | - | `disable:this` |
| `bm_frostmaw` (gem) | Mowzie's Mobs | 540 | 6.6 | 3.4 | 3.6 | 7 | iron | - | 145 | none | `mowziesmobs:ice_crystal` |
| `bs_alchemist` (metal) | Blue Skies | 540 | 6.6 | 3.4 | 3.6 | 7 | iron | - | 145 | none | `blue_skies:ventium_ingot` |
| `bs_arachnarch` (gem) | Blue Skies | 540 | 6.6 | 3.4 | 3.6 | 7 | iron | - | 145 | none | `blue_skies:spider_webbing` |
| `bs_starlit` (metal) | Blue Skies | 540 | 6.6 | 3.4 | 3.6 | 7 | iron | - | 145 | none | `blue_skies:falsite_ingot` |
| `bs_summoner` (gem) | Blue Skies | 540 | 6.6 | 3.4 | 3.6 | 7 | iron | - | 145 | none | `blue_skies:soul_fragment` |
| `fa_tyr` (metal) | - | 620 | 6.6 | 3.8 | 3 | 6 | iron | - | 155 | - | `disable:this` |
| `tf_hydra` (metal) | Twilight Forest | 540 | 6.6 | 3.4 | 3.6 | 7 | iron | - | 145 | none | `twilightforest:fiery_blood` |
| `tf_knightphantom` (metal) | Twilight Forest | 540 | 6.6 | 3.4 | 3.6 | 7 | iron | - | 145 | none | `twilightforest:knightmetal_ring` |
| `tf_lich` (gem) | Twilight Forest | 540 | 6.6 | 3.4 | 3.6 | 7 | iron | - | 145 | none | `twilightforest:lich_trophy` |
| `tf_minoshroom` (metal) | Twilight Forest | 540 | 6.6 | 3.4 | 3.6 | 7 | iron | - | 145 | none | `twilightforest:minoshroom_trophy` |
| `tf_snowqueen` (gem) | Twilight Forest | 540 | 6.6 | 3.4 | 3.6 | 7 | iron | - | 145 | none | `twilightforest:snow_queen_trophy` |
| `tf_urghast` (gem) | Twilight Forest | 540 | 6.6 | 3.4 | 3.6 | 7 | iron | - | 145 | none | `twilightforest:fiery_tears` |
| `cm_ignitium` (metal) | Cataclysm | 950 | 8.2 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `cataclysm:ignitium_ingot` |
| `cm_leviathan` (metal) | Cataclysm | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `cataclysm:abyssal_egg` |
| `cm_monstrosity` (metal) | Cataclysm | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `cataclysm:lava_power_cell` |
| `cm_scylla` (gem) | Cataclysm | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `cataclysm:lacrima` |
| `cs_drakara` (metal) | Cardinal Sins | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `cardinal_sins:dragongreatsword` |
| `cs_envy` (gem) | Cardinal Sins | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `cardinal_sins:essenceofenvy` |
| `cs_gluttony` (gem) | Cardinal Sins | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `cardinal_sins:essenceofgluttony` |
| `cs_greed` (gem) | Cardinal Sins | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `cardinal_sins:essenceofgreed` |
| `cs_lust` (gem) | Cardinal Sins | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `cardinal_sins:essenceoflust` |
| `cs_pride` (gem) | Cardinal Sins | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `cardinal_sins:essenceofpride` |
| `cs_sloth` (gem) | Cardinal Sins | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `cardinal_sins:essenceofsloth` |
| `cs_wrath` (gem) | Cardinal Sins | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `cardinal_sins:essenceofwrath` |
| `dd_stalker` (gem) | Deeper & Darker | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `deeperdarker:soul_crystal` |
| `iss_archevoker` (gem) | Iron's Spells | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `irons_spellbooks:arcane_essence` |
| `iss_citadel` (metal) | Iron's Spells | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `irons_spellbooks:keeper_flamberge` |
| `iss_deadking` (metal) | Iron's Spells | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `irons_spellbooks:blood_staff` |
| `iss_magehunter` (metal) | Iron's Spells | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `irons_spellbooks:magehunter` |
| `iss_tyros` (gem) | Iron's Spells | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `irons_spellbooks:cinder_essence` |
| `tm_circe` (gem) | Terramity | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `terramity:malediction_bracelets` |
| `tm_gatmancer` (gem) | Terramity | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `terramity:occult_fabric` |
| `ug_forgotten_guardian` (metal) | Undergarden | 920 | 8.3 | 3.6 | 3.8 | 9 | netherite | diamond | 200 | none | `undergarden:forgotten_nugget` |
| `cm_cursium` (metal) | Cataclysm | 900 | 8.4 | 3.4 | 4 | 9 | netherite | diamond | 200 | none | `cataclysm:cursium_ingot` |
| `ae_slider` (metal) | The Aether | 1200 | 8.6 | 3.4 | 3.6 | 10 | netherite | diamond | 200 | none | `aether:carved_stone` |
| `cm_witherite` (metal) | Cataclysm | 1000 | 8.6 | 3.2 | 4.2 | 9 | netherite | diamond | 200 | none | `cataclysm:witherite_ingot` |
| `ae_sunspirit` (metal) | The Aether | 1260 | 8.8 | 3.4 | 3.6 | 10 | netherite | diamond | 210 | none | `aether:sun_altar` |
| `ae_valkyrie` (metal) | The Aether | 1260 | 8.8 | 3.4 | 3.6 | 10 | netherite | diamond | 210 | none | `aether:victory_medal` |
| `bo_gaia` (gem) | Botania | 1320 | 9 | 3.4 | 4.5 | 10 | netherite | diamond | 220 | none | `botania:life_essence` |
| `cm_ancient_metal` (metal) | Cataclysm | 1320 | 9 | 3.4 | 4.5 | 10 | netherite | diamond | 220 | none | `cataclysm:ancient_metal_ingot` |
| `cm_ender_guard` (metal) | Cataclysm | 1300 | 9 | 3.4 | 4.5 | 10 | netherite | diamond | 220 | none | `cataclysm:gauntlet_of_guard` |
| `da_eots` (metal) | Deep Aether | 1320 | 9 | 3.4 | 4.5 | 10 | netherite | diamond | 220 | none | `deep_aether:squall_plate` |
| `tm_thunker` (gem) | Terramity | 1320 | 9 | 3.4 | 4.5 | 10 | netherite | diamond | 220 | none | `terramity:chthonic_crystal` |
| `tm_virtue` (gem) | Terramity | 1320 | 9 | 3.4 | 4.5 | 10 | netherite | diamond | 220 | none | `terramity:angel_feather` |
| `vn_dragon` (gem) | Vanilla | 1320 | 9 | 3.4 | 4.5 | 10 | netherite | diamond | 220 | none | `minecraft:dragon_breath` |
| `vn_warden` (metal) | Vanilla | 1320 | 9 | 3.4 | 4.5 | 10 | netherite | diamond | 220 | none | `minecraft:echo_shard` |

#### Partial overrides of Tetra's own materials

These change only the primary value and magic capacity of the vanilla materials:

- `gem/diamond`: primary 6, magic capacity 130
- `metal/gold`: primary 3, magic capacity 165
- `metal/iron`: primary 5, magic capacity 84
- `metal/netherite`: primary 7.24, magic capacity 155

### 2b. Themed reforging materials (`tetra:themed/*`)

Eight themed materials in the expansion jar, under `data/tetra/materials/themed/` (namespace `tetra:`, so `tetra:themed/<key>`). Each uses one item as its material and carries its own spell-power attribute, which a module made of it adds to the armour piece. Every one of the jar's 56 armour modules has a themed variant.

| Key | Item | Attributes |
|---|---|---|
| `themed/blood` | `irons_spellbooks:blood_vial` | `**irons_spellbooks:blood_spell_power` 0.1 |
| `themed/ender` | `minecraft:ender_pearl` | `**irons_spellbooks:spell_power` 0.05 |
| `themed/fire` | `irons_spellbooks:cinder_essence` | `**irons_spellbooks:fire_spell_power` 0.1 |
| `themed/holy` | `irons_spellbooks:divine_pearl` | `**irons_spellbooks:holy_spell_power` 0.1 |
| `themed/ice` | `irons_spellbooks:frozen_bone` | `**irons_spellbooks:ice_spell_power` 0.1 |
| `themed/lightning` | `irons_spellbooks:lightning_bottle` | `**irons_spellbooks:lightning_spell_power` 0.1 |
| `themed/nature` | `minecraft:oak_sapling` | `**irons_spellbooks:spell_power` 0.05 |
| `themed/shadow` | `minecraft:ghast_tear` | `**irons_spellbooks:spell_power` 0.05 |

### 2c. Spell-book materials (`iridescent-modular-spells-mod`)

15 custom material entries that back the per-spellbook conversion recipes for Iron's Spells & Spellbooks (ISS) and Ars Nouveau (Ars) spell books, under `data/tetra/materials/{icraft_iss_books,icraft_ars_books}/`. Their categories (`icraft_iss_books`, `icraft_ars_books`) are non-standard so that Tetra's general matchers never pick them up; the `iss_book` / `ars_book` modules in the same mod accept them explicitly.

| Category | Key | Magic Cap | Attributes |
|---|---|---|---|
| `icraft_ars_books` | `apprentice_spell_book` | 95 | `**irons_spellbooks:spell_power` 0.1 |
| `icraft_ars_books` | `archmage_spell_book` | 155 | `**irons_spellbooks:spell_power` 0.2, `**irons_spellbooks:max_mana` 0.15 |
| `icraft_ars_books` | `novice_spell_book` | 70 | `**irons_spellbooks:spell_power` 0.05 |
| `icraft_iss_books` | `blaze_spell_book` | 145 | `**irons_spellbooks:fire_spell_power` 0.25, `irons_spellbooks:max_mana` 50, `**irons_spellbooks:spell_power` 0.05 |
| `icraft_iss_books` | `copper_spell_book` | 95 | `**irons_spellbooks:spell_power` 0.05 |
| `icraft_iss_books` | `diamond_spell_book` | 130 | `**irons_spellbooks:spell_power` 0.1, `irons_spellbooks:max_mana` 50, `**irons_spellbooks:cooldown_reduction` 0.05 |
| `icraft_iss_books` | `dragonskin_spell_book` | 155 | `**irons_spellbooks:ender_spell_power` 0.25, `irons_spellbooks:max_mana` 50, `**irons_spellbooks:spell_power` 0.05 |
| `icraft_iss_books` | `druidic_spell_book` | 150 | `**irons_spellbooks:nature_spell_power` 0.2, `irons_spellbooks:max_mana` 25, `**irons_spellbooks:spell_power` 0.05 |
| `icraft_iss_books` | `evoker_spell_book` | 160 | `**irons_spellbooks:evocation_spell_power` 0.25, `**irons_spellbooks:summon_damage` 0.1, `irons_spellbooks:max_mana` 50, `**irons_spellbooks:spell_power` 0.05 |
| `icraft_iss_books` | `gold_spell_book` | 165 | `irons_spellbooks:max_mana` 25, `**irons_spellbooks:spell_power` 0.05 |
| `icraft_iss_books` | `iron_spell_book` | 84 | `**irons_spellbooks:spell_power` 0.05, `irons_spellbooks:max_mana` 25 |
| `icraft_iss_books` | `necronomicon_spell_book` | 165 | `**irons_spellbooks:blood_spell_power` 0.3, `**irons_spellbooks:eldritch_spell_power` 0.3, `**irons_spellbooks:cooldown_reduction` 0.1, `**irons_spellbooks:spell_power` 0.05 |
| `icraft_iss_books` | `netherite_spell_book` | 155 | `**irons_spellbooks:spell_power` 0.15, `irons_spellbooks:max_mana` 100 |
| `icraft_iss_books` | `rotten_spell_book` | 100 | `**irons_spellbooks:spell_power` 0.15 |
| `icraft_iss_books` | `villager_spell_book` | 90 | `**irons_spellbooks:cast_time_reduction` 0.15, `**irons_spellbooks:holy_spell_power` 0.15, `irons_spellbooks:max_mana` 25, `**irons_spellbooks:spell_power` 0.05 |

All other stats (primary/secondary/tertiary/durability/efficiency) are 0. Each book material carries the attributes above, and the book module variants in `data/tetra/modules/{iss_book,ars_book}/*.json` apply the max-mana / mana-regen / cast-time / spell-power / cooldown improvements.

### 2d. Bundle-jar magical fabric + skin materials (`iridescent_tetra_expansion-1.0.0.jar`)

Three magical fabric materials and one magical skin from the unified bundle jar. They are registered under the `tetra:` namespace: the path inside the jar is `data/tetra/materials/<cat>/<key>.json`, so the namespace is `tetra`, not `iridescent_modular_spells`. They join the `tetra:fabric/` and `tetra:skin/` category pools next to vanilla wool, leather and hide, so any module variant that targets `tetra:fabric/` or `tetra:skin/` (or an exact key in those categories) can use them.

| Cat | Key | Prim | Sec | Tert | Dur | iC | iG | MC | Repair Item | Attributes (post-2026-05-28 `**` fix) |
|---|---|---|---|---|---|---|---|---|---|---|
| fabric | `arcane_cloth` | 1 | 1 | 5 | 250 | 1 | 4 | 160 | `irons_spellbooks:magic_cloth` | `**mana_regen 0.05` + `**max_mana 0.05` + `**spell_power 0.025` |
| fabric | `manaweave` | 1 | 1 | 5 | 240 | 1 | 4 | 150 | `botania:manaweave_cloth` | -- (relies on tertiary stat) |
| fabric | `spellbinding_cloth` | 1 | 1 | 5 | 320 | 1 | 4 | 200 | `botania:spell_cloth` | -- (relies on tertiary + 200 MC) |
| skin | `magebloom` | 0.6 | 4.5 | 1 | 90 | 1 | 3 | 130 | `ars_nouveau:magebloom_fiber` | `**spell_power 0.05` |

> Tiers: `arcane_cloth` is the entry T2 magical cloth (it had bare-minimum stats until the 2026-05-28 boost). `manaweave` is mid-tier, with a Botania flavor. `spellbinding_cloth` is upper-tier (MC 200, above both manaweave at MC 150 and the upstream ISS `irons_spellbooks_arcane_cloth` at MC 180). `magebloom` is a magic skin made from Ars Nouveau's magebloom fiber, themed as a "tough but flexible high-magic skin substitute"; its high secondary (4.5) fits the spinning/weaving identity.

> **The `**` prefix is required.** All four use `**`-prefixed ISS percent attributes (MULTIPLY_TOTAL). With a single asterisk `*` (MULTIPLY_BASE), Tetra's `AttributeHelper.collapse()` silently drops an ISS percent attribute to 0 when no ADDITION sibling exists. [Section 5](#section-5---critical-tetra-finickyness-rules) has the full rule. Before 2026-05-28, `arcane_cloth` and `magebloom` shipped with the broken `*` prefix and their magic bonuses never showed in game; the deployed jar was fixed with an in-place JSON patch (the jar isn't signed).

> ISS has a separate arcane_cloth. `irons_spellbooks` ships its own `arcane_cloth` material under the `tetra:` namespace, with the key prefix `irons_spellbooks_` (full key: `tetra:fabric/irons_spellbooks_arcane_cloth`). Stats: P=1, S=1, T=5, dur=300, MC=180, `**cooldown_reduction=0.15`. The identifiers differ, so it coexists with our `tetra:fabric/arcane_cloth` without a key collision. See [Section 3.10](#310-irons_spellbooks-1201-31551jar-17-materials).

### 2e. Datapack-side magical attribute carriers (`icraft_tetra_materials`, post-2026-05-28)

Five datapack materials add `**`-prefixed ISS attributes on top of their base stats, for spell-tier flavor:

| Cat | Key | Attributes |
|---|---|---|
| fibre | `paper` | `**spell_power 0.05` |
| skin | `deathskin` | `**mana_regen 0.025` + `iridescent_reforging:damage_vs_undead 0.05` (plain ADDITION on a custom Forge attr, which renders cleanly per lesson 2026-05-13 #4) |
| skin | `rotten_leather` | `**holy_spell_power 0.1` + `**mana_regen 0.05` + `**spell_power 0.15` |
| skin | `tf_arctic` | `**ice_magic_resist 0.1` + `**spell_power 0.1` |
| skin | `tf_yeti` | `**ice_magic_resist 0.12` + `**spell_power 0.1` |

Before 2026-05-28 all of these shipped with a single asterisk, and their bonuses never showed. The 2026-05-28 fix converted 8 attributes across 7 materials (2 of them in Section 2d) to `**`. Until then, a player whose gear used any of these got +0 magic stat from the material attribute, although the file declared the bonus.

---

## Section 3 - Modded Tetra extensions

These compat and addon mods register more Tetra materials: 711 in total across 10 jars.

### 3.1. tetranomicon-1.6.1-1.20.1.jar (497 materials)

The largest external source: it registers Tetra materials for nearly every modded ore, wood and vine in the pack. Coverage by category:

| Category | Count | Notable mods covered |
|---|---|---|
| `bone` | 11 | alexsmobs, deep_dark_regrowth, deeperdarker, unusualprehistory |
| `fibre` | 34 | atmospheric, betterend, betternether, biomesoplenty, blue_skies, deeperdarker, regions_unexplored, silentgear, tropicraft, voidscape |
| `gem` | 63 | ms_*, oresabovediamonds, organics, phantasm, silentgems_*, tropicraft, voidscape, deeperdarker, blue_skies, betterend |
| `metal` | 73 | ad_astra, betterend, betternether, blue_skies, create, embers, enderitemod, epicsamurai, forbidden_arcanus, iceandfire, l2complements, majruszdifficulty, ms_*, nature_arise, organics, samurai_dynasty, silentgear, twilightforest |
| `rod` | 4 | ms_*, tropicraft, betternether |
| `scale` | 7 | alexsmobs, twilightforest, unusualprehistory |
| `skin` | 8 | alexsmobs, ms_*, tropicraft |
| `socket` | 111 | broad coverage of every gem-providing mod |
| `stone` | 67 | ad_astra, betterend, blue_skies, create, deeperdarker, ms_*, quark, regions_unexplored, unearthed |
| `wood` | 119 | atmospheric, autumnity, betterend, betternether, biomesoplenty, blue_skies, ecologics, environmental, ms_*, regions_unexplored, twilightforest, tropicraft |

Tetranomicon's highest primary per category, for reference when balancing modules:

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

> Tetranomicon adds custom tool tiers (`tetranomicon:tier_ten`, `tetranomicon:tier_eleven`, `tetra:maxed_forge_hammer`) for its highest-end materials. These tiers are not the same as vanilla netherite: they need fully upgraded Tetra hammers. Iceandfire's dragonsteel materials and voidscape's astral_crystal are at the very top.

> Tetranomicon registers the full list of Twilight Forest, Blue Skies, Undergarden and other modded metals under its own keys (for example `tetranomicon`'s `twilightforest_knightmetal` next to our datapack's plain `knightmetal`). The keys differ, so the two sets don't conflict; [duplicate keys](#cross-source-duplicate-keys) lists the real conflicts.

Tetranomicon's 497 entries are too many for a per-key table here. To check one material, open `data/tetra/materials/<cat>/<key>.json` in the tetranomicon jar.

### 3.2. tetraextras-0.1.4-1.20.1.jar (41 materials)

High-end netherite-tier metals plus a few fibre, scale, skin, wood, stone and gem additions. Many are extremely strong on purpose: tetraextras is built for late-game progression beyond vanilla netherite.

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

> Conflicts: tetraextras' `brass` (5.5/4/4.5/520) and our datapack's `brass` (4.5/4/2.5/240) share a key, and the last one loaded wins.
> tetraextras also overrides `amethyst` (gem) with an iron tool level.

### 3.3. tetracelium-1.20.1-1.3.1.jar (34 materials)

Compat layer for Botania, Twilight Forest, Mekanism, AE2, Thermal and gem mods. It overlaps heavily with our datapack: it ships its own `manasteel`, `terrasteel`, `elementium`, `ironwood`, `knightmetal`, `steeleaf`, `osmium`, `steel`, `fiery_ingot` (a different key), `ruby`, `sapphire` and more.

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

> Most of the conflicts are here: `manasteel`, `terrasteel`, `elementium`, `ironwood`, `knightmetal`, `steeleaf`, `osmium`, `steel`, `ruby`, `sapphire`. For these keys tetracelium's values differ a lot from our datapack's, and datapack load order decides which wins. Datapacks under `Paxi:required_data` load after mod-jar datapacks, so in practice our `icraft_tetra_materials` should override tetracelium for the shared keys; if unsure, check in game with `/tetra debug material`.

### 3.4. aetheric_tetranomicon-1.2.0-1.20.1.jar (34 materials)

Aether / Deep Aether / Aether Redux / Ancient Aether compat. Its stats follow the source mods' own armor materials.

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

> The pack overrides five of these (2026-10-16, when the Aether moved to tier 4). The table above shows the jar's own values. In the
> pack, netherite is the tier-4 floor and only Aethersteel is above it, so the Aether family is raised to that floor
> (each keeps its own perks, and all are forged with a diamond hammer):
>
> | Key | Prim | Dur | MC | Eff | Tool Level |
> |---|---|---|---|---|---|
> | `aether_zanite` | 7.24 | 2031 | 155 | 9 | netherite |
> | `aether_gravitite` | 7.72 | 2031 | 155 | 9 | netherite |
> | `aether_valkyrie` | 7.72 | 2031 | 155 | 9 | netherite |
> | `aether_phoenix` | 8.2 | 2031 | 155 | 9 | netherite |
> | `deep_aether_skyjade` | 7.24 | 1219 | 1 | 10 | netherite |
>
> `deep_aether_stratus` no longer takes the stratus ingot: the pack's own `stratus` material (8.4 primary, 1300 durability)
> is the one a stratus ingot makes.

### 3.5. art_of_forging-1.8.4-1.20.1.jar (22 materials)

Art of Forging is itself a Tetra extension that adds a forging mechanic; its materials cover the new endgame metals it adds.

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

> Reagents are a category only Art of Forging has: its forging recipes consume them, and they are not used as plate materials.

### 3.6. dimasctetracompat-1.20.1-1.5.0.0.jar (17 materials)

Compat for "Dim Asc" (Dimensional Ascension Blue Skies). Its Blue Skies materials overlap heavily with `txdacompat` and our datapack.

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

> `diopside` and `horizonite` are defined by both our datapack and `dimasctetracompat`, under the same file path and with different stats. `charoite` is not a conflict: our datapack files it under metal/ and the compat jar under gem/. The `txdacompat` versions carry a blue_skies_ prefix and collide with tetranomicon instead. Check the winner in game.
>
> Diopside is settled (October 2026). Tetra merges the two `diopside` files field by field, with the pack's datapack last, so the pack's numbers win (the T2 row above: primary 5, durability 350). The pack's file named an item that does not exist, so nothing made the material until it was pointed at `blue_skies:diopside_gem`; a diopside blade now forges from the gem.

### 3.7. txdacompat-1.0.3-forge-1.20.1.jar (31 materials)

Another Blue Skies / Tales from the Dim Ascended compat. It overlaps strongly with `tetranomicon`'s Blue Skies entries.

| Cat | Sample keys | Top stats |
|---|---|---|
| metal | `blue_skies_horizonite` | 5 / 3.8 / 3 / dur 250 / iron |
| gem | `blue_skies_aquite`, `blue_skies_charoite`, `blue_skies_diopside`, `blue_skies_moonstone`, `blue_skies_pyrope`, `moonstone` | up to 8 prim (diopside) / 1661 dur |
| fibre | `blue_skies_bluebright_vine`, `blue_skies_brumble_vine`, `blue_skies_dusk_vine`, `blue_skies_frostbright_vine`, `blue_skies_lunar_vine`, `blue_skies_maple_vine`, `blue_skies_starlit_vine` | 3-5 prim, 200-320 dur |
| stone | `blue_skies_cinderstone`, `blue_skies_lunar_stone`, `blue_skies_rimestone`, `blue_skies_taratite`, `blue_skies_turquoise_stone`, `blue_skies_umber` | 4-4.6 prim, 131-512 dur |
| wood | `blue_skies_bluebright`, `blue_skies_comet`, `blue_skies_dusk`, `blue_skies_frostbright`, `blue_skies_lunar_wood`, `blue_skies_maple`, `blue_skies_starlit_wood` | 3-3.5 prim, 59-100 dur |
| socket | `socket_blue_skies_charoite`, `socket_blue_skies_diopside`, `socket_blue_skies_moonstone`, `socket_blue_skies_pyrope` | dur 512-714 |

> 30 of these 31 keys also appear in `tetranomicon`, with the same stats except for blue_skies_moonstone; the 31st, moonstone, is also in dimasctetracompat. See [duplicate keys](#cross-source-duplicate-keys).

### 3.8. undergardenpatch-1.4.2-1.20.1.jar (12 materials)

Undergarden compat. All three metals and the utherium gem also exist in our datapack under the same keys (`undergarden_*`).

| Cat | Key | Prim | Sec | Tert | Dur | MC | Eff | Tool Level |
|---|---|---|---|---|---|---|---|---|
| metal | `undergarden_cloggrum` | 6 | 2.9 | 2 | 286 | 48 | 6 | iron |
| metal | `undergarden_forgotten_metal` | 6 | 4.3 | 3 | 1876 | 12 | 8 | netherite |
| metal | `undergarden_froststeel` | 5 | 4 | 2.5 | 575 | 120 | 7 | iron |
| gem | `undergarden_utherium` | 6.5 | 3.5 | 3.2 | 1279 | 102 | 8.5 | diamond |
| socket | `socket_undergarden_forgotten`, `socket_undergarden_froststeel`, `socket_undergarden_utherium` | 0 | 0 | 0 | 0 | 0 | 0 | -- |
| stone | `undergarden_depthrock`, `undergarden_shiverstone` | 4-4.2 | 3.5-4 | 0 | 180-250 | 90 | 4.5 | stone |
| wood | `undergarden_grongle`, `undergarden_smogstem`, `undergarden_wigglewood` | 2.6-3 | 1.4-2.3 | 6-6.9 | 59-512 | 90-108 | 3-4 | wood/stone |

> The datapack and the jar conflict on all three metals and utherium. The datapack gives less durability on three of them (forgotten metal 800 against the patch's 1876, froststeel 450 against 575, utherium 600 against 1279) and more on cloggrum (350 against 286). See [duplicate keys](#cross-source-duplicate-keys).

### 3.9. adtetra-2.1.0.jar (6 materials)

Ad Astra (space mod) compat.

| Cat | Key | Prim | Sec | Tert | Dur | MC | Eff | Tool Level |
|---|---|---|---|---|---|---|---|---|
| metal | `calorite` | 7.5 | 3.2 | 4 | 2200 | 105 | 9 | netherite |
| metal | `desh` | 4.2 | 4.3 | 2.7 | 250 | 51 | 5 | iron |
| metal | `ostrum` | 6.3 | 3 | 4 | 1100 | 110 | 8 | diamond |
| wood | `aeronos`, `glacian`, `strophar` | 3-4 | 1.1-2 | 7-9.3 | 87-175 | 25-90 | 5 | gold |

### 3.10. irons_spellbooks-1.20.1-3.15.5.1.jar (17 materials)

Iron's Spells & Spellbooks registers its own Tetra materials inside its main jar, without a separate addon.

| Cat | Key | Prim | Sec | Tert | Dur | MC | Eff | Tool Level |
|---|---|---|---|---|---|---|---|---|
| metal | `irons_spellbooks_arcane_ingot` | 5.5 | 3.8 | 3 | 750 | 184 | 7 | diamond |
| fabric | `irons_spellbooks_arcane_cloth` | 1 | 1 | 5 | 300 | 180 | 0 | -- |
| bone | `irons_spellbooks_frozen_bone` | 5.5 | 1.9 | 4.5 | 180 | 158 | 4.5 | stone |
| skin | `irons_spellbooks_hogskin` | 1.5 | 1 | 5 | 250 | 80 | 0 | -- |
| rod | `frosted_helve` | 3.7 | 1.9 | 1 | 56 | 152 | 0 | -- |
| socket | 12 rune sockets (`irons_spellbooks_*_rune_socket` + `permafrost_shard`) | 0 | 0 | 0 | 0-256 | 0 | 0-5 | -- |

> These materials have high magic capacity: arcane_cloth (180), frozen_bone (158), arcane_ingot (184), frosted_helve (152), deliberately above average for spellbook synergy. The 12 rune sockets bind to specific schools.

### 3.11. Other tetra-related jars with no material datapacks

- `[Forge1.20.1]TetraClip-1.0.6.jar`: tool-tier configuration mod, no materials
- `tetra_re_enlarged-1.3.0.jar`: texture / size mod, no materials
- `tetrasdelight-1.20.1-1.jar`: Farmer's Delight tool integration, no datapack materials (registers via Java)
- `tetra_tables--mc1.20--1.1.jar`: workbench table block additions, no materials

> Some addons may register materials in Java code instead of datapacks. A grep confirmed that the four jars above have no `data/tetra/materials/` paths in their archives. If a material shows up in game that this catalog lacks, decompile the suspect jar and search for `MaterialManager.register` calls.

---

## Section 4 - Reforging armor variant architecture

> Rewritten 2026-05-28. The previous version of this section described the category-wildcard model of the deprecated standalone `iridescent-reforging-mod/` source (which claimed "plate modules accept only 5 materials"). Since the 2026-05-02 bundle merge into `iridescent-tetra-expansion-mod/` (shipped as `iridescent_tetra_expansion-1.0.0.jar`), the architecture uses per-material variants with explicit armor multipliers instead of category wildcards. The old version was ~1 month out of date.

### 4.1 Actual architecture

Each of the 56 armor modules in the bundle source has 40-115 explicit per-material variants, and each variant binds one material to its own stat extract. There is no `tetra:metal/` category wildcard: there is a `tetra:metal/copper` variant, a `tetra:metal/iron` variant, a `tetra:metal/aethersteel` variant and so on, each written separately.

The per-material pattern dates from Phase A of the Tetra armor extension work (2026-04-30, ~25 commits), after the team worked out Tetra's lookup chain: 3-segment variant keys break Tetra's template fallback, which extracts the material name as a substring of the key. The fix was 2-segment variant keys (`<module>/<material>`), written out for each material.
Across all 56 modules there are 4,710 variants in total.

### 4.2 The 4-archetype plate model

Each armor piece (helmet / chestplate / leggings / boots) has 5 plate modules for the 4 archetypes, two of them Mage. According to `master-appendix.md` Section L.2, honing is restricted by archetype through synthetic `tetra:armor/<archetype>_hone/` improvement types declared on each major-slot module:

| Archetype | Helmet | Chestplate | Leggings | Boots |
|---|---|---|---|---|
| **Warrior** | `heavy_crown` | `cuirass` | `heavy_leg_plate` | `heavy_boot_sole` |
| **Balanced** | `basic_crown` | `breastplate` | `full_leg_plate` | `basic_boot_sole` |
| **Rogue** | `light_crown` | `scaled_chest` | `light_leg_plate` | `light_boot_sole` |
| **Mage / Vestment** | `vestment_crown` | `vestment_chest` | `vestment_leg_plate` | `vestment_boot_sole` |
| **Mage / Runed** | `runed_crown` | `runed_chest` | `runed_leg_plate` | `runed_boot_sole` |

Vestment and Runed are both sub-variants of the Mage archetype. They share the `tetra:armor/mage/` improvement gate and the `armor_mage_hone_*` hone chain, and differ in which stats they weight:

| Stat | Vestment | Runed |
|---|---|---|
| Identity | Cloth-wrapped caster, sustain/regen | Rune-inscribed gear, raw power |
| `irons_spellbooks:max_mana` | Baseline | 0.5x Vestment |
| `**irons_spellbooks:spell_power` | Baseline | 2.0x Vestment |
| `**irons_spellbooks:cooldown_reduction` | (none) | +5% per piece |
| `minecraft:generic.armor` | Baseline | 1.25x Vestment |

Both still count as the ROBE weight class in `armor_weight.js` (per-piece -armor / +mana_regen / +speed bonuses).

Stat priorities (also from L.2):

| Archetype | Chestplate | Helmet | Boots | Leggings |
|---|---|---|---|---|
| **Warrior** | Armor (big, +2..+6) | Armor | Armor | Armor |
| **Balanced** | Armor (modest, +1..+5) | Armor | Movement Speed | Armor |
| **Rogue** | Attack Damage | Arrow Damage | Movement Speed | Movement Speed |
| **Mage** | Spell Power | Spell Power | Cooldown Reduction | Max Mana |

The remaining 36 modules cover the minor slots (linings, trim, crests, lacings, pauldrons, straps, etc.), 9 per piece on average. They usually add a little armor plus flavor stats.

### 4.3 What `extract.primaryAttributes.X: N` actually does

`MaterialVariantData.combine()` multiplies the variant's `primaryAttributes` value by the material's `primary` stat. An iron variant of `basic_crown` with armor extract `1.429` therefore gives `5 × 1.429 = 7.145` armor in game, and copper (primary=4) with the same armor extract `1.429` gives `4 × 1.429 = 5.716` armor.

This is also how copper scales to ~80% of iron without any per-module authoring (per master.md): both variants can use the same multiplier (or different ones), and the material's primary sets the final number.

Store each variant's primary-attribute value already divided by its intended material's primary, so the final armor number stays readable. If an iron basic_crown should give `7.145` armor in game, the stored multiplier is `7.145 / iron.primary (5) = 1.429`.

### 4.4 Currently-accepted materials per module type (sampled)

Each module accepts its own set of materials. The main patterns:

Plate modules (5 per piece × 4 pieces = 20 modules): `basic_crown`, a typical Balanced helmet, has 114 variants covering:
- vanilla: copper, iron, gold, netherite, diamond, leather, amethyst, emerald
- 8 themed materials (fire/ice/shadow/holy/lightning/nature/ender/blood)
- 27 datapack metals (steel, manasteel, aethersteel, iridium, etc.)
- 5 datapack gems (ruby, sapphire, topaz, onyx, undergarden_utherium), plus diopside and diamond_no_t
- modded-via-condition (dd_warden, cm_ignitium, etc.)
- 3 bundle (arcane_ingot, arcane_cloth, stratus)
- 1 each: tf_arctic, tf_yeti, bs_pyrope, tf_naga (cross-mod), and deathskin
- 54 more prefixed datapack materials (27 metals and 27 gems, among them cm_cursium, cs_wrath, tf_lich and the three fa_ metals)

Lining-style modules (silk_lining, padded_lining, etc.): `silk_lining` has 40 variants, far fewer than a plate module. Its variants cover vanilla copper/iron/gold/diamond/netherite/leather, the 8 themed materials, deathskin, arcane_ingot, wool in all 16 colors, the 3 bundle fabrics (arcane_cloth/manaweave/spellbinding_cloth), hide, rotten_leather, tf_arctic, tf_yeti and magebloom. It does not yet accept any of the 6 vanilla Tetra fibres or the dozens of modded fibres. Adding fibre materials to the lining modules is deferred work (see [Future work](#future-work--open-questions)).

Plate-only modules (full_visor, goggles, agile_greaves, etc.) accept only metal and themed materials, a narrower set than the 4-archetype plate modules.

Bridge modules (cloth_strap, leather_strap, iron_lacing, chain_belt, etc.) accept a mix: metal, skin, sometimes fabric, and themed.

### 4.5 Known design issues (to be addressed in the per-tier-parity audit)

1. Vanilla beats modded in many slots. Iron's basic_crown variant has armor multiplier `1.429` (an iron crown gives 7.145 armor), while Aethersteel's has `0.68` (an aethersteel crown gives `8.5 × 0.68 = 5.78` armor). That is backwards from the design intent: per master.md and the user's 2026-05-28 confirmation, Aethersteel is the top of crafted pre-postgame progression and should give noticeably more armor than vanilla iron. The Phase A authoring pass gave vanilla and the early-modded metals (iron, diamond, netherite) higher multipliers than most of the modded T2-T4 metals, whose multipliers cluster around 0.36-0.68. The fix is to rewrite the T3/T4 modded-metal variant multipliers to match the canonical tier hierarchy.
2. In lining-style modules, every variant fails the "≥1 armor" floor set by the 2026-05-28 user directive. silk_lining variants give 0.11 to 0.46 armor depending on the material, while the floor requires material-primary × variant-armor ≥ 1.0 for every variant. ~26 modules and ~500 variants are affected.
3. Lining modules accept far fewer materials than the spell-book design implies. The migration doc (`iridescent-modular-spells-tetra-migration.md` Phase 6C) makes fabric, fibre and skin the canonical lining categories, each with its own stat theme (fabric → mana_regen, fibre → cast_time_reduction, skin → max_mana). The armor lining modules now accept fabric (wool and the three bundle fabrics), but none of them accepts a fibre yet.

### 4.6 The per-tier-parity audit (planned, not yet shipped)

The fix for the problems in 4.5 is to rewrite the per-material variants at the tier-architecture level instead of inflating wildcards. The tool is the existing `iridescent-tetra-expansion-mod/tools/gen_per_material_variants.py`, extended for the next pass. Its input is a stat-tier matrix giving each material's intended in-game armor / max_mana / spell_power / etc. contribution for every (material, archetype, piece) combination; its output is 1500-2000 generated variant blocks, verified with `tools/audit_modules.py`.

It is a separate work item of half a day to a full day.

---

## Section 5 - Critical Tetra Finickyness Rules

> Tetra documents none of its behavior outside its bytecode, so every custom integration turns up new gotchas. This section collects the hard rules learned from those incidents so contributors can find them with a wiki search. Each rule gives the date of its incident.

### 5.1 ISS percent attributes MUST use `**` prefix (MULTIPLY_TOTAL), never `*` (MULTIPLY_BASE) [2026-05-14]

Tetra's `AttributeHelper.collapse()` drops a MULTIPLY_BASE modifier to 0 when the same attribute has no ADDITION sibling, so the stat silently disappears. The rule: every module variant, improvement file or material `attributes` block that targets a percent attribute (`spell_power`, `mana_regen`, `cooldown_reduction`, `cast_time_reduction`, `spell_resist`, school SP, `summon_damage`, `max_mana` percent) uses the `**` prefix. The audit script catches violations, and tester screenshots catch whatever it misses.

Before 2026-05-28, 7 custom materials shipped with the broken `*` (see [Section 2d](#2d-bundle-jar-magical-fabric--skin-materials-iridescent_tetra_expansion-100jar)); all of them are fixed.

### 5.2 Wildcard variant keys MUST end in `/` [2026-05-12]

`MaterialVariantData.combine()` concatenates `variant.key + material.key`. A named variant with `key: "padded_lining/dd_warden"` (no trailing slash) combined with the material `dd_warden` produces the doubled `padded_lining/dd_wardendd_warden`. A wildcard variant key must end in `/` (e.g., `key: "padded_lining/"`) so that combine produces a clean `padded_lining/<material_key>`. Per-material override variants (one material in the list, like `"materials": ["tetra:metal/iron"]`) use 2-segment keys without a trailing slash (e.g., `basic_crown/iron`).

### 5.3 `magicCapacity` on every major variant gates BookEnchantSchematic [2026-05-06]

`BookEnchantSchematic.lambda$isApplicableForSlot$4` reads `VariantData.magicCapacity` from the major module's variant. If it is unset (default 0), the workbench enchant schematic disappears from the slot's context menu, and no warning is logged. Every major-slot variant needs an explicit `magicCapacity`; audit script CHECK 5 catches missing values.

### 5.4 Variant cloning scrubs incidental attributes [2026-05-13]

A new material variant copied from a template inherits the template's incidental attributes. The default policy scrubs a cloned variant's `primaryAttributes` down to `{generic.armor, generic.armor_toughness, generic.knockback_resistance, etc.}`: drop every `irons_spellbooks:*` and `ars_nouveau:*` key carried over from the source. A material's magic bonus belongs in its material-level attributes (the material JSON's `attributes` block), not in module-variant overrides. The audit script flags unexpected attributes on new-material variants.

### 5.5 Material reference path = file path, not `category` field [2026-05-12]

The category prefix in `materials: ["tetra:metal/iron"]` must match the directory on disk under `data/<ns>/materials/`, not the JSON file's `category` field. A mismatch fails silently: the variant just doesn't apply. For a new material file, the reference path is the directory chain from `data/<ns>/materials/` to the JSON file, without `.json`.

### 5.6 Bare `tetra.variant.<vk>` is the canonical lang form [2026-04-30]

Variant keys take no `.name`, `.prefix` or `.description` suffix (those exist only as optional overlays for specially named variants). Tetra's `getName(moduleKey, variantKey)` tries the bare key first, and the template fallback path breaks on 3-segment keys anyway. For a variant key ending in `/`, write both the bare `tetra.variant.<vk>` (with the material applied) and the trailing-slash `tetra.variant.<vk>/` (empty default).

### 5.7 Schematic outcomes write `moduleVariant` verbatim to NBT [2026-04-30]

`SchematicDefinition.applyOutcome` writes the `moduleVariant` field to NBT exactly as written, without adding a material suffix. To get per-material variant keys at the workbench, either list each material as a separate outcome with its own `moduleVariant`, or use a trailing-slash wildcard with category-wildcard materials. `SchematicRegistry.expandMaterialOutcome` runs at load time, walks each material in the category and creates one UniqueOutcomeDefinition per material via `source::combine`. Prefer the wildcard path to hand-written per-material outcomes.

### 5.8 `replace: true` required for swap-over-populated-slot [2026-05-06]

`SchematicDefinition.replace` defaults to false, and a schematic with replace false only applies to an empty slot. To allow material swaps (cuirass → cuirass in a different metal), the install schematic needs `replace: true`. Tetra's basic_blade.json ships with `replace: true` for this reason.

### 5.9 `variantData[0]` fallback MASKS NBT-mismatch bugs [2026-04-30 + 2026-05-02]

When a module's `getVariantData(stack)` reads the NBT and finds no matching variant key, it falls back to `getDefaultData()` = `variantData[0]`, the catch-all variant. The UI looks right (the catch-all's lang label appears), but the stack has the catch-all's stats instead of the intended material's. **Never trust a visual smoke test alone** when migrating variant key shapes; spot-check stat aggregation with a tester screenshot.

### 5.10 Cross-namespace `models[].location` doesn't work with `tetra:modular_loader` [2026-04-30]

Tetra's `ItemLayerModel.bake()` registers atlas references at bake time. If a Tetra variant points `models[].location` at a sprite in another mod's namespace (e.g., `minecraft:item/iron_helmet`), it blows up the first time any block entity holding a previewable stack renders. For per-material inventory icons that use vanilla or source-mod sprites, use Forge `ItemProperties` + `overrides` instead.

### 5.11 Tetra identifiers must obey `[a-z0-9/._-]` [2026-04-26]

Tetra builds ResourceLocation paths from item and schematic identifiers. A colon (`:`) is not legal inside the path portion, because it separates namespace and path. An identifier like `iridescent_modular_spells:iss_book` fails registration with `ResourceLocationException`; use underscores only, as in `iridescent_iss_book`.

### 5.12 `AddReloadListenerEvent` is server-only [2026-05-06]

The event fires only on the server's resource manager. In multiplayer with a remote dedicated server, the client never runs that listener, so any registry it fills stays empty. For data both sides need (e.g., `SpecializedReplacementRegistry`, `SkinRegistry`), read the JSON eagerly from the mod jar's classpath in `FMLCommonSetupEvent`, which fires on both client and server.

### 5.13 Tetra MULTIPLY_BASE display rule (Section L.3 of master-appendix.md)

Copied here so a search finds it: how a Tetra modular item displays each attribute depends on which Forge attribute operation is applied. Apothic Attributes' `IFormattableAttribute` interface decides between percent and flat rendering. ISS percent attributes must use `**` (MULTIPLY_TOTAL) to render as "+X%" through the post-collapse path; ADDITION on a base-1.0 ISS attribute also renders linearly, but as ugly decimals.

---

## Cross-source duplicate keys

59 `<category>/<key>` pairs are registered by 2+ sources, and the last one loaded wins. In IridescentCraft the `paxi` zips load after vanilla and after every mod-jar datapack, so our `icraft_tetra_materials` datapack overrides the mod jars. In the few cases where two jars collide with no datapack involved, Tetra's result depends on `ResourceManagerReloadListener` ordering, which roughly follows mod load order.

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

The table has 49 rows and predates the 2026-10-18 recount. It lacks fabric/arcane_cloth (the expansion jar and irons_spellbooks: the same file, with a different key field), gem/diopside (our datapack and dimasctetracompat), the four Tetra built-ins our datapack partly overrides (gem/diamond, metal/gold, metal/iron, metal/netherite) and the six Aether files in icraft_tetra_overrides. Two of its rows are not file collisions: tetraextras files its amethyst and brass under gem/oresabovediamonds/ and metal/create/, so they share only the key.

To do: wherever the IridescentCraft team cares about the stats, ship an override JSON with the desired stats in `icraft_tetra_materials`. A datapack override holds up better than relying on jar load order.

---

## Design Notes (from existing custom-metal section)

The metal progression follows these principles, kept from the earlier 191-line wiki version and refined here.

1. Durability scales exponentially. T1 starts around iron (240), T2 ranges 300-750, T3 jumps to 650-1400 and T4 reaches 2200-2500. Tetraextras (insanium 200000) and tetranomicon (iceandfire dragonsteel 8000) go far past T4 on purpose, as late-game progression beyond our normal curve.
2. Primary damage scales linearly: 4.5 (T1 Brass), 4.8-6.5 (T2), 6.0-7.0 (T3), up to 8.5 (T4 Aethersteel). Tetraextras' insanium reaches 28, deliberately outside our balance band.
3. Tool efficiency follows the tier boundaries: T1 = 6, T2 = 6.5-8.5, T3 = 8-9.5, T4 = 10-11.
4. Magic capacity rewards specialization. The highest-MC materials in the pack are Iron's Spells arcane_ingot (184), tetraextras supremium/imperium (545) and tetranomicon void_chitin (168), all from external sources. Within our datapack Elementium (150) leads, followed by Terrasteel (140), Dimlite (130) and Manasteel (120). The highest-damage material (Aethersteel, 100) and the toughest physical material (Refined Obsidian, 76) have moderate-to-low MC on purpose: raw power does not earn magic capacity.
5. Secondary damage favors support and utility metals. Lumium (4.4), Signalum (4.2), Brass (4.0) and Charoite (4.8) lead our datapack metals in secondary.
6. Tertiary (armor) scales with physical toughness. Aethersteel (4.5), Unorithe (4.5), Refined Obsidian (4.0), Iridium (4.0) and Dimlite (5.5) lead our datapack; fragile or magic-focused metals such as Lumium (2.3) and Elementium (2.5) have the lowest values.
7. Integrity cost and gain scale with tier. T1-T2 metals cost 2 integrity, T3 costs 3, T4 costs 4. Integrity gain follows the same pattern (5 at T1-T2, 6-7 at T2-T3, 8-10 at T4).

---

## Source Coverage Summary

| Source | Materials | Categories Covered | Notes |
|---|---|---|---|
| Tetra (built-in) | 66 | 12 (bone/fabric/fibre/gem/metal/misc/rod/scale/skin/socket/stone/wood) | Vanilla baseline |
| `icraft_tetra_materials` (our datapack) | 101 | 5 (metal, gem, skin, bone, fibre) | Curated 27 modded metals + custom gems + skins + prefixed per-mod materials |
| `iridescent-reforging-mod` | 8 | 1 (themed/) | Selector-only zero-stat materials |
| `iridescent-modular-spells-mod` | 15 | 2 (icraft_iss_books, icraft_ars_books) | MC-only spell book backings |
| `tetranomicon` | 497 | 10 | Pack-wide modded coverage; the catch-all |
| `tetraextras` | 41 | 9 | High-end netherite+ metals + cosmic-tier insanium/supremium |
| `tetracelium` | 34 | 6 | Botania/TF/Mekanism/AE2/gems compat - heavily overlaps datapack |
| `aetheric_tetranomicon` | 34 | 6 | Aether family compat |
| `art_of_forging` | 22 | 5 (incl. unique reagent + misc) | Endgame forging mod with own materials |
| `dimasctetracompat` | 17 | 4 | Dim-Asc Blue Skies compat |
| `irons_spellbooks` | 17 | 6 | Spell-school sockets + arcane materials |
| `txdacompat` | 31 | 6 | Tales from the Dim Ascended Blue Skies compat |
| `undergardenpatch` | 12 | 5 | Undergarden compat (overlaps datapack metals) |
| `adtetra` | 6 | 2 | Ad Astra compat |
| **Total** | 913 | -- | 59 cross-source duplicate keys; the total also counts the six other expansion-jar materials (Section 2d's four, arcane_ingot, stratus) and the six icraft_tetra_overrides files, which have no row |

---

## Future work / open questions

- [ ] Per-tier-parity audit (the most valuable next pass). Rewrite the per-material variant armor multipliers across 4,710 variants in 56 armor modules to match the canonical tier hierarchy: T1 (iron/copper/brass) baseline; T2 (steel/manasteel/etc.) parity; T3 (terrasteel/elementium/etc.) parity at diamond+; T4 (netherite + Terramity onyx); the T4 peak is Aethersteel (the top of crafted progression, below the Ad Astra postgame). Vanilla and modded are currently inverted (an iron crown gives more armor than an aethersteel crown), which is backwards from the design intent. Tool: extend `iridescent-tetra-expansion-mod/tools/gen_per_material_variants.py` with a stat-tier matrix and regenerate. Verification: `tools/audit_modules.py` plus a tester screenshot.
- [ ] ≥1 armor floor for every (material, module) combination, per the 2026-05-28 user directive: the pack is noticeably harder than vanilla, so every material slot should contribute. Most lining-style modules currently give <1 armor for every material. This is bundled with the per-tier-parity audit above, since the fix uses the same mechanics.
- [ ] Lining and bridge modules don't accept fibre. The master design (`master.md` Part VII + `iridescent-modular-spells-tetra-migration.md` Phase 6C) makes fabric, fibre and skin the canonical lining categories, each with its own stat theme. Of the bundle's `silk_lining`, `padded_lining`, `silk_boot_lining`, `padded_boot_lining`, `fur_boot_lining`, `cushioned_heel`, `silk_lacing`, `sash`, `cloth_strap` and `cloth_cuisses`, all but the heel now accept wool, manaweave, spellbinding_cloth and arcane_cloth, but every one of them still rejects every fibre. Adding per-material variants to these 10 lining modules for the fibre materials that fit the lore is bundled with the per-tier-parity audit.
- [ ] Conflict resolution for the 59 duplicate keys: decide which version is canonical, then either (a) ship our own override with the intended stats in the datapack, or (b) explicitly accept that the jar-load-order winner is fine. The Blue Skies cluster (34 duplicates) is the largest group.
- [ ] Tetranomicon full per-key dump: this page summarises tetranomicon by category; if module authoring needs per-key stats, decompile the jar or extend the audit script.
- [ ] Java-registered materials: if a Tetra material shows up in game that this page doesn't list, decompile `tetrasdelight`, `tetra_re_enlarged` and `tetra_tables`. These three jars have no datapack `tetra/materials/*.json` paths.
- [ ] Tool-tier requirements for forge hammers: tetranomicon adds `tetranomicon:tier_ten` and `tetranomicon:tier_eleven` plus `tetra:maxed_forge_hammer`. Document the upgrade path for these custom tiers on a separate progression-flow page.
- [ ] Per-spell-book magic capacity ramp: currently 30/60/100/150 from copper to netherite. Consider adding T0 (parchment) and T5 (archmage / necronomicon-tier sockets) for finer steps.
- [ ] Fix the gradle build environment on the Windows dev host: `build_mod.sh` fails with `java.io.IOException: Unable to establish loopback connection` at `sun.nio.ch.UnixDomainSockets.connect0` (a Java 17+ Windows NIO bug, unrelated to our code). Meanwhile the expansion jar is built through its wsl-build.sh in WSL, not patched in place. Tracked as IridescentCraft task #39.

---

## Method notes (for future audits)

- Tetra's canonical material location is `data/<namespace>/materials/<category>/[<subdir>/]<key>.json` inside any datapack or mod jar. The `<namespace>` is the directory directly under `data/`. It is usually `tetra`, since most contributors register into the `tetra:` namespace by convention, but any mod can register into its own namespace if it wants its materials under a different key prefix. In practice `iridescent_tetra_expansion-1.0.0.jar`, ISS, Botania and others all put their files under `data/tetra/materials/<cat>/`, so they share the `tetra:` namespace pool (on a conflict, the last one loaded wins).
- The first directory under `materials/` sets the category; `key` is the JSON's `key` field (usually the same as the file name).
- To re-run this audit on the Windows dev host, walk every jar in the server's live `mods/` directory (`Z:\Users\<user>\Desktop\IridescentCraft Dedicated Server\mods\` on the server VM, or the local equivalent), extract `data/*/materials/{skin,fabric,fibre,metal,gem,bone,rod,scale,stone,wood,socket,misc}/*.json` from each, parse the JSON and group by source/category/key. The 2026-05-28 session's Python audit walker is at `C:\tmp\skin_fabric_audit.py`. It has a path-translation gotcha: Windows Python's `os.path.join` mixes slashes, so convert input paths to native Windows backslashes first.
- Modded jars sometimes register materials in Java code instead of a datapack; when a material appears in game but not in this catalog, confirm with grep and decompile.
- Datapack JSONs ship through Paxi as the zips in `config/paxi/datapacks/` (built from `.minecraft/datapack_sources/`). They load after the mod jars but before world saves, so they override jar registrations of the same `<namespace>/<category>/<key>`.
- The bundle source for the canonical custom materials is `iridescent-tetra-expansion-mod/src/main/resources/data/tetra/materials/<cat>/<key>.json`, and the datapack source for ours is `.minecraft/datapack_sources/icraft_tetra_materials/data/tetra/materials/<cat>/<key>.json`. Always edit the source of truth, not the deployed jar or zip: the deploy path rebuilds from source.

---

*This page is a snapshot. When mods are added or updated, re-run the audit and refresh the section counts; don't trust a count that hasn't been re-run.*
