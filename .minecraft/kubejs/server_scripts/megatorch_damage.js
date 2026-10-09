// =============================================================================
// MEGATORCH DAMAGE AURA - hostiles inside a megatorch's area take damage
// =============================================================================
// Operator directive (2026-06-10): a Torchmaster Megatorch should not only
// PREVENT spawns in its radius, but actively DAMAGE hostile mobs that wander
// into its area of effect (10 dmg/hit). Farm animals + NPCs (villagers,
// golems, traders) and the player's tamed pets are never touched.
//
// HOW IT FINDS TORCHES (no position-tracking, catches existing + new):
//   Torchmaster has NO megatorch block-entity -- spawn-prevention lives in a
//   per-LEVEL capability (ModCaps.TEB_REGISTRY -> ITEBLightRegistry) that holds
//   one entry per placed light. We read getEntries() (TorchInfo[] -> getPos),
//   keep only entries whose block is actually torchmaster:megatorch (the
//   registry also holds dreadlamps), and box-query hostiles around each.
//
// "HOSTILE" = KubeJS .monster (MobCategory not friendly) -- the SAME gate
//   spawn_village_protection.js + mob_equipment.js use, so animals (CREATURE),
//   villagers/golems/traders (MISC/CREATURE), and tamed pets are excluded
//   automatically. Reuses the proven sweep pattern from that script.
//
// TUNABLES (top): DAMAGE, SWEEP_TICKS, RADIUS.
//   - RADIUS defaults to 64 = the megaTorchRadius spawn-prevention area, so the
//     "nothing spawns" zone == the "everything dies" zone.
//   - DAMAGE 10 with SWEEP_TICKS 10 (~= the vanilla 10-tick hurt-immunity
//     window) lands ~once per cadence -> effective ~20 dmg/s through armor.
//     For an instant-melt aura raise DAMAGE or lower SWEEP_TICKS.
//   - NOTE: .monster includes BOSSES -- a megatorch placed by a boss arena will
//     chip/melt that boss. If that's exploitable, add an HP/boss-tag exclusion.
//
// LOADED CHUNKS ONLY (2026-10-09, the "server OOMs every evening" leak):
//   level.getBlock() on an UNLOADED chunk force-loads it to FULL. The registry
//   lists every torch in the level, so this sweep reloaded the chunk of every
//   far-away torch 2x/s. In a level with no players, vanilla stops calling
//   tickBlockEntities() (the only place dead tickers leave
//   Level.blockEntityTickers), so each reload leaked a whole LevelChunk copy:
//   the 10-07 OOM dump held 112,787 copies of the one megatorch chunk
//   (overworld 170,206) = 8.65 GB. A torch whose chunk isn't loaded has no
//   ticking hostiles around it anyway, so skip it; hasChunkAt never loads.
//
// Memory: feedback_rhino_scoping (var X = function(){} in IIFE),
//   feedback_kubejs_event_scope (ServerEvents = server-side; this is server-
//   authoritative), feedback_kubejs6_java_ctor (no `new java.X` -- AABB.of +
//   damageSources() only).
// =============================================================================

;(function () {
  var DAMAGE = 10.0          // damage per application
  var SWEEP_TICKS = 10       // cadence (ticks) ~ vanilla hurt-immunity window
  var RADIUS = 64            // blocks from the torch (= megaTorchRadius)

  var ModCaps, TEB_REGISTRY
  try {
    ModCaps = Java.loadClass('net.xalcon.torchmaster.common.ModCaps')
    TEB_REGISTRY = ModCaps.TEB_REGISTRY
  } catch (e) {
    console.warn('[megatorch-damage] Torchmaster ModCaps not found - aura disabled: ' + e)
    return
  }

  // true only if the torch's chunk is already loaded; never loads it. A
  // failed binding skips the torch (safe) and warns once instead of every 10t.
  var guardWarned = false
  var chunkLoaded = function (level, pos) {
    try { return level.hasChunkAt(pos) === true } catch (e) {
      if (!guardWarned) {
        guardWarned = true
        console.warn('[megatorch-damage] hasChunkAt unavailable - aura skipped: ' + e)
      }
      return false
    }
  }

  var damageAround = function (level, x, y, z) {
    var src = level.damageSources().magic()
    var ents = level.getEntitiesWithin(AABB.of(
      x - RADIUS, y - RADIUS, z - RADIUS,
      x + RADIUS, y + RADIUS, z + RADIUS))
    ents.forEach(function (e) {
      if (!e || !e.living || !e.monster) return
      try { e.attack(src, DAMAGE) } catch (_) {}
    })
  }

  ServerEvents.tick(function (event) {
    var server = event.server
    if (server.tickCount % SWEEP_TICKS !== 0) return
    try {
      var it = server.getAllLevels().iterator()
      while (it.hasNext()) {
        var level = it.next()
        var opt
        try { opt = level.getCapability(TEB_REGISTRY).resolve() } catch (_) { continue }
        if (!opt || !opt.isPresent()) continue
        var entries = opt.get().getEntries()
        if (!entries || entries.length === 0) continue
        for (var i = 0; i < entries.length; i++) {
          var pos = entries[i].getPos()
          if (!pos) continue
          if (!chunkLoaded(level, pos)) continue
          var x = pos.x, y = pos.y, z = pos.z
          // registry holds dreadlamps too -> keep only real megatorches
          if (String(level.getBlock(x, y, z).id) !== 'torchmaster:megatorch') continue
          damageAround(level, x, y, z)
        }
      }
    } catch (err) {
      console.error('[megatorch-damage] sweep error: ' + err)
    }
  })

  console.log('[megatorch-damage] aura active: ' + DAMAGE + ' dmg / ' +
              SWEEP_TICKS + 't to hostiles within r=' + RADIUS + ' of a megatorch')
})()
