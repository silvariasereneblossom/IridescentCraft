// =============================================================================
// /icraft mana_debug -- dump unified mana pool state
// =============================================================================
// Post-2026-05-15 (unified pool): Ars ManaCap is mixin-redirected to the ISS
// pool. There is only one mana value -- the ISS attribute and ISS MagicData.
// This command prints that attribute's modifier list, plus the Ars cap to
// confirm getCurrentMana/getMaxMana are returning the ISS values.
//
// Op-only (permission level 2).
// =============================================================================

try {
  var ResourceLocation_mdc = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var ForgeRegistries_mdc = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')

  var ATTRS_TO_DUMP = [
    { label: 'ISS max_mana',    id: 'irons_spellbooks:max_mana' },
    { label: 'ISS mana_regen',  id: 'irons_spellbooks:mana_regen' },
    { label: 'ISS spell_power', id: 'irons_spellbooks:spell_power' },
  ]

  var resolveAttr = function(id) {
    try {
      var rl = ResourceLocation_mdc.tryParse(id)
      return rl ? ForgeRegistries_mdc.ATTRIBUTES.getValue(rl) : null
    } catch (e) { return null }
  }

  var formatModifier = function(mod) {
    var uuid = 'unknown'
    try { uuid = String(mod.getId()) } catch (_) {}
    var name = 'unknown'
    try { name = String(mod.getName()) } catch (_) {}
    var amt = 0
    try { amt = mod.getAmount() } catch (_) {}
    var op = 'unknown'
    try { op = String(mod.getOperation().name()) } catch (_) {}
    return uuid + '  amt=' + amt + '  op=' + op + '  name=' + name
  }

  var dumpAttribute = function(sp, label, id) {
    sp.tell('§6--- ' + label + ' (' + id + ') ---')
    var attr = resolveAttr(id)
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
    try { base = inst.getBaseValue() } catch (_) {}
    var value = 0
    try { value = inst.getValue() } catch (_) {}
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
      try { current = cap.getCurrentMana() } catch (_) {}
      var max = 0
      try { max = cap.getMaxMana() } catch (_) {}
      var glyphBonus = 0
      try { glyphBonus = cap.getGlyphBonus() } catch (_) {}
      var bookTier = 0
      try { bookTier = cap.getBookTier() } catch (_) {}
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

  ServerEvents.commandRegistry(function(event) {
    var Commands = event.commands

    event.register(
      Commands.literal('icraft')
        .then(Commands.literal('mana_debug')
          .requires(function(src) { return src.hasPermission(2) })
          .executes(function(ctx) {
            var sp
            try { sp = ctx.source.getPlayerOrException() } catch (e) {
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
  })

  console.log('[IridescentCraft] /icraft mana_debug command registered')
} catch (e) {
  console.warn('[IridescentCraft] mana_debug_command bootstrap FAILED: ' + e)
}
