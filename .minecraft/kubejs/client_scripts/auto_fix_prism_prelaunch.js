// =============================================================================
// Auto-fix PrismLauncher pre-launch + post-exit commands (one-shot)
// =============================================================================
// Rewrites instance.cfg to wire two scripts into PrismLauncher:
//
//   PreLaunchCommand  -> .minecraft/prism_prelaunch.bat
//                        (git pull + cleanup_stale_jars.ps1, removes orphan
//                         jars from mods deprecated upstream)
//
//   PostExitCommand   -> .minecraft/prism_postexit.bat
//                        (mirrors session logs to TesterLogs/<username>/ and
//                         git push, so dev container picks up logs without
//                         tester intervention)
//
// Runs at most once per instance (no-op if both scripts already wired).
// Only modifies the legacy bare `git pull --ff-only` PreLaunch; testers with a
// custom command are unaffected. PostExit only set if missing or empty -- never
// overwrites a tester's custom value.
//
// Why client-side: instance.cfg lives at <instance>/instance.cfg (parent of
// .minecraft/), which only the client process can reach. Server-side scripts
// run in a different filesystem context.
//
// Chat notification fires only when something actually changed, so testers
// know which config bits were touched and can revert if unwanted.
// =============================================================================

// ClientEvents.loggedIn (NOT PlayerEvents.loggedIn) - the latter is server-only
// and was throwing "Tried to register event handler 'PlayerEvents.loggedIn' for
// invalid script type CLIENT" every launch, so this script never ran. The
// client-side variant fires once per client login on the local player only,
// so the UUID-equals-local-player guard from the previous version is gone.
ClientEvents.loggedIn(event => {
  try {
    var Minecraft = Java.loadClass('net.minecraft.client.Minecraft')
    var mc = Minecraft.getInstance()
    if (mc == null || mc.player == null) return

    var File = Java.loadClass('java.io.File')
    var Files = Java.loadClass('java.nio.file.Files')

    var gameDir = mc.gameDirectory
    var instanceCfg = new File(gameDir.parentFile, 'instance.cfg')
    if (!instanceCfg.exists()) {
      // Not a Prism instance (CurseForge, MultiMC, modpack-bundled, dev env)
      return
    }

    var content = new java.lang.String(Files.readAllBytes(instanceCfg.toPath()), 'UTF-8')
    var hasPrelaunch = content.indexOf('prism_prelaunch.bat') >= 0
    var hasPostexit  = content.indexOf('prism_postexit.bat')  >= 0

    // Both already wired? Skip silently -- every login otherwise spams.
    if (hasPrelaunch && hasPostexit) return

    var newContent = content
    var preChanged = false
    var postChanged = false

    // ── PreLaunchCommand ──────────────────────────────────────────────────
    // Match the legacy bare pattern: PreLaunchCommand=git -C "..." pull --ff-only
    // Anchor at line start, accept any quote style or path the user has.
    if (!hasPrelaunch) {
      var prePattern = /^PreLaunchCommand=.*\bgit\b.*\bpull\b.*--ff-only.*$/m
      if (prePattern.test(newContent)) {
        newContent = newContent.replace(prePattern,
          'PreLaunchCommand="$INST_MC_DIR/prism_prelaunch.bat"')
        preChanged = true
        console.log('[auto_fix_prism] Rewrote PreLaunchCommand: legacy git-pull-only -> prism_prelaunch.bat')
      }
      // If it's some other custom command, leave it alone.
    }

    // ── PostExitCommand ───────────────────────────────────────────────────
    // Only set if the line is missing OR present-but-empty. Never overwrite
    // a tester's custom value.
    if (!hasPostexit) {
      var postLineMatch = newContent.match(/^PostExitCommand=(.*)$/m)
      if (postLineMatch) {
        if (!postLineMatch[1].trim()) {
          newContent = newContent.replace(/^PostExitCommand=.*$/m,
            'PostExitCommand="$INST_MC_DIR/prism_postexit.bat"')
          postChanged = true
          console.log('[auto_fix_prism] Set empty PostExitCommand -> prism_postexit.bat')
        } else {
          console.log('[auto_fix_prism] PostExitCommand has custom value; leaving alone')
        }
      } else {
        // Line missing entirely — append. Note: PostExitCommand requires
        // OverrideCommands=true to be active. The user's existing
        // PreLaunchCommand was already firing, so OverrideCommands is
        // already set. (If a tester somehow has it disabled, the field
        // is set-but-inactive — harmless.)
        if (newContent.length > 0 && newContent.charAt(newContent.length - 1) !== '\n') {
          newContent += '\n'
        }
        newContent += 'PostExitCommand="$INST_MC_DIR/prism_postexit.bat"\n'
        postChanged = true
        console.log('[auto_fix_prism] Added PostExitCommand -> prism_postexit.bat')
      }
    }

    if (!preChanged && !postChanged) return

    Files.writeString(instanceCfg.toPath(), newContent)

    // ── Spawn cleanup_stale_jars.ps1 NOW so disk-level orphan jars get ────
    // unlinked this session, but only if we just rewrote the pre-launch.
    // Java opens JAR files with FILE_SHARE_DELETE on Windows, so even
    // though Forge has them loaded, PowerShell can remove them -- the
    // dirent is removed but the mod stays active for this session. Next
    // launch the user gets a clean modlist.
    if (preChanged) {
      var modsDir = new File(gameDir, 'mods')
      var indexDir = new File(modsDir, '.index')
      var cleanupScript = new File(gameDir, 'distribution/client/cleanup_stale_jars.ps1')

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
          console.log('[auto_fix_prism] Spawned cleanup_stale_jars.ps1 (PID ' + proc.pid() + ')')
        } catch (e) {
          console.warn('[auto_fix_prism] Failed to spawn cleanup: ' + e)
        }
      }
    }

    var msg = []
    msg.push(Text.gold('[IridescentCraft] '))
    if (preChanged && postChanged) {
      msg.push(Text.white('Pre-launch + post-exit hooks installed. '))
      msg.push(Text.gray('Orphan jars cleaned; logs auto-upload to TesterLogs on close.'))
    } else if (preChanged) {
      msg.push(Text.white('Pre-launch hook installed. '))
      msg.push(Text.gray('Orphan jars cleaned from disk; modlist updates next launch.'))
    } else {
      msg.push(Text.white('Post-exit hook installed. '))
      msg.push(Text.gray('Session logs will auto-upload to TesterLogs on close.'))
    }
    event.player.tell(msg)
  } catch (e) {
    console.warn('[auto_fix_prism] Failed: ' + e)
  }
})
