// Remove crafting recipes that produce duplicate food items.
// Pairs with kubejs/client_scripts/food_dedup_jei_hide.js (which hides the
// items from JEI display). This script removes the underlying recipes so
// players can't craft the dupes via the workbench / smoker / cooking pot.
//
// Canonical mod per concept (see wiki/design/changelog.md):
//   raw crops + seeds  -> Pam HC2
//   prepared dishes    -> Farmer's Delight (where it has one) else Pam HC2
//   FD-addon dishes    -> the FD addon (Cultural, Delightful, etc.)
//
// The list is the same as client_scripts/food_dedup_jei_hide.js (81 ids since
// 2026-10-18: the twelve Thermal crop storage blocks added, five ids that are no
// item removed; decision list entry 10). Keep the two lists equal. Failure to
// find a recipe is soft -- the e.remove call no-ops if the output doesn't have a recipe.

ServerEvents.recipes(icraft.guard('food_dedup_recipes', 'ServerEvents.recipes', event => {
  const dupeOutputs = [
    // -- Thermal Cultivation (canonical: Pam HC2) --
    'thermal:amaranth', 'thermal:amaranth_block',
    'thermal:barley', 'thermal:barley_block',
    'thermal:carrot_cake',
    'thermal:chocolate_cake',
    'thermal:cooked_corn', 'thermal:cooked_eggplant',
    'thermal:corn', 'thermal:corn_block',
    'thermal:eggplant', 'thermal:eggplant_block',
    'thermal:flax', 'thermal:flax_block',
    'thermal:onion', 'thermal:onion_block',
    'thermal:peanut', 'thermal:peanut_block',
    'thermal:peanut_butter',
    'thermal:radish', 'thermal:radish_block',
    'thermal:rice', 'thermal:rice_block',
    'thermal:spinach', 'thermal:spinach_block',
    'thermal:spring_salad',
    'thermal:strawberry', 'thermal:strawberry_block',
    'thermal:stuffed_pepper',
    'thermal:tomato', 'thermal:tomato_block',

    // -- Blue Skies --
    'blue_skies:maple_sapling',

    // -- Vanilla Cookbook --
    'vanillacookbook:apple_juice',
    'vanillacookbook:apple_pie',
    'vanillacookbook:bacon_pancake',
    'vanillacookbook:baked_apple',
    'vanillacookbook:brownie',
    'vanillacookbook:carrot_cake',
    'vanillacookbook:cheese',
    'vanillacookbook:chicken_soup',
    'vanillacookbook:chocolate_cake',
    'vanillacookbook:chocolate_ice_cream',
    'vanillacookbook:chocolate_milk',
    'vanillacookbook:chorus_juice',
    'vanillacookbook:cooked_egg',
    'vanillacookbook:fish_and_chips',
    'vanillacookbook:fish_stew',
    'vanillacookbook:french_toast',
    'vanillacookbook:fruit_salad',
    'vanillacookbook:garden_soup',
    'vanillacookbook:honey_cookie',
    'vanillacookbook:ice_cream',
    'vanillacookbook:mashed_potatoes',
    'vanillacookbook:meatloaf',
    'vanillacookbook:melon_juice',
    'vanillacookbook:milk_bottle',
    'vanillacookbook:pancake',
    'vanillacookbook:potato_chips',
    'vanillacookbook:pumpkin_soup',
    'vanillacookbook:trail_mix',

    // -- Pam HC2 FoodExt internal dupes --
    'pamhc2foodextended:bakedbeansitem',
    'pamhc2foodextended:carrotjuiceitem',
    'pamhc2foodextended:chocolatemilkitem',
    'pamhc2foodextended:chocolatemilkshakeitem',
    'pamhc2foodextended:crackersandcheeseitem',
    'pamhc2foodextended:friedonionsitem',
    'pamhc2foodextended:friedriceitem',
    'pamhc2foodextended:powdereddonutitem',

    // -- Cultural Delights raw crops --
    'culturaldelights:avocado',
    'culturaldelights:avocado_sapling',
    'culturaldelights:cucumber',
    'culturaldelights:cucumber_seeds',
    'culturaldelights:eggplant',
    'culturaldelights:eggplant_seeds',
    'culturaldelights:smoked_corn',
    'culturaldelights:smoked_eggplant',
    'culturaldelights:smoked_tomato',
    'culturaldelights:tortilla',

    // -- Delightful raw dupes --
    'delightful:acorn',
    'delightful:cantaloupe',
    'delightful:cantaloupe_seeds',
  ]
  // One filter for the whole list: KubeJS walks every recipe once per remove() call
  // (until 2026-10-30, one walk per output; RAM audit F7).
  let removed = 0
  try {
    event.remove({ output: dupeOutputs })
    removed = dupeOutputs.length
  } catch (e) { /* recipe may not exist */ }
  console.log(`[icraft food_dedup] Removed recipes for ${removed} duplicate outputs`)
}))
