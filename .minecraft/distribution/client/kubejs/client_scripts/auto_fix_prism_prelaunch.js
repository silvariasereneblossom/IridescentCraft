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

    event.player.tell([
      Text.gold('[IridescentCraft] '),
      Text.white('Auto-updated PrismLauncher pre-launch to include stale-jar cleanup '),
      Text.gray('(see prism_prelaunch.bat). '),
      Text.white('Takes effect on next launch.')
    ])
    console.log('[auto_fix_prism_prelaunch] Rewrote PreLaunchCommand: legacy git-pull-only -> prism_prelaunch.bat')
  } catch (e) {
    console.warn('[auto_fix_prism_prelaunch] Failed: ' + e)
  }
})
