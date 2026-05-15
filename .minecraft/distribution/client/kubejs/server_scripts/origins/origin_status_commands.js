// =============================================================================
// /icraft witch_status + /icraft construct_status -- origin progression dump
// =============================================================================
// Per-player progression readout for the two hyperscaling custom origins.
// Both commands are self-service (no permission gate) -- a player should
// always be able to check their own counter / level / capstone state.
//
// Witch of Ink:
//   - Current boss counter (max 200)
//   - Current per-counter bonuses (damage %, toughness)
//   - Penthesilea capstone state + capstone bonus values
//
// Artificial Construct:
//   - Total iron consumed
//   - Current level (0-5)
//   - Next threshold + iron remaining
//   - Per-level cumulative bonus
//   - Iron Apotheosis capstone state
// =============================================================================

try {
  var ResourceLocation_osc = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var ForgeRegistries_osc = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')

  function isOriginType(player, originId) {
    try {
      let r = player.server.runCommandSilent(
        `execute if entity ${player.username}[nbt={ForgeCaps:{"origins:origins":{Origins:{"origins:origin":"icraft:${originId}"}}}}]`
      )
      return r > 0
    } catch (e) { return false }
  }

  // ── Witch status ───────────────────────────────────────────────────────
  function dumpWitchStatus(sp) {
    if (!isOriginType(sp, 'witch_of_ink')) {
      sp.tell('§7You are not a Witch of Ink. Progression tracker has no data to display.')
      return
    }
    let data = sp.persistentData
    let count = data.getInt('icraft_witch_ink_counter') || 0
    let hasPenthesilea = data.getBoolean('icraft_witch_penthesilea')

    sp.tell('§6=== Witch of Ink Progression ===')
    sp.tell('§7Boss counter: §f' + count + '§7 / §f200§7  (' + Math.floor(count / 2) + '%)')

    let pct = Math.min(0.20, count * 0.001)
    sp.tell('§7Per-counter damage bonus: §a+' + Math.round(pct * 1000) / 10 + '%§7 (cap +20%)')
    sp.tell('§7Per-counter toughness: §a+' + (count * 0.1).toFixed(1) + '§7 (cap +20)')

    if (hasPenthesilea) {
      sp.tell('§6§lBlessing of Penthesilea§r §a(active)')
      sp.tell('§7  +10% additive damage (total: §a+' + Math.round((pct + 0.10) * 1000) / 10 + '%§7)')
      // Spell power -> AD conversion preview
      let sp_val = 1.0
      try {
        let attr = ForgeRegistries_osc.ATTRIBUTES.getValue(ResourceLocation_osc.tryParse('irons_spellbooks:spell_power'))
        if (attr) {
          let inst = sp.getAttribute(attr)
          if (inst) sp_val = inst.getValue()
        }
      } catch (e) {}
      let spBonus = Math.max(0, sp_val - 1.0) * 0.15
      sp.tell('§7  Spell Power: §f' + Math.round(sp_val * 100) + '%§7  →  §a+' + Math.round(spBonus * 1000) / 10 + '%§7 SP-to-AD')
      let totalDmg = pct + 0.10 + spBonus
      sp.tell('§7  §lEffective total damage: §a+' + Math.round(totalDmg * 1000) / 10 + '%')
      sp.tell('§7  Passive: +15% HP, Haste I, Resistance I, Fire Resist, Regen I')
    } else if (count >= 200) {
      sp.tell('§e(Capstone trigger pending -- relog or kill another boss to apply.)')
    } else {
      sp.tell('§7Capstone Blessing of Penthesilea at §f200§7 (need §f' + (200 - count) + '§7 more counter)')
    }
  }

  // ── Construct status ───────────────────────────────────────────────────
  function dumpConstructStatus(sp) {
    if (!isOriginType(sp, 'artificial_construct')) {
      sp.tell('§7You are not an Artificial Construct. Progression tracker has no data to display.')
      return
    }
    let data = sp.persistentData
    let iron = data.getInt('icraft_construct_iron') || 0
    let level = data.getInt('icraft_construct_level') || 0
    let hasApotheosis = data.getBoolean('icraft_construct_apotheosis')

    let thresholds = [1000, 2000, 4000, 8000, 16000]
    let perLevelPct = [0.05, 0.05, 0.05, 0.10, 0.10]
    let cumulativeAt = function(L) {
      let s = 0; for (let i = 0; i < L; i++) s += perLevelPct[i]; return s
    }

    sp.tell('§6=== Artificial Construct Progression ===')
    sp.tell('§7Iron consumed: §f' + iron)
    sp.tell('§7Forge level: §f' + level + '§7 / §f5§7  (cumulative §a+' + Math.round(cumulativeAt(level) * 100) + '%§7 HP / melee, §a+' + (cumulativeAt(level) * 4).toFixed(1) + '§7 armor / toughness)')

    if (level < 5) {
      let nextThr = thresholds[level]
      let remaining = nextThr - iron
      let nextPct = perLevelPct[level] * 100
      sp.tell('§7Next level: §f' + nextThr + '§7 iron  (§e' + remaining + '§7 remaining, will add §a+' + nextPct + '%§7)')
    } else {
      sp.tell('§eLadder complete (L5).')
    }

    if (hasApotheosis) {
      sp.tell('§6§lIron Apotheosis§r §a(active)')
      sp.tell('§7  +25% HP (total HP: §a+' + Math.round((cumulativeAt(5) + 0.25) * 100) + '%§7)')
      sp.tell('§7  +25% melee damage (total melee: §a+' + Math.round((cumulativeAt(5) + 0.25) * 100) + '%§7)')
      sp.tell('§7  +1 armor toughness (total toughness: §a+' + (cumulativeAt(5) * 4 + 1).toFixed(1) + '§7)')
    } else if (level >= 5) {
      sp.tell('§e(Capstone trigger pending -- eat one more iron to apply.)')
    } else {
      sp.tell('§7Iron Apotheosis capstone unlocks at L5.')
    }
  }

  ServerEvents.commandRegistry(function(event) {
    var Commands = event.commands

    event.register(
      Commands.literal('icraft')
        .then(Commands.literal('witch_status')
          .executes(function(ctx) {
            var sp
            try { sp = ctx.source.getPlayerOrException() } catch (e) {
              ctx.source.sendFailure(Text.of('Must be run as a player'))
              return 0
            }
            dumpWitchStatus(sp)
            return 1
          })
        )
        .then(Commands.literal('construct_status')
          .executes(function(ctx) {
            var sp
            try { sp = ctx.source.getPlayerOrException() } catch (e) {
              ctx.source.sendFailure(Text.of('Must be run as a player'))
              return 0
            }
            dumpConstructStatus(sp)
            return 1
          })
        )
    )
  })

  console.log('[IridescentCraft] /icraft witch_status + /icraft construct_status registered')
} catch (e) {
  console.warn('[IridescentCraft] origin_status_commands bootstrap FAILED: ' + e)
}
