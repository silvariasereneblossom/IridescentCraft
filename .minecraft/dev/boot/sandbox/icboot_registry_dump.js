// =============================================================================
// icboot_registry_dump.js - SANDBOX ONLY
// =============================================================================
// Copied by .minecraft/dev/boot (icboot.py) into the offline boot rig's
// kubejs/server_scripts and nowhere else. It must never sit in a distro tree:
// it walks every registry on the server thread once the world is loaded.
//
// What it writes (JSON, under <run folder>/icboot-out/, read back by icboot.py):
//   registries.json    every registry of the server (static and datapack), ids only
//   entities.json      entity type -> mob category, tags, base attributes (living entities)
//   world.json         dimensions, game rules with their values in a fresh world
//   loot_tables.json   ids of the loot tables the game holds after the data load
//   recipes.json       "<id>\t<type>" of every recipe after the script pass
//   advancements.json  advancement ids
//   done.json          counts, per-section errors, time taken (written last: the tool waits for it)
//
// It never logs at WARN or ERROR: a failing section is recorded in done.json,
// so the helper cannot add a finding to the boot-log checker.
// Engine rules kept on purpose: `var` only, String(x) around every Java string,
// explicit iterators, one try per section.
// =============================================================================

(function () {
  var OUT = 'icboot-out/'
  var TAG = '[icboot] '
  var DELAY_TICKS = 20

  var BuiltInRegistries = Java.loadClass('net.minecraft.core.registries.BuiltInRegistries')

  var ArrayList = Java.loadClass('java.util.ArrayList')

  // A Java collection is copied into an ArrayList before it is read: the engine cannot call
  // the methods of the JDK's private collection classes (Stream.toList() returns one, and
  // size() on it fails with IllegalAccessException).
  var listOf = function (collection) {
    return new ArrayList(collection)
  }

  var keysOf = function (collection) {
    var out = []
    var list = listOf(collection)
    for (var i = 0; i < list.size(); i++) out.push(String(list.get(i)))
    return out
  }

  var sections = {}

  // every registry the server holds: the static ones and the ones the datapacks filled
  sections.registries = function (server) {
    var out = {}
    var list = listOf(server.registryAccess().registries().toList())
    for (var i = 0; i < list.size(); i++) {
      var e = list.get(i)
      out[String(e.key().location())] = keysOf(e.value().keySet())
    }
    // Forge registries that have no vanilla wrapper are not in the access above
    try {
      var RegistryManager = Java.loadClass('net.minecraftforge.registries.RegistryManager')
      var names = listOf(RegistryManager.getRegistryNamesForSyncToClient())
      for (var j = 0; j < names.size(); j++) {
        var name = String(names.get(j))
        if (out[name] !== undefined) continue
        var fr = RegistryManager.ACTIVE.getRegistry(names.get(j))
        if (fr != null) out[name] = keysOf(fr.getKeys())
      }
    } catch (err) {
      out['icboot:forge_extra_error'] = [String(err)]
    }
    return out
  }

  sections.entities = function (server) {
    var DefaultAttributes = Java.loadClass('net.minecraft.world.entity.ai.attributes.DefaultAttributes')
    var attrReg = BuiltInRegistries.ATTRIBUTE
    var attrs = []
    var defaults = {}
    var ait = attrReg.iterator()
    while (ait.hasNext()) {
      var a = ait.next()
      var aid = String(attrReg.getKey(a))
      attrs.push([aid, a])
      defaults[aid] = Number(a.getDefaultValue())
    }
    var reg = BuiltInRegistries.ENTITY_TYPE
    var out = {}
    var it = reg.iterator()
    while (it.hasNext()) {
      var t = it.next()
      var rec = { category: String(t.getCategory().getName()) }
      try {
        var tags = []
        var tl = listOf(t.builtInRegistryHolder().tags().toList())
        for (var k = 0; k < tl.size(); k++) tags.push(String(tl.get(k).location()))
        if (tags.length > 0) rec.tags = tags
      } catch (errTags) {
        rec.tags_error = String(errTags)
      }
      try {
        if (DefaultAttributes.hasSupplier(t)) {
          var sup = DefaultAttributes.getSupplier(t)
          var m = {}
          for (var i = 0; i < attrs.length; i++) {
            if (sup.hasAttribute(attrs[i][1])) m[attrs[i][0]] = Number(sup.getBaseValue(attrs[i][1]))
          }
          rec.attributes = m
        }
      } catch (errAttr) {
        rec.attributes_error = String(errAttr)
      }
      out[String(reg.getKey(t))] = rec
    }
    return { attribute_defaults: defaults, types: out }
  }

  sections.world = function (server) {
    var out = { dimensions: [], game_rules: {} }
    var levels = listOf(server.levelKeys())
    for (var i = 0; i < levels.size(); i++) out.dimensions.push(String(levels.get(i).location()))
    var tag = server.getGameRules().createTag()
    var keys = listOf(tag.getAllKeys())
    for (var j = 0; j < keys.size(); j++) {
      var key = keys.get(j)
      out.game_rules[String(key)] = String(tag.getString(key))
    }
    return out
  }

  sections.loot_tables = function (server) {
    var LootDataType = Java.loadClass('net.minecraft.world.level.storage.loot.LootDataType')
    return { ids: keysOf(server.getLootData().getKeys(LootDataType.TABLE)) }
  }

  // "<id>\t<recipe type>\t<serializer>". The recipes are asked for type by type: on a recipe object
  // `getType()` is KubeJS's own helper (it returns the serializer id), not the game's recipe type.
  sections.recipes = function (server) {
    var typeReg = BuiltInRegistries.RECIPE_TYPE
    var serReg = BuiltInRegistries.RECIPE_SERIALIZER
    var manager = server.getRecipeManager()
    var typeOf = {}
    var tit = typeReg.iterator()
    while (tit.hasNext()) {
      var type = tit.next()
      var typeId = String(typeReg.getKey(type))
      var list = listOf(manager.getAllRecipesFor(type))
      for (var i = 0; i < list.size(); i++) typeOf[String(list.get(i).getId())] = typeId
    }
    // every recipe the manager holds; one whose type no mod registered is listed as such
    var rows = []
    var all = listOf(manager.getRecipes())
    for (var j = 0; j < all.size(); j++) {
      var r = all.get(j)
      var id = String(r.getId())
      rows.push(id + '\t' + (typeOf[id] || 'unregistered') + '\t' + String(serReg.getKey(r.getSerializer())))
    }
    return { rows: rows, total: Number(all.size()) }
  }

  sections.advancements = function (server) {
    var ids = []
    var list = listOf(server.getAdvancements().getAllAdvancements())
    for (var i = 0; i < list.size(); i++) ids.push(String(list.get(i).getId()))
    return { ids: ids }
  }

  var sizeOf = function (name, data) {
    if (name === 'registries') { var n = 0; for (var k in data) n++; return n }
    if (name === 'entities') { var c = 0; for (var e in data.types) c++; return c }
    if (name === 'world') return data.dimensions.length
    if (data.ids) return data.ids.length
    if (data.rows) return data.rows.length
    return 0
  }

  var dump = function (server) {
    var t0 = Date.now()
    var done = { version: 1, counts: {}, errors: {} }
    var order = ['registries', 'entities', 'world', 'loot_tables', 'recipes', 'advancements']
    for (var i = 0; i < order.length; i++) {
      var name = order[i]
      try {
        var data = sections[name](server)
        JsonIO.write(OUT + name + '.json', { data: data })
        done.counts[name] = sizeOf(name, data)
      } catch (err) {
        done.errors[name] = String(err)
        console.log(TAG + 'section ' + name + ' failed: ' + err)
      }
    }
    done.millis = Date.now() - t0
    JsonIO.write(OUT + 'done.json', done)
    console.log(TAG + 'registry dump written in ' + done.millis + ' ms')
  }

  ServerEvents.loaded(function (event) {
    var server = event.server
    console.log(TAG + 'world loaded, registry dump in ' + DELAY_TICKS + ' ticks')
    server.scheduleInTicks(DELAY_TICKS, function () {
      try {
        dump(server)
      } catch (err) {
        console.log(TAG + 'registry dump failed: ' + err)
      }
    })
  })
})()
