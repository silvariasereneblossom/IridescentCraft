package com.iridescentcraft.reforging.memory;

import com.google.common.collect.Multimap;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * Bookkeeping for {@code ZetaRecipeCrawlMixin} (RAM audit 2026-10-30, lever 9a).
 *
 * <p>Zeta's recipe crawl keeps two static multimaps for the whole session:
 * ingredient -> outputs ("forward", about 10.7 MB on the server) and output ->
 * ingredient stacks ("backward", about 48.6 MB). The only reader in the pack is
 * Quark's Magnets, which walks the forward map once, inside the {@code Digest}
 * event, and copies what it finds into its own sets. Nothing reads the backward
 * map. So the backward map is never filled, and the forward one is emptied right
 * after the event. Both are rebuilt the same way on the next {@code /reload}.
 */
public final class ZetaCrawlTrim {

    private static final Logger LOG = LogManager.getLogger("zeta_memory");

    private static int skippedBackward;

    private ZetaCrawlTrim() {}

    public static void skippedBackwardPut() {
        skippedBackward++;
    }

    /** Called right after the {@code Digest} event: Quark has read the forward map by now. */
    public static void afterDigest(Multimap<?, ?> forward, Multimap<?, ?> backward) {
        int keys = forward.keySet().size();
        int entries = forward.size();
        int leftover = backward.size();
        forward.clear();
        backward.clear();
        LOG.info("Zeta recipe crawl: forward digest dropped after the Digest event ({} items, {} entries); "
                + "backward digest never built ({} entries skipped, {} left over)",
                keys, entries, skippedBackward, leftover);
        skippedBackward = 0;
    }
}
