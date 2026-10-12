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
// Persistence: TRANSIENT modifier (player.modifyAttribute -- remove + add
// transient, keyed by the id string). The 2026-04-25 version used
// addPermanentModifier and produced two cleanup-pass requirements when
// reverted. Transient modifiers stay attached for the session but don't
// write to NBT -- on logout they vanish, on login / the 5 s tick they are
// re-applied. Reverting becomes 'delete the script'.
//
// CLASS DETECTION (2026-10): global.icraft.origin (0_lib_origins.js). The
// inline `execute if entity <name>[nbt=...]` probe this file used never parsed
// (selector brackets need an @-selector) -- production logged
// "[mana_pool] <player> has no mage class" for an Archmage. The buff has
// therefore never been applied before this fix.
//
// CLEANUP: the 8 legacy permanent-modifier UUIDs from the earlier
// mana_pool_bonuses + mana_bridge generations are scrubbed ONCE per player
// (persistentData flag) instead of on every tick for every player forever.
//
// Memory: feedback_permanent_modifier_trap.md.
// =============================================================================

;(function () {
  try {
    var UUID_mp = Java.loadClass('java.util.UUID')
    var ResourceLocation_mp = Java.loadClass('net.minecraft.resources.ResourceLocation')
    var ForgeRegistries_mp = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')

    // ── Active buff: 1.5x ISS max_mana for magic classes (transient) ────────
    var MANA_ATTR_ID = 'irons_spellbooks:max_mana'
    var MAGE_CLASSES = ['archmage', 'battlemage', 'void_summoner']
    var MAGE_MULT = 0.5  // MULTIPLY_TOTAL 0.5 -> 1.5x effective
    var modifierId = function (cls) { return 'icraft.mana_pool.' + cls }

    var manaAttrRl = ResourceLocation_mp.tryParse(MANA_ATTR_ID)
    var manaAttr = manaAttrRl ? ForgeRegistries_mp.ATTRIBUTES.getValue(manaAttrRl) : null

    var warned = {}
    var warnOnce = function (where, e) {
      if (warned[where]) return
      warned[where] = true
      console.warn('[mana_pool] ' + where + ' threw (logged once): ' + e)
    }

    // 'archmage' | 'battlemage' | 'void_summoner' | null
    var mageClassOf = function (player) {
      var id = null
      try { id = global.icraft.origin.get(player, 'class') } catch (e) { return null }
      if (!id) return null
      var bare = id.substring(id.indexOf(':') + 1)
      return MAGE_CLASSES.indexOf(bare) >= 0 ? bare : null
    }

    // Which class modifier this script put on each player this session
    // (uuid -> class). Only used to take the old one off after a respec.
    var appliedClass = {}
    // One-shot proof-of-apply log per (player, class).
    var firstApplySeen = {}

    var applyMageBuff = function (player) {
      if (!manaAttr) return
      var key = String(player.uuid.toString())
      var cls = mageClassOf(player)
      var prev = appliedClass.hasOwnProperty(key) ? appliedClass[key] : null

      if (prev && prev !== cls) {
        // Class changed (or was dropped): take the old class's modifier off.
        try {
          player.removeAttribute(MANA_ATTR_ID, modifierId(prev))
        } catch (e) {
          player.modifyAttribute(MANA_ATTR_ID, modifierId(prev), 0, 'multiply_total')
        }
        delete appliedClass[key]
      }
      if (!cls) return

      // Idempotent upsert; also restores the modifier after a respawn rebuilt
      // the player entity.
      player.modifyAttribute(MANA_ATTR_ID, modifierId(cls), MAGE_MULT, 'multiply_total')
      appliedClass[key] = cls

      var diagKey = key + ':' + cls
      if (!firstApplySeen[diagKey]) {
        firstApplySeen[diagKey] = true
        var preview = '?'
        try {
          var inst = player.getAttribute(manaAttr)
          if (inst) preview = inst.getValue()
        } catch (e) {}
        console.log('[mana_pool] applied 1.5x ' + cls + ' buff to ' + player.username +
          '; aggregated max_mana=' + preview)
      }
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
    // Parsed / resolved ONCE at load (was 32 UUID parses per player per tick).
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

    var update = function (player) {
      try { scrubStaleOnce(player) } catch (e) { warnOnce('legacy scrub', e) }
      try { applyMageBuff(player) } catch (e) { warnOnce('applyMageBuff', e) }
    }

    // ── Tick + login wiring ────────────────────────────────────────────────
    global.tick_manaPoolBonuses = function (event) {
      event.server.players.forEach(update)
    }
    global.registerServerTick('tick_manaPoolBonuses', 100, 60)

    PlayerEvents.loggedIn(icraft.guard('attributes/mana_pool_bonuses', 'PlayerEvents.loggedIn', function (event) { update(event.player) }))
    PlayerEvents.respawned(icraft.guard('attributes/mana_pool_bonuses', 'PlayerEvents.respawned', function (event) { update(event.player) }))
    PlayerEvents.loggedOut(icraft.guard('attributes/mana_pool_bonuses', 'PlayerEvents.loggedOut', function (event) {
      try { delete appliedClass[String(event.player.uuid.toString())] } catch (e) {}
    }))

    console.log('[IridescentCraft] mana_pool_bonuses v2 loaded')
    console.log('  Mage classes (archmage / battlemage / void_summoner): 1.5x ISS max_mana (transient)')
    console.log('  Cleanup: 8 legacy UUIDs across 4 attributes (once per player)')
  } catch (e) {
    console.warn('[IridescentCraft] mana_pool_bonuses bootstrap FAILED: ' + e)
  }
})()
