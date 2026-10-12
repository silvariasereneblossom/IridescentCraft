// =============================================================================
// MORE CURIOS SLOTS — per-slot +3 cap enforcement
// =============================================================================
// The mod's ExtraSlotItem right-click permanently adds +1 to the target slot
// via Curios' addPermanentSlotModifier and consumes the item. Without a cap
// a player can just keep crafting and using them until a slot has a dozen
// entries. Tester wants each slot bucket limited to +3 over baseline.
//
// Implementation: an ItemEvents.rightClicked handler per slot item. If the slot
// is already at its cap we cancel the interaction BEFORE the mod's item.use()
// runs, so the stack isn't consumed and the mod doesn't grant the modifier.
// Otherwise the mod handles the actual slot grant. (ExtraSlotItem.use() is
// server-only — jar-verified — so a server-side cancel leaves no client ghost.)
//
// "Already at its cap" is read from Curios itself: the number of permanent
// "Extra <Slot> Slot" modifiers the mod has put on that slot (so slots a player
// unlocked before this handler worked count too). A persistentData counter per
// slot (icraft_slot_bonus_<slot>) is kept alongside as the fallback for when
// the Curios read fails. Set ICRAFT_SLOT_CAP_COUNT_LIVE = false to go back to
// the counter-only behaviour (every player then gets +cap from today's state).
//
// 2026-10-10 — this cap never enforced anything before this date (all four
// causes jar-verified against KubeJS 2001.6.5-build.16 / Rhino 2001.2.3):
//   1. It listened on ItemEvents.firstRightClicked, which the server only
//      receives when the CLIENT's JVM has a firstRightClicked listener of its
//      own (KubeJS FirstClickMessage) — a dedicated-server client has none.
//   2. firstRightClicked has no result: it cannot be cancelled.
//   3. event.cancel() (which works by throwing) sat inside the try/catch.
//   4. The guard `player.level.isClientSide` (no parentheses) is ALWAYS truthy
//      in Rhino — Level has both a field and a method of that name, and the
//      bare member is a function object — so the handler returned immediately.
// Now: ItemEvents.rightClicked (cancellable, fires server-side from Forge's
// RightClickItem before Item.use()), decide inside the try, cancel after it.
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
// true = count the slots Curios says the player already unlocked (see header).
const ICRAFT_SLOT_CAP_COUNT_LIVE = true

// (IIFE — every server script shares one Rhino scope; keep the helpers local.)
;(function () {
  var CuriosApi_mcs = null
  try { CuriosApi_mcs = Java.loadClass('top.theillusivec4.curios.api.CuriosApi') } catch (e) {}

  // Number of "+1 <slot>" grants the mod has already applied to this player:
  // More Curios Slots adds one permanent slot modifier named "Extra <Slot> Slot"
  // (amount 1.0) per use. Returns -1 when Curios can't be read.
  var liveExtraSlots = function (player, slot) {
    if (!ICRAFT_SLOT_CAP_COUNT_LIVE || !CuriosApi_mcs) return -1
    try {
      var inv = CuriosApi_mcs.getCuriosInventory(player).orElse(null)   // LazyOptional
      if (!inv) return -1
      var stacksHandler = inv.getStacksHandler(slot).orElse(null)       // java.util.Optional
      if (!stacksHandler) return -1
      var total = 0
      var it = stacksHandler.getPermanentModifiers().iterator()
      while (it.hasNext()) {
        var mod = it.next()
        var name = String(mod.getName())
        if (name.indexOf('Extra ') === 0 && name.indexOf(' Slot') > 0) {
          total += mod.getAmount()
        }
      }
      return Math.round(total)
    } catch (e) {
      return -1
    }
  }

  // username -> server tick of the last "cap reached" chat line (in-memory only).
  var lastDenyNotice = {}

  ICRAFT_SLOTS.forEach(function (slot) {
    var itemId = 'more_curios_slots:extra_' + slot + '_slot'
    var flagKey = 'icraft_slot_bonus_' + slot
    var cap = ICRAFT_SLOT_CAPS[slot] || ICRAFT_DEFAULT_CAP

    ItemEvents.rightClicked(itemId, icraft.guard('more_curios_slots_cap', 'ItemEvents.rightClicked', event => {
      // RHINO: declared OUTSIDE the try — a `var` declared inside a block is
      // scoped to that block in this Rhino build.
      var deny = false
      try {
        var player = event.player
        if (player) {
          var pd = player.persistentData
          var live = liveExtraSlots(player, slot)
          var current = live >= 0 ? live : pd.getInt(flagKey)
          if (current >= cap) {
            deny = true
            // Holding right-click re-fires the use every few ticks: one notice per 2 s.
            var who = String(player.username)
            var now = player.server.tickCount
            var told = lastDenyNotice.hasOwnProperty(who) ? lastDenyNotice[who] : -1000
            if (now - told >= 40 || now < told) {
              lastDenyNotice[who] = now
              player.tell(
                '\u00a7c[Curios Slot]\u00a7r Your \u00a7e' + slot +
                '\u00a7r slot has already reached the \u00a7c+' + cap +
                '\u00a7r cap. Extra slot item not consumed.'
              )
            }
          } else {
            pd.putInt(flagKey, current + 1)
            console.log('[icraft/curios-cap] ' + player.username + ' used extra_' + slot +
                        '_slot (now at +' + (current + 1) + ' of +' + cap + ')')
          }
        }
      } catch (e) {
        if (!global._curios_cap_warned) {
          global._curios_cap_warned = true
          console.warn('[icraft/curios-cap] handler threw for ' + itemId + ' (logging once): ' + e)
        }
      }
      // cancel() unwinds by throwing KubeJS' EventExit — it must stay outside the try.
      if (deny) event.cancel()
    }))
  })
})()

console.log('[IridescentCraft] More Curios Slots cap handler loaded (' +
            ICRAFT_SLOTS.length + ' slot types; back=+1, others=+3)')
