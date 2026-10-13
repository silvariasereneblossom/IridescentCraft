// Fixture for FILE-PROPERTY. KubeJS reads every line that starts with two slashes and holds two words
// as a file property, and acts on five keys. Markers: EXPECT+N names the rule expected N lines below.
/* EXPECT+1 FILE-PROPERTY */
// priority: 5
/* EXPECT+1 FILE-PROPERTY */
// priority high
/* EXPECT+1 FILE-PROPERTY */
// ignored true
/* EXPECT+1 FILE-PROPERTY */
// ignore = true
/* EXPECT+1 FILE-PROPERTY */
// packmode hard
/* EXPECT+1 FILE-PROPERTY */
// requires create
/* EXPECT+1 FILE-PROPERTY */
    //requires:create
/* EXPECT+1 FILE-PROPERTY */
// priority -1000

// The engine works on LINES: a line inside a template string or a block comment counts too.
/* EXPECT+2 FILE-PROPERTY */
var text = `
// ignored true
`
/* EXPECT+3 FILE-PROPERTY */
/*
   a block comment
// packmode expert
*/

// Not flagged: more than two words, a key KubeJS does not act on, a value that switches nothing,
// another spelling of the key, a comment after code.
// requires the create mod
// LOAD ORDER
// ignore errors
// ignored false
// Priority: 5
var x = 1 // priority 5
