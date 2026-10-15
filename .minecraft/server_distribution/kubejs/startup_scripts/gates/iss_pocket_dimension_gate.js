// @file kubejs/startup_scripts/gates/iss_pocket_dimension_gate.js
// @events ForgeEvents.onEvent
// @live pocket-dimension-refused
// =============================================================================
// A player without the tier_4 stage cannot cast the Iron's Spellbooks spell
// Pocket Dimension, from any spellbook, scroll, staff or command.
// =============================================================================
// Ruled by the operator 2026-10-15 ("gate the pocket Dimension spell at T4").
// The spell is the only way into irons_spellbooks:pocket_dimension, a tier-4
// dimension of the registry, and before this gate a tier-1 player could reach
// it (Ancient City echo shards, a tier-1 Scroll Forge, brewable Legendary Ink).
//
// THE HOOK (Iron's Spellbooks 3.15.5.1, read from the jar's bytecode)
//   Every cast a player starts goes through AbstractSpell.attemptInitiateCast,
//   called by the spellbook keybind (Utils.serverSideInitiateCast), Scroll.use,
//   CastingItem.use (staves), the /cast command and ServerPlayerEvents. After
//   its own checks (mana, cooldown, the spell's pre-cast conditions) it posts
//   the cancelable SpellPreCastEvent on the Forge bus and returns false when it
//   is cancelled: no cast starts, no mana or cooldown is spent, a scroll is not
//   used up (Scroll.attemptRemoveScrollAfterCast runs only after a cast). It
//   runs on the server only.
//   ForgeEvents exists in startup scripts only (KubeJS 2001.6.5 binds it there)
//   and registers on the FIRST startup load: a change to this file needs a
//   restart, not a /reload.
//
// NOT COVERED: a spell cast by a mob, and a mod that calls castSpell itself
// without attemptInitiateCast (none known in this pack). The Pocket Dimension
// Portal Frame block is the way OUT of a pocket room (placed by the room's own
// structure, unbreakable, no item), so it is not gated: gating it would trap a
// player inside.
// =============================================================================

;(function () {
  var SPELL = 'irons_spellbooks:pocket_dimension'
  var STAGE = 'tier_4'
  var LOG_MAX = 20
  var logged = 0
  var stageWarned = false

  var hasStage = function (player) {
    try {
      return AStages.playerHasStage(STAGE, player) === true
    } catch (e) {
      // closed when AStages cannot be asked: the spell stays refused, and the log says why (once)
      if (!stageWarned) {
        stageWarned = true
        console.error('[iss_pocket_gate] AStages could not be asked for ' + STAGE + ' (' + e + '); the Pocket Dimension spell is refused to everyone')
      }
      return false
    }
  }

  ForgeEvents.onEvent('io.redspace.ironsspellbooks.api.events.SpellPreCastEvent', icraft.guard('gates/iss_pocket_dimension_gate', 'ForgeEvents.onEvent', function (event) {
    if (String(event.getSpellId()) !== SPELL) return
    var player = event.getEntity()
    if (!player || hasStage(player)) return
    event.setCanceled(true)
    player.setStatusMessage(Text.red('Pocket Dimension is a Tier 4 spell: reach Tier 4 to cast it.'))
    if (logged < LOG_MAX) {
      logged++
      console.info('[iss_pocket_gate] refused ' + SPELL + ' (level ' + event.getSpellLevel() + ', from ' + event.getCastSource() +
        ') to a player without ' + STAGE + (logged === LOG_MAX ? '; the next refusals of this load are not logged' : ''))
    }
    icraft.live.fired('pocket-dimension-refused')
  }))
})()
