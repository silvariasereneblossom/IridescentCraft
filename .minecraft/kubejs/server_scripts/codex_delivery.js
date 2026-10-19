// @file kubejs/server_scripts/codex_delivery.js
// @events PlayerEvents.chat, PlayerEvents.loggedIn, ServerEvents.commandRegistry, ServerEvents.recipes, tick.server
// =============================================================================
// IRIDESCENT CODEX — First-Join Delivery, Magic Starter Kit & Book Suppression
// =============================================================================
// 2026-10 cleanup (operator-approved):
//   * ONE starter-kit grant path: grantStarterKit(). Every trigger (the 5 s
//     check, /icraftkit, !kit) goes through it, and it looks at the per-class
//     "already granted" flag before it gives anything. The second copy of the
//     kit logic (origins/magic_class_starter.js, which re-read player.nbt for
//     every player every 5 s forever and could not build scroll entries) is
//     gone; so is the "immediate grant" that used to ride on the origin dump.
//   * Class detection is global.icraft.origin (0_lib_origins.js) instead of
//     three private copies of the player.nbt read.
//   * The origin dump is manual only (/icraftorigindump or !origindump). It no
//     longer arms itself on every login, and players no longer receive a
//     "[Debug] Matched ..." chat line.
//   * /icraftkit <class> exists for every class in MAGIC_CLASSES (it used to
//     stop at three) and is op-only; plain /icraftkit respects the flag, so it
//     can no longer be spammed for free kits.
//   * The chat commands (!codex / !kit / !origindump) are actually swallowed
//     now. event.cancel() works by throwing; it used to sit inside the
//     handler's try/catch, which ate the cancel, so the "!" messages were
//     broadcast to everyone.
//
// Flags and kit contents are unchanged (persistentData icraft_magic_starter_<class>),
// so a player who already received a kit does not get another.
//
// 2026-10-10 -- the starter kits never contained a spell book:
//   * The kit table named `iridescent_modular_spells:modular_copper_spell_book`
//     and `...:modular_novice_spell_book`. Those per-tier items were merged
//     (Phase 6G) into ONE item per side -- `modular_spell_book` (Iron's
//     Spellbooks) and `modular_ars_spell_book` (Ars Nouveau) -- whose tier is
//     the material in its `core` slot. The old ids resolve to an empty stack.
//     The kit now gives the merged item with the exact module NBT the Tetra
//     replacement for the vanilla starter book produces
//     (iridescent-tetra-expansion-mod data/tetra/replacements/
//     iridescent_modular_spells/{copper,novice}_spell_book.json; NBT layout =
//     IModularItem.putModuleInSlot: "<slot>" = module key,
//     "<module key>_material" = variant key).
//   * ONE-TIME TOP-UP for characters flagged before this fix. They received
//     gems and ink only (the book id was dead and, until the 2026-10 cleanup,
//     no scroll could be built either), so the missing book(s) and scrolls are
//     granted once, behind icraft_magic_starter_full_<class>. Every kit granted
//     from now on sets that flag itself, so it is never topped up, and the
//     top-up gives nothing unless every book resolves (it retries instead).
//
// Whole file is one IIFE: server scripts share a single Rhino scope.
// =============================================================================

;(function () {
  var CODEX_NBT = '{"patchouli:book":"icraft:iridescent_codex"}'
  var CODEX_FLAG = 'icraft_codex_given'

  // once per failing block per script load: the table and the wording of "once" are
  // global.icraft.core.warnOnce's (0_lib_core.js); this only adds the script's name
  var warnAbout = function (where, e) {
    global.icraft.core.warnOnce('codex_delivery:' + where, '[codex] ' + where + ': ' + e)
  }

  // ── Magic class starter kit ────────────────────────────────────────────────
  // Entries are plain `{item, count}` (optionally with `nbt` and `book: true`)
  // OR `{scroll: spellId, level}` for pre-inscribed Iron's Spellbooks scrolls.
  //
  // The two starter books (see the 2026-10-10 header note). 2026-04-26 Phase 5:
  // caster classes start with MODULAR books so they can immediately install
  // cover/pages materials + the custom magic enchants (mana_capacity /
  // mana_flow / arcane_edge / arcane_devastation). Module NBT = what converting
  // irons_spellbooks:copper_spell_book / ars_nouveau:novice_spell_book at a
  // Tetra workbench yields.
  var ISS_STARTER_BOOK = {
    book: true,
    item: 'iridescent_modular_spells:modular_spell_book',
    count: 1,
    nbt: '{"iss_book/core":"iss_book/core","iss_book/core_material":"iss_core/copper_spell_book",' +
      '"iss_book/front_cover":"iss_book/front_cover","iss_book/front_cover_material":"front_cover/copper",' +
      '"iss_book/back_cover":"iss_book/back_cover","iss_book/back_cover_material":"back_cover/copper",' +
      '"iss_book/spine":"iss_book/spine","iss_book/spine_material":"spine/copper",' +
      '"iss_book/pages":"iss_book/pages","iss_book/pages_material":"pages/paper"}'
  }
  var ARS_STARTER_BOOK = {
    book: true,
    item: 'iridescent_modular_spells:modular_ars_spell_book',
    count: 1,
    nbt: '{"ars_book/core":"ars_book/core","ars_book/core_material":"ars_core/novice_spell_book",' +
      '"ars_book/front_cover":"ars_book/front_cover","ars_book/front_cover_material":"front_cover/leather",' +
      '"ars_book/back_cover":"ars_book/back_cover","ars_book/back_cover_material":"back_cover/leather",' +
      '"ars_book/spine":"ars_book/spine","ars_book/spine_material":"spine/iron",' +
      '"ars_book/dye":"ars_book/dye","ars_book/dye_material":"dye/string"}'
  }

  var MAGIC_STARTER_KITS = {
    archmage: [
      ISS_STARTER_BOOK,
      { scroll: 'irons_spellbooks:magic_missile',   level: 1 },
      { scroll: 'irons_spellbooks:firebolt',        level: 1 },
      ARS_STARTER_BOOK,
      { item: 'ars_nouveau:source_gem',            count: 5 },
      { item: 'irons_spellbooks:common_ink',       count: 2 }
    ],
    battlemage: [
      ISS_STARTER_BOOK,
      { scroll: 'irons_spellbooks:magic_arrow',     level: 1 },
      { scroll: 'irons_spellbooks:fang_strike',     level: 1 },
      { item: 'ars_nouveau:source_gem',            count: 3 },
      { item: 'irons_spellbooks:common_ink',       count: 1 }
    ],
    void_summoner: [
      ISS_STARTER_BOOK,
      { scroll: 'irons_spellbooks:magic_missile',   level: 1 },
      { scroll: 'irons_spellbooks:summon_vex',      level: 1 },
      { item: 'irons_spellbooks:common_ink',       count: 1 },
      { item: 'minecraft:ender_pearl',             count: 1 }
    ],
    // ── Trinity mages (Phase 1a, 2026-06-14). Each gets two on-triad starter
    //    scrolls (ids confirmed against the live ISS registry) + catalyst + ink.
    elemental: [
      ISS_STARTER_BOOK,
      { scroll: 'irons_spellbooks:firebolt',        level: 1 },
      { scroll: 'irons_spellbooks:cone_of_cold',    level: 1 },
      { item: 'ars_nouveau:source_gem',            count: 5 },
      { item: 'irons_spellbooks:common_ink',       count: 2 }
    ],
    blessed: [
      ISS_STARTER_BOOK,
      { scroll: 'irons_spellbooks:heal',            level: 1 },
      { scroll: 'irons_spellbooks:wisp',            level: 1 },
      { item: 'ars_nouveau:source_gem',            count: 4 },
      { item: 'irons_spellbooks:common_ink',       count: 2 }
    ],
    corrupted: [
      ISS_STARTER_BOOK,
      { scroll: 'irons_spellbooks:ray_of_siphoning', level: 1 },
      { scroll: 'irons_spellbooks:eldritch_blast',   level: 1 },
      { item: 'minecraft:ender_pearl',             count: 2 },
      { item: 'irons_spellbooks:common_ink',       count: 2 }
    ]
  }
  var MAGIC_CLASSES = ['archmage', 'battlemage', 'void_summoner', 'elemental', 'blessed', 'corrupted']
  var MAGIC_FLAG_PREFIX = 'icraft_magic_starter_'
  // Set once a class's book(s) AND scrolls have been delivered (see the
  // 2026-10-10 header note). Kit flag set + this one missing = a character
  // that got the bookless kit and is owed the one-time top-up.
  var MAGIC_FULL_PREFIX = 'icraft_magic_starter_full_'
  // Set when the scrolls were delivered but a book was not (so a later top-up
  // adds the book without repeating the scrolls).
  var MAGIC_SCROLLS_PREFIX = 'icraft_magic_starter_scrolls_'

  // ISS classes are resolved lazily so a missing / changed ISS only costs the
  // scrolls, not the Codex delivery below.
  var issClasses = null
  var getIss = function () {
    if (issClasses === null) {
      try {
        issClasses = {
          SpellRegistry: Java.loadClass('io.redspace.ironsspellbooks.api.registry.SpellRegistry'),
          ISpellContainer: Java.loadClass('io.redspace.ironsspellbooks.api.spells.ISpellContainer'),
          ResourceLocation: Java.loadClass('net.minecraft.resources.ResourceLocation')
        }
      } catch (e) {
        issClasses = false
        warnAbout('Iron\'s Spellbooks classes not loadable -- starter scrolls fall back to NBT', e)
      }
    }
    return issClasses || null
  }

  // A scroll with one spell inscribed. Three attempts, most faithful first:
  //   1. ISpellContainer.createScrollContainer on a fresh scroll stack. The
  //      spell is looked up through the Forge registry: SpellRegistry.getSpell
  //      is overloaded (String / ResourceLocation) and KubeJS can convert a
  //      script value to either, so Rhino refuses to pick one -- production
  //      logged "The choice of Java method ...getSpell... is ambiguous" for
  //      every scroll. (The old code also called .getInternal() on the stack,
  //      which does not exist here, so no kit ever contained a scroll.)
  //   2. The same container written as item NBT.
  //   3. A blank scroll (randomize_blank_scrolls.js binds a random T1 spell).
  var makeScroll = function (spellId, level) {
    var iss = getIss()
    if (iss) {
      try {
        var spell = iss.SpellRegistry.REGISTRY.get().getValue(iss.ResourceLocation.tryParse(spellId))
        if (spell && String(spell.getSpellId()) === spellId) {
          var stack = Item.of('irons_spellbooks:scroll')
          iss.ISpellContainer.createScrollContainer(spell, level, stack)
          return stack
        }
        warnAbout('starter scroll: unknown spell ' + spellId + ' -- using the NBT form', 'not in the ISS spell registry')
      } catch (e) {
        warnAbout('starter scroll: ISS API path failed -- using the NBT form', e)
      }
    }
    try {
      return Item.of('irons_spellbooks:scroll',
        '{"irons_spellbooks:spell_container":{data:[{id:"' + spellId + '",index:0,level:' + level +
        ',locked:1b}],maxSpells:1,mustEquip:0b,spellWheel:0b}}')
    } catch (e2) {
      warnAbout('starter scroll: NBT path failed -- giving a blank scroll', e2)
    }
    return Item.of('irons_spellbooks:scroll')
  }

  // Bare class name ('archmage') of ANY class, or null.
  var classOf = function (player) {
    try {
      var id = global.icraft.origin.get(player, 'class')
      return id ? id.substring(id.indexOf(':') + 1) : null
    } catch (e) {
      return null
    }
  }

  var displayName = function (className) {
    return className.replace('_', ' ').replace(/\b\w/g, function (c) { return c.toUpperCase() })
  }

  // One kit entry -> ItemStack (may be empty when the id is unknown).
  var entryLabel = function (entry) {
    return entry.scroll ? ('scroll ' + entry.scroll) : String(entry.item)
  }
  var entryStack = function (entry) {
    if (entry.scroll) return makeScroll(entry.scroll, entry.level || 1)
    if (entry.nbt) return Item.of(entry.item, entry.nbt)
    return Item.of(entry.item, entry.count)
  }

  // ── THE starter-kit grant path ─────────────────────────────────────────────
  // Returns 'granted' | 'already' | 'unknown'.
  //   regrant = true: operator override (/icraftkit <class>) -- give the kit
  //   again even though the flag says the player already had one.
  var grantStarterKit = function (player, className, regrant) {
    if (!MAGIC_STARTER_KITS.hasOwnProperty(className)) return 'unknown'
    var data = player.persistentData
    var flagKey = MAGIC_FLAG_PREFIX + className
    if (data.getBoolean(flagKey) && !regrant) return 'already'

    var kit = MAGIC_STARTER_KITS[className]
    var delivered = 0
    var booksMissing = 0
    var scrollsMissing = 0
    for (var i = 0; i < kit.length; i++) {
      var entry = kit[i]
      var label = entryLabel(entry)
      var given = false
      try {
        var stack = entryStack(entry)
        // isEmpty is a METHOD on ItemStack. An unknown item id resolves to an
        // empty stack and player.give() of it silently gives nothing.
        if (!stack || stack.isEmpty()) {
          warnAbout('starter kit entry "' + label + '" does not resolve to an item -- skipped', 'empty stack')
        } else {
          player.give(stack)
          delivered++
          given = true
        }
      } catch (e) {
        warnAbout('starter kit entry "' + label + '" could not be given', e)
      }
      if (!given && entry.book) booksMissing++
      if (!given && entry.scroll) scrollsMissing++
    }

    // Flag first-time grants even when an entry failed: the failure is logged
    // above, and re-granting the whole kit every 5 s would be worse. A missing
    // BOOK is the one thing that is retried (topUpStarterKit), so the "full"
    // flag is only set when every book went out.
    data.putBoolean(flagKey, true)
    if (scrollsMissing === 0) data.putBoolean(MAGIC_SCROLLS_PREFIX + className, true)
    if (booksMissing === 0 && scrollsMissing === 0) data.putBoolean(MAGIC_FULL_PREFIX + className, true)
    console.log('[codex/starter] ' + className + ' kit -> ' + player.username + ': ' +
      delivered + '/' + kit.length + ' entries delivered' + (regrant ? ' (operator re-grant)' : ''))

    try {
      player.tell('\u00a76[Starter Kit]\u00a7r A ' + displayName(className) + "'s catalyst has been added to your inventory.")
      player.tell('Find spells and glyphs in loot chests to grow your repertoire.')
    } catch (e) {
      warnAbout('starter kit message', e)
    }
    return 'granted'
  }

  // ── One-time top-up (see the 2026-10-10 header note) ──────────────────────
  // For a class whose kit flag is set but whose "full" flag is not: give the
  // book(s), and the scrolls unless they are already recorded as delivered.
  // Returns 'topped-up' | 'not-needed' | 'failed'.
  //   * never runs for a kit granted by the current code (it set the flag)
  //   * all-or-nothing: every stack is built and checked BEFORE anything is
  //     given, and the flag is set in the same pass, so it cannot pay out twice
  var topUpStarterKit = function (player, className) {
    if (!MAGIC_STARTER_KITS.hasOwnProperty(className)) return 'not-needed'
    var data = player.persistentData
    if (!data.getBoolean(MAGIC_FLAG_PREFIX + className)) return 'not-needed'   // no kit yet: the grant path owns it
    var fullKey = MAGIC_FULL_PREFIX + className
    if (data.getBoolean(fullKey)) return 'not-needed'

    var scrollsOwed = !data.getBoolean(MAGIC_SCROLLS_PREFIX + className)
    var kit = MAGIC_STARTER_KITS[className]
    var stacks = []
    var books = 0
    for (var i = 0; i < kit.length; i++) {
      var entry = kit[i]
      if (!entry.book && !(entry.scroll && scrollsOwed)) continue
      var stack = null
      try { stack = entryStack(entry) } catch (e) { stack = null }
      if (!stack || stack.isEmpty()) {
        warnAbout('starter kit top-up: "' + entryLabel(entry) + '" does not resolve to an item -- top-up postponed', 'empty stack')
        return 'failed'
      }
      stacks.push(stack)
      if (entry.book) books++
    }

    // Flag FIRST: whatever happens while handing the items over, this can
    // never pay out a second time.
    data.putBoolean(fullKey, true)
    data.putBoolean(MAGIC_SCROLLS_PREFIX + className, true)
    for (var j = 0; j < stacks.length; j++) {
      try { player.give(stacks[j]) } catch (e3) { warnAbout('starter kit top-up: an item could not be given', e3) }
    }
    console.log('[codex/starter] ' + className + ' kit top-up -> ' + player.username + ': ' + books +
      ' book(s) + ' + (stacks.length - books) + ' scroll(s) the original kit never contained')
    try {
      player.tell('\u00a76[Starter Kit]\u00a7r Your ' + displayName(className) +
        ' starter kit was missing its spell book' + (books > 1 ? 's' : '') +
        (stacks.length > books ? ' and scrolls' : '') + '. They have been added to your inventory.')
    } catch (e2) {
      warnAbout('starter kit top-up message', e2)
    }
    return 'topped-up'
  }

  // Automatic trigger: the player's CURRENT class, if it is a magic class.
  // Returns grantStarterKit's result ('topped-up' when an old bookless kit was
  // just completed), or 'no-class' / 'not-magic'.
  var grantStarterForOwnClass = function (player) {
    var cls = classOf(player)
    if (!cls) return 'no-class'
    if (MAGIC_CLASSES.indexOf(cls) < 0) return 'not-magic'
    var result = grantStarterKit(player, cls, false)
    if (result === 'already' && topUpStarterKit(player, cls) === 'topped-up') return 'topped-up'
    return result
  }

  // Shared reply for the two manual triggers (/icraftkit and !kit).
  var manualKit = function (player) {
    var result = grantStarterForOwnClass(player)
    if (result === 'already') {
      player.tell('\u00a7e[Starter Kit]\u00a7r You have already received the ' + displayName(classOf(player)) + ' starter kit.')
    } else if (result === 'not-magic') {
      player.tell('\u00a7e[Starter Kit]\u00a7r Detected class: \u00a7b' + classOf(player) + '\u00a7r (not a magic class, so there is no catalyst starter kit for it).')
    } else if (result === 'no-class') {
      player.tell('\u00a7c[Starter Kit]\u00a7r No class detected yet. Pick a class first; /icraftorigindump shows what Origins has recorded.')
    }
    return result
  }

  // ── Codex book ─────────────────────────────────────────────────────────────
  var giveBook = function (player) {
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
  var playerHasCodex = function (player) {
    try {
      var r = player.server.runCommandSilent(
        'clear ' + player.username + ' patchouli:guide_book{"patchouli:book":"icraft:iridescent_codex"} 0'
      )
      // `/clear ... <count=0>` returns the matching-item count without clearing.
      return r > 0
    } catch (e) {
      console.warn('[codex] inventory check failed for ' + player.username + ': ' + e)
      return false
    }
  }

  // Countdowns the removed auto-dump / poll-window / duplicate-starter code
  // left in persistentData. Dropped on login so they do not linger forever.
  var OBSOLETE_KEYS = ['icraft_auto_origindump_ticks', 'icraft_starter_poll_ticks', 'icraft_magic_starter_login_check']

  // ── First-Join Delivery ────────────────────────────────────────────────────
  PlayerEvents.loggedIn(icraft.guard('codex_delivery', 'PlayerEvents.loggedIn', function (event) {
    var player = event.player
    try {
      var data = player.persistentData
      var flagSet = data.getBoolean(CODEX_FLAG)

      if (!flagSet) {
        // Never given — give now.
        if (giveBook(player)) {
          data.putBoolean(CODEX_FLAG, true)
          console.log('[codex] First-join delivery to ' + player.username)
        }
      } else if (!playerHasCodex(player)) {
        // Flag set but book missing — re-grant silently (lost to /clear, death, etc.)
        if (giveBook(player)) {
          console.log('[codex] Re-delivered to ' + player.username + ' (flag was set but book missing)')
        }
      }

      data.putInt('icraft_book_sweep_ticks', 1200)
      for (var i = 0; i < OBSOLETE_KEYS.length; i++) {
        if (data.contains(OBSOLETE_KEYS[i])) data.remove(OBSOLETE_KEYS[i])
      }
    } catch (e) {
      warnAbout('login delivery', e)
    }
  }))

  // ── Starter-kit check ──────────────────────────────────────────────────────
  // Every 5 s for every online player. A class picked late (the Origins picker
  // can stay open for minutes) or changed at the Class Altar is caught without
  // a relog. Cost per player: one cached resolver lookup, plus (magic classes
  // only) two or three boolean reads -- the kit flag and the top-up flags.
  global.tick_codexStarterCheck = function (event) {
    event.server.players.forEach(function (player) {
      try {
        grantStarterForOwnClass(player)
      } catch (e) {
        warnAbout('starter check', e)
      }
    })
  }
  global.registerServerTick('tick_codexStarterCheck', 100, 5)

  // ── Manual origin dump (server thread) ─────────────────────────────────────
  // Queued by /icraftorigindump or !origindump via `icraft_origindump_pending`.
  // Prints what the shared resolver answers (what every class/race/origin
  // system now acts on) next to the raw Origins capability, to the log and to
  // the player who asked.
  var dumpOrigins = function (player) {
    var name = player.username
    var raw = '<unavailable>'
    try {
      var full = player.nbt
      var fc = full ? full.ForgeCaps : null
      var oo = fc && fc.get ? fc.get('origins:origins') : null
      raw = oo ? String(oo) : '<no origins:origins capability>'
    } catch (e) {
      raw = '<read threw: ' + e + '>'
    }

    var seen = []
    var layers = ['class', 'race', 'origin']
    for (var i = 0; i < layers.length; i++) {
      var id = null
      try { id = global.icraft.origin.get(player, layers[i]) } catch (e) { id = '<resolver unavailable>' }
      seen.push(layers[i] + '=' + (id || 'none'))
    }
    var summary = seen.join(', ')

    console.log('[codex/origindump] ' + name + ' resolver: ' + summary)
    console.log('[codex/origindump] ' + name + ' ForgeCaps[origins:origins] = ' + raw)
    player.tell('\u00a76[OriginDump]\u00a7r ' + summary)
    player.tell('\u00a77[OriginDump] raw: ' + raw)
  }

  global.tick_codexOriginDump = function (event) {
    event.server.players.forEach(function (player) {
      try {
        var data = player.persistentData
        if (!data.getBoolean('icraft_origindump_pending')) return
        data.putBoolean('icraft_origindump_pending', false)
        // Fresh answer for a diagnostic: skip the resolver's 5 s cache.
        try { global.icraft.origin.invalidate(player) } catch (e) {}
        dumpOrigins(player)
      } catch (e) {
        warnAbout('origin dump', e)
      }
    })
  }
  global.registerServerTick('tick_codexOriginDump', 20, 11)

  // ── Admin/tester chat commands ─────────────────────────────────────────────
  //   !codex               — force-deliver the codex
  //   !kit / !magicstart   — starter kit for your class (once per class)
  //   !origindump          — dump your Origins layers to log + chat
  //
  // PlayerEvents.chat runs on a Worker thread (production log: "[Worker-Main-5]
  // ... [codex/chat] received candidate"), so the handler only sets a flag;
  // tick_codexChatProcessor does the work on the server thread a moment later.
  // The cancel happens LAST and outside the try: event.cancel() exits by
  // throwing, and inside the old try/catch that throw was swallowed -- the
  // flag got set but the "!" message was still broadcast to chat.
  PlayerEvents.chat(icraft.guard('codex_delivery', 'PlayerEvents.chat', function (event) {
    var handled = false
    try {
      var msg = String(event.message || '').trim().toLowerCase()
      if (msg.charAt(0) !== '!') return
      var flag = null
      if (msg === '!codex') flag = 'icraft_chat_pending_codex'
      else if (msg === '!kit' || msg === '!magicstart') flag = 'icraft_chat_pending_kit'
      else if (msg === '!origindump') flag = 'icraft_origindump_pending'
      if (flag === null) return  // not our command, let chat proceed normally

      event.player.persistentData.putBoolean(flag, true)
      handled = true
    } catch (e) {
      // Chat-thread exceptions must never surface to the player.
    }
    if (handled) event.cancel()
  }))

  // ── Server-thread processor for the queued chat commands ──
  // Reads two booleans per player once a second. Everything here runs on the
  // server thread, so runCommandSilent / player.give / persistentData are safe.
  global.tick_codexChatProcessor = function (event) {
    event.server.players.forEach(function (player) {
      try {
        var data = player.persistentData

        // --- !codex ---
        if (data.getBoolean('icraft_chat_pending_codex')) {
          data.putBoolean('icraft_chat_pending_codex', false)
          var ok = giveBook(player)
          if (ok) data.putBoolean(CODEX_FLAG, true)
          console.log('[codex] !codex from ' + player.username + ': ' + (ok ? 'granted' : 'grant failed'))
        }

        // --- !kit / !magicstart ---
        if (data.getBoolean('icraft_chat_pending_kit')) {
          data.putBoolean('icraft_chat_pending_kit', false)
          var result = manualKit(player)
          console.log('[codex/starter] !kit from ' + player.username + ': ' + result)
        }

        // --- !origindump is handled by tick_codexOriginDump above ---
      } catch (e) {
        warnAbout('chat command processing', e)
      }
    })
  }
  global.registerServerTick('tick_codexChatProcessor', 20, 13)

  // ── Real slash commands (ServerEvents.commandRegistry) ─────────────────────
  //   /icraftkit            — starter kit for your own class, once per class
  //   /icraftkit <class>    — OP ONLY: (re)grant the named class's kit to
  //                           yourself, ignoring the class check and the flag
  //   /icraftorigindump     — dump your Origins layers to log + chat
  ServerEvents.commandRegistry(icraft.guard('codex_delivery', 'ServerEvents.commandRegistry', function (event) {
    var Commands = event.commands

    var kit = Commands.literal('icraftkit')
      .requires(function (src) { return src.hasPermission(0) })
      .executes(function (ctx) {
        var sp
        try { sp = ctx.source.getPlayerOrException() } catch (e) { return 0 }
        var result = manualKit(sp)
        console.log('[codex/cmd] /icraftkit from ' + sp.username + ': ' + result)
        return (result === 'granted' || result === 'topped-up') ? 1 : 0
      })

    // One literal per magic class, generated from MAGIC_CLASSES so the list
    // cannot fall behind the kit table again.
    MAGIC_CLASSES.forEach(function (className) {
      kit = kit.then(
        Commands.literal(className)
          .requires(function (src) { return src.hasPermission(2) })
          .executes(function (ctx) {
            var sp
            try { sp = ctx.source.getPlayerOrException() } catch (e) { return 0 }
            var result = grantStarterKit(sp, className, true)
            console.log('[codex/cmd] /icraftkit ' + className + ' (operator re-grant) for ' + sp.username + ': ' + result)
            return result === 'granted' ? 1 : 0
          })
      )
    })
    event.register(kit)

    event.register(
      Commands.literal('icraftorigindump')
        .requires(function (src) { return src.hasPermission(0) })
        .executes(function (ctx) {
          var sp
          try { sp = ctx.source.getPlayerOrException() } catch (e) { return 0 }
          sp.persistentData.putBoolean('icraft_origindump_pending', true)
          return 1
        })
    )
  }))

  // ── Backup Recovery Recipe ─────────────────────────────────────────────────

  ServerEvents.recipes(icraft.guard('codex_delivery', 'ServerEvents.recipes', function (event) {
    event.shapeless(
      Item.of('patchouli:guide_book', CODEX_NBT),
      ['minecraft:book', 'minecraft:lapis_lazuli']
    ).id('icraft:codex_recovery_recipe')
  }))

  // ── Book Suppression ───────────────────────────────────────────────────────
  // Uses /clear commands exclusively since inventory slot manipulation is broken.
  // Patchouli books from other mods share the patchouli:guide_book item ID
  // but have different NBT. We clear each known mod book by NBT.

  // Known patchouli book NBT values to suppress
  var PATCHOULI_BOOKS_TO_CLEAR = [
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
  var OTHER_BOOKS_TO_CLEAR = [
    'terramity:guidebook',
    'terramity:terramity_guidebook',
    'terramity:guide_book',
    'simplyswords:runic_grimoire',
    // (simplyswords:runic_tablet was on this list until 2026-10-11. It is not a
    //  book: it is the smithing material of Simply Swords' runic weapons and an
    //  ingredient of the Righteous / Tainted Relic crafts, and this sweep deleted
    //  every tablet a player carried. Operator ruling, decision sheet D1.)
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
  var clearModBooks = function (player, doLog) {
    var name = player.username
    var cleared = 0

    // Clear known patchouli guide books by NBT
    PATCHOULI_BOOKS_TO_CLEAR.forEach(function (bookId) {
      var cmd = 'clear ' + name + ' patchouli:guide_book{"patchouli:book":"' + bookId + '"} 64'
      var result = player.server.runCommandSilent(cmd)
      if (result > 0) {
        console.log('[IridescentCraft] Cleared patchouli book: ' + bookId + ' (' + result + ' items)')
        cleared += result
      }
    })

    // Clear non-patchouli mod books by item ID
    OTHER_BOOKS_TO_CLEAR.forEach(function (bookId) {
      var result = player.server.runCommandSilent('clear ' + name + ' ' + bookId + ' 64')
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
  global.tick_codexBookSweep = function (event) {
    var tick = event.server.tickCount

    event.server.players.forEach(function (player) {
      var sweepTicks = player.persistentData.getInt('icraft_book_sweep_ticks')
      if (sweepTicks <= 0) return

      // First 10 seconds (200 ticks): clear every second
      // After that: clear every 10 seconds
      var aggressive = sweepTicks > 1000 // 1200 - 200 = first 10s
      var interval = aggressive ? 20 : 200

      if (tick % interval !== 0) return

      player.persistentData.putInt('icraft_book_sweep_ticks', sweepTicks - interval)
      clearModBooks(player, aggressive)
    })
  }
  global.registerServerTick('tick_codexBookSweep', 20, 0)
})()
