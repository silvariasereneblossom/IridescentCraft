# Cataclysm Audit

**Mod:** L_Ender's Cataclysm
**Items in JEI:** 284 (70 EPIC)
**Audit date:** 2026-04-27
**Verdict:** LIGHT POLISH — design is sound, EPIC items are properly boss-gated. One materials-sourcing chain to verify, otherwise greenlit.

## Why this mod is in scope

Cataclysm contributes most of our T3-T4 nether/end bosses (Netherite Monstrosity, Ignis, the Harbinger, the Leviathan, Maledictus, Ender Guardian, Ancient Remnant, Void Blossom, Ender Golem). Its EPIC items are heavy: bossy weapons, smithing-template armors, and ascension reagents. Already deeply wired into our progression:

- `kubejs/server_scripts/scaling/boss_hp.js` — HP scaling for 10 cataclysm bosses (T3 + T4 brackets)
- `kubejs/server_scripts/gates/milestone_detection.js` — T3 boss-kill counter listens for cataclysm bosses
- `kubejs/server_scripts/loot/cataclysm_boss_drops.js` — 8 entity loot modifiers for ISS/runes synergy
- `kubejs/server_scripts/endgame/ascension.js` — uses `cataclysm:void_core` and `cataclysm:monstrous_horn` as ascension reagents

## EPIC items (70) by category

### Boss weapons (drop-only, one-of-a-kind)
`bulwark_of_the_flame`, `the_incinerator`, `blazing_grips` (Ignis line) -
`gauntlet_of_maelstrom`, `tidal_claws` (Leviathan line) -
`gauntlet_of_guard`, `gauntlet_of_bulwark` (Ender Guardian) -
`wither_assault_shoulder_weapon`, `void_assault_shoulder_weapon` (Wither/Ender shoulder) -
`monstrous_horn`, `chitin_claw`, `meat_shredder`, `laser_gatling` (Netherite Monstrosity) -
`cursed_bow`, `wrath_of_the_desert`, `sandstorm_in_a_bottle`, `ancient_spear`, `remnant_skull` (Ancient Remnant) -
`soul_render`, `the_annihilator`, `the_immolator` (Maledictus / Ignited Revenant) -
`astrape`, `ceraunus`, `brontes` (storm trio - reagent-crafted from boss drops)

### Curios / accessories
`ring_of_grudged`, `berserker_soul_amulet`, `vitality_ankh`, `unbreakable_skull`, `essence_of_the_storm`, `netherite_effigy`

### Armor sets (smithing-template gated)
Ignitium: helmet/chestplate/leggings/boots + `ignitium_elytra_chestplate`
Cursium: helmet/chestplate/leggings/boots
Monstrous: `monstrous_helm`

### Materials (block + ingot pairs)
`enderite`, `witherite`, `ignitium`, `cursium` -- 4 blocks + 4 ingots = 8 EPIC entries

### Forges / boss-tier crafting blocks
`void_forge` (Ender Guardian), `infernal_forge` (Ignis)

### Build/quest blocks (no recipe, creative/quest only)
`altar_of_fire`, `altar_of_void`, `altar_of_amethyst`, `altar_of_abyss`, `boss_respawner`, `cursed_tombstone`, `door_of_seal`, `goddess_statue`, `abyssal_egg`, `mechanical_fusion_anvil`, `emp`, `lava_power_cell`, `blessed_amethyst_crab_meat`

### Cosmetic
9 music discs (`music_disc_*`)

## Findings

### Properly gated (no action)

- **Boss-drop weapons** -- all dropped via mod's loot tables when the boss is killed. Bosses are HP-scaled and counted by milestone_detection. Greenlit.
- **Smithing-template armors** (ignitium_*, cursium_*) -- vanilla Forge `smithing_trim` mechanic with mod-specific upgrade templates. Templates drop from boss chests. Greenlit.
- **Reagent weapons** (astrape, ceraunus, brontes, void_forge, infernal_forge) -- crafted in the mod's own forges using boss-drop reagents. The forges themselves require boss kills to acquire. Greenlit.
- **Altars / boss_respawner / door_of_seal / abyssal_egg** -- no recipes; creative-only or quest reward. Confirmed via grep against `kubejs/server_scripts/recipes/` (no overrides exist, none needed). Greenlit.
- **Music discs** -- cosmetic, drops from creeper-killing-boss mechanic. No balance impact.

### Verified clean cross-references

- **`monstrous_horn` and `void_core`** are both used as ascension reagents (`endgame/ascension.js:385-386`). Both drop from T3-T4 bosses in their respective dimensions. Reagent gating is sound.
- **`abyssal_sacrifice`** (mid-game crafting) requires T3 ingredients per upstream mod recipe; no override needed.
- **LootJS synergy** (`cataclysm_boss_drops.js`) contributes ISS ink, runes, upgrade orbs, and rare spell-book drops on top of canonical drops. Tier-appropriate ratios (0.10-0.70 chances; rarer items lower). No overlap with mod's own drops.

### Concern -- materials sourcing chain

The four material ingots/blocks (`witherite_ingot`, `enderite_ingot`, `ignitium_ingot` (implied, EPIC variant `ignitium_block` listed), `cursium_ingot` (implied)) all show up at EPIC rarity. **Need to verify the raw-material → ingot chain is itself boss-gated and not bypassable via standard blast-furnace smelting of an over-world ore.**

- If `witherite_ingot` is obtained only by smelting `witherite_scrap` (Wither boss drop), or by 9-pack from `witherite_block` (which itself crafts only from Wither-only material), it's clean.
- If `cursium_ingot` is obtained from over-world `cursium_ore` that spawns in the deep dark or similar, and the ore is mineable with iron-tier or better, it may be **EPIC-rarity-but-T1-accessible**, which is a flavor-only mismatch (not gameplay-breaking) but worth flagging.
- **Action:** spot-check the recipe data on next world load (or via `/kubejs hand` + JEI uses lookup). If cursium/ignitium/witherite/enderite ores can be mined, I recommend `tier_gated_recipes.js` adds a tier check on the ore→ingot smelting recipe.

### Items not currently touched by gates

None of cataclysm's 70 EPIC items are completely untouched -- everything is either:
- Drop-locked behind a tier-3 or tier-4 boss (which has the milestone counter), OR
- Reagent-crafted using such drops, OR
- Recipe-less (creative/quest), OR
- Cosmetic.

Non-EPIC items (214 entries: building blocks, decorative bricks, schoolboy/coral variants, etc.) are flavor and don't need gates.

### Standouts / interesting

- **`sandstorm_in_a_bottle`** -- single-use AOE summoner; confirm it's not abusable for mob farms. (LootJS coverage is mob-side; it's a player tool.)
- **`netherite_effigy`** -- listed EPIC; unclear if this is a crafting-table item vs a built block. Worth one minute of in-game inspection.
- **`mechanical_fusion_anvil`** -- our `void_forge`/`infernal_forge` already cover the boss-tier crafting station role. If this anvil overlaps in function, decide whether to disable or merge. Low priority; flag for design pass.
- **`emp`** -- electromagnetic pulse item; in our world it would interact with Mekanism / Create / IF tech. Confirm it doesn't trivialize tech-tier gating.

## Recommended actions (priority order)

1. **(spot-check)** Verify `witherite/enderite/ignitium/cursium` ore→ingot chain is boss-gated. If bypassable, add tier guard in `tier_gated_recipes.js`.
2. **(spot-check)** In-game test of `emp` against a Mekanism reactor and IF Laser Drill -- ensure no progression skip.
3. **(design)** Decide on `mechanical_fusion_anvil` vs `void_forge`/`infernal_forge` overlap.

No code ships from this audit until items 1-3 are validated. Ship cataclysm.md as the framework template for the rest of the per-mod sweep.

## Existing coverage map

| File | What it does | Cataclysm hits |
|------|--------------|---------------:|
| `loot/cataclysm_boss_drops.js` | ISS/runes synergy | 8 entities |
| `scaling/boss_hp.js` | HP scaling | 10 entities |
| `gates/milestone_detection.js` | T3-kill counter | 5+ tracked |
| `endgame/ascension.js` | reagent gates | 2 items |

Total: ~25 cataclysm references across `server_scripts/`. Coverage is dense.
