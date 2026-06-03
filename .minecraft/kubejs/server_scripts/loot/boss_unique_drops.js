// =============================================================================
// BOSS UNIQUE DROPS — SS T1 (new) + all Too Many Bows bows (boss-exclusive)
// =============================================================================
// Full "Simply Swords treatment" for TMB (operator 2026-06-03): every TMB bow is
// now a per-boss trophy drop, NOT chest loot (chest sources killed in
// lootjs_overhaul.js + too_many_bows.json + the recipe strip). Also adds the NEW
// SS T1 sword drops that give Simply Swords a T1 presence (the existing SS T2-T4
// drops stay in loot_overhaul.js §1 — those entries are addDrop:false here).
//
// Data-driven from global.ICRAFT_UNIQUE_ITEMS (unique_itemset_registry.js): one
// entity loot modifier per item whose addDrop===true. A boss with two uniques
// (e.g. Gob -> sword_on_a_stick + dark_bow) gets two modifiers — they stack.
// Read lazily inside the LootJS callback, so the registry need not load first.
// =============================================================================

LootJS.modifiers(event => {
  const items = global.ICRAFT_UNIQUE_ITEMS
  const chance = global.ICRAFT_UNIQUE_DROP_CHANCE || 0.15
  if (!items) { console.warn('[boss_unique_drops] registry global missing — no drops added'); return }

  let n = 0
  for (const id in items) {
    const meta = items[id]
    if (!meta || !meta.addDrop || !meta.boss) continue
    event.addEntityLootModifier(meta.boss)
      .addLoot(LootEntry.of(id).when(c => c.randomChance(chance)))
    n++
  }
  console.log('[boss_unique_drops] ' + n + ' boss-exclusive unique drops registered (SS T1 + TMB bows @ '
    + Math.round(chance * 100) + '%)')
})
