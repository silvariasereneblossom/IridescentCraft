// =============================================================================
// IRIDESCENT CODEX — First-Join Delivery & Book Suppression
// =============================================================================

const CODEX_NBT = '{"patchouli:book":"icraft:iridescent_codex"}'
const CODEX_FLAG = 'icraft_codex_given'

function codex_giveBook(player) {
  try {
    player.give(Item.of('patchouli:guide_book', CODEX_NBT))
    player.tell('\u00a76[The Iridescent Codex]\u00a7r has been added to your inventory.')
    player.tell('Right-click to open. It covers every system, class, and mod in this pack.')
    return true
  } catch (e) {
    console.warn('[codex] Give failed for ' + player.username + ': ' + e)
    return false
  }
}

// Scan inventory for an existing codex (matches the NBT). Used to re-grant
// if the flag is set but the book was lost (creative purge, /clear, death
// in keepInventory=false, etc.).
function codex_playerHasCodex(player) {
  try {
    let r = player.server.runCommandSilent(
      `clear ${player.username} patchouli:guide_book{"patchouli:book":"icraft:iridescent_codex"} 0`
    )
    // `/clear ... <count=0>` returns the matching-item count without clearing.
    return r > 0
  } catch (e) {
    console.warn('[codex] inventory check failed for ' + player.username + ': ' + e)
    return false
  }
}

// ── First-Join Delivery ───────────────────────────────────────────────────────

PlayerEvents.loggedIn(event => {
  const player = event.player
  let flagSet = player.persistentData.getBoolean(CODEX_FLAG)
  let hasBook = flagSet ? codex_playerHasCodex(player) : false

  if (!flagSet) {
    // Never given — give now.
    if (codex_giveBook(player)) {
      player.persistentData.putBoolean(CODEX_FLAG, true)
      console.log('[codex] First-join delivery to ' + player.username)
    }
  } else if (!hasBook) {
    // Flag set but book missing — re-grant silently (lost to /clear, death, etc.)
    if (codex_giveBook(player)) {
      console.log('[codex] Re-delivered to ' + player.username + ' (flag was set but book missing)')
    }
  } else {
    console.log('[codex] ' + player.username + ' already has the book, skipping delivery')
  }

  player.persistentData.putInt('icraft_book_sweep_ticks', 1200)
  console.log('[codex] loggedIn fired for ' + player.username + ', sweep armed')
})

// ── Admin/tester chat command: !codex force-delivers the book ──
// Useful when auto-delivery missed (persistent flag stale, /clear wiped
// inventory without us noticing, testing a fresh character, etc.).
PlayerEvents.chat(event => {
  if (event.message !== '!codex') return
  event.cancel()
  const player = event.player
  // Clear the flag so any logic that keys off it knows the book is fresh
  player.persistentData.putBoolean(CODEX_FLAG, false)
  if (codex_giveBook(player)) {
    player.persistentData.putBoolean(CODEX_FLAG, true)
    console.log('[codex] !codex from ' + player.username + ': granted')
  }
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
global.tick_codexBookSweep = (event) => {
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
}
global.registerServerTick('tick_codexBookSweep', 20, 0)
