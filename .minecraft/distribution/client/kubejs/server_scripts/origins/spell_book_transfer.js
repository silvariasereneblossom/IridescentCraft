// =============================================================================
// MODULAR SPELL BOOK — preserve inscribed spells through Tetra replacement
// =============================================================================
// When a vanilla ISS / Ars spell book is replaced with our modular item via
// Tetra's tetra:replacements system, the input book's NBT (including
// `ISB_Spells` for ISS, the inscribed spell list) is consumed and would
// otherwise be lost. This script bridges that gap.
//
// Mechanism:
//   1. ServerEvents.tick — once per tick, snapshot each player's inventory
//      slots that hold a vanilla ISS / Ars spell book WITH non-empty spell
//      NBT. Snapshot keyed by username + slot index.
//   2. PlayerEvents.inventoryChanged — when a slot now contains a
//      `iridescent_modular_spells:modular_spell_book` (or the ars variant)
//      AND the previous-tick snapshot for that same slot held a vanilla
//      spell book with spells, copy those spells to the modular item.
//
// Snapshot order: the tick handler updates AFTER the tick's main logic, so
// when inventoryChanged fires during tick T, we read the snapshot from T-1
// — which represents the inventory state *before* the replacement.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks).
// =============================================================================

try {
  var MODULAR_ISS = 'iridescent_modular_spells:modular_spell_book'
  var MODULAR_ARS = 'iridescent_modular_spells:modular_ars_spell_book'

  // username -> { slotIndex: { id, isb_spells_nbt_string } }
  var inventorySnapshots = {}

  var isVanillaSpellBook = function(itemId) {
    if (!itemId) return false
    if (itemId.indexOf('irons_spellbooks:') === 0 && itemId.indexOf('_spell_book') >= 0) return true
    if (itemId.indexOf('ars_nouveau:') === 0 && itemId.indexOf('_spell_book') >= 0) return true
    return false
  }

  ServerEvents.tick(function(event) {
    // Run every 2 ticks — frequent enough to catch replacements, cheap enough
    // not to be a hotspot. (Tetra replacements happen on inventory tick which
    // is once per server tick, so 2-tick poll is sufficient.)
    if (event.server.tickCount % 2 !== 0) return

    event.server.players.forEach(function(player) {
      var name = player.username
      var snap = {}
      var inv = player.inventory
      try {
        var size = inv.getContainerSize ? inv.getContainerSize() : 41
        for (var i = 0; i < size; i++) {
          var stack = inv.getStackInSlot(i)
          if (!stack || stack.isEmpty()) continue
          var id = String(stack.getItem().builtInRegistryHolder().key().location())
          if (!isVanillaSpellBook(id)) continue
          var nbt = stack.getTag()
          if (!nbt) continue
          // ISS spell list lives at .ISB_Spells. Ars Nouveau uses different keys —
          // for now only handle ISS. (Ars's spell-on-book NBT can be added later.)
          if (!nbt.contains('ISB_Spells')) continue
          snap[i] = {
            id: id,
            spells: String(nbt.getCompound('ISB_Spells'))
          }
        }
      } catch (e) {}
      inventorySnapshots[name] = snap
    })
  })

  PlayerEvents.inventoryChanged(function(event) {
    try {
      var item = event.item
      if (!item || item.isEmpty()) return
      var id = String(item.getItem().builtInRegistryHolder().key().location())
      if (id !== MODULAR_ISS && id !== MODULAR_ARS) return

      var player = event.player
      var slot = event.slot
      var name = player.username
      var snap = inventorySnapshots[name] || {}
      var prev = snap[slot]
      if (!prev) return

      // Don't re-copy if already done.
      var nbt = item.getTag()
      if (nbt && nbt.getBoolean('icraft_spells_transferred')) return

      // Parse the cached ISB_Spells NBT (string form) and write it to the new item.
      var NbtUtils = Java.loadClass('net.minecraft.nbt.NbtUtils')
      var spellsCompound = NbtUtils.snbtToStructure
        ? null  // snbtToStructure is for structures, not the path we want
        : null
      var TagParser = Java.loadClass('net.minecraft.nbt.TagParser')
      var parsedSpells = TagParser.parseTag(prev.spells)

      var newNbt = item.getOrCreateTag()
      newNbt.put('ISB_Spells', parsedSpells)
      newNbt.putBoolean('icraft_spells_transferred', true)

      console.log('[spell_book_transfer] ' + name + ': copied spells from ' + prev.id +
                  ' (slot ' + slot + ') to ' + id)
    } catch (e) {
      console.warn('[spell_book_transfer] inventoryChanged threw: ' + e)
    }
  })

  // Clear snapshot on disconnect to avoid stale memory.
  PlayerEvents.loggedOut(function(event) {
    try { delete inventorySnapshots[event.player.username] } catch (e) {}
  })

  console.log('[IridescentCraft] spell_book_transfer loaded — ISB_Spells NBT preserved through Tetra replacement')
} catch (e) {
  console.warn('[IridescentCraft] spell_book_transfer bootstrap FAILED: ' + e)
}
