package net.royling.lovelysparklepieces.ModEvents.Legendarys;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.event.entity.living.*;
import net.minecraftforge.event.entity.player.PlayerSleepInBedEvent;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.PlayerData.SoulData;
import top.theillusivec4.curios.api.CuriosApi;

public class BCEvents {
    public static boolean hasBlasphemousContract(Player player) {
        return CuriosApi.getCuriosInventory(player).resolve()
                .flatMap(inventory -> inventory.findFirstCurio(ModCurios.BLASPHEMOUS_CONTRACT.get()))
                .isPresent();
    }
    @SubscribeEvent
    public static void onLivingDrops(LivingDropsEvent event) {
        if (event.getEntity().level().isClientSide) return;

        if (event.getSource().getEntity() instanceof Player player && hasBlasphemousContract(player)) {
            for (ItemEntity drop : event.getDrops()) {
                drop.getItem().setCount(drop.getItem().getCount() * 2);
            }
        }
    }
    @SubscribeEvent
    public static void onExperienceDrop(LivingExperienceDropEvent event) {
        if (!event.getEntity().level().isClientSide) {
            Player player = event.getAttackingPlayer();
            if (player != null && hasBlasphemousContract(player)) {
                event.setDroppedExperience(event.getDroppedExperience() * 2);
            }
        }
    }
    @SubscribeEvent
    public static void onPostDamage(LivingDamageEvent event) {
        if (event.getSource().getEntity() instanceof Player player && hasBlasphemousContract(player)) {
            if (player.level().random.nextFloat() < 0.25f) {
                player.heal(4);
            }
        }
    }
    @SubscribeEvent
    public static void onHeal(LivingHealEvent event) {
        if (event.getEntity() instanceof Player player && hasBlasphemousContract(player)) {
            event.setAmount(event.getAmount() * 0.25f);
            if (player instanceof ServerPlayer serverPlayer) {
                serverPlayer.displayClientMessage(Component.translatable("msg.lsp.heal_deal").withStyle(ChatFormatting.DARK_RED), true);
            }
        }
    }
    @SubscribeEvent
    public static void onTrySleep(PlayerSleepInBedEvent event) {
        // Note: PlayerSleepInBedEvent in 1.20.1 works differently
        Player player = event.getEntity();
        if(hasBlasphemousContract(player)) {
            event.setResult(Player.BedSleepingProblem.NOT_POSSIBLE_HERE);
            if (player instanceof ServerPlayer serverPlayer) {
                serverPlayer.displayClientMessage(Component.translatable("msg.lsp.cant_sleep").withStyle(ChatFormatting.DARK_RED), true);
            }
        }
    }
    @SubscribeEvent
    public static void onEntityKilled(LivingDeathEvent event) {
        if (event.getSource().getEntity() instanceof Player player && hasBlasphemousContract(player)) {
            SoulData.addSoul(player,1);
        }
    }
}
