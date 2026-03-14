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

// Suppress on inventory change
PlayerEvents.inventoryChanged(event => {
  const item = event.item
  const reason = shouldSuppressBook(item.id, item)
  if (reason) {
    event.player.inventory.setItem(event.slot, Item.of('minecraft:air'))
    console.log('[IridescentCraft] Suppressed (' + reason + '): ' + item.id + ' slot ' + event.slot)
  }
})

// Periodic sweep — runs for ALL players during first 5 minutes of server uptime
// AND for 60s after each player login (via persistentData timer)
// This catches books injected by mods that bypass inventoryChanged
ServerEvents.tick(event => {
  let tick = event.server.tickCount
  if (tick % 40 !== 0) return // check every 2 seconds

  // Log once at startup to confirm sweep is running
  if (tick === 40) {
    console.log('[IridescentCraft] Book sweep active — scanning every 2s for 5 minutes')
  }

  // Stop global sweep after 5 minutes (6000 ticks)
  let globalSweep = tick < 6000

  event.server.players.forEach(player => {
    let perPlayerSweep = player.persistentData.getInt('icraft_book_sweep_ticks') > 0
    if (perPlayerSweep) {
      player.persistentData.putInt('icraft_book_sweep_ticks',
        player.persistentData.getInt('icraft_book_sweep_ticks') - 40)
    }

    if (!globalSweep && !perPlayerSweep) return

    let inv = player.inventory
    for (let i = 0; i < inv.size; i++) {
      let stack = inv.getItem(i)
      if (stack.isEmpty()) continue
      let reason = shouldSuppressBook(stack.id, stack)
      if (reason) {
        console.log('[IridescentCraft] Sweep removed (' + reason + '): ' + stack.id + ' slot ' + i + ' from ' + player.username)
        inv.setItem(i, Item.of('minecraft:air'))
      }
    }
  })
})
