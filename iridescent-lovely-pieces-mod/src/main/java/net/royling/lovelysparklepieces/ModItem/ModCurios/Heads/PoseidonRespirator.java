package net.royling.lovelysparklepieces.ModItem.ModCurios.Heads;

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
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModAttributes.ModAttribute;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import org.jetbrains.annotations.NotNull;
import top.theillusivec4.curios.api.SlotContext;
import top.theillusivec4.curios.api.type.capability.ICurio;

import java.util.List;
import java.util.UUID;
import org.jetbrains.annotations.Nullable;

public class PoseidonRespirator extends UniversalCurio {
    public PoseidonRespirator(Properties properties) {
        super(properties.stacksTo(1).rarity(Rarity.RARE));
    }
    @Override
    public void curioTick(SlotContext slotContext, ItemStack stack) {
        LivingEntity entity = slotContext.entity();
        if (!entity.level().isClientSide && entity instanceof Player player) {
            player.setAirSupply(player.getMaxAirSupply());
            if (player.tickCount % 10 == 0) {
                spawnWaterParticles(player);
            }
        }
    }
    private void spawnWaterParticles(Player player) {
        Level level = player.level();
        RandomSource random = player.getRandom();
        for(int i = 0; i < 5; i++) {
            level.addParticle(ParticleTypes.BUBBLE,
                    player.getX() + (random.nextDouble() - 0.5) * 1.5,
                    player.getY() + random.nextDouble(),
                    player.getZ() + (random.nextDouble() - 0.5) * 1.5,
                    0, 0.1, 0);
        }
    }

    @Override
    public Multimap<Attribute, AttributeModifier> getAttributeModifiers(SlotContext slotContext, UUID id, ItemStack stack) {
        Multimap<Attribute, AttributeModifier> modifiers = HashMultimap.create();
        modifiers.put(Attributes.MOVEMENT_SPEED, new AttributeModifier(id, "poseidon_respirator", 0.48, AttributeModifier.Operation.ADDITION));
        return modifiers;
    }

    @Override
    public void onEquip(SlotContext slotContext, ItemStack prevStack, ItemStack newStack) {
        if (slotContext.entity() instanceof Player player) {
            player.playSound(SoundEvents.BUCKET_FILL, 0.8f, 1.2f);
        }
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level8"));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.poseidon.des").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.poseidon.des1").withStyle(ChatFormatting.GOLD));
    }
}
