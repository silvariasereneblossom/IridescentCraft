// =============================================================================
// DIAG: !armormods — dump every LIVE modifier on the armor attributes
// =============================================================================
// Investigation 2026-06-11: a flat -4 generic.armor ADDITION modifier on
// silvieserene survives a full unequip, and /data get (saved NBT) shows only
// the justlevelingfork passive at 0.0 — so the -4 is TRANSIENT, re-applied at
// runtime by something. Static analysis cleared every flat-armor source in
// the pack (faefolk + witch_of_ink are toughness-only, armor_weight.js is
// multiply_base-only, gems/affixes/set bonuses are positive-only, JLFork's
// passive math is configValue/maxLevels*level with all-positive configs).
//
// /data only shows PERSISTED modifiers; this command reads the live
// AttributeInstance, which includes transient ones (curios, Apoli powers,
// script-applied) WITH their names + UUIDs — the name identifies the author.
//
// Usage (any player, in chat):  !armormods
// Remove after the armor investigation closes.
// =============================================================================

PlayerEvents.chat(function(event) {
  if (event.message.trim().toLowerCase() !== '!armormods') return
  event.cancel()
  var player = event.player

  var targets = ['minecraft:generic.armor', 'minecraft:generic.armor_toughness']
  targets.forEach(function(id) {
    try {
      var inst = player.getAttribute(id)
      if (!inst) {
        player.tell('[armormods] no attribute instance for ' + id)
        return
      }
      player.tell('[armormods] == ' + id + '  base=' + inst.getBaseValue() + '  final=' + inst.getValue())
      var mods = inst.getModifiers()
      var count = 0
      mods.forEach(function(m) {
        count++
        player.tell('[armormods]   name="' + m.getName() + '"  amount=' + m.getAmount() + '  op=' + m.getOperation() + '  uuid=' + m.getId())
      })
      if (count === 0) player.tell('[armormods]   (no modifiers)')
    } catch (e) {
      player.tell('[armormods] error reading ' + id + ': ' + e)
    }
  })
  player.tell('[armormods] done — paste these lines back to the dev session.')
})

console.log('[IridescentCraft] diag_armor_modifiers loaded — !armormods chat command (temporary diagnostic)')
