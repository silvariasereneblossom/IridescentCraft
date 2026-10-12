import dev.latvian.mods.kubejs.event.EventExit;
import dev.latvian.mods.kubejs.event.EventHandlerContainer;
import dev.latvian.mods.kubejs.event.EventJS;
import dev.latvian.mods.kubejs.event.EventResult;
import dev.latvian.mods.kubejs.event.IEventHandler;
import dev.latvian.mods.rhino.BaseFunction;
import dev.latvian.mods.rhino.Context;
import dev.latvian.mods.rhino.NativeJavaClass;
import dev.latvian.mods.rhino.NativeObject;
import dev.latvian.mods.rhino.Scriptable;
import dev.latvian.mods.rhino.ScriptableObject;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * kubejs/server_scripts/00_icraft_guard.js on KubeJS's REAL handler chain.
 *
 * What is real: the script engine (rhino-forge), and from the KubeJS jar EventJS (so event.cancel() /
 * success() / exit() throw the real EventExit), IEventHandler, and EventHandlerContainer, whose handle()
 * is the loop that leaves an event at the first handler that throws. A script function becomes a handler
 * exactly as EventHandler.call does it: Context.jsToJava(fn, IEventHandler.class), inside a script call.
 * What is not: there is no Minecraft, so the event is a bare EventJS and nothing is posted by the game.
 *
 *   GuardChain [--deny <class name>]... [--pass-through] <guard file> <cases file>
 *
 * The cases file declares chains of handlers with what must come out of handle():
 *   PASS                         every handler returned
 *   EXIT <TYPE> value=<v>        an EventExit left the chain (INTERRUPT_FALSE = cancel, INTERRUPT_TRUE = success,
 *                                INTERRUPT_DEFAULT = exit)
 *   ERROR <class name>           the chain was left on a failure: what KubeJS logs as "Error in '<event>'"
 * and the console lines that must / must not have been printed while it ran. One line per check;
 * `RESULT: N passed, M failed` at the end, exit code 1 when anything failed.
 *
 * --deny makes Java.loadClass fail for that class (what the guard does when its rethrow mechanism is not
 * there); --pass-through loads the guard with its PASS_THROUGH switch set.
 */
public class GuardChain {
    static Context cx;
    static Scriptable top;
    static final List<String> log = new ArrayList<>();
    static final Set<String> denied = new HashSet<>();
    static final Map<String, EventHandlerContainer> chains = new LinkedHashMap<>();

    public static class Console {
        public void log(Object o) { log.add("log: " + o); }
        public void info(Object o) { log.add("log: " + o); }
        public void warn(Object o) { log.add("warn: " + o); }
        public void error(Object o) { log.add("error: " + o); }
    }

    public static class JavaBinding {
        public Object loadClass(String name) throws Exception {
            if (denied.contains(name)) {
                throw new ClassNotFoundException(name + " (denied for this run)");
            }
            return new NativeJavaClass(cx, top, Class.forName(name));
        }
    }

    /** Java methods a handler can call: each throws from Java, through reflection, the way a game method does. */
    public static class Thrower {
        public void npe() { Object o = null; o.toString(); }
        public void checked() throws Exception { throw new java.io.IOException("a checked exception"); }
    }

    /**
     * rawThrow(kind): throws straight into the interpreter with no reflection in between, so nothing wraps it.
     * 'runtime' is the class of the Vec3 `.x` read (a RuntimeException from inside the engine: no script catch
     * sees it, finally blocks run); 'error' is a java.lang.Error (neither).
     */
    public static class RawThrow extends BaseFunction {
        @Override
        public Object call(Context c, Scriptable scope, Scriptable thisObj, Object[] args) {
            String kind = args.length > 0 ? String.valueOf(args[0]) : "runtime";
            if (kind.equals("error")) {
                throw new AbstractMethodError("an Error from inside the engine");
            }
            throw new IllegalStateException("a RuntimeException from inside the engine");
        }
    }

    /** listen(chain, fn): what EventHandler.call does with a script function. */
    public static class Listen extends BaseFunction {
        @Override
        public Object call(Context c, Scriptable scope, Scriptable thisObj, Object[] args) {
            String name = String.valueOf(args[0]);
            IEventHandler h = (IEventHandler) Context.jsToJava(c, args[1], IEventHandler.class);
            EventHandlerContainer chain = chains.get(name);
            if (chain == null) {
                chains.put(name, new EventHandlerContainer(null, h, "cases.js", 0));
            } else {
                chain.add(null, h, "cases.js", 0);
            }
            return null;
        }
    }

    public static class TestEvent extends EventJS {
        public final String id;
        public TestEvent(String id) { this.id = id; }
        public String getId() { return id; }
    }

    static String str(Scriptable o, String key) {
        Object v = ScriptableObject.getProperty(o, key, cx);
        return v == null ? "" : String.valueOf(v);
    }

    static List<String> strings(Scriptable o, String key) {
        List<String> out = new ArrayList<>();
        Object v = ScriptableObject.getProperty(o, key, cx);
        if (v instanceof Scriptable list) {
            int n = ((Number) ScriptableObject.getProperty(list, "length", cx)).intValue();
            for (int i = 0; i < n; i++) {
                out.add(String.valueOf(list.get(cx, i, list)));
            }
        }
        return out;
    }

    public static void main(String[] args) throws Throwable {
        boolean passThrough = false;
        List<String> files = new ArrayList<>();
        for (int i = 0; i < args.length; i++) {
            if (args[i].equals("--deny")) {
                denied.add(args[++i]);
            } else if (args[i].equals("--pass-through")) {
                passThrough = true;
            } else {
                files.add(args[i]);
            }
        }
        if (files.size() != 2) {
            System.out.println("usage: GuardChain [--deny <class>]... [--pass-through] <guard file> <cases file>");
            System.exit(2);
        }
        // The game touches EventResult before its nested Type; the other order trips a static-init cycle in
        // KubeJS (and would leave the class unusable for the whole JVM).
        if (EventResult.PASS == null) {
            throw new IllegalStateException();
        }
        cx = Context.enter();
        top = cx.initStandardObjects();
        ScriptableObject.putProperty(top, "console", Context.javaToJS(cx, new Console(), top), cx);
        ScriptableObject.putProperty(top, "Java", Context.javaToJS(cx, new JavaBinding(), top), cx);
        ScriptableObject.putProperty(top, "thrower", Context.javaToJS(cx, new Thrower(), top), cx);
        ScriptableObject.putProperty(top, "global", new NativeObject(cx), cx);
        ScriptableObject.putProperty(top, "listen", new Listen(), cx);
        ScriptableObject.putProperty(top, "rawThrow", new RawThrow(), cx);
        ScriptableObject.putProperty(top, "MODE", passThrough ? "pass-through" : (denied.isEmpty() ? "normal" : "deny"), cx);
        Scriptable scope = new NativeObject(cx);
        scope.setParentScope(top);

        int passed = 0;
        int failed = 0;
        String guard = Files.readString(Path.of(files.get(0)), StandardCharsets.UTF_8);
        if (passThrough) {
            String off = guard.replace("var PASS_THROUGH = false", "var PASS_THROUGH = true");
            if (off.equals(guard)) {
                System.out.println("FAIL  --pass-through: the guard file has no `var PASS_THROUGH = false` line to switch");
                failed++;
            }
            guard = off;
        }
        cx.evaluateString(scope, guard, "00_icraft_guard.js", 1, null);
        List<String> loadLog = new ArrayList<>(log);
        log.clear();
        ScriptableObject.putProperty(top, "LOAD_LOG", Context.javaToJS(cx, String.join("\n", loadLog), top), cx);
        cx.evaluateString(scope, Files.readString(Path.of(files.get(1)), StandardCharsets.UTF_8), "cases.js", 1, null);
        List<String> declareLog = new ArrayList<>(log);
        log.clear();

        Scriptable cases = (Scriptable) ScriptableObject.getProperty(scope, "CASES", cx);
        int n = ((Number) ScriptableObject.getProperty(cases, "length", cx)).intValue();
        for (int i = 0; i < n; i++) {
            Scriptable c = (Scriptable) cases.get(cx, i, cases);
            String name = str(c, "name");
            String expect = str(c, "expect");
            log.clear();
            String verdict;
            EventHandlerContainer chain = chains.get(name);
            if (chain == null) {
                verdict = "NO HANDLERS";
            } else {
                try {
                    EventResult r = chain.handle(new TestEvent(name), null);
                    verdict = String.valueOf(r.type());
                } catch (EventExit exit) {
                    Object val = exit.result.value();
                    if (val instanceof Throwable t) {
                        verdict = "ERROR " + t.getClass().getName();
                    } else {
                        verdict = "EXIT " + exit.result.type() + " value=" + val;
                    }
                } catch (Throwable t) {
                    verdict = "THREW " + t.getClass().getName() + ": " + t.getMessage();
                }
            }
            List<String> why = new ArrayList<>();
            if (!verdict.equals(expect)) {
                why.add("handle() gave `" + verdict + "`, expected `" + expect + "`");
            }
            String all = String.join("\n", log);
            for (String rx : strings(c, "logs")) {
                if (!Pattern.compile(rx).matcher(all).find()) {
                    why.add("no console line matches /" + rx + "/");
                }
            }
            for (String rx : strings(c, "absent")) {
                if (Pattern.compile(rx).matcher(all).find()) {
                    why.add("a console line matches /" + rx + "/ and must not");
                }
            }
            if (why.isEmpty()) {
                passed++;
                System.out.println("  ok    " + name + "  -> " + verdict);
            } else {
                failed++;
                System.out.println("  FAIL  " + name);
                for (String w : why) {
                    System.out.println("          " + w);
                }
                for (String l : log) {
                    System.out.println("          | " + (l.length() > 300 ? l.substring(0, 300) + "..." : l));
                }
            }
        }
        if (n == 0) {
            failed++;
            System.out.println("  FAIL  the cases file declared no case");
        }
        for (String l : declareLog) {
            if (l.startsWith("error: ")) {
                failed++;
                System.out.println("  FAIL  an error line while the cases were declared: " + l);
            }
        }
        System.out.println("RESULT: " + passed + " passed, " + failed + " failed");
        System.exit(failed == 0 ? 0 : 1);
    }
}
