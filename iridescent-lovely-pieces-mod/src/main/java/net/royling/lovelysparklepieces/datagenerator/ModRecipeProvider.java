package net.royling.lovelysparklepieces.datagenerator;

import net.minecraft.advancements.critereon.InventoryChangeTrigger;
import net.minecraft.core.HolderLookup;
import net.minecraft.data.PackOutput;
import net.minecraft.data.recipes.*;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.crafting.Ingredient;
import net.minecraft.world.level.ItemLike;
// import net.minecraftforge.common.crafting.conditions.IConditionBuilder; // Not needed in 1.20.1
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModUsingItem.ModItems;

import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

public class ModRecipeProvider extends RecipeProvider {
    public ModRecipeProvider(PackOutput output) {
        super(output);
    }

    @Override
    protected void buildRecipes(Consumer<FinishedRecipe> recipeOutput) {
        // IRIDESCENT: ALL crafting recipes removed (operator directive 2026-06-07).
        // Items enter the world exclusively via tier-scoped loot pools and boss
        // drops wired in the pack's KubeJS loot layer. See docket #94.
    }
}
