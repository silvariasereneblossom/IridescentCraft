// =============================================================================
// CAP PLAYER KNOCKBACK -- prevent skyward arrow launches
// =============================================================================
// Tester report 2026-04-25: arrows from spider-jockey skeleton (with mod
// affixes / enchants on its bow) launched the player "way up into the
// sky". Vanilla arrow knockback derives its vertical component from the
// shot angle; combined with stacked Punch enchant + Apotheosis attack-
// knockback affix on a mob's bow, the player gets thrown out of the
// playable arena.
//
// Surgical fix: subscribe to Forge's LivingKnockBackEvent (fires before
// the actual knockback impulse is applied). If the victim is a Player and
// the strength exceeds our cap, scale it down. We don't touch the ratios
// (xRatio / zRatio / vertical fraction); just cap magnitude.
//
// Cap = 1.5. Reasoning:
//   - Vanilla skeleton arrow base knockback strength ~0.4
//   - Punch I adds ~0.6 of strength; Punch II adds ~1.2 total
//   - Vanilla max via Punch II = ~1.6 (rounded)
//   - Our cap of 1.5 keeps vanilla intent intact, only bites when
//     mod affixes / Apotheosis stack push beyond reasonable
//
// Applied only to players (incoming side); mob-vs-mob knockback is
// untouched. PvP combat affected — if a player nukes another player
// with a Punch V bow, the cap kicks in too. That's intentional;
// no one wants to be punted across a server.
//
// Memory: feedback_wiki_reference.md (Rhino var-not-const in reentrant
// scopes), feedback_jar_audit.md (decompile when in doubt about API).
// =============================================================================

try {
  var MinecraftForge_kb = Java.loadClass('net.minecraftforge.common.MinecraftForge')
  var LivingKnockBackEvent = Java.loadClass('net.minecraftforge.event.entity.living.LivingKnockBackEvent')
  var EventPriority_kb = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority')
  var Consumer_kb = Java.loadClass('java.util.function.Consumer')
  var Player_kb = Java.loadClass('net.minecraft.world.entity.player.Player')

  var KNOCKBACK_CAP = 1.5
  // Vanilla unit-vector ratios are length 1.0. Anything >1.5 is a mod
  // bug producing un-normalized direction. Cap at 1.5 (slack for natural
  // floating-point variance) and renormalize to 1.0 if exceeded.
  var RATIO_CAP = 1.5

  var handler = new Consumer_kb({
    accept: function(event) {
      try {
        var victim = event.getEntity()
        if (!(victim instanceof Player_kb)) return

        var strength = event.getStrength()
        var ratioX = event.getRatioX()
        var ratioZ = event.getRatioZ()

        // 2026-04-25 diagnostic: previous version only logged when
        // strength > cap. Tester reported being launched skyward but
        // no logs fired -- meaning either the event isn't reaching us,
        // or the launch comes from ratio/Y manipulation rather than
        // strength. Vanilla LivingEntity.knockback() caps Y impulse at
        // 0.4, so high strength alone shouldn't fling skyward. We need
        // to see the actual values being passed.
        //
        // Log first 10 events with full values so we can diagnose, then
        // back off to logging only capped events. Per-attacker-type
        // dedup so it's not spam-prone.
        if (!global._kb_seen_count) global._kb_seen_count = 0
        if (global._kb_seen_count < 10) {
          global._kb_seen_count++
          var src1 = null
          try { src1 = event.getSource ? event.getSource() : null } catch (e) {}
          var atk1 = null
          try { atk1 = src1 ? src1.getEntity() : null } catch (e) {}
          var atkName = atk1 ? String(atk1.getType().toString()) : 'unknown'
          var srcName = src1 ? String(src1.type ? src1.type : src1) : 'no-src'
          console.log('[knockback_cap] event #' + global._kb_seen_count +
                      ' strength=' + strength.toFixed(3) +
                      ' ratioX=' + ratioX.toFixed(3) +
                      ' ratioZ=' + ratioZ.toFixed(3) +
                      ' attacker=' + atkName +
                      ' source=' + srcName)
        }

        if (strength > KNOCKBACK_CAP) {
          event.setStrength(KNOCKBACK_CAP)
          if (!global._kb_cap_seen) global._kb_cap_seen = {}
          var src = null
          try { src = event.getSource ? event.getSource() : null } catch (e) {}
          var attacker = null
          try { attacker = src ? src.getEntity() : null } catch (e) {}
          var key = attacker ? String(attacker.getType().toString()) : 'unknown'
          if (!global._kb_cap_seen[key]) {
            global._kb_cap_seen[key] = true
            console.log('[knockback_cap] CAPPED strength ' + strength.toFixed(2) +
                        ' -> ' + KNOCKBACK_CAP + ' from ' + key)
          }
        }

        // 2026-04-25: tester captured event #7 with strength=0.4 (normal) but
        // ratioX=-16.382 ratioZ=7.571. Vanilla LivingEntity.knockback expects
        // a unit-direction (sqrt(rx^2+rz^2) ~= 1.0); the player gets pushed
        // by `strength * ratio_component`. Magnitudes of 16+ launch the
        // player ~16x further than intended. Some mod (Apotheosis affix,
        // arrow-velocity mod, etc.) is passing the raw projectile delta
        // vector instead of normalizing first.
        //
        // Surgical fix: if the ratio magnitude exceeds RATIO_CAP, normalize
        // the direction back to unit length. Keeps the direction intent
        // (which way the player is pushed) but caps the magnitude.
        var rMag = Math.sqrt(ratioX * ratioX + ratioZ * ratioZ)
        if (rMag > RATIO_CAP) {
          var scale = 1.0 / rMag  // normalize back to unit vector
          event.setRatioX(ratioX * scale)
          event.setRatioZ(ratioZ * scale)
          if (!global._kb_ratio_seen) global._kb_ratio_seen = {}
          var src2 = null
          try { src2 = event.getSource ? event.getSource() : null } catch (e) {}
          var atk2 = null
          try { atk2 = src2 ? src2.getEntity() : null } catch (e) {}
          var k2 = atk2 ? String(atk2.getType().toString()) : 'unknown'
          if (!global._kb_ratio_seen[k2]) {
            global._kb_ratio_seen[k2] = true
            console.log('[knockback_cap] CAPPED ratio mag=' + rMag.toFixed(2) +
                        ' -> 1.0 from ' + k2)
          }
        }
      } catch (e) {
        console.warn('[knockback_cap] handler threw: ' + e)
      }
    }
  })

  // NORMAL priority -- runs after most affix handlers have computed their
  // strength multipliers. Cap is the final word.
  MinecraftForge_kb.EVENT_BUS.addListener(EventPriority_kb.NORMAL, false,
                                          LivingKnockBackEvent, handler)
  console.log('[IridescentCraft] cap_player_knockback loaded (cap=' +
              KNOCKBACK_CAP + ')')
} catch (e) {
  console.warn('[IridescentCraft] cap_player_knockback bootstrap FAILED: ' + e)
}
