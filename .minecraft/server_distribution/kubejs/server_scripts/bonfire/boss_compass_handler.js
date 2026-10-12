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
//   { boss_id: "twilight_naga", target_pos: { x,y,z }, target_dim: "...",
//     cycle_id: "twilight_naga" }
//   cycle_id = the right-click cycle pointer (last boss cycled to), kept apart
//   from the LOCKED boss_id so the cycle advances even past summon-only / out-of-
//   range bosses (which intentionally don't set a locked target).
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
//
// 2026-10-10 -- Rhino faults fixed (verified on the production rhino jar; none
// is visible to `node --check`). The compass could not lock on to anything:
//   * findStructureCenter(), findBlockCenter() and blockIdAt() declared their
//     locals as `const` inside a `try`. This engine throws "redeclaration of
//     var" for that on EVERY call, the catch returned null, and every target
//     answered "Could not locate ...".
//   * showTargetMenu() declared its per-row values as loop-body `const`s, which
//     keep the FIRST iteration's value here: the menu printed the first boss
//     once per eligible boss, each link selecting that same first boss.
// And one cost fix: the structure locate is now cached per player + boss (see
// LOCATE CACHE below) instead of running synchronously on every click.
// Whole file is one IIFE (body left at column 0): server scripts share a single
// Rhino scope.
// =============================================================================

;(function () {
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
    var tier = 0
    try {
        if (player.creative) return 4
        for (var t = 1; t <= 4; t++) {
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
var BC_GRAND = "iridescent_grand_compass:grand_compass"
function bcIsBossFinder(item) {
    if (!item) return false
    var id = String(item.id)
    if (id === "kubejs:boss_compass") return true
    if (id === BC_GRAND) {
        try { return (item.nbt ? item.nbt.getInt("GrandMode") : 0) === 0 } catch (e) { return true }
    }
    return false
}
function bcHeldFinder(player) {
    var it = player.mainHandItem
    if (bcIsBossFinder(it)) return it
    it = player.offHandItem
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
// lookup.
//
// THIS CALL IS SYNCHRONOUS. findNearestMapStructure runs on the server thread
// until it returns (async-locator only reroutes the /locate command and a few
// vanilla item paths, not a direct call from a script), and a search that finds
// nothing walks the whole 100-chunk radius before giving up. Hence:
//
// LOCATE CACHE -- one entry per player + boss: the last answer (a position, or
// "nothing in range") with where and when it was computed. It is reused while
//   * it is younger than LOCATE_TTL_TICKS,
//   * the player is still in the same dimension, and
//   * the player is within LOCATE_REUSE_BLOCKS (horizontally) of where the
//     search ran -- "nearest" is relative to the player, so a long walk makes
//     the old answer stale.
// Cycling through the roster therefore costs one search per boss per stay in an
// area instead of one search per click. Entries are dropped on logout.

// Java classes loaded via the pack's proven Java.loadClass idiom (matches
// cherry_spawn_biome.js). Loaded once at module scope.
var JL_Registries  = Java.loadClass("net.minecraft.core.registries.Registries")
var JL_TagKey      = Java.loadClass("net.minecraft.tags.TagKey")
var JL_ResourceLoc = Java.loadClass("net.minecraft.resources.ResourceLocation")

var LOCATE_TTL_TICKS = 2400      // 2 min
var LOCATE_REUSE_BLOCKS = 128    // horizontal drift that keeps a cached answer valid
// uuid -> { <boss_id>: { t, dim, ox, oz, pos: {x,y,z} | null } }
var locateCache = {}

// World clock for the cache. Level.getGameTime() is exposed to scripts as
// getTime() (`level.time`); NaN when unreadable, which simply disables reuse.
function bcClock(player) {
    try { return Number(player.level.time) } catch (e) { return NaN }
}
function bcCacheGet(player, bossId) {
    try {
        var mine = locateCache[String(player.uuid)]
        if (!mine || !mine.hasOwnProperty(bossId)) return null
        var entry = mine[bossId]
        var now = bcClock(player)
        if (!(now >= entry.t) || (now - entry.t) >= LOCATE_TTL_TICKS) return null
        if (entry.dim !== currentDimId(player)) return null
        var dx = player.blockX - entry.ox, dz = player.blockZ - entry.oz
        if (dx * dx + dz * dz > LOCATE_REUSE_BLOCKS * LOCATE_REUSE_BLOCKS) return null
        return entry
    } catch (e2) {
        return null
    }
}
function bcCachePut(player, bossId, pos) {
    try {
        var now = bcClock(player)
        if (now !== now) return           // no clock -> no cache
        var key = String(player.uuid)
        if (!locateCache.hasOwnProperty(key)) locateCache[key] = {}
        locateCache[key][bossId] = {
            t: now, dim: currentDimId(player),
            ox: player.blockX, oz: player.blockZ,
            pos: pos ? { x: pos.x, y: pos.y, z: pos.z } : null
        }
    } catch (e) {}
}

function structureTagFor(bossId) {
    // The per-arena tag we author in data/icraft/tags/worldgen/structure/.
    return JL_TagKey.create(
        JL_Registries.STRUCTURE,
        new JL_ResourceLoc("icraft", bossId)
    )
}

var bcLocateWarned = {}
function findStructureCenter(player, bossId) {
    // RHINO: every local is a `var` (a `const` inside a try throws on each
    // call -- see the 2026-10-10 header note).
    try {
        var level = player.level
        if (level.isClientSide()) return null

        var cached = bcCacheGet(player, bossId)
        if (cached) return cached.pos ? { x: cached.pos.x, y: cached.pos.y, z: cached.pos.z } : null

        var tag = structureTagFor(bossId)
        var origin = player.blockPosition()

        // 100-chunk radius (~1600 blocks), skipExistingChunks=false so it also
        // finds not-yet-generated arenas. Returns a BlockPos or null.
        var bp = level.findNearestMapStructure(tag, origin, 100, false)
        var found = bp ? { x: bp.getX(), y: bp.getY(), z: bp.getZ() } : null
        bcCachePut(player, bossId, found)   // "nothing in range" is cached too: it is the slow case
        return found
    } catch (e) {
        // once per boss per script load: a broken lookup must not log per click
        if (!bcLocateWarned[bossId]) {
            bcLocateWarned[bossId] = true
            console.warn("[boss_compass] findStructureCenter('" + bossId + "') failed (logged once): " + e)
        }
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
// reads use the pack's `level.getBlock(x,y,z).id` idiom (matches skill_effects.js
// hasNearbyBlock) wrapped in try/catch.
//
// LOADED CHUNKS ONLY -- and only because of the hasChunkAt guard below.
// `level.getBlock()` does NOT answer "air" for an unloaded position. (An
// earlier version of this comment claimed KubeJS did exactly that, "rather
// than force-loading". It was wrong.) BlockContainerJS reads through
// level.getBlockState -> getChunk(..., FULL, true): an unloaded chunk is
// force-loaded to FULL on the server thread, and generated if it never existed.
// That is what made the server OOM nightly (2026-10-09, megatorch_damage.js).
// Only view-distance + 2 chunks around a player are guaranteed FULL, so at low
// view distances (2 -> ~64 blocks) this ±96 box reaches past the loaded area.
// What makes the scan safe is the guard added on 2026-10-10: each (x, z) column
// is gated by hasChunkAt (bcChunkLoaded), which never loads a chunk, so only
// blocks in chunks that are already loaded are ever read.
var BLOCK_SCAN_RADIUS = 96   // blocks horizontally from the player (±)
var BLOCK_SCAN_VRANGE = 64   // blocks vertically from the player (±)
var BLOCK_SCAN_STEP   = 4    // lattice spacing (shrine > 4 blocks wide)

function blockIdAt(level, x, y, z) {
    try {
        // RHINO: var, never const, inside a try.
        var b = level.getBlock(x, y, z)
        if (b && b.id) return String(b.id)
    } catch (e) {}
    return null
}

// true if the chunk holding block column (x, z) is already loaded; never loads
// it. A failed binding warns once and falls back to the old unguarded read:
// this scan only runs on a player's right-click, so the worst case is a sync
// chunk load next to a present player, not the empty-level leak.
var bcGuardWarned = false
function bcChunkLoaded(level, x, z) {
    try { return level.hasChunkAt(x, z) === true } catch (e) {
        if (!bcGuardWarned) {
            bcGuardWarned = true
            console.warn("[boss_compass] hasChunkAt unavailable - block scan unguarded: " + e)
        }
        return true
    }
}

function findBlockCenter(player, bossId) {
    var meta = (global.ICRAFT_BOSS_ARENAS || {})[bossId]
    if (!meta || !meta.signatureBlock) return null
    // RHINO: `best` / `bestD2` are declared out here because they are read by
    // every loop level; everything else is a var used in the block that
    // declares it (a const inside this try would throw on every call).
    var best = null, bestD2 = Infinity
    try {
        var level = player.level
        if (level.isClientSide()) return null
        var target = String(meta.signatureBlock)
        var px = player.blockX, py = player.blockY, pz = player.blockZ

        // Vertical sweep clamped to the build limits of the current dimension.
        var yMin = Math.max(level.getMinBuildHeight ? level.getMinBuildHeight() : -64,
            py - BLOCK_SCAN_VRANGE)
        var yMax = Math.min(level.getMaxBuildHeight ? level.getMaxBuildHeight() : 320,
            py + BLOCK_SCAN_VRANGE)

        for (var dx = -BLOCK_SCAN_RADIUS; dx <= BLOCK_SCAN_RADIUS; dx += BLOCK_SCAN_STEP) {
            var x = px + dx
            for (var dz = -BLOCK_SCAN_RADIUS; dz <= BLOCK_SCAN_RADIUS; dz += BLOCK_SCAN_STEP) {
                var z = pz + dz
                if (!bcChunkLoaded(level, x, z)) continue  // never load a chunk
                for (var y = yMin; y <= yMax; y += BLOCK_SCAN_STEP) {
                    if (blockIdAt(level, x, y, z) === target) {
                        var d2 = dx * dx + (y - py) * (y - py) + dz * dz
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
    var meta = (global.ICRAFT_BOSS_ARENAS || {})[bossId]
    if (!meta) return null
    if (meta.locator === "block") return findBlockCenter(player, bossId)
    return findStructureCenter(player, bossId)
}

// ---- NBT helpers ----------------------------------------------------------

function getCompassTarget(stack) {
    var tag = stack.nbt
    if (!tag || !tag.contains("boss_id")) return null
    var targetPos = tag.contains("target_pos") ? tag.getCompound("target_pos") : null
    return {
        // String(...): getString hands back a java.lang.String; coerce so the
        // roster lookup and the dimension comparison work on JS strings.
        boss_id: String(tag.getString("boss_id")),
        dim: tag.contains("target_dim") ? String(tag.getString("target_dim")) : null,
        pos: targetPos ? {
            x: targetPos.getInt("x"),
            y: targetPos.getInt("y"),
            z: targetPos.getInt("z"),
        } : null,
    }
}

function setCompassTarget(stack, boss_id, dim, pos) {
    var tag = stack.nbt || {}
    tag.boss_id = boss_id
    if (dim) tag.target_dim = dim
    if (pos) tag.target_pos = { x: pos.x, y: pos.y, z: pos.z }
    stack.nbt = tag
}

function clearCompassTarget(stack) {
    if (!stack.nbt) return
    var tag = stack.nbt
    tag.remove("boss_id")
    tag.remove("target_pos")
    tag.remove("target_dim")
    tag.remove("cycle_id")
    stack.nbt = tag
}

// Cycle pointer (right-click cycle): the last boss the player cycled to, stored
// SEPARATELY from the locked target so the cycle keeps advancing even when a
// boss is summon-only / out of range (those don't set boss_id). Falls back to
// the locked boss_id so a right-click continues from a menu-picked target.
function getCycleId(stack) {
    var tag = stack.nbt
    if (!tag) return null
    // String(...) coerces the Java String from getString to a JS primitive so
    // the caller's Array.indexOf (strict ===) matches the JS-string roster keys.
    if (tag.contains("cycle_id")) return String(tag.getString("cycle_id"))
    if (tag.contains("boss_id")) return String(tag.getString("boss_id"))
    return null
}

function setCycleId(stack, boss_id) {
    var tag = stack.nbt || {}
    tag.cycle_id = boss_id
    stack.nbt = tag
}

// ---- Direction / distance helpers -----------------------------------------

var COMPASS_SECTORS = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"]
var COMPASS_ARROWS  = ["↓", "↙", "←", "↖", "↑", "↗", "→", "↘"]

// RHINO (2026-10-10): `Math.PI` is UNDEFINED on this engine (rhino 2001.2.3:
// every Math constant -- PI, E, LN2, SQRT2 ... -- reads as undefined; the
// functions are fine). The old `* 180 / Math.PI` made the angle NaN, so the
// direction printed as "undefined" and the HUD arrow was "undefined". Use a
// literal.
var COMPASS_DEG_PER_RAD = 180 / 3.141592653589793

function sectorIndex(player, pos) {
    var dx = pos.x - player.blockX
    var dz = pos.z - player.blockZ
    if (dx === 0 && dz === 0) return -1
    var angle = (Math.atan2(-dx, dz) * COMPASS_DEG_PER_RAD + 360) % 360
    return Math.round(angle / 45) % 8
}

function getCompassDirection(player, pos) {
    var i = sectorIndex(player, pos)
    return i < 0 ? "here" : COMPASS_SECTORS[i]
}

function getCompassArrow(player, pos) {
    var i = sectorIndex(player, pos)
    return i < 0 ? "•" : COMPASS_ARROWS[i]
}

function getDistance(player, pos) {
    var dx = pos.x - player.blockX
    var dy = pos.y - player.blockY
    var dz = pos.z - player.blockZ
    return Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz))
}

// Current dimension ID as a string. On this KubeJS build `level.dimension` is
// the dimension's ResourceLocation (KubeJS's own getter; vanilla's dimension()
// method is hidden behind getDimensionKey()), so the property form is the one
// that answers. The method form is kept as a fallback for other builds.
function currentDimId(player) {
    try {
        var dim = player.level.dimension
        if (dim && typeof dim !== "function") return String(dim)
    } catch (e) {}
    try { return String(player.level.dimension().location()) } catch (e2) {}
    return null
}

// True if the player is in the same dimension the target arena was located in.
function inTargetDimension(player, target) {
    if (!target.dim) return true
    var here = currentDimId(player)
    return here === null ? true : here === String(target.dim)
}

// ---- Menu builder ---------------------------------------------------------

// Boss ids the player is tier-eligible for, sorted tier-ascending then by
// display name. Shared by the chat menu and the right-click cycle so both walk
// the roster in the same order.
function eligibleBossIds(player) {
    var tier = getPlayerTier(player)
    var arenas = global.ICRAFT_BOSS_ARENAS || {}
    return Object.keys(arenas)
        .filter(id => arenas[id].tier <= tier)
        .sort((a, b) => arenas[a].tier - arenas[b].tier
            || arenas[a].display.localeCompare(arenas[b].display))
}

function showTargetMenu(player) {
    var tier = getPlayerTier(player)
    var arenas = global.ICRAFT_BOSS_ARENAS || {}
    var eligible = eligibleBossIds(player)

    if (eligible.length === 0) {
        player.tell(Text.gray("No tier-appropriate boss arenas available."))
        return
    }

    player.tell(Text.aqua("═══ Boss Compass — choose a target (Tier " + tier + " and below) ═══"))
    player.tell(Text.darkGray("‹ click a boss name to track it ›"))
    var lastTier = 0
    // RHINO: every per-row value is a `var`. As loop-body `const`s they kept the
    // FIRST row's value on this engine (see the 2026-10-10 header note).
    for (var n = 0; n < eligible.length; n++) {
        var id = eligible[n]
        var meta = arenas[id]
        if (meta.tier !== lastTier) {
            player.tell(Text.darkGray("── Tier " + meta.tier + " ──"))
            lastTier = meta.tier
        }
        var isSummon = meta.locator === "summon"
        var anchor = meta.structure || meta.signatureBlock
        var verb = isSummon ? "» summon info" : "» track"
        var hover = isSummon
            ? Text.gray(meta.display + " — no compass anchor; click for the summon route")
            : Text.gray("Locate " + meta.display + "'s arena ("
                + (anchor || "?") + ")")
        // The whole [Boss Name] is the click target, styled as an underlined link so it
        // reads as a button: aqua = track-by-compass, gold = summon-route arena.
        var label = "[" + meta.display + "]"
        var link = (isSummon ? Text.gold(label) : Text.aqua(label))
            .underlined(true)
            .clickRunCommand("/icraft_compass select " + id)
            .hover(hover)
        var line = Text.white("  ")
            .append(link)
            .append(Text.darkGray("  " + verb))
        player.tell(line)
    }
    player.tell(Text.darkGray("Or right-click the compass to cycle targets · shift-right-click to clear."))
}

// ---- Apply selected target ------------------------------------------------

function applyTarget(player, boss_id, posLabel) {
    // posLabel (e.g. "3/7") is appended to the result line when called from the
    // right-click cycle; null/absent for the chat-menu select path (no change).
    var posTag = posLabel ? " (" + posLabel + ")" : ""
    var arenas = global.ICRAFT_BOSS_ARENAS || {}
    var meta = arenas[boss_id]
    if (!meta) {
        player.tell(Text.red("Unknown boss arena: " + boss_id))
        return
    }
    var tier = getPlayerTier(player)
    if (meta.tier > tier) {
        player.tell(Text.red(meta.display + " is Tier " + meta.tier
            + "; you are Tier " + tier + ". Advance first."))
        return
    }
    var compass = bcHeldFinder(player)
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
            .append(Text.yellow("'s arena can't be tracked by compass (no fixed beacon)." + posTag)))
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

    var spawn = findArenaCenter(player, boss_id)
    if (!spawn) {
        // Anchor not found nearby OR not present in this dimension. Give the
        // player an actionable hint rather than a dead end.
        var here = currentDimId(player)
        var anchor = meta.structure || meta.signatureBlock || "arena"
        if (meta.dimension && here && meta.dimension !== here) {
            player.tell(Text.yellow("⚠ " + meta.display + "'s arena (")
                .append(Text.gold(anchor))
                .append(Text.yellow(") generates in "))
                .append(Text.aqua(meta.dimension))
                .append(Text.yellow(" — travel there, then re-target." + posTag)))
        } else if (meta.locator === "block") {
            // Block scan only sees loaded chunks, so "not found" usually means
            // "not close enough yet" rather than "doesn't exist here".
            player.tell(Text.yellow("⚠ No ")
                .append(Text.gold(meta.display))
                .append(Text.yellow(" arena in range. Explore "))
                .append(Text.aqua(meta.dimension || "the area"))
                .append(Text.yellow(" — the compass locks on once you're near it." + posTag)))
            if (meta.summonEntity) {
                player.tell(Text.darkGray("  (test-spawn: ")
                    .append(Text.darkAqua("/summon " + meta.summonEntity)
                        .clickSuggestCommand("/summon " + meta.summonEntity))
                    .append(Text.darkGray(")")))
            }
        } else {
            player.tell(Text.yellow("⚠ Could not locate " + meta.display
                + "'s arena within range. Explore further and try again." + posTag))
        }
        return
    }
    setCompassTarget(compass, boss_id, meta.dimension || null, spawn)
    var dist = getDistance(player, spawn)
    var dir = getCompassDirection(player, spawn)
    player.tell(Text.green("Compass locked on ")
        .append(Text.gold(meta.display).bold(true))
        .append(Text.green(" — " + dist + " blocks " + dir + "." + posTag)))
    if (meta.ritual) {
        player.tell(Text.darkAqua("  ⚑ " + meta.ritual))
    }
}

// ---- Right-click cycle ----------------------------------------------------
//
// Right-click advances to the NEXT tier-eligible boss and locks it. Chat-menu
// clicking needs the chat GUI open (clunky mid-play); cycling needs no chat —
// the 1 Hz action-bar HUD shows the live heading, and the result line reports
// the lock + cycle position ("3/7"). The cycle pointer (cycle_id) is persisted
// independently of the lock so it keeps advancing past summon-only / out-of-
// range bosses (applyTarget shows that boss's route hint without locking). The
// full clickable list stays available on demand via `/icraft_compass menu`.
function cycleTarget(player) {
    var compass = bcHeldFinder(player)
    if (!compass) {
        player.tell(Text.red("Hold the Boss Compass (or a Grand Compass in Boss mode) first."))
        return
    }
    var list = eligibleBossIds(player)
    if (list.length === 0) {
        player.tell(Text.gray("No tier-appropriate boss arenas available."))
        return
    }
    // One-time how-to on a fresh compass (never cycled, no locked target).
    var tag0 = compass.nbt
    var firstTouch = !tag0 || (!tag0.contains("cycle_id") && !tag0.contains("boss_id"))
    if (firstTouch) {
        player.tell(Text.darkGray("Right-click cycles targets · shift-right-click clears · ")
            .append(Text.aqua("/icraft_compass menu")
                .clickRunCommand("/icraft_compass menu")
                .hover(Text.gray("Show the full clickable list")))
            .append(Text.darkGray(" for the list")))
    }
    var cur = getCycleId(compass)
    var idx = list.indexOf(cur)
    var next = (idx < 0) ? 0 : (idx + 1) % list.length
    var nextId = list[next]
    setCycleId(compass, nextId)
    applyTarget(player, nextId, (next + 1) + "/" + list.length)
}

// ---- Right-click handler --------------------------------------------------

ItemEvents.rightClicked("kubejs:boss_compass", icraft.guard('bonfire/boss_compass_handler', 'ItemEvents.rightClicked', event => {
    var player = event.player
    var item = event.item
    if (!player || player.level.isClientSide()) return

    if (player.crouching) {
        clearCompassTarget(item)
        player.tell(Text.gray("Boss Compass cleared."))
        return
    }

    // Right-click cycles to the next tier-eligible boss (no chat needed). The
    // full clickable list is still available via `/icraft_compass menu`.
    cycleTarget(player)
}))

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
    // RHINO-SAFETY: var (not const) — closure-local in a repeatedly-invoked tick.
    var player = event.player
    if (!player || player.level.isClientSide()) return
    var item = bcHeldFinder(player)
    if (!item) return
    var target = getCompassTarget(item)
    if (!target || !target.pos) return

    var arenas = global.ICRAFT_BOSS_ARENAS || {}
    var meta = arenas[target.boss_id]
    var label = meta ? meta.display : target.boss_id

    var msg = null
    if (!inTargetDimension(player, target)) {
        msg = Text.yellow("✦ " + label + " — in " + target.dim)
    } else {
        var dist = getDistance(player, target.pos)
        var arrow = getCompassArrow(player, target.pos)
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

var BrigString = Java.loadClass("com.mojang.brigadier.arguments.StringArgumentType")

ServerEvents.commandRegistry(icraft.guard('bonfire/boss_compass_handler', 'ServerEvents.commandRegistry', event => {
    var commands = event.commands

    event.register(
        commands.literal("icraft_compass")
            .then(
                commands.literal("menu")
                    .executes(ctx => {
                        var player = ctx.source.playerOrException
                        showTargetMenu(player)
                        return 1
                    })
            )
            .then(
                commands.literal("select")
                    .then(
                        commands.argument("boss_id", BrigString.word())
                            .executes(ctx => {
                                var player = ctx.source.playerOrException
                                var bossId = String(BrigString.getString(ctx, "boss_id"))
                                applyTarget(player, bossId)
                                return 1
                            })
                    )
            )
            .then(
                commands.literal("clear")
                    .executes(ctx => {
                        var player = ctx.source.playerOrException
                        var compass = player.mainHandItem
                        if (compass && String(compass.id) === "kubejs:boss_compass") {
                            clearCompassTarget(compass)
                            player.tell(Text.gray("Boss Compass cleared."))
                        }
                        return 1
                    })
            )
    )
}))

// ---- Crafting recipe -----------------------------------------------------
//
// Lives here (not in startup_scripts/boss_compass_item.js) because
// ServerEvents.* only fires from server_scripts/. T1-craftable (gating happens
// at target-selection by AStages tier, not at craft time): vanilla compass +
// an Ars Nouveau source gem (entry-tier accessible).

ServerEvents.recipes(icraft.guard('bonfire/boss_compass_handler', 'ServerEvents.recipes', event => {
    event.shapeless("kubejs:boss_compass", [
        "minecraft:compass",
        "ars_nouveau:source_gem",
    ]).id("kubejs:boss_compass")
}))

// Locate cache: one map per online player (see LOCATE CACHE above).
PlayerEvents.loggedOut(icraft.guard('bonfire/boss_compass_handler', 'PlayerEvents.loggedOut', event => {
    try { delete locateCache[String(event.player.uuid)] } catch (e) {}
}))

console.log("[iridescent/boss_compass] handler loaded; "
    + Object.keys(global.ICRAFT_BOSS_ARENAS || {}).length + " arena(s) selectable")
})()
