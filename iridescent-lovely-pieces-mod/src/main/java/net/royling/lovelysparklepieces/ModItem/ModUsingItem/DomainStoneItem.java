package net.royling.lovelysparklepieces.ModItem.ModUsingItem;

import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtUtils;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.UseAnim;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.phys.Vec3;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.network.NetworkHandler;
import net.royling.lovelysparklepieces.network.PlayerSoulPacket;
import net.royling.lovelysparklepieces.network.PlayerUsingItemDataPacket;
import net.royling.lovelysparklepieces.ModItem.ModDataComponents.NBTHelper;
import org.jetbrains.annotations.Nullable;

import java.util.List;
import java.util.Optional;
import java.util.function.Function;

public class DomainStoneItem extends Item {
    public DomainStoneItem(Properties properties) {
        super(properties.stacksTo(1).durability(128));
    }
    private static final int TELEPORT_CHARGE_TICKS = 80;

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if(!level.isClientSide){
            if(player.isShiftKeyDown()){
                handleAnchorCommad(player,stack);
            }else {
                player.startUsingItem(hand);
            }
        }
        return InteractionResultHolder.consume(stack);
    }
    private void handleAnchorCommad(Player player, ItemStack stack){
        if(NBTHelper.hasBoundaryStoneData(stack)){
            NBTHelper.removeBoundaryStoneData(stack);
            player.level().playSound(null, player.blockPosition(), SoundEvents.GLASS_BREAK, SoundSource.PLAYERS, 1.0F, 1.0F);
        }else {
            BlockPos pos = player.blockPosition();
            ResourceLocation dimension = player.level().dimension().location();
            NBTHelper.setBoundaryStoneData(stack, pos, dimension);
            player.level().playSound(null, player.blockPosition(), SoundEvents.BOOK_PAGE_TURN, SoundSource.PLAYERS, 1.0F, 1.0F);
        }
    }
    private void teleportPlayer(Player player,ItemStack stack){
        if(!NBTHelper.hasBoundaryStoneData(stack)){
            player.level().playSound(null, player.blockPosition(), SoundEvents.NOTE_BLOCK_DIDGERIDOO.value(), SoundSource.PLAYERS, 1.0F, 0.5F);
            return;
        }
        BlockPos targetPos = NBTHelper.getAnchorPos(stack);
        ResourceKey<Level> targetDimension = ResourceKey.create(Registries.DIMENSION, NBTHelper.getAnchorDimension(stack));
        ServerLevel clevel = (ServerLevel) player.level();
        ServerLevel targetlevel = clevel.getServer().getLevel(targetDimension);
        if(targetlevel==null){
            player.level().playSound(null, player.blockPosition(), SoundEvents.NOTE_BLOCK_DIDGERIDOO.value(), SoundSource.PLAYERS, 1.0F, 0.5F);
            return;
        }
        stack.hurtAndBreak(1, player, (p) -> p.broadcastBreakEvent(EquipmentSlot.MAINHAND));
        player.level().playSound(null, player.blockPosition(), SoundEvents.PORTAL_TRAVEL, SoundSource.PLAYERS, 1.0F, 1.0F);
        if(clevel == targetlevel){
            player.teleportTo(targetPos.getX() + 0.5, targetPos.getY() + 1.0, targetPos.getZ() + 0.5);
        }else {
            if(player instanceof ServerPlayer serverPlayer){
                serverPlayer.teleportTo(targetlevel, 
                    targetPos.getX() + 0.5, 
                    targetPos.getY() + 1.0, 
                    targetPos.getZ() + 0.5, 
                    serverPlayer.getYRot(), 
                    serverPlayer.getXRot());
            }else {
                player.level().playSound(null, player.blockPosition(), SoundEvents.NOTE_BLOCK_DIDGERIDOO.value(), SoundSource.PLAYERS, 1.0F, 0.5F);
            }
        }
    }
    @Override
    public void onUseTick(Level level, LivingEntity livingEntity, ItemStack stack, int remainingUseDuration) {
        if(!level.isClientSide&&livingEntity instanceof Player player){
            player.getPersistentData().putInt("lsp_usingitemtick",getUseDuration(stack)-remainingUseDuration);
            NetworkHandler.sendToPlayer(new PlayerUsingItemDataPacket(Math.min(80,getUseDuration(stack)-remainingUseDuration)), (ServerPlayer) player);
            if(remainingUseDuration%5==0)
                player.level().playSound(null, player.blockPosition(), SoundEvents.PORTAL_AMBIENT, SoundSource.PLAYERS, 1.0F, 1.0F);
            if(!livingEntity.isShiftKeyDown()&&remainingUseDuration<5){
                teleportPlayer(player,stack);
                player.stopUsingItem();
            }
        }
    }
    @Override
    public void releaseUsing(ItemStack pStack, Level pLevel, LivingEntity pLivingEntity, int pTimeCharged) { super.releaseUsing(pStack, pLevel, pLivingEntity, pTimeCharged); }

    @Override
    public int getUseDuration(ItemStack stack) {
        return TELEPORT_CHARGE_TICKS;
    }
    @Override
    public UseAnim getUseAnimation(ItemStack pStack) { return UseAnim.BOW; }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level8"));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.domain_stone_des").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.domain_stone_des2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.domain_stone_des3").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.domain_stone_des4").withStyle(ChatFormatting.GOLD));
        if (NBTHelper.hasBoundaryStoneData(stack)) {
            BlockPos pos = NBTHelper.getAnchorPos(stack);
            ResourceLocation dimension = NBTHelper.getAnchorDimension(stack);
            // 使用本地化键和参数来构建组件
            tooltipComponents.add(Component.translatable(
                    "item.lovely_sparkle_pieces.boundary_stone.anchored_to", // 本地化键
                    pos.getX(), // %s 第一个参数
                    pos.getY(), // %s 第二个参数
                    pos.getZ(), // %s 第三个参数
                    dimension.getPath() // %s 第四个参数 (维度路径)
            ).withStyle(ChatFormatting.GOLD));
        }
        else {
            tooltipComponents.add(Component.translatable(
                    "item.lovely_sparkle_pieces.boundary_stone.no_anchor" // 本地化键
            ).withStyle(ChatFormatting.GOLD));
        }
    }

}
