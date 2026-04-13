// =============================================================================
// IridescentCraft — Custom Enchantment Registration
// File: kubejs/startup_scripts/custom_enchantments.js
//
// Design Doc Part VI: Custom Enchantments
// Registers 24 custom enchantments. Effect logic in server_scripts/enchant_effects.js
//
// Apotheosis handles enchantment level scaling (max level 10 via enchanting table).
// These enchantments use max_level for the BASE max; Apotheosis can exceed it.
// =============================================================================

StartupEvents.registry('enchantment', event => {

  // ═══ CATEGORY 1: Dimensional Survival ═══

  event.create('icraft:heatward')
    .maxLevel(5)
    .rarity('UNCOMMON')
    .slots(['HEAD', 'CHEST', 'LEGS', 'FEET'])
    .category('ARMOR')

  event.create('icraft:voidward')
    .maxLevel(5)
    .rarity('UNCOMMON')
    .slots(['HEAD', 'CHEST', 'LEGS', 'FEET'])
    .category('ARMOR')

  event.create('icraft:depthstrider_custom')  // Avoid vanilla name collision
    .maxLevel(3)
    .rarity('RARE')
    .slots(['HEAD', 'CHEST', 'LEGS', 'FEET'])
    .category('ARMOR')

  event.create('icraft:aether_acclimation')
    .maxLevel(3)
    .rarity('RARE')
    .slots(['HEAD', 'CHEST', 'LEGS', 'FEET'])
    .category('ARMOR')

  event.create('icraft:warp_shield')
    .maxLevel(3)
    .rarity('VERY_RARE')
    .slots(['HEAD', 'CHEST', 'LEGS', 'FEET'])
    .category('ARMOR')


  // ═══ CATEGORY 2: Resource Enhancement ═══

  event.create('icraft:prospector')
    .maxLevel(5)
    .rarity('UNCOMMON')
    .slots(['MAINHAND'])
    .category('DIGGER')

  event.create('icraft:lumberjack')
    .maxLevel(3)
    .rarity('UNCOMMON')
    .slots(['MAINHAND'])
    .category('DIGGER')


  // ═══ CATEGORY 3: Scaling Combat ═══

  event.create('icraft:momentum')
    .maxLevel(3)
    .rarity('UNCOMMON')
    .slots(['MAINHAND'])
    .category('WEAPON')

  event.create('icraft:adrenaline')
    .maxLevel(5)
    .rarity('RARE')
    .slots(['MAINHAND'])
    .category('WEAPON')

  event.create('icraft:titan_slayer')
    .maxLevel(5)
    .rarity('RARE')
    .slots(['MAINHAND'])
    .category('WEAPON')

  event.create('icraft:crowd_control')
    .maxLevel(3)
    .rarity('UNCOMMON')
    .slots(['MAINHAND'])
    .category('WEAPON')

  event.create('icraft:adaptive')
    .maxLevel(3)
    .rarity('RARE')
    .slots(['HEAD', 'CHEST', 'LEGS', 'FEET'])
    .category('ARMOR')


  // ═══ CATEGORY 4: Anti-Boss ═══

  event.create('icraft:boss_ward')
    .maxLevel(5)
    .rarity('RARE')
    .slots(['HEAD', 'CHEST', 'LEGS', 'FEET'])
    .category('ARMOR')

  event.create('icraft:steadfast')
    .maxLevel(3)
    .rarity('UNCOMMON')
    .slots(['HEAD', 'CHEST', 'LEGS', 'FEET'])
    .category('ARMOR')

  event.create('icraft:nemesis')
    .maxLevel(5)
    .rarity('VERY_RARE')
    .slots(['MAINHAND'])
    .category('WEAPON')


  // ═══ CATEGORY 5: Path Synergy ═══

  event.create('icraft:mana_temper')
    .maxLevel(5)
    .rarity('VERY_RARE')
    .slots(['MAINHAND'])
    .category('WEAPON')

  event.create('icraft:rf_capacitance')
    .maxLevel(5)
    .rarity('VERY_RARE')
    .slots(['HEAD', 'CHEST', 'LEGS', 'FEET'])
    .category('ARMOR')

  event.create('icraft:convergence')
    .maxLevel(3)
    .rarity('VERY_RARE')
    .slots(['MAINHAND'])
    .category('WEAPON')

  event.create('icraft:primal_force')
    .maxLevel(5)
    .rarity('RARE')
    .slots(['MAINHAND'])
    .category('WEAPON')


  // ═══ CATEGORY 6: Utility & Survival ═══

  event.create('icraft:magnetism')
    .maxLevel(3)
    .rarity('UNCOMMON')
    .slots(['HEAD', 'CHEST', 'LEGS', 'FEET'])
    .category('ARMOR')

  event.create('icraft:last_stand')
    .maxLevel(1)
    .rarity('VERY_RARE')
    .slots(['HEAD', 'CHEST', 'LEGS', 'FEET'])
    .category('ARMOR')

  event.create('icraft:vitality')
    .maxLevel(5)
    .rarity('RARE')
    .slots(['HEAD', 'CHEST', 'LEGS', 'FEET'])
    .category('ARMOR')

  event.create('icraft:phalanx')
    .maxLevel(5)
    .rarity('UNCOMMON')
    .slots(['OFFHAND'])
    .category('ARMOR')

  event.create('icraft:quick_draw')
    .maxLevel(3)
    .rarity('UNCOMMON')
    .slots(['MAINHAND'])
    .category('BOW')


  // ═══ CATEGORY 7: Planetary Hazard Protection ═══

  event.create('icraft:lunar_stride')
    .maxLevel(3)
    .rarity('RARE')
    .slots(['HEAD', 'CHEST', 'LEGS', 'FEET'])
    .category('ARMOR')

  event.create('icraft:thermal_regulation')
    .maxLevel(3)
    .rarity('RARE')
    .slots(['HEAD', 'CHEST', 'LEGS', 'FEET'])
    .category('ARMOR')

  event.create('icraft:pressure_shell')
    .maxLevel(2)
    .rarity('VERY_RARE')
    .slots(['HEAD', 'CHEST', 'LEGS', 'FEET'])
    .category('ARMOR')

  event.create('icraft:void_adaptation')
    .maxLevel(2)
    .rarity('VERY_RARE')
    .slots(['HEAD', 'CHEST', 'LEGS', 'FEET'])
    .category('ARMOR')

  event.create('icraft:stellar_shield')
    .maxLevel(3)
    .rarity('RARE')
    .slots(['HEAD', 'CHEST', 'LEGS', 'FEET'])
    .category('ARMOR')
})
