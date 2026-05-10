// =============================================================================
// DAN'S MAGIC + SIMPLE STAVES — MCreator strip
// =============================================================================
// Cancels right-click projectile use on all 5 Dan's Magic staves and all
// Simple Staves elemental + material wands. Removes the MCreator-default
// behavior (firing themed projectiles) so our held-item buffs become the
// item's only function. Particle / sound effects vanish implicitly when
// right-click is no-op'd.
//
// Companion: startup_scripts/dna_simple_staves_buffs.js (held-item buffs).
// MCreator advancements are blanked via icraft_staff_overrides datapack
// (separate, see Paxi datapack source).
//
// Memory: feedback_kubejs_event_scope.md (PlayerEvents.* server-only).
// =============================================================================

const STRIPPED_ITEMS = new Set([
  // Dan's Magic — 5 staves (no projectile use; they are buffs only)
  'dna:ice_staff',
  'dna:lightning_staff',
  'dna:magma_staff',
  'dna:tnt_staff',         // Apprentice Battlerod (still attacks via vanilla sword swing)
  'dna:toxic_staff',

  // Simple Staves — 6 material wands (will become Tetra-modular in Phase D;
  // strip projectile in advance so the modular replacement doesn't carry
  // the MCreator behavior over)
  'simple_staves:woodenwand',
  'simple_staves:stone_wand',
  'simple_staves:iron_wand',
  'simple_staves:gold_wand',
  'simple_staves:diamond_wand',
  'simple_staves:netherite_wand',

  // Simple Staves — 9 element wands kept (explosion_wand stripped as redundant)
  'simple_staves:flame_wand',
  'simple_staves:wind_essence_wand',
  'simple_staves:thunder_wand',
  'simple_staves:venomite_wand',
  'simple_staves:viritium_wand',
  'simple_staves:veil_wand',
  'simple_staves:void_wand',
  'simple_staves:tenebrium_wand',

  // explosion_wand: also strip its right-click; recipe gets stripped
  // in tier_gated_recipes.js so the item becomes effectively
  // creative-only / vestigial.
  'simple_staves:explosion_wand'
])

// Note: Apprentice Battlerod (dna:tnt_staff) is in the strip set because
// we want to remove the projectile use (no more TNT-throw). It still
// attacks via vanilla sword swing (it's a SwordItem subclass per Dan's
// Magic source); only the right-click is cancelled.

ItemEvents.firstRightClicked(event => {
  try {
    var stack = event.item
    if (!stack || stack.isEmpty()) return
    var id = String(stack.id || '')
    if (STRIPPED_ITEMS.has(id)) {
      event.cancel()
    }
  } catch (e) {
    console.warn('[dna_simple_staves_strip] right-click cancel failed: ' + e)
  }
})

console.log('[dna_simple_staves_strip] loaded — ' + STRIPPED_ITEMS.size +
            ' items stripped of right-click projectile use')
