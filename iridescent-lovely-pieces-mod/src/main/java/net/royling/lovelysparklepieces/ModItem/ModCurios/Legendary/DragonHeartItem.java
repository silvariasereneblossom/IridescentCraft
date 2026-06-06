package net.royling.lovelysparklepieces.ModItem.ModCurios.Legendary;

import com.google.common.collect.HashMultimap;
import com.google.common.collect.Multimap;
import net.minecraft.world.entity.ai.attributes.Attribute;
import java.util.UUID;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Rarity;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModAttributes.ModAttribute;
import net.royling.lovelysparklepieces.ModEvents.Legendarys.BCEvents;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import top.theillusivec4.curios.api.CuriosApi;
import top.theillusivec4.curios.api.type.capability.ICurio;
import top.theillusivec4.curios.api.SlotContext;
import top.theillusivec4.curios.api.type.capability.ICurioItem;

public class DragonHeartItem extends UniversalCurio {
    public DragonHeartItem(Properties properties) {
        super(properties.stacksTo(1).rarity(Rarity.EPIC));
    }
    @Override
    public Multimap<Attribute, AttributeModifier> getAttributeModifiers(SlotContext slotContext, UUID id, ItemStack stack) {
        Multimap<Attribute, AttributeModifier> modifiers = HashMultimap.create();
        modifiers.put(Attributes.MAX_HEALTH, new AttributeModifier(id, "Dragon Heart Health", 8, AttributeModifier.Operation.ADDITION));
        modifiers.put(Attributes.ATTACK_DAMAGE, new AttributeModifier(id, "Dragon Heart Attack", 4, AttributeModifier.Operation.ADDITION));
        modifiers.put(ModAttribute.CRIT_CHANCE.get(), new AttributeModifier(id, "Dragon Heart Crit", 0.15, AttributeModifier.Operation.ADDITION));
        return modifiers;
    }

    @Override
    public boolean canEquip(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player){
            return !ModCurios.hasCurio(player,this);
        }
        return true;
    }
    @Override
    public void curioTick(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player){
            if(!BCEvents.hasBlasphemousContract(player)){
                CuriosApi.getCuriosInventory(player).ifPresent(curios->{
                    curios.getStacksHandler(slotContext.identifier()).ifPresent(handler->{
                        handler.getStacks().setStackInSlot(slotContext.index(),ItemStack.EMPTY)
                        ;        player.level().addFreshEntity(new ItemEntity(
                                player.level(),
                                player.getX(),
                                player.getY() + 0.5, // 避免卡在方块内
                                player.getZ(),
                                stack.copy()));
                    });
                });
            }
        }
    }
}
