package com.iridescentcraft.reforging.client;

import java.lang.ref.WeakReference;

import com.iridescentcraft.reforging.IridescentReforging;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.event.ScreenEvent;
import net.minecraftforge.eventbus.api.EventPriority;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

/**
 * Moves Class Artifacts' "Sets" inventory button off the vanilla recipe-book
 * button, and keeps it anchored as the inventory panel shifts.
 *
 * <p>class-artifacts 2.0.5 ({@code rpgseteffects}) adds the button once, in
 * {@code InventoryButtonOverlay.onInitScreen} ({@code ScreenEvent.Init.Post},
 * NORMAL priority, {@code instanceof InventoryScreen} only, gated by its
 * {@code showInventoryButton} config): {@code Button.builder(Component.literal("Sets"), ...)}
 * at (guiLeft+90, guiTop+60), 30x12. That rect always overlaps the recipe-book
 * button (guiLeft+104, guiTop+61, 20x18). The recipe book and Apothic's
 * attribute panel also shift leftPos by 77 without a re-init, so the static
 * button drifted onto Aether's accessory button (book opened mid-screen) or
 * Quark's sort button (book closed mid-screen). It is the only on-screen way
 * into the Set Equipment screen (keybind Alt+Y), so it is moved, not hidden.
 *
 * <p>New spot (guiLeft+126, guiTop+64): the shelf between the recipe-book
 * button (ends at +124) and Quark's sort button (+158..168, +71..81), below the
 * crafting grid (ends at +52) and above the first inventory row (+83),
 * vertically centred on the recipe-book button. It is re-applied from the LIVE
 * getGuiLeft/Top on every Render.Pre, like the widgets around it, so the layout
 * is the same in every recipe-book / attribute-panel state. JLF's Wormhole
 * Storage ender button (+127, +61, 20x18) would sit on this spot; that skill is
 * retired in the fork (null, #76), so move one of them if it ever comes back.
 *
 * <p>Recognized by what class-artifacts builds: a plain {@link Button} (not a
 * subclass), 30x12, labelled with the literal "Sets" (no lang key, so no
 * locale changes it). Not by its init position, which only holds until
 * something shifts leftPos. The creative screen is not an InventoryScreen, so
 * it never gets the button.
 */
@Mod.EventBusSubscriber(modid = IridescentReforging.MODID,
        bus = Mod.EventBusSubscriber.Bus.FORGE, value = Dist.CLIENT)
public final class SetsButtonAnchor {

    private SetsButtonAnchor() {}

    private static final int SETS_X = 126;
    private static final int SETS_Y = 64;

    // Weak, so a closed inventory (and the player it holds) isn't kept alive.
    private static WeakReference<InventoryScreen> screen = new WeakReference<>(null);
    private static WeakReference<Button> sets = new WeakReference<>(null);
    private static boolean logged = false;

    /** LOWEST: runs after class-artifacts' NORMAL listener has added the button. */
    @SubscribeEvent(priority = EventPriority.LOWEST)
    public static void onInit(ScreenEvent.Init.Post event) {
        if (!(event.getScreen() instanceof InventoryScreen inv)) return;
        Button found = null;
        for (GuiEventListener listener : event.getListenersList()) {
            if (listener instanceof Button button && isSetsButton(button)) {
                found = button;
                break;
            }
        }
        screen = new WeakReference<>(inv);
        sets = new WeakReference<>(found);
        if (found == null) return;
        anchor(inv, found);
        if (!logged) {
            logged = true;
            IridescentReforging.LOGGER.info("[{}] anchoring class-artifacts' Sets button at guiLeft+{}, guiTop+{}",
                    IridescentReforging.MODID, SETS_X, SETS_Y);
        }
    }

    /** Every frame, before the screen draws or hit-tests against the new position. */
    @SubscribeEvent(priority = EventPriority.HIGHEST)
    public static void onRender(ScreenEvent.Render.Pre event) {
        Button button = sets.get();
        if (button != null && event.getScreen() == screen.get()) {
            anchor((InventoryScreen) event.getScreen(), button);
        }
    }

    private static void anchor(InventoryScreen inv, Button button) {
        button.setPosition(inv.getGuiLeft() + SETS_X, inv.getGuiTop() + SETS_Y);
    }

    private static boolean isSetsButton(Button button) {
        return button.getClass() == Button.class
                && button.getWidth() == 30 && button.getHeight() == 12
                && "Sets".equals(button.getMessage().getString());
    }
}
