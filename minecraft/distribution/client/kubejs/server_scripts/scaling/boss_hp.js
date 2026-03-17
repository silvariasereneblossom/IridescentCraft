// =============================================================================
// IridescentCraft — Boss HP Overrides
// File: kubejs/server_scripts/scaling/boss_hp.js
//
// Design Doc Part II: Boss HP Targets (First Kill)
//
// Sets custom base HP for all designed bosses. Progressive Bosses mod handles
// per-kill scaling ON TOP of these base values.
//
// NOTE: Some bosses have hardcoded HP that may resist attribute modification.
// If a boss ignores the override, it may need a mod-specific config or mixin.
// Test in-game and document any that don't respond.
// =============================================================================

EntityEvents.spawned(event => {
  let entity = event.entity
  if (!entity || !entity.living) return

  let type = entity.type
  let targetHP = getBossHP(type)
  if (!targetHP) return

  // Skip already-overridden bosses
  if (entity.persistentData.contains('icraft_boss_hp')) return

  let currentMax = entity.maxHealth

  // Calculate the multiplier needed to reach target HP
  if (currentMax > 0 && currentMax !== targetHP) {
    let ratio = (targetHP / currentMax) - 1.0
    entity.modifyAttribute(
      'minecraft:generic.max_health',
      'icraft_boss_hp_override',
      ratio,
      'multiply_base'
    )
    entity.heal(entity.maxHealth)
  }

  entity.persistentData.putBoolean('icraft_boss_hp', true)
})

function getBossHP(type) {
  const BOSS_HP = {
    // ── Tier 2 Bosses ──
    'twilightforest:naga':              300,
    'twilightforest:lich':              400,
    'twilightforest:hydra':             500,
    'twilightforest:ur_ghast':          600,
    'twilightforest:knight_phantom':    350,
    'twilightforest:snow_queen':        450,
    'twilightforest:minoshroom':        300,
    'twilightforest:alpha_yeti':        350,

    'blue_skies:summoner':              350,
    'blue_skies:alchemist':             400,
    'blue_skies:starlit_crusher':       500,
    'blue_skies:arachnarch':            450,

    'aether:slider':                    400,
    'aether:valkyrie_queen':            550,
    'aether:sun_spirit':                500,

    // ── Tier 3 Bosses ──
    'undergarden:forgotten_guardian':    800,
    'deeperdarker:stalker':             700,
    'deeperdarker:shattered':           750,
    'deeperdarker:shriek_worm':         600,
    'deeperdarker:sculk_centipede':     650,

    'cataclysm:netherite_monstrosity':  900,
    'cataclysm:ignis':                  1000,
    'cataclysm:the_harbinger':          800,
    'cataclysm:the_leviathan':          850,
    'cataclysm:maledictus':             900,

    'minecraft:wither':                 600,

    'meetyourfight:dame_fortuna':       700,
    'meetyourfight:rosalyne':           800,
    'meetyourfight:swampjaw':           600,
    'meetyourfight:bellringer':         700,

    'theabyss:nightblade_boss':         700,
    'theabyss:the_roka':                800,
    'theabyss:elder':                   900,

    // ── Tier 4 Bosses ──
    'minecraft:ender_dragon':           1000,
    'cataclysm:ender_guardian':         1500,
    'cataclysm:ancient_remnant':        2500,
    'cataclysm:void_blossom':           2000,
    'cataclysm:ender_golem':            1200,
    'cataclysm:ignited_revenant':       1000,

    'botania:doppleganger':             1200,

    'deep_aether:eots_controller':      1500,

    // ── Other Bosses (from boss mods) ──
    'stalwart_dungeons:shelterer':      500,
    'stalwart_dungeons:nether_keeper':  800,
    'stalwart_dungeons:awful_ghast':    700,
    'stalwart_dungeons:incomplete_wither': 600,

    'mutantmonsters:mutant_zombie':     400,
    'mutantmonsters:mutant_skeleton':   350,
    'mutantmonsters:mutant_creeper':    300,
    'mutantmonsters:mutant_enderman':   500,

    'keebsz:tower_guardian':            600,

    'irons_spellbooks:dead_king':       800,
    'irons_spellbooks:fire_boss':       700,
    'irons_spellbooks:citadel_keeper':  600,

    'ub:sorcerer':                      700,
    'ub:storm':                         800,

    'majestic_menaces:teikoku_senshi':  1000,
  }
  return BOSS_HP[type] || null
}
