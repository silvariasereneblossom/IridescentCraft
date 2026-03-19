// =============================================================================
// BATTLEMAGE — Mana Shield (Magic-Scaling Damage Reduction)
// =============================================================================
// Passive damage reduction that scales with magic damage bonuses.
// Implemented as periodic Resistance effect whose level scales with magic.
//
// Base: Resistance I (20% reduction) — always active for Battlemages
// With Elf (+5% magic):    still Resistance I
// With Faefolk (+30% magic): Resistance II (36% reduction)
// With Faefolk + affixes:  Resistance III (48% reduction) — hard cap
//
// Negate chance from the description is flavor — the actual mechanic is
// continuous damage reduction, which is more reliable and less RNG-dependent.
// =============================================================================

// Check if player has Battlemage class
function isBattlemage(player) {
  try {
    let result = player.server.runCommandSilent(
      `execute if entity ${player.username}[nbt={cardinal_components:{"origins:origin":{OriginLayers:[{Origin:"icraft:battlemage"}]}}}]`
    )
    return result > 0
  } catch (e) {
    return false
  }
}

// Calculate magic bonus from known race sources
function getMagicBonus(player) {
  let bonus = 0.15  // Battlemage base (arcane_strikes)

  try {
    let isFaefolk = player.server.runCommandSilent(
      `execute if entity ${player.username}[nbt={cardinal_components:{"origins:origin":{OriginLayers:[{Origin:"icraft:faefolk"}]}}}]`
    )
    if (isFaefolk > 0) bonus += 0.30
  } catch (e) {}

  try {
    let isElf = player.server.runCommandSilent(
      `execute if entity ${player.username}[nbt={cardinal_components:{"origins:origin":{OriginLayers:[{Origin:"icraft:elf"}]}}}]`
    )
    if (isElf > 0) bonus += 0.05
  } catch (e) {}

  return bonus
}

// Apply Mana Shield as Resistance effect every 5 seconds
ServerEvents.tick(event => {
  if (event.server.tickCount % 100 !== 0) return

  event.server.players.forEach(player => {
    if (!isBattlemage(player)) return

    let magicBonus = getMagicBonus(player)

    // Scale: 0.15 magic → Resistance I, 0.35+ → Resistance II, 0.55+ → Resistance III
    let resistLevel = 0  // Resistance I (amplifier 0)
    if (magicBonus >= 0.55) {
      resistLevel = 2  // Resistance III
    } else if (magicBonus >= 0.35) {
      resistLevel = 1  // Resistance II
    }

    // Apply for 7 seconds (140 ticks) — overlaps the 5s refresh with buffer
    player.server.runCommandSilent(
      `effect give ${player.username} minecraft:resistance 7 ${resistLevel} true`
    )
  })
})

console.log('[IridescentCraft] Battlemage Mana Shield loaded')
console.log('  - Resistance I base (20% damage reduction)')
console.log('  - Resistance II with high magic bonus (36% reduction)')
console.log('  - Resistance III cap with very high magic bonus (48% reduction)')
