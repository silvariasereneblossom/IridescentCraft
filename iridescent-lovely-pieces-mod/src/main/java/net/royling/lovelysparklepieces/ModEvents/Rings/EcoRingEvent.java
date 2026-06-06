package net.royling.lovelysparklepieces.ModEvents.Rings;

import net.minecraft.tags.BlockTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.monster.WitherSkeleton;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.event.entity.living.LivingDeathEvent;
import net.minecraftforge.event.level.BlockEvent;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;

import java.util.Random;

@Mod.EventBusSubscriber(modid = LovelySparklePieces.MODID)
public class EcoRingEvent {
    @SubscribeEvent
    public static void onLivingDeath(LivingDeathEvent event){
        LivingEntity victim = event.getEntity();
        if(victim instanceof WitherSkeleton){
            if(event.getSource().getEntity() instanceof Player killer){
               if( ModCurios.hasCurio(killer,ModCurios.ECO_RING.get())){
                   RandomSource random = victim.level().getRandom();
                   int coalCount = random.nextInt(5)+8;;
                   ItemStack coalStack = new ItemStack(Items.COAL,coalCount);
                   victim.spawnAtLocation(coalStack);
               }
            }
        }
    }
    @SubscribeEvent
    public static void onHarvesDrops(BlockEvent.BreakEvent event){
        Player player = event.getPlayer();
        BlockState state = event.getState();
        if(player!=null && state.is(BlockTags.COAL_ORES)){
            if(ModCurios.hasCurio(player,ModCurios.ECO_RING.get())){
                event.getLevel().setBlock(event.getPos(), Blocks.AIR.defaultBlockState(), 3);
                event.setCanceled(true);
            }
        }
    }
}
