package com.iridescentcraft.relics.item;

import it.hurts.sskirillss.relics.items.relics.base.RelicItem;
import it.hurts.sskirillss.relics.items.relics.base.data.RelicAttributeModifier;
import it.hurts.sskirillss.relics.items.relics.base.data.RelicData;
import it.hurts.sskirillss.relics.items.relics.base.data.leveling.AbilitiesData;
import it.hurts.sskirillss.relics.items.relics.base.data.leveling.AbilityData;
import it.hurts.sskirillss.relics.items.relics.base.data.leveling.LevelingData;
import it.hurts.sskirillss.relics.items.relics.base.data.leveling.StatData;
import it.hurts.sskirillss.relics.items.relics.base.data.leveling.misc.UpgradeOperation;
import it.hurts.sskirillss.relics.items.relics.base.data.loot.LootData;
import it.hurts.sskirillss.relics.items.relics.base.data.style.StyleData;
import it.hurts.sskirillss.relics.items.relics.base.data.style.TooltipData;
import net.minecraft.core.Holder;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.registries.ForgeRegistries;

/**
 * Frostmaw's Frozen Heart -- T1 boss relic (Frostmaw / {@code mowziesmobs:frostmaw}).
 * Necklace slot, RARE. Boss-dropped (EMPTY {@link LootData}); see relic_boss_drops.js.
 *
 * <p>Worn effect (framework leveling ability):
 * <ul>
 *   <li>{@code armor}/{@code amount} -> {@code minecraft:generic.armor} (ADDITION), base +2.</li>
 * </ul>
 * Authored on the proven {@link RemnantRelicItem} template.
 */
public class FrostmawHeartItem extends RelicItem {

    private static final ResourceLocation ARMOR = new ResourceLocation("minecraft", "generic.armor");

    public FrostmawHeartItem(Properties properties) {
        super(properties);
    }

    @Override
    public RelicData constructDefaultRelicData() {
        return RelicData.builder()
                .abilities(AbilitiesData.builder()
                        .ability(AbilityData.builder("armor")
                                .stat(StatData.builder("amount")
                                        .initialValue(2.0D, 2.0D)
                                        .upgradeModifier(UpgradeOperation.MULTIPLY_BASE, 0.2D)
                                        .formatValue(value -> (double) Math.round(value * 10.0D) / 10.0D)
                                        .build())
                                .build())
                        .build())
                .leveling(LevelingData.builder()
                        .initialCost(100)
                        .maxLevel(10)
                        .step(100)
                        .build())
                .style(StyleData.builder()
                        .tooltip(TooltipData.builder()
                                .borderTop(0xff8fd0ff)
                                .borderBottom(0xff2a5f8f)
                                .build())
                        .build())
                .loot(LootData.builder().build())
                .build();
    }

    @Override
    public RelicAttributeModifier getAttributeModifiers(ItemStack stack) {
        RelicAttributeModifier.RelicAttributeModifierBuilder builder = RelicAttributeModifier.builder();

        Holder<Attribute> armor = ForgeRegistries.ATTRIBUTES.getHolder(ARMOR).orElse(null);
        if (armor != null) {
            builder.attribute(new RelicAttributeModifier.Modifier(
                    armor,
                    (float) getAbilityValue(stack, "armor", "amount"),
                    AttributeModifier.Operation.ADDITION));
        }

        return builder.build();
    }
}
