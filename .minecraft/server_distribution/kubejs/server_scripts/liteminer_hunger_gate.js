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
// [2026-06-08 REFINEMENT — operator report] The old gate used ONLY a timing
// heuristic (≤8 ticks between breaks = "chain"), with no check on WHAT broke.
// That made it fire on hand-clearing instant-break blocks (grass, leaves,
// flowers) — which break faster than the window — while potentially MISSING
// real ore/stone veins, because Liteminer's `harvest_time_per_block_modifier
// = 2.0` makes hard blocks break SLOWER than the 8-tick window. Backwards.
//
// Fix: gate only blocks worth vein-mining (a VALUE allowlist: ores, logs,
// bulk stone). Two payoffs at once — (1) low-leverage clearage (grass/dirt/
// leaves) is NEVER gated regardless of speed; (2) hard blocks are exactly
// where the timing heuristic is RELIABLE (you can't hand-break stone in <8
// ticks, a vein can), so we widen the window slightly to catch the 2x-slowed
// hard-block chains the old value would miss. A break is gated only when it
// is BOTH a rapid chain continuation AND a vein-worthy block AND the player
// is hungry — so a single manual ore swing while starving is still allowed.
//
// Threshold: 6 / 20 hunger — same as Sleep Hunger's gate. "If you can't
// sleep, you can't vein."  isVeinTarget fail-OPEN on any tag error (a missed
// modded ore just veinmines without the food cost — safe direction; never
// blocks clearage).
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks).
// =============================================================================

const HUNGER_THRESHOLD     = 6   // hard floor — below this, chains cancel
const CHAIN_WINDOW_TICKS   = 12  // widened from 8: 2x harvest modifier slows
                                 // hard-block veins; safe now that soft
                                 // clearage is filtered by isVeinTarget()
const NOTIFY_COOLDOWN_TICKS = 100 // 5s between "too hungry" chat messages

// Vein-worthy block tags — the gate ONLY applies to these. Everything else
// (grass, leaves, flowers, crops, dirt, sand, gravel, netherrack, snow...)
// is low-leverage clearage and is never gated. Ores + logs + bulk stone are
// what Liteminer is actually used to chain at scale.
const VEIN_TARGET_TAGS = [
  'forge:ores',
  'minecraft:logs',                 // (logs_that_burn is a subset)
  'minecraft:base_stone_overworld', // stone, granite, diorite, andesite, tuff, deepslate
  'minecraft:base_stone_nether',    // netherrack, basalt, blackstone
  'forge:stone'
]

var isVeinTarget = function(block) {
  try {
    for (var i = 0; i < VEIN_TARGET_TAGS.length; i++) {
      if (block.hasTag(VEIN_TARGET_TAGS[i])) return true
    }
  } catch (e) { /* tag lookup failed -> fail open (not a target) */ }
  return false
}

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

      // Update last break tick before any cancellation logic. We advance it
      // on EVERY break (even clearage) so a grass-then-ore sequence doesn't
      // falsely read the ore as a chain start; the gate decision itself is
      // still scoped to vein targets below.
      st.lastBreakTick = now

      // Only gate vein-worthy blocks — low-leverage clearage is exempt.
      if (inChain && isVeinTarget(event.block)) {
        // Chain continuation on a real vein target — gate by hunger
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
