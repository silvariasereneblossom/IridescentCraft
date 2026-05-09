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

    console.log('[gem-repair] bare apotheosis:gem in ' + slotLabel
              + ' (player=' + player.username + ') -> ' + gemId)
    try {
      player.tell(Text.gray('A bare gem in your ' + slotLabel
                          + ' was auto-repaired to ' + gemId + ' (common).'))
    } catch (_) {}
  }

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

  console.log('[IridescentCraft] apotheosis_gem_repair loaded ('
            + KNOWN_GEMS.length + ' fallback IDs)')
})()
