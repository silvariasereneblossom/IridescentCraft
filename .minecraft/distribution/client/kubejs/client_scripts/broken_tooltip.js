// =============================================================================
// Broken Item Tooltip — Client Script
// Shows "(Broken)" on items that have been reduced to 0 durability by death
// =============================================================================

ItemEvents.tooltip(event => {
  // addAdvancedToAll, NOT addAdvanced('*', ...). The '*' filter matches
  // the literal item id "*" not all items, so the previous registration
  // silently no-op'd. See armor_weight_tooltip.js for the longer note.
  event.addAdvancedToAll((stack, advanced, text) => {
    if (!stack.isEmpty && stack.nbt && stack.nbt.getBoolean('icraft_broken')) {
      text.add(1, Text.red(Text.of('\u2718 BROKEN').bold()))
      text.add(2, Text.gray('Repair at an anvil to restore functionality'))
    }
  })
})
