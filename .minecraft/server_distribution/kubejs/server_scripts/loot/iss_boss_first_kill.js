// =============================================================================
// ISS BOSS FIRST-KILL GUARANTEES — Phase 6F-1
// =============================================================================
// First-kill of certain ISS bosses guarantees a unique themed spell book.
// Subsequent kills fall through to normal loot tables (which include the
// book at lower drop chance, see iss_boss_drops.js).
//
// Tracked per-player via persistentData flag icraft_first_kill_<bossname>:
//   - dead_king      -> necronomicon_spell_book (T4)
//   - archevoker     -> evoker_spell_book (T3)
//   - fire_boss      -> blaze_spell_book (T3)
//   - valkyrie_queen -> magehunter (T3)
//
// Tetra replacement files auto-convert dropped vanilla ISS books into our
// modular variants on inventory tick, so we drop vanilla items here.
//
// Memory: feedback_rhino_scoping.md (var X = function(){} inside try blocks)
// =============================================================================

try {
  var FIRST_KILL_DROPS = [
    { entity: 'irons_spellbooks:dead_king',       item: 'irons_spellbooks:necronomicon_spell_book', flag: 'dead_king' },
    { entity: 'irons_spellbooks:archevoker',      item: 'irons_spellbooks:evoker_spell_book',       flag: 'archevoker' },
    { entity: 'irons_spellbooks:fire_boss',       item: 'irons_spellbooks:blaze_spell_book',        flag: 'fire_boss' },
    { entity: 'aether:valkyrie_queen',            item: 'irons_spellbooks:magehunter',              flag: 'valkyrie_queen' }
  ]

  EntityEvents.death(function(event) {
    try {
      var ent = event.entity
      if (!ent) return
      var src = event.source
      if (!src) return
      var killer = src.player
      if (!killer) return
      var entityType = String(ent.type)

      for (var i = 0; i < FIRST_KILL_DROPS.length; i++) {
        var entry = FIRST_KILL_DROPS[i]
        if (entityType !== entry.entity) continue
        // [2026-10-11] The flag key is `icraft_fk2_...`, not the old
        // `icraft_first_kill_...`: until today this handler set the flag and then
        // threw (`Item.of(id).itemStack` is undefined and Level has no `dropItem`),
        // so every old flag was set WITHOUT a reward. A new key gives each player
        // the guarantee once; the old keys are ignored.
        var flagKey = 'icraft_fk2_' + entry.flag
        var pdata = killer.persistentData
        if (pdata.contains(flagKey) && pdata.getBoolean(flagKey)) return  // already got it
        // Drop at the boss (vanilla Entity.spawnAtLocation(ItemStack)); the flag
        // is set only after the drop call returned.
        var dropStack = Item.of(entry.item)
        if (!dropStack || dropStack.isEmpty()) {
          console.warn('[iss_first_kill] unknown item ' + entry.item + ' -- no drop, flag not set')
          return
        }
        ent.spawnAtLocation(dropStack)
        pdata.putBoolean(flagKey, true)
        killer.tell('§dThe §5' + entry.entity.split(':')[1].replace(/_/g, ' ') + '§d falls. A first-kill reward materializes.')
        console.log('[iss_first_kill] ' + killer.username + ' first-killed ' + entry.entity + ' -> ' + entry.item)
        return
      }
    } catch (e) {
      console.warn('[iss_first_kill] handler threw: ' + e)
    }
  })

  console.log('[IridescentCraft] iss_boss_first_kill loaded -- 4 first-kill book guarantees armed')
} catch (e) {
  console.warn('[IridescentCraft] iss_boss_first_kill bootstrap FAILED: ' + e)
}
