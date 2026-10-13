// =============================================================================
// Apotheosis Affix Overworld Strip
// =============================================================================
// User-facing problem: affix-wielding overworld mobs apply heavy knockback
// (and other affix effects) to T1 players, making early melee combat unfun.
// "Random Affix Chance" in adventure.cfg is a global knob (no per-dimension
// exclusion), so we strip post-spawn instead.
//
// Hook: EntityEvents.spawned. Filter: overworld monsters that AREN'T
// Apotheosis bosses or minibosses. Action: remove `affix_data` NBT compound
// from every equipment slot. The mob keeps the base item (so it still has
// a sword to swing) but loses all affix-driven damage/knockback/AoE effects.
//
// Apotheosis bosses + minibosses (NBT `apoth.boss` / `apoth.miniboss`) are
// exempt — they're hand-balanced around their affix kit.
//
// Modded dimensions (Twilight, Aether, Nether, End, etc.) keep affixes —
// design intent is that exploration outside the overworld is rewarded.
// =============================================================================

const AFFIX_STRIP_SLOTS = ['mainhand', 'offhand', 'head', 'chest', 'legs', 'feet']

// The five Iron's Spellbooks casters these spawn scripts must not touch are the
// entries of the boss registry (kubejs/config/icraft/registry/bosses.json) with
// the flag `caster`: icraft.bosses.has(id, 'caster'). Until 2026-10-13 the five
// ids stood here, and in four other scripts, each "kept in sync" by hand.
// The reason is unchanged: on these classes an item-slot or NBT access throws a
// java.lang.Error (AbstractMethodError), which no script catch sees, so the
// test has to come BEFORE any such access.

// All AbstractSpellCastingMob subclasses share the abstract-slot bug.
// Rather than enumerate every subclass, skip the whole namespace.
function _affixStripIsIssMob(resId) {
  return String(resId || '').indexOf('irons_spellbooks:') === 0
}

// KubeJS `entity.type` returns the translation-key form
// ("entity.modid.path"), NOT the resource-location form. Normalize.
function _affixStripEntityResId(entity) {
  try {
    return String(entity.getType().builtInRegistryHolder().key().location())
  } catch (e) {}
  try {
    var raw = String(entity.getType().toString())
    var m = raw.match(/^entity\.([^.]+)\.(.+)$/)
    if (m) return m[1] + ':' + m[2]
    return raw
  } catch (e) { return '' }
}

EntityEvents.spawned(icraft.guard('affix_overworld_strip', 'EntityEvents.spawned', event => {
  let entity = event.entity
  if (!entity || !entity.living || entity.player) return
  if (!entity.monster) return
  if (event.level.dimension != 'minecraft:overworld') return
  // Centralized ISS-mob skip + bail log via 0_iss_guard.js. Local
  // The `caster` test (boss registry) + _affixStripIsIssMob below remain as fallback.
  if (global.icraftSkipIssMob && global.icraftSkipIssMob(entity, 'affix_overworld_strip')) return

  // Apotheosis stamps its bosses in FORGE persistent data
  // (Entity.getPersistentData() -> `forgePersistentData` for scripts). Until
  // 2026-10-10 these two keys were looked up in KubeJS's own persistentData,
  // where they never are, so overworld Apotheosis bosses and minibosses were
  // stripped of their affix kit like any other mob.
  let forgeData = null
  try { forgeData = entity.forgePersistentData } catch (e) {}
  if (forgeData) {
    if (forgeData.contains('apoth.boss')) return
    if (forgeData.contains('apoth.miniboss')) return
  }

  let data = entity.persistentData

  let resId = _affixStripEntityResId(entity)
  if (icraft.bosses.has(resId, 'caster')) return
  if (_affixStripIsIssMob(resId)) return

  // Already-processed marker to avoid re-strip on re-load (chunk unload/load
  // cycles fire EntityEvents.spawned again for existing entities).
  if (data.contains('icraft_affix_stripped')) return
  data.putBoolean('icraft_affix_stripped', true)

  for (let slot of AFFIX_STRIP_SLOTS) {
    let item = null
    try { item = entity.getItemBySlot(slot) } catch (e) { continue }
    if (!item || item.isEmpty()) continue
    if (!item.nbt) continue
    if (item.nbt.contains('affix_data')) {
      item.nbt.remove('affix_data')
      // Re-set the slot so the entity sync picks up the dirty NBT.
      try { entity.setItemSlot(slot, item) } catch (e) {}
    }
  }
}))

console.log('[IridescentCraft] Apotheosis overworld affix-strip loaded')
