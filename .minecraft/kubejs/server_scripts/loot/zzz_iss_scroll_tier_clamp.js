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
// LOADS LAST (zzz_ prefix): runs after every other loot modifier so it sees the
// final generated scroll even if a future script adds scrolls to an ISS entity
// table. (Today the entity-table scroll comes from the vanilla/datapack table's
// randomize_spell, which always rolls before any LootJS modifier, so order is
// not strictly required -- the prefix just future-proofs it.)
//
// Pairs with: randomize_blank_scrolls.js (retro-binds blank scrolls, T1 formula)
// and the priest holy-scroll rate-down (icraft_loot_overrides entities/priest).
// =============================================================================

// Provisional tier -> max scroll level. FLAG: tune in a feel-pass.
function issScrollTierCap(player) {
  try {
    if (!player) return 4
    if (AStages.playerHasStage('tier_4', player)) return 10
    if (AStages.playerHasStage('tier_3', player)) return 8
    if (AStages.playerHasStage('tier_2', player)) return 6
    return 4
  } catch (e) { return 4 }
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
    var tag = (stack.getTag ? stack.getTag() : null)
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

LootJS.modifiers(event => {
  // Every ISS entity table: priest / apothecarist / necromancer / cryomancer /
  // pyromancer / cultist / archevoker / dead_king / ... -- matched by id regex.
  event.addLootTableModifier(/^irons_spellbooks:entities\//).apply(ctx => {
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
})
