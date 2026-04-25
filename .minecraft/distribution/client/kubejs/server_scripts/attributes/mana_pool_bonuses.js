// =============================================================================
// MANA POOL BONUSES -- global +25% baseline, class-stacked multipliers
// =============================================================================
// Tester directive 2026-04-25: speccing into magic should let you use it as
// a primary form of combat immediately, even if weaker than melee speccing.
// Mana costs early-game were prohibitive in the punishing Archmage +
// Faefolk + Witch-of-Ink combo.
//
// Solution: layered mana-pool buffs.
//   Global  : MULTIPLY_BASE  +0.25  -> every player gets +25% baseline pool
//   Archmage: MULTIPLY_TOTAL +1.00  -> 2x the new base = 2.5x raw default
//   Battlemage / Void Summoner: MULTIPLY_TOTAL +0.50  -> 1.5x the new base
//
// Math (default base = 100):
//   Non-mage    : 100 * (1 + 0.25)             = 125
//   Battlemage  : 100 * (1 + 0.25) * (1 + 0.5) = 187.5
//   Void Summoner: 100 * (1 + 0.25) * (1 + 0.5) = 187.5
//   Archmage    : 100 * (1 + 0.25) * (1 + 1.0) = 250
//
// Applied to BOTH magic systems present in the pack:
//   - irons_spellbooks:max_mana
//   - ars_nouveau:ars_nouveau.perk.max_mana
// If either mod is absent, the attribute lookup returns null and we skip
// silently for that mod -- no error, no spam.
//
// Implementation: Java-interop via Java.loadClass mirroring the pattern in
// AttributeApplier.java (iridescent-modular-spells-mod). Stable UUIDs per
// (class, mod) so the modifier is upsert-able and idempotent across class
// switches. Removed when class changes away.
//
// Cadence: 5s tick, matching class_attribute_bonuses.js.
//
// Memory: feedback_wiki_reference.md (Rhino var-not-const), feedback_jar_audit.md.
// =============================================================================

try {
  var ResourceLocation_mp = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var ForgeRegistries_mp = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
  var AttributeModifier_mp = Java.loadClass('net.minecraft.world.entity.ai.attributes.AttributeModifier')
  var Operation_mp = Java.loadClass('net.minecraft.world.entity.ai.attributes.AttributeModifier$Operation')
  var UUID_mp = Java.loadClass('java.util.UUID')

  // Attribute IDs we target (one per magic system).
  var MANA_ATTRS = [
    'irons_spellbooks:max_mana',
    'ars_nouveau:ars_nouveau.perk.max_mana'
  ]

  // Stable UUIDs. Layout: -2020<class><attr>NN
  // class: 0=global, 1=archmage, 2=battlemage, 3=void_summoner
  // attr : 0=ISS, 1=Ars
  var UUIDS = {
    'global':        ['9c1e0c01-2e1d-4f0a-9d1f-202000000001', '9c1e0c01-2e1d-4f0a-9d1f-202000000002'],
    'archmage':      ['9c1e0c01-2e1d-4f0a-9d1f-202000000011', '9c1e0c01-2e1d-4f0a-9d1f-202000000012'],
    'battlemage':    ['9c1e0c01-2e1d-4f0a-9d1f-202000000021', '9c1e0c01-2e1d-4f0a-9d1f-202000000022'],
    'void_summoner': ['9c1e0c01-2e1d-4f0a-9d1f-202000000031', '9c1e0c01-2e1d-4f0a-9d1f-202000000032']
  }

  // Class -> multiplier (MULTIPLY_TOTAL amount). 0 = no class modifier.
  var CLASS_MULT = {
    'archmage':      1.00,
    'battlemage':    0.50,
    'void_summoner': 0.50
  }

  var GLOBAL_BASE = 0.25  // MULTIPLY_BASE amount

  // Resolve attribute objects once on script load. Skipped attributes
  // (mod absent) are stored as null and bailed at apply time.
  var resolvedAttrs = []
  for (var i = 0; i < MANA_ATTRS.length; i++) {
    var rl = ResourceLocation_mp.tryParse(MANA_ATTRS[i])
    var attr = rl ? ForgeRegistries_mp.ATTRIBUTES.getValue(rl) : null
    resolvedAttrs.push(attr)
    if (!attr) console.log('[mana_pool] attribute not registered (mod absent?): ' + MANA_ATTRS[i])
  }

  var upsertModifier = function(player, attr, uuidStr, name, amount, op) {
    if (!attr) return
    var inst = null
    try { inst = player.getAttribute(attr) } catch (e) { return }
    if (!inst) return
    var uuid = UUID_mp.fromString(uuidStr)
    var existing = null
    try { existing = inst.getModifier(uuid) } catch (e) {}
    if (existing) {
      try { inst.removeModifier(uuid) } catch (e) {}
    }
    if (amount !== 0.0) {
      var m = new AttributeModifier_mp(uuid, name, amount, op)
      try { inst.addPermanentModifier(m) } catch (e) {
        console.warn('[mana_pool] addPermanentModifier failed for ' + name + ': ' + e)
      }
    }
  }

  // Track applied class per player so we can clear stale class modifiers
  // when a class changes.
  var lastClassApplied = {}

  var applyManaPoolBonuses = function(player) {
    var name = player.username
    var playerClass = null
    try { playerClass = getClass(player) } catch (e) { return }  // class_passives.js not loaded yet

    var prev = lastClassApplied[name] || null

    // Global +25% always present (idempotent upsert).
    for (var ai = 0; ai < resolvedAttrs.length; ai++) {
      upsertModifier(player, resolvedAttrs[ai], UUIDS['global'][ai],
                     'icraft.mana_pool.global', GLOBAL_BASE,
                     Operation_mp.MULTIPLY_BASE)
    }

    // Skip class work if class hasn't changed since last application.
    if (playerClass === prev) return

    // Clear any prior-class modifier on both attributes.
    var classKeys = Object.keys(CLASS_MULT)
    for (var ci = 0; ci < classKeys.length; ci++) {
      var k = classKeys[ci]
      for (var aj = 0; aj < resolvedAttrs.length; aj++) {
        // amount=0 -> remove only
        upsertModifier(player, resolvedAttrs[aj], UUIDS[k][aj],
                       'icraft.mana_pool.' + k, 0,
                       Operation_mp.MULTIPLY_TOTAL)
      }
    }

    // Apply current class modifier (if any).
    if (playerClass && CLASS_MULT[playerClass] !== undefined) {
      for (var ak = 0; ak < resolvedAttrs.length; ak++) {
        upsertModifier(player, resolvedAttrs[ak], UUIDS[playerClass][ak],
                       'icraft.mana_pool.' + playerClass,
                       CLASS_MULT[playerClass],
                       Operation_mp.MULTIPLY_TOTAL)
      }
    }

    lastClassApplied[name] = playerClass
  }

  global.tick_manaPoolBonuses = function(event) {
    event.server.players.forEach(function(player) {
      try { applyManaPoolBonuses(player) } catch (e) {
        console.warn('[mana_pool] applyManaPoolBonuses threw: ' + e)
      }
    })
  }
  global.registerServerTick('tick_manaPoolBonuses', 100, 60)

  // Force re-apply on login so class changes made offline are picked up.
  PlayerEvents.loggedIn(function(event) {
    delete lastClassApplied[event.player.username]
  })

  console.log('[IridescentCraft] mana_pool_bonuses loaded')
  console.log('  Global: max_mana +25% (MULTIPLY_BASE)')
  console.log('  Archmage: x2 on top of new base (MULTIPLY_TOTAL +1.00)')
  console.log('  Battlemage: x1.5 on top of new base (MULTIPLY_TOTAL +0.50)')
  console.log('  Void Summoner: x1.5 on top of new base (MULTIPLY_TOTAL +0.50)')
} catch (e) {
  console.warn('[IridescentCraft] mana_pool_bonuses bootstrap FAILED: ' + e)
}
