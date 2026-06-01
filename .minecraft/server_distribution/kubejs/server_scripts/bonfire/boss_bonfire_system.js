// =============================================================================
// kubejs/server_scripts/bonfire/boss_bonfire_system.js
//
// Auto-places a fixed-name global Waystone ("bonfire") at a boss arena the
// first time any player sets foot inside it. FromSoftware-bonfire semantics:
// DISCOVERY is the trigger (not boss-kill); the waystone is a permanent
// return-to-arena teleport so re-fights are one warp away.
//
// SHARED ROSTER: reads global.ICRAFT_BOSS_ARENAS (startup_scripts/
// boss_arena_registry.js) — the SAME table the compass uses, so the two halves
// of #46 can never drift. Every structure-locked arena in that registry gets a
// bonfire. (Non-structure bosses — biome-random, summon-item, feature-placed
// Cardinal Sins — have no fixed threshold and are out of scope; see the
// registry header.)
//
// DETECTION: StructureManager.getStructureWithPieceAt(BlockPos, TagKey) using
// the per-arena tag `icraft:<boss_id>` we author in
//   kubejs/data/icraft/tags/worldgen/structure/<boss_id>.json
// (the same tags the compass locates with). This returns a valid StructureStart
// only when the player is INSIDE a piece of that arena — a precise threshold
// signal that survives structure-piece variants and player skip-paths (TNT-in,
// bridge-over) better than an entity-join hook, and never fires for /summon.
//
// PLACEMENT (Waystones 14.1.20 — jar-verified API, see waystones-api-audit.md):
//   1. WaystonesAPI.placeWaystone(level, pos, WaystoneStyles.DEFAULT) -> Optional<IWaystone>
//   2. waystone.setName("[Boss] <Arena> Bonfire"); waystone.setGlobal(true)
//   3. PlayerWaystoneManager.activeWaystoneForEveryone(server, waystone)
// (The prior MVP had four API bugs: WaystoneTypes [no such class] vs
//  WaystoneStyles; .WAYSTONE vs .DEFAULT; used the Optional return directly
//  instead of .orElse(null); and activateWaystoneForEveryone [extra "ate"] vs
//  the real activeWaystoneForEveryone. All four fixed here.)
//
// IDEMPOTENT: one waystone per (world, boss_id), tracked in the overworld's
// persistentData. First igniter gets a server-wide "{player} has lit the {boss}
// bonfire" broadcast; later visitors see nothing (the waystone already exists).
//
// RELOAD-SAFETY (#60 lesson): registers ONLY a player-tick via the pack's
// global.registerPlayerTick master dispatcher (0_tick_master.js) + reads/writes
// persistentData. No item/block creation, no raw Forge bus listener, no global
// tick registration that would leak across /reload.
//
// Cross-refs:
//   startup_scripts/boss_arena_registry.js  -- the shared roster + tags source
//   wiki/design/boss-bonfire-design.md       -- FromSoftware semantics
//   wiki/design/waystones-api-audit.md        -- the three-call API path
//   wiki/design/waystone-rename-blocking-options.md -- setGlobal(true) lock
// =============================================================================

// ---- Waystones API classes (loaded once) ----------------------------------
const WS_API = Java.loadClass("net.blay09.mods.waystones.api.WaystonesAPI")
const WS_STYLES = Java.loadClass("net.blay09.mods.waystones.api.WaystoneStyles")
const WS_PWM = Java.loadClass("net.blay09.mods.waystones.core.PlayerWaystoneManager")

// ---- Structure-detection Java classes (match the compass tag path) ---------
const BF_Registries  = Java.loadClass("net.minecraft.core.registries.Registries")
const BF_TagKey      = Java.loadClass("net.minecraft.tags.TagKey")
const BF_ResourceLoc = Java.loadClass("net.minecraft.resources.ResourceLocation")
const BF_StringTag   = Java.loadClass("net.minecraft.nbt.StringTag")

function arenaTagFor(bossId) {
    return BF_TagKey.create(BF_Registries.STRUCTURE, new BF_ResourceLoc("icraft", bossId))
}

// The displayed bonfire name. Design call (boss-bonfire-design.md §7):
// "[Boss] " prefix + " Bonfire" suffix around the arena label.
function bonfireName(meta) {
    return "[Boss] " + (meta.waystone || meta.display) + " Bonfire"
}

// ---- One-shot bookkeeping (world-shared) ----------------------------------
// Persists `fired_bonfires` (a TAG_STRING list of boss_id) under the
// overworld's persistentData.iridescent block. Waystones are cross-dimensional
// via the global flag, so one set per save suffices.

// READ path — pure, no NBT writes (called up to once per tick per player). If
// the block / list doesn't exist yet, returns an empty Set rather than creating
// it (creation happens lazily on the first write in markBonfireFired).
function readFiredSet(server) {
    const set = new Set()
    const pd = server.overworld().persistentData
    if (!pd.contains("iridescent")) return set
    const block = pd.getCompound("iridescent")
    if (!block.contains("fired_bonfires")) return set
    const list = block.getList("fired_bonfires", 8)  // 8 = TAG_STRING
    for (let i = 0; i < list.size(); i++) set.add(list.getString(i))
    return set
}

// WRITE path — appends bossId to the persisted list (idempotent). Only runs on
// the rare first-ignition event, so the put-back cost is irrelevant here.
function markBonfireFired(server, bossId) {
    const pd = server.overworld().persistentData
    if (!pd.contains("iridescent")) pd.put("iridescent", {})
    const block = pd.getCompound("iridescent")
    if (!block.contains("fired_bonfires")) block.put("fired_bonfires", [])
    const list = block.getList("fired_bonfires", 8)
    for (let i = 0; i < list.size(); i++) {
        if (list.getString(i) === bossId) return  // dedupe
    }
    list.add(BF_StringTag.valueOf(bossId))
    block.put("fired_bonfires", list)
    pd.put("iridescent", block)
}

// ---- Structure detection --------------------------------------------------
// Returns { bossId, meta } if the player is currently inside a registered boss
// arena that hasn't been lit yet, else null. Reads the fired-set ONCE up front
// and skips already-lit arenas with no structure query, so the common case
// (walking the world) costs one persistentData read + cheap Set lookups.

function detectArenaAtPlayer(player) {
    const level = player.level
    if (level.isClientSide()) return null
    const arenas = global.ICRAFT_BOSS_ARENAS || {}
    const server = player.server
    const fired = readFiredSet(server)
    const sm = level.structureManager()
    const pos = player.blockPosition()

    for (const bossId in arenas) {
        if (fired.has(bossId)) continue                  // already lit — skip
        const meta = arenas[bossId]
        if (!meta.structure) continue
        try {
            const tag = arenaTagFor(bossId)
            const start = sm.getStructureWithPieceAt(pos, tag)
            if (start && start.isValid()) {
                return { bossId: bossId, meta: meta }
            }
        } catch (e) {
            // Tag/structure not present in this dimension's registry, or API
            // drift — skip this arena silently (the tick wrapper rate-limits
            // any genuinely repeating error).
        }
    }
    return null
}

// ---- Waystone placement ---------------------------------------------------
// Threshold position = the player's current feet position (they just crossed
// into the arena piece). Per design §3.1 this is "inside the entrance", which
// is acceptable for the MVP; a precise per-arena offset is future polish.

function placeBonfire(player, bossId, meta) {
    const server = player.server
    if (readFiredSet(server).has(bossId)) return false  // re-check (race-safe)

    const level = player.level
    const pos = player.blockPosition()

    // 1) Place the block (Optional<IWaystone>).
    let waystone
    try {
        const opt = WS_API.placeWaystone(level, pos, WS_STYLES.DEFAULT)
        waystone = opt ? opt.orElse(null) : null
    } catch (e) {
        console.warn("[bonfire] placeWaystone failed for " + bossId + ": " + e)
        return false
    }
    if (!waystone) {
        console.warn("[bonfire] placeWaystone returned empty for " + bossId)
        return false
    }

    // 2) Fixed name + global (setGlobal(true) is the rename-lock per the audit:
    //    globalWaystoneSetupRequiresCreativeMode=true means survival players
    //    can't toggle global off / rename via the creative-gated settings).
    try {
        waystone.setName(bonfireName(meta))
        waystone.setGlobal(true)
    } catch (e) {
        console.warn("[bonfire] setName/setGlobal failed for " + bossId + ": " + e)
        // Continue — the waystone exists even if naming failed.
    }

    // 3) Pre-activate for everyone (current + future players see it in their list).
    try {
        WS_PWM.activeWaystoneForEveryone(server, waystone)
    } catch (e) {
        console.warn("[bonfire] activeWaystoneForEveryone failed for " + bossId + ": " + e)
        // Acceptable degradation — players can still activate it on contact.
    }

    markBonfireFired(server, bossId)
    broadcastBonfire(server, player, meta)
    console.log("[bonfire] lit '" + bonfireName(meta) + "' at "
        + pos.getX() + "," + pos.getY() + "," + pos.getZ()
        + " (" + bossId + ") by " + player.username)
    return true
}

// ---- Chat broadcast (first ignition only) ---------------------------------

function broadcastBonfire(server, player, meta) {
    const msg = Text.aqua("[Iridescent] ")
        .append(Text.gold(player.username))
        .append(Text.white(" has lit the "))
        .append(Text.lightPurple(meta.display).bold(true))
        .append(Text.white(" bonfire. ✦ It's now in everyone's waystone list."))
    server.tell(msg)
}

// ---- Tick loop (1 Hz per player, via the master dispatcher) ----------------
// Wrapped in defensive try/catch with a per-minute warn throttle so an API
// drift can't tight-loop the log.

let bonfire_warn_throttle = 0
global.tick_bossBonfire = function (event) {
    const player = event.player
    if (!player || player.level.isClientSide()) return
    try {
        const hit = detectArenaAtPlayer(player)
        if (!hit) return
        placeBonfire(player, hit.bossId, hit.meta)
    } catch (e) {
        bonfire_warn_throttle++
        if (bonfire_warn_throttle % 60 === 1) {
            console.warn("[bonfire] tick threw: " + e
                + " (suppressing next 59; counter " + bonfire_warn_throttle + ")")
        }
    }
}
// Every 20 ticks (1 s), offset 13 to spread away from the compass HUD (offset 7).
global.registerPlayerTick("tick_bossBonfire", 20, 13)

console.log("[iridescent/bonfire] loaded; "
    + Object.keys(global.ICRAFT_BOSS_ARENAS || {}).length
    + " boss arena(s) eligible for auto-bonfires")
