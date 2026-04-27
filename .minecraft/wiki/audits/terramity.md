# Terramity Audit

**Mod:** Terramity
**Items in JEI:** 754 (29 EPIC, 48 RARE, 12 UNCOMMON, 665 COMMON)
**Audit date:** 2026-04-27
**Verdict:** HEAVY POLISH — gun/ammo/gun-armor strip is best-in-pack (3-layer defense: recipe removal + loot strip + Apotheosis enchant disable). But the strip's complement — non-gun melee weapons, curios/charms, music sheets — has zero gating. Roughly 15-20 EPIC curios/weapons currently bypass progression entirely.

## Why this mod is in scope

Terramity is the largest content mod by item count (754) — 60% of our overall RARE+ surface. Two design tensions:

1. **Guns and gun-armor sets break our RPG progression** (modern firearms, hellspec/conductite/cosmilite/dimlite armor with chrome/scouter aesthetic). Already comprehensively stripped.
2. **Bosses, structures, accessories, music sheets, melee weapons** are *meant to stay* — they fit the RPG/cosmic-magic theme. But staying ≠ properly gated; many EPIC items in this category have no tier wiring.

Already wired:
- `kubejs/server_scripts/recipes/recipe_audit.js` Section I — gun + armor recipe removal (~22 guns, ~60 armor pieces, ammo, gunsmith station). Comment reads "Bosses, structures, mobs, and accessories stay."
- `kubejs/server_scripts/loot/lootjs_overhaul.js` lines 163-199 — chest+entity loot strip for the same gun list.
- `kubejs/server_scripts/tetra_terramity_perks.js` — server-tick perk hook for `tetra_terramity_perks` (40 ticks every 30s).
- `kubejs/server_scripts/codex_delivery.js` — `terramity:terramity_guidebook` is a starter codex item.
- Apotheosis config disables Discoverable+Lootable on the 12 Terramity gun-related enchants.

## EPIC items (29) by category

### Material ingots (boss/dimension-tied)
`nyxium`, `exodium_superalloy`, `reverium` — all three feed armor sets whose recipes are removed (Nyxium Knight, Exodium Warlock, Reverium Paladin). Ingots themselves remain craftable for non-armor uses.

### Stripped (already gated)
`antimatter_rifle` (gun — recipe removed + loot stripped) -
`asphodel` (gun — same).

### Non-gun weapons (BOSS-THEMED, no current gating)
`blasphemic_rapture`, `unholy_lance`, `davy_jones`, `olympus`, `divine_intervention`, `planet_buster`, `kamehameha`. These are melee/projectile weapons that are NOT in the gun strip list. Likely intended as boss drops, but no allocation in our loot scripts.

### Curios / accessories (no gating)
`antimatter_pacemaker`, `nyxs_necklace`, `antiprism`, `null_scarf`, `dragon_band`, `sacred_speed_bracelets`, `angel_feather`, `fortunes_favor`. EPIC curios with no recipe removal, no loot allocation, no tier check.

### Materials / reagents
`opaline_moonstone`, `cracked_microcosm`. Likely upgrade reagents — sourcing unverified.

### Sniffer set (probably boss-drop natively)
`ultra_sniffer_fur`, `ultra_sniffers_pelt`, plus the Omnipotent Ultra Sniffer music sheet. Drops from the Omnipotent Ultra Sniffer boss in the mod's natural loot table. No action needed if mod's drops are accurate.

### Music sheets (5 EPIC)
`music_sheet_of_the_gnome_king`, `music_sheet_of_the_legendary_super_sniffer`, `music_sheet_of_the_trial_guardian`, `music_sheet_of_the_shadow_wizards`, `music_sheet_of_the_omnipotent_ultra_sniffer`. Cosmetic ocarina sheets. Drop from named bosses natively. No balance impact.

## RARE highlights (48)

48 RARE items skim across:
- Magic tomes: `tome_of_commotion`, `tome_of_ascension`, `galebounce_tome`, `dimensional_poof`, `velocity_flip`, `guardian_grimoire`, `gaias_tempest` — likely scroll/grimoire utility items, ungated
- Bracelets: `electron_bracelets`, `malediction_bracelets` — accessories, ungated
- Materials: `iridium`, `iridium_chunk`, `prismatic_jewel`, `warden_soul`, `pink_fairy_bottle`, `occult_fabric` — reagents
- 14 ocarina music sheets (cosmetic — `of_power`, `of_tempo`, `of_perception`, etc.)
- `empty_spell_tome` — Iron's Spellbooks compatibility?

These 48 RARE items have no gating in our scripts either. Most are likely fine (mod's natural balance), but the magic tomes and bracelets warrant a spot check for over-power against ISS/Ars equivalents.

## Findings

### Properly gated (no action)

- **All firearms + ammo + gunsmith station** — triple-locked: recipe removed (Section I.1), chest+entity loot stripped (lootjs_overhaul lines 196-199), enchants disabled (Apotheosis config). This is the gold-standard pattern; replicate it for any future "doesn't-fit-RPG" mod.
- **15 armor sets** (Conductite/Conjuror/Cosmilite/Dimlite/Evil King/Exodium Warlock/Hellspec/Iridium/Nyxium Knight/Onyx/Reverium Paladin/Ruby/Sapphire/Topaz/Virentium/Void Mage) — recipes removed, ~60 armor pieces. Comment notes Gundalf's hat keeps boss-drop only, recipe stripped.
- **Music sheets (cosmetic)** — drop from their named bosses natively. No action.

### CONCERN — ungated EPIC curios

8 EPIC curios with no recipe-removal, no loot allocation, no tier check: `antimatter_pacemaker`, `nyxs_necklace`, `antiprism`, `null_scarf`, `dragon_band`, `sacred_speed_bracelets`, `angel_feather`, `fortunes_favor`.

Each is a +stat or proc-effect curio. If acquired before T3-T4 (the EPIC-rarity tier), they could trivialize tier transitions. **Action:** JEI uses-lookup on each. For each that has a recipe, add to `recipe_audit.js` Section I as a third sub-block (I.3: curios/accessories). For each that's drop-only, verify what drops it — if from a low-tier boss, consider remapping.

### CONCERN — ungated EPIC non-gun weapons

7 EPIC non-gun weapons with no gating: `blasphemic_rapture`, `unholy_lance`, `davy_jones`, `olympus`, `divine_intervention`, `planet_buster`, `kamehameha`.

These are clearly endgame-themed (cosmic/holy/lance), but unlike Simply Swords, no boss allocation map exists. **Action:** allocate each to a specific T3 or T4 boss in `loot_overhaul.js` (similar pattern to Section 8 for simplyswords) AND add to a new Section I.3 in `recipe_audit.js` if they have crafting recipes. Loose proposed mapping (refine in design pass):
- `unholy_lance` → Maledictus or Ancient Remnant (undead theme)
- `blasphemic_rapture` → Ignis or Forgotten Guardian (fire/destruction)
- `davy_jones` → Leviathan (ocean theme)
- `olympus` → Slider or Valkyrie Queen (storm/divine)
- `divine_intervention` → Sun Spirit or Valkyrie Queen (holy)
- `planet_buster` → Ender Dragon or void boss (cosmic)
- `kamehameha` → reserve as quest/Mythic Forge unlock (anime/charge theme is unique enough to be a "you earned this")

### CONCERN — material ingots without explicit gating

`nyxium`, `exodium_superalloy`, `reverium` ingots have armor-set recipes removed but the ingots themselves can still be crafted into other terramity items (decorative blocks, tools, etc.). For mods that gate by ingot, this is fine. For our pack, low risk because the EPIC rarity is mostly cosmetic on the ingot — but **verify** they aren't accessible from low-tier ores.

### CONCERN — RARE bracelets and tomes

`electron_bracelets`, `malediction_bracelets` (curios), `tome_of_commotion`, `tome_of_ascension`, `galebounce_tome`, `dimensional_poof`, `velocity_flip`, `guardian_grimoire`, `gaias_tempest` (utility tomes/scrolls). RARE tier so lower priority than EPICs, but each is an action-modifying item. **Action:** ~10-minute JEI sweep. For any with non-trivial procs, add to gated list.

### Items mostly fine (no action)

- 5 EPIC music sheets + 14 RARE music sheets + ocarina_of_power = cosmetic
- `ultra_sniffer_fur`, `ultra_sniffers_pelt` — boss-drop materials, mod's own balance
- 60 COMMON building blocks, plants, decorative items — out of audit scope

## Recommended actions (priority order)

1. **(rewrite recipe_audit.js Section I)** Add I.3 sub-block for non-gun EPIC content: 8 curios + 7 non-gun weapons + sniffer items if needed. Mirror the I.1 pattern (forEach + event.remove({output: id})).
2. **(extend lootjs_overhaul.js)** Add a `terramityCurioStrip` array similar to `terramityGunStrip` for chest-loot stripping of items we want boss-drop-only.
3. **(create new file)** `kubejs/server_scripts/loot/terramity_boss_drops.js` — allocate the 7 non-gun EPIC weapons + 8 curios to specific bosses per the Section 8 simplyswords pattern. This is the missing piece.
4. **(verify in JEI)** Ingot sourcing for nyxium/exodium/reverium. RARE tomes (~10 items) for proc abuse.

## Existing coverage map

| File | What it does | Terramity hits |
|------|--------------|---------------:|
| `recipes/recipe_audit.js` Section I.1 | Gun + ammo recipe removal | 22 guns, 13 ammo |
| `recipes/recipe_audit.js` Section I.2 | Armor set recipe removal | ~60 pieces, 15 sets |
| `loot/lootjs_overhaul.js` | Chest+entity loot strip | 35 ids stripped |
| `tetra_terramity_perks.js` | Server-tick perk hook | global tick handler |
| `codex_delivery.js` | Codex starter | 3 entries (guidebook variants) |
| Apotheosis config | Disable 12 gun enchants | 12 enchants |

Total: ~86 terramity references. Gun coverage is exhaustive; non-gun coverage is empty.
