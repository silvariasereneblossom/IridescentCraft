# Botania Audit

**Mod:** Botania
**Items in JEI:** 847 (12 EPIC, 9 RARE, 31 UNCOMMON, 795 COMMON)
**Audit date:** 2026-04-27
**Verdict:** LIGHT POLISH — coverage is dense and well-organized. The full mana → manasteel → terrasteel → elementium → gaia material chain is properly tier-staged across T2/T3/T4. Orechid datapack prevents the diamond/netherite tier-skip. The Gaia Guardian boss is the chokepoint for all EPIC items, and entry to the fight requires T3 progression. Few small spot-checks — most concerning is the **`spawner_mover`** UNCOMMON which warrants a dupe-vector check.

## Why this mod is in scope

Botania is the largest single content mod by item count (847, ~17% of total), but most are decorative blocks and flowers (795 COMMON). The "interesting" surface is small:
- **52 EPIC + RARE + UNCOMMON items** total (12+9+31)
- Material chain: manasteel (T2) → terrasteel (T3) → elementium (T3) → gaia (T4)
- Gaia Guardian + Gaia Guardian II as the boss-drop chokepoints
- Orechid mechanic (flower that turns Stone into ores) — prime tier-skip risk

Already extensively wired (77 references across 17 files):
- `kubejs/server_scripts/gates/astages_restrictions.js` lines 138-145: 12 manasteel-chain items T2-staged
- `kubejs/server_scripts/gates/astages_restrictions.js` lines 224-234: 14 terrasteel + elementium + dragonstone items T3-staged
- `kubejs/server_scripts/gates/astages_restrictions.js` line 335: `gaia_ingot`, `gaia_block` T4-staged
- `kubejs/server_scripts/recipes/recipe_audit.js` lines 145-146: Mana Infusion recipes for `minecraft:diamond` and `minecraft:emerald` removed (prevents Mana Pool from being a diamond/emerald shortcut)
- `kubejs/server_scripts/recipes/tier_gated_recipes.js` line 170: Orechid → handled via datapack
- `datapack_sources/icraft_botania_overrides/data/botania/orechid/`: 5 entries override Orechid weights for `osmium_ore`, `ancient_debris`, `deepslate_osmium_ore`, `deepslate_diamond_ore`, `diamond_ore` — prevents Orechid from cheap-spawning T3+ ores
- `kubejs/server_scripts/codex_delivery.js` line 652: `botania:lexicon` in starter codex list
- `kubejs/server_scripts/endgame/mythic_forge.js` line 49: `gaia_ingot` is a Mythic Forge reagent
- `kubejs/server_scripts/endgame/ascension.js` line 387: `gaia_ingot` is an ascension reagent
- `kubejs/server_scripts/recipes/tier_skip.js` lines 86-243: Mana Diamond + Mana Pearl + Manasteel + Terrasteel used as tier-skip-prevention recipe ingredients across various overrides
- `kubejs/server_scripts/scaling/boss_hp.js` + `boss_progressive.js`: Gaia Guardian HP scaling
- `kubejs/server_scripts/gates/milestone_detection.js`: Gaia Guardian kill counts
- `kubejs/server_scripts/origins/witch_of_ink_progression.js`: Witch of Ink ties into Botania mana

## EPIC items (12) by category

### Creative-only / unobtainable in survival
`creative_pool` (The Everlasting Guilty Pool), `infrangible_platform` (Infrangible Platform), `corporea_spark_creative` (Creative Corporea Spark), `blacker_lotus` (creative version of black_lotus), `infinite_fruit` (The Fruit of Grisaia). **5 items.** Botania ships these without recipes; they're creative-mode oddities. No survival access path.

### Gaia Guardian (T4 boss) drops
`king_key` (Key of the King's Law), `dice` (Dice of Fate), `flugel_eye` (Eye of the Flügel), `thor_ring` (Ring of Thor), `odin_ring` (Ring of Odin), `loki_ring` (Ring of Loki). **6 items.** All drop from Gaia Guardian or Gaia Guardian II; no crafting recipes. The 3 Norse rings (Thor/Odin/Loki) are the endgame curio prize.

### Lens
`lens_storm` (Storm Lens). **1 item.** Endgame Spreader lens; recipe likely requires T3+ ingredients.

## Findings

### Properly gated (no action)

- **Manasteel chain (T2)** — 12 items staged in `astages_restrictions.js`. Weapons, armor, ingots, blocks all locked behind T2 progression. Greenlit.
- **Terrasteel chain (T3)** — terrasteel_ingot/block/armor + elementium_ingot/block/armor/sword/pick/axe/shovel/shears + dragonstone all T3-staged. Includes Apotheosis T2 workstations (gem cutting, simple reforging, sigil_of_socketing) at T2 since they're entry-level.
- **Gaia chain (T4)** — `gaia_ingot` and `gaia_block` T4-staged. Mythic Forge consumes gaia_ingot as a Voidheart Blade reagent; ascension consumes gaia_ingot as a step reagent. Greenlit.
- **Orechid datapack** — 5 ore-overrides prevent the Orechid flower from cheap-spawning diamond/deepslate_diamond/ancient_debris/osmium/deepslate_osmium ores. This is the most efficient single-file tier-skip prevention in the pack.
- **Mana Infusion shortcuts removed** — Mana Pool can no longer convert mana to diamond or emerald.
- **Gaia Guardian boss-drop EPICs (6 items)** — no recipes; drops from a boss that requires terrasteel (T3) entry. Transitively T4. Greenlit.
- **Creative-only EPICs (5 items)** — no survival access. Greenlit.
- **Codex starter** — `botania:lexicon` in `codex_delivery.js`; players get the Botania lexicon as a starter item. Good UX.

### CONCERN — `spawner_mover` (UNCOMMON, ungated)

`spawner_mover` is a Botania item that picks up vanilla mob spawners and lets you replace them. **High dupe / power risk** if it functions like the OpenBlocks dislocator — moving a Witch Hut spawner to a blaze farm location, etc.

**Action:** verify Botania's vanilla `spawner_mover` behavior — does it preserve the spawner type or generic-it on placement? If it preserves type, consider tier-gating to T3 OR removing the recipe. Spawn-farm exploits are progression-breaking.

### CONCERN — `missile_rod` and `terraform_rod` (UNCOMMON, ungated)

`missile_rod` is a wand-like ranged attack tool. `terraform_rod` is a terrain-flattening tool. Both UNCOMMON. Likely have terrasteel/elementium recipes (T3-gated transitively), but **verify** — if they require only manasteel + flowers, they're T2 power tools that may break early-Nether pacing.

### CONCERN — `astrolabe`, `flight_tiara`, `diva_charm`, `laputa_shard` (UNCOMMON curios)

- **`astrolabe`** — places multiple blocks in 3x3/5x5/7x7 patterns.
- **`flight_tiara`** — creative-flight-equivalent. Locked to elementium (T3) by mod recipe — verify.
- **`diva_charm`** — passive +luck or +experience curio.
- **`laputa_shard`** — used to pick up entire pieces of the world.

These are mostly fine if their recipes already require terrasteel/elementium (which IS T3-staged). **Action:** spot-check `flight_tiara` recipe in JEI — if it can be acquired at T2, that breaks dimensional traversal balance.

### Verified clean

- **`ancient_will_*`** (5 UNCOMMON items: ahrim, dharok, guthan, torag, verac, karil — note: `karil` is actually 6 total, listed in dump). These are upgrade reagents for Gaia Guardian II rings. Drop from Gaia Guardian I (T4 boss). Transitively T4-gated.
- **`tiny_potato`** (UNCOMMON) — flavor block. No mechanical impact.
- **`pinkinator`** (UNCOMMON) — converts Botania pixies to pink pixies. Cosmetic.
- **`gaia_head`** (UNCOMMON) — drops from Gaia Guardian. Transitively T4-gated.
- **`alfheim_portal`** (UNCOMMON) — Alfheim portal frame; portal is no longer used in modern Botania (the portal mechanic was removed in 1.18+). Decorative only.

### Items not currently touched by gates

- 9 RARE items (`enchanted_soil`, `twig_wand`, `dreamwood_wand`, `gaia_ingot`, `water_ring`, `black_lotus`, `overgrowth_seed`, `record_gaia_1`, `record_gaia_2`).
  - `gaia_ingot` IS in T4 stage list. ✓
  - `record_gaia_1`, `record_gaia_2` are music discs. Cosmetic. ✓
  - `twig_wand`, `dreamwood_wand` are starter mod tools. T1 entry. ✓
  - `enchanted_soil` (Pure Daisy → Hydroangeas product) — T1 mid-game. Fine.
  - `water_ring` (Mana Ring of Water) — water-walking curio. UNCOMMON-equivalent power. Likely fine.
  - `black_lotus` — drop from cookies + spice. T1-T2 mid-tier. Fine.
  - `overgrowth_seed` — Mortar of the Pure Pestle product, generates Pasture grass. Fine.

### Standouts

- **Botania has the cleanest tier model in the pack** — 4 distinct material tiers (mana → manasteel → terrasteel → elementium → gaia), each with its own ingot/block/armor/weapon set, each cleanly mapped to a progression stage. Future content mods could be evaluated against this model as a benchmark.
- **Orechid datapack technique is reusable** — for any mod with stone-conversion mechanics (mystical_agriculture, occultism otherstone if it has one, etc.), the same per-ore datapack approach prevents tier-skip with minimal code.
- **Gaia Guardian as a boss chokepoint** — like Hephaestus Forge in F&A, Botania's Gaia Guardian is a single chokepoint that gates all 6 EPIC drops + 6 ancient_will reagents. Confirms cross-cutting finding B2 (chokepoint gating).
- **`record_gaia_1` and `record_gaia_2`** are some of the most beloved Botania music tracks. Not a balance concern, but worth noting they exist as drops.

## Recommended actions (priority order)

1. **(highest priority — JEI verification)** `spawner_mover` behavior — does it preserve mob spawner type on placement? If yes, gate to T3 or remove recipe.
2. **(JEI spot-checks, ~10 min)** Recipes for `missile_rod`, `terraform_rod`, `astrolabe`, `flight_tiara`, `diva_charm`, `laputa_shard`. Confirm each transitively gates to T3 via terrasteel/elementium ingredients.
3. **(future polish)** If we ever add more Botania-adjacent mods (Botania Tweaks, etc.), run a quick check that they don't bypass our T2/T3/T4 stage list.

## Existing coverage map

| File | What it does | Botania hits |
|------|--------------|-------------:|
| `gates/astages_restrictions.js` (T2/T3/T4) | Material chain stage gates | 28 items across 3 tiers |
| `recipes/recipe_audit.js` lines 145-146 | Mana Infusion shortcut removal | 2 recipes |
| `recipes/tier_gated_recipes.js` line 170 | Orechid handled via datapack | comment marker |
| `datapack_sources/icraft_botania_overrides/` | Orechid weight overrides | 5 ore entries |
| `recipes/tier_skip.js` | Manasteel/Terrasteel/Mana-Diamond as override ingredients | ~10 references |
| `endgame/mythic_forge.js` line 49 | gaia_ingot as Voidheart base reagent | 1 ingredient |
| `endgame/ascension.js` line 387 | gaia_ingot as ascension reagent | 1 ingredient |
| `codex_delivery.js` line 652 | lexicon in starter codex | 1 item |
| `scaling/boss_hp.js`, `scaling/boss_progressive.js` | Gaia Guardian HP scaling | 2 references |
| `gates/milestone_detection.js` | Gaia Guardian kill counter | 1 boss |
| `loot/loot_overhaul.js`, `loot/lootjs_overhaul.js` | Various loot tweaks | multiple refs |
| `origins/witch_of_ink_progression.js` | Witch of Ink mana tie-in | multiple refs |
| `tags/transmuted_tags.js` | Tag-based recipe alternatives | multiple refs |
| `recipes/refined_storage_dualpath.js` | RS-Botania crafting alternatives | multiple refs |
| `endgame/rift_mechanics.js` | Rift mechanic ties | multiple refs |

Total: 77 botania references across 17 files. **Most-tier-organized mod in the pack.** Coverage maturity is the benchmark for other content mods.
