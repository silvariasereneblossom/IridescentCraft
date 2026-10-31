package com.iridescentcraft.durabilityclamp.lootr;

import com.mojang.logging.LogUtils;
import org.slf4j.Logger;

/**
 * The proof line of {@code TileTickerInPlaceMixin}: printed once per run, by
 * the first Lootr tick that actually walked its set in place, so the line
 * means the redirected code ran, not only that the mixin was configured.
 */
public final class LootrTickInPlace {

    private static final Logger LOGGER = LogUtils.getLogger();

    private static volatile boolean announced;

    private LootrTickInPlace() {
    }

    public static void announce(int pending) {
        if (announced) {
            return;
        }
        announced = true;
        LOGGER.info("{} active: Lootr {} walks its pending-chest set in place and reads its two loop config values once"
            + " per tick ({} pending at the first tick)", LootrTickMixinPlugin.TAG, LootrTickMixinPlugin.PROVEN_VERSION,
            pending);
    }
}
