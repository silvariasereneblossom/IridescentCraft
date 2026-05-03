package com.iridescentcraft.difficulty.command;

import com.iridescentcraft.difficulty.config.DifficultyConfig;
import com.iridescentcraft.difficulty.scaling.DifficultyScaling;
import com.iridescentcraft.difficulty.scaling.DimensionDifficultyData;
import com.mojang.brigadier.arguments.DoubleArgumentType;
import com.mojang.brigadier.context.CommandContext;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.MinecraftServer;
import net.minecraftforge.event.RegisterCommandsEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;

/**
 * Operator-only commands for inspecting and seeking the difficulty timer.
 * All registered under {@code /icraftdiff}, requires permission level 2.
 *
 * <ul>
 *   <li>{@code /icraftdiff status} — print current dim's tier, multiplier, and timer hours</li>
 *   <li>{@code /icraftdiff status all} — print every loaded dim's status</li>
 *   <li>{@code /icraftdiff timer set <hours>} — seek the current dim's timer (QA)</li>
 *   <li>{@code /icraftdiff timer reset} — set the current dim's timer to zero</li>
 *   <li>{@code /icraftdiff uncap end} — manually mark End dragon-killed (testing the uncap)</li>
 * </ul>
 */
public class DifficultyCommands {

    @SubscribeEvent
    public static void register(RegisterCommandsEvent event) {
        event.getDispatcher().register(
            Commands.literal("icraftdiff")
                .requires(s -> s.hasPermission(2))
                .then(Commands.literal("status")
                    .executes(DifficultyCommands::statusCurrent)
                    .then(Commands.literal("all").executes(DifficultyCommands::statusAll))
                )
                .then(Commands.literal("timer")
                    .then(Commands.literal("set")
                        .then(Commands.argument("hours", DoubleArgumentType.doubleArg(0.0, 100000.0))
                            .executes(DifficultyCommands::timerSet)))
                    .then(Commands.literal("reset")
                        .executes(DifficultyCommands::timerReset))
                )
                .then(Commands.literal("uncap")
                    .then(Commands.literal("end").executes(DifficultyCommands::uncapEnd)))
                .then(Commands.literal("players").executes(DifficultyCommands::playersStatus))
        );
    }

    private static int playersStatus(CommandContext<CommandSourceStack> ctx) {
        MinecraftServer srv = ctx.getSource().getServer();
        boolean idleEnabled = DifficultyConfig.COMMON.idleDetectionEnabled.get();
        double thresholdMin = DifficultyConfig.COMMON.idleThresholdMinutes.get();
        boolean atSpawnEnabled = DifficultyConfig.COMMON.idleAtSpawnEnabled.get();
        int spawnRadius = DifficultyConfig.COMMON.spawnIdleRadius.get();

        ctx.getSource().sendSuccess(() -> Component.literal(String.format(
            "§eidle detection: %s§r, threshold: §a%.1fmin§r, spawn-idle: %s§r (r=%d)",
            idleEnabled ? "§aenabled" : "§7disabled", thresholdMin,
            atSpawnEnabled ? "§aon" : "§7off", spawnRadius
        )), false);

        for (net.minecraft.server.level.ServerPlayer p : srv.getPlayerList().getPlayers()) {
            long idleTicks = com.iridescentcraft.difficulty.event.PlayerActivityTracker.getIdleTicks(p);
            double idleMin = idleTicks / 1200.0;
            boolean atSpawn = com.iridescentcraft.difficulty.event.PlayerActivityTracker.isAtSpawn(p);
            boolean active = com.iridescentcraft.difficulty.event.PlayerActivityTracker.isActive(p);
            String reason;
            if (active) reason = "§a✓ active§r";
            else if (atSpawn) reason = "§e◍ at-spawn§r";
            else reason = "§c✗ idle§r";

            ctx.getSource().sendSuccess(() -> Component.literal(String.format(
                "  §e%s§r dim=§b%s§r idle=§%s%.1fmin§r %s",
                p.getName().getString(),
                p.serverLevel().dimension().location(),
                active ? "a" : "c",
                idleMin,
                reason
            )), false);
        }
        return 1;
    }

    private static int statusCurrent(CommandContext<CommandSourceStack> ctx) {
        ServerLevel level = ctx.getSource().getLevel();
        sendDimStatus(ctx, level);
        return 1;
    }

    private static int statusAll(CommandContext<CommandSourceStack> ctx) {
        MinecraftServer srv = ctx.getSource().getServer();
        for (ServerLevel level : srv.getAllLevels()) {
            sendDimStatus(ctx, level);
        }
        return 1;
    }

    private static void sendDimStatus(CommandContext<CommandSourceStack> ctx, ServerLevel level) {
        ResourceLocation dimId = level.dimension().location();
        DifficultyScaling.Tier tier = DifficultyScaling.getTier(dimId);
        DifficultyConfig.TierCurve curve = DifficultyScaling.getCurve(tier);
        DimensionDifficultyData data = DimensionDifficultyData.get(level);
        double mult = DifficultyScaling.getCurrentMultiplier(level);
        double rate = com.iridescentcraft.difficulty.event.PlayerActivityTracker.getActiveRatio(level);
        int active = com.iridescentcraft.difficulty.event.PlayerActivityTracker.getActiveCount(level);
        int total = level.players().size();
        boolean uncapped = data.isEnderDragonKilled()
            && DifficultyConfig.COMMON.uncapAfterEnderDragonDimensions.get().contains(dimId.toString());

        // 1 decimal place on rate for non-trivial ratios (3/7 = 42.9%, not 43%).
        // Otherwise reads as 100% / 50% / 0% etc.
        String activeFrac = total == 0 ? "empty" : String.format("%d/%d active", active, total);
        String rateColor = rate >= 0.5 ? "a" : (rate > 0 ? "e" : "c");

        ctx.getSource().sendSuccess(() -> Component.literal(String.format(
            "§e%s§r tier=§b%s§r %.1fh/%.0fh mult=§a%.0f%%§r rate=§%s%.1f%%§r (%s) ed=%s%s",
            dimId, tier.name(),
            data.getHours(), curve.capHours.get(),
            mult * 100,
            rateColor, rate * 100,
            activeFrac,
            data.isEnderDragonKilled() ? "§a✓§r" : "§7✗§r",
            uncapped ? " §c[UNCAPPED]§r" : ""
        )), false);
    }

    private static int timerSet(CommandContext<CommandSourceStack> ctx) {
        double hours = DoubleArgumentType.getDouble(ctx, "hours");
        ServerLevel level = ctx.getSource().getLevel();
        long ticks = (long) (hours * DimensionDifficultyData.TICKS_PER_HOUR);
        DimensionDifficultyData data = DimensionDifficultyData.get(level);
        data.setTickCount(ticks);
        ctx.getSource().sendSuccess(() -> Component.literal(String.format(
            "§e%s§r timer set to §a%.1fh§r", level.dimension().location(), hours
        )), true);
        return 1;
    }

    private static int timerReset(CommandContext<CommandSourceStack> ctx) {
        ServerLevel level = ctx.getSource().getLevel();
        DimensionDifficultyData.get(level).setTickCount(0L);
        ctx.getSource().sendSuccess(() -> Component.literal(String.format(
            "§e%s§r timer reset to 0", level.dimension().location()
        )), true);
        return 1;
    }

    private static int uncapEnd(CommandContext<CommandSourceStack> ctx) {
        MinecraftServer srv = ctx.getSource().getServer();
        ServerLevel end = srv.getLevel(net.minecraft.world.level.Level.END);
        if (end == null) {
            ctx.getSource().sendFailure(Component.literal("End dimension not loaded."));
            return 0;
        }
        DimensionDifficultyData.get(end).markEnderDragonKilled();
        ctx.getSource().sendSuccess(() -> Component.literal(
            "§a✓§r §eminecraft:the_end§r marked dragon-killed (uncap active)"
        ), true);
        return 1;
    }
}
