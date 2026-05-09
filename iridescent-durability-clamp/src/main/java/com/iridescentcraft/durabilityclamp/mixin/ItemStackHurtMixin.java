package com.iridescentcraft.durabilityclamp.mixin;

import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/**
 * Layered-defense clamp at the FINAL checkpoint of vanilla durability
 * application: {@link ItemStack#hurt}. Mirrors the same arithmetic as
 * {@link ItemStackHurtAndBreakMixin} but targets the leaf method that
 * actually mutates {@code damageValue}.
 *
 * <p><strong>Why two mixins:</strong> the existing
 * {@code ItemStackHurtAndBreakMixin} clamps the {@code amount} argument
 * at HEAD of {@code hurtAndBreak}. Forge then patches that method to do
 * <pre>{@code
 *   amount = this.getItem().damageItem(this, amount, entity, onBroken);
 * }</pre>
 * which other mods can intercept. Specifically, Celestial Core ships a
 * {@code @WrapOperation} on the {@code Item.damageItem} INVOKE that fires
 * a {@code com.xiaoyue.celestial_core.events.DamageItemEvent} on the
 * Forge bus and calls the original with {@code event.getAmount()}.
 * Listeners on that event can boost the amount past our HEAD clamp.
 *
 * <p>For items whose {@code Item.damageItem} override re-clamps (Tetra
 * modular items, our {@code ItemModularArmor} / spell book classes),
 * the boost is undone. But for VANILLA armor / tools / weapons whose
 * default {@code Item.damageItem} returns {@code amount} unchanged, the
 * boosted value flows straight through to {@code ItemStack.hurt} which
 * does {@code newDamage = currentDamage + amount} and {@code shrink(1)}
 * if {@code newDamage >= maxDamage}.
 *
 * <p>This mixin closes that hole. {@code hurt} is the leaf method; once
 * it returns {@code true} the only remaining work is {@code shrink(1)}.
 * Clamping {@code amount} here guarantees {@code newDamage <= maxDur - 1}
 * regardless of any modifications that happened earlier in the call
 * chain.
 *
 * <p>Tester report 2026-05-09: items breaking on death despite the
 * existing HEAD mixin firing on {@code hurtAndBreak}. Stack trace
 * showed Celestial Core's wrap at {@code ItemStack.java:3073} and
 * ArmorDamageLimit's handler at {@code Inventory.java:2685} both in
 * the durability path. Adding this mixin prevents the bypass.
 */
@Mixin(ItemStack.class)
public class ItemStackHurtMixin {

    @ModifyVariable(
        method = "hurt(ILnet/minecraft/util/RandomSource;Lnet/minecraft/server/level/ServerPlayer;)Z",
        at = @At("HEAD"),
        argsOnly = true,
        ordinal = 0
    )
    private int iridescent$clampHurtAmount(int amount) {
        ItemStack self = (ItemStack)(Object)this;
        if (!self.isDamageableItem() || amount <= 0) {
            return amount;
        }
        int max = self.getMaxDamage();
        int current = self.getDamageValue();
        int headroom = max - current - 1;
        if (headroom <= 0) {
            return 0;
        }
        return Math.min(amount, headroom);
    }
}
