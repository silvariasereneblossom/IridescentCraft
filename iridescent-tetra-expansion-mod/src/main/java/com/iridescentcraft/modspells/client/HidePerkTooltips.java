package com.iridescentcraft.modspells.client;

import java.util.Set;

import com.google.common.collect.Multimap;
import com.iridescentcraft.modspells.IridescentModularSpells;
import com.iridescentcraft.modspells.item.ModularArsSpellBookItem;
import com.iridescentcraft.modspells.item.ModularSpellBookItem;

import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.registries.ForgeRegistries;

import dev.shadowsoffire.attributeslib.api.client.GatherSkippedAttributeTooltipsEvent;

/**
 * Suppresses the duplicate Ars-perk lines on modular spell book tooltips.
 *
 * The mana bridge (kubejs/server_scripts/attributes/mana_bridge.js) mirrors
 * ISS max_mana / mana_regen onto the equivalent Ars Nouveau perk attributes
 * so the two ecosystems stay in lockstep. When both modifier rows show up
 * in the tooltip the player sees the same effective stat twice with
 * confusingly different numbers (Ars base = 0 vs ISS base = 100, and the
 * perk attribute is multiplicative on a 0-base).
 *
 * Apotheosis' ALConfig "Hidden Attributes" entries only hide attributes
 * from the Attributes GUI -- the item tooltip is rendered by Apothic
 * Attributes' own ItemTooltipEvent handler, which exposes
 * GatherSkippedAttributeTooltipsEvent for per-UUID suppression. We add the
 * UUIDs of every Ars perk modifier on a modular spellbook stack to that
 * event's skip set.
 */
@Mod.EventBusSubscriber(modid = IridescentModularSpells.MODID,
        bus = Mod.EventBusSubscriber.Bus.FORGE, value = Dist.CLIENT)
public final class HidePerkTooltips {

    private HidePerkTooltips() {}

    private static final ResourceLocation ARS_MAX_MANA =
            new ResourceLocation("ars_nouveau", "ars_nouveau.perk.max_mana");
    private static final ResourceLocation ARS_MANA_REGEN =
            new ResourceLocation("ars_nouveau", "ars_nouveau.perk.mana_regen");
    private static final ResourceLocation ARS_SPELL_DAMAGE =
            new ResourceLocation("ars_nouveau", "ars_nouveau.perk.spell_damage");

    @SubscribeEvent
    public static void gather(GatherSkippedAttributeTooltipsEvent event) {
        ItemStack stack = event.getStack();
        if (stack.isEmpty()) return;
        Item item = stack.getItem();
        if (!(item instanceof ModularSpellBookItem || item instanceof ModularArsSpellBookItem)) {
            return;
        }
        for (EquipmentSlot slot : EquipmentSlot.values()) {
            Multimap<Attribute, AttributeModifier> map = stack.getAttributeModifiers(slot);
            for (Attribute attr : map.keySet()) {
                ResourceLocation id = ForgeRegistries.ATTRIBUTES.getKey(attr);
                if (id == null) continue;
                if (id.equals(ARS_MAX_MANA) || id.equals(ARS_MANA_REGEN) || id.equals(ARS_SPELL_DAMAGE)) {
                    for (AttributeModifier mod : map.get(attr)) {
                        event.skipUUID(mod.getId());
                    }
                }
            }
        }
    }
}
