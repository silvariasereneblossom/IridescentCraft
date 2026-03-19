// =============================================================================
// TIER-SKIP MECHANICS — Priority 8
// Design Doc Part I, Section 17 + Section 26 (Boss Material Drops)
//
// Philosophy: Skilled/dedicated players can get "a taste" of the next tier —
// one or two specific items/machines, not a full unlock.
//
// Method 1: Material Transmutation (this file — recipe events)
//   32–64 current-tier ingots → 1 next-tier ingot
//   Available through shaped crafting, Create mixing, or Botania infusion
//   Intentionally inefficient
//
// Method 2: Rare Boss Drops (handled in lootjs_overhaul.js Section 4G)
//   Current-tier bosses have 5–15% chance to drop 1–3 next-tier materials
//   Twilight bosses → occasional osmium, steel
//   Tier 3 bosses → occasional ancient debris, gaia spirit fragments
//
// What This Enables:
//   A Tier 2 player might build ONE Mekanism machine from transmuted osmium
//   They cannot build a full factory until properly unlocking Tier 3
//   Feels rewarding without breaking gate integrity
// =============================================================================

ServerEvents.recipes(event => {

    // =====================================================================
    // SECTION 1: TOKEN FRAGMENT → FULL TOKEN ASSEMBLY
    // Token fragments drop from structure loot and mini-bosses.
    // 8 fragments + 1 binding material → 1 full progression token.
    // Full tokens can be used in FTB Quests as alternative gate unlocks.
    // =====================================================================

    event.shaped('kubejs:tier2_token', [
        'FFF',
        'FGF',
        'FFF'
    ], {
        F: 'kubejs:tier2_token_fragment',
        G: 'minecraft:gold_ingot'
    }).id('kubejs:tier2_token_from_fragments')

    event.shaped('kubejs:tier3_token', [
        'FFF',
        'FDF',
        'FFF'
    ], {
        F: 'kubejs:tier3_token_fragment',
        D: 'minecraft:diamond'
    }).id('kubejs:tier3_token_from_fragments')

    event.shaped('kubejs:tier4_token', [
        'FFF',
        'FNF',
        'FFF'
    ], {
        F: 'kubejs:tier4_token_fragment',
        N: 'minecraft:netherite_ingot'
    }).id('kubejs:tier4_token_from_fragments')

    // =====================================================================
    // SECTION 2: MATERIAL TRANSMUTATION — Method 1
    // Expensive current-tier → next-tier conversion.
    // Multiple crafting paths for tech/magic/hybrid.
    // All are intentionally inefficient (32–64:1 ratio).
    // =====================================================================

    // --- T1 → T2 Peek: Iron/Copper → Transmuted Steel (tech path) ---
    // Outputs transmuted version that bypasses AStages tier_2 gate
    event.shaped('kubejs:transmuted_steel', [
        'ICI',
        'CKC',
        'ICI'
    ], {
        I: '4x minecraft:iron_ingot',
        C: '2x minecraft:copper_ingot',
        K: '8x minecraft:coal'
    }).id('kubejs:transmute_iron_to_steel')

    // T1 → T2 Peek: Iron → Transmuted Manasteel (magic path)
    event.shaped('kubejs:transmuted_manasteel', [
        'III',
        'IMI',
        'III'
    ], {
        I: '4x minecraft:iron_ingot',
        M: 'botania:mana_diamond'
    }).id('kubejs:transmute_iron_to_manasteel')

    // --- T2 → T3 Peek: Steel → Transmuted Osmium (tech path) ---
    event.shaped('kubejs:transmuted_osmium', [
        'SSS',
        'SMS',
        'SSS'
    ], {
        S: '4x #forge:ingots/steel',
        M: 'botania:mana_diamond'
    }).id('kubejs:transmute_steel_to_osmium')

    // T2 → T3 Peek: Manasteel → Transmuted Diamond (magic path)
    event.shaped('kubejs:transmuted_diamond', [
        'MTM',
        'T T',
        'MTM'
    ], {
        M: '2x botania:manasteel_ingot',
        T: 'botania:terrasteel_ingot'
    }).id('kubejs:transmute_manasteel_to_diamond')

    // --- T3 → T4 Peek: Diamond → Transmuted Ancient Debris ---
    // EXTREMELY expensive — by design
    event.shaped('kubejs:transmuted_ancient_debris', [
        'DTD',
        'TET',
        'DTD'
    ], {
        D: '2x minecraft:diamond',
        T: '2x botania:terrasteel_ingot',
        E: '#forge:ingots/enderium'
    }).id('kubejs:transmute_diamond_to_debris')

    // =====================================================================
    // SECTION 3: INTERMEDIATE ALLOY RECIPES
    // Custom alloys that bridge tier gaps. Used in progression recipes
    // and provide crafting milestones between full tiers.
    // =====================================================================

    // Brass-Reinforced Iron (T1.5) — Create brass + iron
    event.shaped('2x kubejs:brass_reinforced_iron_ingot', [
        'BIB',
        'IBI',
        'BIB'
    ], {
        B: 'create:brass_ingot',
        I: 'minecraft:iron_ingot'
    }).id('kubejs:brass_reinforced_iron')

    // Mana-Infused Steel (T2.5) — Steel + Manasteel + Mana Diamond
    event.shaped('2x kubejs:mana_infused_steel_ingot', [
        'SMS',
        'MDM',
        'SMS'
    ], {
        S: '#forge:ingots/steel',
        M: 'botania:manasteel_ingot',
        D: 'botania:mana_diamond'
    }).id('kubejs:mana_infused_steel')

    // Ender-Forged Diamond (T3.5) — Enderium + Diamond + Terrasteel
    event.shaped('kubejs:ender_forged_diamond', [
        'EDE',
        'DRD',
        'EDE'
    ], {
        E: '#forge:ingots/enderium',
        D: 'minecraft:diamond',
        R: 'botania:terrasteel_ingot'
    }).id('kubejs:ender_forged_diamond')

    // =====================================================================
    // SECTION 4: REFORGING TOKEN CRAFTING
    // Spent at Apotheosis reforging stations.
    // Basic = T2+, Ultimate = T4+ (nether star cost).
    // =====================================================================

    event.shaped('kubejs:basic_reforging_token', [
        ' G ',
        'GDG',
        ' G '
    ], {
        G: 'minecraft:gold_ingot',
        D: 'minecraft:diamond'
    }).id('kubejs:basic_reforging_token')

    event.shaped('kubejs:ultimate_reforging_token', [
        ' N ',
        'NSN',
        ' N '
    ], {
        N: 'minecraft:netherite_ingot',
        S: 'minecraft:nether_star'
    }).id('kubejs:ultimate_reforging_token')

    // =====================================================================
    // SECTION 5: WAYSTONE RECIPES — MOVED
    // Now in waystone_recipes.js (boss-material gated, all variants)
    // =====================================================================

    // =====================================================================
    // SECTION 6: BOSS MATERIAL PROCESSING
    // Boss-dropped custom materials → useful items.
    // These provide alternative paths to key progression items.
    // =====================================================================

    // Condensed Blaze Essence (blaze drop) → Blaze Powder (3x, more efficient)
    event.shapeless('3x minecraft:blaze_powder', [
        'kubejs:condensed_blaze_essence'
    ]).id('kubejs:blaze_essence_to_powder')

    // Void Essence (enderman drop) → Ender Eyes
    event.shaped('minecraft:ender_eye', [
        'VBV',
        'B B',
        'VBV'
    ], {
        V: 'kubejs:void_essence',
        B: 'minecraft:blaze_powder'
    }).id('kubejs:void_essence_to_eye')

    // Nether Soul Fragments (wither skeleton drop) → Soul Sand
    event.shaped('4x minecraft:soul_sand', [
        'NN',
        'NN'
    ], {
        N: 'kubejs:nether_soul_fragment'
    }).id('kubejs:soul_fragments_to_sand')

    // Rift Shard + Void Fragment (T4 boss drops) → Rift Keystone
    // Used in endgame Crucible/Prestige recipes
    event.shaped('kubejs:rift_keystone', [
        'RVR',
        'VNV',
        'RVR'
    ], {
        R: 'kubejs:rift_shard',
        V: 'kubejs:void_fragment',
        N: 'minecraft:nether_star'
    }).id('kubejs:rift_keystone')

    // =====================================================================
    // SECTION 7: DUAL-PATH RECIPE VARIANTS
    // Both tech and magic routes to the same material.
    // Hybrid builds should feel rewarded, not penalized.
    // =====================================================================

    // Steel via Botania (magic path — no Thermal needed)
    event.shaped('#forge:ingots/steel', [
        'LIL',
        'IMI',
        'LIL'
    ], {
        L: 'botania:livingwood_planks',
        I: 'minecraft:iron_ingot',
        M: 'botania:manasteel_ingot'
    }).id('kubejs:steel_via_botania')

    // Enderium via Occultism (magic path — no Thermal needed)
    // Requires T3 Occultism infrastructure
    event.shaped('#forge:ingots/enderium', [
        'EPE',
        'POP',
        'EPE'
    ], {
        E: 'minecraft:ender_pearl',
        P: '#forge:ingots/lead',
        O: 'occultism:spirit_attuned_gem'
    }).id('kubejs:enderium_via_occultism')

    // =====================================================================
    // SECTION 8: NEXT-TIER PEEK — BOSS MATERIAL LOOT
    // These are configured in lootjs_overhaul.js but documented here
    // for reference. The LootJS script adds these drops:
    //
    // Tier 2 bosses (Naga, Lich, Hydra, etc.):
    //   5-10% → 1-2 mekanism:ingot_osmium
    //   5-10% → 1-2 thermal:steel_ingot
    //
    // Tier 3 bosses (Harbinger, Ignis, Wither, etc.):
    //   5-8%  → 1 minecraft:ancient_debris
    //   5-10% → 1-2 botania:gaia_ingot (fragment equivalent)
    //
    // Tier 4 bosses (Dragon, Gaia Guardian, etc.):
    //   N/A — already endgame, no next-tier peek needed
    //   Instead: rift_shard, void_fragment for Crucible/Prestige
    // =====================================================================
    // (No recipes here — see lootjs_overhaul.js Sections 4F/4G)
})
