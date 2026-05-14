// =============================================================================
// MANA BRIDGE -- bidirectional ISS <-> Ars Nouveau attribute mirror
// =============================================================================
// Design intent (Silvaria, 2026-05-14): "mana regen and mana are universal".
// Sources that buff one mod's mana attribute should affect the other mod's
// equivalent. A player wearing an ISS-themed ring gets the regen boost when
// using an Ars wand; an Ars perk on max_mana is reflected in the ISS mana pool.
//
// Bridge math (per attribute pair):
//   1. Sum non-bridge modifiers on attribute A  -> aGearSum
//   2. Sum non-bridge modifiers on attribute B  -> bGearSum
//   3. Upsert bridge_a2b modifier on B = aGearSum
//   4. Upsert bridge_b2a modifier on A = bGearSum
//   Stable: bridge mods are excluded from the gear sum, so re-running the
//   loop converges to the same values.
//
// Bridged attributes:
//   ISS irons_spellbooks:max_mana            <->  Ars ars_nouveau.perk.max_mana
//   ISS irons_spellbooks:mana_regen          <->  Ars ars_nouveau.perk.mana_regen
//
// Tooltip impact: items stay mono-namespace (ISS books emit only ISS attrs,
// Ars books only Ars). Player effectively sees a single attribute system on
// each item; the bridge silently mirrors at the player level. The intelligent
// gem also stays ISS-only -- bridge handles Ars side.
//
// Cadence: 1 Hz tick. Ars max_mana cache refreshed on value change only.
//
// Operations: ADDITION for max_mana (matches both mods' native op).
// MULTIPLY_BASE for mana_regen (ISS native op; close enough for Ars MULTIPLY_TOTAL
// gear -- minor compounding mismatch is acceptable, gives ~95% accurate equivalence).
//
// Pairs with:
//   datapack_sources/icraft_iss_gem_buffs/  -- repurposed ISS gem values
//   kubejs/server_scripts/attributes/mana_pool_bonuses.js  -- baseline +25% mana
// =============================================================================

try {
  var ResourceLocation_mbr = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var ForgeRegistries_mbr = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
  var AttributeModifier_mbr = Java.loadClass('net.minecraft.world.entity.ai.attributes.AttributeModifier')
  var Operation_mbr = Java.loadClass('net.minecraft.world.entity.ai.attributes.AttributeModifier$Operation')
  var UUID_mbr = Java.loadClass('java.util.UUID')

  // Each bridge: pair of attribute IDs, operation, and two deterministic UUIDs
  // (one for the iss->ars modifier, one for the ars->iss modifier).
  var BRIDGES = [
    {
      label: 'max_mana',
      issAttrId: 'irons_spellbooks:max_mana',
      arsAttrId: 'ars_nouveau:ars_nouveau.perk.max_mana',
      op: Operation_mbr.ADDITION,
      issToArsUuid: 'b1d9e201-0000-0000-0000-100000000001',
      arsToIssUuid: 'b1d9e201-0000-0000-0000-100000000002',
      refreshArsCache: true,  // Ars caches max_mana; needs explicit invalidate
    },
    {
      label: 'mana_regen',
      issAttrId: 'irons_spellbooks:mana_regen',
      arsAttrId: 'ars_nouveau:ars_nouveau.perk.mana_regen',
      op: Operation_mbr.MULTIPLY_BASE,
      issToArsUuid: 'b1d9e201-0000-0000-0000-100000000003',
      arsToIssUuid: 'b1d9e201-0000-0000-0000-100000000004',
      refreshArsCache: false,
    },
  ]

  // Resolve attribute objects once at script load (mod may be absent).
  var resolveAttr = function(id) {
    try {
      var rl = ResourceLocation_mbr.tryParse(id)
      return rl ? ForgeRegistries_mbr.ATTRIBUTES.getValue(rl) : null
    } catch (e) { return null }
  }
  for (var bi = 0; bi < BRIDGES.length; bi++) {
    BRIDGES[bi].issAttr = resolveAttr(BRIDGES[bi].issAttrId)
    BRIDGES[bi].arsAttr = resolveAttr(BRIDGES[bi].arsAttrId)
    BRIDGES[bi].issToArsUuid_obj = UUID_mbr.fromString(BRIDGES[bi].issToArsUuid)
    BRIDGES[bi].arsToIssUuid_obj = UUID_mbr.fromString(BRIDGES[bi].arsToIssUuid)
  }

  // Sum amounts of all attribute modifiers EXCLUDING our own bridge mods.
  // Used to compute "gear-only" contribution that we mirror into the other attr.
  var sumGear = function(inst, excludeUuids) {
    if (!inst) return 0.0
    var total = 0.0
    var iter = inst.getModifiers().iterator()
    while (iter.hasNext()) {
      var mod = iter.next()
      var uuid = mod.getId()
      var excluded = false
      for (var i = 0; i < excludeUuids.length; i++) {
        if (excludeUuids[i].equals(uuid)) { excluded = true; break }
      }
      if (!excluded) total += mod.getAmount()
    }
    return total
  }

  // Idempotent upsert: removes any existing modifier with this UUID, then
  // re-adds with the new amount. amount=0 just removes.
  var upsert = function(inst, uuidObj, name, amount, op) {
    if (!inst) return
    try { inst.removeModifier(uuidObj) } catch (e) {}
    if (amount === 0.0 || amount !== amount /* NaN */) return
    var m = new AttributeModifier_mbr(uuidObj, name, amount, op)
    try { inst.addPermanentModifier(m) } catch (e) {}
  }

  // Per-player last-applied tracking, used to skip Ars cache refresh when
  // the bridge value hasn't changed this tick.
  var lastBridgeValues = {}

  var applyBridges = function(player) {
    var key = player.username
    var prev = lastBridgeValues[key] || {}
    var maxManaChanged = false

    for (var bi = 0; bi < BRIDGES.length; bi++) {
      var b = BRIDGES[bi]
      if (!b.issAttr || !b.arsAttr) continue
      var issInst = null
      var arsInst = null
      try { issInst = player.getAttribute(b.issAttr) } catch (e) {}
      try { arsInst = player.getAttribute(b.arsAttr) } catch (e) {}
      if (!issInst || !arsInst) continue

      var issGearSum = sumGear(issInst, [b.arsToIssUuid_obj])
      var arsGearSum = sumGear(arsInst, [b.issToArsUuid_obj])

      var modName = 'icraft.mana_bridge.' + b.label

      upsert(arsInst, b.issToArsUuid_obj, modName, issGearSum, b.op)
      upsert(issInst, b.arsToIssUuid_obj, modName, arsGearSum, b.op)

      var bridgeKey = b.label
      var newSig = issGearSum + ':' + arsGearSum
      if (b.refreshArsCache && prev[bridgeKey] !== newSig) {
        maxManaChanged = true
      }
      prev[bridgeKey] = newSig
    }

    // Ars caches max_mana via IManaCap.setMaxMana(int) and only recomputes
    // on PlayerLoggedInEvent / Respawn / Equip changes. Force-kick the cache
    // when our max_mana bridge value actually changes.
    if (maxManaChanged) {
      try {
        var manaUtil = Java.loadClass('com.hollingsworth.arsnouveau.api.util.ManaUtil')
        var capReg = Java.loadClass('com.hollingsworth.arsnouveau.setup.registry.CapabilityRegistry')
        var result = manaUtil.calcMaxMana(player)
        var capOpt = capReg.getMana(player)
        if (capOpt) {
          var cap = capOpt.orElse(null)
          if (cap) cap.setMaxMana(result.getRealMax())
        }
      } catch (e) {
        // Ars absent or API moved -- silent skip
      }
    }

    lastBridgeValues[key] = prev
  }

  // 1 Hz tick cadence
  ServerEvents.tick(event => {
    if (event.server.tickCount % 20 !== 0) return
    var iter = event.server.players.iterator()
    while (iter.hasNext()) {
      var player = iter.next()
      try { applyBridges(player) } catch (e) {}
    }
  })

  console.log('[mana_bridge] loaded (ISS <-> Ars: max_mana ADD, mana_regen MUL_BASE)')
} catch (e) {
  console.warn('[mana_bridge] bootstrap FAILED: ' + e)
}
