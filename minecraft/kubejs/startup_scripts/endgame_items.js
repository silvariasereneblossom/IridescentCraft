// =============================================================================
// ENDGAME ITEM REGISTRATION — Oblivion's Rift & Mythic Gear System
// Place in: kubejs/startup_scripts/endgame_items.js
// Must be in startup_scripts/ (requires game restart to apply)
//
// Design Doc: Part II — Oblivion's Rift (Loop 1), Mythic Gear Chase (Loop 2)
//
// NOTE: The following items are already registered in custom_items.js:
//   kubejs:rift_shard, kubejs:void_fragment, kubejs:rift_keystone
// Do NOT duplicate them here.
// =============================================================================

StartupEvents.registry('item', event => {

    // =========================================================================
    // RIFT-EXCLUSIVE DROP MATERIALS
    // Obtained only inside Oblivion's Rift from floor guardians and mobs
    // =========================================================================

    event.create('kubejs:rift_core')
        .displayName('Rift Core')
        .tooltip('§5A solidified nexus of dimensional energy')
        .tooltip('§7Dropped by Floor 25+ guardians in the Rift')
        .tooltip('§8Ultimate Mythic crafting material')
        .maxStackSize(16)
        .rarity('epic')

    event.create('kubejs:primordial_essence')
        .displayName('Primordial Essence')
        .tooltip('§5Concentrated energy from before creation')
        .tooltip('§7Dropped by Floor 15+ guardians in the Rift')
        .tooltip('§8Used for Mythic III+ infusion and reforging')
        .maxStackSize(64)
        .rarity('epic')

    event.create('kubejs:rift_gem')
        .displayName('Rift Gem')
        .tooltip('§dA gem crystallized from pure Rift energy')
        .tooltip('§7Dropped by Floor 10+ guardians (30% chance)')
        .tooltip('§8Best-in-slot Apotheosis socket gem')
        .maxStackSize(16)
        .rarity('epic')

    event.create('kubejs:rift_blueprint')
        .displayName('Rift Blueprint')
        .tooltip('§dAncient schematics from the deepest Rift floors')
        .tooltip('§7Dropped by Floor 20+ guardians (10% chance)')
        .tooltip('§8Unlocks unique Mythic crafting recipes')
        .maxStackSize(1)
        .rarity('epic')

    // =========================================================================
    // MYTHIC FORGE CRAFTING STATION
    // The endgame workbench for all Mythic enhancements
    // =========================================================================

    event.create('kubejs:mythic_forge')
        .displayName('Mythic Forge')
        .tooltip('§5An ancient forge resonating with Rift energy')
        .tooltip('§7Place in a crafting grid with Rift materials')
        .tooltip('§7to create Mythic-tier enhancements')
        .tooltip('§8Crafted from Rift materials + Mekanism components')
        .maxStackSize(1)
        .rarity('epic')

    // =========================================================================
    // MYTHIC INFUSION CATALYSTS
    // Tiered catalysts that represent each Mythic enhancement level
    // Used as recipe intermediates — craft catalyst, then apply to gear
    // =========================================================================

    event.create('kubejs:mythic_catalyst_1')
        .displayName('Mythic Catalyst I')
        .tooltip('§dInfuses gear with Mythic I enhancement')
        .tooltip('§7+3% effectiveness')
        .tooltip('§8Apply to any T4 weapon or armor piece')
        .maxStackSize(1)
        .rarity('epic')

    event.create('kubejs:mythic_catalyst_2')
        .displayName('Mythic Catalyst II')
        .tooltip('§dInfuses gear with Mythic II enhancement')
        .tooltip('§7+3% effectiveness (6% cumulative)')
        .tooltip('§8Apply to any T4 weapon or armor piece')
        .maxStackSize(1)
        .rarity('epic')

    event.create('kubejs:mythic_catalyst_3')
        .displayName('Mythic Catalyst III')
        .tooltip('§dInfuses gear with Mythic III enhancement')
        .tooltip('§7+2% effectiveness (8% cumulative)')
        .tooltip('§8Apply to any T4 weapon or armor piece')
        .maxStackSize(1)
        .rarity('epic')

    event.create('kubejs:mythic_catalyst_4')
        .displayName('Mythic Catalyst IV')
        .tooltip('§dInfuses gear with Mythic IV enhancement')
        .tooltip('§7+2% effectiveness (10% cumulative)')
        .tooltip('§8Apply to any T4 weapon or armor piece')
        .maxStackSize(1)
        .rarity('epic')

    event.create('kubejs:mythic_catalyst_5')
        .displayName('Mythic Catalyst V')
        .tooltip('§dInfuses gear with Mythic V enhancement')
        .tooltip('§7+2% effectiveness (12% cumulative)')
        .tooltip('§8Apply to any T4 weapon or armor piece')
        .maxStackSize(1)
        .rarity('epic')

    // =========================================================================
    // VOID COFFER — Rift banking item
    // Used between floors to bank items safely
    // =========================================================================

    event.create('kubejs:void_coffer')
        .displayName('Void Coffer')
        .tooltip('§8A container woven from Rift fabric')
        .tooltip('§7Use between Rift floors to bank items safely')
        .tooltip('§7Banked items survive death in the Rift')
        .maxStackSize(1)
        .rarity('rare')

    // =========================================================================
    // REFORGE TOKEN — used for Mythic Reforging (affix reroll)
    // =========================================================================

    event.create('kubejs:mythic_reforge_token')
        .displayName('Mythic Reforge Token')
        .tooltip('§dReroll a single affix on a piece of gear')
        .tooltip('§7Rerolled affix guaranteed same rarity or higher')
        .tooltip('§8Cost: 3 Primordial Essences + 15 levels')
        .maxStackSize(16)
        .rarity('epic')

    // =========================================================================
    // MekaSuit Mk2 — Ultimate Armor Set (Ad Astra Integration)
    // The convergence of tech and magic — MekaSuit + Aethersteel + Glacio + Rift
    // CAN receive Apotheosis affixes, custom enchantments, and socket gems
    // =========================================================================

    event.create('kubejs:mekasuit_mk2_helmet')
        .displayName('MekaSuit Mk2 Helmet')
        .tooltip('§5The ultimate protective headgear')
        .tooltip('§7Combines MekaSuit technology with Aethersteel reinforcement')
        .tooltip('§aAccepts Apotheosis affixes, enchantments, and socket gems')
        .tooltip('§8Crafted from MekaSuit + Aethersteel + Glacio materials + Primordial Essence')
        .maxStackSize(1)
        .rarity('epic')

    event.create('kubejs:mekasuit_mk2_chestplate')
        .displayName('MekaSuit Mk2 Chestplate')
        .tooltip('§5The ultimate protective chestpiece')
        .tooltip('§7Combines MekaSuit technology with Aethersteel reinforcement')
        .tooltip('§aAccepts Apotheosis affixes, enchantments, and socket gems')
        .tooltip('§8Crafted from MekaSuit + Aethersteel + Glacio materials + Primordial Essence')
        .maxStackSize(1)
        .rarity('epic')

    event.create('kubejs:mekasuit_mk2_leggings')
        .displayName('MekaSuit Mk2 Leggings')
        .tooltip('§5The ultimate protective leg armor')
        .tooltip('§7Combines MekaSuit technology with Aethersteel reinforcement')
        .tooltip('§aAccepts Apotheosis affixes, enchantments, and socket gems')
        .tooltip('§8Crafted from MekaSuit + Aethersteel + Glacio materials + Primordial Essence')
        .maxStackSize(1)
        .rarity('epic')

    event.create('kubejs:mekasuit_mk2_boots')
        .displayName('MekaSuit Mk2 Boots')
        .tooltip('§5The ultimate protective footwear')
        .tooltip('§7Combines MekaSuit technology with Aethersteel reinforcement')
        .tooltip('§aAccepts Apotheosis affixes, enchantments, and socket gems')
        .tooltip('§8Crafted from MekaSuit + Aethersteel + Glacio materials + Primordial Essence')
        .maxStackSize(1)
        .rarity('epic')

    // =========================================================================
    // PLANETARY EXTRACTED ELEMENTS
    // Obtained by crushing planet stones in Create Crushing Wheels or Thermal Pulverizer
    // =========================================================================

    // ── Moon Extraction ──
    event.create('kubejs:helium_3')
        .displayName('Helium-3 Isotope')
        .tooltip('§bA rare fusion fuel isotope')
        .tooltip('§7Extracted from Moon Stone via crushing')
        .tooltip('§8Used in advanced energy systems')
        .maxStackSize(64)
        .rarity('uncommon')

    event.create('kubejs:titanium_dust')
        .displayName('Titanium Dust')
        .tooltip('§bLightweight ultra-strong metal dust')
        .tooltip('§7Extracted from Moon Stone via crushing')
        .tooltip('§8Used in advanced alloy crafting')
        .maxStackSize(64)
        .rarity('uncommon')

    // ── Mars Extraction ──
    event.create('kubejs:ferric_oxide')
        .displayName('Ferric Oxide')
        .tooltip('§cConcentrated Martian iron compound')
        .tooltip('§7Extracted from Mars Stone via crushing')
        .tooltip('§8Used in heat-resistant materials')
        .maxStackSize(64)
        .rarity('uncommon')

    event.create('kubejs:cryogenic_crystal')
        .displayName('Cryogenic Crystal')
        .tooltip('§bA crystal formed in extreme cold')
        .tooltip('§7Extracted from Mars Stone via crushing')
        .tooltip('§8Used in cold-resistant technology')
        .maxStackSize(64)
        .rarity('rare')

    // ── Mercury Extraction ──
    event.create('kubejs:solar_crystal')
        .displayName('Solar Crystal')
        .tooltip('§eCrystallized solar energy')
        .tooltip('§7Extracted from Mercury Stone via crushing')
        .tooltip('§8Used in stellar-grade components')
        .maxStackSize(64)
        .rarity('rare')

    event.create('kubejs:rare_earth_dust')
        .displayName('Rare Earth Dust')
        .tooltip('§eFinely ground rare earth elements')
        .tooltip('§7Extracted from Mercury Stone via crushing')
        .tooltip('§8Used in high-tech crafting')
        .maxStackSize(64)
        .rarity('uncommon')

    // ── Venus Extraction ──
    event.create('kubejs:sulfuric_compound')
        .displayName('Sulfuric Compound')
        .tooltip('§6Concentrated sulfuric material')
        .tooltip('§7Extracted from Venus Stone via crushing')
        .tooltip('§8Used in corrosion-resistant alloys')
        .maxStackSize(64)
        .rarity('uncommon')

    event.create('kubejs:pressure_crystal')
        .displayName('Pressure Crystal')
        .tooltip('§6A crystal formed under immense pressure')
        .tooltip('§7Extracted from Venus Stone via crushing')
        .tooltip('§8Used in pressure-resistant technology')
        .maxStackSize(64)
        .rarity('rare')

    // ── Glacio Extraction ──
    event.create('kubejs:alien_isotope')
        .displayName('Alien Isotope')
        .tooltip('§dAn isotope of unknown origin')
        .tooltip('§7Extracted from Glacio Stone via crushing')
        .tooltip('§8Used in alien-tech integration')
        .maxStackSize(64)
        .rarity('rare')

    event.create('kubejs:cryogenic_element')
        .displayName('Cryogenic Element')
        .tooltip('§dAn element stable only at extreme cold')
        .tooltip('§7Extracted from Glacio Stone via crushing')
        .tooltip('§8Used in cryo-fusion technology')
        .maxStackSize(64)
        .rarity('rare')

})
