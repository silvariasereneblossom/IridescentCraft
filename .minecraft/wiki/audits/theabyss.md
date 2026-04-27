# The Abyss Audit

**Mod:** The Abyss (theabyss)
**Items in JEI:** 480 (26 EPIC, 62 RARE, 19 UNCOMMON, 373 COMMON)
**Audit date:** 2026-04-27
**Verdict:** MEDIUM POLISH — extensive existing coverage (118 references across 16 files), but several EPIC totems/curios are ungated and one singular/plural drift in the ring removal list is masked only by the regex safety net.

## Why this mod is in scope

The Abyss is one of our two T3 dimensional worlds (alongside Undergarden) and contributes 30 dimension-themed rings (all crafting-removed), 5 boss-drop armor sets, 7 elemental armor sets with set-bonuses, and a Nosaj boss line. It's also one of the most extensively-wired mods in the pack. Existing coverage:

- `kubejs/server_scripts/recipes/recipe_audit.js` Section K — 30 vanilla ring recipes removed (regex + 29-item belt-and-suspenders list), `arcane_workbench` removed, 5 boss-drop armor sets recipe-removed (Knight, Unorithe, Ragnarok, Dragon, Death)
- `kubejs/server_scripts/loot/abyss_boss_loot.js` — 7 custom kubejs rings replace the 30 vanilla ones (shadows, phantom, embers, frost, void_sight, knight, dark_pact, unorithe), allocated to chests + boss drops
- `kubejs/server_scripts/abyss/abyss_armor_effects.js` — set-bonus mechanics for 7 elemental armor sets (garnite, aberythe, incorythe, fusion, phantom, glacerythe, ignisithe)
- `kubejs/server_scripts/gates/astages_restrictions.js` — `theabyss:the_abyss` dimension T3-gated
- `kubejs/server_scripts/scaling/boss_hp.js` + `boss_progressive.js` — boss HP scaling
- `kubejs/server_scripts/scaling/dimension_mechanics.js` — Abyss "oppressive darkness, corruption, fear aura" mechanics
- `kubejs/server_scripts/endgame/ascension.js` line 137 — abyss items contribute to ascension reagent pool
- `kubejs/server_scripts/codex_delivery.js` — abyss content in codex
- `kubejs/server_scripts/origins/origin_effects.js` + `witch_of_ink_progression.js` — Witch of Ink origin tied to Abyss

## EPIC items (26) by category

### Materials (boss-drop armor inputs)
`icora_stone`, `knight_ingot`, `incorythe_gem`, `phantom_ingot`, `unorithe_ingot`. These feed the 5 boss-drop armor sets and several Tetra material entries.

### Trophy items
`crown_of_nosaj`, `amuled_of_nosaj` (sic — F&A's typo "amuled" = "amulet"). Nosaj boss drops.

### Totems
`totem_of_thunder`, `totem_of_abyss`, `totem_of_time`. Likely undying-style life-saver items, similar to vanilla totem of undying.

### Reagents
`enchanted_bottle_of_somnium`, `eye_of_abyss`, `dream_shifter`, `node_shard`, `immortal_substance`. Crafting reagents for endgame Abyss content.

### Curios
`clock_of_time`, `artifact_of_after_life`. Slot-based accessories.

### Rings (vanilla F&A — should all be removed)
`ring_of_thunder`, `ring_of_freeze`, `ring_of_telekinetic`, `ring_of_ghosts`, `ring_of_time`, `ring_of_blackstrike`, `ring_of_curse`, `ring_of_firework`, `ring_of_fart` (9 rings, all EPIC-rated). Section K's removal list covers 29 of 30 — the regex `/theabyss:ring_/` is the safety net for the rest.

## Findings

### Properly gated (no action)

- **Ring system overhaul** — 30 vanilla rings recipe-removed via regex + individual list. 7 custom kubejs rings replace them at proper drop locations (15% structure chests, 10-25% boss drops). This is the most thorough single-mod overhaul in the pack so far.
- **5 boss-drop armor sets** (Knight, Unorithe, Ragnarok, Dragon, Death) — recipes removed in Section K.5; loot allocated in `abyss_boss_loot.js` at scaled chances (Knight 20%, Unorithe 15%, Ragnarok/Dragon/Death 5% — properly hardest-tier-rarest).
- **7 elemental armor set-bonuses** — `abyss_armor_effects.js` provides the gameplay reward for collecting full sets. Greenlit.
- **Dimension T3-gating** — `theabyss:the_abyss` is dimension-gated to T3 in `astages_restrictions.js`. Abyss can't be entered before T3 progression.
- **Boss HP + progressive scaling** — wired into `boss_hp.js` + `boss_progressive.js`.

### CONCERN — singular/plural drift on `ring_of_ghost`(s)

The individual removal list has `'theabyss:ring_of_ghost'` (singular) but the JEI dump shows `theabyss:ring_of_ghosts` (plural). The individual `event.remove({ output: 'theabyss:ring_of_ghost' })` is therefore a no-op — but the prior regex `event.remove({ output: /theabyss:ring_/ })` catches it via prefix match.

So the gate works (defended by the regex), but the individual list entry is dead code. **Action:** rename the list entry to `ring_of_ghosts` (plural) and verify against the live JEI registry. Same one-time check pattern as simplyswords; possibly the same kind of rename drift across other mods' rings.

### CONCERN — ungated EPIC totems

`totem_of_thunder`, `totem_of_abyss`, `totem_of_time`. Functionally similar to vanilla `totem_of_undying` — likely auto-revive on lethal damage with elemental side-effects. Currently no recipe-removal, no loot allocation, no tier check.

If craftable from low-tier ingredients, players could stack 3 totems and become functionally immortal. **Action:** JEI uses-lookup; if recipes exist, add to Section K with the armor sets, OR add to `astages_restrictions.js` T3 list, OR allocate to specific Abyss bosses as drops.

### CONCERN — ungated EPIC trophies + reagents

`crown_of_nosaj`, `amuled_of_nosaj`, `eye_of_abyss`, `dream_shifter`, `node_shard`, `enchanted_bottle_of_somnium`, `immortal_substance`. None in any of our gating files.

These are most likely natively boss-drop or recipe-from-T3-reagents (mod's own gating), but **action:** verify each in JEI. If any has a craftable recipe with low-tier inputs, it's a leak.

### CONCERN — ungated EPIC curios

`clock_of_time`, `artifact_of_after_life`. Curio slot accessories. Same verification as above.

### Items not currently touched by gates

5 EPIC materials (icora_stone, knight_ingot, incorythe_gem, phantom_ingot, unorithe_ingot) are intentionally untouched — they feed the Tetra material datapack as T3 metals/gems. Confirmed `incorythe`, `phantom`, `garnite` armor sets get set-bonus effects. Materials themselves should remain craftable (smelting from ore) since the ore-spawning is dimension-gated through the T3 Abyss dimension lock.

### Standouts

- **`apple_of_immortality`** (RARE) — implies permanent buff or revival. Needs JEI verification — if craftable from base apples + low-tier reagents, balance impact is significant.
- **`roka_horn`** (RARE) — likely summons a Roka boss/mob. If usable as a callable raid trigger, need to verify it can't be spammed.
- **`apocalypse_ingot`** (in Tetra materials? not in dump) — placeholder; investigate if missing from materials datapack.
- **`bottle_of_somnium`** (RARE) vs **`enchanted_bottle_of_somnium`** (EPIC) — upgrade chain. Verify the enchanting step requires T3 reagents.
- **The Abyss has the highest unique-armor count** (5 boss sets + 7 elemental sets = 12 sets). This is a flexibility/build-diversity win for our Abyss-focused players.

### RARE highlights (62)

The 62 RARE items are dominated by:
- **8 elemental crystal shards** (`abyss_`, `ender_`, `crimson_`, `frost_`, `warped_`, `caverna_`, `aurel_`, `hollow_`) — drops from corresponding mobs, used for elemental armor crafting. Mod-internal balance.
- **10+ elemental powders** (matching the shards) — crafting intermediates.
- Material nuggets (anima, icora), shards (knight_shard, phantom_essence, bricked_knight_ingot)
- Mob-drop curios: elder_eye, lurker_sobber, soul_heart, apple_of_immortality, roka_horn, jungle_melon_item, infected_slime, loran_energy
- `bottle_of_somnium`, `unactive_fusion_ingot` (upgrade chain entries)

Most are mod-internal balance (crafting intermediates). The standouts above flag the few that warrant JEI checks.

## Recommended actions (priority order)

1. **(rename fix)** In `recipe_audit.js` Section K.3, rename `'theabyss:ring_of_ghost'` → `'theabyss:ring_of_ghosts'` (plural). The regex catches it but the individual list should be accurate as a safety net + documentation.
2. **(JEI spot-checks, ~15 min)** Verify recipes for: `totem_of_thunder/abyss/time`, `crown_of_nosaj`, `amuled_of_nosaj`, `eye_of_abyss`, `dream_shifter`, `node_shard`, `enchanted_bottle_of_somnium`, `immortal_substance`, `clock_of_time`, `artifact_of_after_life`, `apple_of_immortality`. ~12 items total.
3. **(if any totems craftable)** Add T3 stage gate via `astages_restrictions.js` or remove recipes via Section K. Totems are highest priority because of revive/immortality semantics.
4. **(future)** When the next abyss mob (Roka? Loran?) gets explicit boss treatment, allocate the unallocated EPIC trophy/reagent items to those bosses similar to the Knight/Unorithe pattern in `abyss_boss_loot.js`.

## Existing coverage map

| File | What it does | Abyss hits |
|------|--------------|-----------:|
| `recipes/recipe_audit.js` Section K | Ring + Workbench + Armor recipe removal | 30 rings + 1 workbench + 20 armor pieces |
| `loot/abyss_boss_loot.js` | Custom rings + boss-drop armor allocation | 7 rings + 5 armor sets |
| `abyss/abyss_armor_effects.js` | Set-bonus mechanics | 7 elemental sets |
| `gates/astages_restrictions.js` | Dimension T3 gate | 1 dimension |
| `scaling/boss_hp.js` + `boss_progressive.js` | Boss HP + progressive scaling | multiple bosses |
| `scaling/dimension_mechanics.js` | Abyss-specific dimension effects | 1 dimension |
| `endgame/ascension.js` | Reagent pool | type prefix |
| `loot/lootjs_overhaul.js` | Various tweaks | multiple refs |
| `scaling/mob_scaling_unified.js`, `mob_equipment.js` | Mob scaling | multiple |
| `origins/origin_effects.js`, `witch_of_ink_progression.js` | Witch of Ink integration | multiple refs |
| `tatos_dimension_lock.js` | Dimension lock helper | 1 dimension |
| `death_penalty.js`, `codex_delivery.js` | Death penalty + codex | misc |

Total: 118 theabyss references across 16 files. **The most-wired mod in the pack** — coverage is dense and well-organized.
