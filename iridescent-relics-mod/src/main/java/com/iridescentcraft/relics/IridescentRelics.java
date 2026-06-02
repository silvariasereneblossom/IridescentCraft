package com.iridescentcraft.relics;

import com.iridescentcraft.relics.item.CursedSigilPrideItem;
import com.iridescentcraft.relics.item.DragonsEyeItem;
import com.iridescentcraft.relics.item.FrostmawHeartItem;
import com.iridescentcraft.relics.item.IronheartCogItem;
import com.iridescentcraft.relics.item.LeviathansPearlItem;
import com.iridescentcraft.relics.item.PhylacteryShardItem;
import com.iridescentcraft.relics.item.RemnantRelicItem;
import com.iridescentcraft.relics.item.SunfeatherCharmItem;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Rarity;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

/**
 * Iridescent Relics -- pack-native relic system, now built as an ADDON of the Relics
 * framework (sskirillss / Octo-Studios, modId {@code relics}). Each relic is its own class
 * extending the framework {@link it.hurts.sskirillss.relics.items.relics.base.RelicItem},
 * authored through the framework's leveling / ability / style data DSL. The Remnant relic is
 * the proven template the rest of the roster copies.
 *
 * <p>Slots are still assigned by the {@code curios:<slot>} item tag (see
 * {@code data/curios/tags/items/charm.json}).
 */
@Mod(IridescentRelics.MODID)
public class IridescentRelics {

    public static final String MODID = "iridescent_relics";

    public static final DeferredRegister<Item> ITEMS =
        DeferredRegister.create(ForgeRegistries.ITEMS, MODID);
    public static final DeferredRegister<CreativeModeTab> TABS =
        DeferredRegister.create(Registries.CREATIVE_MODE_TAB, MODID);

    // ===== Relics =====
    // Relic of the Remnant (Ancient Remnant / cursed_pyramid boss): charm slot, EPIC.
    // +max health + ISS spell power, expressed as framework leveling abilities. spell_power
    // resolves at runtime (soft dep on Iron's Spellbooks); see RemnantRelicItem.
    public static final RegistryObject<Item> REMNANT_RELIC = ITEMS.register("remnant_relic",
        () -> new RemnantRelicItem(new Item.Properties().stacksTo(1).rarity(Rarity.EPIC).fireResistant()));

    // ===== Phase 2 boss-relic roster =====
    // Each relic is a framework RelicItem subclass (see item/*.java). Slot is assigned by the
    // curios:<slot> item tag (data/curios/tags/items/<slot>.json). All modded attributes are
    // SOFT deps resolved at runtime. Drops are wired separately (kubejs/.../relic_boss_drops.js).

    // Frostmaw's Frozen Heart -- T1 (mowziesmobs:frostmaw), necklace, UNCOMMON. +armor.
    public static final RegistryObject<Item> FROSTMAW_HEART = ITEMS.register("frostmaw_heart",
        () -> new FrostmawHeartItem(new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON).fireResistant()));

    // Ironheart Cog -- T1 (mowziesmobs:ferrous_wroughtnaut), belt, UNCOMMON. +armor, +knockback resist.
    public static final RegistryObject<Item> IRONHEART_COG = ITEMS.register("ironheart_cog",
        () -> new IronheartCogItem(new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON).fireResistant()));

    // Sunfeather Charm -- T2 (aether:sun_spirit), charm, RARE. +max mana (ISS soft dep).
    public static final RegistryObject<Item> SUNFEATHER_CHARM = ITEMS.register("sunfeather_charm",
        () -> new SunfeatherCharmItem(new Item.Properties().stacksTo(1).rarity(Rarity.RARE).fireResistant()));

    // Lich's Phylactery Shard -- T2 (twilightforest:lich), spellstone, RARE. +cooldown reduction (ISS soft dep).
    public static final RegistryObject<Item> PHYLACTERY_SHARD = ITEMS.register("phylactery_shard",
        () -> new PhylacteryShardItem(new Item.Properties().stacksTo(1).rarity(Rarity.RARE).fireResistant()));

    // Leviathan's Pearl -- T3 (cataclysm:the_leviathan), body, EPIC. +max health, +attack damage.
    public static final RegistryObject<Item> LEVIATHANS_PEARL = ITEMS.register("leviathans_pearl",
        () -> new LeviathansPearlItem(new Item.Properties().stacksTo(1).rarity(Rarity.EPIC).fireResistant()));

    // Cursed Sigil of Pride -- T3 CURSE (cardinal_sins:lucifer), ring, EPIC. +spell power, +attack, -4 max health.
    public static final RegistryObject<Item> CURSED_SIGIL_PRIDE = ITEMS.register("cursed_sigil_pride",
        () -> new CursedSigilPrideItem(new Item.Properties().stacksTo(1).rarity(Rarity.EPIC).fireResistant()));

    // Dragon's Eye -- T4 finale (minecraft:ender_dragon), back, EPIC. +max health, +crit chance/damage (attributeslib soft dep).
    public static final RegistryObject<Item> DRAGONS_EYE = ITEMS.register("dragons_eye",
        () -> new DragonsEyeItem(new Item.Properties().stacksTo(1).rarity(Rarity.EPIC).fireResistant()));

    // ===== Creative tab =====
    public static final RegistryObject<CreativeModeTab> RELICS_TAB = TABS.register("relics",
        () -> CreativeModeTab.builder()
            .title(Component.translatable("itemGroup." + MODID))
            .icon(() -> new ItemStack(REMNANT_RELIC.get()))
            .displayItems((params, output) -> ITEMS.getEntries().forEach(e -> output.accept(e.get())))
            .build());

    public IridescentRelics() {
        IEventBus modBus = FMLJavaModLoadingContext.get().getModEventBus();
        ITEMS.register(modBus);
        TABS.register(modBus);
    }
}
