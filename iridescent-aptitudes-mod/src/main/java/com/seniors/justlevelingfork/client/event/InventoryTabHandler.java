package com.seniors.justlevelingfork.client.event;

import com.mojang.blaze3d.systems.RenderSystem;
import com.seniors.justlevelingfork.JustLevelingFork;
import com.seniors.justlevelingfork.client.core.Utils;
import com.seniors.justlevelingfork.client.gui.DrawTabs;
import com.seniors.justlevelingfork.network.packet.common.OpenEnderChestSP;
import com.seniors.justlevelingfork.registry.RegistrySkills;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.resources.ResourceLocation;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.event.ScreenEvent;
import net.minecraftforge.eventbus.api.EventPriority;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

/**
 * Renders the aptitudes tab + optional Wormhole Storage ender-chest button on
 * top of the survival inventory screen via Forge ScreenEvents.
 *
 * Geometry (2026-09-28): everything is anchored to the live screen's
 * getGuiLeft()/getGuiTop(), so the tab follows every panel shift -- the recipe
 * book AND Apothic Attributes' side panel (which moves the inventory right by
 * the same 77px but was invisible to the old recipe-book-only offset).
 *   Aptitudes tab: x = guiLeft+27..+53, y = guiTop-28..+4 (above the panel)
 *   Apothic toggle: guiLeft+63, guiTop+10 (its native spot, inside the panel)
 *
 * Survival only. On CreativeModeInventoryScreen the survival-geometry math put
 * the tab over the vanilla creative tab row (columns 1-2, on every page) and
 * isOverTabStrip ate their clicks; creative players use the Y keybind.
 *
 * Why ScreenEvent over the old mixin: a mixin on InventoryScreen competed
 * with other mods' mixins on the same target. Render.Post fires after every
 * other mod's render hook so we paint last; MouseButtonPressed.Pre lets us
 * cancel clicks inside our hit-box before vanilla dispatches them to other
 * mods' buttons.
 */
@Mod.EventBusSubscriber(modid = JustLevelingFork.MOD_ID, value = Dist.CLIENT)
public final class InventoryTabHandler {
    /**
     * The tab sits in the second tab slot (guiLeft+27). The first slot
     * (guiLeft+0..26) is kept free on purpose: it is where L2Tabs (jar-in-jar
     * in celestial_core; its strip is disabled via l2tabs-client.toml) drew
     * its Inventory tab, and it is where QuickStack's static buttons land when
     * the recipe book is opened mid-screen (config/quickstack-client.toml).
     */
    private static final int TAB_X = 27;
    private static final int TAB_Y = -28;
    private static final int ENDER_BTN_W = 20;
    private static final int ENDER_BTN_H = 18;

    private static boolean enderHover = false;
    private static boolean enderArmed = false;

    private InventoryTabHandler() {}

    private static boolean shouldRender(Screen s) {
        return Minecraft.getInstance().player != null && s instanceof InventoryScreen;
    }

    @SubscribeEvent(priority = EventPriority.LOW)
    public static void onRender(ScreenEvent.Render.Post event) {
        if (!shouldRender(event.getScreen())) return;
        InventoryScreen inv = (InventoryScreen) event.getScreen();
        GuiGraphics matrixStack = event.getGuiGraphics();
        int mouseX = event.getMouseX();
        int mouseY = event.getMouseY();

        DrawTabs.render(matrixStack, mouseX, mouseY, inv.getGuiLeft() + TAB_X, inv.getGuiTop() + TAB_Y);

        if (RegistrySkills.WORMHOLE_STORAGE != null && RegistrySkills.WORMHOLE_STORAGE.get().isEnabled()) {
            enderHover = false;
            matrixStack.pose().pushPose();
            int buttonX = inv.getGuiLeft() + 127;
            int buttonY = inv.getGuiTop() + 61;
            int spriteV = 0;
            if (Utils.checkMouse(buttonX, buttonY, mouseX, mouseY, ENDER_BTN_W, ENDER_BTN_H)) {
                spriteV = 18;
                enderHover = true;
                if (enderArmed) {
                    OpenEnderChestSP.send();
                    Utils.playSound();
                    enderArmed = false;
                }
            }
            RenderSystem.enableBlend();
            matrixStack.blit(
                    new ResourceLocation(JustLevelingFork.MOD_ID, "textures/skill/ender_chest_button.png"),
                    buttonX, buttonY, 0.0F, spriteV, ENDER_BTN_W, ENDER_BTN_H, ENDER_BTN_W, 36);
            matrixStack.pose().popPose();
        }
    }

    @SubscribeEvent(priority = EventPriority.HIGH)
    public static void onClick(ScreenEvent.MouseButtonPressed.Pre event) {
        if (!shouldRender(event.getScreen())) return;
        if (event.getButton() != 0) return;

        if (enderHover) enderArmed = true;

        // Hand the click to DrawTabs so it can latch its own deferred trigger.
        DrawTabs.mouseClicked(event.getButton());

        // If the cursor is inside our tab strip or ender button, eat the click
        // so other mods' buttons don't also fire.
        if (enderHover || isOverTabStrip((InventoryScreen) event.getScreen(), event.getMouseX(), event.getMouseY())) {
            event.setCanceled(true);
        }
    }

    private static boolean isOverTabStrip(InventoryScreen inv, double mx, double my) {
        int leftX = inv.getGuiLeft() + TAB_X;
        int topY = inv.getGuiTop() + TAB_Y;
        int rightX = leftX + DrawTabs.tabList.size() * 27;
        int bottomY = topY + 32;
        return mx >= leftX && mx < rightX && my >= topY && my < bottomY;
    }
}
