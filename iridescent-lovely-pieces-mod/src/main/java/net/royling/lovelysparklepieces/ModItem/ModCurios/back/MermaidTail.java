package net.royling.lovelysparklepieces.ModItem.ModCurios.back;

import com.google.common.collect.HashMultimap;
import com.google.common.collect.Multimap;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import top.theillusivec4.curios.api.SlotContext;

import org.jetbrains.annotations.Nullable;
import java.util.List;
import java.util.UUID;

public class MermaidTail extends UniversalCurio {
    public MermaidTail(Properties properties) {
        super(properties.stacksTo(1));
    }
    @Override
    public Multimap<Attribute, AttributeModifier> getAttributeModifiers(SlotContext slotContext, UUID id, ItemStack stack) {
        Multimap<Attribute, AttributeModifier> modifiers = HashMultimap.create();
        modifiers.put(Attributes.MOVEMENT_SPEED, new AttributeModifier(id, "mermaid_tail", 1, AttributeModifier.Operation.ADDITION));
        return modifiers;
    }

    @Override
    public void onEquip(SlotContext slotContext, ItemStack prevStack, ItemStack newStack) {
        if (slotContext.entity() instanceof Player player) {
            player.playSound(SoundEvents.FISH_SWIM, 0.8f, 1.2f);
        }
    }
    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level3"));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.mermaid_tail.des").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.mermaid_tail.des2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.mermaid_tail.des3").withStyle(ChatFormatting.GOLD));
    }
}
