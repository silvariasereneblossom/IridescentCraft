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
//
// 2026-10-10 -- the strip never took effect before this date, for three
// independent reasons (all jar-verified against KubeJS 2001.6.5-build.16):
//   1. It listened on ItemEvents.firstRightClicked. Server-side that event is
//      only posted when the CLIENT sends KubeJS's FirstClickMessage, and the
//      client only sends it when its own JVM has a firstRightClicked listener
//      -- on a dedicated server (server script only) it essentially never fires.
//   2. firstRightClicked is declared WITHOUT hasResult(): it cannot be
//      cancelled (FirstClickMessage discards the result; a cancel that reaches
//      the dispatcher is reported as "Event returned result when it's not
//      cancellable").
//   3. event.cancel() works by THROWING EventExit, and it was called inside the
//      try, so the catch swallowed it (and logged a warning per click).
// Now: ItemEvents.rightClicked (fires server-side from Forge's
// PlayerInteractEvent.RightClickItem BEFORE Item.use(), and is cancellable --
// same event death_penalty.js already cancels), decide inside the try, cancel
// after it. All 20 items fire from use()/releaseUsing(), so cancelling the use
// is sufficient. The server never starts the "using" state, so no projectile
// can be released; the client may still play its local draw animation.
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

ItemEvents.rightClicked(event => {
  // RHINO: declared OUTSIDE the try -- this Rhino build scopes a `var` declared
  // inside a block to that block, so it would be undefined after the catch.
  var shouldCancel = false
  try {
    var stack = event.item
    if (stack && !stack.isEmpty() && STRIPPED_ITEMS.has(String(stack.id || ''))) {
      shouldCancel = true
    }
  } catch (e) {
    if (!global._dna_staves_strip_warned) {
      global._dna_staves_strip_warned = true
      console.warn('[dna_simple_staves_strip] right-click check failed (logging once): ' + e)
    }
  }
  // cancel() unwinds by throwing KubeJS' EventExit -- it must stay outside the try.
  if (shouldCancel) event.cancel()
})

console.log('[dna_simple_staves_strip] loaded — ' + STRIPPED_ITEMS.size +
            ' items stripped of right-click projectile use')
