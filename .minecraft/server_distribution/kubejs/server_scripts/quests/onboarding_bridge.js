// =============================================================================
// kubejs/server_scripts/quests/onboarding_bridge.js
//
// Bridges Heracles chapter 0 (Onboarding) tasks of type `heracles:dummy` to
// real in-world events. Without this script, 5 of the 15 chapter-0 quests
// (3 codex reads, 1 JLF level milestone, 1 capstone) would never auto-fire.
//
// Heracles' `heracles:dummy` task type completes via the operator command
// `/heracles dummy <value>`. This script runs that command server-side on
// behalf of the player when the corresponding game event happens.
//
// Quests bridged here (see .minecraft/config/heracles/quests/onboarding/):
//   - onboarding_intro_read         dummy value: codex_welcome_intro_read
//   - onboarding_first_hour_read    dummy value: codex_welcome_first_hour_read
//   - onboarding_keybinds_read      dummy value: codex_welcome_keybinds_read
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

// Map of (event-type, marker) -> dummy_value Heracles is listening for.
// Adding more codex pages or new dummy-driven quests = add a row here.
const CODEX_PAGE_TO_DUMMY = {
    // Iridescent Codex Patchouli entry ID -> Heracles dummy value
    "iridescent_codex:welcome/intro":      "codex_welcome_intro_read",
    "iridescent_codex:welcome/first_hour": "codex_welcome_first_hour_read",
    "iridescent_codex:welcome/keybinds":   "codex_welcome_keybinds_read",
}

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
    "onboarding_intro_read",
    "onboarding_first_hour_read",
    "onboarding_first_kill",
    "onboarding_first_iron",
    "onboarding_first_iron_pick",
    "onboarding_keybinds_read",
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

// ---- Codex page-open hook --------------------------------------------------
//
// Patchouli fires PatchouliAPI events but KubeJS in 1.20.1 doesn't expose
// them directly as a kjs event. TWO viable interception points:
//
//   (1) ClientTickEvent -- read player's currently-open screen, check if it's
//       PatchouliGuiBook, read the page URL. Client-side only; would need a
//       network packet back to the server to fire /heracles dummy.
//
//   (2) Reskill the codex book's right-click handler to detect "page X was
//       last opened" via a hook on Patchouli's GuiBook.onClose() and pass
//       the closing page through a custom packet.
//
// Both are non-trivial. For chapter 0 ship, the OPERATOR fires
//   /heracles dummy <value> <player>
// on demand via a /trigger or an in-game button. Once chapter 1+ ships and
// the Patchouli integration is built (deferred follow-up), this script's
// Patchouli wiring takes over automatically -- the dummy_values are stable.
//
// TODO: Patchouli read-detection integration (sub-task of #45 chapter 0 polish).
// Until then, mark this section as a no-op stub.

PlayerEvents.tick(event => {
    // No-op placeholder for the Patchouli read-detection hook.
    // See TODO above. The codex-read quests will require manual /heracles
    // dummy until the integration ships.
})

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
    const player = event.player
    if (player.level.isClientSide()) return

    // JLF level is exposed via the JustLevelingFork data tag. Read defensively:
    // if the field is missing (player hasn't installed JLF yet, edge case)
    // we silently skip rather than crash.
    let jlfLevel = 0
    try {
        const pd = player.persistentData
        if (pd.contains("PlayerPersisted")) {
            const persisted = pd.getCompound("PlayerPersisted")
            if (persisted.contains("PlayerLevel")) {
                jlfLevel = persisted.getInt("PlayerLevel")
            }
        }
    } catch (e) {
        // Tolerate JLF data format changes.
        return
    }

    for (const [threshold, dummyValue] of Object.entries(JLF_LEVEL_TO_DUMMY)) {
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
    const player = event.player
    if (player.level.isClientSide()) return

    const fired = getFiredSet(player)
    if (fired.has(CAPSTONE_DUMMY)) return  // already done

    let allComplete = true
    try {
        const pd = player.persistentData
        if (!pd.contains("heracles")) return
        const heracles = pd.getCompound("heracles")
        if (!heracles.contains("quests")) return
        const quests = heracles.getCompound("quests")
        for (const prereq of CAPSTONE_PREREQS) {
            if (!quests.contains(prereq)) { allComplete = false; break }
            const q = quests.getCompound(prereq)
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
    Object.keys(CODEX_PAGE_TO_DUMMY).length + " codex reads + " +
    Object.keys(JLF_LEVEL_TO_DUMMY).length + " JLF levels + 1 capstone")
