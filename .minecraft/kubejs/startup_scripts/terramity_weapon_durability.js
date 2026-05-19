// =============================================================================
// TERRAMITY WEAPON DURABILITY CLAMP
// Place in: kubejs/startup_scripts/terramity_weapon_durability.js
// =============================================================================
//
// 2026-05-19: Clamp 12 Terramity weapon durabilities to 2500.
// Native values are wildly above-tier:
//   - 5 ingot-family melee (nyxium_greatsword, exodium_sword, exodium_waraxe,
//     reverium_sword, reverium_axe):                       8124  (4x netherite)
//   - 6 audit guns (blasphemic_rapture, davy_jones, divine_intervention,
//     kamehameha, olympus, planet_buster):                 16256 (8x netherite)
//   - unholy_lance:                                        50000 (24x netherite)
// 2500 lands them ~1.2x netherite -- expensive-to-reforge T3/T4 loot rather
// than effectively unbreakable. Reforging cost scales with durability and
// the audit values were making the reforging table cheaper than running
// the structure again. See master-appendix.md sec M.10.
//
// Approach: reflection on the private int maxDamage field of Item.
// Same pattern as hulk_hammer_durability.js. KubeJS startup_scripts run
// AFTER item registration so the registry lookup is safe here.
// =============================================================================

StartupEvents.init(event => {
  try {
    var FR = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
    var RL = Java.loadClass('net.minecraft.resources.ResourceLocation')
    var ItemClass = Java.loadClass('net.minecraft.world.item.Item')

    var WEAPONS = [
      'nyxium_greatsword',
      'exodium_sword',
      'exodium_waraxe',
      'reverium_sword',
      'reverium_axe',
      'blasphemic_rapture',
      'davy_jones',
      'divine_intervention',
      'kamehameha',
      'olympus',
      'planet_buster',
      'unholy_lance'
    ]
    var TARGET_DURABILITY = 2500

    var field = ItemClass.class.getDeclaredField('maxDamage')
    field.setAccessible(true)

    var clamped = 0
    for (var i = 0; i < WEAPONS.length; i++) {
      var id = WEAPONS[i]
      var item = FR.ITEMS.getValue(new RL('terramity', id))
      if (!item) {
        console.warn('[terramity_weapon_durability] not in registry: terramity:' + id)
        continue
      }
      var before = field.getInt(item)
      if (before !== TARGET_DURABILITY) {
        field.setInt(item, TARGET_DURABILITY)
        console.log('[terramity_weapon_durability] terramity:' + id + ' ' + before + ' -> ' + TARGET_DURABILITY)
        clamped += 1
      }
    }
    console.log('[terramity_weapon_durability] clamped ' + clamped + '/' + WEAPONS.length + ' weapons')
  } catch (e) {
    console.warn('[terramity_weapon_durability] FAILED: ' + e +
                 ' -- fallback: ship a mixin in iridescent-tetra-expansion-mod')
  }
})
