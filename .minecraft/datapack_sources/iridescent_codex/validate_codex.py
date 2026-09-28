#!/usr/bin/env python3
"""Validate the BUILT iridescent_codex_data.jar the way Patchouli 1.20.1-85 loads it.

build_codex.sh runs this on the freshly packed jar BEFORE deploying it; exit 1
aborts the deploy. Every rule below was read out of Patchouli-1.20.1-85-FORGE.jar
(CFR decompile, 2026-09-28) -- not assumed from older Patchouli docs:

LOADING (client side, BookContentResourceListenerLoader)
  - Book CONTENT (categories/entries/templates) is read ONLY from
    assets/icraft/patchouli_books/iridescent_codex/en_us/ through the client
    resource manager; `use_resource_pack` is not even consulted. Only book.json
    is read from data/. A stale or partial assets/ mirror = missing entries, so
    the jar's data/ and assets/ book trees must match byte for byte.
  - A file whose path is not a valid ResourceLocation path ([a-z0-9/._-]) is
    skipped by the resource manager -- silently absent.
  - ONE bad entry/category (missing required field, unknown or unqualified
    category/parent, unknown page type, missing relations target) throws out of
    BookContentsBuilder and the WHOLE book fails to load.
  - Any other pack shipping assets/icraft/patchouli_books/** overrides the jar
    file-for-file (the 2026-08-27 iridescent_codex_resources.zip incident).

RENDERING (BookTextParser, runs on page `text`, category `description`,
book `landing_text`)
  - $(l:target) that is neither an entry nor a category -> "BAD LINK: target"
  - $(l:entry#anchor) with no page carrying that anchor -> "(INVALID ANCHOR:..)"
  - $(/l) or $(/c) with nothing pushed -> style-stack underflow -> "[ERROR]"
  - a link still open at the end of a text -> the rest of the text is the link
  - unknown $(cmd) prints literally; unknown $(fn:x) -> "[MISSING FUNCTION: fn]"
  - $(k:name) matching no KeyMapping -> "N/A"; $(c:x) without "/" -> "INVALID COMMAND"
  - entry/category names and page titles are NOT macro-parsed -> "$(" prints raw
  - Patchouli's built-in macro "/$" -> "$()" mangles any "/" typed right before "$("
  - an advancement gate (icraft:*) that doesn't exist locks the entry forever
  - an icon/spotlight item that isn't registered renders blank (checked against
    the owning jar's bytecode for our namespaces -- the Item Audit snapshot
    still lists items we removed)

NOT a defect: with Advanced Tooltips (F3+H) on, PageText.render prints every
entry's resource ID under its title. That is Patchouli's author-debug view.

Usage: python3 validate_codex.py <built iridescent_codex_data.jar> [--repo <repo root>]
       --repo defaults to this script's repo; it enables the cross-checks
       (shadowing packs, keybind names, advancements, item IDs).
Exit code 1 if any ERROR is found.
"""
import argparse
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

BOOK_NS = "icraft"
BOOK_ID = "iridescent_codex"
BOOK_JSON = f"data/{BOOK_NS}/patchouli_books/{BOOK_ID}/book.json"
BOOK_DATA_DIR = f"data/{BOOK_NS}/patchouli_books/{BOOK_ID}/"
BOOK_ASSETS_DIR = f"assets/{BOOK_NS}/patchouli_books/{BOOK_ID}/"
CONTENT_ROOT = BOOK_ASSETS_DIR + "en_us/"
FOLDERS = ("categories", "entries", "templates")
SHADOW_MARKER = f"assets/{BOOK_NS}/patchouli_books/"

# ---- Patchouli 85 tables (ClientBookRegistry / BookTextParser / Book) -------
PAGE_TYPES = {
    "text", "crafting", "smelting", "blasting", "smoking", "campfire",
    "smithing", "stonecutting", "image", "spotlight", "empty", "multiblock",
    "link", "relations", "entity", "quest",
}
COMMANDS = {
    "br", "br2", "2br", "p", "/l", "/t", "playername", "k", "obf", "l", "bold",
    "m", "strike", "n", "underline", "o", "italic", "italics",
    "", "reset", "clear", "nocolor", "/c",
}
FUNCTIONS = {"k", "l", "tooltip", "t", "command", "c"}
# Add-on page types another of our jars registers, which the Codex must not use.
BLOCKED_PAGE_TYPES = {
    "icraft:screen_link": "registered by the JLF fork (JustLevelingClient), but the 2026-08-27 audit "
                          "found it renders inert and its icraft.codex.screen_link.* lang keys don't exist -- use a text page",
}
RESET_COMMANDS = {"", "reset", "clear"}
DEFAULT_MACROS = {
    "$(list": "$(li", "/$": "$()", "<br>": "$(br)",
    "$(item)": "$(#b0b)", "$(thing)": "$(#490)",
}
COMMAND_PATTERN = re.compile(r"\$\(([^)]*)\)")
RL_NAMESPACE = re.compile(r"^[a-z0-9_.-]+$")
RL_PATH = re.compile(r"^[a-z0-9/._-]+$")
ITEM_ID = re.compile(r"^([a-z0-9_.-]+:[a-z0-9/._-]+)")
HEX_DIGITS = re.compile(r"^[0-9a-fA-F]+$")


class Report:
    def __init__(self):
        self.errors, self.warnings, self.notes = [], [], []

    def error(self, where, msg):
        self.errors.append(f"  {where}: {msg}")

    def warn(self, where, msg):
        self.warnings.append(f"  {where}: {msg}")

    def note(self, msg):
        self.notes.append(f"  {msg}")


def parse_rl(text, default_ns=None):
    """ResourceLocation(text) as Patchouli builds it; None if it would throw."""
    if ":" in text:
        ns, path = text.split(":", 1)
    elif default_ns is None:
        ns, path = "minecraft", text
    else:
        ns, path = default_ns, text
    if RL_NAMESPACE.match(ns) and RL_PATH.match(path):
        return f"{ns}:{path}"
    return None


def load_json(raw, where, report):
    try:
        return json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        report.error(where, f"unparseable JSON ({e}) -- the whole book fails to load")
        return None


def expand_macros(text, macros):
    # BookTextParser.expandMacros: replace every macro, repeat to a fixpoint (cap 10)
    for _ in range(10):
        new = text
        for key, value in macros.items():
            new = new.replace(key, value)
        if new == text:
            break
        text = new
    return text


def item_id(stack_string):
    m = ITEM_ID.match(stack_string)
    return m.group(1) if m else None


# ---- repo cross-reference data ---------------------------------------------
def load_keybinds(mc):
    """KeyMapping name -> default input, from the Default Options seed."""
    path = mc / "config/defaultoptions/keybindings.txt"
    if not path.is_file():
        return None
    binds = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^key_([^:]+):(.+)$", line.strip())
        if m:
            binds[m.group(1)] = m.group(2)
    return binds


def class_strings(data):
    """CONSTANT_Utf8 entries of one .class file (registry IDs live here)."""
    if data[:4] != b"\xca\xfe\xba\xbe":
        return []
    count, i, k, out = int.from_bytes(data[8:10], "big"), 10, 1, []
    while k < count:
        tag = data[i]
        i += 1
        if tag == 1:
            n = int.from_bytes(data[i:i + 2], "big")
            out.append(data[i + 2:i + 2 + n].decode("utf-8", "replace"))
            i += 2 + n
        elif tag in (3, 4, 9, 10, 11, 12, 17, 18):
            i += 4
        elif tag in (5, 6):
            i += 8
            k += 1
        elif tag in (7, 8, 16, 19, 20):
            i += 2
        elif tag == 15:
            i += 3
        else:
            break
        k += 1
    return out


def load_items(mc):
    """Item existence, by namespace owner.
    OUR namespaces (a jar committed in .minecraft/mods ships assets/<ns>/ or
    data/<ns>/, or KubeJS registers into <ns>): the item must be a KubeJS
    create('...') ID or its path must be a string constant in the owning jar's
    bytecode -- never trust the Item Audit snapshot here, it outlives removed
    items (e.g. the 15 per-tier modular spell books). Third-party namespaces:
    the Item Audit snapshot (all_items.tsv; best effort, can lag)."""
    kubejs, snapshot, owned = set(), set(), {}
    for script in (mc / "kubejs/startup_scripts").rglob("*.js"):
        for rid in re.findall(r"\.create\(\s*['\"]([a-z0-9_.:/-]+)['\"]", script.read_text(encoding="utf-8", errors="replace")):
            kubejs.add(rid if ":" in rid else "kubejs:" + rid)
    for jar in (mc / "mods").glob("*.jar"):
        try:
            with zipfile.ZipFile(jar) as zf:
                names = zf.namelist()
                namespaces = {m.group(1) for n in names for m in [re.match(r"^(?:assets|data)/([a-z0-9_.-]+)/", n)] if m}
                strings = set()
                for n in names:
                    if n.endswith(".class"):
                        strings.update(class_strings(zf.read(n)))
                for ns in namespaces:
                    owned.setdefault(ns, set()).update(strings)
        except zipfile.BadZipFile:
            continue
    for rid in kubejs:
        owned.setdefault(rid.split(":", 1)[0], set())
    path = mc / "TesterLogs/Item Audit/all_items.tsv"
    if path.is_file():
        with path.open(encoding="utf-8") as f:
            next(f, None)
            for line in f:
                cols = line.rstrip("\n").split("\t")
                if len(cols) >= 2:
                    snapshot.add(f"{cols[0]}:{cols[1]}")
    return {"kubejs": kubejs, "owned": owned, "snapshot": snapshot if path.is_file() else None}


def zip_advancements(zf, namespace):
    prefix = f"data/{namespace}/advancements/"
    return {f"{namespace}:{n[len(prefix):-5]}" for n in zf.namelist()
            if n.startswith(prefix) and n.endswith(".json")}


def load_advancements(mc, jar):
    """icraft:* advancement IDs from every shipped source the server loads."""
    found = set(zip_advancements(jar, BOOK_NS))
    adv_dir = mc / f"kubejs/data/{BOOK_NS}/advancements"
    if adv_dir.is_dir():
        for p in adv_dir.rglob("*.json"):
            found.add(f"{BOOK_NS}:{p.relative_to(adv_dir).with_suffix('').as_posix()}")
    archives = list((mc / "config/paxi/datapacks").glob("*.zip")) + list((mc / "mods").glob("*.jar"))
    for archive in archives:
        try:
            with zipfile.ZipFile(archive) as zf:
                found |= zip_advancements(zf, BOOK_NS)
        except zipfile.BadZipFile:
            continue
    return found


def check_shadowing(mc, report):
    """Anything in the three distros that would override the jar's book files."""
    distros = [mc, mc / "server_distribution", mc / "distribution/client"]
    for root in distros:
        label = root.relative_to(mc.parent).as_posix()
        kube = root / f"kubejs/assets/{BOOK_NS}/patchouli_books"
        if kube.exists():
            report.error(label, f"{kube.relative_to(root).as_posix()} exists -- KubeJS assets override the jar's book")
        pack_dirs = [root / "config/paxi/resourcepacks", root / "resourcepacks"]
        for pack_dir in pack_dirs:
            if not pack_dir.is_dir():
                continue
            for pack in pack_dir.iterdir():
                rel = pack.relative_to(root).as_posix()
                if pack.is_dir() and (pack / SHADOW_MARKER).exists():
                    report.error(label, f"resource pack folder {rel} ships {SHADOW_MARKER} -- shadows the jar")
                elif pack.suffix == ".zip":
                    try:
                        with zipfile.ZipFile(pack) as zf:
                            if any(n.startswith(SHADOW_MARKER) for n in zf.namelist()):
                                report.error(label, f"resource pack {rel} ships {SHADOW_MARKER} -- shadows the jar")
                    except zipfile.BadZipFile:
                        report.warn(label, f"{rel} is not a readable zip")
        order = root / "config/paxi/resourcepack_load_order.json"
        if order.is_file():
            try:
                listed = json.loads(order.read_text(encoding="utf-8")).get("loadOrder", [])
            except json.JSONDecodeError:
                listed = []
            for name in listed:
                if "codex" in name.lower():
                    report.error(label, f"paxi resourcepack_load_order.json lists '{name}' -- never re-add a codex resource pack")
        mods = root / "mods"
        if mods.is_dir():
            for jar in mods.glob("*.jar"):
                if jar.name == "iridescent_codex_data.jar":
                    continue
                try:
                    with zipfile.ZipFile(jar) as zf:
                        if any(n.startswith(SHADOW_MARKER) for n in zf.namelist()):
                            report.error(label, f"mods/{jar.name} also ships {SHADOW_MARKER}")
                except zipfile.BadZipFile:
                    continue


# ---- text validation ---------------------------------------------------------
class Book:
    def __init__(self):
        self.categories = {}   # id -> json
        self.entries = {}      # id -> json
        self.templates = set()
        self.anchors = {}      # entry id -> {anchor}
        self.macros = dict(DEFAULT_MACROS)
        self.links = 0
        self.pages = 0


def check_text(text, where, book, ctx, report):
    if not isinstance(text, str):
        return
    for m in re.finditer(r"/\$", text):
        snippet = text[max(0, m.start() - 20):m.end() + 20]
        report.error(where, f'"/$" in "...{snippet}..." -- the built-in macro "/$" -> "$()" eats the slash and prints the next macro raw; write " / "')
    depth = 0          # style pushes by $(l:)/$(c:) not yet popped
    open_link = None
    for m in COMMAND_PATTERN.finditer(expand_macros(text, book.macros)):
        cmd = m.group(1)
        if len(cmd) == 1 and cmd in "0123456789abcdef":
            continue
        if cmd.startswith("#") and len(cmd) in (4, 7):
            if not HEX_DIGITS.match(cmd[1:]):
                report.warn(where, f"$({cmd}) is not valid hex -- falls back to the base color")
            continue
        if re.fullmatch(r"li\d?", cmd):
            continue
        colon = cmd.find(":")
        if colon > 0:
            fname, param = cmd[:colon], cmd[colon + 1:]
            if fname not in FUNCTIONS:
                report.error(where, f"$({cmd}) renders \"[MISSING FUNCTION: {fname}]\"")
            elif fname == "l":
                depth += 1
                open_link = param
                check_link(param, where, book, report)
            elif fname in ("command", "c"):
                depth += 1
                if not param.startswith("/"):
                    report.error(where, f"$({cmd}) renders \"INVALID COMMAND (must begin with /)\"")
            elif fname == "k" and ctx["keybinds"] is not None:
                name = param if param in ctx["keybinds"] else ("key." + param if "key." + param in ctx["keybinds"] else None)
                if name is None:
                    report.error(where, f"$(k:{param}) matches no KeyMapping in config/defaultoptions/keybindings.txt -- renders \"N/A\"")
                elif ctx["keybinds"][name] == "key.keyboard.unknown":
                    report.warn(where, f"$(k:{param}) is unbound in the pack defaults -- renders the unbound-key label")
            continue
        if cmd in ("/l", "/c"):
            if depth == 0:
                report.error(where, f"$({cmd}) with no open link/command -- style-stack underflow renders \"[ERROR]\"")
            else:
                depth -= 1
            if cmd == "/l":
                open_link = None
            continue
        if cmd in RESET_COMMANDS:
            depth, open_link = 0, None
            continue
        if cmd in COMMANDS:
            continue
        report.error(where, f"unknown macro $({cmd}) -- printed literally on the page")
    if open_link is not None:
        report.error(where, f"$(l:{open_link}) is never closed -- the rest of the text renders as that link")


def check_link(param, where, book, report):
    book.links += 1
    if re.match(r"^https?:.*", param):
        return
    anchor = None
    if "#" in param:
        param, anchor = param.split("#", 1)
    target = parse_rl(param, BOOK_NS)
    if target is None:
        report.error(where, f"$(l:{param}) is not a valid resource location -- renders \"[ERROR]\"")
    elif target in book.entries:
        if anchor is not None and anchor not in book.anchors.get(target, set()):
            report.error(where, f"$(l:{param}#{anchor}) -- entry has no page with anchor '{anchor}' (INVALID ANCHOR)")
    elif target in book.categories:
        if anchor is not None:
            report.error(where, f"$(l:{param}#{anchor}) -- anchors can't target a category (BAD LINK)")
    else:
        report.error(where, f"$(l:{param}) -> {target} is neither an entry nor a category in the loaded book (BAD LINK)")


def check_literal(value, where, field, report):
    if isinstance(value, str) and "$(" in value:
        report.error(where, f"{field} contains \"$(\" -- names/titles aren't macro-parsed, it prints raw")


def check_advancement(adv, where, ctx, report):
    if not isinstance(adv, str) or not adv:
        return
    rl = parse_rl(adv)
    if rl is None:
        report.error(where, f"advancement '{adv}' is not a valid resource location")
    elif rl.startswith(BOOK_NS + ":") and ctx["advancements"] is not None and rl not in ctx["advancements"]:
        report.error(where, f"gated on {rl}, which no shipped datapack/kubejs/jar defines -- locked forever")


def check_item(stack, where, ctx, report):
    if not isinstance(stack, str) or stack.endswith(".png"):
        return
    iid = item_id(stack)
    if iid is None:
        report.warn(where, f"'{stack}' doesn't parse as an item stack -- renders as an empty icon")
        return
    items = ctx["items"]
    if items is None:
        return
    ns, path = iid.split(":", 1)
    if ns == "minecraft" or iid in items["kubejs"]:
        return
    if ns in items["owned"]:
        if path not in items["owned"][ns]:
            report.error(where, f"item {iid} is not registered by the jar/KubeJS that owns '{ns}' -- the icon renders blank")
    elif items["snapshot"] is not None and iid not in items["snapshot"]:
        report.warn(where, f"item {iid} is not in the Item Audit snapshot (all_items.tsv) -- blank icon if it doesn't exist")


# ---- main ---------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("jar", type=Path)
    ap.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[3])
    args = ap.parse_args()
    report = Report()

    try:
        jar = zipfile.ZipFile(args.jar)
    except (OSError, zipfile.BadZipFile) as e:
        print(f"ERROR: cannot open {args.jar}: {e}")
        return 1
    names = [n for n in jar.namelist() if not n.endswith("/")]
    jar_sha = hashlib.sha256(args.jar.read_bytes()).hexdigest()

    mc = args.repo / ".minecraft"
    ctx = {"keybinds": None, "advancements": None, "items": None}
    if mc.is_dir():
        ctx["keybinds"] = load_keybinds(mc)
        ctx["advancements"] = load_advancements(mc, jar)
        ctx["items"] = load_items(mc)
        check_shadowing(mc, report)
    else:
        report.warn("--repo", f"{mc} not found -- shadowing/keybind/advancement/item cross-checks skipped")
    if mc.is_dir() and ctx["keybinds"] is None:
        report.warn("keybinds", "config/defaultoptions/keybindings.txt missing -- $(k:) check skipped")
    if mc.is_dir() and ctx["items"]["snapshot"] is None:
        report.note("TesterLogs/Item Audit/all_items.tsv missing -- third-party icon/spotlight items unchecked")

    book = Book()

    # book.json (the only file read from data/)
    if BOOK_JSON not in names:
        report.error("book.json", f"{BOOK_JSON} missing -- Patchouli never registers the book")
        return finish(report, book, args.jar, jar_sha)
    book_json = load_json(jar.read(BOOK_JSON), "book.json", report) or {}
    if book_json.get("use_resource_pack") is not True:
        report.error("book.json", "use_resource_pack must be true (content is only read from assets/)")
    if "extend" in book_json:
        report.error("book.json", "'extend' was removed in 1.20 -- Patchouli throws on load")
    if book_json.get("i18n"):
        report.warn("book.json", "i18n is on -- names/titles are lang keys, which this script doesn't resolve")
    for key, value in (book_json.get("macros") or {}).items():
        book.macros[key] = value

    # data/ vs assets/ parity: Patchouli reads only the assets/ copy
    data_files = {n[len(BOOK_DATA_DIR):]: n for n in names
                  if n.startswith(BOOK_DATA_DIR) and n != BOOK_JSON}
    asset_files = {n[len(BOOK_ASSETS_DIR):]: n for n in names if n.startswith(BOOK_ASSETS_DIR)}
    for rel in sorted(data_files.keys() - asset_files.keys()):
        report.error("assets/ mirror", f"{rel} is in data/ but not assets/ -- Patchouli never sees it")
    for rel in sorted(asset_files.keys() - data_files.keys()):
        report.error("assets/ mirror", f"{rel} is in assets/ but not data/ -- stale mirror file ships in the book")
    for rel in sorted(data_files.keys() & asset_files.keys()):
        if jar.read(data_files[rel]) != jar.read(asset_files[rel]):
            report.error("assets/ mirror", f"{rel} differs between data/ and assets/ -- players see the assets/ copy")

    # the loaded tree: assets/icraft/patchouli_books/iridescent_codex/en_us/<folder>/<id>.json
    parsed = {}
    for name in sorted(names):
        if not name.startswith(CONTENT_ROOT):
            continue
        rel = name[len(CONTENT_ROOT):]
        folder, _, rest = rel.partition("/")
        if not rest.endswith(".json"):
            report.warn(rel, "not a .json file -- ignored by Patchouli")
            continue
        if folder not in FOLDERS:
            report.warn(rel, f"folder '{folder}' is not one of {FOLDERS} -- ignored by Patchouli")
            continue
        rid = rest[:-5]
        if not RL_PATH.match(rid):
            report.error(rel, "path isn't a valid resource location ([a-z0-9/._-]) -- silently skipped")
            continue
        data = load_json(jar.read(name), rel, report)
        if data is None:
            continue
        if not isinstance(data, dict):
            report.error(rel, "top level is not a JSON object -- the whole book fails to load")
            continue
        parsed[(folder, f"{BOOK_NS}:{rid}")] = (rel, data)

    book.categories = {rid: d for (f, rid), (_, d) in parsed.items() if f == "categories"}
    book.entries = {rid: d for (f, rid), (_, d) in parsed.items() if f == "entries"}
    book.templates = {rid for (f, rid) in parsed if f == "templates"}
    if not book.categories:
        report.error("book", f"no categories under {CONTENT_ROOT}categories -- empty book")
    if not book.entries:
        report.error("book", f"no entries under {CONTENT_ROOT}entries -- empty book")
    for rid, entry in book.entries.items():
        pages = entry.get("pages")
        if isinstance(pages, list):
            book.anchors[rid] = {p["anchor"] for p in pages
                                 if isinstance(p, dict) and isinstance(p.get("anchor"), str)}

    check_text(book_json.get("landing_text"), "book.json landing_text", book, ctx, report)
    check_item(book_json.get("index_icon"), "book.json index_icon", ctx, report)

    pages_seen = 0
    for (folder, rid), (rel, data) in sorted(parsed.items()):
        if folder == "templates":
            continue
        required = ("name", "description", "icon") if folder == "categories" else ("name", "icon", "category", "pages")
        for field in required:
            if field not in data:
                report.error(rel, f"missing required '{field}' -- the whole book fails to load")
        if "flag" in data:
            report.warn(rel, f"config flag '{data['flag']}' can hide this at runtime (not evaluated here)")
        check_literal(data.get("name"), rel, "name", report)
        check_item(data.get("icon"), rel, ctx, report)
        check_advancement(data.get("advancement"), rel, ctx, report)

        if folder == "categories":
            check_text(data.get("description"), rel + " description", book, ctx, report)
            parent = data.get("parent")
            if parent is not None:
                if ":" not in parent:
                    report.error(rel, f"parent '{parent}' must be namespaced (e.g. {BOOK_NS}:{parent})")
                elif parent not in book.categories:
                    report.error(rel, f"parent category {parent} not found -- the whole book fails to load")
            continue

        category = data.get("category")
        if isinstance(category, str):
            if ":" not in category:
                report.error(rel, f"category '{category}' must be namespaced (e.g. {BOOK_NS}:{category})")
            elif category not in book.categories:
                report.error(rel, f"category {category} not found -- the whole book fails to load")
        check_advancement(data.get("turnin"), rel, ctx, report)
        pages = data.get("pages")
        if not isinstance(pages, list):
            if "pages" in data:
                report.error(rel, "'pages' is not a list -- the whole book fails to load")
            continue
        if not pages:
            report.warn(rel, "no pages -- the entry opens blank")
        for i, page in enumerate(pages):
            pages_seen += 1
            where = f"{rel} page {i + 1}"
            if isinstance(page, str):
                check_text(page, where, book, ctx, report)
                continue
            if not isinstance(page, dict):
                report.error(where, "page is neither a string nor an object -- the whole book fails to load")
                continue
            ptype = page.get("type")
            if not isinstance(ptype, str):
                report.error(where, "missing 'type' -- the whole book fails to load")
                continue
            normalized = ptype if ":" in ptype else "patchouli:" + ptype
            if normalized in BLOCKED_PAGE_TYPES:
                report.error(where, f"page type '{ptype}': {BLOCKED_PAGE_TYPES[normalized]}")
            elif not (normalized.startswith("patchouli:") and normalized[len("patchouli:"):] in PAGE_TYPES):
                template = ptype if ":" in ptype else f"{BOOK_NS}:{ptype}"
                if template not in book.templates:
                    report.error(where, f"page type '{ptype}' is not a Patchouli page type or a template in this book -- the whole book fails to load")
            check_literal(page.get("title"), where, "title", report)
            check_text(page.get("text"), where, book, ctx, report)
            check_advancement(page.get("advancement"), where, ctx, report)
            if normalized == "patchouli:spotlight":
                check_item(page.get("item"), where, ctx, report)
            if normalized == "patchouli:quest":
                check_advancement(page.get("trigger"), where, ctx, report)
            if normalized == "patchouli:relations":
                for target in page.get("entries") or []:
                    rl = parse_rl(target) if isinstance(target, str) else None
                    if rl not in book.entries:
                        report.error(where, f"relations target '{target}' not found (no namespace default) -- the whole book fails to load")

    book.pages = pages_seen
    return finish(report, book, args.jar, jar_sha)


def finish(report, book, jar_path, jar_sha):
    print(f"== Codex validation: {jar_path.name} (sha256 {jar_sha[:12]}) ==")
    print(f"   loaded tree: {len(book.categories)} categories / {len(book.entries)} entries / "
          f"{book.pages} pages / {book.links} links checked")
    for label, bucket in (("ERROR", report.errors), ("WARN", report.warnings), ("NOTE", report.notes)):
        if bucket:
            print(f"--- {label}: {len(bucket)} ---")
            print("\n".join(bucket))
    print("RESULT: " + ("FAIL" if report.errors else "PASS"))
    return 1 if report.errors else 0


if __name__ == "__main__":
    sys.exit(main())
