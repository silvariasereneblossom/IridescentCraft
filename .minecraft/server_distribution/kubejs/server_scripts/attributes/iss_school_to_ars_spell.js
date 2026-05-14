// =============================================================================
// ISS SCHOOL SP -> ARS SPELL DAMAGE BRIDGE
// =============================================================================
// Design intent (Silvaria, 2026-05-14): "wire ISS elemental properties into
// Ars elemental glyphs that already have an elemental school". A player with
// ISS fire_spell_power should also boost their Ars fire spells; same for
// ice / lightning / nature.
//
// Mechanism: Forge LivingHurtEvent intercepts ANY damage. When the source's
// damage_type is one of the 4 Ars elemental damage types and the attacker is
// a player, multiply the damage by (1 + matching_iss_school_sp).
//
// Mapping (Ars damage type -> ISS attribute):
//   ars_nouveau:flare      (fire)   -> irons_spellbooks:fire_spell_power
//   ars_nouveau:frost      (ice)    -> irons_spellbooks:ice_spell_power
//   ars_nouveau:windshear  (air)    -> irons_spellbooks:lightning_spell_power
//   ars_nouveau:crush      (earth)  -> irons_spellbooks:nature_spell_power
//
// Air<->Lightning and Earth<->Nature are thematic mappings (Ars doesn't have
// lightning or nature damage types; these are the closest fits).
//
// Generic ars_nouveau:spell intentionally NOT mapped per design call -- non-
// elemental Ars spells (Harm, etc.) stay on their own damage math.
//
// Doesn't double-count: ISS spells have their own internal SP math; this
// handler only fires when the damage source is Ars's, so ISS spells flow
// through their native code path uninterrupted.
//
// Coverage gap: glyphs whose damage flows through VANILLA damage types
// (EffectIgnite uses setSecondsOnFire -> minecraft:on_fire,
// EffectLightning spawns a vanilla lightning entity, EffectExplosion creates
// a vanilla explosion) don't carry an Ars damage type at hit time and won't
// be caught here. Direct Ars elemental damage (EffectFlare, EffectFrost,
// EffectColdSnap, EffectWindshear, EffectCrush, etc.) -- the school-direct
// ones -- IS caught.
//
// Pairs with:
//   datapack_sources/icraft_iss_gem_buffs/  -- buffed ISS gem values that
//     now feed Ars damage too
//   kubejs/server_scripts/attributes/mana_bridge.js  -- the matching
//     ISS<->Ars mana_regen / max_mana bridge
// =============================================================================

try {
  var MinecraftForge_aspb = Java.loadClass('net.minecraftforge.common.MinecraftForge')
  var LivingHurtEvent_aspb = Java.loadClass('net.minecraftforge.event.entity.living.LivingHurtEvent')
  var EventPriority_aspb = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority')
  var Consumer_aspb = Java.loadClass('java.util.function.Consumer')
  var LivingEntity_aspb = Java.loadClass('net.minecraft.world.entity.LivingEntity')
  var Player_aspb = Java.loadClass('net.minecraft.world.entity.player.Player')
  var ResourceLocation_aspb = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var ForgeRegistries_aspb = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')

  // Ars elemental damage type ID -> ISS school SP attribute ID
  // Scoped to the 4 elemental types only; generic ars_nouveau:spell skipped
  // intentionally so non-elemental glyphs (Harm, etc.) stay on their own math.
  var SCHOOL_MAP = {
    'ars_nouveau:flare':     'irons_spellbooks:fire_spell_power',
    'ars_nouveau:frost':     'irons_spellbooks:ice_spell_power',
    'ars_nouveau:windshear': 'irons_spellbooks:lightning_spell_power',
    'ars_nouveau:crush':     'irons_spellbooks:nature_spell_power',
  }

  // Resolve all ISS attributes once at script load
  var resolvedAttrs = {}
  for (var arsId in SCHOOL_MAP) {
    var issId = SCHOOL_MAP[arsId]
    try {
      var rl = ResourceLocation_aspb.tryParse(issId)
      var attr = rl ? ForgeRegistries_aspb.ATTRIBUTES.getValue(rl) : null
      if (attr) resolvedAttrs[arsId] = attr
    } catch (e) {}
  }
  var resolvedCount = Object.keys(resolvedAttrs).length
  if (resolvedCount === 0) {
    console.warn('[iss_school_to_ars] no ISS attributes resolved; ISS likely absent')
  }

  var handler = new Consumer_aspb({
    accept: function(event) {
      try {
        var source = event.getSource()
        if (!source) return
        // Get the damage type's resource location
        var typeHolder = source.typeHolder()
        if (!typeHolder) return
        var typeKey = typeHolder.unwrapKey()
        if (!typeKey.isPresent()) return
        var typeId = typeKey.get().location().toString()

        var matchedAttr = resolvedAttrs[typeId]
        if (!matchedAttr) return

        var attacker = source.getEntity()
        if (!attacker || !(attacker instanceof LivingEntity_aspb)) return

        // ISS school SP attributes have base value 1.0 (multiplicative
        // baseline) and modifiers ADD on top. So getAttributeValue() returns
        // 1.0 for no gear, 1.45 for +45% boost. Use it directly as the
        // damage multiplier; bail if no boost above baseline.
        var multiplier = attacker.getAttributeValue(matchedAttr)
        if (multiplier <= 1.0) return

        var amount = event.getAmount()
        event.setAmount(amount * multiplier)

        if (!global._iss_to_ars_seen) {
          global._iss_to_ars_seen = true
          var name = attacker instanceof Player_aspb ? attacker.getGameProfile().getName() : attacker.getType().toString()
          console.log('[iss_school_to_ars] ' + name + ' ' + typeId + ' damage ' +
                      amount.toFixed(2) + ' * ' + multiplier.toFixed(3) +
                      ' -> ' + (amount * multiplier).toFixed(2) + ' (logging once)')
        }
      } catch (e) {
        // Fail-soft: never let attribute math crash damage processing
      }
    }
  })

  MinecraftForge_aspb.EVENT_BUS.addListener(EventPriority_aspb.NORMAL, false,
                                            LivingHurtEvent_aspb, handler)
  console.log('[iss_school_to_ars] loaded (' + resolvedCount + ' damage-type mappings)')
} catch (e) {
  console.warn('[iss_school_to_ars] bootstrap FAILED: ' + e)
}
