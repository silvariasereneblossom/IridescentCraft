package com.seniors.justlevelingfork.client.event;

import com.mojang.blaze3d.systems.RenderSystem;
import com.seniors.justlevelingfork.JustLevelingFork;
import com.seniors.justlevelingfork.client.core.Utils;
import com.seniors.justlevelingfork.client.gui.DrawTabs;
import com.seniors.justlevelingfork.network.packet.common.OpenEnderChestSP;
import com.seniors.justlevelingfork.registry.RegistrySkills;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.resources.ResourceLocation;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.event.ScreenEvent;
import net.minecraftforge.eventbus.api.EventPriority;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

/**
 * Renders the aptitudes tab + optional Wormhole Storage ender-chest button on
 * top of the inventory screen via Forge ScreenEvents.
 *
 * Visibility: tabs only render when the player is in creative mode, never on
 * the survival InventoryScreen. This dodges the Apothic Attributes "View
 * Stats" button that overlaps our tab area on survival. Survival players
 * still reach aptitudes via the Y keybind (key.justlevelingfork.title).
 *
 * Why ScreenEvent over the old mixin: a mixin on InventoryScreen competed
 * with other mods' mixins on the same target. Render.Post fires after every
 * other mod's render hook so we paint last; MouseButtonPressed.Pre lets us
 * cancel clicks inside our hit-box before vanilla dispatches them to other
 * mods' buttons.
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

    /** True only when the player is in creative gameMode AND the open screen
     * is one we want tabs on (survival InventoryScreen or the survival-inv
     * subview of the creative menu). */
    private static boolean shouldRender(net.minecraft.client.gui.screens.Screen s) {
        LocalPlayer p = Minecraft.getInstance().player;
        if (p == null || !p.isCreative()) return false;
        // Both screens use the same 176x166 inventory layout, so existing
        // tab math works on either. Creative menu's other tabs (Building
        // Blocks, Combat, etc.) display a different layout — render still
        // technically fires there, but the inventory rect math will sit off
        // to the side. Acceptable; the player only sees us when they switch
        // to the survival-inv tab.
        return s instanceof InventoryScreen || s instanceof CreativeModeInventoryScreen;
    }

    /** Horizontal offset (in tab widths) to clear the curios tab when it's
     * present — Curios renders an extra tab to the left of where ours would
     * sit. Detection: presence of the curios mod. */
    private static int curiosOffset() {
        return net.minecraftforge.fml.ModList.get().isLoaded("curios") ? 27 : 0;
    }

    @SubscribeEvent(priority = EventPriority.LOW)
    public static void onRender(ScreenEvent.Render.Post event) {
        if (!shouldRender(event.getScreen())) return;
        GuiGraphics matrixStack = event.getGuiGraphics();
        int mouseX = event.getMouseX();
        int mouseY = event.getMouseY();

        // Recipe-book offset only exists on InventoryScreen. CreativeModeInventoryScreen
        // doesn't have one — just zero it out there.
        int recipeOffset = (event.getScreen() instanceof InventoryScreen inv && inv.getRecipeBookComponent().isVisible()) ? 77 : 0;
        int xShift = recipeOffset + curiosOffset();

        DrawTabs.render(matrixStack, mouseX, mouseY, INV_W, INV_H, xShift);

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
        if (!shouldRender(event.getScreen())) return;
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
        int recipe = (event.getScreen() instanceof InventoryScreen inv && inv.getRecipeBookComponent().isVisible()) ? 77 : 0;
        int width = Minecraft.getInstance().getWindow().getGuiScaledWidth();
        int height = Minecraft.getInstance().getWindow().getGuiScaledHeight();
        int leftX = (width - INV_W) / 2 + recipe + curiosOffset();
        int topY = (height - INV_H) / 2 - 28;
        int tabCount = DrawTabs.tabList != null ? DrawTabs.tabList.size() : 2;
        int rightX = leftX + tabCount * 27;
        int bottomY = topY + 32;
        double mx = event.getMouseX();
        double my = event.getMouseY();
        return mx >= leftX && mx < rightX && my >= topY && my < bottomY;
    }
}
