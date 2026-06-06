package net.royling.lovelysparklepieces.ModItem.ModCurios.belt;

import com.google.common.collect.HashMultimap;
import net.minecraft.ChatFormatting;
import com.google.common.collect.Multimap;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModAttributes.ModAttribute;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import top.theillusivec4.curios.api.SlotContext;

import java.util.List;
import java.util.Objects;
import java.util.UUID;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class AdventurersBelt extends UniversalCurio {
    private static final UUID DAMAGE_MODIFY_UUID = UUID.fromString("a1d7f5e3-2c4e-4b9a-8f3c-d2e1b7a5c9f8");
    private static final UUID BASE_ATTACK_UUID = UUID.fromString("b2e8a6f4-3d5f-5c0b-9a4d-e3f2c8b6d0a9");

    public AdventurersBelt(Properties properties) {
        super(properties.stacksTo(1));
    }
    @Override
    public Multimap<Attribute, AttributeModifier> getAttributeModifiers(SlotContext slotContext, UUID id, ItemStack stack) {
        Multimap<Attribute,AttributeModifier> modifiers = HashMultimap.create();
        modifiers.put(ModAttribute.DAMAGE_MODIFIER.get(), new AttributeModifier(id, "adventure_base_attack", 0.05, AttributeModifier.Operation.ADDITION));
        return modifiers;
    }

    @Override
    public void onEquip(SlotContext slotContext, ItemStack prevStack, ItemStack stack) {
        if(!(slotContext.entity() instanceof Player player))return;
        if(player.level().isClientSide)return;
        BlockPos pos = player.blockPosition();
        int distance = Math.abs(pos.getX())+Math.abs(pos.getZ());
        double bonus = Math.min(distance/10000.0,1)*0.25;
        AttributeModifier newModifier = new AttributeModifier(DAMAGE_MODIFY_UUID, "adventurer_damage", bonus, AttributeModifier.Operation.ADDITION);
        AttributeInstance attr = player.getAttribute(ModAttribute.DAMAGE_MODIFIER.get());
        if (attr != null) {
            attr.removeModifier(DAMAGE_MODIFY_UUID);
            attr.addTransientModifier(newModifier); // IRIDESCENT FIX: permanent persists to NBT and strands the modifier if unequip is missed; transient + reapply-on-tick is equivalent and self-cleaning
        }
    }

    @Override
    public void curioTick(SlotContext slotContext, ItemStack stack) {
        if(!(slotContext.entity() instanceof Player player))return;
        if(player.level().isClientSide)return;
        if(player.tickCount%200!=0)return;
        BlockPos pos = player.blockPosition();
        int distance = Math.abs(pos.getX())+Math.abs(pos.getZ());
        double bonus = Math.min(distance/10000.0,1)*0.25;
        AttributeModifier newModifier = new AttributeModifier(DAMAGE_MODIFY_UUID, "adventurer_damage", bonus, AttributeModifier.Operation.ADDITION);
        AttributeInstance attr = player.getAttribute(ModAttribute.DAMAGE_MODIFIER.get());
        if (attr != null) {
            attr.removeModifier(DAMAGE_MODIFY_UUID);
            attr.addTransientModifier(newModifier); // IRIDESCENT FIX: permanent persists to NBT and strands the modifier if unequip is missed; transient + reapply-on-tick is equivalent and self-cleaning
        }
    }

    @Override
    public void onUnequip(SlotContext slotContext, ItemStack newStack, ItemStack stack) {
        if (slotContext.entity() instanceof ServerPlayer player) {
            AttributeInstance attr = player.getAttribute(ModAttribute.DAMAGE_MODIFIER.get());
            if (attr != null) attr.removeModifier(DAMAGE_MODIFY_UUID);
        }
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        Player player = Minecraft.getInstance().player;
        BlockPos pos = null;
        if (player != null) pos = player.blockPosition();
        int distance = 0;
        if (pos != null) distance = Math.abs(pos.getX())+Math.abs(pos.getZ());
        double bonus = Math.min(distance/10000.0,1)*0.25;
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.adventurer.des").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.adventurer.des2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.adventurer_add",(float)bonus*100).withStyle(ChatFormatting.GOLD));
    }
}
