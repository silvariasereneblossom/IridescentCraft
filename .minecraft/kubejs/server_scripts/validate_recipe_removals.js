// =============================================================================
// VALIDATE RECIPE REMOVAL IDS — Audit Phase 3.3 cross-cutting fix
// =============================================================================
// On server start, log a warning for any item ID referenced via
// `event.remove({ output: 'modid:itemid' })` that no longer exists in the
// item registry.
//
// Why: cross-cutting finding A from the per-mod audit pass — recipe-removal
// lists drift over mod updates. simplyswords had 4 stale IDs (silent no-ops)
// at the time of audit; theabyss had a singular/plural rename. This script
// is the closing-the-loop part of fix-plan Phase 3 — surfaces the same
// drift automatically next time it occurs, instead of waiting for an audit.
//
// Output goes to console + kubejs-server.log. Tester reviews; failures are
// not fatal (the gating may still hold via regex or other paths) but each
// stale entry is dead code that should be cleaned up.
//
// WHERE IT RUNS: only where the game is started from the repo's main tree.
// Neither distribution ships this file (dev/sync-distros.config.json excludes
// it), so the live server and the client instance never run it.
//
// THE LIST IS GENERATED (since 2026-10-12), never pasted:
//   node --expose-internals .minecraft/dev/gen_recipe_removal_targets.js
// rewrites the block between the BEGIN / END markers below from every
// `event.remove({ output: ... })` in server_scripts, and `--check` exits 1 when
// the block is out of date. A script cannot read other script files here (the
// KubeJS class filter blocks java.io), which is why the ids are written in.
// The hand-pasted list this replaced held 114 ids while the scripts removed
// 442, and named a recipe file (tier_skip.js) that does not exist.
// =============================================================================

ServerEvents.recipes(icraft.guard('validate_recipe_removals', 'ServerEvents.recipes', event => {
    // We use ServerEvents.recipes because it's the same event-context that
    // the removal calls run in, so we can check the same registry view.
    // Actual scanning runs once via a flag in global state.
    if (global.icraftRecipeRemovalsValidated) return
    global.icraftRecipeRemovalsValidated = true

    // BEGIN GENERATED (dev/gen_recipe_removal_targets.js) -- do not edit by hand
    // 442 item ids from 10 script files, plus 1 list(s) read from `global` at run time.
    // Regenerate, never paste:  node --expose-internals .minecraft/dev/gen_recipe_removal_targets.js
    const REMOVAL_GLOBALS = ['ICRAFT_TMB_BOWS']   // recipes/strip_tmb_bow_recipes.js
    const REMOVAL_TARGETS = [
        // food_dedup_recipes.js
        'blue_skies:maple_sapling', 'culturaldelights:avocado', 'culturaldelights:avocado_sapling',
        'culturaldelights:cucumber', 'culturaldelights:cucumber_seeds', 'culturaldelights:cucumbers',
        'culturaldelights:eggplant', 'culturaldelights:eggplant_seeds', 'culturaldelights:eggplants',
        'culturaldelights:ginger', 'culturaldelights:smoked_corn', 'culturaldelights:smoked_eggplant',
        'culturaldelights:smoked_tomato', 'culturaldelights:tortilla', 'delightful:acorn',
        'delightful:cantaloupe', 'delightful:cantaloupe_seeds', 'pamhc2foodextended:bakedbeansitem',
        'pamhc2foodextended:carrotjuiceitem', 'pamhc2foodextended:chocolatemilkitem', 'pamhc2foodextended:chocolatemilkshakeitem',
        'pamhc2foodextended:crackersandcheeseitem', 'pamhc2foodextended:friedonionsitem', 'pamhc2foodextended:friedriceitem',
        'pamhc2foodextended:powdereddonutitem', 'thermal:amaranth', 'thermal:barley',
        'thermal:carrot_cake', 'thermal:chocolate_cake', 'thermal:cooked_corn',
        'thermal:cooked_eggplant', 'thermal:corn', 'thermal:dough',
        'thermal:eggplant', 'thermal:flax', 'thermal:flour',
        'thermal:onion', 'thermal:peanut', 'thermal:peanut_butter',
        'thermal:radish', 'thermal:rice', 'thermal:spinach',
        'thermal:spring_salad', 'thermal:strawberry', 'thermal:stuffed_pepper',
        'thermal:tomato', 'vanillacookbook:apple_juice', 'vanillacookbook:apple_pie',
        'vanillacookbook:bacon_pancake', 'vanillacookbook:baked_apple', 'vanillacookbook:brownie',
        'vanillacookbook:carrot_cake', 'vanillacookbook:cheese', 'vanillacookbook:chicken_soup',
        'vanillacookbook:chocolate_cake', 'vanillacookbook:chocolate_ice_cream', 'vanillacookbook:chocolate_milk',
        'vanillacookbook:chorus_juice', 'vanillacookbook:cooked_egg', 'vanillacookbook:fish_and_chips',
        'vanillacookbook:fish_stew', 'vanillacookbook:french_toast', 'vanillacookbook:fruit_salad',
        'vanillacookbook:garden_soup', 'vanillacookbook:honey_cookie', 'vanillacookbook:ice_cream',
        'vanillacookbook:mashed_potatoes', 'vanillacookbook:meatloaf', 'vanillacookbook:melon_juice',
        'vanillacookbook:milk_bottle', 'vanillacookbook:pancake', 'vanillacookbook:potato_chips',
        'vanillacookbook:pumpkin_soup', 'vanillacookbook:trail_mix',
        // recipes/ad_astra_gating.js
        'ad_astra:jet_suit', 'ad_astra:jet_suit_boots', 'ad_astra:jet_suit_helmet',
        'ad_astra:jet_suit_pants', 'ad_astra:nasa_workbench', 'ad_astra:tier_1_rocket',
        'ad_astra:tier_2_rocket', 'ad_astra:tier_3_rocket', 'ad_astra:tier_4_rocket',
        // recipes/cooking_for_blockheads_overrides.js
        'cookingforblockheads:crafting_book',
        // recipes/magic_recipes.js
        'irons_spellbooks:scroll_forge',
        // recipes/mek_biofuel_squeeze.js
        'mekanism:bio_fuel',
        // recipes/recipe_audit.js
        'blue_skies:charoite_axe', 'blue_skies:charoite_boots', 'blue_skies:charoite_chestplate',
        'blue_skies:charoite_helmet', 'blue_skies:charoite_hoe', 'blue_skies:charoite_leggings',
        'blue_skies:charoite_pickaxe', 'blue_skies:charoite_shovel', 'blue_skies:charoite_sword',
        'blue_skies:diopside_axe', 'blue_skies:diopside_boots', 'blue_skies:diopside_chestplate',
        'blue_skies:diopside_helmet', 'blue_skies:diopside_hoe', 'blue_skies:diopside_leggings',
        'blue_skies:diopside_pickaxe', 'blue_skies:diopside_shovel', 'blue_skies:diopside_sword',
        'blue_skies:horizonite_axe', 'blue_skies:horizonite_boots', 'blue_skies:horizonite_chestplate',
        'blue_skies:horizonite_helmet', 'blue_skies:horizonite_hoe', 'blue_skies:horizonite_leggings',
        'blue_skies:horizonite_pickaxe', 'blue_skies:horizonite_shovel', 'blue_skies:horizonite_sword',
        'blue_skies:runic_arc', 'blue_skies:shadow_boots', 'blue_skies:shadow_chestplate',
        'blue_skies:shadow_helmet', 'blue_skies:shadow_leggings', 'cataclysm:mechanical_fusion_anvil',
        'mekanism:ingot_osmium', 'minecraft:chorus_flower', 'minecraft:chorus_fruit',
        'minecraft:deepslate_diamond_ore', 'minecraft:deepslate_emerald_ore', 'minecraft:diamond',
        'minecraft:diamond_ore', 'minecraft:emerald', 'minecraft:emerald_block',
        'minecraft:emerald_ore', 'minecraft:ender_pearl', 'minecraft:nether_star',
        'minecraft:netherite_ingot', 'minecraft:netherite_scrap', 'origins:orb_of_origin',
        'terramity:advanced_automatic_rifle', 'terramity:advanced_burst_rifle', 'terramity:advanced_gun_parts',
        'terramity:advanced_pistol', 'terramity:ammo_bag', 'terramity:ammo_box',
        'terramity:angel_feather', 'terramity:anti_material_rifle', 'terramity:antimatter_pacemaker',
        'terramity:antimatter_rifle', 'terramity:antimatter_round', 'terramity:antiprism',
        'terramity:asphodel', 'terramity:basic_pistol', 'terramity:basic_rifle',
        'terramity:big_iron', 'terramity:blasphemic_rapture', 'terramity:bottomless_ammo_box',
        'terramity:chiseled_nyxium_panelling', 'terramity:conductite_armor_boots', 'terramity:conductite_armor_chestplate',
        'terramity:conductite_armor_leggings', 'terramity:conductite_laser_rifle', 'terramity:conductite_scouter_helmet',
        'terramity:conjuror_boots', 'terramity:conjuror_chestplate', 'terramity:conjuror_helmet',
        'terramity:conjuror_leggings', 'terramity:copper_round', 'terramity:cosmilite_armor_boots',
        'terramity:cosmilite_armor_chestplate', 'terramity:cosmilite_armor_helmet', 'terramity:cosmilite_armor_leggings',
        'terramity:davy_jones', 'terramity:dimensional_poof', 'terramity:dimlite_boots',
        'terramity:dimlite_chestplate', 'terramity:dimlite_helmet', 'terramity:dimlite_leggings',
        'terramity:dimlite_round', 'terramity:divine_intervention', 'terramity:dragon_band',
        'terramity:electron_bracelets', 'terramity:elite_rifle', 'terramity:evil_king_armor_boots',
        'terramity:evil_king_armor_chestplate', 'terramity:evil_king_armor_helmet', 'terramity:evil_king_armor_leggings',
        'terramity:exodium_block', 'terramity:exodium_hoe', 'terramity:exodium_pickaxe',
        'terramity:exodium_shield_amulet', 'terramity:exodium_shovel', 'terramity:exodium_superalloy',
        'terramity:exodium_sword', 'terramity:exodium_twin_bracelets', 'terramity:exodium_waraxe',
        'terramity:exodium_warlock_boots', 'terramity:exodium_warlock_chestplate', 'terramity:exodium_warlock_helmet',
        'terramity:exodium_warlock_leggings', 'terramity:flare_gun', 'terramity:flintlock_pistol',
        'terramity:fortunes_favor', 'terramity:gaias_tempest', 'terramity:galebounce_tome',
        'terramity:gold_round', 'terramity:guardian_grimoire', 'terramity:gundalfs_hat_helmet',
        'terramity:gunkshot_projectile', 'terramity:gunsmith_station', 'terramity:handcannon',
        'terramity:hellspec_boots', 'terramity:hellspec_chestplate', 'terramity:hellspec_helmet',
        'terramity:hellspec_leggings', 'terramity:iridium_armor_boots', 'terramity:iridium_armor_chestplate',
        'terramity:iridium_armor_helmet', 'terramity:iridium_armor_leggings', 'terramity:iridium_round',
        'terramity:kamehameha', 'terramity:malediction_bracelets', 'terramity:meteor_cannon',
        'terramity:moondrill_cannon', 'terramity:null_scarf', 'terramity:nyxium',
        'terramity:nyxium_axe', 'terramity:nyxium_block', 'terramity:nyxium_brick_slab',
        'terramity:nyxium_brick_stairs', 'terramity:nyxium_brick_wall', 'terramity:nyxium_bricks',
        'terramity:nyxium_glass', 'terramity:nyxium_greatsword', 'terramity:nyxium_hoe',
        'terramity:nyxium_knight_boots', 'terramity:nyxium_knight_chestplate', 'terramity:nyxium_knight_helmet',
        'terramity:nyxium_knight_leggings', 'terramity:nyxium_panelling', 'terramity:nyxium_panelling_slab',
        'terramity:nyxium_panelling_stairs', 'terramity:nyxium_panelling_wall', 'terramity:nyxium_pickaxe',
        'terramity:nyxium_plating', 'terramity:nyxium_plating_slab', 'terramity:nyxium_plating_stairs',
        'terramity:nyxium_shovel', 'terramity:nyxium_tile_slab', 'terramity:nyxium_tile_stairs',
        'terramity:nyxium_tiles', 'terramity:nyxs_necklace', 'terramity:olympus',
        'terramity:onyx_armor_boots', 'terramity:onyx_armor_chestplate', 'terramity:onyx_armor_helmet',
        'terramity:onyx_armor_leggings', 'terramity:plague_pistol', 'terramity:planet_buster',
        'terramity:pump_action_shotgun', 'terramity:railgun', 'terramity:reverium',
        'terramity:reverium_axe', 'terramity:reverium_block', 'terramity:reverium_hoe',
        'terramity:reverium_paladin_boots', 'terramity:reverium_paladin_chestplate', 'terramity:reverium_paladin_helmet',
        'terramity:reverium_paladin_leggings', 'terramity:reverium_pickaxe', 'terramity:reverium_shovel',
        'terramity:reverium_sword', 'terramity:rocket_launcher', 'terramity:ruby_armor_boots',
        'terramity:ruby_armor_chestplate', 'terramity:ruby_armor_helmet', 'terramity:ruby_armor_leggings',
        'terramity:sacred_speed_bracelets', 'terramity:sapphire_armor_boots', 'terramity:sapphire_armor_chestplate',
        'terramity:sapphire_armor_helmet', 'terramity:sapphire_armor_leggings', 'terramity:sawed_off_shotgun',
        'terramity:shadowflame_bullet', 'terramity:suppressed_advanced_pistol', 'terramity:suppressed_gold_round',
        'terramity:tome_of_ascension', 'terramity:tome_of_commotion', 'terramity:topaz_armor_boots',
        'terramity:topaz_armor_chestplate', 'terramity:topaz_armor_helmet', 'terramity:topaz_armor_leggings',
        'terramity:unholy_lance', 'terramity:velocity_flip', 'terramity:virentium_armor_boots',
        'terramity:virentium_armor_chestplate', 'terramity:virentium_armor_helmet', 'terramity:virentium_armor_leggings',
        'terramity:void_mage_boots', 'terramity:void_mage_chestplate', 'terramity:void_mage_helmet',
        'terramity:void_mage_leggings', 'theabyss:arcane_workbench', 'theabyss:unorithe_armor_boots',
        'theabyss:unorithe_armor_chestplate', 'theabyss:unorithe_armor_helmet', 'theabyss:unorithe_armor_leggings',
        // recipes/refined_storage_dualpath.js
        'extrastorage:storagepart_1024k', 'extrastorage:storagepart_256k', 'extrastorage:storagepart_4096k',
        'refinedstorage:16k_storage_part', 'refinedstorage:1k_storage_part', 'refinedstorage:4k_storage_part',
        'refinedstorage:64k_storage_part', 'refinedstorage:advanced_processor', 'refinedstorage:basic_processor',
        'refinedstorage:cable', 'refinedstorage:controller', 'refinedstorage:crafter',
        'refinedstorage:crafting_grid', 'refinedstorage:disk_drive', 'refinedstorage:grid',
        'refinedstorage:improved_processor', 'refinedstorage:machine_casing', 'refinedstorage:quartz_enriched_iron',
        'rsinfinitybooster:infinity_card',
        // recipes/staff_wand_recipes.js
        'dna:ice_staff', 'dna:lightning_staff', 'dna:magma_staff',
        'dna:tnt_staff', 'dna:toxic_staff', 'simple_staves:explosion_wand',
        'simple_staves:flame_wand', 'simple_staves:tenebrium_wand', 'simple_staves:thunder_wand',
        'simple_staves:veil_wand', 'simple_staves:venomite_wand', 'simple_staves:viritium_wand',
        'simple_staves:void_wand', 'simple_staves:wind_essence_wand',
        // recipes/tier_gated_recipes.js
        'aether:nature_staff', 'deeperdarker:sonorous_staff', 'forbidden_arcanus:draco_arcanus_scepter',
        'forbidden_arcanus:draco_arcanus_staff', 'irons_spellbooks:graybeard_staff', 'irons_spellbooks:pyrium_staff',
        'minecraft:ancient_debris', 'minecraft:diamond_block', 'minecraft:elytra',
        'simplyswords:arcanethyst', 'simplyswords:awakened_lichblade', 'simplyswords:bramblethorn',
        'simplyswords:brimstone_claymore', 'simplyswords:caelestis', 'simplyswords:dormant_relic',
        'simplyswords:emberblade', 'simplyswords:emberlash', 'simplyswords:enigma',
        'simplyswords:flamewind', 'simplyswords:frostfall', 'simplyswords:harbinger',
        'simplyswords:hearthflame', 'simplyswords:hiveheart', 'simplyswords:icewhisper',
        'simplyswords:livyatan', 'simplyswords:magiblade', 'simplyswords:magiscythe',
        'simplyswords:magispear', 'simplyswords:mjolnir', 'simplyswords:molten_edge',
        'simplyswords:netherfused_gem', 'simplyswords:ribboncleaver', 'simplyswords:runefused_gem',
        'simplyswords:runic_chakram', 'simplyswords:runic_claymore', 'simplyswords:runic_cutlass',
        'simplyswords:runic_glaive', 'simplyswords:runic_greataxe', 'simplyswords:runic_greathammer',
        'simplyswords:runic_halberd', 'simplyswords:runic_katana', 'simplyswords:runic_longsword',
        'simplyswords:runic_rapier', 'simplyswords:runic_sai', 'simplyswords:runic_scythe',
        'simplyswords:runic_spear', 'simplyswords:runic_twinblade', 'simplyswords:runic_warglaive',
        'simplyswords:shadowsting', 'simplyswords:slumbering_lichblade', 'simplyswords:soulkeeper',
        'simplyswords:soulpyre', 'simplyswords:soulrender', 'simplyswords:soulstealer',
        'simplyswords:stars_edge', 'simplyswords:stormbringer', 'simplyswords:storms_edge',
        'simplyswords:sunfire', 'simplyswords:sword_on_a_stick', 'simplyswords:tempest',
        'simplyswords:thunderbrand', 'simplyswords:toxic_longsword', 'simplyswords:twisted_blade',
        'simplyswords:waking_lichblade', 'simplyswords:watcher_claymore', 'simplyswords:watching_warglaive',
        'simplyswords:waxweaver', 'simplyswords:whisperwind', 'simplyswords:wickpiercer',
        'terramity:lightning_staff', 'toe:table_of_expieriance', 'twilightforest:fortification_scepter',
        'twilightforest:lifedrain_scepter', 'twilightforest:twilight_scepter', 'twilightforest:zombie_scepter',
        // recipes/waystone_recipes.js
        'kubejs:waystone_core', 'waystones:attuned_shard', 'waystones:black_sharestone',
        'waystones:blackstone_waystone', 'waystones:blue_sharestone', 'waystones:bound_scroll',
        'waystones:brown_sharestone', 'waystones:cyan_sharestone', 'waystones:deepslate_waystone',
        'waystones:end_stone_waystone', 'waystones:gray_sharestone', 'waystones:green_sharestone',
        'waystones:light_blue_sharestone', 'waystones:light_gray_sharestone', 'waystones:lime_sharestone',
        'waystones:magenta_sharestone', 'waystones:mossy_waystone', 'waystones:orange_sharestone',
        'waystones:pink_sharestone', 'waystones:portstone', 'waystones:purple_sharestone',
        'waystones:red_sharestone', 'waystones:return_scroll', 'waystones:sandy_waystone',
        'waystones:sharestone', 'waystones:warp_dust', 'waystones:warp_plate',
        'waystones:warp_scroll', 'waystones:warp_stone', 'waystones:waystone',
        'waystones:white_sharestone', 'waystones:yellow_sharestone',
    ]
    // END GENERATED

    // Lists a removal script takes from `global` at run time (the boss-bow
    // roster): read here the same way, so they are validated too.
    var targets = REMOVAL_TARGETS.slice()
    REMOVAL_GLOBALS.forEach(name => {
        var list = global[name]
        if (!list || typeof list.forEach !== 'function') {
            console.warn('[icraft-validate] global.' + name + ' is not a list at recipe time: its removals are NOT validated')
            return
        }
        list.forEach(id => targets.push(String(id)))
    })

    // Item.exists() is the KubeJS 6 idiomatic check — returns true iff the
    // id resolves to a registered Item that is NOT minecraft:air.
    var stale = []
    targets.forEach(id => {
        try {
            if (!Item.exists(id)) stale.push(id)
        } catch (e) {
            stale.push(id + ' (lookup error: ' + e + ')')
        }
    })

    if (stale.length > 0) {
        console.warn('[icraft-validate] STALE recipe-removal IDs detected (' + stale.length + '):')
        stale.forEach(id => console.warn('  - ' + id))
        console.warn('[icraft-validate] These IDs no longer exist in the item registry.')
        console.warn('[icraft-validate] event.remove({output:...}) calls against them are silent no-ops.')
        console.warn('[icraft-validate] Fix the removal in its script, then regenerate this list:')
        console.warn('[icraft-validate]   node --expose-internals .minecraft/dev/gen_recipe_removal_targets.js')
    } else {
        console.log('[icraft-validate] All ' + targets.length + ' recipe-removal IDs validated against item registry.')
    }
}))
