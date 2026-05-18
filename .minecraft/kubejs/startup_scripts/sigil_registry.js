// =============================================================================
// TIER-GATED SIGILS OF SOCKETING — Priority 1
// Place in: kubejs/startup_scripts/sigil_registry.js
//
// Three custom sigils (T1/T2/T3) that wrap Apotheosis's socket-add mechanic
// with a per-tier socket cap. Vanilla apotheosis:sigil_of_socketing stays
// as the T4 sigil (cap 5) but its recipe is overridden to use echo_shard
// instead of dragon_breath (see kubejs/data/icraft/recipes/sigil_of_socketing.json
// for the override).
//
// Cap table:
//   T1 sigil  -> applies +1 socket if current < 2
//   T2 sigil  -> applies +1 socket if current < 3
//   T3 sigil  -> applies +1 socket if current < 4
//   Vanilla   -> applies +1 socket if current < 5 (Apotheosis-inherent max)
//
// Use mechanic + cap enforcement is in kubejs/server_scripts/sigil_socket_handler.js.
// AStages tier restrictions for the sigils are in
// kubejs/server_scripts/gates/astages_restrictions.js (T2 sigil -> tier_2,
// T3 sigil -> tier_3, vanilla -> tier_4).
//
// Textures: reuse the vanilla Apotheosis sigil_of_socketing texture
// (apotheosis:items/sigils/socketing) with per-tier color overlay.
// =============================================================================

StartupEvents.registry('item', event => {

    event.create('icraft:sigil_of_socketing_t1')
        .displayName('Sigil of Socketing I')
        .tooltip('§7Adds 1 gem socket to a piece of gear.')
        .tooltip('§7Caps at §f2 sockets§7 per item.')
        .tooltip('§8Hold in main hand, target gear in off hand, right-click.')
        .maxStackSize(16)
        .rarity('common')
        .textureJson({ layer0: 'apotheosis:items/sigils/socketing' })
        .color(0, 0xA0A0A0)  // stone-grey

    event.create('icraft:sigil_of_socketing_t2')
        .displayName('Sigil of Socketing II')
        .tooltip('§7Adds 1 gem socket to a piece of gear.')
        .tooltip('§7Caps at §f3 sockets§7 per item.')
        .tooltip('§8Hold in main hand, target gear in off hand, right-click.')
        .maxStackSize(16)
        .rarity('uncommon')
        .textureJson({ layer0: 'apotheosis:items/sigils/socketing' })
        .color(0, 0x6688AA)  // iron-tinted blue-grey

    event.create('icraft:sigil_of_socketing_t3')
        .displayName('Sigil of Socketing III')
        .tooltip('§7Adds 1 gem socket to a piece of gear.')
        .tooltip('§7Caps at §f4 sockets§7 per item.')
        .tooltip('§8Hold in main hand, target gear in off hand, right-click.')
        .maxStackSize(16)
        .rarity('rare')
        .textureJson({ layer0: 'apotheosis:items/sigils/socketing' })
        .color(0, 0x50C878)  // emerald green

})
