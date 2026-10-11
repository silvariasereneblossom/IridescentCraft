package net.royling.lovelysparklepieces.mixin;

import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.EnchantmentInstance;
import net.royling.lovelysparklepieces.ModEvents.Legendarys.EnchantEyeHooks;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import java.util.List;

/**
 * IRIDESCENT: Eye of Enchantment on the Apotheosis enchanting table.
 *
 * With Apotheosis' enchanting module enabled every enchanting table opens
 * {@code dev.shadowsoffire.apotheosis.ench.table.ApothEnchantmentMenu}, which overrides
 * {@code clickMenuButton} without calling super and has its own private {@code getEnchantmentList} - so
 * {@link EnchantmentMenuMixin} alone would never run in a pack that ships Apotheosis. Same four hooks, same
 * rules ({@link EnchantEyeHooks}).
 *
 * Soft dependency: {@code @Pseudo} + a string target, so nothing here needs Apotheosis at compile time and
 * the mixin is skipped when the class does not exist. The two methods are named by their runtime (SRG)
 * names with {@code remap = false}: in the shipped Apotheosis jar they are literally {@code m_6366_} and
 * {@code m_39471_} (verified with javap on Apotheosis 1.20.1-7.4.8), and a refmap cannot be generated for a
 * class the annotation processor cannot see. Every injector is {@code require = 0}.
 */
@Pseudo
@Mixin(targets = "dev.shadowsoffire.apotheosis.ench.table.ApothEnchantmentMenu", remap = false)
public class ApothEnchantmentMenuMixin {
    @Unique
    private Player lsp$apothEyePlayer;
    /** 0 idle, 1 armed (click running, roll not seen yet), 2 boosted roll running, 3 boosted roll enchanted something */
    @Unique
    private int lsp$apothEyeState;

    @Inject(method = "m_6366_(Lnet/minecraft/world/entity/player/Player;I)Z", at = @At("HEAD"), remap = false, require = 0)
    private void lspApothEyeArm(Player player, int id, CallbackInfoReturnable<Boolean> cir) {
        this.lsp$apothEyePlayer = player;
        this.lsp$apothEyeState = player.level().isClientSide ? 0 : 1;
    }

    @ModifyVariable(method = "m_39471_(Lnet/minecraft/world/item/ItemStack;II)Ljava/util/List;", at = @At("HEAD"), argsOnly = true, ordinal = 1, remap = false, require = 0)
    private int lspApothEyeBoostLevel(int level) {
        if (this.lsp$apothEyeState != 1) {
            return level; // preview roll, or not inside a click
        }
        if (EnchantEyeHooks.canBoost(this.lsp$apothEyePlayer)) {
            this.lsp$apothEyeState = 2;
            return level + EnchantEyeHooks.LEVEL_BONUS;
        }
        this.lsp$apothEyeState = 0;
        return level;
    }

    @Inject(method = "m_39471_(Lnet/minecraft/world/item/ItemStack;II)Ljava/util/List;", at = @At("RETURN"), remap = false, require = 0)
    private void lspApothEyeAfterRoll(ItemStack stack, int slot, int level, CallbackInfoReturnable<List<EnchantmentInstance>> cir) {
        if (this.lsp$apothEyeState != 2) {
            return;
        }
        this.lsp$apothEyeState = EnchantEyeHooks.finishBoostedRoll(this.lsp$apothEyePlayer, stack, level, cir.getReturnValue()) ? 3 : 0;
    }

    @Inject(method = "m_6366_(Lnet/minecraft/world/entity/player/Player;I)Z", at = @At("RETURN"), remap = false, require = 0)
    private void lspApothEyeCharge(Player player, int id, CallbackInfoReturnable<Boolean> cir) {
        int state = this.lsp$apothEyeState;
        this.lsp$apothEyeState = 0;
        this.lsp$apothEyePlayer = null;
        if (state == 3 && cir.getReturnValueZ()) {
            EnchantEyeHooks.charge(player);
        }
    }
}
