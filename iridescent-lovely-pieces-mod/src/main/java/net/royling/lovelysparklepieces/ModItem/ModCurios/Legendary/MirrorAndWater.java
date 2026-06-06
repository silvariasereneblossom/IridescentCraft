package net.royling.lovelysparklepieces.ModItem.ModCurios.Legendary;

import com.google.common.collect.HashMultimap;
import com.google.common.collect.Multimap;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.TooltipFlag;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModAttributes.ModAttribute;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import top.theillusivec4.curios.api.SlotContext;

import java.util.List;
import java.util.UUID;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class MirrorAndWater extends UniversalCurio {
    public MirrorAndWater(Properties properties) {
        super(properties.stacksTo(1).rarity(Rarity.EPIC));
    }

    @Override
    public Multimap<Attribute, AttributeModifier> getAttributeModifiers(SlotContext slotContext, UUID id, ItemStack stack) {
        Multimap<Attribute, AttributeModifier> modifiers = HashMultimap.create();
        modifiers.put(Attributes.MOVEMENT_SPEED, new AttributeModifier(id, "Mirror Speed", 0.000000000001, AttributeModifier.Operation.ADDITION));
        modifiers.put(ModAttribute.DAMAGE_MODIFIER.get(), new AttributeModifier(id, "Mirror Attack", -0.000000000001, AttributeModifier.Operation.ADDITION));
        modifiers.put(Attributes.ARMOR, new AttributeModifier(id, "Mirror Armor", -0.000000000001, AttributeModifier.Operation.MULTIPLY_TOTAL));
        return modifiers;
    }
    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level12"));
        if(!Screen.hasShiftDown()){
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.desx").withStyle(ChatFormatting.DARK_RED));
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.des2x").withStyle(ChatFormatting.DARK_RED));
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.press shift").withStyle(ChatFormatting.DARK_PURPLE));
        }
        else {
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.rewardx").withStyle(ChatFormatting.GOLD));
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.reward1x").withStyle(ChatFormatting.DARK_GREEN));
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.reward2x").withStyle(ChatFormatting.DARK_GREEN));
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.reward3x").withStyle(ChatFormatting.DARK_GREEN));
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.reward4x").withStyle(ChatFormatting.DARK_GREEN));
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.reward5x").withStyle(ChatFormatting.DARK_GREEN));
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.reward6x").withStyle(ChatFormatting.DARK_GREEN));
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.reward7x").withStyle(ChatFormatting.DARK_GREEN));
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.punishx").withStyle(ChatFormatting.GOLD));
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.punish1x").withStyle(ChatFormatting.DARK_RED));
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.punish2x").withStyle(ChatFormatting.DARK_RED));
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.punish3x").withStyle(ChatFormatting.DARK_RED));
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.punish4x").withStyle(ChatFormatting.DARK_RED));
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.punish5x").withStyle(ChatFormatting.DARK_RED));
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.punish6x").withStyle(ChatFormatting.DARK_RED));
            tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.bs.punish7x").withStyle(ChatFormatting.DARK_RED));
        }
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
    }

    @Override
    public boolean canUnequip(SlotContext slotContext, ItemStack stack) {
        return true;
    }
    @Override
    public boolean canEquip(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player){
            return !ModCurios.hasCurio(player,this);
        }
        return true;
    }
}
