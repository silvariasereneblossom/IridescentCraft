# Design Changelog

All changes to the master design document are logged here with date, description, and reason.

---

## 2026-04-28 (cont. 21) — Phase 6J: lang audit pass on iridescent-origins-mod (300 entries added)

The `iridescent-origins-mod` had **zero lang entries** before this — every Origins power and origin definition used literal strings in the JSON `name` and `description` fields. This means non-English clients see English literals (which Origins displays as-is when no translation is available), and any string-edit cycle goes through the JSONs rather than a lang file.

Refactored 150 of 192 JSON files (the 42 skipped are `origins:action_on_callback` and a few power types with no `name` field) to use lang keys, and generated `assets/icraft/lang/en_us.json` with **300 entries** (origin names + origin descriptions + per-power names + per-power descriptions). Naming convention:

- `icraft.origin.<name>.name` / `.description` — top-level origin definitions (Berserker, Archmage, Witch of Ink, etc.)
- `icraft.power.class.<class>.<power>.name` / `.description` — class powers (e.g. `icraft.power.class.archmage.arcane_power.name`)
- `icraft.power.race.<race>.<power>.name` / `.description` — race powers
- `icraft.power.origin.<origin>.<power>.name` / `.description` — origin powers (with `-` → `_` so `witch-of-ink` becomes `witch_of_ink`)

Origins resolves the `name`/`description` field via `Component.translatable(value)`, so the existing JSON values that started looking like keys (`icraft.origin.berserker.name`) get translated against the lang file, falling back to the literal string if the key doesn't resolve. Tested by inspecting the built jar: lang file at `assets/icraft/lang/en_us.json`, 32KB.

Other lang state across the codebase, post-audit:
- `iridescent-modular-spells-mod`: 277+ entries (cont. 8 / 11 / 18 / 20 work) — comprehensive coverage of items, slots, modules, schematics, materials, improvements, stat bars + tooltips.
- `iridescent-biomes-mod`: 2 entries for the 2 custom biomes (`cherry_river_valley`, `cherry_mountains`) — both covered.
- `iridescent_codex_data` jar: no user-visible strings (Patchouli book content is in `data/icraft/patchouli_books/`, which uses its own .lang infrastructure).
- KubeJS scripts: literal strings in chat messages and tooltips (server-admin-side mostly). Could be lang-keyed for full coverage but lower priority than the mods above.

`iridescent_origins-1.0.0.jar` rebuilt and deployed to all 3 mod folders.

---

## 2026-04-28 (cont. 20) — Workbench: Core slot offset clear of Status panel + stat-bar tooltips

Two iterations on the Phase 6I workbench polish.

**Core slot offset bumped** — `(0, -18) → (0, -32)` in both `ModularSpellBookItem.getMajorGuiOffsets` and `ModularArsSpellBookItem.getMajorGuiOffsets`. The label was overlapping with the second row of the magic-stats panel; 14px additional clearance puts it above the panel's top row. If we ever stack more than ~6 stat bars vertically, the Core may need to move further still.

**Stat-bar tooltips wired** — `MagicStatsBars.ITooltipGetter.getTooltipBase` now returns `<labelKey>.tooltip` rather than the same label string, matching base Tetra's convention (`tetra.stats.armor.tooltip`, `tetra.stats.speed.tooltip`, etc.). Added 18 new lang entries (`iridescent_modular_spells.stats.<key>.tooltip`) — each a one-line description with `§e%s§r` for the actual value, color-coded per spell school where applicable (Fire orange, Ice cyan, Holy white, Eldritch purple, etc.). Hovering a bar in the Status panel now shows a meaningful explanation rather than the same label twice.

The broader principle ("if there's no translation key for a feature, it needs to be added") is logged as a Phase 6J task — a full lang audit across origin powers, schematics, materials, improvements, and any kubejs-registered display strings, with a checklist tool to catch future regressions.

---

## 2026-04-28 (cont. 19) — Phase 6I: spell-list transfer + workbench Status panel for magic stats

Two polish/transparency wins on modular spell books.

**Spell list preserved through Tetra replacement** — `kubejs/server_scripts/origins/spell_book_transfer.js`. When Tetra's `tetra:replacements` swaps a vanilla ISS spell book for our modular item, the input book's `ISB_Spells` NBT (player's inscribed spell list) used to be lost — the input is consumed as material and the new modular item has no spells. Closed via a per-tick inventory snapshot: `ServerEvents.tick` (every 2 ticks) captures slot→{id, ISB_Spells} for any vanilla ISS book a player carries; `PlayerEvents.inventoryChanged` detects when a modular spell book appears in a slot whose previous-tick snapshot held a vanilla book with spells, and copies those spells to the modular item's NBT (marked `icraft_spells_transferred: true` to avoid re-copying). Mirrored to all 3 distros. Ars-side spell preservation isn't done yet — Ars books store inscribed spells under different NBT keys; that's a follow-up.

**Workbench Status panel now shows magic attributes** — `iridescent-modular-spells-mod/src/main/java/com/iridescentcraft/modspells/client/MagicStatsBars.java`. Tetra's `WorkbenchStatsGui` was hardcoded to a weapon-oriented stat list (damage / sweeping / speed / durability / armor / etc.) which is why our spell books showed an empty Status tab. No Java mixin needed — Tetra exposes `WorkbenchStatsGui.addBar(GuiStatBase)` as a public static method specifically for extension. Registered 18 magic-attribute bars at `FMLClientSetupEvent`:

- ISS: max mana, mana regen, spell power, cooldown reduction, cast time reduction, fire / ice / lightning / holy / ender / nature / blood / eldritch / evocation spell power, summon damage
- Ars: max mana, mana regen, spell damage

Each bar reads from `IModularItem.getAttributeModifiersCached(stack)` (same path as the equipped tooltip from cont. 18), so the panel reflects the actually-assembled item's stats live as the player swaps materials. Bars only show when their value is non-zero (`shouldShow` in IStatGetter), so the panel doesn't get cluttered with zero-bonus entries. Class is `Dist.CLIENT`-only so it doesn't load on dedicated servers. 18 lang entries added under `iridescent_modular_spells.stats.<key>`.

`iridescent_modular_spells-0.2.0.jar` rebuilt and deployed.

---

## 2026-04-28 (cont. 18) — Tooltip stats now show real magic numbers

The equipped-tooltip on modular spell books was rendering dead-code legacy fields ("Modular Slots: Cover (empty), Pages (empty)" + an empty "Total Bonuses" block) — leftover from the pre-Phase-6G NBT-slot system that the workbench replacement no longer populates. Replaced both `ModularSpellBookItem.appendHoverText` and `ModularArsSpellBookItem.appendHoverText` with a real magic-stats computation that reads from `IModularItem.getAttributeModifiersCached(stack)` (Tetra's resolved attribute multimap for the assembled item) and renders only non-zero magic-relevant attributes.

**ISS-side tooltip** shows (in order): Max Mana, Mana Regen, Spell Power, Cooldown Reduction, Cast Time Reduction, then per-school spell power (Fire, Ice, Lightning, Holy, Ender, Nature, Blood, Eldritch, Evocation), then Summon Damage. Format: flat number for max_mana, percentage for the rest. Values come from the actual core material + per-cover material attributes installed in the workbench, so they update live as you swap modules.

**Ars-side tooltip** shows: Max Mana, Mana Regen, Spell Damage. Plus ISS Max Mana / ISS Mana Regen if the Ars book happens to inherit those (defensive — Ars cores currently don't add ISS attributes, but the path is there).

Built and deployed. Workbench Status panel still doesn't render magic attributes (Tetra core renders a fixed weapon-oriented stat list — damage / sweeping / speed / durability — and adding magic types to that panel needs a Java mixin into `se.mickelus.tetra.gui.stats.GuiStats`). That's a Phase 6I follow-up.

---

## 2026-04-28 (cont. 17) — Core slot renamed + Tetra schematic descriptions reworded

Tester noted the Tetra schematic UI was confusing on two fronts: "Cover" appeared three times (core slot + front cover + back cover), and the core slot's description still read "Forge the cover from a vanilla ISS spellbook material" — phrasing that pre-dated the Phase 6G architecture and reads as deprecated. Closed both:

**Renamed the core slot label**: `tetra.slot.<iss_book|ars_book>/core` from `"Cover"` → `"Core"`. Also updated the matching `tetra.module.<...>/core.name` and `tetra/schematic/<...>/core.name` entries. Front Cover and Back Cover keep their names — they're the cosmetic/structural slots, distinct from the identity-defining Core.

**Reworded core descriptions** to drop the "vanilla ISS spellbook material" phrasing. Now reads as a clean enumeration of accepted tiers (Iron, Gold, Diamond, ..., Archmage on the Ars side, etc.) without the legacy framing.

**Expanded front/back cover descriptions** to give concrete examples of materials in each of the 4 accepted categories (skin / metal / bone / gem) — iron, manasteel, terrasteel, ruby, sapphire, leather, rotten flesh, etc. Players opening the schematic now see what they can actually use without having to grep mod jars.

`iridescent_modular_spells-0.2.0.jar` rebuilt and deployed.

---

## 2026-04-28 (cont. 16) — Berserker Brutal Strikes maluses now real attribute powers

The bow + magic maluses on Berserker's Brutal Strikes (formerly description-only on `weapon_affinity.json`) are now enforced via two new `origins:conditioned_attribute` powers:

- **`brutal_strikes_bow.json`** — `-40% attack damage` when mainhand is `minecraft:bow` or `minecraft:crossbow`. Used vanilla item IDs directly because `forge:tools/ranged_weapon` only contains one ISS-specific entry in 1.20.1, not vanilla bow/crossbow.
- **`brutal_strikes_magic.json`** — `-30% attack damage` when mainhand is any item in `curios:spellbook` (covers all 16 ISS spell book variants), an Ars Nouveau spell book / caster tome, or one of our two modular spell book items. Covers the major caster mainhand cases; doesn't cover ISS staves or Mahou catalysts yet (open follow-up: expand the ingredient list as needed).

Both powers wired into `berserker.json`'s power list as `hidden: true` (they're tradeoff enforcement, not a tooltip line for the player to hunt for in the origin selection screen). The existing `weapon_affinity.json` (renamed Brutal Strikes, +15% with axes) keeps its description matching the now-actually-implemented full-picture.

`iridescent_origins-1.0.0.jar` rebuilt and deployed to all 3 mod folders.

---

## 2026-04-28 (cont. 15) — Phase 6H: implement description-only class passives

Tester noted several class powers were `origins:simple` (description-only tooltips with no actual gameplay enforcement). Closed the gap by either converting to real `origins:attribute` powers or wiring KubeJS handlers in a new `class_passives_phase6h.js`.

**New `origins:attribute` powers** (additive bonuses, applied immediately on character creation):
- `archmage/mana_pool.json` — **2.5× max mana** (multiply_base 1.5 on ISS `irons_spellbooks:max_mana` and Ars `ars_nouveau.perk.max_mana`). Wiki promised this; was never enforced.
- `battlemage/mana_pool.json` — 1.9× max mana (multiply_base 0.9). Same fix for Battlemage's wiki claim.
- `void_summoner/mana_pool.json` — 1.9× max mana. Same fix for Void Summoner.
- `berserker/blood_fury_critical.json` — `<20% HP +20%` melee (stacks atop the existing `<40%` +20% Blood Fury for `+40%` total at <20%, matching wiki).

All four wired into their respective origin files (`berserker.json`, `battlemage.json`, `void_summoner.json`, `archmage.json`).

**New KubeJS handlers** (`kubejs/server_scripts/origins/class_passives_phase6h.js` — mirrored to all 3 distros):
- **Berserker Battle Trance** — `EntityEvents.hurt` stamps `lastHitTick`. Per-second `ServerEvents.tick` checks for 10s sustained combat → applies `+5% damage / +1 armor` via /attribute commands. Lost 5s after combat ends. Modifier ID `icraft:berserker_trance`.
- **Samurai Bushido** — `EntityEvents.hurt` checks target HP at moment of hit; if full HP, multiplies `event.damage × 1.15` and stamps a 3s "first-strike window". `EntityEvents.death` within that window → grants Speed II for 3s.
- **Wanderer Adaptable** — `EntityEvents.hurt` infers weapon type from mainhand item ID (sword / axe / bow / crossbow / trident / hammer / mace / magic). 3+ distinct types stamped within 60s → grants `+10%` damage for 30s via /attribute (`icraft:wanderer_adapt`). Idle tick clears the modifier when expired.
- **Artificer Resourceful** — every 2s, scans an 8×4×8 cube around the player for `minecraft:crafting_table`. If found, refreshes Speed I for 4s (effectively continuous while near the table). Bonus ore drops are a separate LootJS responsibility (existing `lootjs_overhaul.js`).

**Built + deployed:** `iridescent_origins-1.0.0.jar` rebuilt and pushed to all 3 mod folders (manual cp because of the build-script path bug from cont. 14).

**Still simple-only** (low-impact / niche, deferred further):
- Berserker Brutal Strikes bow (-40%) + magic (-30%) maluses — would need conditioned_attribute files keyed to bow/magic-item tags
- Void Summoner Soul Tether's "+10% bonus XP from minion kills within 16b" partly handled by class_passives.js (lifesteal works, XP gain works)
- Battlemage Mana Shield's "15% chance to negate damage" — `battlemage_mana_shield.js` instead applies a continuous Resistance scaling, which is a deliberately different (non-RNG) implementation. Updating wiki/JSON description to match would be a doc cleanup.

---

## 2026-04-28 (cont. 14) — Class JSON powers reconciled toward wiki + maluses doubled

Brought the Origins power JSONs in line with the wiki overview's intended class numbers (which had drifted out of sync), and doubled the implemented magic/melee tradeoff maluses per tester directive.

**Buffs aligned to wiki:**
- `archmage/arcane_power.json` — Arcane Supremacy: `+25%` magic damage → **`+50%`** (matches wiki line 50)

**Maluses implemented + doubled:**
- `archmage/frail_melee.json` — **NEW power**, `-50%` melee attack damage (was wiki-described `-25%` but never actually implemented as an attribute modifier; doubled per directive). Added to `archmage.json` powers list so Origins loads it on character creation.
- `vanguard/damage_penalty.json` — Pacifist's Burden: `-15%` → **`-30%`** all damage dealt (was a real attribute, doubled directly).

**Renamed for wiki consistency:**
- `berserker/weapon_affinity.json` — "Axe Mastery" → **"Brutal Strikes"** to match wiki naming. Description updated to call out the doubled bow/magic maluses (`-40%` bow, `-30%` magic) — though these specific maluses remain description-only at the file level since adding real implementations would require new `origins:conditioned_attribute` files keyed to bow/magic-item tags. Open follow-up.

**Built + deployed:** `iridescent_origins-1.0.0.jar` rebuilt and copied to all three mods/ directories. Manual mods/ copy because the build script's deploy path target (`/root/IridescentCraft/minecraft/`) is missing — also worth fixing in a follow-up since the path is `.minecraft/` not `minecraft/`.

**Still-open implementation gaps** (description-only, no attribute modifier yet):
- Berserker bow/magic maluses (described, not enforced)
- Battle Trance (`origins:simple` — needs class_passives.js handler or attribute power)
- Bushido / Focus full effect implementations
- Other class tooltips that promise effects without enforcement

Tracked as a Phase 6H follow-up.

---

## 2026-04-28 (cont. 13) — Appendix K.2 rewritten to match canonical class data

Tester noted the appendix's class section was undercounting Archmage (showed "+25% spell damage" only, missing the Mana Attunement mana buffs entirely) and the "K.2 Class weapon affinities" framing was misleading — most classes are stat-defined, not weapon-type-defined.

Replaced the K.2 weapon-affinities table with a comprehensive **Class Passives Reference** mapping each of the 10 classes to their full passive set, with values matched to `wiki/classes/overview.md` lines 40-52. Archmage now correctly shows: **+50% magic damage** (Arcane Supremacy), **2.5× mana pool**, spell kills restore mana, +10% standing-still bonus, **tier-scaling magic amp T1:+0% → T4:+15%**, plus the Frail Frame and Glass Cannon HP penalties. Same depth-of-detail for all other classes including Battlemage's 1.9× mana pool, Void Summoner's lifesteal numbers, Vanguard's Pacifist's Burden, etc.

Added two new subsections under K.2:
- **Magic-damage attribute sync** — documents the `puffish_attributes:magic_damage` → `irons_spellbooks:spell_power` / `ars_nouveau:spell_damage` bridge in `kubejs/server_scripts/skill_effects.js` (was undocumented).
- **Mana Attunement tier table** — explicit T1-T4 bonus mapping with the dimension trigger for each tier.

**Wiki vs. JSON discrepancy noted.** The wiki overview has been the source for these numbers, but a few values diverge from the JSON in `iridescent-origins-mod/.../powers/class/`:
- Archmage Arcane Supremacy: wiki says +50%, JSON says +25% (multiply_base 0.25)
- Berserker has wiki-named "Brutal Strikes" (+15% melee) but the JSON file is `weapon_affinity: Axe Mastery` (+15% axes, −20% bow/crossbow, −15% magic)
- Berserker Battle Trance: wiki says "+5% ATK / +1 armor", JSON says "+5% damage / −5% incoming"

Appendix matched to wiki per tester directive. **Open follow-up**: reconcile the JSON powers to match the wiki (or update the wiki to reflect the JSON), then drop the wiki/JSON divergence note here.

---

## 2026-04-28 (cont. 12) — T2 flesh material: rotten_leather (Forbidden Arcanus)

Wired the second tier of the flesh-material progression. T2 is `forbidden_arcanus:rotten_leather` — crafted in vanilla 5× rotten_flesh (plus pattern). Stats roughly double the T1 bonuses to give a real progression payoff:

| | T1 rotten_flesh | T2 rotten_leather | T0 leather (vanilla) |
|---|---|---|---|
| primary | 3 | **5** | 5 |
| durability | 80 | **180** | 200 |
| integrityCost / Gain | 0 / 3 | **1 / 4** | 1 / 4 |
| magicCapacity | 70 | **110** | 90 |
| holy_spell_power | +5% | **+10%** | — |
| mana_regen | +2% | **+5%** | — |

Net effect: rotten_leather is competitive with vanilla leather on raw stats (slightly worse durability, slightly better magic capacity) but carries +10% anti-undead spell power and +5% mana regen as the unique trait. The progression rewards a player who chains 5× zombie drops + crafting bench → forbidden arcanus path → meaningfully better book for undead-heavy content.

Material is gated by a `forge:mod_loaded` condition on `forbidden_arcanus` so the material silently no-ops if the mod is absent.

---

## 2026-04-28 (cont. 11) — Phase 6G follow-up: rotten_flesh skin material + "X-lined" naming + modded-material lang

Three iterations on the Phase 6G architecture from tester feedback:

- **`skin/rotten_flesh` material** added to `icraft_tetra_materials` — `minecraft:rotten_flesh` now qualifies as a skin material on any Tetra slot accepting `tetra:skin/`. Stats are deliberately weaker than vanilla leather (primary 3 vs 5, durability 80 vs 200, integrityGain 3 vs 4) but carries a unique attribute payload: **+5% holy spell power** (anti-undead via ISS's holy damage type) and **+2% mana regen**. Flavor: a low-tier flesh path with thematic anti-undead synergy. T2 of the flesh progression is open — pending tester decision on which item should be the cured/cursed second-tier source.
- **"X-lined" naming convention** for front_cover materials. Updated `tetra.module.<iss_book|ars_book>/front_cover.material_name` from `"%s spell book cover"` → `"%s-lined spell book cover"`, and `.prefix` from `"%s"` → `"%s-lined"`. So a Terrasteel front cover now displays as **"Terrasteel-lined"** in the book's prefix and module label — same convention Tetra uses for vanilla material substitution (iron pick → diamond pick → "Diamond Pickaxe"), applied to the cover slot. Identical change on the ars_book/front_cover side for consistency.
- **Lang for 34 modded materials** (28 metals + 5 gems + rotten_flesh) added: `tetra.material.<key>` and `tetra.material.<key>.prefix`. These render the material's display name in tooltips, schematic UIs, and the new "X-lined" prefix. Without these, Tetra fell back to raw key strings (e.g. "manasteel-lined" instead of "Manasteel-lined"). 68 new entries.

Verified: all 28 modded metals and 5 gems already qualified as front_cover materials (front_cover.json accepts `tetra:metal/` and `tetra:gem/` category-wide; each material's JSON declares its category). The lang additions just make the display correct.

---

## 2026-04-28 (cont. 10) — Phase 6G: TSB-aligned single-item Tetra-pure spell book

Collapsed the 15 per-tier modular spell book registrations (12 ISS + 3 Ars) into 2 single Tetra-pure items: `iridescent_modular_spells:modular_spell_book` and `:modular_ars_spell_book`. Tier identity now lives entirely on the new `core` slot's material — vanilla ISS / Ars books, when placed on a Tetra workbench, are auto-replaced into the matching modular item with the appropriate core material pre-installed. Architecture mirrors `Inolia-Zaicek/TetraSpellBook`'s pattern (5 majors: core, front_cover, back_cover, spine, pages/dye).

**Java**: `ModularItemRegistry` cut from 18 registrations to 2. Both `ModularSpellBookItem` and `ModularArsSpellBookItem` extended `MAJOR_KEYS` to 5 entries (core first), and overrode `getMajorGuiOffsets()` with explicit 5-slot coords (`core` at top center, 2x2 grid below for front/back/spine/pages-or-dye) — avoids the `ArrayIndexOutOfBoundsException` from cont. 6 by giving Tetra a matching offset table.

**Tetra data**: 2 new `core` modules + 2 new `core` schematics; 12 ISS + 3 Ars material JSONs in `tetra/materials/icraft_iss_books/` and `icraft_ars_books/` categories (unique prefix to avoid collision with TSB's `iron_spell_books/` if both ever load); integrity rebalanced to `front=0, back=+1, spine=0, pages/dye=+1, core=-2` → net 0 baseline before material picks; material's `integrityCost`/`integrityGain` per tier (T1=0/2, T2=1/4, T3=2/6, T4=3/8) restores the budget pressure that was missing in cont. 8.

**Replacements**: 15 vanilla→modular replacement files rewritten to point at the single new item with `core/<book>_spell_book` material installed. **Save compat is non-graceful (option a)** — pre-6G inventories holding the deleted per-tier `modular_*_spell_book` items lose them on world load. Tester confirmed acceptable for alpha.

**Cleanup**: deleted 15 per-tier crafting recipes and 15 per-tier item models (the new modular item shows the iron book texture; future improvement: per-material texture overlay on the core slot).

**Lang**: rewrote `en_us.json` from per-tier item names to slot/schematic/module/material entries. ~80 keys total. Material names render via Tetra's `material_name` interpolation: e.g. an iron-cored modular spell book displays as **"Iron Spell Book"** (the material's `name` lang), the dye improvement reads as **"Cover Dye"**, etc.

Future Phase 6H: per-material core textures (TSB ships per-spellbook PNGs in the core slot's `availableTextures` array; we currently use the iron texture as a placeholder for all variants).

---

## 2026-04-28 (cont. 9) — Untier the modular spell book wrappers (AStages "Unfamiliar Item" fix)

Tester reported their modular spell book was showing as "Unfamiliar Item" in tooltips/JEI. Root cause: 6 entries in `astages_restrictions.js` (T2/T3/T4 blocks) were locking `iridescent_modular_spells:modular_{iron,gold,apprentice,diamond,archmage,netherite}_spell_book` behind tier gates. AStages substitutes the display name with "Unfamiliar Item" for any item the player can't see at their current tier.

The modular spell book *wrapper* should always be visible — the actual tier signal lives in the **core material** installed via the Tetra workbench, not the item ID. Deleted those 6 lines (kept the comment block as a paper trail). The plain ISS/Ars books (`irons_spellbooks:iron_spell_book`, etc.) remain tier-gated as before — only the modular wrappers are ungated. Mirrored to both distribution copies.

This is Stage 0 of the in-flight Phase 6G refactor (collapse to a single Tetra-pure `modular_spell_book` item per side, material-driven core). The remaining stages are still to come.

---

## 2026-04-28 (cont. 8) — Tetra workbench polish: slot labels, integrity, name shortening

Tester opened a spell book on the workbench and reported three issues; addressed all in one rebuild.

- **Slot labels showing raw lookup keys** (`tetra.slot.iss_book/front_cover` etc.). Tetra emits these via `tetra.slot.<slot_path>` (dotted prefix, slash inside slot — same convention as `tetra.module.<slot>`, distinct from the slash-prefix `tetra/schematic/...` for schematics). Verified against `assets/tetra/lang/en_us.json` in the Tetra 6.12.0 jar (`tetra.slot.sword/blade`, etc.). Added 8 entries: 4 for iss_book + 4 for ars_book, all named after the slot ("Front Cover", "Back Cover", "Spine", "Pages" / "Dye").
- **Integrity 0/0**. All 8 module variants (4 iss + 4 ars) had `extract.integrity: 0`, so the workbench reported a flat 0/0 budget. Bumped each to `integrity: 1`, giving each book a 4-point budget — comparable to Tetra's vanilla sword (blade −1, hilt +1 net 0 with positive structural pieces). Improvements consume from this budget; lining/dye are 0-cost so don't draw it down. Honing-style improvements added later can spend from the 4-point pool.
- **Name truncation in workbench column** (e.g. "Front Cover Lining" wraps badly). Shortened the three long schematic names: "Front Cover Lining" → "Front Lining", "Back Cover Lining" → "Back Lining", "Front Cover Dye" → "Front Dye". Applied symmetrically to both iss_book and ars_book sides where the schematic exists.

Open follow-up: user asked for me to also reference TSB ("Tetra Spell Books") jar for design comparison. That jar isn't in `iridescent-modular-spells-mod/libs/` and isn't on Modrinth under that name. Asked the user where to grab it.

---

## 2026-04-28 (cont. 7) — Re-add ISS dye as a front-cover improvement (option 2)

After reverting the broken 5th-major slot in cont. 6, restored the dye-on-iss feature using the improvement system instead — same pattern the existing `iss_book_lining_fabric/fibre/skin` improvements use, so no Tetra UI hardcoding is violated. Three files added: `data/tetra/improvements/iridescent_modular_spells/iss_book_dye.json` (zero-attribute, level 1, purely cosmetic), `data/tetra/schematics/iss_book/front_cover_dye.json` (accepts the 16 vanilla dye items, applies to `iss_book/front_cover`), and the matching 4 lang entries (`tetra.improvement.iss_book_dye.*` and `tetra/schematic/iss_book/front_cover_dye.*` — note slash prefix for schematic per cont. 2). Wired into `front_cover.json`'s `improvements` array.

Player UX: open Tetra workbench → ISS book in main slot → "Front Cover Dye" schematic appears alongside "Front Cover Lining" → drop a vanilla dye, apply, done. Dye is re-applicable (no requirement gating), so players can swap colors freely. Lining and dye coexist on the same slot — they're independent improvements.

`MAJOR_KEYS` stays at 4. Tetra workbench no longer crashes.

---

## 2026-04-28 (cont. 6) — Revert iss_book/dye slot — Tetra has a hard 4-major limit

Tester reported a CTD when opening a spell book on the Tetra workbench. Root cause was my own change in cont. — adding the 5th major slot (`iss_book/dye`) violates a hardcoded assumption in `se.mickelus.tetra.gui.GuiModuleOffsets.getX()` (line 40), whose offset array is sized for exactly 4 major modules. The crash:

```
ArrayIndexOutOfBoundsException: Index 4 out of bounds for length 4
  GuiModuleOffsets.getX → GuiModuleList.updateMajorModules → WorkbenchScreen
```

Reverted: `MAJOR_KEYS` back to 4 (front_cover, back_cover, spine, pages); deleted `data/tetra/modules/iss_book/dye.json` and `data/tetra/schematics/iss_book/dye.json`; pulled the 5 dye lang entries. Doc comment in `ModularSpellBookItem.java` now warns future-me about Tetra's 4-major hard limit.

The "dye on both sides" symmetry the user asked for is still doable, but not as a 5th major. Open follow-up: re-implement dye on iss_book either as (a) an improvement on `front_cover` rather than its own slot — like the lining improvements already do, (b) merge `pages` and `spine` if we accept dropping one's mechanic, or (c) skip dye on the iss side and accept the asymmetry.

---

## 2026-04-28 (cont. 5) — Paxi load order semantics correction + pride patch revert

Two errors compounded into a still-broken main-menu logo. Both corrected.

**Wrong assumption #1 (cont. 3 changelog):** I claimed "first in `loadOrder` = TOP = wins". Decompiling Paxi 4.0's `PaxiRepositorySource.loadPacks` shows the opposite — packs are added in iteration order with `Pack.Position.TOP`, so each new pack pushes prior ones down. The **last** item in `loadOrder` ends up at the top of the stack and wins. Our cont. 3 order had Pride at index 2 above Transcendence at index 1, which actually made Pride win over Transcendence for `minecraft.png` — exactly the symptom the tester observed. Flipped the manifest (now lowest-to-highest priority): `Melodys Cute Villagers > pridepack > Transcendence > iridescent_codex_resources`. Added a `_comment` field to the JSON noting the semantic to prevent future re-confusion.

**Wrong assumption #2 (cont. 4):** I patched Pridepack's `pack.mcmeta` overlay range from `[16, 9999]` to `[15, 9999]` thinking the overlay's title texture would resolve the 1.20.1 distortion. The overlay ships a 4096×1024 image which is the 1.20.2+ sprite-atlas format — applying it on 1.20.1 (which expects the 1024×256 single-image layout) was actually causing the distortion, not curing it. Reverted the mcmeta to its original `[16, 9999]` so 1.20.1 falls back to the base pack texture (and Transcendence at the new top of the stack overrides it anyway with a clean 1024×256 trans logo).

Net effect: with the corrected load order, Transcendence's logo wins; the Pridepack mcmeta patch was unnecessary and is now reverted.

---

## 2026-04-28 (cont. 4) — Pridepack 8.0.1 title-texture fix for MC 1.20.1

Tester reported the main-menu Minecraft logo rendered as overlapping/distorted glyphs while Pridepack was active. Root cause: Pridepack 8.0.1 ships its 1.20+ title texture (the new 1.20 sliced format with the `blur: true` mcmeta) inside its `format16/` overlay, gated to `formats: [16, 9999]` — but MC 1.20.1 reports `pack_format = 15`, so the overlay was being skipped. The base pack's `minecraft.png` was then used, which targets the pre-1.20 single-image title format and renders incorrectly under 1.20's new title-rendering algorithm. Fix: edited `pack.mcmeta` inside the zip to widen the overlay range to `formats: [15, 9999]`, so 1.20.1 picks up the correct title texture. Mirrored to client distro.

**Maintenance note:** if Pridepack is ever updated to a newer version, re-apply this one-line patch to its overlay `formats[0]` value (16 → 15) before shipping. The author may correct this upstream eventually, in which case the patch becomes a no-op and can be dropped.

---

## 2026-04-28 (cont. 3) — Paxi resourcepack load order made explicit

Three packs (Pridepack 8.0.1, Transcendence 0.7.4, Melody's Cute Villagers v1.10.0) were physically present in `config/paxi/resourcepacks/` but absent from `resourcepack_load_order.json`, so Paxi was loading them in undefined alphabetical fallback order after the codex. Made the layering explicit (top wins): codex > Transcendence > Pridepack > Cute Villagers. Codex on top so the in-game guidebook textures always win; Transcendence above Pridepack as the narrower, brand-aligned overlay; Pridepack above villagers as the broader colorway base; villagers at the bottom as a passive mob retexture. Mirrored to `distribution/client/`. Server distribution left as codex-only (server doesn't push resourcepacks to clients in the current setup).

Cleanup: deleted a stray `Prism Launcher version 9.4 (officia.txt` (38KB) that had been sitting in the resourcepacks dir as a Prism download artifact, and renamed `Transcendence_0.7.4§7.zip` → `Transcendence_0.7.4.zip` to drop the trailing Minecraft `§7` (gray-color) format code from the filename — the `§` character was fragile in cross-platform shell handling.

---

## 2026-04-28 (cont. 2) — Default shader + customizable main menu (FancyMenu)

Two visual-polish additions for the alpha-test pack:

- **Complementary Reimagined r5.7.1 shipped as default shader.** 523KB zip placed in `shaderpacks/` (main + client distro), Oculus is the loader. `optionsshaders.txt` ships at the `.minecraft/` root with `shaderPack=ComplementaryReimagined_r5.7.1.zip`; `sync_client.ps1` (both copies) seeds it only if the player doesn't already have one — so first launch auto-enables, and player choices to switch shaders later persist across syncs. Picked Reimagined over Unbound for the perf-balance sweet spot; over BSL for atmospheric volumetrics that suit the spell-heavy gameplay; over SEUS PTGI for the ~150x size reduction.

- **FancyMenu 3.8.1 (+ Konkrete 1.8.0 + Melody 1.0.3) added.** Enables multiple custom main menu layouts with random selection at game start (the in-game configuration UI handles layout creation). All three are client-only mods; .pw.toml entries in `mods/.index/` for both main and client distro. Layouts themselves are not yet authored — that's a follow-up content task.

`.gitignore` updated to track `shaderpacks/*.zip` (was previously blanket-ignored). No code-side behavior changes; pure asset/config additions.

---

## 2026-04-28 (cont.) — Tetra schematic lang fix + iss_book/dye slot

`iridescent_modular_spells` schematic UI was showing raw lookup strings (e.g. `tetra/schematic/iss_book/front_cover_lining.description`) because our 24 schematic lang keys used the dotted `tetra.schematic.` prefix; Tetra 6.12.0 expects the all-slash form `tetra/schematic/...` for schematics specifically (modules + improvements stay dotted). Re-keyed all 24 entries to the slash form. Also added an `iss_book/dye` major slot (mirrors `ars_book/dye`) so both books support cosmetic dyeing — matching ars symmetry per user request. Slot is zero-integrity, zero-attribute (purely cosmetic). Edits: `ModularSpellBookItem.java` (5-major MAJOR_KEYS), new `data/tetra/modules/iss_book/dye.json` + `data/tetra/schematics/iss_book/dye.json`, lang adds 5 keys (3 module, 2 schematic). Built `iridescent_modular_spells-0.2.0.jar` and deployed to all 3 distros.

---

## 2026-04-28 — Mutant Monsters block-break: removed dead `mutant_monsters_no_grief.js` (EntityMobGriefingEvent approach didn't catch `Level.destroyBlock()`); kept the surgical `mutant_monsters_no_griefing.js` (`BlockEvents.broken` namespace cancel). Also removed `diagnose_mob_drops.js` — spider diamond+ender_eye no longer reproducing under the defensive `removeLoot` ENTITY strip in `loot_overhaul.js`; will rediagnose if recurrence.

---

## 2026-04-27 (cont.) — Phase 6F-3 follow-up: FA + Stalwart + Mahou synergy

Three audit-driven follow-ups after the main 6F-3 push:

- **Forbidden Arcanus mob drops unblocked** (`global_loot_modifiers.json`) — FA ships 6 entity-drop GLMs (zombie_arm from zombies, dragon_scale x2-3 from Ender Dragon, plus bat/drowned/enderman/squid additions) that were silently blocked by our `replace: true` allowlist. Players were getting zero FA mob drops. Allowlisted all 6 — restores intended FA progression.

- **`stalwart_dungeons_drops.js`** (7 modifiers) — Stalwart's 7 nether mini-boss entities (awful_ghast, nether_keeper, incomplete_wither, giddy_blaze, reinforced_blaze, shelterer, shelterer_without_armor) get T3 ISS magic synergy on top of vanilla loot. Tougher mini-bosses get rare_ink + fire/blood/cooldown runes; weaker ones get uncommon_ink + fire_rune. incomplete_wither has 10% diamond_spell_book chance.

- **`mahou_synergy_drops.js`** (14 modifiers) — Mahou Tsukai is a T4 player-spell mod with no mob drops natively; reagents (attuned_emerald, attuned_diamond, fae_essence, kodoku) are crafted via vanilla means. To give Mahou-class testers organic acquisition paths, Mahou reagents are now injected as low-rate drops on thematically-aligned bosses across other mods: T2 reagents (attuned_emerald + fae_essence) on TF Lich/Hydra + Aether Sun Spirit + BS Summoner + vanilla Evoker; T3 reagents (attuned_diamond + kodoku) on Cataclysm Ignis/Harbinger/Maledictus/Ancient Remnant + ISS Dead King; T4 reagents (attuned_diamond at higher count) on Cataclysm Ender Guardian, vanilla Warden, Ender Dragon.

**Coverage tally**: 67 → ~88 entities now covered. This concludes the Phase 6F mob-drop expansion. Structure loot audit (separate question) verified existing coverage was already extensive — no new files shipped on that side beyond the FA GLM allowlist update.

---

## 2026-04-27 — Phase 6F-2/3 modded mob coverage expansion + Alex's Mobs full pass

50 new entity-loot modifiers across 5 new KubeJS files in `kubejs/server_scripts/loot/`. Pre-existing coverage was 17 entities; new total is ~67 entities with explicit LootJS rules. Internal boss-kill counter at `gates/milestone_detection.js` already auto-grants AStages tiers — these new drops are synergy/balance, not progression tokens (token concept rejected as design conflict; we already track kills internally).

- **`alexsmobs_drops.js`** (21 modifiers) — full pass on Alex's Mobs:
  - **Mimicream nerf**: stripped from `alexsmobs:mimicube` natural drops, re-injected at **1%** (vanilla rate was ~50% via `count{min:-1,max:1}` math). Mimicream enables item duplication; vanilla rate broke economy at any tier.
  - **T4 mobs** (void_worm, mimicube, enderiophage, laviathan): legendary/epic ink + ender/fire runes + matching upgrade orbs at low chance
  - **T3 nether/underground** (bone_serpent, straddler, soul_vulture, crimson_mosquito, warped_mosco, murmur, hammerhead_shark, frostmoth, cosmaw): rare/uncommon ink + element-themed runes
  - **T2 dangerous overworld** (crocodile, komodo_dragon, anaconda, caiman, snow_leopard, dropbear, leafcutter_ant_queen, cachalot_whale): common/uncommon ink + minor rune drops at low chance
  - **T1 passive entities** (birds, raccoons, frogs, etc.) untouched — vanilla drops fine

- **`twilight_boss_drops.js`** (6 modifiers) — TF T2 progression bosses (naga, lich, hydra, ur_ghast, minoshroom, knight_phantom) get magic synergy on top of canonical TF drops. Element-themed: Lich → magic (gold_spell_book 15%), Hydra → fire_upgrade_orb, Ur-Ghast → diamond_spell_book 15% + fire/cooldown runes.

- **`cataclysm_boss_drops.js`** (8 modifiers) — netherite_monstrosity, ignis, the_harbinger, ender_guardian (T4), maledictus, ancient_remnant, the_leviathan, coralssus. Ignis/Ender Guardian get small-chance T3+ spell book drops (diamond_spell_book 15% / netherite_spell_book 10% respectively).

- **`blue_skies_drops.js`** (4 modifiers) — summoner, alchemist, starlit_crusher, arachnarch. Summoner (magic theme) drops gold_spell_book 15% + Ars source_gem; Alchemist drops elixir potions; Starlit_Crusher drops lightning_upgrade_orb 15%.

- **`dimensional_boss_drops.js`** (11 modifiers) — Aether (slider, sun_spirit), Deep Aether (eots_controller — T4 sky-end), vanilla Warden (T4 sculk), Undergarden (forgotten_guardian, forgotten, rotbeast), Mutant Monsters (zombie/skeleton/creeper/enderman). Synergy crossovers tier-appropriate for each.

**Boss-kill tracking confirmation**: `gates/milestone_detection.js:122-147` reads/writes `icraft_t{2,3,4}_boss_kills` persistentData on each death event of a tracked boss. Hits the threshold → AStages tier_X granted. No physical progression-token items needed; the concept was rejected as design conflict with this internal flow.

Mage power curve remains uncapped per `feedback_mage_power_curve.md` — the new high-tier ink/rune/orb drops feed mage stat stacking deliberately.

---

## 2026-04-26 (cont.) — Phase 6C-6F-1 Tetra workbench + book roster + buffs

Same dev day, continued from earlier sessions below.

- **Modular Spells Phase 6C (`9b8526ae`)** — 32 JSONs under `data/tetra/` give the modular books actual workbench functionality. Slot model: 4 majors (`{front_cover, back_cover, spine, pages}` for ISS; `{front_cover, back_cover, spine, dye}` for Ars), no `core` slot — items are tier-locked at registration. Lining model uses Tetra-canonical `displayType: improvement` schematics: covers each have a main-install schematic (1 mat) + a separate lining-install schematic (1 mat) that routes by item-list to one of three improvement keys (`fabric`/`fibre`/`skin`) with thematic stat bonuses. Replacements wire vanilla ISS/Ars books → modular variants on first inventory tick.

- **6B hotfix (`7083c3a2`)** — Server start crashed on `ResourceLocationException: Non [a-z0-9/._-] character in path of location: tetra:repair/iridescent_modular_spells:iss_book`. Tetra's `SchematicRegistry.registerSchematic` builds `new ResourceLocation("tetra", "repair/" + identifier)`, so the identifier becomes part of the RL *path* — `:` is illegal there. Renamed `TETRA_IDENTIFIER` from `iridescent_modular_spells:iss_book` → `iridescent_iss_book` (and same shape for Ars). Underscore-only, RL-path-legal. Lesson: **Tetra item identifiers must be `[a-z0-9/._-]` only** — saved as forbidden-character note.

- **Phase 6F-1 (`a07429f8`)** — Roster expansion + intrinsic buffs + ISS boss-drop wiring. Three deliverables:
  - **7 new modular ISS book variants**: `dragonskin`, `druidic`, `blaze`, `evoker`, `necronomicon`, `villager`, `rotten`. Each tier-locked, registered with appropriate max-spell-slots, models pointing at ISS textures, replacement files for vanilla→modular auto-conversion. Total roster now 12 ISS + 3 Ars = 15 modular variants.
  - **Per-book `BookKind` intrinsic stat overlay**. Refactored `ModularSpellBookItem` to take a `BookKind` enum constructor param. The class's `getAttributeModifiers(SlotContext, UUID, ItemStack)` now chains three layers — super (ISS vanilla intrinsics, preserved), `BookKind.intrinsicModifiers` (Phase 6F overlay), `getAttributeModifiersCached` (Tetra slot/lining attrs from Phase 6C). All three stack additively. Per-(kind, attribute) stable UUIDs prevent re-equip duplicate stacking. Buff numbers: tier-baseline mana floor (+25 T2 / +50 T3 / +100 T4), themed schools at +20-30% (e.g. dragonskin = +25% Ender on top of vanilla +10% = +35% baseline before slot/lining). Mage power curve is **uncapped by design** — mages weak early, highest peaks late (memory: `feedback_mage_power_curve.md`).
  - **ISS boss-drop hooks** — `kubejs/server_scripts/loot/iss_boss_drops.js` (8 entity loot modifiers via LootJS) + `iss_boss_first_kill.js` (per-player guaranteed first-kill drops via `EntityEvents.death` + `persistentData.icraft_first_kill_<bossname>`).
    - **First-kill guarantees**: `dead_king` → necronomicon (T4), `archevoker` → evoker_spell_book (T3), `fire_boss` → blaze_spell_book (T3), `valkyrie_queen` → magehunter (T3).
    - **Sustained drops**: `dead_king` → blood_staff 50%, `citadel_keeper` → keeper_flamberge 40%, `cryomancer` mob → ice_staff 15% + ice_rune 25%, `pyromancer` mob → pyromancer armor pieces ~10% each + fire_rune 20%, `aether:cockatrice` → lightning_rod 25%, `twilight:snow_queen` → ice_staff 50%, `twilight:alpha_yeti` → ice_staff 25%, `aether:valkyrie_queen` → magehunter 30%, vanilla `phantom` (during thunderstorm only) → lightning_rod 5%.

  Tetra replacement files mean random vanilla ISS book drops auto-convert on inventory tick — no need to rewrite every loot table.

- **Phase 6F-2 + 6F-3 deferred to follow-up sessions**: held-item-buff KubeJS hook for vanilla ISS staves + magehunter pillager strip; armor/curio/rune/upgrade-orb gates + held-item buff coverage for those item categories.

- **Phase 7 design captured** (`wiki/design/iridescent-modular-spells-tetra-migration.md`) — 6 elemental subclasses (Pyromancer/Cryomancer/Necromancer/Priest/Druid/Stormcaller), each +50% to one school, -10% melee malus (vs Archmage's -25%), no starter armor, add-alongside not replace. Implementation deferred.

- **Tetra forbidden-character lesson** captured in the lessons-learned postmortem log (private) — `SchematicRegistry.registerSchematic` constructs a ResourceLocation path from the identifier, so identifiers must obey `[a-z0-9/._-]` (no `:`).

---

## 2026-04-26 (cont.) — Phase 6A+6B Tetra integration + Mutant Monsters block-break

Continuation of the same dev day, after the main session below.

- **Modular Spells Phase 6A+6B (ec4cff4a)** — Foundational rework toward native Tetra workbench integration. Phase 6A enables Tetra (6.12.0) + tetra-mutil (6.3.0) as compileOnly deps, declares Tetra as mandatory in mods.toml. Phase 6B adds `IModularItem` skeleton on `ModularSpellBookItem` (5 ISS metal variants, slot keys `iss_book/{core,front_cover,back_cover,spine,pages}`) and `ModularArsSpellBookItem` (3 Ars tier variants, slot keys `ars_book/{front_cover,back_cover,dye,spine}`). All 12 abstract methods implemented with sensible defaults; `getRequiredModules` empty so books still work without Tetra modules. AttributeApplier remains authoritative for stat bonuses through Phase 6C — Phase 6D will run the imodspells_slots → Tetra Modules NBT migration and retire AttributeApplier + AnvilModuleInstaller. Mod version bump 0.1.0 → 0.2.0. Reason: tester confirmed (this session) that full Tetra integration mirroring TSB on CurseForge was always the design intent, but TSB is All Rights Reserved so we mirror its API-driven structure (slot model, ISS/Ars stat keys) and write our own code/data. Migration design doc at `wiki/design/iridescent-modular-spells-tetra-migration.md`.
- **Mutant Monsters block-break suppression** — `kubejs/server_scripts/mutant_monsters_no_griefing.js`: 18-line `BlockEvents.broken` handler that cancels any block-break by an entity in the `mutantmonsters:` namespace. Mutant zombie's pillar-up and mutant creeper's charged explosion both call `Level.destroyBlock()` directly which bypasses the `mobGriefing=false` default we shipped earlier today. Mob damage is preserved; only terrain mutation is suppressed.

---

## 2026-04-26 — Modular Spells mod completed + worldgen rebalance arc + combat survivability

Major session covering five interconnected workstreams. All changes shipped + tested.

### Iridescent Modular Spells mod (Phases 2-5 complete)

8 modular spell books spanning ISS + Ars Nouveau ecosystems with NBT-stored cover/pages slots, custom enchants, and tier gating.

- **Phase 2 (b04c4eb8, 180c1152, bb9d6aaa)** — Full ISS spell book coverage. 4 new books (`modular_iron`, `modular_gold`, `modular_diamond`, `modular_netherite`) extending ISS's `SpellBook` for full T1→T4 progression. Material list expanded from 3 (leather/iron/diamond) to 6 (added copper/gold/netherite). Cover bonuses lean "max" (max_mana, spell_power); pages bonuses lean "rate" (mana_regen, cooldown_reduction). 4 new shapeless recipes (`<tier>_spell_book + leather` → modular variant; cover material customization via existing AnvilModuleInstaller).
- **Phase 3 (bc8cf447)** — Ars Nouveau modular spell books. New `ModularArsSpellBookItem` extends Ars's `SpellBook` for glyph-casting compatibility. 3 books (`modular_novice`, `modular_apprentice`, `modular_archmage`) with cloth-cover progression: white_wool (T1) → manaweave_cloth (T2 Botania) → sorcerer_robes (T3 Ars) → spell_cloth (T4 Botania endgame). Cover bonuses target Ars `max_mana` + `spell_damage` attributes; T3+ pages cross-buff ISS `spell_power` for cross-system synergy. AttributeKey enum extended with `ARS_MAX_MANA` + `ARS_SPELL_DAMAGE`. Build deps: `ars_nouveau` + `geckolib` (transitive — Ars's SpellBook implements GeoItem) added as compileOnly.
- **Phase 4 (f78f981e)** — 4 book-exclusive enchants registered via DeferredRegister with custom `EnchantmentCategory` filtering only modular books: `mana_capacity` I-V (+5%/lv max mana), `mana_flow` I-III (+5%/lv mana regen), `magic_crit_chance` I-III (+5%/lv crit roll), `magic_crit_damage` I-III (+25%/lv crit damage). The first two flow through AttributeApplier alongside slot-material bonuses. The latter two need a magic-crit hook since vanilla magic doesn't crit — new server script `magic_crit_hook.js` intercepts magic-typed `LivingHurtEvent`, rolls held book's chance enchant level + player's existing `icraft_crit_chance` attribute (cross-system melee/magic synergy), and multiplies damage on hit.
- **Phase 5 (a83d624a, e6485ba0, 85d0b5b5)** — Polish closing the arc:
  - **Codex**: 6-page `mods_t1/modular_spells.json` walkthrough (what modular books are, ISS metal-cover tiers, Ars cloth-cover tiers, slot bonus design, custom enchants, tier gates).
  - **AStages tier gates**: T2 (modular_iron + modular_gold + modular_apprentice), T3 (modular_diamond + modular_archmage), T4 (modular_netherite). T1 (modular_copper + modular_novice) ungated as start tier.
  - **Caster starter kits**: Archmage / Battlemage / Void Summoner now ship with the modular variants instead of vanilla ISS/Ars books — install cover/pages materials + custom enchants from day 1.
  - **Item icons**: 8 model JSONs written. ISS modular books inherit ISS's full 3D model via `parent` reference. Ars books fall back to vanilla `book` / `enchanted_book` / `writable_book` (Ars uses GeckoLib which requires per-item GeoItem renderer registration to inherit; deferred to future Phase 5.5).
  - **Codex icon audit**: 7 broken icons fixed across mods_t1/t2/t4 entries (apotheosis:infusion_table → salvaging_table; mahou_tsukai → mahoutsukai namespace; ars_nouveau:spell_book_1 → novice_spell_book; etc.).

### Worldgen rebalance arc

- **Cherry River Valley spawn (d4013cd7, 7f020442)** — `cherry_spawn_biome.js` runs once per world on serverLoaded, locates `iridescent_biomes:cherry_river_valley` within 8000 blocks of default spawn, sets shared spawn position. New first-time-player default spawn, compass needle, and bed-less respawn target.
- **Terramity ore tier-dim migration (a5c0b2a5, 7f020442)** — All 11 Terramity overworld ore biome_modifiers nullified via `forge:none` overrides. Each material re-injected into tier-appropriate dimensions per stat audit:
  - **T2 cold (sapphire)** → Aether + Blue Skies Everdawn
  - **T2 hot (topaz)** → Twilight Forest + Blue Skies Everbright
  - **T2 (ruby, dimlite, gaianite)** → Twilight Forest
  - **T3 (iridium, profaned, iridescent)** → Undergarden + Deeper Darker
  - Nether/End ores (daemonium, nether_iridium, nether_ruby, end_iridium, end_onyx) untouched.
  - **Hotfix (7f020442)**: each dual-target ore split into 2 biome_modifier files since Forge's `forge:add_features` `biomes` field doesn't accept arrays containing tag references — only single strings or arrays of explicit biome IDs.
- **Quartz nether-only (d4013cd7)** — overworld_quartz mod's biome injection nullified; AStages T3 gate added on `nether_quartz_ore`, all quartz blocks, and `overworld_quartz:*` items.
- **Worldgen frequency tweaks (dc714bcf)** — Thermal lead/tin/silver/nickel placed_features count -15%; vanilla iron + copper +25%; Create zinc +25%; Mekanism world.toml `perChunk` for 10 ore veins reduced ~15% (Mekanism uses `configurable_constant` so config TOML edit instead of datapack).
- **AStages thermal raw metals → T2 (d4013cd7)** — lead/tin/silver/nickel raw + ingots + ores + nuggets + blocks all gated at tier_2.

### Tetra Terramity material integration (0cf129fc)

6 ore-mined Terramity materials get Tetra material entries with unique perks (vs raw stats — sapphire/topaz/ruby/onyx have identical in-mod stats, differentiation via perk):
- **sapphire** (T2 cold gem) — Fire Resistance passive while held
- **topaz** (T2 hot gem) — Sets target on fire 2s on hit
- **ruby** (T2 fire gem) — +50% damage when source is fire-typed
- **onyx** (T4 dark gem from End) — +15% damage from owned/tamed minions of holder (synergy with summoner classes)
- **dimlite** (T2 glow metal) — Night Vision passive while held (effective self-light source)
- **iridium** (T3 metal) — +50% melee knockback on hit (true unit-vector physics)

Perks applied via `tetra_terramity_perks.js` — scans player mainhand for Tetra items whose modules contain one of the 6 materials (NBT key endsWith `_material`), applies effect via tick handler (passives) or `EntityEvents.hurt` (on-hit).

### Combat survivability (Faefolk/WoI/Archmage early-game pain)

- **T1 damage softener (dc714bcf)** — `player_t1_damage_softener.js` multiplies incoming damage × 0.7 (-30%) for players with tier_1 stage AND NOT tier_2. Auto-disables once they progress past overworld. 7-dmg geared zombie hit becomes ~5 dmg → 2-shot becomes 3-shot.
- **ImprovedMobs Equipment Chance** 0.30 → 0.15 (dc714bcf) — half the mobs spawn with gear, halving burst-damage incidence.
- **Sunlight clear-out (dc714bcf)** — `sunlight_smite.js` damage per tick bumped 2.0 → 100.0; any non-boss undead in direct sky during day one-shot killed at next tick boundary (~0.5s after exposure). Drops preserved.
- **Modded undead tag audit (5c244b82)** — `data/minecraft/tags/entity_types/undead.json` expanded from 26 → 63 entries. Added netherskeletons (9), bygonenether wither variants (3), mutantmonsters mutants (3), savage_and_ravage skeleton_villager, twilightforest non-boss undead (6), enemyexpansion vampires (3), terramity legacy zombies (4 via TATOS legacy id format), ad_astra zombified pygros, alexsmobs spectre/skelewag, cataclysm:ignited_revenant, etc. Bosses excluded.
- **Mana pool buffs (b04c4eb8, 180c1152, 8ec5e1f4)** — `mana_pool_bonuses.js` applies via `irons_spellbooks:max_mana` AND `ars_nouveau:ars_nouveau.perk.max_mana`: global +25% baseline (MULTIPLY_BASE) for every player; Archmage MULTIPLY_TOTAL +1.0 (2x on top); Battlemage / Void Summoner MULTIPLY_TOTAL +0.5 (1.5x on top). Resulting max_mana from default 100 base: Non-mage=125, Battlemage/VS=187, Archmage=250. Ars Nouveau caches max via `IManaCap.setMaxMana` and only recomputes on login/respawn/equip events — script also calls `ManaUtil.calcMaxMana(player)` + `setMaxMana()` on class change to force-kick the cache.

### EnemyExpansion knockback bypass investigation + fix (a18aacc5)

EnemyExpansion uses `Entity.setDeltaMovement(Vec3)` DIRECTLY in its mob procedures (DireLeapProcedure, VampireAttackProcedure, ExplosiveLaunchHappensProcedure), bypassing `LivingKnockBackEvent` entirely. Three layers of defense added:
1. `cap_player_knockback.js` — clamp ratio + strength in `LivingKnockBackEvent` (catches vanilla Punch enchant).
2. `diag_player_velocity.js` (promoted from logger to clamper) — at LivingHurtEvent.HIGHEST snapshot pre-Y, at LIVINGHurtEvent.LOWEST clamp post-Y if delta > 0.8 to `pre + 0.4` (vanilla cap). Catches Vampire procedure direct setDeltaMovement.
3. `enemyexpansion_explosive_launch_blocker.js` — 4Hz tick scan of all players, removes `enemyexpansion:explosive_launch` mob effect on sight. Kills the per-tick procedure at its source.

### TATOS dimension lock (73d2e2f6)

`tatos_dimension_lock.js` confines all `theabyss:*` (and `abyss:*`) mobs to the 4 TATOS dimensions (`the_abyss`, `spectral_world`, `frost_world`, `pocket_dimension`). Subscribes to `EntityEvents.spawned`, `entity.discard()`s any TATOS spawn outside those dims. Catches Java-code spawns, structure spawners, command-summoned, mod cross-injection. Also: 20-entry TATOS legacy lang fix (`entity.<id>.name` MCreator format that 1.20.1 doesn't resolve) — abyssbadskelletion/abysscorruptedcow/abysszombie/etc. all rendered properly now.

### Misc fixes

- **`/icraft despawn <radius>` command (cb8d89a4, 45112263, fbcd15e2, dce72e5d)** — Op-only KubeJS command for clearing nearby hostiles. Triple-fallback hostile detection (instanceof `Monster.class` + MobCategory `equals(MONSTER)` + name string compare) since Rhino enum identity is unreliable across JavaClass wrapper round-trips. Skips bosses (`#forge:bosses`), tamed entities (`OwnableEntity`), and players. `entity.discard()` not kill — clean reset, drops not preserved.
- **Empty customName fix (1a8a1f0f)** — `fix_empty_display_name.js` clears empty Component names at spawn so death messages show entity type name instead of `silvieserene was shot by ` (literal blank). `diag_empty_display_name.js` continues logging which mod is producing them (Townstead-flavored pigs caught at 45,64,-62 in tester logs).
- **Vec3 field NPE hotfix (6c27d44d)** — `diag_player_velocity.js` Phase 1 used Vec3 field access (`d.y`) which Rhino's FieldAndMethods.getDefaultValue NPEs on inside Field.get(null) when coercing to primitive. Bridge-level NPE bypassed JS try/catch, crashed the player tick, Neruina kicked tester. Fixed by switching to method form `d.y()` (record-style accessor in 1.20.1).
- **Rhino scoping memory** (`feedback_rhino_scoping.md`) — Two traps documented: function declarations inside try blocks aren't reliably hoisted (use `var X = function() {}`); Vec3 field access NPEs (use method form).
- **Forge biome_modifier memory** (`feedback_forge_biome_modifier.md`) — `biomes` field is tag OR array-of-ids, never array containing tags; split into one file per tag.

---

## 2026-04-24 — Three-distro parity audit: server_distribution/global_packs cleanup

Ran a full parity sweep of main, server_distribution, and distribution/client across kubejs/, config/, datapack_sources/, global_packs/, and custom mod jars. Almost everything was already byte-identical: KubeJS server_scripts (71), startup_scripts (5), client_scripts (minus correctly-server-omitted `attribute_tooltips.js`), data/ (181 files), assets/ (7), all 7 custom mod jars, all 17 datapacks in `config/paxi/datapacks/`. Top-level config/ drift was expected shape (client-only `.toml` files absent from server, runtime `.bak` files).

The one real issue: `server_distribution/global_packs/required_data/` held 9 orphan zips that main and client didn't have. 7 were byte-identical duplicates of files already loaded from `config/paxi/datapacks/` — Paxi had been loading each twice per server boot. 2 were pre-mod-migration ghosts (`iridescent_classes.zip`, `iridescent_races.zip`) registering `icraft:class` / `icraft:race` origin layers alongside the mod's authoritative `origins:class` / `origins:race`. The orphan race.json still referenced `origins-plus-plus:*` IDs despite the mod having reimplemented those four races under `icraft:*`. Same class of issue as the `icraft_biomes.zip` orphan that caused the April FeatureSorter biome-cycle crash; caught here before it manifested.

All 9 deleted. Also swept three dead `iridescent_classes.jar` allowlist entries from `.minecraft/.gitignore` (the jar never existed; also a migration remnant). Commit `02564333`. Verified `iridescentserver.sh`, `sync_from_repo.*`, `phase0_sync.ps1`, and `server_install.*` have no logic to restore the deleted files — permanent.

---

## 2026-04-24 — T1 magic audit: Ars Nouveau promoted to T1 entry path, village chest stacking removed, starter kit scrolls NBT'd

Six improvements to make T1 magic genuinely accessible from the first day rather than gated behind tier tokens or unusable loot.

**Design doc Part VI rewritten**: Tier 1 now lists Botania + Iron's Spellbooks + Ars Nouveau (entry path). The Tier 2 Ars section was narrowed to "deep source infrastructure" (Imbuement Chamber, ritual brazier, industrial-scale Sourcelinks). The entry path — `novice_spell_book` + Scribes Table + T1 glyph chest loot — lives at T1 because Ars ships a vanilla-workbench recipe (book + 4 iron tools) that unlocks the spell book immediately, and we already seed T1 glyphs into Overworld chest loot.

**Village chest magic stacking removed**: `lootjs_overhaul.js` previously added a Pool 3 guaranteed weighted roll (40% common_ink / 35% source_gem / 15% copper_spell_book / 10% novice_spell_book) on top of the overworld T1 rule (copper 3%, iron 1%, common_ink 5%). Every village house chest was getting one guaranteed magic item plus a chance of another — ~100% magic coverage, way too much for a T1 starter area. Pool 3 removed entirely. Villages now pick up magic via the overworld T1 rule only.

**Village scroll NBT bug fixed**: Our village house JSON overrides contained a scroll entry at weight 1 vs empty 39 (~2.5%), but the entry had no `irons_spellbooks:randomize_spell` function — so scrolls were dropping with blank NBT and zero spell attached (unusable). Added the randomize_spell function to all 5 village house JSONs (plains, desert, savanna, snowy, taiga) with quality 0.0–0.2 so village scrolls roll low-tier spells, matching T1 accessibility.

**Class kit scrolls pre-NBT'd**: `codex_delivery.js` magic kits (archmage, battlemage, void_summoner) previously gave a copper_spell_book (no spell inscribed — useless until the player learns a spell) plus raw materials. Added two pre-NBT'd scrolls per kit using a Java.loadClass bridge to `ISpellContainer.createScrollContainer(AbstractSpell, level, ItemStack)`. Archmage: magic_missile + firebolt. Battlemage: magic_arrow + fang_strike. Void Summoner: magic_missile + summon_vex. New players of a magic class can cast on first login.

**Early Magic Codex tutorial**: added `datapack_sources/iridescent_codex/data/icraft/patchouli_books/iridescent_codex/en_us/entries/mods_t1/early_magic.json` (sortnum=2, right after botania). Covers: scrolls (loot + kit), copper spell books, novice_spell_book workbench recipe, Scribes Table glyph inscribing, form+effect rule, and Source vs Mana. Rebuilt iridescent_codex_data.jar and deployed to all 3 distros.

**ars_nouveau:novice_spell_book** was checked against its own shipped recipe and confirmed craftable at T1: vanilla workbench, shapeless, `minecraft:book + iron_shovel + iron_pickaxe + iron_axe + iron_sword`. No KubeJS recipe override needed.

---

## 2026-04-23 — Custom cherry biomes finally spawn: orphan-datapack cleanup + namespace rename

Two custom overworld biomes went live today: `iridescent_biomes:cherry_river_valley` and `iridescent_biomes:cherry_mountains`, registered via `iridescent-biomes-mod`'s TerraBlender region with explicit `Climate.ParameterPoint` values.

The shipping state is: mod jar at `.minecraft/mods/iridescent_biomes-1.0.0.jar` (all three distros), biome JSONs inside the jar at `data/iridescent_biomes/worldgen/biome/`, biomes in `#minecraft:is_overworld` and `#minecraft:is_mountain`, features verbatim-vanilla-cherry_grove, TerraBlender region weight 8 at disjoint climate coords from vanilla cherry_grove so we don't compete for its spawn points.

Background: the pack had been crashing at world load for ~20 iterations with `Feature order cycle found, involved sources: [minecraft:lush_caves, icraft:cherry_mountains, biomesoplenty:moor]`. The root cause was not any of the suspects chased during those iterations (feature ordering, tag membership, TerraBlender registration method, mod load order, Tectonic, LionfishAPI). It was a stale Paxi datapack at `config/paxi/datapacks/icraft_biomes.zip` that had been auto-loaded since before the Java mod existed and kept registering orphan biomes in a conflicting namespace. Once the Java mod either moved namespace or disabled itself, the datapack biomes remained — tagged `#is_overworld`, receiving injected features, but placed nowhere. Blueprint's FeatureSorter saw them and cycled. Commit `8c85d818` deleted the datapack + renamed the mod's own biomes to the matching `iridescent_biomes:` namespace. Full retro in the lessons-learned postmortem log (private).

Player-facing: Nature's Compass can now locate both biomes. `cherry_river_valley` spawns in warm temperate humid near-inland rolling terrain. `cherry_mountains` spawns on cool modestly-humid inland mountain tops. Both use vanilla cherry_grove's features (flower_cherry, trees_cherry, cherry-themed step 9) so they'll look like cherry forests, just at different climate zones from vanilla cherry_grove.

---

## 2026-04-22 — xp_multiplier attribute wired via totalExperience tick-diff

Previous session disabled `PlayerEvents.xpChange` (doesn't exist in KubeJS 2001.6.5-build.16). Replaced with a 1-second server-tick handler (`tick_xpMultiplier` at interval=20, offset=9) that diffs `player.xp` (verified via PlayerKJS bytecode to map to `Player.totalExperience` / `f_36079_`) against a cached last-seen value in `persistentData`.

Flow: on each tick, read current XP. First observation of a session caches without granting. Subsequent ticks compute `diff = current - last`. Negative diffs (anvil/enchant spends, death penalties) advance the cache silently. Positive diffs compute `bonus = floor(diff * (xpMult - 1.0))`; if `xpMult > 1.0`, grant via `player.addXP(bonus)` (maps to `giveExperiencePoints`). Cache updates to post-grant XP so the next tick's diff for our own bonus is zero — no feedback loop.

Granularity is 1 second. Batch XP events (end portal back-home dump, mass mob kill) resolve in a single tick because the diff is cumulative.

---

## 2026-04-21 — Predicate filter silently ALWAYS_FALSE (artifacts + blank books) + origindump log surfaced that player.Origins was empty

### Critical filter bug

Fresh tester log revealed three stacked issues:

1. **Predicate filters were silent no-ops.** Startup log had `"LootJS: Invalid ingredient for filter: Unknown"` firing 30+ times per server start. Decompiled LootJS 2.13.1's `LootJSPlugin.ofItemFilter`: when a JS function is passed to `removeLoot(fn)`, the TypeWrapper runs `IngredientJS.of(fn)`, gets an empty ingredient, logs the warning, and installs `ItemFilter.ALWAYS_FALSE` (= strip nothing). The strip is registered but never matches anything. That's why both the village non-curated-artifact predicate and the blank-enchanted-book predicate have been silently doing nothing for days. Correct pattern is `removeLoot(ItemFilter.custom(fn))` — the explicit `custom` factory wraps the JS function into a real `ItemFilter`. Added `var ItemFilter = Java.loadClass('com.almostreliable.lootjs.filters.ItemFilter')` at top of `lootjs_overhaul.js` and wrapped both call sites.

2. **`tick_codexOriginDump` threw every tick.** `const LAYER_IDS = [...]` inside a try block re-executes each tick; Rhino throws `TypeError: redeclaration of var LAYER_IDS`. Switched to `var` so reassignment is fine.

3. **Player's `ForgeCaps."origins:origins".Origins` compound was empty (`{}`).** The tester's character has no origins selected at all (`HadAllOrigins: 0b, Origins: {}`). Apoli `Powers:[]` also empty. This is why every class probe returned `detected=none` on the live run. Origin detection is correct behavior here — the player just hasn't actually selected an origin/race/class via the in-game picker yet. The in-game "I'm Archmage" impression is either from a different character or an Origins UI display (which shows the *chosen* origin even before the capability is persisted during login-flow).

### Fix files

- `kubejs/server_scripts/loot/lootjs_overhaul.js` (all 3 distros) — ItemFilter.custom wrap for both predicate filters
- `kubejs/server_scripts/codex_delivery.js` (all 3 distros) — LAYER_IDS const → var

### Next test

- Tester needs to actually complete the Origins selection UI on login (Origin → Race → Class). `!origindump` will now return without throwing and show the actual compound.
- If Origins compound is populated but kit still doesn't fire, the probe is still wrong — full postmortem in the lessons-learned postmortem log (private).

Full postmortem at the lessons-learned postmortem log (private) (2026-04-21 top entry).

---

## 2026-04-21 — Village artifact always-firing + starter kit diagnostic feedback

### Village artifact "nearly every chest"

Tester reported artifacts were still landing in nearly every chest after the predicate-strip + air-slot fixes. The predicate strip was working (non-curated artifacts from the T1 broadcast got stripped), but our own `villageArtifactWeighted` pool was firing 100% of the time instead of the target 11%.

Strongly suspected cause: LootJS 2.13.1 `addWeightedLoot` drops `Item.of('minecraft:air')` entries from the weighted pool (air is not an insertable item, so the serializer silently strips it). That collapses the pool from `[air×440, artifact×5×11]` to just `[artifact×5×11]`, and every roll picks an artifact.

Fix: switched village artifact injection from `addWeightedLoot` (with failed air rarity dial) to per-item `addLoot(LootEntry.of(id).when(c => c.randomChance(0.01)))`. 11 items at 1% each gives `P(≥1 artifact) = 1 − 0.99^11 ≈ 10.5%`, matching the intended rate. This is the same pattern the enchanted-book re-adds use at lines 181-222, which tester confirmed fires correctly at 7.5/10/12.5/15% per tier.

### Starter kit: `!kit` diagnostic output

Tester reported `!kit` did nothing, even though `!origindump` worked in the same session (confirming the NBT probe shape fix landed). Without seeing whether a non-magic class was detected, we can't tell if the kit logic is broken or just correctly refusing because the player chose a non-magic class.

Added non-magic-class probe to the `!kit` tick processor. Response now tells the player exactly what class the server sees:
- Magic class detected → grants kit as before.
- Non-magic class detected (berserker/samurai/wanderer/paladin/vanguard/ranger/artificer) → `[Starter Kit] Detected class: <name> (not a magic class — no catalyst starter kit for this class).`
- No class on origins:class layer at all → falls back to the "Use !origindump" hint, meaning something's wrong with origin selection.

This gives us per-invocation diagnostic feedback in chat + log without needing the tester to push logs.

### Files changed

- `kubejs/server_scripts/loot/lootjs_overhaul.js` (all 3 distros) — village artifact pool switched to per-item randomChance
- `kubejs/server_scripts/codex_delivery.js` (all 3 distros) — !kit probes non-magic classes for feedback

---

## 2026-04-21 — Origin NBT probe shape corrected across 9 scripts

### Root cause

Tester typed `!origindump` on a live server and the handler produced zero log output. Even after adding auto-origindump on login + a raw-NBT diagnostic route, we had enough evidence to know the chat handler was firing but every single origin probe was returning `r === 0`. Decompiled `origins-forge-1.20.1-1.10.0.9-all.jar` (`io/github/edwinmindcraft/origins/common/capabilities/OriginContainer.serializeNBT` bytecode) and found the truth: the `Origins` key inside `ForgeCaps."origins:origins"` is a **CompoundTag** of `{layer_id: origin_id_string}`, not a ListTag of `{origin:"..."}` objects. The capability key was right all along — the interior shape was wrong.

### Fix

Rewrote every origin NBT probe across the codebase. Old shape:
```
{Origins:[{origin:"icraft:archmage"}]}
```
New shape:
```
{Origins:{"origins:class":"icraft:archmage"}}
```

11 literal probes auto-rewritten by layer (using a Python script that maps icraft-class names to `origins:class`, icraft-race names to `origins:race`, everything else to `origins:origin`). 6 template probes (with `${varname}` interpolation) hand-fixed with the layer known from context. The codex origindump rewrites the probe to try all three layers per ID so it keeps working as a general diagnostic.

### Scripts touched

- `kubejs/server_scripts/codex_delivery.js` — magic class detection + origindump
- `kubejs/server_scripts/origins/magic_class_starter.js` — duplicated detection helper
- `kubejs/server_scripts/origins/class_passives.js` — per-class gating
- `kubejs/server_scripts/origins/witch_of_ink_progression.js` — witch gating
- `kubejs/server_scripts/origins/witherborn_slimebodied.js` — wither/slime hit hooks
- `kubejs/server_scripts/origins/phantom_undeath.js` — phantom revive
- `kubejs/server_scripts/origins/battlemage_mana_shield.js` — mana shield gating
- `kubejs/server_scripts/origins/artificial_construct_progression.js` — construct hooks
- `kubejs/server_scripts/skills/skill_effects.js` — class/race skill effects

All 3 distros synced. Lessons-learned entry at the lessons-learned postmortem log (private) (2026-04-21 top entry) documents the jar-audit approach.

### Starter kit impact

This was the actual root cause of `detected=none` — every poll in `tick_codexStarterCheck` ran `execute if entity [...Origins:[{origin:"icraft:archmage"}]...]` against a player whose NBT contained `Origins:{"origins:class":"icraft:archmage"}`. With the probe shape fixed, next login by a magic-class player should hit the class-layer probe on the first tick and grant the kit.

### Impact on other origin-gated features

All origin-gated passives (class_passives, phantom_undeath, battlemage_mana_shield, witherborn/slimebodied hit hooks, skill_effects class bonuses, witch_of_ink progression, artificial_construct progression) have also been silently failing since their introduction because they all used the same bad shape. Those will start working on the next server restart.

---

## 2026-04-21 — Village accessory double-stack, terrain flattening, cherry biome boost

### Village accessory double-stack

Tester reported that after the village pool fix the curated list was appearing correctly, but occasionally two accessories in one chest. Root cause: `artifacts:cloud_in_a_bottle` was in BOTH `villageArtifactPool` (the curated weighted pool) and `artifactT1Pool` (the type-level broadcast that injects into all Overworld chests). The whitelist-based predicate let the T1 broadcast's cloud through, so a village chest could receive one artifact from the weighted pool and a cloud from the T1 broadcast in the same roll.

Fix is two-part:
1. Removed `cloud_in_a_bottle` from `villageArtifactPool`. Cloud still spawns elsewhere in the Overworld via T1 broadcast — villages now just don't get it via their curated pool. Village pool is 11 items.
2. Predicate now strips every item in `artifactT1Pool` from villages unconditionally (not just "not in whitelist" — specifically targeting the broadcast source). The T2/T3/T4 broadcasts don't target Overworld dimensions so they don't leak in. Didn't include T2+ in the strip because `villageArtifactPool` includes T2+ items (`power_glove`, `cross_necklace`, etc.) and a blanket T2+ strip would also eat the village pool's own weighted rolls.

Effective artifact rate: 11 items × weight 5 = 55, vs air weight 440, ≈ 11% per chest. Close to the 12% target.

### Terrain flattening

Tester reported terrain feels too mountainous after the 2026-04-19 rivers fix bumped `ridge_scale` from 0.08 to 0.3 and `erosion_scale` from 0.1 to 0.4. Those settings drive river carving, so they stay. Flattening comes from two orthogonal knobs:
- `vertical_scale`: 0.8 → 0.6 (reduces overall elevation amplitude ~25%)
- `flat_terrain_skew`: 0.1 → 0.3 (Tectonic's direct "more flat areas" dial)

Mountains will still exist where ridges are high, but their heights are lower and the prevalence of flat land is 3x greater. Rivers should remain at the 2026-04-19 frequency.

### BoP cherry biome boost

Tester asked for cherry biomes and custom derivatives to appear more often. Adjusted the `bop_custom_region.json` TerraBlender region:
- Added `minecraft:cherry_grove` (weight 12) — vanilla cherry biome wasn't in the region at all
- Added `biomesoplenty:cherry_blossom_grove` (weight 20) — BoP's dedicated cherry biome
- `icraft:cherry_river_valley`: 20 → 35
- `icraft:cherry_mountains`: 15 → 25
- `biomesoplenty:orchard`: 8 → 15 (already cherry-adjacent)
- `biomesoplenty:snowblossom_grove`: 4 → 8 (pink-flowered, thematically paired)

Total region weight 160 → 215. Cherry-focused biomes 35 → 115 (≈ 54% of region rolls). Rebuilt `bop_biome_weights.zip` via `zip -r -X` (reproducible), deployed identical MD5 to all 3 distros. Affects new chunks only; existing worlds keep their biome layout.

### Magic starter kit — diagnostic still pending

Tester's `kubejs-server.log` from 22:47-22:51 showed the polling loop running the full 3 minutes with `detected=none` for every poll, then timing out. No `!origindump` command was run, so we can't tell whether the player picked a magic class at all (in which case "no kit" is correct behavior) or whether the NBT probe path is still misaligned on this fork. **Next diagnostic step:** ask tester to run `!origindump` in chat on a fresh join, which writes the player's full origin NBT to the server log. Until then, starter kit is unblocked-but-unverified.

### Files changed

- `kubejs/server_scripts/loot/lootjs_overhaul.js` (all 3 distros) — predicate + village pool rework
- `config/tectonic.json` (all 3 distros) — vertical_scale + flat_terrain_skew
- `datapack_sources/bop_biome_weights/data/custom/worldgen/region/bop_custom_region.json` — biome weights
- `config/paxi/datapacks/bop_biome_weights.zip` (all 3 distros) — rebuilt

---

## 2026-04-21 — Codex macro fix ($(/bold) was rendering as literal text) + magic starter kit cleanup

### Codex rendering errors

Tester reported "grammatical/formatting errors" inside the codex. Root cause was an invalid macro pattern used consistently across 151 entry files: `$(/bold)` / `$(/italic)` / `$(/warn)` as closing tags. Patchouli does not support HTML-style per-formatter closers for these — only `$()` (reset all active formatting) or `$(/l)` (explicit link close) are recognized. Unrecognized `$(/name)` macros render as the literal text on screen, which is what the tester saw.

Swept both `datapack_sources/iridescent_codex/assets/` and `.../data/` for `$(/bold)` (531 occurrences), `$(/italic)` (38), `$(/warn)` (3) and replaced each with `$()`. Left `$(/l)` untouched (valid). Rebuilt `iridescent_codex_data.jar` via `build_codex.sh`; new jar deployed to all 3 distros at identical MD5.

### Magic class starter kit — worker-thread handler removed

`magic_class_starter.js` had a duplicated `!magicstart` `PlayerEvents.chat` handler that called `runCommandSilent` directly from the chat-worker thread, which throws `JavaException: EventExit: result` (same pattern as the earlier codex chat-handler crash). The primary handler in `codex_delivery.js` now handles `!magicstart` / `!kit` through the `tick_codexChatProcessor` defer-to-tick pattern, so the duplicate was deleted. Also fixed a stray reference in `magicStarter_detectClass` that indexed the unaliased `MAGIC_CLASSES` global instead of the `MAGIC_CLASSES_SHARED` fallback — would have thrown `ReferenceError` if this file ever loaded before `codex_delivery.js`.

### Files changed

- `datapack_sources/iridescent_codex/data/**/*.json` — 151 entry files, macro fix
- `datapack_sources/iridescent_codex/assets/**/*.json` — same 151 files (mirror)
- `mods/iridescent_codex_data.jar` (all 3 distros) — rebuilt
- `kubejs/server_scripts/origins/magic_class_starter.js` (all 3 distros) — duplicate handler removed + var fix

---

## 2026-04-21 — Village chest loot pool: dedupe bed, restore realistic artifact rate, whitelist-strip non-curated artifacts

### Changes

1. **Bed dedupe.** `white_bed` was present in two overlapping weighted pools for the five village house tables (`villageHouseChests`): once in the dedicated house QoL flavor pool at line ~990 (weight 30), and again in the general `villageQoLPool` applied to all 15 village tables (line ~1633). Two rolls per chest meant testers observed two beds occasionally. Removed the bed entry from `villageQoLPool`; houses still get a bed from their dedicated flavor pool.

2. **Artifact rate restored to ~12%.** An earlier diagnostic commit had set `villageArtifactWeighted` to only 12 artifact entries with no air slot, which meant every chest rolled an artifact guaranteed. Restored the air slot at weight 440 against 12 x weight 5 artifacts (total 60); expected artifact-per-chest rate ~12%.

3. **Non-curated artifact strip switched to predicate.** Per-item string `removeLoot` on village tables wasn't catching artifacts injected by the Section 1C type-level `addLootTypeModifier(LootType.CHEST).anyDimension('minecraft:overworld')` T1 broadcast. Switched to a predicate-based `removeLoot(function(stack) { ... })` that whitelists `villageArtifactPool` and strips anything else from `artifacts:` / `relics:` / `celestial_artifacts:` namespaces. Predicate runs at roll time, so it's robust to registration-order quirks between type-level and table-level modifiers.

Rationale for (3) lives in the lessons-learned postmortem log (private) (2026-04-21 entry).

### Files changed

- `kubejs/server_scripts/loot/lootjs_overhaul.js` — dedupe + air slot + predicate strip
- the lessons-learned postmortem log (private) — postmortem entry
- `wiki/known-issues/tracker.md` — entry moved to resolved

---

## 2026-04-19 — Rivers never generating (Tectonic + BoP custom region)

Tester feedback: rivers have never appeared on any tested world, even across multiple freshly-seeded tests after the 2026-04-15 "More water" commit (3b14ec9d).

### Root cause (two issues stacked)

1. **Tectonic knobs moved in the wrong direction.** Commit 3b14ec9d set `ridge_scale 0.12→0.08` and `erosion_scale 0.14→0.10` under the commit message "More water". In Tectonic, *lower* ridge_scale means less-prominent ridges, and *lower* erosion_scale means less-eroded terrain — both reduce the frequency and depth of river channels. The intent was right; the direction was inverted.

2. **BoP Paxi datapack had no river biomes.** `config/paxi/datapacks/bop_biome_weights.zip` ships `data/custom/worldgen/region/bop_custom_region.json`, a `type: terra:overworld` TerraBlender region listing 20 landmass biomes (BoP biomes plus `icraft:cherry_river_valley`, `icraft:cherry_mountains`). Neither `minecraft:river` nor `minecraft:frozen_river` were in the biome pool, so whenever TerraBlender selected this region for a river parameter point, it substituted a landmass biome. With a region weight sum of ~128 and no river entries, rivers lost most biome-selection contests.

The zip was also a pre-built artifact with no `datapack_sources/` folder — it had been silently committed as-is without a source-tracked build, which is why the missing rivers were easy to miss during earlier loot/biome audits.

### Fix

- `config/tectonic.json` (all 3 distros): `ridge_scale 0.08 → 0.3`, `erosion_scale 0.1 → 0.4`. These are slightly above Tectonic's defaults (0.23 ridges, 0.375 erosion), biased toward more pronounced ridges and stronger river carving.
- `datapack_sources/bop_biome_weights/` created by extracting the existing zip, then `bop_custom_region.json` patched to prepend `minecraft:river` (weight 20) and `minecraft:frozen_river` (weight 6). Region rebuilt and redeployed to all 3 distros with identical MD5.
- `ocean_offset` left at `-0.35` — that's fine for overall ocean/land ratio and wasn't the issue.

### Tradeoff

Higher ridge_scale and erosion_scale will produce more dramatic vertical variation and more carved valleys, not just rivers. Mountain biomes will be taller and more cliffed; plains will feel less flat. If testers report terrain feels too chaotic, the walk-back is to lower ridge_scale toward 0.23 while keeping rivers in the biome pool. River biomes competing against BoP biomes at weight 20/6 means they should appear at ~20% of region parameter points, which may produce slightly more rivers than vanilla — acceptable since the goal was "more rivers and water" per the 2026-04-15 commit intent. New chunks only; existing worlds keep their river-less terrain.

---

## 2026-04-18 — Blank enchanted books in loot (persistent filter removal)

Tester feedback: enchanted books in chest loot were still appearing blank (no stored enchantments) despite the 2026-04-11 `.enchantWithLevels` fix.

### Root cause

Line 118-130 of `lootjs_overhaul.js` did a global `removeLoot('minecraft:enchanted_book')` before our tier re-adds. Per the 2026-04-15 LootJS persistent-filter discovery, `removeLoot('specific:item_id')` catches items re-added by **later** modifiers in the same evaluation pass. Our tier re-adds (lines 143, 155, 165, 175) were being caught by this filter — either stripped entirely or having their `.enchantWithLevels(...)` function eaten — leaving blank books in chests.

The 2026-04-11 fix correctly identified the signature issue (switched to `enchantWithLevels` with a proper `NumberProvider`) but the persistent-filter interaction wasn't discovered until a later LootJS audit (2026-04-15), at which point the namespace strips were removed for artifacts/celestial/relics — but this specific-item strip was missed.

### Fix

Deleted the global enchanted-book strip block. Vanilla loot tables now generate their own enchanted books (with Minecraft's native random enchant selection, at vanilla rates of ~5-10% depending on table), and our tier re-adds layer tier-scaled enchants on top at the per-dimension rates we want.

### Tradeoff noted in implementation

Combined rate per chest bumps up 5-10% vs. the old strip-and-replace model. Vanilla can roll enchantments we'd consider "too good for T1" (e.g. Sharpness V on Overworld chests). If that becomes a visible economy issue, the next step is a surgical per-enchantment filter rather than a blanket book strip.

---

## 2026-04-19 — Loot modifier REGEX audit (paths actually matched)

Follow-up to the namespace audit: verified each regex-based `addLootTableModifier` pattern by fetching the real mod jars and listing their `loot_tables/**/*.json` paths to confirm the pattern actually matches something. Found 4 regex misses that were modifying **zero tables**:

| Pattern | Problem | Fix |
|---|---|---|
| `/mes:.*chests.*/` | MES loot tables live at `data/mes/loot_tables/*.json` directly — no `chests/` subfolder | `/^mes:.+/` |
| `/structory:.*chests.*/` (2 uses) | Structory uses `extra/harvest/library/mood/outcast/ruin/` subfolders — no `chests/` | `/^structory:.+/` |
| `/villagesandpillages:.*chests.*/` (3 uses) | VnP uses singular `*_chest.json` under `village_witch/house/` — the regex required plural "chests" | `/^villagesandpillages:.+/` |
| `/^repurposed_structures:chests\/village_/` | RS uses plural `chests/villages/<biome>_house.json` | `/^repurposed_structures:chests\/villages\//` |

Net: every loot modifier regex now matches at least one real loot table in its target mod's jar. Confirmed via downloading and inspecting DungeonsArise, dungeons-plus, yungs-better-desert-temples, moogs-end-structures, structory, valhelsia-structures, villages-and-pillages, repurposed-structures, and explorations jars — jars deleted after inspection.

Other regex patterns verified as correct (they DO match):
- `/dungeons_arise:chests\/.*treasure/` — matches `chests/aviary/aviary_treasure` etc.
- `/dungeons_arise:chests\/heavenly_/` — matches `chests/heavenly_challenger/*` etc.
- `/dungeons_plus:chests\/.*\/common/` + `/rare/` — matches `chests/<dungeon>/common` pattern
- `/betterdeserttemples:.*(?:food_storage|storage|pot|wardrobe|lab|library|statue|tomb|pharaoh)/` — all keywords match real table paths
- `/repurposed_structures:.*chests.*/` (broad) — matches `chests/*` across 20+ subfolders
- `/valhelsia_structures:.*chests.*/` — matches `chests/{castle,forge,kitchen,miscellaneous,player_house,treasure,...}`
- `/explorations:.*/` — matches `chests/{campsite,desert_ruin,floating_island,jungle_temple,shrine,...}`

---

## 2026-04-19 — Loot modifier namespace audit

Audited all 122 `addLootTableModifier` / `addLootTypeModifier` calls in `lootjs_overhaul.js` against the installed mod list (`mods/.index/*.pw.toml`). Three real findings:

1. **Dead references — `overhauledstructures:`** (2 modifier blocks). Mod not installed. Deleted.
2. **Dead references — `lootintegrations:`** (3 modifier blocks). Mod not installed. Deleted.
3. **Namespace typo — `whendungeonsarise:` → `dungeons_arise:`**. Verified by fetching the DungeonsArise jar: actual datapack path is `data/dungeons_arise/loot_tables/...`. The old regex matched nothing.

Net: 5 dead modifier blocks removed, 1 typo corrected, -54 lines. Kept `blue_skies:`, `irons_spellbooks:`, `theabyss:` — initial audit pass incorrectly flagged these as uninstalled but the pw.toml filenames (`blue-skies.pw.toml`, `irons-spells-n-spellbooks.pw.toml`, `the-abyss-chapter-ii.pw.toml`) are hyphenated versions of underscored modids; all three are live.

Vanilla village modifiers (`minecraft:chests/village/*`) kept despite CTOV replacing most vanilla villages — they still hit biomes CTOV doesn't cover, and removing them would be a net coverage loss with no upside.

---

## 2026-04-19 — Tower spawn frequency bump (icraft_tower_overrides datapack)

New Paxi datapack `icraft_tower_overrides.zip` (source at `datapack_sources/icraft_tower_overrides/`) overrides structure_set placement for Apotheosis tome towers and TOTW Reworked towers. Loaded last in Paxi order so it wins over upstream:

| Structure | Before | After |
|---|---|---|
| `apotheosis:tower_main` | spacing 26, sep 15 | **20 / 12** |
| `apotheosis:tower_leaf/sand/spruce` | 26 / 20 | **20 / 14** |
| `totw_reworked:regular` | 62 / 35 (Waystone variant active) | **48 / 25** |

Apotheosis values confirmed by fetching `Apotheosis-1.20.1-7.4.8.jar` from the CurseForge CDN and reading the shipped structure_set JSONs. All 4 Apotheosis towers share loot table `apotheosis:chests/tome_tower`. Jar deleted after audit.

---

## 2026-04-19 — Sync pipeline fixes (phase0_sync.ps1 + sync_client.ps1)

Tester's server had `.icraft_last_sha` matching latest commit but 3 config files still at vanilla defaults (Majrusz damage_bonus 3.5/7/10 instead of 1.5/3/5 etc.). Root cause was two bugs in the diff-based sync:

1. **SHA marker written on errors.** If `Invoke-WebRequest` threw (404, timeout), try/catch caught it and incremented `$errors` but the SHA still got written at the end. Next run saw "up to date" and never retried the missed files.
2. **GitHub compare API cap.** The API caps `files[]` at exactly 300. Threshold of `> 300` meant a diff of exactly 300 was treated as complete but was actually silently truncated.

Both bugs applied to `phase0_sync.ps1` (server) and `sync_client.ps1` (client).

**Fixes (commits `c09f2ac7` + `616fb54c`):**
- Only write `.icraft_last_sha` when `$errors -eq 0`
- Treat `>= 300` files as truncated, fall back to full-zip download
- Full-zip overlay uses `robocopy /E` instead of `Copy-Item -Recurse -Force` (PS 5.1 has known quirks overwriting existing directory trees)
- Added `-Force` / `--force` / `/force` flag to `iridescentserver.bat/.sh` and `sync_client.bat` — deletes the SHA marker before sync to force a full-zip re-download

Also added `diagnose.ps1` + `diagnose.bat` in `server_distribution/` — one-shot diagnostic dump that captures `.icraft_last_sha`, key file hashes + contents, kubejs logs, and config values into `icraft_diagnostic.txt` for remote review when the server drifts from the repo.

---

## 2026-04-19 — Codex tier-gating: flag: → advancement:

The codex rendered correctly after the `modId="icraft"` fix, but tapping some categories showed "Loading error! (Hover for info) → Entry does not have a valid category". Cause: 6 categories + 36 entries used Patchouli's `"flag": "icraft:stage_tier_N"` field. Patchouli's `flag` field checks a config flag registered via `/patchouli flag` or `patchouli_flags` config — `icraft:stage_tier_N` was never registered with Patchouli, so the check always returned false, the gated categories stayed hidden, and entries referencing them were treated as orphaned.

**Fix:** replaced `"flag":` with `"advancement":` across all 6 categories and 36 entries. Patchouli's `advancement` field reads actual Minecraft advancements, and AStages already grants `icraft:stage_tier_2/3/4` as real advancements via `kubejs/data/icraft/advancements/stage_tier_*.json`. Same intent (chapters unlock per progression tier), but using the mechanism that's actually wired up.

Also disabled `show_progress` on the book (`"show_progress": false`) to fix the landing-page text/bar overlap — the codex is a reference guide not a progression tracker, and the progress bar was colliding with the `landing_text` "Chapters expand as you grow in power" line.

---

## 2026-04-19 — Loot fixes: glyph tiering, sapling cleanup, village accessories

Three tester-reported loot issues fixed in `lootjs_overhaul.js`:

### Glyph tiering — off-tier strip
T2+ glyphs were leaking into Overworld chests despite the dimension-scoped add modifiers. Added explicit per-dimension strips that remove glyphs above the current tier. Overworld strips T2+T3+T4 pools; T2 dims strip T3+T4; T3 dims strip T4. Runs on separate event chains from the adds to avoid LootJS's persistent-filter behavior catching re-adds in the same chain.

### Sapling removal from all chests
Saplings are clutter — trees are everywhere. Added `removeLoot('#forge:saplings')` + `removeLoot('#minecraft:saplings')` to the global Section 1B strip, covering vanilla + BoP + Aether + Blue Skies saplings in one pass.

### Village combat accessories — never spawned on modded villages
Tester reported never finding the village artifact pool items (power_glove, feral_claws, cross_necklace, etc.). Two fixes:
- Bumped `villageArtifactPerItemChance` from 8% combined to 15% combined.
- Added `moddedVillagePatterns` regex list (CTOV, VillagesAndPillages, RepurposedStructures village_*, Townstead) and applied the same sanitize + artifact-pool injection to those patterns. The old code only covered the 15 vanilla village loot tables; players spawning in CTOV villages never got any of the injected artifacts.

---

## 2026-04-19 — Codex "Invalid book" + blank enchanted books: BOTH root-caused

After extended thrash on these two bugs, the real root causes were found via bytecode inspection of Patchouli and vanilla Minecraft.

### Bug 1: "Invalid book: icraft:iridescent_codex" — modId mismatch

Patchouli's `BookRegistry.init()` iterates `ModList.get().getMods()`. For each mod, it scans a path computed as `"data/%s/%s"` formatted with `mod.getId()` + `"patchouli_books"` — i.e. `data/{modId}/patchouli_books/`. **The modId used for the scan is the mod's OWN modId from its mods.toml, not the namespace of the data directory.**

Our jar's modId was `iridescent_codex_data`, but our book.json lives at `data/icraft/patchouli_books/iridescent_codex/book.json`. Patchouli was scanning `data/iridescent_codex_data/patchouli_books/` which doesn't exist in our jar — the book was silently never registered on either client or server. That's why the tooltip showed "Invalid book: icraft:iridescent_codex" (item NBT says this book ID, Patchouli's registry has no such book, → fallback "Invalid book" text).

All the earlier fixes (lowcodefml → javafml, adding the KubeJS fallback, etc.) missed this because the registration LOOKED correct on paper but the scanner was pointing at the wrong directory.

**Fix:** changed the mod's modId from `iridescent_codex_data` to `icraft` in both `META-INF/mods.toml` and the `@Mod` annotation on `IridescentCodex.java`. Path now aligns: Patchouli scans `data/icraft/patchouli_books/`, finds `iridescent_codex/book.json`, registers the book as `icraft:iridescent_codex` — matching the NBT the codex_delivery.js script stamps on delivered books. Jar filename stays `iridescent_codex_data.jar` so custom-JAR allowlists (iridescentserver.bat, sync_from_repo.bat, update_mods.ps1) are unaffected.

### Bug 2: Blank enchanted books in chest loot

Vanilla Minecraft `EnchantmentHelper.enchantItem(random, stack, level, treasure)`:

```java
boolean isBook = itemStack.is(Items.BOOK);  // checks plain book, not enchanted_book
if (isBook) {
    itemStack = new ItemStack(Items.ENCHANTED_BOOK);
}
for (EnchantmentInstance instance : list) {
    if (isBook) {
        EnchantedBookItem.addEnchantment(itemStack, instance);  // writes StoredEnchantments NBT
    } else {
        itemStack.enchant(instance.enchantment, instance.level);  // writes Enchantments NBT
    }
}
```

Our loot modifiers were doing `LootEntry.of('minecraft:enchanted_book').enchantWithLevels(...)`. Because the input is already `enchanted_book` (not plain `book`), the function falls into the `else` branch and writes enchantments to the `Enchantments` NBT tag — which is for items that USE enchantments. Enchanted books DISPLAY from `StoredEnchantments`, so they appeared blank in-game despite actually having enchantment data elsewhere.

Vanilla loot tables always use `{"name": "minecraft:book", ...}` and rely on the function itself converting plain book → enchanted book; that's the only code path that writes to the correct NBT tag.

**Fix:** changed all 8 `LootEntry.of('minecraft:enchanted_book')` uses to `LootEntry.of('minecraft:book')` in `lootjs_overhaul.js` (4 tier re-adds + 4 structure-specific: TotW, Waystone Towers, Keebsz mid, Keebsz high). The `.enchantWithLevels(UniformGenerator.between(...), true)` calls now work correctly.

Synced to all 3 distros.

---

## 2026-04-19 — NecromancerEntity crash: add missing guard in mob_equipment.js

Log review of `kubejs/startup.log` (after user pushed 2026-04-18 22:27 session logs) showed the `NecromancerEntity.getItemBySlot ... is abstract` crash still firing every tick a Necromancer spawned. The 2026-04-06 fix added a `BROKEN_ENTITIES` guard, but only to `mob_scaling_unified.js` — `mob_equipment.js` was still hitting the same entity via `entity.mainHandItem` / `entity.getItemBySlot('chest')` in `hasExistingGear()`.

### Why the try/catch didn't save us

`hasExistingGear()` wraps the call in try/catch, but Rhino's JS `catch` does **not** catch `java.lang.Error` subclasses — `AbstractMethodError` propagates unwrapped, through to KubeJS's event handler which logs it.

### Fix

Added `MOB_EQUIP_BROKEN_ENTITIES` set at the top of `mob_equipment.js` (same two entries: `irons_spellbooks:necromancer`, `irons_spellbooks:archevoker`) with an early-exit guard before any item-slot access. Documented the cross-file sync requirement in both files.

Synced to all 3 distros.

---

## 2026-04-19 — Codex: rebuild as proper javafml mod (lowcodefml didn't register)

Tester confirmed via in-game Mods list that the `lowcodefml` codex jar **was loaded** (`State: done`) but Patchouli still reported "Invalid book: icraft:iridescent_codex". That rules out Forge-side loading and pins the issue on Patchouli's `BookRegistry.init()` scanner not iterating `lowcodefml` mods' `data/` the same way it does `javafml` mods. The KubeJS `data/` + `assets/` fallback from yesterday didn't help either — Patchouli's book registration scans mod jars only, not runtime-loaded data packs.

### Fix — javafml entrypoint with a minimal @Mod class

Mirrored the pattern of the existing working `iridescent_origins-1.0.0.jar`: added a compiled Java class at `com/iridescentcraft/codex/IridescentCodex.class` with `@net.minecraftforge.fml.common.Mod("iridescent_codex_data")` annotation.

Build pipeline changes (`datapack_sources/iridescent_codex/`):
- `src/com/iridescentcraft/codex/IridescentCodex.java` — 6-line `@Mod` entrypoint
- `stub/net/minecraftforge/fml/common/Mod.java` — annotation stub so `javac` can resolve `@Mod` without the Forge jar on classpath (stub class is NOT packed into the final jar)
- `build_codex.sh` — compiles both → extracts only `IridescentCodex.class` → packs jar → deploys

`META-INF/mods.toml` now uses `modLoader="javafml"` with `forge`/`minecraft`/`patchouli` dependencies (`patchouli` ordered `AFTER`, so the mod registers after Patchouli's plugin is available).

### Kept for safety

The KubeJS `data/` + `assets/` book content from yesterday's belt-and-suspenders fix stays in place. Harmless: byte-identical `book.json` with `use_resource_pack: true`, so any registration that happens to fire from a content reload matches the mod-jar registration. Can be cleaned up once testers confirm the javafml mod registers the book reliably.

---

## 2026-04-19 — Lootr aggressive_mode flipped off (village chests all vanilla)

Tester feedback: every village chest is generating as vanilla (not converted to Lootr per-player chests).

**Root cause:** `aggressive_mode = true` in `lootr-common.toml`. Lootr's own config comment: "aggressive mode may prevent certain chests from properly converted even though eligible." Per the earlier known-issue, this was already partially affecting spawn-adjacent chests; the village-wide symptom is the same mechanism at larger scale — village worldgen happens in parallel threads during initial chunk gen and aggressive mode is missing them.

**Fix:** `aggressive_mode = false` across all 3 distros. Non-aggressive mode checks all block entities naively during ticking — costs a small amount of TPS but converts reliably. Acceptable tradeoff for a small-tester server.

---

## 2026-04-18 (evening) — Iridescent Codex: restore KubeJS registration as fallback

Tester screenshot shows "Invalid book: icraft:iridescent_codex" still present after the morning's lowcodefml fix. Either `lowcodefml` doesn't expose the jar's `data/` to Patchouli's scanner the way a `javafml` mod does, or the client's `sync_client.ps1` size-diff missed the jar update — not worth debugging exhaustively.

### Fix — belt-and-suspenders registration

Restored the KubeJS `data/icraft/patchouli_books/iridescent_codex/book.json` and `kubejs/assets/icraft/patchouli_books/iridescent_codex/en_us/{categories,entries}/*` copies alongside the mod jar. Both sources ship an **identical** `book.json` (verified byte-for-byte, both `use_resource_pack: true`), so whichever registration path Patchouli honors, the book ends up registered with consistent config. Paxi zip (the one with mismatched `use_resource_pack` that was the original conflict source) stays deleted.

### Architecture note

Two registration paths, both benign if both fire:
1. Mod jar `data/icraft/patchouli_books/iridescent_codex/book.json` — registered at mod-load time (if lowcodefml works as expected for Patchouli)
2. KubeJS datapack `kubejs/data/icraft/patchouli_books/iridescent_codex/book.json` — registered during datapack reload (proven working per the 2026-04-16 log showing `iridescent_codex_resources.zip` as a loaded pack)

If the user still sees "Invalid book" after pulling this commit, the next debugging step is to have them check the in-game mods list for `Iridescent Codex` — its presence/absence will tell us if lowcodefml is the issue or if their client simply hasn't synced the new jar.

---

## 2026-04-18 — Iridescent Codex shipped as proper Forge content mod

Tester feedback: "Invalid book ID" error on world join (both singleplayer and dedicated server). Untabled from upstream input — diagnosed independently.

### Root cause

Four copies of `data/icraft/patchouli_books/iridescent_codex/book.json` existed, three of them reachable by Patchouli, with **inconsistent `use_resource_pack` config** between sources:

| Source | `use_resource_pack` | Loaded? |
|---|---|---|
| `mods/iridescent_codex_data.jar` (no `mods.toml`) | `true` | ❌ Forge ignored the jar — no mod descriptor |
| `kubejs/data/.../book.json` | `true` | ✅ KubeJS datapack |
| `config/paxi/datapacks/iridescent_codex.zip` | **missing (default false)** | ✅ Paxi datapack |
| `kubejs/kubejs/data/.../book.json` | `true` | ❌ KubeJS doesn't scan that nested path |

Patchouli resolved the book from whichever source won the load-order race, and server vs client could land on different winners — which is exactly the signature of "Invalid book ID" at NBT validation on join.

### Fix — proper Forge content mod

Added `META-INF/mods.toml` to the codex jar using the `lowcodefml` modLoader (Forge's data-only mod loader — no Java classes required). Forge now loads the jar at mod-load time and Patchouli registers `icraft:iridescent_codex` before any player NBT is validated on world join.

```toml
modLoader = "lowcodefml"
loaderVersion = "[47,)"

[[mods]]
  modId = "iridescent_codex_data"
  version = "1.0.0"
  displayName = "Iridescent Codex"
```

Build script `datapack_sources/iridescent_codex/build_codex.sh` picks up `META-INF/` automatically via its `jar cf . -C . .` step — no script changes needed.

### Removed duplicate registrations

- `config/paxi/datapacks/iridescent_codex.zip` (all 3 distros)
- `kubejs/data/icraft/patchouli_books/iridescent_codex/` (all 3 distros)
- `kubejs/assets/icraft/patchouli_books/iridescent_codex/` (all 3 distros)
- `kubejs/kubejs/data|assets/icraft/patchouli_books/iridescent_codex/` (orphaned, main only)

Single source of truth is now the mod jar. `codex_delivery.js` still handles first-join delivery and the backup crafting recipe.

### Known-issues tracker

Removed "Tabled pending upstream input" status — issue resolved without Vazkii/Sinytra guidance.

---

## 2026-04-18 — Revert Majrusz health_bonus, keep damage_bonus tuning

Follow-up tester feedback: the one-shot complaint was about incoming damage, not mob tankiness. Reducing HP made mobs feel too squishy without addressing the actual issue.

Reverted `mobs_spawn_stronger.health_bonus` to vanilla defaults across all three distributions:

| Stage | Previous (2026-04-17) | Reverted to |
|---|---|---|
| Normal | 0.25 | **0.5** |
| Expert | 0.5 | **0.75** |
| Master | 1.0 | **1.55** |

`damage_bonus` tuning (1.5 / 3.0 / 5.0), ScalingMobs cap, and Improved Mobs factors from 2026-04-17 remain in place — those directly address the incoming-damage issue.

---

## 2026-04-17 — Tiered damage tuning + Ars Nouveau glyph loot

### Tester feedback — full-iron players one-shotted on Overworld

Root-cause audit identified three compounding systems inflating T1 damage well past the 1.0x design envelope. Retuned each, keeping the tier architecture intact (Majrusz stage values, ScalingMobs cap, ImprovedMobs scaling factors).

#### Majrusz's Difficulty (`majruszsdifficulty.json`)
`mobs_spawn_stronger` tiered by game stage (Normal = T1-T2, Expert = T3, Master = T4):

| Field | Normal (was → now) | Expert (was → now) | Master (was → now) |
|---|---|---|---|
| `damage_bonus` | 3.5 → **1.5** | 7.0 → **3.0** | 10.0 → **5.0** |
| `health_bonus` | 0.5 → **0.25** | 0.75 → **0.5** | 1.55 → **1.0** |

Previously, Normal added +3.5 flat damage to every Overworld mob, pushing a baseline zombie from 3 to 6.5 damage and compounding with dimension multipliers in higher tiers (e.g. a Nether zombie at `(3 + 7) × 5 = 50` before armor).

#### ScalingMobs (`scaling_mobs/main.toml`)
- `Damage Scale Rate` 0.03 → **0.015** (per MC day)
- `Max Scaled Damage` `+inf` → **0.20** (hard cap at +20%)

Previously uncapped — by day 20 Overworld mobs were at +60% damage on top of Majrusz, negating the 1.0x tier design. The cap plus halved rate keep daily ramp modest.

#### Improved Mobs (`improvedmobs/common.toml`)
- `Equipment Addition` 0.15 → **0.05** (difficulty-scaled equipment chance)
- `Damage Increase Multiplier` 0.4 → **0.2** (difficulty-scaled damage factor)

### Ars Nouveau glyphs added to chest loot

Tester feedback: Ars Nouveau spell books appear useless (intentionally blank caster tools that require glyphs inscribed at a Scribes Table). Added tiered glyph pools to `lootjs_overhaul.js` so players build their spell toolkit alongside dimensional progression. Forms (projectile/touch/self/aoe) front-loaded in T1–T2 so spellbooks function from the start.

| Tier | Dimensions | Glyphs | Combined rate |
|---|---|---|---|
| T1 | Overworld | 18 (Forms + basic effects/augments) | ~12% |
| T2 | TF, Aether, Blue Skies | 25 (more forms, mobility, utility augments) | ~14% |
| T3 | Nether, Undergarden | 22 (advanced effects, linger form) | ~15% |
| T4 | End, Deeper Darker, Abyss | 12 (summons, rune, endgame augments) | ~18% |

Rolled independently per item (same pattern as the tiered artifact pools).

### Verification note — "blank books" (Ars Nouveau fix in place)

Vanilla enchanted book fix (2026-04-11 `.enchantWithLevels`) is still in place at all 8 call sites; the "blank books" tester complaint refers to Ars Nouveau spell books, now addressed by the glyph loot injection above.

---

## 2026-04-14/15 — Stable alpha: loot finalization, worldgen tuning, distro tooling

### Ars Nouveau Bytecode Patch
- Ars Nouveau's `dungeon_loot` GLM injection disabled via bytecode patch (compiled JAR modification)
- Complementary Ars GLM override: `dungeon_loot.json` with 0% chances deployed via both Paxi datapack and KubeJS to ensure no Ars loot leaks through

### Tiered Artifact Rates Finalized
- Village chests: 8% combined artifact rate
- T1 (Overworld): 10%
- T2 (Twilight Forest, Aether, Blue Skies): 12%
- T3 (Nether, Undergarden): 14%
- T4 (End, Deeper Darker, Abyss): 16%

### LootJS Persistent Filter Discovery
- `removeLoot(@namespace)` in LootJS catches items re-added by earlier modifiers in the same evaluation pass
- Global strip for `@artifacts`, `@celestial_artifacts`, `@relics` removed — persistent filter was stripping the tiered re-injections immediately after adding them
- These mods now rely on GLM whitelist + Ars bytecode patch instead of LootJS strip

### Village Pool Fix
- Village loot strip now only removes T1 items that are NOT in the curated village artifact pool
- Prevents the strip phase from undoing the village-specific artifact injection

### Kitty Slippers Removed
- Kitty Slippers removed from all loot pools — conflicts with origin flight design (creeper aggro cancellation interacts poorly with flying origins)

### Lootr Configuration
- `aggressive_mode` set back to `true` in Lootr config (was temporarily disabled during debugging)

### Snow Biome Reduction
- Tectonic `temperature_offset` set to 0.15 (shifts biome temperature warmer, reducing snow biome frequency)
- BOP snow biomes disabled in config

### Water Worldgen Increase
- Tectonic overrides: `ridge` 0.08, `ocean` -0.35, `erosion` 0.10
- Results in more rivers, larger oceans, and more varied terrain erosion

### Bug Fixes
- Tower curio loot: fixed `[0.12]` remnant probability notation (was being parsed as item count, not percentage)
- Battle Tower loot: `withNBT()` replaced with `Item.of()` constructor (withNBT silently failed on some item types)
- Source_gem (`ars_nouveau:source_gem`): `limitCount` fix to prevent excessive stack generation

### Distribution Tooling
- `verify_distros.ps1` and `verify_distros.bat` added with `-Fix` auto-copy mode for automated distribution sync verification
- 21 missing distro files discovered and synced across all three distributions

### Custom Patched JARs
- Patchouli and Ars Nouveau now ship as custom bytecode-patched JARs (added to custom JAR allowlist in server scripts)

---

## 2026-04-12 — Loot system overhaul: tiered artifacts, village sanitization, battle towers

### Tiered Artifact Loot System
- Implemented global strip + per-dimension re-injection architecture for artifact/curio items
- Section 1B of `lootjs_overhaul.js` strips ALL items from `@artifacts`, `@celestial_artifacts`, `@relics`, `@ars_nouveau`, `@irons_spellbooks` from ALL chest loot globally
- Section 1C re-injects curated artifact pools at tier-appropriate rates per dimension: T1 (Overworld, ~5% combined, utility/movement items), T2 (TF/Aether/Blue Skies, ~8% combined, combat/defensive), T3 (Nether/Undergarden, ~10% combined, powerful offense), T4 (End/Deeper Darker/Abyss, ~12% combined, endgame power)
- Ars Nouveau spell books re-added after global strip: Novice (OW 5%), Apprentice (T2 5%), Archmage (T3 3%, T4 5%)
- `global_loot_modifiers.json` uses `"replace": true` to whitelist only specific GLM entries; all unlisted mod GLMs (including `rpgseteffects:loot_injection/*`) are inert

### Token Removal from Chests
- Full tier tokens (T1-T4) removed from chest loot; only boss fragments remain as the chest-based progression path
- Boss kills remain the primary source of full tokens; 10-boss-kill and 1000-fragment tier unlock paths preserved

### Village Chest Sanitization
- Village chests receive a curated 25-artifact pool at ~4% combined rate (Section 6), replacing stacked GLMs that produced ~25-30% artifact rates
- Diamond gear, enchanted books, and enchanted golden apples stripped from village chests
- Iron gear stripped from village chests to prevent early-game equipment flooding

### Battle Tower Consumable Pool
- Battle tower chests receive a consumable pool with potions, arrows, food, and utility items scaled to the tower's tier
- Replaces default vanilla loot that was either too generous (diamonds) or useless (string, bones)

### Class Artifacts Integration
- Epic RPG: Class Artifacts (`rpgseteffects:`) integrated as drops-only system
- Native loot GLMs blocked via `replace: true` whitelist; LootJS re-adds at controlled rates with tier gating
- Fragment Core: 4% from any hostile mob; Relics: 0.4%-1.0% per chest by tier; Pouches: T2+ boss drops; Awakenings: T4 boss direct drops at 0.7% each

### Infrastructure and Bug Fixes
- Patchouli bytecode patch: `athrow` -> `pop` instruction swap to fix crash in Patchouli book rendering
- Snow fix: `generate_snow_ice=false` in server.properties to prevent snow layer generation issues
- ArchevokerEntity added to `BROKEN_ENTITIES` list in `mob_scaling_unified.js`
- `.minecraft` directory rename resolution for PrismLauncher compatibility
- Equipment Compare fully removed (JAR, pw.toml, config) from all three distributions — broke shift-expand tooltips for Relics, Mekanism, Tag Viewer, Jade
- Dungeon Crawl spacing increase via config + Chunky auto-pregen on first world load (radius 1500)
- Phase 0 diff-based sync with SHA check to skip redundant downloads
- Server self-update mechanism (bat/sh can now update themselves via Phase 0.5)

---

## 2026-04-12 — iridescentserver bat/sh now self-updates

### Self-Update Mechanism
- Previously `iridescentserver.bat` and `iridescentserver.sh` were self-excluded from the Phase 0 overlay — meaning the self-updater couldn't update itself. Any fix to Phase 0 required the server operator to manually replace the bat file before the fix took effect
- New behavior: Phase 0 SHA1-compares the incoming bat/sh against the current version. If they differ, stages the new file as `iridescentserver.bat.new` / `.sh.new` alongside the current one
- Immediately after Phase 0, a Phase 0.5 block checks for the `.new` file:
  - **Windows (`.bat`):** invokes PowerShell to `Move-Item -Force` the `.new` over the current bat (works on Win10+ because cmd.exe holds the bat with `FILE_SHARE_DELETE`), then `Start-Process` launches a new cmd.exe with the updated bat, then `exit /b 0` terminates the original cmd
  - **Linux (`.sh`):** plain `mv -f`, `chmod +x`, then `exec` replaces the current process with the updated script, inheriting args
- **One-time manual step required** to transition to this system: the operator must manually copy the new `iridescentserver.bat/.sh` to their server **once**. After that, all future updates happen automatically

### Why It's Safe to Overwrite a Running Bat
- On Windows 10+, cmd.exe opens batch files with share modes that include `FILE_SHARE_DELETE`, so another process can delete or rename the file while cmd holds it open. The existing handle continues to reference the old file content, allowing cmd to finish reading its current line, then exit cleanly. The relaunched cmd.exe opens the new file from scratch
- On Linux, `exec` replaces the process image entirely — the kernel loads the new script fresh, no handle issues

---

## 2026-04-12 — Server Phase 0 paxi datapack verification pass

### Root Cause
- `icraft_loot_overrides.zip` (549K, Apr 10) and `icraft_progdiff_overrides.zip` (14K, Apr 8) were failing to deploy to the tester's dedicated server during `iridescentserver.bat` Phase 0 overlay, even though the files existed in the repo and `sync_client.ps1` was deploying them correctly to the client
- `/datapack list` on the running server confirmed neither zip was loaded by Paxi — all older paxi zips (Mar 19) were active
- Most likely cause: PowerShell 5.1's `Copy-Item -Recurse -Force` hitting some mid-tree condition (large file, write lock, timing) and silently aborting the remainder of that recursion. The two newest files happened to be the last ones reached in the directory walk

### Fix
- Added an explicit verification pass after the main overlay in `iridescentserver.bat` Phase 0 (and `iridescentserver.sh` for parity)
- New logic: enumerate every `.zip` in `$src/config/paxi/datapacks/`, check if the destination file exists AND has matching byte count; if not, force-copy individually
- Also force-copies `datapack_load_order.json` in the same block so stale load orders can't persist
- Belt-and-suspenders — if the main Copy-Item / cp -rf pass works correctly, the verification pass is a no-op. If the main pass drops files, the verification pass catches them

### Stale Load Order Cleanup
- `datapack_load_order.json` had 8 duplicate entries (no-extension variants) that Paxi always reported as missing, plus 3 entries for removed mods (iridescent_origins — now a JAR, champions_datapack — Champions removed, and their `.zip` variants). Removed all 11 stale entries, added 4 missing ones (tetra_materials, tetra_overrides, aethersteel_overrides, progdiff_overrides)

---

## 2026-04-11 — PrismLauncher pre-launch client sync

### SHA-Check Sync Script for Testers
- Added `sync_client.ps1` + `sync_client.bat` wrapper in both `minecraft/` (dev instance) and `minecraft/distribution/client/` (tester install source)
- Script logic: detect instance via `$env:INST_MC_DIR` (PrismLauncher provides it) → hit GitHub API for latest main commit SHA → compare to `.icraft_last_sha` → if match, exit fast; if differ, download zip, overlay non-runtime dirs (config/kubejs/global_packs/datapack_sources/defaultconfigs/patchouli_books/resourcepacks/shaderpacks), mirror mods/.index, invoke download_mods.ps1 for new JARs
- Preserved: world/, logs/, crash-reports/, backups/, libraries/, mods/*.jar, options.txt
- Failure handling: 10s API timeout + 60s zip timeout, graceful fallback on any error ("Continuing with existing files..." + exit 0). Network hiccups never block a play session
- `install.ps1` updated to copy both sync_client files into the instance's `.minecraft` during initial install

### Two Sync Modes (Protocol 8)
- **Mode A (dev):** `git -C "%INST_DIR%" pull --ff-only` as pre-launch — works because Silvaria's instance is a GitHub Desktop clone of the repo. Instant, git-native
- **Mode B (testers):** `powershell -ExecutionPolicy Bypass -File "%INST_MC_DIR%\sync_client.ps1"` — SHA-check path for installed-not-cloned instances
- New `wiki/protocols/8-client-sync.md` documents both modes, install location, failure behavior, and exclusion list

---

## 2026-04-11 — Awakening tuning: halved rate, T2 locked out

### Pouch Reverted to Normals-Only
- `kubejs/data/rpgseteffects/loot_tables/items/artifact_piece_pouch.json` now contains only the 14 normal artifacts (weight 10 each). Awakenings removed entirely from the pouch pool
- **Why:** pouches are item-keyed loot tables, so the same pouch item behaves identically regardless of drop source. To guarantee T2 bosses can't produce awakenings even indirectly, awakenings had to move off the pouch

### Awakenings = T4 Direct Drops, Halved Rate
- Each of 14 awakenings rolled independently at **0.7%** per T4 boss kill (5 bosses: Ender Dragon, Ender Guardian, Harbinger, Shattered, Watcher)
- Combined any-awakening chance per T4 boss ≈ **9.3%** (down from ~30.5% when pouches held them)
- T4 bosses still drop 2 pouches for normal artifact variety

### T2 Awakening Lockout
- T2 boss kills now yield 0% awakening drops (only normal artifacts via single pouch). Matches user tuning request

---

## 2026-04-11 — Class Artifacts loot table audit + pouch awakening merge

### Boss Entity ID Corrections
- **Fixed `alexscaves:entities/revenant`** → `alexscaves:entities/atlatitan`. The `revenant` ID doesn't exist in Alex's Caves; I invented it. Audited against the mod jar's loot_tables/entities/ directory and swapped to `atlatitan` (a real Primordial Caves mini-boss)
- **Fixed `deeperdarker:entities/warden_shrine`** → `deeperdarker:entities/shattered`. `warden_shrine` is a **structure**, not an entity. Cross-referenced with the canonical boss list in `loot_discovery.js.disabled` (`stalker`, `shattered`, `shriek_worm`, `sculk_centipede`, `sculk_leech`) — `shattered` is Deeper Darker's named boss
- **Verified `alexscaves:entities/watcher`** is valid (I initially flagged it, but it's a real Abyssal Chasm entity)

### Awakenings Merged into Pouch Loot Table
- Overrode `rpgseteffects:items/artifact_piece_pouch` via KubeJS virtual datapack at `kubejs/data/rpgseteffects/loot_tables/items/artifact_piece_pouch.json`
- Pool: 14 normal artifacts at weight 10 + 14 awakening variants at weight 2
- Opening a pouch now has ~17% chance of an awakening (28 total weight, 28 awakening weight out of 168)
- **Design rationale (from user suggestion):** "awakened versions could be good additions to boss loot pouches" — unified acquisition path. Every boss pouch has a chance at awakening, no separate direct-drop path needed
- **Removed direct awakening drops from T4 bosses** (were 14 individual 1.4% chances per boss). Replaced with: T4 bosses now drop **2 pouches** instead of 1, giving ~34% chance of at least one awakening per T4 boss kill, vs ~17% at T2
- AStages T4 gate on awakenings still prevents pre-endgame equipping — a T1 player lucking into an awakening from a T2 pouch just holds it as a trophy until they unlock T4

---

## 2026-04-11 — Epic RPG: Class Artifacts integration (drops-only, tier-gated)

### New Mods
- **Epic RPG: Class Artifacts** (`rpgseteffects:`, forge 2.0.5) — 14 class-themed curios each with an Awakening variant, plus 25 standalone Relics. Items added to all three distributions
- **XP: Attribute Core** (`attributecore:`, 2.0.3) — required dependency. Adds ~20 RPG attributes (life_steal, crit_chance, crit_damage, dodge_chance, aoe_healing, golden_guard, extra_jumps, stealth, poison_damage, pet stats, etc.)
- **Note:** Attribute Core's attributes exist alongside Puffish Attributes (which we use for magic_damage sync). Long-term plan is the Iridescent Attributes consolidation library — see Roadmap / Iron's Spells entry area

### Drops-Only Design
- **Recipe strip:** `kubejs/server_scripts/compat/class_artifacts_recipes.js` removes all 14 awakening upgrade recipes + magic_leather + artifact_piece_pouch + relics_to_fragment_smelting. No crafting paths remain
- **LootJS injection in `lootjs_overhaul.js` SECTION 8.5:**
  - Fragment Core: 4% drop from any `@monster`
  - 7 T1 Relics: ~0.4% per chest in Overworld / Twilight Forest
  - 8 T2 Relics: ~0.6% per chest in Blue Skies / Aether
  - 7 T3 Relics: ~0.8% per chest in Nether / Undergarden
  - 4 T4 Relics: ~1.0% per chest in End / Deeper Darker / Abyss
  - Artifact Piece Pouch: guaranteed drop from 7 T2+ boss tables (Naga, Lich, Hydra, Ignis, Slider, Summoner, Revenant). The pouch's internal table picks one of the 14 normal artifacts on open
  - Awakening artifacts: 1.4% drop from 5 T4 boss tables (Ender Dragon, Ender Guardian, Harbinger, Warden Shrine, Watcher) — each awakening has independent roll
- **Native GLMs blocked:** `rpgseteffects:loot_injection/{overworld,nether,end,treasure}_artifacts` are never whitelisted in our `global_loot_modifiers.json` `replace: true` list, so the mod's aggressive auto-injection (100% pouch in treasure chests, ~72% relic in overworld chests) is inert

### Config Pre-Seed
- `rpgseteffects-common.toml`: disables the mod's parallel elite-mob system (`ELITE_CHANCE_TIER_1/2/3 = 0`, `ELITE_SHOW_BOSS_BAR = false`). IridescentCraft uses Majrusz's Progressive Difficulty for elite enemies; running both would create redundant skull-marked mobs with competing boss bars

### AStages Tier Gating
- All 14 normal artifacts + `artifact_piece_pouch` → T2 (`modpack/item_t2`). T1 players can pick up but not equip
- All 14 awakening artifacts → T4 (`modpack/item_t4`). Prevents early-game lottery wins from T4 boss drops

### Keybind Fix
- Journeymap `map_toggle_alt` unbound from `J` (now `key.keyboard.unknown`) so Class Artifacts' inventory menu (default J) doesn't conflict. Journeymap's primary toggle is still `M`

### Long-Term Roadmap Addition
- Added "Iridescent Attributes Library (post-1.0)" to `wiki/roadmap/planned.md` — goal is to unify Puffish + Attribute Core + Apotheosis attribute concepts under one namespace with a shim that lets mods like Class Artifacts still resolve the attributes they expect

---

## 2026-04-11 — Village artifact rate rework

### Flat 4% Village Artifacts
- Removed 11 `artifacts:inject/chests/village/*` GLM entries + `celestial_artifacts:chests/village_plains_house` from `kubejs/data/forge/loot_modifiers/global_loot_modifiers.json`
- **Why:** stacked GLMs were producing ~25-30% artifact rates with 1-2 artifacts per chest, far above the target of 4% flat
- Added curated pool of 25 artifacts in `lootjs_overhaul.js` (section 6), each rolled at 0.16% per village chest for ~4% combined rate
- **Excluded artifacts:** `artifacts:plastic_drinking_hat`, `artifacts:novelty_drinking_hat` (user dislike); a "horse one" is also to be excluded pending user identification
- Applies to all 15 village chest types (smith, house, temple, tannery, fisher, shepherd, butcher, cartographer, mason, etc.)
- Side benefit: reduces load spike on chest open by cutting the per-chest GLM chain from ~14 modifiers down to our single LootJS modifier

---

## 2026-04-11 — Equipment Compare full removal + Chunky auto-pregen

### Equipment Compare Purged
- Removed lingering `.pw.toml` metadata and `equipmentcompare-common.toml` from all three distributions (main instance, server_distribution, distribution/client). A previous commit dropped the JAR but left metadata, which would have caused `update_mods.ps1` to re-download on next server launch
- **Reason:** Equipment Compare's shift-hold tooltip handler intercepted the tooltip render pipeline and broke shift-expand for Relics research tooltips, Mekanism details, Tag Viewer, and Jade details. All four were frozen on "Hold Shift..." prompts with no response

### Chunky Auto-Pregen on First World Load
- Added `kubejs/server_scripts/pregen/auto_chunky.js` — ServerEvents.loaded hook that runs `/chunky start` around spawn (radius 1500, dimension minecraft:overworld) exactly once per world, tracked via `server.persistentData.icraft_chunky_pregen_started`
- Set `config/chunky/config.json continueOnRestart: true` in all three distributions so interrupted pre-gens resume automatically
- chunky-player-pause keeps the task off the main thread while players are online
- Protocol 7 updated to document the automatic trigger
- **Why:** prevents recurrence of the 115s main-thread stall from 2026-04-10 by generating all structure-dense chunks (including Dungeon Crawl multi-node dungeons) in the background before testers walk into them

---

## 2026-04-11 — CurseForge download URL fallback order

### forgecdn.net Preferred Over curseforge.com/api/v1
- `update_mods.ps1`, `server_install.ps1`, `update_mods.sh` now try `edge.forgecdn.net/files/<part1>/<part2>/<filename>` **first**, with `curseforge.com/api/v1/mods/<projectId>/files/<fileId>/download` as fallback
- Previously api/v1 was used whenever projectId was present, with forgecdn only as a last resort when projectId was missing — backwards from what works
- **Why:** api/v1 frequently returns 403 for automated scripts without an API key. forgecdn is the actual CDN and has no auth requirement
- Triggered by Iron's Patreon Library (`irons_patreon_lib-1.20.1-1.0.1.jar`, file-id 7830104) failing to download
- Both scripts now walk a candidate URL list per mod and move on to the fallback if the first URL returns a non-jar response
- Added `Mozilla/5.0 IridescentCraft-Updater` User-Agent to download requests
- Client-side scripts (`distribution/client/download_mods.ps1`, `install.ps1`) already used forgecdn first — only server-side scripts had the wrong order

---

## 2026-04-11 — Server self-update SHA check

### SHA-Based Self-Update
- `iridescentserver.bat` / `iridescentserver.sh` Phase 0 now hits the GitHub API (`/repos/.../commits/main`) to get the latest commit SHA before doing anything
- Compares against `.icraft_last_sha` stored in the server directory. If they match, skips the zip download entirely and prints "Up to date (commit abc1234)"
- If different (or no stored SHA), downloads + extracts + overlays as before, then records the new SHA
- **Why:** every launch was re-downloading the full repo zip even when nothing had changed, adding 30s–2min of startup overhead. SHA check is a ~200ms API call
- `sync_from_repo.bat` / `sync_from_repo.sh` now exclude `.icraft_last_sha` and `.icraft_server` from the mirror so local state isn't wiped
- Note: `update_mods.ps1` was already diff-based; the slow step was Phase 0 itself, not mod downloads

---

## 2026-04-11 — Enchanted book loot fix + LootJS parse error + DC debug spam

### LootJS Overhaul Was Failing to Parse
- `kubejs/server_scripts/loot/lootjs_overhaul.js:1292` had an unescaped apostrophe inside a single-quoted string (`'Iron's Spellbooks ...'`), which terminated the string early and produced `rhino.EvaluatorException: missing ) after argument list`
- Effect: the **entire** loot overhaul file failed to load on the server. No structure-chest cleanup, no enchanted-book re-adds, no token injection, no clutter cleanup, no village restrictions ever ran
- Fixed by switching that line to a double-quoted string
- Discovered while diagnosing the blank enchanted book report — the books were a downstream symptom of the parse failure, not just the `applyLootFunction` issue (that fix is still correct and now actually runs)

### Dungeon Crawl Debug Logging Disabled
- `config/dungeon_crawl.toml`: `extended_debug` flipped from `true` → `false` in all three distributions
- Reason: DC debug spam (`Building dungeoncrawl:default/multipart/node_connector...`) flooded the server log during structure generation. Removing it cuts log noise and reduces overhead during dungeon worldgen
- Discovered while investigating a 115-second main-thread stall on 2026-04-10 caused by DC generating a multi-node dungeon while a tester was nearby

### Blank Enchanted Books
- `kubejs/server_scripts/loot/lootjs_overhaul.js` T1–T4 enchanted-book re-adds now use `.enchantWithLevels(min, max, treasure)` instead of `.applyLootFunction({function:'minecraft:enchant_with_levels', ...})`
- Reason: LootJS 2.x silently discards loot functions passed as plain JSON, so books were being placed with no `StoredEnchantments` tag — visible tooltip but zero enchants
- Affected tiers: Overworld (10–25), TF/Aether/Blue Skies (15–30), Nether/Undergarden (20–30), End/Deeper Darker/Abyss (30)

---

## 2026-04-09 — Server bat improvements, NPC debug text fix

### Server Bat Improvements
- Server bat now creates a dedicated folder for server files
- Cleaner separation of server runtime from repo files

### NPC Debug Text Fix
- Fixed NPC debug text showing in Jade tooltips (Jade + MCA interaction)
- Debug info no longer leaks into player-facing UI

---

## 2026-04-08 — FTB removal, Progressive Difficulty, treasure bags, tick consolidation, server optimization

### All FTB Mods Removed (8 mods)
- Removed: FTB Backups, FTB Chunks, FTB Essentials, FTB Library, FTB Quests, FTB Ranks, FTB Teams, FTB Ultimine
- Replacements: FastBack (git-based backups), LiteMiner + Amber (veinmining), Open Parties and Claims (chunk claiming)

### Majrusz's Progressive Difficulty Added
- Majrusz's Progressive Difficulty + Majrusz Library added
- Three-stage difficulty: Normal (T1-T2), Expert (T3, triggered on Nether entry), Master (T4, triggered on Dragon kill)
- Treasure bags rewritten for all 7 bosses/events with tier-appropriate loot
- Creeperlings disabled, bleeding kept (symmetrical design), Enderium removed

### Tick Handler Consolidation
- Reduced from 35 tick handlers to 2 master handlers in `0_tick_master.js`
- Significant reduction in per-tick overhead

### KubeJS Error Fixes
- Fixed Ignis Core TypeError
- Fixed `getItemSlot` usage (not in KubeJS 6 API)
- Fixed `source.type.includes` on non-string values

### Village Artifact Rates Boosted
- Smith chest artifact rate: 0.5% -> 5%
- House chest artifact rate: 0.5% -> 3%

### Stale Mod JAR Cleanup
- Added stale mod JAR cleanup to `sync_from_repo` script
- Old/renamed mod JARs no longer persist after sync

### Server Properties Optimized
- Entity broadcast range: 65% (down from default)
- Simulation distance: 4 chunks
- View distance: 6 chunks

---

## 2026-04-07 — Champions removed, Lootr aggressive mode

### Champions Mod Removed
- Champions Unofficial removed entirely from the modpack
- Broken rank config system that could not be fixed
- Unmaintained mod with no upstream activity
- Server lag from error spam on every mob spawn event

### Lootr Aggressive Mode
- Enabled `aggressive_mode` in Lootr config
- Forces more consistent per-player loot chest generation

---

## 2026-04-06 — NecromancerEntity crash fix, PowerShell script fixes

### NecromancerEntity Crash Fix
- NecromancerEntity from a broken mod caused server crashes during mob scaling
- Added `BROKEN_ENTITIES` early-exit list in `mob_scaling_unified.js`
- Entities in the list are skipped before any scaling logic runs

### Trans Flag Banner PowerShell Fix
- Fixed trans flag banners for PowerShell 5.1 compatibility
- Replaced backtick-e escape (`\`e`) with `$([char]27)` for ANSI codes
- Backtick-e only works in PowerShell 7+; 5.1 needs explicit char cast

### Non-ASCII Character Fix in PS1 Files
- Em-dashes and other non-ASCII characters broke PowerShell 5.1 parsing
- Replaced all non-ASCII characters with ASCII equivalents in `.ps1` files

---

## 2026-04-05 — Tetra Attribute Rebalancing removed

### Tetra Attribute Rebalancing Removed
- Mod delisted from CurseForge (no longer available for download)
- Was already broken by Tetra 6.13.0 mixin changes (rolled back to 6.12.0 on 2026-04-03)
- Removed from mod index, distributions, and force-skip lists

---

## 2026-04-04 — New mods review, mob HP scaling, spell scroll fix, tower loot

### New Mods Reviewed + Duplicate Cleanup
- Removed 3 duplicate mod index entries: Origins (Fabric dupe), CTOV dupe, Pufferfish Skills dupe
- Fixed Sleep Hunger: wrong version (NeoForge 1.21.1 -> Forge 1.20.1)
- Added Iron's Patreon Library (new required dep for Iron's Spellbooks 3.15.5.1)
- Re-removed Connected Glass + Trash Cans (still depend on SuperMartijn642 libs)
- Synced 20 new mod .pw.toml files to server + client distributions

### Mob Tier HP Scaling (NEW SYSTEM)
- Basic mobs (zombie, skeleton, spider, creeper, etc.): 3x HP — zombie now 60 HP
- Mid-tier mobs (blaze, wither skeleton, TF/Aether/Blue Skies mobs, dungeon mobs): 1.5x HP
- Champions: 1.25x HP (stacks on top of Champion affixes)
- Bosses: 1x (unchanged, custom HP via boss_hp.js)
- Catch-all: any unlisted hostile mob defaults to 3x
- Stacks multiplicatively with dimension_scaling.js and ascension.js

### Spell Scroll Fix
- Bare `irons_spellbooks:scroll` items dropped with no spell ("None" scrolls)
- Added `irons_spellbooks:randomize_spell` custom function to all scroll loot entries
- Quality ranges: T1 0.0-0.3, T2 0.2-0.5, T3 0.3-0.7, T4 0.5-1.0

### Waystone Tower Loot + ToTW Worldgen
- Waystone Towers now share ToTW loot (curios, artifacts, scrolls, ink, spell books)
- Waystone Towers use minecraft:chests/stronghold_corridor — added to ToTW LootJS sections
- ToTW spawn frequency increased: regular spacing 62->45, derelict 55->42

---

## 2026-04-03 — Tetra 6.13.0 rollback, Heracles quest fix, distribution updates

### Tetra 6.13.0 → 6.12.0 Rollback
- Tetra 6.13.0 broke TSB (ModuleModel class removed), Tetra Attribute Rebalancing (mixin injection fail), and module model deserialization ("no deserializer for type: static")
- Attempted binary bytecode patch for TSB — failed due to Forge module classloading restrictions
- Art of Forging downgraded 1.8.5 → 1.8.4 (1.8.5 caused MaterialData NPE on 6.12.0)
- All Tetra addons confirmed working on 6.12.0

### Heracles Quest Fix
- First Blood quest copied to config/heracles/quests/main/ (global path, works for existing worlds)
- defaultconfigs/ only applies on new world creation

### Distribution + Script Updates
- Trans flag banners added to all .bat and .sh scripts (ANSI RGB via Console.Write/echo -e)
- Missing .sh counterparts created: strip_client_mods.sh, update_configs.sh
- Public GitHub wiki Home page links fixed (file paths → [[Page Name]] wiki syntax)

---

## 2026-04-01 — Origins++ port, JustLeveling redesign, Heracles POC, loot/artifact overhaul

### Origins++ → icraft Namespace Port
- All 6 Origins++ origins/races fully ported to `icraft` namespace (80 powers, 15 mcfunctions, 3 tags)
- Origins++ mod removed as dependency — all data self-contained in Iridescent Origins mod
- Iridescent Origins now builds as a proper Forge mod via Gradle (compiled @Mod class)
- Origin layers must live under `data/origins/origin_layers/` (Origins Forge only scans that namespace)
- Missing race powers created: Ryu (slow_fall, meat_preference, food_healing), Fallen Angel (slow_fall, damage_bonus, meat_preference)
- All 37 ported powers given names/descriptions or set to hidden
- `origins:falling` condition doesn't exist in Origins Forge — removed from slow fall powers (always-on Slow Falling effect)

### JustLeveling Fork Overhaul
- Lock items list cleared entirely — AStages handles all item/tier gating
- 24 skills redesigned across 8 aptitudes (10/20/30 unlock levels):
  - STR: One Handed / Hemorrhage / True Strength
  - CON: Hearty Meals / Overflow / Iron Stomach
  - DEX: Fleet of Foot / Rapid Fire [WIP] / Excitement
  - DEF: Second Wind / Turtle Shield / Lion Heart
  - INT: Haggler / Potion Manipulation / Enlightenment
  - BLD: Obsidian Smasher / Resourceful [WIP] / Master Craftsman [WIP]
  - MAG: Arcane Efficiency [WIP] / Spell Attunement / Mystic Ward
  - LCK: Lucky Strike / Fortune's Favor / Motherlode [WIP]
- 13 skills implemented via KubeJS (justleveling_skills.js)
- Mastery tax system: quadratic XP drain for aptitude breadth beyond 32 total levels
- Lang overrides rename all skills in the UI
- Scholar skill disabled (enchanting no longer level-gated)

### Heracles Quest Mod (Proof of Concept)
- Heracles (Odyssey Quests) 1.1.13 added to modpack
- Proof-of-concept integration chain: Quest → command reward → advancement grant → Codex entry unlocks
- "First Blood" quest: kill 1 zombie → unlocks Combat Guide in Codex
- Advancements use `trigger: minecraft:impossible` (only grantable via command)

### Loot & Artifact Overhaul
- Village loot tables overridden via Paxi datapack (kubejs/data doesn't override loot tables on Forge)
- Village food reduced to weight 1 / count 1, seeds/plants reduced, T1 materials added (iron nuggets, raw copper, string, leather, torches)
- 2.5% spell scroll chance in village chests
- Artifact injection rates tiered via loot table overrides: ~1% village, ~5% overworld structures, ~10% endgame
- Artifacts mod `artifact_rarity` config is overwritten on startup — bypassed via datapack loot table overrides
- `Ingredient.custom()` silently fails in LootJS — all instances replaced with `@mod` syntax
- Tower loot: diamonds/manasteel removed, guaranteed magic scroll + 40% second scroll
- RFTools/Mahou items removed from chest loot via `@mod` syntax

### Codex Overhaul
- Complete rebuild for 3-layer system: 37 entries (3 overviews + 13 origins + 11 races + 10 classes)
- All multi-page entries condensed to single pages (85 entries total — second pages rendered as broken textures)
- Race/origin stats verified against actual power JSON values
- Welcome guides updated for 13 origins / 11 races / 10 classes

### Combat & Spawn
- Spawn protection zone (64 blocks): hostile mob spawns cancelled, existing hostiles killed every 5s
- Cute Villagers UV fix: non-integer UVs (89.1/93.1) rounded to integers for EMF compatibility

### Technical Discoveries
- Forge 1.20.1 ignores pure datapack JARs in mods/ — needs compiled @Mod class
- `kubejs/data/` does NOT override loot tables on Forge — use Paxi datapacks instead
- LootJS `group()` and `modifyLoot(Ingredient.of())` silently fail — datapack overrides are reliable
- Artifacts mod config is overwritten on startup — use Forge `global_loot_modifiers.json` overrides

---

## 2026-03-30 — New origins, Orc rework, loot curation, mod fixes, distribution overhaul

### New Origins (11 → 13)
- **Witherborn:** DOT melee origin. Wither on hit, hunger-based damage penalty.
- **Slimebodied:** Food management tank. 5% food efficiency, satiety damage reduction.

### Race & Origin Reworks
- **Orc rework:** +10% attack speed, +20% HP, +10% melee, +50% hunger drain, Bloodlust (+20% damage scaling with hunger).
- **Witch of Ink:** Paint actives stripped, now pure passive hyperscaler.
- **Construct:** Description updated to reflect 5/5/5/10/10% scaling, Regen III, +35% max.

### Relics Curation
- 15 Relics removed from loot tables.
- 3 special drops added: Ender's Hand (dragon-only), Space Dissector (T4 1%), Shadow Glaive (T2/T3 1%).

### Loot Overhaul
- Village loot: gear removed, T1 materials added, food capped at 1.
- Curio drop rates halved (~10% cumulative).
- Infinity Ham removed from all loot tables.
- RFTools/Mahou items removed from chest loot.

### Mod & Config Fixes
- 30 mods fixed from `side='server'` to `side='both'` (root cause of pig rift shard bug and other missing client content).
- `Platform.isLoaded` guards added on modded entity loot modifiers.
- Improved Mobs equipment disabled (Equipment Chance = 0).
- Loot Integrations mod removed (redundant, caused item leakage).
- APTweaks passive mob caps tripled.
- AStages mod-wide gates removed for mods with food/crops (Thermal, Ars, etc.).

### Distribution & Packaging
- Client installer switched to repo zip download (reliable binary file handling).
- Resource packs now distributed via Paxi.
- `iridescent_classes.jar` rebuilt without baked-in origin layers.
- `global_packs/required_data` moved to `datapack_sources` (prevents double-loading).

---

## 2026-03-20 — Client installer fixes, transmuted materials, Codex update

### Client Installer Fixes
- CurseForge CDN download (319/450 mods) confirmed working via `edge.forgecdn.net`
- Identified and fixed bat→PowerShell regex escaping bug: inline `[''\""]` character class was corrupted by CMD's quote parser, causing some TOML URL extractions to silently fail (including Iron's Spells base mod)
- Moved mod download logic to external `download_mods.ps1` — clean PowerShell syntax, no escaping layers
- Added 3x retry with 2s delay, `WebClient.DownloadFile` (streams to disk), error reporting with failed mod names
- Removed `irons_spells_js` KubeJS addon (crashed when base mod failed to download, addon unused)
- Re-run behavior: always checks for missing mods, skips existing ones instantly
- Linux `.sh` verified working locally — both Modrinth and CurseForge CDN paths parse and download correctly

### Transmuted Materials (Tier-Skip Fix)
- AStages gates entire mods (e.g., `thermal`=tier_2), which blocked tier-skip recipe outputs
- Created 5 ungated transmuted items: `kubejs:transmuted_steel`, `transmuted_manasteel`, `transmuted_osmium`, `transmuted_diamond`, `transmuted_ancient_debris`
- Added to same forge tags as originals — work in ALL tag-based recipes automatically
- Hidden from JEI via `jei_hiding.js` — discoverable through Codex or experimentation
- `tier_skip.js` updated to output transmuted versions

### Codex Update
- Origins Guide: 6 pages (fixed missing texture from odd page count), updated with Phantom undeath, Witch of Ink, Artificial Construct
- 7 class entries rewritten to match current implementations (Berserker, Samurai, Battlemage, Wanderer, Archmage, Vanguard, Void Summoner)
- Faefolk race entry: removed Iron Weakness reference
- 4 new race entries added: Demi-God, Ryu, Fallen Angel, Kirin

### OfflineSkins
- Added client-only OfflineSkins mod for skin display on offline-mode servers

### Wiki & Memory
- Added wiki update rule and memory update rule to CLAUDE.md
- Script parity rule (.bat ↔ .sh) added to CLAUDE.md

---

## 2026-03-19 — Class passives, magic system, balance pass, client installer

### Class Passive Implementations
All 10 classes now have fully functional passives (previously 6 were description-only):
- **Berserker:** Battle Trance converted to real +5% ATK/+1 armor attribute. Brutal Strikes changed from axe-conditional to +15% base melee.
- **Samurai:** Bushido converted to +10% attack speed. Focus reworked: movement builds absorption shield (10% max HP cap), 10s CD on break. Vorpal I-V via Strength scaling with progression tier.
- **Battlemage:** Reworked to +15% melee/+15% magic. Mana Shield replaced with scaling Resistance (I at base, II with Faefolk, III with Faefolk+affixes).
- **Wanderer:** Adaptable replaced with Seasoned Traveler (+5% XP/+2.5% speed per new dimension visited, permanent stacking).
- **Paladin:** Healing Aura implemented (0.5 HP/5s AoE, 1 HP/5s self above 50% HP).
- **Vanguard:** Guardian's Presence implemented (Weakness I to all mobs within 5 blocks).
- **Archmage:** +50% magic (up from 25%). Mana Attunement: -25% melee penalty + tier-scaling magic amplifier (T1:+0%, T2:+5%, T3:+10%, T4:+15%). Weak early, devastating late.
- **Void Summoner:** Soul Tether implemented (5% lifesteal from nearby mob deaths, 10% bonus XP within 16 blocks).

### Magic Damage System Fix
- `puffish_attributes:magic_damage` was registered but never read by magic mods. Added sync in `skill_effects.js` pushing bonuses to both `ars_nouveau:spell_damage` and `irons_spellbooks:spell_power`.
- Iron's Spells re-enabled (was disabled — only the KubeJS addon was broken, base mod always worked).
- Iron's Spells loot tiered: T1 copper/iron books, T2 iron/gold, T3 gold/diamond, T4 diamond/netherite. Inks scale similarly.

### Construct & Balance Changes
- Artificial Construct: iron upgrade scaling changed from flat +5% to 5/5/5/10/10% (max +35%, back-loaded). Iron eating now grants Regen III (400% healing). Offhand healing removed.
- Faefolk: iron_weakness.json removed (was orphaned, never in power list).

### Phantom Undeath
- Phantoms never truly die. At 0 HP, death cancelled, health locks to 0.5 hearts. Spectral Collapse: Weakness II, Slowness II, Mining Fatigue I for 5 minutes. Resistance II during collapse for survival.

### Loot Tier Fix
- Nether correctly placed at T3 (was grouped with T2). Enchanted books and spell books re-tiered: T1 OW, T2 TF/Aether/Blue Skies, T3 Nether/Undergarden, T4 End/Abyss.

### Compass of Return
- New item: right-click teleports to last bed, 10 minute cooldown. 2.5% drop in cave/structure chests (T1). Craftable at T2 (compass + ender pearls + gold).

### Stylistic Description Pass
- All 28 descriptions (11 origins, 11 races, 10 classes) rewritten in consistent evocative tone. Demi-God's god_punch renamed to Divine Fury.

### Client Installer Rewrite
- CurseForge mods (319/450) now use edge.forgecdn.net CDN (old API endpoint returned 403).
- All mods download to `.minecraft/mods/` (fixed path confusion). Re-run syncs configs without re-downloading mods.
- Linux `.sh` version added with full parity. Script parity rule added to CLAUDE.md.

### OfflineSkins
- Added OfflineSkins mod (client-only) for skin display on offline-mode servers.

---

## 2026-03-19 — Origins expansion: 4 new races, 2 new origins

### Race Layer Expansion (7 → 11 races)
- 4 new races added to the icraft Race layer:
  - **Demi-God:** +40% HP (8 hearts), 2x raw meat healing, strength ability, phase ability, fire damage 1.5x, mild Nether weakness.
  - **Ryu:** 25% damage reduction, slow fall, draconic food healing, meat preference, sparkles, clears debuffs.
  - **Fallen Angel:** +15% all damage, -20% HP (4 hearts), slow fall, velocity dash, meat preference, translucent.
  - **Kirin:** +0.1 movement speed, wall climbing, sprint jump, cat vision, -20% HP (4 hearts), speed boost.
- Design rules maintained: no lethal effects, food preferences not restrictions, each heart = 5% HP.

### Origin Layer Expansion (9+Mundane → 11 total)
- 2 new custom origins added:
  - **Witch of Ink:** Paint magic, 50% food reduction, feeds from paintings. Boss counter (200 max) scales damage/reduction/toughness progressively. Blessing of Penthesilea capstone ability.
  - **Artificial Construct:** 25% food efficiency, iron eating (ingots + blocks). Iron upgrade ladder progression: 1000→16000 iron consumed, +5% per level, max +25% bonus.
- Elytra flight remains reserved for Elytrian origin only.

---

## 2026-03-19 — Alpha distribution, dedicated server fixes, loot rebalance

### Server Distribution
- `iridescentserver.bat`: Added `cd /d %~dp0` to fix working directory issues
- Paxi Forge 4.0 loads datapacks from `config/paxi/datapacks/`, NOT `global_packs/required_data/` on dedicated servers. All 17 datapacks synced there.
- Phase 0 standalone download checks both `config/` and `global_packs/`
- Mod download only runs on first install (fewer than 50 JARs)
- `.gitignore` exceptions added for `config/paxi/datapacks/*.zip`
- `max-tick-time=-1` for modded server stability
- `online-mode=false` for alpha testing (production copy preserved)

### Client Distribution
- `iridescentcraft.bat`: downloads PrismLauncher, creates instance, downloads mods
- Instance uses `%AppData%\PrismLauncher` (no portable mode)
- `instance.cfg` has `ManagedPack=true` with `[General]` header
- Mods go at instance root `mods/`, configs in `.minecraft/`

### Mod Removals
- Cherry Village removed (unregistered worldgen feature crash). Added to strip/skip lists.
- Gods & Heroes RPG Classes `.pw.toml` removed (was being re-downloaded, injecting broken class origins)

### Origin Layers Fix
- Added `order` field (0, 1, 2) and `enabled: true` to all three layer JSONs
- Added `name` and `gui_title` to Origin layer override
- All three prompts (Origin → Race → Class) confirmed working on dedicated server

### Translations (185+ entries)
- 72 custom KubeJS item translations (tokens, boss materials, alloys, rings, endgame, MekaSuit Mk2, planetary elements)
- 29 custom enchantment translations (icraft namespace)
- 440 Apotheosis affix translations covering all key formats (.suf/.suffix/.pre/.prefix/bare)
- Gender layer translation (server-only mod needs client lang)

### Loot Rebalance
- Enchanted books: no longer globally removed. Scaled by dimension (7.5% OW → 15% End) with tier-appropriate enchant levels.
- Ars Nouveau spell books: Novice (OW 5%), Apprentice (T2 5%), Archmage (T3 3%, End 5%)
- Village smith chests: 20% artifact chance (8 starter artifacts at 2.5% each)
- Ocean structures: heavily oceanic-themed (snorkel/flippers 15%, fishing rods, heart of the sea)
- Towers of the Wild: ~12% per artifact type
- Village affix gear: epic+ rarity stripped, white/green only
- Magic materials: Iron's Spells inks and Ars source gems boosted in structure chests

### Datapacks
- 17 datapacks synced to `config/paxi/datapacks/` across all distributions
- Added: Towers of the Wild, ScalingHealth NoCrystalDrops, Infinity Ham Blocker, fix_stone_tags, keepinventory, BOP biome weights (cherry blossom 8x boost)

### KubeJS Optimization Audit
- 17 tick-based scripts audited — all properly gated with interval checks
- `codex_delivery.js` and `skill_effects.js` identified as most active but efficiently structured
- `AStageEvents.added` in milestone_detection.js flagged as potential issue (listed as unavailable in wiki)

---

## 2026-03-17 (session 2) — Server distribution testing, mod removals, bug fixes

### Mod Removals
- Connected Glass, Trash Cans, SuperMartijn642's Core Lib + Config Lib removed — Core Lib load order incompatibility cascaded to all dependents. All `.pw.toml` metadata deleted from pack.

### Server Distribution
- Unified `iridescentserver.bat` replaces separate install + start scripts. Auto-detects first run, installs Forge, downloads mods, strips client-only/crash mods, launches server, generates crash logs on failure.
- Added `mods/.index/` (452 `.pw.toml` files) to server distribution — was missing, causing installer to fail.
- `strip_client_mods.bat` audited — no false positives across all 30 patterns.
- Server mod channel mismatch tracker: 5 mods resolved (Decorative LGBT Wall Flags, Alex's Mobs EXTRA Music, Rechiseled + SuperMartijn642 + Connected Glass + Trash Cans).

### Bug Fixes
- Duplicate origin definitions: 17 origin JSONs + layer file existed in both `kubejs/data/` and Paxi datapacks. Caused malformed second class prompt on dedicated server. Removed KubeJS copies.
- `botania:lexicon` misclassified as Patchouli book in `codex_delivery.js`. Generated malformed `/clear` command every second on login, causing connection timeout on dedicated server (silent on single player). Moved to `OTHER_BOOKS_TO_CLEAR`.

---

## 2026-03-17 — Origins overhaul, race rebalance, class descriptions, Codex updates, terrain/balance tuning

### Gameplay & Balance Tuning
- Playtest feedback: LootJS clutter removal (horse armor, spider eyes, etc.), structure food reduction increased from 70% to 90%.
- Apotheosis affix rarity: fixed dimension key prefixes, reduced Overworld Affix Item generation from 50% to 25%.
- Tectonic terrain: vertical_scale reduced from 1.155 to 0.8 (-31% height), ridge_scale reduced for flatter terrain.
- Improved Mobs rebalance: 3 in-game day grace period added, equipment/damage caps halved, diamond downgraded to iron for mob breaking tools.
- Early magic access: Iron's Spells scrolls and copper spell book added to Overworld chest loot tables.
- Walkable Mekanism cables coremod added (v1.0.1), with LocalVariableTable fix.
- HDPE Circuit Board recipe added, plus alternative Mekanism machine recipes using HDPE components.
- IF latex/rubber pipeline rework: logs produce latex via Create/Thermal processing, HDPE converts to dry rubber.

### Vanilla Origins Overhaul
- Design philosophy: no lethal environmental effects, food preferences not restrictions.
- Avian: "fresh air" replaced with Sky Affinity altitude buffs (+buffs at Y=80 and Y=150).
- Blazeborn: water damage replaced with discomfort, Nether Spawn replaced with Nether Affinity (+10/20% damage in Nether).
- Phantom: sunlight burn replaced with weakness+slowness, half health retained.
- Shulk: extra inventory replaced with Hardened Shell (50% death durability reduction), +20% mining speed.
- Feline: -20% HP added as tradeoff.
- Enderian: new Ender Shift power (+15% damage for short time after teleport).
- Merling: suffocation replaced with land discomfort after 5 minutes dry.
- Mundane origin re-added (no buffs or nerfs, blank slate).
- All power descriptions updated to match new implementations.

### Race Layer Rebalance
- Elf: +15% ranged damage, +5% magic damage added.
- Dwarf: mining hunger penalty halved.
- Orc: +10% melee damage, fixed knockback double-apply bug.
- Halfling: food efficiency now functional (+20%).
- Faefolk: magic damage bonus increased from 15% to 30%, -50% armor toughness added, -10% HP added.
- Revenant: sunlight effect changed to weakness+slowness, night vision level 1.1, +20% damage + Resistance I in darkness/Abyss, healing penalty now functional (-20%).

### Class Descriptions
- All 10 class descriptions updated to match actual power implementations.

### Codex Updates
- New "Choosing Your Build" early game guide entry added.
- New "Origins Guide" entry added.
- Updated entries: Champions, Enchantments (29 total documented), Affixes (88 total documented), all 10 class entries.

### Removed Mods
- Rechiseled removed (SuperMartijn642 Core Lib load order incompatibility).
- Pretty Rain removed (Cloth Config incompatibility).

### Bug Fixes
- Fast Leaf Decay ConcurrentModificationException noted (intermittent, non-fatal).
- Walkable Mekanism cables coremod LocalVariableTable fix (v1.0.1).

---

## 2026-03-16 — Blue Skies, Undergarden, Aether/Abyss mechanics, End overhaul, Abyss overhaul, server distribution

### Blue Skies Balance Pass
- Dusk Arc weapon removed (overpowered for T2).
- Shadow Armor set removed (bypassed tier progression).
- Runic Arc changed to boss-drop only (was craftable).
- Diopside, Charoite, Horizonite nerfed to T2-appropriate stats and integrated into Tetra (23 materials total).

### Undergarden Balance Pass
- Tetra stat overrides added for 4 Undergarden metals, bringing total Tetra material count to 27.

### Aether + Abyss Dimension Mechanics
- Aether mechanics implemented: thin air (slow regen above cloud level), vertigo (screen effects near edges), updrafts (launch zones near cliffs).
- Abyss mechanics implemented: oppressive darkness (reduced visibility + slowness without light source), corruption (gradual wither in corrupt biomes), fear aura (boss proximity debuffs).

### Comprehensive End Overhaul
- Dragon Exploration Gate: players must explore End islands and complete objectives before the dragon fight becomes available (explore first, fight dragon last).
- 9 advancement overrides for End progression (replaces vanilla End advancement chain).
- 5 End-specific Apotheosis affixes added (End Apotheosis affixes).
- Void Blossom loot table fix (was dropping nothing).
- Entity ID fixes for End mobs (corrected registry names).
- Moog's End Structure loot tables populated with tier-appropriate rewards.

### Twilight Forest Portal Change
- TF portal activator changed from diamond to T1 boss token (makes TF accessible after first boss kill rather than requiring diamonds).

### Abyss Overhaul
- 30 original ring recipes removed (were too accessible).
- 8 custom rings created with progression-appropriate recipes.
- 7 armor set bonuses implemented for Abyss armor sets.
- Boss drop gating: key Abyss equipment now requires boss drops to craft.

### Server Distribution
- Server distribution folder created for packaged server deployment.

---

## 2026-03-16 — Ad Astra, Mekanism balance, food system, Tetra expansion, Farmer's Delight, bug fixes

### Ad Astra Integration
- Ad Astra added as post-T4 endgame space dimension mod. 5 planets (Moon, Mars, Mercury, Venus, Glacio) at 7x-12x difficulty.
- MekaSuit Mk2 designed as space-tier armor upgrade requiring T4 completion + Ad Astra materials.
- Planetary extraction system designed for unique resources per planet.
- Space enchantments designed for vacuum/radiation/gravity protection.
- Full integration design doc exists. Requires T4 gate + recipe gating. Implementation in progress.

### Mekanism Balance Overhaul
- Generator nerfs applied across all Mekanism generators to prevent early-game RF flooding.
- All Mekanism machine RF costs doubled (2x) to align with progression curve.
- Digital Miner recipe changed to require higher-tier materials (prevents T3 cheese).
- Mekanism tool and armor recipes removed entirely (MekaTool/MekaSuit remain T4-only via existing gating).

### Food System Overhaul
- Hunger drain rate increased to 2.5x vanilla baseline.
- Seed drops from grass reduced to 5% (from vanilla ~8%).
- Structure food loot reduced across all loot tables.
- Spawn protection area provides slower hunger drain for new players.

### Tetra Integration Expansion
- Tetra material count expanded from 15 to 20 modded metals.
- New materials include Abyss metals and Forbidden & Arcanus metals.
- Diamond hammer tier now required for high-tier material crafting.
- Full reference page updated in wiki.

### Farmer's Delight Cooking Conversion
- 70 recipes converted to use Farmer's Delight cooking mechanics.
- Cooking Station and Skillet now serve as primary food crafting stations.

### Design Decisions (Planned)
- Abyss ring and armor design documented for future implementation.

### Bug Fixes
- Apotheosis affix JSONs: uppercase rarity keys changed to lowercase (fixed world load crash).
- Cherry Village: template pool feature references fixed (unregistered feature crash).
- Zeta race condition: coremod jar added to synchronize ForgeZetaEventBus.

---

## 2026-03-16 — New mod additions and Ad Astra integration

### New Mods Added
- Ad Astra added as post-T4 endgame space dimension mod. 5 planets (Moon, Mars, Mercury, Venus, Glacio) at 7x-12x difficulty. Full integration design doc exists. Requires T4 gate + recipe gating. Implementation in progress.
- Tetra + Tetracelium added for weapon/tool overhaul. Custom material datapack (`icraft_tetra_materials`) created with 15 modded metals across all 4 tiers.
- Soul Fire'd added for Nether soul fire mechanics. No gating needed.
- Cobweb (Crystal Nest library) and mutil (Tetra library dependency) added as library mods.

### Previously Recommended/Optional Mods Now Installed
- ImmediatelyFast, Oculus, Equipment Compare, Jade Addons, Light Overlay (all previously recommended — now installed)
- LazyDFU [UNOFFICIAL PORT], Alternate Current, Ksyxis, JEED, Transmog (all previously optional — now installed)

### GitHub Wiki Audit Updated
- "ADD recommended" count reduced from 5 to 0
- All optional mods marked as resolved
- New mods categorized in audit

---

## 2026-03-16 — Config review implementation pass

### Enchanting & Repair
- Easy Anvils verified correct — "too expensive" removed, repair costs at 1.0+, no changes needed
- Disenchanting Table recipe gated to T2 (requires 4x `thermal:steel_ingot`)
- Table of Experience recipe gated to T2 (requires 4x `thermal:steel_ingot`)
- Enchantment Transfer: no gating needed — works through vanilla anvil, XP cost is the gate
- DarkOrb Orb of Origin recipe gated to T2 (4x steel + 4x amethyst + heart of the sea). Resets ALL Origins layers (can't be configured per-layer).

### Combat & Difficulty
- Azukaar's Fair Difficulty: all stat scaling zeroed out (damage, luck, XP multipliers). Behavior features kept (hunger nerf, night purge, no-sleep enforcement, respawn distance).
- Icarus wings: all default recipes removed. 5 new T3 recipes added requiring diamond + phantom membrane.
- Configurable Extra Mob Drops: audited — all entries empty, no tier-breaking drops.

### Dimensions
- Aethersteel moved to T4 endgame. Worldgen disabled via biome modifier override datapack. 17 items added to T4 AStages restrictions. Ore replacement added (appears as holystone until T4).

### Content Removal
- Terramity: 22 gun recipes removed, 64 armor pieces across 16 sets removed, gunsmith station removed. Bosses, structures, mobs, accessories untouched. No custom enchantments found.

### Documentation
- Serene Seasons: 4-page Patchouli Codex entry added explaining seasonal farming, winter crop death, greenhouse bypass
- Iron Jetpacks: verified — uses single dynamic item ID with NBT, material gating already enforces tier progression. Documented in code.

### Tetra Integration
- 15 modded metal material definitions created as Paxi datapack (`icraft_tetra_materials`)
- Covers: Brass (T1), Steel/Signalum/Lumium/Manasteel/Steeleaf/Ironwood/Fiery/Knightmetal (T2), Osmium/Refined Obsidian/Terrasteel/Elementium/Enderium (T3), Aethersteel (T4)
- Full reference page added to wiki

### Bug Fixes
- Apotheosis affix JSONs: uppercase rarity keys → lowercase (fixed world load crash)
- Cherry Village: template pool feature references fixed (unregistered feature crash)
- Zeta race condition: coremod jar added to synchronize ForgeZetaEventBus
- Vanilla Origin layer: origins:human removed to prevent overlap with icraft:human race

---

## 2026-03-15 — Champions, affixes, skills, and gating expansion

- 5 custom Champions affixes implemented: Commanding (buffs nearby mobs), Draining (leeches XP), Hexing (random debuffs), Leaping (lunges at players), Summoning (spawns reinforcements)
- Per-dimension Champion spawn rate scaling (demotes champions in lower-tier dimensions)
- 54 new Apotheosis JSON affixes (30→84 total), ~50 new event-driven effects (15→65) in affix_effects.js
- All 6 Engineering skill placeholders made functional (crafting_speed, machine_speed, rf_generation, fuel_reduction, material_save, craft_bonus)
- AStages gating expanded: mod-gated Twilight Forest/Blue Skies/Aether entirely, added all diamond/netherite/End/Botania derivatives, beacon, shulker boxes, elytra
- 6 vanilla advancement overrides (diamond/netherite advancements hidden until appropriate tier)
- Milestone detection auto-grants blocked advancements on tier unlock
- Vanilla Origin layer: removed origins:human to avoid overlap with icraft:human race. Three-prompt flow is now Origin (9 vanilla) → Race (7 custom) → Class (10 custom)

---

## 2026-03-14 — Final implementation push

- Endgame loops: Rift Shards, Mythic Forge, 12 endgame items, boss Rift drops, Compendium tracking
- Prestige/Ascension: 5 levels, multiplicative mob scaling, player stat bonuses, Ascension Beacon
- Villager trade rework: Forge VillagerTradesEvent, books/diamond gear removed, XP trades added
- Waystone recipes: All variants gated behind boss drops
- Cross-mod recipe audit: 30+ tier-breaking recipes blocked (Create, Thermal, Mekanism, etc.)
- Mod configs: ScalingMobs per-dimension, Champions 15% base, Apotheosis corrections

## 2026-03-14 — Batch implementation pass

- Codex fully working: 11 categories, 80 entries, formatted, advancement-gated (T2+)
- Mod book suppression working: `/clear` with NBT matching for 9+ mod books
- LootJS loot overhaul fixed: `setCount()` API corrected, 35+ structure mods covered
- Apotheosis affixes complete: 142 JSON files (was 30), covering all tiers/dimensions/bosses
- Mob equipment scaling fixed: `setItemSlot` API (was `setArmorSlot`)
- Origins++ overlap: investigated, no removals needed
- Diagnostic scripts disabled, KubeJS event errors all resolved

## 2026-03-14 — Three-prompt character creation (Origin / Race / Class)

- Updated master design doc: character system now has four layers instead of three
- Origin (Origins++ defaults) is now the first selection prompt — species-level identity
- Race (7 custom icraft races) is the second prompt — stat modifiers and thematic flavor
- Class (10 icraft combat roles) is the third prompt — combat role and glass cannon status
- This three-layer approach emerged from in-game testing and creates more build diversity
- Re-enabled the default Origins layer to allow Origins++ origin selection
- Updated wiki classes/overview.md to reflect the new structure

## 2026-03-13 — Wiki creation and initial conversion

- Converted master design document from `.docx` to `wiki/design/master.md`
- No design changes — faithful reproduction of original document

## 2026-03-12 — Initial implementation session

- Implemented Phase 2 KubeJS command rewards (59 effects across 4 skill trees)
- Implemented 24 custom enchantments (Part VI)
- Implemented class respec station (Part III addendum)
- Implemented equipment HP halving for glass cannon classes
- Implemented ~45 of ~95 Apotheosis affixes (Part V)
- Fixed glass cannon auto-tagging via Origins power JSON
- Integrated Warp Shield into dimension_mechanics.js

## 2026-03-07 — Implementation priorities completed

- All 13 numbered priorities from Section 29 completed
- Skill effects: 10 fully functional, 4 attribute-proxied, 2 approximated, 6 informational
- Custom enchantments registered via Apotheosis-compatible startup script
- 30 Apotheosis affix JSONs + 15 event-driven affix effects

## Pre-session — Original design

- Parts I-XII authored in `master_design_document IridescentCraft.docx`
- FTB Quests implementation reference authored separately
