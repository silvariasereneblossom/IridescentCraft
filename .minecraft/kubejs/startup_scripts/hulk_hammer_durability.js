// =============================================================================
// HULK HAMMER DURABILITY OVERRIDE
// Place in: kubejs/startup_scripts/hulk_hammer_durability.js
// =============================================================================
//
// 2026-05-14: Boost mutantmonsters:hulk_hammer durability 64 -> 640.
// Native value is too brittle for a T1 melee weapon (1 swing = 1 durability,
// 0.5 attack-speed means ~2 minutes of swings before destruction).
//
// 2026-05-31 FIX: the old version used reflection on Item's private maxDamage
// field via `ItemClass.class.getDeclaredField(...)`. In KubeJS 2001.6.5 Rhino,
// `<loadedClass>.class` is not valid (you can't get java.lang.Class that way),
// so every run hit the catch block and the override silently no-op'd. KubeJS
// DOES mixin a setter onto the raw Item (`ItemKJS#kjs$setMaxDamage(int)`), which
// ItemEvents.modification exposes -- so we use that. No reflection, no fragile
// final-field writes.
//
// Pairs with:
//   server_scripts/hulk_hammer_attributes.js  -- 20 atk dmg / 0.5 aspd /
//     +50% dmg vs undead via ItemAttributeModifierEvent
//   datapack_sources/icraft_mm_overrides/.../mutant_zombie.json -- 25% drop
//   client_scripts/jei_hiding.js -- hides other MM items, keeps hulk_hammer
// =============================================================================

ItemEvents.modification(event => {
  event.modify('mutantmonsters:hulk_hammer', item => {
    item.kjs$setMaxDamage(640)
  })
})
