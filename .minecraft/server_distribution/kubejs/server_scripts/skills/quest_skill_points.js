// @file kubejs/server_scripts/skills/quest_skill_points.js
// @events PlayerEvents.loggedIn, tick.server
// @live quest-skill-points
// =============================================================================
// Completed quests pay Pufferfish skill points: each quest of the table in
// kubejs/config/icraft/quest_skill_points.json adds its points to one skill tree.
//
// WHY (2026-10-18, the fact-pass fixes, on recommendation, for review)
//   The design gives about 80 to 95 skill points through the quest book, and
//   mob-kill experience the rest (wiki design/master.md, "Quest book chapter
//   structure"). No quest ever paid one: the shipped book's rewards are items,
//   experience and commands, and no script granted points. Points came only from
//   Pufferfish's own experience (kills feed four trees, crafting Engineering,
//   mining Gathering). The table pays 86 over the whole book.
//
// HOW
//   The points live in their own Pufferfish source, icraft:quests, one number per
//   tree. On login and every 30 s for each online player, the script adds up the
//   points of the quests that player has completed (Heracles' own progress, read
//   through global.icraft.heracles of quests/heracles_reconcile.js) and sets each
//   tree's icraft:quests to that sum when it differs. So it is idempotent, it pays
//   quests completed before this script existed, and an edit of the table reaches
//   every player (a quest taken out takes its points back).
//   Points already spent stay spent; Pufferfish shows a tree whose points were
//   taken back below its spending as negative points left until more arrive.
// =============================================================================

;(function () {
  if (!icraft.lib.need('core', 'skills/quest_skill_points') || !icraft.lib.need('ticks', 'skills/quest_skill_points')) return
  var core = global.icraft.core

  var FILE = 'kubejs/config/icraft/quest_skill_points.json'
  var SCHEMA = 1
  var TREES = { warfare: 1, marksman: 1, sorcery: 1, fortitude: 1, gathering: 1, engineering: 1 }

  // ---- the table ------------------------------------------------------------
  // -> { source: 'ns:path', rows: [ { quest, tree, points } ] } or null (said once)
  var readTable = function () {
    var text = null
    try {
      text = JsonIO.readString(FILE)
    } catch (e) {
      console.error('[quest_skill_points] ' + FILE + ' could not be read (' + e + '): no quest pays skill points')
      return null
    }
    if (text === null || text === undefined || String(text) === '' || String(text) === 'null') {
      console.error('[quest_skill_points] ' + FILE + ' does not exist or is empty: no quest pays skill points')
      return null
    }
    var doc = null
    try {
      doc = JSON.parse(String(text))
    } catch (e2) {
      console.error('[quest_skill_points] ' + FILE + ' is not JSON (' + e2 + '): no quest pays skill points')
      return null
    }
    if (!doc || doc.schema !== SCHEMA || !doc.quests || typeof doc.quests !== 'object') {
      console.error('[quest_skill_points] ' + FILE + ' has no schema ' + SCHEMA + ' "quests" object: no quest pays skill points')
      return null
    }
    var rows = []
    var bad = []
    Object.keys(doc.quests).forEach(function (q) {
      var r = doc.quests[q]
      var pts = r ? Number(r.points) : NaN
      if (!r || TREES[r.tree] !== 1 || !(pts >= 1) || Math.floor(pts) !== pts) { bad.push(q); return }
      rows.push({ quest: q, tree: r.tree, points: pts })
    })
    if (bad.length) console.error('[quest_skill_points] ' + bad.length + ' row(s) of ' + FILE + ' skipped (tree not one of ' + Object.keys(TREES).join(' / ') + ', or points not a whole number >= 1): ' + bad.join(', '))
    return { source: String(doc.source || 'icraft:quests'), rows: rows }
  }
  var TABLE = readTable()
  if (!TABLE) return

  // ---- Pufferfish (lazy; the categories exist once the server has loaded its config) ----
  var api = null
  var apiTried = false
  var pufferfish = function () {
    if (apiTried) return api
    apiTried = true
    try {
      var SkillsAPI = Java.loadClass('net.puffish.skillsmod.api.SkillsAPI')
      var RL = Java.loadClass('net.minecraft.resources.ResourceLocation')
      var cats = {}
      var missing = []
      Object.keys(TREES).forEach(function (t) {
        var opt = SkillsAPI.getCategory(new RL('puffish_skills', t))
        if (opt.isPresent()) cats[t] = opt.get()
        else missing.push(t)
      })
      if (missing.length) console.error('[quest_skill_points] Pufferfish has no category puffish_skills:' + missing.join(', puffish_skills:') + '; their quest points are not paid')
      api = { cats: cats, source: new RL(TABLE.source) }
    } catch (e) {
      console.error('[quest_skill_points] the Pufferfish API is not reachable (' + e + '): no quest pays skill points')
      api = null
    }
    return api
  }

  // ---- one player ----------------------------------------------------------
  var sync = function (player) {
    if (!player) return
    var pf = pufferfish()
    if (!pf) return
    var hx = global.icraft && global.icraft.heracles
    if (!hx || !hx.available()) {
      core.warnOnce('quest_skill_points:heracles', '[quest_skill_points] Heracles progress cannot be read (global.icraft.heracles of quests/heracles_reconcile.js): quest skill points wait')
      return
    }
    var due = {}
    var unknown = false
    Object.keys(TREES).forEach(function (t) { due[t] = 0 })
    TABLE.rows.forEach(function (r) {
      var done = hx.isComplete(player, r.quest)
      if (done === null) unknown = true
      else if (done === true) due[r.tree] += r.points
    })
    // A progress read that failed leaves every tree as it is (never takes points back on a failed read).
    if (unknown) return
    var paid = 0
    Object.keys(pf.cats).forEach(function (t) {
      var cat = pf.cats[t]
      var have = Number(cat.getPoints(player, pf.source))
      if (have !== due[t]) {
        cat.setPoints(player, pf.source, due[t])
        paid++
      }
    })
    if (paid > 0) icraft.live.fired('quest-skill-points')
  }

  PlayerEvents.loggedIn(icraft.guard('skills/quest_skill_points', 'PlayerEvents.loggedIn', function (event) {
    sync(event.player)
  }))

  // Every 30 s: catches a quest completed mid-session and a /reload.
  global.registerServerTick('tick_questSkillPoints', 600, 37, function (event) {
    event.server.players.forEach(function (player) { sync(player) })
  })
})()
