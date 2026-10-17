# Boss Catalog — IridescentCraft

> **Purpose.** Every boss of the pack by tier, where to find it, and how hard it is to *find* without an external wiki. The catalog began as the scoping study for the Boss Compass and its auto-waystones (Task #46, May 2026); the compass, the bonfires and the boss rush have since been built on the pack's **boss registry**, the one list every system reads for a boss's tier, kind and boss-rush roster.
>
> **Audit method.** First written in May 2026 from the mod jars (boss-bar classes, lang files, structure and biome data, advancements, and Boss Checklist's own list of 167 bosses across 57 mods, of which only the in-pack subset is kept). **Checked row by row on 2026-10-16** against the boss registry (tier, kind, boss rush, Boss Compass row), the game's own list of entity types and structures, and the mods' data: rows for entities the game does not have were removed (list under "Removed" at the end of each tier), registry bosses the catalog lacked were added, and every row sits in the table of its registry tier, with three exceptions named in their rows: Lucifer and the Ignited Revenant (tier-4 bosses on the Tier 3 boss rush) are listed under T3, and the Ultimate Wither (the Wither's level 3, built with a Tier 4 block) under T4. Bosses off the boss list sit in the table of the place they are met.
>
> **Column definitions.**
> - **Tier** — the boss's tier in the boss registry, which is the tier of the kill tokens it pays. Plain = a named boss (a first-kill bonus, then repeat tokens). **miniboss** = tokens on every kill. **no tokens** = a boss for every boss rule (no beheading, the boss health and damage rules) that pays no kill tokens. **rush** = it counts toward its tier's boss rush ("rush T3" when the roster is not the boss's own tier). **—** = not on the pack's boss list: the mod's own encounter, no kill tokens, no boss-rush credit; the tier of the place it is met follows in brackets.
> - **Spawn Mechanism** — `structure-locked` (the boss is part of a structure), `biome-conditional-random` (natural spawn in matching biomes), `summoned-by-item` (a crafted or dropped item calls it), `summoned-by-altar` (an altar or ritual calls it), `dimensional-arrival` (it waits at the dimension's entry), `scripted` (a mod event or a trigger the player sets off).
> - **Spawn Location** — structure + dimension, or biomes + dimension. "Boss Compass" = the boss has a row on the Boss Compass (and a bonfire waystone at its arena).
> - **Notable Drops** — the top items players want, including the pack's own drop rules ([master-appendix.md §C](master-appendix.md)).
> - **Discovery Pain** — 1-5 score for how hard the boss is to *find* in-game without an external wiki.
>   - **1** — Trivial. Explorer's Compass lists the structure and works on the first try.
>   - **2** — Easy. The structure has a worldgen advancement / clear signal once you're in the right biome.
>   - **3** — Moderate. The boss exists but the player won't know where to look without the quest book / Codex first.
>   - **4** — Hard. Random biome spawn with no compass support, OR a multi-step summon the Codex doesn't fully explain.
>   - **5** — Nearly impossible. No in-game discovery vector at all.
>
> Bosses scoring **4-5 are the priority list for the compass system**. Bosses scoring 1-2 are bonus coverage — Explorer's Compass already partially solves them.
>
> **Mods checked but no progression bosses found.** `forbidden_arcanus` (Lost Soul is ambient, not boss-tier), `mahoutsukai` (only Fae/Familiar/Kodoku/Butterfly summons — no boss bar entities), `art_of_forging` (Tetra weapon framework, no entities), `cataclysm_ut` (utility addon only), `multiplayerbosses` (vanilla Dragon/Wither/Warden enhancer, no new entities), `bossultimatum` (death-ultimatum mechanic only).
>
> **Mods named in older design notes but NOT in the pack.** Alex's Caves (`alexscaves:luxtructosaurus`), Friends and Foes (`friendsandfoes:wildfire`), Illage and Spillage, Adventurez, Goety, Knightquest, Marium's Soulslike Weaponry, Aquamirae, Legendary Monsters, the Wetlands, Galosphere, Frostiful, Bosses of Mass Destruction, Born in Chaos, Mythic Mobs/Legends, MutantMore, LuMoreBossesAndMobs. (Mowzie's Mobs **is** in the pack: four rows below. So is The Abyss (TATOS): its Elder, The Roka, Nightblade, Ice Knight and Soul Guard are on the boss list (Tier 3, no tokens); its Guard is a plain mob. "Nosaj" exists in The Abyss only as items — `amuled_of_nosaj`, `crown_of_nosaj`, `nosaj_sword` — there is no `theabyss:nosaj` boss entity.)
>
> **Two mods whose bosses are vanilla mobs.** **Brutal Bosses** and **Ultris: Boss Expansion** add no entity types: a Brutal Bosses champion is a vanilla mob given a name, stats and abilities, and an Ultris boss is a vanilla mob run by the mod's functions. The boss rush credits a kill by entity type, so neither mod's bosses can count toward it, and none of them is on the boss list.

---

## T1 — Overworld (entry tier)

> **History (2026-05-30 decisions, still in force).** Overworld = Tier 1 (location-based tiering). LuMoreBossesAndMobs was a phantom (not installed) and was dropped. Terramity was re-tiered: **Gob** kept at T1 with a re-priced summon (an emerald path to the gnome hat besides the mod's diamond barter); **Virtue** moved to the Aether (now Tier 4); `super_sniffer` stayed T1. **Merlin, Circe and Gundalf** turned out to live in the Nether's Chthonic Cathedral and are Tier 3 since 2026-10-16 (table below).

| Mod | Entity ID | Display Name | Tier | Spawn Mechanism | Spawn Location | Notable Drops | Discovery Pain |
|-----|-----------|--------------|:---:|------------------|----------------|---------------|:--------------:|
| Terramity | `terramity:gob` | Gob, King of Gnomes | T1 · rush | structure-locked + summoned-by-item | `terramity:court_of_gnomes` — swamp / dark forest / `#forge:is_swamp`; use a gnome hat on the golden gnome statue (a gnome trades the hat for a diamond, or craft it with emeralds). Boss Compass | gobs_claymore, gobs_gilded_hat, belt_of_the_gnome_king | 3 |
| Terramity | `terramity:super_sniffer` | Super Sniffer | T1 · rush | structure-locked | `terramity:ancient_outcrop` — desert / hot biomes. Boss Compass | super_sniffers_pelt, giant_sniffers_hoof | 3 |
| Mutant Monsters | `mutantmonsters:mutant_zombie` | Mutant Zombie | T1 · miniboss · rush | scripted (lightning + skull spirit) | Overworld surface, summoned via Skull Spirit on zombie corpse | mutant zombie hulk hammer | 4 |
| Mutant Monsters | `mutantmonsters:mutant_skeleton` | Mutant Skeleton | T1 · miniboss · rush | scripted (Skull Spirit on skeleton bones) | Overworld surface | mutant skeleton skull/pelvis/limb/rib/shoulder pad | 4 |
| Mutant Monsters | `mutantmonsters:mutant_creeper` | Mutant Creeper | T1 · miniboss · rush | biome-conditional-random | Overworld surface (low spawn) | gunpowder, creeper minion egg | 4 |
| Mowzie's Mobs | `mowziesmobs:ferrous_wroughtnaut` | Ferrous Wroughtnaut | T1 · rush | structure-locked | `mowziesmobs:wrought_chamber` — underground overworld (all `has_mowzie_structure` biomes) | wrought_axe (Axe of a Thousand Metals), wrought_helmet, Ironheart Cog (relic, 40 %) | 2 |
| Mowzie's Mobs | `mowziesmobs:umvuthi` | Umvuthi, the Sunbird | T1 · rush | structure-locked | `mowziesmobs:umvuthana_grove` — `minecraft:is_savanna` overworld | sol_visage mask, sun's blessing, solar beam mats | 2 |
| Mowzie's Mobs | `mowziesmobs:sculptor` | Tongbi, the Sculptor | T1 · rush | structure-locked + trade-challenge | `mowziesmobs:monastery` — `#forge:is_peak` overworld | sculptor_staff (geomancy), earthrend gauntlet mats | 3 |
| Mowzie's Mobs | `mowziesmobs:naga` | Naga | T1 · miniboss · rush | biome-conditional-random | `minecraft:is_beach` / `minecraft:is_mountain`+`is_hill` overworld | naga_fang (→ naga_fang_dagger), naga scales | 4 |
| Vanilla | `minecraft:elder_guardian` | Elder Guardian | T1 · no tokens | structure-locked | Ocean monuments | wet sponge, prismarine, fish | 1 |
| Minecraft Comes Alive | `mca:grim_reaper` | Grim Reaper | T1 · miniboss | summoned-by-altar | anywhere in the Overworld at night: three obsidian pillars lit with fire (the mod's summoning altar) | the reaper's scythe | 4 |
| Terramity | `terramity:dungeon_effigy` | Dungeon Effigy | — (T1 area) | structure-locked | `terramity:trial_spire` (Overworld ocean biomes), with the Dungeon Sentries | the mod's own drops | 3 |
| Brutal Bosses | vanilla mobs (29 champions: zombie, skeleton, husk, stray, drowned, witch, cave spider, iron golem, evoker, vindicator, pillager, blaze, wither skeleton, piglin brute, shulker, ...) | named champions (e.g. Corvin the Rotten, Kip the Swift) | — (where met) | structure-locked | a champion can appear beside a structure's treasure chest when it is first opened (30 % per chest, at least 400 blocks from the last one); Overworld, Nether and End structures | the chest's loot, the champion's own drops | 2 |
| Ultris | `minecraft:enderman` (Ultris) | Corrupted Enderman | — (T1 area) | scripted | a rare random event near a player in the Overworld | the Ominous Pearl (Ultris's Ultra Wither summon, which cannot work in this pack: see the Tier 3 table), the mod's own drops | 4 |
| Ultris | `minecraft:zombie` (Ultris) | Giant | — (T1 area) | scripted | throw a Potion of Strength at a zombie near you (Overworld) | Giant Stompers | 4 |
| Ultris | `minecraft:illusioner` (Ultris) | Illusioner | — (T1 area) | scripted | a rare random event near a player in the Overworld | the mod's own drops | 4 |
| Ultris | `minecraft:stray` (Ultris) | Sanctum Keeper | — (T1 area) | structure-locked | Ultris's Sanctum (`1_splatus:sanctum`), underground in Overworld stronghold biomes | the Spirit Bow | 3 |

**T1 subtotal:** 17 rows: **11 on the boss list** (9 on the Tier 1 boss rush: Gob, Super Sniffer, the three Mutant Monsters, Mowzie's Wroughtnaut, Umvuthi, Sculptor and Naga; MCA's Grim Reaper, a miniboss on no roster; the Elder Guardian, no tokens) + Terramity's Dungeon Effigy + the Brutal Bosses champions (one row) + 4 Ultris bosses.

**Removed from Tier 1 on 2026-10-16:** the four Marium's Soulslike Weaponry bosses (Draugr, Returning Knight, Night Shade, Moonknight; the mod is not in the pack), the 14 single Brutal Bosses rows (their ids are the mod's config names, not entity types, and most rows gave the wrong spawn rule: every champion appears at a structure chest; folded into one row), the legacy Old Netherite Monstrosity[^t1cata] (not an entity of the installed Cataclysm), and the Terramity rows of other tiers (moved to their tables).

---

## T2 — First-dimensional (Twilight / Blue Skies)

| Mod | Entity ID | Display Name | Tier | Spawn Mechanism | Spawn Location | Notable Drops | Discovery Pain |
|-----|-----------|--------------|:---:|------------------|----------------|---------------|:--------------:|
| Twilight Forest | `twilightforest:naga` | Naga | T2 · rush | structure-locked | `naga_courtyard`, Twilight Forest dimension. Boss Compass | naga_scale, naga_trophy, `simplyswords:tempest` @ 15% | 1 |
| Twilight Forest | `twilightforest:lich` | Lich | T2 · rush | structure-locked | `lich_tower`, Twilight Forest. Boss Compass | lich_trophy, fortification/lifedrain/twilight/zombie scepters @ 25%, Phylactery Shard (relic, 40 %), `simplyswords:soulrender` @ 15% | 1 |
| Twilight Forest | `twilightforest:hydra` | Hydra | T2 · rush | structure-locked | `hydra_lair`, Twilight Forest swamp biome. Boss Compass | hydra_fang, waystone_core, `simplyswords:emberblade` @ 15% | 1 |
| Twilight Forest | `twilightforest:ur_ghast` | Ur-Ghast | T2 · rush | structure-locked | `dark_tower`, Twilight Forest dark forest. Boss Compass | ur_ghast_tear, `simplyswords:whisperwind` @ 20% | 1 |
| Twilight Forest | `twilightforest:knight_phantom` | Knight Phantom | T2 · rush | structure-locked | `knight_stronghold`, Twilight Forest. Boss Compass | `simplyswords:enigma` @ 12% | 1 |
| Twilight Forest | `twilightforest:snow_queen` | Snow Queen | T2 · rush | structure-locked | `aurora_palace`, Twilight Forest snow biome. Boss Compass | ice_staff @ 50%, `simplyswords:frostfall` @ 15% | 1 |
| Twilight Forest | `twilightforest:minoshroom` | Minoshroom | T2 · rush | structure-locked | `labyrinth`, Twilight Forest swamp. Boss Compass | diamond_minotaur_axe, meef_stroganoff, minoshroom_trophy, `simplyswords:mjolnir` @ 15% (since 2026-10-16) | 1 |
| Twilight Forest | `twilightforest:alpha_yeti` | Alpha Yeti | T2 · rush | structure-locked | `yeti_cave`, Twilight Forest snow biome. Boss Compass | ice_staff @ 25%, `simplyswords:icewhisper` @ 10% | 1 |
| Twilight Forest | `twilightforest:adherent` | Adherent | T2 · miniboss | none (spawn egg only) | no natural spawn in this version of the Twilight Forest (a mob meant for the unfinished Final Castle) | the mod's own drops | 5 |
| Twilight Forest | `twilightforest:harbinger_cube` | Harbinger Cube | T2 · miniboss | none (spawn egg only) | no natural spawn in this version of the Twilight Forest (a mob meant for the unfinished Final Castle) | the mod's own drops | 5 |
| Blue Skies | `blue_skies:summoner` | Summoner | T2 · rush | summoned-by-altar | `nature_dungeon` (snow_covered_pines biome, Everbright) → use `blue_skies:nature_key` + summoning_tome. Boss Compass | gold_spell_book, source_gem, basic_reforging_token, waystone_core, `simplyswords:hiveheart` @ 15%, alchemy_scroll | 2 |
| Blue Skies | `blue_skies:alchemist` | Alchemist | T2 · rush | summoned-by-altar | `poison_dungeon` (sunset_maple_forest biome, Everdawn) → use `blue_skies:poison_key` + summoning_tome. Boss Compass | oakskin_elixir, evasion_elixir, `simplyswords:toxic_longsword` @ 15% | 2 |
| Blue Skies | `blue_skies:starlit_crusher` | Starlit Crusher | T2 · rush | summoned-by-altar | `everbright_blinding_dungeon` (calming_skies / brisk_meadow biomes, Everbright) → use `blue_skies:blinding_key` + summoning_tome. Boss Compass | lightning_upgrade_orb @ 15%, `simplyswords:stars_edge` @ 15%, runic_arc @ 5% | 2 |
| Blue Skies | `blue_skies:arachnarch` | Arachnarch | T2 · rush | summoned-by-altar | `everdawn_blinding_dungeon` (Everdawn variant of blinding dungeon) → blinding_key + summoning_tome. Boss Compass | `simplyswords:waxweaver` @ 12%, runic_arc @ 5% | 2 |
| Mowzie's Mobs | `mowziesmobs:frostmaw` | Frostmaw | T2 · rush (T1 until 2026-10-16) | structure-locked | `mowziesmobs:frostmaw_spawn` — Everbright's frozen biomes (frostbitten forest and its clearing, snow-covered pines, polar highland, slushlands); strike the icicle it clutches to wake it. Boss Compass. No longer generates in new Overworld chunks (chunks already generated keep theirs) | ice_crystal, frozen_core, `mowziesmobs:naga_fang_dagger` mats, Frostmaw Heart (T2 relic, relic sink 250 essence; was 150) | 2 |
| Terramity | `terramity:ultra_sniffer` | Ultra Sniffer | T2 · miniboss | scripted (post-Super Sniffer) | summoned by Super Sniffer's Pelt (Overworld) | sniffer_kamehameha | 4 |
| Terramity | `terramity:trial_guardian` | Trial Guardian | T2 · miniboss | structure-locked | `terramity:trial_spire` deep boss room — Overworld ocean biomes | guardian_grimoire, guardians_hand, energized_core | 3 |
| Meet Your Fight | `meetyourfight:bellringer` | Bellringer | T2 · miniboss · rush | summoned-by-item | overworld (anywhere using a Calling Bell) | mod-specific cosmetics, music disc, `simplyswords:storms_edge` @ 15% (since 2026-10-16) | 4 |
| Meet Your Fight | `meetyourfight:swampjaw` | Swampjaw | T2 · miniboss · rush | summoned-by-item | swamp biome (Bog Heart) | mod-specific cosmetics | 4 |
| Mutant Monsters | `mutantmonsters:mutant_enderman` | Mutant Enderman | T2 · miniboss · rush[^mutender] | scripted (Skull Spirit on Enderman) | The End or Endermen-spawning areas | mutant ender, endersoul fragment, `simplyswords:slumbering_lichblade` @ 15% (since 2026-10-16) | 4 |
| Majestic Menaces | `majestic_menaces:teikoku_senshi` | Teikoku Senshi | T2 · no tokens · rush[^teikoku] | summoned-by-item | Cherry biome (per [master-appendix.md §C.12](master-appendix.md)); summon item required. Designed health 1,000 | mod-specific drops | 4 |
| Ars Nouveau | `ars_nouveau:wilden_boss` | Wilden Chimera | T2 · no tokens · rush | summoned-by-altar | Ritual Brazier with Wilden Spike + Wilden Horn + Wilden Wing augments | wilden_tribute, source gem material | 3 |

**T2 subtotal:** 22 rows, all on the boss list; **18 on the Tier 2 boss rush** (the 8 Twilight Forest bosses, the 4 Blue Skies bosses, Frostmaw, Bellringer, Swampjaw, the Mutant Enderman, Teikoku Senshi and the Wilden Chimera). Off the roster: the Adherent and the Harbinger Cube (Twilight Forest minibosses with no natural spawn in this version of the mod), Terramity's Ultra Sniffer and Trial Guardian (minibosses). The 3 Aether bosses moved to T4 on 2026-10-16, Gundalf to T3 the same day.

**Removed from Tier 2 on 2026-10-16:** the three Ultris rows (Corrupted Enderman, Giant, Phantom Swarm: Ultris adds no entity types; the first two are met in the Overworld and the swarm in the End, so they moved to the Tier 1 and Tier 4 tables), and the token fragments in the Twilight Forest drop lists (no such item exists; the bosses pay tier-2 kill tokens).

---

## T3 — Late-game mod content (Nether / Undergarden / Deeper Darker / the Abyss)

| Mod | Entity ID | Display Name | Tier | Spawn Mechanism | Spawn Location | Notable Drops | Discovery Pain |
|-----|-----------|--------------|:---:|------------------|----------------|---------------|:--------------:|
| L_Ender's Cataclysm | `cataclysm:netherite_monstrosity` | Netherite Monstrosity | T3 · rush | structure-locked | `burning_arena` (`minecraft:nether_wastes`, 80-chunk spacing). Boss Compass | rare_ink, fire_rune, protection_rune, `simplyswords:brimstone_claymore`, terramity nyxium_greatsword 15% | 2 |
| L_Ender's Cataclysm | `cataclysm:ignis` | Ignis | T3 · rush | structure-locked | `soul_black_smith` (crimson_forest / nether_wastes / soul_sand_valley / warped_forest, 60-spacing). Boss Compass | epic_ink, fire_upgrade_orb, diamond_spell_book @ 15%, `simplyswords:molten_edge`, terramity blasphemic_rapture @ 10% | 2 |
| L_Ender's Cataclysm | `cataclysm:ignited_revenant` | Ignited Revenant | **T4** · rush T3 | scripted (post-Ignis) | Nether, spawns after Ignis kill via "Within Nether Fortresses, Ignited Beserkers have awakened" mechanic. Designed health 1,000 | post-Ignis Nether-fortress drops | 4 |
| L_Ender's Cataclysm | `cataclysm:maledictus` | Maledictus | T3 · rush | structure-locked | `cursed_pyramid` (`minecraft:desert`, 80-spacing). Boss Compass | rare_ink, ender_rune, `simplyswords:twisted_blade` | 2 |
| L_Ender's Cataclysm | `cataclysm:ancient_remnant` | Ancient Remnant | T3 | summoned-by-altar | `cursed_pyramid` deep chamber + Maledictus Eye (Overworld desert). Designed health 2,500 | rare_ink, blood_rune, `simplyswords:awakened_lichblade` (Voidheart Blade base), `terramity:kamehameha` @ 5%, Mahou reagents | 3 |
| L_Ender's Cataclysm | `cataclysm:the_harbinger` | The Harbinger | T3 · rush | structure-locked | `ancient_factory` (`#forge:is_underground`, 112-spacing — deep Y-band). Boss Compass | epic_ink, ender_rune, ender_upgrade_orb, `simplyswords:shadowsting` | 3 |
| L_Ender's Cataclysm | `cataclysm:the_leviathan` | The Leviathan | T3 · rush | structure-locked | `sunken_city` (deep ocean variants — `deep_ocean`, `deep_lukewarm_ocean`, `deep_cold_ocean`, `deep_frozen_ocean`, 100-spacing). Boss Compass | rare_ink, ice_rune, diamond_spell_book @ 10%, `simplyswords:livyatan`, terramity davy_jones @ 10%, Leviathan's Pearl (relic, 40 %) | 2 |
| L_Ender's Cataclysm | `cataclysm:the_baby_leviathan` | The Baby Leviathan | T3 · rush | scripted (post-Leviathan defeat) | spawns in `minecraft:warm_ocean` / `acropolis` structure after Leviathan death | n/a | 3 |
| L_Ender's Cataclysm | `cataclysm:coralssus` | Coralssus | T3 · miniboss · rush | scripted | post-Leviathan trigger — `acropolis` structure | uncommon_ink, nature_rune | 4 |
| L_Ender's Cataclysm | `cataclysm:scylla` | Scylla | T3 · rush | structure-locked | `frosted_prison` (`minecraft:snowy_plains`, 80-spacing). Boss Compass | ice-themed drops, runic items | 2 |
| L_Ender's Cataclysm | `cataclysm:amethyst_crab` | Amethyst Crab | T3 · miniboss | biome-conditional-random | Overworld lush caves (a rare spawn) | blessed amethyst crab meat, the mod's own drops | 4 |
| Iron's Spellbooks | `irons_spellbooks:dead_king` | The Dead King | T3 · rush | structure-locked | `irons_spellbooks:catacombs` (hill / taiga / jungle / forest biomes + plains / desert / swamp / dripstone_caves / lush_caves). Boss Compass | blood_staff @ 50%, necronomicon_spell_book (first-kill guaranteed), Mahou attuned_diamond + kodoku, the Unholy Lance (Virtue's summon) | 2 |
| Iron's Spellbooks | `irons_spellbooks:fire_boss` | Echo of Tyros, First Flamebearer | T3 · rush | structure-locked | `irons_spellbooks:pyromancer_tower` (hill / forest / `#forge:is_plains` / `#forge:is_swamp`). Boss Compass | epic_ink, fire_upgrade_orb, blaze_spell_book (first-kill guaranteed) | 2 |
| Iron's Spellbooks | `irons_spellbooks:citadel_keeper` | Ancient Knight | T3 · rush | structure-locked | `irons_spellbooks:citadel` (overlays `bastion_remnant` in Nether). Boss Compass | keeper_flamberge @ 40% | 2 |
| Iron's Spellbooks | `irons_spellbooks:archevoker` | Archevoker | T3 · rush | structure-locked | `irons_spellbooks:evoker_fort` (hill / forest / `#forge:is_desert` / `#forge:is_plains` / savanna variants). Boss Compass | rare_ink, ender_rune, evoker_spell_book (first-kill guaranteed) | 2 |
| Iron's Spellbooks | `irons_spellbooks:cryomancer` | Cryomancer (mob, boss-tier) | T3 · miniboss · rush[^iss_mob] | biome-conditional-random | snowy biomes / `mountain_tower` (snowy_plains / snowy_taiga / grove / ice_spikes) | ice_staff @ 15%, ice_rune @ 25% | 3 |
| Iron's Spellbooks | `irons_spellbooks:pyromancer` | Pyromancer (mob, boss-tier) | T3 · miniboss · rush | biome-conditional-random | Nether/hot biomes | pyromancer 4-piece armor @ 8-12%/piece, fire_rune @ 20% | 3 |
| Iron's Spellbooks | `irons_spellbooks:necromancer` | Necromancer (mob, boss-tier) | T3 · miniboss · rush | biome-conditional-random | Catacombs / undead-themed biomes | rare_ink, blood_rune drops | 3 |
| Iron's Spellbooks | `irons_spellbooks:magehunter_vindicator` | Magehunter Vindicator | T3 · no tokens | structure-locked | `evoker_fort` (its tower, next to the Archevoker; the Boss Compass row points there since 2026-10-15, not at the Mountain Tower). A boss since 2026-10-14: 500 health, cannot be beheaded or executed (the game creates it as a plain vindicator; the pack recognises it by its class or its sword) | rare_ink @ 15%, magehunter weapon @ 30% | 3 |
| Iron's Spellbooks | `irons_spellbooks:priest` | Priest | T3 · miniboss · rush | biome-conditional-random | various | priest staff, healing items | 4 |
| Undergarden | `undergarden:forgotten_guardian` | Forgotten Guardian | T3 · rush | structure-locked | `undergarden:forgotten_vestige` (Undergarden dimension, jigsaw 5-piece). Boss Compass | undergarden boss tokens, Mahou attuned_diamond | 2 |
| Undergarden | `undergarden:forgotten` | Forgotten | T3 · miniboss · rush | biome-conditional-random | Undergarden — barren biomes | rare_ink, undergarden drops | 4 |
| Undergarden | `undergarden:rotbeast` | Rotbeast | T3 · miniboss · rush | biome-conditional-random | Undergarden — overgrowth / wigglewood biomes | mod-specific drops | 4 |
| Deeper Darker | `deeperdarker:stalker` | Stalker | T3 · rush | structure-locked | `deeperdarker:ancient_temple` (the Otherside's `deeplands` biome). Boss Compass | stalker drops, sculk items, Mahou reagents | 2 |
| Deeper Darker | `deeperdarker:shattered` | Shattered | T3 · rush | biome-conditional-random | the Otherside — `deeplands` (weight 5) + `echoing_forest` (weight 17) | sculk-themed loot, Mahou items | 4 |
| Deeper Darker | `deeperdarker:shriek_worm` | Shriek Worm | T3 · miniboss | scripted | the Otherside: it bursts out of Infested Sculk | sculk-themed drops | 4 |
| Deeper Darker | `deeperdarker:sculk_centipede` | Sculk Centipede | T3 · no tokens | biome-conditional-random | the Otherside — `deeplands` | sculk-themed drops | 4 |
| Stalwart Dungeons | `stalwart_dungeons:awful_ghast` | Awful Ghast | T3 · miniboss · rush | structure-locked | Nether structures (Stalwart Dungeons) | rare_ink, fire_rune | 3 |
| Stalwart Dungeons | `stalwart_dungeons:nether_keeper` | Nether Keeper | T3 · miniboss · rush | structure-locked | Nether structures | rare_ink, blood_rune | 3 |
| Stalwart Dungeons | `stalwart_dungeons:shelterer` | Shelterer | T3 · miniboss · rush | structure-locked | Nether structures (armored variant) | rare_ink, fire_rune, armor pieces | 3 |
| Stalwart Dungeons | `stalwart_dungeons:shelterer_without_armor` | Shelterer (unarmored) | T3 · no tokens · rush | structure-locked | Nether structures | rare_ink, fire_rune | 4 |
| Stalwart Dungeons | `stalwart_dungeons:incomplete_wither` | Incomplete Wither | T3 · miniboss · rush | structure-locked | Nether structures | rare_ink, blood/cooldown runes, diamond_spell_book @ 10% | 3 |
| Stalwart Dungeons | `stalwart_dungeons:reinforced_blaze` | Reinforced Blaze | T3 · miniboss · rush | structure-locked | Nether fortress overlay | uncommon_ink, fire_rune | 3 |
| Stalwart Dungeons | `stalwart_dungeons:giddy_blaze` | Giddy Blaze | T3 · miniboss · rush | structure-locked | Nether fortress overlay | uncommon_ink, fire_rune | 3 |
| Meet Your Fight | `meetyourfight:dame_fortuna` | Dame Fortuna | T3 · rush | summoned-by-item | overworld + Calling Bell variant | mod-specific cosmetics | 4 |
| Meet Your Fight | `meetyourfight:rosalyne` | Rosalyne, Blade of Dusk | T3 · rush | summoned-by-item | dusk-time summon | mod-specific cosmetics | 4 |
| Vanilla (replaced by Progressive Bosses) | `minecraft:wither`; the entity you fight is `progressivebosses:wither` (Progressive Bosses swaps it in the moment a Wither is summoned or built) | Wither | T3 · rush | summoned-by-altar | player crafts wither skeleton skull cross + soul sand (not inside the spawn village's circle) | 2 Nether Stars, 3-6 Wither Bones, 2 Runic Tablets, 3 Rift Shards, a Void Fragment, Advanced Reforging Token (60%), Soulkeeper (15%); first kill per player: the Dormant Relic (15% on later kills). With two or more players near, those spoils come as one loot bag per player | 1 |
| Alex's Mobs | `alexsmobs:warped_mosco` | Warped Mosco | T3 · miniboss · rush | biome-conditional-random | Warped Forest (Nether) | rare_ink, fire_upgrade_orb | 3 |
| Terramity | `terramity:gatmancer` | Gatmancer | T3 · miniboss · rush | structure-locked | `terramity:chthonic_dungeon` — Nether (its pieces hold the gatmancers; jar-read 2026-10-16). Boss Compass | the mod's own drops | 3 |
| Terramity | `terramity:enchanter_merlin` | Enchanter Merlin | T3 · rush (T1 until 2026-10-16; on recommendation, for review) | structure-locked + summoned-by-item | `terramity:chthonic_cathedral` — Nether: Occult Fabric on the Offering Pedestal summons Merlin and Circe together (jar-read 2026-10-16). Boss Compass | wizard staff, fairy summoning items | 3 |
| Terramity | `terramity:sorceress_circe` | Sorceress Circe | T3 · rush (T4 until 2026-10-16; on recommendation, for review) | structure-locked + summoned-by-item | `terramity:chthonic_cathedral` — Nether: Occult Fabric on the Offering Pedestal, with Merlin (jar-read 2026-10-16; the Mausoleum holds stray spawners only). Boss Compass | malediction_bracelets, evil_king_armor pieces | 3 |
| Terramity | `terramity:gundalf` | Archmage Gundalf | T3 · miniboss (T2 until 2026-10-16; on recommendation, for review) | scripted (post-Circe) | `terramity:chthonic_cathedral` — Nether: appears when Sorceress Circe falls (jar-read 2026-10-16). Boss Compass | gundalfs_hat, guardians_hand | 3 |
| The Abyss (TATOS) | `theabyss:elder` | Elder | T3 · no tokens | biome-conditional-random | the Abyss — Blue Mountain | Void Sight ring (10 %), an Abyssal Celestial Artifact (20 %) | 3 |
| The Abyss (TATOS) | `theabyss:the_roka` | The Roka | T3 · no tokens | biome-conditional-random | the Abyss — Blue Jungle (rare) | Embers ring (15 %), an Abyssal Celestial Artifact (50 %) | 4 |
| The Abyss (TATOS) | `theabyss:nightblade_boss` | Nightblade | T3 · no tokens | summoned-by-altar | the Abyss — a Night Altar: light its eight upper pillars with Soul Hearts, then use an Eye of Abyss on it | Shadows and Phantom rings (15 % each), an Abyssal Celestial Artifact (always) | 4 |
| The Abyss (TATOS) | `theabyss:ice_knight` | Ice Knight | T3 · no tokens | biome-conditional-random | the Abyss's Frost World — Wayward Sea and Forgotten Mountains | Frost ring (15 %), Knight ring (25 %) | 3 |
| The Abyss (TATOS) | `theabyss:soul_guard` | Soul Guard | T3 · no tokens | biome-conditional-random | the Abyss — Blue Mountain and Blue Jungle | Dark Pact ring (20 %), Unorithe armour (15 % a piece), Soul Hearts (to a Looting weapon only) | 3 |
| Cardinal Sins | `cardinal_sins:linneausofsloth` | Linneaus, Sin of Sloth | T3 · rush | structure-locked + summoned-by-item | `icraft:cardinal_sins_sloth` — the Abyss (pack structure, 2026-10-16): a Soulweaver Orb on the Malevolichite Shrine. Boss Compass | sin-themed drops | 3 |
| Cardinal Sins | `cardinal_sins:sinofgluttony` | Bacchus, Sin of Gluttony | T3 · rush | structure-locked + summoned-by-item | `icraft:cardinal_sins_gluttony` — the Abyss (pack structure, 2026-10-16): a Sloth Soul Orb on the shrine. Boss Compass | sin-themed drops | 3 |
| Cardinal Sins | `cardinal_sins:sinoflust` | Freya, Sin of Lust | T3 · rush | structure-locked + summoned-by-item | `icraft:cardinal_sins_lust` — the Abyss (pack structure, 2026-10-16): a Gluttony Soul Orb on the shrine. Boss Compass | sin-themed drops | 3 |
| Cardinal Sins | `cardinal_sins:sinofgreed` | Ebenezer, Sin of Greed | T3 · rush | structure-locked + summoned-by-item | `icraft:cardinal_sins_greed` — the Abyss (pack structure, 2026-10-16): a Lust Soul Orb on the shrine. Boss Compass | sin-themed drops | 3 |
| Cardinal Sins | `cardinal_sins:sinofenvy` | Odhran, Sin of Envy | T3 · rush | structure-locked + summoned-by-item | `icraft:cardinal_sins_envy` — the Abyss (pack structure, 2026-10-16): a Greed Soul Orb on the shrine. Boss Compass | sin-themed drops | 3 |
| Cardinal Sins | `cardinal_sins:sinofwrath` | Beowulf, Sin of Wrath | T3 · rush | structure-locked + summoned-by-item | `icraft:cardinal_sins_wrath` — the Abyss (pack structure, 2026-10-16): an Envy Soul Orb on the shrine. Boss Compass | sin-themed drops | 3 |
| Cardinal Sins | `cardinal_sins:sinofpride` | Leon, Sin of Pride | T3 · rush | structure-locked + summoned-by-item | `icraft:cardinal_sins_pride` — the Abyss (pack structure, 2026-10-16): a Wrath Soul Orb on the shrine. Boss Compass | sin-themed drops | 3 |
| Cardinal Sins | `cardinal_sins:drakara` | Drakara, Eternal Mourner | T3 · rush | structure-locked | `icraft:cardinal_sins_drakara` — the Abyss, underground (pack structure, 2026-10-16); no shrine, it waits in its arena. Boss Compass | sin-themed drops | 3 |
| Cardinal Sins | `cardinal_sins:lucifer` | **Lucifer, The Atrocity** (T3 → T4 combat capstone) | **T4** · rush T3 | structure-locked + summoned-by-item | `icraft:cardinal_sins_lucifer` — the Nether (pack structure, 2026-10-16): a Pride Soul Orb on the Atrocity Shrine. Boss Compass | Cursed Sigil of Pride (relic, 40 %), sin-themed drops | 3 |
| Ultris | `minecraft:blaze` (Ultris) | Blaze King | — (T3 area) | structure-locked | Ultris's Blaze King Tower (`1_splatus:blaze_king_tower`), in Nether fortress biomes | Blaze King's Helmet, the Endstone Key (opens the Shulker Stone's fight, Tier 4 table) | 3 |
| Ultris | `minecraft:wither` (Ultris) | Ultra Wither (**cannot be made in this pack**) | — | summoned-by-item | Ultris builds it from a vanilla Wither hit by a thrown Ominous Pearl (the Corrupted Enderman's drop). Every Wither in this pack is Progressive Bosses' own entity, so Ultris never finds a Wither to transform; the stronger Wither of this pack is the Ultimate Wither (Tier 4 table) | — | — |

> **Iron's Spellbooks' casters.** The Cryomancer, Pyromancer, Necromancer and Priest are boss-tier mobs without a boss bar; the pack counts them as minibosses (tokens on every kill) and all four are on the Tier 3 boss rush.

> **Cardinal Sins + Lucifer (added 2026-06-01; the catalog predated this ladder).** The mod escalates **7 sins → Lucifer → Drakara**. Its arenas place only in the Overworld; since 2026-10-16 they are pack structures built from the mod's own templates: Lucifer in the Nether, the other eight in the Abyss. Every shrine takes the previous sin's Soul Orb and works once: Sloth → Gluttony → Lust → Greed → Envy → Wrath → Pride → Lucifer; Drakara waits in its arena. **Lucifer is the last boss of the Tier 3 boss rush**: clearing 100% of the T3 roster, Lucifer included, is the combat route to T4. His kill pays tier-4 tokens; a single Lucifer kill grants no tier (the old milestone routes were retired on 2026-06-01, and the designed Lucifer's Token is not in the game). Non-combat lanes (Engineering / Magic banking the 2,000-token threshold) skip him entirely. The first phases of Lucifer and of three sins (Envy, Pride, Wrath) are separate entities the game shows before the real fight; a kill of a phase is credited to its boss on the roster.

**T3 subtotal:** 58 rows: **56 on the boss list** (45 on the Tier 3 boss rush, Ignited Revenant and Lucifer included, who pay tier-4 tokens; off the roster: the Ancient Remnant, the Magehunter, the Amethyst Crab, Deeper Darker's Shriek Worm and Sculk Centipede, Terramity's Gundalf, and the five Abyss bosses) + 2 Ultris rows (the Blaze King; the Ultra Wither, which cannot be made). The Tier 3 roster by mod: 9 Cataclysm + 8 Iron's Spellbooks + 3 Undergarden + 2 Deeper Darker + 7 Stalwart Dungeons + 2 Meet Your Fight + the Wither + 1 Alex's Mobs + 3 Terramity (Gatmancer, Merlin, Circe) + 9 Cardinal Sins incl. Lucifer = 45.

**Removed from Tier 3 on 2026-10-16:** the four Marium's Soulslike Weaponry bosses (Decaying King, Chaos Monarch, Day Stalker, Night Prowler; the mod is not in the pack), `undergarden:masticator` and `mutantmonsters:mutant_zombie_villager` (not entity types of the installed mods), Ultris's Sanctum Keeper (met in the Overworld: Tier 1 table), and Lucifer's Token from Lucifer's drops (no such item).

---

## T4 — Endgame (the Aether incl. Deep Aether's biomes / End / Ad Astra)

| Mod | Entity ID | Display Name | Tier | Spawn Mechanism | Spawn Location | Notable Drops | Discovery Pain |
|-----|-----------|--------------|:---:|------------------|----------------|---------------|:--------------:|
| L_Ender's Cataclysm | `cataclysm:ender_guardian` | Ender Guardian | T4 | structure-locked | `ruined_citadel` (end_highlands / end_midlands, 50-spacing). Boss Compass | epic_ink, legendary_ink, ender_rune, ender_upgrade_orb, netherite_spell_book @ 10%, `simplyswords:arcanethyst`, Mahou attuned_diamond, antimatter_pacemaker 10%, null_scarf 12% | 1 |
| L_Ender's Cataclysm | `cataclysm:ender_golem` | Ender Golem | T4 · miniboss | structure-locked | `ruined_citadel` + scripted spawn | mid-tier T4 drops | 3 |
| Vanilla | `minecraft:ender_dragon` | Ender Dragon | T4 | dimensional-arrival | The End — main island | dragon egg, advancement chain, legendary_ink, `terramity:planet_buster` @ 15%, antiprism @ 10%, dragon_band @ 12%, Mahou attuned_diamond, Rift Shards + Void Fragments | 1 |
| Botania | `botania:doppleganger` | Guardian of Gaia | T4 | summoned-by-altar | player builds Gaia ritual + uses Terrasteel Sword | gaia_ingot, gaia_block, dice_of_fate | 2 |
| Aether | `aether:slider` | Slider | T4 (T2 until 2026-10-16) | structure-locked | `bronze_dungeon` (Aether dimension, bronze biome). Boss Compass | bronze_dungeon_key, carved_stone, `simplyswords:thunderbrand`, `too_many_bows:scatter_bow`, advanced_reforging_token @ 60%, epic_ink, lightning_upgrade_orb, 1-2 Rift Shards + Void Fragment, 2 Artifact Piece Pouches (+ small awakening-artifact chance), `terramity:olympus` @ 5%, tier-4 first-kill token | 1 |
| Aether | `aether:valkyrie_queen` | Valkyrie Queen | T4 (T2 until 2026-10-16) | structure-locked + scripted | `silver_dungeon` (Aether), interact with the Valkyrie inside to begin the fight. Boss Compass | magehunter @ 30%, `simplyswords:caelestis`, `too_many_bows:wind_bow`, `too_many_bows:radiance`, 1-2 Rift Shards + Void Fragment, tier-4 first-kill token | 2 |
| Aether | `aether:sun_spirit` | Sun Spirit | T4 (T2 until 2026-10-16) | structure-locked + scripted | `gold_dungeon` (Aether), requires summon ritual on Sun Altar. Boss Compass | `simplyswords:sunfire`, `too_many_bows:aethers_call`, legendary_ink, fire + holy upgrade orbs, Sunfeather Charm (T4 relic), 1-2 Rift Shards + Void Fragment, `terramity:divine_intervention` @ 10%, tier-4 first-kill token | 2 |
| Deep Aether | `deep_aether:eots_controller` | Eye of the Storm | T4 | structure-locked | `deep_aether:brass_dungeon` (Deep Aether biomes, inside the Aether dimension). Boss Compass | t4 sky-end drops, `simplyswords:flamewind` @ 15% | 2 |
| Terramity | `terramity:virtue` | Virtue | T4 | summoned-by-item | `terramity:prismatic_pond` — **Deep Aether** land biomes of the Aether (relocated 2026-05-30; a surface start since 2026-10-16, it never generated before); the Unholy Lance (the Dead King's drop) thrown into its prism solution is the only summon, the Overworld summon is refused. Boss Compass | archangel_halo, holy items | 3 |
| Terramity | `terramity:thunker` | Thunker | T4 · miniboss | biome-conditional-random | every Nether biome (a common spawn), and the halls of the Chthonic Dungeon (`terramity:chthonic_dungeon`). Its Boss Compass row leads to the Chthonic Cathedral, which holds no Thunker (reported 2026-10-16) | giant_dungeon_slab | 2 |
| Terramity | `terramity:uvogre` | Uvogre | T4 · miniboss | biome-conditional-random | any biome of any dimension (a rare spawn) | mod drops | 4 |
| Terramity | `terramity:duskrok` | Duskrok | T4 · miniboss | biome-conditional-random | Overworld deserts and badlands, the Nether's soul sand valley (rare) | mod drops | 4 |
| Terramity | `terramity:hellrok` | Hellrok | T4 · miniboss | biome-conditional-random | the Nether's wastes and crimson forests (rare) | mod drops | 4 |
| Alex's Mobs | `alexsmobs:void_worm` | Void Worm | T4 · miniboss | summoned-by-item | The End — toss a Mysterious Worm into the void | mysterious_worm essence, void-themed drops, legendary_ink | 4 |
| Alex's Mobs | `alexsmobs:cachalot_whale` | Cachalot Whale (white variant) | — (Overworld oceans) | biome-conditional-random | lukewarm/cold/deep oceans (white variant is rare-spawn) | cachalot whale tooth, leg/uncommon ink | 5 |
| Progressive Bosses | `progressivebosses:wither` at level 3 (the same entity as the Wither; the level comes from the block it is built with) | Ultimate Wither (optional) | T3 · rush (it is the Wither's entry; designed health 1,000 at level 3) | summoned-by-altar | the Nether only: the Wither's T with Corrupted Soul Sand (soul sand or soul soil + 3 Nether Stars, a Tier 4 recipe) in the centre of the arms; anywhere else the build is refused and the blocks stay | 3,000 health, heavy armour; 5 Nether Stars, 2 Netherite Upgrade templates, 3,000 XP and the Wither's other spoils (with two or more players near: a plain Wither's loot bag per player instead). Quest: Challenge: The Ultimate Wither | 1 |
| Ultris | `minecraft:phantom` (Ultris) | Phantom Swarm | — (T4 area) | scripted | a random event on the End's outer islands, away from End Cities | the mod's own drops | 4 |
| Ultris | `minecraft:cow` (Ultris's construct) | Shulker Stone | — (T4 area) | summoned-by-item | Ultris's End pyramid (`1_splatus:endcity_pyramid`, beside End Cities): insert the Endstone Key (the Blaze King's drop) at the pedestal on top | the Shulker Shell Helmet | 3 |
| Multiplayer Bosses[^mpb] | (enhances vanilla Dragon/Wither/Warden) | (no new entity) | n/a | n/a | enhances existing kill targets | LootBag drops | n/a |
| Vanilla | `minecraft:warden` | Warden | T4 | structure-locked | Ancient Cities (deep dark biome) | sculk catalyst, echo shard, Mahou attuned_diamond (cross-mod drop) | 2 |

> **Removed phantoms (2026-06-01 #47 sweep).** `cataclysm:void_blossom`[^void_blossom] (the entity belongs to the absent `bosses_of_mass_destruction`, not Cataclysm) and `lu_more_bosses_and_mobs:end_dwellee`[^lmore] (LuMoreBossesAndMobs is not installed) were dropped from the T4 table. The footnotes are retained for the record.

**T4 subtotal:** 20 rows: **15 Tier 4 bosses on the boss list** (the Ender Dragon, the Warden, Ender Guardian, Guardian of Gaia, the three Aether bosses, Eye of the Storm and Virtue; minibosses: Ender Golem, the Void Worm, Thunker, Uvogre, Duskrok and Hellrok) + the Ultimate Wither (the Wither's own entry, level 3) + 4 rows off the list (Cachalot Whale, two Ultris bosses, Multiplayer Bosses). Lucifer and the Ignited Revenant also pay tier-4 tokens; they are listed under T3, whose boss rush they count for. T4 has no boss rush. The Ender Dragon is the **pack finale** — reached today with Eyes of Ender (staged at T4; a planned **End Compass → End Bastion**, the compass crafted from the Aether's materials, would replace them).

**Removed from Tier 4 on 2026-10-16:** the Ancient Remnant (a Tier 3 boss: T3 table), the second Mutant Enderman row (it is a Tier 2 miniboss wherever it is met), the Mutant Snow Golem (a golem the player builds: an ally, not a boss), Sorceress Circe (Tier 3 since 2026-10-16) and Terramity's Dungeon Effigy (it lives in the Overworld's Trial Spire: Tier 1 table).

---

## Postgame / Ascension (designed, not all entity-backed)

| Mod | Entity ID | Display Name | Tier | Spawn Mechanism | Spawn Location | Notable Drops | Discovery Pain |
|-----|-----------|--------------|:---:|------------------|----------------|---------------|:--------------:|
| Mythic Forge[^mythic] | n/a (designed as KubeJS-spawned mob waves) | Rift floor guardians | postgame | scripted | Oblivion's Rift floors (designed; **not built**: today Rift Shards and Void Fragments drop from Tier 4 bosses and End mobs) | Rift Shard, Void Fragment, Rift Core | 5 (no compass support — Rift floors are sequential, not lookup-able) |
| Botania | `botania:magic_landmine` | Gaia Trap | postgame | scripted (Gaia ritual support entity) | Gaia ritual arena | n/a (mechanism, not boss) | n/a |

**Postgame subtotal:** Rift bosses are procedurally generated and outside the compass scope.

---

## Summary

> **Not every boss in this catalog counts toward the boss rush.** The boss rush credits a kill by the boss's entity type,
> and its rosters hold only bosses that exist as entity types in the current pack: **9 in Tier 1, 18 in Tier 2, 45 in
> Tier 3** (since 2026-10-16, when Frostmaw moved from Tier 1 to Tier 2, the Aether's three dungeon bosses from Tier 2 to
> Tier 4, which has no boss rush, and Merlin and Circe to Tier 3; before: 11 / 20 / 43). Left out because they cannot be
> recognised: the Brutal Bosses champions and the Ultris bosses (those mods add no entity types of their own). Teikoku
> Senshi is `majestic_menaces:teikoku_senshi`.
>
> **The rosters are the pack's boss registry, and they include minibosses** (the three Mutant Monsters and Mowzie's Naga
> in Tier 1; Swampjaw, the Bellringer and the Mutant Enderman in Tier 2; Coralssus, Iron's Spellbooks' four casters and
> the Stalwart Dungeons bosses in Tier 3, among others). A tier is bought only with the tier below held (since
> 2026-10-15). Minibosses on no roster pay tokens on every kill, like the others: MCA's `mca:grim_reaper` (Tier 1), the
> Twilight Forest's Adherent and Harbinger Cube (which do not spawn naturally) and Terramity's Ultra Sniffer and Trial Guardian (Tier 2), the
> `cataclysm:amethyst_crab`, Deeper Darker's Shriek Worm and Terramity's Gundalf (Tier 3), and the Tier 4 minibosses.
> The Twilight Forest's `twilightforest:plateau_boss`, a placeholder that crashed the server when it died, is kept out of
> the world (2026-10-15).

**Total: 117 rows** (17 + 22 + 58 + 20), of which **104 are bosses on the pack's boss list** (the Ultimate Wither, the Wither's level 3, counted once): 72 on a boss-rush roster (9 + 18 + 45), the rest minibosses on no roster or bosses that pay no tokens. The other rows are the Brutal Bosses champions (one row), seven Ultris bosses (six that exist as vanilla mobs, and the Ultra Wither, which cannot be made here), Terramity's Dungeon Effigy, the white Cachalot Whale and Multiplayer Bosses. Boss Checklist's own registry has 167 entries across 57 mods; most of those mods are not in the pack. The per-tier boss-rush rosters (the boss registry's `rush` field) are the canonical denominators for the 80 / 90 / 100% advance routes. Everything else on this list is "additional boss-tier content" the compass could optionally support.

### Rough tier distribution

| Tier | Rows | Of which Discovery Pain ≥4 |
|------|-----:|---------------------------:|
| T1 | 17 | 8 |
| T2 | 22 | 7 |
| T3 | 58 | 14 |
| T4 | 20 | 6 |
| **Total** | **117** | **35** |

About **30% of the catalog scores Discovery Pain ≥4**, meaning a player without an external wiki has no reliable way to find those bosses in-game. This is the compass system's core value proposition.

### Mods contributing the most "discovery pain" (Discovery Pain ≥4)

1. **Mutant Monsters (4 high-pain entries)** — the mutant variants come from Skull Spirit summoning or rare natural spawns; the Codex doesn't explain.
2. **Ultris (4 high-pain entries)** — the Corrupted Enderman, the Illusioner and the Phantom Swarm are random events and the Giant a potion thrown at a zombie, with no structure Explorer's Compass can find; the Ultra Wither cannot be made at all.
3. **Terramity (4 high-pain entries)** — the Ultra Sniffer summon and the rare Uvogre, Duskrok and Hellrok spawns have no compass support.
4. **Meet Your Fight (4 high-pain entries)** — every MYF boss is summoned-by-item with no in-game signal of how to craft the summon item.
5. **L_Ender's Cataclysm and Deeper Darker (3 each)** — the Ignited Revenant and Coralssus appear only after another boss falls, the Amethyst Crab is a rare lush-cave spawn; the Shattered, Shriek Worm and Sculk Centipede are Otherside spawns with no structure to find.
6. **Twilight Forest (2 entries, score 5)** — the Adherent and the Harbinger Cube have no natural spawn at all in this version of the mod: they are on the boss list but cannot be met in survival.
7. **Undergarden, The Abyss, Alex's Mobs (2 each)** — biome spawns (Forgotten, Rotbeast, The Roka), an altar ritual the Codex doesn't fully explain (Nightblade), a crafting chain (Void Worm) and a 0.1% rare variant (white Cachalot Whale).
8. **Iron's Spellbooks (1 high-pain entry, the Priest; the three other casters score 3)** — these are *boss-tier mobs* (not boss-bar-rendering bosses) that spawn naturally in matching biomes.

### Patterns observed in spawn mechanism distribution

The May 2026 counts by spawn mechanism (52 structure-locked, 23 biome-random, 8 altar, 12 item, 11 scripted, 2 dimensional arrival) were taken over rows that included bosses the pack does not have; recounted over the 117 rows of 2026-10-16:

| Mechanism | Count | % | Compass strategy |
|-----------|------:|---:|------------------|
| structure-locked (incl. structure + summon, + trade, + scripted) | 59 | 50% | **Already partially solved** by ExplorersCompass; compass just needs to know the right structure name per boss. |
| biome-conditional-random | 21 | 18% | **No existing solution.** Compass needs to know the biome list + dimension and direct the player to a spawn-eligible chunk. |
| summoned-by-altar | 11 | 9% | **Knowledge problem, not navigation.** Compass should display the summoning recipe + altar location once player has the ingredients. |
| summoned-by-item | 9 | 8% | **Compass should display craft-tree of summon item** — boss has no fixed location. |
| scripted | 13 | 11% | **Most pain.** Compass needs to display the trigger condition (e.g., "Spawn after killing Leviathan in warm_ocean"). |
| dimensional-arrival | 1 | 1% | Ender Dragon — compass is overkill, but cataloging helps Compendium completion. |
| none (spawn egg only) | 2 | 2% | The Twilight Forest's Adherent and Harbinger Cube: nothing to point at. |
| n/a | 1 | 1% | Multiplayer Bosses (no entity of its own). Skip. |

### Outliers / oddities the compass design will need to handle

- **Bosses with multiple spawn locations.** Aether's Sun Spirit needs both `gold_dungeon` structure presence AND a player-driven Sun Altar ritual inside it. Compass should chain: locate dungeon → display "use sun altar with summon item" overlay.
- **Regional variants.** Cataclysm Coralssus and The Baby Leviathan are *scripted-spawn after a Leviathan kill*. The compass should hide them from the discovery list until Leviathan is dead, then reveal "go back to a warm_ocean / acropolis".
- **Conditional summoning.** Several bosses spawn wherever the player sets them off (Ultris's Giant, the Meet Your Fight bosses, the Void Worm): the compass can't direct to a "location". Best display: recipe + "summon anywhere in dim X". (Ultris's Ultra Wither, the example here until 2026-10-16, cannot be made in this pack.)
- **Bosses whose tier differs from where they are met.** Merlin, Circe and Gundalf (Tier 3) and Thunker (Tier 4) share the Nether's Chthonic Cathedral; Lucifer and the Ignited Revenant pay tier-4 tokens but count for the Tier 3 rush; Ultra Sniffer and Trial Guardian (Tier 2) are met in the Overworld. The compass shows each boss under its registry tier.
- **Boss-tier mobs vs. boss-bar bosses.** Iron's Spellbooks Pyromancer/Cryomancer/Necromancer/Priest, the Mutant Monsters variants, and the Stalwart Dungeons mini-bosses do **not** render boss bars — they're just high-HP / high-damage mobs. The compass UX needs to distinguish "trophy boss with a bar" from "boss-tier mob you should grind for drops" — possibly two sections in the UI.
- **Structure-locked but dimension-conditional.** The Iron's Spellbooks Citadel overlays `minecraft:has_structure/bastion_remnant` (Nether) — the compass needs to filter "only show after player has T3" because the bastion exists at T1 but the Citadel Keeper drops T3 loot. The AStages stage flag should be the compass's visibility filter.
- **Bosses with no way to meet them.** The Twilight Forest's Adherent and Harbinger Cube are on the boss list but have no natural spawn in this version of the mod (spawn eggs only). The compass should leave them out rather than point nowhere. (`terramity:dungeon_effigy`, the example here until 2026-10-16, lives in the Overworld's Trial Spire.)
- **Custom origins / class-tied content (Witch of Ink, Artificial Construct).** The Witch of Ink "dimension" referenced in `master.md` Part IV does not appear to be a real dimension/mod in the live pack — likely future content. Skip from compass for now.

---

[^t1cata]: `cataclysm:old_netherite_monstrosity` appeared in the lang file as a legacy entity ID; the installed Cataclysm registers no such entity (the Netherite Monstrosity is `cataclysm:netherite_monstrosity`, Tier 3). Its Tier 1 row was removed on 2026-10-16.

[^lmore]: ~~LuMoreBossesAndMobs~~ — **CONFIRMED NOT INSTALLED (2026-05-30 jar audit).** No `lu_more`/`lumore`/`moreboss` jar in `mods/`; `macholote` / `gold_mini_golem` are not registered entities in the live pack. The two T1 rows have been removed, and so has the design block in `master-appendix.md §C.12`.

[^teikoku]: Majestic Menaces' jar is named "Majestic Manaces"; its entity is `majestic_menaces:teikoku_senshi`. (The catalog used to name a `crazybossfights` namespace; no such entity exists.) The registry gives it a designed health of 1,000 and the boss x3, and keeps it on the Tier 2 rush, without kill tokens.

[^iss_mob]: The Iron's Spellbooks Cryomancer/Pyromancer/Necromancer/Priest are *boss-tier mob spawns*, not entities with boss bars. They're listed because the pack counts them as minibosses on the Tier 3 boss rush, and `master-appendix.md §C.1` assigns their drops.

[^mutender]: The Mutant Enderman is a Tier 2 miniboss wherever it is met: a Skull Spirit on an Enderman makes one, and they also appear in the End. Until 2026-10-16 the catalog listed it a second time under T4.

[^void_blossom]: `cataclysm:void_blossom` is mentioned in `master-appendix.md §D.6` with 2000 HP base — but inspection shows that void_blossom is actually from the `bosses_of_mass_destruction` mod (NOT in this pack). The boss registry keeps it as an absent entry, so no system acts on it.

[^mpb]: Multiplayer Bosses enhances vanilla Dragon/Wither/Warden with a LootBag drop and tougher AI but registers no new entity. Tracked here because the design intent treats vanilla bosses as T3/T4 progression bosses.

[^mythic]: Rift bosses were designed as KubeJS-spawned procedural mob waves on each Rift floor (Loop 1 endgame); the floors are not built. Not entity-backed bosses; out of compass scope.
