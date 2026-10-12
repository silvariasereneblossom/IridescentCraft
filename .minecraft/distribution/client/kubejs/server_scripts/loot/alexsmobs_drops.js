// =============================================================================
// ALEX'S MOBS DROPS — Phase 6F-2 full pass
// =============================================================================
// Alex's Mobs ships ~93 entities across all overworld biomes + nether + end.
// Vanilla drop tables are mostly fine, but a few items are out-of-tier and
// some entities lack thematic synergy with our magic systems.
//
// Tier model (audit findings):
//   T1 — passive overworld (birds, raccoons, etc.) — vanilla fine, no hook
//   T2 — jungle/swamp/mountain dangerous (crocodile, anaconda, snow_leopard) — small synergy
//   T3 — nether/underground/deep water (bone_serpent, murmur, straddler, etc.)
//   T4 — end + sky (void_worm, mimicube, enderiophage, laviathan)
//
// Critical fix: mimicream (item duplication) is a vanilla T4-mob drop at ~50%
// per the loot table's count{min:-1,max:1} math. That's an economy break at
// any tier. Stripped + re-injected at 1% per user directive.
//
// Magic-class power curve is uncapped late-game (memory:
// feedback_mage_power_curve.md), so high-tier synergy drops (epic/legendary
// ink, T3+ runes) on T3-T4 mobs are intentional.
// =============================================================================

LootJS.modifiers(icraft.guard('loot/alexsmobs_drops', 'LootJS.modifiers', event => {

  // ===== T4 — End-tier =====

  // ---- Mimicube — STRIP mimicream from natural drops, re-inject at 1% ----
  // mimicream enables item duplication; vanilla rate (~50%) breaks economy.
  global.icraftEntityMod(event, 'alexsmobs:mimicube')
    .removeLoot('alexsmobs:mimicream')
    .addLoot(LootEntry.of('alexsmobs:mimicream').when(c => c.randomChance(0.01)))
    .addLoot(LootEntry.of('irons_spellbooks:legendary_ink').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:epic_ink').when(c => c.randomChance(0.25)))

  // ---- Void Worm — T4 end boss, add magic synergy on top of vanilla eye/mandible ----
  global.icraftEntityMod(event, 'alexsmobs:void_worm')
    .addLoot(LootEntry.of('irons_spellbooks:legendary_ink').limitCount([1, 2]).when(c => c.randomChance(0.50)))
    .addLoot(LootEntry.of('irons_spellbooks:ender_rune').when(c => c.randomChance(0.40)))
    .addLoot(LootEntry.of('irons_spellbooks:ender_upgrade_orb').when(c => c.randomChance(0.15)))

  // ---- Enderiophage — T4 end ----
  global.icraftEntityMod(event, 'alexsmobs:enderiophage')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.20)))

  // ---- Laviathan — T4 sky/nether ----
  global.icraftEntityMod(event, 'alexsmobs:laviathan')
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.15)))

  // ===== T3 — Nether / Underground / Deep =====

  // ---- Bone Serpent — nether snake mob, magic synergy ----
  global.icraftEntityMod(event, 'alexsmobs:bone_serpent')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.10)))

  // ---- Straddler — nether basalt mob ----
  global.icraftEntityMod(event, 'alexsmobs:straddler')
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.20)))

  // ---- Soul Vulture — nether soul sand valley ----
  global.icraftEntityMod(event, 'alexsmobs:soul_vulture')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.15)))

  // ---- Crimson Mosquito (Warped Mosco) — nether ----
  global.icraftEntityMod(event, 'alexsmobs:crimson_mosquito')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.10)))
  global.icraftEntityMod(event, 'alexsmobs:warped_mosco')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.20)))

  // ---- Murmur — Deeper Darker / underground horror ----
  global.icraftEntityMod(event, 'alexsmobs:murmur')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.25)))
    .addLoot(LootEntry.of('irons_spellbooks:ender_rune').when(c => c.randomChance(0.15)))

  // ---- Hammerhead Shark — deep ocean T3 ----
  global.icraftEntityMod(event, 'alexsmobs:hammerhead_shark')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.10)))

  // ---- Frostmoth — cold T3 ----
  global.icraftEntityMod(event, 'alexsmobs:froststalker')  // was 'frostmoth' (no such entity -> pig) 2026-06-06
    .addLoot(LootEntry.of('irons_spellbooks:ice_rune').when(c => c.randomChance(0.10)))

  // ---- Cosmaw — sky T3 ----
  global.icraftEntityMod(event, 'alexsmobs:cosmaw')
    .addLoot(LootEntry.of('irons_spellbooks:lightning_rune').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.10)))

  // ===== T2 — Dangerous overworld biomes =====

  // ---- Crocodile — swamp T2 danger ----
  global.icraftEntityMod(event, 'alexsmobs:crocodile')
    .addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.15)))

  // ---- Komodo Dragon — desert/savanna T2 ----
  global.icraftEntityMod(event, 'alexsmobs:komodo_dragon')
    .addLoot(LootEntry.of('irons_spellbooks:nature_rune').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.15)))

  // ---- Anaconda — jungle T2 ----
  global.icraftEntityMod(event, 'alexsmobs:anaconda')
    .addLoot(LootEntry.of('irons_spellbooks:nature_rune').when(c => c.randomChance(0.08)))

  // ---- Caiman — swamp/jungle T2 ----
  global.icraftEntityMod(event, 'alexsmobs:caiman')
    .addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.10)))

  // ---- Snow Leopard — mountain peaks T2 ----
  global.icraftEntityMod(event, 'alexsmobs:snow_leopard')
    .addLoot(LootEntry.of('irons_spellbooks:ice_rune').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.15)))

  // ---- Dropbear — eucalyptus/desert T2 ambush ----
  global.icraftEntityMod(event, 'alexsmobs:dropbear')
    .addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.10)))

  // ---- Leafcutter Ant Queen — jungle T2 mini-boss ----
  // [2026-06-06] was 'leafcutter_ant_queen' - NOT an entity in pinned alexsmobs
  // (queen is a caste of leafcutter_ant) -> unresolvable id defaulted to PIG
  // (the Nature Rune pig leak). Re-homed to the real ant at sharply reduced
  // rates (common mob vs rare queen kill) - PROVISIONAL, tune or remove.
  global.icraftEntityMod(event, 'alexsmobs:leafcutter_ant')
    .addLoot(LootEntry.of('irons_spellbooks:nature_rune').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.02)))

  // ---- Cachalot Whale — deep ocean T2 ----
  global.icraftEntityMod(event, 'alexsmobs:cachalot_whale')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.15)))

  console.log('[alexsmobs_drops] registered 21 entity loot modifiers (1 strip, 20 synergy adds)')
}))
