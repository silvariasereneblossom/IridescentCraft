// =============================================================================
// kubejs/server_scripts/compat/terramity_cave_gnome_cave_only.js
//
// Confine Terramity's cave_gnome to CAVES (operator request 2026-06-25).
// Terramity's biome modifier (terramity:cave_gnome_biome_modifier) adds
// cave_gnome to EVERY biome (forge:any, weight 15) as a normal monster, so it
// also spawns out on the surface -- we want it underground only.
//
// Biome modifiers carry no height/sky field, so we gate at spawn-check time:
//   - act ONLY on WILD spawns (MobSpawnType NATURAL). Spawn eggs, the
//     court_of_gnomes structure (a surface random_spread struct), /summon, and
//     spawners are left untouched -- so Gob's court and the diamond->gnome-hat
//     barter still work (see bonfire/gob_t1_rebalance.js for the Gob /
//     royal_gnome content this protects);
//   - deny the spawn when its position can see the sky (surface / exposed);
//     keep it when sky-occluded (a cave).
//
// Uses EntityEvents.checkSpawn (not .spawned) because only checkSpawn carries
// the spawn reason (event.type) AND the spawn-position block (event.block).
// String(...) coerces the vanilla EntityType / MobSpawnType to a JS string for
// the comparisons (the pack's proven idiom -- see apotheosis_gem_repair.js).
// =============================================================================

EntityEvents.checkSpawn(event => {
  if (String(event.entity.type) !== 'terramity:cave_gnome') return
  // Only the wild runtime mob-spawn loop; never eggs / structures / commands.
  if (String(event.type) !== 'NATURAL') return
  // Surface (direct sky access) -> deny; cave (sky-occluded) -> allow.
  if (event.block.canSeeSky) event.cancel()
})

console.log('[iridescent/cave_gnome] cave-only spawn gate active (wild surface spawns denied)')
