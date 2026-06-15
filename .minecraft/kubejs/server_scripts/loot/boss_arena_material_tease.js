// =============================================================================
// BOSS-ARENA MATERIAL TEASE — icraft #58 (Piece B, the A<->B cross-piece link)
// =============================================================================
// The single most important cross-piece guardrail (scope sec.0): an arena chest
// may TEASE 0-2 of the boss's signature material drop at LOW weight, so a player
// who clears the arena once gets a taste of the boss-Tetra material (Piece A)
// before farming the boss for the full refight-to-repair loop. The BULK repair
// supply MUST stay the boss refight -- so this is a low-chance single-item tease,
// never enough to self-sustain repairs.
//
// IMPORTANT design rule: we tease ONLY materials whose repair item is a genuine
// crafting MATERIAL (ingot / shard / essence / crystal / fragment). Materials
// bound to a boss TROPHY or WEAPON (the ⚑A set: lich_trophy, keeper_flamberge,
// blood_staff, snow_queen_trophy, sol_visage, magehunter, dragongreatsword, ...)
// are deliberately NOT teased -- handing their repair item out of a chest would
// give the repair without the fight and break the whole refight-to-repair point.
// Those bosses stay chest-tease-free; the boss is their only repair source.
//
// Arena -> chest-table IDs jar-verified 2026-06-03 (structure NBT scan). Arenas
// with no chest table (court_of_gnomes, soul_black_smith, hydra_lair, forgotten_
// vestige, the Cardinal Sins feature-arenas, ...) get no tease -- the boss drop
// is their only material source, which is fine. Tables targeted are the common
// loot chest per arena (not boss/key chests) to keep the tease light.
//
// cataclysm:cursed_pyramid already teases ancient_metal_ingot via the existing
// icraft override (data/icraft/loot_tables/chests/cursed_pyramid.json) -- not
// duplicated here.
// =============================================================================

LootJS.modifiers(event => {

  // tease(chestTable, materialItem, itemChance, tierToken, tokenChance)
  // RHINO-SAFETY: var (not const) — closure-local in a LootJS.modifiers callback.
  var tease = (table, item, chance, token, tchance) => {
    var m = event.addLootTableModifier(table)
    m.addLoot(LootEntry.of(item).when(c => c.randomChance(chance)))
    if (token) m.addLoot(LootEntry.of(token).when(c => c.randomChance(tchance)))
  }

  var T1 = 'icraft:progression_token_t1'
  var T2 = 'icraft:progression_token_t2'
  var T3 = 'icraft:progression_token_t3'

  // ---- T1 ----
  // bm_sniffer (Super Sniffer) -> gaianite_cluster
  tease('terramity:chests/ancient_outcrop_loot', 'terramity:gaianite_cluster', 0.12, T1, 0.06)

  // ---- T2 ----
  // tf_urghast (Ur-Ghast) -> fiery_tears
  tease('twilightforest:chests/darktower_cache', 'twilightforest:fiery_tears', 0.10, T2, 0.05)
  // bs_summoner (Summoner) -> soul_fragment
  tease('blue_skies:chests/nature_dungeon/chest', 'blue_skies:soul_fragment', 0.12, T2, 0.05)
  // bs_alchemist (Alchemist) -> ventium_ingot
  tease('blue_skies:chests/poison_dungeon/chest', 'blue_skies:ventium_ingot', 0.12, T2, 0.05)
  // bs_starlit (Starlit Crusher, Everbright) -> falsite_ingot
  tease('blue_skies:chests/blinding_dungeon/prison_chest_everbright', 'blue_skies:falsite_ingot', 0.10, T2, 0.05)
  // bs_arachnarch (Arachnarch, Everdawn) -> spider_webbing
  tease('blue_skies:chests/blinding_dungeon/prison_chest_everdawn', 'blue_skies:spider_webbing', 0.12, T2, 0.05)

  // ---- T3 ----
  // cm_monstrosity (Netherite Monstrosity) -> lava_power_cell  (burning_arena = acropolis_treasure)
  tease('cataclysm:chests/acropolis_treasure', 'cataclysm:lava_power_cell', 0.10, T3, 0.05)
  // cm_scylla (Scylla) -> lacrima
  tease('cataclysm:chests/frosted_prison_treasure', 'cataclysm:lacrima', 0.12, T3, 0.05)
  // iss_tyros / iss_archevoker: the ISS material tease (cinder_essence / arcane_essence) was MOVED
  // to zz_iss_arena_enrichment.js on 2026-06-14 — those irons_spellbooks: items are eaten by
  // lootjs_overhaul's LootType.CHEST ISS strip when added here (this file loads BEFORE lootjs_overhaul,
  // and removeLoot is a one-shot removeIf in load order). The T3 token (icraft ns, never stripped)
  // stays so the two arenas keep their progression token.
  event.addLootTableModifier('irons_spellbooks:chests/pyromancer_tower/pyromancer_supplies')
    .addLoot(LootEntry.of(T3).when(c => c.randomChance(0.05)))
  event.addLootTableModifier('irons_spellbooks:chests/evoker_fort')
    .addLoot(LootEntry.of(T3).when(c => c.randomChance(0.05)))
  // dd_stalker (Stalker) -> soul_crystal
  tease('deeperdarker:chests/ancient_temple_storage', 'deeperdarker:soul_crystal', 0.10, T3, 0.05)
  // tm_gatmancer (Gatmancer) -> occult_fabric
  tease('terramity:chests/infested_lab_loot', 'terramity:occult_fabric', 0.12, T3, 0.05)

  // ---- T4 ---- (no T4 token; T3 is the top progression token)
  // da_eots (Eye of the Storm) -> squall_plate
  tease('deep_aether:chests/dungeon/brass/brass_dungeon_loot', 'deep_aether:squall_plate', 0.08, T3, 0.04)

  console.log('[boss_arena_material_tease] registered 13 arena material teases + tier tokens (icraft #58 Piece B)')
})
