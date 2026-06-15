// =============================================================================
// REGEN CONTROL -- slow natural health regen to ~1 heart (2 HP) / 10s
// =============================================================================
// 2026-06-14 (task_18beaeb5). Operator-approved regen nerf.
//
// WHY: vanilla food regen gives up to 2 HP/s (fast saturation tier) -- too
// generous now Hunger Overhaul's food system is reliable. HO's OWN regen is
// INERT (its config threshold 22 > the 20 food cap, so CoreProcedure's heal
// never fires) and HO only LAYERS on vanilla anyway -- so plain vanilla
// saturation/food regen is the real healer. Lowering HO can't slow regen
// (it's additive); the fix is: turn vanilla food regen OFF, add a trickle here.
//
// gamerule naturalRegeneration=false removes ONLY food-based passive regen.
// Potions, golden apples, gear regen attributes, affixes, origin passives,
// lifesteal, and bandages all use LivingEntity.heal() and are UNAFFECTED.
// Decompile + full rationale: internal design/draft-regen-nerf-2026-06-14.md.
// =============================================================================

// -- Tunables ---------------------------------------------------------------
var REGEN_FOOD_GATE = 18    // need foodLevel >= this to regen (mirrors vanilla's gate)
var REGEN_INTERVAL  = 10    // ticks between heals (10 = 0.5s)
var REGEN_PER_HEAL  = 0.1   // HP per heal -> 0.1 / 0.5s = 0.2 HP/s = 1 heart / 10s
var REGEN_EXHAUST   = 0.6   // food exhaustion per heal (~6/HP, vanilla-like); set 0 = no food cost

// 1) Kill vanilla food regen on the live (already-created) world every load.
//    The Crust default_game_rules default only applies to NEW worlds, so set it
//    here for the existing one too. (Established pattern: death_penalty.js sets
//    keepInventory the same way.)
ServerEvents.loaded(event => {
  try { event.server.runCommandSilent('gamerule naturalRegeneration false') } catch (e) {}
})

// 2) Controlled slow regen via the pack's per-player tick dispatcher
//    (0_tick_master.js -> global.registerPlayerTick). `var` (Rhino redeclaration-safe).
global.tick_regenControl = function (event) {
  try {
    var player = event.player
    if (!player) return
    if (player.health <= 0 || player.health >= player.maxHealth) return
    var food = 0
    try { food = player.foodData.foodLevel } catch (e) { return }
    if (food < REGEN_FOOD_GATE) return
    player.heal(REGEN_PER_HEAL)
    // Food cost is best-effort (accessor may vary); regen still works if it no-ops,
    // and the food>=18 gate + HO passive drain keep food meaningful regardless.
    if (REGEN_EXHAUST > 0) { try { player.foodData.addExhaustion(REGEN_EXHAUST) } catch (e) {} }
  } catch (e) {}
}
global.registerPlayerTick('tick_regenControl', REGEN_INTERVAL, 3)
