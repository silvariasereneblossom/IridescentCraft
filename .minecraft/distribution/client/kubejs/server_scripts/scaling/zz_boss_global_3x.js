// =============================================================================
// IridescentCraft — Global Boss Buff (health ×3, melee damage ×3, ISS spell ×2)
// File: kubejs/server_scripts/scaling/zz_boss_global_3x.js
//
// Operator directive (2026-06-27): apply a flat ×3 to EVERY boss's max health
// AND attack damage, as ONE global mechanism keyed off the pack's boss roster —
// NOT per-boss hand-edits. (2026-06-28: + ×2 Iron's Spellbooks spell power, so
// caster bosses' real threat — spells — also scales.)
//
// WHAT THIS DOES
//   On spawn, if the entity is a pack-recognised BOSS, add:
//     • minecraft:generic.max_health    ×3  (MULTIPLY_TOTAL, +2.0) + heal to full
//     • minecraft:generic.attack_damage ×3  (MULTIPLY_TOTAL, +2.0)
//     • irons_spellbooks:spell_power     ×2  (MULTIPLY_TOTAL, +1.0)  ← ISS bosses only
//   via entity.modifyAttribute — the proven idiom (ascension.js / boss_hp.js).
//
// WHY MULTIPLY_TOTAL (not multiply_base)
//   The game computes an attribute as:
//       base × (1 + Σ multiply_base) × Π (1 + multiply_total)
//   boss_hp.js sets each designed boss's BASE hp via a multiply_base ratio, and
//   boss_progressive.js adds per-kill multiply_base scaling; the iridescent_
//   difficulty mod adds a per-dimension curve. A MULTIPLY_TOTAL ×3 sits cleanly
//   ON TOP of all of that — tripling whatever those produced, which is exactly
//   what "×3 the boss" means. A multiply_base +2.0 would instead SUM with the
//   others (base × (1 + ratio + 2.0)) — not a clean ×3. (Same reasoning as
//   ascension.js's icraft_asc_hp / icraft_asc_dmg.)
//
// ISS SPELL DAMAGE (the caster analog of attack_damage)
//   Iron's Spellbooks spell damage = baseDamage × the CASTER's spell_power
//   attribute (decompile-confirmed: AbstractSpell.getSpellPower(level, caster)
//   reads caster.getAttributeValue(AttributeRegistry.SPELL_POWER)). So the ×3
//   attack_damage buff does NOTHING for ISS bosses (their threat is spells, not
//   melee) — we scale irons_spellbooks:spell_power instead. ×2 (gentler than the
//   ×3 melee — ISS spells already hit hard; operator's call). Gated to the ISS
//   namespace (only ISS entities register the attribute) so it's a no-op on
//   everything else.
//
// LOAD ORDER (the zz_ filename prefix is LOAD-BEARING)
//   boss_hp.js computes its multiply_base ratio from entity.maxHealth AT SPAWN
//   to reach a target HP. If our ×3 multiply_total were already present when
//   boss_hp reads maxHealth, boss_hp would back-compute a ratio that CANCELS our
//   ×3 (final == targetHP, not targetHP×3). KubeJS fires spawned-handlers in
//   script LOAD order (alphabetical path); the zz_ prefix makes this file load
//   LAST in scaling/, so boss_hp + boss_progressive have already applied their
//   multiply_base before our multiply_total goes on. (multiply_total is applied
//   by the vanilla attribute system AFTER all multiply_base regardless of insert
//   order, so only boss_hp's spawn-time ratio READ is order-sensitive.)
//
// IDEMPOTENT / RELOAD-SAFE
//   kjs$modifyAttribute derives a STABLE UUID from the modifier-id string and
//   does removeModifier(uuid) → addPermanentModifier (javap-verified vs
//   kubejs-forge-2001.6.5), so re-applying the same id never STACKS. We also
//   guard with a persistentData flag ('icraft_boss_3x') so we don't re-heal on
//   reload / chunk-reload. The modifier is PERMANENT (saved to entity NBT) so
//   the buff survives a chunk reload. CAVEAT: because it's permanent, disabling
//   this later (deleting the file) leaves the modifier stranded on any
//   already-spawned + still-loaded boss until it despawns/dies — fine for
//   transient boss encounters; a full revert would need a paired UUID-scrub.
//
// BOSS SET — keyed off the pack's roster (see the true-boss/miniboss boundary)
//   Source = codex_exploration_kills.js NAMED_BOSSES_BY_TIER (the pack's curated
//   "trophy boss" roster, all 4 tiers — exposed as global.ICRAFT_NAMED_BOSS_IDS)
//   ∪ BOSS_3X_EXTRAS (true bosses that roster omits — non-progression-lane mods)
//   − BOSS_3X_EXCLUDES (operator opt-out lever; empty by default).
//
//   THE BOUNDARY (operator: FLAGGED, not silently widened): the pack itself
//   splits true/trophy bosses (NAMED_BOSSES_BY_TIER) from boss-tier MOBS /
//   "minibosses" (MINIBOSSES_BY_TIER, plus the boss-tier mobs that pad
//   codex_boss_rush.js's combat roster — irons_spellbooks cryomancer/pyromancer/
//   necromancer/priest, stalwart reinforced_blaze/giddy_blaze, cataclysm
//   coralssus, alexsmobs warped_mosco, undergarden masticator/forgotten/rotbeast,
//   cataclysm ender_golem, mutant_* …). This buff hits TRUE BOSSES ONLY. To also
//   buff a miniboss (or a borderline like minecraft:elder_guardian / the stalwart
//   dungeon bosses), add its id to BOSS_3X_EXTRAS below.
//
// "BROKEN ENTITY" (ISS spellcaster) SAFETY — why archevoker is now INCLUDED
//   mob_scaling_unified.js / mob_equipment.js skip 5 ISS AbstractSpellCastingMob
//   entities (necromancer/archevoker/cryomancer/pyromancer/priest) because THOSE
//   scripts call entity.fullNBT (serializeNBT) / equipment-slot accessors, which
//   throw an UNCATCHABLE AbstractMethodError on those classes. THIS hook never
//   touches NBT-serialization or equipment slots — only attribute / health /
//   persistentData / getType. Those are PROVEN safe on these exact entities: the
//   iridescent_difficulty Java mod's MobScalingHandler applies getAttribute +
//   addPermanentModifier + setHealth(getMaxHealth) to them on EVERY spawn in
//   production (they're MONSTER-category and not in its exclude list) without
//   crashing. So archevoker (a trophy boss) is buffed here via the same op class.
//   (The other 4 are minibosses → outside the set by the boundary, not by a crash
//   risk.) BOSS_3X_EXCLUDES remains as a manual opt-out lever, empty by default.
//
// DAMAGE COVERAGE (what the damage buffs reach)
//   • ISS bosses (Dead King, Echo of Tyros, Ancient Knight, Archevoker): spell
//     damage scales via the ×2 spell_power buff above. ✓
//   • Melee bosses: scale via the ×3 attack_damage buff. ✓
//   • Other casters / ranged / explosion / hardcoded damage (TF Lich & Ur-Ghast
//     projectiles, Aether Sun Spirit fireballs, Cataclysm Ignis, Ender Dragon
//     breath, Wither skulls, Terramity beam bosses, Ars Wilden Chimera spells):
//     NOT routed through attack_damage OR ISS spell_power → these get HP ×3 only.
//     (Ars / other-mod spell scaling would need that mod's own power attribute.)
// =============================================================================

const BOSS_3X_HP_MULT         = 3.0   // ×3 max health    (MULTIPLY_TOTAL amount = mult - 1)
const BOSS_3X_DMG_MULT        = 3.0   // ×3 attack damage (MULTIPLY_TOTAL amount = mult - 1)
const BOSS_3X_SPELLPOWER_MULT = 2.0   // ×2 ISS spell power (ISS bosses only; amount = mult - 1)

// True bosses the NAMED roster omits (non-progression-lane mods). Buffing an id
// whose mod isn't installed is a harmless no-op (its spawn never fires), so this
// stays broad on purpose. Documented per source.
const BOSS_3X_EXTRAS = [
  // Ars Nouveau — Wilden Chimera ritual boss (codex_boss_rush.js T2; absent from NAMED).
  'ars_nouveau:wilden_boss',
  // The Abyss — structure bosses with designed HP in boss_hp.js (absent from codex rosters).
  'theabyss:nightblade_boss', 'theabyss:the_roka', 'theabyss:elder',
  // Battle Towers — Tower Guardian (boss_hp.js).
  'keebsz:tower_guardian',
  // Ultimate Bosses (boss_hp.js).
  'ub:sorcerer', 'ub:storm',
  // Majestic Menaces — Teikoku Senshi. The namespace is AMBIGUOUS in the pack
  // (boss_hp.js + mob_scaling use majestic_menaces:, codex_boss_rush uses
  // crazybossfights:); include BOTH so whichever the installed jar registers is
  // covered — the other simply no-ops.
  'majestic_menaces:teikoku_senshi', 'crazybossfights:teikoku_senshi',
  // Ultris — Ultra Wither + Sanctum Keeper (codex_boss_rush.js T3; blaze_king is
  // already in NAMED).
  'ultris_mr:ultra_wither', 'ultris_mr:sanctum_keeper',
]

// Operator opt-out lever — boss ids to drop from the buff entirely. EMPTY by
// default. (Previously held the 5 ISS AbstractSpellCastingMob entities on a
// crash theory; that's disproven — see the "BROKEN ENTITY SAFETY" header note —
// so archevoker, a trophy boss, is now buffed. Add an id here to exclude it.)
const BOSS_3X_EXCLUDES = []

// Bosses to SKIP the damage buffs for (BOTH melee attack_damage AND ISS
// spell_power) while KEEPING the health ×3 — the operator's "softer damage curve
// for one-shot risks" lever (NOT a silent global cap). Empty by default. Add a
// one-shot offender's id here to spare it the damage scaling, e.g.:
//   'minecraft:warden', 'cataclysm:netherite_monstrosity'
const BOSS_3X_DMG_SKIP = []

// O(1) membership maps, built LAZILY on first spawn (every server_script — incl.
// codex_exploration_kills.js, which sets global.ICRAFT_NAMED_BOSS_IDS — has
// loaded by the time any entity spawns; rebuilt fresh after /reload because the
// module re-initialises). var (not const): module-scope cache.
var BOSS_3X_SET = null
var BOSS_3X_DMG_SKIP_SET = null

function bg3_buildSet() {
  var set = {}
  var named = global.ICRAFT_NAMED_BOSS_IDS || []
  for (var i = 0; i < named.length; i++) set[named[i]] = true
  for (var j = 0; j < BOSS_3X_EXTRAS.length; j++) set[BOSS_3X_EXTRAS[j]] = true
  for (var k = 0; k < BOSS_3X_EXCLUDES.length; k++) delete set[BOSS_3X_EXCLUDES[k]]
  var n = 0
  for (var key in set) n++
  console.log('[iridescent/boss_3x] boss set built: ' + n + ' bosses get ×' + BOSS_3X_HP_MULT
    + ' hp + ×' + BOSS_3X_DMG_MULT + ' dmg (+ ×' + BOSS_3X_SPELLPOWER_MULT + ' spell_power on ISS bosses)'
    + ' (named=' + named.length + ', extras=' + BOSS_3X_EXTRAS.length
    + ', excluded=' + BOSS_3X_EXCLUDES.length + ')'
    + (named.length === 0
        ? ' — WARN: global.ICRAFT_NAMED_BOSS_IDS is EMPTY (codex_exploration_kills.js not loaded?); only EXTRAS will be buffed'
        : ''))
  return set
}

function bg3_buildDmgSkip() {
  var s = {}
  for (var i = 0; i < BOSS_3X_DMG_SKIP.length; i++) s[BOSS_3X_DMG_SKIP[i]] = true
  return s
}

// Canonical resource id ("ns:path"), resolved the ROBUST way (matches
// mob_scaling_unified.js): entity.type can return the translation-key form
// ("entity.<ns>.<path>") in some KubeJS builds, which silently breaks "ns:path"
// comparisons; the registry holder is authoritative. Safe on the ISS spellcasters
// too (a static EntityType registry lookup, not an instance/slot method).
function bg3_resId(entity) {
  try {
    return String(entity.getType().builtInRegistryHolder().key().location())
  } catch (e) {
    try {
      var raw = String(entity.getType().toString())
      var m = raw.match(/^entity\.([^.]+)\.(.+)$/)
      return m ? (m[1] + ':' + m[2]) : raw
    } catch (e2) {
      return ''
    }
  }
}

EntityEvents.spawned(event => {
  // RHINO-SAFETY: var (not const/let) — this closure fires on every entity spawn.
  var entity = event.entity
  if (!entity || !entity.living || entity.player) return

  if (BOSS_3X_SET === null) {
    BOSS_3X_SET = bg3_buildSet()
    BOSS_3X_DMG_SKIP_SET = bg3_buildDmgSkip()
  }

  var resId = bg3_resId(entity)
  if (!resId || !BOSS_3X_SET[resId]) return                       // not a recognised boss
  if (entity.persistentData.contains('icraft_boss_3x')) return    // already buffed (idempotent)

  // ── HP ×3 (MULTIPLY_TOTAL) + heal to the new max ──
  if (BOSS_3X_HP_MULT > 1.0) {
    entity.modifyAttribute('minecraft:generic.max_health', 'icraft_boss_3x_hp',
      BOSS_3X_HP_MULT - 1.0, 'multiply_total')
    entity.heal(entity.maxHealth)
  }

  var dmgAllowed = !BOSS_3X_DMG_SKIP_SET[resId]

  // ── Melee attack damage ×3 (MULTIPLY_TOTAL) — melee/contact only ──
  if (BOSS_3X_DMG_MULT > 1.0 && dmgAllowed) {
    entity.modifyAttribute('minecraft:generic.attack_damage', 'icraft_boss_3x_dmg',
      BOSS_3X_DMG_MULT - 1.0, 'multiply_total')
  }

  // ── ISS spell damage ×2 via spell_power (caster bosses' real threat) ──
  // Gated to the irons_spellbooks namespace (only ISS entities register the
  // attribute; modifyAttribute would no-op elsewhere anyway, but skip the call).
  // Safe on the ISS AbstractSpellCastingMob bosses (incl. archevoker) — same
  // attribute op the iridescent_difficulty mod runs on them in production; see
  // the BROKEN ENTITY SAFETY header note.
  if (BOSS_3X_SPELLPOWER_MULT > 1.0 && dmgAllowed && resId.indexOf('irons_spellbooks:') === 0) {
    entity.modifyAttribute('irons_spellbooks:spell_power', 'icraft_boss_3x_spellpower',
      BOSS_3X_SPELLPOWER_MULT - 1.0, 'multiply_total')
  }

  entity.persistentData.putBoolean('icraft_boss_3x', true)
})

console.log('[iridescent/boss_3x] global boss buff loaded (hp ×3 + melee dmg ×3 + ISS spell ×2; see header for boundary + coverage)')
