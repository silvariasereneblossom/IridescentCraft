#!/usr/bin/env python3
"""registry_current_test.py -- does the registry snapshot check tell a current snapshot from a stale one?

Builds a small pack-shaped tree in a temporary folder (a server mod index of four mods, one of
them a custom jar with a manifest entry, the launcher's two source files copied from this
repository, the boot tool, the check) and a snapshot of it, then changes one thing at a time:

  current                                         exit 0
  a mod added / removed / updated to a new file   exit 1  STALE, each jar named
  a client-only mod added                         exit 0  (the server's set did not change)
  the same jar, another hash in its metafile      exit 0  CHANGED, the jar named; exit 1 with --strict
  a custom jar rebuilt (manifest sha256)          exit 0  CHANGED, the jar named; exit 1 with --strict
  a snapshot without mods_recorded.tsv            exit 0  and it says what was not compared
  SOURCE.json and mods.txt disagree               exit 1
  no SOURCE.json                                  exit 2

Nothing in the real tree is touched. Usage: python .minecraft/dev/boot/registry_current_test.py
Exit 0 when every case behaves, 1 otherwise.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
COPY = ['.minecraft/dev/boot/icboot.py', '.minecraft/dev/boot/registry_current.py',
        'iridescent-launcher/icraft-core/src/packwiz.rs', 'iridescent-launcher/icraft-core/src/config.rs']
INDEX = '.minecraft/server_distribution/mods/.index'
MANIFEST = '.minecraft/server_distribution/custom_jars_manifest.json'
SNAP = '.minecraft/dev/registry'
TOOL = '.minecraft/dev/boot/registry_current.py'

META = """filename = '%(filename)s'
name = '%(name)s'
side = '%(side)s'

[download]
hash = '%(hash)s'
hash-format = 'sha1'
mode = 'url'
url = 'https://example.invalid/%(filename)s'
"""


def meta(tmp, slug, filename, side='both', digit='1'):
    p = os.path.join(tmp, INDEX, slug + '.pw.toml')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8', newline='\n') as f:
        f.write(META % {'filename': filename, 'name': slug, 'side': side, 'hash': digit * 40})


def manifest(tmp, sha_digit='a'):
    with open(os.path.join(tmp, MANIFEST), 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'jars': {'gatetest_custom-1.0.jar': {'sha256': sha_digit * 64}}}, f)


def build(tmp):
    for rel in COPY:
        dst = os.path.join(tmp, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(os.path.join(REPO, rel), dst)
    meta(tmp, 'gatetest-alpha', 'gatetest-alpha-1.0.jar')
    meta(tmp, 'gatetest-beta', 'gatetest-beta-2.3.jar', digit='2')
    meta(tmp, 'gatetest-gamma', 'gatetest-gamma-0.9.jar', digit='3')
    meta(tmp, 'gatetest-custom', 'gatetest_custom-1.0.jar', digit='4')
    manifest(tmp)
    # the snapshot of this tree, written the way boot.ps1 -WriteSnapshot does (names, recorded hashes, SOURCE.json)
    sys.path.insert(0, os.path.join(tmp, '.minecraft', 'dev', 'boot'))
    import importlib
    cc = importlib.import_module('registry_current')
    importlib.reload(cc)
    sys.path.pop(0)
    lines = cc.recorded_of_tree(cc.load_icboot(tmp), tmp)
    snap = os.path.join(tmp, SNAP)
    os.makedirs(snap, exist_ok=True)
    with open(os.path.join(snap, 'mods.txt'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(''.join(l.split('\t')[0] + '\n' for l in lines))
    with open(os.path.join(snap, 'mods_recorded.tsv'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(''.join(l + '\n' for l in lines))
    with open(os.path.join(snap, 'SOURCE.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'commit': '0' * 40, 'mods': len(lines), 'entries': {}}, f)
    return len(lines)


def run(tmp, *flags):
    r = subprocess.run([sys.executable, '-I', os.path.join(tmp, TOOL)] + list(flags) + [tmp],
                       capture_output=True, text=True, env={k: v for k, v in os.environ.items() if k != 'GITHUB_ACTIONS'})
    return r.returncode, r.stdout + r.stderr


def add_mod(tmp):
    meta(tmp, 'gatetest-delta', 'gatetest-delta-1.0.jar', digit='5')


def remove_mod(tmp):
    os.remove(os.path.join(tmp, INDEX, 'gatetest-beta.pw.toml'))


def update_mod(tmp):
    meta(tmp, 'gatetest-beta', 'gatetest-beta-2.4.jar', digit='6')


def add_client_mod(tmp):
    meta(tmp, 'gatetest-shader', 'gatetest-shader-1.0.jar', side='client', digit='7')


def rehash_mod(tmp):
    meta(tmp, 'gatetest-gamma', 'gatetest-gamma-0.9.jar', digit='8')


def rebuild_custom(tmp):
    manifest(tmp, sha_digit='b')


def drop_recorded(tmp):
    os.remove(os.path.join(tmp, SNAP, 'mods_recorded.tsv'))


def wrong_count(tmp):
    p = os.path.join(tmp, SNAP, 'SOURCE.json')
    with open(p, 'w', encoding='utf-8') as f:
        json.dump({'commit': '0' * 40, 'mods': 99, 'entries': {}}, f)


def drop_source(tmp):
    os.remove(os.path.join(tmp, SNAP, 'SOURCE.json'))


def recorded_names_differ(tmp):
    p = os.path.join(tmp, SNAP, 'mods_recorded.tsv')
    with open(p, 'r', encoding='utf-8') as f:
        lines = f.read().splitlines()
    with open(p, 'w', encoding='utf-8', newline='\n') as f:
        f.write(''.join(l + '\n' for l in lines[1:]))


# (name, change, flags, expected exit code, texts the output must hold)
CASES = [
    ('a current snapshot', None, [], 0, ['current: the pack\'s 4 server jars']),
    ('a mod added', add_mod, [], 1, ['STALE', 'in the pack, not in the snapshot: gatetest-delta-1.0.jar']),
    ('a mod removed', remove_mod, [], 1, ['STALE', 'in the snapshot, no longer in the pack: gatetest-beta-2.3.jar']),
    ('a mod updated to another file', update_mod, [], 1,
     ['in the pack, not in the snapshot: gatetest-beta-2.4.jar', 'in the snapshot, no longer in the pack: gatetest-beta-2.3.jar']),
    ('a client-only mod added: the server set is the same', add_client_mod, [], 0, ['current: the pack\'s 4 server jars']),
    ('the same jar with another index hash', rehash_mod, [], 0, ['CHANGED: 1 jar(s)', 'gatetest-gamma-0.9.jar (index hash)']),
    ('the same jar with another index hash, --strict', rehash_mod, ['--strict'], 1, ['CHANGED: 1 jar(s)']),
    ('a custom jar rebuilt under its name', rebuild_custom, [], 0, ['CHANGED: 1 jar(s)', 'gatetest_custom-1.0.jar (custom-jar manifest sha256)']),
    ('a custom jar rebuilt under its name, --strict', rebuild_custom, ['--strict'], 1, ['gatetest_custom-1.0.jar']),
    ('a snapshot without mods_recorded.tsv', drop_recorded, [], 0, ['current by jar names', 'NOT compared']),
    ('a snapshot without mods_recorded.tsv still sees an added mod', lambda t: (drop_recorded(t), add_mod(t)), [], 1, ['STALE']),
    ('SOURCE.json and mods.txt disagree', wrong_count, [], 1, ['SOURCE.json says 99 mods, mods.txt lists 4']),
    ('mods_recorded.tsv and mods.txt name different jars', recorded_names_differ, [], 1, ['name different jars']),
    ('no SOURCE.json', drop_source, [], 2, ['CANNOT RUN']),
]


def main():
    bad = 0
    for name, change, flags, want_rc, want in CASES:
        with tempfile.TemporaryDirectory(prefix='registry-test-') as tmp:
            n = build(tmp)
            if n != 4:
                print('FAIL  %s: the test tree has %d server jars, 4 expected (a launcher pattern matches a test name?)' % (name, n))
                bad += 1
                continue
            if change:
                change(tmp)
            rc, out = run(tmp, *flags)
        missing = [w for w in want if w not in out]
        ok = rc == want_rc and not missing
        print('%s  %s (exit %d%s)' % ('ok  ' if ok else 'FAIL', name, rc, '' if rc == want_rc else ', wanted %d' % want_rc))
        if not ok:
            bad += 1
            for w in missing:
                print('      the output does not hold: %s' % w)
            print('      ' + '\n      '.join(out.strip().splitlines()[-10:]))
    print('\n%d case(s), %d failed' % (len(CASES), bad))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
