// =============================================================================
// IRIDESCENT CODEX — PROGRESSION ENGINE (Phase 1: Engineering token economy)
// File: kubejs/server_scripts/gates/codex_progression_engine.js
//
// Implements the token-economy foundation from
// IridescentCraft-internal/design/progression-framework.md:
//
//   • §1 thresholds — ONE combined pool, per-transition tokens:
//       progression_token_t1 ×500  → tier_2
//       progression_token_t2 ×1000 → tier_3
//       progression_token_t3 ×2000 → tier_4
//     (T4 is terminal: the Ender Dragon is the finale, no token gate.)
//
//   • §2 Engineering tables — material → token conversion, data-driven below
//       (Create @ T1 / Thermal @ T2 / Mekanism @ T3). The tables ARE the
//       complete conversion set — no universal default, no unlisted long-tail.
//       Each resource has a per-resource lifetime CAP (tracked in
//       player.persistentData) so a resource can only ever yield its capped
//       token total.
//
//   • Submission mechanic — `/icraft codex submit` scans the player's
//     inventory, converts eligible materials to the right tier's tokens
//     (respecting caps), consumes only whole conversion units (lossless), and
//     reports the result. (Heracles UI is a later phase; a command is the
//     Phase-1 test harness.)
//
//   • Tier-advance — banking the threshold of a tier's token consumes it and
//     grants the next AStages stage, mirroring milestone_detection.js's
//     grantTier (same cascade + Patchouli advancement + broadcast). Lives
//     ALONGSIDE milestone_detection.js — both may grant stages; that's fine
//     for now (Phase-1 brief).
//
//   • `/icraft codex balance` — shows held tokens vs threshold per tier.
//
// RELOAD-SAFETY: this file registers ONLY ServerEvents (commandRegistry) — no
// item creation, no raw MinecraftForge.EVENT_BUS.addListener. Item registration
// lives in startup_scripts/codex_progression_tokens.js. (See the #60
// iridescent_durability_clamp lesson: server_scripts + Forge bus = reload crash.)
// =============================================================================

// ---- Per-transition token items + thresholds ------------------------------
// tier N token → accumulate THRESHOLD → grants the stage that opens tier N+1.
const CODEX_TOKENS = {
  1: { item: 'icraft:progression_token_t1', threshold: 500,  grantsStage: 'tier_2' },
  2: { item: 'icraft:progression_token_t2', threshold: 1000, grantsStage: 'tier_3' },
  3: { item: 'icraft:progression_token_t3', threshold: 2000, grantsStage: 'tier_4' },
}

// ---- #69 — T4 token→XP exchange RATE (THE single tunable constant) ----------
// XP POINTS granted per token, per tier. The exchange (/icraft codex exchange)
// is gated behind the `tier_4` AStages stage, so this is an ENDGAME faucet:
// surplus + T4-minted tokens convert to vanilla XP, which JLFork Aptitudes spend
// to level (also enchanting + anvil repairs). See design-evolution 2026-06-03.
//
// Tier-scaled (t1 < t2 < t3) so a higher-tier token — minted by harder content —
// is worth proportionally more XP, preserving token-tier meaning. Ratio 1:2:4.
//
// Modeled against the ACTUAL Aptitude level-up cost curve (AptitudeLevelUpSP:
// leveling an aptitude L→L+1 deducts getExperienceForLevel(L+4) XP points):
//   one mid level-up (apt 15→16) = 493 XP · one aptitude 0→10 = 1,315 XP ·
//   0→20 = 6,182 · 0→30 = 18,768 · 0→32 (max) = 22,710 · all 8 maxed = 181,680.
// ⚠ Operator-ratified rate (#69). Change ONLY these three numbers to retune.
const CODEX_XP_PER_TOKEN = { 1: 2, 2: 4, 3: 8 }   // #69 operator-ratified 2026-06-03 — "tight" rate (a nudge; 1 stack of t3 ≈ one mid Aptitude level-up)

// ---- §2 Engineering + Route-D Magic conversion tables (the COMPLETE set) ----
// Two entry shapes:
//
//   FIXED-tier  { tier, value, per, cap }
//     tier  — which tier's token this material yields (1/2/3)
//     value — tokens granted per `per` items submitted
//     per   — items for `value` tokens (e.g. 1 token / 100 → value:1, per:100)
//     cap   — per-resource LIFETIME cap, in ITEM units (iron-style fixed entries)
//
//   CONTEXTUAL  { contextual:true, value, per, capPerTier:{1,2,3} }
//     Mints tokens for the player's CURRENT transition tier (the lowest tier
//     whose next stage isn't granted yet — see codexCurrentTier). Uses THAT
//     tier's cap from capPerTier, tracked per-tier in persistentData (one cap
//     key per item PER tier). Lets the §2 per-tier bulk-metal caps (iron
//     7500/15000/30000; copper·gold·redstone 2500/15000/30000) all apply, so
//     pure-engineering can close T2 + T3, not just T1. value/per are shared
//     across tiers (the §2 rate is 1/100 at every tier).
//
// Item IDs verified against TesterLogs/Item Audit/all_items.tsv +
// the mod jars' en_us.json registries (2026-06-01).
// Notes on a few design-table → real-ID resolutions are inline.
const CODEX_CONVERSIONS = {

  // ===== T1 — CREATE — subtotal ≈ 590 (118% of 500) =====
  // Bulk metals — CONTEXTUAL: mint the player's current transition tier's token,
  // capped per-tier (§2 T1/T2/T3 bulk-metal caps). 1 token / 100 at every tier.
  'minecraft:iron_ingot':     { contextual: true, value: 1, per: 100, capPerTier: { 1: 7500, 2: 15000, 3: 30000 } }, // T1→75 T2→150 T3→300
  'minecraft:copper_ingot':   { contextual: true, value: 1, per: 100, capPerTier: { 1: 2500, 2: 15000, 3: 30000 } }, // T1→25 T2→150 T3→300
  'minecraft:gold_ingot':     { contextual: true, value: 1, per: 100, capPerTier: { 1: 2500, 2: 15000, 3: 30000 } }, // T1→25 T2→150 T3→300
  'minecraft:redstone':       { contextual: true, value: 1, per: 100, capPerTier: { 1: 2500, 2: 15000, 3: 30000 } }, // T1→25 T2→150 T3→300
  // Intermediate alloys (1 token / 50, cap 500 → 10 each).
  'create:brass_ingot':       { tier: 1, value: 1, per: 50,  cap: 500 },  // → 10
  'create:andesite_alloy':    { tier: 1, value: 1, per: 50,  cap: 500 },  // → 10
  'thermal:steel_ingot':      { tier: 1, value: 1, per: 50,  cap: 500 },  // → 10  (Steel @ T1 per table)
  // High-value Create machine blocks (small caps, big values).
  'create:crushing_wheel':    { tier: 1, value: 25, per: 1, cap: 2 },     // → 50
  'create:steam_engine':      { tier: 1, value: 25, per: 1, cap: 2 },     // → 50
  'create:mechanical_press':  { tier: 1, value: 20, per: 1, cap: 2 },     // → 40
  'create:mechanical_mixer':  { tier: 1, value: 20, per: 1, cap: 2 },     // → 40  (design "Mixer")
  'create:mechanical_saw':    { tier: 1, value: 15, per: 1, cap: 2 },     // → 30
  'create:mechanical_drill':  { tier: 1, value: 15, per: 1, cap: 2 },     // → 30  (design "Drill")
  'create:deployer':          { tier: 1, value: 15, per: 1, cap: 2 },     // → 30
  'create:millstone':         { tier: 1, value: 15, per: 1, cap: 2 },     // → 30
  'create:windmill_bearing':  { tier: 1, value: 15, per: 1, cap: 2 },     // → 30
  'create:mechanical_crafter':{ tier: 1, value: 10, per: 1, cap: 4 },     // → 40
  'create:water_wheel':       { tier: 1, value: 10, per: 1, cap: 4 },     // → 40

  // ===== T2 — THERMAL — subtotal ≈ 1200 (120% of 1000) =====
  // BULK METALS at T2/T3: the §2 T2+T3 tables re-list gold/iron/copper/redstone
  // at higher caps (15000 @ T2, 30000 @ T3). These are the SAME vanilla item IDs
  // as T1, so they're handled by the CONTEXTUAL bulk-metal entries above (one
  // cap key per item PER tier) — when a player working T1→T2 submits iron it
  // mints T2 tokens against the 15000 cap, etc. That restores the §2 ore-base
  // curve (36%/62%/64%) and lets pure-engineering close T2 + T3 on bulk metals +
  // the tier-exclusive submissions below (invar/electrum @ T2; diamond/netherite/
  // biofuel @ T3) + the tier-exclusive Thermal/Mekanism machine blocks.
  'thermal:invar_ingot':      { tier: 2, value: 1, per: 50, cap: 500 },   // → 10  (design "Invar ore")
  'thermal:electrum_ingot':   { tier: 2, value: 1, per: 50, cap: 500 },   // → 10  (design "Electrum ore")
  // High-value Thermal machine blocks.
  'thermal:machine_smelter':    { tier: 2, value: 50, per: 1, cap: 2 },   // → 100 (Induction Smelter)
  'thermal:machine_pulverizer': { tier: 2, value: 40, per: 1, cap: 2 },   // → 80  (Pulverizer)
  'thermal:machine_centrifuge': { tier: 2, value: 40, per: 1, cap: 2 },   // → 80  (Centrifugal Separator)
  'thermal:machine_furnace':    { tier: 2, value: 30, per: 1, cap: 2 },   // → 60  (Redstone Furnace)
  'thermal:machine_sawmill':    { tier: 2, value: 30, per: 1, cap: 2 },   // → 60  (Sawmill)
  'thermal:dynamo_magmatic':    { tier: 2, value: 25, per: 1, cap: 2 },   // → 50  (Magmatic Dynamo)
  'thermal:energy_cell':        { tier: 2, value: 25, per: 1, cap: 2 },   // → 50  (Energy Cell)
  'thermal:machine_crucible':   { tier: 2, value: 20, per: 1, cap: 2 },   // → 40  (Magma Crucible)
  'thermal:dynamo_stirling':    { tier: 2, value: 15, per: 1, cap: 4 },   // → 60  (Stirling Dynamo)

  // ===== T3 — MEKANISM — subtotal ≈ 2400 (120% of 2000) =====
  // Tier-exclusive metals/fuels.
  'minecraft:diamond':            { tier: 3, value: 1, per: 50,  cap: 500 },  // → 10  (Diamonds)
  'minecraft:netherite_ingot':    { tier: 3, value: 1, per: 25,  cap: 500 },  // → 20  (Netherite)
  'mekanism:bio_fuel':            { tier: 3, value: 1, per: 100, cap: 5000 }, // → 50  (Biofuel)
  // High-value Mekanism machine blocks.
  'mekanismgenerators:gas_burning_generator': { tier: 3, value: 100, per: 1, cap: 2 }, // → 200
  'mekanism:basic_smelting_factory': { tier: 3, value: 80, per: 1, cap: 2 },  // → 160 (design "Basic Factory"; representative basic factory)
  'mekanism:purification_chamber':   { tier: 3, value: 70, per: 1, cap: 2 },  // → 140
  'mekanism:osmium_compressor':      { tier: 3, value: 70, per: 1, cap: 2 },  // → 140
  'mekanism:enrichment_chamber':     { tier: 3, value: 60, per: 1, cap: 2 },  // → 120
  'mekanism:metallurgic_infuser':    { tier: 3, value: 50, per: 1, cap: 2 },  // → 100
  'mekanism:crusher':                { tier: 3, value: 50, per: 1, cap: 2 },  // → 100
  'mekanism:energized_smelter':      { tier: 3, value: 40, per: 1, cap: 2 },  // → 80
  'mekanism:basic_energy_cube':      { tier: 3, value: 40, per: 1, cap: 2 },  // → 80  (Energy Cube — Basic)
  'mekanism:alloy_reinforced':       { tier: 3, value: 1, per: 5, cap: 50 },  // → 10  (design "Advanced Alloy"; rate ⚠ OPEN in spec — placeholder 1/5)
  // [S85-S4 2026-06-06] Antimatter as the apex engineering submission (the
  // builder-only sink so the SPS is worth running without combat/mythic gear).
  // Premium rate + small lifetime cap: 20 pellets → 1000 T3 tokens → 8000 XP
  // via the T4 exchange. mekanism is already in CODEX_LANES.engineering, so this
  // auto-joins the #icraft:codex_engineering tag (tags loop derives from this
  // table) — no separate tag line needed. (id confirmed in all_items.tsv.)
  // ⚠ value/cap are draft-provisional (draft S4 proposed rate); flagged for tuning.
  'mekanism:pellet_antimatter':      { tier: 3, value: 50, per: 1, cap: 20 },  // → 1000 over the lifetime cap (apex engineering submission)

  // ===========================================================================
  // ROUTE D — MAGIC (non-combat cultivation). FIXED-tier: Magic content is
  // tier-LOCATED (Botania @ T1 / Ars @ T2 / advanced-Botania+Occultism+F&A @ T3),
  // so each reagent/apparatus mints a fixed tier's token. Feeds the SAME
  // progression_token_t1/t2/t3 pool (Magic is a non-combat lane, like
  // Engineering). Reagents = the "ore" (crystallized cultivation output, big
  // caps); Apparatus = the "machines" (milestone blocks/rituals, small caps,
  // big values). Spellcasting & combat drops excluded — Gaia Spirit (a boss
  // drop, botania:gaia_ingot) is DROPPED per the design's non-combat invariant.
  // All IDs jar+audit confirmed 2026-06-01; design → real-ID notes inline.

  // ----- T1 — BOTANIA — subtotal ≈ 600 -----
  'botania:manasteel_ingot':   { tier: 1, value: 1, per: 50,  cap: 10000 }, // → 200
  'botania:mana_pearl':        { tier: 1, value: 1, per: 20,  cap: 2000 },  // → 100
  // Mystical Petals (any colour) — all 16 share one logical resource + cap pool
  // is impossible across distinct keys, so each colour carries the full row cap
  // (design "Mystical Petals (any)" 4000 @ 1/80 → 50). Per-colour cap 4000.
  'botania:white_petal':       { tier: 1, value: 1, per: 80,  cap: 4000 },  // → 50
  'botania:orange_petal':      { tier: 1, value: 1, per: 80,  cap: 4000 },
  'botania:magenta_petal':     { tier: 1, value: 1, per: 80,  cap: 4000 },
  'botania:light_blue_petal':  { tier: 1, value: 1, per: 80,  cap: 4000 },
  'botania:yellow_petal':      { tier: 1, value: 1, per: 80,  cap: 4000 },
  'botania:lime_petal':        { tier: 1, value: 1, per: 80,  cap: 4000 },
  'botania:pink_petal':        { tier: 1, value: 1, per: 80,  cap: 4000 },
  'botania:gray_petal':        { tier: 1, value: 1, per: 80,  cap: 4000 },
  'botania:light_gray_petal':  { tier: 1, value: 1, per: 80,  cap: 4000 },
  'botania:cyan_petal':        { tier: 1, value: 1, per: 80,  cap: 4000 },
  'botania:purple_petal':      { tier: 1, value: 1, per: 80,  cap: 4000 },
  'botania:blue_petal':        { tier: 1, value: 1, per: 80,  cap: 4000 },
  'botania:brown_petal':       { tier: 1, value: 1, per: 80,  cap: 4000 },
  'botania:green_petal':       { tier: 1, value: 1, per: 80,  cap: 4000 },
  'botania:red_petal':         { tier: 1, value: 1, per: 80,  cap: 4000 },
  'botania:black_petal':       { tier: 1, value: 1, per: 80,  cap: 4000 },
  // Runic Altar runes — 16 elemental/seasonal/sin runes, design "runes" 16 @ 5 → 80.
  // Per-rune cap 16 (the design cap is the row total; each rune key carries it).
  'botania:rune_water':        { tier: 1, value: 5, per: 1, cap: 16 },
  'botania:rune_fire':         { tier: 1, value: 5, per: 1, cap: 16 },
  'botania:rune_earth':        { tier: 1, value: 5, per: 1, cap: 16 },
  'botania:rune_air':          { tier: 1, value: 5, per: 1, cap: 16 },
  'botania:rune_spring':       { tier: 1, value: 5, per: 1, cap: 16 },
  'botania:rune_summer':       { tier: 1, value: 5, per: 1, cap: 16 },
  'botania:rune_autumn':       { tier: 1, value: 5, per: 1, cap: 16 },
  'botania:rune_winter':       { tier: 1, value: 5, per: 1, cap: 16 },
  'botania:rune_mana':         { tier: 1, value: 5, per: 1, cap: 16 },
  'botania:rune_lust':         { tier: 1, value: 5, per: 1, cap: 16 },
  'botania:rune_gluttony':     { tier: 1, value: 5, per: 1, cap: 16 },
  'botania:rune_greed':        { tier: 1, value: 5, per: 1, cap: 16 },
  'botania:rune_sloth':        { tier: 1, value: 5, per: 1, cap: 16 },
  'botania:rune_wrath':        { tier: 1, value: 5, per: 1, cap: 16 },
  'botania:rune_envy':         { tier: 1, value: 5, per: 1, cap: 16 },
  'botania:rune_pride':        { tier: 1, value: 5, per: 1, cap: 16 },
  // Apparatus (blocks).
  'botania:runic_altar':       { tier: 1, value: 20, per: 1, cap: 2 },     // → 40  (Runic Altar)
  'botania:mana_pool':         { tier: 1, value: 10, per: 1, cap: 4 },     // → 40  (Mana Pool)
  'botania:mana_spreader':     { tier: 1, value: 10, per: 1, cap: 4 },     // → 40  (Mana Spreaders)
  'botania:endoflame':         { tier: 1, value: 5,  per: 1, cap: 8 },     // → 40  (Generating flora)
  'botania:alchemy_catalyst':  { tier: 1, value: 5,  per: 1, cap: 2 },     // → 10  (Alchemy Catalyst)

  // ----- T2 — ARS NOUVEAU — subtotal ≈ 1250 -----
  'ars_nouveau:source_gem':        { tier: 2, value: 1, per: 50,  cap: 30000 }, // → 600
  'ars_nouveau:magebloom_fiber':   { tier: 2, value: 1, per: 50,  cap: 4000 },  // → 80
  'ars_nouveau:sourceberry_bush':  { tier: 2, value: 1, per: 100, cap: 6000 },  // → 60  (Sourceberries — the bush block IS the held berry item)
  'botania:mana_diamond':          { tier: 2, value: 1, per: 10,  cap: 500 },   // → 50  (Mana Diamond — re-tiered T1→T2, needs a diamond)
  'ars_nouveau:agronomic_sourcelink':  { tier: 2, value: 30, per: 1, cap: 2 },  // → 60  (Sourcelinks ×3 → 180)
  'ars_nouveau:alchemical_sourcelink': { tier: 2, value: 30, per: 1, cap: 2 },  // → 60
  'ars_nouveau:mycelial_sourcelink':   { tier: 2, value: 30, per: 1, cap: 2 },  // → 60
  'ars_nouveau:source_jar':            { tier: 2, value: 20, per: 1, cap: 4 },  // → 80  (Source Jars)
  'ars_nouveau:imbuement_chamber':     { tier: 2, value: 20, per: 1, cap: 2 },  // → 40  (Imbuement Chamber / Enchanting Apparatus → 80)
  'ars_nouveau:enchanting_apparatus':  { tier: 2, value: 20, per: 1, cap: 2 },  // → 40
  'ars_nouveau:drygmy_stone':          { tier: 2, value: 25, per: 1, cap: 2 },  // → 50  (Drygmy Henge — audit display "Drygmy Henge")
  'ars_nouveau:ritual_brazier':        { tier: 2, value: 15, per: 1, cap: 2 },  // → 30  (Ritual Brazier; premium Sourcelinks below → +40)
  'ars_nouveau:vitalic_sourcelink':    { tier: 2, value: 20, per: 1, cap: 2 },  // → 40  (premium Sourcelink)
  'ars_nouveau:volcanic_sourcelink':   { tier: 2, value: 20, per: 1, cap: 2 },  // → 40  (premium Sourcelink)

  // ----- T3 — advanced BOTANIA + OCCULTISM + F&A — subtotal ≈ 2360 -----
  'botania:terrasteel_ingot':           { tier: 3, value: 1, per: 4,  cap: 2000 }, // → 500
  'forbidden_arcanus:arcane_crystal':   { tier: 3, value: 1, per: 10, cap: 4000 }, // → 400
  'botania:elementium_ingot':           { tier: 3, value: 1, per: 10, cap: 3000 }, // → 300  (Elementium / Spirit-Attuned row → 600)
  'occultism:spirit_attuned_gem':       { tier: 3, value: 1, per: 5,  cap: 1500 }, // → 300
  'forbidden_arcanus:deorum_ingot':     { tier: 3, value: 1, per: 10, cap: 1500 }, // → 150  (Deorum / Iesnium row → 250)
  'occultism:iesnium_ingot':            { tier: 3, value: 1, per: 10, cap: 1000 }, // → 100
  'occultism:otherworld_essence':       { tier: 3, value: 1, per: 5,  cap: 600 },  // → 120  (Otherworld / Demon's Dream essence)
  'occultism:demons_dream_essence':     { tier: 3, value: 1, per: 5,  cap: 600 },  // → 120
  'forbidden_arcanus:hephaestus_forge': { tier: 3, value: 80, per: 1, cap: 1 },    // → 80   (Hephaestus Forge)
  'botania:terra_plate':                { tier: 3, value: 30, per: 1, cap: 2 },    // → 60   (Terra Plate / Terrestrial Agglomeration Plate)
  'botania:alfheim_portal':             { tier: 3, value: 20, per: 1, cap: 2 },    // → 40   (Alfheim Portal / Elven Gateway Core)
  'occultism:miner_djinni_ores':        { tier: 3, value: 40, per: 1, cap: 3 },    // → 120  (Occultism ore-miner spirit lamps — "Ore Miner Djinni")
  'occultism:storage_controller':       { tier: 3, value: 30, per: 1, cap: 2 },    // → 60   (Dimensional Storage — "Dimensional Storage Actuator")
  'forbidden_arcanus:eternal_stella':   { tier: 3, value: 25, per: 1, cap: 2 },    // → 50   (Eternal Stella)
  'forbidden_arcanus:clibano_core':     { tier: 3, value: 20, per: 1, cap: 2 },    // → 40   (Clibano)
  'botania:conjuration_catalyst':       { tier: 3, value: 20, per: 1, cap: 2 },    // → 40   (Conjuration Catalyst — re-tiered T1→T3, Alfheim chain)
}

// ---- Lane classification (Engineering vs Magic material lanes) -------------
// CODEX_CONVERSIONS carries no explicit lane field — lane is implicit in the
// item's namespace. Engineering = vanilla bulk metals + Create/Thermal/Mekanism;
// Magic = Botania / Ars Nouveau / Forbidden Arcanus / Occultism. Used by the
// Heracles per-lane "Submit" buttons (`/icraft codex submit <lane>`) and the
// lane item tags below. (Exploration + Combat are NOT material-submission lanes —
// they mint via kills/dimensions/loot in codex_exploration_kills.js /
// codex_exploration_drops.js / codex_boss_rush.js, so they have no Submit button.)
const CODEX_LANES = {
  engineering: ['minecraft', 'create', 'thermal', 'mekanism', 'mekanismgenerators'],
  magic:       ['botania', 'ars_nouveau', 'forbidden_arcanus', 'occultism'],
}
function codexLaneOf(itemId) {
  const ns = itemId.split(':')[0]
  for (const lane in CODEX_LANES) {
    if (CODEX_LANES[lane].indexOf(ns) !== -1) return lane
  }
  return null
}

// persistentData key for a resource's lifetime-submitted count (item units).
// Sanitise the item ID into an NBT-safe key fragment. For CONTEXTUAL entries a
// `tier` suffix is appended so each item tracks an INDEPENDENT lifetime count
// per tier (iron@T1 cap and iron@T2 cap are separate counters). Fixed entries
// pass tier=null → bare key, preserving existing persistentData (no migration).
function codexCapKey(itemId, tier) {
  const base = 'icraft_codex_sub_' + itemId.replace(/[:\/]/g, '_')
  return tier ? base + '_t' + tier : base
}

// The player's CURRENT transition tier = the lowest tier whose unlock stage is
// not yet granted (no tier_2 → 1; has tier_2 no tier_3 → 2; has tier_3 no
// tier_4 → 3; has tier_4 → 0 = terminal, contextual metals no longer mint).
function codexCurrentTier(player) {
  if (!AStages.playerHasStage('tier_2', player)) return 1
  if (!AStages.playerHasStage('tier_3', player)) return 2
  if (!AStages.playerHasStage('tier_4', player)) return 3
  return 0
}

// =============================================================================
// SUBMIT — scan inventory, convert eligible materials, consume, report.
// =============================================================================
function codexSubmit(player, lane) {
  const pdata = player.persistentData
  const inv = player.inventory
  const size = inv.size

  // tier → tokens earned this submission (for the give + the report)
  const earned = { 1: 0, 2: 0, 3: 0 }
  // itemId → { name, consumed, tokens } for the per-resource report lines
  const lines = []
  let anyEligible = false
  let anyCapped = false

  // CONTEXTUAL bulk metals mint the player's current transition tier (T1/2/3).
  // 0 = terminal (tier_4 held): contextual metals are skipped (nothing left to
  // mint toward), while fixed-tier entries still convert normally.
  const curTier = codexCurrentTier(player)

  // Iterate each conversion entry; sum the matching item across all slots,
  // then consume whole conversion units up to the remaining cap.
  for (const itemId in CODEX_CONVERSIONS) {
    const conv = CODEX_CONVERSIONS[itemId]

    // Lane filter — the Heracles per-lane Submit buttons fire `submit <lane>`,
    // so only that lane's materials convert. Bare `submit` (lane undefined)
    // converts everything, exactly as before.
    if (lane && codexLaneOf(itemId) !== lane) continue

    // Resolve the target tier, cap, and per-tier cap key for this entry.
    let targetTier, cap, capKey
    if (conv.contextual) {
      if (curTier === 0) continue            // terminal — contextual metals inert
      targetTier = curTier
      cap = conv.capPerTier[targetTier]
      capKey = codexCapKey(itemId, targetTier)
    } else {
      targetTier = conv.tier
      cap = conv.cap
      capKey = codexCapKey(itemId)           // bare key (unchanged)
    }

    // Count this item across the whole inventory.
    let available = 0
    for (let i = 0; i < size; i++) {
      const stack = inv.getStackInSlot(i)
      if (!stack.isEmpty() && stack.id === itemId) available += stack.count
    }
    if (available <= 0) continue
    anyEligible = true

    // Remaining cap for this resource (at this tier, for contextual entries).
    const already = pdata.getInt(capKey)
    const remainingCap = cap - already
    if (remainingCap <= 0) { anyCapped = true; continue }

    // Submittable = min(available, remainingCap). Convert only whole units
    // (tokens * per) so partial leftovers are never destroyed.
    const submittable = Math.min(available, remainingCap)
    const tokens = Math.floor(submittable / conv.per) * conv.value
    if (tokens <= 0) continue
    const consumed = (tokens / conv.value) * conv.per

    // Consume `consumed` items from the inventory.
    let toRemove = consumed
    for (let i = 0; i < size && toRemove > 0; i++) {
      const stack = inv.getStackInSlot(i)
      if (!stack.isEmpty() && stack.id === itemId) {
        const take = Math.min(stack.count, toRemove)
        stack.count = stack.count - take
        toRemove -= take
        if (stack.count <= 0) inv.setStackInSlot(i, Item.empty)
      }
    }

    // Bank cap progress + tally tokens.
    pdata.putInt(capKey, already + consumed)
    earned[targetTier] += tokens

    let dispName = itemId
    try { dispName = Item.of(itemId).hoverName.string } catch (_) {}
    lines.push({ name: dispName, consumed: consumed, tokens: tokens, tier: targetTier })
  }

  // Give the earned tokens + report.
  let grantedAny = false
  for (let t = 1; t <= 3; t++) {
    if (earned[t] > 0) {
      player.give(Item.of(CODEX_TOKENS[t].item, earned[t]))
      grantedAny = true
    }
  }

  if (!grantedAny) {
    if (anyCapped) {
      player.tell(Text.gold('[Codex] ').append(Text.gray('Every eligible material you carry is already at its submission cap.')))
    } else if (anyEligible) {
      player.tell(Text.gold('[Codex] ').append(Text.gray('Not enough of any single material to mint a token. (Bulk metals convert per 100; check /icraft codex balance.)')))
    } else {
      player.tell(Text.gold('[Codex] ').append(Text.gray('No eligible Engineering materials in your inventory to submit.')))
    }
    return 0
  }

  player.tell(Text.gold('═══ Codex Submission' + (lane ? ' — ' + lane.charAt(0).toUpperCase() + lane.slice(1) : '') + ' ═══'))
  lines.forEach(l => {
    player.tell(Text.gray('  ' + l.consumed + '× ').append(Text.white(l.name))
      .append(Text.gray(' → ')).append(Text.aqua('+' + l.tokens + ' T' + l.tier + ' token' + (l.tokens === 1 ? '' : 's'))))
  })
  for (let t = 1; t <= 3; t++) {
    if (earned[t] > 0) {
      player.tell(Text.yellow('  Banked: ').append(Text.aqua('+' + earned[t] + ' Tier ' + t + ' token' + (earned[t] === 1 ? '' : 's'))))
    }
  }
  player.tell(Text.gold('════════════════════════'))

  // A submission may have pushed a pool over its threshold — check + advance.
  codexCheckAdvance(player)
  return 1
}

// =============================================================================
// BALANCE — held tokens vs threshold, per tier, + advance check.
// =============================================================================
function codexBalance(player) {
  const inv = player.inventory
  const size = inv.size

  // Count held tokens per tier.
  const held = { 1: 0, 2: 0, 3: 0 }
  for (let t = 1; t <= 3; t++) {
    const id = CODEX_TOKENS[t].item
    for (let i = 0; i < size; i++) {
      const stack = inv.getStackInSlot(i)
      if (!stack.isEmpty() && stack.id === id) held[t] += stack.count
    }
  }

  player.tell(Text.gold('═══ Codex Balance ═══'))
  for (let t = 1; t <= 3; t++) {
    const c = CODEX_TOKENS[t]
    const has = AStages.playerHasStage(c.grantsStage, player)
    const meets = held[t] >= c.threshold
    const colour = has ? Text.green : (meets ? Text.aqua : Text.white)
    let line = Text.gray('  Tier ' + t + '→' + (t + 1) + ': ')
      .append(colour(held[t] + ' / ' + c.threshold))
    if (has) line = line.append(Text.green('  ✔ ' + c.grantsStage + ' already unlocked'))
    else if (meets) line = line.append(Text.aqua('  ★ threshold met — advancing!'))
    player.tell(line)
  }
  // Which tier bulk metals (iron/copper/gold/redstone) currently mint toward.
  const curTier = codexCurrentTier(player)
  if (curTier === 0) {
    player.tell(Text.gray('  Bulk metals: ').append(Text.green('all tiers cleared (T4) — no longer minting')))
  } else {
    player.tell(Text.gray('  Bulk metals mint: ').append(Text.aqua('Tier ' + curTier + ' tokens')).append(Text.gray(' (current transition)')))
  }
  player.tell(Text.gold('═════════════════════'))

  codexCheckAdvance(player)
  return 1
}

// =============================================================================
// ADVANCE — for each tier whose held tokens ≥ threshold and whose stage is not
// yet granted, consume the threshold tokens and grant the stage.
// =============================================================================
function codexCheckAdvance(player) {
  const inv = player.inventory
  const size = inv.size

  for (let t = 1; t <= 3; t++) {
    const c = CODEX_TOKENS[t]
    if (AStages.playerHasStage(c.grantsStage, player)) continue

    // Count held tokens of this tier.
    let held = 0
    for (let i = 0; i < size; i++) {
      const stack = inv.getStackInSlot(i)
      if (!stack.isEmpty() && stack.id === c.item) held += stack.count
    }
    if (held < c.threshold) continue

    // Consume exactly the threshold (the tokens are spent to buy the tier).
    let toRemove = c.threshold
    for (let i = 0; i < size && toRemove > 0; i++) {
      const stack = inv.getStackInSlot(i)
      if (!stack.isEmpty() && stack.id === c.item) {
        const take = Math.min(stack.count, toRemove)
        stack.count = stack.count - take
        toRemove -= take
        if (stack.count <= 0) inv.setStackInSlot(i, Item.empty)
      }
    }

    codexGrantTier(player, c.grantsStage, c.threshold + ' Tier ' + t + ' Codex tokens')
  }
}

// =============================================================================
// GRANT — mirrors milestone_detection.js grantTier (cascade + Patchouli adv +
// broadcast). Kept local so this file is self-contained; AStageEvents.added in
// milestone_detection.js also fires and handles the cascade/advancement sync,
// so the two are belt-and-suspenders, not conflicting.
// =============================================================================
function codexGrantTier(player, tier, triggerName) {
  if (AStages.playerHasStage(tier, player)) return

  AStages.addStageToPlayer(tier, player)

  // Safety-net: grant all lower tiers too.
  const tiers = ['tier_1', 'tier_2', 'tier_3', 'tier_4']
  const targetIdx = tiers.indexOf(tier)
  for (let i = 0; i <= targetIdx; i++) {
    if (!AStages.playerHasStage(tiers[i], player)) AStages.addStageToPlayer(tiers[i], player)
  }

  // Patchouli codex advancements up to + including this tier (tier_1 has no gate).
  const advTiers = ['tier_2', 'tier_3', 'tier_4']
  advTiers.slice(0, advTiers.indexOf(tier) + 1).forEach(adv => {
    player.server.runCommandSilent('advancement grant ' + player.username + ' only icraft:stage_' + adv)
  })

  const tierNum = tier.replace('tier_', '')

  player.tell(Text.gold('═══════════════════════════════════════'))
  player.tell(Text.gold('  ★ TIER ' + tierNum + ' UNLOCKED ★'))
  player.tell(Text.white('  Triggered by: ' + triggerName))
  player.tell(Text.gray('  New items, dimensions, and recipes are now available!'))
  player.tell(Text.gold('═══════════════════════════════════════'))

  player.server.tell(Text.yellow('★ ' + player.username + ' has reached Tier ' + tierNum + '!'))
  player.server.runCommandSilent('playsound minecraft:ui.toast.challenge_complete player ' + player.username)

  console.log('[IridescentCraft][Codex] ' + player.username + ' granted ' + tier + ' via: ' + triggerName)
}

// =============================================================================
// EXCHANGE (#69) — T4-gated: convert banked progression_token_tN → vanilla XP.
// JLFork Aptitudes level up by SPENDING vanilla XP (AptitudeLevelUpSP), so this
// gives surplus / T4-minted tokens a universal endgame sink (Aptitudes, plus
// enchanting + anvil repairs). Inert until the player holds the `tier_4` stage.
//   /icraft codex exchange <1|2|3> <amount|all>
// Roman numerals for the per-tier token display name (Codex Token I/II/III).
// =============================================================================
const CODEX_TOKEN_ROMAN = ['', 'I', 'II', 'III']

function codexExchange(player, tier, amountArg) {
  // Endgame gate — the exchange only opens at Tier 4.
  if (!AStages.playerHasStage('tier_4', player)) {
    player.tell(Text.gold('[Codex] ').append(Text.gray('The token → XP exchange unlocks at '))
      .append(Text.yellow('Tier 4')).append(Text.gray('. Keep advancing.')))
    return 0
  }

  const conf = CODEX_TOKENS[tier]
  const rate = CODEX_XP_PER_TOKEN[tier]
  if (!conf || !rate) { player.tell(Text.red('[Codex] Invalid tier: ' + tier)); return 0 }
  const tokenId = conf.item
  const inv = player.inventory
  const size = inv.size

  // Count held tokens of this tier.
  let held = 0
  for (let i = 0; i < size; i++) {
    const stack = inv.getStackInSlot(i)
    if (!stack.isEmpty() && stack.id === tokenId) held += stack.count
  }
  if (held <= 0) {
    player.tell(Text.gold('[Codex] ').append(Text.gray('You have no '))
      .append(Text.aqua('Codex Token ' + CODEX_TOKEN_ROMAN[tier])).append(Text.gray(' to exchange.')))
    return 0
  }

  // 'all' → everything held; integer → clamp to what's actually held (no partial loss).
  const want = (amountArg === 'all') ? held : amountArg
  if (want <= 0) { player.tell(Text.red('[Codex] Amount must be a positive number (or "all").')); return 0 }
  const convert = Math.min(want, held)

  // Consume `convert` tokens from the inventory.
  let toRemove = convert
  for (let i = 0; i < size && toRemove > 0; i++) {
    const stack = inv.getStackInSlot(i)
    if (!stack.isEmpty() && stack.id === tokenId) {
      const take = Math.min(stack.count, toRemove)
      stack.count = stack.count - take
      toRemove -= take
      if (stack.count <= 0) inv.setStackInSlot(i, Item.empty)
    }
  }

  // Grant the XP as POINTS — fills the vanilla XP bar + plays the orb sound, and
  // is what Aptitude level-ups deduct against. (INT XP-gain perks, if any, scale
  // this exactly as they would any XP gain — a deliberate INT-build synergy.)
  const xp = convert * rate
  player.giveExperiencePoints(xp)

  const remaining = held - convert
  player.tell(Text.gold('═══ Codex Exchange ═══'))
  player.tell(Text.gray('  ' + convert + '× ').append(Text.white('Codex Token ' + CODEX_TOKEN_ROMAN[tier]))
    .append(Text.gray(' → ')).append(Text.green('+' + xp + ' XP')).append(Text.gray(' (' + rate + ' / token)')))
  if (convert < want) player.tell(Text.gray('  (You only had ' + held + '.)'))
  player.tell(Text.yellow('  Now at level ').append(Text.aqua('' + player.experienceLevel))
    .append(Text.gray('  ·  Remaining T' + tier + ' tokens: ')).append(Text.aqua('' + remaining)))
  player.tell(Text.gold('══════════════════════'))
  return xp
}

// Help / status line when `exchange` is run with no tier.
function codexExchangeHelp(player) {
  player.tell(Text.gold('═══ Codex Exchange ═══'))
  if (!AStages.playerHasStage('tier_4', player)) {
    player.tell(Text.gray('  Unlocks at ').append(Text.yellow('Tier 4')).append(Text.gray(' — converts banked tokens → vanilla XP.')))
  } else {
    player.tell(Text.gray('  Convert banked tokens → vanilla XP (Aptitude leveling, enchanting, anvil repairs).'))
  }
  player.tell(Text.gray('  Usage: ').append(Text.white('/icraft codex exchange <1|2|3> <amount|all>')))
  player.tell(Text.gray('  Rates: ')
    .append(Text.aqua('T1 ' + CODEX_XP_PER_TOKEN[1])).append(Text.gray(' · '))
    .append(Text.aqua('T2 ' + CODEX_XP_PER_TOKEN[2])).append(Text.gray(' · '))
    .append(Text.aqua('T3 ' + CODEX_XP_PER_TOKEN[3])).append(Text.gray(' XP per token')))
  player.tell(Text.gold('══════════════════════'))
  return 1
}

// =============================================================================
// COMMAND REGISTRATION — /icraft codex submit | balance | exchange
// Merges into the existing /icraft literal (despawn, mana_debug, …) — Brigadier
// unions literals across commandRegistry calls.
// =============================================================================
// IntegerArgumentType for `exchange <tier> <amount>` (same loadClass pattern as
// icraft_despawn_command.js — stable across mappings).
const CODEX_IntArg = Java.loadClass('com.mojang.brigadier.arguments.IntegerArgumentType')

// Shared player-extraction wrapper for the exchange command variants.
function codexCmdExchange(ctx, tier, amount) {
  let sp
  try { sp = ctx.source.getPlayerOrException() } catch (e) {
    ctx.source.sendFailure(Text.of('Must be run as a player')); return 0
  }
  try { return (tier === null) ? codexExchangeHelp(sp) : codexExchange(sp, tier, amount) } catch (e) {
    console.warn('[Codex] exchange' + (tier ? ' ' + tier : '') + ' threw for ' + sp.username + ': ' + e)
    sp.tell(Text.red('[Codex] exchange failed: ' + e)); return 0
  }
}

// Builds the `<tier>` literal branch: `<tier> all` and `<tier> <amount>`.
function codexExchangeTierBranch(Commands, tier) {
  return Commands.literal('' + tier)
    .requires(src => src.hasPermission(0))
    .then(Commands.literal('all')
      .executes(ctx => codexCmdExchange(ctx, tier, 'all')))
    .then(Commands.argument('amount', CODEX_IntArg.integer(1))
      .executes(ctx => codexCmdExchange(ctx, tier, CODEX_IntArg.getInteger(ctx, 'amount'))))
}
// Shared player-extraction + submit wrapper for the submit command variants.
function codexCmdSubmit(ctx, lane) {
  let sp
  try { sp = ctx.source.getPlayerOrException() } catch (e) {
    ctx.source.sendFailure(Text.of('Must be run as a player'))
    return 0
  }
  try { return codexSubmit(sp, lane) } catch (e) {
    console.warn('[Codex] submit' + (lane ? ' ' + lane : '') + ' threw for ' + sp.username + ': ' + e)
    sp.tell(Text.red('[Codex] submit failed: ' + e))
    return 0
  }
}

ServerEvents.commandRegistry(event => {
  const { commands: Commands } = event

  event.register(
    Commands.literal('icraft')
      .then(Commands.literal('codex')
        .then(Commands.literal('submit')
          .requires(src => src.hasPermission(0))
          .executes(ctx => codexCmdSubmit(ctx, null))
          .then(Commands.literal('engineering')
            .requires(src => src.hasPermission(0))
            .executes(ctx => codexCmdSubmit(ctx, 'engineering')))
          .then(Commands.literal('magic')
            .requires(src => src.hasPermission(0))
            .executes(ctx => codexCmdSubmit(ctx, 'magic')))
        )
        .then(Commands.literal('balance')
          .requires(src => src.hasPermission(0))
          .executes(ctx => {
            let sp
            try { sp = ctx.source.getPlayerOrException() } catch (e) {
              ctx.source.sendFailure(Text.of('Must be run as a player'))
              return 0
            }
            try { return codexBalance(sp) } catch (e) {
              console.warn('[Codex] balance threw for ' + sp.username + ': ' + e)
              sp.tell(Text.red('[Codex] balance failed: ' + e))
              return 0
            }
          })
        )
        .then(Commands.literal('exchange')   // #69 — T4-gated token → XP faucet
          .requires(src => src.hasPermission(0))
          .executes(ctx => codexCmdExchange(ctx, null, null))   // bare `exchange` → help/status
          .then(codexExchangeTierBranch(Commands, 1))
          .then(codexExchangeTierBranch(Commands, 2))
          .then(codexExchangeTierBranch(Commands, 3))
        )
      )
  )
})

// ---- Lane item tags (for the Heracles per-lane "Submit" buttons) -----------
// #icraft:codex_engineering / #icraft:codex_magic = every submittable material
// in that lane, derived from CODEX_CONVERSIONS so the tag can't drift from the
// conversion table. A Heracles MANUAL "Submit" task gates on these tags so the
// button lights up whenever the player carries ANY of that lane's materials.
ServerEvents.tags('item', event => {
  // RHINO-SAFETY: `var` (NOT const/let) — ServerEvents.tags re-fires on every tag
  // rebuild; a closure-local const/let throws "redeclaration of var" on the 2nd
  // invocation (boot-level, not just /reload), which silently broke the per-lane
  // Submit buttons. See dev/lessons-learned.md.
  for (var itemId in CODEX_CONVERSIONS) {
    var lane = codexLaneOf(itemId)
    if (lane) {
      try { event.add('icraft:codex_' + lane, itemId) } catch (e) {}
    }
  }
})

console.log('[IridescentCraft] Codex progression engine loaded (/icraft codex submit [engineering|magic] | balance | exchange)')
console.log('  Thresholds: T1→T2 500 | T2→T3 1000 | T3→T4 2000 (T4 terminal = Ender Dragon)')
console.log('  Conversion entries (Engineering + Magic): ' + Object.keys(CODEX_CONVERSIONS).length)
console.log('  Bulk metals are CONTEXTUAL — mint the player\'s current transition tier (per-tier caps)')
console.log('  #69 token→XP exchange (T4-gated): ' + CODEX_XP_PER_TOKEN[1] + '/' + CODEX_XP_PER_TOKEN[2] + '/' + CODEX_XP_PER_TOKEN[3] + ' XP per T1/T2/T3 token')
