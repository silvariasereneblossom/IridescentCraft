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
 * Suppresses the deprecated Ars MANA perk lines on modular spell book tooltips.
 *
 * Ars mana is deprecated in this pack: every Ars mana operation is routed
 * through the Iron's Spellbooks pool ({@code ArsManaCapMixin}), so a modifier
 * on Ars's own max-mana / mana-regen perk attributes does nothing. The modular
 * books no longer grant those (the Ars book's back cover and spine grant the
 * Iron's attributes since 2026-10-11); this stays as a guard so a stray
 * modifier never advertises a stat that has no effect.
 *
 * NOT hidden any more: {@code ars_nouveau.perk.spell_damage}. Its percent
 * modifiers are real now ({@code ArsSpellDamagePercent}) and the Ars book's
 * front cover line should be visible. Until 2026-10-11 it was hidden here
 * together with the mana lines -- which also hid the fact that it did nothing.
 *
 * (History: this class was written for kubejs/.../mana_bridge.js, which
 * mirrored ISS max_mana / mana_regen onto the Ars perk attributes and made
 * each stat show twice. That script was replaced by the mixin on 2026-05-15.)
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
                if (id.equals(ARS_MAX_MANA) || id.equals(ARS_MANA_REGEN)) {
                    for (AttributeModifier mod : map.get(attr)) {
                        event.skipUUID(mod.getId());
                    }
                }
            }
        }
    }
}
