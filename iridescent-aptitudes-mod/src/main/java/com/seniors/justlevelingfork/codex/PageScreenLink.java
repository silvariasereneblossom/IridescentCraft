package com.seniors.justlevelingfork.codex;

import com.seniors.justlevelingfork.client.screen.JustLevelingScreen;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.fml.ModList;
import vazkii.patchouli.client.book.BookPage;

/**
 * Custom Patchouli page type: renders an item icon + a click button that
 * opens a target Minecraft screen. Lets us put "Open Stats" / "Open
 * Aptitudes" entries in the Iridescent Codex without a separate keybind UX.
 *
 * JSON shape:
 *   {
 *     "type": "icraft:screen_link",
 *     "title": "Stats",
 *     "icon": "minecraft:enchanted_book",
 *     "target": "stats" | "aptitudes",
 *     "text": "Free-form description shown beneath the button"
 *   }
 *
 * `target` values:
 *   - "aptitudes" -> opens our JustLevelingScreen (always available)
 *   - "stats"     -> opens AttributesGui from Apothic Attributes IF
 *                    `attributeslib` is loaded; otherwise the button is
 *                    disabled and the page shows a "mod not loaded" hint.
 *
 * Patchouli's Gson reflectively populates non-transient fields from the
 * JSON. Don't rename without updating the codex JSON too.
 */
public class PageScreenLink extends BookPage {

    public String title = "";
    public String icon = "minecraft:book";
    public String target = "aptitudes";
    public String text = "";

    private transient ItemStack iconStack = ItemStack.EMPTY;
    private transient Component renderedTitle = Component.empty();
    private transient Component renderedText = Component.empty();
    private transient Button openButton;

    @Override
    public void onDisplayed(vazkii.patchouli.client.book.gui.GuiBookEntry parent, int left, int top) {
        super.onDisplayed(parent, left, top);

        // Resolve icon stack; failure → fallback to vanilla book.
        try {
            net.minecraft.resources.ResourceLocation rl = new net.minecraft.resources.ResourceLocation(icon);
            net.minecraft.world.item.Item item = net.minecraftforge.registries.ForgeRegistries.ITEMS.getValue(rl);
            iconStack = (item != null) ? new ItemStack(item) : new ItemStack(net.minecraft.world.item.Items.BOOK);
        } catch (Throwable t) {
            iconStack = new ItemStack(net.minecraft.world.item.Items.BOOK);
        }
        renderedTitle = Component.literal(title);
        renderedText = Component.literal(text);

        boolean enabled = isTargetAvailable();
        Component label = enabled
                ? Component.translatable("icraft.codex.screen_link.open")
                : Component.translatable("icraft.codex.screen_link.unavailable");
        openButton = Button.builder(label, b -> openTarget())
                .pos(left + 26, top + 18)
                .size(80, 20)
                .build();
        openButton.active = enabled;
        addButton(openButton);
    }

    @Override
    public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTicks) {
        // Title above the row.
        graphics.drawString(fontRenderer, renderedTitle, 0, 0, 0x000000, false);
        // Item icon to the left of the button.
        graphics.renderItem(iconStack, 4, 16);
        // Free-form description below.
        if (text != null && !text.isEmpty()) {
            int wrapWidth = 110;
            int y = 46;
            for (net.minecraft.util.FormattedCharSequence line :
                    fontRenderer.split(renderedText, wrapWidth)) {
                graphics.drawString(fontRenderer, line, 0, y, 0x404040, false);
                y += fontRenderer.lineHeight + 1;
            }
        }
    }

    private boolean isTargetAvailable() {
        return switch (target == null ? "" : target) {
            case "aptitudes" -> true;
            case "stats" -> ModList.get().isLoaded("attributeslib");
            default -> false;
        };
    }

    private void openTarget() {
        if ("aptitudes".equals(target)) {
            Minecraft.getInstance().setScreen(new JustLevelingScreen());
        } else if ("stats".equals(target)) {
            openAttributesGuiReflective();
        }
    }

    /** Apothic Attributes is a soft dependency — load AttributesGui via
     * reflection so this class doesn't fail to link when the mod is absent. */
    private static void openAttributesGuiReflective() {
        try {
            Class<?> cls = Class.forName("dev.shadowsoffire.attributeslib.client.AttributesGui");
            Screen screen = (Screen) cls.getDeclaredConstructor().newInstance();
            Minecraft.getInstance().setScreen(screen);
        } catch (Throwable t) {
            // Soft fail — button shouldn't be active in this state anyway.
        }
    }
}
