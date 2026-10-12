package mk;

import dev.latvian.mods.rhino.util.HideFromJS;
import dev.latvian.mods.rhino.util.RemapPrefixForJS;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Predicate;

/**
 * Mock surface for the STARTUP and CLIENT scripts (2026-10-11 sweep), on top of the on-hit mocks in W.
 *
 * Same rule as W: a class exposes ONLY members the real class has, under the name scripts see.
 * Sources (javap, this session):
 *   forge-1.20.1-47.4.6-universal.jar  LivingKnockBackEvent (NO getSource()), ItemAttributeModifierEvent,
 *                                      MobEffectEvent$Applicable (HasResult, not cancelable), Event$Result
 *   mc.jar (mojmap, Forge-patched)     AttributeModifier(UUID,String,double,Operation), Attributes, MobType,
 *                                      MobEffectInstance, MobEffect
 *   Apotheosis-1.20.1-7.4.8.jar        LootCategory.register(LootCategory,String,Predicate,EquipmentSlot[]) / byId / isValid
 *   iridescent_tetra_expansion jar     ItemAttributeRegistry, ForgeEventRegistry (source read in the repo)
 *   kubejs-forge-2001.6.5              ComponentKJS (kjs$color(Color), kjs$bold(), kjs$gray()...), TextWrapper
 *   rhino-forge-2001.2.3               ColorWrapper names (snake_case + camelCase)
 */
public class S {

  // ------------------------------------------------------------------ attributes
  /** net.minecraft.world.entity.ai.attributes.AttributeModifier */
  public static class AttributeModifier {
    public enum Operation { ADDITION, MULTIPLY_BASE, MULTIPLY_TOTAL }
    final UUID id; final String name; final double amount; final Operation op;
    public AttributeModifier(UUID id, String name, double amount, Operation op) {
      if (id == null || op == null) throw new NullPointerException("mock: AttributeModifier(null id/op)");
      this.id = id; this.name = name; this.amount = amount; this.op = op;
    }
    public AttributeModifier(String name, double amount, Operation op) { this(UUID.randomUUID(), name, amount, op); }
    public AttributeModifier(UUID id, java.util.function.Supplier<String> nameGetter, double amount, Operation op) { this(id, nameGetter.get(), amount, op); }
    public UUID getId() { return id; }
    public String getName() { return name; }
    public double getAmount() { return amount; }
    public Operation getOperation() { return op; }
    @Override public String toString() { return name + "=" + amount + " " + op + " " + id; }
  }

  /** net.minecraft.world.entity.ai.attributes.Attributes (the five the scripts use) */
  public static class Attributes {
    public static final W.Attr ATTACK_DAMAGE = W.Attr.of("minecraft:generic.attack_damage");
    public static final W.Attr ATTACK_SPEED = W.Attr.of("minecraft:generic.attack_speed");
    public static final W.Attr ARMOR = W.Attr.of("minecraft:generic.armor");
    public static final W.Attr ARMOR_TOUGHNESS = W.Attr.of("minecraft:generic.armor_toughness");
    public static final W.Attr KNOCKBACK_RESISTANCE = W.Attr.of("minecraft:generic.knockback_resistance");
  }

  /** net.minecraft.world.entity.MobType: a plain class with static instances (not an enum) */
  public static class MobType {
    public static final MobType UNDEFINED = new MobType();
    public static final MobType UNDEAD = new MobType();
    public static final MobType ARTHROPOD = new MobType();
    public static final MobType ILLAGER = new MobType();
    public static final MobType WATER = new MobType();
  }

  /** net.minecraftforge.event.ItemAttributeModifierEvent (raw) */
  public static class ItemAttrEvent {
    final W.Stack stack; final W.Slot slot;
    final LinkedHashMap<String, List<AttributeModifier>> mods = new LinkedHashMap<>();
    public ItemAttrEvent(W.Stack stack, W.Slot slot) { this.stack = stack; this.slot = slot; }
    public W.Slot getSlotType() { return slot; }
    public W.Stack getItemStack() { return stack; }
    public boolean addModifier(W.Attr a, AttributeModifier m) {
      if (a == null || m == null) throw new NullPointerException("mock: addModifier(null)");
      List<AttributeModifier> l = mods.computeIfAbsent(a.id, k -> new ArrayList<>());
      for (AttributeModifier x : l) if (x.id.equals(m.id)) return false;      // Multimap of a set: same modifier once
      return l.add(m);
    }
    public boolean removeModifier(W.Attr a, AttributeModifier m) { List<AttributeModifier> l = mods.get(a.id); return l != null && l.remove(m); }
    public Collection<AttributeModifier> removeAttribute(W.Attr a) { List<AttributeModifier> l = mods.remove(a.id); return l == null ? new ArrayList<>() : l; }
    public void clearModifiers() { mods.clear(); }
    /** harness side: the item's own (native) modifier */
    public ItemAttrEvent t_native(String attr, double amount) {
      mods.computeIfAbsent(attr, k -> new ArrayList<>()).add(new AttributeModifier(UUID.nameUUIDFromBytes(("native" + attr).getBytes()), "native", amount, AttributeModifier.Operation.ADDITION));
      return this;
    }
    /** harness side: "attr: name=amount OP; ..." in insertion order */
    public String t_dump() {
      StringBuilder b = new StringBuilder();
      for (Map.Entry<String, List<AttributeModifier>> e : mods.entrySet()) {
        for (AttributeModifier m : e.getValue()) {
          if (b.length() > 0) b.append("; ");
          b.append(e.getKey()).append(' ').append(m.name).append('=').append(m.amount).append(' ').append(m.op);
        }
      }
      return b.toString();
    }
    public double t_sum(String attr) { double t = 0; List<AttributeModifier> l = mods.get(attr); if (l != null) for (AttributeModifier m : l) t += m.amount; return t; }
    public int t_count(String attr) { List<AttributeModifier> l = mods.get(attr); return l == null ? 0 : l.size(); }
    public String t_uuid(String attr, String name) { List<AttributeModifier> l = mods.get(attr); if (l != null) for (AttributeModifier m : l) if (m.name.equals(name)) return m.id.toString(); return null; }
  }

  /** com.iridescentcraft.reforging.event.ItemAttributeRegistry */
  public static class ItemAttributeRegistry {
    @FunctionalInterface public interface Handler { void accept(ItemAttrEvent event); }
    static final LinkedHashMap<String, Handler> HANDLERS = new LinkedHashMap<>();
    public static void register(String key, Handler h) { if (key != null && h != null) HANDLERS.put(key, h); }
    public static boolean unregister(String key) { return key != null && HANDLERS.remove(key) != null; }
    public static int size() { return HANDLERS.size(); }
    @HideFromJS public static void fire(ItemAttrEvent e) {
      for (Map.Entry<String, Handler> en : HANDLERS.entrySet()) {
        try { en.getValue().accept(e); } catch (Throwable t) { W.LOG.add("[item_attribute_registry] handler '" + en.getKey() + "' threw " + t.getClass().getSimpleName() + ": " + t.getMessage()); }
      }
    }
  }

  // ------------------------------------------------------------------ knockback / effects
  /** net.minecraftforge.event.entity.living.LivingKnockBackEvent -- there is NO getSource() on it */
  public static class KnockBack {
    final W.Living entity; float strength; double ratioX, ratioZ; final float originalStrength; final double originalRatioX, originalRatioZ;
    public KnockBack(W.Living e, float strength, double rx, double rz) { entity = e; this.strength = originalStrength = strength; ratioX = originalRatioX = rx; ratioZ = originalRatioZ = rz; }
    public W.Living getEntity() { return entity; }
    public float getStrength() { return strength; }
    public double getRatioX() { return ratioX; }
    public double getRatioZ() { return ratioZ; }
    public float getOriginalStrength() { return originalStrength; }
    public double getOriginalRatioX() { return originalRatioX; }
    public double getOriginalRatioZ() { return originalRatioZ; }
    public void setStrength(float s) { strength = s; }
    public void setRatioX(double v) { ratioX = v; }
    public void setRatioZ(double v) { ratioZ = v; }
    public boolean isCanceled() { return false; }
  }

  /** net.minecraftforge.eventbus.api.Event$Result */
  public enum Result { DENY, DEFAULT, ALLOW }

  public static class MobEffect {
    final String id;
    MobEffect(String id) { this.id = id; }
    public String getDescriptionId() { return "effect." + id.replace(':', '.'); }
  }
  public static class MobEffectInstance {
    final MobEffect effect; final int duration, amplifier;
    public MobEffectInstance(String effectId, int duration, int amplifier) { effect = new MobEffect(effectId); this.duration = duration; this.amplifier = amplifier; }
    public MobEffect getEffect() { return effect; }
    public int getDuration() { return duration; }
    public int getAmplifier() { return amplifier; }
    public String getDescriptionId() { return effect.getDescriptionId(); }
  }
  /** net.minecraftforge.event.entity.living.MobEffectEvent$Applicable: @HasResult, NOT cancelable */
  public static class EffectApplicable {
    final W.Living entity; final MobEffectInstance inst; Result result = Result.DEFAULT;
    public EffectApplicable(W.Living e, MobEffectInstance i) { entity = e; inst = i; }
    public W.Living getEntity() { return entity; }
    public MobEffectInstance getEffectInstance() { return inst; }
    public Result getResult() { return result; }
    public void setResult(Result r) { result = r; }
    public boolean hasResult() { return true; }
    public boolean isCancelable() { return false; }
    public boolean isCanceled() { return false; }
    public void setCanceled(boolean c) { throw new UnsupportedOperationException("Attempted to call Event#setCanceled() on a non-cancelable event of type: net.minecraftforge.event.entity.living.MobEffectEvent$Applicable"); }
  }

  /** com.iridescentcraft.reforging.event.ForgeEventRegistry (all five families, as in the mod source) */
  public static class ForgeEventRegistry {
    @FunctionalInterface public interface KnockBackHandler { void accept(KnockBack event); }
    @FunctionalInterface public interface MobEffectApplicableHandler { void accept(EffectApplicable event); }
    @FunctionalInterface public interface AnyHandler { void accept(Object event); }
    static final LinkedHashMap<String, KnockBackHandler> KNOCKBACK = new LinkedHashMap<>();
    static final LinkedHashMap<String, MobEffectApplicableHandler> EFFECT = new LinkedHashMap<>();
    public static void registerKnockBack(String key, KnockBackHandler h) { if (key != null && h != null) KNOCKBACK.put(key, h); }
    public static boolean unregisterKnockBack(String key) { return key != null && KNOCKBACK.remove(key) != null; }
    public static void registerEffectApplicable(String key, MobEffectApplicableHandler h) { if (key != null && h != null) EFFECT.put(key, h); }
    public static boolean unregisterEffectApplicable(String key) { return key != null && EFFECT.remove(key) != null; }
    public static void registerExperienceDrop(String key, AnyHandler h) { }
    public static void registerDrops(String key, AnyHandler h) { }
    public static void registerSpellDamagePre(String key, AnyHandler h) { }
    @HideFromJS public static void fire(KnockBack e) {
      for (Map.Entry<String, KnockBackHandler> en : KNOCKBACK.entrySet()) {
        try { en.getValue().accept(e); } catch (Throwable t) { W.LOG.add("[forge_event_registry] knockback handler '" + en.getKey() + "' threw " + t); }
      }
    }
    @HideFromJS public static void fire(EffectApplicable e) {
      for (Map.Entry<String, MobEffectApplicableHandler> en : EFFECT.entrySet()) {
        try { en.getValue().accept(e); } catch (Throwable t) { W.LOG.add("[forge_event_registry] effect_applicable handler '" + en.getKey() + "' threw " + t); }
      }
    }
  }

  // ------------------------------------------------------------------ Apotheosis
  /** dev.shadowsoffire.apotheosis.adventure.loot.LootCategory */
  public static class LootCategory {
    static final LinkedHashMap<String, LootCategory> BY_ID_INTERNAL = new LinkedHashMap<>();
    static final ArrayList<LootCategory> VALUES_INTERNAL = new ArrayList<>();
    final String name; final Predicate<W.Stack> validator; final W.Slot[] slots;
    LootCategory(String name, Predicate<W.Stack> validator, W.Slot[] slots) { this.name = name; this.validator = validator; this.slots = slots; }
    public static final LootCategory SWORD = reg0("sword", s -> s.id.endsWith("_sword") || s.id.endsWith("wand") || s.id.endsWith("_staff"));
    public static final LootCategory NONE = reg0("none", s -> false);
    private static LootCategory reg0(String n, Predicate<W.Stack> p) { LootCategory c = new LootCategory(n, p, new W.Slot[]{W.Slot.MAINHAND}); BY_ID_INTERNAL.put(n, c); VALUES_INTERNAL.add(c); return c; }
    public static final LootCategory register(LootCategory orderRef, String name, Predicate<W.Stack> validator, W.Slot[] slots) {
      if (BY_ID_INTERNAL.containsKey(name)) throw new IllegalArgumentException("Cannot register a loot category with a duplicate name.");
      LootCategory c = new LootCategory(name, validator, slots);
      BY_ID_INTERNAL.put(name, c);
      int idx = orderRef == null ? -1 : VALUES_INTERNAL.indexOf(orderRef);
      if (idx < 0) VALUES_INTERNAL.add(c); else VALUES_INTERNAL.add(idx, c);
      return c;
    }
    public static LootCategory byId(String id) { return BY_ID_INTERNAL.get(id); }
    public static LootCategory forItem(W.Stack stack) {
      if (stack.isEmpty()) return NONE;
      for (LootCategory c : VALUES_INTERNAL) if (c.isValid(stack)) return c;
      return NONE;
    }
    public boolean isValid(W.Stack stack) { return validator.test(stack); }
    public W.Slot[] getSlots() { return slots; }
    public String getName() { return name; }
  }

  // ------------------------------------------------------------------ text (client scripts)
  /** dev.latvian.mods.rhino.mod.util.color.Color, through ColorWrapper.of */
  public static class Color {
    final String name;
    Color(String n) { name = n; }
    static final String[] NAMES = ("black dark_blue dark_green dark_aqua dark_red dark_purple gold gray dark_gray blue green aqua red " +
      "light_purple yellow white darkBlue darkGreen darkAqua darkRed darkPurple darkGray lightPurple").split(" ");
    public static Color of(Object o) {
      if (o instanceof Color) return (Color) o;
      String s = String.valueOf(o);
      for (String n : NAMES) if (n.equals(s)) return new Color(n);
      if (s.startsWith("#")) return new Color(s);
      return new Color("NONE(" + s + ")");
    }
  }

  /** MutableComponent as scripts see it: vanilla append(...) + ComponentKJS's kjs$ helpers */
  @RemapPrefixForJS("kjs$")
  public static class Comp {
    String text; String color = ""; boolean bold; boolean translated;
    final List<Comp> siblings = new ArrayList<>();
    Comp(String t) { text = t; }
    public Comp append(Comp c) { siblings.add(c); return this; }
    /** KubeJS MutableComponentMixin: append(String) (m_130946_) is @HideFromJS; a string reaches append(Component) through the Component type wrapper */
    @HideFromJS public Comp append(String s) { siblings.add(new Comp(s)); return this; }
    public String getString() { StringBuilder b = new StringBuilder(text); for (Comp c : siblings) b.append(c.getString()); return b.toString(); }
    public Comp kjs$color(Color c) { color = c.name; return this; }
    public Comp kjs$bold() { bold = true; return this; }
    public Comp kjs$bold(Boolean v) { bold = v != null && v; return this; }
    public Comp kjs$italic() { return this; }
    public Comp kjs$gray() { color = "gray"; return this; }
    public Comp kjs$red() { color = "red"; return this; }
    public Comp kjs$aqua() { color = "aqua"; return this; }
    public Comp kjs$gold() { color = "gold"; return this; }
    public Comp kjs$yellow() { color = "yellow"; return this; }
    public Comp kjs$green() { color = "green"; return this; }
    public Comp kjs$white() { color = "white"; return this; }
    public Comp kjs$lightPurple() { color = "light_purple"; return this; }
    public Comp kjs$darkPurple() { color = "dark_purple"; return this; }
    @Override public String toString() {
      StringBuilder b = new StringBuilder();
      if (!color.isEmpty()) b.append('<').append(color).append('>');
      if (bold) b.append("<b>");
      b.append(translated ? "{" + text + "}" : text);
      for (Comp c : siblings) b.append(c.toString());
      return b.toString();
    }
  }

  /** dev.latvian.mods.kubejs.bindings.TextWrapper (the `Text` binding) */
  public static class Text {
    public static Comp of(Object o) { return (o instanceof Comp) ? (Comp) o : new Comp(String.valueOf(o)); }
    public static Comp string(String s) { return new Comp(s); }
    public static Comp literal(String s) { return new Comp(s); }
    public static Comp translate(String key) { Comp c = new Comp(key); c.translated = true; return c; }
    public static Comp translatable(String key) { return translate(key); }
    public static Comp red(Object o) { return of(o).kjs$red(); }
    public static Comp gray(Object o) { return of(o).kjs$gray(); }
    public static Comp aqua(Object o) { return of(o).kjs$aqua(); }
    public static Comp gold(Object o) { return of(o).kjs$gold(); }
    public static Comp yellow(Object o) { return of(o).kjs$yellow(); }
    public static Comp green(Object o) { return of(o).kjs$green(); }
    public static Comp white(Object o) { return of(o).kjs$white(); }
    public static Comp lightPurple(Object o) { return of(o).kjs$lightPurple(); }
    public static Comp darkPurple(Object o) { return of(o).kjs$darkPurple(); }
  }

  // ------------------------------------------------------------------ test-side helpers
  public static ItemAttrEvent attrEvent(W.Stack stack, String slot) { return new ItemAttrEvent(stack, W.Slot.valueOf(slot)); }
  public static ItemAttrEvent fireAttr(ItemAttrEvent e) { ItemAttributeRegistry.fire(e); return e; }
  public static KnockBack knock(W.Living victim, double strength, double rx, double rz) { KnockBack e = new KnockBack(victim, (float) strength, rx, rz); ForgeEventRegistry.fire(e); return e; }
  public static EffectApplicable effect(W.Living victim, String effectId, int duration, int amplifier) { EffectApplicable e = new EffectApplicable(victim, new MobEffectInstance(effectId, duration, amplifier)); ForgeEventRegistry.fire(e); return e; }
  /** what vanilla LivingEntity.hurt does just before it calls knockback(): setLastHurtByMob(causing living entity) */
  public static void hurtBy(W.Living victim, W.Living attacker, int ticksAgo) { victim.lastHurtByMob = attacker; victim.lastHurtByMobTimestamp = victim.tickCount - ticksAgo; }
  public static void mobType(W.Living e, String t) {
    e.mobType = t.equals("UNDEAD") ? MobType.UNDEAD : t.equals("ARTHROPOD") ? MobType.ARTHROPOD : MobType.UNDEFINED;
  }
  public static String attrKeys() { return String.join(",", ItemAttributeRegistry.HANDLERS.keySet()); }
  public static String forgeKeys() { return "knockback: " + String.join(",", ForgeEventRegistry.KNOCKBACK.keySet()) + " | effect: " + String.join(",", ForgeEventRegistry.EFFECT.keySet()); }
  public static List<Object> list(Object first) { ArrayList<Object> l = new ArrayList<>(); l.add(first); return l; }
  public static W.Item item(String id, int maxDamage) { W.Item i = new W.Item(id); i.kjs$setMaxDamage(maxDamage); return i; }
}
