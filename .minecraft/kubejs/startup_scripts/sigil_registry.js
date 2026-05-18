// =============================================================================
// TIER-GATED SIGILS OF SOCKETING — Priority 1
// Place in: kubejs/startup_scripts/sigil_registry.js
//
// Three custom sigils (T1/T2/T3) that wrap Apotheosis's socket-add mechanic
// with a per-tier socket cap. Vanilla apotheosis:sigil_of_socketing stays
// as the T4 sigil (cap 5; canonical apoth ships with cap 3 — we override
// the add_sockets recipe to bump it).
//
// Use mechanic: SMITHING TABLE. Each tier sigil has a matching
// `apotheosis:add_sockets` recipe that consumes the sigil + target gear
// and emits the gear with +1 socket, enforcing the per-tier cap. Recipe
// files:
//   T1 -> kubejs/data/icraft/recipes/add_sockets_t1.json  (cap 2)
//   T2 -> kubejs/data/icraft/recipes/add_sockets_t2.json  (cap 3)
//   T3 -> kubejs/data/icraft/recipes/add_sockets_t3.json  (cap 4)
//   T4 -> datapack_sources/icraft_loot_overrides/data/apotheosis/recipes/
//         add_sockets.json (overrides canonical, cap 5)
//
// AStages tier restrictions for the sigils are in
// kubejs/server_scripts/gates/astages_restrictions.js (T2 sigil -> tier_2,
// T3 sigil -> tier_3, vanilla -> tier_4).
//
// Textures: reuse the vanilla Apotheosis sigil_of_socketing texture
// (apotheosis:items/sigils/socketing) with per-tier color overlay.
//
// History: prior implementation used a right-click-with-offhand-gear
// handler (sigil_socket_handler.js, deleted 2026-05-18 evening) which
// did not match canonical Apoth UX. Smithing-table recipe is the
// canonical mechanism per AddSocketsRecipe in Apotheosis-1.20.1-7.4.8.jar.
// =============================================================================

StartupEvents.registry('item', event => {

    event.create('icraft:sigil_of_socketing_t1')
        .displayName('Sigil of Socketing I')
        .tooltip('§7Adds 1 gem socket to a piece of gear.')
        .tooltip('§7Caps at §f2 sockets§7 per item.')
        .tooltip('§8Use at smithing table with target gear.')
        .maxStackSize(16)
        .rarity('common')
        .textureJson({ layer0: 'apotheosis:items/sigils/socketing' })
        .color(0, 0xA0A0A0)  // stone-grey

    event.create('icraft:sigil_of_socketing_t2')
        .displayName('Sigil of Socketing II')
        .tooltip('§7Adds 1 gem socket to a piece of gear.')
        .tooltip('§7Caps at §f3 sockets§7 per item.')
        .tooltip('§8Use at smithing table with target gear.')
        .maxStackSize(16)
        .rarity('uncommon')
        .textureJson({ layer0: 'apotheosis:items/sigils/socketing' })
        .color(0, 0x6688AA)  // iron-tinted blue-grey

    event.create('icraft:sigil_of_socketing_t3')
        .displayName('Sigil of Socketing III')
        .tooltip('§7Adds 1 gem socket to a piece of gear.')
        .tooltip('§7Caps at §f4 sockets§7 per item.')
        .tooltip('§8Use at smithing table with target gear.')
        .maxStackSize(16)
        .rarity('rare')
        .textureJson({ layer0: 'apotheosis:items/sigils/socketing' })
        .color(0, 0x50C878)  // emerald green

})
