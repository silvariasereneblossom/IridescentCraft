package com.iridescentcraft.durabilityclamp.lootr;

import com.mojang.logging.LogUtils;
import java.util.List;
import java.util.Set;
import net.minecraftforge.fml.loading.LoadingModList;
import net.minecraftforge.fml.loading.moddiscovery.ModFileInfo;
import org.objectweb.asm.tree.ClassNode;
import org.slf4j.Logger;
import org.spongepowered.asm.mixin.extensibility.IMixinConfigPlugin;
import org.spongepowered.asm.mixin.extensibility.IMixinInfo;

/**
 * Applies {@code TileTickerInPlaceMixin} only to the Lootr build it was
 * proven against.
 *
 * <p>The mixin rewires five instructions of Lootr's
 * {@code TileTicker.serverTick} by ordinal (see the mixin for the list). Its
 * equivalence with Lootr's own loop was read from the decompiled class and
 * measured on the boot rig for {@value #PROVEN_VERSION} only. Any other
 * Lootr version, or no Lootr at all, leaves the class untouched and prints
 * one {@code [lootr-tick] ABSENT} line, so a Lootr update through
 * {@code intake.py} shows it in the boot diff instead of failing the boot.
 *
 * <p>{@code -Diridescent.lootrTick=false} turns it off.
 */
public final class LootrTickMixinPlugin implements IMixinConfigPlugin {

    private static final Logger LOGGER = LogUtils.getLogger();

    static final String TAG = "[lootr-tick]";
    static final String PROP_ENABLED = "iridescent.lootrTick";
    static final String PROVEN_VERSION = "0.7.35.94";

    private boolean apply;

    @Override
    public void onLoad(String mixinPackage) {
        this.apply = decide();
    }

    private static boolean decide() {
        if (!Boolean.parseBoolean(System.getProperty(PROP_ENABLED, "true"))) {
            LOGGER.info("{} ABSENT: turned off by -D{}=false; Lootr's ticker runs unchanged", TAG, PROP_ENABLED);
            return false;
        }
        LoadingModList mods = LoadingModList.get();
        ModFileInfo lootr = mods == null ? null : mods.getModFileById("lootr");
        if (lootr == null || lootr.getMods().isEmpty()) {
            LOGGER.info("{} ABSENT: Lootr is not installed", TAG);
            return false;
        }
        String version = lootr.getMods().get(0).getVersion().toString();
        if (!PROVEN_VERSION.equals(version)) {
            LOGGER.warn("{} ABSENT: Lootr {} is not the build this was proven on ({}); Lootr's ticker runs unchanged",
                TAG, version, PROVEN_VERSION);
            return false;
        }
        return true;
    }

    @Override
    public String getRefMapperConfig() {
        return null;
    }

    @Override
    public boolean shouldApplyMixin(String targetClassName, String mixinClassName) {
        return this.apply;
    }

    @Override
    public void acceptTargets(Set<String> myTargets, Set<String> otherTargets) {
    }

    @Override
    public List<String> getMixins() {
        return null;
    }

    @Override
    public void preApply(String targetClassName, ClassNode targetClass, String mixinClassName, IMixinInfo mixinInfo) {
    }

    @Override
    public void postApply(String targetClassName, ClassNode targetClass, String mixinClassName, IMixinInfo mixinInfo) {
    }
}
