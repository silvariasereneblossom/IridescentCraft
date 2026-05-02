package com.iridescentcraft.reforging.mixin;

import dev.shadowsoffire.attributeslib.client.AttributesGui;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.ImageButton;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Relocates Apothic Attributes' "Show Attributes" toggle button out of
 * its default (guiLeft+63, guiTop+10) position, where it visually clips
 * into JustLevelingFork's leveling tab.
 *
 * <p>The default position sits 10 pixels below the inventory's top edge,
 * partly under the same x-zone as JLF's leveling tab (guiLeft+27..53,
 * y=guiTop-28..+4). At GUI scale 2+ the visual gap between the tab
 * and the button collapses, and Minecraft's tooltip dispatcher can fire
 * both tooltips on hover near the boundary, producing the user-reported
 * "Aptifibutes" garbled tooltip.
 *
 * <p>New position: (guiLeft+155, guiTop+5) — upper-right corner of the
 * 176-wide inventory image, well clear of JLF's tabs (always at i=0..n
 * starting at guiLeft+27), Curios's button at (guiLeft+26, guiTop+8),
 * and Apotheosis's "Sets" button (around guiLeft+85, guiTop+45).
 *
 * <p>Apothic sets the button position both in the constructor and on
 * every {@code render} call (via {@code toggleBtn.setX/setY}). We override
 * AFTER render to win the race.
 */
@Mixin(value = AttributesGui.class, remap = false)
public class AttributesGuiToggleBtnMixin {

    @Shadow public ImageButton toggleBtn;
    @Shadow public InventoryScreen parent;

    @Inject(
        method = "render(Lnet/minecraft/client/gui/GuiGraphics;IIF)V",
        at = @At("TAIL"),
        remap = true
    )
    public void icraft_relocateToggleBtn(GuiGraphics gfx, int mouseX, int mouseY, float partialTicks, CallbackInfo ci) {
        if (this.toggleBtn != null && this.parent != null) {
            this.toggleBtn.setX(this.parent.getGuiLeft() + 155);
            this.toggleBtn.setY(this.parent.getGuiTop() + 5);
        }
    }
}
