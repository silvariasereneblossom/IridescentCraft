// =============================================================================
// JEI ITEM DUMP — runtime authoritative item list for offline audits
// =============================================================================
// Writes every registered item to <server>/kubejs/exports/all_items.tsv on
// first ServerEvents.loaded. Restart the server to trigger; delete the file
// to regenerate.
//
// Output columns (TAB-separated):
//   namespace  id  display_name  rarity  max_stack
//
// Memory: feedback_rhino_scoping.md (var X = function(){} inside try blocks)
// =============================================================================

console.log('[IridescentCraft] dump_items.js parsed — registering ServerEvents.loaded handler')

try {
  var BuiltInRegistries = Java.loadClass('net.minecraft.core.registries.BuiltInRegistries')
  var ItemStackJ        = Java.loadClass('net.minecraft.world.item.ItemStack')
  var FileWriterJ       = Java.loadClass('java.io.FileWriter')
  var FileJ             = Java.loadClass('java.io.File')
  var SystemJ           = Java.loadClass('java.lang.System')

  console.log('[icraft/dump_items] all required classes loaded successfully')

  var doExport = function() {
    try {
      console.log('[icraft/dump_items] doExport() entered')

      // Resolve absolute path so we know exactly where the file lands
      var cwd = String(SystemJ.getProperty('user.dir'))
      console.log('[icraft/dump_items] working directory: ' + cwd)

      var exportDir = new FileJ(cwd, 'kubejs/exports')
      console.log('[icraft/dump_items] target directory: ' + exportDir.getAbsolutePath())

      if (!exportDir.exists()) {
        var made = exportDir.mkdirs()
        console.log('[icraft/dump_items] created directory: ' + made)
        if (!made) {
          console.warn('[icraft/dump_items] mkdirs returned false — checking if exists now: ' + exportDir.exists())
        }
      } else {
        console.log('[icraft/dump_items] directory already exists')
      }

      var outFile = new FileJ(exportDir, 'all_items.tsv')
      console.log('[icraft/dump_items] target file: ' + outFile.getAbsolutePath())

      var writer = new FileWriterJ(outFile, false)  // overwrite mode
      try {
        writer.write('namespace\tid\tdisplay_name\trarity\tmax_stack\n')

        var registry = BuiltInRegistries.ITEM
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
            writer.write(rl.getNamespace() + '\t' + rl.getPath() + '\t' + name + '\t' + rarity + '\t' + maxSt + '\n')
            count++
          } catch (innerErr) {
            skipped++
          }
        }
        writer.flush()
      } finally {
        writer.close()
      }

      console.log('[icraft/dump_items] SUCCESS: wrote ' + count + ' items (' + skipped + ' skipped) to ' + outFile.getAbsolutePath())
    } catch (e) {
      console.warn('[icraft/dump_items] doExport() FAILED: ' + e)
      console.warn('[icraft/dump_items] stack: ' + (e.stack || '(no stack)'))
    }
  }

  ServerEvents.loaded(function(event) {
    try {
      console.log('[icraft/dump_items] ServerEvents.loaded fired')

      var cwd = String(SystemJ.getProperty('user.dir'))
      var existing = new FileJ(cwd, 'kubejs/exports/all_items.tsv')

      if (existing.exists()) {
        console.log('[icraft/dump_items] export already exists at ' + existing.getAbsolutePath() + ' — skipping (delete to regenerate)')
        return
      }

      console.log('[icraft/dump_items] no export found at ' + existing.getAbsolutePath() + ' — running export')
      doExport()
    } catch (e) {
      console.warn('[icraft/dump_items] ServerEvents.loaded handler threw: ' + e)
      console.warn('[icraft/dump_items] stack: ' + (e.stack || '(no stack)'))
    }
  })

  console.log('[IridescentCraft] dump_items handler registered successfully')
} catch (e) {
  console.warn('[IridescentCraft] dump_items bootstrap FAILED: ' + e)
  console.warn('[IridescentCraft] stack: ' + (e.stack || '(no stack)'))
}
