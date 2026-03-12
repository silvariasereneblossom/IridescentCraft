// =============================================================================
// DIMENSION GATES — Priority 2
// Restricts dimension access per tier using AStages
// Server script (reloadable with /reload)
// =============================================================================

// =========================================================================
// TIER 2 DIMENSIONS — Twilight Forest, Blue Skies, The Aether
// Locked until player has tier_2 stage
// =========================================================================

AStages.addRestrictionForDimension("modpack/dim_twilight", "tier_2", "twilightforest:twilight_forest")
    .setDimensionMessage(dim => Component.literal("§cYou need §bTier 2 §cto enter the Twilight Forest. Complete a Tier 2 gate quest!"))

AStages.addRestrictionForDimension("modpack/dim_everbright", "tier_2", "blue_skies:everbright")
    .setDimensionMessage(dim => Component.literal("§cYou need §bTier 2 §cto enter Everbright. Complete a Tier 2 gate quest!"))

AStages.addRestrictionForDimension("modpack/dim_everdawn", "tier_2", "blue_skies:everdawn")
    .setDimensionMessage(dim => Component.literal("§cYou need §bTier 2 §cto enter Everdawn. Complete a Tier 2 gate quest!"))

AStages.addRestrictionForDimension("modpack/dim_aether", "tier_2", "aether:the_aether")
    .setDimensionMessage(dim => Component.literal("§cYou need §bTier 2 §cto enter The Aether. Complete a Tier 2 gate quest!"))

// =========================================================================
// TIER 3 DIMENSIONS — Undergarden, Deeper and Darker, Nether
// Locked until player has tier_3 stage
// =========================================================================

AStages.addRestrictionForDimension("modpack/dim_undergarden", "tier_3", "undergarden:undergarden")
    .setDimensionMessage(dim => Component.literal("§cYou need §dTier 3 §cto enter The Undergarden. Complete a Tier 3 gate quest!"))

AStages.addRestrictionForDimension("modpack/dim_otherside", "tier_3", "deeperdarker:otherside")
    .setDimensionMessage(dim => Component.literal("§cYou need §dTier 3 §cto enter The Otherside. Complete a Tier 3 gate quest!"))

// NETHER — Major design change: gated to Tier 3
AStages.addRestrictionForDimension("modpack/dim_nether", "tier_3", "minecraft:the_nether")
    .setDimensionMessage(dim => Component.literal("§cThe Nether is sealed. You need §dTier 3 §cto breach the barrier."))

// The Abyss: The Other Side — Tier 3 dimension
AStages.addRestrictionForDimension("modpack/dim_abyss", "tier_3", "theabyss:the_abyss")
    .setDimensionMessage(dim => Component.literal("§cYou need §dTier 3 §cto enter The Abyss."))

// =========================================================================
// TIER 4 DIMENSIONS — Deep Aether, The End
// Locked until player has tier_4 stage
// =========================================================================

AStages.addRestrictionForDimension("modpack/dim_deep_aether", "tier_4", "deep_aether:the_aether")
    .setDimensionMessage(dim => Component.literal("§cYou need §c§lTier 4 §cto enter the Deep Aether. Prove your worth!"))

// THE END — Major design change: gated to Tier 4
AStages.addRestrictionForDimension("modpack/dim_end", "tier_4", "minecraft:the_end")
    .setDimensionMessage(dim => Component.literal("§cThe End is sealed beyond comprehension. You need §c§lTier 4 §cto pierce the void."))
