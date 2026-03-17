// =============================================================================
// IridescentCraft — Ad Astra Recipe Gating
// File: kubejs/server_scripts/recipes/ad_astra_gating.js
//
// Design Doc: Ad Astra Integration — Recipe Modifications
//
// Gates Ad Astra content behind T4 materials:
//   - Rocket Workbench: Netherite + Mekanism Steel Casing + T4 token
//   - Jet Suit: Removed entirely (MekaSuit fills this niche)
//   - Tier 1-4 Rockets: Gated behind progressive planet materials
// =============================================================================

ServerEvents.recipes(event => {

  // ═══ SECTION A: ROCKET WORKBENCH — Gateway Item ═══
  // Remove default recipe, replace with T4-gated version
  event.remove({ output: 'ad_astra:nasa_workbench' })

  event.shaped('ad_astra:nasa_workbench', [
    'NTN',
    'CSC',
    'NTN'
  ], {
    N: 'minecraft:netherite_ingot',
    T: 'kubejs:reality_progression_token_t4',
    C: 'mekanism:steel_casing',
    S: 'ad_astra:steel_block'
  }).id('icraft:nasa_workbench_t4')


  // ═══ SECTION B: JET SUIT — Remove Entirely ═══
  // MekaSuit fills the Jet Suit niche (flight + space survival)
  event.remove({ output: 'ad_astra:jet_suit_helmet' })
  event.remove({ output: 'ad_astra:jet_suit_chestplate' })
  event.remove({ output: 'ad_astra:jet_suit_leggings' })
  event.remove({ output: 'ad_astra:jet_suit_boots' })


  // ═══ SECTION C: TIER 1 ROCKET (Moon) ═══
  // Replace iron/steel components with Netherite + Enderium
  // Requires significant material investment even for T4 players
  event.remove({ output: 'ad_astra:tier_1_rocket' })

  event.shaped('ad_astra:tier_1_rocket', [
    ' N ',
    'NEN',
    'SFS'
  ], {
    N: 'minecraft:netherite_ingot',
    E: 'thermal:enderium_ingot',
    S: 'ad_astra:steel_plate',
    F: 'ad_astra:engine_frame'
  }).id('icraft:tier_1_rocket')


  // ═══ SECTION D: TIER 2 ROCKET (Mars) ═══
  // Requires Moon-specific materials + Aethersteel
  event.remove({ output: 'ad_astra:tier_2_rocket' })

  event.shaped('ad_astra:tier_2_rocket', [
    ' N ',
    'AMA',
    'SFS'
  ], {
    N: 'minecraft:netherite_ingot',
    A: 'kubejs:aethersteel_ingot',
    M: 'ad_astra:moon_stone',
    S: 'ad_astra:steel_plate',
    F: 'ad_astra:engine_frame'
  }).id('icraft:tier_2_rocket')


  // ═══ SECTION E: TIER 3 ROCKET (Venus/Mercury) ═══
  // Requires Mars-specific materials + Aethersteel
  event.remove({ output: 'ad_astra:tier_3_rocket' })

  event.shaped('ad_astra:tier_3_rocket', [
    ' A ',
    'AMA',
    'SFS'
  ], {
    A: 'kubejs:aethersteel_ingot',
    M: 'ad_astra:mars_stone',
    S: 'ad_astra:steel_plate',
    F: 'ad_astra:engine_frame'
  }).id('icraft:tier_3_rocket')


  // ═══ SECTION F: TIER 4 ROCKET (Glacio) ═══
  // Most expensive single craft in the pack
  // Requires materials from all inner planets + Primordial Essence
  event.remove({ output: 'ad_astra:tier_4_rocket' })

  event.shaped('ad_astra:tier_4_rocket', [
    ' P ',
    'AVA',
    'SFS'
  ], {
    P: 'kubejs:primordial_essence',
    A: 'kubejs:aethersteel_ingot',
    V: 'ad_astra:venus_stone',
    S: 'ad_astra:steel_plate',
    F: 'ad_astra:engine_frame'
  }).id('icraft:tier_4_rocket')


  // ═══ SECTION G: MekaSuit Mk2 — Ultimate Armor ═══
  // Crafted at Mythic Forge: MekaSuit + Aethersteel + Glacio material + Primordial Essence
  event.shaped('kubejs:mekasuit_mk2_helmet', [
    'AGA',
    'AHA',
    'P P'
  ], {
    A: 'kubejs:aethersteel_ingot',
    G: 'ad_astra:glacio_stone',
    H: 'mekanism:mekasuit_helmet',
    P: 'kubejs:primordial_essence'
  }).id('icraft:mekasuit_mk2_helmet')

  event.shaped('kubejs:mekasuit_mk2_chestplate', [
    'AGA',
    'ACA',
    'P P'
  ], {
    A: 'kubejs:aethersteel_ingot',
    G: 'ad_astra:glacio_stone',
    C: 'mekanism:mekasuit_bodyarmor',
    P: 'kubejs:primordial_essence'
  }).id('icraft:mekasuit_mk2_chestplate')

  event.shaped('kubejs:mekasuit_mk2_leggings', [
    'AGA',
    'ALA',
    'P P'
  ], {
    A: 'kubejs:aethersteel_ingot',
    G: 'ad_astra:glacio_stone',
    L: 'mekanism:mekasuit_pants',
    P: 'kubejs:primordial_essence'
  }).id('icraft:mekasuit_mk2_leggings')

  event.shaped('kubejs:mekasuit_mk2_boots', [
    'AGA',
    'ABA',
    'P P'
  ], {
    A: 'kubejs:aethersteel_ingot',
    G: 'ad_astra:glacio_stone',
    B: 'mekanism:mekasuit_boots',
    P: 'kubejs:primordial_essence'
  }).id('icraft:mekasuit_mk2_boots')


  console.log('[IridescentCraft] ad_astra_gating.js loaded — Ad Astra recipes gated to T4+')
})
