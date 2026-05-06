package com.iridescentcraft.reforging.replacement;

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
 * Eagerly loads bundled specialized_replacement + skin JSONs from the mod
 * jar's classpath at FMLCommonSetupEvent time, populating the runtime
 * registries on BOTH client and server.
 *
 * Why this exists: {@link SpecializedReplacementLoader} (and SkinDataLoader)
 * register against {@code AddReloadListenerEvent}, which only fires on the
 * server's resource-manager reload. In multiplayer with a remote dedicated
 * server, the client never runs that event -- its registries stay empty.
 * Tetra's client-side {@code getReplacement} then runs with no enrichment
 * data and overwrites the server's synced skin-tagged stack.
 *
 * This loader runs at common setup (both sides), reads the mod-jar's
 * bundled data files directly via the ModFile API. The data-pack reload
 * listener stays in place so server-side datapack overrides still work
 * (e.g. third-party packs adding more specialized_replacements).
 */
public final class BundledDataLoader {

    private static final Gson GSON = new GsonBuilder().create();

    private BundledDataLoader() {}

    public static void loadAll() {
        loadSpecializedReplacements();
        // SkinDataLoader is server-side too; load skins eagerly the same way.
        // Done in a separate method that lives in the skin package.
        com.iridescentcraft.reforging.skin.BundledSkinLoader.loadAll();
    }

    private static void loadSpecializedReplacements() {
        Map<ResourceLocation, SpecializedReplacementDefinition> built = new HashMap<>();

        var optModFile = ModList.get().getModFileById(IridescentReforging.MODID);
        if (optModFile == null) {
            IridescentReforging.LOGGER.warn(
                    "[BundledDataLoader] cannot find mod file for {}", IridescentReforging.MODID);
            return;
        }
        var modFile = optModFile.getFile();
        Path baseDir = modFile.findResource("data/iridescent_reforging/specialized_replacements");
        if (baseDir == null || !Files.isDirectory(baseDir)) {
            IridescentReforging.LOGGER.warn(
                    "[BundledDataLoader] specialized_replacements directory not found in mod jar (path: {})",
                    baseDir);
            SpecializedReplacementRegistry.get().replaceDefinitions(built);
            return;
        }

        try (Stream<Path> paths = Files.list(baseDir)) {
            paths.filter(p -> p.toString().endsWith(".json")).forEach(path -> {
                try (Reader reader = new InputStreamReader(
                        Files.newInputStream(path), StandardCharsets.UTF_8)) {
                    JsonObject obj = GSON.fromJson(reader, JsonObject.class);
                    String sourceItem = obj.get("source_item").getAsString();
                    String skinId     = obj.get("skin_id").getAsString();
                    SpecializedReplacementDefinition def =
                            new SpecializedReplacementDefinition(sourceItem, skinId);
                    built.put(new ResourceLocation(sourceItem), def);
                } catch (IOException | RuntimeException e) {
                    IridescentReforging.LOGGER.warn(
                            "[BundledDataLoader] failed to parse {}: {}", path, e.toString());
                }
            });
        } catch (IOException e) {
            IridescentReforging.LOGGER.warn(
                    "[BundledDataLoader] failed to list specialized_replacements: {}", e.toString());
        }

        SpecializedReplacementRegistry.get().replaceDefinitions(built);
        IridescentReforging.LOGGER.info(
                "[BundledDataLoader] eagerly loaded {} specialized_replacements from mod jar",
                built.size());
    }
}
