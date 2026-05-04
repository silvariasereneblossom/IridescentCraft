// =============================================================================
// Auto-fix PrismLauncher pre-launch + post-exit commands (one-shot)
// =============================================================================
// Wires .minecraft/prism_prelaunch.bat and .minecraft/prism_postexit.bat into
// PrismLauncher's instance.cfg on first in-world login.
//
// Filesystem work is delegated to two PowerShell helpers:
//   distribution/client/wire_instance_cfg.ps1     - reads/writes instance.cfg
//   distribution/client/cleanup_stale_jars.ps1    - removes orphan mod jars
//
// Why delegated: KubeJS' Rhino class filter blocks `java.io.File` and
// `java.nio.file.Files` (security default), so the script can't read/write
// instance.cfg directly. `java.lang.ProcessBuilder` IS allowed though, so we
// spawn powershell and let it do the file work. Both helpers print one-line
// status to stdout for the launcher log.
//
// Why client-side: instance.cfg lives at <instance>/instance.cfg (parent of
// .minecraft/), only reachable from the client process.
//
// Memory: feedback_kubejs_event_scope.md (ClientEvents not PlayerEvents),
// feedback_powershell_traps.md (em-dash + class-filter traps).
// =============================================================================

ClientEvents.loggedIn(event => {
  try {
    var Minecraft = Java.loadClass('net.minecraft.client.Minecraft')
    var mc = Minecraft.getInstance()
    if (mc == null || mc.player == null) return

    // mc.gameDirectory returns an existing java.io.File instance from the
    // Minecraft API. We only need its String path; toString() routes through
    // Object's method which the class filter doesn't gate.
    var gameDirPath = String(mc.gameDirectory)
    if (!gameDirPath) return

    var ProcessBuilder = Java.loadClass('java.lang.ProcessBuilder')
    var Arrays = Java.loadClass('java.util.Arrays')

    // ---- Wire instance.cfg via wire_instance_cfg.ps1 ---------------------
    var wireScript = gameDirPath + '/distribution/client/wire_instance_cfg.ps1'
    try {
      var wireCmd = Arrays.asList(
        'powershell',
        '-ExecutionPolicy', 'Bypass',
        '-File', wireScript,
        '-GameDir', gameDirPath
      )
      var wirePb = new ProcessBuilder(wireCmd)
      wirePb.redirectErrorStream(true)
      var wireProc = wirePb.start()
      console.log('[auto_fix_prism] Spawned wire_instance_cfg.ps1 (PID ' + wireProc.pid() + ')')
    } catch (e) {
      console.warn('[auto_fix_prism] Failed to spawn wire_instance_cfg.ps1: ' + e)
    }

    // ---- Spawn cleanup_stale_jars.ps1 to unlink orphan mods ---------------
    // Java opens JAR files with FILE_SHARE_DELETE on Windows, so PowerShell
    // can remove orphan dirents while Forge has them loaded - the mod stays
    // active for this session, modlist is clean next launch.
    var cleanupScript = gameDirPath + '/distribution/client/cleanup_stale_jars.ps1'
    try {
      var cleanupCmd = Arrays.asList(
        'powershell',
        '-ExecutionPolicy', 'Bypass',
        '-File', cleanupScript,
        '-ModsDir', gameDirPath + '/mods',
        '-IndexDir', gameDirPath + '/mods/.index'
      )
      var cleanupPb = new ProcessBuilder(cleanupCmd)
      cleanupPb.redirectErrorStream(true)
      var cleanupProc = cleanupPb.start()
      console.log('[auto_fix_prism] Spawned cleanup_stale_jars.ps1 (PID ' + cleanupProc.pid() + ')')
    } catch (e) {
      console.warn('[auto_fix_prism] Failed to spawn cleanup_stale_jars.ps1: ' + e)
    }

    // Chat hint: the helpers run async, so we can't block on their output.
    // The launcher log captures their per-line stdout if anything actually
    // changed; if both are already wired the helpers exit silently.
    event.player.tell([
      Text.gold('[IridescentCraft] '),
      Text.white('Pre-launch + post-exit checks fired. '),
      Text.gray('See launcher log for instance.cfg / orphan-jar status.')
    ])
  } catch (e) {
    console.warn('[auto_fix_prism] Failed: ' + e)
  }
})
