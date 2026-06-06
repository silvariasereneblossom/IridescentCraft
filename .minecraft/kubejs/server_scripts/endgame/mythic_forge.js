// =============================================================================
// MYTHIC FORGE RECIPES — Oblivion's Rift Endgame Crafting
// Place in: kubejs/server_scripts/endgame/mythic_forge.js
//
// Design Doc: Part II — Mythic Gear Chase (Loop 2)
//   Mythic Infusion, Mythic Reforging, Rift-Touched Enchantments,
//   Mythic Unique Recipes (Rift Blueprints)
//
// All recipes use the Mythic Forge (kubejs:mythic_forge) as a crafting
// component in shaped/shapeless recipes. This simulates a "station" using
// KubeJS recipe API without needing a custom block/GUI.
//
// Pattern: Place Mythic Forge + materials in crafting grid → output
// =============================================================================

ServerEvents.recipes(event => {

    // =========================================================================
    // SECTION 1: MYTHIC FORGE CRAFTING RECIPE
    // Crafted from Rift materials + Mekanism components
    // Rift Key: Dragon Heart + Void Essence + Gaia Ingot + Nether Star
    // =========================================================================

    event.shaped('kubejs:mythic_forge', [
        'RMR',
        'OCO',
        'NNN'
    ], {
        R: 'kubejs:icraft_rift_shard',
        M: 'mekanism:teleportation_core',
        O: 'minecraft:crying_obsidian',
        C: 'mekanism:steel_casing',
        N: 'minecraft:netherite_ingot'
    }).id('icraft:mythic_forge')

    // =========================================================================
    // SECTION 2: RIFT KEYSTONE RECIPE
    // Entry item for Oblivion's Rift — consumed on entry
    // Dragon Heart + Void Essence + Gaia Ingot + Nether Star
    // =========================================================================

    event.shaped('kubejs:rift_keystone', [
        ' V ',
        'DGN',
        ' S '
    ], {
        V: 'kubejs:void_essence',
        D: 'kubejs:dragon_heart',
        G: 'botania:gaia_ingot',
        N: 'minecraft:nether_star',
        S: 'kubejs:icraft_rift_shard'
    }).id('icraft:rift_keystone')

    // =========================================================================
    // SECTION 3: VOID COFFER RECIPE
    // Banking item for Rift runs
    // =========================================================================

    event.shaped('kubejs:void_coffer', [
        'OEO',
        'VCV',
        'OEO'
    ], {
        O: 'minecraft:obsidian',
        E: 'minecraft:ender_chest',
        V: 'kubejs:void_fragment',
        C: 'minecraft:chest'
    }).id('icraft:void_coffer')

    // =========================================================================
    // SECTION 4: MYTHIC CATALYST RECIPES (Mythic I through V)
    // Each catalyst is crafted at the Mythic Forge with escalating materials
    // Then applied to gear via smithing-style shapeless recipe
    //
    // Mythic I:   5 Rift Shards + 2 Void Fragments
    // Mythic II:  10 Shards + 5 Fragments
    // Mythic III: 20 Shards + 10 Fragments + 1 Primordial Essence
    // Mythic IV:  35 Shards + 15 Fragments + 2 Essences
    // Mythic V:   50 Shards + 25 Fragments + 3 Essences + 1 Rift Core
    //
    // KubeJS shaped recipes max at 9 slots, so we use condensed material
    // blocks and adjusted counts to fit the grid while preserving relative cost.
    // =========================================================================

    // --- Mythic Catalyst I: 5 Shards + 2 Void Fragments ---
    event.shaped('kubejs:mythic_catalyst_1', [
        'SFS',
        'SMS',
        ' F '
    ], {
        S: 'kubejs:icraft_rift_shard',
        F: 'kubejs:void_fragment',
        M: 'kubejs:mythic_forge'
    }).id('icraft:mythic_catalyst_1')

    // --- Mythic Catalyst II: 5 Shards (grid) + 4 Void Fragments ---
    // (Represents 10 shards + 5 fragments — scaled for 3x3 grid)
    event.shaped('kubejs:mythic_catalyst_2', [
        'FSF',
        'SMS',
        'FSF'
    ], {
        S: 'kubejs:icraft_rift_shard',
        F: 'kubejs:void_fragment',
        M: 'kubejs:mythic_forge'
    }).id('icraft:mythic_catalyst_2')

    // --- Mythic Catalyst III: Shards + Fragments + 1 Primordial Essence ---
    event.shaped('kubejs:mythic_catalyst_3', [
        'SFS',
        'FMF',
        'SES'
    ], {
        S: 'kubejs:icraft_rift_shard',
        F: 'kubejs:void_fragment',
        M: 'kubejs:mythic_forge',
        E: 'kubejs:primordial_essence'
    }).id('icraft:mythic_catalyst_3')

    // --- Mythic Catalyst IV: Shards + Fragments + 2 Essences + 1 Antimatter ---
    // [S85-S1 2026-06-06] Antimatter wired in as the apex reagent (closes the
    // Codex doc gap: mods_t4/mekanism_advanced.json promises antimatter is
    // "required for several Mythic infusion recipes"). 1 pellet per IV craft.
    // (mekanism:pellet_antimatter confirmed present in all_items.tsv.)
    event.shaped('kubejs:mythic_catalyst_4', [
        'SAS',
        'FMF',
        'SES'
    ], {
        S: 'kubejs:icraft_rift_shard',
        F: 'kubejs:void_fragment',
        M: 'kubejs:mythic_forge',
        E: 'kubejs:primordial_essence',
        A: 'mekanism:pellet_antimatter'
    }).id('icraft:mythic_catalyst_4')

    // --- Mythic Catalyst V: Shards + Fragments + Essences + Rift Core + Antimatter ---
    // [S85-S1 2026-06-06] Antimatter wired in as the apex reagent per the draft's
    // verbatim sketch (top row SAS). Closes the Codex doc gap and makes the
    // engineering apex (antimatter / SPS run) a hard gate on the combat/mythic
    // apex catalyst. 1 pellet per V craft.
    // (mekanism:pellet_antimatter confirmed present in all_items.tsv.)
    event.shaped('kubejs:mythic_catalyst_5', [
        'SAS',
        'FMF',
        'ECE'
    ], {
        S: 'kubejs:icraft_rift_shard',
        A: 'mekanism:pellet_antimatter',
        F: 'kubejs:void_fragment',
        M: 'kubejs:mythic_forge',
        E: 'kubejs:primordial_essence',
        C: 'kubejs:rift_core'
    }).id('icraft:mythic_catalyst_5')

    // =========================================================================
    // SECTION 5: MYTHIC REFORGE TOKEN
    // 3 Primordial Essences + Mythic Forge → Reforge Token
    // (Levels cost handled via command/advancement, not recipe)
    // =========================================================================

    event.shapeless('kubejs:mythic_reforge_token', [
        'kubejs:mythic_forge',
        'kubejs:primordial_essence',
        'kubejs:primordial_essence',
        'kubejs:primordial_essence'
    ]).id('icraft:mythic_reforge_token')

    // =========================================================================
    // SECTION 6: RIFT-TOUCHED ENCHANTMENT APPLICATION
    // Applying a Rift-Touched book requires Mythic Forge + 5 Rift Shards
    // This creates an "enhanced book" token (actual enchant logic is serverside)
    // Recipe: Mythic Forge + Enchanted Book + 5 Rift Shards → keep book
    // (Placeholder — actual application needs entity/advancement scripting)
    // =========================================================================

    // Note: Rift-Touched Enchanted Books are loot-only items from the Rift.
    // The application mechanic (1 overcapped enchant per item) requires
    // server-tick logic or advancement triggers, not just a recipe.
    // This is a placeholder recipe showing the material cost.

    // =========================================================================
    // SECTION 7: MYTHIC UNIQUE ITEM RECIPES (Rift Blueprint unlocks)
    // Each Blueprint + materials at Mythic Forge → unique endgame item
    // These use mod items as bases where possible (Cataclysm, Simply Swords)
    //
    // Since we can't create custom weapons with stats in KubeJS startup,
    // these recipes produce renamed/enchanted versions of existing items
    // as placeholders for the unique effects described in the design doc.
    // Full implementation requires datapack attribute modifiers or mod support.
    // =========================================================================

    // --- Voidheart Blade: On-kill damage stacking sword ---
    // Base: Simply Swords awakened_lichblade (thematic fit)
    event.shaped(
        Item.of('simplyswords:awakened_lichblade')
            .withName('§5Voidheart Blade')
            .enchant('minecraft:sharpness', 8), [
        'SBS',
        'FMF',
        'SRS'
    ], {
        S: 'kubejs:icraft_rift_shard',
        B: 'kubejs:rift_blueprint',
        F: 'kubejs:void_fragment',
        M: 'kubejs:mythic_forge',
        R: 'kubejs:rift_core'
    }).id('icraft:mythic_voidheart_blade')

    // --- Oblivion Aegis: Death-delay chestplate ---
    // Base: netherite chestplate with high protection
    event.shaped(
        Item.of('minecraft:netherite_chestplate')
            .withName('§5Oblivion Aegis')
            .enchant('minecraft:protection', 7)
            .enchant('minecraft:unbreaking', 5), [
        'BEB',
        'RMR',
        'SCS'
    ], {
        B: 'kubejs:rift_blueprint',
        E: 'kubejs:primordial_essence',
        R: 'kubejs:icraft_rift_shard',
        M: 'kubejs:mythic_forge',
        S: 'kubejs:void_fragment',
        C: 'kubejs:rift_core'
    }).id('icraft:mythic_oblivion_aegis')

    // --- Riftwalker Boots: Teleport + speed boots ---
    // Base: netherite boots
    event.shaped(
        Item.of('minecraft:netherite_boots')
            .withName('§5Riftwalker Boots')
            .enchant('minecraft:protection', 7)
            .enchant('minecraft:feather_falling', 6)
            .enchant('minecraft:soul_speed', 3), [
        'BEB',
        'RMR',
        'S S'
    ], {
        B: 'kubejs:rift_blueprint',
        E: 'kubejs:primordial_essence',
        R: 'kubejs:icraft_rift_shard',
        M: 'kubejs:mythic_forge',
        S: 'kubejs:void_fragment'
    }).id('icraft:mythic_riftwalker_boots')

    // --- Oblivion Crown: Wallhack vision + first-strike helmet ---
    // Base: netherite helmet
    event.shaped(
        Item.of('minecraft:netherite_helmet')
            .withName('§5Oblivion Crown')
            .enchant('minecraft:protection', 7)
            .enchant('minecraft:unbreaking', 5), [
        'SBS',
        'EME',
        'R R'
    ], {
        S: 'kubejs:icraft_rift_shard',
        B: 'kubejs:rift_blueprint',
        E: 'kubejs:primordial_essence',
        M: 'kubejs:mythic_forge',
        R: 'kubejs:rift_core'
    }).id('icraft:mythic_oblivion_crown')

    console.log('[IridescentCraft] Mythic Forge recipes loaded')
    console.log('  - Mythic Forge crafting recipe')
    console.log('  - Rift Keystone entry item recipe')
    console.log('  - Void Coffer banking item recipe')
    console.log('  - Mythic Catalysts I-V')
    console.log('  - Mythic Reforge Token')
    console.log('  - 4 Mythic Unique item recipes (Blueprint)')
})
