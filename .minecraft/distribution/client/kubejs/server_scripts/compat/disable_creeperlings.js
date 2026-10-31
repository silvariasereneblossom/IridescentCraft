// Disable Creeperlings from Majrusz's Progressive Difficulty
// They split from creepers on death — annoying, not fun.
// Registered for the one type (2026-10-30, RAM audit F2): KubeJS picks the handler
// in Java, where the untargeted one built an id for every entity that joined a level.
EntityEvents.spawned('majruszsdifficulty:creeperling', icraft.guard('compat/disable_creeperlings', 'EntityEvents.spawned', event => {
  event.cancel()
}))
