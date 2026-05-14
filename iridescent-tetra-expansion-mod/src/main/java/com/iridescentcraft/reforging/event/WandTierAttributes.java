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
 * Bakes per-tier base spell stats (spell_power, mana_regen,
 * cooldown_reduction) onto wand-like items at the item level via
 * ItemAttributeModifierEvent.
 *
 * <p>Two ladders coexist:
 * <ul>
 *   <li><b>Craftable ladder</b> (5-30%): Simple Staves vanilla material
 *       wands. Pre- and post-Tetra conversion: pre-conversion the SS item
 *       picks up its tier here; post-conversion the reforged_wand picks
 *       it up via basic_handle variant primaryAttributes (value-neutral).</li>
 *   <li><b>Drop ladder</b> (15/25/35/45% = T1/T2/T3/T4): non-Tetra wands
 *       and staves from Simple Staves (elementals), Dan's Magic, and Iron's
 *       Spellbooks. Drops sit above craftables -- a reward for loot vs.
 *       crafting. Mage-archetype uncapped stacking per
 *       project_mage_loadout memory.</li>
 * </ul>
 *
 * <p>Why ItemAttributeModifierEvent: vanilla calls Item.getAttributeModifiers
 * when computing held-item bonuses AND when rendering tooltips. Subscribing
 * here means each wand carries its stats natively -- they appear in the
 * tooltip via the standard "When in Main Hand: ..." line, get applied to
 * the holder by vanilla equipment-slot logic, and survive any container
 * shuffle without needing a server-tick scan. Item-level, like vanilla
 * armor protection or sword damage.
 *
 * <p>Why Item.defaultModifiers can't be used: it's final on the base Item
 * class and the host mods (SS, DM, ISS) don't expose a way to inject at
 * item construction time. ItemAttributeModifierEvent fires every time the
 * modifiers are queried, which is the standard Forge pattern for adding
 * to a third-party mod's items.
 *
 * <p>Layering with mod-defined attributes: ISS staves carry their own
 * attribute defaults via StaffTier (damage, attack speed, etc.). Our SP/
 * MR/CDR additions are independent attribute IDs, so they ADD to the
 * mod's stats rather than replace -- matching the user's "T1 = +15% on
 * top of the base bonus" directive.
 */
@Mod.EventBusSubscriber(modid = IridescentReforging.MODID,
        bus = Mod.EventBusSubscriber.Bus.FORGE)
public class WandTierAttributes {

    /** Wand item id -> tier percent (decimal). */
    private static final Map<String, Double> TIER_PERCENT = new HashMap<>();
    static {
        // -- Craftable ladder: Simple Staves vanilla material wands --
        TIER_PERCENT.put("simple_staves:woodenwand",     0.05);
        TIER_PERCENT.put("simple_staves:stone_wand",     0.10);
        TIER_PERCENT.put("simple_staves:iron_wand",      0.15);
        TIER_PERCENT.put("simple_staves:gold_wand",      0.20);
        TIER_PERCENT.put("simple_staves:diamond_wand",   0.25);
        TIER_PERCENT.put("simple_staves:netherite_wand", 0.30);

        // Uniques are tiered as standalone items, not by recipe inputs.
        // SS elementals, DM staves, and ISS staves are all UNIQUES -- their
        // recipe handle (stick / iron_stick / netherite_stick) doesn't signal
        // power. Only the 6 SS vanilla material wands above are part of the
        // material-progression ladder (they convert to reforged_wand).

        // -- Drop ladder T1 = 15% --
        // ISS entry book (literal starter, no boss/unique flavor):
        TIER_PERCENT.put("irons_spellbooks:wimpy_spell_book", 0.15);

        // -- Drop ladder T2 = 25% --
        // Simple Staves elementals (all 9 uniform; elementals are flavor-themed
        // crafted uniques without a clear in-mod tier hierarchy):
        TIER_PERCENT.put("simple_staves:flame_wand",        0.25);
        TIER_PERCENT.put("simple_staves:veil_wand",         0.25);
        TIER_PERCENT.put("simple_staves:void_wand",         0.25);
        TIER_PERCENT.put("simple_staves:tenebrium_wand",    0.25);
        TIER_PERCENT.put("simple_staves:wind_essence_wand", 0.25);
        TIER_PERCENT.put("simple_staves:viritium_wand",     0.25);
        TIER_PERCENT.put("simple_staves:venomite_wand",     0.25);
        TIER_PERCENT.put("simple_staves:thunder_wand",      0.25);
        TIER_PERCENT.put("simple_staves:explosion_wand",    0.25);
        // ISS early staff (bumped from natural ISS tier 1 to T2):
        TIER_PERCENT.put("irons_spellbooks:blood_staff", 0.25);

        // -- Drop ladder T3 = 35% --
        // Dan's Magic staves (all 5 uniform; same staff_base recipe, themed
        // accent ingredients don't justify intra-mod splits):
        TIER_PERCENT.put("dna:ice_staff",       0.35);
        TIER_PERCENT.put("dna:toxic_staff",     0.35);
        TIER_PERCENT.put("dna:tnt_staff",       0.35);
        TIER_PERCENT.put("dna:lightning_staff", 0.35);
        TIER_PERCENT.put("dna:magma_staff",     0.35);
        // ISS mid staves (bumped from natural ISS tier 2 to T3):
        TIER_PERCENT.put("irons_spellbooks:graybeard_staff", 0.35);
        TIER_PERCENT.put("irons_spellbooks:ice_staff",       0.35);
        // ISS unique mob-drop book (Vampiric):
        TIER_PERCENT.put("irons_spellbooks:cursed_doll_spell_book", 0.35);

        // -- Drop ladder T4 = 45% --
        // ISS late + endgame staves (improved_blood and pyrium bumped from
        // their natural ISS tier 3 to T4 alongside the endgame nines):
        TIER_PERCENT.put("irons_spellbooks:improved_blood_staff", 0.45);
        TIER_PERCENT.put("irons_spellbooks:pyrium_staff",         0.45);
        TIER_PERCENT.put("irons_spellbooks:staff_of_the_nines",   0.45);
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
        // 2026-05-14: MULTIPLY_BASE so vanilla Forge tooltip renders as "+X%"
        // instead of raw decimal. Vanilla material wands inject via Forge's
        // ItemAttributeModifierEvent (not Tetra's collapse path), so the
        // MULTIPLY_BASE-collapses-to-zero bug doesn't affect this code path.
        event.addModifier(attr, new AttributeModifier(
                uuid, name, amount, AttributeModifier.Operation.MULTIPLY_BASE));
    }
}
