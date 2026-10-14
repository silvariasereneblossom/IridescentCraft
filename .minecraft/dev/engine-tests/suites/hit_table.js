// =============================================================================
// HIT TABLE -- the handlers that sit, or sat, straight on the Java damage registry
// (decision list entry 45; lint rule DIRECT-HURT-REG), run on the mocks with the
// pack's own scripts: who attacks (class, origin, weapon), a primary hit and a
// secondary hit, what each handler did to the amount in the order they ran, and
// what the hit left behind (health, mana, effects, stamps, armour durability).
//
// The rows are held to suites/hit_table.golden.js, recorded BEFORE any of these
// handlers was moved onto the shared dispatcher (0_lib_core.js). A handler moves
// only while every row stays what it was: where a handler is registered must not
// change a number. The same rows on a full-pack server, before and after:
// internal dev/hit-table-d-2026-10-13/. Since 2026-10-14 rows change on purpose, one ruling at a time
// (decision list Part 9): the golden file's header names each ruling and the rows it changed.
//
// To record again (only when a ROW is added, or a handler's behaviour is changed
// on purpose, with the decision that allows it):
//     python .minecraft/dev/engine-tests/lib/hit/record.py
// and read the diff of the golden file: every changed line is a changed number.
//
// Not here: the two Vorpal decapitations (startup scripts; their keys are stood in
// for, so the walk of the LATE map is the game's) and what other mods' listeners do.
// =============================================================================
var HT_ROWS = []
var HT_row = function (name, fn) {
  var value
  T_rand(0.999)                       // no roll of a script succeeds, unless the row says otherwise
  try { value = String(fn()) } catch (e) { value = 'THREW ' + String(e).split('\n')[0] }
  T_rand()
  T_tick(1)                           // the next row is another tick (i-frames, same-tick stamps)
  HT_ROWS.push([name, value])
}

// ---- the order: one line that must never change ---------------------------------------------------
// Read off the registry's own maps on a full-pack server on 2026-10-13 (the probe's first two lines),
// with the dispatcher's block written `core`. Wherever a handler is registered, this is its place.
// Changed only by a ruling: icraft.death_penalty.armor_clamp left it on 2026-10-14 (ruling 14: removed).
var HT_ORDER = 'icraft.origin.blazeborn.take , icraft.justleveling.1 , icraft.justleveling.2 , core , ' +
  'icraft.deathskin_undead_bonus , icraft.origin.blazeborn.deal , ' +
  'icraft.battlemage_arcane_cleave , icraft.unique_tier_buff , icraft.class_passives_h6 , icraft.origin.enderian.shift' +
  ' | late: icraft.magic_enchants_decap , icraft.tmb_plain_bow_effects , icraft.vorpal_rework_decap'
T_run('the order every handler runs in is the order the Java registry walked them in', function () {
  ok(T_LOAD_ERRORS.length === 0, 'every script of the suite loaded' + (T_LOAD_ERRORS.length ? ': ' + T_LOAD_ERRORS.join(' | ') : ''))
  var order = HT_totalOrder()
  ok(order === HT_ORDER, 'the walk of the two maps, each dispatcher entry replaced by what it runs' + (order === HT_ORDER ? '' : '\n      got  ' + order + '\n      want ' + HT_ORDER))
  var plan = (typeof HT_core.hurtPlan === 'function') ? HT_core.hurtPlan() : [], direct = String(T.normalKeys()).split(',').concat(String(T.lateKeys()).split(','))
  var both = []
  for (var i = 0; i < plan.length; i++) if (direct.indexOf(plan[i].key) >= 0) both.push(plan[i].key)
  ok(both.length === 0, 'no handler is on the dispatcher AND still an entry of its own' + (both.length ? ': ' + both.join(', ') : ''))
  ok(T.size(T.sget('mk.W$DamageModifierRegistry', 'HANDLERS')) < 12, 'the NORMAL map holds fewer than twelve keys (' + T.size(T.sget('mk.W$DamageModifierRegistry', 'HANDLERS')) +
    '): with twelve it doubles its table and walks every key in another order')
})

// ---- the rows -------------------------------------------------------------------------------------
;(function () {
  var NETHER = 'minecraft:the_nether'
  var melee = HT_src.melee
  var mob = function (dim) { return HT_src.mob(HT_zombie(dim)) }
  var arrowBy = function (p, bow) { return HT_src.arrow(HT_arrow(p, bow), p) }
  var T2 = function () { return new MStack('simplyswords:tempest', 1) }
  var BROKEN = function () { return HT_sword('minecraft:iron_sword', 250, 249, true) }
  var BLAZE = { tags: ['icraft_blazeborn'], awakened: true }
  var STR30 = { strength: 30, luck: 10 }
  var DEF30 = { defense: 30, magic: 20 }
  var BM = { cls: 'icraft:battlemage', mana: 100, sp: 1.0 }
  var H6 = ['icraft_berserker_lastHitTick', 'icraft_samurai_firstStrikeTick', 'icraft_wanderer_wpn_sword', 'icraft_wanderer_wpn_fist']
  var BOW_FX = ['minecraft:blindness', 'minecraft:weakness', 'minecraft:levitation', 'minecraft:wither', 'minecraft:slowness']
  var plus = function (o, more) { var c = {}, k; for (k in o) c[k] = o[k]; for (k in more) c[k] = more[k]; return c }

  // -- no class, no origin, no weapon
  HT_row('plain.primary', function () { return HT_post(HT_zombie(), melee(HT_player({})), 10) })
  HT_row('plain.primary.real', function () { return HT_real(HT_zombie(), melee(HT_player({})), 10) })
  HT_row('plain.secondary', function () { return HT_secondary(HT_zombie(), 'player', 10, HT_player({})) })
  HT_row('plain.mob-on-player', function () { return HT_post(HT_player({}), mob(), 10) })

  // -- origins/origin_effects: Blazeborn deal
  HT_row('blazeborn.deal.overworld-not-awakened.primary', function () { return HT_post(HT_zombie(), melee(HT_player({ tags: ['icraft_blazeborn'] })), 10) })
  HT_row('blazeborn.deal.awakened.primary', function () { return HT_post(HT_zombie(), melee(HT_player(BLAZE)), 10) })
  HT_row('blazeborn.deal.awakened.primary.real', function () { return HT_real(HT_zombie(), melee(HT_player(BLAZE)), 10) })
  HT_row('blazeborn.deal.awakened.secondary', function () { return HT_secondary(HT_zombie(), 'player', 10, HT_player(BLAZE)) })
  HT_row('blazeborn.deal.nether-not-awakened.primary', function () { return HT_post(HT_zombie(NETHER), melee(HT_player({ dim: NETHER, tags: ['icraft_blazeborn'] })), 10) })
  HT_row('blazeborn.deal.awakened.arrow.primary', function () { return HT_post(HT_zombie(), arrowBy(HT_player(BLAZE), null), 10) })
  HT_row('blazeborn.deal.awakened.broken-sword.primary', function () { return HT_post(HT_zombie(), melee(HT_player(plus(BLAZE, { hand: BROKEN() }))), 10) })

  // -- origins/origin_effects: Blazeborn take
  HT_row('blazeborn.take.awakened.primary', function () { return HT_post(HT_player(BLAZE), mob(), 10) })
  HT_row('blazeborn.take.nether-not-awakened.primary', function () { return HT_post(HT_player({ dim: NETHER, tags: ['icraft_blazeborn'] }), mob(NETHER), 10) })
  HT_row('blazeborn.take.overworld-not-awakened.primary', function () { return HT_post(HT_player({ tags: ['icraft_blazeborn'] }), mob(), 10) })
  HT_row('blazeborn.take.awakened.primary.real', function () { return HT_real(HT_player(BLAZE), mob(), 10) })
  HT_row('blazeborn.take.awakened.secondary', function () { return HT_nestedPost(HT_player(BLAZE), mob(), 10) })
  HT_row('blazeborn.take.awakened.secondary.real', function () { return HT_secondary(HT_player(BLAZE), 'thorns', 10, HT_zombie()) })
  HT_row('blazeborn.take.awakened.fall', function () { return HT_post(HT_player(BLAZE), HT_src.fall(), 10) })

  // -- origins/origin_effects: Enderian shift
  HT_row('enderian.shift.live.primary', function () { return HT_post(HT_zombie(), melee(HT_player({ tags: ['icraft_enderian'], shift: true })), 10) })
  HT_row('enderian.shift.no-buff.primary', function () { return HT_post(HT_zombie(), melee(HT_player({ tags: ['icraft_enderian'] })), 10) })
  HT_row('enderian.shift.live.secondary', function () { return HT_secondary(HT_zombie(), 'player', 10, HT_player({ tags: ['icraft_enderian'], shift: true })) })
  HT_row('enderian.shift.live.broken-sword.primary', function () { return HT_post(HT_zombie(), melee(HT_player({ tags: ['icraft_enderian'], shift: true, hand: BROKEN() })), 10) })

  // -- skills/justleveling_skills: dealing
  HT_row('justleveling.1.str30.first-swing.primary', function () {
    var z = HT_zombie()
    return HT_post(z, melee(HT_player({ apt: STR30 })), 10) + ' | victim: ' + HT_effects(z, ['minecraft:wither'])
  })
  HT_row('justleveling.1.str30.second-swing.primary', function () {
    var p = HT_player({ apt: STR30 })
    HT_post(HT_zombie(), melee(p), 10)
    return HT_post(HT_zombie(), melee(p), 10)
  })
  HT_row('justleveling.1.str30.execute.primary', function () { return HT_post(HT_zombie(), melee(HT_player({ apt: STR30 })), 16.2) })
  HT_row('justleveling.1.str30.lucky-strike.primary', function () {
    T_rand(0.0)
    return HT_post(HT_zombie(), melee(HT_player({ apt: STR30 })), 10)
  })
  HT_row('justleveling.1.str30.arrow.primary', function () { return HT_post(HT_zombie(), arrowBy(HT_player({ apt: STR30 }), null), 10) })
  HT_row('justleveling.1.str30.secondary', function () {
    var z = HT_zombie()
    return HT_secondary(z, 'player', 10, HT_player({ apt: STR30 })) + ' | victim: ' + HT_effects(z, ['minecraft:wither'])
  })
  HT_row('justleveling.1.str30.first-swing.primary.real', function () { return HT_real(HT_zombie(), melee(HT_player({ apt: STR30 })), 10) })
  HT_row('justleveling.1.str30.broken-sword.primary', function () {
    var z = HT_zombie()
    return HT_post(z, melee(HT_player({ apt: STR30, hand: BROKEN() })), 10) + ' | victim: ' + HT_effects(z, ['minecraft:wither'])
  })

  // -- skills/justleveling_skills: taking
  HT_row('justleveling.2.def30-mag20.half-health.primary', function () { return HT_post(HT_player({ apt: DEF30, health: 10 }), mob(), 10) })
  HT_row('justleveling.2.def30-mag20.full-health.primary', function () { return HT_post(HT_player({ apt: DEF30 }), mob(), 10) })
  HT_row('justleveling.2.def30-mag20.spell-power.primary', function () { return HT_post(HT_player({ apt: DEF30, health: 10, sp: 1.0 }), mob(), 10) })
  HT_row('justleveling.2.def30-mag20.half-health.secondary', function () { return HT_nestedPost(HT_player({ apt: DEF30, health: 10 }), mob(), 10) })
  HT_row('justleveling.2.def30-mag20.half-health.primary.real', function () { return HT_real(HT_player({ apt: DEF30, health: 10 }), mob(), 6) })

  // -- death_penalty: the armour clamp was removed (ruling 14, 2026-10-14). The rows stay: a hit on a player
  //    in armour near its pin leaves the piece as it was in the scripts (the Java clamp, not run here, holds
  //    it at max - 1 when vanilla takes the durability)
  HT_row('armor-clamp.hit-40.primary', function () { var p = HT_player({ chest: 236 }); return HT_post(p, mob(), 40) + ' | ' + HT_chest(p) })
  HT_row('armor-clamp.hit-4.primary', function () { var p = HT_player({ chest: 236 }); return HT_post(p, mob(), 4) + ' | ' + HT_chest(p) })
  HT_row('armor-clamp.hit-40.secondary', function () { var p = HT_player({ chest: 236 }); return HT_nestedPost(p, mob(), 40) + ' | ' + HT_chest(p) })
  HT_row('armor-clamp.hit-40.secondary.real', function () { var p = HT_player({ chest: 236, health: 20 }); return HT_secondary(p, 'thorns', 12, HT_zombie()) + ' | ' + HT_chest(p) })
  HT_row('armor-clamp.hit-40.blazeborn-victim.primary', function () { var p = HT_player(plus(BLAZE, { chest: 236 })); return HT_post(p, mob(), 40) + ' | ' + HT_chest(p) })
  HT_row('armor-clamp.hit-1000.primary', function () { var p = HT_player({ chest: 236 }); return HT_post(p, mob(), 1000) + ' | ' + HT_chest(p) })
  HT_row('armor-clamp.broken-sword-attacker.primary', function () {
    var p = HT_player({ chest: 236 })
    return HT_post(p, melee(HT_player({ hand: BROKEN() })), 40) + ' | ' + HT_chest(p)
  })

  // -- origins/battlemage_arcane_cleave
  HT_row('arcane-cleave.battlemage.primary', function () { var p = HT_player(BM); return HT_post(HT_zombie(), melee(p), 10) + ' | mana 100 -> ' + HT_mana(p) })
  HT_row('arcane-cleave.battlemage.no-mana.primary', function () { var p = HT_player(plus(BM, { mana: 5 })); return HT_post(HT_zombie(), melee(p), 10) + ' | mana 5 -> ' + HT_mana(p) })
  HT_row('arcane-cleave.battlemage.arrow.primary', function () { var p = HT_player(BM); return HT_post(HT_zombie(), arrowBy(p, null), 10) + ' | mana 100 -> ' + HT_mana(p) })
  HT_row('arcane-cleave.battlemage.secondary', function () { var p = HT_player(BM); return HT_secondary(HT_zombie(), 'player', 10, p) + ' | mana 100 -> ' + HT_mana(p) })
  HT_row('arcane-cleave.battlemage.broken-sword.primary', function () { var p = HT_player(plus(BM, { hand: BROKEN() })); return HT_post(HT_zombie(), melee(p), 10) + ' | mana 100 -> ' + HT_mana(p) })
  HT_row('arcane-cleave.battlemage.on-a-player.primary', function () { var p = HT_player(BM); return HT_post(HT_player({}), melee(p), 10) + ' | mana 100 -> ' + HT_mana(p) })
  HT_row('arcane-cleave.other-class.primary', function () { var p = HT_player(plus(BM, { cls: 'icraft:archmage' })); return HT_post(HT_zombie(), melee(p), 10) + ' | mana 100 -> ' + HT_mana(p) })

  // -- loot/unique_tier_buff
  HT_row('unique-tier.sword-t2.primary', function () { return HT_post(HT_zombie(), melee(HT_player({ hand: T2() })), 10) })
  HT_row('unique-tier.sword-t2.primary.real', function () { return HT_real(HT_zombie(), melee(HT_player({ hand: T2() })), 10) })
  HT_row('unique-tier.sword-t2.secondary', function () { return HT_secondary(HT_zombie(), 'player', 10, HT_player({ hand: T2() })) })
  HT_row('unique-tier.sword-t2.held-by-a-zombie.primary', function () {
    var z = HT_zombie()
    z.setItemSlot(MSlot.MAINHAND, T2())
    return HT_post(HT_zombie(), HT_src.mob(z), 10)
  })
  HT_row('unique-tier.bow-arrow.primary', function () { return HT_post(HT_zombie(), arrowBy(HT_player({}), 'too_many_bows:dark_bow'), 10) })
  HT_row('unique-tier.bow-arrow.no-shooter.primary', function () { return HT_post(HT_zombie(), HT_src.arrow(HT_arrow(HT_player({}), 'too_many_bows:dark_bow'), null), 10) })
  HT_row('unique-tier.bow-arrow.secondary', function () { return HT_secondaryFrom(HT_zombie(), arrowBy(HT_player({}), 'too_many_bows:dark_bow'), 10) })
  HT_row('unique-tier.sword-t2.arrow-while-holding.primary', function () { return HT_post(HT_zombie(), arrowBy(HT_player({ hand: T2() }), null), 10) })
  HT_row('unique-tier.sword-t2.broken.primary', function () { return HT_post(HT_zombie(), melee(HT_player({ hand: HT_sword('simplyswords:tempest', 2031, 2030, true) })), 10) })

  // -- origins/class_passives_phase6h
  var passive = function (cls, drive, more) {
    return function () {
      var p = HT_player(plus({ cls: 'icraft:' + cls }, more || {}))
      return drive(p) + ' | attacker: ' + HT_stamps(p, H6)
    }
  }
  HT_row('class-passives.samurai.full-health-target.primary', passive('samurai', function (p) { return HT_post(HT_zombie(), melee(p), 10) }))
  HT_row('class-passives.samurai.hurt-target.primary', passive('samurai', function (p) { var z = HT_zombie(); z.setHealth(10); return HT_post(z, melee(p), 10) }))
  HT_row('class-passives.samurai.secondary', passive('samurai', function (p) { return HT_secondary(HT_zombie(), 'player', 10, p) }))
  HT_row('class-passives.samurai.broken-sword.primary', passive('samurai', function (p) { return HT_post(HT_zombie(), melee(p), 10) }, { hand: BROKEN() }))
  HT_row('class-passives.berserker.primary', passive('berserker', function (p) { return HT_post(HT_zombie(), melee(p), 10) }))
  HT_row('class-passives.berserker.secondary', passive('berserker', function (p) { return HT_secondary(HT_zombie(), 'player', 10, p) }))
  HT_row('class-passives.berserker.broken-sword.primary', passive('berserker', function (p) { return HT_post(HT_zombie(), melee(p), 10) }, { hand: BROKEN() }))
  HT_row('class-passives.wanderer.sword.primary', passive('wanderer', function (p) { return HT_post(HT_zombie(), melee(p), 10) }, { hand: HT_sword('minecraft:iron_sword', 250, 0, false) }))
  HT_row('class-passives.wanderer.fist.primary', passive('wanderer', function (p) { return HT_post(HT_zombie(), melee(p), 10) }))

  // -- loot/tmb_plain_bow_effects (LATE)
  var bow = function (bowId, drive, health) {
    return function () {
      var p = HT_player(health ? { health: health } : {}), z = HT_zombie()
      return drive(z, arrowBy(p, bowId)) + ' | victim: ' + HT_effects(z, BOW_FX) + ', fire ' + z.getRemainingFireTicks() + ', frozen ' + z.getTicksFrozen() +
        (health ? ' | shooter health ' + health + ' -> ' + HT_num(p.getHealth()) : '')
    }
  }
  var posted = function (z, s) { return HT_post(z, s, 6) }
  var splashed = function (z, s) { return HT_secondaryFrom(z, s, 6) }
  HT_row('bow-effects.dark-bow.primary', bow('too_many_bows:dark_bow', posted))
  HT_row('bow-effects.dark-bow.secondary', bow('too_many_bows:dark_bow', splashed))
  HT_row('bow-effects.cyroheart-bow.primary', bow('too_many_bows:cyroheart_bow', posted))
  HT_row('bow-effects.necro-flame-bow.primary', bow('too_many_bows:necro_flame_bow', posted))
  HT_row('bow-effects.aethers-call.primary', bow('too_many_bows:aethers_call', posted, 10))
  HT_row('bow-effects.aethers-call.secondary', bow('too_many_bows:aethers_call', splashed, 10))
  HT_row('bow-effects.demons-grasp.primary', function () {
    var p = HT_player({}), z = HT_zombie()
    var out = HT_post(z, arrowBy(p, 'too_many_bows:demons_grasp'), 6)
    return out + ' | victim: ' + HT_effects(z, BOW_FX) + ', pulled ' + (Number(z.getDeltaMovement().length()) > 0 ? 'yes' : 'no')
  })
  HT_row('bow-effects.untagged-arrow.primary', bow(null, posted))

  // -- attributes/iss_school_to_ars_spell (on the dispatcher since 2026-10-10; its registry call was a fallback)
  HT_row('ars-bridge.flare.fire-power-1.5.primary', function () { var p = HT_player({ fire: 0.5 }); return HT_post(HT_zombie(), HT_src.ars('flare', p), 10) })
  HT_row('ars-bridge.flare.fire-power-1.5.secondary', function () { var p = HT_player({ fire: 0.5 }); return HT_secondaryFrom(HT_zombie(), HT_src.ars('flare', p), 10) })
  HT_row('ars-bridge.frost.fire-power-1.5.primary', function () { var p = HT_player({ fire: 0.5 }); return HT_post(HT_zombie(), HT_src.ars('frost', p), 10) })

  // -- startup: deathskin_undead_bonus (stays on the registry; its place among the others is the point)
  HT_row('deathskin.undead-target.primary', function () { return HT_post(HT_zombie(), melee(HT_player({ undead: 0.2 })), 10) })
  HT_row('deathskin.undead-target.secondary', function () { return HT_secondary(HT_zombie(), 'player', 10, HT_player({ undead: 0.2 })) })
  HT_row('deathskin.living-target.primary', function () { return HT_post(HT_cow(), melee(HT_player({ undead: 0.2 })), 10) })

  // -- the order rows: every handler of one side on ONE hit
  var ALL_BM = { tags: ['icraft_blazeborn', 'icraft_enderian'], awakened: true, shift: true, cls: 'icraft:battlemage', mana: 100, sp: 1.0, undead: 0.2, apt: STR30 }
  var ALL_SAM = { tags: ['icraft_blazeborn', 'icraft_enderian'], awakened: true, shift: true, cls: 'icraft:samurai', undead: 0.2, apt: STR30 }
  HT_row('order.battlemage-all.undead-target.primary', function () {
    var p = HT_player(plus(ALL_BM, { hand: T2() })), z = HT_zombie()
    return HT_post(z, melee(p), 3) + ' | mana 100 -> ' + HT_mana(p) + ' | victim: ' + HT_effects(z, ['minecraft:wither'])
  })
  HT_row('order.battlemage-all.undead-target.primary.real', function () {
    var p = HT_player(plus(ALL_BM, { hand: T2() }))
    return HT_real(HT_zombie(), melee(p), 3) + ' | mana 100 -> ' + HT_mana(p)
  })
  HT_row('order.battlemage-all.undead-target.secondary', function () {
    var p = HT_player(plus(ALL_BM, { hand: T2() }))
    return HT_secondary(HT_zombie(), 'player', 3, p) + ' | mana 100 -> ' + HT_mana(p)
  })
  HT_row('order.battlemage-all.living-target.primary', function () {
    var p = HT_player(plus(ALL_BM, { hand: T2() }))
    return HT_post(HT_cow(), melee(p), 3) + ' | mana 100 -> ' + HT_mana(p)
  })
  HT_row('order.samurai-all.undead-target.primary', function () {
    var p = HT_player(plus(ALL_SAM, { hand: T2() }))
    return HT_post(HT_zombie(), melee(p), 3) + ' | attacker: ' + HT_stamps(p, H6)
  })
  HT_row('order.battlemage-all.broken-sword.primary', function () {
    var p = HT_player(plus(ALL_BM, { hand: BROKEN() }))
    return HT_post(HT_zombie(), melee(p), 3) + ' | mana 100 -> ' + HT_mana(p)
  })
  HT_row('order.battlemage-all.crit.primary', function () {
    T_rand(0.0)
    var p = HT_player(plus(ALL_BM, { hand: T2() }))
    return HT_post(HT_zombie(), melee(p), 3) + ' | mana 100 -> ' + HT_mana(p)
  })
  var VICTIM = plus(BLAZE, { apt: DEF30, health: 10, chest: 236 })
  var PVP = { tags: ['icraft_blazeborn', 'icraft_enderian'], awakened: true, shift: true, undead: 0.2, hand: null }
  HT_row('order.player-on-player.primary', function () {
    var v = HT_player(VICTIM), a = HT_player(plus(PVP, { hand: T2() }))
    return HT_post(v, melee(a), 40) + ' | victim: ' + HT_chest(v)
  })
  HT_row('order.player-on-player.secondary', function () {
    var v = HT_player(VICTIM), a = HT_player(plus(PVP, { hand: T2() }))
    return HT_nestedPost(v, melee(a), 40) + ' | victim: ' + HT_chest(v)
  })
  HT_row('order.mob-on-player.primary', function () {
    var v = HT_player(VICTIM)
    return HT_post(v, mob(), 40) + ' | victim: ' + HT_chest(v)
  })

  // -- the corners: what an amount no weapon deals does today (nothing here is a rule anybody chose;
  //    the rows are here so that a change of them is SEEN)
  HT_row('corner.infinite.plain.primary', function () { return HT_post(HT_zombie(), melee(HT_player({})), Infinity) })
  HT_row('corner.infinite.blazeborn-victim.primary', function () { return HT_post(HT_player(BLAZE), mob(), Infinity) })
  HT_row('corner.infinite.str30.primary', function () {
    var z = HT_zombie()
    return HT_post(z, melee(HT_player({ apt: STR30 })), Infinity) + ' | victim: ' + HT_effects(z, ['minecraft:wither'])
  })
  HT_row('corner.max-float.blazeborn-attacker.primary', function () { return HT_post(HT_zombie(), melee(HT_player(BLAZE)), 3.4e38) })
  HT_row('corner.infinite.no-attacker.tagged-arrow.primary', function () { return HT_post(HT_zombie(), HT_src.arrow(HT_arrow(HT_player({}), 'too_many_bows:dark_bow'), null), Infinity) })
  HT_row('corner.infinite.no-attacker.fall-on-a-mob.primary', function () { return HT_post(HT_zombie(), HT_src.fall(), Infinity) })
  HT_row('corner.negative.blazeborn-victim.primary', function () { return HT_post(HT_player(BLAZE), mob(), -5) })
})()

// ---- against the golden ---------------------------------------------------------------------------
T_run('every row is what suites/hit_table.golden.js holds (recorded before any handler moved, changed since only on a ruling)', function () {
  var golden = {}, seen = {}, i
  for (i = 0; i < HT_GOLDEN.length; i++) golden[HT_GOLDEN[i][0]] = HT_GOLDEN[i][1]
  for (i = 0; i < HT_ROWS.length; i++) {
    var name = HT_ROWS[i][0], value = HT_ROWS[i][1]
    __host.print('ROW ' + name + ' = ' + value)
    seen[name] = true
    if (!golden.hasOwnProperty(name)) { ok(false, name + ': not in the golden file (a new row: record it)'); continue }
    ok(golden[name] === value, name + (golden[name] === value ? '' : '\n      now    ' + value + '\n      golden ' + golden[name]))
  }
  var gone = []
  for (i = 0; i < HT_GOLDEN.length; i++) if (!seen[HT_GOLDEN[i][0]]) gone.push(HT_GOLDEN[i][0])
  ok(gone.length === 0, 'no row of the golden file stopped running' + (gone.length ? ': ' + gone.join(', ') : ''))
  var threw = []
  for (i = 0; i < HT_ROWS.length; i++) if (HT_ROWS[i][1].indexOf('THREW') === 0) threw.push(HT_ROWS[i][0])
  ok(threw.length === 0, 'no row threw' + (threw.length ? ': ' + threw.join(', ') : ''))
})

// the checks of the first scope (suites/hit_table_options.js) count too
T_pass += Number(__host.stash.get('ht_options_pass'))
T_fail += Number(__host.stash.get('ht_options_fail'))
