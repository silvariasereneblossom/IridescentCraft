// =============================================================================
// STRIP MUTANT MONSTERS RECIPES
// Place in: kubejs/server_scripts/recipes/strip_mutant_monsters.js
// =============================================================================
//
// 2026-05-14: With MM drops stripped via icraft_mm_overrides datapack and
// most MM items hidden from JEI (jei_hiding.js), the 6 hand-craftable
// recipes that turn drops into armor/tools must also go. Hulk Hammer
// (kept as a fun T1 melee drop with modified stats) is NOT crafted --
// it drops directly from mutant_zombie.
//
// Removed:
//   - mutantmonsters:creeper_minion_tracker
//   - mutantmonsters:mutant_skeleton_arms
//   - mutantmonsters:mutant_skeleton_boots
//   - mutantmonsters:mutant_skeleton_chestplate
//   - mutantmonsters:mutant_skeleton_leggings
//   - mutantmonsters:mutant_skeleton_rib_cage
// =============================================================================

ServerEvents.recipes(event => {
  ;[
    'mutantmonsters:creeper_minion_tracker',
    'mutantmonsters:mutant_skeleton_arms',
    'mutantmonsters:mutant_skeleton_boots',
    'mutantmonsters:mutant_skeleton_chestplate',
    'mutantmonsters:mutant_skeleton_leggings',
    'mutantmonsters:mutant_skeleton_rib_cage',
  ].forEach(id => {
    try { event.remove({ id: id }) } catch (e) {}
  })
})
