// =============================================================================
// IridescentCraft — Apotheosis bare-gem auto-repair (bandaid)
// =============================================================================
// Tester report 2026-05-09: gems from chest loot occasionally arrive as bare
// `apotheosis:gem` stacks with no NBT — the item tooltip shows
//    "Errored gem with no bonus!"
// because Apotheosis's GemItem.appendHoverText -> UnsocketedGem.of(stack)
// returns isValid()=false when `tag.gem` is missing.
//
// Source not yet identified (world was created post-Apr 29's loot-table
// cleanup, so it isn't legacy chest data). Until we trace the generator
// that's emitting these, this script repairs them in-place: scans player
// inventories every 3 seconds, and for any bare `apotheosis:gem` stack,
// writes a random valid gem ID + common rarity into the NBT.
//
// Apoth 1.20.1 NBT shape for a working gem stack (per Apotheosis source on
// the 1.20 branch, GemItem.java + AffixHelper.setRarity):
//   tag.gem                   = "apotheosis:<dim_path>/<name>"
//   tag.affix_data.rarity     = "common" | "uncommon" | "rare" | "epic" | ...
//
// UnsocketedGem.isValid() only checks gem.isBound() against the registry,
// so writing just `tag.gem` is enough to fix the tooltip. We also set
// `tag.affix_data.rarity = common` so the gem is actually functional once
// socketed (otherwise GemInstance validation might fall through to
// errored).
//
// Repaired stacks log [gem-repair] once per repair so we can grep the log
// and identify the source (which loot table / mob drop / chest produced
// them). Operator also gets a per-event chat tell.
// =============================================================================

(function () {
  // Apoth 1.20.1 base mod gem registry IDs, sourced from
  // src/main/resources/data/apotheosis/gems/* on the 1.20 branch.
  // Path includes the dimensional folder because Placebo's DynamicRegistry
  // registers under `<namespace>:<full_relative_path>`. Restricted to
  // base-Apoth gems (no addon mod IDs) so we never pick a gem ID that
  // isn't loaded for the current pack.
  var KNOWN_GEMS = [
    'apotheosis:core/ballast',
    'apotheosis:core/brawlers',
    'apotheosis:core/breach',
    'apotheosis:core/combatant',
    'apotheosis:core/guardian',
    'apotheosis:core/lightning',
    'apotheosis:core/lunar',
    'apotheosis:core/samurai',
    'apotheosis:core/slipstream',
    'apotheosis:core/solar',
    'apotheosis:core/splendor',
    'apotheosis:core/tyrannical',
    'apotheosis:core/warlord',
    'apotheosis:overworld/earth',
    'apotheosis:overworld/royalty',
    'apotheosis:the_end/endersurge',
    'apotheosis:the_end/mageslayer',
    'apotheosis:the_nether/blood_lord',
    'apotheosis:the_nether/inferno',
    'apotheosis:twilight/forest',
    'apotheosis:twilight/queen',
  ]

  var CompoundTag_gr = Java.loadClass('net.minecraft.nbt.CompoundTag')

  function isApothGem(stack) {
    if (!stack || stack.isEmpty) return false
    return String(stack.item.id) === 'apotheosis:gem'
  }

  // Bare = no NBT, OR has NBT but no `gem` key, OR `gem` key is empty.
  // We don't try to validate that the gem ID is registered -- if the
  // user has an unloaded mod gem, leave it alone (a future load might
  // resolve it). The user complaint is specifically the no-NBT case.
  function isBareGem(stack) {
    if (!stack.nbt) return true
    if (!stack.nbt.contains('gem')) return true
    var gemId = stack.nbt.getString('gem')
    return !gemId || gemId === ''
  }

  function pickRandomGem() {
    var idx = Math.floor(Math.random() * KNOWN_GEMS.length)
    return KNOWN_GEMS[idx]
  }

  // Recent-context lookup: bare gems can appear in a player's inventory
  // by three paths -- ItemEntity pickup (covered by EntityEvents.spawned
  // below), direct chest-take, or some other server-side inventory
  // mutation. To capture the chest-take path, the BlockEvents.rightClicked
  // handler below stamps `_lastChestPos` + `_lastChestTick` onto the
  // player's persistent data whenever they interact with a chest /
  // barrel / shulker. When a bare gem turns up here within a short
  // window of that interaction, the log line includes the chest pos so
  // the operator can correlate gem source -> structure / loot table.
  function recentChestContext(player) {
    try {
      var pd = player.persistentData
      if (!pd.contains('_lastChestPos') || !pd.contains('_lastChestTick')) return ''
      var dt = player.tickCount - pd.getLong('_lastChestTick')
      if (dt < 0 || dt > 200) return ''  // only correlate within ~10s
      return ' (recent chest at ' + pd.getString('_lastChestPos')
           + ' opened ' + dt + 't ago)'
    } catch (_) { return '' }
  }

  function repairGem(stack, player, slotLabel) {
    var gemId = pickRandomGem()
    if (!stack.nbt) stack.nbt = {}
    stack.nbt.putString('gem', gemId)
    // Add affix_data compound with common rarity so GemInstance is fully
    // valid (not just isBound). Without rarity the gem might still
    // tooltip-render but fail to apply bonuses when socketed.
    var affixData = new CompoundTag_gr()
    affixData.putString('rarity', 'common')
    stack.nbt.put('affix_data', affixData)

    var ctx = recentChestContext(player)
    console.log('[gem-repair] bare apotheosis:gem in ' + slotLabel
              + ' (player=' + player.username + ')'
              + ctx
              + ' -> ' + gemId)
    try {
      player.tell(Text.gray('A bare gem in your ' + slotLabel
                          + ' was auto-repaired to ' + gemId + ' (common).'))
    } catch (_) {}
  }

  // Stamp the player with the position + tick of the most recent chest /
  // barrel / shulker / spawner-loot block they interacted with, so the
  // gem repair logs can include "recent chest at X opened Yt ago" --
  // converts an otherwise-source-less log line into a forensic clue
  // about which loot table is producing bare gems.
  BlockEvents.rightClicked(event => {
    try {
      if (!event.block || !event.player) return
      var blockId = String(event.block.id)
      var match = blockId.indexOf('chest') >= 0
               || blockId.indexOf('barrel') >= 0
               || blockId.indexOf('shulker_box') >= 0
               || blockId.indexOf('spawner') >= 0
      if (!match) return
      var pos = event.block.pos
      var pd = event.player.persistentData
      pd.putString('_lastChestPos', pos.x + ',' + pos.y + ',' + pos.z + ' ' + blockId)
      pd.putLong('_lastChestTick', event.player.tickCount)
    } catch (_) {}
  })

  // Player tick at 60-tick cadence (~3s). Bare gems are an edge case --
  // no need for a tighter scan rate. Most repairs will happen on the
  // first scan after pickup / first scan after world load.
  global.tick_apothGemRepair = function (event) {
    var player = event.player
    if (!player || !player.inventory) return
    var inv = player.inventory
    // Inventory size = 41 (hotbar 0-8, main 9-35, armor 36-39, offhand 40).
    // Scan everything; bare gems can land anywhere via /give, NBT-stripping
    // mods, or whatever generator path is producing these.
    var size
    try { size = inv.size } catch (_) {
      try { size = inv.containerSize } catch (_) { size = 41 }
    }
    for (var i = 0; i < size; i++) {
      var stack
      try { stack = inv.getItem(i) } catch (_) { continue }
      if (!isApothGem(stack)) continue
      if (!isBareGem(stack)) continue
      var label = (i < 9) ? 'hotbar slot ' + i
                : (i < 36) ? 'inventory slot ' + i
                : (i < 40) ? 'armor slot ' + (i - 36)
                : 'offhand'
      repairGem(stack, player, label)
      try { inv.setItem(i, stack) } catch (_) {}
    }
  }
  global.registerPlayerTick('tick_apothGemRepair', 60, 0)

  // ── Inject-source diag ────────────────────────────────────────────────────
  // A bare apotheosis:gem stack arrives in a player's inventory only after
  // it spawns somewhere in the world (loot generation -> ItemEntity drop ->
  // pickup). Hook ItemEntity spawn events and log every bare-gem ItemEntity
  // with position, block context, and timestamp so we can correlate the
  // log line to whatever the operator was just doing (chest opened at
  // position X? mob killed near Y? spawner triggered at Z?). After enough
  // sightings the pattern reveals which generator is emitting them.
  //
  // Dedupe by approximate spawn position + tick window so a single chest
  // dump producing one gem doesn't spam 5 lines.
  global._gem_trace_seen = global._gem_trace_seen || {}

  EntityEvents.spawned(event => {
    try {
      var entity = event.entity
      // ItemEntity has type minecraft:item.
      var typeId = ''
      try { typeId = String(entity.type) } catch (_) {}
      if (typeId !== 'minecraft:item') return

      // entity.item is the ItemStack the entity wraps.
      var stack
      try { stack = entity.item } catch (_) { return }
      if (!stack || stack.isEmpty) return
      if (String(stack.item.id) !== 'apotheosis:gem') return
      if (!isBareGem(stack)) return

      var pos = entity.position()
      var px = Math.floor(pos.x()), py = Math.floor(pos.y()), pz = Math.floor(pos.z())
      var lvl = entity.level
      var dim = 'unknown'
      try { dim = String(lvl.dimension().location()) } catch (_) {
        try { dim = String(lvl.dimension) } catch (_) {}
      }

      // Per-(dimension, position-within-3-blocks) one-shot per session
      // to avoid log spam from a single source.
      var key = dim + '|' + Math.floor(px / 3) + '|' + Math.floor(py / 3) + '|' + Math.floor(pz / 3)
      if (global._gem_trace_seen[key]) return
      global._gem_trace_seen[key] = true

      // Sample blocks near the spawn position so we can identify the
      // source (chest? mob_spawner? a specific block?). Walk a small
      // box; report the most distinctive non-air block id if any.
      var nearbyBlock = ''
      try {
        for (var dy = -2; dy <= 2 && !nearbyBlock; dy++) {
          for (var dx = -2; dx <= 2 && !nearbyBlock; dx++) {
            for (var dz = -2; dz <= 2 && !nearbyBlock; dz++) {
              var bx = px + dx, by = py + dy, bz = pz + dz
              var b = lvl.getBlock(bx, by, bz)
              if (!b) continue
              var bid = String(b.id)
              if (bid === 'minecraft:air' || bid === 'minecraft:cave_air') continue
              // Only report blocks that look like containers / spawners.
              if (bid.indexOf('chest') >= 0
                  || bid.indexOf('barrel') >= 0
                  || bid.indexOf('spawner') >= 0
                  || bid.indexOf('shulker') >= 0) {
                nearbyBlock = bid + '@' + bx + ',' + by + ',' + bz
              }
            }
          }
        }
      } catch (_) {}

      console.warn('[gem-trace] bare apotheosis:gem spawned'
                + ' pos=' + px + ',' + py + ',' + pz
                + ' dim=' + dim
                + (nearbyBlock ? ' nearby=' + nearbyBlock : '')
                + ' tick=' + entity.age)
    } catch (e) {
      try { console.warn('[gem-trace] handler threw: ' + e) } catch (_) {}
    }
  })

  // ── Loot-table-level diag + fix ──────────────────────────────────────────
  // 2026-05-15: tester reports bare gems still appearing in CHEST inventories
  // (not as ItemEntity drops). The EntityEvents.spawned hook above only fires
  // when a gem entity spawns in-world; chest contents are populated via loot
  // tables directly, bypassing entity spawn. Hook LootJS for every chest
  // loot table: scan generated items, log table id when a bare gem is found,
  // and replace it with a properly-bonded random gem so the player never
  // sees the broken tooltip in the chest UI.
  //
  // Logs once per (tableId, dim) pair per session via _gem_loot_seen.
  global._gem_loot_seen = global._gem_loot_seen || {}

  LootJS.modifiers(event => {
    event.addLootTypeModifier(LootType.CHEST).modifyLoot(
      // filter: bare apotheosis:gem stacks
      function(stack) {
        if (!stack || stack.isEmpty) return false
        if (String(stack.item.id) !== 'apotheosis:gem') return false
        return isBareGem(stack)
      },
      // callback: log + replace
      function(context, stack) {
        try {
          var tableId = 'unknown'
          try { tableId = String(context.queriedLootTableId) } catch (_) {}
          var dim = 'unknown'
          try { dim = String(context.level.dimension().location()) } catch (_) {}
          var key = tableId + '|' + dim
          if (!global._gem_loot_seen[key]) {
            global._gem_loot_seen[key] = true
            console.warn('[gem-loot-trace] bare apotheosis:gem from table='
                       + tableId + ' dim=' + dim + ' (logging once per pair)')
          }
        } catch (e) {
          try { console.warn('[gem-loot-trace] handler threw: ' + e) } catch (_) {}
        }
        // Repair in place: write fallback variant + common rarity into NBT.
        // Mirrors the inventory-tick repair so the chest tooltip is correct.
        try {
          var nbt = stack.nbt
          if (!nbt) {
            nbt = new CompoundTag_gr()
            stack.nbt = nbt
          }
          var pickIdx = Math.floor(Math.random() * KNOWN_GEMS.length)
          nbt.putString('gem', KNOWN_GEMS[pickIdx])
          var affixData = nbt.contains('affix_data')
            ? nbt.getCompound('affix_data')
            : new CompoundTag_gr()
          affixData.putString('rarity', 'apotheosis:common')
          nbt.put('affix_data', affixData)
        } catch (e) {
          try { console.warn('[gem-loot-trace] repair threw: ' + e) } catch (_) {}
        }
        return stack
      }
    )
  })

  console.log('[IridescentCraft] apotheosis_gem_repair loaded ('
            + KNOWN_GEMS.length + ' fallback IDs, with inject-source trace + loot-table trace)')
})()
