// =============================================================================
// IridescentCraft — Cross-Mod Recipe Audit
// File: kubejs/server_scripts/recipes/recipe_audit.js
//
// Supplements tier_gated_recipes.js by catching cross-mod recipe leaks that
// allow T1 players to access T3+ materials. Follows Section 28 principle:
//   Break = skip entire tier -> FIX    |    Bend = small early access -> LEAVE
//
// Does NOT duplicate: tier_gated_recipes.js Section C (Create mixing/crushing
//   diamond/netherite, Thermal smelter osmium, Mekanism combining diamond).
//
// CONFIG-BASED FIXES (cannot be done via KubeJS, noted for manual audit):
//   - Botania Orechid ore weights: handled via datapack (icraft_botania_overrides)
//     See tier_gated_recipes.js line 163
//   - IF Laser Drill ore tables: config/industrialforegoing/laser_drill/*.json
//   - Thermal Insolator has no dimensional restriction config; gated by
//     machine_frame recipe (requires steel = T2) in tier_gated_recipes.js B.1
//   - botania-common.toml: No Orechid config knobs (weight-based, datapack only)
//   - create-common.toml: Only has worldgen toggle, no recipe controls
//
// A removal by output takes a LIST: each remove() call walks every recipe of
// the pack once, whatever the list's length (one call per id until 2026-10-30,
// RAM audit F7).
// =============================================================================

ServerEvents.recipes(icraft.guard('recipes/recipe_audit', 'ServerEvents.recipes', event => {

  // ═══ SECTION A: CREATE RECIPE LEAKS ═══
  // tier_gated_recipes.js already handles: mixing diamond/diamond_block,
  // crushing diamond/netherite_scrap/ancient_debris, splashing diamond.
  // This section catches additional Create exploits.

  // A.1: Create crushing ores that bypass worldgen removal
  // If gated ores somehow enter inventory, don't let crushing multiply them
  icraft.section('recipes/recipe_audit/section-a-create-recipe-leaks', function () {
  event.remove({ type: 'create:crushing', output: [
    'minecraft:diamond_ore',
    'minecraft:deepslate_diamond_ore',
    'minecraft:emerald',
    'minecraft:emerald_ore',
    'minecraft:deepslate_emerald_ore',
  ] })

  // A.2: Create mixing — prevent cheap production of gated materials
  event.remove({ type: 'create:mixing', output: [
    'minecraft:netherite_ingot',
    'minecraft:netherite_scrap',
    'minecraft:emerald',
    'minecraft:emerald_block',
    'mekanism:ingot_osmium',
    'minecraft:ender_pearl',
  ] })

  // A.3: Create mechanical crafting — same items, different recipe type
  event.remove({ type: 'create:mechanical_crafting', output: ['minecraft:diamond', 'minecraft:netherite_ingot'] })
  // (elytra: tier_gated_recipes.js Section G removes EVERY recipe that outputs
  //  minecraft:elytra, whatever its type — see F.3)

  // A.4: Create sequenced assembly leaks
  event.remove({ type: 'create:sequenced_assembly', output: ['minecraft:diamond', 'minecraft:netherite_ingot'] })
  })


  // ═══ SECTION B: THERMAL EXPANSION LEAKS ═══
  // tier_gated_recipes.js handles: smelter osmium.
  // Machine frame already gated to T2 (steel) in tier_gated_recipes.js B.1.

  // B.1: Thermal smelter — prevent gated material production
  icraft.section('recipes/recipe_audit/section-b-thermal-expansion-leaks', function () {
  event.remove({ type: 'thermal:smelter', output: [
    'minecraft:diamond',
    'minecraft:netherite_ingot',
    'minecraft:netherite_scrap',
    'minecraft:emerald',
  ] })

  // B.2: Thermal centrifuge — could separate compounds into gated materials
  event.remove({ type: 'thermal:centrifuge', output: ['minecraft:diamond', 'minecraft:emerald'] })

  // B.3: Thermal press — prevent stamping gated materials
  event.remove({ type: 'thermal:press', output: ['minecraft:diamond', 'minecraft:netherite_ingot'] })

  // B.4: Thermal Insolator — dimensional crop restriction
  // The Insolator itself is gated by the machine frame (T2 steel).
  // However, if a player obtains dimensional seeds (Nether Wart, Chorus),
  // the Insolator could let them mass-produce T3/T4 crops in the overworld.
  // Remove Insolator recipes for dimensionally-gated crops:
  event.remove({ type: 'thermal:insolator', output: ['minecraft:chorus_fruit', 'minecraft:chorus_flower'] })
  })


  // ═══ SECTION C: MEKANISM LEAKS ═══
  // tier_gated_recipes.js handles: combining diamond/diamond_ore/deepslate_diamond_ore.
  // Mekanism machines naturally gated by osmium (T3).

  // C.1: Mekanism enriching — prevent enriching gated ores into ingots
  // (Mek machines need osmium = T3, but if someone transmutes 1 osmium early...)
  icraft.section('recipes/recipe_audit/section-c-mekanism-leaks', function () {
  event.remove({ type: 'mekanism:enriching', output: ['minecraft:diamond', 'minecraft:emerald'] })

  // C.2: Mekanism combining — additional ore fabrication blocks
  event.remove({ type: 'mekanism:combining', output: ['minecraft:emerald_ore', 'minecraft:deepslate_emerald_ore'] })
  })

  // C.3: Mekanism injecting/purifying — nothing to remove. The two lines that
  // were here targeted `mekanism:clump_diamond` / `mekanism:shard_diamond`;
  // Mekanism has no diamond clump or shard (diamond is not part of its ore-
  // processing chain: only dust_diamond and enriched_diamond exist), so they
  // matched no recipe. Removed 2026-10-10.


  // ═══ SECTION D: INDUSTRIAL FOREGOING LEAKS ═══
  // IF machines gated by machine_frame_pity (T2 steel) in tier_gated_recipes.js B.2.

  // D.1: IF Dissolution Chamber — could dissolve items into exploitable fluids
  icraft.section('recipes/recipe_audit/section-d-industrial-foregoing-leaks', function () {
  event.remove({ type: 'industrialforegoing:dissolution_chamber', output: [
    'minecraft:diamond',
    'minecraft:netherite_ingot',
    'minecraft:emerald',
  ] })
  })

  // D.2: IF Laser Drill — ore tables are config-based (see header notes)
  // KubeJS cannot modify laser drill ore weights; requires manual config edit:
  //   config/industrialforegoing/laser_drill/ — remove diamond_ore, emerald_ore entries
  //   or set their weight to 0 for overworld operations


  // ═══ SECTION E: ARS NOUVEAU / OCCULTISM / BOTANIA LEAKS ═══

  // E.1: Ars Nouveau Imbuement — prevent cheap material transmutation
  icraft.section('recipes/recipe_audit/section-e-ars-nouveau-occultism-botania', function () {
  event.remove({ type: 'ars_nouveau:imbuement', output: ['minecraft:diamond', 'minecraft:netherite_ingot'] })

  // E.2: Occultism Crushing — spirit miners could bypass worldgen removal
  event.remove({ type: 'occultism:crushing', output: ['minecraft:diamond', 'minecraft:emerald'] })

  // E.3: Occultism Spirit Trade — prevent summoned spirits from trading gated materials
  event.remove({ type: 'occultism:spirit_trade', output: ['minecraft:diamond', 'minecraft:emerald'] })

  // E.4: Occultism Ritual — dimensional miners that bypass ore removal.
  // Handled via the icraft_occultism_overrides datapack:
  //   datapack_sources/icraft_occultism_overrides/data/occultism/recipes/miner/ores/
  // Restricts diamond/emerald/arcane_crystal/osmium/nether_gold/xpetrified_ore
  // from the `ores` ingredient tag (Foliot+ accessible) to the `deeps` tag
  // (T3+ Afrit/Marid only); nether_quartz_ore is back on Occultism's own
  // `ores` entry since quartz became tier 1 (2026-10-22).
  // Dimensional_shard_ore is gated to
  // `master` (T4 Marid only). This closes the audit's P0 finding from
  // 2026-04-27 — without this datapack a Foliot Miner could produce diamond
  // (weight 218) without any tier gating. See audits/occultism.md in the
  // IridescentCraft-internal repo (contributors only).

  // E.5: Botania Orechid — already handled via datapack (see tier_gated_recipes.js)
  // The Orechid transforms stone into ores based on weighted tables.
  // Diamond ore and emerald ore weights should be 0 or removed in the datapack.
  // Cannot be modified via KubeJS recipe events.

  // E.6: Botania Mana Infusion — prevent cheap gated material production
  event.remove({ type: 'botania:mana_infusion', output: ['minecraft:diamond', 'minecraft:emerald'] })
  })


  // ═══ SECTION F: MISCELLANEOUS CROSS-MOD LEAKS ═══

  // F.1: Forbidden & Arcanus — dark magic transmutation
  icraft.section('recipes/recipe_audit/section-f-miscellaneous-cross-mod-leaks', function () {
  event.remove({ type: 'forbidden_arcanus:clibano_combustion', output: ['minecraft:diamond', 'minecraft:netherite_ingot'] })

  // F.2: Any mod smelting/blasting gated ores (belt-and-suspenders)
  // Vanilla smelting should already be gate-safe, but catch modded furnace variants
  event.remove({ type: 'minecraft:blasting', output: 'minecraft:netherite_scrap', id: /^(?!icraft:)/ })

  // F.3: Elytra from any source — handled in tier_gated_recipes.js Section G:
  //   event.remove({ output: 'minecraft:elytra' })
  // That filter has no type restriction, so it already covers every recipe type
  // (KubeJS removals only flag datapack recipes and do not depend on script
  // order). The three type-specific elytra removals that were in this file
  // (create:mechanical_crafting twice, create:sequenced_assembly once) were
  // strict subsets of it and were removed 2026-10-10.

  // F.4: Nether Star fabrication (supplementing tier_gated_recipes.js G)
  event.remove({ type: 'create:sequenced_assembly', output: 'minecraft:nether_star' })
  event.remove({ type: 'mekanism:combining', output: 'minecraft:nether_star' })
  event.remove({ type: 'thermal:smelter', output: 'minecraft:nether_star' })
  })
  // Note: tier_gated_recipes.js already removes create:mixing and thermal:smelter
  // for nether_star. These catch additional recipe types.


  // ═══ SECTION G: SUMMARY OF CONFIG-BASED FIXES NEEDED ═══
  // These cannot be handled by KubeJS and require manual config/datapack edits:
  //
  // 1. Botania Orechid weights:
  //    datapack: icraft_botania_overrides (already exists per tier_gated_recipes.js)
  //    Remove/zero-weight: diamond_ore, emerald_ore, ancient_debris
  //
  // 2. IF Laser Drill ore tables:
  //    config/industrialforegoing/laser_drill/
  //    Remove or zero-weight: diamond_ore, emerald_ore for overworld
  //
  // 3. Occultism Dimensional Miners:
  //    data/occultism/recipes/miners/ (datapack override)
  //    Ensure overworld miners don't produce T3+ ores
  //
  // 4. Thermal Insolator:
  //    Machine gated by steel frame (T2) — no additional config needed
  //    Dimensional crop recipes removed above (chorus)
  //
  // 5. Create worldgen:
  //    config/create-common.toml — only has disableWorldGen toggle
  //    Create doesn't add diamond/emerald worldgen, so no action needed
  //
  // 6. botania-common.toml:
  //    No Orechid configuration knobs — weights are datapack-only
  //    relics = true (keep, they're boss-gated naturally)



  // ═══ SECTION H: DARKORB — ORB OF ORIGIN RECIPE GATE ═══
  // DarkOrb adds a craftable recipe for origins:orb_of_origin.
  // The Orb resets ALL Origins layers (Race, Class, Species) — cannot be
  // configured to only reset one layer. Gate to T2+ to prevent trivial rerolls.
  // Replace recipe to require thermal:steel_ingot (T2 material).
  icraft.section('recipes/recipe_audit/section-h-darkorb-orb-of-origin-recipe-gate', function () {
  event.remove({ output: 'origins:orb_of_origin' })
  event.shaped('origins:orb_of_origin', ['SAS','AHA','SAS'], {
    S: 'thermal:steel_ingot',
    A: 'minecraft:amethyst_shard',
    H: 'minecraft:heart_of_the_sea'
  }).id('icraft:orb_of_origin_t2')
  })


  // ═══ SECTION I: TERRAMITY — REMOVE GUNS, ARMOR RECIPES (KEEP BOSSES) ═══
  // Design decision: Terramity guns and custom armor sets break the RPG
  // progression balance. Bosses, structures, mobs, and accessories stay.

  // I.1: Remove ALL gun recipes + gunsmith station + ammo crafting
  icraft.section('recipes/recipe_audit/section-i-terramity-remove-guns-armor', function () {
  event.remove({ output: [
    'terramity:basic_pistol', 'terramity:basic_rifle',
    'terramity:advanced_pistol', 'terramity:advanced_automatic_rifle',
    'terramity:advanced_burst_rifle', 'terramity:suppressed_advanced_pistol',
    'terramity:anti_material_rifle', 'terramity:antimatter_rifle',
    'terramity:conductite_laser_rifle', 'terramity:elite_rifle',
    'terramity:flintlock_pistol', 'terramity:plague_pistol',
    'terramity:big_iron', 'terramity:asphodel',
    'terramity:handcannon', 'terramity:meteor_cannon',
    'terramity:moondrill_cannon', 'terramity:railgun',
    'terramity:rocket_launcher', 'terramity:pump_action_shotgun',
    'terramity:sawed_off_shotgun', 'terramity:flare_gun',
    'terramity:gunkshot_projectile',
    // Gunsmith station and ammo
    'terramity:gunsmith_station',
    'terramity:advanced_gun_parts', 'terramity:ammo_bag',
    'terramity:ammo_box', 'terramity:bottomless_ammo_box',
    'terramity:copper_round', 'terramity:gold_round',
    'terramity:antimatter_round', 'terramity:dimlite_round',
    'terramity:iridium_round', 'terramity:shadowflame_bullet',
    'terramity:suppressed_gold_round',
    // 2026-10-18 (decision list entry 13): the three shells the jar can still
    // craft, ammunition for guns that cannot be made (loot already strips them)
    'terramity:steel_shell', 'terramity:daemonium_shotshells',
    'terramity:hellspec_shotshells',
  ] })

  // I.2: Remove ALL Terramity armor set recipes
  event.remove({ output: [
    // Conductite set
    'terramity:conductite_armor_boots', 'terramity:conductite_armor_chestplate',
    'terramity:conductite_armor_leggings', 'terramity:conductite_scouter_helmet',
    // Conjuror set
    'terramity:conjuror_boots', 'terramity:conjuror_chestplate',
    'terramity:conjuror_helmet', 'terramity:conjuror_leggings',
    // Cosmilite set
    'terramity:cosmilite_armor_boots', 'terramity:cosmilite_armor_chestplate',
    'terramity:cosmilite_armor_helmet', 'terramity:cosmilite_armor_leggings',
    // Dimlite set
    'terramity:dimlite_boots', 'terramity:dimlite_chestplate',
    'terramity:dimlite_helmet', 'terramity:dimlite_leggings',
    // Evil King set
    'terramity:evil_king_armor_boots', 'terramity:evil_king_armor_chestplate',
    'terramity:evil_king_armor_helmet', 'terramity:evil_king_armor_leggings',
    // Exodium Warlock set
    'terramity:exodium_warlock_boots', 'terramity:exodium_warlock_chestplate',
    'terramity:exodium_warlock_helmet', 'terramity:exodium_warlock_leggings',
    // Hellspec set
    'terramity:hellspec_boots', 'terramity:hellspec_chestplate',
    'terramity:hellspec_helmet', 'terramity:hellspec_leggings',
    // Iridium set
    'terramity:iridium_armor_boots', 'terramity:iridium_armor_chestplate',
    'terramity:iridium_armor_helmet', 'terramity:iridium_armor_leggings',
    // Nyxium Knight set
    'terramity:nyxium_knight_boots', 'terramity:nyxium_knight_chestplate',
    'terramity:nyxium_knight_helmet', 'terramity:nyxium_knight_leggings',
    // Onyx set
    'terramity:onyx_armor_boots', 'terramity:onyx_armor_chestplate',
    'terramity:onyx_armor_helmet', 'terramity:onyx_armor_leggings',
    // Reverium Paladin set
    'terramity:reverium_paladin_boots', 'terramity:reverium_paladin_chestplate',
    'terramity:reverium_paladin_helmet', 'terramity:reverium_paladin_leggings',
    // Ruby set
    'terramity:ruby_armor_boots', 'terramity:ruby_armor_chestplate',
    'terramity:ruby_armor_helmet', 'terramity:ruby_armor_leggings',
    // Sapphire set
    'terramity:sapphire_armor_boots', 'terramity:sapphire_armor_chestplate',
    'terramity:sapphire_armor_helmet', 'terramity:sapphire_armor_leggings',
    // Topaz set
    'terramity:topaz_armor_boots', 'terramity:topaz_armor_chestplate',
    'terramity:topaz_armor_helmet', 'terramity:topaz_armor_leggings',
    // Virentium set
    'terramity:virentium_armor_boots', 'terramity:virentium_armor_chestplate',
    'terramity:virentium_armor_helmet', 'terramity:virentium_armor_leggings',
    // Void Mage set
    'terramity:void_mage_boots', 'terramity:void_mage_chestplate',
    'terramity:void_mage_helmet', 'terramity:void_mage_leggings',
    // Boss hat drops (remove crafting only — still drop from bosses)
    'terramity:gundalfs_hat_helmet',
  ] })

  // I.3: Terramity non-gun EPIC content — recipe removal
  // (audit Phase 4.1, 2026-04-27 — closes the audit's "non-gun curios + melee
  // weapons completely ungated" finding. The original Section I covered only
  // guns + gun-armor; this sub-block covers melee weapons + curios that ALSO
  // don't fit the pack's RPG progression at low tiers. Recipes removed; loot
  // allocation in loot/terramity_boss_drops.js.)
  event.remove({ output: [
    // 7 EPIC non-gun melee weapons (boss-themed; allocated to T3-T4 bosses)
    'terramity:blasphemic_rapture', 'terramity:unholy_lance',
    'terramity:davy_jones', 'terramity:olympus',
    'terramity:divine_intervention', 'terramity:planet_buster',
    'terramity:kamehameha',
    // 8 EPIC curios (out-of-tier-range +stat / proc accessories)
    'terramity:antimatter_pacemaker', 'terramity:nyxs_necklace',
    'terramity:antiprism', 'terramity:null_scarf',
    'terramity:dragon_band', 'terramity:sacred_speed_bracelets',
    'terramity:angel_feather', 'terramity:fortunes_favor',
  ] })

  // NOTE: Terramity has no custom enchantments in the enchantment registry.
  // "enchanter_merlin" is a boss mob entity, not an enchantment — kept.

  // I.4: Terramity ingot families — full recipe strip (2026-05-19 user call)
  // Three EPIC-rarity ingots (`nyxium`, `exodium_superalloy`, `reverium`) feed
  // armor sets (already stripped in I.2), tools, weapons, curios, and
  // decorative blocks. The armor recipes were the only previously-gated
  // outputs; the rest were freely craftable from the ingots, which created
  // a parallel material progression that competed with our Tetra / iron /
  // mod-canonical material tiers.
  //
  // This block removes recipes for:
  //   1) the 3 ingots themselves (any smelt/craft path that produces them)
  //   2) all decorative blocks (block / brick / panelling / plating / tile /
  //      glass variants — 17 from nyxium, 1 each from exodium + reverium)
  //   3) all tools (axe/pickaxe/shovel/hoe across all 3 families)
  //   4) the 7 weapons + curios we want as STRUCTURE DROPS only — recipes
  //      removed here, drops added in `loot/terramity_structure_drops.js`:
  //        Nyxium (T4): nyxium_greatsword
  //        Exodium (T3): exodium_sword, exodium_waraxe,
  //                      exodium_twin_bracelets, exodium_shield_amulet
  //        Reverium (T3): reverium_sword, reverium_axe
  //
  // Items NOT removed: the 4 armor sets per family are in I.2 above.
  event.remove({ output: [
    // === Nyxium family (23 outputs, ingot + tools + decorative + greatsword) ===
    'terramity:nyxium',
    'terramity:nyxium_axe', 'terramity:nyxium_hoe',
    'terramity:nyxium_pickaxe', 'terramity:nyxium_shovel',
    'terramity:nyxium_greatsword',
    'terramity:nyxium_block', 'terramity:nyxium_glass',
    'terramity:nyxium_bricks', 'terramity:nyxium_brick_slab',
    'terramity:nyxium_brick_stairs', 'terramity:nyxium_brick_wall',
    'terramity:nyxium_panelling', 'terramity:nyxium_panelling_slab',
    'terramity:nyxium_panelling_stairs', 'terramity:nyxium_panelling_wall',
    'terramity:chiseled_nyxium_panelling',
    'terramity:nyxium_plating', 'terramity:nyxium_plating_slab',
    'terramity:nyxium_plating_stairs',
    'terramity:nyxium_tiles', 'terramity:nyxium_tile_slab',
    'terramity:nyxium_tile_stairs',
    // === Exodium family (10 outputs) ===
    'terramity:exodium_superalloy',
    'terramity:exodium_block',
    'terramity:exodium_pickaxe', 'terramity:exodium_shovel',
    'terramity:exodium_hoe',
    'terramity:exodium_sword', 'terramity:exodium_waraxe',
    'terramity:exodium_twin_bracelets', 'terramity:exodium_shield_amulet',
    // === Reverium family (7 outputs) ===
    'terramity:reverium',
    'terramity:reverium_block',
    'terramity:reverium_axe', 'terramity:reverium_hoe',
    'terramity:reverium_pickaxe', 'terramity:reverium_shovel',
    'terramity:reverium_sword',
  ] })

  // I.5: Terramity RARE tomes + bracelets — recipe strip, structure drops
  // 9 RARE items the audit flagged as "ungated proc-modifying items":
  // 7 utility tomes + 2 curio bracelets. Each is a stat or action modifier.
  // Cosmetic music sheets (14), reagents (iridium/occult_fabric/prismatic_jewel
  // /warden_soul), fairy bottles, and ISS compat empty_spell_tome are LEFT
  // ALONE — mod's natural balance fits the pack.
  //
  // Tier reasoning:
  //   T2 (basic mobility/utility): tome_of_commotion (knockback proc),
  //     galebounce_tome, velocity_flip, dimensional_poof (cosmetic teleport)
  //   T3 (powerful action mods): tome_of_ascension (mobility chain),
  //     guardian_grimoire, gaias_tempest (storm proc)
  //   T3 (curio bracelets): electron_bracelets, malediction_bracelets
  //
  // Drop allocations are in `loot/terramity_structure_drops.js` below.
  event.remove({ output: [
    // T2 tomes
    'terramity:tome_of_commotion', 'terramity:galebounce_tome',
    'terramity:velocity_flip', 'terramity:dimensional_poof',
    // T3 tomes
    'terramity:tome_of_ascension', 'terramity:guardian_grimoire',
    'terramity:gaias_tempest',
    // T3 bracelets
    'terramity:electron_bracelets', 'terramity:malediction_bracelets',
  ] })
  })



  // ═══ SECTION J: MEKANISM TOOL & ARMOR REMOVAL ═══
  // Remove Atomic Disassembler and Meka-Tool (overpowered multi-tools).
  // MekaSuit recipes are KEPT — they feed into MekaSuit Mk2 progression.

  // J.1: Multi-tools
  icraft.section('recipes/recipe_audit/section-j-mekanism-tool-armor-removal', function () {
  event.remove({ id: 'mekanism:atomic_disassembler' })
  event.remove({ id: 'mekanism:meka_tool' })

  // J.2: Refined Obsidian Armor — nothing to remove. That armor belongs to
  // Mekanism: Tools (recipe ids mekanismtools:…), which is not installed; the
  // four `mekanism:refined_obsidian_*` recipe ids that were removed here do not
  // exist. Lines removed 2026-10-10.

  // J.3: Cataclysm Mechanical Fusion Anvil — design decision (locked-in #2,
  // 2026-04-27): merge with our existing void_forge/infernal_forge crafting
  // stations to avoid triple-overlap of T4 crafting blocks. The cataclysm
  // mod's mechanical_fusion_anvil duplicates functionality already covered
  // by void_forge (Ender Guardian) and infernal_forge (Ignis). Removing the
  // recipe + add to T4 stage list as defense against creative leak.
  event.remove({ output: 'cataclysm:mechanical_fusion_anvil' })
  })



  // ═══ SECTION K: THE ABYSS — RING RECIPE REMOVAL ═══
  // Design decision: All 30 Abyss rings are removed from crafting.
  // Custom rings replace them as boss/structure drops.
  // Also removes the Arcane Workbench recipe (ring crafting station).

  // K.1 – K.3: remove EVERY recipe that outputs an Abyss ring.
  // One filter does it: a regex output filter matches any output item whose id
  // CONTAINS the pattern (KubeJS RegExIngredient.test uses find()), with no
  // restriction on mod or recipe type.
  //   - the old K.1 (same regex, restricted to mod 'theabyss' + shaped crafting)
  //     and
  //   - the old K.3 (29 literal `theabyss:ring_of_*` ids, each of which the regex
  //     matches)
  // were strict subsets of it and were removed 2026-10-10; behaviour is
  // identical.
  icraft.section('recipes/recipe_audit/section-k-the-abyss-ring-recipe-removal', function () {
  event.remove({ output: /theabyss:ring_/ })

  // K.4: Remove Arcane Workbench recipe (ring crafting station — no longer needed)
  event.remove({ output: 'theabyss:arcane_workbench' })

  // K.5: Remove crafting recipes for the boss-drop-only armor set
  // Unorithe armor — boss drops only (loot/abyss_boss_loot.js Section 4).
  // 2026-10-10: ids corrected to the real `theabyss:<set>_armor_<slot>` form
  // (the old `theabyss:unorithe_helmet` etc. matched nothing, so the armor
  // stayed craftable). The Knight / Ragnarok / Dragon / Death entries that
  // used to be listed here were dropped: the installed The Abyss registers
  // no such armor items, so there is nothing to remove.
  event.remove({ output: [
    // Unorithe set
    'theabyss:unorithe_armor_helmet', 'theabyss:unorithe_armor_chestplate',
    'theabyss:unorithe_armor_leggings', 'theabyss:unorithe_armor_boots',
  ] })
  })




  // ═══ SECTION L: BLUE SKIES — DUSK ARC, SHADOW ARMOR, RUNIC ARC REMOVAL ═══
  // Design decision: Dusk Arc removed entirely (too strong for T2).
  // Shadow Armor removed (outclasses progression-appropriate gear).
  // Runic Arc crafting removed — now only obtainable as a rare boss drop
  // or very rare Blue Skies structure chest loot (see loot_overhaul.js).

  // L.1: Remove Dusk Arc recipe (all variants)
  icraft.section('recipes/recipe_audit/section-l-blue-skies-dusk-arc-shadow-armor', function () {
  event.remove({ output: /blue_skies:dusk_arc/ })

  // L.2: Remove Shadow Armor recipes (all 4 pieces)
  event.remove({ output: [
    'blue_skies:shadow_helmet', 'blue_skies:shadow_chestplate',
    'blue_skies:shadow_leggings', 'blue_skies:shadow_boots',
  ] })

  // L.3: Remove Runic Arc crafting recipe (gated to boss drops + rare loot)
  event.remove({ output: 'blue_skies:runic_arc' })
  })


  // ═══ SECTION M: BLUE SKIES — MATERIAL STAT NERFS (HARDCODED LIMITATION) ═══
  // Diopside, Charoite, and Horizonite tools/armor are hardcoded in the
  // Blue Skies mod JAR. There is no config or datapack to change their
  // attack damage, durability, or armor values.
  //
  // Target stats (T2 level, NOT diamond):
  //   Diopside:   durability ~350, damage ~6,   armor ~iron+1 (precision gem)
  //   Charoite:   durability ~400, damage ~6.5, armor ~iron+1 (balanced + magic)
  //   Horizonite: durability ~450, damage ~7,   armor ~iron+2 (high durability)
  //
  // WORKAROUND: Remove all vanilla Blue Skies tool/armor crafting recipes
  // for these materials. Players use Tetra integration instead (see
  // icraft_tetra_materials datapack for balanced T2 Tetra definitions).
  // The raw materials (diopside gem, charoite gem, horizonite ingot) remain
  // obtainable and usable as Tetra components at proper T2 stats.
  //
  // NOTE FOR PLAYTESTING: If players still obtain the vanilla Blue Skies
  // tools/armor via other means (loot tables, mob drops), additional
  // loot table removals may be needed. The Tetra materials ARE balanced.

  // M.1: Remove Diopside tool + armor recipes
  icraft.section('recipes/recipe_audit/section-m-blue-skies-material-stat-nerfs', function () {
  event.remove({ output: [
    'blue_skies:diopside_sword', 'blue_skies:diopside_pickaxe',
    'blue_skies:diopside_axe', 'blue_skies:diopside_shovel',
    'blue_skies:diopside_hoe',
    'blue_skies:diopside_helmet', 'blue_skies:diopside_chestplate',
    'blue_skies:diopside_leggings', 'blue_skies:diopside_boots',
  ] })

  // M.2: Remove Charoite tool + armor recipes
  event.remove({ output: [
    'blue_skies:charoite_sword', 'blue_skies:charoite_pickaxe',
    'blue_skies:charoite_axe', 'blue_skies:charoite_shovel',
    'blue_skies:charoite_hoe',
    'blue_skies:charoite_helmet', 'blue_skies:charoite_chestplate',
    'blue_skies:charoite_leggings', 'blue_skies:charoite_boots',
  ] })

  // M.3: Remove Horizonite tool + armor recipes
  event.remove({ output: [
    'blue_skies:horizonite_sword', 'blue_skies:horizonite_pickaxe',
    'blue_skies:horizonite_axe', 'blue_skies:horizonite_shovel',
    'blue_skies:horizonite_hoe',
    'blue_skies:horizonite_helmet', 'blue_skies:horizonite_chestplate',
    'blue_skies:horizonite_leggings', 'blue_skies:horizonite_boots',
  ] })


  console.log('[IridescentCraft] recipe_audit.js loaded — cross-mod recipe audit active')
  })
}))
