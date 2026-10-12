package mk;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

/**
 * Stand-ins with the member names scripts see in game (Mojang names through the KubeJS remapper,
 * kjs$ prefixes stripped). AttributeInstance / AttributeModifier are ports of the 1.20.1 classes
 * (javap of the srg jar: m_22133_ addModifier throws on a duplicate UUID, m_22118_ addTransientModifier
 * = addModifier, m_22125_ addPermanentModifier = addModifier + permanent set, m_22130_ removeModifier
 * clears all three collections, calculateValue formula). Living.modifyAttribute is a port of
 * kubejs-forge 2001.6.5 LivingEntityKJS.kjs$modifyAttribute.
 */
public class M {
  public enum Operation { ADDITION, MULTIPLY_BASE, MULTIPLY_TOTAL }

  public static class Attribute {
    static final Map<String, Attribute> REG = new LinkedHashMap<>();
    final String id;
    final double min, max;
    Attribute(String id, double min, double max) { this.id = id; this.min = min; this.max = max; REG.put(id, this); }
    public double sanitizeValue(double v) { return Double.isNaN(v) ? min : Math.max(min, Math.min(max, v)); }
    /** KubeJS registry-object type wrapper: an instance passes through, a string is looked up. */
    public static Attribute of(Object o) {
      if (o == null) return null;
      if (o instanceof Attribute a) return a;
      return REG.get(String.valueOf(o));
    }
    @Override public String toString() { return id; }
  }
  public static final Attribute MAX_HEALTH = new Attribute("minecraft:generic.max_health", 1.0, 1000000.0);
  public static final Attribute ATTACK_DAMAGE = new Attribute("minecraft:generic.attack_damage", 0.0, 1000000.0);
  public static final Attribute MOVEMENT_SPEED = new Attribute("minecraft:generic.movement_speed", 0.0, 1024.0);
  public static final Attribute SPELL_POWER = new Attribute("irons_spellbooks:spell_power", 0.0, 1000000.0);

  public static class RL {
    final String s;
    RL(String s) { this.s = s; }
    public static RL tryParse(String s) { return s == null ? null : new RL(s); }
    @Override public String toString() { return s; }
  }
  public static class Reg {
    final boolean attributes;
    Reg(boolean attributes) { this.attributes = attributes; }
    public Object getValue(RL id) { return (attributes && id != null) ? Attribute.REG.get(id.s) : null; }
  }
  public static class ForgeRegistries {
    public static final Reg ATTRIBUTES = new Reg(true);
    public static final Reg ENCHANTMENTS = new Reg(false);
  }

  public static class AttributeModifier {
    final UUID id; final String name; final double amount; final Operation operation;
    public AttributeModifier(UUID id, String name, double amount, Operation operation) {
      this.id = id; this.name = name; this.amount = amount; this.operation = operation;
    }
    public UUID getId() { return id; }
    public String getName() { return name; }
    public Operation getOperation() { return operation; }
    public double getAmount() { return amount; }
    @Override public boolean equals(Object o) { return o instanceof AttributeModifier m && Objects.equals(id, m.id); }
    @Override public int hashCode() { return id.hashCode(); }
  }

  public static class AttributeInstance {
    final Attribute attribute;
    final Map<Operation, Set<AttributeModifier>> byOperation = new EnumMap<>(Operation.class);
    final Map<UUID, AttributeModifier> byId = new HashMap<>();
    final Set<AttributeModifier> permanent = new HashSet<>();
    double base;
    public boolean failPermanent = false;   // test switch: addPermanentModifier throws
    AttributeInstance(Attribute attribute, double base) { this.attribute = attribute; this.base = base; }
    public Attribute getAttribute() { return attribute; }
    public double getBaseValue() { return base; }
    public void setBaseValue(double v) { base = v; }
    public Set<AttributeModifier> getModifiers(Operation op) { return byOperation.computeIfAbsent(op, k -> new HashSet<>()); }
    public Set<AttributeModifier> getModifiers() { return Set.copyOf(byId.values()); }
    public AttributeModifier getModifier(UUID id) { return byId.get(id); }
    public boolean hasModifier(AttributeModifier m) { return byId.get(m.getId()) != null; }
    private void addModifier(AttributeModifier m) {
      if (byId.putIfAbsent(m.getId(), m) != null) throw new IllegalArgumentException("Modifier is already applied on this attribute!");
      getModifiers(m.getOperation()).add(m);
    }
    public void addTransientModifier(AttributeModifier m) { addModifier(m); }
    public void addPermanentModifier(AttributeModifier m) {
      if (failPermanent && !m.getName().startsWith("icraft_diff_")) throw new IllegalStateException("test: addPermanentModifier refused");
      addModifier(m); permanent.add(m);
    }
    public void removeModifier(AttributeModifier m) { getModifiers(m.getOperation()).remove(m); byId.remove(m.getId()); permanent.remove(m); }
    public void removeModifier(UUID id) { AttributeModifier m = getModifier(id); if (m != null) removeModifier(m); }
    public double getValue() {
      double d0 = base;
      for (AttributeModifier m : getModifiers(Operation.ADDITION)) d0 += m.getAmount();
      double d1 = d0;
      for (AttributeModifier m : getModifiers(Operation.MULTIPLY_BASE)) d1 += d0 * m.getAmount();
      for (AttributeModifier m : getModifiers(Operation.MULTIPLY_TOTAL)) d1 *= 1.0 + m.getAmount();
      return attribute.sanitizeValue(d1);
    }
  }

  /** Stand-in for CompoundTag: numeric semantics of getInt / getBoolean / putBoolean (ByteTag) / putInt. */
  public static class Tag {
    final Map<String, Object> m = new HashMap<>();
    public boolean contains(String k) { return m.containsKey(k); }
    public int getInt(String k) { Object v = m.get(k); return v instanceof Number n ? n.intValue() : 0; }
    public void putInt(String k, int v) { m.put(k, Integer.valueOf(v)); }
    public void putBoolean(String k, boolean v) { m.put(k, Byte.valueOf((byte) (v ? 1 : 0))); }
    public boolean getBoolean(String k) { Object v = m.get(k); return v instanceof Number n && n.byteValue() != 0; }
    public Tag getCompound(String k) { Object v = m.get(k); return v instanceof Tag t ? t : new Tag(); }
    public void put(String k, Object v) { m.put(k, v instanceof Tag ? v : new Tag()); }
    Tag copy() { Tag t = new Tag(); t.m.putAll(m); return t; }
    /** e.g. "icraft_boss_hp=1b icraft_boss_3x=2" (b = written by putBoolean) */
    public String show() {
      StringBuilder sb = new StringBuilder();
      for (String k : new TreeSet<>(m.keySet())) {
        Object v = m.get(k);
        if (!(v instanceof Number)) continue;
        if (sb.length() > 0) sb.append(' ');
        sb.append(k).append('=').append(v).append(v instanceof Byte ? "b" : "");
      }
      return sb.toString();
    }
  }

  public static class Server {
    final Level overworld;
    Server(Level overworld) { this.overworld = overworld; }
    public Level getLevel(String id) { return overworld; }
  }
  public static class Level {
    final Tag data = new Tag();
    final Server server = new Server(this);
    public Server getServer() { return server; }
    public Tag getPersistentData() { return data; }
    /** boss_progressive.js kill counter: key = id with ':' replaced by '_' */
    public void setKills(String safeType, int n) {
      Tag kills = data.getCompound("icraft_boss_kills");
      data.m.put("icraft_boss_kills", kills);
      kills.putInt(safeType, n);
    }
  }

  public static class Living {
    static final UUID DIFF_HP = UUID.fromString("a3b1f001-0000-4000-8000-000000000001");
    final String typeId;
    public boolean monster = true;
    public boolean player = false;
    /** an entity the scripts must never reach with an attribute / health call */
    public boolean untouchable = false;
    final Map<Attribute, AttributeInstance> attrs = new LinkedHashMap<>();
    float health;
    Tag data = new Tag();
    boolean diffScaled = false;   // the difficulty mod's own flag (Forge data, not KubeJS's)
    final Level level;

    public Living(String typeId, double baseHealth, Level level) {
      this.typeId = typeId; this.level = level;
      attrs.put(MAX_HEALTH, new AttributeInstance(MAX_HEALTH, baseHealth));
      health = getMaxHealth();
    }
    public Living attr(String id, double base) {
      Attribute a = Attribute.REG.get(id);
      attrs.put(a, new AttributeInstance(a, base));
      return this;
    }
    private void guard(String what) {
      if (untouchable) throw new AbstractMethodError("script touched an excluded entity: " + what + " on " + typeId);
    }

    // ---- what scripts see ----
    public String getType() { return typeId; }
    public boolean isLiving() { return true; }
    public boolean isPlayer() { return player; }
    public boolean isMonster() { return monster; }
    public Level getLevel() { return level; }
    public Tag getPersistentData() { return data; }
    public float getHealth() { guard("getHealth"); return health; }
    public float getMaxHealth() { guard("getMaxHealth"); return (float) attrs.get(MAX_HEALTH).getValue(); }
    public void setHealth(float h) { guard("setHealth"); health = Math.max(0.0f, Math.min(h, getMaxHealth())); }
    public void heal(float amount) {
      guard("heal");
      if (amount <= 0) return;
      float h = getHealth();
      if (h > 0.0f) setHealth(h + amount);
    }
    /** test switch: getAttribute() finds nothing (a broken lookup); modifyAttribute still works */
    public boolean hideInstances = false;
    public AttributeInstance getAttribute(Attribute a) { guard("getAttribute"); return (a == null || hideInstances) ? null : attrs.get(a); }
    public void modifyAttribute(Attribute a, String name, double amount, Operation op) {
      guard("modifyAttribute");
      AttributeInstance inst = a == null ? null : attrs.get(a);
      if (inst != null) {
        UUID uuid = new UUID(name.hashCode(), name.hashCode());
        inst.removeModifier(uuid);
        inst.addTransientModifier(new AttributeModifier(uuid, name, amount, op));
      }
    }
    public void removeAttribute(Attribute a, String name) {
      AttributeInstance inst = a == null ? null : attrs.get(a);
      if (inst != null) inst.removeModifier(new UUID(name.hashCode(), name.hashCode()));
    }

    // ---- test controls ----
    /** save + load: only permanent modifiers come back; Attributes load before Health, which is clamped. */
    public Living reload() {
      Living n = new Living(typeId, attrs.get(MAX_HEALTH).base, level);
      n.monster = monster; n.player = player; n.untouchable = untouchable; n.diffScaled = diffScaled;
      n.attrs.clear();
      for (Map.Entry<Attribute, AttributeInstance> e : attrs.entrySet()) {
        AttributeInstance from = e.getValue();
        AttributeInstance to = new AttributeInstance(e.getKey(), from.base);
        for (AttributeModifier m : from.permanent) to.addPermanentModifier(m);
        n.attrs.put(e.getKey(), to);
      }
      n.data = data.copy();
      n.health = Math.max(0.0f, Math.min(health, (float) n.attrs.get(MAX_HEALTH).getValue()));
      return n;
    }
    /** iridescent_difficulty MobScalingHandler (EntityJoinLevelEvent, NORMAL priority: after KubeJS). */
    public void difficultyJoin(double mult) {
      if (diffScaled || mult <= 1.0) return;
      AttributeInstance inst = attrs.get(MAX_HEALTH);
      if (inst.getModifier(DIFF_HP) != null) inst.removeModifier(DIFF_HP);
      inst.addPermanentModifier(new AttributeModifier(DIFF_HP, "icraft_diff_hp", mult - 1.0, Operation.MULTIPLY_BASE));
      health = (float) inst.getValue();
      diffScaled = true;
    }
    public void damageTo(float h) { health = h; }
    /** a modifier some other mod put on the entity (op: ADDITION / MULTIPLY_BASE / MULTIPLY_TOTAL) */
    public void foreignModifier(String attrId, String name, double amount, String op, boolean saved) {
      AttributeInstance i = attrs.get(Attribute.REG.get(attrId));
      AttributeModifier m = new AttributeModifier(UUID.nameUUIDFromBytes(name.getBytes()), name, amount, Operation.valueOf(op));
      if (saved) i.addPermanentModifier(m); else i.addTransientModifier(m);
    }
    /** ground truth for core.attrValueWithout: vanilla's own calculation on a copy without those modifiers */
    public double valueWithout(String attrId, String prefix) {
      AttributeInstance i = attrs.get(Attribute.REG.get(attrId));
      AttributeInstance c = new AttributeInstance(i.attribute, i.base);
      for (AttributeModifier m : i.byId.values()) if (!m.getName().startsWith(prefix)) c.addTransientModifier(m);
      return c.getValue();
    }
    public void failPermanent(String attrId, boolean on) { attrs.get(Attribute.REG.get(attrId)).failPermanent = on; }
    public double value(String attrId) { AttributeInstance i = attrs.get(Attribute.REG.get(attrId)); return i == null ? Double.NaN : i.getValue(); }
    public float rawHealth() { return health; }
    public float rawMax() { return (float) attrs.get(MAX_HEALTH).getValue(); }
    /** names of the modifiers on an attribute; a trailing '*' marks one that is NOT saved */
    public String mods(String attrId) {
      AttributeInstance i = attrs.get(Attribute.REG.get(attrId));
      if (i == null) return "(no attribute)";
      List<String> out = new ArrayList<>();
      for (AttributeModifier m : i.byId.values()) out.add(m.getName() + (i.permanent.contains(m) ? "" : "*"));
      out.sort(null);
      return String.join(",", out);
    }
    public String flags() { return data.show(); }
  }

  public static Level level() { return new Level(); }
  public static Living living(String typeId, double baseHealth, Level level) { return new Living(typeId, baseHealth, level); }
}
