package net.royling.lovelysparklepieces.network;

import net.minecraft.client.Minecraft;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;
import net.minecraftforge.network.NetworkEvent;
import net.royling.lovelysparklepieces.ClientEvent.Particle.ModParticles;

import net.minecraftforge.registries.RegistryObject;
import java.util.function.Supplier;

public class DamageParticlePacket {
    private final String damageType;
    private final double damageCount;
    private final double posx;
    private final double posy;
    private final double posz;
    private final double magnification;

    public DamageParticlePacket(String damageType, double damageCount, double posx, double posy, double posz, double magnification) {
        this.damageType = damageType;
        this.damageCount = damageCount;
        this.posx = posx;
        this.posy = posy;
        this.posz = posz;
        this.magnification = magnification;
    }

    public DamageParticlePacket(FriendlyByteBuf buf) {
        this.damageType = buf.readUtf();
        this.damageCount = buf.readDouble();
        this.posx = buf.readDouble();
        this.posy = buf.readDouble();
        this.posz = buf.readDouble();
        this.magnification = buf.readDouble();
    }

    public void toBytes(FriendlyByteBuf buf) {
        buf.writeUtf(this.damageType);
        buf.writeDouble(this.damageCount);
        buf.writeDouble(this.posx);
        buf.writeDouble(this.posy);
        buf.writeDouble(this.posz);
        buf.writeDouble(this.magnification);
    }

    public boolean handle(Supplier<NetworkEvent.Context> supplier) {
        NetworkEvent.Context ctx = supplier.get();
        ctx.enqueueWork(() -> {
            // 确保在客户端执行
            if (ctx.getDirection().getReceptionSide().isClient()) {
                Player clientPlayer = Minecraft.getInstance().player;
                if (clientPlayer != null) {
                    Minecraft mc = Minecraft.getInstance();
                    mc.level.addParticle(ModParticles.DAMAGE_NUMBER_PARTICLE.get(),
                            this.posx, this.posy, this.posz,
                            this.damageCount,
                            getColorByDamageType(this.damageType), 
                            this.magnification);
                }
            }
        });
        return true;
    }

    private static int getColorByDamageType(String damageType) {
        return switch (damageType) {
            case "fire" -> 0xFFA500;    // 橙色
            case "magic" -> 0x00FFFF;    // 紫色
            case "fall" -> 0x808080;     // 灰色
            case "thunder" -> 0xFFD700;
            case "arrow" -> 0x8B658B;
            case "explosion" -> 0x8B3A3A;
            case "frozen" -> 0x7EC0EE;
            case "attack" -> 0xAA0000;
            default -> 0xCC3700;         // 红色（默认）
        };
    }
}
