// =============================================================================
// DIMENSION GATES — Priority 2
// Restricts dimension access per tier using AStages
// Server script (reloadable with /reload)
//
// API: AStages.addRestrictionForDimension(id, stage, ResourceLocation)
// =============================================================================

const $ResourceLocation = Java.loadClass('net.minecraft.resources.ResourceLocation')

// Helper to create ResourceLocation
function rl(id) {
  return new $ResourceLocation(id)
}

// =========================================================================
// TIER 2 DIMENSIONS — Twilight Forest, Blue Skies, The Aether
// Locked until player has tier_2 stage
// =========================================================================

AStages.addRestrictionForDimension('modpack/dim_twilight', 'tier_2', rl('twilightforest:twilight_forest'))
AStages.addRestrictionForDimension('modpack/dim_everbright', 'tier_2', rl('blue_skies:everbright'))
AStages.addRestrictionForDimension('modpack/dim_everdawn', 'tier_2', rl('blue_skies:everdawn'))
AStages.addRestrictionForDimension('modpack/dim_aether', 'tier_2', rl('aether:the_aether'))

// =========================================================================
// TIER 3 DIMENSIONS — Undergarden, Deeper and Darker, Nether
// Locked until player has tier_3 stage
// =========================================================================

AStages.addRestrictionForDimension('modpack/dim_undergarden', 'tier_3', rl('undergarden:undergarden'))
AStages.addRestrictionForDimension('modpack/dim_otherside', 'tier_3', rl('deeperdarker:otherside'))

// NETHER — Major design change: gated to Tier 3
AStages.addRestrictionForDimension('modpack/dim_nether', 'tier_3', rl('minecraft:the_nether'))

// The Abyss: The Other Side — Tier 3 dimension
AStages.addRestrictionForDimension('modpack/dim_abyss', 'tier_3', rl('theabyss:the_abyss'))

// =========================================================================
// TIER 4 DIMENSIONS — The End
// Locked until player has tier_4 stage
// =========================================================================

// NOTE: Deep Aether (deep_aether) is INSTALLED but registers NO standalone
// dimension — in 1.20.1-1.1.7 it injects content into aether:the_aether (the
// base Aether, already gated at tier_2). There is no 'deep_aether:the_aether'
// dimension to gate, so the former tier_4 line was removed (it silently no-op'd).

// THE END — Major design change: gated to Tier 4
AStages.addRestrictionForDimension('modpack/dim_end', 'tier_4', rl('minecraft:the_end'))
