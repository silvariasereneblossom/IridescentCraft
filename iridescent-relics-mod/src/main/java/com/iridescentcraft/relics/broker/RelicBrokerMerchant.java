package com.iridescentcraft.relics.broker;

import javax.annotation.Nullable;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.trading.Merchant;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;

/**
 * A standalone (non-entity) {@link Merchant} backing the Relic Broker Stand's trade GUI.
 *
 * <p>The catalog itself ({@link MerchantOffers}) is built in KubeJS (data/script per the
 * design guardrail — astages tier-gating, buy-relics via {@code relicEssenceValue}, B2
 * rotation/caps) and passed in; this class only supplies the vanilla {@code MerchantMenu}
 * the minimum it needs to render and run trades. It is deliberately NOT a villager entity,
 * so it sidesteps MCA's {@code overwriteOriginalVillagers} replacement.
 *
 * <p>The {@code default} {@link Merchant#openTradingScreen} does the menu + offer-sync; we
 * only implement the abstract surface. {@link #notifyTrade} increments the offer's use count
 * (vanilla relies on the merchant, not the menu slot, to do this — so stock/{@code maxUses}
 * limits work). The per-purchase hook for the B2 daily cap will attach here.
 */
public class RelicBrokerMerchant implements Merchant {

    @Nullable
    private Player tradingPlayer;
    private MerchantOffers offers;

    public RelicBrokerMerchant(MerchantOffers offers) {
        this.offers = (offers != null) ? offers : new MerchantOffers();
    }

    @Override
    public void setTradingPlayer(@Nullable Player player) {
        this.tradingPlayer = player;
    }

    @Override
    @Nullable
    public Player getTradingPlayer() {
        return this.tradingPlayer;
    }

    @Override
    public MerchantOffers getOffers() {
        return this.offers;
    }

    @Override
    public void overrideOffers(MerchantOffers newOffers) {
        this.offers = (newOffers != null) ? newOffers : new MerchantOffers();
    }

    @Override
    public void notifyTrade(MerchantOffer offer) {
        // Vanilla AbstractVillager increments uses here (NOT in the result slot), which is
        // what makes maxUses / out-of-stock work. Mirror that. (B2 daily-cap hook goes here.)
        offer.increaseUses();
    }

    @Override
    public void notifyTradeUpdated(ItemStack stack) {
        // no-op: no demand/level progression for the Broker
    }

    @Override
    public int getVillagerXp() {
        return 0;
    }

    @Override
    public void overrideXp(int xp) {
        // no-op: the Broker has no villager XP / level progression
    }

    @Override
    public boolean showProgressBar() {
        return false;
    }

    @Override
    public SoundEvent getNotifyTradeSound() {
        return SoundEvents.VILLAGER_YES;
    }

    @Override
    public boolean isClientSide() {
        return this.tradingPlayer != null && this.tradingPlayer.level().isClientSide();
    }
}
