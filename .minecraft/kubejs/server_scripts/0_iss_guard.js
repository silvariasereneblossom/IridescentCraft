// priority: 900
// @file kubejs/server_scripts/0_iss_guard.js
// @events EntityEvents.spawned
// =============================================================================
// 0_iss_guard.js -- centralized guard against irons_spellbooks
// abstract-getItemBySlot crashes.
//
// Background: ISS wizard mobs (PriestEntity, NecromancerEntity,
// CryomancerEntity, PyromancerEntity, ArchevokerEntity, etc.) have an
// abstract getItemBySlot in 1.20.1-3.15.5.1 that throws
// java.lang.AbstractMethodError when called. Rhino's try/catch CANNOT
// catch java.lang.Error subclasses, so any KubeJS script that calls
// entity.getItemBySlot (or anything that internally invokes it, like
// entity.mainHandItem / entity.armorSlots / equipment introspection)
// will take down the server when an ISS wizard spawns.
//
// This script (the FIRST EntityEvents.spawned handler of the pack: the priority line on top of this file):
//
//   1. Subscribes to EntityEvents.spawned. On any irons_spellbooks:
//      mob, stamps icraft_iss_skip=true into persistentData. Survives
//      chunk reload, so downstream scripts don't have to re-check the
//      namespace on every tick / re-spawn.
//
//   2. Exposes global.icraftSkipIssMob(entity, scriptName) for use
//      as a one-line guard at the top of any other entity-event
//      listener:
//
//          EntityEvents.spawned(event => {
//            if (global.icraftSkipIssMob(event.entity, 'my_script')) return
//            // ... safe to access entity equipment here ...
//          })
//
//      Returns true (caller should bail) for ISS mobs. Logs ONCE per
//      scriptName per session, so the log eventually shows which
//      scripts bailed on an ISS wizard. If the AbstractMethodError
//      crash recurs, the crashing script is the one NOT in the bail
//      list -- that's the diagnostic value.
//
// Memory: feedback_kubejs_event_scope.md, feedback_jar_audit.md.
// =============================================================================

global.ICRAFT_ISS_NS = 'irons_spellbooks:'

// The entity's registry id ("<ns>:<path>"). For scripts entity.getType() IS that
// id, as a string; a value in the translation-key form ("entity.<ns>.<path>")
// is normalised, so the namespace check matches either.
// This file keeps its own reader on purpose: it loads BEFORE the core library
// (priority 900 against 880) and is the one script that must not depend on
// another to recognise a mob whose item slots crash the server.
// Until 2026-10-13 a first read stood in front of this one,
// entity.getType().builtInRegistryHolder(): on a string it threw for every
// entity (measured on all 1,411 creatable types: answered 0 times), inside a
// silent catch, and this fallback did the work. The answer is unchanged.
global.icraftIssResId = (function () {
  var warned = false     // (in a closure: this file is not wrapped, and a top-level name is shared by every server script)
  return function(entity) {
    try {
      var raw = String(entity.getType())
      var m = raw.match(/^entity\.([^.]+)\.(.+)$/)
      if (m) return m[1] + ':' + m[2]
      return raw
    } catch (e) {
      // '' means "not an Iron's Spellbooks mob" to every caller, and that is the
      // answer after which a script touches the mob's item slots: never give it quietly
      if (!warned) {
        warned = true
        console.warn('[iss-guard] the id of an entity could not be read (' + e + '): it is NOT recognised as an irons_spellbooks mob (logged once per script load)')
      }
      return ''
    }
  }
})()

global.icraftIsIssMob = function(entity) {
  if (!entity) return false
  // Fast path: persistentData flag set by the guard listener at spawn.
  try {
    if (entity.persistentData && entity.persistentData.contains('icraft_iss_skip')) {
      return true
    }
  } catch (e) { /* swallow-ok: the flag is only the fast path; when it cannot be read the namespace test below decides, and that test is complete */ }
  // Slow-path fallback: re-check via namespace (covers entities that
  // arrived before this script loaded, or whose persistentData was
  // cleared).
  return String(global.icraftIssResId(entity) || '').indexOf(global.ICRAFT_ISS_NS) === 0
}

global.icraftSkipIssMob = function(entity, scriptName) {
  if (!global.icraftIsIssMob(entity)) return false
  // Throttled log: one line per scriptName per session.
  if (!global._icraft_iss_skip_logged) global._icraft_iss_skip_logged = {}
  if (scriptName && !global._icraft_iss_skip_logged[scriptName]) {
    var rid = global.icraftIssResId(entity)
    console.log('[iss-guard] ' + scriptName + ' bailed on ' + (rid || '<unknown>'))
    global._icraft_iss_skip_logged[scriptName] = true
  }
  return true
}

// No try / catch of its own around the listener (it had a silent one until
// 2026-10-13, "never let the guard listener itself crash the server"): that is
// what icraft.guard does, and it SAYS so. A throw in here is one
// `[icraft.guard] FAILED 0_iss_guard in EntityEvents.spawned` line and the spawn
// handlers of the other scripts still run.
EntityEvents.spawned(icraft.guard('0_iss_guard', 'EntityEvents.spawned', event => {
  var entity = event.entity
  if (!entity || !entity.living || entity.player) return
  var rid = global.icraftIssResId(entity)
  if (String(rid || '').indexOf(global.ICRAFT_ISS_NS) === 0) {
    try { entity.persistentData.putBoolean('icraft_iss_skip', true) } catch (e) { /* swallow-ok: the flag is an optimisation; a mob it could not be written on is still recognised by its namespace (icraftIsIssMob, the slow path) */ }
  }
}))

console.log('[iss-guard] loaded -- irons_spellbooks: mobs will be flagged with persistentData.icraft_iss_skip=true at spawn')

// the last statement: this library ran to its end (icraft.lib, 00_icraft_guard.js)
icraft.lib.announce('iss-guard')
