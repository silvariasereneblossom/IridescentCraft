// =============================================================================
// [2026-06-01] RELOAD-SAFE: both hooks registered via mod registries, not raw
// MinecraftForge.EVENT_BUS listeners.
//   - ItemAttributeModifierEvent (mana_boost/regen/arcane_focus/vorpal_arcane) -> ItemAttributeRegistry
//   - LivingHurtEvent (arcane-vorpal decap) -> DamageModifierRegistry
// A raw EVENT_BUS.addListener leaves the JS closure on the Forge bus; KubeJS's
// ScriptType.unload() can't remove it, so after a context dispose (client
// resource reload for startup scripts; every /reload for server scripts) the
// next event fire crashes at enterActivationFunction (IllegalStateException:
// null) with the dead scope -- for the attribute hook that fires on every
// getAttributeModifiers query incl. container tooltip render (the chest-open
// crash). Both registries are @Mod.EventBusSubscriber handlers owned by the
// mod; the JS callbacks are replaceable DATA keyed by stable ids, so
// re-registration on reload overwrites the stale entries. Handler bodies are
// unchanged -- the registries pass the raw events.
// =============================================================================

// =============================================================================
// ICRAFT MAGIC ENCHANTS -- attribute effects for the iridescent_reforging
// enchant set (icraft:mana_boost / mana_regen / arcane_focus)
// Place in: kubejs/startup_scripts/enchants/icraft_magic_enchants.js
// =============================================================================
//
// 2026-05-21: Companion to the Java-side enchant registration in
// iridescent_tetra_expansion-1.0.0.jar (IcraftEnchantments). The Java
// side makes the enchants registerable + applicable to the
// #icraft:magic_weapon tag; the actual effect mechanics live here so
// tuning iterations don't require a mod rebuild.
//
// Three "static" enchants implemented here (effects active while held):
//   mana_boost   -- +max_mana per level. Levels 1-7 scale linearly.
//   mana_regen   -- +mana_regen per level. Levels 1-7 scale linearly.
//   arcane_focus -- +spell_power per level. Levels 1-5 scale linearly.
//
// Four "proc" enchants (spell_echo / mana_siphon / resonance /
// vorpal_arcane) need event hooks into Ars + ISS spell-cast events;
// scoped for follow-up (see design/magic_enchant_scope_2026-05-21.md).
//
// Each effect uses ItemAttributeModifierEvent so the bonus appears in
// the tooltip via the standard "When in Main Hand:" line AND gets
// applied to the holder by vanilla equipment-slot logic. Same pattern
// the existing WandTierAttributes class (Java side) uses for wand
// tier bonuses.
//
// Why the disabled ars_nouveau:mana_boost / ars_nouveau:mana_regen
// (apoth/enchantments.cfg, 2026-05-21): they were category-restricted
// to Ars items via the enchant's canEnchant. ISS books, simple staves,
// Dan's Magic wands couldn't pick them up. icraft:mana_boost +
// icraft:mana_regen replace them with a tag-based category covering
// the whole #icraft:magic_weapon roster.
// =============================================================================

// (IIFE - all KubeJS files of one type share a single Rhino scope; see dev/lint_kubejs_scope.py)
;(function () {
try {
  var ItemAttributeRegistry_ime = Java.loadClass('com.iridescentcraft.reforging.event.ItemAttributeRegistry')
  var DamageModifierRegistry_ime = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
  var EquipmentSlot_ime = Java.loadClass('net.minecraft.world.entity.EquipmentSlot')
  var AttributeModifier_ime = Java.loadClass('net.minecraft.world.entity.ai.attributes.AttributeModifier')
  var ForgeRegistries_ime = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
  var ResourceLocation_ime = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var UUID_ime = Java.loadClass('java.util.UUID')
  var EnchantmentHelper_ime = Java.loadClass('net.minecraft.world.item.enchantment.EnchantmentHelper')
  var PlayerClass_ime = Java.loadClass('net.minecraft.world.entity.player.Player')

  // Lethal THROUGH armor (operator ruling 2026-10-11). This handler runs on
  // LivingHurtEvent, i.e. BEFORE armor / protection / resistance: "health + 1"
  // set here left an armored mob alive. LethalBlow (tetra-expansion jar) raises
  // the FINAL damage of a marked victim to its remaining health + 1. Loaded in
  // a try: with a jar that predates it, the pre-armor amount below is all
  // there is (the old behaviour).
  var LethalBlow_ime = null
  try {
    LethalBlow_ime = Java.loadClass('com.iridescentcraft.reforging.event.LethalBlow')
  } catch (eLethal) {
    console.warn('[IridescentCraft] icraft_magic_enchants: LethalBlow not in the jar -- decapitation will not pierce armor')
  }

  // Enchant + attribute resource locations
  var MANA_BOOST_ENCHANT_ID    = new ResourceLocation_ime('iridescent_reforging', 'mana_boost')
  var MANA_REGEN_ENCHANT_ID    = new ResourceLocation_ime('iridescent_reforging', 'mana_regen')
  var ARCANE_FOCUS_ENCHANT_ID  = new ResourceLocation_ime('iridescent_reforging', 'arcane_focus')
  var VORPAL_ARCANE_ENCHANT_ID = new ResourceLocation_ime('iridescent_reforging', 'vorpal_arcane')

  // We target the unified player attributes so both ISS + Ars mage paths
  // benefit. attribute_sync.js handles the cross-system pipe; we just add
  // to the unified attribute and let the sync propagate.
  var MAX_MANA_ATTR_ID    = new ResourceLocation_ime('irons_spellbooks', 'max_mana')
  var MANA_REGEN_ATTR_ID  = new ResourceLocation_ime('irons_spellbooks', 'mana_regen')
  var SPELL_POWER_ATTR_ID = new ResourceLocation_ime('irons_spellbooks', 'spell_power')
  // Arcane Vorpal targets attributeslib crit attributes -- same as melee
  // Vorpal -- so they share the same all-additive crit model.
  var CRIT_CHANCE_ATTR_ID = new ResourceLocation_ime('attributeslib', 'crit_chance')
  var CRIT_DAMAGE_ATTR_ID = new ResourceLocation_ime('attributeslib', 'crit_damage')

  // Lazy attribute resolution -- ISS registers its attributes at common
  // setup, which fires AFTER this script loads but BEFORE the first
  // ItemAttributeModifierEvent. Cache once and reuse.
  var attrCache = {}
  var resolveAttr = function(rl) {
    var key = rl.toString()
    if (attrCache[key] !== undefined) return attrCache[key]
    var a = null
    try { a = ForgeRegistries_ime.ATTRIBUTES.getValue(rl) } catch (e) {}
    attrCache[key] = a
    return a
  }

  // Enchant + attribute resolution (same lazy pattern)
  var enchCache = {}
  var resolveEnch = function(rl) {
    var key = rl.toString()
    if (enchCache[key] !== undefined) return enchCache[key]
    var e = null
    try { e = ForgeRegistries_ime.ENCHANTMENTS.getValue(rl) } catch (ex) {}
    enchCache[key] = e
    return e
  }

  // Deterministic UUIDs so vanilla de-dups across queries.
  // Pattern: a1c9e206-XX (enchant index)-YY (level)
  // DO NOT change this pattern (2026-10-10 audit): these are the UUIDs live in
  // production. They are transient item modifiers (recomputed from the stack
  // on every query, never saved), so nothing persistent would orphan -- but a
  // box that still carries the pre-2026-05-31 raw-listener copy of this script
  // in kubejs/server_scripts runs BOTH handlers, and the two only collapse
  // into one bonus because they emit identical UUIDs. A different pattern here
  // would double every bonus there. (virtual_gold_clamp.js has its own mkUuid,
  // a1c9e203-...; the two never collided: each lives in its file's try block,
  // and this Rhino build scopes a `var` declared inside a block to that block.)
  var mkUuid = function(enchIdx, level) {
    var ei = (enchIdx < 16 ? '0' : '') + Number(enchIdx).toString(16)
    var lv = (level < 16 ? '0' : '') + Number(level).toString(16)
    return UUID_ime.fromString('a1c9e206-0000-0000-00' + ei + '-0000000000' + lv)
  }

  // Scaling tables -- linear by level, tuned for "feel" at max level.
  // Mana baseline is 100 mana in ISS. +30 mana at L7 mana_boost is +30%
  // pool. +20% mana_regen at L7 mana_regen feels meaningful but not
  // game-breaking. +20% spell_power at L5 arcane_focus matches the +25%
  // Archmage class bonus -- significant but stackable with affixes.
  var MANA_BOOST_PER_LEVEL          = 4.0    // +4 max mana per level (so L7 = +28)
  var MANA_REGEN_PER_LEVEL          = 0.03   // +3% mana_regen per level (L7 = +21%)
  var ARCANE_FOCUS_PER_LEVEL        = 0.04   // +4% spell_power per level (L5 = +20%)
  // Arcane Vorpal mirrors melee Vorpal's mixed shape (vorpal_rework.js):
  // +3% crit_chance + +5% crit_damage per level. L5 max = +15% chance + +25%
  // damage. Naturally lower max than melee Vorpal (L5 vs L8) since magic
  // weapons typically have higher base damage / spell scaling already.
  // PLUS decapitation roll on custom crit -- matches melee Vorpal's
  // kill-confirm signature. Scaled per level (L1=5% L5=25%). Triggered
  // via the custom KubeJS crit roll in attribute_sync.js (a DamageSource
  // carries no crit flag at all, so we rely on the icraft_last_
  // crit_tick stamp left by attribute_sync.js on the custom crit fire).
  var VORPAL_ARCANE_CHANCE_PER_LEVEL = 0.03
  var VORPAL_ARCANE_DAMAGE_PER_LEVEL = 0.05
  var VORPAL_ARCANE_DECAP_PER_LEVEL  = 0.05

  // Boss blocklist (melee Vorpal's list in vorpal_rework.js plus five more).
  // Decap on these entity types is unfair to the boss-fight pacing. The
  // pack's own boss roster is checked as well -- see isBossVictim below.
  var VORPAL_BOSS_BLOCKLIST = {
    'minecraft:wither': 1,
    'minecraft:ender_dragon': 1,
    'cataclysm:netherite_monstrosity': 1,
    'cataclysm:ender_guardian': 1,
    'cataclysm:ignis': 1,
    'cataclysm:the_leviathan': 1,
    'cataclysm:maledictus': 1,
    'cataclysm:ancient_remnant': 1,
    'twilightforest:naga': 1,
    'twilightforest:lich': 1,
    'twilightforest:hydra': 1,
    'twilightforest:ur_ghast': 1,
    'twilightforest:knight_phantom': 1,
    'twilightforest:snow_queen': 1,
    'twilightforest:minoshroom': 1
  }

  var handler = function(event) {
      try {
        if (event.getSlotType() !== EquipmentSlot_ime.MAINHAND &&
            event.getSlotType() !== EquipmentSlot_ime.OFFHAND) return
        var stack = event.getItemStack()
        if (!stack || stack.isEmpty()) return

        // Mana Boost
        var manaBoostEnch = resolveEnch(MANA_BOOST_ENCHANT_ID)
        if (manaBoostEnch != null) {
          var lvl = EnchantmentHelper_ime.getItemEnchantmentLevel(manaBoostEnch, stack)
          if (lvl > 0) {
            var attr = resolveAttr(MAX_MANA_ATTR_ID)
            if (attr != null) {
              event.addModifier(attr,
                new AttributeModifier_ime(mkUuid(1, lvl), 'icraft_mana_boost',
                  MANA_BOOST_PER_LEVEL * lvl, AttributeModifier_ime.Operation.ADDITION))
            }
          }
        }

        // Mana Regen
        var manaRegenEnch = resolveEnch(MANA_REGEN_ENCHANT_ID)
        if (manaRegenEnch != null) {
          var lvl = EnchantmentHelper_ime.getItemEnchantmentLevel(manaRegenEnch, stack)
          if (lvl > 0) {
            var attr = resolveAttr(MANA_REGEN_ATTR_ID)
            if (attr != null) {
              event.addModifier(attr,
                new AttributeModifier_ime(mkUuid(2, lvl), 'icraft_mana_regen',
                  MANA_REGEN_PER_LEVEL * lvl, AttributeModifier_ime.Operation.MULTIPLY_BASE))
            }
          }
        }

        // Arcane Focus
        var arcaneFocusEnch = resolveEnch(ARCANE_FOCUS_ENCHANT_ID)
        if (arcaneFocusEnch != null) {
          var lvl = EnchantmentHelper_ime.getItemEnchantmentLevel(arcaneFocusEnch, stack)
          if (lvl > 0) {
            var attr = resolveAttr(SPELL_POWER_ATTR_ID)
            if (attr != null) {
              event.addModifier(attr,
                new AttributeModifier_ime(mkUuid(3, lvl), 'icraft_arcane_focus',
                  ARCANE_FOCUS_PER_LEVEL * lvl, AttributeModifier_ime.Operation.MULTIPLY_BASE))
            }
          }
        }

        // Arcane Vorpal -- mixed crit_chance + crit_damage, spell-routed.
        // The custom KubeJS crit roll (attribute_sync.js) reads
        // attributeslib:crit_chance + attributeslib:crit_damage post the
        // 2026-05-21 bridge, so these modifiers contribute to spell-source
        // damage automatically (spells go through LivingHurtEvent same as
        // melee). No proc handler needed beyond the attribute add here.
        var vorpalArcaneEnch = resolveEnch(VORPAL_ARCANE_ENCHANT_ID)
        if (vorpalArcaneEnch != null) {
          var lvl = EnchantmentHelper_ime.getItemEnchantmentLevel(vorpalArcaneEnch, stack)
          if (lvl > 0) {
            var chAttr = resolveAttr(CRIT_CHANCE_ATTR_ID)
            if (chAttr != null) {
              event.addModifier(chAttr,
                new AttributeModifier_ime(mkUuid(4, lvl), 'icraft_vorpal_arcane_chance',
                  VORPAL_ARCANE_CHANCE_PER_LEVEL * lvl, AttributeModifier_ime.Operation.ADDITION))
            }
            var dmgAttr = resolveAttr(CRIT_DAMAGE_ATTR_ID)
            if (dmgAttr != null) {
              event.addModifier(dmgAttr,
                new AttributeModifier_ime(mkUuid(5, lvl), 'icraft_vorpal_arcane_damage',
                  VORPAL_ARCANE_DAMAGE_PER_LEVEL * lvl, AttributeModifier_ime.Operation.ADDITION))
            }
          }
        }
      } catch (e) {
        // Fail-soft -- never crash an attribute query on enchant lookup failure
      }
  }

  ItemAttributeRegistry_ime.register('icraft.magic_enchants_attr', handler)

  // ---------------------------------------------------------------------
  // Arcane Vorpal decap hook
  // ---------------------------------------------------------------------
  // A DamageSource has no crit flag (vanilla 1.20.1 has no
  // DamageSource.isCritical(), and no installed mod adds one). Spell
  // damage flows through LivingHurtEvent same as melee, and the only
  // crit signal is the custom KubeJS roll in attribute_sync.js (which
  // stamps icraft_last_crit_tick when it fires). This listener runs in
  // the registry's LATE phase -- after attribute_sync's NORMAL-phase
  // crit roll -- so the stamp is fresh by the time we read it.
  //
  // [2026-10-11] This handler had never run: it threw at `source.getEntity()`
  // on every hit, inside its own catch. What scripts see on this KubeJS
  // build (javap of kubejs-forge-2001.6.5, @RemapForJS on its mixins):
  //   DamageSource.getEntity()  -> getActual()      (getEntity is undefined)
  //   Entity.level()            -> hidden; `entity.level` is the property
  //   Entity.getType()          -> getEntityType(); getType() is KubeJS's
  //                                own registry-id STRING
  // The last one also broke the boss blocklist: ENTITY_TYPES.getKey(<string>)
  // answers the registry's DEFAULT key (minecraft:pig) for every victim.

  // Registry id of an entity ('minecraft:zombie'), '' when unknown.
  var entityIdOf = function(entity) {
    var s = ''
    try { s = String(entity.getType()) } catch (e) { s = '' }
    if (s.indexOf(':') > 0) return s
    try {
      var key = ForgeRegistries_ime.ENTITY_TYPES.getKey(entity.getEntityType())
      if (key != null) s = String(key.toString())
    } catch (e2) {}
    return s
  }

  // "Don't behead bosses": the list above, plus every id the pack itself
  // treats as a boss (global.icraft.core.isBoss, server_scripts/0_lib_core.js
  // -- `global` is shared by all script types and the server scripts are
  // loaded whenever a world is running). If that library is not there the
  // list above still applies.
  var isBossVictim = function(victimId) {
    if (VORPAL_BOSS_BLOCKLIST[victimId] === 1) return true
    try {
      var core = global.icraft ? global.icraft.core : null
      if (core && typeof core.isBoss === 'function' && core.isBoss(victimId) === true) return true
    } catch (e) {}
    return false
  }

  var decapWarned = false
  var decapHandler = function(event) {
      try {
        var source = event.getSource()
        if (source == null) return
        // Secondary damage (splash / chain / reflect dealt through
        // icraft.core.dealDamage) is not a swing or a cast of its own: the crit
        // roll does not run for it, so a same-tick stamp would be someone
        // else's crit. Same rule as every onHurt handler (0_lib_core.js).
        try {
          var coreLib = global.icraft ? global.icraft.core : null
          if (coreLib && typeof coreLib.secondary === 'function' && coreLib.secondary(event.getEntity())) return
        } catch (eSecondary) {}
        var attacker = source.getActual()
        if (!(attacker instanceof PlayerClass_ime)) return
        var weapon = attacker.getMainHandItem()
        if (weapon == null || weapon.isEmpty()) return
        var ench = resolveEnch(VORPAL_ARCANE_ENCHANT_ID)
        if (ench == null) return
        var level = EnchantmentHelper_ime.getItemEnchantmentLevel(ench, weapon)
        if (level <= 0) return

        // Did the custom crit roll fire on THIS tick? If not, no decap.
        // Same clock, read the same way as the writer (attribute_sync.js:
        // putLong('icraft_last_crit_tick', Number(attacker.level.time)) -- the
        // world clock since 2026-10-12, not server.tickCount).
        var lastCrit = Number(attacker.persistentData.getLong('icraft_last_crit_tick'))
        var curTick = Number(attacker.level.time)
        if (lastCrit !== curTick) return

        var victim = event.getEntity()
        if (victim instanceof PlayerClass_ime) return
        var victimId = entityIdOf(victim)
        if (victimId.indexOf(':') < 0) return
        if (isBossVictim(victimId)) return

        var chance = VORPAL_ARCANE_DECAP_PER_LEVEL * level
        if (Math.random() >= chance) return

        // Raise the damage to the victim's health + 1. Never LOWER it: a hit
        // that is already bigger stays as it is.
        var lethal = victim.getHealth() + 1.0
        if (lethal > event.getAmount()) event.setAmount(lethal)
        // ...and make it stick after mitigation (see LethalBlow above).
        if (LethalBlow_ime != null) LethalBlow_ime.mark(victim)
      } catch (e) {
        // Fail-soft, but not silent: say so once per load.
        if (!decapWarned) {
          decapWarned = true
          console.warn('[IridescentCraft] arcane_vorpal decap handler threw (logged once): ' + e)
        }
      }
  }
  // LATE phase: runs after attribute_sync's NORMAL crit roll stamps
  // icraft_last_crit_tick (preserves the old EventPriority.LOW ordering).
  DamageModifierRegistry_ime.registerLate('icraft.magic_enchants_decap', decapHandler)

  console.log('[IridescentCraft] icraft_magic_enchants loaded (mana_boost + mana_regen + arcane_focus stat hooks + arcane_vorpal decap)')
} catch (e) {
  console.warn('[IridescentCraft] icraft_magic_enchants bootstrap FAILED: ' + e)
}
})()
