package com.iridescentcraft.reforging.attribute;

import com.iridescentcraft.reforging.IridescentReforging;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.RangedAttribute;
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
 * LivingHurtEvent.
 *
 * <p>Why a real Forge attribute and not just a KubeJS NBT scan: real
 * attributes show in the standard "When equipped: +X.X Y" tooltip line
 * automatically (Forge generates the line via the lang key
 * {@code attribute.iridescent_reforging.damage_vs_undead}). No mixin
 * needed -- material attributes flow through Tetra's AttributesDeserializer
 * into the item's defaultModifiers, then vanilla tooltip rendering
 * displays them.
 *
 * <p>Apothic Attributes' IFormattableAttribute would let us show as
 * "+5%" instead of "+0.05" -- we can wire that later if the raw decimal
 * display reads poorly. For now the RangedAttribute defaults are fine.
 */
@Mod.EventBusSubscriber(modid = IridescentReforging.MODID,
        bus = Mod.EventBusSubscriber.Bus.MOD)
public class IcraftAttributes {

    public static final DeferredRegister<Attribute> ATTRIBUTES =
            DeferredRegister.create(ForgeRegistries.ATTRIBUTES, IridescentReforging.MODID);

    public static final RegistryObject<Attribute> DAMAGE_VS_UNDEAD =
            ATTRIBUTES.register("damage_vs_undead",
                    () -> new RangedAttribute(
                            "attribute." + IridescentReforging.MODID + ".damage_vs_undead",
                            0.0,    // default
                            -1.0,   // min (-100%)
                            100.0   // max (10000%, room for stacking)
                    ).setSyncable(true));

    /** Register the DeferredRegister to the mod event bus. Called from the
     *  mod entrypoint constructor BEFORE the bus dispatches Register events. */
    public static void register(IEventBus modBus) {
        ATTRIBUTES.register(modBus);
    }

    /** Apply the attribute to all PathfinderMob types -- player + every
     *  living entity. Required so {@code entity.getAttributeValue} returns
     *  a meaningful default of 0 rather than throwing. */
    @SubscribeEvent
    public static void onAttributeModification(EntityAttributeModificationEvent event) {
        for (var entityType : event.getTypes()) {
            event.add(entityType, DAMAGE_VS_UNDEAD.get());
        }
    }
}
