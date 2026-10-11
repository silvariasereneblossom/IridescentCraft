package com.iridescentcraft.modspells.event;

import com.google.common.collect.Multimap;
import com.iridescentcraft.modspells.IridescentModularSpells;
import com.iridescentcraft.modspells.enchant.ModEnchantmentRegistry;
import com.iridescentcraft.reforging.enchant.MagicWeaponCategory;
import com.iridescentcraft.modspells.item.ModularArsSpellBookItem;
import com.iridescentcraft.modspells.item.ModularSpellBookItem;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.registries.ForgeRegistries;
import se.mickelus.tetra.items.modular.IModularItem;
import top.theillusivec4.curios.api.CuriosApi;
import top.theillusivec4.curios.api.type.capability.ICuriosItemHandler;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Server-tick scanner over the magic gear a player has equipped: main hand,
 * off hand and every Curios slot. Once a second it does two things.
 *
 * <ol>
 *   <li><b>Enchant bonuses.</b> {@code mana_capacity} (+5% max mana per level)
 *       and {@code mana_flow} (+5% mana regen per level) on any equipped
 *       modular spell book or magic weapon (wand / staff) are summed and
 *       applied as ONE attribute modifier per attribute, with a stable UUID
 *       (see {@link Bonus}). The modifier is replaced only when its value
 *       changed (an unchanged one is left alone, so the attribute isn't
 *       re-synced every second), so swapping gear takes effect within 1s.</li>
 *   <li><b>The icraft mirror.</b> Tetra module attributes of equipped modular
 *       books are mirrored into {@code icraft_book_<stat>} player NBT for the
 *       KubeJS damage / sync layer (see below).</li>
 * </ol>
 *
 * <p>Module and material stats themselves do NOT go through here: they are
 * ordinary item attribute modifiers, surfaced by each book's
 * {@code getAttributeModifiers}. The Phase 1-5 cover / pages NBT system
 * ("imodspells_slots") this class was originally written to apply was
 * retired in 6D and its code removed 2026-10; the two modifiers only that
 * system could write are stripped once at login (see
 * {@link #RETIRED_MODIFIERS}).
 *
 * <p>Why permanent modifiers (not transient): transient modifiers vanish
 * on player relog, then re-apply, then vanish again -- causes flicker.
 * Permanent modifiers persist; we just ensure idempotency by using the
 * same UUID per attribute.
 *
 * <p>Why server-tick (not LivingEquipmentChangeEvent): Curios fires its
 * own equip events; tracking them adds complexity without much benefit.
 * 1Hz polling for one item-instance check per slot per player is cheap.
 */
@Mod.EventBusSubscriber(modid = IridescentModularSpells.MODID,
        bus = Mod.EventBusSubscriber.Bus.FORGE)
public class AttributeApplier {

    /** Bonus per enchant level, as a MULTIPLY_BASE fraction (0.05 = +5%). */
    private static final double BONUS_PER_ENCHANT_LEVEL = 0.05;

    /**
     * What the enchant scan can grant: the attribute each bonus lands on and
     * the stable UUID that makes its modifier upsert-able.
     *
     * <p>There is deliberately no Ars-side entry. The unified mana pool
     * ({@code ArsManaCapMixin}) makes Ars read its mana cap straight from
     * {@code irons_spellbooks:max_mana} and turns Ars's own
     * {@code setMaxMana} into a no-op, so {@link #MAX_MANA} already IS the
     * Ars max-mana bonus -- a second "Ars max mana" modifier could only land
     * on the same attribute and double the enchant. Ars spell damage is not
     * an enchant bonus at all; the one thing that ever fed it here was the
     * retired cover system.
     */
    private enum Bonus {
        MAX_MANA("irons_spellbooks:max_mana", "8a1e0c01-2e1d-4f0a-9d1f-101000000002"),
        MANA_REGEN("irons_spellbooks:mana_regen", "8a1e0c01-2e1d-4f0a-9d1f-101000000003");

        final String attributeId;
        final UUID uuid;

        Bonus(String attributeId, String uuid) {
            this.attributeId = attributeId;
            this.uuid = UUID.fromString(uuid);
        }
    }

    private static final Bonus[] BONUSES = Bonus.values();

    /**
     * {attribute id, modifier UUID} of the bonuses only the retired cover /
     * pages system could produce (spell power, cooldown reduction). Nothing
     * writes them any more, but they were PERMANENT modifiers, so a player
     * who last logged out holding an old covered book still carries one in
     * their saved data. Stripped once per login.
     */
    private static final RetiredModifier[] RETIRED_MODIFIERS = {
            new RetiredModifier("irons_spellbooks:spell_power",
                    UUID.fromString("8a1e0c01-2e1d-4f0a-9d1f-101000000001")),
            new RetiredModifier("irons_spellbooks:cooldown_reduction",
                    UUID.fromString("8a1e0c01-2e1d-4f0a-9d1f-101000000004")),
    };

    private record RetiredModifier(String attributeId, UUID uuid) {}

    private static final String MODIFIER_NAME = "iridescent_modular_spells_bonus";

    @SubscribeEvent
    public static void onPlayerLoggedIn(PlayerEvent.PlayerLoggedInEvent event) {
        if (!(event.getEntity() instanceof ServerPlayer player)) return;
        try {
            for (RetiredModifier retired : RETIRED_MODIFIERS) {
                Attribute attr = resolveAttribute(retired.attributeId());
                if (attr == null) continue;
                AttributeInstance inst = player.getAttribute(attr);
                if (inst == null) continue;
                if (inst.getModifier(retired.uuid()) != null) inst.removeModifier(retired.uuid());
            }
        } catch (Throwable t) {
            IridescentModularSpells.LOGGER.warn(
                    "[modspells/attr] retired-modifier cleanup threw for {}: {}",
                    player.getGameProfile().getName(), t.toString());
        }
    }

    @SubscribeEvent
    public static void onPlayerTick(TickEvent.PlayerTickEvent event) {
        if (event.phase != TickEvent.Phase.END) return;
        if (!(event.player instanceof ServerPlayer player)) return;
        if (player.tickCount % 20 != 0) return;          // 1 Hz

        try {
            applyBonuses(player);
        } catch (Throwable t) {
            IridescentModularSpells.LOGGER.warn(
                    "[modspells/attr] applyBonuses threw for {}: {}",
                    player.getGameProfile().getName(), t.toString());
        }
        try {
            mirrorBookContributionsToIcraftNbt(player);
        } catch (Throwable t) {
            IridescentModularSpells.LOGGER.warn(
                    "[modspells/attr] icraft mirror threw for {}: {}",
                    player.getGameProfile().getName(), t.toString());
        }
    }

    // ===== Option A: pack-wide mirror layer =====
    //
    // Sums the Tetra material/module/improvement attribute deltas across
    // every equipped modular book and writes them under
    // `icraft_book_<stat>` NBT keys on the player. The kubejs `getAttr`
    // helper in attribute_sync.js reads `icraft_<stat> + icraft_book_<stat>`
    // so the unified damage hook + ISS sync layer pick up book bonuses
    // without us having to disturb the existing class-bonus pipeline.
    //
    // We intentionally cover only the three pack-wide stats: spell_power,
    // mana_regen, cooldown_reduction. max_mana has no icraft_<stat> layer to
    // mirror into: a book's max_mana modifier lands on irons_spellbooks:max_mana
    // directly, and that attribute is the cap of the one pool both ecosystems
    // share (ArsManaCapMixin).

    /** Source attribute id -> destination unified stat name.
     *  Post-2026-05-15 unified mana pool: the Ars perk attribute entries
     *  collapsed into the ISS ones. Single source per stat. */
    private static final Map<String, String> ICRAFT_MIRROR_MAP = new HashMap<>();
    static {
        ICRAFT_MIRROR_MAP.put("irons_spellbooks:spell_power",        "spell_power");
        ICRAFT_MIRROR_MAP.put("irons_spellbooks:mana_regen",         "mana_regen");
        ICRAFT_MIRROR_MAP.put("irons_spellbooks:cooldown_reduction", "cooldown_reduction");
    }

    private static final String[] ICRAFT_BOOK_NBT_KEYS = {
            "icraft_book_spell_power",
            "icraft_book_mana_regen",
            "icraft_book_cooldown_reduction"
    };

    private static void mirrorBookContributionsToIcraftNbt(ServerPlayer player) {
        Map<String, Double> totals = new HashMap<>();

        accumulateBookAttrs(player.getMainHandItem(), totals);
        accumulateBookAttrs(player.getOffhandItem(), totals);
        try {
            CuriosApi.getCuriosInventory(player).ifPresent(handler -> {
                var equipped = handler.getEquippedCurios();
                if (equipped == null) return;
                for (int i = 0; i < equipped.getSlots(); i++) {
                    accumulateBookAttrs(equipped.getStackInSlot(i), totals);
                }
            });
        } catch (Throwable t) { /* curios absent -- skip */ }

        CompoundTag pdata = player.getPersistentData();
        // Always write/clear the three keys so removing the book actually
        // drops the bonus on the next tick.
        for (String nbtKey : ICRAFT_BOOK_NBT_KEYS) {
            String stat = nbtKey.substring("icraft_book_".length());
            double v = totals.getOrDefault(stat, 0.0);
            if (v != 0.0) pdata.putDouble(nbtKey, v);
            else pdata.remove(nbtKey);
        }
    }

    private static void accumulateBookAttrs(ItemStack stack, Map<String, Double> totals) {
        if (stack == null || stack.isEmpty()) return;
        if (!(stack.getItem() instanceof ModularSpellBookItem)
                && !(stack.getItem() instanceof ModularArsSpellBookItem)) return;
        if (!(stack.getItem() instanceof IModularItem modular)) return;
        try {
            Multimap<Attribute, AttributeModifier> attrs = modular.getAttributeModifiersCached(stack);
            if (attrs == null || attrs.isEmpty()) return;
            attrs.forEach((attr, mod) -> {
                if (attr == null || mod == null) return;
                ResourceLocation rl = ForgeRegistries.ATTRIBUTES.getKey(attr);
                if (rl == null) return;
                String dest = ICRAFT_MIRROR_MAP.get(rl.toString());
                if (dest == null) return;
                totals.merge(dest, mod.getAmount(), Double::sum);
            });
        } catch (Throwable t) { /* Tetra cache miss -- skip */ }
    }

    private static void applyBonuses(ServerPlayer player) {
        // Per-bonus total across everything equipped, indexed by Bonus.ordinal().
        double[] totals = new double[BONUSES.length];

        scanStack(player.getMainHandItem(), totals);
        scanStack(player.getOffhandItem(), totals);

        // Curios slots
        try {
            CuriosApi.getCuriosInventory(player).ifPresent(handler ->
                    scanCurios(handler, totals));
        } catch (Throwable t) { /* curios absent or stack mismatch -- skip */ }

        // Apply (or remove) each attribute modifier
        for (Bonus bonus : BONUSES) {
            applyOrRemove(player, bonus, totals[bonus.ordinal()]);
        }
    }

    /**
     * Add the enchant-driven bonuses of one equipped stack. Modular books AND
     * magic weapons (wands / staves) count: "anything that goes on a book
     * goes on a wand" (operator, 2026-06-22) -- otherwise mana_capacity /
     * mana_flow would apply at the bench but be inert on a wand (the classic
     * silent no-op).
     *
     * <p>Crit-chance / crit-damage enchants are NOT applied to the attribute
     * system here -- they're read directly at LivingHurtEvent time by the
     * magic-crit hook (which already reads the held main-hand item, wand or
     * book).
     */
    private static void scanStack(ItemStack stack, double[] totals) {
        if (stack == null || stack.isEmpty()) return;
        Item item = stack.getItem();
        boolean isBook = item instanceof ModularSpellBookItem || item instanceof ModularArsSpellBookItem;
        if (!isBook && !MagicWeaponCategory.isMagicWeapon(stack)) return;

        int manaCap = ModEnchantmentRegistry.getLevel(stack, ModEnchantmentRegistry.MANA_CAPACITY);
        if (manaCap > 0) {
            // One pool for both ecosystems, so this is the Ars bonus too.
            totals[Bonus.MAX_MANA.ordinal()] += manaCap * BONUS_PER_ENCHANT_LEVEL;
        }
        int manaFlow = ModEnchantmentRegistry.getLevel(stack, ModEnchantmentRegistry.MANA_FLOW);
        if (manaFlow > 0) {
            totals[Bonus.MANA_REGEN.ordinal()] += manaFlow * BONUS_PER_ENCHANT_LEVEL;
        }
    }

    private static void scanCurios(ICuriosItemHandler handler, double[] totals) {
        var equipped = handler.getEquippedCurios();
        if (equipped == null) return;
        for (int i = 0; i < equipped.getSlots(); i++) {
            scanStack(equipped.getStackInSlot(i), totals);
        }
    }

    /**
     * Attribute id string -> resolved registry object, so the 1 Hz pass does
     * not re-parse a ResourceLocation and re-query the registry per key per
     * player. Only HITS are cached: a missing attribute (ISS absent / not yet
     * registered) is simply looked up again next pass.
     */
    private static final Map<String, Attribute> ATTRIBUTE_CACHE = new ConcurrentHashMap<>();

    private static Attribute resolveAttribute(String attributeId) {
        Attribute cached = ATTRIBUTE_CACHE.get(attributeId);
        if (cached != null) return cached;
        ResourceLocation id = ResourceLocation.tryParse(attributeId);
        if (id == null) return null;
        Attribute attr = ForgeRegistries.ATTRIBUTES.getValue(id);
        if (attr != null) ATTRIBUTE_CACHE.put(attributeId, attr);
        return attr;
    }

    private static void applyOrRemove(ServerPlayer player, Bonus bonus, double total) {
        Attribute attr = resolveAttribute(bonus.attributeId);
        if (attr == null) return;        // ISS absent or attribute not yet registered
        AttributeInstance inst = player.getAttribute(attr);
        if (inst == null) return;
        UUID uuid = bonus.uuid;

        AttributeModifier existing = inst.getModifier(uuid);
        if (total == 0.0) {
            if (existing != null) inst.removeModifier(uuid);
            return;
        }

        // Idempotent upsert. An unchanged bonus is left alone: remove + re-add
        // marks the attribute dirty, which re-syncs it to the client every
        // second for every book / wand holder for no change in value.
        if (existing != null) {
            if (existing.getOperation() == AttributeModifier.Operation.MULTIPLY_BASE
                    && Double.compare(existing.getAmount(), total) == 0) return;
            inst.removeModifier(uuid);
        }
        inst.addPermanentModifier(new AttributeModifier(
                uuid, MODIFIER_NAME, total, AttributeModifier.Operation.MULTIPLY_BASE));
    }
}
