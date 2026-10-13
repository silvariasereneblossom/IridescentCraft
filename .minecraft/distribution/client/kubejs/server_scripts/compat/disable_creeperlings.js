// Disable Creeperlings from Majrusz's Progressive Difficulty
// They split from creepers on death — annoying, not fun.
EntityEvents.spawned(icraft.guard('compat/disable_creeperlings', 'EntityEvents.spawned', event => {
  if (global.icraft.core.entityId(event.entity) === 'majruszsdifficulty:creeperling') {
    event.cancel()
  }
}))
