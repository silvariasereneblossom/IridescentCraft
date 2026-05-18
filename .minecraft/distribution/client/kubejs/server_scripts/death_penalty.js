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
//   The Abyss: 18%     Nether: 20%       Deep Aether: 22%
//   The End: 25%
//
// Soulbound (Ensorcellation, repurposed):
//   I: 50% reduction    II: 75% reduction    III: 100% (no loss)
// =============================================================================

// ---- CONSTANTS ----

const DIMENSION_DURABILITY_LOSS = {
  'minecraft:overworld':                0.10,
  'twilightforest:twilight_forest':     0.12,
  'blue_skies:everbright':              0.14,
  'blue_skies:everdawn':                0.14,
  'aether:the_aether':                  0.15,
  'undergarden:undergarden':            0.17,
  'deeperdarker:otherside':             0.18,
  'theabyss:the_abyss':                 0.18,
  'minecraft:the_nether':               0.20,
  'deep_aether:the_aether':             0.22,
  'minecraft:the_end':                  0.25,
  // Ad Astra Planets (Post-T4 Endgame)
  'ad_astra:moon':                      0.22,
  'ad_astra:mars':                      0.25,
  'ad_astra:mercury':                   0.27,
  'ad_astra:venus':                     0.28,
  'ad_astra:glacio':                    0.30
}

// Fallback for unrecognized dimensions
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

EntityEvents.death(event => {
  // Unconditional entry log so we can confirm the handler fires at all.
  // 8 player deaths in the 14:31 session produced no [death-pen] lines
  // despite the script loading and ServerEvents.loaded firing -- which
  // means either this handler doesn't fire for player deaths, or the
  // `event.entity.player` filter below rejects the player. Top trace
  // distinguishes the two cases.
  try {
    var deathEntity = event.entity
    var entityType = deathEntity ? String(deathEntity.type) : 'null'
    var isPlayerCheck = deathEntity ? String(deathEntity.player) : 'no-entity'
    var hasEventPlayer = false
    try { hasEventPlayer = !!event.player } catch (_) {}
    console.log('[death-event] fired entity.type=' + entityType
              + ' entity.player=' + isPlayerCheck
              + ' event.player=' + hasEventPlayer)
  } catch (e) {
    try { console.log('[death-event] entry-log threw: ' + e) } catch (_) {}
  }

  // Player filter -- accept either the legacy `entity.player` truthy-
  // boolean form or the documented `event.player` getter form. Keep
  // both so we work regardless of which path KubeJS exposes.
  var player = null
  try {
    if (event.player) player = event.player
    else if (event.entity && event.entity.player) player = event.entity
  } catch (_) {}
  if (!player) {
    console.log('[death-event] no player resolved -- skipping')
    return
  }

  const dimId = (function () {
    try { return String(player.level.dimension().location()) } catch (_) {}
    try { return String(player.level.dimension) } catch (_) {}
    try { return String(player.level.dimension.toString()) } catch (_) {}
    return 'unknown'
  })()

  // Get loss percentage for this dimension
  let lossPct = DIMENSION_DURABILITY_LOSS[dimId] || DEFAULT_LOSS

  // --- Check Soulbound on each item individually ---
  // We process armor slots + mainhand + offhand

  // Helper: apply durability loss to one item
  function applyDurabilityLoss(stack, slotLossPct) {
    if (stack.isEmpty()) return
    if (!stack.isDamageableItem()) return

    // Check Soulbound level on THIS item
    let soulboundLevel = 0
    const enchants = stack.enchantments
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
      const enchList = stack.nbt.getList('Enchantments', 10)  // 10 = compound tag
      if (enchList) {
        for (let i = 0; i < enchList.size(); i++) {
          const ench = enchList.getCompound(i)
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
    let inertThreshold = Math.min(100, Math.floor(maxDur * 0.5))
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
})


// =============================================================================
// SECTION 2: ITEM BREAK PREVENTION — Items never actually break
// Cancel the vanilla item-destroyed event and mark as inert instead.
// =============================================================================

ItemEvents.canPickUp(event => {
  // This doesn't directly help — we need to intercept durability reaching 0.
  // The main protection is in the death handler above (clamping to maxDamage).
})

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
// Bumped to 100 — covers any reasonable single-hit durability burst, while
// still letting players use most of an item's durability before going inert.
const INERT_THRESHOLD = 100

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
  var threshold = Math.min(INERT_THRESHOLD, Math.floor(stack.maxDamage * 0.5))
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
  const player = event.player
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
// 2026-05-15: migrated to DamageModifierRegistry (raw LivingHurtEvent).
// This handler READS damage to predict the upcoming durability tick; it
// doesn't modify damage. event.amount (not event.damage) on the raw event.
;(function(){
  var DR_dpa = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
  var PlayerClass_dpa = Java.loadClass('net.minecraft.world.entity.player.Player')
  DR_dpa.register('icraft.death_penalty.armor_clamp', function(event) {
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
          var threshold = Math.min(INERT_THRESHOLD, Math.floor(maxDur * 0.5))
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
  })
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

// Prevent broken tools from mining
BlockEvents.broken(event => {
  const heldItem = event.player.mainHandItem
  if (!heldItem.isEmpty() && heldItem.nbt && heldItem.nbt.getBoolean(BROKEN_TAG) && heldItem.isDamageableItem()) {
    event.cancel()
    event.player.tell(Text.gray('Your tool is broken and cannot mine. Repair it at an anvil.'))
  }
})

// Prevent broken weapons from dealing damage. Via DamageModifierRegistry.
;(function(){
  var DR_dpw = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
  var PlayerClass_dpw = Java.loadClass('net.minecraft.world.entity.player.Player')
  DR_dpw.register('icraft.death_penalty.broken_weapon', function(event) {
    var player = event.source.entity
    if (!(player instanceof PlayerClass_dpw)) return
    var weapon = player.mainHandItem
    if (!weapon.isEmpty() && weapon.nbt && weapon.nbt.getBoolean(BROKEN_TAG) && weapon.isDamageableItem()) {
      event.amount = 1.0
    }
  })
})()

// Prevent broken items from being used (right-click actions)
ItemEvents.rightClicked(event => {
  const stack = event.item
  if (!stack.isEmpty() && stack.nbt && stack.nbt.getBoolean(BROKEN_TAG) && stack.isDamageableItem()) {
    event.cancel()
    event.player.tell(Text.gray('This item is broken. Repair it at an anvil.'))
  }
})


// =============================================================================
// SECTION 4: REPAIR HANDLER — Removing the broken tag on repair
// When a broken item is repaired at an anvil (durability restored above 0),
// automatically remove the broken tag.
// =============================================================================

// Check repaired items periodically — if an item has the broken tag but
// durability > 0, it was repaired. Remove the tag.
PlayerEvents.inventoryChanged(event => {
  const stack = event.item
  if (!stack.isEmpty() && stack.nbt && stack.nbt.getBoolean(BROKEN_TAG) && stack.isDamageableItem()) {
    let repairThreshold = Math.min(20, Math.floor(stack.maxDamage * 0.5))
    if (stack.damageValue < stack.maxDamage - repairThreshold) {
      // Item has been repaired past the inert threshold — remove broken tag
      stack.nbt.remove(BROKEN_TAG)
    }
  }
})


// =============================================================================
// SECTION 5: TOOLTIP — Show broken status
// Add "(Broken)" to broken item tooltips with red text.
// =============================================================================

// NOTE: Tooltip rendering moved to client_scripts/broken_tooltip.js
// ItemEvents.tooltip is a client-side event and cannot run in server_scripts


// =============================================================================
// SECTION 6: GAMERULE — Ensure keepInventory is always on
// =============================================================================

ServerEvents.loaded(event => {
  event.server.gameRules.get('keepInventory').set(true, event.server)
  console.log('[IridescentCraft] keepInventory enabled — death penalty handles consequences')
})
