package net.royling.lovelysparklepieces.ClientEvent;

import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.eventbus.api.EventPriority;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.client.event.*;
import net.minecraftforge.client.settings.KeyConflictContext;
import net.minecraftforge.event.TickEvent;
import net.royling.lovelysparklepieces.network.NetworkHandler;
import net.royling.lovelysparklepieces.network.DoubleJumpPacket;
import net.royling.lovelysparklepieces.network.OpenChestPacket;
import net.royling.lovelysparklepieces.network.PlayerFpsPacket;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModItem.ModUsingItem.Binoculars;
import net.royling.lovelysparklepieces.ModItem.ModUsingItem.ModItems;
import org.lwjgl.glfw.GLFW;

@Mod.EventBusSubscriber(modid = LovelySparklePieces.MODID, value = Dist.CLIENT, bus = Mod.EventBusSubscriber.Bus.MOD)
public class ModClientEvents {
    public static final KeyMapping OPEN_ENDER_CHEST = new KeyMapping(
            "key.lsp.open_ender_chest",
            KeyConflictContext.IN_GAME,
            InputConstants.Type.KEYSYM,
            GLFW.GLFW_KEY_N,
            "key.categories.lsp"
    );
    @SubscribeEvent
    public static void registerKeys(RegisterKeyMappingsEvent event) {
        event.register(OPEN_ENDER_CHEST);
    }
    @Mod.EventBusSubscriber({Dist.CLIENT})
    public static class KeyEventListener {
        private static int initDelay = 0;
        private static Double originalSensitivity = -1d;
        @SubscribeEvent
        public static void onClientTick(TickEvent.ClientTickEvent event) {
            if (event.phase != TickEvent.Phase.END) return;
            if (initDelay <= 40) {
                initDelay += 1;
                return;
            }
            Minecraft mc = Minecraft.getInstance();
            if (mc.player == null || mc.getConnection() == null) return;
            long fps = Math.max(1, mc.getFps());
            double maxMemoryGB = Runtime.getRuntime().maxMemory() / 1024.0 / 1024 / 1024;
            NetworkHandler.sendToServer(new PlayerFpsPacket(fps, maxMemoryGB));
            initDelay = 0;
            // 原望远镜灵敏度逻辑
            Player player = mc.player;
            if (player == null) return;
            boolean isUsingBinoculars = player.isUsingItem() &&
                    player.getUseItem().getItem() instanceof Binoculars;
            if (isUsingBinoculars) {
                if (originalSensitivity < 0) {
                    originalSensitivity = mc.options.sensitivity().get();
                }
                mc.options.sensitivity().set(originalSensitivity * 0.2F);
            } else if (originalSensitivity > 0) {
                mc.options.sensitivity().set(originalSensitivity);
                originalSensitivity = -1d;
            }
        }
        @SubscribeEvent
        public static void onInput(InputEvent.Key event) {
            Minecraft mc = Minecraft.getInstance();
            if (mc.player == null) return;
            if (OPEN_ENDER_CHEST.consumeClick()) {
                NetworkHandler.sendToServer(new OpenChestPacket());
            }
            if (!mc.player.onGround() && mc.options.keyJump.isDown()) {
                NetworkHandler.sendToServer(new DoubleJumpPacket());
            }
        }
    }
    // GUI overlays are handled in HUBRender.java for 1.20.1
}
