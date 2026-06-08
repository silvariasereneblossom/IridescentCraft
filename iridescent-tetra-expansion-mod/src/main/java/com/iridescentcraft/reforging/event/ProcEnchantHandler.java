package com.iridescentcraft.reforging.event;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.EnchantmentHelper;

import net.minecraftforge.event.entity.living.MobEffectEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

import io.redspace.ironsspellbooks.api.events.SpellDamageEvent;
import io.redspace.ironsspellbooks.api.events.SpellOnCastEvent;
import io.redspace.ironsspellbooks.api.magic.MagicData;
import io.redspace.ironsspellbooks.api.registry.AttributeRegistry;
import io.redspace.ironsspellbooks.damage.SpellDamageSource;

import com.iridescentcraft.reforging.IridescentReforging;
import com.iridescentcraft.reforging.enchant.IcraftEnchantments;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * Effect handlers for the three magic-weapon "proc" enchants that were
 * registered but unimplemented (stubs) until 2026-06-08 (docket #100). All
 * three are max-level 3 on the magic-weapon category (held main/off hand):
 *
 * <ul>
 *   <li><b>Resonance</b> -- while a book carrying it is held, beneficial potion
 *       effects you gain last +50% longer per level (L1 1.5x .. L3 2.5x).
 *       Harmful effects are untouched.</li>
 *   <li><b>Mana Siphon</b> -- on a spell hit, 5%/level of the spell damage
 *       dealt returns to the caster's mana, capped at 20/30/40 mana per
 *       second to stop siphon-trains.</li>
 *   <li><b>Spell Echo</b> -- on cast, 5%/level chance for that cast to cost
 *       ZERO mana ("the echo pays for it"), on a 30/20/10-tick internal
 *       cooldown. <b>Design note:</b> the original spec said "re-cast the
 *       same spell"; ISS exposes no safe programmatic recast (re-invoking a
 *       spell risks recursion / wrong targeting / double-charge spells), and
 *       this can't be iterated in-game from the dev box, so we implement the
 *       safe faithful reading -- a free cast via {@code setManaCost(0)} -- and
 *       the lang description matches the implementation. Revisit literal
 *       recast only with in-game iteration.</li>
 * </ul>
 *
 * Owned by Forge via {@code @Mod.EventBusSubscriber} (not the KubeJS-driven
 * {@link ForgeEventRegistry}) because these are mod-native enchant effects,
 * not script policy. Per-player transient state is keyed by UUID and cleared
 * on logout. All ISS API verified against the pinned irons_spellbooks
 * 3.15.5.1 jar.
 */
@Mod.EventBusSubscriber(modid = IridescentReforging.MODID, bus = Mod.EventBusSubscriber.Bus.FORGE)
public final class ProcEnchantHandler {

    private static final Logger LOG = LogManager.getLogger("proc_enchants");

    // Re-entrancy guard: addEffect() inside the Added handler re-fires Added.
    private static final ThreadLocal<Boolean> RESONANCE_GUARD =
            ThreadLocal.withInitial(() -> Boolean.FALSE);

    // Spell Echo: last proc tick per player (player.tickCount domain).
    private static final Map<UUID, Long> ECHO_LAST = new ConcurrentHashMap<>();

    // Mana Siphon: per-second accumulation window per player.
    private static final Map<UUID, SiphonWindow> SIPHON = new ConcurrentHashMap<>();

    private ProcEnchantHandler() {}

    /** Highest level of {@code ench} across the holder's main + off hand. */
    private static int heldLevel(LivingEntity e, Enchantment ench) {
        int main = EnchantmentHelper.getItemEnchantmentLevel(ench, e.getMainHandItem());
        int off  = EnchantmentHelper.getItemEnchantmentLevel(ench, e.getOffhandItem());
        return Math.max(main, off);
    }

    // ── Resonance ────────────────────────────────────────────────────────────
    @SubscribeEvent
    public static void onEffectAdded(MobEffectEvent.Added event) {
        if (Boolean.TRUE.equals(RESONANCE_GUARD.get())) return;       // our own re-add
        if (!(event.getEntity() instanceof Player player)) return;
        if (player.level().isClientSide) return;

        MobEffectInstance inst = event.getEffectInstance();
        if (inst == null) return;
        if (inst.getEffect().getCategory() != MobEffectCategory.BENEFICIAL) return;
        // Skip absurd/sentinel durations to avoid overflow on re-add.
        if (inst.getDuration() <= 0 || inst.getDuration() > 1_000_000) return;

        int lvl = heldLevel(player, IcraftEnchantments.RESONANCE.get());
        if (lvl <= 0) return;

        double mult = 1.0 + 0.5 * lvl;                                // L1 1.5x .. L3 2.5x
        long extended = (long) Math.floor(inst.getDuration() * mult);
        int newDur = (int) Math.min(extended, 1_000_000L);
        if (newDur <= inst.getDuration()) return;

        MobEffectInstance doubled = new MobEffectInstance(
                inst.getEffect(), newDur, inst.getAmplifier(),
                inst.isAmbient(), inst.isVisible(), inst.showIcon());

        RESONANCE_GUARD.set(Boolean.TRUE);
        try {
            player.addEffect(doubled);
        } catch (Throwable t) {
            LOG.warn("[resonance] re-apply failed for {}: {}", player.getGameProfile().getName(), t.toString());
        } finally {
            RESONANCE_GUARD.set(Boolean.FALSE);
        }
    }

    // ── Mana Siphon ──────────────────────────────────────────────────────────
    @SubscribeEvent
    public static void onSpellDamage(SpellDamageEvent event) {
        SpellDamageSource src = event.getSpellDamageSource();
        if (src == null) return;
        if (!(src.getEntity() instanceof Player player)) return;     // the caster
        if (player.level().isClientSide) return;

        int lvl = heldLevel(player, IcraftEnchantments.MANA_SIPHON.get());
        if (lvl <= 0) return;

        float gain = event.getAmount() * (0.05f * lvl);              // 5/10/15%
        if (gain <= 0f) return;

        float cap = 10f + 10f * lvl;                                  // 20/30/40 per second
        int second = player.tickCount / 20;
        SiphonWindow w = SIPHON.computeIfAbsent(player.getUUID(), k -> new SiphonWindow());
        if (w.second != second) { w.second = second; w.accumulated = 0f; }
        float allowed = cap - w.accumulated;
        if (allowed <= 0f) return;
        if (gain > allowed) gain = allowed;
        w.accumulated += gain;

        MagicData md = MagicData.getPlayerMagicData(player);
        if (md == null) return;
        double max = player.getAttributeValue(AttributeRegistry.MAX_MANA.get());
        float newMana = Math.min(md.getMana() + gain, (float) max);
        if (newMana > md.getMana()) md.setMana(newMana);             // ISS regen tick re-syncs to client
    }

    // ── Spell Echo ───────────────────────────────────────────────────────────
    @SubscribeEvent
    public static void onSpellCast(SpellOnCastEvent event) {
        Player player = event.getEntity();
        if (player == null || player.level().isClientSide) return;

        int lvl = heldLevel(player, IcraftEnchantments.SPELL_ECHO.get());
        if (lvl <= 0) return;

        int cooldown = 40 - 10 * lvl;                                // 30/20/10 ticks
        long now = player.tickCount;
        Long last = ECHO_LAST.get(player.getUUID());
        if (last != null && (now - last) < cooldown) return;

        float chance = 0.05f * lvl;                                  // 5/10/15%
        if (player.getRandom().nextFloat() >= chance) return;

        ECHO_LAST.put(player.getUUID(), now);
        event.setManaCost(0);                                        // free cast — safe, no re-invocation
    }

    // ── Cleanup ──────────────────────────────────────────────────────────────
    @SubscribeEvent
    public static void onLogout(PlayerEvent.PlayerLoggedOutEvent event) {
        UUID id = event.getEntity().getUUID();
        ECHO_LAST.remove(id);
        SIPHON.remove(id);
    }

    private static final class SiphonWindow {
        int second = -1;
        float accumulated = 0f;
    }
}
