import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import dev.latvian.mods.rhino.Context;
import dev.latvian.mods.rhino.JavaMembers;
import dev.latvian.mods.rhino.Scriptable;

import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

/**
 * MOCK HONESTY: a mock may only offer what the real class offers.
 *
 *   java MemberCheck truth/engine-members.json .out/jar-members.json harness/mock-map.json
 *
 * For every class nested in the mock holders (mk.W, mk.S, mk.A, mk.M, ...) it asks the production
 * Rhino build what a script would see on it (the same JavaMembers reflection the game uses, so
 * @RemapForJS, @RemapPrefixForJS and @HideFromJS on a mock act exactly as on a real class) and
 * compares, member by member, with the real class the mock stands in for:
 *
 *   name   the real class must have the name (on an instance, or as a static, as the mock has it);
 *   kind   a method stays a method, a property a property, and a name that is BOTH a field and a
 *          method on the real class (Vec3.x: a value read throws there) must be both on the mock;
 *   arity  every overload of a mock method has a real overload with the same number of arguments.
 *
 * The real side is truth/engine-members.json (recorded on a real Forge server, see run.py
 * real-engine) or, for a mod's own class that the bare server does not load, the jar's declared
 * public members (javap, gathered by run.py). A mock member that is test plumbing is allowed only
 * when it starts with `t_` or is listed, with its reason, under "harness" in mock-map.json; a mock
 * class that is in neither list fails the check, so a new mock cannot be added unchecked.
 *
 * NOT checked: argument types, return types, anonymous return objects, and what a member DOES.
 */
public class MemberCheck {
  static final Set<String> OBJECT_NAMES = new HashSet<>(Arrays.asList(
      "class", "equals", "getClass", "hashCode", "notify", "notifyAll", "toString", "wait"));

  static class Table {
    final Set<String> ids = new TreeSet<>(), sids = new TreeSet<>();
    final Map<String, Set<Integer>> methods = new HashMap<>(), smethods = new HashMap<>();
    final Set<String> fields = new HashSet<>(), sfields = new HashSet<>();
    String via = "engine";

    void addAll(Table o) {
      ids.addAll(o.ids); sids.addAll(o.sids); fields.addAll(o.fields); sfields.addAll(o.sfields);
      for (Map.Entry<String, Set<Integer>> e : o.methods.entrySet()) methods.computeIfAbsent(e.getKey(), k -> new TreeSet<>()).addAll(e.getValue());
      for (Map.Entry<String, Set<Integer>> e : o.smethods.entrySet()) smethods.computeIfAbsent(e.getKey(), k -> new TreeSet<>()).addAll(e.getValue());
      if (!o.via.equals("engine")) via = o.via;
    }
    /** M = method, P = property (field or bean), FM = a field and a method under one name */
    String kind(String name, boolean isStatic) {
      boolean m = (isStatic ? smethods : methods).containsKey(name);
      boolean f = (isStatic ? sfields : fields).contains(name);
      return m ? (f ? "FM" : "M") : "P";
    }
  }

  static List<String> words(JsonObject o, String key) {
    String s = o.has(key) ? o.get(key).getAsString() : "";
    return s.isEmpty() ? Collections.emptyList() : Arrays.asList(s.split(" "));
  }

  static Table fromJson(JsonObject c) {
    Table t = new Table();
    t.ids.addAll(words(c, "ids"));
    t.sids.addAll(words(c, "sids"));
    for (String m : words(c, "methods")) {
      boolean st = m.startsWith("!");
      if (st) m = m.substring(1);
      int p = m.indexOf('(');
      String name = m.substring(0, p);
      String params = m.substring(p + 1, m.length() - 1);
      int n = params.isEmpty() ? 0 : params.split(",").length;
      (st ? t.smethods : t.methods).computeIfAbsent(name, k -> new TreeSet<>()).add(n);
    }
    for (String f : words(c, "fields")) {
      if (f.startsWith("!")) t.sfields.add(f.substring(1)); else t.fields.add(f);
    }
    if (c.has("via")) t.via = c.get("via").getAsString();
    return t;
  }

  static Table fromMock(Context cx, Scriptable scope, Class<?> cls) {
    Table t = new Table();
    JavaMembers jm = JavaMembers.lookupClass(cx, scope, cls, cls, false);
    for (Object id : jm.getIds(false)) t.ids.add(String.valueOf(id));
    for (Object id : jm.getIds(true)) t.sids.add(String.valueOf(id));
    for (JavaMembers.MethodInfo mi : jm.getAccessibleMethods(cx, false)) {
      String name = (mi.name == null || mi.name.isEmpty()) ? mi.method.getName() : mi.name;
      boolean st = Modifier.isStatic(mi.method.getModifiers());
      (st ? t.smethods : t.methods).computeIfAbsent(name, k -> new TreeSet<>()).add(mi.method.getParameterCount());
    }
    for (JavaMembers.FieldInfo fi : jm.getAccessibleFields(cx, false)) {
      String name = (fi.name == null || fi.name.isEmpty()) ? fi.field.getName() : fi.name;
      if (Modifier.isStatic(fi.field.getModifiers())) t.sfields.add(name); else t.fields.add(name);
    }
    return t;
  }

  static void collect(Class<?> c, List<Class<?>> out) {
    out.add(c);
    for (Class<?> n : c.getDeclaredClasses()) collect(n, out);
  }

  public static void main(String[] args) throws Exception {
    JsonObject truth = JsonParser.parseString(new String(Files.readAllBytes(Paths.get(args[0])), StandardCharsets.UTF_8)).getAsJsonObject();
    JsonObject jars = JsonParser.parseString(new String(Files.readAllBytes(Paths.get(args[1])), StandardCharsets.UTF_8)).getAsJsonObject();
    JsonObject map = JsonParser.parseString(new String(Files.readAllBytes(Paths.get(args[2])), StandardCharsets.UTF_8)).getAsJsonObject();
    JsonObject engineClasses = truth.getAsJsonObject("classes");
    JsonObject jarClasses = jars.getAsJsonObject("classes");
    JsonObject jarMissing = jars.getAsJsonObject("missing");
    JsonObject mocks = map.getAsJsonObject("mocks");

    Context cx = Context.enter();
    Scriptable scope = cx.initStandardObjects();

    List<Class<?>> all = new ArrayList<>();
    for (JsonElement h : map.getAsJsonArray("holders")) collect(Class.forName(h.getAsString()), all);

    int engine = 0, jar = 0, harnessOnly = 0, checkedMembers = 0;
    List<String> fails = new ArrayList<>();
    List<String> unverified = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    Map<String, List<String>> allowedUsed = new TreeMap<>();

    for (Class<?> cls : all) {
      String name = cls.getName();
      seen.add(name);
      if (!mocks.has(name)) {
        fails.add(name + ": not in harness/mock-map.json. Say which real class it stands in for (\"real\"), or that it is test plumbing (\"harness-class\").");
        continue;
      }
      JsonObject spec = mocks.getAsJsonObject(name);
      if (spec.has("harness-class")) { harnessOnly++; continue; }

      // the real side: every class named in "real", merged
      Table real = new Table();
      boolean known = true;
      List<String> realNames = new ArrayList<>();
      for (JsonElement r : spec.getAsJsonArray("real")) {
        String rn = r.getAsString();
        realNames.add(rn);
        if (engineClasses.has(rn)) real.addAll(fromJson(engineClasses.getAsJsonObject(rn)));
        else if (jarClasses.has(rn)) real.addAll(fromJson(jarClasses.getAsJsonObject(rn)));
        else {
          known = false;
          if (spec.has("jar")) unverified.add(name + " -> " + rn + " (" + (jarMissing.has(rn) ? jarMissing.get(rn).getAsString() : "jar not read") + ")");
          else fails.add(name + ": real class " + rn + " is not in truth/engine-members.json. Add it to truth/classes.txt and run `run.py real-engine record`.");
        }
      }
      if (!known) continue;
      if (real.via.equals("engine")) engine++; else jar++;

      // members the map allows as test plumbing: this class's and its mock superclasses'
      Map<String, String> allowed = new LinkedHashMap<>();
      for (Class<?> k = cls; k != null && k != Object.class; k = k.getSuperclass()) {
        if (mocks.has(k.getName()) && mocks.getAsJsonObject(k.getName()).has("harness")) {
          for (Map.Entry<String, JsonElement> e : mocks.getAsJsonObject(k.getName()).getAsJsonObject("harness").entrySet()) allowed.putIfAbsent(e.getKey(), e.getValue().getAsString());
        }
      }

      Table mock = fromMock(cx, scope, cls);
      for (int pass = 0; pass < 2; pass++) {
        boolean st = pass == 1;
        Set<String> mockIds = st ? mock.sids : mock.ids;
        Set<String> realIds = st ? real.sids : real.ids;
        for (String id : mockIds) {
          if (id.startsWith("t_") || OBJECT_NAMES.contains(id)) continue;
          if (allowed.containsKey(id)) { allowedUsed.computeIfAbsent(name, k -> new ArrayList<>()).add(id); continue; }
          checkedMembers++;
          String where = name + (st ? " static " : ".") + id;
          if (!realIds.contains(id)) {
            // a real static is reachable from an instance too (Rhino falls back to the static table)
            if (!st && real.sids.contains(id)) continue;
            fails.add(where + ": the real " + String.join(" / ", realNames) + " has no such " + (st ? "static" : "member") + " for a script");
            continue;
          }
          String mk = mock.kind(id, st), rk = real.kind(id, st);
          if (!mk.equals(rk)) {
            fails.add(where + ": the mock offers it as " + kindName(mk) + ", on the real class it is " + kindName(rk));
            continue;
          }
          if (mk.equals("M") || mk.equals("FM")) {
            Set<Integer> ma = (st ? mock.smethods : mock.methods).get(id);
            Set<Integer> ra = (st ? real.smethods : real.methods).get(id);
            for (Integer n : ma) {
              if (!ra.contains(n)) fails.add(where + "(" + n + " argument" + (n == 1 ? "" : "s") + "): the real overloads take " + ra + " arguments");
            }
          }
        }
      }
    }
    for (String k : mocks.keySet()) {
      if (!seen.contains(k)) fails.add(k + ": listed in mock-map.json but there is no such mock class (stale entry)");
    }

    for (String f : fails) System.out.println("  FAIL  " + f);
    for (String u : unverified) System.out.println("  not verified here: " + u);
    if (args.length > 3 && args[3].equals("--allowed")) {
      for (Map.Entry<String, List<String>> e : allowedUsed.entrySet()) System.out.println("  test plumbing on " + e.getKey() + ": " + String.join(", ", e.getValue()));
    }
    System.out.println("RESULT: " + all.size() + " mock classes: " + engine + " against the engine's tables, " + jar + " against their jar, "
        + harnessOnly + " test plumbing" + (unverified.isEmpty() ? "" : ", " + unverified.size() + " NOT verified (jar not on this machine)")
        + "; " + checkedMembers + " members checked, " + fails.size() + " dishonest");
    System.exit(fails.isEmpty() ? 0 : 1);
  }

  static String kindName(String k) {
    return k.equals("M") ? "a method" : k.equals("FM") ? "a field AND a method (a value read throws on the engine)" : "a property";
  }
}
