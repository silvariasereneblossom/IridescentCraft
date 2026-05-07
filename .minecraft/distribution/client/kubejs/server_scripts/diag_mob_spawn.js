// =============================================================================
// DIAGNOSTIC -- log unusual mob spawns (affix gear, non-vanilla effects,
//                jockey patterns, tier-restricted equipment)
// =============================================================================
// Forensic instrumentation: when a hostile mob spawns with anomalous
// state, dump the relevant info to console.log under the [MOBDIAG]
// prefix so it can be greped out into mobdiag.log post-session.
//
// Trigger conditions (any one fires the dump):
//   - Equipment slot has an Apotheosis `affix_data` NBT compound
//   - Equipment slot has tier-restricted item id (diamond/netherite gear,
//     enchanted gold, custom-mod weapons we want to flag)
//   - Mob has any active MobEffect at spawn time (vanilla mobs spawn
//     clean -- regen/dolphin's grace etc. on a wild spider is anomalous)
//   - Mob has a passenger of a different entity type (jockey detection)
//
// Dumps:
//   - Entity id, dimension, position, custom name (if any)
//   - Top-level NBT compound keys (catches mod stamps like apoth.boss,
//     improvedmobs, bygonenether tags, etc.)
//   - HandItems + ArmorItems with item id and full NBT toString
//   - Active effects with id + amplifier + duration
//   - Vehicle and Passengers with entity ids
//
// Pure observation. No mitigation. Once we know the source, the fix
// happens in a separate commit.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try)
// =============================================================================

try {
  var MinecraftForge_dms = Java.loadClass('net.minecraftforge.common.MinecraftForge')
  var EntityJoinLevelEvent_dms = Java.loadClass('net.minecraftforge.event.entity.EntityJoinLevelEvent')
  var EventPriority_dms = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority')
  var Consumer_dms = Java.loadClass('java.util.function.Consumer')
  var Mob_dms = Java.loadClass('net.minecraft.world.entity.Mob')
  var EquipmentSlot_dms = Java.loadClass('net.minecraft.world.entity.EquipmentSlot')

  // Entities with abstract getItemBySlot / setItemSlot. Calling these
  // throws AbstractMethodError, which Rhino's try/catch CANNOT catch
  // (extends java.lang.Error, not Exception). Must early-exit BEFORE
  // any item-slot access. Keep in sync with the BROKEN_ENTITIES Set
  // in scaling/mob_scaling_unified.js -- those crashed the server on
  // 2026-05-06 22:41 + 22:49 because this guard wasn't in place.
  var DMS_BROKEN_ENTITIES = {
    'irons_spellbooks:necromancer': 1,
    'irons_spellbooks:archevoker':  1,
    'irons_spellbooks:cryomancer':  1,
    'irons_spellbooks:pyromancer':  1,
    'irons_spellbooks:priest':      1
  }

  // Items we never expect to see in equipment on a freshly spawned mob.
  // diamond / netherite gear lands here from Apotheosis-style spawn-equip
  // injectors and is the smoking gun for mob-farm gear flooding.
  var FLAGGED_EQUIP_IDS = {
    'minecraft:diamond_sword': 1, 'minecraft:diamond_axe': 1,
    'minecraft:diamond_helmet': 1, 'minecraft:diamond_chestplate': 1,
    'minecraft:diamond_leggings': 1, 'minecraft:diamond_boots': 1,
    'minecraft:netherite_sword': 1, 'minecraft:netherite_axe': 1,
    'minecraft:netherite_helmet': 1, 'minecraft:netherite_chestplate': 1,
    'minecraft:netherite_leggings': 1, 'minecraft:netherite_boots': 1,
    'minecraft:diamond': 1, 'minecraft:ender_eye': 1,
    'minecraft:netherite_ingot': 1, 'minecraft:elytra': 1
  }

  // Helpers ------------------------------------------------------------------
  var getStackInfo = function(stack) {
    if (!stack || stack.isEmpty()) return null
    var info = { id: String(stack.getItem().kjs$getId()), count: stack.getCount() }
    var tag = stack.getTag()
    if (tag) {
      info.tagKeys = []
      var keyIter = tag.getAllKeys().iterator()
      while (keyIter.hasNext()) info.tagKeys.push(String(keyIter.next()))
      info.hasAffix = tag.contains('affix_data') ? 1 : 0
      info.tagDump = String(tag)
    }
    return info
  }

  var collectEquipment = function(mob) {
    var slots = ['MAINHAND', 'OFFHAND', 'HEAD', 'CHEST', 'LEGS', 'FEET']
    var out = []
    for (var i = 0; i < slots.length; i++) {
      try {
        var slot = EquipmentSlot_dms.valueOf(slots[i])
        var info = getStackInfo(mob.getItemBySlot(slot))
        if (info) { info.slot = slots[i]; out.push(info) }
      } catch (e) { /* abstract entity slot — skip */ }
    }
    return out
  }

  var collectEffects = function(mob) {
    var out = []
    try {
      var iter = mob.getActiveEffects().iterator()
      while (iter.hasNext()) {
        var e = iter.next()
        out.push({
          id: String(e.getEffect().kjs$getId()),
          amp: e.getAmplifier(),
          duration: e.getDuration()
        })
      }
    } catch (e) { /* skip */ }
    return out
  }

  var passengerInfo = function(mob) {
    try {
      var ps = mob.getPassengers()
      if (!ps || ps.isEmpty()) return null
      var out = []
      var iter = ps.iterator()
      while (iter.hasNext()) {
        var p = iter.next()
        out.push({ id: String(p.getType().kjs$getId()), uuid: String(p.getStringUUID()) })
      }
      return out
    } catch (e) { return null }
  }

  var vehicleInfo = function(mob) {
    try {
      var v = mob.getVehicle()
      if (!v) return null
      return { id: String(v.getType().kjs$getId()), uuid: String(v.getStringUUID()) }
    } catch (e) { return null }
  }

  var nbtTopKeys = function(mob) {
    try {
      var tag = new (Java.loadClass('net.minecraft.nbt.CompoundTag'))()
      mob.saveWithoutId(tag)
      var keys = []
      var iter = tag.getAllKeys().iterator()
      while (iter.hasNext()) keys.push(String(iter.next()))
      return keys
    } catch (e) { return [] }
  }

  // Predicates ---------------------------------------------------------------
  var hasAffixGear = function(equip) {
    for (var i = 0; i < equip.length; i++) if (equip[i].hasAffix) return true
    return false
  }
  var hasFlaggedEquip = function(equip) {
    for (var i = 0; i < equip.length; i++) if (FLAGGED_EQUIP_IDS[equip[i].id]) return true
    return false
  }
  var hasJockey = function(mob, passengers) {
    if (!passengers || passengers.length === 0) return false
    var selfId = String(mob.getType().kjs$getId())
    for (var i = 0; i < passengers.length; i++) if (passengers[i].id !== selfId) return true
    return false
  }

  // Main handler -------------------------------------------------------------
  var spawnHandler = new Consumer_dms({
    accept: function(event) {
      try {
        var entity = event.getEntity()
        if (!(entity instanceof Mob_dms)) return
        // Skip our own custom passive entities -- only hostile/neutral mobs
        // are interesting here. Mob class includes both, accept and let
        // filter conditions decide.

        // Hard skip on entities with abstract getItemBySlot. Their
        // AbstractMethodError escapes Rhino's try/catch and crashes
        // the server tick.
        var dmsResId = String(entity.getType().kjs$getId())
        if (DMS_BROKEN_ENTITIES[dmsResId]) return

        var equip = collectEquipment(entity)
        var effects = collectEffects(entity)
        var passengers = passengerInfo(entity)
        var vehicle = vehicleInfo(entity)

        // Filter: at least one anomaly must be present.
        var anomalyAffix    = hasAffixGear(equip)
        var anomalyFlagged  = hasFlaggedEquip(equip)
        var anomalyEffects  = effects.length > 0
        var anomalyJockey   = hasJockey(entity, passengers) || (vehicle != null)
        if (!(anomalyAffix || anomalyFlagged || anomalyEffects || anomalyJockey)) return

        var pos = entity.position()
        var record = {
          ts:        Date.now(),
          entity:    String(entity.getType().kjs$getId()),
          uuid:      String(entity.getStringUUID()),
          dimension: String(entity.level().dimension().location()),
          pos:       [Math.round(pos.x() * 10) / 10, Math.round(pos.y() * 10) / 10, Math.round(pos.z() * 10) / 10],
          customName: entity.hasCustomName() ? String(entity.getCustomName().getString()) : null,
          tagKeys:   nbtTopKeys(entity),
          equip:     equip,
          effects:   effects,
          passengers: passengers,
          vehicle:    vehicle,
          flags:     {
            affixGear:    anomalyAffix    ? 1 : 0,
            flaggedItem:  anomalyFlagged  ? 1 : 0,
            effects:      anomalyEffects  ? 1 : 0,
            jockey:       anomalyJockey   ? 1 : 0
          }
        }
        console.log('[MOBDIAG-SPAWN] ' + JSON.stringify(record))
      } catch (e) {
        console.log('[MOBDIAG-SPAWN] handler threw: ' + e)
      }
    }
  })

  MinecraftForge_dms.EVENT_BUS.addListener(EventPriority_dms.LOW, false,
      EntityJoinLevelEvent_dms, spawnHandler)
  console.log('[MOBDIAG] spawn diagnostic armed (filter: affix gear / flagged item / active effects / jockey)')
} catch (e) {
  console.log('[MOBDIAG-SPAWN] init failed: ' + e)
}
