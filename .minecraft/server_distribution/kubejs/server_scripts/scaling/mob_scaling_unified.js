// =============================================================================
// IridescentCraft — Mob Tier HP (post-2026-05-03)
// File: kubejs/server_scripts/scaling/mob_scaling_unified.js
//
// Applies static per-mob-type tier HP:
//   basic 3x, mid 1.5x, champion 1.25x, boss 1x
//
// Dimension scaling MOVED to iridescent_difficulty mod (Java). The mod
// provides time-based per-dimension scaling that COMPOSES with this
// tier-HP rule rather than duplicating it: base mob -> mob_tier_hp
// multiplier (this script) -> dimension multiplier (mod) -> final stat.
//
// Boss entities are excluded here — they scale via boss_hp.js +
// boss_progressive.js (modded bosses) or the ProgressiveBosses mod
// (vanilla bosses).
// =============================================================================

// Equipment/scaling blacklist (#icraft:equipment_blacklist entity_types tag):
// Terramity beam/bomb/ring "projectile" mobs are PathfinderMob registered as
// MobCategory.MONSTER, so entity.monster is true and they would get tier-HP
// scaled (bloating these one-shot effect entities). Skip them via the same
// curated tag the equipment gate uses. Resolve the TagKey once via the proven
// Java.loadClass pattern (sunlight_smite.js:42-53). (Fix A2 / PROJ-1.)
var MOB_SCALE_BLACKLIST_TAG = null
try {
  var ResourceLocation_ms = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var TagKey_ms = Java.loadClass('net.minecraft.tags.TagKey')
  var Registries_ms = Java.loadClass('net.minecraft.core.registries.Registries')
  MOB_SCALE_BLACKLIST_TAG = TagKey_ms.create(Registries_ms.ENTITY_TYPE,
    new ResourceLocation_ms('icraft', 'equipment_blacklist'))
} catch (e) {
  console.warn('[mob_scaling_unified] equipment_blacklist TagKey init FAILED: ' + e)
}

function isMobScaleBlacklisted(entity) {
  if (!MOB_SCALE_BLACKLIST_TAG) return false
  try {
    return entity.getType().is(MOB_SCALE_BLACKLIST_TAG)
  } catch (e) {
    return false
  }
}

EntityEvents.spawned(event => {
  try {
    let entity = event.entity
    if (!entity || !entity.living) return
    if (entity.player) return

    // 2026-04-25: KubeJS `entity.type` returns the translation-key form
    // ("entity.<ns>.<path>"), not the resource-location form ("ns:path").
    // BROKEN_ENTITIES Set lookups + indexOf('irons_spellbooks:') prefix
    // checks both miss with the translation-key form. Resolve the canonical
    // resource id via the registry holder and use that for all comparisons.
    let resId = ''
    try { resId = String(entity.getType().builtInRegistryHolder().key().location()) } catch (e) {
      try {
        let raw = String(entity.getType().toString())
        let m = raw.match(/^entity\.([^.]+)\.(.+)$/)
        if (m) resId = m[1] + ':' + m[2]
        else resId = raw
      } catch (e2) {}
    }
    let type = resId  // keep alias for downstream code that uses `type`

    // Skip entities with broken abstract methods that crash on property access
    if (BROKEN_ENTITIES.has(resId)) return
    // 2026-04-22: namespace-level skip for irons_spellbooks wizard mobs.
    // All AbstractSpellCastingMob subclasses share the abstract slot bug;
    // enumerate-by-id missed variants. Scaling wizard HP isn't critical —
    // their mod-native tuning is fine.
    if (resId.indexOf('irons_spellbooks:') === 0) return

    // Skip already-processed mobs (single flag for both systems)
    if (entity.persistentData.contains('icraft_scaled')) return

    // Skip bosses — they have their own scaling systems
    if (BOSSES.has(type)) return

    // Only scale hostile mobs (skip passives, NPCs)
    let isHostile = entity.monster || isHostileMod(type)
    if (!isHostile) {
      entity.persistentData.putBoolean('icraft_scaled', true)
      return
    }

    // Skip category-MONSTER projectile/beam/ring entities (Terramity etc.) so
    // their one-shot effect entities don't get tier-HP bloated. (A2 / PROJ-1.)
    if (isMobScaleBlacklisted(entity)) {
      entity.persistentData.putBoolean('icraft_scaled', true)
      return
    }

    // ── Mob Tier HP ──
    let tierMult = getMobTierMultiplier(entity, type)
    if (tierMult > 1.0) {
      entity.modifyAttribute(
        'minecraft:generic.max_health',
        'icraft_mob_tier_hp',
        tierMult - 1.0,
        'multiply_base'
      )
    }

    // ── Dimension Scaling: REMOVED 2026-05-03 ──
    // The per-dimension HP/DMG/SPD/armor multipliers and the End multi-zone
    // logic moved to iridescent_difficulty mod (java) which provides a
    // time-based scaling curve per dimension instead of a flat multiplier.
    // The mod's MobScalingHandler handles spawn scaling. See
    // iridescent-difficulty-mod/src/main/java/.../MobScalingHandler.java
    // and config/iridescent_difficulty-common.toml for the new defaults.
    //
    // What remains in this script:
    //  - Mob Tier HP (basic/mid/champion/boss) — static per-mob-type rule
    //    that's intended to compose with the new dimension scaling, not
    //    duplicate it.

    // Heal to new max after all modifiers applied
    entity.heal(entity.maxHealth)

    // Mark as processed (single flag for both systems)
    entity.persistentData.putBoolean('icraft_scaled', true)
  } catch (e) {
    // Some modded entities have abstract methods that crash when accessed
  }
})

// ── Dimension Scale Tables: REMOVED 2026-05-03 ──
// Replaced by iridescent_difficulty mod (Java) which provides time-based
// per-dimension scaling. See iridescent-difficulty-mod for the new
// implementation. The static multiplier table that lived here is now in
// config/iridescent_difficulty-common.toml as start%/cap%/capHours per
// tier. Dimension -> tier mapping is also config-driven there.

// ── Mob Tier Classification ──
function getMobTierMultiplier(entity, type) {
  if (isChampion(entity)) return 1.25
  if (BASIC_MOBS.has(type)) return 3.0
  if (MID_TIER_MOBS.has(type)) return 1.5
  if (entity.monster) return 3.0
  if (isHostileMod(type)) return 1.5
  return 1.0
}

// ── Champion Detection ──
function isChampion(entity) {
  try {
    let nbt = entity.fullNBT
    if (nbt && nbt.contains && nbt.contains('champion')) return true
    if (nbt && nbt.contains('ForgeData')) {
      let forgeData = nbt.getCompound('ForgeData')
      if (forgeData.contains('champion')) return true
    }
  } catch (e) {}
  return false
}

// ── Modded hostiles that don't extend Monster ──
function isHostileMod(type) {
  return type.startsWith('cataclysm:') ||
         type.startsWith('meetyourfight:') ||
         type.startsWith('stalwart_dungeons:')
}

// ── Boss Blacklist ──
// Entities with abstract methods that crash KubeJS on any property access.
// Rhino's try/catch does NOT catch java.lang.Error subclasses (e.g.
// AbstractMethodError), so every handler that accesses item slots or
// similar must guard against these entities BEFORE the call. Keep this
// list in sync with MOB_EQUIP_BROKEN_ENTITIES in mob_equipment.js.
const BROKEN_ENTITIES = new Set([
  'irons_spellbooks:necromancer',
  'irons_spellbooks:archevoker',
  'irons_spellbooks:cryomancer',
  'irons_spellbooks:pyromancer',
  'irons_spellbooks:priest',
])

const BOSSES = new Set([
  'minecraft:ender_dragon', 'minecraft:wither', 'minecraft:warden',
  'minecraft:elder_guardian',
  'twilightforest:naga', 'twilightforest:lich', 'twilightforest:hydra',
  'twilightforest:ur_ghast', 'twilightforest:knight_phantom',
  'twilightforest:snow_queen', 'twilightforest:minoshroom', 'twilightforest:alpha_yeti',
  'blue_skies:summoner', 'blue_skies:alchemist', 'blue_skies:starlit_crusher',
  'blue_skies:arachnarch',
  'aether:slider', 'aether:valkyrie_queen', 'aether:sun_spirit',
  'deep_aether:eots_controller',
  'undergarden:forgotten_guardian', 'undergarden:forgotten',
  'deeperdarker:stalker', 'deeperdarker:shattered',
  'deeperdarker:shriek_worm', 'deeperdarker:sculk_centipede',
  'cataclysm:netherite_monstrosity', 'cataclysm:ignis',
  'cataclysm:ender_guardian', 'cataclysm:ancient_remnant',
  'cataclysm:the_leviathan', 'cataclysm:the_harbinger',
  'cataclysm:maledictus', 'cataclysm:ender_golem',
  'cataclysm:ignited_revenant', 'cataclysm:void_blossom',
  'botania:doppleganger',
  'meetyourfight:swampjaw', 'meetyourfight:bellringer',
  'meetyourfight:dame_fortuna', 'meetyourfight:rosalyne',
  'mutantmonsters:mutant_zombie', 'mutantmonsters:mutant_skeleton',
  'mutantmonsters:mutant_creeper', 'mutantmonsters:mutant_enderman',
  'stalwart_dungeons:shelterer', 'stalwart_dungeons:nether_keeper',
  'stalwart_dungeons:awful_ghast', 'stalwart_dungeons:incomplete_wither',
  'keebsz:tower_guardian',
  'irons_spellbooks:dead_king', 'irons_spellbooks:fire_boss',
  'irons_spellbooks:citadel_keeper',
  'theabyss:soul_guard', 'theabyss:ice_knight',
  'theabyss:nightblade_boss', 'theabyss:the_roka', 'theabyss:elder',
  'ub:sorcerer', 'ub:storm',
  'majestic_menaces:teikoku_senshi',
])

// ── Basic Mobs (3x HP) ──
const BASIC_MOBS = new Set([
  'minecraft:zombie', 'minecraft:skeleton', 'minecraft:spider', 'minecraft:creeper',
  'minecraft:drowned', 'minecraft:stray', 'minecraft:husk', 'minecraft:cave_spider',
  'minecraft:slime', 'minecraft:silverfish', 'minecraft:witch', 'minecraft:phantom',
  'minecraft:enderman', 'minecraft:zombie_villager', 'minecraft:vindicator',
  'minecraft:pillager', 'minecraft:evoker', 'minecraft:vex',
  'minecraft:skeleton_horseman', 'minecraft:magma_cube',
  'alexsmobs:grizzly_bear', 'alexsmobs:rattlesnake', 'alexsmobs:crocodile',
  'alexsmobs:soul_vulture', 'alexsmobs:bone_serpent',
  'creeper_overhaul:jungle_creeper', 'creeper_overhaul:bamboo_creeper',
  'creeper_overhaul:desert_creeper', 'creeper_overhaul:badlands_creeper',
  'creeper_overhaul:hills_creeper', 'creeper_overhaul:dripstone_creeper',
  'creeper_overhaul:cave_creeper', 'creeper_overhaul:dark_oak_creeper',
  'creeper_overhaul:mushroom_creeper', 'creeper_overhaul:ocean_creeper',
  'creeper_overhaul:spruce_creeper', 'creeper_overhaul:beach_creeper',
  'creeper_overhaul:snowy_creeper', 'creeper_overhaul:swamp_creeper',
  'creeper_overhaul:savannah_creeper',
  'enemy_expansion:undead_warrior', 'enemy_expansion:undead_archer',
])

// ── Mid-Tier Mobs (1.5x HP) ──
const MID_TIER_MOBS = new Set([
  'minecraft:blaze', 'minecraft:wither_skeleton', 'minecraft:piglin_brute',
  'minecraft:ghast', 'minecraft:hoglin', 'minecraft:zoglin', 'minecraft:piglin',
  'minecraft:zombified_piglin', 'minecraft:guardian', 'minecraft:elder_guardian',
  'minecraft:ravager', 'minecraft:endermite', 'minecraft:shulker',
  'twilightforest:blockchain_goblin', 'twilightforest:helmet_crab',
  'twilightforest:hostile_wolf', 'twilightforest:kobold', 'twilightforest:maze_slime',
  'twilightforest:minotaur', 'twilightforest:mist_wolf', 'twilightforest:redcap',
  'twilightforest:redcap_sapper', 'twilightforest:skeleton_druid',
  'twilightforest:slime_beetle', 'twilightforest:swarm_spider',
  'twilightforest:towerwood_borer', 'twilightforest:wraith', 'twilightforest:yeti',
  'twilightforest:winter_wolf', 'twilightforest:fire_beetle',
  'twilightforest:pinch_beetle', 'twilightforest:death_tome',
  'twilightforest:troll', 'twilightforest:giant_miner', 'twilightforest:armored_giant',
  'blue_skies:venomous_snake', 'blue_skies:soul_spider',
  'blue_skies:whistleshell_crab', 'blue_skies:armored_frost_spirit',
  'blue_skies:frost_spirit', 'blue_skies:shadowfolk',
  'blue_skies:blinding_sentinel', 'blue_skies:stonelet',
  'aether:sentry', 'aether:mimic', 'aether:cockatrice',
  'aether:zephyr', 'aether:fire_minion',
  'undergarden:rotling', 'undergarden:brute', 'undergarden:stoneborn',
  'undergarden:sploogie', 'undergarden:nargoyle', 'undergarden:muncher',
  'deeperdarker:sculk_snapper', 'deeperdarker:sculk_leech', 'deeperdarker:sculk_centipede',
  'irons_spellbooks:dead_king_knight', 'irons_spellbooks:venomous_spider',
  'irons_spellbooks:necromancer', 'irons_spellbooks:apothecarist',
  'irons_spellbooks:cryomancer', 'irons_spellbooks:pyromancer',
  'irons_spellbooks:priest', 'irons_spellbooks:archevoker', 'irons_spellbooks:keeper',
  'theabyss:dark_skeleton', 'theabyss:dark_zombie',
  'theabyss:soul_knight', 'theabyss:shadow_mage',
  'cataclysm:kobolediator', 'cataclysm:deepling', 'cataclysm:deepling_brute',
  'cataclysm:deepling_priest', 'cataclysm:deepling_angler',
  'cataclysm:aptrgangr', 'cataclysm:lionfish', 'cataclysm:coralssus',
])

console.log('[IridescentCraft] Unified mob scaling loaded (tier HP + dimension scaling)')
