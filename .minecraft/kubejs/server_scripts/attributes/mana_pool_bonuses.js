// =============================================================================
// LEGACY MANA-MODIFIER CLEANUP (2026-05-15)
// =============================================================================
// Two generations of mana-tuning scripts wrote permanent attribute modifiers
// to player NBT, then got removed without scrubbing what they had written:
//
//   1. mana_pool_bonuses.js (2026-04-25 - 2026-05-15) -- layered pool buffs:
//      Global +25% MULTIPLY_BASE, Archmage +1.0 MULTIPLY_TOTAL,
//      Battlemage/Void Summoner +0.5 MULTIPLY_TOTAL. Reverted while
//      diagnosing unified-pool drain (inflated pool made small Ars
//      deductions invisible in the bar).
//
//   2. mana_bridge.js (2026-05-14 - 2026-05-15) -- bidirectional mirror
//      between ISS and Ars perk mana attributes. Bug: summed raw modifier
//      amounts across MULTIPLY_BASE / MULTIPLY_TOTAL / ADDITION as scalars,
//      applied the sum as a single MULTIPLY_BASE on the receiving
//      attribute. Confirmed culprit of an observed +866% mana_regen on a
//      live tester (image: stale uuid ...000004 with amt=8.66 MULTIPLY_BASE).
//      Replaced by ArsManaCapMixin (unified pool, no attribute mirroring).
//
// Both used `addPermanentModifier` -> writes to player NBT -> the
// modifiers survive script removal. This file CLEARS all eight UUIDs from
// both ISS attributes and both Ars perk attributes on every 5s tick and
// on login, so existing players get scrubbed clean.
//
// To restore either feature, `git revert` the appropriate commit.
// =============================================================================

try {
  var UUID_mp = Java.loadClass('java.util.UUID')
  var ResourceLocation_mp = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var ForgeRegistries_mp = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')

  // Generation-1: mana_pool_bonuses (4 UUIDs on ISS max_mana)
  var POOL_BONUS_UUIDS = [
    '9c1e0c01-2e1d-4f0a-9d1f-202000000001',  // global +25%
    '9c1e0c01-2e1d-4f0a-9d1f-202000000011',  // archmage x2
    '9c1e0c01-2e1d-4f0a-9d1f-202000000021',  // battlemage x1.5
    '9c1e0c01-2e1d-4f0a-9d1f-202000000031',  // void_summoner x1.5
  ]

  // Generation-2: mana_bridge (4 UUIDs, distributed across both attrs both sides)
  var BRIDGE_UUIDS = [
    'b1d9e201-0000-0000-0000-100000000001',  // iss->ars max_mana
    'b1d9e201-0000-0000-0000-100000000002',  // ars->iss max_mana
    'b1d9e201-0000-0000-0000-100000000003',  // iss->ars mana_regen
    'b1d9e201-0000-0000-0000-100000000004',  // ars->iss mana_regen (the +866% case)
  ]

  // Bridge applied modifiers to BOTH ISS and Ars perk attributes. We don't
  // know which UUID landed where post-hoc (and Ars-side persistence may have
  // been cleared by the perk attribute deregistration), so just blanket
  // remove every UUID from every relevant attribute.
  var TARGET_ATTRS = [
    'irons_spellbooks:max_mana',
    'irons_spellbooks:mana_regen',
    'ars_nouveau:ars_nouveau.perk.max_mana',
    'ars_nouveau:ars_nouveau.perk.mana_regen',
  ]
  var ALL_STALE_UUIDS = POOL_BONUS_UUIDS.concat(BRIDGE_UUIDS)

  var resolvedAttrs = []
  for (var ai = 0; ai < TARGET_ATTRS.length; ai++) {
    var rl = ResourceLocation_mp.tryParse(TARGET_ATTRS[ai])
    var attr = rl ? ForgeRegistries_mp.ATTRIBUTES.getValue(rl) : null
    if (attr) resolvedAttrs.push(attr)
  }

  var removeStaleFromPlayer = function(player) {
    for (var ai = 0; ai < resolvedAttrs.length; ai++) {
      var inst = null
      try { inst = player.getAttribute(resolvedAttrs[ai]) } catch (e) { continue }
      if (!inst) continue
      for (var ui = 0; ui < ALL_STALE_UUIDS.length; ui++) {
        try {
          var uuid = UUID_mp.fromString(ALL_STALE_UUIDS[ui])
          try { inst.removeModifier(uuid) } catch (e) {}
        } catch (e) {}
      }
    }
  }

  global.tick_manaPoolBonuses = function(event) {
    event.server.players.forEach(function(player) {
      try { removeStaleFromPlayer(player) } catch (e) {
        console.warn('[mana_pool] cleanup threw: ' + e)
      }
    })
  }
  global.registerServerTick('tick_manaPoolBonuses', 100, 60)

  // Also run on login so a returning player gets cleared before any spell
  // resolution observes the stale buff.
  PlayerEvents.loggedIn(function(event) {
    try { removeStaleFromPlayer(event.player) } catch (e) {}
  })

  console.log('[IridescentCraft] mana_pool_bonuses reverted to cleanup-only')
} catch (e) {
  console.warn('[IridescentCraft] mana_pool_bonuses (cleanup) bootstrap FAILED: ' + e)
}
