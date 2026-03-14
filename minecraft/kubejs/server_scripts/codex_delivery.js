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
  // Always reset sweep timer on login
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

const SUPPRESSED_BOOKS = [
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
  'theabyss:the_abyss_guidebook'
]

const BOOK_NAMESPACES = [
  'terramity', 'simplyswords', 'epicfight', 'primalmagick',
  'theabyss', 'celestial', 'ars_nouveau'
]

const BOOK_KEYWORDS = [
  'book', 'grimoire', 'guide', 'notebook', 'tome', 'manual',
  'companion', 'codex', 'journal', 'tablet', 'compendium'
]

function shouldSuppressBook(id, item) {
  if (SUPPRESSED_BOOKS.includes(id)) return 'exact'
  if (id === 'patchouli:guide_book') {
    let nbt = item.nbt
    if (!nbt || nbt.getString('patchouli:book') !== 'icraft:iridescent_codex') return 'patchouli'
    return null
  }
  let ns = id.split(':')[0]
  let name = id.split(':')[1] || ''
  if (BOOK_NAMESPACES.includes(ns)) {
    for (let kw of BOOK_KEYWORDS) {
      if (name.indexOf(kw) !== -1) return 'pattern'
    }
  }
  return null
}

// Suppress on inventory change — mark items for sweep removal
// (direct slot clearing doesn't work reliably in inventoryChanged)
PlayerEvents.inventoryChanged(event => {
  const item = event.item
  const reason = shouldSuppressBook(item.id, item)
  if (reason) {
    // Flag for immediate sweep on next tick
    event.player.persistentData.putBoolean('icraft_needs_book_sweep', true)
    console.log('[IridescentCraft] Detected book (' + reason + '): ' + item.id)
  }
})

// Periodic sweep — scans and removes suppressed books from player inventories
// Uses multiple removal strategies since direct slot manipulation is unreliable
ServerEvents.tick(event => {
  let tick = event.server.tickCount
  if (tick % 20 !== 0) return // check every second

  if (tick === 20) {
    console.log('[IridescentCraft] Book sweep active')
  }

  let globalSweep = tick < 6000 // first 5 minutes

  event.server.players.forEach(player => {
    let perPlayerSweep = player.persistentData.getInt('icraft_book_sweep_ticks') > 0
    let needsImmediate = player.persistentData.getBoolean('icraft_needs_book_sweep')

    if (perPlayerSweep) {
      player.persistentData.putInt('icraft_book_sweep_ticks',
        player.persistentData.getInt('icraft_book_sweep_ticks') - 20)
    }
    if (needsImmediate) {
      player.persistentData.putBoolean('icraft_needs_book_sweep', false)
    }

    if (!globalSweep && !perPlayerSweep && !needsImmediate) return

    // Scan and remove using /clear command with exact item matching
    SUPPRESSED_BOOKS.forEach(bookId => {
      player.server.runCommandSilent('clear ' + player.username + ' ' + bookId + ' 64')
    })

    // Clear non-codex patchouli guide books using NBT exclusion
    // We can't use /clear with NBT negation, so scan manually
    let inv = player.inventory
    let removed = false
    for (let i = 0; i < inv.size; i++) {
      let stack = inv.getItem(i)
      if (stack.isEmpty()) continue
      if (stack.id === 'patchouli:guide_book') {
        let nbt = stack.nbt
        if (!nbt || nbt.getString('patchouli:book') !== 'icraft:iridescent_codex') {
          let bookName = nbt ? nbt.getString('patchouli:book') : 'unknown'
          console.log('[IridescentCraft] Removing patchouli book: ' + bookName + ' slot ' + i)
          // Try multiple removal approaches
          stack.count = 0
          inv.setItem(i, stack)
          removed = true
        }
      }
      // Also check namespace+keyword pattern
      let ns = stack.id.split(':')[0]
      let name = stack.id.split(':')[1] || ''
      if (BOOK_NAMESPACES.includes(ns)) {
        for (let kw of BOOK_KEYWORDS) {
          if (name.indexOf(kw) !== -1) {
            console.log('[IridescentCraft] Removing pattern book: ' + stack.id + ' slot ' + i)
            player.server.runCommandSilent('clear ' + player.username + ' ' + stack.id + ' 64')
            removed = true
            break
          }
        }
      }
    }
    if (removed) {
      // Force inventory sync
      player.inventory.setChanged()
    }
  })
})
