// =============================================================================
// MUTANT MONSTERS -- block-break suppression
// =============================================================================
// 2026-04-26 user directive: mutant zombies pillar terrain and mutant
// creepers crater the landscape even with mobGriefing=false (already
// shipped as a one-shot world default). The mod's pillar/explosion logic
// uses Level.destroyBlock() directly, which bypasses the gamerule.
//
// Surgical fix: cancel any block-break event whose breaker entity is
// in the mutantmonsters: namespace. Two-line filter, exact namespace
// check -- zero false-positives.
//
// Effects:
//   - mutant zombie's pillar-up no longer destroys terrain (still attacks)
//   - mutant creeper's charged explosion no longer craters (still damages)
//   - mutant enderman's block-tossing suppressed
//   - any future mutantmonsters:* entity that attempts block-breaks
//
// What still works (intentional):
//   - mob-vs-player damage (the mutants stay dangerous)
//   - mutant explosion VFX (cosmetic, no terrain impact)
//   - spider-pig (friendly, never breaks blocks anyway)
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks).
// =============================================================================

try {
  BlockEvents.broken(function(event) {
    try {
      var ent = event.entity
      if (!ent) return
      var type = ent.type
      if (typeof type !== 'string') return
      if (type.indexOf('mutantmonsters:') !== 0) return
      event.cancel()
    } catch (e) {
      console.warn('[mutant_no_griefing] handler threw: ' + e)
    }
  })

  console.log('[IridescentCraft] mutant_monsters_no_griefing loaded -- mutantmonsters:* block breaks suppressed')
} catch (e) {
  console.warn('[IridescentCraft] mutant_monsters_no_griefing bootstrap FAILED: ' + e)
}
