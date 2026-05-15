// =============================================================================
// Diamond Leak Probe + Hard Strip (overworld + T2 dims)
// =============================================================================
// 2026-05-15: Tester reports diamonds still appearing in pre-T3 chests despite
// three existing strip layers in lootjs_overhaul.js Section 5A1.5:
//   1. LootType.CHEST + anyDimension(...).removeLoot(diamond + diamond gear)
//   2. Per-table explicit strip on 5 known leak tables
//   3. Regex catch-all on ^*:.*chests?/ + anyDimension(...)
//
// Adds a FOURTH layer that:
//   (a) Uses .apply(ctx) to capture LootContextJS -- exposes both
//       getLootTableId() AND getLoot(), so we can log the exact source
//       table and dimension when a diamond is present.
//   (b) Logs (table, item, dim) the first time each triple is seen
//       (one line per triple per JVM lifetime).
//   (c) Empties the offending stack via .modifyLoot's per-stack callback
//       on the same builder, so the diamond never reaches the chest UI.
//
// When a leak is reported, the log line tells us the exact source table
// to patch in lootjs_overhaul.js.
// =============================================================================

var ItemFilter_dlp = Java.loadClass('com.almostreliable.lootjs.filters.ItemFilter')

// Diamond item IDs to catch. Vanilla raw + tools + armor + horse armor.
// Does NOT catch botania:mana_diamond or modded diamond variants on purpose
// -- those are progression items, not the vanilla leak we're hunting.
var DIAMOND_LEAK_IDS = {
    'minecraft:diamond': true,
    'minecraft:diamond_sword': true,
    'minecraft:diamond_pickaxe': true,
    'minecraft:diamond_axe': true,
    'minecraft:diamond_shovel': true,
    'minecraft:diamond_hoe': true,
    'minecraft:diamond_helmet': true,
    'minecraft:diamond_chestplate': true,
    'minecraft:diamond_leggings': true,
    'minecraft:diamond_boots': true,
    'minecraft:diamond_horse_armor': true,
}

global._diamond_leak_seen = global._diamond_leak_seen || {}

function logIfDiamondPresent(ctx) {
    try {
        var loot = ctx.getLoot()
        if (!loot || loot.size() === 0) return
        var tableId = 'unknown'
        try { tableId = String(ctx.getLootTableId()) } catch (_) {}
        var dim = 'unknown'
        try { dim = String(ctx.getLevel().dimension().location()) } catch (_) {}
        for (var i = 0; i < loot.size(); i++) {
            var s = loot.get(i)
            if (!s || s.isEmpty()) continue
            var id = String(s.id || '')
            if (!id) continue
            if (DIAMOND_LEAK_IDS[id] !== true) continue
            var key = tableId + '|' + id + '|' + dim
            if (global._diamond_leak_seen[key]) continue
            global._diamond_leak_seen[key] = true
            console.warn('[diamond-leak] item=' + id
                       + ' table=' + tableId
                       + ' dim=' + dim
                       + ' (one log line per (table, item, dim) per JVM)')
        }
    } catch (e) {
        try { console.warn('[diamond-leak] log threw: ' + e) } catch (_) {}
    }
}

LootJS.modifiers(function(event) {

    var diamondFilter = ItemFilter_dlp.custom(function(stack) {
        try {
            if (!stack || stack.isEmpty()) return false
            var id = String(stack.id || '')
            if (!id) {
                try {
                    id = String(stack.getItem().builtInRegistryHolder().key().location())
                } catch (_) { return false }
            }
            return DIAMOND_LEAK_IDS[id] === true
        } catch (e) { return false }
    })

    var emptyStack = function(stack) {
        try { stack.setCount(0) } catch (_) {}
        return stack
    }

    // Layer A: LootType.CHEST classifier. Catches chest-type tables in the
    // listed pre-T3 dims. .apply runs first per modifier-chain order: it logs
    // the source. .modifyLoot runs after and zeroes the diamond stack so the
    // player never sees it.
    event
        .addLootTypeModifier(LootType.CHEST)
        .anyDimension('minecraft:overworld',
            'twilightforest:twilight_forest',
            'aether:the_aether', 'deep_aether:the_aether',
            'blue_skies:everbright', 'blue_skies:everdawn')
        .apply(logIfDiamondPresent)
        .modifyLoot(diamondFilter, emptyStack)

    // Layer B: table-name regex catch. Picks up tables that LOOK like chest
    // tables but weren't categorized as LootType.CHEST (Lootr wrap, certain
    // custom mod dispatch paths). Restricted to pre-T3 dims so T3+ chests
    // still legitimately roll diamonds.
    event
        .addLootTableModifier(/^[a-z0-9_]+:.*chests?\//)
        .anyDimension('minecraft:overworld',
            'twilightforest:twilight_forest',
            'aether:the_aether', 'deep_aether:the_aether',
            'blue_skies:everbright', 'blue_skies:everdawn')
        .apply(logIfDiamondPresent)
        .modifyLoot(diamondFilter, emptyStack)

    // Layer C: ALL loot tables in pre-T3 dims, no LootType filter, no path
    // filter. Catches the long-tail: mob drops, block drops, entity-backpack
    // injections, anything else carrying diamonds that doesn't show up in
    // (A) or (B). Performance: the apply() callback returns immediately if
    // the loot list has no diamonds, so overhead is small. modifyLoot's
    // filter likewise short-circuits. Restrict to pre-T3 dims so T3+ loot
    // (Nether/Undergarden/End/DD/Abyss) still legitimately yields diamonds.
    event
        .addLootTableModifier(/.+/)
        .anyDimension('minecraft:overworld',
            'twilightforest:twilight_forest',
            'aether:the_aether', 'deep_aether:the_aether',
            'blue_skies:everbright', 'blue_skies:everdawn')
        .apply(logIfDiamondPresent)
        .modifyLoot(diamondFilter, emptyStack)

    console.log('[icraft-loot] diamond_leak_probe registered ('
              + Object.keys(DIAMOND_LEAK_IDS).length + ' item ids, 3 layers)')
})
