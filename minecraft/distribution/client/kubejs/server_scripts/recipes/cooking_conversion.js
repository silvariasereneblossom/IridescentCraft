// =============================================================================
// IridescentCraft — Cooking Pot → Crafting Table Conversion
// File: kubejs/server_scripts/recipes/cooking_conversion.js
//
// Farmer's Delight uses a custom 'farmersdelight:cooking' recipe type for its
// cooking pot. These recipes don't appear in the Cooking for Blockheads kitchen
// interface. This script adds ALTERNATIVE shapeless crafting table recipes so
// players can make these foods through the Cooking for Blockheads multiblock
// kitchen as well.
//
// The original cooking pot recipes are NOT removed — players who prefer the
// cooking pot interface can still use it. This simply adds a second path.
//
// Also covers addon mods: Nether's Delight, Cultural Delights, Delightful,
// Brewin' and Chewin', and Alex's Delight.
// =============================================================================

ServerEvents.recipes(event => {

  // Helper: only create the recipe if the result item exists in the registry.
  // Returns a chainable object so .id() still works. If the item doesn't exist,
  // returns a no-op dummy so the .id() call is silently swallowed.
  const NOOP = { id: function() { return this; } }
  function safeShapeless(result, ingredients) {
    try {
      let test = Item.of(result)
      if (test && !test.isEmpty()) {
        return event.shapeless(result, ingredients)
      }
    } catch (e) {}
    return NOOP
  }

  // ═══ FARMER'S DELIGHT — Core Cooking Pot Meals ═══
  // Each recipe uses a bowl as the container ingredient (replacing the pot).

  // --- Soups & Stews ---

  safeShapeless('farmersdelight:beef_stew', [
    'minecraft:cooked_beef', 'minecraft:potato', 'minecraft:carrot', 'minecraft:bowl'
  ]).id('icraft:fd_beef_stew')

  safeShapeless('farmersdelight:chicken_soup', [
    'minecraft:cooked_chicken', 'minecraft:carrot', 'minecraft:potato', 'minecraft:bowl'
  ]).id('icraft:fd_chicken_soup')

  safeShapeless('farmersdelight:vegetable_soup', [
    'minecraft:carrot', 'minecraft:potato', 'minecraft:beetroot', 'minecraft:bowl'
  ]).id('icraft:fd_vegetable_soup')

  safeShapeless('farmersdelight:fish_stew', [
    'minecraft:cooked_cod', 'minecraft:potato', 'minecraft:bowl'
  ]).id('icraft:fd_fish_stew')

  safeShapeless('farmersdelight:pumpkin_soup', [
    'minecraft:pumpkin', 'minecraft:bowl'
  ]).id('icraft:fd_pumpkin_soup')

  safeShapeless('farmersdelight:noodle_soup', [
    'farmersdelight:raw_pasta', 'minecraft:egg', 'minecraft:carrot', 'minecraft:bowl'
  ]).id('icraft:fd_noodle_soup')

  safeShapeless('farmersdelight:baked_cod_stew', [
    'minecraft:cooked_cod', 'minecraft:potato', 'farmersdelight:tomato', 'minecraft:bowl'
  ]).id('icraft:fd_baked_cod_stew')

  // --- Main Dishes ---

  safeShapeless('farmersdelight:mushroom_rice', [
    'minecraft:brown_mushroom', 'farmersdelight:rice', 'minecraft:bowl'
  ]).id('icraft:fd_mushroom_rice')

  safeShapeless('farmersdelight:bacon_and_eggs', [
    'minecraft:cooked_porkchop', 'minecraft:egg', 'minecraft:bowl'
  ]).id('icraft:fd_bacon_and_eggs')

  safeShapeless('farmersdelight:pasta_with_meatballs', [
    'farmersdelight:raw_pasta', 'minecraft:cooked_beef', 'farmersdelight:tomato', 'minecraft:bowl'
  ]).id('icraft:fd_pasta_with_meatballs')

  safeShapeless('farmersdelight:pasta_with_mutton_chop', [
    'farmersdelight:raw_pasta', 'minecraft:cooked_mutton', 'farmersdelight:tomato', 'minecraft:bowl'
  ]).id('icraft:fd_pasta_with_mutton_chop')

  safeShapeless('farmersdelight:roasted_mutton_chops', [
    'minecraft:cooked_mutton', 'minecraft:potato', 'farmersdelight:tomato',
    'farmersdelight:onion', 'minecraft:bowl'
  ]).id('icraft:fd_roasted_mutton_chops')

  safeShapeless('farmersdelight:vegetable_noodles', [
    'farmersdelight:raw_pasta', 'minecraft:carrot', 'minecraft:brown_mushroom', 'minecraft:bowl'
  ]).id('icraft:fd_vegetable_noodles')

  safeShapeless('farmersdelight:steak_and_potatoes', [
    'minecraft:cooked_beef', 'minecraft:potato', 'farmersdelight:onion', 'minecraft:bowl'
  ]).id('icraft:fd_steak_and_potatoes')

  safeShapeless('farmersdelight:ratatouille', [
    'farmersdelight:tomato', 'farmersdelight:onion', 'minecraft:beetroot', 'minecraft:bowl'
  ]).id('icraft:fd_ratatouille')

  safeShapeless('farmersdelight:grilled_salmon', [
    'minecraft:cooked_salmon', 'minecraft:potato', 'farmersdelight:cabbage', 'minecraft:bowl'
  ]).id('icraft:fd_grilled_salmon')

  // --- Feast-tier Dishes ---

  safeShapeless('farmersdelight:roast_chicken', [
    'minecraft:cooked_chicken', 'minecraft:potato', 'minecraft:carrot',
    'minecraft:bread', 'minecraft:bowl'
  ]).id('icraft:fd_roast_chicken')

  safeShapeless('farmersdelight:stuffed_pumpkin', [
    'minecraft:pumpkin', 'farmersdelight:rice', 'minecraft:brown_mushroom',
    'minecraft:carrot', 'minecraft:bowl'
  ]).id('icraft:fd_stuffed_pumpkin')

  safeShapeless('farmersdelight:honey_glazed_ham', [
    'minecraft:cooked_porkchop', 'minecraft:honey_bottle', 'minecraft:sweet_berries', 'minecraft:bowl'
  ]).id('icraft:fd_honey_glazed_ham')

  safeShapeless('farmersdelight:shepherds_pie', [
    'minecraft:cooked_mutton', 'minecraft:potato', 'farmersdelight:onion',
    'minecraft:bowl'
  ]).id('icraft:fd_shepherds_pie')

  // --- Side Items ---

  safeShapeless('farmersdelight:fried_rice', [
    'farmersdelight:rice', 'minecraft:egg', 'minecraft:carrot',
    'farmersdelight:onion', 'minecraft:bowl'
  ]).id('icraft:fd_fried_rice')

  safeShapeless('farmersdelight:rice_with_chicken', [
    'farmersdelight:rice', 'minecraft:cooked_chicken', 'minecraft:bowl'
  ]).id('icraft:fd_rice_with_chicken')

  safeShapeless('farmersdelight:bone_broth', [
    'minecraft:bone', 'minecraft:bowl'
  ]).id('icraft:fd_bone_broth')

  safeShapeless('farmersdelight:cabbage_rolls', [
    'farmersdelight:cabbage', 'minecraft:cooked_beef', 'minecraft:bowl'
  ]).id('icraft:fd_cabbage_rolls')

  safeShapeless('farmersdelight:cooked_rice', [
    'farmersdelight:rice', 'minecraft:bowl'
  ]).id('icraft:fd_cooked_rice')

  safeShapeless('farmersdelight:dog_food', [
    'minecraft:rotten_flesh', 'minecraft:bone_meal', 'minecraft:bowl'
  ]).id('icraft:fd_dog_food')

  safeShapeless('farmersdelight:horse_feed', [
    'minecraft:hay_block', 'minecraft:golden_carrot', 'minecraft:bowl'
  ]).id('icraft:fd_horse_feed')

  safeShapeless('farmersdelight:tomato_sauce', [
    'farmersdelight:tomato', 'farmersdelight:tomato', 'minecraft:bowl'
  ]).id('icraft:fd_tomato_sauce')

  safeShapeless('farmersdelight:mixed_salad', [
    'farmersdelight:cabbage', 'minecraft:carrot', 'farmersdelight:tomato', 'minecraft:bowl'
  ]).id('icraft:fd_mixed_salad')

  safeShapeless('farmersdelight:barbecue_stick', [
    'minecraft:cooked_chicken', 'farmersdelight:tomato', 'farmersdelight:onion', 'minecraft:stick'
  ]).id('icraft:fd_barbecue_stick')

  safeShapeless('farmersdelight:egg_sandwich', [
    'minecraft:egg', 'minecraft:bread'
  ]).id('icraft:fd_egg_sandwich')

  safeShapeless('farmersdelight:chicken_sandwich', [
    'minecraft:cooked_chicken', 'farmersdelight:cabbage', 'minecraft:bread'
  ]).id('icraft:fd_chicken_sandwich')

  safeShapeless('farmersdelight:hamburger', [
    'minecraft:cooked_beef', 'farmersdelight:tomato', 'farmersdelight:onion', 'minecraft:bread'
  ]).id('icraft:fd_hamburger')

  safeShapeless('farmersdelight:bacon_sandwich', [
    'minecraft:cooked_porkchop', 'farmersdelight:cabbage', 'farmersdelight:tomato', 'minecraft:bread'
  ]).id('icraft:fd_bacon_sandwich')

  safeShapeless('farmersdelight:mutton_wrap', [
    'minecraft:cooked_mutton', 'farmersdelight:cabbage', 'farmersdelight:onion', 'minecraft:bread'
  ]).id('icraft:fd_mutton_wrap')

  safeShapeless('farmersdelight:dumplings', [
    'farmersdelight:raw_pasta', 'farmersdelight:cabbage', 'minecraft:cooked_chicken'
  ]).id('icraft:fd_dumplings')

  safeShapeless('farmersdelight:stuffed_potato', [
    'minecraft:baked_potato', 'minecraft:cooked_beef', 'minecraft:milk_bucket'
  ]).id('icraft:fd_stuffed_potato')

  safeShapeless('farmersdelight:roast_chicken_block', [
    '4x minecraft:cooked_chicken', 'minecraft:potato', 'minecraft:carrot',
    'minecraft:bread', 'farmersdelight:onion', 'minecraft:bowl'
  ]).id('icraft:fd_roast_chicken_block')

  safeShapeless('farmersdelight:honey_glazed_ham_block', [
    '4x minecraft:cooked_porkchop', 'minecraft:honey_bottle',
    'minecraft:sweet_berries', 'minecraft:bowl'
  ]).id('icraft:fd_honey_glazed_ham_block')

  safeShapeless('farmersdelight:shepherds_pie_block', [
    '4x minecraft:cooked_mutton', 'minecraft:potato',
    'farmersdelight:onion', 'minecraft:bowl'
  ]).id('icraft:fd_shepherds_pie_block')

  safeShapeless('farmersdelight:rice_roll_medley_block', [
    'farmersdelight:rice', 'minecraft:dried_kelp', 'minecraft:cooked_salmon',
    'minecraft:carrot', 'minecraft:bowl'
  ]).id('icraft:fd_rice_roll_medley_block')

  // --- Sweets & Desserts ---

  safeShapeless('farmersdelight:fruit_salad', [
    'minecraft:apple', 'minecraft:melon_slice', 'minecraft:sweet_berries', 'minecraft:bowl'
  ]).id('icraft:fd_fruit_salad')

  safeShapeless('farmersdelight:sweet_berry_cheesecake', [
    'minecraft:sweet_berries', 'minecraft:milk_bucket', 'minecraft:sugar', 'minecraft:wheat'
  ]).id('icraft:fd_sweet_berry_cheesecake')

  safeShapeless('farmersdelight:apple_pie', [
    'minecraft:apple', 'minecraft:sugar', 'minecraft:wheat', 'minecraft:egg'
  ]).id('icraft:fd_apple_pie')

  safeShapeless('farmersdelight:chocolate_pie', [
    'minecraft:cocoa_beans', 'minecraft:sugar', 'minecraft:wheat', 'minecraft:milk_bucket'
  ]).id('icraft:fd_chocolate_pie')

  safeShapeless('farmersdelight:glow_berry_custard', [
    'minecraft:glow_berries', 'minecraft:egg', 'minecraft:sugar', 'minecraft:bowl'
  ]).id('icraft:fd_glow_berry_custard')

  safeShapeless('farmersdelight:honey_cookie', [
    'minecraft:wheat', 'minecraft:honey_bottle'
  ]).id('icraft:fd_honey_cookie')


  // ═══ NETHER'S DELIGHT — Nether-themed Cooking Pot Meals ═══

  safeShapeless('nethersdelight:strider_stew', [
    'minecraft:cooked_porkchop', 'minecraft:warped_fungus', 'minecraft:crimson_fungus', 'minecraft:bowl'
  ]).id('icraft:nd_strider_stew')

  safeShapeless('nethersdelight:hoglin_ear', [
    'minecraft:cooked_porkchop', 'minecraft:crimson_fungus', 'minecraft:bowl'
  ]).id('icraft:nd_hoglin_ear')

  safeShapeless('nethersdelight:magma_gelatin', [
    'minecraft:magma_cream', 'minecraft:sugar', 'minecraft:bowl'
  ]).id('icraft:nd_magma_gelatin')


  // ═══ CULTURAL DELIGHTS — Cultural food recipes ═══

  safeShapeless('culturaldelights:kimchi', [
    'farmersdelight:cabbage', 'minecraft:carrot', 'farmersdelight:onion', 'minecraft:bowl'
  ]).id('icraft:cd_kimchi')

  safeShapeless('culturaldelights:tortilla', [
    'minecraft:wheat', 'minecraft:egg'
  ]).id('icraft:cd_tortilla')

  safeShapeless('culturaldelights:burrito', [
    'minecraft:cooked_beef', 'farmersdelight:rice', 'farmersdelight:tomato', 'minecraft:bread'
  ]).id('icraft:cd_burrito')

  safeShapeless('culturaldelights:elote', [
    'culturaldelights:corn_cob', 'minecraft:sugar', 'minecraft:stick'
  ]).id('icraft:cd_elote')

  safeShapeless('culturaldelights:gyoza', [
    'minecraft:cooked_porkchop', 'farmersdelight:cabbage', 'farmersdelight:raw_pasta'
  ]).id('icraft:cd_gyoza')

  safeShapeless('culturaldelights:potsticker', [
    'minecraft:cooked_porkchop', 'farmersdelight:onion', 'farmersdelight:raw_pasta'
  ]).id('icraft:cd_potsticker')


  // ═══ DELIGHTFUL — Extra food variety ═══

  safeShapeless('delightful:nut_mix', [
    'minecraft:sweet_berries', 'delightful:acorn', 'minecraft:bowl'
  ]).id('icraft:df_nut_mix')

  safeShapeless('delightful:marshmallow_stick', [
    'minecraft:sugar', 'minecraft:sugar', 'minecraft:stick'
  ]).id('icraft:df_marshmallow_stick')

  safeShapeless('delightful:cheeseburger', [
    'minecraft:cooked_beef', 'farmersdelight:tomato', 'minecraft:milk_bucket', 'minecraft:bread'
  ]).id('icraft:df_cheeseburger')

  safeShapeless('delightful:deluxe_cheeseburger', [
    'minecraft:cooked_beef', 'farmersdelight:tomato', 'farmersdelight:cabbage',
    'minecraft:milk_bucket', 'minecraft:bread'
  ]).id('icraft:df_deluxe_cheeseburger')

  safeShapeless('delightful:salmonberry_pie', [
    'delightful:salmonberry', 'minecraft:sugar', 'minecraft:wheat', 'minecraft:egg'
  ]).id('icraft:df_salmonberry_pie')


  // ═══ BREWIN' AND CHEWIN' — Brewing/fermentation recipes ═══
  // These use their own keg block, but we add crafting alternatives too.

  safeShapeless('brewinandchewin:beer', [
    'minecraft:wheat', 'minecraft:wheat', 'minecraft:sugar', 'minecraft:glass_bottle'
  ]).id('icraft:bc_beer')

  safeShapeless('brewinandchewin:vodka', [
    'minecraft:potato', 'minecraft:potato', 'minecraft:sugar', 'minecraft:glass_bottle'
  ]).id('icraft:bc_vodka')

  safeShapeless('brewinandchewin:rice_wine', [
    'farmersdelight:rice', 'farmersdelight:rice', 'minecraft:sugar', 'minecraft:glass_bottle'
  ]).id('icraft:bc_rice_wine')

  safeShapeless('brewinandchewin:mead', [
    'minecraft:honey_bottle', 'minecraft:sugar', 'minecraft:glass_bottle'
  ]).id('icraft:bc_mead')

  safeShapeless('brewinandchewin:apple_cider', [
    'minecraft:apple', 'minecraft:apple', 'minecraft:sugar', 'minecraft:glass_bottle'
  ]).id('icraft:bc_apple_cider')

  safeShapeless('brewinandchewin:pale_jane', [
    'minecraft:wheat', 'minecraft:honey_bottle', 'minecraft:glass_bottle'
  ]).id('icraft:bc_pale_jane')

  safeShapeless('brewinandchewin:crimson_ale', [
    'minecraft:crimson_fungus', 'minecraft:nether_wart', 'minecraft:sugar', 'minecraft:glass_bottle'
  ]).id('icraft:bc_crimson_ale')

  safeShapeless('brewinandchewin:dread_nog', [
    'minecraft:egg', 'minecraft:sugar', 'minecraft:milk_bucket', 'minecraft:glass_bottle'
  ]).id('icraft:bc_dread_nog')

  safeShapeless('brewinandchewin:salty_folly', [
    'minecraft:dried_kelp', 'minecraft:sugar', 'minecraft:glass_bottle'
  ]).id('icraft:bc_salty_folly')

  safeShapeless('brewinandchewin:steel_toe_stout', [
    'minecraft:wheat', 'minecraft:cocoa_beans', 'minecraft:sugar', 'minecraft:glass_bottle'
  ]).id('icraft:bc_steel_toe_stout')

  safeShapeless('brewinandchewin:glittering_grenadine', [
    'minecraft:glow_berries', 'minecraft:sweet_berries', 'minecraft:sugar', 'minecraft:glass_bottle'
  ]).id('icraft:bc_glittering_grenadine')

  safeShapeless('brewinandchewin:bloody_mary', [
    'farmersdelight:tomato', 'farmersdelight:onion', 'minecraft:sugar', 'minecraft:glass_bottle'
  ]).id('icraft:bc_bloody_mary')

  safeShapeless('brewinandchewin:red_rum', [
    'minecraft:sweet_berries', 'minecraft:sugar', 'minecraft:sugar', 'minecraft:glass_bottle'
  ]).id('icraft:bc_red_rum')

  safeShapeless('brewinandchewin:withering_dross', [
    'minecraft:nether_wart', 'minecraft:spider_eye', 'minecraft:sugar', 'minecraft:glass_bottle'
  ]).id('icraft:bc_withering_dross')

  safeShapeless('brewinandchewin:kombucha', [
    'minecraft:brown_mushroom', 'minecraft:sugar', 'minecraft:glass_bottle'
  ]).id('icraft:bc_kombucha')


  // ═══ ALEX'S DELIGHT — Alex's Mobs food integration ═══

  safeShapeless('alexsdelight:bison_stew', [
    'alexsmobs:cooked_moose_ribs', 'minecraft:potato', 'minecraft:carrot', 'minecraft:bowl'
  ]).id('icraft:ad_bison_stew')

  safeShapeless('alexsdelight:kangaroo_stew', [
    'alexsmobs:cooked_kangaroo_meat', 'minecraft:carrot', 'minecraft:bowl'
  ]).id('icraft:ad_kangaroo_stew')

  safeShapeless('alexsdelight:lobster_roll', [
    'alexsmobs:cooked_lobster_tail', 'farmersdelight:cabbage', 'minecraft:bread'
  ]).id('icraft:ad_lobster_roll')


  console.log('[IridescentCraft] cooking_conversion.js loaded — crafting table alternatives for cooking pot recipes')
})
