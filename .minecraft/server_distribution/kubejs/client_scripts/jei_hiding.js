// =============================================================================
// JEI ITEM HIDING — Transmuted Materials
// =============================================================================
// Hide transmuted tier-skip items from JEI item panel.
// They still work in recipes via forge tags — players discover them
// through the Codex or by looking up input material uses.
// =============================================================================

JEIEvents.hideItems(event => {
  event.hide('kubejs:transmuted_steel')
  event.hide('kubejs:transmuted_manasteel')
  event.hide('kubejs:transmuted_osmium')
  event.hide('kubejs:transmuted_diamond')
  event.hide('kubejs:transmuted_ancient_debris')
})
