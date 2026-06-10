package com.iridescentcraft.modspells.event;

import com.hollingsworth.arsnouveau.api.event.SpellCastEvent;
import com.iridescentcraft.modspells.IridescentModularSpells;
import com.iridescentcraft.modspells.item.ModularArsSpellBookItem;
import com.iridescentcraft.modspells.item.ModularSpellBookItem;
import com.iridescentcraft.reforging.item.ItemModularWand;
import io.redspace.ironsspellbooks.api.events.SpellOnCastEvent;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import se.mickelus.tetra.items.modular.IModularItem;

/**
 * Drives modular spellbook honing progression. Tetra ships {@code tickProgression}
 * for weapons + tools but doesn't auto-trigger it for held-but-not-attacking
 * items like spell books. Mirrors the {@code ArmorHoneHandler} pattern with
 * three trigger sources:
 *
 *   1. {@link SpellOnCastEvent} (Iron's Spellbooks) -> +1 tick per held
 *      {@link ModularSpellBookItem}.
 *   2. {@link SpellCastEvent} (Ars Nouveau) -> +1 tick per held
 *      {@link ModularArsSpellBookItem}.
 *   3. {@link TickEvent.PlayerTickEvent} every 1200 ticks (= 60s at 20 TPS)
 *      -> +1 tick per held modular spellbook of either kind. Floor for
 *      non-combat play.
 *
 * The modular wand ({@link ItemModularWand}) is school-agnostic: it is a
 * main-hand caster stat-stick that boosts whatever spell the holder casts,
 * so it honed on EITHER cast event AND the passive floor ("honing from use
 * of spells of any kind"). Its tier is derived from honed count
 * (ItemModularWand.computeTier), so this handler is its sole progression
 * driver -- without it the wand never advances past tier I.
 *
 * Slot scope: mainhand + offhand only. Curios slots not iterated to avoid a
 * hard dep on the Curios API at this layer; passive ticks while held cover
 * non-cast progression.
 *
 * IModularItem.tickProgression handles the gating internally
 * (ConfigHandler.moduleProgression flag, canGainHoneProgress check, NBT
 * counter increment). We only have to call it.
 */
@Mod.EventBusSubscriber(modid = IridescentModularSpells.MODID)
public final class SpellbookHoneHandler {

    /** 60 seconds at 20 TPS. */
    private static final int PASSIVE_TICK_INTERVAL = 1200;

    private SpellbookHoneHandler() {}

    @SubscribeEvent
    public static void onIssCast(SpellOnCastEvent event) {
        Player player = event.getEntity();
        if (player == null || player.level().isClientSide) return;
        progressHeld(player, ModularSpellBookItem.class, 1);
        progressHeld(player, ItemModularWand.class, 1);
    }

    @SubscribeEvent
    public static void onArsCast(SpellCastEvent event) {
        LivingEntity caster = event.getEntity();
        if (!(caster instanceof Player player)) return;
        if (player.level().isClientSide) return;
        progressHeld(player, ModularArsSpellBookItem.class, 1);
        progressHeld(player, ItemModularWand.class, 1);
    }

    @SubscribeEvent
    public static void onPlayerTick(TickEvent.PlayerTickEvent event) {
        if (event.phase != TickEvent.Phase.END) return;
        Player player = event.player;
        if (player.level().isClientSide) return;
        if (player.tickCount % PASSIVE_TICK_INTERVAL != 0) return;
        progressHeld(player, ModularSpellBookItem.class, 1);
        progressHeld(player, ModularArsSpellBookItem.class, 1);
        progressHeld(player, ItemModularWand.class, 1);
    }

    /**
     * Tick honing progression on every held stack whose item is an instance
     * of {@code itemClass}. Two slots iterated: mainhand + offhand. Curios
     * slots are skipped at this layer (no Curios dep).
     */
    private static void progressHeld(Player player, Class<?> itemClass, int amount) {
        tryProgress(player, player.getMainHandItem(), itemClass, amount);
        tryProgress(player, player.getOffhandItem(), itemClass, amount);
    }

    private static void tryProgress(Player player, ItemStack stack, Class<?> itemClass, int amount) {
        if (stack.isEmpty()) return;
        if (!itemClass.isInstance(stack.getItem())) return;
        try {
            ((IModularItem) stack.getItem()).tickProgression(player, stack, amount + attunementBonus(stack));
        } catch (Throwable t) {
            // Tetra's tickProgression no-ops if module progression is
            // disabled; any other throw should not crash the cast path.
        }
    }

    /**
     * Hone-rate accelerator: +1 progress per level of the Attunement enchant
     * ({@link com.iridescentcraft.reforging.enchant.IcraftEnchantments#ATTUNEMENT})
     * carried on the stack. Stacks additively on the base amount, so a max
     * (L3) Attunement quadruples honing speed (1 base + 3). Defensive: returns
     * 0 if the enchant isn't resolvable yet (pre-registration) or the read throws.
     */
    private static int attunementBonus(ItemStack stack) {
        try {
            return net.minecraft.world.item.enchantment.EnchantmentHelper.getItemEnchantmentLevel(
                    com.iridescentcraft.reforging.enchant.IcraftEnchantments.ATTUNEMENT.get(), stack);
        } catch (Throwable t) {
            return 0;
        }
    }
}
