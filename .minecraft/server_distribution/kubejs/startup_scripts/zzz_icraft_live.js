// priority: -1000
// =============================================================================
// Liveness of the startup scripts: the ARMED summary line
// File: kubejs/startup_scripts/zzz_icraft_live.js (server_scripts/ has the
//       longer file of the same name, with the `/icraft live` command)
// =============================================================================
// The record is kept by 00_icraft_guard.js (icraft.live; its header says what
// ARMED and FIRED mean). This file only has to run LAST: when it loads, every
// startup script has made its registrations, so the one summary line can be
// printed and compared with the expected list
// (kubejs/config/icraft/live/expected.json, from dev/loud/gen_liveness.js).
// `// priority: -1000` on line 1 is what makes it last.
//
// Startup registrations fire while the game loads (registries, item and block
// modification), so their FIRED lines follow the summary line at once, one per
// handler. A feature a startup script reports later (a beheading, say) prints
// its line when it happens.
//
// A comment line of exactly two words is a KubeJS file property: keep such
// lines out of this header.
// =============================================================================

;(function () {
  var TYPE = 'startup'
  if (typeof icraft === 'undefined' || icraft === null || !icraft.live) {
    console.error('[icraft.live] 00_icraft_guard.js has no icraft.live: liveness is not recorded for the ' + TYPE + ' scripts')
    return
  }
  // `/icraft live` (a server script) prints this script type's part too: `global` is one map for all three
  if (!global.icraftLiveLines) global.icraftLiveLines = {}
  global.icraftLiveLines[TYPE] = icraft.live.lines
  icraft.live.loaded(TYPE)
})()
