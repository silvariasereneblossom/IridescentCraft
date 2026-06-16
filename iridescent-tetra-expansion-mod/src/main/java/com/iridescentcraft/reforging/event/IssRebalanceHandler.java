package com.iridescentcraft.reforging.event;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.player.Player;

import net.minecraftforge.event.TickEvent;
import net.minecraftforge.event.entity.living.LivingDeathEvent;
import net.minecraftforge.event.entity.living.MobEffectEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.eventbus.api.Event;
import net.minecraftforge.eventbus.api.EventPriority;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.registries.ForgeRegistries;

import io.redspace.ironsspellbooks.api.events.SpellDamageEvent;
import io.redspace.ironsspellbooks.api.events.SpellOnCastEvent;
import io.redspace.ironsspellbooks.api.events.SpellPreCastEvent;
import io.redspace.ironsspellbooks.api.magic.MagicData;
import io.redspace.ironsspellbooks.api.registry.AttributeRegistry;
import io.redspace.ironsspellbooks.api.registry.SchoolRegistry;
import io.redspace.ironsspellbooks.api.registry.SpellRegistry;
import io.redspace.ironsspellbooks.api.spells.AbstractSpell;
import io.redspace.ironsspellbooks.damage.SpellDamageSource;
import io.redspace.ironsspellbooks.registries.MobEffectRegistry;

import com.iridescentcraft.reforging.IridescentReforging;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * IridescentCraft ISS rebalance: three mod-native policy changes layered on top
 * of Iron's Spellbooks 3.15.5.1 without forking the mod. Owned by Forge via
 * {@code @Mod.EventBusSubscriber} (mod-native rules, not KubeJS script policy),
 * sibling to {@link ProcEnchantHandler}. All ISS API verified against the
 * pinned irons_spellbooks 3.15.5.1 jar (2026-06-15).
 *
 * <ul>
 *   <li><b>Change 1 — mana inflation.</b> Every mana-consuming ISS cast costs
 *       {@code 5x} its base mana at spell level 1, ramping linearly to
 *       {@code 15x} at level 10+. The config {@code mana_cost_multiplier} is
 *       flat (can't scale by level), so we scale in {@link SpellOnCastEvent}.
 *       ISS's affordability gate ({@code canBeCastedBy}) only checks the
 *       <i>base</i> cost and fires BEFORE the event, so raising the deduction
 *       alone would let a player start a cast they can't pay for (negative mana
 *       on deduction). We therefore add a {@link SpellPreCastEvent} gate that
 *       cancels the cast when current mana &lt; the scaled cost. Runs at
 *       {@code HIGH} priority so {@link ProcEnchantHandler}'s NORMAL-priority
 *       Spell Echo can still zero the (scaled) cost after us — a free cast
 *       still wins.</li>
 *   <li><b>Change 2 — Angel Wings becomes a combat ascension.</b> The native
 *       {@code irons_spellbooks:angel_wing} flight effect is suppressed
 *       (denied in {@link MobEffectEvent.Applicable}) and replaced with a
 *       powerful, time-limited combat buff bundle (Strength, Resistance,
 *       Absorption, Slow Falling, plus transient ISS spell-power and mana-regen
 *       modifiers). Cooldown raised to 5 min via the per-spell config (×3
 *       distro). Magnitudes/duration are PROVISIONAL — flagged for a feel-pass.</li>
 *   <li><b>Change 3 — priest-kill holy curse.</b> Killing a friendly
 *       {@code irons_spellbooks:priest} stamps the killer's death-persistent
 *       NBT ({@code PlayerPersisted/icraft_priest_curse_until}) with a 24
 *       <i>real-hour</i> expiry; while cursed, the killer's own HOLY-school
 *       spell damage is halved (in {@link SpellDamageEvent}). The timer is
 *       wall-clock so it survives logout AND death.</li>
 * </ul>
 */
@Mod.EventBusSubscriber(modid = IridescentReforging.MODID, bus = Mod.EventBusSubscriber.Bus.FORGE)
public final class IssRebalanceHandler {

    private static final Logger LOG = LogManager.getLogger("iss_rebalance");

    private IssRebalanceHandler() {}

    // ── Change 1: mana cost scaling 5x (L1) .. 15x (L10+) ────────────────────
    // PROVISIONAL ramp. cost = base * (5 + (clamp(level,1..10)-1) * 10/9).
    private static final double MANA_MULT_L1   = 5.0;
    private static final double MANA_MULT_TOP  = 15.0;
    private static final int    MANA_TOP_LEVEL = 10;

    static int scaledManaCost(int baseCost, int level) {
        if (baseCost <= 0) return baseCost;
        int lv = Math.max(1, Math.min(level, MANA_TOP_LEVEL));
        double mult = MANA_MULT_L1 + (lv - 1) * (MANA_MULT_TOP - MANA_MULT_L1) / (MANA_TOP_LEVEL - 1);
        long scaled = Math.round(baseCost * mult);
        return (int) Math.min(scaled, Integer.MAX_VALUE);
    }

    // ── Change 2: Angel Wings combat buff ────────────────────────────────────
    private static final String ANGEL_WING_ID = "irons_spellbooks:angel_wing";
    // PROVISIONAL: 40 s @ 20 TPS. Operator asked for ~30-45 s.
    private static final int ANGEL_BUFF_TICKS = 800;
    // PROVISIONAL "very powerful" bundle. Amplifier is 0-indexed (n => level n+1).
    private static final int ANGEL_STRENGTH_AMP   = 1;   // Strength II  (+6 melee dmg)
    private static final int ANGEL_RESISTANCE_AMP = 1;   // Resistance II (40% damage reduction)
    private static final int ANGEL_ABSORPTION_AMP = 2;   // Absorption III (+12 absorption HP)
    private static final double ANGEL_SPELL_POWER_BONUS = 0.5;  // +0.5 ADDITION on ISS SPELL_POWER (base 1.0 -> 1.5)
    private static final double ANGEL_MANA_REGEN_BONUS  = 2.0;  // +200% MANA_REGEN (MULTIPLY_TOTAL)
    private static final UUID ANGEL_SPELL_POWER_UUID = UUID.fromString("a7c3e1f0-1b2c-4d3e-8f90-0a1b2c3d4e5f");
    private static final UUID ANGEL_MANA_REGEN_UUID  = UUID.fromString("b8d4f2a1-2c3d-4e5f-9a01-1b2c3d4e5f60");
    // player UUID -> server-tick expiry for the two transient attribute modifiers
    // (the vanilla mob effects above auto-expire on their own; only the ISS
    // attribute modifiers need manual removal).
    private static final Map<UUID, Long> ANGEL_BUFF_EXPIRY = new ConcurrentHashMap<>();

    // ── Change 3: priest-kill holy curse ─────────────────────────────────────
    private static final ResourceLocation PRIEST_ID = new ResourceLocation("irons_spellbooks", "priest");
    private static final String CURSE_KEY = "icraft_priest_curse_until";
    private static final long CURSE_DURATION_MS = 86_400_000L;  // 24 real hours
    private static final float HOLY_CURSE_MULT = 0.5f;

    // ── Change 1: scale the mana deduction (HIGH, before Spell Echo) ──────────
    @SubscribeEvent(priority = EventPriority.HIGH)
    public static void onSpellCast(SpellOnCastEvent event) {
        Player player = event.getEntity();
        if (player == null || player.level().isClientSide) return;

        // Mana inflation — only when the cast actually consumes mana (skips
        // scrolls / mob / command casts). Use getOriginalManaCost() so we scale
        // the pristine ISS-computed cost regardless of other handlers.
        if (event.getCastSource().consumesMana()) {
            event.setManaCost(scaledManaCost(event.getOriginalManaCost(), event.getSpellLevel()));
        }

        // Change 2: Angel Wings -> combat buff. Flight itself is suppressed in
        // onEffectApplicable; here we grant the replacement bundle to the caster.
        if (ANGEL_WING_ID.equals(event.getSpellId())) {
            applyAngelWingsBuff(player);
        }
    }

    // ── Change 1: gate the cast on the SCALED cost ───────────────────────────
    @SubscribeEvent
    public static void onSpellPreCast(SpellPreCastEvent event) {
        Player player = event.getEntity();
        if (player == null || player.level().isClientSide) return;
        if (player.isCreative() || player.isSpectator()) return;
        if (!event.getCastSource().consumesMana()) return;

        AbstractSpell spell = SpellRegistry.getSpell(event.getSpellId());
        if (spell == null) return;
        int level = event.getSpellLevel();
        int baseCost = spell.getManaCost(level);          // == SpellOnCastEvent#getOriginalManaCost
        if (baseCost <= 0) return;                          // free / NoneSpell — nothing to gate

        int newCost = scaledManaCost(baseCost, level);
        MagicData md = MagicData.getPlayerMagicData(player);
        if (md == null) return;
        if (md.getMana() < newCost) {
            event.setCanceled(true);
            player.displayClientMessage(Component.literal("Not enough mana for that spell."), true);
        }
    }

    // ── Change 2: deny the native Angel Wings flight effect, pack-wide ────────
    @SubscribeEvent
    public static void onEffectApplicable(MobEffectEvent.Applicable event) {
        MobEffectInstance inst = event.getEffectInstance();
        if (inst != null && inst.getEffect() == MobEffectRegistry.ANGEL_WINGS.get()) {
            event.setResult(Event.Result.DENY);
        }
    }

    private static void applyAngelWingsBuff(Player player) {
        // Auto-expiring vanilla effects: physical power, mitigation, survivability,
        // and Slow Falling in place of the removed flight. PROVISIONAL magnitudes.
        player.addEffect(new MobEffectInstance(MobEffects.DAMAGE_BOOST,      ANGEL_BUFF_TICKS, ANGEL_STRENGTH_AMP));
        player.addEffect(new MobEffectInstance(MobEffects.DAMAGE_RESISTANCE, ANGEL_BUFF_TICKS, ANGEL_RESISTANCE_AMP));
        player.addEffect(new MobEffectInstance(MobEffects.ABSORPTION,        ANGEL_BUFF_TICKS, ANGEL_ABSORPTION_AMP));
        player.addEffect(new MobEffectInstance(MobEffects.SLOW_FALLING,      ANGEL_BUFF_TICKS, 0));

        // ISS attribute buffs have no off-the-shelf timed effect: apply transient
        // modifiers now, removed at expiry by onPlayerTick. PROVISIONAL magnitudes.
        addTransient(player, AttributeRegistry.SPELL_POWER.get(), ANGEL_SPELL_POWER_UUID,
                "icraft_angel_spell_power", ANGEL_SPELL_POWER_BONUS, AttributeModifier.Operation.ADDITION);
        addTransient(player, AttributeRegistry.MANA_REGEN.get(), ANGEL_MANA_REGEN_UUID,
                "icraft_angel_mana_regen", ANGEL_MANA_REGEN_BONUS, AttributeModifier.Operation.MULTIPLY_TOTAL);

        ANGEL_BUFF_EXPIRY.put(player.getUUID(), (long) player.tickCount + ANGEL_BUFF_TICKS);
    }

    private static void addTransient(Player player, Attribute attr, UUID id, String name,
                                     double amount, AttributeModifier.Operation op) {
        if (attr == null) return;
        AttributeInstance inst = player.getAttribute(attr);
        if (inst == null) return;
        inst.removeModifier(id);                            // clear prior (re-cast refresh)
        inst.addTransientModifier(new AttributeModifier(id, name, amount, op));
    }

    private static void removeTransient(Player player, Attribute attr, UUID id) {
        if (attr == null) return;
        AttributeInstance inst = player.getAttribute(attr);
        if (inst != null) inst.removeModifier(id);
    }

    // ── Change 2: expire the transient Angel Wings attribute modifiers ───────
    @SubscribeEvent
    public static void onPlayerTick(TickEvent.PlayerTickEvent event) {
        if (event.phase != TickEvent.Phase.END) return;
        if (ANGEL_BUFF_EXPIRY.isEmpty()) return;
        Player player = event.player;
        if (player.level().isClientSide) return;
        Long expiry = ANGEL_BUFF_EXPIRY.get(player.getUUID());
        if (expiry == null || player.tickCount < expiry) return;
        removeTransient(player, AttributeRegistry.SPELL_POWER.get(), ANGEL_SPELL_POWER_UUID);
        removeTransient(player, AttributeRegistry.MANA_REGEN.get(), ANGEL_MANA_REGEN_UUID);
        ANGEL_BUFF_EXPIRY.remove(player.getUUID());
    }

    // ── Change 3: stamp the curse on an unprovoked priest kill ───────────────
    @SubscribeEvent
    public static void onLivingDeath(LivingDeathEvent event) {
        LivingEntity victim = event.getEntity();
        if (victim.level().isClientSide) return;
        if (!PRIEST_ID.equals(ForgeRegistries.ENTITY_TYPES.getKey(victim.getType()))) return;
        Entity killer = event.getSource().getEntity();
        if (!(killer instanceof Player player)) return;

        long until = System.currentTimeMillis() + CURSE_DURATION_MS;
        CompoundTag root = player.getPersistentData();
        CompoundTag persisted = root.getCompound(Player.PERSISTED_NBT_TAG);   // death-persistent subtag
        persisted.putLong(CURSE_KEY, until);
        root.put(Player.PERSISTED_NBT_TAG, persisted);
        LOG.info("[priest_curse] {} killed a priest; HOLY spell damage halved for 24h (until {} epoch-ms)",
                player.getGameProfile().getName(), until);
    }

    // ── Change 3: halve cursed casters' HOLY-school spell damage ─────────────
    @SubscribeEvent
    public static void onSpellDamage(SpellDamageEvent event) {
        SpellDamageSource src = event.getSpellDamageSource();
        if (src == null) return;
        if (!(src.getEntity() instanceof Player player)) return;   // the caster
        if (player.level().isClientSide) return;

        AbstractSpell spell = src.spell();
        if (spell == null) return;
        if (!SchoolRegistry.HOLY_RESOURCE.equals(spell.getSchoolType().getId())) return;

        CompoundTag root = player.getPersistentData();
        if (!root.contains(Player.PERSISTED_NBT_TAG)) return;
        long until = root.getCompound(Player.PERSISTED_NBT_TAG).getLong(CURSE_KEY);
        if (until <= System.currentTimeMillis()) return;           // no curse / expired

        event.setAmount(event.getAmount() * HOLY_CURSE_MULT);
    }

    // ── Cleanup ──────────────────────────────────────────────────────────────
    @SubscribeEvent
    public static void onLogout(PlayerEvent.PlayerLoggedOutEvent event) {
        ANGEL_BUFF_EXPIRY.remove(event.getEntity().getUUID());
    }
}
