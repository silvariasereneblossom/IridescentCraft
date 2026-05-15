// =============================================================================
// MANA POOL BONUSES -- REVERTED to cleanup-only (2026-05-15)
// =============================================================================
// Original purpose: layered mana-pool buffs (Global +25% MULTIPLY_BASE,
// Archmage +1.0 MULTIPLY_TOTAL, Battlemage/Void Summoner +0.5 MULTIPLY_TOTAL)
// added 2026-04-25 to make magic-spec viable from session 1. Removed
// 2026-05-15 while diagnosing unified-pool drain behavior -- the buffs
// inflated the pool past the point where a small Ars deduction is visible
// in the bar.
//
// Why this isn't just `git rm`: the original applied modifiers via
// `addPermanentModifier`, which writes to player NBT. Existing players
// already have the four UUIDs persisted on their `irons_spellbooks:max_mana`
// attribute. Deleting the script would leave the buffs stuck on every
// online player's data until manual cleanup. This file now CLEARS those
// four UUIDs on every tick so the revert is total.
//
// To restore the buffs later, `git revert` this commit (or copy the
// original-design block back).
// =============================================================================

try {
  var UUID_mp = Java.loadClass('java.util.UUID')
  var ResourceLocation_mp = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var ForgeRegistries_mp = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')

  // Same UUIDs the original applied. Listed here for the cleanup pass.
  var STALE_UUIDS = [
    '9c1e0c01-2e1d-4f0a-9d1f-202000000001',  // global +25%
    '9c1e0c01-2e1d-4f0a-9d1f-202000000011',  // archmage x2
    '9c1e0c01-2e1d-4f0a-9d1f-202000000021',  // battlemage x1.5
    '9c1e0c01-2e1d-4f0a-9d1f-202000000031',  // void_summoner x1.5
  ]

  // ISS max_mana is the only attribute that ever carried these modifiers
  // (the 2026-05-15 unified-pool migration collapsed the Ars-side path).
  var rl = ResourceLocation_mp.tryParse('irons_spellbooks:max_mana')
  var manaAttr = rl ? ForgeRegistries_mp.ATTRIBUTES.getValue(rl) : null

  var removeStaleFromPlayer = function(player) {
    if (!manaAttr) return
    var inst = null
    try { inst = player.getAttribute(manaAttr) } catch (e) { return }
    if (!inst) return
    for (var i = 0; i < STALE_UUIDS.length; i++) {
      try {
        var uuid = UUID_mp.fromString(STALE_UUIDS[i])
        try { inst.removeModifier(uuid) } catch (e) {}
      } catch (e) {}
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
