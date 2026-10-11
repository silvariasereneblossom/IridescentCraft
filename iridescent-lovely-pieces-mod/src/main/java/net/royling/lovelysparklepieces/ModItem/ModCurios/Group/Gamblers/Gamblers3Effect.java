package net.royling.lovelysparklepieces.ModItem.ModCurios.Group.Gamblers;

import net.minecraft.network.chat.Component;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.player.Player;
import net.royling.lovelysparklepieces.ModItem.ModCurios.Group.Set.SetBonusStage;

public class Gamblers3Effect implements SetBonusStage {
    // IRIDESCENT: was a 2-tick Speed effect re-added EVERY tick - one effect packet plus a movement-speed
    // attribute remove/re-add (and its sync) 20 times a second per wearer. Same pattern as the mod's Night
    // Vision items now: a 3 s effect refreshed once a second.
    private static final int SPEED_DURATION = 60;
    private static final int SPEED_REFRESH = 20;

    public int requiredCount() { return 3; }

    public void onActivated(Player player) {
        player.sendSystemMessage(Component.translatable("set.lsp.gamblers.3effect"));
        applySpeed(player); // straight away, not at the next refresh
    }

    public void onTick(Player player) {
        if (player.tickCount % SPEED_REFRESH == 0) {
            applySpeed(player);
        }
    }

    public void onDeactivated(Player player) {
        player.sendSystemMessage(Component.literal("3件套失效！"));
        // The bonus used to end within 2 ticks of taking a piece off; with the longer effect, end it by
        // hand - but only if what is running is still ours (ambient, particle-less Speed I with at most our
        // duration), never a potion or beacon.
        MobEffectInstance current = player.getEffect(MobEffects.MOVEMENT_SPEED);
        if (current != null && current.isAmbient() && !current.isVisible() && current.getAmplifier() == 0
                && current.getDuration() <= SPEED_DURATION) {
            player.removeEffect(MobEffects.MOVEMENT_SPEED);
        }
    }
    public String tooltip(){
        return "lsp.effect.gamblers.3";
    }

    private static void applySpeed(Player player) {
        player.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SPEED, SPEED_DURATION, 0, true, false));
    }
}
