package com.iridescentcraft.reforging.enchant;

import com.iridescentcraft.reforging.IridescentReforging;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.EnchantmentCategory;
import net.minecraftforge.common.util.Lazy;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

/**
 * Custom enchantments for the iridescent_reforging namespace, all targeting
 * the {@code #icraft:magic_weapon} item tag (Apoth LootCategory:
 * MAGIC_WEAPON). Replacement for the Ars-only mana_boost / mana_regen
 * enchantments which were category-restricted to Ars items only (ISS books,
 * wands, staves couldn't pick them up). Disabling the Ars versions in
 * apotheosis enchantments.cfg and shipping these as the unified set.
 *
 * <p>All effects are data-only on the Java side -- KubeJS handlers
 * ({@code kubejs/server_scripts/enchants/icraft_enchants.js}) read the
 * enchant level off each stack and apply the actual mechanics. This
 * keeps the iteration loop tight: tuning values lives in KubeJS where
 * no rebuild is needed, while the registry side stays in Java.
 *
 * <p>The custom {@link MagicWeaponCategory} gates membership on a hardcoded
 * 26-id wand/staff set (regenerated from {@code #icraft:magic_weapon}),
 * the same membership the Apoth LootCategory predicate uses. The tag itself
 * is no longer load-bearing for enchant applicability because the
 * {@code stack.is(tag)} test mis-resolves for most of these items (see
 * MagicWeaponCategory) — it mirrors the proven hardcoded-set workaround in
 * the KubeJS startup script that registers the runtime LootCategory.
 *
 * Roster:
 * <ul>
 *   <li>{@code mana_boost} -- +mana per level (was ars_nouveau:mana_boost)</li>
 *   <li>{@code mana_regen} -- +mana_regen per level (was ars_nouveau:mana_regen)</li>
 *   <li>{@code arcane_focus} -- +spell_power per level</li>
 *   <li>{@code spell_echo} -- on cast, % chance to re-cast at 0 mana</li>
 *   <li>{@code mana_siphon} -- on spell hit, % of damage returned as mana</li>
 *   <li>{@code resonance} -- doubles buff potion duration while held</li>
 *   <li>{@code vorpal_arcane} -- magic-weapon Vorpal: crit_damage + behead-on-crit</li>
 * </ul>
 */
public final class IcraftEnchantments {

    public static final DeferredRegister<Enchantment> ENCHANTMENTS =
            DeferredRegister.create(ForgeRegistries.ENCHANTMENTS, IridescentReforging.MODID);

    /** Lazy because EnchantmentCategory.create is a Forge extension method
     *  that internally calls into a CategoryHelper which may not be safe
     *  before mod construction completes. Lazy-init at registration time. */
    private static final Lazy<EnchantmentCategory> MAGIC_WEAPON_CATEGORY =
            Lazy.of(() -> MagicWeaponCategory.get());

    public static final RegistryObject<Enchantment> MANA_BOOST = ENCHANTMENTS.register(
            "mana_boost",
            () -> new SimpleScalingEnchantment(Enchantment.Rarity.UNCOMMON,
                    MAGIC_WEAPON_CATEGORY.get(), EquipmentSlot.MAINHAND, EquipmentSlot.OFFHAND)
                    .maxLevel(7).cost(8, 12));

    public static final RegistryObject<Enchantment> MANA_REGEN = ENCHANTMENTS.register(
            "mana_regen",
            () -> new SimpleScalingEnchantment(Enchantment.Rarity.UNCOMMON,
                    MAGIC_WEAPON_CATEGORY.get(), EquipmentSlot.MAINHAND, EquipmentSlot.OFFHAND)
                    .maxLevel(7).cost(8, 12));

    public static final RegistryObject<Enchantment> ARCANE_FOCUS = ENCHANTMENTS.register(
            "arcane_focus",
            () -> new SimpleScalingEnchantment(Enchantment.Rarity.RARE,
                    MAGIC_WEAPON_CATEGORY.get(), EquipmentSlot.MAINHAND, EquipmentSlot.OFFHAND)
                    .maxLevel(5).cost(15, 20));

    public static final RegistryObject<Enchantment> SPELL_ECHO = ENCHANTMENTS.register(
            "spell_echo",
            () -> new SimpleScalingEnchantment(Enchantment.Rarity.RARE,
                    MAGIC_WEAPON_CATEGORY.get(), EquipmentSlot.MAINHAND, EquipmentSlot.OFFHAND)
                    .maxLevel(3).cost(15, 25));

    public static final RegistryObject<Enchantment> MANA_SIPHON = ENCHANTMENTS.register(
            "mana_siphon",
            () -> new SimpleScalingEnchantment(Enchantment.Rarity.RARE,
                    MAGIC_WEAPON_CATEGORY.get(), EquipmentSlot.MAINHAND, EquipmentSlot.OFFHAND)
                    .maxLevel(3).cost(15, 25));

    public static final RegistryObject<Enchantment> RESONANCE = ENCHANTMENTS.register(
            "resonance",
            () -> new SimpleScalingEnchantment(Enchantment.Rarity.UNCOMMON,
                    MAGIC_WEAPON_CATEGORY.get(), EquipmentSlot.MAINHAND, EquipmentSlot.OFFHAND)
                    .maxLevel(3).cost(10, 18));

    public static final RegistryObject<Enchantment> VORPAL_ARCANE = ENCHANTMENTS.register(
            "vorpal_arcane",
            () -> new SimpleScalingEnchantment(Enchantment.Rarity.RARE,
                    MAGIC_WEAPON_CATEGORY.get(), EquipmentSlot.MAINHAND, EquipmentSlot.OFFHAND)
                    .maxLevel(5).cost(20, 30));

    /** Honing accelerator. Unlike the other seven, its effect is read on the
     *  JAVA side ({@code SpellbookHoneHandler}), NOT KubeJS: each level adds
     *  +1 Tetra hone progress per spell cast on the held modular item, on top
     *  of the +1 base (L3 = 4x honing speed). Lands on every #icraft:magic_weapon
     *  member, but only bites on items that actually hone (modular wands, Ars
     *  tomes). */
    public static final RegistryObject<Enchantment> ATTUNEMENT = ENCHANTMENTS.register(
            "attunement",
            () -> new SimpleScalingEnchantment(Enchantment.Rarity.UNCOMMON,
                    MAGIC_WEAPON_CATEGORY.get(), EquipmentSlot.MAINHAND, EquipmentSlot.OFFHAND)
                    .maxLevel(3).cost(12, 15));

    public static void register(IEventBus modBus) {
        ENCHANTMENTS.register(modBus);
        IridescentReforging.LOGGER.info("[IcraftEnchantments] registered 8 magic-weapon enchants");
    }

    private IcraftEnchantments() {}
}
