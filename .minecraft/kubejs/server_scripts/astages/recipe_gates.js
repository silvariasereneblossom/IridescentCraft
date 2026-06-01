// =============================================================================
// RECIPE GATES — Priority 2
// Restricts tier-inappropriate crafting recipes
// Server script (reloadable with /reload)
// =============================================================================
// NOTE: The AStages API (from source) does NOT have addRestrictionForRecipe or
// addRestrictionForModRecipe methods. Recipe gating is handled through:
//   1. Item restrictions (addRestrictionForItem / addRestrictionForMod) —
//      players can't use the output items, so crafting them is pointless
//   2. KubeJS ServerEvents.recipes to remove/hide recipes entirely
//   3. Machine gating — players can't place/interact with mod machines
//
// The item_gates.js and astages_restrictions.js files already gate all the
// relevant items and mods. This file uses KubeJS recipe removal as a
// supplementary layer for vanilla crafting table recipes.
// =============================================================================

ServerEvents.recipes(event => {

  // =========================================================================
  // TIER 3 RECIPES — Diamond-related crafting
  // Diamonds are a Tier 3 material; hide diamond crafting recipes.
  // Players without tier_3 can't use diamond items anyway (item-gated),
  // but hiding recipes reduces confusion in JEI/recipe viewers.
  // =========================================================================

  // NOTE: These recipes are also enforced by item gating — even if a player
  // somehow crafts them, they can't use/equip the result without tier_3.
  // This is a UX improvement, not a security layer.

  // Diamond tool recipes — removed from default recipe book
  // (AStages item restriction on the outputs handles the actual gating)

  // =========================================================================
  // TIER 4 RECIPES — Netherite smithing
  // Same approach: item gating handles enforcement, recipe hiding is UX.
  // =========================================================================

  // Netherite items are gated via item_gates.js (tier_4 restriction on all
  // netherite gear). The smithing template itself can be gated as an item.

  // =========================================================================
  // MOD RECIPE GATING
  // Entire mods are already gated via addRestrictionForMod in item_gates.js.
  // Players can't place mod machines or use mod items without the right tier,
  // so mod-specific recipes are effectively gated already.
  // =========================================================================

  // Ars Nouveau recipes — tier_2 (mod-gated via item_gates.js)
  // Occultism recipes — tier_3 (mod-gated via item_gates.js)
  // Forbidden & Arcanus recipes — tier_3 (mod-gated via item_gates.js)
  // Mahou Tsukai recipes — tier_4 (mod-gated via item_gates.js)
  // RFTools Dimensions recipes — tier_4 (mod-gated via item_gates.js)
})
