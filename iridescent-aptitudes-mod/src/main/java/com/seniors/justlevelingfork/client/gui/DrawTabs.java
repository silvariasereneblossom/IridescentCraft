package com.seniors.justlevelingfork.client.gui;

import com.seniors.justlevelingfork.JustLevelingFork;
import com.seniors.justlevelingfork.client.core.Tabs;
import com.seniors.justlevelingfork.client.core.Utils;
import com.seniors.justlevelingfork.client.screen.JustLevelingScreen;
import com.seniors.justlevelingfork.registry.RegistryItems;
import com.mojang.blaze3d.systems.RenderSystem;

import java.util.ArrayList;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;

public class DrawTabs {
    public static final ResourceLocation TEXTURE = new ResourceLocation(JustLevelingFork.MOD_ID, "textures/gui/container/tabs.png");
    public static final Minecraft client = Minecraft.getInstance();
    public static ArrayList<Tabs> tabList = new ArrayList<>();
    public static boolean isMouseCheck = false;
    public static boolean checkMouse = false;

    /**
     * Draws the tab strip with its first tab's top-left at (left, top). Callers
     * pass the live panel anchor (e.g. the inventory's getGuiLeft/getGuiTop) so
     * the strip follows every panel shift instead of re-deriving it here from
     * the window size.
     */
    public static void render(GuiGraphics matrixStack, int mouseX, int mouseY, int left, int top) {
        Screen screen = client.screen;
        if (client.player != null) {
            isMouseCheck = false;
            tabList = new ArrayList<>();
            // Only the leveling tab: the JLF "inventory" navigation tab is gone
            // (Esc and E already return to the inventory). The garbled
            // "Aptifibutes" / doubled-"Aptitudes" tooltip reports were never
            // Apothic's toggleBtn: L2Tabs (jar-in-jar in celestial_core) drew
            // its own tab strip at guiTop-28 with an "Attributes" tab at
            // guiLeft+26, 1px under this tab. That strip is now disabled in
            // config/l2_configs/l2tabs-client.toml (showTabs = false).
            tabList.add(new Tabs("leveling", RegistryItems.LEVELING_BOOK.get().getDefaultInstance(), new JustLevelingScreen(), screen instanceof JustLevelingScreen, Component.translatable("screen.aptitude.title")));
        }
        for (int i = 0; i < tabList.size(); i++) {
            renderWidget(matrixStack, tabList.get(i), left + i * 27, top, mouseX, mouseY);
        }
    }

    public static void renderWidget(GuiGraphics matrixStack, Tabs type, int x, int y, int mouseX, int mouseY) {
        matrixStack.pose().pushPose();
        RenderSystem.enableBlend();
        matrixStack.blit(TEXTURE, x, y, type.getName().equals("inventory") ? 0 : 26, type.isScreen() ? 32 : 0, 26, 32);
        // The tooltip is drawn once, below (after the icon). A second
        // drawToolTip here used to paint it twice every hovered frame.
        float scale = (type.getItemStack().getItem() instanceof net.minecraft.world.item.StandingAndWallBlockItem) ? 1.125F : 1.0F;
        float newX = (x + 13.0F - 8.0F) / scale;
        float newY = (y + 15.0F - 8.0F + (type.isScreen() ? 0.0F : 2.0F)) / scale;
        matrixStack.pose().pushPose();
        matrixStack.pose().scale(scale, scale, 1.0F);
        matrixStack.renderItem(type.getItemStack(), (int) newX, (int) newY);
        matrixStack.pose().popPose();
        matrixStack.pose().popPose();

        if (Utils.checkMouse(x, y, mouseX, mouseY, 26, 32) && !type.isScreen()) {
            Utils.drawToolTip(matrixStack, type.getComponentName(), mouseX, mouseY);
            isMouseCheck = true;
            if (checkMouse) {
                setScreen(tabList.indexOf(type));
                checkMouse = false;
            }
        }
    }

    public static void setScreen(int i) {
        Utils.playSound();
        client.setScreen(tabList.get(i).getScreen());
    }

    public static void mouseClicked(int button) {
        if (button == 0 && isMouseCheck) checkMouse = true;
    }

    public static void onClose() {
        checkMouse = false;
    }
}


