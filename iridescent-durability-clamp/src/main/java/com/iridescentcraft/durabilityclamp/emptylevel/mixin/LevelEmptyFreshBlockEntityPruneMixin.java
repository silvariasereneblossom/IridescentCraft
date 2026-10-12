package com.iridescentcraft.durabilityclamp.emptylevel.mixin;

import com.iridescentcraft.durabilityclamp.emptylevel.EmptyLevelFreshAccess;
import com.iridescentcraft.durabilityclamp.emptylevel.EmptyLevelPruneBackstop;
import java.util.ArrayList;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.BlockEntity;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;

/**
 * The second engine half of the empty-level prune backstop: Forge's lists of
 * block entities whose {@code onLoad()} is still owed.
 *
 * <p>Forge (not vanilla) adds {@code freshBlockEntities} and
 * {@code pendingFreshBlockEntities} to {@code Level}.
 * {@code LevelChunk.registerAllBlockEntitiesAfterLevelLoad} puts every block
 * entity of a freshly loaded chunk into them, ticking or not, and
 * {@code Level.tickBlockEntities()} is the only place they drain: it calls
 * {@code onLoad()} on each entry and clears the list. A level that skips its
 * block-entity tick therefore keeps every block entity of every chunk it has
 * loaded since, long after the chunk is gone, and runs {@code onLoad()} on
 * all of them, dead ones included, when a player finally arrives.
 *
 * <p>The prune drops the entries whose {@code isRemoved()} is true: block
 * entities of chunks that have unloaded again. Such an instance is never
 * handed back to the game (a reload builds new instances; anything that
 * revives one goes through {@code LevelChunk.addAndRegisterBlockEntity},
 * which calls {@code onLoad()} itself), so the one thing it loses is the late
 * {@code onLoad()} on a dead object. Live entries are never touched and still
 * get their {@code onLoad()} exactly once.
 *
 * <p>A class of its own, in the same not-required config as
 * {@code LevelEmptyTickerPruneMixin}: the two lists are Forge names with no
 * SRG mapping ({@code remap = false}), and if a Forge build ever renames them
 * only this part is lost; the ticker prune keeps working. No injection here,
 * only the three fields. Checked against Forge 1.20.1-47.4.6 (2026-10-12).
 */
@Mixin(Level.class)
public abstract class LevelEmptyFreshBlockEntityPruneMixin implements EmptyLevelFreshAccess {

    @Shadow(remap = false) @Final private ArrayList<BlockEntity> freshBlockEntities;

    @Shadow(remap = false) @Final private ArrayList<BlockEntity> pendingFreshBlockEntities;

    @Shadow private boolean tickingBlockEntities;

    @Override
    public int iridescent$pruneRemovedFreshBlockEntities() {
        if (this.tickingBlockEntities) {
            return -1;
        }
        return EmptyLevelPruneBackstop.dropRemovedBlockEntities(this.freshBlockEntities)
            + EmptyLevelPruneBackstop.dropRemovedBlockEntities(this.pendingFreshBlockEntities);
    }

    @Override
    public int iridescent$freshBlockEntityCount() {
        return this.freshBlockEntities.size() + this.pendingFreshBlockEntities.size();
    }
}
