// =============================================================================
// IridescentCraft — Apotheosis errored-gem auto-repair
// =============================================================================
// Tester report 2026-05-09 (original): gems from chest loot occasionally arrive
// as bare `apotheosis:gem` stacks with no NBT — tooltip reads
//    "Errored gem with no bonus!"
// because GemItem.appendHoverText -> UnsocketedGem.of(stack) returns
// isValid()=false when `tag.gem` is missing.
//
// 2026-05-18 extension: the dup-key gem-deserialization bug (see
// feedback_apoth_gem_extensions) produced errored gems in a SECOND way —
// gems with `tag.gem` set to a valid ID but with missing/empty
// `tag.affix_data` because Apotheosis's deserializer threw mid-stream,
// writing partial NBT. These render identically to bare gems but
// isBareGem's original check missed them.
//
// Also 2026-05-18: fixed two `stack.isEmpty` (no parens) traps that made
// `isApothGem` always return false, silently disabling the inventory-tick
// sweep entirely (the LootJS chest-load path was unaffected because it
// used the parens form). Net effect: the inventory sweep has been broken
// since the script was written; "errored gems are still errored" reports
// were because the sweep never actually ran. Now it runs, and catches both
// the bare-no-gem case AND the broken-affix-data case.
//
// Repair mechanism: scans player inventories every 3 seconds, and for any
// errored `apotheosis:gem` stack, writes a random valid gem ID +
// apotheosis:common rarity into the NBT.
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
    // 2026-05-18 fix: stack.isEmpty (no parens) is a function-ref-always-truthy
    // trap per feedback_kubejs_tooltip_api. Inventory sweep silently did nothing
    // since this returned false for every stack. Use stack.isEmpty() (with parens).
    if (!stack || stack.isEmpty()) return false
    return String(stack.item.id) === 'apotheosis:gem'
  }

  // "Errored" gem detection:
  //   (a) no NBT at all -> bare gem, never initialized
  //   (b) NBT but no `gem` key -> bare gem, partial init
  //   (c) `gem` key empty -> bare gem, partial init
  //   (d) NBT has `gem` but no `affix_data` compound -> rolled during a
  //       data-load failure (e.g., 2026-05-18 dup-key bug on elemental gems
  //       broke the gem definition during Apotheosis deserialization and
  //       partial NBT escaped into player inventories). Tooltip shows
  //       "Errored gem with no bonus!" even though `gem` looks valid.
  //   (e) `affix_data.rarity` missing or empty -> same scenario as (d).
  //
  // We don't try to validate that the gem ID is registered -- if the user
  // has an unloaded mod gem, leave it alone. The repair targets gems that
  // are STRUCTURALLY broken regardless of which gem ID they reference.
  function isBareGem(stack) {
    if (!stack.nbt) return true
    if (!stack.nbt.contains('gem')) return true
    var gemId = stack.nbt.getString('gem')
    if (!gemId || gemId === '') return true
    // Extended (2026-05-18): also check affix_data validity. A gem with
    // tag.gem set but no/empty affix_data renders "errored" identically
    // to a missing-gem-field case. UnsocketedGem.of(stack).isValid()
    // checks both the gem registry binding AND the affix-data rarity.
    if (!stack.nbt.contains('affix_data')) return true
    var affixData = stack.nbt.getCompound('affix_data')
    if (!affixData.contains('rarity')) return true
    var rarity = affixData.getString('rarity')
    if (!rarity || rarity === '') return true
    return false
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

  // Categorize WHY a gem stack is errored — useful for forensics and for
  // the chat message the player sees.
  function diagnoseGem(stack) {
    if (!stack.nbt) return 'no-nbt'
    if (!stack.nbt.contains('gem')) return 'no-gem-field'
    var gemId = stack.nbt.getString('gem')
    if (!gemId || gemId === '') return 'empty-gem-field'
    if (!stack.nbt.contains('affix_data')) return 'no-affix-data (gem=' + gemId + ')'
    var affixData = stack.nbt.getCompound('affix_data')
    if (!affixData.contains('rarity')) return 'no-rarity (gem=' + gemId + ')'
    var rarity = affixData.getString('rarity')
    if (!rarity || rarity === '') return 'empty-rarity (gem=' + gemId + ')'
    return 'unknown'
  }

  function repairGem(stack, player, slotLabel) {
    var reason = diagnoseGem(stack)
    var gemId = pickRandomGem()
    if (!stack.nbt) stack.nbt = new CompoundTag_gr()
    stack.nbt.putString('gem', gemId)
    // Add affix_data compound with common rarity so GemInstance is fully
    // valid (not just isBound). Without rarity the gem might still
    // tooltip-render but fail to apply bonuses when socketed.
    // 2026-05-18 fix: write 'apotheosis:common' (resource-location form) to
    // match the loot-table-level repair path. Plain 'common' likely worked
    // via default-namespace coercion but the prefixed form is canonical.
    var affixData = new CompoundTag_gr()
    affixData.putString('rarity', 'apotheosis:common')
    stack.nbt.put('affix_data', affixData)

    var ctx = recentChestContext(player)
    console.log('[gem-repair] errored apotheosis:gem (' + reason + ') in '
              + slotLabel
              + ' (player=' + player.username + ')'
              + ctx
              + ' -> ' + gemId)
    try {
      player.tell(Text.gray('An errored gem in your ' + slotLabel
                          + ' was auto-repaired to ' + gemId
                          + ' (common). Reason: ' + reason + '.'))
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
      // 2026-05-18 fix: stack.isEmpty (no parens) is function-ref-always-truthy;
      // use stack.isEmpty() (with parens). Per feedback_kubejs_tooltip_api.
      if (!stack || stack.isEmpty()) return
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

  var ItemFilter_gr = Java.loadClass('com.almostreliable.lootjs.filters.ItemFilter')
  var bareGemFilter = ItemFilter_gr.custom(function(stack) {
    if (!stack || stack.isEmpty()) return false
    try {
      if (String(stack.item.id) !== 'apotheosis:gem') return false
    } catch (_) { return false }
    return isBareGem(stack)
  })

  LootJS.modifiers(event => {
    event.addLootTypeModifier(LootType.CHEST).modifyLoot(
      bareGemFilter,
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
            + KNOWN_GEMS.length + ' fallback IDs; inventory-tick sweep + ItemEntity-spawn trace + LootJS-chest trace; '
            + 'detects (a) bare no-NBT, (b) no/empty gem field, (c) missing affix_data, (d) missing/empty rarity)')
})()
