package com.iridescentcraft.reforging.registry;

import com.iridescentcraft.reforging.IridescentReforging;
import com.iridescentcraft.reforging.recipe.ConversionRecipe;
import com.iridescentcraft.reforging.recipe.ConversionRecipeSerializer;
import net.minecraft.world.item.crafting.RecipeSerializer;
import net.minecraft.world.item.crafting.RecipeType;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

public final class ModRecipeTypes {
    public static final DeferredRegister<RecipeSerializer<?>> SERIALIZERS =
            DeferredRegister.create(ForgeRegistries.RECIPE_SERIALIZERS, IridescentReforging.MODID);
    public static final DeferredRegister<RecipeType<?>> TYPES =
            DeferredRegister.create(net.minecraftforge.registries.ForgeRegistries.RECIPE_TYPES, IridescentReforging.MODID);

    public static final RegistryObject<RecipeSerializer<ConversionRecipe>> CONVERSION_SERIALIZER =
            SERIALIZERS.register("conversion", ConversionRecipeSerializer::new);

    public static final RegistryObject<RecipeType<ConversionRecipe>> CONVERSION_TYPE =
            TYPES.register("conversion", () -> new RecipeType<ConversionRecipe>() {
                @Override public String toString() { return "iridescent_reforging:conversion"; }
            });

    private ModRecipeTypes() {}
}
