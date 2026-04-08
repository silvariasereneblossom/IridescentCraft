// =============================================================================
// Spawn Chunk Pre-generation
// Pre-generates a 10-chunk radius around world spawn on first server boot
// to reduce lag when players first join.
// =============================================================================

PlayerEvents.loggedIn(event => {
  let server = event.server
  let data = server.overworld().persistentData

  // Only run once per world
  if (data.contains('icraft_spawn_pregenned')) return
  if (!event.player.hasPermissions(2)) return // Only ops trigger pregen

  let spawn = server.overworld().getSharedSpawnPos()
  let chunkRadius = 10 // 10 chunks = 160 blocks

  console.log('[IridescentCraft] Pre-generating spawn chunks...')

  // Forceload a radius of chunks around spawn, then remove forceload
  // This forces chunk generation without keeping them permanently loaded
  let sx = spawn.x >> 4
  let sz = spawn.z >> 4

  server.runCommandSilent(
    `forceload add ${(sx - chunkRadius) * 16} ${(sz - chunkRadius) * 16} ${(sx + chunkRadius) * 16} ${(sz + chunkRadius) * 16}`
  )

  // Schedule removal after 30 seconds (enough time to generate)
  server.scheduleInTicks(600, () => {
    server.runCommandSilent(
      `forceload remove ${(sx - chunkRadius) * 16} ${(sz - chunkRadius) * 16} ${(sx + chunkRadius) * 16} ${(sz + chunkRadius) * 16}`
    )
    console.log('[IridescentCraft] Spawn chunk pre-generation complete, forceload removed')
  })

  data.putBoolean('icraft_spawn_pregenned', true)
  event.player.tell('Generating spawn area chunks... this may cause brief lag.')
})
