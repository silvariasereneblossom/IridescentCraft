// =============================================================================
// IRIDESCENT CODEX — First-Join Delivery & Book Suppression
// =============================================================================

const CODEX_NBT = '{"patchouli:book":"icraft:iridescent_codex"}'
const CODEX_FLAG = 'icraft_codex_given'

// Magic class starter kit — piggybacks on codex delivery so it fires from
// the same proven-reliable PlayerEvents.loggedIn hook. The standalone
// magic_class_starter.js still provides `!magicstart` as a manual backup.
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
const MAGIC_FLAG_PREFIX = 'icraft_magic_starter_'

function codex_detectMagicClass(player) {
  for (let i = 0; i < MAGIC_CLASSES.length; i++) {
    let c = MAGIC_CLASSES[i]
    try {
      let r = player.server.runCommandSilent(
        `execute if entity ${player.username}[nbt={cardinal_components:{"origins:origin":{OriginLayers:[{Origin:"icraft:${c}"}]}}}]`
      )
      if (r > 0) return c
    } catch (e) {
      console.warn('[codex/starter] NBT query failed for ' + player.username + '/' + c + ': ' + e)
    }
  }
  return null
}

function codex_giveStarterKit(player, className) {
  let kit = MAGIC_STARTER_KITS[className]
  if (!kit) return false
  kit.forEach(function(entry) {
    try {
      player.give(Item.of(entry.item, entry.count))
    } catch (e) {
      console.warn('[codex/starter] Give failed for ' + entry.item + ': ' + e)
    }
  })
  let displayName = className.replace('_', ' ').replace(/\b\w/g, function(c) { return c.toUpperCase() })
  player.tell('\u00a76[Starter Kit]\u00a7r A ' + displayName + "'s catalyst has been added to your inventory.")
  player.tell('Find spells and glyphs in loot chests to grow your repertoire.')
  return true
}

function codex_tryGrantStarter(player) {
  let className = codex_detectMagicClass(player)
  if (!className) return false
  let flagKey = MAGIC_FLAG_PREFIX + className
  if (player.persistentData.getBoolean(flagKey)) return false
  if (codex_giveStarterKit(player, className)) {
    player.persistentData.putBoolean(flagKey, true)
    console.log('[codex/starter] Gave ' + className + ' kit to ' + player.username)
    return true
  }
  return false
}

function codex_giveBook(player) {
  try {
    player.give(Item.of('patchouli:guide_book', CODEX_NBT))
    player.tell('\u00a76[The Iridescent Codex]\u00a7r has been added to your inventory.')
    player.tell('Right-click to open. It covers every system, class, and mod in this pack.')
    return true
  } catch (e) {
    console.warn('[codex] Give failed for ' + player.username + ': ' + e)
    return false
  }
}

// Scan inventory for an existing codex (matches the NBT). Used to re-grant
// if the flag is set but the book was lost (creative purge, /clear, death
// in keepInventory=false, etc.).
function codex_playerHasCodex(player) {
  try {
    let r = player.server.runCommandSilent(
      `clear ${player.username} patchouli:guide_book{"patchouli:book":"icraft:iridescent_codex"} 0`
    )
    // `/clear ... <count=0>` returns the matching-item count without clearing.
    return r > 0
  } catch (e) {
    console.warn('[codex] inventory check failed for ' + player.username + ': ' + e)
    return false
  }
}

// ── First-Join Delivery ───────────────────────────────────────────────────────

PlayerEvents.loggedIn(event => {
  const player = event.player
  let flagSet = player.persistentData.getBoolean(CODEX_FLAG)
  let hasBook = flagSet ? codex_playerHasCodex(player) : false

  if (!flagSet) {
    // Never given — give now.
    if (codex_giveBook(player)) {
      player.persistentData.putBoolean(CODEX_FLAG, true)
      console.log('[codex] First-join delivery to ' + player.username)
    }
  } else if (!hasBook) {
    // Flag set but book missing — re-grant silently (lost to /clear, death, etc.)
    if (codex_giveBook(player)) {
      console.log('[codex] Re-delivered to ' + player.username + ' (flag was set but book missing)')
    }
  } else {
    console.log('[codex] ' + player.username + ' already has the book, skipping delivery')
  }

  player.persistentData.putInt('icraft_book_sweep_ticks', 1200)
  // Arm a 3-minute polling window for the magic-starter check. Origin NBT
  // isn't reliably populated during loggedIn (origin-picker UI may still be
  // open), so we poll every ~5s for 3 minutes until a class is detected
  // and the kit is granted. Stops immediately on success.
  player.persistentData.putInt('icraft_starter_poll_ticks', 3600)
  console.log('[codex] loggedIn fired for ' + player.username + ', sweep + starter-poll armed (3min)')
})

// ── Polled starter-kit check ──
// 2026-04-20: reworked from a one-shot 3s countdown to a proper poll.
// Tester logs showed the one-shot firing at T+18s with detected=none, which
// means the origin-picker UI was still open or had just closed without the
// NBT settling. With a 3-minute polling window we catch the class as soon
// as the player confirms their Class layer selection, no matter how long
// they took reading through the prompts.
//
// Storage: `icraft_starter_poll_ticks` counts down from 3600 (3 minutes)
// and decrements by 100 ticks per call. We re-arm it on every login.
// Stops as soon as a kit is granted (per-class flag flips to true).
global.tick_codexStarterCheck = function(event) {
  event.server.players.forEach(function(player) {
    let left = player.persistentData.getInt('icraft_starter_poll_ticks')
    if (!left || left <= 0) return
    left -= 100
    player.persistentData.putInt('icraft_starter_poll_ticks', Math.max(0, left))
    try {
      let granted = codex_tryGrantStarter(player)
      if (granted) {
        // Stop polling after success
        player.persistentData.putInt('icraft_starter_poll_ticks', 0)
      }
      // Log occasional trace — once every 30s so the log isn't spammed
      if (left % 600 === 0) {
        let cls = codex_detectMagicClass(player)
        console.log('[codex/starter] poll for ' + player.username +
                    ': detected=' + (cls || 'none') +
                    ' ticks_left=' + left)
      }
    } catch (e) {
      console.warn('[codex/starter] poll failed for ' + player.username + ': ' + e)
    }
  })
}
global.registerServerTick('tick_codexStarterCheck', 100, 5)

// ── Deferred origindump processor (runs on Server thread) ──
// KubeJS PlayerEvents.chat fires on a worker thread; runCommandSilent from
// a worker thread inside a chat handler throws `EventExit: result`.
// Instead, the chat handler sets `icraft_origindump_pending = true` and
// this tick (on Server thread) performs the actual dump.
const ORIGIN_PROBE_ICRAFT = [
  'witch_of_ink','artificial_construct','witherborn','slimebodied',
  'demigod','ryu','fallen_angel','kirin','elf','dwarf','orc','halfling',
  'faefolk','revenant',
  'berserker','samurai','battlemage','wanderer','paladin','vanguard',
  'ranger','archmage','artificer','void_summoner'
]
const ORIGIN_PROBE_VANILLA = ['arachnid','blazeborn','enderian','merling','phantom',
                              'shulk','elytrian','feline','avian','human']

global.tick_codexOriginDump = function(event) {
  event.server.players.forEach(function(player) {
    if (!player.persistentData.getBoolean('icraft_origindump_pending')) return
    player.persistentData.putBoolean('icraft_origindump_pending', false)
    try {
      console.log('[codex/origindump] processing for ' + player.username)

      // Route 1: chat dump of full NBT via tellraw
      player.server.runCommandSilent(
        'tellraw ' + player.username + ' ["",{"text":"[OriginDump] ","color":"gold"},{"nbt":"cardinal_components.\\"origins:origin\\"","entity":"' + player.username + '"}]'
      )

      // Route 2: probe every known origin/race/class id, log matches
      let matched = []
      ORIGIN_PROBE_ICRAFT.forEach(function(o) {
        try {
          let r = player.server.runCommandSilent(
            'execute if entity ' + player.username + '[nbt={cardinal_components:{"origins:origin":{OriginLayers:[{Origin:"icraft:' + o + '"}]}}}]'
          )
          if (r > 0) matched.push('icraft:' + o)
        } catch (e) {}
      })
      ORIGIN_PROBE_VANILLA.forEach(function(o) {
        try {
          let r = player.server.runCommandSilent(
            'execute if entity ' + player.username + '[nbt={cardinal_components:{"origins:origin":{OriginLayers:[{Origin:"origins:' + o + '"}]}}}]'
          )
          if (r > 0) matched.push('origins:' + o)
        } catch (e) {}
      })

      let result = matched.length ? matched.join(', ') : '<none matched known origins>'
      console.log('[codex/origindump] ' + player.username + ' matched = ' + result)
      player.tell('\u00a76[Debug]\u00a7r Matched: \u00a7e' + result + '\u00a7r')
    } catch (e) {
      console.warn('[codex/origindump] dump failed for ' + player.username + ': ' + e)
    }
  })
}
global.registerServerTick('tick_codexOriginDump', 20, 11)

// ── Admin/tester chat commands ──
//   !codex       — force-deliver codex + re-arm starter check
//   !kit         — alias for !magicstart (grant magic starter kit now)
//   !origindump  — dump player's origin NBT to log + chat (debug)
//
// 2026-04-20: matches ascension.js pattern (trim + toLowerCase) after
// tester reported !codex didn't work. Previous strict `!==` comparison
// failed on trailing spaces or casing. Also logs every '!'-prefixed
// message unconditionally so we can see the chat handler is firing at
// all (trace "[codex/chat] heard: X from Y" lines).
PlayerEvents.chat(event => {
  const msg = (event.message || '').trim()
  if (!msg.startsWith('!')) return
  const lower = msg.toLowerCase()
  const player = event.player
  console.log('[codex/chat] heard: ' + msg + ' from ' + player.username)

  // 2026-04-20: wrap each branch in try/catch. Tester log showed
  // '[codex/chat] heard: !codex from silvieserene' with NO subsequent
  // '[codex] !codex ... granted' log — meaning something between the
  // heard-log and grant-log was silently throwing. Granular logging now
  // catches the failure point.

  if (lower === '!codex') {
    try {
      event.cancel()
      console.log('[codex/chat] !codex: event.cancel() OK, clearing flag...')
      player.persistentData.putBoolean(CODEX_FLAG, false)
      console.log('[codex/chat] !codex: flag cleared, calling codex_giveBook...')
      let ok = codex_giveBook(player)
      console.log('[codex/chat] !codex: codex_giveBook returned ' + ok)
      if (ok) {
        player.persistentData.putBoolean(CODEX_FLAG, true)
      }
      player.persistentData.putInt('icraft_starter_poll_ticks', 3600)
      console.log('[codex] !codex from ' + player.username + ': ' + (ok ? 'granted' : 'grant failed'))
    } catch (e) {
      console.warn('[codex/chat] !codex threw: ' + e + ' (stack: ' + (e.stack || 'n/a') + ')')
    }
    return
  }

  if (lower === '!kit' || lower === '!magicstart') {
    try {
      event.cancel()
      MAGIC_CLASSES.forEach(function(c) {
        player.persistentData.putBoolean(MAGIC_FLAG_PREFIX + c, false)
      })
      let cls = codex_detectMagicClass(player)
      if (!cls) {
        player.tell('\u00a7c[Starter Kit]\u00a7r No magic class detected on your character. Use !origindump to see your origin layers.')
        console.log('[codex/starter] ' + msg + ' from ' + player.username + ': no magic class detected')
        return
      }
      codex_giveStarterKit(player, cls)
      player.persistentData.putBoolean(MAGIC_FLAG_PREFIX + cls, true)
      console.log('[codex/starter] ' + msg + ' from ' + player.username + ': granted ' + cls + ' kit')
    } catch (e) {
      console.warn('[codex/chat] !kit threw: ' + e + ' (stack: ' + (e.stack || 'n/a') + ')')
    }
    return
  }

  if (lower === '!origindump') {
    try {
      event.cancel()
      // 2026-04-20: The chat handler fires on a worker thread
      // (Worker-Main-X), not Server thread. runCommandSilent from a worker
      // thread in a chat handler throws `EventExit: result`. Defer the
      // work to the next server tick where we run on the main thread.
      //
      // Set a per-player flag; the tick handler below consumes it.
      player.persistentData.putBoolean('icraft_origindump_pending', true)
      player.tell('\u00a76[Debug]\u00a7r Origin dump queued — output in ~1 second.')
      console.log('[codex/chat] origindump queued for ' + player.username)
    } catch (e) {
      console.warn('[codex/chat] origindump threw: ' + e)
    }
    return
  }
})

// ── Backup Recovery Recipe ────────────────────────────────────────────────────

ServerEvents.recipes(event => {
  event.shapeless(
    Item.of('patchouli:guide_book', CODEX_NBT),
    ['minecraft:book', 'minecraft:lapis_lazuli']
  ).id('icraft:codex_recovery_recipe')
})

// ── Book Suppression ────────────────────────────────────────────────────────
// Uses /clear commands exclusively since inventory slot manipulation is broken.
// Patchouli books from other mods share the patchouli:guide_book item ID
// but have different NBT. We clear each known mod book by NBT.

// Known patchouli book NBT values to suppress
const PATCHOULI_BOOKS_TO_CLEAR = [
  'terramity:terramity_guidebook',
  'simplyswords:runic_grimoire',
  'ars_nouveau:worn_notebook',
  'irons_spellbooks:irons_spellbooks',
  'thermal:guidebook',
  'create:book',
  'footwork:combat_manual',
  'theabyss:the_abyss'
]

// Non-patchouli book item IDs to suppress
const OTHER_BOOKS_TO_CLEAR = [
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
  'theabyss:the_abyss_guidebook',
  'botania:lexicon'
]

// Run all clear commands for a player
function clearModBooks(player, doLog) {
  let name = player.username
  let cleared = 0

  // Clear known patchouli guide books by NBT
  PATCHOULI_BOOKS_TO_CLEAR.forEach(bookId => {
    let cmd = 'clear ' + name + ' patchouli:guide_book{"patchouli:book":"' + bookId + '"} 64'
    let result = player.server.runCommandSilent(cmd)
    if (result > 0) {
      console.log('[IridescentCraft] Cleared patchouli book: ' + bookId + ' (' + result + ' items)')
      cleared += result
    }
  })

  // Clear non-patchouli mod books by item ID
  OTHER_BOOKS_TO_CLEAR.forEach(bookId => {
    let result = player.server.runCommandSilent('clear ' + name + ' ' + bookId + ' 64')
    if (result > 0) {
      console.log('[IridescentCraft] Cleared mod book: ' + bookId + ' (' + result + ' items)')
      cleared += result
    }
  })

  if (doLog && cleared === 0) {
    console.log('[IridescentCraft] Sweep ran for ' + name + ' — no books found')
  }
}

// Sweep: aggressive for first 10s after login (every 1s), then every 10s for 2 min
global.tick_codexBookSweep = (event) => {
  let tick = event.server.tickCount

  event.server.players.forEach(player => {
    let sweepTicks = player.persistentData.getInt('icraft_book_sweep_ticks')
    if (sweepTicks <= 0) return

    // First 10 seconds (200 ticks): clear every second
    // After that: clear every 10 seconds
    let aggressive = sweepTicks > 1000 // 1200 - 200 = first 10s
    let interval = aggressive ? 20 : 200

    if (tick % interval !== 0) return

    player.persistentData.putInt('icraft_book_sweep_ticks', sweepTicks - interval)
    clearModBooks(player, aggressive)
  })
}
global.registerServerTick('tick_codexBookSweep', 20, 0)
