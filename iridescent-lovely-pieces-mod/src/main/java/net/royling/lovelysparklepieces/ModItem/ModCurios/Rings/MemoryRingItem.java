package net.royling.lovelysparklepieces.ModItem.ModCurios.Rings;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import java.util.UUID;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import top.theillusivec4.curios.api.SlotContext;
import top.theillusivec4.curios.api.type.capability.ICurio;
import top.theillusivec4.curios.api.type.capability.ICurioItem;

import java.util.List;
import java.util.Objects;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class MemoryRingItem extends UniversalCurio {
    private static final UUID ATTID = UUID.fromString("f9e2b7c4-8a5d-4f1e-9c3b-7e2a1d5f8c9a"); // Unique UUID for memory ring

    public MemoryRingItem(Properties properties) {
        super(properties.stacksTo(1));
    }
    public float getMemory(Player player){
        double lsp_memory = player.getPersistentData().getDouble("lsp_memory");
        if (lsp_memory <= 1.0) {
            return 1.0f;
        } else if (lsp_memory <= 6.0) {
            return (float) (1.0 - (lsp_memory - 1.0) * 0.2);
        } else if (lsp_memory <= 12.0) {
            return (float) (-(lsp_memory - 6.0) / 6.0);
        } else {
            return -1.0f;
        }
    }
    public float calculateMemoryBonus(double lsp_memory){
        if (lsp_memory <= 1.0) {
            return 1.0f;
        } else if (lsp_memory <= 6.0) {
            return (float) (1.0 - (lsp_memory - 1.0) * 0.2);
        } else if (lsp_memory <= 12.0) {
            return (float) (-(lsp_memory - 6.0) / 6.0);
        } else {
            return -1.0f;
        }
    }
    public float curMem(){
        Runtime runtime = Runtime.getRuntime();
        return (float) runtime.maxMemory() /1024/1024;
    }

    @Override
    public void curioTick(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity()instanceof Player player) {
            if (player.level().isClientSide) return;
            AttributeModifier newModifier = new AttributeModifier(ATTID, "Memory Ring Attack Bonus", getMemory(player), AttributeModifier.Operation.MULTIPLY_TOTAL);
            AttributeInstance attr = player.getAttribute(Attributes.ATTACK_DAMAGE);
            if (attr != null) {
                attr.removeModifier(ATTID);
                attr.addPermanentModifier(newModifier);
            }
        }
    }
    @Override
    public void onEquip(SlotContext slotContext, ItemStack prevStack, ItemStack stack) {
        if(slotContext.entity()instanceof Player player){
            AttributeInstance attr = player.getAttribute(Attributes.ATTACK_DAMAGE);
            if (attr != null) {
                if(attr.getModifier(ATTID)==null){
                    attr.addPermanentModifier(new AttributeModifier(ATTID, "Memory Ring Attack Bonus", getMemory(player), AttributeModifier.Operation.MULTIPLY_TOTAL));
                }
            }
        }
    }

    @Override
    public void onUnequip(SlotContext slotContext, ItemStack newStack, ItemStack stack) {
        if(slotContext.entity()instanceof Player player){
            AttributeInstance attr = player.getAttribute(Attributes.ATTACK_DAMAGE);
            if (attr != null) {
                attr.removeModifier(ATTID);
            }
        }
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level6"));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.lsp_memory_ring.basic").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.lsp_memory_ring.basic2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.lsp_memory_ring.basic3",curMem()).withStyle(ChatFormatting.GOLD));
        double maxMemoryGB = Runtime.getRuntime().maxMemory() / 1024.0 / 1024 / 1024;
        float bonus = calculateMemoryBonus(maxMemoryGB);
        tooltipComponents.add(Component.translatable(
                "tooltip.lovely_sparkle_pieces.lsp_memory_ring.bonus",
                String.format("%.2f%%", bonus * 100)
        ).withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable(
                "tooltip.lovely_sparkle_pieces.lsp_memory_ring.des"
        ).withStyle(ChatFormatting.GOLD));
        super.appendHoverText(stack,level,tooltipComponents,tooltipFlag);
    }
    @Override
    public boolean canEquip(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player){
            return !ModCurios.hasCurio(player,this);
        }
        return true;
    }
}
