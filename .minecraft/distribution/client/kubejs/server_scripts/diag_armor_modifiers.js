// =============================================================================
// DIAG: /icraft armormods — dump every LIVE modifier on the armor attributes
// =============================================================================
// Born from the 2026-06-11 armor investigation: a flat -4 generic.armor on
// silvieserene turned out to be the Archmage glass_frame Origins power
// (Apoli renders modifiers without a "name" field as "Unnamed
// EntityAttributeModifier", and /data get only shows PERSISTED modifiers,
// so neither surface identified the author). This command reads the live
// AttributeInstance — transient modifiers included (curios, Apoli powers,
// script-applied) — WITH names + UUIDs, so the next hunt starts here
// instead of at static analysis.
//
// Kept as a permanent diagnostic alongside /icraft mana_debug.
// Usage (any player): /icraft armormods
// =============================================================================

try {
  var armormods_dump = function(sp, id) {
    try {
      var inst = sp.getAttribute(id)
      if (!inst) {
        sp.tell('§7[armormods] no attribute instance for ' + id)
        return
      }
      sp.tell('§6[armormods] == ' + id + '§r  base=' + inst.getBaseValue() + '  final=§a' + inst.getValue())
      var count = 0
      inst.getModifiers().forEach(function(m) {
        count++
        sp.tell('§7[armormods]   name="§f' + m.getName() + '§7"  amount=§f' + m.getAmount()
          + '§7  op=§f' + m.getOperation() + '§7  uuid=§8' + m.getId())
      })
      if (count === 0) sp.tell('§7[armormods]   (no modifiers)')
    } catch (e) {
      sp.tell('§c[armormods] error reading ' + id + ': ' + e)
    }
  }

  ServerEvents.commandRegistry(function(event) {
    var Commands = event.commands

    event.register(
      Commands.literal('icraft')
        .then(Commands.literal('armormods')
          .executes(function(ctx) {
            var sp
            try { sp = ctx.source.getPlayerOrException() } catch (e) {
              ctx.source.sendFailure(Text.of('Must be run as a player'))
              return 0
            }
            armormods_dump(sp, 'minecraft:generic.armor')
            armormods_dump(sp, 'minecraft:generic.armor_toughness')
            return 1
          })
        )
    )
  })

  console.log('[IridescentCraft] /icraft armormods command registered')
} catch (e) {
  console.warn('[IridescentCraft] diag_armor_modifiers bootstrap FAILED: ' + e)
}
