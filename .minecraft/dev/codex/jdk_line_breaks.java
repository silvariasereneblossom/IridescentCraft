import java.io.BufferedReader;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.text.BreakIterator;
import java.util.Base64;
import java.util.Locale;

/**
 * The line boundaries the JDK gives, the way Patchouli asks for them (TextLayouter: BreakIterator.getLineInstance(new
 * Locale(<the language code>))), to check codex_fit.java_line_breaks against. Reads one base64 UTF-8 string a line,
 * writes their boundaries comma-separated, one line each.
 *
 *     java .minecraft/dev/codex/jdk_line_breaks.java in.txt out.txt      (JDK 17; no build step)
 */
public class jdk_line_breaks {
    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(new FileInputStream(args[0]), StandardCharsets.UTF_8));
        PrintStream out = new PrintStream(new FileOutputStream(args[1]), true, "UTF-8");
        String line;
        while ((line = in.readLine()) != null) {
            String s = new String(Base64.getDecoder().decode(line.trim()), StandardCharsets.UTF_8);
            BreakIterator it = BreakIterator.getLineInstance(new Locale("en_us"));
            it.setText(s);
            StringBuilder sb = new StringBuilder();
            for (int b = it.first(); b != BreakIterator.DONE; b = it.next()) {
                if (sb.length() > 0) {
                    sb.append(',');
                }
                sb.append(b);
            }
            out.println(sb);
        }
    }
}
