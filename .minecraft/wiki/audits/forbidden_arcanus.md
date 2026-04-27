# Forbidden Arcanus Audit

**Mod:** Forbidden Arcanus
**Items in JEI:** 257 (0 EPIC, 3 RARE, 3 UNCOMMON, 251 COMMON)
**Audit date:** 2026-04-27
**Verdict:** LIGHT POLISH — transitive-gating pattern is elegant and works. The mod's endgame items intentionally ship at COMMON rarity (F&A uses its own Soul/Aureal tier system, not vanilla Rarity), but every progression-critical item routes through either the **Hephaestus Forge (T3-gated)** or the **Arcane Crystal (T3-gated)**, so the chain is transitively gated even without per-item flags.

## Why this mod is in scope

Forbidden Arcanus is one of three "magic mod" pillars (alongside Iron's Spellbooks and Ars Nouveau) and contributes the Hephaestus Forge ritual-crafting station, the Soul system (soul → corrupt_soul → enchanted_soul progression), the Aureal mana-fuel loop, and a tier of endgame weapons (draco_arcanus_*, reinforced_deorum_*, dark_nether_star). The mod is intentionally **not blanket-mod-gated** in `astages_restrictions.js` because it has passive/food items that fit early-game.

Already wired:
- `kubejs/server_scripts/recipes/tier_gated_recipes.js` Section B.6 — Hephaestus Forge recipe re-gated to T3 (requires `deorum_ingot` + `obsidian` + `diamond` + `dimensional_progression_token_t3`)
- `kubejs/server_scripts/recipes/recipe_audit.js` line 152-153 — Clibano combustion recipes for `minecraft:diamond` and `minecraft:netherite_ingot` removed (prevents Clibano from skipping ore mining)
- `kubejs/server_scripts/gates/astages_restrictions.js` — `arcane_crystal`, `arcane_crystal_block`, `arcane_crystal_ore`, `deepslate_arcane_crystal_ore` all individually T3-gated; ore replacements at T3 stage
- Comment at `astages_restrictions.js:187` documents the design choice: F&A is NOT mod-gated because some passive items leak early; instead key materials are individually gated

## Rarity oddity

**Zero EPIC items** despite F&A having clearly endgame content. F&A uses **internal Soul/Aureal tier mechanics** rather than the vanilla Rarity enum. Items that should logically be EPIC ship as COMMON in JEI:

- `draco_arcanus_staff/sword/scepter/pickaxe/axe/shovel/hoe` — endgame weapons forged at Hephaestus Forge — all COMMON
- `dark_nether_star` — RARE (closest to "endgame-flagged")
- `reinforced_deorum_sword/blacksmith_gavel` — high-tier — COMMON
- `stellarite_piece` — endgame Hephaestus material — COMMON
- `darkstone_upgrade_smithing_template` — endgame template — COMMON

This isn't a *bug* in our pack — it's how F&A is designed. **But it does mean rarity-based audits or filters won't catch these items.** Worth noting for future cross-cutting work (e.g., if we ever loot-strip "all COMMON items below Tier X", we'd accidentally include these).

## Items by category

### Hephaestus Forge progression chain (T3-gated transitively)
`draco_arcanus_staff`, `draco_arcanus_sword`, `draco_arcanus_arrow`, `draco_arcanus_scepter`, `draco_arcanus_pickaxe/axe/shovel/hoe`, `dark_nether_star`, `reinforced_deorum_sword`, `reinforced_deorum_blacksmith_gavel`, `reinforced_deorum_pickaxe/axe/shovel/hoe`, `stellarite_piece` (refined), `darkstone_upgrade_smithing_template`. All require Hephaestus Forge → T3-gated → clean.

### Arcane Crystal chain (T3-gated)
`arcane_crystal`, `arcane_crystal_dust`, `arcane_crystal_dust_speck`, `arcane_chiseled_darkstone`, `arcane_bone_meal`, `corrupted_arcane_crystal`. Crystal itself is T3-gated; downstream items inherit.

### Soul system
`soul`, `corrupt_soul`, `enchanted_soul`, `soul_extractor`, `soul_crimson_stone`. Souls captured via `soul_extractor`. **Action item:** verify soul_extractor recipe requires arcane_crystal — if yes, transitively T3-gated.

### Aureal system (intentionally low-tier)
`aureal_bottle`, `splash_aureal_bottle`. F&A's mana-fuel resource. Low-tier by design (similar to potions). No gate needed.

### Materials (mostly COMMON, sourced naturally)
`deorum_ingot`, `deorum_nugget`, `obsidian_ingot`, `obsidian_with_iron`, `dark_matter`, `xpetrified_orb`, `darkstone`, plus 30+ darkstone variants (slabs, stairs, pillars, walls).

### Edelwood "endless bucket" suite (60+ items)
`edelwood_water_bucket`, `edelwood_lava_bucket`, `edelwood_milk_bucket` + 20+ entity buckets (axolotl, allay, bat, bee, etc.) + 5 soup/stew buckets, `edelwood_oil`, `edelwood_stick`, `edelwood_boat/chest_boat`, `edelwood_planks` + 10+ wood variants. F&A's haunted-tree wood used for various utility items. Functionally inventory QoL — no balance impact.

### Curios / accessories
`spectral_eye_amulet` (RARE), `eternal_obsidian_skull` (RARE), `obsidian_skull_shield` (UNCOMMON), `obsidian_skull` (UNCOMMON), `orb_of_temporary_flight` (UNCOMMON), `artisan_relic`. **Action item:** verify each has T2-T3 recipe gates or boss-drop sourcing; not currently in tier_gated_recipes.

### Smithing templates
`darkstone_upgrade_smithing_template`. F&A's equivalent of the netherite template — applies to deorum-tier upgrades. Source unclear; likely Hephaestus Forge ritual or chest loot.

## Findings

### Properly gated (no action)

- **Hephaestus Forge** — T3-gated via Section B.6 of `tier_gated_recipes.js`. The forge's recipe requires `dimensional_progression_token_t3`. Comment correctly identifies this as gating "the entire F&A endgame chain."
- **Arcane Crystal** — T3-gated in `astages_restrictions.js` (item, block, both ores). Ore replacement also at T3 stage so the ore can't be visually mined before T3.
- **Clibano combustion shortcut** — Removed for `diamond` and `netherite_ingot`. Prevents the Clibano furnace from being a diamond-skipping shortcut. Greenlit.
- **Mod NOT blanket-gated** — intentional design choice for passive/food item access. Documented at `astages_restrictions.js:187`.

### Verified clean

- **Aureal Bottle / Splash Aureal Bottle** — F&A's mana fuel; low-tier intentional. Like vanilla potions; no gate needed.
- **Edelwood "endless bucket" suite** — 60+ COMMON items, all QoL utility. Edelwood trees spawn in dark forests (T1 biome), buckets craft from leather + 4 edelwood planks. Mod-internal balance (one-use buckets), no gameplay break.

### CONCERN — soul_extractor sourcing

`soul_extractor` is the entry point to the Soul system (used to extract souls from killed mobs into bottles). Currently shows as COMMON. **Verify in JEI** that its recipe requires `arcane_crystal` or another T3-gated ingredient. If it can be crafted without T3 inputs, the entire Soul economy bypasses progression.

**Action:** spot-check recipe; if leaky, add to `astages_restrictions.js` T3 list.

### CONCERN — RARE/UNCOMMON curios

- `spectral_eye_amulet` (RARE) — what does it do? F&A wiki says "spawns ghostly eyes that highlight nearby mobs." Not power-breaking, but verify recipe.
- `eternal_obsidian_skull` (RARE) — provides regen/protection; upgrade of `obsidian_skull` via Hephaestus Forge. Transitively T3 if forge-only. Verify.
- `obsidian_skull` (UNCOMMON) — base Wither-resistance charm. Wither-source materials suggest T3 access requirement. Verify.
- `obsidian_skull_shield` (UNCOMMON) — shield variant. Same chain as above.
- `orb_of_temporary_flight` (UNCOMMON) — single-use flight. F&A flavor item, low-impact. Likely fine.

**Action:** ~5-minute JEI uses-lookup to confirm each routes through Hephaestus Forge or arcane_crystal.

### Items not currently touched by gates

Most items are either transitively T3-gated through Hephaestus Forge / Arcane Crystal, or are intentionally low-tier (edelwood, aureal, vanilla-tier materials). The handful that are unaccounted-for are listed in the CONCERN sections above (~7 items total).

### Standouts

- **`xpetrified_orb`** (COMMON) — F&A's "spawn-egg precursor" item; combined with Aureal to make spawn eggs. Mid-game utility. Worth verifying it can't be obtained early enough to bypass mob-spawn gating.
- **`reinforced_deorum_blacksmith_gavel`** — F&A's repair-tool variant of the gavel; if combined with our Tetra integration (gavels are repair tools), could be relevant for our modular spell book repair flow. Worth a thought-pass on whether we want to whitelist it as a Tetra hammer-tier-equivalent.
- **`darkstone_upgrade_smithing_template`** — only "post-netherite" smithing template in the pack. If used to craft reinforced_deorum gear via vanilla smithing, sourcing matters. Likely already chest-loot-only or Hephaestus-Forge-only; verify.

## Recommended actions (priority order)

1. **(JEI spot-checks, ~10 min)** Verify recipe sourcing for: `soul_extractor`, `spectral_eye_amulet`, `eternal_obsidian_skull`, `obsidian_skull`, `obsidian_skull_shield`, `xpetrified_orb`, `darkstone_upgrade_smithing_template`. Confirm each is either Hephaestus-Forge-only, arcane-crystal-gated, or boss-drop-only.
2. **(if any leak)** Add the leaking items individually to `astages_restrictions.js` `stageItems('tier_3', [...])`. This continues the existing pattern of per-item gating rather than mod-blanket gating.
3. **(future polish, low priority)** Consider whether the `reinforced_deorum_blacksmith_gavel` should be whitelisted as a Tetra hammer-equivalent for modular spell book repair. Adds cross-mod synergy without breaking balance (gavel itself is gated through Hephaestus Forge).

## Existing coverage map

| File | What it does | F&A hits |
|------|--------------|---------:|
| `recipes/tier_gated_recipes.js` Section B.6 | Hephaestus Forge T3 gate | 1 recipe replacement |
| `recipes/recipe_audit.js` lines 152-153 | Clibano shortcut removal | 2 recipes removed |
| `gates/astages_restrictions.js` lines 248-261 | Arcane Crystal T3 + ore gates | 4 items + 2 ore replacements |

Total: 12 forbidden_arcanus references. Coverage is light but **leveraged** — gating two chokepoints (Hephaestus Forge + Arcane Crystal) transitively gates dozens of downstream items. This is the most efficient gating pattern in the pack so far.
