package mk;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Test-side access to the mocks. The mock classes keep their state in NON-public fields so that the
 * scripts under test can only reach what the real classes expose; test code reads / writes that
 * state through here.
 */
public class T {
  private static Field find(Class<?> c, String name) {
    for (Class<?> k = c; k != null; k = k.getSuperclass()) {
      try { Field f = k.getDeclaredField(name); f.setAccessible(true); return f; } catch (NoSuchFieldException ignored) { }
    }
    throw new IllegalArgumentException("mock: no field " + name + " on " + c.getName());
  }

  public static Object get(Object target, String field) {
    try { return find(target.getClass(), field).get(target); } catch (IllegalAccessException e) { throw new RuntimeException(e); }
  }

  public static double num(Object target, String field) {
    Object v = get(target, field);
    if (v instanceof Boolean) return ((Boolean) v) ? 1 : 0;
    return ((Number) v).doubleValue();
  }

  public static void set(Object target, String field, Object value) {
    try {
      Field f = find(target.getClass(), field);
      Class<?> t = f.getType();
      Object v = value;
      if (value instanceof Number) {
        Number n = (Number) value;
        if (t == int.class || t == Integer.class) v = n.intValue();
        else if (t == long.class || t == Long.class) v = n.longValue();
        else if (t == float.class || t == Float.class) v = n.floatValue();
        else if (t == double.class || t == Double.class) v = n.doubleValue();
        else if (t == boolean.class) v = n.doubleValue() != 0;
      }
      f.set(target, v);
    } catch (IllegalAccessException e) { throw new RuntimeException(e); }
  }

  /** static field of a mock class, e.g. T.sget('mk.W', 'nbtSerializations') */
  public static Object sget(String cls, String field) {
    try { Field f = Class.forName(cls).getDeclaredField(field); f.setAccessible(true); return f.get(null); } catch (Exception e) { throw new RuntimeException(e); }
  }
  public static void sset(String cls, String field, Object value) {
    try {
      Field f = Class.forName(cls).getDeclaredField(field); f.setAccessible(true);
      Object v = value;
      if (value instanceof Number && f.getType() == int.class) v = ((Number) value).intValue();
      f.set(null, v);
    } catch (Exception e) { throw new RuntimeException(e); }
  }

  public static List<String> strings(Object listOrNull) {
    List<String> out = new ArrayList<>();
    if (listOrNull instanceof Iterable) for (Object o : (Iterable<?>) listOrNull) out.add(String.valueOf(o));
    return out;
  }
  public static String join(Object list) { return String.join(" | ", strings(list)); }
  public static int size(Object c) {
    if (c instanceof java.util.Collection) return ((java.util.Collection<?>) c).size();
    if (c instanceof Map) return ((Map<?, ?>) c).size();
    return -1;
  }
  public static boolean hasEffect(W.Living e, String id) { return e.effects.containsKey(id); }
  public static int effectAmp(W.Living e, String id) { int[] v = e.effects.get(id); return v == null ? -1 : v[1]; }
  public static int effectDur(W.Living e, String id) { int[] v = e.effects.get(id); return v == null ? -1 : v[0]; }
  public static void clearEffects(W.Living e) { e.effects.clear(); }
  public static void effect(W.Living e, String id, int dur, int amp) { e.effects.put(id, new int[]{dur, amp}); }
  public static Double mod(W.Living e, String attr, String key) { return e.mod(attr, key); }
  public static void base(W.Living e, String attr, double v) { e.attrBase.put(attr, v); e.attrs.add(attr); }
  public static void modifier(W.Living e, String attr, String key, double amount, int op) {
    e.attrs.add(attr);
    e.mods.computeIfAbsent(attr, k -> new java.util.LinkedHashMap<>()).put(key, new double[]{amount, op});
  }
  /** the modifiers on one attribute of an entity, "name op amount" with op 0 addition / 1 multiply_base / 2 multiply_total,
   *  sorted, joined by "," ("" when none) */
  public static String mods(W.Living e, String attr) {
    java.util.Map<String, double[]> m = e.mods.get(attr);
    if (m == null) return "";
    java.util.List<String> out = new java.util.ArrayList<>();
    for (java.util.Map.Entry<String, double[]> en : m.entrySet()) out.add(en.getKey() + " " + (int) en.getValue()[1] + " " + en.getValue()[0]);
    java.util.Collections.sort(out);
    return String.join(",", out);
  }
  public static void block(W.Level l, int x, int y, int z, String id) { l.blocks.put(x + "," + y + "," + z, id); }
  public static String blockAt(W.Level l, int x, int y, int z) { String s = l.blocks.get(x + "," + y + "," + z); return s == null ? "minecraft:air" : s; }
  public static void drop(W.Level l, String block, String item) { l.dropTable.put(block, item); }
  public static void score(W.Server s, String who, String objective, int v) { s.scoreboard.set(who, objective, v); }
  public static void slot(W.Player p, int i, W.Stack s) { p.inv.slots[i] = s; }
  public static W.Hurt fireHurt(W.Living victim, W.Source source, double amount) {
    W.Hurt ev = new W.Hurt(victim, source, (float) amount);
    W.DamageModifierRegistry.dispatch(ev);
    return ev;
  }
  public static void only(String key) { W.DamageModifierRegistry.only = key; }
  /** after every entry of the damage registry that ran: fn(key, event, amountBefore, cancelledBefore); null takes it off */
  public static void traceHurt(W.DamageModifierRegistry.Trace fn) { W.DamageModifierRegistry.trace = fn; }
  /** the registry as the game starts it: both maps empty (a suite that puts the startup scripts' keys first) */
  public static void clearHurtRegistry() {
    W.DamageModifierRegistry.HANDLERS = new java.util.concurrent.ConcurrentHashMap<>();
    W.DamageModifierRegistry.LATE = new java.util.concurrent.ConcurrentHashMap<>();
    W.DamageModifierRegistry.THROWS.clear();
  }
  public static String normalKeys() { return String.join(",", W.DamageModifierRegistry.HANDLERS.keySet()); }
  public static String lateKeys() { return String.join(",", W.DamageModifierRegistry.LATE.keySet()); }
  public static int handlerThrows(String key) { Integer n = W.DamageModifierRegistry.THROWS.get(key); return n == null ? 0 : n; }
  public static int totalThrows() { int n = 0; for (int v : W.DamageModifierRegistry.THROWS.values()) n += v; return n; }
  public static String handlerKeys() { return String.join(",", W.DamageModifierRegistry.HANDLERS.keySet()) + " | late: " + String.join(",", W.DamageModifierRegistry.LATE.keySet()); }
  public static W.Source source(String typeId, W.Entity causing, W.Entity direct) { return new W.Source(typeId, causing, direct); }
  public static void fireSpell(W.SpellDamagePre e) { W.ForgeEventRegistry.fire(e); }

  @FunctionalInterface public interface AttackFn { boolean accept(W.Living victim, W.Source source, float amount); }
  @FunctionalInterface public interface DeathFn { void accept(W.Living victim, W.Source source); }
  public static void hooks(W.Level l, AttackFn a, DeathFn d) {
    l.hooks = new W.Hooks() {
      @Override public boolean attack(W.Living victim, W.Source source, float amount) { return a.accept(victim, source, amount); }
      @Override public void death(W.Living victim, W.Source source) { d.accept(victim, source); }
    };
  }
  /** what EventJS.cancel() does in game: leave the handler by throwing EventExit */
  public static Object exit() throws dev.latvian.mods.kubejs.event.EventExit { throw new dev.latvian.mods.kubejs.event.EventExit(null); }
  public static void wear(W.Living e, String slot, W.Stack s) { e.setItemSlot(W.Slot.valueOf(slot.toUpperCase()), s); }

  /**
   * The whole mock world as text, for `run.py snapshot`: commands run, server data, and per entity its health,
   * attribute modifiers, effects, gear, saved data and the messages it was sent. Deterministic (no UUIDs).
   */
  public static String state(W.Server s) {
    StringBuilder b = new StringBuilder();
    b.append("server tick=").append(s.tick).append(" data=").append(W.snbt(s.data)).append('\n');
    for (String c : s.commands) b.append("  command ").append(c).append('\n');
    for (W.Level l : s.levels) {
      b.append("level ").append(l.dim).append(" time=").append(l.gameTime);
      if (l instanceof A.Level) b.append(" data=").append(W.snbt(((A.Level) l).data));
      b.append('\n');
      for (String t : l.teleports) b.append("  teleport ").append(t).append('\n');
      for (String t : l.destroyed) b.append("  destroyed ").append(t).append('\n');
      for (String t : l.popped) b.append("  popped ").append(t).append('\n');
      for (String t : l.lightning) b.append("  lightning ").append(t).append('\n');
      for (W.Entity e : l.entities) {
        b.append("  entity ").append(e.typeId);
        if (e instanceof W.Player) b.append(' ').append(((W.Player) e).name);
        b.append(" at ").append(e.x).append(',').append(e.y).append(',').append(e.z).append(e.alive ? "" : " dead");
        if (e instanceof W.Living) {
          W.Living v = (W.Living) e;
          b.append(" health=").append(v.health).append('/').append(v.getMaxHealth());
          for (String attr : new java.util.TreeSet<>(v.mods.keySet())) {
            for (Map.Entry<String, double[]> m : new java.util.TreeMap<>(v.mods.get(attr)).entrySet()) {
              b.append("\n    modifier ").append(attr).append(' ').append(m.getKey()).append(" = ").append(m.getValue()[0]).append(' ').append(W.Op.values()[(int) m.getValue()[1]]);
            }
          }
          for (Map.Entry<String, int[]> f : v.effects.entrySet()) b.append("\n    effect ").append(f.getKey()).append(" duration=").append(f.getValue()[0]).append(" amplifier=").append(f.getValue()[1]);
          for (W.Slot slot : W.Slot.values()) { W.Stack g = v.gear.get(slot); if (g != null && !g.isEmpty()) b.append("\n    gear ").append(slot).append(' ').append(g.count).append(' ').append(g.id).append(g.tag == null ? "" : W.snbt(g.tag)); }
        }
        if (e instanceof W.Player) {
          W.Player p = (W.Player) e;
          for (int i = 0; i < p.inv.slots.length; i++) { W.Stack g = p.inv.slots[i]; if (g != null && !g.isEmpty()) b.append("\n    slot ").append(i).append(' ').append(g.count).append(' ').append(g.id).append(g.tag == null ? "" : W.snbt(g.tag)); }
          for (W.Stack g : p.given) b.append("\n    given ").append(g.count).append(' ').append(g.id).append(g.tag == null ? "" : W.snbt(g.tag));
          b.append("\n    xp=").append(p.xp).append(" xpGiven=").append(p.xpGiven).append(" food=").append(p.foodData.food);
          if (p instanceof A.Player) b.append(" xpLevel=").append(((A.Player) p).xpLevel);
        }
        if (!e.kjsData.map.isEmpty()) b.append("\n    persistentData ").append(W.snbt(e.kjsData));
        if (!e.forgeData.map.isEmpty()) b.append("\n    forgePersistentData ").append(W.snbt(e.forgeData));
        if (!e.tags.isEmpty()) b.append("\n    tags ").append(e.tags);
        for (String t : e.told) b.append("\n    told ").append(t);
        for (String t : e.sounds) b.append("\n    sound ").append(t);
        b.append('\n');
      }
    }
    return b.toString();
  }
}
