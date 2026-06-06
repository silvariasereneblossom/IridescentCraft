// =============================================================================
// ENTITY-ID VALIDATOR for loot modifiers (boot-time guard)
// =============================================================================
// WHY THIS EXISTS (2026-06-06): LootJS addEntityLootModifier(String) resolves
// ids through BuiltInRegistries.ENTITY_TYPE, which is a DefaultedRegistry whose
// DEFAULT ENTRY IS minecraft:pig. An unresolvable id (typo, renamed boss,
// wrong-mod entity, item-id-as-entity) does NOT error - it silently registers
// the modifier against PIGS. This shipped boss loot (magehunter, ultimate
// reforging tokens, waystone cores) on every pig for weeks and survived four
// audit passes that read the id strings without resolving them.
//
// This guard validates the snapshot list below at server start and logs a
// LOUD error for every id that does not resolve. It cannot block the broken
// modifier (registration already happened) but converts the silent leak into
// a grep-able boot line: search the log for ENTITY-ID-VALIDATOR.
//
// REGEN the list after adding/changing loot modifiers:
//   grep -rhoE "addEntityLootModifier\\(['\"][a-z_:0-9]+['\"]" kubejs/server_scripts/ \
//     | sed -E "s/.*\\(['\"]//; s/['\"]$//" | sort -u
// (plus the boss: ids in unique_itemset_registry.js)
// =============================================================================

ServerEvents.loaded(function (event) {
  var ENTITY_IDS = [
    'aether:cockatrice',
    'aether:slider',
    'aether:sun_spirit',
    'aether:valkyrie_queen',
    'alexsmobs:anaconda',
    'alexsmobs:bone_serpent',
    'alexsmobs:cachalot_whale',
    'alexsmobs:caiman',
    'alexsmobs:cosmaw',
    'alexsmobs:crimson_mosquito',
    'alexsmobs:crocodile',
    'alexsmobs:dropbear',
    'alexsmobs:enderiophage',
    'alexsmobs:froststalker',
    'alexsmobs:hammerhead_shark',
    'alexsmobs:komodo_dragon',
    'alexsmobs:laviathan',
    'alexsmobs:leafcutter_ant',
    'alexsmobs:mimicube',
    'alexsmobs:murmur',
    'alexsmobs:snow_leopard',
    'alexsmobs:soul_vulture',
    'alexsmobs:straddler',
    'alexsmobs:void_worm',
    'alexsmobs:warped_mosco',
    'blue_skies:alchemist',
    'blue_skies:arachnarch',
    'blue_skies:starlit_crusher',
    'blue_skies:summoner',
    'botania:doppleganger',
    'cardinal_sins:sinofpride',
    'cataclysm:ancient_remnant',
    'cataclysm:coralssus',
    'cataclysm:ender_guardian',
    'cataclysm:ignis',
    'cataclysm:ignited_revenant',
    'cataclysm:maledictus',
    'cataclysm:netherite_monstrosity',
    'cataclysm:the_harbinger',
    'cataclysm:the_leviathan',
    'deep_aether:eots_controller',
    'deeperdarker:shattered',
    'deeperdarker:stalker',
    'irons_spellbooks:archevoker',
    'irons_spellbooks:citadel_keeper',
    'irons_spellbooks:cryomancer',
    'irons_spellbooks:dead_king',
    'irons_spellbooks:fire_boss',
    'irons_spellbooks:pyromancer',
    'minecraft:blaze',
    'minecraft:chicken',
    'minecraft:cow',
    'minecraft:ender_dragon',
    'minecraft:enderman',
    'minecraft:evoker',
    'minecraft:phantom',
    'minecraft:pig',
    'minecraft:sheep',
    'minecraft:shulker',
    'minecraft:warden',
    'minecraft:wither',
    'minecraft:wither_skeleton',
    'mowziesmobs:ferrous_wroughtnaut',
    'mowziesmobs:frostmaw',
    'mowziesmobs:naga',
    'mowziesmobs:sculptor',
    'mowziesmobs:umvuthi',
    'mutantmonsters:mutant_creeper',
    'mutantmonsters:mutant_enderman',
    'mutantmonsters:mutant_skeleton',
    'mutantmonsters:mutant_zombie',
    'savage_and_ravage:executioner',
    'stalwart_dungeons:awful_ghast',
    'stalwart_dungeons:giddy_blaze',
    'stalwart_dungeons:incomplete_wither',
    'stalwart_dungeons:nether_keeper',
    'stalwart_dungeons:reinforced_blaze',
    'stalwart_dungeons:shelterer',
    'stalwart_dungeons:shelterer_without_armor',
    'terramity:enchanter_merlin',
    'terramity:gob',
    'terramity:sorceress_circe',
    'terramity:super_sniffer',
    'terramity:thunker',
    'theabyss:guard',
    'theabyss:ice_knight',
    'theabyss:soul_guard',
    'twilightforest:alpha_yeti',
    'twilightforest:hydra',
    'twilightforest:knight_phantom',
    'twilightforest:lich',
    'twilightforest:minoshroom',
    'twilightforest:naga',
    'twilightforest:snow_queen',
    'twilightforest:ur_ghast',
    'undergarden:forgotten',
    'undergarden:forgotten_guardian',
    'undergarden:rotbeast'
  ]
  try {
    var BuiltInRegistries = Java.loadClass('net.minecraft.core.registries.BuiltInRegistries')
    var ResourceLocation = Java.loadClass('net.minecraft.resources.ResourceLocation')
    var reg = BuiltInRegistries.ENTITY_TYPE
    var bad = []
    for (var i = 0; i < ENTITY_IDS.length; i++) {
      try {
        if (!reg.containsKey(new ResourceLocation(ENTITY_IDS[i]))) bad.push(ENTITY_IDS[i])
      } catch (e) { bad.push(ENTITY_IDS[i] + ' (malformed)') }
    }
    if (bad.length === 0) {
      console.log('[ENTITY-ID-VALIDATOR] all ' + ENTITY_IDS.length + ' loot-modifier entity ids resolve')
    } else {
      for (var j = 0; j < bad.length; j++) {
        console.error('[ENTITY-ID-VALIDATOR] UNRESOLVABLE ENTITY ID: "' + bad[j]
          + '" - its loot modifier is silently targeting MINECRAFT:PIG (DefaultedRegistry trap). FIX THE ID.')
      }
    }
  } catch (e) {
    console.error('[ENTITY-ID-VALIDATOR] validator failed: ' + e)
  }
})
