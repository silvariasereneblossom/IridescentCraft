package com.iridescentcraft.reforging.setbonus;

import com.iridescentcraft.reforging.IridescentReforging;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Singleton registry of set bonus definitions.
 *
 * Mirrors SkinRegistry's pattern. Server-authoritative — populated by
 * SetBonusDataLoader at data-pack reload time. SetBonusManager looks up
 * bonuses by setId when scanning equipped armor for matches.
 */
public final class SetBonusRegistry {
    private static final SetBonusRegistry INSTANCE = new SetBonusRegistry();

    private final Map<String, SetBonusDefinition> definitions = new ConcurrentHashMap<>();

    private SetBonusRegistry() {}

    public static SetBonusRegistry get() {
        return INSTANCE;
    }

    public void replaceDefinitions(Map<String, SetBonusDefinition> incoming) {
        definitions.clear();
        definitions.putAll(incoming);
        IridescentReforging.LOGGER.info(
                "[SetBonusRegistry] loaded {} set bonus definitions", definitions.size());
    }

    public Optional<SetBonusDefinition> getDefinition(String setId) {
        return Optional.ofNullable(definitions.get(setId));
    }
}
