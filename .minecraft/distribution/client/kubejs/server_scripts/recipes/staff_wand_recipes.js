// =============================================================================
// STAFF / WAND RECIPES — Dan's Magic T1 respec + Simple Staves element gates
// =============================================================================
// Phase E of staves/wands integration plan.
//
// Strips original recipes (Dan's Magic uses Nether components, Simple Staves
// element wands use netherite_stick base) and replaces with T1-T4 progression
// recipes:
//
//   Dan's Magic (5 staves): T1 recipes using vanilla materials. Each staff
//   crafts via stick + element_reagent + amethyst_powder + tier-appropriate
//   binder (leather strap / redstone / iron). All accessible day 1.
//
//   Simple Staves elements (8 kept, explosion_wand stripped): each crafts
//   from simple_staves:woodenwand (T1 craftable, kept default recipe) +
//   tier reagent + amethyst_powder for cross-mod consistency.
//
//   Material wands (wooden/stone/iron/gold/diamond/netherite): kept on
//   default Simple Staves recipes — players craft them, then drop on Tetra
//   workbench to get the modular reforged_wand (Phase D).
//
// Memory: project_mage_loadout.md.
// =============================================================================

ServerEvents.recipes(event => {

  // ════════════════════════════════════════════════════════════════════
  // DAN'S MAGIC — strip Nether-tier recipes, replace with T1 recipes
  // ════════════════════════════════════════════════════════════════════

  // Strip all 5 original recipes (which require ghast_tear + lightning_rod +
  // staff_base). The staff_base intermediate stays craftable for mod
  // compatibility / future use, but isn't used in our new recipes.
  ;[
    'dna:ice_staff', 'dna:lightning_staff', 'dna:magma_staff',
    'dna:tnt_staff', 'dna:toxic_staff'
  ].forEach(id => event.remove({ output: id }))

  // T1 vertical-wand shape:
  //   .R.
  //   .B.
  //   .S.
  // R = element reagent, B = amethyst_powder binder, S = stick

  // Ice Staff — T1
  event.shaped('dna:ice_staff', [' I ', ' A ', ' S '], {
    I: 'minecraft:packed_ice',
    A: 'dna:amethyst_powder',
    S: 'minecraft:stick'
  }).id('icraft:dna_ice_staff_t1')

  // Lightning Staff — T1
  event.shaped('dna:lightning_staff', [' C ', ' A ', ' S '], {
    C: 'minecraft:copper_ingot',
    A: 'dna:amethyst_powder',
    S: 'minecraft:stick'
  }).id('icraft:dna_lightning_staff_t1')

  // Magma Staff — T1
  event.shaped('dna:magma_staff', [' M ', ' A ', ' S '], {
    M: 'minecraft:magma_cream',
    A: 'dna:amethyst_powder',
    S: 'minecraft:stick'
  }).id('icraft:dna_magma_staff_t1')

  // Toxic Staff — T1
  event.shaped('dna:toxic_staff', [' E ', ' A ', ' S '], {
    E: 'minecraft:spider_eye',
    A: 'dna:amethyst_powder',
    S: 'minecraft:stick'
  }).id('icraft:dna_toxic_staff_t1')

  // Apprentice Battlerod (dna:tnt_staff) — T1 spellsword hybrid
  event.shaped('dna:tnt_staff', [' G ', 'IAI', ' S '], {
    G: 'minecraft:gunpowder',
    I: 'minecraft:iron_ingot',
    A: 'dna:amethyst_powder',
    S: 'minecraft:stick'
  }).id('icraft:dna_apprentice_battlerod_t1')


  // ════════════════════════════════════════════════════════════════════
  // SIMPLE STAVES — strip mod's netherite_stick base recipes; replace
  //                 with woodenwand + tier-reagent recipes.
  // ════════════════════════════════════════════════════════════════════

  // Strip all element wand recipes (all use netherite_stick in source mod —
  // would gate them as T4 endgame, which doesn't fit our progression).
  ;[
    'simple_staves:flame_wand',
    'simple_staves:wind_essence_wand',
    'simple_staves:thunder_wand',
    'simple_staves:venomite_wand',
    'simple_staves:viritium_wand',
    'simple_staves:veil_wand',
    'simple_staves:void_wand',
    'simple_staves:tenebrium_wand',
    // Explosion wand: stripped without replacement (redundant w/ Battlerod)
    'simple_staves:explosion_wand'
  ].forEach(id => event.remove({ output: id }))

  // Replacement shape — woodenwand + reagent + amethyst_powder:
  //   .R.
  //   RWR
  //   .A.
  // W = woodenwand, R = element reagent, A = amethyst_powder (cross-mod link).

  // 2026-05-10 user direction: reagents must be EXISTING pack materials
  // (Simple Staves' own ores are stripped from worldgen — see
  // kubejs/data/simple_staves/forge/biome_modifier/*.json overlays).
  // Mapping decisions: feather for wind T1, ISS runes for T2 (mix-in),
  // ISS runes + eye_of_ender for T3, nether_star for tenebrium T4.

  // T1 element: wind — minecraft:feather (chicken drop, day 1)
  event.shaped('simple_staves:wind_essence_wand', [' R ', 'RWR', ' A '], {
    W: 'simple_staves:woodenwand',
    R: 'minecraft:feather',
    A: 'dna:amethyst_powder'
  }).id('icraft:ss_wind_wand_t1')

  // T2 elements — mix in ISS runes for fire/lightning, fermented_spider_eye for venom
  event.shaped('simple_staves:flame_wand', [' R ', 'RWR', ' A '], {
    W: 'simple_staves:woodenwand',
    R: 'irons_spellbooks:fire_rune',
    A: 'dna:amethyst_powder'
  }).id('icraft:ss_flame_wand_t2')

  event.shaped('simple_staves:thunder_wand', [' R ', 'RWR', ' A '], {
    W: 'simple_staves:woodenwand',
    R: 'irons_spellbooks:lightning_rune',
    A: 'dna:amethyst_powder'
  }).id('icraft:ss_thunder_wand_t2')

  event.shaped('simple_staves:venomite_wand', [' R ', 'RWR', ' A '], {
    W: 'simple_staves:woodenwand',
    R: 'minecraft:fermented_spider_eye',
    A: 'dna:amethyst_powder'
  }).id('icraft:ss_venomite_wand_t2')

  // T3 elements — ISS runes (nature, holy) + eye_of_ender for void
  event.shaped('simple_staves:viritium_wand', ['RRR', 'RWR', ' A '], {
    W: 'simple_staves:woodenwand',
    R: 'irons_spellbooks:nature_rune',
    A: 'dna:amethyst_powder'
  }).id('icraft:ss_viritium_wand_t3')

  event.shaped('simple_staves:veil_wand', ['RRR', 'RWR', ' A '], {
    W: 'simple_staves:woodenwand',
    R: 'irons_spellbooks:holy_rune',
    A: 'dna:amethyst_powder'
  }).id('icraft:ss_veil_wand_t3')

  event.shaped('simple_staves:void_wand', ['RRR', 'RWR', ' A '], {
    W: 'simple_staves:woodenwand',
    R: 'minecraft:eye_of_ender',
    A: 'dna:amethyst_powder'
  }).id('icraft:ss_void_wand_t3')

  // T4 endgame: tenebrium — nether_star centerpiece (Wither kill = T4 gate)
  event.shaped('simple_staves:tenebrium_wand', ['EEE', 'EWE', 'EAE'], {
    W: 'simple_staves:woodenwand',
    E: 'minecraft:eye_of_ender',
    A: 'minecraft:nether_star'
  }).id('icraft:ss_tenebrium_wand_t4')

  // Note: simple_staves:woodenwand keeps default Simple Staves recipe
  // (sticks + planks). Material ladder (stone/iron/gold/diamond/netherite
  // wands + sticks) also keeps default recipes — those become Tetra-modular
  // via the workbench-replacement system in Phase D.

  console.log('[staff_wand_recipes] loaded — Dan T1 (5) + SS elements (8) reseeded')
})
