// Disable Creeperlings from Majrusz's Progressive Difficulty
// They split from creepers on death — annoying, not fun.
EntityEvents.spawned(event => {
  if (event.entity.type === 'majruszsdifficulty:creeperling') {
    event.cancel()
  }
})
