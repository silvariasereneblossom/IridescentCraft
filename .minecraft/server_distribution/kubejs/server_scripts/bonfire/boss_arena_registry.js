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
// SCOPE NOTE — only STRUCTURE-LOCKED arenas are in here. The catalog's
// biome-random / summon-item / scripted / feature-placed bosses have no fixed
// `Structure` the vanilla locator can point at:
//   • Brutal Bosses biome-random variants (Mad Cow, Evil Chicken, ...)   — no structure
//   • Mutant Monsters (Skull-Spirit summons)                             — no structure
//   • Meet Your Fight (Calling-Bell summons)                             — no structure
//   • Cardinal Sins arenas (Lucifer, the 7 sins, Drakara)               — FEATURE-placed
//        (forge:add_features / raw_generation — NOT in the structure registry,
//         so findNearestMapStructure can't see them; see #56 relocation)
//   • Stalwart Dungeons mobs                                            — overlay, no own structure
//   • Aether Sun Spirit / Valkyrie Queen                               — structure-locked but
//        also need an in-arena ritual; the structure IS locatable so they ARE listed.
// These excluded bosses are still tracked by codex_boss_rush.js for the combat
// advance route; they're simply not compass-targetable. The compass tells the
// player so (see boss_compass_handler.js "no locator" path) rather than hiding
// them. Expanding to non-structure discovery vectors is future work (catalog §).
//
// FIELD SHAPE per boss_id:
//   display    : human label (compass menu + bonfire broadcast)
//   tier       : 1-4 (AStages gate — see boss_compass_handler.getPlayerTier)
//   dimension  : the dimension ResourceLocation the arena generates in
//                (informational + a future cross-dim guard; the locator
//                 searches the player's current level regardless)
//   structure  : the worldgen Structure ResourceLocation to locate / detect
//   waystone   : the fixed bonfire waystone name (gets the "[Boss] " prefix +
//                " Bonfire" suffix applied by the bonfire system, so store the
//                bare arena label here)
//   ritual     : (optional) short note shown after locating, for arenas that
//                need an in-arena summon step (Aether gold/silver dungeons).
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

// Convenience reverse-index: structure ID -> boss_id (the bonfire detector keys
// off the structure the player is standing in). Built once at load.
global.ICRAFT_BOSS_ARENAS_BY_STRUCTURE = (function () {
    const out = {}
    for (const id in global.ICRAFT_BOSS_ARENAS) {
        const meta = global.ICRAFT_BOSS_ARENAS[id]
        if (meta.structure) out[meta.structure] = id
    }
    return out
})()

console.log("[iridescent/boss_arenas] registry loaded: "
    + Object.keys(global.ICRAFT_BOSS_ARENAS).length
    + " structure-locked boss arenas")
