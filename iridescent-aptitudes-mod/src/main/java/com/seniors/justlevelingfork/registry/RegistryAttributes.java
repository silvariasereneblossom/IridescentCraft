package com.seniors.justlevelingfork.registry;

import com.seniors.justlevelingfork.JustLevelingFork;
import com.seniors.justlevelingfork.registry.passive.Passive;

import java.util.UUID;

import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.RangedAttribute;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

public class RegistryAttributes {
    private static final DeferredRegister<Attribute> REGISTER = DeferredRegister.create(ForgeRegistries.Keys.ATTRIBUTES, JustLevelingFork.MOD_ID);

    public static final RegistryObject<Attribute> BREAK_SPEED = REGISTER.register("break_speed", () -> (new RangedAttribute("break_speed", 0.0D, 0.0D, 1024.0D)).setSyncable(true));
    public static final RegistryObject<Attribute> CRITICAL_DAMAGE = REGISTER.register("critical_damage", () -> (new RangedAttribute("critical_damage", 0.0D, 0.0D, 1024.0D)).setSyncable(true));
    public static final RegistryObject<Attribute> PROJECTILE_DAMAGE = REGISTER.register("projectile_damage", () -> (new RangedAttribute("projectile_damage", 0.0D, 0.0D, 1024.0D)).setSyncable(true));
    public static final RegistryObject<Attribute> BENEFICIAL_EFFECT = REGISTER.register("beneficial_effect", () -> (new RangedAttribute("beneficial_effect", 0.0D, 0.0D, 1024.0D)).setSyncable(true));
    public static final RegistryObject<Attribute> MAGIC_RESIST = REGISTER.register("magic_resist", () -> (new RangedAttribute("magic_resist", 0.0D, 0.0D, 1024.0D)).setSyncable(true));

    public static void load(IEventBus eventBus) {
        REGISTER.register(eventBus);
    }

    public static void modifierAttributes(ServerPlayer serverPlayer) {
        serverPlayer.getCapability(RegistryCapabilities.APTITUDE).ifPresent(aptitudeCapability -> {
            // Iridescent fork: iterate the registry view directly (was: two fresh stream().toList() copies of the
            // whole registry PER passive, per call, per player tick). Same iteration order.
            for (Passive passive : RegistryPassives.PASSIVES_REGISTRY.get().getValues()) {
                (new registerAttribute(serverPlayer, passive.attribute, passive.getValue() / passive.levelsRequired.length * passive.getLevel(serverPlayer), UUID.fromString(passive.attributeUuid))).amplifyAttribute(true);
            }
        });
    }

    public static class registerAttribute {
        private final Player player;
        private final Attribute attribute;
        private final double modifier;
        private final UUID uuid;

        public registerAttribute(Player player, Attribute attribute, double modifier, UUID uuid) {
            this.player = player;
            this.attribute = attribute;
            this.modifier = modifier;
            this.uuid = uuid;
        }

        public void amplifyAttribute(boolean isEnabled) {
            AttributeInstance instance = this.player.getAttribute(this.attribute);
            if (instance == null)
                return;
            AttributeModifier oldModifier = instance.getModifier(this.uuid);
            // Iridescent fork: no-op when the attribute is already in the wanted state. The unconditional
            // remove + re-add below marks the (client-synced) attribute dirty on EVERY call, and this runs per
            // passive per player tick -> an attribute packet to the player + everyone tracking them, every tick.
            if (isEnabled) {
                if (oldModifier != null
                        && oldModifier.getOperation() == AttributeModifier.Operation.ADDITION
                        && Double.compare(oldModifier.getAmount(), this.modifier) == 0)
                    return;
            } else if (oldModifier == null) {
                return;
            }
            if (oldModifier != null) instance.removeModifier(oldModifier);

            AttributeModifier newModifier = new AttributeModifier(this.uuid, JustLevelingFork.MOD_ID, this.modifier, AttributeModifier.Operation.ADDITION);
            if (isEnabled) {
                instance.addPermanentModifier(newModifier);
            } else {
                instance.removeModifier(newModifier);
            }
        }
    }
}


