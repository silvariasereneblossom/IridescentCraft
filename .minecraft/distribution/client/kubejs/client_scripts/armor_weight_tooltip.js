// =============================================================================
// Armor Weight Tooltip — Client Script
// =============================================================================
// Shows the weight tier (Robe / Light / Medium / Heavy) on every armor item's
// tooltip, color-coded to match the in-world effect from armor_weight.js:
//
//   Robe   light_purple    +mana_regen + small speed, low armor + toughness,
//                          full 4-piece set bonus (+0.5 mana_regen extra)
//   Light  aqua            +speed, light penalty
//   Medium yellow          neutral (no bonus or penalty)
//   Heavy  gold            +armor, -speed/-mana
//
// Tier comes from the four icraft:armor_robe / armor_light / armor_medium /
// armor_heavy tags. Untagged items that ARE armor (any ArmorItem subclass)
// show "Medium Armor" — matches the runtime default in armor_weight.js where
// untagged armor falls through to medium classification.
//
// Reforged armor (iridescent_reforging:reforged_*) is skipped here — those
// items already display the tier via Java appendHoverText in
// ItemModularArmor (with a tier-specific T1/T2/T3 line above it).
// =============================================================================

const _armorClass = (() => {
  try { return Java.loadClass('net.minecraft.world.item.ArmorItem') }
  catch (e) { return null }
})()

function isArmorItem(stack) {
  if (_armorClass === null) return false
  try { return _armorClass.isInstance(stack.getItem()) }
  catch (e) { return false }
}

// One-shot diagnostic: log iron_chestplate's tag detection on first hover
// after script load. If hasTag returns false here, the tag file isn't
// loaded into the item registry (datapack layering / sync issue).
var ARMOR_TOOLTIP_DIAG_LOGGED = false

ItemEvents.tooltip(event => {
  event.addAdvanced('*', (stack, advanced, text) => {
    if (stack.isEmpty) return

    // Reforged armor has its own tooltip — Java side handles tier line.
    let id = String(stack.id)
    if (id.startsWith('iridescent_reforging:reforged_')) return

    if (!ARMOR_TOOLTIP_DIAG_LOGGED && id === 'minecraft:iron_chestplate') {
      ARMOR_TOOLTIP_DIAG_LOGGED = true
      console.log('[armor_weight_tooltip DIAG] iron_chestplate hover: ' +
                  'hasTag(icraft:armor_heavy)=' + stack.hasTag('icraft:armor_heavy') +
                  ' hasTag(icraft:armor_light)=' + stack.hasTag('icraft:armor_light') +
                  ' hasTag(icraft:armor_robe)=' + stack.hasTag('icraft:armor_robe') +
                  ' isArmorItem=' + isArmorItem(stack))
    }

    let label = null
    let color = null

    if (stack.hasTag('icraft:armor_robe')) {
      label = 'Robe Armor'; color = 'light_purple'
    } else if (stack.hasTag('icraft:armor_light')) {
      label = 'Light Armor'; color = 'aqua'
    } else if (stack.hasTag('icraft:armor_heavy')) {
      label = 'Heavy Armor'; color = 'gold'
    } else if (isArmorItem(stack)) {
      // Untagged but is armor → defaults to MEDIUM at runtime per
      // armor_weight.js classifyArmor() fallthrough. Surface that explicitly.
      label = 'Medium Armor'; color = 'yellow'
    }

    if (label) {
      text.add(Text.of(label).color(color))
    }
  })
})
