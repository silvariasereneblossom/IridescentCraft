// =============================================================================
// REFORGED ARMOR ENCHANT TOOLTIP — restore enchantment name lines
// =============================================================================
// Same root cause as enchanted_book_tooltip_fix.js: Apotheosis 7.3+ @Redirects
// ItemStack.appendEnchantmentNames and its replacement doesn't restore enchant
// lines for our iridescent_reforging:reforged_<piece> items. Players see an
// empty gap in the tooltip where the enchants should be.
//
// Fix: read `Enchantments` NBT directly via regex (same approach as the book
// fix, confirmed-working with our Rhino + KubeJS 6.x). Insert the enchant lines
// at position 1 (just after the item name), matching vanilla rendering order.
//
// Reforged armor uses standard `Enchantments` NBT (not `StoredEnchantments`
// like books) so the parsing path differs slightly: id + lvl from each entry,
// vanilla translation key `enchantment.<ns>.<path>` + `enchantment.level.N`.
// =============================================================================

var REFORGED_ARMOR_IDS = [
  'iridescent_reforging:reforged_helmet',
  'iridescent_reforging:reforged_chestplate',
  'iridescent_reforging:reforged_leggings',
  'iridescent_reforging:reforged_boots',
]

ItemEvents.tooltip(event => {
  REFORGED_ARMOR_IDS.forEach(itemId => {
    event.addAdvanced(itemId, (stack, advanced, text) => {
      try {
        if (!stack || stack.isEmpty()) return
        var tag = stack.nbt
        if (!tag) return
        var nbtStr = String(tag)

        // Locate the Enchantments list body. Bare-armor case: no `Enchantments`
        // key at all -> nothing to render, fall through silently.
        var listMatch = nbtStr.match(/Enchantments:\[(.*?)\]/)
        if (!listMatch) return
        var listBody = listMatch[1]
        if (!listBody || listBody.length < 5) return

        // Parse `{id:"namespace:name",lvl:Ns}` entries. Single-level brackets,
        // no nested braces, so a greedy-by-entry regex is safe.
        var entryRe = /\{[^{}]*?id:"([^"]+:[^"]+)"[^{}]*?lvl:(-?\d+)s?[^{}]*?\}/g
        var m
        var shown = 0
        while ((m = entryRe.exec(listBody)) !== null) {
          var id = m[1]
          var lvl = parseInt(m[2], 10)
          if (!id || !isFinite(lvl)) continue

          var parts = id.split(':')
          if (parts.length !== 2) continue

          var nameKey = 'enchantment.' + parts[0] + '.' + parts[1]
          var lvlKey = 'enchantment.level.' + lvl

          // Insert at position 1 (just after the item name) - mirrors vanilla
          // tooltip ordering. Use Text.gray for the standard enchant color.
          var nameComp = Text.translate(nameKey)
          var lvlComp = Text.translate(lvlKey)
          var line = Text.of('').append(nameComp).append(' ').append(lvlComp).gray()
          text.add(1 + shown, line)
          shown++
        }
      } catch (e) {
        console.warn('[reforged-armor-tooltip] error: ' + e)
      }
    })
  })
})
