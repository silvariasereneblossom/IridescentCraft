package com.iridescentcraft.grandcompass.mixin;

import com.chaosthedude.naturescompass.network.CompassSearchPacket;
import com.iridescentcraft.grandcompass.search.GrandCompassSearch;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkEvent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import java.util.function.Supplier;

/**
 * Reroute Nature's Compass biome-search packet to OUR native search when the
 * sender holds a Grand Compass. The vanilla handler casts the held stack to
 * {@code NaturesCompassItem} and writes via {@code verifyNBT} (item-gated) —
 * both fail on our item. We cancel it and run {@link GrandCompassSearch}
 * instead, writing to our own NBT. Fail-safe (require = 0); if Nature's
 * Compass is absent the mixin simply never applies.
 */
@Mixin(value = CompassSearchPacket.class, remap = false)
public class NaturesSearchMixin {

    @Shadow private ResourceLocation biomeKey;
    @Shadow private int x;
    @Shadow private int y;
    @Shadow private int z;

    @Inject(method = "handle", at = @At("HEAD"), cancellable = true, remap = false, require = 0)
    private void grandcompass$reroute(Supplier<NetworkEvent.Context> ctx, CallbackInfo ci) {
        ServerPlayer sender = ctx.get().getSender();
        if (sender == null || !GrandCompassSearch.isHolding(sender)) return;
        final ResourceLocation key = this.biomeKey;
        final BlockPos pos = new BlockPos(this.x, this.y, this.z);
        ctx.get().enqueueWork(() -> GrandCompassSearch.runBiome(sender, key, pos));
        ctx.get().setPacketHandled(true);
        ci.cancel();
    }
}
