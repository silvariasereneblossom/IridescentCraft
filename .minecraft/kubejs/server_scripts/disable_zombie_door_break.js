// =============================================================================
// DISABLE ZOMBIE DOOR-BREAKING (vanilla BreakDoorGoal)
// =============================================================================
// Azukaar's Fair Difficulty Overhaul force-sets vanilla difficulty to Hard
// (perPlayer = true in its config, which requires Hard underneath so it can
// manage per-player difficulty internally). On Hard, vanilla zombies roll
// canBreakDoors = true on spawn with ~10% chance and then actively break
// wooden doors via BreakDoorGoal. This is Minecraft-core behavior, not a
// mod flag -- Improved Mobs's "Enable Block Breaking = false" doesn't
// control it, and flipping the mobGriefing gamerule would also kill
// endermen pickup and Cataclysm boss arena destruction we want to keep.
//
// Surgical fix: on EntityEvents.spawned, detect Zombie-class mobs (vanilla
// zombie, husk, drowned, zombie_villager -- all subclass Zombie and all
// inherit BreakDoorGoal) and strip the goal from the goalSelector so the
// mob keeps every other AI behavior but can no longer break doors.
//
// Memory: feedback_jar_audit.md (decompile when probes silently no-op),
// feedback_wiki_reference.md (Rhino scoping -- use var in reentrant blocks).
// =============================================================================

try {
  var BreakDoorGoal = Java.loadClass('net.minecraft.world.entity.ai.goal.BreakDoorGoal')
  var Zombie = Java.loadClass('net.minecraft.world.entity.monster.Zombie')

  // Resource-location style entity IDs (what entity.getType().toString() tends
  // to resolve to after translation-key stripping). Vanilla zombie hierarchy:
  //   Zombie <- ZombieVillager
  //         <- Husk
  //         <- Drowned
  //         (Zombified piglin is intentionally kept -- that's a Nether mob
  //          with no door-break goal anyway.)
  var ZOMBIE_TYPE_PATTERN = /minecraft:(zombie|husk|drowned|zombie_villager)$|\.minecraft\.(zombie|husk|drowned|zombie_villager)$/

  EntityEvents.spawned(event => {
    try {
      var entity = event.entity
      if (!entity) return
      // Fast class-based check via instanceof on the underlying MC entity.
      // Covers vanilla + any mod zombie that extends Zombie.class (some
      // modded variants do, e.g. stalwart_dungeons wrappers). If the mod
      // defines its own unrelated base class, we fall back to the type
      // regex for the explicit vanilla set below.
      var raw = entity.getInternal ? entity.getInternal() : null
      var isZombie = false
      if (raw && Zombie.isInstance(raw)) {
        isZombie = true
      } else {
        var typeId = String(entity.getType ? entity.getType().toString() : entity.type)
        if (ZOMBIE_TYPE_PATTERN.test(typeId)) isZombie = true
      }
      if (!isZombie) return

      // Remove BreakDoorGoal from the goal selector. Mob.goalSelector is
      // accessible via SRG f_21345_ at runtime; in Mojang mappings it's
      // `goalSelector`. KubeJS Rhino usually exposes the Mojang name since
      // it loads mappings; if not, fall back to reflection.
      var goalSelector = raw.f_21345_ || raw.goalSelector
      if (!goalSelector) {
        console.warn('[no_door_break] could not access goalSelector on ' +
                     String(entity.getType()))
        return
      }

      // removeAllGoals(Predicate<Goal>) — strip anything that's a
      // BreakDoorGoal. Rhino auto-wraps the JS function as Predicate.
      goalSelector.removeAllGoals(function(g) { return BreakDoorGoal.isInstance(g) })
    } catch (e) {
      console.warn('[no_door_break] spawned-handler threw: ' + e)
    }
  })

  console.log('[IridescentCraft] disable_zombie_door_break loaded (strips BreakDoorGoal on zombie-class spawn)')
} catch (e) {
  console.warn('[IridescentCraft] disable_zombie_door_break bootstrap FAILED: ' + e)
}
