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
// Mods that inject books directly into inventory bypass pickedUpItem.
// Use inventoryChanged to catch all additions regardless of method.
// Item IDs marked TODO need confirmation via /kubejs hand in-game.

const SUPPRESSED_BOOKS = [
  'terramity:guidebook',        // TODO: confirm with /kubejs hand
  'epicfight:skill_book',       // TODO: confirm — Combatant's Companion
  'primalmagick:grimoire'       // TODO: confirm — Runic Grimoire
]

PlayerEvents.inventoryChanged(event => {
  const id = event.item.id
  if (SUPPRESSED_BOOKS.includes(id)) {
    event.item.count = 0
    console.log('[IridescentCraft] Suppressed mod book: ' + id + ' from ' + event.player.username)
  }
})
