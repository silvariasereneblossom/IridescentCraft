// =============================================================================
// HULK HAMMER DURABILITY OVERRIDE
// Place in: kubejs/startup_scripts/hulk_hammer_durability.js
// =============================================================================
//
// 2026-05-14: Boost mutantmonsters:hulk_hammer durability 64 -> 640.
// Native value is too brittle for a T1 melee weapon (1 swing = 1 durability,
// 0.5 attack-speed means ~2 minutes of swings before destruction).
//
// Approach: reflection on the private int maxDamage field of Item.
// 1.20.1 Forge uses official Mojang mappings so the field is named
// "maxDamage" directly (not the SRG `f_xxxxx_` form). KubeJS startup_scripts
// run AFTER item registration, so the registry lookup is safe here.
//
// Why not ItemEvents.modification: that hook receives a raw net.minecraft
// .world.item.Item but no setter for maxDamage -- the field is package-
// private (no accessor). Reflection is the practical path without rebuilding
// the iridescent-tetra-expansion mixin coremod.
//
// If reflection fails (future JDK module-system restriction, AccessTransformer
// change), the fallback is a mixin into Item.getMaxDamage with a registry-name
// check returning 640 for hulk_hammer. The mixin is currently NOT in place --
// add it via iridescent-tetra-expansion-mod if this script logs a warning.
//
// Pairs with:
//   server_scripts/hulk_hammer_attributes.js  -- 20 atk dmg / 0.5 aspd /
//     +50% dmg vs undead via ItemAttributeModifierEvent
//   datapack_sources/icraft_mm_overrides/data/mutantmonsters/loot_tables/
//     entities/mutant_zombie.json -- 25% drop on player kill, innate Kb II
//   client_scripts/jei_hiding.js -- hides other MM items, keeps hulk_hammer
// =============================================================================

StartupEvents.init(event => {
  try {
    var FR = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
    var RL = Java.loadClass('net.minecraft.resources.ResourceLocation')
    var ItemClass = Java.loadClass('net.minecraft.world.item.Item')

    var hh = FR.ITEMS.getValue(new RL('mutantmonsters', 'hulk_hammer'))
    if (!hh) {
      console.warn('[hulk_hammer] item not in registry; skipping durability override')
      return
    }

    var field = ItemClass.class.getDeclaredField('maxDamage')
    field.setAccessible(true)
    var before = field.getInt(hh)
    field.setInt(hh, 640)
    console.log('[hulk_hammer] maxDamage ' + before + ' -> 640')
  } catch (e) {
    console.warn('[hulk_hammer] durability override FAILED: ' + e +
                 ' -- fallback: ship a mixin in iridescent-tetra-expansion-mod')
  }
})
