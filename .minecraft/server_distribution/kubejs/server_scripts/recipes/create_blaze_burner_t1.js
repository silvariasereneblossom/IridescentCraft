// create_blaze_burner_t1.js
// Tiering fix (progression framework): un-gate Create's heated half to T1.
//
// The Empty Blaze Burner is DOUBLY Nether-gated: its recipe needs NETHERRACK
// (forge:netherrack, Nether = T3), AND it must be filled with a captured Blaze (T3) to
// function. So the entire heated branch of Create -- Brass (heated mixing), Brass Casing,
// Brass-tier machines (Deployer, Mechanical Crafter...), Precision Mechanisms -- was
// secretly Nether-gated despite passing the ingredient audit (a HEAT SOURCE is not a
// recipe ingredient, so it never showed up in the trace).
//
// Fix: a T1 path to a FILLED, working create:blaze_burner -- iron plates + a campfire core,
// no netherrack, no blaze, no Nether trip. The empty-burner recipe stays intact as the
// Nether alternative. Mirrors the pack's existing brewing-stand re-tier.
// (Operator: "make the burner without the Blaze -- prefilled.")
ServerEvents.recipes(event => {
  event.shaped('create:blaze_burner', [
    ' I ',
    'ICI',
    ' I '
  ], {
    I: '#forge:plates/iron',
    C: 'minecraft:campfire'
  }).id('icraft:create/blaze_burner_t1')
})
