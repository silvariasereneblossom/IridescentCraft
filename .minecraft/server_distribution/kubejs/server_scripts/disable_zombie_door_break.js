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

      // In KubeJS 6 EntityEvents.spawned, `event.entity` IS the Java-wrapped
      // entity directly -- there's no nested getInternal() layer like there
      // is for ItemStack. Use Zombie.isInstance(entity) straight against the
      // wrapper. (Previous version called entity.getInternal() which
      // returned null and caused NPEs in the goalSelector access below.)
      var isZombie = false
      try {
        if (Zombie.isInstance(entity)) isZombie = true
      } catch (e) {}
      if (!isZombie) {
        // Fallback for wrapped/proxied entity objects where isInstance
        // can't see through the wrapper -- check entity type.
        try {
          var typeId = String(entity.getType().toString())
          if (ZOMBIE_TYPE_PATTERN.test(typeId)) isZombie = true
        } catch (e) {}
      }
      if (!isZombie) return

      // Access the goalSelector. Try Mojang name first (KubeJS typically
      // runs with Mojang mappings exposed), then SRG. Wrap in try/catch
      // so field-not-found on one doesn't abort the whole handler.
      var goalSelector = null
      try { goalSelector = entity.goalSelector } catch (e) {}
      if (!goalSelector) {
        try { goalSelector = entity.f_21345_ } catch (e) {}
      }
      if (!goalSelector) {
        // Last resort: reflection. Cache the field lookup after first
        // success by stashing it on global (not per-mob).
        if (!global._no_door_break_goalSelectorField) {
          try {
            var Mob = Java.loadClass('net.minecraft.world.entity.Mob')
            var f = Mob.class.getDeclaredField('f_21345_')
            f.setAccessible(true)
            global._no_door_break_goalSelectorField = f
          } catch (e) {
            console.warn('[no_door_break] reflection fallback failed: ' + e)
            return
          }
        }
        goalSelector = global._no_door_break_goalSelectorField.get(entity)
      }
      if (!goalSelector) return

      goalSelector.removeAllGoals(function(g) { return BreakDoorGoal.isInstance(g) })
    } catch (e) {
      console.warn('[no_door_break] spawned-handler threw: ' + e)
    }
  })

  console.log('[IridescentCraft] disable_zombie_door_break loaded (strips BreakDoorGoal on zombie-class spawn)')
} catch (e) {
  console.warn('[IridescentCraft] disable_zombie_door_break bootstrap FAILED: ' + e)
}
