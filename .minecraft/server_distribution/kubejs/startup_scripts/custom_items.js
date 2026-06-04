// =============================================================================
// CUSTOM ITEM REGISTRATION — Priority 1
// Progression tokens, boss materials, intermediate alloys
// Must be in startup_scripts/ (requires game restart to apply)
// =============================================================================

StartupEvents.registry('item', event => {

    // =========================================================================
    // PROGRESSION TOKENS (consumed in tier gate recipes / granted by quests)
    // =========================================================================

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

    // Tier token fragments (collected from structures/exploration for alternative unlock)
    event.create('kubejs:t2_token_fragment')
        .displayName('Tier 2 Token Fragment')
        .tooltip('§7Collect enough to forge a full progression token')
        .maxStackSize(64)
        .rarity('common')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0xC0C0C0)

    event.create('kubejs:t3_token_fragment')
        .displayName('Tier 3 Token Fragment')
        .tooltip('§7Collect enough to forge a full progression token')
        .maxStackSize(64)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0xFFD700)

    event.create('kubejs:t4_token_fragment')
        .displayName('Tier 4 Token Fragment')
        .tooltip('§7Collect enough to forge a full progression token')
        .maxStackSize(64)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0x4AEDD9)

    // =========================================================================
    // BOSS MATERIALS
    // =========================================================================

    // Tier 2 boss drops
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

    // =========================================================================
    // INTERMEDIATE ALLOYS
    // =========================================================================

    event.create('kubejs:brass_reinforced_iron_ingot')
        .displayName('Brass-Reinforced Iron Ingot')
        .tooltip('§7Tier 1.5 — A stronger alloy bridging bronze and steel')
        .maxStackSize(64)
        .rarity('common')
        .textureJson({ layer0: 'minecraft:item/iron_ingot' })
        .color(0, 0xB5A642)

    event.create('kubejs:mana_infused_steel_ingot')
        .displayName('Mana-Infused Steel Ingot')
        .tooltip('§bTier 2.5 — Steel imbued with raw mana')
        .maxStackSize(64)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/iron_ingot' })
        .color(0, 0x44BBFF)

    event.create('kubejs:ender_forged_diamond')
        .displayName('Ender-Forged Diamond')
        .tooltip('§dTier 3.5 — A diamond hardened in dimensional flux')
        .maxStackSize(64)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/diamond' })
        .color(0, 0xBB44FF)

    // =========================================================================
    // WAYSTONE CRAFTING MATERIAL (expensive boss-drop-gated waystone recipe)
    // =========================================================================

    event.create('kubejs:waystone_core')
        .displayName('Waystone Core')
        .tooltip('§9A rare spatial anchor required to craft Waystones')
        .tooltip('§7Obtained from boss drops')
        .maxStackSize(16)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/ender_pearl' })
        .color(0, 0x3366CC)

    // =========================================================================
    // REFORGING TOKENS (Apotheosis reforging gates)
    // =========================================================================

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

    // =========================================================================
    // SHORT-NAME TOKEN ALIASES
    // lootjs_overhaul.js uses tier2_token/tier3_token/tier4_token for brevity.
    // These are the same concept as the long-name tokens above.
    // Register both so scripts work regardless of which name they use.
    // =========================================================================

    event.create('kubejs:tier1_token')
        .displayName('Foundations Token')
        .tooltip('§7A mark of overworld mastery')
        .maxStackSize(64)
        .rarity('common')
        .textureJson({ layer0: 'minecraft:item/ender_pearl' })
        .color(0, 0xCD7F32)

    event.create('kubejs:tier2_token')
        .displayName('Expansion Token')
        .tooltip('§7A mark of dimensional exploration')
        .maxStackSize(64)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/ender_pearl' })
        .color(0, 0xC0C0C0)

    event.create('kubejs:tier3_token')
        .displayName('Dominion Token')
        .tooltip('§7A mark of advanced power')
        .maxStackSize(64)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/ender_pearl' })
        .color(0, 0xFFD700)

    event.create('kubejs:tier4_token')
        .displayName('Ascension Token')
        .tooltip('§7A mark of ultimate mastery')
        .maxStackSize(64)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/ender_pearl' })
        .color(0, 0x4AEDD9)

    event.create('kubejs:tier2_token_fragment')
        .displayName('Expansion Token Fragment')
        .tooltip('§78 fragments → 1 full Expansion Token')
        .maxStackSize(64)
        .rarity('common')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0xC0C0C0)

    event.create('kubejs:tier3_token_fragment')
        .displayName('Dominion Token Fragment')
        .tooltip('§78 fragments → 1 full Dominion Token')
        .maxStackSize(64)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0xFFD700)

    event.create('kubejs:tier4_token_fragment')
        .displayName('Ascension Token Fragment')
        .tooltip('§78 fragments → 1 full Ascension Token')
        .maxStackSize(64)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0x4AEDD9)

    // =========================================================================
    // COMPASS OF RETURN (Magic Mirror — teleport to bed on 10 min CD)
    // =========================================================================

    event.create('kubejs:compass_of_return')
        .displayName('Compass of Return')
        .tooltip('§9Right-click to return to your last bed')
        .tooltip('§7Cooldown: 10 minutes')
        .tooltip('§8"The needle always points home."')
        .maxStackSize(1)
        .rarity('rare')
        .glow(true)
        .textureJson({ layer0: 'kubejs:item/compass_of_return' })

    // =========================================================================
    // DRAGON SUMMONING CRYSTAL (End exploration gate item)
    // =========================================================================

    event.create('kubejs:dragon_summoning_crystal')
        .displayName('Dragon Summoning Crystal')
        .tooltip('§5A crystallized beacon of draconic energy')
        .tooltip('§7Use at the End Portal fountain (0,0) to summon the Ender Dragon')
        .tooltip('§8Requires End exploration before the Dragon can be challenged')
        .maxStackSize(1)
        .rarity('epic')
        .glow(true)
        .textureJson({ layer0: 'minecraft:item/end_crystal' })
        .color(0, 0xBB44FF)

    // =========================================================================
    // ENDGAME MATERIALS (T4 boss drops for Crucible/Prestige)
    // =========================================================================

    // 2026-04-27 (audit Phase 2.2): renamed to icraft_rift_shard to resolve
    // namespace collision with too_many_bows:rift_shard. Old kubejs:rift_shard
    // remains registered for a transition window so any pre-update player
    // inventories migrate cleanly via PlayerEvents.loggedIn handler in
    // kubejs/server_scripts/migrations/rift_shard_rename.js. Once testers
    // confirm migration ran (target: ~2 weeks), this old entry can be removed.
    event.create('kubejs:rift_shard')
        .displayName('§7Rift Shard (deprecated — relog to convert)')
        .tooltip('§dA fragment of torn reality')
        .tooltip('§cDeprecated — relog to receive Iridescent Rift Shard')
        .maxStackSize(64)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0x9933FF)

    event.create('kubejs:icraft_rift_shard')
        .displayName('Iridescent Rift Shard')
        .tooltip('§dA fragment of torn reality')
        .tooltip('§7Dropped by T4 bosses')
        .maxStackSize(64)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0x9933FF)

    event.create('kubejs:void_fragment')
        .displayName('Void Fragment')
        .tooltip('§0A piece of crystallized nothingness')
        .tooltip('§7Dropped by T4 bosses')
        .maxStackSize(64)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0x220033)

    event.create('kubejs:rift_keystone')
        .displayName('Rift Keystone')
        .tooltip('§dA key to dimensions beyond')
        .tooltip('§7Crafted from Rift Shards and Void Fragments')
        .maxStackSize(16)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/ender_pearl' })
        .color(0, 0xCC33FF)

    // =========================================================================
    // ABYSS CUSTOM RINGS (replace vanilla Abyss ring crafting)
    // =========================================================================

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


// ═══ TRANSMUTED MATERIALS (Tier-Skip Outputs) ═══
// These bypass AStages item gates. Tagged identically to their real
// counterparts so they work in all tag-based recipes.
// Hidden from JEI — discovered via transmutation recipes or Codex.
StartupEvents.registry('item', event => {
    event.create('kubejs:transmuted_steel')
        .displayName('Transmuted Steel Ingot')
        .tooltip('§7An impure steel ingot, forged from raw iron through sheer determination')
        .tooltip('§8Functions identically to steel in all recipes')
        .maxStackSize(64)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/iron_ingot' })
        .color(0, 0x888888)

    event.create('kubejs:transmuted_manasteel')
        .displayName('Transmuted Manasteel Ingot')
        .tooltip('§7Iron infused with raw mana through brute-force alchemy')
        .tooltip('§8Functions identically to manasteel in all recipes')
        .maxStackSize(64)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/iron_ingot' })
        .color(0, 0x4488CC)

    event.create('kubejs:transmuted_osmium')
        .displayName('Transmuted Osmium Ingot')
        .tooltip('§7Steel transmuted into osmium through dimensional resonance')
        .tooltip('§8Functions identically to osmium in all recipes')
        .maxStackSize(64)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/iron_ingot' })
        .color(0, 0xAABBDD)

    event.create('kubejs:transmuted_diamond')
        .displayName('Transmuted Diamond')
        .tooltip('§7A diamond crystallized from concentrated magical pressure')
        .tooltip('§8Functions identically to diamond in all recipes')
        .maxStackSize(64)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/diamond' })
        .color(0, 0x88DDFF)

    event.create('kubejs:transmuted_ancient_debris')
        .displayName('Transmuted Ancient Debris')
        .tooltip('§7Dimensional flux compressed into proto-netherite')
        .tooltip('§8Functions identically to ancient debris in all recipes')
        .maxStackSize(64)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/iron_ingot' })
        .color(0, 0x654321)
})

// ═══ CLASS RESPEC STATION ═══
// Design Doc Part III: "Class Altar" — tier-appropriate boss material + 30 levels
StartupEvents.registry('item', event => {
  event.create('icraft:class_altar')
    .displayName('§6Class Altar')
    .tooltip('§7Place and right-click to change your class')
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
})
