package com.iridescentcraft.reforging.client;

import com.google.common.collect.Multimap;
import com.iridescentcraft.reforging.IridescentReforging;
import net.minecraft.client.resources.language.I18n;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.event.lifecycle.FMLClientSetupEvent;
import net.minecraftforge.registries.ForgeRegistries;
import se.mickelus.tetra.blocks.workbench.gui.WorkbenchStatsGui;
import se.mickelus.tetra.gui.stats.bar.GuiStatBar;
import se.mickelus.tetra.gui.stats.getter.ILabelGetter;
import se.mickelus.tetra.gui.stats.getter.IStatGetter;
import se.mickelus.tetra.gui.stats.getter.ITooltipGetter;
import se.mickelus.tetra.items.modular.IModularItem;

/**
 * Registers vanilla-side armor stat bars in Tetra's workbench Status panel
 * for our modular armor.
 *
 * <p>Tetra's {@link se.mickelus.tetra.gui.stats.GuiStats} ships static bars
 * for {@code generic.armor}, {@code generic.armor_toughness}, and durability
 * — those auto-display for any {@link IModularItem} including our armor.
 * The magic-side attributes (max_mana, spell_power, mana_regen, cooldown_
 * reduction, all element powers) are registered by the modular-spells mod's
 * {@code MagicStatsBars} — also auto-displaying for our armor.
 *
 * <p>This class fills the remaining gap: four vanilla armor attributes that
 * neither Tetra nor modular-spells covers, but which players reasonably
 * expect to see in the workbench Status panel for armor:
 * <ul>
 *   <li>{@code generic.knockback_resistance} — armor mainstay</li>
 *   <li>{@code generic.max_health} — diamond/netherite-tier modifier</li>
 *   <li>{@code generic.movement_speed} — agility/light-armor stat</li>
 *   <li>{@code forge:step_height_addition} — boots/jump-tier stat</li>
 * </ul>
 *
 * <p>Tetra's {@code WorkbenchStatsGui} uses a horizontal scroller (the
 * "Status Display Slider") to overflow when more bars qualify than fit on
 * screen. Adding these bars activates the slider naturally; no slider
 * rendering code is needed on our side.
 *
 * <p>Each bar's {@code shouldShow} returns false unless either current or
 * preview stack has a non-zero modifier for the attribute, so empty-slot
 * armor won't pollute the panel with unused bars.
 *
 * <p>Lang convention mirrors {@code MagicStatsBars}: each bar's tooltip
 * resolves through {@link I18n#get(String, Object...)} with the formatted
 * value as a substitution argument — {@link GuiStatBar} wraps tooltip
 * strings in {@code Component.literal} (not translatable), so the lookup
 * must happen here, not in the page renderer.
 */
@Mod.EventBusSubscriber(modid = IridescentReforging.MODID,
        bus = Mod.EventBusSubscriber.Bus.MOD, value = Dist.CLIENT)
public final class ArmorStatsBars {

    private ArmorStatsBars() {}

    @SubscribeEvent
    public static void onClientSetup(FMLClientSetupEvent event) {
        // Tetra populates its own staticBars during its own client setup;
        // enqueue ours so we extend rather than race with the vanilla list.
        event.enqueueWork(ArmorStatsBars::registerBars);
    }

    private static void registerBars() {
        // Vanilla attribute IDs — values are absolute (knockback_resistance
        // is a 0..1 percentage, others are flat additions). Range bounds
        // chosen for typical end-game armor totals across all 4 pieces.
        addBar("knockbackResistance", "minecraft:generic.knockback_resistance",
                0.0, 1.0, true);
        addBar("maxHealth",           "minecraft:generic.max_health",
                -10.0, 20.0, false);
        addBar("movementSpeed",       "minecraft:generic.movement_speed",
                -0.50, 0.50, true);
        addBar("stepHeight",          "forge:step_height_addition",
                0.0, 1.5, false);
    }

    /**
     * Add a single GuiStatBar reading the given attribute ID off the
     * assembled item via {@link IModularItem#getAttributeModifiersCached}.
     *
     * @param key       lang key suffix; full lookup is
     *                  {@code iridescent_reforging.stats.<key>}
     * @param attrId    attribute resource location string
     * @param min       lower bound for bar fill display
     * @param max       upper bound for bar fill display
     * @param isPercent format value as percentage (×100) when true
     */
    private static void addBar(String key, String attrId,
                               double min, double max, boolean isPercent) {
        String labelKey = "iridescent_reforging.stats." + key;
        String tooltipKey = labelKey + ".tooltip";

        IStatGetter statGetter = new IStatGetter() {
            @Override public double getValue(Player p, ItemStack s) {
                return computeValue(s, attrId);
            }
            @Override public double getValue(Player p, ItemStack s, String slot) {
                return computeValue(s, attrId);
            }
            @Override public double getValue(Player p, ItemStack s, String slot, String improvement) {
                return computeValue(s, attrId);
            }
            @Override public boolean shouldShow(Player p, ItemStack curr, ItemStack prev) {
                if (!(curr.getItem() instanceof IModularItem)) return false;
                return computeValue(curr, attrId) != 0.0
                        || computeValue(prev, attrId) != 0.0;
            }
        };

        ILabelGetter labelGetter = new ILabelGetter() {
            @Override public String getLabel(double value, double diff, boolean inverted) {
                if (isPercent) return String.format("%+.1f%%", value * 100.0);
                return String.format("%+.1f", value);
            }
            @Override public String getLabelMerged(double a, double b) {
                if (isPercent) return String.format("%+.1f%% / %+.1f%%", a * 100.0, b * 100.0);
                return String.format("%+.1f / %+.1f", a, b);
            }
        };

        ITooltipGetter tooltipGetter = new ITooltipGetter() {
            @Override public String getTooltipBase(Player p, ItemStack s) {
                double v = computeValue(s, attrId);
                String formatted = isPercent
                        ? String.format("%+.1f%%", v * 100.0)
                        : String.format("%+.1f", v);
                return I18n.get(tooltipKey, formatted);
            }
        };

        GuiStatBar bar = new GuiStatBar(0, 0, 60, labelKey, min, max, false,
                statGetter, labelGetter, tooltipGetter);
        WorkbenchStatsGui.addBar(bar);
    }

    private static double computeValue(ItemStack stack, String attrId) {
        if (stack == null || stack.isEmpty()) return 0.0;
        if (!(stack.getItem() instanceof IModularItem im)) return 0.0;
        try {
            Multimap<Attribute, AttributeModifier> attrs = im.getAttributeModifiersCached(stack);
            if (attrs == null) return 0.0;
            double total = 0.0;
            for (var entry : attrs.entries()) {
                ResourceLocation rl = ForgeRegistries.ATTRIBUTES.getKey(entry.getKey());
                if (rl != null && rl.toString().equals(attrId)) {
                    total += entry.getValue().getAmount();
                }
            }
            return total;
        } catch (Throwable t) {
            return 0.0;
        }
    }
}
