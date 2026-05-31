// =============================================================================
// HULK HAMMER DURABILITY OVERRIDE  (kubejs/startup_scripts/)
// =============================================================================
// Boost mutantmonsters:hulk_hammer durability 64 -> 640. A T1 melee weapon at
// 64 dura / 0.5 attack-speed breaks in ~2 minutes of swinging.
//
// 2026-05-31: prior approaches both failed in KubeJS 2001.6.5 --
//   - reflection on the private maxDamage field used `<loadedClass>.class`,
//     which is not valid in this Rhino (silent catch -> no-op);
//   - `item.kjs$setMaxDamage(n)` is the KubeJS-INTERNAL mixin name, not exposed
//     to scripts ("Cannot find function kjs$setMaxDamage").
// The script-facing form is the `maxDamage` PROPERTY on the ItemEvents.modification
// target (KubeJS maps the kjs$ setter to it). Wrapped in try/catch so any future
// API drift degrades to a warning, not a hard startup error. If it still doesn't
// take, the durable fix is a mixin in the iridescent_durability_clamp coremod.
// =============================================================================

ItemEvents.modification(event => {
  event.modify('mutantmonsters:hulk_hammer', item => {
    try { item.maxDamage = 640 }
    catch (e) { console.warn('[hulk_hammer] maxDamage override failed: ' + e) }
  })
})
