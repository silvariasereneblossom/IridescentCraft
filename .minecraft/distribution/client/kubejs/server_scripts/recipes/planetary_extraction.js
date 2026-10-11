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

  // [2026-10-10] Ported to event.custom JSON. `event.recipes.create.crushing(
  // outputs, input)` is the KubeJS Create ADDON's fluent builder, and that addon
  // is not installed (only KubeJS + kubejs-thermal are): without it KubeJS has
  // no schema for create:crushing, every call failed at boot with "Constructor
  // for create:crushing with 2 arguments not found" and — the try/catch only
  // hid it — none of the five recipes ever existed. The JSON shape is Create
  // 6.0.8's own (data/create/recipes/crushing/*.json in the jar: ingredients /
  // processingTime / results[{item, chance}]), the same port that works in
  // if_latex_rework.js. Inputs, outputs and chances are unchanged.
  // processingTime 100 = the addon builder's default, which is what the
  // original calls (no .processingTime()) would have written.
  var planetCrushing = function (input, results, id) {
    event.custom({
      type: 'create:crushing',
      ingredients: [{ item: input }],
      processingTime: 100,
      results: results
    }).id(id)
  }

  // ── Moon Stone → Helium-3 (25%), Titanium Dust (15%), Iron Nugget (50%) ──
  planetCrushing('ad_astra:moon_stone', [
    { item: 'kubejs:helium_3', chance: 0.25 },
    { item: 'kubejs:titanium_dust', chance: 0.15 },
    { item: 'minecraft:iron_nugget', chance: 0.50 }
  ], 'icraft:crush_moon_stone')

  // ── Mars Stone → Ferric Oxide (30%), Cryogenic Crystal (15%), Redstone (40%) ──
  planetCrushing('ad_astra:mars_stone', [
    { item: 'kubejs:ferric_oxide', chance: 0.30 },
    { item: 'kubejs:cryogenic_crystal', chance: 0.15 },
    { item: 'minecraft:redstone', chance: 0.40 }
  ], 'icraft:crush_mars_stone')

  // ── Mercury Stone → Solar Crystal (20%), Rare Earth Dust (20%), Gold Nugget (35%) ──
  planetCrushing('ad_astra:mercury_stone', [
    { item: 'kubejs:solar_crystal', chance: 0.20 },
    { item: 'kubejs:rare_earth_dust', chance: 0.20 },
    { item: 'minecraft:gold_nugget', chance: 0.35 }
  ], 'icraft:crush_mercury_stone')

  // ── Venus Stone → Sulfuric Compound (25%), Pressure Crystal (15%), Quartz (40%) ──
  planetCrushing('ad_astra:venus_stone', [
    { item: 'kubejs:sulfuric_compound', chance: 0.25 },
    { item: 'kubejs:pressure_crystal', chance: 0.15 },
    { item: 'minecraft:quartz', chance: 0.40 }
  ], 'icraft:crush_venus_stone')

  // ── Glacio Stone → Alien Isotope (20%), Cryogenic Element (20%), Ice Shard (30%) ──
  planetCrushing('ad_astra:glacio_stone', [
    { item: 'kubejs:alien_isotope', chance: 0.20 },
    { item: 'kubejs:cryogenic_element', chance: 0.20 },
    { item: 'ad_astra:ice_shard', chance: 0.30 }
  ], 'icraft:crush_glacio_stone')


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
  // SECTION C: WATER → FUSION FUEL (Mekanism Machine Chain)
  //
  // Design: Players transport water to their Moon/planet base via Dynamic Tank,
  // then process it through existing Mekanism machines:
  //
  // Step 1: Electrolytic Separator — Water → Hydrogen + Oxygen (already vanilla Mek)
  // Step 2: Rotary Condensentrator — Hydrogen gas → Ad Astra Fuel (new recipe)
  //
  // This rewards Mekanism infrastructure investment and feels authentic.
  // No custom converter item needed — uses real Mekanism machines.
  // =========================================================================

  // Rotary Condensentrator: Condense Hydrogen gas into Ad Astra rocket fuel
  // The Electrolytic Separator already splits water → hydrogen + oxygen (vanilla Mek)
  // This adds the second step: hydrogen → fuel
  //
  // [2026-10-10] Rewritten. The old call used the recipe type
  // `mekanism:condensentrating`, which does not exist ("Unknown recipe type" at
  // every boot — the recipe never existed). Mekanism 10.4's type is
  // `mekanism:rotary`, with gasInput + fluidOutput for the gas -> fluid
  // direction (RotaryRecipeSerializer; shape as in the jar's
  // data/mekanism/recipes/rotary/*.json). Amounts are unchanged: 500 mB
  // hydrogen -> 250 mB ad_astra:fuel.
  //
  // ONE SIDE EFFECT, and why: the Rotary Condensentrator looks a gas -> fluid
  // recipe up BY GAS (RotaryInputRecipeCache: a HashSet per gas, first match
  // wins). Mekanism already ships mekanism:rotary/hydrogen (hydrogen gas <->
  // liquid hydrogen, 1:1), and two gas -> fluid recipes for the same gas cannot
  // coexist: the 1 mB stock recipe matches first as hydrogen trickles in, so
  // the fuel recipe would simply never run. To make the designed chain work,
  // the stock recipe is replaced by its fluid -> gas half only: liquid hydrogen
  // can still be turned back into gas, but hydrogen gas now condenses into
  // rocket fuel instead of liquid hydrogen. (In this pack liquid hydrogen's
  // only use is as Ad Astra zip-gun propellant; oxygen still works for that.)
  // Set HYDROGEN_CONDENSES_TO_FUEL to false to keep stock Mekanism behaviour
  // and drop the fuel recipe.
  var HYDROGEN_CONDENSES_TO_FUEL = true
  if (HYDROGEN_CONDENSES_TO_FUEL) {
    event.remove({ id: 'mekanism:rotary/hydrogen' })
    // stock recipe's fluid -> gas direction, unchanged
    event.custom({
      type: 'mekanism:rotary',
      fluidInput: { amount: 1, tag: 'forge:hydrogen' },
      gasOutput: { amount: 1, gas: 'mekanism:hydrogen' }
    }).id('icraft:rotary/liquid_hydrogen_to_gas')
    // the new gas -> fluid direction
    event.custom({
      type: 'mekanism:rotary',
      gasInput: { amount: 500, gas: 'mekanism:hydrogen' },
      fluidOutput: { amount: 250, fluid: 'ad_astra:fuel' }
    }).id('icraft:hydrogen_to_rocket_fuel')
  }


  console.log('[IridescentCraft] planetary_extraction.js loaded — planet crushing + hydrogen-to-fuel chain')
})
