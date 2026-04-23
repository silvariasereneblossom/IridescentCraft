// =============================================================================
// ENCHANTED BOOK TOOLTIP — restore enchantment name line (v2 2026-04-23)
// =============================================================================
// Apotheosis 7.3+ @Redirect's ItemStack.appendEnchantmentNames. Its
// replacement builds a realLevels map from stack.getAllEnchantments(), which
// for enchanted BOOKS returns the `Enchantments` NBT (empty — books store
// enchants in `StoredEnchantments`). The replacement NPEs on null lookup,
// the NPE is caught silently, and no enchant line is appended.
//
// v1 (2026-04-21): used stack.nbt.getList(...) + stack.nbt.getCompound(...).
// Script loaded with 0 errors but produced no visible tooltip — the MapJS
// getList path silently fails on enchanted books in this KubeJS version.
//
// v2 (this file): parse the stringified NBT with regex (the same approach
// lootjs_overhaul.js uses for its blank-book stripper, confirmed working).
// Also splits Text creation into simple steps so failures in one part
// don't swallow everything silently.
// =============================================================================

var BOOK_TOOLTIP_DIAG_LOGGED = false

ItemEvents.tooltip(event => {
  event.addAdvanced('minecraft:enchanted_book', (stack, advanced, text) => {
    try {
      if (!stack || stack.isEmpty()) return
      var tag = stack.nbt
      if (!tag) return
      var nbtStr = String(tag)

      // One-shot diagnostic on first call per client session. Confirms the
      // callback is firing and shows the actual NBT shape we're seeing.
      if (!BOOK_TOOLTIP_DIAG_LOGGED) {
        BOOK_TOOLTIP_DIAG_LOGGED = true
        console.info('[book-tooltip-fix] first fire; nbt=' + nbtStr.substring(0, 200))
      }

      // Locate the StoredEnchantments list body.
      var listMatch = nbtStr.match(/StoredEnchantments:\[(.*?)\]/)
      if (!listMatch) return
      var listBody = listMatch[1]
      if (!listBody || listBody.length < 5) return

      // Parse entries like {id:"namespace:name",lvl:Ns} — brackets
      // single-level, no nested braces, so a greedy-by-entry regex is safe.
      var entryRe = /\{[^{}]*?id:"([^"]+:[^"]+)"[^{}]*?lvl:(-?\d+)s?[^{}]*?\}/g
      var m
      var shown = 0
      while ((m = entryRe.exec(listBody)) !== null) {
        var id = m[1]
        var lvl = parseInt(m[2], 10)
        if (!id || !isFinite(lvl)) continue

        var parts = id.split(':')
        if (parts.length !== 2) continue

        // Vanilla pattern: enchantment.<namespace>.<path>
        var nameKey = 'enchantment.' + parts[0] + '.' + parts[1]
        var lvlKey = 'enchantment.level.' + lvl

        // Build the line piecewise so a failure in one step is visible.
        var nameComp = Text.translate(nameKey)
        var lvlComp = Text.translate(lvlKey)
        var line = Text.of(' ').append(nameComp).append(' ').append(lvlComp).gray()
        // Strip the leading space — using Text.of('') sometimes collapsed weirdly.
        text.add(1 + shown, line)
        shown++
      }
    } catch (e) {
      // Error path — always log so we can diagnose. Won't spam since it
      // only fires when the callback throws, which shouldn't be on
      // every tooltip render.
      console.warn('[book-tooltip-fix] error: ' + e)
    }
  })
})
