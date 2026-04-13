// registry_verify.js
// Place in: kubejs/server_scripts/
// READS RESULTS: grep/findstr for [VRFY] in logs/latest.log
//   Windows CMD:  findstr "[VRFY]" logs\latest.log > verify.txt
//   Windows PS:   Select-String -Path "logs\latest.log" -Pattern "\[VRFY\]" | Out-File verify.txt
//   Linux/Mac:    grep "\[VRFY\]" logs/latest.log > verify.txt
// Output is ~15 lines. Remove this script after verification.

ServerEvents.loaded(event => {
  try {
    var ForgeRegistries = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
    var ResourceLocation = Java.loadClass('net.minecraft.resources.ResourceLocation')

    var entityReg = ForgeRegistries.ENTITY_TYPES
    var itemReg = ForgeRegistries.ITEMS
    var passed = 0
    var failed = 0
    var missing = []

    var check = function(registry, id, type) {
      var parts = id.split(':')
      var rl = new ResourceLocation(parts[0], parts[1])
      if (registry.containsKey(rl)) {
        passed++
      } else {
        failed++
        missing.push(id)
        console.info('[VRFY] MISSING ' + type + ': ' + id)
      }
    }

    // ── BOSS ENTITIES ──
    var entities = [
      // Meet Your Fight (no magma boss - dame_fortuna added)
      'meetyourfight:swampjaw', 'meetyourfight:rosalyne', 'meetyourfight:bellringer', 'meetyourfight:dame_fortuna',
      'mutantmonsters:mutant_zombie', 'mutantmonsters:mutant_skeleton', 'mutantmonsters:mutant_creeper', 'mutantmonsters:mutant_enderman',
      'stalwart_dungeons:awful_ghast', 'stalwart_dungeons:nether_keeper', 'stalwart_dungeons:shelterer',
      'irons_spellbooks:dead_king', 'irons_spellbooks:citadel_keeper', 'irons_spellbooks:archevoker',
      // The Abyss (corrected names)
      'theabyss:nightblade_boss', 'theabyss:the_roka', 'theabyss:elder',
      'theabyss:ice_knight', 'theabyss:soul_guard', 'theabyss:ancient_seeker', 'theabyss:crystal_golem',
      // Majestic Menaces (corrected: teikoku_senshi not great_hunger)
      'majestic_menaces:teikoku_senshi',
      'cataclysm:netherite_monstrosity', 'cataclysm:ender_golem', 'cataclysm:ender_guardian',
      'cataclysm:ignis', 'cataclysm:the_harbinger', 'cataclysm:the_leviathan', 'cataclysm:ancient_remnant',
      'twilightforest:naga', 'twilightforest:lich', 'twilightforest:hydra',
      'twilightforest:ur_ghast', 'twilightforest:knight_phantom', 'twilightforest:snow_queen',
      'twilightforest:minoshroom', 'twilightforest:alpha_yeti'
      // REMOVED: keebsz (not installed), ub (not installed)
    ]
    entities.forEach(function(id) { check(entityReg, id, 'ENTITY') })

    // ── CRITICAL ITEMS (4) ──
    var items = [
      'thermal:machine_frame', 'mekanism:steel_casing',
      'mekanism:ultimate_control_circuit', 'simplyswords:runic_tablet'
    ]
    items.forEach(function(id) { check(itemReg, id, 'ITEM') })

    // ── DIMENSIONS ──
    var loadedDims = []
    event.server.allLevels.forEach(function(level) {
      try {
        // KubeJS wraps dimension key - try multiple access patterns
        var dim = '' + level.dimension
        // Clean up if it has ResourceKey wrapper text
        dim = dim.replace('ResourceKey[minecraft:dimension / ', '').replace(']', '')
        loadedDims.push(dim)
      } catch(de) {
        console.info('[VRFY] DIM READ ERROR: ' + de)
      }
    })

    var expectedDims = [
      'minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end',
      'twilightforest:twilight_forest',
      'blue_skies:everbright', 'blue_skies:everdawn',
      'aether:the_aether',
      'undergarden:undergarden',
      'deeperdarker:otherside',
      'theabyss:the_abyss', 'theabyss:frost_world', 'theabyss:spectral_world',
      'irons_spellbooks:pocket_dimension',
      'mahoutsukai:reality_marble'
      // REMOVED: deep_aether:the_aether (not loaded), the_bumblezone (not installed)
    ]

    expectedDims.forEach(function(id) {
      if (loadedDims.indexOf(id) >= 0) {
        passed++
      } else {
        console.info('[VRFY] DIM NOT LOADED: ' + id)
      }
    })

    console.info('[VRFY] LOADED DIMS: ' + loadedDims.sort().join(', '))

    // ── NAMESPACE SPOT CHECK ──
    var nsCounts = {}
    entityReg.getEntries().forEach(function(entry) {
      var ns = entry.getKey().location().getNamespace()
      if (!nsCounts[ns]) nsCounts[ns] = 0
      nsCounts[ns]++
    })

    var criticalNS = [
      'meetyourfight', 'mutantmonsters', 'stalwart_dungeons',
      'irons_spellbooks', 'theabyss', 'majestic_menaces', 'cataclysm',
      'twilightforest', 'blue_skies', 'aether', 'deep_aether', 'undergarden',
      'deeperdarker', 'simplyswords', 'thermal', 'mekanism', 'champions',
      'dungeons_plus', 'valhelsia_structures', 'brutalbosses',
      'dungeons_arise', 'repurposed_structures', 'idas',
      'integrated_stronghold', 'dungeoncrawl', 'structory', 'structory_towers'
      // Note: keebsz, ub register LOOT TABLES only (no entities/items)
    ]

    var nsMissing = []
    var nsFound = []
    criticalNS.sort().forEach(function(ns) {
      if (nsCounts[ns]) {
        nsFound.push(ns + '(' + nsCounts[ns] + ')')
      } else {
        nsMissing.push(ns)
      }
    })
    console.info('[VRFY] NS OK: ' + nsFound.join(', '))
    if (nsMissing.length > 0) {
      console.info('[VRFY] NS MISSING: ' + nsMissing.join(', '))
    }

    // ── SUMMARY ──
    console.info('[VRFY] ==============================')
    console.info('[VRFY] PASSED: ' + passed + '  FAILED: ' + failed)
    console.info('[VRFY] ==============================')

    if (failed > 0) {
      console.info('[VRFY] FIX: ' + missing.join(' | '))
    } else {
      console.info('[VRFY] ALL CLEAR')
    }

  } catch(e) {
    console.error('[VRFY] FATAL: ' + e)
  }
})
