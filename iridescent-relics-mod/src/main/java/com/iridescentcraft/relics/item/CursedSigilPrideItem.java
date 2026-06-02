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
 * Cursed Sigil of Pride -- T3 CURSE relic (Lucifer / {@code cardinal_sins:lucifer}).
 * Ring slot, EPIC. Boss-dropped (EMPTY {@link LootData}); see relic_boss_drops.js.
 *
 * <p>A high-risk-high-reward relic: strong offensive bonuses paired with a permanent
 * health drawback ("power requires power"). Worn effects (framework leveling abilities):
 * <ul>
 *   <li>{@code power}/{@code amount} -> {@code irons_spellbooks:spell_power} (ADDITION, SOFT dep
 *       on Iron's Spellbooks -- skipped if absent), base +0.20.</li>
 *   <li>{@code attack}/{@code amount} -> {@code minecraft:generic.attack_damage} (ADDITION), base +2.</li>
 *   <li>{@code curse}/{@code amount} -> {@code minecraft:generic.max_health} (NEGATIVE ADDITION),
 *       a flat -4 (2 hearts). Uses {@link UpgradeOperation#ADD} with step 0 so the drawback stays
 *       exactly -4 at every relic level and never surprise-scales as the relic is upgraded.</li>
 * </ul>
 *
 * <p><b>Negative-value note (verified):</b> the framework does NOT clamp negative stat values.
 * {@code StatData.initialValue} is a {@code Pair<Double,Double>} min/max with no non-negative
 * guard; {@code IRelicItem.randomizeStat} rolls {@code randomBetween(min,max)} (deterministic
 * when min==max==-4); {@code getAbilityValue} computes {@code current + points*step} (= -4 with
 * step 0) clamped only to {@code thresholdValue} ({@code [Double.MIN_VALUE, Double.MAX_VALUE]});
 * and {@code RelicItem.getAttributeModifiers} feeds {@code Modifier.getMultiplier()} straight into
 * a Curios {@code AttributeModifier} with {@code Operation.ADDITION}. The -4 therefore applies
 * intact as a true max-health penalty.
 *
 * Authored on the proven {@link RemnantRelicItem} template.
 */
public class CursedSigilPrideItem extends RelicItem {

    private static final ResourceLocation SPELL_POWER = new ResourceLocation("irons_spellbooks", "spell_power");
    private static final ResourceLocation ATTACK_DAMAGE = new ResourceLocation("minecraft", "generic.attack_damage");
    private static final ResourceLocation MAX_HEALTH = new ResourceLocation("minecraft", "generic.max_health");

    public CursedSigilPrideItem(Properties properties) {
        super(properties);
    }

    @Override
    public RelicData constructDefaultRelicData() {
        return RelicData.builder()
                .abilities(AbilitiesData.builder()
                        .ability(AbilityData.builder("power")
                                .stat(StatData.builder("amount")
                                        .initialValue(0.20D, 0.20D)
                                        .upgradeModifier(UpgradeOperation.MULTIPLY_BASE, 0.2D)
                                        .formatValue(value -> (double) Math.round(value * 100.0D) / 100.0D)
                                        .build())
                                .build())
                        .ability(AbilityData.builder("attack")
                                .stat(StatData.builder("amount")
                                        .initialValue(2.0D, 2.0D)
                                        .upgradeModifier(UpgradeOperation.MULTIPLY_BASE, 0.2D)
                                        .formatValue(value -> (double) Math.round(value * 10.0D) / 10.0D)
                                        .build())
                                .build())
                        // CURSE: flat -4 max health. ADD with step 0 keeps it at -4 regardless of level.
                        .ability(AbilityData.builder("curse")
                                .stat(StatData.builder("amount")
                                        .initialValue(-4.0D, -4.0D)
                                        .upgradeModifier(UpgradeOperation.ADD, 0.0D)
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
                                .borderTop(0xffd6304a)
                                .borderBottom(0xff4a0f17)
                                .build())
                        .build())
                .loot(LootData.builder().build())
                .build();
    }

    @Override
    public RelicAttributeModifier getAttributeModifiers(ItemStack stack) {
        RelicAttributeModifier.RelicAttributeModifierBuilder builder = RelicAttributeModifier.builder();

        Holder<Attribute> power = ForgeRegistries.ATTRIBUTES.getHolder(SPELL_POWER).orElse(null);
        if (power != null) {
            builder.attribute(new RelicAttributeModifier.Modifier(
                    power,
                    (float) getAbilityValue(stack, "power", "amount"),
                    AttributeModifier.Operation.ADDITION));
        }

        Holder<Attribute> attack = ForgeRegistries.ATTRIBUTES.getHolder(ATTACK_DAMAGE).orElse(null);
        if (attack != null) {
            builder.attribute(new RelicAttributeModifier.Modifier(
                    attack,
                    (float) getAbilityValue(stack, "attack", "amount"),
                    AttributeModifier.Operation.ADDITION));
        }

        // Negative ADDITION -- the curse. max_health is always present (vanilla), so this
        // drawback cannot be "skipped" the way a soft modded attribute would be.
        Holder<Attribute> health = ForgeRegistries.ATTRIBUTES.getHolder(MAX_HEALTH).orElse(null);
        if (health != null) {
            builder.attribute(new RelicAttributeModifier.Modifier(
                    health,
                    (float) getAbilityValue(stack, "curse", "amount"),
                    AttributeModifier.Operation.ADDITION));
        }

        return builder.build();
    }
}
