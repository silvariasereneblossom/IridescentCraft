package com.iridescentcraft.reforging.attribute;

import com.iridescentcraft.reforging.IridescentReforging;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraftforge.event.entity.EntityAttributeModificationEvent;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

/**
 * Custom Forge attributes registered under iridescent_reforging namespace.
 *
 * <p>DAMAGE_VS_UNDEAD: percent damage bonus the wearer deals to
 * minecraft:undead-tagged entities. Stored as a decimal (0.05 = +5%).
 * Read by kubejs/server_scripts/deathskin_undead_bonus.js on every
 * LivingHurtEvent. Tooltip renders as "+5% Damage vs Undead" via
 * Apothic Attributes' IFormattableAttribute percent formatter
 * (PercentRangedAttribute).
 */
@Mod.EventBusSubscriber(modid = IridescentReforging.MODID,
        bus = Mod.EventBusSubscriber.Bus.MOD)
public class IcraftAttributes {

    public static final DeferredRegister<Attribute> ATTRIBUTES =
            DeferredRegister.create(ForgeRegistries.ATTRIBUTES, IridescentReforging.MODID);

    public static final RegistryObject<Attribute> DAMAGE_VS_UNDEAD =
            ATTRIBUTES.register("damage_vs_undead",
                    () -> new PercentRangedAttribute(
                            "attribute." + IridescentReforging.MODID + ".damage_vs_undead",
                            0.0,    // default (0% bonus)
                            -1.0,   // min (-100%)
                            100.0   // max (+10000%, room for stacking)
                    ).setSyncable(true));

    public static void register(IEventBus modBus) {
        ATTRIBUTES.register(modBus);
    }

    @SubscribeEvent
    public static void onAttributeModification(EntityAttributeModificationEvent event) {
        for (var entityType : event.getTypes()) {
            event.add(entityType, DAMAGE_VS_UNDEAD.get());
        }
    }
}
