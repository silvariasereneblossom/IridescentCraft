package net.royling.lovelysparklepieces.ModCommand;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.context.CommandContext;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.royling.lovelysparklepieces.PlayerData.SoulData;

import net.minecraftforge.registries.RegistryObject;

public class ModCommands {
    public static void register(CommandDispatcher<CommandSourceStack> dispatcher){
        dispatcher.register(
                Commands.literal("souldata")
                        .requires(source->source.hasPermission(4))
                        .then(Commands.argument("player", EntityArgument.player())
                                .then(Commands.literal("add")
                                                .then(Commands.argument("amount", IntegerArgumentType.integer(1,200))
                                                        .executes(context -> {
                                                            ServerPlayer player = EntityArgument.getPlayer(context,"player");
                                                            int amount = IntegerArgumentType.getInteger(context,"amount");
                                                            SoulData.addSoul(player,amount);
                                                            sendFeedback(context, player, "command.lovely_sparkle_pieces.action.add", amount);
                                                            return 1;
                                                        })
                                                )
                                ).then(Commands.literal("remove")
                                        .then(Commands.argument("amount", IntegerArgumentType.integer(1, 200))
                                                .executes(context -> {
                                                    ServerPlayer player = EntityArgument.getPlayer(context, "player");
                                                    int amount = IntegerArgumentType.getInteger(context, "amount");
                                                    SoulData.removeSoul(player, amount);
                                                    sendFeedback(context, player, "command.lovely_sparkle_pieces.action.remove", amount);
                                                    return 1;
                                                })
                                        )
                                )
                                .then(Commands.literal("set")
                                        .then(Commands.argument("amount", IntegerArgumentType.integer(0, 200))
                                                .executes(context -> {
                                                    ServerPlayer player = EntityArgument.getPlayer(context, "player");
                                                    int amount = IntegerArgumentType.getInteger(context, "amount");
                                                    SoulData.setSoul(player, amount);
                                                    sendFeedback(context, player, "command.lovely_sparkle_pieces.action.set", amount);
                                                    return 1;
                                                        }))
        )));
    }
    private static void sendFeedback(CommandContext<CommandSourceStack> context, ServerPlayer player, String actionKey, int amount) {
        context.getSource().sendSuccess(() ->
                        Component.translatable(
                                "command.lovely_sparkle_pieces.souldata.success", // 本地化键
                                player.getName(),                                 // 玩家名（参数1）
                                Component.translatable(actionKey),                // 操作类型（参数2，如"增加"）
                                amount,                                           // 数量（参数3）
                                SoulData.getSouls(player)                         // 当前灵魂（参数4）
                        ),
                true
        );
    }

}
