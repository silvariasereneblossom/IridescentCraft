// =============================================================================
// HANDLER ORDER PROBE -- four handlers of ONE event, registered while this file
// loads in the order A B C D: A and C for every command, B and D for the
// command `time`. The fact `handler order: ...` of 0_script_file_facts.js runs
// `time query gametime` and reads the order they ran in.
// File: .minecraft/dev/engine-tests/real-engine/0_handler_order_probe.js  (dev tool, never in a distro)
// =============================================================================
var HANDLER_ORDER_SEEN = []
ServerEvents.command(function (event) { HANDLER_ORDER_SEEN.push('A:untargeted') })
ServerEvents.command('time', function (event) { HANDLER_ORDER_SEEN.push('B:time') })
ServerEvents.command(function (event) { HANDLER_ORDER_SEEN.push('C:untargeted') })
ServerEvents.command('time', function (event) { HANDLER_ORDER_SEEN.push('D:time') })
