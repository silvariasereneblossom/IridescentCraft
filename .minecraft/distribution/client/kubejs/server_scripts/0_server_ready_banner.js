// =============================================================================
// 0_server_ready_banner.js  -  emit a prominent "READY" marker on server load
// =============================================================================
// Fires on ServerEvents.loaded (after MC's "Done (Xs)" but before players can
// join). Prints a banner to the server console (which goes to the bat's
// stdout, captured by WinSW under service mode -> visible in service logs).
//
// Why this exists: the canonical "Done (Xs)!" marker from vanilla MC is what
// our Wait-IridescentMCReady helper polls for. This banner is the human-
// readable equivalent for anyone tailing the log live -- much more visible
// than scanning for "Done" in the noise.
//
// Filename starts with `0_` so it loads first (same convention as 0_iss_guard.js,
// 0_tick_master.js elsewhere in this folder).
// =============================================================================

ServerEvents.loaded(event => {
  let port = event.server.serverPort
  let lines = [
    '',
    '  ============================================================',
    '  >>>  IridescentCraft Server READY                       <<<',
    '  >>>  Listening on 0.0.0.0:' + port + '                            <<<',
    '  >>>  Accepting player connections.                       <<<',
    '  ============================================================',
    ''
  ]
  lines.forEach(l => console.info(l))
})
