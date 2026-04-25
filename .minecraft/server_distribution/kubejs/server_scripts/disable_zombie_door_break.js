// =============================================================================
// DISABLE BREAK-DOOR GOAL (vanilla + any modded mob that ships one)
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
// 2026-04-25: tester reported "skeleton riding a spider broke a door."
// Vanilla skeletons don't have BreakDoorGoal, so this is a modded
// undead variant that added the goal in its own AI. Rather than chasing
// every mod that does this, the handler is now class-generic: any Mob
// spawning with BreakDoorGoal in its goalSelector gets it stripped,
// regardless of the mob's base class. Zombies, modded skeletons,
// netherzombies variants -- all handled by the same predicate.
//
// Memory: feedback_jar_audit.md (decompile when probes silently no-op),
// feedback_wiki_reference.md (Rhino scoping -- use var in reentrant blocks).
// =============================================================================

try {
  var BreakDoorGoal = Java.loadClass('net.minecraft.world.entity.ai.goal.BreakDoorGoal')
  var Mob = Java.loadClass('net.minecraft.world.entity.Mob')

  EntityEvents.spawned(event => {
    try {
      var entity = event.entity
      if (!entity) return
      // Skip non-Mob entities (items, projectiles, players). They don't
      // have a goalSelector. Rhino Java interop: use JS `instanceof` with
      // the class on RHS, NOT ClassWrapper.isInstance(obj) -- the latter
      // throws because Rhino's JavaClass wrapper only exposes static
      // members.
      if (!(entity instanceof Mob)) return

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

      // Strip and log: when we successfully strip BreakDoorGoal from a
      // mob, log its entity type the FIRST time we see that type. Builds
      // a usage-driven list of which modded mobs were silently shipping
      // door-break -- shows up in the server log as
      //   [no_door_break] stripped BreakDoorGoal from new type: <id>
      // so we can audit what was found across a session.
      var stripped = goalSelector.removeAllGoals(function(g) {
        return g instanceof BreakDoorGoal
      })
      if (stripped) {
        if (!global._no_door_break_seenTypes) global._no_door_break_seenTypes = {}
        var typeId = String(entity.getType().toString())
        if (!global._no_door_break_seenTypes[typeId]) {
          global._no_door_break_seenTypes[typeId] = true
          console.log('[no_door_break] stripped BreakDoorGoal from new type: ' + typeId)
        }
      }
    } catch (e) {
      console.warn('[no_door_break] spawned-handler threw: ' + e)
    }
  })

  console.log('[IridescentCraft] disable_zombie_door_break loaded (strips BreakDoorGoal on ANY Mob spawn -- vanilla + modded)')
} catch (e) {
  console.warn('[IridescentCraft] disable_zombie_door_break bootstrap FAILED: ' + e)
}
