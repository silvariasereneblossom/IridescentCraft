// =============================================================================
// IRIDESCENT CODEX — PROGRESSION TOKEN ITEMS (Phase 1)
// File: kubejs/startup_scripts/codex_progression_tokens.js
//
// The accumulation currency for the new Codex progression engine
// (design/progression-framework.md). One combined token pool, but three
// PER-TRANSITION token items so the player can see how much of each
// transition they have banked:
//
//   icraft:progression_token_t1  — accumulate 500  → grants tier_2
//   icraft:progression_token_t2  — accumulate 1000 → grants tier_3
//   icraft:progression_token_t3  — accumulate 2000 → grants tier_4
//
// (T4 is terminal — the Ender Dragon is the finale, no token gate — so there
//  is no progression_token_t4 here. The legacy kubejs:reality_progression_token_t4
//  remains a CRAFTING ingredient elsewhere and is intentionally untouched.)
//
// RELOAD-SAFETY: item registration MUST live in startup_scripts (see the #60
// iridescent_durability_clamp fix — registering items or raw Forge bus
// listeners in server_scripts crashes on /reload). The conversion logic,
// commands, and tier-grant live in server_scripts/gates/codex_progression_engine.js
// (ServerEvents only), which is reload-safe.
//
// Textures follow the existing token convention in custom_items.js: a
// generated model over a vanilla placeholder texture, tinted per tier. No new
// PNG assets are shipped (there is no bespoke token texture in the pack yet).
// =============================================================================

StartupEvents.registry('item', event => {

    // T1 → T2 accumulation token (Engineering source = Create-tier).
    event.create('icraft:progression_token_t1')
        .displayName('Codex Token I')
        .tooltip('§7An Iridescent Codex progression token.')
        .tooltip('§7Bank §f500§7 to advance from Tier 1 → Tier 2.')
        .tooltip('§8Submit materials at the Codex: §8/icraft codex submit')
        .maxStackSize(64)
        .rarity('common')
        .textureJson({ layer0: 'minecraft:item/ender_pearl' })
        .color(0, 0xCD7F32)  // bronze — Tier 1

    // T2 → T3 accumulation token (Engineering source = Thermal-tier).
    event.create('icraft:progression_token_t2')
        .displayName('Codex Token II')
        .tooltip('§7An Iridescent Codex progression token.')
        .tooltip('§7Bank §f1000§7 to advance from Tier 2 → Tier 3.')
        .tooltip('§8Submit materials at the Codex: §8/icraft codex submit')
        .maxStackSize(64)
        .rarity('uncommon')
        .textureJson({ layer0: 'minecraft:item/ender_pearl' })
        .color(0, 0xC0C0C0)  // silver — Tier 2

    // T3 → T4 accumulation token (Engineering source = Mekanism-tier).
    event.create('icraft:progression_token_t3')
        .displayName('Codex Token III')
        .tooltip('§7An Iridescent Codex progression token.')
        .tooltip('§7Bank §f2000§7 to advance from Tier 3 → Tier 4.')
        .tooltip('§8Submit materials at the Codex: §8/icraft codex submit')
        .maxStackSize(64)
        .rarity('rare')
        .textureJson({ layer0: 'minecraft:item/ender_pearl' })
        .color(0, 0xFFD700)  // gold — Tier 3
})

console.log('[IridescentCraft] Codex progression tokens registered (t1/t2/t3)')
