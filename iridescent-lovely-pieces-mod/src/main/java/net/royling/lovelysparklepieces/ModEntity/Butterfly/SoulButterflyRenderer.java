package net.royling.lovelysparklepieces.ModEntity.Butterfly;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.ResourceLocation;
import net.royling.lovelysparklepieces.ClientEvent.ModClientEvents;
import net.royling.lovelysparklepieces.LovelySparklePieces;

public class SoulButterflyRenderer extends MobRenderer<SoulButterflyEntity, SoulButterfly<SoulButterflyEntity>> {
    private static final ResourceLocation TEXTURE = new ResourceLocation(LovelySparklePieces.MODID, "textures/entity/soul_butterfly_yin.png");
    public SoulButterflyRenderer(EntityRendererProvider.Context context) {
        super(context,new SoulButterfly<>(context.bakeLayer(SoulButterfly.LAYER_LOCATION)),0.2F);
    }
    @Override
    public ResourceLocation getTextureLocation(SoulButterflyEntity butterflyEntity) {
        return TEXTURE;
    }

    @Override
    public void render(SoulButterflyEntity entity, float entityYaw, float partialTicks, PoseStack poseStack, MultiBufferSource buffer, int packedLight) {
        super.render(entity, entityYaw, partialTicks, poseStack, buffer, packedLight);
    }
}
