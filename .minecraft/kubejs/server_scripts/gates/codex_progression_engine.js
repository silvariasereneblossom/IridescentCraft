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

// ---- §2 Engineering conversion tables (the COMPLETE conversion set) --------
// Schema per entry: { tier, value, per, cap }
//   tier  — which tier's token this material yields (1/2/3)
//   value — tokens granted per `per` items submitted
//   per   — items required for `value` tokens (e.g. 1 token per 100 iron → value:1, per:100)
//   cap   — per-resource LIFETIME cap, in ITEM units (e.g. iron cap 7500 → max 75 tokens)
//
// Item IDs verified against TesterLogs/Item Audit/all_items.tsv (2026-06-01).
// Notes on a few design-table → real-ID resolutions are inline.
const CODEX_CONVERSIONS = {

  // ===== T1 — CREATE — subtotal ≈ 590 (118% of 500) =====
  // Bulk metals (1 token / 100).
  'minecraft:iron_ingot':     { tier: 1, value: 1, per: 100, cap: 7500 }, // → 75
  'minecraft:copper_ingot':   { tier: 1, value: 1, per: 100, cap: 2500 }, // → 25
  'minecraft:gold_ingot':     { tier: 1, value: 1, per: 100, cap: 2500 }, // → 25
  'minecraft:redstone':       { tier: 1, value: 1, per: 100, cap: 2500 }, // → 25
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
  // DESIGN-vs-IMPLEMENTATION NOTE (bulk metals):
  //   The §2 T2 + T3 tables re-list gold/iron/copper/redstone at higher caps
  //   (15000 @ T2, 30000 @ T3). But those are the SAME vanilla item IDs as the
  //   T1 bulk-metal rows, and a JS object key can map to only one conversion
  //   entry. Since the pack has no per-tier-distinct iron/gold/etc. item, the
  //   bulk metals feed the T1 token pool only. T2/T3 Engineering is therefore
  //   carried by the tier-EXCLUSIVE submissions: invar/electrum @ T2,
  //   diamond/netherite/biofuel @ T3, plus the tier-exclusive Thermal/Mekanism
  //   machine blocks. Implication for the "pure-engineering reaches threshold"
  //   design goal is called out in the build report (a Phase-1 risk/assumption).
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
}

// persistentData key for a resource's lifetime-submitted count (item units).
// Sanitise the item ID into an NBT-safe key fragment.
function codexCapKey(itemId) {
  return 'icraft_codex_sub_' + itemId.replace(/[:\/]/g, '_')
}

// =============================================================================
// SUBMIT — scan inventory, convert eligible materials, consume, report.
// =============================================================================
function codexSubmit(player) {
  const pdata = player.persistentData
  const inv = player.inventory
  const size = inv.size

  // tier → tokens earned this submission (for the give + the report)
  const earned = { 1: 0, 2: 0, 3: 0 }
  // itemId → { name, consumed, tokens } for the per-resource report lines
  const lines = []
  let anyEligible = false
  let anyCapped = false

  // Iterate each conversion entry; sum the matching item across all slots,
  // then consume whole conversion units up to the remaining cap.
  for (const itemId in CODEX_CONVERSIONS) {
    const conv = CODEX_CONVERSIONS[itemId]

    // Count this item across the whole inventory.
    let available = 0
    for (let i = 0; i < size; i++) {
      const stack = inv.getStackInSlot(i)
      if (!stack.isEmpty() && stack.id === itemId) available += stack.count
    }
    if (available <= 0) continue
    anyEligible = true

    // Remaining cap for this resource.
    const already = pdata.getInt(codexCapKey(itemId))
    const remainingCap = conv.cap - already
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
    pdata.putInt(codexCapKey(itemId), already + consumed)
    earned[conv.tier] += tokens

    let dispName = itemId
    try { dispName = Item.of(itemId).hoverName.string } catch (_) {}
    lines.push({ name: dispName, consumed: consumed, tokens: tokens, tier: conv.tier })
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

  player.tell(Text.gold('═══ Codex Submission ═══'))
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
// COMMAND REGISTRATION — /icraft codex submit | balance
// Merges into the existing /icraft literal (despawn, mana_debug, …) — Brigadier
// unions literals across commandRegistry calls.
// =============================================================================
ServerEvents.commandRegistry(event => {
  const { commands: Commands } = event

  event.register(
    Commands.literal('icraft')
      .then(Commands.literal('codex')
        .then(Commands.literal('submit')
          .requires(src => src.hasPermission(0))
          .executes(ctx => {
            let sp
            try { sp = ctx.source.getPlayerOrException() } catch (e) {
              ctx.source.sendFailure(Text.of('Must be run as a player'))
              return 0
            }
            try { return codexSubmit(sp) } catch (e) {
              console.warn('[Codex] submit threw for ' + sp.username + ': ' + e)
              sp.tell(Text.red('[Codex] submit failed: ' + e))
              return 0
            }
          })
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
      )
  )
})

console.log('[IridescentCraft] Codex progression engine loaded (/icraft codex submit | balance)')
console.log('  Thresholds: T1→T2 500 | T2→T3 1000 | T3→T4 2000 (T4 terminal = Ender Dragon)')
console.log('  Engineering conversion entries: ' + Object.keys(CODEX_CONVERSIONS).length)
