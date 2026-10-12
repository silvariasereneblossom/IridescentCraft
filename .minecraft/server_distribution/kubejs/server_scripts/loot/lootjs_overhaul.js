// =============================================================================
// LOOTJS LOOT TABLE OVERHAUL
// Place in: kubejs/server_scripts/loot/lootjs_overhaul.js
// REQUIRES: LootJS addon (https://curseforge.com/minecraft/mc-mods/lootjs)
//
// Design doc Part I, Section 19: Loot Table Overhaul
// "Every dungeon/structure mod's loot tables must respect the tier system."
//
// SCOPE (header corrected 2026-10-10 — it used to say "structure chest
// modifiers only"). Mostly chest / structure loot, but this file ALSO registers
//   - entity modifiers: arcane essence + T1 robe pieces on vanilla magic mobs
//     and undead, the @kubejs safety strip on pig/cow/sheep/chicken, the
//     Terramity gun + curio strips on ALL entity loot (LootType.ENTITY), and
//     Ender's Hand on the Ender Dragon;
//   - boss loot-TABLE modifiers: class-artifact pouches + awakenings (8.5);
//   - block loot-table modifiers: Farmer's Delight seeds from grass.
// Boss material + Simply Swords unique drops are in loot_overhaul.js. The
// tier-scaled enchanted books are registered from zz_pack_enchanted_books.js
// (see Section 1).
//
// WHAT THIS DOES:
// 1. Strips tier-breaking / uncurated items from chests by tier (diamonds and
//    diamond gear before T3, off-tier glyphs, loose artifact-mod items)
// 2. Re-injects curated, tier-gated pools by dimension / table (artifacts,
//    relics, glyphs, spell books, inks, marquee-structure themes)
// 3. Thins Overworld chest clutter and food (each listed stack survives at a
//    fixed chance) and removes modded food from Overworld chests
// 4. Village chest sanitisation + the dedicated village pools
// 5. Ocean / tower / Keebsz / Epic Dungeons themed loot
//
// ORDER MATTERS (removal-mechanic note, Section 1B): a strip only removes
// what is already in the loot list when it runs, so an ADD that a strip must
// not touch is registered AFTER that strip.
//
// Coverage = the table ids and regexes in the sections below (no hand-kept
// mod list: the old one named mods that are not installed). A LootJS table
// regex must match the WHOLE table id — see Section 1B.
// =============================================================================

var UniformGenerator = Java.loadClass('net.minecraft.world.level.storage.loot.providers.number.UniformGenerator')
// (ConstantValue was only used by the T4 enchanted-book add, which now lives in
//  loot/zz_pack_enchanted_books.js and loads the class itself.)
// 2026-04-21: LootJS 2.13.1 `removeLoot(js_function)` doesn't auto-wrap a JS
// predicate — the TypeWrapper first tries `IngredientJS.of(fn)`, gets an empty
// ingredient, logs "Invalid ingredient for filter: Unknown", and installs
// ItemFilter.ALWAYS_FALSE (= strip nothing). Predicate filters must go through
// `ItemFilter.custom(fn)` explicitly, which the API exposes as a static method
// on the ItemFilter interface.
var ItemFilter = Java.loadClass('com.almostreliable.lootjs.filters.ItemFilter')

LootJS.modifiers(icraft.guard('loot/lootjs_overhaul', 'LootJS.modifiers', event => {

  // Marquee-structure enchanted books are QUEUED here by applyMarquee (Section
  // 7) and registered by loot/zz_pack_enchanted_books.js, which loads after
  // both overhaul files. Reset on every loot build so reloads do not pile up.
  global.ICRAFT_MARQUEE_BOOKS = []

  // =========================================================================
  // SECTION 1: ENCHANTED BOOK REBALANCE  ->  loot/zz_pack_enchanted_books.js
  // =========================================================================
  // Tier-scaled enchanted books are layered on top of whatever the loot table
  // itself generated:
  //   Overworld: 7.5%
  //   Twilight Forest/Aether/Blue Skies: 10%
  //   Nether/Undergarden: 12.5%
  //   End/Deeper and Darker/The Abyss: 15%
  //
  // [2026-10-10] Those four adds used to be registered right here. They moved,
  // unchanged, to loot/zz_pack_enchanted_books.js: this file loads BEFORE
  // loot_overhaul.js (the real load order sorts letters before '_'), and
  // loot_overhaul.js strips minecraft:enchanted_book from the vanilla dungeon /
  // stronghold / mansion / temple tables and from the dungeons_arise, YUNG's,
  // Valhelsia, Twilight Forest, Blue Skies and Aether chest tables. LootJS
  // removal is one-shot in registration order (Section 1B), so that strip ate
  // the books added here in exactly those chests. Registered from a file that
  // loads after BOTH overhaul files (whatever order those two load in), the
  // strip only removes a table's own (vanilla / mod-default) books and the
  // pack's books always survive.
  //
  // (History: the 2026-04-18 "blank/unenchanted book" symptom was real but was
  // NOT a "persistent filter"; see the removal-mechanic note in Section 1B.)
  //
  // The Ars Nouveau spell books are added in Section 1B, after the global strip.
  // =========================================================================

  // --- Blank-enchanted-book chest-wide filter REMOVED 2026-05-17 ---
  // The filter (added 2026-04-19, rewritten 3x) was stripping ~97% of
  // legitimate enchanted books across every chest table in the pack.
  // Root cause: the regex/substring predicates were written against a
  // no-whitespace NBT toString format that does NOT match Forge 1.20.1's
  // actual output. Real NBT has whitespace after colons:
  //   {StoredEnchantments: [{id: "namespace:name", lvl: Ns}]}
  // ground-truthed in playtest 2026-05-17 via /data get on an actual
  // dropped book (apotheosis:tempting). Each rewrite of the filter added
  // more regex sophistication without ever validating against actual NBT
  // — textbook hallucination-around-verifiable-facts.
  //
  // Diagnostic replacement: see kubejs/server_scripts/diag_blank_book_trace.js
  // which logs any blank enchanted_book entering a player inventory so we
  // can localize a real upstream source if one still exists. If/when blanks
  // are observed in trace logs, add a targeted LootJS modifier on the
  // specific mod's table rather than reinstating a chest-wide filter.

  // ─── ARCANE ESSENCE INJECTION ─────────────────────────────────────────
  // Magic cloth requires 8 arcane_essence per cloth, 64 per Wizard chestplate
  // (8 cloth), 192 for full Wizard robes. ISS does drop arcane_essence in
  // its structure chests + caster-mob drops, but volume is on the slow side
  // for casual T1 caster builds. Two augmentations:
  //
  //   (a) Bump rate in ISS structure chests (any LootType.CHEST in the
  //       irons_spellbooks namespace) — extra entry on top of native
  //       drops, so loot density compounds rather than replaces.
  //
  //   (b) Add small chance to vanilla magic-mob drop tables: witch, evoker,
  //       vex, illusioner. Gives a passive accumulation path during normal
  //       overworld exploration without requiring ISS structure raids.
  //
  // Net target: a player who's killed ~30-50 magic mobs over their first
  // overworld session has enough essence for at least a Wizard helmet or
  // boots, with full chestplate within reach by the time they unlock T2.
  //
  // [2026-10-10] (a) is registered in Section 1B, right AFTER the global ISS
  // chest strip (search "ISS CHEST RE-ADDS"). Registered here it sat before
  // that strip, which removed every irons_spellbooks:* item except scrolls —
  // the essence never reached an ISS chest.

  // Vanilla magic mobs — small flat chance per kill
  icraft.section('loot/lootjs_overhaul/arcane-essence-injection', function () {
  ;['minecraft:witch', 'minecraft:evoker', 'minecraft:vex',
    'minecraft:illusioner'].forEach(function(mobId) {
    global.icraftEntityMod(event, mobId)
      .addLoot(LootEntry.of('irons_spellbooks:arcane_essence')
        .limitCount([1, 2])
        .when(c => c.randomChance(0.35)))
  })

  // Vanilla undead — low per-kill rate × very high encounter frequency
  // adds a steady trickle. Excludes wither (boss) and zoglin (rare/Nether).
  ;['minecraft:zombie', 'minecraft:zombie_villager', 'minecraft:husk',
    'minecraft:drowned', 'minecraft:skeleton', 'minecraft:wither_skeleton',
    'minecraft:stray', 'minecraft:phantom'].forEach(function(mobId) {
    global.icraftEntityMod(event, mobId)
      .addLoot(LootEntry.of('irons_spellbooks:arcane_essence')
        .when(c => c.randomChance(0.10)))
  })
  })

  // ─── FULL ROBE PIECE DROPS ────────────────────────────────────────────
  // Rare full-piece drops as a parallel rail to magic_cloth crafting.
  // Pieces are vanilla ArmorItem subclasses, so Apotheosis's `affix_loot`
  // global modifier (data/apotheosis/loot_modifiers/affix_loot.json)
  // catches every drop and rolls affixes via the HELMET/CHESTPLATE/
  // LEGGINGS/BOOTS LootCategory predicates — confirmed against
  // dev/shadowsoffire/apotheosis/adventure/loot/LootCategory.class.
  //
  // Pool is the 10 T1-craftable robe sets (40 pieces total). Excludes
  // archevoker (smithing-only T2 upgrade), netherite_mage (T4),
  // infernal_sorcerer/paladin (boss-tier), gold_crown/tarnished/
  // boots_of_speed (relics).
  //
  // Total per-source rate splits evenly across all 40 pieces:
  //   ISS chests       10%  (intentional source — caster strongholds)
  //   magic mobs        5%  (witch/evoker/vex/illusioner)
  //   vanilla undead  2.5%  (passive trickle)
  // Per-piece chance = total / 40, rolled independently per entry.
  // Independent rolls allow rare double-drops, but expected value
  // matches the headline rate within ~0.5%.
  var T1_ROBE_PIECES = [
    'irons_spellbooks:wizard_helmet',          'irons_spellbooks:wizard_chestplate',
    'irons_spellbooks:wizard_leggings',        'irons_spellbooks:wizard_boots',
    'irons_spellbooks:cultist_helmet',         'irons_spellbooks:cultist_chestplate',
    'irons_spellbooks:cultist_leggings',       'irons_spellbooks:cultist_boots',
    'irons_spellbooks:cryomancer_helmet',      'irons_spellbooks:cryomancer_chestplate',
    'irons_spellbooks:cryomancer_leggings',    'irons_spellbooks:cryomancer_boots',
    'irons_spellbooks:electromancer_helmet',   'irons_spellbooks:electromancer_chestplate',
    'irons_spellbooks:electromancer_leggings', 'irons_spellbooks:electromancer_boots',
    'irons_spellbooks:plagued_helmet',         'irons_spellbooks:plagued_chestplate',
    'irons_spellbooks:plagued_leggings',       'irons_spellbooks:plagued_boots',
    'irons_spellbooks:priest_helmet',          'irons_spellbooks:priest_chestplate',
    'irons_spellbooks:priest_leggings',        'irons_spellbooks:priest_boots',
    'irons_spellbooks:pyromancer_helmet',      'irons_spellbooks:pyromancer_chestplate',
    'irons_spellbooks:pyromancer_leggings',    'irons_spellbooks:pyromancer_boots',
    'irons_spellbooks:shadowwalker_helmet',    'irons_spellbooks:shadowwalker_chestplate',
    'irons_spellbooks:shadowwalker_leggings',  'irons_spellbooks:shadowwalker_boots',
    'irons_spellbooks:pumpkin_helmet',         'irons_spellbooks:pumpkin_chestplate',
    'irons_spellbooks:pumpkin_leggings',       'irons_spellbooks:pumpkin_boots',
    'irons_spellbooks:wandering_magician_helmet',    'irons_spellbooks:wandering_magician_chestplate',
    'irons_spellbooks:wandering_magician_leggings',  'irons_spellbooks:wandering_magician_boots'
  ]

  function injectRobeDrops(modifier, totalChance) {
    var perPiece = totalChance / T1_ROBE_PIECES.length
    T1_ROBE_PIECES.forEach(function(itemId) {
      modifier.addLoot(LootEntry.of(itemId)
        .when(c => c.randomChance(perPiece)))
    })
  }

  // ISS chests — 10% combined per chest: registered in Section 1B, AFTER the
  // global ISS chest strip (search "ISS CHEST RE-ADDS"). [2026-10-10: here it
  // sat before that strip and every robe piece was removed again.]

  // Magic mobs — 5% per kill
  icraft.section('loot/lootjs_overhaul/full-robe-piece-drops', function () {
  ;['minecraft:witch', 'minecraft:evoker', 'minecraft:vex',
    'minecraft:illusioner'].forEach(function(mobId) {
    injectRobeDrops(global.icraftEntityMod(event, mobId), 0.05)
  })

  // Vanilla undead — 2.5% per kill
  ;['minecraft:zombie', 'minecraft:zombie_villager', 'minecraft:husk',
    'minecraft:drowned', 'minecraft:skeleton', 'minecraft:wither_skeleton',
    'minecraft:stray', 'minecraft:phantom'].forEach(function(mobId) {
    injectRobeDrops(global.icraftEntityMod(event, mobId), 0.025)
  })

  // Remove ALL endgame KubeJS items from passive mob loot (safety net)
  global.icraftEntityMod(event, 'minecraft:pig')
    .removeLoot('@kubejs')
  global.icraftEntityMod(event, 'minecraft:cow')
    .removeLoot('@kubejs')
  global.icraftEntityMod(event, 'minecraft:sheep')
    .removeLoot('@kubejs')
  global.icraftEntityMod(event, 'minecraft:chicken')
    .removeLoot('@kubejs')
  })

  // ── RELICS CURATION ──
  // Remove relics that are too active/environmental/OP for gear-driven design
  let removedRelics = [
    'relics:infinity_ham',
    'relics:magic_mirror',
    'relics:aqua_walker',
    'relics:amphibian_boot',
    'relics:magma_walker',
    'relics:ice_skates',
    'relics:roller_skates',
    'relics:horse_flute',
    'relics:chorus_inhibitor',
    'relics:elytra_booster',
    'relics:spatial_sign',
    'relics:midnight_robe',
    'relics:ice_breaker',
    'relics:enders_hand',
    'relics:space_dissector'
  ]
  // "User dislike" blacklist (its own chest strip is a few blocks further down).
  var relicUserBlacklist = [
    'relics:horse_flute'
  ]

  // ── RELIC_DENY: the ONE deny set for every relic pool in this file ──
  // [2026-10-10] The two strips (relicRemover just below + the horse_flute
  // blacklist) are one-shot and run HERE, before any pool is registered, so
  // they only ever cleared relics that came from base tables / the Relics
  // mod's own injection. The curated pools registered later re-added 12 of
  // the 15 denied relics (T3 / T4 dimension pools, the marquee themes, the
  // Keebsz high-floor pool). Every pool is now built through relicAllowed(),
  // which drops RELIC_DENY ids before the per-item chance is computed — the
  // pool's combined rate is unchanged and is shared by the remaining items.
  // The two deliberate exceptions stay as their own modifiers right below:
  // Ender's Hand (Ender Dragon only) and Space Dissector (1% in T4 dims).
  var RELIC_DENY = {}
  icraft.section('loot/lootjs_overhaul/relic-deny-the-one-deny-set-for-every-relic', function () {
  removedRelics.concat(relicUserBlacklist).forEach(function (id) { RELIC_DENY[id] = true })
  })
  var relicAllowed = function (pool) {
    return pool.filter(function (id) { return RELIC_DENY[id] !== true })
  }

  icraft.section('loot/lootjs_overhaul/relic-deny-the-one-deny-set-for-every-relic-2', function () {
  let relicRemover = event.addLootTypeModifier(LootType.CHEST)
  removedRelics.forEach(r => relicRemover.removeLoot(r))

  // Ender's Hand — exclusive Dragon drop (free ender pearl teleport)
  global.icraftEntityMod(event, 'minecraft:ender_dragon')
    .addLoot(LootEntry.of('relics:enders_hand'))

  // Space Dissector — rare T4 dimension drop
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_end')
    .addLoot(LootEntry.of('relics:space_dissector').when(c => c.randomChance(0.01)))
  })

  // ── TERRAMITY GUN + AMMO + GUN-ARMOR STRIP ──
  // Design: bosses and structures from Terramity stay; guns/ammo/ammo-
  // crafting/armor sets do not fit the pack's RPG progression.
  // Recipe removal lives in recipes/recipe_audit.js Section I. This block
  // catches loot-side sources (chests, mob drops, boss drops that reference
  // these items) so stripped items can't sneak in via world-gen loot either.
  // Enchantments are disabled via Apotheosis config (Discoverable/Lootable
  // both false for the 12 gun enchants).
  icraft.section('loot/lootjs_overhaul/terramity-gun-ammo-gun-armor-strip', function () {
  let terramityGunStrip = [
    // Firearms
    'terramity:basic_pistol', 'terramity:basic_rifle', 'terramity:advanced_pistol',
    'terramity:advanced_automatic_rifle', 'terramity:advanced_burst_rifle',
    'terramity:suppressed_advanced_pistol', 'terramity:anti_material_rifle',
    'terramity:antimatter_rifle', 'terramity:conductite_laser_rifle',
    'terramity:elite_rifle', 'terramity:flintlock_pistol', 'terramity:plague_pistol',
    'terramity:big_iron', 'terramity:asphodel', 'terramity:handcannon',
    'terramity:meteor_cannon', 'terramity:moondrill_cannon', 'terramity:railgun',
    'terramity:rocket_launcher', 'terramity:pump_action_shotgun',
    'terramity:sawed_off_shotgun', 'terramity:flare_gun',
    // ('terramity:hellspec_super_shotgun' removed 2026-10-10: Terramity 0.9.8
    //  registers no such item — only its hellspec_shotshells ammo, listed
    //  below — so the entry was an "Invalid ingredient for filter" boot warning.)
    // Projectiles + ammo
    'terramity:gunkshot_projectile', 'terramity:flare_gun_projectile',
    'terramity:enderswap_projectile', 'terramity:shadowflame_bullet',
    'terramity:steel_shell', 'terramity:chthonic_shell_casing',
    'terramity:daemonium_shotshells', 'terramity:daemonium_shotshell_projectile',
    'terramity:hellspec_shotshells',
    'terramity:copper_round', 'terramity:gold_round',
    'terramity:antimatter_round', 'terramity:dimlite_round',
    'terramity:iridium_round', 'terramity:suppressed_gold_round',
    // Gun crafting + ammo containers
    'terramity:gunsmith_station', 'terramity:advanced_gun_parts',
    'terramity:ammo_bag', 'terramity:ammo_box', 'terramity:bottomless_ammo_box',
  ]
  let terramityChestStrip = event.addLootTypeModifier(LootType.CHEST)
  terramityGunStrip.forEach(id => terramityChestStrip.removeLoot(id))
  let terramityEntityStrip = event.addLootTypeModifier(LootType.ENTITY)
  terramityGunStrip.forEach(id => terramityEntityStrip.removeLoot(id))
  })

  // ── TERRAMITY ARMOR-SET STRIP ──
  // [2026-10-11, operator decision] The header above has always said "armor
  // sets", but only guns and ammo were ever listed: the armor recipes were
  // removed (recipes/recipe_audit.js I.2) while the pieces still dropped
  // (conjuror set from terramity:entities/conjurling, evil_king set from
  // entities/super_sniffer, dimlite boots in chests/infested_lab_loot, ...).
  // Same ids as recipe_audit.js I.2, minus terramity:gundalfs_hat_helmet, which
  // that list keeps as a boss drop. One predicate per roll instead of one
  // removeLoot per id (64 ids).
  icraft.section('loot/lootjs_overhaul/terramity-armor-set-strip', function () {
  let terramityArmorStrip = [
    'terramity:conductite_armor_boots', 'terramity:conductite_armor_chestplate', 'terramity:conductite_armor_leggings',
    'terramity:conductite_scouter_helmet', 'terramity:conjuror_boots', 'terramity:conjuror_chestplate',
    'terramity:conjuror_helmet', 'terramity:conjuror_leggings', 'terramity:cosmilite_armor_boots',
    'terramity:cosmilite_armor_chestplate', 'terramity:cosmilite_armor_helmet', 'terramity:cosmilite_armor_leggings',
    'terramity:dimlite_boots', 'terramity:dimlite_chestplate', 'terramity:dimlite_helmet',
    'terramity:dimlite_leggings', 'terramity:evil_king_armor_boots', 'terramity:evil_king_armor_chestplate',
    'terramity:evil_king_armor_helmet', 'terramity:evil_king_armor_leggings', 'terramity:exodium_warlock_boots',
    'terramity:exodium_warlock_chestplate', 'terramity:exodium_warlock_helmet', 'terramity:exodium_warlock_leggings',
    'terramity:hellspec_boots', 'terramity:hellspec_chestplate', 'terramity:hellspec_helmet',
    'terramity:hellspec_leggings', 'terramity:iridium_armor_boots', 'terramity:iridium_armor_chestplate',
    'terramity:iridium_armor_helmet', 'terramity:iridium_armor_leggings', 'terramity:nyxium_knight_boots',
    'terramity:nyxium_knight_chestplate', 'terramity:nyxium_knight_helmet', 'terramity:nyxium_knight_leggings',
    'terramity:onyx_armor_boots', 'terramity:onyx_armor_chestplate', 'terramity:onyx_armor_helmet',
    'terramity:onyx_armor_leggings', 'terramity:reverium_paladin_boots', 'terramity:reverium_paladin_chestplate',
    'terramity:reverium_paladin_helmet', 'terramity:reverium_paladin_leggings', 'terramity:ruby_armor_boots',
    'terramity:ruby_armor_chestplate', 'terramity:ruby_armor_helmet', 'terramity:ruby_armor_leggings',
    'terramity:sapphire_armor_boots', 'terramity:sapphire_armor_chestplate', 'terramity:sapphire_armor_helmet',
    'terramity:sapphire_armor_leggings', 'terramity:topaz_armor_boots', 'terramity:topaz_armor_chestplate',
    'terramity:topaz_armor_helmet', 'terramity:topaz_armor_leggings', 'terramity:virentium_armor_boots',
    'terramity:virentium_armor_chestplate', 'terramity:virentium_armor_helmet', 'terramity:virentium_armor_leggings',
    'terramity:void_mage_boots', 'terramity:void_mage_chestplate', 'terramity:void_mage_helmet',
    'terramity:void_mage_leggings',
  ]
  let terramityArmorSet = {}
  terramityArmorStrip.forEach(id => { terramityArmorSet[id] = true })
  let isTerramityArmor = function(stack) {
    try {
      if (!stack || stack.isEmpty()) return false
      return terramityArmorSet[String(stack.id || '')] === true
    } catch (e) { return false }
  }
  event.addLootTypeModifier(LootType.CHEST).removeLoot(ItemFilter.custom(isTerramityArmor))
  event.addLootTypeModifier(LootType.ENTITY).removeLoot(ItemFilter.custom(isTerramityArmor))
  })

  // ── TERRAMITY NON-GUN EPIC CURIO/MELEE STRIP ──
  // (audit Phase 4.1, 2026-04-27 — companion to the I.3 recipe removal in
  // recipes/recipe_audit.js. Strips the same items from chest+entity loot
  // so they can't bypass the recipe gate via worldgen. Boss-drop allocation
  // for the 7 melee weapons happens in loot/terramity_boss_drops.js, which
  // runs AFTER this strip — the strip applies to GENERIC chest pools, the
  // boss allocation adds them back on specific tier-appropriate boss kills.)
  icraft.section('loot/lootjs_overhaul/terramity-non-gun-epic-curio-melee-strip', function () {
  let terramityCurioStrip = [
    // Melee weapons (boss-allocated separately; stripped from generic loot)
    'terramity:blasphemic_rapture', 'terramity:unholy_lance',
    'terramity:davy_jones', 'terramity:olympus',
    'terramity:divine_intervention', 'terramity:planet_buster',
    'terramity:kamehameha',
    // Curios: stripped from every DEFAULT chest/entity table here, then
    // re-added on purpose by loot/terramity_structure_drops.js (which loads
    // after this file, so this strip does not eat those adds): 3 in the two
    // Terramity Nether dungeons (T3), 5 on T4 bosses. Operator decision
    // 2026-10-10: droppable, late-tier only -- never in the Overworld.
    'terramity:antimatter_pacemaker', 'terramity:nyxs_necklace',
    'terramity:antiprism', 'terramity:null_scarf',
    'terramity:dragon_band', 'terramity:sacred_speed_bracelets',
    'terramity:angel_feather', 'terramity:fortunes_favor'
  ]
  let terramityCurioChestStrip = event.addLootTypeModifier(LootType.CHEST)
  terramityCurioStrip.forEach(id => terramityCurioChestStrip.removeLoot(id))
  let terramityCurioEntityStrip = event.addLootTypeModifier(LootType.ENTITY)
  terramityCurioStrip.forEach(id => terramityCurioEntityStrip.removeLoot(id))

  // Shadow Glaive — rare T2/T3 drop
  // (Dimension lists in this file no longer name 'deep_aether:the_aether':
  //  Deep Aether adds biomes/structures to aether:the_aether and registers no
  //  dimension of its own, so that id never matched anything. 2026-10-10.)
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('twilightforest:twilight_forest', 'aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn', 'minecraft:the_nether', 'undergarden:undergarden',
      'deeperdarker:otherside', 'theabyss:the_abyss')
    .addLoot(LootEntry.of('relics:shadow_glaive').when(c => c.randomChance(0.01)))

  // Remove T4-gated mod items from ALL chest loot (shouldn't appear before T4)
  event
    .addLootTypeModifier(LootType.CHEST)
    .removeLoot('@rftoolsdim')
    .removeLoot('@mahoutsukai')

  // Blacklist Relics horse_flute globally — user dislike (summons a temporary
  // horse, doesn't really fit our progression design). The list lives next to
  // removedRelics (relicUserBlacklist) because it also feeds RELIC_DENY.
  let relicBlacklistStrip = event.addLootTypeModifier(LootType.CHEST)
  relicUserBlacklist.forEach(r => relicBlacklistStrip.removeLoot(r))

  // Strip too_many_bows:rift_shard from chest pools globally.
  // Audit Phase 2.2 (2026-04-27): the namespace collision with our
  // kubejs:icraft_rift_shard (renamed in this same phase) caused UX
  // confusion. Players see two "Rift Shard" items in JEI with different
  // tooltips and uses. Strip the too_many_bows version from generic chest
  // pools so our endgame reagent is the only "Rift Shard" players encounter
  // via the loot economy. Bows that need too_many_bows:rift_shard for their
  // crafting recipes can still be acquired directly from our T2/T3/T4 pools.
  event
    .addLootTypeModifier(LootType.CHEST)
    .removeLoot('too_many_bows:rift_shard')
  })

  // --- Tier-scaled enchanted books (7.5 / 10 / 12.5 / 15%) — MOVED 2026-10-10
  //     to loot/zz_pack_enchanted_books.js (see Section 1 above) ---

  // --- Ars Nouveau spell books — MOVED to after global strip (Section 1B) ---

  // --- Compass of Return — 2.5% in cave/structure chests only (T1 rare find) ---
  // Overworld: only dungeons, mineshafts, temples, buried treasure, mod structures
  // Excludes villages and other surface/settlement chests
  icraft.section('loot/lootjs_overhaul/compass-of-return-2.5-in-cave-structure', function () {
  event
    .addLootTableModifier(
      'minecraft:chests/simple_dungeon',
      'minecraft:chests/abandoned_mineshaft',
      'minecraft:chests/desert_pyramid',
      'minecraft:chests/jungle_temple',
      'minecraft:chests/stronghold_corridor',
      'minecraft:chests/stronghold_crossing',
      'minecraft:chests/stronghold_library',
      'minecraft:chests/buried_treasure',
      'minecraft:chests/underwater_ruin_big',
      'minecraft:chests/underwater_ruin_small',
      /dungeoncrawl:.*chests.*/,
      /explorify:.*chest.*/,   // [2026-10-10] was .*chests.* — Explorify's tables are explorify:chest/… (singular), so it matched nothing
      /^structory:.+/,
      /dungeons_plus:.*/,
      /dungeons_arise:.*/,
      /valhelsia_structures:.*chests.*/,
      /repurposed_structures:.*chests.*/
    )
    .addLoot(
      LootEntry.of('kubejs:compass_of_return').when(c => c.randomChance(0.025))
    )
  // Aether + Blue Skies: all chests are structures, so dimension filter is fine
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
    .addLoot(
      LootEntry.of('kubejs:compass_of_return').when(c => c.randomChance(0.025))
    )
  })

  // --- ISS Mana Ring — 2% in overworld structure chests: registered in
  //     Section 1B, AFTER the global ISS chest strip (search "ISS CHEST
  //     RE-ADDS"). [2026-10-10: here it sat before that strip and was removed.]

  // =========================================================================
  // SECTION 1B: GLOBAL MAGIC-ITEM STRIP (Ars Nouveau / ISS / moreartifacts)
  // =========================================================================
  // Removes every @ars_nouveau item, every irons_spellbooks item EXCEPT scrolls,
  // every @moreartifacts item and all saplings from ALL chest loot. This runs
  // BEFORE any tier-specific re-injection so we start from a clean slate.
  // Individual sections below re-add curated items at controlled rates.
  // (It does NOT strip @artifacts / @celestial_artifacts / @relics — see the
  // note on the modifier itself; relics have their own id list, removedRelics.)
  // Village sanitization (Section 6) has its own strip but this catches
  // everything else — dimension chests, structure chests, etc.
  // =========================================================================
  // ───────────────────────────────────────────────────────────────────────
  // LootJS 2.13.1 REMOVAL MECHANIC — canonical note (verified 2026-06-14 by
  // decompiling the live jar with CFR). READ THIS before reasoning about ANY
  // strip/re-add interaction in this file.
  //
  //   `removeLoot(filter)` is a ONE-SHOT, in-place `loot.removeIf(predicate)`
  //   run AT THE POSITION it sits in registration order. Every modifier in the
  //   pack mutates ONE shared loot list, applied in REGISTRATION ORDER (= source
  //   order within a script; scripts apply in load order, so a later-loading file
  //   like zz_unique_chest_strip.js runs last). There is NO persistent/deferred
  //   filter retained across actions or across modifiers, and a #tag / @namespace
  //   filter behaves EXACTLY like a single item id (just a broader predicate).
  //
  //   => A strip can only remove items ALREADY in the list when it runs; it CANNOT
  //      reach forward to items added later. So "does strip X eat add Y?" reduces
  //      entirely to ORDER: a strip eats an add ONLY if the strip is registered
  //      AFTER the add for an overlapping table. The older comments in this file
  //      blaming a "persistent filter" were misdiagnoses — the real variables are
  //      registration order and (under Lootr) which tables a modifier matches.
  //      Live proof in this same file: the gatekeeper-house `@artifacts` strip
  //      (Section 5B) is registered AFTER the T1 artifact pool (Section 1C), so it
  //      DOES strip those artifacts there — intended, and pure registration order.
  //
  //   LOAD ORDER (boot log, 2026-10-10): file names compare case-insensitively,
  //   so letters sort BEFORE '_': lootjs_overhaul.js loads before loot_overhaul.js,
  //   and zzz_* before zz_*. Do not rely on '_' to order two files.
  //
  //   TABLE REGEXES ARE FULL-MATCH (same decompile, verified 2026-10-10):
  //   ResourceLocationFilter.ByPattern.test == pattern.matcher(id).matches(). A
  //   regex passed to addLootTableModifier has to cover the WHOLE "namespace:path"
  //   id — /chests\// matches nothing, /.*chests\/.*/ matches every chests/ table.
  //   A modifier whose regex matches no table is silent: no error, no warning.
  // ───────────────────────────────────────────────────────────────────────
  // 2026-06-14 SCROLL-ECONOMY FIX (#45/ISS), re-explained per the mechanic above.
  // This `.removeLoot('@irons_spellbooks')` runs BEFORE every ISS re-add, so it
  // only ever stripped ISS items present in BASE tables — it did NOT eat our tiered
  // re-adds (registered later, they survive). Its real effect was removing
  // base-table scrolls pack-wide:
  //   • the base-table village-house scroll (~4.9%, wt2/41) → testers "never" saw it
  //   • ISS's own append_loot GLM scrolls (stronghold library 3-5, treasure compat
  //     ~89%, generic 75%) → treasure scrolls "very rare"
  // (The marquee scroll adds at ~line 2601 are registered AFTER this strip and were
  // NEVER eaten by it; that "well under 10%" symptom has another cause — variance /
  // the randomize_spell roll / Lootr — not this line.)
  // Scrolls are a documented PRIMARY mage-progression vector (TIER_SCROLL_RATE,
  // marquee scroll:true), so base-table scrolls should flow. Replace the namespace
  // strip with a predicate that strips all ISS items EXCEPT the scroll — preserving
  // the original curation (loose spellbooks / runes / inks still cleared from base
  // tables, then re-added tiered) while letting base-table scrolls through.
  // NOTE: @ars_nouveau / @moreartifacts below are NOT this footgun — they also run
  // BEFORE their re-adds, so they only clear base-table items (their intended job)
  // and the curated tiered re-adds survive. (Investigated & confirmed 2026-06-14.)
  icraft.section('loot/lootjs_overhaul/section-1b-global-magic-item-strip', function () {
  var stripISSExceptScroll = function(stack) {
    try {
      if (!stack || stack.isEmpty()) return false
      var id = String(stack.id || '')
      if (!id) { try { id = String(stack.getItem().builtInRegistryHolder().key().location()) } catch (e) {} }
      if (!id) return false
      if (id.indexOf('irons_spellbooks:') !== 0) return false
      return id !== 'irons_spellbooks:scroll'
    } catch (e) { return false }
  }
  event
    .addLootTypeModifier(LootType.CHEST)
    // NOTE: we don't `removeLoot('@artifacts')` here — but NOT for the old
    // "persistent filter" reason (per the mechanic note above, a strip here would
    // run BEFORE our tiered re-adds and would not eat them). The base Artifacts mod
    // governs its own injection via a GLM whitelist (replace:true), so that GLM is
    // the control surface; a blanket LootJS strip here is just unnecessary.
    // Village-specific sanitization handles village chests separately.
    .removeLoot('@ars_nouveau')
    .removeLoot(ItemFilter.custom(stripISSExceptScroll))  // was '@irons_spellbooks' — scrolls now exempt (see note above)
    .removeLoot('@moreartifacts')
    // Saplings are useless clutter in chests — trees are everywhere.
    // (A second line stripped '#forge:saplings': no installed mod defines that
    //  tag, so it matched nothing and LootJS does not warn about an empty tag.
    //  Removed 2026-10-11; #minecraft:saplings has 75 members incl. modded.)
    .removeLoot('#minecraft:saplings')
  })

  // ─── ISS CHEST RE-ADDS (registered AFTER the global ISS strip above) ───
  // [2026-10-10] These three adds used to be registered further up, BEFORE the
  // strip, so `stripISSExceptScroll` removed every one of them again (the same
  // bug class fixed 2026-06-14 for the boss arenas — see
  // loot/zz_iss_arena_enrichment.js). Tables / items / chances are unchanged;
  // only the registration point moved. No later strip touches these items in
  // these tables (the only later ISS strips are the village-table spell-book
  // strips in Section 6).

  // (a) Arcane essence in ISS structure chests — 45%, 2-4 (see the ARCANE
  //     ESSENCE INJECTION note near the top of the file)
  icraft.section('loot/lootjs_overhaul/iss-chest-re-adds', function () {
  event
    .addLootTableModifier(/^irons_spellbooks:chests\/.*/)
    .addLoot(LootEntry.of('irons_spellbooks:arcane_essence')
      .limitCount([2, 4])
      .when(c => c.randomChance(0.45)))

  // (b) T1 robe pieces in ISS chests — 10% combined per chest (FULL ROBE PIECE
  //     DROPS note near the top of the file)
  injectRobeDrops(
    event.addLootTableModifier(/^irons_spellbooks:chests\/.*/),
    0.10
  )

  // (c) ISS Mana Ring — 2% in overworld structure chests (T2 lucky find).
  // Mana Ring is craftable at T2 (recipe re-tiered in tier_gated_recipes.js
  // I.9 — diamond -> mana_diamond), but it's also a reasonable lucky find
  // for casters exploring before they unlock Botania transmutation. Same
  // chest pool as the compass of return — dungeons, mineshafts, temples,
  // mod structures — skips village houses so it's not free power in a
  // starter village.
  event
    .addLootTableModifier(
      'minecraft:chests/simple_dungeon',
      'minecraft:chests/abandoned_mineshaft',
      'minecraft:chests/desert_pyramid',
      'minecraft:chests/jungle_temple',
      'minecraft:chests/stronghold_corridor',
      'minecraft:chests/stronghold_crossing',
      'minecraft:chests/stronghold_library',
      /dungeoncrawl:.*chests.*/,
      /explorify:.*chest.*/,   // [2026-10-10] was .*chests.* (matched nothing: explorify:chest/…)
      /^structory:.+/,
      /dungeons_plus:.*/,
      /dungeons_arise:.*/,
      /valhelsia_structures:.*chests.*/,
      /repurposed_structures:.*chests.*/
    )
    .addLoot(
      LootEntry.of('irons_spellbooks:mana_ring').when(c => c.randomChance(0.02))
    )
  })

  // --- Ars Nouveau spell books (re-add AFTER global strip) ---
  // T1 (Overworld): Novice spell book (2.5%)
  icraft.section('loot/lootjs_overhaul/ars-nouveau-spell-books', function () {
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .addLoot(
      LootEntry.of('ars_nouveau:novice_spell_book').when(c => c.randomChance(0.025))
    )

  // T2 (TF, Aether, Blue Skies): Apprentice spell book (5%)
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('twilightforest:twilight_forest',
      'aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
    .addLoot(
      LootEntry.of('ars_nouveau:apprentice_spell_book').when(c => c.randomChance(0.05))
    )

  // T3 (Nether, Undergarden, Deeper Darker, Abyss): Archmage spell book (3%)
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_nether', 'undergarden:undergarden', 'deeperdarker:otherside', 'theabyss:the_abyss')
    .addLoot(
      LootEntry.of('ars_nouveau:archmage_spell_book').when(c => c.randomChance(0.03))
    )

  // T4 (End): Archmage spell book (5%)
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_end')
    .addLoot(
      LootEntry.of('ars_nouveau:archmage_spell_book').when(c => c.randomChance(0.05))
    )
  })

  // --- Ars Nouveau glyphs (tiered pools) ---
  // Spell books are useless without glyphs inscribed at a Scribes Table. We
  // seed the spell toolkit through chest loot, front-loading Forms
  // (projectile/touch/self/aoe) so T1-T2 players can actually cast. Per-item
  // chance = target_rate / pool_size, rolled independently per chest.

  // 2026-04-20: glyph tier arrays rebuilt from Ars Nouveau's own config
  // (config/ars_nouveau/glyph_*.toml, `glyph_tier` field). Our previous
  // manual categorization disagreed with the mod's own tiering on >20
  // glyphs — most infamously placing `heal`, `smelt`, `conjure_water`,
  // `extend_time`, `duration_down` in T1 (AN marks them T2), and putting
  // `launch`, `leap`, `bounce`, `pull`, `snare`, `toss`, `fell` in T2 (AN
  // marks them T1). That's why tester saw "T2 glyphs" in Overworld
  // villages — our T1 add list contained AN-T2 glyphs, so they legitimately
  // spawned in Overworld.
  //
  // AN has 3 tiers (ONE/TWO/THREE, plus CREATIVE which we ignore). Mapping
  // to our 4 dimension tiers:
  //   AN T1 (35 glyphs) -> Overworld (our T1)
  //   AN T2 (28 glyphs) -> TF/Aether/Blue Skies (our T2)
  //   AN T3 (14 glyphs) -> Nether/Undergarden + End/DD/Abyss (our T3 + T4)
  // Arrays are exhaustive per AN's config — any future AN update adding
  // glyphs will need manual re-sync.

  icraft.section('loot/lootjs_overhaul/ars-nouveau-glyphs', function () {
  var glyphT1 = [
    'ars_nouveau:glyph_amplify', 'ars_nouveau:glyph_bounce', 'ars_nouveau:glyph_break',
    'ars_nouveau:glyph_craft', 'ars_nouveau:glyph_cut', 'ars_nouveau:glyph_delay',
    'ars_nouveau:glyph_dispel', 'ars_nouveau:glyph_evaporate', 'ars_nouveau:glyph_fell',
    'ars_nouveau:glyph_freeze', 'ars_nouveau:glyph_gust', 'ars_nouveau:glyph_harm',
    'ars_nouveau:glyph_harvest', 'ars_nouveau:glyph_ignite', 'ars_nouveau:glyph_interact',
    'ars_nouveau:glyph_launch', 'ars_nouveau:glyph_leap', 'ars_nouveau:glyph_light',
    'ars_nouveau:glyph_phantom_block', 'ars_nouveau:glyph_pickup', 'ars_nouveau:glyph_place_block',
    'ars_nouveau:glyph_projectile', 'ars_nouveau:glyph_pull', 'ars_nouveau:glyph_randomize',
    'ars_nouveau:glyph_redstone_signal', 'ars_nouveau:glyph_rotate', 'ars_nouveau:glyph_rune',
    'ars_nouveau:glyph_self', 'ars_nouveau:glyph_sensitive', 'ars_nouveau:glyph_snare',
    'ars_nouveau:glyph_summon_steed', 'ars_nouveau:glyph_summon_wolves', 'ars_nouveau:glyph_toss',
    'ars_nouveau:glyph_touch', 'ars_nouveau:glyph_underfoot'
  ]
  var glyphT1PerItem = 0.12 / glyphT1.length  // ~12% combined
  var glyphModT1 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
  glyphT1.forEach(g => {
    glyphModT1.addLoot(LootEntry.of(g).when(c => c.randomChance(glyphT1PerItem)))
  })
  })

  var glyphT2 = [
    'ars_nouveau:glyph_accelerate', 'ars_nouveau:glyph_animate_block', 'ars_nouveau:glyph_aoe',
    'ars_nouveau:glyph_cold_snap', 'ars_nouveau:glyph_conjure_water', 'ars_nouveau:glyph_crush',
    'ars_nouveau:glyph_dampen', 'ars_nouveau:glyph_decelerate', 'ars_nouveau:glyph_duration_down',
    'ars_nouveau:glyph_ender_inventory', 'ars_nouveau:glyph_exchange', 'ars_nouveau:glyph_explosion',
    'ars_nouveau:glyph_extend_time', 'ars_nouveau:glyph_extract', 'ars_nouveau:glyph_firework',
    'ars_nouveau:glyph_flare', 'ars_nouveau:glyph_fortune', 'ars_nouveau:glyph_gravity',
    'ars_nouveau:glyph_grow', 'ars_nouveau:glyph_heal', 'ars_nouveau:glyph_infuse',
    'ars_nouveau:glyph_invisibility', 'ars_nouveau:glyph_name', 'ars_nouveau:glyph_pierce',
    'ars_nouveau:glyph_sense_magic', 'ars_nouveau:glyph_slowfall', 'ars_nouveau:glyph_smelt',
    'ars_nouveau:glyph_wind_shear'
  ]
  icraft.section('loot/lootjs_overhaul/ars-nouveau-glyphs-2', function () {
  var glyphT2PerItem = 0.14 / glyphT2.length  // ~14% combined
  var glyphModT2 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('twilightforest:twilight_forest', 'aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
  glyphT2.forEach(g => {
    glyphModT2.addLoot(LootEntry.of(g).when(c => c.randomChance(glyphT2PerItem)))
  })
  })

  var glyphT3 = [
    'ars_nouveau:glyph_blink', 'ars_nouveau:glyph_fangs', 'ars_nouveau:glyph_glide',
    'ars_nouveau:glyph_hex', 'ars_nouveau:glyph_intangible', 'ars_nouveau:glyph_lightning',
    'ars_nouveau:glyph_linger', 'ars_nouveau:glyph_orbit', 'ars_nouveau:glyph_split',
    'ars_nouveau:glyph_summon_decoy', 'ars_nouveau:glyph_summon_undead', 'ars_nouveau:glyph_summon_vex',
    'ars_nouveau:glyph_wall', 'ars_nouveau:glyph_wither'
  ]
  icraft.section('loot/lootjs_overhaul/ars-nouveau-glyphs-3', function () {
  var glyphT3PerItem = 0.15 / glyphT3.length  // ~15% combined
  var glyphModT3 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_nether', 'undergarden:undergarden', 'deeperdarker:otherside', 'theabyss:the_abyss')
  glyphT3.forEach(g => {
    glyphModT3.addLoot(LootEntry.of(g).when(c => c.randomChance(glyphT3PerItem)))
  })
  })

  // AN has 3 tiers — no T4. End chests still get glyph drops,
  // but they pull from AN T3 (the highest tier AN defines). Kept the
  // glyphT4 variable as an alias of glyphT3 so downstream `.concat(glyphT4)`
  // calls continue to work unchanged.
  var glyphT4 = glyphT3
  icraft.section('loot/lootjs_overhaul/ars-nouveau-glyphs-4', function () {
  var glyphT4PerItem = 0.18 / glyphT4.length  // ~18% combined (AN T3 glyphs at the End rate)
  var glyphModT4 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_end')
  glyphT4.forEach(g => {
    glyphModT4.addLoot(LootEntry.of(g).when(c => c.randomChance(glyphT4PerItem)))
  })
  })

  // --- Off-tier glyph strips (keep T2+ glyphs out of T1, T3+ out of T2, etc.) ---
  // Registered AFTER the glyph-add modifiers, so per the mechanic note (Section 1B)
  // they run later on the shared list and cleanly remove off-tier glyphs that
  // earlier modifiers (or base tables) placed. (This is the site that disproves the
  // old "persistent filter" comments — there is no persistent filter; it's just
  // registration order. Caveat: these global LootType.CHEST strips can still miss
  // village contexts under Lootr, which is why Section 6 re-strips per-table.)
  icraft.section('loot/lootjs_overhaul/off-tier-glyph-strips', function () {
  var _glyphStripOW = event.addLootTypeModifier(LootType.CHEST).anyDimension('minecraft:overworld')
  glyphT2.concat(glyphT3, glyphT4).forEach(g => { _glyphStripOW.removeLoot(g) })

  var _glyphStripT2 = event.addLootTypeModifier(LootType.CHEST)
    .anyDimension('twilightforest:twilight_forest', 'aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
  glyphT3.concat(glyphT4).forEach(g => { _glyphStripT2.removeLoot(g) })
  })

  // [2026-10-10] There is NO off-tier strip for the Nether / Undergarden any
  // more. The old one removed `glyphT4` there — but glyphT4 is an ALIAS of
  // glyphT3 (AN has no 4th tier), so it stripped all 14 T3 glyphs out of the
  // very dimensions whose T3 pool (glyphModT3, ~15% combined) had just added
  // them: no glyph ever dropped in the Nether or the Undergarden. Nothing is
  // "above tier" in a T3 dimension, so there is nothing to strip.

  // =========================================================================
  // SECTION 1C: TIERED ARTIFACT RE-INJECTION BY DIMENSION
  // =========================================================================
  // After stripping all artifact mod items globally, re-inject curated pools
  // at tier-appropriate rates gated by dimension. Each tier has items suited
  // to its difficulty level. Per-item chance = target_rate / pool_size.
  // =========================================================================

  // --- T1 Pool (~10% combined) — Overworld ---
  // Utility/movement artifacts + starter magic items. Safe, non-combat.
  var artifactT1Pool = relicAllowed([
    'artifacts:snorkel', 'artifacts:anglers_hat', 'artifacts:superstitious_hat',
    'artifacts:lucky_scarf', 'artifacts:cloud_in_a_bottle',     'artifacts:running_shoes', 'artifacts:umbrella', 'artifacts:flippers',
    'artifacts:snowshoes', 'artifacts:bunny_hoppers', 'artifacts:digging_claws',
    'artifacts:golden_hook',
    'ars_nouveau:novice_spell_book', 'ars_nouveau:source_gem',
    'irons_spellbooks:common_ink',
    // moreartifacts T1 — flavor curios (audit Phase 2.1, 2026-04-27)
    'moreartifacts:melody_plushie', 'moreartifacts:lucky_emerald_ring',
    // too_many_bows bows REMOVED 2026-06-03 — now boss-EXCLUSIVE trophy drops
    // (unique_itemset_registry.js + boss_unique_drops.js). See zz_unique_chest_strip.js.
    // celestial_artifacts T1 — flavor (re-audit 2026-05-13: angel_desire
    // moved to T3 — pure_nether_star recipe is endgame; bearing_stamen
    // moved here — basic plant material recipe; etchings T1: desire/origin)
    'celestial_artifacts:yellow_duck', 'celestial_artifacts:sakura_hairpin',
    'celestial_artifacts:bearing_stamen',
    'celestial_artifacts:desire_etching', 'celestial_artifacts:origin_etching'
  ])
  // 2026-04-22: was 15 independent addLoot calls at ~0.67% each. Math
  // said 0.1 artifacts/chest expected, but variance allowed 2-4 in
  // unlucky chests — tester reported a Waystone Towers chest (backed by
  // minecraft:chests/stronghold_corridor) dropping 4 artifacts at once.
  //
  // Rewritten using addAlternativesLoot: entries are evaluated in order,
  // first to pass its .when() fires, rest skipped. With each alternative
  // at 10%/15 ≈ 0.667% randomChance:
  //   P(any fires)  = 1 - 0.99333^15 ≈ 10% ← overall rate held steady
  //   P(exactly 1)  = same as P(any), because at most 1 alternative fires
  //   P(multiple)   = 0 (structural)
  // So Overworld chests now get at most 1 T1 artifact from this path.
  icraft.section('loot/lootjs_overhaul/t1-pool-overworld', function () {
  var modT1 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
  var t1PerAlt = 0.10 / artifactT1Pool.length
  var t1Alternatives = artifactT1Pool.map(function(item) {
    return LootEntry.of(item).when(function(c) { return c.randomChance(t1PerAlt) })
  })
  modT1.addAlternativesLoot.apply(modT1, t1Alternatives)
  })

  // --- T2 Pool (~12% combined) — Twilight Forest, Aether, Blue Skies ---
  // Combat + defensive artifacts + mid-tier magic.
  var artifactT2Pool = relicAllowed([
    'artifacts:power_glove', 'artifacts:feral_claws', 'artifacts:pickaxe_heater',
    'artifacts:cross_necklace', 'artifacts:panic_necklace', 'artifacts:antidote_vessel',
    'artifacts:crystal_heart', 'artifacts:obsidian_skull',
    'celestial_artifacts:cross_necklace', 'celestial_artifacts:iron_scabbard',
    'celestial_artifacts:copper_reinforce_plate', 'celestial_artifacts:amethyst_ring',
    'celestial_artifacts:forest_cloak',
    // (re-audit 2026-05-13: holy_talisman -> T3 endgame, holy_sword -> T3,
    //  bearing_stamen -> T1, chaotic_pendant added from T4, prayer_crown
    //  added from T4, spirit_crown removed entirely)
    'celestial_artifacts:chaotic_pendant', 'celestial_artifacts:prayer_crown',
    'celestial_artifacts:life_bracelet', 'celestial_artifacts:fang_necklace',
    'ars_nouveau:apprentice_spell_book', 'irons_spellbooks:uncommon_ink',
    // moreartifacts T2 — defensive curios + mid-tier accessories
    // (audit Phase 2.1, 2026-04-27 — Hero/Ankh → T2 per locked-in mapping)
    'moreartifacts:hero_shield', 'moreartifacts:ankh_shield', 'moreartifacts:ankh_charm',
    'moreartifacts:vanir_mask', 'moreartifacts:tainted_mirror',
    // too_many_bows bows REMOVED 2026-06-03 — now boss-EXCLUSIVE trophy drops.
    // celestial_artifacts T2 — green/dark_green/red curios + EPIC defensive
    // (re-audit 2026-05-13: bearing_stamen -> T1)
    'celestial_artifacts:precious_bracelet', 'celestial_artifacts:spirit_necklace',
    'celestial_artifacts:emerald_ring', 'celestial_artifacts:emerald_necklace',
    'celestial_artifacts:emerald_bracelet', 'celestial_artifacts:gaia_totem',
    'celestial_artifacts:ring_of_life', 'celestial_artifacts:spirit_bracelet',
    'celestial_artifacts:spirit_arrow_bag',
    'celestial_artifacts:red_ruby_bracelet', 'celestial_artifacts:scarlet_bracelet',
    // etchings T2: truth (raiders), life (high-HP mobs)
    'celestial_artifacts:truth_etching', 'celestial_artifacts:life_etching'
  ])
  icraft.section('loot/lootjs_overhaul/t2-pool-twilight-forest-aether-blue-skies', function () {
  var artifactT2PerItem = 0.12 / artifactT2Pool.length  // 12% combined
  var modT2 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('twilightforest:twilight_forest', 'aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
  artifactT2Pool.forEach(item => {
    modT2.addLoot(LootEntry.of(item).when(c => c.randomChance(artifactT2PerItem)))
  })
  })

  // --- T3 Pool (~14% combined) — Nether, Undergarden ---
  // Strong artifacts + some relics + advanced magic.
  // (relics:ice_skates / roller_skates / midnight_robe are on RELIC_DENY and are
  //  dropped by relicAllowed(). 'artifacts:drama_mask' removed 2026-10-10: the
  //  installed Artifacts 9.5.16 has no such item — the entry produced an empty
  //  stack and wasted its share of the pool.)
  var artifactT3Pool = relicAllowed([
    'artifacts:night_vision_goggles',
    'artifacts:universal_attractor', 'artifacts:charm_of_sinking',
    'relics:ice_skates', 'relics:rage_glove', 'relics:hunter_belt',
    'relics:roller_skates', 'relics:bastion_ring', 'relics:midnight_robe',
    'ars_nouveau:archmage_spell_book', 'irons_spellbooks:rare_ink',
    // moreartifacts T3 — fire/decay/Nether-themed RARE curios
    // (audit Phase 2.1, 2026-04-27)
    'moreartifacts:blazing_treads', 'moreartifacts:envenomed_quiver',
    'moreartifacts:molten_quiver', 'moreartifacts:fire_stone',
    'moreartifacts:venom_stone', 'moreartifacts:decay_stone',
    'moreartifacts:necroplasm_amulet', 'moreartifacts:netherite_headgear',
    'moreartifacts:obsidian_shield', 'moreartifacts:recall_potion',
    'moreartifacts:withered_bezoar', 'moreartifacts:wither_shard',
    'moreartifacts:gilded_scarf', 'moreartifacts:ruby_ring',
    'moreartifacts:mechanical_claw', 'moreartifacts:ice_stone',
    // too_many_bows T3 — BOWS REMOVED 2026-06-03 (boss-EXCLUSIVE now); the
    // non-bow reagent + curios are kept (cursed_stone is a thrown item, not a bow):
    'too_many_bows:cursed_stone', 'too_many_bows:soul_fragment',
    'too_many_bows:wind_glove', 'too_many_bows:stormbound_signet',
    // celestial_artifacts T3 — corruption + dark_purple + dark_aqua
    // (re-audit 2026-05-13: twisted_brain REMOVED -- design-intent entity-
    //  drop only; soul_box -> T4 endgame; angel_desire/holy_talisman/holy_sword
    //  /evil_eye added from T1/T2/T4; end_etching added)
    'celestial_artifacts:cursed_protector', 'celestial_artifacts:destroyer_badge',
    'celestial_artifacts:gluttony_badge', 'celestial_artifacts:greedy_heart',
    'celestial_artifacts:magic_horseshoe',
    'celestial_artifacts:sacrificial_object',
    'celestial_artifacts:ender_protector',
    'celestial_artifacts:war_dead_badge', 'celestial_artifacts:corrupt_badge',
    'celestial_artifacts:hidden_bracelet', 'celestial_artifacts:shadow_pendant',
    'celestial_artifacts:demon_curse', 'celestial_artifacts:cursed_talisman',
    'celestial_artifacts:twisted_scabbard', 'celestial_artifacts:catastrophe_scroll',
    'celestial_artifacts:abyss_will_badge', 'celestial_artifacts:lock_of_abyss',
    'celestial_artifacts:angel_desire', 'celestial_artifacts:holy_talisman',
    'celestial_artifacts:holy_sword', 'celestial_artifacts:evil_eye',
    // etching T3: end (harmful-effect-count theme)
    'celestial_artifacts:end_etching'
    // flight_ring deliberately NOT in T3 -- per 2026-05-13 design call,
    // it lives only in End+ as an extremely-rare standalone entry.
  ])
  icraft.section('loot/lootjs_overhaul/t3-pool-nether-undergarden', function () {
  var artifactT3PerItem = 0.14 / artifactT3Pool.length  // 14% combined
  var modT3 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_nether', 'undergarden:undergarden', 'deeperdarker:otherside', 'theabyss:the_abyss')
  artifactT3Pool.forEach(function(item) {
    modT3.addLoot(LootEntry.of(item).when(c => c.randomChance(artifactT3PerItem)))
  })
  })

  // --- T4 Pool (~16% combined) — End ---
  // Endgame artifacts + powerful relics.
  // (relics:enders_hand / space_dissector / elytra_booster / magic_mirror are on
  //  RELIC_DENY and are dropped by relicAllowed(): Ender's Hand stays Dragon-
  //  exclusive and Space Dissector keeps only its own 1% T4 modifier.)
  icraft.section('loot/lootjs_overhaul/t4-pool-end', function () {
  var artifactT4Pool = relicAllowed([
    'relics:enders_hand', 'relics:space_dissector', 'relics:shadow_glaive',
    'relics:elytra_booster', 'relics:magic_mirror', 'relics:holy_locket',
    'relics:arrow_quiver', 'relics:wool_mitten',
    // (re-audit 2026-05-13: nebula_cube + the_end_dust REMOVED (base
    //  crafting materials, not curios); flight_ring -> separate End+
    //  rare entry below; prayer_crown -> T2; spirit_crown REMOVED
    //  entirely (CA jungle_temple GLM covers it); end_etching -> T3;
    //  soul_box added from T3; angel_pearl added from non-pool)
    'celestial_artifacts:demon_heart', 'celestial_artifacts:abyss_core',
    'celestial_artifacts:angel_heart', 'celestial_artifacts:angel_pearl',
    'celestial_artifacts:soul_box',
    // moreartifacts T4 — End/Sculk-themed endgame curios
    // (audit Phase 2.1, 2026-04-27 — Dragon/Sculk → T4 per locked-in mapping)
    'moreartifacts:ender_dragon_claw', 'moreartifacts:dragon_eye',
    'moreartifacts:enderian_treads', 'moreartifacts:sculk_treads',
    'moreartifacts:enderian_eye', 'moreartifacts:shulked_clock',
    'moreartifacts:shulker_heart', 'moreartifacts:true_enderian_scarf',
    'moreartifacts:echo_glove',
    // too_many_bows T4 — BOWS REMOVED 2026-06-03 (boss-EXCLUSIVE now); kept the
    // non-bow reagent + curio:
    'too_many_bows:power_crystal', 'too_many_bows:dead_eyes_pendant',
    // celestial_artifacts T4 — endgame curios
    // (re-audit 2026-05-13: evil_eye -> T3; the_end_dust REMOVED (base
    //  material); chaotic_pendant -> T2)
    'celestial_artifacts:ender_jump_scepter',
    'celestial_artifacts:cursed_totem', 'celestial_artifacts:twisted_heart',
    'celestial_artifacts:twisted_scroll',
    'celestial_artifacts:heart_of_revenge',
    // etchings T4: nihility (abyss-damage), chaotic (explosion-damage)
    'celestial_artifacts:nihility_etching', 'celestial_artifacts:chaotic_etching'
  ])
  var artifactT4PerItem = 0.16 / artifactT4Pool.length  // 16% combined
  var modT4 = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_end')
  artifactT4Pool.forEach(function(item) {
    modT4.addLoot(LootEntry.of(item).when(c => c.randomChance(artifactT4PerItem)))
  })
  })

  // --- Flight Ring: ultra-rare End+ standalone (0.5% per End+ chest) ---
  // Sits outside the T4 pool so the rate is independent of pool size.
  // Per 2026-05-13 design call: creative-flight unlock should be a
  // legendary find, not a tier-rate-shared chance.
  icraft.section('loot/lootjs_overhaul/flight-ring-ultra-rare-end-standalone', function () {
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_end')
    .addLoot(LootEntry.of('celestial_artifacts:flight_ring')
      .when(function(c) { return c.randomChance(0.005) }))
  })

  // =========================================================================
  // SECTION 2: TIER 1 STRUCTURE LOOT (Overworld)
  // Remove diamonds
  // =========================================================================
  // Overworld structures should NOT contain diamonds or netherite.
  // (The legacy tier-token seeding that used to live here is retired; Codex
  // tokens are seeded by loot/codex_exploration_drops.js.)
  //
  // In this section: Explorify, Villages & Pillages, Unwrecked Ships, Better
  // Desert Temples, Celestial Artifacts. The other Overworld structure mods are
  // in Sections 4B / 4C; the blanket pre-T3 diamond strip is Section 5A1.5.
  // =========================================================================

  // --- Dungeon Crawl: MOVED to Section 4B (more granular coverage) ---

  // --- Explorify (all chests — Overworld structures) ---
  // [2026-10-10] regex was /explorify:.*chests.*/ — Explorify's three tables are
  // explorify:chest/… (singular), so it matched nothing.
  icraft.section('loot/lootjs_overhaul/explorify', function () {
  event
    .addLootTableModifier(/explorify:.*chest.*/)
    .removeLoot('minecraft:diamond')
  })

  // --- Dungeons Plus: MOVED to Section 4B (common/rare split) ---

  // --- Structory + Structory Towers: MOVED to Section 4B (chests-scoped) ---

  // --- Villages & Pillages ---
  // No T1 tokens — villages are starting areas, not progression structures
  icraft.section('loot/lootjs_overhaul/villages-pillages', function () {
  event
    .addLootTableModifier(/^villagesandpillages:.+/)
    .removeLoot('minecraft:diamond')
  })

  // --- Unwrecked Ships ---
  icraft.section('loot/lootjs_overhaul/unwrecked-ships', function () {
  event
    .addLootTableModifier(/unwrecked_ships:.*/)
    .removeLoot('minecraft:diamond')
  })

  // --- Better Desert Temples: storage tier (food_storage, storage, pot, wardrobe) ---
  // OPERATOR EXEMPTION (2026-06-01): desert temples keep their arcane flavor. The
  // global Section-1B strip wipes @irons_spellbooks from ALL chests; these tiered
  // re-adds put the ISS essence/ink back into BDT chests specifically (running AFTER
  // the strip, the same proven pattern as the Ars spell-book re-adds in Section 1B).
  icraft.section('loot/lootjs_overhaul/better-desert-temples-storage-tier', function () {
  event
    .addLootTableModifier(/betterdeserttemples:.*(?:food_storage|storage|pot|wardrobe)/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('irons_spellbooks:arcane_essence').limitCount([1, 2]).when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.12)))
  })

  // --- Better Desert Temples: mid tier (lab, library, statue, tomb) ---
  icraft.section('loot/lootjs_overhaul/better-desert-temples-mid-tier', function () {
  event
    .addLootTableModifier(/betterdeserttemples:.*(?:lab|library|statue|tomb(?!_pharaoh))/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('irons_spellbooks:arcane_essence').limitCount([1, 3]).when(c => c.randomChance(0.40)))
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.18)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.06)))
  })

  // --- Better Desert Temples: pharaoh tier (tomb_pharaoh, pharaoh_hidden) ---
  // [2026-10-10] regex was /betterdeserttemples:.*pharaoh/ — table regexes are
  // full-match, so it covered chests/tomb_pharaoh but NOT chests/pharaoh_hidden.
  icraft.section('loot/lootjs_overhaul/better-desert-temples-pharaoh-tier', function () {
  event
    .addLootTableModifier(/betterdeserttemples:.*pharaoh.*/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('irons_spellbooks:arcane_essence').limitCount([2, 4]).when(c => c.randomChance(0.50)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.15)))
  })

  // Overhauled Structures ("Epic Dungeons", namespace `overhauledstructures`) IS
  // installed — it is handled in Section 4B. Loot Integrations is not installed
  // (its block was removed 2026-04-19; restore from git history if it returns).

  // --- Celestial Artifacts ---
  icraft.section('loot/lootjs_overhaul/celestial-artifacts', function () {
  event
    .addLootTableModifier(/celestial_artifacts:.*/)
    .removeLoot('minecraft:diamond')
  })

  // =========================================================================
  // SECTION 3: TIER 2 STRUCTURE LOOT (Dimensional dungeons)
  // These structures exist in T2 dimensions — allow diamonds but no netherite
  // =========================================================================

  // --- IDAS: MOVED to Section 4B (overworld/treasure split) ---

  // --- Keebsz Battle Towers ---
  // Loot tables confirmed: keebsz:{biome}/floor{N}and{N+1} (6 biomes × 5 tiers)
  // Lower floors (1-4) = T1, mid floors (5-6) = T1-T2, upper floors (7-10) = T2
  //
  // ALIAS TABLES (2026-10-11): the sandstone tower's underground floor pieces
  // name keebsz:floor3and4 / floor5and6 / floor7and8 — no biome folder, and no
  // such table was shipped, so those 48 chests were empty. kubejs/data now
  // gives each of those ids a table that forwards to keebsz:desert/floorNandM
  // (dev/loot_audit/alias_tables.json). LootJS sees only the ROOT id — the
  // alias — so every keebsz regex in this pack makes the biome folder optional:
  // (?:.*\/)? .
  icraft.section('loot/lootjs_overhaul/keebsz-battle-towers', function () {
  event
    .addLootTableModifier(/keebsz:(?:.*\/)?floor[12]and[23]/)
    .removeLoot('minecraft:diamond')

  event
    .addLootTableModifier(/keebsz:(?:.*\/)?floor[35]and[46]/)
    .removeLoot('minecraft:diamond')

  // [2026-10-10] was /keebsz:.*\/floor[79]and[810]/, which (full-match, and
  // "[810]" being a single character) never matched floor9and10.
  event
    .addLootTableModifier(/keebsz:(?:.*\/)?floor(?:7and8|9and10)/)
    .removeLoot('minecraft:diamond_horse_armor')
  })

  // --- Iron's Spellbooks structures ---
  icraft.section('loot/lootjs_overhaul/irons-spellbooks-structures', function () {
  event
    .addLootTableModifier(/irons_spellbooks:.*chests.*/)
    .removeLoot('minecraft:diamond_horse_armor')
  })

  // --- Moog's End Structures (T4 content — allow everything, add thematic loot) ---
  // MES loot tables live at data/mes/loot_tables/*.json (no /chests/ subfolder)
  // e.g. mes:cathedral_rare, mes:mega_ship_treasure, mes:houses_common.
  // Old regex /mes:.*chests.*/ matched zero tables (audit 2026-04-19).
  icraft.section('loot/lootjs_overhaul/moogs-end-structures', function () {
  event
    .addLootTableModifier(/^mes:.+/)
    .addLoot(LootEntry.of('minecraft:chorus_fruit').limitCount([4, 8]).when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('minecraft:ender_pearl').limitCount([2, 4]).when(c => c.randomChance(0.05)))
    .addLoot(LootEntry.of('minecraft:shulker_shell').when(c => c.randomChance(0.03)))
  })

  // =========================================================================
  // SECTIONS 4–4H: BOSS ENTITY LOOT MODIFIERS
  // REMOVED — boss material + Simply Swords unique drops are handled by
  // loot_overhaul.js (and the per-mod *_boss_drops.js files) to avoid
  // duplicate drops. What this file still registers outside chest loot is
  // listed in the header (mob essence/robe drops, safety strips, the class-
  // artifact pouch tables in Section 8.5, grass seeds).
  // =========================================================================

  // =========================================================================
  // SECTION 4B: NEWLY VERIFIED STRUCTURE MODS
  // Registry-confirmed loot table namespaces from scan3/scan4
  // =========================================================================

  // --- When Dungeons Arise (131 tables) ---
  // [2026-10-11] The two group regexes below ended in "\/" with nothing after
  // it; table regexes are full-match, so they matched NO table. Completed with
  // .* (operator ruling: the structures generate, so the rules must reach
  // them). No change in what drops: loot_overhaul.js already strips diamonds
  // from every dungeons_arise:chests/ table in the Overworld.
  // OVERWORLD ONLY, like that strip (operator ruling 2026-10-11, decision
  // sheet D3): the aviary generates only in the End in this pack, and a T1-T2
  // diamond strip has no business in a T4 chest.
  // T1-T2 structures: villages, pubs, fishing huts, farms
  icraft.section('loot/lootjs_overhaul/when-dungeons-arise', function () {
  event
    .addLootTableModifier(
      /dungeons_arise:chests\/(fishing_hut|bandit_village|greenwood_pub|giant_mushroom|bathhouse|aviary)\/.*/)
    .anyDimension('minecraft:overworld')
    .removeLoot('minecraft:diamond')

  // T2 structures: temples, towers, foundry
  // (desert_city_*: alias tables for three bandit-tower chests,
  //  dev/loot_audit/alias_tables.json)
  event
    .addLootTableModifier(
      /dungeons_arise:chests\/(abandoned_temple|bandit_towers|foundry|scorched_mines)\/.*/,
      /dungeons_arise:chests\/desert_city_(?:big|medium|small)/)
    .anyDimension('minecraft:overworld')
    .removeLoot('minecraft:diamond')

  // T2-T3 structures: heavenly series (challenger, conqueror, rider).
  // No rule here on purpose. The modifier that used to sit here was a
  // placeholder (a strip of an item these tables do not hold, on a regex that
  // matched nothing); removed 2026-10-11.

  // Catch-all treasure tables (T2+). Same action-required constraint.
  event
    .addLootTableModifier(/dungeons_arise:chests\/.*treasure/,
      'dungeons_arise:chests/desert_city_big')   // alias table -> bandit_towers_treasure
    .removeLoot('minecraft:diamond_horse_armor')
  })

  // --- Repurposed Structures ---
  // Installed (173 loot tables; the old "NOT PRESENT" note here was wrong).
  // No dedicated tier strip: its Overworld chests are covered by the blanket
  // pre-T3 diamond strip (Section 5A1.5); its chests/ tables also take the
  // compass-of-return / mana-ring / Codex-token adds.

  // --- Valhelsia Structures (11 chest tables) ---
  // T1-T2: common structures
  icraft.section('loot/lootjs_overhaul/valhelsia-structures', function () {
  event
    .addLootTableModifier(
      'valhelsia_structures:chests/castle',
      'valhelsia_structures:chests/castle_ruin',
      'valhelsia_structures:chests/desert_house',
      'valhelsia_structures:chests/forge',
      'valhelsia_structures:chests/kitchen',
      'valhelsia_structures:chests/miscellaneous',
      'valhelsia_structures:chests/player_house',
      'valhelsia_structures:chests/witch_hut')
    .removeLoot('minecraft:diamond')

  // T2: spawner dungeon + treasure
  event
    .addLootTableModifier(
      'valhelsia_structures:chests/spawner_dungeon',
      'valhelsia_structures:chests/treasure')
    .removeLoot('minecraft:diamond_horse_armor')
  })

  // --- IDAS: Integrated Dungeons and Structures (144 tables) ---
  // [2026-10-11] /idas:chests\/(?!.*treasure)/ matched NO table (full-match:
  // it needed a trailing .*). Completed, and kept to the Overworld: IDAS also
  // has Nether structure chests (T3, diamonds allowed). No change in what
  // drops there — the blanket pre-T3 strip (Section 5A1.5) already removes
  // these diamonds.
  // General overworld structures (T1)
  icraft.section('loot/lootjs_overhaul/idas-integrated-dungeons-and-structures', function () {
  event
    .addLootTableModifier(/idas:chests\/(?!.*treasure).*/,
      'minecraft:house_1')   // alias table -> idas:chests/abandonedhouse/abandonedhouse
    .anyDimension('minecraft:overworld')
    .removeLoot('minecraft:diamond')

  // Treasure tables within IDAS (T2)
  event
    .addLootTableModifier(/idas:chests\/.*treasure/)
    .removeLoot('minecraft:diamond_horse_armor')
  })

  // --- Integrated Stronghold ---
  // Installed (20 loot tables; the old "NOT PRESENT" note here was wrong).
  // No dedicated modifier: Overworld chests are covered by Section 5A1.5.

  // --- Dungeons Plus (31 tables) ---
  // Common chests (T1)
  icraft.section('loot/lootjs_overhaul/dungeons-plus', function () {
  event
    .addLootTableModifier(/dungeons_plus:chests\/.*\/common/)
    .removeLoot('minecraft:diamond')

  // Rare chests (T2)
  event
    .addLootTableModifier(/dungeons_plus:chests\/.*\/rare/)
    .removeLoot('minecraft:diamond_horse_armor')
  })

  // --- Dungeon Crawl (15 tables) ---
  // Staged dungeon: stages 1-2 = T1, stages 3-5 = T2, treasure = T2-T3
  icraft.section('loot/lootjs_overhaul/dungeon-crawl', function () {
  event
    .addLootTableModifier(
      'dungeoncrawl:chests/stage_1',
      'dungeoncrawl:chests/stage_2',
      'dungeoncrawl:chests/food',
      'dungeoncrawl:chests/supply')
    .removeLoot('minecraft:diamond')
    .removeLoot('minecraft:diamond_block')

  event
    .addLootTableModifier(
      'dungeoncrawl:chests/stage_3',
      'dungeoncrawl:chests/stage_4',
      'dungeoncrawl:chests/forge',
      'dungeoncrawl:chests/library')
    .removeLoot('minecraft:diamond_horse_armor')

  event
    .addLootTableModifier(
      'dungeoncrawl:chests/stage_5',
      'dungeoncrawl:chests/secret_room',
      'dungeoncrawl:chests/treasure')
    .removeLoot('minecraft:diamond_horse_armor')
  })

  // --- Structory (39 tables) — T1 overworld ---
  icraft.section('loot/lootjs_overhaul/structory-t1-overworld', function () {
  event
    .addLootTableModifier(/^structory:.+/)
    .removeLoot('minecraft:diamond')
  })

  // --- Structory Towers (49 tables) — T1-T2 overworld ---
  // [2026-10-11] The old pattern (/structory_towers:.*chests.*/) matched NO
  // table: Structory Towers' tables are structory_towers:basic/…, top/…,
  // end_tower, … (no "chests" in the path). Retargeted to every table of the
  // mod and kept to the Overworld — it also has Nether towers (warped,
  // strange, fortress) and an End tower. No change in what drops (Section
  // 5A1.5 already strips these diamonds); see the tower-top marquee in
  // Section 7.
  icraft.section('loot/lootjs_overhaul/structory-towers-t1-t2-overworld', function () {
  event
    .addLootTableModifier(/^structory_towers:.+/)
    .anyDimension('minecraft:overworld')
    .removeLoot('minecraft:diamond')
  })

  // --- Epic Dungeons / "overhauledstructures" (12 tables, Overworld) ---
  // Mod namespace is `overhauledstructures` (NOT `epic_dungeons`). Prior audit
  // mistakenly marked this dead and removed coverage. Jar inspection 2026-04-19
  // confirmed: spawns in `#minecraft:is_overworld`, native tables drop
  // netherite_ingot (~4.5%) and diamond armor (~1.5%) in chest_3 — hard T1 break.
  //
  // Three dungeon families from structure files:
  //   ovdb_* -> overhauleddungeonbasic  (general dungeon)
  //   ovdp_* -> overhauleddungeonprison (decrepit theme)
  //   ovds_* -> overhauleddungeonspiders (web/venom theme)
  // Each family has 4 tiers: _chest_1, _chest_2, _chest_3, _chest_m (master).
  //
  // Overhaul = strip tier-breaking items, then inject thematic T1 content
  // matching each family's flavor, with tier-scaled rates.

  var overhauledAllTables = [
    /overhauledstructures:chests\/ovdb_loot_tables\/.*/,
    /overhauledstructures:chests\/ovdp_loot_tables\/.*/,
    /overhauledstructures:chests\/ovds_loot_tables\/.*/
  ]

  // --- Universal strip: kill tier-breakers across all 12 tables ---
  icraft.section('loot/lootjs_overhaul/universal-strip-kill-tier-breakers-across', function () {
  var ovdStrip = event.addLootTableModifier.apply(event, overhauledAllTables)
  var ovdTierBreakers = [
    'minecraft:diamond', 'minecraft:netherite_ingot', 'minecraft:netherite_scrap',
    'minecraft:diamond_helmet', 'minecraft:diamond_chestplate',
    'minecraft:diamond_leggings', 'minecraft:diamond_boots',
    'minecraft:diamond_sword', 'minecraft:diamond_axe',
    'minecraft:diamond_pickaxe', 'minecraft:diamond_shovel', 'minecraft:diamond_hoe',
    'minecraft:netherite_helmet', 'minecraft:netherite_chestplate',
    'minecraft:netherite_leggings', 'minecraft:netherite_boots',
    'minecraft:netherite_sword', 'minecraft:netherite_axe',
    'minecraft:netherite_pickaxe', 'minecraft:netherite_shovel', 'minecraft:netherite_hoe',
    'minecraft:budding_amethyst' // not a tier break, but removes a clutter item
  ]
  ovdTierBreakers.forEach(function(item) { ovdStrip.removeLoot(item) })
  })

  // --- Universal T1 magic/progression kit (all 12 tables) ---
  icraft.section('loot/lootjs_overhaul/universal-t1-magic-progression-kit', function () {
  var ovdUniversal = event.addLootTableModifier.apply(event, overhauledAllTables)
  // (legacy kubejs:tier1_token grant removed — currency retired; Codex tokens
  //  seed via loot/codex_exploration_drops.js)
  ovdUniversal.addLoot(LootEntry.of('ars_nouveau:source_gem').limitCount([1, 2]).when(c => c.randomChance(0.25)))
  ovdUniversal.addLoot(LootEntry.of('irons_spellbooks:common_ink').limitCount([1, 1]).when(c => c.randomChance(0.15)))
  ovdUniversal.addLoot(LootEntry.of('irons_spellbooks:copper_spell_book').when(c => c.randomChance(0.06)))
  ovdUniversal.addLoot(
    LootEntry.of('minecraft:book')
      .enchantWithLevels(UniformGenerator.between(5, 15), true)
      .when(c => c.randomChance(0.08))
  )
  })

  // --- Family theme adds (ovdb supplies / ovdp prison / ovds spiders) ---
  // [2026-10-10] Registered in Section 5B, AFTER the Overworld clutter + food
  // strips (search "EPIC DUNGEONS THEME ADDS"). These dungeons are in the
  // Overworld, so registered here the Section 5A strips removed the spider
  // family's spider eyes / fermented eyes / poisonous potatoes and the prison
  // family's rotten flesh outright, halved its bones and the spiders' string,
  // cut its name tags to 40%, and the Section 5B food strip left 1 in 5 of the
  // basic family's bread.

  // --- Tier 3 + Master chests: bonus magic drops (each family's chest_3 + chest_m) ---
  // chest_3 = final room; chest_m = master reward. Higher magic-item chances
  // to reward players who clear the dungeon.
  icraft.section('loot/lootjs_overhaul/tier-3-master-chests-bonus-magic-drops', function () {
  var ovdMaster = event.addLootTableModifier(
    /overhauledstructures:chests\/ovd[bps]_loot_tables\/ovd[bps]_chest_(3|m)/
  )
  ovdMaster.addLoot(LootEntry.of('ars_nouveau:novice_spell_book').when(c => c.randomChance(0.025)))
  ovdMaster.addLoot(LootEntry.of('irons_spellbooks:copper_spell_book').when(c => c.randomChance(0.14)))
  ovdMaster.addLoot(LootEntry.of('ars_nouveau:source_gem').limitCount([2, 4]).when(c => c.randomChance(0.50)))
  })
  // (legacy kubejs:tier1_token grant removed — currency retired)

  // =========================================================================
  // SECTION 4C: YUNG'S BETTER SERIES
  // All confirmed in loot table registry scan
  // =========================================================================

  // --- YUNG's Better Dungeons (8 tables) ---
  // T1-T2: overworld dungeons (zombie, skeleton, spider variants)
  icraft.section('loot/lootjs_overhaul/yungs-better-dungeons', function () {
  event
    .addLootTableModifier(/betterdungeons:.*/)
    .removeLoot('minecraft:diamond')
  })

  // --- YUNG's Better Strongholds (10 tables) ---
  // T2-T3: late overworld (library, corridor, crossing, grand_library, portal_room)
  icraft.section('loot/lootjs_overhaul/yungs-better-strongholds', function () {
  event
    .addLootTableModifier(/betterstrongholds:.*/)
    .removeLoot('minecraft:diamond_horse_armor')
  })

  // --- YUNG's Better Nether Fortresses (9 tables) ---
  // T3: Nether structures
  icraft.section('loot/lootjs_overhaul/yungs-better-nether-fortresses', function () {
  event
    .addLootTableModifier(/betterfortresses:.*/)
    .removeLoot('minecraft:diamond_horse_armor')
  })

  // (YUNG's Better Mineshafts ships no loot table of its own — its chest
  //  minecarts roll minecraft:chests/abandoned_mineshaft — so the
  //  /bettermineshafts:.*/ strip that stood here matched nothing; removed
  //  2026-10-11.)

  // --- YUNG's Better Ocean Monuments (1 table) ---
  // T2: challenging overworld
  icraft.section('loot/lootjs_overhaul/yungs-better-ocean-monuments', function () {
  event
    .addLootTableModifier(/betteroceanmonuments:.*/)
    .removeLoot('minecraft:diamond_horse_armor')
  })

  // --- YUNG's Better End Island ---
  // Installed, but it ships no loot tables of its own (the old "NOT PRESENT"
  // note here was wrong) — nothing to target.

  // Note: Better Desert Temples already covered in Section 2 above

  // =========================================================================
  // SECTION 4D: DIMENSION-SPECIFIC STRUCTURE LOOT
  // Dimensional mods with their own structure chests
  // =========================================================================

  // --- Blue Skies (641 tables, targeting chests only) ---
  // T2-T3: Everbright and Everdawn dimensions
  icraft.section('loot/lootjs_overhaul/blue-skies', function () {
  event
    .addLootTableModifier(/blue_skies:chests\/.*/)
    .removeLoot('minecraft:diamond_horse_armor')
  })

  // --- Blue Skies: Runic Arc as very rare structure chest loot (0.5%) ---
  // Supplements the 5% boss drop rate (see loot_overhaul.js).
  // Only in Blue Skies dimensions to maintain dimensional gating.
  icraft.section('loot/lootjs_overhaul/blue-skies-runic-arc-as-very-rare-structure', function () {
  event
    .addLootTableModifier(/blue_skies:chests\/.*/)
    .addLoot(LootEntry.of('blue_skies:runic_arc').when(c => c.randomChance(0.005)))
  })

  // --- Blue Skies: Dusk Arc is removed from the pack (recipe_audit.js L.1) ---
  // [2026-10-11] "Dusk Arc removed entirely (too strong for T2)" had only removed
  // a recipe; the arc is not crafted, it comes out of the Alchemist's boss loot
  // bag (blue_skies:loot_bags/alchemist/common|uncommon|rare), so it was still
  // obtainable. A loot bag is rolled by the item with the EMPTY parameter set
  // (read from LootBagItem's bytecode), so LootType.CHEST rules never see it:
  // the strip has to be keyed on the table id.
  icraft.section('loot/lootjs_overhaul/blue-skies-dusk-arc-is-removed-from-the-pack', function () {
  event
    .addLootTableModifier(/blue_skies:loot_bags\/alchemist\/.*/)
    .removeLoot('blue_skies:dusk_arc')
  })

  // --- Aether (191 tables, targeting chests only) ---
  // T2-T3: Aether dimension dungeons (bronze/silver/gold)
  icraft.section('loot/lootjs_overhaul/aether', function () {
  event
    .addLootTableModifier(/aether:chests\/.*/)
    .removeLoot('minecraft:diamond_horse_armor')
  })

  // --- Deep Aether (301 tables, targeting chests only) ---
  // T3-T4: Deep Aether brass/gold dungeons
  icraft.section('loot/lootjs_overhaul/deep-aether', function () {
  event
    .addLootTableModifier(/deep_aether:chests\/.*/)
    .removeLoot('minecraft:diamond_horse_armor')
  })

  // --- Undergarden (215 tables, targeting chests only) ---
  // T2-T3: Undergarden dimension
  icraft.section('loot/lootjs_overhaul/undergarden', function () {
  event
    .addLootTableModifier(/undergarden:chests\/.*/)
    .removeLoot('minecraft:diamond_horse_armor')
  })

  // --- Deeper and Darker (149 tables, targeting chests only) ---
  // T3: Otherside dimension
  icraft.section('loot/lootjs_overhaul/deeper-and-darker', function () {
  event
    .addLootTableModifier(/deeperdarker:chests\/.*/)
    .removeLoot('minecraft:diamond_horse_armor')
  })

  // (The Abyss: no rule. The installed The Abyss (TATOS 1.0.5_beta) has no
  //  chest that rolls a loot table — its only generated structure with chests
  //  (the Abylager hut) holds fixed items, and the
  //  theabyss:chests/underground_dungeon* tables are named only by structure
  //  pieces nothing generates (and are not shipped). The placeholder strip on
  //  /theabyss:chests\/.*/ was removed 2026-10-11.)

  // --- Cataclysm structures (164 tables, targeting chests only) ---
  // T3-T4: high-tier dungeon structures (soul forge, burning arena, sunken city, etc.)
  icraft.section('loot/lootjs_overhaul/cataclysm-structures', function () {
  event
    .addLootTableModifier(/cataclysm:.*chest.*/)
    .removeLoot('minecraft:diamond_horse_armor')
  })

  // --- Twilight Forest (532 tables, targeting chests only) ---
  // T2-T3: Twilight Forest dimension
  icraft.section('loot/lootjs_overhaul/twilight-forest', function () {
  event
    .addLootTableModifier(/twilightforest:chests\/.*/)
    .removeLoot('minecraft:diamond_horse_armor')
  })

  // =========================================================================
  // SECTION 4E: REMAINING OVERWORLD STRUCTURE MODS
  // =========================================================================

  // --- ChoiceTheorem's Overhauled Village (12 tables) ---
  // No T1 tokens — villages are starting areas, not progression structures
  icraft.section('loot/lootjs_overhaul/choicetheorems-overhauled-village', function () {
  event
    .addLootTableModifier(/ctov:.*/)
    .removeLoot('minecraft:diamond')
  })

  // --- Explorations+ (16 tables) ---
  // T1: overworld exploration structures
  icraft.section('loot/lootjs_overhaul/explorations', function () {
  event
    .addLootTableModifier(/explorations:.*/)
    .removeLoot('minecraft:diamond')
  })

  // --- Overhauled Structures: covered in Section 2 (chest_[12], chest_[3m]) ---

  // --- Loot Integrations: covered in Section 2 (difficulty-tier split) ---

  // =========================================================================
  // SECTION 5: DIAMOND/NETHERITE REMOVAL FROM VANILLA STRUCTURES
  // =========================================================================
  // Vanilla structures (desert temples, dungeons, mineshafts, etc.) should
  // not contain diamonds in a tier-gated pack. Players earn diamonds through
  // Tier 2 progression.
  // =========================================================================

  // Non-village vanilla overworld chests: remove diamonds + add T1 token chance
  icraft.section('loot/lootjs_overhaul/section-5-diamond-netherite-removal-from', function () {
  var vanillaOverworldChests = [
    'minecraft:chests/simple_dungeon',
    'minecraft:chests/abandoned_mineshaft',
    'minecraft:chests/buried_treasure',
    'minecraft:chests/desert_pyramid',
    'minecraft:chests/jungle_temple',
    'minecraft:chests/pillager_outpost',
    'ctov:pillager_outpost/halloween/tower',   // alias table -> pillager_outpost (dev/loot_audit/alias_tables.json)
    'minecraft:chests/shipwreck_treasure',
    'minecraft:chests/stronghold_corridor',
    'minecraft:chests/stronghold_crossing',
    'minecraft:chests/stronghold_library',
    'minecraft:chests/underwater_ruin_big',
    'minecraft:chests/underwater_ruin_small',
    'minecraft:chests/woodland_mansion'
  ]

  vanillaOverworldChests.forEach(table => {
    event
      .addLootTableModifier(table)
      .removeLoot('minecraft:diamond')
      .removeLoot('minecraft:diamond_horse_armor')
  })

  // Village smith chests: remove diamonds, add 20% artifact chance per chest
  // Villages are starting areas — artifacts provide exciting early finds
  var vanillaVillageSmithChests = [
    'minecraft:chests/village/village_toolsmith',
    'minecraft:chests/village/village_weaponsmith',
    'minecraft:chests/village/village_armorer'
  ]

  // Artifacts mod handles artifact injection into village chests natively via GLM
  // We only handle material/gear adjustments here.
  //
  // 2026-04-19: DO NOT strip iron gear here. Per the mechanic note (Section 1B),
  // removeLoot is one-shot in-place in registration order — so a strip that lands
  // AFTER an add (here, after the same-pass weaponsmith adds) silently removes it,
  // which is why testers "rarely saw weapons." (It's ordering, not a "persistent
  // filter.") Simplest safe pattern: don't strip what we re-add — let vanilla smith
  // tables drop iron naturally and layer our curated adds on top.
  vanillaVillageSmithChests.forEach(table => {
    let modifier = event
      .addLootTableModifier(table)
      .removeLoot('minecraft:diamond')
      .removeLoot('minecraft:diamond_horse_armor')

    // T1 materials — iron, gold, copper. 2026-04-26: bumped iron 0.10 -> 0.30
    // per tester report 'never seen iron in village chests'. Vanilla weights
    // are low; this guarantees a meaningful chance in armorer/toolsmith/weaponsmith.
    modifier.addLoot(LootEntry.of('minecraft:iron_ingot').limitCount([1, 3]).when(c => c.randomChance(0.30)))
    modifier.addLoot(LootEntry.of('minecraft:gold_ingot').limitCount([1, 1]).when(c => c.randomChance(0.05)))
    modifier.addLoot(LootEntry.of('minecraft:copper_ingot').limitCount([1, 3]).when(c => c.randomChance(0.08)))
    modifier.addLoot(LootEntry.of('create:brass_ingot').limitCount([1, 1]).when(c => c.randomChance(0.04)))

    // Seeds — relatively rare
    modifier.addLoot(LootEntry.of('minecraft:wheat_seeds').limitCount([1, 2]).when(c => c.randomChance(0.05)))
    modifier.addLoot(LootEntry.of('minecraft:beetroot_seeds').limitCount([1, 1]).when(c => c.randomChance(0.03)))
    modifier.addLoot(LootEntry.of('minecraft:pumpkin_seeds').limitCount([1, 1]).when(c => c.randomChance(0.03)))
    modifier.addLoot(LootEntry.of('minecraft:melon_seeds').limitCount([1, 1]).when(c => c.randomChance(0.02)))

    // Gear — uncommon (5%)
    modifier.addLoot(LootEntry.of('minecraft:iron_sword').when(c => c.randomChance(0.05)))
    modifier.addLoot(LootEntry.of('minecraft:iron_pickaxe').when(c => c.randomChance(0.05)))

    // Artifacts injection: now active as of 2026-04-26 (added all chest GLMs
    // to global_loot_modifiers.json allowlist; was previously suppressed by
    // replace:true even though comment claimed it was working).
  })
  })

  // =========================================================================
  // SECTION 4D: VILLAGE HOUSE CHESTS — TOOLS, MAGIC, AFFIXES
  // =========================================================================
  // All village house chests get basic tools for early game, boosted magic
  // weapon chances, and a very low chance of an affixed weapon.
  // Villages are T1 starting areas — tools help new players, magic provides
  // early caster gear, affixes are exciting rare finds.
  // =========================================================================
  var villageHouseChests = [
    'minecraft:chests/village/village_plains_house',
    'minecraft:chests/village/village_desert_house',
    'minecraft:chests/village_desert_house',   // alias table -> village/village_desert_house (dev/loot_audit/alias_tables.json)
    'minecraft:chests/village/village_savanna_house',
    'minecraft:chests/village/village_snowy_house',
    'minecraft:chests/village/village_taiga_house'
  ]

  // 2026-04-20: restructured from per-item `.addLoot(entry.when(randomChance))`
  // to addWeightedLoot pools. Tester ran 30x /loot give and saw ZERO beds
  // despite a 20% bed add — statistically impossible with a real 20% rate.
  // addLoot+randomChance adds appear to silently no-op in this LootJS build
  // for per-item independent rolls on vanilla tables. The working pattern
  // (confirmed by tester: 'iron weapons do come from the smith table') is
  // addWeightedLoot, which rolls ONE guaranteed item from a weighted pool.
  //
  // Split into three weighted pools — rolls once each — so each village
  // house chest gets: 1 QoL flavor item + 1 tool/weapon + magic-materials.
  icraft.section('loot/lootjs_overhaul/section-4d-village-house-chests-tools-magic', function () {
  villageHouseChests.forEach(table => {
    let mod = event.addLootTableModifier(table)

    // Pool 1: QoL flavor — per-item independent chances. 2026-04-22:
    // addWeightedLoot collapses to "always one item" (no air filler
    // usable). Tester asked for bed to drop from 30% to 10%, so we
    // switched to independent rolls to tune each item directly. Expected
    // items per chest ≈ 0.80 (sum of probabilities). Occasional 2+ items
    // are fine given these are all flavor/starter items.
    mod.addLoot(LootEntry.of('minecraft:white_bed').when(c => c.randomChance(0.10)))
    mod.addLoot(LootEntry.of('minecraft:iron_bars').when(c => c.randomChance(0.20)))
    mod.addLoot(LootEntry.of('minecraft:lantern').when(c => c.randomChance(0.15)))
    mod.addLoot(LootEntry.of('minecraft:hay_block').when(c => c.randomChance(0.15)))
    mod.addLoot(LootEntry.of('minecraft:oak_boat').when(c => c.randomChance(0.12)))
    mod.addLoot(LootEntry.of('minecraft:bell').when(c => c.randomChance(0.08)))

    // Pool 2: starter tools — halved from the prior weighted pool per
    // tester request ("tools in half or so"). Independent per-item rolls
    // at roughly half the earlier weight. Expected tools per chest ≈ 0.49.
    mod.addLoot(LootEntry.of('minecraft:wooden_sword').when(c => c.randomChance(0.09)))
    mod.addLoot(LootEntry.of('minecraft:wooden_pickaxe').when(c => c.randomChance(0.09)))
    mod.addLoot(LootEntry.of('minecraft:wooden_axe').when(c => c.randomChance(0.07)))
    mod.addLoot(LootEntry.of('minecraft:wooden_shovel').when(c => c.randomChance(0.05)))
    mod.addLoot(LootEntry.of('minecraft:wooden_hoe').when(c => c.randomChance(0.04)))
    mod.addLoot(LootEntry.of('minecraft:stone_sword').when(c => c.randomChance(0.05)))
    mod.addLoot(LootEntry.of('minecraft:stone_pickaxe').when(c => c.randomChance(0.05)))
    mod.addLoot(LootEntry.of('minecraft:stone_axe').when(c => c.randomChance(0.03)))
    mod.addLoot(LootEntry.of('minecraft:stone_shovel').when(c => c.randomChance(0.02)))

    // Pool 3 (magic materials) was a guaranteed weighted roll of 40% ink
    // / 35% gem / 15% copper / 10% novice. Removed 2026-04-24: this stacked
    // on top of the overworld T1 rule below (Section 5A3) so village chests
    // got roughly 100% + 9% = far too much magic gear for a T1 starter area.
    // Villages now pick up magic via the overworld T1 rule only (copper 3%,
    // iron 1%, common_ink 5%) plus the native scroll entry in the village
    // house JSON override (~2.5% with a rolled random spell).

    // Artifacts handled by Artifacts mod native GLM injection (and our
    // villageArtifactPool re-adds in section 6).
  })
  })

  // --- Village house clutter strip ---
  // Vanilla village house tables drop a lot of low-value filler (feather spam,
  // excess wheat seeds). Per the mechanic note (Section 1B): this strip removes
  // whatever is in the list when it runs — so it WOULD eat any item an EARLIER-
  // registered modifier added (e.g. the T1 broadcast above), while items re-added
  // by LATER sections survive it. To stay safe regardless of order, limit this to
  // filler we're confident we never want anywhere.
  //
  // Keep meat (porkchop, chicken): it IS food and T1 players need early
  // calories. Only strip non-food filler. (2026-04-20 tester preference.)
  icraft.section('loot/lootjs_overhaul/village-house-clutter-strip', function () {
  villageHouseChests.forEach(table => {
    event
      .addLootTableModifier(table)
      .removeLoot('minecraft:feather')
      .removeLoot('minecraft:rabbit_foot') // brewing clutter, not meat
      .removeLoot('minecraft:rabbit_hide')
  })
  })

  // --- Village food + seed boost (added 2026-05-17) ---
  // Walks back the 2026-04-20 design call that thinned structure food loot
  // across all overworld chests (Section 5B further down: each listed food
  // stack survives at 20%). The original rationale ("food shouldn't bypass
  // the hunger system") was overblown given how onerous the 2.5x hunger drain
  // actually feels in play. The global strip still applies to non-village
  // chests; villages get a flat food/seed boost on top, which is thematically
  // correct (villagers farm) and addresses the early-game food friction.
  //
  // Targets the 5 biome houses + CTOV + Villages and Pillages tables.
  // Expected items per chest: ~1.25 food + ~1.0 seeds (independent rolls;
  // the sums of the chances below).
  //
  // [2026-10-10] Only the two lists and the helper are DEFINED here. The boost
  // is REGISTERED in Section 5B, right after the food strip (search "VILLAGE
  // FOOD + SEED BOOST — registration"): registered here it sat BEFORE that
  // strip, which then thinned 10 of the 11 boost foods to 1 in 5 — the
  // opposite of "on top of" the reduction.
  var VILLAGE_FOOD_BOOST = [
    ['minecraft:bread',         0.18],
    ['minecraft:wheat',         0.20],
    ['minecraft:carrot',        0.15],
    ['minecraft:potato',        0.15],
    ['minecraft:baked_potato',  0.10],
    ['minecraft:apple',         0.10],
    ['minecraft:beetroot',      0.08],
    ['minecraft:cookie',        0.10],
    ['minecraft:melon_slice',   0.08],
    ['minecraft:pumpkin_pie',   0.06],
    ['minecraft:sweet_berries', 0.05]
  ]
  // Seeds: FD-weighted per 2026-05-17 design call -- Farmer's Delight is
  // our farming-mod baseline, so its seeds should dominate the village
  // seed economy. FD cabbage/tomato/onion/rice combined ~68% of seed
  // rolls; vanilla wheat/beetroot/pumpkin/melon ~31%. FD "onion" and "rice"
  // items act as seeds when planted (no dedicated seed item exists for
  // those crops in FD).
  var VILLAGE_SEED_BOOST = [
    ['farmersdelight:cabbage_seeds', 0.20],
    ['farmersdelight:tomato_seeds',  0.18],
    ['farmersdelight:onion',         0.15],
    ['farmersdelight:rice',          0.15],
    ['minecraft:wheat_seeds',        0.12],
    ['minecraft:beetroot_seeds',     0.08],
    ['minecraft:pumpkin_seeds',      0.06],
    ['minecraft:melon_seeds',        0.05]
  ]
  function addVillageFoodSeedBoost(tableRef) {
    var mod = event.addLootTableModifier(tableRef)
    VILLAGE_FOOD_BOOST.forEach(function(entry) {
      mod.addLoot(LootEntry.of(entry[0]).limitCount([1, 2]).when(c => c.randomChance(entry[1])))
    })
    VILLAGE_SEED_BOOST.forEach(function(entry) {
      mod.addLoot(LootEntry.of(entry[0]).limitCount([1, 3]).when(c => c.randomChance(entry[1])))
    })
  }
  // (the three addVillageFoodSeedBoost(...) registrations are in Section 5B)

  // --- Butcher chest: guaranteed meat (added 2026-05-17) ---
  // Vanilla butcher table has all meat at random low-weight rolls so a
  // butcher chest may produce zero meat. Tester report: butcher chests
  // felt thematically broken (a butcher with no meat). Adding 3 guaranteed
  // entries on top — players always get at least 1 each of porkchop,
  // chicken, beef when looting a butcher chest. (Vanilla raw_porkchop /
  // raw_chicken / raw_rabbit entries on the table remain intact.)
  //
  // Meat is not in the Section 5B `reducedFoods` list, so this isn't
  // affected by the Overworld food reduction.
  icraft.section('loot/lootjs_overhaul/butcher-chest-guaranteed-meat', function () {
  var butcherMod = event.addLootTableModifier('minecraft:chests/village/village_butcher')
  butcherMod.addLoot(LootEntry.of('minecraft:porkchop').limitCount([1, 3]))
  butcherMod.addLoot(LootEntry.of('minecraft:chicken').limitCount([1, 3]))
  butcherMod.addLoot(LootEntry.of('minecraft:beef').limitCount([1, 2]))
  })

  // --- Farmer's Delight seeds in grass + tall_grass (added 2026-05-17) ---
  // Tester report: FD seeds aren't discoverable via the standard grass-
  // breaking onboarding flow that wheat_seeds uses, despite FD being our
  // farming-mod baseline. Adding cabbage_seeds and tomato_seeds at low
  // rates to grass/tall_grass loot tables so the discovery mechanism
  // covers FD too. FD onion/rice have their own wild block discovery
  // mechanism (wild_onions, wild_rice) so they don't need grass entries.
  icraft.section('loot/lootjs_overhaul/farmers-delight-seeds-in-grass-tall-grass', function () {
  event
    .addLootTableModifier('minecraft:blocks/grass')
    .addLoot(LootEntry.of('farmersdelight:cabbage_seeds').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('farmersdelight:tomato_seeds').when(c => c.randomChance(0.03)))
  event
    .addLootTableModifier('minecraft:blocks/tall_grass')
    .addLoot(LootEntry.of('farmersdelight:cabbage_seeds').when(c => c.randomChance(0.04)))
    .addLoot(LootEntry.of('farmersdelight:tomato_seeds').when(c => c.randomChance(0.04)))
  })

  // =========================================================================
  // SECTION 4E: T1 IRON BASELINE -- guarantee iron in all overworld chests
  // =========================================================================
  // Tester report 2026-04-26: iron ingots are too scarce in T1 chests --
  // never observed iron in village chests despite vanilla loot tables
  // including it. Add 15% chance for iron_ingot (1-3 stack) to every T1
  // overworld chest type. Stacks with vanilla rolls. Village smith chests
  // already get 30% via Section 5; this catches the rest.
  //
  // Why 15% (not 25%): by the time players explore these structures they
  // should already have decent mined iron supply. The baseline isn't to
  // bootstrap iron access -- it's to supplement frequent repairs as
  // gear chips during exploration. Per tester directive 2026-04-26.

  icraft.section('loot/lootjs_overhaul/section-4e-t1-iron-baseline-guarantee-iron', function () {
  var T1_IRON_BASELINE_CHESTS = [
    'minecraft:chests/simple_dungeon',
    'minecraft:chests/abandoned_mineshaft',
    'minecraft:chests/jungle_temple',
    'minecraft:chests/desert_pyramid',
    'minecraft:chests/igloo_chest',
    'minecraft:chests/woodland_mansion',
    'minecraft:chests/ruined_portal',
    'minecraft:chests/buried_treasure',
    'minecraft:chests/shipwreck_supply',
    'minecraft:chests/shipwreck_map',
    'minecraft:chests/shipwreck_treasure',
    'minecraft:chests/pillager_outpost',
    'ctov:pillager_outpost/halloween/tower',   // alias table -> pillager_outpost (dev/loot_audit/alias_tables.json)
    'minecraft:chests/underwater_ruin_big',
    'minecraft:chests/underwater_ruin_small',
    'minecraft:chests/spawn_bonus_chest',
    'minecraft:chests/stronghold_corridor',
    'minecraft:chests/stronghold_crossing',
    'minecraft:chests/village/village_plains_house',
    'minecraft:chests/village/village_desert_house',
    'minecraft:chests/village_desert_house',   // alias table -> village/village_desert_house (dev/loot_audit/alias_tables.json)
    'minecraft:chests/village/village_savanna_house',
    'minecraft:chests/village/village_snowy_house',
    'minecraft:chests/village/village_taiga_house',
    'minecraft:chests/village/village_butcher',
    'minecraft:chests/village/village_cartographer',
    'minecraft:chests/village/village_fisher',
    'minecraft:chests/village/village_fletcher',
    'minecraft:chests/village/village_mason',
    'minecraft:chests/village/village_shepherd',
    'minecraft:chests/village/village_tannery',
    'ctov:village/swamp/leatherworker',        // alias table -> village_tannery (dev/loot_audit/alias_tables.json)
    'minecraft:chests/village/village_temple'
  ]

  T1_IRON_BASELINE_CHESTS.forEach(table => {
    event.addLootTableModifier(table)
      .addLoot(LootEntry.of('minecraft:iron_ingot').limitCount([1, 3]).when(c => c.randomChance(0.15)))
  })
  console.log('[icraft-loot] T1 iron baseline: 15% iron_ingot (1-3) added to ' +
              T1_IRON_BASELINE_CHESTS.length + ' overworld chest types')
  })

  // =========================================================================
  // SECTION 5A: OVERWORLD CHEST CLUTTER CLEANUP
  // =========================================================================
  // Remove low-value filler items from ALL Overworld structure chests.
  // Full removals: horse armor, spider eyes, poisonous potatoes, rotten flesh,
  // Terramity fairy dust, bulk wood + stone.
  // Partial reductions (each existing stack survives at the stated chance):
  // gunpowder 50%, string 50%, bones 50%, name tags 40%.
  // =========================================================================

  // --- Full removals: horse armor, spider eyes, poisonous potatoes,
  //     rotten flesh, bulk wood + stone (2026-04-20 tester preference:
  //     "strip rotten meat, all wood and stone in chests") ---
  icraft.section('loot/lootjs_overhaul/full-removals-horse-armor-spider-eyes', function () {
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .removeLoot('minecraft:iron_horse_armor')
    .removeLoot('minecraft:golden_horse_armor')
    .removeLoot('minecraft:diamond_horse_armor')
    .removeLoot('minecraft:leather_horse_armor')
    .removeLoot('minecraft:spider_eye')
    .removeLoot('minecraft:fermented_spider_eye')
    // 2026-04-26: Terramity fairy_dust appearing in T1 overworld chests via
    // Terramity's subterranean_shrine + trial_spire loot tables (their
    // structures spawn in overworld biomes). Player progression intent:
    // fairy_dust comes from killing the 3 Terramity fairy mobs (proper
    // progression path), not from generic chest exploration. Strip from
    // every overworld CHEST loot type.
    .removeLoot('terramity:fairy_dust')
    .removeLoot('minecraft:poisonous_potato')
    .removeLoot('minecraft:rotten_flesh')
    // Wood: all log + plank variants via tags
    .removeLoot('#minecraft:logs')
    .removeLoot('#minecraft:planks')
    // Stone: common cheap gathering stones (keep sandstone/end_stone/nether_bricks
    // since those are dimension flavor, not Overworld filler)
    .removeLoot('minecraft:stone')
    .removeLoot('minecraft:cobblestone')
    .removeLoot('minecraft:mossy_cobblestone')
    .removeLoot('minecraft:granite')
    .removeLoot('minecraft:andesite')
    .removeLoot('minecraft:diorite')
    .removeLoot('minecraft:polished_granite')
    .removeLoot('minecraft:polished_andesite')
    .removeLoot('minecraft:polished_diorite')
    .removeLoot('minecraft:deepslate')
    .removeLoot('minecraft:cobbled_deepslate')
    .removeLoot('minecraft:polished_deepslate')
    .removeLoot('minecraft:tuff')
    .removeLoot('minecraft:stone_bricks')
    .removeLoot('minecraft:cracked_stone_bricks')
    .removeLoot('minecraft:mossy_stone_bricks')
  })

  // --- Partial-reduction helper (2026-10-10 fix) ---
  // The "reduce X%" rules below (and the food rule in Section 5B) used to be
  // `removeLoot(id)` + `addLoot(LootEntry.of(id).when(randomChance(keep)))`.
  // LootJS addLoot adds whether or not the table ever rolled the item
  // (AddLootAction just appends), so instead of REDUCING, every Overworld
  // chest GAINED 1 gunpowder/string/bone at 50%, a name tag at 40% and each
  // listed food at 20%. This helper is a true reduction: a one-shot
  // removeLoot whose predicate removes each EXISTING matching stack with
  // probability (1 - keepChance) — one independent roll per stack
  // (RemoveLootAction = loot.removeIf(filter)); nothing is ever added, and a
  // surviving stack keeps its rolled count. Same shape as the other
  // ItemFilter.custom(...) strips in this file. Position/registration order
  // of each modifier is unchanged, so it still only sees loot added by
  // modifiers registered BEFORE it.
  var keepLootChanceFilter = function(ids, keepChance) {
    var idSet = {}
    ids.forEach(function(id) { idSet[id] = true })
    return ItemFilter.custom(function(stack) {
      try {
        if (!stack || stack.isEmpty()) return false
        var id = String(stack.id || '')
        if (!id) { try { id = String(stack.getItem().builtInRegistryHolder().key().location()) } catch (e) {} }
        if (idSet[id] !== true) return false
        return Math.random() >= keepChance   // true = strip this stack
      } catch (e) { return false }
    })
  }

  // --- Gunpowder: 50% reduction (each stack kept at 50%) ---
  icraft.section('loot/lootjs_overhaul/gunpowder-50-reduction', function () {
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .removeLoot(keepLootChanceFilter(['minecraft:gunpowder'], 0.50))
  })

  // --- String: 50% reduction (each stack kept at 50%) ---
  icraft.section('loot/lootjs_overhaul/string-50-reduction', function () {
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .removeLoot(keepLootChanceFilter(['minecraft:string'], 0.50))
  })

  // --- Bones: 50% reduction (each stack kept at 50%) ---
  icraft.section('loot/lootjs_overhaul/bones-50-reduction', function () {
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .removeLoot(keepLootChanceFilter(['minecraft:bone'], 0.50))
  })

  // --- Name tags: 60% reduction (each stack kept at 40%) ---
  icraft.section('loot/lootjs_overhaul/name-tags-60-reduction', function () {
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .removeLoot(keepLootChanceFilter(['minecraft:name_tag'], 0.40))
  })

  // =========================================================================
  // SECTION 5A1.5: PRE-T3 DIAMOND HARD STRIP
  // =========================================================================
  // Tester reported diamonds generating in an Overworld structure not yet
  // covered by the per-structure strips (Section 4 has ~66 individual
  // removeLoot('minecraft:diamond') calls — but new structures keep slipping
  // through). This is a blanket strip across ALL chest tables in pre-T3
  // dimensions (Overworld + the 4 modded T2 dims; Deep Aether content lives in
  // aether:the_aether). T3+ (Nether, Undergarden, End, Deeper Darker, The
  // Abyss) keep diamonds.
  //
  // Why so aggressive: a T1 player finding 8 diamonds in a structure chest
  // skips iron->diamond progression entirely. Per design (master.md
  // progression curve): diamonds gate at T3, players should farm iron in
  // T1-T2, diamond access opens via Nether mining or T3 boss drops.
  //
  // Strip extends to diamond tools, armor, and horse armor — anything that
  // could give a T1-T2 player diamond-tier kit pre-progression. Vanilla
  // stronghold/desert temple chest loot is the most common source; modded
  // structures vary.
  // =========================================================================

  icraft.section('loot/lootjs_overhaul/section-5a1.5-pre-t3-diamond-hard-strip', function () {
  var preT3DiamondStrip = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld',
      'twilightforest:twilight_forest',
      'aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
  preT3DiamondStrip.removeLoot('minecraft:diamond')
  preT3DiamondStrip.removeLoot('minecraft:diamond_sword')
  preT3DiamondStrip.removeLoot('minecraft:diamond_pickaxe')
  preT3DiamondStrip.removeLoot('minecraft:diamond_axe')
  preT3DiamondStrip.removeLoot('minecraft:diamond_shovel')
  preT3DiamondStrip.removeLoot('minecraft:diamond_hoe')
  preT3DiamondStrip.removeLoot('minecraft:diamond_helmet')
  preT3DiamondStrip.removeLoot('minecraft:diamond_chestplate')
  preT3DiamondStrip.removeLoot('minecraft:diamond_leggings')
  preT3DiamondStrip.removeLoot('minecraft:diamond_boots')
  preT3DiamondStrip.removeLoot('minecraft:diamond_horse_armor')
  })

  // ─── Belt-and-suspenders: explicit per-table strips ───
  // 2026-05-10 audit found mod-shipped chest tables in pre-T3 dims that
  // contain vanilla diamond gear. The LootType.CHEST + anyDimension predicate
  // above SHOULD catch these, but custom mod calls can bypass the LootType
  // categorization (lessons-learned 2026-04-21 noted Lootr aggressive_mode
  // wrapping breaking similar predicates for villages). Per-table strips
  // are unambiguous regardless of how the table is invoked.
  icraft.section('loot/lootjs_overhaul/belt-and-suspenders-explicit-per-table', function () {
  var perTableDiamondStrip = event.addLootTableModifier(
    'artifacts:chests/campsite_chest',
    'irons_spellbooks:chests/battleground/burial_loot',
    'irons_spellbooks:chests/catacombs/coffin_loot',
    'irons_spellbooks:chests/catacombs/wall_loot',
    'irons_spellbooks:chests/generic_magic_treasure'
  )
  perTableDiamondStrip.removeLoot('minecraft:diamond')
  perTableDiamondStrip.removeLoot('minecraft:diamond_sword')
  perTableDiamondStrip.removeLoot('minecraft:diamond_pickaxe')
  perTableDiamondStrip.removeLoot('minecraft:diamond_axe')
  perTableDiamondStrip.removeLoot('minecraft:diamond_shovel')
  perTableDiamondStrip.removeLoot('minecraft:diamond_hoe')
  perTableDiamondStrip.removeLoot('minecraft:diamond_helmet')
  perTableDiamondStrip.removeLoot('minecraft:diamond_chestplate')
  perTableDiamondStrip.removeLoot('minecraft:diamond_leggings')
  perTableDiamondStrip.removeLoot('minecraft:diamond_boots')
  perTableDiamondStrip.removeLoot('minecraft:diamond_horse_armor')
  })

  // ─── Wide regex catch-all: any chest-pathed table in pre-T3 dims ───
  // Matches any loot table whose path contains "chests/" or "chest/" under
  // any namespace. The dim filter restricts to OW + T2 dims so T3+ chests
  // still legitimately roll diamonds. This catches future modded structures
  // we haven't audited yet without requiring per-table maintenance.
  // [2026-10-10] regex was /^[a-z0-9_]+:.*chests?\// — table regexes are full-
  // match, so it only matched an id that ENDS in "chests/" (none does) and this
  // whole catch-all never ran. The trailing .* makes it match what the comment
  // above describes.
  // [2026-10-11] plus the alias tables whose id has no chests/ in it
  // (dev/loot_audit/alias_tables.json) — they forward to chest tables.
  icraft.section('loot/lootjs_overhaul/wide-regex-catch-all-any-chest-pathed-table', function () {
  var regexDiamondStrip = event
    .addLootTableModifier(/^[a-z0-9_]+:.*chests?\/.*/,
      'minecraft:house_1', /^ctov:(?:village|pillager_outpost)\/.*/)
    .anyDimension('minecraft:overworld',
      'twilightforest:twilight_forest',
      'aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
  regexDiamondStrip.removeLoot('minecraft:diamond')
  regexDiamondStrip.removeLoot('minecraft:diamond_sword')
  regexDiamondStrip.removeLoot('minecraft:diamond_pickaxe')
  regexDiamondStrip.removeLoot('minecraft:diamond_axe')
  regexDiamondStrip.removeLoot('minecraft:diamond_shovel')
  regexDiamondStrip.removeLoot('minecraft:diamond_hoe')
  regexDiamondStrip.removeLoot('minecraft:diamond_helmet')
  regexDiamondStrip.removeLoot('minecraft:diamond_chestplate')
  regexDiamondStrip.removeLoot('minecraft:diamond_leggings')
  regexDiamondStrip.removeLoot('minecraft:diamond_boots')
  regexDiamondStrip.removeLoot('minecraft:diamond_horse_armor')
  })

  // ─── Pre-T3 diamonds OUTSIDE the chest context (operator ruling 2026-10-11, decision sheet D2) ───
  // LootType.CHEST is the CALLER's parameter set, so the blanket strip above
  // never sees a table that is rolled another way. Three such tables handed
  // out diamonds before T3 (jar-checked, loot audit 2026-10-11):
  //   - aquaculture:box/treasure_chest — a fished-up Treasure Chest opened in
  //     hand (LootBoxItem, EMPTY parameter set): 15% a diamond. It is a
  //     one-item roll, so the diamond becomes an EMERALD instead of nothing.
  //   - aether:selectors/whirlwind_junk, evil_whirlwind_junk — what an Aether
  //     whirlwind throws out (SELECTOR set): 1 in 100 / 1 in 160. Removed.
  //   - tetra:actions/geode — a geode cracked on a workbench: 6% a diamond and
  //     9% a pristine diamond (which Tetra's own recipe turns into a diamond).
  //     Both become their emerald counterpart, so a geode is never worse than
  //     before, just not a diamond.
  // Same dimension list as the blanket strip: opened / cracked in a T3+
  // dimension they keep the diamond, exactly as a chest there does.
  // (The dimension list is written out each time: every anyDimension call in
  //  this pack passes separate arguments, never an array.)
  icraft.section('loot/lootjs_overhaul/pre-t3-diamonds-outside-the-chest-context', function () {
  event
    .addLootTableModifier('aquaculture:box/treasure_chest')
    .anyDimension('minecraft:overworld',
      'twilightforest:twilight_forest',
      'aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
    .replaceLoot('minecraft:diamond', LootEntry.of('minecraft:emerald'), true)
  event
    .addLootTableModifier('aether:selectors/whirlwind_junk', 'aether:selectors/evil_whirlwind_junk')
    .anyDimension('minecraft:overworld',
      'twilightforest:twilight_forest',
      'aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
    .removeLoot('minecraft:diamond')
  event
    .addLootTableModifier('tetra:actions/geode')
    .anyDimension('minecraft:overworld',
      'twilightforest:twilight_forest',
      'aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
    .replaceLoot('minecraft:diamond', LootEntry.of('minecraft:emerald'), true)
    .replaceLoot('tetra:pristine_diamond', LootEntry.of('tetra:pristine_emerald'), true)
  })

  // =========================================================================
  // SECTION 5A2: OVERWORLD CURIO DROPS
  // =========================================================================
  // Since tier-gated mod items were removed from Overworld chests, add more
  // curio/artifact drops to keep chests exciting. ~20% cumulative chance
  // for a random curio from any non-village Overworld structure chest.
  // =========================================================================

  // Artifact drops removed from generic Overworld chests — the Artifacts mod
  // already injects its own drops natively. Adding more on top made them
  // appear in every other chest. Towers of the Wild have their own boosted
  // rates (Section 8). Village smiths have a small chance (Section above).

  // =========================================================================
  // SECTION 5A3: IRON'S SPELLS TIERED LOOT
  // =========================================================================
  // Spell books, scrolls, and inks scale by tier to support magic builds
  // throughout progression. Copper/iron books early, gold/diamond later.
  // Scrolls in all tiers (random spell appropriate to dimension).
  // =========================================================================

  // T1 (Overworld): Scrolls, copper/iron spell books, common ink
  icraft.section('loot/lootjs_overhaul/section-5a3-irons-spells-tiered-loot', function () {
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .addLoot(LootEntry.of('irons_spellbooks:copper_spell_book').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('irons_spellbooks:iron_spell_book').when(c => c.randomChance(0.01)))
    .addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.075)))

  // T2 (TF, Aether, Blue Skies): Scrolls, iron/gold spell books, uncommon ink
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('twilightforest:twilight_forest',
      'aether:the_aether',
      'blue_skies:everbright', 'blue_skies:everdawn')
    .addLoot(LootEntry.of('irons_spellbooks:iron_spell_book').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('irons_spellbooks:gold_spell_book').when(c => c.randomChance(0.01)))
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.075)))

  // T3 (Nether, Undergarden, Deeper Darker, Abyss): Scrolls, gold/diamond spell books, rare ink
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_nether', 'undergarden:undergarden', 'deeperdarker:otherside', 'theabyss:the_abyss')
    .addLoot(LootEntry.of('irons_spellbooks:gold_spell_book').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('irons_spellbooks:diamond_spell_book').when(c => c.randomChance(0.01)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.06)))

  // T4 (End): Scrolls, diamond/netherite spell books, epic ink
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_end')
    .addLoot(LootEntry.of('irons_spellbooks:diamond_spell_book').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('irons_spellbooks:netherite_spell_book').when(c => c.randomChance(0.01)))
    .addLoot(LootEntry.of('irons_spellbooks:epic_ink').when(c => c.randomChance(0.045)))
  })

  // =========================================================================
  // SECTION 5B: OVERWORLD STRUCTURE FOOD REDUCTION
  // =========================================================================
  // Reduce non-meat food in Overworld structure chests by 80% (each listed
  // food stack the table rolled survives at 20%).
  // Meat (raw/cooked) is kept as-is since there's no infinite source.
  // Modded foods (Pam's HarvestCraft, Farmer's Delight) removed entirely
  // from structure loot — those should be player-crafted.
  // Only applies to Overworld dimension.
  // =========================================================================

  // --- Non-meat food items to reduce (each existing stack kept at 20%) ---
  // [2026-10-10 fix] True reduction via keepLootChanceFilter (Section 5A):
  // a listed food survives only if the table actually rolled it, at 20% per
  // stack. The old removeLoot + addLoot(20%) pair instead ADDED each listed
  // food to every Overworld chest at 20% (~2.6 foods/chest, incl. a 20%
  // golden apple). The keep rate is the 0.20 the code used; the older notes
  // here said "90% / keep 10%" and "25% capped to 1" — neither matched.
  var reducedFoods = [
    'minecraft:bread',
    'minecraft:apple',
    'minecraft:golden_apple',
    'minecraft:golden_carrot',
    'minecraft:cookie',
    'minecraft:pumpkin_pie',
    'minecraft:beetroot_soup',
    'minecraft:mushroom_stew',
    'minecraft:suspicious_stew',
    'minecraft:baked_potato',
    'minecraft:carrot',
    'minecraft:potato',
    'minecraft:beetroot',
    'minecraft:melon_slice',
    'minecraft:sweet_berries',
    'minecraft:dried_kelp',
    'minecraft:cake'
  ]

  // Apply food reduction in Overworld chest loot.
  // Single modifier, single one-shot strip: every stack of a listed food is
  // removed with 80% probability (kept at 20%), nothing is added back.
  // ORDERING (2026-10-10): the VILLAGE_FOOD_BOOST adds and the Epic Dungeons
  // theme adds used to be registered BEFORE this strip, so it thinned them too.
  // Both are now registered right AFTER it (next two blocks), so this strip
  // only ever sees food that a table itself rolled.
  let foodMod = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')

  icraft.section('loot/lootjs_overhaul/non-meat-food-items-to-reduce', function () {
  foodMod.removeLoot(keepLootChanceFilter(reducedFoods, 0.20))
  })

  // --- Remove unstackable food entirely (space cloggy in early chests) ---
  // Runs after the 20% roll above, so the four listed in BOTH arrays
  // (beetroot_soup, mushroom_stew, suspicious_stew, cake) always end up
  // removed; rabbit_stew is removed here only.
  icraft.section('loot/lootjs_overhaul/remove-unstackable-food-entirely', function () {
  var unstackableFoods = [
    'minecraft:beetroot_soup',
    'minecraft:mushroom_stew',
    'minecraft:suspicious_stew',
    'minecraft:rabbit_stew',
    'minecraft:cake'
  ]
  unstackableFoods.forEach(food => {
    foodMod.removeLoot(food)
  })
  })

  // ─── VILLAGE FOOD + SEED BOOST — registration (moved here 2026-10-10) ───
  // The two lists and addVillageFoodSeedBoost() are defined in the village
  // block further up. Registered AFTER the food strip so the boost really sits
  // "on top of" the reduction: the strip has already run when these foods are
  // added, so each drops at its listed chance. (The modded-food strip below
  // still runs after this point; it exempts the four Farmer's Delight village
  // seeds — stripFDExceptVillageSeeds.)
  // 5 vanilla biome houses
  icraft.section('loot/lootjs_overhaul/village-food-seed-boost-registration', function () {
  villageHouseChests.forEach(addVillageFoodSeedBoost)
  // CTOV (Choice Theorem's Overhauled Village) — broad regex; village-only
  // tables. The ctov: namespace ships dozens of structure-specific chest
  // tables and the food/seed boost is universally appropriate for any
  // "this is someone's home" chest in a CTOV village.
  addVillageFoodSeedBoost(/ctov:.*chests.*/)
  // CTOV alias tables that forward to a ctov:chests/ table (see
  // moddedVillagePatterns; the leatherworker alias forwards to the vanilla
  // tannery table, which gets no boost).
  addVillageFoodSeedBoost(/^ctov:village\/(?!swamp\/leatherworker).*/)
  // Villages and Pillages — similar coverage. [2026-10-10] the regex was
  // /villagesandpillages:.*chests.*/, which matched nothing: the mod's three
  // tables are villagesandpillages:village_witch/house/{attic_chest,barrel,
  // personal_chest}. Now the same /^villagesandpillages:.+/ the rest of this
  // file uses for it.
  addVillageFoodSeedBoost(/^villagesandpillages:.+/)
  })

  // ─── EPIC DUNGEONS THEME ADDS (moved here 2026-10-10 from Section 4B) ───
  // overhauledstructures family flavor (strip + universal kit + master bonus
  // stay in Section 4B). Registered AFTER the Section 5A clutter strips and the
  // food strip above, which are meant for what a table rolls by itself, not
  // for these deliberate adds. Tables / items / counts / chances unchanged.

  // --- Family ovdb (basic): dungeoneering supplies ---
  icraft.section('loot/lootjs_overhaul/family-ovdb-dungeoneering-supplies', function () {
  var ovdbMod = event.addLootTableModifier(/overhauledstructures:chests\/ovdb_loot_tables\/.*/)
  ovdbMod.addLoot(LootEntry.of('minecraft:torch').limitCount([2, 6]).when(c => c.randomChance(0.60)))
  ovdbMod.addLoot(LootEntry.of('minecraft:bread').limitCount([2, 4]).when(c => c.randomChance(0.35)))
  ovdbMod.addLoot(LootEntry.of('minecraft:iron_ingot').limitCount([1, 3]).when(c => c.randomChance(0.25)))
  ovdbMod.addLoot(LootEntry.of('minecraft:map').when(c => c.randomChance(0.15)))
  ovdbMod.addLoot(LootEntry.of('minecraft:compass').when(c => c.randomChance(0.05)))
  })

  // --- Family ovdp (prison): decrepit theme ---
  icraft.section('loot/lootjs_overhaul/family-ovdp-decrepit-theme', function () {
  var ovdpMod = event.addLootTableModifier(/overhauledstructures:chests\/ovdp_loot_tables\/.*/)
  ovdpMod.addLoot(LootEntry.of('minecraft:chain').limitCount([2, 6]).when(c => c.randomChance(0.50)))
  ovdpMod.addLoot(LootEntry.of('minecraft:rotten_flesh').limitCount([3, 8]).when(c => c.randomChance(0.40)))
  ovdpMod.addLoot(LootEntry.of('minecraft:bone').limitCount([2, 5]).when(c => c.randomChance(0.40)))
  ovdpMod.addLoot(LootEntry.of('minecraft:soul_lantern').when(c => c.randomChance(0.15)))
  ovdpMod.addLoot(LootEntry.of('minecraft:name_tag').when(c => c.randomChance(0.06)))
  ovdpMod.addLoot(LootEntry.of('minecraft:iron_ingot').limitCount([1, 2]).when(c => c.randomChance(0.15)))
  })

  // --- Family ovds (spiders): web/venom theme ---
  icraft.section('loot/lootjs_overhaul/family-ovds-web-venom-theme', function () {
  var ovdsMod = event.addLootTableModifier(/overhauledstructures:chests\/ovds_loot_tables\/.*/)
  ovdsMod.addLoot(LootEntry.of('minecraft:string').limitCount([4, 12]).when(c => c.randomChance(0.70)))
  ovdsMod.addLoot(LootEntry.of('minecraft:cobweb').limitCount([2, 6]).when(c => c.randomChance(0.45)))
  ovdsMod.addLoot(LootEntry.of('minecraft:spider_eye').limitCount([1, 4]).when(c => c.randomChance(0.40)))
  ovdsMod.addLoot(LootEntry.of('minecraft:fermented_spider_eye').when(c => c.randomChance(0.15)))
  ovdsMod.addLoot(LootEntry.of('minecraft:poisonous_potato').when(c => c.randomChance(0.08)))
  })

  // --- Add small chance of a bed in Overworld chests (early QoL) ---
  icraft.section('loot/lootjs_overhaul/add-small-chance-of-a-bed-in-overworld', function () {
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .addLoot(
      LootEntry.of('minecraft:white_bed').when(c => c.randomChance(0.06))
    )
  })

  // --- Remove modded foods from structure chests (Overworld only) ---
  // Pam's HarvestCraft and Farmer's Delight foods should be player-crafted.
  // Uses KubeJS @mod filter to match all items from these namespaces.
  // 2026-06-14: this @farmersdelight strip is registered AFTER VILLAGE_SEED_BOOST
  // (registered just above), which adds the 4 FD village-farming seeds to village chests. LootJS
  // removeLoot is a one-shot removeIf in registration order, so this (later) strip
  // was EATING those earlier-added seeds — villages lost their intended FD-dominant
  // seed economy. Strip FD FOODS (player-crafted by design) but EXEMPT the 4 village
  // seeds so they survive. (FD foods in villages stay stripped — intended.)
  icraft.section('loot/lootjs_overhaul/remove-modded-foods-from-structure-chests', function () {
  var stripFDExceptVillageSeeds = function(stack) {
    try {
      if (!stack || stack.isEmpty()) return false
      var id = String(stack.id || '')
      if (!id) { try { id = String(stack.getItem().builtInRegistryHolder().key().location()) } catch (e) {} }
      if (id.indexOf('farmersdelight:') !== 0) return false
      if (id === 'farmersdelight:cabbage_seeds' || id === 'farmersdelight:tomato_seeds' ||
          id === 'farmersdelight:onion' || id === 'farmersdelight:rice') return false
      return true
    } catch (e) { return false }
  }
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    // [2026-10-10] was '@pamhc' — no mod has that id, so Pam's items were never
    // stripped. The installed Pam's HarvestCraft 2 mods are these four.
    .removeLoot('@pamhc2crops')
    .removeLoot('@pamhc2foodcore')
    .removeLoot('@pamhc2foodextended')
    .removeLoot('@pamhc2trees')
    .removeLoot(ItemFilter.custom(stripFDExceptVillageSeeds))  // was '@farmersdelight' — exempt the 4 FD village seeds (see note)
    .removeLoot('@brewinandchewin')
    .removeLoot('@culturaldelights')
    .removeLoot('@delightful')
    .removeLoot('@nethersdelight')
  })
    // ('@farmersrespite', '@collectorsreap' and '@croptopia' removed 2026-10-10:
    //  none of the three mods is installed.)

  // --- Remove tier-gated mod items from Overworld chests ---
  // These mods inject items into vanilla loot tables but are AStages-gated,
  // causing "Unfamiliar Item" confusion for pre-tier players.
  // Strip dimension mod items from Overworld chests (tag leakage)
  icraft.section('loot/lootjs_overhaul/remove-tier-gated-mod-items-from-overworld', function () {
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .removeLoot('@aether')
    .removeLoot('@deep_aether')
    .removeLoot('@blue_skies')
    .removeLoot('@twilightforest')
    .removeLoot('@theabyss')
    .removeLoot('blue_skies:moonstone_shard')
    .removeLoot('blue_skies:ventium_ingot')
    .removeLoot('blue_skies:falsite_ingot')
    .removeLoot('blue_skies:horizonite_ingot')
    .removeLoot('blue_skies:charoite')
    .removeLoot('blue_skies:diopside_gem')

  // Blue Skies gatekeeper houses spawn in overworld plains/mountain/snowy
  // biomes (the lore entry-point to Blue Skies dimensions). Their barrels
  // were falling outside the broad LootType.CHEST + anyDimension('overworld')
  // matchers above -- so they were getting:
  //   - Unfiltered Relics GLM injection (Infinity Ham + other strips)
  //   - Unfiltered Apotheosis gem GLM injection (uncut/dead gems)
  //   - Unfiltered Artifacts GLM injection (untiered artifacts)
  //   - Native T2 leakage in the barrel tables (ventium, moonstone)
  //
  // Fix (2026-05-14): explicit per-table strip applying the same
  // namespaced filters our overworld chests get, but routed via
  // addLootTableModifier so the targeting can't be missed.
  //
  // Native barrel contents observed in the BS jar:
  //   plains:   baked_potato/black_wool/bread/dandelion + ventium_ingot (T2)
  //   book:     book/paper/bread/map + moonstone_shard (T2 portal mat)
  //   mountain: wheat/stick/bread/spruce_log + cooked_monitor_tail + leather_boots
  //   snowy:    wheat/charcoal/bread/sweet_berries + snowcap_pinhead
  //
  // Note: post-alpha, if Blue Skies moves to T1 (see roadmap/planned.md),
  // remove this whole block -- gatekeeper houses become legitimate T1
  // discovery loot at that point.
  var gatekeeperHouseChests = [
    'blue_skies:chests/gatekeeper_house/plains',
    'blue_skies:chests/gatekeeper_house/mountain',
    'blue_skies:chests/gatekeeper_house/snowy',
    'blue_skies:chests/gatekeeper_house/book',
  ]
  gatekeeperHouseChests.forEach(table => {
    let mod = event.addLootTableModifier(table)
    // Same curated relic strip the overworld chests get
    removedRelics.forEach(r => mod.removeLoot(r))
    // T2+ Blue Skies metals + portal material
    mod.removeLoot('blue_skies:ventium_ingot')
    mod.removeLoot('blue_skies:moonstone_shard')
    mod.removeLoot('blue_skies:falsite_ingot')
    mod.removeLoot('blue_skies:horizonite_ingot')
    mod.removeLoot('blue_skies:charoite')
    mod.removeLoot('blue_skies:diopside_gem')
    // Apotheosis GLM injects uncut/dead gems here -- strip the whole
    // namespace from gatekeeper barrels (legitimate gems still flow into
    // villages + dungeons via curated paths elsewhere).
    mod.removeLoot('@apotheosis')
    // Artifacts GLM injects untiered artifacts -- T1 villages get a
    // curated artifact pool in Section 6; gatekeeper barrels just strip.
    mod.removeLoot('@artifacts')
  })
  })

  // =========================================================================
  // SECTION 5C: OCEAN STRUCTURE LOOT
  // =========================================================================
  // Ocean structures (Ruins, Shipwrecks, Buried Treasure) get T1-appropriate
  // nautical loot and fishing gear. (The legacy token-fragment seeding is
  // retired.) YUNG's Better Ocean Monuments gets the premium water curios at
  // the end of this section; its diamond-horse-armor strip is in Section 4C.
  // =========================================================================

  // --- Vanilla Ocean Structures: Shipwrecks, Ocean Ruins, Buried Treasure ---
  // T1 ocean loot: nautical supplies
  icraft.section('loot/lootjs_overhaul/vanilla-ocean-structures-shipwrecks-ocean', function () {
  event
    .addLootTableModifier(
      'minecraft:chests/shipwreck_treasure',
      'minecraft:chests/shipwreck_map',
      'minecraft:chests/shipwreck_supply',
      'minecraft:chests/underwater_ruin_big',
      'minecraft:chests/underwater_ruin_small',
      'minecraft:chests/buried_treasure')
    .addLoot(LootEntry.of('minecraft:prismarine_shard').limitCount([1, 3]).when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('minecraft:prismarine_crystals').limitCount([1, 2]).when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('minecraft:nautilus_shell').when(c => c.randomChance(0.08)))
  })

  // --- Vanilla Ocean Monument --- REMOVED 2026-10-10
  // The modifier here targeted 'minecraft:chests/ocean_monument' (prismarine
  // 25% / crystals 20% / sponge 10%). No such loot table exists: vanilla 1.20.1
  // monuments have no chests, and neither a mod nor a pack datapack ships that
  // id — it never ran. The real monument chest is YUNG's
  // betteroceanmonuments:chests/upper_side_chamber (handled below + Section 4C).

  // --- Ocean structure curio drops: HEAVILY oceanic/fishing themed ---
  // Ocean structures should feel rewarding for aquatic exploration.
  // High chance for water-themed artifacts and fishing gear.
  icraft.section('loot/lootjs_overhaul/ocean-structure-curio-drops-heavily-oceanic', function () {
  event
    .addLootTableModifier(
      'minecraft:chests/shipwreck_treasure',
      'minecraft:chests/shipwreck_map',
      'minecraft:chests/shipwreck_supply',
      'minecraft:chests/underwater_ruin_big',
      'minecraft:chests/underwater_ruin_small',
      'minecraft:chests/buried_treasure')
    // ('minecraft:chests/ocean_monument' removed 2026-10-10 — no such table)
    // Artifacts handled by Artifacts mod native GLM injection into these tables
    // Aquaculture fishing loot
    .addLoot(
      LootEntry.of('minecraft:fishing_rod').when(c => c.randomChance(0.12))
    )
    .addLoot(
      LootEntry.of('minecraft:tropical_fish_bucket').when(c => c.randomChance(0.08))
    )
    .addLoot(
      LootEntry.of('minecraft:heart_of_the_sea').when(c => c.randomChance(0.05))
    )
  })

  // --- YUNG's Better Ocean Monuments: premium ocean loot ---
  // Heavily water-themed curios
  icraft.section('loot/lootjs_overhaul/yungs-better-ocean-monuments-premium-ocean', function () {
  event
    .addLootTableModifier(/betteroceanmonuments:.*/)
    .addLoot(
      LootEntry.of('artifacts:snorkel').when(c => c.randomChance(0.20))
    )
    .addLoot(
      LootEntry.of('artifacts:flippers').when(c => c.randomChance(0.20))
    )
    .addLoot(
      LootEntry.of('artifacts:umbrella').when(c => c.randomChance(0.10))
    )
    .addLoot(
      LootEntry.of('artifacts:crystal_heart').when(c => c.randomChance(0.06))
    )
    .addLoot(
      LootEntry.of('minecraft:heart_of_the_sea').when(c => c.randomChance(0.08))
    )
  })

  // =========================================================================
  // SECTION 6: VILLAGE CHEST LOOT RESTRICTIONS
  // =========================================================================
  // Design doc: Village loot should be T1-appropriate only.
  // Remove powerful modded items, ensure iron/leather gear baseline.
  // Apotheosis affixes are applied post-generation and cannot be controlled
  // here, but we can remove obvious tier-breaking items.
  // =========================================================================

  var villageChests = [
    'minecraft:chests/village/village_weaponsmith',
    'minecraft:chests/village/village_toolsmith',
    'minecraft:chests/village/village_armorer',
    'minecraft:chests/village/village_plains_house',
    'minecraft:chests/village/village_desert_house',
    'minecraft:chests/village_desert_house',   // alias table -> village/village_desert_house (dev/loot_audit/alias_tables.json)
    'minecraft:chests/village/village_savanna_house',
    'minecraft:chests/village/village_snowy_house',
    'minecraft:chests/village/village_taiga_house',
    'minecraft:chests/village/village_temple',
    'minecraft:chests/village/village_fisher',
    'minecraft:chests/village/village_fletcher',
    'minecraft:chests/village/village_tannery',
    'ctov:village/swamp/leatherworker',        // alias table -> village_tannery (dev/loot_audit/alias_tables.json)
    'minecraft:chests/village/village_shepherd',
    'minecraft:chests/village/village_butcher',
    'minecraft:chests/village/village_cartographer',
    'minecraft:chests/village/village_mason'
  ]

  // Remove all diamond+ gear and powerful modded items from village chests
  icraft.section('loot/lootjs_overhaul/section-6-village-chest-loot-restrictions', function () {
  villageChests.forEach(table => {
    event
      .addLootTableModifier(table)
      .removeLoot('minecraft:diamond')
      .removeLoot('minecraft:diamond_sword')
      .removeLoot('minecraft:diamond_pickaxe')
      .removeLoot('minecraft:diamond_axe')
      .removeLoot('minecraft:diamond_shovel')
      .removeLoot('minecraft:diamond_hoe')
      .removeLoot('minecraft:diamond_helmet')
      .removeLoot('minecraft:diamond_chestplate')
      .removeLoot('minecraft:diamond_leggings')
      .removeLoot('minecraft:diamond_boots')
      .removeLoot('minecraft:diamond_horse_armor')
      .removeLoot('minecraft:golden_horse_armor')
      .removeLoot('minecraft:iron_horse_armor')
      .removeLoot('minecraft:enchanted_golden_apple')
      // Per-table strips — the global Section 5A overworld strip's
      // LootType.CHEST + anyDimension filter doesn't reliably match
      // village loot contexts. 2026-04-20 tester confirmed the rotten_flesh
      // strip works here; also confirmed string was still very frequent
      // and wood/stone still present, both of which the global strip
      // was supposed to handle. Move to per-table.
      .removeLoot('minecraft:rotten_flesh')
      .removeLoot('minecraft:string')
      .removeLoot('minecraft:gunpowder')
      .removeLoot('minecraft:bone')
      .removeLoot('minecraft:name_tag')
      .removeLoot('minecraft:spider_eye')
      .removeLoot('minecraft:poisonous_potato')
      // The per-table blank-enchanted-book strip was retired 2026-05-17 (its
      // NBT-regex ItemFilter never matched Forge 1.20.1's real NBT — see the
      // Section-1 note at the top of this file). A dangling
      // blankEnchantedBookFilter reference survived that cleanup and threw a
      // ReferenceError on this modifier every load; removed 2026-06-05.
      // Wood + stone
      .removeLoot('#minecraft:logs')
      .removeLoot('#minecraft:planks')
      .removeLoot('minecraft:stone')
      .removeLoot('minecraft:cobblestone')
      .removeLoot('minecraft:granite')
      .removeLoot('minecraft:andesite')
      .removeLoot('minecraft:diorite')
  })

  // Add guaranteed basic gear to smith village chests
  event
    .addLootTableModifier(
      'minecraft:chests/village/village_weaponsmith',
      'minecraft:chests/village/village_toolsmith',
      'minecraft:chests/village/village_armorer')
    .addLoot(LootEntry.of('minecraft:iron_ingot').limitCount([2, 5]))
    .addWeightedLoot([
      Item.of('minecraft:iron_sword').withChance(20),
      Item.of('minecraft:iron_pickaxe').withChance(20),
      Item.of('minecraft:iron_axe').withChance(15),
      Item.of('minecraft:leather_helmet').withChance(15),
      Item.of('minecraft:leather_chestplate').withChance(10),
      Item.of('minecraft:leather_leggings').withChance(10),
      Item.of('minecraft:leather_boots').withChance(10)
    ])
  })

  // Flat ~4% curated artifact roll across all village chests.
  // Replaces the stacked artifacts:inject/chests/village/* + celestial_artifacts
  // village GLMs that were producing 25-30% artifact rates with multiple items
  // per chest. Excluded: plastic_drinking_hat, novelty_drinking_hat (user dislike),
  // and "the horse one" (pending user identification).
  //
  // Per-chest rate math: 25 items × 0.16% each = ~4% any-artifact rate.
  // Independent rolls mean technically a chest COULD spawn two artifacts, but
  // the probability is ~0.08% per chest — rare enough to ignore.
  // Village-only artifact pool: combat/utility focused, curated mid-tier set.
  // 2026-04-21: removed `artifacts:cloud_in_a_bottle` — it was also in
  // artifactT1Pool (Overworld broadcast), so it had two independent sources
  // per village chest (T1 broadcast + village weighted roll), producing the
  // observed double-accessory stacking. Cloud still spawns everywhere else
  // in the Overworld via the T1 broadcast; villages now get only these 11
  // items that are unique to the village pool.
  var villageArtifactPool = relicAllowed([
    'artifacts:power_glove',
    'artifacts:feral_claws',
    'artifacts:cross_necklace',
    'artifacts:panic_necklace',
    'artifacts:antidote_vessel',
    'artifacts:crystal_heart',
    'artifacts:obsidian_skull',
    'artifacts:night_vision_goggles',
    // ('artifacts:drama_mask' removed 2026-10-10 — not an item in Artifacts 9.5.16)
    'artifacts:universal_attractor',
    'artifacts:pickaxe_heater',
    // [2026-06-06] mage slate (operator directive): the pool skewed martial/utility.
    // ISS/Ars namespaces bypass the nonCuratedArtifactFilter strips by design and
    // ship their own lang. All verified ungated at T1 (appendix A.1 blesses ISS+Ars
    // mage entry). Pool auto-normalizes (0.10/length) so combined village artifact
    // supply stays ~10% - these redistribute, not inflate (mage ~35% of rolls).
    'irons_spellbooks:mana_ring',
    'irons_spellbooks:cooldown_ring',
    'irons_spellbooks:cast_time_ring',
    'irons_spellbooks:concentration_amulet',
    // ('ars_nouveau:amulet_of_mana_regen' removed 2026-10-11: Ars mana is
    //  deprecated -- Ars spells use the Iron's pool (ArsManaCapMixin) -- so the
    //  amulet does nothing; a reward with no effect. The discount ring below
    //  still works: its spell-cost discount applies to the shared pool.)
    'ars_nouveau:ring_of_lesser_discount'
  ])
  icraft.section('loot/lootjs_overhaul/section-6-village-chest-loot-restrictions-2', function () {
  var villageArtifactPerItemChance = 0.10 / villageArtifactPool.length  // ~10% combined — matches overall T1 artifact rate (2026-04-20, was 15% since 2026-04-19)
  })

  // Modded village chest patterns — CTOV, VillagesAndPillages, etc. generate
  // their own custom villages whose loot tables aren't in the vanilla list.
  // Regex match catches any chest path containing "village" under these mods.
  //
  // [2026-10-10] Table regexes are FULL-MATCH (Section 1B). /^ctov:chests\//
  // only matched an id that ends right after "chests/", i.e. none of CTOV's 12
  // tables (ctov:chests/village/village_*): the sanitisation, the village
  // artifact pool, the rotten-flesh strip, the QoL roll and the compass /
  // backpack adds below never ran for CTOV villages. Completed with .* .
  //
  // [2026-10-11] The repurposed_structures pattern had the same defect
  // (/^repurposed_structures:chests\/villages\// matched nothing). Completed
  // for its OVERWORLD villages only (operator ruling: the structures generate,
  // so the rules must reach them): badlands, bamboo, birch, cherry, dark_forest,
  // giant_taiga, jungle, mountains, mushroom, oak, ocean and swamp. Its Nether
  // villages (crimson_*, warped_*) are excluded — the T2+ glyph / spell-book
  // strips and the artifact filter below would remove the Nether's own T3
  // loot; they stay under the Nether dimension rules. The townstead pattern
  // was removed: Townstead ships no loot table.
  //
  // /^ctov:village\/.*/ (2026-10-11) is for the CTOV ALIAS tables: three CTOV
  // jobsite pieces name a structure path as their chest's loot table
  // (ctov:village/desert_fortified/bakery, ctov:village/swamp/leatherworker,
  // ctov:village/desert/); kubejs/data now forwards those ids to the tables
  // the chests were meant to roll (dev/loot_audit/alias_tables.json). LootJS
  // sees only the alias id, so the village rules have to name it. The
  // leatherworker alias forwards to the VANILLA tannery table, so it sits in
  // villageChests next to it instead (same rules as its target) and is
  // excluded here — in both lists it would get the village adds twice.
  var moddedVillagePatterns = [
    /^ctov:chests\/.*/,
    /^ctov:village\/(?!swamp\/leatherworker).*/,
    /^villagesandpillages:.+/,
    /^repurposed_structures:chests\/villages\/(?!crimson_|warped_).*/,
  ]

  // --- Village chest sanitization (runs FIRST) ---
  // Strip ALL T1 global pool items from villages so villages only get
  // the dedicated village pool above. Also strip mod leakage.
  //
  // 2026-04-20: removed @ars_nouveau / @irons_spellbooks / @moreartifacts
  // tag-based catch-alls from village sanitization. Per the mechanic note
  // (Section 1B): this village block is registered AFTER the global Overworld
  // glyph / spell-book re-adds (Section 1B area), so those broad tag strips ran
  // later on the shared list and DID eat the T1 glyphs / novice_spell_book /
  // source_gem / common_ink those earlier modifiers had added to village chests.
  // (It's registration order, not a "persistent filter" — and note Section 6B's
  // own re-adds are registered AFTER this block and were never affected.) Keep
  // only targeted strips for things we explicitly don't want in villages
  // (higher-tier spell books, tier tokens, T2+ glyphs).
  icraft.section('loot/lootjs_overhaul/village-chest-sanitization', function () {
  villageChests.forEach(function(table) {
    var vSan = event.addLootTableModifier(table)
    // Remove ALL T1 global-pool items (handled by village artifact pool instead)
    artifactT1Pool.forEach(function(item) {
      vSan.removeLoot(item)
    })
    // Strip higher-tier spell books that shouldn't appear in starter-area villages
    vSan.removeLoot('ars_nouveau:apprentice_spell_book')
      .removeLoot('ars_nouveau:archmage_spell_book')
    // [2026-06-07] ALL ISS spellbooks out of villages (operator directive -
    // class starter kits cover mage entry). The T1 Overworld broadcast
    // (copper 3% / iron 1%, Section 2 dimension ladder) reaches village
    // chests and the global off-tier strip is unreliable under Lootr
    // wrapping (see glyph note below) -> per-table strip, the safe pattern.
    // Safe to strip now that the Section 6B QoL pool no longer re-adds books.
    vSan.removeLoot('irons_spellbooks:copper_spell_book')
      .removeLoot('irons_spellbooks:iron_spell_book')
    // (legacy kubejs:tierN_token village strips removed — currency retired,
    //  tokens are no longer seeded anywhere so the strip is a dead no-op)
    // Defensive: strip T2+ glyphs explicitly. The global off-tier strip at
    // line ~371 uses LootType.CHEST + anyDimension('minecraft:overworld'),
    // which under Lootr's aggressive_mode wrapping doesn't reliably match
    // village loot contexts. Per-table strip is unambiguous.
    glyphT2.concat(glyphT3, glyphT4).forEach(function(g) { vSan.removeLoot(g) })
  })

  // Same T2+ glyph guard for modded village patterns (CTOV, VnP, etc.)
  // [2026-06-07] fix-the-five: this loop never carried the spellbook strips
  // the vanilla-table loop had - modded-pattern village chests could roll
  // apprentice/archmage (and now copper/iron) from the dimension broadcasts.
  moddedVillagePatterns.forEach(function(pattern) {
    var vSanMod = event.addLootTableModifier(pattern)
    glyphT2.concat(glyphT3, glyphT4).forEach(function(g) { vSanMod.removeLoot(g) })
    vSanMod.removeLoot('ars_nouveau:apprentice_spell_book')
      .removeLoot('ars_nouveau:archmage_spell_book')
      .removeLoot('irons_spellbooks:copper_spell_book')
      .removeLoot('irons_spellbooks:iron_spell_book')
  })
  })

  // --- Predicate catch-all: strip any artifact that isn't from the village pool ---
  // 2026-04-21: per-item string strips at line ~1554 weren't catching T1
  // broadcast leaks (tester reported uncurated artifacts appearing in village
  // chests with artifacts outside villageArtifactPool). Predicate runs at
  // roll time and evaluates whatever is actually in the pool, so it catches
  // leaks regardless of which modifier added them.
  //
  // 2026-04-21 (second pass): tester reported possible accessory double-stacking
  // — suspicion that the T1 broadcast was adding `artifacts:cloud_in_a_bottle`
  // alongside the village pool's own roll (they share that item). Confirmed:
  // `cloud_in_a_bottle` is in BOTH `villageArtifactPool` (whitelist) and
  // `artifactT1Pool` (broadcast source). Whitelist-based predicate let the
  // broadcast's cloud through, and the village pool's independent weighted
  // roll could also produce a cloud in the same chest.
  //
  // Fix: strip only the T1 broadcast items (only pool that injects into
  // Overworld villages). T2/T3/T4 broadcasts target non-Overworld dimensions
  // and don't leak here. The T1 pool is where the `cloud_in_a_bottle`
  // double-stack came from — it's in both artifactT1Pool (broadcast) and
  // villageArtifactPool (curated). Strip it from villages unconditionally
  // and let the village's own addWeightedLoot roll be its only source.
  //
  // IMPORTANT: do NOT add artifactT2Pool/T3/T4 items to this strip set.
  // villageArtifactPool contains items that are BOTH T2+ broadcast entries
  // (power_glove, cross_necklace, panic_necklace, etc.) AND village-curated.
  // A strip including those would also strip the village pool's own rolls,
  // because removeLoot on a table applies after addWeightedLoot too.
  icraft.section('loot/lootjs_overhaul/predicate-catch-all-strip-any-artifact-that', function () {
  var t1BroadcastItemSet = {}
  artifactT1Pool.forEach(function(id) { t1BroadcastItemSet[id] = true })
  var villageArtifactWhitelistSet = {}
  villageArtifactPool.forEach(function(id) { villageArtifactWhitelistSet[id] = true })
  var nonCuratedArtifactFilter = function(stack) {
    try {
      if (!stack || stack.isEmpty()) return false
      var id = String(stack.id || '')
      if (!id) {
        try { id = String(stack.getItem().builtInRegistryHolder().key().location()) } catch (e) {}
      }
      if (!id) return false
      // Strip 1: any T1 broadcast item. These come from Section 1C's
      // `addLootTypeModifier(LootType.CHEST).anyDimension(OW)` injection
      // and are always wrong for villages (villages get their own pool).
      // Eliminates the cloud_in_a_bottle double-stack.
      if (t1BroadcastItemSet[id]) return true
      // Strip 2: any artifact/relic item from a namespace we care about that
      // isn't one of our curated items. Use an explicit whitelist of what
      // villages ARE allowed to produce (villageArtifactPool), so uncurated
      // mod artifacts get stripped while curated T2+ items pass through.
      var isArtifactNs = (
        id.indexOf('artifacts:') === 0 ||
        id.indexOf('relics:') === 0 ||
        id.indexOf('celestial_artifacts:') === 0
      )
      if (!isArtifactNs) return false
      return !villageArtifactWhitelistSet[id]
    } catch (e) { return false }
  }
  villageChests.forEach(function(table) {
    event.addLootTableModifier(table).removeLoot(ItemFilter.custom(nonCuratedArtifactFilter))
  })
  moddedVillagePatterns.forEach(function(pattern) {
    event.addLootTableModifier(pattern).removeLoot(ItemFilter.custom(nonCuratedArtifactFilter))
  })
  })

  // --- Village artifact pool (runs AFTER sanitization) ---
  // 2026-04-21 (third rewrite): tester reported artifacts landing in NEARLY
  // EVERY chest, despite a weighted pool designed for ~11% rate. Root cause
  // is almost certainly that LootJS 2.13.1 drops `Item.of('minecraft:air')`
  // from `addWeightedLoot` pools (air isn't a real insertable item), which
  // collapses the pool to just-artifacts and makes every roll pick one.
  //
  // Switched back to per-item `addLoot(entry.when(randomChance))` at 1%
  // per item. For 11 items: P(at least one) = 1 - 0.99^11 ≈ 10.5%,
  // matching the intended target. This is the same pattern the enchanted
  // book adds at lines 181-222 use reliably (those consistently fire at
  // 7.5%/10%/12.5%/15% per tester reports).
  icraft.section('loot/lootjs_overhaul/village-artifact-pool', function () {
  var villageArtifactPerItem = 0.01
  villageChests.forEach(function(table) {
    var vMod = event.addLootTableModifier(table)
    villageArtifactPool.forEach(function(id) {
      vMod.addLoot(LootEntry.of(id).when(c => c.randomChance(villageArtifactPerItem)))
    })
  })
  moddedVillagePatterns.forEach(function(pattern) {
    var vMod = event.addLootTableModifier(pattern)
    villageArtifactPool.forEach(function(id) {
      vMod.addLoot(LootEntry.of(id).when(c => c.randomChance(villageArtifactPerItem)))
    })
  })
  })

  // --- Rotten flesh strip: modded villages (CTOV/VnP) weren't covered ---
  // Per-pattern strip (the global Overworld strip is unreliable).
  icraft.section('loot/lootjs_overhaul/rotten-flesh-strip-modded-villages-werent', function () {
  moddedVillagePatterns.forEach(function(pattern) {
    event.addLootTableModifier(pattern)
      .removeLoot('minecraft:rotten_flesh')
  })
  })

  // =========================================================================
  // SECTION 6B: VILLAGE QOL ROLL — magic material, all 16 tables + modded
  // =========================================================================
  // Every village chest (the 16 vanilla tables + the modded patterns) gets ONE
  // gated roll: 45/97 (~46.4%) of chests get one magic material, picked by
  // weight — common ink 30 : source gem 15. Per chest that is
  //     common ink  30/97 = 30.9%
  //     source gem  15/97 = 15.5%
  //     nothing     52/97 = 53.6%
  // the rates the 2026-06-07 note below was holding.
  //
  // History: 2026-04-20 this was a weighted pool with a bed, magic material,
  // a copper and a novice spell book and an "air = nothing" slot; 2026-04-21
  // the bed left (house tables have their own bed roll); 2026-06-07 the spell
  // books left (operator directive — starter kits cover mage entry) and the
  // air weight went 40 -> 52 to hold ink / source gem at 30.9% / 15.5%.
  //
  // [2026-10-10] The air slot never worked: `Item.of('minecraft:air')
  // .withChance(52)` resolves to KubeJS's shared EMPTY OutputItem, whose chance
  // is NaN, and LootJS turns a NaN chance into weight 1. The pool was really
  // air 1 : ink 30 : gem 15, i.e. ~65% ink / ~33% source gem / ~2% nothing per
  // village chest. The "nothing" share is now a randomChance gate in front of
  // the pick (the same shape loot/lovely_pieces_loot.js uses), which also
  // stops an EMPTY stack being pushed into the shared loot list.
  icraft.section('loot/lootjs_overhaul/section-6b-village-qol-roll-magic-material', function () {
  var VILLAGE_QOL_SHARE = 45 / 97
  var villageQoLPool = [
    LootEntry.of('irons_spellbooks:common_ink').withWeight(30),
    LootEntry.of('ars_nouveau:source_gem').withWeight(15)
  ]

  villageChests.forEach(function(table) {
    event.addLootTableModifier(table).randomChance(VILLAGE_QOL_SHARE).addWeightedLoot(villageQoLPool)
  })
  moddedVillagePatterns.forEach(function(pattern) {
    event.addLootTableModifier(pattern).randomChance(VILLAGE_QOL_SHARE).addWeightedLoot(villageQoLPool)
  })
  })

  // --- Nature's Compass + base Sophisticated Backpack — village chest adds ---
  // Nature's Compass at 5%: useful for locating our iridescent_biomes:cherry_river_valley
  // and iridescent_biomes:cherry_mountains biomes (which generate after the
  // minecraft:is_overworld tag fix 2026-04-22).
  // Sophisticated Backpacks base variant at 4%: leather+chest+string crafting
  // tier, 27 slots when placed, also wearable via the Curios back slot.
  // Gives T1 players a real inventory bump in a pack-coherent way without
  // spawning the upgraded tiers (iron/gold/diamond/netherite) prematurely.
  icraft.section('loot/lootjs_overhaul/natures-compass-base-sophisticated-backpack', function () {
  villageChests.forEach(function(table) {
    event.addLootTableModifier(table)
      .addLoot(LootEntry.of('naturescompass:naturescompass').when(c => c.randomChance(0.05)))
      .addLoot(LootEntry.of('sophisticatedbackpacks:backpack').when(c => c.randomChance(0.04)))
  })
  moddedVillagePatterns.forEach(function(pattern) {
    event.addLootTableModifier(pattern)
      .addLoot(LootEntry.of('naturescompass:naturescompass').when(c => c.randomChance(0.05)))
      .addLoot(LootEntry.of('sophisticatedbackpacks:backpack').when(c => c.randomChance(0.04)))
  })
  })

  // =========================================================================
  // SECTION 7: TOWER STRUCTURE CURIO DROPS + MAGIC LOOT (REBUILT)
  // =========================================================================
  // Tower structures get curated curio drops at 8% per item (reduced from
  // 12-15%) plus magic starter items. Structory Towers and Keebsz share
  // a common curio pool but Keebsz gets floor-tiered loot in Section 8D.
  // =========================================================================

  // ─── MARQUEE STRUCTURE THEMED POOLS (added 2026-05-17) ─────────────────
  // Per master.md Part XIII §Marquee structures + master-appendix.md §N.
  //
  // 14 marquee structures across T1-T4 each receive a curated themed pool
  // layered on top of the dimensional baseline. Themed pool rate is
  // calibrated at ~70% of tier rate (~7% T1, ~8.4% T2, ~9.8% T3, ~11.2% T4).
  // Combined per-chest at marquees is ~1.7× tier rate (rewards intentional
  // exploration); generic chests stay at tier rate.
  //
  // ISS spellbooks (copper/apprentice/archmage) capped at 2% per chest. The
  // starter kit handles "hard to start magic" onboarding; legacy 8-15% rates
  // (lootjs_overhaul.js pre-2026-05-17) were overkill.
  //
  // ISS scrolls remain a primary mage-progression vector — uncapped per
  // tier (t1Scroll/t2Scroll helpers, added at theme-fitting marquees only).
  //
  // Replaces 2026-04-22 towerCurioPool (9-item duplicate firing at ~40%
  // combined across TotW/Structory/Waystone, the source of the "same few
  // artifacts over and over again" tester complaint pre-2026-05-17).

  // Helper: T1/T2 ISS scroll loot entries (uses LootJS customFunction to
  // apply irons_spellbooks:randomize_spell — without it the scroll drops
  // blank). Kept from pre-2026-05-17 code; still used by marquee adds.
  function t1Scroll(chance) {
    return LootEntry.of('irons_spellbooks:scroll')
      .customFunction({
        function: 'irons_spellbooks:randomize_spell',
        quality: { min: 0.0, max: 0.2 }
      })
      .when(c => c.randomChance(chance))
  }
  function t2Scroll(chance) {
    return LootEntry.of('irons_spellbooks:scroll')
      .customFunction({
        function: 'irons_spellbooks:randomize_spell',
        quality: { min: 0.2, max: 0.5 }
      })
      .when(c => c.randomChance(chance))
  }

  // Per-tier combined themed rate (~70% of tier rate).
  var TIER_THEMED_RATE = { 1: 0.07, 2: 0.084, 3: 0.098, 4: 0.112 }
  var ISS_SPELLBOOK_CAP = 0.02
  // Per-tier scroll rate (uncapped, but tier-scaled).
  var TIER_SCROLL_RATE = { 1: 0.10, 2: 0.08, 3: 0.06, 4: 0.04 }
  // Per-tier enchanted book LEVELS (minecraft:book + enchantWithLevels, 10% per
  // marquee chest — registered by loot/zz_pack_enchanted_books.js, see applyMarquee).
  var TIER_BOOK_LEVELS = { 1: [5, 15], 2: [10, 20], 3: [15, 25], 4: [20, 30] }

  // NOTE on the theme lists below: an id that is on RELIC_DENY (relics:
  // magic_mirror, roller_skates, horse_flute, amphibian_boot, aqua_walker,
  // midnight_robe, magma_walker, enders_hand, elytra_booster, space_dissector,
  // chorus_inhibitor) is dropped by applyMarquee -> relicAllowed() before the
  // per-item chance is computed; the theme's combined rate is unchanged.

  // T1 Magic theme (used by tome_tower, TotW tower, TotW ocean tower).
  var T1_MAGIC = [
    'ars_nouveau:source_gem',                'ars_nouveau:novice_spell_book',
    'irons_spellbooks:common_ink',
    'artifacts:flame_pendant',               'artifacts:shock_pendant',
    'artifacts:thorn_pendant',               'artifacts:scarf_of_invisibility',
    'moreartifacts:purification_charm',      'moreartifacts:bezoar',
    'celestial_artifacts:traveler_scroll',   'celestial_artifacts:sakura_hairpin',
    'relics:magic_mirror',                   'relics:reflection_necklace'
  ]
  // T1 Generic exploration (Structory towers).
  var T1_GENERIC_EXPLORATION = [
    'artifacts:bunny_hoppers',               'artifacts:running_shoes',
    'artifacts:helium_flamingo',             'artifacts:universal_attractor',
    'artifacts:digging_claws',               'artifacts:rooted_boots',
    'artifacts:steadfast_spikes',
    'moreartifacts:fast_clock',              'moreartifacts:high_jumpers',
    'moreartifacts:leather_treads',
    'celestial_artifacts:gallop_necklace',
    'relics:roller_skates',                  'relics:leather_belt',
    'relics:horse_flute',                    'relics:amphibian_boot'
  ]
  // T1 Aquatic (buried_treasure + underwater_ruin tables).
  var T1_AQUATIC = [
    'artifacts:snorkel',                     'artifacts:flippers',
    'artifacts:aqua_dashers',                'artifacts:rooted_boots',
    'relics:aqua_walker',                    'relics:amphibian_boot',
    'relics:drowned_belt',                   'relics:jellyfish_necklace',
    'relics:spore_sack',
    'celestial_artifacts:treasure_hunter_necklace',
    'moreartifacts:ankh_charm'
  ]
  // T1 Illager/dark (woodland_mansion).
  var T1_ILLAGER_DARK = [
    'artifacts:scarf_of_invisibility',       'artifacts:lucky_scarf',
    'artifacts:superstitious_hat',           'artifacts:cross_necklace',
    'artifacts:antidote_vessel',             'artifacts:panic_necklace',
    'artifacts:thorn_pendant',
    'moreartifacts:ankh_charm',              'moreartifacts:tainted_mirror',
    'moreartifacts:purification_charm',      'moreartifacts:spectre_amulet',
    'relics:midnight_robe',
    'celestial_artifacts:undead_charm'
  ]
  // T1 Ancient/eldritch (stronghold tables).
  var T1_ANCIENT = [
    'artifacts:night_vision_goggles',        'artifacts:universal_attractor',
    'moreartifacts:fast_clock',              'moreartifacts:tainted_mirror',
    'celestial_artifacts:repent_mirror',     'celestial_artifacts:backtrack_mirror',
    'celestial_artifacts:heirloom_necklace', 'celestial_artifacts:nostalgic_butterfly_ring',
    'celestial_artifacts:traveler_scroll',
    'ars_nouveau:novice_spell_book',         'ars_nouveau:source_gem',
    'irons_spellbooks:common_ink',
    'relics:magic_mirror',                   'relics:reflection_necklace'
  ]
  // T2 Eldritch (Twilight Lich Tower) — TBD exact table IDs.
  var T2_ELDRITCH = [
    'celestial_artifacts:cursed_talisman',   'celestial_artifacts:cursed_protector',
    'celestial_artifacts:hidden_bracelet',   'celestial_artifacts:shadow_pendant',
    'moreartifacts:spectre_amulet',          'moreartifacts:venom_amulet',
    'moreartifacts:decay_amulet',            'moreartifacts:tainted_mirror',
    'relics:midnight_robe',
    'artifacts:obsidian_skull',              'artifacts:antidote_vessel',
    'artifacts:vampiric_glove',
    'ars_nouveau:apprentice_spell_book',     'irons_spellbooks:uncommon_ink'
  ]
  // T2 Sky/cloud (Aether dungeons).
  var T2_SKY = [
    'artifacts:cloud_in_a_bottle',           'artifacts:helium_flamingo',
    'artifacts:lucky_scarf',
    'moreartifacts:high_jumpers',            'moreartifacts:balloon',
    'celestial_artifacts:nostalgic_butterfly_ring',
    'celestial_artifacts:skywalker_scroll',
    'celestial_artifacts:gallop_necklace',   'celestial_artifacts:magic_horseshoe',
    'celestial_artifacts:deers_mercy_amulet',
    'celestial_artifacts:deer_inscribed_amulet',
    'ars_nouveau:apprentice_spell_book'
  ]
  // T2 Elemental (Blue Skies dungeons).
  var T2_ELEMENTAL = [
    'celestial_artifacts:freeze_ring',       'celestial_artifacts:thunder_ring',
    'celestial_artifacts:emerald_ring',
    'moreartifacts:ice_crystal',             'moreartifacts:sunglasses',
    'moreartifacts:cobalt_shield',
    'artifacts:flame_pendant',               'artifacts:shock_pendant',
    'artifacts:thorn_pendant',               'artifacts:obsidian_skull',
    'celestial_artifacts:sands_talisman',
    'ars_nouveau:apprentice_spell_book'
  ]
  // T3 Fire/blaze (nether_bridge).
  var T3_FIRE = [
    'relics:blazing_flask',                  'relics:magma_walker',
    'moreartifacts:fire_stone',              'moreartifacts:blazing_treads',
    'moreartifacts:molten_quiver',           'moreartifacts:obsidian_shield',
    'artifacts:obsidian_skull',              'artifacts:fire_gauntlet',
    'celestial_artifacts:nether_fire',
    'moreartifacts:gilded_scarf',
    'ars_nouveau:archmage_spell_book',       'irons_spellbooks:rare_ink'
  ]
  // T3 Piglin/gold (bastion tables).
  var T3_PIGLIN = [
    'moreartifacts:gilded_scarf',            'moreartifacts:golden_headgear',
    'moreartifacts:mechanical_glove',
    'celestial_artifacts:gold_ring',         'celestial_artifacts:precious_bracelet',
    'celestial_artifacts:treasure_hunter_necklace',
    'celestial_artifacts:emerald_bracelet',
    'artifacts:golden_hook',
    'moreartifacts:ruby_ring',               'moreartifacts:lucky_emerald_ring',
    'ars_nouveau:archmage_spell_book',       'irons_spellbooks:rare_ink'
  ]
  // T3 Underdark (Undergarden ruin tables) — TBD exact table IDs.
  var T3_UNDERDARK = [
    'moreartifacts:enderian_scarf',          'moreartifacts:shadow_dust',
    'moreartifacts:obsidian_shield',
    'relics:bastion_ring',                   'relics:spore_sack',
    'celestial_artifacts:cursed_protector',
    'celestial_artifacts:demon_curse',       'celestial_artifacts:abyss_will_badge',
    'celestial_artifacts:lock_of_abyss',
    'artifacts:antidote_vessel',             'artifacts:obsidian_skull',
    'ars_nouveau:archmage_spell_book',       'irons_spellbooks:rare_ink'
  ]
  // T4 End/levitation (end_city_treasure).
  // ender_jump_scepter flagged from celestial_artifacts.md audit — verify rate
  // in playtest, may pull to boss-drop if too generous.
  var T4_END = [
    'celestial_artifacts:ender_jump_scepter',
    'celestial_artifacts:angel_pearl',       'celestial_artifacts:angel_heart',
    'moreartifacts:enderian_eye',            'moreartifacts:ender_dragon_claw',
    'moreartifacts:dragon_eye',              'moreartifacts:enderian_treads',
    'moreartifacts:true_enderian_scarf',
    'relics:enders_hand',                    'relics:elytra_booster',
    'relics:space_dissector',                'relics:arrow_quiver',
    'relics:chorus_inhibitor'
  ]
  // T4 Sculk/echo (Ancient City tables).
  var T4_SCULK = [
    'moreartifacts:sculk_lens',              'moreartifacts:sculk_shades',
    'moreartifacts:sculk_treads',            'moreartifacts:shulker_heart',
    'moreartifacts:shulked_clock',           'moreartifacts:echo_glove',
    'celestial_artifacts:soul_box',          'celestial_artifacts:lock_of_abyss',
    'celestial_artifacts:cursed_totem',      'celestial_artifacts:twisted_heart',
    'relics:wool_mitten',                    'relics:shadow_glaive',
    'artifacts:scarf_of_invisibility'
  ]
  // (T4 Abyssal: the list that stood here was never delivered — see the note
  //  after the T4 marquees. Since 2026-10-11 its Celestial Artifacts drop from
  //  the three Abyss bosses: loot/abyss_boss_loot.js Section 6.)

  // Helper: apply marquee themed pool to a table or array of tables.
  // opts.theme       — array of item IDs (themed pool)
  // opts.tier        — 1-4 (drives rate)
  // opts.scroll      — true to add tier-scaled ISS scroll (mage progression)
  // opts.spellbook   — ISS spellbook ID to add at 2% cap, or null
  // opts.book        — true to add an enchanted book (10%, tier-scaled levels)
  // opts.strip       — array of item IDs to remove first
  // opts.dimension   — only where the chest is in this dimension
  // opts.structure   — only where the chest stands inside this worldgen structure
  //
  // WHY dimension / structure (2026-10-11): a loot TABLE is not a place. Other
  // mods reuse vanilla tables in their own structures, and a rule keyed on the
  // table id follows the table: minecraft:chests/end_city_treasure is also rolled
  // by four Cataclysm Frosted Prison pieces (Overworld), and
  // minecraft:chests/ancient_city by one Explorify tavern room (Overworld
  // surface). Both got the T4 marquee. The condition is added BEFORE the
  // actions (a LootJS condition only gates what comes after it) and is passed
  // on to the queued enchanted book.
  function applyMarquee(tableRefs, opts) {
    var tables = (tableRefs instanceof Array) ? tableRefs : [tableRefs]
    var theme = relicAllowed(opts.theme)       // RELIC_DENY ids never enter a pool
    var perItem = theme.length ? TIER_THEMED_RATE[opts.tier] / theme.length : 0
    var scrollHelper = (opts.tier <= 2) ? t1Scroll : t2Scroll
    var bookLevels = TIER_BOOK_LEVELS[opts.tier]
    var hasStrip = !!(opts.strip && opts.strip.length)
    tables.forEach(function(table) {
      // [2026-10-10] The enchanted book is QUEUED, not added here: it has to be
      // registered after loot_overhaul.js's enchanted_book strips (Section 1).
      // loot/zz_pack_enchanted_books.js registers one modifier per queued table.
      if (opts.book) {
        global.ICRAFT_MARQUEE_BOOKS.push({
          table: table, minLevel: bookLevels[0], maxLevel: bookLevels[1], chance: 0.10,
          dimension: opts.dimension || null, structure: opts.structure || null
        })
      }
      // A LootJS modifier with zero actions throws and takes every later
      // modifier down with it — only open one if something goes into it.
      if (!hasStrip && !theme.length && !opts.scroll && !opts.spellbook) return
      var mod = event.addLootTableModifier(table)
      // In a try: a throw here would end the whole LootJS event (every later loot
      // script would register nothing). If a condition cannot be built the
      // marquee stays unconfined, which is what it was before.
      try {
        if (opts.dimension) mod.anyDimension(opts.dimension)
        if (opts.structure) mod.anyStructure([opts.structure], false)   // false = anywhere inside the structure's bounding box
      } catch (e) {
        console.error('[icraft-loot] marquee condition not applied for ' + table + ': ' + e)
      }
      if (hasStrip) {
        opts.strip.forEach(function(item) { mod.removeLoot(item) })
      }
      theme.forEach(function(item) {
        mod.addLoot(LootEntry.of(item).when(c => c.randomChance(perItem)))
      })
      if (opts.scroll) {
        mod.addLoot(scrollHelper(TIER_SCROLL_RATE[opts.tier]))
      }
      if (opts.spellbook) {
        mod.addLoot(LootEntry.of(opts.spellbook).when(c => c.randomChance(ISS_SPELLBOOK_CAP)))
      }
    })
  }

  var BOTANIA_T1_STRIP = ['minecraft:diamond', 'botania:manasteel_ingot',
    'botania:mana_pearl', 'botania:mana_diamond',
    'minecraft:arrow', 'minecraft:spectral_arrow']

  // === T1 marquees ===
  icraft.section('loot/lootjs_overhaul/t1-marquees', function () {
  applyMarquee('apotheosis:chests/tome_tower',
    { theme: T1_MAGIC, tier: 1, scroll: true, spellbook: 'irons_spellbooks:copper_spell_book', book: true })
  // (totw_reworked is not a mod: Towers of the Wild: Reworked ships as the Paxi
  //  datapacks Towers_Of_The_Wild_Reworked*.zip, which provide both tables.)
  applyMarquee(['totw_reworked:tower_chest', 'totw_reworked:ocean_tower_chest'],
    { theme: T1_MAGIC, tier: 1, scroll: true, spellbook: 'irons_spellbooks:copper_spell_book',
      book: true, strip: BOTANIA_T1_STRIP })
  // [2026-10-11] The old pattern (/structory_towers:.*chests.*/) matched NO
  // table, so this marquee had never applied. Retargeted (operator ruling: the
  // towers generate) to the tower-TOP chest, structory_towers:top/<tower>_top —
  // one or two chests per tower, the reward at the end of the climb; the 4–16
  // structory_towers:basic/… chests on the way up are not marquee chests.
  // Overworld only: the Nether towers' tops (warped, strange, fortress) keep
  // the Nether rules.
  applyMarquee(/^structory_towers:top\/.*/,
    { theme: T1_GENERIC_EXPLORATION, tier: 1, book: true, dimension: 'minecraft:overworld' })
  applyMarquee(['minecraft:chests/buried_treasure',
                'minecraft:chests/underwater_ruin_big',
                'minecraft:chests/underwater_ruin_small'],
    { theme: T1_AQUATIC, tier: 1, spellbook: 'irons_spellbooks:copper_spell_book' })
  applyMarquee('minecraft:chests/woodland_mansion',
    { theme: T1_ILLAGER_DARK, tier: 1, spellbook: 'irons_spellbooks:copper_spell_book', book: true })
  applyMarquee(['minecraft:chests/stronghold_corridor',
                'minecraft:chests/stronghold_crossing',
                'minecraft:chests/stronghold_library'],
    { theme: T1_ANCIENT, tier: 1, scroll: true, spellbook: 'irons_spellbooks:copper_spell_book',
      book: true, strip: BOTANIA_T1_STRIP })
  })

  // === T2 marquees ===
  // Twilight Lich Tower.
  // [2026-10-11] The old pattern (/twilightforest:structures\/lichtower\/.*/)
  // matched NO table — Twilight Forest has no structures/ tables. The Lich
  // Tower's chests are assigned from code: TFLootTables.TOWER_ROOM and
  // TOWER_LIBRARY are referenced only by the Lich Tower pieces
  // (lichtower.TowerWingComponent, lichtowerrevamp.SideTowerRoom); the Dark
  // Tower has its own darktower_* tables.
  icraft.section('loot/lootjs_overhaul/t2-marquees', function () {
  applyMarquee(['twilightforest:chests/tower_room',
                'twilightforest:chests/tower_library'],
    { theme: T2_ELDRITCH, tier: 2, book: true })
  // Aether dungeons (TBD exact table IDs — common pattern aether:chests/*).
  applyMarquee(/aether:chests\/.*dungeon.*/,
    { theme: T2_SKY, tier: 2, book: true })
  // Blue Skies dungeons (TBD exact table IDs — broad pattern).
  applyMarquee(/blue_skies:chests\/.*dungeon.*/,
    { theme: T2_ELEMENTAL, tier: 2, book: true })
  })

  // === T3 marquees ===
  icraft.section('loot/lootjs_overhaul/t3-marquees', function () {
  applyMarquee('minecraft:chests/nether_bridge',
    { theme: T3_FIRE, tier: 3, book: true })
  applyMarquee(['minecraft:chests/bastion_treasure',
                'minecraft:chests/bastion_hoglin_stable',
                'minecraft:chests/bastion_bridge',
                'minecraft:chests/bastion_other'],
    { theme: T3_PIGLIN, tier: 3, book: true })
  // Undergarden catacombs.
  // [2026-10-11] The old pattern (/undergarden:chests\/.*ruin.*/) matched NO
  // table: the Undergarden's only chest table is undergarden:chests/catacombs
  // (4 chests in the catacombs structure).
  applyMarquee('undergarden:chests/catacombs',
    { theme: T3_UNDERDARK, tier: 3, book: true })
  })

  // === T4 marquees ===
  // End only: Cataclysm's Frosted Prison (Overworld, a T3 arena) also rolls
  // end_city_treasure in four of its pieces. Its Ruined Citadel and the other
  // End structures that reuse the table are in the End and keep the marquee.
  icraft.section('loot/lootjs_overhaul/t4-marquees', function () {
  applyMarquee('minecraft:chests/end_city_treasure',
    { theme: T4_END, tier: 4, book: true, dimension: 'minecraft:the_end' })
  // Inside a real Ancient City only (operator decision 2026-10-11): Explorify's
  // tavern room 14 rolls minecraft:chests/ancient_city on the Overworld surface.
  applyMarquee(['minecraft:chests/ancient_city',
                'minecraft:chests/ancient_city_ice_box'],
    { theme: T4_SCULK, tier: 4, book: true, structure: 'minecraft:ancient_city' })
  })
  // (The Abyss marquee was removed 2026-10-11, operator ruling: no Abyss chest
  //  rolls a loot table with the installed The Abyss, so the rule could never
  //  apply — see the note in Section 4B. Its T4_ABYSSAL list is gone too:
  //  operator ruling 2026-10-11, the pool's twelve Celestial Artifacts drop
  //  from Elder / The Roka / Nightblade instead (loot/abyss_boss_loot.js
  //  Section 6). Shadow Glaive and Space Dissector keep their other rules.)

  // =========================================================================
  // SECTION 8A: VILLAGE CHEST AFFIX GEAR — WHITE/GREEN ONLY
  // =========================================================================
  // Village chests should have low-tier affix gear (white/green rarity).
  // Blue is very rare (2%), no purple/orange. These are starting areas.
  // =========================================================================

  // Village chests: low chance for basic (white/green) gear
  icraft.section('loot/lootjs_overhaul/section-8a-village-chest-affix-gear-white', function () {
  var villageChestPatterns = [
    /minecraft:chests\/village\/.*/,
    /^villagesandpillages:.+/,
    /ctov:.*chests.*/
  ]
  })

  // 2026-04-21: DELETED a dead modifier block that had been registering
  // event.addLootTableModifier(pattern) with NO action chained (the
  // Apotheosis-affix filter was commented out but the modifier
  // registration remained). LootJS throws 'No actions were added to the
  // modifier' on such calls and aborts the ENTIRE remaining modifier
  // callback — killing every village QoL pool, artifact pool, magic
  // access block, and so on. Hence zero beds / artifacts in tester's
  // 30x /loot give. The block is now fully removed.

  // =========================================================================
  // SECTION 8B: BOOSTED MAGIC MATERIALS IN STRUCTURE CHESTS
  // =========================================================================
  // Magic mod materials and spell books get higher weight in all
  // structure chests (not just overworld chests).
  // =========================================================================

  // Iron's Spells inks are now tiered in Section 5A3 — no global injection needed

  // Ars Nouveau source gems in structure chests
  icraft.section('loot/lootjs_overhaul/section-8b-boosted-magic-materials-in', function () {
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .addLoot(
      LootEntry.of('ars_nouveau:source_gem').limitCount([1, 3]).when(c => c.randomChance(0.05))
    )
  })

  // =========================================================================
  // SECTION 8C: REDUCED ARTIFACT/CURIO WEIGHT IN GENERIC OW CHESTS
  // =========================================================================
  // General overworld chests (caves, mineshafts) should have very low
  // artifact chance (~5%). Structure-specific chests keep their rates.
  // Towers get boosted rates (Section 8 above).
  // =========================================================================

  // Already handled — artifacts only appear in structure-specific sections
  // (towers at ~12% per item, ocean at existing rates). Generic overworld
  // chests don't get artifact injections by default.

  // =========================================================================
  // SECTION 8.5: EPIC RPG CLASS ARTIFACTS — DROPS-ONLY INJECTION
  // =========================================================================
  // The mod's native loot injection GLMs (overworld/nether/end/treasure) are
  // blocked by our "replace": true in global_loot_modifiers.json — we don't
  // whitelist rpgseteffects:loot_injection/*, so they never fire.
  //
  // Re-add drops via LootJS with controlled rates + tier gating:
  //   - Fragment Core: 4% from any hostile mob death (basic resource)
  //     ** moved to server_scripts/loot/fragment_core_drops.js (monster-gated
  //        EntityEvents.death; the LootType.ENTITY add here leaked onto passive
  //        mobs because LootType filters by param-set, not MobCategory) **
  //   - Standalone Relics: spread across dimension chests by tier
  //   - Artifact Piece Pouch: T2+ boss drops only
  //   - Awakening artifacts: T4 boss drops only (AStages-gated for pickup too)
  // =========================================================================

  // Fragment Core: minor drop from any HOSTILE mob death (replaces crafting
  // path). RELOCATED out of LootJS: addLootTypeModifier(LootType.ENTITY)
  // filters tables by their LootContextParamSet (the shared ENTITY param set),
  // NOT by MobCategory/Monster, so it injected fragment_core into EVERY
  // entities/* table including pigs/cows/sheep (4% passive-mob leak). The
  // monster-gated reimplementation lives in fragment_core_drops.js.

  // T1 Overworld chest relics (utility-focused — movement, minor passives)
  icraft.section('loot/lootjs_overhaul/moved-to-server-scripts-loot-fragment-core', function () {
  var t1Relics = [
    'rpgseteffects:featherfall_relic',
    'rpgseteffects:swift_boots_relic',
    'rpgseteffects:swift_strike_relic',
    'rpgseteffects:multi_jump_relic',
    'rpgseteffects:specter_lens',
    'rpgseteffects:deadly_luck_relic'
  ]
  t1Relics.forEach(relic => {
    event
      .addLootTypeModifier(LootType.CHEST)
      .anyDimension('minecraft:overworld', 'twilightforest:twilight_forest')
      .addLoot(LootEntry.of(relic).when(c => c.randomChance(0.004)))
  })

  // T2 chest relics (combat + resistance — Blue Skies / Aether)
  var t2Relics = [
    'rpgseteffects:brutal_fist_relic',
    'rpgseteffects:lethal_crit_relic',
    'rpgseteffects:vampiric_relic',
    'rpgseteffects:venom_relic',
    'rpgseteffects:ember_relic',
    'rpgseteffects:frost_relic',
    'rpgseteffects:poison_immunity_relic',
    'rpgseteffects:brambleguard_relic'
  ]
  t2Relics.forEach(relic => {
    event
      .addLootTypeModifier(LootType.CHEST)
      .anyDimension('blue_skies:everbright', 'blue_skies:everdawn',
        'aether:the_aether')
      .addLoot(LootEntry.of(relic).when(c => c.randomChance(0.006)))
  })

  // T3 Nether/Undergarden/Deeper Darker/Abyss relics (fire, decay, advanced utility)
  var t3Relics = [
    'rpgseteffects:builders_flight_charm', // [2026-06-08] moved from T1 (operator: creative-flight basebuilding utility reads as a T3 effect, not starter loot)
    'rpgseteffects:fire_immunity_relic',
    'rpgseteffects:magma_walker_relic',
    'rpgseteffects:frost_walker_relic',
    'rpgseteffects:decay_relic',
    'rpgseteffects:soulthief_relic',
    'rpgseteffects:blightwake_relic',
    'rpgseteffects:radiant_burden_relic'
  ]
  t3Relics.forEach(relic => {
    event
      .addLootTypeModifier(LootType.CHEST)
      .anyDimension('minecraft:the_nether', 'undergarden:undergarden', 'deeperdarker:otherside', 'theabyss:the_abyss')
      .addLoot(LootEntry.of(relic).when(c => c.randomChance(0.008)))
  })

  // T4 End relics (endgame — strongest passives)
  var t4Relics = [
    'rpgseteffects:wither_immunity_relic',
    'rpgseteffects:beastheart_relic',
    'rpgseteffects:malicebrand_relic',
    'rpgseteffects:mirrorspite_relic'
  ]
  t4Relics.forEach(relic => {
    event
      .addLootTypeModifier(LootType.CHEST)
      .anyDimension('minecraft:the_end')
      .addLoot(LootEntry.of(relic).when(c => c.randomChance(0.010)))
  })

  // Artifact Piece Pouch: guaranteed drop from T2+ bosses.
  // The pouch's internal loot table picks ONE of the 14 class artifacts on
  // open, keeping Awakening variants out of non-T4 drops.
  // Artifact Piece Pouch: guaranteed drop from T2+ bosses. The pouch's
  // loot table is overridden at kubejs/data/rpgseteffects/loot_tables/items/
  // artifact_piece_pouch.json to contain ONLY the 14 normal artifacts —
  // awakening variants are never in pouches, they drop directly from T4
  // bosses only. This keeps awakenings out of T2 loot entirely.
  var t2BossPouchDrops = [
    'twilightforest:entities/naga',
    'twilightforest:entities/lich',
    'twilightforest:entities/hydra',
    'cataclysm:entities/ignis',
    'aether:entities/slider',
    'blue_skies:entities/summoner'
    // ('alexscaves:entities/atlatitan' removed 2026-10-10 — Alex's Caves is not installed)
  ]
  t2BossPouchDrops.forEach(table => {
    event
      .addLootTableModifier(table)
      .addLoot(LootEntry.of('rpgseteffects:artifact_piece_pouch'))
  })

  // T4 bosses drop 2 pouches (better normal artifact coverage at endgame)
  // PLUS direct awakening rolls — 0.7% per awakening per boss, 14 awakenings
  // = ~9.3% combined any-awakening chance per T4 boss kill. Half of what a
  // pouch-embedded-awakening model would have given, per user tuning.
  var t4BossTables = [
    'minecraft:entities/ender_dragon',
    'cataclysm:entities/ender_guardian',
    'cataclysm:entities/the_harbinger',   // [2026-10-10] was cataclysm:entities/harbinger — no such table; the entity is cataclysm:the_harbinger
    'deeperdarker:entities/shattered'
    // ('alexscaves:entities/watcher' removed 2026-10-10 — Alex's Caves is not installed)
  ]
  var awakeningPool = [
    'rpgseteffects:altharion_awakening_artifact',
    'rpgseteffects:blade_dancer_awakening_artifact',
    'rpgseteffects:blood_fury_awakening_artifact',
    'rpgseteffects:chronorend_awakening_artifact',
    'rpgseteffects:hellbrand_awakening_artifact',
    'rpgseteffects:hexweaver_awakening_artifact',
    'rpgseteffects:ignisphere_awakening_artifact',
    'rpgseteffects:moonpiercer_awakening_artifact',
    'rpgseteffects:phoenix_awakening_artifact',
    'rpgseteffects:sanctum_awakening_artifact',
    'rpgseteffects:shadow_hunter_awakening_artifact',
    'rpgseteffects:stormpiercer_awakening_artifact',
    'rpgseteffects:vaelkhor_awakening_artifact',
    'rpgseteffects:wolfheart_awakening_artifact'
  ]
  t4BossTables.forEach(table => {
    var modifier = event.addLootTableModifier(table)
    modifier.addLoot(LootEntry.of('rpgseteffects:artifact_piece_pouch').limitCount([2, 2]))
    awakeningPool.forEach(awakening => {
      modifier.addLoot(LootEntry.of(awakening).when(c => c.randomChance(0.007)))
    })
  })
  })

  // =========================================================================
  // SECTION 8D: KEEBSZ BATTLE TOWER — 3-TIER FLOOR SYSTEM (REBUILT)
  // =========================================================================
  // Battle towers are combat gauntlets with escalating rewards.
  // The real tables are keebsz:<biome>/floor1and2, 3and4, 5and6, 7and8, 9and10:
  // Floor 1-2:  T1 starter loot (XP, common magic, source gems)
  // Floor 3-6:  T2 mid-tier (better XP, uncommon materials, potions)
  // Floor 7-10: T3 endgame (rare materials, diamonds allowed, rare inks)
  // =========================================================================

  // --- Floor 1-3 (keebsz:*/floor[12]and[23]) ---
  icraft.section('loot/lootjs_overhaul/floor-1-3', function () {
  var keebszLow = event.addLootTableModifier(/keebsz:(?:.*\/)?floor[12]and[23]/)
  keebszLow.removeLoot('minecraft:diamond')
  keebszLow.addLoot(
    LootEntry.of('minecraft:experience_bottle').limitCount([1, 3])
      .when(c => c.randomChance(0.15))
  )
  keebszLow.addLoot(LootEntry.of('irons_spellbooks:common_ink').when(c => c.randomChance(0.15)))
  keebszLow.addLoot(LootEntry.of('ars_nouveau:novice_spell_book').when(c => c.randomChance(0.025)))
  keebszLow.addLoot(LootEntry.of('ars_nouveau:source_gem').limitCount([1, 2]).when(c => c.randomChance(0.05)))
  keebszLow.addLoot(t1Scroll(0.06))
  // 8% random T1 artifact (pick one from pool)
  var keebszLowArtifactChance = 0.08 / artifactT1Pool.length
  artifactT1Pool.forEach(function(item) {
    keebszLow.addLoot(LootEntry.of(item).when(c => c.randomChance(keebszLowArtifactChance)))
  })
  })

  // --- Floor 4-6 (keebsz:*/floor[35]and[46]) ---
  icraft.section('loot/lootjs_overhaul/floor-4-6', function () {
  var keebszMid = event.addLootTableModifier(/keebsz:(?:.*\/)?floor[35]and[46]/)
  keebszMid.removeLoot('minecraft:diamond')
  keebszMid.addLoot(
    LootEntry.of('minecraft:experience_bottle').limitCount([2, 5])
      .when(c => c.randomChance(0.15))
  )
  // 12% uncommon materials (iron blocks, gold blocks)
  keebszMid.addLoot(LootEntry.of('minecraft:iron_block').when(c => c.randomChance(0.06)))
  keebszMid.addLoot(LootEntry.of('minecraft:gold_block').when(c => c.randomChance(0.06)))
  // 10% apprentice spell book
  keebszMid.addLoot(LootEntry.of('ars_nouveau:apprentice_spell_book').when(c => c.randomChance(0.10)))
  // 5% scroll (T2 quality)
  keebszMid.addLoot(t2Scroll(0.05))
  // 10% potions (healing, strength)
  keebszMid.addLoot(
    LootEntry.of(Item.of('minecraft:potion', '{Potion:"minecraft:strong_healing"}'))
      .when(c => c.randomChance(0.05))
  )
  keebszMid.addLoot(
    LootEntry.of(Item.of('minecraft:potion', '{Potion:"minecraft:strong_strength"}'))
      .when(c => c.randomChance(0.05))
  )
  // 10% enchanted book (levels 10-20)
  keebszMid.addLoot(
    LootEntry.of('minecraft:book')
      .enchantWithLevels(UniformGenerator.between(10, 20), true)
      .when(c => c.randomChance(0.10))
  )
  })

  // --- Floor 7-10 (keebsz:*/floor7and8 + floor9and10) ---
  // [2026-10-10] regex was /keebsz:.*\/floor[79]and[810]/ — "[810]" is ONE
  // character, and table regexes are full-match, so "floor9and10" never matched
  // and the top two floors got none of this loot.
  icraft.section('loot/lootjs_overhaul/floor-7-10', function () {
  var keebszHigh = event.addLootTableModifier(/keebsz:(?:.*\/)?floor(?:7and8|9and10)/)
  keebszHigh.addLoot(
    LootEntry.of('minecraft:experience_bottle').limitCount([3, 8])
      .when(c => c.randomChance(0.20))
  )
  // 15% rare materials (diamonds allowed at high floors)
  keebszHigh.addLoot(LootEntry.of('minecraft:diamond').limitCount([1, 3]).when(c => c.randomChance(0.15)))
  // 18% rare inks (bumped from 12% as part of magic-loot pass)
  keebszHigh.addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.18)))
  // 10% enchanted book (levels 20-30)
  keebszHigh.addLoot(
    LootEntry.of('minecraft:book')
      .enchantWithLevels(UniformGenerator.between(20, 30), true)
      .when(c => c.randomChance(0.10))
  )
  // 8% T2/T3 artifact from pool
  var keebszHighArtifactPool = artifactT2Pool.concat(artifactT3Pool)
  var keebszHighArtifactChance = 0.08 / keebszHighArtifactPool.length
  keebszHighArtifactPool.forEach(function(item) {
    keebszHigh.addLoot(LootEntry.of(item).when(c => c.randomChance(keebszHighArtifactChance)))
  })
  })
  // Removed 2026-05-17 towerCurioPool.forEach add — Keebsz isn't in the
  // marquee roster, and the T2/T3 artifact concat above already provides
  // tier-appropriate curio variety. The towerCurioPool was a 9-item
  // duplicate firing alongside the wider dimensional pools.

  // =========================================================================
  // SECTION 9: ENABLE LOGGING (remove in production)
  // =========================================================================

  // -------------------------------------------------------------------------
  // SIMPLY SWORDS UNIQUE STRIP — chest tables only
  // -------------------------------------------------------------------------
  // Wiki §IX: "Simply Swords is the unique trophy-weapon system. 42 named
  // uniques, all boss-drop only. Unique-weapon recipes are stripped."
  // SS ships a global loot modifier that injects uniques into vanilla/modded
  // chest pools. We strip the @simplyswords namespace from any loot table
  // whose path contains "chests/" so uniques only come from the per-boss
  // entries in loot_overhaul.js (Naga -> Tempest, Lich -> Soulrender, etc.).
  // Entity loot tables (entities/<mob>) are unaffected — boss allocations
  // keep working.
  // [2026-10-10] regex was /chests\// — table regexes are full-match, so it
  // matched nothing and this strip never ran. /.*chests\/.*/ is "any table
  // whose id contains chests/".
  // [2026-10-11] plus the alias tables whose id has no chests/ in it
  // (dev/loot_audit/alias_tables.json): they forward to chests/ tables, and
  // this rule sees only the alias id.
  icraft.section('loot/lootjs_overhaul/simply-swords-unique-strip-chest-tables-only', function () {
  event
    .addLootTableModifier(/.*chests\/.*/,
      'minecraft:house_1', /^ctov:(?:village|pillager_outpost)\/.*/)
    .removeLoot('@simplyswords')

  // event.enableLogging()

  // (Banner rewritten 2026-10-10: the old one advertised features that were
  //  removed long ago — token injection, a global enchanted-book removal, an
  //  @artifacts/@relics strip, per-tower "rebuilt" pools, village spell books.)
  console.log('[IridescentCraft] LootJS structure chest overhaul loaded')
  console.log('  - Global chest strip: @ars_nouveau, irons_spellbooks (scrolls exempt), @moreartifacts, saplings, the denied relics')
  console.log('  - Tiered artifact pools: T1(10%) OW, T2(12%) TF/Aether/BS, T3(14%) Nether/UG/DD/Abyss, T4(16%) End (RELIC_DENY filtered)')
  console.log('  - Tiered by dimension: Ars glyphs + spell books, Iron\'s Spellbooks books + inks, class-artifact relics')
  console.log('  - Enchanted books: registered by zz_pack_enchanted_books.js (after the loot_overhaul.js strips)')
  console.log('  - Diamonds + diamond gear stripped from every chest in the Overworld and the T2 dimensions')
  console.log('  - Overworld clutter: horse armor / spider eyes / rotten flesh / wood / stone removed; gunpowder, string, bone kept 50%, name tags 40%')
  console.log('  - Overworld food: listed non-meat foods kept 20% per stack, modded foods removed; village food + seed boost on top')
  console.log('  - Village chests: sanitised, curated artifact pool (1% per item), QoL roll (ink 30.9% / source gem 15.5%), compass 5%, backpack 4%')
  console.log('  - Ocean chests: prismarine, nautilus shell, fishing gear, heart of the sea')
  console.log('  - Marquee structures: themed pool per tier (7 / 8.4 / 9.8 / 11.2%) + scrolls + capped spell books')
  console.log('  - Epic Dungeons: tier-breaker strip, T1 magic kit, family theme loot')
  console.log('  - Keebsz floors: F1-2 starter, F3-6 mid, F7-10 endgame')
  })
}))
