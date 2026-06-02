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
 * Leviathan's Pearl -- T3 boss relic (The Leviathan / {@code cataclysm:the_leviathan}).
 * Body slot, EPIC. Boss-dropped (EMPTY {@link LootData}); see relic_boss_drops.js.
 *
 * <p>Worn effects (framework leveling abilities):
 * <ul>
 *   <li>{@code health}/{@code amount} -> {@code minecraft:generic.max_health} (ADDITION), base +8.</li>
 *   <li>{@code attack}/{@code amount} -> {@code minecraft:generic.attack_damage} (ADDITION), base +1.5.</li>
 * </ul>
 * Authored on the proven {@link RemnantRelicItem} template.
 */
public class LeviathansPearlItem extends RelicItem {

    private static final ResourceLocation MAX_HEALTH = new ResourceLocation("minecraft", "generic.max_health");
    private static final ResourceLocation ATTACK_DAMAGE = new ResourceLocation("minecraft", "generic.attack_damage");

    public LeviathansPearlItem(Properties properties) {
        super(properties);
    }

    @Override
    public RelicData constructDefaultRelicData() {
        return RelicData.builder()
                .abilities(AbilitiesData.builder()
                        .ability(AbilityData.builder("health")
                                .stat(StatData.builder("amount")
                                        .initialValue(8.0D, 8.0D)
                                        .upgradeModifier(UpgradeOperation.MULTIPLY_BASE, 0.2D)
                                        .formatValue(value -> (double) Math.round(value * 10.0D) / 10.0D)
                                        .build())
                                .build())
                        .ability(AbilityData.builder("attack")
                                .stat(StatData.builder("amount")
                                        .initialValue(1.5D, 1.5D)
                                        .upgradeModifier(UpgradeOperation.MULTIPLY_BASE, 0.2D)
                                        .formatValue(value -> (double) Math.round(value * 10.0D) / 10.0D)
                                        .build())
                                .build())
                        .build())
                .leveling(LevelingData.builder()
                        .initialCost(100)
                        .maxLevel(12)
                        .step(125)
                        .build())
                .style(StyleData.builder()
                        .tooltip(TooltipData.builder()
                                .borderTop(0xff5fd6c8)
                                .borderBottom(0xff1f5a52)
                                .build())
                        .build())
                .loot(LootData.builder().build())
                .build();
    }

    @Override
    public RelicAttributeModifier getAttributeModifiers(ItemStack stack) {
        RelicAttributeModifier.RelicAttributeModifierBuilder builder = RelicAttributeModifier.builder();

        Holder<Attribute> health = ForgeRegistries.ATTRIBUTES.getHolder(MAX_HEALTH).orElse(null);
        if (health != null) {
            builder.attribute(new RelicAttributeModifier.Modifier(
                    health,
                    (float) getAbilityValue(stack, "health", "amount"),
                    AttributeModifier.Operation.ADDITION));
        }

        Holder<Attribute> attack = ForgeRegistries.ATTRIBUTES.getHolder(ATTACK_DAMAGE).orElse(null);
        if (attack != null) {
            builder.attribute(new RelicAttributeModifier.Modifier(
                    attack,
                    (float) getAbilityValue(stack, "attack", "amount"),
                    AttributeModifier.Operation.ADDITION));
        }

        return builder.build();
    }
}
