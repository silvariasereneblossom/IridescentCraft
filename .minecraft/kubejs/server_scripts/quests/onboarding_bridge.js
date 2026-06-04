// =============================================================================
// kubejs/server_scripts/quests/onboarding_bridge.js
//
// Bridges Heracles chapter 0 (Onboarding) tasks of type `heracles:dummy` to
// real in-world events. Without this script, 2 of the chapter-0 quests
// (1 JLF level milestone, 1 capstone) would never auto-fire.
//
// 2026-06-03 (#45 read-fix B): the 3 "read a codex page" quests were removed —
// Patchouli is client-side and the server can't see which page you opened, so
// those reads were never detectable. The codex beat is now onboarding_first_codex_open
// ("hold the Iridescent Codex"), which is plain item-detection.
//
// Heracles' `heracles:dummy` task type completes via the operator command
// `/heracles dummy <value>`. This script runs that command server-side on
// behalf of the player when the corresponding game event happens.
//
// Quests bridged here (see .minecraft/config/heracles/quests/onboarding/):
//   - onboarding_first_level        dummy value: jlf_level_5_reached
//   - onboarding_survivor_capstone  dummy value: onboarding_survivor_capstone_check
//
// Idempotent: each per-player tuple (player, dummy_value) is one-shot. We
// guard via persistent player NBT flags so re-fire on relog is suppressed.
//
// Cross-refs:
//   - .minecraft/wiki/design/heracles-quest-tree.md §4 (template + bridge note)
//   - .minecraft/wiki/design/heracles-json-shape.md §2.8 (dummy task semantics)
//   - .minecraft/config/heracles/quests/onboarding/onboarding_*.json (consumers)
// =============================================================================

// ---- Tunables --------------------------------------------------------------

// JLF level threshold quests. Keyed by required level, value is dummy.
const JLF_LEVEL_TO_DUMMY = {
    5: "jlf_level_5_reached",
}

// Capstone trigger: when these 14 quest IDs all show completed for a player,
// fire the capstone dummy.
const CAPSTONE_DUMMY = "onboarding_survivor_capstone_check"
const CAPSTONE_PREREQS = [
    "onboarding_first_log",
    "onboarding_first_tool",
    "onboarding_first_stone",
    "onboarding_first_food",
    "onboarding_first_shelter",
    "onboarding_first_codex_open",
    "onboarding_first_kill",
    "onboarding_first_iron",
    "onboarding_first_iron_pick",
    "onboarding_first_level",
    "onboarding_first_villager_trade",
]

// ---- Per-player NBT guard --------------------------------------------------
//
// Track which dummy values each player has already fired so reload / relog
// doesn't re-fire the reward. Stored under
// player.persistentData.iridescent.onboarding_bridge_fired = [<dummy>, ...]

function getFiredSet(player) {
    const pd = player.persistentData
    if (!pd.contains("iridescent")) pd.put("iridescent", {})
    const block = pd.getCompound("iridescent")
    if (!block.contains("onboarding_bridge_fired")) {
        block.put("onboarding_bridge_fired", [])
    }
    pd.put("iridescent", block)
    // Return as a Set view on the underlying list (stringified).
    const list = block.getList("onboarding_bridge_fired", 8)  // 8 = TAG_STRING
    const set = new Set()
    for (let i = 0; i < list.size(); i++) {
        set.add(list.getString(i))
    }
    return set
}

function markFired(player, dummyValue) {
    const pd = player.persistentData
    if (!pd.contains("iridescent")) pd.put("iridescent", {})
    const block = pd.getCompound("iridescent")
    if (!block.contains("onboarding_bridge_fired")) {
        block.put("onboarding_bridge_fired", [])
    }
    const list = block.getList("onboarding_bridge_fired", 8)
    // Avoid duplicates.
    for (let i = 0; i < list.size(); i++) {
        if (list.getString(i) === dummyValue) return
    }
    list.add(net.minecraft.nbt.StringTag.valueOf(dummyValue))
    block.put("onboarding_bridge_fired", list)
    pd.put("iridescent", block)
}

function fireDummyIfNew(player, dummyValue) {
    const fired = getFiredSet(player)
    if (fired.has(dummyValue)) return false
    markFired(player, dummyValue)
    player.server.runCommandSilent(`heracles dummy ${dummyValue} ${player.username}`)
    return true
}

// ---- JLF level milestone hook ---------------------------------------------
//
// JustLevelingFork stores per-player level in player.persistentData.
// Per the JLF wiki this is under `puffish_attributes.skill_points.level`
// or similar -- verify the exact NBT path during integration testing.
// We poll once per second per online player and fire dummies when thresholds
// are crossed. Cheap (only inspects already-loaded persistent NBT).

let jlf_tick_counter = 0
PlayerEvents.tick(event => {
    jlf_tick_counter++
    if (jlf_tick_counter % 20 !== 0) return  // 20 ticks = 1 second
    var player = event.player
    if (player.level.isClientSide()) return

    // JLF level is exposed via the JustLevelingFork data tag. Read defensively:
    // if the field is missing (player hasn't installed JLF yet, edge case)
    // we silently skip rather than crash.
    // RHINO-SAFETY: var (not const/let) for closure-locals in this per-tick handler.
    let jlfLevel = 0
    try {
        var pd = player.persistentData
        if (pd.contains("PlayerPersisted")) {
            var persisted = pd.getCompound("PlayerPersisted")
            if (persisted.contains("PlayerLevel")) {
                jlfLevel = persisted.getInt("PlayerLevel")
            }
        }
    } catch (e) {
        // Tolerate JLF data format changes.
        return
    }

    for (var [threshold, dummyValue] of Object.entries(JLF_LEVEL_TO_DUMMY)) {
        if (jlfLevel >= parseInt(threshold)) {
            fireDummyIfNew(player, dummyValue)
        }
    }
})

// ---- Capstone auto-trigger ------------------------------------------------
//
// Heracles' own quest-complete event isn't exposed to KubeJS directly in
// 1.20.1. We poll: once per second, for each online player, check whether
// all 14 onboarding prereq quest IDs show completed in the player's
// Heracles save data. When all are done, fire the capstone dummy.
//
// Heracles' quest progress is at player.persistentData.heracles.quests
// per the heracles-json-shape.md §6 multiplayer semantics
// (individual_progress = true on every onboarding quest, so each player has
// their own progress NBT).

PlayerEvents.tick(event => {
    if (jlf_tick_counter % 20 !== 0) return  // ride the JLF tick rhythm
    var player = event.player
    if (player.level.isClientSide()) return

    var fired = getFiredSet(player)
    if (fired.has(CAPSTONE_DUMMY)) return  // already done

    let allComplete = true
    try {
        var pd = player.persistentData
        if (!pd.contains("heracles")) return
        var heracles = pd.getCompound("heracles")
        if (!heracles.contains("quests")) return
        var quests = heracles.getCompound("quests")
        for (var prereq of CAPSTONE_PREREQS) {
            if (!quests.contains(prereq)) { allComplete = false; break }
            var q = quests.getCompound(prereq)
            // QuestProgress.complete is a boolean tag.
            if (!q.contains("complete") || !q.getBoolean("complete")) {
                allComplete = false
                break
            }
        }
    } catch (e) {
        return
    }

    if (allComplete) {
        fireDummyIfNew(player, CAPSTONE_DUMMY)
    }
})

console.log("[iridescent/onboarding_bridge] loaded; bridging " +
    Object.keys(JLF_LEVEL_TO_DUMMY).length + " JLF level(s) + 1 capstone " +
    "(codex page-reads removed 2026-06-03, #45 read-fix B)")
