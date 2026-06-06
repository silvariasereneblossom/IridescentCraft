package net.royling.lovelysparklepieces.ModItem.ModCurios.Rings;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.SimpleMenuProvider;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import top.theillusivec4.curios.api.CuriosApi;
import top.theillusivec4.curios.api.type.capability.ICurio;
import top.theillusivec4.curios.api.SlotContext;
import top.theillusivec4.curios.api.type.capability.ICurioItem;

import java.util.List;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class EnderRingItem extends UniversalCurio {
    public EnderRingItem(Properties properties) {
        super(properties.stacksTo(1));
    }
    public static void openEnderChest(ServerPlayer player) {
        if (hasRing(player)||hasBC(player)) {
            player.openMenu(new SimpleMenuProvider(
                    (id, inv, p) -> ChestMenu.threeRows(id, inv, p.getEnderChestInventory()),
                    Component.translatable("container.enderchest")
            ));
        }
    }
    private static boolean hasRing(Player player) {
        return CuriosApi.getCuriosInventory(player).resolve().flatMap(inv->inv.findFirstCurio(ModCurios.ENDER_RING.get())).isPresent();
    }
    private static boolean hasBC(Player player) {
        return CuriosApi.getCuriosInventory(player).resolve().flatMap(inv->inv.findFirstCurio(ModCurios.BLASPHEMOUS_CONTRACT.get())).isPresent();
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level4"));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.ender_ring.basic").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.ender_ring.des2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.ender_ring.des3").withStyle(ChatFormatting.GOLD));
    }
    @Override
    public boolean canEquip(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player){
            return !ModCurios.hasCurio(player,this);
        }
        return true;
    }
}
