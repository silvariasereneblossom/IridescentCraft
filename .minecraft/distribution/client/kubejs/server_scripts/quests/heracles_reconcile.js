// =============================================================================
// kubejs/server_scripts/quests/heracles_reconcile.js
//
// HERACLES STATE RECONCILIATION — "skip quests you already earned."
//
// THE PROBLEM: Heracles evaluates tasks on EVENTS, not on existing state. A
// character that earned an advancement / tier / kill BEFORE Heracles (or before
// a quest existed) already fired every event, so the quest never ticks and the
// chain is stuck — existing characters would have to re-roll.
//
// THE FIX (two mechanisms, belt-and-suspenders):
//   1. `/heracles complete <quest> <player>` — Heracles' own force-complete
//      (CompleteCommand -> QuestsProgress.completeQuest). Primary path.
//   2. If (1) doesn't report success AND the quest is advancement-gated, RE-FIRE
//      the advancement: `/advancement revoke` then `/advancement grant`. The
//      grant flows through Heracles' advancement hook (the PlayerAdvancement
//      mixin) exactly as if the player just earned it — so Heracles completes the
//      matching `heracles:advancement` task via its OWN pipeline (correct
//      dependency cascade + client sync). This is the "test the achievement
//      against the Heracles stack as a listener" path.
//
// Conditions are read from the ledgers the game already keeps: vanilla
// advancements (`execute if entity`), AStages tier stages, the codex delivery
// flag, the engine's first-kill/dimension flags, and inventory possession.
//
// A new character meets NONE of these -> nothing reconciles -> plays normally.
// Idempotent: each (player, quest) is reconciled at most once (icraft_recon_<id>
// guard); quests already complete the normal way are detected and skipped.
//
// TRIGGERS (all automatic; the command is just for diagnosis/forcing):
//   • PlayerEvents.loggedIn        — immediate pass on join
//   • ~5s post-login re-pass       — catches late-loading capability/flag data
//   • periodic pass every 30s      — diffs every online player continuously, so it
//                                     works with NO relog (e.g. after a /reload) and
//                                     auto-completes as you progress mid-session
//   • /icraft_reconcile [reset]    — OP, on-demand: run now + print a per-quest
//                                     report (test without relogging, SEE what ran)
//
// RELOAD-SAFETY: PlayerEvents.loggedIn + one master-dispatched server tick +
// ServerEvents.commandRegistry. No item creation, no Forge bus listener.
// =============================================================================

// ---- condition probes (all defensive) -------------------------------------
function reconHasAdv(player, advId) {
  try {
    // NOTE: selector args [...] are only valid on @-selectors, NOT a bare name.
    // `@a[name=<user>,advancements={...}]` is the correct form (the bare-name
    // form `<user>[...]` is a parse error that spams the log + always fails).
    return player.server.runCommandSilent(
      'execute if entity @a[name=' + player.username + ',advancements={' + advId + '=true}]') > 0
  } catch (e) { return false }
}
function reconHasStage(player, stage) {
  try { return AStages.playerHasStage(stage, player) } catch (e) { return false }
}
function reconHasFlag(player, key) {
  try { return player.persistentData.getBoolean(key) } catch (e) { return false }
}
function reconHasItem(player, itemPredicate) {
  try {
    return player.server.runCommandSilent('clear ' + player.username + ' ' + itemPredicate + ' 0') > 0
  } catch (e) { return false }
}

// Re-fire an advancement THROUGH Heracles' listener: revoke (so the grant isn't
// a no-op) then grant. The grant re-runs every `heracles:advancement` task that
// watches it. Returns true if both commands ran.
function reconRefireAdv(player, advId) {
  try {
    player.server.runCommandSilent('advancement revoke ' + player.username + ' only ' + advId)
    player.server.runCommandSilent('advancement grant ' + player.username + ' only ' + advId)
    return true
  } catch (e) {
    console.warn('[heracles_reconcile] refire failed for ' + advId + '/' + player.username + ': ' + e)
    return false
  }
}

// Force-complete via Heracles' own command. Returns the command result int
// (>=1 = Heracles accepted it).
function reconComplete(player, quest) {
  try { return player.server.runCommandSilent('heracles complete ' + quest + ' ' + player.username) }
  catch (e) {
    console.warn('[heracles_reconcile] complete threw for ' + quest + '/' + player.username + ': ' + e)
    return 0
  }
}

// ---- reconciliation table (deps-first) ------------------------------------
// q = quest ID; met(player) = "already satisfied?"; adv = advancement(s) to
// re-fire through Heracles when force-complete doesn't take (advancement-gated
// quests only). Item/flag-gated quests omit adv (force-complete only).
const RECONCILE = [
  // === Onboarding ===
  { q: 'onboarding_first_log',            adv: ['minecraft:story/mine_stone'],     met: p => reconHasAdv(p, 'minecraft:story/mine_stone') },
  { q: 'onboarding_first_tool',           adv: ['minecraft:story/mine_stone'],     met: p => reconHasAdv(p, 'minecraft:story/mine_stone') },
  { q: 'onboarding_first_stone',          adv: ['minecraft:story/mine_stone'],     met: p => reconHasAdv(p, 'minecraft:story/mine_stone') },
  { q: 'onboarding_first_food',           adv: ['minecraft:story/smelt_iron'],     met: p => reconHasAdv(p, 'minecraft:story/smelt_iron') },
  { q: 'onboarding_first_shelter',        adv: ['minecraft:adventure/sleep_in_bed'], met: p => reconHasAdv(p, 'minecraft:adventure/sleep_in_bed') },
  { q: 'onboarding_first_kill',           adv: ['minecraft:adventure/kill_a_mob'], met: p => reconHasAdv(p, 'minecraft:adventure/kill_a_mob') },
  { q: 'onboarding_first_iron',           adv: ['minecraft:story/smelt_iron'],     met: p => reconHasAdv(p, 'minecraft:story/smelt_iron') },
  { q: 'onboarding_first_iron_pick',      adv: ['minecraft:story/iron_tools'],     met: p => reconHasAdv(p, 'minecraft:story/iron_tools') },
  { q: 'onboarding_first_villager_trade', adv: ['minecraft:adventure/trade'],      met: p => reconHasAdv(p, 'minecraft:adventure/trade') },

  // === Iridescent Codex intro (have the codex) ===
  { q: 'onboarding_first_codex_open', met: p => reconHasFlag(p, 'icraft_codex_given') || reconHasItem(p, 'patchouli:guide_book{"patchouli:book":"icraft:iridescent_codex"}') },
  { q: 'codex_root',        met: p => reconHasFlag(p, 'icraft_codex_given') || reconHasItem(p, 'patchouli:guide_book{"patchouli:book":"icraft:iridescent_codex"}') },
  { q: 'codex_two_routes',  met: p => reconHasFlag(p, 'icraft_codex_given') || reconHasItem(p, 'patchouli:guide_book{"patchouli:book":"icraft:iridescent_codex"}') },
  { q: 'codex_lane_engineering', met: p => reconHasItem(p, 'minecraft:iron_ingot') },
  { q: 'codex_lane_magic',       met: p => reconHasItem(p, 'botania:manasteel_ingot') },
  { q: 'codex_lane_exploration', met: p => reconHasItem(p, 'minecraft:map') || reconHasItem(p, 'minecraft:filled_map') },
  { q: 'codex_lane_combat',      met: p => reconHasItem(p, '#minecraft:swords') },

  // === Tier Milestones (have the stage; re-fire the stage advancement) ===
  { q: 'reach_tier_2', adv: ['icraft:stage_tier_2'], met: p => reconHasStage(p, 'tier_2') },
  { q: 'reach_tier_3', adv: ['icraft:stage_tier_3'], met: p => reconHasStage(p, 'tier_3') },
  { q: 'reach_tier_4', adv: ['icraft:stage_tier_4'], met: p => reconHasStage(p, 'tier_4') },
  // Engineering lane T3 unlock rides the same stage as reach_tier_3 but had no
  // row — strands existing T3 characters on the Mekanism-unlock beat (#45 sweep).
  { q: 'eng_t3_unlock', adv: ['icraft:stage_tier_3'], met: p => reconHasStage(p, 'tier_3') },

  // === Exploration dimension trackers (engine dim-entry flags) ===
  { q: 'exp_t2_dimensions', met: p => reconHasFlag(p, 'icraft_codex_dimentry_twilight') && reconHasFlag(p, 'icraft_codex_dimentry_aether') && (reconHasFlag(p, 'icraft_codex_dimentry_everbright') || reconHasFlag(p, 'icraft_codex_dimentry_everdawn')) },
  { q: 'exp_t3_deep_dimensions', met: p => reconHasFlag(p, 'icraft_codex_dimentry_nether') && reconHasFlag(p, 'icraft_codex_dimentry_undergarden') && reconHasFlag(p, 'icraft_codex_dimentry_deeperdarker') },
  { q: 'exp_t4_final_frontiers', met: p => reconHasFlag(p, 'icraft_codex_dimentry_deep_aether') && (reconHasFlag(p, 'icraft_codex_dimentry_the_end') || reconHasAdv(p, 'minecraft:story/enter_the_end')) },
  // Navigator: hold all four compasses (composite amount:4 = AND). (#45)
  { q: 'exp_navigator', met: p =>
      reconHasItem(p, 'explorerscompass:explorerscompass') && reconHasItem(p, 'naturescompass:naturescompass') &&
      reconHasItem(p, 'kubejs:boss_compass') && reconHasItem(p, 'iridescent_grand_compass:grand_compass') },

  // === Capstones ===
  { q: 'capstone_lucifer',     met: p => reconHasFlag(p, 'icraft_codex_firstkill_cardinal_sins_lucifer') },
  { q: 'capstone_end_compass', adv: ['minecraft:end/kill_dragon'], met: p => reconHasFlag(p, 'icraft_codex_dimentry_deep_aether') || reconHasAdv(p, 'minecraft:end/kill_dragon') },
  { q: 'capstone_end_bastion', adv: ['minecraft:story/enter_the_end'], met: p => reconHasFlag(p, 'icraft_codex_dimentry_the_end') || reconHasAdv(p, 'minecraft:story/enter_the_end') || reconHasAdv(p, 'minecraft:end/kill_dragon') },
  { q: 'capstone_ender_dragon', adv: ['minecraft:end/kill_dragon'], met: p => reconHasAdv(p, 'minecraft:end/kill_dragon') },

  // === Main (vanilla MC) progression — advancement-gated ===
  { q: 'main_diamonds',         adv: ['minecraft:story/mine_diamond'],         met: p => reconHasAdv(p, 'minecraft:story/mine_diamond') },
  { q: 'main_enchant',          adv: ['minecraft:story/enchant_item'],         met: p => reconHasAdv(p, 'minecraft:story/enchant_item') },
  { q: 'main_diamond_armor',    adv: ['minecraft:story/shiny_gear'],           met: p => reconHasAdv(p, 'minecraft:story/shiny_gear') },
  { q: 'main_enter_nether',     adv: ['minecraft:story/enter_the_nether'],     met: p => reconHasAdv(p, 'minecraft:story/enter_the_nether') },
  { q: 'main_fortress',         adv: ['minecraft:nether/find_fortress'],       met: p => reconHasAdv(p, 'minecraft:nether/find_fortress') },
  { q: 'main_blaze_rods',       adv: ['minecraft:nether/obtain_blaze_rod'],    met: p => reconHasAdv(p, 'minecraft:nether/obtain_blaze_rod') },
  { q: 'main_brewing',          adv: ['minecraft:nether/brew_potion'],         met: p => reconHasAdv(p, 'minecraft:nether/brew_potion') },
  { q: 'main_netherite',        adv: ['minecraft:nether/obtain_ancient_debris'], met: p => reconHasAdv(p, 'minecraft:nether/obtain_ancient_debris') },
  { q: 'main_stronghold',       adv: ['minecraft:story/follow_ender_eye'],     met: p => reconHasAdv(p, 'minecraft:story/follow_ender_eye') },
  { q: 'main_journey_capstone', adv: ['minecraft:nether/obtain_ancient_debris'], met: p => reconHasAdv(p, 'minecraft:nether/obtain_ancient_debris') },

  // === Main — basic-survival front (vanilla husbandry/adventure advancements) ===
  { q: 'main_farming', adv: ['minecraft:husbandry/plant_seed'],      met: p => reconHasAdv(p, 'minecraft:husbandry/plant_seed') },
  { q: 'main_animals', adv: ['minecraft:husbandry/breed_an_animal'], met: p => reconHasAdv(p, 'minecraft:husbandry/breed_an_animal') },
  { q: 'main_tame',    adv: ['minecraft:husbandry/tame_an_animal'],  met: p => reconHasAdv(p, 'minecraft:husbandry/tame_an_animal') },
  { q: 'main_fishing', adv: ['minecraft:husbandry/fishy_business'],  met: p => reconHasAdv(p, 'minecraft:husbandry/fishy_business') },
  { q: 'main_archery', adv: ['minecraft:adventure/shoot_arrow'],     met: p => reconHasAdv(p, 'minecraft:adventure/shoot_arrow') },
  { q: 'main_settler', met: p =>
      reconHasAdv(p, 'minecraft:husbandry/plant_seed') && reconHasAdv(p, 'minecraft:husbandry/breed_an_animal') &&
      reconHasAdv(p, 'minecraft:husbandry/tame_an_animal') && reconHasAdv(p, 'minecraft:husbandry/fishy_business') &&
      reconHasAdv(p, 'minecraft:adventure/shoot_arrow') },

  // === Overworld Foundations (T1 mods) — inventory best-effort (held items) ===
  { q: 'ovf_iss_spellbook', met: p => reconHasItem(p, 'irons_spellbooks:iron_spell_book') },
  { q: 'ovf_apotheosis_gem', met: p => reconHasItem(p, 'apotheosis:sigil_of_socketing') },
  { q: 'ovf_tetra_workbench', met: p => reconHasItem(p, 'tetra:hammer_base') },
  { q: 'ovf_alexsmobs',     met: p => reconHasItem(p, 'alexsmobs:animal_dictionary') },
  { q: 'ovf_create_brass',  met: p => reconHasItem(p, 'create:brass_ingot') },

  // === Overworld Foundations — Chapter 1 expansion (#45, ~30 quests) ===========
  // Held-item beats: inventory best-effort (same as the rows above). Placed-block
  // beats (mixer/apothecary/flora/runic_altar/salvage/waystone) are intentionally
  // omitted — a built-then-placed block isn't in inventory, so `clear` can't see it
  // (the same reason ovf_create_press / ovf_botania_pool carry no row); the
  // AUTOMATIC item task self-completes on the next inventory change instead.
  { q: 'ovf_create_precision',      met: p => reconHasItem(p, 'create:precision_mechanism') },
  { q: 'ovf_create_andesite',       met: p => reconHasItem(p, 'create:andesite_alloy') },
  { q: 'ovf_botania_manasteel',     met: p => reconHasItem(p, 'botania:manasteel_ingot') },
  { q: 'ovf_tetra_forge',           met: p => reconHasItem(p, 'tetra:modular_sword') },
  { q: 'ovf_apotheosis_socket_gem', met: p => reconHasItem(p, 'apotheosis:gem') },
  { q: 'ovf_alexsmobs_harvest',     met: p => reconHasItem(p, 'alexsmobs:lobster_tail') },
  { q: 'ovf_terramity_gems',        met: p => reconHasItem(p, 'terramity:sapphire') },
  { q: 'ovf_simplyswords', met: p =>
      reconHasItem(p, 'simplyswords:iron_longsword') || reconHasItem(p, 'simplyswords:iron_katana') ||
      reconHasItem(p, 'simplyswords:iron_rapier')    || reconHasItem(p, 'simplyswords:iron_claymore') ||
      reconHasItem(p, 'simplyswords:iron_spear')     || reconHasItem(p, 'simplyswords:iron_glaive') },
  // Named T1 boss kills — the exploration-kills engine sets a one-time first-kill
  // flag per named boss (icraft_codex_firstkill_<id with :,/ -> _>). Force-complete
  // only (kills aren't advancement-gated). Mutant/Brutal composites have NO flag
  // (minibosses pay every kill) and self-heal on a respawn, so they carry no row.
  { q: 'ovf_terramity_gob',      met: p => reconHasFlag(p, 'icraft_codex_firstkill_terramity_gob') },
  { q: 'ovf_terramity_sniffer',  met: p => reconHasFlag(p, 'icraft_codex_firstkill_terramity_super_sniffer') },
  { q: 'ovf_mowzie_wroughtnaut', met: p => reconHasFlag(p, 'icraft_codex_firstkill_mowziesmobs_ferrous_wroughtnaut') },
  { q: 'ovf_mowzie_frostmaw',    met: p => reconHasFlag(p, 'icraft_codex_firstkill_mowziesmobs_frostmaw') },
  { q: 'ovf_mowzie_umvuthi',     met: p => reconHasFlag(p, 'icraft_codex_firstkill_mowziesmobs_umvuthi') },
  { q: 'ovf_mowzie_sculptor',    met: p => reconHasFlag(p, 'icraft_codex_firstkill_mowziesmobs_sculptor') },
  // Chapter capstone — composite 6-of-10 (mirrors the quest's amount:6). Count held
  // beats + the boss first-kill flag; never force-completes below 6 (blocks in the
  // set undercount, which is safe — it only ever completes a genuine 6+). Pattern
  // mirrors iss_t3_arcane_master's count reconcile.
  { q: 'ovf_capstone', met: p =>
      ((reconHasItem(p, 'create:mechanical_press') ? 1 : 0) +
       (reconHasItem(p, 'botania:mana_pool') ? 1 : 0) +
       (reconHasItem(p, 'irons_spellbooks:iron_spell_book') ? 1 : 0) +
       (reconHasItem(p, 'tetra:hammer_base') ? 1 : 0) +
       (reconHasItem(p, 'apotheosis:sigil_of_socketing') ? 1 : 0) +
       (reconHasItem(p, 'alexsmobs:animal_dictionary') ? 1 : 0) +
       (reconHasItem(p, 'simplyswords:iron_rapier') ? 1 : 0) +
       (reconHasItem(p, 'waystones:waystone') ? 1 : 0) +
       (reconHasItem(p, 'terramity:sapphire') ? 1 : 0) +
       (reconHasFlag(p, 'icraft_codex_firstkill_mowziesmobs_ferrous_wroughtnaut') ? 1 : 0)) >= 6 },

  // === Iron's Spellbooks (ISS questline, T1-T3) — inventory possession (#45) ===
  { q: 'iss_t1_first_book',        met: p => reconHasItem(p, 'irons_spellbooks:copper_spell_book') },
  { q: 'iss_t1_common_ink',        met: p => reconHasItem(p, 'irons_spellbooks:common_ink') },
  { q: 'iss_t1_inscription_table', met: p => reconHasItem(p, 'irons_spellbooks:inscription_table') },
  { q: 'iss_t1_scroll',            met: p => reconHasItem(p, 'irons_spellbooks:scroll') },
  { q: 'iss_t1_arcane_ingot',      met: p => reconHasItem(p, 'irons_spellbooks:arcane_ingot') },
  { q: 'iss_t1_staff',             met: p => reconHasItem(p, 'irons_spellbooks:graybeard_staff') },
  { q: 'iss_t2_gold_book',         met: p => reconHasItem(p, 'irons_spellbooks:gold_spell_book') },
  { q: 'iss_t2_arcane_anvil',      met: p => reconHasItem(p, 'irons_spellbooks:arcane_anvil') },
  { q: 'iss_t2_rune',              met: p => reconHasItem(p, 'irons_spellbooks:fire_rune') },
  { q: 'iss_t2_rare_ink',          met: p => reconHasItem(p, 'irons_spellbooks:rare_ink') },
  { q: 'iss_t2_scroll_forge',      met: p => reconHasItem(p, 'irons_spellbooks:scroll_forge') },
  { q: 'iss_t2_upgrade_orb',       met: p => reconHasItem(p, 'irons_spellbooks:upgrade_orb') },
  { q: 'iss_t3_netherite_book',    met: p => reconHasItem(p, 'irons_spellbooks:netherite_spell_book') },
  { q: 'iss_t3_mithril_ingot',     met: p => reconHasItem(p, 'irons_spellbooks:mithril_ingot') },
  { q: 'iss_t3_pedestal',          met: p => reconHasItem(p, 'irons_spellbooks:pedestal') },
  { q: 'iss_t3_advanced_rune',     met: p => reconHasItem(p, 'irons_spellbooks:holy_rune') },
  { q: 'iss_t3_legendary_ink',     met: p => reconHasItem(p, 'irons_spellbooks:legendary_ink') },
  // Arcane Master capstone: composite 3-of-4 (mirrors the quest's amount:3).
  { q: 'iss_t3_arcane_master',     met: p =>
      ((reconHasItem(p, 'irons_spellbooks:netherite_spell_book') ? 1 : 0) +
       (reconHasItem(p, 'irons_spellbooks:mithril_ingot') ? 1 : 0) +
       (reconHasItem(p, 'irons_spellbooks:pyrium_ingot') ? 1 : 0) +
       (reconHasItem(p, 'irons_spellbooks:divine_pearl') ? 1 : 0)) >= 3 },

  // === Practical Magic (shared caster on-ramp) — held-item best-effort, FORGIVING
  // (entry item OR a more-advanced equivalent), so a veteran who's already past the
  // copper book / wooden wand auto-completes instead of being asked to re-craft.
  // Deps-first: intro -> branch entries -> secondaries -> capstone.
  { q: 'pm_intro', met: p =>
      reconHasItem(p, 'minecraft:book') || reconHasItem(p, 'minecraft:bookshelf') ||
      reconHasItem(p, '#curios:spellbook') || reconHasItem(p, 'ars_nouveau:worn_notebook') ||
      reconHasItem(p, 'simple_staves:woodenwand') || reconHasItem(p, 'iridescent_reforging:reforged_wand') },
  { q: 'pm_ars_notebook', met: p =>
      reconHasItem(p, 'ars_nouveau:worn_notebook') || reconHasItem(p, 'ars_nouveau:novice_spell_book') ||
      reconHasItem(p, 'ars_nouveau:apprentice_spell_book') || reconHasItem(p, 'ars_nouveau:archmage_spell_book') },
  { q: 'pm_wand_craft', met: p =>
      reconHasItem(p, 'simple_staves:woodenwand') || reconHasItem(p, 'iridescent_reforging:reforged_wand') ||
      reconHasItem(p, 'simple_staves:iron_wand') || reconHasItem(p, 'simple_staves:diamond_wand') ||
      reconHasItem(p, 'simple_staves:netherite_wand') },
  { q: 'pm_ars_book', met: p =>
      reconHasItem(p, 'ars_nouveau:novice_spell_book') || reconHasItem(p, 'ars_nouveau:apprentice_spell_book') ||
      reconHasItem(p, 'ars_nouveau:archmage_spell_book') },
  { q: 'pm_wand_reforge', met: p => reconHasItem(p, 'iridescent_reforging:reforged_wand') },
  // Capstone: all three branch entries already satisfied.
  { q: 'pm_capstone', met: p =>
      (reconHasItem(p, '#curios:spellbook') || reconHasItem(p, 'irons_spellbooks:copper_spell_book') ||
       reconHasItem(p, 'irons_spellbooks:gold_spell_book') || reconHasItem(p, 'irons_spellbooks:netherite_spell_book')) &&
      (reconHasItem(p, 'ars_nouveau:worn_notebook') || reconHasItem(p, 'ars_nouveau:novice_spell_book') ||
       reconHasItem(p, 'ars_nouveau:apprentice_spell_book') || reconHasItem(p, 'ars_nouveau:archmage_spell_book')) &&
      (reconHasItem(p, 'simple_staves:woodenwand') || reconHasItem(p, 'iridescent_reforging:reforged_wand') ||
       reconHasItem(p, 'simple_staves:iron_wand') || reconHasItem(p, 'simple_staves:diamond_wand') ||
       reconHasItem(p, 'simple_staves:netherite_wand')) },

  // === Combat — first-boss via the engine's one-time first-kill flags (named
  // bosses only; minibosses + kill-N quests don't store a count, so re-complete) ===
  { q: 'com_first_boss', met: p =>
      reconHasFlag(p, 'icraft_codex_firstkill_mowziesmobs_ferrous_wroughtnaut') ||
      reconHasFlag(p, 'icraft_codex_firstkill_mowziesmobs_frostmaw') ||
      reconHasFlag(p, 'icraft_codex_firstkill_mowziesmobs_umvuthi') ||
      reconHasFlag(p, 'icraft_codex_firstkill_terramity_gob') },
  { q: 'com_apotheosis_boss', met: p => reconHasFlag(p, 'icraft_killed_apoth_boss') },
  { q: 'com_champion',        met: p => reconHasFlag(p, 'icraft_killed_champion') },
]

// ---- idempotency -----------------------------------------------------------
function reconGuardKey(quest) { return 'icraft_recon_' + quest }
function reconIsGuarded(player, quest) { try { return player.persistentData.getBoolean(reconGuardKey(quest)) } catch (e) { return false } }
function reconMarkGuarded(player, quest) { try { player.persistentData.putBoolean(reconGuardKey(quest), true) } catch (e) {} }
function reconClearGuards(player) {
  try { for (const e of RECONCILE) player.persistentData.putBoolean(reconGuardKey(e.q), false) } catch (err) {}
}

function reconHeraclesComplete(player, quest) {
  try {
    const pd = player.persistentData
    if (!pd.contains('heracles')) return false
    const h = pd.getCompound('heracles')
    if (!h.contains('quests')) return false
    const qs = h.getCompound('quests')
    if (!qs.contains(quest)) return false
    const q = qs.getCompound(quest)
    return q.contains('complete') && q.getBoolean('complete')
  } catch (e) { return false }
}

// ---- one reconciliation pass; returns [[quest, outcome], ...] --------------
function reconcileAll(player, verbose) {
  // NOTE: var-only, no let/const. Rhino (KubeJS' JS engine) throws
  // "redeclaration of var e" at the loop-scoped const on RE-INVOCATION of a
  // function — and reconcileAll runs on a 30s periodic pass. var is
  // function-scoped/hoisted so it sidesteps the buggy block-scope path; the
  // loop var is also renamed e->entry to avoid clashing with catch(e) params.
  var report = []
  if (!player || player.level.isClientSide()) return report
  var did = 0
  for (var i = 0; i < RECONCILE.length; i++) {
    var entry = RECONCILE[i]
    if (reconIsGuarded(player, entry.q)) { if (verbose) report.push([entry.q, 'already-synced']); continue }
    if (reconHeraclesComplete(player, entry.q)) { reconMarkGuarded(player, entry.q); if (verbose) report.push([entry.q, 'already-done']); continue }

    var ok = false
    try { ok = !!entry.met(player) } catch (err) { ok = false }
    if (!ok) { if (verbose) report.push([entry.q, 'not-yet']); continue }

    // Condition met -> complete. Primary: Heracles' force-complete.
    var ret = reconComplete(player, entry.q)
    var outcome = 'completed'
    // Fallback: if Heracles didn't accept it, re-fire the advancement through
    // its own listener, then complete again.
    if ((!ret || ret < 1) && entry.adv) {
      for (var a = 0; a < entry.adv.length; a++) reconRefireAdv(player, entry.adv[a])
      ret = reconComplete(player, entry.q)
      outcome = 're-fired'
    }
    reconMarkGuarded(player, entry.q)
    did++
    report.push([entry.q, outcome + (ret >= 1 ? '' : '?')])
  }
  if (did > 0) {
    player.tell(Text.gold('[Quests] ').append(Text.gray(
      'Synced ' + did + ' quest' + (did === 1 ? '' : 's') + ' you had already earned — claim their rewards in the book.')))
    console.log('[heracles_reconcile] reconciled ' + did + ' quest(s) for ' + player.username +
      ': ' + report.filter(r => !/already|not-yet/.test(r[1])).map(r => r[0]).join(', '))
  }
  return report
}

// ---- triggers --------------------------------------------------------------
PlayerEvents.loggedIn(event => {
  try { reconcileAll(event.player, false) } catch (e) { console.warn('[heracles_reconcile] login pass threw: ' + e) }
  try { event.player.persistentData.putInt('icraft_recon_recheck_ticks', 100) } catch (e) {}
})

global.tick_heraclesReconcileRecheck = function(event) {
  event.server.players.forEach(function(player) {
    let left = 0
    try { left = player.persistentData.getInt('icraft_recon_recheck_ticks') } catch (e) { return }
    if (!left || left <= 0) return
    left -= 20
    try { player.persistentData.putInt('icraft_recon_recheck_ticks', Math.max(0, left)) } catch (e) {}
    if (left <= 0) {
      try { reconcileAll(player, false) } catch (e) { console.warn('[heracles_reconcile] recheck threw for ' + player.username + ': ' + e) }
    }
  })
}
global.registerServerTick('tick_heraclesReconcileRecheck', 20, 9)

// Periodic AUTO-pass: diff every online player against the quest table on a
// relaxed cadence (every 30s). This is what makes reconciliation automatic with
// NO relog and NO command — it catches a /reload (login won't re-fire for an
// already-online player) and mid-session progress (e.g. you just hit Tier 3).
// Cheap once a character is caught up: guarded entries are skipped before any
// command runs, so a fully-reconciled player costs ~45 NBT reads and nothing more.
global.tick_heraclesReconcilePeriodic = function(event) {
  event.server.players.forEach(function(player) {
    try { reconcileAll(player, false) } catch (e) {
      console.warn('[heracles_reconcile] periodic pass threw for ' + player.username + ': ' + e)
    }
  })
}
global.registerServerTick('tick_heraclesReconcilePeriodic', 600, 13)

// ---- on-demand command: /icraft_reconcile [reset] --------------------------
ServerEvents.commandRegistry(event => {
  const { commands } = event
  function run(ctx, doReset) {
    let sp
    try { sp = ctx.source.getPlayerOrException() } catch (e) { ctx.source.sendFailure(Text.of('Must be run as a player')); return 0 }
    if (doReset) reconClearGuards(sp)
    let report
    try { report = reconcileAll(sp, true) } catch (e) { sp.tell(Text.red('[Reconcile] threw: ' + e)); return 0 }
    sp.tell(Text.gold('═══ Reconcile' + (doReset ? ' (reset)' : '') + ' — ' + report.length + ' quests ═══'))
    let acted = 0
    report.forEach(function(r) {
      const done = /completed|re-fired|already-done|already-synced/.test(r[1])
      if (/completed|re-fired/.test(r[1])) acted++
      const colour = /completed|re-fired/.test(r[1]) ? Text.green : (done ? Text.gray : Text.darkGray)
      sp.tell(colour('  ' + r[0] + ' → ' + r[1]))
    })
    sp.tell(Text.gold('═══ acted on ' + acted + ' this run ═══'))
    return 1
  }
  event.register(
    commands.literal('icraft_reconcile')
      .requires(src => src.hasPermission(2))
      .executes(ctx => run(ctx, false))
      .then(commands.literal('reset').executes(ctx => run(ctx, true)))
  )
})

console.log('[heracles_reconcile] loaded — ' + RECONCILE.length +
  ' quests auto-reconcile from existing advancements / tiers / flags (login + 30s periodic + /icraft_reconcile)')
