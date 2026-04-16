// =============================================================================
// Iridescent Attributes — Sync Handlers
// =============================================================================
// Reads unified icraft:* attributes from players and propagates them to
// mod-specific systems. Runs as a player tick handler via 0_tick_master.js.
//
// Sync targets:
// - icraft:spell_power → Ars Nouveau spell damage + ISB spell power
// - icraft:crit_chance → applied via EntityEvents.hurt
// - icraft:lifesteal → applied via EntityEvents.hurt
// - icraft:dodge_chance → applied via EntityEvents.hurt
// =============================================================================

// --- COMBAT STAT APPLICATION ---
// These fire on hit events, reading the unified attributes

EntityEvents.hurt(function(event) {
  var entity = event.entity
  var source = event.source

  // --- Dodge (defender) ---
  if (entity.player) {
    var dodgeChance = entity.getAttributeBaseValue('icraft:dodge_chance') || 0
    if (dodgeChance > 0 && Math.random() < dodgeChance) {
      event.cancel()
      entity.tell(Text.gray('Dodged!'))
      return
    }
  }

  // --- Crit + Lifesteal + Armor Pen (attacker) ---
  if (source && source.player) {
    var attacker = source.player
    var critChance = attacker.getAttributeBaseValue('icraft:crit_chance') || 0.05
    var critDamage = attacker.getAttributeBaseValue('icraft:crit_damage') || 1.5
    var lifesteal = attacker.getAttributeBaseValue('icraft:lifesteal') || 0
    var spellPower = attacker.getAttributeBaseValue('icraft:spell_power') || 1.0

    // Crit roll
    if (Math.random() < critChance) {
      event.damage = event.damage * critDamage
    }

    // Spell power scaling (if damage source is magic/indirect)
    var sourceType = String(source.type || '')
    if (sourceType.includes('magic') || sourceType.includes('indirect')) {
      event.damage = event.damage * spellPower
    }

    // Lifesteal (applied after damage calc)
    if (lifesteal > 0) {
      var healAmount = event.damage * lifesteal
      attacker.heal(healAmount)
    }
  }
})

// --- HEALING RECEIVED MODIFIER ---
EntityEvents.hurt(function(event) {
  // This is a placeholder — healing_received would need to hook into
  // LivingHealEvent which KubeJS doesn't expose. For now, the attribute
  // is registered but not actively synced. Future: custom Forge event handler.
})

// --- ATTRIBUTE SYNC TICK ---
// Syncs icraft attributes to mod-specific systems every 5 seconds
global.tick_attributeSync = function(event) {
  var player = event.player

  // Read our unified spell_power
  var spellPower = player.getAttributeBaseValue('icraft:spell_power')
  if (!spellPower) return

  // Sync to puffish_attributes magic_damage if available
  // (puffish reads from scoreboard, not attributes directly)
  if (spellPower != 1.0) {
    var magicBonus = Math.round((spellPower - 1.0) * 100)
    player.server.runCommandSilent(
      'scoreboard players set ' + player.username + ' icraft_magic_bonus ' + magicBonus
    )
  }
}
global.registerPlayerTick('tick_attributeSync', 100, 25)

console.log('[IridescentCraft] Attribute sync handlers loaded')
console.log('  Combat: crit/dodge/lifesteal via EntityEvents.hurt')
console.log('  Magic: spell_power sync every 5s')
