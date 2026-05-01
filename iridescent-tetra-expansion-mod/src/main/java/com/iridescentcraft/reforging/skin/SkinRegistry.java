package com.iridescentcraft.reforging.skin;

import com.iridescentcraft.reforging.IridescentReforging;
import software.bernie.geckolib.renderer.GeoArmorRenderer;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Singleton registry of armor skins.
 *
 * Two parallel maps:
 *   - definitions: skinId -> SkinDefinition (server-side, populated by
 *     SkinDataLoader at data-pack reload time)
 *   - factories:   skinId -> SkinRendererFactory (client-side, populated
 *     at FMLClientSetupEvent by per-source-mod factory classes like
 *     IssRendererFactories)
 *
 * Definitions are server-authoritative for behavior (attributes, name,
 * slot, tier). Factories are client-only for visual rendering. A skin
 * can have one without the other and the system degrades gracefully
 * (missing factory -> falls back to vanilla armor render; missing
 * definition -> behaves as default-skin armor).
 *
 * The renderer cache is lazily populated on first lookup: GeoArmorRenderer
 * holds animation state, so we want one instance per skin shared across
 * all wearers. Factory is invoked exactly once per skin per session.
 */
public final class SkinRegistry {
    private static final SkinRegistry INSTANCE = new SkinRegistry();

    private final Map<String, SkinDefinition> definitions = new ConcurrentHashMap<>();
    private final Map<String, SkinRendererFactory> factories = new ConcurrentHashMap<>();
    private final Map<String, GeoArmorRenderer<?>> rendererCache = new ConcurrentHashMap<>();

    private SkinRegistry() {}

    public static SkinRegistry get() {
        return INSTANCE;
    }

    // ── Server-side: skin definitions ─────────────────────────────────

    /** Replace the entire definition map. Called at data-pack reload. */
    public void replaceDefinitions(Map<String, SkinDefinition> incoming) {
        definitions.clear();
        definitions.putAll(incoming);
        IridescentReforging.LOGGER.info("[SkinRegistry] loaded {} skin definitions", definitions.size());
    }

    public Optional<SkinDefinition> getDefinition(String skinId) {
        return Optional.ofNullable(definitions.get(skinId));
    }

    public Map<String, SkinDefinition> allDefinitions() {
        return Map.copyOf(definitions);
    }

    // ── Client-side: renderer factories ───────────────────────────────

    /** Register a factory for a skin. Idempotent — last write wins. */
    public void registerFactory(String skinId, SkinRendererFactory factory) {
        factories.put(skinId, factory);
    }

    /**
     * Resolve the cached renderer for a skin. Lazily constructs on first
     * call via the registered factory; returns empty if no factory is
     * registered for this skinId (caller falls back to vanilla rendering).
     */
    public Optional<GeoArmorRenderer<?>> getRenderer(String skinId) {
        if (skinId == null || skinId.isEmpty()) {
            return Optional.empty();
        }
        // computeIfAbsent doesn't tolerate null returns from the lambda, so
        // gate on factory presence first.
        if (!factories.containsKey(skinId)) {
            return Optional.empty();
        }
        return Optional.of(rendererCache.computeIfAbsent(skinId,
                id -> factories.get(id).createRenderer()));
    }
}
