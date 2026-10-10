package net.royling.lovelysparklepieces.ModItem.ModCurios.boot;

import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModBlock.ModBlocks;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import top.theillusivec4.curios.api.CuriosApi;
import top.theillusivec4.curios.api.SlotContext;

import java.util.List;
import org.jetbrains.annotations.Nullable;
import java.util.UUID;

public class RollerSkatesItem extends UniversalCurio {
    private static final int RADIUS = 3;
    // IRIDESCENT: the item-level work queue is gone. One Item instance serves EVERY wearer, so cells
    // queued around player A were drained against player B's level (another dimension = getBlockState
    // force-loading chunks on the server thread + ice edits at A's coordinates in B's world). Same
    // cadence, no shared state: 10 cells of the 7x7 per tick (full sweep every 5 ticks), always computed
    // from THIS wearer and processed at once in THIS wearer's level; unloaded positions are skipped.
    private static final int SIDE = RADIUS * 2 + 1;
    private static final int CELLS = SIDE * SIDE;
    private static final int CELLS_PER_TICK = 10;
    private static final int SWEEP_TICKS = (CELLS + CELLS_PER_TICK - 1) / CELLS_PER_TICK;

    public RollerSkatesItem(Properties properties) {
        super(properties.stacksTo(1));
    }

    @Override
    public void curioTick(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player && !player.level().isClientSide) {
            Level level = player.level();
            BlockPos below = player.blockPosition().below();
            int start = (player.tickCount % SWEEP_TICKS) * CELLS_PER_TICK;
            int end = Math.min(start + CELLS_PER_TICK, CELLS);
            for (int i = start; i < end; i++) {
                BlockPos pos = below.offset(i / SIDE - RADIUS, 0, i % SIDE - RADIUS);
                if (!level.hasChunkAt(pos)) continue;
                if (level.getBlockState(pos).is(Blocks.ICE)) {
                    level.setBlock(pos, ModBlocks.SOLID_ICE.get().defaultBlockState(), 3);
                    level.scheduleTick(pos, ModBlocks.SOLID_ICE.get(), 100); // 5秒恢复
                }
            }
        }
    }

    @Override
    public boolean canEquip(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player){
            return !ModCurios.hasCurio(player,this);
        }
        return true;
    }
    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level1"));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.icewalk.des").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.icewalk.des1").withStyle(ChatFormatting.GOLD));
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
    }
}
