// =============================================================================
// SKYSHATTER MOB STRIP -- player-only thematic affix never on mobs
// =============================================================================
// Companion to skyshatter.json (mythic/ancient T4 player affix) + the
// on-hit handler in affixes/affix_effects.js. Designed as exclusively
// player-wielded; mob-equipped instances are a bug.
//
// Even though the affix.json gates rarity to mythic+ancient (which mobs
// almost never roll), Apoth bosses/minibosses CAN carry mythic+ gear,
// and our overworld-strip script in affix_overworld_strip.js exempts
// boss-tagged mobs from full affix-data removal. So a mythic boss
// could theoretically carry skyshatter and proc the launch effect on
// the player every time the boss hits them.
//
// Belt-and-suspenders fix: scan every mob's equipment on spawn, in any
// dimension, regardless of boss status. If the affix_data NBT mentions
// 'skyshatter' as a substring, scrub just the affixes/skyshatter entry
// (preserving the rest of the affix kit so bosses keep their hand-
// curated stat package).
//
// Stamps `icraft_skyshatter_scrubbed` to avoid re-scanning across
// chunk unload/load cycles.
// =============================================================================

const SKYSHATTER_AFFIX_ID = 'apotheosis:skyshatter'
const SKYSHATTER_SLOTS = ['mainhand', 'offhand', 'head', 'chest', 'legs', 'feet']

// Mirrors the broken-entities skip list from affix_overworld_strip.js
// and mob_scaling_unified.js. Calling getItemBySlot on these throws
// AbstractMethodError that Rhino can't catch.
const SKYSHATTER_STRIP_BROKEN_ENTITIES = new Set([
  'irons_spellbooks:necromancer',
  'irons_spellbooks:archevoker',
  'irons_spellbooks:cryomancer',
  'irons_spellbooks:pyromancer',
  'irons_spellbooks:priest',
])

function _skyshatterEntityResId(entity) {
  try { return String(entity.getType().builtInRegistryHolder().key().location()) } catch (e) {}
  try {
    var raw = String(entity.getType().toString())
    var m = raw.match(/^entity\.([^.]+)\.(.+)$/)
    if (m) return m[1] + ':' + m[2]
    return raw
  } catch (e) { return '' }
}

function _scrubSkyshatterFromStack(stack) {
  if (!stack || stack.isEmpty()) return false
  if (!stack.nbt || !stack.nbt.contains('affix_data')) return false
  // Cheap pre-check: serialize and substring-match. Avoids walking
  // sub-compounds when the affix isn't present.
  var rawStr = String(stack.nbt.getCompound('affix_data').toString())
  if (rawStr.indexOf('skyshatter') < 0) return false

  // Walk affix_data.affixes (the standard Apoth shape) and remove the
  // skyshatter entry by key. If the shape differs across Apoth versions
  // we fall back to removing the entire affix_data compound — better
  // to lose all affixes on this one piece than to leave skyshatter
  // active on a mob.
  try {
    var affixData = stack.nbt.getCompound('affix_data')
    if (affixData.contains('affixes')) {
      var affixes = affixData.getCompound('affixes')
      if (affixes.contains(SKYSHATTER_AFFIX_ID)) {
        affixes.remove(SKYSHATTER_AFFIX_ID)
        return true
      }
    }
  } catch (e) { /* fall through to nuke */ }

  stack.nbt.remove('affix_data')
  return true
}

EntityEvents.spawned(event => {
  let entity = event.entity
  if (!entity || !entity.living || entity.player) return
  if (!entity.monster) return

  let data = entity.persistentData
  if (data.contains('icraft_skyshatter_scrubbed')) return

  let resId = _skyshatterEntityResId(entity)
  if (SKYSHATTER_STRIP_BROKEN_ENTITIES.has(resId)) return
  // Skip the whole irons_spellbooks: namespace -- 8+ wizard subclasses
  // can throw AbstractMethodError on getItemBySlot, and none of them
  // legitimately wear skyshatter-affixed gear anyway.
  if (resId.indexOf('irons_spellbooks:') === 0) return

  let scrubbed = false
  for (let slot of SKYSHATTER_SLOTS) {
    let item
    try { item = entity.getItemBySlot(slot) } catch (e) { continue }
    if (_scrubSkyshatterFromStack(item)) {
      try { entity.setItemSlot(slot, item) } catch (e) {}
      scrubbed = true
    }
  }

  data.putBoolean('icraft_skyshatter_scrubbed', true)
  if (scrubbed) {
    console.log('[skyshatter-strip] scrubbed from ' + resId + ' at ' +
                entity.x.toFixed(0) + ',' + entity.y.toFixed(0) + ',' + entity.z.toFixed(0))
  }
})

console.log('[IridescentCraft] Skyshatter mob-strip loaded (any dim, any boss tag)')
