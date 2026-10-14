#!/usr/bin/env python3
"""intake.py -- add, update, remove and audit the pack's mods: one tool, one record per mod, one gate.

    python -I .minecraft/dev/mods/intake.py add <jar> --side both|client|server
                 (--modrinth <project id>:<version id> | --curseforge <project id>:<file id> | --url <url>
                  | --metafile <the .pw.toml the launcher wrote>)  [--slug <name>] [--name "<display name>"]
        The metafile into the source index, the generated indexes, the static inventory of the jar, a full-pack
        offline server boot with the mod in, diffed against --base (default origin/main), and the INTAKE RECORD:
        every surface the mod touches, what its content does by default, and the decision each needs.
    python -I .minecraft/dev/mods/intake.py update <mod> <new jar> [--version <id> | --file-id <n>] [--url <url>]
        The metafile moved to the new jar, the boot diff old against new, every id that vanished, and every
        place in the pack that still names one. --diff-only changes nothing (and is the only form for one of
        the pack's own jars: those are released by the custom-jar-release procedure).
    python -I .minecraft/dev/mods/intake.py remove <mod> [--apply]
        Every reference in scripts, quests, registries and configs, what depends on it, the deny-list entry
        and how the jar leaves the clients and the server. Without --apply it changes nothing.
    python -I .minecraft/dev/mods/intake.py audit [--out-dir <private folder>] [--refresh [<mod> ...]]
        Is there a complete record for every mod of the index; the grandfathered backlog by priority.
    python -I .minecraft/dev/mods/intake.py check
        The gate (pre-push hook, CI): exit 1 on a mod with no record, or a NEW mod with a decision owed.

    python -I .minecraft/dev/mods/intake.py show <mod>                      a record as text
    python -I .minecraft/dev/mods/intake.py decide <mod> <key> <answer> [field=value ...] [--note "..."]
    python -I .minecraft/dev/mods/intake.py decide <mod> --defaults --note "..."    accept every default
    python -I .minecraft/dev/mods/intake.py apply <mod> | --all             write decided bosses and dimensions
                                                                            into the registries, then validate

Add, update and remove write into THIS checkout and commit nothing: read the record, answer its decisions, then
commit. In a scratch checkout (git worktree add) they are a rehearsal.

Common options: --mods <dir> (where the installed jars are; default the PrismLauncher instance), --no-boot
(static evidence only: the record then owes its boot), --base <commit or saved boot result>.
Needs Python 3.11+, the jars on this PC, and for a boot what dev/boot/README.md lists (WSL 2, a JDK 17).
README.md next to this file has the procedure.
"""
import argparse
import datetime
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import intake_core as core  # noqa: E402

MC = core.MC
REPO = core.REPO
BOOT_PS1 = os.path.join(MC, 'dev', 'boot', 'boot.ps1')
DENY_PS1_REL = 'cleanup_stale_jars.ps1'
LAUNCHER_CONFIG = os.path.join(REPO, 'iridescent-launcher', 'icraft-core', 'src', 'config.rs')
TEXT_EXT = ('.js', '.json', '.json5', '.toml', '.cfg', '.txt', '.properties', '.yaml', '.yml', '.snbt', '.mcfunction',
            '.md', '.ps1', '.sh', '.bat', '.zs', '.ini', '.conf')
RX_ID = re.compile(r'(?<![a-z0-9_.\-/:#])([a-z0-9_.\-]+:[a-z0-9_./\-]+)')
EXIT_OK, EXIT_FINDINGS, EXIT_CANNOT = 0, 1, 2


def say(text=''):
    print(text, flush=True)


def die(text, code=EXIT_CANNOT):
    print('[intake] CANNOT: ' + text, file=sys.stderr, flush=True)
    sys.exit(code)


def today():
    return datetime.date.today().isoformat()


def rel(path):
    return os.path.relpath(path, REPO).replace('\\', '/')


def run(cmd, env=None, capture=False):
    """A child process whose output the user sees. -> (exit code, output when captured)"""
    if not capture:
        return subprocess.call(cmd, env=env), ''
    p = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors='replace')
    out = []
    for line in p.stdout:
        sys.stdout.write(line)
        sys.stdout.flush()
        out.append(line)
    return p.wait(), ''.join(out)


def py(script, *args):
    return [sys.executable, '-I', os.path.join(MC, *script.split('/'))] + list(args)


# --------------------------------------------------------------------------- jars and the inventory

def default_mods_dir():
    appdata = os.environ.get('APPDATA') or os.path.expanduser('~\\AppData\\Roaming')
    return os.path.join(appdata, 'PrismLauncher', 'instances', 'IridescentCraft', '.minecraft', 'mods')


def inv_args(args):
    import inventory
    return argparse.Namespace(repo=MC, mods=os.path.abspath(args.mods or default_mods_dir()),
                              libraries=inventory.default_libraries(), no_cache=False, jobs=0)


def load_inventory(args):
    """Every installed jar -> ({jar file name: [records]}, ctx)"""
    import inventory
    inv, ctx, stats = inventory.build_inventory(inv_args(args))
    for e in stats['errors']:
        say('[intake] inventory: ' + e)
    return inv, ctx


def scan_jar(path, ctx):
    import inventory
    import jarscan
    task = {'kind': 'mod', 'id': 'mod:' + os.path.basename(path), 'path': path, 'classes': True, 'order': 2}
    fams, _ = jarscan.scan_all([task], inventory.scan_cache_dir(MC), False, 1)
    fam = fams.get(task['id']) or {}
    if fam.get('error') or not fam.get('units'):
        die('cannot read %s: %s' % (path, fam.get('error')))
    return inventory.family_records(fam, ctx)


def file_hash(path, fmt):
    h = hashlib.new(fmt)
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def find_jar(name, args):
    for d in jar_dirs(args):
        p = os.path.join(d, name)
        if os.path.isfile(p):
            return p
    return None


def jar_dirs(args):
    dirs = [os.path.abspath(args.mods or default_mods_dir()), os.path.join(MC, 'mods')]
    dirs += [d for d in (os.environ.get('ICRAFT_BOOT_JAR_CACHE') or '').split(';') if d]
    return dirs


def jar_ids(path):
    """What an archive ships, id by id, with a hash of each file -> {kind: {id: sha1}}. Nested jars included."""
    out = {}

    def walk(zf):
        for name in zf.namelist():
            if name.endswith('/'):
                continue
            parts = name.split('/')
            if parts[0] == 'data' and len(parts) >= 4:
                ns, folder = parts[1], parts[2]
                if folder == 'worldgen' and len(parts) >= 5:
                    folder, rest = 'worldgen/' + parts[3], parts[4:]
                elif folder == 'tags' and len(parts) >= 5:
                    folder, rest = 'tags/' + parts[3], parts[4:]
                else:
                    rest = parts[3:]
                rid = '%s:%s' % (ns, '/'.join(rest).rsplit('.', 1)[0])
                out.setdefault(folder, {})[rid] = hashlib.sha1(zf.read(name)).hexdigest()
            elif parts[0] == 'assets' and len(parts) == 4 and parts[2] == 'lang' and parts[3] == 'en_us.json':
                try:
                    lang = json.loads(zf.read(name).decode('utf-8', 'replace'))
                except ValueError:
                    continue
                for k in lang if isinstance(lang, dict) else ():
                    m = re.match(r'(item|block|entity)\.([a-z0-9_\-]+)\.([a-z0-9_/\-]+)$', k)
                    if m:
                        out.setdefault('lang ' + m.group(1), {})['%s:%s' % (m.group(2), m.group(3))] = ''
            elif name.endswith('.jar') and parts[0] == 'META-INF':
                import io
                try:
                    with zipfile.ZipFile(io.BytesIO(zf.read(name))) as inner:
                        walk(inner)
                except zipfile.BadZipFile:
                    pass
    with zipfile.ZipFile(path) as zf:
        walk(zf)
    return out


# --------------------------------------------------------------------------- metafiles

def toml_str(s):
    return "'%s'" % s if "'" not in s and '\\' not in s else json.dumps(s, ensure_ascii=False)


def slugify(name):
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', name.lower())).strip('-')


def render_metafile(filename, name, side, hash_format, hash_hex, mode, url, update):
    lines = ['filename = %s' % toml_str(filename), 'name = %s' % toml_str(name), "side = '%s'" % side,
             "x-prismlauncher-loaders = [ 'forge' ]", "x-prismlauncher-mc-versions = [ '1.20.1' ]",
             "x-prismlauncher-release-type = 'release'", '', '[download]', "hash = '%s'" % hash_hex,
             "hash-format = '%s'" % hash_format, "mode = '%s'" % mode, "url = '%s'" % url]
    if update:
        lines += ['', '[update.%s]' % update[0]] + ['%s = %s' % (k, v if isinstance(v, int) else toml_str(v)) for k, v in update[1]]
    return '\n'.join(lines) + '\n'


def source_args(args, filename):
    """-> (hash format, mode, url, update section) from --modrinth / --curseforge / --url"""
    if args.modrinth:
        if ':' not in args.modrinth:
            die('--modrinth takes <project id>:<version id> (both are in the mod page\'s "Technical information")')
        pid, ver = args.modrinth.split(':', 1)
        url = args.url or 'https://cdn.modrinth.com/data/%s/versions/%s/%s' % (pid, ver, filename)
        return 'sha512', 'url', url, ('modrinth', (('mod-id', pid), ('version', ver)))
    if args.curseforge:
        m = re.fullmatch(r'(\d+):(\d+)', args.curseforge)
        if not m:
            die('--curseforge takes <project id>:<file id>, two numbers')
        return 'sha1', 'metadata:curseforge', '', ('curseforge', (('file-id', int(m.group(2))), ('project-id', int(m.group(1)))))
    if args.url:
        return 'sha512', 'url', args.url, None
    die('say where the jar comes from: --modrinth <project>:<version>, --curseforge <project>:<file>, --url <url>, '
        'or --metafile <the .pw.toml the launcher wrote for it>')


def set_toml_value(text, key, value, section=None):
    """Replace `key = ...` (inside [section] when given) in a metafile's text; the rest stays byte for byte."""
    lines = text.split('\n')
    cur = None
    for i, ln in enumerate(lines):
        s = ln.strip()
        if s.startswith('['):
            cur = s.strip('[]')
            continue
        if cur == section and re.match(r'%s\s*=' % re.escape(key), s):
            lines[i] = '%s = %s' % (key, value if isinstance(value, int) else toml_str(value))
            return '\n'.join(lines), True
    return text, False


def write_bytes(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)


def generate_index():
    rc, _ = run(py('dev/mods/mod_index.py', 'generate'))
    if rc == 0:
        rc, _ = run(py('dev/mods/mod_index.py', 'check'))
    return rc


# --------------------------------------------------------------------------- the boot

def results_root():
    return os.environ.get('ICRAFT_BOOT_RESULTS') or os.path.join(os.environ.get('USERPROFILE') or os.path.expanduser('~'),
                                                                 'icraft-boot', 'results')


def boot_env(args, extra_dirs=()):
    env = dict(os.environ)
    dirs = [os.path.abspath(d) for d in extra_dirs] + [d for d in jar_dirs(args) if d != os.path.join(MC, 'mods')]
    seen, uniq = set(), []
    for d in dirs:
        if d.lower() not in seen:
            seen.add(d.lower())
            uniq.append(d)
    env['ICRAFT_BOOT_JAR_CACHE'] = ';'.join(uniq)
    return env


def powershell():
    return shutil.which('powershell') or shutil.which('pwsh') or 'powershell.exe'


def boot_modset(args, extra_dirs=()):
    """The server's mod set of this tree, every jar verified against its metafile. -> (exit code, jar count)"""
    rc, out = run([powershell(), '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', BOOT_PS1, '-ModSet'],
                  env=boot_env(args, extra_dirs), capture=True)
    m = re.search(r'mod set: .* = (\d+)\s*$', out, re.M)
    return rc, int(m.group(1)) if m else None


def boot_compare(args, name, base, extra_dirs=()):
    """Boot this tree, diff it against `base`. -> (exit code, result folder, diff dict or None)"""
    cmd = [powershell(), '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', BOOT_PS1, '-Name', name, '-Compare', base]
    rc, _ = run(cmd, env=boot_env(args, extra_dirs))
    rdir = os.path.join(results_root(), name)
    diffs = sorted(glob.glob(os.path.join(rdir, 'diff-vs-*.json')), key=os.path.getmtime)
    diff = None
    if diffs:
        with open(diffs[-1], 'r', encoding='utf-8') as f:
            diff = json.load(f)
    return rc, rdir, diff


REGISTRY_LABELS = OrderedDict((
    ('minecraft:item', 'items'), ('minecraft:block', 'blocks'), ('minecraft:entity_type', 'entity types'),
    ('dimensions', 'dimensions'), ('minecraft:worldgen/structure', 'structures'), ('minecraft:worldgen/structure_set', 'structure sets'),
    ('minecraft:worldgen/biome', 'biomes'), ('minecraft:enchantment', 'enchantments'), ('minecraft:attribute', 'attributes'),
    ('minecraft:mob_effect', 'mob effects'), ('minecraft:block_entity_type', 'block entity types'),
    ('minecraft:recipe_type', 'recipe types'), ('minecraft:villager_profession', 'villager professions'),
    ('loot_tables', 'loot tables'), ('recipes', 'recipes'), ('advancements', 'advancements'), ('game_rules', 'game rules'),
))


def boot_evidence(rdir, diff, when):
    """A boot result and its diff, reduced to what a record keeps."""
    def read(path, default):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (OSError, ValueError):
            return default
    res = read(os.path.join(rdir, 'result.json'), {})
    ev = OrderedDict()
    ev['result'] = os.path.basename(rdir)
    ev['base'] = ((diff or {}).get('base') or {}).get('name') or '?'
    ev['when'] = when
    added, removed = OrderedDict(), OrderedDict()
    if diff:
        for reg, v in sorted((diff.get('registries') or {}).items()):
            if v.get('added'):
                added[reg] = v['added']
            if v.get('removed'):
                removed[reg] = v['removed']
        for label in ('dimensions', 'loot_tables', 'advancements', 'game_rules'):
            v = diff.get(label) or {}
            if v.get('added'):
                added[label] = v['added']
            if v.get('removed'):
                removed[label] = v['removed']
        rv = diff.get('recipes') or {}
        if rv.get('added'):
            added['recipes'] = sorted(set(l.split('\t', 1)[0] for l in rv['added']))
        if rv.get('removed'):
            gone = set(l.split('\t', 1)[0] for l in rv['removed']) - set(l.split('\t', 1)[0] for l in rv.get('added') or [])
            if gone:
                removed['recipes'] = sorted(gone)
    for side in (added, removed):                 # the dimension registry is reported once, as `dimensions`
        dims = side.pop('minecraft:dimension', None)
        if dims and 'dimensions' not in side:
            side['dimensions'] = dims
    ev['added'], ev['removed'] = added, removed
    grv = (diff or {}).get('game_rule_values') or {}
    gone_rules = set(l.split('\t', 1)[0] for l in grv.get('removed') or [])
    ev['game_rules'] = [l.split('\t', 1) for l in grv.get('added') or [] if '\t' in l and l.split('\t', 1)[0] not in gone_rules]
    facts = (read(os.path.join(rdir, 'registry', 'entities.json'), {}).get('entities') or {})
    ev['entity_facts'] = dict((e, facts.get(e) or {}) for e in added.get('minecraft:entity_type') or [])
    ev['entities_changed'] = [c['id'] for c in (diff or {}).get('entities_changed') or []]
    ev['registered'] = OrderedDict((label, {'n': len(added[reg]), 'ids': added[reg][:10]})
                                   for reg, label in REGISTRY_LABELS.items() if added.get(reg))
    other = sum(len(v) for k, v in added.items() if k not in REGISTRY_LABELS)
    if other:
        ev['registered']['other registries'] = {'n': other, 'ids': sorted(k for k in added if k not in REGISTRY_LABELS)[:10]}

    def lines_of(d, fn):
        try:
            with open(os.path.join(d, fn), 'r', encoding='utf-8') as f:
                return [ln.strip() for ln in f if ln.strip()]
        except OSError:
            return []
    base_dir = os.path.join(os.path.dirname(rdir), ev['base'])
    ev['config_generated'] = sorted(set(lines_of(rdir, 'config_generated.txt')) - set(lines_of(base_dir, 'config_generated.txt')))

    lines = []
    boot = res.get('boot') or {}
    if diff:
        mods = diff.get('mods') or {}
        lines.append('mod set: %d jars; added %s; removed %s%s' % (
            (res.get('modset') or {}).get('count') or 0, ', '.join(mods.get('added') or []) or 'none',
            ', '.join(mods.get('removed') or []) or 'none',
            ('; rebuilt under one name: ' + ', '.join(mods['rebuilt'])) if mods.get('rebuilt') else ''))
    if boot:
        b = (diff or {}).get('boot') or {}
        lines.append('boot: %s; Done %ss (base %ss); %s TPS; live heap %s MB (base %s MB)' % (
            'reached Done and stopped cleanly' if boot.get('reached_done') and boot.get('clean_stop') else 'DID NOT BOOT CLEANLY (%s)' % (boot.get('died') or 'exit code %s' % boot.get('exit_code')),
            boot.get('done_seconds'), (b.get('done_seconds') or [None])[0], boot.get('tps'), boot.get('live_heap_mb'),
            (b.get('live_heap_mb') or [None])[0]))
    if diff:
        mx = diff.get('mixins') or {}
        if mx.get('configs_registered_added') or mx.get('configs_started_applying') or mx.get('configs_registered_removed'):
            lines.append('mixin configs: registered +%s -%s; started applying: %s' % (
                ', '.join(mx.get('configs_registered_added') or []) or 'none', ', '.join(mx.get('configs_registered_removed') or []) or 'none',
                ', '.join(mx.get('configs_started_applying') or []) or 'none'))
            idle = [c for c in mx.get('configs_registered_added') or [] if c not in (mx.get('configs_started_applying') or [])]
            if idle:
                lines.append('registered and applying nothing on a dedicated server (client mixins, or a target that was not loaded): ' + ', '.join(idle))
        for kind, v in (diff.get('rejected') or {}).items():
            if v.get('newly_rejected'):
                lines.append('REJECTED by the game (%s): %s' % (kind.replace('_', ' '), ', '.join(v['newly_rejected'][:10])))
        for k, v in sorted((diff.get('signatures') or {}).items()):
            if v.get('new'):
                lines.append('%d new %s line(s), first: %s' % (len(v['new']), k, v['new'][0]['sig'][:150]))
        ck = diff.get('checker') or {}
        for f in ck.get('findings_new') or []:
            lines.append('checker, new: %s %s %s' % (f.get('sev'), f.get('id'), (f.get('detail') or '')[:130]))
        wg = diff.get('worldgen') or {}
        for dim, pair in (wg.get('dimensions') or {}).items():
            lines.append('worldgen %s: %s -> %s' % (dim, pair[0], pair[1]))
        if wg.get('feature_order'):
            lines.append('feature lists changed in: ' + ', '.join('%s (%d)' % (d, len(c)) for d, c in wg['feature_order'].items()))
        if ev['config_generated']:
            lines.append('config files the boot generated that the tree does not track: ' + ', '.join(ev['config_generated'][:10]))
    for p_ in res.get('problems') or []:
        lines.append('PROBLEM: ' + str(p_)[:200])
    ev['lines'] = lines
    ev['regressions'] = list((diff or {}).get('regressions') or [])
    ok = bool(res.get('booted')) and boot.get('reached_done') and boot.get('clean_stop')
    if not ok:
        ev['verdict'] = 'BOOT FAILED'
        if not ev['regressions']:
            ev['regressions'] = ['the server did not boot or did not stop cleanly: read %s' % os.path.join(rdir, 'logs')]
    elif diff is None:
        ev['verdict'] = 'NO DIFF'
        ev['regressions'] = ['no diff was produced: the base could not be booted or resolved']
    else:
        ev['verdict'] = 'PASS' if not ev['regressions'] else 'FINDINGS'
    return ev


def registered_ids(rdir):
    """Every id a saved boot result registered -> {id: where}: every registry the server had (registry/all, one file
    per registry), and the loot tables, advancements and recipes it loaded. None when the result has no dump."""
    reg = os.path.join(rdir, 'registry')
    if not os.path.isdir(os.path.join(reg, 'all')):
        return None
    out = {}

    def take(path, where):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                for ln in f:
                    i = ln.split('\t', 1)[0].strip()
                    if i:
                        out.setdefault(i, where)
        except OSError:
            pass
    for path in sorted(glob.glob(os.path.join(reg, 'all', '*.txt'))):
        # minecraft__worldgen--structure.txt is the registry minecraft:worldgen/structure
        take(path, os.path.basename(path)[:-4].replace('__', ':', 1).replace('--', '/'))
    for fn, where in (('loot_tables.txt', 'loot tables'), ('advancements.txt', 'advancements'), ('recipes.tsv', 'recipes')):
        take(os.path.join(reg, fn), where)
    return out


# --------------------------------------------------------------------------- references in the pack

SWEEP_ROOTS = (
    ('scripts (kubejs, mirrored to the two distros)', 'kubejs/server_scripts'),
    ('scripts (kubejs, mirrored to the two distros)', 'kubejs/startup_scripts'),
    ('scripts (kubejs, mirrored to the two distros)', 'kubejs/client_scripts'),
    ('kubejs data (tags, recipes, loot)', 'kubejs/data'),
    ('registries', 'kubejs/config/icraft'),
    ('datapack sources (Codex and overrides)', 'datapack_sources'),
    ('config, root', 'config'), ('config, root', 'defaultconfigs'),
    ('config, server distribution', 'server_distribution/config'), ('config, server distribution', 'server_distribution/defaultconfigs'),
    ('config, client distribution', 'distribution/client/config'), ('config, client distribution', 'distribution/client/defaultconfigs'),
    ('dev tool lists', 'dev/rosters'), ('dev tool lists', 'dev/loot_audit'), ('dev tool lists', 'dev/loud'),
    ('dev tool lists', 'dev/gen_keybinds.ps1'), ('dev tool lists', 'dev/mods/mod_index.policy.json'),
    ('wiki', 'wiki'),
)
SWEEP_SKIP = ('/.cache', '/__pycache__', '/node_modules', 'dev/loot_audit/.cache')


def sweep(ids=(), namespaces=(), words=(), max_bytes=4000000):
    """Every place in the pack that names one of `ids`, any id of `namespaces`, or one of `words` as a quoted
    string or a file name. -> {area: {file: [(line number, what)]}}"""
    ids, namespaces = set(ids), set(namespaces)
    words = [w for w in words if w and len(w) >= 3]
    # the mod id as a word of its own: 'modid', "modid", @modid, mods.modid. An id (modid:thing) is counted as an id
    word_rx = re.compile(r'''(?:['"`@]|mods\.)(%s)(?=['"`\].,)\s]|$)''' % '|'.join(re.escape(w) for w in words)) if words else None
    needles = [ns + ':' for ns in namespaces] + sorted(set(i.split(':', 1)[0] + ':' for i in ids)) + words
    hits = OrderedDict()

    def scan(area, name, text):
        if not any(n in text for n in needles):
            return
        found = []
        for no, line in enumerate(text.split('\n'), 1):
            if not any(n in line for n in needles):
                continue
            for tok in RX_ID.findall(line):
                tok = tok.rstrip('.')
                if tok in ids or tok.split(':', 1)[0] in namespaces:
                    found.append((no, tok))
            if word_rx:
                for m in word_rx.finditer(line):
                    found.append((no, 'the mod id %s' % m.group(1)))
        if found:
            hits.setdefault(area, OrderedDict())[name] = sorted(set(found))

    def scan_file(area, path):
        name = os.path.relpath(path, MC).replace('\\', '/')
        if any(s in '/' + name for s in SWEEP_SKIP):
            return
        low = path.lower()
        base = os.path.basename(low)
        stem = base.split('.', 1)[0]
        if any(stem == w or re.match(re.escape(w) + r'[-_.]', base) for w in words) and '/config' in '/' + name:
            hits.setdefault(area, OrderedDict()).setdefault(name, []).append((0, 'the file is named for the mod'))
        if low.endswith('.zip'):
            try:
                with zipfile.ZipFile(path) as zf:
                    for member in zf.namelist():
                        if member.lower().endswith(TEXT_EXT) and zf.getinfo(member).file_size <= max_bytes:
                            scan('datapacks (inside a zip)', name + '!' + member, zf.read(member).decode('utf-8', 'replace'))
            except (zipfile.BadZipFile, OSError):
                pass
            return
        if not low.endswith(TEXT_EXT):
            return
        try:
            if os.path.getsize(path) > max_bytes:
                return
            with open(path, 'r', encoding='utf-8', errors='replace') as f:
                text = f.read()
        except OSError:
            return
        scan('quests' + area[6:] if area.startswith('config') and '/heracles/' in '/' + name else area, name, text)

    for area, root in SWEEP_ROOTS:
        path = core.mc(root)
        if os.path.isfile(path):
            scan_file(area, path)
            continue
        for dp, dn, fn in os.walk(path):
            dn[:] = sorted(d for d in dn if not d.startswith('.'))
            for f in sorted(fn):
                scan_file(area, os.path.join(dp, f))
    return hits


DISTRO_PREFIXES = (('server_distribution/', 'the server distribution'), ('distribution/client/', 'the client distribution'))


def sweep_text(hits, per_file=6, per_area=40):
    """The references as text. A file of a distribution that names exactly what its root copy names is counted,
    not listed: the three trees are mirrors for scripts, datapacks and quests."""
    root = {}
    for files in hits.values():
        for name, found in files.items():
            if not name.startswith(tuple(pre for pre, _ in DISTRO_PREFIXES)):
                root[name] = found
    mirrored = dict((label, 0) for _pre, label in DISTRO_PREFIXES)
    shown = {}
    for area, files in hits.items():
        for name, found in files.items():
            twin = None
            for pre, label in DISTRO_PREFIXES:
                if name.startswith(pre) and root.get(name[len(pre):]) == found:
                    twin = label
            if twin:
                mirrored[twin] += 1
            else:
                shown.setdefault(area, {})[name] = found
    out = []
    total = sum(len(v) for files in hits.values() for v in files.values())
    out.append('%d reference(s) in %d file(s)' % (total, sum(len(f) for f in hits.values())))
    for area, files in shown.items():
        out.append('')
        out.append('  %s: %d file(s), %d reference(s)' % (area, len(files), sum(len(v) for v in files.values())))
        for i, (name, found) in enumerate(files.items()):
            if i == per_area:
                out.append('    ... and %d more file(s)' % (len(files) - per_area))
                break
            line = ', '.join(('%s' % w if not no else 'line %d %s' % (no, w)) for no, w in found[:per_file])
            out.append('    %s: %s%s' % (name, line, ' ... (%d in all)' % len(found) if len(found) > per_file else ''))
    for label, n in mirrored.items():
        if n:
            out.append('')
            out.append('  %s: %d file(s) with the same references as their root copy (not listed)' % (label, n))
    return '\n'.join(out)


# --------------------------------------------------------------------------- add

def cmd_add(args):
    import intake_derive as derive
    import mod_index
    jar = os.path.abspath(args.jar)
    if not os.path.isfile(jar):
        die('not a file: %s' % jar)
    filename = os.path.basename(jar)
    index = core.load_index()
    # the launcher writes a new mod's metafile straight into the instance's index; in the instance checkout that
    # IS the source index, so the metafile to add may already sit where it belongs
    in_place = None
    if args.metafile and os.path.isfile(args.metafile):
        dest = core.mc('mods/.index', os.path.basename(args.metafile))
        if os.path.exists(dest) and os.path.samefile(args.metafile, dest):
            in_place = dest
    if any(m['jar'].lower() == filename.lower() and not (in_place and m['metafile'] == os.path.basename(in_place)) for m in index):
        die('%s is already in the index (%s): a new version of a mod is `update`' % (
            filename, [m['metafile'] for m in index if m['jar'].lower() == filename.lower()][0]))
    if in_place and core.slug_of(os.path.basename(in_place)) in core.load_records():
        die('%s already has a record: it is not a new mod (a new version is `update`)' % os.path.basename(in_place))
    policy = mod_index.load_policy()
    for pat in list(policy['server_skip_patterns']) + deny_patterns():
        if pat.lower() in filename.lower():
            die("the jar name matches the pattern '%s' (a retired or skipped mod): the clean-up would delete it on "
                'consumers. Take the pattern out first (dev/mods/mod_index.policy.json, cleanup_stale_jars.ps1, '
                'the launcher\'s DENY_LIST_PATTERNS) and say why in the commit' % pat)
    say('[intake] add: %s' % filename)
    inv, ctx = load_inventory(args)
    recs = scan_jar(jar, dict(ctx))
    top = recs[0]
    mod_ids = [m.get('id') for m in top['identity']['mods'] if m.get('id')]
    installed = {}
    for name, rr in inv.items():
        if name.lower() == filename.lower():       # the candidate itself, when it already sits in the mods folder
            continue
        for r in rr:
            for m in r['identity']['mods']:
                installed.setdefault(m.get('id'), []).append(name if r is rr[0] else '%s (nested)' % name)
    clash = [(i, installed[i]) for i in mod_ids if i in installed and any('(nested)' not in x for x in installed[i])]
    if clash:
        die('the pack already has the mod id %s (%s): a new version of a mod is `update`' % (clash[0][0], ', '.join(clash[0][1])))
    own_ids = set(m.get('id') for r in recs for m in r['identity']['mods'])
    missing = sorted(set(d['id'] for d in top['identity']['dependencies']
                         if d.get('mandatory') and d['id'] not in ('minecraft', 'forge', 'fml', 'java') and d['id'] not in installed and d['id'] not in own_ids))
    if missing and not args.force:
        die('it needs %s, which no jar of the pack provides: add that first (or --force to see the boot fail)' % ', '.join(missing))

    # 1. the metafile, into the source index
    if args.metafile:
        raw = open(args.metafile, 'rb').read().replace(b'\r\n', b'\n')
        errs = []
        meta = mod_index.parse_metafile(os.path.basename(args.metafile), raw, errs, 'the given metafile')
        if meta is None:
            die('; '.join(errs))
        if meta['filename'] != filename:
            die('the metafile names %s, the jar is %s' % (meta['filename'], filename))
        import tomllib
        dl = tomllib.loads(meta['text'])['download']
        if file_hash(jar, dl['hash-format']) != dl['hash']:
            die('the jar does not have the %s the metafile records: not the file the launcher downloaded' % dl['hash-format'])
        text, ok = set_toml_value(meta['text'], 'side', args.side)
        if not ok:
            text = text.replace('\n', "\nside = '%s'\n" % args.side, 1)
        slug = args.slug or core.slug_of(os.path.basename(args.metafile))
        name = meta['name']
    else:
        name = args.name or (top['identity']['mods'][0].get('name') if top['identity']['mods'] else None) or filename[:-4]
        slug = args.slug or slugify(name)
        hfmt, mode, url, update = source_args(args, filename)
        text = render_metafile(filename, name, args.side, hfmt, file_hash(jar, hfmt), mode, url, update)
    if not re.fullmatch(r'[a-z0-9][a-z0-9._+-]*', slug):
        die('slug %r: lower-case letters, digits and - only' % slug)
    meta_path = core.mc(mod_index.SOURCE_REL, slug + '.pw.toml')
    before = None
    if in_place and os.path.samefile(in_place, meta_path):
        before = open(meta_path, 'rb').read()
    elif os.path.exists(meta_path) or os.path.exists(core.record_path(slug)) or slug in core.load_records():
        die('%s already exists: choose another --slug' % rel(meta_path if os.path.exists(meta_path) else core.record_path(slug)))
    write_bytes(meta_path, text.encode('utf-8'))
    say('[intake] wrote %s (side %s)' % (rel(meta_path), args.side))
    if generate_index() != 0:
        if before is None:
            os.remove(meta_path)
        else:
            write_bytes(meta_path, before)
        run(py('dev/mods/mod_index.py', 'generate'))
        die('the mod index gate refuses this metafile (above); nothing was kept')

    # 2. the boot: the mod set with every jar verified, then the full pack with the mod in
    boot = None
    rc_boot = 0
    if args.side == 'client':
        say('[intake] client-only: the server index does not carry it; no server boot can test it')
        if not args.no_boot:
            rc, n = boot_modset(args, [os.path.dirname(jar)])
            if rc != 0:
                say('[intake] the server mod set could not be verified (exit %s)' % rc)
    elif not args.no_boot:
        rc, n = boot_modset(args, [os.path.dirname(jar)])
        if rc != 0:
            say('[intake] the mod set could not be computed or a jar failed its hash (exit %s): no boot' % rc)
            rc_boot = rc
        else:
            name_result = args.result or ('intake-' + slug)
            rc_boot, rdir, diff = boot_compare(args, name_result, args.base, [os.path.dirname(jar)])
            if os.path.isfile(os.path.join(rdir, 'result.json')):
                boot = boot_evidence(rdir, diff, today())

    # 3. the record
    m = [x for x in core.load_index() if x['slug'] == slug][0]
    inv[filename] = recs
    state = derive.PackState(inv, None)
    rec = derive.build_record(recs, m, state, 'add', boot=boot, today=today())
    for d in rec['decisions']:
        if d['key'] == 'side':
            d.update(status='decided', answer=args.side, by='add --side', on=today())
            d.pop('basis', None)
    core.save_record(rec)
    say('')
    say(core.render(rec, state.regs, core.load_baseline()))
    owed, unapplied = core.owed_of(rec, state.regs)
    say('')
    say('[intake] record: %s' % rel(core.record_path(slug)))
    say('[intake] %d decision(s) owed. Answer each (intake.py decide %s <key> <answer>), apply the registry ones '
        '(intake.py apply %s), then commit the metafile, the generated indexes and the record together.' % (len(owed), slug, slug))
    say('[intake] to back out: python -I .minecraft/dev/mods/intake.py remove %s --apply --no-deny' % slug)
    if boot is not None and boot['verdict'] != 'PASS':
        return EXIT_FINDINGS
    return EXIT_OK if rc_boot in (0, 1) else rc_boot


# --------------------------------------------------------------------------- update

FOLDERS_1_21 = ('recipe', 'advancement', 'loot_table', 'structure', 'predicate', 'item_modifier', 'function',
                'tags/item', 'tags/block', 'tags/entity_type', 'tags/fluid')
STATIC_ID_KINDS = ('loot_tables', 'recipes', 'advancements', 'dimension', 'lang item', 'lang block', 'lang entity')


def static_diff(old_jar, new_jar):
    a, b = jar_ids(old_jar), jar_ids(new_jar)
    out = OrderedDict()
    for kind in sorted(set(a) | set(b)):
        xa, xb = a.get(kind, {}), b.get(kind, {})
        gone = sorted(set(xa) - set(xb))
        new = sorted(set(xb) - set(xa))
        changed = sorted(k for k in set(xa) & set(xb) if xa[k] != xb[k])
        if gone or new or changed:
            out[kind] = {'vanished': gone, 'added': new, 'changed': changed}
    return out


def cmd_update(args):
    import intake_derive as derive
    import mod_index
    index = core.load_index()
    hit = [m for m in index if m['slug'] == args.mod]
    if not hit:
        die('no metafile %s.pw.toml in the index (python -I .minecraft/dev/mods/mod_index.py list)' % args.mod)
    m = hit[0]
    new_jar = os.path.abspath(args.jar)
    if not os.path.isfile(new_jar):
        die('not a file: %s' % new_jar)
    new_name = os.path.basename(new_jar)
    if m['own'] and not args.diff_only and m['jar'] != new_name:
        # this command never moves the metafile, the three jar copies or the manifest line of an own jar. AFTER a
        # release with a new file name the index names the new jar already: then it runs, and only the record moves
        die('%s is one of the pack\'s own jars: its jar, its manifest line and its metafile are moved by the '
            'custom-jar-release procedure. Run this command after that release, with the released jar (it then '
            'rewrites the record only), or compare two builds with --diff-only' % m['jar'])
    if m['where'] != 'source' and not args.diff_only:
        die('%s is a client-distribution-only metafile, kept by hand: --diff-only' % m['metafile'])
    report = []
    out = report.append
    # the launcher's own "update" moves the metafile itself: the index then names the new jar already, and the
    # record still names the old one
    already = m['jar'] == new_name and not args.diff_only
    old_name = m['jar']
    if already:
        hfmt0, hval0 = m['hash'].split(':', 1)
        if file_hash(new_jar, hfmt0) != hval0:
            die('the index names %s with another %s than this file has: not the jar the metafile describes' % (new_name, hfmt0))
        old_name = (core.load_records().get(m['slug']) or {}).get('jar')
        if not old_name or old_name == new_name:
            die('the index and the record both name %s already: there is nothing to update' % new_name)
    out('UPDATE  %s   %s -> %s' % (m['slug'], old_name, new_name))
    old_jar = os.path.abspath(args.old_jar) if args.old_jar else find_jar(old_name, args)
    if old_jar and os.path.abspath(old_jar) == new_jar:
        old_jar = None
    sd = OrderedDict()
    if old_jar and os.path.isfile(old_jar):
        sd = static_diff(old_jar, new_jar)
        out('')
        out('What the two jars ship (static): %s' % ('no data file was added, removed or changed' if not sd else ''))
        for kind, v in sd.items():
            out('  %-28s vanished %d, added %d, changed %d%s' % (
                kind, len(v['vanished']), len(v['added']), len(v['changed']),
                '   (a 1.21-layout folder: 1.20.1 never reads it, so nothing of it existed in game)' if kind in FOLDERS_1_21 else ''))
            for label in ('vanished', 'changed'):
                if v[label] and (label == 'vanished' or kind in ('loot_tables', 'recipes')):
                    out('      %s: %s%s' % (label, ', '.join(v[label][:12]), ' ... (%d in all)' % len(v[label]) if len(v[label]) > 12 else ''))
    else:
        out('')
        out('The old jar %s is not on this PC: no static comparison (pass --old-jar <path>).' % old_name)

    boot = None
    boot_dir = None
    rc_boot = 0
    if already:
        say('[intake] %s names %s already (%s): left as it is' % (
            m['metafile'], new_name, 'a custom-jar release' if m['own'] else 'the launcher moved the metafile'))
        if generate_index() != 0:
            die('the mod index gate fails (above): fix that first')
    elif not args.diff_only:
        raw = open(core.mc(mod_index.SOURCE_REL, m['metafile']), 'rb').read().decode('utf-8')
        import tomllib
        cur = tomllib.loads(raw)
        hfmt = cur['download']['hash-format']
        text, _ = set_toml_value(raw, 'filename', new_name)
        text, _ = set_toml_value(text, 'hash', file_hash(new_jar, hfmt), 'download')
        up = cur.get('update') or {}
        if 'modrinth' in up:
            if not args.version:
                die('a Modrinth mod: give the new version id, --version <id> (the mod page, "Technical information")')
            text, _ = set_toml_value(text, 'version', args.version, 'update.modrinth')
            text, _ = set_toml_value(text, 'url', args.url or 'https://cdn.modrinth.com/data/%s/versions/%s/%s' % (
                up['modrinth'].get('mod-id'), args.version, new_name), 'download')
        elif 'curseforge' in up:
            if not args.file_id:
                die('a CurseForge mod: give the new file id, --file-id <n> (the number at the end of the file\'s page address)')
            text, _ = set_toml_value(text, 'file-id', int(args.file_id), 'update.curseforge')
        elif args.url:
            text, _ = set_toml_value(text, 'url', args.url, 'download')
        else:
            die('a mod fetched from a plain url: give the new one, --url <url>')
        write_bytes(core.mc(mod_index.SOURCE_REL, m['metafile']), text.encode('utf-8'))
        say('[intake] rewrote %s for %s' % (m['metafile'], new_name))
        if generate_index() != 0:
            write_bytes(core.mc(mod_index.SOURCE_REL, m['metafile']), raw.encode('utf-8'))
            run(py('dev/mods/mod_index.py', 'generate'))
            die('the mod index gate refuses the new metafile (above); the old one is back')
    if not args.diff_only:
        if m['side'] != 'client' and not args.no_boot:
            rc, n = boot_modset(args, [os.path.dirname(new_jar)])
            if rc != 0:
                say('[intake] the mod set could not be computed or a jar failed its hash (exit %s): no boot' % rc)
                rc_boot = rc
            else:
                rc_boot, rdir, diff = boot_compare(args, args.result or ('update-' + m['slug']), args.base, [os.path.dirname(new_jar)])
                if os.path.isfile(os.path.join(rdir, 'result.json')):
                    boot, boot_dir = boot_evidence(rdir, diff, today()), rdir
    elif args.boot_result:
        # --diff-only with two boots that already exist: <result of the new side>, diffed against --base
        rdir = args.boot_result if os.path.isdir(args.boot_result) else os.path.join(results_root(), args.boot_result)
        diffs = sorted(glob.glob(os.path.join(rdir, 'diff-vs-*.json')), key=os.path.getmtime)
        if not diffs:
            die('%s has no diff-vs-*.json: make one with boot.ps1 -Diff <old>,<new>' % rdir)
        with open(diffs[-1], 'r', encoding='utf-8') as f:
            boot, boot_dir = boot_evidence(rdir, json.load(f), today()), rdir

    # With a boot, an id has vanished when the GAME stopped registering it: the boot diff says which. An id that only
    # left the jar's files (a recipe file named like an item, a language key) is checked against what the new boot
    # registers and listed apart; it is swept as a vanished id only when no boot says what the game registers.
    vanished = OrderedDict()
    booted = boot is not None and boot['verdict'] in ('PASS', 'FINDINGS')
    new_regs = registered_ids(boot_dir) if booted else None
    if boot is not None:
        out('')
        out('The boot, new against old (%s against %s): %s, %d regression(s)' % (boot['result'], boot['base'], boot['verdict'], len(boot['regressions'])))
        for r in boot['regressions']:
            out('  REGRESSION: ' + r)
        for ln in boot['lines']:
            out('  ' + ln)
        for reg, ids in boot['removed'].items():
            out('  VANISHED from %s: %d: %s%s' % (reg, len(ids), ', '.join(ids[:12]), ' ...' if len(ids) > 12 else ''))
            for i in ids:
                vanished[i] = 'registry %s' % reg
        for reg, ids in boot['added'].items():
            out('  new in %s: %d: %s%s' % (reg, len(ids), ', '.join(ids[:8]), ' ...' if len(ids) > 8 else ''))
    if not booted:
        out('')
        out('No boot diff: which ids the game stops registering is NOT known. The static comparison only says which files left the jar.')
    elif new_regs is None:
        out("  (the boot result holds no registry dump: the ids that only left the jar's files are not checked against it)")
    file_only, still = OrderedDict(), OrderedDict()
    for kind, v in sd.items():
        if kind in STATIC_ID_KINDS or kind.startswith('worldgen/'):
            for i in v['vanished']:
                why = 'the jar no longer ships it (%s)' % kind
                if not booted:
                    vanished.setdefault(i, why)
                elif i in vanished:
                    continue
                elif new_regs is not None and i in new_regs:
                    still.setdefault(i, new_regs[i])
                else:
                    file_only.setdefault(i, why)
    changed_tables = (sd.get('loot_tables') or {}).get('changed') or []
    out('')
    if vanished:
        hits = sweep(ids=vanished)
        out('%s: %d. Every place in the pack that still names one:' % (
            'Ids the game stopped registering (the boot diff)' if booted else 'Ids that vanished', len(vanished)))
        out(sweep_text(hits))
        named = set(t for files in hits.values() for found in files.values() for _n, t in found)
        for i in sorted(named):
            out('    %s: %s' % (i, vanished.get(i, '')))
    else:
        out('No id vanished%s.' % (' from the game (the boot diff)' if booted else ''))
    if still:
        out('')
        out("Left the jar's files, still registered in the new boot (NOT vanished): %d: %s%s" % (
            len(still), ', '.join('%s (%s)' % kv for kv in list(still.items())[:12]), ' ...' if len(still) > 12 else ''))
    if file_only:
        hits = sweep(ids=file_only)
        out('')
        out("Left the jar's files and %s: %d. Not counted as vanished; places that name one:" % (
            'not checked against the new boot (no registry dump)' if new_regs is None
            else 'registered in neither boot (a language key, a file the game never loaded)', len(file_only)))
        out('  ' + ', '.join(list(file_only)[:20]) + (' ...' if len(file_only) > 20 else ''))
        out(sweep_text(hits))
    if changed_tables:
        hits = sweep(ids=changed_tables)
        out('')
        out('Loot tables whose content changed: %d. Pack rules that name one of them:' % len(changed_tables))
        out(sweep_text(hits))

    if not args.diff_only:
        records = core.load_records()
        prev = records.get(m['slug'])
        inv, ctx = load_inventory(args)
        recs = scan_jar(new_jar, dict(ctx))
        inv.pop(old_name, None)
        inv[new_name] = recs
        state = derive.PackState(inv, None)
        m2 = [x for x in core.load_index() if x['slug'] == m['slug']][0]
        rec = derive.build_record(recs, m2, state, 'update', boot=None, today=today(), previous=prev)
        # the boot of an update shows what CHANGED, not what the mod registers: it answers the boot question only
        rec['decisions'] = [derive.boot_decision(m2, boot, 'update')] + [d for d in rec['decisions'] if d['key'] != 'boot']
        if boot is not None:
            rec['boot'] = OrderedDict((k, boot[k]) for k in ('result', 'base', 'verdict', 'when', 'regressions', 'registered', 'lines') if k in boot)
        old_keys = set(d['key'] for d in (prev or {}).get('decisions') or [])
        new_keys = set(d['key'] for d in rec['decisions'])
        if prev is not None and prev.get('_bundle'):
            rec['_bundle'] = True
        hist = rec.setdefault('history', [])
        hist.append({'date': today(), 'what': 'updated %s -> %s: %d id(s) vanished; decisions gone: %s; new: %s' % (
            old_name, new_name, len(vanished), ', '.join(sorted(old_keys - new_keys)) or 'none',
            ', '.join(sorted(new_keys - old_keys)) or 'none')})
        core.save_record(rec)
        owed = [d for d in core.owed_of(rec, state.regs)[0] if d.get('raised') == 'update']
        out('')
        out('Record of %s rewritten (%s). Decisions the update asks for (must be answered before the push): %s' % (
            m['slug'], '.minecraft/%s/%s' % (core.RECORDS_REL, core.BUNDLE_NAME if rec.get('_bundle') else m['slug'] + '.json'),
            ', '.join(d['key'] for d in owed) or 'none'))
    text = '\n'.join(report)
    say('')
    say(text)
    if args.out:
        core.write_text(os.path.abspath(args.out), text + '\n')
        say('[intake] written: %s' % args.out)
    if boot is not None and boot['verdict'] != 'PASS':
        return EXIT_FINDINGS
    return EXIT_OK if rc_boot in (0, 1) else rc_boot


# --------------------------------------------------------------------------- remove

def deny_patterns():
    """The launcher's DENY_LIST_PATTERNS (the server's clean-up) -> [str]"""
    try:
        text = open(LAUNCHER_CONFIG, encoding='utf-8').read()
    except OSError:
        return []
    m = re.search(r'DENY_LIST_PATTERNS\s*:\s*&\[&str\]\s*=\s*&\[(.*?)\];', text, re.S)
    return re.findall(r'"([^"]+)"', m.group(1)) if m else []


def add_deny_pattern(pattern, why):
    """The pattern into the two clean-up lists that are kept in lockstep -> [files written]"""
    wrote = []
    ps1 = core.mc(DENY_PS1_REL)
    raw = open(ps1, 'rb').read()
    text = raw.decode('utf-8')
    m = re.search(r"(\$denyList\s*=\s*@\()(.*?)(\r?\n\))", text, re.S)
    if not m:
        die('%s: no $denyList block found' % DENY_PS1_REL)
    if "'%s'" % pattern not in m.group(2):
        nl = '\r\n' if '\r\n' in text else '\n'
        body = m.group(2)
        last = body.rstrip().split(nl)[-1]
        # the last entry has no comma: give it one, in front of its comment
        fixed = re.sub(r"^(\s*'[^']*')(\s*)(#.*)?$", lambda g: g.group(1) + ',' + (g.group(2) or '') + (g.group(3) or ''), last)
        body = body.rstrip()[:len(body.rstrip()) - len(last)] + fixed + nl + "    '%s'%s# %s" % (pattern, ' ' * max(1, 16 - len(pattern)), why)
        text = text[:m.start(2)] + body + text[m.end(2):]
        write_bytes(ps1, text.encode('utf-8'))
        wrote.append(DENY_PS1_REL)
    if os.path.isfile(LAUNCHER_CONFIG):
        raw = open(LAUNCHER_CONFIG, 'rb').read().decode('utf-8')
        m = re.search(r'(DENY_LIST_PATTERNS\s*:\s*&\[&str\]\s*=\s*&\[)(.*?)(\];)', raw, re.S)
        if m and '"%s"' % pattern not in m.group(2):
            nl = '\r\n' if '\r\n' in raw else '\n'
            body = m.group(2).rstrip() + nl + '    "%s",%s// %s' % (pattern, ' ' * max(1, 16 - len(pattern)), why) + nl
            write_bytes(LAUNCHER_CONFIG, (raw[:m.start(2)] + body + raw[m.end(2):]).encode('utf-8'))
            wrote.append(rel(LAUNCHER_CONFIG))
    return wrote


def cmd_remove(args):
    import intake_derive as derive
    import mod_index
    index = core.load_index()
    hit = [m for m in index if m['slug'] == args.mod]
    if not hit:
        die('no metafile %s.pw.toml in the index (python -I .minecraft/dev/mods/mod_index.py list)' % args.mod)
    m = hit[0]
    if m['where'] != 'source':
        die('%s is a client-distribution-only metafile (dev/mods/mod_index.policy.json, client_distro_only): remove it there' % m['metafile'])
    records = core.load_records()
    rec = records.get(m['slug']) or {}
    report = []
    out = report.append
    out('REMOVE  %s   %s (side %s)%s' % (m['slug'], m['jar'], m['side'], '' if args.apply else '      DRY RUN: nothing is changed'))

    mod_ids = list(rec.get('mod_ids') or [])
    nested = list(rec.get('nested_mod_ids') or [])
    namespaces = list(rec.get('namespaces') or [])
    inv = None
    try:
        inv, _ctx = load_inventory(args)
    except Exception as ex:            # no jars on this machine: the record's ids are what there is
        out('  (the installed jars could not be scanned: %s; dependents are not checked)' % ex)
    if inv and m['jar'] in inv:
        recs = inv[m['jar']]
        mod_ids = [x.get('id') for x in recs[0]['identity']['mods'] if x.get('id')]
        nested = sorted(set(x.get('id') for r in recs[1:] for x in r['identity']['mods'] if x.get('id')) - set(mod_ids))
        ns = set(mod_ids) | set(nested)
        for r in recs:
            ns.update(r['data'].get('namespaces_no_installed_mod_has') or [])
        namespaces = sorted(ns - set(derive.SHARED_NS))
    out('  mod ids: %s%s' % (', '.join(mod_ids) or '(none known)', ('; nested: ' + ', '.join(nested)) if nested else ''))
    if m['own']:
        out('  NOTE: one of the pack\'s own jars. Its three committed copies and its line in custom_jars_manifest.json go '
            'with it (the custom-jar-release procedure regenerates the manifest).')

    # what needs it
    out('')
    if inv:
        elsewhere = set()
        for name, rr in inv.items():
            if name != m['jar']:
                for r in rr:
                    elsewhere.update(x.get('id') for x in r['identity']['mods'])
        hard, soft = [], []
        for name, rr in inv.items():
            if name == m['jar']:
                continue
            for r in rr:
                for d in r['identity']['dependencies']:
                    if d['id'] in mod_ids or (d['id'] in nested and d['id'] not in elsewhere):
                        (hard if d.get('mandatory') else soft).append('%s %s %s%s' % (
                            name, 'needs' if d.get('mandatory') else 'uses', d['id'], '' if r is rr[0] else ' (its nested %s)' % r['file']))
        out('Depends on it: %d jar(s) cannot load without it, %d use it when present' % (len(set(hard)), len(set(soft))))
        for h in sorted(set(hard)):
            out('  BREAKS: ' + h)
        for s in sorted(set(soft))[:12]:
            out('  optional: ' + s)
        only_here = [n for n in nested if n not in elsewhere]
        if only_here:
            out('  nested mods no other jar provides (they leave with it): ' + ', '.join(only_here))

    # references
    hits = sweep(namespaces=namespaces, words=mod_ids)
    out('')
    out('References to its ids (namespaces %s) and to its mod id:' % (', '.join(namespaces) or '-'))
    out(sweep_text(hits))
    regs = core.Registries()
    reg_b = [e for e in list(regs.bosses) + list(regs.aliases) if e.split(':', 1)[0] in namespaces]
    reg_d = [e for e in regs.dims if e.split(':', 1)[0] in namespaces]
    if reg_b or reg_d:
        out('')
        out('Registry entries that go with it (edit kubejs/config/icraft/registry, then python .minecraft/dev/rosters/validate.py --notes):')
        for e in reg_b:
            out('  bosses.json      %s: %s' % (e, regs.describe('bosses', e)))
        for e in reg_d:
            out('  dimensions.json  %s: %s' % (e, regs.describe('dimensions', e)))
        rush = {}
        for e in reg_b:
            r = (regs.boss(e) or {}).get('rush')
            if r:
                rush[r] = rush.get(r, 0) + 1
        if rush:
            out('  boss-rush rosters shrink (the roster size is the denominator of a ruled percentage): ' +
                ', '.join('roster %s by %d' % kv for kv in sorted(rush.items())))

    # the deny list
    remaining = [x['jar'] for x in index if x['slug'] != m['slug']]
    pattern = args.deny_pattern or mod_index.skip_token(m['jar'], remaining).lower()
    clash = [f for f in remaining if pattern.lower() in f.lower()]
    out('')
    if args.no_deny:
        out('Deny list: none (--no-deny): for a mod that never shipped. A jar that did ship leaves by the index alone, '
            'and comes back with any client that still has it.')
    else:
        out("Deny-list pattern: '%s'%s" % (pattern, '' if not clash else '   CLASHES with %s: pass --deny-pattern <a longer piece of the name>' % ', '.join(clash[:3])))
        out("  goes into $denyList of .minecraft/%s (mirrored to the two distros and the server seed copy by sync-distros.ps1 -Fix)" % DENY_PS1_REL)
        out('  and DENY_LIST_PATTERNS of %s (the server\'s clean-up: takes effect with the next launcher build)' % rel(LAUNCHER_CONFIG))
    out('')
    out('How the jar leaves:')
    if m['side'] != 'server':
        out('  dev client     next launch: the prelaunch resets to origin/main and cleanup_stale_jars.ps1 deletes a jar the index no longer names')
        out('  tester client  next sync: the same script; a client that has not synced still has the jar and cannot join a server without it')
    if m['side'] != 'client':
        out('  server         next restart (the policy Cycle): the launcher\'s clean-up deletes a jar the index no longer names')
    out('  NOT removed anywhere: its config files (consumers only report a config delete), and what it left in the world')
    out('  (its blocks, items and entities vanish from existing chunks and inventories at the next load).')
    cfg = []
    for area, files in hits.items():
        for name, found in files.items():
            if any(w == 'the file is named for the mod' for _n, w in found):
                cfg.append(name)
    if cfg:
        out('  its tracked config files (delete them in the same commit): ' + ', '.join(cfg))

    if args.apply:
        if clash and not args.no_deny:
            die("the deny pattern '%s' would delete %s on every consumer: pass --deny-pattern" % (pattern, clash[0]))
        wrote = []
        os.remove(core.mc(mod_index.SOURCE_REL, m['metafile']))
        wrote.append('deleted ' + rel(core.mc(mod_index.SOURCE_REL, m['metafile'])))
        if not args.no_deny:
            wrote += ['edited ' + w for w in add_deny_pattern(pattern, 'removed %s: %s' % (today(), args.why or m['name']))]
        if generate_index() != 0:
            die('the mod index gate fails after the removal (above): fix it before anything else', EXIT_FINDINGS)
        gone = core.delete_record(m['slug'])
        if gone:
            wrote.append('deleted .minecraft/' + gone)
        out('')
        out('APPLIED:')
        for w in wrote:
            out('  ' + w)
        out('  the generated indexes and skip lists (mod_index.py generate)')
        out('STILL TO DO BY HAND: every reference listed above, the registry entries, the config files; then')
        out('  powershell -File .minecraft\\dev\\sync-distros.ps1 -Fix    and    .minecraft\\dev\\boot\\boot.ps1 -Compare origin/main')
    else:
        out('')
        out('With --apply: the metafile and the record are deleted, the indexes regenerated%s. References are never edited by this tool.' % (
            '' if args.no_deny else ', the deny pattern written'))
    text = '\n'.join(report)
    say(text)
    if args.out:
        core.write_text(os.path.abspath(args.out), text + '\n')
        say('[intake] written: %s' % args.out)
    return EXIT_OK


# --------------------------------------------------------------------------- audit, check, show

def cmd_check(_args):
    failures, notes, stats = core.gate()
    for n in notes:
        say('[mod-intake] note   ' + n)
    for f in failures:
        say('[mod-intake] FAIL   ' + f)
    if failures:
        say('')
        say('[mod-intake] FAILED: %d finding(s). %s.' % (len(failures), core.gate_line(stats)))
        say('[mod-intake] A mod is added with intake.py add, updated with intake.py update, removed with intake.py remove; '
            'a decision is answered with intake.py decide. See .minecraft/dev/mods/README.md.')
        return EXIT_FINDINGS
    say('[mod-intake] OK - %s.' % core.gate_line(stats))
    return EXIT_OK


def backlog(records, regs, baseline):
    rows = []
    for slug, rec in records.items():
        idx, cls, score = core.priority(rec, regs)
        owed, unapplied = core.owed_of(rec, regs)
        rows.append({'mod': slug, 'jar': rec['jar'], 'class': cls, 'class_index': idx, 'score': score,
                     'owed': [d['key'] for d in owed + unapplied], 'decisions': len(rec['decisions']),
                     'adds': rec.get('adds') or {}, 'new': slug not in baseline})
    rows.sort(key=lambda r: (r['class_index'], -r['score'], r['mod']))
    return rows


def cmd_audit(args):
    import intake_derive as derive
    regs = core.Registries()
    baseline = core.load_baseline()
    made = refreshed = 0
    if args.grandfather or args.refresh is not None:
        findings = None
        if args.findings:
            findings = core.read_json(os.path.abspath(args.findings))
        inv, _ctx = load_inventory(args)
        state = derive.PackState(inv, findings)
        regs = state.regs
        index = core.load_index()
        records = core.load_records()
        if args.grandfather:
            if baseline and not args.rebaseline:
                die('%s exists: the first audit was made. A mod that came after it is NEW and gets its record from '
                    '`intake.py add` (--rebaseline makes every mod of the index grandfathered again: the operator\'s call)' % core.BASELINE_REL)
            missing_jars = [m['jar'] for m in index if m['jar'] not in inv]
            if missing_jars:
                die('%d jar(s) of the index are not on this PC, so no record can be made: %s' % (len(missing_jars), ', '.join(missing_jars[:8])))
            fresh = OrderedDict()
            for m in index:
                if m['slug'] in records and not args.rebaseline:
                    continue
                fresh[m['slug']] = derive.build_record(inv[m['jar']], m, state, 'grandfather', today=today(), previous=records.get(m['slug']))
                if os.path.isfile(core.record_path(m['slug'])):
                    os.remove(core.record_path(m['slug']))          # grandfathered now: its place is the bundle
            core.save_bundle(fresh, replace=bool(args.rebaseline))
            made = len(fresh)
            head = ''
            try:
                head = subprocess.run(['git', '-C', REPO, 'rev-parse', '--short=8', 'HEAD'], capture_output=True, text=True).stdout.strip()
            except OSError:
                pass
            doc = OrderedDict((
                ('about', ['The mods the pack had when the intake records were introduced: GRANDFATHERED.',
                           'Their owed decisions are a backlog (intake.py audit lists it by priority) and never fail the gate.',
                           'Every mod of the index that is NOT listed here is NEW: intake.py check fails while one of its decisions is owed.',
                           'Written once by `intake.py audit --grandfather`. Do not add a mod to it: add the mod with intake.py add.']),
                ('schema', 1), ('made', today()), ('commit', head),
                ('grandfathered', OrderedDict((m['slug'], m['jar']) for m in sorted(index, key=lambda x: x['slug']))),
            ))
            core.write_text(core.mc(core.BASELINE_REL), core.dump_json(doc))
            baseline = core.load_baseline()
            say('[intake] %d record(s) written into %s/%s; baseline %s: %d mods' % (made, core.RECORDS_REL, core.BUNDLE_NAME, core.BASELINE_REL, len(baseline)))
        else:
            want = set(args.refresh)
            changed_bundle = OrderedDict()
            for m in index:
                if want and m['slug'] not in want:
                    continue
                prev = records.get(m['slug'])
                recs = inv.get(m['jar'])
                if prev is None or recs is None:
                    continue
                mode = prev.get('raised') or 'grandfather'
                rec = derive.build_record(recs, m, state, mode if mode in core.RAISED else 'grandfather', today=(prev.get('made') or {}).get('date') or today(), previous=prev)
                if 'boot' in prev:
                    rec['boot'] = prev['boot']
                    rec['decisions'] = [d for d in prev['decisions'] if d['key'] == 'boot'] + [d for d in rec['decisions'] if d['key'] != 'boot']
                compact = bool(prev.get('_bundle'))
                if core.record_doc(rec, compact) == core.record_doc(prev, compact):
                    continue
                refreshed += 1
                if compact:
                    rec['_bundle'] = True
                    changed_bundle[m['slug']] = rec
                else:
                    core.save_record(rec)
            if changed_bundle:
                core.save_bundle(changed_bundle)
            say('[intake] %d record(s) changed by the refresh' % refreshed)

    failures, notes, stats = core.gate(regs)
    records = core.load_records()
    rows = backlog(records, regs, baseline)
    L = []
    L.append('MOD INTAKE AUDIT  %s' % today())
    L.append(core.gate_line(stats))
    L.append('gate: %s' % ('PASS' if not failures else '%d FINDING(S)' % len(failures)))
    for f in failures:
        L.append('  FAIL ' + f)
    for n in notes:
        L.append('  note ' + n)
    by_surface = {}
    for rec in records.values():
        for d in sum(core.owed_of(rec, regs), []):
            s = d.get('surface') or core.surface_of(d['key'])
            by_surface[s] = by_surface.get(s, 0) + 1
    L.append('')
    L.append('Owed, by surface: ' + ', '.join('%s %d' % (s, by_surface[s]) for s in core.SURFACES if s in by_surface))
    L.append('')
    L.append('The backlog, by priority (class = what the mod adds; inside a class, the heaviest first):')
    top = args.top
    for key, title in core.PRIORITY_CLASSES:
        part = [r for r in rows if r['class'] == key]
        if key == 'none':
            L.append('')
            L.append('  Nothing owed: %d mod(s)' % len(part))
            continue
        L.append('')
        L.append('  %s: %d mod(s), %d decision(s) owed' % (title.upper(), len(part), sum(len(r['owed']) for r in part)))
        for r in part[:top] if top else part:
            a = r['adds']
            adds = ', '.join('%s %s' % (a.get(k), label) for k, label in (('dimensions', 'dim'), ('boss_like', 'boss-like'), ('structures', 'struct'), ('loot_modifiers', 'loot mod')) if a.get(k))
            L.append('    %-44s %2d owed%s  [%s]  %s' % (r['mod'] + (' (NEW)' if r['new'] else ''), len(r['owed']),
                                                         (' (%s)' % adds) if adds else '', r['score'], ', '.join(r['owed'])))
        if top and len(part) > top:
            L.append('    ... and %d more (--top 0 lists all)' % (len(part) - top))
    text = '\n'.join(L)
    say(text)
    if args.out_dir:
        od = os.path.abspath(args.out_dir)
        full = text if not top else None
        if full is None:
            args2 = argparse.Namespace(**dict(vars(args), top=0, out_dir=None, grandfather=False, refresh=None))
            import io
            import contextlib
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                cmd_audit(args2)
            full = buf.getvalue()
        core.write_text(os.path.join(od, 'mod-intake-audit-%s.txt' % today()), full)
        core.write_text(os.path.join(od, 'mod-intake-audit-%s.json' % today()),
                        core.dump_json({'date': today(), 'stats': stats, 'failures': failures, 'owed_by_surface': by_surface, 'backlog': rows}))
        say('[intake] written: %s' % os.path.join(od, 'mod-intake-audit-%s.txt / .json' % today()))
    return EXIT_FINDINGS if failures else EXIT_OK


def cmd_show(args):
    records = core.load_records()
    rec = records.get(args.mod)
    if rec is None:
        near = [s for s in records if args.mod.lower() in s.lower() or args.mod.lower() in records[s]['jar'].lower()
                or args.mod.lower() in [i.lower() for i in records[s].get('mod_ids') or []]]
        if len(near) == 1:
            rec = records[near[0]]
        else:
            die('no record %s%s' % (args.mod, ('; did you mean: ' + ', '.join(near[:10])) if near else ''))
    say(core.render(rec, core.Registries(), core.load_baseline()))
    return EXIT_OK


# --------------------------------------------------------------------------- decide, apply

def parse_field(text):
    if '=' not in text:
        die('a field is written key=value (got %r)' % text)
    k, v = text.split('=', 1)
    if k == 'flags':
        return k, [x for x in v.split(',') if x]
    if v[:1] in '{[':
        try:
            return k, json.loads(v, object_pairs_hook=OrderedDict)
        except ValueError as ex:
            die('field %s: not valid JSON (%s)' % (k, ex))
    if re.fullmatch(r'-?\d+', v):
        return k, int(v)
    if re.fullmatch(r'-?\d+\.\d+', v):
        return k, float(v)
    if v in ('true', 'false'):
        return k, v == 'true'
    return k, v


def cmd_decide(args):
    records = core.load_records()
    rec = records.get(args.mod)
    if rec is None:
        die('no record %s (intake.py show <part of the name> finds one)' % args.mod)
    by = args.by or 'operator'
    if args.defaults:
        if not args.note:
            die('--defaults needs --note "<who looked, and at what>": it closes every owed question of the mod at once')
        n = 0
        regs = core.Registries()
        for d in rec['decisions']:
            surface = d.get('surface') or core.surface_of(d['key'])
            if core.effective(d, regs)[0] != 'owed' or surface in core.REGISTRY_SURFACES + ('boot', 'side'):
                continue
            if args.surface and surface not in args.surface:
                continue
            d.update(status='decided', answer='default', by=by, on=today(), note=args.note)
            n += 1
        core.save_record(rec)
        say('[intake] %s: %d decision(s) answered "default". Never answered this way: side, boot, bosses, dimensions.' % (args.mod, n))
        return EXIT_OK
    if not args.key or args.answer is None:
        die('usage: intake.py decide <mod> <key> <answer> [field=value ...]   (intake.py show %s lists the keys)' % args.mod)
    hit = [d for d in rec['decisions'] if d['key'] == args.key]
    if not hit:
        die('%s has no decision %r. Its keys: %s' % (args.mod, args.key, ', '.join(d['key'] for d in rec['decisions'])))
    d = hit[0]
    surface = d.get('surface') or core.surface_of(d['key'])
    options = d.get('options') or list(core.SURFACES[surface][2])
    fields = OrderedDict(parse_field(f) for f in args.fields)
    if args.answer not in options:
        if surface in core.REGISTRY_SURFACES + ('side', 'boot') or not args.note:
            die('%r is not an answer to %s (%s)%s' % (args.answer, args.key, ' | '.join(options),
                                                    '' if surface in core.REGISTRY_SURFACES + ('side', 'boot') else '; another answer needs --note to say what it means'))
    if surface == 'boot':
        if args.answer != 'accepted' or not args.note:
            die('the boot question is answered by a clean boot (run add or update again). To push with a known finding: '
                'decide %s boot accepted --note "<what the boot reports and why it is acceptable>"' % args.mod)
    if surface == 'side':
        import mod_index
        path = core.mc(mod_index.SOURCE_REL, args.mod + '.pw.toml')
        if not os.path.isfile(path):
            die('%s is not a source metafile: its side is not changed here' % args.mod)
        raw = open(path, 'rb').read().decode('utf-8')
        text, ok = set_toml_value(raw, 'side', args.answer)
        if text != raw:
            write_bytes(path, text.encode('utf-8'))
            say('[intake] %s: side = %s' % (rel(path), args.answer))
            if generate_index() != 0:
                write_bytes(path, raw.encode('utf-8'))
                run(py('dev/mods/mod_index.py', 'generate'))
                die('the mod index gate refuses that side (above); the metafile is back as it was')
        rec['side'] = args.answer
    for k in ('basis', 'fields', 'note'):
        d.pop(k, None)
    d.update(status='decided', answer=args.answer, by=by, on=today())
    if fields:
        d['fields'] = fields
    if args.note:
        d['note'] = args.note
    core.save_record(rec)
    regs = core.Registries()
    st, text = core.effective(d, regs)
    say('[intake] %s %s: %s  %s' % (args.mod, args.key, st.upper(), text or ''))
    if st == 'unapplied':
        say('[intake] it becomes a registry entry with: python -I .minecraft/dev/mods/intake.py apply %s' % args.mod)
    if surface == 'side':
        say('[intake] the side changed what the server installs: boot it (.minecraft\\dev\\boot\\boot.ps1 -Compare origin/main)')
    return EXIT_OK


def json_members(text, obj_key):
    """The members of the top-level object `obj_key` of a JSON text -> [(key, start, end)], and the offset of the
    object's closing brace. Offsets are of the member text (the key's quote to the end of its value)."""
    m = re.search(r'"%s"\s*:\s*\{' % re.escape(obj_key), text)
    if not m:
        raise core.IntakeError('no "%s" object' % obj_key)
    i = m.end()
    members = []
    depth, in_str, esc = 1, False, False
    key_start = None
    cur_key = None
    last_non_ws = i
    while i < len(text):
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == '"':
                in_str = False
        else:
            if c == '"':
                if depth == 1 and key_start is None:
                    key_start = i
                    j = text.index('"', i + 1)
                    while text[j - 1] == '\\':
                        j = text.index('"', j + 1)
                    cur_key = json.loads(text[i:j + 1])
                    i = j
                else:
                    in_str = True
            elif c in '{[':
                depth += 1
            elif c in '}]':
                depth -= 1
                if depth == 0:
                    if key_start is not None:
                        members.append((cur_key, key_start, last_non_ws + 1))
                    return members, i
            elif c == ',' and depth == 1:
                members.append((cur_key, key_start, last_non_ws + 1))
                key_start, cur_key = None, None
        if not c.isspace() and not (c == ',' and depth == 1 and not in_str):
            last_non_ws = i
        i += 1
    raise core.IntakeError('"%s": the object is not closed' % obj_key)


def entry_text(value):
    def one(v):
        if isinstance(v, list):
            return '[' + ', '.join(one(x) for x in v) + ']'
        if isinstance(v, dict):
            return '{ ' + ', '.join('%s: %s' % (json.dumps(k), one(x)) for k, x in v.items()) + ' }'
        return json.dumps(v)
    return one(value)


BOSS_DEFAULT_FLAGS = {'named': ['boss', 'x3'], 'miniboss': ['boss'], 'unlisted': []}


def registry_entry(d):
    """The registry entry a decided decision asks for -> (file name, object key, entity or dimension id, entry)"""
    f = OrderedDict(d.get('fields') or {})
    if d['surface'] == 'bosses':
        e = OrderedDict()
        if 'tier' in f:
            e['tier'] = f.pop('tier')
        e['kind'] = d['answer']
        if 'hp' in f:
            e['hp'] = f.pop('hp')
        flags = f.pop('flags', None)
        e['flags'] = flags if flags is not None else list(BOSS_DEFAULT_FLAGS[d['answer']])
        if not e['flags']:
            del e['flags']
        e.update(f)
        return 'bosses.json', 'bosses', d['subject'], e
    e = OrderedDict((('tier', int(d['answer'])),))
    e.update(f)
    return 'dimensions.json', 'dimensions', d['subject'], e


def cmd_apply(args):
    records = core.load_records()
    slugs = list(records) if args.all else [args.mod]
    if not args.all and args.mod not in records:
        die('no record %s' % args.mod)
    regs = core.Registries()
    todo = []
    for s in slugs:
        for d in records[s]['decisions']:
            if core.effective(d, regs)[0] == 'unapplied':
                todo.append((s, d))
    if not todo:
        say('[intake] nothing to apply: no decided boss or dimension is missing from the registries')
        return EXIT_OK
    originals, texts = {}, {}
    for s, d in todo:
        fn, obj, rid, entry = registry_entry(d)
        path = core.mc(core.REGISTRY_REL, fn)
        if fn not in texts:
            originals[fn] = open(path, 'rb').read()
            texts[fn] = originals[fn].decode('utf-8')
        text = texts[fn]
        members, close = json_members(text, obj)
        nl = '\r\n' if '\r\n' in text else '\n'
        ns = rid.split(':', 1)[0]
        after = [mm for mm in members if mm[0] == args.after] if args.after else []
        same = [mm for mm in members if mm[0].split(':', 1)[0] == ns]
        anchor = (after or same or members)[-1]
        line = '"%s": %s' % (rid, entry_text(entry))
        texts[fn] = text[:anchor[2]] + ',' + nl + '    ' + line + text[anchor[2]:]
        say('[intake] %s  <-  %s   (from %s, after %s)' % (fn, line, s, anchor[0]))
    if args.dry_run:
        say('[intake] dry run: nothing written')
        return EXIT_OK
    for fn, text in texts.items():
        write_bytes(core.mc(core.REGISTRY_REL, fn), text.encode('utf-8'))
    rc, _ = run(py('dev/rosters/validate.py', '--pack', MC, '--notes'))
    if rc != 0:
        for fn, raw in originals.items():
            write_bytes(core.mc(core.REGISTRY_REL, fn), raw)
        say('')
        say('[intake] the registry validator refuses the entry (above). NOTHING was kept: the registries are as they were.')
        say('[intake] Each line above names a rule (dev/rosters/validate.py lists them). An entry either gets the field the rule asks for')
        say('[intake] (answer again: intake.py decide <mod> <key> <answer> rush=2 stageGate=modpack/dim_x flags=loot,classPassives ...) or its')
        say('[intake] reason in dev/rosters/accepted.json. An id the validator does not know is not in the registry snapshot dev/registry:')
        say('[intake] the mod must be on main and the snapshot refreshed first (boot.ps1 -Ref origin/main -WriteSnapshot).')
        return EXIT_FINDINGS
    run(py('dev/rosters/registry_diff.py', '--pack', MC))
    say('')
    say('[intake] written: %s. Now mirror to the two distros and re-check:' % ', '.join('.minecraft/%s/%s' % (core.REGISTRY_REL, fn) for fn in texts))
    say('    powershell -File .minecraft\\dev\\sync-distros.ps1 -Fix')
    say('    python .minecraft/dev/engine-tests/run.py fast')
    say('[intake] A registry entry does not make drops, quests, Codex pages or the difficulty mod\'s exclude list: dev/rosters/README.md.')
    return EXIT_OK


# --------------------------------------------------------------------------- main

def main():
    try:
        sys.stdout.reconfigure(errors='replace')
    except (AttributeError, ValueError):
        pass
    ap = argparse.ArgumentParser(description='Add, update, remove and audit the pack\'s mods. README.md next to this file has the procedure.')
    sub = ap.add_subparsers(dest='cmd', required=True)

    def common(p, boot=True):
        p.add_argument('--mods', help='where the installed jars are (default: the PrismLauncher instance)')
        if boot:
            p.add_argument('--base', default='origin/main', help='what the boot is diffed against: a commit or a saved boot result')
            p.add_argument('--no-boot', action='store_true', help='static evidence only; the record then owes its boot')
            p.add_argument('--result', help='name of the boot result (default intake-<mod> / update-<mod>)')

    p = sub.add_parser('add', help='a new mod: metafile, indexes, inventory, boot diff, intake record')
    p.add_argument('jar')
    p.add_argument('--side', required=True, choices=('both', 'client', 'server'))
    p.add_argument('--slug')
    p.add_argument('--name')
    p.add_argument('--modrinth', help='<project id>:<version id>')
    p.add_argument('--curseforge', help='<project id>:<file id>')
    p.add_argument('--url')
    p.add_argument('--metafile', help='the .pw.toml the launcher wrote for this jar')
    p.add_argument('--force', action='store_true', help='go on although a dependency is missing')
    common(p)
    p.set_defaults(fn=cmd_add)

    p = sub.add_parser('update', help='a new version of a mod: metafile, boot diff old against new, vanished ids, references')
    p.add_argument('mod')
    p.add_argument('jar')
    p.add_argument('--version', help='Modrinth: the new version id')
    p.add_argument('--file-id', help='CurseForge: the new file id')
    p.add_argument('--url')
    p.add_argument('--old-jar', help='the jar the index names now, when it is not in --mods')
    p.add_argument('--diff-only', action='store_true', help='compare and sweep; write nothing')
    p.add_argument('--boot-result', help='with --diff-only: a saved boot result of the new side that holds a diff against the old')
    p.add_argument('--out', help='also write the report to this file')
    common(p)
    p.set_defaults(fn=cmd_update)

    p = sub.add_parser('remove', help='everything that names a mod, its deny-list entry, how it leaves; --apply to do it')
    p.add_argument('mod')
    p.add_argument('--apply', action='store_true')
    p.add_argument('--deny-pattern', help='the piece of the jar name the clean-up lists get (default: derived)')
    p.add_argument('--no-deny', action='store_true', help='no deny-list entry (a mod that never shipped)')
    p.add_argument('--why', help='the reason, written next to the deny pattern')
    p.add_argument('--out', help='also write the report to this file')
    common(p, boot=False)
    p.set_defaults(fn=cmd_remove)

    p = sub.add_parser('audit', help='records against the index; the grandfathered backlog by priority')
    p.add_argument('--grandfather', action='store_true', help='the first audit: a record for every mod of the index, and the baseline')
    p.add_argument('--rebaseline', action='store_true', help='with --grandfather: again, although a baseline exists')
    p.add_argument('--findings', help='with --grandfather / --refresh: the findings JSON of dev/mods/pack_audit.py (its loot section is used)')
    p.add_argument('--refresh', nargs='*', help='re-derive the evidence of every record (or the named ones); answers are kept')
    p.add_argument('--out-dir', help='write the full report and its JSON here (keep it out of this repo)')
    p.add_argument('--top', type=int, default=15, help='rows per priority class (0 = all)')
    common(p, boot=False)
    p.set_defaults(fn=cmd_audit)

    sub.add_parser('check', help='the gate').set_defaults(fn=cmd_check)
    p = sub.add_parser('show', help='a record as text')
    p.add_argument('mod')
    p.set_defaults(fn=cmd_show)

    p = sub.add_parser('decide', help='answer a decision of a record')
    p.add_argument('mod')
    p.add_argument('key', nargs='?')
    p.add_argument('answer', nargs='?')
    p.add_argument('fields', nargs='*', help='key=value, e.g. tier=2 hp=400 rush=2 flags=boss,x3')
    p.add_argument('--defaults', action='store_true', help='answer "default" to every owed decision but side, boot, bosses and dimensions')
    p.add_argument('--surface', action='append', help='with --defaults: only this surface (repeatable)')
    p.add_argument('--by', help='who decided (default: operator)')
    p.add_argument('--note')
    p.set_defaults(fn=cmd_decide)

    p = sub.add_parser('apply', help='decided bosses and dimensions into the registries, then the validator')
    p.add_argument('mod', nargs='?')
    p.add_argument('--all', action='store_true')
    p.add_argument('--after', help='put the entry after this id (default: after the last entry of its namespace, else last)')
    p.add_argument('--dry-run', action='store_true')
    p.set_defaults(fn=cmd_apply)

    args = ap.parse_args()
    if args.cmd == 'apply' and not args.all and not args.mod:
        die('apply <mod>, or apply --all')
    try:
        return args.fn(args)
    except core.IntakeError as ex:
        die(str(ex))


if __name__ == '__main__':
    sys.exit(main())
