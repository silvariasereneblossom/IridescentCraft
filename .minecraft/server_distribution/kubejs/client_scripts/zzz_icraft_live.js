// priority: -1000
// =============================================================================
// Liveness of the client scripts: the ARMED summary line
// File: kubejs/client_scripts/zzz_icraft_live.js (server_scripts/ has the
//       longer file of the same name, with the `/icraft live` command)
// =============================================================================
// The record is kept by 00_icraft_guard.js (icraft.live; its header says what
// ARMED and FIRED mean). This file only has to run LAST: when it loads, every
// client script has made its registrations, so the one summary line can be
// printed and compared with the expected list
// (kubejs/config/icraft/live/expected.json, from dev/loud/gen_liveness.js).
// `// priority: -1000` on line 1 is what makes it last.
//
// The lines are in logs/kubejs/client.log: `[icraft.live] ARMED client: ...`
// when the scripts load, and one `[icraft.live] FIRED <event> x1: <script>`
// the first time each handler finishes (the tooltip handlers when the game
// first builds a tooltip, the JEI handlers when JEI loads its plugins).
//
// A comment line of exactly two words is a KubeJS file property: keep such
// lines out of this header.
// =============================================================================

;(function () {
  var TYPE = 'client'
  if (typeof icraft === 'undefined' || icraft === null || !icraft.live) {
    console.error('[icraft.live] 00_icraft_guard.js has no icraft.live: liveness is not recorded for the ' + TYPE + ' scripts')
    return
  }
  // `/icraft live` on an integrated server prints this script type's part too: `global` is one map for all three
  if (!global.icraftLiveLines) global.icraftLiveLines = {}
  global.icraftLiveLines[TYPE] = icraft.live.lines
  icraft.live.loaded(TYPE)
})()
