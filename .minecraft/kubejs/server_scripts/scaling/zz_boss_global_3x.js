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
//   via core.spawnBuff (0_lib_core.js, "spawn buffs"), which SAVES the
//   modifiers with the boss. (Until 2026-10-12: entity.modifyAttribute, which
//   does not — see IDEMPOTENT / SAVED below.)
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
// IDEMPOTENT / SAVED WITH THE BOSS (corrected 2026-10-12)
//   kjs$modifyAttribute derives a STABLE UUID from the modifier-id string
//   (new UUID(name.hashCode(), name.hashCode())) and does removeModifier(uuid)
//   → addTRANSIENTModifier: AttributeInstance.m_22118_, which only calls
//   addModifier. m_22125_ (addPermanentModifier) is the one that also fills the
//   set AttributeInstance.save() writes. (javap of kubejs-forge-2001.6.5-
//   build.16 and the 1.20.1 srg jar. This header used to say
//   "addPermanentModifier (javap-verified)"; that was wrong.) So the same id
//   never STACKS, but a modifier added that way is NOT saved with the entity.
//   Until 2026-10-12 this file used it behind the saved 'icraft_boss_3x' flag:
//   a boss that was unloaded and loaded again (a structure boss waiting for
//   players, a chunk unload, a server restart) came back WITHOUT the ×3, with
//   its Health clamped to the smaller maximum, and the flag kept the buff from
//   being applied again. In the world backup of 2026-10-11 none of the 21
//   flagged bosses had a script modifier saved.
//   Now core.spawnBuff makes each modifier permanent (same UUID, so still no
//   stacking) and the flag is a number: 2 = saved with the boss, nothing to
//   do, Health untouched; 1 = buffed by the old code and lost since → the buff
//   goes back on when the boss loads and it keeps its SHARE of health (full
//   stays full, half stays half; no heal on top of that).
//   CAVEAT: a permanent modifier outlives this file. Disabling the buff later
//   needs a pass that takes the three modifiers off the bosses that carry them
//   (entity.removeAttribute); deleting the file is not enough.
//
// BOSS SET — keyed off the pack's roster (see the true-boss/miniboss boundary)
//   Source = the flag `x3` of the boss registry (kubejs/config/icraft/registry/
//   bosses.json): every boss of kind `named` (the pack's curated "trophy boss"
//   roster, all 4 tiers) and five true bosses that roster omits.
//
//   THE BOUNDARY (operator: FLAGGED, not silently widened): the pack itself
//   splits true/trophy bosses (NAMED_BOSSES_BY_TIER) from boss-tier MOBS /
//   "minibosses" (MINIBOSSES_BY_TIER, plus the boss-tier mobs that pad
//   codex_boss_rush.js's combat roster — irons_spellbooks cryomancer/pyromancer/
//   necromancer/priest, stalwart reinforced_blaze/giddy_blaze, cataclysm
//   coralssus, alexsmobs warped_mosco, undergarden masticator/forgotten/rotbeast,
//   cataclysm ender_golem, mutant_* …). This buff hits TRUE BOSSES ONLY. To also
//   buff a miniboss (or a borderline like minecraft:elder_guardian / the stalwart
//   dungeon bosses), give its registry entry the flag `x3`.
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
//   risk.) Removing the flag `x3` from an entry is the manual opt-out lever.
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

// THE BOSS SET IS THE FLAG `x3` OF THE BOSS REGISTRY (kubejs/config/icraft/
// registry/bosses.json, read through icraft.bosses, 0_lib_registry.js).
// Until 2026-10-13 it was built here: the named roster of
// codex_exploration_kills.js (global.ICRAFT_NAMED_BOSS_IDS) + BOSS_3X_EXTRAS
// (five true bosses that roster omits: ars_nouveau:wilden_boss, theabyss:
// nightblade_boss / the_roka / elder, majestic_menaces:teikoku_senshi) -
// BOSS_3X_EXCLUDES (empty). The same 63 ids carry the flag now.
//   * to buff a miniboss too: give its entry the flag `x3`;
//   * to take a boss out of the buff: remove the flag (the old EXCLUDES lever);
//   * to keep the health x3 and spare a boss BOTH damage buffs (melee and ISS
//     spell power), the "softer damage curve for one-shot risks" lever: add the
//     flag `x3DamageSkip` (the old BOSS_3X_DMG_SKIP; no boss has it).

// O(1) membership maps, built LAZILY on first spawn (rebuilt fresh after
// /reload because the module re-initialises). var (not const): module-scope cache.
var BOSS_3X_SET = null
var BOSS_3X_DMG_SKIP_SET = null

// The log line keeps its three numbers: named = bosses of kind `named` in the
// set, extras = the others in it, excluded = named bosses WITHOUT the flag.
function bg3_buildSet() {
  var set = {}
  var ids = icraft.bosses.ids('x3')
  var named = 0
  for (var i = 0; i < ids.length; i++) {
    set[ids[i]] = true
    if (icraft.bosses.kind(ids[i]) === 'named') named++
  }
  var allNamed = icraft.bosses.ids('tokensNamed').length
  var n = ids.length
  console.log('[iridescent/boss_3x] boss set built: ' + n + ' bosses get ×' + BOSS_3X_HP_MULT
    + ' hp + ×' + BOSS_3X_DMG_MULT + ' dmg (+ ×' + BOSS_3X_SPELLPOWER_MULT + ' spell_power on ISS bosses)'
    + ' (named=' + named + ', extras=' + (n - named)
    + ', excluded=' + (allNamed - named) + ')'
    + (named === 0
        ? ' — WARN: no named boss in the registry has the flag x3; only the extras will be buffed'
        : ''))
  return set
}

function bg3_buildDmgSkip() {
  var s = {}
  var ids = icraft.bosses.ids('x3DamageSkip')
  for (var i = 0; i < ids.length; i++) s[ids[i]] = true
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

EntityEvents.spawned(icraft.guard('scaling/zz_boss_global_3x', 'EntityEvents.spawned', event => {
  // RHINO-SAFETY: var (not const/let) — this closure fires on every entity spawn.
  var entity = event.entity
  if (!entity || !entity.living || entity.player) return

  if (BOSS_3X_SET === null) {
    BOSS_3X_SET = bg3_buildSet()
    BOSS_3X_DMG_SKIP_SET = bg3_buildDmgSkip()
  }

  var resId = bg3_resId(entity)
  if (!resId || !BOSS_3X_SET[resId]) return                       // not a recognised boss

  var core = global.icraft && global.icraft.core
  if (!core) return
  var buff = core.spawnBuff(entity, 'icraft_boss_3x')
  if (!buff) return                                               // buffed, and saved with the boss

  // ── HP ×3 (MULTIPLY_TOTAL) + heal to the new max ──
  // (a boss getting a lost buff back keeps its share of health instead)
  if (BOSS_3X_HP_MULT > 1.0) {
    buff.modifier('minecraft:generic.max_health', 'icraft_boss_3x_hp',
      BOSS_3X_HP_MULT - 1.0, 'multiply_total')
    buff.health()
  }

  var dmgAllowed = !BOSS_3X_DMG_SKIP_SET[resId]

  // ── Melee attack damage ×3 (MULTIPLY_TOTAL) — melee/contact only ──
  if (BOSS_3X_DMG_MULT > 1.0 && dmgAllowed) {
    buff.modifier('minecraft:generic.attack_damage', 'icraft_boss_3x_dmg',
      BOSS_3X_DMG_MULT - 1.0, 'multiply_total')
  }

  // ── ISS spell damage ×2 via spell_power (caster bosses' real threat) ──
  // Gated to the irons_spellbooks namespace (only ISS entities register the
  // attribute; the call would do nothing elsewhere anyway, but skip it).
  // Safe on the ISS AbstractSpellCastingMob bosses (incl. archevoker) — same
  // attribute op the iridescent_difficulty mod runs on them in production; see
  // the BROKEN ENTITY SAFETY header note.
  if (BOSS_3X_SPELLPOWER_MULT > 1.0 && dmgAllowed && resId.indexOf('irons_spellbooks:') === 0) {
    buff.modifier('irons_spellbooks:spell_power', 'icraft_boss_3x_spellpower',
      BOSS_3X_SPELLPOWER_MULT - 1.0, 'multiply_total')
  }

  buff.done()
  // liveness: a boss of the roster got the x3 through core.spawnBuff
  icraft.live.fired('boss-x3')
}))

console.log('[iridescent/boss_3x] global boss buff loaded (hp ×3 + melee dmg ×3 + ISS spell ×2; see header for boundary + coverage)')
