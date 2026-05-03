// =============================================================================
// Auto-fix PrismLauncher pre-launch command (one-shot)
// =============================================================================
// Detects the legacy `git pull --ff-only` Prism pre-launch and rewrites it to
// use prism_prelaunch.bat (which does the pull AND runs cleanup_stale_jars.ps1
// after, removing orphan jars from mods that were deprecated upstream). Without
// this rewrite, removed packwiz-managed mods linger in mods/ — bypassing the
// cleanup pipeline entirely.
//
// Only triggers when the existing PreLaunchCommand EXACTLY matches the legacy
// pattern. Testers who customized their pre-launch are unaffected.
//
// Why client-side: instance.cfg is at <instance>/instance.cfg (parent of
// .minecraft/), which only the client process can reach. Server-side scripts
// run in a different filesystem context.
//
// Reason for the chat notification: this script silently rewrites a config file
// outside .minecraft/. A visible heads-up means the user can revert if the
// rewrite was unwanted.
// =============================================================================

PlayerEvents.loggedIn(event => {
  try {
    // Only fires on the local client player — multiplayer servers iterate
    // remote players too, but those don't have instance.cfg accessible.
    var Minecraft = Java.loadClass('net.minecraft.client.Minecraft')
    var mc = Minecraft.getInstance()
    if (mc == null || mc.player == null) return
    if (!event.player.uuid.equals(mc.player.uuid)) return

    var File = Java.loadClass('java.io.File')
    var Files = Java.loadClass('java.nio.file.Files')

    var gameDir = mc.gameDirectory
    var instanceCfg = new File(gameDir.parentFile, 'instance.cfg')
    if (!instanceCfg.exists()) {
      // Not a Prism instance (CurseForge, MultiMC, modpack-bundled, dev env)
      return
    }

    var content = new java.lang.String(Files.readAllBytes(instanceCfg.toPath()), 'UTF-8')

    // Already migrated? Skip silently — every login otherwise spams.
    if (content.indexOf('prism_prelaunch.bat') >= 0) return

    // Match the legacy bare pattern: PreLaunchCommand=git -C "..." pull --ff-only
    // Anchor at line start, accept any quote style or path the user has.
    var pattern = /^PreLaunchCommand=.*\bgit\b.*\bpull\b.*--ff-only.*$/m
    if (!pattern.test(content)) {
      // Different pre-launch (already migrated, custom, or missing) — leave it
      return
    }

    var newContent = content.replace(pattern,
      'PreLaunchCommand="$INST_MC_DIR/prism_prelaunch.bat"')

    Files.writeString(instanceCfg.toPath(), newContent)
    console.log('[auto_fix_prism_prelaunch] Rewrote PreLaunchCommand: legacy git-pull-only -> prism_prelaunch.bat')

    // Spawn cleanup_stale_jars.ps1 NOW so disk-level orphan jars get
    // unlinked this session. Java opens JAR files with FILE_SHARE_DELETE
    // on Windows, so even though Forge has them loaded, PowerShell can
    // remove them — the dirent is removed but the mod stays active for
    // this session. Next launch the user gets a clean modlist.
    var modsDir = new File(gameDir, 'mods')
    var indexDir = new File(modsDir, '.index')
    var cleanupScript = new File(gameDir, 'distribution/client/cleanup_stale_jars.ps1')

    var cleanupSpawned = false
    if (cleanupScript.exists() && modsDir.exists() && indexDir.exists()) {
      try {
        var ProcessBuilder = Java.loadClass('java.lang.ProcessBuilder')
        var Arrays = Java.loadClass('java.util.Arrays')
        var cmd = Arrays.asList(
          'powershell',
          '-ExecutionPolicy', 'Bypass',
          '-File', cleanupScript.absolutePath,
          '-ModsDir', modsDir.absolutePath,
          '-IndexDir', indexDir.absolutePath
        )
        var pb = new ProcessBuilder(cmd)
        pb.redirectErrorStream(true)
        var proc = pb.start()
        // Don't block the player tick; just fire and let it run
        cleanupSpawned = true
        console.log('[auto_fix_prism_prelaunch] Spawned cleanup_stale_jars.ps1 (PID ' + proc.pid() + ')')
      } catch (e) {
        console.warn('[auto_fix_prism_prelaunch] Failed to spawn cleanup: ' + e)
      }
    } else {
      console.log('[auto_fix_prism_prelaunch] Cleanup script not found at ' + cleanupScript.absolutePath + '; skipping immediate cleanup')
    }

    event.player.tell([
      Text.gold('[IridescentCraft] '),
      Text.white('Pre-launch updated and orphan jars cleaned from disk. '),
      Text.gray('Modlist shows them this session (Forge has them loaded), but they\'re gone next launch.')
    ])
  } catch (e) {
    console.warn('[auto_fix_prism_prelaunch] Failed: ' + e)
  }
})
