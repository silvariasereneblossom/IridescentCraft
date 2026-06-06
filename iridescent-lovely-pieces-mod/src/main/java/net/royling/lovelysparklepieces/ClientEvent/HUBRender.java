package net.royling.lovelysparklepieces.ClientEvent;

import com.mojang.blaze3d.platform.GlStateManager;
import com.mojang.blaze3d.platform.Window;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
// import net.mehvahdjukaar.dummmmmmy.common.ModEvents; // Removed: Not available in 1.20.1
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.phys.Vec3;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.client.event.EntityRenderersEvent;
import net.minecraftforge.client.event.RenderGuiEvent;
import net.minecraftforge.client.event.RenderLevelStageEvent;
import net.minecraftforge.client.event.RenderLivingEvent;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModEvents.Legendarys.BCEvents;
import net.royling.lovelysparklepieces.ModItem.ModCurios.Legendary.BlasphemousContract;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModUsingItem.ModItems;
import net.royling.lovelysparklepieces.PlayerData.ChipsData;
import org.joml.Matrix3f;
import org.joml.Matrix4f;
import top.theillusivec4.curios.api.CuriosApi;

import javax.swing.*;

@Mod.EventBusSubscriber(value = Dist.CLIENT, bus = Mod.EventBusSubscriber.Bus.FORGE)
public class HUBRender {
    private static final ResourceLocation SOUL_BAR_TEXTURE =
            new ResourceLocation(LovelySparklePieces.MODID
                    , "textures/gui/soul_bar.png");
    private static long lastUpdate = 0;
    private static String currentTime = "";
    private static double lastSpeed = 0.0;
    private static long lastUpdateTick = 0;

    @SubscribeEvent
    public static void onRenderHUD(RenderGuiEvent.Post event){
        Minecraft minecraft = Minecraft.getInstance();
        Player player = minecraft.player;
        if(player == null)return;
        GuiGraphics guiGraphics = event.getGuiGraphics();
        int soulCount = player.getPersistentData().getInt("lsp_soul_count");
        float progress = Math.min((float) soulCount / 200f, 1f);
        Window window = Minecraft.getInstance().getWindow();
        int screenWidth = window.getGuiScaledWidth();
        int screenHeight = window.getGuiScaledHeight();
        int hot_barLeft = screenWidth / 2 - 91;
        int offhandSlotX = hot_barLeft - 26;
        int offhandSlotY = screenHeight - 23;
        int x = offhandSlotX - 58 - 6;
        int y = offhandSlotY + 4;
        int lava_y = offhandSlotY - 9;
        RenderSystem._setShaderTexture(0,SOUL_BAR_TEXTURE);
        if(BCEvents.hasBlasphemousContract(player)) {
            guiGraphics.blit(SOUL_BAR_TEXTURE, x, y, 0, 0, 58, 13);
            int progress_width = (int) (40 * progress);
            if (progress_width > 0) {
                guiGraphics.blit(SOUL_BAR_TEXTURE, x + 15, y + 4,
                        0, 13, progress_width, 5, 256, 256);
            }
            Font font = minecraft.font;
            String text = soulCount + "/200";
            int textX = x + 15 + (39 - font.width(text)) / 2;
            int textY = y + 4 - 2;

            guiGraphics.drawString(
                    font,
                    text,
                    textX,
                    textY,
                    ColorUtil.getRainbow(),
                    true
            );
        }
        if(ModCurios.hasCurio(player,ModCurios.MAGMA_AMULET.get())) {
            if (player.getPersistentData().get("lsp_lava_def") != null) {
                guiGraphics.blit(SOUL_BAR_TEXTURE, x, lava_y, 0, 18, 58, 13);
                float progress2 = Math.min((float) player.getPersistentData().getInt("lsp_lava_def") / 140, 1f);
                int progress_width2 = (int) (40 * progress2);
                if (progress_width2 > 0) {
                    guiGraphics.blit(SOUL_BAR_TEXTURE, x + 15, lava_y + 4,
                            0, 31, progress_width2, 5, 256, 256);
                }
            }
        }
        if(ModCurios.hasCurio(player,ModCurios.GAMBLERS_DICE.get())){
            guiGraphics.blit(SOUL_BAR_TEXTURE,x-58,lava_y+13,0,36,58,13);
            float progress3 = Math.min((float) player.getPersistentData().getInt("lsp_chip_count")/1000,1f);
            int progress_width3 = (int)(40*progress3);
            if(progress_width3>0){
                guiGraphics.blit(SOUL_BAR_TEXTURE,x-58+15,lava_y+13+4,
                        0,49,progress_width3,5,256,256);
            }
            guiGraphics.drawString(minecraft.font,
                    player.
                            getPersistentData().getInt("lsp_chip_count")+"/1000",
                    x-58+15+8,lava_y+13+2,ColorUtil.getRainbow(),true);
        }
        if(ModCurios.hasCurio(player,ModCurios.BLAZE_CORE.get())){
            guiGraphics.blit(SOUL_BAR_TEXTURE,x-58,lava_y,0,54,58,13);
            float progress4 = Math.min(player.getPersistentData().getInt("lsp_lsp_temperature_count")/150,1);
            int progress_width4 = (int)(40*progress4);
            if(progress_width4>0){
                guiGraphics.blit(SOUL_BAR_TEXTURE,x-58+15,lava_y+4,
                        0,67,progress_width4,5,256,256);
            }
            guiGraphics.drawString(minecraft.font,
                    player.
                            getPersistentData().getInt("lsp_temperature_count")+"/150",
                    x-58+15+10,lava_y+2,ColorUtil.getRainbow(),true);
        }

        if(player.isUsingItem() && player.getUseItem().is(ModItems.DOMAIN_STONE.get())){
            guiGraphics.blit(SOUL_BAR_TEXTURE,screenWidth/2 -26,screenHeight/2+25,64,0,52,7);
            float usingProgress = Math.min((player.getPersistentData().getInt("lsp_usingitemtick")/80f),1);
            int usingProgress_w = Math.min((int)(50*usingProgress)+4,50);
            if(usingProgress_w>0){
                guiGraphics.blit(SOUL_BAR_TEXTURE,screenWidth/2-25,screenHeight/2+26,64,7,
                        usingProgress_w,5,256,256);
            }
        }

        if(ModCurios.hasCurio(player,ModCurios.POCKET_WATCH.get())||ModCurios.hasCurio(player,ModCurios.GPS.get())||ModCurios.hasCurio(player,ModCurios.PDA.get())){
                int time_y = window.getGuiScaledHeight()/2;
                currentTime = calculateGameTime(minecraft.level);
                lastUpdate = System.currentTimeMillis();
                guiGraphics.drawString(
                        minecraft.font,
                        Component.literal(getTimeIcon(minecraft.level.getDayTime())+currentTime),
                        10,time_y,0xFFFFFF,true
                );
        }
        if(ModCurios.hasCurio(player,ModCurios.PDA.get())) {
            guiGraphics.drawString(
                    minecraft.font,
                    Component.literal(String.valueOf("❤\uFE0F" + player.getPersistentData().getInt("lsp_heart_state"))),
                    10, window.getGuiScaledHeight() / 2 + 30, 0xFFFFFF, true
            );
        }
        if(ModCurios.hasCurio(player,ModCurios.SPEEDOMETER.get())||ModCurios.hasCurio(player,ModCurios.GPS.get())||ModCurios.hasCurio(player,ModCurios.PDA.get())){
            int time_y = window.getGuiScaledHeight()/2 + 10;
            lastSpeed = calculateHorizontalSpeed(player);
            lastUpdateTick = minecraft.player.tickCount;
            String  emoji = getSpeedEmoji(lastSpeed,player);
            ChatFormatting color = getSpeedColor(lastSpeed);
            String speedText = String.format("%s %.1f m/s",emoji,lastSpeed);
            Component text = Component.literal(speedText).withStyle(Style.EMPTY.withColor(color.getColor()));
            guiGraphics.drawString(
                    minecraft.font,
                    text,
                    10,time_y,0xFFFFFF,true
            );
        }
        if(ModCurios.hasCurio(player,ModCurios.POSITION_TRACKER.get())||ModCurios.hasCurio(player,ModCurios.GPS.get())||ModCurios.hasCurio(player,ModCurios.PDA.get())){
            int time_y = window.getGuiScaledHeight()/2 + 20;
            double px = Math.round(player.getX() * 10.0) / 10.0;
            double py = Math.round(player.getY() * 10.0) / 10.0;
            double pz = Math.round(player.getZ() * 10.0) / 10.0;
            String dimension = player.level().dimension().location().toString();
            Component text = Component.literal(
                    String.format("%s: x%.1f y%.1f z%.1f", getLevelDimension(dimension), px, py,pz)
            ).withStyle(ChatFormatting.GREEN);
            guiGraphics.drawString(
                    minecraft.font,text,
                    10,time_y,0xFFFFFF,true
            );
        }
        if(ModCurios.hasCurio(player,ModCurios.PDA.get())){
            int phase = getMoonPhase(player);
            String  moonSymbol;
            if(phase<1||phase>8){
                 moonSymbol = " ";
            }
            else {
                moonSymbol = MOON_PHASES[phase];
            }
            String phaseName = switch (phase) {
                case 0 -> "满月";
                case 1 -> "亏凸月";
                case 2 -> "下弦月";
                case 3 -> "残月";
                case 4 -> "新月";
                case 5 -> "蛾眉月";
                case 6 -> "上弦月";
                case 7 -> "盈凸月";
                default -> "未知";
            };
            Component text = Component.literal(moonSymbol+phaseName).withStyle(ChatFormatting.BOLD);
            if(player.level().getDayTime()<11834){
                text = Component.literal("On Day!");
            }
            guiGraphics.drawString(
                    minecraft.font,
                    text,
                    10,window.getGuiScaledHeight()/2+40,
                    0x0080AA,true
            );
        }
        if(ModCurios.hasCurio(player,ModCurios.PDA.get())){
            String symbol = getWeatherSymbol(player.level(),player);
            String weather = getWeatherString(player);
            guiGraphics.drawString(
                    minecraft.font,
                    Component.literal(symbol+weather),
                    10,window.getGuiScaledHeight()/2-10,0xFFFFFF,true
            );
        }
        if(ModCurios.hasCurio(player,ModCurios.EYE_MASK.get())){
            guiGraphics.fill(
                    RenderType.guiOverlay(),
                    0,0,window.getGuiScaledWidth()/2,window.getGuiScaledHeight(),
                    0xFF000000
            );
        }
    }
    @SubscribeEvent
    public static void onRenderHUDPost(RenderGuiEvent.Pre event){
        Minecraft minecraft = Minecraft.getInstance();
        Player player = minecraft.player;
        if(player == null)return;
        GuiGraphics guiGraphics = event.getGuiGraphics();
        Window window = Minecraft.getInstance().getWindow();

        if(ModCurios.hasCurio(player,ModCurios.NIGHT_VISION.get())){
            guiGraphics.fill(
                    RenderType.guiOverlay(),
                    0,0,window.getGuiScaledWidth(),window.getGuiScaledHeight(),
                    0x80009020
            );
        }
        if(ModCurios.hasCurio(player,ModCurios.DOUBLE_NIGHT_VISION.get())){
            guiGraphics.fill(
                    RenderType.guiOverlay(),
                    0,0,window.getGuiScaledWidth(),window.getGuiScaledHeight(),
                    0x70006090
            );
        }
        if(ModCurios.hasCurio(player,ModCurios.QUARTER_NIGHT_VISION.get())){
            guiGraphics.fill(
                    RenderType.guiOverlay(),
                    0,0,window.getGuiScaledWidth(),window.getGuiScaledHeight(),
                    0x60004040
            );
        }
        // Render binoculars overlay
        if(player.isUsingItem() && player.getUseItem().getItem() == ModItems.BINOCULARS.get()){
            ResourceLocation binocularsTexture = new ResourceLocation(LovelySparklePieces.MODID, "textures/gui/binoculars.png");
            RenderSystem.enableBlend();
            RenderSystem.defaultBlendFunc();
            guiGraphics.blit(
                    binocularsTexture,
                    0, 0,
                    window.getGuiScaledWidth(), window.getGuiScaledHeight(),
                    0, 0,
                    window.getGuiScaledWidth(), window.getGuiScaledHeight(),
                    window.getGuiScaledWidth(), window.getGuiScaledHeight()
            );
            RenderSystem.disableBlend();
        }
    }
    private static String calculateGameTime(Level level) {
        if (level == null) return "";
        long gameTime = level.getDayTime() % 24000;
        long hours = (gameTime / 1000 + 6) % 24; // 从6点开始计算
        long minutes = (gameTime % 1000) * 60 / 1000;
        return String.format("%02d:%02d", hours, minutes);
    }
    private static double calculateHorizontalSpeed(Player player){
        Vec3 motion = player.getDeltaMovement();
        double speed = Math.sqrt(motion.x * motion.x + motion.z * motion.z)*20;
        return Math.round(speed*10.0)/10.0;
    }
    private static String getTimeIcon(long gameTime) {
        // 将游戏刻转换为MC时间（24000刻=1天）
        long timeOfDay = gameTime % 24000;

        if (timeOfDay>18000&&timeOfDay < 23000) return "🌕";     // 午夜 0:00-6:00
        if (timeOfDay < 2000) return "🌅";     // 清晨 6:00-12:00
        if (timeOfDay < 11000) return "☀️";    // 白天 12:00-18:00
        if (timeOfDay < 14000) return "🌇";    // 黄昏 18:00-19:30
        return "🌙";                          // 夜晚 19:30-24:00
    }
    private static String getSpeedEmoji(double speed, Player player) {
        if(player.isFallFlying())return "🚀";
        if(player.getAbilities().flying)return "🚀";
        if (player.isInWater()) return "🏊";
        if (!player.onGround()) {
            if (player.getDeltaMovement().y < -0.08) return "🔽";
            return "🦘";
        }
        // 根据速度范围返回
        if (speed == 0.0) return "⏹";
        if (speed < 2.7) return "🚶";
        if (speed < 5.0) return "🏃";
        return "🐎";
    }
    private static ChatFormatting getSpeedColor(double speed) {
        if (speed >= 10.0) return ChatFormatting.RED;
        if (speed >= 5.0) return ChatFormatting.GOLD;
        if (speed >= 2.0) return ChatFormatting.YELLOW;
        return ChatFormatting.GREEN;
    }
    private static String getLevelDimension(String dimension){
        return switch (dimension){
            case "minecraft:overworld"->"主世界";
            case "minecraft:the_nether"->"下界";
            case "minecraft:the_end"->"末地";
            default -> dimension;
        };
    }
    private static final String[] MOON_PHASES = {
            "🌕", "🌖", "🌗", "🌘", "🌑", "🌒", "🌓", "🌔"
    };
    private static int getMoonPhase(Player player){
        if(player.level().dimension()!=Level.OVERWORLD){
            return -1;
        }
        return player.level().getMoonPhase();
    }
    private static String getWeatherSymbol(Level level, Player player) {
        if (level.isThundering()) {
            return "⛈";
        }
        if (level.isRaining()) {
            Biome biome = level.getBiome(player.blockPosition()).value();
            return switch (biome.getPrecipitationAt(player.blockPosition())) {
                case SNOW -> "❄";
                case NONE -> "☁";
                default -> "🌧";
            };
        }
        return "☀";
    }
    private static String getWeatherString(Player player) {
        if (player.level().isThundering()) {
            return "雷暴！！！";
        }
        if (player.level().isRaining()) {
            Biome biome = player.level().getBiome(player.blockPosition()).value();
            return switch (biome.getPrecipitationAt(player.blockPosition())) {
                case SNOW -> "雪";
                case NONE -> "阴";
                default -> "雨";
            };
        }
        return "晴";
    }
}
