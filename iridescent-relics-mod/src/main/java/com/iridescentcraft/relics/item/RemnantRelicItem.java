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
 * Relic of the Remnant -- the proven template for the Iridescent relic roster, authored
 * THROUGH the Relics framework (sskirillss / Octo-Studios, modId {@code relics}) instead of
 * as a bare Curios {@code ICurioItem}.
 *
 * <p>Identity (preserved from the original): id {@code remnant_relic}, charm slot, EPIC,
 * fire-resistant, stacks to 1. Boss reward from the Ancient Remnant (cursed_pyramid). It is
 * dropped via a loot-table edit, so its {@link LootData} is intentionally EMPTY (no relics
 * {@code LootCollection}).
 *
 * <p>Effects while worn -- now expressed as framework leveling abilities so the bonus grows
 * as the relic levels up, with the level-1 floor kept close to the original static values so
 * it is not a nerf:
 * <ul>
 *   <li>{@code health}/{@code amount} -> {@code minecraft:generic.max_health} (ADDITION),
 *       base ~4.0 (2 hearts), scaling with level.</li>
 *   <li>{@code spell_power}/{@code amount} -> {@code irons_spellbooks:spell_power} (ADDITION,
 *       SOFT dep -- skipped entirely if Iron's Spellbooks is absent), base ~0.10.</li>
 * </ul>
 *
 * <p>Attribute application uses the declarative IRelicItem path: we override
 * {@link #getAttributeModifiers(ItemStack)} and build each {@code Modifier} dynamically from
 * {@link #getAbilityValue(ItemStack, String, String)} (the live, leveled value), which the
 * framework's base {@link RelicItem#getAttributeModifiers(top.theillusivec4.curios.api.SlotContext, java.util.UUID, ItemStack)}
 * then turns into Curios attribute modifiers. The {@code Modifier} "multiplier" field is used
 * by the framework as the flat additive amount for an ADDITION operation.
 */
public class RemnantRelicItem extends RelicItem {

    private static final ResourceLocation MAX_HEALTH = new ResourceLocation("minecraft", "generic.max_health");
    private static final ResourceLocation SPELL_POWER = new ResourceLocation("irons_spellbooks", "spell_power");

    public RemnantRelicItem(Properties properties) {
        super(properties);
    }

    @Override
    public RelicData constructDefaultRelicData() {
        return RelicData.builder()
                .abilities(AbilitiesData.builder()
                        .ability(AbilityData.builder("health")
                                .stat(StatData.builder("amount")
                                        .initialValue(4.0D, 4.0D)
                                        .upgradeModifier(UpgradeOperation.MULTIPLY_BASE, 0.2D)
                                        .formatValue(value -> (double) Math.round(value * 10.0D) / 10.0D)
                                        .build())
                                .build())
                        .ability(AbilityData.builder("spell_power")
                                .stat(StatData.builder("amount")
                                        .initialValue(0.10D, 0.10D)
                                        .upgradeModifier(UpgradeOperation.MULTIPLY_BASE, 0.2D)
                                        .formatValue(value -> (double) Math.round(value * 100.0D) / 100.0D)
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
                                .borderTop(0xff8a5a2b)
                                .borderBottom(0xff3a2410)
                                .build())
                        .build())
                // EMPTY loot: this relic is boss-dropped via a loot-table edit, not a LootCollection.
                .loot(LootData.builder().build())
                .build();
    }

    /**
     * Declarative attribute modifiers (IRelicItem). Values are read live from the leveling
     * abilities so they scale with the relic's level. Attributes are resolved by id from the
     * Forge registry, so {@code irons_spellbooks:spell_power} is a SOFT dep: if the attribute
     * is not present (Iron's Spellbooks not installed) that modifier is simply omitted.
     */
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

        Holder<Attribute> spellPower = ForgeRegistries.ATTRIBUTES.getHolder(SPELL_POWER).orElse(null);
        if (spellPower != null) {
            builder.attribute(new RelicAttributeModifier.Modifier(
                    spellPower,
                    (float) getAbilityValue(stack, "spell_power", "amount"),
                    AttributeModifier.Operation.ADDITION));
        }

        return builder.build();
    }
}
