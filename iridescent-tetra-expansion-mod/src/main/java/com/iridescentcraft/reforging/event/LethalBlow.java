package com.iridescentcraft.reforging.event;

import com.iridescentcraft.reforging.IridescentReforging;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import net.minecraft.world.entity.LivingEntity;
import net.minecraftforge.event.entity.living.LivingDamageEvent;
import net.minecraftforge.eventbus.api.EventPriority;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

/**
 * Makes a "this hit kills" decision stick through armor.
 *
 * <p>The Vorpal / Arcane Vorpal decapitation handlers (KubeJS, registered on
 * {@link DamageModifierRegistry}) run on {@code LivingHurtEvent}, which is BEFORE mitigation: armor
 * (in this pack ApothicAttributes' armor formula), protection enchantments, resistance and absorption
 * are all applied afterwards. Setting the hurt amount to "health + 1" there left a 10-armor mob alive
 * with a few hit points -- a decapitation that does not decapitate.
 *
 * <p>Operator ruling 2026-10-11: a Java hook. A handler calls {@link #mark(LivingEntity)} for the
 * victim during the hurt event; this class then raises the FINAL damage (the amount of
 * {@code LivingDamageEvent}, after every reduction, right before health is subtracted) to the
 * victim's remaining health + 1. It never lowers a hit that is already lethal, and it does nothing
 * for a victim nobody marked.
 *
 * <p>A mark is good for the game tick it was made in and is consumed by the first damage event of
 * that victim; a hurt that gets cancelled or reduced to nothing after the mark never reaches the
 * damage event, and its stale mark is dropped on the next use. Who may be marked (not players, not
 * bosses) is the caller's rule -- the scripts keep those checks.
 */
@Mod.EventBusSubscriber(modid = IridescentReforging.MODID, bus = Mod.EventBusSubscriber.Bus.FORGE)
public final class LethalBlow {

    /** entity id (unique per JVM) -> game time of the hurt that marked it. Server thread only. */
    private static final Map<Integer, Long> MARKED = new ConcurrentHashMap<>();

    private LethalBlow() {}

    /** Called by a hurt handler: the hit being processed for {@code victim} must kill it. */
    public static void mark(LivingEntity victim) {
        if (victim == null || victim.level().isClientSide) return;
        long now = victim.level().getGameTime();
        if (MARKED.size() > 32) {
            MARKED.values().removeIf(time -> time != now);   // marks whose hurt never arrived
        }
        MARKED.put(victim.getId(), now);
    }

    // LOWEST: after every other damage-event listener has had its say on the amount.
    @SubscribeEvent(priority = EventPriority.LOWEST)
    public static void onLivingDamage(LivingDamageEvent event) {
        if (MARKED.isEmpty()) return;
        LivingEntity victim = event.getEntity();
        Long markedAt = MARKED.remove(victim.getId());
        if (markedAt == null || markedAt != victim.level().getGameTime()) return;
        // Absorption has already been taken off before this event; what is left comes off health.
        float lethal = victim.getHealth() + 1.0F;
        if (lethal > event.getAmount()) {
            event.setAmount(lethal);
        }
    }
}
