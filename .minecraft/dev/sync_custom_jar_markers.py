#!/usr/bin/env python3
"""
sync_custom_jar_markers.py -- make our custom jars first-class packwiz mods by
giving each one a real raw-GitHub [download] url + sha256 in its .pw.toml, across
all 3 distro indexes. Custom jars used to ship as empty-url "presence markers"
(or no marker at all), which packwiz / PrismLauncher-"Update" can't fetch and
will actively delete -> the recurring "client is missing iridescent_* mods"
tester failure. Since the modpack repo is PUBLIC, download_mods.ps1 (and any
packwiz consumer) can now fetch them by URL like any other mod.

IDEMPOTENT + sha-from-disk: re-run after EVERY custom-jar rebuild so the marker
hash tracks the new jar content (wire into the custom-jar-release flow alongside
regen_custom_jars_manifest.ps1). Only touches the jars in JARS below; leaves
externally-hosted markers (tetra, modrinth mods) alone.

Usage:  python3 dev/sync_custom_jar_markers.py   (run from the .minecraft dir or anywhere)
"""
import hashlib
import os
import sys

REPO_RAW = "https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft"

# .minecraft root (this file lives in .minecraft/dev/)
MC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# distro key -> (mods dir relative to MC, url path segment relative to .minecraft)
DISTROS = {
    "root":   ("mods",                          "mods"),
    "server": ("server_distribution/mods",      "server_distribution/mods"),
    "client": ("distribution/client/mods",      "distribution/client/mods"),
}

# jar filename -> (pw.toml basename, display name, side)
# ONLY the jars we build/host ourselves with no external CDN source.
JARS = {
    "iridescent_grand_compass-1.0.0.jar":            ("iridescent-grand-compass.pw.toml",   "Iridescent Grand Compass",        "both"),
    "iridescent_origins-1.0.0.jar":                  ("iridescent-origins.pw.toml",         "Iridescent Origins",              "both"),
    "iridescent_relics-1.0.0.jar":                   ("iridescent-relics.pw.toml",          "Iridescent Relics",               "both"),
    "iridescent_biomes-1.0.0.jar":                   ("iridescent-biomes.pw.toml",          "Iridescent Biomes",               "both"),
    "iridescent_codex_data.jar":                     ("iridescent-codex.pw.toml",           "Iridescent Codex",                "both"),
    "iridescent_difficulty-0.1.0.jar":               ("iridescent-difficulty.pw.toml",      "Iridescent Difficulty",           "both"),
    "iridescent_durability_clamp-0.1.0.jar":         ("iridescent-durability-clamp.pw.toml","Iridescent Durability Clamp",     "both"),
    "iridescent_tetra_expansion-1.0.0.jar":          ("iridescent-tetra-expansion.pw.toml", "Iridescent Tetra Expansion",      "both"),
    "justlevelingfork-1.2.1-iridescent.1.jar":       ("justlevelingfork.pw.toml",           "Just Leveling Fork (Iridescent)", "both"),
    "linearxp-1.0.0-iridescent.1.jar":               ("linear-experience.pw.toml",          "Linear Experience (Iridescent)",  "both"),
    "lovely_sparkle_pieces-0.1.0.0-iridescent.2.jar":("iridescent-lovely-pieces.pw.toml",   "Iridescent Lovely Pieces",        "both"),
    # client-only (absent from server_distribution -- see docket #73)
    "mek_walkable_cables-1.0.1.jar":                 ("mek-walkable-cables.pw.toml",        "Walkable Mekanism Cables",        "client"),
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def find_existing_pw(index_dir, jar):
    """Return the basename of an existing pw.toml whose filename == jar, else None."""
    if not os.path.isdir(index_dir):
        return None
    for fn in os.listdir(index_dir):
        if not fn.endswith(".pw.toml"):
            continue
        try:
            txt = open(os.path.join(index_dir, fn), encoding="utf-8").read()
        except OSError:
            continue
        if ("filename = '%s'" % jar) in txt or ('filename = "%s"' % jar) in txt:
            return fn
    return None


def marker(jar, name, side, url, digest):
    return (
        "filename = '%s'\n"
        "name = '%s'\n"
        "side = '%s'\n\n"
        "[download]\n"
        "hash = '%s'\n"
        "hash-format = 'sha256'\n"
        "mode = 'url'\n"
        "url = '%s'\n"
    ) % (jar, name, side, digest, url)


def main():
    wrote = created = skipped = 0
    for dkey, (mods_rel, url_seg) in DISTROS.items():
        mods_dir = os.path.join(MC, mods_rel)
        index_dir = os.path.join(mods_dir, ".index")
        os.makedirs(index_dir, exist_ok=True)
        for jar, (pw_default, name, side) in JARS.items():
            jar_path = os.path.join(mods_dir, jar)
            if not os.path.isfile(jar_path):
                # e.g. mek_walkable_cables not in server distro -- skip silently
                skipped += 1
                continue
            digest = sha256(jar_path)
            url = "%s/%s/%s" % (REPO_RAW, url_seg, jar)
            existing = find_existing_pw(index_dir, jar)
            pw_name = existing or pw_default
            pw_path = os.path.join(index_dir, pw_name)
            is_new = not os.path.exists(pw_path)
            with open(pw_path, "w", encoding="utf-8", newline="\n") as f:
                f.write(marker(jar, name, side, url, digest))
            if is_new:
                created += 1
                print("  + CREATE %-22s %s  (%s)" % (dkey, pw_name, digest[:10]))
            else:
                wrote += 1
                print("  ~ update %-22s %s  (%s)" % (dkey, pw_name, digest[:10]))
    print("Done. updated=%d created=%d skipped(absent)=%d" % (wrote, created, skipped))


if __name__ == "__main__":
    sys.exit(main())
