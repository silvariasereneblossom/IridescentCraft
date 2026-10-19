// =============================================================================
// ENDGAME ITEM REGISTRATION — Oblivion's Rift & Mythic Gear System
// Place in: kubejs/startup_scripts/endgame_items.js
// Must be in startup_scripts/ (requires game restart to apply)
//
// Design Doc: Part II — Oblivion's Rift (Loop 1), Mythic Gear Chase (Loop 2)
//
// NOTE: The following items are already registered in custom_items.js:
//   kubejs:icraft_rift_shard, kubejs:void_fragment, kubejs:rift_keystone
//   (kubejs:rift_shard remains as a deprecated alias for migration; see
//   kubejs/server_scripts/migrations/rift_shard_rename.js)
// Do NOT duplicate them here.
// =============================================================================

StartupEvents.registry('item', icraft.guard('endgame_items', 'StartupEvents.registry', event => {

    // =========================================================================
    // RIFT-EXCLUSIVE DROP MATERIALS
    // Obtained only inside Oblivion's Rift from floor guardians and mobs
    // =========================================================================

    icraft.section('endgame_items/rift-exclusive-drop-materials', function () {
    event.create('kubejs:rift_core')
        .displayName('Rift Core')
        .tooltip('§5A solidified nexus of dimensional energy')
        .tooltip('§7The Ancient Remnant drops one 5% of the time')
        .tooltip('§8Goes into a Mythic Catalyst V')
        .maxStackSize(16)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/nether_star' })
        .color(0, 0x9933CC)

    event.create('kubejs:primordial_essence')
        .displayName('Primordial Essence')
        .tooltip('§5Concentrated energy from before creation')
        .tooltip('§7A chance drop of the Ender Dragon, the Gaia Guardian,')
        .tooltip('§7the Ancient Remnant and the Ender Guardian')
        .tooltip('§8Goes into Mythic Catalysts III to V, the tier 4 rocket and the MekaSuit Mk2')
        .maxStackSize(64)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/blaze_powder' })
        .color(0, 0x220033)

    event.create('kubejs:rift_blueprint')
        .displayName('Rift Blueprint')
        .tooltip('§dAncient schematics from the deepest Rift floors')
        .tooltip("§7Not in the game yet: the floors of Oblivion's Rift")
        .tooltip('§7are to drop it, and the Rift is designed, not built')
        .maxStackSize(1)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/map' })
        .color(0, 0xBB66FF)
    })

    // =========================================================================
    // MYTHIC FORGE CRAFTING STATION
    // The endgame workbench for all Mythic enhancements
    // =========================================================================

    icraft.section('endgame_items/mythic-forge-crafting-station', function () {
    event.create('kubejs:mythic_forge')
        .displayName('Mythic Forge')
        .tooltip('§5An ancient forge resonating with Rift energy')
        .tooltip('§7Goes into a crafting grid with Rift materials')
        .tooltip('§7to make a Mythic Catalyst')
        .tooltip('§8It stays in the grid: one Forge makes every catalyst')
        .maxStackSize(1)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/iron_ingot' })
        .color(0, 0x660099)
    })

    // =========================================================================
    // MYTHIC INFUSION CATALYSTS
    // Tiered catalysts that represent each Mythic enhancement level
    // Used as recipe intermediates — craft catalyst, then apply to gear
    // =========================================================================

    icraft.section('endgame_items/mythic-infusion-catalysts', function () {
    event.create('kubejs:mythic_catalyst_1')
        .displayName('Mythic Catalyst I')
        .tooltip('§dMythic Catalyst, level I')
        .tooltip('§7Mythic infusion is not in the game yet,')
        .tooltip('§7so a catalyst cannot be put on gear')
        .maxStackSize(1)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/diamond' })
        .color(0, 0xCC88FF)

    event.create('kubejs:mythic_catalyst_2')
        .displayName('Mythic Catalyst II')
        .tooltip('§dMythic Catalyst, level II')
        .tooltip('§7Mythic infusion is not in the game yet,')
        .tooltip('§7so a catalyst cannot be put on gear')
        .maxStackSize(1)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/diamond' })
        .color(0, 0xBB66FF)

    event.create('kubejs:mythic_catalyst_3')
        .displayName('Mythic Catalyst III')
        .tooltip('§dMythic Catalyst, level III')
        .tooltip('§7Mythic infusion is not in the game yet,')
        .tooltip('§7so a catalyst cannot be put on gear')
        .maxStackSize(1)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/diamond' })
        .color(0, 0xAA44FF)

    event.create('kubejs:mythic_catalyst_4')
        .displayName('Mythic Catalyst IV')
        .tooltip('§dMythic Catalyst, level IV')
        .tooltip('§7Mythic infusion is not in the game yet,')
        .tooltip('§7so a catalyst cannot be put on gear')
        .maxStackSize(1)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/diamond' })
        .color(0, 0x9922FF)

    event.create('kubejs:mythic_catalyst_5')
        .displayName('Mythic Catalyst V')
        .tooltip('§dMythic Catalyst, level V')
        .tooltip('§7Mythic infusion is not in the game yet,')
        .tooltip('§7so a catalyst cannot be put on gear')
        .tooltip('§8The Engineering capstone quest asks for one')
        .maxStackSize(1)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/diamond' })
        .color(0, 0x8800FF)
    })

    // =========================================================================
    // VOID COFFER — Rift banking item
    // Used between floors to bank items safely
    // =========================================================================

    icraft.section('endgame_items/void-coffer-rift-banking-item', function () {
    event.create('kubejs:void_coffer')
        .displayName('Void Coffer')
        .tooltip('§8A container woven from Rift fabric')
        .tooltip('§7Does nothing yet: it is meant to bank items')
        .tooltip("§7between the floors of Oblivion's Rift, which is not built")
        .maxStackSize(1)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/ender_pearl' })
        .color(0, 0x220044)
    })

    // =========================================================================
    // REFORGE TOKEN — used for Mythic Reforging (affix reroll)
    // =========================================================================

    icraft.section('endgame_items/reforge-token-used-for-mythic-reforging', function () {
    event.create('kubejs:mythic_reforge_token')
        .displayName('Mythic Reforge Token')
        .tooltip('§7Does nothing yet: Mythic reforging')
        .tooltip("§7comes with Oblivion's Rift, which is not built")
        .maxStackSize(16)
        .rarity('epic')
        .textureJson({ layer0: 'minecraft:item/iron_ingot' })
        .color(0, 0xDD55FF)
    })

    // =========================================================================
    // MekaSuit Mk2 — RETIRED SHELL ITEMS [2026-06-06 MK2B]
    // The 4 kubejs:mekasuit_mk2_* shell items were RETIRED on 2026-06-06 per the
    // operator-approved Mk2 redesign. The Mk2 is now the REAL mekanism:mekasuit_*
    // piece carrying an icraft NBT marker (icraft_mekasuit_mk2:1b), so native
    // modules/energy/enchants/affixes all survive the upgrade. There is no longer
    // a separate shell item.
    //   - In-place upgrade recipe: kubejs/server_scripts/recipes/ad_astra_gating.js
    //       SECTION G  (event.shaped(... mekanism piece ...).modifyResult(...))
    //   - Pinnacle stat layer:    kubejs/startup_scripts/mekasuit_mk2_stats.js
    //       (ItemAttributeRegistry, gated on the item + NBT marker)
    //   - Tooltip:                kubejs/client_scripts/mekasuit_mk2_tooltip.js
    // Scoping note: both alpha testers are mage-only with zero Mekanism NBT, so
    // no live inventory owned a shell item -- safe to remove outright.
    // =========================================================================

    // =========================================================================
    // PLANETARY EXTRACTED ELEMENTS
    // Obtained by crushing planet stones in Create Crushing Wheels or Thermal Pulverizer
    // =========================================================================

    // ── Moon Extraction ──
    icraft.section('endgame_items/moon-extraction', function () {
    event.create('kubejs:helium_3')
        .displayName('Helium-3 Isotope')
        .tooltip('§bA rare fusion fuel isotope')
        .tooltip('§7Extracted from Moon Stone via crushing')
        .tooltip('§8Used in advanced energy systems')
        .maxStackSize(64)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0x66DDFF)

    event.create('kubejs:titanium_dust')
        .displayName('Titanium Dust')
        .tooltip('§bLightweight ultra-strong metal dust')
        .tooltip('§7Extracted from Moon Stone via crushing')
        .tooltip('§8Used in advanced alloy crafting')
        .maxStackSize(64)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/glowstone_dust' })
        .color(0, 0xAAAAAA)
    })

    // ── Mars Extraction ──
    icraft.section('endgame_items/mars-extraction', function () {
    event.create('kubejs:ferric_oxide')
        .displayName('Ferric Oxide')
        .tooltip('§cConcentrated Martian iron compound')
        .tooltip('§7Extracted from Mars Stone via crushing')
        .tooltip('§8Used in heat-resistant materials')
        .maxStackSize(64)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/redstone' })
        .color(0, 0xAA3300)

    event.create('kubejs:cryogenic_crystal')
        .displayName('Cryogenic Crystal')
        .tooltip('§bA crystal formed in extreme cold')
        .tooltip('§7Extracted from Mars Stone via crushing')
        .tooltip('§8Used in cold-resistant technology')
        .maxStackSize(64)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0x88DDFF)
    })

    // ── Mercury Extraction ──
    icraft.section('endgame_items/mercury-extraction', function () {
    event.create('kubejs:solar_crystal')
        .displayName('Solar Crystal')
        .tooltip('§eCrystallized solar energy')
        .tooltip('§7Extracted from Mercury Stone via crushing')
        .tooltip('§8Used in stellar-grade components')
        .maxStackSize(64)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0xFFDD33)

    event.create('kubejs:rare_earth_dust')
        .displayName('Rare Earth Dust')
        .tooltip('§eFinely ground rare earth elements')
        .tooltip('§7Extracted from Mercury Stone via crushing')
        .tooltip('§8Used in high-tech crafting')
        .maxStackSize(64)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/glowstone_dust' })
        .color(0, 0x999999)
    })

    // ── Venus Extraction ──
    icraft.section('endgame_items/venus-extraction', function () {
    event.create('kubejs:sulfuric_compound')
        .displayName('Sulfuric Compound')
        .tooltip('§6Concentrated sulfuric material')
        .tooltip('§7Extracted from Venus Stone via crushing')
        .tooltip('§8Used in corrosion-resistant alloys')
        .maxStackSize(64)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/glowstone_dust' })
        .color(0, 0xAACC00)

    event.create('kubejs:pressure_crystal')
        .displayName('Pressure Crystal')
        .tooltip('§6A crystal formed under immense pressure')
        .tooltip('§7Extracted from Venus Stone via crushing')
        .tooltip('§8Used in pressure-resistant technology')
        .maxStackSize(64)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0xCC0000)
    })

    // ── Glacio Extraction ──
    icraft.section('endgame_items/glacio-extraction', function () {
    event.create('kubejs:alien_isotope')
        .displayName('Alien Isotope')
        .tooltip('§dAn isotope of unknown origin')
        .tooltip('§7Extracted from Glacio Stone via crushing')
        .tooltip('§8Used in alien-tech integration')
        .maxStackSize(64)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0x33FF99)

    event.create('kubejs:cryogenic_element')
        .displayName('Cryogenic Element')
        .tooltip('§dAn element stable only at extreme cold')
        .tooltip('§7Extracted from Glacio Stone via crushing')
        .tooltip('§8Used in cryo-fusion technology')
        .maxStackSize(64)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/amethyst_shard' })
        .color(0, 0x66CCFF)
    })

}))
