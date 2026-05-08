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
// This script (loaded FIRST via the 0_ alphabetical prefix):
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

// Resolve entity registry id with both the registry-key path and a
// translation-key fallback. KubeJS exposes EntityType.toString() as
// "entity.<ns>.<path>" in some Rhino paths instead of the canonical
// "<ns>:<path>" -- normalize so the namespace check matches either.
global.icraftIssResId = function(entity) {
  try {
    return String(entity.getType().builtInRegistryHolder().key().location())
  } catch (e) {}
  try {
    var raw = String(entity.getType().toString())
    var m = raw.match(/^entity\.([^.]+)\.(.+)$/)
    if (m) return m[1] + ':' + m[2]
    return raw
  } catch (e) { return '' }
}

global.icraftIsIssMob = function(entity) {
  if (!entity) return false
  // Fast path: persistentData flag set by the guard listener at spawn.
  try {
    if (entity.persistentData && entity.persistentData.contains('icraft_iss_skip')) {
      return true
    }
  } catch (e) {}
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

EntityEvents.spawned(event => {
  try {
    var entity = event.entity
    if (!entity || !entity.living || entity.player) return
    var rid = global.icraftIssResId(entity)
    if (String(rid || '').indexOf(global.ICRAFT_ISS_NS) === 0) {
      try { entity.persistentData.putBoolean('icraft_iss_skip', true) } catch (e) {}
    }
  } catch (e) {
    // Defensive: never let the guard listener itself crash the server.
  }
})

console.log('[iss-guard] loaded -- irons_spellbooks: mobs will be flagged with persistentData.icraft_iss_skip=true at spawn')
