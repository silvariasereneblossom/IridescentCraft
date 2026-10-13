// @file kubejs/server_scripts/attributes/mana_debug_command.js
// @events ServerEvents.commandRegistry
// =============================================================================
// /icraft mana_debug -- dump unified mana pool state
// =============================================================================
// Post-2026-05-15 (unified pool): Ars ManaCap is mixin-redirected to the ISS
// pool. There is only one mana value -- the ISS attribute and ISS MagicData.
// This command prints that attribute's modifier list, plus the Ars cap to
// confirm getCurrentMana/getMaxMana are returning the ISS values.
//
// Op-only (permission level 2).
//
// A read that throws is PRINTED in the dump (`threw: <error>`), in the place of
// the value. Until 2026-10-13 each read had an empty catch and the dump showed
// "unknown" or 0 instead: a debug command that hid what it was asked to show.
// =============================================================================

try {
  var ResourceLocation_mdc = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var ForgeRegistries_mdc = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')

  var ATTRS_TO_DUMP = [
    { label: 'ISS max_mana',    id: 'irons_spellbooks:max_mana' },
    { label: 'ISS mana_regen',  id: 'irons_spellbooks:mana_regen' },
    { label: 'ISS spell_power', id: 'irons_spellbooks:spell_power' },
  ]

  // what a failed read prints in the place of its value
  var threw_mdc = function(e) { return 'threw: ' + e }

  // -> the Attribute, null when it is not registered, or { failed: <error> }
  var resolveAttr = function(id) {
    try {
      var rl = ResourceLocation_mdc.tryParse(id)
      return rl ? ForgeRegistries_mdc.ATTRIBUTES.getValue(rl) : null
    } catch (e) { return { failed: e } }
  }

  var formatModifier = function(mod) {
    var uuid = 'unknown'
    try { uuid = String(mod.getId()) } catch (e1) { uuid = threw_mdc(e1) }
    var name = 'unknown'
    try { name = String(mod.getName()) } catch (e2) { name = threw_mdc(e2) }
    var amt = 0
    try { amt = mod.getAmount() } catch (e3) { amt = threw_mdc(e3) }
    var op = 'unknown'
    try { op = String(mod.getOperation().name()) } catch (e4) { op = threw_mdc(e4) }
    return uuid + '  amt=' + amt + '  op=' + op + '  name=' + name
  }

  var dumpAttribute = function(sp, label, id) {
    sp.tell('§6--- ' + label + ' (' + id + ') ---')
    var attr = resolveAttr(id)
    if (attr && attr.failed) {
      sp.tell('§c  the attribute registry could not be asked: ' + attr.failed)
      return
    }
    if (!attr) {
      sp.tell('§c  attribute not registered (mod absent?)')
      return
    }
    var inst = null
    try { inst = sp.getAttribute(attr) } catch (e) {
      sp.tell('§c  getAttribute threw: ' + e)
      return
    }
    if (!inst) {
      sp.tell('§c  attribute not present on player')
      return
    }
    var base = 0
    try { base = inst.getBaseValue() } catch (e1) { base = threw_mdc(e1) }
    var value = 0
    try { value = inst.getValue() } catch (e2) { value = threw_mdc(e2) }
    sp.tell('§7  base=§f' + base + '§7  aggregated=§a' + value)
    var iter = inst.getModifiers().iterator()
    var count = 0
    while (iter.hasNext()) {
      var mod = iter.next()
      sp.tell('§8    [' + count + '] ' + formatModifier(mod))
      count++
    }
    if (count === 0) sp.tell('§8    (no modifiers)')
  }

  var dumpArsCap = function(sp) {
    sp.tell('§6--- Ars IManaCap (the value the bar reads) ---')
    try {
      var capReg = Java.loadClass('com.hollingsworth.arsnouveau.setup.registry.CapabilityRegistry')
      var manaUtil = Java.loadClass('com.hollingsworth.arsnouveau.api.util.ManaUtil')
      var capOpt = capReg.getMana(sp)
      if (!capOpt) {
        sp.tell('§c  CapabilityRegistry.getMana returned null')
        return
      }
      var cap = capOpt.orElse(null)
      if (!cap) {
        sp.tell('§c  cap LazyOptional empty')
        return
      }
      var current = 0
      try { current = cap.getCurrentMana() } catch (e1) { current = threw_mdc(e1) }
      var max = 0
      try { max = cap.getMaxMana() } catch (e2) { max = threw_mdc(e2) }
      var glyphBonus = 0
      try { glyphBonus = cap.getGlyphBonus() } catch (e3) { glyphBonus = threw_mdc(e3) }
      var bookTier = 0
      try { bookTier = cap.getBookTier() } catch (e4) { bookTier = threw_mdc(e4) }
      sp.tell('§7  current=§f' + current + '§7  max=§a' + max
            + '§7  glyphBonus=' + glyphBonus + '  bookTier=' + bookTier)

      // Recompute calcMaxMana to see what Ars thinks the max SHOULD be.
      var result = manaUtil.calcMaxMana(sp)
      sp.tell('§7  calcMaxMana()=§a' + result.getRealMax()
            + '§7  (Max=' + result.Max() + ', Reserve=' + result.Reserve() + ')')
      if (result.getRealMax() !== max) {
        sp.tell('§e  WARNING: cap.maxMana out of sync with calcMaxMana()!')
        sp.tell('§e          This means the attribute changed but the cap cache')
        sp.tell('§e          was not refreshed. Force-refreshing now.')
        cap.setMaxMana(result.getRealMax())
        sp.tell('§a  Forced cap.setMaxMana(' + result.getRealMax() + ').')
      }
    } catch (e) {
      sp.tell('§c  Ars API error: ' + e)
    }
  }

  ServerEvents.commandRegistry(icraft.guard('attributes/mana_debug_command', 'ServerEvents.commandRegistry', function(event) {
    var Commands = event.commands

    event.register(
      Commands.literal('icraft')
        .then(Commands.literal('mana_debug')
          .requires(function(src) { return src.hasPermission(2) })
          .executes(function(ctx) {
            var sp
            try { sp = ctx.source.getPlayerOrException() } catch (e) {
              // swallow-ok: not a player (the console, a command block): the source is told so and the command ends
              ctx.source.sendFailure(Text.of('Must be run as a player'))
              return 0
            }
            sp.tell('§6=== mana_debug for ' + sp.username + ' ===')
            for (var i = 0; i < ATTRS_TO_DUMP.length; i++) {
              dumpAttribute(sp, ATTRS_TO_DUMP[i].label, ATTRS_TO_DUMP[i].id)
            }
            dumpArsCap(sp)
            sp.tell('§6=== end mana_debug ===')
            return 1
          })
        )
    )
  }))

  console.log('[IridescentCraft] /icraft mana_debug command registered')
} catch (e) {
  console.warn('[IridescentCraft] mana_debug_command bootstrap FAILED: ' + e)
}
