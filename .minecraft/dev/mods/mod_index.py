#!/usr/bin/env python3
"""mod_index.py -- one source for the pack's mod indexes and its client-only skip lists.

SOURCE (edit these, nothing else):
  .minecraft/mods/.index/*.pw.toml      one metafile per mod
  .minecraft/dev/mods/mod_index.policy.json  the few facts a metafile cannot carry

GENERATED (never edit by hand; `generate` rewrites them, `check` refuses a push that
left them stale):
  .minecraft/server_distribution/mods/.index/     every source metafile whose side is not
                                                  'client', byte for byte
  .minecraft/distribution/client/mods/.index/     every source metafile whose side is not
                                                  'server', in the form packwiz-installer
                                                  accepts, plus the policy's
                                                  client_distro_only metafiles (kept by hand
                                                  in that folder)
  .minecraft/server_distribution/client_only_mods.txt
  the blocks between `>>> mod_index.py:` and `<<< mod_index.py` in the server scripts
  listed in SCRIPT_BLOCKS

`side` has ONE meaning, in the source: where the pack installs the jar.
  both    clients and the dedicated server
  client  clients only. Absent from the server index: a server never downloads it, and
          its cleanup removes the jar if it is found there
  server  the dedicated server only. Absent from the client distribution's index

The launcher (icraft-core/src/packwiz.rs FORCE_SKIP_PATTERNS) still carries a compiled
copy of the skip patterns. `check` reads that source file and fails when a compiled
pattern is missing from the policy, or when any pattern would hide a mod the server
index says the server gets: the index alone must say what a server installs.

Commands (run from anywhere):
  python .minecraft/dev/mods/mod_index.py generate   write the generated files
  python .minecraft/dev/mods/mod_index.py check      the gate; exit 1 on a finding
  python .minecraft/dev/mods/mod_index.py list       one line per mod: side, jar, metafile

Needs Python 3.11 or newer (tomllib). No third-party modules.
"""
import argparse
import json
import os
import re
import sys

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover
    sys.stderr.write("mod_index.py needs Python 3.11 or newer (tomllib).\n")
    sys.exit(2)

MC = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # .minecraft
REPO = os.path.dirname(MC)

SOURCE_REL = "mods/.index"
SERVER_REL = "server_distribution/mods/.index"
CLIENT_REL = "distribution/client/mods/.index"
POLICY_REL = "dev/mods/mod_index.policy.json"
CLIENT_ONLY_TXT_REL = "server_distribution/client_only_mods.txt"
LAUNCHER_PATTERNS_REL = "../iridescent-launcher/icraft-core/src/packwiz.rs"

# Our own jars are fetched from the repo, each distro from its own copy, through the
# pack server (it reads the repo with its own key, so the repo may be private; it
# serves only the paths it is set to serve).
REPO_RAW = "https://iridescentcraft.sereneblossom.gay/pack/raw/main/.minecraft"
RAW_SEGMENT = {
    "server": "/server_distribution/mods/",
    "client": "/distribution/client/mods/",
}

SIDES = ("both", "client", "server")
HASH_LENGTHS = {"sha1": 40, "sha256": 64, "sha512": 128, "md5": 32}

# script (relative to .minecraft) -> the block kinds it must contain
SCRIPT_BLOCKS = {
    "server_distribution/server_install.ps1": ["ps-array"],
    "server_distribution/update_mods.ps1": ["ps-array"],
    "server_distribution/IridescentCraft Dedicated Server/update_mods.ps1": ["ps-array"],
    "server_distribution/update_mods.sh": ["sh-regex"],
    "server_distribution/server_install.sh": ["sh-exact"],
    "server_distribution/iridescentserver.sh": ["bash-array", "sh-strip"],
    "server_distribution/strip_client_mods.bat": ["bat-delete"],
    "server_distribution/strip_client_mods.sh": ["sh-delete"],
}

BEGIN_RE = re.compile(r"^(?P<indent>[ \t]*)(?P<lead>#|REM) >>> mod_index\.py: (?P<kind>[a-z-]+)\b")
END_RE = re.compile(r"^[ \t]*(#|REM) <<< mod_index\.py\b")
BEGIN_NOTE = "GENERATED from mods/.index + dev/mods/mod_index.policy.json. Do not edit: run mod_index.py generate"

# A skip token is embedded in PowerShell -like, cmd and sh wildcards and in a grep -E
# expression. Only characters that are literal in all of them (after escaping '.' and
# '+' for the regex form) are allowed.
TOKEN_SAFE_RE = re.compile(r"^[A-Za-z0-9_.+-]+$")


class Finding(Exception):
    pass


def p(*parts):
    return os.path.join(MC, *[x for part in parts for x in part.split("/")])


def read_bytes(path):
    with open(path, "rb") as f:
        return f.read()


def list_metafiles(rel):
    d = p(rel)
    if not os.path.isdir(d):
        return []
    return sorted(fn for fn in os.listdir(d) if fn.endswith(".pw.toml"))


# --------------------------------------------------------------------------- source

def load_policy():
    with open(p(POLICY_REL), encoding="utf-8") as f:
        pol = json.load(f)
    def names(key):  # keys starting with '_' are comments
        return [k for k in pol.get(key, {}) if not k.startswith("_")]

    return {
        "client_distro_only": names("client_distro_only"),
        "client_distro_url_mode": names("client_distro_url_mode"),
        "server_skip_patterns": [e["pattern"] for e in pol.get("server_skip_patterns", []) if "pattern" in e],
    }


def parse_metafile(name, raw, errors, where):
    """Parse one metafile strictly. Appends to `errors`; returns a dict or None."""
    label = "%s/%s" % (where, name)
    if raw.startswith(b"\xef\xbb\xbf"):
        errors.append("%s: starts with a byte-order mark" % label)
        return None
    if b"\r" in raw:
        errors.append("%s: has CR line endings (metafiles are LF)" % label)
        return None
    try:
        text = raw.decode("utf-8")
        d = tomllib.loads(text)
    except Exception as ex:
        errors.append("%s: does not parse as TOML (%s)" % (label, ex))
        return None
    ok = True
    filename = d.get("filename")
    if not isinstance(filename, str) or not filename.endswith(".jar"):
        errors.append("%s: `filename` is missing or is not a .jar name" % label)
        ok = False
    side = d.get("side")
    if side not in SIDES:
        errors.append("%s: side = %r (must be one of %s)" % (label, side, ", ".join(SIDES)))
        ok = False
    dl = d.get("download") if isinstance(d.get("download"), dict) else {}
    mode = dl.get("mode")
    up = d.get("update") if isinstance(d.get("update"), dict) else {}
    cf = up.get("curseforge") if isinstance(up.get("curseforge"), dict) else {}
    if mode == "url":
        url = dl.get("url")
        if not isinstance(url, str) or not re.match(r"^https?://", url):
            errors.append("%s: mode = 'url' without an http(s) url" % label)
            ok = False
    elif mode == "metadata:curseforge":
        if not isinstance(cf.get("file-id"), int) or not isinstance(cf.get("project-id"), int):
            errors.append("%s: mode = 'metadata:curseforge' without [update.curseforge] file-id and project-id" % label)
            ok = False
    else:
        errors.append("%s: [download] mode = %r (must be 'url' or 'metadata:curseforge')" % (label, mode))
        ok = False
    hfmt, hval = dl.get("hash-format"), dl.get("hash")
    if not isinstance(hval, str) or not hval:
        errors.append("%s: [download] has no hash" % label)
        ok = False
    elif hfmt not in HASH_LENGTHS:
        errors.append("%s: [download] hash-format = %r (known: %s)" % (label, hfmt, ", ".join(sorted(HASH_LENGTHS))))
        ok = False
    elif not re.fullmatch(r"[0-9a-f]{%d}" % HASH_LENGTHS[hfmt], hval):
        errors.append("%s: [download] hash is not %d lowercase hex digits (%s)" % (label, HASH_LENGTHS[hfmt], hfmt))
        ok = False
    if not ok:
        return None
    return {
        "meta": name, "raw": raw, "text": text, "filename": filename, "side": side,
        "name": d.get("name") if isinstance(d.get("name"), str) else name[: -len(".pw.toml")],
        "mode": mode, "cf": cf, "modrinth": (up.get("modrinth") or {}).get("mod-id") if isinstance(up.get("modrinth"), dict) else None,
    }


def load_source(errors):
    mods = []
    for name in list_metafiles(SOURCE_REL):
        m = parse_metafile(name, read_bytes(p(SOURCE_REL, name)), errors, SOURCE_REL)
        if m:
            mods.append(m)
    return mods


def load_overlay(policy, source_names, errors):
    """The client_distro_only metafiles: kept by hand in the client distro's index."""
    mods = []
    for name in policy["client_distro_only"]:
        path = p(CLIENT_REL, name)
        if name in source_names:
            errors.append("policy client_distro_only: %s is also in %s (a mod is in one place)" % (name, SOURCE_REL))
            continue
        if not os.path.isfile(path):
            errors.append("policy client_distro_only: %s is not in %s" % (name, CLIENT_REL))
            continue
        m = parse_metafile(name, read_bytes(path), errors, CLIENT_REL)
        if m:
            if m["side"] != "client":
                errors.append("%s/%s: a client_distro_only metafile must have side = 'client'" % (CLIENT_REL, name))
            mods.append(m)
    return mods


def check_duplicates(mods, errors):
    """One metafile per jar, and one per upstream project."""
    seen = {}
    for m in mods:
        key = m["filename"].lower()
        if key in seen:
            errors.append("duplicate metafiles for %s: %s and %s" % (m["filename"], seen[key], m["meta"]))
        else:
            seen[key] = m["meta"]
    ident = {}
    for m in mods:
        keys = []
        if m["modrinth"]:
            keys.append("modrinth:" + m["modrinth"])
        if m["cf"].get("project-id"):
            keys.append("curseforge:%s" % m["cf"]["project-id"])
        for k in keys:
            if k in ident and ident[k] != m["meta"]:
                errors.append("two metafiles for one upstream project (%s): %s and %s" % (k, ident[k], m["meta"]))
            else:
                ident[k] = m["meta"]


# ------------------------------------------------------------------------ rendering

def render_server(m):
    return m["text"].replace(REPO_RAW + "/mods/", REPO_RAW + RAW_SEGMENT["server"]).encode("utf-8")


def forgecdn_url(file_id, filename):
    s = str(file_id)
    rest = s[4:].lstrip("0") or "0"
    return "https://edge.forgecdn.net/files/%s/%s/%s" % (s[:4], rest, filename)


def render_client(m, policy):
    """The form packwiz-installer accepts. Two differences from the source bytes:
    a CurseForge metafile has no empty `url` line (the installer reads '' as the url),
    and a mod whose author switched off CurseForge API distribution is pinned to the
    CDN url (the API returns no download url for it, even with a key)."""
    lines = m["text"].replace(REPO_RAW + "/mods/", REPO_RAW + RAW_SEGMENT["client"]).split("\n")
    out = []
    pin = m["meta"] in policy["client_distro_url_mode"]
    for line in lines:
        s = line.strip()
        if m["mode"] == "metadata:curseforge":
            if re.fullmatch(r"url\s*=\s*(''|\"\")", s):
                if pin:
                    out.append("url = '%s'" % forgecdn_url(m["cf"]["file-id"], m["filename"]))
                continue
            if pin and re.fullmatch(r"mode\s*=\s*['\"]metadata:curseforge['\"]", s):
                out.append("mode = 'url'")
                continue
        out.append(line)
    return "\n".join(out).encode("utf-8")


# ------------------------------------------------------------------- skip patterns

def name_segments(filename):
    """Leading run of purely alphabetic segments of a jar name, with their separators."""
    stem = filename[:-4] if filename.lower().endswith(".jar") else filename
    parts = re.split(r"([-_.+ ])", stem)
    segs = []  # (text, separator after it or '')
    i = 0
    while i < len(parts):
        seg = parts[i]
        sep = parts[i + 1] if i + 1 < len(parts) else ""
        if not seg.isalpha() or not seg.isascii():
            break
        segs.append((seg, sep))
        i += 2
    return segs


LOADER_WORDS = ("forge", "neoforge", "fabric", "quilt", "mc")


def skip_token(filename, server_filenames):
    """A piece of a client-only jar's name that survives a version bump and that no jar
    the server installs contains: the leading alphabetic segments of the name, without
    the loader words at their end, plus the separator that follows
    (`mek_walkable_cables-1.0.1.jar` -> `mek_walkable_cables-`,
    `jmi-forge-1.20.1-0.14-48.jar` -> `jmi-`). If a server jar contains that, the loader
    words stay in; if it still does, the whole file name is the token."""
    lowered = [f.lower() for f in server_filenames]
    segs = name_segments(filename)
    core = list(segs)
    while len(core) > 1 and core[-1][0].lower() in LOADER_WORDS:
        core.pop()
    for candidate in (core, segs):
        token = "".join(seg + sep for seg, sep in candidate)
        if candidate and candidate[-1][1] and TOKEN_SAFE_RE.match(token) and not any(token.lower() in f for f in lowered):
            return token
    return filename


def skip_lists(source, overlay, policy):
    """(patterns, client_only) where patterns is the ordered skip-pattern list for the
    server scripts and client_only the client-only mods (source first, then overlay)."""
    server_files = [m["filename"] for m in source if m["side"] != "client"]
    client_only = [m for m in source if m["side"] == "client"] + list(overlay)
    patterns = list(policy["server_skip_patterns"])
    derived = []
    for m in client_only:
        if any(pat in m["filename"] for pat in patterns):
            continue  # a policy pattern already names it, on every platform
        derived.append(skip_token(m["filename"], server_files))
    for t in sorted(set(derived), key=lambda s: (s.lower(), s)):
        if t not in patterns:
            patterns.append(t)
    return patterns, client_only


def dedupe_ci(patterns):
    seen, out = set(), []
    for pat in patterns:
        if pat.lower() not in seen:
            seen.add(pat.lower())
            out.append(pat)
    return out


def render_block(kind, patterns, client_only, indent):
    exact = sorted({m["filename"] for m in client_only}, key=lambda s: (s.lower(), s))
    if kind == "ps-array":
        body = ["$forceSkip = @("]
        ci = dedupe_ci(patterns)
        body += ["    '%s'%s" % (pat, "," if i < len(ci) - 1 else "") for i, pat in enumerate(ci)]
        body += [")"]
    elif kind == "sh-regex":
        body = ['FORCE_SKIP="%s"' % "|".join(re.sub(r"([.+])", r"\\\1", pat) for pat in patterns)]
    elif kind == "bash-array":
        body = ["FORCE_SKIP=("] + ['    "%s"' % pat for pat in patterns] + [")"]
    elif kind == "sh-exact":
        body = ['FORCE_EXCLUDE["%s"]=1' % fn for fn in exact]
    elif kind == "bat-delete":
        body = ['call :delete "*%s*"' % pat for pat in dedupe_ci(patterns)]
    elif kind == "sh-delete":
        body = ['delete_mod "*%s*"' % pat for pat in patterns]
    elif kind == "sh-strip":
        body = ['strip_mod "*%s*"' % pat for pat in patterns]
    else:
        raise Finding("unknown block kind %r" % kind)
    return [indent + line for line in body]


def render_script(rel, text, patterns, client_only):
    """Text of a script with its generated blocks refreshed. Raises Finding."""
    eol = "\r\n" if "\r\n" in text else "\n"
    lines = text.split(eol)
    out, found, i = [], [], 0
    while i < len(lines):
        line = lines[i]
        mb = BEGIN_RE.match(line)
        if not mb:
            out.append(line)
            i += 1
            continue
        kind, indent, lead = mb.group("kind"), mb.group("indent"), mb.group("lead")
        j = i + 1
        while j < len(lines) and not END_RE.match(lines[j]):
            if BEGIN_RE.match(lines[j]):
                raise Finding("%s: block %r opened at line %d is not closed" % (rel, kind, i + 1))
            j += 1
        if j == len(lines):
            raise Finding("%s: block %r opened at line %d is not closed" % (rel, kind, i + 1))
        out.append("%s%s >>> mod_index.py: %s (%s)" % (indent, lead, kind, BEGIN_NOTE))
        out.extend(render_block(kind, patterns, client_only, indent))
        out.append("%s%s <<< mod_index.py" % (indent, lead))
        found.append(kind)
        i = j + 1
    want = SCRIPT_BLOCKS[rel]
    if sorted(found) != sorted(want):
        raise Finding("%s: expected generated block(s) %s, found %s" % (rel, want, found))
    return eol.join(out)


def render_client_only_txt(source, overlay):
    def names(mods):
        return sorted((m["filename"] for m in mods), key=lambda s: (s.lower(), s))
    lines = [
        "# Client-only mods: jars a dedicated server must not load.",
        "#",
        "# GENERATED by .minecraft/dev/mods/mod_index.py from the mod index. Do not edit:",
        "# set `side = 'client'` in the mod's metafile under .minecraft/mods/.index/,",
        "# then run `python .minecraft/dev/mods/mod_index.py generate`.",
        "#",
        "# One filename per line. Lines starting with # are comments.",
        "",
        "# --- side = 'client' in the pack's index (absent from the server index) ---",
    ]
    lines += names([m for m in source if m["side"] == "client"])
    if overlay:
        lines += ["", "# --- in the client distribution's index only ---"]
        lines += names(overlay)
    return ("\n".join(lines) + "\n").encode("utf-8")


# ------------------------------------------------------------------ expected state

def launcher_patterns():
    path = os.path.normpath(os.path.join(MC, *LAUNCHER_PATTERNS_REL.split("/")))
    if not os.path.isfile(path):
        return None
    text = open(path, encoding="utf-8").read()
    m = re.search(r"FORCE_SKIP_PATTERNS\s*:\s*&\[&str\]\s*=\s*&\[(.*?)\];", text, re.S)
    if not m:
        return None
    return re.findall(r'"([^"]+)"', m.group(1))


def build(errors):
    """Everything `generate` writes: {path relative to .minecraft: bytes}, the set of
    metafile names each generated index holds, and the model the checks need."""
    policy = load_policy()
    source = load_source(errors)
    source_names = {m["meta"] for m in source}
    overlay = load_overlay(policy, set(list_metafiles(SOURCE_REL)), errors)
    check_duplicates(source + overlay, errors)

    for name in policy["client_distro_url_mode"]:
        hit = [m for m in source if m["meta"] == name]
        if not hit:
            errors.append("policy client_distro_url_mode: %s is not in %s" % (name, SOURCE_REL))
        elif hit[0]["mode"] != "metadata:curseforge":
            errors.append("policy client_distro_url_mode: %s is not a CurseForge metafile" % name)

    files = {}
    server_set = set()
    client_set = {m["meta"] for m in overlay}
    for m in source:
        if m["side"] != "client":
            files["%s/%s" % (SERVER_REL, m["meta"])] = render_server(m)
            server_set.add(m["meta"])
        if m["side"] != "server":
            files["%s/%s" % (CLIENT_REL, m["meta"])] = render_client(m, policy)
            client_set.add(m["meta"])

    patterns, client_only = skip_lists(source, overlay, policy)
    for pat in patterns:
        if not TOKEN_SAFE_RE.match(pat):
            errors.append("skip pattern %r has a character outside A-Z a-z 0-9 _ . + -" % pat)
    server_files = [m["filename"] for m in source if m["side"] != "client"]
    for pat in patterns:
        for f in server_files:
            if pat.lower() in f.lower():
                errors.append("skip pattern %r matches %s, which the server index installs: the server would silently not get it" % (pat, f))
    compiled = launcher_patterns()
    if compiled is not None:
        for pat in compiled:
            if pat not in policy["server_skip_patterns"]:
                errors.append("the launcher's compiled FORCE_SKIP_PATTERNS has %r, which dev/mods/mod_index.policy.json does not list" % pat)

    files[CLIENT_ONLY_TXT_REL] = render_client_only_txt(source, overlay)
    for rel in SCRIPT_BLOCKS:
        path = p(rel)
        if not os.path.isfile(path):
            errors.append("%s: not found" % rel)
            continue
        text = read_bytes(path).decode("utf-8")
        try:
            files[rel] = render_script(rel, text, patterns, client_only).encode("utf-8")
        except Finding as ex:
            errors.append(str(ex))
    return {
        "files": files, "server_set": server_set, "client_set": client_set,
        "source": source, "overlay": overlay, "patterns": patterns, "client_only": client_only,
        "compiled": compiled,
    }


def stale_metafiles(rel, keep):
    return [n for n in list_metafiles(rel) if n not in keep]


# ------------------------------------------------------------------------ commands

def cmd_generate(_args):
    errors = []
    built = build(errors)
    if errors:
        for e in errors:
            print("[mod-index] ERROR  " + e)
        print("[mod-index] nothing written: fix the source first (%d problem(s))." % len(errors))
        return 1
    written = removed = 0
    for rel, data in sorted(built["files"].items()):
        path = p(rel)
        if os.path.isfile(path) and read_bytes(path) == data:
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
        written += 1
        print("[mod-index] wrote    " + rel)
    for rel, keep in ((SERVER_REL, built["server_set"]), (CLIENT_REL, built["client_set"])):
        for name in stale_metafiles(rel, keep):
            os.remove(p(rel, name))
            removed += 1
            print("[mod-index] removed  %s/%s" % (rel, name))
    print("[mod-index] source %d mod(s): server index %d, client distro index %d (%d of them client-distro-only); wrote %d, removed %d." % (
        len(built["source"]), len(built["server_set"]), len(built["client_set"]), len(built["overlay"]), written, removed))
    return 0


def cmd_check(_args):
    errors = []
    built = build(errors)
    stale = []
    for rel, data in sorted(built["files"].items()):
        path = p(rel)
        if not os.path.isfile(path):
            stale.append("missing   " + rel)
        elif read_bytes(path) != data:
            stale.append("differs   " + rel)
    for rel, keep in ((SERVER_REL, built["server_set"]), (CLIENT_REL, built["client_set"])):
        for name in stale_metafiles(rel, keep):
            stale.append("unexpected %s/%s" % (rel, name))
    for e in errors:
        print("[mod-index] ERROR  " + e)
    for s in stale:
        print("[mod-index] STALE  " + s)
    if errors or stale:
        print("")
        print("[mod-index] FAILED: %d source problem(s), %d generated file(s) out of date." % (len(errors), len(stale)))
        print("[mod-index] The source is .minecraft/mods/.index (+ dev/mods/mod_index.policy.json). Fix it there, then:")
        print("[mod-index]     python .minecraft/dev/mods/mod_index.py generate")
        return 1
    sides = {s: sum(1 for m in built["source"] if m["side"] == s) for s in SIDES}
    note = "" if built["compiled"] is not None else " (launcher source not found: its compiled patterns were not compared)"
    print("[mod-index] OK - %d mods in the source (both %d, client %d, server %d); server index %d, client distro index %d; %d generated files fresh%s." % (
        len(built["source"]), sides["both"], sides["client"], sides["server"],
        len(built["server_set"]), len(built["client_set"]), len(built["files"]), note))
    return 0


def cmd_list(_args):
    errors = []
    built = build(errors)
    for m in sorted(built["source"] + built["overlay"], key=lambda m: m["meta"]):
        where = "client-distro-only" if m in built["overlay"] else m["side"]
        print("%-18s %-60s %s" % (where, m["filename"], m["meta"]))
    for e in errors:
        print("[mod-index] ERROR  " + e, file=sys.stderr)
    return 1 if errors else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("generate", help="write the generated indexes and skip lists").set_defaults(fn=cmd_generate)
    sub.add_parser("check", help="the gate: exit 1 when the source is invalid or a generated file is stale").set_defaults(fn=cmd_check)
    sub.add_parser("list", help="one line per mod").set_defaults(fn=cmd_list)
    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
