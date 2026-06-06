package net.royling.lovelysparklepieces.ModEvents.Legendarys;

import net.minecraft.ChatFormatting;

import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.event.entity.living.LivingDeathEvent;
import net.minecraftforge.event.entity.living.LivingDropsEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModConfigs.LSPConfig;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import top.theillusivec4.curios.api.CuriosApi;
import top.theillusivec4.curios.api.type.capability.ICurio;
import top.theillusivec4.curios.api.type.capability.ICuriosItemHandler;
import top.theillusivec4.curios.api.type.inventory.ICurioStacksHandler;

import java.util.*;

@Mod.EventBusSubscriber(modid = LovelySparklePieces.MODID)
public class NewbieUmbrellaEvent {
    private static final Map<UUID, ItemListHolder> ITEM_CACHE = new HashMap<>();

    @SubscribeEvent
    public static void onPlayerDeath(LivingDeathEvent event){
    if(event.getEntity() instanceof  Player player){
        if(player.level().isClientSide)return;
        if (!ModCurios.hasCurio(player, ModCurios.NEWBIE_UMBRELLA.get())) return;
        ItemStack curioStack = CuriosApi.getCuriosInventory(player).resolve().flatMap(
                    curiosInventory -> curiosInventory.findFirstCurio(ModCurios.NEWBIE_UMBRELLA.get())).map(slotResult -> slotResult.stack()).orElse(ItemStack.EMPTY);
            curioStack.setDamageValue(curioStack.getDamageValue()+1);
            if(curioStack.getDamageValue()>=curioStack.getMaxDamage()){
                curioStack.shrink(1);
            }
            ItemListHolder cache = new ItemListHolder();
            cache.mainInventory.addAll(player.getInventory().items);
            cache.armorInventory.addAll(player.getInventory().armor);
            cache.offhandInventory.addAll(player.getInventory().offhand);
            CuriosApi.getCuriosInventory(player).ifPresent(handler -> {
                handler.getCurios().forEach((id, slot) -> {
                    List<ItemStack> slotItems = new ArrayList<>();
                    for (int i = 0; i < slot.getSlots(); i++) {
                        slotItems.add(slot.getStacks().getStackInSlot(i));
                }
                    cache.curiosSlots.put(id, slotItems);
                });
            });
            ITEM_CACHE.put(player.getUUID(),cache);
        sendInsultMessage((ServerPlayer) player);
        }
    }

    @SubscribeEvent
    public static void onPlayerDrops(LivingDropsEvent event) {
        if (event.getEntity() instanceof Player player) {
            if (ITEM_CACHE.containsKey(player.getUUID())) {
                // 清空所有掉落物
                event.getDrops().clear();
                // 清空玩家背包（避免原版逻辑生成掉落）
                //player.getInventory().clearContent();
            }
        }
    }
    @SubscribeEvent
    public static void onPlayerRespawn(PlayerEvent.PlayerRespawnEvent event) {
        Player player = event.getEntity();
        ItemListHolder cache = ITEM_CACHE.remove(player.getUUID());
        if (cache != null) {
            // 恢复主背包
            for (int i = 0; i < cache.mainInventory.size(); i++) {
                player.getInventory().items.set(i, cache.mainInventory.get(i));
            }
            // 恢复护甲
            for (int i = 0; i < cache.armorInventory.size(); i++) {
                player.getInventory().armor.set(i, cache.armorInventory.get(i));
            }
            // 恢复副手
            for (int i = 0; i < cache.offhandInventory.size(); i++) {
                player.getInventory().offhand.set(i, cache.offhandInventory.get(i));
            }
            // 恢复Curios物品
            CuriosApi.getCuriosInventory(player).ifPresent(handler -> {
                cache.curiosSlots.forEach((slotId, items) -> {
                    ICurioStacksHandler slot = handler.getCurios().get(slotId);
                    if (slot != null) {
                        for (int i = 0; i < items.size(); i++) {
                            slot.getStacks().setStackInSlot(i, items.get(i));
                        }
                    }
                });
            });
        }
    }

    private static class ItemListHolder {
        List<ItemStack> mainInventory = new ArrayList<>();
        List<ItemStack> armorInventory = new ArrayList<>();
        List<ItemStack> offhandInventory = new ArrayList<>();
        Map<String, List<ItemStack>> curiosSlots = new HashMap<>();
    }

    private static void sendInsultMessage(ServerPlayer player) {
        List<? extends String> messages = LSPConfig.INSULT_MESSAGES.get();
        Component message = messages.isEmpty() ?
                createDefaultMessage() :
                createRandomMessage(messages, player.level().getRandom());
        player.sendSystemMessage(message, false);
    }
    private static Component createDefaultMessage() {
        return Component.translatable("lsp.newbie.newbie").withStyle(ChatFormatting.AQUA);
    }
    private static Component createRandomMessage(List<? extends String> messages, RandomSource random) {
        String rawMessage = messages.get(random.nextInt(messages.size()));
        return rawMessage.startsWith("text:") ?
                Component.literal(rawMessage.substring(5)).withStyle(ChatFormatting.AQUA) :
                Component.translatable(rawMessage).withStyle(ChatFormatting.AQUA);
    }
}
