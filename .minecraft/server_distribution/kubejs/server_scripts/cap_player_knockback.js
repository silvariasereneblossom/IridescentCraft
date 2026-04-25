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

  var handler = new Consumer_kb({
    accept: function(event) {
      try {
        var victim = event.getEntity()
        if (!(victim instanceof Player_kb)) return
        var strength = event.getStrength()
        if (strength > KNOCKBACK_CAP) {
          event.setStrength(KNOCKBACK_CAP)
          // First-time-per-source-class log so we know what sources
          // were getting through (helps tune the cap or audit affix
          // damage). Keyed by attacker entity type.
          if (!global._kb_cap_seen) global._kb_cap_seen = {}
          var src = event.getSource ? event.getSource() : null
          var attacker = src ? src.getEntity() : null
          var key = attacker ? String(attacker.getType().toString()) : 'unknown'
          if (!global._kb_cap_seen[key]) {
            global._kb_cap_seen[key] = true
            console.log('[knockback_cap] capped ' + strength.toFixed(2) +
                        ' -> ' + KNOCKBACK_CAP + ' from ' + key +
                        ' (first occurrence)')
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
