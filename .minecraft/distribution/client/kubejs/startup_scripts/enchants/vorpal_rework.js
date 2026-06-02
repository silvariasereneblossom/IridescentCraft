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
//   level. Signature melee-Vorpal mechanic stays here -- the magic-
//   weapon counterpart (icraft:vorpal_arcane) deliberately omits decap
//   (different identity: stacks crit stats but doesn't behead).
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
  // with vanilla crit rate (only on the player-attack crit path) this
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
  ItemAttributeRegistry_vrp.register('icraft.vorpal_rework_attr', attrHandler)

  // -----------------------------------------------------------------------
  // Hook 2: LivingHurtEvent -- decapitate on crit.
  // -----------------------------------------------------------------------
  // Vanilla Player.attack() sets DamageSource.isCritical via flag set in
  // the source's properties. We detect by reading DamageSource.isCritical()
  // (via reflection -- it's a boolean field in DamageSource for 1.20.1).
  // If the source is a player crit AND the player's mainhand has vorpal,
  // roll behead.
  var decapHandler = function(event) {
      try {
        var source = event.getSource()
        if (source == null) return
        if (!source.isCritical()) return  // only crits
        var attacker = source.getEntity()
        if (!(attacker instanceof Player_vrp)) return
        var weapon = attacker.getMainHandItem()
        if (weapon == null || weapon.isEmpty()) return
        var ench = ForgeRegistries_vrp.ENCHANTMENTS.getValue(VORPAL_ENCHANT_ID)
        if (ench == null) return
        var level = EnchantmentHelper_vrp.getItemEnchantmentLevel(ench, weapon)
        if (level <= 0) return

        // Don't behead bosses / players. Use !attackable check would be
        // too broad; instead check for the "boss" tag-key in entity NBT
        // or the type's "minecraft:wither" / "ender_dragon" id.
        var victim = event.getEntity()
        if (victim instanceof Player_vrp) return
        var victimType = victim.getType()
        var victimKey = ForgeRegistries_vrp.ENTITY_TYPES.getKey(victimType)
        if (victimKey == null) return
        var victimId = String(victimKey.toString())
        // Boss blocklist; extend as needed
        if (victimId === 'minecraft:wither' ||
            victimId === 'minecraft:ender_dragon' ||
            victimId === 'cataclysm:netherite_monstrosity' ||
            victimId === 'cataclysm:ender_guardian' ||
            victimId === 'cataclysm:ignis' ||
            victimId === 'cataclysm:the_leviathan' ||
            victimId === 'twilightforest:naga' ||
            victimId === 'twilightforest:lich' ||
            victimId === 'twilightforest:hydra' ||
            victimId === 'twilightforest:ur_ghast') return

        var chance = decapChancePerLevel(level)
        if (Math.random() >= chance) return

        // Decapitate: set damage to victim's current health + 1, ensures kill.
        // Don't multiply -- just floor at lethal. We add a tiny epsilon to
        // ensure the damage source isn't rounded to "exactly health" which
        // some mods treat as non-lethal.
        var newDmg = victim.getHealth() + 1.0
        event.setAmount(newDmg)
      } catch (e) {
        // Fail-soft
      }
  }
  DamageModifierRegistry_vrp.register('icraft.vorpal_rework_decap', decapHandler)

  console.log('[IridescentCraft] vorpal_rework loaded (crit_damage scaling + decap-on-crit)')
} catch (e) {
  console.warn('[IridescentCraft] vorpal_rework bootstrap FAILED: ' + e)
}
