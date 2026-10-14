// @file kubejs/server_scripts/death_penalty.js
// @events BlockEvents.broken, EntityEvents.death, ItemEvents.canPickUp, ItemEvents.rightClicked, PlayerEvents.inventoryChanged, PlayerEvents.loggedIn, PlayerEvents.loggedOut, ServerEvents.loaded, hurt, tick.player
// @registry dimensions
// =============================================================================
// DEATH PENALTY SYSTEM — Priority 13
// Design Doc Part I, Section 27: Death & Penalty System
//
// Core rules:
//   - Keep inventory on death (gamerule keepInventory true)
//   - Equipped armor + held weapon lose durability on death
//   - Items NEVER break/destroy — at 0 durability they go "inert"
//   - Inert items: can't deal damage, provide armor, or mine
//   - Durability loss scales by dimension difficulty
//   - Soulbound enchant reduces/negates durability loss
//
// Dimension scaling:
//   Overworld: 10%     Twilight: 12%     Blue Skies: 14%
//   Aether: 15%        Undergarden: 17%  Deeper Darker: 18%
//   The Abyss: 18%     Nether: 20%       The End: 25%
//   (Deep Aether is part of the Aether: 15%. It registers no dimension of its
//    own, so the 22% row this table carried for 'deep_aether:the_aether' never
//    applied; removed 2026-10-12, ruling 2026-10-11 "Deep Aether scales with
//    the Aether".)
//
// Soulbound (Ensorcellation, repurposed):
//   I: 50% reduction    II: 75% reduction    III: 100% (no loss)
// =============================================================================

// ---- CONSTANTS ----

// (IIFE - all KubeJS files of one type share a single Rhino scope; see dev/lint_kubejs_scope.py)
;(function () {
// Durability lost on death, per dimension = `deathPenalty` on its entry in the
// dimension registry (kubejs/config/icraft/registry/dimensions.json, through
// icraft.dims). Until 2026-10-13 the fifteen values stood here; the table in
// the header above is what they are today.

// Fallback for a dimension that has no entry, or no deathPenalty on it
const DEFAULT_LOSS = 0.15

// Soulbound enchant ID (Ensorcellation)
const SOULBOUND_ENCHANT = 'ensorcellation:soulbound'

// NBT tag for broken items
const BROKEN_TAG = 'icraft_broken'

// Equipment slots to apply penalty to.
// `var` (not `const`) because armor_weight.js declares the same global
// in the shared KubeJS Rhino scope. Two `const` declarations of the
// same name throw "TypeError: redeclaration of const ARMOR_SLOTS" at
// load time, which silently aborts THIS entire file -- the death
// event handler never registers, the keepInventory gamerule never
// gets set, and items drop normally on death (real bug, debug.log
// 2026-05-09 11:40:51.767, tester complaint "armor disappeared on
// death"). var is redeclaration-tolerant in Rhino so order doesn't
// matter.
var ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet']

// =============================================================================
// SECTION 1: DEATH EVENT — Apply durability loss
// =============================================================================

EntityEvents.death(icraft.guard('death_penalty', 'EntityEvents.death', event => {
  // Unconditional entry log so we can confirm the handler fires at all.
  // 8 player deaths in the 14:31 session produced no [death-pen] lines
  // despite the script loading and ServerEvents.loaded firing -- which
  // means either this handler doesn't fire for player deaths, or the
  // `event.entity.player` filter below rejects the player. Top trace
  // distinguishes the two cases.
  // 2026-10-10: the question above is answered (the handler fires for players:
  // [death-pen] lines are in the production log), so the trace is now written
  // for PLAYER deaths only. It used to print one line per mob death.
  try {
    var deathEntity = event.entity
    if (deathEntity && deathEntity.player) {
      var hasEventPlayer = false
      try { hasEventPlayer = !!event.player } catch (_) {}
      console.log('[death-event] fired for a player; event.player=' + hasEventPlayer)
    }
  } catch (e) {
    try { console.log('[death-event] entry-log threw: ' + e) } catch (_) { /* swallow-ok: the log call itself failed; there is nowhere left to say so, and a log line must never throw into its caller */ }
  }

  // Player filter -- accept either the legacy `entity.player` truthy-
  // boolean form or the documented `event.player` getter form. Keep
  // both so we work regardless of which path KubeJS exposes.
  var player = null
  try {
    if (event.player) player = event.player
    else if (event.entity && event.entity.player) player = event.entity
  } catch (_) {}
  if (!player) return

  var dimId = (function () {
    try { return String(player.level.dimension().location()) } catch (_) {}
    try { return String(player.level.dimension) } catch (_) {}
    try { return String(player.level.dimension.toString()) } catch (_) {}
    return 'unknown'
  })()

  // Get loss percentage for this dimension
  let lossPct = icraft.dims.get(dimId, 'deathPenalty') || DEFAULT_LOSS

  // --- Check Soulbound on each item individually ---
  // We process armor slots + mainhand + offhand

  // Helper: apply durability loss to one item
  function applyDurabilityLoss(stack, slotLossPct) {
    if (stack.isEmpty()) return
    if (!stack.isDamageableItem()) return

    // Check Soulbound level on THIS item
    let soulboundLevel = 0
    var enchants = stack.enchantments
    if (enchants) {
      // EnchantmentHelper style check
      enchants.forEach((id, lvl) => {
        if (id.toString() === SOULBOUND_ENCHANT) {
          soulboundLevel = lvl
        }
      })
    }

    // Also check via NBT if enchantments are stored differently
    if (soulboundLevel === 0 && stack.nbt) {
      var enchList = stack.nbt.getList('Enchantments', 10)  // 10 = compound tag
      if (enchList) {
        for (let i = 0; i < enchList.size(); i++) {
          var ench = enchList.getCompound(i)
          if (ench.getString('id') === SOULBOUND_ENCHANT) {
            soulboundLevel = ench.getShort('lvl')
            break
          }
        }
      }
    }

    // Apply Soulbound reduction
    let reduction = 0
    if (soulboundLevel >= 3) reduction = 1.0    // 100% — no loss
    else if (soulboundLevel === 2) reduction = 0.75
    else if (soulboundLevel === 1) reduction = 0.50

    // Shulk origin: Hardened Shell — 50% reduced durability loss on death
    if (player.tags.contains('icraft_shulk')) {
      reduction = Math.min(1.0, reduction + 0.50)
    }

    let effectiveLoss = slotLossPct * (1 - reduction)
    if (effectiveLoss <= 0) return

    // Calculate durability damage
    let maxDur = stack.maxDamage
    let durLoss = Math.ceil(maxDur * effectiveLoss)
    if (durLoss <= 0) return

    // Two layers of clamping at different thresholds:
    //
    //   (a) PACK invariant -- "death penalty stops at the inert
    //       threshold (maxDur - 100, or maxDur - half_max for short-
    //       life items)". The live-tick sweep enforces this for
    //       in-combat wear; the death penalty must respect the same
    //       ceiling so equipment doesn't end up at 1 dura remaining
    //       after every death (which is the visible "broken on
    //       death" state we want to avoid).
    //
    //   (b) MIXIN invariant -- "never destroyed", clamps at
    //       maxDur - 1. This is the absolute hard floor enforced
    //       by ItemStackHurtAndBreakMixin + Tetra's own damageItemImpl
    //       (and our overridden Item.damageItem on the modular
    //       armor / spell book classes).
    //
    // (a) is stricter than (b); we compute the (a)-capped amount in
    // JS and then route through hurtAndBreak so (b) is also honored
    // belt-and-suspenders. Earlier fix (commit 1017eda3) called
    // hurtAndBreak with the raw durLoss and lost the (a) cap --
    // items landed at maxDur - 1, the live-tick sweep then bumped
    // them back to maxDur - inertThreshold a couple of ticks later,
    // but to the player the post-respawn item read as fully broken.
    //
    // hurtAndBreak still runs Unbreaking probability inside, which
    // is the design choice from 2026-05-09 -- Unbreaking
    // proportionally reduces post-cap damage, stacking
    // multiplicatively with Soulbound.
    let inertThreshold = INERT_THRESHOLD
    let inertCeiling = maxDur - inertThreshold
    let preDamage = stack.damageValue
    let allowedLoss = Math.max(0, inertCeiling - preDamage)
    let cappedLoss = Math.min(durLoss, allowedLoss)

    // Diagnostic: tester reports items still landing past the inert
    // ceiling after death. Math says cappedLoss can't push past, so
    // either (a) the actual hurtAndBreak applies more damage than
    // requested (mixin / Tetra clamp not firing for KubeJS-initiated
    // calls), (b) stack.maxDamage / damageValue read off (Tetra
    // dynamic durability vs cached value), or (c) some other handler
    // runs after this and pushes further. Log per-slot before/after
    // so the next test session reveals which case it is.
    let itemId = String(stack.item.id)
    console.log('[death-pen] ' + itemId
              + ' max=' + maxDur
              + ' pre=' + preDamage
              + ' durLoss=' + durLoss
              + ' ceiling=' + inertCeiling
              + ' allowed=' + allowedLoss
              + ' capped=' + cappedLoss)

    if (cappedLoss <= 0) {
      // Already at / past the inert ceiling. No further damage to
      // apply, but make sure the broken tag is set so the live-tick
      // inert-state effects stay armed.
      if (!stack.nbt) stack.nbt = {}
      stack.nbt.putBoolean(BROKEN_TAG, true)
      console.log('[death-pen]   skip hurtAndBreak (already past ceiling), tagged broken')
      return
    }

    // Route the capped amount through hurtAndBreak so the mixin
    // clamp + Tetra's clamp + Unbreaking all run as designed.
    // Empty onBroken consumer: the clamps prevent destruction, so
    // the break callback can't fire. If Vanilla.hurt() ever returns
    // true (regression in either clamp), the consumer is a no-op
    // rather than broadcasting a false break event.
    stack.hurtAndBreak(cappedLoss, player, function (e) {})

    let postDamage = stack.damageValue
    let actualDelta = postDamage - preDamage
    console.log('[death-pen]   post=' + postDamage
              + ' delta=' + actualDelta
              + (postDamage > inertCeiling ? ' OVERSHOT_CEILING' : '')
              + (postDamage >= maxDur ? ' AT_OR_PAST_MAXDUR' : ''))

    // Tag broken if the post-clamp damage crosses the inert
    // threshold so the live-tick checks (zero attack damage,
    // mining cancellation, right-click block) activate.
    if (postDamage >= inertCeiling) {
      if (!stack.nbt) stack.nbt = {}
      stack.nbt.putBoolean(BROKEN_TAG, true)
    }
  }

  // Process armor slots
  ARMOR_SLOTS.forEach(slot => {
    let armorItem = player.getEquipment(slot)
    applyDurabilityLoss(armorItem, lossPct)
    player.setEquipment(slot, armorItem)
  })

  // Process mainhand
  let mainhand = player.mainHandItem
  applyDurabilityLoss(mainhand, lossPct)
  player.setItemSlot('mainhand', mainhand)

  // Process offhand
  let offhand = player.offHandItem
  applyDurabilityLoss(offhand, lossPct)
  player.setItemSlot('offhand', offhand)

  // Notify player
  let dimName = dimId.split(':')[1].replace(/_/g, ' ')
  let pctDisplay = Math.round(lossPct * 100)
  player.tell(Text.red(`☠ Death penalty: ${pctDisplay}% durability loss (${dimName})`))
}))


// =============================================================================
// SECTION 2: ITEM BREAK PREVENTION — Items never actually break
// Cancel the vanilla item-destroyed event and mark as inert instead.
// =============================================================================

ItemEvents.canPickUp(icraft.guard('death_penalty', 'ItemEvents.canPickUp', event => {
  // This doesn't directly help — we need to intercept durability reaching 0.
  // The main protection is in the death handler above (clamping to maxDamage).
}))

// Prevent items from breaking during normal use too
// Vanilla destroys items the instant damageValue >= maxDamage inside
// ItemStack.hurtAndBreak(). A poll-based approach can only catch items
// BEFORE they reach that threshold. We check every 2 ticks (0.1s) and
// intercept items at maxDamage-20 (20 durability remaining), clamping
// them there and tagging as broken. The 20-point margin handles rapid
// multi-hit scenarios (sweeping edge, mob swarms, multi-durability enchants)
// where 5-15 durability can drain in a single tick.
//
// 2026-04-24: originally only scanned armor + mainhand + offhand. Tester
// reported items still shattering — the hotbar (slots 0-8 other than the
// currently-held one), the main inventory (slots 9-35), and Curios slots
// weren't being scanned. Added the broader sweep as `tick_durabilityFullSweep`
// below at a 10-tick cadence (every 0.5s), which covers everything the
// 2-tick fast path misses. Items in Curios slots reach here via CuriosApi
// unified handler iteration.
//
// 2026-04-29: tester reported armor STILL shattering. Root cause: a 20-dur
// buffer is too small. Vanilla's ItemStack.hurtAndBreak() runs synchronously
// inside LivingEntity.hurt(), so a single boss hit dealing 25+ durability
// damage to a piece (Apotheosis affixes, Cataclysm bursts, Mahou Tsukai
// effects can do this) crosses from "safe" past maxDamage in one frame —
// our 2-tick poll arrives after the item is already destroyed.
// Originally bumped to 100 to give a generous tick-poll buffer.
//
// 2026-05-19: lowered to 1, mirroring Tetra's modular-item clamp at
// maxDamage-1 (the "1 dura remaining" inert state). The 100-buffer made
// armor go inert at HALF durability for any item with maxDamage >= 200
// and earlier for shorter-life items, which surprised testers with
// `apotheosis:durable` rolls who expected their gear to live longer.
// The ItemStackHurtAndBreakMixin already pins single-hit damage at
// maxDamage-1 synchronously inside vanilla's hurtAndBreak (see
// iridescent-durability-clamp mod), so a 1-buffer is safe against
// burst damage too — the mixin catches the burst, the script's
// 2-tick poll catches anything the mixin didn't (none in practice,
// but kept as belt-and-suspenders).
const INERT_THRESHOLD = 1

// Mods that already have native "broken but in inventory" handling. Our
// clamp + icraft_broken tag would collide with their own damaged-beyond-
// repair state, so we skip these namespaces entirely and let the mod's
// own logic run.
//   - tetra: modular weapons have a built-in durability-protection state;
//     our clamp would trigger before Tetra's threshold and double-stamp.
// Extend this list if other mods surface with the same collision.
const NATIVE_BREAK_PROTECTION_NS = ['tetra:']

function hasNativeBreakProtection(stack) {
  const id = String(stack.item.id)
  for (let i = 0; i < NATIVE_BREAK_PROTECTION_NS.length; i++) {
    if (id.indexOf(NATIVE_BREAK_PROTECTION_NS[i]) === 0) return true
  }
  return false
}

function checkAndMarkBroken(stack) {
  if (stack.isEmpty() || !stack.isDamageableItem()) return false
  if (hasNativeBreakProtection(stack)) return false
  // 2026-05-19: was Math.min(INERT_THRESHOLD, floor(max * 0.5)). The
  // half-max safety clamp was pinning long-life armor (e.g. maxDamage 200+)
  // at half durability, which hid the `apotheosis:durable` affix's benefit.
  // Now mirrors Tetra: pin at maxDamage - 1 = 1 dura remaining.
  var threshold = INERT_THRESHOLD
  if (stack.damageValue < stack.maxDamage - threshold) return false

  // Past threshold -- clamp AND (re-)mark broken.
  //
  // 2026-04-24 bugfix: previous version only returned true on first-time
  // tag (when nbt was null or broken flag wasn't set yet). Tester observed
  // the clamp working but broken tooltip never appearing + item still
  // usable. Root cause: once tagged on tick N, subsequent ticks re-clamped
  // damageValue (which KubeJS writes through) but returned false, so
  // callers skipped setItem() / setItemSlot(). Vanilla only marks a slot
  // dirty for client-sync when setItem fires; pure in-place mutation of
  // a retrieved stack doesn't broadcast. Result: server had the NBT, the
  // client never saw it, and the server-side effect handlers may have
  // been reading a round-tripped stack the client reported back minus
  // the tag. Fix: return true whenever the stack's state isn't already
  // stable (damage at exact clamp + broken tag set), so the setItem
  // always fires on transitions but idle stable items don't re-sync
  // every 2 ticks.
  var targetDamage = stack.maxDamage - threshold
  var alreadyTagged = stack.nbt && stack.nbt.getBoolean(BROKEN_TAG)
  var stable = (stack.damageValue === targetDamage) && alreadyTagged
  if (stable) return false

  stack.damageValue = targetDamage
  if (!stack.nbt) stack.nbt = {}
  stack.nbt.putBoolean(BROKEN_TAG, true)
  // One-shot log on the state transition so we can verify in tester
  // logs that the sync fires when expected (not every tick).
  console.log('[durability] marked broken: ' + String(stack.item.id))
  return true
}

global.tick_deathPenaltyBrokenCheck = (event) => {
  var player = event.player
  ARMOR_SLOTS.forEach(slot => {
    let item = player.getEquipment(slot)
    if (checkAndMarkBroken(item)) {
      player.setEquipment(slot, item)
    }
  })

  let mh = player.mainHandItem
  if (checkAndMarkBroken(mh)) player.setItemSlot('mainhand', mh)

  let oh = player.offHandItem
  if (checkAndMarkBroken(oh)) player.setItemSlot('offhand', oh)
}
global.registerPlayerTick('tick_deathPenaltyBrokenCheck', 2, 0)

// Proactive synchronous clamp on the hurt event itself.
// 2026-04-29: even with a 100-durability buffer, a single boss hit dealing
// 200+ raw damage drops each armor piece's durability by 50+ (vanilla
// `hurtArmor` formula = max(1, floor(damage / 4)) per piece). With
// buffer=100, a 401+ raw damage hit could still skip the buffer in one
// frame. Vanilla calls `LivingEntity.hurtArmor` AFTER the LivingHurt event
// fires (which is what KubeJS EntityEvents.hurt hooks). So if we predict
// the upcoming durability loss here and pre-clamp any armor that would
// cross maxDamage, the about-to-run vanilla durability subtraction lands
// in safe territory rather than synchronously breaking the item.
// On the raw Forge LivingHurtEvent. This handler READS damage to predict the
// upcoming durability tick; it doesn't modify damage. event.amount (not
// event.damage) on the raw event.
//
// It runs on the shared dispatcher of 0_lib_core.js, at the place it had while it
// sat straight on the Java damage registry (until 2026-10-13). That registry runs
// its entries in the HASH order of their keys: the clamp ran after the dispatcher's
// handlers, after the startup script's deathskin bonus and after the Blazeborn
// BONUS of an attacking player, and before Arcane Cleave, the unique-weapon
// multiplier, the class passives and the Enderian bonus. So the amount it reads is
// not the final one: what runs after it (a unique sword's x1.2, an Ender Shift's
// x1.15) is not in its prediction. `place: 'last'` holds that place; the order
// inside it is the library's list PLACED.
// `secondary`: it also runs for secondary damage (thorns, a splash), as it did:
// armour loses durability to those hits too. A hit an earlier handler cancelled ends
// before it (ruling 11, 2026-10-14, decision list entry 66; a cancelled hit takes no
// durability). `unchecked`: called as the registry called it. An option taken off, or
// added, changes which hits clamp:
// decision list entry 45; the hit table is dev/engine-tests, suite `hit-table`.
// MEASURED there and on the full pack, and NOT changed (decision list Part 9):
// `safe` below is clampPos - perPiece: the piece is given back, in advance, what
// the handler expects vanilla to take from it next, so that it ends at the clamp.
// A chestplate at 236 of 240 reads 230 after the handler for a hit of 36, and 14
// for a hit of 900. The handler does not ask whether vanilla WILL take it. By
// vanilla's code (not measured: a stand-in player cannot be hurt) a damage type
// that bypasses armour takes no durability at all (a fall, magic, starvation,
// freezing, a sonic boom), so such a hit leaves the piece with less damage than
// it had; and what vanilla takes is a quarter of the FINAL amount, which the
// handlers that run after this one may still raise.
;(function(){
  if (!icraft.lib.need('core', 'death_penalty')) return
  var PlayerClass_dpa = Java.loadClass('net.minecraft.world.entity.player.Player')
  global.icraft.core.onHurt('icraft.death_penalty.armor_clamp', function(event) {
    try {
      var player = event.entity
      if (!(player instanceof PlayerClass_dpa)) return
      var dmg = event.amount
      if (!dmg || dmg <= 0) return
      var perPiece = Math.max(1, Math.floor(dmg / 4))

      ARMOR_SLOTS.forEach(function(slot) {
        try {
          var stack = player.getEquipment(slot)
          if (!stack || stack.isEmpty() || !stack.isDamageableItem()) return
          if (hasNativeBreakProtection(stack)) return
          var maxDur = stack.maxDamage
          if (maxDur <= 0) return
          var threshold = INERT_THRESHOLD
          var clampPos = maxDur - threshold
          if (stack.damageValue + perPiece >= clampPos) {
            var safe = Math.max(0, clampPos - perPiece)
            if (stack.damageValue !== safe) {
              stack.damageValue = safe
            }
            if (!stack.nbt) stack.nbt = {}
            stack.nbt.putBoolean(BROKEN_TAG, true)
            player.setEquipment(slot, stack)
          }
        } catch (e) {}
      })
    } catch (e) {
      console.warn('[durability] proactive armor clamp threw: ' + e)
    }
  }, 'victimPlayer', { place: 'last', secondary: true, unchecked: true })
})()

// Slower full-inventory + Curios sweep. Catches damageable items that aren't
// in the player's actively-equipped slots (hotbar slots other than the held
// one, main inventory, Curios trinkets). Uses Java.loadClass for the Curios
// API because KubeJS doesn't expose it directly. Guarded so Curios absence
// (shouldn't happen in this pack, but still) doesn't break the rest of the
// sweep.
let CuriosApi_durability = null
try {
  CuriosApi_durability = Java.loadClass('top.theillusivec4.curios.api.CuriosApi')
} catch (e) {
  console.warn('[durability] Curios API not loadable: ' + e + '  -- curios slots will not be scanned')
}

// Rhino (KubeJS 6) rejects const/let inside try blocks that re-run each
// tick as "redeclaration of var X" after the first successful call. This
// function is invoked every 10 ticks per player, so every local inside it
// must be declared with `var`, not `const`/`let`. See memory:
// feedback_wiki_reference.md, project_biome_cycle_audit.md.
global.tick_durabilityFullSweep = function(event) {
  var player = event.player

  // --- Vanilla inventory (all 36 slots: hotbar 0-8 + main 9-35) ---
  try {
    var inv = player.inventory
    var size = inv.containerSize
    for (var i = 0; i < size; i++) {
      var item = inv.getItem(i)
      if (checkAndMarkBroken(item)) {
        inv.setItem(i, item)
        console.log('[durability] clamped ' + item.item.id + ' (slot ' + i + ') for ' + player.username)
      }
    }
  } catch (e) {
    console.warn('[durability] inventory sweep threw for ' + player.username + ': ' + e)
  }

  // --- Curios slots ---
  if (!CuriosApi_durability) return
  try {
    // CuriosApi.getCuriosInventory returns LazyOptional, not Optional --
    // LazyOptional.get() does not exist in Forge 1.20.1. Use orElse(null)
    // which is the canonical "resolve or null" pattern. isPresent() works
    // on LazyOptional fine.
    var opt = CuriosApi_durability.getCuriosInventory(player)
    if (!opt || !opt.isPresent()) return
    var handler = opt.orElse(null)
    if (!handler) return
    var equipped = handler.getEquippedCurios()   // IItemHandlerModifiable
    if (!equipped) return
    var slots = equipped.getSlots()
    for (var ci = 0; ci < slots; ci++) {
      var citem = equipped.getStackInSlot(ci)
      if (checkAndMarkBroken(citem)) {
        equipped.setStackInSlot(ci, citem)
        console.log('[durability] clamped curio ' + citem.item.id + ' (slot ' + ci + ') for ' + player.username)
      }
    }
  } catch (e) {
    console.warn('[durability] curios sweep threw for ' + player.username + ': ' + e)
  }
}
global.registerPlayerTick('tick_durabilityFullSweep', 10, 0)


// =============================================================================
// SECTION 3: BROKEN ITEM EFFECTS — Inert items provide no stats
// When an item has the icraft_broken NBT tag:
//   - Weapons: 0 attack damage (override via attribute modifier)
//   - Armor: 0 armor value
//   - Tools: cannot mine
// =============================================================================

// Helper: check current damage against the live INERT_THRESHOLD. If the
// icraft_broken tag was stamped under an older (looser) threshold but the
// item's actual durability is now above the inert pin point, the tag is
// stale -- clear it and let the action proceed. Prevents the 2026-05-19
// INERT_THRESHOLD 100 -> 1 migration from stranding mid-durability tools
// in a broken state that the PlayerEvents.inventoryChanged repair handler
// only clears on slot/inventory motion (which never fires while the
// player keeps mining with the same tool).
function isGenuinelyInert(stack) {
  if (!stack || stack.isEmpty() || !stack.nbt || !stack.isDamageableItem()) return false
  if (!stack.nbt.getBoolean(BROKEN_TAG)) return false
  let inertPin = stack.maxDamage - INERT_THRESHOLD
  if (stack.damageValue >= inertPin) return true  // still at/past pin
  // Tag is stale -- item is healthier than the current threshold
  stack.nbt.remove(BROKEN_TAG)
  return false
}

// One chat line per player per 5 s, whichever of the three "it is broken"
// handlers below fires (mining / hitting / using all repeat every few ticks).
// In-memory on purpose: nothing here needs to survive a restart.
var brokenNoticeAt = {}   // uuid -> game time of the last notice
var brokenNotice = function (player, message) {
  try {
    var core = global.icraft && global.icraft.core
    var now = core ? core.now(player) : 0
    var key = String(player.uuid)
    var last = brokenNoticeAt[key]
    if (last !== undefined && now >= last && (now - last) < 100) return
    brokenNoticeAt[key] = now
    player.tell(Text.gray(message))
  } catch (e) {}
}
PlayerEvents.loggedOut(icraft.guard('death_penalty', 'PlayerEvents.loggedOut', event => {
  try { delete brokenNoticeAt[String(event.player.uuid)] } catch (e) {}
}))

// Prevent broken tools from mining.
// The notice goes out BEFORE cancel(): cancel() leaves the handler by
// throwing, so the tell() that used to follow it was never reached.
BlockEvents.broken(icraft.guard('death_penalty', 'BlockEvents.broken', event => {
  if (!event.player) return
  var heldItem = event.player.mainHandItem
  if (isGenuinelyInert(heldItem)) {
    brokenNotice(event.player, 'Your tool is broken and cannot mine. Repair it at an anvil.')
    event.cancel()
  }
}))

// Prevent broken weapons from dealing damage. Via DamageModifierRegistry.
// 2026-10-10: this never ran -- it read `event.source.entity`, which scripts
// do not have (0_lib_core.js header), so a broken sword hit for full damage.
// It also set the hit to 1.0 rather than to nothing. Now: a direct (melee)
// hit from a player whose main-hand item is genuinely inert deals 0 and the
// hurt event is cancelled. Projectiles and spells already in flight are left
// alone (a broken bow / staff cannot be used: see rightClicked below).
;(function(){
  // This block needs the core library. A missing one is said ONCE, for every
  // script that asks (icraft.lib, 00_icraft_guard.js), not by each script.
  if (!icraft.lib.need('core', 'death_penalty')) return
  var core = global.icraft.core
  core.onHurt('icraft.death_penalty.broken_weapon', function(event, ctx) {
    var player = ctx.attacker
    if (core.direct(ctx.source) !== player) return
    if (!isGenuinelyInert(player.mainHandItem)) return
    event.amount = 0
    event.setCanceled(true)
    brokenNotice(player, 'Your weapon is broken and deals no damage. Repair it at an anvil.')
  }, 'attackerPlayer')
})()

// Prevent broken items from being used (right-click actions)
ItemEvents.rightClicked(icraft.guard('death_penalty', 'ItemEvents.rightClicked', event => {
  var stack = event.item
  if (isGenuinelyInert(stack)) {
    if (event.player) brokenNotice(event.player, 'This item is broken. Repair it at an anvil.')
    event.cancel()
  }
}))


// =============================================================================
// SECTION 4: REPAIR HANDLER — Removing the broken tag on repair
// When a broken item is repaired at an anvil (durability restored above 0),
// automatically remove the broken tag.
// =============================================================================

// Check repaired items periodically — if an item has the broken tag but
// durability > 0, it was repaired. Remove the tag.
PlayerEvents.inventoryChanged(icraft.guard('death_penalty', 'PlayerEvents.inventoryChanged', event => {
  var stack = event.item
  if (!stack.isEmpty() && stack.nbt && stack.nbt.getBoolean(BROKEN_TAG) && stack.isDamageableItem()) {
    // Small repair buffer — once damageValue dips at least 5 below the
    // pin point (maxDamage - INERT_THRESHOLD), the player has visibly
    // repaired the item, so clear the broken tag.
    let repairThreshold = INERT_THRESHOLD + 5
    if (stack.damageValue < stack.maxDamage - repairThreshold) {
      // Item has been repaired past the inert threshold — remove broken tag
      stack.nbt.remove(BROKEN_TAG)
    }
  }
}))

// Login sweep -- scrub stale icraft_broken tags that were stamped under
// an older (looser) INERT_THRESHOLD. Without this, items in the player's
// hotbar that haven't moved slots since the 2026-05-19 threshold change
// (100 -> 1) stay tagged broken even though their actual durability is
// far above the new inert pin. PlayerEvents.inventoryChanged only fires
// on inventory motion, so a player who keeps using the same pickaxe never
// triggers the per-item repair handler. The sweep covers every slot once
// at login, the per-action isGenuinelyInert() helper handles the rest.
PlayerEvents.loggedIn(icraft.guard('death_penalty', 'PlayerEvents.loggedIn', event => {
  var player = event.player
  if (!player) return
  var cleared = 0
  var inv = player.inventory
  // player.inventory has no size() — it was throwing "Cannot find function size"
  // every login, so this sweep never ran. getContainerSize()+getStackInSlot() is
  // the established working idiom (spell_book_transfer / strip_infinity_ham).
  // var-only avoids Rhino's block-scope redeclaration bug on re-login now that
  // the loop body actually executes.
  for (var i = 0; i < inv.getContainerSize(); i++) {
    var stack = inv.getStackInSlot(i)
    if (stack.isEmpty() || !stack.nbt || !stack.isDamageableItem()) continue
    if (!stack.nbt.getBoolean(BROKEN_TAG)) continue
    var inertPin = stack.maxDamage - INERT_THRESHOLD
    if (stack.damageValue < inertPin) {
      stack.nbt.remove(BROKEN_TAG)
      cleared += 1
    }
  }
  if (cleared > 0) {
    console.log('[death_penalty] cleared ' + cleared + ' stale icraft_broken tag(s) on login for ' + player.name.string)
  }
}))


// =============================================================================
// SECTION 5: TOOLTIP — Show broken status
// Add "(Broken)" to broken item tooltips with red text.
// =============================================================================

// NOTE: Tooltip rendering moved to client_scripts/broken_tooltip.js
// ItemEvents.tooltip is a client-side event and cannot run in server_scripts


// =============================================================================
// SECTION 6: GAMERULE — Ensure keepInventory is always on
// =============================================================================

ServerEvents.loaded(icraft.guard('death_penalty', 'ServerEvents.loaded', event => {
  event.server.gameRules.get('keepInventory').set(true, event.server)
  console.log('[IridescentCraft] keepInventory enabled — death penalty handles consequences')
}))
})()
