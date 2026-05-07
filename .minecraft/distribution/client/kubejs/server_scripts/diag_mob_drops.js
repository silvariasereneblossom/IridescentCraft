// =============================================================================
// DIAGNOSTIC -- log unusual mob drops (tier-restricted items, affix gear,
//                anomalous loot from non-boss mobs)
// =============================================================================
// Companion to diag_mob_spawn.js. Captures pre-death state at LivingDeath
// (effects / equipment / vehicle / passengers / NBT keys), schedules a
// 1-tick callback to scan the death position for ItemEntities that were
// just spawned by the entity's loot table. Logs only when an anomaly is
// detected so the [MOBDIAG-DROP] log volume stays manageable.
//
// Trigger conditions (any one fires the dump):
//   - A dropped item id is in the FLAGGED_DROP_IDS list (raw tier-gated
//     materials we don't expect on ordinary mobs)
//   - A dropped item carries Apotheosis affix_data NBT
//   - The mob had affix_data on its own equipment at death time
//   - The mob had a non-vanilla passenger or vehicle (jockey detection)
//
// Why pre-death capture: by the time the 1-tick callback runs, the mob is
// already removed from the world. We snapshot equipment/effects BEFORE
// death so the post-mortem dump is complete.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try)
// =============================================================================

try {
  var MinecraftForge_dmd = Java.loadClass('net.minecraftforge.common.MinecraftForge')
  var LivingDeathEvent_dmd = Java.loadClass('net.minecraftforge.event.entity.living.LivingDeathEvent')
  var EventPriority_dmd = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority')
  var Consumer_dmd = Java.loadClass('java.util.function.Consumer')
  var Mob_dmd = Java.loadClass('net.minecraft.world.entity.Mob')
  var EquipmentSlot_dmd = Java.loadClass('net.minecraft.world.entity.EquipmentSlot')
  var ItemEntity_dmd = Java.loadClass('net.minecraft.world.entity.item.ItemEntity')
  var AABB_dmd = Java.loadClass('net.minecraft.world.phys.AABB')

  // ISS wizards' getItemBySlot is abstract -- calling it throws
  // AbstractMethodError which Rhino's try/catch CANNOT swallow.
  // Hard-skip these before collectEquip(). See mob_scaling_unified.js.
  // Documentation list; the namespace catch-all below is the gate.
  var DMD_BROKEN_ENTITIES = {
    'irons_spellbooks:necromancer':         1,
    'irons_spellbooks:archevoker':          1,
    'irons_spellbooks:cryomancer':          1,
    'irons_spellbooks:pyromancer':          1,
    'irons_spellbooks:priest':              1,
    'irons_spellbooks:apothecarist':        1,
    'irons_spellbooks:cultist':             1,
    'irons_spellbooks:cursed_armor_stand':  1,
    'irons_spellbooks:dead_king':           1,
    'irons_spellbooks:dead_king_corpse':    1
  }

  // Items we never expect to see drop from a normal mob. Anything matching
  // here triggers a forensic dump. Tuned narrow so legit drops (ender_pearl
  // from endermen, totem_of_undying from evokers, nether_star from wither,
  // emerald from villagers) don't trip false positives.
  var FLAGGED_DROP_IDS = {
    'minecraft:diamond':         1,
    'minecraft:diamond_block':   1,
    'minecraft:emerald_block':   1,
    'minecraft:ender_eye':       1,
    'minecraft:netherite_ingot': 1,
    'minecraft:netherite_scrap': 1,
    'minecraft:netherite_block': 1,
    'minecraft:ancient_debris':  1,
    'minecraft:elytra':          1,
    'minecraft:diamond_sword':       1, 'minecraft:diamond_axe':         1,
    'minecraft:diamond_helmet':      1, 'minecraft:diamond_chestplate':  1,
    'minecraft:diamond_leggings':    1, 'minecraft:diamond_boots':       1,
    'minecraft:diamond_pickaxe':     1,
    'minecraft:netherite_sword':     1, 'minecraft:netherite_axe':       1,
    'minecraft:netherite_helmet':    1, 'minecraft:netherite_chestplate': 1,
    'minecraft:netherite_leggings':  1, 'minecraft:netherite_boots':     1,
    'minecraft:enchanted_book':      1, 'minecraft:enchanted_golden_apple': 1
  }

  // KubeJS `entity.type` returns translation-key form, NOT
  // resource-location form. kjs$getId() shim isn't always present on
  // EntityType / Item / MobEffect for our Rhino build. Normalize.
  var entityResId = function(entity) {
    try { return String(entity.getType().builtInRegistryHolder().key().location()) } catch (e) {}
    try {
      var raw = String(entity.getType().toString())
      var m = raw.match(/^entity\.([^.]+)\.(.+)$/)
      if (m) return m[1] + ':' + m[2]
      return raw
    } catch (e) { return '' }
  }
  var itemId = function(item) {
    try { return String(item.builtInRegistryHolder().key().location()) } catch (e) {}
    try { return String(item.toString()) } catch (e) { return '?' }
  }

  // Helpers (parallel to diag_mob_spawn.js; copy rather than share so the
  // two files can be reasoned about independently and removed without
  // breaking each other) -----------------------------------------------------
  var stackInfo = function(stack) {
    if (!stack || stack.isEmpty()) return null
    var info = { id: itemId(stack.getItem()), count: stack.getCount() }
    var tag = stack.getTag()
    if (tag) {
      info.hasAffix = tag.contains('affix_data') ? 1 : 0
      info.tagDump = String(tag)
    }
    return info
  }

  var collectEquip = function(mob) {
    var slots = ['MAINHAND', 'OFFHAND', 'HEAD', 'CHEST', 'LEGS', 'FEET']
    var out = []
    for (var i = 0; i < slots.length; i++) {
      try {
        var slot = EquipmentSlot_dmd.valueOf(slots[i])
        var info = stackInfo(mob.getItemBySlot(slot))
        if (info) { info.slot = slots[i]; out.push(info) }
      } catch (e) { /* abstract entity — skip */ }
    }
    return out
  }

  var passengerSnapshot = function(mob) {
    try {
      var ps = mob.getPassengers()
      if (!ps || ps.isEmpty()) return null
      var out = []
      var iter = ps.iterator()
      while (iter.hasNext()) {
        var p = iter.next()
        out.push({ id: entityResId(p), uuid: String(p.getStringUUID()) })
      }
      return out
    } catch (e) { return null }
  }

  var vehicleSnapshot = function(mob) {
    try {
      var v = mob.getVehicle()
      if (!v) return null
      return { id: entityResId(v), uuid: String(v.getStringUUID()) }
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

  // Death handler ------------------------------------------------------------
  var deathHandler = new Consumer_dmd({
    accept: function(event) {
      try {
        var entity = event.getEntity()
        if (!(entity instanceof Mob_dmd)) return
        var dmdResId = entityResId(entity)
        if (DMD_BROKEN_ENTITIES[dmdResId]) return
        // Belt-and-suspenders: skip the whole irons_spellbooks:
        // namespace. ISS ships 8+ wizard subclasses (apothecarist,
        // cultist, cursed_armor_stand, fire_boss, etc.) all of which
        // can throw AbstractMethodError on getItemBySlot.
        if (dmdResId.indexOf('irons_spellbooks:') === 0) return

        // Snapshot pre-death state -- mob is removed from world before
        // the 1-tick callback fires.
        var pos = entity.position()
        var preState = {
          ts:        Date.now(),
          entity:    dmdResId,
          uuid:      String(entity.getStringUUID()),
          dimension: String(entity.level().dimension().location()),
          pos:       [Math.round(pos.x() * 10) / 10, Math.round(pos.y() * 10) / 10, Math.round(pos.z() * 10) / 10],
          customName: entity.hasCustomName() ? String(entity.getCustomName().getString()) : null,
          tagKeys:   nbtTopKeys(entity),
          equip:     collectEquip(entity),
          passengers: passengerSnapshot(entity),
          vehicle:    vehicleSnapshot(entity),
          attacker: (function() {
            try {
              var src = event.getSource()
              var atk = src ? src.getEntity() : null
              return atk ? entityResId(atk) : null
            } catch (e) { return null }
          })()
        }

        var level = entity.level()

        // 1-tick delayed scan for ItemEntities near death position. Drops
        // that come from the death loot table appear within a small radius
        // of the corpse position in the same tick or the next.
        Utils.server.scheduleInTicks(2, function() {
          try {
            var aabb = AABB_dmd.ofSize(pos, 6, 6, 6)
            var items = level.getEntitiesOfClass(ItemEntity_dmd, aabb)
            var drops = []
            var anyFlaggedItemDrop = false
            var anyAffixDrop = false
            var iter = items.iterator()
            while (iter.hasNext()) {
              var ie = iter.next()
              var stack = ie.getItem()
              var info = stackInfo(stack)
              if (!info) continue
              // Only count items spawned this tick or last (avoid grabbing
              // stale items from earlier kills nearby).
              if (ie.tickCount > 4) continue
              drops.push(info)
              if (FLAGGED_DROP_IDS[info.id]) anyFlaggedItemDrop = true
              if (info.hasAffix) anyAffixDrop = true
            }

            // Filter: must have at least one anomaly to log.
            var preHadAffix = false
            for (var i = 0; i < preState.equip.length; i++) {
              if (preState.equip[i].hasAffix) { preHadAffix = true; break }
            }
            var hadJockey = false
            if (preState.passengers && preState.passengers.length) {
              for (var j = 0; j < preState.passengers.length; j++) {
                if (preState.passengers[j].id !== preState.entity) { hadJockey = true; break }
              }
            }
            if (preState.vehicle && preState.vehicle.id !== preState.entity) hadJockey = true

            if (!(anyFlaggedItemDrop || anyAffixDrop || preHadAffix || hadJockey)) return

            preState.drops = drops
            preState.flags = {
              flaggedDrop:  anyFlaggedItemDrop ? 1 : 0,
              affixDrop:    anyAffixDrop ? 1 : 0,
              preAffixGear: preHadAffix ? 1 : 0,
              jockey:       hadJockey ? 1 : 0
            }
            console.log('[MOBDIAG-DROP] ' + JSON.stringify(preState))
          } catch (e) {
            console.log('[MOBDIAG-DROP] post-tick scan threw: ' + e)
          }
        })
      } catch (e) {
        console.log('[MOBDIAG-DROP] death handler threw: ' + e)
      }
    }
  })

  MinecraftForge_dmd.EVENT_BUS.addListener(EventPriority_dmd.LOW, false,
      LivingDeathEvent_dmd, deathHandler)
  console.log('[MOBDIAG] drop diagnostic armed (filter: flagged-item drop / affix drop / pre-death affix gear / jockey)')
} catch (e) {
  console.log('[MOBDIAG-DROP] init failed: ' + e)
}
