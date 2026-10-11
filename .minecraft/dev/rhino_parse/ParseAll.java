import dev.latvian.mods.rhino.Context;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Compile (do not run) every .js file under the given directories with the pack's REAL script
 * parser, the KubeJS Rhino fork. `node --check` accepts syntax this engine rejects (`catch {`,
 * spread, default parameters, `??`, ...); one such file aborts on load and takes its features
 * with it. Exit code 1 if any file fails to compile.
 *
 * The Rhino jar is the one the game runs: rhino-forge-2001.2.3-build.*.jar in the PrismLauncher
 * instance's mods folder. From the repo's .minecraft folder (PowerShell):
 *
 *   $rhino = (Get-ChildItem "$env:APPDATA\PrismLauncher\instances\IridescentCraft\.minecraft\mods\rhino-forge-*.jar")[0].FullName
 *   javac -cp $rhino -d dev\rhino_parse\out dev\rhino_parse\ParseAll.java
 *   java -cp "$rhino;dev\rhino_parse\out" ParseAll kubejs\server_scripts kubejs\startup_scripts kubejs\client_scripts
 *
 * (dev\rhino_parse\out is a build product; do not commit it.) First used 2026-10-10: 191/191.
 * Companions: lint_kubejs_rhino.js (patterns that parse but misbehave), lint_kubejs_scope.py.
 */
public class ParseAll {
    public static void main(String[] args) throws Exception {
        Context cx = Context.enter();
        int ok = 0, bad = 0;
        for (String dir : args) {
            List<Path> files;
            try (Stream<Path> walk = Files.walk(Path.of(dir))) {
                files = walk.filter(p -> p.toString().endsWith(".js")).sorted().collect(Collectors.toList());
            }
            for (Path p : files) {
                try {
                    cx.compileString(Files.readString(p), p.getFileName().toString(), 1, null);
                    ok++;
                } catch (Throwable t) {
                    bad++;
                    System.out.println("PARSE FAIL " + p + " :: " + t.getClass().getSimpleName() + ": " + t.getMessage());
                }
            }
        }
        System.out.println("[rhino-parse] ok=" + ok + " bad=" + bad);
        if (bad > 0) System.exit(1);
    }
}
