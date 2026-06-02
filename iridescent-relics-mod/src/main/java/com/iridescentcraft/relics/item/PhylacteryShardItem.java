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
 * Lich's Phylactery Shard -- T2 boss relic (Twilight Lich / {@code twilightforest:lich}).
 * Spellstone slot, RARE. Boss-dropped (EMPTY {@link LootData}); see relic_boss_drops.js.
 *
 * <p>Worn effect (framework leveling ability):
 * <ul>
 *   <li>{@code cooldown}/{@code amount} -> {@code irons_spellbooks:cooldown_reduction}
 *       (ADDITION, SOFT dep on Iron's Spellbooks -- skipped if the attribute is absent),
 *       base +0.08. (Attribute id verified against irons_spellbooks-1.20.1-3.15.5.1.jar.)</li>
 * </ul>
 * Authored on the proven {@link RemnantRelicItem} template.
 */
public class PhylacteryShardItem extends RelicItem {

    private static final ResourceLocation COOLDOWN_REDUCTION = new ResourceLocation("irons_spellbooks", "cooldown_reduction");

    public PhylacteryShardItem(Properties properties) {
        super(properties);
    }

    @Override
    public RelicData constructDefaultRelicData() {
        return RelicData.builder()
                .abilities(AbilitiesData.builder()
                        .ability(AbilityData.builder("cooldown")
                                .stat(StatData.builder("amount")
                                        .initialValue(0.08D, 0.08D)
                                        .upgradeModifier(UpgradeOperation.MULTIPLY_BASE, 0.2D)
                                        .formatValue(value -> (double) Math.round(value * 100.0D) / 100.0D)
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
                                .borderTop(0xff9d6bd6)
                                .borderBottom(0xff3f2a5a)
                                .build())
                        .build())
                .loot(LootData.builder().build())
                .build();
    }

    @Override
    public RelicAttributeModifier getAttributeModifiers(ItemStack stack) {
        RelicAttributeModifier.RelicAttributeModifierBuilder builder = RelicAttributeModifier.builder();

        Holder<Attribute> cooldown = ForgeRegistries.ATTRIBUTES.getHolder(COOLDOWN_REDUCTION).orElse(null);
        if (cooldown != null) {
            builder.attribute(new RelicAttributeModifier.Modifier(
                    cooldown,
                    (float) getAbilityValue(stack, "cooldown", "amount"),
                    AttributeModifier.Operation.ADDITION));
        }

        return builder.build();
    }
}
