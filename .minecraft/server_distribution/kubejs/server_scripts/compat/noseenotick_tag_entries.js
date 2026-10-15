// @file kubejs/server_scripts/compat/noseenotick_tag_entries.js
// @events none
// @live noseenotick-tag-entries
// =============================================================================
// The `#tag` entries of NoSeeNoTick's always-tick list work: the pack's bosses
// (#icraft:registry_bosses) keep ticking far from every player.
// =============================================================================
// NoSeeNoTick 2.0.0 (config/noseenotick-common.toml, entityIgnoreList) stops
// every living entity more than 48 blocks across or 32 up or down from every
// player once 2 or more players are online, unless the entity's type is on
// that list. Read from the jar's bytecode and measured on a full-pack boot
// (2026-10-15): of the three kinds of entry the mod documents, only `modid:*`
// works. An exact id is stored as a ResourceLocation and looked up with a
// String (never equal); a `#tag` entry is parsed into a key that is never
// stored (Config.updateMobLists builds it and drops it), so
// Config.entityTagKeys stays empty and Utils.isIgnoredEntity never asks a tag.
//
// This script puts the key of every `#tag` entry of the mod's own list into
// Config.entityTagKeys, the set Utils.isIgnoredEntity already reads
// (EntityType.is(tag)), and empties the mod's per-type answer cache
// (Utils.isIgnored) so no answer given before stays. The list stays the one
// in the config file. It runs when the server scripts load (before any level
// ticks) and again on every /reload; adding a key twice is harmless. The mod
// never clears that set itself (a config file change does not touch it), so
// a tag taken off the list counts until the next restart.
//
// Ruled by the operator 2026-10-15 ("use the bosses tag"): the boss entries
// go through #icraft:registry_bosses, generated from the boss registry
// (dev/rosters/boss_tag.py). This file can go when a NoSeeNoTick jar stores
// its tag keys itself (Config.updateMobLists adding to entityTagKeys).
// =============================================================================
;(function () {
  if (!Platform.isLoaded('noseenotick')) return
  var TAG_PREFIX = '#'
  try {
    var Config = Java.loadClass('com.sargerasarm.noseenotick.Config')
    var Utils = Java.loadClass('com.sargerasarm.noseenotick.Utils')
    var TagKey = Java.loadClass('net.minecraft.tags.TagKey')
    var Registries = Java.loadClass('net.minecraft.core.registries.Registries')
    var ResourceLocation = Java.loadClass('net.minecraft.resources.ResourceLocation')
    var added = []
    var list = Config.entityIgnoreList.get()
    for (var i = 0; i < list.size(); i++) {
      var entry = String(list.get(i)).trim()
      if (entry.indexOf(TAG_PREFIX) !== 0) continue
      var key = TagKey.create(Registries.ENTITY_TYPE, new ResourceLocation(entry.substring(1)))
      if (Config.entityTagKeys.add(key)) added.push(entry)
    }
    Utils.isIgnored.clear()  // CI-ignore: isIgnored is the mod's static cache map (a field), not a method
    console.info('[noseenotick_tags] tag entries on the always-tick list: ' + Config.entityTagKeys.size() +
      (added.length ? ' (registered now: ' + added.join(', ') + ')' : ' (none new)'))
    if (added.length) icraft.live.fired('noseenotick-tag-entries')
  } catch (e) {
    console.error('[noseenotick_tags] could not register the tag entries of NoSeeNoTick\'s list: ' + e +
      '. With 2 or more players online the bosses stop ticking far from every player')
  }
})()
