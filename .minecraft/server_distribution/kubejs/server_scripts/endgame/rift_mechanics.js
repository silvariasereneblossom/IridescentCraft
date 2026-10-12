// =============================================================================
// RIFT MECHANICS — Oblivion's Rift Loot, Boss Drops & Entry Mechanics
// Place in: kubejs/server_scripts/endgame/rift_mechanics.js
//
// Design Doc: Part II — Oblivion's Rift (Loop 1)
//   Rift Shards, Void Fragments, Rift-exclusive drops,
//   T4 boss Rift material integration, floor-scaling loot
//
// This script handles:
// 1. T4 boss drops: Rift Shards + Void Fragments added to endgame bosses
// 2. End dimension mob drops: Void Fragments from End mobs
// 3. Rift Keystone / Core / Essence first-obtained flags
// 4. Compendium milestones for Rift Shards and Mythic Catalysts: a chat line
//    plus a counter or flag in the player's persistent data. Nothing else.
//    (Operator ruling 2026-10-11: the eight `advancement grant` commands that
//    used to sit beside the chat lines were removed. They named advancements
//    that were never authored, so every grant had failed silently.)
//
// NOTE: Actual procedural dungeon generation requires RFTools Dimensions +
// structure datapacks. This script handles the KubeJS-scriptable portions.
// =============================================================================

// =========================================================================
// SECTION 1: T4 BOSS RIFT MATERIAL DROPS (via LootJS)
// Design Doc: "Rift Shards are the primary endgame currency"
// T4 bosses drop 2-4 Rift Shards + chance at Void Fragments
// This supplements lootjs_overhaul.js (which handles tokens/weapons)
// =========================================================================

LootJS.modifiers(icraft.guard('endgame/rift_mechanics', 'LootJS.modifiers', event => {
    // Entity ids go through the registry-checked helper from
    // loot/0_entity_id_validator.js: LootJS resolves an UNKNOWN entity id to the
    // registry default (minecraft:pig) and would hang the pool on every pig.
    // Falls back to the raw call if the helper is not loaded.
    let riftEntityMod = (ev, id) => global.icraftEntityMod ? global.icraftEntityMod(ev, id) : ev.addEntityLootModifier(id)

    // --- Ender Dragon: 3-5 Rift Shards + 2-3 Void Fragments guaranteed ---
    riftEntityMod(event, 'minecraft:ender_dragon')
        .addLoot(LootEntry.of('kubejs:icraft_rift_shard', 4))
        .addLoot(LootEntry.of('kubejs:void_fragment', 2))
        .addLoot(LootEntry.of('kubejs:primordial_essence').when(c => c.randomChance(0.10)))

    // --- Wither: 2-4 Rift Shards + 1-2 Void Fragments ---
    riftEntityMod(event, 'minecraft:wither')
        .addLoot(LootEntry.of('kubejs:icraft_rift_shard', 3))
        .addLoot(LootEntry.of('kubejs:void_fragment', 1))

    // --- Warden: rare Rift material drop (T3-T4 miniboss) ---
    riftEntityMod(event, 'minecraft:warden')
        .addLoot(LootEntry.of('kubejs:icraft_rift_shard', 2))
        .addLoot(LootEntry.of('kubejs:void_fragment').when(c => c.randomChance(0.40)))

    // --- Modded boss drops: only register if the mod is loaded ---
    // LootJS may apply modifiers to wrong entities if the entity type doesn't exist
    if (Platform.isLoaded('botania')) {
        riftEntityMod(event, 'botania:doppleganger')
            .addLoot(LootEntry.of('kubejs:icraft_rift_shard', 4))
            .addLoot(LootEntry.of('kubejs:void_fragment', 2))
            .addLoot(LootEntry.of('kubejs:primordial_essence').when(c => c.randomChance(0.15)))
    }

    if (Platform.isLoaded('cataclysm')) {
        riftEntityMod(event, 'cataclysm:ancient_remnant')
            .addLoot(LootEntry.of('kubejs:icraft_rift_shard', 5))
            .addLoot(LootEntry.of('kubejs:void_fragment', 4))
            .addLoot(LootEntry.of('kubejs:primordial_essence').when(c => c.randomChance(0.20)))
            .addLoot(LootEntry.of('kubejs:rift_core').when(c => c.randomChance(0.05)))

        riftEntityMod(event, 'cataclysm:ender_guardian')
            .addLoot(LootEntry.of('kubejs:icraft_rift_shard', 4))
            .addLoot(LootEntry.of('kubejs:void_fragment', 3))
            .addLoot(LootEntry.of('kubejs:primordial_essence').when(c => c.randomChance(0.15)))

        riftEntityMod(event, 'cataclysm:ignis')
            .addLoot(LootEntry.of('kubejs:icraft_rift_shard', 2))
            .addLoot(LootEntry.of('kubejs:void_fragment', 1))

        riftEntityMod(event, 'cataclysm:the_harbinger')
            .addLoot(LootEntry.of('kubejs:icraft_rift_shard', 2))
            .addLoot(LootEntry.of('kubejs:void_fragment', 1))

        riftEntityMod(event, 'cataclysm:the_leviathan')
            .addLoot(LootEntry.of('kubejs:icraft_rift_shard', 2))
            .addLoot(LootEntry.of('kubejs:void_fragment', 1))

        riftEntityMod(event, 'cataclysm:maledictus')
            .addLoot(LootEntry.of('kubejs:icraft_rift_shard', 2))
            .addLoot(LootEntry.of('kubejs:void_fragment', 1))

        riftEntityMod(event, 'cataclysm:netherite_monstrosity')
            .addLoot(LootEntry.of('kubejs:icraft_rift_shard', 1))
            .addLoot(LootEntry.of('kubejs:void_fragment').when(c => c.randomChance(0.50)))

        riftEntityMod(event, 'cataclysm:ignited_revenant')
            .addLoot(LootEntry.of('kubejs:icraft_rift_shard').when(c => c.randomChance(0.30)))
            .addLoot(LootEntry.of('kubejs:void_fragment').when(c => c.randomChance(0.20)))
    }

    if (Platform.isLoaded('deep_aether')) {
        riftEntityMod(event, 'deep_aether:eots_controller')
            .addLoot(LootEntry.of('kubejs:icraft_rift_shard', 2))
            .addLoot(LootEntry.of('kubejs:void_fragment', 1))
    }

    // =========================================================================
    // SECTION 2: END DIMENSION MOB DROPS
    // Void Fragments have a small chance to drop from any End mob
    // Design Doc: "Void Fragment — Any Rift mob (5% drop)"
    // Since we can't detect "Rift mobs" without RFTools, End mobs serve as proxy
    // =========================================================================

    // --- Endermen (End dimension ONLY — not overworld endermen) ---
    riftEntityMod(event, 'minecraft:enderman')
        .anyDimension('minecraft:the_end')
        .addLoot(LootEntry.of('kubejs:icraft_rift_shard').when(c => c.randomChance(0.01)))

    // --- Shulkers: End-exclusive mob, higher Void Fragment rate ---
    riftEntityMod(event, 'minecraft:shulker')
        .anyDimension('minecraft:the_end')
        .addLoot(LootEntry.of('kubejs:void_fragment').when(c => c.randomChance(0.08)))
        .addLoot(LootEntry.of('kubejs:icraft_rift_shard').when(c => c.randomChance(0.03)))

    // --- Phantom: End dimension only (not overworld night phantoms) ---
    riftEntityMod(event, 'minecraft:phantom')
        .anyDimension('minecraft:the_end')
        .addLoot(LootEntry.of('kubejs:void_fragment').when(c => c.randomChance(0.05)))

    console.log('[IridescentCraft] Rift loot mechanics loaded (LootJS)')
    console.log('  - T4 boss Rift Shard/Void Fragment drops: 12 bosses')
    console.log('  - End mob Rift material drops: 3 mob types')
}))

// =========================================================================
// SECTION 3: RIFT KEYSTONE TRACKING & COMPENDIUM
// Track Rift completions and milestones via player persistent data
// Uses ServerEvents.tick for periodic checks and PlayerEvents.loggedIn
// for initialization
// =========================================================================

// --- Initialize Rift tracking data on player login ---
PlayerEvents.loggedIn(icraft.guard('endgame/rift_mechanics', 'PlayerEvents.loggedIn', event => {
    let player = event.player
    let data = player.persistentData

    // Initialize Rift tracking if not present
    if (!data.contains('rift_runs_completed')) {
        data.putInt('rift_runs_completed', 0)
    }
    if (!data.contains('rift_deepest_floor')) {
        data.putInt('rift_deepest_floor', 0)
    }
    if (!data.contains('rift_shards_earned')) {
        data.putInt('rift_shards_earned', 0)
    }
    if (!data.contains('mythic_items_crafted')) {
        data.putInt('mythic_items_crafted', 0)
    }
}))

// =========================================================================
// SECTION 4: RIFT SHARD & MYTHIC CATALYST TRACKING
// Track total Rift Shards earned and Mythic Catalysts crafted (for
// Compendium milestones).
//
// 2026-10-11: both counters used to sit in the PlayerEvents.inventoryChanged
// handler further down. That event fires for EVERY non-empty slot change in
// the player's inventory (a stack moved, a tool losing durability), and for
// the whole inventory at login and each time a container opens, so the shard
// counter re-added the full stack and the catalyst counter gained 1 on every
// firing. Shards only enter the game as mob drops, so they are counted where
// they are picked up: ItemEvents.pickedUp, whose stack carries the amount
// actually taken. Catalysts are counted on the real craft (ItemEvents.crafted,
// as in skills/justleveling_skills.js). Totals stored before this date are
// inflated and were left as they are.
// =========================================================================

ItemEvents.pickedUp(icraft.guard('endgame/rift_mechanics', 'ItemEvents.pickedUp', event => {
    try {
        let player = event.player
        let item = event.item
        if (!player || !item) return
        if (String(item.id) !== 'kubejs:icraft_rift_shard') return
        let gained = item.count
        if (!(gained > 0)) return

        let data = player.persistentData
        let current = data.getInt('rift_shards_earned')
        let newTotal = current + gained
        data.putInt('rift_shards_earned', newTotal)

        // Compendium milestones — one chat line as each threshold is crossed
        if (newTotal >= 10 && current < 10) {
            player.tell('§d[Compendium] §7Rift Collector — Earned 10 Rift Shards')
        }
        if (newTotal >= 50 && current < 50) {
            player.tell('§d[Compendium] §7Rift Hoarder — Earned 50 Rift Shards')
        }
        if (newTotal >= 250 && current < 250) {
            player.tell('§d[Compendium] §5Rift Master — Earned 250 Rift Shards')
        }
    } catch (e) {
        console.warn('[rift_mechanics] shard pickup tracking threw: ' + e)
    }
}))

// Track Mythic Catalyst crafting for Compendium
ItemEvents.crafted(icraft.guard('endgame/rift_mechanics', 'ItemEvents.crafted', event => {
    try {
        let player = event.player
        let item = event.item
        if (!player || !item) return
        if (String(item.id).indexOf('kubejs:mythic_catalyst_') !== 0) return
        let made = item.count > 0 ? item.count : 1

        let data = player.persistentData
        let before = data.getInt('mythic_items_crafted')
        let crafted = before + made
        data.putInt('mythic_items_crafted', crafted)

        if (crafted >= 1 && before < 1) {
            player.tell('§d[Compendium] §7Mythic Initiate — Crafted your first Mythic Catalyst')
        }
        if (crafted >= 5 && before < 5) {
            player.tell('§d[Compendium] §5Mythic Artisan — Crafted 5 Mythic Catalysts')
        }
    } catch (e) {
        console.warn('[rift_mechanics] catalyst craft tracking threw: ' + e)
    }
}))

// One-time "first obtained" flags. These can stay on inventoryChanged: seeing
// the item in any slot change is enough, and the flag makes a repeat harmless.
PlayerEvents.inventoryChanged(icraft.guard('endgame/rift_mechanics', 'PlayerEvents.inventoryChanged', event => {
    let player = event.player
    let item = event.item

    // Track Rift Keystone crafting
    if (item.id === 'kubejs:rift_keystone') {
        let data = player.persistentData
        if (!data.getBoolean('rift_keystone_crafted')) {
            data.putBoolean('rift_keystone_crafted', true)
            player.tell('§d[Compendium] §7Rift Pioneer — Crafted your first Rift Keystone')
        }
    }

    // Track Rift Core acquisition (rare endgame material)
    if (item.id === 'kubejs:rift_core') {
        let data = player.persistentData
        if (!data.getBoolean('rift_core_obtained')) {
            data.putBoolean('rift_core_obtained', true)
            player.tell('§d[Compendium] §5Core of the Rift — Obtained a Rift Core')
        }
    }

    // Track Primordial Essence acquisition
    if (item.id === 'kubejs:primordial_essence') {
        let data = player.persistentData
        if (!data.getBoolean('primordial_obtained')) {
            data.putBoolean('primordial_obtained', true)
            player.tell('§d[Compendium] §7Primordial Touch — Obtained Primordial Essence')
        }
    }
}))

// =========================================================================
// SECTION 5: MYTHIC FORGE USAGE ANNOUNCEMENTS
// When a player crafts a Mythic unique item, announce it to the server
// Uses inventoryChanged to detect the unique named items
// =========================================================================

PlayerEvents.inventoryChanged(icraft.guard('endgame/rift_mechanics#2', 'PlayerEvents.inventoryChanged', event => {
    let player = event.player
    let item = event.item

    // Detect Mythic unique items by their custom names
    let nbt = item.nbt
    if (!nbt) return

    let display = nbt.get('display')
    if (!display) return

    let name = display.getString('Name')
    if (!name) return

    // RHINO-SAFETY: var (not const) — closure-local in a repeatedly-invoked handler.
    var mythicNames = [
        'Voidheart Blade',
        'Oblivion Aegis',
        'Riftwalker Boots',
        'Oblivion Crown'
    ]

    for (let mythicName of mythicNames) {
        if (name.includes(mythicName)) {
            let data = player.persistentData
            let key = 'mythic_' + mythicName.replace(/\s/g, '_').toLowerCase()

            if (!data.getBoolean(key)) {
                data.putBoolean(key, true)

                // Server-wide announcement
                player.server.runCommandSilent(
                    `tellraw @a ["",{"text":"[Mythic] ","color":"dark_purple"},{"text":"${player.username}","color":"gold"},{"text":" has forged the ","color":"gray"},{"text":"${mythicName}","color":"dark_purple","bold":true},{"text":"!","color":"gray"}]`)
            }
        }
    }
}))

console.log('[IridescentCraft] Rift mechanics loaded')
console.log('  - Rift tracking data initialization')
console.log('  - Rift Shard/Catalyst Compendium milestones')
console.log('  - Mythic unique item server announcements')
