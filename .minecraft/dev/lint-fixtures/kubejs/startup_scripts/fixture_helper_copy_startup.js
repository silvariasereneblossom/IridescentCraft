// Fixture: a STARTUP script cannot reach global.icraft.core when it loads (the core is a server script),
// so its own warnOnce is not a copy. HELPER-COPY is a rule for server scripts.
var warned = {}
var warnOnce = function (key, msg) { if (warned[key]) return; warned[key] = true; console.warn(msg) }
// The rules that hold for every script type still do:
var DR_fix = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
DR_fix.registerLate('icraft.fixture.startup', function (event) {})               // EXPECT DIRECT-HURT-REG
var set = new Set(['a'])                                                         // EXPECT ID-SET
