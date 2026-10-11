package net.royling.lovelysparklepieces.mixinsupport;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.spongepowered.asm.mixin.extensibility.IMixinConfigPlugin;
import org.spongepowered.asm.mixin.extensibility.IMixinInfo;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * IRIDESCENT: apply report for lovely_sparkle_pieces.mixins.json.
 *
 * Every injector in this mod is {@code require = 0} (and the config is {@code "required": false}) so that a
 * target another mod has rewritten can never crash the game - but that also makes a failed injection silent,
 * which is exactly how these mixins stayed dead for the whole life of the fork. This plugin closes the gap:
 * after a mixin is applied it checks that each expected handler is really called from the target class and
 * writes one line to the log - INFO when everything is wired, WARN naming the hooks that are not.
 *
 * Loaded by Mixin during launch: must not touch any Minecraft class (ASM + log4j only), and must live
 * outside the mixin package.
 */
public class LspMixinPlugin implements IMixinConfigPlugin {
    private static final Logger LOGGER = LogManager.getLogger("LSP-Mixin");

    /** mixin simple class name -> handler methods that must end up invoked from the target class */
    private static final Map<String, String[]> EXPECTED = Map.of(
            "EnchantmentMenuMixin", new String[]{"lspEyeArm", "lspEyeBoostLevel", "lspEyeAfterRoll", "lspEyeCharge"},
            "ApothEnchantmentMenuMixin", new String[]{"lspApothEyeArm", "lspApothEyeBoostLevel", "lspApothEyeAfterRoll", "lspApothEyeCharge"},
            "FishingHookMixin", new String[]{"lspFishingLine"}
    );

    @Override
    public void onLoad(String mixinPackage) {
    }

    @Override
    public String getRefMapperConfig() {
        return null;
    }

    @Override
    public boolean shouldApplyMixin(String targetClassName, String mixinClassName) {
        return true;
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
        try {
            String simpleName = mixinClassName.substring(mixinClassName.lastIndexOf('.') + 1);
            String[] expected = EXPECTED.get(simpleName);
            if (expected == null) {
                return;
            }
            // Mixin merges a handler as <prefix>$<uid>$<originalName>; a hook is live only if some method of
            // the target actually invokes it.
            Set<String> invoked = new HashSet<>();
            for (MethodNode method : targetClass.methods) {
                for (AbstractInsnNode insn : method.instructions) {
                    if (insn instanceof MethodInsnNode call) {
                        invoked.add(call.name);
                    }
                }
            }
            List<String> missing = new ArrayList<>();
            for (String handler : expected) {
                String suffix = "$" + handler;
                boolean found = false;
                for (String name : invoked) {
                    if (name.equals(handler) || name.endsWith(suffix)) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    missing.add(handler);
                }
            }
            if (missing.isEmpty()) {
                LOGGER.info("{} applied to {} ({}/{} hooks)", simpleName, targetClassName, expected.length, expected.length);
            } else {
                LOGGER.warn("{} on {}: {} of {} hooks were NOT applied ({}) - the item effect behind them is inactive",
                        simpleName, targetClassName, missing.size(), expected.length, String.join(", ", missing));
            }
        } catch (Throwable t) {
            LOGGER.warn("Could not verify {} on {}: {}", mixinClassName, targetClassName, t.toString());
        }
    }
}
