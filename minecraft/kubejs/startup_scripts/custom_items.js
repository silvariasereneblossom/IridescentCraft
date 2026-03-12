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

    event.create('kubejs:dimensional_progression_token_t3')
        .displayName('Dimensional Progression Token')
        .tooltip('A fragment of condensed dimensional energy')
        .tooltip('§7Used to advance to Tier 3')
        .maxStackSize(16)
        .rarity('rare')

    event.create('kubejs:reality_progression_token_t4')
        .displayName('Reality Progression Token')
        .tooltip('A crystallized shard of reality itself')
        .tooltip('§7Used to advance to Tier 4')
        .maxStackSize(16)
        .rarity('epic')

    // Tier token fragments (collected from structures/exploration for alternative unlock)
    event.create('kubejs:t2_token_fragment')
        .displayName('Tier 2 Token Fragment')
        .tooltip('§7Collect enough to forge a full progression token')
        .maxStackSize(64)
        .rarity('common')

    event.create('kubejs:t3_token_fragment')
        .displayName('Tier 3 Token Fragment')
        .tooltip('§7Collect enough to forge a full progression token')
        .maxStackSize(64)
        .rarity('uncommon')

    event.create('kubejs:t4_token_fragment')
        .displayName('Tier 4 Token Fragment')
        .tooltip('§7Collect enough to forge a full progression token')
        .maxStackSize(64)
        .rarity('rare')

    // =========================================================================
    // BOSS MATERIALS
    // =========================================================================

    // Tier 2 boss drops
    event.create('kubejs:lich_soul')
        .displayName('Lich Soul')
        .tooltip('§5The captured essence of the Twilight Lich')
        .maxStackSize(64)
        .rarity('uncommon')

    event.create('kubejs:naga_scale')
        .displayName('Naga Scale')
        .tooltip('§2A hardened scale from the Twilight Naga')
        .maxStackSize(64)
        .rarity('uncommon')

    event.create('kubejs:hydra_fang')
        .displayName('Hydra Fang')
        .tooltip('§6A scorching fang from the Twilight Hydra')
        .maxStackSize(64)
        .rarity('uncommon')

    event.create('kubejs:ur_ghast_tear')
        .displayName("Ur-Ghast Tear")
        .tooltip('§8A spectral tear from the Ur-Ghast')
        .maxStackSize(64)
        .rarity('rare')

    // Tier 3 boss drops
    event.create('kubejs:harbinger_eye')
        .displayName('Harbinger Eye')
        .tooltip('§4An eye torn from the Harbinger of the Deep')
        .maxStackSize(64)
        .rarity('rare')

    event.create('kubejs:ignis_core')
        .displayName('Core of Ignis')
        .tooltip('§cThe molten heart of Ignis')
        .maxStackSize(64)
        .rarity('rare')

    event.create('kubejs:nether_soul_fragment')
        .displayName('Nether Soul Fragment')
        .tooltip('§4A shard of damned souls from the Nether')
        .maxStackSize(64)
        .rarity('uncommon')

    event.create('kubejs:condensed_blaze_essence')
        .displayName('Condensed Blaze Essence')
        .tooltip('§6Concentrated fire from slain Blazes')
        .maxStackSize(64)
        .rarity('uncommon')

    event.create('kubejs:wither_bone')
        .displayName('Wither Bone')
        .tooltip('§8A bone suffused with withering energy')
        .maxStackSize(64)
        .rarity('rare')

    // Tier 4 boss drops
    event.create('kubejs:dragon_heart')
        .displayName('Dragon Heart')
        .tooltip('§5The still-beating heart of the Ender Dragon')
        .maxStackSize(16)
        .rarity('epic')

    event.create('kubejs:dragon_scale')
        .displayName('Dragon Scale')
        .tooltip('§5An iridescent scale from the Ender Dragon')
        .maxStackSize(64)
        .rarity('epic')

    event.create('kubejs:gaia_spirit_fragment')
        .displayName('Gaia Spirit Fragment')
        .tooltip('§aA sliver of the Gaia Guardian\'s essence')
        .maxStackSize(64)
        .rarity('epic')

    event.create('kubejs:void_essence')
        .displayName('Void Essence')
        .tooltip('§0Pure distilled nothingness from the End')
        .maxStackSize(64)
        .rarity('epic')

    // =========================================================================
    // INTERMEDIATE ALLOYS
    // =========================================================================

    event.create('kubejs:brass_reinforced_iron_ingot')
        .displayName('Brass-Reinforced Iron Ingot')
        .tooltip('§7Tier 1.5 — A stronger alloy bridging bronze and steel')
        .maxStackSize(64)
        .rarity('common')

    event.create('kubejs:mana_infused_steel_ingot')
        .displayName('Mana-Infused Steel Ingot')
        .tooltip('§bTier 2.5 — Steel imbued with raw mana')
        .maxStackSize(64)
        .rarity('uncommon')

    event.create('kubejs:ender_forged_diamond')
        .displayName('Ender-Forged Diamond')
        .tooltip('§dTier 3.5 — A diamond hardened in dimensional flux')
        .maxStackSize(64)
        .rarity('rare')

    // =========================================================================
    // WAYSTONE CRAFTING MATERIAL (expensive boss-drop-gated waystone recipe)
    // =========================================================================

    event.create('kubejs:waystone_core')
        .displayName('Waystone Core')
        .tooltip('§9A rare spatial anchor required to craft Waystones')
        .tooltip('§7Obtained from boss drops')
        .maxStackSize(16)
        .rarity('rare')

    // =========================================================================
    // REFORGING TOKENS (Apotheosis reforging gates)
    // =========================================================================

    event.create('kubejs:basic_reforging_token')
        .displayName('Basic Reforging Token')
        .tooltip('§7Unlocks basic Apotheosis reforging')
        .tooltip('§7Requires Tier 2')
        .maxStackSize(16)
        .rarity('uncommon')

    event.create('kubejs:advanced_reforging_token')
        .displayName('Advanced Reforging Token')
        .tooltip('§7Unlocks advanced Apotheosis reforging')
        .tooltip('§7Requires Tier 3')
        .maxStackSize(16)
        .rarity('rare')

    event.create('kubejs:ultimate_reforging_token')
        .displayName('Ultimate Reforging Token')
        .tooltip('§7Unlocks ultimate Apotheosis reforging')
        .tooltip('§7Requires Tier 4')
        .maxStackSize(16)
        .rarity('epic')

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

    event.create('kubejs:tier2_token')
        .displayName('Expansion Token')
        .tooltip('§7A mark of dimensional exploration')
        .maxStackSize(64)
        .rarity('uncommon')

    event.create('kubejs:tier3_token')
        .displayName('Dominion Token')
        .tooltip('§7A mark of advanced power')
        .maxStackSize(64)
        .rarity('rare')

    event.create('kubejs:tier4_token')
        .displayName('Ascension Token')
        .tooltip('§7A mark of ultimate mastery')
        .maxStackSize(64)
        .rarity('epic')

    event.create('kubejs:tier2_token_fragment')
        .displayName('Expansion Token Fragment')
        .tooltip('§78 fragments → 1 full Expansion Token')
        .maxStackSize(64)
        .rarity('common')

    event.create('kubejs:tier3_token_fragment')
        .displayName('Dominion Token Fragment')
        .tooltip('§78 fragments → 1 full Dominion Token')
        .maxStackSize(64)
        .rarity('uncommon')

    event.create('kubejs:tier4_token_fragment')
        .displayName('Ascension Token Fragment')
        .tooltip('§78 fragments → 1 full Ascension Token')
        .maxStackSize(64)
        .rarity('rare')

    // =========================================================================
    // ENDGAME MATERIALS (T4 boss drops for Crucible/Prestige)
    // =========================================================================

    event.create('kubejs:rift_shard')
        .displayName('Rift Shard')
        .tooltip('§dA fragment of torn reality')
        .tooltip('§7Dropped by T4 bosses')
        .maxStackSize(64)
        .rarity('epic')

    event.create('kubejs:void_fragment')
        .displayName('Void Fragment')
        .tooltip('§0A piece of crystallized nothingness')
        .tooltip('§7Dropped by T4 bosses')
        .maxStackSize(64)
        .rarity('epic')

    event.create('kubejs:rift_keystone')
        .displayName('Rift Keystone')
        .tooltip('§dA key to dimensions beyond')
        .tooltip('§7Crafted from Rift Shards and Void Fragments')
        .maxStackSize(16)
        .rarity('epic')
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
})
