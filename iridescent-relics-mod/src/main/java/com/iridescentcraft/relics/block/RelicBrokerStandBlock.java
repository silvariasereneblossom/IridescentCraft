package com.iridescentcraft.relics.block;

import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * Relic Broker Stand -- the physical anchor for the Relic Broker trade GUI (design:
 * draft-relic-sink-trading; embodiment chosen over a vanilla villager because MCA
 * {@code overwriteOriginalVillagers} would replace one).
 *
 * <p>Intentionally behaviour-free on the jar side: right-click handling lives in KubeJS
 * ({@code BlockEvents.rightClicked} -> build the player's tier-gated offers -> {@code
 * com.iridescentcraft.relics.broker.RelicBroker.open}), so the catalog stays data/script
 * (guardrail). The block exists only to be placed (a pre-placed one at spawn IS the named
 * Broker) and crafted by the T2-gated recipe.
 */
public class RelicBrokerStandBlock extends Block {

    public RelicBrokerStandBlock(BlockBehaviour.Properties properties) {
        super(properties);
    }
}
