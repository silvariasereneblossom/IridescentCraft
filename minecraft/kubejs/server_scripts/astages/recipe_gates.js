// =============================================================================
// RECIPE GATES — Priority 2
// Restricts tier-inappropriate crafting recipes via AStages
// Server script (reloadable with /reload)
// =============================================================================
// NOTE: AStages recipe restriction only covers vanilla recipe types
// (crafting shaped/shapeless, smelting, blasting, smoking, smithing, campfire).
// Mod machine recipes (Thermal, Mekanism, Create, etc.) need the
// "Recipe Machine Stages" mod by @Sixih for full coverage.
// For now, item gating (item_gates.js) handles most mod machine restrictions
// since players can't place/interact with the machines themselves.
// =============================================================================

// =========================================================================
// TIER 3 RECIPES — Diamond-related crafting
// Diamonds are a Tier 3 material; basic diamond crafting is restricted
// =========================================================================

// These recipe IDs must be verified in-game. Use /kubejs dump_registry minecraft:recipe_type
// and check JEI for the actual recipe IDs.

// Vanilla diamond tool recipes
AStages.addRestrictionForRecipe("modpack/recipe_diamond_sword", "tier_3", "minecraft:crafting", "minecraft:diamond_sword")
AStages.addRestrictionForRecipe("modpack/recipe_diamond_pick", "tier_3", "minecraft:crafting", "minecraft:diamond_pickaxe")
AStages.addRestrictionForRecipe("modpack/recipe_diamond_axe", "tier_3", "minecraft:crafting", "minecraft:diamond_axe")
AStages.addRestrictionForRecipe("modpack/recipe_diamond_shovel", "tier_3", "minecraft:crafting", "minecraft:diamond_shovel")
AStages.addRestrictionForRecipe("modpack/recipe_diamond_hoe", "tier_3", "minecraft:crafting", "minecraft:diamond_hoe")

// Vanilla diamond armor recipes
AStages.addRestrictionForRecipe("modpack/recipe_diamond_helmet", "tier_3", "minecraft:crafting", "minecraft:diamond_helmet")
AStages.addRestrictionForRecipe("modpack/recipe_diamond_chest", "tier_3", "minecraft:crafting", "minecraft:diamond_chestplate")
AStages.addRestrictionForRecipe("modpack/recipe_diamond_legs", "tier_3", "minecraft:crafting", "minecraft:diamond_leggings")
AStages.addRestrictionForRecipe("modpack/recipe_diamond_boots", "tier_3", "minecraft:crafting", "minecraft:diamond_boots")

// =========================================================================
// TIER 4 RECIPES — Netherite smithing
// =========================================================================

AStages.addRestrictionForRecipe("modpack/recipe_netherite_ingot", "tier_4", "minecraft:crafting", "minecraft:netherite_ingot")

// Netherite upgrade smithing template recipes
AStages.addRestrictionForRecipe("modpack/recipe_netherite_sword", "tier_4", "minecraft:smithing", "minecraft:netherite_upgrade_smithing_template")

// NOTE: In 1.20.1, netherite upgrades use smithing templates. The individual
// upgrade recipes (sword, pick, etc.) all use the same smithing template.
// Gating the template item itself via item_gates.js may be more effective.
// Verify recipe IDs in-game.

// =========================================================================
// MOD RECIPE GATING — Entire mod recipe sets
// Uses addRestrictionForModRecipe to gate all recipes from a mod
// =========================================================================

// NOTE: These gate ALL vanilla-type recipes from these mods.
// Mod-specific machine recipes (e.g. Thermal Pulverizer recipes) are NOT
// covered by this and need Recipe Machine Stages mod or item gating.

// Ars Nouveau recipes — tier_2
AStages.addRestrictionForModRecipe("modpack/recipes_ars", "tier_2", "ars_nouveau")

// Occultism recipes — tier_3
AStages.addRestrictionForModRecipe("modpack/recipes_occultism", "tier_3", "occultism")

// Forbidden & Arcanus recipes — tier_3
AStages.addRestrictionForModRecipe("modpack/recipes_forbidden", "tier_3", "forbidden_arcanus")

// Mahou Tsukai recipes — tier_4
AStages.addRestrictionForModRecipe("modpack/recipes_mahou", "tier_4", "mahoutsukai")

// RFTools Dimensions recipes — tier_4
AStages.addRestrictionForModRecipe("modpack/recipes_rftoolsdim", "tier_4", "rftoolsdim")
