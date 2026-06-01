# Master / Appendix / Wiki — Cleanup Proposal

> **⚠️ CORRECTION (2026-06-01, theabyss re-audit).** The sweep below **wrongly classified `theabyss` as a phantom/absent mod.** It is NOT absent: `theabyss` is the namespace shipped by **`TATOS 1.0.5_beta.jar`** (TATOS = "The Abyss: The Other Side") — the same mod, not two. TATOS is installed and live: dimension `theabyss:the_abyss` is gated T3 (`dimension_gates.js`); its abyss mechanics (oppressive darkness / corruption / fear aura / void whispers) fire in `theabyss:the_abyss` via `dimension_mechanics.js`; `recipe_audit.js` §K actively strips the 30 stock rings + arcane workbench (→ 8 custom rings); `abyss_boss_loot.js` / `abyss_ring_effects.js` / `abyss_armor_effects.js` wire ring + armor-set content to live `theabyss:*` bosses; 4 theabyss Tetra metals are live; `tatos_dimension_lock.js` confines theabyss mobs to the 4 TATOS dims. **Every "theabyss / Abyss not in pack / dormant / DEAD CODE" line below and in the live wiki has been reverted** (`home.md`, `master.md`, `systems/overview.md`, `mods/overview.md`, `boss-catalog.md`, `master-appendix.md`). The "before" snippets quoted below are left as the historical pre-sweep record; do not treat their theabyss verdicts as current. (The Nosaj sub-claim was also wrong-but-narrow: "Nosaj" exists in theabyss as items only — `amuled_of_nosaj`, `crown_of_nosaj`, `nosaj_sword` — there is no `theabyss:nosaj` boss entity.) Other phantom-mod verdicts below (Champions Unofficial, NovaBosses, LuMoreBosses, Truly Modular, Alex's Caves bosses, Void Blossom) remain correct.

> **✅ APPLIED (2026-06-01).** This #47 catalogue has now been actioned across the live wiki as part of the wiki fold-back + phantom-mod sweep (`IridescentCraft-internal/audits/wiki-consistency-2026-06-01.md`). The phantom mods below — **theabyss/Abyss/Nosaj, Champions Unofficial, Void Blossom, NovaBosses, LuMoreBosses, Truly Modular, Thermal "Locomotion", Alex's Caves bosses** — were removed or relabelled in `master.md`, `master-appendix.md`, `systems/overview.md`, `mods/overview.md`, `kubejs/overview.md`, `home.md`, and `boss-catalog.md`. **This document is retained as the record of *what* was catalogued + *why*; its quoted "before" snippets are intentionally left as-is** (they document the pre-sweep state). Resolutions chosen: Champions → Majrusz; ScalingMobs/Improved Mobs/Azukaar's → `iridescent_difficulty`; Truly Modular → the Tetra stack (whole family removed from pack); theabyss → the standalone mod is absent (the custom `kubejs:ring_*` substitute stays; TATOS bundles some confined `theabyss:` content); NovaBosses dropped, reserved Simply Swords uniques re-pointed at the in-pack Ultimate Bosses / Ultris / Brutal Bosses.

> **Read-only audit.** Scope per task #47: identify every reference in
> `master.md`, `master-appendix.md`, `wiki/systems/*.md`, and `wiki/classes/*.md`
> to a mod, boss, item, dimension, or system that is **not in the live
> PrismLauncher mods folder** (`~/AppData/Roaming/PrismLauncher/instances/IridescentCraft/.minecraft/mods/`,
> 451 jars). Per task scope, `changelog.md` is included only at a spot-check
> level — its entries are historical record and the task explicitly asks to
> preserve those.
>
> **Sweep date:** 2026-05-29.
> **Live mod count:** 451 jars (snapshot at task start).
> **Recommendation legend:**
> - `REMOVE` — reference is aspirational with no realistic add-path; delete + minimal surrounding-text rewrite.
> - `ANNOTATE_AS_FUTURE` — reference reads like a roadmap item the operator may still want; add an inline `(not yet in pack — planned)` footnote.
> - `INVESTIGATE` — uncertain. Could be a typo, renamed mod, or in-pack-but-misidentified namespace; needs operator review.
>
> **No edits are proposed to lessons-learned files, changelog historical entries describing "we chose not to ship X," or to the `boss-catalog.md` footnotes that already document these absences.** Operator reviews each line item below before any edit lands.

---

## Pack baseline — "what *is* in the pack"

Reference table for the recommendations below. Each entry verified via
case-insensitive partial-match in the PrismLauncher mods folder listing.

| Referenced as | In pack? | Live jar |
|---------------|:---:|----------|
| Alex's Caves (`alexscaves:*`) | NO | only `alexsdelight-1.5.jar` + `alexsmobs-1.22.9.jar` ship |
| Mowzie's Mobs | NO | absent |
| Friends and Foes | NO | absent |
| Illage and Spillage | NO | `villagesandpillages-forge-mc1.20.1-1.0.2.jar` ships but that's a different mod |
| Adventurez | NO | absent |
| Goety | NO | absent |
| Knightquest / Soulsweapons / Aquamirae / Legendary Monsters / Wetlands / Galosphere / Frostiful / Born in Chaos / Mythic Mobs / MutantMore | NO | absent |
| Bosses of Mass Destruction (`bosses_of_mass_destruction:*`) | NO | absent |
| TheAbyss / Abyss / Abyss Chapter II | NO | absent — design doc references a "Nosaj boss line" / "theabyss:" namespace items that do not resolve |
| NovaBosses | NO | absent |
| Champions Unofficial | NO | **removed 2026-04-07** per `wiki/systems/overview.md:54-56`; replaced by Majrusz's Progressive Difficulty |
| Cataclysm Apotheosis Addon | NO | absent — only `l_enders_cataclysm`, `cataclysm_ut`, `cataclysmiccombat` ship |
| Thermal Locomotion | NO | only Foundation / Innovation / Expansion / Cultivation / Dynamics / Integration / Series ship |
| Truly Modular (Archery / Armory / Arsenal sub-mods) | NO | absent |
| L_Ender's Cataclysm | YES | `l_enders_cataclysm-3.26-laserfix.jar` (so `cataclysm:*` IDs *are* valid) |
| Brutal Bosses | YES | `brutalbosses-1.20.1-8.5.jar` |
| Ultimate Bosses | YES | `ultimate-bosses-1.0.4.jar` |
| Ultris | YES | `ultris-v5.6.9c.jar` |
| Majestic Menaces | YES | `majestic manaces - phase 1 (1.0) for forge 1.20.1.jar` |
| Mutant Monsters | YES | confirmed via `MutantMonsters-*.jar` reference in `kubejs/server_scripts/mutant_monsters_no_griefing.js` |
| Witch of Ink **(origin)** | YES | implemented via `iridescent_origins-1.0.0.jar` + `kubejs/server_scripts/origins/witch_of_ink_progression.js` |
| Witch of Ink **(dimension)** | NO | no mod jar found; only the origin exists |
| Multiplayer Bosses | YES | (no boss bar; enhances vanilla) |

The "theabyss" namespace deserves a callout. The pack ships custom KubeJS
`kubejs:ring_of_*` items via `kubejs/server_scripts/abyss/abyss_ring_effects.js`,
plus an `abyss_boss_loot.js`. These are designed as a **replacement** for the
absent The Abyss mod's 30-ring system, intentionally shipped *because* the
source mod isn't present. The design docs reference both the absent mod's
content *and* the custom replacement; only the absent-mod references are
in-scope for cleanup.

Similarly, the boss-catalog footnote `[^void_blossom]` already documents that
`cataclysm:void_blossom` is not a real Cataclysm entity — the
`bosses_of_mass_destruction:void_blossom` ID was misattributed to the
`cataclysm:` namespace and BoMD is not in the pack.

---

## `master.md`

### `master.md:222` — "Cataclysm line (Netherite Monstrosity, ...) | 50% Champion rate"

**Quoted context** (line 222, within dimension table):
> | The Nether | T3 | Cataclysm line (Netherite Monstrosity, Ignis, the Harbinger, Maledictus, Ancient Remnant) | 50% Champion rate; Wither Skeletons function as mini-bosses |

**What's referenced.** "Champion rate" — i.e., Champions Unofficial.

**In-pack check.** Champions Unofficial NOT in pack (no jar matching `champion*`).
`wiki/systems/overview.md:54` confirms removal 2026-04-07 and migration to Majrusz's
Progressive Difficulty.

**Recommendation.** `REMOVE` the "50% Champion rate" clause; rewrite as "Majrusz
Master-stage scaling" or remove the descriptor entirely. Same pattern applies
to every dimension row that uses "Champion rate" semantics.

**Rationale.** The mod has been physically deleted; this line describes mechanics
the pack no longer runs. Champions Unofficial is *the* removed system, not an
aspirational one — keeping the reference creates a stale spec contradiction with
`wiki/systems/overview.md`.

---

### `master.md:223` — "The Abyss | T3 | Nosaj boss line | 30 ring-removal mechanic + 7 elemental armor sets; most-wired mod in the pack"

**Quoted context** (line 223, within dimension table — this is the operator-flagged starter entry):
> | The Abyss | T3 | Nosaj boss line | 30 ring-removal mechanic + 7 elemental armor sets; most-wired mod in the pack |

**What's referenced.** The Abyss (Chapter II) mod, "Nosaj" boss line, the
30-ring economy, the 7 elemental armor sets, and the "Otherside" dimension
(also referenced at `master-appendix.md:982`).

**In-pack check.** No `theabyss-*.jar` / `the_abyss-*.jar` / `abyss-chapter*` jar
in the live mods folder. The KubeJS `abyss/abyss_ring_effects.js` ships 8
custom `kubejs:ring_*` items intentionally *as a substitute* for the absent
mod's 30 rings; the substitute is real but the parent mod is not. Confirmed
in `boss-catalog.md` line 23 ("The `master.md` 'theabyss' Nosaj boss line is
also NOT present in the live pack").

**Recommendation.** `REMOVE`. Rewrite the row to describe the *substitute*
system actually in pack (the 8 custom rings + abyss-themed kubejs script
content), or drop the row entirely from the dimension table and move
"oppressive darkness" content elsewhere. The phrase "most-wired mod in the
pack" is factually wrong since the parent mod isn't installed.

**Rationale.** This is the strongest aspirational-reference case in the entire
sweep. The design intent was to ship The Abyss as a T3 dimension; it was
dropped at some point and replaced with KubeJS scripts. The doc still reads
as though the parent mod is the centerpiece.

---

### `master.md:127, 234, 321, 644, 979` — "Abyss" as a T3/T4 dimension and chest pool entry

**Quoted contexts:**
- L127: "T3 dimensions (Undergarden, Deeper Darker, Nether, **Abyss**) at T3"
- L234: "**Abyss** — oppressive darkness, corruption, fear aura. Visibility tuning, slow corruption stat-debuff buildup, scripted fear aura near specific mob types."
- L321: "**T3 — The Abyss.** Oppressive darkness mechanic — visibility tuning, slow corruption stat-debuff buildup, scripted fear aura near specific mob types. Sculk-adjacent and abyss-adjacent mob synergies. Companion to Deeper Darker thematically."
- L644: "T4 | End, Deeper Darker, **Abyss** | ~16%"
- L979: "T4 | End, Deeper Darker, **Abyss** | ~16% | ~33 items"

**What's referenced.** "Abyss" as a real dimension that gates T3/T4 content and contributes to the T4 chest pool.

**In-pack check.** The dimension `theabyss:the_abyss` (referenced at
`master-appendix.md:1107`) belongs to the absent mod. The "Abyss" dimension
does not exist in the live pack. The custom abyss scripts simulate atmosphere
in the *Otherside* (Deeper Darker) dimension instead per `dimension_mechanics.js`.

**Recommendation.** `REMOVE` from each list. Rewrite L321's narrative
section either: (a) attached to Deeper Darker (where the scripts actually
fire), or (b) deleted entirely. The T4 chest-pool entries (L644, L979) must
drop "Abyss" so pool sizing stays accurate.

**Rationale.** Same root cause as L223. The dimension doesn't exist; players
will never visit it. Listing it in dimension and chest-pool tables creates
false expectations that the player can navigate to "the Abyss".

---

### `master.md:285` — "T4 bosses — ... Coralssus + Void Blossom. Endgame."

**Quoted context** (line 285):
> - **T4 bosses** — Ender Dragon + Ender Guardian + Ancient Remnant + Gaia Guardian + Warden + Coralssus + Void Blossom. Endgame.

**What's referenced.** "Void Blossom" — same entity attributed to
`cataclysm:void_blossom` at `master-appendix.md:643`.

**In-pack check.** Per `boss-catalog.md` footnote `[^void_blossom]` and the
in-doc inline reference at `boss-catalog.md:165`: "void_blossom is actually
from the `bosses_of_mass_destruction` mod (NOT in this pack)". The Cataclysm
namespace contains no `void_blossom` entity. Coralssus IS in pack
(`cataclysm:coralssus`, confirmed in `boss-catalog.md:107`).

**Recommendation.** `REMOVE` "Void Blossom" from the T4 boss list (keep Coralssus).
Same pattern applies to `master-appendix.md:643`.

**Rationale.** Boss-catalog already flagged this as a stale design-doc
reference. Leaving it in master.md keeps the misattribution alive.

---

### `master.md:227` — "Witch of Ink dimension | T3+ (Origin-tied) | — | Origin-specific content surface"

**Quoted context** (line 227, dimension table):
> | Witch of Ink dimension | T3+ (Origin-tied) | — | Origin-specific content surface |

**What's referenced.** A "Witch of Ink dimension" — distinct from the Witch
of Ink **origin** which IS implemented (via `iridescent_origins-1.0.0.jar`
+ `kubejs/server_scripts/origins/witch_of_ink_progression.js`).

**In-pack check.** No mod jar containing a "witch of ink" dimension. The origin
exists. The boss-catalog summary section (line 233) explicitly says: "The
Witch of Ink 'dimension' referenced in `master.md` Part IV does not appear
to be a real dimension/mod in the live pack — likely future content."

**Recommendation.** `ANNOTATE_AS_FUTURE`. The Witch of Ink origin is a marquee
custom feature with a documented progression hook; a future
"origin-specific content surface" is a plausible roadmap. Inline note like
"(planned origin-specific content; not yet a separate dimension)".

**Rationale.** Unlike The Abyss, this isn't replaced by anything — it reads
genuinely as a roadmap entry. Annotating preserves the design intent
visibly while making clear no player can visit it today.

---

### `master.md:602-609, 615-617` — "Cataclysm boss-set armor (Knight, Ignitium, Cursium, Witherite)" and "Cataclysm signature boss weapons"

**Quoted context** (lines 615-617):
> - **Iron's Spellbooks** — staves and spell scrolls (T1–T4 progression).
> - **Cataclysm** — signature boss weapons from Cataclysm boss drops.
> - **Mahou Tsukai** — T4 ritual-cast weapons.

These reference the L_Ender's Cataclysm mod (in pack). Confirmed by jar
`l_enders_cataclysm-3.26-laserfix.jar`. NO action.

The "Knight / Ignitium / Cursium / Witherite armor sets" at L1027:
> - **Cataclysm boss-set armor** (Knight, Ignitium, Cursium, Witherite) — boss-only.

Cataclysm material chain confirmed by `master-appendix.md:86` ("Witherite,
Enderite, Ignitium, Cursium ingots") which IS in pack. NO action.

---

### `master.md:609` — "Simply Swords ... 14 are reserved for future boss mods (NovaBosses, Ultimate Bosses, Brutal Bosses)"

**Quoted context** (line 609):
> **Simply Swords** is the unique trophy-weapon system. **42 named uniques, all boss-drop only.** Unique-weapon recipes are stripped. Each unique is allocated to a specific boss — Tempest from Naga, Soulrender from Lich, Emberblade from Hydra, etc. 28 of the 42 are allocated; 14 are reserved for future boss mods (NovaBosses, Ultimate Bosses, Brutal Bosses) and currently creative-only.

**What's referenced.** NovaBosses, Ultimate Bosses, Brutal Bosses as
parenthetical examples of "future boss mods".

**In-pack check.** Ultimate Bosses IS in pack (`ultimate-bosses-1.0.4.jar`).
Brutal Bosses IS in pack (`brutalbosses-1.20.1-8.5.jar`). **NovaBosses is
NOT** — no `novabosses-*.jar` in live mods folder.

**Recommendation.** `INVESTIGATE`. The framing is "reserved for future boss
mods" so the reference is intentionally aspirational, but two of the three
mods listed are *already in the pack* per the modlist (and per
`master-appendix.md:489-491` "Reserved for future allocation"). So either:
(a) the 14 reserved uniques should now be reallocated to BB/UB drops, in
which case this sentence is stale; or (b) the phrasing should drop
NovaBosses (absent) and rework "Ultimate Bosses / Brutal Bosses" as
"present but not yet enumerated".

**Rationale.** The mix of present + absent mods in a single roadmap
parenthetical is confusing. Operator should decide whether to ship the
reserved 14 uniques against BB/UB content or keep the reserve.

---

### `master.md:628, 633, 1028` — "Theabyss" boss-set armor + design philosophy

**Quoted contexts:**
- L628: "- **Theabyss** Knight / Unorithe / Ragnarok / Dragon / Death armor sets — recipe-stripped, boss-drop only."
- L633: "**Armor philosophy.** Layer types should not stack power. A T3 player picks *one* of: Refined Obsidian (Mekanism), Terrasteel (Botania), Diamond (vanilla), or boss-drop (**Theabyss**). The combinatorial space is wide enough that the choice itself is the build identity."
- L1028: "- **Theabyss boss-set armor** (Knight, Unorithe, Ragnarok, Dragon, Death) — boss-only."

**What's referenced.** The Abyss mod's 5 armor sets and the boss(es) that
drop them. Recipe-strip + boss-only language implies these are real
drop-only items the player can obtain.

**In-pack check.** Theabyss NOT in pack (same root finding as L223). The
items can't drop because the mod isn't loaded; the recipe-strip section
references in `master-appendix.md` §B Section K (lines 167-172) are
no-ops against a non-existent mod.

**Recommendation.** `REMOVE`. L633's armor-philosophy quartet should be
rewritten without Theabyss — possibly: "Refined Obsidian / Terrasteel /
Diamond / Aethersteel (T4 boss-drop)" or "...Mekanism / Botania / vanilla
/ Cataclysm".

**Rationale.** Players reading L628/L1028 will hunt for a non-existent
boss to drop non-existent armor. The recipe-strip language at
`master-appendix.md` §B.K is technically harmless (the rules don't fire
against absent items) but reading it suggests the items are intended to be
obtainable, which is misleading.

---

## `master-appendix.md`

### `master-appendix.md:85` — "Theabyss: Knight/Unorithe/Ragnarok/Dragon/Death armor materials"

**Quoted context** (line 85, A.3 Tier 3 Materials):
> - Theabyss: Knight/Unorithe/Ragnarok/Dragon/Death armor materials (boss-drop only, recipes stripped — see Section B).

**What's referenced.** Same absent-mod armor sets as `master.md:628`.

**In-pack check.** Same as L223 — mod absent.

**Recommendation.** `REMOVE` the entire bullet.

**Rationale.** Section A is a "what materials are accessible at this tier"
list. Including an absent mod's materials directly violates the section's
purpose.

---

### `master-appendix.md:167-172` — Section K "Theabyss rings + Arcane Workbench + boss armor"

**Quoted context** (lines 167-172):
```
**Section K — Theabyss rings + Arcane Workbench + boss armor**:
- K.1: `event.remove({ mod: 'theabyss', type: 'minecraft:crafting_shaped', output: /theabyss:ring_/ })` (regex bulk strip).
- K.2: Catch-all `event.remove({ output: /theabyss:ring_/ })` for shapeless/special.
- K.3: 29-item individual ring removal list (belt-and-suspenders); audit Phase 3.2 fixed `ring_of_ghost` → `ring_of_ghosts` plural drift.
- K.4: `theabyss:arcane_workbench` (ring crafting station) removed.
- K.5: 5 boss-drop armor sets (Knight, Unorithe, Ragnarok, Dragon, Death) — 20 pieces total — recipes removed.
```

**What's referenced.** Five KubeJS `event.remove` blocks targeting `theabyss:`
namespace items that do not exist in the live pack.

**In-pack check.** Same mod-absence finding. The recipe-strip code at
`kubejs/server_scripts/recipes/recipe_audit.js` Section K is no-op against
an unloaded namespace (KubeJS evaluates these against the live registry).

**Recommendation.** `INVESTIGATE`. Two paths:
(a) If the operator wants to keep the design doc honest, document that
Section K is currently no-op because the mod is absent and move the actual
KubeJS code into a `theabyss_legacy.js.disabled` or similar.
(b) If the absence is permanent and Section K's code is dead, also remove
the live `recipe_audit.js` Section K block (out of scope for this proposal —
that's a code change).

Either way, the appendix entry needs updating. Recommendation: `INVESTIGATE`,
with the suggested edit being a note: "Section K — Theabyss rings (DEAD CODE,
theabyss mod not in pack; retained as documentation of the intended strip
behavior should the mod be re-added)".

**Rationale.** Documenting code-state matters in an appendix designed to be
the canonical recipe ledger. A reviewer cross-referencing recipe_audit.js
against this section will not understand why the live code doesn't actually
strip anything.

---

### `master-appendix.md:437-445` — Section C.11 Theabyss bosses (`loot/abyss_boss_loot.js`)

**Quoted context** (lines 437-445):
> ### C.11 Theabyss bosses (`loot/abyss_boss_loot.js`)
>
> 7 custom kubejs rings replace 30 vanilla rings: `kubejs:ring_of_shadows`, `ring_of_the_phantom`, `ring_of_embers`, `ring_of_frost` (Abyss structure chests @ 15% each); `ring_of_void_sight` (Deep Abyss chests @ 10%); `ring_of_the_knight` (Knight boss @ 25%); `ring_of_dark_pact` (Nightblade boss @ 20%); `ring_of_unorithe` (final Abyss boss @ 15%).
>
> 5 boss-drop armor sets allocated:
> - Knight set → ice_knight @ 20%
> - Unorithe set → soul_guard @ 15% / guard @ 12%
> - Ragnarok set → guard @ 5%
> - Dragon set / Death set → harder Abyss bosses @ 5%

**What's referenced.** The 7 custom KubeJS rings (real, in pack) AND drops from
"Knight boss", "Nightblade boss", "final Abyss boss", "ice_knight", "soul_guard",
"guard", and "harder Abyss bosses" — i.e., the absent mod's bosses.

**In-pack check.** Custom kubejs items exist. The named drop sources
(Knight boss, Nightblade, etc.) do NOT exist — they are entities from the
absent The Abyss mod. The `loot/abyss_boss_loot.js` file (existence
confirmed in `master-appendix.md` §I.4 line 1234) ships LootJS hooks that
target these non-existent entities — they will silently fire on no-op.

**Recommendation.** `INVESTIGATE`. The 7 custom kubejs rings are real and
should stay documented. The drop-source mapping (Knight boss → ice_knight,
etc.) should be either: (a) reattributed to in-pack T3 bosses (e.g., the
ring set could be allocated to Cataclysm bosses, Deep Aether bosses, etc.);
or (b) marked as "TBD: original drop sources are from an absent mod; needs
operator reallocation". The same applies to the 5 armor sets (Knight,
Unorithe, etc.) — they cannot drop because the mod is absent.

**Rationale.** This is the most concrete intersection of "custom system that
ships" and "absent mod content the system targets". The custom ring economy
exists and is in scope; the boss-source mapping is broken. Player can never
acquire 5 of the 7 ring-drop pathways as currently documented.

---

### `master-appendix.md:489-491, 500-501` — "NovaBosses ... Reserved for future allocation"

**Quoted context** (lines 489-491 + 500-501):
> **NovaBosses.** Reserved for future allocation per the simplyswords audit's 14-weapon reserve list (Section 8 of `loot_overhaul.js`). Currently not allocated.
>
> **Ultimate Bosses.** Reserved similarly.
> ...
> 4. Ultimate Bosses — assign T4 loot + Rift materials when integrated.
> 5. NovaBosses — identify in-game, place in tier system, assign loot when integrated.

**What's referenced.** NovaBosses (absent) and Ultimate Bosses (in pack,
per `ultimate-bosses-1.0.4.jar`).

**In-pack check.** NovaBosses not in pack. Ultimate Bosses in pack but not
yet integrated per `loot_config_priorities` ordering.

**Recommendation.** `INVESTIGATE` — NovaBosses entry could be `ANNOTATE_AS_FUTURE`
(roadmap reserve) or `REMOVE`. Ultimate Bosses entry should be tightened to
reflect that the mod is present but not yet wired (currently the framing
suggests both are equally not-integrated).

**Rationale.** Mirrors the L609 finding in `master.md`. Same root reasoning.

---

### `master-appendix.md:643` — "`cataclysm:void_blossom` | 4 | 2,000 | 4,000"

**Quoted context** (line 643, D.6 Boss HP base values):
> | `cataclysm:void_blossom` | 4 | 2,000 | 4,000 |

**What's referenced.** A Cataclysm-namespaced entity that does not exist in
the Cataclysm jar. Operator-flagged starter entry.

**In-pack check.** Verified absent per `boss-catalog.md:165` and
footnote `[^void_blossom]`. The real `bosses_of_mass_destruction:void_blossom`
mod (BoMD) is not in pack either.

**Recommendation.** `REMOVE` the entire row. If the operator wants to retain
a Void-Blossom slot as roadmap, fall back to `ANNOTATE_AS_FUTURE` with a
note that BoMD isn't currently shipped.

**Rationale.** This is the operator's flagship example of stale-doc-data.
Boss-catalog already wrote a footnote about it; the appendix row should
match.

---

### `master-appendix.md:545, 580-598, 729-796, 818, 1016, 1045, 1244` — Champions Unofficial references

**Quoted contexts (compressed — see full lines in source):**
- L545: "Total: 84 JSON affixes + 65 event-driven affixes ... + 5 **Champions** custom-affixes (Commanding, Draining, Hexing, Leaping, Summoning)."
- L580 (header): "| Dimension | Tier | HP × | DMG × | Speed × | Armor × | **Champion %** | **Champion affixes** | ..."
- L598: "The '**Champion %**' range covers the spawn-rate jitter from **Champions Unofficial** config; lower bound is the natural-spawn rate, upper bound includes structure-spawn boosts."
- L729: "### D.10 **Champion affix pool**"
- L818: "2. **Champions Unofficial** — affix pools, spawn rates, tier scaling, dimension-weighted affixes (D.10)."
- L1016: "| Champions Unofficial | B | Elite mob spawning |"
- L1045: "| Champions Unofficial | B | Elite affixes |"
- L1244: "| `mob_scaling_unified.js` | Dimension-keyed HP/damage multipliers + **Champion** spawn rates |"

**What's referenced.** Champions Unofficial mod, its affix system, and dozens of derived numbers.

**In-pack check.** Mod NOT in pack (confirmed: no `champion*.jar` in
modlist). Per `wiki/systems/overview.md:54` (REMOVED 2026-04-07).

**Recommendation.** Cluster of `REMOVE` + `INVESTIGATE`:
- L545 (affix count): `REMOVE` the "+5 Champions custom-affixes" addend; rewrite without the Champions line.
- L580-598 (dimension multiplier table): The "Champion %" and "Champion affixes" columns are tracking a system the pack no longer runs. `REMOVE` the columns (`INVESTIGATE` first — confirm with operator whether Majrusz's Progressive Difficulty replaces these columns 1:1 or whether the columns should be re-headed to reflect that mod's spawn semantics).
- L729-796 (D.10 Champion affix pool): The entire D.10 section describes a mod that's been removed. `REMOVE` the section, OR if Majrusz has affix-equivalents, rewrite under "D.10 Majrusz Progressive Difficulty affix pool".
- L818 (implementation note): `REMOVE` the Champions Unofficial bullet from the 7-layer implementation list; replace with Majrusz reference.
- L1016, L1045 (F.5 Crosscutting roster — Champions Unofficial appears twice): `REMOVE` both entries.
- L1244 (KubeJS index): The script `mob_scaling_unified.js` still exists. `INVESTIGATE` — check the file for whether it still references Champions-only API or whether it's now agnostic.

**Rationale.** This is a system-wide cleanup. The appendix is supposed to be
"the authoritative numbers reference" but it currently documents at length
a mod the pack no longer ships. The doc says "fully populated 2026-04-27"
which is *after* the 2026-04-07 Champions removal — the appendix-fill pass
didn't catch the change.

---

### `master-appendix.md:899` — Section E.7 "Theabyss replacement rings (custom)"

**Quoted context** (line 899):
> - `kubejs:ring_of_shadows`, `kubejs:ring_of_the_phantom`, `kubejs:ring_of_embers`, `kubejs:ring_of_frost`, `kubejs:ring_of_void_sight`, `kubejs:ring_of_the_knight`, `kubejs:ring_of_dark_pact`, `kubejs:ring_of_unorithe` — 8 custom rings replace 30 vanilla theabyss rings.

**What's referenced.** 8 real kubejs items, with framing "replace 30 vanilla
theabyss rings".

**In-pack check.** The 8 kubejs items are in pack and registered (verified
in `kubejs/startup_scripts/custom_items.js` via `master-appendix.md:1306`).
The "30 vanilla theabyss rings" they "replace" do not exist in pack.

**Recommendation.** Light edit — `INVESTIGATE`. The header is fine but the
description should be tightened. Suggested replacement: "8 custom rings
(originally designed as substitutes for The Abyss mod's 30-ring system;
the source mod is not currently shipped — the rings remain in-pack as
standalone curio content)."

**Rationale.** The 8 rings exist regardless; the doc just needs to stop
describing them as "replacements for" something that's not present.

---

### `master-appendix.md:982` — "The Abyss | B | T3 dimension (Otherside)"

**Quoted context** (line 982):
> | The Abyss | B | T3 dimension (Otherside) |

**What's referenced.** "The Abyss" listed as a T3-tier mod with dimension
"Otherside". Note: `Otherside` is actually the Deeper Darker dimension
(verified by `master-appendix.md:1107`: `deeperdarker:otherside`).

**In-pack check.** The Abyss mod absent. The Otherside attribution is a
namespace mix-up — `otherside` belongs to `deeperdarker`, not the absent
`theabyss` mod.

**Recommendation.** `REMOVE` the row. Otherside is already accounted for
under the Deeper Darker entry (line 983).

**Rationale.** Two errors compound: the mod doesn't exist AND the
dimension attribution is wrong. Removing the row is cleanest.

---

### `master-appendix.md:1107` — Stage gates: `theabyss:the_abyss` dimension entry

**Quoted context** (line 1107):
> **Dimensions**: `undergarden:undergarden`, `deeperdarker:otherside`, `minecraft:the_nether`, `theabyss:the_abyss`.

**What's referenced.** `theabyss:the_abyss` as a T3 stage-gated dimension.

**In-pack check.** No `theabyss:` namespace in pack. Stage restrictions
referencing a non-existent dimension are harmless (the entry simply never
fires) but documentation-misleading.

**Recommendation.** `REMOVE` `theabyss:the_abyss` from the T3 dimension list.

**Rationale.** Stage restrictions are runtime checks; documenting a check
that can never fire creates the false impression the dimension is reachable.

---

### `master-appendix.md:1103, 1124` — Stage-gated theabyss items

**Quoted contexts:**
- L1103: "- theabyss T3 (audit Phase 4.2): `totem_of_thunder`, `totem_of_abyss`, `totem_of_time`, `eye_of_abyss`, `dream_shifter`, `node_shard`, `enchanted_bottle_of_somnium`, `clock_of_time`, `artifact_of_after_life`."
- L1124: "- theabyss T4 (audit Phase 4.2): `crown_of_nosaj`, `amuled_of_nosaj`, `immortal_substance`."

**What's referenced.** 9 T3 and 3 T4 items in the theabyss namespace, all
stage-gated.

**In-pack check.** Absent mod — items don't exist; stage restrictions are
no-op.

**Recommendation.** `REMOVE` both lines. If the operator wants to retain
the "if the mod is ever re-added these are the gates" intent, the entries
should move to a clearly-labeled "Dormant — mod not currently shipped"
sub-section.

**Rationale.** The stage gates ship in `astages_restrictions.js` and the
lines accurately describe what would gate if the items existed, but
documenting them in the live G.2 / G.3 sections suggests they're active
constraints.

---

### `master-appendix.md:1208, 1234, 1306` — KubeJS script references to theabyss

**Quoted contexts:**
- L1208 (script `recipe_audit.js` summary): "...theabyss rings + abyss boss armor..."
- L1234: "`abyss_boss_loot.js` | 7 custom replacement rings (4 chest + 3 boss) + 5 boss-drop armor sets |"
- L1306: "`custom_items.js` | ~50 kubejs:* item registrations (progression tokens, boss materials, intermediate alloys, **Theabyss replacement rings**) |"

**What's referenced.** Live KubeJS scripts that have logic targeting the
absent mod's content.

**In-pack check.** Scripts exist; their targets (theabyss namespace) don't.

**Recommendation.** `INVESTIGATE`. The scripts ship live; their summaries
in the appendix accurately describe what the code does. The question is
whether to keep the code (no-op against absent mod, harmless) or rip it.
Out of scope to rewrite code; in scope to either annotate the summaries
("targets absent mod; no-op live") or update them once the operator
decides on Section K.

**Rationale.** The summaries are accurate. If the operator removes the
theabyss-targeting code, the summaries should follow.

---

### `master-appendix.md:1891` — Marquee structure: "The Abyss marquees"

**Quoted context** (line 1891, N.1 marquee roster):
> | T4 | The Abyss marquees | Abyssal | theabyss tables (TBD exact IDs) |

**What's referenced.** A T4 marquee structure category sourcing from the
absent theabyss mod.

**In-pack check.** Mod absent. "TBD exact IDs" was already a flag that the
loot tables were never resolved — because they don't exist.

**Recommendation.** `REMOVE` the row from N.1. Likewise, `master-appendix.md:2088-2099`
("**T4 Abyssal** — The Abyss marquee tables (14 items):") is the corresponding
item list — should `REMOVE` or, if the operator wants to retain the curated
artifact pool, reassign it to a different T4 structure (Ancient City already
has a list at L2076; End City at L2063).

**Rationale.** Doubly broken — both the structure and the loot table source
are non-existent. The curated 14-item pool is real design work; if reassigned
to an in-pack T4 structure it's not lost.

---

### `master-appendix.md:1910` — Theme "Abyssal | Abyss-tier dark / corruption"

**Quoted context** (line 1910, N.2 theme catalog):
> | Abyssal | Abyss-tier dark / corruption | Chorus inhibitor, twisted heart, abyss core, cursed totems |

**What's referenced.** A theme category whose only consumer is the absent-mod
marquee row at L1891.

**In-pack check.** Same root.

**Recommendation.** `REMOVE` row if the L1891 marquee is removed. If the
14-item pool is reassigned to a different T4 structure, the theme can stay
(re-targeted at that structure).

---

### `master-appendix.md:1029` — Savage and Ravage "B | Illager expansion"

**Quoted context** (line 1029):
> | Savage and Ravage | B | Illager expansion |

**What's referenced.** Savage and Ravage mod.

**In-pack check.** `savage_and_ravage-1.20.1-6.0.1.jar` IS in pack. NO action.

(Noted because operator's starter list flagged "Illage and Spillage" which
is a *different* mod, also absent — and the casual reader might confuse
Savage and Ravage with Illage and Spillage.)

---

### `master-appendix.md:961` — "Thermal Series (Foundation, Innovation, Expansion, Locomotion, Cultivation, Dynamics)"

**Quoted context** (line 961):
> | Thermal Series (Foundation, Innovation, Expansion, Locomotion, Cultivation, Dynamics) | B | T2 RF + ore processing |

**What's referenced.** Thermal Locomotion as one of the Thermal Series
components.

**In-pack check.** Foundation, Innovation, Expansion, Cultivation, Dynamics,
Integration are all in pack. Thermal Locomotion (`thermal_locomotion`) is
NOT.

**Recommendation.** `REMOVE` "Locomotion" from the comma list (or add Integration
to it). Likely `REMOVE` since Thermal Locomotion adds cart/transport
mechanics that the pack doesn't appear to require.

**Rationale.** Minor doc-debt. The reader cross-referencing the modlist
against this entry will spot the Locomotion gap.

---

### `master-appendix.md:502` — "Cataclysm Apotheosis Addon — already installed"

**Quoted context** (line 502):
> 6. Cataclysm Apotheosis Addon — already installed; verify it integrates Cataclysm drops with Apotheosis affix system.

**What's referenced.** A "Cataclysm Apotheosis Addon" mod.

**In-pack check.** No jar matching `cataclysm*apoth*` or `apoth*cataclysm*` in
the live mods folder.

**Recommendation.** `INVESTIGATE`. The text claims "already installed" but
no such jar exists. Either: (a) the mod was removed at some point and the
ledger entry is stale; (b) the functionality is now wired by a different
mod (e.g., `cataclysm_ut`) and the name in the doc is outdated.

**Rationale.** Direct contradiction with the file system. Operator should
confirm the source of Cataclysm-Apotheosis integration before any edit.

---

### `master-appendix.md:1043` — "Truly Modular (incl. Archery, Armory, Arsenal)"

**Quoted context** (line 1043):
> | Truly Modular (incl. Archery, Armory, Arsenal) | B | Crafted weapons + armor + tools |

**What's referenced.** Truly Modular family of mods (Archery, Armory, Arsenal).

**In-pack check.** No `truly*.jar`, no `archery|armory|arsenal` matches in
mods folder.

**Recommendation.** `INVESTIGATE`. Several places in the docs reference
"Truly Modular" as the primary crafted-weapon system (e.g., `master.md:607-611`).
The functionality may instead be filled by Tetra + `art_of_forging` +
`adtetra` + `tetra_re_enlarged` (all present). If so, every "Truly Modular"
reference needs renaming.

**Rationale.** This is a potentially-large rename cluster. Operator should
clarify before any edit lands.

---

## `wiki/systems/overview.md`

### `wiki/systems/overview.md:205, 208, 277` — "Atlatitan (Alex's Caves)" / "Watcher (Alex's Caves)" / "Void Blossom loot table fixed"

**Quoted contexts:**
- L205: "Naga, Lich, Hydra (Twilight Forest), Ignis (Cataclysm), Slider (Aether), Summoner (Blue Skies), Atlatitan (**Alex's Caves**)."
- L208: "Ender Dragon, Ender Guardian, Harbinger (Cataclysm), Shattered (Deeper Darker), Watcher (**Alex's Caves**)."
- L277: "Dragon Exploration Gate: ... 9 advancement overrides replace the vanilla End advancement chain. 5 End-specific Apotheosis affixes. **Void Blossom loot table fixed.** Entity ID corrections for End mobs. Moog's End Structure loot tables populated."

**What's referenced.** Alex's Caves bosses Atlatitan and Watcher; Void Blossom loot table.

**In-pack check.** Alex's Caves mod NOT in pack (only Alex's Mobs and Alex's
Delight ship). The Atlatitan/Watcher entities don't load. Void Blossom is
the same misattribution flagged at `master.md:285` and `master-appendix.md:643`.

**Recommendation.** L205, L208: `REMOVE` the parenthetical Alex's Caves entries.
The respective boss-source lists for T2/T4 should be replaced with in-pack
alternatives (T2 Bosses already has many — Naga/Lich/Hydra; T4 Bosses
already has Dragon/Guardian/Harbinger/Shattered). L277: `REMOVE` "Void
Blossom loot table fixed" since the entity isn't in pack — the fix is
moot.

**Rationale.** Alex's Caves cross-reference is the second-most-common
absent-mod citation across the doc set. systems/overview.md is the
single-source-of-truth doc for current pack state (post-Champions
removal), so getting these references right matters most here.

---

### `wiki/systems/overview.md:269` — "Abyss Ring & Armor System"

**Quoted context** (lines 267-269):
> ## Abyss Ring & Armor System
>
> The Abyss mod received a full overhaul. 30 original ring recipes removed (too accessible for their power level). 8 custom rings created with progression-appropriate recipes gated behind boss drops. 7 armor set bonuses implemented for Abyss armor sets. Key equipment requires Abyss boss drops to craft.

**What's referenced.** "The Abyss mod" — same absent mod as L223 in master.md.

**In-pack check.** Same — mod absent. The 8 custom rings exist; the 7 armor
set bonuses' targets (theabyss armor sets) don't.

**Recommendation.** `INVESTIGATE` / mostly `REMOVE`. The "8 custom rings"
sentence is accurate; the framing "The Abyss mod received a full overhaul"
and "7 armor set bonuses for Abyss armor sets" is broken. Suggested
replacement header + body: "**Custom Abyss-themed Curio System** — 8
kubejs:ring_* items shipping as a custom T3 curio chain (originally
designed as a substitute for the absent The Abyss mod). Distributed via
boss drops on in-pack T3 bosses."

The "7 armor set bonuses" claim needs source verification — they're
implemented at `abyss/abyss_armor_effects.js` but if the armor itself
isn't in pack, the bonuses fire on nothing.

**Rationale.** Same recommendation rationale as master-appendix.md:437-445.

---

## `wiki/systems/tetra-materials.md`

### `wiki/systems/tetra-materials.md:331, 337, 339` — Tetranomicon category coverage tables mention "alexscaves"

**Quoted contexts:**
- L331: "| `bone` | 11 | **alexscaves**, alexsmobs, deep_dark_regrowth, deeperdarker, unusualprehistory |"
- L337: "| `skin` | 8 | **alexscaves**, alexsmobs, ms_*, tropicraft |"
- L339: "| `stone` | 67 | ad_astra, **alexscaves**, betterend, blue_skies, create, deeperdarker, ms_*, quark, regions_unexplored, unearthed |"

**What's referenced.** The mod `alexscaves` listed as a contributing source for
tetranomicon's material registrations across 3 categories.

**In-pack check.** `tetranomicon-1.6.1-1.20.1.jar` IS in pack and DOES register
materials for alexscaves (verified by the doc's own claim). But alexscaves
itself is NOT in pack, so those material entries are dormant.

**Recommendation.** `ANNOTATE_AS_FUTURE` or light edit. The table is
descriptive of "what tetranomicon ships" — technically accurate. The
ambiguity is whether the reader should understand "alexscaves materials are
available in pack" or "tetranomicon registers entries for alexscaves but
the mod isn't shipped." Suggested annotation: a parenthetical "(alexscaves
not in pack; entries dormant)" or a footnote on first occurrence.

**Rationale.** Less urgent than the master.md/appendix references but
similar trap for an automation script that scrapes the table assuming
"every mod listed is in pack."

---

## `wiki/classes/overview.md`

### No findings.

The class overview references Champions only via the Witch of Ink
counter mechanism (line 131: "boss-kill counter (max 200): Apotheosis/Champions +1").
This is implementation language describing the kubejs hook's mob-tag check;
even with Champions Unofficial removed, the hook may still match Majrusz's
elite tag if that's been renamed correctly. Out of scope to verify without
reading the script — flagged here only so the operator knows it exists.

---

## Closing

### Counts

| Recommendation | Count |
|---|---:|
| `REMOVE` | 14 |
| `ANNOTATE_AS_FUTURE` | 3 |
| `INVESTIGATE` | 7 |
| **Total entries** | **24** |

Per-file breakdown:

| File | REMOVE | ANNOTATE | INVESTIGATE |
|---|---:|---:|---:|
| `master.md` | 6 | 1 | 1 |
| `master-appendix.md` | 6 | 1 | 5 |
| `wiki/systems/overview.md` | 2 | 0 | 1 |
| `wiki/systems/tetra-materials.md` | 0 | 1 | 0 |

### Patterns

1. **The Abyss / Theabyss / Nosaj is the largest single cluster** —
   **10 references** spanning master.md L223/L234/L321/L628/L633/L644/L979/L1028
   and master-appendix.md L85/L167-172/L437-445/L899/L982/L1103/L1107/L1124/L1891/L1910/L2088,
   plus systems/overview.md L267-269. The pattern strongly suggests The
   Abyss was originally planned as a T3 dimension mod and was dropped at
   some point, with custom KubeJS rings + abyss-themed scripts shipped as
   a partial substitute. The custom rings are real and in scope to retain;
   everything mod-namespaced is broken.

2. **Champions Unofficial is the second-largest cluster** — **8 references**
   across master-appendix.md L545/L580-598/L729-796/L818/L1016/L1045/L1244
   plus 6 in master.md (L31/L141/L262-263/L307/L329/L333/L740/L804/L940).
   The mod was removed 2026-04-07 (per systems/overview.md) and replaced by
   Majrusz's Progressive Difficulty, but the master+appendix never got
   updated. The appendix was "fully populated 2026-04-27" — 20 days *after*
   the removal — so the documentation pass missed the change.

3. **Alex's Caves cluster** — 2 references in systems/overview.md (L205, L208)
   + the Void Blossom misattribution at master.md:285 / master-appendix.md:643.
   Alex's Mobs and Alex's Delight ship; Alex's Caves does not. Atlatitan
   and Watcher are Alex's Caves entities that don't load. Boss-catalog
   already flagged these.

4. **NovaBosses single-entry** — 1 reference each at master.md:609 and
   master-appendix.md:489-491 / L500-501. Two of the three "future boss
   mods" listed alongside NovaBosses (Ultimate Bosses, Brutal Bosses) are
   already in pack — the framing is stale.

5. **Truly Modular single-entry** — 1 reference at master-appendix.md:1043 and
   indirect references at master.md:607-611. May be functioning as a stale
   name for the `tetra` + `art_of_forging` stack.

6. **Cataclysm Apotheosis Addon single-entry** — 1 reference at
   master-appendix.md:502 with claim "already installed" that doesn't match
   the modlist. Needs operator clarification.

7. **Thermal Locomotion single-entry** — 1 reference at master-appendix.md:961.
   Trivial omission — Thermal Locomotion missing from the live Thermal series.

### Sweep coverage statement

**Files checked:**
- `master.md` (1,111 lines)
- `master-appendix.md` (2,106 lines)
- `wiki/systems/overview.md` (313 lines)
- `wiki/systems/tetra-materials.md` (842 lines)
- `wiki/systems/icraft-launcher.md` (106 lines — no findings)
- `wiki/classes/overview.md` (152 lines — no findings)
- `boss-catalog.md` (read for context only; already documents the operator's starter list)

**Files explicitly skipped per task scope:**
- `changelog.md` — spot-checked for absent-mod references; per task, changelog
  entries describing past decisions stay as historical record. Found
  references to alexscaves at L6585-6587 (real audit history of mob ID
  fix); these are intentional historical entries and not in scope to edit.
- `lessons-learned*.md` — out of scope per task.
- Anything under `internal/` repo or PrismLauncher data dirs — out of scope.

**Grep patterns used:**
- Primary absent-mod batch: `alexscaves|alexs_caves|mowziesmobs|mowzie|friendsandfoes|friends_and_foes|illage|spillage|adventurez|goety|theabyss|nosaj|bosses_of_mass_destruction|void_blossom|knightquest|soulsweapons|aquamirae|legendary_monsters|wetlands|galosphere|frostiful|born_in_chaos|mythic_mobs|mutantmore` (case-insensitive)
- `NovaBosses|Ultimate Bosses|Witch of Ink|nova_bosses`
- `Champion|champion` (case-insensitive, all variants)
- `Mowzie|alex.cave|Alex.s Caves|Friends and Foes|Adventurez|Goety|illage and Spillage|illage.and.Spillage|Mythic.Mobs|MutantMore`
- `Knightquest|Soulsweapons|Aquamirae|Legendary Monsters|the Wetlands|Galosphere|Frostiful|Bosses of Mass Destruction|Born in Chaos`
- `Abyss|abyss` (manual filtering for dimension vs. custom-script vs. theme uses)
- `[Tt]heabyss` to catch all namespace-style refs

**Mod-jar verification:** Each finding cross-referenced against the live
PrismLauncher mods folder via `ls "$PRISM/.minecraft/mods/" | tr A-Z a-z |
grep -i <substr>`. The 451-jar listing was cached locally and partial-match
verified per mod name.

**Possible gaps:**
- I did not extract individual `cataclysm:*.jar`, `tetranomicon:*.jar`, or
  Aether's `*.jar` and inspect `assets/<modid>/lang/en_us.json` to verify
  every cross-mod entity ID resolution. Where the boss-catalog had already
  done that work (e.g., `cataclysm:void_blossom`), I cited it. For
  references the boss-catalog hadn't covered (e.g., the 5 theabyss armor
  sets), I relied on the absence-of-jar finding.
- I did not check for references inside `wiki/progression/`, `wiki/protocols/`,
  `wiki/roadmap/`, `wiki/mods/`, `wiki/known-issues/`, `wiki/meta/`, or
  `wiki/kubejs/` subdirectories — task scope was explicit about `wiki/systems/`
  and `wiki/classes/`. If the operator wants broader coverage, those
  directories should be a follow-up sweep.
- `wiki/design/heracles-quest-tree.md`, `iridescent-modular-spells-tetra-migration.md`,
  and `waystone-*.md` were not checked — task scope listed only master.md,
  master-appendix.md, changelog.md, and the systems/classes folders.

**Confidence:** High for the Theabyss + Champions Unofficial + Alex's Caves
clusters (verified absent + cross-referenced against boss-catalog). Medium
for NovaBosses and Truly Modular (verified absent but framing-as-roadmap
makes operator intent unclear). Medium for the Cataclysm Apotheosis Addon
single-entry (claim of "installed" contradicts mods folder but mod-name
spelling may be different in pack).
