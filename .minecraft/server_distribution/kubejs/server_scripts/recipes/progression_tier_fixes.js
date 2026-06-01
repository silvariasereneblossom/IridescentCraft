// progression_tier_fixes.js
// Progression-framework tiering fixes -- process/station gates the *ingredient* audit
// missed. Companion to create_blaze_burner_t1.js. See design/progression-framework.md.
ServerEvents.recipes(event => {

  // === #2: T1->T2 STEEL BRIDGE (Create heated mixing) ===
  // thermal:steel_ingot's only native recipe is Induction Smelter + coal_coke, and coke
  // comes only from the Pyrolyzer (blaze rod + nether bricks = Nether/T3). That gated the
  // ENTIRE Thermal T2 tier (every machine needs a steel machine_frame) behind the Nether,
  // breaking pure-engineering sufficiency. The pack intended a "Create mixing steel from
  // iron+coal" bend (tier_gated_recipes.js:195) but it never landed -- the only Create
  // steel recipes are immersiveengineering-compat and IE is not installed. This adds it:
  // 1 iron + 2 coal -> 1 steel, HEATED (needs a Blaze Burner, now T1). The clean
  // Create(T1) -> steel -> Thermal(T2) tech bridge.
  event.custom({
    type: 'create:mixing',
    ingredients: [
      { item: 'minecraft:iron_ingot' },
      { tag: 'minecraft:coals' },
      { tag: 'minecraft:coals' }
    ],
    results: [{ item: 'thermal:steel_ingot' }],
    heatRequirement: 'heated'
  }).id('icraft:create/steel_from_iron_coal')

  // === #1: Magma Crucible (T2) -- nether_bricks (T3) -> bricks ===
  event.remove({ id: 'thermal:machine_crucible' })
  event.shaped('thermal:machine_crucible', [
    ' X ',
    'YCY',
    'IPI'
  ], {
    X: '#forge:glass',
    Y: 'minecraft:bricks',           // was minecraft:nether_bricks (Nether = T3)
    C: 'thermal:machine_frame',
    I: '#forge:gears/invar',
    P: 'thermal:rf_coil'
  }).id('icraft:thermal/machine_crucible_t2')

  // === #3: Ars Enchanting Apparatus (T2) -- diamond (T3) -> mana_diamond ===
  // Matches the pack's existing diamond->mana_diamond convention for T2 Ars/ISS stations;
  // also unblocks magebloom_fiber + drygmy_charm (both crafted AT the Apparatus).
  event.remove({ id: 'ars_nouveau:enchanting_apparatus' })
  event.shaped('ars_nouveau:enchanting_apparatus', [
    'nsn',
    'gdg',
    'nsn'
  ], {
    n: '#forge:nuggets/gold',
    s: 'ars_nouveau:sourcestone',
    g: '#forge:ingots/gold',
    d: 'botania:mana_diamond'        // was #forge:gems/diamond (diamond = T3 in-pack)
  }).id('icraft:ars/enchanting_apparatus_t2')
})
