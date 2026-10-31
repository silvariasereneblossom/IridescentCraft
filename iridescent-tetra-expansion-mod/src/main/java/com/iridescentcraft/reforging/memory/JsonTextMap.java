package com.iridescentcraft.reforging.memory;

import java.util.AbstractMap;
import java.util.AbstractSet;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;

import com.google.gson.JsonElement;
import com.google.gson.JsonParser;

import net.minecraft.resources.ResourceLocation;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * Tetra's client-sync JSON kept as text (RAM audit 2026-10-30, lever 9b, scope
 * option T1), for {@code DataStoreSyncTextMixin}: about 28 MB on a dedicated or
 * integrated server.
 *
 * <p>mutil's {@code DataStore} keeps the parsed JSON tree of every Tetra data
 * file only to send it to players: at each login, and to everyone after a
 * {@code /reload} of a dedicated server. The packet carries each tree as
 * {@code JsonElement.toString()}. This map holds exactly that text and hands
 * out a freshly parsed tree whenever one is asked for, so the packet is built by
 * Tetra's own code, from the same text, as before.
 *
 * <p>{@link #compact} only swaps the trees out when every entry passes a round
 * trip, text to tree to the same text. One that does not (none known) keeps the
 * whole store as trees and logs a warning, so a joining player never gets other
 * text than before.
 */
public final class JsonTextMap extends AbstractMap<ResourceLocation, JsonElement> {

    private static final Logger LOG = LogManager.getLogger("tetra_memory");

    private final Map<ResourceLocation, String> texts;

    private JsonTextMap(Map<ResourceLocation, String> texts) {
        this.texts = texts;
    }

    public static Map<ResourceLocation, JsonElement> compact(String directory, Map<ResourceLocation, JsonElement> trees) {
        if (trees == null || trees.isEmpty() || trees instanceof JsonTextMap) {
            return trees;
        }
        Map<ResourceLocation, String> texts = new HashMap<>(trees.size() * 4 / 3 + 1);
        long chars = 0;
        try {
            for (Map.Entry<ResourceLocation, JsonElement> entry : trees.entrySet()) {
                String text = entry.getValue().toString();
                if (!JsonParser.parseString(text).toString().equals(text)) {
                    LOG.warn("Tetra sync data '{}': '{}' does not survive a text round trip; the store keeps its JSON trees",
                            directory, entry.getKey());
                    return trees;
                }
                texts.put(entry.getKey(), text);
                chars += text.length();
            }
        } catch (RuntimeException e) {
            LOG.warn("Tetra sync data '{}': could not keep it as text; the store keeps its JSON trees", directory, e);
            return trees;
        }
        LOG.info("Tetra sync data '{}': {} entries kept as text ({} KB)", directory, texts.size(), chars / 1024);
        return new JsonTextMap(texts);
    }

    @Override
    public int size() {
        return texts.size();
    }

    @Override
    public boolean containsKey(Object key) {
        return texts.containsKey(key);
    }

    @Override
    public JsonElement get(Object key) {
        String text = texts.get(key);
        return text == null ? null : JsonParser.parseString(text);
    }

    @Override
    public Set<Map.Entry<ResourceLocation, JsonElement>> entrySet() {
        return new AbstractSet<>() {
            @Override
            public int size() {
                return texts.size();
            }

            @Override
            public Iterator<Map.Entry<ResourceLocation, JsonElement>> iterator() {
                Iterator<Map.Entry<ResourceLocation, String>> it = texts.entrySet().iterator();
                return new Iterator<>() {
                    @Override
                    public boolean hasNext() {
                        return it.hasNext();
                    }

                    @Override
                    public Map.Entry<ResourceLocation, JsonElement> next() {
                        Map.Entry<ResourceLocation, String> entry = it.next();
                        return new SimpleImmutableEntry<>(entry.getKey(), JsonParser.parseString(entry.getValue()));
                    }
                };
            }
        };
    }
}
