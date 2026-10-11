package com.seniors.justlevelingfork.integration;

import com.seniors.justlevelingfork.JustLevelingFork;
import com.seniors.justlevelingfork.registry.aptitude.Aptitude;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.fml.ModList;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;

public class KubeJSIntegration {

    // Iridescent fork: the reflective bridge is resolved ONCE (class init, forced from client setup via init()).
    // It targets this mod's OWN kubejs plugin classes (com.seniors.justlevelingfork.kubejs.events.LevelUpEvent /
    // CustomEvents), and that subpackage is stripped from this fork -- KubeJS's side of the API
    // (dev.latvian.mods.kubejs.event.EventJS, EventHandler#post) is intact in kubejs 2001.6.5. The old code re-ran
    // Class.forName on every level-up click, throwing (and swallowing) a ClassNotFoundException each time.
    // null = no bridge in this build -> postLevelUpEvent is a constant "not cancelled".
    private static final Bridge BRIDGE = Bridge.resolve();

    public static boolean isModLoaded() {
        return ModList.get().isLoaded("kubejs");
    }

    /** Forces the one-time detection above at startup (touching the class runs its static initialiser). */
    public static void init() {
    }

    public boolean postLevelUpEvent(Player player, Aptitude aptitude) {
        Bridge bridge = BRIDGE;
        if (bridge == null) {
            return false;
        }

        try {
            Object eventInstance = bridge.eventConstructor.newInstance(player, aptitude);
            bridge.postMethod.invoke(bridge.aptitudeLevelUpHandler, eventInstance);

            return (boolean) bridge.getCancelledMethod.invoke(eventInstance);
        } catch (Exception e) {
            return false;
        }
    }

    private record Bridge(Constructor<?> eventConstructor, Object aptitudeLevelUpHandler, Method postMethod, Method getCancelledMethod) {

        private static Bridge resolve() {
            try {
                if (!isModLoaded()) {
                    return null;
                }

                // Required in case KubeJS is not present
                // In a future I should move this into a different mod
                Class<?> eventClass = Class.forName("com.seniors.justlevelingfork.kubejs.events.LevelUpEvent");
                Class<?> customEventsClass = Class.forName("com.seniors.justlevelingfork.kubejs.events.CustomEvents");
                Object aptitudeLevelUpField = customEventsClass.getField("APTITUDE_LEVELUP").get(null);
                Method postMethod = aptitudeLevelUpField.getClass().getMethod("post", Class.forName("dev.latvian.mods.kubejs.event.EventJS"));

                return new Bridge(eventClass.getConstructor(Player.class, Aptitude.class), aptitudeLevelUpField, postMethod, eventClass.getMethod("getCancelled"));
            } catch (Exception | LinkageError e) {
                JustLevelingFork.getLOGGER().info("KubeJS level-up event bridge is not part of this build ({}); aptitude level-ups will not post a KubeJS event.", e.toString());
                return null;
            }
        }
    }

}
