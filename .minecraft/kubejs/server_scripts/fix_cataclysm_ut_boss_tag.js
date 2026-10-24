// @file kubejs/server_scripts/fix_cataclysm_ut_boss_tag.js
// @events ServerEvents.tags
// =============================================================================
// The cataclysm_ut add-on's boss tag names an entity this pack does not have: that one dead entry is taken out.
// =============================================================================
// cataclysm_ut (cataclysm_ut-53 - 1.20.1.jar) was written for another version of L_Ender's Cataclysm. Its own
// data/forge/tags/entity_types/bosses.json lists cataclysm:old_netherite_monstrosity, which no mod of this pack
// registers, so every boot printed one ERROR line (Load My Fucking Tags skips the entry and goes on):
//   [Load My Fucking Tags] Couldn't load certain entries with the tag forge:bosses: cataclysm:old_netherite_monstrosity
// The entry never resolved, so #forge:bosses holds the same entity types with it or without it: this only stops
// the line. A datapack cannot take one entry out of another pack's tag file (only "replace", which would empty the
// whole tag), and the jar is left as it is. The add-on's dead functions and advancement were trimmed earlier, as
// empty copies under kubejs/data/cataclysm_ut (pack 7453b9da, sheet 2026-10-11 G16).
// Operator ruling 2026-10-24, on what to do with the last line: "Let's patch the addon".
// =============================================================================

;(function () {
  ServerEvents.tags('entity_type', icraft.guard('fix_cataclysm_ut_boss_tag', 'ServerEvents.tags', function (event) {
    event.remove('forge:bosses', 'cataclysm:old_netherite_monstrosity')
  }))
})()
