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
// =============================================================================

const RECIPE_FILES = [
    'kubejs/server_scripts/recipes/tier_gated_recipes.js',
    'kubejs/server_scripts/recipes/recipe_audit.js',
    'kubejs/server_scripts/recipes/tier_skip.js',
    'kubejs/server_scripts/recipes/cooking_conversion.js',
    'kubejs/server_scripts/recipes/if_latex_rework.js',
    'kubejs/server_scripts/recipes/refined_storage_dualpath.js',
    'kubejs/server_scripts/recipes/planetary_extraction.js',
    'kubejs/server_scripts/recipes/ad_astra_gating.js',
    'kubejs/server_scripts/compat/class_artifacts_recipes.js'
]

ServerEvents.recipes(event => {
    // We use ServerEvents.recipes because it's the same event-context that
    // the removal calls run in, so we can check the same registry view.
    // Actual scanning runs once via a flag in global state.
    if (global.icraftRecipeRemovalsValidated) return
    global.icraftRecipeRemovalsValidated = true

    // We can't easily file-read across all the recipe files from KubeJS
    // server_scripts (no java.io.File access — KubeJS class filter blocks
    // it). Instead, we hardcode the snapshot of what's currently being
    // removed and validate item-by-item.
    //
    // On future audits, regenerate this list by:
    //   grep -hoE "event\.remove\(\{[^}]*output: ['\"]([a-z0-9_]+:[a-z0-9_/]+)" \
    //     kubejs/server_scripts/recipes/*.js \
    //     kubejs/server_scripts/compat/*.js \
    //   | grep -oE "[a-z0-9_]+:[a-z0-9_/]+" | sort -u
    //
    // (And paste the output into REMOVAL_TARGETS below.)

    const REMOVAL_TARGETS = [
        // simplyswords Section E — refreshed in Phase 3.1
        'simplyswords:emberblade', 'simplyswords:frostfall', 'simplyswords:icewhisper',
        'simplyswords:tempest', 'simplyswords:soulrender', 'simplyswords:whisperwind',
        'simplyswords:enigma', 'simplyswords:hiveheart', 'simplyswords:toxic_longsword',
        'simplyswords:stars_edge', 'simplyswords:waxweaver', 'simplyswords:thunderbrand',
        'simplyswords:caelestis', 'simplyswords:sunfire', 'simplyswords:flamewind',
        'simplyswords:brimstone_claymore', 'simplyswords:molten_edge', 'simplyswords:shadowsting',
        'simplyswords:livyatan', 'simplyswords:twisted_blade', 'simplyswords:emberlash',
        'simplyswords:bramblethorn', 'simplyswords:soulstealer', 'simplyswords:soulpyre',
        'simplyswords:soulkeeper', 'simplyswords:waking_lichblade', 'simplyswords:magiblade',
        'simplyswords:arcanethyst', 'simplyswords:awakened_lichblade', 'simplyswords:stormbringer',
        'simplyswords:watching_warglaive', 'simplyswords:harbinger', 'simplyswords:hearthflame',
        'simplyswords:magiscythe', 'simplyswords:magispear', 'simplyswords:ribboncleaver',
        'simplyswords:slumbering_lichblade', 'simplyswords:wickpiercer', 'simplyswords:mjolnir',
        'simplyswords:storms_edge', 'simplyswords:sword_on_a_stick', 'simplyswords:watcher_claymore',
        'simplyswords:dormant_relic',

        // theabyss Section K.3 — fixed plural in Phase 3.2
        'theabyss:ring_of_fire', 'theabyss:ring_of_speed', 'theabyss:ring_of_flight',
        'theabyss:ring_of_teleport', 'theabyss:ring_of_time', 'theabyss:ring_of_ghosts',
        'theabyss:ring_of_slide', 'theabyss:ring_of_thunder', 'theabyss:ring_of_freeze',
        'theabyss:ring_of_blackstrike', 'theabyss:ring_of_curse', 'theabyss:ring_of_eagle',
        'theabyss:ring_of_electro', 'theabyss:ring_of_enderchest', 'theabyss:ring_of_fangs',
        'theabyss:ring_of_firestorm', 'theabyss:ring_of_firestrike', 'theabyss:ring_of_firework',
        'theabyss:ring_of_home', 'theabyss:ring_of_invisibility', 'theabyss:ring_of_jugger',
        'theabyss:ring_of_nature', 'theabyss:ring_of_nightblade', 'theabyss:ring_of_ocean',
        'theabyss:ring_of_pocket', 'theabyss:ring_of_regen', 'theabyss:ring_of_seeker',
        'theabyss:ring_of_telekinetic', 'theabyss:ring_of_fart',
        'theabyss:arcane_workbench',
        'theabyss:knight_helmet', 'theabyss:knight_chestplate', 'theabyss:knight_leggings',
        'theabyss:knight_boots',
        'theabyss:unorithe_helmet', 'theabyss:unorithe_chestplate', 'theabyss:unorithe_leggings',
        'theabyss:unorithe_boots',
        'theabyss:ragnarok_helmet', 'theabyss:ragnarok_chestplate', 'theabyss:ragnarok_leggings',
        'theabyss:ragnarok_boots',
        'theabyss:dragon_helmet', 'theabyss:dragon_chestplate', 'theabyss:dragon_leggings',
        'theabyss:dragon_boots',
        'theabyss:death_helmet', 'theabyss:death_chestplate', 'theabyss:death_leggings',
        'theabyss:death_boots',

        // blue_skies Section L
        'blue_skies:shadow_helmet', 'blue_skies:shadow_chestplate',
        'blue_skies:shadow_leggings', 'blue_skies:shadow_boots',
        'blue_skies:runic_arc',

        // mekanism Section J
        'mekanism:atomic_disassembler', 'mekanism:meka_tool',
        'mekanism:refined_obsidian_helmet', 'mekanism:refined_obsidian_chestplate',
        'mekanism:refined_obsidian_leggings', 'mekanism:refined_obsidian_boots',

        // botania
        'minecraft:lodestone',
        'forbidden_arcanus:hephaestus_forge',

        // rftoolsdim
        'rftoolsdim:dimension_builder', 'rftoolsdim:dimension_editor',

        // ad_astra rockets
        'ad_astra:nasa_workbench',
        'ad_astra:tier_1_rocket', 'ad_astra:tier_2_rocket',
        'ad_astra:tier_3_rocket', 'ad_astra:tier_4_rocket',
        'ad_astra:jet_suit_helmet', 'ad_astra:jet_suit_chestplate',
        'ad_astra:jet_suit_leggings', 'ad_astra:jet_suit_boots'
    ]

    // Item.exists() is the KubeJS 6 idiomatic check — returns true iff the
    // id resolves to a registered Item that is NOT minecraft:air.
    const stale = []
    REMOVAL_TARGETS.forEach(id => {
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
        console.warn('[icraft-validate] Update the source recipe files and the REMOVAL_TARGETS list')
        console.warn('[icraft-validate] in kubejs/server_scripts/validate_recipe_removals.js.')
    } else {
        console.log('[icraft-validate] All ' + REMOVAL_TARGETS.length + ' recipe-removal IDs validated against item registry.')
    }
})
