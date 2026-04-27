# Ars Nouveau + Iron's Spellbooks Audit

**Mods:** Ars Nouveau, Iron's Spellbooks (audited together — they form the magic progression pair)
**Items in JEI:** 626 combined (Ars Nouveau 402, Iron's Spellbooks 224)
**Audit date:** 2026-04-27
**Verdict:** LIGHT POLISH — ISS is the most-wired mod in the pack at **244 references** (more than theabyss's 118), serving as the connective tissue between every T2-T4 boss and our magic progression. Ars is lighter but properly tier-staged (apprentice T2, archmage T3) with Imbuement shortcuts blocked. Few small concerns: 10 ISS Cinderous-tier items + ~5 endgame ISS structure loot items have no allocation in our drop tables.

## Why these mods are in scope

Ars Nouveau and Iron's Spellbooks are the pack's magic-progression pillars (alongside Forbidden Arcanus, audited separately). They form a **deep cross-mod integration** with our Modular Spell Books mod (Phase 6 Tetra-integrated):

- **Ars books → modular Ars books** via Tetra `data/tetra/replacements/` files (auto-convert on inventory tick)
- **ISS books → modular ISS books** via the same mechanism
- **Inks/runes/upgrade orbs** drop from every boss tier as cross-dimensional reagent loops
- **Mana/spell_power attributes** are wired into our cover/spine/pages module bonus pipeline

These are also the only mods where our Phase 6 Java-side IModularItem implementations live. The audit covers gating; the *Tetra integration health* was covered separately during the lang-key fix.

Already wired:
- **78 Ars Nouveau references** across the codebase
- **244 ISS references** — the most of any mod
- ISS items distributed across **8 boss-drop loot files** (alexsmobs, blue_skies, cataclysm, twilight, mahou_synergy, stalwart_dungeons, iss_boss_drops, iss_boss_first_kill)
- Plus dedicated integration scripts: `magic_crit_hook.js`, `mana_pool_bonuses.js`, `attribute_sync.js`

## Custom rarity finding (cross-cutting C continued)

**ISS introduces a fourth non-vanilla rarity:** `IRONS_SPELLBOOKS_CINDEROUS` — a custom Rarity enum value used by 10 items themed around the Cinderous mob/boss line:

`pyrium_staff`, `legionnaire_flamberge`, `hellrazor`, `unchained_book`, `pyrium_ingot`, `cinderous_soulcaller`, `cinderous_soul_rune`, `betrayer_signet`, `music_disc_flame_still_burns`, `disc_fragment_flame_still_burns`.

**Cumulative count:** 4 mods now use non-vanilla rarity (forbidden_arcanus, celestial_artifacts, occultism, irons_spellbooks). This is a **stable cross-cutting pattern** — magic mods especially seem to ship custom rarity. Reinforces the "rarity column can't be trusted as a balance signal" finding.

## Iron's Spellbooks — items by category

### Boss-drop loot (5 ISS bosses + ISS mob types)
- `dead_king` (T4 boss): blood_staff 50% + necronomicon first-kill
- `archevoker`: evoker_spell_book first-kill
- `fire_boss`: blaze_spell_book first-kill
- `citadel_keeper`: keeper_flamberge 40%
- `cryomancer` (mob): ice_staff 15%, ice_rune 25%
- `pyromancer` (mob): 4-piece armor at 8-12% per piece + fire_rune 20%
- `magehunter`: lightning_rod, also a first-kill drop

### Cross-dimensional ink/rune economy (8 boss-drop files)
ISS items distributed across nearly every boss-drop loot file in the pack — **8 distinct files** include ISS items:
- `loot/iss_boss_drops.js` + `loot/iss_boss_first_kill.js` — direct ISS bosses
- `loot/cataclysm_boss_drops.js` — 12 ISS items across 8 cataclysm bosses
- `loot/twilight_boss_drops.js` — 9 ISS items across 8 Twilight bosses
- `loot/blue_skies_drops.js` — 9 ISS items across Blue Skies bosses
- `loot/alexsmobs_drops.js` — 11 ISS items across Alex's Mobs
- `loot/stalwart_dungeons_drops.js` — 8 ISS items across Stalwart bosses
- `loot/mahou_synergy_drops.js` — dead_king synergy
- `loot/lootjs_overhaul.js` — base ink/spell_book chest drops + sentry pool

Every dimension's bosses contribute ISS reagents (inks, runes, upgrade orbs) in a tier-appropriate distribution. **This is the most carefully-distributed cross-mod loot economy in the pack.**

### Ink hierarchy (5 tiers)
`common_ink` → `uncommon_ink` → `rare_ink` → `epic_ink` → `legendary_ink`. Each tier appears at appropriate boss tier (uncommon at T1-T2, rare at T2-T3, epic at T3-T4, legendary at T4 only).

### Runes (~10 elemental types)
`fire_rune`, `ice_rune`, `lightning_rune`, `ender_rune`, `blood_rune`, `nature_rune`, `evocation_rune`, `protection_rune`, `cooldown_rune`. Themed to boss elements (fire bosses drop fire_rune, etc.).

### Upgrade orbs
`fire_upgrade_orb`, `ender_upgrade_orb`, `lightning_upgrade_orb`. T3-T4 boss drops.

### Spell books (vanilla ISS, recipe-removed)
`copper`, `iron`, `gold`, `diamond`, `netherite`, `blaze`, `evoker`, `necronomicon` spell books. **Tetra replacement files auto-convert these to our modular variants on next inventory tick** — the player drops or picks up the vanilla item, but the inventory shows the modular book. This means we can leave ISS's vanilla loot tables alone and still get our modular variants for free.

### Pyromancer armor (boss-drop set)
4-piece set from Pyromancer mobs at 8-12% per piece. Tier-appropriate.

### Cinderous items (10 — custom rarity)
Listed above in rarity finding. Theme suggests they come from a specific ISS structure or boss (Cinderous Citadel?). **Concern:** none of these appear in our drop tables. Verify they have native ISS sourcing.

### EPIC ISS items (13 total)
`spellbreaker`, `amethyst_rapier`, `hither_thither_wand`, `staff_of_the_nines`, `ruined_book`, `eldritch_manuscript`, `divine_soulshard`, `chronicle`, `arcane_anvil`, `paladin_chestplate`, `speed_boots`, `infernal_sorcerer_chestplate`, `gold_crown`. Most of these are ISS structure loot (Citadel of the Lord of Light, Cinder Citadel, Hovels). **Verify** they native-spawn in those structures and don't leak via other paths.

## Ars Nouveau — items by category

### EPIC (2)
- `wilden_tribute` — boss drop from Wilden Defender (Ars's own T3 boss). Native loot table; transitively gated through dimensional access.
- `starby_gift` — random gift from Starbuncles (the Ars luck-based pet mechanic). Lottery-style item; mod-internal balance.

### RARE (3)
3 music discs (`music_disc_aria_biblio`, `music_disc_thistle_the_sound_of_glass`, `music_disc_firel_the_wild_hunt`). Cosmetic.

### Tier-staged in `astages_restrictions.js`
- T2: `apprentice_spell_book`, `enchanting_apparatus`, `arcane_core` (lines 132-133)
- T3: `archmage_spell_book`, `imbuement_chamber` (lines 219-220)
- Plus `iridescent_modular_spells:modular_apprentice_spell_book` (T2) and `modular_archmage_spell_book` (T3)

### Recipe-removed cross-mod shortcuts
- `recipe_audit.js` Section E.1 (lines 121-122): `ars_nouveau:imbuement` removed for `minecraft:diamond` and `minecraft:netherite_ingot`. **Prevents the Imbuement Chamber from being a cheap diamond/netherite shortcut.**

### COMMON (397)
Mostly Ars's own progression items: spell glyphs (the bulk of them), spell focuses, spell parchments, spell scrolls, decorative blocks, source jars, sourcestone, archwood logs/planks (4 wood types: blue/green/purple/red), light effects, magebloom, rituals.

### Ars-Nouveau-bytecode-patched
Per CLAUDE.md: `ars_nouveau-1.20.1-4.12.7-all.jar` is bytecode-patched to disable the `DungeonLootEnhancerModifier` chest loot injection. This is a **separate** balance protection that prevents Ars items from auto-injecting into all chest loot tables. Without this patch, every chest in the pack would have a chance to drop Ars items, which would massively over-saturate the loot economy.

## Findings

### Properly gated (no action)

- **Ars apprentice/archmage T2/T3 staging** — both base spell books + their workstations (enchanting_apparatus, arcane_core, imbuement_chamber) staged appropriately.
- **Modular spell book tier matching** — our `iridescent_modular_spells:modular_apprentice_spell_book` (T2) and `modular_archmage_spell_book` (T3) follow the same staging as their vanilla Ars counterparts.
- **Imbuement Chamber tier-skip blocked** — diamond + netherite recipes removed.
- **Ars chest loot injection disabled** — bytecode patch on ars_nouveau jar prevents the mod's `DungeonLootEnhancerModifier` from auto-injecting items everywhere.
- **ISS Tetra replacement system** — `data/tetra/replacements/*` files auto-convert all 8 vanilla ISS spell books → our modular variants on inventory tick. This means we don't need to recipe-remove vanilla books or override their loot tables; the conversion is transparent.
- **ISS boss drops fully wired** — 5+ ISS bosses have themed drops via `iss_boss_drops.js` and `iss_boss_first_kill.js`.
- **ISS cross-dimensional ink/rune economy** — 8 boss-drop files distribute ISS reagents tier-appropriately. Most carefully-distributed cross-mod loot in the pack.
- **ISS boss HP scaling** — `dead_king` (800), `fire_boss` (700), `citadel_keeper` (600).

### Verified clean

- **Wilden Tribute** — Wilden Defender boss native drop. Dimensional access (apprentice tier T2 → defender summon at T3 reagents) provides transitive gating.
- **Starby Gift** — Starbuncle pet luck-based drops; mod-internal balance, no exploit.
- **Pyromancer armor 4-piece** — boss-drop only via `iss_boss_drops.js`.
- **Tetra replacement of vanilla ISS books** — automatic, so the recipe-state of the vanilla items doesn't matter.

### CONCERN — Cinderous-tier items (10) ungated

The 10 IRONS_SPELLBOOKS_CINDEROUS items have NO references in any of our drop tables. Theme suggests they come from a "Cinderous Citadel" or similar ISS structure. **Two scenarios:**

1. **Native ISS loot table** — items drop from a specific ISS structure that we haven't audited. Greenlit if so.
2. **No native loot path** — items are creative-only or unobtainable. Concerning if we've left them in JEI but unobtainable.

**Action:** spawn a `cinderous_soulcaller` or related Cinderous mob (if any exists) and check if it drops on death. Alternatively: search for `cinderous` structure in ISS's `data/irons_spellbooks/structures/` to identify the source.

### CONCERN — EPIC ISS structure-loot items (5+ items)

`spellbreaker`, `amethyst_rapier`, `hither_thither_wand`, `staff_of_the_nines`, `ruined_book`, `eldritch_manuscript`, `paladin_chestplate`, `speed_boots`, `infernal_sorcerer_chestplate`, `gold_crown`, `arcane_anvil`, `chronicle`, `divine_soulshard` — none of these have entries in our drop tables.

These are likely structure loot from ISS's native dungeons (Citadel of the Lord of Light, Cinder Citadel, Hovels) — see `data/irons_spellbooks/loot_tables/chests/`. **Action:** confirm they're acquired from those structures only and not from generic chest loot pools. If they leak elsewhere, add stripping logic.

### CONCERN — `eldritch_manuscript` (EPIC ungated)

The eldritch_manuscript is a quest/lore item but also unlocks the Eldritch Spellbook tier. **Highest priority** of the 5 structure-loot concerns because of its progression role. Verify acquisition path.

### Items not currently touched by gates

The 397 Ars COMMON items (glyphs, focuses, sourcestone, etc.) are flavor — players craft them through the apprentice→archmage progression. T2/T3 staging on the spell books themselves provides the gate.

The 147 ISS COMMON items (mostly armor flavor variants + crafting intermediates) are similarly transitively gated.

### Standouts

- **The ISS cross-dimensional loot economy is the cleanest design pattern in the pack.** Every dimension's bosses contribute reagents to the magic progression, themed to the dimension's element (Fire dimension → fire_rune, Ice → ice_rune, Ender → ender_rune). Other mods could learn from this.
- **Tetra replacement files are a *transparent* gating mechanism** — we don't need to remove vanilla item recipes if we can replace the vanilla item with our gated variant on pickup. This is the *fourth efficient gating pattern* discovered (after recipe-remove, drops-only, chokepoint, three-layer).
- **Bytecode-patched Ars jar** is a security mechanism that should never be lost. CLAUDE.md documents it but the audit pass should ensure the patch survives mod updates.
- **244 ISS references** is the most of any mod. ISS is genuinely *integral* to the pack's design — almost every system touches it (combat scaling, boss drops, attributes, codex, ascension, mythic forge, Tetra integration).

## Recommended actions (priority order)

1. **(spot-check, ~10 min)** Identify the source of the 10 Cinderous-tier items (native ISS structure? mob? boss?). If unobtainable, file a follow-up.
2. **(spot-check, ~15 min)** Verify the 5 EPIC ISS structure-loot items (paladin/infernal armor, gold_crown, eldritch_manuscript, etc.) come from their intended structures only and don't leak to generic chest loot. If they leak, add LootJS strips.
3. **(verify on next mod update)** When updating the bytecode-patched ars_nouveau jar, re-apply the `DungeonLootEnhancerModifier` athrow→pop patch. This is documented in CLAUDE.md.
4. **(future polish)** When new dimensions are added (e.g., the Aether expansion mods, Dimensional Doors), allocate ISS reagents to those bosses to maintain the "every dimension contributes magic progression" pattern.

## Existing coverage map

| File | What it does | Hits |
|------|--------------|-----:|
| `gates/astages_restrictions.js` (T2 + T3 lists) | Ars apprentice/archmage + workstations | 5 |
| `recipes/recipe_audit.js` Section E.1 | Imbuement diamond/netherite shortcut blocked | 2 |
| `loot/iss_boss_drops.js` | 5+ ISS boss themed drops | ~15 |
| `loot/iss_boss_first_kill.js` | Guaranteed first-kill drops | ~6 |
| `loot/cataclysm_boss_drops.js` | ISS reagents on Cataclysm bosses | 12 |
| `loot/twilight_boss_drops.js` | ISS reagents on Twilight bosses | 9 |
| `loot/blue_skies_drops.js` | ISS reagents on Blue Skies bosses | 9 |
| `loot/alexsmobs_drops.js` | ISS reagents on Alex's Mobs | 11 |
| `loot/stalwart_dungeons_drops.js` | ISS reagents on Stalwart bosses | 8 |
| `loot/mahou_synergy_drops.js` | Dead King synergy | 1 |
| `loot/lootjs_overhaul.js` | Chest loot tier pools, sentry pool | ~30 |
| `magic_crit_hook.js` | ISS attribute crit-trigger mechanic | full file |
| `attributes/mana_pool_bonuses.js` | ISS mana_pool integration | full file |
| `attributes/attribute_sync.js` | ISS attribute pipeline | full file |
| `endgame/ascension.js` | ISS items in ascension reagents | misc |
| `enchantments/enchant_effects.js` | Magic enchantment effects | misc |
| `skills/justleveling_skills.js` | Magic skill tree | misc |
| `origins/class_passives.js` | Mage class hooks | misc |
| `scaling/boss_hp.js` | 3 ISS bosses HP-scaled | 3 |
| `data/tetra/replacements/*` | Vanilla ISS book → modular conversion | 8 books |
| `iridescent-modular-spells-mod/` (Phase 6 jar) | Tetra IModularItem impl | full mod |
| `ars_nouveau-1.20.1-4.12.7-all.jar` (patched) | DungeonLootEnhancerModifier disabled | bytecode patch |
| `Patchouli-1.20.1-85-FORGE.jar` (patched) | Book.use_resource_pack disabled | bytecode patch |

Total: 78 Ars + 244 ISS = **322 references** across ~25 files. **Most-integrated mod pair in the pack.**

This is the **deepest coverage tier** in the audit. Ars + ISS aren't just gated — they're *woven into* every system. The gating is solid; the only question is whether the structure loot stays in its lane.
