package net.royling.lovelysparklepieces.ModItem.ModCurios.boot;

import com.google.common.collect.HashMultimap;
import com.google.common.collect.Multimap;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
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
import java.util.UUID;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class BladeBootItem extends UniversalCurio {
    private static final UUID BLADE_UUID = UUID.fromString("a7c4d3f2-9b5e-4a8c-b1d2-e6f8c9a7b5d3");
    
    public BladeBootItem(Properties properties) {
        super(properties.stacksTo(1));
    }
    @Override
    public Multimap<Attribute, AttributeModifier> getAttributeModifiers(SlotContext slotContext, UUID id, ItemStack stack) {
        Multimap<Attribute,AttributeModifier> modifiers = HashMultimap.create();
        modifiers.put(Attributes.ATTACK_DAMAGE, new AttributeModifier(id, "blade_boot_attack", 2, AttributeModifier.Operation.ADDITION));
        return modifiers;
    }
    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level1"));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.blade_boot.basic").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.blade_boot.basic2").withStyle(ChatFormatting.GOLD));
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
