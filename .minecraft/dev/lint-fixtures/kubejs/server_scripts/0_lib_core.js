// Fixture: the file that is the home of the helpers may build what the rules send everyone else to it for.
// (Its name is the exemption: server_scripts/0_lib_core.js.)
var made = new Set(['a'])
var warnOnce = function (key, message) {}
var entityId = function (entity) { return String(entity.getType()) }
var TRANSLATION_KEY = /^entity\.([^.]+)\.(.+)$/
var Registry = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
Registry.register('icraft.core', function (event) {})
function block(level, pos) { return level.getBlock(pos) }
function idOf(entity) { return entity.type }
