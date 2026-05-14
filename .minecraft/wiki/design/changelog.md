# Design Changelog

All changes to the master design document are logged here with date, description, and reason.

---

## 2026-05-14 — Mana bridge followups: UI unification + ISS school SP -> Ars spell damage

### UI: hide Ars perk mana rows from Apothic Stats GUI
The mana bridge keeps `irons_spellbooks:max_mana` and `ars_nouveau.perk.max_mana`
at equivalent player-level values, but each attribute had a different base
(ISS = 100, Ars = 0). So the Apothic Attributes Stats screen showed both as
separate rows with confusingly different numbers ("Max Mana: 150" + "Max Mana
(Ars): 50"). Hidden the Ars rows via `config/attributeslib.cfg` "Hidden
Attributes" list. ISS rows are canonical; bridge maintains Ars equivalence
silently in the background.

Entries added:
- `ars_nouveau:ars_nouveau.perk.max_mana`
- `ars_nouveau:ars_nouveau.perk.mana_regen`

### ISS school SP -> Ars spell damage
New: `kubejs/server_scripts/attributes/iss_school_to_ars_spell.js`. Hooks
Forge's `LivingHurtEvent` and, when the damage source is one of the 4 Ars
elemental damage types, multiplies the damage by the attacker's matching
ISS school SP.

Mapping (elemental only -- no generic spell bridge per design call):

| Ars damage type | ISS attribute | Effect glyphs that emit this |
|---|---|---|
| `ars_nouveau:flare` | `irons_spellbooks:fire_spell_power` | EffectFlare (direct fire damage) |
| `ars_nouveau:frost` | `irons_spellbooks:ice_spell_power` | EffectColdSnap, frost-type direct |
| `ars_nouveau:windshear` | `irons_spellbooks:lightning_spell_power` | Air/wind direct-damage glyphs |
| `ars_nouveau:crush` | `irons_spellbooks:nature_spell_power` | EffectCrush (earth/nature) |

Generic `ars_nouveau:spell` intentionally NOT mapped -- non-elemental glyphs
(EffectHarm, etc.) stay on their own damage math.

**Broader coverage via SpellDamageEvent.Pre:** Companion script
`kubejs/server_scripts/attributes/iss_school_to_ars_glyph.js` hooks Ars's
`SpellDamageEvent.Pre`, which fires before damage is dealt and carries the
spell context. The handler:
1. Walks `event.context.spell.recipe` (the glyph list)
2. Finds the first glyph with an elemental school (`fire` / `water` / `air` / `earth`)
3. Multiplies `event.damage` by the caster's matching ISS school SP

So even when a glyph's damage flows through a VANILLA damage type
(e.g., `EffectHarm` -> `ars_nouveau:spell` source but ELEMENTAL_EARTH school),
the bridge still applies. The school-glyph mapping is independent of the
damage type.

Anti-double-count: the SpellDamageEvent handler SKIPS damage sources whose
type is in the LivingHurtEvent handler's 4-elemental map. Those go through
the LivingHurtEvent path; everything else goes through SpellDamageEvent.Pre.

| Coverage path | When it fires | Example |
|---|---|---|
| LivingHurtEvent (`iss_school_to_ars_spell.js`) | damage_type in {flare, frost, windshear, crush} | EffectCrush, EffectFlare direct hits |
| SpellDamageEvent.Pre (`iss_school_to_ars_glyph.js`) | spell context present, school in {fire, water, air, earth} | EffectHarm (earth), Burst+Ignite (fire), most multi-glyph spells |

**Residual gap (small):** damage from Ars-spawned entities AFTER the spell
context is gone (vanilla lightning entity from `EffectLightning` striking
20 ticks after cast, vanilla on_fire ticks from `EffectIgnite`) doesn't
carry SpellDamageEvent context and isn't caught. Closing those would need
NBT-tagging the affected entity at cast time + boosting subsequent
on_fire / lightning damage. Deferred -- volume of edge cases is small
relative to the value of the main path.

### Files
- `config/attributeslib.cfg` (Hidden Attributes list extended)
- `kubejs/server_scripts/attributes/iss_school_to_ars_spell.js` (new)
- Deployed to 3 distros

### Open question
"Ars book should boost both" -- the current architecture is that Ars books
emit only Ars attributes and the mana bridge mirrors them to ISS at the
player level. That already makes the book "boost both" effectively. If the
intent is instead that the Ars book should emit ISS attributes NATIVELY
(showing two lines on the tooltip and applying additively as a single
item), that would double-count under the current bridge math. Flagged for
your call.

---

## 2026-05-14 — ISS Apotheosis gems buffed; bidirectional ISS<->Ars mana bridge

### ISS gems were under-tuned
ISS ships 13 Apotheosis-compatible gems (data at `data/irons_spellbooks/gems/`)
with uniformly weak values: 1/3/5/7/10/15% MULTIPLY_TOTAL flat, no roll
variance within a tier. Native Apotheosis gems sit at ~3x these magnitudes.

### Buff via Paxi override (`icraft_iss_gem_buffs.zip`)
13 gem JSONs overriding the ISS defaults. New ladder:

| Gem set | Operation | C / U / R / E / M / A |
|---|---|---|
| 8 school SP (blood / ender / evocation / fire / holy / ice / lightning / nature) + summoning | MULTIPLY_TOTAL | 6-8 / 9-13 / 15-21 / 23-31 / 33-43 / 45-60% |
| cast_time / cooldown | MULTIPLY_TOTAL | 5-7 / 8-11 / 12-17 / 18-25 / 26-35 / 34-45% |
| **`spell_resist` REPURPOSED -> generic spell_power gem** | MULTIPLY_TOTAL | 3-5 / 6-9 / 8-12 / 13-17 / 18-23 / 24-30% |
| intelligent (multi-bonus: max_mana + mana_regen) | ADDITION / MULTIPLY_BASE | mm: 5-14 / 15-29 / 30-49 / 50-79 / 80-119 / 120-180 (flat)<br/>regen: 3-5 / 6-9 / 8-12 / 13-17 / 18-23 / 24-30% |

The `spell_resist` filename + variant key is preserved so ISS's bundled
asset/model/texture/lang hooks still resolve. A KubeJS asset override at
`kubejs/assets/apotheosis/lang/en_us.json` renames the displayed gem
"Gem of Spell Resistance" -> "Gem of Arcane Affinity" (Apotheosis lang
key: `item.apotheosis.gem.irons_spellbooks:spell_resist`).

All gems pick up tier-internal roll variance via `steps`/`step` per rarity,
so the chase loop now extends across each rarity band (a roll-perfect
ancient feels distinct from a roll-floor one).

### Bidirectional mana bridge (ISS <-> Ars)
`kubejs/server_scripts/attributes/mana_bridge.js` -- 1 Hz server tick that
mirrors gear-contributed mana modifiers between mods:

- `irons_spellbooks:max_mana` <-> `ars_nouveau:ars_nouveau.perk.max_mana` (ADDITION)
- `irons_spellbooks:mana_regen` <-> `ars_nouveau:ars_nouveau.perk.mana_regen` (MULTIPLY_BASE)

Math: per attribute pair, sum gear modifiers (excluding our own bridge
contribution to avoid self-feedback), then upsert a deterministic-UUID
bridge modifier on the OTHER attribute with that sum. Stable across ticks.

Result: a player wearing an ISS-only ring (+50 max_mana) gets the equivalent
+50 mana effect when casting Ars spells, and vice versa. The intelligent
gem also benefits -- it emits ISS attributes only, but the bridge mirrors
them to Ars at the player level, so the gem feels universal.

Items stay mono-namespace (ISS books emit ISS attrs; Ars books emit Ars).
This keeps individual item tooltips unified (one mana line per item) while
the bridge handles cross-mod equivalence at the player level. The Apothic
Attributes Stats panel WILL still show both attributes separately -- they
exist as separate Forge attributes with different base values -- but that's
expected and isn't visible during normal play.

Ars caches max_mana via `IManaCap.setMaxMana(int)`; the bridge force-kicks
the cache only when the mirrored value actually changes (tracked per-player
to avoid per-tick cache thrash).

### Files
- `datapack_sources/icraft_iss_gem_buffs/` -- new Paxi datapack source
  (13 gem JSONs in `data/irons_spellbooks/gems/`)
- `config/paxi/datapacks/icraft_iss_gem_buffs.zip` -- built + deployed 3x
- `config/paxi/datapack_load_order.json` -- added entry just after iss_overrides
- `kubejs/server_scripts/attributes/mana_bridge.js` -- new bridge script
- `kubejs/assets/apotheosis/lang/en_us.json` -- spell_resist gem display rename
- All deployed to 3 distros

### Follow-up audit hint
`iridescent-tetra-expansion-mod/.../ars_book/{back_cover,front_cover}.json` IRON
variants currently emit `irons_spellbooks:max_mana` (cross-pollination bug from
an earlier authoring pass). Ars books should be Ars-only; if you see double
Max Mana lines on an Ars book held in hand, that's the source. Fixable in a
separate sweep -- the bridge masks the symptom but the right fix is to make
the variant emit Ars-only attributes.

---

## 2026-05-14 — Apotheosis toolkit ungated; rarity ladder is the gate

User design call: "the gates should be the rarity of gems and affixes
available, not the actual crafting." All 9 Apotheosis workstations
previously held behind AStages tier flags are now available from T1.

### Workstations ungated
Removed from `kubejs/server_scripts/gates/astages_restrictions.js`:

| Workstation | Was gated at |
|---|---|
| `apotheosis:simple_reforging_table` | T2 |
| `apotheosis:gem_cutting_table` | T2 |
| `apotheosis:sigil_of_socketing` | T2 |
| `apotheosis:reforging_table` | T3 |
| `apotheosis:sigil_of_rebirth` | T3 |
| `apotheosis:sigil_of_withdrawal` | T3 |
| `apotheosis:augmenting_table` | T4 |
| `apotheosis:sigil_of_enhancement` | T4 |
| `apotheosis:sigil_of_unnaming` | T4 |

Entries kept in the file as commented-out for audit trail with a pointer
back to this design call.

### Why ungating is safe
The original gates were belt-and-suspenders. Three independent caps already
constrain affix/gem progression:
1. **Dimensional rarity clamp** (`config/apotheosis/adventure.cfg`,
   "Affix Convert Rarities" + "Gem Dimensional Rarities") -- per-dimension
   min/max rarity for affix conversion and gem drops.
2. **Boss-drop tokens** (basic / advanced / ultimate reforging tokens) --
   each reforging tier consumes a token that only drops from
   tier-appropriate bosses.
3. **Mob/source tier inference** -- Apotheosis infers affix rarity from
   the dimension of the source mob/chest.

### T1 rarity bump (uncommon -> rare)
Tester observation: Rare (blue) affixes/gems were already appearing in T1
Overworld content despite the conversion clamp saying `common-uncommon`.
That's because the "Affix Item Loot Rules" path (fresh affix generation)
isn't clamped by Convert Rarities -- only the convert/reroll path is.
So the natural ceiling was already Rare; the conversion clamp was MORE
restrictive than the dimension's natural drops.

Aligning the clamp to the observed natural ceiling:
- `minecraft:overworld` Affix Convert Rarities: `common|uncommon` -> `common|rare`
- `minecraft:overworld` Gem Dimensional Rarities: `common|uncommon` -> `common|rare`

T2/T3/T4 clamps unchanged. Higher-tier observation data not yet collected.

### Files
- `kubejs/server_scripts/gates/astages_restrictions.js` (9 entries commented out)
- `config/apotheosis/adventure.cfg` (Affix Convert + Gem Dimensional T1 caps bumped)
- Deployed to all 3 distros

---

## 2026-05-14 — Pam's HC2 seeds restored to grass drops (vendor bug workaround)

Tester reported "only Thermal seeds drop from grass". Root cause: Pam's
HarvestCraft 2 declares 3 GLMs (`pamhc2crops:fern_drops` / `grass_drops` /
`tall_grass_drops`) in `data/forge/loot_modifiers/global_loot_modifiers.json`
but ships neither the impl JSON files NOR a registered Java GLM type. They
have been silently dead for the lifetime of the pack -- a vendor bug
documented in the 2026-05-10 changelog entry but not previously worked
around.

### Workaround
`kubejs/server_scripts/loot/grass_pam_seeds.js` -- LootJS modifier that
hooks 4 vanilla blocks (`minecraft:grass`, `minecraft:tall_grass`,
`minecraft:fern`, `minecraft:large_fern`) and adds all 97 Pam's HC2 seed
items as low-individual-chance entries.

Per-seed chance: 0.072% per break. Total expected drop rate across the
pool: ~7% chance of getting some Pam seed per grass break, distributed
uniformly across all 97 crops (agave through zucchini). Tuned so the
seed pool's BREADTH does the work -- every grass session yields surprise
finds across Pam's full crop catalog without flooding the inventory.

Coexists with Thermal Cultivation's working `seeds_from_grass` GLM
(15 modded Thermal seeds, untouched).

### Files
- `kubejs/server_scripts/loot/grass_pam_seeds.js` (new, 3 distros)

---

## 2026-05-14 — Copper variants across all modules + small magic bonuses on inert metal slots

Tester reported the armor workbench falling back to a "Holy" themed-material
display when copper was placed -- root cause: NO module in the pack had a
`tetra:metal/copper` variant. Tetra had no matching entry for copper across
52 modules, so the workbench picked a default (whichever sat at the right
variant-list index, which happened to be themed/holy at index 8 on
breastplate).

### Copper variant added to 52 modules
Cloned each module's iron variant for copper (same `extract` block, just the
`materials` field changed). Tetra's `MaterialVariantData.combine()` auto-scales
`extract.primaryAttributes` by `material.primary`:
- iron primary = 5.0  -> iron-tier stats
- copper primary = 4.0 -> copper stats automatically 80% of iron

Modules affected: 48 armor (chestplate/helmet/boots/leggings, all non-robe
modules) + 4 wand bases + book modules where iron variants already existed.

Skipped: 4 robe-only mage modules (robe_chest, circlet, robed_boot_sole,
robed_leg_plate) -- they don't have iron variants and don't accept metals;
the mage archetype intentionally bypasses metallic armor.

### Inert metal slots: small magic bonus added
Four magic modules had empty `primaryAttributes` on their iron variant --
plain iron gave nothing for those slots. Added a small magic bonus that
applies to BOTH iron and copper, auto-scaled by material.primary:

| Module | New iron variant attribute | iron final (×5) | copper final (×4) |
|---|---|---|---|
| wand/basic_cap | `*irons_spellbooks:mana_regen` | 0.005 raw -> 2.5% | 2.0% |
| wand/basic_inlay | `*irons_spellbooks:spell_power` | 0.005 raw -> 2.5% | 2.0% |
| iss_book/spine | `*irons_spellbooks:cooldown_reduction` | 0.005 raw -> 2.5% | 2.0% |
| ars_book/spine | `**ars_nouveau:ars_nouveau.perk.mana_regen` | 0.005 raw -> 2.5% | 2.0% |

Rationale: copper + iron are the early-game accessible metals; lifting them
above "empty stat" makes early casters' wands and books feel worth crafting
before they have arcane_ingot or aethersteel access.

### Files
- 52 module JSONs in `iridescent-tetra-expansion-mod/src/main/resources/data/tetra/modules/` updated with copper variant
- 4 magic-module JSONs additionally patched with small iron+copper magic bonuses
- Jar rebuilt + deployed to all 3 distros

---

## 2026-05-14 — Armor + wand honing: full archetype-specific stack

### Armor: 80 new hone schematics (major-slot, archetype-gated)

Previously the armor stack had zero hone options (only the 5 archetype
improvements: tempered/runic/streamlined/reinforced/polished). Added a hone
ladder per (archetype, piece) targeting the major slot.

Tetra-API constraint: requirement types only test the target module, so
cross-slot archetype gating on minor slots isn't possible without a custom
Java requirement. Decision: ship major-slot-only hones with strict
`tetra:accepts_improvement` gating. Mirrors the existing armor improvement
pattern. Minor slots remain un-honable for now (revisitable as Phase 2 with
a small custom requirement type if needed).

Matrix (1 stat per archetype-piece, 5 levels each):

| Archetype | Chestplate | Helmet | Boots | Leggings |
|---|---|---|---|---|
| Warrior  | Armor (+2/3/4/5/6) | Armor (+2..+6) | Armor (+2..+6) | Armor (+2..+6) |
| Balanced | Armor (+1..+5) | Armor (+1..+5) | Movement Speed (+1%..+5%) | Armor (+1..+5) |
| Rogue    | Attack Damage (+0.5..+2.5) | Arrow Damage (+0.5..+2.5) | Movement Speed (+1%..+5%) | Movement Speed (+1%..+5%) |
| Mage     | Spell Power (+2%..+14% MULT) | Spell Power | Cooldown Reduction (+0.5%..+3% MULT) | Max Mana (+5..+40) |

Tool gate per level (matches wand): L1 gold / L2 iron / L3 thermal:steel /
L4 diamond / L5 netherite hammers.

Gating: each major-slot module (cuirass / breastplate / robe_chest /
scaled_chest, plus helmet/boots/leggings equivalents) now declares it
accepts a synthetic `tetra:armor/<archetype>_hone/` improvement type. Hone
schematics check `tetra:accepts_improvement` against that type, so the hone
is only available when the matching archetype module is installed in the
major slot.

### Wand: full multi-option menu (3 paths per module)

Previously each wand module had ONE hone path (handle->cooldown_reduction,
core->max_mana, cap->mana_regen, inlay->spell_power). Added two additional
paths per module with mutual-exclusion gating: once the player applies
level 1 of any path on a module, the other two paths are locked out.

| Module | Path A (existing) | Path B (new) | Path C (new) |
|---|---|---|---|
| handle | Cooldown Reduction | Spell Power     | Mana Regen |
| core   | Max Mana           | Mana Regen      | Cooldown Reduction |
| cap    | Mana Regen         | Max Mana        | Spell Resist |
| inlay  | Spell Power        | Crit Chance     | Crit Damage |

20 path-A schematics rewritten to include mutex requirements against the
new B/C paths. 40 new schematics + 8 new improvement files. Apothic
Attributes provides `crit_chance` and `crit_damage`; ISS provides
`spell_resist`. No custom attributes needed.

### Files
- `iridescent-tetra-expansion-mod/src/main/resources/data/tetra/schematics/iridescent_reforging/{chestplate,helmet,boots,leggings}/hone_*.json` (80 new)
- `iridescent-tetra-expansion-mod/src/main/resources/data/tetra/schematics/iridescent_reforging/wand/hone_*.json` (40 new, 20 rewritten)
- `iridescent-tetra-expansion-mod/src/main/resources/data/tetra/improvements/iridescent_reforging/armor_*_hone_*.json` (16 new)
- `iridescent-tetra-expansion-mod/src/main/resources/data/tetra/improvements/iridescent_reforging/wand_*_hone_*_{b,c}.json` (8 new)
- `iridescent-tetra-expansion-mod/src/main/resources/data/tetra/modules/{chestplate,helmet,boots,leggings}/*.json` (16 major-slot modules updated to accept synthetic archetype-hone improvement type)
- `iridescent-tetra-expansion-mod/src/main/resources/assets/iridescent_reforging/lang/en_us.json` (48 new keys)
- Jar rebuilt + deployed to all 3 distros

---

## 2026-05-14 — Mutant Monsters: recipe strip + Hulk Hammer kept as T1 melee drop

Followup to the 2026-05-13 MM drop/XP overhaul. Drops were zeroed via the
`icraft_mm_overrides` Paxi datapack but the 6 in-jar recipes (5 mutant skeleton
armor pieces + creeper_minion_tracker) and JEI item entries remained. User noted
the recipes still showed in JEI -- closing those gaps now and restoring one
signature drop on a tuned curve.

### Recipe strip
`kubejs/server_scripts/recipes/strip_mutant_monsters.js` removes:
- `mutantmonsters:creeper_minion_tracker`
- `mutantmonsters:mutant_skeleton_arms` / `_boots` / `_chestplate` / `_leggings` / `_rib_cage`

### JEI hide
`kubejs/client_scripts/jei_hiding.js` adds 16 MM items: chemical_x potions x3,
creeper_minion_tracker, creeper_shard, endersoul_hand, mutant_skeleton_arms,
_boots, _chestplate, _leggings, _limb, _pelvis, _rib, _rib_cage, _shoulder_pad,
_skull. Spawn eggs stay visible (admin/creative use). **Hulk Hammer stays
visible** -- it's the modified T1 melee drop.

### Hulk Hammer modifications

Native: 9 attack damage / 1.0 attack speed / 64 durability / UNCOMMON / drops
100% from mutant_zombie on player kill.

Modified to "fun T1 melee drop":
- **Attack Damage: 20** (native +8 ADDITION -> +19 ADDITION; total 1 base + 19 = 20)
- **Attack Speed: 0.5** (native -3 -> -3.5 ADDITION; total 4 base - 3.5 = 0.5)
- **Durability: 640** (native 64 x10) -- via reflection on `Item.maxDamage` in
  `kubejs/startup_scripts/hulk_hammer_durability.js`
- **+50% Damage vs Undead** (`iridescent_reforging:damage_vs_undead` +0.5
  ADDITION; existing `deathskin_undead_bonus.js` LivingHurtEvent handler
  multiplies outgoing damage to UNDEAD by `1 + attr`)
- **Innate Knockback II** (baked into the loot drop via `set_nbt` Enchantments
  tag; substituted for user-requested "Punch II" since Punch is bow-only)
- **Drop rate: 25%** on player-killed mutant_zombie (native 100%)

Attribute overrides via `kubejs/server_scripts/hulk_hammer_attributes.js`
subscribing to `ItemAttributeModifierEvent`. Strips native +8/-3 modifiers
via `event.removeAttribute` so the tooltip shows clean single-line stats.

### Files
- `kubejs/server_scripts/recipes/strip_mutant_monsters.js` -- new, 3 distros
- `kubejs/startup_scripts/hulk_hammer_durability.js` -- new, 3 distros
- `kubejs/server_scripts/hulk_hammer_attributes.js` -- new, 3 distros
- `kubejs/client_scripts/jei_hiding.js` -- appended MM block
- `datapack_sources/icraft_mm_overrides/data/mutantmonsters/loot_tables/entities/mutant_zombie.json`
- 3x `config/paxi/datapacks/icraft_mm_overrides.zip` -- rebuilt

### Companion: existing XP boost remains
`kubejs/server_scripts/mutant_xp_boost.js` continues multiplying XP drops 10x
on any mutantmonsters:* entity death. Players still get the XP reward;
mutant_zombie now also has a 25% chance to drop the modified hammer.

---

## 2026-05-14 — None scrolls in chests: regression fix (Paxi loot overrides missing randomize_spell)

### Symptom
Tester reports "None scrolls" appearing in chests — `irons_spellbooks:scroll` items
with no spell inscribed. We previously cleared this for the 5 village house tables
(2026-04 entry) and for the LootJS-injected scrolls in `lootjs_overhaul.js`, but the
issue resurfaced in dungeons, fortresses, ancient cities, end shipwrecks, etc.

### Root cause
The `icraft_loot_overrides` Paxi datapack mirrors mod-native loot tables across 17
namespaces (apotheosis, betterdungeons, betterfortresses, betterstrongholds,
betteroceanmonuments, betterdeserttemples, dungeoncrawl, dungeons_arise,
dungeons_plus, explorify, repurposed_structures, structory, structory_towers,
totw_reworked, valhelsia_structures, minecraft, icraft). The native tables
reference `irons_spellbooks:scroll` directly with no `randomize_spell` function —
so when our overrides duplicated those entries, scrolls dropped blank.

Audit: 487 loot tables contained scroll entries; only **10** had the
`irons_spellbooks:randomize_spell` function applied. The other **477 tables (479
entries) dropped blank scrolls.**

### Fix
Bulk-injected `irons_spellbooks:randomize_spell` into every scroll entry via
tier-aware path classifier:

- **T3 (quality 0.5-0.8)** — End / deeper-darker / ancient_cities (20 files)
- **T2 (quality 0.2-0.5)** — Nether / fortress / warped / crimson / soul / basalt
  / wasteland / obsidian / blackstone (67 files)
- **T1 (quality 0.0-0.2)** — Everything else: overworld dungeons, villages,
  shipwrecks, ruins, ancient cities ocean variants, etc. (400 files)

Path-keyword rules in `/tmp/fix_scrolls.py`; idempotent (re-runs upgrade T1->T3
on previously injected entries when path is reclassified).

Result: 489 scroll entries, 0 missing `randomize_spell` across all 3 distros.

### Retroactive fix for existing blank scrolls
The override-pack fix only takes effect on NEW loot rolls. Existing chests
(already generated) and scrolls already in player inventories still carry the
legacy "None" state. Added `kubejs/server_scripts/randomize_blank_scrolls.js`:
on `PlayerEvents.loggedIn` and `PlayerEvents.inventoryChanged`, scan the
player's main inventory for blank scrolls and bind a random spell via
`ISpellContainer.createScrollContainer`. Spell selection mirrors
`RandomizeSpellFunction` (rarity-weighted: COMMON=40, UNCOMMON=30, RARE=15,
EPIC=8, LEGENDARY=4); T1 quality (0.0-0.2) — scrolls left in chests get
randomized the moment the player picks them up.

### Files
- `datapack_sources/icraft_loot_overrides/data/**/*.json` — 477 files modified
- `config/paxi/datapacks/icraft_loot_overrides.zip` — rebuilt
- `server_distribution/config/paxi/datapacks/icraft_loot_overrides.zip` — rebuilt
- `distribution/client/config/paxi/datapacks/icraft_loot_overrides.zip` — rebuilt
- `kubejs/server_scripts/randomize_blank_scrolls.js` — new file, 3 distros

### Lesson
The previous fix only touched the 5 files Claude could see in a single inspection
pass; the rest of the override pack carried the same bug silently. Any time we
hand-author a loot override for ISS scrolls, the `randomize_spell` function must
be present — adding a programmatic audit pass to lessons-learned.

---

## 2026-05-14 — Infinity Ham: full strip (zero abilities + JEI hide + inventory-tick removal)

User: "we actually want to strip Infinity Ham - it breaks our food setup."

Previous commit zeroed the native `loot.entries` for infinity_ham (no new spawns from Relics' custom GLM), but pre-existing infinity_hams from earlier sessions still tick autophagy onto the wearer, bypassing our hunger balance.

Three-layer kill switch:

1. **Config abilities zeroed** (`config/relics/infinity_ham.json` in 3 distros):
   - `autophagy.feed.{min,max}InitialValue = 0`, threshold = 0, upgradeModifier = 0
   - `infusion.duration.{min,max}InitialValue = 0`, threshold = 0, upgradeModifier = 0
   - Both abilities `requiredLevel = 1000` (unreachable via leveling)
   
   New infinity_hams roll all-zero stats; existing ones with saved NBT stats are unaffected by config but the ability handlers should also no-op at the upper bound math.

2. **JEI hide** (`kubejs/client_scripts/jei_hiding.js`): added `event.hide('relics:infinity_ham')` so creative-mode discovery is suppressed.

3. **Inventory-tick stripper** (`kubejs/server_scripts/strip_infinity_ham.js`, new file): on `PlayerEvents.inventoryChanged` AND `PlayerEvents.loggedIn`, walks the player's main inventory + Curios trinket slots, sets count = 0 on any `relics:infinity_ham` stack. Logs once per session per player.

Net effect: any existing infinity_ham in a player inventory disappears on their next inventory change (or login if already in inventory). New ones never spawn (loot.entries empty). Anyone who summons one via /give still gets the stack removed on next inv-tick.

Why three layers: defense-in-depth. Config-only would leave existing hams ticking until removed; JEI hide doesn't prevent creative summoning; the inventory tick catches all paths.

### Files

- `config/relics/infinity_ham.json` patched (3 distros)
- `kubejs/client_scripts/jei_hiding.js` updated (3 distros)
- `kubejs/server_scripts/strip_infinity_ham.js` new (3 distros)

---

## 2026-05-14 — Relics: actually strip removed relics at the config layer (Relics GLM was bypassing our LootJS removeLoot)

User report: "infinity_ham is still around -- I thought we stripped that?"

### Why it survived

`lootjs_overhaul.js` line 248 lists 15 relics to strip via `event.addLootTypeModifier(LootType.CHEST).removeLoot(r)`. That call removes a relic from any STATIC loot table entry that names it. But Relics doesn't put its items into static loot tables — it ships ONE custom GLM type (`relics:relic_loot`) that runs Java-side and dynamically injects items per its per-relic config:

```
config/relics/<relic>.json -> loot.entries = { "<regex>": <chance>, ... }
```

Each relic config has a regex of loot-table IDs and a chance (`0.025` typical). The GLM evaluates these at runtime AFTER LootJS modifiers run, so `removeLoot('relics:infinity_ham')` never sees the item.

infinity_ham's native config injects at 2.5% in any village chest:
```
"[\\w]+:chests\\/[\\w_\\/]*village[\\w_\\/]*": 0.025
```

### Fix

Set `loot.entries = {}` (empty object) on all 15 "removed" relic configs:

- **Fully removed (13):** infinity_ham, magic_mirror, aqua_walker, amphibian_boot, magma_walker, ice_skates, roller_skates, horse_flute, chorus_inhibitor, elytra_booster, spatial_sign, midnight_robe, ice_breaker
- **Relocated (2):** enders_hand (now exclusive Dragon drop via LootJS), space_dissector (now End+ rare drop) -- their native chest spawn is also zeroed so OUR injection is the only source

Patched `config/relics/<relic>.json` in all 3 distros.

### Other relics with active native drops (NOT touched)

These keep their default Relics-native drop chances (we accept them as-is via our T1-T4 chest pools):
- arrow_quiver, bastion_ring, blazing_flask, drowned_belt, holy_locket, hunter_belt, jellyfish_necklace, leather_belt, rage_glove, reflection_necklace, shadow_glaive, spore_sack, wool_mitten

### Lesson

When a mod ships a custom GLM type for dynamic loot injection, LootJS's static-entry filters can't see it. The fix is at the mod's CONFIG layer, not the loot-modifier layer. Worth a check on any mod with `data/<mod>/loot_modifiers/*.json` -- if it references `<mod>:<custom_type>` and not `forge:add_item` / `forge:replace_item`, LootJS can't touch its output.

---

## 2026-05-13 — Mutant Monsters: strip all item drops, 10x XP

User design call: Mutant Monsters items (hulk_hammer, mutant_skeleton bones/armor, creeper_shard, endersoul fragments/hand, chemical_x) provide marginal value compared to the same content already covered by other mods in the pack. Strip all mutant entity drops; compensate by boosting XP drops 10x so fighting mutants remains rewarding (just rewards levels instead of unique loot).

### Strip via Paxi datapack `icraft_mm_overrides`

15 loot table overrides shipping empty stubs `{"type":"minecraft:entity"}`:

- **Entity loot tables:** creeper_minion, mutant_creeper (strips music_disc + creeper_shard hardcoded path), mutant_enderman, mutant_enderman_continuous (strips ender_eye/pearl), mutant_zombie (strips hulk_hammer), mutant_skeleton, mutant_snow_golem (strips 32-48 snowballs), spider_pig (strips string + inherited pig drops), endersoul_clone
- **Mutant skeleton cluster:** limb, pelvis, rib, shoulder_pad, skull body-part entities
- **Block:** mutant_skeleton_skull (when broken)

Datapack added to `datapack_load_order.json` between `icraft_loot_overrides.zip` and `icraft_ca_overrides.zip`.

### 10x XP via KubeJS LivingExperienceDropEvent

`kubejs/server_scripts/mutant_xp_boost.js` hooks Forge's `LivingExperienceDropEvent`. When a `mutantmonsters:*` entity dies, multiplies the dropped XP by 10. Affects all 8 mutant entities + creeper_minion + endersoul_clone.

Effective XP per kill (vanilla values × 10):
- Mutant zombie: ~50 XP (was 5)
- Mutant skeleton: ~50 XP (was 5)
- Mutant creeper: ~100 XP (was 10)
- Mutant enderman: ~100 XP (was 10)
- Mutant snow golem: ~50 XP (was 5)
- Spider-pig: ~30 XP (was 3)
- Creeper minion: ~10 XP (was 1)

(Exact original XP varies per mutant entity class; these are illustrative.)

### Why strip everything (including vanilla items)

The user said "strip ALL of the Mutant Monsters items" — interpreted broadly to mean strip ALL drops, since the Mutant Monsters drops include vanilla items thematically tied to the mutants (ender_pearl, gunpowder, snowball, music_disc). Mutants now drop only XP, period. If we want vanilla items back later (e.g., spider_pig's pig-loot inheritance), just remove the spider_pig.json override.

### Files

- New Paxi datapack: `icraft_mm_overrides` (15 empty loot tables + pack.mcmeta)
- `config/paxi/datapack_load_order.json` updated in 3 distros
- New KubeJS: `kubejs/server_scripts/mutant_xp_boost.js` deployed to 3 distros
- Datapack zip deployed to 3 distros

---

## 2026-05-13 — Thermal Cultivation crops: auto-replant on right-click harvest

Tester report: "some Thermal crops don't harvest properly - the crop is removed, it doesn't auto-replant." Confirmed via bytecode of `cofh.lib.common.block.CropBlockCoFH.harvest`: the method calls `getPostHarvestAge()`, and if it returns < 0, follows the destroy-block path (drops loot, destroys block) instead of the replant path. The default return is `-1`. None of Thermal Cultivation's crop subclasses override this, so right-click harvest destroys every Thermal crop.

### Fix

New mixin `CropBlockCoFHReplantMixin` in `iridescent-tetra-expansion-mod` (uses existing mixin infrastructure). Injects into `CropBlockCoFH.getPostHarvestAge` HEAD and returns 0 instead. Routes harvest into the replant branch: drops `2 + binomialDist(fortuneLevel, 0.5)` crop items and resets state to age 0.

Affects all CoFH-based crops in the modpack — confirmed by inspection that only Thermal Cultivation extends `CropBlockCoFH`: amaranth, barley, bell_pepper, coffee, corn, eggplant, flax, frost_melon, green_bean, hops, onion, peanut, radish, rice, sadiroot, spinach, strawberry, tea, tomato.

### Why mixin vs KubeJS BlockEvents.rightClicked

KubeJS could cancel the default action and reimplement drop+replant in JS, but:
- The drop math (`binomialDist(fortune, 0.5)`) is non-trivial to replicate
- Right-click handling has timing edge cases
- A single one-method mixin is fewer moving parts than a KubeJS handler

### Files

- `iridescent-tetra-expansion-mod/src/main/java/com/iridescentcraft/reforging/mixin/CropBlockCoFHReplantMixin.java` (new)
- `iridescent_tetra_expansion.mixins.json` -- added CropBlockCoFHReplantMixin to `mixins` array (universal target, server+client)
- `build.gradle` -- added `compileOnly fg.deobf("blank:cofh_core:1.20.1-11.0.2.56")`
- `libs/cofh_core.jar` -- staged from Modrinth CDN
- Jar rebuilt + deployed to 3 distros

---

## 2026-05-13 — light_fragment / midnight_fragment: strip wither-stage gate

Tester confirmed that drop rate is fine (5%), but the actual issue was a player-progression flag gate. celestial_core's loot modifier for `light_fragment` and `midnight_fragment` includes a `celestial_core:player_flag` condition requiring the `NETHER_STAGE` flag, which celestial_core sets ONLY when the player kills a `WitherBoss`. So husks/strays don't drop fragments until the player has killed the wither.

Paxi datapack `icraft_ca_overrides` now overrides both loot modifier JSONs with the `player_flag` condition removed. Husks drop light_fragment at 5%, strays drop midnight_fragment at 5%, from world start. Sakura hairpin and other T1 curios that use these fragments are now genuinely T1-accessible.

Reverted the chance bumps from the previous changelog entry (lightFragmentChance + midnightFragmentChance + sakuraFragmentChance back to mod defaults). User said the rate is fine; the gate was the blocker.

`demon_curse` and `pure_nether_star` keep their NETHER_STAGE gate intact (those are intentional endgame).

---

## 2026-05-13 — Celestial Artifacts re-audit: T1-accessible recipes, tier reshuffles, etching chest drops, flight_ring rare

User design principle: "most curios are T1 unless otherwise specified." Audit found 37 CA recipes blocked by non-T1 ingredients (Nether/End/Wither/Warden/Ocean Monument items); separately, our LootJS tier placements had 11 misplaced items vs gameplay rarity, and 7 etchings (recipe components for ~25 craftable curios) were entity-drop-only and unreachable via chest loot.

### 1. CA recipe overrides (12 recipes, Paxi datapack `icraft_ca_overrides`)

For recipes blocked by a SINGLE swappable non-T1 ingredient, swapped to T1 equivalents (datapack overrides original CA recipes via Paxi load order):

| Curio | Swap |
|---|---|
| yellow_duck | celestial_core:ocean_essence -> minecraft:kelp |
| bearing_stamen | fire_essence -> glowstone_dust, ocean_essence -> kelp, ghast_tear -> slime_ball |
| flame_arrow_bag | blaze_powder -> redstone |
| star_necklace | blaze_powder -> glowstone_dust |
| evil_eye | blaze_powder -> glowstone_dust |
| chaotic_pendant | blaze_powder -> redstone |
| holy_sword | fire_essence -> glowstone_dust |
| solar_magnet | fire_essence -> glowstone_dust |
| war_dead_badge | fire_essence -> coal |
| destroyer_badge | piglin_head -> zombie_head |
| life_bracelet | ghast_tear -> slime_ball |
| undead_charm | shulker_scrap -> rotten_flesh, skeleton_skull -> zombie_head |

Genuine endgame curios (24) keep their non-T1 recipes intact: pure_nether_star, nether_star, totem_of_undying, echo_shard, shulker_scrap, warden_sclerite, heart_of_the_sea, end_crystal, and netherite ingredients are preserved on items like angel_desire/heart/pearl, holy_talisman, sea_god_*, ender_protector, knight_shelter, abyss_will_badge, twisted_scabbard, etc.

### 2. Celestial Core T1 drop chance bumps

`config/celestial_configs/celestial_core-common.toml`:
- lightFragmentChance 0.05 -> **0.10** (husk drops; common-mob throughput)
- midnightFragmentChance 0.05 -> **0.10** (stray drops)
- sakuraFragmentChance 0.10 -> **0.20** (cherry_leaves block break)

Reduces grind for T1 curios that use these fragments (sakura_hairpin, deer_inscribed_amulet, deers_mercy_amulet, holy_necklace, prayer_crown, soul_box, etc.).

### 3. LootJS tier reshuffles in `lootjs_overhaul.js`

11 misplaced items moved:
- **angel_desire** T1 -> T3 (pure_nether_star recipe is endgame)
- **holy_talisman** T2 -> T3 (pure_nether_star + light_fragment + life_etching)
- **holy_sword** T2 -> T3 (fire_essence + light_fragment + soaring_wings)
- **chaotic_pendant** T4 -> T2 (cheap blaze+ender+unowned_pendant recipe; now T1 via override)
- **evil_eye** T4 -> T3 (ender_eye + glowstone via override; mid-power immune)
- **prayer_crown** T4 -> T2 (basic recipe, mid-tier damage recovery)
- **flight_ring** T4 pool -> standalone ultra-rare End+ entry at 0.5% (creative-flight is legendary)
- **twisted_brain** T3 -> REMOVED (entity-only drop per CA design)
- **bearing_stamen** T2 -> T1 (basic plant material recipe via override)
- **soul_box** T3 -> T4 (warden_sclerite + pure_nether_star ingredients)
- **spirit_crown** T4 -> REMOVED entirely (CA jungle_temple GLM covers it at 25%)

Base materials removed from T4 pool: `nebula_cube`, `the_end_dust` (these are crafting components, not curios).

### 4. Etching tier placement (theme-mapped)

Etchings (`desire`, `origin`, `truth`, `life`, `end`, `nihility`, `chaotic`) are required ingredients for ~25 craftable curios. Previously entity-drop only (e.g., chaotic_etching requires wither + explosion damage). Now added to chest pools by theme:

| Etching | Tier | Theme |
|---|---|---|
| desire_etching | T1 | "% with looting" - Overworld combat |
| origin_etching | T1 | "% at y=200+" - sky/build-tall |
| truth_etching | T2 | "raiders" - pillager/raid loot |
| life_etching | T2 | "high-HP mobs" - mid-tier combat |
| end_etching | T3 | "with N+ harmful effects" - Nether conditions |
| nihility_etching | T4 | "abyss damage" - Abyss-themed |
| chaotic_etching | T4 | "explosion damage" - Wither endgame |

Total etching chance per chest is the sum of items in that tier divided by total tier weight (~5% T1, ~9% T2, ~5% T3, ~17% T4).

### 5. Pool count after re-audit

- T1: 5 CA items (was 3)
- T2: 22 CA items (was 20)
- T3: 22 CA items (was 19; gained 4 reshuffles + 1 etching, lost 2)
- T4: 12 CA items (was 16; lost 4 misplaced + 2 base materials + 1 separate-rare + 1 removed; gained 2 etchings + 1 reshuffle)
- Standalone: flight_ring at 0.5% End+

### Files

- New Paxi datapack: `icraft_ca_overrides` (12 recipe overrides + pack.mcmeta) + added to `datapack_load_order.json` between icraft_loot_overrides and icraft_tower_overrides
- Edited: `config/celestial_configs/celestial_core-common.toml` (3 drop chances)
- Edited: `kubejs/server_scripts/loot/lootjs_overhaul.js` (4 tier pools)
- All synced to .minecraft, server_distribution, distribution/client

### Not done in this pass

- Dedup CA's own GLM vs our LootJS T1-T4 pools (deferred per user)

---

## 2026-05-13 — ISS percent attrs: unify on single * MULTIPLY_BASE for linear-additive +X% display

Tester report: tooltips showed "Spell Power (flat)" and "Spell Power (percentage)" simultaneously, confusing because they're the same attribute with different operations. User stated intent: "X% Spell Power" should mean damage increased by exactly X%, with multiple sources stacking additively (linear bucket), and school-specific SP applied as a separate sequential multiplier:

```
damage = base * (1 + sum_of_generic_sp_pct) * (1 + sum_of_school_sp_pct)
example: 10 dmg * 2.50 (+150% generic) * 1.35 (+35% fire) = 33.75
```

### Math context

ISS uses `MagicPercentAttribute` for `spell_power`, school-specific SPs, `mana_regen`, `cooldown_reduction`, all magic resists, etc. Base value is 1.0 (= 100%, no modifier). Spell damage uses `damage * generic_sp * school_sp` (verified by decompiling `AbstractSpell.getSpellPower`).

Forge attribute math:
```
value = (base + sum_ADDITION) * (1 + sum_MULTIPLY_BASE) * prod(1 + each_MULTIPLY_TOTAL)
```

For 4 sources each contributing +5% spell_power (base 1.0):
- `*X` MULTIPLY_BASE: `1.0 * (1 + 0.20) = 1.20` -> +20% damage (linear sum within bucket)
- `**X` MULTIPLY_TOTAL: `1.0 * 1.05^4 = 1.2155` -> +21.55% damage (compound)
- bare ADDITION: `1.0 + 0.20 = 1.20` -> +20% damage (linear, BUT tooltip renders as flat decimal `+0.05`)

### Conversion

Switched ALL 329 ISS percent-attribute usages to **single `*` (MULTIPLY_BASE)**:
- Linear additive stacking within each bucket -> matches user's intuition
- Vanilla tooltip renders single `*` as `+X%` (no longer the ugly `+0.05`)

Pool of converted attributes (26 total):
- `spell_power`, all 9 `<school>_spell_power`
- `mana_regen`, `cooldown_reduction`, `spell_resist`, `cast_time_reduction`, `summon_damage`, `casting_movespeed`
- All 9 `<school>_magic_resist`

NOT converted (intentional ADDITION semantics):
- `irons_spellbooks:max_mana` -- flat `RangedAttribute` base 0.0; `+25` means +25 to mana cap

3 pre-existing `**irons_spellbooks:max_mana` entries in aethersteel/dimlite/terrasteel left as-is (percent-scaled max mana was intentional there).

### Files

- 101 JSON files modified (variant primaryAttributes + material attributes + improvements + datapack)
- Net 329 operation conversions: `**` -> `*`

---

## 2026-05-13 — damage_vs_undead Forge attribute + percent display formatter

Tester report: deathskin tooltip showed "Mana" (max_mana) increase not "Mana Regeneration", and damage_vs_undead was invisible (event-driven, no tooltip line).

### Root cause (mana display)

When the 2026-05-13 deathskin migration created skin/deathskin variants by cloning skin/leather templates, mage-flavored modules (circlet, robe_chest, silk_lining, sash, etc.) inherited the leather variants' `irons_spellbooks:max_mana` overrides in `extract.primaryAttributes`. The material attribute (+2.5% mana_regen) was correct -- the visible "Mana" was stealthy +max_mana from cloning. Same inheritance bug existed for arcane_ingot (cloned iron) and arcane_cloth (cloned wool).

**Fix:** stripped 44 `irons_spellbooks:*` attribute overrides from variant primaryAttributes of skin/deathskin, metal/arcane_ingot, fabric/arcane_cloth across 23 modules. Only `generic.armor` remains in variant overrides; material-level attributes are now the sole source of mana/spell stats from these new materials.

### Root cause (damage_vs_undead invisible)

The KubeJS LivingHurtEvent hook applied a hardcoded 1.05 damage multiplier but there was no corresponding attribute to display in the tooltip. User wanted "a mixin to show the damage to undead attribute."

**Fix:** registered `iridescent_reforging:damage_vs_undead` as a real Forge attribute (new file `IcraftAttributes.java`). Material-defined attributes flow through Tetra's `AttributesDeserializer` into the item's `defaultModifiers`, then vanilla tooltip rendering generates the standard "When equipped: +5% Damage vs Undead" line automatically. No mixin needed -- this is the cleaner pattern.

`PercentRangedAttribute` helper class (new file) implements Apothic Attributes' `IFormattableAttribute` and overrides `toValueComponent` to always render as percent (`attributeslib.value.percent` lang key: value × 100 + %).

deathskin material attributes now:
- `*irons_spellbooks:mana_regen: 0.025`  (+2.5% mana regen)
- `iridescent_reforging:damage_vs_undead: 0.05`  (+5% damage vs undead)

KubeJS hook (`deathskin_undead_bonus.js`) rewritten to READ the attacker's damage_vs_undead attribute value (instead of hardcoded 1.05). The attribute drives both display (tooltip) AND behavior (damage bonus), single source of truth. Stacking is natural via Forge attribute math: 4 deathskin pieces -> attribute sums to 0.20 -> +20% damage vs undead.

### Coverage audit

deathskin is on 52/52 armor modules with a skin tier (100%). Verified via `tools/audit_modules.py` + ad-hoc grep.

---

## 2026-05-13 — Themed school SP: strip variant overrides + extend ISS fire_focus tag to cinder_essence

Two follow-ups to the earlier ISS-Tetra-materials commit:

### 1. Strip variant SP overrides (416 entries across 52 modules)

Per the heads-up in the previous changelog entry: the themed/X armor variants on each module had legacy `irons_spellbooks:<school>_spell_power: 0.05` (+5%) entries in `extract.primaryAttributes`. With the new material attribute of +10% on themed/X, the two stacked to roughly +15.5% per piece -- not what we wanted.

Stripped ALL school-SP overrides from variant primaryAttributes for the 9 themed schools (fire/ice/lightning/holy/blood/nature/ender/shadow/eldritch). Armor value (`minecraft:generic.armor`) is preserved -- only school SP overrides removed. Net effect per themed/X armor piece is now exactly the material attribute: `+10% <school>_spell_power` multiplicative.

Verification: `themed/fire` variant on boots/basic_boot_sole now has only `{ "minecraft:generic.armor": 0.42 }` in primaryAttributes (was: `{ "minecraft:generic.armor": 0.42, "irons_spellbooks:fire_spell_power": 0.05 }`).

### 2. Fire rune crafting accepts cinder_essence ONLY (blaze_rod disabled)

New Paxi datapack `icraft_iss_overrides` REPLACES the ISS `irons_spellbooks:fire_focus` item tag with `["irons_spellbooks:cinder_essence"]`. `"replace": true` removes vanilla blaze_rod from the focus pool entirely -- fire runes can ONLY be crafted with cinder_essence.

Originally this was `replace: false` (additive); user follow-up requested blaze_rod removal so the mod-internal cinder_essence is the canonical fire focus.

blaze_rod still works for vanilla recipes (brewing potions, magma cream crafting, etc.) -- only the ISS fire_focus tag is restricted.

Structure:
```
icraft_iss_overrides/
  pack.mcmeta              (format 15 for 1.20.1)
  data/irons_spellbooks/tags/items/fire_focus.json
```

Added to `config/paxi/datapack_load_order.json` between `icraft_skills.zip` and `icraft_apotheosis_affixes.zip` (early in load order; ISS tag overrides should resolve before other datapacks scan the tag).

### Note on user terminology

User said "fire essence" -- ISS only has `cinder_essence`, no `fire_essence`. Used cinder_essence (the canonical ISS fire-themed material from Ancient Knight drops).

---

## 2026-05-13 — ISS items as Tetra materials: Arcane Ingot + Arcane Cloth + school focus item upgrades

Added 2 new Tetra materials and upgraded the 5 school-themed materials to use canonical ISS focus items instead of vanilla placeholders.

### New materials (mod jar resources)

- **`tetra:metal/arcane_ingot`** (Battlemage metal)
  - Item: `irons_spellbooks:arcane_ingot`
  - Primary: 3.5 (between gold 2 and iron 4)
  - Durability: 200 (iron is 250), IntegrityGain: 3 (iron is 4)
  - MagicCapacity: 150 (much higher than iron, mage-leaning)
  - Attributes: `**irons_spellbooks:spell_power +5%`, `**irons_spellbooks:mana_regen +5%`
  - Armor variants: copy of iron's primaryAttributes scaled to 90% (slight armor reduction)
  - 48 armor module variants added (every module that accepts metal/iron)

- **`tetra:fabric/arcane_cloth`** (mage cloth)
  - Item: `irons_spellbooks:magic_cloth`
  - Primary: 1, magicCapacity: 100, durability: 60
  - Attributes: `**irons_spellbooks:mana_regen +2.5%`
  - 20 armor module variants added (every module that accepts fabric/wool: robes, paddings, linings, straps, belts)

### Upgraded themed/* materials (swapped to ISS focus items + +10% school-specific SP)

| material | old item | new item | old attribute | new attribute |
|---|---|---|---|---|
| themed/fire | minecraft:blaze_rod | `irons_spellbooks:cinder_essence` | spell_power +5% | fire_spell_power +10% |
| themed/ice | minecraft:blue_ice | `irons_spellbooks:frozen_bone` | spell_power +5% | ice_spell_power +10% |
| themed/lightning | minecraft:redstone | `irons_spellbooks:lightning_bottle` | spell_power +5% | lightning_spell_power +10% |
| themed/holy | minecraft:glowstone_dust | `irons_spellbooks:divine_pearl` | spell_power +5% | holy_spell_power +10% |
| themed/blood | (deleted 2026-05-13 deathskin migration) | `irons_spellbooks:blood_vial` | n/a | blood_spell_power +10% |

themed/blood was reinstated with `blood_vial` -- this is NOT the same as the rotten_flesh themed/blood that was deleted. blood_vial doesn't conflict with `skin/deathskin` (rotten_flesh), so the two materials coexist cleanly as parallel "blood-themed" identities:
- skin/deathskin (rotten_flesh): defensive/utility, undead damage + mana_regen
- themed/blood (blood_vial): offensive, +10% blood school spell power

52 themed/blood variants re-added to armor modules (mirrors yesterday's deletion shape with new item).

### Fire-focus replacement rationale

`cinder_essence` is the ISS-native fire-themed crafting material per iron.wiki/1_19/items/ -- dropped from Ancient Knights, used as the upgrade-orb ingredient for fire-school upgrade orbs. Replaces the vanilla blaze_rod dependency in themed/fire. blaze_rod stays usable for vanilla recipes (brewing potions of strength, magma cream crafting, etc.) -- the change is mod-internal.

NOTE: this doesn't update the ISS `irons_spellbooks:fire_focus` item tag (which still only contains `minecraft:blaze_rod`). If you want fire runes craftable from cinder_essence directly, that needs a Paxi datapack adding cinder_essence to the fire_focus tag -- separate change.

### Variant attribute layering for school themed materials

The themed/X material attribute (e.g. fire_spell_power +10%) is multiplicative on the equipped item. The variant's `extract.primaryAttributes` for themed/X variants currently still has the OLD overrides like `irons_spellbooks:fire_spell_power: 0.05` from the legacy `themed` armor pattern. Tetra ADDS the variant override on top of the material attribute. Net per piece:
- Variant override: +5% fire SP (additive, MULTIPLY_BASE)
- Material attribute: +10% fire SP (multiplicative-total, **)
- Combined: roughly +15.5% (varies by base attribute math)

If we want exactly +10% (not stacked), a follow-up pass needs to strip the variant SP override from each module's themed/X variant. Not done in this commit -- ship the additive stacking and verify in-game first.

### Lang

- 156 new lang entries: 3 material name + 3 prefix lines + 156 variant entries (48 arcane_ingot + 20 arcane_cloth + 52 blood + 36 extras)

### gen_repair_definitions.py

- Added MATERIAL_ITEM_MAP entries for `arcane_ingot` and `arcane_cloth` so future builds emit `*__arcane_ingot.json` and `*__arcane_cloth.json` repair tables

---

## 2026-05-13 — Deathskin: unify rotten_flesh material, kill themed/blood, add undead damage bonus

User report: rotten_flesh on armor was showing as "Blood / blood_spell_power" but had been originally spec'd to "holy damage." Audit traced this to TWO materials accepting `minecraft:rotten_flesh`:
- `themed/blood` (mod jar): `spell_power +5%`, used by every armor module's themed/blood variant which adds `blood_spell_power +5%` on top -> "Blood" identity on armor
- `skin/rotten_flesh` (datapack): `holy_spell_power + mana_regen + spell_power`, used by 4 book modules -> "Rotten Flesh / Holy" identity on books

That's why the same item displayed two ways depending on container slot. User decision: unify into a single `Deathskin` identity with `+5% damage vs undead, +2.5% mana regen`.

### Changes

**Material:**
- Renamed datapack file `skin/rotten_flesh.json` -> `skin/deathskin.json`. Key changed `rotten_flesh` -> `deathskin`. Attributes reduced to `**irons_spellbooks:mana_regen: 0.025` (multiplicative-total, +2.5%). The undead damage bonus is event-driven (see below) since no Forge / Apothic / ISS attribute exists for "damage vs undead."
- Deleted `iridescent-tetra-expansion-mod/.../materials/themed/blood.json` entirely. Rotten flesh now resolves uniquely to `skin/deathskin`.

**Armor modules (52 total: helmet/chestplate/leggings/boots * 13 majors+minors):**
- Removed all 52 `themed/blood` variants
- Added 52 `skin/deathskin` variants. Each new variant mirrors the module's `skin/leather` variant's `primaryAttributes` (armor value) -- deathskin armor is leather-tier with mana_regen bonus + undead damage from the KubeJS hook.

**Book modules (4): ars_book + iss_book front/back_cover** -- `tetra:skin/rotten_flesh` references rewritten to `tetra:skin/deathskin`; variant keys `front_cover/rotten_flesh` etc. renamed to `*/deathskin`.

**Repair tables:**
- Deleted 16 armor `*__blood.json` repair files (the themed/blood material is gone, so no repairs needed)
- Renamed 2 book `*__rotten_flesh.json` -> `*__deathskin.json`
- Added `deathskin` to `gen_repair_definitions.py` MATERIAL_ITEM_MAP so future builds emit 52 new `*__deathskin.json` repair tables

**Lang:**
- Removed `tetra.material.blood`, `tetra.material.blood.prefix`, plus 52 `tetra.variant.<module>/blood` entries
- Renamed `tetra.material.rotten_flesh` -> `tetra.material.deathskin: "Deathskin"`
- Renamed 4 book `tetra.variant.<X>/rotten_flesh` entries to `<X>/deathskin`
- Added 52 new `tetra.variant.<module>/deathskin: "Deathskin <Pretty Module Name>"` entries

**KubeJS undead damage hook (`kubejs/server_scripts/deathskin_undead_bonus.js`):**
- Subscribes to `LivingHurtEvent` (NORMAL priority)
- Checks if target's `MobType == UNDEAD` (covers skeleton/zombie/wither_skeleton/phantom/stray/husk/drowned/zombie_villager/etc.)
- Scans attacker's 4 armor slots; for each Iridescent Reforging modular armor, looks for `'/deathskin'` substring in the stack's NBT tag string (robust against Tetra version-specific NBT layout)
- If any slot has a deathskin module, multiplies the damage amount by 1.05 (single instance flag, doesn't stack with multiple deathskin pieces)
- Affects ALL outgoing damage (melee, ranged, spells) -- the user wanted broad "vs undead" bonus, not melee-only

### Files

- New: `.minecraft/kubejs/server_scripts/deathskin_undead_bonus.js` (3 distros)
- Modified: 52 armor module JSONs, 4 book module JSONs, 2 lang files, 1 datapack material file, `gen_repair_definitions.py`
- Deleted: 1 mod-jar material file (`themed/blood.json`), 16 repair files (`*__blood.json`)
- Renamed: 1 datapack material file, 2 repair files
- Repacked datapack zip in 3 distros

### Why not just rename without the rest

The user observed the duplicate-identity problem ("blood/blood magic" vs "holy") because TWO materials accepted rotten_flesh as input. Renaming one wouldn't have fixed which one Tetra picked at variant resolution -- the duplicate had to be deleted. Removing `themed/blood` entirely was the cleanest cut; the school can be re-introduced later with a different source item if desired.

---

## 2026-05-13 — Skeleton Punch-arrow knockback: LootJS strip on Majrusz skeleton bows

Tester report: solo skeletons / skeleton jockeys randomly cause huge knockback. Distinct from the 2026-05-04 Apotheosis Levitation affix issue (resolved). Investigation traced the root cause to Majrusz Progressive Difficulty's `MobGroups.tryToSpawnGroup` subscribing to `OnEntitySpawned` and applying `majruszsdifficulty:mob_groups/skeleton_leader` equipment to 10% of normal-stage skeleton spawns. The leader's bow loot table uses `minecraft:enchant_randomly` with no filter, so **Punch I/II** can roll. Same pattern in `mob_groups/skeleton_sidekick` and every `undead_army/wave_N_skeleton` table. When sidekick spawn fails (terrain block), the leader walks alone — "solo huge-knockback skeleton."

### Fix

`kubejs/server_scripts/loot/majrusz_skeleton_punch_strip.js` — LootJS modifier that filters bows from 7 Majrusz skeleton tables and removes `minecraft:punch` from the rolled enchantments. Other outcomes (Power / Flame / Infinity / Unbreaking) preserved.

Tables covered (regex):
- `majruszsdifficulty:mob_groups/skeleton_(leader|sidekick)`
- `majruszsdifficulty:undead_army/wave_[0-9]+_(wither_)?skeleton`

Mechanism: `event.addLootTableModifier(re).modifyLoot(bowFilter, stripPunch)`. The `stripPunch` callback reads the stack's `Enchantments` NBT list, removes entries with `id == "minecraft:punch"`, returns the modified stack to replace the original in the loot pool.

### Why not the global knockback cap

`cap_player_knockback.js` (cap=0.5) is in place and firing per-event (server logs from 5/10 confirm it capping ratio magnitudes of 4-5 down to 1.0). But the cap is per-event — multiple skeletons firing simultaneously in a group each trigger separate `LivingKnockBackEvent`s, so 3 arrows in 1 tick = 3 × 0.5 = 1.5 of impulse total. The cap stops one-shot launches but doesn't compose across multi-arrow barrages from grouped spawns. Removing Punch at the source kills the compound effect.

### Tangential: chain armor on the same skeletons

User also observed "full chain armor" on the offending skeletons. Tracing that: Majrusz's `crd_penalty` is currently `0.0` for all stages, so Progressive Difficulty isn't boosting regional difficulty. Chain comes from **vanilla `Mob.populateDefaultEquipmentSlots`** rolling armor at high `RegionalDifficulty.getSpecialMultiplier()` (~1.5+, which late-game chunks naturally reach), plus Apotheosis Adventure `Random Affix Chance = 0.11` replacing one slot with a random-tier affix piece. Majrusz `skeleton_leader` loot table grants leather (67% per slot), so the leader's mixed leather+vanilla-chain outfit can leave ~33% per slot as vanilla-rolled chain. Decision (2026-05-13): leave chain armor alone for now; ship the Punch-strip first and re-evaluate skeleton tanky-ness post-fix.

### Files

- New: `.minecraft/kubejs/server_scripts/loot/majrusz_skeleton_punch_strip.js` (94 lines, deployed to all 3 distros)
- Updated: `.minecraft/wiki/known-issues/tracker.md` (new entry under the resolved Levitation entry)

---

## 2026-05-12 — Food-mod overlap audit: remove Simple Farming, dedup ~86 items across Thermal/Blue Skies/VC/Pam FoodExt/FD addons

Audited 18 food/cooking mods (Pam HC2 stack, FD + 6 addons, Brewin', VC, Cooking 4 Blockheads, Refined Cooking, Simple Farming, SoL Carrot, Create Estrogen, Tetra's Delight). Detected 171 cross-mod food/item dupes within the food-mod set. Widened the scan to non-food mods that add crops: Thermal Cultivation (14 Pam dupes), Blue Skies (legacy_pack filtered to 1), Aquaculture (3), Naturalist (2), Supplementaries (2), and one-off dupes across 6 more mods.

### Decisions (per user audit responses)

- **Pam HC2 wins crops + raw produce.** It has the largest content area and is the cleanest canonical for tomato/onion/rice/corn/eggplant/etc.
- **Farmer's Delight wins prepared dishes** where it has one; FD addons (Cultural, Delightful, Brewin', Nether's, Ocean's, Alex's) win their themed dishes.
- **Simple Farming removed entirely** — 295 items, ~108 cross-mod overlap rows resolved. Pam HC2 covers everything SF added; SF's unique recipes (banana_bread, blackberry_pie) have Pam HC2 equivalents.
- **Thermal Cultivation crop dupes hidden** via KubeJS; phytosoil + watering can + unique items (frost_melon, sadiroot, coffee, tea, mushrooms) retained.
- **Blue Skies maple_sapling hidden** (only real overlap after legacy_pack lang filter).
- **Vanilla Cookbook duplicates hidden** (28 items: apple_pie, fruit_salad, pumpkin_soup, etc.). VC retains unique flavor items.
- **Pam FoodExt internal duplicates hidden** (8 items: bakedbeans/carrotjuice/chocolatemilk/etc. that also exist in Crops/FoodCore).
- **Cultural Delights raw-crop dupes hidden** (13 items: avocado/cucumber/eggplant/ginger/etc. + smoked variants). Its prepared dishes (kimchi, fish tacos, tortilla wraps) stay.
- **Delightful raw dupes hidden** (3 items: acorn, cantaloupe, cantaloupe_seeds). Its prepared dishes (baklava, blueberry pie, smore, chorus muffin) stay.

### Files

- **Removed:** `simple-farming.pw.toml` from all 3 distros (`mods/.index/`).
- **Added:**
  - `kubejs/client_scripts/food_dedup_jei_hide.js` — hides 86 dupe items from JEI search
  - `kubejs/server_scripts/food_dedup_recipes.js` — removes crafting recipes that produce the dupes
  - Both deployed to `.minecraft/`, `server_distribution/`, `distribution/client/`
- **Updated:** `kubejs/server_scripts/skills/skill_effects.js` — dropped `'simple_farming'` from crop-yield bonus substring list, added `'thermal'`.

### Items hidden (86 total)

- Thermal Cultivation: 33 (crops + cooked variants + dough/flour/peanut_butter/spring_salad/stuffed_pepper)
- Vanilla Cookbook: 28 (apple_pie, fruit_salad, pumpkin_soup, chocolate_cake, melon_juice, milk_bottle, cooked_egg, etc.)
- Cultural Delights: 13 (raw crops + smoked variants + tortilla)
- Pam HC2 FoodExt: 8 (internal Core/Crops dupes)
- Delightful: 3 (acorn, cantaloupe, cantaloupe_seeds)
- Blue Skies: 1 (maple_sapling)

### Soft cleanup semantics

Items are HIDDEN from JEI (visible in inventory if a player already has one). Recipes are REMOVED from crafting tables / smokers / cooking pots. World-placed dupe blocks still work (Thermal's tomato plant grows; the harvested tomato just isn't visible in JEI search). Existing player stacks aren't touched. To fully purge them, players can drop stacks into lava manually; we don't auto-confiscate.

### Why not just remove ALL the dupe mods

- Thermal Cultivation: phytosoil watering mechanic is unique + has 50 non-overlapping items.
- Blue Skies: it's a dimension mod; its 1 overlap doesn't justify dropping it.
- Vanilla Cookbook: retains 100+ unique flavor recipes/items after dedup; cheap to keep.
- Cultural Delights / Delightful: own a large chunk of unique prepared dishes.
- Pam HC2 FoodExt: still wanted for its 800+ unique items; just the 8 internal Core dupes get hidden.

### What's NOT touched

- Tetra's Delight: 0 food items (Tetra material patch for FD knives/machetes). Kept.
- Cooking 4 Blockheads: utility blocks only; cutting_board overlap with FD is by design (CFB's is the upgrade station).
- Refined Cooking: 3 items, RS integration; no overlap.
- SoL Carrot: 1 item, diversity mechanic.
- Create Estrogen: 6 items, dairy theme; minor overlap, kept.
- Brewin' & Chewin' / Nether's / Ocean's / Alex's Delight: minor 1-2 item overlaps not worth scripting.

---

## 2026-05-12 — Drop-wand tier ladder: T1/T2/T3/T4 = +15/25/35/45% SP/MR/CDR across SS elementals, Dan's Magic, ISS staves

Extended the wand base-attribute wiring beyond the 6 Simple Staves vanilla material wands (which were on the craftable 5-30% ladder via `SimpleStavesWandAttributes`) to all non-Tetra droppable wands and staves across three mods. Renamed the class `SimpleStavesWandAttributes` -> `WandTierAttributes` since scope is no longer SS-specific.

### Tier scheme

Drops sit ABOVE craftable wands -- loot reward > crafted reward. The two ladders coexist:
- Craftable ladder (Simple Staves vanilla wands): wood 5% / stone 10% / iron 15% / gold 20% / diamond 25% / netherite 30%
- Drop ladder: T1 = +15%, T2 = +25%, T3 = +35%, T4 = +45% on top of any mod-defined base attributes

### Drop-wand tier assignments (24 items)

**T1 (+15%):**
- ISS entry: `wimpy_spell_book`

**T2 (+25%):**
- Simple Staves elementals (all 9 uniform): `flame_wand`, `veil_wand`, `void_wand`, `tenebrium_wand`, `wind_essence_wand`, `viritium_wand`, `venomite_wand`, `thunder_wand`, `explosion_wand`
- ISS early: `blood_staff`

**T3 (+35%):**
- Dan's Magic staves (all 5 uniform): `dna:ice_staff`, `dna:toxic_staff`, `dna:tnt_staff`, `dna:lightning_staff`, `dna:magma_staff`
- ISS mid: `graybeard_staff`, `ice_staff`
- ISS unique drop: `cursed_doll_spell_book` (Vampiric)

**T4 (+45%):**
- ISS late + endgame: `improved_blood_staff`, `pyrium_staff`, `staff_of_the_nines`

### Tier rationale

Uniques are tiered as standalone items, NOT by recipe inputs. The recipe handle (stick / iron_stick / netherite_stick) is irrelevant for non-Tetra wands -- only the 6 SS vanilla material wands belong to the material-progression ladder (they convert to reforged_wand).

- SS elementals: 9 themed crafted uniques with no clear in-mod hierarchy -> flat T2.
- DM staves: 5 themed crafted uniques, all share `staff_base` recipe -> flat T3.
- ISS staves: bumped one tier above natural ISS progression (blood T2, graybeard/ice T3, improved_blood/pyrium/nines T4). ISS staves are rarer + carry mod-defined attributes already, so they sit at the top of the drop ladder.
- ISS books: wimpy stays T1 as the literal starter; cursed_doll (Vampiric) bumped to T3 for "unique mob drop" theme.

### Mechanism (unchanged from SS class)

`ItemAttributeModifierEvent` -> `addModifier(SP_ATTR/MR_ATTR/CDR_ATTR, pct)` keyed by item ID. Item-level (not player-tick), shows in tooltips, layered with mod-defined attributes additively. Stable UUIDs across hover/equip queries.

### Files

- Renamed `SimpleStavesWandAttributes.java` -> `WandTierAttributes.java`; expanded `TIER_PERCENT` map from 6 to 30 entries.
- Class auto-registers via `@Mod.EventBusSubscriber` so no other wiring needed.

### Tester impact

Loot drops that previously had no SP/MR/CDR signal (Blood Staff, Pyrium Staff, etc.) now carry visible tooltip stats and contribute to the mage's spell stats while held. Ladder remains uncapped (mage power-curve memory).

---

## 2026-05-12 — Client log mirror: surface git errors + auto-heal divergence

Tester reported "git pull failed" at PrismLauncher launch + their `TesterLogs/silvieserene/latest.log` on the remote was stuck at `May 6 03:47` despite six days of play sessions. Root cause: `prism_postexit.bat` ran `git commit` and `git push` with `>nul 2>&1`, so any push failure (auth, network, divergence) was invisible. Once a single push failed, the local TesterLogs commit sat on `main` ahead of `origin/main`; the next prelaunch's `git pull --ff-only` then couldn't fast-forward, the WARNING ran past too fast to read, and every subsequent postexit push compounded the divergence. Net effect: silent 6-day log mirror outage.

### Fix

**`prism_postexit.bat`** — Strip `>nul 2>&1` from `git commit` and `git push`. Add `git fetch` + `git pull --rebase --autostash` before push to absorb any upstream commits (the normal case after the first failed-push session). On rebase conflict, `git rebase --abort` cleans up and the script surfaces the manual-recovery steps. On push failure, surface "logs committed locally only" with the credential-manager hint. Self-healing: next launch the rebase+push absorbs the accumulated local commit stack and ships it.

**`prism_prelaunch.bat`** — When `git pull --ff-only` fails, fall back to `git pull --rebase --autostash` so a session that hit the divergence can auto-recover at launch time (not just at next exit). If THAT also fails (real conflict with origin), abort the rebase cleanly and continue with the existing tree — the user still gets into the game.

### Why

The original silenced-error pattern was load-bearing for "this script never blocks PrismLauncher from finishing the exit" — but redirecting stderr to nul also hid the actionable error text. The fix preserves "never block exit" (script always `exit /b 0`) while surfacing errors to the launcher console where the user can see them. Rebase-with-autostash is the safe recovery shape: it touches only the user's `main` HEAD pointer, never their working-tree edits.

### Files touched

- `.minecraft/prism_postexit.bat` — rewrote git-flow tail (lines ~70-end)
- `.minecraft/prism_prelaunch.bat` — added rebase fallback to the Phase 1 pull (lines ~58-78)

### Tester action

After this lands on `origin/main`, the user's next launch should:
1. Phase 1 prelaunch sees ff-only fail (existing divergence), falls back to rebase, succeeds
2. Game launches normally
3. Phase 5 postexit copies logs, commits, fetches, rebases (no-op now), pushes — push succeeds
4. `TesterLogs/silvieserene/latest.log` on the remote updates to the live session

If for some reason rebase still fails (unlikely — local commits should only be log commits which can't conflict with our jar/lang changes), the manual recovery banner now appears in the launcher console.

---

## 2026-05-12 — Modded armor variant systemic fix: register 13 missing materials, normalize 20 suffixes, populate book vanilla tiers

Tester screenshot evidence (modded chestplate + helmet) showed module-slot variants displaying doubled keys like `padded_lining/dd_wardeniron`, `simple_trim/bs_pyropeiron`, `slit_visor/bs_diopsideiron`. These were the deferred modded variants from the 2026-05-11 doubling-fix sweep finally surfacing in the wild — every modded armor piece converted to a reforged armor item displays garbage in the workbench slots.

### Root cause audit (cross-replacement vs variant)

Built a cross-reference audit script (matches every replacement-file stamp against every module-variant expansion). Found **328 unresolvable stamps**:

- 320 modded armor stamps (20 modded suffixes × 16 armor modules). Variants had key shape `<module>/<modded_suffix>` with placeholder `materials: [tetra:metal/iron]`. Tetra's `MaterialVariantData.combine()` produced `<module>/<modded_suffix>iron` (doubled).
- 14 book stamps. ISS replacement files for vanilla iron/gold/diamond/netherite/copper spell books stamped `front_cover/iron` etc., but the book modules had no `iron`/`gold`/`diamond`/`netherite`/`copper` variants registered. Lookup fell to variantData[0] (leather). Visible symptom: vanilla iron spell book renders with leather front_cover.
- 1 dye stamp (resolves via `tetra:fibre/` category wildcard at module-load).

Cross-reference with the existing `icraft_tetra_materials` datapack: of the 20 modded suffixes, 0 exactly matched a registered material. 7 could be **renamed** to match existing (e.g., `tf_fiery` → `fiery`, `ug_cloggrum` → `undergarden_cloggrum`). 13 needed **new** registrations.

### Fix (this commit)

**13 new Tetra material registrations** under `icraft_tetra_materials/data/tetra/materials/<cat>/<key>.json`. Format mirrors vanilla Tetra's iron.json structure: `key`, `category`, `primary`/`secondary`/`tertiary`, `durability`, `integrityCost`/`Gain`, `magicCapacity`, `toolLevel`, `tints`, `textures`, `material.items`, `conditions: [{forge:mod_loaded modid}]`, and per-mod-theme `attributes` (e.g., `cm_ignitium` gets `fire_spell_power: +0.10`, `dd_warden` gets `ender_spell_power: +0.10`). Stats are iron-tier baseline with per-mod overrides where tier context was obvious; per-mod balance refinement is a follow-up pass. The 13: `aether_neptune`, `aether_obsidian`, `bs_pyrope`, `cm_ignitium`, `dd_resonarium`, `dd_warden`, `diamond_no_t` (generic diamond-tier fallback), `fa_draco_arcanus`, `fa_mortem`, `fa_tyr`, `tf_arctic`, `tf_naga`, `tf_yeti`.

**20 modded variant collapses + 7 suffix renames** across 16 armor module files. For each named variant of the form `key: "<module>/<modded_suffix>"` with placeholder `materials: [tetra:metal/iron]`, the key is rewritten to wildcard form `<module>/` and the material reference is rewired to point at the registered Tetra material. The 7 renamable suffixes get their final-key changed in lockstep (`tf_fiery` → `fiery`, etc.), with all referencing replacement files updated to match. Tetra's `MaterialVariantData.combine()` now produces clean expanded keys matching what the replacements stamp.

**28 duplicate-placeholder variants dropped** from the 4 major armor module files (basic_boot_sole, breastplate, basic_crown, full_leg_plate). After the 7 renames, the renamed-from-`tf_X` wildcards collided with pre-existing wildcards already pointing at the same materials; the placeholder-stat versions were dropped to preserve the authored stat profiles.

**29 vanilla material variants added to book modules**: iron/gold/diamond/netherite/copper for `front_cover`, `back_cover`, `spine` in both `ars_book` and `iss_book`. Plus a `tetra:fibre/paper` variant for `iss_book/pages`. Now vanilla ISS spell books (iron/gold/diamond/etc.) display the correct material on each module slot post-conversion.

**112 stamp renames** across 28 modded-armor replacement files for the 7 suffix-renamed materials. Replacements now stamp `padded_lining/fiery` instead of `padded_lining/tf_fiery`, etc.

**Modded variants normalized**: integrity=2 / magicCapacity=5 on every major-module modded variant (mirrors the canonical vanilla wildcard major pattern), integrity=0 on every minor-module modded variant (no-consume).

### Post-fix audit

- Unresolvable stamps: 0 (was 328)
- Duplicate expanded variants: 0
- `variant_suffix_no_match` audit warnings: 0 (was 320)
- `major_module_no_magic_capacity`: 84 → 4 (4 residual book entries; not tester-facing)

Repair JSONs regenerated (659 total — fewer than 687 previously because the collapsed modded variants share material entries instead of duplicating per-suffix). Jar rebuilt + deployed to all 3 distros.

### Known follow-up

Mod-item-ID guesses in the 13 new material JSONs use mod-naming-convention (`forbidden_arcanus:tyr_ingot`, `deeperdarker:warden_bone`, etc.). Each ID needs verification against the actual mod jar — wrong IDs cause repair-tab item rejection but don't affect rendering or stat resolution. Tracked as a verification pass.

The repair-tool implement requirement reported by the tester (separate from the doubled-variant issue) still needs investigation; this commit's repair JSONs continue the no-`requiredTools` pattern from the 2026-05-12 socket-pattern fix. If the implement requirement persists post-jar-update, the source is likely workbench-tile-level rather than per-repair-definition.

---

## 2026-05-12 — Custom armor + wand repair: drop `requiredTools` to match base Tetra socket pattern

Tester report: workbench Repair tab on reforged armor required an iron hammer (implement). Base Tetra socket repairs (e.g. `data/tetra/repairs/sockets/double/pristine_diamond.json`) accept the material with no hammer needed — verified by extracting `tetra-1.20.1-6.12.0.jar` and inspecting the 35 stock repair JSONs (17 require tools, 18 don't; all 18 no-tool entries are socket-related). The "no-tool" shape simply OMITS the `requiredTools` field from the JSON; Tetra deserialises absent as an empty `ToolData` and `RepairSchematic.getRequiredToolLevels` returns an empty map.

Our `tools/gen_repair_definitions.py` was emitting `requiredTools: {"hammer_dig": "minecraft:iron"}` (or `diamond` for netherite-tier materials) on every one of the 687 generated repair JSONs — armor and wand alike. Workbench Repair tab refused the material unless the player had the implement in the tool slots.

### Fix

`tools/gen_repair_definitions.py` `emit_repair()` no longer writes `requiredTools` to the output JSON. The MATERIAL_ITEM_MAP still tracks per-material tool tiers (HAMMER_IRON / HAMMER_DIAMOND) so reinstating an implement requirement later is a one-line revert if a tier ever warrants gating. Tetra's RepairDefinition class treats missing `requiredTools` as null/empty — same semantics as base Tetra's socket repair JSONs.

Regenerated 687 repair JSONs. Sample post-fix shape (armor):

```json
{
  "material": {"items": ["minecraft:iron_ingot"], "count": 2},
  "moduleKey": "chestplate/chest_plate",
  "moduleVariant": "breastplate/iron"
}
```

Workbench now accepts the listed material at the repair tab with no implement requirement. Matches the "feels like anvil repair" UX the tester expected from base Tetra.

Jar rebuilt and deployed to all 3 distros.

---

## 2026-05-12 — Client launcher: fix silent mod-download failure + bat self-update propagation

Tester report: after `fcacdd48` (Dan's Magic + Simple Staves added 2026-05-10), the two staff mods failed to auto-download on the next launch. Manual mod copy was required.

### Root causes (two compounding bugs)

1. **`install.ps1` line 230 omitted `download_mods.ps1`** from the post-install copy loop. Fresh installs had `sync_client.ps1`, `sync_client.bat`, and `cleanup_stale_jars.ps1` in the instance but not `download_mods.ps1` — so step 4b of `sync_client.ps1` silently no-op'd whenever it looked for the script at `$instanceMC\download_mods.ps1`. The fallback at line 396 (`Join-Path $src 'distribution\client\download_mods.ps1'`) only resolved on the full-zip overlay path where `$src` was defined; the diff-sync path left `$src` unset and the fallback skipped.

2. **`sync_client.ps1` diff path dropped launcher-script updates at line 184.** The filter `if (-not $inOverlay -and $relPath.Contains('/'))` was intended to allow top-level scripts (no `/` in path) through while filtering out unrelated nested files. Launcher scripts live at `.minecraft/distribution/client/<script>` — `$relPath` ends up as `distribution/client/<script>` which contains `/`, AND `distribution/` isn't in `$overlayDirs`, so the filter skipped them. The `.new` staging block at line 196-209 was unreachable on the diff path. Self-update only worked on the rarely-hit full-zip path (initial sync OR SHA-compare API cap of 300+ files).

Effect: any tester running on a diff-sync cadence never received launcher-script updates. The download-mods regression was unfixable for them; bat-flow changes propagated only on full-zip overlays.

### Fixes (this commit)

**`install.ps1` line 230** — added `download_mods.ps1` to the post-install copy array. Fresh installs now have all four launcher scripts.

**`sync_client.bat` lines 25-49 (new Phase -1 self-heal block)** — before the existing `.new` finalization loop, the bat now fetches any of `sync_client.ps1` / `download_mods.ps1` / `cleanup_stale_jars.ps1` directly from `raw.githubusercontent.com/.../main/.../distribution/client/<script>` if missing locally. This is the bootstrap path for existing instances that pre-date the install.ps1 fix — one launch after the bat lands, the missing script self-heals and the sync proceeds normally. The bat itself can't self-heal (it's the entrypoint).

**`sync_client.ps1` line 167-211 (diff filter + staging block restructure)** — `$relForSelfUpdate` and `$isSelfUpdate` now computed BEFORE the overlay filter. The filter condition is now `(-not $inOverlay -and -not $isSelfUpdate -and $relPath.Contains('/'))` — self-update files always pass through. Staging block uses `Split-Path -Leaf` to write `<scriptname>.new` flat at `$instanceMC` (where the launcher scripts live) instead of the nested `distribution/client/<scriptname>.new`. Bat-flow changes now propagate on diff syncs with 1-launch lag (acceptable per the bat's existing self-update quirk comment).

### Verification path on tester's existing instance

1. Push lands. Next launch: `sync_client.bat` finalization moves any staged `.new` (none, since previous diff didn't stage). Then `sync_client.ps1` runs diff sync; launcher-script updates now stage as `.new` flat at instance root. Phase -1 self-heal in the OLD bat runs if `download_mods.ps1` is missing — fetches it directly from main HEAD.
2. Same launch's step 4b finds `download_mods.ps1` (either from self-heal or from install.ps1 copy on fresh installs), runs it against `mods/.index/*.pw.toml`. Dan's Magic + Simple Staves jars (or any subsequent packwiz additions) download.
3. Next launch: `.new` files finalize, replacing the previous launcher scripts with the new versions. Future bat-flow changes ride the same `.new` staging path.

### Known follow-ups (audit-flagged, not fixed here)

- `install.ps1` doesn't verify Java 17. Fresh tester without Java 17 will see PrismLauncher open but the first launch crashes with "No Java runtime found." Either invoke Prism's auto-Java-download flow or emit a clear error.
- `wire_instance_cfg.ps1` line 55 still rewrites `PreLaunchCommand` to deprecated `prism_prelaunch.bat`. KubeJS handler that spawns it could silently break auto-sync on first login.
- PrismLauncher Portable extract leaves no Start Menu entry. Either swap to NSIS installer asset or surface the exe path explicitly.
- `sync_from_repo.bat` inline allowlist missing `class-artifacts-forge-2.0.5.jar` (server-operator script, not tester-blocking).

---

## 2026-05-12 — Tetra armor: dedup 52 zombie variants resurrected by the wildcard-key sweep; ISS unique integrity restored

The 2026-05-11 wildcard-key sweep (previous entry) had unintended fallout. 52 variants that were previously dead-due-to-doubling came back alive as duplicate-expanded keys, and Tetra's expansion picked one nondeterministically per material — so unique armor pieces could roll either the intended mage-tier stats or a stale wool-tier draft, depending on JVM map iteration order.

### Symptom (tester report)

"Integrity issue on Wandering Mage armor." Wandering Magician chestplate intermittently showed budget `-N / 5` or `0 / 3` instead of the intended `2 / 5`, and improvements were silently rejected when budget went negative.

### Root cause

Pre-sweep, every named-key variant (`<module>/<material>` with matching material in `materials[]`) was a dead doubled key (`<module>/<material><material>`). The "live" variant for each material was the *wildcard* sibling (`<module>/` with the same material). Tester-visible stats came exclusively from the wildcard.

Post-sweep, both variants ended up with the wildcard key `<module>/` plus the same material, expanding to the SAME final key. 52 such collisions across 16 armor module files. Tetra's `MaterialVariantData.expand()` dedupes by final key but the winner is implementation-defined.

### Audit + fix

`scripts inline`: enumerate every `expanded_key = key + material_suffix` across all `tetra:basic_major_module` + `tetra:basic_module` files; group by expanded key; flag groups with >1 contributing variant index.

Result: 52 real collisions (plus 1 false positive in `ars_book/dye` from a single variant with two category-wildcard materials — same expanded key but same variant, not a collision).

Patterns:
- **MAGE MAJORS** (robe_chest/wool, circlet/wool, robed_leg_plate/wool, robed_boot_sole/wool): variant [0] integrity=+2 magicCap=5 (mage-tier intent); variant [10] integrity=0 magicCap=3 (vanilla wool draft).
- **NON-MAGE MAJORS** (breastplate/iron, basic_crown/iron, etc.): integrity+magicCap identical between dupes; only armor calibration differs ([0] uncalibrated, [N] vanilla-scale post commit `78efe6ed`).
- **MINORS** (padded_lining/leather, simple_trim/iron, etc.): [0] integrity=-1 (old "consume" convention); [N] integrity=0 (post commit `e7ec7a16` no-consume).

Dedup choice: keep MAJOR=[0], MINOR=[N]. Mage majors keep +2 integrity / 5 magicCap; minors stop consuming budget.

### ISS unique audit after the fix

Resolved every replacement stamp in `data/tetra/replacements/irons_spellbooks__*.json` against the new module state. All 17 unique sets now report `integrity=+2 magicCap=+5` per piece (was nondeterministic +2/0/+5/+3). Wandering Magician chestplate budget: `+2 −0 −0 −0 = +2` free for improvements.

| Unique set | Pieces | Per-piece integrity | Per-piece magicCap |
|---|---|---|---|
| archevoker, cryomancer, cultist, electromancer, netherite_mage, plagued, priest, pumpkin, pyromancer, shadowwalker, wandering_magician, wizard | 4 each | +2 | +5 |
| infernal_sorcerer, paladin | chestplate | +2 | +5 |
| gold_crown, tarnished_helmet | helmet | +2 | +5 |
| speed_boots | boots | +2 | +5 |

Modded armor (aether/blue_skies/twilightforest/etc.) still resolves via variantData[0] fallback (deferred from 2026-05-11) — but variantData[0] post-dedup is also +2/+5, so modded sets are consistent with ISS uniques rather than rolling 0 or negative.

### Known follow-up (resolved same session)

Vanilla armor parity calibration from commit `5e421b2b` (2026-05-10) lived in the LOSER variants of the dedup. The dedup kept variant [0]'s lower armor values, dropping the calibration. Tester would have seen reforged armor at ~30% of vanilla stats (the pre-`5e421b2b` symptom).

Resolution: applied calibrated `primaryAttributes` from the dropped pre-dedup variants to the surviving wildcard variants for the 16 modules `5e421b2b` actually rebalanced. Of those: 12 already had the calibrated [N] values winning (correct dedup outcome); 4 majors (breastplate, basic_crown, basic_boot_sole, full_leg_plate) needed `primaryAttributes` re-application because integrity-tie tiebreak picked [0] (lower armor). Three minors my first-pass script over-reached on (chainmail_lining, silk_lining, fur_boot_lining — not in `5e421b2b`'s scope) were reverted to post-dedup state.

Verification: iron chestplate now sums to 6.001 (`breastplate/iron 4.865 + padded_lining/iron 0.649 + simple_trim/iron 0.0 + light_pauldrons/iron 0.487`) — vanilla iron chestplate parity restored.

Repair JSONs regenerated (`tools/gen_repair_definitions.py` → 687 files). Jar rebuilt and deployed to all 3 distros.

---

## 2026-05-11 — Tetra variant key doubling fix: collapse named keys to wildcard form (1280 variants across 62 files)

Root cause of "random material fallback" reported by tester: every named per-material variant in our module files had the wrong key shape, and Tetra's `MaterialVariantData.combine(MaterialData)` was DOUBLING them at load time.

### The bug

Tetra expands `MaterialVariantData` (any variant with a `materials` field) at module-load time. The expansion code reads:

```java
// Bytecode of MaterialVariantData.combine(MaterialData):
new_variant.key = this.key + material.key;  // string concat
```

So a JSON variant of the shape:

```json
{ "key": "breastplate/iron", "materials": ["tetra:metal/iron"], "extract": {...} }
```

produces an expanded variant with key `breastplate/iron` + `iron` = **`breastplate/ironiron`**. Every one of our 1280 named variants (52 materials -- vanilla + themed + per-mod families -- across 16 armor module files + 4 wand module files + a couple of book modules) was suffering this doubling.

Downstream effect: every schematic-outcome / replacement-file stamp wrote variant key `breastplate/iron` to NBT, but `variantData[]` only contained `breastplate/ironiron` after expansion. `ItemModule.getVariantData(String)` does exact-string equality on `.key`, so every lookup missed and fell to `getDefaultData() = variantData[0]`. With the 2026-04 base-variant materials list of `[tetra:metal/, tetra:gem/, iridescent_reforging:themed/]`, `variantData[0]` was the FIRST expansion of the first-in-JSON variant -- which after HashMap-based dedup was effectively random across all metal/gem/themed materials. Hence reports of leather chestplates rendering as "Emerald Breastplate" / "Lined Iron Breastplate" / "Cherry Breastplate".

### Why this hid for so long

`variantData[0]` fallback is the same mechanism flagged in `dev/lessons-learned.md` lesson 9 ("`variantData[0]` fallback masks NBT-mismatch bugs"). Tetra never crashes on a missed lookup -- it just silently substitutes the catch-all, which often APPEARS to work. Symptom is "wrong material on workbench convert," cause looks like "missing variant" but is actually "variant key doubled at expansion." Lessons-learned line 626 documents this exact failure mode for an older 3-segment-key case; we re-introduced the same shape with 2-segment named variants when shipping the modded-armor rollout (`742e3753` through `a5fa0fc9`).

### Canonical Tetra pattern (verified against stock `data/tetra/modules/double/basic_hammer.json`)

```json
{ "key": "basic_hammer/", "materials": ["tetra:metal/iron"],    "extract": {iron-tier stats}}
{ "key": "basic_hammer/", "materials": ["tetra:metal/copper"],  "extract": {copper-tier stats}}
{ "key": "basic_hammer/", "materials": ["tetra:stone/stone"],   "extract": {stone-tier stats}}
{ "key": "basic_hammer/", "materials": ["tetra:wood/"],         "extract": {wood-tier stats}}
```

EVERY variant uses the wildcard key (ends in `/`). Expansion produces `<wildcard><material.key>` = `basic_hammer/iron`, `basic_hammer/copper`, etc. -- matches what the schematic stamps. No doubling.

### Fix

Mechanical Python sweep across `data/tetra/modules/**/*.json`: for any variant where `key = "<module>/<suffix>"` and the suffix matches the material's key (so `breastplate/iron` with `tetra:metal/iron`, `breastplate/leather` with `tetra:skin/leather`, ...), rewrite the key to the wildcard form `<module>/`. Materials field and extract block untouched. Tetra's combine then produces the correct downstream keys.

Coverage: 1280 variants across 62 module files. 51 distinct vanilla/themed/modded material suffixes that already had a 1:1 material reference.

### Deferred (next pass)

324 variants for 20 modded-material suffixes were left as-is: `aether_neptune`, `aether_obsidian`, `bs_pyrope`, `bs_horizonite`, `bs_diopside`, `cm_ignitium`, `dd_resonarium`, `dd_warden`, `diamond_no_t`, `fa_draco_arcanus`, `fa_mortem`, `fa_tyr`, `tf_arctic`, `tf_fiery`, `tf_ironwood`, `tf_knightmetal`, `tf_naga`, `tf_yeti`, `ug_cloggrum`, `ug_froststeel`. These were authored with placeholder `materials: [tetra:metal/iron]` (the iron tier's stats) and no matching Tetra material registered for the suffix. Transforming them would create collisions with the iron variant. Proper fix is registering an `iridescent_reforging:modded/<material>` Tetra material per suffix (~21 JSON files), then re-pointing each variant's `materials` field at the registered material. Tracked as a follow-up; vanilla conversion path is unblocked in the meantime, and modded items now consistently fall through to iron-tier defaults instead of randomly rolling.

### Wand wood/oak

The 4 wand modules had `basic_<part>/wood` named variants where the material was `tetra:wood/oak` (key=oak, not wood). After the sweep, the wand wildcards expand to `basic_<part>/oak`. Updated `data/tetra/replacements/simple_staves__woodenwand.json` to stamp `basic_<part>/oak` (matching the expansion). Lang entries for `tetra.variant.basic_<part>/wood` renamed to `.../oak`. Other tier wands (stone/iron/gold/diamond/netherite) already had matching suffix=material-key so no replacement-file changes needed.

### Lang

4 missing book-cover entries added (`tetra.variant.<back|front|pages|spine>_cover/leather`). Total lang file now 2546 entries.

### Build + audit

- Sweep transformed 1280 variants across 62 files
- `tools/audit_modules.py` warnings cluster on the 324 deferred modded variants (expected) + base-variant `magicCapacity=0` (pre-expansion default, overridden per-material at runtime)
- JSON validity verified
- Jar rebuilt + deployed to all 3 distros

---

## 2026-05-11 — Tetra wand overhaul: random-material lockdown, spell-stat baselines per tier, T2 recipe nether-tier fix

Three interlocking fixes for the modular wand (Phase D `reforged_wand`) shipping together because they share the same surface: workbench display and per-material scaling.

### 1. Wildcard variant lockdown (66 modules)

Tetra's `key: "<module>/"` wildcard variant accepts a `materials` array of tag refs and picks a RANDOM concrete material from the resolved tag set when no slot-specific variant matches. Our wand/robe/armor modules used broad tag refs (`tetra:wood/`, `tetra:metal/`, `tetra:fabric/`) which include all extension-mod materials (Aether's `lined_iron`, Forbidden Arcanus' `gilded_zinc`, Twilight Forest's `cherry`, etc.) -- so freshly-converted vanilla items got rolled into random modded materials, often ones with broken textures or missing lang. Same root cause as the 2026-05-10 leather chestplate "49 stack double-netherite" report.

Narrowed all 66 module-file wildcards to safe single-material defaults:
- **Wand modules** (handle/cap/core/inlay basic_*): `tetra:wood/oak`
- **Robe modules** (circlet, robe_chest, robed_leg_plate, robed_boot_sole): `tetra:fabric/wool`
- **Lining/strap modules**: `tetra:skin/leather`
- **Book modules** (iss_book/back_cover, ars_book/spine): `tetra:skin/leather`
- **Default** (armor majors, remaining minors): `tetra:metal/iron`
- **Preserved as themed-tag** (intentional broad lists): `iss_book/core` (`tetra:icraft_iss_books/`), `ars_book/core` (`tetra:icraft_ars_books/`), `ars_book/dye` (fabric/fibre)

This is a behavioral floor: when the workbench has to fall through to the wildcard, players now get a canonical safe variant instead of a random extension-mod roll. Specific slot variants (`basic_handle/wood`, `basic_handle/iron`, etc.) are untouched -- the fallback only fires when no concrete variant matches the inserted material, which should be rare.

### 2. Wand spell-stat baselines per tier (5/10/15/20/25/30/35%)

Material wands (wood through aethersteel) were under-tiered relative to their material identity: the cap/core/inlay attributes were placeholder values from the Phase D scaffold. Rewrote per-tier `primaryAttributes` across all 4 wand modules (handle/cap/core/inlay) with a consistent ladder:

| Tier | Material | Handle (`cooldown_reduction`) | Cap (`mana_regen`) | Core (`max_mana`) | Inlay (`spell_power`) |
|------|----------|-------------------------------|--------------------|--------------------|------------------------|
| 1    | Wood (oak)   | 5%   | 5%   | +5  flat | 5%   |
| 2    | Stone        | 10%  | 10%  | +10 flat | 10%  |
| 3    | Iron         | 15%  | 15%  | +15 flat | 15%  |
| 4    | Gold         | 20%  | 20%* | +20 flat | 20%  |
| 5    | Diamond      | 25%  | 25%  | +25 flat | 25%  |
| 6    | Netherite    | 30%  | 30%  | +30 flat | 30%  |
| 7    | Aethersteel  | 35%* | 35%* | +40 flat | 35%  |

`*` Gold and aethersteel cap/handle carry +3/+5 `max_mana` riders (mage-side material flavor). All percentage stats are multiplicative (`**` prefix on the attribute key).

Wildcard variants (`basic_X/`) now use the wood tier defaults so the fallback case still produces sensible numbers if a player somehow lands on it.

### 3. Cap hone: `cast_time_reduction` -> `mana_regen` (rename + attribute swap)

The cap-hone improvement chain (`tetra.improvement.wand_cap_hone_*`) was attached to `cast_time_reduction`, which duplicated the handle's recovery role and left mana regen un-honable. Renamed and replumbed:
- Improvement file: `wand_cap_hone_cast_time_reduction.json` -> `wand_cap_hone_mana_regen.json` (attribute swapped throughout)
- 5 schematic files: `hone_cap_cast_time_reduction_{1..5}.json` -> `hone_cap_mana_regen_{1..5}.json` (content rewritten, schematic key now references the new improvement)
- Lang: `tetra.improvement.wand_cap_hone_mana_regen.name` -> "Flow", description -> "Honed cap accelerates mana recovery. Increases mana regen."
- Old `cast_time_reduction` keys removed; no dangling references remain (verified via grep over `data/tetra/`)

Hone ladder (level 1-5): +0.5% / +1% / +1.6% / +2.3% / +3% mana regen (multiplicative). Matches the existing handle-hone curve for cooldown reduction.

### 4. T2 elemental wand recipes: drop ISS Nether-tier reagents

`kubejs/server_scripts/recipes/staff_wand_recipes.js` -- the T2 wand block. ISS `fire_rune` and `lightning_rune` are Nether-tier per ISS gating (they drop from Piglin Brutes / Blazes), which pulled `flame_wand` and `thunder_wand` forward into T3 territory. Swap to pre-Nether reagents:
- `simple_staves:flame_wand`: `irons_spellbooks:fire_rune` -> `minecraft:redstone_block` (deep caves, T2 overworld)
- `simple_staves:thunder_wand`: `irons_spellbooks:lightning_rune` -> `minecraft:copper_block` (lightning rod metaphor, T2 overworld)
- `simple_staves:venomite_wand`: unchanged (`fermented_spider_eye`, already T1 overworld)

T3 element wands (viritium/veil/void) keep ISS runes -- those are correctly Nether-tier. T4 tenebrium keeps nether_star centerpiece.

### Workflow

Lang file `assets/iridescent_reforging/lang/en_us.json` validated (2542 entries, JSON parses). Recipe script synced to all 3 distros (main + server + client). Jar rebuild via `build_mod.sh` next; deployment via packwiz pull on next client launch.

### 5. Pre-Tetra base stats on Simple Staves vanilla material wands — item-level injection

The Tetra reforged_wand variant primaryAttributes provide the per-tier 5/10/15/20/25/30% on cooldown/mana_regen/spell_power AFTER a player drops the wand on the workbench. Before the workbench step, the player is just holding the base `simple_staves:woodenwand` / `stone_wand` / `iron_wand` / `gold_wand` / `diamond_wand` / `netherite_wand` -- those have no spell attributes in their stock Simple Staves form, so the wand felt useless until the player learned about the Tetra conversion step.

**Approach: item-level, not player-tick.** First pass used the tick-driven `HANDHELD_BUFFS` table in `dna_simple_staves_buffs.js` (the same path the elemental wands take), but that ties the stats to the player rather than the item -- they don't show in tooltips, JEI shows nothing on hover, and the symmetry with Tetra (where modifiers live on the variant primaryAttributes / IModularItem.getAttributeModifiers) is broken.

Replaced with `SimpleStavesWandAttributes.java` in `iridescent-tetra-expansion-mod`: a Forge `@SubscribeEvent` handler on `ItemAttributeModifierEvent` that runs every time vanilla queries the item's attribute modifiers. For MAINHAND queries on the six wand IDs, injects 3 modifiers (spell_power, mana_regen, cooldown_reduction) at the matching tier percent using stable per-attribute UUIDs.

This makes the wand carry its stats natively, the same way Tetra modular items do via `getAttributeModifiers(EquipmentSlot, ItemStack)`. The vanilla tooltip renderer auto-formats them as `When in Main Hand: +X% Spell Power` lines, the equipment-slot logic auto-applies them on hand swap, and there's no per-tick scan. The Simple Staves wand is now baseline-equivalent to a Tetra wand of the same tier even before workbench conversion.

The corresponding `HANDHELD_BUFFS` and `dna_simple_staves_tooltip.js` entries were removed since the item-level path covers them. The 13 dna/element wand entries stay on the tick-driven path -- those use element-specific attributes (fire_spell_power, lightning_spell_power, etc.) that don't render usefully in vanilla tooltips and need server-tick state for compound effects like wind_essence_wand's movement_speed.

Jar rebuilt + deployed to all 3 distros.

---

## 2026-05-11 — Lang sweep: 344 missing `tetra.variant.*` entries across modded materials

Recurring instance of `feedback_tetra_translation_keys.md` pattern. Operator reported a converted chestplate showing `tetra.variant.breastplate/nether...` as raw translation key in the workbench UI. Side-by-side audit of every module's variant keys vs lang entries found **344 missing entries** -- every 21-variant modded set (aether_neptune, aether_obsidian, bs_*, cm_ignitium, dd_*, fa_*, tf_*, ug_*, diamond_no_t, wool) was missing across all 16 default module file types (basic_crown / basic_boot_sole / breastplate / full_leg_plate / leather_belt / leather_lacing / leather_strap / light_pauldrons / padded_boot_lining / padded_cuisses / padded_lining / plain_crest / simple_trim / slit_visor / standard_greaves / standard_heel) + a handful on the robe modules (circlet / robe_chest / robed_boot_sole / robed_leg_plate -- 2 per).

Generated via Python audit over `data/tetra/modules/**/*.json`, diff'd against `tetra.variant.*` keys in `en_us.json`, output 344 entries with friendly material names:
- Vanilla / generic: `wool` -> "Wool", `diamond_no_t` -> "Diamond" (no-toughness variant, still reads as diamond)
- Aether: `aether_neptune` -> "Aether Neptune", `aether_obsidian` -> "Aether Obsidian"
- Blue Skies: `bs_diopside` -> "Blue Skies Diopside" etc.
- Cataclysm: `cm_ignitium` -> "Cataclysm Ignitium"
- Deeper Darker: `dd_resonarium` -> "Deeper Darker Resonarium", `dd_warden` -> "Deeper Darker Warden"
- Forbidden Arcanus: `fa_draco_arcanus` -> "Draco Arcanus", `fa_mortem` -> "Mortem", `fa_tyr` -> "Tyr"
- Twilight Forest: `tf_naga` -> "Naga Scale", `tf_yeti` -> "Yeti Fur", `tf_arctic` -> "Arctic Fur", `tf_fiery`/`tf_ironwood`/`tf_knightmetal` -> "X (TF)" disambiguation
- Undergarden: `ug_cloggrum` -> "Cloggrum", `ug_froststeel` -> "Froststeel"

Entries follow the existing `<Material> <module>` convention (underscores in module name replaced with spaces). Total lang file grew from 2198 to 2542 entries. JSON validity verified before build; jar rebuilt + deployed to all 3 distros.

This was the pre-existing pattern from the round-1 modded-armor rebalance pass (when the 21 modded variants were added) but the lang sweep got skipped. Future: bake the audit into `audit_modules.py` (per `feedback_tetra_wiring.md`) so this is caught at ship time rather than surfacing in a workbench screenshot.

---

## 2026-05-11 — icraft-cli/core: disable idle_timeout watchdog by default

The launcher's hang watchdog polls `latest.log` mtime and kills the JVM after N seconds of no log growth. Two thresholds: `boot_timeout` (during init) and `idle_timeout` (post-boot). Default was 15 min each.

**Bug:** the post-boot `idle_timeout` was firing on healthy idle servers. With no players online, MC legitimately produces no log lines for 15+ min at a time -- chunk autosaves are sparse, GC messages are filtered by default logger config, the AI tick / network tick is silent unless events fire. The watchdog interpreted this as a hang, did the soft-kick (newline to stdin), waited one poll interval, and hard-killed the JVM. Operator perception: "the server randomly shuts down when nobody's on it."

**Fix:** default `idle_timeout` to `0` (disabled) in both `icraft-cli/src/main.rs` (the `Serve` subcommand's clap arg) and `icraft-core/src/run.rs` (`WatchdogOptions::default()`). `boot_timeout` stays at 15 min because boot SHOULD produce log activity by definition -- if it doesn't, something genuinely went wrong. Post-boot, we trust JVM process-exit as the crash signal: if the JVM exits unexpectedly, that's a real crash and the launcher handles it via the child wait. Quiet idle is left alone.

Operators who specifically want idle-hang detection (e.g. monitoring for OOM death spirals on a public server) can pass `--idle-timeout 1800` to re-enable it. The mechanism stays, only the default flips.

Affected binaries: `icraft-cli` (CLI `serve` command) and any `icraft-gui` callers that use `WatchdogOptions::default()`. Rebuild via `rebuild_cli.bat` / `rebuild_gui.bat` on the server box; old binaries continue to behave as before until rebuilt.

Tradeoff acknowledged: lose silence-based hang detection for "JVM alive but unresponsive" cases (deadlock, GC death spiral without exit). No reliable detection of that state without adding RCON or query-protocol pinging. The right long-term answer is probably an RCON `list` ping every N minutes; deferred until someone reports an actual deadlock case.

---

## 2026-05-11 — prism_prelaunch.bat: restore working-tree-deleted .pw.toml before pull

Closes the infinite loop where new packwiz entries (dans-magic, simple-staves) never made it through to mod-load. Sequence observed on operator's instance via `git status`:

```
deleted:    .index/dans-magic.pw.toml
deleted:    .index/simple-staves.pw.toml
```

Yet `git log` showed HEAD at `4d309f9` (well past `fcacdd48` which added those files). Branch was "up to date with 'origin/main'". So git pull succeeded -- but the .pw.toml files were physically deleted from the working tree at some prior moment, and `git pull --ff-only` treats working-tree deletions as local changes and does NOT restore them on fast-forward.

Most likely cause: **PrismLauncher 11's Mod manager** sweeps `mods/.index/*.pw.toml` and removes entries whose matching jar isn't on disk. Sequence:

1. Launch N: bat pulls `<.pw.toml>`. download_mods.ps1 would fetch the jar, but PrismLauncher's mod-list refresh fires BEFORE pre-launch in some scenarios -- or the sweep happens at launch teardown -- and the orphan `.pw.toml` (no matching jar yet) gets deleted.
2. Launch N+1: git pull --ff-only sees branch is current. The deletion remains in working tree. download_mods.ps1 reads the .index, only sees 435 of the 437 tracked tomls, never knows about dans-magic / simple-staves. Forge launches without them. Server handshake fails.
3. Infinite loop.

Fix: prepend `git restore -- .minecraft/mods/.index/` to the bat's Phase 1 (before `git pull`). `git restore` only undoes working-tree deletions of files still tracked in HEAD -- intentional removals (via `git rm` + commit) record in the index and are unaffected. Safe to run every launch.

After the restore, `git pull --ff-only` fast-forwards cleanly with all 437 .pw.toml files present. download_mods.ps1 sees the dans-magic / simple-staves entries and fetches them via the v2 UA + fallback chain. Forge loads the jars. Handshake passes.

Architectural note: this is a quirk of mixing **two** packwiz-aware tools on the same `.index/` directory -- our git-based sync and PrismLauncher's built-in mod manager. The clean long-term fix is either (a) migrate to PrismLauncher's pack.toml URL flow (let PrismLauncher own the index end-to-end), or (b) tell PrismLauncher not to manage this instance's index. The `git restore` mitigation keeps both tools coexisting without conflict.

---

## 2026-05-11 — prism_prelaunch.bat: self-relaunch so updates take effect same launch

Closes the launch-after-pull edge that's been a recurring footgun. Previously, when a `git pull` updated `prism_prelaunch.bat` itself, cmd.exe kept the old bat buffered for the rest of the launch — the new hooks took effect only on the NEXT launch. Operators reported "I pulled and relaunched and it STILL doesn't work" multiple times this week.

Two-phase self-relaunch design:

  - **Phase 1** (top of bat): just `git pull`, then `call %~f0 --post-pull` and exit. cmd.exe re-opens the bat from disk on each `call`, so the inner invocation reads whatever bat content is on disk AFTER the pull. Subject to NTFS + FILE_SHARE_DELETE semantics for in-place replacement (which both Git for Windows and cmd.exe honour) — works in practice on Win10+.

  - **Phase 2** (after `:post_pull` label): cleanup + download_mods + wire. Runs from the just-pulled bat content — new hooks, new defaults, new arg lists all in effect same launch.

  - Re-exec is gated on the `--post-pull` arg so recursion stops at depth 2. Errorlevel propagates correctly via `endlocal & exit /b` (errorlevel is process-scoped, not part of the setlocal scope).

Result: when we add a new pre-launch step upstream (e.g. last week's `download_mods.ps1` invocation), the operator's very next launch picks it up. No manual one-shot bootstrap, no "launch twice" workaround.

Server-side `iridescentserver.bat` already has analogous staging via the `.new` finalization dance — this brings the client-side git-checkout flow to parity.

---

## 2026-05-11 — Client mod sync hardened to match server-side robustness

Symptom: even after fixing `prism_prelaunch.bat` to invoke `download_mods.ps1`, the client kept failing handshake with `Channels [dna:dna,simple_staves:simple_staves] rejected their client side version number` -> screenshot UI "Your client is missing the following mods" with Dan's Magic 1.0.0 + Simple Staves 1.0.3 listed. The client `download_mods.ps1` was running, but failing silently.

Root cause: side-by-side audit against the server-side `update_mods.ps1` (and its Rust port in `icraft-core/src/mods.rs` + `packwiz.rs`) showed the client downloader was missing four robustness features the server has:

| Feature | Server | Client (v1) |
|---|---|---|
| `User-Agent: Mozilla/5.0 IridescentCraft-Updater` header | yes | **missing** |
| Fallback URL: `curseforge.com/api/v1/mods/.../download` when CDN fails | yes | **missing** |
| Filename percent-encoding in CDN path | yes | **missing** |
| Non-zero exit code on download failure | yes | always exited 0 |
| Old-version removal by base-name diff | yes | **missing** |

The smoking gun: `edge.forgecdn.net` now returns 403 for unauthenticated GETs without a User-Agent header. The v1 client downloader's `WebClient.DownloadFile` sent no UA, so every CurseForge-metadata mod that was missing on disk failed silently. The failure landed in `download_log.txt` but never surfaced to PrismLauncher's pre-launch log (exit code was always 0). New mods (the dna + SS pair added in `fcacdd48`) showed the gap; old mods were grandfathered because they'd been downloaded before the CDN tightened.

Fix (`.minecraft/distribution/client/download_mods.ps1` v2):
- Adds `Mozilla/5.0 IridescentCraft-Updater` UA on every `WebClient` request (same string the server + Rust ports use)
- Builds candidate URL list per-mod: `edge.forgecdn.net` first, `curseforge.com/api/v1/mods/<pid>/files/<fid>/download` as fallback. 2 attempts per URL.
- `[System.Uri]::EscapeDataString` on filename in the CDN URL path
- Reports `via <host>` per successful download so failures can be triaged
- Returns exit code 1 on any failure, with per-mod URL list + failure list logged to `download_log.txt`
- Old-version removal by `strip_version` base-name match (mirrors `mods.rs::strip_version`): when packwiz bumps a mod's filename, the old jar gets cleaned up so we don't accumulate duplicates

Plus `prism_prelaunch.bat`:
- Captures download_mods.ps1's exit code and emits a loud `[prism_prelaunch] WARNING` block with the path to `download_log.txt` when downloads fail. PrismLauncher's pre-launch log surfaces this so future failures are immediately visible (vs. the prior silent-pass).
- Still exits 0 overall (don't block launch on download failures — operator may be intentionally offline) but the warning is unmissable.

The launch-after-pull edge remains (cmd.exe buffers the old bat for the rest of the launch where git pull replaces it); operator can run the same one-liner manually as a one-shot bootstrap:

```
powershell -ExecutionPolicy Bypass -File ".\distribution\client\download_mods.ps1" -IndexDir ".\mods\.index" -ModsDir ".\mods"
```

That now succeeds for any CurseForge-metadata mod because of the UA + fallback chain.

---

## 2026-05-11 — Hotfix: rewrite Dan's Magic + Simple Staves buffs for KubeJS 2001 API

Crash: server boot at 2026-05-10 19:43:32 (`crash-2026-05-10_19.43.32-fml.txt`). KubeJS marked `ERROR` during the complete-event phase. Root cause in `kubejs/startup.log`: `dna_simple_staves_buffs.js#30: Cannot find function attribute in object ice_staff`.

KubeJS 2001.6.5-build.16 changed `ItemEvents.modification` to pass a raw `net.minecraft.world.item.Item` to the callback — no `.attribute()` helper. Vanilla `Item.defaultAttributeModifiers` is final and set at construction, so we can't bake modifiers in post-construction. The pre-2001 `item.attribute('mainhand', attr, name, value, op)` pattern is fundamentally incompatible with this build.

**Fix**: re-implemented as a server-tick handler that applies / clears `AttributeModifier`s on the PLAYER via `player.modifyAttribute(attr, name, amount, op)`. Same pattern the existing skill system uses (`server_scripts/skills/justleveling_skills.js`).

Files:
- **new** `kubejs/server_scripts/integration/dna_simple_staves_buffs.js` — registers `tick_dna_simple_staves_buffs` with `0_tick_master` (10-tick interval, 2 Hz, offset 4). Each tick iterates online players, reads `mainHandItem.id`, applies the buff if held and clears (amount=0) for every other modifier slot. Deterministic `icraft_hh_<item>_<attr>` modifier names make calls idempotent and prevent leaks across item swaps.
- **new** `kubejs/client_scripts/dna_simple_staves_tooltip.js` — restores the per-item buff tooltip line that lived on `Item.defaultModifiers` in the original baked-modifier design. 14 per-id `event.addAdvanced` calls (NOT `addAdvancedToAll` — silent no-op in this KubeJS build). Element-themed colors (aqua / yellow / red / green / dark_purple / gold / light_purple).
- **new** `kubejs/assets/dna/lang/en_us.json` — `{ "item.dna.tnt_staff": "Apprentice Battlerod" }`. Lang overlay replaces the pre-2001 `item.displayName(...)` call. Resource-pack overlay path (mirror of `kubejs/assets/icraft/lang/en_us.json`).
- **deleted** `kubejs/startup_scripts/dna_simple_staves_buffs.js` (the broken pre-2001 script).

All four changes mirrored across `/.minecraft/`, `server_distribution/`, `distribution/client/`. md5sums verified identical across distros.

**Tradeoffs vs the original baked-modifier design**: ~0.5s swap latency (10-tick interval — imperceptible in play); buff visible in tooltip via the client overlay; server tick load is ~14 items × N players × 2 Hz `modifyAttribute` calls (negligible). Works for items from other mods (no mixin required).

Phase D's `iridescent_tetra_expansion-1.0.0.jar` and KubeJS scripts are independent — Phase D was not implicated; the crash would have happened on the prior Phase A/B/C/E push the moment the tester pulled it. The next pull boot will succeed.

---

## 2026-05-10 — Phase D: Simple Staves material wands -> Tetra-modular `reforged_wand`

Closes the deferred Phase D from the staves/wands integration plan. The 6 Simple Staves material wands (woodenwand / stone / iron / gold / diamond / netherite) now auto-convert to `iridescent_reforging:reforged_wand` when dropped on a Tetra workbench. A post-T4 **aethersteel** variant is reachable by swapping the handle module at the workbench (no SS source item exists for it).

**New item** — `iridescent_reforging:reforged_wand` (Java: `com.iridescentcraft.reforging.item.ItemModularWand`). 1 major + 3 minor slots:

| Slot | Role | Primary attribute |
|---|---|---|
| handle (major) | material identity | `**irons_spellbooks:cooldown_reduction` |
| cap (minor) | channeling | `**irons_spellbooks:cast_time_reduction` |
| core (minor) | mana reservoir | `irons_spellbooks:max_mana` (flat) |
| inlay (minor) | resonance | `**irons_spellbooks:spell_power` |

All 4 slots marked `REQUIRED`; players swap variants via install schematics but the wand never enters an empty-slot state. GUI layout mirrors the armor diamond (NE major, W/SW/SE minors).

**Material ladder** (per-slot variant suffixes; each tier scales the slot's primary attribute):

| Material | Source | Notable extras |
|---|---|---|
| wood | `simple_staves:woodenwand` replacement | baseline |
| stone | `simple_staves:stone_wand` replacement | — |
| iron | `simple_staves:iron_wand` replacement | — |
| gold | `simple_staves:gold_wand` replacement | +5 max_mana on handle, +3 on cap/inlay (mage mat tilt) |
| diamond | `simple_staves:diamond_wand` replacement | — |
| netherite | `simple_staves:netherite_wand` replacement | — |
| **aethersteel** | workbench upgrade only (no SS source) | post-T4: +0.5% CDR rider on inlay, +1 integrity on each module |

**Hone improvements** (4 stats x 5 levels, chained via `tetra:improvement` requirement: handle/Chronos = cooldown_reduction, cap/Flow = cast_time_reduction, core/Reservoir = max_mana, inlay/Resonance = spell_power). Tool progression mirrors `iss_book`: gold -> iron -> thermal:steel -> diamond -> netherite.

**Files shipped**:
- `iridescent-tetra-expansion-mod/src/main/java/com/iridescentcraft/reforging/item/ItemModularWand.java` (new)
- `registry/ModItems.java` — registered `REFORGED_WAND` (durability 500, stacksTo 1, UNCOMMON rarity)
- `data/tetra/modules/wand/{basic_handle,basic_cap,basic_core,basic_inlay}.json`
- `data/tetra/schematics/iridescent_reforging/wand/{handle,cap,core,inlay}.json` + 20 `hone_<slot>_<stat>_<1-5>.json`
- `data/tetra/improvements/iridescent_reforging/wand_<slot>_hone_<stat>.json` (4 files)
- `data/tetra/replacements/simple_staves__<6 material>_wand.json`
- `tools/gen_repair_definitions.py` — added `wand` to `ARMOR_SLOTS`; added `wood`/`stone` to MATERIAL_ITEM_MAP; emits 7 wand repair JSONs
- `assets/iridescent_reforging/lang/en_us.json` — 60 new entries (module/variant/improvement/schematic labels, `tetra.material.wood/stone`, item names)
- `assets/iridescent_reforging/models/item/reforged_wand.json` — base model + 6 overrides (`material_index` 1-6) dispatching to per-variant child models
- `assets/iridescent_reforging/models/item/reforged_wand_{stone,iron,gold,diamond,netherite,aethersteel}.json` — 6 child models. Source-mod sprites: `simple_staves:item/<wooden|stone|iron|gold|netherite>_wand` + `simple_staves:item/diamondwand` (note: no underscore in SS source for diamond); aethersteel uses `minecraft:item/end_rod` as a thematic stand-in (no SS source exists).
- `client/WandMaterialIndexProperty.java` — registers `iridescent_reforging:material_index` on REFORGED_WAND, reads the handle module's material suffix and maps it to a 0-6 index (wood=0 base case). Wired into `IridescentReforging.onClientSetup`. Independent of armor's `MaterialIndexProperty`.

**Mage main-hand progression complete**: T1 wooden_wand (now Tetra-modular) -> T2 iron/stone_wand or SS element wands -> T3 diamond/gold_wand or SS T3 element wands -> T4 netherite_wand or tenebrium_wand -> **endgame aethersteel_wand** via workbench upgrade. Each material wand can be independently honed across the 4 slots for ~3% CDR / 3% CTR / 40 mana / 14% spell_power max from honing alone, stacked on the variant baselines.

Built + deployed to all 3 distros (`.minecraft/mods`, `.minecraft/server_distribution/mods`, `.minecraft/distribution/client/mods`).

---

## 2026-05-10 — Phase A/B/C/E: Dan's Magic + Simple Staves integrated as T1-T4 mage progression

Adds two new mods (Dan's Magic + Simple Staves) and reskins them into the pack's mage main-hand progression. Phases A (packwiz add), B (Dan's respec), C (Simple Staves element respec), E (recipe gating) shipped in this commit. Phase D (material wands → Tetra modular) deferred to next session — requires Java mod work in `iridescent-tetra-expansion-mod`. Phase F is playtest.

**Phase A — packwiz**: added `dans-magic.pw.toml` + `simple-staves.pw.toml` to all 3 distros. Both pull from CurseForge metadata.

**Phase B — Dan's Magic respec** (5 staves, T1 element-buff items):

| Staff | T1 Recipe | Held effect |
|---|---|---|
| ice_staff | stick + packed_ice + amethyst_powder (vertical) | +20% ISS ice_spell_power |
| lightning_staff | stick + copper_ingot + amethyst_powder | +20% lightning_spell_power |
| magma_staff | stick + magma_cream + amethyst_powder | +20% fire_spell_power |
| toxic_staff | stick + spider_eye + amethyst_powder | +20% nature_spell_power (toxic→nature mapping) |
| **tnt_staff → Apprentice Battlerod** | stick + gunpowder + 2× iron_ingot + amethyst_powder | +5% generic spell_power + 6 attack_damage (~7 total, +2 above iron sword) + sword-tier attack_speed |

Right-click projectile use stripped via `kubejs/server_scripts/integration/dna_simple_staves_strip.js` (`ItemEvents.firstRightClicked` cancellation per item ID). MCreator advancement triggers blanked via `kubejs/data/dna/advancements/*.json` overlays (impossible-trigger pattern). The `tnt_staff` display name is renamed to "Apprentice Battlerod" via `ItemEvents.modification` in `startup_scripts/dna_simple_staves_buffs.js`.

**Phase C — Simple Staves element wands** (8 wands kept, explosion stripped):

| Wand | Tier | Effect | Reagent |
|---|---|---|---|
| wind_essence_wand | T1 | +20% lightning_spell_power + 0.05 movement_speed | wind_essence (overworld ore) |
| flame_wand | T2 | +35% fire_spell_power | flame_crystal (overworld ore) |
| thunder_wand | T2 | +35% lightning_spell_power | storm_essence (crafted void+wind) |
| venomite_wand | T2 | +35% nature_spell_power | venomite (overworld ore) |
| viritium_wand | T3 | +50% nature_spell_power | viritium (overworld ore) |
| veil_wand | T3 | +50% holy_spell_power | veil_essence (overworld ore) |
| void_wand | T3 | +50% ender_spell_power | void_crystal (End ore) |
| tenebrium_wand | T4 | +75% ender_spell_power | tenebrium (Nether ore) |
| ~~explosion_wand~~ | — | — | **STRIPPED** — redundant with Apprentice Battlerod |

All recipes replaced via `kubejs/server_scripts/recipes/staff_wand_recipes.js` Section K-equivalent: shape `[' R '][' RWR '][' A ']` with W=woodenwand (default Simple Staves recipe kept), R=tier reagent, A=amethyst_powder (cross-mod link to Dan's Magic). T3-T4 wands use heavier reagent counts.

**Phase E — recipe strips**: original Dan's Magic recipes (used Nether ghast_tear/lightning_rod/staff_base) and original Simple Staves element recipes (used netherite_stick base) all stripped via `event.remove({output:})`. The 6 Simple Staves material wands keep default recipes (sticks + planks → woodenwand etc.) — they're the Tetra-modular base for Phase D.

**MCreator scaffolding strip**:
- 9 Dan's Magic advancements + 1 Simple Staves advancement → blanked to impossible-trigger
- Right-click projectile use → cancelled for all 14 staff/wand items (no more themed projectiles fired on use)
- Particles/sounds vanish implicitly with the right-click cancellation
- Projectile entity classes left registered (no harm; no longer triggered from items)

**Mage main-hand progression now:** T1 wooden_wand (currently default Simple Staves item; will become Tetra-modular base) + Dan's element staves OR ISS lightning_rod (drop), T2 thunder/flame/venomite element wands (overworld craft) OR ISS T2 staves (drops), T3-T4 viritium/veil/void/tenebrium element wands OR ISS endgame staves. Three parallel ladders converge on the main-hand slot.

**Phase D — pending** (separate session): convert simple_staves material wands to Tetra-modular `iridescent_reforging:reforged_wand` with 4 slots (handle/cap/core/inlay), material variants, hone improvements. Requires new Java item class + module data + replacement files in `iridescent-tetra-expansion-mod`.

---

## 2026-05-10 — Staff/wand drop-tier seeding + SS scaling hook reframe

**SS spellsword hook reframed**, same code: comment now describes the design as "non-casters who happen to have spell power get *some* return on it" — not "wizards pick up melee." The mechanic was always: a warrior who finds a wizard helmet shouldn't have spell power as dead stat; with this hook, that warrior gets a small AD bump on their elemental SS sword for every 50% bonus SP they accrue. Battlemage stays distinctive via the higher rate + mana cost + Mana Reaver kill-loop on Arcane Cleave.

**Staff/wand drop-tier seeding** (closes task #249). The pack already had 17 staff/wand items across 9 mods but only 2 were seeded in our loot scripts (blood_staff, ice_staff in `iss_boss_drops.js`). Created `kubejs/server_scripts/loot/staff_wand_drops.js` mirroring the Simply Swords boss-allocation pattern. 15 staves now seeded:

**T2 (~25-35% rate):**
- `twilightforest:fortification_scepter` → Knight Phantom (defender boss)
- `twilightforest:lifedrain_scepter` → Lich (life-drain theme)
- `twilightforest:twilight_scepter` → Ur-Ghast
- `twilightforest:zombie_scepter` → Minoshroom
- `irons_spellbooks:graybeard_staff` → Wandering Magician (old-mage)
- `irons_spellbooks:hither_thither_wand` → Archevoker (teleport-mage)
- `savage_and_ravage:wand_of_freezing` → SAR Executioner

**T3 (~15-25%):**
- `irons_spellbooks:pyrium_staff` → Pyromancer (alongside existing armor drops)
- `aether:nature_staff` → Slider
- `terramity:perish_staff` → Cataclysm Maledictus
- `forbidden_arcanus:draco_arcanus_staff` → Cataclysm Harbinger

**T4 (~10-20%):**
- `irons_spellbooks:staff_of_the_nines` → Dead King (alt to blood_staff)
- `aether:cloud_staff` → Valkyrie Queen
- `deeperdarker:sonorous_staff` → vanilla Warden + Cataclysm Ender Guardian (sonic theme)
- `forbidden_arcanus:draco_arcanus_scepter` → Cataclysm Ender Guardian
- `terramity:lightning_staff` → vanilla Warden

**Recipe-strip enforcement** (`tier_gated_recipes.js` Section K): 11 of the 15 staves ship with crafting recipes in their source mods. All stripped via `event.remove({output:})`. The 4 already drop-only without recipes (hither_thither_wand, staff_of_the_nines, cloud_staff, perish_staff) need no strip. Pattern mirrors Section E (Simply Swords strip).

Pure-mage main-hand niche is now properly tiered. Combined with the SS spellsword scaling hook, mage-class players have a complete weapon progression: Ars spellbook off-hand for basic casts, ISS spellbook curio for abilities, drop-tier staff/wand for main-hand, with SS uniques as cross-class options that scale with whatever SP the player accrues.

---

## 2026-05-10 — Simply Swords drop-tier rebalance + spellsword scaling hook

User clarified that SS uniques are balanced against **vanilla**, not Tetra-enhanced — so the +3 raw modifier on T2-T4 boss drops is genuinely undertuned vs. what a player can craft via Tetra at the same tier. Plus shadowsting's **-2.0 modifier** (negative) is too steep a tax even for a CC-utility weapon. Shipped 9 config tweaks in `simplyswords_main/weapon_attributes.json5` (synced to all 3 distros):

| Weapon | Tier | Old | New | Reason |
|---|---|---|---|---|
| shadowsting | T3 (Harbinger) | -2.0 | **+1.0** | Keep utility tax but stop it being negative; CC weapons should still be USABLE for combat |
| stormbringer | T4 (Warden) | +3.0 | **+8.0** | Endgame boss; +3 was T2 equivalent |
| magiblade | T4 (Gaia Guardian) | +3.0 | **+7.0** | Endgame boss; +3 was T2 equivalent |
| emberblade | T2 (Hydra) | +3.0 | **+5.0** | T2 boss should beat diamond Tetra |
| sunfire | T2 (Aether Sun Spirit) | +3.0 | **+5.0** | T2 boss |
| flamewind | T2 (Deep Aether EotsController) | +3.0 | **+5.0** | T2 boss |
| whisperwind | T2 (Ur-Ghast) | +3.0 | **+5.0** | T2 boss |
| stars_edge | T2 (BS Starlit Crusher) | +3.0 | **+5.0** | T2 boss |
| toxic_longsword (longswordofplague) | T2 (BS Alchemist) | +3.0 | **+5.0** | T2 boss |

Other SS uniques (icewhisper +7, soulrender +4, etc.) left alone — they're already at appropriate tier values when measured against vanilla baseline.

**Spellsword scaling hook** (`kubejs/server_scripts/origins/ss_unique_spellsword_scaling.js`): every melee hit with an **elemental** SS unique in main hand adds **+0.5 AD per 50% bonus spell power** (= +1 AD per 100% bonus SP). 33 of the 44 uniques qualify — those whose theme is an explicit element: fire (7), ice (2), lightning (4), wind (2), nature (2), light (2), shadow/necro (9), arcane (4), poison (1). Pure-physical / utility / unclear uniques (enigma, harbinger, ribboncleaver, livyatan, waxweaver, watching_warglaive, watcher_claymore, wickpiercer, sword_on_a_stick, dormant_relic — 11 items) are excluded.

Hooks into `EntityEvents.hurt`; melee-only (skips arrow/trident/fireball/thrown sources). Half the rate of Battlemage's Arcane Cleave and FREE (no mana cost), so:

- Battlemage stays distinct: their Arcane Cleave is +1/50% (double rate) but consumes 10 mana per swing and triggers Mana Reaver kill-restore loop
- SS unique wielders get a small permanent buff regardless of class — pushes wider playerbase toward spellsword/hybrid builds
- A wizard with +200% bonus SP wielding emberblade gets +2 AD on top of the +5 base modifier — meaningful incentive to pick up melee uniques rather than dismissing them as caster-incompatible

Hook gate is the explicit unique set (44 items mirroring `tier_gated_recipes.js` strip list); generic material-tier SS weapons (diamond_longsword etc.) are unaffected.

---

## 2026-05-10 — Modded armor: round 4 (ISS mage robes → /wool, all 11 mods complete)

ISS handled per the user's clarification: "I would think they'd be wool/cloth at base." NBT magic bonuses (mana, spell_power, element-specific powers) transfer from the source ISS item via `SpecializedReplacementHook` (per `dev/lessons-learned.md` — the workbench-driven replacement hook restores skin/affix/enchantment NBT after Tetra's vanilla replacement runs). So our modular variants only need correct **base armor** at cloth/wool tier; the magic side comes from the source NBT.

**Added 16 `/wool` variants** (4 default minor modules per piece × 4 pieces) using `tetra:fabric/wool` material reference. Stats per piece: helmet 0.6 / chestplate 1.8 / leggings 1.2 / boots 0.6 — well below leather's already-low totals. Each minor slot also gets `+5 max_mana` for a small magical feel before NBT bonuses apply. Major modules already had curated `/wool` variants (circlet, robe_chest, robed_leg_plate, robed_boot_sole) with proper mana/spell_power scaling — left alone.

**Remapped 49 ISS replacement files** (53 total minus 4 plate-style exceptions): all variant suffixes changed to `/wool`. Per-mod averages now:

- Mage robes (wizard, archevoker, cultist, cryomancer, electromancer, infernal_sorcerer, plagued, priest, pyromancer, shadowwalker, wandering_magician, netherite_mage, pumpkin, dev): ~0.27 armor (helmet/boots), ~0.55 (chestplate), ~0.4 (leggings), with 25-65 mana per piece + 0.03-0.05 spell_power on majors.

**4 ISS replacements kept at `/iron`** — these use plate-style major modules (not robe modules), so they're not robes at all:
- `paladin_chestplate` (paladin = holy warrior, breastplate-style major)
- `gold_crown` (special crown item, basic_crown)
- `speed_boots` (Boots of Speed utility item, basic_boot_sole)
- `tarnished_helmet` (cosmetic, basic_crown)

`wool` already in MATERIAL_ITEM_MAP (`['minecraft:white_wool']`); no changes needed there.

**All 11 modded armor mods are now complete** for the original "non-specialized armor → matching-material modules" framing. ~140 of 191 modded replacement files now use material-appropriate variants (cloth/leather/iron/diamond/diamond_no_t/per-mod-custom). The 4 plate-style ISS items stay on iron defaults intentionally.

---

## 2026-05-10 — Modded armor: round 3 (DeeperDarker + Cataclysm) — only ISS robes remain

Final round of modded-armor work. Two more mods added:

- **DeeperDarker (2 materials, 8 files):** Re-extracted from bytecode after fixing the `accept:([I)` int-array-capture pattern. RESONARIUM 2/6/7/3 + tough 1 (`/dd_resonarium`), WARDEN 4/7/9/4 + tough 4 + KB 0.1 (`/dd_warden` — sculk-themed top tier). Both replacements remapped from `/iron`.
- **Cataclysm IGNITIUM (1 material, 4 files):** Hardcoded from community-documented stats since Cataclysm uses anonymous-class lambda suppliers in `ModItems.class` rather than an enum (would require deep bytecode dive). Values: 5/8/11/5 + tough 5 + KB 0.4 (top-tier endgame fire armor — comparable to FA Tyr at the high end). `/cm_ignitium` variant added with these values.

`MATERIAL_ITEM_MAP` extended with three new entries (`dd_resonarium → deeperdarker:resonarium`, `dd_warden → deeperdarker:reinforced_echo_shard` repaired via diamond hammer, `cm_ignitium → cataclysm:ignitium_ingot` repaired via diamond hammer).

**Final state of modded armor coverage:**

| Mod | Status |
|---|---|
| Aether (6 materials) | ✓ Complete |
| Twilight Forest (8) | ✓ Complete |
| Botania (4) | ✓ Complete |
| Undergarden (4) | ✓ Complete |
| Aquaculture (1) | ✓ |
| Deep Aether (2) | ✓ |
| Forbidden Arcanus (3) | ✓ Complete |
| Blue Skies (5) | ✓ Complete |
| **DeeperDarker (2)** | **✓ Complete (this commit)** |
| **Cataclysm (1)** | **✓ Complete (this commit, hardcoded)** |
| Iron's Spellbooks (16 mage robes) | Deferred — design call (see below) |

**ISS mage robes — deliberately deferred.** All 16 ISS armor materials (TARNISHED, WIZARD, ARCHEVOKER, CULTIST, PRIEST, CRYOMANCER, SHADOWWALKER, PLAGUED, ELECTROMANCER, NETHERITE_BATTLEMAGE, PALADIN, INFERNAL_SORCERER, BOOTS_OF_SPEED, WANDERING_MAGICIAN, PUMPKIN, PYROMANCER) currently inherit `/iron` stats. The user's framing was "non-specialized armor" — these are mage robes with low armor + high magic bonuses by design, arguably the canonical "specialized" case. Standardizing them to source-mod stats would either:
- Underweight them (most are leather-tier protection per source) and lose the implicit balance the iron-default provides for mixed-class players, OR
- Require attaching mod-specific magic-attribute bonuses (mana, spell power, etc.) per-variant, which goes beyond the "match source armor stats" framing.

Open question: should ISS robes get the source-mod's actual low-armor stats (exposing them as the squishy magic gear they're designed to be), or stay on iron as a small balance buff for mages? Tracked, no auto-fix this round.

**Audit summary across 217 replacement files:**

| Mod | Files | Avg armor | Range |
|---|---|---|---|
| vanilla | 25 | 3.6 | 1–8 |
| aether | 24 | 4.6 | 2–8 |
| twilightforest | 28 | 5.0 | 2–9 |
| forbidden_arcanus | 12 | 6.5 | 1–12 |
| cataclysm | 4 | 8.0 | 5–11 |
| deeperdarker | 8 | 5.6 | 2–9 |
| blue_skies | 20 | 3.75 | 1–8 |
| botania | 16 | 3.6 | 1–8 |
| undergarden | 15 | 4.3 | 1–8 |
| aquaculture | 4 | 5.0 | 3–8 |
| deep_aether | 8 | 5.0 | 3–8 |
| irons_spellbooks | 53 | 1.24 | 0.68–6 (still on /iron — deferred) |

---

## 2026-05-10 — Modded armor: round 2 (custom variants + diamond_no_t shared variant + FA/BS extracted)

Continuation of the first-pass modded armor work. Three layers of fixes this commit:

**Custom variants for non-vanilla-tier materials** (added 160 variant entries across 16 default-module files; 38 replacement files remapped). Materials whose stats don't fit a clean vanilla tier got their own `<module>/<suffix>` variant with the source mod's exact per-piece protection split proportionally across the 4 default modules:
- Aether NEPTUNE (`aether_neptune`, 2/5/6/2 + tough 1)
- Aether OBSIDIAN (handled via shared `diamond_no_t` below)
- TF ARCTIC (`tf_arctic`, 2/5/7/2 + tough 2)
- TF FIERY (`tf_fiery`, 4/7/9/4)
- TF IRONWOOD (`tf_ironwood`, 2/5/7/2)
- TF KNIGHTMETAL (`tf_knightmetal`, 3/6/8/3 + tough 1)
- TF NAGA (`tf_naga`, 3/6/7/2 + tough 0.5; chestplate+leggings only)
- TF YETI (`tf_yeti`, 3/6/7/4)
- UG CLOGGRUM (`ug_cloggrum`, 1/5/6/2)
- UG FROSTSTEEL (`ug_froststeel`, 2/6/7/3 + tough 4 + KB 0.05)

**Improved jar-bytecode extractor** to handle FA/ISS-style constructor-int-arg patterns (was previously capturing vanilla's `HEALTH_PER_SLOT [13,15,16,11]` constants by mistake — fixed by scoping each chunk between `new MaterialClass` and its matching `putstatic`, plus reading int constants positionally for `accept:(IIII)` lambdas).

Newly extracted + remapped:

- **Forbidden Arcanus (3 materials, 12 files):** DRACO_ARCANUS (6/8/10/6 + tough 3 + KB 0.1), TYR (8/10/12/7 + tough 4 + KB 0.2), MORTEM (1/4/5/1 + tough 1 — mage-style low armor with toughness).
- **Blue Skies (5 materials, 20 files):** AQUITE (2/5/6/2, iron-tier, no remap needed), PYROPE (1/4/5/2), HORIZONITE (1/4/5/2), DIOPSIDE (2/5/7/2), CHAROITE (3/6/8/3 + tough 2 → `/diamond`).

**Shared `diamond_no_t` variant for diamond-armor-with-zero-toughness materials** (32 replacement files remapped). Many mods use vanilla diamond's `(3,6,8,3)` protection but with 0 toughness — different from vanilla diamond which has 2 toughness. Created one shared variant rather than per-mod. Users:
- aether obsidian
- aquaculture neptunium
- botania terrasteel
- twilightforest steeleaf, phantom
- undergarden utherium
- deep_aether skyjade, stormforged

Note these were previously incorrectly inheriting iron stats (`/iron` after the round-1 classifier mapped `(3,6,8,3) tough==0` to iron as a fallback). Now correctly hit 3/6/8/3 with 0 toughness.

**Audit confirms parity.** All 217 replacement files now have non-trivial armor totals. Per-mod averages: Aether 4.6, Botania 3.6, Forbidden Arcanus 6.5 (top-tier), TF 5.0, BS 3.75, UG 4.3, Aether sub-mods 5.0, Aquaculture 5.0. Vanilla 3.6 (mostly leather to diamond range).

**Still deferred (no extraction yet):**
- **Iron's Spellbooks** (16 mage robes — some have non-standard patterns my extractor misreads). Currently inheriting iron stats. Per the user's "non-specialized armor" framing, these arguably are specialized (mage-themed, low armor + magic bonuses) — design call before remapping.
- **Cataclysm** (1 material — IGNITIUM). Class structure differs from the patterns my extractor handles; would need targeted decompile or hardcoded values.
- **DeeperDarker** (2 materials — RESONARIUM, WARDEN). My extractor returns suspect values (4/0/2/1, 4/0/4/1) suggesting it's missing some constants. DD uses `accept:([I)` (int-array capture) — different pattern.

Three add-on improvements possible later:
1. Add the 5 ISS robes the user wants standardized (if any)
2. Hardcode Cataclysm IGNITIUM stats
3. Improve extractor for `accept:([I)` array-capture pattern (DeeperDarker)

---

## 2026-05-10 — Combat affixes off mining tools + first pass of modded armor tier remap

**Apotheosis combat affixes off `breaker`.** All 36 affixes that had `"types": ["sword", "breaker", "trident"]` (combat-themed: omnivamp, lethal, igniting, lichbane, chilling, vorpal, executioners, etc.) now drop `"breaker"` entirely. Pickaxes/shovels/axes no longer roll combat-on-hit affixes. Side effect: axes lose these affixes too, since Apotheosis 1.20.1's `LootCategory` enum has no combat-axe-only category — `breaker` covers axe+pick+shovel as a unit. Tracked: if axes need combat affixes back, would require either a custom Apotheosis affix type or a separate axe-only mixin.

**Modded armor — first pass.** Audited 52 (mod, material) pairs across 11 mods via bytecode extraction (javap on each `ArmorMaterials.class`) to read per-piece protection + toughness from each source mod's enum constants. Discovered ALL 191 modded replacement files were referencing `*/iron` variants for their default modules — meaning every modded armor (gravitite, terrasteel, neptunium, etc.) was inheriting iron stats regardless of the source mod's intended tier.

Successfully extracted from 6 mods (Aether, Botania, Twilight Forest, Aquaculture, Undergarden, Deep Aether). Remapped **16 replacement files** that map cleanly to vanilla diamond tier or vanilla leather tier:
- Aether GRAVITITE / VALKYRIE / PHOENIX → `/diamond` (3/6/8/3 + tough 2)
- Botania MANAWEAVE → `/leather` (1/2/3/1)

Materials in the iron tier (2/5/6/2, e.g. zanite, manasteel, elementium, ironwood, ancient) were already correctly inheriting iron stats — no remap needed.

**Deferred — 34 files with custom stats** that don't match a vanilla tier exactly: TF naga (3/6/7/2), TF fiery (4/7/9/4 — high tier), TF ironwood (2/5/7/2), TF knightmetal (3/6/8/3 + tough 1), TF yeti (3/6/7/4), TF arctic (2/5/7/2 + tough 2), Aether neptune (iron+tough 1), Aether obsidian (diamond armor + 0 tough), UG cloggrum (1/5/6/2), UG froststeel (2/6/7/3 + tough 4 + KB 0.05). These need per-material variant entries added to the `helmet/`, `chestplate/`, `leggings/`, `boots/` module files (e.g. `basic_crown/aether_neptune` with custom attribute values). Tracked as follow-up.

**Deferred — 96 files from 5 unextracted mods**: Iron's Spellbooks (16 mage-robe materials), Forbidden Arcanus (3), DeeperDarker (2 — partial), Blue Skies (5), Cataclysm (1). The bytecode extractor needs more cases for non-EnumMap patterns (FA uses constructor-int-args + lambda-from-captures, ISS uses a custom interface). Some, especially the ISS mage robes, are intentionally low-armor + magic-bonus and arguably aren't "non-specialized" — design call needed before remapping.

**Screen-class load noise on dedicated server (NOT fixed).** Two log lines per server start:

```
[main/ERROR] [RuntimeDistCleaner]: Attempted to load class net/minecraft/client/gui/screens/Screen for invalid dist DEDICATED_SERVER
[main/WARN] [mixin]: @Mixin target ... Screen was not found ...
```

Sources: `relics.mixins.json` puts `ScreenMixin` in the `mixins` array (loads on both sides) instead of the `client` array (upstream relics-mod author bug); `fabric-screen-api-v1` registers Screen mixins on dedicated server via Connector. Forge's `RuntimeDistCleaner` correctly rejects the load — system working as intended; the ERROR/WARN level is misleading. Fixing requires bytecode-patching relics.jar (move `ScreenMixin` to client section) + adding to cleanup allowlist + writing a re-patch step into install pipeline; documented as known issue.

---

## 2026-05-10 — Vanilla armor parity in reforged defaults + Apotheosis affix "axe" → "breaker"

**Tetra armor rebalance.** Audit found vanilla material variants in `iridescent-tetra-expansion-mod` systematically undertuned vs vanilla equivalents:

| Material | Helmet (current → vanilla) | Chestplate | Leggings | Boots |
|---|---|---|---|---|
| Leather | 0.31 → 1.0 | 0.81 → 3.0 | 0.59 → 2.0 | 0.31 → 1.0 |
| Iron | 0.56 → 2.0 | 1.48 → 6.0 | 1.08 → 5.0 | 0.56 → 2.0 |
| Diamond | 0.78 → 3.0 | 2.07 → 8.0 | 1.51 → 6.0 | 0.78 → 3.0 |
| Netherite | 0.90 → 3.0 | 2.37 → 8.0 | 1.73 → 6.0 | 0.90 → 3.0 |

A bare-default reforged stack (vanilla leather armor → workbench) was producing ~30% of vanilla armor stats. Players saw this as "all attributes broken" on the leather set — the visible numbers were nonsensical.

**Fix:** rebalanced all 6 vanilla material variants (leather/golden/chainmail/iron/diamond/netherite) across the 16 default modules (4 per piece type × 4 pieces) so the per-piece sum hits vanilla parity. Preserved the existing proportional split (major ~71%, secondary ~14%, two minors ~7-8%) — only scaled values, didn't reshape the distribution. Diamond gets `armor_toughness: 2.0` per piece (split 0.5 across 4 modules); netherite gets `armor_toughness: 3.0` + `knockback_resistance: 0.1` per piece (0.75 + 0.025 split). `iridescent_tetra_expansion-1.0.0.jar` rebuilt via `build_mod.sh` and deployed to all 3 distros.

**Modded materials NOT touched in this pass.** ~150 modded armor replacement files reference material variants like `aether:gravitite`, `blue_skies:falsite`, `forbidden_arcanus:draco_arcanus`, etc. Each modded material would need its source mod's vanilla armor stats looked up to set targets, so those are tracked as a follow-up. Modded materials currently use whatever values they had pre-rebalance (typically scaled relative to iron in their mod's own data, so they may be roughly proportional but not vanilla-parity).

**Apotheosis "axe" → "breaker"** (`kubejs/data/apotheosis/affixes/*.json`). 36 affix files used `"types": ["sword", "axe", ...]`. Apotheosis 1.20.1's `LootCategory` enum has no `"axe"` member — axes fall under `"breaker"` (which also covers pickaxes/shovels). The 33-hit `Codec failure for type affixes, message: Unknown element name:axe` log spam at startup was Apotheosis rejecting these JSONs and dropping the affixes from the registry. Replaced `"axe"` → `"breaker"` across all 36 files. Side effect: pickaxes and shovels are now eligible for affixes that were previously sword+axe-only (omnivamp, lethal, chilling, igniting, lichbane, etc.). If any of those should NOT spawn on tools, drop `"breaker"` from the array entirely (a separate balance pass).

**Screen-class load noise on dedicated server (NOT fixed).** Two log lines per server start:

```
[main/ERROR] [RuntimeDistCleaner]: Attempted to load class net/minecraft/client/gui/screens/Screen for invalid dist DEDICATED_SERVER
[main/WARN] [mixin]: @Mixin target ... Screen was not found ...
```

Sources:
1. **`relics.mixins.json`** lists `ScreenMixin` in the `mixins` array (loaded on both sides) but `Screen` is a client-only class. Should be in the `client` array. This is an upstream relics-mod author bug.
2. **`fabric-screen-api-v1`** (loaded transitively via Connector for some Fabric-on-Forge mod) registers Screen mixins that don't apply on server.

Forge's `RuntimeDistCleaner` correctly rejects the load — the system is working as intended. The ERROR/WARN level is misleading; the dist-cleaning is a successful safety check, not a real failure. Fixing requires either (a) bytecode-patching relics.jar to move `ScreenMixin` to the client section + adding the patched jar to the cleanup allowlist + writing a re-patch step into the install pipeline (matching the existing Patchouli/Ars Nouveau infrastructure), or (b) shipping a custom mixin-plugin coremod that filters mixin loads. Both are heavy infrastructure changes for 2 benign log lines per startup. Documented as known issue; deferred.

---

## 2026-05-10 — debug.log error sweep: block_break_speed, stale recipe IDs, planetary_extraction guards

Audited `latest.log` (clean — zero ERROR/WARN) and the rotated `debug.log` (215 ERROR / 1080 WARN). Most errors clustered into 5 known/manageable categories. Surgical fixes for 3 of them landed this commit:

**1. `puffish_attributes:mining_speed` correction** (`skills/justleveling_skills.js:250`). Quarryman skill (BLD ≥ 10) was calling `player.modifyAttribute('minecraft:player.block_break_speed', ...)`. That's a Minecraft 1.21 attribute — doesn't exist on 1.20.1. The empty-catch swallowed the NPE silently but per-tick spam in debug.log was the result (TickMaster runs the skills loop continuously). Replaced with `puffish_attributes:mining_speed`, which is the same attribute already used in the gathering category JSON (`data/icraft/puffish_skills/categories/gathering/category.json`).

**2. Stale `disenchanting_table` + `table_of_experience` IDs** (`recipes/tier_gated_recipes.js` Section H). The H.1 block tried to remove + reshape `disenchanting:disenchanting_table` (item doesn't exist; the actual mod item is `disenchanting:disenchanter`, already correctly handled in Section I.10). Removed the stale H.1 block. H.2 had `toe:table_of_experience` — actual ID is `toe:table_of_expieriance` (sic — the mod ships the misspelled form, confirmed against `TesterLogs/Item Audit/all_items.tsv`). Fixed both `event.remove({output:...})` and `event.shaped(...)` arguments.

**3. `planetary_extraction.js` Create recipe + Mekanism recipe guards.** KubeJS's 2-arg `event.recipes.create.crushing(outputs, input)` constructor stopped resolving on the current Create version (same root cause as `if_latex_rework.js`'s already-wrapped block). All 5 planet-stone crushing recipes + the hydrogen→fuel `mekanism:condensentrating` custom recipe (Mekanism's actual type for gas↔fluid is `mekanism:rotary`, so this was an unknown-type rejection too) are now `try/catch`-wrapped with `console.warn` fallbacks. Until the API mismatch is rewritten, those recipes silently no-op rather than aborting the script. Matches the existing `if_latex_rework.js` pattern.

**Deferred (not in this commit):**

- **Apotheosis affix `Unknown element name: axe`** (33 hits at startup across 36 affix files in `kubejs/data/apotheosis/affixes/`). `"types": ["sword", "axe", ...]` — Apotheosis 1.20.1's LootCategory enum doesn't include `"axe"`; axes fall under `"breaker"` (which also covers pickaxes/shovels). Replacing `"axe"` → `"breaker"` would let the affixes load but would also extend them to non-weapon breakers — a balance call. Removing `"axe"` from each array (leaving sword/trident) is safer if the design intent is sword-themed only. Tracked but not auto-resolved.
- **Tetra `blade_katana.json contains invalid property healthPercent-old / armor_pen-old`** (3 hits). Logger is `[ModularItem API]` — this came from MiApi (Truly Modular framework). Already removed in the framework-removal commit earlier today; should auto-resolve next session.
- **`fabric-screen-api-v1` + `relics` Screen-class load attempts on dedicated server** (2 hits). Forge's `RuntimeDistCleaner` correctly rejects the load (it's working as intended), the WARN/ERROR is benign log noise from the `@Mixin target Screen was not found` follow-up. Could silence by marking the offending mods as `side='client'` in server `.pw.toml` + adding to `strip_client_mods` lists, but the cost outweighs the benefit (relics has server-side gameplay; can't strip).

---

## 2026-05-10 — Truly Modular framework removed (deprecated by Tetra; also the spider-jockey buff source)

Pulled the entire Truly Modular stack from the pack:
- `modular-item-api` (MiApi, `Truly-Modular-miapi-forge-1.1.49`) — the underlying framework, bundles `nucleus-{core,codec,config,facet,pose}` jars via JIJ.
- `truly-modular-arsenal` (`tm_arsenal`) — modular weapons.
- `truly-modular-archery` (`archery`) — modular bows.

Removed from all 3 packwiz indexes (main + server_distribution + distribution/client) and the matching `config/miapi.jsonc` from each. With `truly-modular-armory` already retired in phase 9 (replaced by `iridescent_reforging`) and `create-truly-modular` retired alongside it, no remaining mods depend on the framework.

**Two reasons for the removal:**
1. **Deprecated by Tetra.** Iridescent Reforging (custom Tetra-armor extension) + Tetra core + the Iridescent Modular Spells Tetra integration cover the same gameplay surface. MiApi's modular weapons/bows duplicate functionality already present in the Tetra-derived stack.
2. **Source of the spider-jockey buff package.** 890 MOBDIAG captures from a single recent session showed cave_spider+skeleton jockeys spawning at high rate (124 pairs in one session) with the rider receiving permanent regen amp 0 + dolphins_grace amp 1 + sometimes invisibility amp 1 (durations clustered at ~100M ticks). The cave_spider entities carried a `nucleus:facets` NBT compound — `nucleus-facet-forge` is bundled exclusively inside MiApi's jar. Removing the framework removes the facet attachment point, resolving the spider buff package as a side effect of the deprecation cleanup.

**Cleanup script** (`kubejs/server_scripts/cleanup/strip_truly_modular_items.js`, synced to all 3 distros): on `PlayerEvents.inventoryChanged` and `PlayerEvents.loggedIn`, strips any item whose ID prefix matches `miapi:`, `archery:`, `tm_arsenal:`, `modular_item_api:`, or `truly_modular:` and replaces with `minecraft:air`. Eliminates ghost-stack "Unknown Item" placeholders for any TM-framework items players were carrying. Self-cleaning — once world has cycled through every player's inventory and every chest interaction, no live stacks remain. Persistent chests in unloaded chunks may still contain ghost items until first open; vanilla shows them as "Unknown" anyway and they vanish on pickup (the receiving inventory's change event triggers the strip).

**Independent design call still pending:** the Majrusz `jockey_spawn.chance: 0.125` config setting (separately responsible for the inflated spawn rate) is unchanged. The buff package was the offensive part; high-rate vanilla-style spider+skeleton jockeys without the buff package are a balance question, not a bug.

---

## 2026-05-10 — Diamond strip belt-and-suspenders + Megatorch de-gated to T1

**Diamond strip extended.** Audited mod-shipped chest loot tables for `minecraft:diamond*` entries; found 5 in OW-spawning structures: `artifacts:chests/campsite_chest` (diamond axe/pickaxe/shovel) and 4 ISS structure chests (`battleground/burial_loot`, `catacombs/coffin_loot`, `catacombs/wall_loot`, `generic_magic_treasure` — full diamond gear sets each). Existing `preT3DiamondStrip` (Section 5A1.5) uses `LootType.CHEST + anyDimension` predicate, which **should** catch these, but the lessons-learned 2026-04-21 entry warned about that predicate failing for non-vanilla loot contexts (Lootr aggressive_mode wrapping was the example). Belt-and-suspenders added two new strip layers in the same section:

1. **Per-table strip** for the 5 confirmed leak tables — unambiguous match by table name regardless of how the loot is invoked.
2. **Regex catch-all** matching `/^[a-z0-9_]+:.*chests?\//` (any chest-pathed table under any namespace), gated to the same OW + T2 dim list. Catches future modded structures we haven't audited yet without per-table maintenance.

On the "after GLM" question: LootJS in 1.20.1 hooks loot via a `LootTable` mixin that fires at the *end* of loot resolution, so the strip operates on the post-GLM result. The 5 leak tables aren't a GLM-injection problem — they're mod-shipped table content that the existing `LootType.CHEST` predicate may have been failing to match. Per-table + regex coverage closes both the predicate gap and any future GLM-added diamonds.

**Megatorch de-gated to T1** (`tier_gated_recipes.js` Section I.11). Vanilla recipe required 2× diamond + 2× log + 2× gold block + 3× torch — diamonds gate Megatorch to T3 by which point its mob-spawn suppression is no longer the gameplay problem it solves. New recipe: 3× torch + 2× iron block + 2× redstone block + 2× gold block. Replaces 2 diamonds with 2 iron blocks (early-game accessible) and the 2 logs with 2 redstone blocks (logs were free filler; redstone adds thematic signal/power fit for the spawn-detection radius). Net cost ≈ 18 iron + 8 gold + 18 redstone dust — meaningful T1 investment for a permanent base defense item.

---

## 2026-05-10 — Village fletcher coverage + Lootr `additional_chests` populated

Two follow-on gaps surfaced after the GLM strategy switch the same day.

**Village fletcher missing from sanitization.** `lootjs_overhaul.js` `villageChests` array (line 1843) covered 15 of 16 vanilla 1.20.1 village chest types — `village_fletcher` was absent. That meant fletcher chests retained diamond gear, horse armor, enchanted golden apples, blank enchanted books, rotten flesh, wood/stone filler, AND skipped the curated `villageArtifactPool` flat ~10% roll. (Fletcher WAS already in the line 1453 `T1_IRON_BASELINE_CHESTS` array, which is why the gap went unnoticed — partial coverage.) Added `minecraft:chests/village/village_fletcher` to the main `villageChests` list. All other village types behave identically; fletcher now does too.

**Lootr `additional_chests` was empty.** Lootr only auto-converts vanilla `minecraft:chest` and `minecraft:trapped_chest` (plus mineshaft minecart chests). Mods that ship custom chest BLOCK types bypass Lootr entirely — meaning shared single-roll loot per chest, not per-player rolls. Audited the major dimensional mods:

- **Blue Skies:** 7 custom chest types (bluebright, comet, dusk, frostbright, lunar, maple, starlit) — confirmed `SkyChestBlockEntity` extends vanilla `ChestBlockEntity` (which extends `RandomizableContainerBlockEntity`), so all 7 are eligible.
- **Aether:** `treasure_chest` (the gold-keyed dungeon chest) — confirmed `TreasureChestBlockEntity` extends `RandomizableContainerBlockEntity` directly. Eligible. (`chest_mimic` is a mob, not a chest, skipped.)
- **The Undergarden:** no custom chest blocks (only `chest_boat` items, which are entity passengers and irrelevant to Lootr). Uses vanilla chest, already Lootr-converted.
- **Deeper Darker:** same — no custom chest blocks, only chest boats.
- **Twilight Forest:** uses vanilla chest blocks (per design). Already Lootr-converted.

Added 8 entries to `config/lootr-common.toml` `additional_chests`. Synced to all 3 distros. Pre-fix: any chest in Skyroot/Bluebright/Everbright/Everdawn dungeons + Aether gold dungeons was a shared-roll chest; post-fix: per-player rolls like vanilla.

**Full structure-mod audit completed same session** (after the initial 8-entry add). Pulled and grepped 30 additional jars: Stalwart Dungeons, When Dungeons Arise, Dungeon Crawl, Dungeons Plus, Valhelsia Structures, Repurposed Structures, Structory Towers, Terramity, all 7 Yung's mods (Better Dungeons / Strongholds / Mineshafts / Desert Temples / Nether Fortresses / End Island / Ocean Monuments) + Yung's Bridges, Aether Treasure Reforging, Waystone Towers, Deep Aether, Twilight Aether, Moog's End Structures, Ad Astra More Structures, Cataclysm Apotheosis Addon, Epic Dungeons, Brutal Bosses, L_Ender's Cataclysm, KeebsZS Battle Towers, Integrated Stronghold, Aetheric Tetranomicon, Better Farmers Combat, Cataclysmic Combat. **None ship custom chest blocks.** The few classes containing "Chest" in their names are loot-table data-gen providers (`DAChestLoot`, `DPChestLoot`) or structure processors (`SmallDungeonChestProcessor`) — not block registrations. All 30 use vanilla `minecraft:chest`, which Lootr's `convert_wooden_chests = true` already handles. The 8-entry `additional_chests` list (Aether `treasure_chest` + 7 Blue Skies wood-themed chests) is the complete coverage gap for this pack.

**Stale-rate correction:** the earlier 2026-05-10 changelog entry for the GLM strategy switch said "replaced with curated 4% pool." Actual current rate is **~10% combined** — 11 items at ~0.91% each in `villageArtifactPool`. The 4% figure was the original 25-item pool from 2026-04-11; bumped to 15% (2026-04-19), then dialed back to 10% (2026-04-20). Today's earlier changelog entry has been corrected in-place.

---

## 2026-05-10 — GLM strategy switched from `replace:true` allowlist to `replace:false` + targeted shadows

Followed up on the same-day SimpleFarming patch. Tester pushback: "lots more than 4 modded seeds would have been blacklisted if that's the case." Audit confirmed it. Pulled mod jars and counted what `replace:true` had been silently killing since the 2026-04-26 introduction:

- **Thermal Cultivation:** 1 GLM (`thermal:seeds_from_grass`) — injects 15 modded seeds (amaranth/barley/bell_pepper/corn/eggplant/flax/green_bean/onion/peanut/radish/rice/sadiroot/spinach/strawberry/tomato) into grass/fern/tall_grass/large_fern.
- **Farmer's Delight:** 34 GLMs — 14 chest injections, 10 entity scavenging modifiers, 5 cake/pie slicing handlers, 5 `straw_from_*` (grass/sandy_shrub/tall_grass/mature_wheat/mature_rice).
- **Aether:** 10 GLMs — `remove_seeds` (vanilla seeds were supposed to NOT drop in Aether; suppression broke that), pig drops, 6 piglin gloves loot tiers, enchanted grass berry bush, double drops.

That's ~45 confirmed broken GLMs from three mods alone, plus the 4 SimpleFarming ones the morning patch had restored — and we hadn't audited every mod yet.

The original `replace:true` allowlist was introduced to suppress aggressive chest injection from Artifacts (~25-30% village artifact rate, replaced with the curated `villageArtifactPool` in `lootjs_overhaul.js` — currently 11 items at ~10% combined per village chest, dialed in over April), Celestial Artifacts, and Iron's Spells. But the lever was too coarse — it discarded **every** non-allowlisted GLM, requiring exhaustive re-enumeration per mod update.

**Switched approach.** All four GLM file copies (`kubejs/data/forge/loot_modifiers/global_loot_modifiers.json` × main + 2 distros + datapack source) are now `{"replace": false, "entries": []}`. Mods register their own GLMs through the merged registry as Forge's default behavior intends. Suppression now happens via 17 empty-pool override JSONs in `datapack_sources/icraft_loot_overrides/` at the same paths as the mod-shipped impl files (datapack-over-jar precedence makes our shadow win):

- **9× `data/celestial_artifacts/loot_modifiers/chests/*.json`** — abandoned_mineshaft, ancient_city, bastion_treasure, desert_pyramid, end_city_treasure, jungle_temple, nether_bridge, underwater_ruin_big, village_plains_house. Kept `chests/fishing_treasure` and the 5 `fishing_box/*` GLMs intact since those are item-effect mechanics tied to the Treasure Hunter Necklace, not chest pollution.
- **8× `data/irons_spellbooks/loot_modifiers/chest_loot/*.json`** — vanilla_generic, compat_generic, compat_good, compat_treasure, end_city, ancient_city, stronghold_library, nether. Spell-book seeding is curated through `lootjs_overhaul.js` per the existing design.

Each shadow uses the original modifier type but replaces the conditions block with `[{"condition": "minecraft:any_of", "terms": []}]` (impossible) and points the loot reference at `minecraft:empty`, so the modifier loads cleanly but never fires.

**Discovery during the audit:** the `audits/rpgseteffects.md` claim that `replace:true` was suppressing `rpgseteffects:loot_injection/*` was factually wrong. Class Artifacts (the `rpgseteffects` namespace mod) does NOT use the Forge GLM registry — it uses Java-side `LootInjection` classes (`OverworldArtifactLootInjection`, etc.) that bypass the GLM system entirely. The mod has been injecting at native rates the whole time. If we want to throttle it, that's a separate problem requiring a different mechanism (Mixin or LootJS-side stripping).

icraft_loot_overrides.zip rebuilt and copied to all three Paxi datapack locations (`config/paxi/datapacks/` in main + server_distribution + distribution/client).

---

## 2026-05-10 — SimpleFarming GLMs whitelisted (superseded by structural fix later same day)

Initial response to the tester report ("previously other, non-wheat seeds would spawn, but I've barely seen any"). Added four `simplefarming:*_seeds` entries to the `replace:true` allowlist. Two hours later replaced this point fix with the structural strategy switch above — the allowlist approach was killing dozens of other mods' GLMs (Thermal Cultivation, Farmer's Delight, Aether, etc.) that the changelog entry had not enumerated. See entry above for the full audit + replacement strategy.

---

## 2026-05-09 — Death penalty caps at `maxDur - INERT_THRESHOLD` (was leaving items at 1 dura)

Yesterday's fix (route through `hurtAndBreak`) preserved the "never destroyed" invariant but lost the pack's stricter "stop at the inert threshold" invariant. With the JS-side ceiling removed, the death-penalty damage flowed through the mixin's `maxDur - 1` clamp and items ended up at exactly 1 dura remaining post-respawn. The live-tick sweep was bumping them back to `maxDur - INERT_THRESHOLD` a few ticks later, but to the player the post-respawn moment showed a fully-broken item.

Two clamping layers now operate at different thresholds:

- **Pack invariant** (stricter): death-penalty cap at `maxDur - INERT_THRESHOLD` (`= maxDur - min(100, maxDur/2)`). Computed in JS *before* the `hurtAndBreak` call. If a stack is already at / past the inert ceiling, no `hurtAndBreak` call is made; the `BROKEN_TAG` is just refreshed.
- **Mixin invariant** (absolute floor): "never destroyed", clamps at `maxDur - 1`. Enforced by `ItemStackHurtAndBreakMixin` + Tetra's `damageItemImpl` + our overridden `Item.damageItem` on `ItemModularArmor` / `ModularSpellBookItem` / `ModularArsSpellBookItem`. Belt-and-suspenders fallback.

Death-penalty `applyDurabilityLoss` now: clamp `durLoss` to `(maxDur - INERT_THRESHOLD) - currentDamage` → call `stack.hurtAndBreak(cappedLoss, ...)` → stamp `BROKEN_TAG` if post-call damage crosses the inert ceiling. Unbreaking enchant still applies to the *capped* amount.

---

## 2026-05-09 — Death-penalty durability loss now routes through `hurtAndBreak`

Tester report: died holding a broken Tetra equip; it disappeared post-respawn. Root cause: `death_penalty.js` `applyDurabilityLoss` wrote `Damage` NBT directly (`stack.nbt.putInt('Damage', targetDamage)`), which bypassed BOTH the `ItemStackHurtAndBreakMixin` clamp AND Tetra's own `damageItemImpl` clamp. The script attempted its own clamp at `maxDur - min(100, maxDur/2)` — different from the mixin's `maxDur - 1` — and the clamp logic interacted badly with already-broken items (writing a damage value below the current one in some edge cases, leaving the broken-tag set on a stack the live tick sweep didn't expect to encounter).

Additionally, `hasNativeBreakProtection` (which skips Tetra in the live-tick + proactive-hurt clamp paths) was NOT consulted in the death penalty — so Tetra items got the JS clamp applied without their own clamp running. Both clamp layers bypassed.

Fix: replace the direct NBT write with `stack.hurtAndBreak(durLoss, player, e => {})`. This routes through the mixin (clamps `amount` to `maxDamage - currentDamage - 1` at HEAD) AND through `Item.damageItem` (which our `ItemModularArmor` / `ModularSpellBookItem` / `ModularArsSpellBookItem` overrides apply Tetra's clamp for modular items). Single source of truth — items can never reach `maxDamage` through any path now.

Side effects:
- **Unbreaking applies on death**: `hurtAndBreak` runs Unbreaking probability, so an Unbreaking-IV piece takes proportionally less death-penalty damage. Per design decision 2026-05-09 this is desired — matches in-combat behavior, rewards Unbreaking investment, stacks multiplicatively with Soulbound.
- **JS-side dual clamp removed**: the `targetDamage = maxDur - threshold` branch is gone. The `BROKEN_TAG` is still set when post-clamp damage crosses the inert threshold so the live-tick inert-state effects (zero attack damage, mining cancellation, right-click block) keep working.

---

## 2026-05-08 — ItemModularArmor + spell books: inline `ModularItemDamageEvent` guard (bootstrap mixin failed)

Third recurrence of the `ItemModularArmor → ModularItem` ClassCastException crash from Aetheric Tetranomicon's `VeridiumInfusionEffect` listener. Earlier "fix" (commit c0472d0d) added a generic `EventBusInvokeMixin` in `iridescent-durability-clamp` that wrapped every Forge listener invoke in try/catch CCE. Mixin registered ("Preparing iridescent_durability_clamp.mixins.json (2)") but never applied — debug.log shows `ItemStackHurtAndBreakMixin` mixed in but no `Mixing EventBusInvokeMixin...` line.

Root cause: Forge's `ASMEventHandler` lives in the `MC-BOOTSTRAP` module layer (visible in stack trace as `MC-BOOTSTRAP/net.minecraftforge.eventbus/...ASMEventHandler.invoke`). Bootstrap classes load before the regular mod-mixin transform stage runs, so mod-level mixins targeting `ASMEventHandler` are never given the chance to instrument it.

Fix: revert to the inline-guard pattern at the call site. `ItemModularArmor.damageItem`, `ModularSpellBookItem.damageItem`, and `ModularArsSpellBookItem.damageItem` now each inline the body of `IModularItem.damageItemImpl` (post `ModularItemDamageEvent`, apply `BloodboundEffect`, clamp to `maxDamage - 1`) with a try/catch ClassCastException around `MinecraftForge.EVENT_BUS.post(event)`. The throwing listener's contribution and any same-priority-or-later listener get skipped on impacted hits; everything else (BloodboundEffect, clamp) still runs. Server stays up.

Tradeoff: addons that subscribe to `ModularItemDamageEvent` and run after Aetheric's listener silently lose their amount mutations on our items. Acceptable given the alternative is hard-crashing every armor hit. Proper fix would need a transformation-service-level mixin or Sinytra Connector pre-launch hook — neither in scope today.

`EventBusInvokeMixin` stays in the durability-clamp jar as a no-op safety net for non-bootstrap CCE patterns; class-level Javadoc updated to flag the limitation so future readers don't waste time wondering why it doesn't fire.

---

## 2026-05-07 — Reforged armor: workbench Repair tab now appears

Bug report: holding a reforged armor piece at the Tetra workbench showed no Repair tab at all. Tetra cycles through installed modules and uses each module's material as the repair input — but only if the item registered a `RepairSchematic` at construction time.

Root cause: `ItemModularArmor`'s constructor never called `SchematicRegistry.instance.registerSchematic(new RepairSchematic(this, identifier))`. The pattern lives in both `ModularSpellBookItem` and `ModularArsSpellBookItem` (line 133 of each) but was missed when the armor item was originally written. Same audit also revealed the missing `DataManager.instance.moduleData.onReload(this::clearCaches)` call -- workbench/datapack changes to module data needed a relog to propagate.

Fix: constructor now takes a per-piece `tetraIdentifier` parameter and runs both registrations. Each of the four pieces gets a distinct identifier (`iridescent_reforged_helmet`/`chestplate`/`leggings`/`boots`). Repair tab now shows up; cache flushes on `/reload`.

---

## 2026-05-07 — Connector mixin-registration fix (durability clamp + 9 aptitude mixins)

User report: items disappearing on break (vanilla AND modular). Investigation found the `iridescent-durability-clamp` mixin had never injected -- the synchronous clamp at `ItemStack.hurtAndBreak` was a no-op. Death penalty's poll-based clamp was the only line of defense but couldn't catch single-frame bursts ahead of vanilla's destruction logic.

Audit revealed `iridescent-aptitudes-mod` had the same regression -- 9 mixins (`MixPlayer`, `MixLivingEntity`, `MixCraftingMenu`, `MixForgeGui`, etc.) silently never injecting for weeks.

Root cause: both mods registered their mixin configs ONLY via `META-INF/MANIFEST.MF` `MixinConfigs:`. Sinytra Connector intercepts the mixin transformer chain to relay fabric-mod mixins, and silently drops Forge configs registered via the manifest alone. The `mods.toml mixinConfigs=["..."]` field IS preserved -- one line, fixes both mods.

Wider audit: every iridescent-* mod with mixin code now has `mixinConfigs=` declared in its mods.toml. Lessons-learned entry shipped to internal repo for future mod authors.

---

## 2026-05-07 — Skyshatter affix: T4 gate + sky-launch on-hit effect

Custom Skyshatter affix (created March 15 in a 54-affix batch) was overtuned: ancient-tier `+4.0 attack_knockback` vs stock `knockback` affix's `+2.5`. Compounding with Punch enchants and ImprovedMobs weapon rolls produced extreme launch on melee hits. User remembered creating the values as placeholders early in pack planning.

Redesigned to be a **T4 thematic affix** rather than a raw kb amplifier:

- **Rarity gated to mythic + ancient only** (deleted common/uncommon/rare/epic from the values block). Apoth treats absent rarities as "this affix can't roll there" -- naturally gates to T4 player loot. Mob-equipped affixes via the 11% Random Affix Chance roll almost exclusively common/uncommon, so this also blocks ~99% of mob spawns.
- **Values tightened** -- mythic max 2.25, ancient max 3.00 (was 3.25 / 4.00). Still distinct from stock `knockback` so the affix has its own identity.
- **New on-hit effect** -- 20% chance per hit, 2s cooldown per attacker: target gets a pure vertical 0.65 launch + 12-tick (0.6s) Levitation amp 0 + flash particle column + cloud burst + subdued thunder cue. Effect is the real payoff at high tier; the +knockback number is just the baseline.
- **Mob-strip script** -- `affix_skyshatter_mob_strip.js` runs in any dimension on any spawned mob (boss or not), surgically removes `apotheosis:skyshatter` from `affix_data` if present. Belt-and-suspenders if a mythic+ boss ever rolls it.

---

## 2026-05-06 — Iridescent Launcher (server-side) — EXPERIMENTAL

Single-binary Rust replacement for the `.bat` / `.ps1` / `.sh` stack under `.minecraft/server_distribution/`. CLI for headless service operation (NSSM, systemd) plus an egui GUI with one button per subcommand. v0.1 → v0.5 shipped this week.

See [systems/icraft-launcher.md](systems/icraft-launcher.md) for full reference. **Marked experimental** -- not the canonical launch path yet; existing `iridescentserver.bat` continues to work and remains supported until the launcher has had a couple of weeks of real-world testing on the dedicated server box.

---

## 2026-05-04 — Modular Ars spell book: primaryAttributes coefficients fixed (the real 150%/250% source)

User intuition was right: the inflated `+150% Spell Damage / +250% Mana Regen / +15 Max Mana` on a freshly converted Ars book was a "default fall-through" pattern, exactly the same shape as the emerald-robe-malus issue (`feedback_robe_malus_layering.md`). Tooltip cross-checked against `/data get entity @s SelectedItem` — the book had `back_cover_material: back_cover/iron`, `spine_material: spine/iron` (iron primary stat = 5 in `tetra:metal/iron.json`).

Three Ars-side `primaryAttributes` coefficients were 30-60x larger than their ISS twins AND missing the `**` MULTIPLY_BASE prefix (so each became ADDITION). Iron's primary=5 multiplied through:
- `front_cover.spell_damage = 0.3` (was) -> 5 * 0.3 = 1.5 ADDITION = `+150%` on tooltip
- `spine.mana_regen = 0.5` (was) -> 5 * 0.5 = 2.5 ADDITION = `+250%` on tooltip
- `back_cover.max_mana = 3` (was) -> 5 * 3 = 15 ADDITION = `+15` (the only one in a sane range)

Aligned to the ISS book scale (which is correct):
- `front_cover.spell_damage = 0.005` with `**` prefix (matches ISS `**spell_power = 0.005`)
- `spine.mana_regen = 0.01` with `**` prefix (matches ISS `**cooldown_reduction = 0.01` structure)
- `back_cover.max_mana = 5` flat ADDITION (matches ISS `max_mana = 5`)

Iron front_cover now contributes `+2.5%` spell_damage; iron spine `+5%` mana_regen; iron back_cover `+25` max_mana. Netherite (primary=9) maxes at `+4.5% / +9% / +45`. ISS book parity restored.

Companion: per-stack tier swap on `appendHoverText` so the "Can cast tier N glyphs" line matches the source book (novice -> ONE, apprentice -> TWO, archmage -> THREE) instead of always reading the hardcoded `tier=THREE`. Mirrors the renderer trick — swap `book.tier`, call super, restore in finally. Renderer + tooltip share `ModularArsSpellBookItem.resolveTierFromStack()` now.

---

## 2026-05-04 — Modular spell books: Option A unification + ISS held-in-hand override

User reports the modular books' material/improvement attrs target ecosystem-specific Forge attributes, so a Diamond Spell Book held in mainhand buffs `irons_spellbooks:spell_power` only, never the unified `icraft_spell_power` NBT that drives the kubejs damage hook. Picked Option A from the audit: keep ecosystem-specific writes, add an icraft mirror layer.

**Java side (`AttributeApplier.mirrorBookContributionsToIcraftNbt`):** every 1Hz tick scans equipped modular books across mainhand / offhand / Curios, pulls `getAttributeModifiersCached(stack)` (Tetra's full material+module+improvement multimap), maps known attr ids to unified slots via ICRAFT_MIRROR_MAP (`irons_spellbooks:spell_power` AND `ars_nouveau:perk.spell_damage` -> `spell_power`; `irons_spellbooks:mana_regen` AND `ars_nouveau:perk.mana_regen` -> `mana_regen`; `irons_spellbooks:cooldown_reduction` -> `cooldown_reduction`), sums the modifier amounts, writes to player NBT under `icraft_book_<stat>`. Removed when the book is unequipped (NBT key dropped if total is 0).

**Kubejs side (`attribute_sync.js#getAttr`):** wrapped to pull `icraft_book_<name>` and add it to `icraft_<name>` on every read. Class bonuses still own the baseline; book contribution is purely additive. Damage hook + ISS sync layer pick up the combined value automatically.

**Held-in-hand path mirrored to ISS book:** ModularSpellBookItem now overrides `Item.getAttributeModifiers(EquipmentSlot, ItemStack)` for MAINHAND/OFFHAND, mirroring the change shipped on the Ars side. ISS books held in hand now apply Tetra material attrs through vanilla's normal pipeline (the existing Curios override keeps spellbook-slot behavior unchanged).

**max_mana stays ecosystem-specific** -- already cross-applied via `mana_pool_bonuses.js` global +25%; doubling that with an icraft mirror would compound.

---

## 2026-05-04 — Modular Ars spell book: 3D BlockEntity renderer hook

Follow-up to the source-aware icon dispatch commit. `ModularArsSpellBookItem extends SpellBook` already inherits `SpellBook.initializeClient` which constructs a `SpellBookRenderer` (a `FixedGeoItemRenderer<SpellBook>`) and registers it as the `IClientItemExtensions.getCustomRenderer()`. Confirmed via decompiling `SpellBook.class` + `SpellBook$1.class` -- the inner class hardcodes `new SpellBookRenderer()` with no item-class cast on construction; the cast in `actuallyRender` targets `SpellBook` parent which our subclass satisfies.

The blocker was the model JSON: `parent: "item/generated"` skips the BlockEntity-renderer path, so the 3D geometry never drew. Fix: rewrote `modular_ars_spell_book.json` with `parent: "builtin/entity"` and Ars's exact display transforms (mirrored from `novice_spell_book.json`). The 3D book now renders in inventory + first/third person + ground.

**Trade-off taken:** dropped the source_index overrides from the Ars main model. If they fired (source_index > 0) they'd dominate the 3D path; the user explicitly framed the 3D renderer as "cleaner". Per-source 2D Ars model files stay on disk under `models/item/source/ars_*.json` as a documented fallback. ISS books are unaffected -- they keep the 2D-icon path because ISS doesn't ship a usable BlockEntity renderer for our subclass.

`tools/gen_spellbook_icons.py` no longer rewrites the Ars main JSON (would clobber the `builtin/entity` parent). The generator still produces ISS overrides + per-source Ars 2D models for the fallback option.

---

## 2026-05-04 — Modular spell books: source-aware inventory icons (12 ISS + 3 Ars)

Applies the Tetra-wiring lessons-learned to spell-book identity preservation. Mirror of the armor `skin_index` ItemProperty pattern, but on the modular spell books.

**New `ClientSpellbookIcon` (`iridescent-tetra-expansion-mod`):** registers `iridescent_modular_spells:source_index` ItemProperty on both `MODULAR_SPELL_BOOK` (ISS) and `MODULAR_ARS_SPELL_BOOK` (Ars). Reads the core module's variant key suffix (e.g. `iss_core/diamond_spell_book` -> `diamond_spell_book` -> 3) and returns a deterministic numeric index. Wired through `FMLClientSetupEvent.enqueueWork` + `DistExecutor.unsafeRunWhenOn(Dist.CLIENT)` so server load doesn't touch the client-only registration call.

**New `tools/gen_spellbook_icons.py`:** generates per-source item-model JSONs at `assets/iridescent_modular_spells/models/item/source/<src>.json` and stamps the matching `overrides` array into `modular_spell_book.json` + `modular_ars_spell_book.json`. Sources alphabetically sorted to match the runtime index map. Hooked into `build_mod.sh` after the armor `gen_skin_models.py` step.

**Texture mapping:** ISS sources point at `irons_spellbooks:item/<source>` (verified flat 2D PNGs in the ISS jar). `villager_spell_book` is the only ISS source with no flat 2D PNG; falls back to `irons_spellbooks:item/spell_book_models/villager_spell_book` (the 3D model atlas, which renders acceptably as a 2D icon). Ars sources map to colored Ars textures by tier feel: novice -> blue, apprentice -> purple, archmage -> yellow (no `spellbook_gold` ships in the Ars jar).

**Result:** transferring an ISS Diamond Spell Book through the modular workbench now yields a stack whose inventory icon, name (kept by `getName` override from the prior commit), and effect aggregation all reflect the source book's identity. Same path covers Ars books. Shipped in `iridescent_tetra_expansion-1.0.0.jar` to all 3 distros.

The companion 3D-renderer hook for Ars (switching to `parent: "builtin/entity"` so `ModularArsSpellBookItem extends SpellBook` inherits the Ars `BlockEntityRenderer`) is staged for a follow-up commit so failure modes stay isolated.

---

## 2026-05-05 — Unique ISS armor: full crash fix + restored unique geometry

User reported relaunch with my GenericArmorModel fix still crashed at the same `ClassCastException` line. Decompilation revealed `GenericArmorModel<T extends ExtendedArmorItem>` — same generic-bound bridge-cast bug as the per-set models. Our `ItemModularArmor extends ArmorItem` (NOT `ExtendedArmorItem`), so even the "fallback" generic model crashes.

**Root cause traced**: ISS unique-armor models are all `GeoModel<T extends SomeISSArmorItem>` with hardcoded texture path strings inside their typed `getTextureResource(T)` override. Java's compiler-generated bridge `getTextureResource(GeoAnimatable)` casts to the bound type before delegating — that cast is what crashes. The method body doesn't use the item parameter at all; the texture path is just a hardcoded string return.

**Fix**: new `IcraftIssArmorModel.java` extends `GeoModel<GeoAnimatable>` directly (no narrower bound), takes the 3 path strings (geo + texture + animation) via constructor. No item-class cast. Reuses ISS's existing `.geo.json`, `.png`, `.animation.json` resource files — full unique 3D geometry + texture + animations preserved.

**Path data extracted** from decompiling the 17 ISS armor model classes:
- 11 main sets follow `geo/<setName>_armor.geo.json` + `textures/models/armor/<setName>.png`
- `netherite_battlemage` -> `geo/netherite_armor.geo.json` + `textures/.../netherite.png` (special naming)
- 5 single-slot specials: paladin_chestplate, infernal_sorcerer, boots_of_speed, gold_crown (uses `tarnished_armor.geo.json`!), tarnished_crown
- All 17 share `animations/wizard_armor_animation.json`

**`IssRendererFactories.register`** rewritten to instantiate `IcraftIssArmorModel(geoPath, texPath, animPath)` per skin via two helpers:
- `registerSet(setName, geoBasename, texBasename)` — 4 slots × 12 main sets
- `registerSingleSlot(skinId, geoBasename, texBasename)` — 5 specials

Replaces the previous swap-to-GenericArmorModel attempt (which had the same bridge-cast bug a layer up). Built into `iridescent_tetra_expansion-1.0.0.jar`, deployed to 3 distros.

**Resulting state across the 4 identity-preservation layers:**
- Inventory icon: WIRED (192 per-skin model JSONs, `skin_index` ItemProperty)
- 3D worn model: **NOW WIRED** (IcraftIssArmorModel + ISS's resource files)
- 3D textures: **NOW WIRED** (ISS's PNGs)
- 3D animations: **NOW WIRED** (ISS's animation file)
- Display name: STILL BROKEN — DIAG-instrumented, next launch will surface root cause
- Effects: wired via `SkinDefinition.baseAttributes` (should already work)

---

## 2026-05-05 — Unique ISS armor: crash fix + identity-pipeline diag

Tester wore a converted Wandering Magician chestplate -> client crashed:
```
ClassCastException: ItemModularArmor cannot be cast to WanderingMagicianArmorItem
  at WanderingMagicianModel.getTextureResource(WanderingMagicianModel.java:8)
```

ISS unique-armor Geckolib models hardcode a cast to their own ISS armor item class in `getTextureResource`. Our `IssRendererFactories` wrapped these models for our `ItemModularArmor` skins -- which crashes on first armor render. Plus separate symptoms: display name was "Gold Chestplate" not "Reforged Wandering Magician Robes" (skin display_name fallback failing) and inventory icon was generic iron (no skin-aware item-property override exists in `reforged_chestplate.json`).

**Initial misread of design intent.** First fix attempt deleted all 53 ISS replacement files, but user clarified: the design is **conversion + identity preservation + Tetra modular bonuses stacked**. So conversion stays; identity-preservation pipeline needs to be fixed.

**Crash fix shipped** (`IssRendererFactories.java`): replaced all 10 set-specific Geckolib model factories (CultistArmorModel, PyromancerArmorModel, ..., WanderingMagicianModel, etc.) with `GenericArmorModel(setName)`. Generic model uses string-based texture resolution, no item-class cast -> no crash. Also dropped 6 single-slot factories (infernal_sorcerer, paladin, boots_of_speed, gold_crown, tarnished_crown, netherite_battlemage singleSlot variant) for the same crash reason. Trade-off: items render with generic-silhouette + ISS texture (the unique 3D geometry of e.g. WanderingMagicianModel is lost). Restoring unique geometry would require either subclassing each ISS model with a cast-tolerant `getTextureResource(GeoAnimatable)` override, or a Mixin neutering ISS's hardcoded cast.

**Replacements restored**: all 53 `data/tetra/replacements/irons_spellbooks__*.json` files put back. Auto-conversion re-enabled.

**Diagnostic logging added** to `SpecializedReplacementHook` to disambiguate why display name falls through to "Gold Chestplate" instead of "Reforged Wandering Magician Robes". The hook will now log:
- `DIAG fired but original item has no registry key` (very rare path)
- `DIAG fired for <id> -> no specialized_replacements entry; returning unenriched` (registry not loaded, OR source mod not registered)
- `DIAG enriching <id> -> skin <skin_id>` (success path — skin tag SHOULD be set)

Next launch will surface which path the user's conversion takes. Three likely causes:
1. **Workbench-driven conversion bypasses `getReplacement` hook** — Tetra's player-clickable convert button might use a different code path that doesn't fire registered hooks. Diagnostic will show whether the hook fires at all.
2. **Specialized replacement registry not populated at conversion time** — datapack reload timing issue, hook fires but lookup returns empty.
3. **Skin tag IS being set but client read path is broken** — `ItemModularArmor.getName` reads `tag.Skin`, looks up `SkinDefinition.displayName()`. If tag is set but the skin definition's `displayName` field returns empty for some reason, falls through.

**Inventory icon issue separate**: `reforged_chestplate.json` only has `material_index` predicates, no skin-aware override. Need to register a custom `ItemProperties.register` returning a numeric per-skin id + add per-skin model overrides. Deferred until display-name root cause is identified.

**Existing converted items in player inventories**: render generic silhouette + ISS texture (no crash). KubeJS migration script to either revert them to native ISS or set the skin tag retroactively is deferrable.

---

## 2026-05-04 — Modular spellbook honing (Tetra IModularItem progression)

Modular Tetra spellbooks (`iridescent_modular_spells:modular_iron_spell_book`, `_gold_`, `_diamond_`, `_apprentice_`, `_archmage_`) implement `IModularItem` but had no progression trigger — Tetra's `tickProgression` ships for weapons + tools, NOT for spell-cast items. Books couldn't be honed for module improvements (the "earn an upgrade slot through use" flow that vanilla Tetra weapons use).

**Fix:** new `SpellbookHoneHandler.java` in `iridescent-tetra-expansion-mod/src/main/java/com/iridescentcraft/modspells/event/`. Mirrors the existing `ArmorHoneHandler` pattern. Three trigger sources:

1. **`SpellOnCastEvent`** (Iron's Spellbooks API event) → +1 tick per held `ModularSpellBookItem`
2. **`SpellCastEvent`** (Ars Nouveau API event) → +1 tick per held `ModularArsSpellBookItem`
3. **`PlayerTickEvent`** every 1200 ticks (60s) → +1 tick per held modular spellbook of either kind. Floor for non-cast play.

Slot scope: mainhand + offhand only (matches `ArmorHoneHandler` simplicity, avoids hard-dep on Curios API at this layer). Curios-slot books still progress passively when also briefly held.

`IModularItem.tickProgression` handles gating internally (config flag, `canGainHoneProgress` check, NBT counter). The handler just calls it — same approach as the armor side.

Built into `iridescent_tetra_expansion-1.0.0.jar`, deployed to all 3 distros via `build_mod.sh`. Verified `SpellbookHoneHandler.class` present alongside `ArmorHoneHandler.class` in the jar.

---

## 2026-05-04 — Pre-T3 diamond hard strip (blanket chest loot)

Tester found diamonds generating in an Overworld structure not yet covered by per-structure strips. Section 4 of `lootjs_overhaul.js` already has ~66 individual `removeLoot('minecraft:diamond')` calls for known structure mods (Explorify, Villages & Pillages, Unwrecked Ships, Dungeons Plus, Structory Towers, etc.) — but new/uncovered structures keep slipping through.

**Fix:** new Section 5A1.5 — blanket `removeLoot('minecraft:diamond')` across ALL chest tables in pre-T3 dimensions:
- Overworld (`minecraft:overworld`)
- T2 modded dims: `twilightforest:twilight_forest`, `aether:the_aether`, `deep_aether:the_aether`, `blue_skies:everbright`, `blue_skies:everdawn`

T3+ (Nether, Undergarden, End, Deeper Darker, The Abyss) keep diamonds — they're tier-appropriate there.

**Scope:** raw `minecraft:diamond` + diamond tools (sword/pickaxe/axe/shovel/hoe) + diamond armor (helm/chest/legs/boots) + diamond horse armor. Anything that could hand a T1-T2 player diamond-tier kit pre-progression. Vanilla stronghold + desert temple chests are the most common source pre-T3; modded structures vary.

3-distro fan-out, md5-verified.

---

## 2026-05-04 — Strip Apotheosis affixes from non-boss overworld mobs

Even after the skyward-launch fix (Levitation cap + Shulkers affix override) earlier today, mob knockback at T1 was still dominant — affix-wielding overworld mobs apply per-hit knockback that breaks T1 melee combat. User decision: nuclear option, no affixes on ANY overworld monsters except Apotheosis bosses.

**Investigation:** `S:"Random Affix Chance"=0.11` in `config/apotheosis/adventure.cfg` is a global knob — no built-in per-dimension exclusion. Apotheosis applies affixes to mob equipment via `MobSpawnEvent.FinalizeSpawn`; `EntityEvents.spawned` (KubeJS Forge wrapper for `EntityJoinLevelEvent`) fires after that, so post-spawn NBT strip works.

**Fix:** new `kubejs/server_scripts/affix_overworld_strip.js` hooks `EntityEvents.spawned`. Filters:
- `entity.monster && entity.living` and not player
- dimension == `minecraft:overworld` only
- skip if entity has NBT `apoth.boss` or `apoth.miniboss` (Apotheosis canonical boss markers)
- skip ISS mob namespace (their abstract `getItemBySlot()` throws `AbstractMethodError` which Rhino try/catch can't catch — same skip pattern as `mob_equipment.js`)

For each remaining mob, iterates the 6 equipment slots (mainhand/offhand/head/chest/legs/feet); if the item NBT contains `affix_data`, removes the compound and re-sets the slot. The mob keeps the base item (still swings a sword) but loses all affix-driven damage/knockback/AoE.

Modded dimensions (Twilight, Aether, Nether, End, etc.) keep affixes — design intent is that exploration outside the overworld is rewarded.

Idempotency: marks entities with `icraft_affix_stripped` boolean so chunk reload doesn't reprocess.

**Verified clean:**
- Shulkers ranged-mob_effect affix override (`config/paxi/datapacks/icraft_apotheosis_affixes.zip` -> `data/apotheosis/affixes/ranged/mob_effect/shulkers.json`) is in place with empty `values: {}` and `types: []`. The skyward Levitation vector from earlier today remains disabled.

**Enemy Expansion audit** (parallel to this fix):
- 27 mobs from `enemyexpansion-2.3.1`: scorpion, wasp, huntsman, direwolf, vampire, crawler, goblin variants, etc.
- All spawn against `#forge:is_general` (overworld-general biomes)
- The notably-bad `enemyexpansion:explosive_launch` mob effect (40-tick countdown, summons invisicreeper explosion + Cardiac DoT + arrow-launch) is already mitigated by `enemyexpansion_explosive_launch_blocker.js` (4Hz strip from all living entities). No additional action needed.

3-distro fan-out, md5-verified.

---

## 2026-05-04 — Tower scroll/ink coverage pass

Magic-themed tower structures had ink + spell books but ZERO scrolls — scrolls only existed in 5 village house chests. Towers are the natural mage exploration landmark, so they should also drop scrolls.

**Verified naming:** Apotheosis ships `apotheosis:chests/tome_tower` (4 biome variants share one loot table). The "gem tower" intuition is from the `apotheosis:gem` (affix gems) that drop *from* tome_tower — but the structure id is `tome_tower`, not gem_tower.

**Scrolls added** (LootJS `customFunction()` to apply `irons_spellbooks:randomize_spell` at the right tier):
- Apotheosis tome_tower: **15%** T1-quality scroll (these towers ARE the magic-discovery landmark)
- TOTW `tower_chest` + `ocean_tower_chest`: 10% T1-quality
- Structory Towers: 6% T1-quality
- Waystone (`stronghold_corridor`): 8% T1-quality
- Keebsz F1-3: 6% T1-quality
- Keebsz F4-6: 5% T2-quality (0.2-0.5 quality range)

**Tower ink rates +50%** (matching the dimension-pool bump):
- Structory Towers common_ink: 10% -> 15%
- Keebsz F1-3 common_ink: 10% -> 15%
- Keebsz F7-10 rare_ink: 12% -> 18%

**Untouched** (already saturated): Apotheosis tome_tower 40% common_ink, TOTW 100% guaranteed common_ink, Waystone general 5% (already in earlier dimension-pool +50% bump).

Helper functions `t1Scroll(chance)` / `t2Scroll(chance)` added at top of Section 7 so future tower additions can reuse the same shape.

3-distro fan-out, md5-verified.

---

## 2026-05-04 — Scroll + ink rate bump (~2x scroll, +50% tier ink)

T1 mage starter loop felt thin: 2.5% scroll per village house = ~25% chance of ANY scroll after clearing 10 villages, and 5% common_ink in Overworld chests was bottlenecking spell scribing once a player had a scroll. With T1/T2/T3 spell damage now buffed, the scarcity of scrolls/ink became the binding constraint on early mage feel.

**Scrolls** — village house weight 1 -> 2 in all 5 biome variants (plains, desert, savanna, snowy, taiga). Effective rate: 1/40 -> 2/41 = **2.5% -> 4.88%** per chest. Roughly 2x.

**Ink** (per-tier dimension chest pools in `lootjs_overhaul.js`, +50% across the board):
- T1 Overworld common_ink: 5% -> 7.5%
- T2 (TF/Aether/BlueSkies) uncommon_ink: 5% -> 7.5%
- T3 (Nether/Undergarden) rare_ink: 4% -> 6%
- T4 (End/DeeperDarker/Abyss) epic_ink: 3% -> 4.5%

Other ink sources (universal Overworld 15%, Apotheosis 40%, TOTW 100%, sentry/Stalwart 10-12%) unchanged — they're already generous and not the binding constraint.

3-distro fan-out, md5-verified.

---

## 2026-05-04 — Magic T2/T3 calibration against new T1 baseline

T1 buff pass earlier today set firebolt floor at 9.0 HP/cast (1.5x of basePower 12). Found the curve had inverted: T2 spells like `ball_lightning` (5.5 HP L1 vanilla) were *weaker* than buffed T1 firebolt, and T2 high-mana spells (`eldritch_blast` 7.5 HP at 90 mana vs firebolt 9.0 HP at 10 mana) had become a strict downgrade on damage/mana. Source-dive of the ISS jar via `javap -v` extracted 30+ T2-T4 spell constants; calibration follows.

**T2 spell power_multiplier overrides** (23 new files in `config/irons_spellbooks_spell_config/irons_spellbooks/`):

Standard T2 (same rule as T1):
- 1.5x for basePower >= 10: ball_lightning, ice_spikes, lightning_lance, stomp, sunbeam, wither_skull, frostwave, heat_surge, thunderstorm
- 2.0x for basePower < 10: blood_needles, fang_strike, magma_bomb, scorch, shockwave, starfall

T2 high-mana (basePower 15, 90-100 mana — lighter buff since mana cost dominates):
- 1.4x: eldritch_blast (7.5 -> 10.5 L1), fire_breath, electrocute

T2 high per-level scaling (modest base buff, preserve scaling curve):
- 1.4x: ice_tomb (basePower 15)
- 1.25x: frostbite (10p +30/lvl), echoing_strikes (10p +20/lvl)

T3 EPIC scaling (per-level is the real damage knob):
- 1.25x: lightning_bolt (15p +10/lvl)

T3 multi-projectile low base:
- 2.0x: flaming_barrage (basePower 3, +2/lvl, 80 mana)

**Untouched (already balanced around extreme scaling, custom formulas, or hybrid mechanics):** heartstop (+200/lvl execute, 120s CD), sonic_boom (50 base), gluttony (30 base hybrid heal/damage), fireball (custom `10 + 5*spellPower` formula), volt_strike (1 base — likely utility), blaze_storm (5 mana channeled).

**Ars Nouveau glyph_explosion** (T2 AoE damage glyph): damage 6.0 -> 9.0, cost 200 -> 150 (-25%). Brings T2 Ars in line with T1 `glyph_harm` buffed earlier today.

**Skipped due to unknown basePower in jar bytecode** (need source-level inspection): burning_dash, cone_of_cold, dragon_breath, ray_of_siphoning, wall_of_fire. Audit doc `IridescentCraft-internal/audits/spell_balance_t1.md` flags as follow-up.

3-distro fan-out, md5-verified.

---

## 2026-05-04 — Magic T1 buff pass + Scroll Forge T1 access

Audit at `IridescentCraft-internal/audits/spell_balance_t1.md` extracted canonical numbers from the ISS + Ars jars and found T1 magic was anaemic relative to T1 melee — firebolt at 6.0 HP/cast vs iron sword at 6.0/swing, but mages also pay mana, can't carry shields, must lead targets, and lack tank-up early. Pack design says mages are back-loaded glass cannons (per `feedback_mage_power_curve.md`) but the early game floor was below "playable."

**Iron's Spellbooks** — per-spell config overrides at `config/irons_spellbooks_spell_config/irons_spellbooks/<spell>.json` for 13 T1 spells. `power_multiplier`:
- 1.5x for spells with baseSpellPower >= 10 (firebolt, magic_missile, icicle, magic_arrow, fire_arrow, blood_slash, acid_orb)
- 2.0x for spells with baseSpellPower < 10 (wisp, guiding_bolt, acupuncture, ray_of_frost, chain_lightning, poison_arrow)
- High-mana spells (eldritch_blast, fire_breath, electrocute, fireball) untouched — already mid-game

Net effect: firebolt 6.0 -> 9.0 HP at L1 (vs iron sword 6.0). Wisp 3.5 -> 7.0. Guiding_bolt 3.0 -> 6.0. Mage's L1 burst now slightly above iron-sword parity, with T1 mob HP scaling (~25 HP) absorbing the buff appropriately.

**Ars Nouveau** — direct TOML edits at `config/ars_nouveau/glyph_*.toml`:
- `glyph_harm`: damage 5.0 -> 10.0, cost 15 -> 11 (-25%)
- `glyph_lightning`: damage 5.0 -> 8.0, cost 100 -> 75 (-25%)

Ars was strictly worse than ISS at T1 on every axis (more mana, less damage, slower cast). Bringing harm to 10 HP at 11 mana makes Ars `Projectile -> Harm` competitive with ISS firebolt for the early-game spell-crafter playstyle.

**Scroll Forge accessibility** — new `kubejs/server_scripts/recipes/magic_recipes.js` swaps the hardcoded `crying_obsidian` (Nether-tier) ingredient for `gold_block` (T1-attainable Day 1-2). Recipe pattern unchanged: 4x gold_block + 3x polished_deepslate.

**Scroll quality gating** unchanged (already correct) — village chests roll at quality 0.0-0.2 (T1 spells only).

3-distro fan-out for all changes (.minecraft, server_distribution, distribution/client). md5-verified.

---

## 2026-05-04 — Avian Sky Affinity: lift the prevent_sleep override out of kubejs/data into a Paxi datapack

Tester reported the Avian origin tooltip on the selection screen still showed the vanilla "When sleeping, your bed needs to be at an altitude of at least 86 blocks, so you can breathe fresh air." — the Sky Affinity replacement (shipped 2026-04 per cont.3327) wasn't landing.

Tracing: `kubejs/data/origins/powers/fresh_air.json` has the correct `origins:multiple` definition with inline `name = "Sky Affinity"` + new `description`, and is identical across all 3 distros. No errors in latest.log. But Origins was still rendering the old text — meaning the kubejs/data override wasn't winning over origins-forge.jar's bundled `data/origins/powers/fresh_air.json` (`apoli:prevent_sleep`, height < 86, no inline description so it falls back to lang).

**Fix:** Lifted the override into a Paxi datapack `icraft_origins_overrides.zip` at `config/paxi/datapacks/`. Same pattern that beat the Apotheosis Shulkers ranged-affix on 2026-05-04. Paxi datapacks load at the highest priority tier in the datapack chain, so the prevent_sleep mechanic + the vanilla lang-driven description are both displaced.

Open follow-up: figure out why `kubejs/data/` is unreliable for power-overrides specifically. Other origins powers (vegetarian, burn_in_daylight, fragile, etc.) appear to work from kubejs/data, but those define new powers rather than overriding mod-bundled ones with the same ID. Possible that origins-forge does a one-shot load from its own jar before kubejs/data is processed.

---

## 2026-05-04 — Skyward-launch root cause + permanent fix

Multi-day forensic chain landed: third-layer diag (`diag_player_launch.js`, MobEffect monitor + 4Hz Y-vel scan) finally captured the launch vector after iterating past `MONITOR`-doesn't-exist-in-Forge, `v.level` field-vs-method, and `getGameTime` mapping issues. At 2026-05-04 01:18:36 the captured event was:

```
[player_effect] effect=minecraft.levitation amp=50 dur=10t attacker=no-recent-combat
```

Vanilla `LivingEntity.travel()` levitation math: per-tick target dy = 0.05 * (amp+1). At amp=50 → 2.55 blocks/tick → ~51 blocks/sec UP. Lerped over the 10-tick duration, player flung skyward in half a second. Knockback ratio cap was already saving the horizontal portion of these hits (mag 6.00 → 1.0), but the levitation effect bypassed `LivingKnockBackEvent` entirely — different event path.

**Source identified**: Apotheosis vanilla affix `data/apotheosis/affixes/ranged/mob_effect/shulkers.json`. Type `apotheosis:mob_effect`, target `ARROW_TARGET`, applies `minecraft:levitation`, rolls on `bow / crossbow / trident`. Pillagers (crossbow) and skeletons (bow) both eligible to spawn with this affix via Apotheosis Adventure's mob-equipment system. Vanilla amp math caps at 3 (ancient tier); the runtime-observed 50 likely from `stackOnReapply`-like compounding under multi-hit barrage or from a downstream amplifier multiplier. Exact path remains open forensic work; fix below works regardless.

**Two-layer fix shipped:**
1. **`cap_player_levitation.js`** (commit `6a2c3090`) — generic `MobEffectEvent.Applicable` listener that cancels Levitation amp > 5 on Players. Defense-in-depth in case a different mod ever produces another high-amp Levitation source.
2. **`shulkers.json` overlay** (this commit) — Paxi datapack `icraft_apotheosis_affixes` now ships an empty-`values`-empty-`types` overlay at `data/apotheosis/affixes/ranged/mob_effect/shulkers.json`, making the shulker's affix unrollable. Source-level disable.

3-distro propagation: zip rebuilt + deployed to `.minecraft/config/paxi/datapacks/`, `distribution/client/config/paxi/datapacks/`, `server_distribution/config/paxi/datapacks/`. Verified identical md5 across all three.

Forensic infrastructure (`cap_player_knockback.js`, `diag_player_velocity.js`, `diag_player_launch.js`) stays in place — the per-tick + effect monitors will catch any future bypass attempts immediately rather than after another tester report.

---

## 2026-05-03 — Knockback forensics: third-layer player-launch diagnostic

Tester report: skyward launches still happening after the 2026-04-25/26 fixes (cap_player_knockback's strength + ratio cap on `LivingKnockBackEvent`, and diag_player_velocity's post-hurt Y-velocity clamp on `LivingHurtEvent`). Both layers are deployed, both bootstrap-log on every launch, neither has fired diagnostic events in the captured server.log windows — meaning the launch vector is bypassing both event paths entirely.

Three remaining vector classes:
1. **Status effects** — Levitation (or a mod-custom equivalent) pushes upward over multiple ticks via vanilla `LivingEntity.travel()`, never goes through `LivingKnockBackEvent`. Per-tick velocity delta is small (~0.05 per amplifier) so it never trips our 0.8 spike threshold either.
2. **Deferred velocity** — mods that schedule a `setDeltaMovement` for a later tick after `LivingHurtEvent` has fired.
3. **Custom events** — a mod-defined velocity event distinct from `LivingKnockBackEvent` / `LivingHurtEvent`.

New `kubejs/server_scripts/diag_player_launch.js` (MONITOR-priority, observation only — no mitigation) catches all three:
- **MobEffectEvent.Added handler** — logs every effect applied to a player with attacker attribution (correlated via `persistentData._dpl_atk` written by a paired `LivingHurtEvent` handler within 10 ticks of the hurt). Per-attacker-per-effect dedup so long fights don't spam.
- **4Hz player Y-velocity scan** — every 5 ticks, walks every loaded player and logs when `deltaMovement.y >= 1.0` (well above natural jumps which peak ~0.42). Snapshots the full active-effect list at the moment of the spike. Per-player one-shot until the player touches ground again.

Once we capture a launch with the new diag, we'll know whether it's an effect (most likely Levitation), a deferred-velocity push, or something else, and follow up with a targeted strip/clamp.

---

## 2026-05-03 — Auto session-log push on client + server exit

**Client.** New `.minecraft/prism_postexit.bat` runs as PrismLauncher's `PostExitCommand`:
1. Extracts the launching account from `latest.log` line 1 (`--username, <name>` arg ModLauncher logs at startup), via a temp-file write/read so we sidestep bat for-loop quoting traps with embedded PowerShell single-quotes.
2. Mirrors `latest.log`, `debug.log`, `kubejs/{client,server,startup}.log` to `.minecraft/TesterLogs/<username>/`. Also copies any crash reports created during this session (latest.log creation time as the session-start anchor — Forge rotates the prior latest.log on launch).
3. `git add` + `commit` + `push` the **whole** TesterLogs/ tree, so server-side logs deposited via Z: by `push_crash_logs.bat` ride along on the same push.

**`auto_fix_prism_prelaunch.js` extended** to also wire `PostExitCommand` in `instance.cfg`. New rules: only sets the field if missing or present-but-empty (never overwrites a tester's custom value); skips silently when both PreLaunchCommand and PostExitCommand are already wired. Renamed log prefix from `[auto_fix_prism_prelaunch]` to `[auto_fix_prism]` since it now handles two fields.

**Server.** `iridescentserver.bat` Phase 5 now `call`s `push_crash_logs.bat --silent` on every server exit (clean or crash). New `--silent` flag on `push_crash_logs.{bat,sh}`:
- Suppresses pause + most echo lines.
- Adds a best-effort `git push` from instance root **if** the parent is a git working tree (`git rev-parse --git-dir` check). Topology A (dev PC IS the server): pushes directly. Topology B (dedicated Windows Server with Z: mirror to dev PC's repo): falls through and lets dev PC's `prism_postexit.bat` pick up the mirrored files on its next session.

`push_crash_logs.{bat,sh}` without the flag still works exactly as before (interactive failsafe for one-off pushes).

`bash -n` clean on both `.sh` files; em-dash scan clean on all new/modified `.bat` files (per `feedback_powershell_traps.md`).

---

## 2026-05-03 — auto_fix_prism_prelaunch event-scope fix (PlayerEvents -> ClientEvents)

`auto_fix_prism_prelaunch.js` was logging `Tried to register event handler 'PlayerEvents.loggedIn' for invalid script type CLIENT! Valid script types: [SERVER]` every launch in `kubejs/client.log` — and silently never running. Shipped 2026-05-03 in commit `2aa89426` and unnoticed for two launch cycles because the failure was confined to the client-side KubeJS log (no chat error, no crash).

`PlayerEvents.*` is server-script-only in KubeJS 6.x; for client-side "local player just joined a world" hooks the correct event is `ClientEvents.loggedIn`, which is documented in `.minecraft/local/kubejs/event_groups/ClientEvents/loggedIn.md`. Replaced the registration call and dropped the now-redundant UUID-equals-localPlayer guard (`ClientEvents.loggedIn` fires only for the local player, by definition).

`wiki/CLAUDE.md` "KubeJS Event Compatibility" section updated to call out the server/client scope split, plus the discovery shortcut (`local/kubejs/event_groups/<group>/<event>.md` lists "Valid script types"). Memory `feedback_kubejs_event_scope.md` saved.

---

## 2026-05-03 — PowerShell em-dash parser-bomb fix in distribution scripts

`cleanup_stale_jars.ps1` (client) failed to parse on Windows with `The string is missing the terminator: "` at line 82 char 55, plus `Missing closing '}' in statement block` at line 26. Root cause: line 27 had an em-dash inside a `Write-Host "..."` string literal. PowerShell on Windows reads .ps1 files as Win-1252 by default; the em-dash's UTF-8 byte sequence (`E2 80 94`) decodes to `â € "`, where the trailing `"` prematurely terminates the string and the parser cascades into the rest of the file looking for matched delimiters.

This blocks `prism_prelaunch.bat` from cleaning orphan JARs (ScalingMobs / ImprovedMobs / Azukaars after the 2026-05-03 deprecation), so testers' modlists never trim down.

Fixes: stripped em-dashes from string literals in
- `distribution/client/cleanup_stale_jars.ps1` (line 27 string + line 2 comment)
- `distribution/client/sync_client.ps1` (lines 121, 229 — both `Write-Host "..."` strings on the up-to-date and partial-failure branches)

Comment-em-dashes in PS1 files are left as-is (PowerShell's tokenizer enters comment mode on `#` and discards bytes until newline regardless of encoding interpretation; only string literals are vulnerable). Memory `feedback_powershell_traps.md` already documented this trap; this entry is a re-occurrence in a recently added file.

---

## 2026-05-03 — Bespoke difficulty mod + scaling-mod consolidation

**New custom mod `iridescent_difficulty`** replaces ScalingMobs, ImprovedMobs, AzukaarsFairDifficultyOverhaul, and the dimension-scaling block of `mob_scaling_unified.js` with a single time-based per-dimension scaling system. Tier mapping aligned with `wiki/progression/overview.md`:

| Tier | Dimensions | Start % | Cap % | Cap Hours |
|---|---|:-:|:-:|:-:|
| T1 | Overworld | 150% | 300% | 100h |
| T2 | Twilight Forest, Blue Skies, Aether | 200% | 350% | 100h |
| T3 | Undergarden, Deeper Darker, Nether, Abyss | 300% | 450% | 100h |
| T4 | Deep Aether, The End | 600% | 1000% | 200h |

The End uniquely uncaps after Ender Dragon kill (Deep Aether stays capped). All thresholds + dimension→tier mappings configurable in `config/iridescent_difficulty-common.toml`.

**Multiplier application:** `max_health` / `attack_damage` / `armor` linear; `movement_speed` uses `sqrt(mult)` so a 6× HP mob isn't also a 6× speed mob. Boss scaling stacks on top via the existing ProgressiveBosses + `boss_progressive.js` layers; mob-tier static HP (basic 3×, mid 1.5×, etc.) also composes with the new system.

**Op-only debug commands:** `/icraftdiff status [all]`, `/icraftdiff timer set <hours>`, `/icraftdiff timer reset`, `/icraftdiff uncap end`.

**Removed mods (3):** `ScalingMobs-2.4.3`, `improvedmobs-1.20.1-1.13.6`, `azukaarsfairdifficultyoverhaul-1.2.0`. All `.pw.toml` entries pruned across all 3 distros.

**Majrusz patched, not removed:** `majruszsdifficulty.json` updated with `is_per_player_difficulty_enabled = false`, `crd_penalty` zeroed, `mobs_spawn_stronger` + `spawn_rate_increaser` disabled, `is_scaled_by_crd` flipped to false on 12 features. Net result: treasure bags + jockey spawns + charged creepers + evoker totem drops + raid XP + double_loot + all other content additions stay; mob HP/DMG no longer scales with stage; no Expert/Master tier exists.

**Edited `mob_scaling_unified.js`:** dimension scaling block + DIMENSION_SCALES table removed; tier-HP block kept as static per-mob rule that composes with the new dimension scaling.

**Idle detection** (added later in the same session): per-player movement / damage tracking + spawn-proximity carve-out. Players within `spawnIdleRadius` (default 10 blocks, chebyshev cube) of their respawn point count as idle regardless of movement — base camping shouldn't tick the difficulty. Bed if set, world spawn otherwise; different-dim respawn = not at spawn for the current dim.

**Proportional tick rate.** Per-dimension timer ticks at `active / total` ratio of players in that dim. Examples: 4 players with 2 active = 50% rate, 7 players with 3 active = 42.86% rate, 200 players with 64 active = 32% rate. Implemented via fractional `tickAccumulator` (transient double) on `DimensionDifficultyData` — each `LevelTickEvent.END` adds the ratio, whole-tick rolls advance `tickCount`. Worst-case crash loss <1 tick (~0.05s).

**Debug command surface (final):**
- `/icraftdiff status [all]` — `dim tier=X Yh/Zh mult=N% rate=A.A% (a/b active) ed=✓/✗`
- `/icraftdiff timer set <hours>` — seek the current dim's timer for QA
- `/icraftdiff timer reset` — zero the current dim's timer
- `/icraftdiff uncap end` — manually trigger the End uncap flag for testing
- `/icraftdiff players` — three-state per-player status: `✓ active` / `◍ at-spawn` / `✗ idle`, with idle-minutes shown

Final phase commits this session: `932f3a07` (Phase 1 skeleton) → `0df0af97` (Phases 2-5 timer/scaling/uncap/cmds) → `a2a97e74` (Phase 6 deploy migration) → `d8cb4dd4` (Phase 7 idle detection) → `1ad52c6a` (Phase 8 proportional + spawn) → `994cabb7` (Phase 9 status display polish).

---

## 2026-05-03 — Armor weight explicit tagging (vanilla + modded metal sweep)

**Rule established:** `metal = HEAVY`, `non-metal = MEDIUM`, `pure-mage robes = ROBE`, `rogue/stealth with innate +speed = LIGHT`.

**Vanilla explicit tagging** (replaces "untagged-default-MEDIUM"):
- `minecraft:iron_*` → HEAVY (metal)
- `minecraft:golden_*`, `chainmail_*` → MEDIUM (soft metal, vanilla-weak)
- `minecraft:leather_*` → MEDIUM (non-metal)

**Modded metal sweep** — 8 modded full-sets that had been defaulting to MEDIUM moved to HEAVY: `aether:zanite`, `twilightforest:steeleaf`, `twilightforest:ironwood`, `botania:manasteel`, `botania:elementium`, `blue_skies:aquite`, `blue_skies:horizonite`, `blue_skies:pyrope`, `undergarden:cloggrum`.

**MEDIUM populated** (was empty / defaulted): vanilla gold + leather + chainmail; modded non-metal sets (TF `naga`, `phantom`, `yeti`, `arctic` — scale/bone/fur/wool); ISS `pumpkin` (moved from LIGHT — no innate speed mod).

**LIGHT trimmed** — pumpkin removed (moved to MEDIUM). LIGHT now strictly = rogue/stealth gear with innate speed advantage (ISS `shadowwalker`) + magic cloaks + accessory hats. No vanilla armor.

Speed-modifier accessories (Botania travel sashes, Aether capes/gloves) are Curios-slot items outside the 4 armor slots the weight system reads, so they compose on top of tier scaling without affecting tier classification — no tag needed.

Commit `fc1adc5c`.

---

## 2026-05-02 — ROBE armor tier + tagging audit + Magebloom material

**ROBE class added — true mage gear, 4th tier below LIGHT.** Splits mage-coded armor (circlet, robe_chest, robed_leg_plate, robed_boot_sole reforged majors; ISS class robes; Botania manaweave; Terramity void_mage / exodium_warlock) out of LIGHT into its own tier. Per-piece: +0.10 mana_regen ADD, +1.5% speed, −7.5% armor, −10% toughness. **Full 4/4 robe set unlocks +0.5 mana_regen ADDITION on top** — the "True Mage" payoff for committing to a real caster build instead of mixing in plate. LIGHT keeps its rogue/agile identity (high speed bonus, no mana). Implementation: `ItemModularArmor.ArmorWeight.ROBE`, `ArmorWeightAggregator.WeightCount.robe`, coefficient tables in `kubejs/server_scripts/armor_weight.js`, tooltip color LIGHT_PURPLE.

**Armor tagging audit pass.** Used `IridescentCraft-internal/design/modded_metal_armor_stats.md` (Tetra primaries + per-piece armor + toughness for ~30 modded materials) to fill gaps. Migrations:
- New `data/icraft/tags/items/armor_robe.json` — 50+ entries (ISS class robes, Botania manaweave, Terramity mage sets, ramcompat / relics named robes)
- `armor_light.json` — trimmed to cloaks, hats, accessories, agile rogue gear (Shadow-Walker, pumpkin)
- `armor_heavy.json` — expanded from 33 to 80+ entries: aether phoenix/valkyrie/gravitite, aquaculture neptunium, blue_skies charoite/diopside, botania terrasteel, deep_aether stratus, deeperdarker warden, forbidden_arcanus draco_arcanus/tyr, undergarden froststeel/utherium, more.

**Magebloom Tetra material.** New `data/tetra/materials/skin/magebloom.json` registers `ars_nouveau:magebloom_fiber` as a Tetra material in the `skin` category — slots into modules accepting `tetra:skin/`. primary=0.6 (low armor), secondary=4.5 (mage flavor), magicCapacity=80. Conditional on ars_nouveau loaded. No conflict with existing Tetra materials (verified all-mods cache).

**Tetra workbench module offsets recalibrated.** Earlier "use Tetra defaults for 1-major-3-minor" approach was untested — no vanilla Tetra item exercises `defaultMajorOffsets[1] / defaultMinorOffsets[3]`. Switched to sword-style: major at NE inner `(1, -3)`, minors at sword's W outer + SW outer + a new SE outer mirror.

**Multi-distro deploy gap fix.** Fixes 0848eecf through 78efe6ed (movement_speed `*` prefix, drop super.getAttributeModifiers, "Iron Iron" rename, armor calibration to vanilla scale) only landed in `.minecraft/mods/` — not in `distribution/client/mods/` or `server_distribution/mods/` which is what `sync_client.bat` and the server pull from. Result: testers ran the pre-fix jar for an entire session while the source repo SHA matched. All 3 distros now sync per commit.

---

## 2026-05-02 — Workbench layout + inventory polish

Two related polish passes against tester feedback.

**Tetra workbench module layout: 4-corner instead of cardinal points.** Earlier the major sat at right-mid, three minors at the cardinal points (top, left, bottom) of the diamond. Player feedback comparing to base Tetra's pickaxe: the boxes should sit at the *corners* of the diamond, not at its points. New layout matches Tetra's `defaultMajorOffsets[4]` (4,0 / 4,18 / -4,0 / -4,18) — modules at upper-left, upper-right, lower-left, lower-right. Major at upper-right; the three minors fill the remaining corners ordered as inner-lining (upper-left), mid-tier (lower-left), outer-accent (lower-right).

**Themed-materials lang:** the workbench's "Materials applicable" line on themed schematics rendered `tetra:variant_category.themed.label` as raw text. Tetra strips the namespace from the ResourceLocation when building this lookup key (`iridescent_reforging:themed/` → path-only `themed`), so the existing namespaced lang entry was never matched. Added the path-only key with display name "Themed".

**Curios survival button restored.** Re-enabled `enableButton = true` in `curios-client.toml` across all 3 distros. The Curios slot toggle reappears next to the character model in the inventory. Was disabled during the Codex shortcuts work; the side-effect (Curios was reachable only via E-press toggle) wasn't ideal.

**Aptitudes tab renders in survival.** The aptitudes tab strip on top of the inventory was previously gated to creative mode only — a defensive measure against a feared overlap with Apothic Attributes' "View Stats" button. Geometry audit confirmed no actual overlap (tab strip at y=guiTop−28 to guiTop+4; Apothic toggle at y=guiTop+10 to guiTop+20, 6px gap). Lifted the gate. Players see Inventory + Aptitudes tabs above the survival inventory now.

**Codex Quick Access category.** New top-level category in the Iridescent Codex book: "Quick Access" sorts before "Getting Started", contains two single-page entries (Stats / Aptitudes) whose first page is the screen-link button itself — no preceding text page. Click count to reach the Apothic Attributes screen via the book reduced from 5+ to 3.

---

## 2026-05-02 — Client sync robustness pass (server parity)

The PrismLauncher pre-launch hook (`sync_client.ps1` + `.bat`) drifted from the server's hardened `phase0_sync.ps1`. Five distinct fixes brought it to parity:

- **`-Force` parameter actually works.** The .bat passed it through, but the .ps1 had no `param()` block, so PowerShell silently dropped it.
- **Error-gated SHA write.** Sync no longer marks itself "complete" if any individual file download failed. Partial-failure runs leave the SHA marker unchanged so the next launch retries.
- **`>= 300` cap detection.** GitHub's `/compare` API caps the `.files` array at 300 entries — the `>` vs `>=` distinction is the difference between "fall back to full zip on truncation" and "silently use a 300-entry truncated diff as if it were complete."
- **Self-update staging for sync scripts.** `sync_client.ps1`, `sync_client.bat`, `download_mods.ps1`, and `cleanup_stale_jars.ps1` now stage as `<name>.new` during sync and the `.bat` finalizes them on the next launch (PowerShell holds an exclusive read-handle on the .ps1 it's running, so in-place overwrite isn't reliable).
- **AV-retry on jar copies.** 3-attempt retry with 500ms backoff for the bytecode-patched JARs that Defender locks during scan.

**Cleanup runs every launch, not just on SHA mismatch.** Previously the "up-to-date" early-exit skipped `cleanup_stale_jars` and `download_mods`. Stale jars manually dropped into `mods/` would never get pruned while the repo SHA was steady. Now both run unconditionally at the end of every sync — ~100ms cost on the up-to-date path, catches a slow-bleed that was invisible until someone went looking.

**PreLaunchCommand now points at `.bat`.** `install.ps1` previously wired `instance.cfg`'s PreLaunchCommand straight at `sync_client.ps1`, bypassing the `.bat` finalizer. Updated the install template AND added a self-correcting check inside `sync_client.ps1` that detects legacy `.ps1`-direct wiring on existing testers' instances and rewrites it on next launch. No manual action required from existing testers.

---

## 2026-05-02 — Iridescent Tetra Expansion bundle: cosmetic rebrand + bundle-jar fix

**Bundle visibility:** the two `[[mods]]` entries in the bundled jar now display as **"Iridescent Tetra Expansion: Reforging"** and **"Iridescent Tetra Expansion: Modular Spells"** in the Forge mod list, branding them as members of the bundle. Mod IDs unchanged (zero risk to existing world stacks).

**Critical bug fix:** Phase C's bundling commit silently dropped the bundled jar from the repo. `.minecraft/.gitignore` has an allowlist pattern for tracked custom JARs, and the new `iridescent_tetra_expansion-*.jar` filename wasn't in it — so `git add` of the binary no-op'd without warning. The Phase C commit shipped the source tree but not the actual jar; testers who pulled saw nothing in `mods/`. Added the allowlist entry, force-added the jar, the bundle binary now actually ships with the repo.

**Future plan documented:** the longer-term Option C (true single-mod-ID merge) is filed in the internal repo as the alpha→beta cutover plan. Will ship when we cut a fresh world for beta playtest.

---

## 2026-05-01 — Iridescent Reforging Phase B: archetype improvement schematics

Each major armor module now has one upgrade-path schematic visible in its workbench context menu (alongside the install schematics that swap between archetypes), plus one universal improvement that applies to any major. Mirrors Tetra's Carve hook / Serrate / Temper pattern for swords.

**Five improvements ship:**

| Improvement | Archetype | Effect |
|---|---|---|
| Reinforced | warrior | +1 armor, +5% knockback resist |
| Streamlined | rogue | +5% movement speed, +3% attack speed |
| Runic | mage | +30 max mana, +5% spell power |
| Tempered | balanced | +0.5 armor, +1 max health |
| Polished | shared (any major) | +0.5 toughness |

Each major module's `improvements[]` field references the archetype-appropriate path prefix plus `armor/shared/`. The right-column context menu shows the install schematics for the slot's 4 module choices, plus the one or two improvements the currently-installed module accepts. Schematic requirements gate visibility: `NOT(already-applied) AND module-accepts(key)`. Once you apply Reinforced to a heavy crown, "Reinforced" disappears from that slot's menu (one-shot).

---

## 2026-05-01 — Phase C: bundle into IridescentCraft Tetra Expansion (single jar, two mod IDs)

`iridescent-reforging-mod` and `iridescent-modular-spells-mod` merged into a single `iridescent-tetra-expansion-mod/` source tree producing `iridescent_tetra_expansion-1.0.0.jar`. The bundled jar declares **two `[[mods]]` entries** in its `mods.toml` — `iridescent_reforging` and `iridescent_modular_spells` — preserving both original mod IDs verbatim so every existing in-world stack, recipe reference, and `ResourceLocation`-keyed lookup survives the swap.

**Why bundle:** single artifact for users and the distros to track; shared dependency graph (Tetra + ISS + Curios + Ars + Geckolib all listed once); shared mixin scaffolding (Phase A's `GuiModuleSlotSubheadingMixin` now reusable for any future spell-book UI mixin).

**Why not rename:** changing mod IDs would break every `iridescent_reforging:reforged_helmet` and `iridescent_modular_spells:modular_spell_book` ResourceLocation in player worlds. The bundle is a JAR-level merge, not an identity-level rename.

**Failback path:** `git tag v-pre-bundle` points at the commit immediately before the bundle (`afdf8ec5`, "reforging Phase B: improvement schematics"). To roll back, revert the bundling commit, copy the standalone `iridescent_reforging-0.1.0.jar` and `iridescent_modular_spells-0.2.0.jar` from that commit's tree into `mods/`, world stacks unchanged. The two standalone source trees (`iridescent-reforging-mod/` and `iridescent-modular-spells-mod/`) are kept on `main` for the moment as the reference for any rollback diffing — they'll be deleted in a follow-up commit once the bundle has playtest-stable runtime for ~1 week.

**Distro impact:**
- Bundled jar deployed to all 3 distros (main / server_distribution / distribution/client).
- Standalone jars removed from all 3 distros to avoid duplicate item registration (Forge would refuse to load both).
- Custom-JAR allowlists updated in 10 launcher scripts: `verify_distros.{sh,ps1}`, `server_distribution/{update_mods.{sh,ps1}, sync_from_repo.bat, cleanup_stale_jars.ps1, iridescentserver.bat, diagnose.ps1}`, `IridescentCraft Dedicated Server/{update_mods.ps1, cleanup_stale_jars.ps1}`, `distribution/client/cleanup_stale_jars.ps1`.

---

## 2026-05-01 — Iridescent Reforging Phase A: multi-module-per-slot architecture

Restructured the Tetra-armor extension from "1 module per slot, material variants only" to Tetra's canonical "N modules per slot, each with material variants". Players now choose between archetype-coded module alternatives (warrior / rogue / mage / balanced) at each of the 16 armor slots, mirroring how vanilla Tetra swords pick between basic_blade / heavy_blade / short_blade / machete.

**Audit findings vs Tetra (sword reference):**
- Tetra's variant keys are 2-segment (`heavy_blade/iron`); ours were 3-segment (`leggings/leg_plate/iron`). Tetra's substring-after-first-slash material extraction expects 2-segment; the 3-segment shape was the root cause of multiple display fallback bugs called out in the lessons-learned log.
- Tetra ships 21 sword modules across 5 sword slots; we shipped 16 modules across 16 slots — no choice at any slot. Schematic context menus offered exactly one option per slot.
- Tetra majors use `basic_major_module` type so improvements/durability render natively; ours used `basic_module` everywhere, even on slots that should support honing.
- Tetra ships `~10` material-grouped replacement files; we shipped `217` source-item-keyed replacement files (one per modded armor item). Same coverage, more data churn per iteration.

**What shipped this commit:**
- **52 modules** (4 majors + 9 minors per piece × 4 pieces). 4-archetype design for majors (balanced / warrior / rogue / mage) coded into the stat extracts. Minors trim around the major with smaller deltas.
- **52 install schematics** (one per module) — these populate the per-slot context menu in the Tetra workbench so players see all 4 (major) or 3 (minor) module choices when clicking a slot.
- **728 variant entries** (each module × 14 materials: catch-all + leather + iron + gold + diamond + netherite + 8 themed). Material flavor adds: gold gives mana, diamond gives toughness, netherite gives KB resist, themed materials give per-element spell power.
- **All 217 replacements rewritten** to map to the new default modules. Vanilla armor (iron / gold / diamond / netherite / leather / chainmail / turtle) uniformly populates all 4 slots with the matching material. 192 mod-armor replacements (Aether phoenix, ISS netherite_mage, Twilight Forest steeleaf, etc.) use the same default-module pattern with their original material preserved.
- **76 repair JSONs** rewritten to target the new default major module per piece.
- **128 orphan improvement JSONs deleted** — they referenced a hone-schematic ladder that no longer exists. Phase B will repopulate improvements with module-specific schematic groups.
- **1224 lang entries regenerated** (slot meta × 16 + module meta × 52 × 4 + variant displays × 728 × 2 forms). Tetra's getName chain reads several lang shapes; we author all of them so workbench never renders raw lang keys.

**NBT migration (one-shot, automatic):**
- `StackNbtMigrator.migrate` now also detects pre-Phase-A 3-segment variant keys (e.g. `leggings/leg_plate/iron`) and rewrites them to the new default module's 2-segment shape (`full_leg_plate/iron`) at next inventory tick. The slot tag (which used to point at `leggings/leg_plate` as both moduleKey AND slot key) gets retargeted to `leggings/full_leg_plate`. Sentinel bumped v2 → v3 so any stack still marked v2 gets re-scanned once.
- Existing world stacks survive: their material identity is preserved; their module identity becomes the default for that slot. Players can swap to any of the new alternatives via the workbench.

**Phase B (next session):** improvement schematics. ~5 universal (Enchant / Repair / Socket), ~5 per-archetype shared (heavy / light / mage), ~3 per-module-specific. ~30 improvement schematics + corresponding lang. Each major module's `improvements[]` field gets populated to drive context-menu discovery.

**Phase E (deferred):** evaluate folding `iridescent-reforging-mod` into `iridescent-modular-spells-mod` as a unified "Iridescent Tetra Expansion" jar. Hold until Phase B lands and the system is stable.

---

## 2026-05-01 — Tetra workbench polish: minor-slot subheadings + extra Status bars

Two paired UI improvements landed in `iridescent-reforging-mod` 0.1.0 (no jar-name bump; the same file ships the new behavior):

**Minor-slot subheadings (Mixin into Tetra).** Tetra's `GuiModuleMajor` renders a small slot label above the variant name (`slotString: GuiStringSmall`); the base `GuiModule` used for minor slots has no such field, so minors read as a flat variant name with no hierarchy. Added `GuiModuleSlotSubheadingMixin` which `@Inject(at = TAIL)` into `GuiModule.setupChildren` and adds a `GuiStringSmall` slot label at y=-5 (mirroring Major's 5px offset). Polymorphic dispatch ensures the injection only fires for true `GuiModule` instances — `GuiModuleMajor` overrides `setupChildren` without calling super, so its slot label is unaffected. `remap = false` on both `@Mixin` and `@Inject` because Tetra's method names are not in vanilla SRG. Required adding the SpongePowered Mixin Gradle plugin + AP + `MixinConfigs` manifest entry to the build.

**Extra Status bars (4 vanilla armor attributes).** Tetra's `WorkbenchStatsGui` ships ~80 weapon-oriented `GuiStatBar` instances and `MagicStatsBars` (modular-spells) adds 16 spellbooks attributes — together they cover armor, toughness, durability, and the magic stats. Four armor-natural attributes had no bar registered: `knockback_resistance`, `max_health`, `movement_speed`, and `forge:step_height_addition`. Added `ArmorStatsBars` mirroring the `MagicStatsBars` pattern (FMLClientSetupEvent + enqueueWork + WorkbenchStatsGui.addBar). Each bar's shouldShow returns false unless current OR preview stack has a non-zero modifier so empty-slot armor doesn't pollute the panel. Tooltip text routed through `I18n.get(tooltipKey, formattedValue)` per the modular-spells lesson — `GuiStatBar` wraps tooltips in `Component.literal` not translatable, so the lookup must happen in the getter. With these four added, the `WorkbenchStatsGui` horizontal slider becomes meaningfully populated for armor stacks (was effectively hidden before, since most weapon-side bars filtered out via shouldShow).

Why both: the user spec'd them as paired polish for the workbench UX after the NBT-doubling bug fix made armor slots actually populate. Subheadings give visual parity with majors; bars activate the slider that was always there but never had enough relevant content.

---

## 2026-04-30 — Iridescent Reforging v0.4: workbench-driven replacement + themed module axes

User direction: "specialized armor keeps its unique properties AND is replaceable through the Tetra workbench AND has a full list of module upgrades that fit its existing identity." Three-part shipping in one push.

**Engine — NBT-preserving replacement hook (Tetra public API).**

Tetra exposes `ItemUpgradeRegistry.registerReplacementHook(BiFunction<ItemStack, ItemStack, ItemStack>)` which fires AFTER each replacement with `(original, result) -> finalStack`. The hook reads the original's item ID, looks up an enrichment record, and patches the result with `tag.Skin` + `tag.affix_data` + `tag.affixes` + `Enchantments` + `tag.rarity`.

New classes (`replacement/`): `SpecializedReplacementDefinition` (record), `SpecializedReplacementRegistry` (singleton ConcurrentHashMap keyed by source ResourceLocation), `SpecializedReplacementLoader` (`SimpleJsonResourceReloadListener`), `SpecializedReplacementHook` (registered at `FMLCommonSetupEvent` after Tetra's setup).

**Architecture pivot — drop-in workbench workflow replaces crafting-grid conversion.**

Before v0.4, specialized armor required a 2-step path: crafting grid (source + magic_cloth → reforged with skin). After v0.4, a single drop in the Tetra workbench input slot triggers Tetra's vanilla replacement (item-class swap + default modules) followed by our hook (NBT identity restoration). Same UX as vanilla iron sword → modular sword in Tetra.

**Content — replacement JSONs (192 + 192 = 384 files):**

Tetra-side (`data/tetra/replacements/<source>.json`): standard schema, predicate=source_item, item=reforged_<slot>, default modules with iron variant pre-installed.

Iridescent-side (`data/iridescent_reforging/specialized_replacements/<source>.json`): `{source_item, skin_id}` pairs read by the hook.

Generated for all 42 Tier 1 sets (~192 source items) via Python script that reads existing skin_definitions JSONs to keep naming consistent.

**Content — themed module identity axes (8 axes × 4 minor slots = 32 module variants):**

Vanilla items as material proxies: blaze_rod (fire), blue_ice (ice), ghast_tear (shadow), glowstone_dust (holy), redstone (lightning), oak_sapling (nature — mana regen instead of school), ender_pearl (ender), rotten_flesh (blood).

Per-slot attribute focus (final after `material.primary` fix):

| Slot | Themed bonus pattern |
|---|---|
| `helmet/visor` | +5% axis school spell power |
| `chestplate/chest_lining` | +4% axis + +4% mana regen (or +8% mana regen for nature) |
| `leggings/belt` | +3% axis + +0.02 KB resist |
| `boots/boot_lining` | +3% axis + +0.1% movement speed |

Themed bonuses STACK with specialized skin attributes. Cultist Hood (+5% blood spell power from skin) + Shadow visor (+5% blood from theme) = +10% blood spell power on the helmet.

**Cleanup — deleted 192 conversion recipes.** The `data/iridescent_reforging/recipes/conversion/` directory removed entirely. Workbench replacement covers everything. The 4 base leather recipes for crafting blank `reforged_<slot>` from leather stay as an alternate entry point.

**Generic vs themed minor materials**, since this came up:

| | Generic (`fabric/fibre/skin`) | Themed (`iridescent_reforging:themed/<axis>`) |
|---|---|---|
| `helmet/visor` | +0.5 armor | +5% axis school spell power |
| `chest_lining` | +5% mana regen | +4% axis + +4% mana regen |
| `belt` | +2% KB resist | +3% axis + +0.02 KB resist |
| `boot_lining` | +0.2% speed | +3% axis + +0.1% speed |

Generic = baseline utility. Themed = identity-flavored. Both legal at the same time on different slots (e.g., generic visor + themed lining).

**Bug fix in same v0.4 push:** themed material `primary/secondary/tertiary` were initially shipped as 0.0 — Tetra multiplies variant attributes by `material.primary`, so themed bonuses would have rendered as zero. Fixed to 1.0.

**Codex** Reforging entry expanded to 11 pages: How to reforge, Module slots, Major slot bonuses, Generic minor bonuses, Themed minor bonuses, Stacking identity, Honing, Specialized skin coverage (42+ sets), Set bonuses (mechanic). Stale "two paths" intro replaced with the unified workbench drop workflow.

---

## 2026-04-30 — Iridescent Reforging v0.3: bug fix sweep + full Tier 1 visual coverage

Five follow-up commits after v0.2 closing real issues that surfaced when the user ran the dedicated server. Server now boots clean and all 149 Tier 1 skins have explicit texture coverage.

**Server-startup crash fix.** `truly_modular_create_compat` (the Create integration addon for Truly Modular) had a hard dependency on `armory` (which we removed in phase 9). Crash report: `Mod truly_modular_create_compat requires armory any. Currently, armory is not installed`. Removed `create-truly-modular.pw.toml` from all 3 packwiz indexes — no other mods in the cache depend on armory.

**Module path mismatch.** First server-load surfaced `InvalidSchematicException: faulty module keys` for all 8 init schematics. Tetra's `ItemUpgradeRegistry` uses the path under `data/tetra/modules/` as the module key. Our modules at `data/tetra/modules/iridescent_reforging/<slot>/<position>.json` were registering as `iridescent_reforging/<slot>/<position>` but our schematics referenced just `<slot>/<position>`. Moved all 8 module files up one directory level to drop the `iridescent_reforging/` prefix — module keys now match what schematics' `outcome.moduleKey` already references. Same convention modular-spells uses (their files are at `data/tetra/modules/iss_book/front_cover.json` directly, no extra namespace dir).

**Source item ID audit.** Cross-referenced all 149 conversion recipes' `source.item` fields against the actual mod jars. Two bugs:
- `irons_spellbooks:boots_of_speed` → should be `irons_spellbooks:speed_boots` (the actual ISS item registry name; "Boots of Speed" is just lang display text)
- `undergarden:forgotten_*` → should be `undergarden:ancient_*` (3-piece set: helmet/chestplate/leggings, no boots; "forgotten" is an entity name in Undergarden, not an armor set)

Other 9 namespaces verified clean against their actual jars.

**Texture path schema (v0.3 engine extension).** Added optional `texture_layer_1` / `texture_layer_2` fields to `SkinDefinition`, `SkinDataLoader`, and `ItemModularArmor.getArmorTexture`. When set, the override is used directly; when empty, falls back to vanilla convention (`<ns>:textures/models/armor/<name>_layer_N.png`). This handles mods that ship armor textures at non-standard paths.

**Texture coverage patches (87 skins total):**
- Aquaculture Neptunium (4): `aquaculture:textures/armor/<name>_layer_N.png` — no `models/` subdir
- Undergarden Cloggrum/Froststeel/Utherium/Ancient/Masticated (15): same path layout as Aquaculture
- Blue Skies (20): `blue_skies:legacy_pack/assets/blue_skies/textures/models/armor/<name>_layer_N.png` — extra `legacy_pack/` prefix
- Twilight Forest (28): `twilightforest:textures/armor/<name>_N.png` — no `_layer_` infix; some sets remapped because texture base names differ from material names: arctic→arcticarmor, knightmetal→knightly, yeti→yetiarmor
- Botania Manaweave/Manasteel/Terrasteel/Elementium (16): single combined texture file `botania:textures/model/armor_<name>.png` used for both layers — vanilla armor renderer paints the same texture onto helmet/chest/boots and onto leggings model parts. Approximate fidelity (Botania's native custom HumanoidModel has different proportions) but preserves color identity.
- Cataclysm Ignitium (4): split scheme `cataclysm:textures/armor/ignitium_armor.png` (layer 1) + `ignitium_armor_legs.png` (layer 2). Same approximate-fidelity tradeoff as Botania.

**Final visual coverage:**

| Render path | Mods | Skins | Fidelity |
|---|---|---|---|
| Geckolib factories | ISS (15 sets including specials) | 53 | Native pixel-accurate |
| Vanilla, default texture path | Aether, Deeperdarker, Deep Aether, Forbidden Arcanus | 38 | Native |
| Vanilla, explicit texture override | Aquaculture, Undergarden, Blue Skies, Twilight Forest | 67 | Native (correct texture, vanilla armor model shape) |
| Vanilla, mod texture mapped onto vanilla model | Botania, Cataclysm Ignitium | 20 | Approximate (color identity preserved) |

No iron-fallback skins remaining. Custom-renderer factories for Botania + Cataclysm (would give pixel-accurate fidelity for those 20 skins) tabled — would require refactoring `SkinRegistry` from `GeoArmorRenderer<?>` to `HumanoidModel<?>` and replicating per-mod model construction; estimated 2-3 hours engineering for 20 skins, deferred indefinitely.

**Memory updated:** `feedback_eta_calibration.md` records the user's note that I pattern-match ETAs to human-developer pace; agent execution is ~20x faster on mechanical work, ~5-10x on novel engineering. Future estimates should be in minutes-or-this-session, not hours-or-days.

---

## 2026-04-30 — Iridescent Reforging v0.2: Tier 1 skin coverage + set bonus engine

Big v0.2 push covering ~42 specialized armor sets across 11 source mods, plus the set_id mechanism that preserves full-set bonuses through reforging.

**New engine code (set bonus layer):**
- `SetBonusDefinition` (record): server-side data for a set bonus (set_id, required_pieces, attribute_bonuses, effect_bonuses).
- `SetBonusRegistry`: parallel to `SkinRegistry`. Populated by `SetBonusDataLoader` from `data/<ns>/iridescent_reforging_set_bonuses/*.json`.
- `SetBonusManager`: subscribes to `LivingEquipmentChangeEvent`, scans armor slots, counts pieces per set_id, applies/strips attribute modifiers when set thresholds cross. `PlayerTickEvent` refreshes potion effects every 80 ticks (~4s) so they don't expire while the set is worn. Cached active-sets-per-entity prevents redundant work.

**New engine code (vanilla texture dispatch):**
- `ItemModularArmor.getArmorTexture(stack, entity, slot, type)` overridden — reads `tag.Skin`, looks up the skin's `armor_material_namespace` + `armor_material_name`, returns a vanilla armor texture path routing to the source mod's existing assets. Avoids needing per-mod Geckolib renderer factories for non-Geckolib sets.
- `SkinDefinition` extended with `setId`, `armorMaterialNamespace`, `armorMaterialName` fields.

**Tier 1 content (42 sets, 149 skins, 7 set bonuses):**

ISS specials (deferred from v0.1): Netherite Battlemage, Infernal Sorcerer, Lightbringer/Paladin, Boots of Speed, Iron's Crown, Tarnished Crown.

Aether: Valkyrie, Phoenix (fire immunity bonus), Neptune (water breathing + dolphin's grace bonus), Gravitite (jump boost II bonus), Obsidian, Zanite.

Twilight Forest: Knightmetal, Fiery (fire immunity bonus), Naga Scale, Yeti (strength bonus), Arctic, Steeleaf, Ironwood, Phantom.

Cataclysm: Ignitium (fire immunity bonus).

Aquaculture: Neptunium (water breathing bonus).

Forbidden Arcanus: Draco Arcanus, Mortem, Tyr.

Undergarden: Cloggrum, Froststeel, Utherium, Forgotten.

Deeperdarker: Warden, Resonarium.

Botania: Manaweave, Manasteel, Terrasteel, Elementium.

Blue Skies: Aquite, Charoite, Diopside, Horizonite, Pyrope.

Deep Aether: Stormforged, Skyjade.

**Excluded:** MekaSuit + Ad Astra space suits (already-modular ecosystems that conflict with Tetra). Theabyss elemental sets, Aethersteel, Alex's Mobs single-slot pieces, Bone Reptile, Cataclysm Cursium / Gauntlet variants tabled to v0.2.x sub-audit.

**Set bonus design:** wearing 4 reforged pieces of the same set fires the original bonus automatically (Phoenix fire immunity, Neptune water kit, Yeti strength, Gravitite jump boost, Ignitium/Fiery fire immunity, Aquaculture Neptunium underwater breathing). Mixed sets lose set bonuses — only the per-piece base attributes apply. Documented in the codex's Reforging entry.

**Generation:** Python script at `/tmp/gen_tier1_content.py` defines all 42 sets in one place. Re-run to retune slot armor distributions, material costs, or set bonuses.

---

## 2026-04-29 (cont. 23) — Iridescent Reforging: Tetra-armor extension shipped (phases 1-10)

A custom Forge mod (`iridescent-reforging-mod`, `iridescent_reforging-0.1.0.jar`) that brings Tetra's modular framework to armor — a niche Tetra has never natively supported. Bridges the gap with a single-class `ItemModularArmor extends ArmorItem implements IModularItem`, vanilla material defaults composed with Tetra-cached module attributes and skin-driven base attributes.

**Coverage:** 4 base reforged armor items (helmet/chestplate/leggings/boots), 8 module slots (4 major + 4 minor), 5-level honing track per slot with settled cap at L3, ~125 schematic JSONs total. Eleven ISS robe sets convert end-to-end through a custom `ConversionRecipe` that preserves the source's Geckolib visual identity (via `IClientItemExtensions.getHumanoidArmorModel` skin dispatch), Apotheosis affix NBT, and enchantments.

**Architecture choices:** Curated factory pattern for renderer dispatch (no reflection — class references fail at build time if ISS renames). NBT-driven skin field on stacks dispatches both attribute aggregation (server) and Geckolib model (client). Tetra's existing `WorkbenchTile` accepts our items via the `IModularItem` interface alone — phase 2 audit confirmed zero integration code needed.

**TM:A removal:** `truly-modular-armory` removed from packwiz indexes in all 3 distros. `truly-modular-arsenal` (weapons), `truly-modular-archery` (bows), and `modular-item-api` (the underlying API, depended on by arsenal+archery) retained — Reforging directly replaces only the armor piece. Removal of the rest is a separate decision.

**Original lift estimate vs actual:** 6-9 weeks scoped → shipped in a single working day. Tetra's existing data API + interface defaults handled most of what the design doc estimated as engineering work; the bulk of remaining time was content authoring (44 skin JSONs, 44 conversion recipes, 24 honing schematics, 8 module declarations, 8 init schematics — most generated via Python scripts in /tmp).

**Known gaps for v0.2:**
- Wizard skin renders without dye color (uses a `GenericArmorModel("wizard")` fallback; full `DyeableArmorRenderer` support requires a different factory shape)
- ISS specials deferred (Boots of Speed, Iron's Crown, Tarnished Crown, Infernal Sorcerer, Lightbringer/Paladin chestplates, Netherite Battlemage)
- Aether, Twilight Forest, Cataclysm skin coverage not yet authored
- `IssRendererFactories` class-loads ISS armor model classes directly — fine for the pack (ISS is a hard dep) but a class-load failure for a future standalone-release scenario without ISS

Codex entry: `systems/iridescent_reforging` page with 5 sub-pages explaining craft path, convert path, module slots, honing, and skin coverage. Internal design doc: `IridescentCraft-internal/design/iridescent_reforging_plan.md` (full plan + phase 2 audit findings + migration plan).

---

## 2026-04-29 (cont. 22) — Light armor universal toughness penalty: -7.5%/piece (-30% at 4/4)

Layered onto the armor weight system: any player wearing light armor pieces now eats a `-7.5%` `generic.armor_toughness` penalty per piece (caps at -30% at 4/4 light). Asymmetric — heavy does not add toughness back; the system relies on diamond/netherite's native toughness baseline rather than re-dosing it on top.

**Why:** "Should be really hard to get tanky in light armor, at least early game." Editing toughness on every individual robe item would touch ~80 ISS/Ars/Botania pieces and require revisiting on every mod update. A blanket per-piece tag-driven malus achieves the same effect without per-item tuning.

**Faefolk interaction:** Faefolk-in-robes used to be the "smallest toughness penalty" path (Ethereal Form bypassed at 4/4 light). Now it's still strictly better than mixed/plate (-30% via this new universal penalty vs -50% from Ethereal Form, plus the new penalty stacks for light pieces), but the gap narrowed. The robes-vs-plate "two paths, two costs" framing in the codex still holds.

Files:
- `kubejs/server_scripts/armor_weight.js` — added `PER_PIECE_TOUGHNESS = 0.075`, new UUID `icraft_armor_weight_toughness`, applied as `-lightCount * PER_PIECE_TOUGHNESS` MULTIPLY_BASE in both the tick path and the inventoryChanged refresh
- `datapack_sources/iridescent_codex/.../systems/armor_weight.json` — added the toughness line to "Per-piece effects" and "Full-kit extremes", new "Light is doubly fragile" callout

Codex jar rebuilt + deployed. KubeJS synced to all 3 distros.

---

## 2026-04-29 (cont. 21) — Faefolk: offmeta caster identity (-30% melee, Ethereal Form keeps Med/Heavy clause)

User direction: Faefolk should be an offmeta option, not the BIS choice. The melee malus tightens; Ethereal Form keeps its conditional toughness clause.

**Frail Strikes: -20% → -30% melee damage.** The melee malus is now sharp enough that Battlemage Faefolk is a real tradeoff, not a free spell-power upgrade. Arcane Cleave (1 AD per 50% spell power, 10 mana/hit) still gives Faefolk Battlemage a competitive damage path, but raw blade strikes hit notably weaker than an Orc / Demi-God / Berserker-style frame.

**Ethereal Form: unchanged.** I initially read the user's "robes have their own built in toughness malus" as "remove Ethereal Form because robes already have a malus". That was wrong — they meant the two systems are complementary axes:
- **Light armor wearers** (4/4 robes): -20% generic.armor (from `icraft:armor_light` tags). No toughness halving — the bypass is the design payoff.
- **Med/Heavy armor wearers**: -50% armor toughness (from Ethereal Form). No generic-armor malus — the toughness penalty is the cost of plating up a fae body.

Both penalties stay. Ethereal Form's conditional code in `kubejs/server_scripts/armor_weight.js` is intact.

Files changed:
- `iridescent-origins-mod/.../faefolk/frail_strikes.json` — value -0.2 → -0.3
- `iridescent-origins-mod/.../assets/icraft/lang/en_us.json` — origin description and `frail_strikes.description` updated to -30% melee; origin description clarifies the Med/Heavy toughness clause and the robe bypass

Codex + wiki refresh:
- `race_faefolk.json` (codex) — full rewrite. Three pages: traits / tradeoffs / build notes. Build Notes flags Battlemage as "offmeta but viable" and explicitly steers Berserker/Vanguard/Paladin away.
- `class_archmage.json` (codex) — Glass Nuke math corrected: +50% Supremacy + 30% Faefolk + 15% Mana Attunement T4 + ~16% MAG L100 = ~111% magic (was the stale "+95%" figure that ignored the MAG passive added in cont. 14). Toughness phrasing dropped.
- `class_battlemage.json` (codex) — Best race pairings reordered: Demi-God / Orc / Elf are now BIS, with Faefolk relegated to a flagged Offmeta section. The previous "Faefolk → Resistance II" framing was promoting it as the obvious top choice.
- `wiki/classes/overview.md` and `wiki/design/master-appendix.md` — Faefolk row updated.

Origins jar + codex jar rebuilt and deployed to all 3 distros.

---

## 2026-04-29 (cont. 20) — Full ISS robe piece drops (Apotheosis-affixed)

Parallel rail to magic_cloth crafting — rare full-piece drops of T1 ISS robe sets, with Apotheosis affixes pre-rolled by the existing `apotheosis:affix_loot` global modifier.

**Apotheosis compatibility check:** ISS armor (`ExtendedArmorItem`) extends vanilla `net.minecraft.world.item.ArmorItem`. Apotheosis's `LootCategory.HELMET/CHESTPLATE/LEGGINGS/BOOTS` use `armorSlot(EquipmentSlot)` predicates that match any ArmorItem by slot — confirmed against `dev/shadowsoffire/apotheosis/adventure/loot/LootCategory.class`. No tag wiring needed; affixes are automatic on every drop from any loot table.

**Drop pool (40 pieces — 10 craftable T1 robe sets):** Wizard, Cultist, Cryomancer, Electromancer, Plagued, Priest, Pyromancer, Shadow-Walker, Pumpkin (Scarecrow), Wandering Magician. Excludes Archevoker (smithing-only T2), Netherite Battlemage (T4), Infernal Sorcerer / Paladin (boss-tier), Iron's Crown / Tarnished Crown / Boots of Speed (relics).

| Source | Total chance | Rationale |
|---|---|---|
| `irons_spellbooks:chests/*` | 10% | Intentional source — caster strongholds |
| Magic mobs (witch/evoker/vex/illusioner) | 5% per kill | Themed mob — moderate rarity |
| Vanilla undead (zombie/skeleton/etc.) | 2.5% per kill | Passive trickle |

Per-piece chance = total / 40, rolled independently per entry. Slight statistical noise from independent rolls but expected drop frequency matches the headline rate within ~0.5%.

The cascade matches the arcane_essence rates from cont. 19 (chests > magic mobs > undead, halving each step). A player farming undead trash mobs has a slow path to a robe; ISS structure raiding is the fastest path; magic mob hunting is between.

Implemented in `kubejs/server_scripts/loot/lootjs_overhaul.js` via `injectRobeDrops(modifier, totalChance)` helper. Mirrored to all 3 distros.

---

## 2026-04-29 (cont. 19) — Magic cloth accessibility: arcane_essence loot injection

T1 caster crafting was bottlenecked on `irons_spellbooks:arcane_essence` volume — Wizard chestplate needs 64 (8 magic_cloth × 8 essence), full Wizard set needs 192. ISS does drop arcane_essence in its structure chests + caster-mob drops natively, but the rate didn't make the Wizard set feel reasonably craftable on a casual T1 timeline.

Two LootJS injections in `kubejs/server_scripts/loot/lootjs_overhaul.js` (additive — they compound on top of ISS's native drops, don't replace):

| Source | Drop | Rate |
|---|---|---|
| Any `irons_spellbooks:chests/*` chest | +2-4 arcane_essence | 45% |
| Vanilla witch / evoker / vex / illusioner | +1-2 arcane_essence | 35% per kill |
| Vanilla undead (zombie, zombie_villager, husk, drowned, skeleton, wither_skeleton, stray, phantom) | +1 arcane_essence | 10% per kill |

**Target curve:** a player who's killed ~30-50 magic mobs during normal overworld exploration has enough essence for a Wizard helmet or boots; full chestplate is within reach by the time they unlock T2. ISS-structure raiding still gives the fastest path (45% per chest at 2-4 each) but isn't required.

The 35% on vanilla magic mobs was picked to be noticeable but not dominant — not every kill drops, but the pile builds passively. Witches in swamp huts, evokers in raids, illusioners from explorer chests = a steady trickle.

Mirrored to all 3 distros.

---

## 2026-04-29 (cont. 18) — Faefolk Ethereal Form conditional + origins build script cleanup

Two cleanups paired.

### Faefolk Ethereal Form is now conditional on armor weight

User insight: now that the armor weight system exists (cont. 16), Faefolk's `armor_weakness` (-50% armor toughness) is double-dipping when the player is already wearing light armor — light armor itself reduces base armor by 5%/piece, so the toughness penalty on top is excessive for the natural caster kit. Conversely, a Faefolk who *tries* to plate up should keep the penalty (their fae body still rejects heavy armor).

Implementation: convert `armor_weakness.json` from `origins:attribute` (always-on -50% toughness) to `origins:simple` (description-only stub). The actual mechanic moves to `kubejs/server_scripts/armor_weight.js`:

- If player is Faefolk AND has fewer than 4 light armor pieces equipped → apply −50% `generic.armor_toughness` (multiply_base)
- If player has 4/4 light pieces → no toughness penalty (caster identity payoff)
- If player isn't Faefolk → no modifier ever

Refresh fires on the same 100-tick cadence as armor weight + immediate refresh on `inventoryChanged` for snappy UI feedback.

**Net effect:** full-robe Faefolk casters lose nothing. Faefolk who mix in any non-light piece (medium chest plus light helm, etc.) get the full penalty. Heavy-armor Faefolk get the penalty AND the heavy armor's mana regen / speed costs. Reinforces the "Faefolk casters should wear robes" identity without forcing it.

Files touched:
- `iridescent-origins-mod/.../faefolk/armor_weakness.json` — `origins:attribute` → `origins:simple`
- `iridescent-origins-mod/.../assets/icraft/lang/en_us.json` — updated description to reflect the conditional
- `kubejs/server_scripts/armor_weight.js` — added Faefolk detection + conditional toughness modifier
- `.minecraft/datapack_sources/iridescent_races/` — mirrored
- `wiki/classes/overview.md` Faefolk row + `wiki/design/master-appendix.md` race table

### Origins build script cleanup

`iridescent-origins-mod/build_mod.sh` had two bugs:
1. **Stale deploy paths** — used `$PROJECT_ROOT/minecraft/mods/` instead of `$PROJECT_ROOT/.minecraft/mods/` (missing dot prefix). Caused cont. 17's deploy step to fail with "No such file or directory"; I worked around with manual `cp`.
2. **Dangerous Step 1** — `rm -rf "$RESOURCES/data" "$RESOURCES/pack.mcmeta"` then re-extracted from the *previously deployed* jar back into `src/main/resources/`. Round-trip means any pending edits in src/ get silently clobbered on every build. This bit me on cont. 17 — when I rebuilt after editing the Faefolk powers, the script would have wiped them if I'd run it before deploying. Got lucky; fixed now.

Rewrote to match the modular-spells / aptitudes / durability-clamp pattern: source-of-truth is `src/main/resources/`, gradle builds straight from there, deploy to all 3 distros via `find -delete` + `cp`. Same `iridescent_origins-1.0.0.jar` filename — allowlists unchanged.

---

## 2026-04-29 (cont. 17) — Faefolk rebalance: melee malus + mana regen, Armor Weight codex entry

### Faefolk rebalance

User directive: "Faefolk should be the fragile caster origin — spellpower keeps it viable, but it shouldn't be the *best* Battlemage."

Two changes to `iridescent-origins-mod`:

| Power | Before | After |
|---|---|---|
| `nature_magic` | +30% magic damage | +30% magic damage **AND +10% mana regen** (`irons_spellbooks:mana_regen` ADDITION 0.1) |
| `frail_strikes` (new) | — | **−20% melee damage** (`generic.attack_damage` MULTIPLY_BASE −0.2) |

**Net effect:** Faefolk is now strictly stronger as a pure caster (Archmage / pure-spell Battlemage build) and strictly weaker as a melee-leaning Battlemage — exactly the design intent. The +10% mana regen feeds Battlemage's Arcane Cleave loop (which needs mana to convert spell power → AD), but the −20% melee malus partially eats the bonus AD that Cleave provides. Other races without the melee malus (Elf, Demi-God, Human) become more attractive Battlemage choices.

**Battlemage with Faefolk math** (full investment, ~+150% bonus spell power):
- Old: Cleave gives +3 AD, no penalty → +3 AD net per hit
- New: Cleave gives +3 AD, Frail Strikes −20% on attack_damage base = roughly net +1.4 AD per hit (still positive but materially worse)

Pure Archmage Faefolk is buffed — the +10% mana regen feeds spell-spam more effectively, and there's no melee penalty to eat into anything (Archmage already has its own Frail Frame).

**Files touched:**
- `iridescent-origins-mod/src/main/resources/data/icraft/powers/race/faefolk/nature_magic.json` — added second modifier for mana_regen
- `iridescent-origins-mod/src/main/resources/data/icraft/powers/race/faefolk/frail_strikes.json` — new power
- `iridescent-origins-mod/src/main/resources/data/icraft/origins/faefolk.json` — added frail_strikes to powers list
- `iridescent-origins-mod/src/main/resources/assets/icraft/lang/en_us.json` — updated nature_magic description, added Frail Strikes name + description
- Mirrored to `.minecraft/datapack_sources/iridescent_races/`
- Rebuilt `iridescent_origins-1.0.0.jar`, deployed to all 3 distros (manual copy — build script's deploy paths use stale `minecraft/mods/` path missing the dot prefix; not blocking, just a cleanup task)
- Updated `wiki/classes/overview.md` Faefolk row + `wiki/design/master-appendix.md` race table

### Armor Weight codex entry

5-page entry under Pack Systems → "Armor Weight" (sortnum 10). Covers per-piece effects, full-kit extremes, the actual tag inventory, and the Forge-tag mechanism. Built into `iridescent_codex_data.jar` via `build_codex.sh`.

Mirrored to all 3 distros.

---

## 2026-04-29 (cont. 16) — Armor weight system + Battlemage rework

Per design doc `IridescentCraft-internal/design/armor_weight_battlemage_plan.md`. Two paired changes:

### Part A — Armor weight system

Armor pieces now carry one of three tags. Per-piece effects scale with the count of equipped pieces in each category. Untagged armor defaults to medium (no effect).

| Tag | Mana Regen (ADD) | Move Speed (MUL_BASE) | Armor (MUL_BASE) |
|---|:-:|:-:|:-:|
| `icraft:armor_light` | +0.05 | +1.25% | **−5%** |
| `icraft:armor_medium` | 0 | 0 | 0 |
| `icraft:armor_heavy` | **−0.05** | **−1.25%** | +5% |

Full-light kit: +20% mana regen, +5% speed, −20% armor. Full-heavy kit: opposite.

**Tag classification** auto-generated by keyword match across all 541 armor pieces in the pack:
- **78 light pieces** — robe-coded sets (ISS Wizard / Pyromancer / Cryomancer / Electromancer / Cultist / Plagued / Priest / Shadow-Walker / Wandering Magician / Archevoker / Netherite Battlemage; Ars Arcanist / Sorceror; Terramity Void Mage; Botania manaweave + cloaks; Apothic Twilight wizard caps)
- **33 heavy pieces** — vanilla diamond + netherite, Aether obsidian/aethersteel, Cataclysm ignitium, Twilight Forest fiery + knightmetal
- **430 medium pieces** — everything else (untagged + locked-medium fallback)

**Implementation:** new `kubejs/server_scripts/armor_weight.js` — tick handler at 100t cadence + snappy `inventoryChanged` refresh. Stable UUIDs per axis; `modifyAttribute` with 0 functionally clears so the same path handles add+remove.

**Tag files:**
- `kubejs/data/icraft/tags/items/armor_light.json` — 78 entries
- `kubejs/data/icraft/tags/items/armor_medium.json` — empty (default for untagged; explicit-only overrides)
- `kubejs/data/icraft/tags/items/armor_heavy.json` — 33 entries

### Part B — Battlemage rework

Battlemage was previously: Arcane Strikes (+15% melee / +15% magic), Spell Armor (+2 armor), Mana Shield (Resistance scaling), 1.9× mana pool. Added two new passives that turn it into a true gish:

| New passive | Effect |
|---|---|
| **Arcane Cleave** | Per 50% bonus spell power, +1 melee attack damage. Each melee hit consumes 10 mana. Bonus only applies when player has ≥10 mana. |
| **Mana Reaver** | Melee kill restores +15 mana. Implements the design doc's "melee kills restore mana" line — sustains the Cleave loop in multi-mob fights. |

**Math at full Battlemage build** (Faefolk + class + skills + passives, ISS spell_power total ≈ 2.0–2.5 = 100–150% bonus):
- +2 to +3 AD bonus on melee hits, gated by 10 mana/hit
- 200 mana pool sustains 20 hits before dropping below threshold
- Mana Reaver +15 mana/kill keeps the loop alive against trash mobs
- vs single boss: ~20 free buffed hits, then Cleave drops out and player swings as plain melee

**Archmage cleanup:** old design said both Battlemage and Archmage have "kills restore mana". Per directive, Archmage loses spell-kill mana entirely (was design-only, never implemented in code). Archmage stays pure caster offense without a melee feedback loop. `master-appendix.md` Archmage row updated.

**Implementation:** new `kubejs/server_scripts/origins/battlemage_arcane_cleave.js` — uses Java reflection on `io.redspace.ironsspellbooks.api.magic.MagicData.getPlayerMagicData()` to read/write mana (same pattern as `mana_pool_bonuses.js`). `EntityEvents.hurt` for the cleave damage bonus + cost; `EntityEvents.death` for the kill restore. Handler is a no-op if ISS isn't loaded (defensive `Java.loadClass` with try/catch).

### Files touched

| File | Change |
|---|---|
| `kubejs/server_scripts/armor_weight.js` | new |
| `kubejs/server_scripts/origins/battlemage_arcane_cleave.js` | new |
| `kubejs/data/icraft/tags/items/armor_{light,medium,heavy}.json` | new (3 files) |
| `wiki/classes/overview.md` Battlemage row | updated |
| `wiki/design/master-appendix.md` Battlemage + Archmage rows | updated |

5 KubeJS data files, 2 wiki updates. Mirrored to all 3 distros.

### Pending (v2 backlog)

- Codex entry for armor weight system (data-only addition, ~5 min next session)
- Manual review pass on the auto-classifier output — a few items might want re-classification (e.g., `irons_spellbooks:netherite_mage_chestplate` is currently light, which fits the "Battlemage robes" archetype but could be argued as medium since it's literally netherite)
- Mana Reaver +15 amount — picked as default; tune in playtest if it feels too generous or too stingy

---

## 2026-04-29 (cont. 15) — Module honing v1: 8 slots end-to-end + 2x Tetra hone speed

Per design plan `IridescentCraft-internal/design/modular_spells_honing_plan.md`. Tetra-style 5-level honing on modular spell book slots, with L3 settled bonuses, gated by hammer tier per level (gold→iron→steel→diamond→netherite). Earned through module-XP from spell-cast use.

### Slots shipped (8 total)

**ISS books (5 slots):**

| Slot | Stat | L1 → L5 | L3 settled bonus |
|---|---|---|---|
| front_cover | max_mana | +5 / +10 / +20 / +35 / +60 | +5 max_mana |
| back_cover | spell_power | +0.02 / +0.04 / +0.07 / +0.09 / +0.10 | +1% magic_crit_chance via `attributeslib:crit_chance` (also boosts magic crits) |
| spine | mana_regen | +0.05 / +0.10 / +0.16 / +0.23 / +0.32 | +0.05 mana_regen |
| pages | cast_time_reduction | +0.01 / +0.02 / +0.04 / +0.06 / +0.10 | +0.02 cast_time |
| core | cooldown_reduction | +0.01 / +0.02 / +0.04 / +0.06 / +0.10 | +0.02 cooldown |

**Ars tomes (3 slots — Ars `core` skipped):**

| Slot | Stat | L1 → L5 | L3 settled bonus |
|---|---|---|---|
| front_cover | `ars_nouveau:ars_nouveau.perk.max_mana` | +5 / +10 / +20 / +35 / +60 | +5 max_mana |
| back_cover | `ars_nouveau:ars_nouveau.perk.spell_damage` | +0.02 / +0.04 / +0.07 / +0.09 / +0.10 | +1% magic_crit_chance |
| spine | `ars_nouveau:ars_nouveau.perk.mana_regen` | +0.05 / +0.10 / +0.16 / +0.23 / +0.32 | +0.05 mana_regen |

**Why no Ars `core` honing:** Ars Nouveau doesn't have native cast_time / cooldown reduction attributes (it uses different gameplay mechanics — spell casts go through glyph-builder + crystal scrying, not the per-spell attribute pipeline). Substituting other stats (warding, flat_mana_bonus) felt arbitrary; cleaner to leave Ars `core` unhoned in v1 and revisit if there's player demand.

**L5 spell_power capped at +0.10** (instead of the original draft's +0.16) to avoid double-counting with the MAG aptitude passive's +0.16 at MAG 32. Combined max scaling stays at +26% spell power across both systems instead of +32%.

### Tool gates per hone level

- L1: gold hammer (T1 — anyone)
- L2: iron hammer (T1)
- L3: steel hammer (T2 — also the gate for the L3 settled bonus)
- L4: diamond hammer (T3)
- L5: netherite hammer (T4)

Naturally locks max-honed books behind T4 access, matching the pack's general "endgame stat ceiling at T4" pattern.

### Tetra honing speed: 2x

`.minecraft/config/tetra.toml` — halved all `_base` and `_integrity_multiplier` values + `settle_base`. Tester directive: vanilla Tetra honing pace is too slow for the pack's content density.

| Tool type | Upstream base | New base |
|---|:-:|:-:|
| sword | 90 | **45** |
| double-headed (axe etc.) | 140 | **70** |
| bow / shield / crossbow | 40 | **20** |
| single-headed | 100 | **50** |
| settle_base | 270 | **135** |

Integrity multipliers also halved correspondingly. Books inherit the closest applicable scaling (probably the `single_headed` schema, but Tetra picks at runtime).

### File breakdown

| Asset | Count |
|---|:-:|
| Multi-level improvement JSONs (5 entries each) | 8 |
| L3 settled improvement JSONs | 8 |
| Hone schematic JSONs (5 levels × 8 slots) | 40 |
| Settled schematic JSONs | 8 |
| Lang entries (improvement names + descriptions) | 32 |
| **Total new JSONs** | **64** |
| **Total lang lines** | **32** |

Built into `iridescent_modular_spells-0.2.0.jar` (same filename — allowlists unchanged). All 64 files verified in the built jar.

### Verification path (when you next launch)

1. Open Tetra workbench with a fresh ISS spell book → confirm all 5 honable slots (front_cover, back_cover, spine, pages, core) show their hone schematic options after you've cast enough spells to unlock the module XP threshold (now at 2x speed).
2. Apply L1 hone with a gold hammer → confirm stat shows in book tooltip.
3. Cast more spells → unlock L2 → apply with iron hammer → confirm stat replaces L1 (doesn't stack).
4. Continue to L3 → confirm L3 settled schematic appears alongside the L4 hone option.
5. Apply settled with steel hammer → confirm settled bonus shows alongside the L3 hone bonus.
6. Repeat for an Ars tome (3 slots: front_cover, back_cover, spine). Verify Ars `core` shows no hone schematic (intentional skip).

If issues, the most likely failure modes are: (a) attribute lookup fails (wrong attribute ID — fix in the improvement JSON), (b) Tetra doesn't recognize `"hone": true` for our slot type (would need to compare with vanilla Tetra weapon hone schematics for shape differences), (c) workbench UI doesn't show the icon (would need a custom glyph at the textureY coordinate).

### Pending (v2 backlog)

- Ars `core` honing — needs an Ars-appropriate attribute or custom registration
- L5 settled bonuses — held back per the design plan; revisit if L5 feels flat
- Custom glyphs — currently using Tetra's default hone glyph (`textureY: 240`); could draw book-themed icons for each hone

Mirrored to all 3 distros via `iridescent-modular-spells-mod/build_mod.sh`.

---

## 2026-04-29 (cont. 14) — Aptitude fork: design plan extended with MAG + INT native passives

User reasoning on cont. 13: skill-tier delivery (Mana Spark / Blaze / Inferno) IS effectively passive scaling for spell power, just chunked at thresholds rather than smooth per-level. So MAG should also have *true* per-level passive scaling on top of the threshold skills, matching the JLFork pattern other aptitudes use. Same logic for INT — the upstream `entity_reach` passive doesn't fit the design, but a `crit_chance` passive does (and pairs naturally with LCK's `critical_damage`).

Updated the design plan (`IridescentCraft-internal/design/aptitude_skill_plan.md`) with explicit native-passive sections for MAG and INT, then implemented in the fork.

### MAG native passives (added)

| Passive | Attribute | Value at MAG 32 | Per-level avg |
|---|---|---|---|
| **Spell Power** | `irons_spellbooks:spell_power` (ADDITION) | +0.16 | ~+0.5% |
| **Mana Regen** | `irons_spellbooks:mana_regen` (ADDITION) | +0.32 | ~+1% |

Stacks with skill effects: full-MAG player gets +66% spell damage (+16% passive + +50% from Mana Spark/Blaze/Inferno) and +47% mana regen (+32% passive + +15% from Conservation of Magic at MAG 10).

### INT swap (entity_reach → crit_chance)

| Change | Why |
|---|---|
| Remove `ENTITY_REACH` passive (was on INT) | Not in design; entity_reach attribute itself stays vanilla-registered, just not aptitude-scaled |
| Add `CRIT_CHANCE` passive on INT (`attributeslib:crit_chance` +0.25 ADDITION at INT 32, ~+0.78% per level) | Pairs with LCK's existing `critical_damage` (+25% at LCK 32) for natural separation. Magnitude matches LCK's crit_damage so neither aptitude over/under-shoots the other |

**"Global including magic"** — `attributeslib:crit_chance` is what `kubejs/server_scripts/magic_crit_hook.js` reads to apply crit rolls to magic damage. Adding it as an INT passive automatically gives global crit chance (melee + ranged + magic) without any extra wiring.

### Files touched

- `iridescent-aptitudes-mod/src/main/java/com/seniors/justlevelingfork/registry/RegistryPassives.java` — 3 new RegistryObjects (SPELL_POWER, MANA_REGEN, CRIT_CHANCE); ENTITY_REACH commented out
- `iridescent-aptitudes-mod/src/main/java/com/seniors/justlevelingfork/handler/HandlerCommonConfig.java` — 6 new fields (3 values + 3 levels arrays)
- `iridescent-aptitudes-mod/src/main/resources/assets/justlevelingfork/lang/en_us.json` — passive name + description for each
- `iridescent-aptitudes-mod/src/main/resources/META-INF/mods.toml` — re-added ISS hard-dep + added Apothic Attributes hard-dep (so attribute lookups always resolve)
- `config/JLFork/justleveling-fork.common.json5` — 3 new config blocks (mirrored to all 3 distros)
- `iridescent_codex_data.jar` Aptitudes entry — split into separate "passives" + "Effects via KubeJS" pages
- `IridescentCraft-internal/design/aptitude_skill_plan.md` — explicit Native passives sections for MAG and INT

### Comparison with existing JLFork passive scaling

| Aptitude max-level totals | Stat |
|---|---|
| STR | +1.5 attack damage, +0.4 attack knockback |
| CON | +20 max HP (10 hearts), +50% knockback resist |
| DEX | +50% movement speed, +5 projectile damage |
| DEF | +4 armor, +1 armor toughness |
| **MAG** | **+16% spell power, +32% mana regen** ← new |
| **INT** | **+0.4 attack speed, +25% crit chance** ← entity_reach swapped |
| BLD | +1.5 block reach, +50% break speed |
| LCK | +2 luck, +25% crit damage |

MAG's 16% spell power is intentionally on the conservative side (less than DEX's 50% speed or CON's 10 hearts) because skill-tier scaling adds +50% on top, totaling +66% — which sits in the middle of the pack's damage-stat distribution.

Mirrored to all 3 distros. Same `justlevelingfork-1.2.1-iridescent.1.jar` filename.

---

## 2026-04-29 (cont. 13) — Aptitude fork: align with design (remove magic_resist + beneficial_effect)

User correction on cont. 12: the aptitude design plan (`IridescentCraft-internal/design/aptitude_skill_plan.md`) is **skill-tier focused** — it specifies the 5/10/15/20/30 nodes per aptitude but doesn't mention any passives. Magic Resist and Beneficial Effect aren't in the design at all, so reassigning them to DEF and INT (cont. 12) was arbitrary. Cleaner alignment: **remove them entirely**.

### Changes vs cont. 12

- `RegistryPassives.java`: dropped the `MAGIC_RESIST` and `BENEFICIAL_EFFECT` `RegistryObject` declarations. The underlying `RegistryAttributes.MAGIC_RESIST` and `.BENEFICIAL_EFFECT` attributes are still registered (any other mod that wants to read them can), but no Passive scales them per aptitude level.
- Reverted my brief-lived addition of `SPELL_POWER` + `MAX_MANA` MAG passives wired to ISS attributes — those weren't in the design either.
- Removed the matching `HandlerCommonConfig.java` fields (`spellPowerValue`, `maxManaValue`, etc.).
- Reverted the shipped `config/JLFork/justleveling-fork.common.json5` additions.
- Removed the corresponding lang entries.
- Removed the ISS hard-dep in `mods.toml` (no longer needed; passive lookup is gone).

### Net effect on the in-game UI

| Aptitude | Native passives (after fork) |
|---|---|
| STR | attack_damage, attack_knockback |
| CON | max_health, knockback_resistance |
| DEX | movement_speed, projectile_damage |
| DEF | armor, armor_toughness |
| **MAG** | **(none — skill-only)** |
| INT | attack_speed, entity_reach |
| BLD | block_reach, break_speed |
| LCK | luck, critical_damage |

MAG aptitude shows skills only in the UI now; the per-level scaling for spell power and mana comes from KubeJS skill effects (Mana Spark / Conservation / Mana Blaze / Mystic Ward / Mana Inferno) at the threshold tiers.

### Why this is the right call

- Following the design rather than improvising. The plan lists what each aptitude does at each tier; passives that aren't in the design shouldn't appear.
- Less maintenance — fewer config knobs, fewer lang entries, smaller jar.
- Reversible — if playtest reveals MAG feels too thin without per-level scaling, we can add custom MAG passives in a follow-up that updates the design plan first.

Codex `Aptitudes` entry updated to reflect the trim. Mirrored to all 3 distros. Same `justlevelingfork-1.2.1-iridescent.1.jar` filename so allowlists don't need updating.

---

## 2026-04-29 (cont. 12) — Iridescent Aptitudes fork v1 shipped (passive remap + drop-in)

Continuation of cont. 11 (fork foundation). This commit closes the loop — the fork is now built, deployed, and replacing the upstream JustLeveling Fork in all 3 distros.

### Customizations applied

| Phase | What changed |
|---|---|
| **Passive remap** | `MAGIC_RESIST` reassigned from MAG → DEF in `RegistryPassives.java`. `BENEFICIAL_EFFECT` reassigned from MAG → INT. MAG is now skill-only — KubeJS Mana Spark / Conservation / Mana Blaze / Mystic Ward / Mana Inferno handle all magic scaling at level thresholds. |
| **Threshold change** | Already aligned at the config level (`config/JLFork/justleveling-fork.common.json5` ships with 10/20/30 thresholds, plus our KubeJS handlers add the 5/15 tier-skill effects). No fork-side code change needed. |
| **Native skill stripping** | Deferred. The three layered cases (Life Eater life-steal at MAG 20, Wormhole Storage ender chest at MAG 30, Safe Port pearl-no-damage at INT 10) are domain-disjoint with our KubeJS overrides — they're bonus content rather than conflicts. Will revisit if playtest surfaces actual problems. |
| **Update-check stripped** | Removed JustLevelingFork.java's CompletableFuture that pinged `raw.githubusercontent.com/.../VERSION` on every load (would always say "newer version available" since upstream's master HEAD diverges from our fork). |

### Deployment

- Built via `iridescent-aptitudes-mod/build_mod.sh` → `justlevelingfork-1.2.1-iridescent.1.jar` (~474 KB, 285 files)
- Deployed to all 3 distros' `mods/` folders
- Removed upstream `mods/.index/justleveling-fork.pw.toml` in all 3 distros (packwiz no longer manages this slot — pack relies on custom-JAR allowlists)

### Allowlist updates

`justlevelingfork-1.2.1-iridescent.1.jar` added to:
- `server_distribution/update_mods.ps1`
- `server_distribution/update_mods.sh`
- `server_distribution/sync_from_repo.bat`
- `server_distribution/diagnose.ps1`
- `server_distribution/cleanup_stale_jars.ps1`
- `server_distribution/IridescentCraft Dedicated Server/update_mods.ps1`
- `server_distribution/IridescentCraft Dedicated Server/cleanup_stale_jars.ps1`
- `.minecraft/.gitignore` (track `justlevelingfork-*-iridescent.*.jar` in all 3 distros)
- `wiki/CLAUDE.md` (Current custom JARs section)

### Codex entry

New page under Pack Systems → "Aptitudes" (iridescent_codex sortnum 9). 5 pages: overview, eight aptitudes, five-tier skills, fork rationale, NBT compatibility note. Built into `iridescent_codex_data.jar` via `build_codex.sh` and deployed to all 3 distros.

### Net effect for players

- Existing worlds' aptitude levels (NBT at `ForgeData.justlevelingfork.aptitude.*`) survive the swap, no migration needed (modid kept identical)
- MAG aptitude UI no longer shows Magic Resist or Beneficial Effect as native passives — both moved to thematic homes (DEF, INT respectively)
- DEF gets a third passive (Magic Resist), INT gets a third passive (Beneficial Effect)
- Update-check spam in logs gone
- Stripped integrations (gun mods, L2Tabs, BetterCombat) had no effect anyway since the pack didn't ship those mods
- Native JLFork skill UI / Threshold logic unchanged — same names appear in the same slots

### Pending (deferred to follow-up sessions)

Not blocking ship; can iterate:
- Strip native skill effects on Life Eater / Wormhole Storage / Safe Port (only if playtest surfaces actual conflicts with our KubeJS layer)
- Texture file relocation — magic_resist + beneficial_effect icons live in `textures/skill/magic/` even though their aptitudes are now DEF + INT. Cosmetic only; icons load fine.
- Add custom MAG-themed passives (e.g. spell_power scaling per level) if MAG-only-skill-aptitudes feels too thin in playtest

Mirrored to all 3 distros.

---

## 2026-04-29 (cont. 11) — Iridescent Aptitudes fork foundation (multi-session project)

User reported the in-game JLFork aptitude UI doesn't fully reflect our redesign — Magic Resist still shows as a MAG passive even though our redesigned MAG line is offensive (Mana Spark / Conservation / Mana Blaze / Mystic Ward dynamic / Mana Inferno). Investigation showed JLFork hardcodes:

- The 16 passives' aptitude assignments (`RegistryPassives.class` static fields) — not overridable via config or kubejs.
- The native skill effects (Life Eater, Wormhole Storage, Safe Port still fire alongside our re-labeled overrides; players got both Life Eater's life-steal AND our Mystic Ward DR, both labeled "Mystic Ward").

### Decision: full fork

Mixin coremod patches would scale poorly across upstream updates. Forked the source — Apache 2.0 licensed, clean to fork — to take ownership of:
- Passive → aptitude mapping
- Native skill effect bodies
- Level thresholds (5/10/15/20/30 vs upstream 8/16/24)
- Future skill slot expansion

### What landed this session (fork foundation)

- New module `iridescent-aptitudes-mod/` cloned from `Senior-S/JustLeveling-Fork` (master HEAD at fork point)
- NOTICE file added per Apache 2.0 §4(d) attribution requirement (credits SeniorS upstream + Silvaria fork)
- gradle.properties: branding updated — modid kept as `justlevelingfork` (NBT compat per user directive), display name → "Iridescent Aptitudes", version → `1.2.1-iridescent.1`, authors → "SeniorS, Silvaria"
- build.gradle: stripped Modrinth/CurseForge publishing tasks, removed parchment plugin, switched mappings to `official` channel, dropped CurseMaven/external repos in favor of local `libs/` flatDir (matches existing modular-spells-mod pattern)
- Stripped integrations: TacZ, Crayfish Gun Mod, Scorched Guns 2, BetterCombat, PointBlank — pack doesn't ship those mods. Source files removed; JustLevelingFork.java event-bus registrations stripped; build.gradle deps removed.
- Stripped KubeJS plugin subpackage — IridescentCraft's KubeJS scripts read aptitude NBT directly (`ForgeData.justlevelingfork.aptitude.<name>`) without needing JLFork's plugin event bus. KubeJSIntegration.java retained (reflective wrapper, compiles without KubeJS classpath).
- libs/ populated with curios + irons_spellbooks + tetra + mutil from modular-spells-mod's libs/
- `.gitignore` ignores `libs/*.jar` to keep repo lean (jars sourced locally per build_mod.sh pattern)
- `FORK_STATUS.md` documents what's done, what's pending, and the next-session checklist

### What's NOT done yet (queued for follow-up sessions)

| Phase | Why pending |
|---|---|
| Build environment fully wired | Need l2library + l2tabs + yacl jars in libs/ — not in pack mods/ folder; need to download from CurseForge / Modrinth |
| Passive remap (Magic Resist off MAG, etc.) | Requires a clean local build first |
| Strip native skill effects | Same |
| 5/10/15/20/30 thresholds | Same |
| Replace upstream JLFork in mods/ | Final step; gated on the above |
| Allowlist updates + codex entry + changelog details | Final step |

### Why "foundation only" is still meaningful progress

Cloning, branding, NOTICE, integration stripping, and dependency simplification are all done — the next session can focus purely on customization once libs/ has the missing jars. Without this foundation, future sessions would have to redo all the dep-stripping and gradle simplification first. We've also locked in the design decision to KEEP modid `justlevelingfork` (preserves player NBT) and committed Apache 2.0 attribution.

Total source committed: full JLFork tree (sans gun integrations + kubejs subpackage), build.gradle, gradle.properties, NOTICE, FORK_STATUS.md, .gitignore. Roughly ~150 source files.

---

## 2026-04-29 (cont. 10) — Recipe re-tier sweep: enchanting/disenchanter/ISS tools + obsidian audit

User noted several creation tools and core recipes were locked behind T3 materials (mainly diamond and obsidian) when they should have been T1/T2-accessible. Key insight that drove the obsidian sweep: **obsidian requires a diamond pickaxe (T3) to mine**, so any T1/T2 recipe that lists obsidian as an ingredient is unintentionally T3-gated.

### Recipe re-tiers

| Recipe | Old | New | Tier |
|---|---|---|---|
| `minecraft:enchanting_table` | 1× ender_forged_diamond + 4× obsidian (T3) | 1× gold_block + 4× deepslate | **T1** |
| `disenchanting:disenchanter` | 2× gold_ingot + anvil + enchanting_table + 3× obsidian | unchanged + obsidian → deepslate | **T1** |
| `irons_spellbooks:arcane_anvil` | diamond + amethyst + polished_deepslate + anvil | mana_diamond + others unchanged | **T2** |
| `irons_spellbooks:mana_ring` | diamond + 5× arcane_ingot | mana_diamond + arcane_ingot | **T2** |
| `ars_nouveau:apprentice_spell_book_upgrade` (cont. 6 follow-up) | obsidian still in ingredients | obsidian → deepslate | **T2** |
| `icraft:class_altar` (T2 lich_soul path) | 3× obsidian bottom row | 3× deepslate | **T2** |

Enchanting table choice: **gold_block** as the diamond substitute is messy thematically (gold isn't classically arcane) but it puts basic enchanting on the right side of the diamond gate, which matters more than aesthetic purity.

### Loot table addition

`irons_spellbooks:mana_ring` now has a 2% drop chance in overworld structure chests (dungeons, mineshafts, temples, mod structures — not village houses). Same chest pool as the compass of return. Caster players who haven't unlocked Botania transmutation can find one as a lucky drop while exploring.

### Other obsidian uses (verified, no change needed)

- `forbidden_arcanus:hephaestus_forge` (T3) — keeps obsidian, players have access
- `apotheosis:reforging_table` (T3), `apotheosis:augmenting_table` (T4) — same
- `icraft:class_altar` T3 (harbinger_eye) and T4 (dragon_heart) paths — keep obsidian
- `mythic_forge.js` endgame recipes — keep obsidian / crying_obsidian
- Loot tables that *drop* obsidian — fine, those don't need to be mined

### Disenchanter design note

User explicitly chose T1 for the disenchanter so it pairs with the now-T1 enchanting table — basic enchant manipulation should be available alongside basic enchanting. Mana Ring took the chest-loot slot instead, since it's actually the more "rare arcane find" item conceptually.

Mirrored to all 3 distros.

---

## 2026-04-29 (cont. 9) — iridescent_durability_clamp coremod: bulletproof inert protection

Follow-up to cont. 8. The buffer + proactive hurt-clamp made armor much safer, but for tools/weapons (and any non-armor durability path) we still relied on the 2-tick poll which has an inherent race window.

After auditing how Tetra prevents destruction on its modular tools/weapons, the answer was a clean one-line clamp inside `IModularItem.damageItemImpl`:

```java
return Math.min(maxDamage - currentDamage - 1, amount);
```

That clamp is synchronous and race-free — no matter how big the incoming durability damage, the resulting damage value is bounded to `maxDamage - 1`. Tetra calls `stack.hurtAndBreak(clampedAmount, ...)` with the pre-clamped value, so vanilla never destroys the item. Tetra only uses this for its own modular items though; vanilla / non-Tetra items go through `ItemStack.hurtAndBreak` directly with no equivalent protection.

### Solution: small Forge mixin coremod

New `iridescent-durability-clamp/` module at the repo root, builds to `iridescent_durability_clamp-0.1.0.jar`. Single mixin into `ItemStack.hurtAndBreak`:

```java
@ModifyVariable(method = "hurtAndBreak(...)", at = @At("HEAD"), argsOnly = true, ordinal = 0)
private int iridescent$clampDurabilityDamage(int amount) {
    ItemStack self = (ItemStack)(Object)this;
    if (!self.isDamageableItem() || amount <= 0) return amount;
    int headroom = self.getMaxDamage() - self.getDamageValue() - 1;
    if (headroom <= 0) return 0;
    return Math.min(amount, headroom);
}
```

This is Tetra's exact pattern, applied to every item via the generic vanilla durability path. Items now stop at exactly `maxDamage - 1` ("1 durability remaining") instead of ever being destroyed, **regardless of incoming damage size or item type**. The race window from cont. 8 is closed because the clamp runs inside the same synchronous call vanilla uses to apply durability damage.

### Coexistence with existing systems

- **Tetra modular tools/weapons:** Tetra's own `damageItemImpl` clamps `amount` first, then calls `stack.hurtAndBreak(clampedAmount, ...)`. Our mixin then re-clamps. `Math.min` of two clamps is idempotent, so Tetra's behavior is unchanged. The `NATIVE_BREAK_PROTECTION_NS = ['tetra:']` skip in `death_penalty.js` is now redundant for break prevention (the mixin handles both); kept anyway to avoid double-tagging Tetra items with our `icraft_broken` NBT (Tetra has its own broken-state UI which we shouldn't fight with).
- **Inert state effects** (zero attack damage, mining cancellation, right-click block): still driven by the existing `icraft_broken` NBT tag, which the 2-tick poll + 10-tick sweep apply at the inert threshold. Items reach `maxDamage - 100` (the threshold), get tagged broken, then at `maxDamage - 1` the mixin caps them. Effects work identically to before.
- **Death penalty durability loss:** unchanged. The death-event clamp at `maxDamage - 100` still runs first; the mixin only kicks in if something tries to push past `maxDamage - 1` later.
- **Proactive armor hurt-clamp from cont. 8:** still active. Belt-and-suspenders — the mixin makes it redundant for vanilla-path items but it costs almost nothing and protects against any code path we might have missed.

### Build infrastructure

- New module: `iridescent-durability-clamp/`
- Standard ForgeGradle 6 + Mixin annotation processor 0.8.5
- Build script: `build_mod.sh` (mirrors the modular-spells / biomes build pattern)
- Jar manifest declares `MixinConfigs: iridescent_durability_clamp.mixins.json` so Forge auto-loads the mixin config at startup
- 12-file output jar, ~3.9 KB total

### Allowlist updates

`iridescent_durability_clamp-0.1.0.jar` added to:

- `server_distribution/update_mods.ps1`
- `server_distribution/update_mods.sh`
- `server_distribution/sync_from_repo.bat`
- `server_distribution/diagnose.ps1`
- `server_distribution/cleanup_stale_jars.ps1`
- `server_distribution/IridescentCraft Dedicated Server/update_mods.ps1`
- `server_distribution/IridescentCraft Dedicated Server/cleanup_stale_jars.ps1`
- `wiki/CLAUDE.md` (Current custom JARs section)

### JVM flags

Unlike the bytecode-patched Patchouli / Ars Nouveau jars, this mixin doesn't create dead code paths — `-noverify` is **not** required for it. (It's already set in the pack for the other two patched jars, so this is informational only.)

### Verification

- `unzip -l` confirms 12 files, including the mixin .class, the .mixins.json, and the refmap.json (with correct SRG name `m_41622_` for `hurtAndBreak`)
- Built cleanly first try; ForgeGradle deobfuscation + Mixin AP both fired without errors
- Deployed to all 3 distros (matching md5 confirmed by build script)

### What this closes out

- The "armor breaking instead of going inert" tester report. With the mixin, no item that goes through the vanilla durability path can ever be destroyed by durability damage — they all stop at 1 durability remaining and stay in inventory.
- Tetra modular tools/weapons remain protected by their own pattern, now mirrored.
- Future modded gear that uses the standard `ItemStack.hurtAndBreak` path inherits the protection automatically.

Mirrored to all 3 distros.

---

## 2026-04-29 (cont. 8) — Armor breaking instead of going inert: buffer + proactive clamp

Tester reported armor pieces still shattering despite the death-penalty.js "items never break" system. Root cause: the inert clamp was a poll-based safety net at `maxDamage - 20` durability, but vanilla's `ItemStack.hurtAndBreak()` runs **synchronously inside `LivingEntity.hurt()`**. A single boss hit dealing 25+ durability damage to a piece (Apotheosis affixes, Cataclysm bursts, Mahou Tsukai effects) jumped from "safe" past `maxDamage` in one frame — our 2-tick poll arrived after the item was already destroyed.

### Fix 1: bigger buffer

`INERT_THRESHOLD: 20 → 100`. Items now go inert at `maxDamage - 100` (or half maxDur for short-life items). The death-penalty's per-death durability clamp uses the same value (consolidated). Players can still use most of an item's durability before it goes inert; the larger buffer absorbs reasonable single-hit bursts.

### Fix 2: proactive synchronous clamp in EntityEvents.hurt

Added a hurt-event hook that pre-clamps player armor BEFORE vanilla's `hurtArmor` runs. KubeJS `EntityEvents.hurt` fires at the `ForgeEventFactory.onLivingHurt` event point, which is BEFORE vanilla calls `entity.hurtArmor(amount)` (where the per-piece `hurtAndBreak` runs). So if we predict the about-to-happen durability loss using vanilla's formula `max(1, floor(damage / 4))` per piece, and clamp any piece that would cross the inert zone, the upcoming vanilla durability subtraction lands in safe territory rather than triggering a synchronous break.

Combined effect: even a single 200-damage boss hit (~50 durability per piece) is caught by the proactive clamp regardless of where the piece's current durability sits, before vanilla can destroy it.

### Caveats

- The proactive hurt clamp only iterates `ARMOR_SLOTS` since vanilla's `hurtArmor` only damages armor on player hit. Tools and weapons rely on the existing 2-tick poll + 10-tick full-inventory sweep — durability per swing/use is small (1 per use typically), so the 100-buffer should be plenty. **Needs playtest verification** that Tetra modular tools/weapons stay protected (Tetra has no armor; the `NATIVE_BREAK_PROTECTION_NS` skip applies only to modular tools and weapons, where Tetra's own durability-protection state takes over).
- Modded mobs that bypass `hurtArmor` and damage armor through some other path (rare) may slip through the proactive clamp. Catch-all is the existing 2-tick poll with the new 100-buffer.

Mirrored to all 3 distros.

---

## 2026-04-29 (cont. 7) — Apotheosis errored gem fix + EnchDesc tooltips for icraft enchants

### Errored gem fix (root cause)

Tester reported `item.apotheosis.gem` showing as the literal lang key in chests in apotheosis tower (gem tower). Root cause: 9 of our override loot tables in `icraft_loot_overrides` and `icraft_progdiff_overrides` spawned raw `apotheosis:gem` items with malformed NBT — Apotheosis 7.x's `GemItem` class has a literal "Errored gem with no bonus!" branch when NBT can't resolve to a registered gem variant.

Two broken patterns in our overrides:
- `{gem_variant:"random"}` — invalid NBT key (the field doesn't exist in 7.x)
- `{gem:"apotheosis:random"}` — valid key but `apotheosis:random` isn't a real gem registry entry

Apotheosis ships a global loot modifier (`apotheosis:gems`) that auto-injects properly-formatted gems into any chest loot table. Our hand-rolled entries were both unnecessary AND broken — removing them returns gem injection to the GLM where it belongs.

**Affected files** (broken entries removed):

| File | Pattern |
|---|---|
| `icraft_loot_overrides/data/apotheosis/loot_tables/chests/chest_valuable.json` | gem_variant |
| `icraft_loot_overrides/data/apotheosis/loot_tables/chests/spawner_brutal.json` | gem_variant |
| `icraft_loot_overrides/data/apotheosis/loot_tables/chests/spawner_brutal_rotate.json` | gem_variant |
| `icraft_loot_overrides/data/apotheosis/loot_tables/chests/spawner_swarm.json` | gem_variant |
| `icraft_loot_overrides/data/apotheosis/loot_tables/chests/tome_tower.json` | gem_variant |
| `icraft_loot_overrides/data/apotheosis/loot_tables/book.json` | gem_variant |
| `icraft_loot_overrides/data/apotheosis/loot_tables/entity/treasure_goblin.json` | gem_variant |
| `icraft_progdiff_overrides/data/majruszsdifficulty/loot_tables/gameplay/treasure_bag_warden.json` | apotheosis:random |
| `icraft_progdiff_overrides/data/majruszsdifficulty/loot_tables/gameplay/treasure_bag_undead_army.json` | apotheosis:random |

Players will still get gems from those chests / treasure bags (chest tables via the GLM; treasure bags lose the gem entry since the GLM doesn't apply to majruszs treasure bags — but those bags have many other rolls, so the loss is minimal). Either way, no more errored gems with literal `item.apotheosis.gem` display.

Rebuilt `config/paxi/datapacks/icraft_loot_overrides.zip` and `icraft_progdiff_overrides.zip` from the corrected sources. Mirrored to all 3 distros.

### EnchDesc tooltips for all 29 icraft custom enchantments

EnchantmentDescriptions mod was installed and reading `enchantment.<modid>.<name>.desc` lang keys, but none of our 29 custom icraft enchants had a description — they showed with title only on shift-hold. Added one-line descriptions sourced from each enchant's actual implementation in `enchant_effects.js` and `dimension_mechanics.js`:

| Category | Enchants |
|---|---|
| Damage resist (armor) | Heatward, Voidward, Depth Strider (custom), Aether Acclimation, Warp Shield, Boss Ward, Adaptive, Phalanx, Last Stand, RF Capacitance |
| Passive armor | Vitality, Magnetism, Steadfast |
| Damage dealt (weapon) | Titan Slayer, Adrenaline, Crowd Control, Nemesis, Momentum, Primal Force, Mana Temper |
| Tools | Prospector, Lumberjack, Quick Draw |
| Magic | Convergence |
| Planetary (Ad Astra) | Lunar Stride, Thermal Regulation, Pressure Shell, Void Adaptation, Stellar Shield |

Mirrored to all 3 distros.

---

## 2026-04-29 (cont. 6) — Ars apprentice spell book recipe re-tiered to T2

The vanilla Ars Nouveau `apprentice_spell_book_upgrade` recipe required 3× diamond + 2× blaze rod + 2× quartz block + 1× obsidian + novice book — all T3 materials. But master-appendix §A.2 lists the Apprentice spell book itself as a T2 workstation entry-point. The recipe gating contradicted the item's tier: a T2 player who'd reached the Twilight/Aether/Blue-Skies dimensional access stage couldn't actually craft their unlocked T2 spellbook because the recipe required Nether materials (T3).

### Fix

Override added to `kubejs/server_scripts/recipes/tier_gated_recipes.js` (Section I.7). Removes the vanilla recipe, registers a re-tiered `ars_nouveau:book_upgrade` recipe:

| Original | Replaced with | Tier |
|---|---|:-:|
| 3× minecraft:diamond | 3× botania:mana_diamond | T2 (Botania transmutation product, A.2) |
| 2× minecraft:blaze_rod | 2× ars_nouveau:source_gem_block | T2 (Ars-themed; 1 block = 9 source gems) |
| 2× minecraft:quartz_block | 2× ars_nouveau:source_gem | T2 |
| 1× minecraft:obsidian | unchanged | T1/T2 |
| 1× ars_nouveau:novice_spell_book | unchanged | T1 prereq |

Total cost remains substantive (1 obsidian + 3 mana diamonds + 18 source gems via 2 blocks + 2 source gems = themed Ars + Botania T2 investment). No longer requires a Nether trip.

Mirrored to all 3 distros.

---

## 2026-04-29 (cont. 5) — Idle hunger pause: no drain after 2 min of inaction

The pack stacks four hunger-tax mechanics — Hungeroverhaul ambient drain, Sleep Hunger (cont. 31, costs 6 per sleep), respawn reset to 6 (cont. 32), and the Liteminer hunger gate (cont. 33). All four are intentional design tax for active play, but they shouldn't apply when the player is genuinely AFK (walked away from keyboard). Hunger draining to zero while the player isn't even playing is anti-fun.

New `kubejs/server_scripts/idle_hunger_pause.js`:
- Polls each player's position and look angles every 20 ticks (1s)
- If both are unchanged for 2400 ticks (2 minutes), the player is considered idle
- On entering idle: snapshot `foodLevel` + `saturationLevel`
- While idle: restore the snapshot each poll cycle if either dropped — any drain that ticks gets reverted before the player notices
- On any movement or camera turn: clear idle state and reset the timestamp
- Skipped in creative / spectator (no drain to begin with)
- Per-player state cleared on `loggedOut`

Heuristic chosen: position OR look angle change counts as "active". Inventory / clicks aren't tracked separately — those almost always coincide with movement or camera changes anyway. Position epsilon = 0.01 blocks; rotation epsilon = 0.5° to filter out floating-point noise without triggering on real input.

The fix is layered on top of the existing hunger systems — it doesn't replace them, just stops the drain when the player is verifiably idle. Active sprinting / mining / fighting still costs hunger normally.

Mirrored to all 3 distros.

---

## 2026-04-29 (cont. 4) — Puffish Skills warfare category: namespace fix (life_steal + crit_damage)

Follow-up to the Batch 3 audit that surfaced the Apothic Attributes namespace issue. The Deadeye fix in Batch 3 corrected one occurrence in the aptitude script; this commit fixes the same root cause across the rest of the codebase.

### Fixed (functional — 7 attribute references)

`kubejs/data/icraft/puffish_skills/categories/warfare/category.json` had 7 nodes referencing `apothic_attributes:life_steal` (4×) and `apothic_attributes:crit_damage` (3×). Apothic Attributes' actual mod ID is `attributeslib`, so those nodes silently no-op'd — players who spent skill points on them got zero effect. Bulk-replaced to `attributeslib:`. Mirrored to `server_distribution/`, `distribution/client/`, and the build source at `datapack_sources/icraft_skills/`.

### Fixed (doc consistency — 6 codex entries)

The Iridescent Codex Patchouli book also referenced `apothic_attributes:` in its skill-tree display text (Marksman, Gathering, Fortitude trees). Updated all 6 source files (assets/ + data/ mirror dirs in `datapack_sources/iridescent_codex/`) and rebuilt the codex jar via `build_codex.sh`. Players reading the in-game guidebook will now see the correct attribute name.

### Net effect for players

- Warfare tree life_steal / crit_damage nodes now actually grant their stats on level-up. Existing skill point investments in those nodes will start applying immediately on next world load.
- Codex book skill-tree pages display the correct mod-internal attribute name.

### Side note

The pattern (`apothic_attributes:` instead of `attributeslib:`) probably crept in because the mod's display name on CurseForge / Modrinth is "Apothic Attributes" — natural to assume that's the modId. Future config work should reference `attributeslib:` explicitly.

Mirrored to all 3 distros. Known-issues tracker entry from cont. 3 marked resolved.

---

## 2026-04-29 (cont. 3) — Aptitude Batch 3: 6 cross-mod skills + Deadeye attribute fix

Final implementation pass on `IridescentCraft-internal/design/aptitude_skill_plan.md`. Closes out the 28-slot expansion — every Tier 5/10/15/20/30 node across all 8 aptitudes now has a working effect.

### New skills (`kubejs/server_scripts/skills/justleveling_skills.js`)

| Aptitude | Lvl | Skill | Effect | Hook |
|---|:-:|---|---|---|
| MAG | 10 | **Conservation of Magic** | +15% mana regen on both magic systems (approximation of "15% reduced cost") | Tick attribute on `irons_spellbooks:mana_regen` and `ars_nouveau:ars_nouveau.perk.mana_regen` mul_base 0.15 |
| INT | 10 | **Arcane Efficiency** | 25% XP refund when spending near enchanting table | Tick poll of `player.xp` (5-tick cadence); on negative diff, scan 9×5×9 around player for `minecraft:enchanting_table` and refund 25% via `addXP` |
| INT | 20 | **Materials Science** | 25% XP refund when spending near anvil | Same poll handler; scans for `minecraft:anvil` / `chipped_anvil` / `damaged_anvil` |
| DEX | 20 | **Rapid Fire** | +15% bow draw speed | Tick attribute on `attributeslib:draw_speed` mul_base 0.15 |
| BLD | 20 | **Resourceful** | 8% chance to refund a crafting material on craft | `PlayerEvents.inventoryChanged` heuristic — matches against a crafted-pattern whitelist + 2s per-player cooldown; refunds a contextual material based on the result item's id (iron→iron_ingot, diamond→diamond, etc.) |
| BLD | 30 | **Master Craftsman** | +12% craft refund (independent roll on top of Resourceful → ~19% trigger, max 2 items) | Same `inventoryChanged` hook; second RNG roll when BLD ≥ 30 |

### Bug fix (Batch 1 regression)

- **Deadeye (DEX 15)** was using attribute id `apothic_attributes:projectile_damage` which doesn't exist. Apothic Attributes' actual mod ID is `attributeslib`, and the closest matching attribute is `arrow_damage` (not `projectile_damage`). Fixed to `attributeslib:arrow_damage`. Confirmed by inspecting the jar's `ALObjects$Attributes` registry — full attribute list under `attributeslib:` is `creative_flight, elytra_flight, prot_shred, prot_pierce, overheal, mining_speed, life_steal, healing_received, ghost_health, fire_damage, experience_gained, draw_speed, dodge_chance, current_hp_damage, crit_damage, crit_chance, cold_damage, arrow_velocity, arrow_damage, armor_shred, armor_pierce`.

### Implementation notes & known caveats

- **Conservation of Magic** is an *approximation*. Plan recommended option (b) (boost mana regen instead of reducing cost) because no standard "spell cost" attribute exists in either ISS or Ars Nouveau; cost is computed inside each mod's spell-cast pipeline. Boosting regen by 15% gives a similar economic effect over a session — player can sustain more casts before running dry — without needing a Java mixin into either mod's casting code. Document and revisit if the economy feels noticeably different from the design intent.
- **Arcane Efficiency / Materials Science** rely on the existing `tick_xpMultiplier` polling pattern (KubeJS 6.x doesn't expose `PlayerEvents.xpChange`). New 5-tick poll handler `tick_aptitudeXpRefund` watches negative diffs in `player.xp`. Uses a separate persistentData key (`icraft_apt_xp_last`) to stay decoupled from the existing xp-mult tracker. Scans a 9×5×9 box around the player for the relevant block on each detected spend (only when a spend actually fires, not every tick — keeps scan cost down). Both Arcane Efficiency and Materials Science can fire simultaneously if the player happens to be near both an enchant table and an anvil during a spend (rare; combined would refund 50%).
- **Resourceful / Master Craftsman**: detection is heuristic (item id pattern match on `inventoryChanged`), not a real crafting event — KubeJS 6.x doesn't expose a clean recipe-completion event. Same caveat as the existing `skill_effects.js` Material Save handler. Items that look like crafted goods but came from loot/trade also trigger rolls; cooldown of 2s per player limits the noise. Refund quantities are intentionally small (1 ingredient at a time).
- **Rapid Fire** uses the correct `attributeslib:` namespace (matching the Deadeye fix above).

### Lang updates (`kubejs/assets/justlevelingfork/lang/en_us.json`)

- `stealth_mastery` (Rapid Fire), `convergence` (Master Craftsman), `treasure_hunter` (Resourceful), `safe_port` (Arcane Efficiency) — all four had `[WIP]` suffix dropped, and descriptions updated to reflect actual implementation.

### Status — 28 / 28 aptitude slots filled

All 5 nodes per aptitude × 8 aptitudes now have a working effect. The 5-tier expansion design from `aptitude_skill_plan.md` is complete.

| Aptitude | 5 | 10 | 15 | 20 | 30 |
|---|---|---|---|---|---|
| STR | Might | Brutal Slash | Cleave | Hemorrhage | True Strength |
| CON | Tough Hide | Hearty Meals | Steady Breath | Overflow | Iron Stomach |
| DEX | Light Step | Fleet of Foot | Deadeye | Rapid Fire | Excitement |
| DEF | Padded Frame | Second Wind | Bulwark | Turtle Shield | Lion Heart |
| MAG | Mana Spark | Conservation of Magic | Mana Blaze | Mystic Ward | Mana Inferno |
| INT | Curious | Arcane Efficiency | Insight | Materials Science | Enlightenment |
| BLD | Steady Hand | Quarryman | Thrifty Hands | Resourceful | Master Craftsman |
| LCK | Lucky Charm | Lucky Strike* | Fortune's Favor* | Treasure Sense | Motherlode |

*JLFork-native — verified to auto-fire in playtest pending.

### Pre-existing bug surfaced during Batch 3 audit

The `kubejs/data/icraft/puffish_skills/categories/warfare/category.json` config references attributes under `apothic_attributes:` namespace (`life_steal`, `crit_damage`) which is also wrong — should be `attributeslib:`. **Not fixed in this commit** — out of scope for the aptitude work, but flagged here for the next puffish skills polish pass. Players may have been getting silent no-ops on those Warfare nodes.

Mirrored to all 3 distros.

---

## 2026-04-29 (cont. 2) — Aptitude Batch 2: 7 event-driven skills shipped

Second implementation pass on `IridescentCraft-internal/design/aptitude_skill_plan.md`. Fills out STR 10/15, CON 15, MAG 20 (rebalanced), BLD 15, LCK 20/30 — all the medium-complexity event-driven skills.

### New skills (`kubejs/server_scripts/skills/justleveling_skills.js`)

| Aptitude | Lvl | Skill | Effect | Hook |
|---|:-:|---|---|---|
| STR | 10 | **Brutal Slash** | +10% melee damage; ~10% armor pen approximation (capped at +5% damage at high target armor) | Tick attribute on `generic.attack_damage` mul_base 0.10 + EntityHurt-deal damage scaler reading target armor |
| STR | 15 | **Cleave** | First swing of combat does +20%; 5s window resets after no in/out hits | EntityHurt-deal `event.damage *= 1.20` when `now - lastCombatTick > 100`; tracker stamped on hits both dealt and taken |
| CON | 15 | **Steady Breath** | Water Breathing while submerged + Saturation drip (passive hunger drain mitigation) | Tick handler: `potionEffects.add('water_breathing', 30, 0)` while `isUnderWater()` + `potionEffects.add('saturation', 30, 0)` always on |
| MAG | 20 | **Mystic Ward** (rebuilt) | DR formula `min(0.20, 0.05 + 0.01 * floor(bonusSpellPower / 0.20))` — 5% baseline scaling toward 20% cap at +300% spell power | EntityHurt-take reads `puffish_attributes:magic_damage` total, subtracts base 1.0, applies `event.damage *= (1 - dr)` |
| BLD | 15 | **Thrifty Hands** | 5% chance to refund placed block (block stays placed; item returned to inventory) | `BlockEvents.placed` → `give <user> <blockId> 1` on RNG hit |
| LCK | 20 | **Treasure Sense** | 5% chance for double-roll mob loot on kill | `EntityEvents.death` → `loot spawn <pos> loot <modid>:entities/<path>` |
| LCK | 30 | **Motherlode** (rebalanced) | 0.5% chance for 5x mining drops (bumped from 0.01% per plan) | `BlockEvents.broken` → 4× `loot spawn <pos> loot <modid>:blocks/<path>` |

### Implementation notes & known caveats

- **Cleave's combat tracker** is shared across STR 15 (deal-damage) and the take-damage handler — any hit in or out resets the 5s "first-swing" window. Cleared on `PlayerEvents.loggedIn` along with the rest of the per-player state.
- **Brutal Slash armor pen** is an approximation, not true armor-ignore. Vanilla MC computes armor reduction inside `LivingEntity.actuallyHurt()` which we can't easily intercept from KubeJS without a Java mixin. The current formula multiplies outgoing damage by `1 + min(0.05, target_armor × 0.004)` — at 20 armor the bonus is +5% damage, which roughly matches what "ignoring 10% of 20 armor" (= 2 effective armor → ~8% less DR) would produce. Document and revisit if it feels too weak in playtest.
- **Steady Breath** uses cyclic 30-tick effect refreshes on a 100-tick handler (effect lasts 1.5s out of every 5s window). Underwater drain is reduced ~30% on average (30/100 ticks of full Water Breathing). Hunger drain reduction is approximate via passive Saturation 0 — the effect only kicks in for the 1.5s/5s the buff is active, slowing exhaustion accumulation by ~30% during that window.
- **Mystic Ward** reads spell power via `player.getAttributeValue('puffish_attributes:magic_damage')`. Puffish's base for magic_damage is 1.0; bonus is total minus base. At +50% spell power (Mana Spark + Blaze) the player has bonus = 0.50, dr = `0.05 + 0.01 × floor(0.50 / 0.20)` = `0.05 + 0.02` = 7%. At +110% (full MAG line at MAG 30) dr = 10%. At +300% (multiple stacking sources from gear/perks) dr hits the 20% cap.
- **Treasure Sense / Motherlode** rely on the convention that block/entity loot tables live at `<modid>:blocks/<path>` and `<modid>:entities/<path>`. Vanilla and most major mods follow this; mods that don't (or blocks with no loot table at all) silently no-op — the player just doesn't get the bonus. Revisit if observed misses pile up.
- All Batch 2 skills inherit the existing creative/spectator skip and per-player aptitude cache (re-read every 100 ticks).

### Lang updates (`kubejs/assets/justlevelingfork/lang/en_us.json`)

- `life_eater` → "Mystic Ward" (dropped `[WIP]`); description updated to dynamic formula
- `limit_breaker` → "Motherlode" (dropped `[WIP]`); description updated from 0.01% to 0.5% rate

### Status after Batch 2

- 22 / 28 new skill slots shipped (15 from Batch 1 + 7 from Batch 2)
- 6 remaining in Batch 3 (Conservation of Magic, Arcane Efficiency, Materials Science, Resourceful, Master Craftsman, Rapid Fire)

Mirrored to all 3 distros.

---

## 2026-04-29 — Aptitude Batch 1: 15 attribute-only skills shipped (5-tier expansion)

First implementation batch from `IridescentCraft-internal/design/aptitude_skill_plan.md`. Fills the previously-empty Tier 5 and Tier 15 slots across all 8 aptitudes, plus reshuffles the MAG capstone line and rebalances Enlightenment.

### New skills (15 — all attribute-modifier-based, applied via `kubejs/server_scripts/skills/justleveling_skills.js`)

| Aptitude | Lvl | Skill | Effect | Attribute |
|---|:-:|---|---|---|
| STR | 5 | **Might** | +1.5 attack damage, +5% max HP | `generic.attack_damage` add 1.5 + `generic.max_health` mul_base 0.05 |
| CON | 5 | **Tough Hide** | +2 max HP flat | `generic.max_health` add 2 |
| DEX | 5 | **Light Step** | +5% movement speed | `generic.movement_speed` mul_base 0.05 |
| DEF | 5 | **Padded Frame** | +1 armor, +1 toughness | `generic.armor` add 1 + `generic.armor_toughness` add 1 |
| MAG | 5 | **Mana Spark** | +20 max mana, +5% spell power | ISS+Ars max_mana add 20 + spell_power mul_base 0.05 (puffish/ISS/Ars) |
| INT | 5 | **Curious** | +10% XP gain | `puffish_attributes:experience` mul_base 0.10 |
| BLD | 5 | **Steady Hand** | +0.5 block reach | `forge:block_reach` add 0.5 |
| LCK | 5 | **Lucky Charm** | +1 luck | `generic.luck` add 1 |
| BLD | 10 | **Quarryman** | +5% block break speed | `minecraft:player.block_break_speed` mul_base 0.05 |
| DEX | 15 | **Deadeye** | +10% projectile damage | `apothic_attributes:projectile_damage` mul_base 0.10 |
| DEF | 15 | **Bulwark** | +25% knockback resistance | `generic.knockback_resistance` add 0.25 |
| MAG | 15 | **Mana Blaze** | +15% spell power | spell_power mul_base 0.15 (puffish/ISS/Ars) |
| INT | 15 | **Insight** | +20% XP gain | `puffish_attributes:experience` mul_base 0.20 |
| MAG | 30 | **Mana Inferno** (capstone) | +30% spell power | spell_power mul_base 0.30 (puffish/ISS/Ars) |
| INT | 30 | **Enlightenment** (rebalanced) | +30% XP gain (was +50%) | `puffish_attributes:experience` mul_base 0.30 |

INT XP line stacks additively to **+60% at full investment** (Curious 10 + Insight 20 + Enlightenment 30) — cleaner than the +110% the original draft would have produced.

### Removals / repurposing

- **Spell Attune (MAG 20, +25% spell power)** → removed. Slot reserved for the dynamic Mystic Ward formula in Batch 2 (DR scales with spell power, capped at 20%). The new Mana Spark/Blaze/Inferno line at MAG 5/15/30 gives **+50% total spell power** (vs old +25%) — a net buff, just spread across more tiers.
- **Mystic Ward (MAG 30, flat 15% DR)** → removed. The dynamic Mystic Ward formula moves down to MAG 20 (Batch 2). MAG 30 capstone is now Mana Inferno.
- **Enlightenment** dropped from +50% to +30% — matches the additive INT XP line philosophy.

### Lang updates (`kubejs/assets/justlevelingfork/lang/en_us.json`)

- `wormhole_storage` (was "Mystic Ward") → "Mana Inferno", new description
- `life_eater` (was "Spell Attunement") → "Mystic Ward [WIP]" placeholder for Batch 2

### Code structure

All Batch 1 skills follow the existing `class_passives`-style pattern: read aptitude level via `getCachedAptitudes()` (re-read every 100 ticks), apply `player.modifyAttribute(...)` with stable modifier IDs (`icraft_<skill_key>`), set value to 0 when threshold not met (handles respec). Spell-power skills apply to **all three** spell-damage attributes (`puffish_attributes:magic_damage`, `irons_spellbooks:spell_power`, `ars_nouveau:ars_nouveau.perk.spell_damage`) per the existing class_passives convention — different mods only read their own attribute.

Mirrored to all 3 distros.

### Reserved for future batches

- **Batch 2 (event-driven, ~6h):** STR 10 Brutal Slash, STR 15 Cleave, CON 15 Steady Breath, MAG 20 dynamic Mystic Ward, BLD 15 Thrifty Hands, LCK 20 Treasure Sense, LCK 30 Motherlode (LootJS bump from 0.01% to 0.5%)
- **Batch 3 (cross-mod / fragile hooks, ~6h):** MAG 10 Conservation of Magic, INT 10 Arcane Efficiency, INT 20 Materials Science, BLD 20 Resourceful, BLD 30 Master Craftsman, DEX 20 Rapid Fire (Apothic Attributes draw_speed)

Design plan: `IridescentCraft-internal/design/aptitude_skill_plan.md`.

---

## 2026-04-28 (cont. 33) — Liteminer hunger gate: vein chains cancel below 6/20 hunger

We do have a vein-miner — `liteminer-forge-1.20.1-1.0.0` — I missed it on the first grep. Built-in `food_exhaustion = 0.2` per block is a soft tax (~3 hunger over a full 64-block chain). User wanted a hard gate.

`kubejs/server_scripts/liteminer_hunger_gate.js`:
- `BlockEvents.broken` handler tracks per-player `lastBreakTick`
- Breaks within 8 ticks (0.4s) of the previous one are treated as **chain continuations** (Liteminer fires breaks in quick succession; manual mining is far slower)
- If `foodLevel < 6` during a chain, the next break is cancelled (`event.cancel()`) — chain stops
- Player notified once per 5s with "Too hungry to veinmine. Eat first."
- Skipped in creative/spectator
- First break of any chain is never cancelled (lets manual mining and chain-start work normally), gate kicks in once chain is established

Threshold rationale: 6/20 matches Sleep Hunger's `Hunger Needed For Sleep: 4` floor + a small buffer. "If you can't sleep, you can't vein." Maintains consistency across the pack's hunger-tax mechanics (cont. 31 sleep tax, cont. 32 respawn reset).

Built-in Liteminer `food_exhaustion: 0.2` left at default — the gate is the main constraint, exhaustion is supplementary. If the gate proves too easy to dodge (eat → chain 64 → repeat), bump exhaustion to 0.5 or 1.0.

Mirrored to all 3 distros.

---

## 2026-04-28 (cont. 32) — Respawn hunger reset to 6 / saturation 0

Vanilla Minecraft restores hunger to 20 (full) on respawn — clashes with the pack's hunger-tax tone (Sleep Hunger costs 6 per sleep from cont. 31, SoLCE food-variety incentive, Hungeroverhaul exhaustion penalties).

New `kubejs/server_scripts/respawn_hunger.js` listens to `PlayerEvents.respawned` and sets `foodLevel = 6` (3 drumsticks) + `saturation = 0` on respawn for survival/adventure mode players. Creative/spectator skipped. Forces an early eat post-death without softlocking — players get a brief sprint-and-regen window before the hunger drain catches up, but they can't just suicide-respawn to top off.

Threshold interactions:
- Above SoLCE `minimumFoodValue: 2` ✓ (food-variety still progresses)
- Above Sleep Hunger gate of 4 ✓ (can sleep immediately if needed, but tight)
- Below Hungeroverhaul "Hungry threshold" of 10 (status effect kicks in fast)
- Above Hungeroverhaul "Faint threshold" of 2 (no faint risk on spawn)

Mirrored to all 3 distros.

---

## 2026-04-28 (cont. 31) — Sleep Hunger activated: heavy hunger / light saturation tax

`Sleep Hunger` was installed but inert (`Hunger Cost: 0`, `Saturation Cost: 0`). Activated per user directive — sleeping should be a meaningful food expense to pair with the food-variety milestone progression and the hunger-mechanics tone of the pack.

```json
{
  "Saturation Cost": 4,        // light — small saturation tax
  "Hunger Cost": 6,            // heavy — 3 drumsticks gone per sleep
  "Hunger Needed For Sleep": 4, // unchanged: must have 2+ drumsticks to lie down
  "Mercy Food": 1,
  "Mercy Food Threshold": 0
}
```

Pre-sleep meal now strongly recommended. A player with full hunger (20) sleeps once → drops to 14 (just under 80%), which is fine. Two sleeps without eating → 8, getting tight. Three sleeps without eating → 2, you can no longer sleep (gate at 4). Forces players to plan food around long sleeps.

Mirrored to all 3 distros: `config/`, `server_distribution/config/`, `distribution/client/config/`.

---

## 2026-04-28 (cont. 30) — Curios:spellbook tag fix + Vanilla Cookbook added + lang audit clean

Three changes bundled.

**Curios:spellbook tag fix.** The new single `iridescent_modular_spells:modular_spell_book` wasn't equippable in the Curios spellbook slot — vanilla ISS books are in the `curios:spellbook` tag (verified earlier in the iss jar's tag JSON), but our custom item wasn't tagged. Added `data/curios/tags/items/spellbook.json` to the mod's resources with `replace: false` and our item — this **extends** the existing tag rather than overriding it, so all vanilla ISS books stay in the slot too. Players should now be able to equip the modular spell book as a curio.

**Vanilla Cookbook 2.2.4 added.** Forge 1.20.1, ~380KB. Optional dep on Farmer's Delight which we already have. `.pw.toml` shipped to all three distros (`mods/.index/`, `server_distribution/mods/.index/`, `distribution/client/mods/.index/`). Players will pick it up on the next sync via `download_mods.ps1`.

**Lang audit (Phase 6J cont.).** Scanned all 50 of our material JSONs (28 metals + 5 gems + 2 skin + 12 ISS + 3 Ars books) against the lang file:
- ✓ All 50 materials have `tetra.material.<key>` and `.prefix` lang entries
- ✓ Custom material categories `icraft_iss_books` + `icraft_ars_books` now have `tetra.variant_category.<cat>.label` (added in cont. 29 hotfix as "Spell Books" / "Tomes")
- Vanilla categories (`metal`, `gem`, `skin`) resolve from Tetra's own lang — no gap

Audit script lives in the wiki entry; can re-run anytime to catch regressions when adding new materials.

`iridescent_modular_spells-0.2.0.jar` rebuilt and deployed.

---

## 2026-04-28 (cont. 29) — Custom book glyphs replace Tetra's sword-blade icon

cont. 28 fixed the broken texture path but landed at `tetra:textures/gui/glyphs.png` offset (0, 0) — which is Tetra's **sword-blade glyph** (top-left of their atlas). Visually weird for a spell book.

Drew a simple 32×16 monochrome book-themed glyph atlas at `assets/iridescent_modular_spells/textures/gui/glyphs.png` with two slots:

- **(0, 0): Closed book** — used for core, front_cover, back_cover, spine, dye (a 12×12-ish outline with a central spine and page detail lines)
- **(16, 0): Open book** — used specifically for the `pages` slot (V-shape with two open page faces and lined detail)

Same monochrome 1px-outline style as Tetra's vanilla glyphs so the new icon doesn't visually clash with the rest of the workbench. Pillow-generated, pixel-precise.

Bulk-updated all 10 module variant glyphs + 15 schematic glyphs to point at the new texture path with the correct (X, Y) per slot. The pages-specific open-book glyph differentiates that slot at a glance from the other "closed cover" slots.

`iridescent_modular_spells-0.2.0.jar` rebuilt and deployed (texture + JSON refs all in the jar at `assets/iridescent_modular_spells/textures/gui/glyphs.png` + each module/schematic JSON updated).

---

## 2026-04-28 (cont. 28) — Fix glyph texture path: wizard_glyphs.png → glyphs.png

Tester noted the 2 right-side major slots rendered as **large empty squares** rather than the expected diamond backdrops with glyph content. Diagnosed via decompiled Tetra:

- `WorkbenchStatsGui` correctly picks `GuiModuleMajor` for major slots (diamond backdrops) and `GuiModule` for minor slots (square backdrops). Our `MAJOR_KEYS` / `MINOR_KEYS` are split correctly. Backdrop classification working.
- The "empty square" symptom was a **broken texture reference**: every module + schematic JSON pointed at `tetra:textures/gui/wizard_glyphs.png` — a path that **does not exist** in Tetra 6.12.0. The actual atlas is `tetra:textures/gui/glyphs.png`. I'd copied the broken path from TSB's JSONs back in cont. 10 (TSB references the same nonexistent file, so their renders are likely empty too — they just never noticed or fixed it).

Tetra silently fails the texture load and the resulting empty render is more visually obvious on the bigger major-slot diamond backdrop than on the minor squares (where the contents are smaller anyway).

Bulk-replaced `wizard_glyphs.png` → `glyphs.png` across 16 files (10 modules + 6 schematics, both iss_book and ars_book). All glyphs now point to Tetra's actual atlas. `textureX=0, textureY=0` continues to point at the top-left of the atlas (a generic glyph) — picking specific positions for spell-book-themed glyphs is a future polish task.

`iridescent_modular_spells-0.2.0.jar` rebuilt and deployed.

The user also noted base Tetra labels are similarly long ("Makeshift copper guard", "Decorative copper pommel") and don't overlap, suggesting our cont. 27 label trim may have been overly conservative. We can revisit verbose labels later — current state is functional and the wider-than-vanilla offsets give us margin.

---

## 2026-04-28 (cont. 27) — Trim minor variant labels to bare material name

cont. 26 reclassified to vanilla sword's 2-major + 3-minor split and Tetra's `defaultMinorOffsets[3]` placed icons correctly, but our minor labels (`"Rotten leather backing"`, `"Phantom membrane pages"`) still wrapped/overlapped on the 13px vertical spacing Tetra reserves between minors. Vanilla sword fits because its minor labels are flatter — `"Decorative copper pommel"` is one string, not slot + variant stacked.

Trimmed all 6 secondary `material_name` interpolations to bare `"%s"`:

| Slot | Before | After |
|---|---|---|
| `iss_book/back_cover` | `"%s backing"` | `"%s"` |
| `iss_book/spine` | `"%s spine"` | `"%s"` |
| `iss_book/pages` | `"%s pages"` | `"%s"` |
| `ars_book/back_cover` | `"%s backing"` | `"%s"` |
| `ars_book/spine` | `"%s spine"` | `"%s"` |
| `ars_book/dye` | `"%s dye"` | `"%s"` |

Front cover keeps `"%s-lined cover"` per the user's "X-lined" naming convention from cont. 11. Core stays at `"%s"`. Slot labels above each icon ("Back Cover", "Spine", "Pages") still render and supply the missing context — same approach vanilla Tetra uses for its minors.

`iridescent_modular_spells-0.2.0.jar` rebuilt and deployed.

---

## 2026-04-28 (cont. 26) — Match vanilla sword's 2-major + 3-minor split exactly

cont. 25's "spread X coords" approach worked but kept us at 3+2, which doesn't match any of Tetra's pre-tuned canonical layouts. Tester pointed out base Tetra renders **all** modules in compact boxes around the central glyph — that's because vanilla sword has 2 majors + 3 minors, and Tetra ships `defaultMajorOffsets[2]` + `defaultMinorOffsets[3]` specifically tuned for this split. We were fighting the framework.

Reclassified `back_cover` from major → minor on both iss + ars sides:

| Slot | Was (cont. 23) | Now (cont. 26) |
|---|---|---|
| `core` | Major | **Major** |
| `front_cover` | Major | **Major** |
| `back_cover` | Major | **Minor** |
| `spine` | Minor | Minor |
| `pages` (iss) / `dye` (ars) | Minor | Minor |

Distribution now: **2 majors + 3 minors**, identical to vanilla sword's `[blade, hilt]` + `[fuller, guard, pommel]` distribution.

Then **deleted the bespoke `getMajorGuiOffsets` / `getMinorGuiOffsets` overrides** — Tetra's default impl now serves the canonical `defaultMajorOffsets[2]` = `(4,0), (4,18)` and `defaultMinorOffsets[3]` = `(-12,-1), (-21,12), (-12,25)` arrays, the same exact coordinates vanilla sword uses for its blade/hilt/fuller/guard/pommel layout.

Module + schematic JSON changes (8 files): `back_cover.json` → `tetra:basic_module`, `back_cover_main.json` + `back_cover_lining.json` → `displayType: minor`. Plus dropped `GuiModuleOffsets` import (now unused) from both Java classes.

The result: workbench module panel should now look identical to vanilla sword's compact layout — major slot icons on right (core top, front_cover below), minor slot icons stacked on left (back_cover, spine, pages).

`iridescent_modular_spells-0.2.0.jar` rebuilt and deployed.

---

## 2026-04-28 (cont. 25) — Spread offsets to fit our long labels (Tetra defaults too tight)

cont. 24's "delegate to defaults" approach pulled `defaultMajorOffsets[3]` = `(4,0), (4,18), (-4,0)` and `defaultMinorOffsets[2]` = `(-18,5), (-18,18)` — designed for vanilla sword's short labels ("Iron blade" / "Wooden hilt") where 8px between major slots is enough. Our labels are 2-3× longer ("Iron-lined cover", "Phantom membrane pages", "Rotten leather backing"), so on the tight defaults they collide horizontally across the central glyph.

Re-overriding `getMajorGuiOffsets` / `getMinorGuiOffsets` with **widened X coordinates** that keep Tetra's structural pattern (majors triangle, minors stacked) but give our labels room:

```
Majors (3): (0,-22), (24,5), (-24,5)     — core top-center, covers ±24 horizontal
Minors (2): (-16,22), (16,22)            — spine + pages bottom corners
```

Comments in the source now document the Tetra reference values from the decompiled IModularItem.&lt;clinit&gt; so the next person editing this file knows what's "stock" vs deliberately spread.

`iridescent_modular_spells-0.2.0.jar` rebuilt and deployed.

---

## 2026-04-28 (cont. 24) — Use Tetra's default offset arrays instead of overriding

While answering the user's "can't we just match Tetra's parameters?" question, decompiled `IModularItem.class` and found:
```
public static final GuiModuleOffsets[] defaultMajorOffsets;
public static final GuiModuleOffsets[] defaultMinorOffsets;

default GuiModuleOffsets getMajorGuiOffsets(stack) {
    return defaultMajorOffsets[getNumMajorModules(stack)];
}
```

Tetra ships **canonical layout arrays** indexed by slot count. The vanilla sword's compact look comes from the default impl pulling `defaultMajorOffsets[2]` + `defaultMinorOffsets[3]`. By **not overriding** these methods, our spell book gets the same canonical layout vanilla items use for `[3 majors + 2 minors]`.

Removed both overrides on `ModularSpellBookItem` and `ModularArsSpellBookItem` — back to the IModularItem default impl, plus dropped the now-unused `import se.mickelus.tetra.gui.GuiModuleOffsets`. Net result: ~30 lines of bespoke offset coordinates deleted, and the module panel now matches base Tetra's positioning exactly for our 3+2 slot configuration. cont. 23's major/minor split is what made this possible — Tetra's defaults handle 3+2 cleanly, but they didn't have a 5-major default that worked for our previous shape.

`iridescent_modular_spells-0.2.0.jar` rebuilt and deployed.

---

## 2026-04-28 (cont. 23) — Modular spell book: split majors/minors for compact base-Tetra layout

Tester noted the workbench module slots looked larger than vanilla Tetra's sword slots. Decompiled `ModularBladedItem` and confirmed the dimension delta isn't a configurable — vanilla swords have **2 majors + 3 minors** (blade + hilt big, fuller/guard/pommel small), while ours had **5 majors** all rendered full-size. Reclassified 2 of our 5 slots:

| Slot | Was | Now | Reasoning |
|---|---|---|---|
| `core` | Major | **Major** | Identity-defining |
| `front_cover` | Major | **Major** | Visual focal point |
| `back_cover` | Major | **Major** | Symmetric anchor |
| `spine` | Major | **Minor** | Functional secondary |
| `pages` (iss) / `dye` (ars) | Major | **Minor** | Functional secondary |

**Changes:**
- Java: `MAJOR_KEYS` cut to 3 entries; new `MINOR_KEYS = {spine, pages}` (or `{spine, dye}` on ars). Override `getMinorModuleKeys` to return `MINOR_KEYS`. Added `getMinorGuiOffsets` returning 2 coordinate pairs at `(-14, 20)` and `(14, 20)` — bottom-corner positions where vanilla Tetra renders minors compact.
- `getMajorGuiOffsets` re-shaped to 3 pairs: core `(0, -32)`, front_cover `(18, 0)`, back_cover `(-18, 0)` — the "T" pattern.
- Module JSONs: `iss_book/{spine,pages}.json` + `ars_book/{spine,dye}.json` — `"type": "tetra:basic_major_module"` → `"tetra:basic_module"` (vanilla-style minor module type, matching `sword/decorative_pommel.json`).
- Schematic JSONs: same 4 files — `"displayType": "major"` → `"minor"`.

**Effects in-game:**
- Module panel: 3 large slots (Core + Front Cover + Back Cover) and 2 small slots (Spine + Pages or Dye), matching vanilla Tetra's compact layout
- Stat contributions: unchanged. Integrity scheme (front=0, back=+1, spine=0, pages=+1, core=−2 → net 0) still applies, just rendered through the new major/minor classification

`iridescent_modular_spells-0.2.0.jar` rebuilt and deployed.

---

## 2026-04-28 (cont. 22) — Stat-bar tooltips actually translate now + module labels compact

Tester reported tooltips on the magic-stat bars rendered as raw lang keys (`iridescent_modular_spells.stats.cooldownReduction`) and the module slot labels overflowed the panel ("Iron-lined spell book cover" etc., much wider than base Tetra's "Copper blade").

**Root cause on tooltips:** disassembled Tetra 6.12.0 `GuiStatBar.update()` and confirmed the bar **label** is wrapped in `I18n.get(labelKey, args)` (translates), but the **tooltip** is wrapped in `Component.literal(tooltipGetter.getTooltipBase(...))` (does NOT translate). So when our `getTooltipBase` returned the raw lang key, Tetra rendered it as literal text. Fixed by calling `I18n.get(tooltipKey, formattedValue)` inside `getTooltipBase` so the returned string is already-resolved with `%s` substituted before Tetra wraps it. Vanilla Tetra's own tooltip getters do the same trick — that's why their `tetra.stats.armor.tooltip` entries with `§e%s§r armor` placeholders work.

**Module label compaction:** shortened all 10 `material_name` interpolations:
- `"%s-lined spell book cover"` → `"%s-lined cover"` (iss + ars)
- `"%s spell book backing"` → `"%s backing"`
- `"%s spell book spine"` → `"%s spine"`
- `"%s spell book pages"` → `"%s pages"`
- `"%s tome dye"` → `"%s dye"`

So an iron-cored modular spell book with a manasteel front cover now renders the front-cover label as **"Manasteel-lined cover"** instead of **"Manasteel-lined spell book cover"**. Same UX as vanilla Tetra modules ("Copper blade", "Flimsy hilt").

**Bar width:** GuiStatBar constructor's barLength dropped from `80` to `60` — matches base Tetra's compact panel sizing in the user's reference screenshot.

Built and deployed. Sync and re-launch, and:
- Hovering a stat bar should show "Reduces the cooldown between spell casts by §e+5.0%§r." (translated, value substituted) instead of the raw key.
- Module slot labels in the workbench should fit the panel without overflowing.
- Bars themselves should be visibly narrower / closer to base Tetra's layout.

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
