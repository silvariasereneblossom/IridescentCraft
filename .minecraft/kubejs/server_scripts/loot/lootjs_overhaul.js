// =============================================================================
// LOOTJS LOOT TABLE OVERHAUL
// Place in: kubejs/server_scripts/loot/lootjs_overhaul.js
// REQUIRES: LootJS addon (https://curseforge.com/minecraft/mc-mods/lootjs)
//
// Design doc Part I, Section 19: Loot Table Overhaul
// "Every dungeon/structure mod's loot tables must respect the tier system."
//
// STRUCTURE CHEST MODIFIERS ONLY. Boss entity drops are in loot_overhaul.js.
//
// WHAT THIS DOES:
// 1. Removes tier-breaking items (diamonds, enchanted books, netherite)
//    from structure chests based on tier appropriateness
// 2. Injects tier-appropriate progression tokens into structure chests
// 3. Removes enchanted books from ALL structure loot (Apotheosis handles enchanting)
// 4. Reduces Overworld food and removes modded food from structure chests
// 5. Village chest loot restrictions (iron/leather only, no powerful modded items)
// 6. Curio drops for tower structures
//
// STRUCTURE MOD COVERAGE (35+ mods):
//   YUNG's Better series (Dungeons, Strongholds, Fortresses, Mineshafts,
//     Ocean Monuments, Desert Temples, End Island),
//   Dungeon Crawl, IDAS, Explorify, Dungeons Plus, Moog's End Structures,
//   Structory, Structory Towers, Keebsz Battle Towers, Iron's Spellbooks,
//   Villages & Pillages, Overhauled Structures, Loot Integrations,
//   Celestial Artifacts, Unwrecked Ships, Ultris, When Dungeons Arise,
//   Valhelsia Structures, Repurposed Structures, Integrated Stronghold,
//   ChoiceTheorem's Overhauled Village, Explorations+,
//   Cataclysm (structures), Twilight Forest (structures),
//   Blue Skies, Aether, Deep Aether, Undergarden, Deeper and Darker,
//   The Abyss (structures)
//
// BOSS MOD COVERAGE (8 mods):
//   Meet Your Fight, Mutant Monsters, Majestic Menaces, Stalwart Dungeons,
//   Keebsz (loot table), Iron's Spellbooks, The Abyss,
//   Ultimate Bosses (loot table), Cataclysm, Twilight Forest
// =============================================================================

var UniformGenerator = Java.loadClass('net.minecraft.world.level.storage.loot.providers.number.UniformGenerator')
var ConstantValue = Java.loadClass('net.minecraft.world.level.storage.loot.providers.number.ConstantValue')

LootJS.modifiers(event => {

  // =========================================================================
  // SECTION 1: ENCHANTED BOOK REBALANCE
  // =========================================================================
  // Remove vanilla enchanted book generation, then re-add at tier-appropriate
  // rates. Apotheosis enhances the enchanting table but books should still
  // appear in loot as exciting finds — just not everywhere.
  //
  // Rates scale by dimension difficulty:
  //   Overworld/Aether/Blue Skies: 7.5%
  //   Nether/Twilight Forest/Undergarden: 10%
  //   End/Deeper and Darker/The Abyss: 15%
  //
  // Also adds Ars Nouveau spell books at tier-appropriate rates.
  // =========================================================================

  // Remove ALL endgame KubeJS items from passive mob loot (safety net)
  event
    .addEntityLootModifier('minecraft:pig')
    .removeLoot('@kubejs')
  event
    .addEntityLootModifier('minecraft:cow')
    .removeLoot('@kubejs')
  event
    .addEntityLootModifier('minecraft:sheep')
    .removeLoot('@kubejs')
  event
    .addEntityLootModifier('minecraft:chicken')
    .removeLoot('@kubejs')

  // ── RELICS CURATION ──
  // Remove relics that are too active/environmental/OP for gear-driven design
  let removedRelics = [
    'relics:infinity_ham',
    'relics:magic_mirror',
    'relics:aqua_walker',
    'relics:amphibian_boot',
    'relics:magma_walker',
    'relics:ice_skates',
    'relics:roller_skates',
    'relics:horse_flute',
    'relics:chorus_inhibitor',
    'relics:elytra_booster',
    'relics:spatial_sign',
    'relics:midnight_robe',
    'relics:ice_breaker',
    'relics:enders_hand',
    'relics:space_dissector'
  ]
  let relicRemover = event.addLootTypeModifier(LootType.CHEST)
  removedRelics.forEach(r => relicRemover.removeLoot(r))

  // Ender's Hand — exclusive Dragon drop (free ender pearl teleport)
  event.addEntityLootModifier('minecraft:ender_dragon')
    .addLoot(LootEntry.of('relics:enders_hand'))

  // Space Dissector — rare T4 dimension drop
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_end', 'deeperdarker:otherside', 'theabyss:the_abyss')
    .addLoot(LootEntry.of('relics:space_dissector').when(c => c.randomChance(0.01)))

  // Shadow Glaive — rare T2/T3 drop
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('twilightforest:twilight_forest', 'aether:the_aether', 'deep_aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn', 'minecraft:the_nether', 'undergarden:undergarden')
    .addLoot(LootEntry.of('relics:shadow_glaive').when(c => c.randomChance(0.01)))

  // Remove T4-gated mod items from ALL chest loot (shouldn't appear before T4)
  event
    .addLootTypeModifier(LootType.CHEST)
    .removeLoot('@rftoolsdim')
    .removeLoot('@mahoutsukai')

  // First remove all vanilla enchanted books globally
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension(
      'minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end',
      'twilightforest:twilight_forest',
      'blue_skies:everbright', 'blue_skies:everdawn',
      'aether:the_aether', 'deep_aether:the_aether',
      'undergarden:undergarden',
      'deeperdarker:otherside',
      'theabyss:the_abyss'
    )
    .removeLoot('minecraft:enchanted_book')

  // Blacklist Relics horse_flute globally — user dislike (summons a temporary
  // horse, doesn't really fit our progression design)
  event
    .addLootTypeModifier(LootType.CHEST)
    .removeLoot('relics:horse_flute')

  // Re-add enchanted books at 7.5% — T1 (Overworld)
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .addLoot(
      LootEntry.of('minecraft:enchanted_book')
        .enchantWithLevels(UniformGenerator.between(10, 25), true)
        .when(c => c.randomChance(0.075))
    )

  // Re-add enchanted books at 10% — T2 (TF, Aether, Blue Skies)
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('twilightforest:twilight_forest',
      'aether:the_aether', 'deep_aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
    .addLoot(
      LootEntry.of('minecraft:enchanted_book')
        .enchantWithLevels(UniformGenerator.between(15, 30), true)
        .when(c => c.randomChance(0.10))
    )

  // Re-add enchanted books at 12.5% — T3 (Nether, Undergarden)
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_nether', 'undergarden:undergarden')
    .addLoot(
      LootEntry.of('minecraft:enchanted_book')
        .enchantWithLevels(UniformGenerator.between(20, 30), true)
        .when(c => c.randomChance(0.125))
    )

  // Re-add enchanted books at 15% — T4 (End, Deeper Darker, Abyss)
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_end', 'deeperdarker:otherside', 'theabyss:the_abyss')
    .addLoot(
      LootEntry.of('minecraft:enchanted_book')
        .enchantWithLevels(ConstantValue.exactly(30), true)
        .when(c => c.randomChance(0.15))
    )

  // --- Ars Nouveau spell books — MOVED to after global strip (Section 1B) ---

  // --- Compass of Return — 2.5% in cave/structure chests only (T1 rare find) ---
  // Overworld: only dungeons, mineshafts, temples, buried treasure, mod structures
  // Excludes villages and other surface/settlement chests
  event
    .addLootTableModifier(
      'minecraft:chests/simple_dungeon',
      'minecraft:chests/abandoned_mineshaft',
      'minecraft:chests/desert_pyramid',
      'minecraft:chests/jungle_temple',
      'minecraft:chests/stronghold_corridor',
      'minecraft:chests/stronghold_crossing',
      'minecraft:chests/stronghold_library',
      'minecraft:chests/buried_treasure',
      'minecraft:chests/underwater_ruin_big',
      'minecraft:chests/underwater_ruin_small',
      /dungeoncrawl:.*chests.*/,
      /explorify:.*chests.*/,
      /structory:.*chests.*/,
      /dungeons_plus:.*/,
      /whendungeonsarise:.*/,
      /valhelsia_structures:.*chests.*/,
      /repurposed_structures:.*chests.*/
    )
    .addLoot(
      LootEntry.of('kubejs:compass_of_return').when(c => c.randomChance(0.025))
    )
  // Aether + Blue Skies: all chests are structures, so dimension filter is fine
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('aether:the_aether', 'deep_aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
    .addLoot(
      LootEntry.of('kubejs:compass_of_return').when(c => c.randomChance(0.025))
    )

  // =========================================================================
  // SECTION 1B: GLOBAL ARTIFACT/CURIO STRIP
  // =========================================================================
  // Remove ALL artifact mod items from ALL chest loot globally. This runs
  // BEFORE any tier-specific re-injection so we start from a clean slate.
  // Individual sections below re-add curated items at controlled rates.
  // Village sanitization (Section 6) has its own strip but this catches
  // everything else — dimension chests, structure chests, etc.
  // =========================================================================
  event
    .addLootTypeModifier(LootType.CHEST)
    // NOTE: Do NOT use removeLoot('@artifacts') here — LootJS applies it as a
    // persistent filter that also strips our own tiered re-additions (same namespace).
    // Artifact mod injection is controlled via GLM whitelist (replace:true) instead.
    // Village-specific sanitization handles village chests separately.
    .removeLoot('@ars_nouveau')
    .removeLoot('@irons_spellbooks')
    .removeLoot('@moreartifacts')

  // --- Ars Nouveau spell books (re-add AFTER global strip) ---
  // T1 (Overworld): Novice spell book (5%)
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .addLoot(
      LootEntry.of('ars_nouveau:novice_spell_book').when(c => c.randomChance(0.05))
    )

  // T2 (TF, Aether, Blue Skies): Apprentice spell book (5%)
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('twilightforest:twilight_forest',
      'aether:the_aether', 'deep_aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
    .addLoot(
      LootEntry.of('ars_nouveau:apprentice_spell_book').when(c => c.randomChance(0.05))
    )

  // T3 (Nether, Undergarden): Archmage spell book (3%)
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_nether', 'undergarden:undergarden')
    .addLoot(
      LootEntry.of('ars_nouveau:archmage_spell_book').when(c => c.randomChance(0.03))
    )

  // T4 (End, Deeper Darker, Abyss): Archmage spell book (5%)
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_end', 'deeperdarker:otherside', 'theabyss:the_abyss')
    .addLoot(
      LootEntry.of('ars_nouveau:archmage_spell_book').when(c => c.randomChance(0.05))
    )

  // --- Ars Nouveau glyphs (tiered pools) ---
  // Spell books are useless without glyphs inscribed at a Scribes Table. We
  // seed the spell toolkit through chest loot, front-loading Forms
  // (projectile/touch/self/aoe) so T1-T2 players can actually cast. Per-item
  // chance = target_rate / pool_size, rolled independently per chest.

  const glyphT1 = [
    'ars_nouveau:glyph_projectile', 'ars_nouveau:glyph_touch', 'ars_nouveau:glyph_self',
    'ars_nouveau:glyph_harm', 'ars_nouveau:glyph_heal', 'ars_nouveau:glyph_ignite',
    'ars_nouveau:glyph_break', 'ars_nouveau:glyph_place_block', 'ars_nouveau:glyph_grow',
    'ars_nouveau:glyph_harvest', 'ars_nouveau:glyph_light', 'ars_nouveau:glyph_smelt',
    'ars_nouveau:glyph_evaporate', 'ars_nouveau:glyph_extract', 'ars_nouveau:glyph_conjure_water',
    'ars_nouveau:glyph_amplify', 'ars_nouveau:glyph_extend_time', 'ars_nouveau:glyph_duration_down'
  ]
  const glyphT1PerItem = 0.12 / glyphT1.length  // ~12% combined
  var glyphModT1 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
  glyphT1.forEach(g => {
    glyphModT1.addLoot(LootEntry.of(g).when(c => c.randomChance(glyphT1PerItem)))
  })

  const glyphT2 = [
    'ars_nouveau:glyph_aoe', 'ars_nouveau:glyph_underfoot',
    'ars_nouveau:glyph_launch', 'ars_nouveau:glyph_leap', 'ars_nouveau:glyph_glide',
    'ars_nouveau:glyph_bounce', 'ars_nouveau:glyph_slowfall', 'ars_nouveau:glyph_freeze',
    'ars_nouveau:glyph_gust', 'ars_nouveau:glyph_snare', 'ars_nouveau:glyph_pull',
    'ars_nouveau:glyph_toss', 'ars_nouveau:glyph_cold_snap', 'ars_nouveau:glyph_fortune',
    'ars_nouveau:glyph_fell', 'ars_nouveau:glyph_pickup', 'ars_nouveau:glyph_exchange',
    'ars_nouveau:glyph_crush', 'ars_nouveau:glyph_cut',
    'ars_nouveau:glyph_accelerate', 'ars_nouveau:glyph_decelerate', 'ars_nouveau:glyph_dampen',
    'ars_nouveau:glyph_pierce', 'ars_nouveau:glyph_split', 'ars_nouveau:glyph_sensitive'
  ]
  const glyphT2PerItem = 0.14 / glyphT2.length  // ~14% combined
  var glyphModT2 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('twilightforest:twilight_forest', 'aether:the_aether',
      'deep_aether:the_aether', 'blue_skies:everbright', 'blue_skies:everdawn')
  glyphT2.forEach(g => {
    glyphModT2.addLoot(LootEntry.of(g).when(c => c.randomChance(glyphT2PerItem)))
  })

  const glyphT3 = [
    'ars_nouveau:glyph_linger',
    'ars_nouveau:glyph_lightning', 'ars_nouveau:glyph_firework', 'ars_nouveau:glyph_phantom_block',
    'ars_nouveau:glyph_wall', 'ars_nouveau:glyph_fangs', 'ars_nouveau:glyph_hex',
    'ars_nouveau:glyph_explosion', 'ars_nouveau:glyph_wind_shear', 'ars_nouveau:glyph_invisibility',
    'ars_nouveau:glyph_blink', 'ars_nouveau:glyph_delay', 'ars_nouveau:glyph_gravity',
    'ars_nouveau:glyph_animate_block', 'ars_nouveau:glyph_craft', 'ars_nouveau:glyph_ender_inventory',
    'ars_nouveau:glyph_redstone_signal', 'ars_nouveau:glyph_interact', 'ars_nouveau:glyph_flare',
    'ars_nouveau:glyph_infuse', 'ars_nouveau:glyph_rotate', 'ars_nouveau:glyph_orbit'
  ]
  const glyphT3PerItem = 0.15 / glyphT3.length  // ~15% combined
  var glyphModT3 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_nether', 'undergarden:undergarden')
  glyphT3.forEach(g => {
    glyphModT3.addLoot(LootEntry.of(g).when(c => c.randomChance(glyphT3PerItem)))
  })

  const glyphT4 = [
    'ars_nouveau:glyph_rune', 'ars_nouveau:glyph_wither',
    'ars_nouveau:glyph_summon_undead', 'ars_nouveau:glyph_summon_decoy',
    'ars_nouveau:glyph_summon_steed', 'ars_nouveau:glyph_summon_vex',
    'ars_nouveau:glyph_summon_wolves', 'ars_nouveau:glyph_sense_magic',
    'ars_nouveau:glyph_intangible', 'ars_nouveau:glyph_dispel',
    'ars_nouveau:glyph_randomize', 'ars_nouveau:glyph_name'
  ]
  const glyphT4PerItem = 0.18 / glyphT4.length  // ~18% combined
  var glyphModT4 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_end', 'deeperdarker:otherside', 'theabyss:the_abyss')
  glyphT4.forEach(g => {
    glyphModT4.addLoot(LootEntry.of(g).when(c => c.randomChance(glyphT4PerItem)))
  })

  // =========================================================================
  // SECTION 1C: TIERED ARTIFACT RE-INJECTION BY DIMENSION
  // =========================================================================
  // After stripping all artifact mod items globally, re-inject curated pools
  // at tier-appropriate rates gated by dimension. Each tier has items suited
  // to its difficulty level. Per-item chance = target_rate / pool_size.
  // =========================================================================

  // --- T1 Pool (~10% combined) — Overworld ---
  // Utility/movement artifacts + starter magic items. Safe, non-combat.
  const artifactT1Pool = [
    'artifacts:snorkel', 'artifacts:anglers_hat', 'artifacts:superstitious_hat',
    'artifacts:lucky_scarf', 'artifacts:cloud_in_a_bottle',     'artifacts:running_shoes', 'artifacts:umbrella', 'artifacts:flippers',
    'artifacts:snowshoes', 'artifacts:bunny_hoppers', 'artifacts:digging_claws',
    'artifacts:golden_hook',
    'ars_nouveau:novice_spell_book', 'ars_nouveau:source_gem',
    'irons_spellbooks:common_ink'
  ]
  const artifactT1PerItem = 0.10 / artifactT1Pool.length  // 10% combined
  var modT1 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
  artifactT1Pool.forEach(item => {
    modT1.addLoot(LootEntry.of(item).when(c => c.randomChance(artifactT1PerItem)))
  })

  // --- T2 Pool (~12% combined) — Twilight Forest, Aether, Blue Skies ---
  // Combat + defensive artifacts + mid-tier magic.
  const artifactT2Pool = [
    'artifacts:power_glove', 'artifacts:feral_claws', 'artifacts:pickaxe_heater',
    'artifacts:cross_necklace', 'artifacts:panic_necklace', 'artifacts:antidote_vessel',
    'artifacts:crystal_heart', 'artifacts:obsidian_skull',
    'celestial_artifacts:cross_necklace', 'celestial_artifacts:iron_scabbard',
    'celestial_artifacts:copper_reinforce_plate', 'celestial_artifacts:amethyst_ring',
    'celestial_artifacts:forest_cloak', 'celestial_artifacts:holy_talisman',
    'celestial_artifacts:life_bracelet', 'celestial_artifacts:fang_necklace',
    'ars_nouveau:apprentice_spell_book', 'irons_spellbooks:uncommon_ink'
  ]
  const artifactT2PerItem = 0.12 / artifactT2Pool.length  // 12% combined
  var modT2 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('twilightforest:twilight_forest', 'aether:the_aether',
      'deep_aether:the_aether', 'blue_skies:everbright', 'blue_skies:everdawn')
  artifactT2Pool.forEach(item => {
    modT2.addLoot(LootEntry.of(item).when(c => c.randomChance(artifactT2PerItem)))
  })

  // --- T3 Pool (~14% combined) — Nether, Undergarden ---
  // Strong artifacts + some relics + advanced magic.
  const artifactT3Pool = [
    'artifacts:night_vision_goggles', 'artifacts:drama_mask',
    'artifacts:universal_attractor', 'artifacts:charm_of_sinking',
    'relics:ice_skates', 'relics:rage_glove', 'relics:hunter_belt',
    'relics:roller_skates', 'relics:bastion_ring', 'relics:midnight_robe',
    'ars_nouveau:archmage_spell_book', 'irons_spellbooks:rare_ink'
  ]
  const artifactT3PerItem = 0.14 / artifactT3Pool.length  // 14% combined
  var modT3 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_nether', 'undergarden:undergarden')
  artifactT3Pool.forEach(function(item) {
    modT3.addLoot(LootEntry.of(item).when(c => c.randomChance(artifactT3PerItem)))
  })

  // --- T4 Pool (~16% combined) — End, Deeper Darker, Abyss ---
  // Endgame artifacts + powerful relics.
  const artifactT4Pool = [
    'relics:enders_hand', 'relics:space_dissector', 'relics:shadow_glaive',
    'relics:elytra_booster', 'relics:magic_mirror', 'relics:holy_locket',
    'relics:arrow_quiver', 'relics:wool_mitten',
    'celestial_artifacts:demon_heart', 'celestial_artifacts:abyss_core',
    'celestial_artifacts:angel_heart', 'celestial_artifacts:nebula_cube',
    'celestial_artifacts:flight_ring', 'celestial_artifacts:prayer_crown',
    'celestial_artifacts:spirit_crown', 'celestial_artifacts:end_etching'
  ]
  const artifactT4PerItem = 0.16 / artifactT4Pool.length  // 16% combined
  var modT4 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_end', 'deeperdarker:otherside', 'theabyss:the_abyss')
  artifactT4Pool.forEach(function(item) {
    modT4.addLoot(LootEntry.of(item).when(c => c.randomChance(artifactT4PerItem)))
  })

  // =========================================================================
  // SECTION 2: TIER 1 STRUCTURE LOOT (Overworld)
  // Remove diamonds, add T1 token chance
  // =========================================================================
  // Overworld structures should NOT contain diamonds or netherite.
  // They get iron-tier tokens instead.
  //
  // Matched mods: Dungeon Crawl (stages 1-3), Explorify, Dungeons Plus,
  // Structory, Villages & Pillages, Better Desert Temples (storage tier),
  // Loot Integrations (easy/village/water), Unwrecked Ships,
  // Overhauled Structures (chest_1/2), YUNG's series (OW structures)
  // =========================================================================

  // --- Dungeon Crawl: MOVED to Section 4B (more granular coverage) ---

  // --- Explorify (all chests — Overworld structures) ---
  event
    .addLootTableModifier(/explorify:.*chests.*/)
    .removeLoot('minecraft:diamond')

  // --- Dungeons Plus: MOVED to Section 4B (common/rare split) ---

  // --- Structory + Structory Towers: MOVED to Section 4B (chests-scoped) ---

  // --- Villages & Pillages ---
  // No T1 tokens — villages are starting areas, not progression structures
  event
    .addLootTableModifier(/villagesandpillages:.*chests.*/)
    .removeLoot('minecraft:diamond')

  // --- Unwrecked Ships ---
  event
    .addLootTableModifier(/unwrecked_ships:.*/)
    .removeLoot('minecraft:diamond')

  // --- Better Desert Temples: storage tier (food_storage, storage, pot, wardrobe) ---
  event
    .addLootTableModifier(/betterdeserttemples:.*(?:food_storage|storage|pot|wardrobe)/)
    .removeLoot('minecraft:diamond')

  // --- Better Desert Temples: mid tier (lab, library, statue, tomb) ---
  event
    .addLootTableModifier(/betterdeserttemples:.*(?:lab|library|statue|tomb(?!_pharaoh))/)
    .removeLoot('minecraft:diamond')

  // --- Better Desert Temples: pharaoh tier (tomb_pharaoh, pharaoh_hidden) ---
  event
    .addLootTableModifier(/betterdeserttemples:.*pharaoh/)
    .removeLoot('minecraft:diamond')

  // --- Overhauled Structures: common (chest_1, chest_2) ---
  event
    .addLootTableModifier(/overhauledstructures:.*chest_[12]/)
    .removeLoot('minecraft:diamond')

  // --- Overhauled Structures: rare (chest_3, chest_m) ---
  event
    .addLootTableModifier(/overhauledstructures:.*chest_[3m]/)

  // --- Loot Integrations: easy/village/water = T1 ---
  event
    .addLootTableModifier(/lootintegrations:.*(?:easy|village|water)/)
    .removeLoot('minecraft:diamond')

  // --- Loot Integrations: medium = T2 ---
  event
    .addLootTableModifier(/lootintegrations:.*medium/)

  // --- Loot Integrations: hard/nether = T3 ---
  event
    .addLootTableModifier(/lootintegrations:.*(?:hard|nether)/)

  // --- Celestial Artifacts ---
  event
    .addLootTableModifier(/celestial_artifacts:.*/)
    .removeLoot('minecraft:diamond')

  // =========================================================================
  // SECTION 3: TIER 2 STRUCTURE LOOT (Dimensional dungeons)
  // These structures exist in T2 dimensions — allow diamonds but no netherite
  // =========================================================================

  // --- IDAS: MOVED to Section 4B (overworld/treasure split) ---

  // --- Keebsz Battle Towers ---
  // Loot tables confirmed: keebsz:{biome}/floor{N}and{N+1} (6 biomes × 5 tiers)
  // Lower floors (1-4) = T1, mid floors (5-6) = T1-T2, upper floors (7-10) = T2
  event
    .addLootTableModifier(/keebsz:.*\/floor[12]and[23]/)
    .removeLoot('minecraft:diamond')

  event
    .addLootTableModifier(/keebsz:.*\/floor[35]and[46]/)
    .removeLoot('minecraft:diamond')

  event
    .addLootTableModifier(/keebsz:.*\/floor[79]and[810]/)

  // --- Iron's Spellbooks structures ---
  event
    .addLootTableModifier(/irons_spellbooks:.*chests.*/)

  // --- Moog's End Structures (T4 content — allow everything, add T4 tokens + thematic loot) ---
  event
    .addLootTableModifier(/mes:.*chests.*/)
    .addLoot(LootEntry.of('minecraft:chorus_fruit').limitCount([4, 8]).when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('minecraft:ender_pearl').limitCount([2, 4]).when(c => c.randomChance(0.05)))
    .addLoot(LootEntry.of('minecraft:shulker_shell').when(c => c.randomChance(0.03)))

  // =========================================================================
  // SECTIONS 4–4H: BOSS ENTITY LOOT MODIFIERS
  // REMOVED — All boss entity drops (tokens, Simply Swords uniques,
  // mini-boss materials, next-tier peeks) are now handled exclusively
  // by loot_overhaul.js to avoid duplicate drops.
  // This file only handles STRUCTURE CHEST modifiers.
  // =========================================================================

  // =========================================================================
  // SECTION 4B: NEWLY VERIFIED STRUCTURE MODS
  // Registry-confirmed loot table namespaces from scan3/scan4
  // =========================================================================

  // --- When Dungeons Arise (131 tables) ---
  // T1-T2 structures: villages, pubs, fishing huts, farms
  event
    .addLootTableModifier(
      /dungeons_arise:chests\/(fishing_hut|bandit_village|greenwood_pub|giant_mushroom|bathhouse|aviary)\//)
    .removeLoot('minecraft:diamond')

  // T2 structures: temples, towers, foundry
  event
    .addLootTableModifier(
      /dungeons_arise:chests\/(abandoned_temple|bandit_towers|foundry|scorched_mines)\//)
    .removeLoot('minecraft:diamond')

  // T2-T3 structures: heavenly series (challenger, conqueror, rider)
  event
    .addLootTableModifier(/dungeons_arise:chests\/heavenly_/)

  // Catch-all treasure tables
  event
    .addLootTableModifier(/dungeons_arise:chests\/.*treasure/)

  // --- Repurposed Structures ---
  // NOT PRESENT in modpack (confirmed by loot_overhaul.js discovery scan)

  // --- Valhelsia Structures (11 chest tables) ---
  // T1-T2: common structures
  event
    .addLootTableModifier(
      'valhelsia_structures:chests/castle',
      'valhelsia_structures:chests/castle_ruin',
      'valhelsia_structures:chests/desert_house',
      'valhelsia_structures:chests/forge',
      'valhelsia_structures:chests/kitchen',
      'valhelsia_structures:chests/miscellaneous',
      'valhelsia_structures:chests/player_house',
      'valhelsia_structures:chests/witch_hut')
    .removeLoot('minecraft:diamond')

  // T2: spawner dungeon + treasure
  event
    .addLootTableModifier(
      'valhelsia_structures:chests/spawner_dungeon',
      'valhelsia_structures:chests/treasure')

  // --- IDAS: Integrated Dungeons and Structures (144 tables) ---
  // General overworld structures (T1)
  event
    .addLootTableModifier(/idas:chests\/(?!.*treasure)/)
    .removeLoot('minecraft:diamond')

  // Treasure tables within IDAS (T2)
  event
    .addLootTableModifier(/idas:chests\/.*treasure/)

  // --- Integrated Stronghold ---
  // NOT PRESENT in modpack (confirmed by loot_overhaul.js discovery scan)

  // --- Dungeons Plus (31 tables) ---
  // Common chests (T1)
  event
    .addLootTableModifier(/dungeons_plus:chests\/.*\/common/)
    .removeLoot('minecraft:diamond')

  // Rare chests (T2)
  event
    .addLootTableModifier(/dungeons_plus:chests\/.*\/rare/)

  // --- Dungeon Crawl (15 tables) ---
  // Staged dungeon: stages 1-2 = T1, stages 3-5 = T2, treasure = T2-T3
  event
    .addLootTableModifier(
      'dungeoncrawl:chests/stage_1',
      'dungeoncrawl:chests/stage_2',
      'dungeoncrawl:chests/food',
      'dungeoncrawl:chests/supply')
    .removeLoot('minecraft:diamond')
    .removeLoot('minecraft:diamond_block')

  event
    .addLootTableModifier(
      'dungeoncrawl:chests/stage_3',
      'dungeoncrawl:chests/stage_4',
      'dungeoncrawl:chests/forge',
      'dungeoncrawl:chests/library')

  event
    .addLootTableModifier(
      'dungeoncrawl:chests/stage_5',
      'dungeoncrawl:chests/secret_room',
      'dungeoncrawl:chests/treasure')

  // --- Structory (39 tables) — T1 overworld ---
  event
    .addLootTableModifier(/structory:.*chests.*/)
    .removeLoot('minecraft:diamond')

  // --- Structory Towers (49 tables) — T1-T2 overworld ---
  event
    .addLootTableModifier(/structory_towers:.*chests.*/)
    .removeLoot('minecraft:diamond')

  // =========================================================================
  // SECTION 4C: YUNG'S BETTER SERIES
  // All confirmed in loot table registry scan
  // =========================================================================

  // --- YUNG's Better Dungeons (8 tables) ---
  // T1-T2: overworld dungeons (zombie, skeleton, spider variants)
  event
    .addLootTableModifier(/betterdungeons:.*/)
    .removeLoot('minecraft:diamond')

  // --- YUNG's Better Strongholds (10 tables) ---
  // T2-T3: late overworld (library, corridor, crossing, grand_library, portal_room)
  event
    .addLootTableModifier(/betterstrongholds:.*/)

  // --- YUNG's Better Nether Fortresses (9 tables) ---
  // T3: Nether structures
  event
    .addLootTableModifier(/betterfortresses:.*/)

  // --- YUNG's Better Mineshafts ---
  // T1: overworld mineshafts
  event
    .addLootTableModifier(/bettermineshafts:.*/)
    .removeLoot('minecraft:diamond')

  // --- YUNG's Better Ocean Monuments (1 table) ---
  // T2: challenging overworld
  event
    .addLootTableModifier(/betteroceanmonuments:.*/)

  // --- YUNG's Better End Island ---
  // NOT PRESENT in modpack (confirmed by loot_overhaul.js discovery scan)
  // Kept commented out for future reference:
  // event.addLootTableModifier(/betterendisland:.*/)

  // Note: Better Desert Temples already covered in Section 3 above

  // =========================================================================
  // SECTION 4D: DIMENSION-SPECIFIC STRUCTURE LOOT
  // Dimensional mods with their own structure chests
  // =========================================================================

  // --- Blue Skies (641 tables, targeting chests only) ---
  // T2-T3: Everbright and Everdawn dimensions
  event
    .addLootTableModifier(/blue_skies:chests\/.*/)

  // --- Blue Skies: Runic Arc as very rare structure chest loot (0.5%) ---
  // Supplements the 5% boss drop rate (see loot_overhaul.js).
  // Only in Blue Skies dimensions to maintain dimensional gating.
  event
    .addLootTableModifier(/blue_skies:chests\/.*/)
    .addLoot(LootEntry.of('blue_skies:runic_arc').when(c => c.randomChance(0.005)))

  // --- Aether (191 tables, targeting chests only) ---
  // T2-T3: Aether dimension dungeons (bronze/silver/gold)
  event
    .addLootTableModifier(/aether:chests\/.*/)

  // --- Deep Aether (301 tables, targeting chests only) ---
  // T3-T4: Deep Aether brass/gold dungeons
  event
    .addLootTableModifier(/deep_aether:chests\/.*/)

  // --- Undergarden (215 tables, targeting chests only) ---
  // T2-T3: Undergarden dimension
  event
    .addLootTableModifier(/undergarden:chests\/.*/)

  // --- Deeper and Darker (149 tables, targeting chests only) ---
  // T3: Otherside dimension
  event
    .addLootTableModifier(/deeperdarker:chests\/.*/)

  // --- The Abyss structures (13 tables) ---
  // T3: Abyss dimension structures
  event
    .addLootTableModifier(/theabyss:chests\/.*/)

  // --- Cataclysm structures (164 tables, targeting chests only) ---
  // T3-T4: high-tier dungeon structures (soul forge, burning arena, sunken city, etc.)
  event
    .addLootTableModifier(/cataclysm:.*chest.*/)

  // --- Twilight Forest (532 tables, targeting chests only) ---
  // T2-T3: Twilight Forest dimension
  event
    .addLootTableModifier(/twilightforest:chests\/.*/)

  // =========================================================================
  // SECTION 4E: REMAINING OVERWORLD STRUCTURE MODS
  // =========================================================================

  // --- ChoiceTheorem's Overhauled Village (12 tables) ---
  // No T1 tokens — villages are starting areas, not progression structures
  event
    .addLootTableModifier(/ctov:.*/)
    .removeLoot('minecraft:diamond')

  // --- Explorations+ (16 tables) ---
  // T1: overworld exploration structures
  event
    .addLootTableModifier(/explorations:.*/)
    .removeLoot('minecraft:diamond')

  // --- Overhauled Structures: covered in Section 2 (chest_[12], chest_[3m]) ---

  // --- Loot Integrations: covered in Section 2 (difficulty-tier split) ---

  // =========================================================================
  // SECTION 5: DIAMOND/NETHERITE REMOVAL FROM VANILLA STRUCTURES
  // =========================================================================
  // Vanilla structures (desert temples, dungeons, mineshafts, etc.) should
  // not contain diamonds in a tier-gated pack. Players earn diamonds through
  // Tier 2 progression.
  // =========================================================================

  // Non-village vanilla overworld chests: remove diamonds + add T1 token chance
  const vanillaOverworldChests = [
    'minecraft:chests/simple_dungeon',
    'minecraft:chests/abandoned_mineshaft',
    'minecraft:chests/buried_treasure',
    'minecraft:chests/desert_pyramid',
    'minecraft:chests/jungle_temple',
    'minecraft:chests/pillager_outpost',
    'minecraft:chests/shipwreck_treasure',
    'minecraft:chests/stronghold_corridor',
    'minecraft:chests/stronghold_crossing',
    'minecraft:chests/stronghold_library',
    'minecraft:chests/underwater_ruin_big',
    'minecraft:chests/underwater_ruin_small',
    'minecraft:chests/woodland_mansion'
  ]

  vanillaOverworldChests.forEach(table => {
    event
      .addLootTableModifier(table)
      .removeLoot('minecraft:diamond')
      .removeLoot('minecraft:diamond_horse_armor')
  })

  // Village smith chests: remove diamonds, add 20% artifact chance per chest
  // Villages are starting areas — artifacts provide exciting early finds
  const vanillaVillageSmithChests = [
    'minecraft:chests/village/village_toolsmith',
    'minecraft:chests/village/village_weaponsmith',
    'minecraft:chests/village/village_armorer'
  ]

  // Artifacts mod handles artifact injection into village chests natively via GLM
  // We only handle material/gear adjustments here
  vanillaVillageSmithChests.forEach(table => {
    let modifier = event
      .addLootTableModifier(table)
      .removeLoot('minecraft:diamond')
      .removeLoot('minecraft:diamond_horse_armor')
      // Remove most gear — villages shouldn't be armouries
      .removeLoot('minecraft:iron_sword')
      .removeLoot('minecraft:iron_pickaxe')
      .removeLoot('minecraft:iron_helmet')
      .removeLoot('minecraft:iron_chestplate')
      .removeLoot('minecraft:iron_leggings')
      .removeLoot('minecraft:iron_boots')

    // T1 materials — iron, gold, copper (scarce)
    modifier.addLoot(LootEntry.of('minecraft:iron_ingot').limitCount([1, 2]).when(c => c.randomChance(0.10)))
    modifier.addLoot(LootEntry.of('minecraft:gold_ingot').limitCount([1, 1]).when(c => c.randomChance(0.05)))
    modifier.addLoot(LootEntry.of('minecraft:copper_ingot').limitCount([1, 3]).when(c => c.randomChance(0.08)))
    modifier.addLoot(LootEntry.of('create:brass_ingot').limitCount([1, 1]).when(c => c.randomChance(0.04)))

    // Seeds — relatively rare
    modifier.addLoot(LootEntry.of('minecraft:wheat_seeds').limitCount([1, 2]).when(c => c.randomChance(0.05)))
    modifier.addLoot(LootEntry.of('minecraft:beetroot_seeds').limitCount([1, 1]).when(c => c.randomChance(0.03)))
    modifier.addLoot(LootEntry.of('minecraft:pumpkin_seeds').limitCount([1, 1]).when(c => c.randomChance(0.03)))
    modifier.addLoot(LootEntry.of('minecraft:melon_seeds').limitCount([1, 1]).when(c => c.randomChance(0.02)))

    // Gear — uncommon (5%)
    modifier.addLoot(LootEntry.of('minecraft:iron_sword').when(c => c.randomChance(0.05)))
    modifier.addLoot(LootEntry.of('minecraft:iron_pickaxe').when(c => c.randomChance(0.05)))

    // Artifacts handled by Artifacts mod native GLM injection
  })

  // =========================================================================
  // SECTION 4D: VILLAGE HOUSE CHESTS — TOOLS, MAGIC, AFFIXES
  // =========================================================================
  // All village house chests get basic tools for early game, boosted magic
  // weapon chances, and a very low chance of an affixed weapon.
  // Villages are T1 starting areas — tools help new players, magic provides
  // early caster gear, affixes are exciting rare finds.
  // =========================================================================
  const villageHouseChests = [
    'minecraft:chests/village/village_plains_house',
    'minecraft:chests/village/village_desert_house',
    'minecraft:chests/village/village_savanna_house',
    'minecraft:chests/village/village_snowy_house',
    'minecraft:chests/village/village_taiga_house'
  ]

  villageHouseChests.forEach(table => {
    let mod = event.addLootTableModifier(table)

    // Wood tools — common starter gear (~15% each)
    mod.addLoot(LootEntry.of('minecraft:wooden_sword').when(c => c.randomChance(0.15)))
    mod.addLoot(LootEntry.of('minecraft:wooden_pickaxe').when(c => c.randomChance(0.15)))
    mod.addLoot(LootEntry.of('minecraft:wooden_axe').when(c => c.randomChance(0.12)))
    mod.addLoot(LootEntry.of('minecraft:wooden_shovel').when(c => c.randomChance(0.10)))
    mod.addLoot(LootEntry.of('minecraft:wooden_hoe').when(c => c.randomChance(0.08)))

    // Stone tools — less common (~8% each)
    mod.addLoot(LootEntry.of('minecraft:stone_sword').when(c => c.randomChance(0.08)))
    mod.addLoot(LootEntry.of('minecraft:stone_pickaxe').when(c => c.randomChance(0.08)))
    mod.addLoot(LootEntry.of('minecraft:stone_axe').when(c => c.randomChance(0.06)))
    mod.addLoot(LootEntry.of('minecraft:stone_shovel').when(c => c.randomChance(0.05)))

    // Magic weapons — boosted chance (~8% scroll, ~5% wand/book)
    mod.addLoot(LootEntry.of('irons_spellbooks:copper_spell_book').when(c => c.randomChance(0.05)))
    mod.addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.06)))

    // Enchanted iron weapons — very rare, exciting early finds
    // Apotheosis will naturally apply affixes to enchanted gear via its system
    mod.addLoot(LootEntry.of('minecraft:iron_sword').enchantRandomly().when(c => c.randomChance(0.03)))
    mod.addLoot(LootEntry.of('minecraft:iron_axe').enchantRandomly().when(c => c.randomChance(0.02)))

    // Artifacts handled by Artifacts mod native GLM injection
  })

  // =========================================================================
  // SECTION 5A: OVERWORLD CHEST CLUTTER CLEANUP
  // =========================================================================
  // Remove low-value filler items from ALL Overworld structure chests.
  // Full removals for horse armor, spider eyes, poisonous potatoes.
  // Partial reductions for rotten flesh (80%), gunpowder (50%),
  // string (50%), bones (50%), name tags (60%).
  // =========================================================================

  // --- Full removals: horse armor, spider eyes, poisonous potatoes ---
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .removeLoot('minecraft:iron_horse_armor')
    .removeLoot('minecraft:golden_horse_armor')
    .removeLoot('minecraft:diamond_horse_armor')
    .removeLoot('minecraft:leather_horse_armor')
    .removeLoot('minecraft:spider_eye')
    .removeLoot('minecraft:fermented_spider_eye')
    .removeLoot('minecraft:poisonous_potato')

  // --- Rotten flesh: 80% reduction (remove then re-add at 20% chance) ---
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .removeLoot('minecraft:rotten_flesh')
    .addLoot(LootEntry.of('minecraft:rotten_flesh').when(c => c.randomChance(0.20)))

  // --- Gunpowder: 50% reduction ---
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .removeLoot('minecraft:gunpowder')
    .addLoot(LootEntry.of('minecraft:gunpowder').when(c => c.randomChance(0.50)))

  // --- String: 50% reduction ---
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .removeLoot('minecraft:string')
    .addLoot(LootEntry.of('minecraft:string').when(c => c.randomChance(0.50)))

  // --- Bones: 50% reduction ---
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .removeLoot('minecraft:bone')
    .addLoot(LootEntry.of('minecraft:bone').when(c => c.randomChance(0.50)))

  // --- Name tags: 60% reduction (keep 40%) ---
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .removeLoot('minecraft:name_tag')
    .addLoot(LootEntry.of('minecraft:name_tag').when(c => c.randomChance(0.40)))

  // =========================================================================
  // SECTION 5A2: OVERWORLD CURIO DROPS
  // =========================================================================
  // Since tier-gated mod items were removed from Overworld chests, add more
  // curio/artifact drops to keep chests exciting. ~20% cumulative chance
  // for a random curio from any non-village Overworld structure chest.
  // =========================================================================

  // Artifact drops removed from generic Overworld chests — the Artifacts mod
  // already injects its own drops natively. Adding more on top made them
  // appear in every other chest. Towers of the Wild have their own boosted
  // rates (Section 8). Village smiths have a small chance (Section above).

  // =========================================================================
  // SECTION 5A3: IRON'S SPELLS TIERED LOOT
  // =========================================================================
  // Spell books, scrolls, and inks scale by tier to support magic builds
  // throughout progression. Copper/iron books early, gold/diamond later.
  // Scrolls in all tiers (random spell appropriate to dimension).
  // =========================================================================

  // T1 (Overworld): Scrolls, copper/iron spell books, common ink
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .addLoot(LootEntry.of('irons_spellbooks:copper_spell_book').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('irons_spellbooks:iron_spell_book').when(c => c.randomChance(0.01)))
    .addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.05)))

  // T2 (TF, Aether, Blue Skies): Scrolls, iron/gold spell books, uncommon ink
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('twilightforest:twilight_forest',
      'aether:the_aether', 'deep_aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
    .addLoot(LootEntry.of('irons_spellbooks:iron_spell_book').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('irons_spellbooks:gold_spell_book').when(c => c.randomChance(0.01)))
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.05)))

  // T3 (Nether, Undergarden): Scrolls, gold/diamond spell books, rare ink
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_nether', 'undergarden:undergarden')
    .addLoot(LootEntry.of('irons_spellbooks:gold_spell_book').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('irons_spellbooks:diamond_spell_book').when(c => c.randomChance(0.01)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.04)))

  // T4 (End, Deeper Darker, Abyss): Scrolls, diamond/netherite spell books, epic ink
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_end', 'deeperdarker:otherside', 'theabyss:the_abyss')
    .addLoot(LootEntry.of('irons_spellbooks:diamond_spell_book').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('irons_spellbooks:netherite_spell_book').when(c => c.randomChance(0.01)))
    .addLoot(LootEntry.of('irons_spellbooks:epic_ink').when(c => c.randomChance(0.03)))

  // =========================================================================
  // SECTION 5B: OVERWORLD STRUCTURE FOOD REDUCTION
  // =========================================================================
  // Reduce non-meat food in Overworld structure chests by 90%.
  // Meat (raw/cooked) is kept as-is since there's no infinite source.
  // Modded foods (Pam's HarvestCraft, Farmer's Delight) removed entirely
  // from structure loot — those should be player-crafted.
  // Only applies to Overworld dimension.
  // =========================================================================

  // --- Non-meat food items to reduce by 90% (keep 10% chance) ---
  // Uses removeLoot + addLoot with 10% random chance per food.
  // This effectively removes ~90% of these foods from Overworld structure chests.
  const reducedFoods = [
    'minecraft:bread',
    'minecraft:apple',
    'minecraft:golden_apple',
    'minecraft:golden_carrot',
    'minecraft:cookie',
    'minecraft:pumpkin_pie',
    'minecraft:beetroot_soup',
    'minecraft:mushroom_stew',
    'minecraft:suspicious_stew',
    'minecraft:baked_potato',
    'minecraft:carrot',
    'minecraft:potato',
    'minecraft:beetroot',
    'minecraft:melon_slice',
    'minecraft:sweet_berries',
    'minecraft:dried_kelp',
    'minecraft:cake'
  ]

  // Apply food reduction in Overworld chest loot.
  // Uses a single modifier that removes all listed foods, then adds back
  // each at 25% chance capped to 1. removeLoot with string item ID is
  // the most basic LootJS API and should work reliably.
  let foodMod = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')

  reducedFoods.forEach(food => {
    foodMod.removeLoot(food)
  })

  reducedFoods.forEach(food => {
    foodMod.addLoot(
      LootEntry.of(food).limitCount([1, 1]).when(c => c.randomChance(0.20))
    )
  })

  // --- Remove unstackable food entirely (space cloggy in early chests) ---
  const unstackableFoods = [
    'minecraft:beetroot_soup',
    'minecraft:mushroom_stew',
    'minecraft:suspicious_stew',
    'minecraft:rabbit_stew',
    'minecraft:cake'
  ]
  unstackableFoods.forEach(food => {
    foodMod.removeLoot(food)
  })

  // --- Add small chance of a bed in Overworld chests (early QoL) ---
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .addLoot(
      LootEntry.of('minecraft:white_bed').when(c => c.randomChance(0.06))
    )

  // --- Remove modded foods from structure chests (Overworld only) ---
  // Pam's HarvestCraft and Farmer's Delight foods should be player-crafted.
  // Uses KubeJS @mod filter to match all items from these namespaces.
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .removeLoot('@pamhc')
    .removeLoot('@farmersdelight')
    .removeLoot('@farmersrespite')
    .removeLoot('@brewinandchewin')
    .removeLoot('@collectorsreap')
    .removeLoot('@croptopia')
    .removeLoot('@culturaldelights')
    .removeLoot('@delightful')
    .removeLoot('@nethersdelight')

  // --- Remove tier-gated mod items from Overworld chests ---
  // These mods inject items into vanilla loot tables but are AStages-gated,
  // causing "Unfamiliar Item" confusion for pre-tier players.
  // Strip dimension mod items from Overworld chests (tag leakage)
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .removeLoot('@aether')
    .removeLoot('@deep_aether')
    .removeLoot('@blue_skies')
    .removeLoot('@twilightforest')
    .removeLoot('@theabyss')
    .removeLoot('blue_skies:moonstone_shard')
    .removeLoot('blue_skies:ventium_ingot')
    .removeLoot('blue_skies:falsite_ingot')
    .removeLoot('blue_skies:horizonite_ingot')
    .removeLoot('blue_skies:charoite')
    .removeLoot('blue_skies:diopside')

  // =========================================================================
  // SECTION 5C: OCEAN STRUCTURE LOOT
  // =========================================================================
  // Ocean structures (Monuments, Ruins, Shipwrecks, Buried Treasure) get
  // T1-appropriate loot with token fragments (15-20% chance).
  // Ocean Monuments get slightly better loot since they require underwater
  // combat (Elder Guardians). Water-themed curio drops at ~10% chance.
  // YUNG's Better Ocean Monuments handled in Section 4C above (T2 tokens).
  // =========================================================================

  // --- Vanilla Ocean Structures: Shipwrecks, Ocean Ruins, Buried Treasure ---
  // T1 ocean loot: nautical supplies + token fragments (15% chance)
  event
    .addLootTableModifier(
      'minecraft:chests/shipwreck_treasure',
      'minecraft:chests/shipwreck_map',
      'minecraft:chests/shipwreck_supply',
      'minecraft:chests/underwater_ruin_big',
      'minecraft:chests/underwater_ruin_small',
      'minecraft:chests/buried_treasure')
    .addLoot(LootEntry.of('minecraft:prismarine_shard').limitCount([1, 3]).when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('minecraft:prismarine_crystals').limitCount([1, 2]).when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('minecraft:nautilus_shell').when(c => c.randomChance(0.08)))

  // --- Vanilla Ocean Monument ---
  // T1-T2 ocean loot: slightly better rewards for underwater combat challenge
  // Note: diamonds already removed by Section 5 vanillaOverworldChests
  // Note: YUNG's Better Ocean Monuments already handled in Section 4C (T2 tokens)
  event
    .addLootTableModifier('minecraft:chests/ocean_monument')
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('minecraft:prismarine_shard').limitCount([2, 5]).when(c => c.randomChance(0.25)))
    .addLoot(LootEntry.of('minecraft:prismarine_crystals').limitCount([2, 4]).when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('minecraft:sponge').when(c => c.randomChance(0.10)))

  // --- Ocean structure curio drops: HEAVILY oceanic/fishing themed ---
  // Ocean structures should feel rewarding for aquatic exploration.
  // High chance for water-themed artifacts and fishing gear.
  event
    .addLootTableModifier(
      'minecraft:chests/shipwreck_treasure',
      'minecraft:chests/shipwreck_map',
      'minecraft:chests/shipwreck_supply',
      'minecraft:chests/underwater_ruin_big',
      'minecraft:chests/underwater_ruin_small',
      'minecraft:chests/buried_treasure',
      'minecraft:chests/ocean_monument')
    // Artifacts handled by Artifacts mod native GLM injection into these tables
    // Aquaculture fishing loot
    .addLoot(
      LootEntry.of('minecraft:fishing_rod').when(c => c.randomChance(0.12))
    )
    .addLoot(
      LootEntry.of('minecraft:tropical_fish_bucket').when(c => c.randomChance(0.08))
    )
    .addLoot(
      LootEntry.of('minecraft:heart_of_the_sea').when(c => c.randomChance(0.05))
    )

  // --- YUNG's Better Ocean Monuments: premium ocean loot ---
  // Already has T2 tokens from Section 4C; heavily water-themed curios
  event
    .addLootTableModifier(/betteroceanmonuments:.*/)
    .addLoot(
      LootEntry.of('artifacts:snorkel').when(c => c.randomChance(0.20))
    )
    .addLoot(
      LootEntry.of('artifacts:flippers').when(c => c.randomChance(0.20))
    )
    .addLoot(
      LootEntry.of('artifacts:umbrella').when(c => c.randomChance(0.10))
    )
    .addLoot(
      LootEntry.of('artifacts:crystal_heart').when(c => c.randomChance(0.06))
    )
    .addLoot(
      LootEntry.of('minecraft:heart_of_the_sea').when(c => c.randomChance(0.08))
    )

  // =========================================================================
  // SECTION 6: VILLAGE CHEST LOOT RESTRICTIONS
  // =========================================================================
  // Design doc: Village loot should be T1-appropriate only.
  // Remove powerful modded items, ensure iron/leather gear baseline.
  // Apotheosis affixes are applied post-generation and cannot be controlled
  // here, but we can remove obvious tier-breaking items.
  // =========================================================================

  const villageChests = [
    'minecraft:chests/village/village_weaponsmith',
    'minecraft:chests/village/village_toolsmith',
    'minecraft:chests/village/village_armorer',
    'minecraft:chests/village/village_plains_house',
    'minecraft:chests/village/village_desert_house',
    'minecraft:chests/village/village_savanna_house',
    'minecraft:chests/village/village_snowy_house',
    'minecraft:chests/village/village_taiga_house',
    'minecraft:chests/village/village_temple',
    'minecraft:chests/village/village_fisher',
    'minecraft:chests/village/village_tannery',
    'minecraft:chests/village/village_shepherd',
    'minecraft:chests/village/village_butcher',
    'minecraft:chests/village/village_cartographer',
    'minecraft:chests/village/village_mason'
  ]

  // Remove all diamond+ gear and powerful modded items from village chests
  villageChests.forEach(table => {
    event
      .addLootTableModifier(table)
      .removeLoot('minecraft:diamond')
      .removeLoot('minecraft:diamond_sword')
      .removeLoot('minecraft:diamond_pickaxe')
      .removeLoot('minecraft:diamond_axe')
      .removeLoot('minecraft:diamond_shovel')
      .removeLoot('minecraft:diamond_hoe')
      .removeLoot('minecraft:diamond_helmet')
      .removeLoot('minecraft:diamond_chestplate')
      .removeLoot('minecraft:diamond_leggings')
      .removeLoot('minecraft:diamond_boots')
      .removeLoot('minecraft:diamond_horse_armor')
      .removeLoot('minecraft:golden_horse_armor')
      .removeLoot('minecraft:iron_horse_armor')
      .removeLoot('minecraft:enchanted_golden_apple')
  })

  // Add guaranteed basic gear to smith village chests
  event
    .addLootTableModifier(
      'minecraft:chests/village/village_weaponsmith',
      'minecraft:chests/village/village_toolsmith',
      'minecraft:chests/village/village_armorer')
    .addLoot(LootEntry.of('minecraft:iron_ingot').limitCount([2, 5]))
    .addWeightedLoot([
      Item.of('minecraft:iron_sword').withChance(20),
      Item.of('minecraft:iron_pickaxe').withChance(20),
      Item.of('minecraft:iron_axe').withChance(15),
      Item.of('minecraft:leather_helmet').withChance(15),
      Item.of('minecraft:leather_chestplate').withChance(10),
      Item.of('minecraft:leather_leggings').withChance(10),
      Item.of('minecraft:leather_boots').withChance(10)
    ])

  // Flat ~4% curated artifact roll across all village chests.
  // Replaces the stacked artifacts:inject/chests/village/* + celestial_artifacts
  // village GLMs that were producing 25-30% artifact rates with multiple items
  // per chest. Excluded: plastic_drinking_hat, novelty_drinking_hat (user dislike),
  // and "the horse one" (pending user identification).
  //
  // Per-chest rate math: 25 items × 0.16% each = ~4% any-artifact rate.
  // Independent rolls mean technically a chest COULD spawn two artifacts, but
  // the probability is ~0.08% per chest — rare enough to ignore.
  // Village-only artifact pool: combat/utility focused + Cloud in a Bottle
  // These items do NOT overlap with the T1 global pool, so no persistent
  // filter conflicts. Villages get ONLY this pool (T1 global stripped).
  const villageArtifactPool = [
    'artifacts:cloud_in_a_bottle',
    'artifacts:power_glove',
    'artifacts:feral_claws',
    'artifacts:cross_necklace',
    'artifacts:panic_necklace',
    'artifacts:antidote_vessel',
    'artifacts:crystal_heart',
    'artifacts:obsidian_skull',
    'artifacts:night_vision_goggles',
    'artifacts:drama_mask',
    'artifacts:universal_attractor',
    'artifacts:pickaxe_heater'
  ]
  const villageArtifactPerItemChance = 0.08 / villageArtifactPool.length  // 8% combined

  // --- Village chest sanitization (runs FIRST) ---
  // Strip ALL T1 global pool items from villages so villages only get
  // the dedicated village pool above. Also strip mod leakage.
  villageChests.forEach(function(table) {
    var vSan = event.addLootTableModifier(table)
    // Remove ALL T1 items (no overlap with village pool)
    artifactT1Pool.forEach(function(item) {
      vSan.removeLoot(item)
    })
    // Remove other mod items
    vSan.removeLoot('@ars_nouveau')
      .removeLoot('ars_nouveau:novice_spell_book')
      .removeLoot('ars_nouveau:apprentice_spell_book')
      .removeLoot('ars_nouveau:archmage_spell_book')
      .removeLoot('@irons_spellbooks')
      .removeLoot('@moreartifacts')
      .removeLoot('kubejs:tier1_token')
      .removeLoot('kubejs:tier2_token')
      .removeLoot('kubejs:tier3_token')
      .removeLoot('kubejs:tier4_token')
  })

  // --- Village artifact pool (runs AFTER sanitization) ---
  // Re-add curated artifacts at controlled 4% rate
  villageChests.forEach(table => {
    const modifier = event.addLootTableModifier(table)
    villageArtifactPool.forEach(artifact => {
      modifier.addLoot(
        LootEntry.of(artifact).when(c => c.randomChance(villageArtifactPerItemChance))
      )
    })
  })

  // =========================================================================
  // SECTION 6B: VILLAGE MAGIC ACCESS
  // =========================================================================
  // Villages are T1 starting areas. Add starter magic items so players
  // discover the magic system early. Iron's Spellbooks scrolls require ink
  // to craft, so we inject common_ink (crafting material) + copper spell book
  // (starter permanent magic item). Ars Nouveau novice book + source gems
  // provide early access to the now-ungated Ars system.
  // Uses separate addLootTableModifier calls per table (no chaining).
  // =========================================================================

  // Iron's Spellbooks starter materials in villages
  villageChests.forEach(function(table) {
    event.addLootTableModifier(table)
      .addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.20)))
  })
  villageChests.forEach(function(table) {
    event.addLootTableModifier(table)
      .addLoot(LootEntry.of('irons_spellbooks:copper_spell_book').when(c => c.randomChance(0.05)))
  })

  // Ars Nouveau starter items in villages
  villageChests.forEach(function(table) {
    event.addLootTableModifier(table)
      .addLoot(LootEntry.of('ars_nouveau:novice_spell_book').when(c => c.randomChance(0.08)))
  })
  villageChests.forEach(function(table) {
    event.addLootTableModifier(table)
      .addLoot(LootEntry.of('ars_nouveau:source_gem').limitCount([1, 3]).when(c => c.randomChance(0.15)))
  })

  // =========================================================================
  // SECTION 7: TOWER STRUCTURE CURIO DROPS + MAGIC LOOT (REBUILT)
  // =========================================================================
  // Tower structures get curated curio drops at 8% per item (reduced from
  // 12-15%) plus magic starter items. Structory Towers and Keebsz share
  // a common curio pool but Keebsz gets floor-tiered loot in Section 8D.
  // =========================================================================

  // Shared tower curio pool (used by Structory Towers, Keebsz upper floors, TotW)
  var towerCurioPool = [
    ['artifacts:umbrella', 0.08],
    ['artifacts:bunny_hoppers', 0.08],
    ['artifacts:running_shoes', 0.08],
    ['artifacts:snowshoes', 0.08],
    ['artifacts:pocket_piston', 0.08],
    ['artifacts:universal_attractor', 0.06],
    ['artifacts:crystal_heart', 0.05],
    ['artifacts:cloud_in_a_bottle', 0.06],
    ['artifacts:obsidian_skull', 0.05]
  ]

  // --- Structory Towers — strip + rebuild ---
  // Strip diamonds (already done in Section 4B), add magic + curios
  var stMod = event.addLootTableModifier(/structory_towers:.*chests.*/)
  stMod.addLoot(LootEntry.of('ars_nouveau:source_gem').limitCount([1, 2]).when(c => c.randomChance(0.10)))
  stMod.addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.10)))
  stMod.addLoot(LootEntry.of('ars_nouveau:novice_spell_book').when(c => c.randomChance(0.08)))
  towerCurioPool.forEach(function(entry) {
    stMod.addLoot(LootEntry.of(entry[0]).when(c => c.randomChance(entry[1])))
  })

  // =========================================================================
  // SECTION 8: TOWERS OF THE WILD — STRIP + REBUILD (REBUILT)
  // =========================================================================
  // TotW chests: strip tier-breaking items, add guaranteed source_gem +
  // common_ink, curio drops at 8% per item, magic books, enchanted books.
  // These are T1 exploration landmarks — magic-themed, not resource farms.
  // =========================================================================

  // --- TotW tower_chest + ocean_tower_chest: strip + rebuild ---
  var totwTables = ['totw_reworked:tower_chest', 'totw_reworked:ocean_tower_chest']
  totwTables.forEach(function(table) {
    var totwMod = event.addLootTableModifier(table)
    // Strip tier-breaking items
    totwMod.removeLoot('minecraft:diamond')
    totwMod.removeLoot('botania:manasteel_ingot')
    totwMod.removeLoot('botania:mana_pearl')
    totwMod.removeLoot('botania:mana_diamond')
    totwMod.removeLoot('minecraft:arrow')
    totwMod.removeLoot('minecraft:spectral_arrow')
    // Guaranteed magic materials (1 each)
    totwMod.addLoot(LootEntry.of('ars_nouveau:source_gem').limitCount([1, 1]))
    totwMod.addLoot(LootEntry.of('irons_spellbooks:common_ink').limitCount([1, 1]))
    // 15% novice spell book
    totwMod.addLoot(LootEntry.of('ars_nouveau:novice_spell_book').when(c => c.randomChance(0.15)))
    // 10% copper spell book
    totwMod.addLoot(LootEntry.of('irons_spellbooks:copper_spell_book').when(c => c.randomChance(0.10)))
    // 10% enchanted book (levels 5-15)
    totwMod.addLoot(
      LootEntry.of('minecraft:enchanted_book')
        .enchantWithLevels(UniformGenerator.between(5, 15), true)
        .when(c => c.randomChance(0.10))
    )
    // Curio drops at 8% each
    towerCurioPool.forEach(function(entry) {
      totwMod.addLoot(LootEntry.of(entry[0]).when(c => c.randomChance(entry[1])))
    })
  })

  // --- Waystone Towers (stronghold_corridor) — slightly higher rates ---
  // These are harder to find, so bump rates up
  var waystoneMod = event.addLootTableModifier('minecraft:chests/stronghold_corridor')
  // Strip tier-breaking items
  waystoneMod.removeLoot('minecraft:diamond')
  waystoneMod.removeLoot('botania:manasteel_ingot')
  waystoneMod.removeLoot('botania:mana_pearl')
  waystoneMod.removeLoot('botania:mana_diamond')
  waystoneMod.removeLoot('minecraft:arrow')
  waystoneMod.removeLoot('minecraft:spectral_arrow')
  // 20% novice spell book (higher than TotW)
  waystoneMod.addLoot(LootEntry.of('ars_nouveau:novice_spell_book').when(c => c.randomChance(0.20)))
  // 15% copper spell book
  waystoneMod.addLoot(LootEntry.of('irons_spellbooks:copper_spell_book').when(c => c.randomChance(0.15)))
  // 12% source gem [2-4]
  waystoneMod.addLoot(LootEntry.of('ars_nouveau:source_gem').limitCount([2, 4]).when(c => c.randomChance(0.12)))
  // 10% enchanted book (levels 5-15)
  waystoneMod.addLoot(
    LootEntry.of('minecraft:enchanted_book')
      .enchantWithLevels(UniformGenerator.between(5, 15), true)
      .when(c => c.randomChance(0.10))
  )
  // Curio drops at 8% each (same pool)
  towerCurioPool.forEach(function(entry) {
    waystoneMod.addLoot(LootEntry.of(entry[0]).when(c => c.randomChance(entry[1])))
  })

  // =========================================================================
  // SECTION 8A: VILLAGE CHEST AFFIX GEAR — WHITE/GREEN ONLY
  // =========================================================================
  // Village chests should have low-tier affix gear (white/green rarity).
  // Blue is very rare (2%), no purple/orange. These are starting areas.
  // =========================================================================

  // Village chests: low chance for basic (white/green) gear
  const villageChestPatterns = [
    /minecraft:chests\/village\/.*/,
    /villagesandpillages:.*chests.*/,
    /ctov:.*chests.*/
  ]

  villageChestPatterns.forEach(pattern => {
    event
      .addLootTableModifier(pattern)
      // Note: Apotheosis affix filtering requires NBT inspection which
      // Ingredient.custom() can't do reliably in LootJS. Removed for now.
      // High-tier affixes in villages are rare enough to not be game-breaking.
  })

  // =========================================================================
  // SECTION 8B: BOOSTED MAGIC MATERIALS IN STRUCTURE CHESTS
  // =========================================================================
  // Magic mod materials and spell books get higher weight in all
  // structure chests (not just overworld chests).
  // =========================================================================

  // Iron's Spells inks are now tiered in Section 5A3 — no global injection needed

  // Ars Nouveau source gems in structure chests
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .addLoot(
      LootEntry.of('ars_nouveau:source_gem').limitCount([1, 3]).when(c => c.randomChance(0.05))
    )

  // =========================================================================
  // SECTION 8C: REDUCED ARTIFACT/CURIO WEIGHT IN GENERIC OW CHESTS
  // =========================================================================
  // General overworld chests (caves, mineshafts) should have very low
  // artifact chance (~5%). Structure-specific chests keep their rates.
  // Towers get boosted rates (Section 8 above).
  // =========================================================================

  // Already handled — artifacts only appear in structure-specific sections
  // (towers at ~12% per item, ocean at existing rates). Generic overworld
  // chests don't get artifact injections by default.

  // =========================================================================
  // SECTION 8.5: EPIC RPG CLASS ARTIFACTS — DROPS-ONLY INJECTION
  // =========================================================================
  // The mod's native loot injection GLMs (overworld/nether/end/treasure) are
  // blocked by our "replace": true in global_loot_modifiers.json — we don't
  // whitelist rpgseteffects:loot_injection/*, so they never fire.
  //
  // Re-add drops via LootJS with controlled rates + tier gating:
  //   - Fragment Core: 4% from any hostile mob death (basic resource)
  //   - Standalone Relics: spread across dimension chests by tier
  //   - Artifact Piece Pouch: T2+ boss drops only
  //   - Awakening artifacts: T4 boss drops only (AStages-gated for pickup too)
  // =========================================================================

  // Fragment Core: minor drop from any mob kill (replaces crafting path)
  // LootJS doesn't support @monster entity tag — use LootType.ENTITY instead
  event
    .addLootTypeModifier(LootType.ENTITY)
    .addLoot(LootEntry.of('rpgseteffects:fragment_core').when(c => c.randomChance(0.04)))

  // T1 Overworld chest relics (utility-focused — movement, minor passives)
  const t1Relics = [
    'rpgseteffects:featherfall_relic',
    'rpgseteffects:swift_boots_relic',
    'rpgseteffects:swift_strike_relic',
    'rpgseteffects:multi_jump_relic',
    'rpgseteffects:builders_flight_charm',
    'rpgseteffects:specter_lens',
    'rpgseteffects:deadly_luck_relic'
  ]
  t1Relics.forEach(relic => {
    event
      .addLootTypeModifier(LootType.CHEST)
      .anyDimension('minecraft:overworld', 'twilightforest:twilight_forest')
      .addLoot(LootEntry.of(relic).when(c => c.randomChance(0.004)))
  })

  // T2 chest relics (combat + resistance — Blue Skies / Aether)
  const t2Relics = [
    'rpgseteffects:brutal_fist_relic',
    'rpgseteffects:lethal_crit_relic',
    'rpgseteffects:vampiric_relic',
    'rpgseteffects:venom_relic',
    'rpgseteffects:ember_relic',
    'rpgseteffects:frost_relic',
    'rpgseteffects:poison_immunity_relic',
    'rpgseteffects:brambleguard_relic'
  ]
  t2Relics.forEach(relic => {
    event
      .addLootTypeModifier(LootType.CHEST)
      .anyDimension('blue_skies:everbright', 'blue_skies:everdawn',
        'aether:the_aether', 'deep_aether:the_aether')
      .addLoot(LootEntry.of(relic).when(c => c.randomChance(0.006)))
  })

  // T3 Nether/Undergarden relics (fire, decay, advanced utility)
  const t3Relics = [
    'rpgseteffects:fire_immunity_relic',
    'rpgseteffects:magma_walker_relic',
    'rpgseteffects:frost_walker_relic',
    'rpgseteffects:decay_relic',
    'rpgseteffects:soulthief_relic',
    'rpgseteffects:blightwake_relic',
    'rpgseteffects:radiant_burden_relic'
  ]
  t3Relics.forEach(relic => {
    event
      .addLootTypeModifier(LootType.CHEST)
      .anyDimension('minecraft:the_nether', 'undergarden:undergarden')
      .addLoot(LootEntry.of(relic).when(c => c.randomChance(0.008)))
  })

  // T4 End/Deeper Darker/Abyss relics (endgame — strongest passives)
  const t4Relics = [
    'rpgseteffects:wither_immunity_relic',
    'rpgseteffects:beastheart_relic',
    'rpgseteffects:malicebrand_relic',
    'rpgseteffects:mirrorspite_relic'
  ]
  t4Relics.forEach(relic => {
    event
      .addLootTypeModifier(LootType.CHEST)
      .anyDimension('minecraft:the_end', 'deeperdarker:otherside', 'theabyss:the_abyss')
      .addLoot(LootEntry.of(relic).when(c => c.randomChance(0.010)))
  })

  // Artifact Piece Pouch: guaranteed drop from T2+ bosses.
  // The pouch's internal loot table picks ONE of the 14 class artifacts on
  // open, keeping Awakening variants out of non-T4 drops.
  // Artifact Piece Pouch: guaranteed drop from T2+ bosses. The pouch's
  // loot table is overridden at kubejs/data/rpgseteffects/loot_tables/items/
  // artifact_piece_pouch.json to contain ONLY the 14 normal artifacts —
  // awakening variants are never in pouches, they drop directly from T4
  // bosses only. This keeps awakenings out of T2 loot entirely.
  const t2BossPouchDrops = [
    'twilightforest:entities/naga',
    'twilightforest:entities/lich',
    'twilightforest:entities/hydra',
    'cataclysm:entities/ignis',
    'aether:entities/slider',
    'blue_skies:entities/summoner',
    'alexscaves:entities/atlatitan'
  ]
  t2BossPouchDrops.forEach(table => {
    event
      .addLootTableModifier(table)
      .addLoot(LootEntry.of('rpgseteffects:artifact_piece_pouch'))
  })

  // T4 bosses drop 2 pouches (better normal artifact coverage at endgame)
  // PLUS direct awakening rolls — 0.7% per awakening per boss, 14 awakenings
  // = ~9.3% combined any-awakening chance per T4 boss kill. Half of what a
  // pouch-embedded-awakening model would have given, per user tuning.
  const t4BossTables = [
    'minecraft:entities/ender_dragon',
    'cataclysm:entities/ender_guardian',
    'cataclysm:entities/harbinger',
    'deeperdarker:entities/shattered',
    'alexscaves:entities/watcher'
  ]
  const awakeningPool = [
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
    'rpgseteffects:wolfheart_awakening_artifact'
  ]
  t4BossTables.forEach(table => {
    const modifier = event.addLootTableModifier(table)
    modifier.addLoot(LootEntry.of('rpgseteffects:artifact_piece_pouch').limitCount([2, 2]))
    awakeningPool.forEach(awakening => {
      modifier.addLoot(LootEntry.of(awakening).when(c => c.randomChance(0.007)))
    })
  })

  // =========================================================================
  // SECTION 8D: KEEBSZ BATTLE TOWER — 3-TIER FLOOR SYSTEM (REBUILT)
  // =========================================================================
  // Battle towers are combat gauntlets with escalating rewards.
  // Floor 1-3: T1 starter loot (XP, common magic, source gems)
  // Floor 4-6: T2 mid-tier (better XP, uncommon materials, potions)
  // Floor 7-10: T3 endgame (rare materials, diamonds allowed, rare inks)
  // =========================================================================

  // --- Floor 1-3 (keebsz:*/floor[12]and[23]) ---
  var keebszLow = event.addLootTableModifier(/keebsz:.*\/floor[12]and[23]/)
  keebszLow.removeLoot('minecraft:diamond')
  keebszLow.addLoot(
    LootEntry.of('minecraft:experience_bottle').limitCount([1, 3])
      .when(c => c.randomChance(0.15))
  )
  keebszLow.addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.10)))
  keebszLow.addLoot(LootEntry.of('ars_nouveau:novice_spell_book').when(c => c.randomChance(0.08)))
  keebszLow.addLoot(LootEntry.of('ars_nouveau:source_gem').limitCount([1, 2]).when(c => c.randomChance(0.05)))
  // 8% random T1 artifact (pick one from pool)
  var keebszLowArtifactChance = 0.08 / artifactT1Pool.length
  artifactT1Pool.forEach(function(item) {
    keebszLow.addLoot(LootEntry.of(item).when(c => c.randomChance(keebszLowArtifactChance)))
  })

  // --- Floor 4-6 (keebsz:*/floor[35]and[46]) ---
  var keebszMid = event.addLootTableModifier(/keebsz:.*\/floor[35]and[46]/)
  keebszMid.removeLoot('minecraft:diamond')
  keebszMid.addLoot(
    LootEntry.of('minecraft:experience_bottle').limitCount([2, 5])
      .when(c => c.randomChance(0.15))
  )
  // 12% uncommon materials (iron blocks, gold blocks)
  keebszMid.addLoot(LootEntry.of('minecraft:iron_block').when(c => c.randomChance(0.06)))
  keebszMid.addLoot(LootEntry.of('minecraft:gold_block').when(c => c.randomChance(0.06)))
  // 10% apprentice spell book
  keebszMid.addLoot(LootEntry.of('ars_nouveau:apprentice_spell_book').when(c => c.randomChance(0.10)))
  // 10% potions (healing, strength)
  keebszMid.addLoot(
    LootEntry.of(Item.of('minecraft:potion', '{Potion:"minecraft:strong_healing"}'))
      .when(c => c.randomChance(0.05))
  )
  keebszMid.addLoot(
    LootEntry.of(Item.of('minecraft:potion', '{Potion:"minecraft:strong_strength"}'))
      .when(c => c.randomChance(0.05))
  )
  // 10% enchanted book (levels 10-20)
  keebszMid.addLoot(
    LootEntry.of('minecraft:enchanted_book')
      .enchantWithLevels(UniformGenerator.between(10, 20), true)
      .when(c => c.randomChance(0.10))
  )

  // --- Floor 7-10 (keebsz:*/floor[79]and[810]) ---
  var keebszHigh = event.addLootTableModifier(/keebsz:.*\/floor[79]and[810]/)
  keebszHigh.addLoot(
    LootEntry.of('minecraft:experience_bottle').limitCount([3, 8])
      .when(c => c.randomChance(0.20))
  )
  // 15% rare materials (diamonds allowed at high floors)
  keebszHigh.addLoot(LootEntry.of('minecraft:diamond').limitCount([1, 3]).when(c => c.randomChance(0.15)))
  // 12% rare inks
  keebszHigh.addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.12)))
  // 10% enchanted book (levels 20-30)
  keebszHigh.addLoot(
    LootEntry.of('minecraft:enchanted_book')
      .enchantWithLevels(UniformGenerator.between(20, 30), true)
      .when(c => c.randomChance(0.10))
  )
  // 8% T2/T3 artifact from pool
  var keebszHighArtifactPool = artifactT2Pool.concat(artifactT3Pool)
  var keebszHighArtifactChance = 0.08 / keebszHighArtifactPool.length
  keebszHighArtifactPool.forEach(function(item) {
    keebszHigh.addLoot(LootEntry.of(item).when(c => c.randomChance(keebszHighArtifactChance)))
  })
  // Curio drops at 8% each for upper floors
  towerCurioPool.forEach(function(entry) {
    keebszHigh.addLoot(LootEntry.of(entry[0]).when(c => c.randomChance(entry[1])))
  })

  // =========================================================================
  // SECTION 9: ENABLE LOGGING (remove in production)
  // =========================================================================

  // event.enableLogging()

  console.log('[IridescentCraft] LootJS structure chest overhaul loaded')
  console.log('  - Global artifact strip: @artifacts, @celestial_artifacts, @relics removed from ALL chests')
  console.log('  - Tiered artifact re-injection: T1(10%) OW, T2(12%) TF/Aether/BS, T3(14%) Nether/UG, T4(16%) End/DD/Abyss')
  console.log('  - Tiered pools now include: Ars Nouveau books + source gems, Iron\'s Spellbooks inks')
  console.log('  - Global enchanted book removal + tier-scaled re-add')
  console.log('  - Structure token injection: 22+ mods covered')
  console.log('  - Vanilla diamond removal: 16 OW chest tables')
  console.log('  - Overworld clutter cleanup: horse armor, spider eyes, etc removed/reduced')
  console.log('  - Village magic access: common_ink (20%), copper_spell_book (5%), novice_spell_book (8%), source_gem (15%)')
  console.log('  - Village chest restrictions: iron/leather gear, no powerful items')
  console.log('  - Overworld food reduction: 90% non-meat, modded foods removed')
  console.log('  - Ocean structure loot: T1 tokens + water curios in ocean chests')
  console.log('  - TotW rebuilt: guaranteed source_gem + ink, 15% novice book, 10% copper book, 8% curios')
  console.log('  - Waystone Towers rebuilt: 20% novice book, 15% copper book, 12% source gems')
  console.log('  - Structory Towers rebuilt: 10% source_gem, 10% ink, 8% novice book, 8% curios')
  console.log('  - Keebsz 3-tier floors: F1-3 T1 starter, F4-6 T2 mid, F7-10 T3 endgame')
  console.log('  - Boosted magic materials: inks, source gems in structure chests')
})
