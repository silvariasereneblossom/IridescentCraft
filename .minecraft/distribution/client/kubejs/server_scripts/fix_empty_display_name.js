// @file kubejs/server_scripts/fix_empty_display_name.js
// @events EntityEvents.spawned
// =============================================================================
// FIX -- clear empty customName overrides so death messages show entity type
// =============================================================================
// 2026-04-25: diag_empty_display_name caught minecraft:pig at 45,64,-62
// spawned with hasCustomName=true and customName="" (literal empty
// Component). This propagates to death messages: when such an entity
// kills the player, vanilla composes "<player> was shot by " with the
// trailing slot blank because getDisplayName() returns the empty
// custom name instead of falling back to the type translation.
//
// Fix: subscribe to EntityEvents.spawned and force-clear the customName
// (setCustomName(null)) on any entity whose customName is empty/blank.
// Vanilla then falls back to getTypeName() ("Pig", "Skeleton", etc.) so
// the death message reads correctly.
//
// Legitimate custom names ("Bob", "Sgt. Barkley", boss names) are
// preserved -- we only touch the explicitly-empty case.
//
// The diag_empty_display_name diagnostic continues to run alongside this
// fix so we can still see WHICH mod is producing the empty names. Once
// we've identified the source we can fix it upstream and remove both.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try).
// =============================================================================

try {
  EntityEvents.spawned(icraft.guard('fix_empty_display_name', 'EntityEvents.spawned', event => {
    try {
      var e = event.entity
      if (!e || !e.living || e.player) return
      if (!e.hasCustomName()) return

      var c = null
      try { c = e.getCustomName() } catch (_) { return }
      if (!c) return

      var s = ''
      try { s = String(c.getString()) } catch (_) { return }
      if (s.length > 0 && s.trim().length > 0) return  // legitimate name, leave it

      // Empty/blank custom name -- clear so display falls back to type name.
      try { e.setCustomName(null) } catch (_) {}
      try { e.setCustomNameVisible(false) } catch (_) {}

      // Per-type one-shot log so we know we're biting (and how often).
      if (!global._empty_name_fixed) global._empty_name_fixed = {}
      // The registry id through global.icraft.core.entityId (0_lib_core.js), the one
      // reader of it. Until 2026-10-13 this asked
      // ForgeRegistries.ENTITY_TYPES.getKey(e.getType()): for scripts getType() is
      // the id STRING, the registry answers its default key for anything that is
      // not an entity type, and so EVERY entity was logged as minecraft:pig
      // (measured on all 1,411 creatable types) and the "per type" line below
      // printed once per boot, whatever was fixed.
      var typeId = global.icraft.core.entityId(e) || '?'
      if (!global._empty_name_fixed[typeId]) {
        global._empty_name_fixed[typeId] = true
        console.log('[fix_empty_name] cleared empty customName on first spawn of ' + typeId)
      }
    } catch (_) {
      // never break spawn flow
    }
  }))

  console.log('[IridescentCraft] fix_empty_display_name loaded -- empty customName overrides cleared at spawn')
} catch (e) {
  console.warn('[IridescentCraft] fix_empty_display_name bootstrap FAILED: ' + e)
}
