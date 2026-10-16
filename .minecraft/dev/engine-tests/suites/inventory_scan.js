// =============================================================================
// INVENTORY SCAN -- economy/relic_sink.js on an inventory that behaves like the real
// one (no `size`, ids that are Java strings; both verified on the engine, see
// truth/engine-facts.txt). Until 2026-10-12 the scan loop was bounded by `inv.size`
// (undefined: zero iterations), the deny list was a Set asked with a raw Java string
// (never matched) and the cap key was built with replace() on a raw Java string
// (unchanged): the sweep had never converted anything, and nothing said so.
// Ruling (planning, 2026-10-12): the sweep covers the MAIN inventory only, slots 0-35.
// =============================================================================
var IS_GOGGLES = 'artifacts:night_vision_goggles'     // namespace `artifacts`: 20 essence
var IS_HEART = 'iridescent_relics:frostmaw_heart'     // override: 250 essence (150 until 2026-10-16: Frostmaw moved to tier 2)
var IS_DENIED = 'artifacts:mimic_spawn_egg'           // on RELIC_SINK_DENY_LIST
var IS_ESSENCE = 'iridescent_relics:relic_essence'    // the currency itself
var IS_SHIELD = 'moreartifacts:ankh_shield'           // override: 60 essence; held in the off hand below

var is_p = T_newPlayer('Scanner')
T.slot(is_p, 3, new MStack(IS_GOGGLES, 2))
T.slot(is_p, 7, new MStack(IS_DENIED, 1))
T.slot(is_p, 9, new MStack(IS_HEART, 1))
T.slot(is_p, 12, new MStack(IS_ESSENCE, 5))
T.slot(is_p, 36, new MStack(IS_GOGGLES, 1))      // an armor slot
T.slot(is_p, 40, new MStack(IS_SHIELD, 1))       // the off hand
var is_count = function (slot) { return Number(A.count(is_p.inventory.getStackInSlot(slot))) }

T_run('relic sink: loads', function () {
  ok(T_LOAD_ERRORS.length === 0, 'both scripts load: ' + T_LOAD_ERRORS.join(' / '))
})

T_run('relic sink: the scan visits the main inventory', function () {
  var found = relicScan(is_p)
  ok(found[IS_GOGGLES] !== undefined && Number(found[IS_GOGGLES].available) === 2,
    'a sinkable item in slot 3 is found, and the one worn in an armor slot is not counted (available: ' + (found[IS_GOGGLES] ? found[IS_GOGGLES].available : 'not found') + ')')
  ok(found[IS_HEART] !== undefined && Number(found[IS_HEART].value) === 250, 'a boss relic is found at its override value')
  ok(found[IS_SHIELD] === undefined, 'the item in the off hand is not swept')
  ok(found[IS_ESSENCE] === undefined, 'the currency itself is never sinkable')
  ok(found[IS_DENIED] === undefined, 'a deny-listed item is not found')
})

T_run('relic sink: the deny list denies an id read from a stack', function () {
  var raw = is_p.inventory.getStackInSlot(7).id
  ok(typeof raw === 'object', 'the id read from the stack is a Java string, as in game (typeof ' + (typeof raw) + ')')
  ok(Number(relicEssenceValue(raw)) === 0, 'relicEssenceValue(stack.id) is 0 for a deny-listed item (got ' + relicEssenceValue(raw) + ')')
})

T_run('relic sink: submit converts, and the lifetime cap is read back', function () {
  A.clearTold(is_p)
  relicSubmit(is_p, false)
  ok(is_count(3) === 2 && is_count(9) === 1, 'the preview consumes nothing')
  var essence = Number(relicSubmit(is_p, true))
  ok(essence === 290, 'confirm returns 2 x 20 + 250 = 290 essence (got ' + essence + ')')
  var given = T.get(is_p, 'given')
  ok(Number(T.size(given)) === 1 && Number(A.count(given.get(0))) === 290 && String(given.get(0).id) === IS_ESSENCE, 'and gives it as one stack of the currency')
  ok(is_p.inventory.getStackInSlot(3).isEmpty() && is_p.inventory.getStackInSlot(9).isEmpty(), 'the converted stacks are gone')
  ok(is_count(7) === 1 && is_count(36) === 1 && is_count(40) === 1 && is_count(12) === 5, 'the denied item, the armor slot, the off hand and the held currency are untouched')
  T.slot(is_p, 4, new MStack(IS_GOGGLES, 1))
  var again = relicScan(is_p)
  ok(again[IS_GOGGLES] !== undefined && Number(again[IS_GOGGLES].already) === 2,
    'the next scan reads back the 2 already converted: the key the confirm wrote is the key the scan reads (already: ' + (again[IS_GOGGLES] ? again[IS_GOGGLES].already : 'not found') + ')')
})
