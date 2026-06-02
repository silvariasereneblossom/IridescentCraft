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
 * Sunfeather Charm -- T2 boss relic (Sun Spirit / {@code aether:sun_spirit}).
 * Charm slot, RARE. Boss-dropped (EMPTY {@link LootData}); see relic_boss_drops.js.
 *
 * <p>Worn effect (framework leveling ability):
 * <ul>
 *   <li>{@code mana}/{@code amount} -> {@code irons_spellbooks:max_mana} (ADDITION, SOFT dep
 *       on Iron's Spellbooks -- skipped if the attribute is absent), base +20.</li>
 * </ul>
 * Authored on the proven {@link RemnantRelicItem} template.
 */
public class SunfeatherCharmItem extends RelicItem {

    private static final ResourceLocation MAX_MANA = new ResourceLocation("irons_spellbooks", "max_mana");

    public SunfeatherCharmItem(Properties properties) {
        super(properties);
    }

    @Override
    public RelicData constructDefaultRelicData() {
        return RelicData.builder()
                .abilities(AbilitiesData.builder()
                        .ability(AbilityData.builder("mana")
                                .stat(StatData.builder("amount")
                                        .initialValue(20.0D, 20.0D)
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
                                .borderTop(0xffffe066)
                                .borderBottom(0xffb07a12)
                                .build())
                        .build())
                .loot(LootData.builder().build())
                .build();
    }

    @Override
    public RelicAttributeModifier getAttributeModifiers(ItemStack stack) {
        RelicAttributeModifier.RelicAttributeModifierBuilder builder = RelicAttributeModifier.builder();

        Holder<Attribute> mana = ForgeRegistries.ATTRIBUTES.getHolder(MAX_MANA).orElse(null);
        if (mana != null) {
            builder.attribute(new RelicAttributeModifier.Modifier(
                    mana,
                    (float) getAbilityValue(stack, "mana", "amount"),
                    AttributeModifier.Operation.ADDITION));
        }

        return builder.build();
    }
}
