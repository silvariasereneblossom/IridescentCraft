// @file kubejs/client_scripts/terramity_unholy_lance_tooltip.js
// @events ItemEvents.tooltip
// =============================================================================
// The Unholy Lance's tooltip names Virtue's altar (the Prismatic Pond in the
// Aether) instead of Terramity's "throw into the overworld sky" line, which
// the pack refuses since 2026-10-16 (server_scripts/compat/terramity_virtue_altar.js).
// =============================================================================
// Terramity 0.9.8 writes its tooltip lines as literal text in
// UnholyLanceItem.appendHoverText (no lang key to override), so the one line
// is found by its words and replaced in place. When a Terramity update
// rewords it, nothing is replaced and the jar's own line shows.
// =============================================================================
;(function () {
  var OLD_WORDS = 'overworld sky'
  var NEW_LINE = '§e -Throw into the prism solution of a Prismatic Pond (Deep Aether, in the Aether) to awaken its wrath'

  ItemEvents.tooltip(icraft.guard('terramity_unholy_lance_tooltip', 'ItemEvents.tooltip', function (event) {
    event.addAdvanced('terramity:unholy_lance', function (stack, advanced, text) {
      for (var i = 0; i < text.size(); i++) {
        if (String(text.get(i).getString()).toLowerCase().indexOf(OLD_WORDS) >= 0) {
          text.set(i, Text.of(NEW_LINE))
          return
        }
      }
    })
  }))
})()
