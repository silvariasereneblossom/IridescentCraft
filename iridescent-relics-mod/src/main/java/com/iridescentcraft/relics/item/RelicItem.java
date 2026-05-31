package com.iridescentcraft.relics.item;

import com.google.common.collect.ArrayListMultimap;
import com.google.common.collect.Multimap;
import com.iridescentcraft.relics.IridescentRelics;
import com.iridescentcraft.relics.RelicSpec;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;
import net.minecraftforge.registries.ForgeRegistries;
import top.theillusivec4.curios.api.SlotContext;
import top.theillusivec4.curios.api.type.capability.ICurioItem;

import java.util.List;
import java.util.UUID;

/**
 * A worn relic. Implements Curios' {@link ICurioItem} -- Curios auto-attaches the curio
 * capability to any item that is instanceof ICurioItem, and applies the spec's attribute
 * modifiers while equipped. The slot is assigned by the curios:&lt;slot&gt; item tag
 * (see data/curios/tags/items/charm.json).
 */
public class RelicItem extends Item implements ICurioItem {

    private final RelicSpec spec;

    public RelicItem(Properties properties, RelicSpec spec) {
        super(properties);
        this.spec = spec;
    }

    public RelicSpec getSpec() {
        return spec;
    }

    @Override
    public Multimap<Attribute, AttributeModifier> getAttributeModifiers(SlotContext slotContext, UUID uuid, ItemStack stack) {
        ArrayListMultimap<Attribute, AttributeModifier> result = ArrayListMultimap.create();
        for (RelicSpec.AttrMod m : spec.modifiers) {
            Attribute attr = ForgeRegistries.ATTRIBUTES.getValue(m.attribute());
            if (attr == null) {
                continue; // soft dep (e.g. ISS spell_power) not loaded -> skip that line
            }
            result.put(attr, new AttributeModifier(
                m.uuid(),
                IridescentRelics.MODID + ":" + spec.id + "/" + m.attribute().getPath(),
                m.amount(),
                m.op()
            ));
        }
        return result;
    }

    @Override
    public void appendHoverText(ItemStack stack, Level level, List<Component> tooltip, TooltipFlag flag) {
        tooltip.add(Component.translatable("item." + IridescentRelics.MODID + "." + spec.id + ".tooltip")
            .withStyle(ChatFormatting.GRAY));
        super.appendHoverText(stack, level, tooltip, flag);
    }
}
