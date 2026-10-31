package com.iridescentcraft.reforging.memory;

import java.util.HashMap;
import java.util.Map;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import se.mickelus.tetra.module.data.VariantData;

/**
 * One material expansion per module template instead of one per slot copy
 * (RAM audit 2026-10-30, lever 9b, scope option T4), for
 * {@code ModuleRegistryShareMixin}.
 *
 * <p>A module with {@code slotSuffixes} (a double head's left and right, for
 * example) is set up once per slot from a shallow copy of its data: the copies
 * hold the same variant templates, and each was expanded on its own into equal
 * variants (4,186 extra variants on the server). The expansion of a template
 * depends only on the template and the materials loaded, so the second copy now
 * takes the first one's variants. Each copy still gets its own array.
 *
 * <p>Nothing changes a variant after its expansion: Tetra's five module types
 * only keep the array, and the slot copies add their suffix to a copy of each
 * model when it is drawn, never to the variant. No other jar of the pack
 * registers a module type.
 */
public final class SlotCopyVariants {

    private static final Logger LOG = LogManager.getLogger("tetra_memory");

    private final Map<Key, VariantData[]> expanded = new HashMap<>();
    private int modules;
    private int shared;

    public void begin() {
        expanded.clear();
        modules = 0;
        shared = 0;
    }

    /** The expansion of these templates if a slot copy already made it, as an array of its own; else null. */
    public VariantData[] find(VariantData[] templates) {
        modules++;
        VariantData[] done = expanded.get(new Key(templates));
        if (done == null) {
            return null;
        }
        shared++;
        return done.clone();
    }

    public void remember(VariantData[] templates, VariantData[] expansion) {
        expanded.put(new Key(templates), expansion);
    }

    public void end() {
        LOG.info("Tetra modules: {} set up, {} slot copies reuse their template's expanded variants", modules, shared);
        expanded.clear();
    }

    /** The template objects themselves, compared by identity. */
    private static final class Key {
        private final VariantData[] templates;
        private final int hash;

        Key(VariantData[] templates) {
            this.templates = templates.clone();
            int h = 1;
            for (VariantData template : templates) {
                h = 31 * h + System.identityHashCode(template);
            }
            this.hash = h;
        }

        @Override
        public boolean equals(Object other) {
            if (!(other instanceof Key key) || key.templates.length != templates.length) {
                return false;
            }
            for (int i = 0; i < templates.length; i++) {
                if (key.templates[i] != templates[i]) {
                    return false;
                }
            }
            return true;
        }

        @Override
        public int hashCode() {
            return hash;
        }
    }
}
