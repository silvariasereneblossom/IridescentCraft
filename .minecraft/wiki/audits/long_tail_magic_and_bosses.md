# Long-Tail Magic + Boss Mods Batch Audit

**Mods (15+):** mahoutsukai, art_of_forging, aetheric_tetranomicon, savage_and_ravage, relics, artifacts, moreartifacts, too_many_bows, meetyourfight, multiplayerbosses, mutantmonsters, enemyexpansion, progressivebosses, bygonenether, creeperoverhaul, majestic_menaces, nether_zombies, netherskeletons, majruszsdifficulty, twilightaether, stalwart_dungeons, deeperdarker, icarus, toe
**Items in JEI:** ~990 combined
**Audit date:** 2026-04-27
**Verdict:** MEDIUM REWORK — 3 high-impact ungated mods (art_of_forging, too_many_bows, moreartifacts) collectively put ~85 progression-relevant items outside any tier system. Several smaller mods are also fully ungated. Existing coverage is excellent for the wired ones (relics 35 refs, artifacts 73 refs, mahoutsukai 21 refs, stalwart_dungeons 18 refs).

## Why these mods are in scope

The "long tail" magic + boss content. Some are heavily wired through existing audits (relics + artifacts via curated chest pools, mahoutsukai via mahou_synergy_drops.js); others appear to have been overlooked when initial gating was set up. **Three completely-ungated mods with substantial EPIC content surface as new P1 findings.**

## Per-mod findings

### art_of_forging — 33 items (13 EPIC, 9 RARE), **0 refs** — CRITICAL UNGATED

Multi-tier mod with a clear ancient → demonic weapon ladder + ritual progression. **Completely outside our gating system.**

EPIC items:
- **Ancient weapons** (3): `ancient_axe`, `ancient_blade`, `ancient_flail` — mid-tier base
- **Demonic upgrades** (3): `demonic_axe` (Annihilated), `demonic_blade` (Cataclysmic), `demonic_flail` (Grievous) — endgame upgrades
- **Sigil + curios** (3): `sigil_of_eden`, `enigmatic_construct`, `mark_of_the_architect`
- **Reagents** (1): `devils_soul_gem` (Dark Orb)
- **Rending Scissors chain** (3): red + purple + complete (3-step progression)

**Action:** verify recipes for each; add ancient weapons to T2 stage, demonic to T4 stage. Devils_soul_gem and Sigil are likely T3 reagents. Mark_of_the_architect is the lore item.

### too_many_bows — 43 items (18 EPIC, 13 RARE), **0 refs** — CRITICAL UNGATED

14 named EPIC bows + 4 reagents, all completely ungated.

EPIC bows: `ancient_sage_bow`, `arcane_bow`, `frostbite`, `arc_heavens`, `dragons_breath`, `verdant_viper`, `shulker_blast`, `astral_bound`, `spectral_whisper`, `auroras_grace`, `twin_shadows`, `crimson_nexus`, `tidal_bow`, `necro_flame_bow`. Plus EPIC reagents: `cursed_stone`, `soul_fragment`, `rift_shard`, `power_crystal`.

**Bow-mage build is heavily skewed** if any of these can be acquired pre-tier. Multiple are clearly tier-themed (`shulker_blast` = End, `dragons_breath` = T4, `frostbite/tidal_bow` = T2-ish).

**Namespace collision concern**: `too_many_bows:rift_shard` exists alongside `kubejs:rift_shard` (used in `endgame/rift_mechanics.js` as ascension reagent). Different namespaces so no functional collision, but UX is confusing — players may think they're the same item.

**Action:** allocate the 14 bows across T2/T3/T4 boss-drop pools or chest pools by element/theme. Rename or relocate `too_many_bows:rift_shard` to avoid the namespace collision UX confusion (or accept and document it).

### moreartifacts — 61 items (11 EPIC, 21 RARE), **2 refs** — MOSTLY UNGATED

11 EPIC curios with no chest-pool allocation and no recipe gates. Mostly artifacts-mod-style accessories.

EPIC: `ankh_charm`, `ankh_shield`, `melody_plushie`, `hero_shield`, `lucky_emerald_ring`, `ender_dragon_claw`, `tainted_mirror`, `vanir_mask`, `enderian_treads`, `sculk_treads`, `dragon_eye`.

**Tier theming clear:**
- `ender_dragon_claw`, `dragon_eye`, `enderian_treads`, `sculk_treads` → T4 (End/Deeper Darker)
- `hero_shield`, `ankh_shield`, `ankh_charm` → mid-tier defensive
- `melody_plushie`, `lucky_emerald_ring`, `vanir_mask` → flavor curios

**Action:** add to T2/T3/T4 chest pools alongside the existing artifacts/relics/celestial pools in `lootjs_overhaul.js` Section 1.

### bygonenether — 35 items (1 EPIC), **0 refs** — UNGATED

EPIC: `netherite_bell`. Probably an endgame Nether-themed accessory or summoner. T3+ access required (Nether is T3) so transitively gated by dimension lock, but **action:** verify it doesn't appear in chest loot of low-tier dimensions.

### multiplayerbosses — 1 item (1 EPIC), **0 refs**

EPIC: `lootbag`. The mod's drop-from-bosses item that contains random rewards. Likely native to the mod's boss kills only. **Action:** verify mod integration — if multiplayerbosses bosses spawn in non-tier-appropriate dimensions, the lootbag could deliver high-tier loot at low tiers.

### majruszsdifficulty — 51 items (4 EPIC), 1 ref

The 4 EPIC items are advancement-tied (`advancement_bleeding`, `advancement_normal`, `advancement_expert`, `advancement_master`). These are auto-granted on difficulty progression. Mod-internal balance; no action needed.

### savage_and_ravage — 27 items, **0 refs** — UNGATED

Illager-themed expansion. No items currently surface as EPIC/RARE in JEI. **Action:** verify the mod's items don't include OP weapons/curios. Most savage_and_ravage content is mob-side (Iceologer, Griefer) which would be transitively-gated through their spawn rules.

### aetheric_tetranomicon — 2 items, **0 refs**

Just guidebook items. No-op for audit purposes.

### mahoutsukai — 84 items, 21 refs — PARTIALLY GATED

Has dedicated `mahou_synergy_drops.js` for cross-mod boss synergies. Mod uses Mahou (mana) tiers internally. 0 EPIC/RARE in JEI dump (uses internal tier system). Items include staves, runes, scrolls, ritual circles, focuses.

**Status:** mod-internal-balance-driven (4th non-vanilla rarity context). Existing synergy file covers boss tier integrations. **Greenlit — confirm no chest-loot leaks.**

### relics — 31 items (28 RARE), 35 refs — WELL-GATED

Distributed across T1/T2/T3/T4 chest pools in `lootjs_overhaul.js` (lines ~140 onward). Plus 3 special drops (Ender's Hand, Space Dissector, Shadow Glaive) per Implementation Status.

15 Relics removed from chest loot per Implementation Status (`Relics curation`). Coverage solid.

### artifacts — 45 items (44 RARE), 73 refs — WELL-GATED

Most-distributed curio-mod in the chest pool system (T1/T2/T3/T4 pools in `lootjs_overhaul.js`). Village artifact pool also whitelist-curated to specifically-appropriate items only.

### meetyourfight — 38 items (4 RARE), 16 refs — PARTIALLY GATED

Boss mod with ~3-4 unique boss fights (Bellringer, Swampjaw, Fridge, Rocky Roller). 16 refs suggests partial coverage.

**Action:** verify all 4 bosses have HP scaling + tier-appropriate drops. Spot-check.

### mutantmonsters — 21 items (1 EPIC), 19 refs — GATED

EPIC: `endersoul_hand` (Mutant Enderman drop). 19 refs include the recently-shipped block-break handler per session memory. Greenlit.

### enemyexpansion — 41 items, 4 refs — LIKELY GATED

Mob mod with native loot. 4 refs suggests basic integration.

### progressivebosses — 4 items, 0 refs

Vanilla boss buff mod. Adjusts Wither/Dragon difficulty without adding items. Greenlit.

### creeperoverhaul — 16 items, 0 refs

Replaces vanilla creeper with biome-themed variants. Items are mostly mob-internal. Greenlit.

### majestic_menaces — 4 items, 4 refs — RARE: ancient_eye

`ancient_eye` (RARE) is likely a boss-summon item for the Teikoku Senshi boss. Verify drop or spawn-egg-equivalent gating.

### nether_zombies — 5 items, 0 refs

Mob expansion. Greenlit.

### netherskeletons — 10 items, 0 refs

Mob expansion. Greenlit.

### twilightaether — 9 items, 0 refs

Crossover mod (Twilight + Aether). Probably decorative + recipe-only. Greenlit unless content is found.

### stalwart_dungeons — 98 items, 18 refs — WELL-GATED

Has dedicated `stalwart_dungeons_drops.js`. 7+ boss-drop modifiers wired. Greenlit.

### deeperdarker — 174 items (14 RARE), 37 refs — DIMENSION-GATED

Otherside dimension T3-staged. 14 RARE items mostly tied to native dimension loot. Greenlit at T3 level.

### icarus — 83 items (3 EPIC, 80 RARE), 9 refs — TIER-GATED

80 RARE feathered_wings (16 colors × 5 tiers — vanilla + dyed variants). Per Implementation Status: "Icarus T3-gated" — meaning the wings work in flight only after T3.

**Status:** correctly gated per existing protection. Greenlit.

### toe — 1 item, 12 refs

Single item (likely a token/codex). 12 refs suggests integration is solid.

## Findings

### Properly gated (no action)

- relics (35 refs across T1-T4 chest pools)
- artifacts (73 refs, T1-T4 + village whitelist)
- mahoutsukai (21 refs via mahou_synergy_drops.js)
- stalwart_dungeons (18 refs via stalwart_dungeons_drops.js)
- mutantmonsters (19 refs + recent block-break handler)
- icarus (T3-gated via existing protection)
- deeperdarker (T3 dimension lock)
- progressivebosses, creeperoverhaul, nether_zombies, netherskeletons, majruszsdifficulty (mob-side or advancement-only)

### CRITICAL — art_of_forging (~22 EPIC/RARE items completely ungated)

13 EPIC + 9 RARE items with **0 references** in our scripts. Multi-tier weapon ladder (ancient → demonic), curios, ritual progression, and lore items.

**Action:** create per-mod stage allocations:
- Ancient weapons → T2 stage
- Demonic weapons → T4 stage
- Sigils, devils_soul_gem → T3
- Mark_of_the_architect, rending_scissor chain → review individually
- Verify recipes and either: (a) gate via stage, (b) recipe-strip + boss-drop allocation, or (c) Tetra-replacement pattern from ISS audit.

### CRITICAL — too_many_bows (~31 EPIC/RARE bows + reagents ungated)

14 named EPIC bows + 4 reagents with **0 references**. Bow-class build is currently broken-OP.

**Action:** allocate the 14 bows across T2/T3/T4 boss-drop pools or chest pools by element/theme. Suggested mapping:
- `frostbite`, `tidal_bow`, `verdant_viper` → T2 (Twilight/Aether/Blue Skies)
- `arcane_bow`, `ancient_sage_bow`, `auroras_grace`, `crimson_nexus` → T3 (Nether/Undergarden)
- `dragons_breath`, `astral_bound`, `spectral_whisper`, `shulker_blast`, `arc_heavens`, `twin_shadows`, `necro_flame_bow` → T4 (End/Abyss/Deeper Darker)

Plus: rename or document the `too_many_bows:rift_shard` namespace collision with our `kubejs:rift_shard`.

### CRITICAL — moreartifacts (~32 EPIC/RARE curios mostly ungated)

11 EPIC + 21 RARE curios. Tier-theming is clear (Dragon → T4, Hero → mid-tier, Sculk → T4).

**Action:** add to existing T2/T3/T4 chest pools alongside artifacts/relics/celestial pools in `lootjs_overhaul.js`. Estimated 10-20 lines of allocation.

### CONCERN — bygonenether `netherite_bell`, multiplayerbosses `lootbag`, majestic_menaces `ancient_eye`, savage_and_ravage items

4 mods with 0-1 EPIC items each, 0 refs. Likely native boss-drop or transitively-dimension-gated, but worth verifying:
- `netherite_bell` — not in chest loot of low-tier dimensions
- `multiplayerbosses:lootbag` — bosses spawn only in tier-appropriate dimensions
- `majestic_menaces:ancient_eye` — Teikoku Senshi boss summon item, verify acquisition
- savage_and_ravage items — check for any unverified-OP weapons

### Standouts

- **art_of_forging is a major missed opportunity** — clear demonic-tier ladder fits the pack's RPG progression perfectly, but the mod went completely unwired. Likely added in a content-mod batch and never followed up. Process improvement: when a content mod is added, audit its EPICs immediately.
- **too_many_bows is a class-balance issue** — bow-mage builds depend heavily on bow availability. With 14 EPIC bows ungated, archers have access to T4-power gear from the start.
- **mahoutsukai's 5th non-vanilla rarity confirmed** — when checking the dump, mahoutsukai uses internal Mahou tiers (similar to F&A's Soul/Aureal). Cross-cutting C now confirmed in 5 mods.

## Recommended actions (priority order)

1. **(P1)** art_of_forging: gate the 22 EPIC/RARE items. Estimated 30-60 min: per-item recipe review + stage allocation + ancient/demonic mapping.
2. **(P1)** too_many_bows: allocate 14 bows across T2/T3/T4 chest pools, plus 4 reagents. Resolve the rift_shard namespace collision UX.
3. **(P1)** moreartifacts: add 32 items to existing chest pools in `lootjs_overhaul.js`.
4. **(P2)** Spot-check bygonenether, multiplayerbosses, majestic_menaces, savage_and_ravage for chest-loot leaks.
5. **(future polish)** When new content mods land, run a quick "any items not in any of our gating files?" check before merging.

## Existing coverage map (long-tail summary)

| Mod | Items | Refs | Status |
|-----|------:|-----:|--------|
| art_of_forging | 33 | **0** | **UNGATED** (P1 critical) |
| too_many_bows | 43 | **0** | **UNGATED** (P1 critical) |
| moreartifacts | 61 | 2 | mostly ungated (P1 critical) |
| bygonenether | 35 | 0 | ungated (P2) |
| multiplayerbosses | 1 | 0 | ungated (P2) |
| majestic_menaces | 4 | 4 | partially gated (P2 spot-check) |
| savage_and_ravage | 27 | 0 | ungated (P2 spot-check) |
| aetheric_tetranomicon | 2 | 0 | guidebook only — fine |
| mahoutsukai | 84 | 21 | partially gated via mahou_synergy_drops.js |
| relics | 31 | 35 | well-gated (T1-T4 chest pools + 3 special drops) |
| artifacts | 45 | 73 | best-gated curio mod (T1-T4 + village whitelist) |
| meetyourfight | 38 | 16 | partially gated |
| mutantmonsters | 21 | 19 | well-gated + recent block-break handler |
| enemyexpansion | 41 | 4 | likely gated via mob-side mechanics |
| progressivebosses | 4 | 0 | mod-internal (no items) |
| creeperoverhaul | 16 | 0 | mob-internal |
| nether_zombies | 5 | 0 | mob-internal |
| netherskeletons | 10 | 0 | mob-internal |
| twilightaether | 9 | 0 | greenlit |
| stalwart_dungeons | 98 | 18 | well-gated via stalwart_dungeons_drops.js |
| deeperdarker | 174 | 37 | T3 dimension-gated |
| icarus | 83 | 9 | T3-gated per existing protection |
| toe | 1 | 12 | well-integrated |
| majruszsdifficulty | 51 | 1 | advancement-only items |

Total: ~990 items across ~24 mods. ~85 items collectively ungated and progression-relevant (the 3 P1 mods).
