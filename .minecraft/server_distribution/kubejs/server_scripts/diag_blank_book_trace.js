// =============================================================================
// BLANK ENCHANTED BOOK TRACER
// Place in: kubejs/server_scripts/diag_blank_book_trace.js
//
// Logs any minecraft:enchanted_book with empty/missing StoredEnchantments
// entering a player's inventory. Use to localize the upstream source if
// blank books keep appearing in real playtest.
//
// Added 2026-05-17 in tandem with removal of the chest-wide blank-book
// filter in lootjs_overhaul.js (which was stripping ~97% of legitimate
// books due to whitespace-format mismatch in its regex). See that file's
// removal comment for full context.
//
// Once trace logs show NO blanks for a sustained playtest period (e.g.
// a few sessions of normal chest opening), this script can be deleted.
// =============================================================================

PlayerEvents.inventoryChanged(event => {
  var stack = event.item
  if (!stack || stack.isEmpty()) return

  // Resolve item ID defensively (stack.id is a KubeJS extension that
  // may not always be present; fall back to the Forge API).
  var id = String(stack.id || '')
  if (!id) {
    try { id = String(stack.getItem().builtInRegistryHolder().key().location()) } catch (e) { return }
  }
  if (id !== 'minecraft:enchanted_book') return

  // A valid enchanted book always has a tag with StoredEnchantments
  // containing at least one id:"namespace:name" entry (whitespace optional).
  var tag = stack.getTag ? stack.getTag() : null
  var nbtStr = tag ? String(tag) : ''

  // Normalize whitespace so the check is format-independent.
  var normalized = nbtStr.replace(/\s+/g, '')

  // "Blank" = no tag, no StoredEnchantments key, or empty/malformed list.
  var isBlank =
    nbtStr.length === 0 ||
    normalized.indexOf('StoredEnchantments:[') < 0 ||
    !/StoredEnchantments:\[[^\]]*id:"[^"]+:[^"]+"/.test(normalized)

  if (isBlank) {
    var pos = event.player.blockPosition()
    console.log('[BLANK_BOOK_TRACE] player=' + event.player.name.getString() +
      ' dim=' + event.player.level.dimension().location() +
      ' pos=' + pos.x + ',' + pos.y + ',' + pos.z +
      ' nbt=' + (nbtStr || '<none>'))
  }
})
