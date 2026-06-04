package com.iridescentcraft.grandcompass;

import com.iridescentcraft.grandcompass.item.GrandCompassItem;
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
 * Iridescent Grand Compass — a single gold compass that unifies the three pack
 * locators into one item:
 *   • Bosses     — the KubeJS boss-arena finder (via /icraft_compass menu)
 *   • Structures — Explorer's Compass (opens its real search GUI with our stack)
 *   • Biomes     — Nature's Compass   (opens its real search GUI with our stack)
 *
 * Shift-right-click cycles the mode; right-click opens the active finder. The two
 * compass mods key their search on holding THEIR item, so {@code mixin/*ItemUtilsMixin}
 * make their {@code getHeldItem} also recognise the Grand Compass — so a search
 * writes its result back onto our stack. Both mixins are fail-safe (non-required).
 */
@Mod(GrandCompass.MODID)
public class GrandCompass {

    public static final String MODID = "iridescent_grand_compass";

    public static final DeferredRegister<Item> ITEMS =
        DeferredRegister.create(ForgeRegistries.ITEMS, MODID);
    public static final DeferredRegister<CreativeModeTab> TABS =
        DeferredRegister.create(Registries.CREATIVE_MODE_TAB, MODID);

    public static final RegistryObject<Item> GRAND_COMPASS = ITEMS.register("grand_compass",
        () -> new GrandCompassItem(new Item.Properties().stacksTo(1).rarity(Rarity.UNCOMMON)));

    public static final RegistryObject<CreativeModeTab> TAB = TABS.register("grand_compass",
        () -> CreativeModeTab.builder()
            .title(Component.translatable("itemGroup." + MODID))
            .icon(() -> new ItemStack(GRAND_COMPASS.get()))
            .displayItems((params, output) -> output.accept(GRAND_COMPASS.get()))
            .build());

    public GrandCompass() {
        IEventBus modBus = FMLJavaModLoadingContext.get().getModEventBus();
        ITEMS.register(modBus);
        TABS.register(modBus);
    }
}
