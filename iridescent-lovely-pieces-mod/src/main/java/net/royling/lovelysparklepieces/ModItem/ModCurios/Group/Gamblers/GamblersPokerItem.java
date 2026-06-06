package net.royling.lovelysparklepieces.ModItem.ModCurios.Group.Gamblers;

import com.google.common.collect.HashMultimap;
import com.google.common.collect.Multimap;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import net.royling.lovelysparklepieces.PlayerData.ChipsData;
import top.theillusivec4.curios.api.SlotContext;

import java.util.List;
import java.util.UUID;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class GamblersPokerItem extends UniversalCurio {
    public GamblersPokerItem(Properties properties) {
        super(properties.stacksTo(1));
    }
    @Override
    public Multimap<Attribute, AttributeModifier> getAttributeModifiers(SlotContext slotContext, UUID id, ItemStack stack) {
        Multimap<Attribute, AttributeModifier> modifiers = HashMultimap.create();
        modifiers.put(Attributes.ATTACK_DAMAGE, new AttributeModifier(id, "gamblers_attack", 2, AttributeModifier.Operation.ADDITION));
        return modifiers;
    }

    @Override
    public void curioTick(SlotContext slotContext, ItemStack stack) {
        if (!(slotContext.entity() instanceof Player player)) return;
        if(player.level().isClientSide)return;
        if (player.getCooldowns().isOnCooldown(ModCurios.GAMBLERS_POKER.get())) return;
        float chance = 0.5f;
        if(player.getPersistentData().contains("lsp_chip_count")){
            if (ChipsData.getChips(player)>5){
                chance = 0.75f;
            }
        }
        if(player.level().random.nextFloat()<chance){
            player.addEffect(new MobEffectInstance(MobEffects.DAMAGE_BOOST,240,0,true,true));
            if (chance >= 0.75f&&!player.getPersistentData().getBoolean("gambler_5effect")) ChipsData.removeChip(player,5);
            player.getCooldowns().addCooldown(ModCurios.GAMBLERS_POKER.get(),600);
        }else {
            player.addEffect(new MobEffectInstance(MobEffects.WEAKNESS,240,0,true,true));
            player.getCooldowns().addCooldown(ModCurios.GAMBLERS_POKER.get(),600);
        }
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level2"));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.gamblers_poker.des1").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.gamblers_poker.des2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.gamblers_poker.des3").withStyle(ChatFormatting.GOLD));
    }
    @Override
    public boolean canEquip(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player){
            return !ModCurios.hasCurio(player,this);
        }
        return true;
    }
}
