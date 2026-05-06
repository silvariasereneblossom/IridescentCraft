package com.iridescentcraft.reforging.skin;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.iridescentcraft.reforging.IridescentReforging;
import net.minecraft.resources.ResourceLocation;
import net.minecraftforge.fml.ModList;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Stream;

/**
 * Eagerly loads bundled skin JSONs from the mod jar's classpath at
 * FMLCommonSetupEvent time, populating SkinRegistry on BOTH client and
 * server. Companion to {@link com.iridescentcraft.reforging.replacement.BundledDataLoader}.
 *
 * Why this exists: {@link SkinDataLoader} registers against
 * {@code AddReloadListenerEvent} which only fires on the server's resource
 * manager. The client (in multiplayer) never runs that listener and SkinRegistry
 * stays empty. ItemModularArmor.getName() and the renderer dispatch both read
 * SkinRegistry, so without this eager-load they fall through to defaults.
 */
public final class BundledSkinLoader {

    private static final Gson GSON = new GsonBuilder().create();

    private BundledSkinLoader() {}

    public static void loadAll() {
        Map<String, SkinDefinition> built = new HashMap<>();

        var optModFile = ModList.get().getModFileById(IridescentReforging.MODID);
        if (optModFile == null) {
            IridescentReforging.LOGGER.warn(
                    "[BundledSkinLoader] cannot find mod file for {}", IridescentReforging.MODID);
            return;
        }
        var modFile = optModFile.getFile();
        Path baseDir = modFile.findResource("data/iridescent_reforging/iridescent_reforging_skins");
        if (baseDir == null || !Files.isDirectory(baseDir)) {
            IridescentReforging.LOGGER.warn(
                    "[BundledSkinLoader] iridescent_reforging_skins directory not found in mod jar (path: {})",
                    baseDir);
            SkinRegistry.get().replaceDefinitions(built);
            return;
        }

        try (Stream<Path> paths = Files.list(baseDir)) {
            paths.filter(p -> p.toString().endsWith(".json")).forEach(path -> {
                try (Reader reader = new InputStreamReader(
                        Files.newInputStream(path), StandardCharsets.UTF_8)) {
                    JsonObject obj = GSON.fromJson(reader, JsonObject.class);
                    String filename = path.getFileName().toString();
                    ResourceLocation key = new ResourceLocation(
                            IridescentReforging.MODID,
                            filename.substring(0, filename.length() - ".json".length()));
                    SkinDefinition def = SkinDataLoader.parseSkin(key, obj);
                    if (def != null) {
                        built.put(def.skinId(), def);
                    }
                } catch (IOException | RuntimeException e) {
                    IridescentReforging.LOGGER.warn(
                            "[BundledSkinLoader] failed to parse {}: {}", path, e.toString());
                }
            });
        } catch (IOException e) {
            IridescentReforging.LOGGER.warn(
                    "[BundledSkinLoader] failed to list iridescent_reforging_skins: {}", e.toString());
        }

        SkinRegistry.get().replaceDefinitions(built);
        IridescentReforging.LOGGER.info(
                "[BundledSkinLoader] eagerly loaded {} skin definitions from mod jar",
                built.size());
    }
}
