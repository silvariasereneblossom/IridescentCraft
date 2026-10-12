package mk;

import dev.latvian.mods.rhino.util.HideFromJS;
import dev.latvian.mods.rhino.util.RemapForJS;
import dev.latvian.mods.rhino.util.RemapPrefixForJS;

/**
 * Additions for the Ascension / onboarding-bridge harness. Same rule as mk.W: only members that
 * exist on the real class, under the name scripts see (each javap'd against kubejs-forge-2001.6.5
 * and the 1.20.1 srg jar on 2026-10-11):
 *   MinecraftServerKJS.kjs$getLevel(ResourceLocation), WithPersistentData.kjs$getPersistentData on a level,
 *   PlayerKJS.kjs$getXpLevel / kjs$addXPLevels(int), Entity.hasPermissions(int).
 */
public class A {
  static {
    try {
      java.lang.reflect.Constructor<W.Attr> c = W.Attr.class.getDeclaredConstructor(String.class, double.class);
      c.setAccessible(true);
      W.Attr.ALL.put("minecraft:generic.movement_speed", c.newInstance("minecraft:generic.movement_speed", 0.1));
    } catch (Exception e) { throw new RuntimeException(e); }
  }

  @RemapPrefixForJS("kjs$")
  public static class Server extends W.Server {
    public W.Level kjs$getLevel(W.RL id) {
      for (W.Level l : levels) if (l.dim.equals(id.toString())) return l;
      return null;
    }
  }

  @RemapPrefixForJS("kjs$")
  public static class Level extends W.Level {
    final W.Tag data = new W.Tag();
    public Level(W.Server s, String dim) { super(s, dim); }
    @RemapForJS("getPersistentData") public W.Tag kjs$getPersistentData() { return data; }
  }

  @RemapPrefixForJS("kjs$")
  public static class Player extends W.Player {
    int xpLevel = 0;
    int perm = 0;
    public Player(String name, W.Level l, double x, double y, double z) {
      super(name, l, x, y, z);
      attrs.add("minecraft:generic.movement_speed");
    }
    public int kjs$getXpLevel() { return xpLevel; }
    public void kjs$addXPLevels(int n) { xpLevel = Math.max(0, xpLevel + n); }
    public boolean hasPermissions(int level) { return perm >= level; }
    public Player t_xp(int levels) { xpLevel = levels; return this; }
    public Player t_op(boolean op) { perm = op ? 4 : 0; return this; }
  }

  /** com.seniors.justlevelingfork.common.capability.AptitudeCapability: static get(Player), public Map aptitudeLevel */
  public static class AptitudeCapability {
    static final java.util.Map<java.util.UUID, AptitudeCapability> CAPS = new java.util.HashMap<>();
    public java.util.Map<String, Integer> aptitudeLevel = new java.util.HashMap<>();
    AptitudeCapability() { for (String n : new String[]{"strength", "constitution", "dexterity", "defense", "intelligence", "building", "magic", "luck"}) aptitudeLevel.put(n, 1); }
    public static AptitudeCapability get(W.Player p) { return CAPS.get(p.uuid); }
    public int getAptitudeLevel(String n) { Integer v = aptitudeLevel.get(n); return v == null ? 1 : v; }
  }
  public static void cap(W.Player p) { AptitudeCapability.CAPS.put(p.uuid, new AptitudeCapability()); }
  public static void apt(W.Player p, String name, int level) { AptitudeCapability.CAPS.get(p.uuid).aptitudeLevel.put(name, level); }

  /** test-side reads (never visible to the scripts under test) */
  public static String told(W.Entity e) { return String.join(" | ", e.told); }
  public static int toldCount(W.Entity e) { return e.told.size(); }
  public static void clearTold(W.Entity e) { e.told.clear(); }
  public static String commands(W.Server s) { return String.join(" | ", s.commands); }
  public static void clearCommands(W.Server s) { s.commands.clear(); }
  public static int count(W.Stack s) { return s.count; }
  public static float health(W.Living e) { return e.health; }
  public static void setHealthRaw(W.Living e, float h) { e.health = h; }
  public static int op(W.Living e, String attr, String key) {
    java.util.Map<String, double[]> m = e.mods.get(attr);
    double[] v = m == null ? null : m.get(key);
    return v == null ? -1 : (int) v[1];
  }
  public static W.Stack beacon() {
    W.Stack s = new W.Stack("minecraft:nether_star", 1);
    s.getOrCreateTag().putBoolean("icraft_ascension_beacon", true);
    return s;
  }
  public static void unlist(W.Server s, W.Player p) { s.players.remove(p); }
  public static void monster(W.Entity e, boolean m) { e.monster = m; }
}
