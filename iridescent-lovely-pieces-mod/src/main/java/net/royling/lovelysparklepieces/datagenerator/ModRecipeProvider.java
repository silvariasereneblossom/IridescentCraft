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
        addShapelessRecipe(recipeOutput,"super_magnetic_ring",ModCurios.SUPER_MAGNETIC_RING.get(),1,ModCurios.MAGNETIC_RING.get(),Items.DIAMOND, ModItems.POLYMERIZATION.get());

        ShapedRecipeBuilder.shaped(RecipeCategory.MISC,ModCurios.MAGNETIC_RING.get())
                .define('A', Items.IRON_INGOT)
                .define('B',Items.GOLD_INGOT)
                .pattern(" A ")
                .pattern("A A")
                .pattern(" B ")
                .unlockedBy("has_item",has(Items.IRON_INGOT))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC,ModCurios.ENDER_RING.get())
                .define('A', Items.OBSIDIAN)
                .define('B',Items.ENDER_EYE)
                .define('C',Items.ENDER_PEARL)
                .pattern(" A ")
                .pattern("ACA")
                .pattern(" B ")
                .unlockedBy("has_item",has(Items.ENDER_EYE))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC,ModCurios.CRIT_RING.get())
                .define('A', Items.GOLD_INGOT)
                .define('B',Items.IRON_SWORD)
                .pattern("BA ")
                .pattern("A A")
                .pattern(" A ")
                .unlockedBy("has_item",has(Items.GOLD_INGOT))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC,ModCurios.MEMORY_RING.get())
                .define('A', Items.COPPER_BLOCK)
                .define('B',Items.GOLD_INGOT)
                .define('C',Items.REDSTONE_BLOCK)
                .pattern(" A ")
                .pattern("ACA")
                .pattern(" B ")
                .unlockedBy("has_item",has(Items.GOLD_INGOT))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.NIGHT_OWL_RING.get())
                .define('F', Items.FEATHER)
                .define('I', Items.IRON_INGOT)
                .define('B', Items.PHANTOM_MEMBRANE)
                .define('G', Items.GOLD_INGOT)
                .pattern("FIF")
                .pattern("IBI")
                .pattern(" G ")
                .unlockedBy("has_item", has(Items.PHANTOM_MEMBRANE))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.CRUSH_STONE_RING.get())
                .define('L', Items.LAPIS_LAZULI)
                .define('I', Items.IRON_INGOT)
                .pattern("LIL")
                .pattern("I I")
                .pattern(" I ")
                .unlockedBy("has_item", has(Items.LAPIS_LAZULI))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.INFERNO_RING.get())
                .define('M', Items.MAGMA_CREAM)
                .define('F', Items.FIRE_CHARGE)
                .define('B', Items.BLAZE_ROD)
                .pattern("MFM")
                .pattern("BBB")
                .pattern(" B ")
                .unlockedBy("has_item", has(Items.BLAZE_ROD))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.ECO_RING.get())
                .define('A', Items.COAL)
                .define('B', Items.EMERALD)
                .pattern(" A ")
                .pattern("BAB")
                .pattern(" B ")
                .unlockedBy("has_item", has(Items.EMERALD))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.FPS_EYE.get())
                .define('A', Items.LAPIS_LAZULI)
                .define('B', Items.DIAMOND)
                .define('C', Items.IRON_INGOT)
                .define('D', Items.ENDER_EYE)
                .pattern("ABA")
                .pattern("CDC")
                .pattern("ACA")
                .unlockedBy("has_item", has(Items.ENDER_EYE))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.BLACKSTONE_HEART.get())
                .define('A', Items.OBSIDIAN)
                .define('B', Items.STONE)
                .pattern(" A ")
                .pattern("ABA")
                .pattern("BBB")
                .unlockedBy("has_item", has(Items.OBSIDIAN))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.JELLYFISH_HELMET.get())
                .define('A', Items.DRIED_KELP)
                .define('B', Items.PRISMARINE_SHARD)
                .define('C', Items.INK_SAC)
                .define('D', Items.SCUTE)
                .pattern("ABA")
                .pattern("CDC")
                .pattern(" A ")
                .unlockedBy("has_item", has(Items.SCUTE))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.CAPITALIST_HEAT.get())
                .define('A', Items.PURPLE_DYE)
                .define('B', Items.GOLD_INGOT)
                .define('C', Items.LEATHER)
                .define('D', Items.EMERALD)
                .pattern("ABA")
                .pattern("CDC")
                .pattern(" C ")
                .unlockedBy("has_item", has(Items.EMERALD))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.POSEIDON_RESPIRATOR.get())
                .define('A', Items.SEA_LANTERN)
                .define('B', Items.NETHER_STAR)
                .define('C', ModItems.POLYMERIZATION.get())
                .define('D', Items.SPONGE)
                .define('E', Items.CHORUS_FLOWER)
                .define('F', ModCurios.JELLYFISH_HELMET.get())
                .define('G', ModCurios.MERMAID_TAIL.get())
                .pattern("ABA")
                .pattern("DCD")
                .pattern("FEG")
                .unlockedBy("has_item", has(Items.NETHER_STAR))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.MARKSMAN_GOGGLES.get())
                .define('A', Items.REDSTONE)
                .define('B', Items.GLASS_PANE)
                .define('C', Items.IRON_INGOT)
                .define('D', Items.SPYGLASS)
                .define('E', Items.BOW)
                .pattern("ABA")
                .pattern("CDC")
                .pattern(" E ")
                .unlockedBy("has_item", has(Items.SPYGLASS))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.WITCH_HAT.get())
                .define('A', Items.PURPLE_DYE)
                .define('B', Items.GHAST_TEAR)
                .define('C', Items.REDSTONE)
                .define('D', Items.FERMENTED_SPIDER_EYE)
                .define('E', Items.LEATHER_HELMET)
                .pattern("ABA")
                .pattern("CDC")
                .pattern(" E ")
                .unlockedBy("has_item", has(Items.GHAST_TEAR))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.YELLOW_HEADSCARF.get())
                .define('A', Items.GOLD_INGOT)
                .define('B', Items.YELLOW_DYE)
                .define('C', Items.LIGHTNING_ROD)
                .define('D', Items.LEATHER_HELMET)
                .pattern("ABA")
                .pattern(" C ")
                .pattern(" D ")
                .unlockedBy("has_item", has(Items.LIGHTNING_ROD))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.HEAVY_BIGROCK.get())
                .define('A', Items.OBSIDIAN)
                .define('B', Items.STONE)
                .define('C', Items.IRON_BLOCK)
                .pattern("ABA")
                .pattern("BCB")
                .pattern(" B ")
                .unlockedBy("has_item", has(Items.IRON_BLOCK))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.POCKET_WATCH.get())
                .define('G', Items.GOLD_INGOT)
                .define('R', Items.REDSTONE)
                .define('C', Items.CLOCK)
                .pattern("GRG")
                .pattern("RCR")
                .pattern("GRG")
                .unlockedBy("has_item", has(Items.CLOCK))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.SPEEDOMETER.get())
                .define('I', Items.IRON_INGOT)
                .define('R', Items.REDSTONE)
                .define('C', Items.CLOCK)
                .pattern("IRI")
                .pattern("RCR")
                .pattern("IRI")
                .unlockedBy("has_item", has(Items.CLOCK))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.POSITION_TRACKER.get())
                .define('I', Items.IRON_INGOT)
                .define('R', Items.REDSTONE)
                .define('C', Items.COMPASS)
                .define('G', Items.GLASS)
                .pattern("IRI")
                .pattern("RCR")
                .pattern("IGI")
                .unlockedBy("has_item", has(Items.COMPASS))
                .save(recipeOutput);
        addShapelessRecipe(recipeOutput, "gps", ModCurios.GPS.get(), 1,
                ModCurios.POCKET_WATCH.get(),
                ModCurios.SPEEDOMETER.get(),
                ModCurios.POSITION_TRACKER.get(),
                ModItems.POLYMERIZATION.get());
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.PDA.get())
                .define('R', ModCurios.GPS.get())
                .define('A', Items.GOLDEN_APPLE)
                .define('L', Items.LAPIS_LAZULI)
                .define('D', Items.GLOWSTONE_DUST)
                .define('G', Items.REDSTONE)
                .pattern(" R ")
                .pattern("GLG")
                .pattern("ADA")
                .unlockedBy("has_item", has(ModCurios.GPS.get()))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.HIGH_QUALITY_FISHING_LINE.get())
                .define('S', Items.STRING)
                .define('P', Items.PRISMARINE_SHARD)
                .define('G', Items.GOLD_INGOT)
                .define('R', Items.REDSTONE)
                .pattern(" P ")
                .pattern("SRS")
                .pattern(" G ")
                .unlockedBy("has_item", has(Items.STRING))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.MERMAID_TAIL.get())
                .define('K', Items.DRIED_KELP)
                .define('H', Items.HEART_OF_THE_SEA)
                .define('L', Items.SEA_LANTERN)
                .define('G', Items.GOLD_INGOT)
                .pattern(" K ")
                .pattern("GLG")
                .pattern(" H ")
                .unlockedBy("has_item", has(Items.HEART_OF_THE_SEA))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.LEATHER_QUIVER.get())
                .define('L', Items.LEATHER)
                .define('A', Items.ARROW)
                .define('S', Items.STRING)
                .define('F', Items.FEATHER)
                .define('G', Items.GOLD_INGOT)
                .pattern("AFA")
                .pattern("LSL")
                .pattern(" G ")
                .unlockedBy("has_item", has(Items.LEATHER))
                .save(recipeOutput);
        addShapelessRecipe(
                recipeOutput,
                "wooden_quiver",
                ModCurios.WOOD_GRAIN_QUIVER.get(),
                1,
                ModCurios.LEATHER_QUIVER.get(),
                Items.BOW,
                Items.OAK_LOG,
                Items.BLAZE_POWDER,
                Items.GOLD_INGOT,
                ModItems.POLYMERIZATION.get()
        );
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.GOLDEN_HOOK.get())
                .define('G', Items.GOLD_INGOT)
                .define('I', Items.IRON_INGOT)
                .define('S', Items.STRING)
                .define('F', Items.FISHING_ROD)
                .define('E', Items.EMERALD)
                .pattern("GIG")
                .pattern("SFS")
                .pattern(" E ")
                .unlockedBy("has_item", has(Items.FISHING_ROD))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.ADVENTURER_BELT.get())
                .define('I', Items.IRON_INGOT)
                .define('C', Items.COMPASS)
                .define('L', Items.LEATHER)
                .define('E', Items.EMERALD)
                .define('B', Items.BLAZE_POWDER)
                .pattern("ICI")
                .pattern("LEL")
                .pattern(" B ")
                .unlockedBy("has_item", has(Items.COMPASS))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.MAGMA_AMULET.get())
                .define('B', Items.BLAZE_ROD)
                .define('M', Items.MAGMA_CREAM)
                .define('G', Items.GOLD_INGOT)
                .define('R', Items.REDSTONE)
                .define('O', Items.OBSIDIAN)
                .pattern("BMB")
                .pattern("GRG")
                .pattern(" O ")
                .unlockedBy("has_item", has(Items.MAGMA_CREAM))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.MOON_AMULET.get())
                .define('P', Items.PHANTOM_MEMBRANE)
                .define('E', Items.GOLDEN_CARROT)
                .define('L', Items.LAPIS_LAZULI)
                .define('M', Items.ENDER_EYE)
                .define('I', Items.IRON_INGOT)
                .pattern("PEP")
                .pattern("LML")
                .pattern(" I ")
                .unlockedBy("has_item", has(Items.PHANTOM_MEMBRANE))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.BLAZE_CORE.get())
                .define('P', Items.BLAZE_POWDER)
                .define('L', Items.MAGMA_CREAM)
                .define('Q', Items.QUARTZ_BLOCK)
                .define('C', Items.LAVA_BUCKET)
                .define('S', Items.NETHERITE_SCRAP)
                .pattern("PLP")
                .pattern("QCQ")
                .pattern(" S ")
                .unlockedBy("has_item", has(Items.MAGMA_CREAM))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.RESUSCITATOR.get())
                .define('G', Items.GOLD_NUGGET)
                .define('E', Items.EMERALD)
                .define('P', Items.GOLDEN_APPLE)
                .pattern("GEG")
                .pattern("EPE")
                .pattern("GEG")
                .unlockedBy("has_item", has(Items.EMERALD))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.STRAW_SANDALS.get())
                .define('G', Items.WHEAT)
                .pattern("   ")
                .pattern("G G")
                .pattern("GGG")
                .unlockedBy("has_item", has(Items.WHEAT))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.GOAT_BOOT.get())
                .define('G', ModCurios.STRAW_SANDALS.get())
                .define('W', Items.WHITE_WOOL)
                .define('L', Items.LEATHER)
                .define('A', Items.GOAT_HORN)
                .pattern("AW ")
                .pattern("GLG")
                .pattern(" L ")
                .unlockedBy("has_item", has(ModCurios.STRAW_SANDALS.get()))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.FOX_BOOT.get())
                .define('F', Items.SWEET_BERRIES)
                .define('L', Items.LEATHER)
                .define('G', ModCurios.STRAW_SANDALS.get())
                .pattern("FFF")
                .pattern("GLG")
                .pattern("FLF")
                .unlockedBy("has_item", has(Items.SWEET_BERRIES))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.RABBIT_BOOT.get())
                .define('R', Items.RABBIT_FOOT)
                .define('L', Items.LEATHER)
                .define('G', ModCurios.STRAW_SANDALS.get())
                .pattern(" R ")
                .pattern("GLG")
                .pattern(" L ")
                .unlockedBy("has_item", has(Items.RABBIT_FOOT))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.CAT_BOOT.get())
                .define('C', Items.TROPICAL_FISH)
                .define('L', Items.LEATHER)
                .define('G', ModCurios.STRAW_SANDALS.get())
                .pattern("CCC")
                .pattern("GLG")
                .pattern(" L ")
                .unlockedBy("has_item", has(Items.TROPICAL_FISH))
                .save(recipeOutput);
        addShapelessRecipe(recipeOutput, "leaping_shoes", ModCurios.JUMPING_FOOTWEAR.get(), 1,
                ModCurios.GOAT_BOOT.get(),
                ModCurios.CAT_BOOT.get(),
                ModItems.POLYMERIZATION.get());
        addShapelessRecipe(recipeOutput, "gale_shoes", ModCurios.WIND_LEAP_BOOTS.get(), 1,
                ModCurios.FOX_BOOT.get(),
                ModCurios.RABBIT_BOOT.get(),
                ModItems.POLYMERIZATION.get());
        addShapelessRecipe(recipeOutput, "skybeast_boots", ModCurios.SKY_BEAST_SHOES.get(), 1,
                ModCurios.JUMPING_FOOTWEAR.get(),
                ModCurios.WIND_LEAP_BOOTS.get(),
                ModItems.SUPERPOLYMERIZATION.get());
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.CRYSTAL_BOOT.get())
                .define('C', Items.AMETHYST_SHARD)
                .define('L', Items.LEATHER)
                .define('G', ModCurios.STRAW_SANDALS.get())
                .pattern(" C ")
                .pattern("LGL")
                .pattern(" L ")
                .unlockedBy("has_item", has(Items.AMETHYST_SHARD))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.BLADE_BOOT.get())
                .define('I', Items.IRON_INGOT)
                .define('L', Items.LEATHER)
                .define('S', Items.IRON_SWORD)
                .pattern(" I ")
                .pattern("LSL")
                .pattern(" L ")
                .unlockedBy("has_item", has(Items.IRON_SWORD))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.GUARD_BOOT.get())
                .define('I', Items.IRON_INGOT)
                .define('L', Items.LEATHER_BOOTS)
                .define('C', Items.CHAIN)
                .pattern(" I ")
                .pattern("CLC")
                .pattern(" I ")
                .unlockedBy("has_item", has(Items.CHAIN))
                .save(recipeOutput);
        addShapelessRecipe(recipeOutput, "warrior_greaves", ModCurios.WARRIOR_GREAVES.get(), 1,
                ModCurios.BLADE_BOOT.get(),
                ModCurios.GUARD_BOOT.get(),
                ModCurios.CRYSTAL_BOOT.get(),
                ModItems.POLYMERIZATION.get());
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.FLOWER_BOOT.get())
                .define('L', Items.LEATHER)
                .define('F', Items.DANDELION)
                .define('G', ModCurios.STRAW_SANDALS.get())
                .pattern(" F ")
                .pattern("LGL")
                .pattern(" L ")
                .unlockedBy("has_item", has(Items.DANDELION))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.WATERWALK_BOOT.get())
                .define('L', Items.LEATHER)
                .define('S', Items.SLIME_BALL)
                .define('P', Items.LAPIS_LAZULI)
                .pattern(" S ")
                .pattern("LPL")
                .pattern(" L ")
                .unlockedBy("has_item", has(Items.SLIME_BALL))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.ROLLER_SKATES.get())
                .define('L', Items.LEATHER)
                .define('I', Items.ICE)
                .define('S', Items.SNOWBALL)
                .pattern(" I ")
                .pattern("LSL")
                .pattern(" L ")
                .unlockedBy("has_item", has(Items.ICE))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.GAMBLERS_CORSAGE.get())
                .define('G', Items.GOLD_INGOT)
                .define('E', Items.EMERALD)
                .define('D', Items.DIAMOND)
                .define('P', Items.GLASS_BOTTLE)
                .pattern("GDG")
                .pattern("PEP")
                .pattern("GDG")
                .unlockedBy("has_emerald", has(Items.EMERALD))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.GAMBLERS_DICE.get())
                .define('B', Items.BONE)
                .define('G', Items.GOLD_NUGGET)
                .define('R', Items.REDSTONE)
                .pattern("GRG")
                .pattern("BGB")
                .pattern("GRG")
                .unlockedBy("has_bone", has(Items.BONE))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.GAMBLERS_EARRINGS.get())
                .define('N', Items.GOLD_NUGGET)
                .define('E', Items.EMERALD)
                .define('R', Items.REDSTONE_BLOCK)
                .pattern("N N")
                .pattern("ERE")
                .pattern(" N ")
                .unlockedBy("has_emerald", has(Items.EMERALD))
                .save(recipeOutput);
        // 旋转对称配方
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.GAMBLERS_GOLD_COIN.get())
                .define('G', Items.GOLD_INGOT)
                .define('R', Items.RABBIT_FOOT)
                .define('L', Items.LAPIS_LAZULI)
                .pattern("GLG")
                .pattern("LRL")
                .pattern("GLG")
                .unlockedBy("has_rabbit_foot", has(Items.RABBIT_FOOT))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.GAMBLERS_POKER.get())
                .define('P', Items.PAPER)
                .define('G', Items.GOLD_INGOT)
                .define('B', Items.BOOK)
                .define('R', Items.REDSTONE_TORCH)
                .pattern("GRG")
                .pattern("BPB")
                .pattern("GRG")
                .unlockedBy("has_book", has(Items.BOOK))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.ENCHANT_EYE.get())
                .define('S', Items.EXPERIENCE_BOTTLE)
                .define('E', Ingredient.of(Items.ENCHANTED_BOOK))
                .define('C', Items.ENDER_EYE)
                .define('L', Items.LAPIS_BLOCK)
                .pattern("SES")
                .pattern("LCL")
                .pattern("SES")
                .unlockedBy("has_experience_bottle", has(Items.EXPERIENCE_BOTTLE))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.SOUL_QUIVER.get())
                .define('S', Items.SOUL_SAND)
                .define('F', Items.ENDER_EYE)
                .define('B', ModCurios.WOOD_GRAIN_QUIVER.get())
                .define('L', Items.LEATHER)
                .define('P', ModItems.POLYMERIZATION.get())
                .pattern("SFS")
                .pattern("LBL")
                .pattern("SPS")
                .unlockedBy("has_blaze_rod", has(Items.BLAZE_ROD))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.NEWBIE_UMBRELLA.get())
                .define('S', Items.IRON_BARS)
                .define('T', Items.TURTLE_HELMET)
                .define('B', Items.IRON_SWORD)
                .define('H', Items.SHIELD)
                .pattern("SSS")
                .pattern("BTH")
                .pattern(" S ")
                .unlockedBy("has_turtle_helmet", has(Items.TURTLE_HELMET))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModItems.FLAME_STAFF.get())
                .define('B', Items.BLAZE_ROD)
                .define('S', Items.SOUL_SAND)
                .define('E', Items.ENDER_EYE)
                .pattern("  B")
                .pattern(" S ")
                .pattern("E  ")
                .unlockedBy("has_blaze_rod", has(Items.BLAZE_ROD))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModItems.NECROPSYCHE_PAPILLON.get())
                .define('S', Items.SOUL_SAND)
                .define('F', Items.FEATHER)
                .define('E', Items.ENDER_EYE)
                .pattern("FS ")
                .pattern(" E ")
                .pattern("  S")
                .unlockedBy("has_feather", has(Items.FEATHER))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModItems.FIREBALL_STAFF.get())
                .define('B', Items.BLAZE_ROD)
                .define('F', Items.FIRE_CHARGE)
                .pattern("  F")
                .pattern(" B ")
                .pattern("B  ")
                .unlockedBy("has_blaze_rod", has(Items.BLAZE_ROD))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModItems.SOUL_TORCH.get())
                .define('S', Items.SOUL_SAND)
                .define('B', Items.BLAZE_POWDER)
                .define('L', Items.STICK)
                .pattern(" S ")
                .pattern(" B ")
                .pattern(" L ")
                .unlockedBy("has_blaze_powder", has(Items.BLAZE_POWDER))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModItems.BINOCULARS.get())
                .define('G', Items.GLASS_PANE)
                .define('C', Items.COPPER_INGOT)
                .define('L', Items.LIGHT_WEIGHTED_PRESSURE_PLATE)
                .pattern("GCG")
                .pattern(" L ")
                .pattern("GCG")
                .unlockedBy("has_copper", has(Items.COPPER_INGOT))
                .save(recipeOutput);
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModItems.DOMAIN_STONE.get())
                .define('O', Items.OBSIDIAN)
                .define('E', Items.ENDER_EYE)
                .define('P', Items.ENDER_PEARL)
                .pattern("OEO")
                .pattern("EPE")
                .pattern("OEO")
                .unlockedBy("has_ender_eye", has(Items.ENDER_EYE))
                .save(recipeOutput);
        // 融合（基础版）
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModItems.POLYMERIZATION.get())
                .define('I', Items.IRON_INGOT)
                .define('R', Items.REDSTONE)
                .define('L', Items.LAPIS_LAZULI)
                .pattern("IRI")
                .pattern("RLR")
                .pattern("IRI")
                .unlockedBy("has_redstone", has(Items.REDSTONE))
                .save(recipeOutput);

// 超融合（升级版）
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModItems.SUPERPOLYMERIZATION.get())
                .define('F', ModItems.POLYMERIZATION.get()) // 需要基础融合核心
                .define('N', Items.NETHERITE_INGOT)
                .define('B', Items.BLAZE_ROD)
                .pattern("BNB")
                .pattern("NFN")
                .pattern("BNB")
                .unlockedBy("has_nether_star", has(Items.NETHERITE_INGOT))
                .save(recipeOutput);
        // 头戴式夜视仪PVS-14
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.NIGHT_VISION.get())
                .define('C', Items.COPPER_INGOT)        // 铜锭（支架结构）
                .define('R', Items.COMPARATOR)          // 红石比较器（光电信号处理）
                .define('G', Items.SPYGLASS)            // 望远镜（光学基础）
                .define('L', Items.GLOWSTONE)           // 荧石（夜视光源）
                .define('B', Items.BLACK_DYE)           // 黑色染料（遮光涂层）
                .pattern("CLC")  // 第一行：铜锭 荧石 铜锭（光学组件）
                .pattern("GRG")  // 第二行：望远镜 红石比较器 望远镜（核心模组）
                .pattern("B B")  // 第三行：黑色染料 空 黑色染料（头带固定点）
                .unlockedBy("has_comparator", has(Items.COMPARATOR))
                .save(recipeOutput);
        // ATNPS15双筒夜视仪（强化版）
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.DOUBLE_NIGHT_VISION.get())
                .define('N', Items.GOLD_INGOT)    // 下界合金（军用级支架）
                .define('P', Items.PHANTOM_MEMBRANE)   // 幻翼膜（轻量化蒙皮）
                .define('V', Items.SPYGLASS)           // 望远镜×2（双筒光学模组）
                .define('S', Items.SCULK_SENSOR)       // 幽匿感测体（增强型光电转换）
                .define('G', Items.GLOWSTONE)          // 荧石×2（双通道夜视光源）
                .define('L', Items.LIGHTNING_ROD)      // 避雷针（电源稳压装置）
                .pattern("GVG")  // 荧石 望远镜 荧石
                .pattern("SLS")  // 幽匿感测体 避雷针 幽匿感测体
                .pattern("NPN")  // 下界合金 幻翼膜 下界合金
                .unlockedBy("has_sculk_sensor", has(Items.SCULK_SENSOR))
                .save(recipeOutput);
        // 四筒全景夜视仪（顶级军用规格）
        ShapedRecipeBuilder.shaped(RecipeCategory.MISC, ModCurios.QUARTER_NIGHT_VISION.get())
                .define('X', Items.NETHERITE_INGOT)       // 下界之星（高能核心）
                .define('A', Items.AMETHYST_BLOCK)    // 紫水晶块×4（多光谱成像）
                .define('C', Items.COPPER_BLOCK)      // 铜块×4（增强型信号传导）
                .define('S', Items.SCULK_SENSOR)      // 幽匿感测体×4（全向感知阵列）
                .define('P', Items.PHANTOM_MEMBRANE)  // 幻翼膜×2（战术级蒙皮）
                .define('B', Items.SHULKER_SHELL)     // 潜影壳（抗干扰外壳）
                .pattern("CAC")  // 铜块 紫水晶块 铜块（左光学组）
                .pattern("SXS")  // 幽匿感测体 下界之星 幽匿感测体（中央处理器）
                .pattern("BPB")  // 潜影壳 幻翼膜 潜影壳（右佩戴系统）
                .unlockedBy("wither_killed", has(Items.NETHER_STAR)) // 需击败凋灵
                .save(recipeOutput);

    }
    protected void addShapelessRecipe(Consumer<FinishedRecipe> consumer, String name, ItemLike output, int count, ItemLike... inputs){
        {
            ShapelessRecipeBuilder builder = ShapelessRecipeBuilder.shapeless(RecipeCategory.MISC, output, count);
            for (ItemLike input : inputs) {
                builder.requires(input);
            }
            builder.unlockedBy("has_" + inputs[0].asItem().toString(), has(inputs[0]))
                    .save(consumer, new ResourceLocation(LovelySparklePieces.MODID, name));
        }
    }

}
