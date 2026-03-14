// =============================================================================
// LOOT DISCOVERY SCRIPT v2 — Run once, read logs, then DELETE
// Dumps all registered loot tables, boss entity IDs, and mod namespaces
// directly through KubeJS + Forge registries. Does NOT require LootJS.
//
// HOW TO USE:
// 1. Drop this file into kubejs/server_scripts/loot/
// 2. Boot the game, join a world
// 3. Run: /reload (if already in-game)
// 4. The dump runs on player login. Check logs for [DISCOVERY] lines.
// 5. Copy the relevant output, then DELETE this script.
//
// Chat commands:
//   "!dump loot"     — re-dump all loot tables
//   "!dump entities" — re-dump all entity types
//   "!dump mods"     — re-dump all loaded mod IDs
//   "!dump items"    — re-dump Simply Swords items
//   "!dump all"      — re-dump everything
// =============================================================================

PlayerEvents.loggedIn(event => {
    let player = event.player

    player.tell(Component.literal('§e[Discovery v2] §fStarting full discovery dump...'))
    player.tell(Component.literal('§e[Discovery v2] §fCheck kubejs/logs/latest.log for [DISCOVERY] lines.'))
    player.tell(Component.literal('§e[Discovery v2] §7Chat commands: !dump loot | !dump entities | !dump mods | !dump items | !dump all'))

    dumpAll(player)
})

// Chat command triggers
PlayerEvents.chat(event => {
    let msg = event.message.trim().toLowerCase()
    let player = event.player

    if (msg === '!dump loot') {
        event.cancel()
        dumpLootTables(player)
        player.tell(Component.literal('§a[Discovery] §fLoot table dump complete. Check logs.'))
    }
    else if (msg === '!dump entities') {
        event.cancel()
        dumpEntityTypes(player)
        player.tell(Component.literal('§a[Discovery] §fEntity type dump complete. Check logs.'))
    }
    else if (msg === '!dump mods') {
        event.cancel()
        dumpMods(player)
        player.tell(Component.literal('§a[Discovery] §fMod ID dump complete. Check logs.'))
    }
    else if (msg === '!dump items') {
        event.cancel()
        dumpSimplySwordsItems(player)
        player.tell(Component.literal('§a[Discovery] §fItem dump complete. Check logs.'))
    }
    else if (msg === '!dump all') {
        event.cancel()
        dumpAll(player)
        player.tell(Component.literal('§a[Discovery] §fFull dump complete. Check logs.'))
    }
})

function dumpAll(player) {
    dumpMods(player)
    dumpLootTables(player)
    dumpEntityTypes(player)
    dumpSimplySwordsItems(player)
    dumpSummary(player)
}

// =============================================================================
// DUMP ALL LOADED MOD IDS
// =============================================================================
function dumpMods(player) {
    console.log('[DISCOVERY] ==========================================================')
    console.log('[DISCOVERY] LOADED MOD IDS')
    console.log('[DISCOVERY] ==========================================================')

    let targetMods = [
        // Structure mods
        'when_dungeons_arise', 'dungeons_arise',
        'betterdungeons', 'betterstrongholds', 'betterfortresses',
        'betterendisland', 'bettermineshafts', 'betteroceanmonuments',
        'repurposed_structures', 'integrated_stronghold', 'integrated_dungeons',
        'dungeon_crawl', 'valhelsia_structures', 'explorations',
        'ctov',
        // Dimension mods
        'twilightforest', 'blue_skies', 'aether', 'deep_aether',
        'undergarden', 'deeperdarker', 'theabyss', 'the_abyss',
        // Boss/combat mods
        'cataclysm', 'champions', 'simplyswords', 'apotheosis',
        'progressivebosses', 'improvedmobs', 'scalingmobs',
        // Magic/tech
        'botania', 'ars_nouveau', 'occultism', 'forbidden_arcanus',
        'mahoutsukai', 'thermal', 'mekanism', 'create',
        'industrialforegoing', 'refinedstorage',
        // Loot/utility
        'lootr', 'lootintegrations', 'loot_integrations',
        // Core
        'kubejs', 'lootjs', 'astages', 'ftbquests',
        'puffish_skills', 'pufferskills',
    ]

    let found = []
    let notFound = []

    targetMods.forEach(modId => {
        try {
            if (Platform.isLoaded(modId)) {
                found.push(modId)
                console.log('[DISCOVERY] MOD LOADED: ' + modId)
            } else {
                notFound.push(modId)
            }
        } catch(e) {
            notFound.push(modId)
        }
    })

    console.log('[DISCOVERY] ----------------------------------------------------------')
    console.log('[DISCOVERY] Target mods LOADED: ' + found.length)
    console.log('[DISCOVERY] Target mods NOT FOUND: ' + notFound.length)
    if (notFound.length > 0) {
        console.log('[DISCOVERY] Missing: ' + notFound.join(', '))
    }
    console.log('[DISCOVERY] ----------------------------------------------------------')
}

// =============================================================================
// DUMP ALL LOOT TABLES — Direct registry query, no LootJS needed
// =============================================================================
function dumpLootTables(player) {
    console.log('[DISCOVERY] ==========================================================')
    console.log('[DISCOVERY] ALL REGISTERED LOOT TABLES (direct registry query)')
    console.log('[DISCOVERY] ==========================================================')

    try {
        let server = Utils.getServer()
        if (!server) {
            console.log('[DISCOVERY] ERROR: Server not available')
            return
        }

        // Method 1: Try reflection on LootDataManager to get all table keys
        console.log('[DISCOVERY] Attempting reflection on LootDataManager...')
        
        try {
            let manager = server.getLootData()
            let clazz = manager.getClass()
            console.log('[DISCOVERY] Manager class: ' + clazz.getName())
            
            let fields = clazz.getDeclaredFields()
            for (let i = 0; i < fields.length; i++) {
                let field = fields[i]
                field.setAccessible(true)
                let name = field.getName()
                let type = field.getType().getSimpleName()
                console.log('[DISCOVERY]   Field: ' + name + ' (' + type + ')')
                
                if (type === 'Map' || type === 'HashMap' || type === 'ImmutableMap' || type.indexOf('Map') !== -1) {
                    try {
                        let map = field.get(manager)
                        if (map && map.keySet) {
                            let keys = map.keySet().toArray()
                            console.log('[DISCOVERY]   Map "' + name + '" has ' + keys.length + ' entries')
                            
                            for (let j = 0; j < keys.length; j++) {
                                let key = keys[j]
                                // Keys might be ResourceLocations or compound keys
                                let keyStr = '' + key
                                
                                // If this is a nested map (LootDataType -> Map<ResourceLocation, ?>)
                                if (map.get(key) && map.get(key).keySet) {
                                    let innerMap = map.get(key)
                                    let innerKeys = innerMap.keySet().toArray()
                                    console.log('[DISCOVERY]   Sub-map "' + keyStr + '" has ' + innerKeys.length + ' entries')
                                    for (let k = 0; k < innerKeys.length; k++) {
                                        console.log('[DISCOVERY]     TABLE: ' + innerKeys[k])
                                    }
                                } else {
                                    console.log('[DISCOVERY]     ENTRY: ' + keyStr)
                                }
                            }
                        }
                    } catch(e3) {
                        console.log('[DISCOVERY]   Could not read field "' + name + '": ' + e3)
                    }
                }
            }
        } catch(e2) {
            console.log('[DISCOVERY] Reflection failed: ' + e2)
        }

        // Method 2: Brute-force check known loot table patterns
        console.log('[DISCOVERY]')
        console.log('[DISCOVERY] ==========================================================')
        console.log('[DISCOVERY] BRUTE-FORCE LOOT TABLE VERIFICATION')
        console.log('[DISCOVERY] ==========================================================')
        
        let tablePatterns = buildLootTableList()
        let existingTables = []
        let missingTables = []

        tablePatterns.forEach(tableId => {
            try {
                let parts = tableId.split(':')
                let namespace = parts[0]
                
                if (namespace !== 'minecraft') {
                    try {
                        if (!Platform.isLoaded(namespace)) return
                    } catch(e) { return }
                }

                let resLoc = new ResourceLocation(tableId)
                let table = server.getLootData().getLootTable(resLoc)
                let tableStr = '' + table

                // Non-empty tables won't match empty patterns
                if (table && tableStr.indexOf('LootTable') !== -1 && tableStr.indexOf('type=minecraft:empty') === -1) {
                    existingTables.push(tableId)
                    console.log('[DISCOVERY] TABLE EXISTS: ' + tableId)
                } else if (table && tableStr !== 'null') {
                    // Some tables exist but toString is ambiguous — log for review
                    console.log('[DISCOVERY] TABLE MAYBE: ' + tableId + ' — ' + tableStr.substring(0, 100))
                } else {
                    missingTables.push(tableId)
                }
            } catch(e) {
                missingTables.push(tableId + ' (error)')
            }
        })

        console.log('[DISCOVERY] ----------------------------------------------------------')
        console.log('[DISCOVERY] Verified loot tables: ' + existingTables.length)
        console.log('[DISCOVERY] Missing/empty: ' + missingTables.length)
        console.log('[DISCOVERY] ----------------------------------------------------------')

    } catch(e) {
        console.log('[DISCOVERY] Loot table dump failed: ' + e)
        console.log('[DISCOVERY] Stack: ' + e.stack)
    }
}

// Build comprehensive list of loot table IDs to check
function buildLootTableList() {
    let tables = []
    
    // VANILLA
    let vanillaChests = [
        'abandoned_mineshaft', 'bastion_bridge', 'bastion_hoglin_stable',
        'bastion_other', 'bastion_treasure', 'buried_treasure',
        'desert_pyramid', 'end_city_treasure', 'igloo_chest',
        'jungle_temple', 'jungle_temple_dispenser', 'nether_bridge',
        'pillager_outpost', 'shipwreck_map', 'shipwreck_supply',
        'shipwreck_treasure', 'simple_dungeon', 'spawn_bonus_chest',
        'stronghold_corridor', 'stronghold_crossing', 'stronghold_library',
        'underwater_ruin_big', 'underwater_ruin_small',
        'village/village_armorer', 'village/village_butcher',
        'village/village_cartographer', 'village/village_desert_house',
        'village/village_fisher', 'village/village_fletcher',
        'village/village_mason', 'village/village_plains_house',
        'village/village_savanna_house', 'village/village_shepherd',
        'village/village_snowy_house', 'village/village_taiga_house',
        'village/village_tannery', 'village/village_temple',
        'village/village_toolsmith', 'village/village_weaponsmith',
        'woodland_mansion', 'ancient_city', 'ancient_city_ice_box',
    ]
    vanillaChests.forEach(c => tables.push('minecraft:chests/' + c))

    tables.push('minecraft:gameplay/fishing')
    tables.push('minecraft:gameplay/fishing/fish')
    tables.push('minecraft:gameplay/fishing/junk')
    tables.push('minecraft:gameplay/fishing/treasure')

    let vanillaEntities = [
        'blaze', 'creeper', 'drowned', 'elder_guardian', 'ender_dragon',
        'enderman', 'endermite', 'evoker', 'ghast', 'guardian',
        'hoglin', 'husk', 'magma_cube', 'phantom', 'piglin',
        'piglin_brute', 'pillager', 'ravager', 'shulker', 'skeleton',
        'slime', 'spider', 'stray', 'vex', 'vindicator', 'warden',
        'witch', 'wither', 'wither_skeleton', 'zombie',
        'zombie_villager', 'zombified_piglin',
    ]
    vanillaEntities.forEach(e => tables.push('minecraft:entities/' + e))

    // TWILIGHT FOREST
    let tfBosses = [
        'naga', 'lich', 'hydra', 'ur_ghast', 'knight_phantom',
        'snow_queen', 'minoshroom', 'alpha_yeti', 'quest_ram',
    ]
    tfBosses.forEach(e => tables.push('twilightforest:entities/' + e))

    let tfChests = [
        'aurora_cache', 'aurora_room', 'darktower_cache',
        'darktower_key', 'darktower_boss', 'hedge_maze',
        'hill_1', 'hill_2', 'hill_3', 'keep',
        'labyrinth_dead_end', 'labyrinth_room', 'labyrinth_vault',
        'loot_well', 'quest_grove', 'small_hollow_log',
        'stronghold_boss', 'stronghold_cache', 'stronghold_room',
        'tower_library', 'tower_room', 'tree_cache',
        'useless', 'graveyard',
    ]
    tfChests.forEach(c => tables.push('twilightforest:chests/' + c))

    // BLUE SKIES
    let bsBosses = [
        'summoner', 'alchemist', 'starlit_crusher', 'arachnarch',
        'the_summoner', 'the_alchemist', 'the_starlit_crusher',
    ]
    bsBosses.forEach(e => tables.push('blue_skies:entities/' + e))

    let bsChests = [
        'blinding_dungeon', 'nature_dungeon', 'poison_dungeon',
        'everdawn_chest', 'everbright_chest',
    ]
    bsChests.forEach(c => tables.push('blue_skies:chests/' + c))

    // AETHER
    let aeBosses = ['slider', 'valkyrie_queen', 'sun_spirit', 'the_slider']
    aeBosses.forEach(e => tables.push('aether:entities/' + e))

    let aeChests = [
        'bronze_dungeon', 'bronze_dungeon_reward',
        'silver_dungeon', 'silver_dungeon_reward',
        'gold_dungeon', 'gold_dungeon_reward',
    ]
    aeChests.forEach(c => tables.push('aether:chests/' + c))

    // DEEP AETHER
    let daChests = ['brass_dungeon', 'brass_dungeon_reward']
    daChests.forEach(c => tables.push('deep_aether:chests/' + c))

    // UNDERGARDEN
    let ugBosses = ['forgotten_guardian', 'stygian', 'rotbeast', 'nargoyle', 'muncher']
    ugBosses.forEach(e => tables.push('undergarden:entities/' + e))

    let ugChests = ['catacombs', 'catacombs_urn']
    ugChests.forEach(c => tables.push('undergarden:chests/' + c))

    // DEEPER DARKER
    let ddBosses = ['stalker', 'shattered', 'shriek_worm', 'sculk_centipede', 'sculk_leech']
    ddBosses.forEach(e => tables.push('deeperdarker:entities/' + e))

    let ddChests = ['ancient_temple', 'ancient_temple_treasure']
    ddChests.forEach(c => tables.push('deeperdarker:chests/' + c))

    // CATACLYSM
    let catBosses = [
        'netherite_monstrosity', 'ignis', 'ender_guardian',
        'ancient_remnant', 'the_leviathan', 'leviathan',
        'the_harbinger', 'harbinger', 'maledictus',
        'ender_golem', 'ignited_revenant',
    ]
    catBosses.forEach(e => tables.push('cataclysm:entities/' + e))

    let catChests = [
        'soul_forge', 'burning_arena', 'sunken_city',
        'cursed_pyramid', 'ruined_citadel',
    ]
    catChests.forEach(c => tables.push('cataclysm:chests/' + c))

    // BOTANIA
    tables.push('botania:entities/doppleganger')
    tables.push('botania:entities/doppelganger')
    tables.push('botania:entities/gaia_guardian')

    // WHEN DUNGEONS ARISE (try both mod IDs)
    let wdaChests = [
        'aviary_tower', 'bandit_towers', 'bathhouse',
        'coliseum', 'ceryneian_hind', 'foundry',
        'illager_fort', 'illager_hall', 'infested_temple',
        'keep_kayra', 'lighthouse', 'monastery',
        'mushroom_house', 'mushroom_mine', 'mushroom_village',
        'plague_asylum', 'small_blimp', 'thornborn_towers',
        'trading_outpost', 'wishing_well',
    ]
    wdaChests.forEach(c => {
        tables.push('when_dungeons_arise:chests/' + c)
        tables.push('dungeons_arise:chests/' + c)
    })

    // YUNG'S MODS
    let yungBD = ['common', 'special', 'zombie_dungeon', 'skeleton_dungeon', 'spider_dungeon']
    yungBD.forEach(c => tables.push('betterdungeons:chests/' + c))

    let yungBS = ['library', 'corridor', 'crossing', 'portal_room', 'grand_library']
    yungBS.forEach(c => tables.push('betterstrongholds:chests/' + c))

    let yungBF = ['common', 'special', 'blaze_spawner']
    yungBF.forEach(c => tables.push('betterfortresses:chests/' + c))

    let yungBE = ['common', 'treasure']
    yungBE.forEach(c => tables.push('betterendisland:chests/' + c))

    // REPURPOSED STRUCTURES
    let rsChests = [
        'dungeons/badlands', 'dungeons/dark_forest', 'dungeons/deep',
        'dungeons/desert', 'dungeons/end', 'dungeons/icy',
        'dungeons/jungle', 'dungeons/mushroom', 'dungeons/nether',
        'dungeons/ocean', 'dungeons/swamp',
    ]
    rsChests.forEach(c => tables.push('repurposed_structures:chests/' + c))

    return tables
}

// =============================================================================
// DUMP ENTITY TYPES — Boss-like entities + full mod namespace enumeration
// =============================================================================
function dumpEntityTypes(player) {
    console.log('[DISCOVERY] ==========================================================')
    console.log('[DISCOVERY] ENTITY TYPE DISCOVERY')
    console.log('[DISCOVERY] ==========================================================')

    let bossEntities = [
        // Twilight Forest
        'twilightforest:naga', 'twilightforest:lich',
        'twilightforest:hydra', 'twilightforest:ur_ghast',
        'twilightforest:knight_phantom', 'twilightforest:snow_queen',
        'twilightforest:minoshroom', 'twilightforest:alpha_yeti',
        'twilightforest:quest_ram', 'twilightforest:yeti_alpha',
        'twilightforest:phantom_knight',

        // Blue Skies
        'blue_skies:summoner', 'blue_skies:starlit_crusher',
        'blue_skies:alchemist', 'blue_skies:arachnarch',
        'blue_skies:the_starlit_crusher', 'blue_skies:the_summoner',
        'blue_skies:the_alchemist',

        // Aether
        'aether:slider', 'aether:valkyrie_queen',
        'aether:sun_spirit', 'aether:the_slider',

        // Deep Aether
        'deep_aether:eots', 'deep_aether:boss',
        'deep_aether:aether_boss',

        // Undergarden
        'undergarden:forgotten_guardian', 'undergarden:stygian',
        'undergarden:forgotten',

        // Deeper Darker
        'deeperdarker:stalker', 'deeperdarker:shattered',
        'deeperdarker:shriek_worm', 'deeperdarker:sculk_centipede',

        // Cataclysm
        'cataclysm:netherite_monstrosity', 'cataclysm:ignis',
        'cataclysm:ender_guardian', 'cataclysm:ancient_remnant',
        'cataclysm:the_leviathan', 'cataclysm:leviathan',
        'cataclysm:the_harbinger', 'cataclysm:harbinger',
        'cataclysm:maledictus', 'cataclysm:ender_golem',
        'cataclysm:ignited_revenant',

        // Botania
        'botania:doppleganger', 'botania:gaia_guardian',
        'botania:doppelganger',

        // Vanilla
        'minecraft:ender_dragon', 'minecraft:wither',
        'minecraft:warden', 'minecraft:elder_guardian',
        'minecraft:blaze', 'minecraft:wither_skeleton',
        'minecraft:enderman', 'minecraft:phantom',
    ]

    let existingBosses = []
    let missingBosses = []

    // Use Forge registry for reliable validation
    try {
        let registry = Java.loadClass('net.minecraftforge.registries.ForgeRegistries').ENTITY_TYPES

        bossEntities.forEach(entityId => {
            try {
                let parts = entityId.split(':')
                let namespace = parts[0]

                if (namespace !== 'minecraft') {
                    try {
                        if (!Platform.isLoaded(namespace)) {
                            missingBosses.push(entityId + ' (mod not loaded)')
                            return
                        }
                    } catch(e) { return }
                }

                let resLoc = new ResourceLocation(entityId)
                let entityType = registry.getValue(resLoc)

                if (entityType != null) {
                    let regName = registry.getKey(entityType)
                    if (regName != null && regName.toString() === entityId) {
                        existingBosses.push(entityId)
                        console.log('[DISCOVERY] ENTITY EXISTS: ' + entityId)
                    } else {
                        missingBosses.push(entityId + ' (fallback: ' + regName + ')')
                        console.log('[DISCOVERY] ENTITY MISSING (fallback to ' + regName + '): ' + entityId)
                    }
                } else {
                    missingBosses.push(entityId)
                    console.log('[DISCOVERY] ENTITY MISSING: ' + entityId)
                }
            } catch(e) {
                missingBosses.push(entityId + ' (error)')
                console.log('[DISCOVERY] ENTITY ERROR: ' + entityId + ' — ' + e)
            }
        })

        console.log('[DISCOVERY] ----------------------------------------------------------')
        console.log('[DISCOVERY] Verified entities: ' + existingBosses.length)
        console.log('[DISCOVERY] Missing/unverified: ' + missingBosses.length)
        console.log('[DISCOVERY] ----------------------------------------------------------')

        if (missingBosses.length > 0) {
            console.log('[DISCOVERY] MISSING ENTITIES:')
            missingBosses.forEach(e => console.log('[DISCOVERY]   ' + e))
        }

        // Dump ALL entities from key mod namespaces
        console.log('[DISCOVERY]')
        console.log('[DISCOVERY] ALL ENTITIES BY MOD NAMESPACE:')
        
        let modNamespaces = [
            'twilightforest', 'blue_skies', 'aether', 'deep_aether',
            'undergarden', 'deeperdarker', 'cataclysm', 'botania',
            'champions', 'simplyswords', 'ars_nouveau', 'occultism',
        ]

        let allKeys = registry.getKeys().toArray()
        
        modNamespaces.forEach(ns => {
            try {
                if (!Platform.isLoaded(ns)) return
            } catch(e) { return }
            
            console.log('[DISCOVERY] --- ' + ns + ' entities ---')
            let count = 0
            for (let i = 0; i < allKeys.length; i++) {
                let key = allKeys[i].toString()
                if (key.startsWith(ns + ':')) {
                    console.log('[DISCOVERY]   ' + key)
                    count++
                }
            }
            console.log('[DISCOVERY]   Total: ' + count)
        })

    } catch(e) {
        console.log('[DISCOVERY] Forge registry approach failed: ' + e)
        console.log('[DISCOVERY] Falling back to EntityType.of() checks...')
        
        // Fallback
        bossEntities.forEach(entityId => {
            try {
                let et = EntityType.of(entityId)
                if (et) {
                    console.log('[DISCOVERY] ENTITY EXISTS (fallback): ' + entityId)
                }
            } catch(e2) {
                console.log('[DISCOVERY] ENTITY UNVERIFIED: ' + entityId)
            }
        })
    }
}

// =============================================================================
// DUMP SIMPLY SWORDS — All registered items from namespace
// =============================================================================
function dumpSimplySwordsItems(player) {
    console.log('[DISCOVERY] ==========================================================')
    console.log('[DISCOVERY] SIMPLY SWORDS — ALL REGISTERED ITEMS')
    console.log('[DISCOVERY] ==========================================================')

    try {
        if (!Platform.isLoaded('simplyswords')) {
            console.log('[DISCOVERY] Simply Swords is NOT loaded.')
            return
        }

        let registry = Java.loadClass('net.minecraftforge.registries.ForgeRegistries').ITEMS
        let allKeys = registry.getKeys().toArray()
        
        let ssItems = []
        for (let i = 0; i < allKeys.length; i++) {
            let key = allKeys[i].toString()
            if (key.startsWith('simplyswords:')) {
                ssItems.push(key)
                console.log('[DISCOVERY] SS ITEM: ' + key)
            }
        }
        console.log('[DISCOVERY] ----------------------------------------------------------')
        console.log('[DISCOVERY] Total Simply Swords items: ' + ssItems.length)
        
        // Flag likely unique/special weapons
        let uniqueKeywords = [
            'unique', 'runic', 'watcher', 'ember', 'storm', 'molten',
            'slumbering', 'shadow', 'arcane', 'mjolnir', 'hearth',
            'frost', 'thunder', 'soul', 'tidal', 'brimstone', 'ice',
            'twisted', 'wicked', 'tempest', 'bramble', 'livyatan',
        ]
        
        console.log('[DISCOVERY] Likely unique weapons:')
        ssItems.forEach(item => {
            let lower = item.toLowerCase()
            for (let k = 0; k < uniqueKeywords.length; k++) {
                if (lower.indexOf(uniqueKeywords[k]) !== -1) {
                    console.log('[DISCOVERY]   UNIQUE? ' + item)
                    break
                }
            }
        })

    } catch(e) {
        console.log('[DISCOVERY] Simply Swords dump failed: ' + e)
    }
}

// =============================================================================
// SUMMARY
// =============================================================================
function dumpSummary(player) {
    console.log('[DISCOVERY] ==========================================================')
    console.log('[DISCOVERY] DISCOVERY v2 COMPLETE')
    console.log('[DISCOVERY] ==========================================================')
    console.log('[DISCOVERY]')
    console.log('[DISCOVERY] 1. Search latest.log for [DISCOVERY] lines')
    console.log('[DISCOVERY] 2. TABLE EXISTS = confirmed loot table we can modify')
    console.log('[DISCOVERY] 3. ENTITY EXISTS = confirmed entity ID for boss drops')
    console.log('[DISCOVERY] 4. SS ITEM = confirmed Simply Swords item ID')
    console.log('[DISCOVERY] 5. "ALL ENTITIES BY MOD NAMESPACE" = correct boss IDs')
    console.log('[DISCOVERY] 6. Paste the [DISCOVERY] block back to me')
    console.log('[DISCOVERY]')
    console.log('[DISCOVERY] DELETE THIS SCRIPT when done. It hooks player login.')
    console.log('[DISCOVERY] ==========================================================')

    player.tell(Component.literal('§a[Discovery v2] §fDump complete. Check logs for §e[DISCOVERY]§f lines.'))
    player.tell(Component.literal('§a[Discovery v2] §7Type §e!dump all§7 in chat to re-run.'))
}
