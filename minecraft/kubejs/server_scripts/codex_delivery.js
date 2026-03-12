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

// Exact item IDs to suppress (add confirmed IDs here)
const SUPPRESSED_BOOKS = [
  'terramity:guidebook',
  'terramity:terramity_guidebook',
  'simplyswords:runic_grimoire',
  'epicfight:skill_book',
  'primalmagick:grimoire',
  'primalmagick:grimoire_creative',
  'ars_nouveau:worn_notebook',
  'theabyss:the_abyss_guidebook'
]

// Suppress any patchouli:guide_book that isn't our codex
// Also suppress items matching book-like patterns from known mod namespaces
const BOOK_NAMESPACES = [
  'terramity', 'simplyswords', 'epicfight', 'primalmagick',
  'theabyss', 'celestial'
]

const BOOK_KEYWORDS = ['book', 'grimoire', 'guide', 'notebook', 'tome', 'manual']

PlayerEvents.inventoryChanged(event => {
  const item = event.item
  const id = item.id

  // Suppress exact matches
  if (SUPPRESSED_BOOKS.includes(id)) {
    item.count = 0
    console.log('[IridescentCraft] Suppressed book (exact): ' + id)
    return
  }

  // Suppress non-codex Patchouli guide books
  if (id === 'patchouli:guide_book') {
    let nbt = item.nbt
    if (nbt && nbt.getString('patchouli:book') !== 'icraft:iridescent_codex') {
      console.log('[IridescentCraft] Suppressed patchouli book: ' + (nbt.getString('patchouli:book') || 'unknown'))
      item.count = 0
      return
    }
  }

  // Suppress book-like items from known mod namespaces
  let ns = id.split(':')[0]
  let name = id.split(':')[1] || ''
  if (BOOK_NAMESPACES.includes(ns)) {
    for (let kw of BOOK_KEYWORDS) {
      if (name.indexOf(kw) !== -1) {
        item.count = 0
        console.log('[IridescentCraft] Suppressed book (pattern): ' + id)
        return
      }
    }
  }
})
