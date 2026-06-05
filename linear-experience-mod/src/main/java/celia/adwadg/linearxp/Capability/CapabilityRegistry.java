package celia.adwadg.linearxp.Capability;

import celia.adwadg.linearxp.IAccuratedExp;
import celia.adwadg.linearxp.LinearXp;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.common.capabilities.RegisterCapabilitiesEvent;
import net.minecraftforge.event.AttachCapabilitiesEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;



@Mod.EventBusSubscriber(modid = LinearXp.MODID, bus = Mod.EventBusSubscriber.Bus.FORGE)
public class CapabilityRegistry {
    public static final ResourceLocation ACCURATED_EXP_LOCATION =
            new ResourceLocation(LinearXp.MODID,"accurated_exp");

    @SubscribeEvent
    public static void registerCapability(RegisterCapabilitiesEvent event) {
        event.register(IAccuratedExp.class);
    }

    @SubscribeEvent
    public static void onAttachCapabilities(AttachCapabilitiesEvent<Entity> event) {
        if (event.getObject() instanceof Player) {
            event.addCapability(ACCURATED_EXP_LOCATION, new AccuratedExpProvider());
        }
    }
}
