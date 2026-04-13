// =============================================================================
// IridescentCraft — Waystone Crafting Recipes
// File: kubejs/server_scripts/recipes/waystone_recipes.js
//
// Design: Finding/activating waystones in the world is FREE.
//         CRAFTING waystones is expensive at ALL tiers — requires rare boss
//         drops plus expensive resources. This prevents trivial fast-travel
//         network spam while rewarding exploration and boss-hunting.
//
// Waystone Core: kubejs:waystone_core (registered in custom_items.js)
//   Recipe: nether star + 4 gold blocks + 2 boss materials + ender pearl
//
// All waystone block variants use the same core as their gating material.
// Sharestones and utility items (scrolls, warp stones) have their own costs.
// =============================================================================

ServerEvents.recipes(event => {

  // ═══ REMOVE ALL DEFAULT WAYSTONE RECIPES ═══
  // We replace every craftable waystone variant with boss-gated versions.

  ;[
    'waystones:waystone',
    'waystones:mossy_waystone',
    'waystones:sandy_waystone',
    'waystones:blackstone_waystone',
    'waystones:deepslate_waystone',
    'waystones:end_stone_waystone',
    'waystones:sharestone',
    'waystones:warp_plate',
    'waystones:portstone',
    'waystones:warp_stone',
    'waystones:warp_scroll',
    'waystones:return_scroll',
    'waystones:bound_scroll',
    'waystones:attuned_shard',
    'waystones:warp_dust'
  ].forEach(id => event.remove({ output: id }))

  // Also remove all colored sharestone recipes
  ;[
    'black','blue','brown','cyan','gray','green','light_blue','light_gray',
    'lime','magenta','orange','pink','purple','red','white','yellow'
  ].forEach(color => {
    event.remove({ output: `waystones:${color}_sharestone` })
  })


  // ═══ WAYSTONE CORE — The universal gating component ═══
  // Nether Star (center) + 4 Gold Blocks + 2 Boss Materials + 1 Ender Pearl
  // Boss materials: any T2+ boss drop works (Lich Soul, Naga Scale, etc.)
  // This makes waystone crafting a mid-to-late game milestone.

  event.remove({ output: 'kubejs:waystone_core' })
  event.shaped('kubejs:waystone_core', [
    'GBG',
    'BNB',
    'GEG'
  ], {
    N: 'minecraft:nether_star',
    G: 'minecraft:gold_block',
    B: 'kubejs:ur_ghast_tear',     // T2 boss drop — the rarest T2 material
    E: 'minecraft:ender_pearl'
  }).id('icraft:waystone_core')

  // Alternative core recipe using T3 boss materials (for players who
  // skipped Twilight Forest or want a different path)
  event.shaped('kubejs:waystone_core', [
    'GBG',
    'BNB',
    'GEG'
  ], {
    N: 'minecraft:nether_star',
    G: 'minecraft:gold_block',
    B: 'kubejs:harbinger_eye',     // T3 boss drop
    E: 'minecraft:ender_pearl'
  }).id('icraft:waystone_core_alt')


  // ═══ WAYSTONE BLOCKS — All require core + themed stone ═══

  // Standard Waystone
  event.shaped('waystones:waystone', [
    'SSS',
    'SCS',
    'SSS'
  ], {
    S: 'minecraft:stone_bricks',
    C: 'kubejs:waystone_core'
  }).id('icraft:waystone')

  // Mossy Waystone
  event.shaped('waystones:mossy_waystone', [
    'SSS',
    'SCS',
    'SSS'
  ], {
    S: 'minecraft:mossy_stone_bricks',
    C: 'kubejs:waystone_core'
  }).id('icraft:mossy_waystone')

  // Sandy Waystone
  event.shaped('waystones:sandy_waystone', [
    'SSS',
    'SCS',
    'SSS'
  ], {
    S: 'minecraft:cut_sandstone',
    C: 'kubejs:waystone_core'
  }).id('icraft:sandy_waystone')

  // Blackstone Waystone
  event.shaped('waystones:blackstone_waystone', [
    'SSS',
    'SCS',
    'SSS'
  ], {
    S: 'minecraft:polished_blackstone_bricks',
    C: 'kubejs:waystone_core'
  }).id('icraft:blackstone_waystone')

  // Deepslate Waystone
  event.shaped('waystones:deepslate_waystone', [
    'SSS',
    'SCS',
    'SSS'
  ], {
    S: 'minecraft:deepslate_bricks',
    C: 'kubejs:waystone_core'
  }).id('icraft:deepslate_waystone')

  // End Stone Waystone (T4 — End access required naturally)
  event.shaped('waystones:end_stone_waystone', [
    'SSS',
    'SCS',
    'SSS'
  ], {
    S: 'minecraft:end_stone_bricks',
    C: 'kubejs:waystone_core'
  }).id('icraft:end_stone_waystone')


  // ═══ SHARESTONE — Same core cost, dye for color ═══
  // Base sharestone (white by default)
  event.shaped('waystones:sharestone', [
    'DSD',
    'SCS',
    'DSD'
  ], {
    S: 'minecraft:stone_bricks',
    C: 'kubejs:waystone_core',
    D: 'minecraft:white_dye'
  }).id('icraft:sharestone')

  // All colored sharestones — shapeless recolor from base
  ;[
    ['black','minecraft:black_dye'],
    ['blue','minecraft:blue_dye'],
    ['brown','minecraft:brown_dye'],
    ['cyan','minecraft:cyan_dye'],
    ['gray','minecraft:gray_dye'],
    ['green','minecraft:green_dye'],
    ['light_blue','minecraft:light_blue_dye'],
    ['light_gray','minecraft:light_gray_dye'],
    ['lime','minecraft:lime_dye'],
    ['magenta','minecraft:magenta_dye'],
    ['orange','minecraft:orange_dye'],
    ['pink','minecraft:pink_dye'],
    ['purple','minecraft:purple_dye'],
    ['red','minecraft:red_dye'],
    ['white','minecraft:white_dye'],
    ['yellow','minecraft:yellow_dye']
  ].forEach(([color, dye]) => {
    event.shapeless(`waystones:${color}_sharestone`, [
      'waystones:sharestone', dye
    ]).id(`icraft:${color}_sharestone`)
  })


  // ═══ WARP PLATE — Expensive utility block ═══
  event.shaped('waystones:warp_plate', [
    'GEG',
    'ECE',
    'GEG'
  ], {
    G: 'minecraft:gold_block',
    E: 'minecraft:ender_pearl',
    C: 'kubejs:waystone_core'
  }).id('icraft:warp_plate')

  // ═══ PORTSTONE — Public waystone, even more expensive ═══
  event.shaped('waystones:portstone', [
    'SDS',
    'SCS',
    'SSS'
  ], {
    S: 'minecraft:stone_bricks',
    D: 'minecraft:diamond_block',
    C: 'kubejs:waystone_core'
  }).id('icraft:portstone')


  // ═══ UTILITY ITEMS — Moderate cost, no core required ═══
  // These are consumable/limited, so they don't need full boss-gate.

  // Warp Stone (reusable, cooldown) — expensive but no boss drop
  event.shaped('waystones:warp_stone', [
    'EPE',
    'PDP',
    'EPE'
  ], {
    E: 'minecraft:ender_pearl',
    P: '#forge:ingots/steel',
    D: 'minecraft:diamond'
  }).id('icraft:warp_stone')

  // Warp Scroll (single use) — moderate cost
  event.shaped('3x waystones:warp_scroll', [
    'PEP',
    'EPE',
    'PEP'
  ], {
    P: 'minecraft:paper',
    E: 'minecraft:ender_pearl'
  }).id('icraft:warp_scroll')

  // Return Scroll (single use, returns to last waystone)
  event.shaped('3x waystones:return_scroll', [
    'PCP',
    'CEC',
    'PCP'
  ], {
    P: 'minecraft:paper',
    C: 'minecraft:compass',
    E: 'minecraft:ender_pearl'
  }).id('icraft:return_scroll')

  // Bound Scroll (single use, specific destination)
  event.shaped('3x waystones:bound_scroll', [
    'PEP',
    'EGE',
    'PEP'
  ], {
    P: 'minecraft:paper',
    E: 'minecraft:ender_pearl',
    G: 'minecraft:gold_ingot'
  }).id('icraft:bound_scroll')

  // Attuned Shard (links to specific waystone for warp plates)
  event.shaped('waystones:attuned_shard', [
    ' E ',
    'EAE',
    ' E '
  ], {
    E: 'minecraft:ender_pearl',
    A: 'minecraft:amethyst_shard'
  }).id('icraft:attuned_shard')

  // Warp Dust (warp plate fuel)
  event.shaped('4x waystones:warp_dust', [
    ' E ',
    'ERE',
    ' E '
  ], {
    E: 'minecraft:ender_pearl',
    R: 'minecraft:redstone'
  }).id('icraft:warp_dust')


  console.log('[IridescentCraft] waystone_recipes.js loaded')
})
