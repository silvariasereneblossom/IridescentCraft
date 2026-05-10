// =============================================================================
// STRIP REMOVED-MOD ITEMS -- Truly Modular framework cleanup (2026-05-10)
// =============================================================================
// We removed the entire Truly Modular framework (modular-item-api +
// truly-modular-arsenal + truly-modular-archery). Tetra-via-Iridescent-
// Reforging covers the same gameplay surface; MiApi was also the silent
// source of the cave_spider+skeleton jockey buff package (regen amp 0 +
// dolphins_grace amp 1, ~100M tick durations) via its `nucleus:facets`
// hook. Both reasons combine to retire the whole stack.
//
// Items registered under the dead namespaces will render as "Unknown
// Item" placeholders post-removal. To avoid players carrying ghost stacks,
// strip them from any inventory the moment it changes. Cheap (~3 namespace
// prefix compares per item per change event) and self-cleaning -- once
// the world has cycled through every player's inventory and every chest
// the player has touched, no live stacks remain.
//
// Persistent chests in unloaded chunks may still contain ghost items
// until first open; that's acceptable since vanilla shows them as
// "Unknown" anyway and they vanish when the player picks them up
// (inventoryChanged fires on the receiving side).
//
// Memory: feedback_kubejs_event_scope.md (PlayerEvents.* server-only),
// feedback_rhino_scoping.md (var X = function(){} inside try blocks).
// =============================================================================

try {
  var DEAD_NAMESPACES = ['miapi:', 'archery:', 'tm_arsenal:', 'modular_item_api:', 'truly_modular:']

  var stripDeadItems = function(player) {
    if (!player || !player.inventory) return 0
    var inv = player.inventory
    var stripped = 0
    // 41 slots: 36 main + 4 armor + 1 offhand. KubeJS Player.inventory
    // exposes these via slot index 0..40 on getItem(slot).
    for (var i = 0; i < 41; i++) {
      try {
        var stack = inv.getItem(i)
        if (!stack || stack.isEmpty()) continue
        var id = String(stack.id || '')
        if (!id) continue
        for (var j = 0; j < DEAD_NAMESPACES.length; j++) {
          if (id.indexOf(DEAD_NAMESPACES[j]) === 0) {
            inv.setItem(i, Item.of('minecraft:air'))
            stripped++
            break
          }
        }
      } catch (e) { /* slot access failed -- continue */ }
    }
    return stripped
  }

  PlayerEvents.inventoryChanged(function(event) {
    var stripped = stripDeadItems(event.player)
    if (stripped > 0) {
      console.log('[strip_truly_modular] removed ' + stripped +
                  ' dead-mod items from ' + event.player.name.string)
    }
  })

  // Also sweep on login -- catches the case where the player joins with
  // dead items in their inventory but doesn't change anything (just
  // standing around). inventoryChanged fires only on actual delta.
  PlayerEvents.loggedIn(function(event) {
    var stripped = stripDeadItems(event.player)
    if (stripped > 0) {
      console.log('[strip_truly_modular] login sweep removed ' + stripped +
                  ' dead-mod items from ' + event.player.name.string)
    }
  })

  console.log('[strip_truly_modular] loaded -- watching ' +
              DEAD_NAMESPACES.join(' / '))
} catch (e) {
  console.error('[strip_truly_modular] init failed: ' + e)
}
