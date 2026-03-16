// =============================================================================
// IridescentCraft — Planetary Resource Extraction Recipes
// File: kubejs/server_scripts/recipes/planetary_extraction.js
//
// Design Doc: Planetary Rock Extraction & Fusion Fuel Converter
//
// Adds crushing/pulverizing recipes for planet stones into unique elements,
// the Fusion Fuel Converter crafting recipe, and fuel conversion recipe.
// =============================================================================

ServerEvents.recipes(event => {

  // =========================================================================
  // SECTION A: CREATE CRUSHING WHEEL RECIPES
  // Planet stones → unique extracted elements + common byproducts
  // =========================================================================

  // ── Moon Stone → Helium-3 (25%), Titanium Dust (15%), Iron Nugget (50%) ──
  event.recipes.create.crushing([
    Item.of('kubejs:helium_3').withChance(0.25),
    Item.of('kubejs:titanium_dust').withChance(0.15),
    Item.of('minecraft:iron_nugget').withChance(0.50)
  ], 'ad_astra:moon_stone').id('icraft:crush_moon_stone')

  // ── Mars Stone → Ferric Oxide (30%), Cryogenic Crystal (15%), Redstone (40%) ──
  event.recipes.create.crushing([
    Item.of('kubejs:ferric_oxide').withChance(0.30),
    Item.of('kubejs:cryogenic_crystal').withChance(0.15),
    Item.of('minecraft:redstone').withChance(0.40)
  ], 'ad_astra:mars_stone').id('icraft:crush_mars_stone')

  // ── Mercury Stone → Solar Crystal (20%), Rare Earth Dust (20%), Gold Nugget (35%) ──
  event.recipes.create.crushing([
    Item.of('kubejs:solar_crystal').withChance(0.20),
    Item.of('kubejs:rare_earth_dust').withChance(0.20),
    Item.of('minecraft:gold_nugget').withChance(0.35)
  ], 'ad_astra:mercury_stone').id('icraft:crush_mercury_stone')

  // ── Venus Stone → Sulfuric Compound (25%), Pressure Crystal (15%), Quartz (40%) ──
  event.recipes.create.crushing([
    Item.of('kubejs:sulfuric_compound').withChance(0.25),
    Item.of('kubejs:pressure_crystal').withChance(0.15),
    Item.of('minecraft:quartz').withChance(0.40)
  ], 'ad_astra:venus_stone').id('icraft:crush_venus_stone')

  // ── Glacio Stone → Alien Isotope (20%), Cryogenic Element (20%), Ice Shard (30%) ──
  event.recipes.create.crushing([
    Item.of('kubejs:alien_isotope').withChance(0.20),
    Item.of('kubejs:cryogenic_element').withChance(0.20),
    Item.of('ad_astra:ice_shard').withChance(0.30)
  ], 'ad_astra:glacio_stone').id('icraft:crush_glacio_stone')


  // =========================================================================
  // SECTION B: THERMAL PULVERIZER RECIPES (Alternative, slightly better odds)
  // =========================================================================

  // ── Moon Stone (Pulverizer) ──
  event.recipes.thermal.pulverizer(
    [
      Item.of('kubejs:helium_3').withChance(0.30),
      Item.of('kubejs:titanium_dust').withChance(0.20),
      Item.of('minecraft:iron_nugget').withChance(0.55)
    ],
    'ad_astra:moon_stone'
  ).energy(4000).id('icraft:pulverize_moon_stone')

  // ── Mars Stone (Pulverizer) ──
  event.recipes.thermal.pulverizer(
    [
      Item.of('kubejs:ferric_oxide').withChance(0.35),
      Item.of('kubejs:cryogenic_crystal').withChance(0.20),
      Item.of('minecraft:redstone').withChance(0.45)
    ],
    'ad_astra:mars_stone'
  ).energy(4000).id('icraft:pulverize_mars_stone')

  // ── Mercury Stone (Pulverizer) ──
  event.recipes.thermal.pulverizer(
    [
      Item.of('kubejs:solar_crystal').withChance(0.25),
      Item.of('kubejs:rare_earth_dust').withChance(0.25),
      Item.of('minecraft:gold_nugget').withChance(0.40)
    ],
    'ad_astra:mercury_stone'
  ).energy(5000).id('icraft:pulverize_mercury_stone')

  // ── Venus Stone (Pulverizer) ──
  event.recipes.thermal.pulverizer(
    [
      Item.of('kubejs:sulfuric_compound').withChance(0.30),
      Item.of('kubejs:pressure_crystal').withChance(0.20),
      Item.of('minecraft:quartz').withChance(0.45)
    ],
    'ad_astra:venus_stone'
  ).energy(5000).id('icraft:pulverize_venus_stone')

  // ── Glacio Stone (Pulverizer) ──
  event.recipes.thermal.pulverizer(
    [
      Item.of('kubejs:alien_isotope').withChance(0.25),
      Item.of('kubejs:cryogenic_element').withChance(0.25),
      Item.of('ad_astra:ice_shard').withChance(0.35)
    ],
    'ad_astra:glacio_stone'
  ).energy(6000).id('icraft:pulverize_glacio_stone')


  // =========================================================================
  // SECTION C: FUSION FUEL CONVERTER CRAFTING RECIPE
  // Very expensive endgame shaped recipe
  // =========================================================================

  event.shaped('kubejs:fusion_fuel_converter', [
    'ENE',
    'CAK',
    'ENE'
  ], {
    N: 'minecraft:netherite_ingot',
    E: 'thermal:enderium_ingot',
    C: 'ad_astra:steel_plate',       // Ad Astra compressor component
    A: 'kubejs:aethersteel_ingot',
    K: 'mekanism:electrolytic_separator'
  }).id('icraft:fusion_fuel_converter')


  // =========================================================================
  // SECTION D: FUSION FUEL CONVERSION RECIPE
  // Fusion Fuel Converter + Water Bucket → Ad Astra Fuel Bucket
  // Shapeless recipe — the converter is not consumed
  // =========================================================================

  event.shapeless('ad_astra:fuel_bucket', [
    'kubejs:fusion_fuel_converter',
    'minecraft:water_bucket'
  ]).id('icraft:fusion_fuel_conversion')


  console.log('[IridescentCraft] planetary_extraction.js loaded — planet crushing + fuel converter')
})
