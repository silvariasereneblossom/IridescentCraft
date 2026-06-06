package net.royling.lovelysparklepieces.ModEntity;

import net.minecraft.core.registries.Registries;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.minecraftforge.registries.DeferredRegister;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModEntity.Butterfly.SoulButterflyEntity;

import net.minecraftforge.registries.RegistryObject;

public class ModEntities {
    public static final DeferredRegister<EntityType<?>> ENTITIES = DeferredRegister.create(Registries.ENTITY_TYPE, LovelySparklePieces.MODID);

    public static final RegistryObject<EntityType<SoulButterflyEntity>> BUTTERFLY =
            ENTITIES.register("butterfly", () -> EntityType.Builder.of(SoulButterflyEntity::new, MobCategory.CREATURE)
                    .sized(0.5F, 0.5F) // 大小可以调整
                    .clientTrackingRange(8)
                    .build("butterfly"));

}
