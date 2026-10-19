// =============================================================================
// CUSTOM ITEM REGISTRATION — Priority 1
// Progression tokens, boss materials, intermediate alloys
// Must be in startup_scripts/ (requires game restart to apply)
// =============================================================================

StartupEvents.registry('item', icraft.guard('custom_items', 'StartupEvents.registry', event => {

    // =========================================================================
    // PROGRESSION TOKENS (consumed in tier gate recipes / granted by quests)
    // =========================================================================

    icraft.section('custom_items/progression-tokens', function () {
    event.create('kubejs:twilight_progression_token_t2')
        .displayName('Twilight Progression Token')
        .tooltip('A shimmering token of power from the Twilight Forest')
        .tooltip('§7Used to advance to Tier 2')
        .maxStackSize(16)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/ender_pearl' })
        .color(0, 0xC0C0C0)

    event.create('kubejs:dimensional_progression_token_t3')
        .displayName('Dimensional Progression Token')
        .tooltip('A fragment of condensed dimensional energy')
        .tooltip('§7Used to advance to Tier 3')
        .maxStackSize(16)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/ender_pearl' })
        .color(0, 0xFFD700)

    event.create('kubejs:reality_progression_token_t4')
        .displayName('Reality Progression Token')
        .tooltip('A crystallized shard of reality itself')
        .tooltip('§7Used to advance to Tier 4')
        .maxStackSize(16)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/ender_pearl' })
        .color(0, 0x4AEDD9)
    })

    // (2026-10-11: the t2/t3/t4_token_fragment items that followed were removed --
    //  registered since the legacy token currency, referenced by nothing.)

    // =========================================================================
    // BOSS MATERIALS
    // =========================================================================

    // Tier 2 boss drops
    icraft.section('custom_items/boss-materials', function () {
    event.create('kubejs:lich_soul')
        .displayName('Lich Soul')
        .tooltip('§5The captured essence of the Twilight Lich')
        .maxStackSize(64)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/ghast_tear' })
        .color(0, 0x8B008B)

    event.create('kubejs:naga_scale')
        .displayName('Naga Scale')
        .tooltip('§2A hardened scale from the Twilight Naga')
        .maxStackSize(64)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/phantom_membrane' })
        .color(0, 0x228B22)

    event.create('kubejs:hydra_fang')
        .displayName('Hydra Fang')
        .tooltip('§6A scorching fang from the Twilight Hydra')
        .maxStackSize(64)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/iron_ingot' })
        .color(0, 0xFF6600)

    event.create('kubejs:ur_ghast_tear')
        .displayName("Ur-Ghast Tear")
        .tooltip('§8A spectral tear from the Ur-Ghast')
        .maxStackSize(64)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/ghast_tear' })
        .color(0, 0x555555)

    // Tier 3 boss drops
    event.create('kubejs:harbinger_eye')
        .displayName('Harbinger Eye')
        .tooltip('§4An eye torn from the Harbinger of the Deep')
        .maxStackSize(64)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/ender_eye' })
        .color(0, 0x8B0000)

    event.create('kubejs:ignis_core')
        .displayName('Core of Ignis')
        .tooltip('§cThe molten heart of Ignis')
        .maxStackSize(64)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/magma_cream' })
        .color(0, 0xFF3300)

    event.create('kubejs:nether_soul_fragment')
        .displayName('Nether Soul Fragment')
        .tooltip('§4A shard of damned souls from the Nether')
        .maxStackSize(64)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0x8B0000)

    event.create('kubejs:condensed_blaze_essence')
        .displayName('Condensed Blaze Essence')
        .tooltip('§6Concentrated fire from slain Blazes')
        .maxStackSize(64)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/blaze_powder' })
        .color(0, 0xFF8C00)

    event.create('kubejs:wither_bone')
        .displayName('Wither Bone')
        .tooltip('§8A bone suffused with withering energy')
        .maxStackSize(64)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/bone' })
        .color(0, 0x333333)

    // Tier 4 boss drops
    event.create('kubejs:dragon_heart')
        .displayName('Dragon Heart')
        .tooltip('§5The still-beating heart of the Ender Dragon')
        .maxStackSize(16)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/apple' })
        .color(0, 0xAA0055)

    event.create('kubejs:dragon_scale')
        .displayName('Dragon Scale')
        .tooltip('§5An iridescent scale from the Ender Dragon')
        .maxStackSize(64)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/phantom_membrane' })
        .color(0, 0x22AA44)

    event.create('kubejs:gaia_spirit_fragment')
        .displayName('Gaia Spirit Fragment')
        .tooltip('§aA sliver of the Gaia Guardian\'s essence')
        .maxStackSize(64)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0x55FF55)

    event.create('kubejs:void_essence')
        .displayName('Void Essence')
        .tooltip('§0Pure distilled nothingness from the End')
        .maxStackSize(64)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0x110022)
    })

    // (2026-10-11: the INTERMEDIATE ALLOYS section -- brass_reinforced_iron_ingot,
    //  mana_infused_steel_ingot, ender_forged_diamond -- was removed: no recipe,
    //  loot table, script or quest ever referenced them.)

    // =========================================================================
    // WAYSTONE CRAFTING MATERIAL (expensive boss-drop-gated waystone recipe)
    // =========================================================================

    icraft.section('custom_items/waystone-crafting-material', function () {
    event.create('kubejs:waystone_core')
        .displayName('Waystone Core')
        .tooltip('§9A rare spatial anchor required to craft Waystones')
        .tooltip('§7Obtained from boss drops')
        .maxStackSize(16)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/ender_pearl' })
        .color(0, 0x3366CC)
    })

    // =========================================================================
    // REFORGING TOKENS (Apotheosis reforging gates)
    // =========================================================================

    icraft.section('custom_items/reforging-tokens', function () {
    event.create('kubejs:basic_reforging_token')
        .displayName('Basic Reforging Token')
        .tooltip('§7Unlocks basic Apotheosis reforging')
        .tooltip('§7Requires Tier 2')
        .maxStackSize(16)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/iron_ingot' })
        .color(0, 0xCD7F32)

    event.create('kubejs:advanced_reforging_token')
        .displayName('Advanced Reforging Token')
        .tooltip('§7Unlocks advanced Apotheosis reforging')
        .tooltip('§7Requires Tier 3')
        .maxStackSize(16)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/iron_ingot' })
        .color(0, 0xC0C0C0)

    event.create('kubejs:ultimate_reforging_token')
        .displayName('Ultimate Reforging Token')
        .tooltip('§7Unlocks ultimate Apotheosis reforging')
        .tooltip('§7Requires Tier 4')
        .maxStackSize(16)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/iron_ingot' })
        .color(0, 0xFFD700)
    })

    // =========================================================================
    // SHORT-NAME TOKEN ALIASES
    // Only tier2_token is left. Nothing drops it any more: the Majrusz
    // undead-army treasure bag in the icraft_progdiff_overrides Paxi pack was
    // its last source and lost the entry on 2026-10-11 (decision sheet C8). It
    // stays REGISTERED on purpose: unregistering an item deletes every stack of
    // it that players already hold or have stored.
    // (2026-10-11: tier1_token, tier3_token, tier4_token and the three
    //  tierN_token_fragment items were removed -- referenced by nothing.)
    // =========================================================================

    icraft.section('custom_items/short-name-token-aliases', function () {
    event.create('kubejs:tier2_token')
        .displayName('Expansion Token')
        .tooltip('§7A mark of dimensional exploration')
        .maxStackSize(64)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/ender_pearl' })
        .color(0, 0xC0C0C0)
    })

    // =========================================================================
    // COMPASS OF RETURN (Magic Mirror — teleport to bed on 10 min CD)
    // =========================================================================

    icraft.section('custom_items/compass-of-return', function () {
    event.create('kubejs:compass_of_return')
        .displayName('Compass of Return')
        .tooltip('§9Right-click to return to your last bed')
        .tooltip('§7Cooldown: 10 minutes')
        .tooltip('§8"The needle always points home."')
        .maxStackSize(1)
        .rarity('rare')
        .glow(true)
        .textureJson({ layer0: 'kubejs:item/compass_of_return' })
    })

    // =========================================================================
    // DRAGON SUMMONING CRYSTAL (End exploration gate item)
    // =========================================================================

    icraft.section('custom_items/dragon-summoning-crystal', function () {
    event.create('kubejs:dragon_summoning_crystal')
        .displayName('Dragon Summoning Crystal')
        .tooltip('§5A crystallized beacon of draconic energy')
        .tooltip('§7Hold it in your main hand and sneak at the End Portal')
        .tooltip('§7fountain (0,0) to summon the Ender Dragon')
        .tooltip('§8Requires End exploration before the Dragon can be challenged')
        .maxStackSize(1)
        .rarity('epic')
        .glow(true)
        .textureJson({ layer0: 'minecraft:item/end_crystal' })
        .color(0, 0xBB44FF)
    })

    // =========================================================================
    // ENDGAME MATERIALS (T4 boss drops for Crucible/Prestige)
    // =========================================================================

    // 2026-04-27 (audit Phase 2.2): renamed to icraft_rift_shard to resolve
    // namespace collision with too_many_bows:rift_shard. Old kubejs:rift_shard
    // stays registered (unregistering an item deletes the stacks players hold).
    // The login migration that converted it was deleted on 2026-10-10, so since
    // 2026-10-18 (decision list entry 14 (c)) the old shard crafts 1:1 into the
    // current one (endgame/mythic_forge.js, recipe icraft:rift_shard_from_old)
    // and its text says so.
    icraft.section('custom_items/endgame-materials', function () {
    event.create('kubejs:rift_shard')
        .displayName('§7Old Rift Shard')
        .tooltip('§dA fragment of torn reality')
        .tooltip('§cOld item: craft it into an Iridescent Rift Shard')
        .maxStackSize(64)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0x9933FF)

    event.create('kubejs:icraft_rift_shard')
        .displayName('Iridescent Rift Shard')
        .tooltip('§dA fragment of torn reality')
        .tooltip('§7Dropped by late bosses')
        .maxStackSize(64)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0x9933FF)

    event.create('kubejs:void_fragment')
        .displayName('Void Fragment')
        .tooltip('§0A piece of crystallized nothingness')
        .tooltip('§7Dropped by late bosses')
        .maxStackSize(64)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0x220033)

    event.create('kubejs:rift_keystone')
        .displayName('Rift Keystone')
        .tooltip('§dA key to dimensions beyond')
        .tooltip('§7Not in the game yet: it is meant to open')
        .tooltip("§7Oblivion's Rift, which is designed, not built")
        .maxStackSize(16)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/ender_pearl' })
        .color(0, 0xCC33FF)
    })

    // =========================================================================
    // ABYSS CUSTOM RINGS (replace vanilla Abyss ring crafting)
    // =========================================================================

    icraft.section('custom_items/abyss-custom-rings', function () {
    event.create('kubejs:ring_of_shadows')
        .displayName('Ring of Shadows')
        .tooltip('§7Grants Invisibility for 5s on sneak')
        .tooltip('§8Cooldown: 30s')
        .maxStackSize(1)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/gold_ingot' })
        .color(0, 0x333344)

    event.create('kubejs:ring_of_the_phantom')
        .displayName('Ring of the Phantom')
        .tooltip('§7+10% dodge chance (damage reduction)')
        .maxStackSize(1)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/gold_ingot' })
        .color(0, 0x8888CC)

    event.create('kubejs:ring_of_embers')
        .displayName('Ring of Embers')
        .tooltip('§6Fire Resistance + fire aura (1 HP/s to nearby mobs)')
        .maxStackSize(1)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/gold_ingot' })
        .color(0, 0xFF4400)

    event.create('kubejs:ring_of_frost')
        .displayName('Ring of Frost')
        .tooltip('§bSlowness aura to hostile mobs within 4 blocks')
        .maxStackSize(1)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/gold_ingot' })
        .color(0, 0x88CCFF)

    event.create('kubejs:ring_of_the_knight')
        .displayName('Ring of the Knight')
        .tooltip('§e+10% melee damage, +5% knockback resistance')
        .maxStackSize(1)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/gold_ingot' })
        .color(0, 0xDDAA00)

    event.create('kubejs:ring_of_void_sight')
        .displayName('Ring of Void Sight')
        .tooltip('§5Applies Glowing to mobs within 16 blocks')
        .maxStackSize(1)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/emerald' })
        .color(0, 0x6600AA)

    event.create('kubejs:ring_of_dark_pact')
        .displayName('Ring of Dark Pact')
        .tooltip('§4+15% damage dealt, +10% damage taken')
        .tooltip('§8Power demands sacrifice')
        .maxStackSize(1)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/emerald' })
        .color(0, 0x880000)

    event.create('kubejs:ring_of_unorithe')
        .displayName('Ring of Unorithe')
        .tooltip('§d+5% all stats, 1% life steal')
        .tooltip('§8The pinnacle of Abyss artifice')
        .maxStackSize(1)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/emerald' })
        .color(0, 0xDD44FF)
    })
}))


// (2026-10-11: the five kubejs:transmuted_* "tier-skip" items were removed. The
//  feature existed only as these items -- no transmutation recipe, tag or Codex
//  entry was ever written -- so they were unobtainable and hidden from JEI.)

// ═══ CLASS RESPEC STATION ═══
// Design Doc Part III: "Class Altar" — tier-appropriate boss material + 30 levels
StartupEvents.registry('item', icraft.guard('custom_items#2', 'StartupEvents.registry', event => {
  event.create('icraft:class_altar')
    .displayName('§6Class Altar')
    .tooltip('§7Hold it, with a boss trophy in your other hand, and right-click to change your class')
    .tooltip('§7Requires: 1 boss trophy + 30 XP levels')
    .maxStackSize(1)
    .rarity('EPIC')
    .textureJson({ layer0: 'minecraft:item/nether_star' })
    .color(0, 0xFFAA00)

  // =========================================================================
  // HDPE CIRCUIT BOARD — Industrial Byproduct → Circuit Substitute
  // =========================================================================

  event.create('kubejs:hdpe_circuit_board')
    .displayName('HDPE Circuit Board')
    .tooltip('§aA lightweight plastic circuit board')
    .tooltip('§7Crafted from HDPE Sheet + Redstone + Gold')
    .tooltip('§7Substitutes for control circuits in select recipes')
    .tooltip('§8Feeds ethylene byproducts back into your factory')
    .maxStackSize(64)
    .rarity('uncommon')
    .textureJson({ layer0: 'minecraft:item/iron_ingot' })
    .color(0, 0x33AA33)
}))
