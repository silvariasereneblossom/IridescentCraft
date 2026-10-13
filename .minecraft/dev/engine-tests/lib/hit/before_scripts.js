// Suite hit-table, before the scripts load: the registry as the game starts it, and the classes
// the handler scripts load that the harness has no Java mock for.
//
// SCRIPT-SIDE STAND-INS (not held to the engine by mock-honesty; each name was read with javap):
//   io.redspace.ironsspellbooks.api.magic.MagicData   static getPlayerMagicData(LivingEntity),
//                                                     float getMana(), void setMana(float), void addMana(float)
//                                                     (irons_spellbooks-1.20.1-3.15.5.1.jar)
//   net.minecraft.world.effect.MobEffects             the five static fields tmb_plain_bow_effects.js reads;
//                                                     here they are effect ids, which is what the mock's
//                                                     MobEffectInstance is built from
//   net.minecraft.world.entity.projectile.Projectile  only for `x instanceof Projectile` in the arrow tagger of
//                                                     unique_tier_buff.js (no test entity is one; the tests
//                                                     tag their arrows themselves)
// The real classes are what the full-pack probe runs on (internal dev/hit-table-d-2026-10-13/).

// both maps empty, on fresh tables: a ConcurrentHashMap that once held twelve keys walks in another order
T.clearHurtRegistry()

T_CLASS_MAP['net.minecraft.world.entity.MobType'] = 'mk.S$MobType'
T_CLASS_MAP['net.minecraft.world.effect.MobEffectInstance'] = 'mk.S$MobEffectInstance'
T_CLASS_MAP['java.util.UUID'] = 'java.util.UUID'

var HT_MANA = {}
var HT_uid = function (p) { return String(p.uuid.toString()) }
var HT_STUBS = {
  'io.redspace.ironsspellbooks.api.magic.MagicData': {
    getPlayerMagicData: function (p) {
      var k = HT_uid(p)
      return {
        getMana: function () { return HT_MANA.hasOwnProperty(k) ? HT_MANA[k] : 0 },
        setMana: function (n) { HT_MANA[k] = Number(n) },
        addMana: function (n) { HT_MANA[k] = (HT_MANA.hasOwnProperty(k) ? HT_MANA[k] : 0) + Number(n) }
      }
    }
  },
  'net.minecraft.world.effect.MobEffects': {
    BLINDNESS: 'minecraft:blindness', WEAKNESS: 'minecraft:weakness', MOVEMENT_SLOWDOWN: 'minecraft:slowness',
    WITHER: 'minecraft:wither', LEVITATION: 'minecraft:levitation'
  },
  'net.minecraft.world.entity.projectile.Projectile': function () {}
}
var HT_loadClass = Java.loadClass
Java.loadClass = function (name) {
  var n = String(name)
  if (HT_STUBS.hasOwnProperty(n)) return HT_STUBS[n]
  return HT_loadClass(name)
}

// The startup scripts register before any server script (they load when the game starts). Their order,
// by file name: deathskin_undead_bonus.js, enchants/icraft_magic_enchants.js, enchants/vorpal_rework.js.
// The first is loaded for real by the suite (after the guard); the two Vorpal handlers are stand-ins that
// pass the event through: what they DO is in the full-pack table, here only their keys matter (the walk).
var HT_startupLate = function () {
  var DR = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
  DR.registerLate('icraft.magic_enchants_decap', function (event) {})
  DR.registerLate('icraft.vorpal_rework_decap', function (event) {})
}
