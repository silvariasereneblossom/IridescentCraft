// @file kubejs/server_scripts/origins/spell_book_transfer.js
// @events PlayerEvents.inventoryChanged, PlayerEvents.loggedOut, tick.player
// =============================================================================
// MODULAR SPELL BOOK — preserve inscribed spells through Tetra replacement
// =============================================================================
// When a vanilla ISS / Ars spell book is replaced with our modular item via
// Tetra's tetra:replacements system, the input book's NBT (including
// `ISB_Spells` for ISS, the inscribed spell list) is consumed and would
// otherwise be lost. This script bridges that gap.
//
// Mechanism:
//   1. Every 2 ticks per player, snapshot the inventory slots that hold a
//      vanilla ISS / Ars spell book WITH non-empty spell NBT. Snapshot keyed
//      by username + slot index.
//   2. PlayerEvents.inventoryChanged — when a slot now contains a
//      `iridescent_modular_spells:modular_spell_book` (or the ars variant)
//      AND the previous snapshot for that same slot held a vanilla spell book
//      with spells, copy those spells to the modular item.
//
// Snapshot order: the snapshot is refreshed from the player tick, so when
// inventoryChanged fires it still holds the previous poll's view, i.e. the
// inventory state *before* the replacement.
//
// 2026-10-10 -- COST ONLY, the decisions are unchanged (same items, same NBT
// key, same slot keys). The snapshot used to walk all 41 slots of every player
// every 2 ticks from a raw ServerEvents.tick, building each stack's registry id
// as a string (stack -> item -> holder -> key -> location -> toString) just to
// test it for "_spell_book". Now:
//   * the set of vanilla spell-book items is resolved ONCE from the item
//     registry into an Ingredient;
//   * one native call (inventory.find(ingredient)) answers "does this player
//     carry a vanilla spell book at all?". Without one the snapshot is simply
//     emptied -- no slot walk. That is the normal case;
//   * with one, slots are tested natively against the same Ingredient, and the
//     id string is only built for a slot that passes;
//   * the poll is a master-dispatched player tick (0_tick_master.js) instead of
//     a second ServerEvents.tick subscription;
//   * the inventoryChanged handler (every slot change of every player) tests
//     "is this a modular book?" natively as well.
// If the Ingredient route is unavailable the old full walk is used instead
// (logged once), so the worst case is the old cost, never a missed snapshot.
//
// KNOWN LIMITS (found while reading this file; NOT changed here -- report):
//   * `ISB_Spells` is Iron's Spellbooks' LEGACY container key. ISS 3.15 stores
//     spells under "irons_spellbooks:spell_container", so no current book has
//     the key and no snapshot entry is ever created.
//   * the snapshot is keyed by INVENTORY slot (0-40) while
//     inventoryChanged's `slot` is the open MENU's slot index; they only agree
//     for the 27 main-inventory slots of the player's own inventory screen.
//   Making this feature live needs both resolved, plus a guard against copying
//   spells onto a modular book that is merely swapped into a slot a vanilla
//   book just left (that would duplicate the spells).
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks).
// Whole file is one IIFE: server scripts share a single Rhino scope.
// =============================================================================

;(function () {
  var MODULAR_ISS = 'iridescent_modular_spells:modular_spell_book'
  var MODULAR_ARS = 'iridescent_modular_spells:modular_ars_spell_book'
  // The container key the snapshot looks for (see KNOWN LIMITS).
  var SPELLS_KEY = 'ISB_Spells'

  // username -> { slotIndex: { id, spells } }
  var inventorySnapshots = {}

  // once per failing block per script load: the table and the wording of "once" are
  // global.icraft.core.warnOnce's (0_lib_core.js); this only adds the script's name
  var warnKeyed = function (key, message) {
    global.icraft.core.warnOnce('origins/spell_book_transfer:' + key, '[spell_book_transfer] ' + message)
  }

  var isVanillaSpellBook = function (itemId) {
    if (!itemId) return false
    if (itemId.indexOf('irons_spellbooks:') === 0 && itemId.indexOf('_spell_book') >= 0) return true
    if (itemId.indexOf('ars_nouveau:') === 0 && itemId.indexOf('_spell_book') >= 0) return true
    return false
  }

  var stackId = function (stack) {
    return String(stack.getItem().builtInRegistryHolder().key().location())
  }

  // ── The vanilla spell-book set, resolved once ──────────────────────────────
  //   false = not resolved yet, null = unavailable (fall back to the full walk)
  var books = false
  var resolveBooks = function () {
    if (books !== false) return books
    try {
      var ids = []
      var all = Item.getTypeList()
      var n = all.size()
      for (var i = 0; i < n; i++) {
        var id = String(all.get(i))
        if (isVanillaSpellBook(id)) ids.push(id)
      }
      books = (ids.length > 0) ? Ingredient.of(ids) : null
      if (ids.length === 0) warnKeyed('none', 'no vanilla spell-book items in the item registry')
    } catch (e) {
      books = null
      warnKeyed('resolve', 'could not pre-resolve the spell-book set, using the full slot walk: ' + e)
    }
    return books
  }

  // One slot -> snapshot entry or null. Same test as before: a vanilla ISS/Ars
  // spell book whose NBT carries SPELLS_KEY.
  var snapshotEntry = function (stack) {
    var id = stackId(stack)
    if (!isVanillaSpellBook(id)) return null
    var nbt = stack.nbt
    if (!nbt) return null
    // ISS spell list lives at .ISB_Spells. Ars Nouveau uses different keys —
    // for now only handle ISS. (Ars's spell-on-book NBT can be added later.)
    if (!nbt.contains(SPELLS_KEY)) return null
    return { id: id, spells: String(nbt.getCompound(SPELLS_KEY)) }
  }

  var snapshotPlayer = function (player) {
    var name = String(player.username)
    var snap = {}
    var inv = player.inventory
    try {
      var set = resolveBooks()
      // No vanilla spell book anywhere in the inventory: nothing to snapshot.
      var present = true
      if (set) {
        try { present = inv.find(set) >= 0 } catch (e) {
          books = null
          set = null
          warnKeyed('find', 'inventory.find(ingredient) failed, using the full slot walk: ' + e)
        }
      }
      if (present) {
        var size = inv.getContainerSize ? inv.getContainerSize() : 41
        for (var i = 0; i < size; i++) {
          var stack = inv.getStackInSlot(i)
          if (!stack || stack.isEmpty()) continue
          if (set && !set.test(stack)) continue
          var entry = snapshotEntry(stack)
          if (entry) snap[i] = entry
        }
      }
    } catch (e2) {}
    inventorySnapshots[name] = snap
  }

  // Every 2 ticks per player — frequent enough to catch replacements, cheap
  // enough not to be a hotspot.
  global.registerPlayerTick('tick_spellBookSnapshot', 2, 0, function (event) {
    var player = event.player
    if (!player) return
    snapshotPlayer(player)
  })

  // "Is this one of the two modular books?" -- asked on every inventory change
  // of every player, so it is a native Ingredient test too (the id string is the
  // fallback).
  var modularSet = false
  var isModularBook = function (stack) {
    if (modularSet === false) {
      try { modularSet = Ingredient.of([MODULAR_ISS, MODULAR_ARS]) } catch (e) { modularSet = null }
    }
    if (modularSet) {
      try { return modularSet.test(stack) === true } catch (e2) { modularSet = null }
    }
    var id = stackId(stack)
    return id === MODULAR_ISS || id === MODULAR_ARS
  }

  PlayerEvents.inventoryChanged(icraft.guard('origins/spell_book_transfer', 'PlayerEvents.inventoryChanged', function (event) {
    try {
      var item = event.item
      if (!item || item.isEmpty()) return
      if (!isModularBook(item)) return
      var id = stackId(item)

      var player = event.player
      var slot = event.slot
      var name = String(player.username)
      var snap = inventorySnapshots[name] || {}
      var prev = snap[slot]
      if (!prev) return

      // Don't re-copy if already done.
      var nbt = item.nbt
      if (nbt && nbt.getBoolean('icraft_spells_transferred')) return

      // Parse the cached ISB_Spells NBT (string form) and write it to the new item.
      var TagParser = Java.loadClass('net.minecraft.nbt.TagParser')
      var parsedSpells = TagParser.parseTag(prev.spells)

      var newNbt = item.getOrCreateTag()
      newNbt.put(SPELLS_KEY, parsedSpells)
      newNbt.putBoolean('icraft_spells_transferred', true)

      console.log('[spell_book_transfer] ' + name + ': copied spells from ' + prev.id +
                  ' (slot ' + slot + ') to ' + id)
    } catch (e) {
      warnKeyed('changed', 'inventoryChanged threw: ' + e)
    }
  }))

  // Clear snapshot on disconnect to avoid stale memory.
  PlayerEvents.loggedOut(icraft.guard('origins/spell_book_transfer', 'PlayerEvents.loggedOut', function (event) {
    try { delete inventorySnapshots[String(event.player.username)] } catch (e) {}
  }))

  console.log('[IridescentCraft] spell_book_transfer loaded — ISB_Spells NBT preserved through Tetra replacement')
})()
