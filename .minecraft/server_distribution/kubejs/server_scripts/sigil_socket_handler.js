// =============================================================================
// SIGIL OF SOCKETING — USE MECHANIC + TIER CAP
// Place in: kubejs/server_scripts/sigil_socket_handler.js
//
// Implements the right-click-to-apply mechanic for tier-gated Sigils of
// Socketing. Player holds the sigil in their main hand, the gear to be
// socketed in their off hand, and right-clicks. The handler:
//
//   1. Checks the target gear's current socket count (NBT path
//      `affix_data.sockets`, per Apotheosis SocketHelper convention).
//   2. If current < tier cap, increments sockets by 1, consumes the sigil,
//      and sends a confirmation chat message.
//   3. If current >= tier cap, no-op + chat feedback explaining the cap.
//   4. If off-hand is empty / not a gear item, no-op + chat hint.
//
// Cap table per master.md Part XIII §Marquee + appendix §A.4:
//   icraft:sigil_of_socketing_t1     -> 2
//   icraft:sigil_of_socketing_t2     -> 3
//   icraft:sigil_of_socketing_t3     -> 4
//   apotheosis:sigil_of_socketing    -> 5 (Apotheosis-inherent max)
//
// NBT manipulation follows the pattern in apotheosis_gem_repair.js — uses
// stack.nbt + CompoundTag.putInt/put/getCompound/contains. JS-style object
// assignment on CompoundTag does NOT work (Rhino doesn't coerce).
// =============================================================================

var CompoundTag_ss = Java.loadClass('net.minecraft.nbt.CompoundTag')

var SIGIL_CAPS = {
  'icraft:sigil_of_socketing_t1':   2,
  'icraft:sigil_of_socketing_t2':   3,
  'icraft:sigil_of_socketing_t3':   4,
  'apotheosis:sigil_of_socketing':  5
}

function isSocketableTarget(stack) {
  if (!stack || stack.isEmpty()) return false
  // Most gear items have maxStackSize 1; consumables/blocks stack.
  if (stack.getMaxStackSize() > 1) return false
  // Sigils themselves are not valid targets.
  var id = String(stack.id || '')
  if (SIGIL_CAPS[id] != null) return false
  return true
}

function getCurrentSockets(stack) {
  var nbt = stack.nbt
  if (!nbt) return 0
  if (!nbt.contains('affix_data')) return 0
  var affixData = nbt.getCompound('affix_data')
  if (!affixData.contains('sockets')) return 0
  return affixData.getInt('sockets')
}

function setSockets(stack, count) {
  if (!stack.nbt) stack.nbt = new CompoundTag_ss()
  var affixData = stack.nbt.contains('affix_data')
    ? stack.nbt.getCompound('affix_data')
    : new CompoundTag_ss()
  affixData.putInt('sockets', count)
  stack.nbt.put('affix_data', affixData)
}

ItemEvents.firstRightClicked(event => {
  var stack = event.item
  if (!stack || stack.isEmpty()) return
  var id = String(stack.id || '')
  var cap = SIGIL_CAPS[id]
  if (cap == null) return  // not a sigil

  var player = event.player
  if (!player) return
  var offhand = player.getOffhandItem()

  if (!isSocketableTarget(offhand)) {
    player.tell('§c[Sigil] Hold the target gear in your off hand, then right-click with the sigil in main hand.')
    event.cancel()
    return
  }

  var current = getCurrentSockets(offhand)
  if (current >= cap) {
    player.tell('§e[Sigil] §7' + offhand.getHoverName().getString() +
      ' §7already has §f' + current + '§7 sockets. This sigil caps at §f' + cap + '§7.')
    event.cancel()
    return
  }

  setSockets(offhand, current + 1)
  stack.shrink(1)
  player.tell('§a[Sigil] §7+1 socket applied. §f' + offhand.getHoverName().getString() +
    '§7 now has §f' + (current + 1) + ' §7/ §f' + cap + ' §7sockets.')
  event.cancel()
})
