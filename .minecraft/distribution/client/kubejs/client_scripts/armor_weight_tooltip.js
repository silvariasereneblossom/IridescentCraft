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

// Two-stage diagnostic to disambiguate addAdvancedToAll firing at all
// vs. firing-but-skipping-armor. Stage 1 fires on the first ANY-item
// hover (proves the callback runs). Stage 2 fires on the first armor
// hover (proves the tag/isArmor check works).
var TOOLTIP_ANY_DIAG_LOGGED = false
var TOOLTIP_ARMOR_DIAG_LOGGED = false

ItemEvents.tooltip(event => {
  // addAdvancedToAll, NOT addAdvanced('*', ...). The '*' filter is parsed
  // as an Ingredient by addAdvanced and matches the literal item id "*",
  // not all items - the script silently registered a handler that matched
  // nothing. addAdvancedToAll is the documented "every item" entrypoint
  // (per local/kubejs/event_groups/ItemEvents/tooltip.md).
  event.addAdvancedToAll((stack, advanced, text) => {
    if (stack.isEmpty) return

    // Reforged armor has its own tooltip — Java side handles tier line.
    let id = String(stack.id)

    // Stage 1: PROVE the addAdvancedToAll callback fires at all.
    if (!TOOLTIP_ANY_DIAG_LOGGED) {
      TOOLTIP_ANY_DIAG_LOGGED = true
      console.log('[armor_weight_tooltip DIAG-S1] addAdvancedToAll fired; first item id=' + id)
    }

    if (id.startsWith('iridescent_reforging:reforged_')) return

    // Stage 2: PROVE armor detection works on a real armor hover.
    if (!TOOLTIP_ARMOR_DIAG_LOGGED && isArmorItem(stack)) {
      TOOLTIP_ARMOR_DIAG_LOGGED = true
      var tagList = 'unknown'
      try { tagList = String(stack.tags) } catch (_) {}
      console.log('[armor_weight_tooltip DIAG-S2] first armor hover:' +
                  ' id=' + id +
                  ' isArmor=' + isArmorItem(stack) +
                  ' hasTag(armor_heavy)=' + stack.hasTag('icraft:armor_heavy') +
                  ' hasTag(armor_medium)=' + stack.hasTag('icraft:armor_medium') +
                  ' hasTag(armor_light)=' + stack.hasTag('icraft:armor_light') +
                  ' hasTag(armor_robe)=' + stack.hasTag('icraft:armor_robe') +
                  ' tags=' + tagList)
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
