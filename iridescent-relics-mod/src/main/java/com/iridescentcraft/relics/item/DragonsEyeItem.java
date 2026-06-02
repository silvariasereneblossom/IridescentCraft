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
 * Dragon's Eye -- T4 (terminal) finale relic (Ender Dragon / {@code minecraft:ender_dragon}).
 * Back slot, EPIC. Boss-dropped (EMPTY {@link LootData}).
 *
 * <p><b>Drop caveat:</b> the Ender Dragon does NOT emit a normal {@code LivingDropsEvent} on
 * death (it XP/egg-drops via bespoke logic), so this relic is NOT wired through the shared
 * {@code relic_boss_drops.js} LivingDropsEvent injector -- it is flagged for a bespoke drop
 * follow-up. See the agent report / relic_boss_drops.js header.
 *
 * <p>Worn effects (framework leveling abilities):
 * <ul>
 *   <li>{@code health}/{@code amount} -> {@code minecraft:generic.max_health} (ADDITION), base +12.</li>
 *   <li>{@code crit_chance}/{@code amount} -> {@code attributeslib:crit_chance} (ADDITION, SOFT dep
 *       on Apothic Attributes -- skipped if absent), base +0.05. (Attribute id verified against
 *       ApothicAttributes-1.20.1-1.3.7.jar.)</li>
 *   <li>{@code crit_damage}/{@code amount} -> {@code attributeslib:crit_damage} (ADDITION, SOFT dep),
 *       base +0.20. (Id verified.)</li>
 * </ul>
 * Authored on the proven {@link RemnantRelicItem} template.
 */
public class DragonsEyeItem extends RelicItem {

    private static final ResourceLocation MAX_HEALTH = new ResourceLocation("minecraft", "generic.max_health");
    private static final ResourceLocation CRIT_CHANCE = new ResourceLocation("attributeslib", "crit_chance");
    private static final ResourceLocation CRIT_DAMAGE = new ResourceLocation("attributeslib", "crit_damage");

    public DragonsEyeItem(Properties properties) {
        super(properties);
    }

    @Override
    public RelicData constructDefaultRelicData() {
        return RelicData.builder()
                .abilities(AbilitiesData.builder()
                        .ability(AbilityData.builder("health")
                                .stat(StatData.builder("amount")
                                        .initialValue(12.0D, 12.0D)
                                        .upgradeModifier(UpgradeOperation.MULTIPLY_BASE, 0.2D)
                                        .formatValue(value -> (double) Math.round(value * 10.0D) / 10.0D)
                                        .build())
                                .build())
                        .ability(AbilityData.builder("crit_chance")
                                .stat(StatData.builder("amount")
                                        .initialValue(0.05D, 0.05D)
                                        .upgradeModifier(UpgradeOperation.MULTIPLY_BASE, 0.2D)
                                        .formatValue(value -> (double) Math.round(value * 100.0D) / 100.0D)
                                        .build())
                                .build())
                        .ability(AbilityData.builder("crit_damage")
                                .stat(StatData.builder("amount")
                                        .initialValue(0.20D, 0.20D)
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
                                .borderTop(0xffc060ff)
                                .borderBottom(0xff2a0f4a)
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

        Holder<Attribute> critChance = ForgeRegistries.ATTRIBUTES.getHolder(CRIT_CHANCE).orElse(null);
        if (critChance != null) {
            builder.attribute(new RelicAttributeModifier.Modifier(
                    critChance,
                    (float) getAbilityValue(stack, "crit_chance", "amount"),
                    AttributeModifier.Operation.ADDITION));
        }

        Holder<Attribute> critDamage = ForgeRegistries.ATTRIBUTES.getHolder(CRIT_DAMAGE).orElse(null);
        if (critDamage != null) {
            builder.attribute(new RelicAttributeModifier.Modifier(
                    critDamage,
                    (float) getAbilityValue(stack, "crit_damage", "amount"),
                    AttributeModifier.Operation.ADDITION));
        }

        return builder.build();
    }
}
