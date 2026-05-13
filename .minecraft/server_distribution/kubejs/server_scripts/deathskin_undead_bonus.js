// =============================================================================
// DEATHSKIN UNDEAD-DAMAGE BONUS
// Place in: kubejs/server_scripts/deathskin_undead_bonus.js
// =============================================================================
//
// Iridescent Reforging armor with a `skin/deathskin` (rotten-flesh) module
// variant grants the wearer +5% outgoing damage against undead.
//
// No Forge / Apothic / ISS attribute represents "damage vs undead" generically,
// so this is implemented as a LivingHurtEvent hook that multiplies the damage
// amount on hit. Pairs with the material's +2.5% mana_regen (handled by the
// vanilla attribute system, not this script).
//
// Detection: walk the attacker's 4 armor slots; for each Iridescent Reforging
// modular armor item, scan its NBT for a module variant containing '/deathskin'.
// If ANY slot has a deathskin module, apply the +5% multiplier to the
// outgoing damage. Stacking is single-instance (one deathskin piece = +5%, two
// pieces = still +5%) -- this is a "set bonus" style flag, not stat addition.
//
// Why event-based vs an attribute: no `damage_vs_undead` attribute exists in
// any installed mod (verified 2026-05-13). LivingHurtEvent is the canonical
// Forge hook for "modify outgoing damage by attacker state".
//
// Memory: feedback_wiki_reference.md (Rhino var-not-const in reentrant scopes).
// =============================================================================

try {
  var MinecraftForge_ds = Java.loadClass('net.minecraftforge.common.MinecraftForge')
  var LivingHurtEvent = Java.loadClass('net.minecraftforge.event.entity.living.LivingHurtEvent')
  var EventPriority_ds = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority')
  var Consumer_ds = Java.loadClass('java.util.function.Consumer')
  var LivingEntity_ds = Java.loadClass('net.minecraft.world.entity.LivingEntity')
  var MobType_ds = Java.loadClass('net.minecraft.world.entity.MobType')

  var UNDEAD_MULTIPLIER = 1.05

  var hasDeathskin = function(stack) {
    try {
      if (!stack || stack.isEmpty()) return false
      // Only Iridescent Reforging armor carries Tetra modules
      var id = String(stack.getItem().builtInRegistryHolder().key().location())
      if (id.indexOf('iridescent_reforging:') !== 0) return false
      var tag = stack.getTag ? stack.getTag() : null
      if (!tag) return false
      // Tetra stores module variants in the stack NBT. The variant
      // identifier (e.g. "basic_boot_sole/deathskin") is the value we
      // care about. Convert the whole tag to string and substring-check
      // -- robust against Tetra version-specific NBT layout changes.
      var nbtStr = String(tag)
      return nbtStr.indexOf('/deathskin') >= 0
    } catch (e) { return false }
  }

  var handler = new Consumer_ds({
    accept: function(event) {
      try {
        var target = event.getEntity()
        if (!target || !(target instanceof LivingEntity_ds)) return
        // Vanilla mob-type check: SkeletonHorse/Skeleton/Zombie/etc. all
        // declare MobType.UNDEAD via getMobType(). Player corpses don't.
        var mobType = target.getMobType()
        if (mobType !== MobType_ds.UNDEAD) return

        var source = event.getSource()
        var attacker = source ? source.getEntity() : null
        if (!attacker || !(attacker instanceof LivingEntity_ds)) return

        var hasDS = false
        var armorIter = attacker.getArmorSlots().iterator()
        while (armorIter.hasNext()) {
          if (hasDeathskin(armorIter.next())) { hasDS = true; break }
        }
        if (!hasDS) return

        var amount = event.getAmount()
        event.setAmount(amount * UNDEAD_MULTIPLIER)

        if (!global._deathskin_seen) {
          global._deathskin_seen = true
          console.log('[deathskin] applied +5% vs undead (logging once; target=' +
                      target.getType().toString() + ' damage=' + amount.toFixed(2) +
                      ' -> ' + (amount * UNDEAD_MULTIPLIER).toFixed(2) + ')')
        }
      } catch (e) {
        // Fail-soft: never let a bonus script break combat
      }
    }
  })

  MinecraftForge_ds.EVENT_BUS.addListener(EventPriority_ds.NORMAL, false,
                                          LivingHurtEvent, handler)
  console.log('[IridescentCraft] deathskin_undead_bonus loaded (+5% vs undead)')
} catch (e) {
  console.warn('[IridescentCraft] deathskin_undead_bonus bootstrap FAILED: ' + e)
}
