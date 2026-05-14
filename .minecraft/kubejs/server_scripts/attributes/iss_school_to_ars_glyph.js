// =============================================================================
// ISS SCHOOL SP -> ARS GLYPH-SCHOOL DAMAGE BRIDGE (broader coverage)
// =============================================================================
// Companion to iss_school_to_ars_spell.js. The sibling script catches the 4
// Ars elemental damage TYPES (flare/frost/windshear/crush) at LivingHurtEvent
// time. But many elemental-school glyphs route damage through VANILLA damage
// types (Ignite -> minecraft:on_fire, Lightning -> minecraft:lightning_bolt,
// Explosion -> minecraft:explosion), so the LivingHurtEvent handler misses them.
//
// This script hooks Ars's SpellDamageEvent.Pre, which fires BEFORE the
// damage is dealt and carries the SpellContext (so we can inspect the spell's
// glyphs and their elemental schools). It applies the ISS school multiplier
// at that layer, before the damage reaches LivingHurtEvent.
//
// Anti-double-count: SpellDamageEvent.Pre handler SKIPS damage sources whose
// type is already in the LivingHurtEvent handler's map (the 4 Ars elementals).
// Those go through the LivingHurtEvent path; everything else goes through here.
//
// Mapping (Ars elemental school -> ISS attribute):
//   fire   -> irons_spellbooks:fire_spell_power
//   water  -> irons_spellbooks:ice_spell_power
//   air    -> irons_spellbooks:lightning_spell_power
//   earth  -> irons_spellbooks:nature_spell_power
//
// Multi-school spell behavior: scans the glyph recipe for elemental schools,
// applies the FIRST elemental school's multiplier. If a spell mixes fire +
// water glyphs, the first elemental in the recipe wins. Spells with NO
// elemental school are not multiplied (use generic Ars spell math).
//
// Residual coverage gap: damage that fires from Ars-spawned entities AFTER
// the spell context is gone (e.g., EffectLightning's vanilla lightning bolt
// striking an entity 20 ticks later) doesn't carry SpellDamageEvent context
// and won't be caught. EffectIgnite's `setSecondsOnFire` -> minecraft:on_fire
// damage is the most impactful instance. To cover those, we'd need to mark
// the affected entity with a "burning-by-ars-fire-cast" NBT flag at cast
// time and boost subsequent on_fire damage. Deferred.
//
// Pairs with:
//   kubejs/server_scripts/attributes/iss_school_to_ars_spell.js -- the
//     LivingHurtEvent path for direct Ars elemental damage types.
// =============================================================================

try {
  var MinecraftForge_aspg = Java.loadClass('net.minecraftforge.common.MinecraftForge')
  var SpellDamageEvent_Pre = Java.loadClass('com.hollingsworth.arsnouveau.api.event.SpellDamageEvent$Pre')
  var EventPriority_aspg = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority')
  var Consumer_aspg = Java.loadClass('java.util.function.Consumer')
  var ResourceLocation_aspg = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var ForgeRegistries_aspg = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')

  // Ars school id -> ISS school SP attribute id
  var SCHOOL_TO_ATTR = {
    'fire':  'irons_spellbooks:fire_spell_power',
    'water': 'irons_spellbooks:ice_spell_power',
    'air':   'irons_spellbooks:lightning_spell_power',
    'earth': 'irons_spellbooks:nature_spell_power',
  }

  // Damage types already handled by the LivingHurtEvent sibling -- skip these
  // here to avoid double-multiplication.
  var SKIP_DAMAGE_TYPES = {
    'ars_nouveau:flare':     true,
    'ars_nouveau:frost':     true,
    'ars_nouveau:windshear': true,
    'ars_nouveau:crush':     true,
  }

  // Resolve ISS attributes once at script load
  var resolvedAttrs = {}
  for (var schoolId in SCHOOL_TO_ATTR) {
    try {
      var rl = ResourceLocation_aspg.tryParse(SCHOOL_TO_ATTR[schoolId])
      var attr = rl ? ForgeRegistries_aspg.ATTRIBUTES.getValue(rl) : null
      if (attr) resolvedAttrs[schoolId] = attr
    } catch (e) {}
  }
  var resolvedCount = Object.keys(resolvedAttrs).length
  if (resolvedCount === 0) {
    console.warn('[iss_school_to_ars_glyph] no ISS attributes resolved; ISS likely absent')
  }

  // Walk the spell's glyph recipe and return the first ISS attribute that
  // matches an elemental school in the spell. Returns null if no elemental.
  var pickAttrForSpell = function(spell) {
    if (!spell || !spell.recipe) return null
    var iter = spell.recipe.iterator()
    while (iter.hasNext()) {
      var part = iter.next()
      var schools = part.spellSchools
      if (!schools) continue
      var schoolIter = schools.iterator()
      while (schoolIter.hasNext()) {
        var school = schoolIter.next()
        var id = school.getId()
        if (resolvedAttrs[id]) {
          return resolvedAttrs[id]
        }
      }
    }
    return null
  }

  var handler = new Consumer_aspg({
    accept: function(event) {
      try {
        var source = event.damageSource
        if (!source) return

        // Skip damage types already handled by LivingHurtEvent sibling
        var typeId = null
        try {
          var holder = source.typeHolder()
          if (holder) {
            var k = holder.unwrapKey()
            if (k.isPresent()) typeId = k.get().location().toString()
          }
        } catch (e) {}
        if (typeId && SKIP_DAMAGE_TYPES[typeId]) return

        var context = event.context
        if (!context) return
        var spell = context.spell
        if (!spell) return
        var attr = pickAttrForSpell(spell)
        if (!attr) return

        var caster = event.caster
        if (!caster) return
        var multiplier = caster.getAttributeValue(attr)
        if (multiplier <= 1.0) return  // no boost above baseline

        var amount = event.damage
        event.damage = amount * multiplier

        if (!global._iss_glyph_seen) {
          global._iss_glyph_seen = true
          console.log('[iss_school_to_ars_glyph] ' + amount.toFixed(2) +
                      ' * ' + multiplier.toFixed(3) + ' = ' +
                      (amount * multiplier).toFixed(2) +
                      ' (damageType=' + typeId + ', logging once)')
        }
      } catch (e) {
        // Fail-soft: never let attribute math crash spell damage
      }
    }
  })

  MinecraftForge_aspg.EVENT_BUS.addListener(EventPriority_aspg.NORMAL, false,
                                            SpellDamageEvent_Pre, handler)
  console.log('[iss_school_to_ars_glyph] loaded (' + resolvedCount +
              ' elemental schools mapped via SpellDamageEvent.Pre)')
} catch (e) {
  console.warn('[iss_school_to_ars_glyph] bootstrap FAILED: ' + e)
}
