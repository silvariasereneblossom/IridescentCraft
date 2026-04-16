// =============================================================================
// Iridescent Attributes — Unified Magic Stat System (Minimal)
// =============================================================================
// Registers unified attributes under the 'icraft' namespace that KubeJS
// server scripts can read/write. Server-side tick handlers sync these
// values to mod-specific systems (Ars Nouveau, Iron's Spellbooks).
//
// This is the minimal implementation. Future versions will add:
// - Two-way sync with Apotheosis affixes
// - GUI stat display
// - Config-driven attribute definitions
// - XP: Attribute Core compatibility shims
// =============================================================================

StartupEvents.registry('minecraft:attribute', event => {
  // --- Magic Stats ---
  event.create('icraft:spell_power')
    .setDefaultValue(1.0)
    .setRange(0.0, 100.0)

  event.create('icraft:mana_regen')
    .setDefaultValue(1.0)
    .setRange(0.0, 50.0)

  event.create('icraft:cooldown_reduction')
    .setDefaultValue(0.0)
    .setRange(0.0, 0.75)

  event.create('icraft:magic_resistance')
    .setDefaultValue(0.0)
    .setRange(0.0, 0.80)

  // --- Combat Stats ---
  event.create('icraft:crit_chance')
    .setDefaultValue(0.05)
    .setRange(0.0, 1.0)

  event.create('icraft:crit_damage')
    .setDefaultValue(1.5)
    .setRange(1.0, 10.0)

  event.create('icraft:lifesteal')
    .setDefaultValue(0.0)
    .setRange(0.0, 1.0)

  event.create('icraft:dodge_chance')
    .setDefaultValue(0.0)
    .setRange(0.0, 0.50)

  event.create('icraft:armor_penetration')
    .setDefaultValue(0.0)
    .setRange(0.0, 1.0)

  // --- Utility Stats ---
  event.create('icraft:xp_multiplier')
    .setDefaultValue(1.0)
    .setRange(0.0, 10.0)

  event.create('icraft:healing_received')
    .setDefaultValue(1.0)
    .setRange(0.0, 5.0)

  console.log('[IridescentCraft] Iridescent Attributes registered:')
  console.log('  Magic: spell_power, mana_regen, cooldown_reduction, magic_resistance')
  console.log('  Combat: crit_chance, crit_damage, lifesteal, dodge_chance, armor_penetration')
  console.log('  Utility: xp_multiplier, healing_received')
})
