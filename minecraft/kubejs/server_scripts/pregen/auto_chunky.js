// =============================================================================
// Auto-start Chunky pre-generation on first world load
// =============================================================================
// Fires /chunky start around spawn exactly once per world. The "once" is
// tracked via server.persistentData so subsequent launches don't re-trigger.
// Chunky's continueOnRestart=true handles resume-on-interrupt.
//
// Protocol 7 (wiki/protocols/7-pregen.md) documents why this exists: dense
// structure mods (Dungeon Crawl etc.) stall the main thread when worldgen
// runs under load while players are connected. Pre-gen moves that cost to
// the background ticker, which chunky-player-pause auto-pauses when a
// player joins.
// =============================================================================

ServerEvents.loaded(event => {
  const server = event.server
  const data = server.persistentData

  if (data.getBoolean('icraft_chunky_pregen_started')) {
    return
  }

  const radius = 2500
  const dimension = 'minecraft:overworld'

  console.log('[IridescentCraft] First world load — auto-starting Chunky pre-gen')
  console.log(`[IridescentCraft]   dimension: ${dimension}, radius: ${radius}`)

  try {
    server.runCommandSilent(`chunky world ${dimension}`)
    server.runCommandSilent('chunky center 0 0')
    server.runCommandSilent(`chunky radius ${radius}`)
    server.runCommandSilent('chunky start')
    data.putBoolean('icraft_chunky_pregen_started', true)
    console.log('[IridescentCraft] Chunky pre-gen kicked off. chunky-player-pause will pause it when players join.')
  } catch (e) {
    console.error('[IridescentCraft] Failed to start Chunky pre-gen: ' + e)
  }
})
