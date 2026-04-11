// =============================================================================
// Epic RPG: Class Artifacts — strip all crafting recipes.
// =============================================================================
// Per design decision: Class Artifacts items are DROPS-ONLY, never crafted.
// - Artifact pouches drop from tiered bosses (via LootJS)
// - Fragment cores drop from Progressive Difficulty elites (via LootJS)
// - Awakening versions drop from T3+ bosses only (AStages-gated)
// - Magic leather is orphaned (no longer craftable, no use)
// =============================================================================

ServerEvents.recipes(event => {
  const removed = [
    // Awakening artifact upgrade recipes (normal + nether_star -> awakening)
    'rpgseteffects:altharion_awakening_artifact',
    'rpgseteffects:blade_dancer_awakening_artifact',
    'rpgseteffects:blood_fury_awakening_artifact',
    'rpgseteffects:chronorend_awakening_artifact',
    'rpgseteffects:hellbrand_awakening_artifact',
    'rpgseteffects:hexweaver_awakening_artifact',
    'rpgseteffects:ignisphere_awakening_artifact',
    'rpgseteffects:moonpiercer_awakening_artifact',
    'rpgseteffects:phoenix_awakening_artifact',
    'rpgseteffects:sanctum_awakening_artifact',
    'rpgseteffects:shadow_hunter_awakening_artifact',
    'rpgseteffects:stormpiercer_awakening_artifact',
    'rpgseteffects:vaelkhor_awakening_artifact',
    'rpgseteffects:wolfheart_awakening_artifact',

    // Intermediate material crafting — all disabled for drops-only design
    'rpgseteffects:magic_leather',
    'rpgseteffects:artifact_piece_pouch',
    'rpgseteffects:relics_to_fragment_smelting'
  ]

  removed.forEach(id => {
    event.remove({ id: id })
  })

  console.log('[IridescentCraft] Stripped ' + removed.length + ' rpgseteffects crafting/smelting recipes (drops-only design)')
})
