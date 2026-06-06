package net.royling.lovelysparklepieces.ModItem.ModUsingItem;

import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.level.storage.loot.parameters.LootContextParamSets;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.world.phys.Vec3;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModSounds.ModSounds;

import java.util.List;

public class FishingTreasure extends Item {
    private final SoundEvent openSound;

    public static final ResourceLocation TREASURE_CHEST_LOOT_TABLE =
            new ResourceLocation(LovelySparklePieces.MODID, "gameplay/fish_treasure");
    public FishingTreasure(Properties properties,SoundEvent openSound) {
        super(properties.stacksTo(32));
        this.openSound = openSound;
    }

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand usedHand) {
        ItemStack stack = player.getItemInHand(usedHand);
        if(level.isClientSide){
            if(player.getCooldowns().isOnCooldown(this))return InteractionResultHolder.pass(stack);
            level.playSound(player,player.blockPosition(), ModSounds.TREASURE_OPEN.get(),player.getSoundSource());
        }
        if (!level.isClientSide()){
            if(player.getCooldowns().isOnCooldown(this)){
                return InteractionResultHolder.pass(stack);
            }
            if(!player.isCreative()) stack.shrink(1);
            if(level instanceof ServerLevel serverLevel){
                LootTable lootTable = serverLevel.getServer().getLootData().getLootTable(TREASURE_CHEST_LOOT_TABLE);
                if(lootTable!=LootTable.EMPTY){
                    LootParams.Builder lootBuilder = new LootParams.Builder(serverLevel)
                            .withParameter(LootContextParams.ORIGIN,new Vec3(player.getX(),player.getY(),player.getZ()))
                            .withParameter(LootContextParams.THIS_ENTITY,player)
                            .withParameter(LootContextParams.TOOL,stack)
                            .withParameter(LootContextParams.DAMAGE_SOURCE,player.damageSources().playerAttack(player));
                    List<ItemStack> generatedLoot = lootTable.getRandomItems(lootBuilder.create(LootContextParamSets.ENTITY));
                    for(ItemStack lootStack : generatedLoot){
                        if(!player.addItem(lootStack)){
                            player.drop(lootStack,false);
                        }
                    }
                }else {
                    System.err.print("No Loot!");
                }
            }
            player.getCooldowns().addCooldown(this,20);
            return InteractionResultHolder.consume(stack);
        }
        return InteractionResultHolder.pass(stack);
    }
}
