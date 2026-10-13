// @file kubejs/server_scripts/armor_weight.js
// @events PlayerEvents.inventoryChanged, PlayerEvents.loggedIn, PlayerEvents.loggedOut, PlayerEvents.respawned, tick.server
// =============================================================================
// ARMOR WEIGHT SYSTEM — robe / light / medium / heavy per-piece scaling
// =============================================================================
// Tags: data/icraft/tags/items/armor_{robe,light,heavy}.json (robe is checked
// first). Anything else, armor_medium.json included, is 'medium': no effect.
// Reforged armor takes its class from its major module instead of a tag.
//
// Per-piece effects (the COEF_* tables below are the numbers; each scales with
// the count of worn pieces of that class, and the classes add up):
//            mana_regen   movement_speed   generic.armor   armor_toughness
//            (addition)   (multiply_base)  (multiply_base) (multiply_base)
//   robe       +0.10         +1.5%            -7.5%           -10%
//   light      +0.05         +5%              -5%             -7.5%
//   medium      0             0                0               0
//   heavy      -0.05         -5%              +5%              0
//   4/4 robe: an extra +0.5 mana_regen (ROBE_SET_BONUS_MANA).
//
// So four light pieces are +0.20 mana regen, +20% speed, -20% armor and -30%
// toughness; full plate is -0.20 mana regen, -20% speed and +20% armor.
// (This header described three classes and a speed step of 1.25% per piece,
// 5% at four, until 2026-10-12. The code has had four classes and 0.05 since
// the file was imported; only the comment was changed. Which speed step is
// MEANT is an open question for the operator.)
//
// Toughness is asymmetric: robe and light take a penalty, heavy does not add
// toughness back. Design intent: make it genuinely hard to be tanky in light
// armor regardless of race, without editing the toughness value on every
// individual robe item. Heavy armor keeps its native material toughness
// (diamond/netherite high baseline).
//
// Also applied here: +0.75 flat armor per worn Protection level (the reworked
// Protection enchant) and the Faefolk toughness penalty (-50% unless 4/4 robe
// or 4/4 light).
//
// Refresh: tick every 100 ticks (5s — matches class_passives + mana_pool
// cadence). PlayerEvents.inventoryChanged also fires the recompute for
// snappy UI feedback when the player swaps a piece mid-combat.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try
// blocks; closures fail with function declarations).
//
// 2026-10 -- three silent failures fixed here. Until this change the script
// applied NOTHING but zero-valued modifiers:
//   * classifyArmor() called `armorClass.isInstance(item)` on a Java.loadClass
//     wrapper. The wrapper only exposes the class's STATIC members, so that
//     call threw for every stack, the catch-all swallowed it, and every piece
//     (tagged or reforged) classified as 'medium'. Now `item instanceof`.
//   * `stack.getInternal()` does not exist in this KubeJS (ItemStack is the
//     raw stack; production log: "Cannot find function getInternal in object
//     1 scroll"), so the reforged-armor weight and the Protection flat-armor
//     level read both threw. Now the stack is passed as-is.
//   * isFaefolk() ran `execute if entity <name>[nbt=...]`, which never parsed.
//     Now global.icraft.origin (0_lib_origins.js), a cached lookup -- this
//     also removes one failed command parse per inventory change per player.
//
// 2026-10-10 -- COST ONLY, same numbers. The seven modifiers used to be
// recomputed AND rewritten on every PlayerEvents.inventoryChanged (which fires
// for every slot that changes: each item picked up, each point of durability
// lost, each stack moved) and again every 100 ticks. A modifyAttribute() call
// removes and re-adds the modifier and re-syncs the attribute to the client
// even when the value is identical. Now:
//   * the last state written is remembered per player (one string of the seven
//     amounts); the modifiers are written only when that string changes;
//   * inventoryChanged only looks at the armor when the stack that changed is
//     something that goes in an armor slot (LivingEntity.getEquipmentSlotForItem
//     -> head / chest / legs / feet). The event never fires for a slot that
//     becomes EMPTY, and its slot number is a menu index, so the item is the
//     only reliable filter; whatever it misses is picked up by the 100-tick
//     pass, as before. (The offhand is not part of armor weight: only the four
//     armor slots are read.)
// The modifiers are TRANSIENT (they die with the player entity), so the memory
// is dropped on login, logout and respawn.
//
// Whole file is one IIFE (body left at column 0 to keep the diff readable):
// its top-level ARMOR_SLOTS / EnchantmentHelper_mc were shared-scope names that
// death_penalty.js / magic_crit_hook.js also declare.
// =============================================================================

;(function () {
const TAG_ROBE   = 'icraft:armor_robe'
const TAG_LIGHT  = 'icraft:armor_light'
const TAG_HEAVY  = 'icraft:armor_heavy'

// Stable UUIDs per axis.
const UUID_MANA_REGEN       = 'icraft_armor_weight_mana_regen'
const UUID_MOVE_SPEED       = 'icraft_armor_weight_speed'
const UUID_ARMOR            = 'icraft_armor_weight_armor'
const UUID_LIGHT_TOUGHNESS  = 'icraft_armor_weight_toughness'
const UUID_FAEFOLK_TOUGHNESS = 'icraft_faefolk_armor_weakness'
const UUID_ROBE_SET_BONUS   = 'icraft_armor_weight_robe_set'
const UUID_PROTECTION_ARMOR = 'icraft_protection_flat_armor'

// Per-piece coefficients indexed by tier.
// armor/toughness use MULTIPLY_BASE; mana_regen uses ADDITION; speed uses MULTIPLY_BASE.
//
// Design: ROBE is a 4th tier below LIGHT — mage gear that makes you fragile
// in exchange for mana regen. Full 4-piece robe set adds an extra +0.5
// mana_regen ADDITION on top of per-piece bonuses (the "true mage build"
// payoff). Light keeps its rogue identity (speed + light penalty), heavy
// keeps tank identity, medium stays neutral.
const COEF_ARMOR     = { robe: -0.075, light: -0.05,  medium: 0, heavy:  0.05  }
const COEF_TOUGHNESS = { robe: -0.10,  light: -0.075, medium: 0, heavy:  0     }
const COEF_MANA      = { robe:  0.10,  light:  0.05,  medium: 0, heavy: -0.05  }
const COEF_SPEED     = { robe:  0.015, light:  0.05,  medium: 0, heavy: -0.05  }
const ROBE_SET_BONUS_MANA = 0.5  // ADDITION on irons_spellbooks:mana_regen at 4/4 robe

// Reworked Protection enchant (2026-06-19): minecraft:protection no longer
// grants % damage reduction — its EPF is zeroed by ProtectionFlatArmorMixin in
// iridescent_tetra_expansion. Instead each worn Protection LEVEL grants flat
// generic.armor here, so it feeds the diminishing armor curve (attributeslib
// "Armor Formula") instead of stacking multiplicatively toward immunity.
// +0.75 armor/level. NOTE Protection max level is 10 here (Apotheosis-raised),
// so a full Protection X set = +30 flat armor.
const COEF_PROTECTION_ARMOR = 0.75

// Faefolk armor toughness penalty (Ethereal Form): -50% multiply_base.
// Applied only when player is Faefolk AND not wearing 4/4 light armor.
// Wearing full robes bypasses the penalty entirely (caster identity payoff).
const FAEFOLK_TOUGHNESS_PENALTY = -0.5

// Local to this file's IIFE now (it used to be a shared-scope `var` that
// death_penalty.js also declared).
var ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet']

// once per failing place per script load: the table and the wording of "once" are
// global.icraft.core.warnOnce's (0_lib_core.js); this only adds the script's name
var warnThrew = function (where, e) {
  global.icraft.core.warnOnce('armor_weight:' + where, '[armor_weight] ' + where + ' threw: ' + e)
}

// Reforged armor (iridescent_reforging:reforged_*) doesn't have a static
// item tag — its weight class is dynamic, decided by the installed major
// module. Detect via class identity and call getArmorWeight() directly.
// The result is a Java enum: ArmorWeight.LIGHT / MEDIUM / HEAVY (or null
// if no major installed yet, in which case fall through to medium).
//
// Class loaded lazily on first use because Rhino evaluates const at
// parse time and the iridescent_reforging mod may not be on the
// classpath yet during the early script-load phase.
var _itemModularArmorClass = null
function _getItemModularArmorClass() {
  if (_itemModularArmorClass === null) {
    try {
      _itemModularArmorClass = Java.loadClass('com.iridescentcraft.reforging.item.ItemModularArmor')
    } catch (e) {
      _itemModularArmorClass = false  // sentinel: class load failed, don't retry
      warnThrew('loading ItemModularArmor (reforged armour is then weighed by its tags only)', e)
    }
  }
  return _itemModularArmorClass || null
}

// Lazy-resolve the vanilla minecraft:protection Enchantment + EnchantmentHelper.
// Vanilla is always registered, but resolve defensively for script load order
// (mirrors the lazy class-load pattern above + the EnchantmentHelper idiom in
// magic_crit_hook.js / icraft_magic_enchants.js).
var EnchantmentHelper_mc = null
var _protectionEnch = null
var _protResolveTried = false
function getProtectionEnchant() {
  if (!_protResolveTried) {
    _protResolveTried = true
    try {
      EnchantmentHelper_mc = Java.loadClass('net.minecraft.world.item.enchantment.EnchantmentHelper')
      var ForgeRegistries_mc = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
      var ResourceLocation_mc = Java.loadClass('net.minecraft.resources.ResourceLocation')
      _protectionEnch = ForgeRegistries_mc.ENCHANTMENTS.getValue(ResourceLocation_mc.tryParse('minecraft:protection'))
    } catch (e) {
      _protectionEnch = null
      warnThrew('resolving minecraft:protection (its flat armor is off)', e)
    }
  }
  return _protectionEnch
}

// Classify a single equipped slot. Returns the tier-name string used
// to index the COEF_* tables (or null if empty).
//   'robe'   = mage cloth weight class (reforged vestment_*, ISS class robes,
//              Botania manaweave); Runed will sit here too as the heavier
//              mage sibling once it ships
//   'light'  = leather/scaled (rogue gear)
//   'medium' = default — untagged
//   'heavy'  = plate (diamond, netherite, fiery, etc.)
function classifyArmor(stack) {
  if (!stack || stack.isEmpty()) return null
  try {
    // Tetra reforged armor: dynamic weight from the installed major.
    var armorClass = _getItemModularArmorClass()
    if (armorClass !== null) {
      var item = stack.getItem()
      // `instanceof`, not armorClass.isInstance(): a Java.loadClass wrapper has
      // no isInstance member (it throws). The stack is already the raw
      // ItemStack -- there is no getInternal().
      if (item instanceof armorClass) {
        var weight = item.getArmorWeight(stack)
        if (weight !== null) {
          var name = weight.name()
          if (name === 'ROBE')   return 'robe'
          if (name === 'LIGHT')  return 'light'
          if (name === 'HEAVY')  return 'heavy'
          return 'medium'
        }
        return 'medium'
      }
    }
    // Static-tagged vanilla / modded armor (robe checked first — most specific).
    if (stack.hasTag(TAG_ROBE))  return 'robe'
    if (stack.hasTag(TAG_LIGHT)) return 'light'
    if (stack.hasTag(TAG_HEAVY)) return 'heavy'
  } catch (e) {
    // medium = no effect: a piece that cannot be classified changes no number
    warnThrew('classifying an armour piece (it counts as medium)', e)
  }
  return 'medium'
}

// Sum per-piece coefficients across the 4 armor slots, return the
// per-attribute totals + the per-tier counts.
function aggregateArmor(player) {
  var counts = { robe: 0, light: 0, medium: 0, heavy: 0 }
  var protLevels = 0
  var protEnch = getProtectionEnchant()
  ARMOR_SLOTS.forEach(function(slot) {
    var item = player.getEquipment(slot)
    var tier = classifyArmor(item)
    if (tier && counts.hasOwnProperty(tier)) counts[tier]++
    // Sum minecraft:protection levels across worn pieces (reworked -> flat armor).
    if (protEnch && EnchantmentHelper_mc && item && !item.isEmpty()) {
      try {
        var lvl = EnchantmentHelper_mc.getItemEnchantmentLevel(protEnch, item)
        if (lvl > 0) protLevels += lvl
      } catch (e) { warnThrew('reading a Protection level (the piece adds no flat armor)', e) }
    }
  })
  return {
    counts: counts,
    armor:     counts.robe * COEF_ARMOR.robe     + counts.light * COEF_ARMOR.light     + counts.heavy * COEF_ARMOR.heavy,
    toughness: counts.robe * COEF_TOUGHNESS.robe + counts.light * COEF_TOUGHNESS.light + counts.heavy * COEF_TOUGHNESS.heavy,
    mana:      counts.robe * COEF_MANA.robe      + counts.light * COEF_MANA.light      + counts.heavy * COEF_MANA.heavy,
    speed:     counts.robe * COEF_SPEED.robe     + counts.light * COEF_SPEED.light     + counts.heavy * COEF_SPEED.heavy,
    robeSetBonus: counts.robe === 4 ? ROBE_SET_BONUS_MANA : 0,
    protectionArmor: protLevels * COEF_PROTECTION_ARMOR
  }
}

// Check whether a player has the Faefolk race (shared cached resolver).
function isFaefolk(player) {
  try {
    return global.icraft.origin.is(player, 'race', 'icraft:faefolk')
  } catch (e) {
    warnThrew('the Faefolk test (the toughness penalty is then off)', e)
    return false
  }
}

var tickWarned = false

// uuid -> signature of the modifier state last written to this player entity
// ('off' = the creative/spectator strip). No entry = nothing written yet.
var appliedState = {}

// Is this stack something that is worn in an armor slot? true when unsure.
var LivingEntity_mc = null
var livingResolveTried = false
function isArmorSlotItem(stack) {
  if (!livingResolveTried) {
    livingResolveTried = true
    try {
      LivingEntity_mc = Java.loadClass('net.minecraft.world.entity.LivingEntity')
    } catch (e) {
      // swallow-ok: without the class every stack counts as armour (the line below), so the sync runs on every inventory change: the safe side
      LivingEntity_mc = null
    }
  }
  if (!LivingEntity_mc) return true
  try {
    var slotName = String(LivingEntity_mc.getEquipmentSlotForItem(stack).getName())
    return slotName === 'head' || slotName === 'chest' || slotName === 'legs' || slotName === 'feet'
  } catch (e2) {
    // swallow-ok: "true when unsure" (the comment above): the sync then runs, and writes nothing when nothing changed
    return true
  }
}

function applyArmorMods(player, agg) {
  player.modifyAttribute('irons_spellbooks:mana_regen',
    UUID_MANA_REGEN, agg.mana, 'addition')
  player.modifyAttribute('minecraft:generic.movement_speed',
    UUID_MOVE_SPEED, agg.speed, 'multiply_base')
  player.modifyAttribute('minecraft:generic.armor',
    UUID_ARMOR, agg.armor, 'multiply_base')
  player.modifyAttribute('minecraft:generic.armor_toughness',
    UUID_LIGHT_TOUGHNESS, agg.toughness, 'multiply_base')
  // 4-piece robe set bonus: extra mana regen on top of the per-piece total.
  player.modifyAttribute('irons_spellbooks:mana_regen',
    UUID_ROBE_SET_BONUS, agg.robeSetBonus, 'addition')
  // Reworked Protection: flat armor per Protection level (ADDITION -> adds to
  // base armor before the weight multiply_base above; the % EPF is zeroed by
  // ProtectionFlatArmorMixin so this is Protection's only defensive effect now).
  player.modifyAttribute('minecraft:generic.armor',
    UUID_PROTECTION_ARMOR, agg.protectionArmor, 'addition')
}

// Bring one player's modifiers in line with what they wear. Writes nothing when
// the state is the one already applied (see the 2026-10-10 header note).
//   stripIfExempt: creative / spectator players get the modifiers zeroed (the
//   100-tick pass does this; the inventory event just leaves them alone, as it
//   always did).
function syncArmorWeight(player, stripIfExempt) {
  var key = String(player.uuid)

  if (player.spectator || player.creative) {
    if (!stripIfExempt) return
    if (appliedState[key] === 'off') return
    // Strip any stale modifier in case the player toggled mode
    try {
      player.modifyAttribute('irons_spellbooks:mana_regen', UUID_MANA_REGEN, 0, 'addition')
      player.modifyAttribute('irons_spellbooks:mana_regen', UUID_ROBE_SET_BONUS, 0, 'addition')
      player.modifyAttribute('minecraft:generic.movement_speed', UUID_MOVE_SPEED, 0, 'multiply_base')
      player.modifyAttribute('minecraft:generic.armor', UUID_ARMOR, 0, 'multiply_base')
      player.modifyAttribute('minecraft:generic.armor', UUID_PROTECTION_ARMOR, 0, 'addition')
      player.modifyAttribute('minecraft:generic.armor_toughness', UUID_LIGHT_TOUGHNESS, 0, 'multiply_base')
      appliedState[key] = 'off'
    } catch (e) { warnThrew('zeroing the modifiers of a creative or spectator player', e) }
    return
  }

  var agg = aggregateArmor(player)

  // Faefolk Ethereal Form (conditional). Bypass when wearing 4/4 robe
  // OR 4/4 light (full caster/rogue commitment).
  var faefolkPenalty = 0
  if (isFaefolk(player) && agg.counts.robe < 4 && agg.counts.light < 4) {
    faefolkPenalty = FAEFOLK_TOUGHNESS_PENALTY
  }

  var state = [agg.mana, agg.speed, agg.armor, agg.toughness, agg.robeSetBonus,
    agg.protectionArmor, faefolkPenalty].join('|')
  if (appliedState[key] === state) return

  applyArmorMods(player, agg)
  player.modifyAttribute('minecraft:generic.armor_toughness',
    UUID_FAEFOLK_TOUGHNESS, faefolkPenalty, 'multiply_base')
  appliedState[key] = state
}

global.tick_armorWeight = function(event) {
  var server = event.server
  server.players.forEach(function(player) {
    try {
      syncArmorWeight(player, true)
    } catch (e) {
      // once per script load: a tick path must not log on every pass
      if (!tickWarned) {
        tickWarned = true
        console.warn('[armor_weight] tick failed for ' + player.username + ' (logged once): ' + e)
      }
    }
  })
}
global.registerServerTick('tick_armorWeight', 100, 17)

// Snappy refresh on equip swap.
// (No try of their own since 2026-10-13, here and in forgetArmorWeight below: the
// guard isolates a throw and prints the FAILED line.)
PlayerEvents.inventoryChanged(icraft.guard('armor_weight', 'PlayerEvents.inventoryChanged', function(event) {
  var player = event.player
  if (!player) return
  if (!isArmorSlotItem(event.item)) return
  syncArmorWeight(player, false)
}))

// The modifiers die with the player entity: forget what was applied whenever
// the entity is replaced, so the next pass writes them again.
function forgetArmorWeight(event) {
  delete appliedState[String(event.player.uuid)]
}
PlayerEvents.loggedIn(icraft.guard('armor_weight', 'PlayerEvents.loggedIn', forgetArmorWeight))
PlayerEvents.loggedOut(icraft.guard('armor_weight', 'PlayerEvents.loggedOut', forgetArmorWeight))
PlayerEvents.respawned(icraft.guard('armor_weight', 'PlayerEvents.respawned', forgetArmorWeight))

console.log('[IridescentCraft] armor_weight loaded — robe / light / medium / heavy per-piece scaling')
console.log('  robe   +0.10 mana regen, +1.5% speed, -7.5% armor, -10% toughness (per piece, +0.5 mana set bonus at 4/4)')
console.log('  light  +0.05 mana regen, +5% speed, -5% armor, -7.5% toughness (per piece)')
console.log('  medium no effect (default for untagged armor)')
console.log('  heavy  -0.05 mana regen, -5% speed, +5% armor (per piece)')
console.log('  + minecraft:protection -> +0.75 flat armor/level (addition; vanilla % EPF zeroed by ProtectionFlatArmorMixin)')
})()
