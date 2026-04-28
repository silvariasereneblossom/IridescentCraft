// =============================================================================
// RESPAWN HUNGER RESET — drumsticks set to a fixed value on respawn
// =============================================================================
// Vanilla Minecraft restores hunger to 20 (full) on respawn. Pairs poorly
// with the pack's hunger-tax tone (Sleep Hunger costs 6 per sleep, food-
// variety milestones encourage food-hunting). Setting respawn hunger to 6
// (3 drumsticks) forces an early eat after death — meaningful tax without
// being punishing enough to softlock.
//
// 6 / 20 hunger means:
//   - Player can sprint and regen for a short window after respawn
//   - Will drop into the "Hungry" effect threshold (10 in Hungeroverhaul) quickly
//   - Below 6 they hit the Sleep Hunger gate (4) and can't sleep
//
// Saturation also reset to 0 — they get the full hunger drain curve from
// the start, no "free" buffer.
//
// Uses PlayerEvents.respawned which fires after player respawn entity is
// fully constructed; setFoodLevel + setSaturation work cleanly there.
// =============================================================================

const RESPAWN_HUNGER     = 6   // 3 drumsticks
const RESPAWN_SATURATION = 0   // empty saturation buffer

try {
  PlayerEvents.respawned(function(event) {
    try {
      var player = event.player
      if (!player) return
      // Skip in creative/spectator — the user is debugging or testing
      if (player.isCreative() || player.isSpectator()) return

      player.foodData.setFoodLevel(RESPAWN_HUNGER)
      player.foodData.setSaturation(RESPAWN_SATURATION)
    } catch (e) {
      console.warn('[respawn_hunger] handler threw: ' + e)
    }
  })

  console.log('[IridescentCraft] respawn_hunger loaded — respawn sets food=' + RESPAWN_HUNGER + ', saturation=' + RESPAWN_SATURATION)
} catch (e) {
  console.warn('[IridescentCraft] respawn_hunger bootstrap FAILED: ' + e)
}
