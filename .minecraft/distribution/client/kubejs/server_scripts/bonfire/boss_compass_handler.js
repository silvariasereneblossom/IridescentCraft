// =============================================================================
// kubejs/server_scripts/bonfire/boss_compass_handler.js
//
// Right-click interaction handler for kubejs:boss_compass (#46 Part A).
//
// Behaviour:
//   - Right-click in air (no target set): opens a chat-driven menu of the
//     boss arenas the player is allowed to target (tier-gated by AStages).
//     Each entry has a clickEvent firing `/icraft_compass select <boss_id>`.
//   - Right-click in air (target set): re-reports direction + distance to the
//     locked arena, and refreshes the on-screen action-bar pointer.
//   - Shift-right-click in air: clears the current target.
//   - While a target is locked and the compass is held, a 1 Hz action-bar
//     "HUD" shows ‹arrow› Boss — Ndist (a lightweight needle without a custom
//     model/renderer, which would need a client mixin we don't ship).
//
// Roster comes from global.ICRAFT_BOSS_ARENAS (bonfire/boss_arena_registry.js,
// loaded first in this directory) — SHARED with the bonfire system so the two
// can't drift. Only structure-locked arenas are targetable; see registry header.
//
// Target NBT (on the compass ItemStack):
//   { boss_id: "twilight_naga", target_pos: { x,y,z }, target_dim: "..." }
//
// RELOAD-SAFETY (#60 lesson): registers ONLY KubeJS event bindings
// (ItemEvents.rightClicked, ServerEvents.commandRegistry, and a tick via the
// pack's global.registerPlayerTick master dispatcher). No raw Forge bus
// listener, no Forge-side item registration here (the item is created in
// startup_scripts). All of these are torn down + rebuilt cleanly on /reload.
//
// Cross-refs:
//   server_scripts/bonfire/boss_arena_registry.js -- the shared roster
//   wiki/design/boss-catalog.md             -- full boss roster + tiers
//   wiki/design/boss-bonfire-design.md      -- shared bonfire+compass design
//   server_scripts/gates/codex_boss_rush.js -- AStages tier definitions
// =============================================================================

// ---- Tier-gating helper ---------------------------------------------------
//
// Reads the player's current AStages tier (the REAL progression system this
// pack uses — milestone_detection.js / codex_boss_rush.js grant tier_1..tier_4
// stages). Returns the highest owned tier number 1-4. Creative players have all
// stages, so they get tier 4 (every boss). Falls back to 1 on any error.
//
// (The prior MVP read a non-existent persistentData.iridescent.tier and an
//  undefined getPlayerStageTier() probe, so it ALWAYS fell back to 1 and the
//  tier-gate never actually worked. This reads AStages directly.)

function getPlayerTier(player) {
    try {
        if (player.creative) return 4
        let tier = 0
        for (let t = 1; t <= 4; t++) {
            if (AStages.playerHasStage("tier_" + t, player)) tier = t
        }
        return Math.max(1, tier)
    } catch (e) {
        return 1
    }
}

// ---- Structure-center lookup ----------------------------------------------
//
// Locates the nearest instance of a boss arena's structure and returns its
// center as {x,y,z}, or null if not found in the player's current dimension.
//
// IMPLEMENTATION: the PROVEN-in-this-pack path (see cherry_spawn_biome.js,
// which ships and works): ServerLevel.findNearestMapStructure(TagKey<Structure>,
// BlockPos, int searchRadiusChunks, boolean skipExistingChunks) -> BlockPos.
// This overload returns a bare BlockPos (NOT a Pair — cherry_spawn_biome.js
// documents that gotcha). Each boss arena has a one-element structure tag at
//   kubejs/data/icraft/tags/worldgen/structure/<boss_id>.json
// so we pass the tag `icraft:<boss_id>` and let the vanilla locator do the rest.
// Using a tag (rather than a hand-built HolderSet) sidesteps Rhino varargs /
// Holder-construction fragility and mirrors the working `minecraft:village`
// lookup. async-locator (installed) makes this search off-thread / non-blocking.

// Java classes loaded via the pack's proven Java.loadClass idiom (matches
// cherry_spawn_biome.js). Loaded once at module scope.
const JL_Registries  = Java.loadClass("net.minecraft.core.registries.Registries")
const JL_TagKey      = Java.loadClass("net.minecraft.tags.TagKey")
const JL_ResourceLoc = Java.loadClass("net.minecraft.resources.ResourceLocation")

function structureTagFor(bossId) {
    // The per-arena tag we author in data/icraft/tags/worldgen/structure/.
    return JL_TagKey.create(
        JL_Registries.STRUCTURE,
        new JL_ResourceLoc("icraft", bossId)
    )
}

function findStructureCenter(player, bossId) {
    try {
        const level = player.level
        if (level.isClientSide()) return null

        const tag = structureTagFor(bossId)
        const origin = player.blockPosition()

        // 100-chunk radius (~1600 blocks), skipExistingChunks=false so it also
        // finds not-yet-generated arenas. Returns a BlockPos or null.
        const bp = level.findNearestMapStructure(tag, origin, 100, false)
        if (!bp) return null
        return { x: bp.getX(), y: bp.getY(), z: bp.getZ() }
    } catch (e) {
        console.warn("[boss_compass] findStructureCenter('" + bossId + "') failed: " + e)
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
        dim: tag.contains("target_dim") ? tag.getString("target_dim") : null,
        pos: targetPos ? {
            x: targetPos.getInt("x"),
            y: targetPos.getInt("y"),
            z: targetPos.getInt("z"),
        } : null,
    }
}

function setCompassTarget(stack, boss_id, dim, pos) {
    const tag = stack.nbt || {}
    tag.boss_id = boss_id
    if (dim) tag.target_dim = dim
    if (pos) tag.target_pos = { x: pos.x, y: pos.y, z: pos.z }
    stack.nbt = tag
}

function clearCompassTarget(stack) {
    if (!stack.nbt) return
    const tag = stack.nbt
    tag.remove("boss_id")
    tag.remove("target_pos")
    tag.remove("target_dim")
    stack.nbt = tag
}

// ---- Direction / distance helpers -----------------------------------------

const COMPASS_SECTORS = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"]
const COMPASS_ARROWS  = ["↓", "↙", "←", "↖", "↑", "↗", "→", "↘"]

function sectorIndex(player, pos) {
    const dx = pos.x - player.blockX
    const dz = pos.z - player.blockZ
    if (dx === 0 && dz === 0) return -1
    const angle = (Math.atan2(-dx, dz) * 180 / Math.PI + 360) % 360
    return Math.round(angle / 45) % 8
}

function getCompassDirection(player, pos) {
    const i = sectorIndex(player, pos)
    return i < 0 ? "here" : COMPASS_SECTORS[i]
}

function getCompassArrow(player, pos) {
    const i = sectorIndex(player, pos)
    return i < 0 ? "•" : COMPASS_ARROWS[i]
}

function getDistance(player, pos) {
    const dx = pos.x - player.blockX
    const dy = pos.y - player.blockY
    const dz = pos.z - player.blockZ
    return Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz))
}

// Current dimension ID as a string (proven idiom from death_penalty.js: the
// `.dimension().location()` form, with a property fallback).
function currentDimId(player) {
    try { return String(player.level.dimension().location()) } catch (e) {}
    try { return String(player.level.dimension) } catch (e) {}
    return null
}

// True if the player is in the same dimension the target arena was located in.
function inTargetDimension(player, target) {
    if (!target.dim) return true
    const here = currentDimId(player)
    return here === null ? true : here === target.dim
}

// ---- Menu builder ---------------------------------------------------------

function showTargetMenu(player) {
    const tier = getPlayerTier(player)
    const arenas = global.ICRAFT_BOSS_ARENAS || {}
    const eligible = Object.keys(arenas)
        .filter(id => arenas[id].tier <= tier)
        .sort((a, b) => arenas[a].tier - arenas[b].tier
            || arenas[a].display.localeCompare(arenas[b].display))

    if (eligible.length === 0) {
        player.tell(Text.gray("No tier-appropriate boss arenas available."))
        return
    }

    player.tell(Text.aqua("═══ Boss Compass — choose a target (Tier " + tier + " and below) ═══"))
    let lastTier = 0
    for (const id of eligible) {
        const meta = arenas[id]
        if (meta.tier !== lastTier) {
            player.tell(Text.darkGray("── Tier " + meta.tier + " ──"))
            lastTier = meta.tier
        }
        const line = Text.white("  [")
            .append(Text.gold(meta.display).bold(true))
            .append(Text.white("] "))
            .append(Text.gray("» track")
                .clickRunCommand("/icraft_compass select " + id)
                .hover(Text.gray("Locate " + meta.display + "'s arena ("
                    + (meta.structure || "?") + ")")))
        player.tell(line)
    }
    player.tell(Text.darkGray("Shift-right-click the compass to clear the current target."))
}

// ---- Apply selected target ------------------------------------------------

function applyTarget(player, boss_id) {
    const arenas = global.ICRAFT_BOSS_ARENAS || {}
    const meta = arenas[boss_id]
    if (!meta) {
        player.tell(Text.red("Unknown boss arena: " + boss_id))
        return
    }
    const tier = getPlayerTier(player)
    if (meta.tier > tier) {
        player.tell(Text.red(meta.display + " is Tier " + meta.tier
            + "; you are Tier " + tier + ". Advance first."))
        return
    }
    const compass = player.mainHandItem
    if (!compass || compass.id !== "kubejs:boss_compass") {
        player.tell(Text.red("Hold the Boss Compass in your main hand first."))
        return
    }
    const spawn = findStructureCenter(player, boss_id)
    if (!spawn) {
        // Structure not found nearby OR not present in this dimension. Give the
        // player an actionable hint rather than a dead end.
        const here = currentDimId(player)
        if (meta.dimension && here && meta.dimension !== here) {
            player.tell(Text.yellow("⚠ " + meta.display + "'s arena (")
                .append(Text.gold(meta.structure))
                .append(Text.yellow(") generates in "))
                .append(Text.aqua(meta.dimension))
                .append(Text.yellow(" — travel there, then re-target.")))
        } else {
            player.tell(Text.yellow("⚠ Could not locate " + meta.display
                + "'s arena within range. Explore further and try again."))
        }
        return
    }
    setCompassTarget(compass, boss_id, meta.dimension || null, spawn)
    const dist = getDistance(player, spawn)
    const dir = getCompassDirection(player, spawn)
    player.tell(Text.green("Compass locked on ")
        .append(Text.gold(meta.display).bold(true))
        .append(Text.green(" — " + dist + " blocks " + dir + ".")))
    if (meta.ritual) {
        player.tell(Text.darkAqua("  ⚑ " + meta.ritual))
    }
}

// ---- Report (re-read current target) --------------------------------------

function reportTarget(player, item, target) {
    const arenas = global.ICRAFT_BOSS_ARENAS || {}
    const meta = arenas[target.boss_id]
    const label = meta ? meta.display : target.boss_id
    if (!inTargetDimension(player, target)) {
        player.tell(Text.yellow("Tracking ")
            .append(Text.gold(label).bold(true))
            .append(Text.yellow(" — in another dimension ("))
            .append(Text.aqua(target.dim))
            .append(Text.yellow("). Travel there to home in.")))
        return
    }
    const dist = getDistance(player, target.pos)
    const dir = getCompassDirection(player, target.pos)
    player.tell(Text.aqua("Tracking ")
        .append(Text.gold(label).bold(true))
        .append(Text.aqua(": " + dist + " blocks " + dir + "."))
        .append(Text.darkGray("  (right-click again to refresh / re-locate)")))
    // Offer a quick re-locate if the player has wandered far (structure search
    // is cheap thanks to async-locator; re-snap to the nearest instance).
    if (meta) {
        const fresh = findStructureCenter(player, target.boss_id)
        if (fresh) setCompassTarget(item, target.boss_id, meta.dimension || null, fresh)
    }
}

// ---- Right-click handler --------------------------------------------------

ItemEvents.rightClicked("kubejs:boss_compass", event => {
    const { player, item } = event
    if (player.level.isClientSide()) return

    if (player.crouching) {
        clearCompassTarget(item)
        player.tell(Text.gray("Boss Compass cleared."))
        return
    }

    const target = getCompassTarget(item)
    if (target && target.pos) {
        reportTarget(player, item, target)
        return
    }
    showTargetMenu(player)
})

// ---- Action-bar HUD pointer (1 Hz) ----------------------------------------
//
// Lightweight "needle": while the player holds a locked compass, push an
// action-bar line "‹arrow› Boss — Ndist". A real rotating-needle model would
// need a client-side ItemPropertyFunction/mixin we don't ship; the action-bar
// pointer gives the same at-a-glance heading with zero client mods.
//
// Registered through the pack's master tick dispatcher (0_tick_master.js) so it
// costs one shared PlayerEvents.tick, not a second event-bus subscription.

global.tick_bossCompassHud = function (event) {
    const player = event.player
    if (!player || player.level.isClientSide()) return
    let item = player.mainHandItem
    if (!item || item.id !== "kubejs:boss_compass") {
        item = player.offhandItem
        if (!item || item.id !== "kubejs:boss_compass") return
    }
    const target = getCompassTarget(item)
    if (!target || !target.pos) return

    const arenas = global.ICRAFT_BOSS_ARENAS || {}
    const meta = arenas[target.boss_id]
    const label = meta ? meta.display : target.boss_id

    let msg
    if (!inTargetDimension(player, target)) {
        msg = Text.yellow("✦ " + label + " — in " + target.dim)
    } else {
        const dist = getDistance(player, target.pos)
        const arrow = getCompassArrow(player, target.pos)
        msg = Text.gold(arrow + " ").append(Text.aqua(label))
            .append(Text.gray(" — " + dist + "m"))
    }
    // displayClientMessage(Component, true) renders on the action bar (above
    // the hotbar). `msg` is already a MutableComponent (Text.* returns one), so
    // pass it directly. KubeJS proxies unmapped methods to the vanilla
    // ServerPlayer, so this reaches Player.displayClientMessage.
    try { player.displayClientMessage(msg, true) }
    catch (e) { /* version drift — silently skip the HUD line */ }
}
// Every 20 ticks (1 s), offset 7 to spread load away from other 1 Hz tasks.
global.registerPlayerTick("tick_bossCompassHud", 20, 7)

// ---- Custom command handler -----------------------------------------------
//
// `/icraft_compass select <boss_id>` -- fired by the clickable chat menu.
// `/icraft_compass clear`            -- clears the held compass target.
//
// Pure Brigadier (StringArgumentType) for arg type + retrieval — stable across
// KubeJS builds (the destructured-`Arguments` helper + Class-vs-String getArgument
// pitfalls broke the prior attempt; see git history).

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
                            player.tell(Text.gray("Boss Compass cleared."))
                        }
                        return 1
                    })
            )
    )
})

// ---- Crafting recipe -----------------------------------------------------
//
// Lives here (not in startup_scripts/boss_compass_item.js) because
// ServerEvents.* only fires from server_scripts/. T1-craftable (gating happens
// at target-selection by AStages tier, not at craft time): vanilla compass +
// an Ars Nouveau source gem (entry-tier accessible).

ServerEvents.recipes(event => {
    event.shapeless("kubejs:boss_compass", [
        "minecraft:compass",
        "ars_nouveau:source_gem",
    ]).id("kubejs:boss_compass")
})

console.log("[iridescent/boss_compass] handler loaded; "
    + Object.keys(global.ICRAFT_BOSS_ARENAS || {}).length + " arena(s) selectable")
