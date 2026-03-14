// =============================================================================
// IRIDESCENT CODEX — First-Join Delivery & Book Suppression
// =============================================================================

// NBT key is "patchouli:book" — Patchouli 1.20.1 Forge (quoted key with colon).
const CODEX_NBT = '{"patchouli:book":"icraft:iridescent_codex"}'

// ── First-Join Delivery ───────────────────────────────────────────────────────

PlayerEvents.loggedIn(event => {
  const player = event.player
  if (!player.persistentData.getBoolean('icraft_codex_given')) {
    player.give(Item.of('patchouli:guide_book', CODEX_NBT))
    player.persistentData.putBoolean('icraft_codex_given', true)
    player.tell('\u00a76[The Iridescent Codex]\u00a7r has been added to your inventory.')
    player.tell('Right-click to open. It covers every system, class, and mod in this pack.')
    console.log('[IridescentCraft] Codex delivered to ' + player.username)
  }
})

// ── Backup Recovery Recipe ────────────────────────────────────────────────────

ServerEvents.recipes(event => {
  event.shapeless(
    Item.of('patchouli:guide_book', CODEX_NBT),
    ['minecraft:book', 'minecraft:lapis_lazuli']
  ).id('icraft:codex_recovery_recipe')
})

// ── First-Join Book Suppression ───────────────────────────────────────────────
// Suppress unwanted mod books from inventory. Uses both exact ID matching
// and pattern matching to catch books even if exact IDs are unknown.

// Exact item IDs to suppress (add confirmed IDs here via /kubejs hand)
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

// Suppress any patchouli:guide_book that isn't our codex
// Also suppress items matching book-like patterns from known mod namespaces
const BOOK_NAMESPACES = [
  'terramity', 'simplyswords', 'epicfight', 'primalmagick',
  'theabyss', 'celestial', 'ars_nouveau'
]

const BOOK_KEYWORDS = [
  'book', 'grimoire', 'guide', 'notebook', 'tome', 'manual',
  'companion', 'codex', 'journal', 'tablet', 'compendium'
]

// Helper: check if an item should be suppressed
function shouldSuppressBook(id, item) {
  if (SUPPRESSED_BOOKS.includes(id)) return 'exact'
  if (id === 'patchouli:guide_book') {
    let nbt = item.nbt
    if (!nbt || nbt.getString('patchouli:book') !== 'icraft:iridescent_codex') return 'patchouli'
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

// Suppress on inventory change (catches most cases)
PlayerEvents.inventoryChanged(event => {
  const item = event.item
  const reason = shouldSuppressBook(item.id, item)
  if (reason) {
    // event.item.count = 0 may not work — clear the slot directly
    let inv = event.player.inventory
    let slot = event.slot
    inv.setItem(slot, Item.empty)
    console.log('[IridescentCraft] Suppressed book (' + reason + '): ' + item.id + ' from slot ' + slot)
  }
})

// Periodic sweep for books injected by delayed mod logic (runs first 60s after join)
PlayerEvents.loggedIn(event => {
  const player = event.player
  player.persistentData.putInt('icraft_book_sweep_ticks', 1200) // 60 seconds
})

ServerEvents.tick(event => {
  if (event.server.tickCount % 20 !== 0) return // check once per second
  event.server.players.forEach(player => {
    let sweepTicks = player.persistentData.getInt('icraft_book_sweep_ticks')
    if (sweepTicks <= 0) return
    player.persistentData.putInt('icraft_book_sweep_ticks', sweepTicks - 20)
    let inv = player.inventory
    for (let i = 0; i < inv.size; i++) {
      let stack = inv.getItem(i)
      if (stack.isEmpty()) continue
      let reason = shouldSuppressBook(stack.id, stack)
      if (reason) {
        console.log('[IridescentCraft] Sweep suppressed book (' + reason + '): ' + stack.id)
        inv.setItem(i, Item.empty)
      }
    }
  })
})
