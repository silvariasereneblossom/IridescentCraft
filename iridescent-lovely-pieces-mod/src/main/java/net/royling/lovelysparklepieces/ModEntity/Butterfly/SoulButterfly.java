package net.royling.lovelysparklepieces.ModEntity.Butterfly;// Made with Blockbench 4.12.4
// Exported for Minecraft version 1.17 or later with Mojang mappings
// Paste this class into your mod and generate all required imports

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import net.minecraft.client.animation.AnimationChannel;
import net.minecraft.client.animation.AnimationDefinition;
import net.minecraft.client.animation.Keyframe;
import net.minecraft.client.model.AnimationUtils;
import net.minecraft.client.model.HierarchicalModel;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.*;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.phys.Vec3;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import org.joml.Vector3f;

import java.util.List;
import java.util.Map;

public class SoulButterfly<T extends SoulButterflyEntity> extends HierarchicalModel<T> {
	// This layer location should be baked with EntityRendererProvider.Context in the entity renderer and passed into this model's constructor
	public static final ModelLayerLocation LAYER_LOCATION = new ModelLayerLocation(new ResourceLocation(LovelySparklePieces.MODID, "soul_butterfly"), "main");
	private final ModelPart root;
	private final ModelPart body;
	private final ModelPart feeler_r;
	private final ModelPart feeler_l;
	private final ModelPart wing_l;
	private final ModelPart bwing_l;
	private final ModelPart swing_l;
	private final ModelPart wing_r;
	private final ModelPart bwing_r;
	private final ModelPart swing_r;

	public SoulButterfly(ModelPart root) {
		this.root = root.getChild("root");
		this.body = this.root.getChild("body");
		this.feeler_r = this.body.getChild("feeler_r");
		this.feeler_l = this.body.getChild("feeler_l");
		this.wing_l = this.body.getChild("wing_l");
		this.bwing_l = this.wing_l.getChild("bwing_l");
		this.swing_l = this.wing_l.getChild("swing_l");
		this.wing_r = this.body.getChild("wing_r");
		this.bwing_r = this.wing_r.getChild("bwing_r");
		this.swing_r = this.wing_r.getChild("swing_r");
	}

	public static LayerDefinition createBodyLayer() {
		MeshDefinition meshdefinition = new MeshDefinition();
		PartDefinition partdefinition = meshdefinition.getRoot();

		PartDefinition root = partdefinition.addOrReplaceChild("root", CubeListBuilder.create(), PartPose.offset(0.0F, 24.0F, 0.0F));

		PartDefinition body = root.addOrReplaceChild("body", CubeListBuilder.create().texOffs(0, 0).addBox(-1.0F, -1.0F, -1.0F, 2.0F, 2.0F, 7.0F, new CubeDeformation(0.0F))
		.texOffs(14, 17).addBox(-1.0F, 1.0F, -1.0F, 0.0F, 1.0F, 7.0F, new CubeDeformation(0.0F))
		.texOffs(0, 17).addBox(1.0F, 1.0F, -1.0F, 0.0F, 1.0F, 7.0F, new CubeDeformation(0.0F)), PartPose.offset(0.0F, -3.25F, -3.0F));

		PartDefinition feeler_r = body.addOrReplaceChild("feeler_r", CubeListBuilder.create(), PartPose.offsetAndRotation(-1.0F, -0.25F, -0.5F, 0.0F, 0.0F, -2.0944F));

		PartDefinition cube_r1 = feeler_r.addOrReplaceChild("cube_r1", CubeListBuilder.create().texOffs(26, 12).addBox(0.0F, -2.0F, -1.0F, 1.0F, 1.0F, 2.0F, new CubeDeformation(0.0F)), PartPose.offsetAndRotation(2.5F, 1.5F, -4.0F, 0.0F, -1.1781F, 0.0F));

		PartDefinition cube_r2 = feeler_r.addOrReplaceChild("cube_r2", CubeListBuilder.create().texOffs(24, 25).addBox(0.0F, -2.0F, -1.0F, 1.0F, 1.0F, 2.0F, new CubeDeformation(0.0F)), PartPose.offsetAndRotation(0.75F, 1.5F, -3.0F, 0.0F, -0.8727F, 0.0F));

		PartDefinition cube_r3 = feeler_r.addOrReplaceChild("cube_r3", CubeListBuilder.create().texOffs(18, 25).addBox(0.0F, -2.0F, -1.0F, 1.0F, 1.0F, 2.0F, new CubeDeformation(0.0F)), PartPose.offsetAndRotation(-0.5F, 1.5F, -1.5F, 0.0F, -0.4363F, 0.0F));

		PartDefinition feeler_l = body.addOrReplaceChild("feeler_l", CubeListBuilder.create(), PartPose.offsetAndRotation(1.0F, -0.25F, -0.5F, 0.0F, 0.0F, -1.0472F));

		PartDefinition cube_r4 = feeler_l.addOrReplaceChild("cube_r4", CubeListBuilder.create().texOffs(12, 25).addBox(0.0F, -2.0F, -1.0F, 1.0F, 1.0F, 2.0F, new CubeDeformation(0.0F)), PartPose.offsetAndRotation(2.5F, 1.5F, -4.0F, 0.0F, -1.1781F, 0.0F));

		PartDefinition cube_r5 = feeler_l.addOrReplaceChild("cube_r5", CubeListBuilder.create().texOffs(6, 25).addBox(0.0F, -2.0F, -1.0F, 1.0F, 1.0F, 2.0F, new CubeDeformation(0.0F)), PartPose.offsetAndRotation(0.75F, 1.5F, -3.0F, 0.0F, -0.8727F, 0.0F));

		PartDefinition cube_r6 = feeler_l.addOrReplaceChild("cube_r6", CubeListBuilder.create().texOffs(0, 25).addBox(0.0F, -2.0F, -1.0F, 1.0F, 1.0F, 2.0F, new CubeDeformation(0.0F)), PartPose.offsetAndRotation(-0.5F, 1.5F, -1.5F, 0.0F, -0.4363F, 0.0F));

		PartDefinition wing_l = body.addOrReplaceChild("wing_l", CubeListBuilder.create(), PartPose.offset(1.0F, -0.75F, 1.0F));

		PartDefinition bwing_l = wing_l.addOrReplaceChild("bwing_l", CubeListBuilder.create().texOffs(18, 8).addBox(2.0F, -0.25F, -4.0F, 3.0F, 0.0F, 2.0F, new CubeDeformation(0.0F))
		.texOffs(18, 14).addBox(5.0F, -0.25F, -2.0F, 2.0F, 0.0F, 2.0F, new CubeDeformation(0.0F))
		.texOffs(0, 13).addBox(0.0F, -0.25F, -2.0F, 5.0F, 0.0F, 4.0F, new CubeDeformation(0.0F)), PartPose.offset(0.0F, 0.25F, 0.0F));

		PartDefinition swing_l = wing_l.addOrReplaceChild("swing_l", CubeListBuilder.create().texOffs(18, 0).addBox(2.0F, 0.0F, -2.0F, 3.0F, 0.0F, 4.0F, new CubeDeformation(0.0F))
		.texOffs(22, 16).addBox(3.0F, 0.0F, 2.0F, 1.0F, 0.0F, 1.0F, new CubeDeformation(0.0F)), PartPose.offset(-2.0F, 0.0F, 4.0F));

		PartDefinition wing_r = body.addOrReplaceChild("wing_r", CubeListBuilder.create(), PartPose.offset(-1.0F, -0.75F, 1.0F));

		PartDefinition bwing_r = wing_r.addOrReplaceChild("bwing_r", CubeListBuilder.create().texOffs(0, 9).addBox(-5.0F, 0.0F, -2.0F, 5.0F, 0.0F, 4.0F, new CubeDeformation(0.0F))
		.texOffs(18, 12).addBox(-7.0F, 0.0F, -2.0F, 2.0F, 0.0F, 2.0F, new CubeDeformation(0.0F))
		.texOffs(18, 10).addBox(-5.0F, 0.0F, -4.0F, 3.0F, 0.0F, 2.0F, new CubeDeformation(0.0F)), PartPose.offset(0.0F, 0.0F, 0.0F));

		PartDefinition swing_r = wing_r.addOrReplaceChild("swing_r", CubeListBuilder.create().texOffs(18, 4).addBox(-5.0F, 0.0F, -2.0F, 3.0F, 0.0F, 4.0F, new CubeDeformation(0.0F))
		.texOffs(18, 16).addBox(-4.0F, 0.0F, 2.0F, 1.0F, 0.0F, 1.0F, new CubeDeformation(0.0F)), PartPose.offset(2.0F, 0.0F, 4.0F));

		return LayerDefinition.create(meshdefinition, 32, 32);
	}

	@Override
	public void renderToBuffer(PoseStack poseStack, VertexConsumer vertexConsumer, int i, int i1, float f1, float f2, float f3, float f4) {
		root.render(poseStack,vertexConsumer,i,i1);
	}
	@Override
	public ModelPart root() {
		return root;
	}
	@Override
	public void setupAnim(SoulButterflyEntity entity, float v, float v1, float v2, float v3, float v4) {
		this.root.getAllParts().forEach(ModelPart::resetPose);
		AnimationDefinition animation = entity.isFlying()?
				SoulButterflyAnimator.FLY:SoulButterflyAnimator.IDLE;
		this.animate(entity.getAnimationState(),animation,v2,1f);

	}

}
