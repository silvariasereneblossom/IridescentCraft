package celia.adwadg.linearxp.Handler;

import celia.adwadg.linearxp.Capability.AccuratedExpProvider;
import celia.adwadg.linearxp.LinearXp;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

@Mod.EventBusSubscriber(modid = LinearXp.MODID)
public class PlayerEvents {

    /**
     * Carry the precise (within-level) experience over to the new player object.
     *
     * IridescentCraft patch (2026-10-11). Upstream's handler was meant to do this on death
     * ("玩家死亡时保留精确经验数据" -- keep the precise experience data when the player
     * dies) and never did anything, for two reasons:
     *
     *  1. By the time PlayerEvent.Clone fires, the original player has been removed and its
     *     capabilities are INVALIDATED, so getCapability(...) on it answers empty and the
     *     ifPresent body never ran. The original's caps have to be revived for the read
     *     (and invalidated again afterwards) -- the standard Forge pattern.
     *  2. It only tried on death. Returning from the End also creates a new player object,
     *     and vanilla keeps all XP there, so the partial level was lost on that path too.
     *
     * Effect of the bug: the level number survived (this pack runs keepInventory, and vanilla
     * copies experienceLevel), but the progress toward the next level was thrown away on every
     * death and every End return, and the bar snapped back to empty within 10 ticks.
     *
     * Copied on both paths now. On a death WITHOUT keepInventory vanilla resets the level to 0;
     * the partial level (always less than one level) is still kept, as upstream intended.
     */
    @SubscribeEvent
    public static void onPlayerClone(PlayerEvent.Clone event) {
        Player original = event.getOriginal();
        original.reviveCaps();
        try {
            original.getCapability(AccuratedExpProvider.ACCURATED_EXP).ifPresent(oldData ->
                    event.getEntity().getCapability(AccuratedExpProvider.ACCURATED_EXP).ifPresent(newData ->
                            newData.setAccuratedExp(oldData.getAccuratedExp())));
        } finally {
            original.invalidateCaps();
        }
    }

    // IridescentCraft patch: upstream also subscribed an onPlayerRespawn handler here
    // whose body was an empty ifPresent (a placeholder "add respawn logic here"). It
    // did nothing but resolve the capability on every respawn, so it was removed.
}
