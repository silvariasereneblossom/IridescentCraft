// =============================================================================
// JEI ITEM HIDING — Transmuted Materials
// =============================================================================
// Hide transmuted tier-skip items from JEI item panel.
// They still work in recipes via forge tags — players discover them
// through the Codex or by looking up input material uses.
// =============================================================================

JEIEvents.hideItems(event => {
  event.hide('kubejs:transmuted_steel')
  event.hide('kubejs:transmuted_manasteel')
  event.hide('kubejs:transmuted_osmium')
  event.hide('kubejs:transmuted_diamond')
  event.hide('kubejs:transmuted_ancient_debris')

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
    'terramity:hellspec_super_shotgun',
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
})
