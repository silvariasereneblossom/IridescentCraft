package com.iridescentcraft.reforging.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import se.mickelus.mutil.gui.GuiAttachment;
import se.mickelus.mutil.gui.GuiElement;
import se.mickelus.mutil.gui.GuiStringSmall;
import se.mickelus.tetra.blocks.workbench.gui.GuiModule;
import se.mickelus.tetra.module.data.GlyphData;

/**
 * Adds a small slot-name subheading above the variant name on minor module
 * slots in Tetra's workbench, matching the visual hierarchy that
 * {@link se.mickelus.tetra.blocks.workbench.gui.GuiModuleMajor} already
 * provides for major slots.
 *
 * <p>Tetra ships {@code GuiModuleMajor} with a dedicated {@code GuiStringSmall
 * slotString} field (rendered at y=0, with the variant name at y=5). Base
 * {@code GuiModule} — used for all minor slots — has only {@code moduleString}
 * with no separate header. Players inspecting our armor see "Chest Plate"
 * cleanly labeled but the lining/visor/belt/sole minor row reads as a flat
 * variant name with no hierarchy.
 *
 * <p>{@code GuiModuleMajor.setupChildren} overrides the base implementation
 * without calling {@code super}, so this {@code @At("TAIL")} injection only
 * fires for true {@code GuiModule} instances (the polymorphic dispatch sends
 * Major's own override directly). The defensive {@code instanceof} guard is
 * belt-and-suspenders against future Tetra changes that re-introduce a super
 * call from a subclass.
 *
 * <p>Position {@code y = -5}: above the variant string at {@code y = 1},
 * matching the 5px gap Major uses between its own slotString (y=0) and its
 * variant string (y=5). Each of our armor pieces has exactly one minor slot
 * (visor / chest_lining / belt / boot_lining), so there's no inter-minor
 * stack overlap to worry about. {@code GuiStringSmall} doubles its
 * coordinates internally; positions match Tetra's existing minor layout.
 */
// remap=false on @Mixin tells the AP this is a non-vanilla target (Tetra's
// own class) so it won't try to resolve via SRG and won't write a refmap
// entry that would never match at runtime.
@Mixin(value = GuiModule.class, remap = false)
public abstract class GuiModuleSlotSubheadingMixin extends GuiElement {

    // Required because GuiElement has no no-arg constructor.
    private GuiModuleSlotSubheadingMixin(int x, int y, int width, int height) {
        super(x, y, width, height);
    }

    @Inject(method = "setupChildren", at = @At("TAIL"), remap = false)
    private void iridescent_reforging$addSlotSubheading(
            String moduleName,
            GlyphData glyphData,
            String slotName,
            boolean tweakable,
            CallbackInfo ci) {
        // Defensive: any future override that calls super would re-enter here.
        if ((Object) this instanceof se.mickelus.tetra.blocks.workbench.gui.GuiModuleMajor) {
            return;
        }
        if (slotName == null || slotName.isEmpty()) {
            return;
        }
        // Skip the empty-slot redundant case: when there's no module, base
        // GuiModule sets moduleString text to slotName itself — adding a
        // duplicate slotString header would just double the label.
        if (moduleName == null) {
            return;
        }

        GuiStringSmall slotString = new GuiStringSmall(-12, -5, slotName);
        // Mirror Tetra's left/right alignment behavior from GuiModuleMajor.
        if (GuiAttachment.topLeft.equals(this.attachmentPoint)) {
            slotString.setX(12);
        }
        slotString.setAttachment(this.attachmentPoint);
        this.addChild(slotString);
    }
}
