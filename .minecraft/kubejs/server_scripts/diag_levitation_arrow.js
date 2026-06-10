// =============================================================================
// TEMPORARY DIAGNOSTIC (#104) -- name the source of the spider-jockey launch arrow
// =============================================================================
// The amp-50 Levitation (+ Nausea) "launch" is on the ARROW (operator), but every
// data-side suspect is ruled out: Apotheosis `shulkers` affix is disabled AND caps
// at amp~3; affix_effects.js is player-gated; the death potion is chest-loot only.
// So the source is a modded mob/projectile only an in-game capture can name.
//
// Two correlated handlers (fires even though cap_player_levitation BLOCKS the
// effect -- this is a separate listener):
//   (1) on hurt-by-projectile-from-a-NON-player -> stash {projectileType,
//       shooterType, gameTime} on the victim (global map by uuid).
//   (2) on Levitation effect application (any amp) -> if the victim has a FRESH
//       (<=20t) stashed projectile hit, LOG amp + projectile id + shooter id.
//       "proj=UNKNOWN" => not an arrow (direct melee/aura effect instead).
//
// => the log line names the mod (proj=somemod:xxx) or confirms a vanilla tipped
//    arrow (proj=minecraft:arrow shooter=minecraft:skeleton). REMOVE THIS FILE
//    after one capture. Deduped per (amp,proj,shooter).
//
// Memory: feedback_rhino_scoping (var fns in IIFE), feedback_kubejs_event_scope
// (server-side Forge events), feedback_changelog_mandatory (temporary -> #104).
// =============================================================================

;(function () {
  var DR, ForgeEventRegistry, EntityType, PlayerClass
  try {
    DR = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
    ForgeEventRegistry = Java.loadClass('com.iridescentcraft.reforging.event.ForgeEventRegistry')
    EntityType = Java.loadClass('net.minecraft.world.entity.EntityType')
    PlayerClass = Java.loadClass('net.minecraft.world.entity.player.Player')
  } catch (e) {
    console.error('[diag-lev-arrow] init failed: ' + e); return
  }

  if (!global._diagLevHits) global._diagLevHits = {}
  if (!global._diagLevSeen) global._diagLevSeen = {}

  var typeId = function (e) {
    try { return String(EntityType.getKey(e.getType())) }
    catch (_) { try { return String(e.type) } catch (__) { return '?' } }
  }
  var gameTime = function (e) {
    try { return e.level().getGameTime() } catch (_) { try { return e.level.gameTime } catch (__) { return 0 } }
  }
  var uuidOf = function (e) {
    try { return String(e.getUUID()) } catch (_) { try { return String(e.uuid) } catch (__) { return null } }
  }

  // (1) stash the last non-player projectile hit on each victim
  DR.registerLate('icraft.diag_lev_stash', function (event) {
    try {
      var src = event.source; if (!src) return
      var direct = src.directEntity; if (!direct) return
      var shooter = src.entity
      if (shooter && (shooter instanceof PlayerClass)) return
      var victim = event.entity; if (!victim) return
      var id = uuidOf(victim); if (!id) return
      global._diagLevHits[id] = {
        proj: typeId(direct),
        shooter: shooter ? typeId(shooter) : 'none',
        time: gameTime(victim)
      }
    } catch (e) {}
  })

  // (2) on levitation application, log the correlated projectile + shooter
  ForgeEventRegistry.registerEffectApplicable('icraft.diag_lev_log', function (event) {
    try {
      var inst = event.getEffectInstance(); if (!inst) return
      var eff = inst.getEffect(); if (!eff) return
      if (String(eff.getDescriptionId ? eff.getDescriptionId() : eff) !== 'effect.minecraft.levitation') return
      var v = event.getEntity(); if (!v) return
      var id = uuidOf(v)
      var hit = id ? global._diagLevHits[id] : null
      var amp = 0; try { amp = inst.getAmplifier() } catch (_) {}
      var dur = 0; try { dur = inst.getDuration() } catch (_) {}
      var fresh = hit && (gameTime(v) - hit.time) <= 20
      var info = fresh ? ('proj=' + hit.proj + ' shooter=' + hit.shooter)
                       : 'proj=UNKNOWN (no recent projectile hit -> direct melee/aura effect, NOT an arrow)'
      var key = 'lev|' + amp + '|' + (fresh ? hit.proj + '|' + hit.shooter : 'noproj')
      if (global._diagLevSeen[key]) return
      global._diagLevSeen[key] = true
      console.warn('[DIAG-LEV] levitation amp=' + amp + ' dur=' + dur + 't on ' + typeId(v) + ' <- ' + info)
    } catch (e) { console.warn('[DIAG-LEV] log threw: ' + e) }
  })

  console.log('[diag-lev-arrow] armed (TEMPORARY #104 -- remove after one capture)')
})()
