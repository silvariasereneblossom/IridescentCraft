package com.iridescentcraft.reforging;

import com.iridescentcraft.reforging.registry.ModItems;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Mod(IridescentReforging.MODID)
public class IridescentReforging {
    public static final String MODID = "iridescent_reforging";
    public static final Logger LOGGER = LoggerFactory.getLogger(MODID);

    public IridescentReforging() {
        IEventBus modBus = FMLJavaModLoadingContext.get().getModEventBus();
        ModItems.ITEMS.register(modBus);
        LOGGER.info("[{}] mod entrypoint initialized", MODID);
    }
}
