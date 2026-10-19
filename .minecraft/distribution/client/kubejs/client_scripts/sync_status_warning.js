// @file kubejs/client_scripts/sync_status_warning.js
// @events ClientEvents.loggedIn
// @live sync-status-warning
// =============================================================================
// Says in chat, once per game run, when the pack did not update before this launch.
//
// The pre-launch sync writes .icraft_sync_status.json into the game folder on every
// launch (distribution/client/sync_client.ps1 for an instance the installer made,
// prism_prelaunch.bat for a git clone): {"ok":true,...}, or "ok":false with a
// reason (fetch-failed, sync-failed, packwiz-failed:N, mod-download-failed,
// incomplete-modset:N, behind, ...). Until 2026-10-18 nothing read it in game,
// although the changelog and the known-issues page said a warning appears (the
// fact-pass fixes, on recommendation, for review).
//
// Not a warning: packwiz-fallback:<why>. The sync then downloaded the mods with its
// older downloader and the instance is complete (the installer copies no pack.toml
// into a tester instance, so tester launches probably take that path today; read
// from the scripts, not checked on a tester machine). A file that does not exist
// (an instance without the pre-launch hook) says nothing either.
// =============================================================================

;(function () {
  var FILE = '.icraft_sync_status.json'
  var shown = false

  ClientEvents.loggedIn(icraft.guard('sync_status_warning', 'ClientEvents.loggedIn', function (event) {
    if (shown) return
    var text = null
    try {
      text = JsonIO.readString(FILE)
    } catch (e) {
      console.warn('[sync_status_warning] ' + FILE + ' could not be read, no sync warning this run: ' + e)
      return
    }
    if (text === null || text === undefined || String(text) === '' || String(text) === 'null') return
    var status = null
    try {
      status = JSON.parse(String(text))
    } catch (e2) {
      console.warn('[sync_status_warning] ' + FILE + ' is not JSON, no sync warning this run: ' + e2)
      return
    }
    if (!status || status.ok !== false) return
    var reason = String(status.reason || 'no reason given')
    if (reason.indexOf('packwiz-fallback') === 0) return
    shown = true
    event.player.tell(Text.red('[IridescentCraft] The pack did not update before this launch (' + reason + ').'))
    event.player.tell(Text.gray('You may be on an older version than the server. Relaunch to retry; if it keeps happening, send your launch log to Silvaria.'))
    icraft.live.fired('sync-status-warning')
  }))
})()
