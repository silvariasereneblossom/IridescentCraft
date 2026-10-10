package net.royling.lovelysparklepieces.ModItem.ModCurios.necklace;

import com.google.common.collect.HashMultimap;
import com.google.common.collect.Multimap;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
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
import java.util.Objects;
import java.util.UUID;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class MoonAmuletItem extends UniversalCurio {
    public MoonAmuletItem(Properties properties) {
        super(properties.stacksTo(1));
    }
    private static final UUID ATTACK_UUID = UUID.fromString("d7f3e2a1-8c4b-4e7a-b9f1-a2c5d8e7f3b4");
    private static final UUID ATTACK_SPEED_UUID = UUID.fromString("e8a4f3b2-9d5c-4f8b-c2a2-b3d6e9f8a4c5");
    private static final UUID ARMOR_UUID = UUID.fromString("f9b5a4c3-ae6d-5a9c-d3b3-c4e7f0a9b5d6");
    private static final UUID SPEED_UUID = UUID.fromString("a0c6b5d4-bf7e-6b0d-e4c4-d5f8a1b0c6e7");

    @Override
    public void curioTick(SlotContext slotContext, ItemStack stack) {
        if (!(slotContext.entity() instanceof Player player)) return;
        if (player.level().isClientSide) return;
        
        if (player.level().isNight()) {
            AttributeInstance attackAttr = player.getAttribute(Attributes.ATTACK_DAMAGE);
            AttributeInstance attackSpeedAttr = player.getAttribute(Attributes.ATTACK_SPEED);
            AttributeInstance speedAttr = player.getAttribute(Attributes.MOVEMENT_SPEED);
            AttributeInstance armorAttr = player.getAttribute(Attributes.ARMOR);
            
            // IRIDESCENT: was remove + re-add every tick (attributes re-dirtied + re-synced 20x/s).
            applyModifier(attackAttr, ATTACK_UUID, "moon_amulet_attack", 0.08, AttributeModifier.Operation.MULTIPLY_BASE);
            applyModifier(attackSpeedAttr, ATTACK_SPEED_UUID, "moon_amulet_attack_speed", 0.08, AttributeModifier.Operation.MULTIPLY_BASE);
            applyModifier(speedAttr, SPEED_UUID, "moon_amulet_speed", 0.02, AttributeModifier.Operation.MULTIPLY_BASE);
            applyModifier(armorAttr, ARMOR_UUID, "moon_amulet_armor", 2, AttributeModifier.Operation.ADDITION);
        } else {
            // Remove modifiers during day
            AttributeInstance attackAttr = player.getAttribute(Attributes.ATTACK_DAMAGE);
            AttributeInstance attackSpeedAttr = player.getAttribute(Attributes.ATTACK_SPEED);
            AttributeInstance speedAttr = player.getAttribute(Attributes.MOVEMENT_SPEED);
            AttributeInstance armorAttr = player.getAttribute(Attributes.ARMOR);
            
            if (attackAttr != null) attackAttr.removeModifier(ATTACK_UUID);
            if (attackSpeedAttr != null) attackSpeedAttr.removeModifier(ATTACK_SPEED_UUID);
            if (speedAttr != null) speedAttr.removeModifier(SPEED_UUID);
            if (armorAttr != null) armorAttr.removeModifier(ARMOR_UUID);
        }
    }

    // IRIDESCENT: leave an existing modifier alone when it already has this amount + operation;
    // otherwise replace it (remove first - re-adding the same UUID throws).
    private static void applyModifier(@Nullable AttributeInstance attr, UUID id, String name, double amount, AttributeModifier.Operation operation) {
        if (attr == null) return;
        AttributeModifier existing = attr.getModifier(id);
        if (existing != null) {
            if (existing.getAmount() == amount && existing.getOperation() == operation) return;
            attr.removeModifier(id);
        }
        attr.addPermanentModifier(new AttributeModifier(id, name, amount, operation));
    }

    @Override
    public void onUnequip(SlotContext slotContext, ItemStack newStack, ItemStack stack) {
        if (slotContext.entity() instanceof Player player) {
            AttributeInstance attackAttr = player.getAttribute(Attributes.ATTACK_DAMAGE);
            AttributeInstance attackSpeedAttr = player.getAttribute(Attributes.ATTACK_SPEED);
            AttributeInstance speedAttr = player.getAttribute(Attributes.MOVEMENT_SPEED);
            AttributeInstance armorAttr = player.getAttribute(Attributes.ARMOR);
            
            if (attackAttr != null) attackAttr.removeModifier(ATTACK_UUID);
            if (attackSpeedAttr != null) attackSpeedAttr.removeModifier(ATTACK_SPEED_UUID);
            if (speedAttr != null) speedAttr.removeModifier(SPEED_UUID);
            if (armorAttr != null) armorAttr.removeModifier(ARMOR_UUID);
        }
    }
    
    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level4"));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.moon_amulet.basic").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.moon_amulet.basic2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.moon_amulet.basic3").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.moon_amulet.basic4").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.moon_amulet.basic5").withStyle(ChatFormatting.GOLD));
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