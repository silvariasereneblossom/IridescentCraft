// =============================================================================
// IRIDESCENT CODEX — First-Join Delivery & Book Suppression
// =============================================================================

const CODEX_NBT = '{"patchouli:book":"icraft:iridescent_codex"}'
const CODEX_FLAG = 'icraft_codex_given'

// Magic class starter kit — piggybacks on codex delivery so it fires from
// the same proven-reliable PlayerEvents.loggedIn hook. The standalone
// magic_class_starter.js still provides `!magicstart` as a manual backup.
//
// Entries are plain `{item, count}` OR `{scroll: spellId, level}` for
// pre-NBT'd Iron's Spellbooks scrolls. Scrolls are built via the
// ISpellContainer.createScrollContainer bridge so they drop usable (with
// a known spell baked in) rather than empty — that's the one case where
// plain Item.of() produces an inert NBT-less stack.
const SpellRegistry_codex = Java.loadClass('io.redspace.ironsspellbooks.api.registry.SpellRegistry')
const ISpellContainer_codex = Java.loadClass('io.redspace.ironsspellbooks.api.spells.ISpellContainer')

function codex_makeScroll(spellId, level) {
  try {
    var spell = SpellRegistry_codex.getSpell(spellId)
    if (!spell) {
      console.warn('[codex/starter] makeScroll: unknown spell ' + spellId + ' — falling back to plain scroll')
      return Item.of('irons_spellbooks:scroll').getInternal()
    }
    var stack = Item.of('irons_spellbooks:scroll').getInternal()
    ISpellContainer_codex.createScrollContainer(spell, level, stack)
    return stack
  } catch (e) {
    console.warn('[codex/starter] makeScroll failed for ' + spellId + ': ' + e)
    return Item.of('irons_spellbooks:scroll').getInternal()
  }
}

const MAGIC_STARTER_KITS = {
  archmage: [
    // 2026-04-26 Phase 5: caster classes start with MODULAR variants so
    // they can immediately install cover/pages materials + the custom
    // magic enchants (mana_capacity / mana_flow / arcane_edge / arcane_devastation).
    { item: 'iridescent_modular_spells:modular_copper_spell_book', count: 1 },
    { scroll: 'irons_spellbooks:magic_missile',   level: 1 },
    { scroll: 'irons_spellbooks:firebolt',        level: 1 },
    { item: 'iridescent_modular_spells:modular_novice_spell_book', count: 1 },
    { item: 'ars_nouveau:source_gem',            count: 5 },
    { item: 'irons_spellbooks:common_ink',       count: 2 }
  ],
  battlemage: [
    { item: 'iridescent_modular_spells:modular_copper_spell_book', count: 1 },
    { scroll: 'irons_spellbooks:magic_arrow',     level: 1 },
    { scroll: 'irons_spellbooks:fang_strike',     level: 1 },
    { item: 'ars_nouveau:source_gem',            count: 3 },
    { item: 'irons_spellbooks:common_ink',       count: 1 }
  ],
  void_summoner: [
    { item: 'iridescent_modular_spells:modular_copper_spell_book', count: 1 },
    { scroll: 'irons_spellbooks:magic_missile',   level: 1 },
    { scroll: 'irons_spellbooks:summon_vex',      level: 1 },
    { item: 'irons_spellbooks:common_ink',       count: 1 },
    { item: 'minecraft:ender_pearl',             count: 1 }
  ]
}
const MAGIC_CLASSES = ['archmage', 'battlemage', 'void_summoner']
const MAGIC_FLAG_PREFIX = 'icraft_magic_starter_'

function codex_detectMagicClass(player) {
  // 2026-04-22: switched from `execute if entity [nbt=...]` probe to
  // direct NBT read via player.nbt. Tester's previous run showed the
  // origindump Route 2 (same compound-shape probe) returning "<none
  // matched known origins>" even though Route 0 (direct player.nbt
  // read) successfully showed Origins populated with icraft:archmage
  // on the origins:class layer. Something in the execute-if NBT-matcher
  // is not recursing into the nested compound correctly in this Forge
  // build. Route 0's direct path is proven-working — use it for
  // detection too.
  //
  // Path: player.nbt.ForgeCaps."origins:origins".Origins."origins:class"
  // Returns the short class name (without "icraft:" prefix) if it matches
  // one of the magic classes; null otherwise.
  try {
    var nbt = player.nbt
    if (!nbt) return null
    var fc = nbt.ForgeCaps
    if (!fc) return null
    var oo = fc.get ? fc.get('origins:origins') : null
    if (!oo) return null
    var origins = oo.get ? oo.get('Origins') : null
    if (!origins || !origins.getString) return null
    var classId = String(origins.getString('origins:class') || '')
    if (!classId) return null
    // classId is a full resource id like "icraft:archmage". Strip the
    // prefix and see if the bare name is in MAGIC_CLASSES.
    var bare = classId
    var colon = classId.indexOf(':')
    if (colon >= 0) bare = classId.substring(colon + 1)
    for (var i = 0; i < MAGIC_CLASSES.length; i++) {
      if (MAGIC_CLASSES[i] === bare) return bare
    }
    return null
  } catch (e) {
    console.warn('[codex/starter] detectMagicClass threw for ' + player.username + ': ' + e)
    return null
  }
}

function codex_giveStarterKit(player, className) {
  console.log('[codex/starter] giveStarterKit ENTER: player=' + player.username + ' class=' + className)
  let kit = MAGIC_STARTER_KITS[className]
  if (!kit) {
    console.warn('[codex/starter] giveStarterKit: no kit config for class "' + className + '" — bailing')
    return false
  }
  console.log('[codex/starter] giveStarterKit: kit has ' + kit.length + ' entries')
  let giveAttempts = 0
  let giveSuccesses = 0
  kit.forEach(function(entry) {
    giveAttempts++
    try {
      // Build the stack explicitly so we can log its state before the give.
      // In KubeJS 6, Item.of(id, count) returns an ItemStack. Some mods
      // (notably curios) intercept player.give and may move the stack into
      // a non-inventory slot without logging. Capture before + after counts
      // so we can tell the difference between "give threw" and "give ate the
      // stack silently."
      var stack, label
      if (entry.scroll) {
        // NBT'd Iron's Spellbooks scroll — bridged through ISpellContainer.
        stack = codex_makeScroll(entry.scroll, entry.level || 1)
        label = 'scroll[' + entry.scroll + ' L' + (entry.level || 1) + ']'
      } else {
        stack = Item.of(entry.item, entry.count)
        label = entry.item + ' x' + entry.count
      }
      // 2026-04-26 fix: stack.isEmpty is a METHOD on ItemStack, not a
      // property -- '!stack.isEmpty' was always truthy (method ref),
      // so the log always falsely reported 'EMPTY/null' regardless of
      // actual state. Call it as a method.
      var stackOk = false
      try { stackOk = stack && !stack.isEmpty() } catch (_) {}
      console.log('[codex/starter] give: attempting ' + label +
                  ' (stack resolved: ' + (stackOk ? 'ok' : 'EMPTY/null') + ')')
      player.give(stack)
      giveSuccesses++
      console.log('[codex/starter] give: ' + label + ' — player.give returned without throw')
    } catch (e) {
      console.warn('[codex/starter] give FAILED for ' + (entry.scroll || entry.item) + ': ' + e)
    }
  })
  console.log('[codex/starter] giveStarterKit: ' + giveSuccesses + '/' + giveAttempts + ' items delivered without throw')
  try {
    let displayName = className.replace('_', ' ').replace(/\b\w/g, function(c) { return c.toUpperCase() })
    player.tell('\u00a76[Starter Kit]\u00a7r A ' + displayName + "'s catalyst has been added to your inventory.")
    player.tell('Find spells and glyphs in loot chests to grow your repertoire.')
    console.log('[codex/starter] giveStarterKit: tell messages sent')
  } catch (e) {
    console.warn('[codex/starter] giveStarterKit: tell threw: ' + e)
  }
  return true
}

function codex_tryGrantStarter(player) {
  let className = codex_detectMagicClass(player)
  if (!className) return false
  console.log('[codex/starter] tryGrantStarter: detected=' + className + ' for ' + player.username)
  let flagKey = MAGIC_FLAG_PREFIX + className
  let flagValue = player.persistentData.getBoolean(flagKey)
  if (flagValue) {
    console.log('[codex/starter] tryGrantStarter: flag ' + flagKey + ' already true for ' + player.username + ' — skipping grant')
    return false
  }
  console.log('[codex/starter] tryGrantStarter: flag ' + flagKey + ' is false, calling giveStarterKit')
  if (codex_giveStarterKit(player, className)) {
    player.persistentData.putBoolean(flagKey, true)
    console.log('[codex/starter] tryGrantStarter: flag set true, grant complete for ' + player.username)
    return true
  }
  console.warn('[codex/starter] tryGrantStarter: giveStarterKit returned false for ' + player.username)
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
      // Log occasional trace — once every 30s so the log isn't spammed.
      // 2026-04-21: also dump the raw Origins compound so we can see if/when
      // the capability populates. Tester reported picking a class but the
      // NBT stayed empty — need per-poll visibility to diagnose whether the
      // persistence is actually landing server-side.
      if (left % 600 === 0) {
        let cls = codex_detectMagicClass(player)
        var originsStr = '<unavailable>'
        try {
          var full = player.nbt
          var fc = full ? full.ForgeCaps : null
          var oo = fc ? fc.get('origins:origins') : null
          if (oo) {
            var origins = oo.get ? oo.get('Origins') : null
            originsStr = origins ? String(origins) : '<Origins key missing>'
          }
        } catch (e) { originsStr = '<read threw: ' + e + '>' }
        console.log('[codex/starter] poll for ' + player.username +
                    ': detected=' + (cls || 'none') +
                    ' ticks_left=' + left +
                    ' Origins=' + originsStr)
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
      var matched = []
      // 2026-04-21: was `function probe(fullId) {...}` as a block-scoped
      // declaration inside this try. Rhino's strict mode treats inner
      // function declarations in blocks as uninitialized until the statement
      // executes, and the forEach callback closure captures `probe` but
      // finds it undefined when invoked. Switched to `var probe = function`
      // form — the `var` hoists and the assignment lands before the forEach.
      var probe = function(fullId) {
        for (var li = 0; li < LAYER_IDS.length; li++) {
          try {
            var r = player.server.runCommandSilent(
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

      var result = matched.length ? matched.join(', ') : '<none matched known origins>'
      console.log('[codex/origindump] ' + player.username + ' matched = ' + result)
      player.tell('\u00a76[Debug]\u00a7r Matched: \u00a7e' + result + '\u00a7r')

      // 2026-04-21: piggyback a starter-kit grant attempt right after the
      // origindump. At this point the probe has confirmed Origins are
      // populated (matched array is non-empty). This is faster than waiting
      // for the next tick_codexStarterCheck tick (which runs every 5s and
      // only actually grants when flag is false + detect succeeds); this
      // path fires immediately when we KNOW the NBT is good.
      try {
        var grantResult = codex_tryGrantStarter(player)
        console.log('[codex/origindump] immediate-grant attempt result=' + grantResult)
      } catch (ge) {
        console.warn('[codex/origindump] immediate-grant threw for ' + player.username + ': ' + ge)
      }
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
        // Read whatever is on the origins:class layer directly via NBT —
        // the execute-if probe path doesn't match reliably in this Forge
        // build. Report the bare class name regardless of whether it's
        // in the magic set; this disambiguates "you're not a magic class"
        // from "the probe is broken."
        var detectedAnyClass = null
        try {
          var _nbt = player.nbt
          var _fc = _nbt ? _nbt.ForgeCaps : null
          var _oo = _fc && _fc.get ? _fc.get('origins:origins') : null
          var _origins = _oo && _oo.get ? _oo.get('Origins') : null
          var _classId = _origins && _origins.getString ? String(_origins.getString('origins:class') || '') : ''
          if (_classId) {
            var _colon = _classId.indexOf(':')
            detectedAnyClass = _colon >= 0 ? _classId.substring(_colon + 1) : _classId
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

// ── Real slash commands (ServerEvents.commandRegistry) ──
// 2026-04-21: tester typed `!kit` and `!origindump` — the vanilla chat log
// shows both messages broadcast to chat, but NO `[codex/chat]` diagnostic
// fired. PlayerEvents.chat is simply not firing in this KubeJS 2001.6.5
// build for unknown reasons (other handlers in ascension.js /
// attribute_commands.js are equally silent). Switched to registering real
// Brigadier slash commands via ServerEvents.commandRegistry, which go
// through MinecraftServer's CommandDispatcher — a separate codepath that
// we've confirmed fires (KubeJSCommands routes through it too).
//
// Usage in-game (with slash):
//   /icraftkit            — detect class, grant kit if magic class
//   /icraftkit <class>    — force-grant for named class (archmage/battlemage/void_summoner)
//   /icraftorigindump     — dump raw Origins NBT + probed class to log + chat
ServerEvents.commandRegistry(event => {
  const { commands: Commands, arguments: Arguments } = event

  event.register(
    Commands.literal('icraftkit')
      .requires(src => src.hasPermission(0))
      .executes(ctx => {
        let sp
        try { sp = ctx.source.getPlayerOrException() } catch (e) { return 0 }
        console.log('[codex/cmd] /icraftkit from ' + sp.username)
        // Clear all magic-class flags so the kit re-fires even if a prior
        // grant set one of them.
        MAGIC_CLASSES.forEach(function(c) {
          sp.persistentData.putBoolean(MAGIC_FLAG_PREFIX + c, false)
        })
        let cls = codex_detectMagicClass(sp)
        if (cls) {
          codex_giveStarterKit(sp, cls)
          sp.persistentData.putBoolean(MAGIC_FLAG_PREFIX + cls, true)
          console.log('[codex/cmd] /icraftkit: granted ' + cls + ' kit to ' + sp.username)
          return 1
        }
        // No magic class detected — help the tester diagnose.
        sp.tell('\u00a7c[Starter Kit]\u00a7r No class detected on origins:class layer. Try `/icraftkit <archmage|battlemage|void_summoner>` to force-grant, or check `/icraftorigindump`.')
        console.log('[codex/cmd] /icraftkit: no magic class detected for ' + sp.username)
        return 0
      })
      .then(Commands.literal('archmage').executes(ctx => icraftkit_force(ctx, 'archmage')))
      .then(Commands.literal('battlemage').executes(ctx => icraftkit_force(ctx, 'battlemage')))
      .then(Commands.literal('void_summoner').executes(ctx => icraftkit_force(ctx, 'void_summoner')))
  )

  event.register(
    Commands.literal('icraftorigindump')
      .requires(src => src.hasPermission(0))
      .executes(ctx => {
        let sp
        try { sp = ctx.source.getPlayerOrException() } catch (e) { return 0 }
        sp.persistentData.putBoolean('icraft_origindump_pending', true)
        sp.tell('\u00a76[OriginDump]\u00a7r queued — check server log for full NBT dump.')
        console.log('[codex/cmd] /icraftorigindump from ' + sp.username + ' queued')
        return 1
      })
  )
})

// Helper for the forced-class variant of /icraftkit. Defined as a module-scope
// function so both literal branches above can share it without recreating the
// grant logic.
function icraftkit_force(ctx, className) {
  let sp
  try { sp = ctx.source.getPlayerOrException() } catch (e) { return 0 }
  sp.persistentData.putBoolean(MAGIC_FLAG_PREFIX + className, false)
  codex_giveStarterKit(sp, className)
  sp.persistentData.putBoolean(MAGIC_FLAG_PREFIX + className, true)
  console.log('[codex/cmd] /icraftkit ' + className + ' (forced) granted to ' + sp.username)
  return 1
}

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
