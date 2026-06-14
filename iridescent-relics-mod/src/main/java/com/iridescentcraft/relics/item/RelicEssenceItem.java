package com.iridescentcraft.relics.item;

import java.util.List;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;

/**
 * Relic Essence -- the relic/curio surplus-sink currency (design:
 * draft-relic-sink-trading). A plain stackable {@link Item} (NOT a framework
 * {@code RelicItem}): it is never worn, only spent.
 *
 * <p>Faucet: distilled from surplus relics/curios via the KubeJS submit-sweep
 * ({@code /icraft relics submit}) and bought by the Relic Broker NPC -- BOTH use
 * the SAME data-driven conversion table in
 * {@code kubejs/server_scripts/economy/relic_sink.js}. Sink: the Broker's
 * tier-gated catalog. Stacks like emeralds (the convenience-currency parallel).
 *
 * <p>The only behaviour here is the flavour tooltip; all economy logic is script
 * data, never jar constants (design guardrail).
 */
public class RelicEssenceItem extends Item {

    public RelicEssenceItem(Properties properties) {
        super(properties);
    }

    @Override
    public void appendHoverText(ItemStack stack, Level level, List<Component> tooltip, TooltipFlag flag) {
        tooltip.add(Component.translatable("item.iridescent_relics.relic_essence.tooltip")
                .withStyle(ChatFormatting.GRAY, ChatFormatting.ITALIC));
        super.appendHoverText(stack, level, tooltip, flag);
    }
}
