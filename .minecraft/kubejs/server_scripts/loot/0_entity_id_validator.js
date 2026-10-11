// =============================================================================
// ENTITY-ID GUARD for loot modifiers  —  global.icraftEntityMod(event, id)
// =============================================================================
// WHY THIS EXISTS (2026-06-06): LootJS addEntityLootModifier(String) resolves
// ids through BuiltInRegistries.ENTITY_TYPE, which is a DefaultedRegistry whose
// DEFAULT ENTRY IS minecraft:pig. An unresolvable id (typo, renamed boss,
// wrong-mod entity, item-id-as-entity) does NOT error - it silently registers
// the modifier against PIGS. This shipped boss loot (magehunter, ultimate
// reforging tokens, waystone cores) on every pig for weeks and survived four
// audit passes that read the id strings without resolving them.
//
// HOW (2026-10-10 rewrite): this file used to validate a hand-copied snapshot
// list of ids at ServerEvents.loaded. The snapshot missed every id that is
// registered from a list (codex mob drops, robe/essence mobs, meat animals,
// LSP legendaries, the unique-item registry: ~45 ids), and it could only
// report a leak after the bad modifier was already live.
//
// Now every loot script registers its entity modifiers THROUGH this guard:
//
//     global.icraftEntityMod(event, 'mod:entity_id')      // instead of
//     event.addEntityLootModifier('mod:entity_id')
//
//   * id is a registered entity type -> returns the real LootJS builder; the
//     call is identical to the direct one.
//   * id is NOT registered (or malformed) -> logs ONE error line and returns
//     an inert builder: every chained .addLoot()/.removeLoot()/... is
//     swallowed and NOTHING is registered. So there is no pig leak, and no
//     action-less modifier either (a LootJS modifier with zero actions throws
//     in afterPosted and takes every later modifier down with it).
//   * the registry cannot be queried at all (class filter / API change) ->
//     fail OPEN: behave exactly like the direct call, and say so once.
//
// The membership test is the one this file has used in production since
// 2026-06-06: BuiltInRegistries.ENTITY_TYPE.containsKey(new ResourceLocation(id))
// (containsKey is a plain key lookup - it does NOT fall back to the default
// entry the way get() does). It is self-tested on first use: minecraft:pig
// must resolve and a nonsense id must not.
//
// Also exported: global.icraftEntityIdOk(id) -> true / false / null (null =
// cannot tell), for scripts that only need the check.
//
// Grep the log for ENTITY-ID-VALIDATOR. Files outside loot/ that still call
// event.addEntityLootModifier directly are NOT covered (today: endgame/
// rift_mechanics.js).
// =============================================================================

;(function () {
  var TAG = '[ENTITY-ID-VALIDATOR] '

  // Every public method of LootJS 2.13.1 LootActionsBuilderJS (the class itself
  // plus LootConditionsContainer / LootFunctionsContainer / LootActionsContainer).
  // The inert builder answers all of them, so a skipped modifier can never turn
  // into a "Cannot find function" that aborts the whole LootJS event.
  var BUILDER_METHODS = [
    // LootActionsBuilderJS
    'logName', 'pool', 'group', 'apply', 'playerAction',
    // LootActionsContainer
    'addLoot', 'addAlternativesLoot', 'addSequenceLoot', 'addWeightedLoot',
    'removeLoot', 'replaceLoot', 'modifyLoot', 'triggerExplosion',
    'triggerLightningStrike', 'dropExperience', 'addAction',
    // LootConditionsContainer
    'matchLoot', 'matchMainHand', 'matchOffHand', 'matchEquip',
    'survivesExplosion', 'timeCheck', 'weatherCheck', 'randomChance',
    'randomChanceWithLooting', 'randomChanceWithEnchantment', 'randomTableBonus',
    'biome', 'anyBiome', 'anyDimension', 'anyStructure', 'lightLevel',
    'killedByPlayer', 'matchBlockState', 'matchFluid', 'matchEntity',
    'matchKiller', 'matchDirectKiller', 'matchPlayer', 'matchDamageSource',
    'distanceToKiller', 'customDistanceToPlayer', 'playerPredicate',
    'entityPredicate', 'killerPredicate', 'directKillerPredicate',
    'blockEntityPredicate', 'hasAnyStage', 'not', 'or', 'and',
    'customCondition', 'addCondition',
    // LootFunctionsContainer
    'enchantRandomly', 'enchantWithLevels', 'applyLootingBonus',
    'applyBinomialDistributionBonus', 'applyOreBonus', 'applyBonus',
    'simulateExplosionDecay', 'smeltLoot', 'damage', 'addPotion',
    'addAttributes', 'limitCount', 'addLore', 'replaceLore', 'setName',
    'addNBT', 'addNbt', 'customFunction', 'functions', 'addFunction'
  ]
  var INERT = {}
  var inertMethod = function () { return INERT }
  for (var m = 0; m < BUILDER_METHODS.length; m++) INERT[BUILDER_METHODS[m]] = inertMethod

  var reg = null
  var RL = null
  var regState = 0          // 0 = not resolved yet, 1 = usable, -1 = unavailable
  var okCount = 0
  var bad = []              // distinct unresolvable ids seen since this script loaded

  function registryUsable() {
    if (regState !== 0) return regState === 1
    try {
      var BuiltInRegistries = Java.loadClass('net.minecraft.core.registries.BuiltInRegistries')
      RL = Java.loadClass('net.minecraft.resources.ResourceLocation')
      reg = BuiltInRegistries.ENTITY_TYPE
      // self-test: if the lookup cannot tell a real id from a fake one, do not trust it
      if (!reg.containsKey(new RL('minecraft:pig')) || reg.containsKey(new RL('icraft:__no_such_entity__'))) {
        throw 'containsKey self-test failed'
      }
      regState = 1
    } catch (e) {
      regState = -1
      console.error(TAG + 'entity registry lookup unavailable (' + e + ') - entity ids are NOT validated'
        + ' this load; modifiers register unchecked (an unknown id would target MINECRAFT:PIG).')
    }
    return regState === 1
  }

  // true = registered entity type | false = not registered / malformed | null = cannot tell
  global.icraftEntityIdOk = function (id) {
    if (!registryUsable()) return null
    try {
      return reg.containsKey(new RL(String(id))) ? true : false
    } catch (e) {
      return false          // malformed ResourceLocation
    }
  }

  // Drop-in for event.addEntityLootModifier(id). ONE id per call (that is how
  // every script in loot/ uses it): for several entities, call it once per id.
  global.icraftEntityMod = function (event, id) {
    if (arguments.length !== 2) {
      console.error(TAG + 'icraftEntityMod(event, id) takes exactly ONE entity id, got '
        + (arguments.length - 1) + ' - only "' + id + '" is used. Call it once per id.')
    }
    if (global.icraftEntityIdOk(id) === false) {
      var sid = String(id)
      if (bad.indexOf(sid) < 0) bad.push(sid)
      console.error(TAG + 'SKIPPED entity loot modifier: unknown entity id "' + sid
        + '" (LootJS would have registered it on MINECRAFT:PIG). FIX THE ID.')
      return INERT
    }
    okCount++               // true, or null = unchecked (fail open)
    return event.addEntityLootModifier(id)
  }

  // Boot summary (one line, after the first loot build).
  ServerEvents.loaded(function (event) {
    try {
      if (regState === 0) registryUsable()
      if (regState !== 1) {
        console.error(TAG + 'registry lookup unavailable - ' + okCount + ' entity loot modifiers registered UNCHECKED')
      } else if (bad.length === 0) {
        console.log(TAG + 'all entity ids resolve (' + okCount + ' entity loot modifiers registered through the guard)')
      } else {
        console.error(TAG + bad.length + ' UNRESOLVABLE ENTITY ID(S), their modifiers were skipped: ' + bad.join(', '))
      }
    } catch (e) {
      console.error(TAG + 'summary failed: ' + e)
    }
  })
})()
