// =============================================================================
// kubejs/server_scripts/bonfire/boss_bonfire_system.js
//
// Auto-places a fixed-name Waystone at boss-arena thresholds when a player
// first enters the structure. FromSoftware-bonfire semantics: discovery is
// the trigger (NOT boss-kill); the waystone exists as a return-to-bonfire
// teleport convenience for re-fights.
//
// MVP scope (updated 2026-05-30):
//   - One boss only: Gob, King of Gnomes (Terramity), structure
//     terramity:court_of_gnomes -- a T1 OVERWORLD boss, so the loop is
//     testable at the entry tier (the prior MVP used Twilight Naga, which is
//     T2 and lives in the Twilight dimension -- unreachable at T1).
//   - Detection via Forge StructureManager.getStructureWithPieceAt(BlockPos)
//   - Placement via WaystonesAPI.placeWaystone() + setName() + setGlobal(true)
//     + PlayerWaystoneManager.activateWaystoneForEveryone()
//   - One-shot per (world, boss_id) tuple persisted on the level's
//     persistentData
//   - Server chat broadcast on first ignition: "{player} has lit the
//     {boss} bonfire"
//
// Once Naga MVP proves out end-to-end, expand BOSS_REGISTRY to cover the
// 106 bosses in boss-catalog.md. Sentinel-marker placement at worldgen is
// a robustness follow-up against player skip-paths (TNT into arena, etc.).
//
// Cross-refs:
//   .minecraft/wiki/design/boss-bonfire-design.md (FromSoftware semantics)
//   .minecraft/wiki/design/waystones-api-audit.md (API three-call path)
//   .minecraft/wiki/design/waystone-rename-blocking-options.md (Strategy 5
//     + 1: setGlobal=true + KubeJS tick-guard)
//   .minecraft/wiki/design/boss-catalog.md (full boss roster — future)
// =============================================================================

// ---- Boss registry --------------------------------------------------------
// Maps Forge structure ResourceLocation (as string) to bonfire metadata.
// Each entry shapes the chat broadcast + the waystone display name.
const BOSS_REGISTRY = {
    "terramity:court_of_gnomes": {
        boss_id: "terramity_gob",
        display_name: "[Boss] Gob's Court Bonfire",
        chat_boss: "Gob, King of Gnomes",  // shown in "{player} has lit the {chat_boss} bonfire"
        tier: 1,
    },
    // Add more bosses here after MVP proves out -- see boss-catalog.md for
    // the full 106-boss roster.
}

// ---- One-shot bookkeeping -------------------------------------------------
//
// World-shared: persists `fired_bonfires` as a list of boss_id strings under
// the overworld's `persistentData.iridescent` block. Once a bonfire is lit
// for the world, no second ignition (the waystone already exists).
//
// Per-player chat-broadcast guard is implicit: only the FIRST player to
// trigger the world-shared fire gets the broadcast.

function getWorldBonfireSet(server) {
    // Use the overworld as the canonical world-state holder. Waystones are
    // dimension-cross via the global flag, so we only need one set per save.
    const overworld = server.overworld()
    const pd = overworld.persistentData
    if (!pd.contains("iridescent")) pd.put("iridescent", {})
    const block = pd.getCompound("iridescent")
    if (!block.contains("fired_bonfires")) {
        block.put("fired_bonfires", [])
    }
    pd.put("iridescent", block)
    const list = block.getList("fired_bonfires", 8)  // 8 = TAG_STRING
    const set = new Set()
    for (let i = 0; i < list.size(); i++) {
        set.add(list.getString(i))
    }
    return set
}

function markBonfireFired(server, bossId) {
    const overworld = server.overworld()
    const pd = overworld.persistentData
    if (!pd.contains("iridescent")) pd.put("iridescent", {})
    const block = pd.getCompound("iridescent")
    if (!block.contains("fired_bonfires")) {
        block.put("fired_bonfires", [])
    }
    const list = block.getList("fired_bonfires", 8)
    // Dedup.
    for (let i = 0; i < list.size(); i++) {
        if (list.getString(i) === bossId) return
    }
    list.add(net.minecraft.nbt.StringTag.valueOf(bossId))
    block.put("fired_bonfires", list)
    pd.put("iridescent", block)
}

// ---- Structure detection --------------------------------------------------
//
// Forge's StructureManager exposes `getStructureWithPieceAt(BlockPos, TagKey
// or ResourceLocation)`. We call it per registered boss structure once per
// second per online player. Returns a StructureStart if the position is
// inside that structure, else INVALID/EMPTY.

function findBossStructureAtPlayer(player) {
    const level = player.level
    if (level.isClientSide()) return null
    const structureManager = level.structureManager()
    const pos = player.blockPosition()

    for (const [structId, meta] of Object.entries(BOSS_REGISTRY)) {
        try {
            const rl = new $ResourceLocation(structId)
            const registry = level.registryAccess().registry(
                $Registries.STRUCTURE
            ).orElse(null)
            if (!registry) continue
            const structureHolder = registry.getHolder(
                $ResourceKey.create($Registries.STRUCTURE, rl)
            ).orElse(null)
            if (!structureHolder) continue
            const structure = structureHolder.value()
            const start = structureManager.getStructureAt(pos, structure)
            if (start && start.isValid()) {
                return { structId, meta, start }
            }
        } catch (e) {
            // Structure not loaded / not registered; skip silently.
        }
    }
    return null
}

// ---- Waystone placement ---------------------------------------------------
//
// Per waystones-api-audit.md, the three-call path is:
//   1. WaystonesAPI.placeWaystone(level, pos, type)
//   2. waystone.setName(name) + waystone.setGlobal(true)
//   3. PlayerWaystoneManager.activeWaystoneForEveryone(server, waystone)
//
// Threshold position = just outside the structure entrance. For Naga Court
// MVP we use the player's current position (they're entering -- their feet
// are at the threshold). Refine to a precise per-structure offset later via
// the Threshold Position column in boss-catalog.md.

function placeBossWaystoneIfAbsent(player, structInfo) {
    const server = player.server
    const fired = getWorldBonfireSet(server)
    if (fired.has(structInfo.meta.boss_id)) return false  // already lit

    const WaystonesAPI = Java.loadClass(
        "net.blay09.mods.waystones.api.WaystonesAPI"
    )
    const PlayerWaystoneManager = Java.loadClass(
        "net.blay09.mods.waystones.core.PlayerWaystoneManager"
    )
    const WaystoneTypes = Java.loadClass(
        "net.blay09.mods.waystones.api.WaystoneTypes"
    )

    const level = player.level
    const pos = player.blockPosition()

    let waystone
    try {
        // placeWaystone signature varies by Waystones version; passing the
        // "default" type is the most stable across 14.x.
        waystone = WaystonesAPI.placeWaystone(level, pos, WaystoneTypes.WAYSTONE)
    } catch (e) {
        console.warn("[bonfire] placeWaystone failed: " + e.message)
        return false
    }

    try {
        waystone.setName(structInfo.meta.display_name)
        waystone.setGlobal(true)
    } catch (e) {
        console.warn("[bonfire] setName/setGlobal failed: " + e.message)
        // Continue -- waystone is placed even if naming fails; we just don't
        // get the rename-block. Log so a follow-up can investigate.
    }

    try {
        PlayerWaystoneManager.activateWaystoneForEveryone(server, waystone)
    } catch (e) {
        console.warn("[bonfire] activateWaystoneForEveryone failed: " + e.message)
        // The waystone exists but isn't pre-activated for the rest of the
        // server. Players can still activate normally. Acceptable degradation.
    }

    markBonfireFired(server, structInfo.meta.boss_id)
    fireBonfireBroadcast(server, player, structInfo.meta)
    return true
}

// ---- Chat broadcast -------------------------------------------------------

function fireBonfireBroadcast(server, player, meta) {
    const msg = Text.aqua("[Iridescent] ")
        .append(Text.gold(player.username))
        .append(Text.white(" has lit the "))
        .append(Text.lightPurple(meta.chat_boss).bold(true))
        .append(Text.white(" bonfire."))
    server.tell(msg)
}

// ---- Tick loop ------------------------------------------------------------
// 1 Hz poll per online player. Wrapped in defensive try/catch so a single
// reflection mismatch (Waystones bump / Forge API drift) doesn't tight-loop
// the server log into oblivion.

let bonfire_tick_counter = 0
let bonfire_warn_throttle = 0
PlayerEvents.tick(event => {
    bonfire_tick_counter++
    if (bonfire_tick_counter % 20 !== 0) return  // 20 ticks = 1 second
    const player = event.player
    if (player.level.isClientSide()) return

    try {
        const structInfo = findBossStructureAtPlayer(player)
        if (!structInfo) return
        placeBossWaystoneIfAbsent(player, structInfo)
    } catch (e) {
        // Rate-limit warnings -- one per minute regardless of player count.
        bonfire_warn_throttle++
        if (bonfire_warn_throttle % 60 === 1) {
            console.warn("[bonfire] tick handler threw: " + e.message
                + " (suppressing next 59 warnings; counter at "
                + bonfire_warn_throttle + ")")
        }
    }
})

console.log("[iridescent/bonfire] loaded; registered " +
    Object.keys(BOSS_REGISTRY).length + " boss(es): " +
    Object.keys(BOSS_REGISTRY).join(", "))
