// =============================================================================
// ITEM GATES — Priority 2
// Restricts tier-inappropriate items from being used/equipped
// Server script (reloadable with /reload)
// =============================================================================
// Design philosophy: Items can't be USED until the right tier, but curios are
// NEVER gated (per design doc Section 9). Weapons and armor from higher-tier
// mods are restricted. Players who obtain items early (boss drops, etc.) can
// hold them but not use them effectively.
//
// API: AStages.addRestrictionForItem(id, stage, Item)  — needs Item object
//      AStages.addRestrictionForMod(id, stage, modId)  — string mod ID
// =============================================================================

// Helper: register item restriction from a string ID
function stageItem(restrictionId, tier, itemId) {
  AStages.addRestrictionForItem(restrictionId, tier, Item.of(itemId).item)
}

// =========================================================================
// TIER 2 ITEMS — Thermal, Industrial Foregoing (basic), Ars Nouveau
// These mod items are restricted until tier_2
// =========================================================================

// Thermal Series — all items gated to tier_2
AStages.addRestrictionForMod('modpack/items_thermal', 'tier_2', 'thermal')

// Industrial Foregoing — basic machines gated to tier_2
AStages.addRestrictionForMod('modpack/items_if', 'tier_2', 'industrialforegoing')

// Ars Nouveau — gated to tier_2
AStages.addRestrictionForMod('modpack/items_ars', 'tier_2', 'ars_nouveau')

// =========================================================================
// TIER 3 ITEMS — Mekanism (basic), Occultism, Forbidden & Arcanus,
//                Refined Storage, XNet
// =========================================================================

// Mekanism — all items gated to tier_3
AStages.addRestrictionForMod('modpack/items_mekanism', 'tier_3', 'mekanism')
AStages.addRestrictionForMod('modpack/items_mekanism_gen', 'tier_3', 'mekanismgenerators')

// Occultism — gated to tier_3
AStages.addRestrictionForMod('modpack/items_occultism', 'tier_3', 'occultism')

// Forbidden & Arcanus — gated to tier_3
AStages.addRestrictionForMod('modpack/items_forbidden', 'tier_3', 'forbidden_arcanus')

// Refined Storage — gated to tier_3
AStages.addRestrictionForMod('modpack/items_rs', 'tier_3', 'refinedstorage')

// XNet — gated to tier_3
AStages.addRestrictionForMod('modpack/items_xnet', 'tier_3', 'xnet')

// =========================================================================
// TIER 4 ITEMS — Mahou Tsukai, RFTools Dimensions,
//                End Portal Recipe, EnderChests, EnderStorage
// =========================================================================

// Mahou Tsukai — gated to tier_4
AStages.addRestrictionForMod('modpack/items_mahou', 'tier_4', 'mahoutsukai')

// RFTools Dimensions — gated to tier_4
AStages.addRestrictionForMod('modpack/items_rftoolsdim', 'tier_4', 'rftoolsdim')

// End Portal Recipe mod — gated to tier_4
AStages.addRestrictionForMod('modpack/items_endportal', 'tier_4', 'endportalrecipe')

// EnderChests — gated to tier_4 (cross-dimensional storage is endgame)
AStages.addRestrictionForMod('modpack/items_enderchests', 'tier_4', 'enderchests')

// EnderStorage — gated to tier_4
AStages.addRestrictionForMod('modpack/items_enderstorage', 'tier_4', 'enderstorage')

// =========================================================================
// SPECIFIC ITEM RESTRICTIONS — Individual items from ungated mods
// that need tier-specific gating
// =========================================================================

// Diamond gear — restricted until tier_3 (diamonds are tier_3 material)
let diamondGear = [
  'minecraft:diamond_sword', 'minecraft:diamond_pickaxe', 'minecraft:diamond_axe',
  'minecraft:diamond_shovel', 'minecraft:diamond_hoe',
  'minecraft:diamond_helmet', 'minecraft:diamond_chestplate',
  'minecraft:diamond_leggings', 'minecraft:diamond_boots'
]
diamondGear.forEach(id => {
  stageItem('modpack/items_diamond_' + id.replace('minecraft:', ''), 'tier_3', id)
})

// Netherite gear — restricted until tier_4
let netheriteGear = [
  'minecraft:netherite_sword', 'minecraft:netherite_pickaxe', 'minecraft:netherite_axe',
  'minecraft:netherite_shovel', 'minecraft:netherite_hoe',
  'minecraft:netherite_helmet', 'minecraft:netherite_chestplate',
  'minecraft:netherite_leggings', 'minecraft:netherite_boots'
]
netheriteGear.forEach(id => {
  stageItem('modpack/items_netherite_' + id.replace('minecraft:', ''), 'tier_4', id)
})

// NOTE: Simply Swords uniques are NOT item-gated — they're loot-gated.
// If a player somehow gets one early, that's a "win, not an exploit" per design doc.
// Same for curios/artifacts — equipping is NEVER gated.
