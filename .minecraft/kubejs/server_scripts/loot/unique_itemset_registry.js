// =============================================================================
// UNIQUE ITEMSET REGISTRY — Simply Swords + Too Many Bows (icraft follow-up)
// =============================================================================
// SINGLE SOURCE OF TRUTH for the "give Too Many Bows the Simply Swords treatment"
// build (operator, 2026-06-03): both unique itemsets are boss-EXCLUSIVE trophy
// drops, tiered across all 4 tiers, with a STEEP tier-scaled damage buff.
//
// Consumed by (all read these globals lazily, inside callbacks — so script load
// order does NOT matter):
//   - unique_tier_buff.js        (tier-scaled +dmg on melee SS sword / fired TMB bow)
//   - boss_unique_drops.js       (per-boss entity drops for TMB bows + the NEW SS T1)
//   - tmb_plain_bow_effects.js   (theme effects for the 6 plain ModBowItem bows)
//   - lootjs_overhaul.js edit + too_many_bows.json config (strip bows from chests)
//
// TIER SOURCE: each item's tier = the tier of the boss it drops from (operator:
// "tier them across all 4 tiers"). SS uniques T2-T4 keep their EXISTING boss homes
// (loot_overhaul.js §1 still drops those — addDrop:false here, tier recorded only
// for the buff); SS T1 is NEW (addDrop:true). All 35 TMB bows are NEW boss drops.
//
// BUFF LADDER (operator: "Steeper T1+10 / T2+20 / T3+30 / T4+40%").
//
// All item IDs jar-verified 2026-06-03 (simplyswords lang + too_many_bows item
// models). TMB classes with NO registered item (icicle_javelin / cursed_flame_bow
// / sonic_boom_bow / beacon_beam_bow) are EXCLUDED — they are not obtainable items.
// cursed_stone is a thrown special item (no pulling frames) → not a bow, excluded.
// =============================================================================

global.ICRAFT_TIER_DMG_MULT = { 1: 1.10, 2: 1.20, 3: 1.30, 4: 1.40 }

// chance a boss drops its assigned unique (mirrors loot_overhaul's SS ~0.12-0.20)
global.ICRAFT_UNIQUE_DROP_CHANCE = 0.15

// item id -> { tier:1-4, kind:'sword'|'bow', boss:<entity id|null>, addDrop:bool }
//   addDrop=true  → boss_unique_drops.js adds the entity loot modifier here
//   addDrop=false → drop already handled in loot_overhaul.js (SS T2-T4); tier is
//                   recorded only so the buff handler can scale it
global.ICRAFT_UNIQUE_ITEMS = {

  // ===========================================================================
  // SIMPLY SWORDS (melee) — buff applies to direct melee while held in mainhand
  // ===========================================================================

  // ---- T1 (NEW — forced down to T1 bosses for full 4-tier spread) ----
  'simplyswords:sword_on_a_stick': { tier: 1, kind: 'sword', boss: 'terramity:gob',                 addDrop: true },
  'simplyswords:magic_estoc':      { tier: 1, kind: 'sword', boss: 'terramity:enchanter_merlin',    addDrop: true },
  'simplyswords:hearthflame':      { tier: 1, kind: 'sword', boss: 'mowziesmobs:umvuthi',           addDrop: true },
  'simplyswords:watcher_claymore': { tier: 1, kind: 'sword', boss: 'mowziesmobs:ferrous_wroughtnaut',addDrop: true },
  'simplyswords:ribboncleaver':    { tier: 1, kind: 'sword', boss: 'mowziesmobs:sculptor',          addDrop: true },
  'simplyswords:twilight':         { tier: 1, kind: 'sword', boss: 'mowziesmobs:naga',              addDrop: true },

  // ---- T2 (EXISTING drops in loot_overhaul.js §1 — tier recorded for buff) ----
  'simplyswords:tempest':          { tier: 2, kind: 'sword', boss: 'twilightforest:naga',           addDrop: false },
  'simplyswords:soulrender':       { tier: 2, kind: 'sword', boss: 'twilightforest:lich',           addDrop: false },
  'simplyswords:emberblade':       { tier: 2, kind: 'sword', boss: 'twilightforest:hydra',          addDrop: false },
  'simplyswords:whisperwind':      { tier: 2, kind: 'sword', boss: 'twilightforest:ur_ghast',       addDrop: false },
  'simplyswords:enigma':           { tier: 2, kind: 'sword', boss: 'twilightforest:knight_phantom', addDrop: false },
  'simplyswords:frostfall':        { tier: 2, kind: 'sword', boss: 'twilightforest:snow_queen',     addDrop: false },
  'simplyswords:icewhisper':       { tier: 2, kind: 'sword', boss: 'twilightforest:alpha_yeti',     addDrop: false },
  'simplyswords:hiveheart':        { tier: 2, kind: 'sword', boss: 'blue_skies:summoner',           addDrop: false },
  'simplyswords:toxic_longsword':  { tier: 2, kind: 'sword', boss: 'blue_skies:alchemist',          addDrop: false },
  'simplyswords:stars_edge':       { tier: 2, kind: 'sword', boss: 'blue_skies:starlit_crusher',    addDrop: false },
  'simplyswords:waxweaver':        { tier: 2, kind: 'sword', boss: 'blue_skies:arachnarch',         addDrop: false },
  'simplyswords:thunderbrand':     { tier: 2, kind: 'sword', boss: 'aether:slider',                 addDrop: false },
  'simplyswords:caelestis':        { tier: 2, kind: 'sword', boss: 'aether:valkyrie_queen',         addDrop: false },
  'simplyswords:sunfire':          { tier: 2, kind: 'sword', boss: 'aether:sun_spirit',             addDrop: false },

  // ---- T3 (EXISTING drops / reserved — tier recorded for buff) ----
  'simplyswords:brimstone_claymore':{ tier: 3, kind: 'sword', boss: 'cataclysm:netherite_monstrosity', addDrop: false },
  'simplyswords:molten_edge':      { tier: 3, kind: 'sword', boss: 'cataclysm:ignis',               addDrop: false },
  'simplyswords:shadowsting':      { tier: 3, kind: 'sword', boss: 'cataclysm:the_harbinger',       addDrop: false },
  'simplyswords:livyatan':         { tier: 3, kind: 'sword', boss: 'cataclysm:the_leviathan',       addDrop: false },
  'simplyswords:twisted_blade':    { tier: 3, kind: 'sword', boss: 'cataclysm:maledictus',          addDrop: false },
  'simplyswords:bramblethorn':     { tier: 3, kind: 'sword', boss: 'undergarden:forgotten_guardian',addDrop: false },
  'simplyswords:soulstealer':      { tier: 3, kind: 'sword', boss: 'deeperdarker:stalker',          addDrop: false },
  'simplyswords:soulpyre':         { tier: 3, kind: 'sword', boss: null,                            addDrop: false },
  'simplyswords:soulkeeper':       { tier: 3, kind: 'sword', boss: null,                            addDrop: false },
  'simplyswords:slumbering_lichblade': { tier: 3, kind: 'sword', boss: null,                        addDrop: false },
  'simplyswords:storms_edge':      { tier: 3, kind: 'sword', boss: null,                            addDrop: false },
  'simplyswords:mjolnir':          { tier: 3, kind: 'sword', boss: null,                            addDrop: false },

  // ---- T4 (EXISTING drops / reserved — tier recorded for buff) ----
  'simplyswords:flamewind':        { tier: 4, kind: 'sword', boss: 'deep_aether:eots_controller',   addDrop: false },
  'simplyswords:emberlash':        { tier: 4, kind: 'sword', boss: null,                            addDrop: false },
  'simplyswords:waking_lichblade': { tier: 4, kind: 'sword', boss: 'minecraft:ender_dragon',        addDrop: false },
  'simplyswords:awakened_lichblade':{ tier: 4, kind: 'sword', boss: 'cataclysm:ancient_remnant',    addDrop: false },
  'simplyswords:magiblade':        { tier: 4, kind: 'sword', boss: 'botania:doppleganger',          addDrop: false },
  'simplyswords:arcanethyst':      { tier: 4, kind: 'sword', boss: 'cataclysm:ender_guardian',      addDrop: false },
  'simplyswords:stormbringer':     { tier: 4, kind: 'sword', boss: 'minecraft:warden',              addDrop: false },
  'simplyswords:watching_warglaive':{ tier: 4, kind: 'sword', boss: null,                           addDrop: false },
  'simplyswords:magiscythe':       { tier: 4, kind: 'sword', boss: null,                            addDrop: false },
  'simplyswords:magispear':        { tier: 4, kind: 'sword', boss: null,                            addDrop: false },
  'simplyswords:harbinger':        { tier: 4, kind: 'sword', boss: null,                            addDrop: false },
  'simplyswords:dreadtide':        { tier: 4, kind: 'sword', boss: null,                            addDrop: false },
  'simplyswords:wickpiercer':      { tier: 4, kind: 'sword', boss: null,                            addDrop: false },

  // ===========================================================================
  // TOO MANY BOWS (ranged) — buff applies to the fired arrow (tagged at spawn).
  // ALL boss-exclusive NEW drops (addDrop:true). 35 jar-verified bows.
  // ===========================================================================

  // ---- T1 ----
  'too_many_bows:hunter_bow':      { tier: 1, kind: 'bow', boss: 'terramity:super_sniffer',         addDrop: true },
  'too_many_bows:dark_bow':        { tier: 1, kind: 'bow', boss: 'terramity:gob',                   addDrop: true },
  'too_many_bows:torchbearer':     { tier: 1, kind: 'bow', boss: 'mowziesmobs:ferrous_wroughtnaut', addDrop: true },
  'too_many_bows:flame_bow':       { tier: 1, kind: 'bow', boss: 'mowziesmobs:umvuthi',             addDrop: true },
  'too_many_bows:cyroheart_bow':   { tier: 1, kind: 'bow', boss: 'mowziesmobs:frostmaw',            addDrop: true },
  'too_many_bows:emerald_sage_bow':{ tier: 1, kind: 'bow', boss: 'mowziesmobs:sculptor',            addDrop: true },
  'too_many_bows:arcforge':        { tier: 1, kind: 'bow', boss: 'terramity:enchanter_merlin',      addDrop: true },
  'too_many_bows:verdant_viper':   { tier: 1, kind: 'bow', boss: 'mowziesmobs:naga',                addDrop: true },

  // ---- T2 ----
  'too_many_bows:tidal_bow':       { tier: 2, kind: 'bow', boss: 'twilightforest:naga',             addDrop: true },
  'too_many_bows:frostbite':       { tier: 2, kind: 'bow', boss: 'twilightforest:alpha_yeti',       addDrop: true },
  'too_many_bows:ethereal_hunter': { tier: 2, kind: 'bow', boss: 'twilightforest:ur_ghast',         addDrop: true },
  'too_many_bows:sentinels_wrath': { tier: 2, kind: 'bow', boss: 'twilightforest:knight_phantom',   addDrop: true },
  'too_many_bows:auroras_grace':   { tier: 2, kind: 'bow', boss: 'twilightforest:snow_queen',       addDrop: true },
  'too_many_bows:verdant_vigor':   { tier: 2, kind: 'bow', boss: 'twilightforest:minoshroom',       addDrop: true },
  'too_many_bows:burnt_relic':     { tier: 2, kind: 'bow', boss: 'twilightforest:hydra',            addDrop: true },
  'too_many_bows:wind_bow':        { tier: 2, kind: 'bow', boss: 'aether:valkyrie_queen',           addDrop: true },
  'too_many_bows:aethers_call':    { tier: 2, kind: 'bow', boss: 'aether:sun_spirit',               addDrop: true },
  'too_many_bows:scatter_bow':     { tier: 2, kind: 'bow', boss: 'aether:slider',                   addDrop: true },
  'too_many_bows:vitality_weaver': { tier: 2, kind: 'bow', boss: 'blue_skies:summoner',             addDrop: true },
  'too_many_bows:webstring':       { tier: 2, kind: 'bow', boss: 'blue_skies:arachnarch',           addDrop: true },

  // ---- T3 ----
  'too_many_bows:arcane_bow':      { tier: 3, kind: 'bow', boss: 'irons_spellbooks:archevoker',     addDrop: true },
  'too_many_bows:necro_flame_bow': { tier: 3, kind: 'bow', boss: 'irons_spellbooks:dead_king',      addDrop: true },
  'too_many_bows:solar_bow':       { tier: 3, kind: 'bow', boss: 'irons_spellbooks:fire_boss',      addDrop: true },
  'too_many_bows:radiance':        { tier: 3, kind: 'bow', boss: 'aether:valkyrie_queen',           addDrop: true },  // was item-id 'irons_spellbooks:magehunter' -> silently pig (2026-06-06)
  'too_many_bows:ancient_sage_bow':{ tier: 3, kind: 'bow', boss: 'undergarden:forgotten_guardian',  addDrop: true },
  'too_many_bows:dusk_reaper':     { tier: 3, kind: 'bow', boss: 'deeperdarker:stalker',            addDrop: true },
  'too_many_bows:crimson_nexus':   { tier: 3, kind: 'bow', boss: 'cataclysm:the_harbinger',         addDrop: true },
  'too_many_bows:ironclad_bow':    { tier: 3, kind: 'bow', boss: 'cataclysm:netherite_monstrosity', addDrop: true },
  'too_many_bows:demons_grasp':    { tier: 3, kind: 'bow', boss: 'cardinal_sins:sinofpride',        addDrop: true },

  // ---- T4 ----
  'too_many_bows:dragons_breath':  { tier: 4, kind: 'bow', boss: 'minecraft:ender_dragon',          addDrop: true },
  'too_many_bows:arc_heavens':     { tier: 4, kind: 'bow', boss: 'deep_aether:eots_controller',     addDrop: true },
  'too_many_bows:astral_bound':    { tier: 4, kind: 'bow', boss: 'terramity:sorceress_circe',       addDrop: true },
  'too_many_bows:spectral_whisper':{ tier: 4, kind: 'bow', boss: 'minecraft:warden',                addDrop: true },
  'too_many_bows:shulker_blast':   { tier: 4, kind: 'bow', boss: 'cataclysm:ender_guardian',        addDrop: true },
  'too_many_bows:twin_shadows':    { tier: 4, kind: 'bow', boss: 'terramity:thunker',               addDrop: true },
}

// Derived helper sets (built once; consumers may also read the map directly).
global.ICRAFT_TMB_BOWS = Object.keys(global.ICRAFT_UNIQUE_ITEMS)
  .filter(id => global.ICRAFT_UNIQUE_ITEMS[id].kind === 'bow')

;(function () {
  let n = Object.keys(global.ICRAFT_UNIQUE_ITEMS).length
  let bows = global.ICRAFT_TMB_BOWS.length
  let drops = Object.keys(global.ICRAFT_UNIQUE_ITEMS).filter(id => global.ICRAFT_UNIQUE_ITEMS[id].addDrop).length
  console.log('[unique_itemset_registry] ' + n + ' uniques registered (' + bows
    + ' TMB bows + ' + (n - bows) + ' SS swords); ' + drops + ' new boss drops; buff ladder T1..T4 = 10/20/30/40%')
})()
