// =============================================================================
// STRIP TMB BOW RECIPES — full Simply Swords parity (boss-exclusive, uncraftable)
// =============================================================================
// Operator (2026-06-03) chose "full SS parity" for Too Many Bows. Simply Swords
// uniques are boss-drop-only AND have their craft recipes stripped; this gives
// the TMB bows the same treatment so a bow is a genuine boss trophy, not a craft.
//
// Several TMB bows ship craft recipes (crimson_nexus, dusk_reaper, ethereal_hunter,
// frostbite, hunter_bow, ironclad, necro, radiance, sage, sentinel_wrath,
// shulker_blast, twin_shadows, verdant_vigor, ...). We remove ANY recipe whose
// output is a registered TMB bow (data-driven from global.ICRAFT_TMB_BOWS). The
// bow REAGENT recipes (power_crystal / rift_shard / soul_fragment) are left intact
// — they're harmless and may feed other uses.
//
// REVERSIBLE: delete this file to restore craftable TMB bows.
// =============================================================================

ServerEvents.recipes(event => {
  const bows = global.ICRAFT_TMB_BOWS || []
  if (!bows.length) { console.warn('[strip_tmb_bow_recipes] no bow list — nothing removed'); return }
  let n = 0
  bows.forEach(b => {
    try { event.remove({ output: b }); n++ } catch (e) {}
  })
  console.log('[strip_tmb_bow_recipes] removed craft recipes for ' + n + ' boss-exclusive TMB bows')
})
