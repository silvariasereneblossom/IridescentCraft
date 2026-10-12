import dev.latvian.mods.rhino.BaseFunction;
import dev.latvian.mods.rhino.Context;
import dev.latvian.mods.rhino.NativeJavaClass;
import dev.latvian.mods.rhino.NativeObject;
import dev.latvian.mods.rhino.RhinoException;
import dev.latvian.mods.rhino.Scriptable;
import dev.latvian.mods.rhino.ScriptableObject;
import dev.latvian.mods.rhino.Undefined;
import dev.latvian.mods.rhino.Wrapper;
import dev.latvian.mods.rhino.regexp.NativeRegExp;
import dev.latvian.mods.rhino.util.wrap.TypeWrappers;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Consumer;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Loads the pack's loot scripts on the game's own script engine (the KubeJS Rhino fork) against a
 * RECORDING mock of the LootJS 2.13.1 / KubeJS 2001.6.5 API, fires every LootJS.modifiers handler in
 * load order, and writes what was registered (targets, ordered conditions/actions, filters) as JSON.
 * It is driven by dev/audit_loot.py; see that file's header for how to run it.
 *
 * What is real here: the parser and interpreter (so `const`-in-loop, block-scoped `var`, missing
 * syntax etc. behave as in game), Rhino's Java member lookup (a method the real class does not have
 * is "Cannot find function"), KubeJS's script preload/sort/shared-scope rules, and the semantics
 * copied from the decompiled jars (cited at each mock). What is NOT real: there is no Minecraft, so
 * registries are id lists from audit_loot's ground truth, and callbacks that the game runs at drop
 * time (.apply, .modifyLoot, predicates on real stacks) are only recorded, except ItemFilter
 * predicates, which are evaluated against mock stacks (id / mod / tags / nbt only).
 *
 * Every mock class mirrors the PUBLIC, JS-VISIBLE members of the class it stands for (names after
 * KubeJS's kjs$ prefix strip / @RemapForJS), taken from javap of the installed jars. Do not add a
 * convenience member a script could call: a mock that answers a name the game does not have makes a
 * dead script look alive. Helpers are package-private (Rhino only sees public members).
 */
public class LootHarness {

    // ------------------------------------------------------------------------------------------
    // state
    // ------------------------------------------------------------------------------------------
    static Context cx;
    static Scriptable top;
    static Scriptable packScope;
    static String currentFile = "<none>";
    static String phase = "load";

    static Set<String> ITEMS = new HashSet<>();
    static Set<String> ENTITIES = new HashSet<>();
    static Set<String> MODS = new HashSet<>();
    static Map<String, Set<String>> ITEM_TAGS = new HashMap<>();   // tag id -> members
    static Map<String, Set<String>> TAGS_OF_ITEM = new HashMap<>();
    static boolean haveTags = false;

    static final List<Map<String, Object>> modifiers = new ArrayList<>();
    static final List<Builder> builders = new ArrayList<>();
    static final List<Map<String, Object>> handlers = new ArrayList<>();
    static final List<Object[]> handlerFns = new ArrayList<>();        // {fn, file, line}
    static final List<Map<String, Object>> console = new ArrayList<>();
    static final List<Map<String, Object>> warnings = new ArrayList<>();
    static final List<Map<String, Object>> scriptErrors = new ArrayList<>();
    static final List<Map<String, Object>> loadClasses = new ArrayList<>();
    static final List<Map<String, Object>> opaqueUses = new ArrayList<>();
    static final List<Map<String, Object>> otherEvents = new ArrayList<>();
    static final List<Map<String, Object>> unresolvedItems = new ArrayList<>();
    static final List<Map<String, Object>> eventCalls = new ArrayList<>();
    static final List<ItemFilter> filters = new ArrayList<>();
    static final List<LootEntry> entries = new ArrayList<>();
    static int currentHandler = -1;

    static int[] lineBuf = new int[1];

    /** Files whose frames are skipped when attributing a call (helpers that register on behalf of a caller). */
    static Set<String> passThrough = new HashSet<>();

    /**
     * Files whose frames are not part of the script's own call path at all: 00_icraft_guard.js. A guarded
     * handler runs inside the guard's wrapper, and a section inside icraft.section, so each adds a frame of
     * the guard file AND, outside it, the frame of whoever called into the guard (for a section: the handler,
     * standing at its `icraft.section(` line). Both are dropped, which leaves exactly the frames the same
     * rule had before the handlers were guarded. (The wrapper itself is called from Java: nothing outside it.)
     */
    static Set<String> transparent = new HashSet<>();

    /** The script frames, innermost first, without the guard's own frames (see {@link #transparent}). */
    static List<dev.latvian.mods.rhino.ScriptStackElement> frames() {
        List<dev.latvian.mods.rhino.ScriptStackElement> out = new ArrayList<>();
        boolean dropCaller = false;
        for (dev.latvian.mods.rhino.ScriptStackElement el :
                new dev.latvian.mods.rhino.EvaluatorException(cx, "pos").getScriptStack()) {
            if (el.fileName == null) {
                continue;
            }
            if (transparent.contains(el.fileName)) {
                dropCaller = true;
                continue;
            }
            if (dropCaller) {
                dropCaller = false;
                continue;
            }
            out.add(el);
        }
        return out;
    }

    /**
     * Source position of the script code that is calling into the mock right now. Frames inside a
     * pass-through helper (loot/0_entity_id_validator.js: global.icraftEntityMod) are skipped, so a
     * modifier is attributed to the script that asked for it; "via" then names the helper.
     */
    static Map<String, Object> pos() {
        Map<String, Object> m = new LinkedHashMap<>();
        String f = currentFile;
        int line = 0;
        String via = null;
        try {
            List<dev.latvian.mods.rhino.ScriptStackElement> stack = frames();
            boolean found = false;
            for (dev.latvian.mods.rhino.ScriptStackElement el : stack) {
                if (passThrough.contains(el.fileName)) {
                    if (via == null) {
                        via = el.fileName + ":" + el.lineNumber;
                    }
                    continue;
                }
                f = el.fileName;
                line = el.lineNumber;
                found = true;
                break;
            }
            if (!found && !stack.isEmpty()) {
                f = stack.get(0).fileName;
                line = stack.get(0).lineNumber;
                via = null;
            }
        } catch (Throwable ignored) {
            try {
                lineBuf[0] = 0;
                String src = Context.getSourcePositionFromStack(cx, lineBuf);
                if (src != null) {
                    f = src;
                    line = lineBuf[0];
                }
            } catch (Throwable ignored2) {
            }
        }
        m.put("file", f);
        m.put("line", line);
        if (via != null) {
            m.put("via", via);
        }
        return m;
    }

    /** Script frames (innermost first) as "file:line", helper files included. */
    static List<String> stack() {
        List<String> out = new ArrayList<>();
        try {
            for (dev.latvian.mods.rhino.ScriptStackElement el : frames()) {
                out.add(el.fileName + ":" + el.lineNumber);
            }
        } catch (Throwable ignored) {
        }
        return out;
    }

    static Map<String, Object> rec(String t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("t", t);
        return m;
    }

    static void warn(String msg) {
        Map<String, Object> m = pos();
        m.put("msg", msg);
        m.put("phase", phase);
        warnings.add(m);
    }

    static Object unwrap(Object o) {
        while (o instanceof Wrapper w) {
            o = w.unwrap();
        }
        if (o == Undefined.instance) {
            return null;
        }
        return o;
    }

    /** JS value -> plain Java data for the JSON report. */
    static Object plain(Object o) {
        o = unwrap(o);
        if (o == null || o instanceof String || o instanceof Boolean) {
            return o;
        }
        if (o instanceof Number n) {
            double d = n.doubleValue();
            if (d == Math.rint(d) && !Double.isInfinite(d) && Math.abs(d) < 1e15) {
                return (long) d;
            }
            return d;
        }
        if (o instanceof CharSequence) {
            return o.toString();
        }
        if (o instanceof NativeRegExp) {
            return o.toString();
        }
        if (o instanceof BaseFunction) {
            return "<function>";
        }
        if (o instanceof Map<?, ?> map) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : map.entrySet()) {
                out.put(String.valueOf(e.getKey()), plain(e.getValue()));
            }
            return out;
        }
        if (o instanceof Collection<?> c) {
            List<Object> out = new ArrayList<>();
            for (Object x : c) {
                out.add(plain(x));
            }
            return out;
        }
        if (o instanceof Object[] arr) {
            List<Object> out = new ArrayList<>();
            for (Object x : arr) {
                out.add(plain(x));
            }
            return out;
        }
        if (o instanceof float[] arr) {
            List<Object> out = new ArrayList<>();
            for (float x : arr) {
                out.add((double) x);
            }
            return out;
        }
        if (o instanceof Jsonable j) {
            return j.toJson();
        }
        return String.valueOf(o);
    }

    interface Jsonable {
        Object toJson();
    }

    // ------------------------------------------------------------------------------------------
    // Minecraft stand-ins
    // ------------------------------------------------------------------------------------------

    /** net.minecraft.resources.ResourceLocation (constructor validation + accessors only). */
    public static final class ResourceLocation implements Comparable<ResourceLocation>, Jsonable {
        private final String ns;
        private final String path;
        private static final Pattern NS = Pattern.compile("[a-z0-9_.-]*");
        private static final Pattern PATH = Pattern.compile("[a-z0-9/._-]*");

        public ResourceLocation(String s) {
            this(s.indexOf(':') >= 0 ? s.substring(0, s.indexOf(':')) : "minecraft",
                    s.indexOf(':') >= 0 ? s.substring(s.indexOf(':') + 1) : s);
        }

        public ResourceLocation(String ns, String path) {
            this.ns = ns.isEmpty() ? "minecraft" : ns;
            this.path = path;
            if (!NS.matcher(this.ns).matches()) {
                throw new IllegalArgumentException("Non [a-z0-9_.-] character in namespace of location: " + ns + ":" + path);
            }
            if (!PATH.matcher(path).matches()) {
                throw new IllegalArgumentException("Non [a-z0-9/._-] character in path of location: " + ns + ":" + path);
            }
        }

        public static ResourceLocation tryParse(String s) {
            try {
                return new ResourceLocation(s);
            } catch (IllegalArgumentException e) {
                return null;
            }
        }

        public String getNamespace() {
            return ns;
        }

        public String getPath() {
            return path;
        }

        @Override
        public String toString() {
            return ns + ":" + path;
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof ResourceLocation r && r.ns.equals(ns) && r.path.equals(path);
        }

        @Override
        public int hashCode() {
            return toString().hashCode();
        }

        @Override
        public int compareTo(ResourceLocation o) {
            return toString().compareTo(o.toString());
        }

        @Override
        public Object toJson() {
            return toString();
        }

        /** KubeJS UtilsJS.getMCID: anything -> ResourceLocation, IllegalArgumentException if invalid. */
        static ResourceLocation of(Object o) {
            o = unwrap(o);
            if (o instanceof ResourceLocation r) {
                return r;
            }
            if (o == null) {
                return null;
            }
            String s = o.toString();
            try {
                return new ResourceLocation(s);
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("Could not create ID from '" + s + "'!");
            }
        }
    }

    /** A registry reduced to "is this id registered". */
    public static final class MockRegistry {
        private final Set<String> ids;
        private final String dflt;

        MockRegistry(Set<String> ids, String dflt) {
            this.ids = ids;
            this.dflt = dflt;
        }

        public boolean containsKey(ResourceLocation id) {
            return id != null && ids.contains(id.toString());
        }

        public Set<String> keySet() {
            return ids;
        }
    }

    /** net.minecraft.core.registries.BuiltInRegistries (the two registries loot scripts touch). */
    public static final class BuiltInRegistries {
        public static MockRegistry ENTITY_TYPE;
        public static MockRegistry ITEM;
    }

    /** net.minecraft.world.entity.EntityType via KubeJS's registry type wrapper. */
    public static final class EntityType implements Jsonable {
        final String id;      // what the registry returned
        final String raw;     // what the script asked for
        final boolean pig;    // unknown id -> DefaultedRegistry default (minecraft:pig)

        EntityType(String id, String raw, boolean pig) {
            this.id = id;
            this.raw = raw;
            this.pig = pig;
        }

        static EntityType of(Object o) {
            o = unwrap(o);
            if (o instanceof EntityType e) {
                return e;
            }
            if (o == null) {
                return null;
            }
            String raw = o.toString();
            String id = ResourceLocation.of(raw).toString();
            if (ENTITIES.contains(id)) {
                return new EntityType(id, raw, false);
            }
            return new EntityType("minecraft:pig", raw, true);
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof EntityType e && e.id.equals(id);
        }

        @Override
        public int hashCode() {
            return id.hashCode();
        }

        @Override
        public Object toJson() {
            return raw;
        }
    }

    /** NumberProvider + KubeJS's type wrapper (UtilsJS.numberProviderOf: number | [min,max] | {min,max}). */
    public static class NumberProvider implements Jsonable {
        final double min;
        final double max;
        final String kind;

        NumberProvider(double min, double max, String kind) {
            this.min = min;
            this.max = max;
            this.kind = kind;
        }

        static NumberProvider of(Object o) {
            o = unwrap(o);
            if (o instanceof NumberProvider p) {
                return p;
            }
            if (o instanceof Number n) {
                return new NumberProvider(n.doubleValue(), n.doubleValue(), "constant");
            }
            if (o instanceof List<?> l && !l.isEmpty()) {
                Object a = unwrap(l.get(0));
                Object b = unwrap(l.get(l.size() - 1));
                if (a instanceof Number x && b instanceof Number y) {
                    return new NumberProvider(x.doubleValue(), y.doubleValue(), l.size() == 1 ? "constant" : "uniform");
                }
            }
            if (o instanceof Map<?, ?> m && m.containsKey("min") && m.containsKey("max")) {
                Object a = unwrap(m.get("min"));
                Object b = unwrap(m.get("max"));
                if (a instanceof Number x && b instanceof Number y) {
                    return new NumberProvider(x.doubleValue(), y.doubleValue(), "uniform");
                }
            }
            if (o == null) {
                return null;
            }
            warn("NumberProvider: unsupported value " + o + " -> constant 0");
            return new NumberProvider(0, 0, "invalid");
        }

        @Override
        public Object toJson() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("kind", kind);
            m.put("min", min);
            m.put("max", max);
            return m;
        }
    }

    /** ...loot.providers.number.UniformGenerator */
    public static final class UniformGenerator extends NumberProvider {
        UniformGenerator(double a, double b) {
            super(a, b, "uniform");
        }

        public static UniformGenerator between(float min, float max) {
            return new UniformGenerator(min, max);
        }
    }

    /** ...loot.providers.number.ConstantValue */
    public static final class ConstantValue extends NumberProvider {
        ConstantValue(double v) {
            super(v, v, "constant");
        }

        public static ConstantValue exactly(float v) {
            return new ConstantValue(v);
        }
    }

    /** net.minecraft.nbt.CompoundTag, reduced to what item predicates read. Backed by parsed SNBT. */
    public static final class CompoundTag implements Jsonable {
        final Map<String, Object> map;
        final String raw;

        CompoundTag(Map<String, Object> map, String raw) {
            this.map = map;
            this.raw = raw;
        }

        static CompoundTag of(Object o) {
            o = unwrap(o);
            if (o == null) {
                return null;
            }
            if (o instanceof CompoundTag t) {
                return t;
            }
            if (o instanceof CharSequence cs) {
                String s = cs.toString();
                try {
                    Object v = new Snbt(s).value();
                    if (v instanceof Map<?, ?>) {
                        @SuppressWarnings("unchecked") Map<String, Object> m = (Map<String, Object>) v;
                        return new CompoundTag(m, s);
                    }
                } catch (RuntimeException e) {
                    warn("NBT string did not parse (" + e.getMessage() + "): " + s);
                }
                return new CompoundTag(new LinkedHashMap<>(), s);
            }
            if (o instanceof Map<?, ?> m) {
                @SuppressWarnings("unchecked") Map<String, Object> pm = (Map<String, Object>) plain(m);
                return new CompoundTag(pm, String.valueOf(pm));
            }
            return new CompoundTag(new LinkedHashMap<>(), String.valueOf(o));
        }

        public boolean contains(String k) {
            return map.containsKey(k);
        }

        public boolean isEmpty() {
            return map.isEmpty();
        }

        public Set<String> getAllKeys() {
            return map.keySet();
        }

        public String getString(String k) {
            Object v = map.get(k);
            return v instanceof String s ? s : "";
        }

        public int getInt(String k) {
            Object v = map.get(k);
            return v instanceof Number n ? n.intValue() : 0;
        }

        public boolean getBoolean(String k) {
            Object v = map.get(k);
            return v instanceof Number n ? n.intValue() != 0 : Boolean.TRUE.equals(v);
        }

        public CompoundTag getCompound(String k) {
            Object v = map.get(k);
            if (v instanceof Map<?, ?>) {
                @SuppressWarnings("unchecked") Map<String, Object> m = (Map<String, Object>) v;
                return new CompoundTag(m, String.valueOf(m));
            }
            return new CompoundTag(new LinkedHashMap<>(), "{}");
        }

        public Object get(String k) {
            Object v = map.get(k);
            if (v instanceof Map<?, ?>) {
                return getCompound(k);
            }
            return v;
        }

        @Override
        public String toString() {
            return raw;
        }

        @Override
        public Object toJson() {
            return raw;
        }
    }

    /** Minimal SNBT reader (compounds, lists, strings, numbers with type suffixes). */
    static final class Snbt {
        final String s;
        int i = 0;

        Snbt(String s) {
            this.s = s;
        }

        void ws() {
            while (i < s.length() && Character.isWhitespace(s.charAt(i))) {
                i++;
            }
        }

        Object value() {
            ws();
            if (i >= s.length()) {
                throw new RuntimeException("unexpected end");
            }
            char c = s.charAt(i);
            if (c == '{') {
                i++;
                Map<String, Object> m = new LinkedHashMap<>();
                ws();
                if (s.charAt(i) == '}') {
                    i++;
                    return m;
                }
                while (true) {
                    ws();
                    String k = key();
                    ws();
                    if (s.charAt(i) != ':') {
                        throw new RuntimeException("expected ':' at " + i);
                    }
                    i++;
                    m.put(k, value());
                    ws();
                    char d = s.charAt(i++);
                    if (d == '}') {
                        return m;
                    }
                    if (d != ',') {
                        throw new RuntimeException("expected ',' or '}' at " + (i - 1));
                    }
                }
            }
            if (c == '[') {
                i++;
                List<Object> l = new ArrayList<>();
                ws();
                if (i + 1 < s.length() && s.charAt(i + 1) == ';') {
                    i += 2;   // typed array prefix B; I; L;
                }
                ws();
                if (s.charAt(i) == ']') {
                    i++;
                    return l;
                }
                while (true) {
                    l.add(value());
                    ws();
                    char d = s.charAt(i++);
                    if (d == ']') {
                        return l;
                    }
                    if (d != ',') {
                        throw new RuntimeException("expected ',' or ']' at " + (i - 1));
                    }
                }
            }
            if (c == '"' || c == '\'') {
                return quoted();
            }
            int st = i;
            while (i < s.length() && ",}]".indexOf(s.charAt(i)) < 0) {
                i++;
            }
            String tok = s.substring(st, i).trim();
            if (tok.equals("true")) {
                return 1;
            }
            if (tok.equals("false")) {
                return 0;
            }
            Matcher m = Pattern.compile("(-?[0-9]*\\.?[0-9]+(?:[eE][-+]?[0-9]+)?)[bBsSlLfFdD]?").matcher(tok);
            if (m.matches()) {
                double d = Double.parseDouble(m.group(1));
                if (d == Math.rint(d) && tok.indexOf('.') < 0) {
                    return (long) d;
                }
                return d;
            }
            return tok;
        }

        String key() {
            char c = s.charAt(i);
            if (c == '"' || c == '\'') {
                return quoted();
            }
            int st = i;
            while (i < s.length() && s.charAt(i) != ':') {
                i++;
            }
            return s.substring(st, i).trim();
        }

        String quoted() {
            char q = s.charAt(i++);
            StringBuilder sb = new StringBuilder();
            while (i < s.length()) {
                char c = s.charAt(i++);
                if (c == '\\' && i < s.length()) {
                    sb.append(s.charAt(i++));
                } else if (c == q) {
                    return sb.toString();
                } else {
                    sb.append(c);
                }
            }
            throw new RuntimeException("unterminated string");
        }
    }

    /** net.minecraft.world.item.Item as scripts see it (ItemKJS: getId; vanilla holder chain). */
    public static final class Item {
        final String id;

        Item(String id) {
            this.id = id;
        }

        public String getId() {
            return id;
        }

        public Item builtInRegistryHolder() {
            return this;
        }

        public Item key() {
            return this;
        }

        public ResourceLocation location() {
            return new ResourceLocation(id);
        }

        @Override
        public String toString() {
            return id.substring(id.indexOf(':') + 1);
        }
    }

    /**
     * net.minecraft.world.item.ItemStack as scripts see it: the kjs$ members of
     * dev.latvian.mods.kubejs.core.ItemStackKJS (javap, prefix stripped) plus the vanilla members
     * loot predicates use. NOT mirrored: everything else on the vanilla class.
     */
    public static final class ItemStack implements Jsonable {
        public static final ItemStack EMPTY = new ItemStack("minecraft:air", 0, null);
        final String id;
        int count;
        CompoundTag nbt;
        String rawSpec;

        ItemStack(String id, int count, CompoundTag nbt) {
            this.id = id;
            this.count = count;
            this.nbt = nbt;
        }

        // --- ItemStackKJS ---
        public String getId() {
            return id;
        }

        public ResourceLocation getIdLocation() {
            return new ResourceLocation(id);
        }

        public String getMod() {
            return id.substring(0, id.indexOf(':'));
        }

        public Collection<ResourceLocation> getTags() {
            List<ResourceLocation> out = new ArrayList<>();
            for (String t : TAGS_OF_ITEM.getOrDefault(id, Set.of())) {
                out.add(new ResourceLocation(t));
            }
            return out;
        }

        public boolean hasTag(ResourceLocation tag) {
            return TAGS_OF_ITEM.getOrDefault(id, Set.of()).contains(tag.toString());
        }

        public boolean isBlock() {
            return false;
        }

        public ItemStack withCount(int c) {
            if (isEmpty()) {
                return EMPTY;
            }
            ItemStack s = new ItemStack(id, c, nbt);
            s.rawSpec = rawSpec;
            return s;
        }

        public ItemStack withNBT(CompoundTag tag) {
            ItemStack s = new ItemStack(id, count, tag);
            s.rawSpec = rawSpec;
            return s;
        }

        public String getNbtString() {
            return String.valueOf(nbt);
        }

        public OutputItem withChance(double chance) {
            return OutputItem.of(this, chance);
        }

        public ItemStack withName(Component name) {
            return this;
        }

        public ItemStack withLore(Component[] lines) {
            return this;
        }

        /** kjs$enchantCopy, @RemapForJS("enchant"): returns an enchanted copy. */
        public ItemStack enchant(Enchantment enchantment, int level) {
            return this;
        }

        public ItemStack enchant(Map<?, ?> enchantments) {
            return this;
        }

        public ItemStack strongNBT() {
            return this;
        }

        public ItemStack weakNBT() {
            return this;
        }

        public ItemStack ignoreNBT() {
            return this;
        }

        // --- vanilla ItemStack (Mojang names) ---
        public boolean isEmpty() {
            return this == EMPTY || id.equals("minecraft:air") || count <= 0;
        }

        public int getCount() {
            return count;
        }

        public void setCount(int c) {
            this.count = c;
        }

        public Item getItem() {
            return new Item(id);
        }

        // KubeJS ItemStackMixin renames vanilla getTag() -> getNbt, setTag -> setNbt, hasTag() ->
        // hasNBT (javap -v, @RemapForJS). `stack.getTag` therefore does NOT exist for scripts: do
        // not add it here (two pack scripts were dead on exactly that name).
        public CompoundTag getNbt() {
            return nbt;
        }

        public void setNbt(CompoundTag tag) {
            this.nbt = tag;
        }

        public boolean hasNBT() {
            return nbt != null;
        }

        public ItemStack copy() {
            return isEmpty() ? EMPTY : new ItemStack(id, count, nbt);
        }

        @Override
        public String toString() {
            return (count > 1 ? count + " " : "") + id.substring(id.indexOf(':') + 1);
        }

        @Override
        public Object toJson() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", id);
            m.put("count", count);
            if (nbt != null) {
                m.put("nbt", nbt.raw);
            }
            return m;
        }

        /** KubeJS ItemStackJS.of (decompiled 2001.6.5): unknown id -> EMPTY, silently. */
        static ItemStack of(Object o) {
            o = unwrap(o);
            if (o == null) {
                return EMPTY;
            }
            if (o instanceof ItemStack s) {
                return s.isEmpty() ? EMPTY : s;
            }
            if (o instanceof OutputItem out) {
                return out.item;
            }
            if (o instanceof ResourceLocation r) {
                return byId(r.toString(), r.toString());
            }
            if (o instanceof NativeRegExp || o instanceof Pattern) {
                return first(new Ingredient("regex", o.toString(), UtilsRegex.parseRegex(o)), o.toString());
            }
            if (o instanceof CharSequence cs) {
                String os = cs.toString().trim();
                String s = os;
                int count = 1;
                int sp = s.indexOf(' ');
                if (sp >= 2 && s.indexOf('x') == sp - 1) {
                    count = Integer.parseInt(s.substring(0, sp - 1));
                    s = s.substring(sp + 1);
                }
                ItemStack st = parse(s, os);
                if (st.isEmpty()) {
                    return EMPTY;
                }
                st.count = count;
                return st;
            }
            if (o instanceof Map<?, ?> map) {
                if (map.containsKey("item")) {
                    String id = ResourceLocation.of(String.valueOf(unwrap(map.get("item")))).toString();
                    ItemStack st = byId(id, id);
                    if (st.isEmpty()) {
                        return EMPTY;
                    }
                    Object c = unwrap(map.get("count"));
                    if (c instanceof Number n) {
                        st.count = n.intValue();
                    }
                    if (map.containsKey("nbt")) {
                        st.nbt = CompoundTag.of(map.get("nbt"));
                    }
                    return st;
                }
                Object tag = unwrap(map.get("tag"));
                if (tag instanceof CharSequence t) {
                    return first(new Ingredient("tag", t.toString(), null), "#" + t);
                }
            }
            return EMPTY;
        }

        static ItemStack parse(String s, String raw) {
            if (s.isEmpty() || s.equals("-") || s.equals("air") || s.equals("minecraft:air")) {
                return EMPTY;
            }
            if (s.startsWith("#")) {
                return first(new Ingredient("tag", s.substring(1), null), raw);
            }
            if (s.startsWith("@")) {
                return first(new Ingredient("mod", s.substring(1), null), raw);
            }
            Pattern reg = UtilsRegex.regex(s);
            if (reg != null) {
                return first(new Ingredient("regex", s, reg), raw);
            }
            int sp = s.indexOf(' ');
            String id = sp == -1 ? s : s.substring(0, sp);
            ItemStack st = byId(new ResourceLocation(id).toString(), raw);
            if (st.isEmpty()) {
                return EMPTY;
            }
            if (sp != -1) {
                String tagStr = s.substring(sp + 1);
                if (tagStr.length() >= 2 && tagStr.charAt(0) == '{') {
                    st.nbt = CompoundTag.of(tagStr);
                }
            }
            return st;
        }

        static ItemStack byId(String id, String raw) {
            if (!ITEMS.contains(id)) {
                Map<String, Object> m = pos();
                m.put("id", id);
                m.put("raw", raw);
                m.put("phase", phase);
                unresolvedItems.add(m);
                return EMPTY;
            }
            ItemStack st = new ItemStack(id, 1, null);
            st.rawSpec = raw;
            return st;
        }

        static ItemStack first(Ingredient in, String raw) {
            List<String> ids = in.matching();
            if (ids.isEmpty()) {
                Map<String, Object> m = pos();
                m.put("id", raw);
                m.put("raw", raw);
                m.put("phase", phase);
                m.put("note", "ingredient matches no item");
                unresolvedItems.add(m);
                return EMPTY;
            }
            ItemStack st = new ItemStack(ids.get(0), 1, null);
            st.rawSpec = raw;
            return st;
        }
    }

    /** dev.latvian.mods.kubejs.item.OutputItem (decompiled): what ItemStack.withChance returns. */
    public static final class OutputItem implements Jsonable {
        public static final OutputItem EMPTY = new OutputItem(ItemStack.EMPTY, Double.NaN);
        public final ItemStack item;
        public final double chance;

        OutputItem(ItemStack item, double chance) {
            this.item = item;
            this.chance = chance;
        }

        /** OutputItem.of(ItemStack, double): an EMPTY stack returns the shared EMPTY (chance = NaN). */
        static OutputItem of(ItemStack item, double chance) {
            return item.isEmpty() ? EMPTY : new OutputItem(item, chance);
        }

        static OutputItem of(Object from) {
            from = unwrap(from);
            if (from instanceof OutputItem o) {
                return o;
            }
            if (from instanceof ItemStack s) {
                return of(s, Double.NaN);
            }
            ItemStack item = ItemStack.of(from);
            if (item.isEmpty()) {
                return EMPTY;
            }
            return new OutputItem(item, Double.NaN);
        }

        public OutputItem withCount(int count) {
            return new OutputItem(item.withCount(count), chance);
        }

        public OutputItem withChance(double c) {
            return new OutputItem(item.copy(), c);
        }

        public boolean hasChance() {
            return !Double.isNaN(chance);
        }

        public double getChance() {
            return chance;
        }

        public int getCount() {
            return item.getCount();
        }

        public CompoundTag getNbt() {
            return item.getNbt();
        }

        @Override
        public Object toJson() {
            return item.toJson();
        }
    }

    /** KubeJS UtilsJS.parseRegex / regex (decompiled): "/src/flags" strings and JS RegExp -> Pattern. */
    static final class UtilsRegex {
        static final Pattern REGEX_PATTERN = Pattern.compile("/(.*)/([a-z]*)");

        static Pattern parseRegex(Object o) {
            o = unwrap(o);
            if (o instanceof CharSequence || o instanceof NativeRegExp) {
                return regex(o.toString());
            }
            if (o instanceof Pattern p) {
                return p;
            }
            return null;
        }

        static Pattern regex(String string) {
            if (string.length() < 3) {
                return null;
            }
            Matcher matcher = REGEX_PATTERN.matcher(string);
            if (matcher.matches()) {
                int flags = 0;
                String f = matcher.group(2);
                for (int i = 0; i < f.length(); i++) {
                    switch (f.charAt(i)) {
                        case 'd' -> flags |= Pattern.UNIX_LINES;
                        case 'i' -> flags |= Pattern.CASE_INSENSITIVE;
                        case 'x' -> flags |= Pattern.COMMENTS;
                        case 'm' -> flags |= Pattern.MULTILINE;
                        case 's' -> flags |= Pattern.DOTALL;
                        case 'u' -> flags |= Pattern.UNICODE_CASE;
                        case 'U' -> flags |= Pattern.UNICODE_CHARACTER_CLASS;
                        default -> {
                        }
                    }
                }
                return Pattern.compile(matcher.group(1), flags);
            }
            return null;
        }
    }

    /**
     * A KubeJS ingredient reduced to how it TESTS a stack (decompiled IngredientJS.parse and the
     * forge ingredient classes): item = same item; tag = item tag member; mod = namespace equals;
     * regex = pattern.find() on the item id (find, not matches: unlike loot TABLE regexes).
     * KubeJSIngredient.isEmpty() is hard-wired false, so a tag/mod/regex that matches nothing is
     * never reported by LootJS: it is a silent no-op.
     */
    static final class Ingredient {
        final String kind;      // item | tag | mod | regex | or | wildcard | empty
        final String spec;
        final Pattern pattern;
        List<Ingredient> parts;

        Ingredient(String kind, String spec, Pattern pattern) {
            this.kind = kind;
            this.spec = spec;
            this.pattern = pattern;
        }

        static final Ingredient EMPTY = new Ingredient("empty", "", null);

        boolean isEmpty() {
            return this == EMPTY;
        }

        boolean test(ItemStack st) {
            if (st == null) {
                return false;
            }
            switch (kind) {
                case "item":
                    return !st.isEmpty() && st.id.equals(spec);
                case "tag":
                    return !st.isEmpty() && TAGS_OF_ITEM.getOrDefault(st.id, Set.of()).contains(spec);
                case "mod":
                    return st.getMod().equals(spec);
                case "regex":
                    return pattern.matcher(st.id).find();
                case "wildcard":
                    return !st.isEmpty();
                case "or":
                    for (Ingredient p : parts) {
                        if (p.test(st)) {
                            return true;
                        }
                    }
                    return false;
                default:
                    return false;
            }
        }

        List<String> matching() {
            List<String> out = new ArrayList<>();
            if (kind.equals("item")) {
                out.add(spec);
            } else if (kind.equals("tag")) {
                out.addAll(new TreeSet<>(ITEM_TAGS.getOrDefault(spec, Set.of())));
            } else {
                for (String id : new TreeSet<>(ITEMS)) {
                    if (test(new ItemStack(id, 1, null))) {
                        out.add(id);
                    }
                }
            }
            return out;
        }

        Object toJson() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("kind", kind);
            m.put("spec", spec);
            if (parts != null) {
                List<Object> l = new ArrayList<>();
                for (Ingredient p : parts) {
                    l.add(p.toJson());
                }
                m.put("parts", l);
            }
            return m;
        }

        /** IngredientJS.of. `dropped` collects list members that resolved to nothing (silently skipped). */
        static Ingredient of(Object o, List<String> dropped) {
            o = unwrap(o);
            if (o == null || o == ItemStack.EMPTY) {
                return EMPTY;
            }
            if (o instanceof ItemStack s) {
                return s.isEmpty() ? EMPTY : new Ingredient("item", s.id, null);
            }
            if (o instanceof OutputItem out) {
                return out.item.isEmpty() ? EMPTY : new Ingredient("item", out.item.id, null);
            }
            if (o instanceof NativeRegExp || o instanceof Pattern) {
                Pattern reg = UtilsRegex.parseRegex(o);
                return reg != null ? new Ingredient("regex", o.toString(), reg) : EMPTY;
            }
            if (o instanceof CharSequence cs) {
                return parse(cs.toString(), dropped);
            }
            if (o instanceof List<?> list) {
                List<Ingredient> in = new ArrayList<>();
                for (Object o1 : list) {
                    Ingredient x = of(o1, dropped);
                    if (x == EMPTY) {
                        if (dropped != null) {
                            dropped.add(String.valueOf(plain(o1)));
                        }
                        continue;
                    }
                    in.add(x);
                }
                if (in.isEmpty()) {
                    return EMPTY;
                }
                if (in.size() == 1) {
                    return in.get(0);
                }
                Ingredient or = new Ingredient("or", "", null);
                or.parts = in;
                return or;
            }
            if (o instanceof Map<?, ?> map) {
                if (map.containsKey("tag")) {
                    return new Ingredient("tag", String.valueOf(unwrap(map.get("tag"))), null);
                }
                if (map.containsKey("item")) {
                    ItemStack s = ItemStack.of(o);
                    return s.isEmpty() ? EMPTY : new Ingredient("item", s.id, null);
                }
                return EMPTY;
            }
            ItemStack s = ItemStack.of(o);
            return s.isEmpty() ? EMPTY : new Ingredient("item", s.id, null);
        }

        static Ingredient parse(String s, List<String> dropped) {
            if (s.isEmpty() || s.equals("-") || s.equals("air") || s.equals("minecraft:air")) {
                return EMPTY;
            }
            if (s.equals("*")) {
                return new Ingredient("wildcard", "*", null);
            }
            if (s.startsWith("#")) {
                return new Ingredient("tag", new ResourceLocation(s.substring(1)).toString(), null);
            }
            if (s.startsWith("@")) {
                return new Ingredient("mod", s.substring(1), null);
            }
            Pattern reg = UtilsRegex.regex(s);
            if (reg != null) {
                return new Ingredient("regex", s, reg);
            }
            String id = new ResourceLocation(s).toString();
            if (!ITEMS.contains(id)) {
                return EMPTY;
            }
            return new Ingredient("item", id, null);
        }
    }

    /** dev.latvian.mods.kubejs.bindings.ItemWrapper (the `Item` binding). */
    public static final class ItemWrapper {
        public static ItemStack of(ItemStack in) {
            return in;
        }

        public static ItemStack of(ItemStack in, int count) {
            return in.withCount(count);
        }

        public static ItemStack of(ItemStack in, CompoundTag tag) {
            return in.withNBT(tag);
        }

        public static ItemStack of(ItemStack in, int count, CompoundTag nbt) {
            return in.withNBT(nbt).withCount(count);
        }

        public static ItemStack withNBT(ItemStack in, CompoundTag nbt) {
            return in.withNBT(nbt);
        }

        public static ItemStack getEmpty() {
            return ItemStack.EMPTY;
        }

        public static boolean exists(ResourceLocation id) {
            return ITEMS.contains(id.toString());
        }

        public static boolean isItem(Object o) {
            return unwrap(o) instanceof ItemStack;
        }
    }

    /** `Platform` binding: only isLoaded is mirrored. */
    public static final class PlatformWrapper {
        public static boolean isLoaded(String modId) {
            return MODS.contains(modId);
        }

        public static boolean isForge() {
            return true;
        }

        public static boolean isFabric() {
            return false;
        }
    }

    // ------------------------------------------------------------------------------------------
    // LootJS 2.13.1 (signatures from the decompiled jar)
    // ------------------------------------------------------------------------------------------

    /** com.almostreliable.lootjs.core.LootContextType */
    public enum LootContextType {
        UNKNOWN, BLOCK, ENTITY, CHEST, FISHING, GIFT, PIGLIN_BARTER, ADVANCEMENT_ENTITY, ADVANCEMENT_REWARD
    }

    /** com.almostreliable.lootjs.filters.ResourceLocationFilter + LootJSPlugin.ofResourceLocationFilter. */
    public static final class ResourceLocationFilter implements Jsonable {
        final String kind;   // id | regex | or
        final String value;
        final Pattern pattern;
        final List<ResourceLocationFilter> parts;

        ResourceLocationFilter(String kind, String value, Pattern pattern, List<ResourceLocationFilter> parts) {
            this.kind = kind;
            this.value = value;
            this.pattern = pattern;
            this.parts = parts;
        }

        static ResourceLocationFilter of(Object o) {
            o = unwrap(o);
            if (o instanceof ResourceLocationFilter f) {
                return f;
            }
            if (o instanceof List<?> list) {
                List<ResourceLocationFilter> parts = new ArrayList<>();
                for (Object x : list) {
                    parts.add(of(x));
                }
                return new ResourceLocationFilter("or", "", null, parts);
            }
            Pattern pattern = UtilsRegex.parseRegex(o);
            if (pattern == null) {
                // new ResourceLocation(o.toString()): an invalid id throws here, in the script
                return new ResourceLocationFilter("id", new ResourceLocation(String.valueOf(o)).toString(), null, null);
            }
            return new ResourceLocationFilter("regex", pattern.pattern(), pattern, null);
        }

        @Override
        public Object toJson() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("kind", kind);
            if (kind.equals("or")) {
                m.put("parts", plain(parts));
            } else {
                m.put("value", value);
                if (pattern != null) {
                    m.put("flags", pattern.flags());
                }
            }
            return m;
        }
    }

    /** com.almostreliable.lootjs.filters.ItemFilter + LootJSPlugin's ItemFilter type wrapper. */
    public static class ItemFilter implements Jsonable {
        final int fid;
        final String kind;          // ingredient | custom | const | and | or | not | builtin | invalid
        final Ingredient ingredient;
        final Predicate<ItemStack> predicate;
        final List<ItemFilter> parts;
        final String label;
        final Map<String, Object> where;
        List<String> droppedListMembers;
        String invalidWarning;

        ItemFilter(String kind, Ingredient ingredient, Predicate<ItemStack> predicate, List<ItemFilter> parts, String label) {
            this.kind = kind;
            this.ingredient = ingredient;
            this.predicate = predicate;
            this.parts = parts;
            this.label = label;
            this.where = cx == null ? new LinkedHashMap<>() : pos();
            this.fid = filters.size();
            filters.add(this);
        }

        public static final ItemFilter ALWAYS_FALSE = new ItemFilter("const", null, null, null, "ALWAYS_FALSE");
        public static final ItemFilter ALWAYS_TRUE = new ItemFilter("const", null, null, null, "ALWAYS_TRUE");
        public static final ItemFilter SWORD = builtin("SWORD");
        public static final ItemFilter PICKAXE = builtin("PICKAXE");
        public static final ItemFilter AXE = builtin("AXE");
        public static final ItemFilter SHOVEL = builtin("SHOVEL");
        public static final ItemFilter HOE = builtin("HOE");
        public static final ItemFilter TOOL = builtin("TOOL");
        public static final ItemFilter POTION = builtin("POTION");
        public static final ItemFilter HAS_TIER = builtin("HAS_TIER");
        public static final ItemFilter PROJECTILE_WEAPON = builtin("PROJECTILE_WEAPON");
        public static final ItemFilter ARMOR = builtin("ARMOR");
        public static final ItemFilter WEAPON = builtin("WEAPON");
        public static final ItemFilter HEAD_ARMOR = builtin("HEAD_ARMOR");
        public static final ItemFilter CHEST_ARMOR = builtin("CHEST_ARMOR");
        public static final ItemFilter LEGS_ARMOR = builtin("LEGS_ARMOR");
        public static final ItemFilter FEET_ARMOR = builtin("FEET_ARMOR");
        public static final ItemFilter FOOD = builtin("FOOD");
        public static final ItemFilter DAMAGEABLE = builtin("DAMAGEABLE");
        public static final ItemFilter DAMAGED = builtin("DAMAGED");
        public static final ItemFilter ENCHANTABLE = builtin("ENCHANTABLE");
        public static final ItemFilter ENCHANTED = builtin("ENCHANTED");
        public static final ItemFilter BLOCK = builtin("BLOCK");

        static ItemFilter builtin(String n) {
            return new ItemFilter("builtin", null, null, null, n);
        }

        public static ItemFilter custom(Predicate<ItemStack> predicate) {
            return new ItemFilter("custom", null, predicate, null, "custom");
        }

        public static ItemFilter hasEnchantment(ResourceLocationFilter filter) {
            return new ItemFilter("builtin", null, null, null, "hasEnchantment(" + plain(filter) + ")");
        }

        public static ItemFilter hasEnchantment(ResourceLocationFilter filter, int min, int max) {
            return new ItemFilter("builtin", null, null, null, "hasEnchantment(" + plain(filter) + "," + min + "," + max + ")");
        }

        public static ItemFilter and(ItemFilter... itemFilters) {
            return new ItemFilter("and", null, null, Arrays.asList(itemFilters), "and");
        }

        public static ItemFilter or(ItemFilter... itemFilters) {
            return new ItemFilter("or", null, null, Arrays.asList(itemFilters), "or");
        }

        public static ItemFilter not(ItemFilter itemFilter) {
            return new ItemFilter("not", null, null, List.of(itemFilter), "not");
        }

        public ItemFilter and(ItemFilter other) {
            return new ItemFilter("and", null, null, List.of(this, other), "and");
        }

        public ItemFilter or(ItemFilter other) {
            return new ItemFilter("or", null, null, List.of(this, other), "or");
        }

        public ItemFilter negate() {
            return new ItemFilter("not", null, null, List.of(this), "not");
        }

        public boolean test(ItemStack st) {
            Boolean b = eval(st);
            return b != null && b;
        }

        /** null = cannot be decided without the game (builtin class checks). */
        Boolean eval(ItemStack st) {
            switch (kind) {
                case "const":
                    return label.equals("ALWAYS_TRUE");
                case "invalid":
                    return false;
                case "ingredient":
                    return ingredient.test(st);
                case "custom":
                    return predicate.test(st);
                case "and": {
                    boolean unknown = false;
                    for (ItemFilter f : parts) {
                        Boolean b = f.eval(st);
                        if (b == null) {
                            unknown = true;
                        } else if (!b) {
                            return false;
                        }
                    }
                    return unknown ? null : true;
                }
                case "or": {
                    boolean unknown = false;
                    for (ItemFilter f : parts) {
                        Boolean b = f.eval(st);
                        if (b == null) {
                            unknown = true;
                        } else if (b) {
                            return true;
                        }
                    }
                    return unknown ? null : false;
                }
                case "not": {
                    Boolean b = parts.get(0).eval(st);
                    return b == null ? null : !b;
                }
                default:
                    return null;
            }
        }

        /** LootJSPlugin.registerTypeWrappers(ItemFilter) + ofItemFilter (decompiled). */
        static ItemFilter wrap(Object o) {
            o = unwrap(o);
            if (o instanceof ItemFilter f) {
                return f;
            }
            if (o instanceof List<?> list) {
                List<ItemFilter> itemFilters = new ArrayList<>();
                List<Object> rest = new ArrayList<>();
                for (Object x : list) {
                    Object u = unwrap(x);
                    if (u instanceof ItemFilter f) {
                        itemFilters.add(f);
                    } else {
                        rest.add(x);
                    }
                }
                if (!rest.isEmpty()) {
                    List<String> dropped = new ArrayList<>();
                    Ingredient in = Ingredient.of(rest, dropped);
                    // ItemFilter.custom(ingredient): no emptiness check on this path, so a list of
                    // unknown ids becomes a filter that matches nothing, without any warning.
                    ItemFilter f = new ItemFilter("ingredient", in, null, null, String.valueOf(plain(rest)));
                    f.droppedListMembers = dropped;
                    itemFilters.add(f);
                }
                if (itemFilters.size() == 1) {
                    return itemFilters.get(0);
                }
                return new ItemFilter("or", null, null, itemFilters, "or");
            }
            return ofItemFilter(o);
        }

        static ItemFilter ofItemFilter(Object o) {
            Ingredient in = Ingredient.of(o, null);
            if (in.isEmpty()) {
                String msg = "LootJS: Invalid ingredient for filter: " + plain(o);
                warn(msg);
                ItemFilter f = new ItemFilter("invalid", null, null, null, String.valueOf(plain(o)));
                f.invalidWarning = msg;
                return f;
            }
            return new ItemFilter("ingredient", in, null, null, String.valueOf(plain(o)));
        }

        @Override
        public Object toJson() {
            return fid;
        }

        Object describe() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("fid", fid);
            m.put("kind", kind);
            m.put("label", label);
            m.put("where", where);
            if (ingredient != null) {
                m.put("ingredient", ingredient.toJson());
            }
            if (parts != null) {
                List<Object> l = new ArrayList<>();
                for (ItemFilter p : parts) {
                    l.add(p.fid);
                }
                m.put("parts", l);
            }
            if (droppedListMembers != null && !droppedListMembers.isEmpty()) {
                m.put("dropped_list_members", droppedListMembers);
            }
            if (invalidWarning != null) {
                m.put("invalid", invalidWarning);
            }
            return m;
        }
    }

    /** com.almostreliable.lootjs.filters.Resolver (biome / fluid): '#tag' or id. */
    public static final class Resolver implements Jsonable {
        final String raw;

        Resolver(String raw) {
            this.raw = raw;
        }

        static Resolver of(Object o) {
            o = unwrap(o);
            if (o instanceof Resolver r) {
                return r;
            }
            String s = String.valueOf(o);
            new ResourceLocation(s.startsWith("#") ? s.substring(1) : s);   // throws like the real one
            return new Resolver(s);
        }

        @Override
        public Object toJson() {
            return raw;
        }
    }

    /** A registry object argument that is only recorded (Enchantment, Potion, Block). */
    public static class RegRef implements Jsonable {
        final String raw;

        RegRef(String raw) {
            this.raw = raw;
        }

        @Override
        public Object toJson() {
            return raw;
        }
    }

    public static final class Enchantment extends RegRef {
        Enchantment(String raw) {
            super(raw);
        }
    }

    public static final class Potion extends RegRef {
        Potion(String raw) {
            super(raw);
        }
    }

    public static final class Block extends RegRef {
        Block(String raw) {
            super(raw);
        }
    }

    /** com.google.gson.JsonObject via KubeJS's MapJS.json wrapper (customFunction / customCondition). */
    public static final class JsonObject implements Jsonable {
        final Object data;

        JsonObject(Object data) {
            this.data = data;
        }

        static JsonObject of(Object o) {
            o = unwrap(o);
            if (o instanceof JsonObject j) {
                return j;
            }
            if (o instanceof Map<?, ?>) {
                return new JsonObject(plain(o));
            }
            return null;   // MapJS.json(non-map) == null -> the LootJS call NPEs in game
        }

        @Override
        public Object toJson() {
            return data;
        }
    }

    /** net.minecraft.network.chat.Component (anything -> text). */
    public static final class Component implements Jsonable {
        final String text;

        Component(String text) {
            this.text = text;
        }

        @Override
        public Object toJson() {
            return text;
        }
    }

    /** LootJS IntervalJS / MinMaxBounds stand-in. */
    public static final class Bounds implements Jsonable {
        final Object raw;

        Bounds(Object raw) {
            this.raw = raw;
        }

        @Override
        public Object toJson() {
            return raw;
        }
    }

    public enum EquipmentSlot {
        MAINHAND, OFFHAND, FEET, LEGS, CHEST, HEAD
    }

    /** com.almostreliable.lootjs.kube.LootConditionsContainer (every public default method). */
    public interface LootConditionsContainer<B> {
        B addCondition(Object condition);

        private B cond(String name, Object... args) {
            Map<String, Object> m = rec("cond");
            m.put("name", name);
            m.put("args", plain(args));
            m.putAll(pos());
            return addCondition(m);
        }

        default B matchLoot(ItemFilter filter) {
            return cond("matchLoot", filter);
        }

        default B matchLoot(ItemFilter filter, boolean exact) {
            return cond("matchLoot", filter, exact);
        }

        default B matchMainHand(ItemFilter filter) {
            return cond("matchMainHand", filter);
        }

        default B matchOffHand(ItemFilter filter) {
            return cond("matchOffHand", filter);
        }

        default B matchEquip(EquipmentSlot slot, ItemFilter filter) {
            return cond("matchEquip", String.valueOf(slot), filter);
        }

        default B survivesExplosion() {
            return cond("survivesExplosion");
        }

        default B timeCheck(long period, int min, int max) {
            return cond("timeCheck", period, min, max);
        }

        default B timeCheck(int min, int max) {
            return cond("timeCheck", min, max);
        }

        default B weatherCheck(Map<String, Boolean> map) {
            return cond("weatherCheck", map);
        }

        default B randomChance(float value) {
            return cond("randomChance", (double) value);
        }

        default B randomChanceWithLooting(float value, float looting) {
            return cond("randomChanceWithLooting", (double) value, (double) looting);
        }

        default B randomChanceWithEnchantment(Enchantment enchantment, float[] chances) {
            return cond("randomChanceWithEnchantment", enchantment, chances);
        }

        default B randomTableBonus(Enchantment enchantment, float[] chances) {
            return cond("randomTableBonus", enchantment, chances);
        }

        default B biome(Resolver... resolvers) {
            return cond("biome", (Object[]) resolvers);
        }

        default B anyBiome(Resolver... resolvers) {
            return cond("anyBiome", (Object[]) resolvers);
        }

        default B anyDimension(ResourceLocation... dimensions) {
            return cond("anyDimension", (Object[]) dimensions);
        }

        default B anyStructure(String[] idOrTags, boolean exact) {
            return cond("anyStructure", idOrTags, exact);
        }

        default B lightLevel(int min, int max) {
            return cond("lightLevel", min, max);
        }

        default B killedByPlayer() {
            return cond("killedByPlayer");
        }

        default B matchBlockState(Block block, Map<String, String> propertyMap) {
            return cond("matchBlockState", block, propertyMap);
        }

        default B matchFluid(Resolver resolver) {
            return cond("matchFluid", resolver);
        }

        default B matchEntity(Consumer<Object> action) {
            return cond("matchEntity", "<builder fn>");
        }

        default B matchKiller(Consumer<Object> action) {
            return cond("matchKiller", "<builder fn>");
        }

        default B matchDirectKiller(Consumer<Object> action) {
            return cond("matchDirectKiller", "<builder fn>");
        }

        default B matchPlayer(Consumer<Object> action) {
            return cond("matchPlayer", "<builder fn>");
        }

        default B matchDamageSource(Consumer<Object> action) {
            return cond("matchDamageSource", "<builder fn>");
        }

        default B distanceToKiller(Bounds bounds) {
            return cond("distanceToKiller", bounds);
        }

        default B customDistanceToPlayer(Consumer<Object> action) {
            return cond("customDistanceToPlayer", "<builder fn>");
        }

        default B playerPredicate(Predicate<Object> predicate) {
            return cond("playerPredicate", "<fn>");
        }

        default B entityPredicate(Predicate<Object> predicate) {
            return cond("entityPredicate", "<fn>");
        }

        default B killerPredicate(Predicate<Object> predicate) {
            return cond("killerPredicate", "<fn>");
        }

        default B directKillerPredicate(Predicate<Object> predicate) {
            return cond("directKillerPredicate", "<fn>");
        }

        default B blockEntityPredicate(Predicate<Object> predicate) {
            return cond("blockEntityPredicate", "<fn>");
        }

        default B hasAnyStage(String... stages) {
            return cond("hasAnyStage", (Object[]) stages);
        }

        default B not(Consumer<LootConditionsContainer<B>> action) {
            return nested("not", action);
        }

        default B or(Consumer<LootConditionsContainer<B>> action) {
            return nested("or", action);
        }

        default B and(Consumer<LootConditionsContainer<B>> action) {
            return nested("and", action);
        }

        private B nested(String name, Consumer<LootConditionsContainer<B>> action) {
            Conditions<B> c = new Conditions<>();
            action.accept(c);
            Map<String, Object> m = rec("cond");
            m.put("name", name);
            m.put("children", c.list);
            m.putAll(pos());
            return addCondition(m);
        }

        default B customCondition(JsonObject json) {
            if (json == null) {
                throw new NullPointerException("customCondition(json): argument is not a JS object");
            }
            return cond("customCondition", json);
        }
    }

    /** The anonymous LootConditionsContainer LootEntry.when / not / or / and hand to their callback. */
    public static final class Conditions<B> implements LootConditionsContainer<B> {
        final List<Object> list = new ArrayList<>();

        @Override
        @SuppressWarnings("unchecked")
        public B addCondition(Object condition) {
            list.add(condition);
            return (B) this;
        }
    }

    /** com.almostreliable.lootjs.loot.LootFunctionsContainer (every public default method). */
    public interface LootFunctionsContainer<F> {
        F addFunction(Object lootItemFunction);

        private F fn(String name, Object... args) {
            Map<String, Object> m = rec("func");
            m.put("name", name);
            m.put("args", plain(args));
            m.putAll(pos());
            return addFunction(m);
        }

        default F enchantRandomly() {
            return fn("enchantRandomly");
        }

        default F enchantRandomly(Enchantment[] enchantments) {
            return fn("enchantRandomly", (Object[]) enchantments);
        }

        default F enchantWithLevels(NumberProvider numberProvider) {
            return fn("enchantWithLevels", numberProvider, true);
        }

        default F enchantWithLevels(NumberProvider numberProvider, boolean allowTreasure) {
            return fn("enchantWithLevels", numberProvider, allowTreasure);
        }

        default F applyLootingBonus(NumberProvider numberProvider) {
            return fn("applyLootingBonus", numberProvider);
        }

        default F applyBinomialDistributionBonus(Enchantment enchantment, float probability, int n) {
            return fn("applyBinomialDistributionBonus", enchantment, (double) probability, n);
        }

        default F applyOreBonus(Enchantment enchantment) {
            return fn("applyOreBonus", enchantment);
        }

        default F applyBonus(Enchantment enchantment, int multiplier) {
            return fn("applyBonus", enchantment, multiplier);
        }

        default F simulateExplosionDecay() {
            return fn("simulateExplosionDecay");
        }

        default F smeltLoot() {
            return fn("smeltLoot");
        }

        default F damage(NumberProvider numberProvider) {
            return fn("damage", numberProvider);
        }

        default F addPotion(Potion potion) {
            return fn("addPotion", potion);
        }

        default F addAttributes(Consumer<Object> action) {
            return fn("addAttributes", "<builder fn>");
        }

        default F limitCount(NumberProvider numberProviderMin, NumberProvider numberProviderMax) {
            return fn("limitCount", numberProviderMin, numberProviderMax);
        }

        default F limitCount(NumberProvider numberProvider) {
            return fn("limitCount", numberProvider);
        }

        default F addLore(Component... components) {
            return fn("addLore", (Object[]) components);
        }

        default F replaceLore(Component... components) {
            return fn("replaceLore", (Object[]) components);
        }

        default F setName(Component component) {
            return fn("setName", component);
        }

        default F addNBT(CompoundTag tag) {
            return fn("addNBT", tag);
        }

        default F addNbt(CompoundTag tag) {
            return fn("addNBT", tag);
        }

        default F customFunction(JsonObject json) {
            if (json == null) {
                throw new NullPointerException("customFunction(json): argument is not a JS object");
            }
            return fn("customFunction", json);
        }

        default F functions(ItemFilter filter, Consumer<LootFunctionsContainer<F>> action) {
            Functions<F> inner = new Functions<>();
            action.accept(inner);
            Map<String, Object> m = rec("func");
            m.put("name", "functions");
            m.put("filter", filter.fid);
            m.put("children", inner.list);
            m.putAll(pos());
            return addFunction(m);
        }
    }

    public static final class Functions<F> implements LootFunctionsContainer<F> {
        final List<Object> list = new ArrayList<>();

        @Override
        @SuppressWarnings("unchecked")
        public F addFunction(Object f) {
            list.add(f);
            return (F) this;
        }
    }

    /** com.almostreliable.lootjs.loot.LootActionsContainer (every public default method). */
    public interface LootActionsContainer<A> {
        A addAction(Object action);

        private A add(String mode, LootEntry[] entries) {
            Map<String, Object> m = rec("add");
            m.put("mode", mode);
            m.put("entries", plain(entries));
            m.putAll(pos());
            return addAction(m);
        }

        default A addLoot(LootEntry... entries) {
            return add("DEFAULT", entries);
        }

        default A addAlternativesLoot(LootEntry... entries) {
            return add("ALTERNATIVES", entries);
        }

        default A addSequenceLoot(LootEntry... entries) {
            return add("SEQUENCE", entries);
        }

        default A addWeightedLoot(NumberProvider numberProvider, boolean allowDuplicateLoot, LootEntry[] poolEntries) {
            // WeightedAddLootAction: "Weighted list must have at least one item"
            if (poolEntries.length == 0) {
                throw new IllegalArgumentException("Weighted list must have at least one item");
            }
            Map<String, Object> m = rec("weighted");
            m.put("rolls", plain(numberProvider));
            m.put("allow_duplicates", allowDuplicateLoot);
            m.put("entries", plain(poolEntries));
            m.putAll(pos());
            return addAction(m);
        }

        default A addWeightedLoot(NumberProvider numberProvider, LootEntry[] poolEntries) {
            return addWeightedLoot(numberProvider, true, poolEntries);
        }

        default A addWeightedLoot(LootEntry[] poolEntries) {
            return addWeightedLoot(new ConstantValue(1), true, poolEntries);
        }

        default A removeLoot(ItemFilter filter) {
            Map<String, Object> m = rec("remove");
            m.put("filter", filter.fid);
            m.putAll(pos());
            return addAction(m);
        }

        default A replaceLoot(ItemFilter filter, LootEntry lootEntry) {
            return replaceLoot(filter, lootEntry, false);
        }

        default A replaceLoot(ItemFilter filter, LootEntry lootEntry, boolean preserveCount) {
            Map<String, Object> m = rec("replace");
            m.put("filter", filter.fid);
            m.put("entry", plain(lootEntry));
            m.put("preserve_count", preserveCount);
            m.putAll(pos());
            return addAction(m);
        }

        default A modifyLoot(ItemFilter filter, ModifyCallback callback) {
            Map<String, Object> m = rec("modify");
            m.put("filter", filter.fid);
            m.putAll(pos());
            return addAction(m);
        }

        default A triggerExplosion(float radius, boolean destroy, boolean fire) {
            Map<String, Object> m = rec("explosion");
            m.putAll(pos());
            return addAction(m);
        }

        default A triggerLightningStrike(boolean shouldDamage) {
            Map<String, Object> m = rec("lightning");
            m.putAll(pos());
            return addAction(m);
        }

        default A dropExperience(int amount) {
            Map<String, Object> m = rec("xp");
            m.put("amount", amount);
            m.putAll(pos());
            return addAction(m);
        }
    }

    /** ModifyLootAction.Callback */
    @FunctionalInterface
    public interface ModifyCallback {
        ItemStack modify(ItemStack stack);
    }

    /** com.almostreliable.lootjs.core.LootEntry */
    public static final class LootEntry implements LootFunctionsContainer<LootEntry>, Jsonable {
        final String kind;            // item | ingredient | json
        final ItemStack stack;
        final Ingredient ingredient;
        final Object json;
        final String raw;
        final Map<String, Object> where;
        final List<Object> functions = new ArrayList<>();
        final List<Object> conditions = new ArrayList<>();
        int weight = 1;
        final int eid;

        LootEntry(String kind, ItemStack stack, Ingredient ingredient, Object json, String raw) {
            this.kind = kind;
            this.stack = stack;
            this.ingredient = ingredient;
            this.json = json;
            this.raw = raw;
            this.where = pos();
            this.eid = entries.size();
            entries.add(this);
        }

        @Override
        public LootEntry addFunction(Object lootItemFunction) {
            functions.add(lootItemFunction);
            return this;
        }

        public boolean hasWeight() {
            return weight >= 1;
        }

        public int getWeight() {
            return weight;
        }

        public LootEntry withWeight(int weight) {
            this.weight = Math.max(1, weight);
            return this;
        }

        public LootEntry withChance(int chance) {
            return withWeight(chance);
        }

        public LootEntry when(Consumer<LootConditionsContainer<?>> action) {
            Conditions<Object> c = new Conditions<>();
            action.accept(c);
            conditions.addAll(c.list);
            return this;
        }

        @Override
        public Object toJson() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("eid", eid);
            m.put("kind", kind);
            m.put("raw", raw);
            if (stack != null) {
                m.put("id", stack.id);
                m.put("count", stack.count);
                m.put("empty", stack.isEmpty());
                if (stack.nbt != null) {
                    m.put("nbt", stack.nbt.raw);
                }
            }
            if (ingredient != null) {
                m.put("ingredient", ingredient.toJson());
                m.put("ingredient_matches", ingredient.matching().size());
            }
            if (json != null) {
                m.put("json", json);
            }
            m.put("weight", weight);
            m.put("conditions", conditions);
            m.put("functions", functions);
            m.put("file", where.get("file"));
            m.put("line", where.get("line"));
            return m;
        }
    }

    /** com.almostreliable.lootjs.kube.LootEntryWrapper (the `LootEntry` binding + type wrapper). */
    public static final class LootEntryWrapper {
        public static LootEntry of(Object o) {
            Object u = unwrap(o);
            if (u instanceof LootEntry e) {
                return e;
            }
            if (u instanceof CharSequence cs) {
                String s = cs.toString();
                if (s.startsWith("#") || s.startsWith("@")) {
                    Ingredient in = Ingredient.of(s, null);
                    return new LootEntry("ingredient", null, in, null, s);
                }
            }
            OutputItem out = OutputItem.of(u);
            int weight = Double.isNaN(out.getChance()) ? 1 : (int) out.getChance();
            String raw = String.valueOf(plain(u));
            return new LootEntry("item", out.item, null, null, raw).withWeight(weight);
        }

        public static LootEntry of(ItemStack in, int count) {
            return of(in.withCount(count));
        }

        public static LootEntry of(ItemStack in, CompoundTag nbt) {
            return of(in.withNBT(nbt));
        }

        public static LootEntry of(ItemStack in, int count, CompoundTag nbt) {
            return of(in.withCount(count).withNBT(nbt));
        }

        public static LootEntry ofJson(JsonObject json) {
            return new LootEntry("json", null, null, json == null ? null : json.data, "<json>");
        }

        public static LootEntry withChance(Object o, int chance) {
            return of(o).withChance(chance);
        }
    }

    /** com.almostreliable.lootjs.loot.GroupedLootBuilder (pool / group callback argument). */
    public static final class GroupedLootBuilder implements LootConditionsContainer<GroupedLootBuilder>,
            LootFunctionsContainer<GroupedLootBuilder>, LootActionsContainer<GroupedLootBuilder> {
        final List<Object> handlers = new ArrayList<>();
        Object rolls = new ConstantValue(1).toJson();

        public GroupedLootBuilder rolls(NumberProvider numberProvider) {
            this.rolls = numberProvider.toJson();
            return this;
        }

        @Override
        public GroupedLootBuilder addCondition(Object condition) {
            handlers.add(condition);
            return this;
        }

        @Override
        public GroupedLootBuilder addAction(Object action) {
            handlers.add(action);
            return this;
        }

        @Override
        public GroupedLootBuilder addFunction(Object f) {
            handlers.add(f);
            return this;
        }
    }

    /** com.almostreliable.lootjs.kube.builder.LootActionsBuilderJS */
    public static final class Builder implements LootConditionsContainer<Builder>, LootFunctionsContainer<Builder>,
            LootActionsContainer<Builder> {
        final List<Object> handlers = new ArrayList<>();
        final Map<String, Object> record;
        String logName;

        Builder(Map<String, Object> record) {
            this.record = record;
        }

        public Builder logName(String logName) {
            this.logName = logName;
            return this;
        }

        @Override
        public Builder addCondition(Object condition) {
            handlers.add(condition);
            return this;
        }

        @Override
        public Builder addAction(Object action) {
            handlers.add(action);
            return this;
        }

        @Override
        public Builder addFunction(Object f) {
            // LootActionsBuilderJS.addFunction -> LootItemFunctionWrapperAction: loot.replaceAll(fn),
            // i.e. the function is applied to EVERY stack in the drop, not to an entry.
            if (f instanceof Map<?, ?>) {
                @SuppressWarnings("unchecked") Map<String, Object> m = (Map<String, Object>) f;
                m.put("scope", "all_loot");
            }
            handlers.add(f);
            return this;
        }

        public Builder pool(Consumer<GroupedLootBuilder> callback) {
            return group(callback);
        }

        public Builder group(Consumer<GroupedLootBuilder> callback) {
            GroupedLootBuilder g = new GroupedLootBuilder();
            callback.accept(g);
            Map<String, Object> m = rec("group");
            m.put("rolls", g.rolls);
            m.put("handlers", g.handlers);
            m.putAll(pos());
            handlers.add(m);
            return this;
        }

        public Builder apply(Consumer<Object> action) {
            Map<String, Object> m = rec("apply");
            m.putAll(pos());
            handlers.add(m);
            return this;
        }

        public Builder playerAction(Consumer<Object> action) {
            Map<String, Object> m = rec("playerAction");
            m.putAll(pos());
            handlers.add(m);
            return this;
        }
    }

    /** LootModificationEventJS + LootModificationForgeEventJS */
    public static final class LootModificationEvent {
        private Builder newBuilder(String kind) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("idx", modifiers.size());
            m.put("kind", kind);
            m.putAll(pos());
            m.put("stack", stack());
            m.put("handler", currentHandler);
            Builder b = new Builder(m);
            modifiers.add(m);
            builders.add(b);
            return b;
        }

        public void enableLogging() {
            Map<String, Object> m = pos();
            m.put("call", "enableLogging");
            eventCalls.add(m);
        }

        public void disableLootModification(ResourceLocationFilter... filters) {
            if (filters.length == 0) {
                throw new IllegalArgumentException("No loot table were given.");
            }
            Map<String, Object> m = pos();
            m.put("call", "disableLootModification");
            m.put("filters", plain(filters));
            eventCalls.add(m);
        }

        public Builder addLootTableModifier(ResourceLocationFilter... filters) {
            if (filters.length == 0) {
                throw new IllegalArgumentException("No loot table were given.");
            }
            Builder b = newBuilder("table");
            b.record.put("targets", plain(filters));
            return b;
        }

        public Builder addLootTypeModifier(LootContextType... types) {
            if (types.length == 0) {
                throw new IllegalArgumentException("No loot type were given.");
            }
            Builder b = newBuilder("type");
            List<Object> l = new ArrayList<>();
            for (LootContextType t : types) {
                l.add(t == null ? null : t.name());
            }
            b.record.put("types", l);
            return b;
        }

        public Builder addBlockLootModifier(Object o) {
            if (unwrap(o) == null) {
                throw new NullPointerException();
            }
            Builder b = newBuilder("block");
            b.record.put("block", plain(o));
            return b;
        }

        public Builder addEntityLootModifier(EntityType... entities) {
            LinkedHashSet<EntityType> set = new LinkedHashSet<>();
            List<Object> raw = new ArrayList<>();
            List<Object> pigs = new ArrayList<>();
            for (EntityType e : entities) {
                if (e != null) {
                    set.add(e);
                    raw.add(e.raw);
                    if (e.pig) {
                        pigs.add(e.raw);
                    }
                }
            }
            if (set.isEmpty()) {
                throw new IllegalArgumentException("No valid entities given.");
            }
            Builder b = newBuilder("entity");
            List<Object> ids = new ArrayList<>();
            for (EntityType e : set) {
                ids.add(e.id);
            }
            b.record.put("entities", ids);
            b.record.put("entities_raw", raw);
            if (!pigs.isEmpty()) {
                b.record.put("pig_fallback", pigs);
            }
            return b;
        }

        public void disableWitherStarDrop() {
            call("disableWitherStarDrop");
        }

        public void disableCreeperHeadDrop() {
            call("disableCreeperHeadDrop");
        }

        public void disableSkeletonHeadDrop() {
            call("disableSkeletonHeadDrop");
        }

        public void disableZombieHeadDrop() {
            call("disableZombieHeadDrop");
        }

        public List<String> getGlobalModifiers() {
            return new ArrayList<>();
        }

        public void removeGlobalModifier(String... locationOrModIds) {
            Map<String, Object> m = pos();
            m.put("call", "removeGlobalModifier");
            m.put("args", plain(locationOrModIds));
            eventCalls.add(m);
        }

        private void call(String n) {
            Map<String, Object> m = pos();
            m.put("call", n);
            eventCalls.add(m);
        }
    }

    // ------------------------------------------------------------------------------------------
    // script-side bindings that are not Java classes in the game either
    // ------------------------------------------------------------------------------------------

    /** `console` (ConsoleJS): records every line with its source position. */
    public static final class Console {
        private void add(String level, Object msg) {
            Map<String, Object> m = pos();
            m.put("level", level);
            m.put("msg", String.valueOf(plain(msg)));
            m.put("phase", phase);
            console.add(m);
        }

        public void log(Object msg) {
            add("info", msg);
        }

        public void info(Object msg) {
            add("info", msg);
        }

        public void warn(Object msg) {
            add("warn", msg);
        }

        public void error(Object msg) {
            add("error", msg);
        }

        public void debug(Object msg) {
            add("debug", msg);
        }
    }

    /** `LootJS.modifiers(handler)`. */
    public static final class LootJSGroup {
        public void modifiers(Object handler) {
            Object h = handler;
            if (!(h instanceof dev.latvian.mods.rhino.Function)) {
                throw new IllegalArgumentException("LootJS.modifiers needs a function");
            }
            Map<String, Object> p = pos();
            handlerFns.add(new Object[]{h, p.get("file"), p.get("line")});
        }
    }

    /**
     * Stand-in for a binding the audit does not model (other event groups, NBT, AStages, classes
     * returned by Java.loadClass that are only used at drop time). It answers anything, so every
     * use DURING REGISTRATION is recorded and listed in the report: those are the places where the
     * mock, not the game, decided what happened.
     */
    public static final class Opaque extends BaseFunction {
        final String name;
        final boolean eventGroup;

        Opaque(String name, boolean eventGroup) {
            this.name = name;
            this.eventGroup = eventGroup;
        }

        @Override
        public String getClassName() {
            return "Opaque";
        }

        @Override
        public Object get(Context c, String key, Scriptable start) {
            if (key.equals("toString") || key.equals("valueOf")) {
                return super.get(c, key, start);
            }
            return new Opaque(name + "." + key, eventGroup);
        }

        @Override
        public boolean has(Context c, String key, Scriptable start) {
            return true;
        }

        @Override
        public Object call(Context c, Scriptable scope, Scriptable thisObj, Object[] args) {
            Map<String, Object> m = pos();
            m.put("name", name);
            m.put("phase", phase);
            if (eventGroup) {
                otherEvents.add(m);
                if (captureEvents.contains(name) && args.length > 0
                        && args[args.length - 1] instanceof dev.latvian.mods.rhino.Function) {
                    capturedHandlers.add(new Object[]{name, args[args.length - 1], m.get("file"), m.get("line")});
                }
                return Undefined.instance;
            }
            opaqueUses.add(m);
            return new Opaque(name + "()", false);
        }

        @Override
        public Scriptable construct(Context c, Scriptable scope, Object[] args) {
            Map<String, Object> m = pos();
            m.put("name", "new " + name);
            m.put("phase", phase);
            opaqueUses.add(m);
            return new Opaque(name + "()", false);
        }

        @Override
        public Object getDefaultValue(Context c, Class<?> hint) {
            return "[opaque " + name + "]";
        }

        @Override
        public String toString() {
            return "[opaque " + name + "]";
        }
    }

    static final Set<String> captureEvents = new HashSet<>();
    static final List<Object[]> capturedHandlers = new ArrayList<>();       // {event, fn, file, line}
    static final List<Map<String, Object>> recordedCalls = new ArrayList<>();
    static int currentCaptured = -1;

    /**
     * The event object handed to a captured non-loot handler (ServerEvents.recipes): it accepts any
     * call and records the call path with its arguments. Nothing is validated; the audit only reads
     * `event.remove(...)` filters and the outputs of added recipes from it.
     */
    public static final class Recorder extends BaseFunction {
        final String path;

        Recorder(String path) {
            this.path = path;
        }

        @Override
        public String getClassName() {
            return "Recorder";
        }

        @Override
        public Object get(Context c, String key, Scriptable start) {
            if (key.equals("toString") || key.equals("valueOf")) {
                return super.get(c, key, start);
            }
            return new Recorder(path + "." + key);
        }

        @Override
        public boolean has(Context c, String key, Scriptable start) {
            return true;
        }

        @Override
        public Object call(Context c, Scriptable scope, Scriptable thisObj, Object[] args) {
            Map<String, Object> m = pos();
            m.put("handler", currentCaptured);
            m.put("path", path);
            m.put("args", plain(args));
            recordedCalls.add(m);
            return new Recorder(path + "()");
        }

        @Override
        public Object getDefaultValue(Context c, Class<?> hint) {
            return "[recorder " + path + "]";
        }

        @Override
        public String toString() {
            return "[recorder " + path + "]";
        }
    }

    static final Map<String, Class<?>> KNOWN_CLASSES = new HashMap<>();

    static {
        KNOWN_CLASSES.put("net.minecraft.resources.ResourceLocation", ResourceLocation.class);
        KNOWN_CLASSES.put("net.minecraft.core.registries.BuiltInRegistries", BuiltInRegistries.class);
        KNOWN_CLASSES.put("net.minecraft.world.level.storage.loot.providers.number.UniformGenerator", UniformGenerator.class);
        KNOWN_CLASSES.put("net.minecraft.world.level.storage.loot.providers.number.ConstantValue", ConstantValue.class);
        KNOWN_CLASSES.put("com.almostreliable.lootjs.filters.ItemFilter", ItemFilter.class);
        KNOWN_CLASSES.put("com.almostreliable.lootjs.core.LootContextType", LootContextType.class);
        // what 00_icraft_guard.js loads: the JDK class it rethrows an exit with (real, so its self-test runs
        // here as it does in game and the handlers below are really guarded), and KubeJS's exit class
        KNOWN_CLASSES.put("java.util.Optional", java.util.Optional.class);
        KNOWN_CLASSES.put("dev.latvian.mods.kubejs.event.EventExit", EventExit.class);
    }

    /** Stand-in for dev.latvian.mods.kubejs.event.EventExit (what event.cancel() throws). Nothing here throws one. */
    public static final class EventExit extends Exception {
        public EventExit() {
            super("result");
        }
    }

    /** `Java.loadClass(name)`. */
    public static final class JavaBinding {
        public Object loadClass(String name) {
            Map<String, Object> m = pos();
            m.put("name", name);
            Class<?> c = KNOWN_CLASSES.get(name);
            m.put("mocked", c != null);
            loadClasses.add(m);
            if (c != null) {
                return new NativeJavaClass(cx, top, c);
            }
            return new Opaque(name, false);
        }
    }

    // ------------------------------------------------------------------------------------------
    // main
    // ------------------------------------------------------------------------------------------

    static List<String> lines(String path) throws Exception {
        List<String> out = new ArrayList<>();
        for (String l : Files.readAllLines(Path.of(path), StandardCharsets.UTF_8)) {
            String t = l.strip();
            if (!t.isEmpty()) {
                out.add(t);
            }
        }
        return out;
    }

    /** KubeJS ScriptFileInfo.preload: blank lines / import lines / `//` lines are emptied (line numbers kept). */
    static final Pattern PROPERTY_PATTERN = Pattern.compile("^(\\w+)\\s*[:=]?\\s*(-?\\w+)$");

    static String preload(Path p, Map<String, List<String>> props) throws Exception {
        String text = Files.readString(p, StandardCharsets.UTF_8);
        if (text.startsWith("﻿")) {
            text = text.substring(1);
        }
        String[] ls = text.split("\n", -1);
        for (int i = 0; i < ls.length; i++) {
            String raw = ls[i].endsWith("\r") ? ls[i].substring(0, ls[i].length() - 1) : ls[i];
            String t = raw.trim();
            if (t.isEmpty() || t.startsWith("import ")) {
                ls[i] = "";
                continue;
            }
            if (!t.startsWith("//")) {
                ls[i] = raw;
                continue;
            }
            Matcher m = PROPERTY_PATTERN.matcher(t.substring(2).trim());
            if (m.find()) {
                props.computeIfAbsent(m.group(1).trim(), k -> new ArrayList<>()).add(m.group(2).trim());
            }
            ls[i] = "";
        }
        return String.join("\n", ls);
    }

    static String describe(Throwable t) {
        if (t instanceof RhinoException r) {
            return r.getClass().getSimpleName() + ": " + r.details() + " (" + r.sourceName() + "#" + r.lineNumber() + ")";
        }
        return t.getClass().getSimpleName() + ": " + t.getMessage();
    }

    public static void main(String[] argv) throws Exception {
        Map<String, String> args = new HashMap<>();
        for (int i = 0; i + 1 < argv.length; i += 2) {
            args.put(argv[i], argv[i + 1]);
        }
        Path root = Path.of(args.get("--scripts-root"));
        List<String> files = lines(args.get("--files"));
        ITEMS = new HashSet<>(lines(args.get("--items")));
        ITEMS.add("minecraft:air");
        ENTITIES = new HashSet<>(lines(args.get("--entities")));
        MODS = new HashSet<>(lines(args.get("--mods")));
        if (args.containsKey("--tags")) {
            haveTags = true;
            for (String l : lines(args.get("--tags"))) {
                String[] kv = l.split("\t", 2);
                Set<String> members = new HashSet<>();
                if (kv.length > 1) {
                    for (String s : kv[1].split(",")) {
                        if (!s.isEmpty()) {
                            members.add(s);
                            TAGS_OF_ITEM.computeIfAbsent(s, k -> new HashSet<>()).add(kv[0]);
                        }
                    }
                }
                ITEM_TAGS.put(kv[0], members);
            }
        }
        List<String> universe = args.containsKey("--universe") ? lines(args.get("--universe")) : new ArrayList<>();
        List<String> stubGlobals = args.containsKey("--stub-globals") ? lines(args.get("--stub-globals")) : new ArrayList<>();
        List<String> opaqueBindings = args.containsKey("--opaque") ? lines(args.get("--opaque")) : new ArrayList<>();
        List<String> eventGroups = args.containsKey("--event-groups") ? lines(args.get("--event-groups")) : new ArrayList<>();
        if (args.containsKey("--pass-through")) {
            passThrough.addAll(lines(args.get("--pass-through")));
        }
        if (args.containsKey("--transparent")) {
            transparent.addAll(lines(args.get("--transparent")));
        }
        if (args.containsKey("--capture-events")) {
            captureEvents.addAll(lines(args.get("--capture-events")));
        }

        BuiltInRegistries.ENTITY_TYPE = new MockRegistry(ENTITIES, "minecraft:pig");
        BuiltInRegistries.ITEM = new MockRegistry(ITEMS, "minecraft:air");

        cx = Context.enter();
        top = cx.initStandardObjects();

        TypeWrappers tw = cx.getTypeWrappers();
        tw.registerSimple(ResourceLocation.class, ResourceLocation::of);
        tw.registerSimple(ResourceLocationFilter.class, ResourceLocationFilter::of);
        tw.registerSimple(ItemFilter.class, ItemFilter::wrap);
        tw.registerSimple(LootEntry.class, LootEntryWrapper::of);
        tw.registerSimple(ItemStack.class, ItemStack::of);
        tw.registerSimple(OutputItem.class, OutputItem::of);
        tw.registerSimple(NumberProvider.class, NumberProvider::of);
        tw.registerSimple(EntityType.class, EntityType::of);
        tw.registerSimple(CompoundTag.class, CompoundTag::of);
        tw.registerSimple(JsonObject.class, JsonObject::of);
        tw.registerSimple(Resolver.class, Resolver::of);
        tw.registerSimple(Component.class, o -> new Component(String.valueOf(plain(o))));
        tw.registerSimple(Bounds.class, o -> new Bounds(plain(o)));
        tw.registerSimple(Enchantment.class, o -> new Enchantment(String.valueOf(plain(o))));
        tw.registerSimple(Potion.class, o -> new Potion(String.valueOf(plain(o))));
        tw.registerSimple(Block.class, o -> new Block(String.valueOf(plain(o))));

        bind("LootJS", new LootJSGroup());
        bind("LootType", LootContextType.class);
        bind("ItemFilter", ItemFilter.class);
        bind("LootEntry", LootEntryWrapper.class);
        bind("Item", ItemWrapper.class);
        bind("Platform", PlatformWrapper.class);
        bind("Java", new JavaBinding());
        bind("console", new Console());
        NativeObject global = new NativeObject(cx);
        ScriptableObject.putProperty(top, "global", global, cx);
        for (String g : eventGroups) {
            if (!g.equals("LootJS")) {
                ScriptableObject.putProperty(top, g, new Opaque(g, true), cx);
            }
        }
        for (String g : opaqueBindings) {
            ScriptableObject.putProperty(top, g, new Opaque(g, false), cx);
        }
        for (String g : stubGlobals) {
            ScriptableObject.putProperty(global, g, new Opaque("global." + g, false), cx);
        }

        // --- load (KubeJS ScriptManager.load: one pack scope, files in order, a throwing file is logged and skipped)
        packScope = new NativeObject(cx);
        packScope.setParentScope(top);
        List<Map<String, Object>> loaded = new ArrayList<>();
        for (String rel : files) {
            currentFile = rel;
            Map<String, Object> info = new LinkedHashMap<>();
            info.put("file", rel);
            Map<String, List<String>> props = new HashMap<>();
            try {
                String src = preload(root.resolve(rel), props);
                info.put("properties", props);
                cx.evaluateString(packScope, src, rel, 1, null);
                info.put("ok", true);
            } catch (Throwable t) {
                info.put("ok", false);
                info.put("error", describe(t));
                Map<String, Object> e = new LinkedHashMap<>();
                e.put("file", rel);
                e.put("error", describe(t));
                scriptErrors.add(e);
            }
            loaded.add(info);
        }

        // --- post LootJS.modifiers (EventHandler.post: the first throwing handler ends the event)
        phase = "modifiers";
        LootModificationEvent event = new LootModificationEvent();
        Object jsEvent = Context.javaToJS(cx, event, top);
        Integer abortedAt = null;
        for (int i = 0; i < handlerFns.size(); i++) {
            Object[] h = handlerFns.get(i);
            currentHandler = i;
            currentFile = (String) h[1];
            Map<String, Object> info = new LinkedHashMap<>();
            info.put("index", i);
            info.put("file", h[1]);
            info.put("line", h[2]);
            if (abortedAt != null) {
                info.put("status", "not_run");
                handlers.add(info);
                continue;
            }
            int before = modifiers.size();
            try {
                ((dev.latvian.mods.rhino.Function) h[0]).call(cx, packScope, packScope, new Object[]{jsEvent});
                info.put("status", "ok");
            } catch (Throwable t) {
                info.put("status", "threw");
                info.put("error", describe(t));
                abortedAt = i;
            }
            info.put("modifiers", modifiers.size() - before);
            handlers.add(info);
        }
        currentHandler = -1;

        // --- afterPosted: suppliers run in order; a builder with no handlers throws and ends the loop
        phase = "register";
        boolean dead = false;
        Integer noActionsAt = null;
        for (int i = 0; i < builders.size(); i++) {
            Builder b = builders.get(i);
            Map<String, Object> m = b.record;
            m.put("handlers", b.handlers);
            if (b.logName != null) {
                m.put("log_name", b.logName);
            }
            if (!dead && b.handlers.isEmpty()) {
                dead = true;
                noActionsAt = i;
                m.put("no_actions", true);
            }
            m.put("registered", !dead);
        }

        // --- captured non-loot handlers (ServerEvents.recipes): run each against a call recorder
        phase = "captured";
        List<Map<String, Object>> capturedInfo = new ArrayList<>();
        for (int i = 0; i < capturedHandlers.size(); i++) {
            Object[] h = capturedHandlers.get(i);
            currentCaptured = i;
            currentFile = (String) h[2];
            Map<String, Object> info = new LinkedHashMap<>();
            info.put("index", i);
            info.put("event", h[0]);
            info.put("file", h[2]);
            info.put("line", h[3]);
            int before = recordedCalls.size();
            try {
                ((dev.latvian.mods.rhino.Function) h[1]).call(cx, packScope, packScope, new Object[]{new Recorder("event")});
                info.put("status", "ok");
            } catch (Throwable t) {
                info.put("status", "threw");
                info.put("error", describe(t));
            }
            info.put("calls", recordedCalls.size() - before);
            capturedInfo.add(info);
        }
        currentCaptured = -1;

        // --- evaluate item filters against the item universe (twice: Math.random forced low / high)
        phase = "filter-eval";
        // universe = every registered item (a filter that matches none of them is dead for certain);
        // --universe may add ids that are not in the registry list
        LinkedHashSet<String> uni = new LinkedHashSet<>(new TreeSet<>(ITEMS));
        uni.remove("minecraft:air");
        uni.addAll(universe);
        for (LootEntry e : entries) {
            if (e.stack != null && !e.stack.isEmpty()) {
                uni.add(e.stack.id);
            }
        }
        Map<String, Object> filterEval = new LinkedHashMap<>();
        Object mathObj = ScriptableObject.getProperty(top, "Math", cx);
        Object realRandom = ScriptableObject.getProperty((Scriptable) mathObj, "random", cx);
        // only filters a registered handler uses (Rhino builds extra ones while resolving overloads)
        Set<Integer> usedFilters = new HashSet<>();
        for (Builder b : builders) {
            collectFilters(b.handlers, usedFilters);
        }
        for (int guard = 0; guard < 8; guard++) {     // and / or / not parts
            int before = usedFilters.size();
            for (ItemFilter f : filters) {
                if (usedFilters.contains(f.fid) && f.parts != null) {
                    for (ItemFilter p : f.parts) {
                        usedFilters.add(p.fid);
                    }
                }
            }
            if (usedFilters.size() == before) {
                break;
            }
        }
        Map<String, Integer> sameIngredient = new HashMap<>();
        for (ItemFilter f : filters) {
            if (!usedFilters.contains(f.fid)) {
                continue;
            }
            if (f.kind.equals("builtin") || f.kind.equals("const") || f.kind.equals("invalid")) {
                continue;
            }
            if (f.kind.equals("ingredient")) {
                String sig = String.valueOf(f.ingredient.toJson());
                Integer first = sameIngredient.get(sig);
                if (first != null) {
                    Map<String, Object> ref = new LinkedHashMap<>();
                    ref.put("same_as", first);
                    filterEval.put(String.valueOf(f.fid), ref);
                    continue;
                }
                sameIngredient.put(sig, f.fid);
            }
            List<String> always = new ArrayList<>();
            List<String> chance = new ArrayList<>();
            List<String> unknown = new ArrayList<>();
            Map<String, Object> out = new LinkedHashMap<>();
            String firstErr = null;
            int errs = 0;
            for (String id : uni) {
                Boolean lo;
                Boolean hi;
                try {
                    setRandom(mathObj, 0.0);
                    lo = f.eval(new ItemStack(id, 1, null));
                    setRandom(mathObj, 0.999999);
                    hi = f.eval(new ItemStack(id, 1, null));
                } catch (Throwable t) {
                    errs++;
                    if (firstErr == null) {
                        firstErr = describe(t) + " on " + id;
                    }
                    continue;
                }
                if (lo == null || hi == null) {
                    unknown.add(id);
                } else if (lo && hi) {
                    always.add(id);
                } else if (lo || hi) {
                    chance.add(id);
                }
            }
            out.put("always", always);
            out.put("chance", chance);
            if (!unknown.isEmpty()) {
                out.put("unknown", unknown.size());
            }
            if (errs > 0) {
                out.put("errors", errs);
                out.put("first_error", firstErr);
            }
            // NBT-carrying add entries are evaluated with their NBT, separately
            List<Object> nbtHits = new ArrayList<>();
            for (LootEntry e : entries) {
                if (e.stack != null && !e.stack.isEmpty() && e.stack.nbt != null) {
                    try {
                        setRandom(mathObj, 0.0);
                        Boolean lo = f.eval(e.stack);
                        setRandom(mathObj, 0.999999);
                        Boolean hi = f.eval(e.stack);
                        if (Boolean.TRUE.equals(lo) || Boolean.TRUE.equals(hi)) {
                            nbtHits.add(e.eid);
                        }
                    } catch (Throwable ignored) {
                    }
                }
            }
            if (!nbtHits.isEmpty()) {
                out.put("nbt_entry_hits", nbtHits);
            }
            filterEval.put(String.valueOf(f.fid), out);
        }
        ScriptableObject.putProperty((Scriptable) mathObj, "random", realRandom, cx);

        // --- write
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("rhino", Context.class.getProtectionDomain().getCodeSource().getLocation().toString());
        out.put("files", loaded);
        out.put("script_errors", scriptErrors);
        out.put("handlers", handlers);
        out.put("event_aborted_at_handler", abortedAt);
        out.put("no_actions_at_modifier", noActionsAt);
        out.put("modifiers", modifiers);
        List<Object> fl = new ArrayList<>();
        for (ItemFilter f : filters) {
            fl.add(f.describe());
        }
        out.put("filters", fl);
        out.put("filter_eval", filterEval);
        out.put("universe_size", uni.size());
        out.put("have_tags", haveTags);
        out.put("event_calls", eventCalls);
        out.put("unresolved_items", unresolvedItems);
        out.put("warnings", warnings);
        out.put("console", console);
        out.put("load_classes", loadClasses);
        out.put("opaque_uses", opaqueUses);
        out.put("other_events", otherEvents);
        out.put("captured_handlers", capturedInfo);
        out.put("recorded_calls", recordedCalls);
        List<String> globals = new ArrayList<>();
        for (Object k : global.keySet()) {
            globals.add(String.valueOf(k));
        }
        out.put("globals", globals);
        StringBuilder sb = new StringBuilder(1 << 20);
        Json.write(out, sb);
        Files.writeString(Path.of(args.get("--out")), sb.toString(), StandardCharsets.UTF_8);

        long registered = modifiers.stream().filter(m -> Boolean.TRUE.equals(m.get("registered"))).count();
        System.out.println("[loot-harness] files=" + files.size() + " script_errors=" + scriptErrors.size()
                + " handlers=" + handlerFns.size() + (abortedAt != null ? " ABORTED_AT_HANDLER=" + abortedAt : "")
                + " modifiers=" + modifiers.size() + " registered=" + registered
                + (noActionsAt != null ? " NO_ACTIONS_AT_MODIFIER=" + noActionsAt : "")
                + " filters=" + filters.size() + " entries=" + entries.size()
                + " unresolved_items=" + unresolvedItems.size() + " warnings=" + warnings.size());
    }

    static void collectFilters(Object node, Set<Integer> out) {
        if (node instanceof Map<?, ?> m) {
            Object f = m.get("filter");
            if (f instanceof Integer i) {
                out.add(i);
            }
            for (Object v : m.values()) {
                collectFilters(v, out);
            }
        } else if (node instanceof Collection<?> c) {
            for (Object v : c) {
                collectFilters(v, out);
            }
        } else if (node instanceof ItemFilter f) {
            out.add(f.fid);
        }
    }

    static void setRandom(Object mathObj, double v) {
        ScriptableObject.putProperty((Scriptable) mathObj, "random", new BaseFunction() {
            @Override
            public Object call(Context c, Scriptable scope, Scriptable thisObj, Object[] args) {
                return v;
            }
        }, cx);
    }

    static void bind(String name, Object value) {
        if (value instanceof Class<?> c) {
            ScriptableObject.putProperty(top, name, new NativeJavaClass(cx, top, c), cx);
        } else {
            ScriptableObject.putProperty(top, name, Context.javaToJS(cx, value, top), cx);
        }
    }

    static final class Json {
        static void write(Object o, StringBuilder sb) {
            if (o == null) {
                sb.append("null");
            } else if (o instanceof String s) {
                str(s, sb);
            } else if (o instanceof Boolean || o instanceof Integer || o instanceof Long) {
                sb.append(o);
            } else if (o instanceof Number n) {
                double d = n.doubleValue();
                if (Double.isNaN(d) || Double.isInfinite(d)) {
                    sb.append("null");
                } else if (d == Math.rint(d) && Math.abs(d) < 1e15) {
                    sb.append((long) d);
                } else {
                    sb.append(d);
                }
            } else if (o instanceof Map<?, ?> m) {
                sb.append('{');
                boolean first = true;
                for (Map.Entry<?, ?> e : m.entrySet()) {
                    if (!first) {
                        sb.append(',');
                    }
                    first = false;
                    str(String.valueOf(e.getKey()), sb);
                    sb.append(':');
                    write(e.getValue(), sb);
                }
                sb.append('}');
            } else if (o instanceof Collection<?> c) {
                sb.append('[');
                boolean first = true;
                for (Object x : c) {
                    if (!first) {
                        sb.append(',');
                    }
                    first = false;
                    write(x, sb);
                }
                sb.append(']');
            } else if (o instanceof Jsonable j) {
                write(j.toJson(), sb);
            } else {
                str(String.valueOf(o), sb);
            }
        }

        static void str(String s, StringBuilder sb) {
            sb.append('"');
            for (int i = 0; i < s.length(); i++) {
                char c = s.charAt(i);
                switch (c) {
                    case '"' -> sb.append("\\\"");
                    case '\\' -> sb.append("\\\\");
                    case '\n' -> sb.append("\\n");
                    case '\r' -> sb.append("\\r");
                    case '\t' -> sb.append("\\t");
                    default -> {
                        if (c < 0x20) {
                            sb.append(String.format("\\u%04x", (int) c));
                        } else {
                            sb.append(c);
                        }
                    }
                }
            }
            sb.append('"');
        }
    }
}
