// =============================================================================
// kubejs/server_scripts/bonfire/boss_compass_handler.js
//
// Right-click interaction handler for kubejs:boss_compass (#46 Part A MVP).
//
// Behavior:
//   - Right-click in air with empty offhand: opens a chat-driven menu of
//     bosses the player is allowed to target (tier-gated by AStages).
//     Each entry is a Component with a clickEvent that fires
//     `/icraft_compass select <boss_id>` for that player.
//   - Shift-right-click in air: clears current target.
//   - Right-click with target already set: reports current direction +
//     distance to the target boss's spawn arena center.
//
// Target NBT (on the compass ItemStack):
//   {
//     boss_id: "twilight_naga",        // matches BOSS_REGISTRY key
//     target_pos: { x: ?, y: ?, z: ? } // structure-arena center BlockPos
//   }
//
// The BOSS_REGISTRY in this script is the COMPASS-side roster (display
// names + tiers + canonical-spawn-coordinates-or-structure-lookup). The
// bonfire system's BOSS_REGISTRY (boss_bonfire_system.js) is keyed by
// structure ID for detection; both will converge on a shared registry
// once the catalog scales from MVP (1 boss) to full (106 bosses).
//
// Cross-refs:
//   wiki/design/boss-catalog.md            -- full boss roster + tiers
//   wiki/design/boss-bonfire-design.md     -- shared bonfire+compass design
//   kubejs/server_scripts/gates/milestone_detection.js -- AStages tier reader
// =============================================================================

// ---- Boss roster (MVP: 1 boss + a stretch placeholder for testing tier-gate)
//
// Each entry shapes the compass menu + the target NBT on selection.
// `find_spawn`: function returning {x,y,z} of the boss's arena center, OR
//               null if the boss hasn't spawned yet / isn't locateable.
// For structure-locked bosses, we use level.findNearestMapStructure(...).
// For dimensional bosses (Ender Dragon, etc.), use a fixed coordinate or
// dimensional anchor.

const COMPASS_BOSSES = {
    // T1 OVERWORLD MVP target -- Gob, King of Gnomes (Terramity).
    // Structure: terramity:court_of_gnomes (swamp / dark forest). Picked so
    // the discovery+bonfire loop is testable at the entry tier without
    // leaving the overworld (Naga is T2 / Twilight dimension).
    terramity_gob: {
        display: "Gob, King of Gnomes",
        tier: 1,
        dimension: "minecraft:overworld",
        find_spawn: (player) => findStructureCenter(player, "terramity:court_of_gnomes"),
    },
    // Tier-gate demo: a T2 boss a T1 player should NOT see in the menu.
    twilight_naga: {
        display: "Naga",
        tier: 2,
        dimension: "twilightforest:twilight_forest",
        find_spawn: (player) => findStructureCenter(player, "twilightforest:naga_courtyard"),
    },
}

// ---- Tier-gating helper ---------------------------------------------------
//
// Reads the player's current AStages tier. Returns 1-4. Falls back to 1
// on lookup failure (so a player with no stage data gets the T1 boss list).

function getPlayerTier(player) {
    try {
        // Probe milestone_detection.js's exposed API if present, else read
        // the AStages player data directly.
        if (typeof getPlayerStageTier === "function") {
            return getPlayerStageTier(player)
        }
        // Fallback: read player.persistentData.iridescent.tier
        const pd = player.persistentData
        if (pd.contains("iridescent")) {
            const block = pd.getCompound("iridescent")
            if (block.contains("tier")) {
                return Math.max(1, Math.min(4, block.getInt("tier")))
            }
        }
        return 1
    } catch (e) {
        return 1
    }
}

// ---- Structure-center lookup ----------------------------------------------

function findStructureCenter(player, structureId) {
    try {
        const level = player.level
        if (level.isClientSide()) return null
        const rl = new $ResourceLocation(structureId)
        const structure = level.registryAccess().registry($Registries.STRUCTURE)
            .map(r => r.get(rl)).orElse(null)
        if (!structure) return null
        const center = level.findNearestMapStructure(
            $HolderSet.direct([new $ResourceKey($Registries.STRUCTURE, rl)]),
            player.blockPosition(),
            100,  // search radius (chunks)
            false  // skip-existing-chunks
        )
        if (!center) return null
        return { x: center.x, y: center.y, z: center.z }
    } catch (e) {
        return null
    }
}

// ---- NBT helpers ----------------------------------------------------------

function getCompassTarget(stack) {
    const tag = stack.nbt
    if (!tag || !tag.contains("boss_id")) return null
    const targetPos = tag.contains("target_pos") ? tag.getCompound("target_pos") : null
    return {
        boss_id: tag.getString("boss_id"),
        pos: targetPos ? {
            x: targetPos.getInt("x"),
            y: targetPos.getInt("y"),
            z: targetPos.getInt("z"),
        } : null,
    }
}

function setCompassTarget(stack, boss_id, pos) {
    const tag = stack.nbt || {}
    tag.boss_id = boss_id
    if (pos) {
        tag.target_pos = { x: pos.x, y: pos.y, z: pos.z }
    }
    stack.nbt = tag
}

function clearCompassTarget(stack) {
    if (!stack.nbt) return
    const tag = stack.nbt
    tag.remove("boss_id")
    tag.remove("target_pos")
    stack.nbt = tag
}

// ---- Direction helper -----------------------------------------------------
// Returns a compass-direction string (N/NE/E/SE/S/SW/W/NW) from player
// position to target position.

function getCompassDirection(player, pos) {
    const dx = pos.x - player.blockX
    const dz = pos.z - player.blockZ
    if (dx === 0 && dz === 0) return "here"
    const angle = (Math.atan2(-dx, dz) * 180 / Math.PI + 360) % 360
    const sectors = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"]
    return sectors[Math.round(angle / 45) % 8]
}

function getDistance(player, pos) {
    const dx = pos.x - player.blockX
    const dy = pos.y - player.blockY
    const dz = pos.z - player.blockZ
    return Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz))
}

// ---- Menu builder ---------------------------------------------------------

function showTargetMenu(player) {
    const tier = getPlayerTier(player)
    const eligible = Object.entries(COMPASS_BOSSES)
        .filter(([id, meta]) => meta.tier <= tier)

    if (eligible.length === 0) {
        player.tell(Text.gray("No tier-appropriate bosses available."))
        return
    }

    player.tell(Text.aqua("--- Boss Compass — choose target (tier "
        + tier + " and below) ---"))

    for (const [id, meta] of eligible) {
        const line = Text.white("  [")
            .append(Text.gold(meta.display).bold(true))
            .append(Text.white("] "))
            .append(Text.gray("T" + meta.tier + " — click to select")
                .clickRunCommand("/icraft_compass select " + id))
        player.tell(line)
    }
    player.tell(Text.gray("Shift-right-click to clear current target."))
}

// ---- Apply selected target ------------------------------------------------

function applyTarget(player, boss_id) {
    const meta = COMPASS_BOSSES[boss_id]
    if (!meta) {
        player.tell(Text.red("Unknown boss: " + boss_id))
        return
    }
    const tier = getPlayerTier(player)
    if (meta.tier > tier) {
        player.tell(Text.red("Boss " + meta.display
            + " is tier " + meta.tier + "; you are tier " + tier + "."))
        return
    }
    const compass = player.mainHandItem
    if (!compass || compass.id !== "kubejs:boss_compass") {
        player.tell(Text.red("Hold the boss compass in your main hand first."))
        return
    }
    const spawn = meta.find_spawn(player)
    if (!spawn) {
        player.tell(Text.yellow("Could not locate "
            + meta.display + " spawn arena nearby."))
        return
    }
    setCompassTarget(compass, boss_id, spawn)
    const dist = getDistance(player, spawn)
    const dir = getCompassDirection(player, spawn)
    player.tell(Text.green("Compass locked on ")
        .append(Text.gold(meta.display).bold(true))
        .append(Text.green(" at " + dist + " blocks " + dir + ".")))
}

// ---- Right-click handler --------------------------------------------------

ItemEvents.rightClicked("kubejs:boss_compass", event => {
    const { player, item } = event
    if (player.level.isClientSide()) return

    if (player.crouching) {
        // Shift-right-click: clear target.
        clearCompassTarget(item)
        player.tell(Text.gray("Boss compass cleared."))
        return
    }

    const target = getCompassTarget(item)
    if (target && target.pos) {
        // Already locked: report direction + distance.
        const meta = COMPASS_BOSSES[target.boss_id]
        const label = meta ? meta.display : target.boss_id
        const dist = getDistance(player, target.pos)
        const dir = getCompassDirection(player, target.pos)
        player.tell(Text.aqua("Tracking ")
            .append(Text.gold(label).bold(true))
            .append(Text.aqua(": " + dist + " blocks " + dir + ".")))
        return
    }

    // No target set: open the menu.
    showTargetMenu(player)
})

// ---- Custom command handler -----------------------------------------------
//
// `/icraft_compass select <boss_id>` -- fired by the clickable chat menu.
// `/icraft_compass clear`            -- clears the held compass target.
//
// Uses Brigadier's StringArgumentType directly for both the arg type and
// retrieval. The original code referenced a bare `Arguments` (the KubeJS
// helper must be destructured from the event -- `const { arguments: Arguments }
// = event`) so registration threw "ReferenceError: Arguments is not defined"
// and the command never registered -- menu clicks hit an unknown command.
// `ctx.getArgument(name, "java.lang.String")` was also wrong (2nd arg must be
// a Class, not a String). Pure Brigadier sidesteps both and is stable across
// KubeJS builds.

const BrigString = Java.loadClass("com.mojang.brigadier.arguments.StringArgumentType")

ServerEvents.commandRegistry(event => {
    const { commands } = event

    event.register(
        commands.literal("icraft_compass")
            .then(
                commands.literal("select")
                    .then(
                        commands.argument("boss_id", BrigString.word())
                            .executes(ctx => {
                                const player = ctx.source.playerOrException
                                const bossId = BrigString.getString(ctx, "boss_id")
                                applyTarget(player, bossId)
                                return 1
                            })
                    )
            )
            .then(
                commands.literal("clear")
                    .executes(ctx => {
                        const player = ctx.source.playerOrException
                        const compass = player.mainHandItem
                        if (compass && compass.id === "kubejs:boss_compass") {
                            clearCompassTarget(compass)
                            player.tell(Text.gray("Boss compass cleared."))
                        }
                        return 1
                    })
            )
    )
})

// ---- Crafting recipe -----------------------------------------------------
//
// Lives here (not in startup_scripts/boss_compass_item.js) because
// ServerEvents.* only fires from server_scripts/. The item registration
// is startup-time (block/item registry), the recipe is server-time
// (recipe manager runs server-side).

ServerEvents.recipes(event => {
    event.shapeless("kubejs:boss_compass", [
        "minecraft:compass",
        "ars_nouveau:source_gem",
    ])
})

console.log("[iridescent/boss_compass] loaded; "
    + Object.keys(COMPASS_BOSSES).length + " boss(es) selectable")
