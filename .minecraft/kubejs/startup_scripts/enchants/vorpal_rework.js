// =============================================================================
// [2026-06-01] RELOAD-SAFE: both hooks registered via mod registries, not raw
// MinecraftForge.EVENT_BUS listeners.
//   - ItemAttributeModifierEvent (crit_chance/crit_damage add) -> ItemAttributeRegistry
//   - LivingHurtEvent (decap-on-crit) -> DamageModifierRegistry
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
// VORPAL REWORK -- crit-coupled decapitation
// Place in: kubejs/startup_scripts/enchants/vorpal_rework.js
// =============================================================================
//
// 2026-05-21: Per user direction, rework ensorcellation:vorpal as a
// MIXED crit-chance + crit-damage stacker, not a pure damage modifier.
// Pure damage was redundant with Lethal / Vorpal-affix; the mixed shape
// gives Vorpal its own identity as a "land more crits AND make them
// hurt more, then sometimes behead."
//
//   Per-level breakdown (additive, scales with INERT_THRESHOLD-style
//   linearity for tooltip predictability):
//     +3% crit_chance  (attributeslib:crit_chance, ADDITION)
//     +5% crit_damage  (attributeslib:crit_damage, ADDITION on 1.5 base)
//   At L8 max: +24% crit chance + +40% crit damage + 40% behead-on-crit.
//
//   Decapitation roll: unchanged, fires ONLY on critical hits, 5% per
//   level. Signature melee-Vorpal mechanic stays here. (The magic-weapon
//   counterpart, iridescent_reforging:vorpal_arcane, got its own decap
//   back the same day -- 7bd470d7, icraft_magic_enchants.js -- on the
//   same crit signal; an earlier note here said it omits decap.)
//
// We do NOT modify Ensorcellation's VorpalEnchantment Java class --
// instead we layer behavior on top via:
//   1. ItemAttributeModifierEvent -- when the held item has vorpal,
//      add crit_chance + crit_damage modifiers ADDITION scaled to level.
//   2. LivingHurtEvent on the player-source attack -- detect crit
//      and roll decapitation per level.
//
// The original Ensorcellation roll-for-extra-damage path still fires
// because we don't disable the native enchant code -- but the crit-
// linked bonuses are the new primary mechanic.
// =============================================================================

// (IIFE - all KubeJS files of one type share a single Rhino scope; see dev/lint_kubejs_scope.py)
;(function () {
try {
  var ItemAttributeRegistry_vrp = Java.loadClass('com.iridescentcraft.reforging.event.ItemAttributeRegistry')
  var DamageModifierRegistry_vrp = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
  var EquipmentSlot_vrp = Java.loadClass('net.minecraft.world.entity.EquipmentSlot')
  var AttributeModifier_vrp = Java.loadClass('net.minecraft.world.entity.ai.attributes.AttributeModifier')
  var ForgeRegistries_vrp = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
  var ResourceLocation_vrp = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var UUID_vrp = Java.loadClass('java.util.UUID')
  var EnchantmentHelper_vrp = Java.loadClass('net.minecraft.world.item.enchantment.EnchantmentHelper')
  var Player_vrp = Java.loadClass('net.minecraft.world.entity.player.Player')

  // Lethal THROUGH armor (operator ruling 2026-10-11). This handler runs on
  // LivingHurtEvent, i.e. BEFORE armor / protection / resistance: "health + 1"
  // set here left an armored mob alive. LethalBlow (tetra-expansion jar) raises
  // the FINAL damage of a marked victim to its remaining health + 1. Loaded in
  // a try: with a jar that predates it, the pre-armor amount below is all
  // there is (the old behaviour).
  var LethalBlow_vrp = null
  try {
    LethalBlow_vrp = Java.loadClass('com.iridescentcraft.reforging.event.LethalBlow')
  } catch (eLethal) {
    console.warn('[IridescentCraft] vorpal_rework: LethalBlow not in the jar -- decapitation will not pierce armor')
  }

  var VORPAL_ENCHANT_ID = new ResourceLocation_vrp('ensorcellation', 'vorpal')
  var CRIT_CHANCE_ATTR_ID = new ResourceLocation_vrp('attributeslib', 'crit_chance')
  var CRIT_DAMAGE_ATTR_ID = new ResourceLocation_vrp('attributeslib', 'crit_damage')

  // Deterministic UUIDs per level so duplicate adds at different levels
  // de-dup correctly (vanilla AttributeMap dedup is by UUID). Two
  // distinct UUIDs (chance + damage) so both modifiers register
  // independently for the same enchant level.
  var mkVorpalChanceUuid = function(level) {
    var hex = (level < 16 ? '0' : '') + Number(level).toString(16)
    return UUID_vrp.fromString('a1c9e205-0001-0000-0000-0000000000' + hex)
  }
  var mkVorpalDamageUuid = function(level) {
    var hex = (level < 16 ? '0' : '') + Number(level).toString(16)
    return UUID_vrp.fromString('a1c9e205-0002-0000-0000-0000000000' + hex)
  }

  // Resolve attributes lazily; AttributeFix may not have populated
  // registry at script-load time for non-vanilla attributes.
  var critChanceAttr = null
  var critDamageAttr = null
  var resolveCritChance = function() {
    if (critChanceAttr !== null) return critChanceAttr
    try { critChanceAttr = ForgeRegistries_vrp.ATTRIBUTES.getValue(CRIT_CHANCE_ATTR_ID) } catch (e) {}
    return critChanceAttr
  }
  var resolveCritDamage = function() {
    if (critDamageAttr !== null) return critDamageAttr
    try { critDamageAttr = ForgeRegistries_vrp.ATTRIBUTES.getValue(CRIT_DAMAGE_ATTR_ID) } catch (e) {}
    return critDamageAttr
  }

  // Per-level scaling (additive, both):
  //   crit_chance:  +3% per level (L8 max = +24% landing rate)
  //   crit_damage:  +5% per level (L8 max = +40% bigger crits)
  // Mixed shape so Vorpal isn't a pure Lethal-affix clone -- it both
  // increases how often crits land AND how hard they hit, plus the
  // decap mechanic below as the kill-confirm signature.
  var perLevelCritChance = function(level) {
    return 0.03 * level
  }
  var perLevelCritDamage = function(level) {
    return 0.05 * level
  }

  // Decapitation chance per crit, per level. L1=5%, L2=10%, ..., L8=40%.
  // Scaled so a max-vorpal weapon decapitates on ~40% of crits. Combined
  // with the crit rate (the attribute crit roll on the player's own swing
  // -- see Hook 2; the vanilla jump-crit is switched off in this pack) this
  // works out to ~5-15% kills-per-swing depending on crit gear.
  var decapChancePerLevel = function(level) {
    return 0.05 * level
  }

  // -----------------------------------------------------------------------
  // Hook 1: ItemAttributeModifierEvent -- add crit_chance + crit_damage
  // when held. Both ADDITION to fit the all-additive crit model.
  // -----------------------------------------------------------------------
  var attrHandler = function(event) {
      try {
        if (event.getSlotType() !== EquipmentSlot_vrp.MAINHAND) return
        var stack = event.getItemStack()
        if (!stack || stack.isEmpty()) return
        var ench = ForgeRegistries_vrp.ENCHANTMENTS.getValue(VORPAL_ENCHANT_ID)
        if (ench == null) return
        var level = EnchantmentHelper_vrp.getItemEnchantmentLevel(ench, stack)
        if (level <= 0) return

        var chanceAttr = resolveCritChance()
        if (chanceAttr != null) {
          event.addModifier(chanceAttr,
            new AttributeModifier_vrp(mkVorpalChanceUuid(level), 'icraft_vorpal_chance',
                                      perLevelCritChance(level),
                                      AttributeModifier_vrp.Operation.ADDITION))
        }
        var damageAttr = resolveCritDamage()
        if (damageAttr != null) {
          event.addModifier(damageAttr,
            new AttributeModifier_vrp(mkVorpalDamageUuid(level), 'icraft_vorpal_damage',
                                      perLevelCritDamage(level),
                                      AttributeModifier_vrp.Operation.ADDITION))
        }
      } catch (e) {
        // Fail-soft
      }
  }
  ItemAttributeRegistry_vrp.register('icraft.vorpal_rework_attr', icraft.handler('enchants/vorpal_rework', 'ItemAttributeRegistry.register', attrHandler))

  // -----------------------------------------------------------------------
  // Hook 2: LivingHurtEvent -- decapitate on crit.
  // -----------------------------------------------------------------------
  // [2026-10-11] This handler had never run. It began with
  // `source.isCritical()` -- there is no such method: vanilla 1.20.1
  // DamageSource has none (javap) and no installed mod mixes one in (all 459
  // jars scanned) -- so it threw on every hit, inside its own catch. The
  // next line, `source.getEntity()`, does not exist for scripts either
  // (KubeJS exposes it as getActual()), and `victim.getType()` is KubeJS's
  // id STRING, which ForgeRegistries.ENTITY_TYPES.getKey() answers with the
  // registry default (minecraft:pig) -- the boss blocklist matched nothing.
  //
  // WHAT A "CRIT" IS HERE. The vanilla jump-crit is switched off in this
  // pack: attributecore's CriticalHitHandler sets every player
  // CriticalHitEvent to DENY (priority HIGHEST). What other mods re-allow
  // on that event (L2DamageTracker's crit_rate roll, Tetra's crit effect,
  // ...) is not visible to a script either -- the mod's registries have no
  // CriticalHitEvent family. Crits are ATTRIBUTE rolls, and the one a
  // script can observe is the pack's own roll in server_scripts/attributes/
  // attribute_sync.js: it reads attributeslib:crit_chance (the attribute
  // Hook 1 raises -- "land more crits ... then sometimes behead") and, when
  // it fires, stamps the attacker with icraft_last_crit_tick = the world
  // clock. That stamp is the crit signal, exactly as for Arcane Vorpal
  // (icraft_magic_enchants.js). It also fits the estimate above: 40% of
  // crits at L8 is "~5-15% kills-per-swing depending on crit gear" at a
  // 12-37% crit rate -- an attribute-roll rate that gear moves (a
  // jump-crit could be forced on every swing, whatever the gear).
  //
  // The roll is written in the registry's NORMAL phase, so this handler is
  // registered LATE (it used to sit in NORMAL, where the order against the
  // crit roll is unspecified). The stamp is per attacker per TICK, not per
  // hit: every hit the same player lands in the tick of a crit counts.
  //
  // Melee only: the player must also be the DIRECT source of the damage (a
  // swing), so an arrow or a spell cast while holding the sword does not
  // behead -- that is Arcane Vorpal's job.

  // Boss blocklist: the flag `vorpalMelee` of the boss registry (ten ids stood
  // here until 2026-10-13); see isBossVictim below.

  // Registry id of an entity ('minecraft:zombie'), '' when unknown.
  // getType() = KubeJS's id string; getEntityType() = the vanilla EntityType.
  var entityIdOf = function(entity) {
    var s = ''
    try { s = String(entity.getType()) } catch (e) { s = '' }
    if (s.indexOf(':') > 0) return s
    try {
      var key = ForgeRegistries_vrp.ENTITY_TYPES.getKey(entity.getEntityType())
      if (key != null) s = String(key.toString())
    } catch (e2) {}
    return s
  }

  // "Don't behead bosses": an id is spared when its entry in the boss registry
  // (kubejs/config/icraft/registry/bosses.json) carries the flag `vorpalMelee`
  // (this enchant's own blocklist) or the flag `boss` (what core.isBoss
  // answers). The registry is read through global.icraft.bosses
  // (server_scripts/0_lib_registry.js): `global` is shared by all script types
  // and the server scripts are loaded whenever a world is running.
  // If the registry is not there this THROWS, into the handler's own catch
  // below: it says so once and nobody is beheaded. A missing roster must never
  // read as "nobody is a boss".
  var isBossVictim = function(victimId) {
    var roster = global.icraft ? global.icraft.bosses : null
    if (!roster) throw new Error('the boss registry (icraft.bosses) is not loaded')
    return roster.has(victimId, 'vorpalMelee') || roster.is(victimId)
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
        if (!(attacker instanceof Player_vrp)) return
        if (source.getImmediate() !== attacker) return  // the swing itself, not a projectile / spell
        var weapon = attacker.getMainHandItem()
        if (weapon == null || weapon.isEmpty()) return
        var ench = ForgeRegistries_vrp.ENCHANTMENTS.getValue(VORPAL_ENCHANT_ID)
        if (ench == null) return
        var level = EnchantmentHelper_vrp.getItemEnchantmentLevel(ench, weapon)
        if (level <= 0) return

        // only crits: did the custom crit roll fire for this attacker on THIS
        // tick? Same clock, read the same way as the writer (attribute_sync.js:
        // putLong('icraft_last_crit_tick', Number(attacker.level.time)) -- the
        // world clock since 2026-10-12, not server.tickCount).
        var lastCrit = Number(attacker.persistentData.getLong('icraft_last_crit_tick'))
        var curTick = Number(attacker.level.time)
        if (lastCrit !== curTick) return

        // Don't behead bosses / players.
        var victim = event.getEntity()
        if (victim instanceof Player_vrp) return
        var victimId = entityIdOf(victim)
        if (victimId.indexOf(':') < 0) return
        if (isBossVictim(victimId)) return

        var chance = decapChancePerLevel(level)
        if (Math.random() >= chance) return

        // Decapitate: raise the damage to the victim's current health + 1.
        // Don't multiply -- just floor at lethal: a hit that is already
        // bigger is left alone (it must never be LOWERED to health + 1).
        var newDmg = victim.getHealth() + 1.0
        if (newDmg > event.getAmount()) event.setAmount(newDmg)
        // ...and make it stick after mitigation (see LethalBlow above).
        if (LethalBlow_vrp != null) LethalBlow_vrp.mark(victim)
        // liveness: a critical melee hit with Vorpal passed its roll and was made lethal
        icraft.live.fired('vorpal-decap')
      } catch (e) {
        // Fail-soft, but not silent: say so once per load.
        if (!decapWarned) {
          decapWarned = true
          console.warn('[IridescentCraft] vorpal_rework decap handler threw (logged once): ' + e)
        }
      }
  }
  // LATE phase: after attribute_sync's NORMAL-phase crit roll has stamped
  // icraft_last_crit_tick (registerLate also drops any NORMAL-phase entry
  // an older copy of this script left under the same key).
  DamageModifierRegistry_vrp.registerLate('icraft.vorpal_rework_decap', icraft.handler('enchants/vorpal_rework', 'DamageModifierRegistry.registerLate', decapHandler))

  console.log('[IridescentCraft] vorpal_rework loaded (crit_damage scaling + decap-on-crit)')
} catch (e) {
  console.warn('[IridescentCraft] vorpal_rework bootstrap FAILED: ' + e)
}
})()
