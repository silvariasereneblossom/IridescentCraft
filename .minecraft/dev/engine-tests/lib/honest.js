// =============================================================================
// Script-side mocks, held to the engine. Loaded before a prelude.
//
// The Java mocks (harness/mk/*.java) are checked class by class by MemberCheck.
// A prelude also builds mocks in JavaScript: the event groups (`PlayerEvents.tick`),
// the objects it hands to handlers (`{ entity, source, damage }`) and a few
// bindings (`Item.of`). These helpers ask the Host for the member tables recorded
// from the real engine (truth/engine-members.json), so the same rule applies:
// a name the engine does not have fails the suite.
// =============================================================================
var T_DISHONEST = []
var T_honestSeen = {}
function T_dishonest(what) {
  if (T_honestSeen[what]) return
  T_honestSeen[what] = true
  T_DISHONEST.push(what)
  __host.fail()
  __host.print('!! DISHONEST MOCK: ' + what)
}
// every key of a script-side mock object must be a member a script sees on the real class
function T_honestKeys(what, obj, realClass, isStatic, plumbing) {
  for (var k in obj) {
    if (plumbing && plumbing.indexOf(k) >= 0) continue
    var memo = what + '|' + k
    if (T_honestSeen[memo]) continue
    T_honestSeen[memo] = true
    var answer = String(__host.truthHas(realClass, k, isStatic === true))
    if (answer !== 'yes') T_dishonest(what + '.' + k + ': the real ' + realClass + ' has no such ' + (isStatic ? 'static' : 'member') + ' (' + answer + ')')
  }
}
// an event a prelude lets scripts subscribe to must exist on the engine; returns its Java class
function T_honestEvent(realName) {
  var cls = __host.truthEvent(realName)
  if (cls === null || cls === undefined) { T_dishonest('event ' + realName + ': KubeJS has no such event on this engine'); return null }
  return String(cls)
}
// the object a prelude passes to the handlers of realName: only keys the real event class has
function T_honestEventObject(realName, ev, plumbing) {
  var cls = T_honestEvent(realName)
  if (cls !== null) T_honestKeys('the ' + realName + ' event object', ev, cls, false, plumbing)
}
