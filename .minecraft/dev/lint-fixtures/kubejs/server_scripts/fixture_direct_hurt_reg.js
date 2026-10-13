// Fixture for DIRECT-HURT-REG: a handler put straight on the Java damage registry.
var DR_fix = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
var late
try { late = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry') } catch (e) { console.error('[fixture] ' + e) }
DR_fix.register('icraft.fixture', function (event) {})                           // EXPECT DIRECT-HURT-REG
late.registerLate('icraft.fixture.late', function (event) {})                    // EXPECT DIRECT-HURT-REG
// Not flagged: the shared dispatcher, taking a handler OFF the registry, and another registry
global.icraft.core.onHurt('fixture', function (event, ctx) {}, 'attackerPlayer')
global.icraft.core.onHurtLate('fixture.late', function (event, ctx) {}, 'any')
DR_fix.unregister('icraft.fixture')
var Other = Java.loadClass('com.iridescentcraft.reforging.event.ForgeEventRegistry')
Other.registerDrops('icraft.fixture.drops', function (event) {})
