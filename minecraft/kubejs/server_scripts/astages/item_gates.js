// =============================================================================
// ITEM GATES — Priority 2
// Restricts tier-inappropriate items from being used/equipped
// Server script (reloadable with /reload)
// =============================================================================
// Design philosophy: Items can't be USED until the right tier, but curios are
// NEVER gated (per design doc Section 9). Weapons and armor from higher-tier
// mods are restricted. Players who obtain items early (boss drops, etc.) can
// hold them but not use them effectively.
// =============================================================================

// =========================================================================
// TIER 2 ITEMS — Thermal, Industrial Foregoing (basic), Ars Nouveau
// These mod items are restricted until tier_2
// =========================================================================

// Thermal Series — all items gated to tier_2
AStages.addRestrictionForMod("modpack/items_thermal_foundation", "tier_2", "thermal")
    .setHideInJEI(true)
    .setCanAttack(false)
    .setCanBePlaced(false)
    .setCanItemBeRightClicked(false)
    .setHiddenName(stack => Component.literal("§7[Tier 2] ").append(stack.getHoverName()))
    // Allow basic Thermal ores/ingots to exist in inventory (for tier-skip transmutation)
    // but not be used in machines
    .ignoreTags("forge:ingots", "forge:ores", "forge:raw_materials", "forge:nuggets", "forge:storage_blocks")

AStages.addRestrictionForMod("modpack/items_thermal_expansion", "tier_2", "thermal_expansion")
    .setHideInJEI(true)
    .setCanBePlaced(false)
    .setCanItemBeRightClicked(false)
    .setHiddenName(stack => Component.literal("§7[Tier 2] ").append(stack.getHoverName()))

AStages.addRestrictionForMod("modpack/items_thermal_dynamics", "tier_2", "thermal_dynamics")
    .setHideInJEI(true)
    .setCanBePlaced(false)
    .setHiddenName(stack => Component.literal("§7[Tier 2] ").append(stack.getHoverName()))

// Industrial Foregoing — basic machines gated to tier_2
// NOTE: Advanced IF machines are gated to tier_3 separately below
AStages.addRestrictionForMod("modpack/items_if", "tier_2", "industrialforegoing")
    .setHideInJEI(true)
    .setCanBePlaced(false)
    .setCanItemBeRightClicked(false)
    .setHiddenName(stack => Component.literal("§7[Tier 2] ").append(stack.getHoverName()))

// Ars Nouveau — gated to tier_2
AStages.addRestrictionForMod("modpack/items_ars", "tier_2", "ars_nouveau")
    .setHideInJEI(true)
    .setCanAttack(false)
    .setCanItemBeRightClicked(false)
    .setHiddenName(stack => Component.literal("§7[Tier 2] ").append(stack.getHoverName()))

// =========================================================================
// TIER 3 ITEMS — Mekanism (basic), Occultism, Forbidden & Arcanus,
//                Refined Storage, XNet
// =========================================================================

// Mekanism — all items gated to tier_3
AStages.addRestrictionForMod("modpack/items_mekanism", "tier_3", "mekanism")
    .setHideInJEI(true)
    .setCanBePlaced(false)
    .setCanItemBeRightClicked(false)
    .setHiddenName(stack => Component.literal("§d[Tier 3] ").append(stack.getHoverName()))
    .ignoreTags("forge:ingots", "forge:ores", "forge:raw_materials", "forge:nuggets")

AStages.addRestrictionForMod("modpack/items_mekanism_gen", "tier_3", "mekanismgenerators")
    .setHideInJEI(true)
    .setCanBePlaced(false)
    .setHiddenName(stack => Component.literal("§d[Tier 3] ").append(stack.getHoverName()))

// Occultism — gated to tier_3
AStages.addRestrictionForMod("modpack/items_occultism", "tier_3", "occultism")
    .setHideInJEI(true)
    .setCanItemBeRightClicked(false)
    .setHiddenName(stack => Component.literal("§d[Tier 3] ").append(stack.getHoverName()))

// Forbidden & Arcanus — gated to tier_3
AStages.addRestrictionForMod("modpack/items_forbidden", "tier_3", "forbidden_arcanus")
    .setHideInJEI(true)
    .setCanItemBeRightClicked(false)
    .setHiddenName(stack => Component.literal("§d[Tier 3] ").append(stack.getHoverName()))

// Refined Storage — gated to tier_3
AStages.addRestrictionForMod("modpack/items_rs", "tier_3", "refinedstorage")
    .setHideInJEI(true)
    .setCanBePlaced(false)
    .setCanItemBeRightClicked(false)
    .setHiddenName(stack => Component.literal("§d[Tier 3] ").append(stack.getHoverName()))

// XNet — gated to tier_3
AStages.addRestrictionForMod("modpack/items_xnet", "tier_3", "xnet")
    .setHideInJEI(true)
    .setCanBePlaced(false)
    .setHiddenName(stack => Component.literal("§d[Tier 3] ").append(stack.getHoverName()))

// =========================================================================
// TIER 4 ITEMS — Mahou Tsukai, RFTools Dimensions,
//                End Portal Recipe, EnderChests, EnderStorage
// =========================================================================

// Mahou Tsukai — gated to tier_4
AStages.addRestrictionForMod("modpack/items_mahou", "tier_4", "mahoutsukai")
    .setHideInJEI(true)
    .setCanAttack(false)
    .setCanItemBeRightClicked(false)
    .setHiddenName(stack => Component.literal("§c[Tier 4] ").append(stack.getHoverName()))

// RFTools Dimensions — gated to tier_4
AStages.addRestrictionForMod("modpack/items_rftoolsdim", "tier_4", "rftoolsdim")
    .setHideInJEI(true)
    .setCanBePlaced(false)
    .setCanItemBeRightClicked(false)
    .setHiddenName(stack => Component.literal("§c[Tier 4] ").append(stack.getHoverName()))

// End Portal Recipe mod — gated to tier_4
AStages.addRestrictionForMod("modpack/items_endportal", "tier_4", "endportalrecipe")
    .setHideInJEI(true)
    .setHiddenName(stack => Component.literal("§c[Tier 4] ").append(stack.getHoverName()))

// EnderChests — gated to tier_4 (cross-dimensional storage is endgame)
AStages.addRestrictionForMod("modpack/items_enderchests", "tier_4", "enderchests")
    .setHideInJEI(true)
    .setCanBePlaced(false)
    .setHiddenName(stack => Component.literal("§c[Tier 4] ").append(stack.getHoverName()))

// EnderStorage — gated to tier_4
AStages.addRestrictionForMod("modpack/items_enderstorage", "tier_4", "enderstorage")
    .setHideInJEI(true)
    .setCanBePlaced(false)
    .setHiddenName(stack => Component.literal("§c[Tier 4] ").append(stack.getHoverName()))

// =========================================================================
// SPECIFIC ITEM RESTRICTIONS — Individual items from ungated mods
// that need tier-specific gating
// =========================================================================

// Diamond gear — restricted until tier_3 (diamonds are tier_3 material)
AStages.addRestrictionForItem("modpack/items_diamond_gear", "tier_3",
    "minecraft:diamond_sword", "minecraft:diamond_pickaxe", "minecraft:diamond_axe",
    "minecraft:diamond_shovel", "minecraft:diamond_hoe",
    "minecraft:diamond_helmet", "minecraft:diamond_chestplate",
    "minecraft:diamond_leggings", "minecraft:diamond_boots"
)
    .setCanAttack(false)
    .setCanBeEquipped(false)
    .setCanBeDig(false)
    .setHiddenName(stack => Component.literal("§d[Tier 3] ").append(stack.getHoverName()))

// Netherite gear — restricted until tier_4
AStages.addRestrictionForItem("modpack/items_netherite_gear", "tier_4",
    "minecraft:netherite_sword", "minecraft:netherite_pickaxe", "minecraft:netherite_axe",
    "minecraft:netherite_shovel", "minecraft:netherite_hoe",
    "minecraft:netherite_helmet", "minecraft:netherite_chestplate",
    "minecraft:netherite_leggings", "minecraft:netherite_boots"
)
    .setCanAttack(false)
    .setCanBeEquipped(false)
    .setCanBeDig(false)
    .setHiddenName(stack => Component.literal("§c[Tier 4] ").append(stack.getHoverName()))

// NOTE: Simply Swords uniques are NOT item-gated — they're loot-gated.
// If a player somehow gets one early, that's a "win, not an exploit" per design doc.
// Same for curios/artifacts — equipping is NEVER gated.
