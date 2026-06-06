package net.royling.lovelysparklepieces.ClientEvent.Particle;

import com.mojang.blaze3d.vertex.*;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.client.particle.ParticleRenderType;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;

public class DamageNumberParticle extends Particle {
   private final Font fontRenderer = Minecraft.getInstance().font;
    private final Component text;
    private final int color;

    public DamageNumberParticle(ClientLevel level, double x,double y,double z, double damage, int color,double magnification) {
        super(level, x, y, z);
        this.lifetime = 35;
        this.color = damage < 0 ? 0xff00ff00 : color; // 绿色为治疗，其他颜色为伤害
        if(magnification == 1d)
            this.text = Component.literal(String.format("%.2f",damage));
        else
            this.text = Component.literal(String.format("%.2f ( %s x)",damage,magnification));
        this.xd = (this.random.nextDouble() - 0.5) * 0.2; // [-0.1, 0.1]
        this.yd = 0.2 + this.random.nextDouble() * 0.2;   // [0.2, 0.4]
        this.zd = (this.random.nextDouble() - 0.5) * 0.2; // [-0.1, 0.1]
    }
    @Override
    public void render(VertexConsumer buffer, Camera camera, float partialTicks) {
        Vec3 cameraPos = camera.getPosition();
        float particleX = (float) (Mth.lerp(partialTicks, this.xo, this.x) - cameraPos.x());
        float particleY = (float) (Mth.lerp(partialTicks, this.yo, this.y) - cameraPos.y());
        float particleZ = (float) (Mth.lerp(partialTicks, this.zo, this.z) - cameraPos.z());
        PoseStack poseStack = new PoseStack();
        poseStack.pushPose();
        poseStack.translate(particleX, particleY, particleZ);
        poseStack.mulPose(camera.rotation());
        double distanceFromCam = new Vec3(particleX, particleY, particleZ).length();
        float scale = (float) (0.012 * distanceFromCam);
        poseStack.scale(scale, -scale, -scale);
        float xOffset = -fontRenderer.width(text) / 2f;
        fontRenderer.drawInBatch(
                text,
                xOffset,
                0,
                color,
                false,
                poseStack.last().pose(),
                Minecraft.getInstance().renderBuffers().bufferSource(),
                Font.DisplayMode.NORMAL,
                0,
                LightTexture.FULL_BRIGHT
        );
        poseStack.popPose();
    }
    @Override
    public void tick() {
        super.tick();
        if (++this.age >= this.lifetime) {
            this.remove();
            return;
        }
        this.yd -= 0.04;
        this.x += this.xd;
        this.y += this.yd;
        this.z += this.zd;
        this.xd *= 0.98;
        this.yd *= 0.98;
        this.zd *= 0.98;
        this.alpha = 1.0f - (float)this.age / this.lifetime;
    }
    @Override
    public ParticleRenderType getRenderType() {
        return ParticleRenderType.CUSTOM;
    }

    public static class Provider implements ParticleProvider<SimpleParticleType> {

        public Provider() {
        }

        @Override
        public Particle createParticle(
                SimpleParticleType type,
                ClientLevel level,
                double x, double y, double z,
                double xSpeed, double ySpeed, double zSpeed
        ) {
            return new DamageNumberParticle(level, x,y,z, xSpeed, (int) ySpeed,zSpeed);
        }
    }
}
