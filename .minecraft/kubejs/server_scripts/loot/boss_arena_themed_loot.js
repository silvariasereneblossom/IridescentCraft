// =============================================================================
// BOSS-ARENA THEMED LOOT — icraft #58 Piece B §3 (the DEFERRED deep enrichment)
// =============================================================================
// Companion to boss_arena_material_tease.js (the §0 material-tease core). That
// file seeds 0-2 of the boss's signature material at low weight; THIS file is
// the deeper §3 reward-theme enrichment that was deliberately deferred: tier-
// fair, arena-themed CONSUMABLE/UPGRADE rewards layered onto the sparse magic
// arenas, plus a banned-item scrub on the overworld tables that ship diamonds.
//
// SCOPE (jar-verified 2026-06-03 against the live PrismLauncher instance jars).
// The §3 "rich vs sparse" audit held up under a jar pass EXCEPT two surprises,
// so this file is deliberately FOCUSED rather than spraying all ~38 arenas:
//
//   * IRON'S SPELLBOOKS (T3 ×5) is the genuinely-sparse magic mod the task
//     named. Its arena chests are thin (scroll + poor_ink + basic_curios) while
//     the BOSSES already drop the signature trophies/books (blood_staff,
//     keeper_flamberge, evoker/blaze/necronomicon books, magehunter — see
//     iss_boss_drops.js + iss_boss_first_kill.js). So the chests get the
//     crafting/upgrade ECONOMY (ink tiers, element runes, upgrade orbs, arcane
//     essence/salvage, a generic non-first-kill spellbook, slot upgrades), each
//     themed to the arena's element. This is the established cross-mod reward
//     vocabulary (twilight_boss_drops.js already hands ISS ink/runes/orbs out).
//
//   * CATACLYSM frosted_prison (Scylla, T3, OVERWORLD) ships a treasure chest
//     that is mostly raw diamond + diamond gear (policy violation). We scrub the
//     diamonds and backfill with a frost-magic cache so the chest stays worth
//     opening after the strip.
//
// INTENTIONALLY NOT TOUCHED (documented so a reader doesn't think it was missed):
//   - Terramity arenas. The §3 doc guessed "T1 + infested_lab/cathedral = thin".
//     Jar reality: court_of_gnomes / fairy_fountain / chthonic_cathedral /
//     prismatic_pond / mausoleum have NO chest loot table at all (boss-only);
//     ancient_outcrop already has a full icraft override + tease; infested_lab
//     is RICH (8-16 rolls of terramity loot) and already teased. Nothing to add.
//   - Twilight Forest / Aether / Blue Skies / Undergarden / Deeper Darker /
//     Deep Aether: "rich already" per §3 — base chest + the material tease +
//     the per-boss drops cover them. Light touch = no touch here.
//
// TWO §3 REWARD TYPES DELIBERATELY OMITTED (flagged to planning, NOT forgotten):
//   1. "Simply Swords uniques at low %" — loot_overhaul.js §1/§8 already assigns
//      EVERY arena boss its own themed SS unique as a BOSS ENTITY drop, marked
//      "boss-exclusive, never from chests". The §3 SS-unique reward is therefore
//      ALREADY delivered via the kill (Naga→tempest, Lich→soulrender, Ignis→
//      molten_edge, Ender Guardian→arcanethyst, ...). Adding the same uniques to
//      chests would duplicate them AND break that explicit design principle.
//   2. "Blue Skies runic_arc" — loot_overhaul.js:144 makes runic_arc a 5% BOSS-
//      GATED drop (its craft recipe was stripped). Seeding it into a chest would
//      undercut the boss gate. The OTHER blue_skies arcs are left to their own
//      economy. So Blue Skies gets no chest add here.
//
// MECHANISM: LootJS inject (additive .addLoot + subtractive .removeLoot), the
// pack idiom (loot_overhaul.js §3-§7 scrubs banned items the same way across
// dozens of vanilla/modded tables, incl. regex modifiers). NOT JSON overrides —
// inject survives mod updates, won't fight Apoth/Marquee re-roll layers, and
// avoids reproducing whole mod tables. (The §3 doc suggested overrides, but the
// pack's own removeLoot convention is strictly better for a banned-item strip.)
//
// RATES: chest band (0.05-0.22), below the boss-drop band (twilight_boss_drops
// runs 0.20-0.70) because chests are repeatable and unguarded. Tokens are only
// added to arenas the tease did NOT already token (catacombs / citadel /
// mountain_tower); pyromancer / evoker_fort / frosted_prison already get a T3
// token from boss_arena_material_tease.js — not doubled here.
// =============================================================================

LootJS.modifiers(event => {

  // RHINO-SAFETY: var (not const) — closure-local in a LootJS.modifiers callback.
  var T3 = 'icraft:progression_token_t3'

  // ===========================================================================
  // BANNED-ITEM SCRUB — overworld arena tables only (policy: no diamond / gear /
  // gunpowder reward in OVERWORLD structures; Nether/own-dim tables are exempt).
  // ===========================================================================

  var DIAMONDS = [
    'minecraft:diamond', 'minecraft:diamond_block',
    'minecraft:diamond_sword', 'minecraft:diamond_pickaxe', 'minecraft:diamond_axe',
    'minecraft:diamond_shovel', 'minecraft:diamond_hoe',
    'minecraft:diamond_helmet', 'minecraft:diamond_chestplate',
    'minecraft:diamond_leggings', 'minecraft:diamond_boots',
    'minecraft:diamond_horse_armor',
  ]
  var scrubDiamonds = mod => {
    var m = event.addLootTableModifier(mod)
    DIAMONDS.forEach(d => m.removeLoot(d))
    return m
  }

  // ISS Catacombs (Dead King, overworld) — diamonds in coffin/crypt/wall/trough.
  scrubDiamonds(/^irons_spellbooks:chests\/catacombs\/.*/)
  // ISS Evoker Fort (Archevoker, overworld) — diamond in the root table.
  scrubDiamonds('irons_spellbooks:chests/evoker_fort')
  // ISS Pyromancer Tower (Echo of Tyros, overworld) — gunpowder in burnt_chest.
  event.addLootTableModifier('irons_spellbooks:chests/pyromancer_tower/burnt_chest')
    .removeLoot('minecraft:gunpowder')
  // Cataclysm Frosted Prison (Scylla, overworld) — heavy diamond-gear treasure.
  scrubDiamonds('cataclysm:chests/frosted_prison_treasure')

  // ===========================================================================
  // THEMED ENRICHMENT — Iron's Spellbooks arenas (all T3). Element-themed
  // consumable/upgrade economy; boss trophies stay boss-gated (not added here).
  // ===========================================================================

  // ---- Catacombs (Dead King) — blood / necro theme ----
  event.addLootTableModifier('irons_spellbooks:chests/catacombs/coffin_loot')
    .addLoot(LootEntry.of('irons_spellbooks:blood_rune').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:blood_upgrade_orb').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([1, 2]).when(c => c.randomChance(0.16)))
    .addLoot(LootEntry.of('irons_spellbooks:arcane_essence').limitCount([1, 3]).when(c => c.randomChance(0.25)))
    .addLoot(LootEntry.of('irons_spellbooks:gold_spell_book').when(c => c.randomChance(0.07)))
    .addLoot(LootEntry.of(T3).when(c => c.randomChance(0.05)))
  event.addLootTableModifier('irons_spellbooks:chests/catacombs/crypt_loot')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').limitCount([1, 2]).when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:blank_rune').when(c => c.randomChance(0.18)))

  // ---- Pyromancer Tower (Echo of Tyros) — fire theme ----
  // (cinder_essence + T3 token already on pyromancer_supplies via the tease)
  event.addLootTableModifier('irons_spellbooks:chests/pyromancer_tower/pyromancer_supplies')
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.22)))
    .addLoot(LootEntry.of('irons_spellbooks:fire_upgrade_orb').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').limitCount([1, 2]).when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.10)))

  // ---- Citadel (Ancient Knight) — ender / holy theme (NETHER, no scrub) ----
  // rampart_supplies is the thin chest; citadel_vault is already rich.
  event.addLootTableModifier('irons_spellbooks:chests/citadel/rampart_supplies')
    .addLoot(LootEntry.of('irons_spellbooks:holy_rune').when(c => c.randomChance(0.18)))
    .addLoot(LootEntry.of('irons_spellbooks:ender_rune').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('irons_spellbooks:holy_upgrade_orb').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([1, 2]).when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('irons_spellbooks:arcane_salvage').limitCount([1, 2]).when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of(T3).when(c => c.randomChance(0.05)))

  // ---- Evoker Fort (Archevoker) — evocation / arcane theme ----
  // (arcane_essence + T3 token already on the root table via the tease)
  event.addLootTableModifier('irons_spellbooks:chests/evoker_fort')
    .addLoot(LootEntry.of('irons_spellbooks:evocation_rune').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:evocation_upgrade_orb').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').limitCount([1, 2]).when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:lesser_spell_slot_upgrade').when(c => c.randomChance(0.08)))

  // ---- Mountain Tower (Magehunter) — ice / arcane theme ----
  event.addLootTableModifier('irons_spellbooks:chests/mountain_tower/mountain_tower')
    .addLoot(LootEntry.of('irons_spellbooks:ice_rune').when(c => c.randomChance(0.22)))
    .addLoot(LootEntry.of('irons_spellbooks:ice_upgrade_orb').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').limitCount([1, 2]).when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:arcane_essence').limitCount([1, 2]).when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of(T3).when(c => c.randomChance(0.05)))

  // ===========================================================================
  // CATACLYSM frosted_prison (Scylla, T3, overworld) — frost-magic backfill for
  // the scrubbed diamond treasure. (lacrima + T3 token already via the tease.)
  // ===========================================================================
  event.addLootTableModifier('cataclysm:chests/frosted_prison_treasure')
    .addLoot(LootEntry.of('irons_spellbooks:ice_rune').when(c => c.randomChance(0.18)))
    .addLoot(LootEntry.of('irons_spellbooks:ice_upgrade_orb').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([1, 2]).when(c => c.randomChance(0.12)))

  console.log('[boss_arena_themed_loot] icraft #58 Piece B §3: enriched 5 ISS arenas + frosted_prison; scrubbed overworld diamonds/gunpowder from ISS catacombs/evoker_fort/pyromancer + cataclysm frosted_prison')
})
