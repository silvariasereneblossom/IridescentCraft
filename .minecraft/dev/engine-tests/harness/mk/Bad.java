package mk;

/**
 * DELIBERATELY DISHONEST mocks: the self-test of MemberCheck (suite mock-honesty). Each class below
 * repeats a mistake a real mock once made, or could make; harness/selftest-map.json lists the exact
 * failures the checker must report for them. No suite ever hands one of these to a script.
 */
public class Bad {
  /** The 2026-10-10 fix of the Codex submit loop was "verified" on a mock inventory that had size. */
  public static class Inventory {
    public int size() { return 41; }
    public int getContainerSize() { return 41; }
  }

  /** A vanilla name KubeJS renames: the mock that let `level.gameTime` through for an evening. */
  public static class Level {
    public long getGameTime() { return 0L; }
    public long getTime() { return 0L; }
  }

  /** A property where the engine has a method: `source.type` is a function there. */
  public static class Source {
    public String type = "generic";
    public Object getActual() { return null; }
  }

  /** Plain fields where the engine has a field AND a method: a value read of vec.x throws there. */
  public static class Vec3 {
    public double x, y, z;
  }

  /** An overload the engine does not have. */
  public static class Slots {
    public Object getStackInSlot() { return null; }
    public Object getStackInSlot(int slot) { return null; }
  }

  /** A mock nobody mapped to a real class. */
  public static class Unlisted {
    public void anything() { }
  }
}
