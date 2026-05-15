// =============================================================================
// MANA POOL BONUSES (2026-05-15 v2) — flat 1.5x for the three magic classes
// =============================================================================
// Design intent: magic classes get a meaningful pool boost without the
// layered complexity of the 2026-04-25 version (Global +25% + Archmage 2x +
// Battlemage/VoidSummoner 1.5x). Single rule, single multiplier across
// archmage / battlemage / void_summoner -> 1.5x ISS max_mana.
//
// Operation: MULTIPLY_TOTAL with amount 0.5 -> final = base * (1 + 0.5).
// Applied to `irons_spellbooks:max_mana` only (the unified pool's canonical
// attribute; Ars perk attributes are decorative since 2026-05-15).
//
// Persistence: addTransientModifier this time. The 2026-04-25 version used
// addPermanentModifier and produced two cleanup-pass requirements when
// reverted. Transient modifiers stay attached for the session but don't
// write to NBT -- on logout they vanish, on login the per-tick / login
// handlers re-apply. Reverting becomes 'delete the script'.
//
// CLEANUP: continues scrubbing the 8 legacy UUIDs from earlier
// mana_pool_bonuses + mana_bridge generations until all online players
// have been ticked at least once post-revert. Safe to remove the cleanup
// arrays once the alpha-tester roster has cycled through.
//
// Memory: feedback_permanent_modifier_trap.md.
// =============================================================================

try {
  var UUID_mp = Java.loadClass('java.util.UUID')
  var ResourceLocation_mp = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var ForgeRegistries_mp = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
  var AttributeModifier_mp = Java.loadClass('net.minecraft.world.entity.ai.attributes.AttributeModifier')
  var Operation_mp = Java.loadClass('net.minecraft.world.entity.ai.attributes.AttributeModifier$Operation')

  // ── Active buff: 1.5x ISS max_mana for magic classes (transient) ────────
  // Fresh UUID family (2026-05-15 v2 prefix) so the cleanup pass below
  // can scrub the legacy 2026-04-25 UUIDs without touching these.
  var MAGE_CLASS_UUIDS = {
    'archmage':      'd0e1f2a3-b4c5-4d6e-8f70-202505150011',
    'battlemage':    'd0e1f2a3-b4c5-4d6e-8f70-202505150021',
    'void_summoner': 'd0e1f2a3-b4c5-4d6e-8f70-202505150031',
  }
  var MAGE_MULT = 0.5  // MULTIPLY_TOTAL 0.5 -> 1.5x effective

  var manaAttrRl = ResourceLocation_mp.tryParse('irons_spellbooks:max_mana')
  var manaAttr = manaAttrRl ? ForgeRegistries_mp.ATTRIBUTES.getValue(manaAttrRl) : null

  var applyMageBuff = function(player) {
    if (!manaAttr) return
    var inst = null
    try { inst = player.getAttribute(manaAttr) } catch (e) { return }
    if (!inst) return

    // 2026-05-15: bypass the class_passives cache here -- class_passives's
    // own loggedIn handler DELETES the cache entry without re-populating,
    // and refreshClassCache only runs every 600 ticks. Our login handler
    // was firing before the next refresh, so getClass() returned null and
    // the mage buff never applied until 30s post-login. Direct hasClass
    // probes via /execute are 3 commands per call (cheap) and always
    // current. The tick handler still benefits from the cache, but this
    // path uses the canonical hasClass to be timing-independent.
    var playerClass = null
    var mageList = ['archmage', 'battlemage', 'void_summoner']
    for (var ci = 0; ci < mageList.length; ci++) {
      try {
        if (hasClass(player, mageList[ci])) { playerClass = mageList[ci]; break }
      } catch (e) {}
    }

    // Walk all mage-class UUIDs. For the active class, apply (idempotent
    // upsert). For inactive classes, remove (returns silently if absent).
    var classes = Object.keys(MAGE_CLASS_UUIDS)
    for (var i = 0; i < classes.length; i++) {
      var k = classes[i]
      var uuid
      try { uuid = UUID_mp.fromString(MAGE_CLASS_UUIDS[k]) } catch (e) { continue }
      try { inst.removeModifier(uuid) } catch (e) {}
      if (k === playerClass) {
        try {
          var m = new AttributeModifier_mp(uuid, 'icraft.mana_pool.' + k, MAGE_MULT, Operation_mp.MULTIPLY_TOTAL)
          inst.addTransientModifier(m)
        } catch (e) {
          console.warn('[mana_pool] addTransientModifier failed for ' + k + ': ' + e)
        }
      }
    }
  }

  // ── Cleanup pass: legacy UUIDs from prior generations ──────────────────
  // Two generations of mana scripts wrote permanent attribute modifiers
  // that survived their script deletion:
  //   mana_pool_bonuses (2026-04-25): 4 UUIDs, MULTIPLY_BASE / MULTIPLY_TOTAL
  //   mana_bridge       (2026-05-14): 4 UUIDs across 4 attributes
  // Cleanup continues until alpha-tester roster has cycled through.
  var STALE_POOL_UUIDS = [
    '9c1e0c01-2e1d-4f0a-9d1f-202000000001',  // legacy global +25%
    '9c1e0c01-2e1d-4f0a-9d1f-202000000011',  // legacy archmage x2
    '9c1e0c01-2e1d-4f0a-9d1f-202000000021',  // legacy battlemage x1.5
    '9c1e0c01-2e1d-4f0a-9d1f-202000000031',  // legacy void_summoner x1.5
  ]
  var STALE_BRIDGE_UUIDS = [
    'b1d9e201-0000-0000-0000-100000000001',
    'b1d9e201-0000-0000-0000-100000000002',
    'b1d9e201-0000-0000-0000-100000000003',
    'b1d9e201-0000-0000-0000-100000000004',
  ]
  var STALE_TARGET_ATTRS = [
    'irons_spellbooks:max_mana',
    'irons_spellbooks:mana_regen',
    'ars_nouveau:ars_nouveau.perk.max_mana',
    'ars_nouveau:ars_nouveau.perk.mana_regen',
  ]
  var STALE_RESOLVED = []
  for (var ai = 0; ai < STALE_TARGET_ATTRS.length; ai++) {
    var rl = ResourceLocation_mp.tryParse(STALE_TARGET_ATTRS[ai])
    var attr = rl ? ForgeRegistries_mp.ATTRIBUTES.getValue(rl) : null
    if (attr) STALE_RESOLVED.push(attr)
  }
  var ALL_STALE = STALE_POOL_UUIDS.concat(STALE_BRIDGE_UUIDS)

  var scrubStale = function(player) {
    for (var ai = 0; ai < STALE_RESOLVED.length; ai++) {
      var inst = null
      try { inst = player.getAttribute(STALE_RESOLVED[ai]) } catch (e) { continue }
      if (!inst) continue
      for (var ui = 0; ui < ALL_STALE.length; ui++) {
        try {
          var uuid = UUID_mp.fromString(ALL_STALE[ui])
          try { inst.removeModifier(uuid) } catch (e) {}
        } catch (e) {}
      }
    }
  }

  // ── Tick + login wiring ────────────────────────────────────────────────
  global.tick_manaPoolBonuses = function(event) {
    event.server.players.forEach(function(player) {
      try { scrubStale(player) } catch (e) {}
      try { applyMageBuff(player) } catch (e) {
        console.warn('[mana_pool] applyMageBuff threw: ' + e)
      }
    })
  }
  global.registerServerTick('tick_manaPoolBonuses', 100, 60)

  PlayerEvents.loggedIn(function(event) {
    try { scrubStale(event.player) } catch (e) {}
    try { applyMageBuff(event.player) } catch (e) {}
  })

  console.log('[IridescentCraft] mana_pool_bonuses v2 loaded')
  console.log('  Mage classes (archmage / battlemage / void_summoner): 1.5x ISS max_mana (transient)')
  console.log('  Cleanup: 8 legacy UUIDs across 4 attributes (per tick + login)')
} catch (e) {
  console.warn('[IridescentCraft] mana_pool_bonuses bootstrap FAILED: ' + e)
}
