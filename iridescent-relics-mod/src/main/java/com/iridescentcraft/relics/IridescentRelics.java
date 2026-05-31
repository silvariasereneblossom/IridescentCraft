package com.iridescentcraft.relics;

import com.iridescentcraft.relics.item.RelicItem;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
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
 * Iridescent Relics -- pack-native Curios relic system. Boss-reward artifacts with worn
 * attribute bonuses, implemented as native {@link RelicItem} (ICurioItem) so they behave
 * exactly like every other curio in the pack. Data-driven via {@link RelicSpec}: each relic
 * is one spec entry + a model/lang/charm-tag, so it scales to a relic-per-boss.
 */
@Mod(IridescentRelics.MODID)
public class IridescentRelics {

    public static final String MODID = "iridescent_relics";

    public static final DeferredRegister<Item> ITEMS =
        DeferredRegister.create(ForgeRegistries.ITEMS, MODID);
    public static final DeferredRegister<CreativeModeTab> TABS =
        DeferredRegister.create(Registries.CREATIVE_MODE_TAB, MODID);

    // ===== Relic specs =====
    // Relic of the Remnant (Ancient Remnant / cursed_pyramid boss): charm slot,
    // +2 hearts max health + 10% ISS spell power. spell_power resolves at runtime
    // (soft dep on Iron's Spellbooks).
    public static final RelicSpec REMNANT_SPEC = new RelicSpec("remnant_relic")
        .add("minecraft:generic.max_health", "d3f1c2a0-57aa-4a2b-9c3d-100000000057", 4.0D, AttributeModifier.Operation.ADDITION)
        .add("irons_spellbooks:spell_power",  "d3f1c2a0-57aa-4a2b-9c3d-100000000058", 0.10D, AttributeModifier.Operation.ADDITION);

    public static final RegistryObject<Item> REMNANT_RELIC = ITEMS.register("remnant_relic",
        () -> new RelicItem(new Item.Properties().stacksTo(1).rarity(Rarity.EPIC).fireResistant(), REMNANT_SPEC));

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
