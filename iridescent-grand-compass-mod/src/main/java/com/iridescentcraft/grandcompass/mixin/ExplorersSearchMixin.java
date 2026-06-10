package com.iridescentcraft.grandcompass.mixin;

import com.chaosthedude.explorerscompass.network.CompassSearchPacket;
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

import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

/**
 * Explorer's Compass mirror of {@link NaturesSearchMixin}: reroute the
 * structure-search packet to our native /locate-style search when the sender
 * holds a Grand Compass, writing the nearest match to our own NBT. The vanilla
 * handler's cast to {@code ExplorersCompassItem} + {@code verifyNBT} gate make
 * the foreign-item path impossible, so we cancel and take over.
 */
@Mixin(value = CompassSearchPacket.class, remap = false)
public class ExplorersSearchMixin {

    @Shadow private List<ResourceLocation> structureKeys;
    @Shadow private int x;
    @Shadow private int y;
    @Shadow private int z;

    @Inject(method = "handle", at = @At("HEAD"), cancellable = true, remap = false, require = 0)
    private void grandcompass$reroute(Supplier<NetworkEvent.Context> ctx, CallbackInfo ci) {
        ServerPlayer sender = ctx.get().getSender();
        if (sender == null || !GrandCompassSearch.isHolding(sender)) return;
        final List<ResourceLocation> keys = this.structureKeys == null ? null : new ArrayList<>(this.structureKeys);
        final BlockPos pos = new BlockPos(this.x, this.y, this.z);
        ctx.get().enqueueWork(() -> GrandCompassSearch.runStructure(sender, keys, pos));
        ctx.get().setPacketHandled(true);
        ci.cancel();
    }
}
