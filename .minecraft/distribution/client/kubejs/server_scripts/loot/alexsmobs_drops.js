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

LootJS.modifiers(event => {

  // ===== T4 — End-tier =====

  // ---- Mimicube — STRIP mimicream from natural drops, re-inject at 1% ----
  // mimicream enables item duplication; vanilla rate (~50%) breaks economy.
  event
    .addEntityLootModifier('alexsmobs:mimicube')
    .removeLoot('alexsmobs:mimicream')
    .addLoot(LootEntry.of('alexsmobs:mimicream').when(c => c.randomChance(0.01)))
    .addLoot(LootEntry.of('irons_spellbooks:legendary_ink').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:epic_ink').when(c => c.randomChance(0.25)))

  // ---- Void Worm — T4 end boss, add magic synergy on top of vanilla eye/mandible ----
  event
    .addEntityLootModifier('alexsmobs:void_worm')
    .addLoot(LootEntry.of('irons_spellbooks:legendary_ink').limitCount([1, 2]).when(c => c.randomChance(0.50)))
    .addLoot(LootEntry.of('irons_spellbooks:ender_rune').when(c => c.randomChance(0.40)))
    .addLoot(LootEntry.of('irons_spellbooks:ender_upgrade_orb').when(c => c.randomChance(0.15)))

  // ---- Enderiophage — T4 end ----
  event
    .addEntityLootModifier('alexsmobs:enderiophage')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.20)))

  // ---- Laviathan — T4 sky/nether ----
  event
    .addEntityLootModifier('alexsmobs:laviathan')
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.15)))

  // ===== T3 — Nether / Underground / Deep =====

  // ---- Bone Serpent — nether snake mob, magic synergy ----
  event
    .addEntityLootModifier('alexsmobs:bone_serpent')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.10)))

  // ---- Straddler — nether basalt mob ----
  event
    .addEntityLootModifier('alexsmobs:straddler')
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.20)))

  // ---- Soul Vulture — nether soul sand valley ----
  event
    .addEntityLootModifier('alexsmobs:soul_vulture')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.15)))

  // ---- Crimson Mosquito (Warped Mosco) — nether ----
  event
    .addEntityLootModifier('alexsmobs:crimson_mosquito')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.10)))
  event
    .addEntityLootModifier('alexsmobs:warped_mosco')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.20)))

  // ---- Murmur — Deeper Darker / underground horror ----
  event
    .addEntityLootModifier('alexsmobs:murmur')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.25)))
    .addLoot(LootEntry.of('irons_spellbooks:ender_rune').when(c => c.randomChance(0.15)))

  // ---- Hammerhead Shark — deep ocean T3 ----
  event
    .addEntityLootModifier('alexsmobs:hammerhead_shark')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.10)))

  // ---- Frostmoth — cold T3 ----
  event
    .addEntityLootModifier('alexsmobs:froststalker')  // was 'frostmoth' (no such entity -> pig) 2026-06-06
    .addLoot(LootEntry.of('irons_spellbooks:ice_rune').when(c => c.randomChance(0.10)))

  // ---- Cosmaw — sky T3 ----
  event
    .addEntityLootModifier('alexsmobs:cosmaw')
    .addLoot(LootEntry.of('irons_spellbooks:lightning_rune').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.10)))

  // ===== T2 — Dangerous overworld biomes =====

  // ---- Crocodile — swamp T2 danger ----
  event
    .addEntityLootModifier('alexsmobs:crocodile')
    .addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.15)))

  // ---- Komodo Dragon — desert/savanna T2 ----
  event
    .addEntityLootModifier('alexsmobs:komodo_dragon')
    .addLoot(LootEntry.of('irons_spellbooks:nature_rune').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.15)))

  // ---- Anaconda — jungle T2 ----
  event
    .addEntityLootModifier('alexsmobs:anaconda')
    .addLoot(LootEntry.of('irons_spellbooks:nature_rune').when(c => c.randomChance(0.08)))

  // ---- Caiman — swamp/jungle T2 ----
  event
    .addEntityLootModifier('alexsmobs:caiman')
    .addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.10)))

  // ---- Snow Leopard — mountain peaks T2 ----
  event
    .addEntityLootModifier('alexsmobs:snow_leopard')
    .addLoot(LootEntry.of('irons_spellbooks:ice_rune').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.15)))

  // ---- Dropbear — eucalyptus/desert T2 ambush ----
  event
    .addEntityLootModifier('alexsmobs:dropbear')
    .addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.10)))

  // ---- Leafcutter Ant Queen — jungle T2 mini-boss ----
  event
    .addEntityLootModifier('alexsmobs:leafcutter_ant_queen')
    .addLoot(LootEntry.of('irons_spellbooks:nature_rune').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.20)))

  // ---- Cachalot Whale — deep ocean T2 ----
  event
    .addEntityLootModifier('alexsmobs:cachalot_whale')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.15)))

  console.log('[alexsmobs_drops] registered 21 entity loot modifiers (1 strip, 20 synergy adds)')
})
