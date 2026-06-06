package net.royling.lovelysparklepieces.ModItem.ModCurios.Legendary;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.TooltipFlag;
import net.minecraftforge.fml.common.Mod;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModEvents.Legendarys.BCEvents;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import top.theillusivec4.curios.api.CuriosApi;
import top.theillusivec4.curios.api.type.capability.ICurio;
import top.theillusivec4.curios.api.SlotContext;
import top.theillusivec4.curios.api.type.capability.ICurioItem;

import java.util.List;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class EnchantEyeItem extends UniversalCurio {
    public EnchantEyeItem(Properties properties) {
        super(properties.rarity(Rarity.RARE).stacksTo(1));
    }
    public static boolean hasEye(Player player) {
        return CuriosApi.getCuriosInventory(player).resolve().flatMap(inv->inv.findFirstCurio(ModCurios.ENCHANT_EYE.get())).isPresent();
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level10"));
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.require")
                .withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bonus")
                .withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.cost")
                .withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.unique")
                .withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.unreliable")
                .withStyle(ChatFormatting.GOLD));
    }

    @Override
    public boolean canEquip(SlotContext slotContext, ItemStack stack) {
        return slotContext.entity() instanceof Player player && BCEvents.hasBlasphemousContract(player) && !ModCurios.hasCurio(player,this);
    }

    @Override
    public void curioTick(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player){
            if(!BCEvents.hasBlasphemousContract(player)){
               CuriosApi.getCuriosInventory(player).ifPresent(curios->{
                   curios.getStacksHandler(slotContext.identifier()).ifPresent(handler->{
                       handler.getStacks().setStackInSlot(slotContext.index(),ItemStack.EMPTY)
                       ;        player.level().addFreshEntity(new ItemEntity(
                               player.level(),
                               player.getX(),
                               player.getY() + 0.5, // 避免卡在方块内
                               player.getZ(),
                               stack.copy()));
                   });
               });
            }
        }
    }
}
