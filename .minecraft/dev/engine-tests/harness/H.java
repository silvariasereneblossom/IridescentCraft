import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import dev.latvian.mods.rhino.Context;
import dev.latvian.mods.rhino.NativeJavaClass;
import dev.latvian.mods.rhino.Scriptable;
import dev.latvian.mods.rhino.ScriptableObject;
import dev.latvian.mods.rhino.util.wrap.TypeWrappers;

import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * The one harness of dev/engine-tests: loads .js files, in order, into a scope of the PRODUCTION
 * Rhino build (the rhino-forge jar the game runs) over the mk.* mocks. Driven by run.py.
 *
 *   java H [--truth truth.json] [--snap out.txt] [--pack-root dir] [--probe-json file] a1.js a2.js [-- b1.js b2.js ...]
 *
 * "--" starts a NEW scope (so two versions of the same scripts can be loaded side by side); the
 * scopes share one Host, whose `stash` map carries values (functions included) to the next scope.
 * The type wrappers registered here are the ones KubeJS registers in game (String; CharSequence;
 * registry objects by id; ItemStack; BlockPos; ResourceLocation; UUID; Component). Suite mock-facts
 * compares what scripts get here with what the real engine answered, which is how a missing wrapper shows.
 *
 * --truth: the member tables read from the real engine (truth/engine-members.json). A prelude asks
 * the Host about them (truthHas / truthEvent) so that a script-side mock (an event object built in
 * JS, an event name) can be held to the same rule as the Java mocks: only what the engine has.
 * --snap: every Host.snap(line) is written there (the golden-snapshot facility).
 * --pack-root: the .minecraft folder of the pack under test. A script's JsonIO.readString('kubejs/...') reads
 * its file from there (Host.readJsonText), as KubeJS resolves such a path against the game directory.
 * --probe-json: the file the JsonIO engine facts read; served as kubejs/icraft_engine_probe.json.
 *
 * Exit code: 0 ok, 1 a check failed (Host.fail()), 2 a file did not load.
 */
public class H {
  public static class Host {
    Context cx;
    Scriptable scope;
    PrintWriter snap;
    JsonObject truth;
    final Map<String, String> aliases = new HashMap<>();
    final Map<String, Set<String>> truthIds = new HashMap<>();
    final Map<String, String> facts = new HashMap<>();
    public final Map<String, Object> stash = new HashMap<>();
    java.nio.file.Path packRoot;
    java.nio.file.Path probeJson;
    public int failures = 0;

    public void print(Object s) { System.out.println(String.valueOf(s)); }
    public void fail() { failures++; }
    /** one line of the suite's observable output (written only when run.py records or checks a snapshot) */
    public void snap(Object line) { if (snap != null) snap.println(String.valueOf(line)); }
    public boolean snapping() { return snap != null; }

    /** Java.loadClass in a prelude: a real class name the prelude has mapped to a mock, or a mock by its own name. */
    public void alias(String realName, String mockName) { aliases.put(realName, mockName); }
    public Object loadClass(String name) throws Exception {
      String target = aliases.containsKey(name) ? aliases.get(name) : name;
      if (!target.startsWith("mk.") && !REAL.contains(target)) throw new ClassNotFoundException(name + " (not mapped to a mock)");
      return new NativeJavaClass(cx, scope, Class.forName(target));
    }
    /**
     * Classes a script may load under their own name: what kubejs/server_scripts/00_icraft_guard.js loads.
     * java.util.Optional is the JDK's own (the guard throws an exit again through Optional.orElseThrow, and
     * tries that once when it loads), and EventExit is the stand-in that carries the real class's name.
     * java.util.UUID is the JDK's own too: skills/justleveling_skills.js loads it next to the Player class, and
     * without it that script registers neither of its hurt handlers (suite hit-table).
     */
    static final java.util.Set<String> REAL = java.util.Set.of("java.util.Optional", "java.util.UUID", "dev.latvian.mods.kubejs.event.EventExit");
    public String load(String path) {
      try {
        String src = new String(Files.readAllBytes(Paths.get(path)), StandardCharsets.UTF_8);
        cx.evaluateString(scope, src, Paths.get(path).getFileName().toString(), 1, null);
        return "";
      } catch (Throwable t) {
        return String.valueOf(t);
      }
    }

    /** "" when the source compiles on this engine's parser, else the error (nothing is executed). */
    public String compiles(String source) {
      try { cx.compileString(source, "snippet.js", 1, null); return ""; } catch (Throwable t) { return String.valueOf(t); }
    }
    /** Runs the source in this scope and returns "" or the Java-side error: for failures no script catch can see. */
    public String runs(String source) {
      try { cx.evaluateString(scope, source, "snippet.js", 1, null); return ""; } catch (Throwable t) { return String.valueOf(t); }
    }
    /** A value typed String on the Java side, as a script receives it from any Java method. */
    public String javaString(String s) { return new String(s); }
    /** the recorded answer of the real engine to an engine fact (truth/engine-facts.txt), or null */
    public String fact(String label) { return facts.get(label); }

    // ---- JsonIO.readString ------------------------------------------------------------------------
    /** the name the probe file has on the real-engine probe server (real-engine/run_real_engine.sh) */
    static final String PROBE_NAME = "kubejs/icraft_engine_probe.json";
    /**
     * What KubeJS's JsonIO.readString(path) gives a script, with the same two calls (read from the bytecode of
     * kubejs-forge 2001.6.5): the file parsed by Gson's JsonParser.parseReader, or null when it is no regular file,
     * printed by Rhino's own JsonUtils.toString (the class is in the Rhino jar this harness runs on). `path` is
     * relative to the game directory there and to --pack-root here. Suite mock-facts holds the answers to the engine's.
     */
    public String readJsonText(String path) throws Exception {
      java.nio.file.Path p;
      if (PROBE_NAME.equals(path)) p = probeJson;
      else p = (packRoot == null) ? null : packRoot.resolve(path).normalize();
      if (p == null) throw new java.io.IOException("the harness was started without --pack-root / --probe-json: " + path);
      if (packRoot != null && !PROBE_NAME.equals(path) && !p.startsWith(packRoot)) throw new java.io.IOException("You can't access files outside Minecraft directory!");
      JsonElement json = null;
      if (Files.isRegularFile(p)) {
        try (java.io.BufferedReader r = Files.newBufferedReader(p)) { json = JsonParser.parseReader(r); }
      }
      return dev.latvian.mods.rhino.mod.util.JsonUtils.toString(json);
    }

    // ---- the real engine's member tables ------------------------------------------------------
    public boolean hasTruth() { return truth != null; }
    private Set<String> ids(String cls, boolean isStatic) {
      String key = (isStatic ? "!" : "") + cls;
      Set<String> s = truthIds.get(key);
      if (s == null) {
        JsonObject classes = truth.getAsJsonObject("classes");
        if (!classes.has(cls)) return null;
        JsonObject c = classes.getAsJsonObject(cls);
        s = new HashSet<>(Arrays.asList(c.get(isStatic ? "sids" : "ids").getAsString().split(" ")));
        truthIds.put(key, s);
      }
      return s;
    }
    /** "yes" / "no" / "unknown class": does a script see `member` on an instance (or on the class, isStatic) of cls? */
    public String truthHas(String cls, String member, boolean isStatic) {
      if (truth == null) return "no truth file";
      Set<String> s = ids(cls, isStatic);
      if (s == null) return "unknown class";
      return s.contains(member) ? "yes" : "no";
    }
    /** the Java class KubeJS delivers to handlers of e.g. "EntityEvents.hurt", or null when there is no such event */
    public String truthEvent(String groupDotName) {
      if (truth == null) return null;
      JsonElement e = truth.getAsJsonObject("events").get(groupDotName);
      return e == null ? null : e.getAsString();
    }

    // ---- the spawn-buff stand-ins ---------------------------------------------------------------
    public mk.M.Level level() { return mk.M.level(); }
    public mk.M.Living living(String typeId, double baseHealth, mk.M.Level level) { return mk.M.living(typeId, baseHealth, level); }
    public mk.M.PBWither pbWither(String typeId, double baseHealth, mk.M.Level level, int lvl) { return mk.M.pbWither(typeId, baseHealth, level, lvl); }
  }

  public static void main(String[] args) throws Exception {
    Context cx = Context.enter();
    TypeWrappers tw = cx.getTypeWrappers();
    tw.registerSimple(String.class, String::valueOf);
    // KubeJS registers CharSequence too (BuiltinKubeJSPlugin.registerTypeWrappers). Without it a regex passed to a
    // Java String method is an ambiguous-overload error here, where the game silently takes it as literal text.
    tw.registerSimple(CharSequence.class, String::valueOf);
    tw.registerSimple(mk.W.Attr.class, mk.W.Attr::of);
    tw.registerSimple(mk.W.RL.class, o -> (o instanceof mk.W.RL) ? (mk.W.RL) o : new mk.W.RL(String.valueOf(o)));   // KubeJS: ResourceLocation <- UtilsJS.getMCID
    tw.registerSimple(mk.W.Effect.class, mk.W.Effect::of);
    tw.registerSimple(mk.W.Stack.class, mk.W.Stack::of);
    tw.registerSimple(mk.W.BlockPos.class, mk.W.BlockPos::of);
    tw.registerSimple(mk.W.EntityType.class, mk.W.EntityType::of);
    tw.registerSimple(mk.S.Color.class, mk.S.Color::of);
    tw.registerSimple(java.util.UUID.class, o -> (o instanceof java.util.UUID) ? (java.util.UUID) o : java.util.UUID.fromString(String.valueOf(o)));   // KubeJS: UUIDWrapper::fromString
    tw.registerSimple(mk.S.Comp.class, mk.S.Text::of);   // KubeJS: Component / MutableComponent -> TextWrapper::of
    tw.registerSimple(mk.M.Attribute.class, mk.M.Attribute::of);   // KubeJS: registry objects by id

    Host host = new Host();
    host.cx = cx;
    ScriptableObject scope = null;
    int loadFails = 0;
    for (int i = 0; i < args.length; i++) {
      String f = args[i];
      if (f.equals("--truth")) { host.truth = JsonParser.parseString(new String(Files.readAllBytes(Paths.get(args[++i])), StandardCharsets.UTF_8)).getAsJsonObject(); continue; }
      if (f.equals("--facts")) {
        for (String line : Files.readAllLines(Paths.get(args[++i]), StandardCharsets.UTF_8)) {
          int p = line.indexOf(" :: ");
          if (p > 0 && !line.startsWith("#")) host.facts.put(line.substring(0, p), line.substring(p + 4));
        }
        continue;
      }
      if (f.equals("--pack-root")) { host.packRoot = Paths.get(args[++i]).toAbsolutePath().normalize(); continue; }
      if (f.equals("--probe-json")) { host.probeJson = Paths.get(args[++i]).toAbsolutePath().normalize(); continue; }
      if (f.equals("--snap")) { host.snap = new PrintWriter(Files.newBufferedWriter(Paths.get(args[++i]), StandardCharsets.UTF_8)); continue; }
      if (scope == null || f.equals("--")) {
        scope = cx.initStandardObjects();
        host.scope = scope;
        ScriptableObject.putProperty(scope, "__host", Context.javaToJS(cx, host, scope), cx);
        if (f.equals("--")) continue;
      }
      String src = new String(Files.readAllBytes(Paths.get(f)), StandardCharsets.UTF_8);
      try {
        cx.evaluateString(scope, src, Paths.get(f).getFileName().toString(), 1, null);
      } catch (Throwable t) {
        loadFails++;
        System.out.println("!! LOAD FAIL " + f + ": " + t);
      }
    }
    if (host.snap != null) host.snap.close();
    if (loadFails > 0) System.exit(2);
    if (host.failures > 0) System.exit(1);
  }
}
