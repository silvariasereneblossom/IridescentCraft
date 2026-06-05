// =============================================================================
// LITEMINER HUNGER GATE — vein-mining requires food
// =============================================================================
// Liteminer (mod liteminer-forge-1.20.1-1.0.0) chains block breaks when the
// player holds the configured keybind. Built-in `food_exhaustion = 0.2` per
// block is a soft tax — a full 64-block chain only burns ~3 hunger points,
// barely noticeable. We want a HARD GATE: if the player drops below
// HUNGER_THRESHOLD mid-chain or starts a chain hungry, the next break gets
// cancelled and the chain stops.
//
// Detection: BlockEvents.broken fires once per block in a Liteminer chain,
// in quick succession (≤2 ticks apart in practice). Track per-player
// last-break-tick. If the previous break was within CHAIN_WINDOW_TICKS,
// treat this as a chain continuation and apply the food gate. Single
// manual mines (>3s between breaks) are unaffected.
//
// Threshold: 6 / 20 hunger — same as Sleep Hunger's gate (hunger needed
// for sleep). "If you can't sleep, you can't vein."
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks).
// =============================================================================

const HUNGER_THRESHOLD     = 6   // hard floor — below this, chains cancel
const CHAIN_WINDOW_TICKS   = 8   // ≤8 ticks (0.4s) between breaks = chain
const NOTIFY_COOLDOWN_TICKS = 100 // 5s between "too hungry" chat messages

try {
  // username -> { lastBreakTick, lastNotifyTick }
  var liteminerState = {}

  BlockEvents.broken(function(event) {
    var shouldCancel = false
    try {
      var player = event.player
      if (!player) return
      // Only gate survival/adventure
      if (player.isCreative() || player.isSpectator()) return

      var name = player.username
      var now = player.server.tickCount
      var st = liteminerState[name] || { lastBreakTick: 0, lastNotifyTick: 0 }

      var sincePrev = now - st.lastBreakTick
      var inChain = (st.lastBreakTick > 0) && (sincePrev <= CHAIN_WINDOW_TICKS)

      // Update last break tick before any cancellation logic
      st.lastBreakTick = now

      if (inChain) {
        // Chain continuation — gate by hunger
        var foodLevel = 20
        try { foodLevel = player.foodData.foodLevel } catch (e) {}
        if (foodLevel < HUNGER_THRESHOLD) {
          shouldCancel = true
          // Notify (rate-limited)
          if ((now - st.lastNotifyTick) >= NOTIFY_COOLDOWN_TICKS) {
            try {
              player.tell('Too hungry to veinmine. Eat first.')
            } catch (e) {}
            st.lastNotifyTick = now
          }
        }
      }
      // First break of a chain (or manual mining) — never cancelled here.
      // The chain has to ESTABLISH (>1 break in window) before we gate.

      liteminerState[name] = st
    } catch (e) {
      console.warn('[liteminer_hunger_gate] handler threw: ' + e)
    }
    // event.cancel() unwinds by THROWING KubeJS' EventExit; it must reach the
    // dispatcher to take effect. Calling it inside the try above let the broad
    // catch swallow EventExit — logging a spurious "handler threw" on every
    // gated break (53x/session) AND eating the cancel. Cancel outside the try.
    if (shouldCancel) event.cancel()
  })

  // Cleanup state on disconnect
  PlayerEvents.loggedOut(function(event) {
    try { delete liteminerState[event.player.username] } catch (e) {}
  })

  console.log('[IridescentCraft] liteminer_hunger_gate loaded — chain breaks cancel below ' + HUNGER_THRESHOLD + '/20 hunger')
} catch (e) {
  console.warn('[IridescentCraft] liteminer_hunger_gate bootstrap FAILED: ' + e)
}
