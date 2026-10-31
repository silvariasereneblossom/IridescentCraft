package com.iridescentcraft.reforging.mixin;

import com.google.common.collect.Multimap;
import com.iridescentcraft.reforging.memory.ZetaCrawlTrim;

import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;

import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Frees Zeta's recipe-crawl multimaps (59.4 MB on the server, RAM audit
 * 2026-10-30): the backward map is never filled, the forward one is emptied
 * right after the {@code Digest} event. Why that is safe is in
 * {@link ZetaCrawlTrim}.
 *
 * <p>Checked against Zeta 1.0-31 and Quark 4.0-462 (constant-pool scan of every
 * jar of the pack, nested jars included): {@code RecipeCrawlHandler} and the
 * {@code Digest} event are referenced only by Zeta itself and by Quark's
 * {@code MagnetsModule}, {@code MagnetSystem} and {@code SlabsToBlocksModule};
 * Magnets reads the forward map during the event only, Slabs To Blocks never
 * reads either map, and no KubeJS script names them. The order on a start and on
 * every {@code /reload} is the same: the next server tick crawls, digests, fires
 * {@code Digest}, and this mixin empties the maps.
 *
 * <p>Zeta and Quark are CC BY-NC-SA 3.0: nothing of theirs is copied here, only
 * their method names are targeted. {@code @Pseudo} with a string target: no
 * compile dependency on Zeta, and a pack without it skips this mixin.
 */
@Pseudo
@Mixin(targets = "org.violetmoon.zeta.util.handler.RecipeCrawlHandler", remap = false)
public abstract class ZetaRecipeCrawlMixin {

    @Shadow @Final private static Multimap<Item, ItemStack> vanillaRecipeDigestion;
    @Shadow @Final private static Multimap<Item, ItemStack> backwardsVanillaDigestion;

    @Redirect(method = "digest",
            at = @At(value = "INVOKE",
                    target = "Lcom/google/common/collect/Multimap;put(Ljava/lang/Object;Ljava/lang/Object;)Z"))
    private static boolean icraft$skipBackwardPut(Multimap<Object, Object> map, Object key, Object value) {
        if ((Object) map == backwardsVanillaDigestion) {
            ZetaCrawlTrim.skippedBackwardPut();
            return false;
        }
        return map.put(key, value);
    }

    @Inject(method = "onTick",
            at = @At(value = "INVOKE",
                    target = "Lorg/violetmoon/zeta/util/handler/RecipeCrawlHandler;fire(Lorg/violetmoon/zeta/event/bus/IZetaPlayEvent;)V",
                    shift = At.Shift.AFTER))
    private static void icraft$dropDigestMaps(CallbackInfo ci) {
        ZetaCrawlTrim.afterDigest(vanillaRecipeDigestion, backwardsVanillaDigestion);
    }
}
