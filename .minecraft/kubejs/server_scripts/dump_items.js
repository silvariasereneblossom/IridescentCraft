// =============================================================================
// JEI ITEM DUMP — runtime authoritative item list via console.log()
// =============================================================================
// KubeJS's class filter blocks java.io.FileWriter and java.nio.file.Files
// (security — scripts can't open arbitrary file handles). So instead of
// writing a file directly, we dump each item via console.log() with a
// unique prefix, and extract from kubejs-server.log via findstr/grep
// after the server runs.
//
// Each item line has format:
//   [ITEM_DUMP] namespace<TAB>id<TAB>display_name<TAB>rarity<TAB>max_stack
//
// Extraction (Windows):
//   findstr /C:"[ITEM_DUMP]" kubejs-server.log > all_items_raw.tsv
// then strip the [ITEM_DUMP] prefix in any text editor or via:
//   powershell -c "(Get-Content all_items_raw.tsv) -replace '.*\[ITEM_DUMP\] ',''  | Set-Content all_items.tsv"
//
// Extraction (Linux/macOS):
//   grep '^\[ITEM_DUMP\] ' kubejs-server.log | sed 's|^.*\[ITEM_DUMP\] ||' > all_items.tsv
//
// Trigger: ServerEvents.loaded fires once per server start. Marker variable
// (in-memory only) prevents repeat dumps if /reload triggers re-evaluation.
// To re-run, restart the server.
//
// Memory: feedback_rhino_scoping.md
// =============================================================================

console.log('[IridescentCraft] dump_items.js parsed — will dump on first ServerEvents.loaded')

try {
  var BuiltInRegistries = Java.loadClass('net.minecraft.core.registries.BuiltInRegistries')
  var ItemStackJ        = Java.loadClass('net.minecraft.world.item.ItemStack')

  console.log('[icraft/dump_items] required Java classes loaded')

  var dumpRan = false

  var doDump = function() {
    try {
      console.log('[icraft/dump_items] === ITEM DUMP STARTING ===')
      console.log('[ITEM_DUMP] namespace\tid\tdisplay_name\trarity\tmax_stack')

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
          console.log('[ITEM_DUMP] ' + rl.getNamespace() + '\t' + rl.getPath() + '\t' + name + '\t' + rarity + '\t' + maxSt)
          count++
        } catch (innerErr) {
          skipped++
        }
      }

      console.log('[icraft/dump_items] === ITEM DUMP COMPLETE: ' + count + ' items dumped, ' + skipped + ' skipped ===')
      console.log('[icraft/dump_items] Extract with:  findstr /C:"[ITEM_DUMP]" kubejs-server.log > all_items.tsv')
    } catch (e) {
      console.warn('[icraft/dump_items] doDump() FAILED: ' + e + ' :: ' + (e.stack || ''))
    }
  }

  ServerEvents.loaded(function(event) {
    try {
      if (dumpRan) {
        console.log('[icraft/dump_items] already ran in this server session, skipping')
        return
      }
      dumpRan = true
      console.log('[icraft/dump_items] ServerEvents.loaded fired — starting item dump')
      doDump()
    } catch (e) {
      console.warn('[icraft/dump_items] loaded handler threw: ' + e + ' :: ' + (e.stack || ''))
    }
  })

  console.log('[IridescentCraft] dump_items handler registered successfully')
} catch (e) {
  console.warn('[IridescentCraft] dump_items bootstrap FAILED: ' + e + ' :: ' + (e.stack || ''))
}
