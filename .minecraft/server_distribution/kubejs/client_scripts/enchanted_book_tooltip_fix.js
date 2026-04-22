// =============================================================================
// ENCHANTED BOOK TOOLTIP — restore enchantment name line
// =============================================================================
// Apotheosis 7.3+ rewrites enchanted-book tooltips via an @Redirect mixin
// on ItemStack.appendEnchantmentNames. The replacement method builds a
// `realLevels` map from `stack.getAllEnchantments()`, which for an enchanted
// BOOK returns the `Enchantments` NBT tag (empty — books store enchants
// in `StoredEnchantments`). The method then calls
// `realLevels.remove(enchant).intValue()` per NBT entry, which NPEs on
// null. The NPE is caught silently and NO enchant line is added to the
// tooltip — so vanilla shows "Enchanted Book" with the enchant line
// missing, while the metadata line ("Discoverable | Lootable | ...") from
// a separate path still renders later in the tooltip.
//
// Jar-audit confirmed: dev.shadowsoffire.apotheosis.mixin.ItemStackMixin
// at offset apoth_enchTooltipRewrite, specifically the realLevels lookup.
//
// Workaround: read StoredEnchantments ourselves and inject the standard
// "Name Level" line at tooltip position 1 (right after the item name).
// =============================================================================

ItemEvents.tooltip(event => {
  event.addAdvanced('minecraft:enchanted_book', (stack, advanced, text) => {
    try {
      const nbt = stack.nbt
      if (!nbt) return
      const stored = nbt.getList ? nbt.getList('StoredEnchantments', 10) : null
      if (!stored || stored.size() <= 0) return
      // Insert each enchant as `enchantment.<namespace>.<name> Level`.
      // We use vanilla's translation key so the client renders the real
      // localized enchantment name (e.g., "Piercing I"). Styled gray
      // italic to match vanilla.
      let insertAt = 1
      for (let i = 0; i < stored.size(); i++) {
        const entry = stored.getCompound(i)
        const id = String(entry.getString('id') || '')
        if (!id || id.indexOf(':') < 0) continue
        const lvl = entry.getShort ? entry.getShort('lvl') : (entry.getInt ? entry.getInt('lvl') : 0)
        const parts = id.split(':')
        const translationKey = 'enchantment.' + parts[0] + '.' + parts[1]
        const levelKey = 'enchantment.level.' + lvl
        // Compose as translatable name + space + translatable level
        const nameComp = Text.translate(translationKey)
        const line = Text.of('').append(nameComp).append(' ').append(Text.translate(levelKey)).gray()
        text.add(insertAt + i, line)
      }
    } catch (e) {
      // Swallow silently — worst case, tooltip just shows the same missing-line
      // state as before; we don't want to break other tooltips.
    }
  })
})
