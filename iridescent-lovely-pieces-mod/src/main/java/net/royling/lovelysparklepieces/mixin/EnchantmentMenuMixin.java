package net.royling.lovelysparklepieces.mixin;

import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.EnchantmentMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.EnchantmentInstance;
import net.royling.lovelysparklepieces.ModEvents.Legendarys.EnchantEyeHooks;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import java.util.List;

/**
 * Eye of Enchantment on the vanilla enchanting table.
 *
 * IRIDESCENT rewrite - the upstream version was a 1.21 port that could not apply on 1.20.1 (it shadowed
 * and injected {@code getEnchantmentList(RegistryAccess, ItemStack, int, int)}; 1.20.1 has
 * {@code getEnchantmentList(ItemStack, int, int)}), and its soul charge ran for ANYONE holding 5 souls on
 * every button click, Eye or not, enchant or not.
 *
 * Now: one click = one armed roll. The first {@code getEnchantmentList} call inside
 * {@code clickMenuButton} (the real roll; the later calls in the same click are the next preview) is
 * rolled +5 levels when the clicking player wears the Eye and has the souls, and the souls are taken only
 * if that boosted roll actually enchanted something. No shadows, no local capture, every injector
 * {@code require = 0}: a failure leaves the vanilla table untouched.
 *
 * (Not reached when Apotheosis' enchanting module is on - its menu overrides both methods without calling
 * super; see {@link ApothEnchantmentMenuMixin}.)
 */
@Mixin(EnchantmentMenu.class)
public class EnchantmentMenuMixin {
    @Unique
    private Player lsp$eyePlayer;
    /** 0 idle, 1 armed (click running, roll not seen yet), 2 boosted roll running, 3 boosted roll enchanted something */
    @Unique
    private int lsp$eyeState;

    @Inject(method = "clickMenuButton", at = @At("HEAD"), require = 0)
    private void lspEyeArm(Player player, int id, CallbackInfoReturnable<Boolean> cir) {
        this.lsp$eyePlayer = player;
        this.lsp$eyeState = player.level().isClientSide ? 0 : 1;
    }

    @ModifyVariable(method = "getEnchantmentList", at = @At("HEAD"), argsOnly = true, ordinal = 1, require = 0)
    private int lspEyeBoostLevel(int level) {
        if (this.lsp$eyeState != 1) {
            return level; // preview roll, or not inside a click
        }
        if (EnchantEyeHooks.canBoost(this.lsp$eyePlayer)) {
            this.lsp$eyeState = 2;
            return level + EnchantEyeHooks.LEVEL_BONUS;
        }
        this.lsp$eyeState = 0;
        return level;
    }

    @Inject(method = "getEnchantmentList", at = @At("RETURN"), require = 0)
    private void lspEyeAfterRoll(ItemStack stack, int slot, int level, CallbackInfoReturnable<List<EnchantmentInstance>> cir) {
        if (this.lsp$eyeState != 2) {
            return;
        }
        this.lsp$eyeState = EnchantEyeHooks.finishBoostedRoll(this.lsp$eyePlayer, stack, level, cir.getReturnValue()) ? 3 : 0;
    }

    @Inject(method = "clickMenuButton", at = @At("RETURN"), require = 0)
    private void lspEyeCharge(Player player, int id, CallbackInfoReturnable<Boolean> cir) {
        int state = this.lsp$eyeState;
        this.lsp$eyeState = 0;
        this.lsp$eyePlayer = null;
        if (state == 3 && cir.getReturnValueZ()) {
            EnchantEyeHooks.charge(player);
        }
    }
}
