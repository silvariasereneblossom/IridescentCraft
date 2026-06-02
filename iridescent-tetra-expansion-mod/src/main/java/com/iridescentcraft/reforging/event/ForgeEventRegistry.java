package com.iridescentcraft.reforging.event;

import com.iridescentcraft.reforging.IridescentReforging;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import net.minecraftforge.event.entity.living.LivingDropsEvent;
import net.minecraftforge.event.entity.living.LivingExperienceDropEvent;
import net.minecraftforge.event.entity.living.LivingKnockBackEvent;
import net.minecraftforge.event.entity.living.MobEffectEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

import com.hollingsworth.arsnouveau.api.event.SpellDamageEvent;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * Java-side dispatcher for the remaining Forge (and one Ars) events that
 * KubeJS scripts need to mutate but that have no settable KubeJS-native
 * wrapper and no other mod registry -- the catch-all sibling of
 * {@link DamageModifierRegistry} (LivingHurtEvent) and
 * {@link ItemAttributeRegistry} (ItemAttributeModifierEvent).
 *
 * <p><b>Why this exists.</b> Same reload-safety problem documented on
 * {@link ItemAttributeRegistry}: a raw
 * {@code MinecraftForge.EVENT_BUS.addListener(..., jsConsumer)} leaves the JS
 * closure on the Forge bus, and KubeJS's {@code ScriptType.unload()} cannot
 * remove it, so after a context dispose (client resource reload for startup
 * scripts; every {@code /reload} for server scripts) the next fire crashes at
 * {@code ScriptRuntime.enterActivationFunction} with a dead Rhino scope. Here
 * the {@code @SubscribeEvent} listeners are owned by the mod (registered once
 * by Forge via {@code @Mod.EventBusSubscriber}); JS callbacks are only DATA in
 * static maps keyed by stable string ids, and re-running a (re)loaded script
 * REPLACES its entry via {@code register*(sameId, fn)} -- no stale closure is
 * ever invoked.
 *
 * <p>Each event family gets its own {@code registerXxx(id, fn)} +
 * {@code unregisterXxx(id)}. Handlers receive the RAW event, so every getter/
 * setter the scripts already use works unchanged
 * ({@code event.setStrength}, {@code event.setResult},
 * {@code event.setDroppedExperience}, {@code event.getDrops().remove(..)},
 * {@code event.damage = ..}).
 *
 * <p>Priority note: the original raw listeners used assorted Forge priorities
 * (e.g. {@code LOWEST} for the drop strip so it runs after affix-drop adders).
 * Forge dispatches all {@code @SubscribeEvent} handlers at one priority per
 * subscriber method; these dispatchers run at {@code NORMAL}, except
 * {@link #onLivingDrops} which is pinned to {@code LOWEST} to preserve the
 * "strip last, after other drop mutators" ordering the strip layer depends on.
 */
@Mod.EventBusSubscriber(modid = IridescentReforging.MODID, bus = Mod.EventBusSubscriber.Bus.FORGE)
public final class ForgeEventRegistry {

    private static final Logger LOG = LogManager.getLogger("forge_event_registry");

    private ForgeEventRegistry() {}

    @FunctionalInterface public interface KnockBackHandler { void accept(LivingKnockBackEvent event); }
    @FunctionalInterface public interface MobEffectApplicableHandler { void accept(MobEffectEvent.Applicable event); }
    @FunctionalInterface public interface ExperienceDropHandler { void accept(LivingExperienceDropEvent event); }
    @FunctionalInterface public interface DropsHandler { void accept(LivingDropsEvent event); }
    @FunctionalInterface public interface SpellDamagePreHandler { void accept(SpellDamageEvent.Pre event); }

    private static final Map<String, KnockBackHandler> KNOCKBACK = new ConcurrentHashMap<>();
    private static final Map<String, MobEffectApplicableHandler> EFFECT_APPLICABLE = new ConcurrentHashMap<>();
    private static final Map<String, ExperienceDropHandler> XP_DROP = new ConcurrentHashMap<>();
    private static final Map<String, DropsHandler> DROPS = new ConcurrentHashMap<>();
    private static final Map<String, SpellDamagePreHandler> SPELL_DAMAGE_PRE = new ConcurrentHashMap<>();

    // ── LivingKnockBackEvent ────────────────────────────────────────────────
    public static void registerKnockBack(String key, KnockBackHandler handler) {
        if (key != null && handler != null) KNOCKBACK.put(key, handler);
    }
    public static boolean unregisterKnockBack(String key) {
        return key != null && KNOCKBACK.remove(key) != null;
    }

    // ── MobEffectEvent.Applicable ───────────────────────────────────────────
    public static void registerEffectApplicable(String key, MobEffectApplicableHandler handler) {
        if (key != null && handler != null) EFFECT_APPLICABLE.put(key, handler);
    }
    public static boolean unregisterEffectApplicable(String key) {
        return key != null && EFFECT_APPLICABLE.remove(key) != null;
    }

    // ── LivingExperienceDropEvent ───────────────────────────────────────────
    public static void registerExperienceDrop(String key, ExperienceDropHandler handler) {
        if (key != null && handler != null) XP_DROP.put(key, handler);
    }
    public static boolean unregisterExperienceDrop(String key) {
        return key != null && XP_DROP.remove(key) != null;
    }

    // ── LivingDropsEvent ────────────────────────────────────────────────────
    public static void registerDrops(String key, DropsHandler handler) {
        if (key != null && handler != null) DROPS.put(key, handler);
    }
    public static boolean unregisterDrops(String key) {
        return key != null && DROPS.remove(key) != null;
    }

    // ── Ars SpellDamageEvent.Pre ────────────────────────────────────────────
    public static void registerSpellDamagePre(String key, SpellDamagePreHandler handler) {
        if (key != null && handler != null) SPELL_DAMAGE_PRE.put(key, handler);
    }
    public static boolean unregisterSpellDamagePre(String key) {
        return key != null && SPELL_DAMAGE_PRE.remove(key) != null;
    }

    // ── Dispatchers ─────────────────────────────────────────────────────────

    @SubscribeEvent
    public static void onKnockBack(LivingKnockBackEvent event) {
        if (KNOCKBACK.isEmpty()) return;
        for (Map.Entry<String, KnockBackHandler> e : KNOCKBACK.entrySet()) {
            try { e.getValue().accept(event); } catch (Throwable t) { warn("knockback", e.getKey(), t); }
        }
    }

    @SubscribeEvent
    public static void onEffectApplicable(MobEffectEvent.Applicable event) {
        if (EFFECT_APPLICABLE.isEmpty()) return;
        for (Map.Entry<String, MobEffectApplicableHandler> e : EFFECT_APPLICABLE.entrySet()) {
            try { e.getValue().accept(event); } catch (Throwable t) { warn("effect_applicable", e.getKey(), t); }
        }
    }

    @SubscribeEvent
    public static void onExperienceDrop(LivingExperienceDropEvent event) {
        if (XP_DROP.isEmpty()) return;
        for (Map.Entry<String, ExperienceDropHandler> e : XP_DROP.entrySet()) {
            try { e.getValue().accept(event); } catch (Throwable t) { warn("xp_drop", e.getKey(), t); }
        }
    }

    // LOWEST so the drop strip runs after affix / scaling drop ADDERS, matching
    // the original strip_anomalous_drops EventPriority.LOWEST registration.
    @SubscribeEvent(priority = net.minecraftforge.eventbus.api.EventPriority.LOWEST)
    public static void onLivingDrops(LivingDropsEvent event) {
        if (DROPS.isEmpty()) return;
        for (Map.Entry<String, DropsHandler> e : DROPS.entrySet()) {
            try { e.getValue().accept(event); } catch (Throwable t) { warn("drops", e.getKey(), t); }
        }
    }

    @SubscribeEvent
    public static void onSpellDamagePre(SpellDamageEvent.Pre event) {
        if (SPELL_DAMAGE_PRE.isEmpty()) return;
        for (Map.Entry<String, SpellDamagePreHandler> e : SPELL_DAMAGE_PRE.entrySet()) {
            try { e.getValue().accept(event); } catch (Throwable t) { warn("spell_damage_pre", e.getKey(), t); }
        }
    }

    private static void warn(String family, String key, Throwable t) {
        LOG.warn("[forge_event_registry] {} handler '{}' threw {}: {}",
                family, key, t.getClass().getSimpleName(), t.getMessage());
    }
}
