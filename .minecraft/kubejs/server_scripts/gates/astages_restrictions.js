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
  // NOTE: No mod-wide gates. Mod-wide gates block food, seeds, decorative
  // blocks, and other non-progression items. Use individual item gates only.
  // Dimension gates already prevent entering gated dimensions.
  stageMod('tier_2', 'industrialforegoing', 'modpack/mod_if')
  // IF is safe to mod-gate: all items are machines/components, no food/crops

  // -- Individual item restrictions --
  stageItems('tier_2', [
    // Thermal T2 — RAW METALS (lead/tin/silver/nickel) -- 2026-04-26 user
    // directive: gate thermal raw metals at T2. Apatite/cinnabar/niter/sulfur
    // (crafting reagents) intentionally NOT gated here; alloys (steel/invar/
    // electrum/etc.) already in this T2 list below.
    'thermal:lead_ore', 'thermal:deepslate_lead_ore', 'thermal:nether_lead_ore',
    'thermal:tin_ore', 'thermal:deepslate_tin_ore',
    'thermal:silver_ore', 'thermal:deepslate_silver_ore',
    'thermal:nickel_ore', 'thermal:deepslate_nickel_ore', 'thermal:nether_nickel_ore',
    'thermal:lead_ingot', 'thermal:lead_block',
    'thermal:tin_ingot', 'thermal:tin_block',
    'thermal:silver_ingot', 'thermal:silver_block',
    'thermal:nickel_ingot', 'thermal:nickel_block',
    'thermal:raw_lead', 'thermal:raw_tin', 'thermal:raw_silver', 'thermal:raw_nickel',
    'thermal:lead_nugget', 'thermal:tin_nugget', 'thermal:silver_nugget', 'thermal:nickel_nugget',
    // Thermal T2 — machines and alloys (NOT food/crops/seeds/decorative)
    'thermal:machine_frame',
    'thermal:steel_ingot', 'thermal:steel_block',
    'thermal:invar_ingot', 'thermal:invar_block',
    'thermal:electrum_ingot', 'thermal:electrum_block',
    'thermal:signalum_ingot', 'thermal:signalum_block',
    'thermal:lumium_ingot', 'thermal:lumium_block',
    'thermal:redstone_servo', 'thermal:rf_coil',
    // Thermal machines
    'thermal:machine_furnace', 'thermal:machine_sawmill',
    'thermal:machine_pulverizer', 'thermal:machine_smelter',
    'thermal:machine_insolator', 'thermal:machine_centrifuge',
    'thermal:machine_press', 'thermal:machine_crucible',
    'thermal:machine_chiller', 'thermal:machine_refinery',
    'thermal:machine_bottler', 'thermal:machine_brewer',
    'thermal:machine_crafter',
    'thermal:dynamo_stirling', 'thermal:dynamo_compression',
    'thermal:dynamo_magmatic', 'thermal:dynamo_numismatic',
    'thermal:dynamo_lapidary', 'thermal:dynamo_disenchantment',
    'thermal:dynamo_gourmand',
    // Ars Nouveau T2 — apprentice tier (novice + scribes_table are T1/ungated)
    'ars_nouveau:apprentice_spell_book',
    'ars_nouveau:enchanting_apparatus', 'ars_nouveau:arcane_core',
    // 2026-04-28 Phase 6G: modular spell books are NOT tier-gated as items —
    // the tier comes from the core material installed via Tetra workbench.
    // (Previously T2-T4 entries here caused "Unfamiliar Item" for testers
    // without the required tier; the wrapper itself should always be visible.)
    // Botania T2 — advanced materials + gear
    'botania:manasteel_ingot', 'botania:mana_diamond', 'botania:mana_pearl',
    'botania:manasteel_block',
    'botania:manasteel_helmet', 'botania:manasteel_chestplate',
    'botania:manasteel_leggings', 'botania:manasteel_boots',
    'botania:manasteel_sword', 'botania:manasteel_pick',
    'botania:manasteel_axe', 'botania:manasteel_shovel',
    'botania:mana_diamond_block',
    // Apotheosis T2 workstations -- UNGATED 2026-05-14 per design call.
    // Affix rarity is dimension-clamped via config/apotheosis/adventure.cfg
    // "Affix Convert Rarities" (overworld -> common..rare, etc.). Gem rarity
    // is set at boss drop time. The workstation gates were belt-and-suspenders;
    // the actual progression gate is the rarity ladder, not the table itself.
    //   'apotheosis:simple_reforging_table',
    //   'apotheosis:gem_cutting_table',
    //   'apotheosis:sigil_of_socketing',
    // Epic RPG Class Artifacts — normal-tier artifacts require T2 to equip
    'rpgseteffects:altharion_artifact',
    'rpgseteffects:blade_dancer_artifact',
    'rpgseteffects:blood_fury_artifact',
    'rpgseteffects:chronorend_artifact',
    'rpgseteffects:hellbrand_artifact',
    'rpgseteffects:hexweaver_artifact',
    'rpgseteffects:ignisphere_artifact',
    'rpgseteffects:moonpiercer_artifact',
    'rpgseteffects:phoenix_artifact',
    'rpgseteffects:sanctum_artifact',
    'rpgseteffects:shadow_hunter_artifact',
    'rpgseteffects:stormpiercer_artifact',
    'rpgseteffects:vaelkhor_artifact',
    'rpgseteffects:wolfheart_artifact',
    'rpgseteffects:artifact_piece_pouch',
    // art_of_forging T2 — Ancient weapons (audit Phase 2.3, 2026-04-27)
    // Ancient items drop from simple_dungeon + ancient_city chests (mod
    // GLM). T2 stage gates use, since Ancient City is T3 but the items
    // can also drop from T1-T2 dungeons. Demonic upgrades are T4-staged.
    'art_of_forging:ancient_axe', 'art_of_forging:ancient_blade',
    'art_of_forging:ancient_flail',
  ], 'modpack/item_t2')

  // -- Dimension restrictions --
  stageDimension('tier_2', 'twilightforest:twilight_forest', 'modpack/dim_twilight')
  stageDimension('tier_2', 'blue_skies:everbright', 'modpack/dim_everbright')
  stageDimension('tier_2', 'blue_skies:everdawn', 'modpack/dim_everdawn')
  stageDimension('tier_2', 'aether:the_aether', 'modpack/dim_aether')


  // =========================================================================
  // TIER 3 — Mekanism, RS, Occultism, F&A, diamonds, Nether access
  // =========================================================================

  // -- Mod restrictions (only pure tech/machine mods safe to blanket-gate) --
  stageMod('tier_3', 'mekanism', 'modpack/mod_mekanism')
  stageMod('tier_3', 'mekanismgenerators', 'modpack/mod_mekgen')
  stageMod('tier_3', 'refinedstorage', 'modpack/mod_rs')
  stageMod('tier_3', 'extrastorage', 'modpack/mod_extrastorage')
  stageMod('tier_3', 'extradisks', 'modpack/mod_extradisks')
  stageMod('tier_3', 'rsrequestify', 'modpack/mod_rsrequestify')
  stageMod('tier_3', 'xnet', 'modpack/mod_xnet')
  // NOTE: occultism and forbidden_arcanus NOT mod-gated (have passive/food items)
  // Gate their key progression items individually instead

  // -- Individual item restrictions --
  stageItems('tier_3', [
    // Quartz — overworld_quartz mod injects nether_quartz into overworld;
    // 2026-04-26 user directive: quartz comes from Nether (T3) only. Stripped
    // overworld_quartz biome injection via icraft_worldgen_overrides datapack
    // and gating items here so vanilla nether_quartz_ore + quartz blocks
    // require T3 stage.
    'minecraft:nether_quartz_ore', 'minecraft:quartz',
    'minecraft:quartz_block', 'minecraft:smooth_quartz',
    'minecraft:chiseled_quartz_block', 'minecraft:quartz_pillar',
    'minecraft:quartz_bricks',
    'minecraft:quartz_stairs', 'minecraft:quartz_slab',
    'minecraft:smooth_quartz_stairs', 'minecraft:smooth_quartz_slab',
    'overworld_quartz:overworld_quartz_ore', 'overworld_quartz:deepslate_quartz_ore',
    // Diamond raw + derivatives
    'minecraft:diamond', 'minecraft:diamond_block',
    'minecraft:diamond_sword', 'minecraft:diamond_pickaxe',
    'minecraft:diamond_axe', 'minecraft:diamond_shovel',
    'minecraft:diamond_hoe',
    'minecraft:diamond_helmet', 'minecraft:diamond_chestplate',
    'minecraft:diamond_leggings', 'minecraft:diamond_boots',
    'minecraft:diamond_horse_armor',
    'minecraft:diamond_ore', 'minecraft:deepslate_diamond_ore',
    // (enchanting_table removed from T3 2026-05-19: the recipe override in
    // tier_gated_recipes.js §A.2 rebuilt it from gold + deepslate + apoth
    // gem, so it's T1-craftable now. Stale gate was blocking found-in-world
    // tables from being usable until T3.)
    // Nether materials (Nether is T3)
    'minecraft:ancient_debris',
    'minecraft:respawn_anchor',
    // Ars Nouveau T3 — archmage tier + advanced crafting
    'ars_nouveau:archmage_spell_book',
    'ars_nouveau:imbuement_chamber',
    // 2026-04-28 Phase 6G: modular wrapper is tier-free (see T2 block comment).
    // Botania T3 — terrasteel + elementium + all derivatives
    'botania:terrasteel_ingot', 'botania:terrasteel_block',
    'botania:terrasteel_helmet', 'botania:terrasteel_chestplate',
    'botania:terrasteel_leggings', 'botania:terrasteel_boots',
    'botania:elementium_ingot', 'botania:elementium_block',
    'botania:elementium_helmet', 'botania:elementium_chestplate',
    'botania:elementium_leggings', 'botania:elementium_boots',
    'botania:elementium_sword', 'botania:elementium_pickaxe',
    'botania:elementium_axe', 'botania:elementium_shovel',
    'botania:elementium_shears',
    'botania:dragonstone', 'botania:dragonstone_block',
    // Thermal T3
    'thermal:enderium_ingot',
    // T3 vanilla derivatives
    'minecraft:beacon',
    // Apotheosis T3 workstations -- UNGATED 2026-05-14 (see T2 block above).
    //   'apotheosis:reforging_table',
    //   'apotheosis:sigil_of_rebirth',
    //   'apotheosis:sigil_of_withdrawal',
    // Forbidden Arcanus T3 entry — gates the whole F&A progression chain
    // since arcane crystal is the prerequisite material for nearly everything
    // F&A. Mod is intentionally not blanket-gated (per the comment above)
    // because some passive/food items leak into early game, so we gate the
    // key progression material individually here.
    'forbidden_arcanus:arcane_crystal',
    'forbidden_arcanus:arcane_crystal_block',
    'forbidden_arcanus:arcane_crystal_ore',
    'forbidden_arcanus:deepslate_arcane_crystal_ore',
    // art_of_forging T3 — Sigil + Dark Orb (audit Phase 2.3, 2026-04-27)
    // Sigil of Eden drops from Wither @ 30% (T3-T4 boundary).
    // Devils Soul Gem (Dark Orb) sourcing unclear (no recipe, no native
    // loot table) — T3 stage as defensive precaution against creative leak.
    'art_of_forging:sigil_of_eden',
    'art_of_forging:devils_soul_gem',
    // theabyss T3 — totems + exotic curios + reagents
    // (audit Phase 4.2, 2026-04-27 — Abyss is T3 dimension; these
    // items live within the Abyss progression and warrant T3 stage gate
    // even when they don't have explicit AStages presence)
    // 3 totems: highest priority (revive/utility semantics — locking out
    // pre-T3 revive farming)
    'theabyss:totem_of_thunder', 'theabyss:totem_of_abyss',
    'theabyss:totem_of_time',
    // 6 trophies/reagents/curios from mid-Abyss content
    'theabyss:eye_of_abyss', 'theabyss:dream_shifter',
    'theabyss:node_shard', 'theabyss:enchanted_bottle_of_somnium',
    'theabyss:clock_of_time', 'theabyss:artifact_of_after_life',
  ], 'modpack/item_t3')

  // -- Ore replacement restrictions --
  stageOre('tier_3', 'minecraft:diamond_ore', 'minecraft:stone', 'modpack/ore_diamond')
  stageOre('tier_3', 'minecraft:deepslate_diamond_ore', 'minecraft:deepslate', 'modpack/ore_diamond_deep')
  stageOre('tier_3', 'minecraft:ancient_debris', 'minecraft:netherrack', 'modpack/ore_ancient_debris')
  stageOre('tier_3', 'mekanism:osmium_ore', 'minecraft:stone', 'modpack/ore_osmium')
  stageOre('tier_3', 'mekanism:deepslate_osmium_ore', 'minecraft:deepslate', 'modpack/ore_osmium_deep')
  stageOre('tier_3', 'forbidden_arcanus:arcane_crystal_ore', 'minecraft:stone', 'modpack/ore_arcane_crystal')
  stageOre('tier_3', 'forbidden_arcanus:deepslate_arcane_crystal_ore', 'minecraft:deepslate', 'modpack/ore_arcane_crystal_deep')

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
    // 2026-04-28 Phase 6G: modular wrapper is tier-free (see T2 block comment).
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
    // Netherite raw + derivatives
    'minecraft:netherite_ingot', 'minecraft:netherite_block',
    'minecraft:netherite_scrap',
    'minecraft:netherite_sword', 'minecraft:netherite_pickaxe',
    'minecraft:netherite_axe', 'minecraft:netherite_shovel',
    'minecraft:netherite_hoe',
    'minecraft:netherite_helmet', 'minecraft:netherite_chestplate',
    'minecraft:netherite_leggings', 'minecraft:netherite_boots',
    'minecraft:netherite_upgrade_smithing_template',
    // Items crafted from netherite
    'minecraft:lodestone',
    // End-tier items + all End derivatives
    'minecraft:ender_eye', 'minecraft:end_crystal',
    'minecraft:ender_chest',
    'minecraft:end_rod',
    'minecraft:elytra',
    'minecraft:dragon_egg', 'minecraft:dragon_head',
    'minecraft:end_stone', 'minecraft:end_stone_bricks',
    'minecraft:end_stone_brick_slab', 'minecraft:end_stone_brick_stairs',
    'minecraft:end_stone_brick_wall',
    'minecraft:purpur_block', 'minecraft:purpur_pillar',
    'minecraft:purpur_slab', 'minecraft:purpur_stairs',
    'minecraft:chorus_fruit', 'minecraft:popped_chorus_fruit',
    'minecraft:chorus_flower', 'minecraft:chorus_plant',
    // Shulker boxes (all 17 variants)
    'minecraft:shulker_box',
    'minecraft:white_shulker_box', 'minecraft:orange_shulker_box',
    'minecraft:magenta_shulker_box', 'minecraft:light_blue_shulker_box',
    'minecraft:yellow_shulker_box', 'minecraft:lime_shulker_box',
    'minecraft:pink_shulker_box', 'minecraft:gray_shulker_box',
    'minecraft:light_gray_shulker_box', 'minecraft:cyan_shulker_box',
    'minecraft:purple_shulker_box', 'minecraft:blue_shulker_box',
    'minecraft:brown_shulker_box', 'minecraft:green_shulker_box',
    'minecraft:red_shulker_box', 'minecraft:black_shulker_box',
    'minecraft:shulker_shell',
    // Botania endgame + derivatives
    'botania:gaia_ingot', 'botania:gaia_block',
    // End portal
    'endportalrecipe:portal_catalyst',
    // Apotheosis T4 workstations -- UNGATED 2026-05-14 (see T2 block above).
    //   'apotheosis:augmenting_table',
    //   'apotheosis:sigil_of_enhancement',
    //   'apotheosis:sigil_of_unnaming',
    // Aethersteel — T4 endgame material (spawns in Deep Aether only)
    'aethersteel:aethersteel_ingot', 'aethersteel:aethersteel_block',
    'aethersteel:aethersteel_nugget', 'aethersteel:aethersteel_scrap',
    'aethersteel:aether_debris',
    'aethersteel:aethersteel_sword', 'aethersteel:aethersteel_pickaxe',
    'aethersteel:aethersteel_axe', 'aethersteel:aethersteel_shovel',
    'aethersteel:aethersteel_hoe', 'aethersteel:aethersteel_shears',
    'aethersteel:aethersteel_knife',
    'aethersteel:aethersteel_armor_helmet', 'aethersteel:aethersteel_armor_chestplate',
    'aethersteel:aethersteel_armor_leggings', 'aethersteel:aethersteel_armor_boots',
    'aethersteel:aethersteel_upgrade_smithing_template',
    // Epic RPG Class Artifacts — Awakening variants are T4-only
    'rpgseteffects:altharion_awakening_artifact',
    'rpgseteffects:blade_dancer_awakening_artifact',
    'rpgseteffects:blood_fury_awakening_artifact',
    'rpgseteffects:chronorend_awakening_artifact',
    'rpgseteffects:hellbrand_awakening_artifact',
    'rpgseteffects:hexweaver_awakening_artifact',
    'rpgseteffects:ignisphere_awakening_artifact',
    'rpgseteffects:moonpiercer_awakening_artifact',
    'rpgseteffects:phoenix_awakening_artifact',
    'rpgseteffects:sanctum_awakening_artifact',
    'rpgseteffects:shadow_hunter_awakening_artifact',
    'rpgseteffects:stormpiercer_awakening_artifact',
    'rpgseteffects:vaelkhor_awakening_artifact',
    'rpgseteffects:wolfheart_awakening_artifact',
    // art_of_forging T4 — Demonic upgrades + enigmatic_construct
    // (audit Phase 2.3, 2026-04-27)
    // Demonic chain crafted from Ancient (T2-staged) + 4x shards_of_malice
    // (Wither Skeleton T3 drop). Enigmatic Construct requires dragon_soul
    // (Ender Dragon T4 drop) + endsteel + forged_steel. Items are mod-
    // internally tier-gated through their material requirements; T4 stage
    // is additional defense against creative leaks or chest_loot bypass.
    'art_of_forging:demonic_axe', 'art_of_forging:demonic_blade',
    'art_of_forging:demonic_flail', 'art_of_forging:enigmatic_construct',
    // theabyss T4 — Nosaj boss trophies + immortality reagent
    // (audit Phase 4.2, 2026-04-27 — Nosaj is the deepest Abyss boss;
    // immortal_substance has revive semantics and warrants T4 gate)
    'theabyss:crown_of_nosaj', 'theabyss:amuled_of_nosaj',
    'theabyss:immortal_substance',
    // cataclysm T4 — mechanical_fusion_anvil
    // (audit Phase 8.4 / locked-in decision #2, 2026-04-27)
    // Merged with void_forge/infernal_forge — mod-level duplication.
    // Recipe removed in recipe_audit.js J.3; T4 stage as defense.
    'cataclysm:mechanical_fusion_anvil',
  ], 'modpack/item_t4')

  // -- Ore replacement restrictions --
  // Aethersteel ores appear as holystone until T4 unlocked
  stageOre('tier_4', 'aethersteel:aether_debris', 'aether:holystone', 'modpack/ore_aether_debris')
  stageOre('tier_4', 'aethersteel:aetherslate', 'aether:holystone', 'modpack/ore_aetherslate')

  // -- Dimension restrictions --
  stageDimension('tier_4', 'deep_aether:the_aether', 'modpack/dim_deep_aether')
  stageDimension('tier_4', 'minecraft:the_end', 'modpack/dim_end')

  // -- Ad Astra Planets (Post-T4 Endgame) --
  // All 5 planets require tier_4 stage. Belt-and-suspenders with recipe gating
  // on the Rocket Workbench and rocket tiers themselves.
  stageDimension('tier_4', 'ad_astra:moon',    'modpack/dim_moon')
  stageDimension('tier_4', 'ad_astra:mars',    'modpack/dim_mars')
  stageDimension('tier_4', 'ad_astra:mercury', 'modpack/dim_mercury')
  stageDimension('tier_4', 'ad_astra:venus',   'modpack/dim_venus')
  stageDimension('tier_4', 'ad_astra:glacio',  'modpack/dim_glacio')

  // =========================================================================
  // IRON JETPACKS — Cannot be AStages-gated (single dynamic item ID)
  // =========================================================================
  // Iron Jetpacks uses a single item 'ironjetpacks:jetpack' with NBT for all
  // variants. AStages cannot distinguish variants by item ID.
  // Tier enforcement is via crafting material gates:
  //   - Wood/Stone/Copper jetpacks: T1 (ungated materials)
  //   - Iron/Bronze/Silver jetpacks: T1-T2 materials (iron, bronze, silver)
  //   - Steel/Gold/Invar/Electrum jetpacks: T2-T3 (steel=T2, gold=T3)
  //   - Diamond/Platinum jetpacks: T3-T4 (diamond=T3, platinum=T4)
  //   - Emerald jetpack: T4 (emerald=T4 equivalent via rarity)
  // No additional AStages restrictions needed — material gates handle it.

  // =========================================================================
  // SIGIL OF SOCKETING — tier gates (added 2026-05-18)
  // =========================================================================
  // Custom tier-gated Sigils of Socketing per master.md Part XIII §Marquee.
  // T1 sigil uses tier_1 (default, no restriction needed).
  // T2/T3 sigils + vanilla Apotheosis sigil restricted to their respective
  // tiers. Cap enforcement (max sockets per item by tier) is handled in
  // kubejs/server_scripts/sigil_socket_handler.js.
  stageItems('tier_2', ['icraft:sigil_of_socketing_t2'], 'icraft/sigil_t2')
  stageItems('tier_3', ['icraft:sigil_of_socketing_t3'], 'icraft/sigil_t3')
  stageItems('tier_4', ['apotheosis:sigil_of_socketing'], 'apotheosis/sigil_socketing_t4')

  console.log('[IridescentCraft] AStages native restrictions registered')
  console.log('  Tier 2: 6 mods + 17 items + 4 dimensions')
  console.log('  Tier 3: 9 mods + 36 items + 5 ores + 4 dimensions')
  console.log('  Tier 4: 5 mods + 94 items + 2 ores + 7 dimensions (incl. 5 Ad Astra planets + 14 Awakening artifacts)')
})
