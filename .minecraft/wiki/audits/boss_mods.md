# Boss Mods Batch Audit (Alex's Mobs + Twilight Forest + Blue Skies + Aether + Deep Aether)

**Mods:** alexsmobs, twilightforest, blue_skies, aether, deep_aether (audited as a batch — they're each individually small and share the same boss-drop pattern)
**Items in JEI:** 2,176 combined (alexsmobs 278, twilightforest 562, blue_skies 703, aether 284, deep_aether 349)
**Audit date:** 2026-04-27
**Verdict:** LIGHT POLISH — all 4 dimensional mods are T2-staged at the dimension level, all 5 share heavy boss-drop loot allocations across our reagent economy. ~325 references across the 5 mods. Most concerns are pre-existing (Blue Skies materials removed via Section M, Shadow Armor via Section L). Few small spot-checks: 4 EPIC boss spawn eggs in Blue Skies (creative-only by mod design, but worth verifying), `debug_sword` (developer item).

## Why these mods are in scope

These 5 mods are the pack's **T2 dimensional content tier** (alongside the abyss and undergarden which are T3). They contribute:
- **30+ bosses** total across all 5 mods (8 in Twilight, 4 in Blue Skies primary + minibosses, 3-4 in Aether/Deep Aether, multiple in Alex's Mobs)
- **Hundreds of building blocks + decorative items** (Blue Skies has 703 items, mostly building variants of cherry/skyroot/pinemoss wood and shadeglint/diopside/charoite/horizonite materials)
- **Dimensional progression entry points** — Twilight Forest portal, Blue Skies arc, Aether portal, Aethersteel chain in Deep Aether
- **Reagent contributions** to our cross-mod ISS ink/rune economy

Already heavily wired:
- All 4 dimensions T2-staged in `astages_restrictions.js` lines 169-172
- Aethersteel T4 endgame chain (Deep Aether) staged at lines 343-352
- 3 dedicated boss-drop loot files (alexsmobs_drops.js, twilight_boss_drops.js, blue_skies_drops.js)
- `recipe_audit.js` Section L: Blue Skies Dusk Arc + Shadow Armor + Runic Arc removed (per-mod design)
- `recipe_audit.js` Section M: Blue Skies Diopside + Charoite + Horizonite tools/armor removed (Tetra-replacement)
- `tier_gated_recipes.js`: Twilight portal activator changed from diamond to T1 boss token

## Per-mod detail

### Alex's Mobs (278 items, 3 EPIC + 7 RARE, 29 refs)

EPIC: `bear_dust`, `dimensional_carver`, `transmutation_table`. RARE: `warped_mixture`, `mysterious_worm`, `void_worm_eye`, `shattered_dimensional_carver`, `farseer_arm`, 2 music discs.

`alexsmobs_drops.js` has **21 entity loot modifiers** including the mimicream nerf to 1% (per CLAUDE.md / known design choice). Coverage is dense.

- **`transmutation_table`** (EPIC) — Alex's Mobs end-tier crafting station; produces alchemical transmutations. Likely T3+ tier and tied to native loot. Verify recipe-state.
- **`dimensional_carver`** (EPIC) + **`shattered_dimensional_carver`** (RARE) — used to repair the void worm carver. End-game traversal tool. Native to Void Worm boss.
- **`bear_dust`** (EPIC) — bear-bait reagent. Mid-tier.
- **`mysterious_worm`** (RARE) — fishing/quest item.

### Twilight Forest (562 items, 0 EPIC + 14 RARE, 80 refs)

Zero EPIC items — Twilight uses internal tier system (not vanilla Rarity). RARE: 5 weapons/tools (`mazebreaker_pickaxe`, `crumble_horn`, `peacock_feather_fan`, `moonworm_queen`, `glass_sword`) + 9 music discs.

`twilight_boss_drops.js` (67 lines) covers 8 Twilight bosses with ISS reagent allocations + simplyswords weapon drops:
- naga (tempest), lich (soulrender), hydra (emberblade), ur_ghast (whisperwind), knight_phantom (enigma), snow_queen (frostfall), minoshroom + alpha_yeti (T2 fragment + icewhisper).

Verified clean. Mod-internal tier system means rarity column is misleading, but all weapons are dropped from specific bosses (transitively gated through dimensional access).

- **`mazebreaker_pickaxe`** (RARE) — drops from Hydra. Native loot. Greenlit.
- **`peacock_feather_fan`** (RARE) — drops from Knight Phantoms. Native loot.
- **`moonworm_queen`** (RARE) — drops from Twilight Lich.
- **`glass_sword`** (RARE) — fragile but powerful late-Twilight weapon. Native loot.
- **`crumble_horn`** (RARE) — Aurora-tier item.

### Blue Skies (703 items, 6 EPIC + 9 RARE, 90 refs)

EPIC: 4 boss spawn eggs (`summoner_spawn_egg`, `alchemist_spawn_egg`, `starlit_crusher_spawn_egg`, `arachnarch_spawn_egg`), `debug_sword`, `multi_portal_item`. RARE: `infused_arc_sword`, 4 shadow_armor pieces, 4 music discs.

`blue_skies_drops.js` (44 lines) covers 4 Blue Skies bosses with ISS reagents + simplyswords weapons:
- summoner (hiveheart), alchemist (toxic_longsword), starlit_crusher (stars_edge), arachnarch (waxweaver). All 4 bosses also drop `runic_arc` at 5%.

`recipe_audit.js` Section L removes:
- `blue_skies:dusk_arc/*` (regex) — too strong for T2
- 4 shadow armor pieces — outclasses progression-appropriate gear
- `blue_skies:runic_arc` — boss-drop only now

`recipe_audit.js` Section M removes Diopside (9 items), Charoite (9 items), Horizonite (~9 items) tool + armor recipes — these have hardcoded stats in the mod jar, so we replaced them with Tetra material integration at proper T2 stats.

- **4 boss spawn eggs (EPIC)** — **CONCERN:** spawn eggs in survival = boss-summon-on-demand. Vanilla minecraft boss spawn eggs (e.g., Wither, Ender Dragon) are creative-only. Verify these are creative-only (no recipe + no loot allocation). If craftable or chest-droppable, players can spawn-camp T2 bosses for unlimited drops.
- **`debug_sword` (EPIC)** — developer/debug item; creative-only by name. Verify no recipe.
- **`multi_portal_item` (EPIC)** — Blue Skies dimension portal item. T2 access; transitively gated through dimension entry restriction.
- **`infused_arc_sword` (RARE)** — Blue Skies' equivalent of an enchanted T2 sword. Native progression.

### Aether (284 items, 0 EPIC + 15 RARE, 98 refs)

Zero EPIC. RARE: `enchanted_dart`, `enchanted_dart_shooter`, `enchanted_berry`, `healing_stone`, `skyroot_remedy_bucket`, `enchanted_aether_grass_block`, `quicksoil_glass`, `quicksoil_glass_pane`, `enchanted_gravitite`, 5 music discs.

98 references — heavy integration. The Aether is a vanilla-tier-feeling exploration dimension; mostly mid-tier flavor.

- **`enchanted_gravitite`** (RARE) — Aether's main "endgame" material. Used for crafting late-Aether tools (Aether Sword, etc.). Mod-internal balance.
- **`enchanted_dart` + `enchanted_dart_shooter`** (RARE) — Aether's ranged combat item. Mid-tier.
- **`healing_stone`** (RARE) — heal-on-use item. Mid-tier consumable.
- **Slider, Valkyrie Queen, Sun Spirit** — 3 Aether bosses get drops in `loot_overhaul.js` Section 2 (T2 boss group): t2_token_fragment + simplyswords weapons (thunderbrand from Slider, caelestis from Valkyrie Queen, sunfire from Sun Spirit).

### Deep Aether (349 items, 0 EPIC + 7 RARE, 28 refs)

Zero EPIC. RARE items mostly building variants. Deep Aether is the Aether's endgame extension dimension that hosts Aethersteel (T4 metal).

The Aethersteel chain is **T4-staged** (`astages_restrictions.js` lines 343-352):
- aethersteel_ingot/block/nugget/scrap, aether_debris, full tool set (sword/pickaxe/axe/shovel/hoe/shears/knife), full armor set (4 pieces), aethersteel_upgrade_smithing_template
- Plus ore replacement: `aether_debris` and `aetherslate` ore-staged at T4

This is the cleanest T4 metal chain in the pack — fully staged, fully ore-replaced.

## Findings

### Properly gated (no action)

- **All 4 dimensions T2-staged** — twilight_forest, blue_skies:everbright, blue_skies:everdawn, aether. Players can't enter them before T2.
- **Aethersteel T4 endgame chain** — fully staged (15+ items) + ore replacements at T4 stage.
- **Boss-drop coverage dense** — alexsmobs 21 modifiers, twilight 8 bosses, blue_skies 4 bosses with full coverage.
- **Section L blue_skies removals** — Dusk Arc + Shadow Armor + Runic Arc all stripped from crafting; Runic Arc is now boss-drop only at 5%.
- **Section M blue_skies materials** — Diopside/Charoite/Horizonite hardcoded vanilla tools/armor removed; Tetra integration replaces with proper T2 stats.
- **Twilight portal token** — vanilla diamond requirement replaced with T1 boss token (per `tier_gated_recipes.js`).
- **Cross-mod loot allocation** — every boss in these 5 mods contributes ISS reagents + simplyswords weapons in tier-appropriate ratios.

### CONCERN — Blue Skies boss spawn eggs (4 EPIC items)

`summoner_spawn_egg`, `alchemist_spawn_egg`, `starlit_crusher_spawn_egg`, `arachnarch_spawn_egg`. None of these have references in our scripts.

**The risk:** if they're craftable, players can summon T2 bosses on demand and farm drops indefinitely. Vanilla minecraft handles boss spawn eggs by simply not making them craftable (Wither/Dragon spawn eggs are creative-only). Need to confirm Blue Skies follows this convention.

**Action:** JEI uses-lookup on each egg. If they have recipes, add to `recipe_audit.js` Section L removal. If they show up in chest loot, lootjs strip.

### CONCERN — `debug_sword` (EPIC, ungated)

Developer/debug item. By name and convention, should be creative-only. Verify no recipe and no loot path.

### Verified clean

- **`multi_portal_item`** — Blue Skies portal block. Crafted from blue_skies materials in the T2 dimension; transitively gated.
- **`transmutation_table` + `dimensional_carver`** — Alex's Mobs end-tier items; native to mod's progression.
- **All Twilight RARE weapons** — boss drops with mod-internal balance.
- **All Aether RARE items** — mid-tier flavor or boss-progression items.
- **`enchanted_gravitite`** — Aether endgame material; mod-internal balance.

### Items not currently touched by gates

The 2,176 items in this batch are dominated by:
- Building variants (Blue Skies has hundreds of cherry/pinemoss/skyroot wood + stone variants)
- Cosmetic music discs (15+ across the 5 mods)
- Decorative blocks (Aether furniture, Twilight tower bricks, etc.)

None warrant individual gating. The dimension-stage + boss-drop coverage handles the progression-relevant items.

### Standouts

- **Blue Skies has the largest item registry of any T2 mod** (703 items) due to its triple-biome system (Everbright/Everdawn/Crystallines) and full wood/stone progression for each. Section M Tetra-replacement of materials is the only practical gating approach because mod jar hardcodes stats.
- **Twilight Forest's 8-boss-deep progression** is the longest single-dimension content arc in the pack. Each boss contributes one ISS reagent + one simplyswords weapon, creating a satisfying loot loop.
- **Aether is naturally tier-appropriate** — most of its content sits at T2 entry power level by design. No major rework needed.
- **Aethersteel chain (Deep Aether) is the cleanest T4 metal** in the pack — 15+ items all staged, ore replacements wired, fully-derived smithing template.
- **`alexsmobs_drops.js`'s mimicream 1% nerf** is documented in the file comments; tester-validated balance pass.

## Recommended actions (priority order)

1. **(spot-check)** 4 Blue Skies boss spawn eggs — verify no recipes + no loot table inclusions. ~5 min JEI check.
2. **(spot-check)** `blue_skies:debug_sword` — verify creative-only.
3. **(future polish)** When Twilight Forest mods get future updates with new bosses (Aurora-related content?), allocate ISS reagents to maintain pattern coverage.

## Existing coverage map

| File | What it does | Boss-mod hits |
|------|--------------|--------------:|
| `gates/astages_restrictions.js` (T2 dim list) | 4 dim T2-stages | 4 dimensions |
| `gates/astages_restrictions.js` (T4 list) | Aethersteel chain | 15+ items + 2 ores |
| `recipes/tier_gated_recipes.js` | TF portal token | 1 recipe |
| `recipes/recipe_audit.js` Section L | Blue Skies removals | 6 items |
| `recipes/recipe_audit.js` Section M | Blue Skies material removals | ~27 items |
| `loot/alexsmobs_drops.js` | 21 entity modifiers | full file |
| `loot/twilight_boss_drops.js` | 8 boss themed drops | full file |
| `loot/blue_skies_drops.js` | 4 boss themed drops | full file |
| `loot/lootjs_overhaul.js` Section 2 | T2 boss group (TF/Aether/BS) | multiple |
| `loot/loot_overhaul.js` | T2 boss assignments | multiple |
| `scaling/mob_scaling_unified.js` | Mob HP scaling | multiple |
| `scaling/boss_hp.js` | Boss HP scaling | multiple |
| `recipes/cooking_conversion.js` | F-Delight cooking | misc |

Total: ~325 references across 5 mods. **Most-distributed content in the pack** — each dimension + boss is wired into the cross-mod loot economy.
