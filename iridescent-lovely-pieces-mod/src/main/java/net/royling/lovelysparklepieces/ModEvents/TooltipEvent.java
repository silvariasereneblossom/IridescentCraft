package net.royling.lovelysparklepieces.ModEvents;

import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.event.entity.player.ItemTooltipEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModItem.ModCurios.Group.Set.SetBonus;
import net.royling.lovelysparklepieces.ModItem.ModCurios.Group.Set.SetBonusRegistry;
import net.royling.lovelysparklepieces.ModItem.ModCurios.Group.Set.SetBonusStage;
import top.theillusivec4.curios.api.CuriosApi;

import java.util.List;

@Mod.EventBusSubscriber(modid = LovelySparklePieces.MODID,value = Dist.CLIENT)
public class TooltipEvent {
    @SubscribeEvent
    public static void SetTooltip(ItemTooltipEvent event){
        ItemStack stack = event.getItemStack();
        Item item = stack.getItem();
        List<Component> tooltip = event.getToolTip();
        Player player = Minecraft.getInstance().player;
        if (player == null) return; // 确保玩家存在

        for (SetBonus bonus : SetBonusRegistry.ALL){
            if (bonus.matches(item)){
                tooltip.add(Component.literal("-------------------").withStyle(ChatFormatting.GRAY));
                tooltip.add(Component.translatable("tooltip.set_bonus.title").withStyle(ChatFormatting.GOLD, ChatFormatting.BOLD));
                tooltip.add(Component.translatable("tooltip.set_bonus.items")
                        .withStyle(ChatFormatting.YELLOW));
                bonus.getItems().forEach(setItem -> {
                    // 检查玩家是否穿戴了该物品
                    boolean isEquipped = CuriosApi.getCuriosInventory(player)
                            .map(handler ->
                                    !handler.findCurios(testStack -> testStack.getItem() == setItem).isEmpty()
                            )
                            .orElse(false);
                    // 根据穿戴状态设置颜色
                    ChatFormatting color = isEquipped ? ChatFormatting.GREEN : ChatFormatting.GRAY;
                    tooltip.add(Component.translatable("tooltip.set_bonus.item_entry",
                                    setItem.getDescription())
                            .withStyle(color));
                });                        tooltip.add(Component.translatable("tooltip.set_bonus.effects")
                        .withStyle(ChatFormatting.YELLOW));

                bonus.getStages().forEach(stage ->
                        tooltip.add(Component.translatable("tooltip.set_bonus.stage_entry",
                                        stage.requiredCount(),
                                        Component.translatable(getStageTranslationKey(stage)))
                                .withStyle(ChatFormatting.BLUE))
                );

                break;
            }
        }
    }

    private static String getStageTranslationKey(SetBonusStage stage) {
        return stage.tooltip();
    }
}
