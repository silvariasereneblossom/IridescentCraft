package net.royling.lovelysparklepieces.ModItem.ModCurios.necklace;

import net.minecraft.ChatFormatting;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.TooltipFlag;
import net.minecraftforge.network.PacketDistributor;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.network.PlayerLavadefPacket;
import net.royling.lovelysparklepieces.network.PlayerSoulPacket;
import net.royling.lovelysparklepieces.network.NetworkHandler;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import net.royling.lovelysparklepieces.PlayerData.SoulData;
import org.checkerframework.checker.units.qual.C;
import top.theillusivec4.curios.api.SlotContext;
import top.theillusivec4.curios.api.type.capability.ICurio;
import top.theillusivec4.curios.api.type.capability.ICurioItem;

import java.util.List;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class MagmaAmuletItem extends UniversalCurio {
    public MagmaAmuletItem(Properties properties) {
        super(properties.stacksTo(1).rarity(Rarity.UNCOMMON));
    }

    @Override
    public void curioTick(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity().level().isClientSide)return;
        if(slotContext.entity() instanceof Player player){
            // IRIDESCENT: compute the new value first, then write NBT + send ONLY when it changed (was: an
            // NBT write + a packet every tick in every branch, even parked at the 140 cap).
            CompoundTag data = player.getPersistentData();
            if(data.get("lsp_lava_def")==null){
                data.putInt("lsp_lava_def",0);
                NetworkHandler.sendToPlayer(new PlayerLavadefPacket(0), (ServerPlayer) player);
                return;
            }
            int stored = data.getInt("lsp_lava_def");
            boolean burning = player.isInLava()||player.isOnFire();
            // Clamped to 0..140: the lava branch used to decrement without a floor, and PlayerLavadefPacket's
            // constructor THROWS on a negative value - so the tick after the charge ran out (stored 0, still
            // in lava / on fire) wrote -1 and threw out of the player tick.
            int updated = Math.max(0, Math.min(140, burning ? stored-1 : stored+1));
            if(burning && updated>0){
                player.setRemainingFireTicks(0);
            }
            if(updated!=stored){
                data.putInt("lsp_lava_def",updated);
                NetworkHandler.sendToPlayer(new PlayerLavadefPacket(updated), (ServerPlayer) player);
            }else if(player.tickCount % 20 == 0){
                // Unchanged: no NBT write. 1/s resend only, because the client copy of this value lives on
                // the LocalPlayer, which is recreated (value lost, HUD bar hidden) on every dimension change.
                NetworkHandler.sendToPlayer(new PlayerLavadefPacket(updated), (ServerPlayer) player);
            }
        }
    }

    @Override
    public void onEquip(SlotContext slotContext, ItemStack prevStack, ItemStack stack) {
        if(slotContext.entity()instanceof Player player){
            player.getPersistentData().putInt("lsp_lava_def",0);
            NetworkHandler.sendToPlayer(new PlayerLavadefPacket(player.getPersistentData().getInt("lsp_lava_def")), (ServerPlayer) player);
        }
    }

    @Override
    public void onUnequip(SlotContext slotContext, ItemStack newStack, ItemStack stack) {
        if(slotContext.entity()instanceof Player player){
            player.getPersistentData().remove("lsp_lava_def");
            NetworkHandler.sendToPlayer(new PlayerLavadefPacket(player.getPersistentData().getInt("lsp_lava_def")), (ServerPlayer) player);
        }
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level3").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.magna.des").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.magna.des2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.magna.des3").withStyle(ChatFormatting.GOLD));

    }
    @Override
    public boolean canEquip(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player){
            return !ModCurios.hasCurio(player,this);
        }
        return true;
    }
}
