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
  // 2026-04-21: audited the Origins-Forge jar — OriginContainer.serializeNBT()
  // writes `Origins` as a CompoundTag of `{layer_id: origin_id_string}`,
  // NOT a ListTag of `{origin, layer}` objects. Every earlier probe using
  // `Origins:[{origin:"icraft:X"}]` returned 0 because a list-style NBT
  // match can't succeed against a compound-shaped value. Correct probe:
  //   {Origins:{"origins:class":"icraft:archmage"}}
  // Class layer resource id is `origins:class` (file lives at
  // data/origins/origin_layers/class.json in iridescent_origins-mod).
  for (let i = 0; i < MAGIC_CLASSES.length; i++) {
    let c = MAGIC_CLASSES[i]
    try {
      let r = player.server.runCommandSilent(
        `execute if entity ${player.username}[nbt={ForgeCaps:{"origins:origins":{Origins:{"origins:class":"icraft:${c}"}}}}]`
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
  // 2026-04-21: tester reported `!origindump` typed in chat produced no
  // diagnostic output (chat message showed up in log but the KubeJS handler
  // either didn't fire or swallowed the flag set). Arm a delayed auto-
  // origindump on login so we always get diagnostic data without relying
  // on the chat path. Countdown is 400 ticks (~20s) — long enough for the
  // Origins picker UI to close, short enough to hit the log before the
  // tester walks away.
  player.persistentData.putInt('icraft_auto_origindump_ticks', 400)
  console.log('[codex] loggedIn fired for ' + player.username + ', sweep + starter-poll armed (3min), auto-origindump armed (~20s)')
})

// Auto-origindump: counts down from 400 on each login and sets the
// `icraft_origindump_pending` flag when it hits 0. The existing
// `tick_codexOriginDump` picks up that flag and writes the diagnostic.
// Runs every 20 ticks = 1s, so ~20 ticks of this handler = 20s wallclock.
global.tick_codexAutoOrigindump = function(event) {
  event.server.players.forEach(function(player) {
    let left = player.persistentData.getInt('icraft_auto_origindump_ticks')
    if (!left || left <= 0) return
    left -= 20
    if (left <= 0) {
      player.persistentData.putInt('icraft_auto_origindump_ticks', 0)
      player.persistentData.putBoolean('icraft_origindump_pending', true)
      console.log('[codex/origindump] auto-armed for ' + player.username + ' — dump will run next origindump tick')
    } else {
      player.persistentData.putInt('icraft_auto_origindump_ticks', left)
    }
  })
}
global.registerServerTick('tick_codexAutoOrigindump', 20, 17)

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

      // Route 0: log raw ForgeCaps subtree from player.nbt directly.
      // This is the most reliable diagnostic because it doesn't depend on
      // the tellraw/command pipeline — we're just reading the entity NBT
      // via the KubeJS API. If this is empty or absent, the fork stores
      // origin data somewhere entirely different.
      try {
        let full = player.nbt
        let fc = full ? full.ForgeCaps : null
        console.log('[codex/origindump] ' + player.username + ' ForgeCaps = ' + (fc ? String(fc) : '<null>'))
        // Also dump the raw origins:origins subtree if present
        let oo = fc ? fc.get('origins:origins') : null
        console.log('[codex/origindump] ' + player.username + ' ForgeCaps[origins:origins] = ' + (oo ? String(oo) : '<null>'))
      } catch (e) {
        console.warn('[codex/origindump] raw NBT read failed for ' + player.username + ': ' + e)
      }

      // Route 1: chat dump of full NBT via tellraw
      player.server.runCommandSilent(
        'tellraw ' + player.username + ' ["",{"text":"[OriginDump] ","color":"gold"},{"nbt":"ForgeCaps.\\"origins:origins\\".Origins","entity":"' + player.username + '"}]'
      )

      // Route 2: probe every known origin/race/class id, log matches.
      // 2026-04-21: rewritten after jar audit — NBT stores Origins as a
      // CompoundTag of `{layer_id: origin_id_string}`, not a ListTag of
      // `{origin}` objects. We try all three layers per ID since the probe
      // list mixes origins, races, and classes.
      // 2026-04-21 bugfix: was `const LAYER_IDS` inside the try; Rhino
      // re-enters the block each tick and throws "redeclaration of var
      // LAYER_IDS". Switched to `var`, which re-assigns cleanly.
      var LAYER_IDS = ['origins:class', 'origins:race', 'origins:origin']
      let matched = []
      function probe(fullId) {
        for (let li = 0; li < LAYER_IDS.length; li++) {
          try {
            let r = player.server.runCommandSilent(
              'execute if entity ' + player.username +
              '[nbt={ForgeCaps:{"origins:origins":{Origins:{"' + LAYER_IDS[li] + '":"' + fullId + '"}}}}]'
            )
            if (r > 0) {
              matched.push(fullId + ' (' + LAYER_IDS[li] + ')')
              return
            }
          } catch (e) {}
        }
      }
      ORIGIN_PROBE_ICRAFT.forEach(function(o) { probe('icraft:' + o) })
      ORIGIN_PROBE_VANILLA.forEach(function(o) { probe('origins:' + o) })

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
// 2026-04-20 (third rewrite): every action now defers to a server-tick
// handler via persistentData flags. The chat handler itself does the ABSOLUTE
// MINIMUM: set a flag, return. Previous versions called runCommandSilent,
// player.give, and persistentData all directly from the chat handler — which
// fires on a worker thread (Worker-Main-X) where certain KubeJS/Rhino calls
// throw `JavaException: EventExit: result`. Now the handler never touches
// the server/player/command APIs; tick_codexChatProcessor picks up the flag
// next tick (on Server thread) and does the real work.
PlayerEvents.chat(event => {
  try {
    const msg = (event.message || '').trim().toLowerCase()
    // 2026-04-21 diag: tester typed `!origindump` and got nothing in the log,
    // nor was the message canceled (it broadcast to chat). Log every IC-command
    // candidate at entry so we can confirm the handler fires at all.
    if (msg.startsWith('!')) console.log('[codex/chat] received candidate: ' + msg)
    if (!msg.startsWith('!')) return
    const player = event.player

    if (msg === '!codex') {
      player.persistentData.putBoolean('icraft_chat_pending_codex', true)
      event.cancel()
    } else if (msg === '!kit' || msg === '!magicstart') {
      player.persistentData.putBoolean('icraft_chat_pending_kit', true)
      event.cancel()
    } else if (msg === '!origindump') {
      player.persistentData.putBoolean('icraft_origindump_pending', true)
      event.cancel()
    } else {
      return // not our command, let chat proceed normally
    }
    // Minimal feedback — player.tell is generally safe across threads but
    // we wrap the whole handler in try/catch so any thread-visibility oddity
    // doesn't prevent the flag from having been set first.
    try { player.tell('\u00a77[IC] command queued') } catch (e) {}
  } catch (e) {
    // Intentionally swallow — we don't want chat-thread exceptions to
    // cause visible errors. The tick handler will log its own progress.
  }
})

// ── Server-thread processor for all queued chat commands ──
// Runs every tick (low overhead — all it does is read 3 booleans per
// player). When a flag is set, it performs the real command work and
// clears the flag. Everything here runs on Server thread, so calls to
// runCommandSilent / player.give / persistentData all work normally.
global.tick_codexChatProcessor = function(event) {
  event.server.players.forEach(function(player) {

    // --- !codex ---
    if (player.persistentData.getBoolean('icraft_chat_pending_codex')) {
      player.persistentData.putBoolean('icraft_chat_pending_codex', false)
      try {
        console.log('[codex/chat] processing !codex for ' + player.username)
        player.persistentData.putBoolean(CODEX_FLAG, false)
        let ok = codex_giveBook(player)
        if (ok) {
          player.persistentData.putBoolean(CODEX_FLAG, true)
        }
        player.persistentData.putInt('icraft_starter_poll_ticks', 3600)
        console.log('[codex] !codex from ' + player.username + ': ' + (ok ? 'granted' : 'grant failed'))
      } catch (e) {
        console.warn('[codex/chat] !codex processing threw: ' + e)
      }
    }

    // --- !kit / !magicstart ---
    if (player.persistentData.getBoolean('icraft_chat_pending_kit')) {
      player.persistentData.putBoolean('icraft_chat_pending_kit', false)
      try {
        console.log('[codex/chat] processing !kit for ' + player.username)
        MAGIC_CLASSES.forEach(function(c) {
          player.persistentData.putBoolean(MAGIC_FLAG_PREFIX + c, false)
        })
        // Also probe non-magic classes so the !kit response can tell the
        // player *what* class we detected, even when they don't qualify
        // for a kit. Otherwise "No magic class detected" is ambiguous —
        // could be "you're not a magic class" or "the probe is broken."
        var NON_MAGIC_CLASSES = ['berserker','samurai','wanderer','paladin','vanguard','ranger','artificer']
        var detectedAnyClass = null
        try {
          for (var i = 0; i < NON_MAGIC_CLASSES.length; i++) {
            var c2 = NON_MAGIC_CLASSES[i]
            var r2 = player.server.runCommandSilent(
              'execute if entity ' + player.username +
              '[nbt={ForgeCaps:{"origins:origins":{Origins:{"origins:class":"icraft:' + c2 + '"}}}}]'
            )
            if (r2 > 0) { detectedAnyClass = c2; break }
          }
        } catch (e) {}
        let cls = codex_detectMagicClass(player)
        if (!cls) {
          if (detectedAnyClass) {
            player.tell('\u00a7e[Starter Kit]\u00a7r Detected class: \u00a7b' + detectedAnyClass + '\u00a7r (not a magic class — no catalyst starter kit for this class).')
            console.log('[codex/starter] !kit from ' + player.username + ': non-magic class detected=' + detectedAnyClass)
          } else {
            player.tell('\u00a7c[Starter Kit]\u00a7r No class detected. Use !origindump to see what Origins captured for your layers.')
            console.log('[codex/starter] !kit from ' + player.username + ': no class on origins:class layer')
          }
        } else {
          codex_giveStarterKit(player, cls)
          player.persistentData.putBoolean(MAGIC_FLAG_PREFIX + cls, true)
          console.log('[codex/starter] !kit from ' + player.username + ': granted ' + cls + ' kit')
        }
      } catch (e) {
        console.warn('[codex/chat] !kit processing threw: ' + e)
      }
    }

    // --- !origindump (also handled by existing tick_codexOriginDump) ---
    // intentionally left to the dedicated origindump tick below.
  })
}
global.registerServerTick('tick_codexChatProcessor', 20, 13)

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
