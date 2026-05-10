// =============================================================================
// DAN'S MAGIC + SIMPLE STAVES — Held-item attribute buffs + Battlerod rename
// =============================================================================
// Phase B+C of the staves/wands integration plan (see
// IridescentCraft-internal/design/staves_wands_integration_plan.md).
//
// Layer 1 — Dan's Magic (5 staves): T1 element-buff items. Held-in-hand
// passive: +20% to relevant ISS spell school. tnt_staff renamed to
// "Apprentice Battlerod" with 5% generic spell_power + 6 attack_damage
// (=> ~7 total dmg on top of the 1.0 base, just above iron sword).
//
// Layer 3 — Simple Staves elemental wands: T2-T4 stronger element buffs.
// Material wands NOT touched here — they go through Tetra modular system
// in Phase D (separate session — requires Java mod work).
//
// Right-click projectile use is cancelled in startup_scripts/dna_simple_staves_strip.js
// (loads at startup; held-buff modifications must be in startup phase too
// since attribute modifiers are baked into the item registration).
//
// Memory: project_mage_loadout.md, feedback_kubejs_event_scope.md,
// feedback_rhino_scoping.md.
// =============================================================================

ItemEvents.modification(event => {

  // ─── Layer 1: Dan's Magic T1 element buffs ───────────────────────────

  // Ice Staff — +20% ice spell power
  event.modify('dna:ice_staff', item => {
    item.attribute('mainhand', 'irons_spellbooks:ice_spell_power',
                   'icraft_dna_ice', 0.20, 'addition')
  })

  // Lightning Staff — +20% lightning spell power
  event.modify('dna:lightning_staff', item => {
    item.attribute('mainhand', 'irons_spellbooks:lightning_spell_power',
                   'icraft_dna_lightning', 0.20, 'addition')
  })

  // Magma Staff — +20% fire spell power
  event.modify('dna:magma_staff', item => {
    item.attribute('mainhand', 'irons_spellbooks:fire_spell_power',
                   'icraft_dna_fire', 0.20, 'addition')
  })

  // Toxic Staff — +20% nature spell power (toxic→nature mapping per design)
  event.modify('dna:toxic_staff', item => {
    item.attribute('mainhand', 'irons_spellbooks:nature_spell_power',
                   'icraft_dna_toxic', 0.20, 'addition')
  })

  // TNT Staff → Apprentice Battlerod: T1 spellsword hybrid.
  // +5% generic spell_power, +6 attack_damage (final ~7 dmg, just above iron sword).
  event.modify('dna:tnt_staff', item => {
    item.displayName('Apprentice Battlerod')
    item.attribute('mainhand', 'irons_spellbooks:spell_power',
                   'icraft_dna_battlerod_sp', 0.05, 'addition')
    item.attribute('mainhand', 'minecraft:generic.attack_damage',
                   'icraft_dna_battlerod_ad', 6.0, 'addition')
    item.attribute('mainhand', 'minecraft:generic.attack_speed',
                   'icraft_dna_battlerod_as', -2.4, 'addition')
  })

  // ─── Layer 3: Simple Staves elemental wand buffs ─────────────────────

  // Flame wand — T2 fire (+35%)
  event.modify('simple_staves:flame_wand', item => {
    item.attribute('mainhand', 'irons_spellbooks:fire_spell_power',
                   'icraft_ss_flame', 0.35, 'addition')
  })

  // Wind essence wand — T1 air (+20% lightning + 0.05 movement_speed)
  event.modify('simple_staves:wind_essence_wand', item => {
    item.attribute('mainhand', 'irons_spellbooks:lightning_spell_power',
                   'icraft_ss_wind_lightning', 0.20, 'addition')
    item.attribute('mainhand', 'minecraft:generic.movement_speed',
                   'icraft_ss_wind_speed', 0.05, 'addition')
  })

  // Thunder wand — T2 lightning (+35%; storm reagent base)
  event.modify('simple_staves:thunder_wand', item => {
    item.attribute('mainhand', 'irons_spellbooks:lightning_spell_power',
                   'icraft_ss_thunder', 0.35, 'addition')
  })

  // Venomite wand — T2 nature (+35%)
  event.modify('simple_staves:venomite_wand', item => {
    item.attribute('mainhand', 'irons_spellbooks:nature_spell_power',
                   'icraft_ss_venomite', 0.35, 'addition')
  })

  // Viritium wand — T3 nature (+50%)
  event.modify('simple_staves:viritium_wand', item => {
    item.attribute('mainhand', 'irons_spellbooks:nature_spell_power',
                   'icraft_ss_viritium', 0.50, 'addition')
  })

  // Veil wand — T3 holy (+50%)
  event.modify('simple_staves:veil_wand', item => {
    item.attribute('mainhand', 'irons_spellbooks:holy_spell_power',
                   'icraft_ss_veil', 0.50, 'addition')
  })

  // Void wand — T3 ender (+50%)
  event.modify('simple_staves:void_wand', item => {
    item.attribute('mainhand', 'irons_spellbooks:ender_spell_power',
                   'icraft_ss_void', 0.50, 'addition')
  })

  // Tenebrium wand — T4 ender upgrade (+75%)
  event.modify('simple_staves:tenebrium_wand', item => {
    item.attribute('mainhand', 'irons_spellbooks:ender_spell_power',
                   'icraft_ss_tenebrium', 0.75, 'addition')
  })

  // Note: explosion_wand NOT given a buff — it's stripped/redundant
  // (Apprentice Battlerod fills the spellsword-explosive niche).
})
