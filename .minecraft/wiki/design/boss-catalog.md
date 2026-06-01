# Boss Catalog — IridescentCraft

> **Purpose.** Scoping artifact for Task #46 (unified boss compass + auto-waystone system). Audits every progression boss in the live PrismLauncher modlist (`%APPDATA%\PrismLauncher\instances\IridescentCraft\.minecraft\mods\`, 450 jars), assigns each to a tier per [`master.md`](master.md) / [`master-appendix.md`](master-appendix.md), and scores how hard the boss is to *find* without an external wiki.
>
> **Audit method.** Unzipped boss-candidate jars to `/tmp/icraft_audit/<modid>/`, bytecode-grepped class files for `BossEvent$BossBarColor` and `ServerBossEvent` usage, cross-referenced against `assets/<modid>/lang/en_us.json`, `data/<modid>/worldgen/structure*.json`, biome `has_structure` tags, advancement files, and the `boss_checklist-forge-4.1.0.jar` `bosses.json` registry (which itself lists 167 known bosses across 57 mod prefixes — only the in-pack subset is included below). Tier assignment cross-references `master-appendix.md §C` (Boss → Loot Mapping), `§F` (Mod Roster by Tier), and `kubejs/server_scripts/gates/milestone_detection.js` (TIER_2_BOSSES / TIER_3_BOSSES / TIER_4_BOSSES arrays).
>
> **Column definitions.**
> - **Tier** — T1 / T2 / T3 / T4 / postgame. `?` = uncertain, see footnote.
> - **Spawn Mechanism** — `structure-locked` (boss is part of a specific structure piece), `biome-conditional-random` (natural spawn in matching biomes), `summoned-by-item` (player crafts a summon item + uses on altar), `summoned-by-altar` (player builds an altar/ritual + activates), `dimensional-arrival` (boss spawns on dimension entry / first portal use), `scripted` (KubeJS / advancement-driven custom trigger).
> - **Spawn Location** — Structure name + dimension, or biome list + dimension for non-structure spawns.
> - **Notable Drops** — Top 3 items players want (cross-referenced from `master-appendix.md §C` where the pack assigns drops via KubeJS LootJS).
> - **Discovery Pain** — 1-5 score for how hard the boss is to *find* in-game without an external wiki.
>   - **1** — Trivial. Compass-finding mod (Explorer's Compass) lists the structure and works on first try.
>   - **2** — Easy. Structure has worldgen advancement / clear signal once you're in the right biome.
>   - **3** — Moderate. Boss exists but the player won't know where to look without doing the quest book / Patchouli first.
>   - **4** — Hard. Random biome spawn with no compass support, OR boss requires multi-step summoning the codex doesn't fully explain.
>   - **5** — Nearly impossible. No in-game discovery vector at all (mod has no spawn-egg-tooltip, no compass entry, no Patchouli mention, no advancement breadcrumb).
>
> Bosses scoring **4-5 are the priority list for the compass system**. Bosses scoring 1-2 are bonus coverage — Explorer's Compass already partially solves them.
>
> **Mods checked but no progression bosses found.** `forbidden_arcanus` (Lost Soul is ambient, not boss-tier), `mahoutsukai` (only Fae/Familiar/Kodoku/Butterfly summons — no boss bar entities), `art_of_forging` (Tetra weapon framework, no entities), `cataclysm_ut` (utility addon only), `multiplayerbosses` (vanilla Dragon/Wither/Warden enhancer, no new entities), `mutantmonsters` (mutant variants are boss-tier mob-spawned but no boss bar — listed under T2/T3 below as honorable mention), `bossultimatum` (death-ultimatum mechanic only).
>
> **Mods cross-referenced from `master.md` but NOT in the pack.** Alex's Caves (`alexscaves:luxtructosaurus`), Mowzie's Mobs (`mowziesmobs:ferrous_wroughtnaut`, etc), Friends and Foes (`friendsandfoes:wildfire`), Illage and Spillage, Adventurez, Goety, Knightquest, Soulsweapons, Aquamirae, Legendary Monsters, the Wetlands, Galosphere, Frostiful, Bosses of Mass Destruction, Born in Chaos, Mythic Mobs/Legends, MutantMore, etc. The Boss Checklist registry mentions these but `/tmp/all_mods.txt` confirms they are NOT installed. The `master.md` "theabyss" Nosaj boss line is also NOT present in the live pack — the design doc references appear to be aspirational / removed.

---

## T1 — Overworld (entry tier)

> **⚠ 2026-05-30 audit (source-verified; full-roster pass still pending).** Mid-revision per the **location-based tiering** decision (overworld = T1) + a jar-level re-audit:
> - **LuMoreBossesAndMobs REMOVED — phantom.** Mod not installed; `macholote` / `gold_mini_golem` don't exist in the live pack (the catalog had footnoted its own uncertainty).
> - **Brutal Bosses = placeholder.** Today's only *genuine* T1 source (~18 overworld variants, no tier-gates), but it's "vanilla mobs with boss stats" — flagged for replacement with a boss mod that fits the pack's vibe. The jar actually ships ~18 overworld bosses; `pillagerboss` / `vindicatorboss` / `evokerboss` / `vexboss` / `archmageboss` / `guardianboss` / `zombietoxicboss` are **not yet listed below** (deliberately — pending the mod decision).
> - **Terramity mis-tiered.** Its guidebook makes Gob (boss #1) a *Diamond/Netherite-gear* fight, and every summon item is priced in diamond→endgame mats. Per #54: **Gob** kept T1 with a re-priced *emerald* summon; **Virtue → Deep Aether (T4)** and **Sorceress Circe → The End (T4)** relocated so their endgame gates become correct; `super_sniffer` + `enchanter_merlin` **confirmed T1** (structure-locked overworld, no above-T1 summon gate — they have no summon item to re-price; jar-verified per #54). #53 retunes their structure spawn density for findability.
> - **No canonical T1 trophy boss** — `milestone_detection.js` curates only T2–T4. T1 is "optional boss-tier content" until the tracker's per-tier boss **tag** is authored (compass reads a curated tag, not auto-detect).

| Mod | Entity ID | Display Name | Tier | Spawn Mechanism | Spawn Location | Notable Drops | Discovery Pain |
|-----|-----------|--------------|:---:|------------------|----------------|---------------|:--------------:|
| L_Ender's Cataclysm | `cataclysm:netherite_monstrosity` (Old) | Old Netherite Monstrosity | T1[^t1cata] | structure-locked | n/a (legacy entity) | (legacy) | 1 |
| Brutal Bosses | `brutalbosses:zombieboss` | Zombie Boss (variant) | T1 | structure-locked | Overworld dungeons, YUNG structures | base zombie loot + bonus affix loot | 2 |
| Brutal Bosses | `brutalbosses:skeletonshieldboss` | Skeleton Boss (variant) | T1 | structure-locked | Overworld dungeons, YUNG structures | base + affix loot | 2 |
| Brutal Bosses | `brutalbosses:cavespiderboss` | Cave Spider Boss | T1 | structure-locked | Mineshafts | base + affix loot | 2 |
| Brutal Bosses | `brutalbosses:huskboss` | Husk Boss | T1 | structure-locked | Desert temples | base + affix loot | 2 |
| Brutal Bosses | `brutalbosses:strayboss` | Stray Boss | T1 | structure-locked | Snowy biome dungeons | base + affix loot | 2 |
| Brutal Bosses | `brutalbosses:drownedboss` | Drowned Boss | T1 | structure-locked | Ocean monuments, shipwrecks | base + affix loot | 2 |
| Brutal Bosses | `brutalbosses:phantomboss` | Phantom Boss | T1 | scripted | Spawns after 3 days no sleep | base + affix loot | 3 |
| Brutal Bosses | `brutalbosses:witchboss` | Witch Boss | T1 | structure-locked | Witch huts, swamp structures | base + affix loot | 2 |
| Brutal Bosses | `brutalbosses:irongolemboss` | Iron Golem Boss | T1 | structure-locked | Pillager outposts, ruined villages | base + affix loot | 2 |
| Brutal Bosses | `brutalbosses:rabbitboss` | Killer Rabbit Boss | T1 | biome-conditional-random | Rabbit-spawning biomes | base + affix loot | 4 |
| Brutal Bosses | `brutalbosses:madcowboss` | Mad Cow Boss | T1 | biome-conditional-random | Plains, forests | base + affix loot | 4 |
| Brutal Bosses | `brutalbosses:evilchickenboss` | Evil Chicken Boss | T1 | biome-conditional-random | Plains, forests | base + affix loot | 4 |
| Brutal Bosses | `brutalbosses:snowgolemboss` | Snow Golem Boss | T1 | biome-conditional-random | Snow biomes | base + affix loot | 4 |
| Brutal Bosses | `brutalbosses:dummyboss` | Dummy Boss | T1 | scripted | Test entity (devs) | nothing | 5 |
| Mutant Monsters | `mutantmonsters:mutant_zombie` | Mutant Zombie | T1-T2 | scripted (lightning + skull spirit) | Overworld surface, summoned via Skull Spirit on zombie corpse | mutant zombie hulk hammer | 4 |
| Mutant Monsters | `mutantmonsters:mutant_skeleton` | Mutant Skeleton | T1-T2 | scripted (Skull Spirit on skeleton bones) | Overworld surface | mutant skeleton skull/pelvis/limb/rib/shoulder pad | 4 |
| Mutant Monsters | `mutantmonsters:mutant_creeper` | Mutant Creeper | T1-T2 | biome-conditional-random | Overworld surface (low spawn) | gunpowder, creeper minion egg | 4 |
| Terramity | `terramity:gob` | Gob, King of Gnomes | T1 (kept; summon re-priced to emerald) | structure-locked | `terramity:court_of_gnomes` — swamp / dark forest / `#forge:is_swamp` | gobs_claymore, gobs_gilded_hat, belt_of_the_gnome_king | 3 |
| Terramity | `terramity:enchanter_merlin` | Enchanter Merlin | T1 (confirmed) | structure-locked | `terramity:fairy_fountain`, `terramity:sword_shrine` — overworld | wizard staff, fairy summoning items | 3 |
| Terramity | `terramity:virtue` | Virtue | **T4 → Deep Aether** | structure-locked | `terramity:prismatic_pond` — **Deep Aether** (relocated, was overworld) | archangel_halo, holy items | 3 |
| Terramity | `terramity:super_sniffer` | Super Sniffer | T1 (confirmed) | structure-locked | `terramity:ancient_outcrop` — desert / hot biomes | super_sniffers_pelt, giant_sniffers_hoof | 3 |
| Terramity | `terramity:ultra_sniffer` | Ultra Sniffer | T2 | scripted (post-Super Sniffer) | summoned by Super Sniffer's Pelt | sniffer_kamehameha | 4 |
| Terramity | `terramity:gundalf` | Archmage Gundalf | T2 | structure-locked | `terramity:trial_spire` — ocean biomes | gundalfs_hat, guardians_hand | 3 |
| Terramity | `terramity:trial_guardian` | Trial Guardian | T2 | structure-locked | `terramity:trial_spire` deep boss room | guardian_grimoire, guardians_hand, energized_core | 3 |
| Terramity | `terramity:sorceress_circe` | Sorceress Circe | **T4 → The End** | structure-locked | `terramity:mausoleum` — **The End** (relocated, was taiga) | malediction_bracelets, evil_king_armor pieces | 3 |
| Mowzie's Mobs | `mowziesmobs:frostmaw` | Frostmaw | T1 | structure-locked | `mowziesmobs:frostmaw_spawn` — `#forge:is_snowy` overworld (excl. ocean/river/beach/forest/taiga), 25-spacing | ice_crystal, frozen_core, `mowziesmobs:naga_fang_dagger` mats | 2 |
| Mowzie's Mobs | `mowziesmobs:ferrous_wroughtnaut` | Ferrous Wroughtnaut | T1 | structure-locked | `mowziesmobs:wrought_chamber` — underground overworld (all `has_mowzie_structure` biomes) | wrought_axe (Axe of a Thousand Metals), wrought_helmet | 2 |
| Mowzie's Mobs | `mowziesmobs:umvuthi` | Umvuthi, the Sunbird | T1 | structure-locked | `mowziesmobs:umvuthana_grove` — `minecraft:is_savanna` overworld | sol_visage mask, sun's blessing, solar beam mats | 2 |
| Mowzie's Mobs | `mowziesmobs:sculptor` | Tongbi, the Sculptor | T1 | structure-locked + trade-challenge | `mowziesmobs:monastery` — `#forge:is_peak` overworld | sculptor_staff (geomancy), earthrend gauntlet mats | 3 |
| Mowzie's Mobs | `mowziesmobs:naga` | Naga (mini-boss) | T1 | biome-conditional-random | `minecraft:is_beach` / `minecraft:is_mountain`+`is_hill` overworld | naga_fang (→ naga_fang_dagger), naga scales | 4 |
| Marium's Soulslike Weaponry | `soulsweapons:draugr_boss` | Old Champion's Remains | T1 | structure-locked + summoned-by-altar | `soulsweapons:champions_graves` — `#minecraft:is_taiga` overworld (boss pre-placed); also Old Moon Altar + Draugr sword | essence_of_eventide, lord_soul, draugr weapon | 2 |
| Marium's Soulslike Weaponry | `soulsweapons:returning_knight` | Returning Knight | T1 | summoned-by-altar | Old Moon Altar (`soulsweapons:altar_block`, OW iron+moonstone+obsidian) + `#soulsweapons:lost_soul` item | nightfall (undead-army sword), lord_soul | 4 |
| Marium's Soulslike Weaponry | `soulsweapons:night_shade` | Frenzied Shade | T1 | scripted (emerge/ambush) | summoned/ambush spawn — no fixed structure | shadow-themed drops, soul mats | 4 |
| Marium's Soulslike Weaponry | `soulsweapons:moonknight` | Fallen Icon → Harbinger of Moonlight | T1 (location) / ⚠ difficulty T2 | summoned-by-altar | `soulsweapons:cathedral_of_resurrection` — `#minecraft:is_hill` overworld; return `essence_of_eventide` to body | essence_of_luminescence, moonlight greatsword (Bluemoon), holy moonlight | 3 |

**T1 subtotal (pre-full-audit):** Brutal Bosses (~18 overworld, undercounted above) + 3 Mutant Monsters + Terramity Gob / Super Sniffer / Merlin + **Mowzie's Mobs ×5 (Frostmaw, Ferrous Wroughtnaut, Umvuthi, Sculptor + Naga mini-boss — all overworld structure/biome spawns)** + **Marium's Soulslike Weaponry ×4 early chain (Draugr, Returning Knight, Night Shade, Moonknight — overworld structures/altars)**. The remaining 4 Soulsweapons bosses (Decaying King, Chaos Monarch, Day Stalker, Night Prowler) are Nether-anchored → T3 (below). LuMoreBosses (phantom ×2) and the legacy Cataclysm entity dropped; Virtue + Circe relocated to T4. Final counts pending the full-roster audit.

---

## T2 — First-dimensional (Twilight / Aether / Blue Skies)

| Mod | Entity ID | Display Name | Tier | Spawn Mechanism | Spawn Location | Notable Drops | Discovery Pain |
|-----|-----------|--------------|:---:|------------------|----------------|---------------|:--------------:|
| Twilight Forest | `twilightforest:naga` | Naga | T2 | structure-locked | `naga_courtyard`, Twilight Forest dimension | naga_scale, naga_trophy, `simplyswords:tempest` @ 15%, t2_token_fragment | 1 |
| Twilight Forest | `twilightforest:lich` | Lich | T2 | structure-locked | `lich_tower`, Twilight Forest | lich_trophy, fortification/lifedrain/twilight/zombie scepters @ 25%, lich_soul, `simplyswords:soulrender` @ 15% | 1 |
| Twilight Forest | `twilightforest:hydra` | Hydra | T2 | structure-locked | `hydra_lair`, Twilight Forest swamp biome | hydra_fang, waystone_core, `simplyswords:emberblade` @ 15% | 1 |
| Twilight Forest | `twilightforest:ur_ghast` | Ur-Ghast | T2-T3 | structure-locked | `dark_tower`, Twilight Forest dark forest | ur_ghast_tear, t2+t3 token fragments, `simplyswords:whisperwind` @ 20% | 1 |
| Twilight Forest | `twilightforest:knight_phantom` | Knight Phantom | T2 | structure-locked | `knight_stronghold`, Twilight Forest | t2_token_fragment, `simplyswords:enigma` @ 12% | 1 |
| Twilight Forest | `twilightforest:snow_queen` | Snow Queen | T2 | structure-locked | `aurora_palace`, Twilight Forest snow biome | ice_staff @ 50%, t2_token_fragment, `simplyswords:frostfall` @ 15% | 1 |
| Twilight Forest | `twilightforest:minoshroom` | Minoshroom | T2 | structure-locked | `labyrinth`, Twilight Forest swamp | diamond_minotaur_axe, meef_stroganoff, minoshroom_trophy | 1 |
| Twilight Forest | `twilightforest:alpha_yeti` | Alpha Yeti | T2 | structure-locked | `yeti_cave`, Twilight Forest snow biome | ice_staff @ 25%, t2_token_fragment, `simplyswords:icewhisper` @ 10% | 1 |
| Blue Skies | `blue_skies:summoner` | Summoner | T2 | summoned-by-altar | `nature_dungeon` (snow_covered_pines biome, Everbright) → use `blue_skies:nature_key` + summoning_tome | gold_spell_book, source_gem, basic_reforging_token, waystone_core, `simplyswords:hiveheart` @ 15%, alchemy_scroll | 2 |
| Blue Skies | `blue_skies:alchemist` | Alchemist | T2 | summoned-by-altar | `poison_dungeon` (sunset_maple_forest biome, Everdawn) → use `blue_skies:poison_key` + summoning_tome | oakskin_elixir, evasion_elixir, `simplyswords:toxic_longsword` @ 15% | 2 |
| Blue Skies | `blue_skies:starlit_crusher` | Starlit Crusher | T2 | summoned-by-altar | `everbright_blinding_dungeon` (calming_skies / brisk_meadow biomes, Everbright) → use `blue_skies:blinding_key` + summoning_tome | lightning_upgrade_orb @ 15%, `simplyswords:stars_edge` @ 15%, runic_arc @ 5% | 2 |
| Blue Skies | `blue_skies:arachnarch` | Arachnarch | T2 | summoned-by-altar | `everdawn_blinding_dungeon` (Everdawn variant of blinding dungeon) → blinding_key + summoning_tome | `simplyswords:waxweaver` @ 12%, runic_arc @ 5% | 2 |
| Aether | `aether:slider` | Slider | T2 | structure-locked | `bronze_dungeon` (Aether dimension, bronze biome) | bronze_dungeon_key, carved_stone, `simplyswords:thunderbrand`, `terramity:olympus` @ 5%, t2_token_fragment | 1 |
| Aether | `aether:valkyrie_queen` | Valkyrie Queen | T2 | structure-locked + scripted | `silver_dungeon` (Aether), requires `aether:revoker` interaction | magehunter @ 30%, `simplyswords:caelestis`, t2_token_fragment | 2 |
| Aether | `aether:sun_spirit` | Sun Spirit | T2 | structure-locked + scripted | `gold_dungeon` (Aether), requires summon ritual on Sun Altar | `simplyswords:sunfire`, `terramity:divine_intervention` @ 10%, t2_token_fragment | 2 |
| Meet Your Fight | `meetyourfight:bellringer` | Bellringer | T2 | summoned-by-item | overworld (anywhere using a Calling Bell) | mod-specific cosmetics, music disc | 4 |
| Meet Your Fight | `meetyourfight:swampjaw` | Swampjaw | T2 | summoned-by-item | swamp biome (Bog Heart) | mod-specific cosmetics | 4 |
| Mutant Monsters | `mutantmonsters:mutant_enderman` | Mutant Enderman | T2 | scripted (Skull Spirit on Enderman) | The End or Endermen-spawning areas | mutant ender, endersoul fragment | 4 |
| Majestic Menaces | `majestic_menaces:teikoku_senshi` (`crazybossfights:teikoku_senshi`) | Teikoku Senshi | T2-T3[^teikoku] | summoned-by-item | Cherry biome (per `master-appendix.md §C.12`); summon item required | mod-specific drops | 4 |
| Ars Nouveau | `ars_nouveau:wilden_boss` | Wilden Chimera | T2-T3 | summoned-by-altar | Ritual Brazier with Wilden Spike + Wilden Horn + Wilden Wing augments | wilden_tribute, source gem material | 3 |
| Ultris | `ultris_mr:corrupted_enderman` | Corrupted Enderman | T2 | summoned-by-item | Overworld structure (Ultris specific) | void/teleport katana (Simply Swords TBD) | 3 |
| Ultris | `ultris_mr:giant` | Giant | T2 | scripted | summoned via Strength Potion thrown at a Zombie | Giant Stompers | 4 |
| Ultris | `ultris_mr:phantom_swarm` | Phantom Swarm | T2 | scripted | Overworld night event (after summoning lone phantom in End → setting it on fire) | swarm-specific drops | 4 |

**T2 subtotal:** 23 entries (8 Twilight + 4 Blue Skies + 3 Aether + 2 Meet Your Fight + 1 Mutant Enderman + 1 Majestic Menaces + 1 Ars Nouveau + 3 Ultris).

---

## T3 — Late-game mod content (Nether / Undergarden / Deeper Darker)

| Mod | Entity ID | Display Name | Tier | Spawn Mechanism | Spawn Location | Notable Drops | Discovery Pain |
|-----|-----------|--------------|:---:|------------------|----------------|---------------|:--------------:|
| L_Ender's Cataclysm | `cataclysm:netherite_monstrosity` | Netherite Monstrosity | T3 | structure-locked | `burning_arena` (`minecraft:nether_wastes`, 80-chunk spacing) | rare_ink, fire_rune, protection_rune, `simplyswords:brimstone_claymore`, terramity nyxium_greatsword 15% | 2 |
| L_Ender's Cataclysm | `cataclysm:ignis` | Ignis | T3 | structure-locked | `soul_black_smith` (crimson_forest / nether_wastes / soul_sand_valley / warped_forest, 60-spacing) | epic_ink, fire_upgrade_orb, diamond_spell_book @ 15%, `simplyswords:molten_edge`, terramity blasphemic_rapture @ 10% | 2 |
| L_Ender's Cataclysm | `cataclysm:ignited_revenant` | Ignited Revenant | T3 | scripted (post-Ignis) | Nether, spawns after Ignis kill via "Within Nether Fortresses, Ignited Beserkers have awakened" mechanic | post-Ignis Nether-fortress drops | 4 |
| L_Ender's Cataclysm | `cataclysm:maledictus` | Maledictus | T3 | structure-locked | `cursed_pyramid` (`minecraft:desert`, 80-spacing) | rare_ink, ender_rune, `simplyswords:twisted_blade` | 2 |
| L_Ender's Cataclysm | `cataclysm:the_harbinger` | The Harbinger | T3-T4 | structure-locked | `ancient_factory` (`#forge:is_underground`, 112-spacing — deep Y-band) | epic_ink, ender_rune, ender_upgrade_orb, `simplyswords:shadowsting` | 3 |
| L_Ender's Cataclysm | `cataclysm:the_leviathan` | The Leviathan | T3-T4 | structure-locked | `sunken_city` (deep ocean variants — `deep_ocean`, `deep_lukewarm_ocean`, `deep_cold_ocean`, `deep_frozen_ocean`, 100-spacing) | rare_ink, ice_rune, diamond_spell_book @ 10%, `simplyswords:livyatan`, terramity davy_jones @ 10% | 2 |
| L_Ender's Cataclysm | `cataclysm:the_baby_leviathan` | The Baby Leviathan | T3 | scripted (post-Leviathan defeat) | spawns in `minecraft:warm_ocean` / `acropolis` structure after Leviathan death | n/a | 3 |
| L_Ender's Cataclysm | `cataclysm:coralssus` | Coralssus | T3 | scripted | post-Leviathan trigger — `acropolis` structure | uncommon_ink, nature_rune | 4 |
| L_Ender's Cataclysm | `cataclysm:scylla` | Scylla | T3 | structure-locked | `frosted_prison` (`minecraft:snowy_plains`, 80-spacing) | ice-themed drops, runic items | 2 |
| Iron's Spellbooks | `irons_spellbooks:dead_king` | The Dead King | T3 | structure-locked | `irons_spellbooks:catacombs` (hill / taiga / jungle / forest biomes + plains / desert / swamp / dripstone_caves / lush_caves) | blood_staff @ 50%, necronomicon_spell_book (first-kill guaranteed), Mahou attuned_diamond + kodoku | 2 |
| Iron's Spellbooks | `irons_spellbooks:fire_boss` | Echo of Tyros, First Flamebearer | T3 | structure-locked | `irons_spellbooks:pyromancer_tower` (hill / forest / `#forge:is_plains` / `#forge:is_swamp`) | epic_ink, fire_upgrade_orb, blaze_spell_book (first-kill guaranteed) | 2 |
| Iron's Spellbooks | `irons_spellbooks:citadel_keeper` | Ancient Knight | T3 | structure-locked | `irons_spellbooks:citadel` (overlays `bastion_remnant` in Nether) | keeper_flamberge @ 40% | 2 |
| Iron's Spellbooks | `irons_spellbooks:archevoker` | Archevoker | T3 | structure-locked | `irons_spellbooks:evoker_fort` (hill / forest / `#forge:is_desert` / `#forge:is_plains` / savanna variants) | rare_ink, ender_rune, evoker_spell_book (first-kill guaranteed) | 2 |
| Iron's Spellbooks | `irons_spellbooks:cryomancer` | Cryomancer (mob, boss-tier) | T2-T3[^iss_mob] | biome-conditional-random | snowy biomes / `mountain_tower` (snowy_plains / snowy_taiga / grove / ice_spikes) | ice_staff @ 15%, ice_rune @ 25% | 3 |
| Iron's Spellbooks | `irons_spellbooks:pyromancer` | Pyromancer (mob, boss-tier) | T2-T3 | biome-conditional-random | Nether/hot biomes | pyromancer 4-piece armor @ 8-12%/piece, fire_rune @ 20% | 3 |
| Iron's Spellbooks | `irons_spellbooks:necromancer` | Necromancer (mob, boss-tier) | T3 | biome-conditional-random | Catacombs / undead-themed biomes | rare_ink, blood_rune drops | 3 |
| Iron's Spellbooks | `irons_spellbooks:magehunter` | Magehunter | T3 | structure-locked | `mountain_tower` + scripted Aether tie-in | rare_ink @ 15%, magehunter weapon @ 30% | 3 |
| Iron's Spellbooks | `irons_spellbooks:priest` | Priest | T3 | biome-conditional-random | various | priest staff, healing items | 4 |
| Undergarden | `undergarden:forgotten_guardian` | Forgotten Guardian | T3 | structure-locked | `undergarden:forgotten_vestige` (Undergarden dimension, jigsaw 5-piece) | undergarden boss tokens, Mahou attuned_diamond | 2 |
| Undergarden | `undergarden:masticator` | Masticator | T3 | biome-conditional-random | Undergarden — depthrock / smogstem biomes | mod-specific drops | 3 |
| Undergarden | `undergarden:forgotten` | Forgotten | T3 | biome-conditional-random | Undergarden — barren biomes | rare_ink, undergarden drops | 4 |
| Undergarden | `undergarden:rotbeast` | Rotbeast | T3 | biome-conditional-random | Undergarden — overgrowth / wigglewood biomes | mod-specific drops | 4 |
| Deeper Darker | `deeperdarker:stalker` | Stalker | T3 | structure-locked | `deeperdarker:ancient_temple` (`deeperdarker:deeplands` biome) | stalker drops, sculk items, Mahou reagents | 2 |
| Deeper Darker | `deeperdarker:shattered` | Shattered | T3 | biome-conditional-random | Deeperdarker dimension — `deeplands` (weight 5) + `echoing_forest` (weight 17) | sculk-themed loot, Mahou items | 4 |
| Stalwart Dungeons | `stalwart_dungeons:awful_ghast` | Awful Ghast | T3 | structure-locked | Nether structures (Stalwart Dungeons) | rare_ink, fire_rune | 3 |
| Stalwart Dungeons | `stalwart_dungeons:nether_keeper` | Nether Keeper | T3 | structure-locked | Nether structures | rare_ink, blood_rune | 3 |
| Stalwart Dungeons | `stalwart_dungeons:shelterer` | Shelterer | T3 | structure-locked | Nether structures (armored variant) | rare_ink, fire_rune, armor pieces | 3 |
| Stalwart Dungeons | `stalwart_dungeons:shelterer_without_armor` | Shelterer (unarmored) | T3 | structure-locked | Nether structures | rare_ink, fire_rune | 4 |
| Stalwart Dungeons | `stalwart_dungeons:incomplete_wither` | Incomplete Wither | T3 | structure-locked | Nether structures | rare_ink, blood/cooldown runes, diamond_spell_book @ 10% | 3 |
| Stalwart Dungeons | `stalwart_dungeons:reinforced_blaze` | Reinforced Blaze | T3 | structure-locked | Nether fortress overlay | uncommon_ink, fire_rune | 3 |
| Stalwart Dungeons | `stalwart_dungeons:giddy_blaze` | Giddy Blaze | T3 | structure-locked | Nether fortress overlay | uncommon_ink, fire_rune | 3 |
| Meet Your Fight | `meetyourfight:dame_fortuna` | Dame Fortuna | T3 | summoned-by-item | overworld + Calling Bell variant | mod-specific cosmetics | 4 |
| Meet Your Fight | `meetyourfight:rosalyne` | Rosalyne, Blade of Dusk | T3 | summoned-by-item | dusk-time summon | mod-specific cosmetics | 4 |
| Vanilla | `minecraft:wither` | Wither | T3 | summoned-by-altar | player crafts wither skeleton skull cross + soul sand | Nether Star, wither skull (cross-mod Mahou reagent), advancement-locks | 1 |
| Alex's Mobs | `alexsmobs:warped_mosco` | Warped Mosco | T3 | biome-conditional-random | Warped Forest (Nether) | rare_ink, fire_upgrade_orb | 3 |
| Ultris | `ultris_mr:blaze_king` | Blaze King | T3 | structure-locked | `1_splatus:blazetower` (Nether fortress region) | Blaze King's Helmet, fire-themed unique | 3 |
| Ultris | `ultris_mr:ultra_wither` | Ultra Wither | T3-T4 | summoned-by-item | Enchanted Command Block thrown at Wither | ultra wither-themed unique | 4 |
| Ultris | `ultris_mr:sanctum_keeper` | Sanctum Keeper | T3-T4 | structure-locked | Sanctum structure (TBD) | mirrors of the Sanctum Keeper | 3 |
| Terramity | `terramity:gatmancer` | Gatmancer | T3 | structure-locked | `terramity:infested_laboratory` — overworld | dungeon_effigy, dungeon_sentry items | 3 |
| Mutant Monsters | `mutantmonsters:mutant_zombie_villager` | Mutant Zombie Villager | T3 | scripted (Skull Spirit on zombie villager) | overworld villages | mutant items | 4 |
| Cardinal Sins | `cardinal_sins:linneausofsloth` | Linneaus of Sloth | T3 | structure-locked | `slothstructure` → relocated to `#undergarden:is_undergarden` (#56) | sin-themed drops | 3 |
| Cardinal Sins | `cardinal_sins:sinofgluttony` | Sin of Gluttony | T3 | structure-locked | `gluttonystucture` → relocated to `#undergarden:is_undergarden` (#56) | sin-themed drops | 3 |
| Cardinal Sins | `cardinal_sins:sinofgreed` | Sin of Greed | T3 | structure-locked | `greedstructure` → relocated to `#undergarden:is_undergarden` (#56) | sin-themed drops | 3 |
| Cardinal Sins | `cardinal_sins:sinofenvy` | Sin of Envy | T3 | structure-locked | `envystructure` → relocated to `#undergarden:is_undergarden` (#56) | sin-themed drops | 3 |
| Cardinal Sins | `cardinal_sins:sinoflust` | Sin of Lust | T3 | structure-locked | `luststructuregenerator` → relocated to `#minecraft:is_nether` (#56) | sin-themed drops | 3 |
| Cardinal Sins | `cardinal_sins:sinofpride` | Sin of Pride | T3 | structure-locked | `pridestructure` → relocated to `#minecraft:is_nether` (#56) | sin-themed drops | 3 |
| Cardinal Sins | `cardinal_sins:sinofwrath` | Sin of Wrath | T3 | structure-locked | `wrathstructure` → relocated to `#minecraft:is_nether` (#56) | sin-themed drops | 3 |
| Cardinal Sins | `cardinal_sins:drakara` | Drakara | T3 | structure-locked | `drakarastruc` → relocated to `#minecraft:is_nether` (#56) | sin-themed drops | 3 |
| Cardinal Sins | `cardinal_sins:lucifer` | **Lucifer** (T3 → T4 combat capstone) | T3 | structure-locked | `luciferstructure` → relocated to `#minecraft:is_nether` (#56) | unique **Lucifer's Token** (T3→T4 combat advance) | 3 |
| Marium's Soulslike Weaponry | `soulsweapons:accursed_lord_boss` | The Decaying King | T3 | structure-locked + summoned-by-altar | `soulsweapons:decaying_kingdom` — `#minecraft:is_nether` (boss pre-placed); also Blackstone Pedestal + Withered Demon Heart | withered_demon_heart, lord_soul, accursed/darkin mats | 2 |
| Marium's Soulslike Weaponry | `soulsweapons:chaos_monarch` | Monarch of Chaos | T3 | summoned-by-altar | Blackstone Pedestal (`polished_blackstone_bricks`+ender_pearl+obsidian — Nether-gated) + `soulsweapons:shard_of_uncertainty` (drop) | chaos_crown (→ Chaos Orb), chaos armor mats | 4 |
| Marium's Soulslike Weaponry | `soulsweapons:day_stalker` | Day Stalker | T3 | summoned-by-item | Chaos Orb summon (duo finale) — needs `essence_of_luminescence` (Moonknight) + `withered_demon_heart` (Decaying King) + `chaos_crown` (Chaos Monarch) | lord_soul_day_stalker, dawnbreaker / sunlight mats | 4 |
| Marium's Soulslike Weaponry | `soulsweapons:night_prowler` | Night Prowler | T3 | summoned-by-item | Chaos Orb summon (duo finale, paired w/ Day Stalker) | lord_soul_night_prowler, nights_edge / darkmoon mats | 4 |

> **Marium's Soulslike Weaponry (added 2026-06-01; weapon-centric mod, 8 boss-bar bosses confirmed via `data/forge/tags/entity_types/bosses.json`).** Progression (advancement chain `root → draugr_boss → moonknight → end_of_reigns → chaos_orb → kill_day_night_boss`): **Draugr** (T1 taiga `champions_graves`) → **Moonknight** (T1 hills `cathedral_of_resurrection` summon) → **The Decaying King / Accursed Lord** (T3 — `decaying_kingdom` generates in the **Nether**) → craft **Chaos Orb** → **Day Stalker + Night Prowler** duo finale (T3, gated behind Moonknight + Chaos Monarch + Decaying-King materials). **Returning Knight** + **Night Shade** are side summons (T1). Most bosses are item/altar-summoned (Old Moon Altar `altar_block`, Blackstone Pedestal) — only Draugr (taiga/OW) and the Decaying King (Nether) are *pre-placed* in their structures; the rest spawn wherever summoned, so they're tiered by their **material-gate depth** per the catalog's summon-boss convention (cf. Meet Your Fight / Ultris). HP defaults (jar `BossConfig`): Decaying King 600 · Day Stalker 600 · Moonknight 550 · Returning Knight / Night Prowler 500 · Chaos Monarch 450 · Draugr 300 · Night Shade 150 — all high for their location tier; see build-report balance flags. See `kubejs/server_scripts/gates/codex_boss_rush.js` + `exploration/codex_exploration_kills.js`.

> **Cardinal Sins + Lucifer (added 2026-06-01; the catalog predated this ladder).** The mod escalates **7 sins → Lucifer → Drakara**, originally all overworld-arena bosses; per icraft #56 they were relocated to Undergarden (lesser sins, T2–T3) and the Nether (fierce sins + Drakara + Lucifer, T3) so location-tiering fits. **Lucifer (`cardinal_sins:lucifer`) is the T3 → T4 *combat* capstone** (progression-framework §5): clearing 100% of the T3 boss roster — which includes Lucifer — is the combat route to T4, and `milestone_detection.js` lists Lucifer in `TIER_4_BOSSES` (a single Lucifer kill can also grant `tier_4`). Non-combat lanes (Engineering / Magic banking the 2000-token threshold) skip him entirely. The phase entity `cardinal_sins:luciferphase_1` aliases to the canonical `cardinal_sins:lucifer` via `BOSS_PHASE_ALIASES`. See `kubejs/server_scripts/gates/codex_boss_rush.js`.

**T3 subtotal:** 53 entries (9 Cataclysm + 9 Iron's Spellbooks bosses/mobs + 4 Undergarden + 2 Deeper Darker + 7 Stalwart Dungeons + 2 Meet Your Fight + 1 vanilla Wither + 1 Alex's Mobs + 3 Ultris + 1 Terramity + 1 Mutant Monsters + 9 Cardinal Sins incl. Lucifer + **4 Marium's Soulslike Weaponry: Decaying King / Chaos Monarch / Day Stalker / Night Prowler**).

---

## T4 — Endgame (Deep Aether / End / Ad Astra)

| Mod | Entity ID | Display Name | Tier | Spawn Mechanism | Spawn Location | Notable Drops | Discovery Pain |
|-----|-----------|--------------|:---:|------------------|----------------|---------------|:--------------:|
| L_Ender's Cataclysm | `cataclysm:ender_guardian` | Ender Guardian | T4 | structure-locked | `ruined_citadel` (end_highlands / end_midlands, 50-spacing) | epic_ink, legendary_ink, ender_rune, ender_upgrade_orb, netherite_spell_book @ 10%, `simplyswords:arcanethyst`, Mahou attuned_diamond, antimatter_pacemaker 10%, null_scarf 12% | 1 |
| L_Ender's Cataclysm | `cataclysm:ender_golem` | Ender Golem | T4 | structure-locked | `ruined_citadel` + scripted spawn | mid-tier T4 drops | 3 |
| L_Ender's Cataclysm | `cataclysm:ancient_remnant` | Ancient Remnant | T4 | summoned-by-altar | `cursed_pyramid` deep chamber + Maledictus Eye | rare_ink, blood_rune, `simplyswords:awakened_lichblade` (Voidheart Blade base), `terramity:kamehameha` @ 5%, Mahou reagents | 3 |
| Vanilla | `minecraft:ender_dragon` | Ender Dragon | T4 | dimensional-arrival | The End — main island | dragon egg, advancement chain, legendary_ink, `terramity:planet_buster` @ 15%, antiprism @ 10%, dragon_band @ 12%, Mahou attuned_diamond | 1 |
| Botania | `botania:doppleganger` | Guardian of Gaia | T4 | summoned-by-altar | player builds Gaia ritual + uses Terrasteel Sword | gaia_ingot, gaia_block, dice_of_fate | 2 |
| Deep Aether | `deep_aether:eots_controller` | Eye of the Storm | T4 | structure-locked | `deep_aether:brass_dungeon` (Deep Aether dimension) | t4 sky-end drops, `simplyswords:flamewind` @ 15% | 2 |
| Alex's Mobs | `alexsmobs:void_worm` | Void Worm | T4 | summoned-by-item | The End — toss a Mysterious Worm into the void | mysterious_worm essence, void-themed drops, legendary_ink | 4 |
| Alex's Mobs | `alexsmobs:cachalot_whale` | Cachalot Whale (white variant) | T4 | biome-conditional-random | lukewarm/cold/deep oceans (white variant is rare-spawn) | cachalot whale tooth, leg/uncommon ink | 5 |
| Mutant Monsters | `mutantmonsters:mutant_enderman` | Mutant Enderman | T4[^mutender] | scripted (Skull Spirit on Enderman) | End / overworld endermen | endersoul fragment, mutant items | 4 |
| Mutant Monsters | `mutantmonsters:mutant_snow_golem` | Mutant Snow Golem | T2-T4 | scripted (Skull Spirit + snow_golem) | overworld snow biomes | mutant items | 4 |
| Boss Checklist | `terramity:dungeon_effigy` (referenced) | Dungeon Effigy | T4 | scripted | post-clearing Trial Spire / Chthonic Cathedral | summoning ritual items | 4 |
| Terramity | `terramity:thunker` | Thunker | T4 | structure-locked | `terramity:chthonic_cathedral` (Nether) | giant_dungeon_slab | 3 |
| Terramity | `terramity:uvogre` | Uvogre | T4 | structure-locked | `terramity:chthonic_cathedral` / nether biome variants | mod drops | 3 |
| Terramity | `terramity:duskrok` | Duskrok | T4 | biome-conditional-random | nether biomes | mod drops | 4 |
| Terramity | `terramity:hellrok` | Hellrok | T4 | biome-conditional-random | nether biomes | mod drops | 4 |
| Ultris | `ultris_mr:shulker_stone` | Shulker Stone | T4 | summoned-by-item | The End — shulker shell crafted item | End-themed unique | 3 |
| Multiplayer Bosses[^mpb] | (enhances vanilla Dragon/Wither/Warden) | (no new entity) | T3-T4 | n/a | enhances existing kill targets | LootBag drops | n/a |
| Vanilla | `minecraft:warden` | Warden | T4 | structure-locked | Ancient Cities (deep dark biome) | sculk catalyst, echo shard, Mahou attuned_diamond (cross-mod drop) | 2 |

> **Removed phantoms (2026-06-01 #47 sweep).** `cataclysm:void_blossom`[^void_blossom] (the entity belongs to the absent `bosses_of_mass_destruction`, not Cataclysm) and `lu_more_bosses_and_mobs:end_dwellee`[^lmore] (LuMoreBossesAndMobs is not installed) were dropped from the T4 table. The footnotes are retained for the record.

**T4 subtotal:** 14 active entries (Ender Dragon + Warden are vanilla; 3 Cataclysm T4; 1 Botania; 1 Deep Aether; 2 Alex's Mobs; 2 Mutant Monsters; 4 Terramity; 1 Ultris). The Ender Dragon is the **pack finale** — reached via the Deep-Aether **End Compass → End Bastion** (replacing the Eye of Ender), its kill unlocks all post-game + Ad Astra. (Lucifer, the T3→T4 combat capstone, is listed under T3.)

---

## Postgame / Ascension (designed, not all entity-backed)

| Mod | Entity ID | Display Name | Tier | Spawn Mechanism | Spawn Location | Notable Drops | Discovery Pain |
|-----|-----------|--------------|:---:|------------------|----------------|---------------|:--------------:|
| Mythic Forge[^mythic] | n/a (custom rift bosses are KubeJS-spawned mob waves) | Rift floor guardians | postgame | scripted | Oblivion's Rift floors (RFTools custom dim) | iridescent_rift_shard, void_fragment, rift_core | 5 (no compass support — Rift floors are sequential, not lookup-able) |
| Botania | `botania:magic_landmine` | Gaia Trap | postgame | scripted (Gaia ritual support entity) | Gaia ritual arena | n/a (mechanism, not boss) | n/a |

**Postgame subtotal:** Rift bosses are procedurally generated and outside the compass scope.

---

## Summary

**Total tracked progression bosses: ~113 entries** across ~14 mods (counting variants), after the 2026-06-01 pass folded in the Cardinal Sins ladder (+9, incl. Lucifer) and dropped two phantoms (`cataclysm:void_blossom`, LuMoreBosses `end_dwellee`). The `boss_checklist-forge-4.1.0.jar` registry has 167 entries across 57 mods but the in-pack subset is far smaller because most listed mods (Alex's Caves, Mowzie's Mobs, Adventurez, Soulsweapons, Goety, etc.) are not installed. The TIER_2_BOSSES / TIER_3_BOSSES / TIER_4_BOSSES arrays in `kubejs/server_scripts/gates/milestone_detection.js` capture the hand-curated "main quest" bosses; the per-tier boss-rush rosters in `codex_boss_rush.js` are the canonical denominators for the 80 / 90 / 100% advance routes. Everything else on this list is "additional boss-tier content" the compass could optionally support.

### Rough tier distribution

| Tier | Boss count | Of which Discovery Pain ≥4 |
|------|-----------:|---------------------------:|
| T1 | 27 | 11 (mostly biome-random brutal/mutant variants) |
| T2 | 23 | 9 |
| T3 | 49 | 17 |
| T4 | 14 | 9 |
| **Total** | **113** | **46** |

About **41% of progression bosses score Discovery Pain ≥4**, meaning a player without an external wiki has no reliable way to find them in-game. This is the compass system's core value proposition.

### Mods contributing the most "discovery pain" (Discovery Pain ≥4)

1. **Brutal Bosses (4 high-pain entries)** — biome-conditional-random Mad Cow / Evil Chicken / Killer Rabbit / Snow Golem variants spawn anywhere; ExplorersCompass can't find them because they're not structure-locked.
2. **Iron's Spellbooks (4 high-pain entries — Cryomancer/Pyromancer/Necromancer/Priest)** — these are *boss-tier mobs* (not boss-bar-rendering bosses) that spawn naturally in matching biomes. Players don't know to look for them and have no in-game signal.
3. **Stalwart Dungeons (4 high-pain entries)** — variants exist within structure overlays but the in-pack codex doesn't enumerate them, so players don't know all 7 exist.
4. **Meet Your Fight (4 high-pain entries)** — every MYF boss is summoned-by-item with no in-game signal of how to craft the summon item.
5. **Mutant Monsters (4 high-pain entries)** — all four mutant variants require Skull Spirit summoning at low-percentage natural drops; the codex doesn't explain.
6. **Terramity (~6 high-pain entries)** — chthonic_cathedral / chthonic_dungeon / chthonian_breach bosses spawn in Nether but the structure boss-room is hard to find without flying around.
7. **Alex's Mobs (3 high-pain entries)** — Void Worm requires Crimson Mosquito Larva + Enderiophage Capsid crafting chain; Cachalot Whale rare white variant is a 0.1% biome-conditional spawn.
8. **Ultris (3 high-pain entries)** — every Ultris boss is summon-item-or-scripted-trigger; no structure ExplorersCompass can find.

### Patterns observed in spawn mechanism distribution

| Mechanism | Count | % | Compass strategy |
|-----------|------:|---:|------------------|
| structure-locked | 52 | 49% | **Already partially solved** by ExplorersCompass; compass just needs to know the right structure name per boss. |
| biome-conditional-random | 23 | 22% | **No existing solution.** Compass needs to know the biome list + dimension and direct the player to a spawn-eligible chunk. |
| summoned-by-altar | 8 | 7.5% | **Knowledge problem, not navigation.** Compass should display the summoning recipe + altar location once player has the ingredients. |
| summoned-by-item | 12 | 11% | **Compass should display craft-tree of summon item** — boss has no fixed location. |
| scripted | 11 | 10.5% | **Most pain.** Compass needs to display the trigger condition (e.g., "Spawn after killing Leviathan in warm_ocean"). |
| dimensional-arrival | 2 | 2% | Ender Dragon + (vanilla baseline) — compass is overkill, but cataloging helps Compendium completion. |
| n/a (legacy / phantom) | ~3 | 3% | Skip. |

### Outliers / oddities the compass design will need to handle

- **Bosses with multiple spawn locations.** Aether's Sun Spirit needs both `gold_dungeon` structure presence AND a player-driven Sun Altar ritual inside it. Compass should chain: locate dungeon → display "use sun altar with summon item" overlay.
- **Regional variants.** Cataclysm Coralssus and The Baby Leviathan are *scripted-spawn after a Leviathan kill*. The compass should hide them from the discovery list until Leviathan is dead, then reveal "go back to a warm_ocean / acropolis".
- **Conditional summoning.** Ultra Wither (Ultris) requires throwing an Enchanted Command Block at a Wither — the compass can't direct to a "location" because the spawn is wherever the player initiates. Best display: recipe + "summon anywhere in dim X".
- **Cross-tier (T2-T3, T3-T4) bosses.** Ur-Ghast, The Harbinger, The Leviathan, Ancient Remnant, and the Iron's Spellbooks pyromancer/cryomancer mobs span tier boundaries. Compass tier-filter UI needs to "show this boss for both T2 and T3 stages" rather than a hard tier assignment.
- **Boss-tier mobs vs. boss-bar bosses.** Iron's Spellbooks Pyromancer/Cryomancer/Necromancer/Priest, all four Mutant Monsters variants, and the Stalwart Dungeons mini-bosses do **not** render boss bars — they're just high-HP / high-damage mobs. The compass UX needs to distinguish "trophy boss with a bar" from "boss-tier mob you should grind for drops" — possibly two sections in the UI.
- **Structure-locked but dimension-conditional.** `cataclysm:citadel` overlays `minecraft:has_structure/bastion_remnant` (Nether) — the compass needs to filter "only show after player has T3" because the bastion exists at T1 but the Citadel Keeper drops T3 loot. The AStages stage flag should be the compass's visibility filter.
- **No-data bosses.** `terramity:dungeon_effigy` is registered in `boss_checklist` and has a kubejs loot file but no clear in-game discovery vector — likely a future content slot. The compass should ship with a "Unknown discovery method — check `master-appendix.md §C.10` for current allocation" placeholder rather than hide it.
- **Custom origins / class-tied content (Witch of Ink, Artificial Construct).** The Witch of Ink "dimension" referenced in `master.md` Part IV does not appear to be a real dimension/mod in the live pack — likely future content. Skip from compass for now.

---

[^t1cata]: `cataclysm:old_netherite_monstrosity` appears in the lang file as a legacy entity ID — it's been replaced by the T3 `cataclysm:netherite_monstrosity`. Listed for completeness but the compass should ignore.

[^lmore]: ~~LuMoreBossesAndMobs~~ — **CONFIRMED NOT INSTALLED (2026-05-30 jar audit).** No `lu_more`/`lumore`/`moreboss` jar in `mods/`; `macholote` / `gold_mini_golem` are not registered entities in the live pack. The two T1 rows have been removed. `master-appendix.md §C.12` still references it aspirationally — clean that up in the full-roster audit.

[^teikoku]: Majestic Menaces jar has `modId="crazybossfights"` per its `mods.toml` (the public mod is called "Majestic Menaces" but ships under that namespace).

[^iss_mob]: The Iron's Spellbooks Cryomancer/Pyromancer/Necromancer/Priest are *boss-tier mob spawns*, not entities with boss bars. They're listed because `master-appendix.md §C.1` explicitly assigns them T2/T3 drop allocations.

[^mutender]: Mutant Enderman is listed at T2 and T4 — at T2 you can summon one via Skull Spirit on a regular enderman; at T4 they spawn naturally in the End. Compass should de-dupe by Origin context.

[^void_blossom]: `cataclysm:void_blossom` is mentioned in `master-appendix.md §D.6` with 2000 HP base — but inspection shows that void_blossom is actually from the `bosses_of_mass_destruction` mod (NOT in this pack). This appears to be a stale design-doc reference. Action: confirm with operator and update master-appendix.md if needed (out of scope here).

[^mpb]: Multiplayer Bosses enhances vanilla Dragon/Wither/Warden with a LootBag drop and tougher AI but registers no new entity. Tracked here because the design intent treats vanilla bosses as T3/T4 progression bosses.

[^mythic]: Rift bosses are KubeJS-spawned procedural mob waves on each Rift floor (Loop 1 endgame). Not entity-backed bosses; out of compass scope.
