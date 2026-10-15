// @file kubejs/server_scripts/sunlight_smite.js
// @events tick.server
// @registry bosses
// @live sunlight-smite
// =============================================================================
// SUNLIGHT SMITE: by day, hostile undead under open sky near a player in the
// Overworld burn about four times faster than vanilla's sunburn.
// =============================================================================
// Ruled by the operator (ruling 9, 2026-10-14; what burns answered in the
// world-rules chip, 2026-10-15: "Skip owned and non-hostile"):
//   * every 10 ticks, at day, around every player in the Overworld (48 blocks
//     across, 32 up and down), each entity that
//       - is undead: MobType.UNDEAD, the game's own test (vanilla zombies,
//         skeletons, husks, strays, drowned, phantoms ... included: 105 entity
//         types on the full pack, measured 2026-10-15);
//       - is hostile: a Monster or an Enemy (vanilla's marker; the test of
//         /icraft despawn). Wild zombie and skeleton horses are not, and
//         vanilla never burns them either;
//       - is no boss: #forge:bosses or the pack's registry (core.isBoss);
//       - has no owner: a tamed pet, a summon of Ars Nouveau (OwnableEntity)
//         or of Iron's Spellbooks (getSummoner); an orphaned summon whose
//         owner is gone burns;
//       - stands in direct sky (Level.canSeeSky at its block: a roof, a cave
//         or an overhang keeps it safe, as a well-lit base should);
//     takes 2 magic damage through core.dealDamage (a secondary hit: no hurt
//     handler multiplies it) and is set alight for 2 seconds.
//   * 2 damage twice a second: a zombie (20 health) is gone in about five
//     seconds; nothing dies in one hit. Drops are the mob's own; no experience
//     unless a player hit it in the last five seconds (the game's rule).
// How many that is, counted on a copy of the live world (world-20261015-0251,
// counts only): 2,919 saved undead in the Overworld, 7 of them bosses; 446 of
// the others stand under open sky; 7 inside the scan of a player's saved
// position (5 Meature, 1 Huntsman, 1 Skeleton).
//
// UNTIL 2026-10-15 this script never damaged a mob: its undead test called
// `.is` on the entity's id string and its hit called `entity.hurt`, which
// scripts do not have, both inside silent catches (decision list entry 44).
// It was meant to one-shot at 100 damage; that is not what was ruled.
// =============================================================================

var SMITE_DAMAGE = 2.0
var SMITE_FIRE_TICKS = 40
var SMITE_MobType = Java.loadClass('net.minecraft.world.entity.MobType')
var SMITE_Mob = Java.loadClass('net.minecraft.world.entity.Mob')
var SMITE_Monster = Java.loadClass('net.minecraft.world.entity.monster.Monster')
var SMITE_Enemy = Java.loadClass('net.minecraft.world.entity.monster.Enemy')
var SMITE_Ownable = Java.loadClass('net.minecraft.world.entity.OwnableEntity')
var SMITE_BOSSES = Java.loadClass('net.minecraft.tags.TagKey').create(
  Java.loadClass('net.minecraft.core.registries.Registries').ENTITY_TYPE,
  Java.loadClass('net.minecraft.resources.ResourceLocation').tryParse('forge:bosses'))

var smiteWarn = function (where, e) {
  global.icraft.core.warnOnce('sunlight_smite:' + where, '[sunlight_smite] ' + where + ' threw: ' + e)
}

// 'smite', or why not (the order of the tests is the cost order: the mob type is one read)
function smiteVerdict(e) {
  if (!(e instanceof SMITE_Mob)) return 'not a mob'
  if (e.getMobType() !== SMITE_MobType.UNDEAD) return 'not undead'
  if (!e.isAlive()) return 'dead'
  if (!(e instanceof SMITE_Monster) && !(e instanceof SMITE_Enemy)) return 'not hostile'
  if (e.getEntityType().is(SMITE_BOSSES)) return 'boss (tag)'
  if (global.icraft.core.isBoss(e)) return 'boss'
  if (e instanceof SMITE_Ownable && e.getOwnerUUID() != null) return 'owned'
  if (typeof e.getSummoner === 'function' && e.getSummoner() != null) return 'summoned'
  return 'smite'
}

// one scan around one player: -> how many entities were hit
function smiteAround(level, player) {
  var hits = 0
  var found = level.getEntitiesWithin(player.getBoundingBox().inflate(48.0, 32.0, 48.0))
  for (var i = 0; i < found.size(); i++) {
    var e = found.get(i)
    try {
      if (smiteVerdict(e) !== 'smite') continue
      if (!level.canSeeSky(e.blockPosition())) continue
      if (!global.icraft.core.dealDamage(e, 'magic', SMITE_DAMAGE)) continue
      if (e.getRemainingFireTicks() < SMITE_FIRE_TICKS) e.setRemainingFireTicks(SMITE_FIRE_TICKS)
      hits++
    } catch (err) {
      // one entity whose tests or hit throw is left alone; the others are still scanned
      smiteWarn('an entity (left alone)', err)
    }
  }
  return hits
}

global.registerServerTick('tick_sunlightSmite', 10, 3, function (event) {
  var level = event.server.overworld()
  if (!level.isDay()) return
  var players = level.getPlayers()
  var hits = 0
  for (var i = 0; i < players.size(); i++) {
    var p = players.get(i)
    if (p.isSpectator()) continue
    hits += smiteAround(level, p)
  }
  // liveness: the feature hit at least one undead (the tick itself fires every boot)
  if (hits > 0) icraft.live.fired('sunlight-smite')
})
