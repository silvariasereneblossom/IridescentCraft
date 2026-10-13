// =============================================================================
// CODEX SUBMIT -- gates/codex_progression_engine.js: what `/icraft codex submit`,
// `balance` and `exchange` take from a player, from which slots, and what they leave.
// Written 2026-10-13 BEFORE the engine's slot loops were touched, to record the
// behaviour as it is: no suite covered these commands (the token bank read
// `inv.size`, which does not exist, until 2026-10-12 and had never converted
// anything; nothing said so).
//
// What is pinned here, on the production script engine and an inventory that behaves
// like the real one (41 slots, no `size`, ids that are Java strings, `count` a bean):
//   * the sweep is the MAIN inventory, slots 0 to 35. Worn armour (36 to 39) and the
//     off hand (40) are neither counted nor taken (ruling 2026-10-12);
//   * only whole conversion units are taken: a remainder stays in the inventory;
//   * stacks are taken from the lowest slot up; an emptied slot holds the empty stack;
//   * a resource stops at its lifetime cap, counted in ITEMS in the player's saved
//     data (one key per item; per item AND tier for the four bulk metals);
//   * the bulk metals mint the token of the tier the player is working towards, and
//     nothing once tier 4 is held; a lane (`engineering`, `magic`) converts its own;
//   * a held threshold of tokens is spent, exactly, for the next tier;
//   * the exchange takes tokens for experience at tier 4 only.
//
// The suite calls the script's own functions (codexSubmit, codexBalance,
// codexCheckAdvance, codexExchange): the Brigadier command tree that leads to them is
// not built here. Two things the mocks do not do, and the checks say where it matters:
//   * player.give() records the stack and does NOT put it into the inventory, so a
//     submit cannot reach a threshold with the tokens it has just handed out;
//   * a stack has no display name: a report line names the item by its id.
// The same scenarios run as the real command on a full-pack server are in the internal
// repo (dev/helpers-2026-10-13, the H2 probe).
// =============================================================================
var CX = {
  IRON: 'minecraft:iron_ingot', BRASS: 'create:brass_ingot', WHEEL: 'create:crushing_wheel', RUNE: 'botania:rune_water',
  DIAMOND: 'minecraft:diamond', STICK: 'minecraft:stick',
  T1: 'icraft:progression_token_t1', T2: 'icraft:progression_token_t2', T3: 'icraft:progression_token_t3'
}
var cx_put = function (p, slot, id, n) { T.slot(p, slot, new MStack(id, n)) }
// how many items a slot holds (0 for an empty slot)
var cx_n = function (p, slot) { var s = p.inventory.getStackInSlot(slot); return s.isEmpty() ? 0 : Number(A.count(s)) }
// 'slot:count slot:count' for the slots asked
var cx_row = function (p, slots) { return slots.map(function (s) { return s + ':' + cx_n(p, s) }).join(' ') }
// everything player.give() was called with, in order: '2 icraft:progression_token_t1, ...'
var cx_given = function (p) {
  var g = T.get(p, 'given'), out = []
  for (var i = 0; i < Number(T.size(g)); i++) out.push(Number(A.count(g.get(i))) + ' ' + String(g.get(i).id))
  return out.join(', ')
}
var cx_saved = function (p, key) { return Number(p.persistentData.getInt(key)) }
var cx_has = function (p, stage) { return AStages.playerHasStage(stage, p) === true }
var cx_told = function (p, part) { return String(A.told(p)).indexOf(part) >= 0 }

T_run('codex: loads', function () {
  ok(T_LOAD_ERRORS.length === 0, 'the libraries and the engine load: ' + T_LOAD_ERRORS.join(' / '))
  ok(typeof codexSubmit === 'function' && typeof codexBalance === 'function' && typeof codexCheckAdvance === 'function' && typeof codexExchange === 'function',
    'codexSubmit, codexBalance, codexCheckAdvance and codexExchange are there')
  var smith = T_newPlayer('Smith')
  ok(typeof smith.inventory.size === 'undefined' && Number(smith.inventory.slots) === 41, 'the inventory has no `size` and 41 slots, as in game')
  cx_put(smith, 0, CX.IRON, 1)
  ok(typeof smith.inventory.getStackInSlot(0).id === 'object', 'an id read from a stack is a Java string, as in game')
  cx_put(smith, 0, 'minecraft:air', 0)
})

T_run('codex submit: the main inventory, whole units, lowest slot first', function () {
  var p = T_newPlayer('Smith2')
  cx_put(p, 0, CX.IRON, 64); cx_put(p, 5, CX.IRON, 64); cx_put(p, 9, CX.IRON, 64); cx_put(p, 35, CX.IRON, 30)
  cx_put(p, 36, CX.IRON, 64)        // an armour slot
  cx_put(p, 40, CX.IRON, 64)        // the off hand
  cx_put(p, 2, CX.STICK, 10)        // not a Codex material
  cx_put(p, 7, CX.BRASS, 49)        // one short of a unit of 50
  var result = Number(codexSubmit(p))
  ok(result === 1, 'a submit that minted returns 1 (got ' + result + ')')
  ok(cx_given(p) === '2 ' + CX.T1, '222 iron in slots 0-35 at 1 token per 100: two tier-1 tokens, 200 taken (given: ' + cx_given(p) + ')')
  ok(cx_row(p, [0, 5, 9, 35]) === '0:0 5:0 9:0 35:22', 'taken from the lowest slot up, the remainder of 22 stays in the last one (' + cx_row(p, [0, 5, 9, 35]) + ')')
  ok(p.inventory.getStackInSlot(0).isEmpty() && p.inventory.getStackInSlot(9).isEmpty(), 'an emptied slot holds the empty stack')
  ok(cx_row(p, [36, 40]) === '36:64 40:64', 'the armour slot and the off hand are neither counted nor taken (' + cx_row(p, [36, 40]) + ')')
  ok(cx_row(p, [2, 7]) === '2:10 7:49', 'what is no material, and a material short of one unit, are left alone (' + cx_row(p, [2, 7]) + ')')
  ok(cx_saved(p, 'icraft_codex_sub_minecraft_iron_ingot_t1') === 200, 'the lifetime count of iron at tier 1 is 200 items (' + cx_saved(p, 'icraft_codex_sub_minecraft_iron_ingot_t1') + ')')
  ok(cx_saved(p, 'icraft_codex_sub_create_brass_ingot') === 0, 'nothing is counted for the brass that was not taken')
  ok(cx_told(p, '+2 T1 tokens') && cx_told(p, 'Banked: ') && cx_told(p, '+2 Tier 1 tokens') && cx_told(p, CX.IRON), 'the report names the item, the tokens and the bank line')
  A.clearTold(p)
  var again = Number(codexSubmit(p))
  ok(again === 0 && cx_given(p) === '2 ' + CX.T1 && cx_row(p, [35, 7]) === '35:22 7:49', 'a second submit with 22 iron and 49 brass mints nothing and takes nothing (returned ' + again + ')')
  ok(cx_told(p, 'Not enough of any single material to mint a token'), 'and says there is not enough of any single material')
})

T_run('codex submit: the lifetime cap of a resource', function () {
  var p = T_newPlayer('Mason')
  for (var s = 0; s <= 8; s++) cx_put(p, s, CX.BRASS, 64)       // 576 brass; the cap is 500 items, 1 token per 50
  var result = Number(codexSubmit(p))
  ok(result === 1 && cx_given(p) === '10 ' + CX.T1, '576 brass against a cap of 500: ten tokens (given: ' + cx_given(p) + ')')
  ok(cx_row(p, [0, 6, 7, 8]) === '0:0 6:0 7:12 8:64', 'exactly 500 taken: seven stacks, 52 of the eighth, the ninth untouched (' + cx_row(p, [0, 6, 7, 8]) + ')')
  ok(cx_saved(p, 'icraft_codex_sub_create_brass_ingot') === 500, 'the lifetime count is 500 (' + cx_saved(p, 'icraft_codex_sub_create_brass_ingot') + ')')
  A.clearTold(p)
  var again = Number(codexSubmit(p))
  ok(again === 0 && cx_row(p, [7, 8]) === '7:12 8:64' && cx_given(p) === '10 ' + CX.T1, 'at the cap the 76 left are not taken and nothing is minted (returned ' + again + ')')
  ok(cx_told(p, 'already at its submission cap'), 'and the player is told the material is at its cap')
})

T_run('codex submit: a machine block, capped at two', function () {
  var p = T_newPlayer('Tinker')
  cx_put(p, 4, CX.WHEEL, 3)
  codexSubmit(p)
  ok(cx_given(p) === '50 ' + CX.T1 && cx_n(p, 4) === 1, 'three crushing wheels: two are taken for 25 tokens each, one stays (given: ' + cx_given(p) + ', left: ' + cx_n(p, 4) + ')')
  ok(cx_saved(p, 'icraft_codex_sub_create_crushing_wheel') === 2, 'the lifetime count is 2')
})

T_run('codex submit: a lane converts its own materials only', function () {
  var p = T_newPlayer('Weaver')
  cx_put(p, 0, CX.IRON, 64); cx_put(p, 1, CX.IRON, 36); cx_put(p, 2, CX.RUNE, 3)
  codexSubmit(p, 'magic')
  ok(cx_given(p) === '15 ' + CX.T1 && cx_row(p, [0, 1, 2]) === '0:64 1:36 2:0', '`submit magic`: three runes for 5 tokens each, the iron untouched (' + cx_given(p) + '; ' + cx_row(p, [0, 1, 2]) + ')')
  ok(cx_told(p, 'Codex Submission') && cx_told(p, 'Magic'), 'the report names the lane')
  codexSubmit(p, 'engineering')
  ok(cx_given(p) === '15 ' + CX.T1 + ', 1 ' + CX.T1 && cx_row(p, [0, 1]) === '0:0 1:0', '`submit engineering`: the 100 iron for one token (' + cx_given(p) + ')')
})

T_run('codex submit: the bulk metals mint the tier the player is working towards', function () {
  var second = T_newPlayer('Second').t_stage('tier_2')
  cx_put(second, 0, CX.IRON, 64); cx_put(second, 1, CX.IRON, 36)
  codexSubmit(second)
  ok(cx_given(second) === '1 ' + CX.T2, 'with tier_2 held, iron mints a tier-2 token (given: ' + cx_given(second) + ')')
  ok(cx_saved(second, 'icraft_codex_sub_minecraft_iron_ingot_t2') === 100 && cx_saved(second, 'icraft_codex_sub_minecraft_iron_ingot_t1') === 0,
    'counted under the tier-2 key, not the tier-1 one')

  var fourth = T_newPlayer('Fourth').t_stage('tier_2').t_stage('tier_3').t_stage('tier_4')
  cx_put(fourth, 0, CX.IRON, 64); cx_put(fourth, 1, CX.IRON, 36); cx_put(fourth, 2, CX.DIAMOND, 50)
  codexSubmit(fourth)
  ok(cx_given(fourth) === '1 ' + CX.T3 && cx_row(fourth, [0, 1, 2]) === '0:64 1:36 2:0',
    'at tier 4 the iron is inert and a fixed-tier material still converts: 50 diamonds, one tier-3 token (' + cx_given(fourth) + '; ' + cx_row(fourth, [0, 1, 2]) + ')')
  A.clearTold(fourth)
  var again = Number(codexSubmit(fourth))
  ok(again === 0 && cx_told(fourth, 'No eligible Engineering materials'), 'with only iron left a tier-4 player is told there is nothing eligible (returned ' + again + ')')
})

T_run('codex balance: tokens in the main inventory, and the tier they buy', function () {
  var p = T_newPlayer('Banker')
  for (var s = 0; s <= 5; s++) cx_put(p, s, CX.T1, 64)       // 384
  cx_put(p, 6, CX.T1, 52)                                    // 436 in the main inventory
  cx_put(p, 40, CX.T1, 64)                                   // and 64 in the off hand: 500 if that counted
  var result = Number(codexBalance(p))
  ok(result === 1 && cx_told(p, '436 / 500') && !cx_has(p, 'tier_2'), 'balance counts 436 of 500: the off hand is not counted, no tier is bought')
  ok(cx_row(p, [0, 6, 40]) === '0:64 6:52 40:64', 'and nothing is taken (' + cx_row(p, [0, 6, 40]) + ')')
  cx_put(p, 7, CX.T1, 64)                                    // 500 in the main inventory
  A.clearTold(p); A.clearCommands(T_server)
  codexBalance(p)
  ok(cx_has(p, 'tier_2') && cx_has(p, 'tier_1'), 'with 500 held the next balance buys tier 2 (and marks tier 1)')
  ok(cx_row(p, [0, 5, 6, 7, 40]) === '0:0 5:0 6:0 7:0 40:64', 'the 500 are spent from the main inventory, the off hand keeps its 64 (' + cx_row(p, [0, 5, 6, 7, 40]) + ')')
  ok(cx_told(p, '500 / 500') && cx_told(p, 'TIER 2 UNLOCKED') && cx_told(p, '500 Tier 1 Codex tokens'), 'the player is told the threshold was met and what bought the tier')
  var commands = String(A.commands(T_server))
  ok(commands.indexOf('advancement grant Banker only icraft:stage_tier_2') >= 0 && commands.indexOf('playsound minecraft:ui.toast.challenge_complete player Banker') >= 0,
    'the advancement and the sound are sent: ' + commands)
})

T_run('codex advance: exactly the threshold is spent, once', function () {
  var p = T_newPlayer('Saver')
  for (var s = 0; s <= 8; s++) cx_put(p, s, CX.T1, 64)       // 576
  codexCheckAdvance(p)
  ok(cx_has(p, 'tier_2') && cx_row(p, [0, 6, 7, 8]) === '0:0 6:0 7:12 8:64', '576 held: 500 spent from the lowest slot up, 76 left (' + cx_row(p, [0, 6, 7, 8]) + ')')
  codexCheckAdvance(p)
  ok(cx_row(p, [7, 8]) === '7:12 8:64' && !cx_has(p, 'tier_3'), 'a second check takes nothing: the tier is held')

  // as it is: the threshold of a HIGHER tier's token buys its tier without the one below (the grant marks the lower ones)
  var jumper = T_newPlayer('Jumper')
  for (var k = 0; k <= 14; k++) cx_put(jumper, k, CX.T2, 64)   // 960
  cx_put(jumper, 15, CX.T2, 40)                               // 1000
  A.clearCommands(T_server)
  codexCheckAdvance(jumper)
  ok(cx_has(jumper, 'tier_3') && cx_has(jumper, 'tier_2') && cx_has(jumper, 'tier_1') && !cx_has(jumper, 'tier_4'),
    '1000 tier-2 tokens and no tier_2: tier 3 is bought and tier 2 marked with it')
  ok(cx_row(jumper, [0, 14, 15]) === '0:0 14:0 15:0', 'all 1000 are spent (' + cx_row(jumper, [0, 14, 15]) + ')')
  var commands = String(A.commands(T_server))
  ok(commands.indexOf('only icraft:stage_tier_2') >= 0 && commands.indexOf('only icraft:stage_tier_3') >= 0, 'both advancements are granted')
})

T_run('codex exchange: tokens for experience, at tier 4 only', function () {
  var novice = T_newPlayer('Novice')
  cx_put(novice, 0, CX.T3, 10)
  var refused = Number(codexExchange(novice, 3, 'all'))
  ok(refused === 0 && cx_n(novice, 0) === 10 && Number(T.num(novice, 'xpGiven')) === 0 && cx_told(novice, 'unlocks at'), 'without tier_4 nothing is taken and the player is told when it opens')

  var p = T_newPlayer('Elder').t_stage('tier_2').t_stage('tier_3').t_stage('tier_4')
  cx_put(p, 0, CX.T3, 64); cx_put(p, 20, CX.T3, 6); cx_put(p, 40, CX.T3, 10)
  cx_put(p, 1, CX.T2, 3); cx_put(p, 2, CX.T1, 64)
  var all = Number(codexExchange(p, 3, 'all'))
  ok(all === 560 && Number(T.num(p, 'xpGiven')) === 560, '`exchange 3 all`: 70 tier-3 tokens of the main inventory at 8 each = 560 experience (returned ' + all + ')')
  ok(cx_row(p, [0, 20, 40]) === '0:0 20:0 40:10', 'both stacks are taken, the 10 in the off hand are not (' + cx_row(p, [0, 20, 40]) + ')')
  A.clearTold(p)
  var some = Number(codexExchange(p, 2, 5))
  ok(some === 12 && cx_n(p, 1) === 0 && cx_told(p, 'You only had 3'), '`exchange 2 5` with 3 held: the 3 are taken for 12, and the player is told (returned ' + some + ')')
  var ten = Number(codexExchange(p, 1, 10))
  ok(ten === 20 && cx_n(p, 2) === 54, '`exchange 1 10`: 10 of 64 taken for 20, 54 stay (returned ' + ten + ', left ' + cx_n(p, 2) + ')')
  ok(Number(T.num(p, 'xpGiven')) === 592, 'the experience adds up to 592 (' + T.num(p, 'xpGiven') + ')')
  A.clearTold(p)
  var none = Number(codexExchange(p, 3, 'all'))
  ok(none === 0 && cx_n(p, 40) === 10 && cx_told(p, 'You have no '), 'with tier-3 tokens in the off hand only, there is nothing to exchange')
  ok(Number(codexExchange(p, 4, 1)) === 0 && cx_told(p, 'Invalid tier'), 'a tier that has no token is refused')
  ok(Number(codexExchange(p, 1, 0)) === 0 && cx_n(p, 2) === 54 && cx_told(p, 'Amount must be a positive number'), 'an amount of 0 takes nothing')
})

T_run('codex: the three commands report that they did their work', function () {
  var fired = icraft.live.report('feature').features.fired.join(',')
  ok(fired.indexOf('codex-submit') >= 0 && fired.indexOf('codex-balance') >= 0 && fired.indexOf('codex-exchange') >= 0, 'codex-submit, codex-balance and codex-exchange are FIRED (' + fired + ')')
})
