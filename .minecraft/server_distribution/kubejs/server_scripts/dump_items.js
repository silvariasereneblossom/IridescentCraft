// =============================================================================
// JEI ITEM DUMP — runtime authoritative item list for offline audits
// =============================================================================
// Writes every registered item to kubejs/exports/all_items.tsv on first
// ServerEvents.loaded. The file persists; subsequent launches log
// "already exported" and skip unless the file is deleted.
//
// Output columns (TAB-separated):
//   namespace  id  display_name  rarity  max_stack
//
// Usage:
//   1. Start (or restart) the server.
//   2. Watch console for "[icraft/dump_items] wrote N items to ..."
//   3. File appears at <server>/kubejs/exports/all_items.tsv
//   4. git add + push the export. Audit it offline.
//   5. Delete the file to regenerate on next launch.
//
// Memory: feedback_rhino_scoping.md (var X = function(){} inside try blocks)
// =============================================================================

console.log('[IridescentCraft] dump_items script loaded — will auto-export on first ServerEvents.loaded')

try {
  var BuiltInRegistries = Java.loadClass('net.minecraft.core.registries.BuiltInRegistries')
  var ItemStackJ        = Java.loadClass('net.minecraft.world.item.ItemStack')
  var Files             = Java.loadClass('java.nio.file.Files')
  var Paths             = Java.loadClass('java.nio.file.Paths')
  var ArrayList         = Java.loadClass('java.util.ArrayList')
  var StandardCopyOption = Java.loadClass('java.nio.file.StandardCopyOption')

  var EXPORT_DIR  = 'kubejs/exports'
  var EXPORT_FILE = EXPORT_DIR + '/all_items.tsv'

  var doExport = function() {
    try {
      console.log('[icraft/dump_items] beginning export...')

      // Ensure exports/ dir exists
      var dirPath = Paths.get(EXPORT_DIR)
      if (!Files.exists(dirPath)) {
        Files.createDirectories(dirPath)
        console.log('[icraft/dump_items] created ' + EXPORT_DIR)
      }

      var registry = BuiltInRegistries.ITEM

      // Use Java ArrayList — Rhino's JS-array → Iterable<String> coercion
      // is unreliable for Files.write. Java collection avoids the gotcha.
      var rows = new ArrayList()
      rows.add('namespace\tid\tdisplay_name\trarity\tmax_stack')

      var iter = registry.iterator()
      var count = 0
      var skipped = 0
      while (iter.hasNext()) {
        var item = iter.next()
        try {
          var rl = registry.getKey(item)
          if (rl == null) { skipped++; continue }
          var stack = new ItemStackJ(item)
          var name = String(stack.getHoverName().getString())
                       .replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, '')
          var rarity = String(stack.getRarity().toString())
          var maxSt = item.getMaxStackSize()
          rows.add(rl.getNamespace() + '\t' + rl.getPath() + '\t' + name + '\t' + rarity + '\t' + maxSt)
          count++
        } catch (innerErr) {
          skipped++
        }
      }

      // Write atomically: tmp → move
      var tmpPath = Paths.get(EXPORT_FILE + '.tmp')
      var finalPath = Paths.get(EXPORT_FILE)
      Files.write(tmpPath, rows)
      Files.move(tmpPath, finalPath, StandardCopyOption.REPLACE_EXISTING)

      console.log('[icraft/dump_items] wrote ' + count + ' items (' + skipped + ' skipped) to ' + EXPORT_FILE)
    } catch (e) {
      console.warn('[icraft/dump_items] export FAILED: ' + e + ' :: ' + (e.stack || ''))
    }
  }

  ServerEvents.loaded(function(event) {
    try {
      var existingPath = Paths.get(EXPORT_FILE)
      if (Files.exists(existingPath)) {
        console.log('[icraft/dump_items] ' + EXPORT_FILE + ' already exists. Delete the file to regenerate.')
        return
      }
      console.log('[icraft/dump_items] no export found, running...')
      doExport()
    } catch (e) {
      console.warn('[icraft/dump_items] loaded handler threw: ' + e + ' :: ' + (e.stack || ''))
    }
  })

  console.log('[IridescentCraft] dump_items handler registered')
} catch (e) {
  console.warn('[IridescentCraft] dump_items bootstrap FAILED: ' + e + ' :: ' + (e.stack || ''))
}
