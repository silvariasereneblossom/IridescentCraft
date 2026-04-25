package com.iridescentcraft.modspells.event;

import com.iridescentcraft.modspells.IridescentModularSpells;
import com.iridescentcraft.modspells.item.ModularSpellBookItem;
import net.minecraft.core.registries.Registries;
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
        if (!(stack.getItem() instanceof ModularSpellBookItem)) return;
        for (ModularSpellBookItem.AttributeKey key : ModularSpellBookItem.AttributeKey.values()) {
            double v = ModularSpellBookItem.getTotalBonus(stack, key);
            if (v != 0.0) totals.merge(key, v, Double::sum);
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
