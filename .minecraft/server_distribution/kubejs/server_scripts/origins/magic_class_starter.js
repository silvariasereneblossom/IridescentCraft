// =============================================================================
// MAGIC CLASS STARTER KIT
// =============================================================================
// Problem: Magic-focused classes (Archmage, Battlemage, Void Summoner) need
// a catalyst to play their class, but in the early game catalysts are not
// guaranteed drops. Testers reported it was "variable whether you can even
// play the class early."
//
// Fix: When a player first registers as a magic class (first time the class
// cache picks them up as one of these classes), give them a starter kit
// sized to the class. One-time, gated by a persistent flag.
//
// Runs as a server tick so it catches the class AFTER origin selection
// completes — loggedIn fires before the origin prompt is resolved.

const MAGIC_STARTER_KITS = {
  archmage: [
    // Pure magic class — full kit
    { item: 'irons_spellbooks:copper_spell_book', count: 1 },
    { item: 'ars_nouveau:novice_spell_book',     count: 1 },
    { item: 'ars_nouveau:source_gem',            count: 5 },
    { item: 'irons_spellbooks:common_ink',       count: 2 }
  ],
  battlemage: [
    // Hybrid — lighter kit, player also has melee options
    { item: 'irons_spellbooks:copper_spell_book', count: 1 },
    { item: 'ars_nouveau:source_gem',            count: 3 },
    { item: 'irons_spellbooks:common_ink',       count: 1 }
  ],
  void_summoner: [
    // Dark summoner — needs a catalyst + a pearl to bootstrap
    { item: 'irons_spellbooks:copper_spell_book', count: 1 },
    { item: 'irons_spellbooks:common_ink',       count: 1 },
    { item: 'minecraft:ender_pearl',             count: 1 }
  ]
}

// Re-use the class detection helper from class_passives.js. That file already
// defines a `hasClass(player, className)` function and a `getClass(player)`
// cache accessor that re-populates every 30s via refreshClassCache. We need
// our own lookup because script load order is not guaranteed — so check the
// origin NBT directly.
function magicStarter_detectClass(player) {
  const magicClasses = ['archmage', 'battlemage', 'void_summoner']
  for (let c of magicClasses) {
    try {
      let r = player.server.runCommandSilent(
        `execute if entity ${player.username}[nbt={cardinal_components:{"origins:origin":{OriginLayers:[{Origin:"icraft:${c}"}]}}}]`
      )
      if (r > 0) return c
    } catch (e) {}
  }
  return null
}

function magicStarter_giveKit(player, className) {
  let kit = MAGIC_STARTER_KITS[className]
  if (!kit) return
  kit.forEach(function(entry) {
    player.give(Item.of(entry.item, entry.count))
  })
  // Pretty message matching codex_delivery styling (§6 = gold)
  let displayName = className.replace('_', ' ').replace(/\b\w/g, function(c) { return c.toUpperCase() })
  player.tell(`\u00a76[Starter Kit]\u00a7r A ${displayName}'s catalyst has been added to your inventory.`)
  player.tell('Find spells and glyphs in loot chests to grow your repertoire.')
}

global.tick_magicClassStarter = function(event) {
  event.server.players.forEach(function(player) {
    if (player.persistentData.getBoolean('icraft_magic_starter_given')) return

    let className = magicStarter_detectClass(player)
    if (!className) return

    magicStarter_giveKit(player, className)
    player.persistentData.putBoolean('icraft_magic_starter_given', true)
    console.log('[IridescentCraft] Gave magic starter kit to ' + player.username + ' (' + className + ')')
  })
}

// Register with the central tick dispatcher used by other origin scripts
// (see 0_tick_master.js for the pattern).
global.registerServerTick('tick_magicClassStarter', 100, 7)

console.log('[IridescentCraft] Magic class starter kit loaded')
console.log('  - Archmage: copper + novice spell books, 5 source gems, 2 ink')
console.log('  - Battlemage: copper spell book, 3 source gems, 1 ink')
console.log('  - Void Summoner: copper spell book, 1 ink, 1 ender pearl')
