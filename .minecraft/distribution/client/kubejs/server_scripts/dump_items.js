// =============================================================================
// JEI ITEM DUMP — runtime authoritative item list for offline audits
// =============================================================================
// Writes every registered item to kubejs/exports/all_items.tsv on first
// ServerEvents.loaded after the world starts. The file persists; subsequent
// launches log "already exported" and skip unless you delete the file or run
// /icraft_dump_items_force.
//
// Output columns (TAB-separated):
//   1. namespace      e.g. "irons_spellbooks"
//   2. id             e.g. "modular_diamond_spell_book"
//   3. display_name   e.g. "Modular Diamond Spell Book"
//   4. rarity         COMMON / UNCOMMON / RARE / EPIC
//   5. max_stack      1 / 16 / 64
//
// Usage:
//   1. Launch the server (or singleplayer client).
//   2. After world loads, file appears at kubejs/exports/all_items.tsv.
//   3. git add + push the export. Audit it offline.
//   4. To regenerate: delete the .tsv (or run /icraft_dump_items_force).
//
// Why this exists: JEI builds its index at runtime; static jar excavation
// over-counts because Beautiful Enchanted Books ships speculative texture
// files for ~140 enchant variants from mods that aren't installed. This
// dump is authoritative — only items that are actually registered when
// the game boots get listed.
//
// Memory: feedback_rhino_scoping.md (var X = function(){} inside try blocks)
// =============================================================================

try {
  var BuiltInRegistries = Java.loadClass('net.minecraft.core.registries.BuiltInRegistries')
  var ItemStackJ        = Java.loadClass('net.minecraft.world.item.ItemStack')
  var Files             = Java.loadClass('java.nio.file.Files')
  var Paths             = Java.loadClass('java.nio.file.Paths')
  var StandardOpenOption = Java.loadClass('java.nio.file.StandardOpenOption')

  var EXPORT_DIR  = 'kubejs/exports'
  var EXPORT_FILE = EXPORT_DIR + '/all_items.tsv'

  var doExport = function() {
    try {
      // Ensure exports/ exists
      var dirPath = Paths.get(EXPORT_DIR)
      if (!Files.exists(dirPath)) Files.createDirectories(dirPath)

      var registry = BuiltInRegistries.ITEM
      var rows = []
      rows.push('namespace\tid\tdisplay_name\trarity\tmax_stack')

      var iter = registry.iterator()
      var count = 0
      while (iter.hasNext()) {
        var item = iter.next()
        try {
          var rl     = registry.getKey(item)
          if (rl == null) continue
          var stack  = new ItemStackJ(item)
          var name   = stack.getHoverName().getString().replace(/\t/g, ' ').replace(/\n/g, ' ')
          var rarity = stack.getRarity().toString()
          var maxSt  = item.getMaxStackSize()
          rows.push(rl.getNamespace() + '\t' + rl.getPath() + '\t' + name + '\t' + rarity + '\t' + maxSt)
          count++
        } catch (e) {
          // Skip individual item errors — usually means the item doesn't have a default stack
        }
      }

      // Atomic-ish write: write to .tmp then move
      var tmpPath = Paths.get(EXPORT_FILE + '.tmp')
      var finalPath = Paths.get(EXPORT_FILE)
      Files.write(tmpPath, java.util.Arrays.asList(rows))
      Files.move(tmpPath, finalPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING)

      console.log('[icraft/dump_items] wrote ' + count + ' items to ' + EXPORT_FILE)
    } catch (e) {
      console.warn('[icraft/dump_items] export failed: ' + e)
    }
  }

  // Fire once on first ServerEvents.loaded; skip if the file already exists.
  ServerEvents.loaded(function(event) {
    try {
      var existing = Paths.get(EXPORT_FILE)
      if (Files.exists(existing)) {
        console.log('[icraft/dump_items] all_items.tsv already exported. Delete the file to regenerate.')
        return
      }
      doExport()
    } catch (e) {
      console.warn('[icraft/dump_items] loaded handler threw: ' + e)
    }
  })

  // /icraft_dump_items_force command — re-export on demand
  ServerEvents.commandRegistry(function(event) {
    try {
      var Commands = Java.loadClass('net.minecraft.commands.Commands')
      event.dispatcher.register(
        Commands.literal('icraft_dump_items_force').requires(function(s) { return s.hasPermission(2) })
          .executes(function(ctx) {
            ctx.getSource().sendSuccess(function() {
              return Component.literal('§e[icraft] Forcing item export...').asComponent()
            }, false)
            doExport()
            ctx.getSource().sendSuccess(function() {
              return Component.literal('§a[icraft] Export complete. See kubejs/exports/all_items.tsv').asComponent()
            }, false)
            return 1
          })
      )
    } catch (e) {
      console.warn('[icraft/dump_items] command registration failed: ' + e)
    }
  })

  console.log('[IridescentCraft] dump_items loaded — auto-exports on first world load')
} catch (e) {
  console.warn('[IridescentCraft] dump_items bootstrap FAILED: ' + e)
}
