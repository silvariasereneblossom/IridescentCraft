// =============================================================================
// IridescentCraft — Class Respec Station
// File: kubejs/server_scripts/respec/class_respec.js
//
// Design Doc Part III: Respec Rules
//   Race: Permanent. Cannot be changed.
//   Class: Respec-able. Cost: 1 boss drop (tier-appropriate) + 30 XP levels.
//          Can only respec at a specific crafted station (Class Altar).
//   Skills: Respec individual points. 5 levels per point. (Handled by Pufferfish)
//
// Class Altar is a placed block (item form). On right-click:
//   1. Check player has a boss trophy in hand
//   2. Check player has 30+ XP levels
//   3. Consume trophy + levels
//   4. Run /origin set command to re-open class selection
// =============================================================================

// ── Class Altar Recipe: T2+ accessible ──
ServerEvents.recipes(event => {
  // Anvil + boss material + gold = Class Altar
  // Uses generic boss material tag — any tier boss drop works
  event.shaped('icraft:class_altar', [
    'GBG',
    'GAG',
    'OOO'
  ], {
    G: 'minecraft:gold_ingot',
    B: 'icraft:lich_soul',  // T2 boss material (cheapest boss drop)
    A: 'minecraft:anvil',
    O: 'minecraft:obsidian'
  }).id('icraft:class_altar_recipe')

  // Alternative recipes using other tier boss materials
  event.shaped('icraft:class_altar', [
    'GBG',
    'GAG',
    'OOO'
  ], {
    G: 'minecraft:gold_ingot',
    B: 'icraft:harbinger_eye',  // T3 boss material
    A: 'minecraft:anvil',
    O: 'minecraft:obsidian'
  }).id('icraft:class_altar_recipe_t3')

  event.shaped('icraft:class_altar', [
    'GBG',
    'GAG',
    'OOO'
  ], {
    G: 'minecraft:gold_ingot',
    B: 'icraft:dragon_heart',  // T4 boss material
    A: 'minecraft:anvil',
    O: 'minecraft:obsidian'
  }).id('icraft:class_altar_recipe_t4')
})


// ── Class Altar Right-Click Handler ──
// When player right-clicks while holding a boss trophy item + has 30 levels:
// Consume the item + levels, then trigger Origins class re-selection.
ItemEvents.rightClicked(event => {
  let player = event.player
  let item = event.item
  if (!player || !item) return
  if (item.id !== 'icraft:class_altar') return

  // Check for boss trophy in offhand
  let offhand = player.offHandItem
  let validTrophies = [
    'icraft:lich_soul', 'icraft:harbinger_eye', 'icraft:dragon_heart',
    'icraft:dragon_scale', 'icraft:nether_soul_fragment',
    'icraft:condensed_blaze_essence',
    'icraft:twilight_progression_token_t2',
    'icraft:dimensional_progression_token_t3',
    'icraft:reality_progression_token_t4'
  ]

  let hasTrophy = offhand && validTrophies.includes(offhand.id)

  if (!hasTrophy) {
    player.tell('§c§lClass Altar: §r§7Hold a boss trophy in your offhand to respec.')
    player.tell('§7(Any boss material or progression token works)')
    return
  }

  // Check XP levels
  if (player.experienceLevel < 30) {
    player.tell(`§c§lClass Altar: §r§7Requires 30 XP levels. You have ${player.experienceLevel}.`)
    return
  }

  // Consume materials
  offhand.shrink(1)
  player.giveExperienceLevels(-30)

  // Trigger Origins class re-selection
  // Origins mod command: /origin set <player> <layer> <origin>
  // Setting to empty origin forces the selection screen to reopen
  player.server.runCommandSilent(
    `origin set ${player.username} icraft:class icraft:empty`
  )

  // Fallback: if the above doesn't work, try the Origins GUI command
  player.server.runCommandSilent(
    `origin gui ${player.username} icraft:class`
  )

  player.tell('§6§lClass Altar activated! §r§aChoose your new class.')
  player.tell('§7(Cost: 1 boss trophy + 30 XP levels)')
})


// ── Skill Point Respec (Pufferfish's Skills) ──
// Design doc: 5 levels per point refunded
// Pufferfish's Skills has its own respec mechanic.
// If it doesn't support per-point cost, we add a command-based workaround:
// /trigger icraft_respec_skill — costs 5 levels, refunds 1 skill point

ServerEvents.loaded(event => {
  event.server.runCommandSilent('scoreboard objectives add icraft_respec_skill trigger')
})

global.tick_skillRespec = (event) => {
  event.server.players.forEach(player => {
    try {
      let obj = event.server.scoreboard.getObjective('icraft_respec_skill')
      if (!obj) return
      let score = event.server.scoreboard.getOrCreatePlayerScore(player.username, obj)
      if (score.score > 0) {
        if (player.experienceLevel >= 5) {
          player.giveExperienceLevels(-5)
          player.server.runCommandSilent(
            `puffish_skills points add ${player.username} 1`
          )
          player.tell('§a§lSkill point refunded! §r§7(-5 XP levels)')
        } else {
          player.tell('§c§lNot enough XP! §r§7Need 5 levels to refund 1 skill point.')
        }
        score.score = 0
      }
    } catch(e) {}
  })
}
global.registerServerTick('tick_skillRespec', 40, 0)
