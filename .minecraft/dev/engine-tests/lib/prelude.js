// The KubeJS environment of the harness suites: the bindings and event groups a server script sees,
// over the mk.W / mk.S / mk.A mocks, on the production Rhino build. Loaded after lib/honest.js.
// Everything a script can reach here must exist on the engine: the Java mocks are checked by
// MemberCheck (suite mock-honesty), the script-side ones below by the T_honest* calls.
var T = __host.loadClass('mk.T')
var W_ = function (n) { return __host.loadClass('mk.W$' + n) }
var MPlayer = __host.loadClass('mk.A$Player'), MMob = W_('Mob'), MLiving = W_('Living'), MEntity = W_('Entity'), MTamed = W_('Tamed')
var MShadow = W_('ShadowTypeMob'), MDragon = W_('Dragon'), MItemEntity = W_('ItemEntity')
var MStack = W_('Stack'), MTag = W_('Tag'), MListTag = W_('ListTag')
var MLevel = __host.loadClass('mk.A$Level'), MServer = __host.loadClass('mk.A$Server'), MSource = W_('Source'), MHurt = W_('Hurt')
var MSpell = W_('Spell'), MSpellPart = W_('SpellPart'), MSpellSchool = W_('SpellSchool'), MSpellContext = W_('SpellContext'), MSpellPre = W_('SpellDamagePre')
var MSlot = W_('Slot')

var T_LOG = { warn: [], error: [], info: [] }
var console = {
  log: function (m) { T_LOG.info.push(String(m)) },
  info: function (m) { T_LOG.info.push(String(m)) },
  warn: function (m) { T_LOG.warn.push(String(m)) },
  error: function (m) { T_LOG.error.push(String(m)) }
}
var global = {}

var T_HANDLERS = {}
var T_reg = function (name) {
  return function (a, b) {
    var fn = (typeof a === 'function') ? a : b
    ;(T_HANDLERS[name] = T_HANDLERS[name] || []).push(fn)
  }
}
var PlayerEvents = { loggedIn: T_reg('P.loggedIn'), loggedOut: T_reg('P.loggedOut'), respawned: T_reg('P.respawned'), tick: T_reg('P.tick'), chat: T_reg('P.chat'), inventoryChanged: T_reg('P.inventoryChanged') }
var EntityEvents = { death: T_reg('E.death'), hurt: T_reg('E.hurt'), spawned: T_reg('E.spawned'), checkSpawn: T_reg('E.checkSpawn') }
var ItemEvents = { rightClicked: T_reg('I.rightClicked'), entityInteracted: T_reg('I.entityInteracted'), canPickUp: T_reg('I.canPickUp') }
var BlockEvents = { broken: T_reg('B.broken'), rightClicked: T_reg('B.rightClicked'), placed: T_reg('B.placed') }
var ServerEvents = { tick: T_reg('S.tick'), loaded: T_reg('S.loaded'), commandRegistry: T_reg('S.commandRegistry'), recipes: T_reg('S.recipes'), tags: T_reg('S.tags') }
// every event offered above exists on the engine
var T_EVENT_GROUPS = { P: ['PlayerEvents', PlayerEvents], E: ['EntityEvents', EntityEvents], I: ['ItemEvents', ItemEvents], B: ['BlockEvents', BlockEvents], S: ['ServerEvents', ServerEvents] }
for (var T_g in T_EVENT_GROUPS) { for (var T_h in T_EVENT_GROUPS[T_g][1]) T_honestEvent(T_EVENT_GROUPS[T_g][0] + '.' + T_h) }
var T_realEvent = function (name) { var p = name.split('.'); return T_EVENT_GROUPS[p[0]][0] + '.' + p[1] }
// `cancelled` is the harness's own record of event.cancel(); a script must not read it (the engine has no such member)
var T_EVENT_PLUMBING = ['cancelled']

// event.cancel() exits by throwing, exactly like KubeJS's EventExit.
var T_EXIT = { exit: true }
var T_UNCAUGHT = []
var T_fire = function (name, ev) {
  T_honestEventObject(T_realEvent(name), ev, T_EVENT_PLUMBING)     // only keys the real event class has
  ev.cancelled = false
  ev.cancel = function () { throw T_EXIT }
  var list = T_HANDLERS[name] || []
  for (var i = 0; i < list.length; i++) {
    try { list[i](ev) } catch (e) {
      if (e === T_EXIT) { ev.cancelled = true; return ev }
      T_UNCAUGHT.push(name + '#' + i + ': ' + e)
    }
  }
  return ev
}

var T_CLASS_MAP = {
  'com.iridescentcraft.reforging.event.DamageModifierRegistry': 'mk.W$DamageModifierRegistry',
  'com.iridescentcraft.reforging.event.ForgeEventRegistry': 'mk.W$ForgeEventRegistry',
  'net.minecraft.world.entity.player.Player': 'mk.W$Player',
  'net.minecraft.world.entity.LivingEntity': 'mk.W$Living',
  'net.minecraft.tags.DamageTypeTags': 'mk.W$DamageTypeTags',
  'net.minecraft.world.item.enchantment.EnchantmentHelper': 'mk.W$EnchantmentHelper',
  'net.minecraft.resources.ResourceLocation': 'mk.W$RL',
  'net.minecraftforge.registries.ForgeRegistries': 'mk.W$ForgeRegistries'
}
var T_CLASS_MISSES = []
var Java = {
  loadClass: function (name) {
    if (T_CLASS_MAP[name]) return __host.loadClass(T_CLASS_MAP[name])
    T_CLASS_MISSES.push(name)
    throw new Error('mock: Java.loadClass(' + name + ') not mapped')
  }
}
var AABB = W_('AABB')
var T_passthru = function (s) { return String(s) }
var Text = { of: T_passthru, gold: T_passthru, gray: T_passthru, white: T_passthru, darkPurple: T_passthru, lightPurple: T_passthru, aqua: T_passthru, red: T_passthru, yellow: T_passthru, green: T_passthru }
var Item = { of: function (id, n) { return new MStack(String(id), (typeof n === 'number') ? n : 1) }, empty: MStack.EMPTY }
T_honestKeys('console', console, 'dev.latvian.mods.kubejs.util.ConsoleJS', false)
T_honestKeys('Text', Text, 'dev.latvian.mods.kubejs.bindings.TextWrapper', true)
T_honestKeys('Item', Item, 'dev.latvian.mods.kubejs.bindings.ItemWrapper', true)
T_honestKeys('Java', Java, 'dev.latvian.mods.kubejs.bindings.JavaWrapper', false)

// ---- world plumbing ---------------------------------------------------------
var T_server = new MServer()
var T_levels = {}
var T_level = function (dim) {
  if (T_levels[dim]) return T_levels[dim]
  var l = new MLevel(T_server, dim)
  // KubeJS EntityEvents.hurt = LivingAttackEvent (cancellable, read-only damage); death = LivingDeathEvent
  T.hooks(l,
    function (victim, source, amount) {
      var ev = T_fire('E.hurt', { entity: victim, source: source, damage: amount, level: l, server: T_server })
      return ev.cancelled === true
    },
    function (victim, source) {
      T_fire('E.death', { entity: victim, source: source, level: l, server: T_server, player: victim.player ? victim : null })
    })
  T_levels[dim] = l
  return l
}
// one server tick (tick master + player ticks), then advance the clocks
var T_tick = function (n) {
  n = n || 1
  for (var i = 0; i < n; i++) {
    T_fire('S.tick', { server: T_server })
    var ps = T_server.players
    for (var p = 0; p < ps.length; p++) T_fire('P.tick', { player: ps[p], server: T_server, level: ps[p].level })
    for (var d in T_levels) T_levels[d].t_endTick(1)
    T.set(T_server, 'tick', T.num(T_server, 'tick') + 1)
    for (var q = 0; q < ps.length; q++) ps[q].age = ps[q].age + 1
  }
}
var T_newPlayer = function (name, dim, x, y, z) {
  var p = new MPlayer(name, T_level(dim || 'minecraft:overworld'), x || 0, (y === undefined) ? 64 : y, z || 0)
  T_fire('P.loggedIn', { player: p, server: T_server })
  return p
}
var T_mob = function (type, dim, x, y, z, hp) {
  var m = new MMob(type, T_level(dim || 'minecraft:overworld'), x || 0, (y === undefined) ? 64 : y, z || 0)
  if (hp) { T.set(m, 'maxHealth', hp); T.set(m, 'health', hp) }
  return m
}

// ---- assertions ----------------------------------------------------------------
var T_pass = 0, T_fail = 0, T_failed = []
var ok = function (cond, what) {
  __host.snap((cond ? 'ok    ' : 'FAIL  ') + what)
  if (cond) { T_pass++ } else { T_fail++; T_failed.push(what); __host.print('   FAIL  ' + what) }
}
var near = function (a, b, what) { ok(Math.abs(Number(a) - Number(b)) < 1e-3, what + '  (got ' + a + ', want ' + b + ')') }
var section = function (name) { __host.print('-- ' + name); __host.snap('-- ' + name) }
// Math.random control: T_rand(0.0) forces every "x < chance" roll to succeed, T_rand(0.999) to fail
var T_realRandom = Math.random
var T_rand = function (v) { Math.random = (v === undefined) ? T_realRandom : function () { return v } }

// run one named group of assertions; a throw fails the group, not the whole run
var T_SECTION_THROWS = []
var T_run = function (name, fn) {
  section(name)
  try { fn() } catch (e) {
    T_fail++
    T_SECTION_THROWS.push(name + ': ' + e)
    __host.print('   THREW in "' + name + '": ' + e)
  }
  try { T_only(null); T_rand() } catch (e2) {}
}

// Handler isolation. New scheme: one dispatcher on the Java registry, handlers live in global.icraft.core ->
// run the named one through core.hurtHandlers(). Old scheme (HEAD scripts): one registry entry per handler ->
// restrict the Java registry to that key. Either way T_fireHurt returns the (possibly modified) event.
var T_onlyKey = null
var T_only = function (key) {
  T_onlyKey = (key === undefined) ? null : key
  T.only(T_onlyKey)
}
var T_fireHurt = function (victim, source, amount) {
  var core = global.icraft && global.icraft.core
  if (T_onlyKey !== null && core && core.hurtHandlers) {
    var one = core.hurtHandlers()[T_onlyKey]
    if (one) {
      var ev = new MHurt(victim, source, amount)
      one(ev)
      return ev
    }
  }
  return T.fireHurt(victim, source, amount)
}
