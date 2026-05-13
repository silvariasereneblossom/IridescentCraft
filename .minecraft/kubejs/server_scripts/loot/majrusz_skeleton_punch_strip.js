// =============================================================================
// MAJRUSZ SKELETON PUNCH STRIP
// Place in: kubejs/server_scripts/loot/majrusz_skeleton_punch_strip.js
// =============================================================================
//
// Strips the Punch Arrows enchant from bows produced by Majrusz Progressive
// Difficulty's skeleton equipment loot tables.
//
// Why: Majrusz's MobGroups feature subscribes to OnEntitySpawned and
// "promotes" 10% of normal-stage skeleton spawns into a "leader" by applying
// the `majruszsdifficulty:mob_groups/skeleton_leader` loot table. That loot
// table grants a bow with `minecraft:enchant_randomly` -- no filter, can roll
// Punch I or II. Same pattern in `mob_groups/skeleton_sidekick` and every
// `undead_army/wave_N_(wither_)?skeleton` table. When the sidekick spawn
// loop fails (terrain block), the leader walks alone -- tester sees "solo
// skeleton with massive knockback."
//
// The global cap_player_knockback.js (cap=0.5) helps but only per-event;
// multiple skeletons firing simultaneously still compound knockback. The
// surgical fix is to remove Punch from the loot table itself so it can
// never roll in the first place. Other enchant_randomly outcomes (Power,
// Flame, Infinity, Unbreaking) are kept -- skeletons retain visible variety.
//
// Tables affected (regex-matched):
//   majruszsdifficulty:mob_groups/skeleton_leader
//   majruszsdifficulty:mob_groups/skeleton_sidekick
//   majruszsdifficulty:undead_army/wave_3_skeleton
//   majruszsdifficulty:undead_army/wave_4_skeleton
//   majruszsdifficulty:undead_army/wave_5_skeleton
//   majruszsdifficulty:undead_army/wave_6_skeleton
//   majruszsdifficulty:undead_army/wave_6_wither_skeleton  (stone_sword, no bow -- no-op)
//
// Mechanism: LootJS modifyLoot(filter, callback). Filter picks out
// minecraft:bow stacks. Callback inspects the stack's Enchantments NBT
// tag, removes any entry with id "minecraft:punch", returns the modified
// stack to replace the original in the loot pool.
//
// Memory: feedback_wiki_reference.md (Rhino var-not-const in reentrant
// scopes), feedback_jar_audit.md (decompile when in doubt about API).
// =============================================================================

var ItemFilter_pn = Java.loadClass('com.almostreliable.lootjs.filters.ItemFilter')

LootJS.modifiers(event => {

  var bowFilter = ItemFilter_pn.custom(function(stack) {
    try {
      if (!stack || stack.isEmpty()) return false
      var id = String(stack.id || '')
      if (!id) {
        try { id = String(stack.getItem().builtInRegistryHolder().key().location()) } catch (e) {}
      }
      return id === 'minecraft:bow'
    } catch (e) { return false }
  })

  var stripPunch = function(stack) {
    try {
      var tag = stack.getTag ? stack.getTag() : null
      if (!tag) return stack
      // Enchantments tag is a TAG_LIST (id=9) of TAG_COMPOUND (id=10) entries.
      if (!tag.contains('Enchantments', 9)) return stack
      var enchs = tag.getList('Enchantments', 10)
      if (enchs.size() === 0) return stack
      var removed = 0
      for (var i = enchs.size() - 1; i >= 0; i--) {
        var e = enchs.getCompound(i)
        var enchId = String(e.getString('id') || '')
        if (enchId === 'minecraft:punch') {
          enchs.remove(i)
          removed++
        }
      }
      if (removed > 0 && !global._mjr_punch_stripped) {
        global._mjr_punch_stripped = true
        console.log('[majrusz_punch_strip] stripped Punch from a Majrusz skeleton bow (logging once)')
      }
    } catch (e) {
      console.warn('[majrusz_punch_strip] modify error: ' + e)
    }
    return stack
  }

  var tables = [
    /^majruszsdifficulty:mob_groups\/skeleton_(leader|sidekick)$/,
    /^majruszsdifficulty:undead_army\/wave_[0-9]+_(wither_)?skeleton$/,
  ]
  tables.forEach(function(re) {
    event.addLootTableModifier(re).modifyLoot(bowFilter, stripPunch)
  })

  console.log('[icraft-loot] Majrusz skeleton Punch-strip registered (' +
              tables.length + ' table patterns)')
})
