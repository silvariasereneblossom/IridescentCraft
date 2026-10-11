// =============================================================================
// IridescentCraft — JustLeveling Aptitude Skills
// File: kubejs/server_scripts/skills/justleveling_skills.js
//
// Passive and triggered skills that unlock at aptitude milestones (5/10/15/20/30).
// Aptitude levels come from global.icraft.aptitude (0_lib_aptitudes.js): the
// fork keeps them in its capability ("justlevelingfork:aptitudes"), NOT under
// ForgeData.justlevelingfork.* where this file used to look -- every read
// returned 0, so nothing below ever fired before 2026-10-10.
//
// Design plan: design/aptitude_skill_plan.md (IridescentCraft-internal repo)
//
// ┌────────────────┬─────┬──────────────────────────────────────────────────────┐
// │ Skill          │ Req │ Effect                                               │
// ├────────────────┼─────┼──────────────────────────────────────────────────────┤
// │ Might          │STR 5│ +1.5 attack damage, +5% max HP                       │
// │ Tough Hide     │CON 5│ +2 max HP flat                                       │
// │ Light Step     │DEX 5│ +5% movement speed                                   │
// │ Padded Frame   │DEF 5│ +1 armor, +1 armor toughness                         │
// │ Mana Spark     │MAG 5│ +20 max mana, +5% spell power                        │
// │ Curious        │INT 5│ +10% XP gain                                         │
// │ Steady Hand    │BLD 5│ +0.5 block reach                                     │
// │ Lucky Charm    │LCK 5│ +1 luck attribute                                    │
// │ Brutal Slash   │STR10│ +10% melee dmg + ~10% armor pen approximation        │
// │ Conservation   │MAG10│ +15% mana regen (approximation of cost reduction)    │
// │ Arcane Effic.  │INT10│ 25% of the levels spent at an enchanting table back  │
// │ Quarryman      │BLD10│ +5% block break speed                                │
// │ Fleet of Foot  │DEX10│ +15% movement speed                                  │
// │ Hearty Meals   │CON10│ Regen I when food >= 18 (well-fed)                   │
// │ Second Wind    │DEF10│ Regen III for 5s when HP < 30% (60s CD)              │
// │ Lucky Strike   │LCK10│ 20% chance for +20% on a melee hit                   │
// │ Cleave         │STR15│ +20% on first swing of combat (5s reset)             │
// │ Steady Breath  │CON15│ Water Breathing pulses underwater; hunger drains 15% │
// │                │     │ slower                                               │
// │ Deadeye        │DEX15│ +10% arrow damage                                    │
// │ Bulwark        │DEF15│ +25% knockback resistance                            │
// │ Mana Blaze     │MAG15│ +15% spell power                                     │
// │ Insight        │INT15│ +20% XP gain                                         │
// │ Thrifty Hands  │BLD15│ 5% chance to get a placed block's item back          │
// │ Fortune's Favor│LCK15│ +1 luck; ~30% chance to re-roll an ore's drops       │
// │ Hemorrhage     │STR20│ Wither I for 4s on melee hit                         │
// │ Overflow       │CON20│ Absorption I when at full HP                         │
// │ Mystic Ward    │MAG20│ DR: 5% + 1% per 20% bonus spell power, cap 20%       │
// │ Mat. Science   │INT20│ 25% of the levels spent at an anvil back             │
// │ Turtle Shield  │DEF20│ +4 armor toughness when not blocking                 │
// │ Rapid Fire     │DEX20│ +15% bow draw speed                                  │
// │ Resourceful    │BLD20│ 8% chance to refund a crafting material              │
// │ Treasure Sense │LCK20│ 5% chance to double-roll entity loot on kill         │
// │ True Strength  │STR30│ Execute non-boss mobs at <= 5% HP on melee hit       │
// │ Iron Stomach   │CON30│ Saturation I, refreshed every 5s                     │
// │ Lion Heart     │DEF30│ DR scales with missing HP (up to 30%)                │
// │ Excitement     │DEX30│ Speed III + Haste II for 10s on kill                 │
// │ Mana Inferno   │MAG30│ +30% spell power (capstone)                          │
// │ Enlightenment  │INT30│ +30% XP gain                                         │
// │ Master Craft   │BLD30│ +12% craft refund (stacks to ~20% with Resourceful)  │
// │ Motherlode     │LCK30│ 0.5% chance for 5x mining drops                      │
// └────────────────┴─────┴──────────────────────────────────────────────────────┘
//
// 2026-10-10 FIRST-RUN PASS (none of this had ever executed; fixed while turning it on):
//   * Attribute passives are written only when they change. KubeJS
//     modifyAttribute = removeModifier + addTransientModifier, i.e. an attribute
//     re-sync to the client every time; the old tick re-wrote ~35 of them per
//     player per pass, including a zero-amount modifier for every skill the
//     player did not have. Now: read the live modifier, touch it only if it is
//     missing / different, REMOVE it when the player does not qualify.
//   * Mana Spark / Conservation / Mana Blaze / Mana Inferno each had a second
//     "_ars_" modifier that pointed at the SAME Iron's attribute (left over from
//     when Ars had its own mana pool; the pool was unified 2026-05-15). It
//     doubled every MAG number in this table (+40 mana, +100% spell power at
//     MAG 30). Dropped: one modifier per attribute, the documented amount.
//   * Mystic Ward read puffish_attributes:magic_damage, a dynamic attribute
//     whose base value is NaN -> the DR was always "NaN > 0" = nothing. It reads
//     irons_spellbooks:spell_power (base 1.0) now.
//   * The attacker-side hurt handler returned on its first line
//     (event.source.entity is not a script-visible member; KubeJS names it
//     getActual()), and compared the damage-type id against source.type, which
//     is vanilla's type() method. Uses source.actual / source.getType().
//   * True Strength called target.kill() from inside the hurt event: a nested
//     hurt, and a death whose damage source is /kill's -- no killer, so the kill
//     handlers (Excitement, Treasure Sense, quest kill signals) never saw the
//     player, and on a first hit there was no player loot or XP either. It now
//     raises THIS hit to a lethal amount, so the kill is the player's. Bosses:
//     the name hints below, the pack roster (0_lib_core.js) and #forge:bosses.
//   * Both hurt handlers skip "secondary" damage (dealt from inside another
//     hurt handler: splash, chain, thorns) and cancelled events, per 0_lib_core.
//   * Excitement was also granted from the hurt handler on a guess that the hit
//     would kill (pre-armor damage): buffs without a kill, two particle bursts
//     with one. The death handler is the single source now.
//   * Resourceful / Master Craftsman hung on PlayerEvents.inventoryChanged,
//     which also fires whenever a tool or armor piece loses durability: mining
//     with a netherite pickaxe paid out netherite scrap. Now ItemEvents.crafted.
//   * Thrifty Hands ran `give <player> <BLOCK id>`: fails for wall torches,
//     gives wheat for a planted seed. It hands back the block's own item, by
//     direct call, without NBT (a placed shulker box must not copy its contents).
//   * Steady Breath applied Saturation for 1.5s out of every 5s "to slow hunger
//     by ~25%". Saturation restores a food point per TICK: that was a full
//     hunger bar forever at CON 15. It is a 15% exhaustion rebate now (the
//     design figure). Iron Stomach (CON 30) is documented as periodic Saturation
//     and is left as written -- which does pin the hunger bar full.
//   * Second Wind fired on a dead player waiting to respawn (0 HP < 30%).
//   * XP refunds: see the section header further down (LinearXP).
//   * Per-hit / per-tick `particle` and `effect` commands are direct calls.
//   * All per-player maps are dropped on logout.
// =============================================================================

;(function () {
  var warned = {}
  var warnOnce = function (where, e) {
    if (warned[where]) return
    warned[where] = true
    try { console.warn('[justleveling_skills] ' + where + ' failed (logged once per script load): ' + e) } catch (ignored) {}
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // APTITUDES — cached resolver, no NBT / commands here
  // ═══════════════════════════════════════════════════════════════════════════
  var NO_APTITUDES = Object.freeze({
    strength: 0, constitution: 0, dexterity: 0, defense: 0,
    intelligence: 0, building: 0, magic: 0, luck: 0, total: 0
  })
  // -> { strength, ..., luck, total }; all zero when the levels cannot be read
  var aptOf = function (player) {
    var a = null
    try { a = global.icraft.aptitude.all(player) } catch (e) { warnOnce('aptitude lookup', e) }
    return a || NO_APTITUDES
  }
  var keyOf = function (player) { return String(player.uuid.toString()) }
  // Session clock for the cooldowns below: the server tick counter (nothing here
  // is persisted). `level.gameTime` is NOT usable -- KubeJS exposes
  // Level.getGameTime() as getTime(), the old name reads undefined -> NaN.
  // Can still be NaN if both accessors fail: every user treats NaN as "cannot
  // tell" and does nothing.
  var clockOf = function (player) {
    var t = Number(player.server.tickCount)
    if (t !== t) t = Number(player.level.time)
    return t
  }
  // Entity type id through the getType() METHOD (KubeJS: the registry id
  // string), not the `type` property, which a public `type` field on some mod
  // entities shadows.
  var typeIdOf = function (entity) {
    try { return String(entity.getType()) } catch (e) { return '' }
  }
  // The shared hit-handler rule of 0_lib_core.js, without depending on it:
  // damage dealt from inside another hurt handler (splash, chain, thorns) is
  // "secondary" and procs nothing.
  var isSecondaryHit = function () {
    try {
      var core = global.icraft.core
      return !!(core && core.secondary && core.secondary())
    } catch (e) { return false }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // JAVA HANDLES
  // ═══════════════════════════════════════════════════════════════════════════
  var ResourceLocation_jl = null
  var ForgeRegistries_jl = null
  var UUID_jl = null
  var PlayerClass_jl = null
  try {
    ResourceLocation_jl = Java.loadClass('net.minecraft.resources.ResourceLocation')
    ForgeRegistries_jl = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
    UUID_jl = Java.loadClass('java.util.UUID')
    PlayerClass_jl = Java.loadClass('net.minecraft.world.entity.player.Player')
  } catch (e) {
    warnOnce('loading the Java handles', e)
  }

  // Attribute objects, resolved once each. null = not registered (mod absent).
  var attrCache = {}
  var attrOf = function (id) {
    if (attrCache.hasOwnProperty(id)) return attrCache[id]
    var attr = null
    try {
      var rl = ResourceLocation_jl.tryParse(id)
      attr = rl ? ForgeRegistries_jl.ATTRIBUTES.getValue(rl) : null
    } catch (e) {
      attr = null
    }
    if (!attr) warnOnce('looking up attribute ' + id, 'it is not in the attribute registry -- skills on it are skipped')
    attrCache[id] = attr || null
    return attrCache[id]
  }

  // The UUID KubeJS gives a modifier id: new UUID(id.hashCode(), id.hashCode())
  // (javap -c LivingEntityKJS.kjs$modifyAttribute). codePointAt, not charCodeAt:
  // charCodeAt hands back a raw java.lang.Character in this Rhino build.
  var kjsModifierUuid = function (id) {
    try {
      var h = 0
      for (var i = 0; i < id.length; i++) h = ((h << 5) - h + id.codePointAt(i)) | 0
      var lo = (h >>> 0).toString(16)
      while (lo.length < 8) lo = '0' + lo
      var half = (h < 0 ? 'ffffffff' : '00000000') + lo      // int sign-extended to a long
      return UUID_jl.fromString(half.substring(0, 8) + '-' + half.substring(8, 12) + '-' + half.substring(12, 16) +
        '-' + half.substring(0, 4) + '-' + half.substring(4, 16))
    } catch (e) {
      warnOnce('modifier uuid for ' + id, e)
      return null
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ATTRIBUTE PASSIVES
  // ═══════════════════════════════════════════════════════════════════════════
  // [ modifier id, attribute, operation, aptitude, required level, amount ]
  // One modifier id = one owner (a second writer under the same id silently
  // replaces the first). Amounts are the design numbers; do not put a second
  // modifier on the same attribute for the same skill (see the _ars_ note above).
  var MOD_ROWS = [
    // STR
    ['icraft_might_dmg',           'minecraft:generic.attack_damage',        'addition',      'strength',      5, 1.5],
    ['icraft_might_hp',            'minecraft:generic.max_health',           'multiply_base', 'strength',      5, 0.05],
    ['icraft_brutal_slash',        'minecraft:generic.attack_damage',        'multiply_base', 'strength',     10, 0.10],
    // CON
    ['icraft_tough_hide',          'minecraft:generic.max_health',           'addition',      'constitution',  5, 2],
    // DEX
    ['icraft_light_step',          'minecraft:generic.movement_speed',       'multiply_base', 'dexterity',     5, 0.05],
    ['icraft_fleet_of_foot',       'minecraft:generic.movement_speed',       'multiply_base', 'dexterity',    10, 0.15],
    // Apothic Attributes' namespace is `attributeslib:`; arrow_damage exists, projectile_damage does not.
    ['icraft_deadeye',             'attributeslib:arrow_damage',             'multiply_base', 'dexterity',    15, 0.10],
    ['icraft_rapid_fire',          'attributeslib:draw_speed',               'multiply_base', 'dexterity',    20, 0.15],
    // DEF
    ['icraft_padded_frame_a',      'minecraft:generic.armor',                'addition',      'defense',       5, 1],
    ['icraft_padded_frame_t',      'minecraft:generic.armor_toughness',      'addition',      'defense',       5, 1],
    ['icraft_bulwark',             'minecraft:generic.knockback_resistance', 'addition',      'defense',      15, 0.25],
    // MAG — the unified mana pool / spell power live on the Iron's attributes;
    // puffish magic_damage is the PuffishSkills damage channel.
    ['icraft_mana_spark_iss_mp',   'irons_spellbooks:max_mana',              'addition',      'magic',         5, 20],
    ['icraft_mana_spark_dmg',      'puffish_attributes:magic_damage',        'multiply_base', 'magic',         5, 0.05],
    ['icraft_mana_spark_iss_dmg',  'irons_spellbooks:spell_power',           'multiply_base', 'magic',         5, 0.05],
    // Conservation of Magic: +15% mana regen stands in for "15% reduced mana cost"
    // (there is no spell-cost attribute).
    ['icraft_conservation_iss',    'irons_spellbooks:mana_regen',            'multiply_base', 'magic',        10, 0.15],
    ['icraft_mana_blaze',          'puffish_attributes:magic_damage',        'multiply_base', 'magic',        15, 0.15],
    ['icraft_mana_blaze_iss',      'irons_spellbooks:spell_power',           'multiply_base', 'magic',        15, 0.15],
    ['icraft_mana_inferno',        'puffish_attributes:magic_damage',        'multiply_base', 'magic',        30, 0.30],
    ['icraft_mana_inferno_iss',    'irons_spellbooks:spell_power',           'multiply_base', 'magic',        30, 0.30],
    // INT — XP gain stacks additively: +10% / +30% / +60%
    ['icraft_curious',             'puffish_attributes:experience',          'multiply_base', 'intelligence',  5, 0.10],
    ['icraft_insight',             'puffish_attributes:experience',          'multiply_base', 'intelligence', 15, 0.20],
    ['icraft_enlightenment',       'puffish_attributes:experience',          'multiply_base', 'intelligence', 30, 0.30],
    // BLD — minecraft:player.block_break_speed is a 1.21 attribute; puffish mining_speed is the 1.20.1 one.
    ['icraft_steady_hand',         'forge:block_reach',                      'addition',      'building',      5, 0.5],
    ['icraft_quarryman',           'puffish_attributes:mining_speed',        'multiply_base', 'building',     10, 0.05],
    // LCK — Fortune's Favor stacks with Lucky Charm (+2 luck at LCK 15)
    ['icraft_lucky_charm',         'minecraft:generic.luck',                 'addition',      'luck',          5, 1],
    ['icraft_fortunes_favor_luck', 'minecraft:generic.luck',                 'addition',      'luck',         15, 1]
  ]
  var makeMod = function (row) {
    return { key: row[0], attr: row[1], op: row[2], apt: row[3], req: row[4], amount: row[5], uuid: kjsModifierUuid(row[0]) }
  }
  var MODS = []
  MOD_ROWS.forEach(function (row) { MODS.push(makeMod(row)) })
  // Turtle Shield (DEF >= 20): +4 armor toughness while NOT blocking
  var TURTLE_SHIELD = makeMod(['icraft_turtle_shield', 'minecraft:generic.armor_toughness', 'addition', 'defense', 20, 4])

  // false once the look-before-write path has failed: plain writes from then on
  var checkedWrites = true

  // Put modifier `m` at `amount` on the player (0 = take it off). Touches the
  // attribute only when the live modifier is not already in that state.
  var setModifier = function (player, m, amount) {
    var attr = attrOf(m.attr)
    if (!attr) return
    if (checkedWrites && m.uuid) {
      try {
        var inst = player.getAttribute(attr)
        if (!inst) return                               // this entity does not carry the attribute
        var cur = inst.getModifier(m.uuid)
        if (!(amount > 0)) {
          if (cur) inst.removeModifier(m.uuid)
          return
        }
        if (cur && Number(cur.getAmount()) === amount) return
        player.modifyAttribute(attr, m.key, amount, m.op)
        return
      } catch (e) {
        checkedWrites = false
        warnOnce('reading live attribute modifiers', e + ' -- falling back to unconditional writes')
      }
    }
    if (amount > 0) player.modifyAttribute(attr, m.key, amount, m.op)
    else player.removeAttribute(attr, m.key)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PER-PLAYER STATE (session memory; every map is dropped on logout)
  // ═══════════════════════════════════════════════════════════════════════════
  var secondWindReady = {}     // uuid -> server tick the 60s cooldown ends
  var lastCombat = {}          // uuid -> server tick of the last hit dealt or taken (Cleave)
  var craftRefundAt = {}       // uuid -> server tick of the last craft-refund roll
  var hungerBudget = {}        // uuid -> 4 * (food + saturation) at the last pass (Steady Breath)

  // Cosmetic only. Direct particle send (no command parse); switched off for
  // the session the first time it fails.
  var particlesOk = true
  var puff = function (level, particle, x, y, z, spread, count, speed) {
    if (!particlesOk) return
    try {
      level.spawnParticles(particle, true, x, y, z, spread, spread, spread, count, speed)
    } catch (e) {
      particlesOk = false
      warnOnce('particles', e)
    }
  }

  // ── Steady Breath, hunger half: 15% slower drain ──
  // Budget = everything the hunger bar holds, in exhaustion units (4 per point
  // of food or saturation). Whatever drained since the last pass, 15% of it is
  // handed back as negative exhaustion, so the next points take longer to go.
  var HUNGER_REBATE = 0.15
  var hungerRebate = function (player, key) {
    var budget = 4 * (Number(player.foodLevel) + Number(player.saturation))
    if (!(budget >= 0) || budget === Infinity) return
    var prev = hungerBudget.hasOwnProperty(key) ? hungerBudget[key] : null
    hungerBudget[key] = budget
    if (prev === null || budget >= prev) return         // first pass, ate, or nothing drained
    var rebate = (prev - budget) * HUNGER_REBATE
    if (rebate > 0 && rebate <= 40) player.addExhaustion(-rebate)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TICK-BASED PASSIVES — every 100 ticks (5 seconds), offset 37
  // ═══════════════════════════════════════════════════════════════════════════
  var tickPlayer = function (player, apt, key, now) {
    var i

    // ── attribute passives (written only on change) ──
    try {
      for (i = 0; i < MODS.length; i++) {
        setModifier(player, MODS[i], apt[MODS[i].apt] >= MODS[i].req ? MODS[i].amount : 0)
      }
      setModifier(player, TURTLE_SHIELD,
        (apt.defense >= TURTLE_SHIELD.req && !player.isBlocking()) ? TURTLE_SHIELD.amount : 0)
    } catch (e) { warnOnce('attribute passives', e) }

    // ── Steady Breath (CON >= 15) ──
    // Underwater: Water Breathing for 30 of every 100 ticks (no icon, no
    // particles) = roughly +40% breath. Always: 15% slower hunger drain.
    try {
      if (apt.constitution >= 15) {
        if (player.isUnderWater()) player.potionEffects.add('minecraft:water_breathing', 30, 0, false, false)
        hungerRebate(player, key)
      } else if (hungerBudget.hasOwnProperty(key)) {
        delete hungerBudget[key]
      }
    } catch (e) { warnOnce('Steady Breath', e) }

    // ── Hearty Meals (CON >= 10): Regen I when food >= 18 ──
    try {
      if (apt.constitution >= 10 && Number(player.foodLevel) >= 18) {
        player.potionEffects.add('minecraft:regeneration', 120, 0, false, false)
      }
    } catch (e) { warnOnce('Hearty Meals', e) }

    // ── Second Wind (DEF >= 10): Regen III for 5s when HP < 30%, 60s cooldown ──
    try {
      if (apt.defense >= 10) {
        var ready = secondWindReady.hasOwnProperty(key) ? secondWindReady[key] : 0
        var maxHp = Number(player.maxHealth)
        // `now < ready - 1200`: the clock stepped back; do not stay locked out
        if (maxHp > 0 && (Number(player.health) / maxHp) < 0.30 && (now >= ready || now < ready - 1200)) {
          player.potionEffects.add('minecraft:regeneration', 100, 2, false, true)
          secondWindReady[key] = now + 1200
          player.tell('§7[§cSecond Wind§7] §fRegeneration III activated!')
        }
      }
    } catch (e) { warnOnce('Second Wind', e) }

    // ── Overflow (CON >= 20): Absorption I (4 HP) while at full HP ──
    try {
      if (apt.constitution >= 20 && Number(player.health) >= Number(player.maxHealth)) {
        player.potionEffects.add('minecraft:absorption', 120, 0, false, false)
      }
    } catch (e) { warnOnce('Overflow', e) }

    // ── Iron Stomach (CON >= 30): Saturation I for 6s, every 5s ──
    // (was `effect give <name> minecraft:saturation 6 0 true`: same effect, no command)
    try {
      if (apt.constitution >= 30) {
        player.potionEffects.add('minecraft:saturation', 120, 0, false, false)
      }
    } catch (e) { warnOnce('Iron Stomach', e) }
  }

  var onSkillsTick = function (event) {
    event.server.players.forEach(function (player) {
      try {
        if (player.spectator || player.creative) return
        if (!(Number(player.health) > 0)) return          // dead, waiting to respawn
        tickPlayer(player, aptOf(player), keyOf(player), clockOf(player))
      } catch (e) { warnOnce('skills tick', e) }
    })
  }
  global.registerServerTick('tick_justlevelingSkills', 100, 37, onSkillsTick)


  // ═══════════════════════════════════════════════════════════════════════════
  // XP REFUND — Arcane Efficiency (INT 10), Materials Science (INT 20)
  // ═══════════════════════════════════════════════════════════════════════════
  // "Enchanting / anvil work costs 25% less XP": when the player's level DROPS
  // while an enchanting-table menu (INT >= 10) or an anvil menu (INT >= 20) is
  // open, a quarter of the levels lost is handed back.
  //
  // Why levels, and why the open menu:
  //   * The old tick polled player.xp (vanilla totalExperience). Under LinearXP
  //     that field is a counter of raw XP earned, and the real wallet is
  //     experienceLevel + a capability. No station moves totalExperience here:
  //     Tax Free Levels turns the anvil / enchanting / Apotheosis level costs
  //     into a direct subtraction from the vanilla progress bar, vanilla rolls
  //     a negative bar over into lost levels, and LinearXP rewrites the bar
  //     from its capability within 10 ticks. What is left of any spend is the
  //     whole levels it knocked off -- so a level drop IS the spend, and a
  //     refund measured this way can never exceed what was really paid.
  //     Details and the wallet maths: 0_lib_aptitudes.js.
  //   * The old test was "an enchanting table / anvil within 4 blocks". Measured
  //     in levels that would also hand back 25-50% of every aptitude level-up
  //     (hundreds of levels each) bought while standing next to one. The open
  //     menu is the station actually being used: EnchantmentMenu covers vanilla,
  //     Apotheosis and Easy Magic; AnvilMenu covers vanilla and Easy Anvils;
  //     Quark's matrix enchanting is matched by its menu type id.
  //   * Drops caused by this pack's own XP calls (mastery tax) go through the
  //     library and are not seen as spends. Death / respawn / login re-sync the
  //     baseline there too.
  // The refund is in levels (fractions included), so the two skills no longer
  // stack on one purchase -- one menu, one skill.
  var EnchantMenuClass = null
  var AnvilMenuClass = null
  try {
    EnchantMenuClass = Java.loadClass('net.minecraft.world.inventory.EnchantmentMenu')
    AnvilMenuClass = Java.loadClass('net.minecraft.world.inventory.AnvilMenu')
  } catch (e) {
    warnOnce('loading the menu classes', e + ' -- XP refunds fall back to menu type ids')
  }
  // Second way to recognise a station: the open menu's registered type id.
  // Covers Quark's matrix enchanting (not an EnchantmentMenu) without loading a
  // Quark class here -- Java.loadClass initialises the class, and a linkage
  // Error from another mod's class cannot be caught in a script.
  var STATION_BY_MENU_ID = {
    'minecraft:enchantment': 'enchant',
    'apotheosis:enchanting_table': 'enchant',
    'easymagic:enchanting': 'enchant',
    'quark:matrix_enchanting': 'enchant',
    'minecraft:anvil': 'anvil',
    'easyanvils:repair': 'anvil'
  }
  var menuTypeIdOf = function (menu) {
    try {
      // getType() throws for a menu without a type (the player's own inventory)
      var typeKey = ForgeRegistries_jl.MENU_TYPES.getKey(menu.getType())
      return typeKey ? String(typeKey) : ''
    } catch (e) { return '' }
  }

  // -> 'enchant' | 'anvil' | null
  var stationOf = function (player) {
    var menu = null
    try { menu = player.openInventory } catch (e) { return null }
    if (!menu) return null
    if (EnchantMenuClass && menu instanceof EnchantMenuClass) return 'enchant'
    if (AnvilMenuClass && menu instanceof AnvilMenuClass) return 'anvil'
    var id = menuTypeIdOf(menu)
    return STATION_BY_MENU_ID.hasOwnProperty(id) ? STATION_BY_MENU_ID[id] : null
  }

  var REFUND_SHARE = 0.25
  var onXpRefundTick = function (event) {
    event.server.players.forEach(function (player) {
      try {
        // Poll everyone, always: this is what keeps the baseline current.
        var spent = global.icraft.aptitude.xp.pollSpend(player)
        if (!(spent > 0)) return
        if (player.creative || player.spectator) return
        if (!(Number(player.health) > 0)) return
        var station = stationOf(player)
        if (!station) return
        var apt = aptOf(player)
        var label = null
        if (station === 'enchant' && apt.intelligence >= 10) label = 'Arcane Efficiency'
        if (station === 'anvil' && apt.intelligence >= 20) label = 'Materials Science'
        if (!label) return
        var back = global.icraft.aptitude.xp.give(player, spent * REFUND_SHARE)
        if (back > 0) {
          player.tell('§b[' + label + '] §f' + back.toFixed(2) + ' of ' + spent +
            (spent === 1 ? ' level' : ' levels') + ' refunded')
        }
      } catch (e) { warnOnce('XP refund tick', e) }
    })
  }
  global.registerServerTick('tick_aptitudeXpRefund', 5, 3, onXpRefundTick)


  // ═══════════════════════════════════════════════════════════════════════════
  // CRAFT REFUND — Resourceful (BLD 20), Master Craftsman (BLD 30)
  // ═══════════════════════════════════════════════════════════════════════════
  // On a real craft (ItemEvents.crafted = Forge ItemCraftedEvent), for crafted
  // items on the list below: 8% to hand back one material, plus an independent
  // 12% at BLD 30 (~19% combined, at most 2 items per craft). One roll per
  // player per 2 seconds, so a shift-click batch is one roll.
  // The refunded material is guessed from the crafted item's id (the list and
  // the picker are unchanged from the original).
  var craftedPatterns = [
    '_sword', '_pickaxe', '_axe', '_shovel', '_hoe',
    '_helmet', '_chestplate', '_leggings', '_boots',
    '_ingot', '_nugget', 'planks', 'stick', 'torch',
    'rail', 'piston', 'hopper', 'dropper', 'dispenser',
    'comparator', 'repeater', 'observer', 'ladder', 'fence',
    'door', 'trapdoor', 'button', 'pressure_plate', 'lever',
    'bucket', 'shears', 'compass', 'clock', 'spyglass',
    'shield', 'bow', 'crossbow', 'fishing_rod',
    'minecart', 'boat', 'lead', 'name_tag'
  ]

  var pickRefundMaterial = function (itemId) {
    var id = String(itemId || '')
    if (id.indexOf('iron') >= 0 || id.indexOf('chain') >= 0)
      return ['minecraft:iron_ingot', 'minecraft:iron_nugget']
    if (id.indexOf('gold') >= 0)
      return ['minecraft:gold_ingot', 'minecraft:gold_nugget']
    if (id.indexOf('diamond') >= 0) return ['minecraft:diamond']
    if (id.indexOf('netherite') >= 0) return ['minecraft:netherite_scrap']
    if (id.indexOf('copper') >= 0) return ['minecraft:copper_ingot']
    if (id.indexOf('wood') >= 0 || id.indexOf('planks') >= 0 ||
        id.indexOf('oak') >= 0 || id.indexOf('birch') >= 0 ||
        id.indexOf('spruce') >= 0 || id.indexOf('jungle') >= 0 ||
        id.indexOf('acacia') >= 0 || id.indexOf('mangrove') >= 0 ||
        id.indexOf('cherry') >= 0 || id.indexOf('bamboo') >= 0)
      return ['minecraft:stick', 'minecraft:oak_planks']
    if (id.indexOf('stone') >= 0 || id.indexOf('cobble') >= 0)
      return ['minecraft:cobblestone']
    if (id.indexOf('redstone') >= 0 || id.indexOf('comparator') >= 0 ||
        id.indexOf('repeater') >= 0 || id.indexOf('piston') >= 0)
      return ['minecraft:redstone']
    return [
      'minecraft:iron_nugget', 'minecraft:string', 'minecraft:flint',
      'minecraft:gold_nugget', 'minecraft:redstone', 'minecraft:stick'
    ]
  }

  var giveRefundMaterial = function (player, itemId) {
    var pool = pickRefundMaterial(itemId)
    var pick = pool[Math.floor(Math.random() * pool.length)]
    player.give(Item.of(pick))
  }

  ItemEvents.crafted(function (event) {
    try {
      var player = event.player
      if (!player || player.creative || player.spectator) return
      var item = event.item
      if (!item || item.isEmpty()) return
      var itemId = String(item.id || '')
      if (!itemId) return
      var isCrafted = false
      for (var i = 0; i < craftedPatterns.length; i++) {
        if (itemId.indexOf(craftedPatterns[i]) >= 0) { isCrafted = true; break }
      }
      if (!isCrafted) return

      var apt = aptOf(player)
      if (apt.building < 20) return

      var key = keyOf(player)
      var now = clockOf(player)
      if (now !== now) return                              // no clock: the cooldown cannot be enforced
      if (craftRefundAt.hasOwnProperty(key)) {
        var since = now - craftRefundAt[key]
        if (since >= 0 && since < 40) return               // 2s cooldown
      }
      craftRefundAt[key] = now

      var triggered = false
      // Resourceful (BLD >= 20): 8% roll
      if (Math.random() < 0.08) {
        giveRefundMaterial(player, itemId)
        triggered = true
      }
      // Master Craftsman (BLD >= 30): an independent 12% roll on top
      if (apt.building >= 30 && Math.random() < 0.12) {
        giveRefundMaterial(player, itemId)
        triggered = true
      }
      if (triggered) {
        puff(player.level, 'minecraft:happy_villager', player.x, player.y + 1, player.z, 0.3, 6, 0)
      }
    } catch (e) { warnOnce('craft refund', e) }
  })


  // ═══════════════════════════════════════════════════════════════════════════
  // COMBAT
  // ═══════════════════════════════════════════════════════════════════════════
  // Raw LivingHurtEvent through the pack's DamageModifierRegistry (2026-05-15).
  // DamageSource accessors under their KubeJS script names:
  //   getEntity() -> getActual()   (`source.entity` is undefined)
  //   getMsgId()  -> getType()     (`source.type` is vanilla's type() method)
  var attackerOf = function (source) {
    if (!source) return null
    var a = source.actual
    if (a === undefined) a = source.entity
    return a || null
  }
  var msgIdOf = function (source) {
    try { return String(source.getType()) } catch (e) { return '' }
  }
  // 'player' = a player's own swing (incl. sweep). Projectiles and spells carry other ids.
  var isMeleeId = function (id) {
    if (id.indexOf('arrow') >= 0 || id.indexOf('trident') >= 0 ||
        id.indexOf('fireball') >= 0 || id.indexOf('thrown') >= 0) return false
    return id === 'player' || id === 'mob' || id === 'generic'
  }

  // True Strength spares bosses: these name hints (the original list), the
  // pack's own boss roster (global.icraft.core.isBoss, when that library is
  // loaded) and every entity type in #forge:bosses (read once per script load,
  // after the datapack tags exist).
  var BOSS_HINTS = ['dragon', 'wither', 'warden', 'elder_guardian', 'evoker', 'ravager', 'champion']
  var bossTagIds = null
  var bossIdsFromTag = function () {
    if (bossTagIds) return bossTagIds
    bossTagIds = {}
    try {
      var tags = ForgeRegistries_jl.ENTITY_TYPES.tags()
      var it = tags.getTag(tags.createTagKey(ResourceLocation_jl.tryParse('forge:bosses'))).iterator()
      while (it.hasNext()) {
        var typeKey = ForgeRegistries_jl.ENTITY_TYPES.getKey(it.next())
        if (typeKey) bossTagIds[String(typeKey)] = true
      }
    } catch (e) {
      warnOnce('reading #forge:bosses', e + ' -- True Strength uses the name hints only')
    }
    return bossTagIds
  }
  var isBoss = function (target) {
    var type = typeIdOf(target)
    if (!type) return true                               // cannot identify it: do not execute it
    for (var i = 0; i < BOSS_HINTS.length; i++) {
      if (type.indexOf(BOSS_HINTS[i]) >= 0) return true
    }
    try {
      var core = global.icraft.core
      if (core && core.isBoss && core.isBoss(type) === true) return true
    } catch (e) {}
    return bossIdsFromTag()[type] === true
  }

  // A damage figure this file is willing to write back.
  var usable = function (n) { return n >= 0 && n !== Infinity }

  var DR_jl = null
  try {
    DR_jl = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
  } catch (e) {
    warnOnce('loading DamageModifierRegistry', e + ' -- the combat skills are off')
  }

  if (DR_jl && PlayerClass_jl) {
    // ─────────────────────────────────────────────────────────────────────────
    // DEALING DAMAGE (melee): Cleave (STR 15), Brutal Slash (STR 10),
    // Hemorrhage (STR 20), True Strength (STR 30), Lucky Strike (LCK 10)
    // Nothing here deals damage or kills by itself: it only changes the amount
    // of the hit being processed, so the handler cannot re-enter.
    // ─────────────────────────────────────────────────────────────────────────
    DR_jl.register('icraft.justleveling.1', function (event) {
      try {
        if (isSecondaryHit() || event.isCanceled()) return
        var source = event.source
        var player = attackerOf(source)
        if (!(player instanceof PlayerClass_jl)) return
        var target = event.entity
        if (!target || target === player) return
        if (target instanceof PlayerClass_jl) return        // no bleed / execute in PvP
        if (!isMeleeId(msgIdOf(source))) return

        var original = Number(event.amount)
        if (!usable(original)) return
        var amount = original
        var apt = aptOf(player)
        var key = keyOf(player)
        var now = clockOf(player)
        var executed = false

        // ── Cleave (STR >= 15): first swing of combat does +20% ──
        // "First swing" = no hit dealt or taken in the last 100 ticks (5s).
        if (apt.strength >= 15) {
          var idle = lastCombat.hasOwnProperty(key) ? (now - lastCombat[key]) : 101
          if (idle > 100 || idle < 0) {
            amount *= 1.20
            puff(target.level, 'minecraft:crit', target.x, target.y + 1, target.z, 0.3, 6, 0.3)
          }
        }
        // Stamped on every melee hit dealt, whatever the STR level (shared with
        // the taking-damage handler below).
        lastCombat[key] = now

        // ── Brutal Slash (STR >= 10): ignore ~10% of target armor ──
        // Approximation: +0.4% damage per armor point, capped at +5%.
        if (apt.strength >= 10) {
          var armorAttr = attrOf('minecraft:generic.armor')
          var armor = armorAttr ? Number(target.getAttributeTotalValue(armorAttr)) : 0
          if (armor > 0) amount *= (1 + Math.min(0.05, armor * 0.004))
        }

        // ── Hemorrhage (STR >= 20): Wither I for 4 seconds ──
        if (apt.strength >= 20) {
          try {
            target.potionEffects.add('minecraft:wither', 80, 0, false, false)
          } catch (e2) { warnOnce('Hemorrhage', e2) }
        }

        // ── True Strength (STR >= 30): execute at <= 5% HP ──
        // If this hit would leave a non-boss at 5% of its max health or less
        // (estimated before armor, as before), the hit itself becomes lethal.
        if (apt.strength >= 30) {
          var hp = Number(target.health)
          var maxHp = Number(target.maxHealth)
          if (hp > 0 && maxHp > 0 && usable(hp) && usable(maxHp)) {
            var remaining = hp - amount
            if (remaining > 0 && remaining <= maxHp * 0.05 && !isBoss(target)) {
              var shield = Number(target.absorptionAmount)
              if (!(shield > 0) || shield === Infinity) shield = 0
              // far past any armor / protection reduction, still a sane float
              var lethal = (hp + shield) * 100 + 100
              if (usable(lethal) && lethal > amount) amount = lethal
              executed = true
              puff(target.level, 'minecraft:sweep_attack', target.x, target.y + 1, target.z, 0.5, 3, 0)
            }
          }
        }

        // ── Lucky Strike (LCK >= 10): 20% chance to deal 120% ──
        if (!executed && apt.luck >= 10 && Math.random() < 0.20) {
          amount *= 1.20
          puff(target.level, 'minecraft:crit', target.x, target.y + 1, target.z, 0.3, 8, 0.4)
        }

        if (amount !== original && usable(amount)) event.amount = amount
      } catch (e) { warnOnce('hurt handler (dealing)', e) }
    })

    // ─────────────────────────────────────────────────────────────────────────
    // TAKING DAMAGE: Lion Heart (DEF 30), Mystic Ward (MAG 20), Cleave stamp
    // ─────────────────────────────────────────────────────────────────────────
    DR_jl.register('icraft.justleveling.2', function (event) {
      try {
        if (isSecondaryHit() || event.isCanceled()) return
        var player = event.entity
        if (!(player instanceof PlayerClass_jl)) return

        // Taking a hit also resets Cleave's "first swing" window.
        lastCombat[keyOf(player)] = clockOf(player)

        var apt = aptOf(player)
        if (apt.defense < 30 && apt.magic < 20) return
        var original = Number(event.amount)
        if (!usable(original)) return
        var amount = original

        // ── Lion Heart (DEF >= 30): 0% DR at full HP, up to 30% near 0 HP ──
        if (apt.defense >= 30) {
          var maxHp = Number(player.maxHealth)
          if (maxHp > 0) {
            var missing = 1 - Number(player.health) / maxHp
            if (!(missing > 0)) missing = 0
            if (missing > 1) missing = 1
            var lion = missing * 0.30
            if (lion > 0.01) amount *= (1 - lion)
          }
        }

        // ── Mystic Ward (MAG >= 20): min(20%, 5% + 1% per 20% bonus spell power) ──
        // Bonus spell power = irons_spellbooks:spell_power above its base 1.0.
        if (apt.magic >= 20) {
          var spAttr = attrOf('irons_spellbooks:spell_power')
          var sp = spAttr ? Number(player.getAttributeTotalValue(spAttr)) : 1
          var bonus = (sp > 1 && sp !== Infinity) ? (sp - 1) : 0
          // + 1e-6: a bonus of exactly 20% is 1.2 - 1 = 0.19999999999999996 in floating point
          var ward = Math.min(0.20, 0.05 + 0.01 * Math.floor(bonus / 0.20 + 1e-6))
          amount *= (1 - ward)
        }

        if (amount !== original && usable(amount)) event.amount = amount
      } catch (e) { warnOnce('hurt handler (taking)', e) }
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // KILLS — Excitement (DEX 30), Treasure Sense (LCK 20)
  // ═══════════════════════════════════════════════════════════════════════════
  EntityEvents.death(function (event) {
    try {
      var target = event.entity
      if (!target || target.player) return
      var source = event.source
      if (!source) return
      var player = source.player                           // the killer, also for arrows / thrown
      if (!player) return
      var apt = aptOf(player)

      // ── Excitement (DEX >= 30): Speed III + Haste II for 10s on kill ──
      if (apt.dexterity >= 30) {
        try {
          player.potionEffects.add('minecraft:speed', 200, 2, false, true)
          player.potionEffects.add('minecraft:haste', 200, 1, false, true)
          puff(player.level, 'minecraft:happy_villager', player.x, player.y + 1, player.z, 0.5, 8, 0)
        } catch (e2) { warnOnce('Excitement', e2) }
      }

      // ── Treasure Sense (LCK >= 20): 5% chance to double-roll mob loot ──
      // Re-rolls the entity's loot table once at the death position. A kill
      // command is fine here: it runs on one kill in twenty.
      if (apt.luck >= 20 && Math.random() < 0.05) {
        var lootTable = ''
        try { lootTable = String(target.getLootTable()) } catch (e3) { lootTable = '' }
        if (lootTable.indexOf(':') <= 0) {
          // fallback: the conventional <modid>:entities/<path>
          var typeId = typeIdOf(target)
          var colon = typeId.indexOf(':')
          lootTable = colon > 0 ? (typeId.substring(0, colon) + ':entities/' + typeId.substring(colon + 1)) : ''
        }
        if (lootTable) {
          var x = Math.floor(Number(target.x))
          var y = Math.floor(Number(target.y))
          var z = Math.floor(Number(target.z))
          player.server.runCommandSilent('loot spawn ' + x + ' ' + (y + 0.5) + ' ' + z + ' loot ' + lootTable)
          puff(target.level, 'minecraft:totem_of_undying', x + 0.5, y + 1, z + 0.5, 0.4, 12, 0.1)
          player.tell('§6[Treasure Sense] §fDouble drops!')
        }
      }
    } catch (e) { warnOnce('death handler', e) }
  })


  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCKS — Thrifty Hands (BLD 15), Fortune's Favor (LCK 15), Motherlode (LCK 30)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Thrifty Hands (BLD >= 15): 5% chance to get the placed block's item back ──
  // The block stays placed. block.item is the block's pick-block stack (wall
  // torch -> torch, wheat crop -> seeds, fire -> nothing); only its ID is used,
  // so a container's contents are never copied.
  BlockEvents.placed(function (event) {
    try {
      var player = event.player
      if (!player || player.creative || player.spectator) return
      if (aptOf(player).building < 15) return
      if (Math.random() >= 0.05) return
      var stack = event.block.item
      if (!stack || stack.isEmpty()) return
      var itemId = String(stack.id || '')
      if (!itemId || itemId === 'minecraft:air') return
      player.give(Item.of(itemId))
    } catch (e) { warnOnce('Thrifty Hands', e) }
  })

  // ── Motherlode (LCK >= 30): 0.5% chance for 5x mining drops ──
  // ── Fortune's Favor (LCK >= 15): ~30% chance to re-roll an ore's drops ──
  // Both re-roll the block's loot table (<modid>:blocks/<path>) at the block:
  // 4 extra rolls for Motherlode, 1 for Fortune's Favor; a missing table is a
  // silent no-op. Ore = id contains "ore", or ancient_debris (heuristic).
  // Independent of each other. These are rare, so the loot command stays.
  BlockEvents.broken(function (event) {
    try {
      var player = event.player
      if (!player || player.creative || player.spectator) return
      var apt = aptOf(player)
      if (apt.luck < 15) return
      var block = event.block
      var blockId = String(block.id || '')
      var colon = blockId.indexOf(':')
      if (colon <= 0) return
      var lootTable = blockId.substring(0, colon) + ':blocks/' + blockId.substring(colon + 1)
      var x = Number(block.x)
      var y = Number(block.y)
      var z = Number(block.z)
      var spawnAt = 'loot spawn ' + x + ' ' + (y + 0.5) + ' ' + z + ' loot ' + lootTable
      var server = player.server

      if (apt.luck >= 30 && Math.random() < 0.005) {
        for (var i = 0; i < 4; i++) server.runCommandSilent(spawnAt)
        puff(player.level, 'minecraft:totem_of_undying', x + 0.5, y + 1, z + 0.5, 0.5, 24, 0.2)
        player.tell('§6[Motherlode] §lJACKPOT! §r§6×5 drops!')
      }

      var isOre = (blockId.indexOf('ore') >= 0) || (blockId.indexOf('ancient_debris') >= 0)
      if (isOre && Math.random() < 0.30) {
        server.runCommandSilent(spawnAt)
        puff(player.level, 'minecraft:happy_villager', x + 0.5, y + 1, z + 0.5, 0.3, 6, 0.1)
      }
    } catch (e) { warnOnce('mining bonus', e) }
  })


  // ═══════════════════════════════════════════════════════════════════════════
  // HOUSEKEEPING
  // ═══════════════════════════════════════════════════════════════════════════
  var forget = function (player) {
    try {
      var key = keyOf(player)
      delete secondWindReady[key]
      delete lastCombat[key]
      delete craftRefundAt[key]
      delete hungerBudget[key]
    } catch (e) {}
  }
  PlayerEvents.loggedOut(function (event) { forget(event.player) })
  // New entity after a death: the hunger bar was reset, not drained.
  PlayerEvents.respawned(function (event) {
    try { delete hungerBudget[keyOf(event.player)] } catch (e) {}
  })
  // The XP-refund tick used to keep its baseline in persistentData; unused now.
  PlayerEvents.loggedIn(function (event) {
    try {
      var pd = event.player.persistentData
      if (pd && pd.contains('icraft_apt_xp_last')) pd.remove('icraft_apt_xp_last')
    } catch (e) {}
  })

  ServerEvents.loaded(function (event) {
    console.log('[IridescentCraft] JustLeveling Aptitude Skills loaded -- ' + (MODS.length + 1) +
      ' attribute modifiers, 5 timed effects, 5 melee + 2 defensive hooks, kill / craft / block / XP-refund hooks' +
      ' (aptitudes via global.icraft.aptitude)')
    console.log('  Tier 5 : Might, Tough Hide, Light Step, Padded Frame, Mana Spark, Curious, Steady Hand, Lucky Charm')
    console.log('  Tier 10: Brutal Slash, Hearty Meals, Fleet of Foot, Second Wind, Conservation of Magic, Arcane Efficiency, Quarryman, Lucky Strike')
    console.log('  Tier 15: Cleave, Steady Breath, Deadeye, Bulwark, Mana Blaze, Insight, Thrifty Hands, Fortune\'s Favor')
    console.log('  Tier 20: Hemorrhage, Overflow, Rapid Fire, Turtle Shield, Mystic Ward, Materials Science, Resourceful, Treasure Sense')
    console.log('  Tier 30: True Strength, Iron Stomach, Excitement, Lion Heart, Mana Inferno, Enlightenment, Master Craftsman, Motherlode')
  })
})()
