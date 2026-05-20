// =============================================================================
// VIRTUAL GOLD DURABILITY CLAMP
// Place in: kubejs/startup_scripts/virtual_gold_durability.js
// =============================================================================
//
// 2026-05-20: Clamp celestial_core virtual_gold tools/armor to iron-tier
// durability. Companion to server_scripts/virtual_gold_clamp.js (which
// handles attack damage / armor / armor_toughness). Same reflection
// pattern as hulk_hammer_durability.js + terramity_weapon_durability.js.
//
// Targets:
//   tools (sword/axe/pickaxe/shovel/hoe): 250
//   helmet:     165
//   chestplate: 240
//   leggings:   225
//   boots:      195
//
// Does NOT touch enchantability (Item.getEnchantmentValue() is a separate
// virtual method on ArmorMaterial / Tier and not modified by this script).
// Per user 2026-05-20: the high enchant affinity stays.
// =============================================================================

StartupEvents.init(event => {
  try {
    var FR = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
    var RL = Java.loadClass('net.minecraft.resources.ResourceLocation')
    var ItemClass = Java.loadClass('net.minecraft.world.item.Item')

    var TARGETS = {
      'virtual_gold_sword':      250,
      'virtual_gold_axe':        250,
      'virtual_gold_pickaxe':    250,
      'virtual_gold_shovel':     250,
      'virtual_gold_hoe':        250,
      'virtual_gold_helmet':     165,
      'virtual_gold_chestplate': 240,
      'virtual_gold_leggings':   225,
      'virtual_gold_boots':      195
    }

    var field = ItemClass.class.getDeclaredField('maxDamage')
    field.setAccessible(true)

    var clamped = 0
    for (var name in TARGETS) {
      var item = FR.ITEMS.getValue(new RL('celestial_core', name))
      if (!item) {
        console.warn('[virtual_gold_durability] not in registry: celestial_core:' + name)
        continue
      }
      var before = field.getInt(item)
      var target = TARGETS[name]
      if (before !== target) {
        field.setInt(item, target)
        console.log('[virtual_gold_durability] celestial_core:' + name + ' ' + before + ' -> ' + target)
        clamped += 1
      }
    }
    console.log('[virtual_gold_durability] clamped ' + clamped + '/' + Object.keys(TARGETS).length + ' items')
  } catch (e) {
    console.warn('[virtual_gold_durability] FAILED: ' + e +
                 ' -- fallback: mixin in iridescent-tetra-expansion-mod')
  }
})
