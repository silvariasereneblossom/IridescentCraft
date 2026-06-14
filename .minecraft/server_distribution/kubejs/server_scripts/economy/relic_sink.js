// =============================================================================
// RELIC SURPLUS SINK -- relic/curio -> Relic Essence (Phase A)
// File: kubejs/server_scripts/economy/relic_sink.js  (mirrored to all 3 distros)
//
// Design: IridescentCraft-internal/design/draft-relic-sink-trading-2026-06-12.md
//   (operator decisions LOCKED 2026-06-14: sink = BOTH submit-sweep + Broker buys,
//    SAME table; currency = NEW iridescent_relics:relic_essence).
//
// WHAT THIS IS: the codex-submit pattern (gates/codex_progression_engine.js)
// re-pointed at the seven artifact/curio mods. A `/icraft relics submit` sweep
// scans the player's inventory, converts eligible relics/curios to Relic Essence
// at data-driven values (boss-signature relics >> common artifacts), respects a
// per-resource LIFETIME backstop cap (no farmable infinite faucet -- guardrail),
// and reports. The SAME value table (relicEssenceValue) is consumed by the Relic
// Broker's buy trades in Phase B1 -- one source of truth.
//
// MEMBERSHIP is namespace-broad-minus-deny, NOT a fixed item list: the artifact
// mods mix genuine curios with tools/weapons/crafting-mats/loot-boxes, so we sink
// every item in the broad namespaces EXCEPT an explicit deny-list of non-curios
// (audited from TesterLogs/Item Audit/all_items.tsv, 2026-06-14). The sweep
// classifies at runtime (string namespace check) so it does NOT depend on the
// #icraft:relic_sinkable tag resolving -- the tag (built below) is for the
// Broker/Heracles UI. relic_essence itself is NEVER sinkable (no currency->currency).
//
// RELOAD-SAFETY: registers ONLY ServerEvents (commandRegistry + tags) -- no item
// creation (the currency is a JAR item), no raw Forge bus listener. (Same #60
// rationale as the codex engine.)
//
// ALL VALUES PROVISIONAL -> flagged for the operator's feel pass.
// =============================================================================

// ---- Currency ----
const RELIC_ESSENCE_ITEM = 'iridescent_relics:relic_essence'

// ---- Per-namespace DEFAULT essence value (the bulk rate for a mod's curios) ---
// Broad artifact/curio namespaces. Any item in these is sinkable at the default
// UNLESS deny-listed (non-curios) or override-listed (standouts) below.
//   artifacts            -- vanilla-flavour QoL curios (mostly RARE)
//   moreartifacts        -- a notch stronger / more varied
//   celestial_artifacts  -- large themed curio roster
//   rpgseteffects        -- "Class Artifacts": RARE relics (default) + EPIC sets (override)
//   relics               -- the Relics framework (leveled, stronger)
const RELIC_SINK_NS_VALUE = {
  'artifacts':            20,
  'moreartifacts':        25,
  'celestial_artifacts':  30,
  'rpgseteffects':        40,
  'relics':               50,
}

// ---- ALLOW-list: curios from otherwise-non-curio namespaces -------------------
// "Apothic Curios" (Apotheosis) is overwhelmingly non-curios (enchant shelves,
// tomes, sigils, gems, tables) -- only these two are worn curios, so they are
// added individually rather than via the whole namespace.
const RELIC_SINK_ALLOW = {
  'apotheosis:potion_charm': 25,
  'apotheosis:lucky_foot':   15,
}

// ---- Per-item OVERRIDES (above the namespace default) -------------------------
// Boss-signature relics (iridescent_relics) -- tier-scaled, deliberately >> the
// common-artifact rate (a dupe boss relic is the highest-value dead-loot moment).
const RELIC_SINK_VALUE = {
  'iridescent_relics:frostmaw_heart':     150,  // T1 boss (mowziesmobs:frostmaw)
  'iridescent_relics:ironheart_cog':      150,  // T1 boss (ferrous_wroughtnaut)
  'iridescent_relics:remnant_relic':      200,  // cursed_pyramid (Ancient Remnant)
  'iridescent_relics:sunfeather_charm':   250,  // T2 boss (aether:sun_spirit)
  'iridescent_relics:phylactery_shard':   250,  // T2 boss (twilightforest:lich)
  'iridescent_relics:leviathans_pearl':   400,  // T3 boss (cataclysm:the_leviathan)
  'iridescent_relics:cursed_sigil_pride': 400,  // T3 capstone (cardinal_sins:lucifer)
  'iridescent_relics:dragons_eye':        500,  // T4 finale (ender_dragon)

  // More Artifacts EPIC standouts -- worth above the moreartifacts default (25).
  'moreartifacts:ankh_charm':       60,
  'moreartifacts:ankh_shield':      60,
  'moreartifacts:melody_plushie':   60,
  'moreartifacts:hero_shield':      60,
  'moreartifacts:lucky_emerald_ring': 60,
  'moreartifacts:tainted_mirror':   60,
  'moreartifacts:vanir_mask':       60,
  'moreartifacts:ender_dragon_claw': 60,
  'moreartifacts:dragon_eye':       60,
  'moreartifacts:enderian_treads':  60,
  'moreartifacts:sculk_treads':     60,
}

// Class Artifacts (rpgseteffects) EPIC set-pieces -- drops-only, strong; base vs
// awakening (the T3+ upgrade). Seeded from the known set list (the list IS the
// data) so the table stays readable.
;['altharion', 'blood_fury', 'shadow_hunter', 'sanctum', 'hellbrand', 'wolfheart',
  'moonpiercer', 'stormpiercer', 'ignisphere', 'hexweaver', 'vaelkhor', 'blade_dancer',
  'chronorend', 'phoenix'].forEach(function (a) {
  RELIC_SINK_VALUE['rpgseteffects:' + a + '_artifact'] = 100
  RELIC_SINK_VALUE['rpgseteffects:' + a + '_awakening_artifact'] = 140
})

// ---- DENY: non-curio items that live inside the broad namespaces --------------
// Spawn eggs, tools, weapons, crafting reagents, templates, consumables, cores,
// pouches, blocks -- must NOT be convertible to essence. Audited 2026-06-14.
const RELIC_SINK_DENY_LIST = [
  // artifacts
  'artifacts:mimic_spawn_egg',
  // moreartifacts -- templates, consumables, upgrade reagent "stones"
  'moreartifacts:artifact_upgrade_smithing_template',
  'moreartifacts:recall_potion', 'moreartifacts:shadow_dust',
  'moreartifacts:venom_stone', 'moreartifacts:decay_stone',
  'moreartifacts:fire_stone', 'moreartifacts:ice_stone',
  // celestial_artifacts -- mats, tools, a weapon, etchings, plates, an active scepter
  'celestial_artifacts:the_end_dust', 'celestial_artifacts:nebula_cube',
  'celestial_artifacts:nether_fire', 'celestial_artifacts:holy_sword',
  'celestial_artifacts:earth_axe', 'celestial_artifacts:earth_pickaxe',
  'celestial_artifacts:earth_shovel', 'celestial_artifacts:earth_hoe',
  'celestial_artifacts:chaotic_etching', 'celestial_artifacts:origin_etching',
  'celestial_artifacts:life_etching', 'celestial_artifacts:truth_etching',
  'celestial_artifacts:desire_etching', 'celestial_artifacts:nihility_etching',
  'celestial_artifacts:end_etching', 'celestial_artifacts:purified_powder',
  'celestial_artifacts:copper_reinforce_plate', 'celestial_artifacts:amethyst_reinforce_plate',
  'celestial_artifacts:ender_jump_scepter',
  // rpgseteffects -- crafting cores / pouches / leather (drops-only material side)
  'rpgseteffects:magic_leather', 'rpgseteffects:artifact_piece_pouch',
  'rpgseteffects:set_core', 'rpgseteffects:fragment_core',
  // relics framework -- the research block + the relic XP bottle + ammo
  'relics:researching_table', 'relics:relic_experience_bottle', 'relics:solid_snowball',
]
const RELIC_SINK_DENY = new Set(RELIC_SINK_DENY_LIST)

// ---- Per-resource LIFETIME cap (item units) -- anti-farm backstop -------------
// Bounds the degenerate case (a single farmable relic source). Relics are loot-
// gated upstream, so this rarely bites; it just removes the infinite tail.
const RELIC_SINK_CAP_DEFAULT = 256
const RELIC_SINK_CAP_OVERRIDE = {
  // boss-signature relics: a low backstop (you cannot legitimately amass many).
  'iridescent_relics:frostmaw_heart':     64, 'iridescent_relics:ironheart_cog':      64,
  'iridescent_relics:remnant_relic':      64, 'iridescent_relics:sunfeather_charm':   64,
  'iridescent_relics:phylactery_shard':   64, 'iridescent_relics:leviathans_pearl':   64,
  'iridescent_relics:cursed_sigil_pride': 64, 'iridescent_relics:dragons_eye':        64,
}

// =============================================================================
// VALUE RESOLVER -- essence per item, or 0 if not sinkable. The single source of
// truth shared by the sweep here AND the Relic Broker buy trades (Phase B1).
// =============================================================================
function relicEssenceValue(itemId) {
  if (RELIC_SINK_DENY.has(itemId)) return 0
  if (RELIC_SINK_VALUE[itemId] !== undefined) return RELIC_SINK_VALUE[itemId]
  if (RELIC_SINK_ALLOW[itemId] !== undefined) return RELIC_SINK_ALLOW[itemId]
  var ns = itemId.split(':')[0]
  if (RELIC_SINK_NS_VALUE[ns] !== undefined) return RELIC_SINK_NS_VALUE[ns]
  return 0
}

function relicSinkCap(itemId) {
  return (RELIC_SINK_CAP_OVERRIDE[itemId] !== undefined)
    ? RELIC_SINK_CAP_OVERRIDE[itemId] : RELIC_SINK_CAP_DEFAULT
}

// Shared with the Relic Broker (Phase B1) buy trades -- the SAME conversion table, one
// source of truth (operator decision 1). `global` persists across server_scripts and
// reloads; the Broker reads it at runtime (its handler fires after all scripts load, so
// load order between this file and relic_broker.js does not matter).
global.icraftRelicEssenceValue = relicEssenceValue

// persistentData key for a relic's lifetime-submitted count (item units).
function relicCapKey(itemId) {
  return 'icraft_relicsink_' + itemId.replace(/[:\/]/g, '_')
}

// =============================================================================
// SCAN -- group the player's inventory into { itemId -> {available, value, cap,
// already, sinkableNow} } for the sinkable items only. Shared by preview+execute.
// =============================================================================
function relicScan(player) {
  const pdata = player.persistentData
  const inv = player.inventory
  const size = inv.size

  const found = {}   // itemId -> aggregate
  for (let i = 0; i < size; i++) {
    const stack = inv.getStackInSlot(i)
    if (stack.isEmpty()) continue
    const id = stack.id
    if (id === RELIC_ESSENCE_ITEM) continue            // never sink the currency
    const value = relicEssenceValue(id)
    if (value <= 0) continue
    if (!found[id]) {
      const cap = relicSinkCap(id)
      const already = pdata.getInt(relicCapKey(id))
      found[id] = { available: 0, value: value, cap: cap, already: already,
                    remainingCap: Math.max(0, cap - already) }
    }
    found[id].available += stack.count
  }
  // sinkableNow = min(available, remainingCap)
  for (const id in found) {
    const f = found[id]
    f.sinkableNow = Math.min(f.available, f.remainingCap)
  }
  return found
}

function relicDisplayName(itemId) {
  let n = itemId
  try { n = Item.of(itemId).hoverName.string } catch (_) {}
  return n
}

// =============================================================================
// SUBMIT -- preview (no `confirm`) or execute (with `confirm`). Preview exists
// because relic loss is IRREVERSIBLE: the sweep is greedy over inventory, so we
// show exactly what will be consumed and require an explicit confirm.
// =============================================================================
function relicSubmit(player, confirm) {
  const found = relicScan(player)
  const ids = Object.keys(found)

  if (ids.length === 0) {
    player.tell(Text.gold('[Relics] ').append(Text.gray('No surplus relics or curios in your inventory to convert. (Worn relics are safe -- only your backpack is scanned.)')))
    return 0
  }

  // Build report lines + totals.
  let totalEssence = 0, totalItems = 0, anyCapped = false
  const lines = []
  ids.forEach(id => {
    const f = found[id]
    if (f.sinkableNow <= 0) { anyCapped = true; return }
    const essence = f.sinkableNow * f.value
    totalEssence += essence
    totalItems += f.sinkableNow
    lines.push({ id: id, name: relicDisplayName(id), n: f.sinkableNow, essence: essence,
                 cappedSome: f.sinkableNow < f.available })
  })

  if (totalEssence <= 0) {
    player.tell(Text.gold('[Relics] ').append(Text.gray('Every eligible relic you carry is already at its lifetime conversion cap.')))
    return 0
  }

  // ---- PREVIEW ----
  if (!confirm) {
    player.tell(Text.gold('═══ Relic Sink — preview ═══'))
    lines.forEach(l => {
      let line = Text.gray('  ' + l.n + '× ').append(Text.white(l.name))
        .append(Text.gray(' → ')).append(Text.aqua('+' + l.essence + ' essence'))
      if (l.cappedSome) line = line.append(Text.gray(' (cap-limited)'))
      player.tell(line)
    })
    player.tell(Text.yellow('  Total: ').append(Text.aqua('+' + totalEssence + ' Relic Essence'))
      .append(Text.gray(' for ' + totalItems + ' item' + (totalItems === 1 ? '' : 's'))))
    player.tell(Text.gold('  ⚠ This destroys the relics. Run ').append(Text.white('/icraft relics submit confirm')).append(Text.gold(' to convert.')))
    if (anyCapped) player.tell(Text.gray('  (Some carried relics are at their lifetime cap and were skipped.)'))
    player.tell(Text.gold('════════════════════════════'))
    return 1
  }

  // ---- EXECUTE ----
  const pdata = player.persistentData
  const inv = player.inventory
  const size = inv.size
  lines.forEach(l => {
    let toRemove = l.n
    for (let i = 0; i < size && toRemove > 0; i++) {
      const stack = inv.getStackInSlot(i)
      if (!stack.isEmpty() && stack.id === l.id) {
        const take = Math.min(stack.count, toRemove)
        stack.count = stack.count - take
        toRemove -= take
        if (stack.count <= 0) inv.setStackInSlot(i, Item.empty)
      }
    }
    // bank lifetime cap progress
    const key = relicCapKey(l.id)
    pdata.putInt(key, pdata.getInt(key) + l.n)
  })

  player.give(Item.of(RELIC_ESSENCE_ITEM, totalEssence))

  player.tell(Text.gold('═══ Relic Sink ═══'))
  lines.forEach(l => {
    player.tell(Text.gray('  ' + l.n + '× ').append(Text.white(l.name))
      .append(Text.gray(' → ')).append(Text.aqua('+' + l.essence + ' essence')))
  })
  player.tell(Text.yellow('  Banked: ').append(Text.aqua('+' + totalEssence + ' Relic Essence')))
  player.tell(Text.gold('══════════════════'))
  player.server.runCommandSilent('playsound minecraft:entity.experience_orb.pickup player ' + player.username)
  console.log('[IridescentCraft][RelicSink] ' + player.username + ' converted ' + totalItems + ' relic(s) -> ' + totalEssence + ' essence')
  return totalEssence
}

// =============================================================================
// BALANCE -- held essence + a preview of sinkable relics carried.
// =============================================================================
function relicBalance(player) {
  const inv = player.inventory
  const size = inv.size
  let held = 0
  for (let i = 0; i < size; i++) {
    const stack = inv.getStackInSlot(i)
    if (!stack.isEmpty() && stack.id === RELIC_ESSENCE_ITEM) held += stack.count
  }

  const found = relicScan(player)
  const ids = Object.keys(found)

  player.tell(Text.gold('═══ Relic Essence ═══'))
  player.tell(Text.gray('  Held: ').append(Text.aqua('' + held + ' essence')))
  if (ids.length === 0) {
    player.tell(Text.gray('  No sinkable relics in your backpack right now.'))
  } else {
    let preview = 0
    ids.forEach(id => { preview += found[id].sinkableNow * found[id].value })
    player.tell(Text.gray('  Carried surplus would yield ').append(Text.aqua('+' + preview + ' essence'))
      .append(Text.gray('  →  ')).append(Text.white('/icraft relics submit')))
  }
  player.tell(Text.gold('═════════════════════'))
  return 1
}

// =============================================================================
// COMMAND REGISTRATION -- /icraft relics submit [confirm] | balance
// Merges into the existing /icraft literal (Brigadier unions literals across
// commandRegistry calls -- see the codex engine).
// =============================================================================
function relicCmd(ctx, fn, arg) {
  let sp
  try { sp = ctx.source.getPlayerOrException() } catch (e) {
    ctx.source.sendFailure(Text.of('Must be run as a player')); return 0
  }
  try { return fn(sp, arg) } catch (e) {
    console.warn('[RelicSink] command threw for ' + sp.username + ': ' + e)
    sp.tell(Text.red('[Relics] command failed: ' + e)); return 0
  }
}

ServerEvents.commandRegistry(event => {
  const { commands: Commands } = event
  event.register(
    Commands.literal('icraft')
      .then(Commands.literal('relics')
        .then(Commands.literal('balance')
          .requires(src => src.hasPermission(0))
          .executes(ctx => relicCmd(ctx, relicBalance, null)))
        .then(Commands.literal('submit')
          .requires(src => src.hasPermission(0))
          .executes(ctx => relicCmd(ctx, relicSubmit, false))        // preview
          .then(Commands.literal('confirm')
            .requires(src => src.hasPermission(0))
            .executes(ctx => relicCmd(ctx, relicSubmit, true))))      // execute
      )
  )
})

// ---- #icraft:relic_sinkable item tag (for the Broker / Heracles UI) ----------
// Broad namespaces via @modid, plus the explicit overrides + Apothic allow-list,
// minus the non-curio deny-list. The SWEEP above does NOT depend on this tag
// (it classifies by namespace at runtime) -- the tag is a UI convenience.
ServerEvents.tags('item', event => {
  // RHINO-SAFETY: var (not const/let) -- tags re-fires on every rebuild; a
  // closure-local const/let throws "redeclaration of var" on the 2nd firing.
  var TAG = 'icraft:relic_sinkable'
  var added = 0
  for (var ns in RELIC_SINK_NS_VALUE) {
    try { event.add(TAG, '@' + ns); added++ } catch (e) {}
  }
  for (var idv in RELIC_SINK_VALUE) { try { event.add(TAG, idv) } catch (e) {} }
  for (var ida in RELIC_SINK_ALLOW) { try { event.add(TAG, ida) } catch (e) {} }
  // indexed loop over the array (re-fire-safe; avoids Set.forEach in a tags closure)
  for (var di = 0; di < RELIC_SINK_DENY_LIST.length; di++) {
    try { event.remove(TAG, RELIC_SINK_DENY_LIST[di]) } catch (e) {}
  }
  console.log('[IridescentCraft] #icraft:relic_sinkable built ('
    + added + ' broad namespaces + ' + Object.keys(RELIC_SINK_VALUE).length
    + ' overrides + ' + Object.keys(RELIC_SINK_ALLOW).length + ' allow, minus '
    + RELIC_SINK_DENY.size + ' deny)')
})

console.log('[IridescentCraft] Relic sink loaded (/icraft relics submit [confirm] | balance)')
console.log('  Currency: ' + RELIC_ESSENCE_ITEM + ' · broad namespaces: ' + Object.keys(RELIC_SINK_NS_VALUE).join(', '))
console.log('  Boss-signature + override values: ' + Object.keys(RELIC_SINK_VALUE).length + ' · deny-list: ' + RELIC_SINK_DENY.size + ' · ALL VALUES PROVISIONAL')
