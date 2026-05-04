// =============================================================================
// Armor Weight Tooltip — Client Script
// =============================================================================
// DIAG-MODE 2026-05-04 v3: tag-ingredient registrations didn't fire either.
// Probing whether the issue is (a) tag resolution in addAdvanced or (b)
// something else (multi-handler registration, etc).
//
//   T1: explicit single-id `addAdvanced('minecraft:iron_chestplate', ...)`
//       — same shape as the working enchanted_book_tooltip_fix.js. If this
//       fires, the tag-ingredient path is broken; if it doesn't, something
//       else is wrong.
//   T2: tag `addAdvanced('#icraft:armor_heavy', ...)`. Both fire a one-shot
//       log so we can see which paths run.
// =============================================================================

var T1_LOGGED = false
var T2_LOGGED = false

ItemEvents.tooltip(event => {
  // T1: literal item id (control — we know this shape works for the book)
  event.addAdvanced('minecraft:iron_chestplate', (stack, advanced, text) => {
    if (!T1_LOGGED) {
      T1_LOGGED = true
      console.log('[armor_tt T1] iron_chestplate addAdvanced fired; id=' + stack.id)
    }
    text.add(Text.of('Heavy Armor (T1)').color('gold'))
  })

  // T2: tag ingredient
  event.addAdvanced('#icraft:armor_heavy', (stack, advanced, text) => {
    if (!T2_LOGGED) {
      T2_LOGGED = true
      console.log('[armor_tt T2] #icraft:armor_heavy addAdvanced fired; id=' + stack.id)
    }
    text.add(Text.of('Heavy Armor (T2)').color('gold'))
  })
})
