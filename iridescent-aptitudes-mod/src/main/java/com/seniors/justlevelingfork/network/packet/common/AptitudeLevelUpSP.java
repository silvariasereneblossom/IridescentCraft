package com.seniors.justlevelingfork.network.packet.common;

import com.seniors.justlevelingfork.JustLevelingFork;
import com.seniors.justlevelingfork.common.capability.AptitudeCapability;
import com.seniors.justlevelingfork.handler.HandlerCommonConfig;
import com.seniors.justlevelingfork.network.ServerNetworking;
import com.seniors.justlevelingfork.network.packet.client.SyncAptitudeCapabilityCP;
import com.seniors.justlevelingfork.registry.RegistryAptitudes;
import com.seniors.justlevelingfork.registry.aptitude.Aptitude;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkEvent;

import java.util.function.Supplier;

public class AptitudeLevelUpSP {
    private final String aptitude;

    public AptitudeLevelUpSP(Aptitude aptitude) {
        this.aptitude = aptitude.getName();
    }

    public AptitudeLevelUpSP(FriendlyByteBuf buffer) {
        this.aptitude = buffer.readUtf();
    }

    public void toBytes(FriendlyByteBuf buffer) {
        buffer.writeUtf(this.aptitude);
    }

    public void handle(Supplier<NetworkEvent.Context> supplier) {
        NetworkEvent.Context context = supplier.get();
        context.enqueueWork(() -> {
            ServerPlayer player = context.getSender();
            if (player == null) return;

            AptitudeCapability capability = AptitudeCapability.get(player);
            if (capability == null) return;
            Aptitude aptitudePlayer = RegistryAptitudes.getAptitude(this.aptitude);
            if (aptitudePlayer == null) return;

            HandlerCommonConfig cfg = HandlerCommonConfig.HANDLER.instance();
            int aptitudeLevel = capability.getAptitudeLevel(aptitudePlayer);
            int cumulativeLevel = capability.getGlobalLevel();

            // Defensive gates (mirror the screen's button gating): a desynced or
            // hand-crafted packet must not bypass the per-aptitude / global caps.
            if (aptitudeLevel >= cfg.aptitudeMaxLevel) return;
            if (cumulativeLevel >= cfg.playersMaxGlobalLevel) return;

            int costLevels = requiredExperienceLevels(cumulativeLevel);
            boolean canLevelUp = player.isCreative() || costLevels <= player.experienceLevel;
            if (!canLevelUp) {
                JustLevelingFork.getLOGGER().info("Received aptitude level-up packet without the required experience levels; skipping packet...");
                return;
            }

            capability.addAptitudeLevel(aptitudePlayer, 1);
            SyncAptitudeCapabilityCP.send(player);
            if (!player.isCreative()) {
                // Cost is denominated in vanilla LEVELS. setExperienceLevels also
                // forces the client XP-bar resync — ServerPlayer keys that on
                // lastSentExp, which giveExperienceLevels(-n) would NOT trip.
                player.setExperienceLevels(Math.max(0, player.experienceLevel - costLevels));
            }
        });
        context.setPacketHandled(true);
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Iridescent fork (#76) — cumulative-level cost curve, in VANILLA LEVELS.
    //
    // Cost scales with the player's CUMULATIVE aptitude level (sum across all
    // aptitudes = AptitudeCapability.getGlobalLevel()). The cumulative range is
    // bracketed into "trees" of `aptitudeCostTreeSize` (default 30) levels; each
    // successive tree's TOTAL level budget multiplies by `aptitudeCostDoubling`
    // (default 2) from `aptitudeCostBaseLevels` (default 500):
    //   tree 1 = 500, 2 = 1,000, 3 = 2,000, … 8 = 64,000 levels.
    //
    // Within a tree the per-level cost ramps LINEARLY (steepness =
    // `aptitudeCostRampShape`: 0 = flat, 1 = first ~free / last ~2× average) and
    // sums to that tree's budget regardless of ramp. Per-tree reset → a small
    // cost dip is expected at each tree boundary.
    //
    // With Linear-Experience (#77, static 75 XP/level) one vanilla level = 75 XP,
    // so e.g. tree 1's 500 levels read as 37,500 XP. The curve is in levels either
    // way; it only reads as a flat 75 XP/level once #77 is installed.
    //
    // The screen (JustLevelingScreen) calls this same method with the same
    // cumulative level so the button + tooltip never desync from the server.
    // ───────────────────────────────────────────────────────────────────────────
    public static int requiredExperienceLevels(int cumulativeLevel) {
        HandlerCommonConfig cfg = HandlerCommonConfig.HANDLER.instance();
        int treeSize = Math.max(1, cfg.aptitudeCostTreeSize);
        double base = Math.max(1, cfg.aptitudeCostBaseLevels);
        double doubling = Math.max(1.0, cfg.aptitudeCostDoubling);
        double ramp = Math.max(0.0, Math.min(1.0, cfg.aptitudeCostRampShape));

        int level = Math.max(0, cumulativeLevel);
        int tree = level / treeSize;          // 0-based bracket
        int pos = level % treeSize;           // 0 .. treeSize-1
        double budget = base * Math.pow(doubling, tree);
        double avg = budget / treeSize;

        double cost;
        if (treeSize == 1) {
            cost = budget;
        } else {
            // Linear ramp that sums to `budget` across the tree:
            //   cost(pos) = avg * (1 - ramp + 2*ramp*pos/(treeSize-1))
            cost = avg * (1.0 - ramp + (2.0 * ramp * pos) / (treeSize - 1));
        }
        return Math.max(1, (int) Math.round(cost));
    }

    /**
     * Informational XP figure for the level-up tooltip ("(N xp)"). The actual
     * charge is in vanilla LEVELS (see {@link #requiredExperienceLevels}); this
     * just multiplies by the configured XP-per-level (default 75, matching
     * Linear-Experience #77's staticModeXpNeeded) for display. Balance-neutral.
     */
    public static int requiredPoints(int cumulativeLevel) {
        int xpPerLevel = Math.max(1, HandlerCommonConfig.HANDLER.instance().aptitudeCostXpPerLevel);
        return requiredExperienceLevels(cumulativeLevel) * xpPerLevel;
    }

    public static void send(Aptitude aptitude) {
        ServerNetworking.sendToServer(new AptitudeLevelUpSP(aptitude));
    }
}
