// =============================================================================
// ORE GATES — Priority 2
// Hides/replaces tier-inappropriate ores until the player unlocks the right tier
// Server script (reloadable with /reload)
// =============================================================================
// Design doc: "Diamonds removed from worldgen" in Tier 1,
// "Full diamond access re-enabled" in Tier 3,
// "Netherite processable" in Tier 4.
//
// AStages ore restriction replaces the block visually AND functionally
// for players who lack the stage. The block reverts when stage is gained.
//
// API: AStages.addRestrictionForOre(id, stage, blockState, replacementBlockState)
//      BlockState objects obtained via Block.getBlock(id).defaultBlockState()
// =============================================================================

// =========================================================================
// TIER 2 ORES — Hidden until tier_2
// These ores exist in Tier 2 dimensions but shouldn't be accessible before then.
// Mostly handled by dimension gating, but some overworld ores may need gating.
// =========================================================================

// No overworld ores need tier_2 gating per design doc —
// Tier 2 materials come from Tier 2 dimensions which are already dimension-gated.

// =========================================================================
// TIER 3 ORES — Diamonds hidden until tier_3
// Design doc: "Diamonds removed from worldgen" in Tier 1-2
// "Full diamond access (re-enable worldgen or bulk crafting)" in Tier 3
// =========================================================================

// Overworld diamond ore → stone until tier_3
AStages.addRestrictionForOre('modpack/ore_diamond', 'tier_3',
    Block.getBlock('minecraft:diamond_ore').defaultBlockState(),
    Block.getBlock('minecraft:stone').defaultBlockState()
)

AStages.addRestrictionForOre('modpack/ore_diamond_deep', 'tier_3',
    Block.getBlock('minecraft:deepslate_diamond_ore').defaultBlockState(),
    Block.getBlock('minecraft:deepslate').defaultBlockState()
)

// =========================================================================
// TIER 4 ORES — Ancient Debris accessible via Nether (Tier 3 dimension gate),
// but Netherite processing is Tier 4. Ancient Debris itself is fine to mine
// in Tier 3 (it's in the Nether which is already Tier 3 gated).
// No ore replacement needed — the processing recipes are gated instead.
// =========================================================================

// NOTE: If you want to hide specific modded ores that spawn in the overworld
// but shouldn't be available until a certain tier, add them here. Examples:
//
// Osmium (Mekanism) — spawns in overworld but is a Tier 3 material
// AStages.addRestrictionForOre('modpack/ore_osmium', 'tier_3',
//     Block.getBlock('mekanism:osmium_ore').defaultBlockState(),
//     Block.getBlock('minecraft:stone').defaultBlockState()
// )
//
// AStages.addRestrictionForOre('modpack/ore_osmium_deep', 'tier_3',
//     Block.getBlock('mekanism:deepslate_osmium_ore').defaultBlockState(),
//     Block.getBlock('minecraft:deepslate').defaultBlockState()
// )
//
// IMPORTANT: Uncomment and test these — block IDs must be verified in-game
// using F3 or /kubejs hand. Incorrect IDs will silently fail.
