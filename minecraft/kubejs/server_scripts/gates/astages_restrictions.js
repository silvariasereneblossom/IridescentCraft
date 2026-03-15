// =============================================================================
// ASTAGES RESTRICTIONS — Complete tier gating via AStages native API
// Design Doc Section 2: Staging Implementation
//
// AStages natively handles (per-player):
//   - Item use/equip/mine/attack/place/pickup/drop restriction
//   - JEI hiding (restricted items hidden automatically)
//   - Jade tooltip hiding (blocks show as "Unfamiliar Block")
//   - Ore replacement (render as host stone until stage unlocked)
//   - Dimension access blocking
//   - Mob interaction gating (breed/mount/tame)
//   - Recipe hiding
//   - Screen/GUI blocking
//
// This single file replaces:
//   - item_gates.js (manual KubeJS enforcement)
//   - dimension_gates.js (manual changeDimension cancellation)
//   - jei_tier_hiding.js (global JEI hiding)
//
// Stages: tier_1 (default/all players), tier_2, tier_3, tier_4
//
// API (from AStages source code):
//   AStages.addRestrictionForItem(id, stage, Item)       — Item object via Item.of().item
//   AStages.addRestrictionForMod(id, stage, modId)       — string mod ID
//   AStages.addRestrictionForDimension(id, stage, RL)    — ResourceLocation
//   AStages.addRestrictionForOre(id, stage, blockState, replacementBlockState)
// =============================================================================

// Load Java class for ResourceLocation construction
const ResourceLocation = Java.loadClass('net.minecraft.resources.ResourceLocation')

// --- Helpers ---

/**
 * Register a mod restriction for an entire mod.
 */
function stageMod(tier, modId, restrictionId) {
  AStages.addRestrictionForMod(restrictionId, tier, modId)
}

/**
 * Register item restrictions for a list of item IDs.
 * AStages needs actual Item objects, not strings — use Item.of(id).item.
 */
function stageItems(tier, items, idPrefix) {
  items.forEach(itemId => {
    let shortName = itemId.replace(':', '_')
    AStages.addRestrictionForItem(
      idPrefix + '/' + shortName,
      tier,
      Item.of(itemId).item
    )
  })
}

/**
 * Register an ore replacement restriction.
 * Needs actual BlockState objects.
 */
function stageOre(tier, oreId, replacementId, restrictionId) {
  AStages.addRestrictionForOre(
    restrictionId,
    tier,
    Block.getBlock(oreId).defaultBlockState(),
    Block.getBlock(replacementId).defaultBlockState()
  )
}

/**
 * Register a dimension restriction.
 * Needs a ResourceLocation, not a string.
 */
function stageDimension(tier, dimId, restrictionId) {
  AStages.addRestrictionForDimension(restrictionId, tier, new ResourceLocation(dimId))
}


// =============================================================================
// REGISTRATION — register restrictions at server load
// =============================================================================

ServerEvents.loaded(event => {

  // =========================================================================
  // TIER 2 — Thermal, IF basic, Ars Nouveau, T2 dimension materials
  // =========================================================================

  // -- Mod restrictions --
  stageMod('tier_2', 'thermal', 'modpack/mod_thermal')
  stageMod('tier_2', 'industrialforegoing', 'modpack/mod_if')
  stageMod('tier_2', 'ars_nouveau', 'modpack/mod_ars')

  // -- Individual item restrictions --
  stageItems('tier_2', [
    // Twilight Forest materials
    'twilightforest:steeleaf_ingot',
    'twilightforest:ironwood_ingot',
    'twilightforest:fiery_ingot',
    'twilightforest:knightmetal_ingot',
    'twilightforest:fiery_sword',
    'twilightforest:fiery_pickaxe',
    // Blue Skies materials
    'blue_skies:pyrope_gem',
    'blue_skies:aquite',
    'blue_skies:charoite',
    'blue_skies:horizonite_ingot',
    // Aether materials
    'aether:zanite_gemstone',
    'aether:gravitite',
    'aether:ambrosium_shard',
    // Botania T2
    'botania:manasteel_ingot',
    'botania:mana_diamond',
    'botania:mana_pearl',
    // Apotheosis T2 workstations
    'apotheosis:simple_reforging_table',
    'apotheosis:gem_cutting_table',
    'apotheosis:sigil_of_socketing',
  ], 'modpack/item_t2')

  // -- Dimension restrictions --
  stageDimension('tier_2', 'twilightforest:twilight_forest', 'modpack/dim_twilight')
  stageDimension('tier_2', 'blue_skies:everbright', 'modpack/dim_everbright')
  stageDimension('tier_2', 'blue_skies:everdawn', 'modpack/dim_everdawn')
  stageDimension('tier_2', 'aether:the_aether', 'modpack/dim_aether')


  // =========================================================================
  // TIER 3 — Mekanism, RS, Occultism, F&A, diamonds, Nether access
  // =========================================================================

  // -- Mod restrictions --
  stageMod('tier_3', 'mekanism', 'modpack/mod_mekanism')
  stageMod('tier_3', 'mekanismgenerators', 'modpack/mod_mekgen')
  stageMod('tier_3', 'refinedstorage', 'modpack/mod_rs')
  stageMod('tier_3', 'extrastorage', 'modpack/mod_extrastorage')
  stageMod('tier_3', 'extradisks', 'modpack/mod_extradisks')
  stageMod('tier_3', 'rsrequestify', 'modpack/mod_rsrequestify')
  stageMod('tier_3', 'occultism', 'modpack/mod_occultism')
  stageMod('tier_3', 'forbidden_arcanus', 'modpack/mod_forbidden')
  stageMod('tier_3', 'xnet', 'modpack/mod_xnet')

  // -- Individual item restrictions --
  stageItems('tier_3', [
    'minecraft:diamond', 'minecraft:diamond_block',
    'minecraft:diamond_sword', 'minecraft:diamond_pickaxe',
    'minecraft:diamond_axe', 'minecraft:diamond_shovel',
    'minecraft:diamond_hoe',
    'minecraft:diamond_helmet', 'minecraft:diamond_chestplate',
    'minecraft:diamond_leggings', 'minecraft:diamond_boots',
    'minecraft:ancient_debris',
    'botania:terrasteel_ingot', 'botania:elementium_ingot',
    'thermal:enderium_ingot',
    // Apotheosis T3 workstations
    'apotheosis:reforging_table',
    'apotheosis:sigil_of_rebirth',
    'apotheosis:sigil_of_withdrawal',
  ], 'modpack/item_t3')

  // -- Ore replacement restrictions --
  stageOre('tier_3', 'minecraft:diamond_ore', 'minecraft:stone', 'modpack/ore_diamond')
  stageOre('tier_3', 'minecraft:deepslate_diamond_ore', 'minecraft:deepslate', 'modpack/ore_diamond_deep')
  stageOre('tier_3', 'minecraft:ancient_debris', 'minecraft:netherrack', 'modpack/ore_ancient_debris')
  stageOre('tier_3', 'mekanism:osmium_ore', 'minecraft:stone', 'modpack/ore_osmium')
  stageOre('tier_3', 'mekanism:deepslate_osmium_ore', 'minecraft:deepslate', 'modpack/ore_osmium_deep')

  // -- Dimension restrictions --
  stageDimension('tier_3', 'undergarden:undergarden', 'modpack/dim_undergarden')
  stageDimension('tier_3', 'deeperdarker:otherside', 'modpack/dim_otherside')
  stageDimension('tier_3', 'minecraft:the_nether', 'modpack/dim_nether')
  stageDimension('tier_3', 'theabyss:the_abyss', 'modpack/dim_abyss')


  // =========================================================================
  // TIER 4 — Mekanism advanced, RFTools Dims, Mahou Tsukai, netherite, End
  // =========================================================================

  // -- Mod restrictions --
  stageMod('tier_4', 'rftoolsdim', 'modpack/mod_rftoolsdim')
  stageMod('tier_4', 'mahoutsukai', 'modpack/mod_mahou')
  stageMod('tier_4', 'rsinfinitybooster', 'modpack/mod_rsinfinity')
  stageMod('tier_4', 'enderchests', 'modpack/mod_enderchests')
  stageMod('tier_4', 'enderstorage', 'modpack/mod_enderstorage')

  // -- Mekanism advanced items (mod is T3, these specific items need T4) --
  stageItems('tier_4', [
    'mekanism:digital_miner',
    'mekanism:fusion_reactor_controller',
    'mekanism:mekasuit_helmet', 'mekanism:mekasuit_bodyarmor',
    'mekanism:mekasuit_pants', 'mekanism:mekasuit_boots',
    'mekanism:meka_tool',
    'mekanism:qio_drive_array', 'mekanism:qio_dashboard',
    'mekanism:qio_importer', 'mekanism:qio_exporter',
    'mekanism:ultimate_control_circuit',
    'mekanism:antiprotonic_nucleosynthesizer',
    'mekanism:atomic_alloy',
    // RS advanced
    'extrastorage:storagepart_256k',
    'extrastorage:storagepart_1024k',
    'extrastorage:storagepart_4096k',
    // Netherite
    'minecraft:netherite_ingot', 'minecraft:netherite_block',
    'minecraft:netherite_scrap',
    'minecraft:netherite_sword', 'minecraft:netherite_pickaxe',
    'minecraft:netherite_axe', 'minecraft:netherite_shovel',
    'minecraft:netherite_hoe',
    'minecraft:netherite_helmet', 'minecraft:netherite_chestplate',
    'minecraft:netherite_leggings', 'minecraft:netherite_boots',
    // Botania endgame
    'botania:gaia_ingot',
    // End portal
    'endportalrecipe:portal_catalyst',
    // Apotheosis T4 workstations
    'apotheosis:augmenting_table',
    'apotheosis:sigil_of_enhancement',
    'apotheosis:sigil_of_unnaming',
  ], 'modpack/item_t4')

  // -- Dimension restrictions --
  stageDimension('tier_4', 'deep_aether:the_aether', 'modpack/dim_deep_aether')
  stageDimension('tier_4', 'minecraft:the_end', 'modpack/dim_end')

  console.log('[IridescentCraft] AStages native restrictions registered')
  console.log('  Tier 2: 3 mods + 19 items + 4 dimensions')
  console.log('  Tier 3: 9 mods + 18 items + 5 ores + 4 dimensions')
  console.log('  Tier 4: 5 mods + 33 items + 2 dimensions')
})
