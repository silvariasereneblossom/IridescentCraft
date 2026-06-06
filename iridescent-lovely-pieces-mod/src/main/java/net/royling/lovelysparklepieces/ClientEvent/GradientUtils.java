package net.royling.lovelysparklepieces.ClientEvent;

public class GradientUtils {
    // 线性插值计算渐变颜色
    public static int getGradientColor(int startColor, int endColor, float progress) {
        int r = (int) (getRed(startColor) * (1 - progress) + getRed(endColor) * progress);
        int g = (int) (getGreen(startColor) * (1 - progress) + getGreen(endColor) * progress);
        int b = (int) (getBlue(startColor) * (1 - progress) + getBlue(endColor) * progress);
        return (r << 16) | (g << 8) | b;
    }
    private static int getRed(int rgb)   { return (rgb >> 16) & 0xFF; }
    private static int getGreen(int rgb) { return (rgb >> 8) & 0xFF; }
    private static int getBlue(int rgb)  { return rgb & 0xFF; }
}
