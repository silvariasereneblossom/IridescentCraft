package com.iridescentcraft.modspells.event;

import com.google.common.collect.Multimap;
import com.iridescentcraft.modspells.IridescentModularSpells;
import com.iridescentcraft.modspells.enchant.ModEnchantmentRegistry;
import com.iridescentcraft.reforging.enchant.MagicWeaponCategory;
import com.iridescentcraft.modspells.item.ModularArsSpellBookItem;
import com.iridescentcraft.modspells.item.ModularSpellBookItem;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.item.ItemStack;
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

/**
 * Server-tick scanner that applies module bonuses from any equipped
 * {@link ModularSpellBookItem} to the holding player's attributes.
 *
 * <p>Approach: every 20 ticks (1s), find each modular spell book in
 * the player's mainhand / offhand / curios inventory, sum the slot
 * bonuses by attribute, and apply via a permanent attribute modifier
 * with a deterministic UUID per attribute. Each tick we replace the
 * modifier value, so a slot swap takes effect within 1s.
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

    /** Stable UUIDs per attribute key so modifiers are upsert-able. */
    private static final Map<ModularSpellBookItem.AttributeKey, UUID> MOD_UUIDS = new HashMap<>();
    static {
        MOD_UUIDS.put(ModularSpellBookItem.AttributeKey.SPELL_POWER,
                UUID.fromString("8a1e0c01-2e1d-4f0a-9d1f-101000000001"));
        MOD_UUIDS.put(ModularSpellBookItem.AttributeKey.MAX_MANA,
                UUID.fromString("8a1e0c01-2e1d-4f0a-9d1f-101000000002"));
        MOD_UUIDS.put(ModularSpellBookItem.AttributeKey.MANA_REGEN,
                UUID.fromString("8a1e0c01-2e1d-4f0a-9d1f-101000000003"));
        MOD_UUIDS.put(ModularSpellBookItem.AttributeKey.COOLDOWN_REDUCTION,
                UUID.fromString("8a1e0c01-2e1d-4f0a-9d1f-101000000004"));
    }

    private static final String MODIFIER_NAME = "iridescent_modular_spells_bonus";

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
    // mana_regen, cooldown_reduction. max_mana stays ecosystem-specific
    // because mana_pool_bonuses.js already cross-applies a global +25%
    // against both ISS and Ars max_mana attributes.

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
        // Collate per-attribute total across every modular book the player has
        Map<ModularSpellBookItem.AttributeKey, Double> totals = new HashMap<>();

        scanStack(player.getMainHandItem(), totals);
        scanStack(player.getOffhandItem(), totals);

        // Curios slots
        try {
            CuriosApi.getCuriosInventory(player).ifPresent(handler ->
                    scanCurios(handler, totals));
        } catch (Throwable t) { /* curios absent or stack mismatch -- skip */ }

        // Apply (or remove) each attribute modifier
        for (ModularSpellBookItem.AttributeKey key : ModularSpellBookItem.AttributeKey.values()) {
            double total = totals.getOrDefault(key, 0.0);
            applyOrRemove(player, key, total);
        }
    }

    private static void scanStack(ItemStack stack,
                                  Map<ModularSpellBookItem.AttributeKey, Double> totals) {
        if (stack.getItem() instanceof ModularSpellBookItem) {
            for (ModularSpellBookItem.AttributeKey key : ModularSpellBookItem.AttributeKey.values()) {
                double v = ModularSpellBookItem.getTotalBonus(stack, key);
                if (v != 0.0) totals.merge(key, v, Double::sum);
            }
        } else if (stack.getItem() instanceof ModularArsSpellBookItem) {
            // Phase 3: Ars cloth-cover modular books -- same key set, different bonus map
            for (ModularSpellBookItem.AttributeKey key : ModularSpellBookItem.AttributeKey.values()) {
                double v = ModularArsSpellBookItem.getTotalBonus(stack, key);
                if (v != 0.0) totals.merge(key, v, Double::sum);
            }
        } else if (!MagicWeaponCategory.isMagicWeapon(stack)) {
            return; // not a modular book NOR a magic weapon (wand/staff) -> skip
        }
        // Magic weapons (wands/staves) fall through here: no book-slot bonuses,
        // but they DO get the enchant-driven bonuses below, so mana_capacity /
        // mana_flow on a wand actually do something -- "anything that goes on a
        // book goes on a wand" (operator, 2026-06-22). Otherwise the enchant
        // would apply at the bench but be inert (the classic silent no-op).

        // Phase 4: enchant-driven bonuses (in addition to any slot-material
        // bonuses above). Each level adds 5% to the relevant attribute.
        // Crit-chance/damage enchants are NOT applied to the attribute system
        // here -- they're read directly at LivingHurtEvent time by the magic-crit
        // hook (which already reads the held main-hand item, wand or book).
        int manaCap = ModEnchantmentRegistry.getLevel(stack, ModEnchantmentRegistry.MANA_CAPACITY);
        if (manaCap > 0) {
            totals.merge(ModularSpellBookItem.AttributeKey.MAX_MANA,
                         manaCap * 0.05, Double::sum);
            // ISS Ars synergy: Ars books with mana_capacity also boost Ars mana
            totals.merge(ModularSpellBookItem.AttributeKey.ARS_MAX_MANA,
                         manaCap * 0.05, Double::sum);
        }
        int manaFlow = ModEnchantmentRegistry.getLevel(stack, ModEnchantmentRegistry.MANA_FLOW);
        if (manaFlow > 0) {
            totals.merge(ModularSpellBookItem.AttributeKey.MANA_REGEN,
                         manaFlow * 0.05, Double::sum);
        }
    }

    private static void scanCurios(ICuriosItemHandler handler,
                                   Map<ModularSpellBookItem.AttributeKey, Double> totals) {
        var equipped = handler.getEquippedCurios();
        if (equipped == null) return;
        for (int i = 0; i < equipped.getSlots(); i++) {
            scanStack(equipped.getStackInSlot(i), totals);
        }
    }

    private static void applyOrRemove(ServerPlayer player,
                                      ModularSpellBookItem.AttributeKey key,
                                      double total) {
        Attribute attr = ForgeRegistries.ATTRIBUTES.getValue(
                ResourceLocation.tryParse(key.attributeId));
        if (attr == null) return;        // ISS absent or attribute not yet registered
        AttributeInstance inst = player.getAttribute(attr);
        if (inst == null) return;
        UUID uuid = MOD_UUIDS.get(key);
        if (uuid == null) return;

        // Remove existing modifier (idempotent upsert)
        AttributeModifier existing = inst.getModifier(uuid);
        if (existing != null) inst.removeModifier(uuid);

        if (total != 0.0) {
            AttributeModifier m = new AttributeModifier(
                    uuid, MODIFIER_NAME, total, AttributeModifier.Operation.MULTIPLY_BASE);
            inst.addPermanentModifier(m);
        }
    }
}
