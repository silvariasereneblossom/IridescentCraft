// =============================================================================
// IridescentCraft — Global ×3 Boss Buff (health + damage)
// File: kubejs/server_scripts/scaling/zz_boss_global_3x.js
//
// Operator directive (2026-06-27): apply a flat ×3 to EVERY boss's max health
// AND attack damage, as ONE global mechanism keyed off the pack's boss roster —
// NOT per-boss hand-edits.
//
// WHAT THIS DOES
//   On spawn, if the entity is a pack-recognised BOSS, add:
//     • minecraft:generic.max_health    ×3  (MULTIPLY_TOTAL, +2.0) + heal to full
//     • minecraft:generic.attack_damage ×3  (MULTIPLY_TOTAL, +2.0)
//   via entity.modifyAttribute — the proven idiom (ascension.js / boss_hp.js).
//
// WHY MULTIPLY_TOTAL (not multiply_base)
//   The game computes an attribute as:
//       base × (1 + Σ multiply_base) × Π (1 + multiply_total)
//   boss_hp.js sets each designed boss's BASE hp via a multiply_base ratio, and
//   boss_progressive.js adds per-kill multiply_base scaling; the iridescent_
//   difficulty mod adds a per-dimension curve (but EXCLUDES bosses). A
//   MULTIPLY_TOTAL ×3 sits cleanly ON TOP of all of that — tripling whatever
//   those produced, which is exactly what "×3 the boss" means. A multiply_base
//   +2.0 would instead SUM with the others (base × (1 + ratio + 2.0)) — not a
//   clean ×3. (Same reasoning as ascension.js's icraft_asc_hp / icraft_asc_dmg.)
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
//   the ×3 survives a chunk reload. CAVEAT: because it's permanent, disabling
//   this later (deleting the file) leaves the modifier stranded on any
//   already-spawned + still-loaded boss until it despawns/dies — fine for
//   transient boss encounters; a full revert would need a paired UUID-scrub.
//
// BOSS SET — keyed off the pack's roster (see the true-boss/miniboss boundary)
//   Source = codex_exploration_kills.js NAMED_BOSSES_BY_TIER (the pack's curated
//   "trophy boss" roster, all 4 tiers — exposed as global.ICRAFT_NAMED_BOSS_IDS)
//   ∪ BOSS_3X_EXTRAS (true bosses that roster omits — non-progression-lane mods)
//   − BOSS_3X_EXCLUDES (crash-prone / opted-out entities).
//
//   THE BOUNDARY (operator: FLAGGED, not silently widened): the pack itself
//   splits true/trophy bosses (NAMED_BOSSES_BY_TIER) from boss-tier MOBS /
//   "minibosses" (MINIBOSSES_BY_TIER, plus the boss-tier mobs that pad
//   codex_boss_rush.js's combat roster — irons_spellbooks cryomancer/pyromancer/
//   necromancer/priest, stalwart reinforced_blaze/giddy_blaze, cataclysm
//   coralssus, alexsmobs warped_mosco, undergarden masticator/forgotten/rotbeast,
//   cataclysm ender_golem, mutant_* …). This ×3 buffs TRUE BOSSES ONLY. To also
//   buff a miniboss (or a borderline like minecraft:elder_guardian / the stalwart
//   dungeon bosses), add its id to BOSS_3X_EXTRAS below.
//
// DAMAGE-×3 COVERAGE CAVEAT
//   The attack_damage ×3 only reaches damage that routes through
//   generic.attack_damage (melee / contact). Spell / projectile / explosion /
//   on-touch / hardcoded boss damage IGNORES it — so casters & ranged bosses
//   (Iron's Spellbooks bosses, TF Lich / Ur-Ghast, Aether Sun Spirit, Cataclysm
//   Ignis, the Ender Dragon's breath/charge, the Wither's skulls, the Terramity
//   beam/bomb bosses …) get the HP ×3 but no meaningful damage ×3. HP ×3 is
//   universal. Bosses with no attack_damage attribute at all just get no
//   modifier (modifyAttribute no-ops when the AttributeInstance is null).
// =============================================================================

const BOSS_3X_HP_MULT  = 3.0   // ×3 max health    (MULTIPLY_TOTAL amount = mult - 1)
const BOSS_3X_DMG_MULT = 3.0   // ×3 attack damage (MULTIPLY_TOTAL amount = mult - 1)

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

// Excluded from the ×3. The Iron's Spellbooks AbstractSpellCastingMob entities
// throw java.lang.AbstractMethodError on property access — UNCATCHABLE by Rhino
// try/catch (see mob_scaling_unified.js BROKEN_ENTITIES / failure-modes §2), so
// touching their attributes risks a SERVER CRASH. 'archevoker' is in NAMED_BOSSES
// (a trophy boss) but is one of these broken entities, so it gets NO ×3 — its
// difficulty stays mod-default + the dimension-scaling curve. (The other four are
// minibosses, already outside the set; listed here belt-and-suspenders so a future
// roster edit can't reintroduce the crash.) A broken-boss buff would need a
// mod-config / mixin path, not a KubeJS attribute write.
const BOSS_3X_EXCLUDES = [
  'irons_spellbooks:archevoker',
  'irons_spellbooks:necromancer',
  'irons_spellbooks:cryomancer',
  'irons_spellbooks:pyromancer',
  'irons_spellbooks:priest',
]

// Bosses to SKIP the damage-×3 for while KEEPING the health-×3 — the operator's
// "softer damage curve for one-shot risks" lever (NOT a silent global cap). Empty
// by default (operator accepted the one-shot caveat). Add a melee one-shot
// offender's id here to spare it the damage tripling, e.g.:
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
    + ' hp + ×' + BOSS_3X_DMG_MULT + ' dmg (named=' + named.length + ', extras='
    + BOSS_3X_EXTRAS.length + ', excluded=' + BOSS_3X_EXCLUDES.length + ')'
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
// comparisons; the registry holder is authoritative. Safe on BROKEN_ENTITIES too
// (a static EntityType registry lookup, not an instance/slot method).
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

  // ── Attack damage ×3 (MULTIPLY_TOTAL) — melee/contact only (see coverage caveat) ──
  if (BOSS_3X_DMG_MULT > 1.0 && !BOSS_3X_DMG_SKIP_SET[resId]) {
    entity.modifyAttribute('minecraft:generic.attack_damage', 'icraft_boss_3x_dmg',
      BOSS_3X_DMG_MULT - 1.0, 'multiply_total')
  }

  entity.persistentData.putBoolean('icraft_boss_3x', true)
})

console.log('[iridescent/boss_3x] global ×3 boss buff loaded (health + damage; see header for boundary + damage coverage)')
