package com.iridescentcraft.modspells.client;

import com.google.common.collect.Multimap;
import com.iridescentcraft.modspells.IridescentModularSpells;
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
 * Registers magic-attribute bars in Tetra's workbench Status panel.
 *
 * <p>Tetra's {@link WorkbenchStatsGui} hardcodes a weapon-oriented stat list
 * (damage / sweeping / speed / durability / armor / etc.) — magic attributes
 * (max_mana, spell_power, cooldown_reduction, ...) aren't in it by default,
 * so our modular spell book shows an empty Status tab. Tetra exposes
 * {@code WorkbenchStatsGui.addBar(GuiStatBase)} as a public static method
 * for exactly this kind of extension; we call it during {@link FMLClientSetupEvent}
 * with one bar per supported magic attribute.
 *
 * <p>Each bar reads from {@link IModularItem#getAttributeModifiersCached(ItemStack)}
 * — the same path our equipped tooltip uses — so the panel reflects the
 * actually-assembled item's stats from materials + modules + improvements.
 *
 * <p>Client-only: registered on {@code Dist.CLIENT} via
 * {@link Mod.EventBusSubscriber} so the class is never loaded server-side.
 */
@Mod.EventBusSubscriber(modid = IridescentModularSpells.MODID,
        bus = Mod.EventBusSubscriber.Bus.MOD, value = Dist.CLIENT)
public final class MagicStatsBars {

    private MagicStatsBars() {}

    @SubscribeEvent
    public static void onClientSetup(FMLClientSetupEvent event) {
        // Tetra populates its own staticBars during its client setup; we enqueue
        // ours to run AFTER the parallel mod loading so we extend rather than
        // race with the vanilla list.
        event.enqueueWork(MagicStatsBars::registerBars);
    }

    private static void registerBars() {
        // ISS attributes
        addBar("maxMana",            "irons_spellbooks:max_mana",              0.0,    500.0, false);
        addBar("manaRegen",          "irons_spellbooks:mana_regen",           -0.50,   1.00,  true);
        addBar("spellPower",         "irons_spellbooks:spell_power",          -0.50,   1.00,  true);
        addBar("cooldownReduction",  "irons_spellbooks:cooldown_reduction",   -0.50,   0.50,  true);
        addBar("castTimeReduction",  "irons_spellbooks:cast_time_reduction",  -0.50,   0.50,  true);
        addBar("firePower",          "irons_spellbooks:fire_spell_power",      0.0,    1.00,  true);
        addBar("icePower",           "irons_spellbooks:ice_spell_power",       0.0,    1.00,  true);
        addBar("lightningPower",     "irons_spellbooks:lightning_spell_power", 0.0,    1.00,  true);
        addBar("holyPower",          "irons_spellbooks:holy_spell_power",      0.0,    1.00,  true);
        addBar("enderPower",         "irons_spellbooks:ender_spell_power",     0.0,    1.00,  true);
        addBar("naturePower",        "irons_spellbooks:nature_spell_power",    0.0,    1.00,  true);
        addBar("bloodPower",         "irons_spellbooks:blood_spell_power",     0.0,    1.00,  true);
        addBar("eldritchPower",      "irons_spellbooks:eldritch_spell_power",  0.0,    1.00,  true);
        addBar("evocationPower",     "irons_spellbooks:evocation_spell_power", 0.0,    1.00,  true);
        addBar("summonDamage",       "irons_spellbooks:summon_damage",         0.0,    1.00,  true);
        // Ars Nouveau attributes
        addBar("arsMaxMana",         "ars_nouveau:ars_nouveau.perk.max_mana",     0.0,    500.0, false);
        addBar("arsManaRegen",       "ars_nouveau:ars_nouveau.perk.mana_regen",  -0.50,   1.00,  true);
        addBar("arsSpellDamage",     "ars_nouveau:ars_nouveau.perk.spell_damage",-0.50,   1.00,  true);
    }

    /**
     * Add a single GuiStatBar to {@link WorkbenchStatsGui#staticBars} reading
     * the given attribute ID off the assembled item.
     *
     * @param key       lang key suffix; full lookup is
     *                  {@code iridescent_modular_spells.stats.<key>}
     * @param attrId    attribute resource location string
     *                  (e.g. {@code "irons_spellbooks:max_mana"})
     * @param min       lower bound for bar fill display
     * @param max       upper bound for bar fill display
     * @param isPercent whether to format the value as a percentage (×100)
     */
    private static void addBar(String key, String attrId, double min, double max, boolean isPercent) {
        String labelKey = "iridescent_modular_spells.stats." + key;

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
                return computeValue(curr, attrId) != 0.0 || computeValue(prev, attrId) != 0.0;
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
                return labelKey;
            }
        };

        GuiStatBar bar = new GuiStatBar(0, 0, 80, labelKey, min, max, false,
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
