package com.iridescentcraft.durabilityclamp.mixin;

import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/**
 * Clamps the {@code amount} parameter of {@link ItemStack#hurtAndBreak} so
 * that the resulting damage value never reaches {@code maxDamage}. Items
 * stop at {@code maxDamage - 1} ("inert" state) instead of being destroyed.
 *
 * <p>Mirrors the pattern Tetra uses in
 * {@code IModularItem.damageItemImpl} for its modular tools/weapons:
 *
 * <pre>{@code
 *   return Math.min(maxDamage - currentDamage - 1, amount);
 * }</pre>
 *
 * <p>Tetra applies this clamp inside its own item code path, so it only
 * protects modular Tetra items. This mixin generalises the same clamp to
 * every item that goes through {@code ItemStack.hurtAndBreak} — including
 * vanilla armor, tools, weapons, and any modded item that delegates to
 * vanilla durability handling.
 *
 * <p>Companion logic in {@code kubejs/server_scripts/death_penalty.js}:
 * <ul>
 *   <li>The 2-tick poll + 10-tick full-inventory sweep tag items with the
 *       {@code icraft_broken} NBT flag once they hit {@code maxDamage - 100}
 *       (or half-max for short-life items). Those tags drive the inert
 *       state (zero attack damage, mining cancellation, right-click block).
 *   <li>This mixin makes the clamp synchronous and race-free: even a
 *       single boss hit dealing &gt;100 durability per piece can't push
 *       a stack past {@code maxDamage - 1}, so vanilla never destroys
 *       the item.
 * </ul>
 *
 * <p>Items that benefit:
 * <ul>
 *   <li>Vanilla armor + tools + weapons + elytra
 *   <li>Apotheosis-affixed gear
 *   <li>Most modded gear that doesn't override {@code Item.damageItem}
 * </ul>
 *
 * <p>Items unaffected (already protected by their own logic):
 * <ul>
 *   <li>Tetra modular tools/weapons — they clamp inside
 *       {@code damageItemImpl} before invoking this method, so by the
 *       time we see the call the {@code amount} is already capped.
 *       Re-clamping is idempotent (a {@link Math#min} of two clamps is
 *       still safe), so no compatibility concern.
 * </ul>
 *
 * <p><strong>Why @ModifyVariable on argsOnly:</strong> we want to mutate
 * the local {@code amount} (parameter index 1) at HEAD before any of the
 * method's existing logic runs. {@link ModifyVariable} with
 * {@code argsOnly = true} and {@code ordinal = 0} pinpoints the first
 * {@code int} parameter (which is {@code amount}) without ambiguity.
 */
@Mixin(ItemStack.class)
public class ItemStackHurtAndBreakMixin {

    @ModifyVariable(
        method = "hurtAndBreak(ILnet/minecraft/world/entity/LivingEntity;Ljava/util/function/Consumer;)V",
        at = @At("HEAD"),
        argsOnly = true,
        ordinal = 0
    )
    private int iridescent$clampDurabilityDamage(int amount) {
        ItemStack self = (ItemStack)(Object)this;
        if (!self.isDamageableItem() || amount <= 0) {
            return amount;
        }
        int max = self.getMaxDamage();
        int current = self.getDamageValue();
        int headroom = max - current - 1;
        if (headroom <= 0) {
            // Already at or past inert. Nothing more to apply.
            return 0;
        }
        return Math.min(amount, headroom);
    }
}
