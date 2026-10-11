package net.royling.lovelysparklepieces.ModEvents.boot;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.protocol.game.ClientboundSetEntityMotionPacket;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.event.TickEvent;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;

import java.util.Set;

public class DoubleJumpEvent {
    public static final String PENDING = "lsp_double_jump";
    public static final String USED = "has_lsp_double_jump";
    /** Vanilla player jump velocity; what the 1.21 {@code generic.jump_strength} attribute defaults to for players. */
    private static final double BASE_JUMP = 0.42D;

    /** The three boots that grant a double jump. Reads the shared per-tick curio snapshot (works on both sides). */
    public static boolean hasDoubleJumpBoots(Player player){
        Set<Item> worn = ModCurios.wornThisTick(player);
        return worn.contains(ModCurios.CAT_BOOT.get())
                || worn.contains(ModCurios.JUMPING_FOOTWEAR.get())
                || worn.contains(ModCurios.SKY_BEAST_SHOES.get());
    }

    // IRIDESCENT: was 3 full curio scans + 2 NBT writes for every player on every tick, boots or not.
    // Now: two flag reads; NBT is written only when a flag actually changes; the curios are looked at only
    // on the one tick a jump is pending.
    @SubscribeEvent
    public static void DoubleJump(TickEvent.PlayerTickEvent event){
        if(event.phase != TickEvent.Phase.START) return;
        Player player = event.player;
        if (player.level().isClientSide) return;
        CompoundTag data = player.getPersistentData();
        boolean pending = data.getBoolean(PENDING);
        boolean used = data.getBoolean(USED);
        if(player.onGround()){
            if(pending) data.putBoolean(PENDING,false);
            if(used) data.putBoolean(USED,false);
            return;
        }
        if(!pending || used) return;
        if(!hasDoubleJumpBoots(player)){
            // a request without the boots is dropped, not kept (and re-checked) until landing
            data.putBoolean(PENDING,false);
            return;
        }
        // IRIDESCENT: upstream read Attributes.JUMP_STRENGTH through Objects.requireNonNull. On 1.20.1 that
        // attribute is horse.jump_strength and players do not have it, so the first double jump threw out of
        // the player tick (a kick on a server, a crash in singleplayer). Use it only if some mod has given
        // it to players; otherwise the vanilla jump velocity.
        AttributeInstance jumpAttribute = player.getAttribute(Attributes.JUMP_STRENGTH);
        double jumpStr = jumpAttribute != null ? jumpAttribute.getValue() : BASE_JUMP;
        int jumpLevel = 0;
        MobEffectInstance jumpBoost = player.getEffect(MobEffects.JUMP);
        if(jumpBoost != null)
            jumpLevel = jumpBoost.getAmplifier()+1;
        double newJump = jumpStr + (0.1*jumpLevel);
        player.setDeltaMovement(player.getDeltaMovement().x,newJump,player.getDeltaMovement().z);
        if(player instanceof ServerPlayer serverPlayer){
            serverPlayer.connection.send(
                    new ClientboundSetEntityMotionPacket(serverPlayer)
            );
        }
        data.putBoolean(USED,true);
    }
}
