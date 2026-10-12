package com.iridescentcraft.durabilityclamp.emptylevel.mixin;

import com.iridescentcraft.durabilityclamp.emptylevel.EmptyLevelPruneBackstop;
import com.iridescentcraft.durabilityclamp.emptylevel.EmptyLevelTickerAccess;
import java.util.List;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.TickingBlockEntity;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * The engine half of the empty-level prune backstop. See
 * {@link EmptyLevelPruneBackstop} for the leak it closes and for the policy
 * (when to prune, what to log); this class only does the two things ordinary
 * code cannot:
 *
 * <ol>
 *   <li>mark that {@code Level.tickBlockEntities()} ran, so the backstop can
 *       tell a level tick that skipped it from one that did not, by observing
 *       the call rather than by re-deriving vanilla's
 *       {@code emptyTime < 300} test;
 *   <li>reach the two ticker lists ({@code blockEntityTickers} is protected,
 *       {@code pendingBlockEntityTickers} and the {@code tickingBlockEntities}
 *       guard are private) to drop the removed tickers.
 * </ol>
 *
 * <p>Checked against the Forge 1.20.1-47.4.6 server classes (2026-10-11):
 * {@code tickBlockEntities} = {@code m_46463_}, the lists =
 * {@code f_151512_} / {@code f_151503_}, the guard = {@code f_151504_}. The
 * guard is true exactly while {@code tickBlockEntities} iterates, and
 * {@code addBlockEntityTicker} routes to the pending list while it is.
 *
 * <p>Listed under {@code "server"} in a mixin config of its own that is
 * {@code "required": false} with {@code "defaultRequire": 0}: it applies on
 * the dedicated server only, and a target that does not match costs the
 * backstop, never the boot. The durability clamp's own config stays required.
 *
 * <p>Canary redirects a call inside {@code tickBlockEntities} and Data Anchor
 * injects at its tick call and at RETURN; neither touches HEAD or the lists.
 * A sleeping Canary ticker answers {@code getPos()} with null, so nothing here
 * may call anything on a ticker except {@code isRemoved()}.
 */
@Mixin(Level.class)
public abstract class LevelEmptyTickerPruneMixin implements EmptyLevelTickerAccess {

    @Shadow @Final protected List<TickingBlockEntity> blockEntityTickers;

    @Shadow @Final private List<TickingBlockEntity> pendingBlockEntityTickers;

    @Shadow private boolean tickingBlockEntities;

    @Unique
    private boolean iridescent$blockEntityTickRan;

    @Inject(method = "tickBlockEntities", at = @At("HEAD"), require = 0)
    private void iridescent$markBlockEntityTick(CallbackInfo ci) {
        this.iridescent$blockEntityTickRan = true;
    }

    @Override
    public boolean iridescent$takeBlockEntityTickRan() {
        boolean ran = this.iridescent$blockEntityTickRan;
        this.iridescent$blockEntityTickRan = false;
        return ran;
    }

    @Override
    public int iridescent$pruneRemovedTickers() {
        if (this.tickingBlockEntities) {
            return -1;
        }
        return EmptyLevelPruneBackstop.dropRemoved(this.blockEntityTickers)
            + EmptyLevelPruneBackstop.dropRemoved(this.pendingBlockEntityTickers);
    }

    @Override
    public int iridescent$tickerCount() {
        return this.blockEntityTickers.size() + this.pendingBlockEntityTickers.size();
    }
}
