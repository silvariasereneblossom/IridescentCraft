// =============================================================================
// MOBGRIEFING DEFAULT FALSE -- one-shot world initialization
// =============================================================================
// 2026-04-26 user directive: 'mobgriefing false should be a default config'.
//
// Vanilla world creation defaults mobGriefing=true. We override on first
// world load to false. Player can manually re-enable via /gamerule
// mobGriefing true; we don't fight that -- the override is gated by a
// persistent flag so it only fires once per world.
//
// Effects of mobGriefing=false:
//   - Creepers don't break blocks (still damage entities)
//   - Endermen don't pick up blocks
//   - Wither doesn't break blocks during boss fight
//   - Ravagers don't smash leaves
//   - Withers/Ender Dragon block destruction suppressed
//   - Villager farming via mob actions (zombies pillaging, etc.) blocked
//
// Trade-off the user accepted: cleaner bases at the cost of some
// emergent gameplay (e.g., creeper-as-mining-tool patterns). Most
// players want this.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks).
// =============================================================================

try {
  var GameRules_mg = Java.loadClass('net.minecraft.world.level.GameRules')

  ServerEvents.loaded(function(event) {
    try {
      var server = event.server
      var ow = server.overworld()
      if (!ow) return

      // One-shot guard
      var pdata = null
      try { pdata = ow.getPersistentData ? ow.getPersistentData() : null } catch (_) {}
      if (pdata && pdata.contains('icraft_mobgriefing_default_set')) {
        // Already initialized -- respect any subsequent manual /gamerule changes
        return
      }

      var rules = server.getGameRules()
      var rule = rules.getRule(GameRules_mg.RULE_MOBGRIEFING)
      var current = rule.get()
      if (current) {
        rule.set(false, server)
        console.log('[mobgriefing_default] set mobGriefing=false (was true) on first world load')
      } else {
        console.log('[mobgriefing_default] mobGriefing already false; no change')
      }

      try {
        if (pdata) pdata.putBoolean('icraft_mobgriefing_default_set', true)
      } catch (_) {}
    } catch (e) {
      console.warn('[mobgriefing_default] handler threw: ' + e)
    }
  })

  console.log('[IridescentCraft] mobgriefing_default loaded -- one-shot mobGriefing=false on world init')
} catch (e) {
  console.warn('[IridescentCraft] mobgriefing_default bootstrap FAILED: ' + e)
}
