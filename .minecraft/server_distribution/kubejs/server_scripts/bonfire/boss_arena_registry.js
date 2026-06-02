// =============================================================================
// kubejs/server_scripts/bonfire/boss_arena_registry.js
//
// SHARED single-source-of-truth registry for the unified boss compass (#46
// Part A) AND the auto-waystone bonfire system (#46 Part B). Both subsystems
// (boss_compass_handler.js + boss_bonfire_system.js, same directory) read this
// one table so they can never drift apart.
//
// WHY server_scripts (NOT startup): KubeJS gives each script TYPE its own
// binding context — `global` set in a startup_scripts file is NOT visible to
// server_scripts (verified: every cross-file `global.*` handshake in this pack,
// e.g. 0_iss_guard.js → affix_*_strip.js, is server↔server). Both consumers
// here are server scripts, so the registry must live in the server context too.
// It LOADS FIRST within bonfire/ because the filename sorts before
// boss_bonfire_system.js and boss_compass_handler.js (KubeJS loads a directory
// alphabetically), so `global.ICRAFT_BOSS_ARENAS` is populated before either
// handler's top-level code reads it.
//
// RELOAD-SAFETY (#60 lesson): this file only ASSIGNS a plain-data object to a
// global — no item/block creation, no event listener, no recipe, nothing to
// tear down. Re-running it on /reload is a harmless reassignment.
//
// ROSTER SOURCE: structure IDs jar-verified (2026-06-01) against the live
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

global.ICRAFT_BOSS_ARENAS = {

    // ===== T1 — Overworld (entry tier) =======================================
    // Picked so the discovery + bonfire loop is testable without leaving the
    // overworld. Gob is the canonical MVP target (gob_t1_rebalance.js re-prices
    // his summon to emerald so a T1 player can actually fight him).
    terramity_gob: {
        display: "Gob, King of Gnomes",
        tier: 1,
        dimension: "minecraft:overworld",
        structure: "terramity:court_of_gnomes",
        waystone: "Gob's Court",
    },
    terramity_enchanter_merlin: {
        display: "Enchanter Merlin",
        tier: 1,
        dimension: "minecraft:overworld",
        structure: "terramity:fairy_fountain",
        waystone: "Fairy Fountain",
    },
    terramity_super_sniffer: {
        display: "Super Sniffer",
        tier: 1,
        dimension: "minecraft:overworld",
        structure: "terramity:ancient_outcrop",
        waystone: "Ancient Outcrop",
    },

    // ===== T2 — First-dimensional (Twilight / Aether / Blue Skies) ===========
    // Twilight Forest (8) — all structure-locked, Discovery Pain 1.
    twilight_naga: {
        display: "Naga",
        tier: 2,
        dimension: "twilightforest:twilight_forest",
        structure: "twilightforest:naga_courtyard",
        waystone: "Naga Court",
    },
    twilight_lich: {
        display: "Twilight Lich",
        tier: 2,
        dimension: "twilightforest:twilight_forest",
        structure: "twilightforest:lich_tower",
        waystone: "Lich Tower",
    },
    twilight_hydra: {
        display: "Hydra",
        tier: 2,
        dimension: "twilightforest:twilight_forest",
        structure: "twilightforest:hydra_lair",
        waystone: "Hydra Lair",
    },
    twilight_ur_ghast: {
        display: "Ur-Ghast",
        tier: 2,
        dimension: "twilightforest:twilight_forest",
        structure: "twilightforest:dark_tower",
        waystone: "Dark Tower",
    },
    twilight_knight_phantom: {
        display: "Knight Phantom",
        tier: 2,
        dimension: "twilightforest:twilight_forest",
        structure: "twilightforest:knight_stronghold",
        waystone: "Knight Stronghold",
    },
    twilight_snow_queen: {
        display: "Snow Queen",
        tier: 2,
        dimension: "twilightforest:twilight_forest",
        structure: "twilightforest:aurora_palace",
        waystone: "Aurora Palace",
    },
    twilight_minoshroom: {
        display: "Minoshroom",
        tier: 2,
        dimension: "twilightforest:twilight_forest",
        structure: "twilightforest:labyrinth",
        waystone: "Labyrinth",
    },
    twilight_alpha_yeti: {
        display: "Alpha Yeti",
        tier: 2,
        dimension: "twilightforest:twilight_forest",
        structure: "twilightforest:yeti_cave",
        waystone: "Yeti Cave",
    },
    // Aether (3) — structure-locked; the gold/silver dungeons also need an
    // in-arena ritual after you arrive (the compass surfaces that via `ritual`).
    aether_slider: {
        display: "Slider",
        tier: 2,
        dimension: "aether:the_aether",
        structure: "aether:bronze_dungeon",
        waystone: "Bronze Dungeon",
    },
    aether_valkyrie_queen: {
        display: "Valkyrie Queen",
        tier: 2,
        dimension: "aether:the_aether",
        structure: "aether:silver_dungeon",
        waystone: "Silver Dungeon",
        ritual: "Interact with the Valkyrie / Revoker inside to begin the fight.",
    },
    aether_sun_spirit: {
        display: "Sun Spirit",
        tier: 2,
        dimension: "aether:the_aether",
        structure: "aether:gold_dungeon",
        waystone: "Gold Dungeon",
        ritual: "Use the Sun Altar with the summon item inside to begin the fight.",
    },
    // Blue Skies (4) — summoned-by-altar, but the altar lives INSIDE a fixed
    // structure, so the structure is the locatable threshold. `ritual` notes
    // the key needed.
    blue_skies_summoner: {
        display: "Summoner",
        tier: 2,
        dimension: "blue_skies:everbright",
        structure: "blue_skies:nature_dungeon",
        waystone: "Nature Dungeon",
        ritual: "Use a Nature Key + Summoning Tome at the altar inside.",
    },
    blue_skies_alchemist: {
        display: "Alchemist",
        tier: 2,
        dimension: "blue_skies:everdawn",
        structure: "blue_skies:poison_dungeon",
        waystone: "Poison Dungeon",
        ritual: "Use a Poison Key + Summoning Tome at the altar inside.",
    },
    blue_skies_starlit_crusher: {
        display: "Starlit Crusher",
        tier: 2,
        dimension: "blue_skies:everbright",
        structure: "blue_skies:everbright_blinding_dungeon",
        waystone: "Everbright Blinding Dungeon",
        ritual: "Use a Blinding Key + Summoning Tome at the altar inside.",
    },
    blue_skies_arachnarch: {
        display: "Arachnarch",
        tier: 2,
        dimension: "blue_skies:everdawn",
        structure: "blue_skies:everdawn_blinding_dungeon",
        waystone: "Everdawn Blinding Dungeon",
        ritual: "Use a Blinding Key + Summoning Tome at the altar inside.",
    },
    // Terramity T2 structure bosses.
    terramity_gundalf: {
        display: "Archmage Gundalf",
        tier: 2,
        dimension: "minecraft:overworld",
        structure: "terramity:trial_spire",
        waystone: "Trial Spire",
    },

    // ===== T3 — Nether / Undergarden / Deeper Darker =========================
    // L_Ender's Cataclysm (structure-locked subset; scripted-spawn children
    // like Coralssus / Baby Leviathan are excluded — no own structure).
    cataclysm_netherite_monstrosity: {
        display: "Netherite Monstrosity",
        tier: 3,
        dimension: "minecraft:the_nether",
        structure: "cataclysm:burning_arena",
        waystone: "Burning Arena",
    },
    cataclysm_ignis: {
        display: "Ignis",
        tier: 3,
        dimension: "minecraft:the_nether",
        structure: "cataclysm:soul_black_smith",
        waystone: "Soul Blacksmith",
    },
    cataclysm_maledictus: {
        display: "Maledictus",
        tier: 3,
        dimension: "minecraft:overworld",
        structure: "cataclysm:cursed_pyramid",
        waystone: "Cursed Pyramid",
    },
    cataclysm_the_harbinger: {
        display: "The Harbinger",
        tier: 3,
        dimension: "minecraft:overworld",
        structure: "cataclysm:ancient_factory",
        waystone: "Ancient Factory",
    },
    cataclysm_the_leviathan: {
        display: "The Leviathan",
        tier: 3,
        dimension: "minecraft:overworld",
        structure: "cataclysm:sunken_city",
        waystone: "Sunken City",
    },
    cataclysm_scylla: {
        display: "Scylla",
        tier: 3,
        dimension: "minecraft:overworld",
        structure: "cataclysm:frosted_prison",
        waystone: "Frosted Prison",
    },
    // Iron's Spellbooks (structure-locked bosses).
    iss_dead_king: {
        display: "The Dead King",
        tier: 3,
        dimension: "minecraft:overworld",
        structure: "irons_spellbooks:catacombs",
        waystone: "Catacombs",
    },
    iss_fire_boss: {
        display: "Echo of Tyros, First Flamebearer",
        tier: 3,
        dimension: "minecraft:overworld",
        structure: "irons_spellbooks:pyromancer_tower",
        waystone: "Pyromancer Tower",
    },
    iss_citadel_keeper: {
        display: "Ancient Knight",
        tier: 3,
        dimension: "minecraft:the_nether",
        structure: "irons_spellbooks:citadel",
        waystone: "Citadel",
    },
    iss_archevoker: {
        display: "Archevoker",
        tier: 3,
        dimension: "minecraft:overworld",
        structure: "irons_spellbooks:evoker_fort",
        waystone: "Evoker Fort",
    },
    iss_magehunter: {
        display: "Magehunter",
        tier: 3,
        dimension: "minecraft:overworld",
        structure: "irons_spellbooks:mountain_tower",
        waystone: "Mountain Tower",
    },
    // Undergarden.
    undergarden_forgotten_guardian: {
        display: "Forgotten Guardian",
        tier: 3,
        dimension: "undergarden:undergarden",
        structure: "undergarden:forgotten_vestige",
        waystone: "Forgotten Vestige",
    },
    // Deeper Darker.
    deeperdarker_stalker: {
        display: "Stalker",
        tier: 3,
        dimension: "deeperdarker:otherside",
        structure: "deeperdarker:ancient_temple",
        waystone: "Ancient Temple",
    },
    // Terramity T3.
    terramity_gatmancer: {
        display: "Gatmancer",
        tier: 3,
        dimension: "minecraft:overworld",
        structure: "terramity:infested_laboratory",
        waystone: "Infested Laboratory",
    },

    // ----- Cardinal Sins (#65: feature-placed → BLOCK-discovered) ------------
    // The 7 sins + Drakara are T3; Lucifer is the T3 capstone (100%-clear T3→T4
    // gate, codex_boss_rush.js). #56 relocated these to Undergarden (lesser sins)
    // / Nether (fierce sins + Drakara + Lucifer). They have NO worldgen Structure
    // (MCreator Feature arenas — see header B), so they're located by the unique
    // SHRINE block in each arena's .nbt template, NOT a structure tag. No
    // `structure` field here → the structure-tag locate/detect paths skip them.
    //
    // Undergarden lesser sins (T2-T3 band → T3 to sit with the rest of the set).
    cardinal_sins_gluttony: {
        display: "Bacchus, Sin of Gluttony",
        tier: 3,
        dimension: "undergarden:undergarden",
        locator: "block",
        signatureBlock: "cardinal_sins:gluttonyshrine",
        waystone: "Gluttony Shrine",
        summonEntity: "cardinal_sins:sinofgluttony",
    },
    cardinal_sins_greed: {
        display: "Ebenezer, Sin of Greed",
        tier: 3,
        dimension: "undergarden:undergarden",
        locator: "block",
        signatureBlock: "cardinal_sins:greedshrine",
        waystone: "Greed Shrine",
        summonEntity: "cardinal_sins:sinofgreed",
    },
    cardinal_sins_envy: {
        display: "Odhran, Sin of Envy",
        tier: 3,
        dimension: "undergarden:undergarden",
        locator: "block",
        signatureBlock: "cardinal_sins:envyshrine",
        waystone: "Envy Shrine",
        summonEntity: "cardinal_sins:sinofenvy",
    },
    // Sloth is also Undergarden, but its only cardinal_sins block is the
    // ambiguous malevolichite_shrine (= natural ore-shrine worldgen) → no clean
    // block to scan for. Summon-route only; see header.
    cardinal_sins_sloth: {
        display: "Linneaus, Sin of Sloth",
        tier: 3,
        dimension: "undergarden:undergarden",
        locator: "summon",
        waystone: "Sloth Shrine",
        summonEntity: "cardinal_sins:linneausofsloth",
        ritual: "No unique arena beacon (shares the malevolichite shrine block). "
            + "Summon with /summon cardinal_sins:linneausofsloth, or explore the Undergarden.",
    },
    // Nether fierce sins + Drakara + Lucifer.
    cardinal_sins_lust: {
        display: "Freya, Sin of Lust",
        tier: 3,
        dimension: "minecraft:the_nether",
        locator: "block",
        signatureBlock: "cardinal_sins:lustshrine",
        waystone: "Lust Shrine",
        summonEntity: "cardinal_sins:sinoflust",
    },
    cardinal_sins_pride: {
        display: "Leon, Sin of Pride",
        tier: 3,
        dimension: "minecraft:the_nether",
        locator: "block",
        signatureBlock: "cardinal_sins:pride_shrine",
        waystone: "Pride Shrine",
        summonEntity: "cardinal_sins:sinofpride",
    },
    cardinal_sins_wrath: {
        display: "Beowulf, Sin of Wrath",
        tier: 3,
        dimension: "minecraft:the_nether",
        locator: "block",
        signatureBlock: "cardinal_sins:wrath_shrine",
        waystone: "Wrath Shrine",
        summonEntity: "cardinal_sins:sinofwrath",
    },
    // Drakara: template holds only the drakara entity (no shrine block) →
    // nothing to scan for. Summon-route only; see header.
    cardinal_sins_drakara: {
        display: "Drakara, Eternal Mourner",
        tier: 3,
        dimension: "minecraft:the_nether",
        locator: "summon",
        waystone: "Drakara's Roost",
        summonEntity: "cardinal_sins:drakara",
        ritual: "Arena has no unique beacon block. "
            + "Summon with /summon cardinal_sins:drakara, or explore the Nether.",
    },
    // Lucifer: the T3 capstone (100%-clear gate to T4). Atrocity shrine is unique.
    cardinal_sins_lucifer: {
        display: "Lucifer, The Atrocity",
        tier: 3,
        dimension: "minecraft:the_nether",
        locator: "block",
        signatureBlock: "cardinal_sins:atrocity_shrine",
        waystone: "Atrocity Shrine",
        summonEntity: "cardinal_sins:lucifer",
        ritual: "T3 capstone — clearing 100% of T3 (Lucifer included) opens Tier 4.",
    },

    // ===== T4 — Endgame (Deep Aether / End / Nether cathedral) ===============
    cataclysm_ender_guardian: {
        display: "Ender Guardian",
        tier: 4,
        dimension: "minecraft:the_end",
        structure: "cataclysm:ruined_citadel",
        waystone: "Ruined Citadel",
    },
    deep_aether_eots: {
        display: "Eye of the Storm",
        tier: 4,
        dimension: "deep_aether:deep_aether",
        structure: "deep_aether:brass_dungeon",
        waystone: "Brass Dungeon",
    },
    terramity_thunker: {
        display: "Thunker",
        tier: 4,
        dimension: "minecraft:the_nether",
        structure: "terramity:chthonic_cathedral",
        waystone: "Chthonic Cathedral",
    },
    terramity_virtue: {
        display: "Virtue",
        tier: 4,
        dimension: "deep_aether:deep_aether",
        structure: "terramity:prismatic_pond",
        waystone: "Prismatic Pond",
    },
    terramity_sorceress_circe: {
        display: "Sorceress Circe",
        tier: 4,
        dimension: "minecraft:the_end",
        structure: "terramity:mausoleum",
        waystone: "Mausoleum",
    },
}

// Normalize: any arena WITHOUT an explicit `locator` is structure-located (the
// original #46 default). Done once here so the consumers can switch on
// meta.locator unconditionally.
;(function () {
    for (const id in global.ICRAFT_BOSS_ARENAS) {
        const meta = global.ICRAFT_BOSS_ARENAS[id]
        if (!meta.locator) meta.locator = meta.structure ? "structure" : "summon"
    }
})()

// Convenience reverse-index: structure ID -> boss_id (the bonfire detector keys
// off the structure the player is standing in). Built once at load. Only
// structure-located arenas have a `structure`, so block/summon arenas are
// naturally absent here.
global.ICRAFT_BOSS_ARENAS_BY_STRUCTURE = (function () {
    const out = {}
    for (const id in global.ICRAFT_BOSS_ARENAS) {
        const meta = global.ICRAFT_BOSS_ARENAS[id]
        if (meta.structure) out[meta.structure] = id
    }
    return out
})()

;(function () {
    let nStruct = 0, nBlock = 0, nSummon = 0
    for (const id in global.ICRAFT_BOSS_ARENAS) {
        const l = global.ICRAFT_BOSS_ARENAS[id].locator
        if (l === "block") nBlock++
        else if (l === "summon") nSummon++
        else nStruct++
    }
    console.log("[iridescent/boss_arenas] registry loaded: "
        + Object.keys(global.ICRAFT_BOSS_ARENAS).length + " boss arenas ("
        + nStruct + " structure-located, " + nBlock + " block-located, "
        + nSummon + " summon-only)")
})()
