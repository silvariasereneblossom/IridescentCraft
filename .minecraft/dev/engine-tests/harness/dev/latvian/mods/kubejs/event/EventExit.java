package dev.latvian.mods.kubejs.event;

/**
 * STAND-IN with the real class's own name. In game, event.cancel() / success() / exit() leave the
 * handler by throwing dev.latvian.mods.kubejs.event.EventExit (a checked Java exception; javap of
 * kubejs-forge 2001.6.5: `public class EventExit extends Exception { public final EventResult result; }`).
 * The real class cannot be loaded here (its EventResult needs Minecraft), and the KubeJS jar is not on
 * the harness class path, so this one takes its place: a script that catches the exit, or a guard that
 * must let it through, sees the same class name and the same Rhino wrapper as on the engine.
 */
public class EventExit extends Exception {
  public final Object result;
  public EventExit(Object result) {
    super("result", null, false, false);     // the real constructor: Exception("result", null, false, false)
    this.result = result;
  }
}
