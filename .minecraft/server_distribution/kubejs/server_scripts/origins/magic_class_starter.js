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
// sized to the class. One-time per class, gated by a persistent key.
//
// 2026-04-20: reworked after tester reported Archmage didn't get kit:
//   - Log every decision step so next failure is traceable
//   - Key flag on the class name (so respec to a different magic class
//     grants its kit too)
//   - Fire on PlayerEvents.loggedIn with a short delay (catches class
//     selections that complete mid-login)
//   - Admin chat command `!magicstart` resets the flag and retries

const MAGIC_STARTER_KITS = {
  archmage: [
    { item: 'irons_spellbooks:copper_spell_book', count: 1 },
    { item: 'ars_nouveau:novice_spell_book',     count: 1 },
    { item: 'ars_nouveau:source_gem',            count: 5 },
    { item: 'irons_spellbooks:common_ink',       count: 2 }
  ],
  battlemage: [
    { item: 'irons_spellbooks:copper_spell_book', count: 1 },
    { item: 'ars_nouveau:source_gem',            count: 3 },
    { item: 'irons_spellbooks:common_ink',       count: 1 }
  ],
  void_summoner: [
    { item: 'irons_spellbooks:copper_spell_book', count: 1 },
    { item: 'irons_spellbooks:common_ink',       count: 1 },
    { item: 'minecraft:ender_pearl',             count: 1 }
  ]
}

const MAGIC_CLASSES = ['archmage', 'battlemage', 'void_summoner']
const FLAG_PREFIX = 'icraft_magic_starter_'

function magicStarter_detectClass(player) {
  for (let i = 0; i < MAGIC_CLASSES.length; i++) {
    let c = MAGIC_CLASSES[i]
    try {
      let r = player.server.runCommandSilent(
        `execute if entity ${player.username}[nbt={cardinal_components:{"origins:origin":{OriginLayers:[{Origin:"icraft:${c}"}]}}}]`
      )
      if (r > 0) return c
    } catch (e) {
      console.warn('[magic-starter] NBT query failed for ' + player.username + '/' + c + ': ' + e)
    }
  }
  return null
}

function magicStarter_giveKit(player, className) {
  let kit = MAGIC_STARTER_KITS[className]
  if (!kit) {
    console.warn('[magic-starter] No kit defined for class "' + className + '"')
    return
  }
  kit.forEach(function(entry) {
    try {
      player.give(Item.of(entry.item, entry.count))
    } catch (e) {
      console.warn('[magic-starter] Give failed for ' + entry.item + ': ' + e)
    }
  })
  let displayName = className.replace('_', ' ').replace(/\b\w/g, function(c) { return c.toUpperCase() })
  player.tell('\u00a76[Starter Kit]\u00a7r A ' + displayName + "'s catalyst has been added to your inventory.")
  player.tell('Find spells and glyphs in loot chests to grow your repertoire.')
}

// Core check: if player has a magic class and hasn't been given ITS kit yet, give it.
// Returns true if a kit was given this call, false otherwise.
function magicStarter_checkPlayer(player) {
  let className = magicStarter_detectClass(player)
  if (!className) return false
  let flagKey = FLAG_PREFIX + className
  if (player.persistentData.getBoolean(flagKey)) return false
  magicStarter_giveKit(player, className)
  player.persistentData.putBoolean(flagKey, true)
  console.log('[magic-starter] Gave ' + className + ' starter kit to ' + player.username)
  return true
}

// ── Polling tick: every 5s across all online players ──
global.tick_magicClassStarter = function(event) {
  event.server.players.forEach(function(player) {
    try {
      magicStarter_checkPlayer(player)
    } catch (e) {
      console.warn('[magic-starter] Tick check failed for ' + player.username + ': ' + e)
    }
  })
}
global.registerServerTick('tick_magicClassStarter', 100, 7)

// ── Login hook: also check immediately after login ──
// Origin selection can complete during the login sequence, so a short
// delay gives the NBT a chance to settle. Use a one-shot scheduler via
// persistentData countdown to avoid another tick registration.
PlayerEvents.loggedIn(event => {
  let player = event.player
  player.persistentData.putInt('icraft_magic_starter_login_check', 60) // 3 seconds at 20tps
  console.log('[magic-starter] Login hook armed for ' + player.username)
})

global.tick_magicClassStarterLoginCheck = function(event) {
  event.server.players.forEach(function(player) {
    let countdown = player.persistentData.getInt('icraft_magic_starter_login_check')
    if (!countdown || countdown <= 0) return
    countdown -= 20
    if (countdown <= 0) {
      player.persistentData.putInt('icraft_magic_starter_login_check', 0)
      try {
        let fired = magicStarter_checkPlayer(player)
        if (!fired) {
          let cls = magicStarter_detectClass(player)
          console.log('[magic-starter] Login check for ' + player.username + ': detected=' + (cls || 'none'))
        }
      } catch (e) {
        console.warn('[magic-starter] Login check failed for ' + player.username + ': ' + e)
      }
    } else {
      player.persistentData.putInt('icraft_magic_starter_login_check', countdown)
    }
  })
}
global.registerServerTick('tick_magicClassStarterLoginCheck', 20, 3)

// ── Admin chat command: !magicstart clears the flag and re-runs detection ──
// Lets the tester (or a team member) force the kit to fire on themselves
// if the auto-detection missed for any reason.
PlayerEvents.chat(event => {
  if (event.message !== '!magicstart') return
  event.cancel()
  let player = event.player
  // Clear any prior flag so the check can re-grant
  MAGIC_CLASSES.forEach(function(c) {
    player.persistentData.putBoolean(FLAG_PREFIX + c, false)
  })
  let cls = magicStarter_detectClass(player)
  if (!cls) {
    player.tell('\u00a7c[Starter Kit]\u00a7r No magic class detected on your character.')
    console.log('[magic-starter] !magicstart from ' + player.username + ': no magic class detected')
    return
  }
  magicStarter_giveKit(player, cls)
  player.persistentData.putBoolean(FLAG_PREFIX + cls, true)
  console.log('[magic-starter] !magicstart from ' + player.username + ': granted ' + cls + ' kit')
})

console.log('[IridescentCraft] Magic class starter kit loaded')
console.log('  - Archmage: copper + novice spell books, 5 source gems, 2 ink')
console.log('  - Battlemage: copper spell book, 3 source gems, 1 ink')
console.log('  - Void Summoner: copper spell book, 1 ink, 1 ender pearl')
console.log('  - Chat `!magicstart` resets the per-class flag and retries')
