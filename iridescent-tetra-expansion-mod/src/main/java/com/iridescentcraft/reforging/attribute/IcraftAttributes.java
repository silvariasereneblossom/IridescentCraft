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
 * Custom Forge attributes registered under two namespaces.
 *
 * <p>The {@code icraft:} channel (spell_power / lifesteal / dodge_chance)
 * exists so Apotheosis affixes that target the {@code icraft:} namespace
 * (icraft_arcane / icraft_vampiric_weapon / icraft_evasive) resolve at
 * datapack load instead of throwing "Unknown registry key", and so gear/affix
 * rolls contribute to the same combat stats the persistentData layer drives.
 * Affix contributions are read via {@code getAttributeValue()} in
 * kubejs/server_scripts/attributes/attribute_sync.js and summed on top of the
 * persistentData (class/book/skill) sources. Base 0 means an unmodified entity
 * contributes nothing, so the two layers never double-count.
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

    // icraft: namespace -- combat-stat channel for Apotheosis affixes.
    // Registered under "icraft" (not the iridescent_reforging mod id) because
    // the affixes and the pack's stat layer reference the icraft: namespace.
    // All base 0.0 so an unmodified entity contributes nothing; affixes add via
    // ADDITION and are summed on top of the persistentData layer (see class doc).
    public static final DeferredRegister<Attribute> ICRAFT_ATTRIBUTES =
            DeferredRegister.create(ForgeRegistries.ATTRIBUTES, "icraft");

    public static final RegistryObject<Attribute> SPELL_POWER =
            ICRAFT_ATTRIBUTES.register("spell_power",
                    () -> new PercentRangedAttribute("attribute.icraft.spell_power", 0.0, -1.0, 100.0).setSyncable(true));
    public static final RegistryObject<Attribute> LIFESTEAL =
            ICRAFT_ATTRIBUTES.register("lifesteal",
                    () -> new PercentRangedAttribute("attribute.icraft.lifesteal", 0.0, -1.0, 100.0).setSyncable(true));
    public static final RegistryObject<Attribute> DODGE_CHANCE =
            ICRAFT_ATTRIBUTES.register("dodge_chance",
                    () -> new PercentRangedAttribute("attribute.icraft.dodge_chance", 0.0, -1.0, 100.0).setSyncable(true));

    public static void register(IEventBus modBus) {
        ATTRIBUTES.register(modBus);
        ICRAFT_ATTRIBUTES.register(modBus);
    }

    @SubscribeEvent
    public static void onAttributeModification(EntityAttributeModificationEvent event) {
        for (var entityType : event.getTypes()) {
            event.add(entityType, DAMAGE_VS_UNDEAD.get());
            event.add(entityType, SPELL_POWER.get());
            event.add(entityType, LIFESTEAL.get());
            event.add(entityType, DODGE_CHANCE.get());
        }
    }
}
