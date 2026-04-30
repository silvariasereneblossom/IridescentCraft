package com.seniors.justlevelingfork.client.event;

import com.mojang.blaze3d.systems.RenderSystem;
import com.seniors.justlevelingfork.JustLevelingFork;
import com.seniors.justlevelingfork.client.core.Utils;
import com.seniors.justlevelingfork.client.gui.DrawTabs;
import com.seniors.justlevelingfork.network.packet.common.OpenEnderChestSP;
import com.seniors.justlevelingfork.registry.RegistrySkills;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.resources.ResourceLocation;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.event.ScreenEvent;
import net.minecraftforge.eventbus.api.EventPriority;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

/**
 * Renders the inventory ↔ aptitudes tab strip and the optional Wormhole Storage
 * ender-chest button on the vanilla {@link InventoryScreen} via Forge ScreenEvents
 * instead of a mixin.
 *
 * Why: when this lived in a mixin (MixInventoryScreen), it competed with other
 * mods' mixins on the same screen — most visibly Apothic Attributes' "View
 * Stats" button, which would overdraw our aptitudes tab and steal clicks.
 * Moving to ScreenEvent.Render.Post guarantees we paint after every other mod's
 * render hook, and ScreenEvent.MouseButtonPressed.Pre lets us cancel clicks
 * inside our hit-box before vanilla dispatches them to other mods' buttons.
 */
@Mod.EventBusSubscriber(modid = JustLevelingFork.MOD_ID, value = Dist.CLIENT)
public final class InventoryTabHandler {
    private static final int INV_W = 176;
    private static final int INV_H = 166;
    private static final int ENDER_BTN_W = 20;
    private static final int ENDER_BTN_H = 18;

    private static boolean enderHover = false;
    private static boolean enderArmed = false;

    private InventoryTabHandler() {}

    @SubscribeEvent(priority = EventPriority.LOW)
    public static void onRender(ScreenEvent.Render.Post event) {
        if (!(event.getScreen() instanceof InventoryScreen inv)) return;
        GuiGraphics matrixStack = event.getGuiGraphics();
        int mouseX = event.getMouseX();
        int mouseY = event.getMouseY();
        int recipeOffset = inv.getRecipeBookComponent().isVisible() ? 77 : 0;

        DrawTabs.render(matrixStack, mouseX, mouseY, INV_W, INV_H, recipeOffset);

        if (RegistrySkills.WORMHOLE_STORAGE != null && RegistrySkills.WORMHOLE_STORAGE.get().isEnabled()) {
            enderHover = false;
            matrixStack.pose().pushPose();
            int width = (Minecraft.getInstance().getWindow().getGuiScaledWidth() - INV_W) / 2;
            int height = (Minecraft.getInstance().getWindow().getGuiScaledHeight() - INV_H) / 2;
            int buttonX = width + 127 + recipeOffset;
            int buttonY = height + 61;
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
        if (!(event.getScreen() instanceof InventoryScreen)) return;
        if (event.getButton() != 0) return;

        if (enderHover) enderArmed = true;

        // Hand the click to DrawTabs so it can latch its own deferred trigger.
        DrawTabs.mouseClicked(event.getButton());

        // If the cursor is inside our tab strip or ender button, eat the click
        // so other mods' buttons (e.g. Apothic Attributes) don't also fire.
        if (enderHover || isOverTabStrip(event)) {
            event.setCanceled(true);
        }
    }

    private static boolean isOverTabStrip(ScreenEvent.MouseButtonPressed.Pre event) {
        if (!(event.getScreen() instanceof InventoryScreen inv)) return false;
        int recipe = inv.getRecipeBookComponent().isVisible() ? 77 : 0;
        int width = Minecraft.getInstance().getWindow().getGuiScaledWidth();
        int height = Minecraft.getInstance().getWindow().getGuiScaledHeight();
        int leftX = (width - INV_W) / 2 + recipe;
        int topY = (height - INV_H) / 2 - 28;
        int tabCount = DrawTabs.tabList != null ? DrawTabs.tabList.size() : 2;
        int rightX = leftX + tabCount * 27;
        int bottomY = topY + 32;
        double mx = event.getMouseX();
        double my = event.getMouseY();
        return mx >= leftX && mx < rightX && my >= topY && my < bottomY;
    }
}
