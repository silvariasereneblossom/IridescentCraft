// =============================================================================
// TRANSMUTED MATERIAL TAGS
// =============================================================================
// Add transmuted tier-skip items to the same forge tags as their real
// counterparts. This makes them work in ALL tag-based recipes automatically
// without needing to modify individual recipes.
// =============================================================================

ServerEvents.tags('item', event => {
  // Transmuted Steel → same tags as thermal:steel_ingot
  event.add('forge:ingots/steel', 'kubejs:transmuted_steel')
  event.add('forge:ingots', 'kubejs:transmuted_steel')

  // Transmuted Manasteel → same tags as botania:manasteel_ingot
  event.add('forge:ingots/manasteel', 'kubejs:transmuted_manasteel')
  event.add('forge:ingots', 'kubejs:transmuted_manasteel')
  event.add('botania:ingots/manasteel', 'kubejs:transmuted_manasteel')

  // Transmuted Osmium → same tags as mekanism:ingot_osmium
  event.add('forge:ingots/osmium', 'kubejs:transmuted_osmium')
  event.add('forge:ingots', 'kubejs:transmuted_osmium')
  event.add('mekanism:ingots/osmium', 'kubejs:transmuted_osmium')

  // Transmuted Diamond → same tags as minecraft:diamond
  event.add('forge:gems/diamond', 'kubejs:transmuted_diamond')
  event.add('forge:gems', 'kubejs:transmuted_diamond')
  event.add('minecraft:diamonds', 'kubejs:transmuted_diamond')

  // Transmuted Ancient Debris → same tag (smelts to netherite scrap)
  // Ancient debris doesn't have a forge tag — it's used directly in recipes
  // We'll add a custom tag and modify the netherite recipe to accept it
  event.add('forge:ores/ancient_debris', 'kubejs:transmuted_ancient_debris')
})

console.log('[IridescentCraft] Transmuted material tags registered')
