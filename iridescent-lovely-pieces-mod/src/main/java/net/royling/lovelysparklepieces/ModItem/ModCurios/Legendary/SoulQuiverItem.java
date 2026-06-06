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
import net.royling.lovelysparklepieces.ModEvents.Legendarys.BCEvents;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import top.theillusivec4.curios.api.CuriosApi;
import top.theillusivec4.curios.api.type.capability.ICurio;
import top.theillusivec4.curios.api.SlotContext;
import top.theillusivec4.curios.api.type.capability.ICurioItem;

import java.util.List;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class SoulQuiverItem extends UniversalCurio {

    public SoulQuiverItem(Properties properties) {
        super(properties.stacksTo(1).rarity(Rarity.RARE));
    }
    public static boolean hasSoulQuiver(Player player) {
        return CuriosApi.getCuriosInventory(player).resolve().flatMap(inv->inv.findFirstCurio(ModCurios.SOUL_QUIVER.get())).isPresent();
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltip, TooltipFlag tooltipFlag) {
        tooltip.add(Component.translatable("tooltip.lovely_sparkle_pieces.level8"));
        tooltip.add(Component.translatable("tooltip.lovelysparklepieces.soul_quiver.equip_requirement").withStyle(ChatFormatting.GOLD));
        tooltip.add(Component.translatable("tooltip.lovelysparklepieces.soul_quiver.des").withStyle(ChatFormatting.GOLD));
        tooltip.add(Component.translatable("tooltip.lovelysparklepieces.soul_quiver.effect").withStyle(ChatFormatting.GOLD));
        tooltip.add(Component.translatable("tooltip.lovelysparklepieces.soul_quiver.cost").withStyle(ChatFormatting.GOLD));
        tooltip.add(Component.translatable("tooltip.lovelysparklepieces.soul_quiver.no_arrow").withStyle(ChatFormatting.GOLD));
        tooltip.add(Component.translatable("tooltip.lovelysparklepieces.soul_quiver.des2").withStyle(ChatFormatting.GOLD));
    }

    @Override
    public boolean canEquip(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player){
            return !ModCurios.hasCurio(player,this) && ModCurios.hasCurio(player,ModCurios.BLASPHEMOUS_CONTRACT.get());
        }
        return true;
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
