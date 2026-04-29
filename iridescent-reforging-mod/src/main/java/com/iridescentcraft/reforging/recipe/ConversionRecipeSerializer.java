package com.iridescentcraft.reforging.recipe;

import com.google.gson.JsonObject;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.GsonHelper;
import net.minecraft.world.item.crafting.Ingredient;
import net.minecraft.world.item.crafting.RecipeSerializer;

/**
 * Serializer for ConversionRecipe. JSON shape:
 *
 * {
 *   "type": "iridescent_reforging:conversion",
 *   "source":   { "item": "irons_spellbooks:cultist_helmet" },
 *   "material": { "item": "irons_spellbooks:magic_cloth" },
 *   "material_count": 4,
 *   "skin_id":     "iridescent_reforging:cultist_helmet",
 *   "result_slot": "helmet"
 * }
 *
 * source/material accept any standard Forge Ingredient (item, tag, or
 * compound). material_count defaults to 1 if absent.
 */
public class ConversionRecipeSerializer implements RecipeSerializer<ConversionRecipe> {

    @Override
    public ConversionRecipe fromJson(ResourceLocation id, JsonObject json) {
        Ingredient source   = Ingredient.fromJson(GsonHelper.getAsJsonObject(json, "source"));
        Ingredient material = Ingredient.fromJson(GsonHelper.getAsJsonObject(json, "material"));
        int materialCount   = GsonHelper.getAsInt(json, "material_count", 1);
        String skinId       = GsonHelper.getAsString(json, "skin_id");
        String resultSlot   = GsonHelper.getAsString(json, "result_slot");
        return new ConversionRecipe(id, source, material, materialCount, skinId, resultSlot);
    }

    @Override
    public ConversionRecipe fromNetwork(ResourceLocation id, FriendlyByteBuf buf) {
        Ingredient source   = Ingredient.fromNetwork(buf);
        Ingredient material = Ingredient.fromNetwork(buf);
        int materialCount   = buf.readVarInt();
        String skinId       = buf.readUtf();
        String resultSlot   = buf.readUtf();
        return new ConversionRecipe(id, source, material, materialCount, skinId, resultSlot);
    }

    @Override
    public void toNetwork(FriendlyByteBuf buf, ConversionRecipe recipe) {
        recipe.getSource().toNetwork(buf);
        recipe.getMaterial().toNetwork(buf);
        buf.writeVarInt(recipe.getMaterialCount());
        buf.writeUtf(recipe.getSkinId());
        buf.writeUtf(recipe.getResultSlot());
    }
}
