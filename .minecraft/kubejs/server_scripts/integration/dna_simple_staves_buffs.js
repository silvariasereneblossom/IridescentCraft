// =============================================================================
// DAN'S MAGIC + SIMPLE STAVES — Held-item attribute buffs (tick-driven)
// =============================================================================
// Replaces startup_scripts/dna_simple_staves_buffs.js which used the pre-2001
// ItemEvents.modification(item.attribute(...)) API. KubeJS 2001.6.5-build.16
// (the build the pack runs) passes a raw net.minecraft.world.item.Item to
// the modify callback — no .attribute() helper. Vanilla Item.defaultModifiers
// is final, so we can't bake the modifiers in post-construction.
//
// Pattern: server-tick at 2 Hz iterates online players, reads mainhand id,
// applies/clears each known buff via player.modifyAttribute. Deterministic
// modifier name per (item,attr) makes calls idempotent and lets us "clear"
// by setting amount=0 when the player isn't holding the buffed item.
//
// Companion files:
//   - kubejs/client_scripts/dna_simple_staves_tooltip.js
//       Shows the buff line on each item's tooltip (lost when buffs moved
//       from Item.defaultModifiers to player-side modifiers).
//   - kubejs/assets/dna/lang/en_us.json
//       Renames dna:tnt_staff -> "Apprentice Battlerod" (resource-pack overlay
//       replaces the pre-2001 item.displayName('...') call).
//
// Memory: feedback_kubejs_event_scope.md (PlayerEvents.* server-only),
//   feedback_kubejs_tooltip_api.md, feedback_distro_jar_deploy.md.
//
// 2026-10-10 -- COST ONLY, same buffs. The tick used to rewrite all 17
// modifier slots for every player every 10 ticks, held item or not. Each
// player.modifyAttribute() removes and re-adds the modifier, which marks the
// attribute dirty and re-syncs it to the client: 34 attribute updates a second
// per player for a value that had not changed. Now the last main-hand id that
// was applied is remembered per player and modifiers are only written when it
// changes -- and then only the slots of the item that was put away and the item
// that was drawn. A player seen for the first time (login, respawn, /reload)
// gets one full write of all slots, exactly what every tick used to do.
//
// The modifiers are TRANSIENT (KubeJS modifyAttribute -> addTransientModifier):
// they live on the player entity and vanish with it. So the memory is dropped
// on login, logout and respawn -- the three moments the entity is replaced.
// Whole file is one IIFE (body left at column 0): server scripts share a single
// Rhino scope.
// =============================================================================

;(function () {
var HANDHELD_BUFFS = {
  // Dan's Magic — 5 staves (T1 element buffs)
  'dna:ice_staff':            { 'irons_spellbooks:ice_spell_power':       ['addition',  0.20] },
  'dna:lightning_staff':      { 'irons_spellbooks:lightning_spell_power': ['addition',  0.20] },
  'dna:magma_staff':          { 'irons_spellbooks:fire_spell_power':      ['addition',  0.20] },
  'dna:toxic_staff':          { 'irons_spellbooks:nature_spell_power':    ['addition',  0.20] },

  // Apprentice Battlerod (dna:tnt_staff) — T1 spellsword hybrid
  // 5% generic spell_power + 6 attack_damage (~7 total, +1 over iron sword)
  // + sword-tier attack_speed (-2.4 brings base 4.0 to 1.6).
  'dna:tnt_staff': {
    'irons_spellbooks:spell_power':    ['addition',  0.05],
    'minecraft:generic.attack_damage': ['addition',  6.0],
    'minecraft:generic.attack_speed':  ['addition', -2.4],
  },

  // Simple Staves — 8 element wands (T2-T4 element buffs)
  'simple_staves:flame_wand':         { 'irons_spellbooks:fire_spell_power':      ['addition', 0.35] },
  'simple_staves:wind_essence_wand':  {
    'irons_spellbooks:lightning_spell_power': ['addition', 0.20],
    'minecraft:generic.movement_speed':       ['addition', 0.05],
  },
  'simple_staves:thunder_wand':       { 'irons_spellbooks:lightning_spell_power': ['addition', 0.35] },
  'simple_staves:venomite_wand':      { 'irons_spellbooks:nature_spell_power':    ['addition', 0.35] },
  'simple_staves:viritium_wand':      { 'irons_spellbooks:nature_spell_power':    ['addition', 0.50] },
  'simple_staves:veil_wand':          { 'irons_spellbooks:holy_spell_power':      ['addition', 0.50] },
  'simple_staves:void_wand':          { 'irons_spellbooks:ender_spell_power':     ['addition', 0.50] },
  'simple_staves:tenebrium_wand':     { 'irons_spellbooks:ender_spell_power':     ['addition', 0.75] },

  // Note: Simple Staves' 6 vanilla material wands (wooden/stone/iron/gold/
  // diamond/netherite_wand) carry their base spell stats at the ITEM level
  // via SimpleStavesWandAttributes.java (ItemAttributeModifierEvent
  // injection). Same approach as Tetra modular items -- the modifiers are
  // bound to the item itself, visible in tooltips, applied by vanilla
  // mainhand-slot logic. Don't add tick-driven entries here for them.
}

// Flat list of every (itemId, attr) modifier slot we manage. Iterated each
// tick so stale modifiers always get cleared (amount=0) when the player
// isn't holding the matching item. Deterministic name -> idempotent
// modifyAttribute, no leaks across swaps.
var MOD_SLOTS = []
// itemId -> the entries of MOD_SLOTS that belong to it
var SLOTS_BY_ITEM = {}
for (var __itemId in HANDHELD_BUFFS) {
  var __buffs = HANDHELD_BUFFS[__itemId]
  SLOTS_BY_ITEM[__itemId] = []
  for (var __attr in __buffs) {
    var __safe = (__itemId + '_' + __attr).replace(/[^a-zA-Z0-9]/g, '_')
    var __slot = {
      itemId: __itemId,
      attr:   __attr,
      op:     __buffs[__attr][0],
      amount: __buffs[__attr][1],
      name:   'icraft_hh_' + __safe,
    }
    MOD_SLOTS.push(__slot)
    SLOTS_BY_ITEM[__itemId].push(__slot)
  }
}

// uuid -> the main-hand id whose modifiers are currently applied ('' = none).
// No entry = this player entity has not been written yet (full write needed).
var appliedHeld = {}

function writeSlot(player, slot, active) {
  try {
    player.modifyAttribute(slot.attr, slot.name, active ? slot.amount : 0, slot.op)
  } catch (e) {
    // Attribute unregistered (mod missing) or transient state — skip
    // this slot rather than crashing the whole tick.
  }
}

function syncHeldBuffs(player) {
  var held = ''
  try {
    held = String(player.mainHandItem.id || '')
  } catch (e) {
    held = ''
  }
  var key = String(player.uuid)

  if (!appliedHeld.hasOwnProperty(key)) {
    // First sight of this player entity: write every slot once (clears
    // anything stale, applies the held item's buffs).
    for (var i = 0; i < MOD_SLOTS.length; i++) writeSlot(player, MOD_SLOTS[i], held === MOD_SLOTS[i].itemId)
    appliedHeld[key] = held
    return
  }

  var was = appliedHeld[key]
  if (was === held) return               // nothing changed: no writes at all

  // Main-hand item changed: clear the old item's slots, apply the new item's.
  var off = SLOTS_BY_ITEM.hasOwnProperty(was) ? SLOTS_BY_ITEM[was] : null
  var on = SLOTS_BY_ITEM.hasOwnProperty(held) ? SLOTS_BY_ITEM[held] : null
  if (off) { for (var a = 0; a < off.length; a++) writeSlot(player, off[a], false) }
  if (on) { for (var b = 0; b < on.length; b++) writeSlot(player, on[b], true) }
  appliedHeld[key] = held
}

global.tick_dna_simple_staves_buffs = function (event) {
  var server = event.server
  server.players.forEach(function (player) {
    if (player.spectator) return
    syncHeldBuffs(player)
  })
}

// The modifiers die with the player entity (see header): forget what was
// applied whenever the entity is replaced.
function forgetHeldBuffs(event) {
  try { delete appliedHeld[String(event.player.uuid)] } catch (e) {}
}
PlayerEvents.loggedIn(forgetHeldBuffs)
PlayerEvents.loggedOut(forgetHeldBuffs)
PlayerEvents.respawned(forgetHeldBuffs)

// 10-tick interval (2 Hz); offset 4 to space against other registered
// per-second ticks. Swap latency from drawing/sheathing a buffed item is
// up to 0.5s; imperceptible in normal play.
global.registerServerTick('tick_dna_simple_staves_buffs', 10, 4)
})()
