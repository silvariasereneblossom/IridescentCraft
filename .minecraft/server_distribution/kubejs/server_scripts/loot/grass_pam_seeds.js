// =============================================================================
// PAM'S HC2 SEEDS FROM GRASS
// Place in: kubejs/server_scripts/loot/grass_pam_seeds.js
// =============================================================================
//
// 2026-05-14: Tester reported "only Thermal seeds drop from grass". Pam's
// HarvestCraft 2 ships 97 seed items but its declared GLMs
// (pamhc2crops:fern_drops / grass_drops / tall_grass_drops) are vendor-broken
// -- the mod registers the GLM IDs in data/forge/loot_modifiers/
// global_loot_modifiers.json but does NOT ship the impl JSON files OR a
// registered Java type. They've been silently dead for the lifetime of the
// pack (see changelog 2026-05-10 entry "Adjacent finding: PamHC2 GLMs").
//
// Working around the vendor bug via LootJS: hooks the grass / tall_grass /
// fern / large_fern block loot tables and adds each Pam seed with a small
// individual chance. Total expected drop rate per grass break: ~7% of
// SOME Pam seed, distributed uniformly across the 97 options.
//
// Each individual seed: ~0.07% per grass break. Very rare per-seed, but
// the pool's breadth means every grass biome session yields surprise
// finds across the full Pam's crop catalog.
//
// Pairs with:
//   Thermal Cultivation's seeds_from_grass GLM (handles modded Thermal seeds)
//   -- works natively, untouched here.
// =============================================================================

const PAM_SEEDS = [
  'pamhc2crops:agaveseeditem', 'pamhc2crops:alfalfaseeditem',
  'pamhc2crops:aloeseeditem', 'pamhc2crops:amaranthseeditem',
  'pamhc2crops:arrowrootseeditem', 'pamhc2crops:artichokeseeditem',
  'pamhc2crops:asparagusseeditem', 'pamhc2crops:barleyseeditem',
  'pamhc2crops:barrelcactusseeditem', 'pamhc2crops:beanseeditem',
  'pamhc2crops:bellpepperseeditem', 'pamhc2crops:blackberryseeditem',
  'pamhc2crops:blueberryseeditem', 'pamhc2crops:bokchoyseeditem',
  'pamhc2crops:broccoliseeditem', 'pamhc2crops:brusselsproutseeditem',
  'pamhc2crops:cabbageseeditem', 'pamhc2crops:cactusfruitseeditem',
  'pamhc2crops:calabashseeditem', 'pamhc2crops:candleberryseeditem',
  'pamhc2crops:canolaseeditem', 'pamhc2crops:cantaloupeseeditem',
  'pamhc2crops:cassavaseeditem', 'pamhc2crops:cattailseeditem',
  'pamhc2crops:cauliflowerseeditem', 'pamhc2crops:celeryseeditem',
  'pamhc2crops:chiaseeditem', 'pamhc2crops:chickpeaseeditem',
  'pamhc2crops:chilipepperseeditem', 'pamhc2crops:cloudberryseeditem',
  'pamhc2crops:coffeebeanseeditem', 'pamhc2crops:cornseeditem',
  'pamhc2crops:cottonseeditem', 'pamhc2crops:cranberryseeditem',
  'pamhc2crops:cucumberseeditem', 'pamhc2crops:eggplantseeditem',
  'pamhc2crops:elderberryseeditem', 'pamhc2crops:flaxseeditem',
  'pamhc2crops:garlicseeditem', 'pamhc2crops:gingerseeditem',
  'pamhc2crops:grapeseeditem', 'pamhc2crops:greengrapeseeditem',
  'pamhc2crops:guaranaseeditem', 'pamhc2crops:huckleberryseeditem',
  'pamhc2crops:jicamaseeditem', 'pamhc2crops:juniperberryseeditem',
  'pamhc2crops:juteseeditem', 'pamhc2crops:kaleseeditem',
  'pamhc2crops:kenafseeditem', 'pamhc2crops:kiwiseeditem',
  'pamhc2crops:kohlrabiseeditem', 'pamhc2crops:leekseeditem',
  'pamhc2crops:lentilseeditem', 'pamhc2crops:lettuceseeditem',
  'pamhc2crops:lotusseeditem', 'pamhc2crops:milletseeditem',
  'pamhc2crops:mulberryseeditem', 'pamhc2crops:mustardseedsseeditem',
  'pamhc2crops:nettlesseeditem', 'pamhc2crops:nopalesseeditem',
  'pamhc2crops:oatsseeditem', 'pamhc2crops:okraseeditem',
  'pamhc2crops:onionseeditem', 'pamhc2crops:papyrusseeditem',
  'pamhc2crops:parsnipseeditem', 'pamhc2crops:peanutseeditem',
  'pamhc2crops:peasseeditem', 'pamhc2crops:pineappleseeditem',
  'pamhc2crops:quinoaseeditem', 'pamhc2crops:radishseeditem',
  'pamhc2crops:raspberryseeditem', 'pamhc2crops:rhubarbseeditem',
  'pamhc2crops:riceseeditem', 'pamhc2crops:rutabagaseeditem',
  'pamhc2crops:ryeseeditem', 'pamhc2crops:scallionseeditem',
  'pamhc2crops:sesameseedsseeditem', 'pamhc2crops:sisalseeditem',
  'pamhc2crops:sorghumseeditem', 'pamhc2crops:soybeanseeditem',
  'pamhc2crops:spiceleafseeditem', 'pamhc2crops:spinachseeditem',
  'pamhc2crops:strawberryseeditem', 'pamhc2crops:sunchokeseeditem',
  'pamhc2crops:sweetpotatoseeditem', 'pamhc2crops:taroseeditem',
  'pamhc2crops:tealeafseeditem', 'pamhc2crops:tomatilloseeditem',
  'pamhc2crops:tomatoseeditem', 'pamhc2crops:truffleseeditem',
  'pamhc2crops:turnipseeditem', 'pamhc2crops:waterchestnutseeditem',
  'pamhc2crops:whitemushroomseeditem', 'pamhc2crops:wintersquashseeditem',
  'pamhc2crops:wolfberryseeditem', 'pamhc2crops:yuccaseeditem',
  'pamhc2crops:zucchiniseeditem',
]

// Target the four vanilla grass-family blocks
const GRASS_BLOCKS = ['minecraft:grass', 'minecraft:tall_grass',
                      'minecraft:fern', 'minecraft:large_fern']

// Per-seed chance set so total expected is ~7% across the pool.
// 97 seeds * 0.00072 = ~0.07 cumulative.
const PER_SEED_CHANCE = 0.00072

LootJS.modifiers(event => {
  GRASS_BLOCKS.forEach(blockId => {
    var mod = event.addBlockLootModifier(blockId)
    PAM_SEEDS.forEach(seedId => {
      mod.addLoot(LootEntry.of(seedId).when(c => c.randomChance(PER_SEED_CHANCE)))
    })
  })
  console.log('[grass_pam_seeds] Pam HC2 seeds added to ' + GRASS_BLOCKS.length +
              ' grass blocks (' + PAM_SEEDS.length + ' seeds, ~7% total per break)')
})
