// =============================================================================
// DIAGNOSTIC -- log entities spawning with an empty getDisplayName()
// =============================================================================
// 2026-04-25: tester died with death message "silvieserene was shot by "
// (empty trailing name). For this to happen, the killer's getDisplayName()
// must return an empty Component. Vanilla translations are baked, so the
// only way to get empty is something explicitly setting customName to
// Component.empty() on the entity (Apotheosis affix system, mob-naming
// mod, scaling-mob suffix bug, etc.).
//
// This handler subscribes to EntityEvents.spawned, reads the entity's
// resolved display-name string, and logs an alert if it's empty/blank.
// Per-type one-shot (entity type + the path that produced it) so we don't
// spam. Once we have a few hits, we can identify which mod is doing it
// and patch the source.
//
// Remove this script once root-caused.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try).
// =============================================================================

try {
  EntityEvents.spawned(event => {
    try {
      var e = event.entity
      if (!e || !e.living) return
      if (e.player) return

      // Try to resolve display name as a string. Different KubeJS-Rhino
      // paths may all be needed before one returns useful data.
      var displayStr = null
      try {
        var disp = e.getDisplayName()
        if (disp) displayStr = String(disp.getString())
      } catch (_) {}
      if (displayStr === null) {
        try { displayStr = String(e.getName().getString()) } catch (_) {}
      }
      if (displayStr === null) return  // can't determine -- skip

      // Alert if empty or whitespace-only.
      if (displayStr.length === 0 || displayStr.trim().length === 0) {
        if (!global._empty_name_seen) global._empty_name_seen = {}
        // 2026-04-25: builtInRegistryHolder() returned ? for 22 entities in
        // the prior test -- Rhino bridge can't traverse Holder.Reference.key()
        // for some types. Use ForgeRegistries.ENTITY_TYPES.getKey() as primary,
        // with the EntityType.toString() regex parse as fallback.
        var typeId = '?'
        try {
          var FR = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
          var rl = FR.ENTITY_TYPES.getKey(e.getType())
          if (rl) typeId = String(rl)
        } catch (_) {}
        if (typeId === '?') {
          try { typeId = String(e.getType().builtInRegistryHolder().key().location()) } catch (_) {}
        }
        if (typeId === '?') {
          try {
            var raw = String(e.getType().toString())
            var m = raw.match(/^entity\.([^.]+)\.(.+)$/)
            if (m) typeId = m[1] + ':' + m[2]
            else typeId = raw
          } catch (_) {}
        }
        var hasCustom = false
        try { hasCustom = e.hasCustomName() } catch (_) {}
        var customStr = '<none>'
        try {
          var c = e.getCustomName()
          if (c) customStr = String(c.getString())
        } catch (_) {}
        var key = typeId + (hasCustom ? '+custom' : '+default')
        if (!global._empty_name_seen[key]) {
          global._empty_name_seen[key] = true
          console.warn('[empty_name] ' + typeId +
                       ' spawned with EMPTY display name. hasCustomName=' + hasCustom +
                       ' customName="' + customStr + '" displayName="' + displayStr + '"' +
                       ' at ' + Math.round(e.getX()) + ',' +
                       Math.round(e.getY()) + ',' + Math.round(e.getZ()))
        }
      }
    } catch (e) {
      // Don't let this handler ever break spawn flow
    }
  })

  console.log('[IridescentCraft] diag_empty_display_name loaded -- alerts on entities with empty display name')
} catch (e) {
  console.warn('[IridescentCraft] diag_empty_display_name bootstrap FAILED: ' + e)
}
