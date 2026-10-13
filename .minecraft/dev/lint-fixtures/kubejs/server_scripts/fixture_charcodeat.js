// Fixture for CHARCODEAT.
var s = 'abc'
var sum = 0
for (var i = 0; i < s.length; i++) {
  sum = (sum * 31 + s.charCodeAt(i)) % 65521        // EXPECT CHARCODEAT
}
var first = String(s).charCodeAt(0)                  // EXPECT CHARCODEAT
// Not flagged: the method that returns a number, and the word in a string or a comment
var good = s.codePointAt(0)
var word = 'charCodeAt'
// charCodeAt(0) in a comment
