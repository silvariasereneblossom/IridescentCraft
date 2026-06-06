package net.royling.lovelysparklepieces.ModItem.ModCurios.Rings;

import com.google.common.collect.HashMultimap;
import com.google.common.collect.Multimap;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModAttributes.ModAttribute;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import top.theillusivec4.curios.api.SlotContext;
import top.theillusivec4.curios.api.type.capability.ICurio;
import top.theillusivec4.curios.api.type.capability.ICurioItem;

import java.util.List;
import java.util.UUID;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class CritRingItem extends UniversalCurio {
    private static final UUID CRIT_UUID = UUID.fromString("e6b3f7e2-5c4d-4b8a-9f3a-2d1c0e5f8a7b");
    
    public CritRingItem(Properties properties) {
        super(properties.stacksTo(1));
    }

    @Override
    public Multimap<Attribute, AttributeModifier> getAttributeModifiers(SlotContext slotContext, UUID id, ItemStack stack) {
        Multimap<Attribute,AttributeModifier> modifiers = HashMultimap.create();
        modifiers.put(ModAttribute.CRIT_CHANCE.get(), new AttributeModifier(id, "crit_ring", 0.08, AttributeModifier.Operation.ADDITION));
        return modifiers;
    }
    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level2"));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.crit_ring.basic").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.crit_ring.basic2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.crit_ring.basic3").withStyle(ChatFormatting.GOLD));
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
