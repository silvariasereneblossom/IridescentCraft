package net.royling.lovelysparklepieces.ModEvents.Gamblers;

import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.event.entity.living.LivingDeathEvent;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.PlayerData.ChipsData;
import net.royling.lovelysparklepieces.PlayerData.SoulData;
import top.theillusivec4.curios.api.CuriosApi;

public class GamblersEvents {
    @SubscribeEvent
    public static void onEntityKilled(LivingDeathEvent event) {
        if (event.getSource().getEntity() instanceof Player player && ModCurios.hasCurio(player,ModCurios.GAMBLERS_DICE.get())) {
            int count = player.level().random.nextInt(6) + 1;
            double lucky = player.getAttribute(Attributes.LUCK).getValue();
            int integerPart = (int) Math.floor(lucky);
            double fractionalPart = lucky - integerPart;
            int result = count + integerPart;
            if (fractionalPart > 0) {
                if (player.level().random.nextDouble() < fractionalPart) {
                    result++;
                }
            }
            ChipsData.addChip(player,result);
        }
    }
}
