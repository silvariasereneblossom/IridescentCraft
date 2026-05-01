package com.iridescentcraft.reforging.replacement;

/**
 * Server-side data record for a specialized-armor replacement enrichment.
 * Loaded from data/<ns>/specialized_replacements/*.json by
 * SpecializedReplacementLoader.
 *
 * Tetra's own data/tetra/replacements/ system handles the item-class swap
 * (e.g., irons_spellbooks:cultist_helmet -> iridescent_reforging:reforged_
 * helmet) and applies default modules. Our hook fires AFTER, reading
 * tag.SourceItem on the result (we set this in the Tetra replacement's
 * predicate-matching pass) — actually simpler: we look at the ORIGINAL
 * stack passed to the hook (which has the source's NBT) and match it
 * against our predicate map.
 *
 * Schema:
 * {
 *   "source_item": "irons_spellbooks:cultist_helmet",
 *   "skin_id":     "iridescent_reforging:cultist_helmet"
 * }
 *
 * The hook then sets tag.Skin = skin_id on the reforged result and
 * copies Apotheosis affix data + enchantments from the original.
 */
public record SpecializedReplacementDefinition(
        String sourceItem,
        String skinId
) {}
