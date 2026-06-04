package com.iridescentcraft.grandcompass.item;

import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;

import javax.annotation.Nullable;
import java.util.List;

/**
 * The Grand Compass item. Mode lives in NBT ({@code GrandMode}: 0 bosses /
 * 1 structures / 2 biomes). Shift-right-click cycles; right-click opens the
 * active finder by delegating to the relevant mod's own {@code use()} (which
 * opens its real GUI with THIS stack) — or, for bosses, the KubeJS menu command.
 */
public class GrandCompassItem extends Item {

    public static final String MODE_KEY = "GrandMode";
    public static final int MODE_BOSSES = 0, MODE_STRUCTURES = 1, MODE_BIOMES = 2;
    private static final String[] MODE_NAMES = { "Bosses", "Structures", "Biomes" };

    public GrandCompassItem(Properties properties) {
        super(properties);
    }

    public static int getMode(ItemStack stack) {
        if (stack.hasTag() && stack.getTag().contains(MODE_KEY)) {
            return Math.floorMod(stack.getTag().getInt(MODE_KEY), 3);
        }
        return MODE_BOSSES;
    }

    private static void setMode(ItemStack stack, int mode) {
        stack.getOrCreateTag().putInt(MODE_KEY, Math.floorMod(mode, 3));
    }

    @Override
    public boolean isFoil(ItemStack stack) {
        return true; // gold + glint
    }

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);

        // Shift-right-click: cycle the mode (no finder open).
        if (player.isShiftKeyDown()) {
            int mode = (getMode(stack) + 1) % 3;
            setMode(stack, mode);
            player.displayClientMessage(
                Component.literal("§6Grand Compass: §e" + MODE_NAMES[mode]), true);
            return InteractionResultHolder.sidedSuccess(stack, level.isClientSide());
        }

        int mode = getMode(stack);
        try {
            if (mode == MODE_STRUCTURES) {
                Item ec = com.chaosthedude.explorerscompass.ExplorersCompass.explorersCompass;
                if (ec != null) {
                    return ec.use(level, player, hand); // opens Explorer's GUI with OUR stack
                }
            } else if (mode == MODE_BIOMES) {
                Item nc = com.chaosthedude.naturescompass.NaturesCompass.naturesCompass;
                if (nc != null) {
                    return nc.use(level, player, hand); // opens Nature's GUI with OUR stack
                }
            } else { // MODE_BOSSES — reuse the KubeJS boss-arena menu
                if (!level.isClientSide() && player instanceof ServerPlayer sp) {
                    sp.server.getCommands().performPrefixedCommand(
                        sp.createCommandSourceStack().withSuppressedOutput(), "icraft_compass menu");
                }
                return InteractionResultHolder.sidedSuccess(stack, level.isClientSide());
            }
        } catch (Throwable t) {
            if (!level.isClientSide()) {
                player.displayClientMessage(
                    Component.literal("§cGrand Compass: that finder isn't available right now."), true);
            }
        }
        return InteractionResultHolder.sidedSuccess(stack, level.isClientSide());
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tip, TooltipFlag flag) {
        tip.add(Component.literal("§7Mode: §f" + MODE_NAMES[getMode(stack)]));
        tip.add(Component.literal("§8Right-click: open the finder"));
        tip.add(Component.literal("§8Shift + right-click: switch Bosses / Structures / Biomes"));
    }
}
