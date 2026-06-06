package net.royling.lovelysparklepieces.ModItem.ModCurios.Group.Gamblers;

import net.minecraft.network.chat.Component;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.player.Player;
import net.royling.lovelysparklepieces.ModItem.ModCurios.Group.Set.SetBonusStage;

public class Gamblers3Effect implements SetBonusStage {
    public int requiredCount() { return 3; }

    public void onActivated(Player player) {
        player.sendSystemMessage(Component.translatable("set.lsp.gamblers.3effect"));
    }

    public void onTick(Player player) {
        player.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SPEED, 2, 0, true, false));
    }

    public void onDeactivated(Player player) {
        player.sendSystemMessage(Component.literal("3件套失效！"));
    }
    public String tooltip(){
        return "lsp.effect.gamblers.3";
    }
}
