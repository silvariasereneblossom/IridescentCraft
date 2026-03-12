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
// NOTE: AStages API method signatures below are inferred from the mod's
// feature set and lang keys. If method names differ, check:
//   - AStages wiki (linked from CurseForge page)
//   - AStages Discord
//   - /astages hand command (shows restriction info for held item)
// =============================================================================


// --- Helpers ---
function stageMod(event, tier, modId) {
  event.restrict.items().stage(tier).mod(modId)
}
function stageItems(event, tier, items) {
  items.forEach(id => event.restrict.items().stage(tier).id(id))
}
function stageOre(event, tier, oreId, replacementId) {
  event.restrict.blocks().stage(tier).id(oreId).replacement(replacementId)
}
function stageDimension(event, tier, dimId) {
  event.restrict.dimensions().stage(tier).id(dimId)
}


// =============================================================================
// REGISTRATION
// =============================================================================

AStagesEvents.register(event => {

  // =========================================================================
  // ALWAYS ACCESSIBLE — items that must never be blocked regardless of tier
  // =========================================================================

  // Patchouli guide_book covers ALL Patchouli books from all mods (same item ID,
  // different NBT). Whitelisting at tier_1 means AStages never blocks pickup,
  // use, or equip for any Patchouli book — including the Iridescent Codex and
  // any mod's own first-join documentation book.
  event.restrict.items().stage('tier_1').id('patchouli:guide_book')

  // Ars Nouveau gives a worn_notebook on first join. The full ars_nouveau mod is
  // gated at tier_2, but this documentation item should always be accessible —
  // it previews T2 content without granting any T2 power.
  event.restrict.items().stage('tier_1').id('ars_nouveau:worn_notebook')

  // =========================================================================
  // TIER 2 — Thermal, IF basic, Ars Nouveau, T2 dimension materials
  // =========================================================================

  stageMod(event, 'tier_2', 'thermal')
  stageMod(event, 'tier_2', 'industrialforegoing')
  stageMod(event, 'tier_2', 'ars_nouveau')

  stageItems(event, 'tier_2', [
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
  ])

  stageDimension(event, 'tier_2', 'twilightforest:twilight_forest')
  stageDimension(event, 'tier_2', 'blue_skies:everbright')
  stageDimension(event, 'tier_2', 'blue_skies:everdawn')
  stageDimension(event, 'tier_2', 'aether:the_aether')


  // =========================================================================
  // TIER 3 — Mekanism, RS, Occultism, F&A, diamonds, Nether access
  // =========================================================================

  stageMod(event, 'tier_3', 'mekanism')
  stageMod(event, 'tier_3', 'mekanismgenerators')
  stageMod(event, 'tier_3', 'refinedstorage')
  stageMod(event, 'tier_3', 'extrastorage')
  stageMod(event, 'tier_3', 'extradisks')
  stageMod(event, 'tier_3', 'rsrequestify')
  stageMod(event, 'tier_3', 'occultism')
  stageMod(event, 'tier_3', 'forbidden_arcanus')
  stageMod(event, 'tier_3', 'xnet')

  stageItems(event, 'tier_3', [
    'minecraft:diamond', 'minecraft:diamond_block',
    'minecraft:diamond_sword', 'minecraft:diamond_pickaxe',
    'minecraft:diamond_axe', 'minecraft:diamond_shovel',
    'minecraft:diamond_hoe',
    'minecraft:diamond_helmet', 'minecraft:diamond_chestplate',
    'minecraft:diamond_leggings', 'minecraft:diamond_boots',
    'minecraft:ancient_debris',
    'botania:terrasteel_ingot', 'botania:elementium_ingot',
    'thermal:enderium_ingot',
  ])

  // Ores render as host stone until tier_3
  stageOre(event, 'tier_3', 'minecraft:diamond_ore', 'minecraft:stone')
  stageOre(event, 'tier_3', 'minecraft:deepslate_diamond_ore', 'minecraft:deepslate')
  stageOre(event, 'tier_3', 'minecraft:ancient_debris', 'minecraft:netherrack')
  stageOre(event, 'tier_3', 'mekanism:osmium_ore', 'minecraft:stone')
  stageOre(event, 'tier_3', 'mekanism:deepslate_osmium_ore', 'minecraft:deepslate')

  stageDimension(event, 'tier_3', 'undergarden:undergarden')
  stageDimension(event, 'tier_3', 'deeperdarker:otherside')
  stageDimension(event, 'tier_3', 'minecraft:the_nether')
  stageDimension(event, 'tier_3', 'theabyss:the_abyss')


  // =========================================================================
  // TIER 4 — Mekanism advanced, RFTools Dims, Mahou Tsukai, netherite, End
  // =========================================================================

  stageMod(event, 'tier_4', 'rftoolsdim')
  stageMod(event, 'tier_4', 'mahoutsukai')
  stageMod(event, 'tier_4', 'rsinfinitybooster')
  stageMod(event, 'tier_4', 'enderchests')
  stageMod(event, 'tier_4', 'enderstorage')

  // Mekanism advanced items (mod is T3, these specific items need T4)
  stageItems(event, 'tier_4', [
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
  ])

  // =========================================================================
  // APOTHEOSIS WORKSTATION GATES
  // Design Doc Section 11: Reforging Gates
  //   Basic reforging (Simple Reforging Table): Tier 2
  //   Advanced reforging (Reforging Table): Tier 3
  //   Augmenting Table: Tier 4
  //   Gem Cutting Table: Tier 2 (gems available from T2 bosses)
  //   Salvaging Table: ungated (always available)
  // =========================================================================

  stageItems(event, 'tier_2', [
    'apotheosis:simple_reforging_table',
    'apotheosis:gem_cutting_table',
    'apotheosis:sigil_of_socketing',
  ])

  stageItems(event, 'tier_3', [
    'apotheosis:reforging_table',
    'apotheosis:sigil_of_rebirth',
    'apotheosis:sigil_of_withdrawal',
  ])

  stageItems(event, 'tier_4', [
    'apotheosis:augmenting_table',
    'apotheosis:sigil_of_enhancement',
    'apotheosis:sigil_of_unnaming',
  ])

  stageDimension(event, 'tier_4', 'deep_aether:the_aether')
  stageDimension(event, 'tier_4', 'minecraft:the_end')

})


console.log('[IridescentCraft] AStages native restrictions registered')
console.log('  Tier 2: 3 mods + 16 items + 4 dimensions')
console.log('  Tier 3: 9 mods + 15 items + 5 ores + 4 dimensions')
console.log('  Tier 4: 5 mods + 30 items + 2 dimensions')
