// =============================================================================
// WITCH OF INK — Boss Kill Counter, Hyperscaling Damage, Penthesilea Capstone
// =============================================================================
// Counter (persistent NBT, max 200):
//   - Apotheosis bosses (apoth.boss NBT)        : +1
//   - Champions mod bosses (champion NBT)       : +1
//   - Dimensional bosses (hardcoded list)       : +10
//
// Per-counter scaling (applied to ALL outgoing damage, melee + magic):
//   - +0.1% TOTAL damage per counter (multiplicative on final damage)
//   - Caps at +20% (=1.20x) at 200 counters
//
// Per-counter passive defense (flat % incoming-damage reduction):
//   - -0.1% incoming damage per counter, cap -20% at 200
//   - Applied jar-side in WitchOfInkDamageHandler (victim branch of Forge's
//     LivingHurtEvent) -- the same place the outgoing multiplier lives, since
//     KubeJS can't set hurt damage. Restores the ORIGINAL "% reduction" intent
//     (a prior version tracked a reduction stat that never landed as a
//     modifier; an interim build used +armor_toughness instead). A flat
//     multiplicative cut is independent of the ApothicAttributes armor curve
//     (armor/(armor+10)) that now devalues raw toughness.
//
// Capstone (Blessing of Penthesilea) at counter = 200:
//   - +15% max_health (MULTIPLY_BASE)
//   - +10% additive total damage (so cap+capstone = 1.30x damage)
//   - +15% Spellpower-to-Attack-Damage conversion: 15% of the player's
//     ISS spell_power "bonus" (above the 1.0 base) is added as a
//     MULTIPLY_BASE damage modifier. Refreshed once per second.
//   - Permanent buffs (re-applied every 2 min): Haste I, Resistance I,
//     Fire Resistance, Regeneration I.
//
// Origin detection: global.icraft.origin (0_lib_origins.js). The old
// `execute if entity <name>[nbt=...]` probe never parsed, so the counter never
// moved before 2026-10.
// =============================================================================

;(function () {
  // ── Helpers ──────────────────────────────────────────────────────────────
  var isWitchOfInk = function (player) {
    try {
      return global.icraft.origin.is(player, 'origin', 'icraft:witch_of_ink')
    } catch (e) {
      return false
    }
  }

  var warned = {}
  var warnOnce = function (where, e) {
    if (warned[where]) return
    warned[where] = true
    console.warn('[witch_of_ink] ' + where + ' threw (logged once): ' + e)
  }

  var DIMENSIONAL_BOSSES = {
    'minecraft:ender_dragon': 1, 'minecraft:wither': 1,
    'botania:doppleganger': 1,
    'twilightforest:naga': 1, 'twilightforest:lich': 1, 'twilightforest:hydra': 1,
    'twilightforest:ur_ghast': 1, 'twilightforest:knight_phantom': 1,
    'twilightforest:snow_queen': 1, 'twilightforest:alpha_yeti': 1,
    'twilightforest:minoshroom': 1,
    'blue_skies:summoner': 1, 'blue_skies:starlit_crusher': 1,
    'blue_skies:alchemist': 1, 'blue_skies:arachnarch': 1,
    'cataclysm:netherite_monstrosity': 1, 'cataclysm:ender_guardian': 1,
    'cataclysm:ignis': 1, 'cataclysm:the_harbinger': 1,
    'cataclysm:the_leviathan': 1, 'cataclysm:ancient_remnant': 1,
    'meetyourfight:swampjaw': 1, 'meetyourfight:dame_fortuna': 1,
    'meetyourfight:bellringer': 1, 'meetyourfight:rosalyne': 1,
    'theabyss:abyssal_guardian': 1
  }

  var COUNTER_MAX = 200

  // Registry id of the dying entity ('minecraft:wither'). `entity.type` is
  // KubeJS's id string (what death_penalty.js logs in production); a mod entity
  // with its own public `type` member shadows it (Creeper Overhaul), so
  // anything that is not a plain id falls back to the registry lookup.
  var ID_FORM = /^[a-z0-9_.-]+:[a-z0-9_.\/-]+$/
  var entityId = function (entity) {
    var id = ''
    try { id = String(entity.type) } catch (e) {}
    if (ID_FORM.test(id)) return id
    try {
      return String(entity.getType().builtInRegistryHolder().key().location())
    } catch (e2) {
      return id
    }
  }

  // +1 sources. Apotheosis marks a boss with a boolean `apoth.boss` in the
  // entity's FORGE persistent data (ApothBoss: getPersistentData().putBoolean),
  // which scripts reach as `forgePersistentData` -- `entity.persistentData` is
  // KubeJS's own compound and never contains it, and it is not at the root of
  // the entity NBT either (it is saved under ForgeData). The original
  // root-level string / "champion" checks are kept as a last resort; the full
  // entity NBT is serialised at most once per kill.
  var minorBossPoints = function (entity) {
    try {
      var forgeData = entity.forgePersistentData
      if (forgeData && forgeData.contains('apoth.boss')) return 1
    } catch (e) {}
    try {
      var nbt = entity.nbt
      if (!nbt) return 0
      if (nbt.contains('ForgeData') && nbt.getCompound('ForgeData').contains('apoth.boss')) return 1
      if (String(nbt.getString('apoth.boss')) === 'true') return 1
      if (nbt.contains('champion')) return 1
    } catch (e) {}
    return 0
  }

  // The damage side lives in the jar: WitchOfInkDamageHandler reads
  // icraft_witch_ink_counter / icraft_witch_penthesilea from the player's FORGE
  // persistent data (Player.getPersistentData()). `player.persistentData` in a
  // script is a different compound (KubeJS's own, saved as
  // KubeJSPersistentData), so the two keys are mirrored across. KubeJS data
  // survives death and Forge root data does not, hence the re-sync on
  // login + respawn below.
  var syncToJar = function (player) {
    try {
      var data = player.persistentData
      var forgeData = player.forgePersistentData
      forgeData.putInt('icraft_witch_ink_counter', data.getInt('icraft_witch_ink_counter'))
      forgeData.putBoolean('icraft_witch_penthesilea', data.getBoolean('icraft_witch_penthesilea'))
    } catch (e) {
      warnOnce('jar counter sync', e)
    }
  }

  // ── Capstone HP + permanent buffs ────────────────────────────────────────
  var applyPenthesileaHP = function (player) {
    var hp = player.persistentData.getBoolean('icraft_witch_penthesilea') ? 0.15 : 0
    player.modifyAttribute('minecraft:generic.max_health',
      'icraft_witch_penthesilea_hp', hp, 'multiply_base')
  }

  // 2400 ticks = 2 minutes; the tick below renews every 2200 to avoid a blink.
  var applyPenthesileaBuffs = function (player) {
    if (!player.persistentData.getBoolean('icraft_witch_penthesilea')) return
    player.potionEffects.add('minecraft:haste',           2400, 0, false, false)
    player.potionEffects.add('minecraft:resistance',      2400, 0, false, false)
    player.potionEffects.add('minecraft:fire_resistance', 2400, 0, false, false)
    player.potionEffects.add('minecraft:regeneration',    2400, 0, false, false)
  }

  // Defense is now a flat % incoming-damage reduction applied jar-side
  // (WitchOfInkDamageHandler victim branch), NOT an armor_toughness attribute.
  // Existing Witches may still carry the old `icraft_witch_ink_toughness`
  // addition modifier; removeAttribute is idempotent, so stripping it on login
  // needs no guard flag.
  var clearLegacyWitchToughness = function (player) {
    try {
      player.removeAttribute('minecraft:generic.armor_toughness',
        'icraft_witch_ink_toughness')
    } catch (e) {}
  }

  // ── Counter increment on boss kill ───────────────────────────────────────
  EntityEvents.death(icraft.guard('origins/witch_of_ink_progression', 'EntityEvents.death', function (event) {
    try {
      var source = event.source
      if (!source || !source.player) return
      var player = source.player
      if (!isWitchOfInk(player)) return

      var entity = event.entity
      if (!entity) return
      var data = player.persistentData

      var currentCount = data.getInt('icraft_witch_ink_counter') || 0
      if (currentCount >= COUNTER_MAX) return

      var addCount = DIMENSIONAL_BOSSES.hasOwnProperty(entityId(entity)) ? 10 : minorBossPoints(entity)
      if (addCount <= 0) return

      var newCount = Math.min(currentCount + addCount, COUNTER_MAX)
      data.putInt('icraft_witch_ink_counter', newCount)

      var oldTier = Math.floor(currentCount / 10)
      var newTier = Math.floor(newCount / 10)
      if (newTier > oldTier) {
        player.tell('§d[Witch of Ink]§r Your painted collection grows... (' + newCount + '/' + COUNTER_MAX + ')')
      }

      if (newCount >= COUNTER_MAX) {
        data.putBoolean('icraft_witch_penthesilea', true)
        player.tell('§6§l[Blessing of Penthesilea]§r')
        player.tell('§dYour mastery of ink and battle is complete.')
        player.tell('§d+10% damage, +15% SP-to-AD conversion, +15% max HP.')
        player.tell('§dPermanent: Haste I, Resistance I, Fire Resistance, Regen I.')
        player.server.runCommandSilent(
          'title ' + player.username + ' title {"text":"Blessing of Penthesilea","color":"light_purple","bold":true}'
        )
        player.server.runCommandSilent(
          'title ' + player.username + ' subtitle {"text":"Your painted army stands eternal","color":"white"}'
        )
        applyPenthesileaBuffs(player)
      }

      syncToJar(player)
      applyPenthesileaHP(player)
    } catch (e) {
      warnOnce('boss-kill counter', e)
    }
  }))

  // ── Damage in + out are applied in Java (iridescent_tetra_expansion mod) ──
  // KubeJS's EntityEvents.hurt wrapper exposes getDamage() but no settable
  // damage -- `event.damage = X` throws EvaluatorException at runtime on
  // this KubeJS version. BOTH the Witch's outgoing total-damage multiplier
  // (+0.1%/counter + Penthesilea) AND the incoming % damage reduction
  // (-0.1%/counter, cap -20%) are applied by `WitchOfInkDamageHandler` in the
  // mod jar, subscribed directly to Forge's LivingHurtEvent (which has
  // setAmount). Same NBT keys (icraft_witch_ink_counter /
  // icraft_witch_penthesilea) drive both sides; this JS file writes them and
  // mirrors them into the store the jar reads (syncToJar above).

  // ── Penthesilea permanent buffs (renewed every 2 minutes) ────────────────
  global.tick_witchOfInkBuffs = function (event) {
    event.server.players.forEach(function (player) {
      try {
        if (!isWitchOfInk(player)) return
        applyPenthesileaBuffs(player)
      } catch (e) {
        warnOnce('buff tick', e)
      }
    })
  }
  global.registerServerTick('tick_witchOfInkBuffs', 2200, 100)

  // ── Login / respawn state ────────────────────────────────────────────────
  // The HP modifier is transient and potion effects die with the player, so
  // both are restored on login AND respawn (the tick alone left up to ~2 min
  // without the "permanent" buffs after every death).
  var restore = function (event) {
    try {
      var player = event.player
      if (!isWitchOfInk(player)) return
      clearLegacyWitchToughness(player)
      syncToJar(player)
      applyPenthesileaHP(player)
      applyPenthesileaBuffs(player)
    } catch (e) {
      warnOnce('login/respawn restore', e)
    }
  }
  PlayerEvents.loggedIn(icraft.guard('origins/witch_of_ink_progression', 'PlayerEvents.loggedIn', restore))
  PlayerEvents.respawned(icraft.guard('origins/witch_of_ink_progression', 'PlayerEvents.respawned', restore))

  console.log('[IridescentCraft] Witch of Ink progression loaded')
  console.log('  - Boss kill counter (Apotheosis/Champions +1, dimensional +10, cap 200)')
  console.log('  - Damage out: +0.1% per counter (cap +20% at 200, jar LivingHurtEvent)')
  console.log('  - Damage in:  -0.1% per counter (cap -20% at 200, jar LivingHurtEvent)')
  console.log('  - Penthesilea (at 200): +10% additive damage, +15% SP-to-AD conv,')
  console.log('    +15% HP, permanent Haste I + Resistance I + Fire Resist + Regen I')
})()
