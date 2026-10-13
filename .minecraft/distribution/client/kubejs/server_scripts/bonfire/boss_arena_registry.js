// =============================================================================
// kubejs/server_scripts/bonfire/boss_arena_registry.js
//
// SHARED single-source-of-truth registry for the unified boss compass (#46
// Part A) AND the auto-waystone bonfire system (#46 Part B). Both subsystems
// (boss_compass_handler.js + boss_bonfire_system.js, same directory) read this
// one table so they can never drift apart.
//
// WHY server_scripts: both consumers are server scripts, and the roster comes
// from the boss registry, which a server library reads (0_lib_registry.js).
// (`global` itself is ONE map for startup, server and client scripts. This
// header said the opposite until 2026-10-13, and that was wrong.)
// LOAD ORDER: both consumers read `global.ICRAFT_BOSS_ARENAS` while they load,
// so this file must load before them. It does because its name sorts first in
// bonfire/ (KubeJS loads a folder in the order the file system lists it), and
// each consumer declares it: `// @after bonfire/boss_arena_registry.js`.
// dev/catalogue/load_order.js fails a push that breaks that order.
//
// RELOAD-SAFETY (#60 lesson): this file only ASSIGNS a plain-data object to a
// global — no item/block creation, no event listener, no recipe, nothing to
// tear down. Re-running it on /reload is a harmless reassignment.
//
// ROSTER SOURCE: the `arena` entries of kubejs/config/icraft/registry/bosses.json
// (see below). Their history: structure IDs jar-verified (2026-06-01) against the live
// mod jars; boss→structure→tier mapping derived from
//   wiki/design/boss-catalog.md            (the full audited roster)
//   server_scripts/gates/codex_boss_rush.js (canonical entity IDs + tiers)
//   wiki/design/boss-bonfire-design.md      (threshold/waystone semantics)
//
// SCOPE NOTE — two discovery vectors live here now:
//
//   (A) STRUCTURE-LOCKED arenas (the original #46 set). These have a real
//       worldgen Structure the vanilla locator can point at; they carry a
//       `structure` field + a one-element structure tag at
//       data/icraft/tags/worldgen/structure/<boss_id>.json. Compass locates via
//       findNearestMapStructure(tag); bonfire detects via
//       getStructureWithPieceAt(tag). (locator defaults to "structure".)
//
//   (B) FEATURE-PLACED arenas (#65 — the Cardinal Sins set). The Cardinal Sins
//       mod (MCreator) ships NO worldgen/structure or structure_set at all — its
//       arenas are custom Feature types (cardinal_sins:slothstructure, …) that
//       paste an .nbt template during raw_generation/underground/surface steps
//       (see kubejs/data/cardinal_sins/forge/biome_modifier/ — the #56
//       relocation overrides). Nothing lands in the structure registry, so
//       findNearestMapStructure / getStructureWithPieceAt are blind to them and
//       /locate returns nothing. We make them findable WITHOUT touching the mod
//       by discovering them via a unique, persistent block baked into each
//       arena's template — the per-sin SHRINE block (jar-verified 2026-06-02 by
//       decompressing each structures/*.nbt palette). Compass scans loaded
//       chunks for `signatureBlock` and locks the nearest; bonfire lights when
//       the player is within range of one. These carry `locator: "block"` +
//       `signatureBlock`, and NO `structure` field (so the structure-tag paths
//       skip them cleanly). The #56 Nether/Undergarden relocation is untouched.
//
// Still NOT compass-targetable (no fixed threshold of any kind):
//   • Brutal Bosses biome-random variants (Mad Cow, Evil Chicken, ...)   — no anchor
//   • Mutant Monsters (Skull-Spirit summons)                             — summon-item
//   • Meet Your Fight (Calling-Bell summons)                             — summon-item
//   • Stalwart Dungeons mobs                                            — overlay, no own anchor
// These are still tracked by codex_boss_rush.js for the combat advance route.
//
// EXCEPTIONS within the Cardinal Sins set (locator: "summon", no anchor):
//   • Drakara  — its template (structures/drakarastructure.nbt) holds ONLY the
//                drakara entity, no shrine/unique block → nothing to scan for.
//   • Sloth    — its only cardinal_sins block is `malevolichite_shrine`, which
//                ALSO generates naturally as ore-shrine worldgen → ambiguous.
//                Marked locator: "summon" too (a block scan would false-hit on
//                natural malevolichite). The compass surfaces the /summon path.
//   Both still get a roster entry + the /summon test route in `ritual`.
//
// FIELD SHAPE per boss_id:
//   display       : human label (compass menu + bonfire broadcast)
//   tier          : 1-4 (AStages gate — see boss_compass_handler.getPlayerTier)
//   dimension     : the dimension ResourceLocation the arena generates in
//                   (informational + cross-dim guard; structure locator searches
//                    the player's current level, block locator scans it too)
//   locator       : "structure" (default if omitted) | "block" | "summon"
//   structure     : (locator=structure) worldgen Structure RL to locate / detect
//   signatureBlock: (locator=block) the unique block RL baked into the arena
//                   template; compass + bonfire scan for it
//   waystone      : the fixed bonfire waystone name (gets the "[Boss] " prefix +
//                   " Bonfire" suffix applied by the bonfire system, so store the
//                   bare arena label here)
//   summonEntity  : (informational) the canonical boss entity ID, for the
//                   /summon <id> test path the compass prints on locator=summon
//   ritual        : (optional) short note shown after locating / on the summon
//                   path (Aether dungeons; Cardinal Sins summon route).
// =============================================================================

// THE TABLE IS READ FROM THE BOSS REGISTRY (kubejs/config/icraft/registry/
// bosses.json, through icraft.bosses, 0_lib_registry.js): the `arena` of a boss
// entry is one row, published here under its `key`. That key is the boss_id
// the compass, the bonfire, the structure tag (data/icraft/tags/worldgen/
// structure/<key>.json) and every saved compass target use: never rename one.
// icraft.bosses.arenas() returns the rows in file order, each a fresh copy
// (the normalising below writes into them). Until 2026-10-13 the 47 rows stood
// here, keyed by boss_id only; in the registry each row sits on the entry of
// the entity it belongs to.
// To add an arena: an `arena` object on the boss's registry entry, plus the
// structure tag for a structure-located one (dev/rosters/validate.py checks
// the structure, the block, the dimension and the tag).
global.ICRAFT_BOSS_ARENAS = icraft.bosses.arenas()

// Normalize: any arena WITHOUT an explicit `locator` is structure-located (the
// original #46 default). Done once here so the consumers can switch on
// meta.locator unconditionally.
//
// RHINO (2026-10-10): the three loops below declared their per-arena value as a
// loop-body `const`. On this engine a loop-body const keeps the value of the
// FIRST iteration, so only the first arena was ever normalized, the reverse
// index held one entry, and the boot line counted every arena as
// "structure-located" (production log: "47 structure-located, 0 block-located,
// 0 summon-only"). `var` in a loop body is per-iteration here.
;(function () {
    for (var id in global.ICRAFT_BOSS_ARENAS) {
        var meta = global.ICRAFT_BOSS_ARENAS[id]
        if (!meta.locator) meta.locator = meta.structure ? "structure" : "summon"
    }
})()

// Convenience reverse-index: structure ID -> boss_id (the bonfire detector keys
// off the structure the player is standing in). Built once at load. Only
// structure-located arenas have a `structure`, so block/summon arenas are
// naturally absent here.
global.ICRAFT_BOSS_ARENAS_BY_STRUCTURE = (function () {
    var out = {}
    for (var id in global.ICRAFT_BOSS_ARENAS) {
        var meta = global.ICRAFT_BOSS_ARENAS[id]
        if (meta.structure) out[meta.structure] = id
    }
    return out
})()

;(function () {
    var nStruct = 0, nBlock = 0, nSummon = 0
    for (var id in global.ICRAFT_BOSS_ARENAS) {
        var l = global.ICRAFT_BOSS_ARENAS[id].locator
        if (l === "block") nBlock++
        else if (l === "summon") nSummon++
        else nStruct++
    }
    console.log("[iridescent/boss_arenas] registry loaded: "
        + Object.keys(global.ICRAFT_BOSS_ARENAS).length + " boss arenas ("
        + nStruct + " structure-located, " + nBlock + " block-located, "
        + nSummon + " summon-only)")
})()
