package com.iridescentcraft.modspells.client;

import com.hollingsworth.arsnouveau.api.spell.SpellTier;
import com.hollingsworth.arsnouveau.client.renderer.item.SpellBookRenderer;
import com.hollingsworth.arsnouveau.common.items.SpellBook;
import com.iridescentcraft.modspells.item.ModularArsSpellBookItem;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.api.distmarker.OnlyIn;
import software.bernie.geckolib.cache.object.BakedGeoModel;

/**
 * Per-stack tier override for the Ars 3D book renderer. Stock
 * {@link SpellBookRenderer} reads {@code spellBook.tier} (a public field
 * on the Item) to drive its tier1/tier2/tier3 bone visibility, but our
 * single Item registration is hardcoded to {@link SpellTier#THREE} so it
 * accepts any spell level. That means without this override every
 * modular Ars book renders as the archmage tome.
 *
 * <p>Approach: read the variant key suffix off the {@code ars_book/core}
 * Tetra slot (set at conversion time by the replacement JSON), map to
 * the matching SpellTier, mutate the Item's public {@code tier} field
 * for the duration of the super call, then restore. The render thread
 * is single-threaded so the field mutation is safe; the original tier is
 * restored in a finally block.
 */
@OnlyIn(Dist.CLIENT)
public class IcraftArsSpellBookRenderer extends SpellBookRenderer {

    @Override
    public void actuallyRender(PoseStack poseStack, SpellBook book, BakedGeoModel model,
                               RenderType renderType, MultiBufferSource bufferSource,
                               VertexConsumer buffer, boolean isReRender, float partialTick,
                               int packedLight, int packedOverlay,
                               float red, float green, float blue, float alpha) {
        SpellTier original = book.tier;
        SpellTier resolved = ModularArsSpellBookItem.resolveTierFromStack(this.currentItemStack);
        if (resolved != null && resolved != original) {
            book.tier = resolved;
        }
        try {
            super.actuallyRender(poseStack, book, model, renderType, bufferSource, buffer,
                    isReRender, partialTick, packedLight, packedOverlay, red, green, blue, alpha);
        } finally {
            book.tier = original;
        }
    }
}
