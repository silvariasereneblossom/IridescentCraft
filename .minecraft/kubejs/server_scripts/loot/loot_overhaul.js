// =============================================================================
// LOOTJS LOOT TABLE OVERHAUL — Priority 4 + 5
// Boss material drops, structure loot tier enforcement,
// Simply Swords unique weapon → boss mapping, token fragment seeding
// Server script (reloadable with /reload)
// =============================================================================
// REQUIRES: LootJS (lootjs-forge-1.20.1-2.13.x via lootintegrations mod)
//
// Design principles from design doc (Sections 19, 26, 28):
// - Dungeon/structure loot must respect tier boundaries
// - Boss kills are THE primary source of custom materials
// - Simply Swords uniques are boss-exclusive drops (42 verified uniques)
// - Token fragments seed into structure chests as alt progression path
// - Curios/artifacts are NEVER gated (if they drop, player keeps them)
// - Enchanted books removed from structure chests (Apotheosis = enchanting)
// - Diamond gear removed from Tier 1, netherite from Tier 3
//
// All entity IDs and loot table paths verified via loot_discovery.js
// against live mod registry (Feb 2026 build)
// =============================================================================

LootJS.modifiers(event => {

    // =====================================================================
    // SECTION 1: BOSS MATERIAL DROPS + SIMPLY SWORDS UNIQUES
    // Each boss drops its custom kubejs material + has a chance at a
    // Simply Swords unique weapon (boss-exclusive, never from chests)
    //
    // Unique weapon assignments follow design doc Section 26:
    // - Tier 2: Agility/magic/fire/spectral/elemental/wind themes
    // - Tier 3: Shadow/fire/necrotic/corruption themes
    // - Tier 4: Draconic/reality/ender/ultimate themes
    // =====================================================================

    // -----------------------------------------------------------------
    // TIER 2 BOSSES — Twilight Forest
    // Entity IDs verified: naga, lich, hydra, ur_ghast,
    //   knight_phantom, snow_queen, minoshroom, alpha_yeti
    // -----------------------------------------------------------------

    // Twilight Naga — Agility/speed theme
    event.addEntityLootModifier("twilightforest:naga")
        .addLoot(
            LootEntry.of("kubejs:naga_scale").limitCount([2, 4])
        )
        .addWeightedLoot([
            Item.of("kubejs:t2_token_fragment").withChance(40),
            Item.of("kubejs:waystone_core").withChance(5)
        ])
        .addLoot(
            LootEntry.of("simplyswords:tempest").when(c => c.randomChance(0.15))
        )

    // Twilight Lich — Soul/magic theme
    event.addEntityLootModifier("twilightforest:lich")
        .addLoot(
            LootEntry.of("kubejs:lich_soul").limitCount([1, 3])
        )
        .addWeightedLoot([
            Item.of("kubejs:t2_token_fragment").withChance(40),
            Item.of("kubejs:basic_reforging_token").withChance(10)
        ])
        .addLoot(
            LootEntry.of("simplyswords:soulrender").when(c => c.randomChance(0.15))
        )

    // Twilight Hydra — Fire/power theme
    event.addEntityLootModifier("twilightforest:hydra")
        .addLoot(
            LootEntry.of("kubejs:hydra_fang").limitCount([2, 5])
        )
        .addWeightedLoot([
            Item.of("kubejs:t2_token_fragment").withChance(30),
            Item.of("kubejs:waystone_core").withChance(10)
        ])
        .addLoot(
            LootEntry.of("simplyswords:emberblade").when(c => c.randomChance(0.15))
        )

    // Ur-Ghast — Void/spectral theme (bridge boss, seeds T3)
    event.addEntityLootModifier("twilightforest:ur_ghast")
        .addLoot(
            LootEntry.of("kubejs:ur_ghast_tear").limitCount([1, 2])
        )
        .addWeightedLoot([
            Item.of("kubejs:t2_token_fragment").withChance(20),
            Item.of("kubejs:t3_token_fragment").withChance(10),
            Item.of("kubejs:basic_reforging_token").withChance(15)
        ])
        .addLoot(
            LootEntry.of("simplyswords:whisperwind").when(c => c.randomChance(0.20))
        )

    // Knight Phantom — Spectral theme
    event.addEntityLootModifier("twilightforest:knight_phantom")
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment").limitCount([1, 2])
        )
        .addLoot(
            LootEntry.of("simplyswords:enigma").when(c => c.randomChance(0.12))
        )

    // Snow Queen — Ice theme
    event.addEntityLootModifier("twilightforest:snow_queen")
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment").limitCount([1, 2])
        )
        .addLoot(
            LootEntry.of("simplyswords:frostfall").when(c => c.randomChance(0.15))
        )

    // Minoshroom — Brute theme (mini-boss tier, lower drop chance)
    event.addEntityLootModifier("twilightforest:minoshroom")
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment")
                .when(c => c.randomChance(0.35))
        )

    // Alpha Yeti — Frost theme (mini-boss tier)
    event.addEntityLootModifier("twilightforest:alpha_yeti")
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment")
                .when(c => c.randomChance(0.35))
        )
        .addLoot(
            LootEntry.of("simplyswords:icewhisper").when(c => c.randomChance(0.10))
        )

    // -----------------------------------------------------------------
    // TIER 2 BOSSES — Blue Skies
    // Verified: summoner, alchemist, starlit_crusher, arachnarch
    // (loot tables use the_summoner, the_alchemist, the_starlit_crusher)
    // -----------------------------------------------------------------

    // Blue Skies: Summoner — Elemental/summoning theme
    event.addEntityLootModifier("blue_skies:summoner")
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment").limitCount([1, 3])
        )
        .addWeightedLoot([
            Item.of("kubejs:basic_reforging_token").withChance(10),
            Item.of("kubejs:waystone_core").withChance(5)
        ])
        .addLoot(
            LootEntry.of("simplyswords:hiveheart").when(c => c.randomChance(0.15))
        )

    // Blue Skies: Alchemist — Poison/alchemy theme
    event.addEntityLootModifier("blue_skies:alchemist")
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment").limitCount([1, 3])
        )
        .addLoot(
            LootEntry.of("simplyswords:toxic_longsword").when(c => c.randomChance(0.15))
        )

    // Blue Skies: Starlit Crusher — Star/celestial theme
    event.addEntityLootModifier("blue_skies:starlit_crusher")
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment").limitCount([1, 3])
        )
        .addLoot(
            LootEntry.of("simplyswords:stars_edge").when(c => c.randomChance(0.15))
        )

    // Blue Skies: Arachnarch — Spider/web theme
    event.addEntityLootModifier("blue_skies:arachnarch")
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment").limitCount([1, 2])
        )
        .addLoot(
            LootEntry.of("simplyswords:waxweaver").when(c => c.randomChance(0.12))
        )

    // Blue Skies bosses — Runic Arc rare drop (5% from each boss)
    // Runic Arc crafting recipe removed in recipe_audit.js Section L.
    // This makes it a boss-gated progression item.
    ;["blue_skies:summoner", "blue_skies:alchemist",
      "blue_skies:starlit_crusher", "blue_skies:arachnarch"
    ].forEach(boss => {
        event.addEntityLootModifier(boss)
            .addLoot(
                LootEntry.of("blue_skies:runic_arc")
                    .when(c => c.randomChance(0.05))
            )
    })

    // -----------------------------------------------------------------
    // TIER 2 BOSSES — Aether
    // Verified: slider, valkyrie_queen, sun_spirit
    // -----------------------------------------------------------------

    // Aether: Slider — Impact/thunder theme
    event.addEntityLootModifier("aether:slider")
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment").limitCount([1, 3])
        )
        .addWeightedLoot([
            Item.of("kubejs:basic_reforging_token").withChance(10),
            Item.of("kubejs:waystone_core").withChance(5)
        ])
        .addLoot(
            LootEntry.of("simplyswords:thunderbrand").when(c => c.randomChance(0.15))
        )

    // Aether: Valkyrie Queen — Wind/ascension theme
    event.addEntityLootModifier("aether:valkyrie_queen")
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment").limitCount([1, 3])
        )
        .addLoot(
            LootEntry.of("simplyswords:caelestis").when(c => c.randomChance(0.15))
        )

    // Aether: Sun Spirit — Fire/radiance theme
    event.addEntityLootModifier("aether:sun_spirit")
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment").limitCount([1, 3])
        )
        .addLoot(
            LootEntry.of("simplyswords:sunfire").when(c => c.randomChance(0.15))
        )

    // -----------------------------------------------------------------
    // TIER 2-3 BRIDGE — Deep Aether
    // Verified: eots_controller (ONLY valid boss entity)
    // eots, boss, aether_boss DO NOT exist as entity IDs
    // -----------------------------------------------------------------

    event.addEntityLootModifier("deep_aether:eots_controller")
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment").limitCount([1, 3])
        )
        .addWeightedLoot([
            Item.of("kubejs:advanced_reforging_token").withChance(15),
            Item.of("kubejs:waystone_core").withChance(10)
        ])
        .addLoot(
            LootEntry.of("simplyswords:flamewind").when(c => c.randomChance(0.18))
        )

    // -----------------------------------------------------------------
    // TIER 3 BOSSES — Cataclysm
    // Verified: netherite_monstrosity, ignis, the_harbinger,
    //   the_leviathan, maledictus, ender_golem, ignited_revenant
    // -----------------------------------------------------------------

    // Cataclysm: Netherite Monstrosity — Heavy/brute theme
    event.addEntityLootModifier("cataclysm:netherite_monstrosity")
        .addLoot(
            LootEntry.of("kubejs:harbinger_eye").limitCount([1, 3])
        )
        .addWeightedLoot([
            Item.of("kubejs:t3_token_fragment").withChance(30),
            Item.of("kubejs:advanced_reforging_token").withChance(10)
        ])
        .addLoot(
            LootEntry.of("simplyswords:brimstone_claymore").when(c => c.randomChance(0.15))
        )

    // Cataclysm: Ignis — Ultimate fire theme
    event.addEntityLootModifier("cataclysm:ignis")
        .addLoot(
            LootEntry.of("kubejs:ignis_core").limitCount([1, 2])
        )
        .addWeightedLoot([
            Item.of("kubejs:t3_token_fragment").withChance(25),
            Item.of("kubejs:advanced_reforging_token").withChance(15),
            Item.of("kubejs:waystone_core").withChance(10)
        ])
        .addLoot(
            LootEntry.of("simplyswords:molten_edge").when(c => c.randomChance(0.20))
        )

    // Cataclysm: The Harbinger — Dark/shadow theme
    event.addEntityLootModifier("cataclysm:the_harbinger")
        .addLoot(
            LootEntry.of("kubejs:harbinger_eye").limitCount([1, 2])
        )
        .addWeightedLoot([
            Item.of("kubejs:t3_token_fragment").withChance(30),
            Item.of("kubejs:advanced_reforging_token").withChance(10)
        ])
        .addLoot(
            LootEntry.of("simplyswords:shadowsting").when(c => c.randomChance(0.18))
        )

    // Cataclysm: The Leviathan — Deep sea/abyss theme
    event.addEntityLootModifier("cataclysm:the_leviathan")
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment").limitCount([1, 3])
        )
        .addLoot(
            LootEntry.of("simplyswords:livyatan").when(c => c.randomChance(0.18))
        )

    // Cataclysm: Maledictus — Cursed/dark theme
    event.addEntityLootModifier("cataclysm:maledictus")
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment").limitCount([1, 2])
        )
        .addLoot(
            LootEntry.of("simplyswords:twisted_blade").when(c => c.randomChance(0.15))
        )

    // Cataclysm: Ignited Revenant — Fire/undead theme (1000 HP = T4 tier)
    event.addEntityLootModifier("cataclysm:ignited_revenant")
        .addLoot(
            LootEntry.of("kubejs:t4_token_fragment").limitCount([2, 4])
        )
        .addWeightedLoot([
            Item.of("kubejs:ultimate_reforging_token").withChance(15),
            Item.of("kubejs:waystone_core").withChance(10)
        ])
        .addLoot(
            LootEntry.of("simplyswords:emberlash").when(c => c.randomChance(0.15))
        )

    // Cataclysm: Ender Golem — Ender/construct theme (mini-boss tier)
    event.addEntityLootModifier("cataclysm:ender_golem")
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment")
                .when(c => c.randomChance(0.30))
        )

    // -----------------------------------------------------------------
    // TIER 3 BOSSES — Undergarden
    // Verified: forgotten_guardian (boss), forgotten (mini-boss)
    // IMPORTANT: "stygian" has a loot TABLE but no entity ID
    // -----------------------------------------------------------------

    // Undergarden: Forgotten Guardian — Corruption/ancient theme
    event.addEntityLootModifier("undergarden:forgotten_guardian")
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment").limitCount([1, 3])
        )
        .addWeightedLoot([
            Item.of("kubejs:advanced_reforging_token").withChance(10),
            Item.of("kubejs:waystone_core").withChance(8)
        ])
        .addLoot(
            LootEntry.of("simplyswords:bramblethorn").when(c => c.randomChance(0.18))
        )

    // Undergarden: Forgotten — Lesser variant
    event.addEntityLootModifier("undergarden:forgotten")
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment")
                .when(c => c.randomChance(0.20))
        )

    // -----------------------------------------------------------------
    // TIER 3 BOSSES — Deeper Darker
    // Verified: stalker, shattered, shriek_worm, sculk_centipede
    // -----------------------------------------------------------------

    // Deeper Darker: Stalker — Stealth/shadow theme
    event.addEntityLootModifier("deeperdarker:stalker")
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment").limitCount([1, 2])
        )
        .addLoot(
            LootEntry.of("simplyswords:soulstealer").when(c => c.randomChance(0.15))
        )

    // Deeper Darker: Shattered — Void/broken theme
    event.addEntityLootModifier("deeperdarker:shattered")
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment").limitCount([1, 2])
        )
        .addLoot(
            LootEntry.of("simplyswords:soulpyre").when(c => c.randomChance(0.15))
        )

    // Deeper Darker: Shriek Worm — Horror/sonic theme
    event.addEntityLootModifier("deeperdarker:shriek_worm")
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment").limitCount([1, 2])
        )

    // Deeper Darker: Sculk Centipede — Eldritch theme
    event.addEntityLootModifier("deeperdarker:sculk_centipede")
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment")
                .when(c => c.randomChance(0.25))
        )

    // -----------------------------------------------------------------
    // TIER 3 BOSSES — Vanilla (Nether-gated)
    // -----------------------------------------------------------------

    // Wither — Necrotic theme
    event.addEntityLootModifier("minecraft:wither")
        .addLoot(
            LootEntry.of("kubejs:wither_bone").limitCount([3, 6])
        )
        .addWeightedLoot([
            Item.of("kubejs:t3_token_fragment").withChance(20),
            Item.of("kubejs:t4_token_fragment").withChance(5),
            Item.of("kubejs:advanced_reforging_token").withChance(15)
        ])
        .addLoot(
            LootEntry.of("simplyswords:soulkeeper").when(c => c.randomChance(0.15))
        )

    // Accumulation materials: Blaze essence, Wither Skeleton soul fragment
    event.addEntityLootModifier("minecraft:blaze")
        .addLoot(
            LootEntry.of("kubejs:condensed_blaze_essence")
                .when(c => c.randomChance(0.08))
        )

    event.addEntityLootModifier("minecraft:wither_skeleton")
        .addLoot(
            LootEntry.of("kubejs:nether_soul_fragment")
                .when(c => c.randomChance(0.10))
        )

    // -----------------------------------------------------------------
    // TIER 4 BOSSES — Ender Dragon, Gaia Guardian, Cataclysm endgame
    // -----------------------------------------------------------------

    // Ender Dragon — Draconic ultimate theme
    event.addEntityLootModifier("minecraft:ender_dragon")
        .addLoot(
            LootEntry.of("kubejs:dragon_heart").limitCount([1, 1])
        )
        .addLoot(
            LootEntry.of("kubejs:dragon_scale").limitCount([4, 8])
        )
        .addWeightedLoot([
            Item.of("kubejs:t4_token_fragment").withChance(20),
            Item.of("kubejs:ultimate_reforging_token").withChance(15),
            Item.of("kubejs:waystone_core").withChance(10)
        ])
        .addLoot(
            LootEntry.of("simplyswords:waking_lichblade").when(c => c.randomChance(0.25))
        )

    // Gaia Guardian (Botania) — Nature/reality theme
    // Verified: entity is "botania:doppleganger" (single 'p', not doppelganger)
    // All three table variants exist: doppleganger, doppelganger, gaia_guardian
    event.addEntityLootModifier("botania:doppleganger")
        .addLoot(
            LootEntry.of("kubejs:gaia_spirit_fragment").limitCount([2, 4])
        )
        .addWeightedLoot([
            Item.of("kubejs:t4_token_fragment").withChance(25),
            Item.of("kubejs:ultimate_reforging_token").withChance(10)
        ])
        .addLoot(
            LootEntry.of("simplyswords:magiblade").when(c => c.randomChance(0.20))
        )

    // Cataclysm: Ender Guardian — Ender theme (Tier 4)
    event.addEntityLootModifier("cataclysm:ender_guardian")
        .addLoot(
            LootEntry.of("kubejs:t4_token_fragment").limitCount([1, 3])
        )
        .addWeightedLoot([
            Item.of("kubejs:ultimate_reforging_token").withChance(15),
            Item.of("kubejs:waystone_core").withChance(10)
        ])
        .addLoot(
            LootEntry.of("simplyswords:arcanethyst").when(c => c.randomChance(0.18))
        )

    // Cataclysm: Void Blossom — Void/nature theme (T4 boss)
    event.addEntityLootModifier("cataclysm:void_blossom")
        .addLoot(
            LootEntry.of("kubejs:t4_token_fragment").limitCount([2, 4])
        )
        .addWeightedLoot([
            Item.of("kubejs:ultimate_reforging_token").withChance(15),
            Item.of("kubejs:waystone_core").withChance(15)
        ])
        .addLoot(
            LootEntry.of("simplyswords:watching_warglaive").when(c => c.randomChance(0.18))
        )

    // Cataclysm: Ancient Remnant — Ultimate Cataclysm boss
    event.addEntityLootModifier("cataclysm:ancient_remnant")
        .addLoot(
            LootEntry.of("kubejs:t4_token_fragment").limitCount([2, 4])
        )
        .addWeightedLoot([
            Item.of("kubejs:ultimate_reforging_token").withChance(20),
            Item.of("kubejs:waystone_core").withChance(15)
        ])
        .addLoot(
            LootEntry.of("simplyswords:awakened_lichblade").when(c => c.randomChance(0.15))
        )

    // Warden — Void/sculk theme (Tier 4 equivalent encounter)
    event.addEntityLootModifier("minecraft:warden")
        .addLoot(
            LootEntry.of("kubejs:void_essence").limitCount([1, 3])
        )
        .addWeightedLoot([
            Item.of("kubejs:t4_token_fragment").withChance(30),
            Item.of("kubejs:waystone_core").withChance(15)
        ])
        .addLoot(
            LootEntry.of("simplyswords:stormbringer").when(c => c.randomChance(0.20))
        )

    // Elder Guardian — Ocean temple boss
    event.addEntityLootModifier("minecraft:elder_guardian")
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment").limitCount([1, 2])
        )

    // Enderman — rare void essence accumulation (END DIMENSION ONLY)
    event.addEntityLootModifier("minecraft:enderman")
        .anyDimension('minecraft:the_end')
        .addLoot(
            LootEntry.of("kubejs:void_essence")
                .when(c => c.randomChance(0.02))
        )


    // =====================================================================
    // SECTION 2: STRUCTURE/CHEST LOOT — Token Fragment Seeding
    // Injects tier-appropriate token fragments into structure chests
    // so exploration provides an alternative progression path.
    // All loot table paths verified via loot_discovery.js
    // =====================================================================

    // -----------------------------------------------------------------
    // TIER 1 Structures (Overworld surface) — seed T2 fragments
    // -----------------------------------------------------------------

    // Vanilla overworld structures
    event.addLootTableModifier(
        "minecraft:chests/simple_dungeon",
        "minecraft:chests/abandoned_mineshaft",
        "minecraft:chests/village/village_weaponsmith",
        "minecraft:chests/village/village_toolsmith",
        "minecraft:chests/village/village_armorer",
        "minecraft:chests/pillager_outpost",
        "minecraft:chests/woodland_mansion",
        "minecraft:chests/desert_pyramid",
        "minecraft:chests/jungle_temple",
        "minecraft:chests/igloo_chest",
        "minecraft:chests/buried_treasure",
        "minecraft:chests/shipwreck_treasure",
        "minecraft:chests/shipwreck_map",
        "minecraft:chests/shipwreck_supply",
        "minecraft:chests/underwater_ruin_big",
        "minecraft:chests/underwater_ruin_small",
        "minecraft:chests/ruined_portal"
    )
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment").limitCount([1, 2])
                .when(c => c.randomChance(0.25))
        )

    // -----------------------------------------------------------------
    // TIER 2 Structures (Twilight, Blue Skies, Aether) — T2 + T3
    // -----------------------------------------------------------------

    // Twilight Forest — all 24 verified chest types matched by regex
    event.addLootTableModifier(/^twilightforest:chests\/.*/)
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment").limitCount([1, 3])
                .when(c => c.randomChance(0.30))
        )
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment")
                .when(c => c.randomChance(0.08))
        )

    // Blue Skies — 5 verified dungeon chest tables
    event.addLootTableModifier(/^blue_skies:chests\/.*/)
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment").limitCount([1, 2])
                .when(c => c.randomChance(0.25))
        )
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment")
                .when(c => c.randomChance(0.05))
        )

    // Aether — 6 verified dungeon reward chests (bronze/silver/gold)
    event.addLootTableModifier(/^aether:chests\/.*/)
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment").limitCount([1, 2])
                .when(c => c.randomChance(0.25))
        )
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment")
                .when(c => c.randomChance(0.05))
        )

    // Deep Aether — verified: brass_dungeon, brass_dungeon_reward
    event.addLootTableModifier(/^deep_aether:.*/)
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment").limitCount([1, 2])
                .when(c => c.randomChance(0.25))
        )
        .addLoot(
            LootEntry.of("kubejs:t4_token_fragment")
                .when(c => c.randomChance(0.08))
        )

    // -----------------------------------------------------------------
    // TIER 3 Structures (Nether, Undergarden, Deeper Darker)
    // -----------------------------------------------------------------

    // Nether vanilla structures
    event.addLootTableModifier(
        "minecraft:chests/nether_bridge",
        "minecraft:chests/bastion_treasure",
        "minecraft:chests/bastion_other",
        "minecraft:chests/bastion_hoglin_stable",
        "minecraft:chests/bastion_bridge"
    )
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment").limitCount([1, 2])
                .when(c => c.randomChance(0.25))
        )
        .addLoot(
            LootEntry.of("kubejs:t4_token_fragment")
                .when(c => c.randomChance(0.05))
        )

    // Undergarden structure chests (verified: catacombs)
    event.addLootTableModifier(/^undergarden:chests\/.*/)
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment").limitCount([1, 2])
                .when(c => c.randomChance(0.25))
        )
        .addLoot(
            LootEntry.of("kubejs:t4_token_fragment")
                .when(c => c.randomChance(0.05))
        )

    // Deeper Darker — verified: ancient_temple chests
    event.addLootTableModifier(/^deeperdarker:chests\/.*/)
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment").limitCount([1, 3])
                .when(c => c.randomChance(0.30))
        )
        .addLoot(
            LootEntry.of("kubejs:t4_token_fragment")
                .when(c => c.randomChance(0.08))
        )

    // Cataclysm structure chests — verified tables:
    // soul_forge, burning_arena, sunken_city, cursed_pyramid, ruined_citadel
    event.addLootTableModifier(/^cataclysm:.*chest.*/)
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment").limitCount([1, 2])
                .when(c => c.randomChance(0.25))
        )

    // -----------------------------------------------------------------
    // TIER 4 Structures (End, Deep Aether)
    // -----------------------------------------------------------------

    // End structures
    event.addLootTableModifier(
        "minecraft:chests/end_city_treasure",
        "minecraft:chests/ancient_city"        // Ancient City = T3/T4 bridge
    )
        .addLoot(
            LootEntry.of("kubejs:t4_token_fragment").limitCount([1, 3])
                .when(c => c.randomChance(0.35))
        )
        .addLoot(
            LootEntry.of("kubejs:ultimate_reforging_token")
                .when(c => c.randomChance(0.08))
        )


    // =====================================================================
    // SECTION 3: REMOVE TIER-BREAKING LOOT
    // Strip items that bypass tier gating from structure chests
    // Design doc Section 19: "NO diamonds, steel, enchanted books
    //   above level 2" in Tier 1 structures
    // =====================================================================

    // Remove diamonds + diamond gear from Tier 1 overworld structures
    event.addLootTableModifier(
        "minecraft:chests/simple_dungeon",
        "minecraft:chests/abandoned_mineshaft",
        "minecraft:chests/buried_treasure",
        "minecraft:chests/shipwreck_treasure",
        "minecraft:chests/pillager_outpost",
        "minecraft:chests/woodland_mansion",
        "minecraft:chests/desert_pyramid",
        "minecraft:chests/jungle_temple",
        "minecraft:chests/stronghold_corridor",
        "minecraft:chests/stronghold_crossing",
        "minecraft:chests/stronghold_library",
        "minecraft:chests/igloo_chest"
    )
        .removeLoot("minecraft:diamond")
        .removeLoot("minecraft:diamond_horse_armor")
        .removeLoot("minecraft:diamond_helmet")
        .removeLoot("minecraft:diamond_chestplate")
        .removeLoot("minecraft:diamond_leggings")
        .removeLoot("minecraft:diamond_boots")
        .removeLoot("minecraft:diamond_sword")
        .removeLoot("minecraft:diamond_pickaxe")
        .removeLoot("minecraft:diamond_axe")
        .removeLoot("minecraft:diamond_shovel")
        .removeLoot("minecraft:diamond_hoe")
        .removeLoot("minecraft:enchanted_golden_apple")

    // Remove enchanted books from Tier 1 structures
    // (Apotheosis is the enchanting system — enchanted books in chests
    //  bypass the Apotheosis bookshelf progression)
    event.addLootTableModifier(
        "minecraft:chests/simple_dungeon",
        "minecraft:chests/abandoned_mineshaft",
        "minecraft:chests/stronghold_library",
        "minecraft:chests/stronghold_corridor",
        "minecraft:chests/stronghold_crossing",
        "minecraft:chests/woodland_mansion",
        "minecraft:chests/desert_pyramid",
        "minecraft:chests/jungle_temple",
        "minecraft:chests/pillager_outpost",
        "minecraft:chests/ancient_city"
    )
        .removeLoot("minecraft:enchanted_book")

    // Remove netherite from Tier 3 Nether structures
    event.addLootTableModifier(
        "minecraft:chests/bastion_treasure",
        "minecraft:chests/bastion_other",
        "minecraft:chests/bastion_hoglin_stable",
        "minecraft:chests/bastion_bridge"
    )
        .removeLoot("minecraft:netherite_ingot")
        .removeLoot("minecraft:netherite_scrap")
        .removeLoot("minecraft:ancient_debris")


    // =====================================================================
    // SECTION 4: MODDED STRUCTURE LOOT
    // Verified mod IDs from discovery scan.
    // Only mods confirmed PRESENT are included.
    // =====================================================================

    // -----------------------------------------------------------------
    // Dungeons Arise — VERIFIED namespace: "dungeons_arise:" (NOT when_dungeons_arise)
    // 20 verified chest tables including: aviary_tower, bandit_towers,
    // bathhouse, coliseum, ceryneian_hind, foundry, illager_fort,
    // illager_hall, infested_temple, keep_kayra, lighthouse, monastery,
    // mushroom variants, plague_asylum, small_blimp, thornborn_towers,
    // trading_outpost, wishing_well
    // Tier: Mixed T1-T2 (overworld structures)
    // -----------------------------------------------------------------
    event.addLootTableModifier(/^dungeons_arise:chests\/.*/)
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment")
                .when(c => c.randomChance(0.20))
        )
        .removeLoot("minecraft:diamond")
        .removeLoot("minecraft:diamond_sword")
        .removeLoot("minecraft:diamond_chestplate")
        .removeLoot("minecraft:diamond_leggings")
        .removeLoot("minecraft:diamond_boots")
        .removeLoot("minecraft:diamond_helmet")
        .removeLoot("minecraft:enchanted_book")

    // -----------------------------------------------------------------
    // YUNG's Better Dungeons — verified: common, special,
    //   zombie_dungeon, skeleton_dungeon, spider_dungeon
    // Tier: T1-T2 (overworld dungeons)
    // -----------------------------------------------------------------
    event.addLootTableModifier(/^betterdungeons:.*/)
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment")
                .when(c => c.randomChance(0.20))
        )
        .removeLoot("minecraft:diamond")
        .removeLoot("minecraft:enchanted_book")

    // -----------------------------------------------------------------
    // YUNG's Better Strongholds — verified: library, corridor,
    //   crossing, portal_room, grand_library
    // Tier: T2-T3 (late overworld)
    // -----------------------------------------------------------------
    event.addLootTableModifier(/^betterstrongholds:.*/)
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment")
                .when(c => c.randomChance(0.15))
        )
        .removeLoot("minecraft:enchanted_book")

    // -----------------------------------------------------------------
    // YUNG's Better Fortresses — verified: common, special, blaze_spawner
    // Tier: T3 (Nether)
    // -----------------------------------------------------------------
    event.addLootTableModifier(/^betterfortresses:.*/)
        .addLoot(
            LootEntry.of("kubejs:t3_token_fragment")
                .when(c => c.randomChance(0.20))
        )
        .removeLoot("minecraft:enchanted_book")

    // -----------------------------------------------------------------
    // YUNG's Better Mineshafts — verified present
    // Tier: T1 (overworld)
    // -----------------------------------------------------------------
    event.addLootTableModifier(/^bettermineshafts:.*/)
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment")
                .when(c => c.randomChance(0.15))
        )
        .removeLoot("minecraft:diamond")
        .removeLoot("minecraft:enchanted_book")

    // -----------------------------------------------------------------
    // YUNG's Better Ocean Monuments — verified present
    // Tier: T2 (challenging overworld)
    // -----------------------------------------------------------------
    event.addLootTableModifier(/^betteroceanmonuments:.*/)
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment")
                .when(c => c.randomChance(0.20))
        )

    // -----------------------------------------------------------------
    // Valhelsia Structures — verified present
    // Tier: T1-T2 (overworld structures)
    // -----------------------------------------------------------------
    event.addLootTableModifier(/^valhelsia_structures:.*/)
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment")
                .when(c => c.randomChance(0.15))
        )
        .removeLoot("minecraft:diamond")
        .removeLoot("minecraft:enchanted_book")

    // -----------------------------------------------------------------
    // ChoiceTheorem's Overhauled Village — verified: "ctov"
    // Tier: T1 (villages)
    // -----------------------------------------------------------------
    event.addLootTableModifier(/^ctov:.*/)
        .addLoot(
            LootEntry.of("kubejs:t2_token_fragment")
                .when(c => c.randomChance(0.12))
        )
        .removeLoot("minecraft:diamond")

    // NOTE: The following mods were NOT found in the loaded mod list:
    // - betterendisland (NOT present)
    // - repurposed_structures (NOT present)
    // - integrated_stronghold (NOT present)
    // - integrated_dungeons (NOT present)
    // - dungeon_crawl (NOT present)
    // - explorations / explorify (NOT present)
    // If these mods are added later, uncomment and verify their namespaces.


    // =====================================================================
    // SECTION 5: ENCHANTED BOOK REMOVAL FROM MODDED STRUCTURES
    // Design doc Section 28: "Villager enchanted book trades bypass
    //   Apotheosis enchanting" — same applies to structure loot
    // Books in chests let players skip the Apotheosis bookshelf
    //   progression entirely. Remove from all T1-T2 structures.
    // =====================================================================

    // Broad enchanted book removal from modded T1-T2 structure chests
    // (T3+ structures can keep books as the player has earned them)
    event.addLootTableModifier(/^twilightforest:chests\/.*/)
        .removeLoot("minecraft:enchanted_book")

    event.addLootTableModifier(/^blue_skies:chests\/.*/)
        .removeLoot("minecraft:enchanted_book")

    event.addLootTableModifier(/^aether:chests\/.*/)
        .removeLoot("minecraft:enchanted_book")


    // =====================================================================
    // SECTION 6: FISHING LOOT TIER-GATING
    // Fishing shouldn't bypass tier system. Remove rare items from
    // fishing loot tables that would break progression.
    // =====================================================================

    event.addLootTableModifier(
        "minecraft:gameplay/fishing/treasure"
    )
        .removeLoot("minecraft:enchanted_book")     // Apotheosis handles enchanting
        .removeLoot("minecraft:saddle")             // Keep — utility, not progression
        .removeLoot("minecraft:name_tag")           // Keep — utility


    // =====================================================================
    // SECTION 7: MOB DROP STRIPPING — gear + tier-gated raw materials
    // Design doc Section 28: "Mob farms producing Apotheosis affix gear
    //   trivializes gear progression"
    //
    // Two concerns here:
    //   1. Top-tier gear drops (design-doc level gripe) — covered by the
    //      diamond/netherite tool+armor strip below.
    //   2. 2026-04-24: raw tier-gated materials (diamond, emerald_block,
    //      ender_eye, ender_pearl, nether_star, netherite_*) appearing on
    //      ordinary mobs. Tester killed a vanilla spider that dropped
    //      minecraft:diamond + minecraft:ender_eye. Source could not be
    //      identified via JSON grep — no mod's loot_tables/entities/spider
    //      override, no GLM with those literal strings, no KubeJS script
    //      adds them. It must be an in-code (Java mixin) injector we
    //      haven't pinned down. Defensive fix: unconditionally strip these
    //      items from every entity loot pool so the source doesn't matter.
    //      If a future boss needs to drop one of these (e.g., wither drops
    //      nether_star), that boss's own loot table will need to re-add
    //      via a more specific modifier scoped to that entity.
    // =====================================================================

    // Tier-gated gear strip (unchanged — still blocks diamond/netherite
    // equipment flooding from mob-farm loops).
    event.addLootTypeModifier(LootType.ENTITY)
        .removeLoot("minecraft:diamond_sword")
        .removeLoot("minecraft:diamond_helmet")
        .removeLoot("minecraft:diamond_chestplate")
        .removeLoot("minecraft:diamond_leggings")
        .removeLoot("minecraft:diamond_boots")
        .removeLoot("minecraft:diamond_pickaxe")
        .removeLoot("minecraft:diamond_axe")
        .removeLoot("minecraft:netherite_sword")
        .removeLoot("minecraft:netherite_helmet")
        .removeLoot("minecraft:netherite_chestplate")
        .removeLoot("minecraft:netherite_leggings")
        .removeLoot("minecraft:netherite_boots")

    // Raw tier-gated material strip — unconditional, all entities, all
    // dimensions. Scoped narrowly to items that NEVER legitimately drop
    // from any vanilla mob: diamond/diamond_block (only from ores and
    // chests), ender_eye (crafted-only), ancient_debris/netherite_*
    // (only from mining), elytra (end city chest only), diamond_block
    // and netherite_block (never generated as drops).
    //
    // Intentionally NOT stripped here (legitimate mob drops we don't
    // want to break):
    //   - ender_pearl — endermen drop these
    //   - totem_of_undying — evokers drop these (farmable by design
    //     in vanilla; if we want to gate, use a per-entity modifier)
    //   - nether_star — wither drops this
    //   - dragon_egg — dragon drops (as a block, not entity drop, but
    //     don't risk the coupling)
    //   - emerald — villagers can throw these; we don't want to break
    //     that interaction (we strip emerald_block only, since that's
    //     never a mob drop)
    event.addLootTypeModifier(LootType.ENTITY)
        .removeLoot("minecraft:diamond")
        .removeLoot("minecraft:diamond_block")
        .removeLoot("minecraft:emerald_block")
        .removeLoot("minecraft:ender_eye")
        .removeLoot("minecraft:netherite_ingot")
        .removeLoot("minecraft:netherite_scrap")
        .removeLoot("minecraft:netherite_block")
        .removeLoot("minecraft:ancient_debris")
        .removeLoot("minecraft:elytra")


    // =====================================================================
    // SECTION 8: SIMPLY SWORDS UNIQUE ALLOCATION SUMMARY
    // Tracking which of the 42 verified uniques are assigned to bosses.
    // Unassigned weapons remain in the pool for future boss mods
    // (NovaBosses, Ultimate Bosses, Ultris, Brutal Bosses, etc.)
    //
    // ASSIGNED (28/42):
    //   T2: tempest(Naga), soulrender(Lich), emberblade(Hydra),
    //       whisperwind(UrGhast), enigma(KnightPhantom),
    //       frostfall(SnowQueen), icewhisper(AlphaYeti),
    //       hiveheart(Summoner), toxic_longsword(Alchemist),
    //       stars_edge(StarlitCrusher), waxweaver(Arachnarch),
    //       thunderbrand(Slider), caelestis(ValkyrieQueen),
    //       sunfire(SunSpirit), flamewind(EotsController)
    //   T3: brimstone_claymore(NetheriteMonstrosity),
    //       molten_edge(Ignis), shadowsting(Harbinger),
    //       livyatan(Leviathan), twisted_blade(Maledictus),
    //       emberlash(IgnitedRevenant), bramblethorn(ForgottenGuardian),
    //       soulstealer(Stalker), soulpyre(Shattered),
    //       soulkeeper(Wither)
    //   T4: waking_lichblade(EnderDragon), magiblade(GaiaGuardian),
    //       arcanethyst(EnderGuardian), awakened_lichblade(AncientRemnant),
    //       stormbringer(Warden), watching_warglaive(VoidBlossom),
    //       emberlash(IgnitedRevenant — promoted to T4)
    //
    // UNASSIGNED (11/42) — reserved for future bosses:
    //   harbinger, hearthflame, magiscythe, magispear, mjolnir,
    //   ribboncleaver, slumbering_lichblade, sword_on_a_stick,
    //   storms_edge, watcher_claymore, wickpiercer
    // =====================================================================

})
