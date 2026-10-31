package com.iridescentcraft.reforging.mixin;

import java.util.Map;

import com.google.gson.JsonElement;
import com.iridescentcraft.reforging.memory.JsonTextMap;

import net.minecraft.resources.ResourceLocation;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import se.mickelus.mutil.data.DataDistributor;
import se.mickelus.mutil.data.DataStore;
import se.mickelus.tetra.data.DataManager;

/**
 * After a Tetra data store has loaded on the server (start and every
 * {@code /reload}), its raw JSON, kept only to sync players, is held as text:
 * about 28 MB (RAM audit 2026-10-30, scope T1). See {@link JsonTextMap}.
 *
 * <p>At RETURN the store has already parsed its data and, on a dedicated
 * server's {@code /reload}, already sent the trees to everyone online. The login
 * path is untouched: {@code DataManager.playerConnected} -> {@code sendToPlayer}
 * -> Tetra's {@code UpdateDataPacket} built from this map. A client never runs
 * {@code apply}; it loads from the packet.
 *
 * <p>Only stores that sync through Tetra's {@code DataManager} (all of mutil's
 * stores in this pack). mutil is MIT; nothing of it or of Tetra is copied here.
 */
@Mixin(value = DataStore.class, remap = false)
public abstract class DataStoreSyncTextMixin {

    @Shadow protected Map<ResourceLocation, JsonElement> rawData;
    @Shadow protected String directory;
    @Shadow private DataDistributor syncronizer;

    @Inject(method = "apply(Ljava/util/Map;Lnet/minecraft/server/packs/resources/ResourceManager;Lnet/minecraft/util/profiling/ProfilerFiller;)V",
            at = @At("RETURN"))
    private void icraft$keepSyncJsonAsText(CallbackInfo ci) {
        if (syncronizer instanceof DataManager) {
            rawData = JsonTextMap.compact(directory, rawData);
        }
    }
}
