// @file kubejs/server_scripts/items/my_script.js
// @events EntityEvents.death, ItemEvents.rightClicked, tick.server
// @registry bosses
// @live my-script-reward
// =============================================================================
// TEMPLATE for a new KubeJS script of this pack. Copy it, rename it, replace
// this banner with ONE sentence that says what the feature does for a player.
// =============================================================================
// HOW TO START FROM THIS FILE (delete this block when you are done)
//   1. Copy it to kubejs/<type>_scripts/<folder>/<name>.js (type = server,
//      startup or client; the canonical tree is .minecraft/kubejs).
//   2. Write the code, then let the tool print the four header lines above:
//        node --expose-internals .minecraft/dev/catalogue/load_order.js --header server:<folder>/<name>.js
//      and paste them over the ones on top. They are CHECKED against the code.
//   3. Regenerate what is generated, mirror, test, push (kubejs/README.md has
//      the commands): gen_liveness.js, gen_catalogue.js, sync-distros.ps1 -Fix.
//
// THE HEADER FIELDS (the leading comment block; every one starts with `@`)
//   @file      where this file is, below .minecraft
//   @events    every group it registers on, as the liveness ids name them: the
//              KubeJS event of a guarded handler, tick.server / tick.player for
//              a tick function, hurt / hurt.late for a hurt handler,
//              <Registry>.<method> for icraft.handler; write `none` when the
//              script registers nothing at all
//   @registry  bosses, dimensions: the registries it reads (leave the line out
//              when it reads none)
//   @live      the icraft.live.fired names it reports (leave it out when none)
//   @after     <folder>/<other>.js  <why>
//              only when this script must load AFTER another one of its type:
//              it reads a global of that script while it loads, or its handler
//              relies on what the other script's handler of the SAME event did.
//              One line per script. Never for a library: libraries load first
//              because of their own priority line.
//   @last      <event>
//              only when this script's handler must be the LAST one of that
//              event (a strip that has to run after every add of every other
//              script). The check fails when a script that loads later
//              registers on the event. It moves nothing, like @after.
//
// A COMMENT LINE CAN SWITCH THIS FILE OFF
//   KubeJS reads every line `// <word> <word>` (and `// <word>`) of a script as
//   a file property, anywhere in the file: `// ignored true` skips the file
//   without a log line, `// priority 5` moves it. Keep comment lines longer
//   than two words or end them with a full stop. The `@` of a header field is
//   what keeps it from being one. The lint (FILE-PROPERTY) flags the dangerous
//   ones; do not write a `// priority` line in a feature script at all.
// =============================================================================

// One function around everything: every server script shares ONE scope, and a
// top-level name declared twice breaks the second file.
;(function () {
  // Libraries. A script that cannot work without one asks for it first: when it
  // is missing, ONE error line names this script and the boot-log check is red.
  if (!icraft.lib.need('core', 'items/my_script') || !icraft.lib.need('registry', 'items/my_script') ||
      !icraft.lib.need('ticks', 'items/my_script')) return
  var core = global.icraft.core

  var REWARD = 'minecraft:diamond'
  var seen = 0

  // Every event registration goes through icraft.guard(name, event, handler):
  //   name   this file's path below its *_scripts folder, without .js (a second
  //          handler of the same event in this file: 'items/my_script#2')
  //   event  the registration it is handed to, as written
  // A throw in here is then ONE `[icraft.guard] FAILED` line and the handlers
  // of the other scripts still run. event.cancel() passes through.
  EntityEvents.death(icraft.guard('items/my_script', 'EntityEvents.death', function (event) {
    var entity = event.entity
    if (!entity || !entity.living) return
    // an id is a Java string on this engine: ask the core for it (never entity.type), and ask the
    // registry what it is (never a list of ids in this file)
    var id = core.entityId(entity)
    if (!icraft.bosses.is(id)) return
    seen++
  }))

  ItemEvents.rightClicked('minecraft:stick', icraft.guard('items/my_script', 'ItemEvents.rightClicked', function (event) {
    var player = event.player
    if (!player || seen === 0) return
    player.give(REWARD)
    seen = 0
    // The handler ran: that is recorded for you (ARMED when it is registered, FIRED the first
    // time it finishes). THIS line says the FEATURE did its work; put it in the branch that did
    // it, once per feature. A lower-case name joined by `-`, never a player's name.
    icraft.live.fired('my-script-reward')
  }))

  // A tick function goes through the tick master (never ServerEvents.tick of your own):
  // a name, an interval in ticks, an offset below the interval, the function.
  global.registerServerTick('tick_myScript', 200, 7, function (event) {
    if (seen > 64) {
      // a problem on a hot path is said ONCE (never an empty catch, never a line per tick)
      core.warnOnce('my_script:seen', '[my_script] ' + seen + ' boss kills are waiting for a stick; the count is capped')
      seen = 64
    }
  })
})()
