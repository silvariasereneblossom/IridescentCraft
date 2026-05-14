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
// Approach: on inventoryChanged + loggedIn, walk player main inventory
// + Curios trinket slots, replace any relics:infinity_ham stack with
// air. Idempotent and silent unless the script actually removes something.
//
// Pairs with:
//   client_scripts/jei_hiding.js  -- hide from JEI search
//   config/relics/infinity_ham.json -- loot.entries={} + abilities zeroed
// =============================================================================

var stripStack = function(player, stack, where) {
  if (!stack || stack.isEmpty()) return false
  try {
    var id = String(stack.getItem().builtInRegistryHolder().key().location())
    if (id !== 'relics:infinity_ham') return false
    stack.setCount(0)
    if (!global._infinity_ham_seen) {
      global._infinity_ham_seen = true
      console.log('[strip_infinity_ham] removed from ' + player.username +
                  ' (' + where + ', logging once)')
    }
    return true
  } catch (e) { return false }
}

var scanPlayer = function(player) {
  if (!player) return
  // Main inventory (36 slots) + offhand
  try {
    var inv = player.getInventory()
    if (inv) {
      for (var i = 0; i < inv.getContainerSize(); i++) {
        stripStack(player, inv.getItem(i), 'slot ' + i)
      }
    }
  } catch (e) {}
  // Curios slots (if curios loaded)
  try {
    var curios = Java.loadClass('top.theillusivec4.curios.api.CuriosApi')
    var capOpt = curios.getCuriosHelper().getCuriosHandler(player)
    if (capOpt.isPresent()) {
      var handler = capOpt.get()
      var slots = handler.getCurios()
      var iter = slots.values().iterator()
      while (iter.hasNext()) {
        var slot = iter.next()
        var inv = slot.getStacks()
        for (var i = 0; i < inv.getSlots(); i++) {
          stripStack(player, inv.getStackInSlot(i), 'curio:' + slot.getIdentifier() + '/' + i)
        }
      }
    }
  } catch (e) {
    // Curios API surface varies; ignore reflection failures
  }
}

PlayerEvents.inventoryChanged(event => {
  scanPlayer(event.player)
})

PlayerEvents.loggedIn(event => {
  scanPlayer(event.player)
})
