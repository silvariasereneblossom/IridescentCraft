// =============================================================================
// IridescentCraft — Ad Astra Recipe Gating
// File: kubejs/server_scripts/recipes/ad_astra_gating.js
//
// Design Doc: Ad Astra Integration — Recipe Modifications
//
// Gates Ad Astra content behind T4 materials:
//   - Rocket Workbench: Netherite + Mekanism Steel Casing, recipe stage-locked
//     to tier_4 (gates/astages_restrictions.js, STAGE-GATED RECIPES)
//   - Jet Suit: Removed entirely (MekaSuit fills this niche)
//   - Tier 1-4 Rockets: Gated behind progressive planet materials
// =============================================================================

ServerEvents.recipes(icraft.guard('recipes/ad_astra_gating', 'ServerEvents.recipes', event => {

  // ═══ SECTION A: ROCKET WORKBENCH — Gateway Item ═══
  // Remove default recipe, replace with T4-gated version.
  // 2026-10-10: this needed 2x kubejs:reality_progression_token_t4, a legacy
  // token with no source since the token currency was retired (2026-06-01) --
  // so the workbench, and with it every rocket, could not be crafted at all.
  // Operator decision: gate by tier stage. The token slots are gone; the
  // recipe is locked to tier_4 by its id in gates/astages_restrictions.js.
  icraft.section('recipes/ad_astra_gating/section-a-rocket-workbench-gateway-item', function () {
  event.remove({ output: 'ad_astra:nasa_workbench' })

  event.shaped('ad_astra:nasa_workbench', [
    'N N',
    'CSC',
    'N N'
  ], {
    N: 'minecraft:netherite_ingot',
    C: 'mekanism:steel_casing',
    S: 'ad_astra:steel_block'
  }).id('icraft:nasa_workbench_t4')
  })


  // ═══ SECTION B: JET SUIT — Remove Entirely ═══
  // MekaSuit fills the Jet Suit niche (flight + space survival)
  // [2026-10-10] the chest and leg pieces were listed as jet_suit_chestplate /
  // jet_suit_leggings; Ad Astra 1.15 calls them `jet_suit` and `jet_suit_pants`,
  // so those two stayed craftable.
  icraft.section('recipes/ad_astra_gating/section-b-jet-suit-remove-entirely', function () {
  event.remove({ output: 'ad_astra:jet_suit_helmet' })
  event.remove({ output: 'ad_astra:jet_suit' })
  event.remove({ output: 'ad_astra:jet_suit_pants' })
  event.remove({ output: 'ad_astra:jet_suit_boots' })
  })


  // ═══ SECTION C: TIER 1 ROCKET (Moon) ═══
  // Replace iron/steel components with Netherite + Enderium
  // Requires significant material investment even for T4 players
  icraft.section('recipes/ad_astra_gating/section-c-tier-1-rocket', function () {
  event.remove({ output: 'ad_astra:tier_1_rocket' })

  event.shaped('ad_astra:tier_1_rocket', [
    ' N ',
    'NEN',
    'SFS'
  ], {
    N: 'minecraft:netherite_ingot',
    E: 'thermal:enderium_ingot',
    S: 'ad_astra:steel_plate',
    F: 'ad_astra:engine_frame'
  }).id('icraft:tier_1_rocket')
  })


  // ═══ SECTION D: TIER 2 ROCKET (Mars) ═══
  // Requires Moon-specific materials + Aethersteel
  icraft.section('recipes/ad_astra_gating/section-d-tier-2-rocket', function () {
  event.remove({ output: 'ad_astra:tier_2_rocket' })

  event.shaped('ad_astra:tier_2_rocket', [
    ' N ',
    'AMA',
    'SFS'
  ], {
    N: 'minecraft:netherite_ingot',
    A: 'aethersteel:aethersteel_ingot',
    M: 'ad_astra:moon_stone',
    S: 'ad_astra:steel_plate',
    F: 'ad_astra:engine_frame'
  }).id('icraft:tier_2_rocket')
  })


  // ═══ SECTION E: TIER 3 ROCKET (Venus/Mercury) ═══
  // Requires Mars-specific materials + Aethersteel
  icraft.section('recipes/ad_astra_gating/section-e-tier-3-rocket', function () {
  event.remove({ output: 'ad_astra:tier_3_rocket' })

  event.shaped('ad_astra:tier_3_rocket', [
    ' A ',
    'AMA',
    'SFS'
  ], {
    A: 'aethersteel:aethersteel_ingot',
    M: 'ad_astra:mars_stone',
    S: 'ad_astra:steel_plate',
    F: 'ad_astra:engine_frame'
  }).id('icraft:tier_3_rocket')
  })


  // ═══ SECTION F: TIER 4 ROCKET (Glacio) ═══
  // Most expensive single craft in the pack
  // Requires materials from all inner planets + Primordial Essence
  icraft.section('recipes/ad_astra_gating/section-f-tier-4-rocket', function () {
  event.remove({ output: 'ad_astra:tier_4_rocket' })

  event.shaped('ad_astra:tier_4_rocket', [
    ' P ',
    'AVA',
    'SFS'
  ], {
    P: 'kubejs:primordial_essence',
    A: 'aethersteel:aethersteel_ingot',
    V: 'ad_astra:venus_stone',
    S: 'ad_astra:steel_plate',
    F: 'ad_astra:engine_frame'
  }).id('icraft:tier_4_rocket')
  })


  // ═══ SECTION G: MekaSuit Mk2 — Ultimate Armor (IN-PLACE UPGRADE) ═══
  // [S85-S5 2026-06-06] Antimatter sink: the single ad_astra:glacio_stone reagent
  // in each of the 4 Mk2 upgrade recipes is swapped for mekanism:pellet_antimatter
  // (the `G` key), making the engineering apex output (an SPS antimatter run) a
  // HARD gate on the engineering apex armor. Pattern + modifyResult/buildMk2 NBT
  // stamping are UNCHANGED — only the `G` ingredient mapping changed.
  // (mekanism:pellet_antimatter confirmed present in all_items.tsv.)
  //   FLAG for lane B / operator: this PULLS the Mk2 toward pure-tech and
  //   slightly weakens the Axis-E "engineering terminus re-enters the forge
  //   fantasy" framing (glacio was a forge-vocabulary reagent). See draft S5's
  //   "Contrasting position." Recorded, not re-litigated here.
  // [2026-06-06 MK2B redesign] Approved architecture (operator 2026-06-06):
  // The Mk2 is the REAL mekanism:mekasuit_* piece carrying an icraft Mk2 NBT
  // marker, NOT a separate kubejs: shell item. The recipe consumes the player's
  // existing MekaSuit piece + the SAME reagent set as before and outputs the
  // SAME mekanism piece with its NBT PRESERVED (installed modules + stored
  // energy + enchants + affixes all survive) plus a merged Mk2 marker and a
  // pinnacle display identity. Stats are layered on at runtime in
  //   kubejs/startup_scripts/mekasuit_mk2_stats.js   (keyed on item + marker).
  //
  // API ROUTE (proven against kubejs-forge-2001.6.5-build.16):
  //   RecipeJS.modifyResult(ModifyRecipeResultCallback) — verified public via
  //   javap on dev/latvian/mods/kubejs/recipe/RecipeJS.class. The callback
  //   ModifyRecipeResultCallback.modify(ModifyRecipeCraftingGrid grid,
  //   ItemStack result) -> ItemStack runs at CRAFT time inside the special
  //   ShapedKubeJSRecipe (which overrides m_5874_/assemble + getRemainingItems),
  //   so the input MekaSuit's live NBT is readable from the grid. We read the
  //   consumed piece via grid.find(Ingredient) and copy its tag onto the output.
  //
  // NBT MARKER convention: this repo stamps custom item NBT as a flat top-level
  // key (precedent: `icraft_broken` in apotheosis_gem_repair.js; `affix_data`
  // etc.). We use top-level boolean `icraft_mekasuit_mk2: 1b`. (The design-doc
  // shorthand `icraft:{mk2:1b}` describes intent; the repo's actual item-NBT
  // convention is the flat icraft_-prefixed key, which we follow.)
  //
  // The kubejs:mekasuit_mk2_* SHELL items are RETIRED — see endgame_items.js.

  // Helper: build the in-place Mk2 output from the consumed input piece.
  // - copy the input's full tag (modules/energy/enchants/affixes preserved)
  // - stamp the Mk2 marker
  // - set pinnacle display Name + Lore (Mythic Forge identity)
  // Defined with `var ... = function` per Rhino reentrant-scope rule.
  icraft.section('recipes/ad_astra_gating/section-g-mekasuit-mk2-ultimate-armor', function () {
  var CompoundTag_mk2 = Java.loadClass('net.minecraft.nbt.CompoundTag')
  var StringTag_mk2 = Java.loadClass('net.minecraft.nbt.StringTag')
  var ListTag_mk2 = Java.loadClass('net.minecraft.nbt.ListTag')

  var MK2_NAMES = {
    'mekanism:mekasuit_helmet':    '§b§lMekaSuit Mk2 §r§7Helm',
    'mekanism:mekasuit_bodyarmor': '§b§lMekaSuit Mk2 §r§7Chestplate',
    'mekanism:mekasuit_pants':     '§b§lMekaSuit Mk2 §r§7Leggings',
    'mekanism:mekasuit_boots':     '§b§lMekaSuit Mk2 §r§7Boots'
  }

  // §-coded JSON text components for display.Name / display.Lore.
  var nameJson = function (label) {
    return '{"text":"' + label.replace(/"/g, '\\"') + '"}'
  }
  var LORE_LINES = [
    '{"text":"Pinnacle of the engineering line","color":"dark_aqua","italic":false}',
    '{"text":"Forged at the Mythic Forge","color":"gray","italic":false}',
    '{"text":"All installed modules, energy & enchants preserved","color":"dark_gray","italic":false}'
  ]

  // input: native ItemStack (the consumed MekaSuit piece). result: native
  // ItemStack (a fresh mekanism:mekasuit_* from the recipe output). We mutate
  // result so the output carries the input's NBT + the Mk2 layer.
  var buildMk2 = function (input, result, label) {
    try {
      // Start from a copy of the input's tag so NOTHING native is dropped.
      // [2026-10-11] `input.nbt` / `result.nbt = ...`: KubeJS renames
      // ItemStack.getTag / setTag / hasTag() to getNbt / setNbt / hasNBT for
      // scripts. The old `input.hasTag()` (zero arguments) and `input.getTag()`
      // both threw, so this function always fell into its catch: the craft ate
      // the MekaSuit piece WITH its modules, energy and enchants and returned a
      // plain piece with no Mk2 marker.
      var src = (input && !input.isEmpty()) ? input.nbt : null
      var outTag = src ? src.copy() : new CompoundTag_mk2()

      // Mk2 marker (flat top-level boolean, repo convention).
      outTag.putBoolean('icraft_mekasuit_mk2', true)

      // Pinnacle display identity (Name + Lore). Preserve any pre-existing
      // display compound (e.g. an anvil rename) by merging into it.
      var display = outTag.contains('display')
        ? outTag.getCompound('display')
        : new CompoundTag_mk2()
      display.putString('Name', nameJson(label))
      var lore = new ListTag_mk2()
      for (var i = 0; i < LORE_LINES.length; i++) {
        lore.add(StringTag_mk2.valueOf(LORE_LINES[i]))
      }
      display.put('Lore', lore)
      outTag.put('display', display)

      result.nbt = outTag
    } catch (e) {
      // Fail-soft: never let a craft crash. Worst case the player gets a
      // plain (un-marked) MekaSuit piece back; re-craft will retry.
      console.warn('[mekasuit_mk2] buildMk2 failed: ' + e)
    }
    return result
  }

  // Crafted at Mythic Forge: MekaSuit piece + Aethersteel + Glacio + Primordial.
  // Output is the SAME mekanism piece; modifyResult restamps it in place.
  event.shaped('mekanism:mekasuit_helmet', [
    'AGA',
    'AHA',
    'P P'
  ], {
    A: 'aethersteel:aethersteel_ingot',
    G: 'mekanism:pellet_antimatter',   // [S85-S5] was ad_astra:glacio_stone
    H: 'mekanism:mekasuit_helmet',
    P: 'kubejs:primordial_essence'
  }).id('icraft:mekasuit_mk2_helmet').modifyResult(function (grid, result) {
    return buildMk2(grid.find(Ingredient.of('mekanism:mekasuit_helmet')),
                    result, MK2_NAMES['mekanism:mekasuit_helmet'])
  })

  event.shaped('mekanism:mekasuit_bodyarmor', [
    'AGA',
    'ACA',
    'P P'
  ], {
    A: 'aethersteel:aethersteel_ingot',
    G: 'mekanism:pellet_antimatter',   // [S85-S5] was ad_astra:glacio_stone
    C: 'mekanism:mekasuit_bodyarmor',
    P: 'kubejs:primordial_essence'
  }).id('icraft:mekasuit_mk2_chestplate').modifyResult(function (grid, result) {
    return buildMk2(grid.find(Ingredient.of('mekanism:mekasuit_bodyarmor')),
                    result, MK2_NAMES['mekanism:mekasuit_bodyarmor'])
  })

  event.shaped('mekanism:mekasuit_pants', [
    'AGA',
    'ALA',
    'P P'
  ], {
    A: 'aethersteel:aethersteel_ingot',
    G: 'mekanism:pellet_antimatter',   // [S85-S5] was ad_astra:glacio_stone
    L: 'mekanism:mekasuit_pants',
    P: 'kubejs:primordial_essence'
  }).id('icraft:mekasuit_mk2_leggings').modifyResult(function (grid, result) {
    return buildMk2(grid.find(Ingredient.of('mekanism:mekasuit_pants')),
                    result, MK2_NAMES['mekanism:mekasuit_pants'])
  })

  event.shaped('mekanism:mekasuit_boots', [
    'AGA',
    'ABA',
    'P P'
  ], {
    A: 'aethersteel:aethersteel_ingot',
    G: 'mekanism:pellet_antimatter',   // [S85-S5] was ad_astra:glacio_stone
    B: 'mekanism:mekasuit_boots',
    P: 'kubejs:primordial_essence'
  }).id('icraft:mekasuit_mk2_boots').modifyResult(function (grid, result) {
    return buildMk2(grid.find(Ingredient.of('mekanism:mekasuit_boots')),
                    result, MK2_NAMES['mekanism:mekasuit_boots'])
  })


  console.log('[IridescentCraft] ad_astra_gating.js loaded — Ad Astra recipes gated to T4+')
  })
}))
