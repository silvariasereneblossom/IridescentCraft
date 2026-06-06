package net.royling.lovelysparklepieces.ClientEvent;

import org.joml.SimplexNoise;

import java.awt.*;

public class ColorUtil {
    private static final long GLOBAL_TIMER = System.currentTimeMillis();

    // 基础彩虹效果
    public static int getRainbow() {
        return getRainbow(1.0f);
    }
    //基础彩虹效果，但是可以调节速度
    public static int getRainbow(float speed) {
        float hue = ((System.currentTimeMillis() - GLOBAL_TIMER) * speed % 3000) / 3000f;
        return Color.HSBtoRGB(hue, 0.8f, 0.9f) & 0x00FFFFFF;
    }
    //高级彩虹效果
    public static int getRainbowWave(float speed, float saturation) {
        float hue = ((System.currentTimeMillis() - GLOBAL_TIMER) * speed % 2000) / 2000f;
        float wave = (float) Math.sin(System.currentTimeMillis() * 0.002) * 0.1f + 0.9f;
        return Color.HSBtoRGB(hue, saturation, wave) & 0x00FFFFFF;
    }
    //呼吸灯效果
    public static int getBreathing(int baseColor, float speed) {
        float progress = (float) Math.sin((System.currentTimeMillis() * speed) / 1000.0) * 0.5f + 0.5f;
        return adjustBrightness(baseColor, progress * 0.6f + 0.4f);
    }
    //火焰效果
    public static int getFireEffect(float speed) {
        float noise = (float) SimplexNoise.noise((float) (System.currentTimeMillis() * speed / 1000.0), 0);
        return Color.HSBtoRGB(
                0.07f + noise * 0.05f,
                0.8f - Math.abs(noise) * 0.3f,
                0.9f + noise * 0.1f
        ) & 0x00FFFFFF;
    }
    //双色渐变
    public static int getDualGradient(int color1, int color2, float speed) {
        float progress = (float) Math.sin((System.currentTimeMillis() * speed) / 1000.0) * 0.5f + 0.5f;
        return blendColors(color1, color2, progress);
    }
    //闪电脉冲
    public static int getLightningPulse(int baseColor, float speed) {
        long time = System.currentTimeMillis();
        float pulse = (time % (long)(2000 / speed)) < 100 ? 1.0f : 0.3f;
        return adjustSaturation(adjustBrightness(baseColor, pulse), 1.2f);
    }

    //实用工具方法
    private static int adjustBrightness(int rgb, float factor) {
        int r = (int) (((rgb >> 16) & 0xFF) * factor);
        int g = (int) (((rgb >> 8) & 0xFF) * factor);
        int b = (int) ((rgb & 0xFF) * factor);
        return (Math.min(r, 255) << 16) | (Math.min(g, 255) << 8) | Math.min(b, 255);
    }

    private static int adjustSaturation(int rgb, float factor) {
        float[] hsv = new float[3];
        Color.RGBtoHSB((rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF, hsv);
        hsv[1] = Math.min(hsv[1] * factor, 1.0f);
        return Color.HSBtoRGB(hsv[0], hsv[1], hsv[2]) & 0x00FFFFFF;
    }

    private static int blendColors(int color1, int color2, float ratio) {
        float inverse = 1 - ratio;
        int r = (int) (((color1 >> 16) & 0xFF) * inverse + ((color2 >> 16) & 0xFF) * ratio);
        int g = (int) (((color1 >> 8) & 0xFF) * inverse + ((color2 >> 8) & 0xFF) * ratio);
        int b = (int) ((color1 & 0xFF) * inverse + (color2 & 0xFF) * ratio);
        return (r << 16) | (g << 8) | b;
    }
}

