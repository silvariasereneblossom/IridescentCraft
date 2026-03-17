// =============================================================================
// IRIDESCENT CODEX — First-Join Delivery & Book Suppression
// =============================================================================

const CODEX_NBT = '{"patchouli:book":"icraft:iridescent_codex"}'

// ── First-Join Delivery ───────────────────────────────────────────────────────

PlayerEvents.loggedIn(event => {
  const player = event.player
  if (!player.persistentData.getBoolean('icraft_codex_given')) {
    player.give(Item.of('patchouli:guide_book', CODEX_NBT))
    player.persistentData.putBoolean('icraft_codex_given', true)
    player.tell('\u00a76[The Iridescent Codex]\u00a7r has been added to your inventory.')
    player.tell('Right-click to open. It covers every system, class, and mod in this pack.')
  }
  player.persistentData.putInt('icraft_book_sweep_ticks', 1200)
  console.log('[IridescentCraft] loggedIn fired for ' + player.username + ', sweep armed')
})

// ── Backup Recovery Recipe ────────────────────────────────────────────────────

ServerEvents.recipes(event => {
  event.shapeless(
    Item.of('patchouli:guide_book', CODEX_NBT),
    ['minecraft:book', 'minecraft:lapis_lazuli']
  ).id('icraft:codex_recovery_recipe')
})

// ── Book Suppression ────────────────────────────────────────────────────────
// Uses /clear commands exclusively since inventory slot manipulation is broken.
// Patchouli books from other mods share the patchouli:guide_book item ID
// but have different NBT. We clear each known mod book by NBT.

// Known patchouli book NBT values to suppress
const PATCHOULI_BOOKS_TO_CLEAR = [
  'terramity:terramity_guidebook',
  'simplyswords:runic_grimoire',
  'ars_nouveau:worn_notebook',
  'irons_spellbooks:irons_spellbooks',
  'thermal:guidebook',
  'create:book',
  'footwork:combat_manual',
  'theabyss:the_abyss'
]

// Non-patchouli book item IDs to suppress
const OTHER_BOOKS_TO_CLEAR = [
  'terramity:guidebook',
  'terramity:terramity_guidebook',
  'terramity:guide_book',
  'simplyswords:runic_grimoire',
  'simplyswords:runic_tablet',
  'epicfight:skill_book',
  'epicfight:combat_book',
  'epicfight:combatants_companion',
  'primalmagick:grimoire',
  'primalmagick:grimoire_creative',
  'ars_nouveau:worn_notebook',
  'theabyss:the_abyss_guidebook',
  'botania:lexicon'
]

// Run all clear commands for a player
function clearModBooks(player, doLog) {
  let name = player.username
  let cleared = 0

  // Clear known patchouli guide books by NBT
  PATCHOULI_BOOKS_TO_CLEAR.forEach(bookId => {
    let cmd = 'clear ' + name + ' patchouli:guide_book{"patchouli:book":"' + bookId + '"} 64'
    let result = player.server.runCommandSilent(cmd)
    if (result > 0) {
      console.log('[IridescentCraft] Cleared patchouli book: ' + bookId + ' (' + result + ' items)')
      cleared += result
    }
  })

  // Clear non-patchouli mod books by item ID
  OTHER_BOOKS_TO_CLEAR.forEach(bookId => {
    let result = player.server.runCommandSilent('clear ' + name + ' ' + bookId + ' 64')
    if (result > 0) {
      console.log('[IridescentCraft] Cleared mod book: ' + bookId + ' (' + result + ' items)')
      cleared += result
    }
  })

  if (doLog && cleared === 0) {
    console.log('[IridescentCraft] Sweep ran for ' + name + ' — no books found')
  }
}

// Sweep: aggressive for first 10s after login (every 1s), then every 10s for 2 min
ServerEvents.tick(event => {
  let tick = event.server.tickCount

  event.server.players.forEach(player => {
    let sweepTicks = player.persistentData.getInt('icraft_book_sweep_ticks')
    if (sweepTicks <= 0) return

    // First 10 seconds (200 ticks): clear every second
    // After that: clear every 10 seconds
    let aggressive = sweepTicks > 1000 // 1200 - 200 = first 10s
    let interval = aggressive ? 20 : 200

    if (tick % interval !== 0) return

    player.persistentData.putInt('icraft_book_sweep_ticks', sweepTicks - interval)
    clearModBooks(player, aggressive)
  })
})
