// =============================================================================
// RANDOMIZE BLANK ("None") SCROLLS
// Place in: kubejs/server_scripts/randomize_blank_scrolls.js
// =============================================================================
//
// Companion to the 2026-05-14 randomize_spell injection across the
// icraft_loot_overrides Paxi datapack. That fix only takes effect on NEW
// loot rolls -- chests that already generated and scrolls already in player
// inventories carry the legacy "None" state (no spell bound).
//
// This script retroactively binds a spell to any blank scroll the player
// touches:
//   - on loggedIn: scan main inventory + offhand
//   - on inventoryChanged: scan again (covers chest -> inventory transfers,
//     so the moment a player pulls a blank scroll from an old chest, it
//     becomes a real T1 scroll in their hand)
//
// Limitation: scrolls left sitting in a chest are NOT mutated until the
// player picks them up. By design -- no periodic world scan, no chest-open
// hook. The randomization fires the instant the scroll enters player
// inventory, which is the only moment the player would actually use it.
//
// Spell selection mirrors RandomizeSpellFunction:
//   - Weighted by SpellRarity: COMMON=40, UNCOMMON=30, RARE=15, EPIC=8, LEGENDARY=4
//   - T1 quality range (0.0 - 0.2): spellLevel = 1 + round(q * (maxLevel - 1))
//   - Skips disabled spells and the sentinel "none" spell
//
// Pairs with:
//   datapack_sources/icraft_loot_overrides/data/**/*.json -- 489 scroll
//   entries with randomize_spell function (forward fix for new loot rolls)
// =============================================================================

const SpellRegistry_rbs = Java.loadClass('io.redspace.ironsspellbooks.api.registry.SpellRegistry')
const ISpellContainer_rbs = Java.loadClass('io.redspace.ironsspellbooks.api.spells.ISpellContainer')

// Rarity weight table mirroring RandomizeSpellFunction.getWeightFromRarity.
// SpellRarity ordinal: 0=COMMON 1=UNCOMMON 2=RARE 3=EPIC 4=LEGENDARY
var RARITY_WEIGHTS = [40, 30, 15, 8, 4]

var pickRandomSpell = function() {
  try {
    var spells = SpellRegistry_rbs.getEnabledSpells()
    if (!spells || spells.size() === 0) return null
    var noneSpell = SpellRegistry_rbs.none()
    var totalWeight = 0
    var entries = []
    var iter = spells.iterator()
    while (iter.hasNext()) {
      var s = iter.next()
      if (s.equals(noneSpell)) continue
      var rarityIdx = s.getMinRarity()
      var w = (rarityIdx >= 0 && rarityIdx < RARITY_WEIGHTS.length) ? RARITY_WEIGHTS[rarityIdx] : 1
      totalWeight += w
      entries.push({ spell: s, cumulative: totalWeight })
    }
    if (entries.length === 0) return null
    var roll = Math.floor(Math.random() * totalWeight)
    for (var i = 0; i < entries.length; i++) {
      if (roll < entries[i].cumulative) return entries[i].spell
    }
    return entries[entries.length - 1].spell
  } catch (e) {
    return null
  }
}

var randomizeStack = function(player, stack) {
  if (!stack || stack.isEmpty()) return false
  try {
    var id = String(stack.getItem().builtInRegistryHolder().key().location())
    if (id !== 'irons_spellbooks:scroll') return false
    // Skip already-bound scrolls. isSpellContainer() returns true when the
    // NBT was written by createScrollContainer; blank scrolls fail this check.
    if (ISpellContainer_rbs.isSpellContainer(stack)) {
      var container = ISpellContainer_rbs.get(stack)
      if (container && !container.isEmpty()) return false
    }
    var spell = pickRandomSpell()
    if (!spell) return false
    // T1 quality: 0.0 - 0.2 uniform
    var quality = Math.random() * 0.2
    var maxLevel = spell.getMaxLevel()
    var level = 1 + Math.round(quality * (maxLevel - 1))
    if (level < 1) level = 1
    ISpellContainer_rbs.createScrollContainer(spell, level, stack)
    if (!global._rbs_seen) {
      global._rbs_seen = true
      console.log('[randomize_blank_scrolls] first fix: ' + player.username +
                  ' -> ' + spell.getSpellName() + ' L' + level + ' (logging once)')
    }
    return true
  } catch (e) {
    return false
  }
}

var scanPlayer = function(player) {
  if (!player) return
  try {
    var inv = player.getInventory()
    if (!inv) return
    for (var i = 0; i < inv.getContainerSize(); i++) {
      randomizeStack(player, inv.getItem(i))
    }
  } catch (e) {}
}

PlayerEvents.inventoryChanged(event => {
  // Fast path: only scan if the changed item is actually a scroll.
  try {
    var changed = event.item
    if (!changed || changed.isEmpty()) return
    var id = String(changed.getItem().builtInRegistryHolder().key().location())
    if (id !== 'irons_spellbooks:scroll') return
  } catch (e) {
    // If we can't read the changed item, fall through to full scan
  }
  scanPlayer(event.player)
})

PlayerEvents.loggedIn(event => {
  scanPlayer(event.player)
})
