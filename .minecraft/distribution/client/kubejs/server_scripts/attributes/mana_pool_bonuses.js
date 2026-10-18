// @file kubejs/server_scripts/attributes/mana_pool_bonuses.js
// @events PlayerEvents.loggedIn
// =============================================================================
// MANA POOL BONUSES -- now only the one-time scrub of legacy permanent modifiers
// =============================================================================
// 2026-10-17 (the operator's ruling on decision list entry 129, "Drop the
// script's x1.5"): this file no longer buffs the mage classes' pool. Its v2
// (2026-05-15) put a transient x1.5 (multiply_total 0.5) on
// irons_spellbooks:max_mana for archmage / battlemage / void_summoner, as the
// "single rule, single multiplier" of the design. It was not the only one: each
// of those classes has an Origins power on the same attribute (multiply_base
// +1.5 Archmage "Mana Reservoir", +0.9 Battlemage / Void Summoner). Its class
// check never worked until 2026-10 (an `execute if entity <name>[nbt=...]` that
// never parsed), so for months the pools were the powers' alone; from 10-10 the
// two multiplied: measured on a full pack with the real origins, Archmage 375
// (3.75x), Battlemage and Void Summoner 285 (2.85x) from a base of 100. Without
// it: 250 (2.5x), 190, 190, what the Origins texts say. The modifier was
// transient, so the restart that deploys this takes it off everyone.
//
// What stays: the 8 legacy PERMANENT modifiers of the 2026-04-25 version and of
// mana_bridge (2026-05-14) are scrubbed ONCE per player, at login (persistentData
// flag). They are saved in a player's NBT, so a player who has not logged in
// since may still carry one.
//
// Memory: feedback_permanent_modifier_trap.md.
// =============================================================================

;(function () {
  try {
    var UUID_mp = Java.loadClass('java.util.UUID')
    var ResourceLocation_mp = Java.loadClass('net.minecraft.resources.ResourceLocation')
    var ForgeRegistries_mp = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')

    // once per failing block per script load: the table and the wording of "once" are
    // global.icraft.core.warnOnce's (0_lib_core.js); this only adds the script's name
    var warnThrew = function (where, e) {
      global.icraft.core.warnOnce('attributes/mana_pool_bonuses:' + where, '[mana_pool] ' + where + ' threw: ' + e)
    }

    // ── Cleanup pass: legacy UUIDs from prior generations ──────────────────
    // Two generations of mana scripts wrote permanent attribute modifiers
    // that survived their script deletion:
    //   mana_pool_bonuses (2026-04-25): 4 UUIDs, MULTIPLY_BASE / MULTIPLY_TOTAL
    //   mana_bridge       (2026-05-14): 4 UUIDs across 4 attributes
    var STALE_UUID_STRINGS = [
      '9c1e0c01-2e1d-4f0a-9d1f-202000000001',  // legacy global +25%
      '9c1e0c01-2e1d-4f0a-9d1f-202000000011',  // legacy archmage x2
      '9c1e0c01-2e1d-4f0a-9d1f-202000000021',  // legacy battlemage x1.5
      '9c1e0c01-2e1d-4f0a-9d1f-202000000031',  // legacy void_summoner x1.5
      'b1d9e201-0000-0000-0000-100000000001',  // mana_bridge
      'b1d9e201-0000-0000-0000-100000000002',
      'b1d9e201-0000-0000-0000-100000000003',
      'b1d9e201-0000-0000-0000-100000000004'
    ]
    var STALE_TARGET_ATTRS = [
      'irons_spellbooks:max_mana',
      'irons_spellbooks:mana_regen',
      'ars_nouveau:ars_nouveau.perk.max_mana',
      'ars_nouveau:ars_nouveau.perk.mana_regen'
    ]
    // Parsed / resolved ONCE at load.
    var STALE_UUIDS = []
    STALE_UUID_STRINGS.forEach(function (s) {
      try { STALE_UUIDS.push(UUID_mp.fromString(s)) } catch (e) {}
    })
    var STALE_ATTRS = []
    STALE_TARGET_ATTRS.forEach(function (id) {
      try {
        var staleRl = ResourceLocation_mp.tryParse(id)
        var staleAttr = staleRl ? ForgeRegistries_mp.ATTRIBUTES.getValue(staleRl) : null
        if (staleAttr) STALE_ATTRS.push(staleAttr)
      } catch (e) {}
    })

    var SCRUB_FLAG = 'icraft_mana_legacy_scrubbed'

    // Runs the 8x4 removeModifier sweep once per player, ever. The modifiers
    // being removed are PERMANENT (saved in the player's NBT), so once they
    // are gone they stay gone -- there is nothing to re-check.
    var scrubStaleOnce = function (player) {
      var data = player.persistentData
      if (data.getBoolean(SCRUB_FLAG)) return
      for (var ai = 0; ai < STALE_ATTRS.length; ai++) {
        var inst = null
        try { inst = player.getAttribute(STALE_ATTRS[ai]) } catch (e) { continue }
        if (!inst) continue
        for (var ui = 0; ui < STALE_UUIDS.length; ui++) {
          try { inst.removeModifier(STALE_UUIDS[ui]) } catch (e) {}
        }
      }
      data.putBoolean(SCRUB_FLAG, true)
    }

    PlayerEvents.loggedIn(icraft.guard('attributes/mana_pool_bonuses', 'PlayerEvents.loggedIn', function (event) {
      try { scrubStaleOnce(event.player) } catch (e) { warnThrew('legacy scrub', e) }
    }))

    console.log('[IridescentCraft] mana_pool_bonuses v3 loaded: no pool buff (the classes\' Origins powers set the pool)')
    console.log('  Cleanup: 8 legacy UUIDs across 4 attributes (once per player, at login)')
  } catch (e) {
    console.warn('[IridescentCraft] mana_pool_bonuses bootstrap FAILED: ' + e)
  }
})()
