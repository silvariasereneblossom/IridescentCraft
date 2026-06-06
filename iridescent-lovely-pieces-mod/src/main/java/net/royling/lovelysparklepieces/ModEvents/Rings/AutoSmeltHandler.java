package net.royling.lovelysparklepieces.ModEvents.Rings;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.SimpleContainer;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.crafting.*;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.event.level.BlockEvent;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import top.theillusivec4.curios.api.CuriosApi;
import top.theillusivec4.curios.api.type.capability.ICurio;

import java.util.*;

@Mod.EventBusSubscriber(modid = LovelySparklePieces.MODID)
public class AutoSmeltHandler {
    private static final Map<Item, Item> SMELTING_CACHE = new HashMap<>();

    @SubscribeEvent
    public static void onBlockBreak(BlockEvent.BreakEvent event) {
        if (!event.getPlayer().level().isClientSide() && !event.isCanceled()) {
            Level level = event.getPlayer().level();
            Player player = event.getPlayer();
            BlockPos pos = event.getPos();
            BlockState state = event.getState();
            if (!player.isCreative()) {
                if (event.getPlayer() != null) {
                    boolean hasRing = ModCurios.hasCurio(event.getPlayer(), ModCurios.INFERNO_RING.get());
                    if (hasRing) {
                        List<ItemStack> drops = Block.getDrops(state, (ServerLevel) level, pos, null
                                , event.getPlayer(), event.getPlayer().getMainHandItem());
                        List<ItemStack> smeltedDrops = new ArrayList<>();
                        float totalExp = 0;
                        boolean smeltedAnything = false;
                        int smeltCount = 0;
                        for (ItemStack drop : drops) {
                            Optional<SmeltingRecipe> recipeRecipeHolder = level.getRecipeManager().getRecipeFor(RecipeType.SMELTING, new SimpleContainer(drop), level);
                            if (recipeRecipeHolder.isPresent()) {
                                ItemStack smeltedR = recipeRecipeHolder.get().assemble(new SimpleContainer(drop), level.registryAccess());
                                totalExp += recipeRecipeHolder.get().getExperience();
                                if (!smeltedR.isEmpty()) {
                                    smeltedR.setCount(drop.getCount());
                                    smeltedDrops.add(smeltedR);
                                    smeltCount += drop.getCount();
                                }
                                smeltedAnything = true;
                            } else {
                                smeltedDrops.add(drop);
                            }
                        }
                        if (smeltedAnything) {
                            event.setCanceled(true);
                            ItemStack heldItem = player.getMainHandItem(); // 假设玩家用主手工具挖掘
                            if (heldItem.isDamageableItem()) {
                                // 消耗1点耐久，并处理工具损坏
                                heldItem.hurtAndBreak(1, player, (p) -> p.broadcastBreakEvent(EquipmentSlot.MAINHAND));
                                level.removeBlock(pos, false);
                                for (ItemStack smeltedDrop : smeltedDrops) {
                                    ItemEntity itemEntity = new ItemEntity(level, pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, smeltedDrop);
                                    itemEntity.setDefaultPickUpDelay(); // 设置默认拾取延迟
                                    level.addFreshEntity(itemEntity);
                                    ItemStack curioStack = CuriosApi.getCuriosInventory(player).resolve().flatMap(
                                            curiosInventory -> curiosInventory.findFirstCurio(ModCurios.INFERNO_RING.get())).map(curio -> curio.stack()).orElse(ItemStack.EMPTY);
                                    curioStack.hurtAndBreak(smeltCount, player, (p) -> {});
                                }
                                if (totalExp > 0) {
                                    ExperienceOrb experienceOrb = new ExperienceOrb(level, pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, (int) totalExp);
                                    level.addFreshEntity(experienceOrb);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
