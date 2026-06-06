package net.royling.lovelysparklepieces.ClientEvent.Particle;

import net.minecraftforge.registries.ForgeRegistries;
import net.minecraft.core.particles.ParticleType;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.Registries;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.registries.DeferredRegister;
import net.royling.lovelysparklepieces.LovelySparklePieces;

import net.minecraftforge.registries.RegistryObject;

public class ModParticles {
    public static final DeferredRegister<ParticleType<?>> PARTICLE_TYPES =
            DeferredRegister.create(Registries.PARTICLE_TYPE, LovelySparklePieces.MODID);
    public static final RegistryObject<SimpleParticleType> DAMAGE_NUMBER_PARTICLE =
            PARTICLE_TYPES.register("damage_number",
                    () -> new SimpleParticleType(true)
            );
    public static void register(IEventBus modEventBus) {
        PARTICLE_TYPES.register(modEventBus);
    }
}
