package net.royling.lovelysparklepieces.ModPainting;

import net.minecraft.core.registries.Registries;
import net.minecraft.world.entity.decoration.PaintingVariant;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.RegistryObject;

import static net.royling.lovelysparklepieces.LovelySparklePieces.MODID;

public class ModPaintings {
    public static final DeferredRegister<PaintingVariant> PAINTINGS =
            DeferredRegister.create(Registries.PAINTING_VARIANT, MODID);

    // Iridescent: 1.20.1 has no data-driven painting variants (that is 1.21+), so
    // data/lovely_sparkle_pieces/painting_variant/lsp_painting1.json is never read here and
    // the minecraft:placeable tag pointed at nothing. Size is in pixels: 64x64 = 4x4 blocks,
    // the texture is textures/painting/lsp_painting1.png.
    public static final RegistryObject<PaintingVariant> LSP_PAINTING1 =
            PAINTINGS.register("lsp_painting1", () -> new PaintingVariant(64, 64));
}
