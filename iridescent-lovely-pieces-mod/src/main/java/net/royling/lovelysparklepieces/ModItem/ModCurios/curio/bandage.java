package net.royling.lovelysparklepieces.ModItem.ModCurios.curio;

import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import top.theillusivec4.curios.api.SlotContext;

public class bandage extends UniversalCurio {
    public bandage(Properties properties) {
        super(properties.stacksTo(1));
    }

    @Override
    public boolean canEquip(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player){
            return !ModCurios.hasCurio(player,this);
        }
        return true;
    }
}
