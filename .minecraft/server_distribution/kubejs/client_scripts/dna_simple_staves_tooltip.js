// =============================================================================
// DAN'S MAGIC + SIMPLE STAVES — Held-item buff tooltips (client side)
// =============================================================================
// Server-side buff application lives in server_scripts/integration/
// dna_simple_staves_buffs.js. The buffs are applied to the PLAYER (not the
// item), so the vanilla "Item.defaultModifiers" tooltip line is absent. We
// re-create the missing line here so players see what each staff/wand does
// in JEI / inventory hover, matching the pre-2001 baked-modifier behavior.
//
// Per-id addAdvanced calls (NOT addAdvancedToAll — silent no-op in this
// KubeJS build). No `if (stack.isEmpty) return` — bare property access on
// the function is always truthy in Rhino and would early-return every
// hover.
//
// Memory: feedback_kubejs_tooltip_api.md, feedback_distro_jar_deploy.md.
// =============================================================================

ItemEvents.tooltip(event => {

  // ─── Dan's Magic — T1 element staves (+20%) ───────────────────────────

  event.addAdvanced('dna:ice_staff', (stack, advanced, text) => {
    text.add(Text.of('+20% Ice Spell Power').color('aqua'))
  })

  event.addAdvanced('dna:lightning_staff', (stack, advanced, text) => {
    text.add(Text.of('+20% Lightning Spell Power').color('yellow'))
  })

  event.addAdvanced('dna:magma_staff', (stack, advanced, text) => {
    text.add(Text.of('+20% Fire Spell Power').color('red'))
  })

  event.addAdvanced('dna:toxic_staff', (stack, advanced, text) => {
    text.add(Text.of('+20% Nature Spell Power').color('green'))
  })

  // Apprentice Battlerod (dna:tnt_staff) — display-name rename via
  // kubejs/assets/dna/lang/en_us.json overlay; tooltip lists the three
  // attribute modifiers we apply at tick time.
  event.addAdvanced('dna:tnt_staff', (stack, advanced, text) => {
    text.add(Text.of('+5% Spell Power').color('light_purple'))
    text.add(Text.of('+6 Attack Damage').color('red'))
    text.add(Text.of('Sword-tier Attack Speed').color('gray'))
  })

  // ─── Simple Staves — element wands ────────────────────────────────────

  event.addAdvanced('simple_staves:flame_wand', (stack, advanced, text) => {
    text.add(Text.of('+35% Fire Spell Power').color('red'))
  })

  event.addAdvanced('simple_staves:wind_essence_wand', (stack, advanced, text) => {
    text.add(Text.of('+20% Lightning Spell Power').color('yellow'))
    text.add(Text.of('+5% Movement Speed').color('white'))
  })

  event.addAdvanced('simple_staves:thunder_wand', (stack, advanced, text) => {
    text.add(Text.of('+35% Lightning Spell Power').color('yellow'))
  })

  event.addAdvanced('simple_staves:venomite_wand', (stack, advanced, text) => {
    text.add(Text.of('+35% Nature Spell Power').color('green'))
  })

  event.addAdvanced('simple_staves:viritium_wand', (stack, advanced, text) => {
    text.add(Text.of('+50% Nature Spell Power').color('green'))
  })

  event.addAdvanced('simple_staves:veil_wand', (stack, advanced, text) => {
    text.add(Text.of('+50% Holy Spell Power').color('gold'))
  })

  event.addAdvanced('simple_staves:void_wand', (stack, advanced, text) => {
    text.add(Text.of('+50% Ender Spell Power').color('dark_purple'))
  })

  event.addAdvanced('simple_staves:tenebrium_wand', (stack, advanced, text) => {
    text.add(Text.of('+75% Ender Spell Power').color('dark_purple'))
  })

})
