// =============================================================================
// VORPAL REWORK -- crit-coupled decapitation
// Place in: kubejs/server_scripts/enchants/vorpal_rework.js
// =============================================================================
//
// 2026-05-21: Per user direction, rework ensorcellation:vorpal so it
// behaves consistently with the crit system:
//   - Per-level crit_damage bonus (additive multiplier on the crit
//     damage attribute), ALWAYS applied to the wielder while held.
//   - Decapitation roll fires ONLY on critical hits, scaled per level.
// Previously vorpal had an independent extra-damage-and-instakill roll
// that ignored the crit system entirely. The new shape ties it into
// the same crit_damage feedback loop as the apoth crit affixes.
//
// We do NOT modify Ensorcellation's VorpalEnchantment Java class --
// instead we layer behavior on top via:
//   1. ItemAttributeModifierEvent -- when the held item has vorpal,
//      add a crit_damage modifier ADDITION scaled to vorpal level.
//   2. LivingHurtEvent on the player-source attack -- detect crit
//      (Player.attackStrengthScale + onGround + sprinting -> see
//      vanilla Player.attack rules) and roll decapitation per level.
//
// The original Ensorcellation roll-for-extra-damage path still fires
// because we don't disable the native enchant code -- but our crit-
// linked damage scales independently and dominates at high levels.
// =============================================================================

try {
  var MinecraftForge_vrp = Java.loadClass('net.minecraftforge.common.MinecraftForge')
  var ItemAttributeModifierEvent_vrp = Java.loadClass('net.minecraftforge.event.ItemAttributeModifierEvent')
  var LivingHurtEvent_vrp = Java.loadClass('net.minecraftforge.event.entity.living.LivingHurtEvent')
  var EventPriority_vrp = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority')
  var Consumer_vrp = Java.loadClass('java.util.function.Consumer')
  var EquipmentSlot_vrp = Java.loadClass('net.minecraft.world.entity.EquipmentSlot')
  var AttributeModifier_vrp = Java.loadClass('net.minecraft.world.entity.ai.attributes.AttributeModifier')
  var ForgeRegistries_vrp = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
  var ResourceLocation_vrp = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var UUID_vrp = Java.loadClass('java.util.UUID')
  var EnchantmentHelper_vrp = Java.loadClass('net.minecraft.world.item.enchantment.EnchantmentHelper')
  var Player_vrp = Java.loadClass('net.minecraft.world.entity.player.Player')

  var VORPAL_ENCHANT_ID = new ResourceLocation_vrp('ensorcellation', 'vorpal')
  var CRIT_DAMAGE_ATTR_ID = new ResourceLocation_vrp('attributeslib', 'crit_damage')

  // Deterministic UUID per level so duplicate adds at different levels
  // de-dup correctly (vanilla AttributeMap dedup is by UUID).
  var mkVorpalUuid = function(level) {
    var hex = (level < 16 ? '0' : '') + Number(level).toString(16)
    return UUID_vrp.fromString('a1c9e205-0000-0000-0000-0000000000' + hex)
  }

  // Resolve attribute lazily; AttributeFix may not have populated registry
  // at script-load time for non-vanilla attributes.
  var critDamageAttr = null
  var resolveCritDamage = function() {
    if (critDamageAttr !== null) return critDamageAttr
    try { critDamageAttr = ForgeRegistries_vrp.ATTRIBUTES.getValue(CRIT_DAMAGE_ATTR_ID) } catch (e) {}
    return critDamageAttr
  }

  // Level -> crit_damage bonus (additive, on top of the 1.5 baseline).
  // L1=+10%, L2=+20%, ..., L8=+80%. So a max-vorpal weapon adds +80%
  // to crit damage on top of any apoth crit_damage affix and the 1.5
  // base. Linear scale chosen for tooltip readability.
  var perLevelCritBonus = function(level) {
    return 0.1 * level
  }

  // Decapitation chance per crit, per level. L1=5%, L2=10%, ..., L8=40%.
  // Scaled so a max-vorpal weapon decapitates on ~40% of crits. Combined
  // with vanilla crit rate (only on the player-attack crit path) this
  // works out to ~5-15% kills-per-swing depending on crit gear.
  var decapChancePerLevel = function(level) {
    return 0.05 * level
  }

  // -----------------------------------------------------------------------
  // Hook 1: ItemAttributeModifierEvent -- add crit_damage when held.
  // -----------------------------------------------------------------------
  var attrHandler = new Consumer_vrp({
    accept: function(event) {
      try {
        if (event.getSlotType() !== EquipmentSlot_vrp.MAINHAND) return
        var stack = event.getItemStack()
        if (!stack || stack.isEmpty()) return
        // EnchantmentHelper.getItemEnchantmentLevel(enchant, stack)
        // For non-imported enchants, look up by registry.
        var ench = ForgeRegistries_vrp.ENCHANTMENTS.getValue(VORPAL_ENCHANT_ID)
        if (ench == null) return
        var level = EnchantmentHelper_vrp.getItemEnchantmentLevel(ench, stack)
        if (level <= 0) return

        var attrU = resolveCritDamage()
        if (attrU == null) return
        var bonus = perLevelCritBonus(level)
        event.addModifier(attrU,
          new AttributeModifier_vrp(mkVorpalUuid(level), 'icraft_vorpal_crit',
                                    bonus, AttributeModifier_vrp.Operation.ADDITION))
      } catch (e) {
        // Fail-soft
      }
    }
  })
  MinecraftForge_vrp.EVENT_BUS.addListener(EventPriority_vrp.NORMAL, false,
                                            ItemAttributeModifierEvent_vrp, attrHandler)

  // -----------------------------------------------------------------------
  // Hook 2: LivingHurtEvent -- decapitate on crit.
  // -----------------------------------------------------------------------
  // Vanilla Player.attack() sets DamageSource.isCritical via flag set in
  // the source's properties. We detect by reading DamageSource.isCritical()
  // (via reflection -- it's a boolean field in DamageSource for 1.20.1).
  // If the source is a player crit AND the player's mainhand has vorpal,
  // roll behead.
  var decapHandler = new Consumer_vrp({
    accept: function(event) {
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
  })
  MinecraftForge_vrp.EVENT_BUS.addListener(EventPriority_vrp.NORMAL, false,
                                            LivingHurtEvent_vrp, decapHandler)

  console.log('[IridescentCraft] vorpal_rework loaded (crit_damage scaling + decap-on-crit)')
} catch (e) {
  console.warn('[IridescentCraft] vorpal_rework bootstrap FAILED: ' + e)
}
