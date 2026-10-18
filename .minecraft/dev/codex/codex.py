#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""The Iridescent Codex, kept current from the pack's sources of truth.

    python .minecraft/dev/codex/codex.py check      # the gate: exit 0 current, 1 stale or wrong, 2 could not run
    python .minecraft/dev/codex/codex.py release    # build the jar, validate, deploy x3, manifests, expected_state
    python .minecraft/dev/codex/codex.py diff       # what a release would change, page by page
    python .minecraft/dev/codex/codex.py facts      # the facts the book states, as the sources say them
    python .minecraft/dev/codex/codex.py inputs [--regex]   # the files the gate reads (the hook and CI use it)
    python .minecraft/dev/codex/codex.py build --out <file> # the jar, written somewhere else

What `check` fails on (each line names the page and what to run or change):
  1. a fact source it cannot read (a registry, the difficulty config, a script constant it reads by pattern);
  2. a registry boss or dimension without a name in dev/codex/names.json, or a name the registry no longer has;
  3. a placeholder or a generated page that cannot be filled (a boss the registry no longer has, an unknown field);
  4. the hand-written text: a typed fact, a boss under the wrong tier, a boss at the wrong place, an unknown id
     (codex_prose.py);
  5. the committed jar (three distros) is not what the sources build now: STALE, run `release`;
  6. the three custom_jars_manifest.json or the three packwiz markers do not carry the jar's hash;
  7. validate_codex.py (Patchouli's load rules) fails on the jar the sources build.

The book source is .minecraft/datapack_sources/iridescent_codex/data/icraft/patchouli_books/iridescent_codex/
(README.md in this folder: the placeholders, the generators, how a content change reaches the book).
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import codex_facts as cf      # noqa: E402
import codex_jar as cj        # noqa: E402
import codex_prose as cp      # noqa: E402
import codex_render as cr     # noqa: E402

MC_DEFAULT = os.path.dirname(os.path.dirname(HERE))
TOOL = '.minecraft/dev/codex/codex.py'
SRC_DIR = cj.SOURCE + '/' + cj.BOOK + '/'

# what the gate reads, relative to the repo root (codex.py inputs; the hook and the workflow trigger on it)
# (validate_codex.py also reads the keybind seed, KubeJS item ids, the icraft advancements, every committed jar for
# items and textures, and the packs that could shadow the book in each distro)
DISTRO_ROOTS = ('.minecraft/', '.minecraft/server_distribution/', '.minecraft/distribution/client/')
INPUT_PREFIXES = (['.minecraft/' + p for p in cf.INPUTS] +
                  ['.minecraft/' + cj.SOURCE + '/', '.minecraft/dev/codex/', '.minecraft/dev/registry/',
                   '.minecraft/config/defaultoptions/keybindings.txt', '.minecraft/kubejs/startup_scripts/',
                   '.minecraft/kubejs/data/icraft/advancements/', '.minecraft/mods/'] +
                  [r + 'config/paxi/' for r in DISTRO_ROOTS] +
                  [r + 'resourcepacks/' for r in DISTRO_ROOTS] +
                  [r + 'kubejs/assets/icraft/' for r in DISTRO_ROOTS] +
                  ['.minecraft/%s/%s' % (d, cj.JAR_NAME) for d in cj.DISTROS[1:]] +
                  ['.minecraft/%s' % m for m in cj.MANIFESTS] +
                  ['.minecraft/%s/.index/%s' % (d, cj.MARKER) for d in cj.DISTROS] +
                  ['.github/workflows/codex.yml'])


def ere(s):
    """a literal path as a POSIX extended regular expression (grep -E): only the characters ERE gives a meaning"""
    return ''.join('\\' + c if c in '.^$*+?()[]{}|\\' else c for c in s)


def input_regex():
    return '|'.join('^' + ere(p) + ('' if p.endswith('/') else '$') for p in INPUT_PREFIXES)


class Report(object):
    def __init__(self):
        self.lines, self.failed, self.stale = [], 0, False

    def fail(self, msg):
        self.failed += 1
        self.lines.append('  FAIL  ' + msg)

    def note(self, msg):
        self.lines.append('  ok    ' + msg)


def sha(b):
    return hashlib.sha256(b).hexdigest()


def render_all(mc, facts, report):
    """{jar path: bytes} or None when something cannot be filled; every render error is reported, not just the first."""
    style = cj._style()
    src = os.path.join(mc, cj.SOURCE, cj.BOOK)
    ok = True
    for root, dirs, files in os.walk(src):
        dirs.sort()
        for fn in sorted(files):
            if not fn.endswith('.json'):
                continue
            inner = os.path.relpath(os.path.join(root, fn), src).replace(os.sep, '/')
            label = 'book.json' if inner == 'book.json' else cj.entry_label(inner)
            try:
                data = cj._json(os.path.join(root, fn), inner)
                cr.render_entry(facts, data, label)
            except (cr.RenderError, cj.BuildError, cf.FactError) as e:
                report.fail(str(e))
                ok = False
    del style
    if not ok:
        return None
    try:
        return cj.jar_files(mc, facts)
    except (cr.RenderError, cj.BuildError, cf.FactError) as e:
        report.fail(str(e))
        return None


def prose_all(mc, facts, report):
    names = cp.Names(facts)
    ids = cp.load_ids(mc)
    src = os.path.join(mc, cj.SOURCE, cj.BOOK)
    n = 0
    for root, dirs, files in os.walk(src):
        dirs.sort()
        for fn in sorted(files):
            if not fn.endswith('.json'):
                continue
            inner = os.path.relpath(os.path.join(root, fn), src).replace(os.sep, '/')
            label = 'book.json' if inner == 'book.json' else cj.entry_label(inner)
            try:
                data = cj._json(os.path.join(root, fn), inner)
            except cj.BuildError:
                continue                    # render_all reports it
            for finding in cp.check_entry(names, ids, data, label):
                report.fail(str(finding))
                n += 1
    return n


def jar_entries(path):
    with zipfile.ZipFile(path) as z:
        return {n: z.read(n) for n in z.namelist() if not n.endswith('/')}


def page_texts(raw):
    try:
        d = json.loads(raw.decode('utf-8'))
    except ValueError:
        return None
    pages = d.get('pages') if isinstance(d, dict) else None
    if not isinstance(pages, list):
        return [json.dumps(d, ensure_ascii=False, sort_keys=True)]
    out = []
    for p in pages:
        if isinstance(p, dict):
            out.append(cp.plain(' '.join(str(p.get(k, '')) for k in ('title', 'text'))).replace('§o', ''))
        else:
            out.append(cp.plain(str(p)))
    return out


def describe_diff(old, new, limit=12):
    """lines naming the entries and pages a release would change"""
    out = []
    keys = sorted(k for k in set(old) | set(new) if not k.startswith('data/icraft/patchouli_books/iridescent_codex/en_us/'))
    for k in keys:
        a, b = old.get(k), new.get(k)
        if a == b:
            continue
        label = cj.entry_label(k[len(cj.ASSETS) + 1:]) if k.startswith(cj.ASSETS + '/') else k
        if a is None:
            out.append('%s: new in the book' % label)
            continue
        if b is None:
            out.append('%s: no longer in the book' % label)
            continue
        pa, pb = page_texts(a), page_texts(b)
        if pa is None or pb is None:
            out.append('%s: differs' % label)
            continue
        changed = [i for i in range(max(len(pa), len(pb))) if (pa[i] if i < len(pa) else None) != (pb[i] if i < len(pb) else None)]
        if not changed:
            out.append('%s: same text, other bytes (formatting or the builder)' % label)
            continue
        if len(pa) != len(pb):
            out.append('%s: %d pages in the jar, %d from the sources' % (label, len(pa), len(pb)))
        for i in changed[:3]:
            was = pa[i] if i < len(pa) else '(no page)'
            now = pb[i] if i < len(pb) else '(no page)'
            j = next((x for x in range(min(len(was), len(now))) if was[x] != now[x]), min(len(was), len(now)))
            cut = lambda s: ('...' if j > 30 else '') + s[max(0, j - 30):j + 50].replace('\n', ' ') + ('...' if len(s) > j + 50 else '')
            out.append('%s page %d: the jar says "%s"; the sources say "%s"' % (label, i + 1, cut(was), cut(now)))
        if len(changed) > 3:
            out.append('%s: and %d more pages' % (label, len(changed) - 3))
    if len(out) > limit:
        out = out[:limit] + ['... and %d more' % (len(out) - limit)]
    return out


def check_release_state(mc, jar, files, report):
    """the three committed jars, the three manifests, the three markers against the fresh build"""
    want = sha(jar)
    stale = False
    for d in cj.DISTROS:
        p = os.path.join(mc, d, cj.JAR_NAME)
        if not os.path.isfile(p):
            report.fail('.minecraft/%s/%s is missing. Run: python %s release' % (d, cj.JAR_NAME, TOOL))
            stale = True
            continue
        with open(p, 'rb') as fh:
            have = fh.read()
        if have != jar:
            stale = True
            report.fail('STALE .minecraft/%s/%s (sha256 %s; the sources build %s)' % (d, cj.JAR_NAME, sha(have)[:12], want[:12]))
    if stale:
        p = os.path.join(mc, cj.DISTROS[0], cj.JAR_NAME)
        if os.path.isfile(p):
            try:
                for line in describe_diff(jar_entries(p), files):
                    report.lines.append('        ' + line)
            except zipfile.BadZipFile:
                pass
        report.stale = True
        return
    report.note('the three committed jars are what the sources build (sha256 %s)' % want[:12])
    for m in cj.MANIFESTS:
        p = os.path.join(mc, m)
        try:
            with open(p, 'r', encoding='utf-8-sig') as fh:
                rec = (json.load(fh).get('jars') or {}).get(cj.JAR_NAME) or {}
        except (OSError, ValueError) as e:
            report.fail('.minecraft/%s: not readable (%s)' % (m, e))
            continue
        if rec.get('sha256') != want or rec.get('size') != len(jar):
            report.fail('.minecraft/%s lists %s with sha256 %s, the jar is %s. Run: python %s release'
                        % (m, cj.JAR_NAME, str(rec.get('sha256'))[:12], want[:12], TOOL))
            report.stale = True
    for d in cj.DISTROS:
        p = os.path.join(mc, d, '.index', cj.MARKER)
        try:
            with open(p, 'r', encoding='utf-8') as fh:
                text = fh.read()
        except OSError:
            report.fail('.minecraft/%s/.index/%s is missing' % (d, cj.MARKER))
            continue
        m = re.search(r"^hash\s*=\s*'([0-9a-f]+)'", text, re.M)
        if not m or m.group(1) != want:
            report.fail('.minecraft/%s/.index/%s carries hash %s, the jar is %s. Run: python %s release'
                        % (d, cj.MARKER, (m.group(1)[:12] if m else 'none'), want[:12], TOOL))
            report.stale = True
    if not report.stale:
        report.note('the three manifests and the three packwiz markers carry it')



def validate(mc, jar):
    """validate_codex.py on the fresh jar: (ok, last lines)"""
    tool = os.path.join(mc, cj.SOURCE, 'validate_codex.py')
    with tempfile.TemporaryDirectory(prefix='codex-') as tmp:
        path = os.path.join(tmp, cj.JAR_NAME)
        with open(path, 'wb') as fh:
            fh.write(jar)
        r = subprocess.run([sys.executable, '-B', tool, path, '--repo', os.path.dirname(mc)],
                           capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.returncode == 0, (r.stdout + r.stderr).strip().splitlines()


def gather(mc, report, with_prose=True):
    try:
        facts = cf.load(mc)
    except cf.FactError as e:
        report.fail('a fact source: %s' % e)
        return None, None
    for i in facts.missing_names:
        report.fail('%s is in the registry but has no name in .minecraft/dev/codex/names.json: add one '
                    '(the game\'s English name; "match": the words the text calls it by)' % i)
    for i in facts.stale_names:
        report.fail('.minecraft/dev/codex/names.json names %s, which the registry no longer has: remove it' % i)
    files = render_all(mc, facts, report)
    if with_prose:
        n = prose_all(mc, facts, report)
        if not n:
            report.note('the hand-written text names no wrong tier, place, typed fact or unknown id')
    return facts, files


def cmd_check(args):
    mc = args.mc
    report = Report()
    facts, files = gather(mc, report)
    if files is not None:
        jar = cj.zip_bytes(files)
        check_release_state(mc, jar, files, report)
        if not args.no_validate:
            ok, lines = validate(mc, jar)
            if ok:
                report.note('validate_codex.py: PASS on the jar the sources build')
            else:
                report.fail('validate_codex.py fails on the jar the sources build:')
                report.lines += ['        ' + l for l in lines if l.startswith(('  ', 'RESULT', '---'))][:30]
    print('[codex] the Iridescent Codex against its sources')
    for line in report.lines:
        print(line)
    if report.failed:
        print('[codex] FAIL: %d finding%s.' % (report.failed, '' if report.failed == 1 else 's'))
        if report.stale and not [l for l in report.lines if 'FAIL' in l and 'STALE' not in l and 'Run:' not in l]:
            print('  The book is stale against the sources. Run:  python %s release' % TOOL)
            print('  then commit the files it lists, with the change that made it stale, and push again.')
        else:
            print('  Fix the text in %s<entry>.json (placeholders: .minecraft/dev/codex/README.md),' % ('.minecraft/' + SRC_DIR + 'en_us/entries/'))
            print('  then:  python %s release   (the jar, the manifests, expected_state), commit, push.' % TOOL)
        return 1
    print('[codex] OK: the book, the jar, the manifests and the markers are current.')
    return 0


def run_ps(script, root):
    exe = 'powershell.exe' if os.name == 'nt' else 'pwsh'
    cmd = [exe, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-RepoRoot', root]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.returncode, (r.stdout + r.stderr).strip()


def cmd_release(args):
    mc = args.mc
    root = os.path.dirname(os.path.abspath(mc))
    report = Report()
    facts, files = gather(mc, report)
    if files is None or report.failed:
        for line in report.lines:
            print(line)
        print('[codex] release refused: fix the findings above first (nothing was written).')
        return 1
    jar = cj.zip_bytes(files)
    ok, lines = validate(mc, jar)
    if not ok:
        print('\n'.join(lines))
        print('[codex] release refused: validate_codex.py fails on the built jar (nothing was written).')
        return 1
    old = os.path.join(mc, cj.DISTROS[0], cj.JAR_NAME)
    changes = []
    if os.path.isfile(old):
        try:
            changes = describe_diff(jar_entries(old), files, limit=40)
        except zipfile.BadZipFile:
            changes = ['the committed jar is not a readable zip']
    for d in cj.DISTROS:
        p = os.path.join(mc, d, cj.JAR_NAME)
        with open(p, 'wb') as fh:
            fh.write(jar)
    print('[codex] built and validated %s (%d bytes, sha256 %s); written to the three distros'
          % (cj.JAR_NAME, len(jar), sha(jar)[:12]))
    for line in changes:
        print('        ' + line)
    if args.jar_only:
        print('[codex] --jar-only: manifests, markers and expected_state NOT regenerated.')
        return 0
    for script in ('regen_custom_jars_manifest.ps1', 'generate_expected_state.ps1'):
        rc, out = run_ps(os.path.join(mc, 'dev', script), root)
        tail = [l for l in out.splitlines() if l.strip()][-3:]
        print('[codex] %s: exit %d%s' % (script, rc, ('\n        ' + '\n        '.join(tail)) if tail else ''))
        if rc != 0:
            print('[codex] release stopped: %s failed (the jars are written; run it by hand).' % script)
            return 1
    report = Report()
    check_release_state(mc, jar, files, report)
    for line in report.lines:
        print(line)
    if report.failed:
        return 1
    print('[codex] commit these with the change (git add, explicit paths):')
    paths = ['.minecraft/%s/%s' % (d, cj.JAR_NAME) for d in cj.DISTROS] + \
            ['.minecraft/%s' % m for m in cj.MANIFESTS] + \
            ['.minecraft/%s/.index/%s' % (d, cj.MARKER) for d in cj.DISTROS] + \
            ['.minecraft/server_distribution/expected_state.json', '.minecraft/distribution/client/expected_state.json']
    for p in paths:
        print('  ' + p)
    print('  (and the source files you changed under .minecraft/%s)' % cj.SOURCE)
    return 0


def cmd_diff(args):
    report = Report()
    facts, files = gather(args.mc, report, with_prose=False)
    if files is None:
        print('\n'.join(report.lines))
        return 1
    p = os.path.join(args.mc, cj.DISTROS[0], cj.JAR_NAME)
    lines = describe_diff(jar_entries(p), files, limit=200)
    print('\n'.join(lines) if lines else '[codex] a release would change nothing in the book')
    return 0


def cmd_facts(args):
    f = cf.load(args.mc)
    print('rush:', ', '.join('T%d %s of %d (need %d)' % (t, cf.fmt_pct(f.rush_pct[t]), len(f.rush_roster(t)), f.rush_need(t)) for t in sorted(f.rush_pct)))
    print('token thresholds:', f.threshold)
    print('tokens per kill: boss first', f.tokens_first, 'repeat', f.tokens_repeat, 'miniboss', f.tokens_miniboss)
    for t in cf.TIERS:
        d = f.difficulty[t]
        print('tier %d: mobs %s to %s over %gh, damage +%s; dimensions: %s' % (t, cf.fmt_mult(d['start']), cf.fmt_mult(d['cap']), d['hours'],
              cf.fmt_pct(d['damage'] / 100 - 1), ', '.join('%s (%s)' % (x.name, cf.fmt_pct(x.death)) for x in f.tier_dims(t, listed=False))))
    for b in f.bosses.values():
        if b.counted:
            print('  T%s %-8s %-45s %-34s %s %s' % (b.tier, b.kind_word, b.id, b.name, ('%s, %s' % (b.place, f.arena_dim_name(b))) if b.place else '',
                  ('hp %s' % cf.fmt_int(b.fight_hp)) if b.fight_hp else ''))
    return 0


def cmd_inputs(args):
    if args.regex:
        print(input_regex())
    else:
        print('\n'.join(INPUT_PREFIXES))
    return 0


def cmd_build(args):
    report = Report()
    facts, files = gather(args.mc, report, with_prose=False)
    if files is None:
        print('\n'.join(report.lines))
        return 1
    jar = cj.zip_bytes(files)
    with open(args.out, 'wb') as fh:
        fh.write(jar)
    print('[codex] %s: %d bytes, sha256 %s' % (args.out, len(jar), sha(jar)))
    return 0


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')    # a hook's console is cp1252: the pages are not
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--mc', default=MC_DEFAULT, help='the .minecraft folder (default: this repo\'s)')
    sub = ap.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('check')
    c.add_argument('--no-validate', action='store_true', help='skip validate_codex.py (tests)')
    r = sub.add_parser('release')
    r.add_argument('--jar-only', action='store_true', help='write the three jars only (no manifests, markers, expected_state)')
    sub.add_parser('diff')
    sub.add_parser('facts')
    i = sub.add_parser('inputs')
    i.add_argument('--regex', action='store_true')
    b = sub.add_parser('build')
    b.add_argument('--out', required=True)
    args = ap.parse_args(argv)
    args.mc = os.path.abspath(args.mc)
    try:
        return {'check': cmd_check, 'release': cmd_release, 'diff': cmd_diff, 'facts': cmd_facts,
                'inputs': cmd_inputs, 'build': cmd_build}[args.cmd](args)
    except (cf.FactError, cj.BuildError) as e:
        print('[codex] could not run: %s' % e)
        return 2


if __name__ == '__main__':
    sys.exit(main())
