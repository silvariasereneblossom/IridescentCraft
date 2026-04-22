// =============================================================================
// BACKPACKED — remove all mod-shipped recipes
// =============================================================================
// Tester 2026-04-22: installed Backpacked for the dedicated back slot UX,
// but doesn't want Backpacked's own craftables competing with Sophisticated
// Backpacks for storage identity. Remove every backpacked:* recipe — the
// mod's slot mechanic and ICurio-style inventory still work regardless.
// Players obtain the vanilla backpack via loot only (add later if desired).
// =============================================================================

ServerEvents.recipes(event => {
  let count = 0
  event.remove({ mod: 'backpacked' })
  count++
  console.log('[IridescentCraft] Backpacked: removed all mod-shipped recipes (slots/mechanics retained)')
})
