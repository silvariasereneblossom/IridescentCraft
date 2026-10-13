// =============================================================================
// ENGINE PROBE, startup side -- what a STARTUP script gets from JsonIO, and that
// it can hand a value to the server scripts through `global`.
// File: .minecraft/dev/engine-tests/real-engine/startup/0_startup_probe.js
// (dev tool, never in a distro; run_real_engine.sh copies it into the probe
// server's kubejs/startup_scripts). The server-side facts read the answer from
// global (0_engine_facts.js, "startup script: ...").
// =============================================================================
;(function () {
  var answer = ''
  try {
    var text = JsonIO.readString('kubejs/icraft_engine_probe.json')
    answer = 'typeof=' + (typeof text) + ' schema=' + JSON.parse(String(text)).schema
  } catch (e) {
    answer = 'THROWS ' + e
  }
  global.icraftEngineProbeStartupJson = answer
  console.log('[engine-probe] startup script read the probe file: ' + answer)
})()
