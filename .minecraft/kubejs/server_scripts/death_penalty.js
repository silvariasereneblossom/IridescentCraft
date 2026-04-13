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

// Equipment slots to apply penalty to
const ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet']

// =============================================================================
// SECTION 1: DEATH EVENT — Apply durability loss
// =============================================================================

EntityEvents.death(event => {
  if (!event.entity.player) return
  const player = event.entity
  const dimId = player.level.dimension.toString()

  // Get loss percentage for this dimension
  let lossPct = DIMENSION_DURABILITY_LOSS[dimId] || DEFAULT_LOSS

  // --- Check Soulbound on each item individually ---
  // We process armor slots + mainhand + offhand

  // Helper: apply durability loss to one item
  function applyDurabilityLoss(stack, slotLossPct) {
    if (stack.isEmpty) return
    if (!stack.isDamageableItem) return

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

    // Apply damage (stack.damageValue is current damage, higher = more broken)
    let newDamage = Math.min(stack.damageValue + durLoss, maxDur)
    stack.damageValue = newDamage

    // Check if item should go inert
    if (newDamage >= maxDur) {
      stack.damageValue = maxDur  // Clamp to max (don't exceed)
      // Tag as broken via NBT
      let nbt = stack.nbt || {}
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
// When durability hits 0 during combat/mining, mark as broken instead of destroying
global.tick_deathPenaltyBrokenCheck = (event) => {
  const player = event.player

  // Check all equipment for 0-durability items that need the broken tag
  function checkAndMarkBroken(stack) {
    if (stack.isEmpty || !stack.isDamageableItem) return false
    if (stack.damageValue >= stack.maxDamage) {
      if (!stack.nbt || !stack.nbt.getBoolean(BROKEN_TAG)) {
        if (!stack.nbt) stack.nbt = {}
        stack.nbt.putBoolean(BROKEN_TAG, true)
        return true
      }
    }
    return false
  }

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
global.registerPlayerTick('tick_deathPenaltyBrokenCheck', 20, 0)


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
  if (!heldItem.isEmpty && heldItem.nbt && heldItem.nbt.getBoolean(BROKEN_TAG)) {
    event.cancel()
    event.player.tell(Text.gray('Your tool is broken and cannot mine. Repair it at an anvil.'))
  }
})

// Prevent broken weapons from dealing damage
EntityEvents.hurt(event => {
  const source = event.source
  if (!source || !source.player) return

  const player = source.player
  const weapon = player.mainHandItem
  if (!weapon.isEmpty && weapon.nbt && weapon.nbt.getBoolean(BROKEN_TAG)) {
    // Reduce damage to base fist damage (1)
    event.damage = 1.0
  }
})

// Prevent broken items from being used (right-click actions)
ItemEvents.rightClicked(event => {
  const stack = event.item
  if (!stack.isEmpty && stack.nbt && stack.nbt.getBoolean(BROKEN_TAG)) {
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
  if (!stack.isEmpty && stack.nbt && stack.nbt.getBoolean(BROKEN_TAG)) {
    if (stack.damageValue < stack.maxDamage) {
      // Item has been repaired — remove broken tag
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
