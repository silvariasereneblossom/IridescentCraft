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
// 2026-04-21: LootJS 2.13.1 `removeLoot(js_function)` doesn't auto-wrap a JS
// predicate — the TypeWrapper first tries `IngredientJS.of(fn)`, gets an empty
// ingredient, logs "Invalid ingredient for filter: Unknown", and installs
// ItemFilter.ALWAYS_FALSE (= strip nothing). Predicate filters must go through
// `ItemFilter.custom(fn)` explicitly, which the API exposes as a static method
// on the ItemFilter interface.
var ItemFilter = Java.loadClass('com.almostreliable.lootjs.filters.ItemFilter')

LootJS.modifiers(event => {

  // =========================================================================
  // SECTION 1: ENCHANTED BOOK REBALANCE
  // =========================================================================
  // Layer tier-scaled enchanted books on top of vanilla loot-table generation.
  // We do NOT strip vanilla books first — `removeLoot('minecraft:enchanted_book')`
  // creates a persistent filter in LootJS 2.x that catches our re-adds in the
  // same evaluation pass, producing blank/unenchanted books (confirmed 2026-04-18).
  //
  // Tier re-add rates (layered on top of vanilla's ~5-10%):
  //   Overworld: 7.5%
  //   Twilight Forest/Aether/Blue Skies: 10%
  //   Nether/Undergarden: 12.5%
  //   End/Deeper and Darker/The Abyss: 15%
  //
  // Also adds Ars Nouveau spell books at tier-appropriate rates.
  // =========================================================================

  // --- Blank-enchanted-book chest-wide filter REMOVED 2026-05-17 ---
  // The filter (added 2026-04-19, rewritten 3x) was stripping ~97% of
  // legitimate enchanted books across every chest table in the pack.
  // Root cause: the regex/substring predicates were written against a
  // no-whitespace NBT toString format that does NOT match Forge 1.20.1's
  // actual output. Real NBT has whitespace after colons:
  //   {StoredEnchantments: [{id: "namespace:name", lvl: Ns}]}
  // ground-truthed in playtest 2026-05-17 via /data get on an actual
  // dropped book (apotheosis:tempting). Each rewrite of the filter added
  // more regex sophistication without ever validating against actual NBT
  // — textbook hallucination-around-verifiable-facts.
  //
  // Diagnostic replacement: see kubejs/server_scripts/diag_blank_book_trace.js
  // which logs any blank enchanted_book entering a player inventory so we
  // can localize a real upstream source if one still exists. If/when blanks
  // are observed in trace logs, add a targeted LootJS modifier on the
  // specific mod's table rather than reinstating a chest-wide filter.

  // ─── ARCANE ESSENCE INJECTION ─────────────────────────────────────────
  // Magic cloth requires 8 arcane_essence per cloth, 64 per Wizard chestplate
  // (8 cloth), 192 for full Wizard robes. ISS does drop arcane_essence in
  // its structure chests + caster-mob drops, but volume is on the slow side
  // for casual T1 caster builds. Two augmentations:
  //
  //   (a) Bump rate in ISS structure chests (any LootType.CHEST in the
  //       irons_spellbooks namespace) — extra entry on top of native
  //       drops, so loot density compounds rather than replaces.
  //
  //   (b) Add small chance to vanilla magic-mob drop tables: witch, evoker,
  //       vex, illusioner. Gives a passive accumulation path during normal
  //       overworld exploration without requiring ISS structure raids.
  //
  // Net target: a player who's killed ~30-50 magic mobs over their first
  // overworld session has enough essence for at least a Wizard helmet or
  // boots, with full chestplate within reach by the time they unlock T2.
  event
    .addLootTableModifier(/^irons_spellbooks:chests\/.*/)
    .addLoot(LootEntry.of('irons_spellbooks:arcane_essence')
      .limitCount([2, 4])
      .when(c => c.randomChance(0.45)))

  // Vanilla magic mobs — small flat chance per kill
  ;['minecraft:witch', 'minecraft:evoker', 'minecraft:vex',
    'minecraft:illusioner'].forEach(function(mobId) {
    event
      .addEntityLootModifier(mobId)
      .addLoot(LootEntry.of('irons_spellbooks:arcane_essence')
        .limitCount([1, 2])
        .when(c => c.randomChance(0.35)))
  })

  // Vanilla undead — low per-kill rate × very high encounter frequency
  // adds a steady trickle. Excludes wither (boss) and zoglin (rare/Nether).
  ;['minecraft:zombie', 'minecraft:zombie_villager', 'minecraft:husk',
    'minecraft:drowned', 'minecraft:skeleton', 'minecraft:wither_skeleton',
    'minecraft:stray', 'minecraft:phantom'].forEach(function(mobId) {
    event
      .addEntityLootModifier(mobId)
      .addLoot(LootEntry.of('irons_spellbooks:arcane_essence')
        .when(c => c.randomChance(0.10)))
  })

  // ─── FULL ROBE PIECE DROPS ────────────────────────────────────────────
  // Rare full-piece drops as a parallel rail to magic_cloth crafting.
  // Pieces are vanilla ArmorItem subclasses, so Apotheosis's `affix_loot`
  // global modifier (data/apotheosis/loot_modifiers/affix_loot.json)
  // catches every drop and rolls affixes via the HELMET/CHESTPLATE/
  // LEGGINGS/BOOTS LootCategory predicates — confirmed against
  // dev/shadowsoffire/apotheosis/adventure/loot/LootCategory.class.
  //
  // Pool is the 10 T1-craftable robe sets (40 pieces total). Excludes
  // archevoker (smithing-only T2 upgrade), netherite_mage (T4),
  // infernal_sorcerer/paladin (boss-tier), gold_crown/tarnished/
  // boots_of_speed (relics).
  //
  // Total per-source rate splits evenly across all 40 pieces:
  //   ISS chests       10%  (intentional source — caster strongholds)
  //   magic mobs        5%  (witch/evoker/vex/illusioner)
  //   vanilla undead  2.5%  (passive trickle)
  // Per-piece chance = total / 40, rolled independently per entry.
  // Independent rolls allow rare double-drops, but expected value
  // matches the headline rate within ~0.5%.
  var T1_ROBE_PIECES = [
    'irons_spellbooks:wizard_helmet',          'irons_spellbooks:wizard_chestplate',
    'irons_spellbooks:wizard_leggings',        'irons_spellbooks:wizard_boots',
    'irons_spellbooks:cultist_helmet',         'irons_spellbooks:cultist_chestplate',
    'irons_spellbooks:cultist_leggings',       'irons_spellbooks:cultist_boots',
    'irons_spellbooks:cryomancer_helmet',      'irons_spellbooks:cryomancer_chestplate',
    'irons_spellbooks:cryomancer_leggings',    'irons_spellbooks:cryomancer_boots',
    'irons_spellbooks:electromancer_helmet',   'irons_spellbooks:electromancer_chestplate',
    'irons_spellbooks:electromancer_leggings', 'irons_spellbooks:electromancer_boots',
    'irons_spellbooks:plagued_helmet',         'irons_spellbooks:plagued_chestplate',
    'irons_spellbooks:plagued_leggings',       'irons_spellbooks:plagued_boots',
    'irons_spellbooks:priest_helmet',          'irons_spellbooks:priest_chestplate',
    'irons_spellbooks:priest_leggings',        'irons_spellbooks:priest_boots',
    'irons_spellbooks:pyromancer_helmet',      'irons_spellbooks:pyromancer_chestplate',
    'irons_spellbooks:pyromancer_leggings',    'irons_spellbooks:pyromancer_boots',
    'irons_spellbooks:shadowwalker_helmet',    'irons_spellbooks:shadowwalker_chestplate',
    'irons_spellbooks:shadowwalker_leggings',  'irons_spellbooks:shadowwalker_boots',
    'irons_spellbooks:pumpkin_helmet',         'irons_spellbooks:pumpkin_chestplate',
    'irons_spellbooks:pumpkin_leggings',       'irons_spellbooks:pumpkin_boots',
    'irons_spellbooks:wandering_magician_helmet',    'irons_spellbooks:wandering_magician_chestplate',
    'irons_spellbooks:wandering_magician_leggings',  'irons_spellbooks:wandering_magician_boots'
  ]

  function injectRobeDrops(modifier, totalChance) {
    var perPiece = totalChance / T1_ROBE_PIECES.length
    T1_ROBE_PIECES.forEach(function(itemId) {
      modifier.addLoot(LootEntry.of(itemId)
        .when(c => c.randomChance(perPiece)))
    })
  }

  // ISS chests — 10% combined per chest
  injectRobeDrops(
    event.addLootTableModifier(/^irons_spellbooks:chests\/.*/),
    0.10
  )

  // Magic mobs — 5% per kill
  ;['minecraft:witch', 'minecraft:evoker', 'minecraft:vex',
    'minecraft:illusioner'].forEach(function(mobId) {
    injectRobeDrops(event.addEntityLootModifier(mobId), 0.05)
  })

  // Vanilla undead — 2.5% per kill
  ;['minecraft:zombie', 'minecraft:zombie_villager', 'minecraft:husk',
    'minecraft:drowned', 'minecraft:skeleton', 'minecraft:wither_skeleton',
    'minecraft:stray', 'minecraft:phantom'].forEach(function(mobId) {
    injectRobeDrops(event.addEntityLootModifier(mobId), 0.025)
  })

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

  // ── TERRAMITY GUN + AMMO + GUN-ARMOR STRIP ──
  // Design: bosses and structures from Terramity stay; guns/ammo/ammo-
  // crafting/armor sets do not fit the pack's RPG progression.
  // Recipe removal lives in recipes/recipe_audit.js Section I. This block
  // catches loot-side sources (chests, mob drops, boss drops that reference
  // these items) so stripped items can't sneak in via world-gen loot either.
  // Enchantments are disabled via Apotheosis config (Discoverable/Lootable
  // both false for the 12 gun enchants).
  let terramityGunStrip = [
    // Firearms
    'terramity:basic_pistol', 'terramity:basic_rifle', 'terramity:advanced_pistol',
    'terramity:advanced_automatic_rifle', 'terramity:advanced_burst_rifle',
    'terramity:suppressed_advanced_pistol', 'terramity:anti_material_rifle',
    'terramity:antimatter_rifle', 'terramity:conductite_laser_rifle',
    'terramity:elite_rifle', 'terramity:flintlock_pistol', 'terramity:plague_pistol',
    'terramity:big_iron', 'terramity:asphodel', 'terramity:handcannon',
    'terramity:meteor_cannon', 'terramity:moondrill_cannon', 'terramity:railgun',
    'terramity:rocket_launcher', 'terramity:pump_action_shotgun',
    'terramity:sawed_off_shotgun', 'terramity:flare_gun',
    'terramity:hellspec_super_shotgun',
    // Projectiles + ammo
    'terramity:gunkshot_projectile', 'terramity:flare_gun_projectile',
    'terramity:enderswap_projectile', 'terramity:shadowflame_bullet',
    'terramity:steel_shell', 'terramity:chthonic_shell_casing',
    'terramity:daemonium_shotshells', 'terramity:daemonium_shotshell_projectile',
    'terramity:hellspec_shotshells',
    'terramity:copper_round', 'terramity:gold_round',
    'terramity:antimatter_round', 'terramity:dimlite_round',
    'terramity:iridium_round', 'terramity:suppressed_gold_round',
    // Gun crafting + ammo containers
    'terramity:gunsmith_station', 'terramity:advanced_gun_parts',
    'terramity:ammo_bag', 'terramity:ammo_box', 'terramity:bottomless_ammo_box',
  ]
  let terramityChestStrip = event.addLootTypeModifier(LootType.CHEST)
  terramityGunStrip.forEach(id => terramityChestStrip.removeLoot(id))
  let terramityEntityStrip = event.addLootTypeModifier(LootType.ENTITY)
  terramityGunStrip.forEach(id => terramityEntityStrip.removeLoot(id))

  // ── TERRAMITY NON-GUN EPIC CURIO/MELEE STRIP ──
  // (audit Phase 4.1, 2026-04-27 — companion to the I.3 recipe removal in
  // recipes/recipe_audit.js. Strips the same items from chest+entity loot
  // so they can't bypass the recipe gate via worldgen. Boss-drop allocation
  // for the 7 melee weapons happens in loot/terramity_boss_drops.js, which
  // runs AFTER this strip — the strip applies to GENERIC chest pools, the
  // boss allocation adds them back on specific tier-appropriate boss kills.)
  let terramityCurioStrip = [
    // Melee weapons (boss-allocated separately; stripped from generic loot)
    'terramity:blasphemic_rapture', 'terramity:unholy_lance',
    'terramity:davy_jones', 'terramity:olympus',
    'terramity:divine_intervention', 'terramity:planet_buster',
    'terramity:kamehameha',
    // Curios (no boss allocation — pack-internal balance: not appropriate
    // at any tier, even endgame; mod-internal +stat curios that conflict
    // with our class/origin/Tetra/curios system)
    'terramity:antimatter_pacemaker', 'terramity:nyxs_necklace',
    'terramity:antiprism', 'terramity:null_scarf',
    'terramity:dragon_band', 'terramity:sacred_speed_bracelets',
    'terramity:angel_feather', 'terramity:fortunes_favor'
  ]
  let terramityCurioChestStrip = event.addLootTypeModifier(LootType.CHEST)
  terramityCurioStrip.forEach(id => terramityCurioChestStrip.removeLoot(id))
  let terramityCurioEntityStrip = event.addLootTypeModifier(LootType.ENTITY)
  terramityCurioStrip.forEach(id => terramityCurioEntityStrip.removeLoot(id))

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

  // Blacklist Relics horse_flute globally — user dislike (summons a temporary
  // horse, doesn't really fit our progression design)
  event
    .addLootTypeModifier(LootType.CHEST)
    .removeLoot('relics:horse_flute')

  // Strip too_many_bows:rift_shard from chest pools globally.
  // Audit Phase 2.2 (2026-04-27): the namespace collision with our
  // kubejs:icraft_rift_shard (renamed in this same phase) caused UX
  // confusion. Players see two "Rift Shard" items in JEI with different
  // tooltips and uses. Strip the too_many_bows version from generic chest
  // pools so our endgame reagent is the only "Rift Shard" players encounter
  // via the loot economy. Bows that need too_many_bows:rift_shard for their
  // crafting recipes can still be acquired directly from our T2/T3/T4 pools.
  event
    .addLootTypeModifier(LootType.CHEST)
    .removeLoot('too_many_bows:rift_shard')

  // Re-add enchanted books at 7.5% — T1 (Overworld)
  // NOTE: LootEntry.of must be 'minecraft:book' (not enchanted_book).
  // EnchantmentHelper.enchantItem() checks `stack.is(Items.BOOK)` and only
  // writes to StoredEnchantments NBT for plain books — converting the stack
  // to enchanted_book as part of the function. Starting from enchanted_book
  // drops to the else branch which writes to the wrong NBT tag, so the
  // book appears blank to the player. Vanilla loot tables mirror this.
  console.log('[icraft-loot] Registering T1 enchanted_book re-add (Overworld, 7.5%, levels 10-25)')
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .addLoot(
      LootEntry.of('minecraft:book')
        .enchantWithLevels(UniformGenerator.between(10, 25), true)
        .when(c => c.randomChance(0.075))
    )

  // Re-add enchanted books at 10% — T2 (TF, Aether, Blue Skies)
  console.log('[icraft-loot] Registering T2 enchanted_book re-add (TF/Aether/BlueSkies, 10%, levels 15-30)')
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('twilightforest:twilight_forest',
      'aether:the_aether', 'deep_aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
    .addLoot(
      LootEntry.of('minecraft:book')
        .enchantWithLevels(UniformGenerator.between(15, 30), true)
        .when(c => c.randomChance(0.10))
    )

  // Re-add enchanted books at 12.5% — T3 (Nether, Undergarden)
  console.log('[icraft-loot] Registering T3 enchanted_book re-add (Nether/Undergarden, 12.5%, levels 20-30)')
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_nether', 'undergarden:undergarden')
    .addLoot(
      LootEntry.of('minecraft:book')
        .enchantWithLevels(UniformGenerator.between(20, 30), true)
        .when(c => c.randomChance(0.125))
    )

  // Re-add enchanted books at 15% — T4 (End, Deeper Darker, Abyss)
  console.log('[icraft-loot] Registering T4 enchanted_book re-add (End/DD/Abyss, 15%, level 30)')
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_end', 'deeperdarker:otherside', 'theabyss:the_abyss')
    .addLoot(
      LootEntry.of('minecraft:book')
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
      /^structory:.+/,
      /dungeons_plus:.*/,
      /dungeons_arise:.*/,
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

  // --- ISS Mana Ring — 2% in overworld structure chests (T2 lucky find) ---
  // Mana Ring is craftable at T2 (recipe re-tiered in tier_gated_recipes.js
  // I.9 — diamond -> mana_diamond), but it's also a reasonable lucky find
  // for casters exploring before they unlock Botania transmutation. Same
  // chest pool as the compass of return — dungeons, mineshafts, temples,
  // mod structures — skips village houses so it's not free power in a
  // starter village.
  event
    .addLootTableModifier(
      'minecraft:chests/simple_dungeon',
      'minecraft:chests/abandoned_mineshaft',
      'minecraft:chests/desert_pyramid',
      'minecraft:chests/jungle_temple',
      'minecraft:chests/stronghold_corridor',
      'minecraft:chests/stronghold_crossing',
      'minecraft:chests/stronghold_library',
      /dungeoncrawl:.*chests.*/,
      /explorify:.*chests.*/,
      /^structory:.+/,
      /dungeons_plus:.*/,
      /dungeons_arise:.*/,
      /valhelsia_structures:.*chests.*/,
      /repurposed_structures:.*chests.*/
    )
    .addLoot(
      LootEntry.of('irons_spellbooks:mana_ring').when(c => c.randomChance(0.02))
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
    // Saplings are useless clutter in chests — trees are everywhere. Uses
    // the Forge common tag which aggregates vanilla + BoP + Aether + BlueSkies.
    .removeLoot('#forge:saplings')
    .removeLoot('#minecraft:saplings')

  // --- Ars Nouveau spell books (re-add AFTER global strip) ---
  // T1 (Overworld): Novice spell book (5%)
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .addLoot(
      LootEntry.of('ars_nouveau:novice_spell_book').when(c => c.randomChance(0.025))
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

  // 2026-04-20: glyph tier arrays rebuilt from Ars Nouveau's own config
  // (config/ars_nouveau/glyph_*.toml, `glyph_tier` field). Our previous
  // manual categorization disagreed with the mod's own tiering on >20
  // glyphs — most infamously placing `heal`, `smelt`, `conjure_water`,
  // `extend_time`, `duration_down` in T1 (AN marks them T2), and putting
  // `launch`, `leap`, `bounce`, `pull`, `snare`, `toss`, `fell` in T2 (AN
  // marks them T1). That's why tester saw "T2 glyphs" in Overworld
  // villages — our T1 add list contained AN-T2 glyphs, so they legitimately
  // spawned in Overworld.
  //
  // AN has 3 tiers (ONE/TWO/THREE, plus CREATIVE which we ignore). Mapping
  // to our 4 dimension tiers:
  //   AN T1 (35 glyphs) -> Overworld (our T1)
  //   AN T2 (28 glyphs) -> TF/Aether/Blue Skies (our T2)
  //   AN T3 (14 glyphs) -> Nether/Undergarden + End/DD/Abyss (our T3 + T4)
  // Arrays are exhaustive per AN's config — any future AN update adding
  // glyphs will need manual re-sync.

  const glyphT1 = [
    'ars_nouveau:glyph_amplify', 'ars_nouveau:glyph_bounce', 'ars_nouveau:glyph_break',
    'ars_nouveau:glyph_craft', 'ars_nouveau:glyph_cut', 'ars_nouveau:glyph_delay',
    'ars_nouveau:glyph_dispel', 'ars_nouveau:glyph_evaporate', 'ars_nouveau:glyph_fell',
    'ars_nouveau:glyph_freeze', 'ars_nouveau:glyph_gust', 'ars_nouveau:glyph_harm',
    'ars_nouveau:glyph_harvest', 'ars_nouveau:glyph_ignite', 'ars_nouveau:glyph_interact',
    'ars_nouveau:glyph_launch', 'ars_nouveau:glyph_leap', 'ars_nouveau:glyph_light',
    'ars_nouveau:glyph_phantom_block', 'ars_nouveau:glyph_pickup', 'ars_nouveau:glyph_place_block',
    'ars_nouveau:glyph_projectile', 'ars_nouveau:glyph_pull', 'ars_nouveau:glyph_randomize',
    'ars_nouveau:glyph_redstone_signal', 'ars_nouveau:glyph_rotate', 'ars_nouveau:glyph_rune',
    'ars_nouveau:glyph_self', 'ars_nouveau:glyph_sensitive', 'ars_nouveau:glyph_snare',
    'ars_nouveau:glyph_summon_steed', 'ars_nouveau:glyph_summon_wolves', 'ars_nouveau:glyph_toss',
    'ars_nouveau:glyph_touch', 'ars_nouveau:glyph_underfoot'
  ]
  const glyphT1PerItem = 0.12 / glyphT1.length  // ~12% combined
  var glyphModT1 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
  glyphT1.forEach(g => {
    glyphModT1.addLoot(LootEntry.of(g).when(c => c.randomChance(glyphT1PerItem)))
  })

  const glyphT2 = [
    'ars_nouveau:glyph_accelerate', 'ars_nouveau:glyph_animate_block', 'ars_nouveau:glyph_aoe',
    'ars_nouveau:glyph_cold_snap', 'ars_nouveau:glyph_conjure_water', 'ars_nouveau:glyph_crush',
    'ars_nouveau:glyph_dampen', 'ars_nouveau:glyph_decelerate', 'ars_nouveau:glyph_duration_down',
    'ars_nouveau:glyph_ender_inventory', 'ars_nouveau:glyph_exchange', 'ars_nouveau:glyph_explosion',
    'ars_nouveau:glyph_extend_time', 'ars_nouveau:glyph_extract', 'ars_nouveau:glyph_firework',
    'ars_nouveau:glyph_flare', 'ars_nouveau:glyph_fortune', 'ars_nouveau:glyph_gravity',
    'ars_nouveau:glyph_grow', 'ars_nouveau:glyph_heal', 'ars_nouveau:glyph_infuse',
    'ars_nouveau:glyph_invisibility', 'ars_nouveau:glyph_name', 'ars_nouveau:glyph_pierce',
    'ars_nouveau:glyph_sense_magic', 'ars_nouveau:glyph_slowfall', 'ars_nouveau:glyph_smelt',
    'ars_nouveau:glyph_wind_shear'
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
    'ars_nouveau:glyph_blink', 'ars_nouveau:glyph_fangs', 'ars_nouveau:glyph_glide',
    'ars_nouveau:glyph_hex', 'ars_nouveau:glyph_intangible', 'ars_nouveau:glyph_lightning',
    'ars_nouveau:glyph_linger', 'ars_nouveau:glyph_orbit', 'ars_nouveau:glyph_split',
    'ars_nouveau:glyph_summon_decoy', 'ars_nouveau:glyph_summon_undead', 'ars_nouveau:glyph_summon_vex',
    'ars_nouveau:glyph_wall', 'ars_nouveau:glyph_wither'
  ]
  const glyphT3PerItem = 0.15 / glyphT3.length  // ~15% combined
  var glyphModT3 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_nether', 'undergarden:undergarden')
  glyphT3.forEach(g => {
    glyphModT3.addLoot(LootEntry.of(g).when(c => c.randomChance(glyphT3PerItem)))
  })

  // AN has 3 tiers — no T4. End/DD/Abyss chests still get glyph drops,
  // but they pull from AN T3 (the highest tier AN defines). Kept the
  // glyphT4 variable as an alias of glyphT3 so downstream `.concat(glyphT4)`
  // calls continue to work unchanged.
  const glyphT4 = glyphT3
  const glyphT4PerItem = 0.18 / glyphT4.length  // ~18% combined (now for AN T3 glyphs at End/DD/Abyss rate)
  var glyphModT4 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_end', 'deeperdarker:otherside', 'theabyss:the_abyss')
  glyphT4.forEach(g => {
    glyphModT4.addLoot(LootEntry.of(g).when(c => c.randomChance(glyphT4PerItem)))
  })

  // --- Off-tier glyph strips (keep T2+ glyphs out of T1, T3+ out of T2, etc.) ---
  // Runs AFTER glyph add modifiers on a separate event chain. LootJS's
  // persistent-filter quirk catches re-adds in the same chain, but independent
  // modifiers seem to evaluate cleanly against each other.
  const _glyphStripOW = event.addLootTypeModifier(LootType.CHEST).anyDimension('minecraft:overworld')
  glyphT2.concat(glyphT3, glyphT4).forEach(g => { _glyphStripOW.removeLoot(g) })

  const _glyphStripT2 = event.addLootTypeModifier(LootType.CHEST)
    .anyDimension('twilightforest:twilight_forest', 'aether:the_aether',
      'deep_aether:the_aether', 'blue_skies:everbright', 'blue_skies:everdawn')
  glyphT3.concat(glyphT4).forEach(g => { _glyphStripT2.removeLoot(g) })

  const _glyphStripT3 = event.addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_nether', 'undergarden:undergarden')
  glyphT4.forEach(g => { _glyphStripT3.removeLoot(g) })

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
    'irons_spellbooks:common_ink',
    // moreartifacts T1 — flavor curios (audit Phase 2.1, 2026-04-27)
    'moreartifacts:melody_plushie', 'moreartifacts:lucky_emerald_ring',
    // too_many_bows T1 — utility bows (audit Phase 2.2, 2026-04-27)
    'too_many_bows:dark_bow', 'too_many_bows:hunter_bow',
    'too_many_bows:flame_bow', 'too_many_bows:torchbearer',
    // celestial_artifacts T1 — flavor (re-audit 2026-05-13: angel_desire
    // moved to T3 — pure_nether_star recipe is endgame; bearing_stamen
    // moved here — basic plant material recipe; etchings T1: desire/origin)
    'celestial_artifacts:yellow_duck', 'celestial_artifacts:sakura_hairpin',
    'celestial_artifacts:bearing_stamen',
    'celestial_artifacts:desire_etching', 'celestial_artifacts:origin_etching'
  ]
  // 2026-04-22: was 15 independent addLoot calls at ~0.67% each. Math
  // said 0.1 artifacts/chest expected, but variance allowed 2-4 in
  // unlucky chests — tester reported a Waystone Towers chest (backed by
  // minecraft:chests/stronghold_corridor) dropping 4 artifacts at once.
  //
  // Rewritten using addAlternativesLoot: entries are evaluated in order,
  // first to pass its .when() fires, rest skipped. With each alternative
  // at 10%/15 ≈ 0.667% randomChance:
  //   P(any fires)  = 1 - 0.99333^15 ≈ 10% ← overall rate held steady
  //   P(exactly 1)  = same as P(any), because at most 1 alternative fires
  //   P(multiple)   = 0 (structural)
  // So Overworld chests now get at most 1 T1 artifact from this path.
  var modT1 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
  var t1PerAlt = 0.10 / artifactT1Pool.length
  var t1Alternatives = artifactT1Pool.map(function(item) {
    return LootEntry.of(item).when(function(c) { return c.randomChance(t1PerAlt) })
  })
  modT1.addAlternativesLoot.apply(modT1, t1Alternatives)

  // --- T2 Pool (~12% combined) — Twilight Forest, Aether, Blue Skies ---
  // Combat + defensive artifacts + mid-tier magic.
  const artifactT2Pool = [
    'artifacts:power_glove', 'artifacts:feral_claws', 'artifacts:pickaxe_heater',
    'artifacts:cross_necklace', 'artifacts:panic_necklace', 'artifacts:antidote_vessel',
    'artifacts:crystal_heart', 'artifacts:obsidian_skull',
    'celestial_artifacts:cross_necklace', 'celestial_artifacts:iron_scabbard',
    'celestial_artifacts:copper_reinforce_plate', 'celestial_artifacts:amethyst_ring',
    'celestial_artifacts:forest_cloak',
    // (re-audit 2026-05-13: holy_talisman -> T3 endgame, holy_sword -> T3,
    //  bearing_stamen -> T1, chaotic_pendant added from T4, prayer_crown
    //  added from T4, spirit_crown removed entirely)
    'celestial_artifacts:chaotic_pendant', 'celestial_artifacts:prayer_crown',
    'celestial_artifacts:life_bracelet', 'celestial_artifacts:fang_necklace',
    'ars_nouveau:apprentice_spell_book', 'irons_spellbooks:uncommon_ink',
    // moreartifacts T2 — defensive curios + mid-tier accessories
    // (audit Phase 2.1, 2026-04-27 — Hero/Ankh → T2 per locked-in mapping)
    'moreartifacts:hero_shield', 'moreartifacts:ankh_shield', 'moreartifacts:ankh_charm',
    'moreartifacts:vanir_mask', 'moreartifacts:tainted_mirror',
    // too_many_bows T2 — element-themed EPIC bows + RARE artifacts
    // (audit Phase 2.2, 2026-04-27)
    'too_many_bows:frostbite', 'too_many_bows:tidal_bow', 'too_many_bows:verdant_viper',
    'too_many_bows:burnt_relic', 'too_many_bows:sentinels_wrath',
    'too_many_bows:vitality_weaver', 'too_many_bows:verdant_vigor',
    'too_many_bows:webstring',
    // celestial_artifacts T2 — green/dark_green/red curios + EPIC defensive
    // (re-audit 2026-05-13: bearing_stamen -> T1)
    'celestial_artifacts:precious_bracelet', 'celestial_artifacts:spirit_necklace',
    'celestial_artifacts:emerald_ring', 'celestial_artifacts:emerald_necklace',
    'celestial_artifacts:emerald_bracelet', 'celestial_artifacts:gaia_totem',
    'celestial_artifacts:ring_of_life', 'celestial_artifacts:spirit_bracelet',
    'celestial_artifacts:spirit_arrow_bag',
    'celestial_artifacts:red_ruby_bracelet', 'celestial_artifacts:scarlet_bracelet',
    // etchings T2: truth (raiders), life (high-HP mobs)
    'celestial_artifacts:truth_etching', 'celestial_artifacts:life_etching'
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
    'ars_nouveau:archmage_spell_book', 'irons_spellbooks:rare_ink',
    // moreartifacts T3 — fire/decay/Nether-themed RARE curios
    // (audit Phase 2.1, 2026-04-27)
    'moreartifacts:blazing_treads', 'moreartifacts:envenomed_quiver',
    'moreartifacts:molten_quiver', 'moreartifacts:fire_stone',
    'moreartifacts:venom_stone', 'moreartifacts:decay_stone',
    'moreartifacts:necroplasm_amulet', 'moreartifacts:netherite_headgear',
    'moreartifacts:obsidian_shield', 'moreartifacts:recall_potion',
    'moreartifacts:withered_bezoar', 'moreartifacts:wither_shard',
    'moreartifacts:gilded_scarf', 'moreartifacts:ruby_ring',
    'moreartifacts:mechanical_claw', 'moreartifacts:ice_stone',
    // too_many_bows T3 — Nether/element-themed EPIC bows + reagents
    // (audit Phase 2.2, 2026-04-27)
    'too_many_bows:arcane_bow', 'too_many_bows:ancient_sage_bow',
    'too_many_bows:auroras_grace', 'too_many_bows:crimson_nexus',
    'too_many_bows:necro_flame_bow',
    'too_many_bows:cursed_stone', 'too_many_bows:soul_fragment',
    'too_many_bows:radiance', 'too_many_bows:wind_glove',
    'too_many_bows:stormbound_signet',
    // celestial_artifacts T3 — corruption + dark_purple + dark_aqua
    // (re-audit 2026-05-13: twisted_brain REMOVED -- design-intent entity-
    //  drop only; soul_box -> T4 endgame; angel_desire/holy_talisman/holy_sword
    //  /evil_eye added from T1/T2/T4; end_etching added)
    'celestial_artifacts:cursed_protector', 'celestial_artifacts:destroyer_badge',
    'celestial_artifacts:gluttony_badge', 'celestial_artifacts:greedy_heart',
    'celestial_artifacts:magic_horseshoe',
    'celestial_artifacts:sacrificial_object',
    'celestial_artifacts:ender_protector',
    'celestial_artifacts:war_dead_badge', 'celestial_artifacts:corrupt_badge',
    'celestial_artifacts:hidden_bracelet', 'celestial_artifacts:shadow_pendant',
    'celestial_artifacts:demon_curse', 'celestial_artifacts:cursed_talisman',
    'celestial_artifacts:twisted_scabbard', 'celestial_artifacts:catastrophe_scroll',
    'celestial_artifacts:abyss_will_badge', 'celestial_artifacts:lock_of_abyss',
    'celestial_artifacts:angel_desire', 'celestial_artifacts:holy_talisman',
    'celestial_artifacts:holy_sword', 'celestial_artifacts:evil_eye',
    // etching T3: end (harmful-effect-count theme)
    'celestial_artifacts:end_etching'
    // flight_ring deliberately NOT in T3 -- per 2026-05-13 design call,
    // it lives only in End+ as an extremely-rare standalone entry.
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
    // (re-audit 2026-05-13: nebula_cube + the_end_dust REMOVED (base
    //  crafting materials, not curios); flight_ring -> separate End+
    //  rare entry below; prayer_crown -> T2; spirit_crown REMOVED
    //  entirely (CA jungle_temple GLM covers it); end_etching -> T3;
    //  soul_box added from T3; angel_pearl added from non-pool)
    'celestial_artifacts:demon_heart', 'celestial_artifacts:abyss_core',
    'celestial_artifacts:angel_heart', 'celestial_artifacts:angel_pearl',
    'celestial_artifacts:soul_box',
    // moreartifacts T4 — End/Sculk-themed endgame curios
    // (audit Phase 2.1, 2026-04-27 — Dragon/Sculk → T4 per locked-in mapping)
    'moreartifacts:ender_dragon_claw', 'moreartifacts:dragon_eye',
    'moreartifacts:enderian_treads', 'moreartifacts:sculk_treads',
    'moreartifacts:enderian_eye', 'moreartifacts:shulked_clock',
    'moreartifacts:shulker_heart', 'moreartifacts:true_enderian_scarf',
    'moreartifacts:echo_glove',
    // too_many_bows T4 — endgame EPIC bows + power_crystal reagent
    // (audit Phase 2.2, 2026-04-27)
    'too_many_bows:dragons_breath', 'too_many_bows:astral_bound',
    'too_many_bows:spectral_whisper', 'too_many_bows:shulker_blast',
    'too_many_bows:arc_heavens', 'too_many_bows:twin_shadows',
    'too_many_bows:power_crystal', 'too_many_bows:dead_eyes_pendant',
    // celestial_artifacts T4 — endgame curios
    // (re-audit 2026-05-13: evil_eye -> T3; the_end_dust REMOVED (base
    //  material); chaotic_pendant -> T2)
    'celestial_artifacts:ender_jump_scepter',
    'celestial_artifacts:cursed_totem', 'celestial_artifacts:twisted_heart',
    'celestial_artifacts:twisted_scroll',
    'celestial_artifacts:heart_of_revenge',
    // etchings T4: nihility (abyss-damage), chaotic (explosion-damage)
    'celestial_artifacts:nihility_etching', 'celestial_artifacts:chaotic_etching'
  ]
  const artifactT4PerItem = 0.16 / artifactT4Pool.length  // 16% combined
  var modT4 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_end', 'deeperdarker:otherside', 'theabyss:the_abyss')
  artifactT4Pool.forEach(function(item) {
    modT4.addLoot(LootEntry.of(item).when(c => c.randomChance(artifactT4PerItem)))
  })

  // --- Flight Ring: ultra-rare End+ standalone (0.5% per End+ chest) ---
  // Sits outside the T4 pool so the rate is independent of pool size.
  // Per 2026-05-13 design call: creative-flight unlock should be a
  // legendary find, not a tier-rate-shared chance.
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_end', 'deeperdarker:otherside', 'theabyss:the_abyss')
    .addLoot(LootEntry.of('celestial_artifacts:flight_ring')
      .when(function(c) { return c.randomChance(0.005) }))

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
    .addLootTableModifier(/^villagesandpillages:.+/)
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

  // [Removed 2026-04-19] Overhauled Structures — mod not installed.
  // [Removed 2026-04-19] Loot Integrations — mod not installed. If either
  // mod is re-added later, restore from git history.

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
    .removeLoot('minecraft:diamond_horse_armor')

  // --- Iron's Spellbooks structures ---
  event
    .addLootTableModifier(/irons_spellbooks:.*chests.*/)
    .removeLoot('minecraft:diamond_horse_armor')

  // --- Moog's End Structures (T4 content — allow everything, add T4 tokens + thematic loot) ---
  // MES loot tables live at data/mes/loot_tables/*.json (no /chests/ subfolder)
  // e.g. mes:cathedral_rare, mes:mega_ship_treasure, mes:houses_common.
  // Old regex /mes:.*chests.*/ matched zero tables (audit 2026-04-19).
  event
    .addLootTableModifier(/^mes:.+/)
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

  // T2-T3 structures: heavenly series (challenger, conqueror, rider).
  // No strip needed at this tier — heavenly chests are allowed to be rich.
  // LootJS requires an action per modifier; register a no-op diamond strip
  // so the modifier validates (it's fine if heavenly chests never have
  // raw diamond drops — the token/gem rewards are on scripts, not here).
  event
    .addLootTableModifier(/dungeons_arise:chests\/heavenly_/)
    .removeLoot('minecraft:diamond_horse_armor') // harmless placeholder action

  // Catch-all treasure tables (T2+). Same action-required constraint.
  event
    .addLootTableModifier(/dungeons_arise:chests\/.*treasure/)
    .removeLoot('minecraft:diamond_horse_armor')

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
    .removeLoot('minecraft:diamond_horse_armor')

  // --- IDAS: Integrated Dungeons and Structures (144 tables) ---
  // General overworld structures (T1)
  event
    .addLootTableModifier(/idas:chests\/(?!.*treasure)/)
    .removeLoot('minecraft:diamond')

  // Treasure tables within IDAS (T2)
  event
    .addLootTableModifier(/idas:chests\/.*treasure/)
    .removeLoot('minecraft:diamond_horse_armor')

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
    .removeLoot('minecraft:diamond_horse_armor')

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
    .removeLoot('minecraft:diamond_horse_armor')

  event
    .addLootTableModifier(
      'dungeoncrawl:chests/stage_5',
      'dungeoncrawl:chests/secret_room',
      'dungeoncrawl:chests/treasure')
    .removeLoot('minecraft:diamond_horse_armor')

  // --- Structory (39 tables) — T1 overworld ---
  event
    .addLootTableModifier(/^structory:.+/)
    .removeLoot('minecraft:diamond')

  // --- Structory Towers (49 tables) — T1-T2 overworld ---
  event
    .addLootTableModifier(/structory_towers:.*chests.*/)
    .removeLoot('minecraft:diamond')

  // --- Epic Dungeons / "overhauledstructures" (12 tables, Overworld) ---
  // Mod namespace is `overhauledstructures` (NOT `epic_dungeons`). Prior audit
  // mistakenly marked this dead and removed coverage. Jar inspection 2026-04-19
  // confirmed: spawns in `#minecraft:is_overworld`, native tables drop
  // netherite_ingot (~4.5%) and diamond armor (~1.5%) in chest_3 — hard T1 break.
  //
  // Three dungeon families from structure files:
  //   ovdb_* -> overhauleddungeonbasic  (general dungeon)
  //   ovdp_* -> overhauleddungeonprison (decrepit theme)
  //   ovds_* -> overhauleddungeonspiders (web/venom theme)
  // Each family has 4 tiers: _chest_1, _chest_2, _chest_3, _chest_m (master).
  //
  // Overhaul = strip tier-breaking items, then inject thematic T1 content
  // matching each family's flavor, with tier-scaled rates.

  var overhauledAllTables = [
    /overhauledstructures:chests\/ovdb_loot_tables\/.*/,
    /overhauledstructures:chests\/ovdp_loot_tables\/.*/,
    /overhauledstructures:chests\/ovds_loot_tables\/.*/
  ]

  // --- Universal strip: kill tier-breakers across all 12 tables ---
  var ovdStrip = event.addLootTableModifier.apply(event, overhauledAllTables)
  var ovdTierBreakers = [
    'minecraft:diamond', 'minecraft:netherite_ingot', 'minecraft:netherite_scrap',
    'minecraft:diamond_helmet', 'minecraft:diamond_chestplate',
    'minecraft:diamond_leggings', 'minecraft:diamond_boots',
    'minecraft:diamond_sword', 'minecraft:diamond_axe',
    'minecraft:diamond_pickaxe', 'minecraft:diamond_shovel', 'minecraft:diamond_hoe',
    'minecraft:netherite_helmet', 'minecraft:netherite_chestplate',
    'minecraft:netherite_leggings', 'minecraft:netherite_boots',
    'minecraft:netherite_sword', 'minecraft:netherite_axe',
    'minecraft:netherite_pickaxe', 'minecraft:netherite_shovel', 'minecraft:netherite_hoe',
    'minecraft:budding_amethyst' // not a tier break, but removes a clutter item
  ]
  ovdTierBreakers.forEach(function(item) { ovdStrip.removeLoot(item) })

  // --- Universal T1 magic/progression kit (all 12 tables) ---
  var ovdUniversal = event.addLootTableModifier.apply(event, overhauledAllTables)
  // (legacy kubejs:tier1_token grant removed — currency retired; Codex tokens
  //  seed via loot/codex_exploration_drops.js)
  ovdUniversal.addLoot(LootEntry.of('ars_nouveau:source_gem').limitCount([1, 2]).when(c => c.randomChance(0.25)))
  ovdUniversal.addLoot(LootEntry.of('irons_spellbooks:common_ink').limitCount([1, 1]).when(c => c.randomChance(0.15)))
  ovdUniversal.addLoot(LootEntry.of('irons_spellbooks:copper_spell_book').when(c => c.randomChance(0.06)))
  ovdUniversal.addLoot(
    LootEntry.of('minecraft:book')
      .enchantWithLevels(UniformGenerator.between(5, 15), true)
      .when(c => c.randomChance(0.08))
  )

  // --- Family ovdb (basic): dungeoneering supplies ---
  var ovdbMod = event.addLootTableModifier(/overhauledstructures:chests\/ovdb_loot_tables\/.*/)
  ovdbMod.addLoot(LootEntry.of('minecraft:torch').limitCount([2, 6]).when(c => c.randomChance(0.60)))
  ovdbMod.addLoot(LootEntry.of('minecraft:bread').limitCount([2, 4]).when(c => c.randomChance(0.35)))
  ovdbMod.addLoot(LootEntry.of('minecraft:iron_ingot').limitCount([1, 3]).when(c => c.randomChance(0.25)))
  ovdbMod.addLoot(LootEntry.of('minecraft:map').when(c => c.randomChance(0.15)))
  ovdbMod.addLoot(LootEntry.of('minecraft:compass').when(c => c.randomChance(0.05)))

  // --- Family ovdp (prison): decrepit theme ---
  var ovdpMod = event.addLootTableModifier(/overhauledstructures:chests\/ovdp_loot_tables\/.*/)
  ovdpMod.addLoot(LootEntry.of('minecraft:chain').limitCount([2, 6]).when(c => c.randomChance(0.50)))
  ovdpMod.addLoot(LootEntry.of('minecraft:rotten_flesh').limitCount([3, 8]).when(c => c.randomChance(0.40)))
  ovdpMod.addLoot(LootEntry.of('minecraft:bone').limitCount([2, 5]).when(c => c.randomChance(0.40)))
  ovdpMod.addLoot(LootEntry.of('minecraft:soul_lantern').when(c => c.randomChance(0.15)))
  ovdpMod.addLoot(LootEntry.of('minecraft:name_tag').when(c => c.randomChance(0.06)))
  ovdpMod.addLoot(LootEntry.of('minecraft:iron_ingot').limitCount([1, 2]).when(c => c.randomChance(0.15)))

  // --- Family ovds (spiders): web/venom theme ---
  var ovdsMod = event.addLootTableModifier(/overhauledstructures:chests\/ovds_loot_tables\/.*/)
  ovdsMod.addLoot(LootEntry.of('minecraft:string').limitCount([4, 12]).when(c => c.randomChance(0.70)))
  ovdsMod.addLoot(LootEntry.of('minecraft:cobweb').limitCount([2, 6]).when(c => c.randomChance(0.45)))
  ovdsMod.addLoot(LootEntry.of('minecraft:spider_eye').limitCount([1, 4]).when(c => c.randomChance(0.40)))
  ovdsMod.addLoot(LootEntry.of('minecraft:fermented_spider_eye').when(c => c.randomChance(0.15)))
  ovdsMod.addLoot(LootEntry.of('minecraft:poisonous_potato').when(c => c.randomChance(0.08)))

  // --- Tier 3 + Master chests: bonus magic drops (each family's chest_3 + chest_m) ---
  // chest_3 = final room; chest_m = master reward. Higher magic-item chances
  // to reward players who clear the dungeon.
  var ovdMaster = event.addLootTableModifier(
    /overhauledstructures:chests\/ovd[bps]_loot_tables\/ovd[bps]_chest_(3|m)/
  )
  ovdMaster.addLoot(LootEntry.of('ars_nouveau:novice_spell_book').when(c => c.randomChance(0.025)))
  ovdMaster.addLoot(LootEntry.of('irons_spellbooks:copper_spell_book').when(c => c.randomChance(0.14)))
  ovdMaster.addLoot(LootEntry.of('ars_nouveau:source_gem').limitCount([2, 4]).when(c => c.randomChance(0.50)))
  // (legacy kubejs:tier1_token grant removed — currency retired)

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
    .removeLoot('minecraft:diamond_horse_armor')

  // --- YUNG's Better Nether Fortresses (9 tables) ---
  // T3: Nether structures
  event
    .addLootTableModifier(/betterfortresses:.*/)
    .removeLoot('minecraft:diamond_horse_armor')

  // --- YUNG's Better Mineshafts ---
  // T1: overworld mineshafts
  event
    .addLootTableModifier(/bettermineshafts:.*/)
    .removeLoot('minecraft:diamond')

  // --- YUNG's Better Ocean Monuments (1 table) ---
  // T2: challenging overworld
  event
    .addLootTableModifier(/betteroceanmonuments:.*/)
    .removeLoot('minecraft:diamond_horse_armor')

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
    .removeLoot('minecraft:diamond_horse_armor')

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
    .removeLoot('minecraft:diamond_horse_armor')

  // --- Deep Aether (301 tables, targeting chests only) ---
  // T3-T4: Deep Aether brass/gold dungeons
  event
    .addLootTableModifier(/deep_aether:chests\/.*/)
    .removeLoot('minecraft:diamond_horse_armor')

  // --- Undergarden (215 tables, targeting chests only) ---
  // T2-T3: Undergarden dimension
  event
    .addLootTableModifier(/undergarden:chests\/.*/)
    .removeLoot('minecraft:diamond_horse_armor')

  // --- Deeper and Darker (149 tables, targeting chests only) ---
  // T3: Otherside dimension
  event
    .addLootTableModifier(/deeperdarker:chests\/.*/)
    .removeLoot('minecraft:diamond_horse_armor')

  // --- The Abyss structures (13 tables) ---
  // T3: Abyss dimension structures
  event
    .addLootTableModifier(/theabyss:chests\/.*/)
    .removeLoot('minecraft:diamond_horse_armor')

  // --- Cataclysm structures (164 tables, targeting chests only) ---
  // T3-T4: high-tier dungeon structures (soul forge, burning arena, sunken city, etc.)
  event
    .addLootTableModifier(/cataclysm:.*chest.*/)
    .removeLoot('minecraft:diamond_horse_armor')

  // --- Twilight Forest (532 tables, targeting chests only) ---
  // T2-T3: Twilight Forest dimension
  event
    .addLootTableModifier(/twilightforest:chests\/.*/)
    .removeLoot('minecraft:diamond_horse_armor')

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
  // We only handle material/gear adjustments here.
  //
  // 2026-04-19: DO NOT strip iron gear here. removeLoot(specific_item) has
  // persistent-filter behavior that eats later addLoot/addWeightedLoot calls
  // for the same item id in the same evaluation pass — the village-weaponsmith
  // weighted pool at line ~1316 was being silently stripped, which is why
  // testers "rarely saw weapons." Let vanilla village smith tables drop iron
  // gear naturally and add our curated layer on top.
  vanillaVillageSmithChests.forEach(table => {
    let modifier = event
      .addLootTableModifier(table)
      .removeLoot('minecraft:diamond')
      .removeLoot('minecraft:diamond_horse_armor')

    // T1 materials — iron, gold, copper. 2026-04-26: bumped iron 0.10 -> 0.30
    // per tester report 'never seen iron in village chests'. Vanilla weights
    // are low; this guarantees a meaningful chance in armorer/toolsmith/weaponsmith.
    modifier.addLoot(LootEntry.of('minecraft:iron_ingot').limitCount([1, 3]).when(c => c.randomChance(0.30)))
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

    // Artifacts injection: now active as of 2026-04-26 (added all chest GLMs
    // to global_loot_modifiers.json allowlist; was previously suppressed by
    // replace:true even though comment claimed it was working).
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

  // 2026-04-20: restructured from per-item `.addLoot(entry.when(randomChance))`
  // to addWeightedLoot pools. Tester ran 30x /loot give and saw ZERO beds
  // despite a 20% bed add — statistically impossible with a real 20% rate.
  // addLoot+randomChance adds appear to silently no-op in this LootJS build
  // for per-item independent rolls on vanilla tables. The working pattern
  // (confirmed by tester: 'iron weapons do come from the smith table') is
  // addWeightedLoot, which rolls ONE guaranteed item from a weighted pool.
  //
  // Split into three weighted pools — rolls once each — so each village
  // house chest gets: 1 QoL flavor item + 1 tool/weapon + magic-materials.
  villageHouseChests.forEach(table => {
    let mod = event.addLootTableModifier(table)

    // Pool 1: QoL flavor — per-item independent chances. 2026-04-22:
    // addWeightedLoot collapses to "always one item" (no air filler
    // usable). Tester asked for bed to drop from 30% to 10%, so we
    // switched to independent rolls to tune each item directly. Expected
    // items per chest ≈ 0.80 (sum of probabilities). Occasional 2+ items
    // are fine given these are all flavor/starter items.
    mod.addLoot(LootEntry.of('minecraft:white_bed').when(c => c.randomChance(0.10)))
    mod.addLoot(LootEntry.of('minecraft:iron_bars').when(c => c.randomChance(0.20)))
    mod.addLoot(LootEntry.of('minecraft:lantern').when(c => c.randomChance(0.15)))
    mod.addLoot(LootEntry.of('minecraft:hay_block').when(c => c.randomChance(0.15)))
    mod.addLoot(LootEntry.of('minecraft:oak_boat').when(c => c.randomChance(0.12)))
    mod.addLoot(LootEntry.of('minecraft:bell').when(c => c.randomChance(0.08)))

    // Pool 2: starter tools — halved from the prior weighted pool per
    // tester request ("tools in half or so"). Independent per-item rolls
    // at roughly half the earlier weight. Expected tools per chest ≈ 0.49.
    mod.addLoot(LootEntry.of('minecraft:wooden_sword').when(c => c.randomChance(0.09)))
    mod.addLoot(LootEntry.of('minecraft:wooden_pickaxe').when(c => c.randomChance(0.09)))
    mod.addLoot(LootEntry.of('minecraft:wooden_axe').when(c => c.randomChance(0.07)))
    mod.addLoot(LootEntry.of('minecraft:wooden_shovel').when(c => c.randomChance(0.05)))
    mod.addLoot(LootEntry.of('minecraft:wooden_hoe').when(c => c.randomChance(0.04)))
    mod.addLoot(LootEntry.of('minecraft:stone_sword').when(c => c.randomChance(0.05)))
    mod.addLoot(LootEntry.of('minecraft:stone_pickaxe').when(c => c.randomChance(0.05)))
    mod.addLoot(LootEntry.of('minecraft:stone_axe').when(c => c.randomChance(0.03)))
    mod.addLoot(LootEntry.of('minecraft:stone_shovel').when(c => c.randomChance(0.02)))

    // Pool 3 (magic materials) was a guaranteed weighted roll of 40% ink
    // / 35% gem / 15% copper / 10% novice. Removed 2026-04-24: this stacked
    // on top of the overworld T1 rule below (Section 5A3) so village chests
    // got roughly 100% + 9% = far too much magic gear for a T1 starter area.
    // Villages now pick up magic via the overworld T1 rule only (copper 3%,
    // iron 1%, common_ink 5%) plus the native scroll entry in the village
    // house JSON override (~2.5% with a rolled random spell).

    // Artifacts handled by Artifacts mod native GLM injection (and our
    // villageArtifactPool re-adds in section 6).
  })

  // --- Village house clutter strip ---
  // Vanilla village house tables drop a lot of low-value filler (feather
  // spam, excess wheat seeds). Don't strip items that our later pools
  // re-add — per the persistent-filter rule, that would eat those re-adds too.
  // Limit to items we're confident we don't want anywhere.
  //
  // Keep meat (porkchop, chicken): it IS food and T1 players need early
  // calories. Only strip non-food filler. (2026-04-20 tester preference.)
  villageHouseChests.forEach(table => {
    event
      .addLootTableModifier(table)
      .removeLoot('minecraft:feather')
      .removeLoot('minecraft:rabbit_foot') // brewing clutter, not meat
      .removeLoot('minecraft:rabbit_hide')
  })

  // --- Village food + seed boost (added 2026-05-17) ---
  // Walks back the 2026-04-20 design call that reduced structure food loot
  // by 90% across all overworld chests (Section 7B further down). The
  // original rationale ("food shouldn't bypass the hunger system") was
  // overblown given how onerous the 2.5x hunger drain actually feels in
  // play. The global strip still applies to non-village chests; villages
  // get a flat food/seed boost on top, which is thematically correct
  // (villagers farm) and addresses the early-game food friction.
  //
  // Targets the 5 biome houses + CTOV + Villages and Pillages tables.
  // Expected items per chest: ~1.4 food + ~0.6 seeds (independent rolls).
  var VILLAGE_FOOD_BOOST = [
    ['minecraft:bread',         0.18],
    ['minecraft:wheat',         0.20],
    ['minecraft:carrot',        0.15],
    ['minecraft:potato',        0.15],
    ['minecraft:baked_potato',  0.10],
    ['minecraft:apple',         0.10],
    ['minecraft:beetroot',      0.08],
    ['minecraft:cookie',        0.10],
    ['minecraft:melon_slice',   0.08],
    ['minecraft:pumpkin_pie',   0.06],
    ['minecraft:sweet_berries', 0.05]
  ]
  // Seeds: FD-weighted per 2026-05-17 design call -- Farmer's Delight is
  // our farming-mod baseline, so its seeds should dominate the village
  // seed economy. FD cabbage/tomato/onion/rice combined ~68% of seed
  // rolls; vanilla wheat/beetroot/pumpkin/melon ~31%. FD "onion" and "rice"
  // items act as seeds when planted (no dedicated seed item exists for
  // those crops in FD).
  var VILLAGE_SEED_BOOST = [
    ['farmersdelight:cabbage_seeds', 0.20],
    ['farmersdelight:tomato_seeds',  0.18],
    ['farmersdelight:onion',         0.15],
    ['farmersdelight:rice',          0.15],
    ['minecraft:wheat_seeds',        0.12],
    ['minecraft:beetroot_seeds',     0.08],
    ['minecraft:pumpkin_seeds',      0.06],
    ['minecraft:melon_seeds',        0.05]
  ]
  function addVillageFoodSeedBoost(tableRef) {
    var mod = event.addLootTableModifier(tableRef)
    VILLAGE_FOOD_BOOST.forEach(function(entry) {
      mod.addLoot(LootEntry.of(entry[0]).limitCount([1, 2]).when(c => c.randomChance(entry[1])))
    })
    VILLAGE_SEED_BOOST.forEach(function(entry) {
      mod.addLoot(LootEntry.of(entry[0]).limitCount([1, 3]).when(c => c.randomChance(entry[1])))
    })
  }
  // 5 vanilla biome houses
  villageHouseChests.forEach(addVillageFoodSeedBoost)
  // CTOV (Choice Theorem's Overhauled Village) — broad regex; village-only
  // tables. The ctov: namespace ships dozens of structure-specific chest
  // tables and the food/seed boost is universally appropriate for any
  // "this is someone's home" chest in a CTOV village.
  addVillageFoodSeedBoost(/ctov:.*chests.*/)
  // Villages and Pillages — similar coverage.
  addVillageFoodSeedBoost(/villagesandpillages:.*chests.*/)

  // --- Butcher chest: guaranteed meat (added 2026-05-17) ---
  // Vanilla butcher table has all meat at random low-weight rolls so a
  // butcher chest may produce zero meat. Tester report: butcher chests
  // felt thematically broken (a butcher with no meat). Adding 3 guaranteed
  // entries on top — players always get at least 1 each of porkchop,
  // chicken, beef when looting a butcher chest. (Vanilla raw_porkchop /
  // raw_chicken / raw_rabbit entries on the table remain intact.)
  //
  // Meat is in the food strip allowlist (line 1411-1412) so this isn't
  // affected by the 90% Overworld food reduction.
  var butcherMod = event.addLootTableModifier('minecraft:chests/village/village_butcher')
  butcherMod.addLoot(LootEntry.of('minecraft:porkchop').limitCount([1, 3]))
  butcherMod.addLoot(LootEntry.of('minecraft:chicken').limitCount([1, 3]))
  butcherMod.addLoot(LootEntry.of('minecraft:beef').limitCount([1, 2]))

  // --- Farmer's Delight seeds in grass + tall_grass (added 2026-05-17) ---
  // Tester report: FD seeds aren't discoverable via the standard grass-
  // breaking onboarding flow that wheat_seeds uses, despite FD being our
  // farming-mod baseline. Adding cabbage_seeds and tomato_seeds at low
  // rates to grass/tall_grass loot tables so the discovery mechanism
  // covers FD too. FD onion/rice have their own wild block discovery
  // mechanism (wild_onions, wild_rice) so they don't need grass entries.
  event
    .addLootTableModifier('minecraft:blocks/grass')
    .addLoot(LootEntry.of('farmersdelight:cabbage_seeds').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('farmersdelight:tomato_seeds').when(c => c.randomChance(0.03)))
  event
    .addLootTableModifier('minecraft:blocks/tall_grass')
    .addLoot(LootEntry.of('farmersdelight:cabbage_seeds').when(c => c.randomChance(0.04)))
    .addLoot(LootEntry.of('farmersdelight:tomato_seeds').when(c => c.randomChance(0.04)))

  // =========================================================================
  // SECTION 4E: T1 IRON BASELINE -- guarantee iron in all overworld chests
  // =========================================================================
  // Tester report 2026-04-26: iron ingots are too scarce in T1 chests --
  // never observed iron in village chests despite vanilla loot tables
  // including it. Add 15% chance for iron_ingot (1-3 stack) to every T1
  // overworld chest type. Stacks with vanilla rolls. Village smith chests
  // already get 30% via Section 5; this catches the rest.
  //
  // Why 15% (not 25%): by the time players explore these structures they
  // should already have decent mined iron supply. The baseline isn't to
  // bootstrap iron access -- it's to supplement frequent repairs as
  // gear chips during exploration. Per tester directive 2026-04-26.

  const T1_IRON_BASELINE_CHESTS = [
    'minecraft:chests/simple_dungeon',
    'minecraft:chests/abandoned_mineshaft',
    'minecraft:chests/jungle_temple',
    'minecraft:chests/desert_pyramid',
    'minecraft:chests/igloo_chest',
    'minecraft:chests/woodland_mansion',
    'minecraft:chests/ruined_portal',
    'minecraft:chests/buried_treasure',
    'minecraft:chests/shipwreck_supply',
    'minecraft:chests/shipwreck_map',
    'minecraft:chests/shipwreck_treasure',
    'minecraft:chests/pillager_outpost',
    'minecraft:chests/underwater_ruin_big',
    'minecraft:chests/underwater_ruin_small',
    'minecraft:chests/spawn_bonus_chest',
    'minecraft:chests/stronghold_corridor',
    'minecraft:chests/stronghold_crossing',
    'minecraft:chests/village/village_plains_house',
    'minecraft:chests/village/village_desert_house',
    'minecraft:chests/village/village_savanna_house',
    'minecraft:chests/village/village_snowy_house',
    'minecraft:chests/village/village_taiga_house',
    'minecraft:chests/village/village_butcher',
    'minecraft:chests/village/village_cartographer',
    'minecraft:chests/village/village_fisher',
    'minecraft:chests/village/village_fletcher',
    'minecraft:chests/village/village_mason',
    'minecraft:chests/village/village_shepherd',
    'minecraft:chests/village/village_tannery',
    'minecraft:chests/village/village_temple'
  ]

  T1_IRON_BASELINE_CHESTS.forEach(table => {
    event.addLootTableModifier(table)
      .addLoot(LootEntry.of('minecraft:iron_ingot').limitCount([1, 3]).when(c => c.randomChance(0.15)))
  })
  console.log('[icraft-loot] T1 iron baseline: 15% iron_ingot (1-3) added to ' +
              T1_IRON_BASELINE_CHESTS.length + ' overworld chest types')

  // =========================================================================
  // SECTION 5A: OVERWORLD CHEST CLUTTER CLEANUP
  // =========================================================================
  // Remove low-value filler items from ALL Overworld structure chests.
  // Full removals for horse armor, spider eyes, poisonous potatoes.
  // Partial reductions for rotten flesh (80%), gunpowder (50%),
  // string (50%), bones (50%), name tags (60%).
  // =========================================================================

  // --- Full removals: horse armor, spider eyes, poisonous potatoes,
  //     rotten flesh, bulk wood + stone (2026-04-20 tester preference:
  //     "strip rotten meat, all wood and stone in chests") ---
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .removeLoot('minecraft:iron_horse_armor')
    .removeLoot('minecraft:golden_horse_armor')
    .removeLoot('minecraft:diamond_horse_armor')
    .removeLoot('minecraft:leather_horse_armor')
    .removeLoot('minecraft:spider_eye')
    .removeLoot('minecraft:fermented_spider_eye')
    // 2026-04-26: Terramity fairy_dust appearing in T1 overworld chests via
    // Terramity's subterranean_shrine + trial_spire loot tables (their
    // structures spawn in overworld biomes). Player progression intent:
    // fairy_dust comes from killing the 3 Terramity fairy mobs (proper
    // progression path), not from generic chest exploration. Strip from
    // every overworld CHEST loot type.
    .removeLoot('terramity:fairy_dust')
    .removeLoot('minecraft:poisonous_potato')
    .removeLoot('minecraft:rotten_flesh')
    // Wood: all log + plank variants via tags
    .removeLoot('#minecraft:logs')
    .removeLoot('#minecraft:planks')
    // Stone: common cheap gathering stones (keep sandstone/end_stone/nether_bricks
    // since those are dimension flavor, not Overworld filler)
    .removeLoot('minecraft:stone')
    .removeLoot('minecraft:cobblestone')
    .removeLoot('minecraft:mossy_cobblestone')
    .removeLoot('minecraft:granite')
    .removeLoot('minecraft:andesite')
    .removeLoot('minecraft:diorite')
    .removeLoot('minecraft:polished_granite')
    .removeLoot('minecraft:polished_andesite')
    .removeLoot('minecraft:polished_diorite')
    .removeLoot('minecraft:deepslate')
    .removeLoot('minecraft:cobbled_deepslate')
    .removeLoot('minecraft:polished_deepslate')
    .removeLoot('minecraft:tuff')
    .removeLoot('minecraft:stone_bricks')
    .removeLoot('minecraft:cracked_stone_bricks')
    .removeLoot('minecraft:mossy_stone_bricks')

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
  // SECTION 5A1.5: PRE-T3 DIAMOND HARD STRIP
  // =========================================================================
  // Tester reported diamonds generating in an Overworld structure not yet
  // covered by the per-structure strips (Section 4 has ~66 individual
  // removeLoot('minecraft:diamond') calls — but new structures keep slipping
  // through). This is a blanket strip across ALL chest tables in pre-T3
  // dimensions (Overworld + 5 modded T2 dims). T3+ (Nether, Undergarden,
  // End, Deeper Darker, The Abyss) keep diamonds.
  //
  // Why so aggressive: a T1 player finding 8 diamonds in a structure chest
  // skips iron->diamond progression entirely. Per design (master.md
  // progression curve): diamonds gate at T3, players should farm iron in
  // T1-T2, diamond access opens via Nether mining or T3 boss drops.
  //
  // Strip extends to diamond tools, armor, and horse armor — anything that
  // could give a T1-T2 player diamond-tier kit pre-progression. Vanilla
  // stronghold/desert temple chest loot is the most common source; modded
  // structures vary.
  // =========================================================================

  var preT3DiamondStrip = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld',
      'twilightforest:twilight_forest',
      'aether:the_aether', 'deep_aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
  preT3DiamondStrip.removeLoot('minecraft:diamond')
  preT3DiamondStrip.removeLoot('minecraft:diamond_sword')
  preT3DiamondStrip.removeLoot('minecraft:diamond_pickaxe')
  preT3DiamondStrip.removeLoot('minecraft:diamond_axe')
  preT3DiamondStrip.removeLoot('minecraft:diamond_shovel')
  preT3DiamondStrip.removeLoot('minecraft:diamond_hoe')
  preT3DiamondStrip.removeLoot('minecraft:diamond_helmet')
  preT3DiamondStrip.removeLoot('minecraft:diamond_chestplate')
  preT3DiamondStrip.removeLoot('minecraft:diamond_leggings')
  preT3DiamondStrip.removeLoot('minecraft:diamond_boots')
  preT3DiamondStrip.removeLoot('minecraft:diamond_horse_armor')

  // ─── Belt-and-suspenders: explicit per-table strips ───
  // 2026-05-10 audit found mod-shipped chest tables in pre-T3 dims that
  // contain vanilla diamond gear. The LootType.CHEST + anyDimension predicate
  // above SHOULD catch these, but custom mod calls can bypass the LootType
  // categorization (lessons-learned 2026-04-21 noted Lootr aggressive_mode
  // wrapping breaking similar predicates for villages). Per-table strips
  // are unambiguous regardless of how the table is invoked.
  var perTableDiamondStrip = event.addLootTableModifier(
    'artifacts:chests/campsite_chest',
    'irons_spellbooks:chests/battleground/burial_loot',
    'irons_spellbooks:chests/catacombs/coffin_loot',
    'irons_spellbooks:chests/catacombs/wall_loot',
    'irons_spellbooks:chests/generic_magic_treasure'
  )
  perTableDiamondStrip.removeLoot('minecraft:diamond')
  perTableDiamondStrip.removeLoot('minecraft:diamond_sword')
  perTableDiamondStrip.removeLoot('minecraft:diamond_pickaxe')
  perTableDiamondStrip.removeLoot('minecraft:diamond_axe')
  perTableDiamondStrip.removeLoot('minecraft:diamond_shovel')
  perTableDiamondStrip.removeLoot('minecraft:diamond_hoe')
  perTableDiamondStrip.removeLoot('minecraft:diamond_helmet')
  perTableDiamondStrip.removeLoot('minecraft:diamond_chestplate')
  perTableDiamondStrip.removeLoot('minecraft:diamond_leggings')
  perTableDiamondStrip.removeLoot('minecraft:diamond_boots')
  perTableDiamondStrip.removeLoot('minecraft:diamond_horse_armor')

  // ─── Wide regex catch-all: any chest-pathed table in pre-T3 dims ───
  // Matches any loot table whose path contains "chests/" or "chest/" under
  // any namespace. The dim filter restricts to OW + T2 dims so T3+ chests
  // still legitimately roll diamonds. This catches future modded structures
  // we haven't audited yet without requiring per-table maintenance.
  var regexDiamondStrip = event
    .addLootTableModifier(/^[a-z0-9_]+:.*chests?\//)
    .anyDimension('minecraft:overworld',
      'twilightforest:twilight_forest',
      'aether:the_aether', 'deep_aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
  regexDiamondStrip.removeLoot('minecraft:diamond')
  regexDiamondStrip.removeLoot('minecraft:diamond_sword')
  regexDiamondStrip.removeLoot('minecraft:diamond_pickaxe')
  regexDiamondStrip.removeLoot('minecraft:diamond_axe')
  regexDiamondStrip.removeLoot('minecraft:diamond_shovel')
  regexDiamondStrip.removeLoot('minecraft:diamond_hoe')
  regexDiamondStrip.removeLoot('minecraft:diamond_helmet')
  regexDiamondStrip.removeLoot('minecraft:diamond_chestplate')
  regexDiamondStrip.removeLoot('minecraft:diamond_leggings')
  regexDiamondStrip.removeLoot('minecraft:diamond_boots')
  regexDiamondStrip.removeLoot('minecraft:diamond_horse_armor')

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
    .addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.075)))

  // T2 (TF, Aether, Blue Skies): Scrolls, iron/gold spell books, uncommon ink
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('twilightforest:twilight_forest',
      'aether:the_aether', 'deep_aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
    .addLoot(LootEntry.of('irons_spellbooks:iron_spell_book').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('irons_spellbooks:gold_spell_book').when(c => c.randomChance(0.01)))
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.075)))

  // T3 (Nether, Undergarden): Scrolls, gold/diamond spell books, rare ink
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_nether', 'undergarden:undergarden')
    .addLoot(LootEntry.of('irons_spellbooks:gold_spell_book').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('irons_spellbooks:diamond_spell_book').when(c => c.randomChance(0.01)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.06)))

  // T4 (End, Deeper Darker, Abyss): Scrolls, diamond/netherite spell books, epic ink
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_end', 'deeperdarker:otherside', 'theabyss:the_abyss')
    .addLoot(LootEntry.of('irons_spellbooks:diamond_spell_book').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('irons_spellbooks:netherite_spell_book').when(c => c.randomChance(0.01)))
    .addLoot(LootEntry.of('irons_spellbooks:epic_ink').when(c => c.randomChance(0.045)))

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

  // Blue Skies gatekeeper houses spawn in overworld plains/mountain/snowy
  // biomes (the lore entry-point to Blue Skies dimensions). Their barrels
  // were falling outside the broad LootType.CHEST + anyDimension('overworld')
  // matchers above -- so they were getting:
  //   - Unfiltered Relics GLM injection (Infinity Ham + other strips)
  //   - Unfiltered Apotheosis gem GLM injection (uncut/dead gems)
  //   - Unfiltered Artifacts GLM injection (untiered artifacts)
  //   - Native T2 leakage in the barrel tables (ventium, moonstone)
  //
  // Fix (2026-05-14): explicit per-table strip applying the same
  // namespaced filters our overworld chests get, but routed via
  // addLootTableModifier so the targeting can't be missed.
  //
  // Native barrel contents observed in the BS jar:
  //   plains:   baked_potato/black_wool/bread/dandelion + ventium_ingot (T2)
  //   book:     book/paper/bread/map + moonstone_shard (T2 portal mat)
  //   mountain: wheat/stick/bread/spruce_log + cooked_monitor_tail + leather_boots
  //   snowy:    wheat/charcoal/bread/sweet_berries + snowcap_pinhead
  //
  // Note: post-alpha, if Blue Skies moves to T1 (see roadmap/planned.md),
  // remove this whole block -- gatekeeper houses become legitimate T1
  // discovery loot at that point.
  const gatekeeperHouseChests = [
    'blue_skies:chests/gatekeeper_house/plains',
    'blue_skies:chests/gatekeeper_house/mountain',
    'blue_skies:chests/gatekeeper_house/snowy',
    'blue_skies:chests/gatekeeper_house/book',
  ]
  gatekeeperHouseChests.forEach(table => {
    let mod = event.addLootTableModifier(table)
    // Same curated relic strip the overworld chests get
    removedRelics.forEach(r => mod.removeLoot(r))
    // T2+ Blue Skies metals + portal material
    mod.removeLoot('blue_skies:ventium_ingot')
    mod.removeLoot('blue_skies:moonstone_shard')
    mod.removeLoot('blue_skies:falsite_ingot')
    mod.removeLoot('blue_skies:horizonite_ingot')
    mod.removeLoot('blue_skies:charoite')
    mod.removeLoot('blue_skies:diopside')
    // Apotheosis GLM injects uncut/dead gems here -- strip the whole
    // namespace from gatekeeper barrels (legitimate gems still flow into
    // villages + dungeons via curated paths elsewhere).
    mod.removeLoot('@apotheosis')
    // Artifacts GLM injects untiered artifacts -- T1 villages get a
    // curated artifact pool in Section 6; gatekeeper barrels just strip.
    mod.removeLoot('@artifacts')
  })

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
    'minecraft:chests/village/village_fletcher',
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
      // Per-table strips — the global Section 5A overworld strip's
      // LootType.CHEST + anyDimension filter doesn't reliably match
      // village loot contexts. 2026-04-20 tester confirmed the rotten_flesh
      // strip works here; also confirmed string was still very frequent
      // and wood/stone still present, both of which the global strip
      // was supposed to handle. Move to per-table.
      .removeLoot('minecraft:rotten_flesh')
      .removeLoot('minecraft:string')
      .removeLoot('minecraft:gunpowder')
      .removeLoot('minecraft:bone')
      .removeLoot('minecraft:name_tag')
      .removeLoot('minecraft:spider_eye')
      .removeLoot('minecraft:poisonous_potato')
      // 2026-04-21: per-table blank enchanted book strip. The global
      // LootType.CHEST predicate-based strip at Section 1 handles most
      // cases, but belt-and-suspenders on villages specifically.
      .removeLoot(ItemFilter.custom(blankEnchantedBookFilter))
      // Wood + stone that the global strip missed
      .removeLoot('#minecraft:logs')
      .removeLoot('#minecraft:planks')
      .removeLoot('minecraft:stone')
      .removeLoot('minecraft:cobblestone')
      .removeLoot('minecraft:granite')
      .removeLoot('minecraft:andesite')
      .removeLoot('minecraft:diorite')
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
  // Village-only artifact pool: combat/utility focused, curated mid-tier set.
  // 2026-04-21: removed `artifacts:cloud_in_a_bottle` — it was also in
  // artifactT1Pool (Overworld broadcast), so it had two independent sources
  // per village chest (T1 broadcast + village weighted roll), producing the
  // observed double-accessory stacking. Cloud still spawns everywhere else
  // in the Overworld via the T1 broadcast; villages now get only these 11
  // items that are unique to the village pool.
  const villageArtifactPool = [
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
  const villageArtifactPerItemChance = 0.10 / villageArtifactPool.length  // ~10% combined — matches overall T1 artifact rate (2026-04-20, was 15% since 2026-04-19)

  // Modded village chest patterns — CTOV, VillagesAndPillages, etc. generate
  // their own custom villages whose loot tables aren't in the vanilla list.
  // Regex match catches any chest path containing "village" under these mods.
  const moddedVillagePatterns = [
    /^ctov:chests\//,
    /^villagesandpillages:.+/,
    /^repurposed_structures:chests\/villages\//,
    /^townstead:.*chests?\//,
  ]

  // --- Village chest sanitization (runs FIRST) ---
  // Strip ALL T1 global pool items from villages so villages only get
  // the dedicated village pool above. Also strip mod leakage.
  //
  // 2026-04-20: removed @ars_nouveau / @irons_spellbooks / @moreartifacts
  // tag-based catch-alls. Per the LootJS persistent-filter rule, those tag
  // strips were silently eating every same-namespace item re-added later in
  // the same pass — including T1 glyphs from SECTION 2's global Overworld
  // adds, and the novice_spell_book / source_gem / copper_spell_book /
  // common_ink re-adds in SECTION 6B. Only keep strips for items we
  // explicitly don't want in villages (higher-tier spell books, tier tokens,
  // T2+ glyphs).
  villageChests.forEach(function(table) {
    var vSan = event.addLootTableModifier(table)
    // Remove ALL T1 global-pool items (handled by village artifact pool instead)
    artifactT1Pool.forEach(function(item) {
      vSan.removeLoot(item)
    })
    // Strip higher-tier spell books that shouldn't appear in starter-area villages
    vSan.removeLoot('ars_nouveau:apprentice_spell_book')
      .removeLoot('ars_nouveau:archmage_spell_book')
    // (legacy kubejs:tierN_token village strips removed — currency retired,
    //  tokens are no longer seeded anywhere so the strip is a dead no-op)
    // Defensive: strip T2+ glyphs explicitly. The global off-tier strip at
    // line ~371 uses LootType.CHEST + anyDimension('minecraft:overworld'),
    // which under Lootr's aggressive_mode wrapping doesn't reliably match
    // village loot contexts. Per-table strip is unambiguous.
    glyphT2.concat(glyphT3, glyphT4).forEach(function(g) { vSan.removeLoot(g) })
  })

  // Same T2+ glyph guard for modded village patterns (CTOV, VnP, etc.)
  moddedVillagePatterns.forEach(function(pattern) {
    var vSanMod = event.addLootTableModifier(pattern)
    glyphT2.concat(glyphT3, glyphT4).forEach(function(g) { vSanMod.removeLoot(g) })
  })

  // --- Predicate catch-all: strip any artifact that isn't from the village pool ---
  // 2026-04-21: per-item string strips at line ~1554 weren't catching T1
  // broadcast leaks (tester reported uncurated artifacts appearing in village
  // chests with artifacts outside villageArtifactPool). Predicate runs at
  // roll time and evaluates whatever is actually in the pool, so it catches
  // leaks regardless of which modifier added them.
  //
  // 2026-04-21 (second pass): tester reported possible accessory double-stacking
  // — suspicion that the T1 broadcast was adding `artifacts:cloud_in_a_bottle`
  // alongside the village pool's own roll (they share that item). Confirmed:
  // `cloud_in_a_bottle` is in BOTH `villageArtifactPool` (whitelist) and
  // `artifactT1Pool` (broadcast source). Whitelist-based predicate let the
  // broadcast's cloud through, and the village pool's independent weighted
  // roll could also produce a cloud in the same chest.
  //
  // Fix: strip only the T1 broadcast items (only pool that injects into
  // Overworld villages). T2/T3/T4 broadcasts target non-Overworld dimensions
  // and don't leak here. The T1 pool is where the `cloud_in_a_bottle`
  // double-stack came from — it's in both artifactT1Pool (broadcast) and
  // villageArtifactPool (curated). Strip it from villages unconditionally
  // and let the village's own addWeightedLoot roll be its only source.
  //
  // IMPORTANT: do NOT add artifactT2Pool/T3/T4 items to this strip set.
  // villageArtifactPool contains items that are BOTH T2+ broadcast entries
  // (power_glove, cross_necklace, panic_necklace, etc.) AND village-curated.
  // A strip including those would also strip the village pool's own rolls,
  // because removeLoot on a table applies after addWeightedLoot too.
  var t1BroadcastItemSet = {}
  artifactT1Pool.forEach(function(id) { t1BroadcastItemSet[id] = true })
  var villageArtifactWhitelistSet = {}
  villageArtifactPool.forEach(function(id) { villageArtifactWhitelistSet[id] = true })
  var nonCuratedArtifactFilter = function(stack) {
    try {
      if (!stack || stack.isEmpty()) return false
      var id = String(stack.id || '')
      if (!id) {
        try { id = String(stack.getItem().builtInRegistryHolder().key().location()) } catch (e) {}
      }
      if (!id) return false
      // Strip 1: any T1 broadcast item. These come from Section 1C's
      // `addLootTypeModifier(LootType.CHEST).anyDimension(OW)` injection
      // and are always wrong for villages (villages get their own pool).
      // Eliminates the cloud_in_a_bottle double-stack.
      if (t1BroadcastItemSet[id]) return true
      // Strip 2: any artifact/relic item from a namespace we care about that
      // isn't one of our curated items. Use an explicit whitelist of what
      // villages ARE allowed to produce (villageArtifactPool), so uncurated
      // mod artifacts get stripped while curated T2+ items pass through.
      var isArtifactNs = (
        id.indexOf('artifacts:') === 0 ||
        id.indexOf('relics:') === 0 ||
        id.indexOf('celestial_artifacts:') === 0
      )
      if (!isArtifactNs) return false
      return !villageArtifactWhitelistSet[id]
    } catch (e) { return false }
  }
  villageChests.forEach(function(table) {
    event.addLootTableModifier(table).removeLoot(ItemFilter.custom(nonCuratedArtifactFilter))
  })
  moddedVillagePatterns.forEach(function(pattern) {
    event.addLootTableModifier(pattern).removeLoot(ItemFilter.custom(nonCuratedArtifactFilter))
  })

  // --- Village artifact pool (runs AFTER sanitization) ---
  // 2026-04-21 (third rewrite): tester reported artifacts landing in NEARLY
  // EVERY chest, despite a weighted pool designed for ~11% rate. Root cause
  // is almost certainly that LootJS 2.13.1 drops `Item.of('minecraft:air')`
  // from `addWeightedLoot` pools (air isn't a real insertable item), which
  // collapses the pool to just-artifacts and makes every roll pick one.
  //
  // Switched back to per-item `addLoot(entry.when(randomChance))` at 1%
  // per item. For 11 items: P(at least one) = 1 - 0.99^11 ≈ 10.5%,
  // matching the intended target. This is the same pattern the enchanted
  // book adds at lines 181-222 use reliably (those consistently fire at
  // 7.5%/10%/12.5%/15% per tester reports).
  const villageArtifactPerItem = 0.01
  villageChests.forEach(function(table) {
    var vMod = event.addLootTableModifier(table)
    villageArtifactPool.forEach(function(id) {
      vMod.addLoot(LootEntry.of(id).when(c => c.randomChance(villageArtifactPerItem)))
    })
  })
  moddedVillagePatterns.forEach(function(pattern) {
    var vMod = event.addLootTableModifier(pattern)
    villageArtifactPool.forEach(function(id) {
      vMod.addLoot(LootEntry.of(id).when(c => c.randomChance(villageArtifactPerItem)))
    })
  })

  // --- Rotten flesh strip: modded villages (CTOV/VnP) weren't covered ---
  // Per-pattern strip (the global Overworld strip is unreliable).
  moddedVillagePatterns.forEach(function(pattern) {
    event.addLootTableModifier(pattern)
      .removeLoot('minecraft:rotten_flesh')
  })

  // =========================================================================
  // SECTION 6B: VILLAGE QOL POOL — bed + magic, all 15 tables (addWeightedLoot)
  // =========================================================================
  // 2026-04-20 rewrite: previously used per-item
  //   .addLoot(LootEntry.of(X).when(c => c.randomChance(P)))
  // which tester confirmed silently no-ops (30 /loot give rolls, 0 beds
  // against an expected ~6). `addWeightedLoot` is the proven-working pattern.
  //
  // Every village chest (all 15 + modded patterns) gets ONE weighted roll.
  // 30% of rolls yield a bed, 25% yield magic material, 15% yield a copper
  // spell book, 10% a novice spell book, 20% air (= nothing). villageHouseChests
  // (5 tables) get three additional weighted pools from the earlier block
  // (QoL flavor, starter tools, magic) so houses are richer by design.

  // 2026-04-21: removed bed from this pool. House tables already include
  // bed in their dedicated QoL flavor pool (villageHouseChests block
  // earlier), so leaving bed here caused tester to see two beds in one
  // house chest occasionally. This pool is now magic-materials-only and
  // applies to all 15 tables — houses already get bed + other flavor
  // from their richer 3-pool setup, non-houses (smith/butcher/tannery/etc.)
  // get magic materials from here. Air slot gives ~40% of chests NO
  // magic material (most chests have some magic material ~60%).
  const villageQoLPool = [
    Item.of('minecraft:air').withChance(40),
    Item.of('irons_spellbooks:common_ink').withChance(30),
    Item.of('ars_nouveau:source_gem').withChance(15),
    Item.of('irons_spellbooks:copper_spell_book').withChance(10),
    Item.of('ars_nouveau:novice_spell_book').withChance(2)
  ]

  villageChests.forEach(function(table) {
    event.addLootTableModifier(table).addWeightedLoot(villageQoLPool)
  })
  moddedVillagePatterns.forEach(function(pattern) {
    event.addLootTableModifier(pattern).addWeightedLoot(villageQoLPool)
  })

  // --- Nature's Compass + base Sophisticated Backpack — village chest adds ---
  // Nature's Compass at 5%: useful for locating our iridescent_biomes:cherry_river_valley
  // and iridescent_biomes:cherry_mountains biomes (which generate after the
  // minecraft:is_overworld tag fix 2026-04-22).
  // Sophisticated Backpacks base variant at 4%: leather+chest+string crafting
  // tier, 27 slots when placed, also wearable via the Curios back slot.
  // Gives T1 players a real inventory bump in a pack-coherent way without
  // spawning the upgraded tiers (iron/gold/diamond/netherite) prematurely.
  villageChests.forEach(function(table) {
    event.addLootTableModifier(table)
      .addLoot(LootEntry.of('naturescompass:naturescompass').when(c => c.randomChance(0.05)))
      .addLoot(LootEntry.of('sophisticatedbackpacks:backpack').when(c => c.randomChance(0.04)))
  })
  moddedVillagePatterns.forEach(function(pattern) {
    event.addLootTableModifier(pattern)
      .addLoot(LootEntry.of('naturescompass:naturescompass').when(c => c.randomChance(0.05)))
      .addLoot(LootEntry.of('sophisticatedbackpacks:backpack').when(c => c.randomChance(0.04)))
  })

  // =========================================================================
  // SECTION 7: TOWER STRUCTURE CURIO DROPS + MAGIC LOOT (REBUILT)
  // =========================================================================
  // Tower structures get curated curio drops at 8% per item (reduced from
  // 12-15%) plus magic starter items. Structory Towers and Keebsz share
  // a common curio pool but Keebsz gets floor-tiered loot in Section 8D.
  // =========================================================================

  // ─── MARQUEE STRUCTURE THEMED POOLS (added 2026-05-17) ─────────────────
  // Per master.md Part XIII §Marquee structures + master-appendix.md §N.
  //
  // 14 marquee structures across T1-T4 each receive a curated themed pool
  // layered on top of the dimensional baseline. Themed pool rate is
  // calibrated at ~70% of tier rate (~7% T1, ~8.4% T2, ~9.8% T3, ~11.2% T4).
  // Combined per-chest at marquees is ~1.7× tier rate (rewards intentional
  // exploration); generic chests stay at tier rate.
  //
  // ISS spellbooks (copper/apprentice/archmage) capped at 2% per chest. The
  // starter kit handles "hard to start magic" onboarding; legacy 8-15% rates
  // (lootjs_overhaul.js pre-2026-05-17) were overkill.
  //
  // ISS scrolls remain a primary mage-progression vector — uncapped per
  // tier (t1Scroll/t2Scroll helpers, added at theme-fitting marquees only).
  //
  // Replaces 2026-04-22 towerCurioPool (9-item duplicate firing at ~40%
  // combined across TotW/Structory/Waystone, the source of the "same few
  // artifacts over and over again" tester complaint pre-2026-05-17).

  // Helper: T1/T2 ISS scroll loot entries (uses LootJS customFunction to
  // apply irons_spellbooks:randomize_spell — without it the scroll drops
  // blank). Kept from pre-2026-05-17 code; still used by marquee adds.
  function t1Scroll(chance) {
    return LootEntry.of('irons_spellbooks:scroll')
      .customFunction({
        function: 'irons_spellbooks:randomize_spell',
        quality: { min: 0.0, max: 0.2 }
      })
      .when(c => c.randomChance(chance))
  }
  function t2Scroll(chance) {
    return LootEntry.of('irons_spellbooks:scroll')
      .customFunction({
        function: 'irons_spellbooks:randomize_spell',
        quality: { min: 0.2, max: 0.5 }
      })
      .when(c => c.randomChance(chance))
  }

  // Per-tier combined themed rate (~70% of tier rate).
  var TIER_THEMED_RATE = { 1: 0.07, 2: 0.084, 3: 0.098, 4: 0.112 }
  var ISS_SPELLBOOK_CAP = 0.02
  // Per-tier scroll rate (uncapped, but tier-scaled).
  var TIER_SCROLL_RATE = { 1: 0.10, 2: 0.08, 3: 0.06, 4: 0.04 }
  // Per-tier enchanted book rate (still uses minecraft:book + enchantWithLevels).
  var TIER_BOOK_LEVELS = { 1: [5, 15], 2: [10, 20], 3: [15, 25], 4: [20, 30] }

  // T1 Magic theme (used by tome_tower, TotW tower, TotW ocean tower).
  var T1_MAGIC = [
    'ars_nouveau:source_gem',                'ars_nouveau:novice_spell_book',
    'irons_spellbooks:common_ink',
    'artifacts:flame_pendant',               'artifacts:shock_pendant',
    'artifacts:thorn_pendant',               'artifacts:scarf_of_invisibility',
    'moreartifacts:purification_charm',      'moreartifacts:bezoar',
    'celestial_artifacts:traveler_scroll',   'celestial_artifacts:sakura_hairpin',
    'relics:magic_mirror',                   'relics:reflection_necklace'
  ]
  // T1 Generic exploration (Structory towers).
  var T1_GENERIC_EXPLORATION = [
    'artifacts:bunny_hoppers',               'artifacts:running_shoes',
    'artifacts:helium_flamingo',             'artifacts:universal_attractor',
    'artifacts:digging_claws',               'artifacts:rooted_boots',
    'artifacts:steadfast_spikes',
    'moreartifacts:fast_clock',              'moreartifacts:high_jumpers',
    'moreartifacts:leather_treads',
    'celestial_artifacts:gallop_necklace',
    'relics:roller_skates',                  'relics:leather_belt',
    'relics:horse_flute',                    'relics:amphibian_boot'
  ]
  // T1 Aquatic (buried_treasure + underwater_ruin tables).
  var T1_AQUATIC = [
    'artifacts:snorkel',                     'artifacts:flippers',
    'artifacts:aqua_dashers',                'artifacts:rooted_boots',
    'relics:aqua_walker',                    'relics:amphibian_boot',
    'relics:drowned_belt',                   'relics:jellyfish_necklace',
    'relics:spore_sack',
    'celestial_artifacts:treasure_hunter_necklace',
    'moreartifacts:ankh_charm'
  ]
  // T1 Illager/dark (woodland_mansion).
  var T1_ILLAGER_DARK = [
    'artifacts:scarf_of_invisibility',       'artifacts:lucky_scarf',
    'artifacts:superstitious_hat',           'artifacts:cross_necklace',
    'artifacts:antidote_vessel',             'artifacts:panic_necklace',
    'artifacts:thorn_pendant',
    'moreartifacts:ankh_charm',              'moreartifacts:tainted_mirror',
    'moreartifacts:purification_charm',      'moreartifacts:spectre_amulet',
    'relics:midnight_robe',
    'celestial_artifacts:undead_charm'
  ]
  // T1 Ancient/eldritch (stronghold tables).
  var T1_ANCIENT = [
    'artifacts:night_vision_goggles',        'artifacts:universal_attractor',
    'moreartifacts:fast_clock',              'moreartifacts:tainted_mirror',
    'celestial_artifacts:repent_mirror',     'celestial_artifacts:backtrack_mirror',
    'celestial_artifacts:heirloom_necklace', 'celestial_artifacts:nostalgic_butterfly_ring',
    'celestial_artifacts:traveler_scroll',
    'ars_nouveau:novice_spell_book',         'ars_nouveau:source_gem',
    'irons_spellbooks:common_ink',
    'relics:magic_mirror',                   'relics:reflection_necklace'
  ]
  // T2 Eldritch (Twilight Lich Tower) — TBD exact table IDs.
  var T2_ELDRITCH = [
    'celestial_artifacts:cursed_talisman',   'celestial_artifacts:cursed_protector',
    'celestial_artifacts:hidden_bracelet',   'celestial_artifacts:shadow_pendant',
    'moreartifacts:spectre_amulet',          'moreartifacts:venom_amulet',
    'moreartifacts:decay_amulet',            'moreartifacts:tainted_mirror',
    'relics:midnight_robe',
    'artifacts:obsidian_skull',              'artifacts:antidote_vessel',
    'artifacts:vampiric_glove',
    'ars_nouveau:apprentice_spell_book',     'irons_spellbooks:uncommon_ink'
  ]
  // T2 Sky/cloud (Aether dungeons).
  var T2_SKY = [
    'artifacts:cloud_in_a_bottle',           'artifacts:helium_flamingo',
    'artifacts:lucky_scarf',
    'moreartifacts:high_jumpers',            'moreartifacts:balloon',
    'celestial_artifacts:nostalgic_butterfly_ring',
    'celestial_artifacts:skywalker_scroll',
    'celestial_artifacts:gallop_necklace',   'celestial_artifacts:magic_horseshoe',
    'celestial_artifacts:deers_mercy_amulet',
    'celestial_artifacts:deer_inscribed_amulet',
    'ars_nouveau:apprentice_spell_book'
  ]
  // T2 Elemental (Blue Skies dungeons).
  var T2_ELEMENTAL = [
    'celestial_artifacts:freeze_ring',       'celestial_artifacts:thunder_ring',
    'celestial_artifacts:emerald_ring',
    'moreartifacts:ice_crystal',             'moreartifacts:sunglasses',
    'moreartifacts:cobalt_shield',
    'artifacts:flame_pendant',               'artifacts:shock_pendant',
    'artifacts:thorn_pendant',               'artifacts:obsidian_skull',
    'celestial_artifacts:sands_talisman',
    'ars_nouveau:apprentice_spell_book'
  ]
  // T3 Fire/blaze (nether_bridge).
  var T3_FIRE = [
    'relics:blazing_flask',                  'relics:magma_walker',
    'moreartifacts:fire_stone',              'moreartifacts:blazing_treads',
    'moreartifacts:molten_quiver',           'moreartifacts:obsidian_shield',
    'artifacts:obsidian_skull',              'artifacts:fire_gauntlet',
    'celestial_artifacts:nether_fire',
    'moreartifacts:gilded_scarf',
    'ars_nouveau:archmage_spell_book',       'irons_spellbooks:rare_ink'
  ]
  // T3 Piglin/gold (bastion tables).
  var T3_PIGLIN = [
    'moreartifacts:gilded_scarf',            'moreartifacts:golden_headgear',
    'moreartifacts:mechanical_glove',
    'celestial_artifacts:gold_ring',         'celestial_artifacts:precious_bracelet',
    'celestial_artifacts:treasure_hunter_necklace',
    'celestial_artifacts:emerald_bracelet',
    'artifacts:golden_hook',
    'moreartifacts:ruby_ring',               'moreartifacts:lucky_emerald_ring',
    'ars_nouveau:archmage_spell_book',       'irons_spellbooks:rare_ink'
  ]
  // T3 Underdark (Undergarden ruin tables) — TBD exact table IDs.
  var T3_UNDERDARK = [
    'moreartifacts:enderian_scarf',          'moreartifacts:shadow_dust',
    'moreartifacts:obsidian_shield',
    'relics:bastion_ring',                   'relics:spore_sack',
    'celestial_artifacts:cursed_protector',
    'celestial_artifacts:demon_curse',       'celestial_artifacts:abyss_will_badge',
    'celestial_artifacts:lock_of_abyss',
    'artifacts:antidote_vessel',             'artifacts:obsidian_skull',
    'ars_nouveau:archmage_spell_book',       'irons_spellbooks:rare_ink'
  ]
  // T4 End/levitation (end_city_treasure).
  // ender_jump_scepter flagged from celestial_artifacts.md audit — verify rate
  // in playtest, may pull to boss-drop if too generous.
  var T4_END = [
    'celestial_artifacts:ender_jump_scepter',
    'celestial_artifacts:angel_pearl',       'celestial_artifacts:angel_heart',
    'moreartifacts:enderian_eye',            'moreartifacts:ender_dragon_claw',
    'moreartifacts:dragon_eye',              'moreartifacts:enderian_treads',
    'moreartifacts:true_enderian_scarf',
    'relics:enders_hand',                    'relics:elytra_booster',
    'relics:space_dissector',                'relics:arrow_quiver',
    'relics:chorus_inhibitor'
  ]
  // T4 Sculk/echo (Ancient City tables).
  var T4_SCULK = [
    'moreartifacts:sculk_lens',              'moreartifacts:sculk_shades',
    'moreartifacts:sculk_treads',            'moreartifacts:shulker_heart',
    'moreartifacts:shulked_clock',           'moreartifacts:echo_glove',
    'celestial_artifacts:soul_box',          'celestial_artifacts:lock_of_abyss',
    'celestial_artifacts:cursed_totem',      'celestial_artifacts:twisted_heart',
    'relics:wool_mitten',                    'relics:shadow_glaive',
    'artifacts:scarf_of_invisibility'
  ]
  // T4 Abyssal (The Abyss marquees) — TBD exact table IDs.
  var T4_ABYSSAL = [
    'celestial_artifacts:abyss_core',        'celestial_artifacts:abyss_will_badge',
    'celestial_artifacts:lock_of_abyss',     'celestial_artifacts:demon_heart',
    'celestial_artifacts:demon_curse',       'celestial_artifacts:twisted_heart',
    'celestial_artifacts:twisted_scroll',    'celestial_artifacts:twisted_scabbard',
    'celestial_artifacts:catastrophe_scroll','celestial_artifacts:heart_of_revenge',
    'celestial_artifacts:chaotic_etching',   'celestial_artifacts:nihility_etching',
    'relics:shadow_glaive',                  'relics:space_dissector'
  ]

  // Helper: apply marquee themed pool to a table or array of tables.
  // opts.theme       — array of item IDs (themed pool)
  // opts.tier        — 1-4 (drives rate)
  // opts.scroll      — true to add tier-scaled ISS scroll (mage progression)
  // opts.spellbook   — ISS spellbook ID to add at 2% cap, or null
  // opts.book        — true to add enchanted book at tier rate (10% default)
  // opts.strip       — array of item IDs to remove first
  function applyMarquee(tableRefs, opts) {
    var tables = (tableRefs instanceof Array) ? tableRefs : [tableRefs]
    var perItem = TIER_THEMED_RATE[opts.tier] / opts.theme.length
    var scrollHelper = (opts.tier <= 2) ? t1Scroll : t2Scroll
    var bookLevels = TIER_BOOK_LEVELS[opts.tier]
    tables.forEach(function(table) {
      var mod = event.addLootTableModifier(table)
      if (opts.strip) {
        opts.strip.forEach(function(item) { mod.removeLoot(item) })
      }
      opts.theme.forEach(function(item) {
        mod.addLoot(LootEntry.of(item).when(c => c.randomChance(perItem)))
      })
      if (opts.scroll) {
        mod.addLoot(scrollHelper(TIER_SCROLL_RATE[opts.tier]))
      }
      if (opts.spellbook) {
        mod.addLoot(LootEntry.of(opts.spellbook).when(c => c.randomChance(ISS_SPELLBOOK_CAP)))
      }
      if (opts.book) {
        mod.addLoot(
          LootEntry.of('minecraft:book')
            .enchantWithLevels(UniformGenerator.between(bookLevels[0], bookLevels[1]), true)
            .when(c => c.randomChance(0.10))
        )
      }
    })
  }

  var BOTANIA_T1_STRIP = ['minecraft:diamond', 'botania:manasteel_ingot',
    'botania:mana_pearl', 'botania:mana_diamond',
    'minecraft:arrow', 'minecraft:spectral_arrow']

  // === T1 marquees ===
  applyMarquee('apotheosis:chests/tome_tower',
    { theme: T1_MAGIC, tier: 1, scroll: true, spellbook: 'irons_spellbooks:copper_spell_book', book: true })
  applyMarquee(['totw_reworked:tower_chest', 'totw_reworked:ocean_tower_chest'],
    { theme: T1_MAGIC, tier: 1, scroll: true, spellbook: 'irons_spellbooks:copper_spell_book',
      book: true, strip: BOTANIA_T1_STRIP })
  applyMarquee(/structory_towers:.*chests.*/,
    { theme: T1_GENERIC_EXPLORATION, tier: 1, book: true })
  applyMarquee(['minecraft:chests/buried_treasure',
                'minecraft:chests/underwater_ruin_big',
                'minecraft:chests/underwater_ruin_small'],
    { theme: T1_AQUATIC, tier: 1, spellbook: 'irons_spellbooks:copper_spell_book' })
  applyMarquee('minecraft:chests/woodland_mansion',
    { theme: T1_ILLAGER_DARK, tier: 1, spellbook: 'irons_spellbooks:copper_spell_book', book: true })
  applyMarquee(['minecraft:chests/stronghold_corridor',
                'minecraft:chests/stronghold_crossing',
                'minecraft:chests/stronghold_library'],
    { theme: T1_ANCIENT, tier: 1, scroll: true, spellbook: 'irons_spellbooks:copper_spell_book',
      book: true, strip: BOTANIA_T1_STRIP })

  // === T2 marquees ===
  // Twilight Lich Tower (TBD exact table IDs — likely twilightforest:structures/lichtower/*).
  // Initial coverage is broad-pattern; verify in playtest.
  applyMarquee(/twilightforest:structures\/lichtower\/.*/,
    { theme: T2_ELDRITCH, tier: 2, book: true })
  // Aether dungeons (TBD exact table IDs — common pattern aether:chests/*).
  applyMarquee(/aether:chests\/.*dungeon.*/,
    { theme: T2_SKY, tier: 2, book: true })
  // Blue Skies dungeons (TBD exact table IDs — broad pattern).
  applyMarquee(/blue_skies:chests\/.*dungeon.*/,
    { theme: T2_ELEMENTAL, tier: 2, book: true })

  // === T3 marquees ===
  applyMarquee('minecraft:chests/nether_bridge',
    { theme: T3_FIRE, tier: 3, book: true })
  applyMarquee(['minecraft:chests/bastion_treasure',
                'minecraft:chests/bastion_hoglin_stable',
                'minecraft:chests/bastion_bridge',
                'minecraft:chests/bastion_other'],
    { theme: T3_PIGLIN, tier: 3, book: true })
  // Undergarden ruins (TBD exact table IDs).
  applyMarquee(/undergarden:chests\/.*ruin.*/,
    { theme: T3_UNDERDARK, tier: 3, book: true })

  // === T4 marquees ===
  applyMarquee('minecraft:chests/end_city_treasure',
    { theme: T4_END, tier: 4, book: true })
  applyMarquee(['minecraft:chests/ancient_city',
                'minecraft:chests/ancient_city_ice_box'],
    { theme: T4_SCULK, tier: 4, book: true })
  // The Abyss marquees (TBD exact table IDs).
  applyMarquee(/theabyss:chests\/.*/,
    { theme: T4_ABYSSAL, tier: 4, book: true })

  // =========================================================================
  // SECTION 8A: VILLAGE CHEST AFFIX GEAR — WHITE/GREEN ONLY
  // =========================================================================
  // Village chests should have low-tier affix gear (white/green rarity).
  // Blue is very rare (2%), no purple/orange. These are starting areas.
  // =========================================================================

  // Village chests: low chance for basic (white/green) gear
  const villageChestPatterns = [
    /minecraft:chests\/village\/.*/,
    /^villagesandpillages:.+/,
    /ctov:.*chests.*/
  ]

  // 2026-04-21: DELETED a dead modifier block that had been registering
  // event.addLootTableModifier(pattern) with NO action chained (the
  // Apotheosis-affix filter was commented out but the modifier
  // registration remained). LootJS throws 'No actions were added to the
  // modifier' on such calls and aborts the ENTIRE remaining modifier
  // callback — killing every village QoL pool, artifact pool, magic
  // access block, and so on. Hence zero beds / artifacts in tester's
  // 30x /loot give. The block is now fully removed.

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
  keebszLow.addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.15)))
  keebszLow.addLoot(LootEntry.of('ars_nouveau:novice_spell_book').when(c => c.randomChance(0.025)))
  keebszLow.addLoot(LootEntry.of('ars_nouveau:source_gem').limitCount([1, 2]).when(c => c.randomChance(0.05)))
  keebszLow.addLoot(t1Scroll(0.06))
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
  // 5% scroll (T2 quality)
  keebszMid.addLoot(t2Scroll(0.05))
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
    LootEntry.of('minecraft:book')
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
  // 18% rare inks (bumped from 12% as part of magic-loot pass)
  keebszHigh.addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.18)))
  // 10% enchanted book (levels 20-30)
  keebszHigh.addLoot(
    LootEntry.of('minecraft:book')
      .enchantWithLevels(UniformGenerator.between(20, 30), true)
      .when(c => c.randomChance(0.10))
  )
  // 8% T2/T3 artifact from pool
  var keebszHighArtifactPool = artifactT2Pool.concat(artifactT3Pool)
  var keebszHighArtifactChance = 0.08 / keebszHighArtifactPool.length
  keebszHighArtifactPool.forEach(function(item) {
    keebszHigh.addLoot(LootEntry.of(item).when(c => c.randomChance(keebszHighArtifactChance)))
  })
  // Removed 2026-05-17 towerCurioPool.forEach add — Keebsz isn't in the
  // marquee roster, and the T2/T3 artifact concat above already provides
  // tier-appropriate curio variety. The towerCurioPool was a 9-item
  // duplicate firing alongside the wider dimensional pools.

  // =========================================================================
  // SECTION 9: ENABLE LOGGING (remove in production)
  // =========================================================================

  // -------------------------------------------------------------------------
  // SIMPLY SWORDS UNIQUE STRIP — chest tables only
  // -------------------------------------------------------------------------
  // Wiki §IX: "Simply Swords is the unique trophy-weapon system. 42 named
  // uniques, all boss-drop only. Unique-weapon recipes are stripped."
  // SS ships a global loot modifier that injects uniques into vanilla/modded
  // chest pools. We strip the @simplyswords namespace from any loot table
  // whose path contains "chests/" so uniques only come from the per-boss
  // entries in loot_overhaul.js (Naga -> Tempest, Lich -> Soulrender, etc.).
  // Entity loot tables (entities/<mob>) are unaffected — boss allocations
  // keep working.
  event
    .addLootTableModifier(/chests\//)
    .removeLoot('@simplyswords')

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
