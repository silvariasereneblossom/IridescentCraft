// =============================================================================
// kubejs/server_scripts/loot/zzz_iss_scroll_tier_clamp.js
//
// TIER-CONVERT DROPPED ISS SCROLL LEVELS  (operator decision 2026-06-15)
//
// When a player kills an Iron's Spellbooks mob and the drops include an
// inscribed scroll (irons_spellbooks:scroll carrying the spell_container NBT),
// clamp every spell slot's `level` DOWN to the KILLER's AStages tier, so a
// low-tier player cannot farm high-level scrolls off easy ISS mobs.
//
//   Provisional tier -> max scroll level  (FLAG: feel-pass pending):
//     T1 -> <=4    T2 -> <=6    T3 -> <=8    T4 -> <=10
//   Non-player kills, or un-tiered players, default to the T1 cap (<=4).
//
// MECHANISM: a LootJS modifier on every ISS *entity* loot table
// (irons_spellbooks:entities/*) via .apply(ctx). .apply exposes BOTH the
// kill-credit player (ctx.getPlayer()) AND the generated loot stacks
// (ctx.getLoot()) in one place -- the only LootJS hook that gives the killer.
// We lower the int `level` inside each slot of the
// `irons_spellbooks:spell_container` -> `data` list (jar-verified 2026-06-15:
// NBT key = "irons_spellbooks:spell_container", inner list = "data", slot
// fields id/index/level/locked, `level` an int). This is the "lower the level
// field" path from the task -- surgical, preserves spell id/index/locked, and
// handles a multi-slot container (createScrollContainer would collapse it).
//
// SCOPE: irons_spellbooks:scroll ONLY. ISS staffs / weapons / spell books also
// carry a spell_container (blood_staff, magehunter, ... added by
// iss_boss_drops.js); we must NOT clamp those -- only dropped scrolls.
//
// SAFE vs the ISS getItemBySlot AbstractMethodError (0_iss_guard.js): we never
// touch the killed entity -- only the killer player and the dropped ItemStacks.
//
// LOAD ORDER (corrected 2026-10-10): this file does NOT load last. Script
// names compare case-insensitively, so 'Z' sorts before '_' and zzz_* loads
// BEFORE every zz_* file (boot log: zzz_iss_scroll_tier_clamp, then
// zz_iss_arena_enrichment, zz_pack_enchanted_books, zz_unique_chest_strip). It
// does load after every a-z loot file. That is enough today: the entity-table
// scroll comes from the vanilla/datapack table's randomize_spell, which always
// rolls before any LootJS modifier, and none of the zz_* files touches an ISS
// entity table. A future script that ADDS scrolls to an ISS entity table from
// a zz_* file would escape this clamp.
//
// TABLE FILTER (fixed 2026-10-10): it was /^irons_spellbooks:entities\//.
// LootJS table regexes are FULL-MATCH (ResourceLocationFilter.ByPattern.test ==
// Pattern.matcher(id).matches(), decompiled 2.13.1), so that pattern matched no
// table and this clamp had never run since it shipped (it logged "armed" at
// every boot). With the trailing .* it matches the 17 irons_spellbooks:entities/
// tables.
//
// Pairs with: randomize_blank_scrolls.js (retro-binds blank scrolls, T1 formula)
// and the priest holy-scroll rate-down (icraft_loot_overrides entities/priest).
// =============================================================================

// Provisional tier -> max scroll level. FLAG: tune in a feel-pass.
// (the tier is global.icraft.core.playerTier since 2026-10-13: no player, or a
// failure to ask AStages, is tier 1 = cap 4, as before)
var ISS_SCROLL_CAP_BY_TIER = [4, 4, 6, 8, 10]   // index = tier 1..4 (0 unused)
function issScrollTierCap(player) {
  return ISS_SCROLL_CAP_BY_TIER[global.icraft.core.playerTier(player)]
}

function issScrollStackId(stack) {
  try {
    var id = String(stack.id || '')
    if (id) return id
  } catch (e) {}
  try { return String(stack.getItem().builtInRegistryHolder().key().location()) } catch (e) { return '' }
}

// Lower every slot's `level` in the scroll's spell_container to <= cap.
// Returns the number of slots actually lowered. Defensive: never throws.
function issClampScrollLevels(stack, cap) {
  try {
    // [2026-10-11] `stack.nbt`, not `stack.getTag()`: KubeJS renames
    // ItemStack.getTag -> getNbt for scripts, so `stack.getTag` was undefined, the
    // old line always produced null and no scroll was ever clamped. `nbt` is the
    // live tag (not a copy), so the edit below sticks.
    var tag = stack.nbt
    if (!tag) return 0
    if (!tag.contains('irons_spellbooks:spell_container', 10)) return 0   // 10 = TAG_COMPOUND
    var cont = tag.getCompound('irons_spellbooks:spell_container')
    if (!cont.contains('data', 9)) return 0                               // 9 = TAG_LIST
    var data = cont.getList('data', 10)                                   // list of compounds
    var changed = 0
    for (var i = 0; i < data.size(); i++) {
      var slot = data.getCompound(i)
      var lvl = slot.getInt('level')                                      // getInt reads any numeric tag
      if (lvl > cap) { slot.putInt('level', cap); changed++ }             // lower only; never raise
    }
    return changed
  } catch (e) { return 0 }
}

LootJS.modifiers(icraft.guard('loot/zzz_iss_scroll_tier_clamp', 'LootJS.modifiers', event => {
  // Every ISS entity table: priest / apothecarist / necromancer / cryomancer /
  // pyromancer / cultist / archevoker / dead_king / ... -- matched by id regex.
  event.addLootTableModifier(/^irons_spellbooks:entities\/.*/).apply(ctx => {
    try {
      var loot = ctx.getLoot()
      if (!loot || loot.size() === 0) return
      var cap = issScrollTierCap(ctx.getPlayer())   // null player -> 4 (T1 cap)
      var clamped = 0
      for (var i = 0; i < loot.size(); i++) {
        var stack = loot.get(i)
        if (!stack || stack.isEmpty()) continue
        if (issScrollStackId(stack) !== 'irons_spellbooks:scroll') continue
        clamped += issClampScrollLevels(stack, cap)
      }
      if (clamped > 0 && !global._iss_scroll_clamp_logged) {
        global._iss_scroll_clamp_logged = true
        var who = ''
        try { who = ctx.getPlayer() ? (' for ' + ctx.getPlayer().username) : ' (no killer -> T1 cap)' } catch (e) {}
        console.log('[iss_scroll_tier_clamp] first clamp: lowered ' + clamped +
                    ' scroll slot(s) to L<=' + cap + who + ' (logging once)')
      }
    } catch (e) {
      if (!global._iss_scroll_clamp_err) {
        global._iss_scroll_clamp_err = true
        console.warn('[iss_scroll_tier_clamp] apply threw (logging once): ' + e)
      }
    }
  })
  console.log('[iss_scroll_tier_clamp] armed -- dropped ISS scroll levels clamp to killer tier ' +
              '(T1<=4 T2<=6 T3<=8 T4<=10; non-player/un-tiered -> T1)')
}))
