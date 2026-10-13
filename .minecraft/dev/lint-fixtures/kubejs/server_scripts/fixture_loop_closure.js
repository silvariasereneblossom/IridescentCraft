// Fixture for LOOP-CLOSURE: a function made in a loop body that reads the loop's head variable.
var handlers = []
var ids = ['a', 'b', 'c']
var table = { a: 1, b: 2 }

for (let i = 0; i < ids.length; i++) {
  handlers.push(function () { return ids[i] })                       // EXPECT LOOP-CLOSURE
}
for (var j = 0; j < ids.length; j++) {
  global.registerServerTick('tick_' + j, 20, 0, () => use(j))        // EXPECT LOOP-CLOSURE
}
for (const key in table) {
  handlers.push(function () { return table[key] })                   // EXPECT LOOP-CLOSURE
}
for (let id of ids) {
  ItemEvents.rightClicked(id, icraft.guard('fixture_loop_closure', 'ItemEvents.rightClicked', function (event) {   // EXPECT LOOP-CLOSURE
    event.player.tell(id)
  }))
}
for (const id of ids) {
  var later = function () { return id }                              // EXPECT LOOP-CLOSURE
  handlers.push(later)
}
for (let a = 0, n = ids.length; a < n; a++) {
  handlers.push(function () { return n })                            // EXPECT LOOP-CLOSURE
}

// Not flagged: the value is copied into the body first
for (let i = 0; i < ids.length; i++) {
  let own = ids[i]
  handlers.push(function () { return own })
}
// Not flagged: the function runs at once, in its own iteration
for (let i = 0; i < ids.length; i++) {
  ids.forEach(function (x) { use(x + i) })
  var doubled = ids.map(x => x + i)
  ;(function () { use(i) })()
}
// Not flagged: the name is the function's own
for (let i = 0; i < ids.length; i++) {
  handlers.push(function (i) { return i })
  handlers.push(function () { var i = 0; return i })
}
// Not flagged: the head variable is only read outside any function
for (const id of ids) { use(id) }
// Not flagged: a property called like the head variable is not a read of it
for (let i = 0; i < ids.length; i++) {
  handlers.push(function (o) { return o.i })
}
function use() {}
