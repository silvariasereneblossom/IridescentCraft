// =============================================================================
// JEI ITEM HIDING
// =============================================================================
// (2026-10-11: this file began as the hide list for the five
//  kubejs:transmuted_* tier-skip items. Those items were removed -- nothing
//  ever produced or consumed them -- so only the lists below remain.)
// =============================================================================

JEIEvents.hideItems(event => {
  // Terramity guns + ammo + gunsmith — design keeps Terramity bosses and
  // structures, removes firearms. Recipe removal in recipe_audit.js, loot
  // strip in lootjs_overhaul.js; this hides the items from the JEI browser
  // so players don't encounter them there either.
  ;[
    'terramity:basic_pistol', 'terramity:basic_rifle', 'terramity:advanced_pistol',
    'terramity:advanced_automatic_rifle', 'terramity:advanced_burst_rifle',
    'terramity:suppressed_advanced_pistol', 'terramity:anti_material_rifle',
    'terramity:antimatter_rifle', 'terramity:conductite_laser_rifle',
    'terramity:elite_rifle', 'terramity:flintlock_pistol', 'terramity:plague_pistol',
    'terramity:big_iron', 'terramity:asphodel', 'terramity:handcannon',
    'terramity:meteor_cannon', 'terramity:moondrill_cannon', 'terramity:railgun',
    'terramity:rocket_launcher', 'terramity:pump_action_shotgun',
    'terramity:sawed_off_shotgun', 'terramity:flare_gun',
    // ('terramity:hellspec_super_shotgun' removed 2026-10-11: Terramity 0.9.8
    //  registers no such item -- only its hellspec_shotshells ammo, listed
    //  below. An unknown id hides nothing here, so this was a dead entry.)
    'terramity:gunkshot_projectile', 'terramity:flare_gun_projectile',
    'terramity:enderswap_projectile', 'terramity:shadowflame_bullet',
    'terramity:steel_shell', 'terramity:chthonic_shell_casing',
    'terramity:daemonium_shotshells', 'terramity:daemonium_shotshell_projectile',
    'terramity:hellspec_shotshells',
    'terramity:copper_round', 'terramity:gold_round', 'terramity:antimatter_round',
    'terramity:dimlite_round', 'terramity:iridium_round', 'terramity:suppressed_gold_round',
    'terramity:gunsmith_station', 'terramity:advanced_gun_parts',
    'terramity:ammo_bag', 'terramity:ammo_box', 'terramity:bottomless_ammo_box',
  ].forEach(id => event.hide(id))

  // Infinity Ham (Relics) -- breaks our food/hunger balance (autophagy
  // ability ticks feed onto the wearer). Native loot.entries zeroed in
  // config/relics/infinity_ham.json (2026-05-14); ability stats zeroed
  // + required levels raised to 1000 same date. Hidden from JEI here.
  // Paired with strip_infinity_ham.js (server) which removes any held
  // instance from inventories on inventoryChanged.
  event.hide('relics:infinity_ham')

  // Mutant Monsters (2026-05-14) -- strip all crafted/drop items from
  // JEI. Drops zeroed via icraft_mm_overrides datapack; recipes removed
  // in server_scripts/recipes/strip_mutant_monsters.js. Spawn eggs kept
  // visible (admin/creative use). Hulk Hammer kept visible as a fun T1
  // melee drop from mutant_zombie (25% on player kill, modified stats).
  ;[
    'mutantmonsters:chemical_x',
    'mutantmonsters:lingering_chemical_x',
    'mutantmonsters:splash_chemical_x',
    'mutantmonsters:creeper_minion_tracker',
    'mutantmonsters:creeper_shard',
    'mutantmonsters:endersoul_hand',
    'mutantmonsters:mutant_skeleton_arms',
    'mutantmonsters:mutant_skeleton_boots',
    'mutantmonsters:mutant_skeleton_chestplate',
    'mutantmonsters:mutant_skeleton_leggings',
    'mutantmonsters:mutant_skeleton_limb',
    'mutantmonsters:mutant_skeleton_pelvis',
    'mutantmonsters:mutant_skeleton_rib',
    'mutantmonsters:mutant_skeleton_rib_cage',
    'mutantmonsters:mutant_skeleton_shoulder_pad',
    'mutantmonsters:mutant_skeleton_skull',
  ].forEach(id => event.hide(id))

  // Simply Swords runic crafting (2026-10-11, operator: "no runic crafting").
  // The 15 runic weapons and the two fused gems have no recipe any more
  // (server_scripts/recipes/tier_gated_recipes.js, "Runic crafting OFF") and
  // no loot source (the mod's chest injection is stripped), so they are hidden
  // here like the other items that are out of the pack. NOT hidden: the Runic
  // Tablet (a Wither drop) and the Dormant / Righteous / Tainted Relics.
  ;[
    'simplyswords:runic_chakram', 'simplyswords:runic_claymore',
    'simplyswords:runic_cutlass', 'simplyswords:runic_glaive',
    'simplyswords:runic_greataxe', 'simplyswords:runic_greathammer',
    'simplyswords:runic_halberd', 'simplyswords:runic_katana',
    'simplyswords:runic_longsword', 'simplyswords:runic_rapier',
    'simplyswords:runic_sai', 'simplyswords:runic_scythe',
    'simplyswords:runic_spear', 'simplyswords:runic_twinblade',
    'simplyswords:runic_warglaive',
    'simplyswords:runefused_gem', 'simplyswords:netherfused_gem',
  ].forEach(id => event.hide(id))
})
