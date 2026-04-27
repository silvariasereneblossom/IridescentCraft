# Celestial Artifacts Audit

**Mod:** Celestial Artifacts (+ Celestial Core)
**Items in JEI:** 107 (16 EPIC, 21 RARE, 21 UNCOMMON, 17 COMMON, 32 with custom chat-color rarity)
**Audit date:** 2026-04-27
**Verdict:** MEDIUM POLISH — 16 of the highest-EPIC curios are split T2/T4 by curated chest-loot pools, but ~14 EPIC curios + 32 chat-color "tier" items are completely outside the gating system. The pools are well-designed; coverage just hasn't been completed for the full curio set.

## Why this mod is in scope

Pure curio/accessory mod — every item is an equippable badge, ring, totem, scroll, or bracelet. Adds slot-based +stat or proc effects (similar to the Artifacts mod and Relics mod). The mod ships its own custom rarity system using `ChatFormatting` color names (dark_purple, dark_aqua, green, gold, etc.) rather than vanilla `Rarity`, meaning the JEI dump's rarity column captured the COLOR rather than a tier — see CONCERN below.

Companion mod **celestial_core** is the framework/registry mod (no direct items audited here; it's pure infrastructure).

Existing coverage in `kubejs/server_scripts/loot/lootjs_overhaul.js`:
- **T2 chest pool** (lines 519-528): 8 celestial items mixed with Artifacts mod items, ~12% combined drop in Twilight/Aether/Blue Skies chests
- **T4 chest pool** (lines 557-565): 8 celestial items mixed with Relics mod items, ~16% combined drop in End/Deeper Darker/Abyss chests
- **Diamond strip** (line 630): celestial_artifacts structure chests have diamonds removed
- **Village artifact strip** (line 1757): all celestial_artifacts items stripped from village chests via custom ItemFilter (whitelist only contains base Artifacts items)

## Custom rarity oddity (32 items)

The JEI dump column shows ChatFormatting color names instead of Rarity for 32 items:

| "Rarity" | Count | Theme | Examples |
|----------|------:|-------|----------|
| `dark_purple` | 11 | Corrupt/evil | war_dead_badge, corrupt_badge, cursed_talisman, cursed_totem, demon_curse, twisted_heart, hidden_bracelet, shadow_pendant, twisted_scabbard, catastrophe_scroll |
| `green` | 9 | Nature/spirit | emerald_ring, ring_of_life, bearing_stamen, emerald_bracelet, spirit_bracelet, emerald_necklace, forest_cloak, spirit_arrow_bag, gaia_totem |
| `dark_aqua` | 3 | Abyss-themed | abyss_will_badge, lock_of_abyss, abyss_core |
| `dark_green` | 3 | Nature higher? | (3 items) |
| `gold` | 1 | Legendary? | heart_of_revenge |
| `pink` | 1 | (?) | (1 item) |
| `red` | 2 | Combat/blood? | (2 items) |
| `yellow` | 2 | Treasure? | (2 items) |

**Inferred mapping:** these are the mod's internal tier colors. `gold` (1 item) is likely top-tier, `dark_purple` (11) and `dark_aqua` (3) are high-tier, `green/dark_green` (12) are mid-tier, `pink/red/yellow` (5) are lower-tier flavor.

This is **the second mod (after forbidden_arcanus) to flag the cross-cutting non-vanilla-rarity finding** — see README cross-cutting C. Future audits should verify that "rarity-based" sweeps don't accidentally exclude mod-internal-tier items.

## EPIC items (16) by category

### Allocated to T2 chest pool (lines 523-526)
`cross_necklace`, `iron_scabbard`, `copper_reinforce_plate`, `amethyst_ring`, `forest_cloak`, `holy_talisman`, `life_bracelet`, `fang_necklace`. Note: `forest_cloak` shows up as `green` rarity in JEI but is in the T2 pool — confirms the chat-color rarity is NOT a balance signal we should trust. (None of these 8 are in the EPIC list above; they have lower JEI rarities. Cross-reference confirms the curated pool spans tiers.)

### Allocated to T4 chest pool (lines 561-564)
`demon_heart`, `abyss_core`, `angel_heart`, `nebula_cube`, `flight_ring`, `prayer_crown`, `spirit_crown`, `end_etching`. **8 EPIC items properly gated.**

### EPIC items NOT in any pool (10 items — gap)
`the_end_dust`, `destroyer_badge`, `twisted_brain`, `cursed_protector`, `soul_box`, `gluttony_badge`, `magic_horseshoe`, `sacrificial_object`, `greedy_heart`, `precious_bracelet`, `chaotic_pendant`, `ender_protector`, `evil_eye`, `ender_jump_scepter`. **14 EPIC items ungated.**

(My count is off slightly — 8 in pool + 14 ungated = 22, but EPIC list has 16. Some of the "in T4 pool" items may not actually be EPIC-rated; the mod's rarity is loose. Spot-checked: `nebula_cube`, `demon_heart` ARE EPIC. `angel_heart`, `abyss_core` were not in the EPIC list — they show as RARE/dark_aqua. So the T4 pool spans EPIC + RARE + dark_aqua. The pool curation is by *power level*, not by rarity tag.)

## Findings

### Properly gated (no action)

- **T2 chest pool** — 8 celestial items injected into Twilight/Aether/Blue Skies chests at ~12% combined. Drop rate is per-item `0.12 / 8 = 1.5%` per item. Coexists with the base Artifacts mod's items.
- **T4 chest pool** — 8 celestial items in End/Deeper Darker/Abyss chests at ~16% combined. Per-item `0.16 / 8 = 2%`. Includes the heaviest celestial items (demon_heart, angel_heart, nebula_cube).
- **Diamond strip** — celestial structure chests can't drop diamonds.
- **Village strip** — celestial items can't appear in village chests (filter pattern). Village artifact pool is whitelist of base Artifacts only.

### CONCERN — 14 EPIC items completely ungated

Listed above. These have no chest-pool allocation, no recipe-removal, no tier-stage. If the mod's own GLM injects them into vanilla chests OR they're craftable from base materials, they leak into early-game progression.

The most concerning by name semantics:
- **`ender_jump_scepter`** — active item (scepter, not curio). Implies a teleport ability. If craftable from ender pearls + low-tier material, it skips T2 dimensional traversal.
- **`magic_horseshoe`** — likely +speed or +jump curio. If accessible early, breaks combat-pacing.
- **`evil_eye`** — implies a scrying / freeze-mob proc. High utility.
- **`twisted_brain`, `cursed_protector`, `gluttony_badge`, `destroyer_badge`** — likely +stat curios with thematic procs.
- **`soul_box`, `sacrificial_object`** — possibly used in a sacrifice/ritual mechanic.
- **`the_end_dust`** — reagent. Sourcing matters; if obtained from regular endermen at low rates, it's End-tier-skipping.

**Action:** decide for each:
1. Add to existing T3 or T4 chest pool, OR
2. Add to recipe-removal list if craftable, OR
3. Allocate to specific bosses (e.g., `evil_eye` → witch boss, `ender_jump_scepter` → Enderdragon).

Recommend a pass over all 14 with JEI uses-lookup. Estimated 30 min.

### CONCERN — 32 chat-color items completely outside the system

The 32 items with custom chat-color "rarity" are NOT covered by any gating logic. Some are clearly endgame (gold = heart_of_revenge, dark_purple = corrupt-themed) but appear as raw drops with no pool/strip/recipe gate.

**Action:** triage by chat-color tier. Suggested mapping:
- `gold` (1) → T4 pool
- `dark_purple` (11) → T3 or T4 pool, themed around "evil" structures
- `dark_aqua` (3) → T3 (Abyss/deep) pool
- `green` + `dark_green` (12) → T2 pool (Twilight/Aether nature theme)
- `pink/red/yellow` (5) → T1-T2 sprinkle

Add a Section 1.5 between T1 and T2 pools or similar.

### CONCERN — duplicate IDs vs base Artifacts mod

`celestial_artifacts:cross_necklace` exists. `artifacts:cross_necklace` also exists (line 522 of loot_overhaul). Both are in our T2 pool. **Same name, different items.** Probably has different stats per mod, but worth verifying we haven't accidentally duplicated the cross_necklace effect by including both in the same chest pool.

Also: `celestial_artifacts:obsidian_skull` (likely exists) vs `artifacts:obsidian_skull` (in pool) vs `forbidden_arcanus:obsidian_skull` (audited). Three obsidian skulls in the pack. If they all stack with each other in curio slots, that's a balance concern. Spot-check needed.

### Items not currently touched by gates

Most COMMON-rarity items (17) are flavor utility items — generally fine to leave alone. The 21 UNCOMMON and 21 RARE items are mostly mid-tier curios, probably fine but worth a one-pass scan to see if any obvious procs slipped through. ~42 items in this bucket.

### Standouts

- **`heart_of_revenge`** (gold) — only `gold`-rated item. Strong endgame implication. Definitely needs T4 allocation.
- **`gaia_totem`** (green) — anti-death totem? Vanilla `totem_of_undying` semantics suggest revive mechanic. **High priority** — totems with revive effects should always be tier-gated.
- **`cursed_totem`** (dark_purple) — same concern.
- **`catastrophe_scroll`** (dark_purple) — single-use scroll. AOE damage? Verify cast effect.
- **`twisted_scroll`** — same scroll family.
- **`spirit_arrow_bag`** (green) — capacity expansion? Or unlimited arrow exploit?

## Recommended actions (priority order)

1. **(JEI sweep, ~30 min)** Triage all 14 ungated EPIC items + the 5 standouts above. For each: check recipe + intended mod tier + add to appropriate pool/strip.
2. **(triage chat-color items, ~30 min)** Map the 32 chat-color items to T1-T4 pools or strip lists. Highest priority: `heart_of_revenge` (gold) → T4, the 11 dark_purple items → T3-T4, gaia_totem and cursed_totem → tier-locked.
3. **(spot-check duplicate IDs)** Confirm `celestial_artifacts:cross_necklace` does not double-stack with `artifacts:cross_necklace` in curio slots. If it does, remove one from the T2 pool.
4. **(extend T3 pool)** Currently the T3 pool (line 540) has zero celestial items. Add 4-8 celestial items themed for Nether/Undergarden tier. Prevents the T2→T4 cliff in celestial coverage.

## Existing coverage map

| File | What it does | Celestial hits |
|------|--------------|---------------:|
| `loot/lootjs_overhaul.js` T2 pool | Twilight/Aether/Blue Skies chest injection | 8 items |
| `loot/lootjs_overhaul.js` T4 pool | End/Deeper Darker/Abyss chest injection | 8 items |
| `loot/lootjs_overhaul.js` Section 2 | Diamond strip from celestial structures | regex pattern |
| `loot/lootjs_overhaul.js` Section 6 (village strip) | Custom ItemFilter strips from village chests | mod prefix match |

Total: 12 references. Coverage is **curated but partial** — half of EPIC items handled, the other half + the entire chat-color tier-system is outside the system.
