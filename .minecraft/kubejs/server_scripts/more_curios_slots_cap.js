// =============================================================================
// MORE CURIOS SLOTS — per-slot +3 cap enforcement
// =============================================================================
// The mod's ExtraSlotItem right-click permanently adds +1 to the target slot
// via Curios' addPermanentSlotModifier and consumes the item. Without a cap
// a player can just keep crafting and using them until a slot has a dozen
// entries. Tester wants each slot bucket limited to +3 over baseline.
//
// Implementation: ItemEvents.firstRightClicked handler per slot item checks
// a persistentData counter keyed by slot type. If the counter is already
// at 3, we cancel the interaction BEFORE the mod's item.use() runs, so the
// stack isn't consumed and the mod doesn't grant the modifier. Otherwise
// we bump the counter and let the mod handle the actual slot grant.
//
// Slots we keep (per tester 2026-04-22): curio, ring, necklace, bracelet,
//                                        belt, back, body, charm, spellstone.
// Removed from craftable: head, hands, feet (recipes disabled via
// data/more_curios_slots/recipes/ overrides).
// =============================================================================

// Per-slot cap overrides. Default is +3 across the board; `back` is
// capped at +1 per tester 2026-04-22 — back slot items (Sophisticated
// Backpacks, capes, wings, Relics shields) are big, so only one extra
// addon is allowed there.
const ICRAFT_DEFAULT_CAP = 3
const ICRAFT_SLOT_CAPS = {
  curio: 3,
  ring: 3,
  necklace: 3,
  bracelet: 3,
  belt: 3,
  back: 1,
  body: 3,
  charm: 3,
  spellstone: 3
}
const ICRAFT_SLOTS = Object.keys(ICRAFT_SLOT_CAPS)

ICRAFT_SLOTS.forEach(function(slot) {
  const itemId = 'more_curios_slots:extra_' + slot + '_slot'
  const flagKey = 'icraft_slot_bonus_' + slot
  const cap = ICRAFT_SLOT_CAPS[slot] || ICRAFT_DEFAULT_CAP

  ItemEvents.firstRightClicked(itemId, event => {
    try {
      var player = event.player
      if (!player || player.level.isClientSide) return  // CI-ignore: Level.isClientSide is a public final boolean field, not a method
      var current = player.persistentData.getInt(flagKey)
      if (current >= cap) {
        event.cancel()
        player.tell(
          '\u00a7c[Curios Slot]\u00a7r Your \u00a7e' + slot +
          '\u00a7r slot has already reached the \u00a7c+' + cap +
          '\u00a7r cap. Extra slot item not consumed.'
        )
        return
      }
      player.persistentData.putInt(flagKey, current + 1)
      console.log('[icraft/curios-cap] ' + player.username + ' used extra_' + slot +
                  '_slot (now at +' + (current + 1) + ' of +' + cap + ')')
    } catch (e) {
      console.warn('[icraft/curios-cap] handler threw for ' + itemId + ': ' + e)
    }
  })
})

console.log('[IridescentCraft] More Curios Slots cap handler loaded (' +
            ICRAFT_SLOTS.length + ' slot types; back=+1, others=+3)')
