// =============================================================================
// MIGRATION: kubejs:rift_shard -> kubejs:icraft_rift_shard
// Phase 2.2 of audit fix plan, shipped 2026-04-27.
//
// Why: Resolve namespace collision with too_many_bows:rift_shard. Renaming
// our internal item ID makes the codex/JEI tooltip unambiguous. Old item is
// still registered (in custom_items.js) for one transition window so any
// pre-update player inventories convert cleanly on next login. After all
// active testers have logged in, the old kubejs:rift_shard registration
// can be removed (target: ~2026-05-15, ~2 weeks).
//
// What this does: on player login, scan inventory + offhand + ender chest
// for kubejs:rift_shard items and replace with kubejs:icraft_rift_shard at
// the same count. One-shot per player via persistentData flag.
// =============================================================================

PlayerEvents.loggedIn(event => {
    const player = event.player
    const data = player.persistentData

    if (data.getBoolean('icraft_rift_shard_migrated')) return

    const inv = player.inventory
    let converted = 0

    // Main inventory + hotbar (slots 0..35) + offhand (slot 40)
    // Scan all slots; KubeJS Inventory.getStackInSlot is bounds-safe
    for (let i = 0; i < 41; i++) {
        const stack = inv.getItem(i)
        if (stack && !stack.isEmpty() && stack.id === 'kubejs:rift_shard') {
            const count = stack.count
            inv.setItem(i, Item.of('kubejs:icraft_rift_shard', count))
            converted += count
        }
    }

    // Ender Chest (9 slots, indices 0..26 depending on capacity)
    try {
        const ender = player.getEnderChestInventory()
        if (ender) {
            const size = ender.containerSize
            for (let i = 0; i < size; i++) {
                const stack = ender.getItem(i)
                if (stack && !stack.isEmpty() && stack.id === 'kubejs:rift_shard') {
                    const count = stack.count
                    ender.setItem(i, Item.of('kubejs:icraft_rift_shard', count))
                    converted += count
                }
            }
        }
    } catch (e) {
        console.warn('[icraft-migration] ender_chest scan failed for ' + player.username + ': ' + e)
    }

    data.putBoolean('icraft_rift_shard_migrated', true)

    if (converted > 0) {
        player.tell('§d[Iridescent] §7Migrated ' + converted + ' Rift Shard(s) to the new Iridescent Rift Shard ID.')
        console.log('[icraft-migration] ' + player.username + ': converted ' + converted + ' rift_shard items')
    }
})
