// =============================================================================
// Broken Item Tooltip — Client Script
// Shows "(Broken)" on items that have been reduced to 0 durability by death
// =============================================================================

ItemEvents.tooltip(event => {
  event.addAdvanced('*', (stack, advanced, text) => {
    if (!stack.isEmpty && stack.nbt && stack.nbt.getBoolean('icraft_broken')) {
      text.add(1, Text.red(Text.of('\u2718 BROKEN').bold()))
      text.add(2, Text.gray('Repair at an anvil to restore functionality'))
    }
  })
})
