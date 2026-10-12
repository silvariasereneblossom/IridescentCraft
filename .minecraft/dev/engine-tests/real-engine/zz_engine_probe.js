// =============================================================================
// ENGINE PROBE -- runs on a REAL Forge server (bare: the pack's KubeJS, Rhino and
// Architectury jars only) and prints, to logs/kubejs/server.log:
//   FACT     the answers to 0_engine_facts.js on real players / stacks / entities
//   EVENT    every KubeJS event handler and the Java class it delivers
//   BINDING  what each script-visible global is
//   CLASS / IDS / SIDS / METHODS / FIELDS   the member table of each class in
//            ENGINE_PROBE_CLASSES (written by the runner) and of every event class,
//            read through the engine's own JavaMembers and name remapper
//   XCHECK   for each class we can build an instance of: do the names a script can
//            enumerate on the instance (KubeJS's own context) equal that table?
// File: .minecraft/dev/engine-tests/real-engine/zz_engine_probe.js  (dev tool, never in a distro)
// Parsed by run.py; the result is committed under truth/.
// =============================================================================
;(function () {
  var TAG = '[engine-probe] '
  function out(s) { console.log(TAG + s) }
  function clean(s) { return String(s).replace(/@[0-9a-f]{4,}/g, '@#').replace(/[\r\n\t]+/g, ' ') }
  function sorted(a) { a.sort(); return a }
  function chunks(kind, cls, names) {
    if (names.length === 0) { out(kind + ' ' + cls); return }
    for (var i = 0; i < names.length; i += 40) out(kind + ' ' + cls + ' ' + names.slice(i, i + 40).join(' '))
  }
  function keysOf(o) { var a = []; for (var k in o) a.push(String(k)); return sorted(a) }

  ServerEvents.loaded(function (event) {
    out('BEGIN')
    var server = event.server
    var level = server.overworld()

    // ---- real objects ---------------------------------------------------------
    var ServerPlayer = Java.loadClass('net.minecraft.server.level.ServerPlayer')
    var GameProfile = Java.loadClass('com.mojang.authlib.GameProfile')
    var UUID = Java.loadClass('java.util.UUID')
    var player = new ServerPlayer(server, level, new GameProfile(UUID.fromString('00000000-0000-4000-8000-000000000001'), 'ProbePlayer'))
    var fake = Java.loadClass('net.minecraftforge.common.util.FakePlayerFactory').getMinecraft(level)
    player.inventory.setItem(0, Item.of('minecraft:diamond', 3))
    player.inventory.setItem(40, Item.of('minecraft:diamond', 2))
    var mob = level.createEntity('minecraft:zombie')
    var objects = {
      player: player, inv: player.inventory, stack: player.inventory.getStackInSlot(0), mob: mob,
      level: level, server: server, source: level.damageSources().generic(), psource: level.damageSources().playerAttack(player)
    }

    // ---- facts ------------------------------------------------------------------
    for (var f = 0; f < ENGINE_FACTS.length; f++) {
      var fact = ENGINE_FACTS[f]
      var got
      try { var v = fact[3](objects); got = 'typeof=' + (typeof v) + ' value=' + clean(v) } catch (e) { got = 'THROWS ' + clean(e) }
      out('FACT ' + fact[0] + ' :: ' + got)
    }
    // the same inventory members on Forge's FakePlayer (a ServerPlayer subclass)
    out('FACT [FakePlayer] typeof inv.size :: typeof=' + (typeof (typeof fake.inventory.size)) + ' value=' + (typeof fake.inventory.size))
    out('FACT [FakePlayer] inv.slots :: typeof=' + (typeof fake.inventory.slots) + ' value=' + fake.inventory.slots)
    out('FACT player class :: typeof=string value=' + player.getClass().getName())
    out('FACT player.inventory class :: typeof=string value=' + player.inventory.getClass().getName())
    out('FACT stack class :: typeof=string value=' + objects.stack.getClass().getName())
    out('FACT stack.id class :: typeof=string value=' + objects.stack.id.getClass().getName())

    // ---- the engine's own member reader ---------------------------------------------
    // A fresh Rhino context with the same remapper KubeJS installs (ScriptManager.load:
    // Context.enter(), setRemapper(RemappingHelper.getMinecraftRemapper())). XCHECK below
    // proves the table equals what a script enumerates on a real instance.
    var Ctx = Java.loadClass('dev.latvian.mods.rhino.Context')
    var JM = Java.loadClass('dev.latvian.mods.rhino.JavaMembers')
    var RH = Java.loadClass('dev.latvian.mods.rhino.mod.util.RemappingHelper')
    var cx = Ctx.enter()
    var scope = cx.initStandardObjects()
    cx.setRemapper(RH.getMinecraftRemapper())


    // ---- events -------------------------------------------------------------------
    var eventClasses = {}
    try {
      var EH = Java.loadClass('dev.latvian.mods.kubejs.event.EventHandler')
      var eventTypeField = null
      var ehf = JM.lookupClass(cx, scope, EH, EH, false).getAccessibleFields(cx, false).iterator()
      while (ehf.hasNext()) { var ehfi = ehf.next(); if (String(ehfi.field.getName()) === 'eventType') eventTypeField = ehfi.field }
      var groups = Java.loadClass('dev.latvian.mods.kubejs.event.EventGroup').getGroups()
      var gnames = []
      var git = groups.keySet().iterator()
      while (git.hasNext()) gnames.push(String(git.next()))
      gnames.sort()
      for (var g = 0; g < gnames.length; g++) {
        var handlers = groups.get(gnames[g]).getHandlers()
        var hnames = []
        var hit = handlers.keySet().iterator()
        while (hit.hasNext()) hnames.push(String(hit.next()))
        hnames.sort()
        for (var h = 0; h < hnames.length; h++) {
          var handler = handlers.get(hnames[h])
          var cname = '?'
          try { var ec = eventTypeField.get(handler).get(); cname = String(ec.getName()); eventClasses[cname] = ec } catch (e2) { cname = 'ERROR ' + clean(e2) }
          out('EVENT ' + gnames[g] + '.' + hnames[h] + ' ' + cname)
        }
      }
    } catch (e3) { out('ERROR events: ' + clean(e3)) }

    // ---- bindings ---------------------------------------------------------------
    var bindings = ['Text', 'Item', 'Ingredient', 'Block', 'Utils', 'AABB', 'Java', 'JsonIO', 'NBT', 'Component', 'Fluid', 'Platform',
      'console', 'global', 'ServerEvents', 'PlayerEvents', 'EntityEvents', 'BlockEvents', 'ItemEvents', 'LevelEvents', 'StartupEvents',
      'Facing', 'Direction', 'Stats', 'ResourceLocation', 'UUID', 'Vec3d', 'Vec3i', 'BlockPos', 'DamageSource', 'SoundType', 'Color',
      'Duration', 'KMath', 'JavaMath', 'Notification', 'InputItem', 'OutputItem', 'ForgeEvents', 'ForgeModEvents', 'Client']
    for (var b = 0; b < bindings.length; b++) {
      var desc
      try { var bv = eval(bindings[b]); desc = (typeof bv) + ' ' + clean(bv).substring(0, 120) } catch (e4) { desc = 'ABSENT' }
      out('BINDING ' + bindings[b] + ' ' + desc)
    }

    // ---- member tables ------------------------------------------------------------
    function table(cname, cls) {
      var jm = JM.lookupClass(cx, scope, cls, cls, false)
      function ids(isStatic) { var raw = jm.getIds(isStatic); var a = []; for (var i = 0; i < raw.length; i++) a.push(String(raw[i])); return sorted(a) }
      var inst = ids(false)
      chunks('IDS', cname, inst)
      chunks('SIDS', cname, ids(true))
      var methods = []
      var mit = jm.getAccessibleMethods(cx, false).iterator()
      while (mit.hasNext()) {
        var mi = mit.next()
        var m = mi.method
        var name = String(mi.name)
        if (name === '') name = String(m.getName())
        var pts = m.getParameterTypes()
        var ps = []
        for (var p = 0; p < pts.length; p++) ps.push(String(pts[p].getSimpleName()))
        methods.push((((m.getModifiers() & 8) !== 0) ? '!' : '') + name + '(' + ps.join(',') + ')')
      }
      chunks('METHODS', cname, sorted(methods))
      var fields = []
      var fit = jm.getAccessibleFields(cx, false).iterator()
      while (fit.hasNext()) {
        var fi = fit.next()
        var fname = String(fi.name)
        if (fname === '') fname = String(fi.field.getName())
        fields.push((((fi.field.getModifiers() & 8) !== 0) ? '!' : '') + fname)
      }
      chunks('FIELDS', cname, sorted(fields))
      return inst
    }

    var instances = {
      'net.minecraft.server.level.ServerPlayer': player,
      'net.minecraft.world.entity.player.Inventory': player.inventory,
      'net.minecraft.world.item.ItemStack': objects.stack,
      'net.minecraft.world.entity.monster.Zombie': mob,
      'net.minecraft.server.level.ServerLevel': level,
      'net.minecraft.server.dedicated.DedicatedServer': server,
      'net.minecraft.world.damagesource.DamageSource': objects.source
    }
    var names = []
    for (var c = 0; c < ENGINE_PROBE_CLASSES.length; c++) names.push(ENGINE_PROBE_CLASSES[c])
    for (var ek in eventClasses) if (names.indexOf(ek) < 0) names.push(ek)
    for (var ik in instances) if (names.indexOf(ik) < 0) names.push(ik)
    names.sort()
    for (var n = 0; n < names.length; n++) {
      var cn = names[n]
      try {
        var cls = eventClasses[cn] ? eventClasses[cn] : Java.loadClass(cn)
        out('CLASS ' + cn)
        var tableIds = table(cn, cls)
        if (instances[cn]) {
          var seen = keysOf(instances[cn])
          var onlyEngine = seen.filter(function (k) { return tableIds.indexOf(k) < 0 })
          var onlyTable = tableIds.filter(function (k) { return seen.indexOf(k) < 0 })
          out('XCHECK ' + cn + ' ' + ((onlyEngine.length === 0 && onlyTable.length === 0) ? ('same ' + seen.length)
            : ('DIFF only-on-instance=[' + onlyEngine.join(' ') + '] only-in-table=[' + onlyTable.join(' ') + ']')))
        }
      } catch (e5) {
        out('MISSING ' + cn + ' ' + clean(e5))
      }
    }
    out('END')
  })
})()
