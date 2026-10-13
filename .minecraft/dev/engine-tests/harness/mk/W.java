package mk;

import dev.latvian.mods.rhino.Context;
import dev.latvian.mods.rhino.NativeJavaList;
import dev.latvian.mods.rhino.NativeJavaMap;
import dev.latvian.mods.rhino.Scriptable;
import dev.latvian.mods.rhino.util.CustomJavaToJsWrapper;
import dev.latvian.mods.rhino.util.HideFromJS;
import dev.latvian.mods.rhino.util.RemapForJS;
import dev.latvian.mods.rhino.util.RemapPrefixForJS;
import dev.latvian.mods.rhino.util.SpecialEquality;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;

/**
 * Mock Minecraft / Forge / KubeJS surface for the on-hit harness.
 *
 * RULE: a class here exposes ONLY members that exist on the real class, under the name scripts
 * really see. Where KubeJS renames a vanilla member (@RemapForJS on a mixin @Shadow, merged into
 * the target by Mixin) the mock carries the same annotation, so the production Rhino build
 * resolves names exactly as it does in game:
 *   DamageSource.getEntity -> getActual, getDirectEntity -> getImmediate, getMsgId -> getType
 *   Entity.hurt -> attack, getType -> getEntityType, setDeltaMovement(DDD) -> setMotion,
 *     getUUID -> getUuid, getScoreboardName -> getUsername, distanceTo -> distanceToEntity,
 *     tickCount (field) -> age, level() hidden, getPersistentData (Forge) -> getForgePersistentData
 *   Level.getGameTime -> getTime, dimension() -> getDimensionKey
 *   ItemStack.getTag -> getNbt, setTag -> setNbt, hasTag -> hasNBT
 * and every kjs$ method is exposed without its prefix.
 */
public class W {

  // ------------------------------------------------------------------ misc
  public static final List<String> LOG = new ArrayList<>();
  public static int nbtSerializations = 0;      // entity.nbt / stack nbt toString() calls
  public static int affixDataToStrings = 0;

  public static class RL implements SpecialEquality {
    final String s;
    public RL(String s) { this.s = s; }
    public RL(String ns, String path) { this.s = ns + ":" + path; }
    public static RL tryParse(String s) { return (s == null || s.indexOf(':') < 0) ? null : new RL(s); }
    public String getNamespace() { return s.substring(0, s.indexOf(':')); }
    public String getPath() { return s.substring(s.indexOf(':') + 1); }
    @Override public String toString() { return s; }
    @Override public boolean equals(Object o) { return o instanceof RL && ((RL) o).s.equals(s); }
    @Override public int hashCode() { return s.hashCode(); }
    @Override public boolean specialEquals(Object o, boolean shallow) {
      return o instanceof RL ? equals(o) : s.equals(String.valueOf(o));
    }
  }

  /** ResourceKey */
  public static class Key implements SpecialEquality {
    final RL loc;
    public Key(String s) { loc = new RL(s); }
    public RL location() { return loc; }
    @Override public String toString() { return "ResourceKey[" + loc + "]"; }
    @Override public boolean specialEquals(Object o, boolean shallow) {
      if (this == o) return true;
      if (o instanceof Key) return false;
      if (o instanceof RL) return loc.equals(o);
      return loc.toString().equals(String.valueOf(o));
    }
  }

  /**
   * Vec3. The real class has a public FIELD x (f_82479_ in the jar, remapped to `x` for scripts) and a public
   * METHOD x(). Rhino merges the two into one member, and because the field's own name is not the script name
   * the per-object copy is never found: a value read of `vec.x` (in Math.floor, in a string, in arithmetic)
   * calls Field.get(null) and throws a NullPointerException that NO script catch catches and that ends the
   * event for every later handler (seen on the real engine, 2026-10-12). `vec.x()` works. The fields here are
   * renamed the same way, so the production Rhino build does exactly that to a script under test.
   */
  public static class Vec3 {
    @RemapForJS("x") public final double fx;
    @RemapForJS("y") public final double fy;
    @RemapForJS("z") public final double fz;
    public Vec3(double x, double y, double z) { this.fx = x; this.fy = y; this.fz = z; }
    public double x() { return fx; }
    public double y() { return fy; }
    public double z() { return fz; }
    public double length() { return Math.sqrt(fx * fx + fy * fy + fz * fz); }
  }

  public static class BlockPos {
    public static final BlockPos ZERO = new BlockPos(0, 0, 0);
    private final int x, y, z;
    public BlockPos(int x, int y, int z) { this.x = x; this.y = y; this.z = z; }
    public int getX() { return x; }
    public int getY() { return y; }
    public int getZ() { return z; }
    @Override public String toString() { return x + "," + y + "," + z; }
    /** UtilsJS.blockPosOf: anything that is not a BlockPos / 3-element List / block container becomes ZERO. */
    public static BlockPos of(Object o) {
      if (o instanceof BlockPos) return (BlockPos) o;
      if (o instanceof List && ((List<?>) o).size() >= 3) {
        List<?> l = (List<?>) o;
        return new BlockPos(((Number) l.get(0)).intValue(), ((Number) l.get(1)).intValue(), ((Number) l.get(2)).intValue());
      }
      if (o instanceof Block) return ((Block) o).getPos();
      return ZERO;
    }
  }

  public static class AABB {
    final double x0, y0, z0, x1, y1, z1;
    public AABB(double a, double b, double c, double d, double e, double f) { x0 = Math.min(a, d); y0 = Math.min(b, e); z0 = Math.min(c, f); x1 = Math.max(a, d); y1 = Math.max(b, e); z1 = Math.max(c, f); }
    /** the `AABB` binding (AABBWrapper.of) */
    public static AABB of(double a, double b, double c, double d, double e, double f) { return new AABB(a, b, c, d, e, f); }
    boolean has(Entity e) { return e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1 && e.z >= z0 && e.z <= z1; }
    double volume() { return (x1 - x0) * (y1 - y0) * (z1 - z0); }
  }

  // ------------------------------------------------------------------ registries
  public static class Attr {
    final String id;
    final double def;
    private Attr(String id, double def) { this.id = id; this.def = def; }
    static final Map<String, Attr> ALL = new HashMap<>();
    static {
      String[][] a = {
        {"minecraft:generic.max_health", "20"}, {"minecraft:generic.attack_speed", "4"}, {"minecraft:generic.armor", "0"},
        {"minecraft:generic.knockback_resistance", "0"}, {"minecraft:generic.attack_damage", "1"},
        {"irons_spellbooks:spell_power", "1"}, {"irons_spellbooks:mana_regen", "1"}, {"irons_spellbooks:cooldown_reduction", "1"},
        {"irons_spellbooks:fire_spell_power", "1"}, {"irons_spellbooks:ice_spell_power", "1"},
        {"irons_spellbooks:lightning_spell_power", "1"}, {"irons_spellbooks:nature_spell_power", "1"},
        {"attributeslib:crit_chance", "0.05"}, {"attributeslib:crit_damage", "1.5"},
        {"attributecore:crit_chance", "0"}, {"attributecore:critical_damage", "0"}, {"attributecore:life_steal", "0"},
        {"attributecore:dodge_chance", "0"},
        {"icraft:spell_power", "0"}, {"icraft:lifesteal", "0"}, {"icraft:dodge_chance", "0"},
        {"puffish_attributes:ranged_damage", "0"},
        {"minecraft:generic.armor_toughness", "0"}, {"irons_spellbooks:max_mana", "100"},
        {"iridescent_reforging:damage_vs_undead", "0"}
      };
      for (String[] e : a) ALL.put(e[0], new Attr(e[0], Double.parseDouble(e[1])));
    }
    /** the registry type wrapper: an unknown id is a NullPointerException, exactly as in game */
    public static Attr of(Object o) {
      if (o instanceof Attr) return (Attr) o;
      Attr a = ALL.get(String.valueOf(o));
      if (a == null) throw new NullPointerException("No such element with id " + o + " in registry minecraft:attribute!");
      return a;
    }
    @Override public String toString() { return id; }
  }

  public enum Op { ADDITION, MULTIPLY_BASE, MULTIPLY_TOTAL }
  public enum Slot { MAINHAND, OFFHAND, FEET, LEGS, CHEST, HEAD }

  public static class Effect {
    final String id;
    private Effect(String id) { this.id = id; }
    private static final Set<String> KNOWN = new LinkedHashSet<>();
    static {
      for (String s : ("invisibility fire_resistance slowness glowing strength speed health_boost haste night_vision resistance " +
        "poison darkness levitation weakness wither mining_fatigue regeneration absorption blindness slow_falling jump_boost " +
        "nausea hunger luck").split(" ")) KNOWN.add("minecraft:" + s);
    }
    public static Effect of(Object o) {
      if (o instanceof Effect) return (Effect) o;
      String s = String.valueOf(o);
      if (!KNOWN.contains(s)) throw new NullPointerException("No such element with id " + s + " in registry minecraft:mob_effect!");
      return new Effect(s);
    }
    @Override public String toString() { return id; }
  }

  public static class Ench {
    final String id;
    public Ench(String id) { this.id = id; }
    @Override public String toString() { return id; }
  }
  static final Set<String> ENCHANTS = new LinkedHashSet<>();
  static {
    for (String s : ("heatward voidward depthstrider_custom aether_acclimation warp_shield prospector lumberjack momentum adrenaline " +
      "titan_slayer crowd_control adaptive boss_ward steadfast nemesis mana_temper rf_capacitance convergence primal_force " +
      "magnetism last_stand vitality phalanx quick_draw lunar_stride thermal_regulation pressure_shell void_adaptation stellar_shield").split(" "))
      ENCHANTS.add("icraft:" + s);
    ENCHANTS.add("iridescent_modular_spells:magic_crit_chance");
    ENCHANTS.add("iridescent_modular_spells:magic_crit_damage");
    ENCHANTS.add("ensorcellation:soulbound");
    ENCHANTS.add("minecraft:sharpness");
    ENCHANTS.add("ensorcellation:vorpal");
    for (String e : "mana_boost mana_regen arcane_focus vorpal_arcane".split(" ")) ENCHANTS.add("iridescent_reforging:" + e);
  }

  /** net.minecraftforge.registries.ForgeRegistries */
  public static class ForgeRegistries {
    public static final Reg ENCHANTMENTS = new Reg("ench");
    public static final Reg ATTRIBUTES = new Reg("attr");
    public static final Reg ITEMS = new Reg("item");
    public static final Reg ENTITY_TYPES = new Reg("entity");
  }
  public static class Reg {
    final String kind;
    Reg(String kind) { this.kind = kind; }
    public Object getValue(RL rl) {
      if (rl == null) return null;
      if (kind.equals("ench")) return ENCHANTS.contains(rl.s) ? new Ench(rl.s) : null;
      return Attr.ALL.get(rl.s);
    }
    public RL getKey(Object value) {
      if (kind.equals("item")) return (value instanceof Item) ? new RL(((Item) value).id) : new RL("minecraft:air");
      if (kind.equals("entity")) return (value instanceof EntityType) ? new RL(((EntityType) value).id) : new RL("minecraft:pig");
      if (kind.equals("ench")) return (value instanceof Ench) ? new RL(((Ench) value).id) : null;
      return (value instanceof Attr) ? new RL(((Attr) value).id) : null;
    }
  }

  /** net.minecraft.world.item.enchantment.EnchantmentHelper */
  public static class EnchantmentHelper {
    static int calls = 0;
    public static int getItemEnchantmentLevel(Ench ench, Stack stack) {
      calls++;
      if (stack == null || stack.isEmpty() || stack.tag == null) return 0;
      Object l = stack.tag.map.get("Enchantments");
      if (!(l instanceof ListTag)) return 0;
      for (Object o : ((ListTag) l).list) {
        Tag c = (Tag) o;
        if (ench.id.equals(c.getString("id"))) return c.getInt("lvl");
      }
      return 0;
    }
  }

  /** net.minecraft.tags.DamageTypeTags */
  public static class DamageTypeTags {
    public static final String IS_FIRE = "#is_fire";
    public static final String IS_EXPLOSION = "#is_explosion";
    public static final String IS_PROJECTILE = "#is_projectile";
    public static final String IS_FALL = "#is_fall";
  }

  // ------------------------------------------------------------------ NBT
  static String snbt(Object o) {
    if (o instanceof Tag) {
      StringBuilder b = new StringBuilder("{"); boolean first = true;
      for (Map.Entry<String, Object> e : ((Tag) o).map.entrySet()) { if (!first) b.append(','); first = false; b.append(e.getKey()).append(':').append(snbt(e.getValue())); }
      return b.append('}').toString();
    }
    if (o instanceof ListTag) {
      StringBuilder b = new StringBuilder("["); boolean first = true;
      for (Object e : ((ListTag) o).list) { if (!first) b.append(','); first = false; b.append(snbt(e)); }
      return b.append(']').toString();
    }
    if (o instanceof String) return "\"" + o + "\"";
    if (o instanceof Byte) return o + "b";
    if (o instanceof Short) return o + "s";
    if (o instanceof Long) return o + "L";
    if (o instanceof Float) return o + "f";
    if (o instanceof Double) return o + "d";
    return String.valueOf(o);
  }
  /** CompoundTag as scripts see it: wrapped by KubeJS's CompoundTagWrapper -> NativeJavaMap over the tag's own map. */
  public static class Tag implements CustomJavaToJsWrapper {
    final LinkedHashMap<String, Object> map = new LinkedHashMap<>();
    @Override public Scriptable convertJavaToJs(Context cx, Scriptable scope, Class<?> staticType) {
      return new NativeJavaMap(cx, scope, this, map);
    }
    public Set<String> getAllKeys() { return map.keySet(); }
    public int size() { return map.size(); }
    public boolean isEmpty() { return map.isEmpty(); }
    public boolean contains(String k) { return map.containsKey(k); }
    public boolean contains(String k, int type) { return map.containsKey(k); }
    public void remove(String k) { map.remove(k); }
    public Object get(String k) { return map.get(k); }
    public void put(String k, Object v) { map.put(k, v); }
    private Number num(String k) { Object o = map.get(k); return o instanceof Number ? (Number) o : null; }
    public int getInt(String k) { Number n = num(k); return n == null ? 0 : n.intValue(); }
    public short getShort(String k) { Number n = num(k); return n == null ? 0 : n.shortValue(); }
    public long getLong(String k) { Number n = num(k); return n == null ? 0L : n.longValue(); }
    public float getFloat(String k) { Number n = num(k); return n == null ? 0f : n.floatValue(); }
    public double getDouble(String k) { Number n = num(k); return n == null ? 0d : n.doubleValue(); }
    public boolean getBoolean(String k) { Number n = num(k); return n != null && n.byteValue() != 0; }
    public String getString(String k) { Object o = map.get(k); return o instanceof String ? (String) o : ""; }
    public Tag getCompound(String k) { Object o = map.get(k); return o instanceof Tag ? (Tag) o : new Tag(); }
    public ListTag getList(String k, int type) { Object o = map.get(k); return o instanceof ListTag ? (ListTag) o : new ListTag(); }
    public void putInt(String k, int v) { map.put(k, v); }
    public void putLong(String k, long v) { map.put(k, v); }
    public void putFloat(String k, float v) { map.put(k, v); }
    public void putDouble(String k, double v) { map.put(k, v); }
    public void putBoolean(String k, boolean v) { map.put(k, (byte) (v ? 1 : 0)); }
    public void putString(String k, String v) { map.put(k, v); }
    public Tag copy() { Tag t = new Tag(); t.map.putAll(map); return t; }
    @Override public String toString() { nbtSerializations++; return snbt(this); }
    /** harness-side builder (not a script-visible name in game; only test code calls it) */
    public Tag t_with(String k, Object v) { map.put(k, v); return this; }
  }

  public static class ListTag implements CustomJavaToJsWrapper {
    final ArrayList<Object> list = new ArrayList<>();
    @Override public Scriptable convertJavaToJs(Context cx, Scriptable scope, Class<?> staticType) {
      return new NativeJavaList(cx, scope, this, list);
    }
    public int size() { return list.size(); }
    public String getString(int i) { Object o = list.get(i); return o instanceof String ? (String) o : ""; }
    public Tag getCompound(int i) { Object o = list.get(i); return o instanceof Tag ? (Tag) o : new Tag(); }
    public Object get(int i) { return list.get(i); }
    @Override public String toString() { nbtSerializations++; return snbt(this); }
    public ListTag t_add(Object o) { list.add(o); return this; }
  }

  // ------------------------------------------------------------------ items
  @RemapPrefixForJS("kjs$")
  public static class Item {
    final String id;
    private int maxDamage = 64;
    public Item(String id) { this.id = id; }
    public String kjs$getId() { return id; }
    public final int getMaxDamage() { return maxDamage; }
    public void kjs$setMaxDamage(int v) { maxDamage = v; }
  }

  @RemapPrefixForJS("kjs$")
  public static class Stack {
    public static final Stack EMPTY = new Stack("minecraft:air", 0);
    final String id;
    int count;
    Tag tag;
    int maxDamage = 0;
    public Stack(String id, int count) { this.id = id; this.count = count; }
    /** the ItemStack type wrapper (ItemStackJS.of): 'minecraft:arrow' -> a stack */
    public static Stack of(Object o) {
      if (o instanceof Stack) return (Stack) o;
      if (o == null) return EMPTY;
      return new Stack(String.valueOf(o), 1);
    }
    public boolean isEmpty() { return count <= 0 || id.equals("minecraft:air"); }
    public Item getItem() { return new Item(id); }
    public String kjs$getId() { return id; }
    @RemapForJS("getNbt") public Tag getTag() { return tag; }
    @RemapForJS("setNbt") public void setTag(Tag t) { tag = t; }
    @RemapForJS("hasNBT") public boolean hasTag() { return tag != null; }
    public Tag getOrCreateTag() { if (tag == null) tag = new Tag(); return tag; }
    public boolean kjs$hasTag(RL itemTag) { return false; }
    public Collection<RL> kjs$getTags() { return new ArrayList<>(); }
    public boolean isDamageableItem() { return maxDamage > 0; }
    public int getMaxDamage() { return maxDamage; }
    public int getDamageValue() { return tag == null ? 0 : tag.getInt("Damage"); }
    public void setDamageValue(int v) { getOrCreateTag().putInt("Damage", Math.max(0, v)); }
    public boolean isEnchanted() {
      if (tag == null) return false;
      Object l = tag.map.get("Enchantments");
      return l instanceof ListTag && !((ListTag) l).list.isEmpty();
    }
    public ListTag getEnchantmentTags() { return tag == null ? new ListTag() : tag.getList("Enchantments", 10); }
    public Map<String, Integer> kjs$getEnchantments() {
      HashMap<String, Integer> m = new HashMap<>();
      if (tag != null) for (Object o : tag.getList("Enchantments", 10).list) m.put(((Tag) o).getString("id"), ((Tag) o).getInt("lvl"));
      return m;
    }
    public int getCount() { return count; }
    public void setCount(int c) { count = c; }
    public void shrink(int n) { count -= n; }
    public void grow(int n) { count += n; }
    public Stack copy() { Stack s = new Stack(id, count); s.maxDamage = maxDamage; if (tag != null) s.tag = tag.copy(); return s; }
    public <T> void hurtAndBreak(int amount, T entity, Consumer<T> onBroken) { setDamageValue(Math.min(maxDamage - 1, getDamageValue() + amount)); }
    @Override public String toString() { return count + " " + id; }
    // ---- harness-side builders
    public Stack t_ench(String id, int lvl) {
      Tag t = getOrCreateTag();
      Object l = t.map.get("Enchantments");
      if (!(l instanceof ListTag)) { l = new ListTag(); t.map.put("Enchantments", l); }
      ((ListTag) l).t_add(new Tag().t_with("id", id).t_with("lvl", (short) lvl));
      return this;
    }
    public Stack t_affix(String affixId, String rarity) {
      Tag t = getOrCreateTag();
      Object a = t.map.get("affix_data");
      if (!(a instanceof Tag)) { a = new Tag(); t.map.put("affix_data", a); }
      Tag ad = (Tag) a;
      Object af = ad.map.get("affixes");
      if (!(af instanceof Tag)) { af = new Tag(); ad.map.put("affixes", af); }
      ((Tag) af).map.put(affixId, 0.5f);
      if (rarity != null) ad.map.put("rarity", rarity);
      return this;
    }
    public Stack t_lore(String line) {
      Tag t = getOrCreateTag();
      Object d = t.map.get("display");
      if (!(d instanceof Tag)) { d = new Tag(); t.map.put("display", d); }
      Object l = ((Tag) d).map.get("Lore");
      if (!(l instanceof ListTag)) { l = new ListTag(); ((Tag) d).map.put("Lore", l); }
      ((ListTag) l).t_add("{\"text\":\"" + line + "\"}");
      return this;
    }
    public Stack t_nbt(String k, Object v) { getOrCreateTag().map.put(k, v); return this; }
    public Stack t_durability(int max, int damage) { maxDamage = max; setDamageValue(damage); return this; }
  }

  /** vanilla Inventory seen through KubeJS's InventoryKJS (Container mixin): no `size`, no get(i). */
  @RemapPrefixForJS("kjs$")
  public static class Inventory {
    final Stack[] slots = new Stack[41];
    int reads = 0;
    public Inventory() { for (int i = 0; i < slots.length; i++) slots[i] = Stack.EMPTY; }
    public int getContainerSize() { return slots.length; }
    public int kjs$getSlots() { return slots.length; }
    public Stack kjs$getStackInSlot(int i) { reads++; return slots[i]; }
    public Stack getItem(int i) { reads++; return slots[i]; }
    public void setItem(int i, Stack s) { slots[i] = s; }
    public void kjs$setStackInSlot(int i, Stack s) { slots[i] = s; }
  }

  /** The `AStages` binding: com.alessandro.astages.integration.kubejs.AStagesKubeJSUtil (static). */
  public static class AStagesKubeJSUtil {
    public static boolean playerHasStage(String stage, Player p) { return p != null && p.astages.contains(stage); }
  }

  // ------------------------------------------------------------------ damage
  public static class DamageType {
    final String id, msg;
    final Set<String> tags = new LinkedHashSet<>();
    DamageType(String id, String msg, String... tags) { this.id = id; this.msg = msg; for (String t : tags) this.tags.add(t); }
    public String msgId() { return msg; }
  }
  public static class Holder {
    final DamageType t;
    Holder(DamageType t) { this.t = t; }
    public Optional<Key> unwrapKey() { return Optional.of(new Key(t.id)); }
    public boolean is(Object tag) { return t.tags.contains(String.valueOf(tag)); }
  }
  static final Map<String, DamageType> TYPES = new HashMap<>();
  private static void type(String id, String msg, String... tags) { TYPES.put(id, new DamageType(id, msg, tags)); }
  static {
    type("minecraft:player_attack", "player");
    type("minecraft:mob_attack", "mob");
    type("minecraft:generic", "generic");
    type("minecraft:magic", "magic");
    type("minecraft:indirect_magic", "indirectMagic");
    type("minecraft:in_fire", "inFire", "#is_fire");
    type("minecraft:on_fire", "onFire", "#is_fire");
    type("minecraft:lava", "lava", "#is_fire");
    type("minecraft:hot_floor", "hotFloor", "#is_fire");
    type("minecraft:fall", "fall", "#is_fall");
    type("minecraft:out_of_world", "outOfWorld");
    type("minecraft:wither", "wither");
    type("minecraft:explosion", "explosion", "#is_explosion");
    type("minecraft:player_explosion", "explosion.player", "#is_explosion");
    type("minecraft:arrow", "arrow", "#is_projectile");
    type("minecraft:trident", "trident", "#is_projectile");
    type("minecraft:thrown", "thrown", "#is_projectile");
    type("minecraft:fireball", "fireball", "#is_projectile", "#is_fire");
    type("minecraft:thorns", "thorns");
    type("minecraft:sonic_boom", "sonic_boom");
    type("minecraft:lightning_bolt", "lightningBolt");
    type("minecraft:freeze", "freeze");
    type("minecraft:starve", "starve");
    type("irons_spellbooks:fire_magic", "irons_spellbooks.fire_magic", "#is_fire");
    type("irons_spellbooks:ice_magic", "irons_spellbooks.ice_magic");
    type("irons_spellbooks:poison_cloud", "irons_spellbooks.poison_cloud");
    type("somemod:scorch", "scorch", "#is_fire");
    type("somemod:bolt", "bolt", "#is_projectile");
    type("ars_nouveau:spell", "player");
    type("ars_nouveau:flare", "fire", "#is_fire");
    type("ars_nouveau:frost", "freeze");
    type("ars_nouveau:windshear", "player");
    type("ars_nouveau:crush", "player");
  }

  /** DamageSource, with KubeJS's DamageSourceMixin renames. NOTE: no `entity`, and `type` is the type() METHOD. */
  @RemapPrefixForJS("kjs$")
  public static class Source {
    final DamageType t;
    final Entity causing, direct;
    public Source(String typeId, Entity causing, Entity direct) {
      DamageType dt = TYPES.get(typeId);
      if (dt == null) throw new IllegalArgumentException("mock: unknown damage type " + typeId);
      this.t = dt; this.causing = causing; this.direct = direct;
    }
    @RemapForJS("getActual") public Entity getEntity() { return causing; }
    @RemapForJS("getImmediate") public Entity getDirectEntity() { return direct; }
    @RemapForJS("getType") public String getMsgId() { return t.msg; }
    public DamageType type() { return t; }
    public Holder typeHolder() { return new Holder(t); }
    public boolean is(Object tagOrKey) {
      String s = String.valueOf(tagOrKey);
      return s.startsWith("#") ? t.tags.contains(s) : t.id.equals(s);
    }
    public boolean isIndirect() { return causing != direct; }
    public Player kjs$getPlayer() { return causing instanceof Player ? (Player) causing : null; }
    @Override public String toString() { return "DamageSource (" + t.msg + ")"; }
  }

  /** DamageSources (entity.damageSources() / level.damageSources()) */
  public static class Sources {
    public Source generic() { return new Source("minecraft:generic", null, null); }
    public Source magic() { return new Source("minecraft:magic", null, null); }
    public Source onFire() { return new Source("minecraft:on_fire", null, null); }
    public Source inFire() { return new Source("minecraft:in_fire", null, null); }
    public Source lava() { return new Source("minecraft:lava", null, null); }
    public Source fall() { return new Source("minecraft:fall", null, null); }
    public Source freeze() { return new Source("minecraft:freeze", null, null); }
    public Source wither() { return new Source("minecraft:wither", null, null); }
    public Source fellOutOfWorld() { return new Source("minecraft:out_of_world", null, null); }
    public Source lightningBolt() { return new Source("minecraft:lightning_bolt", null, null); }
    public Source playerAttack(Player p) { return new Source("minecraft:player_attack", p, p); }
    public Source mobAttack(Living m) { return new Source("minecraft:mob_attack", m, m); }
    public Source indirectMagic(Entity direct, Entity causing) { return new Source("minecraft:indirect_magic", causing, direct); }
    public Source thorns(Entity e) { return new Source("minecraft:thorns", e, e); }
    public Source sonicBoom(Entity e) { return new Source("minecraft:sonic_boom", e, e); }
    public Source arrow(Entity arrow, Entity shooter) { return new Source("minecraft:arrow", shooter, arrow); }
  }

  /** net.minecraftforge.event.entity.living.LivingHurtEvent (raw) */
  public static class Hurt {
    final Living entity; final Source source; float amount; boolean canceled;
    public Hurt(Living e, Source s, float a) { entity = e; source = s; amount = a; }
    public Living getEntity() { return entity; }
    public Source getSource() { return source; }
    public float getAmount() { return amount; }
    public void setAmount(float a) { amount = a; }
    public boolean isCanceled() { return canceled; }
    public void setCanceled(boolean c) { canceled = c; }
  }

  /** com.iridescentcraft.reforging.event.DamageModifierRegistry */
  public static class DamageModifierRegistry {
    @FunctionalInterface public interface Handler { void accept(Hurt event); }
    static final LinkedHashMap<String, Handler> HANDLERS = new LinkedHashMap<>();
    static final LinkedHashMap<String, Handler> LATE = new LinkedHashMap<>();
    static final Map<String, Integer> THROWS = new HashMap<>();
    static String only = null;   // test hook: dispatch to this key only
    public static void register(String key, Handler h) { if (key != null && h != null) HANDLERS.put(key, h); }
    public static void registerLate(String key, Handler h) { if (key != null && h != null) { HANDLERS.remove(key); LATE.put(key, h); } }
    public static boolean unregister(String key) { if (key == null) return false; boolean a = HANDLERS.remove(key) != null; boolean b = LATE.remove(key) != null; return a || b; }
    public static int size() { return HANDLERS.size() + LATE.size(); }
    @HideFromJS public static void dispatch(Hurt e) { run(HANDLERS, e); run(LATE, e); }
    private static void run(Map<String, Handler> m, Hurt e) {
      for (Map.Entry<String, Handler> en : new ArrayList<>(m.entrySet())) {
        if (only != null && !only.equals(en.getKey())) continue;
        try { en.getValue().accept(e); } catch (Throwable t) {
          THROWS.merge(en.getKey(), 1, Integer::sum);
          LOG.add("[damage_registry] handler '" + en.getKey() + "' threw " + t.getClass().getSimpleName() + ": " + t.getMessage());
        }
      }
    }
  }

  // ------------------------------------------------------------------ effects
  public static class Effects {
    final Living e;
    Effects(Living e) { this.e = e; }
    public void add(Effect f) { add(f, 200); }
    public void add(Effect f, int d) { add(f, d, 0); }
    public void add(Effect f, int d, int a) { add(f, d, a, false, true); }
    public void add(Effect f, int duration, int amplifier, boolean ambient, boolean showParticles) {
      if (f != null) e.effects.put(f.id, new int[]{duration, amplifier});
    }
    public boolean isActive(Effect f) { return f != null && e.effects.containsKey(f.id); }
    public int getDuration(Effect f) { int[] v = f == null ? null : e.effects.get(f.id); return v == null ? 0 : v[0]; }
    public void clear() { e.effects.clear(); }
  }

  // ------------------------------------------------------------------ entities
  public static class EntityType {
    final String id;
    EntityType(String id) { this.id = id; }
    @Override public String toString() { return "entity." + id.replace(':', '.'); }
    public Object builtInRegistryHolder() { return new Object() { public Key key() { return new Key(id); } }; }
    public static EntityType of(Object o) { return o instanceof EntityType ? (EntityType) o : new EntityType(String.valueOf(o)); }
  }

  @RemapPrefixForJS("kjs$")
  public static class Entity {
    final String typeId;
    Level lvl;
    double x, y, z;
    Vec3 motion = new Vec3(0, 0, 0);
    boolean ground = true, sprinting, crouching, alive = true, monster, removed;
    int fireTicks, frozenTicks;
    final UUID uuid = UUID.randomUUID();
    final Tag kjsData = new Tag();
    final Tag forgeData = new Tag();
    final Set<String> tags = new LinkedHashSet<>();
    final List<String> told = new ArrayList<>();
    final List<String> sounds = new ArrayList<>();
    int nbtReads = 0;
    @RemapForJS("age") public int tickCount = 100;

    public Entity(String typeId, Level lvl, double x, double y, double z) { this.typeId = typeId; this.lvl = lvl; this.x = x; this.y = y; this.z = z; if (lvl != null) lvl.entities.add(this); }

    public String kjs$getType() { return typeId; }
    @RemapForJS("getEntityType") public EntityType getType() { return new EntityType(typeId); }
    @HideFromJS public Level level() { return lvl; }
    public Level kjs$getLevel() { return lvl; }
    public Server kjs$getServer() { return lvl.server; }
    @RemapForJS("getUuid") public UUID getUUID() { return uuid; }
    @RemapForJS("getStringUuid") public String getStringUUID() { return uuid.toString(); }
    @RemapForJS("getUsername") public String getScoreboardName() { return uuid.toString(); }
    public double getX() { return x; }
    public double getY() { return y; }
    public double getZ() { return z; }
    public Vec3 position() { return new Vec3(x, y, z); }
    public BlockPos blockPosition() { return new BlockPos((int) Math.floor(x), (int) Math.floor(y), (int) Math.floor(z)); }
    public Vec3 getDeltaMovement() { return motion; }
    public void setDeltaMovement(Vec3 v) { motion = v; }
    @RemapForJS("setMotion") public void setDeltaMovement(double a, double b, double c) { motion = new Vec3(a, b, c); }
    public void teleportTo(double a, double b, double c) { x = a; y = b; z = c; lvl.teleports.add(typeId + " -> " + a + "," + b + "," + c); }
    public boolean onGround() { return ground; }
    public boolean isSprinting() { return sprinting; }
    public boolean isCrouching() { return crouching; }
    public boolean isAlive() { return alive; }
    public boolean isSpectator() { return false; }
    public void setSecondsOnFire(int s) { fireTicks = Math.max(fireTicks, s * 20); }
    public int getRemainingFireTicks() { return fireTicks; }
    public void setRemainingFireTicks(int t) { fireTicks = t; }
    public int getTicksFrozen() { return frozenTicks; }
    public void setTicksFrozen(int t) { frozenTicks = t; }
    @RemapForJS("attack") public boolean hurt(Source s, float amount) { return false; }
    public void kjs$attack(float hp) { hurt(new Source("minecraft:generic", null, null), hp); }
    @RemapForJS("distanceToEntity") public float distanceTo(Entity o) { double a = x - o.x, b = y - o.y, c = z - o.z; return (float) Math.sqrt(a * a + b * b + c * c); }
    public Sources damageSources() { return new Sources(); }
    @RemapForJS("getPersistentData") public Tag kjs$getPersistentData() { return kjsData; }
    @RemapForJS("getForgePersistentData") public Tag getPersistentData() { return forgeData; }
    public boolean kjs$isPlayer() { return false; }
    public boolean kjs$isLiving() { return false; }
    public boolean kjs$isMonster() { return monster; }
    public Stack kjs$getItem() { return null; }
    public void kjs$tell(Object msg) { told.add(String.valueOf(msg)); }
    public int kjs$runCommandSilent(String c) { lvl.server.commands.add(c); return 0; }
    public Tag kjs$getNbt() { nbtReads++; nbtSerializations++; return new Tag(); }
    public void playSound(Object sound, float volume, float pitch) { sounds.add(String.valueOf(sound)); }
    public void kjs$playSound(Object sound, float volume, float pitch) { sounds.add(String.valueOf(sound)); }
    public Set<String> getTags() { return tags; }
    public void kjs$setPosition(double a, double b, double c) { x = a; y = b; z = c; }
    public void discard() { alive = false; removed = true; if (lvl != null) lvl.entities.remove(this); }
    @Override public String toString() { return typeId + "@" + (int) x + "," + (int) y + "," + (int) z; }
  }

  public static class ItemEntity extends Entity {
    final Stack stack;
    public ItemEntity(Level l, double x, double y, double z, Stack s) { super("minecraft:item", l, x, y, z); stack = s; }
    @Override public Stack kjs$getItem() { return stack; }
  }

  @RemapPrefixForJS("kjs$")
  public static class Living extends Entity {
    float health = 20f, maxHealth = 20f, lastHurt;
    int invulnerableTime, armor;
    boolean blocking;
    final Map<String, int[]> effects = new LinkedHashMap<>();
    final Map<Slot, Stack> gear = new HashMap<>();
    final Map<String, Double> attrBase = new HashMap<>();
    final Map<String, Map<String, double[]>> mods = new HashMap<>();   // attr -> key -> {amount, op}
    final Set<String> attrs = new LinkedHashSet<>();
    final List<String> hits = new ArrayList<>();
    final List<String> knocks = new ArrayList<>();
    float healed;
    int equipReads = 0;

    public Living(String typeId, Level l, double x, double y, double z) {
      super(typeId, l, x, y, z);
      attrs.add("minecraft:generic.max_health"); attrs.add("minecraft:generic.armor");
      attrs.add("minecraft:generic.knockback_resistance"); attrs.add("minecraft:generic.attack_damage");
    }
    @Override public boolean kjs$isLiving() { return true; }
    public float getHealth() { return health; }
    S.MobType mobType = S.MobType.UNDEFINED;
    Living lastHurtByMob; int lastHurtByMobTimestamp;
    public S.MobType getMobType() { return mobType; }
    public Living getLastHurtByMob() { return lastHurtByMob; }
    public int getLastHurtByMobTimestamp() { return lastHurtByMobTimestamp; }
    public float getAbsorptionAmount() { return 0f; }
    public void setHealth(float h) { health = Math.max(0, Math.min(h, getMaxHealth())); }
    public float getMaxHealth() { return (float) total("minecraft:generic.max_health", maxHealth); }
    public void heal(float a) { if (a > 0) { healed += a; setHealth(health + a); } }
    public Effects kjs$getPotionEffects() { return new Effects(this); }
    public boolean hasEffect(Effect f) { return effects.containsKey(f.id); }
    public boolean removeEffect(Effect f) { return effects.remove(f.id) != null; }
    public Collection<String> getActiveEffects() { return effects.keySet(); }
    public Stack getItemBySlot(Slot s) { equipReads++; Stack v = gear.get(s); return v == null ? Stack.EMPTY : v; }
    public void setItemSlot(Slot s, Stack v) { gear.put(s, v); }
    public Stack kjs$getEquipment(Slot s) { return getItemBySlot(s); }
    public void kjs$setEquipment(Slot s, Stack v) { gear.put(s, v); }
    public Stack getMainHandItem() { return getItemBySlot(Slot.MAINHAND); }
    public Stack getOffhandItem() { return getItemBySlot(Slot.OFFHAND); }
    public Stack kjs$getMainHandItem() { return getItemBySlot(Slot.MAINHAND); }
    public Stack kjs$getOffHandItem() { return getItemBySlot(Slot.OFFHAND); }
    public Stack kjs$getHeadArmorItem() { return getItemBySlot(Slot.HEAD); }
    public Stack kjs$getChestArmorItem() { return getItemBySlot(Slot.CHEST); }
    public Stack kjs$getLegsArmorItem() { return getItemBySlot(Slot.LEGS); }
    public Stack kjs$getFeetArmorItem() { return getItemBySlot(Slot.FEET); }
    public int getArmorValue() { return armor; }
    public boolean isBlocking() { return blocking; }
    public boolean isBaby() { return false; }
    public void knockback(double strength, double kx, double kz) {
      // vanilla: pushed along -(kx, kz)
      double len = Math.sqrt(kx * kx + kz * kz);
      knocks.add(String.format(java.util.Locale.ROOT, "%.2f toward %.2f,%.2f", strength, -kx / len, -kz / len));
    }
    public boolean randomTeleport(double a, double b, double c, boolean broadcast) { x = a; y = b; z = c; lvl.teleports.add("safe " + typeId + " -> " + a + "," + b + "," + c); return true; }

    private double total(String attr, double base) {
      double b = attrBase.containsKey(attr) ? attrBase.get(attr) : base;
      Map<String, double[]> m = mods.get(attr);
      if (m == null) return b;
      double add = 0, mulBase = 0, mulTotal = 1;
      for (double[] v : m.values()) { if (v[1] == 0) add += v[0]; else if (v[1] == 1) mulBase += v[0]; else mulTotal *= (1 + v[0]); }
      return (b + add) * (1 + mulBase) * mulTotal;
    }
    private void need(Attr a) { if (!attrs.contains(a.id)) throw new IllegalArgumentException("Can't find attribute " + a.id); }
    public double getAttributeValue(Attr a) { need(a); return total(a.id, a.id.equals("minecraft:generic.max_health") ? maxHealth : a.id.equals("minecraft:generic.armor") ? armor : a.def); }
    public double getAttributeValue(Holder h) { throw new IllegalStateException("mock: getAttributeValue(Holder) chosen"); }
    public double getAttributeBaseValue(Attr a) { need(a); return attrBase.containsKey(a.id) ? attrBase.get(a.id) : (a.id.equals("minecraft:generic.armor") ? armor : a.def); }
    public double kjs$getAttributeBaseValue(Attr a) { return attrs.contains(a.id) ? getAttributeBaseValue(a) : 0.0; }
    public double kjs$getAttributeTotalValue(Attr a) { return attrs.contains(a.id) ? getAttributeValue(a) : 0.0; }
    public void kjs$modifyAttribute(Attr a, String identifier, double d, Op op) {
      if (!attrs.contains(a.id)) return;
      mods.computeIfAbsent(a.id, k -> new LinkedHashMap<>()).put(identifier, new double[]{d, op.ordinal()});
      lvl.attrWrites++;
    }
    public void kjs$removeAttribute(Attr a, String identifier) {
      Map<String, double[]> m = mods.get(a.id);
      if (m != null) m.remove(identifier);
    }
    @HideFromJS public Double mod(String attr, String key) { Map<String, double[]> m = mods.get(attr); double[] v = m == null ? null : m.get(key); return v == null ? null : v[0]; }

    /** vanilla LivingEntity.hurt: i-frames, LivingAttackEvent (KubeJS EntityEvents.hurt), LivingHurtEvent, health. */
    @Override @RemapForJS("attack") public boolean hurt(Source s, float amount) {
      if (!alive) return false;
      lvl.hurtCalls++;
      if (lvl.hurtDepth > 12) throw new IllegalStateException("mock: runaway hurt recursion");
      if (lvl.hooks != null && lvl.hooks.attack(this, s, amount)) return false;       // cancelled
      float dealt = amount;
      if (invulnerableTime > 10) {
        if (amount <= lastHurt) return false;
        dealt = amount - lastHurt;
        lastHurt = amount;
      } else {
        lastHurt = amount;
        invulnerableTime = 20;
      }
      Hurt ev = new Hurt(this, s, dealt);
      lvl.hurtDepth++;
      try { DamageModifierRegistry.dispatch(ev); } finally { lvl.hurtDepth--; }
      lvl.hurtEvents++;
      float fin = ev.canceled ? 0f : ev.amount;
      if (Float.isNaN(fin)) { lvl.nanHits++; hits.add(s.t.id + " NaN"); return true; }
      if (Float.isInfinite(fin) || fin < 0) { lvl.badHits++; }
      hits.add(s.t.id + " " + String.format(java.util.Locale.ROOT, "%.3f", fin));
      if (fin <= 0) return true;
      health -= fin;
      if (health <= 0) { health = 0; alive = false; if (lvl.hooks != null) lvl.hooks.death(this, s); }
      return true;
    }
    @HideFromJS public void endTick() { invulnerableTime = 0; lastHurt = 0; }
  }

  public static class Mob extends Living {
    public Mob(String typeId, Level l, double x, double y, double z) { super(typeId, l, x, y, z); monster = true; }
  }
  /** a tamed animal */
  public static class Tamed extends Living {
    UUID owner;
    public Tamed(String typeId, Level l, double x, double y, double z, UUID owner) { super(typeId, l, x, y, z); this.owner = owner; }
    public UUID getOwnerUUID() { return owner; }
  }
  /** a mod mob whose class has a public `type` field (Creeper Overhaul's BaseCreeper.type): shadows the `type` bean. */
  public static class ShadowTypeMob extends Mob {
    public final Object type = new Object() { @Override public String toString() { return "CreeperType[texture=...]"; } };
    public ShadowTypeMob(String typeId, Level l, double x, double y, double z) { super(typeId, l, x, y, z); }
  }
  /** a mob whose hurt() dies with a java.lang.Error (the irons_spellbooks AbstractMethodError class of failure) */
  public static class ErrorMob extends Mob {
    public ErrorMob(Level l, double x, double y, double z) { super("irons_spellbooks:broken_caster", l, x, y, z); }
    @Override @RemapForJS("attack") public boolean hurt(Source s, float amount) { throw new AbstractMethodError("mock: abstract slot accessor"); }
  }
  public static class Dragon extends Mob {
    public Dragon(Level l, double x, double y, double z) { super("minecraft:ender_dragon", l, x, y, z); maxHealth = 200; health = 200; }
  }

  public static class FoodData {
    float saturation = 5f; int food = 20;
    public float getSaturationLevel() { return saturation; }
    public int getFoodLevel() { return food; }
    public void setFoodLevel(int f) { food = f; }
  }
  public static class Profile { final String n; Profile(String n) { this.n = n; } public String getName() { return n; } }

  @RemapPrefixForJS("kjs$")
  public static class Player extends Living {
    final String name;
    public Server server;
    final Inventory inv = new Inventory();
    final FoodData foodData = new FoodData();
    final List<Stack> given = new ArrayList<>();
    int xpGiven;
    final Set<String> astages = new LinkedHashSet<>();
    public Player t_stage(String stage) { astages.add(stage); return this; }
    public Player t_unstage(String stage) { astages.remove(stage); return this; }
    public int t_inventoryReads() { return inv.reads; }
    public Player(String name, Level l, double x, double y, double z) {
      super("minecraft:player", l, x, y, z); this.name = name; this.server = (l == null) ? null : l.server;
      for (String a : Attr.ALL.keySet()) attrs.add(a);
      if (l != null) l.server.players.add(this);
    }
    @Override public boolean kjs$isPlayer() { return true; }
    @Override @RemapForJS("getUsername") public String getScoreboardName() { return name; }
    public Inventory getInventory() { return inv; }
    public Inventory kjs$getInventory() { return inv; }
    public FoodData getFoodData() { return foodData; }
    public int kjs$getFoodLevel() { return foodData.food; }
    public void kjs$setFoodLevel(int f) { foodData.food = f; }
    public void giveExperiencePoints(int n) { xpGiven += n; }
    public int kjs$getXp() { return xp; }
    public void kjs$addXP(int n) { xp += n; }
    int xp = 0;
    public void kjs$give(Stack s) { given.add(s); }
    public boolean isCreative() { return false; }
    public Profile getGameProfile() { return new Profile(name); }
    // gear lives in the inventory for the hands: keep the two views in step
    @Override public void setItemSlot(Slot s, Stack v) { super.setItemSlot(s, v); if (s == Slot.MAINHAND) inv.slots[0] = v; if (s == Slot.OFFHAND) inv.slots[40] = v; }
    public Player t_hold(Stack s) { setItemSlot(Slot.MAINHAND, s); return this; }
    public Player t_wear(Slot slot, Stack s) { setItemSlot(slot, s); return this; }
  }

  // ------------------------------------------------------------------ world
  /** BlockContainerJS */
  public static class Block {
    final Level lvl; final BlockPos pos;
    Block(Level l, BlockPos p) { lvl = l; pos = p; }
    public String getId() { String id = lvl.blocks.get(pos.toString()); return id == null ? "minecraft:air" : id; }
    public BlockPos getPos() { return pos; }
    public int getX() { return pos.getX(); }
    public int getY() { return pos.getY(); }
    public int getZ() { return pos.getZ(); }
    public Stack getItem() { return new Stack(getId(), 1); }
    public List<Stack> getDrops() { return getDrops(null, Stack.EMPTY); }
    public List<Stack> getDrops(Entity e, Stack held) {
      ArrayList<Stack> l = new ArrayList<>();
      String id = getId();
      String drop = lvl.dropTable.get(id);
      boolean silk = held != null && !held.isEmpty() && held.kjs$getEnchantments().containsKey("minecraft:silk_touch");
      l.add(new Stack(silk || drop == null ? id : drop, 1));
      return l;
    }
    public void popItem(Stack s) { lvl.popped.add(s.id + " @ " + pos); }
  }

  public static class LevelData { final Level l; LevelData(Level l) { this.l = l; } public long getGameTime() { return l.gameTime; } }

  public interface Hooks { boolean attack(Living victim, Source source, float amount); void death(Living victim, Source source); }

  @RemapPrefixForJS("kjs$")
  public static class Level {
    final Server server;
    final String dim;
    long gameTime = 5_000_000L;
    long dayTimeTicks = 1000L;
    int light = 15;
    final List<Entity> entities = new ArrayList<>();
    final Map<String, String> blocks = new HashMap<>();
    final Map<String, String> dropTable = new HashMap<>();
    final List<String> popped = new ArrayList<>();
    final List<String> destroyed = new ArrayList<>();
    final List<String> particles = new ArrayList<>();
    final List<String> lightning = new ArrayList<>();
    final List<String> teleports = new ArrayList<>();
    int hurtCalls, hurtEvents, hurtDepth, nanHits, badHits, aabbQueries, blockReads, attrWrites, dragonQueries;
    double aabbVolume;
    Hooks hooks;
    public Level(Server s, String dim) { server = s; this.dim = dim; s.levels.add(this); }

    @RemapForJS("getTime") public long getGameTime() { return gameTime; }
    public long getDayTime() { return dayTimeTicks; }
    public long dayTime() { return dayTimeTicks; }
    @RemapForJS("getDimensionKey") public Key dimension() { return new Key(dim); }
    public RL kjs$getDimension() { return new RL(dim); }
    public Server getServer() { return server; }
    public LevelData getLevelData() { return new LevelData(this); }
    public Sources damageSources() { return new Sources(); }
    public List<Entity> kjs$getEntitiesWithin(AABB box) {
      aabbQueries++; aabbVolume += box.volume();
      ArrayList<Entity> l = new ArrayList<>();
      for (Entity e : entities) if (box.has(e)) l.add(e);
      return l;
    }
    public Block kjs$getBlock(int x, int y, int z) { blockReads++; if (!hasChunkAt(x, z)) chunkLoads++; return new Block(this, new BlockPos(x, y, z)); }
    public Block kjs$getBlock(BlockPos p) { blockReads++; if (!hasChunkAt(p)) chunkLoads++; return new Block(this, p); }
    // Level.hasChunkAt(BlockPos) / hasChunkAt(int blockX, int blockZ): neither loads. Every chunk is loaded
    // until a test unloads one (t_unload); a getBlock into an unloaded chunk is counted in chunkLoads, because
    // on the real level that read LOADS the chunk.
    final Set<Long> unloaded = new LinkedHashSet<>();
    int chunkLoads;
    static long chunkKey(int cx, int cz) { return (((long) cx) << 32) ^ (cz & 0xffffffffL); }
    public boolean hasChunkAt(BlockPos p) { return hasChunkAt(p.getX(), p.getZ()); }
    public boolean hasChunkAt(int x, int z) { return !unloaded.contains(chunkKey(x >> 4, z >> 4)); }
    public Level t_unload(int blockX, int blockZ) { unloaded.add(chunkKey(blockX >> 4, blockZ >> 4)); return this; }
    public int t_blockReads() { return blockReads; }
    public int t_chunkLoads() { return chunkLoads; }
    public int getMaxLocalRawBrightness(BlockPos p) { return light; }
    public int getBrightness(Object lightLayer, BlockPos p) { return light; }
    public boolean destroyBlock(BlockPos p, boolean drop) { return destroyBlock(p, drop, null); }
    public boolean destroyBlock(BlockPos p, boolean drop, Entity by) {
      String id = blocks.remove(p.toString());
      destroyed.add(p + (id == null ? " (air)" : " " + id) + (drop ? " drop" : ""));
      return id != null;
    }
    public List<Dragon> getDragons() {
      dragonQueries++;
      ArrayList<Dragon> l = new ArrayList<>();
      for (Entity e : entities) if (e instanceof Dragon && e.alive) l.add((Dragon) e);
      return l;
    }
    public void kjs$spawnParticles(Object options, boolean overrideLimiter, double x, double y, double z, double vx, double vy, double vz, int count, double speed) {
      particles.add(options + " x" + count + " spread " + vx + "," + vy + "," + vz);
    }
    public void kjs$spawnLightning(double x, double y, double z, boolean effectOnly, Player p) { lightning.add(x + "," + y + "," + z + (effectOnly ? " fx" : " real")); }
    public void kjs$spawnLightning(double x, double y, double z, boolean effectOnly) { kjs$spawnLightning(x, y, z, effectOnly, null); }
    public Entity kjs$createEntity(EntityType t) { return new Mob(t.id, null, 0, 0, 0); }
    public boolean addFreshEntity(Entity e) { e.lvl = this; entities.add(e); return true; }
    public void t_endTick(long ticks) { gameTime += ticks; for (Entity e : entities) if (e instanceof Living) ((Living) e).endTick(); }
  }

  public static class Objective { final String n; Objective(String n) { this.n = n; } }
  public static class Score { int v; public int getScore() { return v; } public void setScore(int s) { v = s; } }
  public static class Scoreboard {
    final Map<String, Objective> objectives = new HashMap<>();
    final Map<String, Score> scores = new HashMap<>();
    int lookups = 0;
    public Objective getObjective(String n) { lookups++; return objectives.get(n); }
    public Score getOrCreatePlayerScore(String who, Objective o) { return scores.computeIfAbsent(who + "|" + o.n, k -> new Score()); }
    @HideFromJS public void set(String who, String objective, int v) { objectives.computeIfAbsent(objective, Objective::new); scores.computeIfAbsent(who + "|" + objective, k -> new Score()).v = v; }
  }
  public static class PlayerList {
    final Server s; PlayerList(Server s) { this.s = s; }
    public Player getPlayer(UUID id) { for (Player p : s.players) if (p.uuid.equals(id)) return p; return null; }
    public List<Player> getPlayers() { return s.players; }
  }

  @RemapPrefixForJS("kjs$")
  public static class Server {
    int tick = 777;
    final ArrayList<Player> players = new ArrayList<>();
    final List<Level> levels = new ArrayList<>();
    final List<String> commands = new ArrayList<>();
    final Scoreboard scoreboard = new Scoreboard();
    final Tag data = new Tag();
    public int getTickCount() { return tick; }
    public List<Player> kjs$getPlayers() { return players; }
    public PlayerList getPlayerList() { return new PlayerList(this); }
    public Scoreboard getScoreboard() { return scoreboard; }
    public int kjs$runCommandSilent(String c) { commands.add(c); return 0; }
    public int kjs$runCommand(String c) { commands.add(c); return 0; }
    public void kjs$tell(Object m) { }
    public boolean isSameThread() { return true; }
    @RemapForJS("getPersistentData") public Tag kjs$getPersistentData() { return data; }
  }

  // ------------------------------------------------------------------ Ars (SpellDamageEvent.Pre)
  public static class SpellSchool { final String id; public SpellSchool(String id) { this.id = id; } public String getId() { return id; } }
  public static class SpellPart { public List<SpellSchool> spellSchools = new ArrayList<>(); public String name = "glyph"; }
  public static class Spell { public List<SpellPart> recipe = new ArrayList<>(); }
  public static class SpellContext { private final Spell spell; public SpellContext(Spell s) { spell = s; } public Spell getSpell() { return spell; } }
  public static class SpellDamagePre {
    public Source damageSource; public SpellContext context; public Living caster; public Entity target; public float damage;
    public SpellDamagePre(Source s, Living caster, Entity target, float damage, SpellContext ctx) { damageSource = s; this.caster = caster; this.target = target; this.damage = damage; context = ctx; }
  }
  /** com.iridescentcraft.reforging.event.ForgeEventRegistry (the one family used here) */
  public static class ForgeEventRegistry {
    @FunctionalInterface public interface SpellDamagePreHandler { void accept(SpellDamagePre event); }
    static final LinkedHashMap<String, SpellDamagePreHandler> SPELL = new LinkedHashMap<>();
    public static void registerSpellDamagePre(String key, SpellDamagePreHandler h) { if (key != null && h != null) SPELL.put(key, h); }
    @HideFromJS public static void fire(SpellDamagePre e) {
      for (Map.Entry<String, SpellDamagePreHandler> en : SPELL.entrySet()) {
        try { en.getValue().accept(e); } catch (Throwable t) { LOG.add("[forge_event_registry] spell_damage_pre handler '" + en.getKey() + "' threw " + t); }
      }
    }
  }
}
