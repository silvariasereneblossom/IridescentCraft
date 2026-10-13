// Fixture for GUARD-SHAPE on icraft.handler(name, group, fn): the liveness id of a function put straight on
// a Java registry. name = this script's path; group = '<Class>.<method>' of the call it is passed to.
var Attr = Java.loadClass('com.iridescentcraft.reforging.event.ItemAttributeRegistry')
var Forge_fx = Java.loadClass('com.iridescentcraft.reforging.event.ForgeEventRegistry')
var fn = function (event) {}

// Right: the class as it was loaded (whatever the variable is called), the method as written
Attr.register('icraft.fixture.a', icraft.handler('fixture_handler_shape', 'ItemAttributeRegistry.register', fn))
Forge_fx.registerKnockBack('icraft.fixture.b', icraft.handler('fixture_handler_shape', 'ForgeEventRegistry.registerKnockBack', fn))
Forge_fx.registerDrops('icraft.fixture.c', icraft.handler('fixture_handler_shape#2', 'ForgeEventRegistry.registerDrops', fn))

// Wrong
Attr.register('icraft.fixture.d', icraft.handler('some_other_script', 'ItemAttributeRegistry.register', fn))                   // EXPECT GUARD-SHAPE
Forge_fx.registerEffectApplicable('icraft.fixture.e', icraft.handler('fixture_handler_shape', 'ForgeEventRegistry.registerDrops', fn))   // EXPECT GUARD-SHAPE
Attr.register('icraft.fixture.f', icraft.handler('fixture_handler_shape', 'Forge_fx.register', fn))                             // EXPECT GUARD-SHAPE
Attr.register('icraft.fixture.g', icraft.handler('fixture_handler_shape#3', 'ItemAttributeRegistry.register'))                  // EXPECT GUARD-SHAPE
var loose = icraft.handler('fixture_handler_shape#4', 'ItemAttributeRegistry.register', fn)                                     // EXPECT GUARD-SHAPE
Attr.register('icraft.fixture.h', icraft.handler('fixture_handler_shape#5', GROUP, fn))                                         // EXPECT GUARD-SHAPE
var GROUP = 'ItemAttributeRegistry.register'
// the same name and group a second time in one file: the two would share one liveness id
Attr.register('icraft.fixture.i', icraft.handler('fixture_handler_shape', 'ItemAttributeRegistry.register', fn))                // EXPECT GUARD-SHAPE
