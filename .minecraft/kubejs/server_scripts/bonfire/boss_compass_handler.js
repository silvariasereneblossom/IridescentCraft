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

// ---- Grand Compass bridge (#70) -------------------------------------------
// The unified iridescent_grand_compass:grand_compass drives this boss finder
// while it is in Boss mode (its NBT GrandMode == 0). Accept it everywhere the
// dedicated kubejs:boss_compass is accepted (menu, target-select, HUD).
const BC_GRAND = "iridescent_grand_compass:grand_compass"
function bcIsBossFinder(item) {
    if (!item) return false
    if (item.id === "kubejs:boss_compass") return true
    if (item.id === BC_GRAND) {
        try { return (item.nbt ? item.nbt.getInt("GrandMode") : 0) === 0 } catch (e) { return true }
    }
    return false
}
function bcHeldFinder(player) {
    let it = player.mainHandItem
    if (bcIsBossFinder(it)) return it
    it = player.offhandItem
    if (bcIsBossFinder(it)) return it
    return null
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

// ---- Block-signature lookup (#65 — feature-placed Cardinal Sins arenas) ----
//
// Feature-placed arenas have NO worldgen Structure (see boss_arena_registry.js
// header B), so findNearestMapStructure is blind to them. Instead we scan the
// LOADED chunks around the player for the arena's unique shrine block
// (meta.signatureBlock) and return the nearest hit. This is a bounded,
// best-effort scan — it can only see arenas inside the player's render/loaded
// radius, so the player generally has to be near the arena (or have visited it)
// for the lock to take. That's an accepted limitation of block-discovery; the
// summon-route note + waystone (once lit) cover the long-range case.
//
// PERF: we sample on a COARSE lattice (every BLOCK_SCAN_STEP blocks in all three
// axes) across a BLOCK_SCAN_RADIUS box. The shrine is a multi-block decorative
// structure (never a lone 1×1), so a step of 4 cannot tunnel through it. Block
// reads use the pack's proven `level.getBlock(x,y,z).id` idiom (matches
// skill_effects.js hasNearbyBlock) wrapped in try/catch — KubeJS returns air for
// unloaded positions rather than force-loading, so the scan is naturally bounded
// to what's already loaded around the player.
const BLOCK_SCAN_RADIUS = 96   // blocks horizontally from the player (±)
const BLOCK_SCAN_VRANGE = 64   // blocks vertically from the player (±)
const BLOCK_SCAN_STEP   = 4    // lattice spacing (shrine > 4 blocks wide)

function blockIdAt(level, x, y, z) {
    try {
        const b = level.getBlock(x, y, z)
        if (b && b.id) return String(b.id)
    } catch (e) {}
    return null
}

function findBlockCenter(player, bossId) {
    const meta = (global.ICRAFT_BOSS_ARENAS || {})[bossId]
    if (!meta || !meta.signatureBlock) return null
    try {
        const level = player.level
        if (level.isClientSide()) return null
        const target = meta.signatureBlock
        const px = player.blockX, py = player.blockY, pz = player.blockZ

        // Vertical sweep clamped to the build limits of the current dimension.
        const yMin = Math.max(level.getMinBuildHeight ? level.getMinBuildHeight() : -64,
            py - BLOCK_SCAN_VRANGE)
        const yMax = Math.min(level.getMaxBuildHeight ? level.getMaxBuildHeight() : 320,
            py + BLOCK_SCAN_VRANGE)

        let best = null, bestD2 = Infinity
        for (let dx = -BLOCK_SCAN_RADIUS; dx <= BLOCK_SCAN_RADIUS; dx += BLOCK_SCAN_STEP) {
            const x = px + dx
            for (let dz = -BLOCK_SCAN_RADIUS; dz <= BLOCK_SCAN_RADIUS; dz += BLOCK_SCAN_STEP) {
                const z = pz + dz
                for (let y = yMin; y <= yMax; y += BLOCK_SCAN_STEP) {
                    if (blockIdAt(level, x, y, z) === target) {
                        const d2 = dx * dx + (y - py) * (y - py) + dz * dz
                        if (d2 < bestD2) { bestD2 = d2; best = { x: x, y: y, z: z } }
                    }
                }
            }
        }
        return best
    } catch (e) {
        console.warn("[boss_compass] findBlockCenter('" + bossId + "') failed: " + e)
        return null
    }
}

// Dispatch to the right locator for an arena. Returns {x,y,z} or null.
// (locator "summon" never locates — applyTarget handles it before calling.)
function findArenaCenter(player, bossId) {
    const meta = (global.ICRAFT_BOSS_ARENAS || {})[bossId]
    if (!meta) return null
    if (meta.locator === "block") return findBlockCenter(player, bossId)
    return findStructureCenter(player, bossId)
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
        const anchor = meta.structure || meta.signatureBlock
        const verb = meta.locator === "summon" ? "» summon info" : "» track"
        const hover = meta.locator === "summon"
            ? Text.gray(meta.display + " — no compass anchor; click for the summon route")
            : Text.gray("Locate " + meta.display + "'s arena ("
                + (anchor || "?") + ")")
        const line = Text.white("  [")
            .append(Text.gold(meta.display).bold(true))
            .append(Text.white("] "))
            .append(Text.gray(verb)
                .clickRunCommand("/icraft_compass select " + id)
                .hover(hover))
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
    const compass = bcHeldFinder(player)
    if (!compass) {
        player.tell(Text.red("Hold the Boss Compass (or a Grand Compass in Boss mode) first."))
        return
    }

    // locator: "summon" — no findable anchor (feature-placed arena with no
    // unique block, e.g. Drakara / Sloth). Surface the summon + explore route
    // instead of a dead "not found".
    if (meta.locator === "summon") {
        player.tell(Text.yellow("⚠ ")
            .append(Text.gold(meta.display).bold(true))
            .append(Text.yellow("'s arena can't be tracked by compass (no fixed beacon).")))
        if (meta.dimension) {
            player.tell(Text.gray("  Arena generates in ")
                .append(Text.aqua(meta.dimension))
                .append(Text.gray(" — explore there, or test-spawn the boss:")))
        }
        if (meta.summonEntity) {
            player.tell(Text.darkAqua("  /summon " + meta.summonEntity)
                .clickSuggestCommand("/summon " + meta.summonEntity)
                .hover(Text.gray("Click to put this in your chat box")))
        }
        if (meta.ritual) player.tell(Text.darkGray("  " + meta.ritual))
        return
    }

    const spawn = findArenaCenter(player, boss_id)
    if (!spawn) {
        // Anchor not found nearby OR not present in this dimension. Give the
        // player an actionable hint rather than a dead end.
        const here = currentDimId(player)
        const anchor = meta.structure || meta.signatureBlock || "arena"
        if (meta.dimension && here && meta.dimension !== here) {
            player.tell(Text.yellow("⚠ " + meta.display + "'s arena (")
                .append(Text.gold(anchor))
                .append(Text.yellow(") generates in "))
                .append(Text.aqua(meta.dimension))
                .append(Text.yellow(" — travel there, then re-target.")))
        } else if (meta.locator === "block") {
            // Block scan only sees loaded chunks, so "not found" usually means
            // "not close enough yet" rather than "doesn't exist here".
            player.tell(Text.yellow("⚠ No ")
                .append(Text.gold(meta.display))
                .append(Text.yellow(" arena in range. Explore "))
                .append(Text.aqua(meta.dimension || "the area"))
                .append(Text.yellow(" — the compass locks on once you're near it.")))
            if (meta.summonEntity) {
                player.tell(Text.darkGray("  (test-spawn: ")
                    .append(Text.darkAqua("/summon " + meta.summonEntity)
                        .clickSuggestCommand("/summon " + meta.summonEntity))
                    .append(Text.darkGray(")")))
            }
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
    // is cheap thanks to async-locator; block scan is bounded to loaded chunks;
    // re-snap to the nearest instance). Summon-only arenas never re-locate.
    if (meta && meta.locator !== "summon") {
        const fresh = findArenaCenter(player, target.boss_id)
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
    let item = bcHeldFinder(player)
    if (!item) return
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
                commands.literal("menu")
                    .executes(ctx => {
                        const player = ctx.source.playerOrException
                        showTargetMenu(player)
                        return 1
                    })
            )
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
