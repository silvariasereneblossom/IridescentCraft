package com.iridescentcraft.durabilityclamp.lootr.mixin;

import com.iridescentcraft.durabilityclamp.lootr.LootrTickInPlace;
import it.unimi.dsi.fastutil.objects.ObjectOpenHashSet;
import java.util.Collection;
import java.util.Set;
import net.minecraftforge.common.ForgeConfigSpec;
import org.objectweb.asm.Opcodes;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

/**
 * Lootr's chest-conversion tick without its per-tick copy (RAM and lag audit
 * 2026-10-30, lever 11; the operator's decision 10 of 2026-10-31: our own
 * mixin, not {@code aggressive_mode}).
 *
 * <p><strong>What Lootr does</strong> (0.7.35.94, read from the decompiled
 * {@code noobanidus.mods.lootr.block.entities.TileTicker}; Lootr is MIT, and
 * nothing of it is copied here): every chest-like block entity that gets a
 * ticker is queued in {@code tileEntries}. At the end of every server tick
 * {@code serverTick} copies that whole set into a new hash set (rehashing
 * every entry), then walks the copy, reading the {@code maximum_age} and
 * {@code check_world_border} config values once per entry, and converts the
 * entries whose 5 x 5 chunks are loaded. While chunks generate the set holds
 * every chest generated in the last fifteen minutes, and the copy plus the
 * per-entry reads were 5.6 % of the server thread (JFR on the boot rig).
 *
 * <p><strong>What changes.</strong> Five instructions of {@code serverTick}:
 * <ol>
 *   <li>{@code new ObjectOpenHashSet(tileEntries)} returns {@code tileEntries}
 *       itself, so the loop walks the live set;</li>
 *   <li>the {@code tickingList = false} right after that copy keeps
 *       {@code true}, so an {@code addEntry} during the walk (another chest's
 *       block entity created by the conversion's neighbour update, or by
 *       {@code getBlockEntity}) goes to {@code pendingEntries} instead of into
 *       the set being walked;</li>
 *   <li>at the merge, {@code tileEntries.removeAll(toRemove)} also removes
 *       {@code toRemove} from {@code pendingEntries} before Lootr adds the
 *       pending entries back. Under the copy those adds went straight into
 *       {@code tileEntries} and that same {@code removeAll} dropped any equal
 *       to a processed entry; an add equal to an entry still queued keeps the
 *       older entry (and its age) both ways, since a hash set keeps the
 *       element it has;</li>
 *   <li>and 5. {@code MAXIMUM_AGE.get()} and {@code CHECK_WORLD_BORDER.get()}
 *       inside the loop are read once per tick.</li>
 * </ol>
 * The per-entry test, the conversion and the merge are Lootr's own code,
 * untouched. So every tick ends with the same set and converts the same
 * chests as before. The order in which one tick visits its entries was never
 * fixed: an entry's hash includes the {@code ResourceKey}'s identity hash,
 * which differs from run to run.
 *
 * <p>Seen from outside, one thing differs: Lootr's one-off "over 5000
 * entries" error is checked against {@code pendingEntries} instead of
 * {@code tileEntries} for an add that lands during the walk, so it can print
 * at a later add. Nothing else reads either set.
 *
 * <p>If a tick ever stops before its merge (an exception in the walk), the
 * next tick first moves what was pending into the set, which is where the
 * copy would have left it.
 *
 * <p>Applied by {@code LootrTickMixinPlugin} to Lootr 0.7.35.94 only. The
 * config is {@code "required": true} with every redirect required and allowed
 * once: in a config that is not required a failed redirect is only a WARN,
 * and the ones applied before it stay (walking the live set without the
 * {@code tickingList} redirect would let an add land in the set being
 * walked). So it applies whole or the boot fails, which the rig boot of every
 * change shows before it ships.
 */
@Pseudo
@Mixin(targets = "noobanidus.mods.lootr.block.entities.TileTicker", remap = false)
public abstract class TileTickerInPlaceMixin {

    @Shadow @Final private static Set<Object> pendingEntries;

    @Shadow private static boolean tickingList;

    /** True from the walk's start to its merge: the tick runs the redirected path. */
    @Unique
    private static boolean iridescent$inPlace;

    @Unique
    private static Object iridescent$maxAge;

    @Unique
    private static Object iridescent$checkWorldBorder;

    /**
     * Inside Lootr's {@code synchronized (listLock)}, right after {@code tickingList = true}. The ordinal is needed:
     * the pack's Mixin (Connector's 0.12.11) matches a constructor descriptor anywhere in the method, so the
     * descriptor alone also selects {@code new ObjectOpenHashSet()} ({@code toRemove}, NEW #0).
     */
    @Redirect(method = "serverTick",
        at = @At(value = "NEW", target = "(Ljava/util/Collection;)Lit/unimi/dsi/fastutil/objects/ObjectOpenHashSet;",
            ordinal = 1),
        allow = 1)
    private static ObjectOpenHashSet<Object> iridescent$walkInPlace(Collection<Object> entries) {
        if (iridescent$inPlace) {
            entries.addAll(pendingEntries);
            pendingEntries.clear();
            iridescent$inPlace = false;
        }
        iridescent$maxAge = null;
        iridescent$checkWorldBorder = null;
        if (entries instanceof ObjectOpenHashSet<Object> live) {
            iridescent$inPlace = true;
            LootrTickInPlace.announce(live.size());
            return live;
        }
        return new ObjectOpenHashSet<>(entries);
    }

    @Redirect(method = "serverTick",
        at = @At(value = "FIELD", target = "Lnoobanidus/mods/lootr/block/entities/TileTicker;tickingList:Z",
            opcode = Opcodes.PUTSTATIC, ordinal = 1),
        allow = 1)
    private static void iridescent$keepPendingDuringWalk(boolean value) {
        tickingList = iridescent$inPlace || value;
    }

    @Redirect(method = "serverTick",
        at = @At(value = "INVOKE", target = "Lnet/minecraftforge/common/ForgeConfigSpec$IntValue;get()Ljava/lang/Object;"),
        allow = 1)
    private static Object iridescent$maxAgeOncePerTick(ForgeConfigSpec.IntValue value) {
        if (!iridescent$inPlace) {
            return value.get();
        }
        Object v = iridescent$maxAge;
        if (v == null) {
            iridescent$maxAge = v = value.get();
        }
        return v;
    }

    /** Ordinal 0 is the {@code DISABLE} check before the walk, read as Lootr reads it. */
    @Redirect(method = "serverTick",
        at = @At(value = "INVOKE", target = "Lnet/minecraftforge/common/ForgeConfigSpec$BooleanValue;get()Ljava/lang/Object;",
            ordinal = 1),
        allow = 1)
    private static Object iridescent$checkWorldBorderOncePerTick(ForgeConfigSpec.BooleanValue value) {
        if (!iridescent$inPlace) {
            return value.get();
        }
        Object v = iridescent$checkWorldBorder;
        if (v == null) {
            iridescent$checkWorldBorder = v = value.get();
        }
        return v;
    }

    /** Inside Lootr's second {@code synchronized (listLock)}, before it adds the pending entries back. */
    @Redirect(method = "serverTick",
        at = @At(value = "INVOKE", target = "Ljava/util/Set;removeAll(Ljava/util/Collection;)Z"),
        allow = 1)
    private static boolean iridescent$mergeAsTheCopyDid(Set<Object> entries, Collection<?> toRemove) {
        boolean changed = entries.removeAll(toRemove);
        if (iridescent$inPlace) {
            iridescent$inPlace = false;
            pendingEntries.removeAll(toRemove);
        }
        return changed;
    }
}
