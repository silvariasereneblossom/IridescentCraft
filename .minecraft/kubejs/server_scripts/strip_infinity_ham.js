// =============================================================================
// STRIP INFINITY HAM
// Place in: kubejs/server_scripts/strip_infinity_ham.js
// =============================================================================
//
// User design call (2026-05-14): Relics' infinity_ham autophagy ability
// continuously feeds the wearer, defeating the modpack's food/hunger
// balance. Native loot.entries were zeroed in config (no new spawns)
// and abilities zeroed (existing instances do nothing), but any current
// in-inventory infinity_hams (from prior loot pulls or creative-mode
// inspection) should be physically removed.
//
// Approach: on loggedIn, walk player main inventory + Curios trinket slots and
// replace any relics:infinity_ham stack with air. On inventoryChanged the full
// walk only runs when the stack that just changed IS an infinity ham (the old
// version re-walked 41 inventory slots + every curio slot, and re-resolved the
// Curios class, on EVERY inventory change of every player). Idempotent and
// silent unless the script actually removes something.
//
// 2026-10-10:
//   - everything is local to an IIFE: this file's top-level `var scanPlayer`
//     used to replace randomize_blank_scrolls.js's function of the same name
//     (one shared Rhino scope), which silently killed blank-scroll randomizing.
//   - the Curios pass never worked: it called LazyOptional.get(), which does
//     not exist (TypeError, swallowed by the catch). It now uses orElse(null).
//
// Pairs with:
//   client_scripts/jei_hiding.js  -- hide from JEI search
//   config/relics/infinity_ham.json -- loot.entries={} + abilities zeroed
// =============================================================================

// (IIFE - all KubeJS files of one type share a single Rhino scope; see dev/lint_kubejs_scope.py)
;(function () {
  var HAM_ID = 'relics:infinity_ham'

  // Resolved once at load (null when Curios is absent / filtered).
  var CuriosApi_sih = null
  try { CuriosApi_sih = Java.loadClass('top.theillusivec4.curios.api.CuriosApi') } catch (e) {}

  var itemIdOf = function (stack) {
    return String(stack.getItem().builtInRegistryHolder().key().location())
  }

  var stripStack = function (player, stack, where) {
    if (!stack || stack.isEmpty()) return false
    try {
      if (itemIdOf(stack) !== HAM_ID) return false
      stack.setCount(0)
      if (!global._infinity_ham_seen) {
        global._infinity_ham_seen = true
        console.log('[strip_infinity_ham] removed from ' + player.username +
                    ' (' + where + ', logging once)')
      }
      return true
    } catch (e) { return false }
  }

  var scanPlayer = function (player) {
    if (!player) return
    // Main inventory (36 slots) + armor + offhand
    try {
      var inv = player.getInventory()
      if (inv) {
        for (var i = 0; i < inv.getContainerSize(); i++) {
          stripStack(player, inv.getItem(i), 'slot ' + i)
        }
      }
    } catch (e) {}
    // Curios slots (if curios loaded)
    if (!CuriosApi_sih) return
    try {
      // getCuriosInventory returns a Forge LazyOptional<ICuriosItemHandler>
      var handler = CuriosApi_sih.getCuriosInventory(player).orElse(null)
      if (!handler) return
      var iter = handler.getCurios().values().iterator()
      while (iter.hasNext()) {
        var slot = iter.next()
        var stacks = slot.getStacks()
        for (var j = 0; j < stacks.getSlots(); j++) {
          stripStack(player, stacks.getStackInSlot(j), 'curio:' + slot.getIdentifier() + '/' + j)
        }
      }
    } catch (e) {
      // Curios API surface varies; ignore reflection failures
    }
  }

  PlayerEvents.inventoryChanged(event => {
    // Fast path: only walk the inventory if the changed stack is an infinity ham.
    try {
      var changed = event.item
      if (!changed || changed.isEmpty()) return
      if (itemIdOf(changed) !== HAM_ID) return
    } catch (e) {
      // If we can't read the changed item, fall through to the full scan
    }
    scanPlayer(event.player)
  })

  PlayerEvents.loggedIn(event => {
    scanPlayer(event.player)
  })
})()
