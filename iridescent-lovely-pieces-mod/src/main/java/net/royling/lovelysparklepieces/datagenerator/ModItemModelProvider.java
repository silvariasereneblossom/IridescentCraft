package net.royling.lovelysparklepieces.datagenerator;

import net.minecraft.data.PackOutput;
import net.minecraftforge.client.model.generators.ItemModelProvider;
import net.minecraftforge.common.data.ExistingFileHelper;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModUsingItem.ModItems;

public class ModItemModelProvider extends ItemModelProvider{
    public ModItemModelProvider(PackOutput output, ExistingFileHelper existingFileHelper) {
        super(output, LovelySparklePieces.MODID, existingFileHelper);
    }

    @Override
    protected void registerModels() {
        basicItem(ModCurios.MAGNETIC_RING.get());
        basicItem(ModCurios.SUPER_MAGNETIC_RING.get());
        basicItem(ModCurios.BLASPHEMOUS_CONTRACT.get());
        basicItem(ModCurios.ENCHANT_EYE.get());
        basicItem(ModCurios.ENDER_RING.get());
        basicItem(ModCurios.CRIT_RING.get());
        basicItem(ModCurios.MEMORY_RING.get());
        basicItem(ModCurios.NIGHT_OWL_RING.get());
        basicItem(ModCurios.FPS_EYE.get());
        basicItem(ModCurios.CAT_BOOT.get());
        basicItem(ModCurios.GOAT_BOOT.get());
        basicItem(ModCurios.RABBIT_BOOT.get());
        basicItem(ModCurios.FOX_BOOT.get());
        basicItem(ModCurios.SOUL_QUIVER.get());
        basicItem(ModCurios.BLACKSTONE_HEART.get());
        basicItem(ModCurios.MAGMA_AMULET.get());
        basicItem(ModCurios.MOON_AMULET.get());
        basicItem(ModCurios.STRAW_SANDALS.get());
        basicItem(ModCurios.CRYSTAL_BOOT.get());
        basicItem(ModCurios.BLADE_BOOT.get());
        basicItem(ModCurios.GUARD_BOOT.get());
        basicItem(ModCurios.WARRIOR_GREAVES.get());
        basicItem(ModCurios.FLOWER_BOOT.get());
        basicItem(ModCurios.WATERWALK_BOOT.get());
        basicItem(ModCurios.GAMBLERS_POKER.get());
        basicItem(ModCurios.GAMBLERS_GOLD_COIN.get());
        basicItem(ModCurios.GAMBLERS_EARRINGS.get());
        basicItem(ModCurios.GAMBLERS_DICE.get());
        basicItem(ModCurios.GAMBLERS_CORSAGE.get());
        basicItem(ModCurios.NEWBIE_UMBRELLA.get());
        basicItem(ModCurios.BLAZE_CORE.get());
        basicItem(ModCurios.RESUSCITATOR.get());
        basicItem(ModCurios.ROLLER_SKATES.get());
        basicItem(ModCurios.CRUSH_STONE_RING.get());
        basicItem(ModCurios.INFERNO_RING.get());
        basicItem(ModCurios.ECO_RING.get());

        basicItem(ModCurios.NIGHT_VISION.get());
        basicItem(ModCurios.JELLYFISH_HELMET.get());
        basicItem(ModCurios.CAPITALIST_HEAT.get());
        basicItem(ModCurios.POSEIDON_RESPIRATOR.get());
        basicItem(ModCurios.EYE_MASK.get());
        basicItem(ModCurios.MARKSMAN_GOGGLES.get());
        basicItem(ModCurios.WITCH_HAT.get());
        basicItem(ModCurios.YELLOW_HEADSCARF.get());
        basicItem(ModCurios.HEAVY_BIGROCK.get());
        basicItem(ModCurios.POCKET_WATCH.get());
        basicItem(ModCurios.MERMAID_TAIL.get());
        basicItem(ModCurios.JUMPING_FOOTWEAR.get());
        basicItem(ModCurios.WIND_LEAP_BOOTS.get());
        basicItem(ModCurios.SKY_BEAST_SHOES.get());
        basicItem(ModCurios.DRAGON_HEART.get());
        basicItem(ModCurios.DOUBLE_NIGHT_VISION.get());
        basicItem(ModCurios.QUARTER_NIGHT_VISION.get());
        basicItem(ModCurios.LEATHER_QUIVER.get());
        basicItem(ModCurios.SPEEDOMETER.get());
        basicItem(ModCurios.POSITION_TRACKER.get());
        basicItem(ModCurios.GPS.get());
        basicItem(ModCurios.HIGH_QUALITY_FISHING_LINE.get());
        basicItem(ModCurios.WOOD_GRAIN_QUIVER.get());
        basicItem(ModCurios.PDA.get());
        basicItem(ModCurios.MIRROR_AND_WATER.get());
        basicItem(ModCurios.GOLDEN_HOOK.get());
        basicItem(ModCurios.ADVENTURER_BELT.get());

        //
        withExistingParent(ModItems.SOUL_TORCH.get().toString(), mcLoc("item/handheld")).texture("layer0", "item/" + ModItems.SOUL_TORCH.get().toString().split(":")[1]);
        withExistingParent(ModItems.NECROPSYCHE_PAPILLON.get().toString(), mcLoc("item/handheld")).texture("layer0", "item/" + ModItems.NECROPSYCHE_PAPILLON.get().toString().split(":")[1]);
        basicItem(ModItems.DOMAIN_STONE.get());
        withExistingParent(ModItems.FIREBALL_STAFF.get().toString(), mcLoc("item/handheld")).texture("layer0", "item/" + ModItems.FIREBALL_STAFF.get().toString().split(":")[1]);
        withExistingParent(ModItems.POLYMERIZATION.get().toString(), mcLoc("item/handheld")).texture("layer0", "item/" + ModItems.POLYMERIZATION.get().toString().split(":")[1]);
        withExistingParent(ModItems.SUPERPOLYMERIZATION.get().toString(), mcLoc("item/handheld")).texture("layer0", "item/" + ModItems.SUPERPOLYMERIZATION.get().toString().split(":")[1]);
        withExistingParent(ModItems.FISHING_TREASURE.get().toString(), mcLoc("item/handheld")).texture("layer0", "item/" + ModItems.FISHING_TREASURE.get().toString().split(":")[1]);
        withExistingParent(ModItems.PIRATE_SCIMITAR.get().toString(), mcLoc("item/handheld")).texture("layer0", "item/" + ModItems.PIRATE_SCIMITAR.get().toString().split(":")[1]);
        withExistingParent(ModItems.FISH_HOE.get().toString(), mcLoc("item/handheld")).texture("layer0", "item/" + ModItems.FISH_HOE.get().toString().split(":")[1]);
        withExistingParent(ModItems.FISH_AXE.get().toString(), mcLoc("item/handheld")).texture("layer0", "item/" + ModItems.FISH_AXE.get().toString().split(":")[1]);
        withExistingParent(ModItems.FISH_PICKAXE.get().toString(), mcLoc("item/handheld")).texture("layer0", "item/" + ModItems.FISH_PICKAXE.get().toString().split(":")[1]);
        withExistingParent(ModItems.FISH_SHOVEL.get().toString(), mcLoc("item/handheld")).texture("layer0", "item/" + ModItems.FISH_SHOVEL.get().toString().split(":")[1]);
        withExistingParent(ModItems.MOJA_COLA.get().toString(), mcLoc("item/handheld")).texture("layer0", "item/" + ModItems.MOJA_COLA.get().toString().split(":")[1]);
    }
}
