package net.royling.lovelysparklepieces.ModCreative;

import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraftforge.registries.RegistryObject;
import net.minecraftforge.registries.DeferredRegister;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModBlock.ModBlocks;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModUsingItem.ModItems;

public class ModCreative {
    public static final DeferredRegister<CreativeModeTab> CREATIVE_MODE_TABS = DeferredRegister.create(Registries.CREATIVE_MODE_TAB, LovelySparklePieces.MODID);
    public static final RegistryObject<CreativeModeTab> EXAMPLE_TAB = CREATIVE_MODE_TABS.register("example_tab", () -> CreativeModeTab.builder()
            .title(Component.translatable("itemGroup.lovely_sparkle_pieces"))
            .icon(() -> ModCurios.BLASPHEMOUS_CONTRACT.get().getDefaultInstance())
            .displayItems((parameters, output) -> {
                output.accept(ModCurios.MAGNETIC_RING.get().getDefaultInstance());
                output.accept(ModCurios.SUPER_MAGNETIC_RING.get().getDefaultInstance());
                output.accept(ModCurios.ENDER_RING.get().getDefaultInstance());
                output.accept(ModCurios.CRIT_RING.get().getDefaultInstance());
                output.accept(ModCurios.MEMORY_RING.get().getDefaultInstance());
                output.accept(ModCurios.NIGHT_OWL_RING.get().getDefaultInstance());
                output.accept(ModCurios.CRUSH_STONE_RING.get().getDefaultInstance());
                output.accept(ModCurios.INFERNO_RING.get().getDefaultInstance());
                output.accept(ModCurios.ECO_RING.get().getDefaultInstance());
                //首饰
                output.accept(ModCurios.FPS_EYE.get().getDefaultInstance());
                output.accept(ModCurios.BLACKSTONE_HEART.get().getDefaultInstance());
                output.accept(ModCurios.NIGHT_VISION.get().getDefaultInstance());
                output.accept(ModCurios.DOUBLE_NIGHT_VISION.get().getDefaultInstance());
                output.accept(ModCurios.QUARTER_NIGHT_VISION.get().getDefaultInstance());
                output.accept(ModCurios.JELLYFISH_HELMET.get().getDefaultInstance());
                output.accept(ModCurios.CAPITALIST_HEAT.get().getDefaultInstance());
                output.accept(ModCurios.POSEIDON_RESPIRATOR.get().getDefaultInstance());
                output.accept(ModCurios.EYE_MASK.get().getDefaultInstance());
                output.accept(ModCurios.MARKSMAN_GOGGLES.get().getDefaultInstance());
                output.accept(ModCurios.WITCH_HAT.get().getDefaultInstance());
                output.accept(ModCurios.YELLOW_HEADSCARF.get().getDefaultInstance());
                //胸饰
                output.accept(ModCurios.HEAVY_BIGROCK.get().getDefaultInstance());
                output.accept(ModCurios.POCKET_WATCH.get().getDefaultInstance());
                output.accept(ModCurios.SPEEDOMETER.get().getDefaultInstance());
                output.accept(ModCurios.POSITION_TRACKER.get().getDefaultInstance());
                output.accept(ModCurios.GPS.get().getDefaultInstance());
                output.accept(ModCurios.PDA.get().getDefaultInstance());
                output.accept(ModCurios.HIGH_QUALITY_FISHING_LINE.get().getDefaultInstance());
                //背饰
                output.accept(ModCurios.MERMAID_TAIL.get().getDefaultInstance());
                output.accept(ModCurios.LEATHER_QUIVER.get().getDefaultInstance());
                output.accept(ModCurios.WOOD_GRAIN_QUIVER.get().getDefaultInstance());
                //腰带
                output.accept(ModCurios.GOLDEN_HOOK.get().getDefaultInstance());
                output.accept(ModCurios.ADVENTURER_BELT.get().getDefaultInstance());
                //项链等
                output.accept(ModCurios.MAGMA_AMULET.get().getDefaultInstance());
                output.accept(ModCurios.MOON_AMULET.get().getDefaultInstance());
                output.accept(ModCurios.BLAZE_CORE.get().getDefaultInstance());
                //手环
                output.accept(ModCurios.RESUSCITATOR.get().getDefaultInstance());
                //足部
                output.accept(ModCurios.STRAW_SANDALS.get().getDefaultInstance());
                output.accept(ModCurios.GOAT_BOOT.get().getDefaultInstance());
                output.accept(ModCurios.FOX_BOOT.get().getDefaultInstance());
                output.accept(ModCurios.RABBIT_BOOT.get().getDefaultInstance());
                output.accept(ModCurios.CAT_BOOT.get().getDefaultInstance());
                output.accept(ModCurios.CRYSTAL_BOOT.get().getDefaultInstance());
                output.accept(ModCurios.BLADE_BOOT.get().getDefaultInstance());
                output.accept(ModCurios.GUARD_BOOT.get().getDefaultInstance());
                output.accept(ModCurios.WARRIOR_GREAVES.get().getDefaultInstance());
                output.accept(ModCurios.FLOWER_BOOT.get().getDefaultInstance());
                output.accept(ModCurios.WATERWALK_BOOT.get().getDefaultInstance());
                output.accept(ModCurios.ROLLER_SKATES.get().getDefaultInstance());
                output.accept(ModCurios.JUMPING_FOOTWEAR.get().getDefaultInstance());
                output.accept(ModCurios.WIND_LEAP_BOOTS.get().getDefaultInstance());
                output.accept(ModCurios.SKY_BEAST_SHOES.get().getDefaultInstance());
                //赌徒
                output.accept(ModCurios.GAMBLERS_CORSAGE.get().getDefaultInstance());
                output.accept(ModCurios.GAMBLERS_DICE.get().getDefaultInstance());
                output.accept(ModCurios.GAMBLERS_EARRINGS.get().getDefaultInstance());
                output.accept(ModCurios.GAMBLERS_GOLD_COIN.get().getDefaultInstance());
                output.accept(ModCurios.GAMBLERS_POKER.get().getDefaultInstance());
                //传奇饰品
                output.accept(ModCurios.BLASPHEMOUS_CONTRACT.get().getDefaultInstance());
                output.accept(ModCurios.MIRROR_AND_WATER.get().getDefaultInstance());
                output.accept(ModCurios.ENCHANT_EYE.get().getDefaultInstance());
                output.accept(ModCurios.SOUL_QUIVER.get().getDefaultInstance());
                output.accept(ModCurios.NEWBIE_UMBRELLA.get().getDefaultInstance());
                output.accept(ModCurios.DRAGON_HEART.get().getDefaultInstance());
                //物品
                output.accept(ModItems.FLAME_STAFF.get().getDefaultInstance());
                output.accept(ModItems.NECROPSYCHE_PAPILLON.get().getDefaultInstance());
                output.accept(ModItems.FIREBALL_STAFF.get().getDefaultInstance());
                output.accept(ModItems.PIRATE_SCIMITAR.get().getDefaultInstance());
                output.accept(ModItems.FISH_AXE.get().getDefaultInstance());
                output.accept(ModItems.FISH_PICKAXE.get().getDefaultInstance());
                output.accept(ModItems.FISH_SHOVEL.get().getDefaultInstance());
                output.accept(ModItems.FISH_HOE.get().getDefaultInstance());
                output.accept(ModItems.SOUL_TORCH.get().getDefaultInstance());
                output.accept(ModItems.BINOCULARS.get().getDefaultInstance());
                output.accept(ModItems.DOMAIN_STONE.get().getDefaultInstance());
                output.accept(ModItems.POLYMERIZATION.get().getDefaultInstance());
                output.accept(ModItems.SUPERPOLYMERIZATION.get().getDefaultInstance());
                output.accept(ModItems.FISHING_TREASURE.get().getDefaultInstance());
                output.accept(ModItems.MOJA_COLA.get().getDefaultInstance());
                //方块
                output.accept(ModBlocks.SOUL_LIGHT_ITEM.get().getDefaultInstance());
                output.accept(ModBlocks.MOLTEN_STONE_ITEM.get().getDefaultInstance());
                output.accept(ModBlocks.MOLTEN_DIRT_ITEM.get().getDefaultInstance());

            }).build());
}
