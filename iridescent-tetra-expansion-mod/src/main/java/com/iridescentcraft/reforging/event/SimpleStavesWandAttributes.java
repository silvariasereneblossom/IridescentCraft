package com.iridescentcraft.reforging.event;

import com.iridescentcraft.reforging.IridescentReforging;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.event.ItemAttributeModifierEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.registries.ForgeRegistries;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Bakes per-tier base spell stats onto the six Simple Staves vanilla
 * material wands at the item level (not via player-tick injection).
 *
 * <p>Mirrors the Tetra variant primaryAttributes on basic_handle/cap/
 * core/inlay so the workbench conversion is value-neutral -- the player
 * gets the same numbers pre- and post-conversion, the conversion only
 * adds module/honing customization surface area.
 *
 * <p>Tier ladder (% on spell_power, mana_regen, cooldown_reduction):
 * wood 5, stone 10, iron 15, gold 20, diamond 25, netherite 30.
 *
 * <p>Why ItemAttributeModifierEvent: vanilla calls Item.getAttributeModifiers
 * when computing held-item bonuses AND when rendering tooltips. Subscribing
 * here means the wand carries its stats natively -- they appear in the
 * tooltip via the standard "When in Main Hand: ..." line, get applied to
 * the holder by vanilla equipment-slot logic, and survive any container
 * shuffle without needing a server-tick scan. Item-level, like vanilla
 * armor protection or sword damage.
 *
 * <p>Why Item.defaultModifiers can't be used: it's final on the base
 * Item class and Simple Staves doesn't expose a way to inject at item
 * construction time. ItemAttributeModifierEvent fires every time the
 * modifiers are queried, which is the standard Forge pattern for adding
 * to a third-party mod's items.
 */
@Mod.EventBusSubscriber(modid = IridescentReforging.MODID,
        bus = Mod.EventBusSubscriber.Bus.FORGE)
public class SimpleStavesWandAttributes {

    /** Wand item id -> tier percent (decimal). */
    private static final Map<String, Double> TIER_PERCENT = new HashMap<>();
    static {
        TIER_PERCENT.put("simple_staves:woodenwand",     0.05);
        TIER_PERCENT.put("simple_staves:stone_wand",     0.10);
        TIER_PERCENT.put("simple_staves:iron_wand",      0.15);
        TIER_PERCENT.put("simple_staves:gold_wand",      0.20);
        TIER_PERCENT.put("simple_staves:diamond_wand",   0.25);
        TIER_PERCENT.put("simple_staves:netherite_wand", 0.30);
    }

    /** Stable UUIDs per attribute so vanilla's de-dup keys identify our
     *  modifiers consistently across hover/equip queries. */
    private static final UUID SP_UUID  = UUID.fromString("8a1e0c01-2e1d-4f0a-9d1f-303000000001");
    private static final UUID MR_UUID  = UUID.fromString("8a1e0c01-2e1d-4f0a-9d1f-303000000002");
    private static final UUID CDR_UUID = UUID.fromString("8a1e0c01-2e1d-4f0a-9d1f-303000000003");

    private static final ResourceLocation SP_ATTR  =
            new ResourceLocation("irons_spellbooks", "spell_power");
    private static final ResourceLocation MR_ATTR  =
            new ResourceLocation("irons_spellbooks", "mana_regen");
    private static final ResourceLocation CDR_ATTR =
            new ResourceLocation("irons_spellbooks", "cooldown_reduction");

    @SubscribeEvent
    public static void onItemAttribute(ItemAttributeModifierEvent event) {
        if (event.getSlotType() != EquipmentSlot.MAINHAND) return;

        ItemStack stack = event.getItemStack();
        ResourceLocation itemId = ForgeRegistries.ITEMS.getKey(stack.getItem());
        if (itemId == null) return;

        Double pct = TIER_PERCENT.get(itemId.toString());
        if (pct == null) return;

        addPercent(event, SP_ATTR,  SP_UUID,  "iridescent_wand_sp",  pct);
        addPercent(event, MR_ATTR,  MR_UUID,  "iridescent_wand_mr",  pct);
        addPercent(event, CDR_ATTR, CDR_UUID, "iridescent_wand_cdr", pct);
    }

    private static void addPercent(ItemAttributeModifierEvent event,
                                   ResourceLocation attrId,
                                   UUID uuid,
                                   String name,
                                   double amount) {
        Attribute attr = ForgeRegistries.ATTRIBUTES.getValue(attrId);
        if (attr == null) return;  // ISS absent
        event.addModifier(attr, new AttributeModifier(
                uuid, name, amount, AttributeModifier.Operation.ADDITION));
    }
}
