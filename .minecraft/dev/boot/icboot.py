#!/usr/bin/env python3
# =============================================================================
# icboot.py - engine of the offline full-pack boot gate
# =============================================================================
# Runs under Linux (WSL), python3 >= 3.11, standard library only. boot.ps1 next
# to this file is the entry point on the dev PC; README.md says what the gate is
# for and how to read its output.
#
# Subcommands (each takes --request <json> written by boot.ps1, or plain flags):
#   setup     install Forge once into the WSL home (network needed, once)
#   modset    compute the server's mod set from an index directory, verify jars
#   run       assemble the sandbox, boot, capture, extract; writes a result folder
#   finish    merge the boot-log checker's outcome into the result, print the verdict
#   diff      compare two result folders (text + JSON)
#   snapshot  write the committed registry snapshot from a result folder
#
# Exit codes (the same for boot.ps1):
#   0  the server booted, stopped cleanly, and nothing new was found
#   1  findings: the checker found something not in the baseline, or the
#      comparison shows a regression
#   2  could not run: a prerequisite, a missing or wrong-hash jar, the lock, bad input
#   3  the server did not boot (no Done line, a crash report, an unclean exit)
#
# Nothing here reads or writes the live server, a world backup or player data.
# The world of a run is generated from a pinned seed and deleted with the run folder.
# =============================================================================

import argparse
import fcntl
import gzip
import hashlib
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tarfile
import time
import urllib.request

try:
    import tomllib
except ImportError:  # python < 3.11
    tomllib = None

TOOL_VERSION = 1
HELPER_NAME = 'zzz_icboot_registry_dump.js'      # its name inside the sandbox's kubejs/server_scripts
HERE = os.path.dirname(os.path.abspath(__file__))

EXIT_OK, EXIT_FINDINGS, EXIT_CANNOT, EXIT_BOOT = 0, 1, 2, 3


class Cannot(Exception):
    """A prerequisite is missing: exit 2, the message is the whole report."""


def say(msg=''):
    print('[icboot] ' + msg if msg else '', flush=True)


# -----------------------------------------------------------------------------
# paths
# -----------------------------------------------------------------------------
def to_wsl(p):
    """A Windows path (C:\\x\\y) as this Linux sees it; anything else unchanged."""
    if not p:
        return p
    m = re.match(r'^([A-Za-z]):[\\/](.*)$', p)
    if m:
        try:
            out = subprocess.run(['wslpath', '-a', '-u', p], capture_output=True, text=True)
            if out.returncode == 0 and out.stdout.strip():
                return out.stdout.strip()
        except OSError:
            pass
        return '/mnt/' + m.group(1).lower() + '/' + m.group(2).replace('\\', '/')
    return p.replace('\\', '/') if p.startswith('\\\\') else p


def read_text(path):
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        return f.read()


def read_lines(path):
    if not os.path.isfile(path):
        return []
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        return [l.rstrip('\r\n') for l in f]


def write_text(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def write_json(path, obj):
    write_text(path, json.dumps(obj, indent=2, sort_keys=True, ensure_ascii=True) + '\n')


def read_json(path):
    with open(path, 'r', encoding='utf-8-sig') as f:
        return json.load(f)


def write_list(path, items):
    write_text(path, ''.join(i + '\n' for i in items))


def read_list(path):
    return [l for l in read_lines(path) if l]


# -----------------------------------------------------------------------------
# the launcher's constants: ONE source for the mod filter and the JVM flags
# -----------------------------------------------------------------------------
LAUNCHER_SRC = 'iridescent-launcher/icraft-core/src'


def _rust_str_array(text, name, where):
    m = re.search(r'pub const %s\s*:\s*&\[&str\]\s*=\s*&\[' % re.escape(name), text)
    if not m:
        raise Cannot("the launcher's %s is not in %s: its source moved, teach icboot.py where" % (name, where))
    i, out, n = m.end(), [], len(text)
    while i < n:
        c = text[i]
        if c == ']':
            return out
        if c == '/' and text[i:i + 2] == '//':
            i = text.find('\n', i)
            if i < 0:
                break
            continue
        if c == '"':
            j, s = i + 1, []
            while j < n and text[j] != '"':
                if text[j] == '\\' and j + 1 < n:
                    j += 1
                s.append(text[j])
                j += 1
            out.append(''.join(s))
            i = j + 1
            continue
        i += 1
    raise Cannot("could not read the launcher's %s in %s" % (name, where))


def _rust_str(text, name, where):
    m = re.search(r'pub const %s\s*:\s*&str\s*=\s*"([^"]*)"' % re.escape(name), text)
    if not m:
        raise Cannot("the launcher's %s is not in %s: its source moved, teach icboot.py where" % (name, where))
    return m.group(1)


def launcher_constants(src_root):
    """FORCE_SKIP_PATTERNS, DENY_LIST_PATTERNS, CUSTOM_JARS, AIKAR_FLAGS, FORGE_VERSION,
    FORGE_INSTALLER_URL as the launcher of the tree under test is compiled with."""
    pw = os.path.join(src_root, LAUNCHER_SRC, 'packwiz.rs')
    cf = os.path.join(src_root, LAUNCHER_SRC, 'config.rs')
    for p in (pw, cf):
        if not os.path.isfile(p):
            raise Cannot('launcher source not found: %s (the mod filter and the JVM flags are read from it)' % p)
    pwt, cft = read_text(pw), read_text(cf)
    return {
        'force_skip': _rust_str_array(pwt, 'FORCE_SKIP_PATTERNS', pw),
        'deny': _rust_str_array(cft, 'DENY_LIST_PATTERNS', cf),
        'custom_jars': _rust_str_array(cft, 'CUSTOM_JARS', cf),
        'jvm_flags': _rust_str_array(cft, 'AIKAR_FLAGS', cf),
        'forge_version': _rust_str(cft, 'FORGE_VERSION', cf),
        'forge_installer_url': _rust_str(cft, 'FORGE_INSTALLER_URL', cf),
    }


# -----------------------------------------------------------------------------
# the mod set: the launcher's filter applied to an index directory
# -----------------------------------------------------------------------------
def _capture_str(line, key):
    # the launcher's tolerant fallback (packwiz.rs capture_str): key = '...' up to the LAST quote
    prefix = key + ' = '
    if not line.startswith(prefix):
        return None
    rest = line[len(prefix):]
    if not rest or rest[0] not in '\'"':
        return None
    q = rest[0]
    inner = rest.lstrip(q)
    last = inner.rfind(q)
    return inner[:last] if last >= 0 else None


def parse_metafile(path):
    """One .pw.toml as the launcher reads it (packwiz.rs parse_one): strict TOML first,
    then its line-regex fallback. None when there is no filename."""
    text = read_text(path)
    rec = None
    if tomllib is not None:
        try:
            raw = tomllib.loads(text)
            dl = raw.get('download') or {}
            rec = {'filename': raw.get('filename'), 'side': raw.get('side', 'both'), 'name': raw.get('name', ''),
                   'hash': dl.get('hash', ''), 'hash_format': dl.get('hash-format', ''),
                   'mode': dl.get('mode', ''), 'url': dl.get('url', ''), 'parse': 'toml'}
        except Exception:
            rec = None
    if rec is None:
        rec = {'filename': None, 'side': 'both', 'name': '', 'hash': '', 'hash_format': '', 'mode': '', 'url': '',
               'parse': 'lines'}
        for line in text.splitlines():
            l = line.strip()
            for key, field in (('filename', 'filename'), ('side', 'side'), ('name', 'name'), ('hash', 'hash'),
                               ('hash-format', 'hash_format'), ('mode', 'mode'), ('url', 'url')):
                v = _capture_str(l, key)
                if v is not None:
                    rec[field] = v
                    break
    if not rec.get('filename'):
        return None
    rec['metafile'] = os.path.basename(path)
    return rec


def launcher_side(side):
    # packwiz.rs Side::parse: "client", "server", anything else (the empty string too) is Both
    return side if side in ('client', 'server') else 'both'


def first_pattern(filename, patterns):
    low = filename.lower()
    for p in patterns:
        if p.lower() in low:
            return p
    return None


def compute_modset(index_dir, mods_dir, manifest_path, consts):
    """What a server installed from this tree ends up with in mods/.

    Mirrors icraft-core: update_mods keeps the index entries that are not side=client and
    not force-skipped; the sync copies every jar committed next to the index; then
    strip_client_mods (force-skip), and cleanup_stale_jars (deny list, allow list).
    Takes an index DIRECTORY so a change to how the indexes are generated does not reach in here."""
    if not os.path.isdir(index_dir):
        raise Cannot('mod index directory not found: %s' % index_dir)
    metas, unparsed = [], []
    for fn in sorted(os.listdir(index_dir)):
        if not fn.endswith('.pw.toml'):
            continue
        rec = parse_metafile(os.path.join(index_dir, fn))
        if rec is None:
            unparsed.append(fn)
        else:
            metas.append(rec)
    by_side = {}
    for r in metas:
        label = r['side'] or '(empty)'          # never an empty JSON key: Windows PowerShell 5.1 cannot read one
        by_side[label] = by_side.get(label, 0) + 1

    client = sorted(r['filename'] for r in metas if launcher_side(r['side']) == 'client')
    skipped, wanted = [], {}
    duplicates = {}
    for r in metas:
        if launcher_side(r['side']) == 'client':
            continue
        pat = first_pattern(r['filename'], consts['force_skip'])
        if pat:
            skipped.append({'filename': r['filename'], 'pattern': pat, 'side': r['side'], 'metafile': r['metafile']})
            continue
        if r['filename'] in wanted:
            duplicates.setdefault(r['filename'], [wanted[r['filename']]['metafile']]).append(r['metafile'])
            if (r['hash_format'], r['hash']) != (wanted[r['filename']]['hash_format'], wanted[r['filename']]['hash']):
                raise Cannot('two metafiles name %s with different hashes: %s' % (r['filename'], ', '.join(duplicates[r['filename']])))
            continue
        wanted[r['filename']] = r
    entries_kept = sum(1 for r in metas if launcher_side(r['side']) != 'client') - len(skipped)

    manifest = {}
    if manifest_path and os.path.isfile(manifest_path):
        try:
            for name, e in (read_json(manifest_path).get('jars') or {}).items():
                if isinstance(e, dict) and e.get('sha256'):
                    manifest[name] = e['sha256'].lower()
        except Exception as ex:
            raise Cannot('custom jar manifest unreadable: %s (%s)' % (manifest_path, ex))
    committed = sorted(f for f in os.listdir(mods_dir) if f.endswith('.jar')) if os.path.isdir(mods_dir) else []

    # cleanup_stale_jars: every index filename (client-side ones too), the manifest, the fallback list
    allowed = set(r['filename'] for r in metas) | set(manifest) | set(consts['custom_jars'])
    by_name = {}
    for r in metas:
        by_name.setdefault(r['filename'], r)

    mods, extra, dropped = {}, [], []
    for fn, r in wanted.items():
        mods[fn] = {'filename': fn, 'from': 'index', 'metafile': r['metafile'], 'side': r['side'],
                    'hash_format': r['hash_format'], 'hash': r['hash'].lower(), 'mode': r['mode'],
                    'committed': fn in committed}
    for fn in committed:
        if fn in mods:
            continue
        r = by_name.get(fn)
        why = 'no index entry' if r is None else "its index entry is side='%s'" % r['side']
        mods[fn] = {'filename': fn, 'from': 'committed', 'metafile': r['metafile'] if r else None,
                    'side': r['side'] if r else None, 'hash_format': r['hash_format'] if r else '',
                    'hash': r['hash'].lower() if r else '', 'mode': r['mode'] if r else '', 'committed': True}
        extra.append({'filename': fn, 'why': 'committed in mods/ and copied by the sync (%s)' % why})
    for fn in sorted(mods):
        pat = first_pattern(fn, consts['force_skip']) if mods[fn]['from'] == 'committed' else None
        deny = first_pattern(fn, consts['deny'])
        if pat:
            dropped.append({'filename': fn, 'why': "strip_client_mods: matches force-skip '%s'" % pat})
        elif deny:
            dropped.append({'filename': fn, 'why': "cleanup_stale_jars: matches deny pattern '%s'" % deny})
        elif fn not in allowed:
            dropped.append({'filename': fn, 'why': 'cleanup_stale_jars: not in the index, the manifest or the fallback list'})
    for d in dropped:
        mods.pop(d['filename'], None)
    extra = [e for e in extra if e['filename'] in mods]
    for fn, m in mods.items():
        m['manifest_sha256'] = manifest.get(fn)

    n_index = sum(1 for m in mods.values() if m['from'] == 'index')
    arithmetic = '%d metafiles - %d client-side - %d force-skipped = %d entries = %d jar names' % (
        len(metas), len(client), len(skipped), entries_kept, len(wanted))
    if duplicates:
        arithmetic += ' (%d named twice)' % len(duplicates)
    if n_index != len(wanted):
        arithmetic += ' - %d dropped by the cleanup = %d' % (len(wanted) - n_index, n_index)
    if extra:
        arithmetic += '; + %d committed jar%s outside that filter (%s)' % (
            len(extra), '' if len(extra) == 1 else 's', ', '.join(e['filename'] for e in extra))
    arithmetic += ' = %d' % len(mods)
    return {
        'index_dir': index_dir, 'metafiles': len(metas), 'unparsed': unparsed, 'by_side': by_side,
        'client_side': client, 'force_skipped': sorted(skipped, key=lambda s: s['filename']),
        'duplicates': [{'filename': k, 'metafiles': v} for k, v in sorted(duplicates.items())],
        'committed_jars': committed, 'committed_extra': extra, 'dropped': dropped,
        'manifest_jars': sorted(manifest), 'count': len(mods), 'arithmetic': arithmetic,
        'mods': [mods[k] for k in sorted(mods, key=str.lower)],
    }


def print_modset(ms):
    say('mod set: ' + ms['arithmetic'])
    sides = ', '.join('%d side %s' % (n, s) for s, n in sorted(ms['by_side'].items()))
    say('  index: %d metafiles (%s)' % (ms['metafiles'], sides))
    if ms['unparsed']:
        say('  metafiles without a filename (the launcher skips them): ' + ', '.join(ms['unparsed']))
    if ms['force_skipped']:
        say('  force-skipped by the launcher: ' + ', '.join('%s (%s)' % (s['filename'], s['pattern']) for s in ms['force_skipped']))
    for d in ms['duplicates']:
        say('  named twice: %s by %s' % (d['filename'], ' + '.join(d['metafiles'])))
    for d in ms['dropped']:
        say('  dropped: %s (%s)' % (d['filename'], d['why']))


def compare_expected(ms, list_path):
    want = set(l.strip() for l in read_lines(list_path) if l.strip().lower().endswith('.jar'))
    have = set(m['filename'] for m in ms['mods'])
    return {'list': list_path, 'listed': len(want), 'only_computed': sorted(have - want), 'only_listed': sorted(want - have)}


# -----------------------------------------------------------------------------
# jars: a hash-verified pool in the WSL home, filled from local caches only
# -----------------------------------------------------------------------------
HASHES = ('sha1', 'sha256', 'sha512')


def hash_file(path):
    hs = {n: hashlib.new(n) for n in HASHES}
    size = 0
    with open(path, 'rb') as f:
        while True:
            b = f.read(1 << 20)
            if not b:
                break
            size += len(b)
            for h in hs.values():
                h.update(b)
    return {n: h.hexdigest() for n, h in hs.items()}, size


class Pool:
    def __init__(self, root):
        self.root = root
        self.index_path = os.path.join(root, 'index.json')
        os.makedirs(root, exist_ok=True)
        self.index = read_json(self.index_path) if os.path.isfile(self.index_path) else {}
        self.dirty = False

    def path_of(self, sha256):
        return os.path.join(self.root, sha256[:2], sha256 + '.jar')

    def lookup(self, fmt, digest):
        sha = self.index.get('%s:%s' % (fmt, digest))
        if sha and os.path.isfile(self.path_of(sha)):
            return sha
        return None

    def add(self, src, digests):
        dst = self.path_of(digests['sha256'])
        if not os.path.isfile(dst):
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            tmp = dst + '.tmp'
            shutil.copyfile(src, tmp)
            os.replace(tmp, dst)
        for n in HASHES:
            self.index['%s:%s' % (n, digests[n])] = digests['sha256']
        self.dirty = True
        return digests['sha256']

    def save(self):
        if self.dirty:
            write_json(self.index_path, self.index)
            self.dirty = False


def resolve_jars(ms, mods_dir, cache_dirs, pool):
    """Every jar of the mod set, verified against the hash in its metafile (and, for a
    custom jar, the manifest). Nothing is downloaded: 89 server-side metafiles carry
    no URL. A metafile WITHOUT a hash cannot be verified: its jar is taken by name and
    reported. Fills m['sha256'] and m['verified']; returns (filename -> sha256, problems, files hashed)."""
    resolved, problems = {}, []
    hashed = 0
    for m in ms['mods']:
        fn, fmt, want = m['filename'], m['hash_format'], m['hash']
        if m['from'] == 'index' and want and fmt not in HASHES:
            problems.append({'filename': fn, 'problem': 'unverifiable', 'detail': "hash-format '%s' in %s is not one this tool checks" % (fmt, m['metafile'])})
            continue
        sha, how = None, None
        committed = os.path.join(mods_dir, fn)
        if m['committed'] and os.path.isfile(committed):
            digests, _ = hash_file(committed)
            hashed += 1
            if m['manifest_sha256'] and digests['sha256'] != m['manifest_sha256']:
                problems.append({'filename': fn, 'problem': 'wrong hash', 'detail': 'the committed jar is sha256 %s, custom_jars_manifest.json says %s' % (digests['sha256'], m['manifest_sha256'])})
                continue
            if m['from'] == 'index' and want and digests.get(fmt) != want:
                problems.append({'filename': fn, 'problem': 'wrong hash', 'detail': 'the committed jar is %s %s, %s says %s' % (fmt, digests.get(fmt), m['metafile'], want)})
                continue
            sha = pool.add(committed, digests)
            how = 'manifest' if m['manifest_sha256'] else ('metafile' if (m['from'] == 'index' and want) else 'committed, no hash on record')
        elif m['from'] != 'index':
            problems.append({'filename': fn, 'problem': 'missing', 'detail': 'listed as committed, not on disk'})
            continue
        elif not want:
            # no hash in the metafile: the first cache folder that has the name decides
            for d in cache_dirs:
                cand = os.path.join(d, fn)
                if os.path.isfile(cand):
                    digests, _ = hash_file(cand)
                    hashed += 1
                    sha, how = pool.add(cand, digests), 'NOT VERIFIED: %s carries no hash' % m['metafile']
                    break
            if sha is None:
                problems.append({'filename': fn, 'problem': 'missing', 'detail': 'in none of the cache folders (%s carries no hash, so the pool is not asked)' % m['metafile']})
                continue
        else:
            sha, how = pool.lookup(fmt, want), 'metafile'
            if sha is None:
                last = None
                for d in cache_dirs:
                    cand = os.path.join(d, fn)
                    if not os.path.isfile(cand):
                        continue
                    digests, _ = hash_file(cand)
                    hashed += 1
                    if digests[fmt] == want:
                        sha = pool.add(cand, digests)
                        break
                    last = (cand, digests[fmt])
                if sha is None:
                    if last:
                        problems.append({'filename': fn, 'problem': 'wrong hash', 'detail': '%s is %s %s, %s says %s' % (last[0], fmt, last[1], m['metafile'], want)})
                    else:
                        problems.append({'filename': fn, 'problem': 'missing', 'detail': 'not in the jar pool and in none of the cache folders (%s, %s %s)' % (m['metafile'], fmt, want[:16])})
                    continue
        m['sha256'], m['verified'] = sha, how
        resolved[fn] = sha
    pool.save()
    ms['unverified'] = sorted(m['filename'] for m in ms['mods'] if str(m.get('verified', '')).startswith('NOT VERIFIED'))
    return resolved, problems, hashed


# -----------------------------------------------------------------------------
# Forge: installed once, cached
# -----------------------------------------------------------------------------
def java_cmd():
    return os.environ.get('ICRAFT_BOOT_JAVA') or 'java'


def java_version():
    try:
        out = subprocess.run([java_cmd(), '-version'], capture_output=True, text=True)
    except OSError as ex:
        raise Cannot('java not found in WSL (%s): install a JDK 17 (sudo apt install openjdk-17-jdk-headless) or set ICRAFT_BOOT_JAVA' % ex)
    m = re.search(r'version "([^"]+)"', out.stderr + out.stdout)
    v = m.group(1) if m else 'unknown'
    if not v.startswith('17.'):
        raise Cannot('java is %s; the pack runs on Java 17 (set ICRAFT_BOOT_JAVA to a JDK 17 java)' % v)
    return v


def forge_dir(home, version):
    return os.path.join(home, 'forge', version)


def forge_args(home, version):
    return os.path.join(forge_dir(home, version), 'libraries', 'net', 'minecraftforge', 'forge', version, 'unix_args.txt')


def ensure_forge(home, consts, allow_install=True):
    version = consts['forge_version']
    if os.path.isfile(forge_args(home, version)):
        return forge_dir(home, version)
    if not allow_install:
        raise Cannot('Forge %s is not installed in %s: run boot.ps1 -Setup once (needs the network)' % (version, forge_dir(home, version)))
    d = forge_dir(home, version)
    os.makedirs(d, exist_ok=True)
    installer = os.path.join(d, 'forge-%s-installer.jar' % version)
    if not os.path.isfile(installer):
        say('downloading the Forge installer: ' + consts['forge_installer_url'])
        tmp = installer + '.tmp'
        try:
            # the maven answers 403 to python's default agent; the launcher sends this one (mods.rs USER_AGENT)
            rq = urllib.request.Request(consts['forge_installer_url'], headers={'User-Agent': 'Mozilla/5.0 IridescentCraft-Updater'})
            with urllib.request.urlopen(rq, timeout=120) as r, open(tmp, 'wb') as f:
                shutil.copyfileobj(r, f)
        except Exception as ex:
            raise Cannot('could not download the Forge installer (%s). Put forge-%s-installer.jar into %s by hand and run again' % (ex, version, d))
        os.replace(tmp, installer)
    say('installing Forge %s into %s (downloads the game and its libraries, about two minutes)' % (version, d))
    with open(os.path.join(d, 'install.log'), 'w') as log:
        rc = subprocess.run([java_cmd(), '-jar', installer, '--installServer'], cwd=d, stdout=log, stderr=subprocess.STDOUT).returncode
    if rc != 0 or not os.path.isfile(forge_args(home, version)):
        raise Cannot('the Forge installer failed (exit %d): see %s' % (rc, os.path.join(d, 'install.log')))
    say('Forge %s installed' % version)
    return d


# -----------------------------------------------------------------------------
# the sandbox
# -----------------------------------------------------------------------------
def free_port(kind):
    s = socket.socket(socket.AF_INET, kind)
    try:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]
    finally:
        s.close()


def patch_properties(text, overrides):
    out, seen = [], set()
    for line in text.replace('\r', '').split('\n'):
        m = re.match(r'^([A-Za-z0-9_.\-]+)=', line)
        if m and m.group(1) in overrides:
            out.append('%s=%s' % (m.group(1), overrides[m.group(1)]))
            seen.add(m.group(1))
        else:
            out.append(line)
    for k, v in overrides.items():
        if k not in seen:
            out.append('%s=%s' % (k, v))
    return '\n'.join(out).rstrip('\n') + '\n'


def nbt_flag_file(path, flag):
    # gzip NBT: an unnamed root compound holding one byte tag set to 1 (what KubeJS reads as server.persistentData)
    name = flag.encode('utf-8')
    body = b'\x0a\x00\x00' + b'\x01' + len(name).to_bytes(2, 'big') + name + b'\x01' + b'\x00'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with gzip.open(path, 'wb') as f:
        f.write(body)


def jvm_flags(consts, heap, heap_min, run_dir, extra):
    flags = []
    for f in consts['jvm_flags']:
        if f.startswith('-Xmx'):
            f = '-Xmx' + heap
        elif f.startswith('-Xms'):
            f = '-Xms' + heap_min
        flags.append(f)
    if '-noverify' not in flags:
        say('WARNING: the launcher flags of this tree have no -noverify; the patched Ars Nouveau jar fails verification without it')
    # the launcher adds a per-launch dump path (run.rs); here it stays inside the run folder, which is deleted
    flags.append('-XX:HeapDumpPath=' + os.path.join(run_dir, 'heapdumps'))
    return flags + list(extra or [])


# ---- directory order ---------------------------------------------------------
# KubeJS loads its scripts in the order the directory listing gives them (Files.walk,
# then a stable sort by the `// priority` header, which no script of the pack sets).
# The live server and the clients sit on NTFS, which lists names sorted; ext4 lists
# them by hash. A sandbox on ext4 loads 0_lib_core.js about fiftieth: six scripts
# fail at load that load everywhere else, and a script that only works by the luck
# of the hash order passes. So the run folder is built on a tmpfs, whose listing
# follows the order of creation, and every pack tree is created in NTFS name order.
def ntfs_key(name):
    # NTFS compares names upper-cased, code unit by code unit ('affixes' sorts before 'affix_x': 'E' < '_')
    return (name.upper(), name)


def dir_order_mode(base):
    """How this filesystem lists a directory: 'creation', 'reversed' (newest first), or None (neither)."""
    probe = os.path.join(base, '.icboot-order-probe-%d' % os.getpid())
    shutil.rmtree(probe, ignore_errors=True)
    os.makedirs(probe)
    try:
        names = ['m', 'a', 'z', 'b', 'k', 'c']
        for n in names:
            open(os.path.join(probe, n), 'w').close()
        with os.scandir(probe) as it:
            got = [e.name for e in it]
    finally:
        shutil.rmtree(probe, ignore_errors=True)
    if got == names:
        return 'creation'
    if got == names[::-1]:
        return 'reversed'
    return None


def ordered_copy(src, dst, mode, inject=None, rel=''):
    """Copy a tree so that every directory of the copy lists its entries in NTFS name order.
    `inject` adds files that are not in the source: {folder relative to the root: [(name, path)]}."""
    os.mkdir(dst)
    with os.scandir(src) as it:
        entries = [(e.name, e.path, e.is_dir()) for e in it]
    entries += [(n, p, False) for n, p in (inject or {}).get(rel, [])]
    entries.sort(key=lambda e: ntfs_key(e[0]))
    for name, path, is_dir in (entries if mode == 'creation' else entries[::-1]):
        if is_dir:
            ordered_copy(path, os.path.join(dst, name), mode, inject, (rel + '/' + name).lstrip('/'))
        else:
            shutil.copyfile(path, os.path.join(dst, name))


def unordered_dirs(root):
    bad = []
    for base, _dirs, _files in os.walk(root):
        with os.scandir(base) as it:
            names = [e.name for e in it]
        if names != sorted(names, key=ntfs_key):
            bad.append(base)
    return bad


RX_HEADER = re.compile(r'^//\s*(\w+)\s*[:=]?\s*(-?\w+)\s*$')


def script_header(path):
    # KubeJS reads `// key: value` lines at the top of a script (priority, ignored, requires)
    props = {}
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                t = line.strip()
                if not t:
                    continue
                if not t.startswith('//'):
                    break
                m = RX_HEADER.match(t)
                if m:
                    props[m.group(1)] = m.group(2)
    except OSError:
        pass
    return props


def production_script_order(scripts_root):
    """The order KubeJS loads a script folder in on the live server: a depth-first walk with
    the names of each folder in NTFS order, then (stable) by priority, highest first."""
    out = []

    def walk(d, rel):
        with os.scandir(d) as it:
            entries = sorted(it, key=lambda e: ntfs_key(e.name))
        for e in entries:
            if e.is_dir():
                walk(e.path, rel + e.name + '/')
            elif e.name.endswith('.js'):
                out.append(rel + e.name)
    if os.path.isdir(scripts_root):
        walk(scripts_root, '')

    def prio(s):
        try:
            return int(script_header(os.path.join(scripts_root, s)).get('priority', '0'))
        except ValueError:
            return 0
    return sorted(out, key=lambda s: -prio(s))


def default_run_dir():
    return os.environ.get('ICRAFT_BOOT_RUN_DIR') or '/dev/shm/icraft-boot-%s/run' % (os.environ.get('USER') or str(os.getuid()))


def assemble(run_dir, src_root, home, consts, resolved, params):
    sd = os.path.join(src_root, '.minecraft', 'server_distribution')
    shutil.rmtree(run_dir, ignore_errors=True)
    os.makedirs(os.path.dirname(run_dir), exist_ok=True)
    mode = dir_order_mode(os.path.dirname(run_dir))
    if mode is None:
        raise Cannot('%s lists a directory neither in creation order nor reversed (not a tmpfs?): the sandbox cannot give KubeJS its '
                     'scripts in the order the live server does. Point ICRAFT_BOOT_RUN_DIR at a folder on a tmpfs' % os.path.dirname(run_dir))
    os.makedirs(os.path.join(run_dir, 'mods'))
    pool = Pool(os.path.join(home, 'pool'))
    names = sorted(resolved, key=ntfs_key)
    for fn in (names if mode == 'creation' else names[::-1]):
        shutil.copyfile(pool.path_of(resolved[fn]), os.path.join(run_dir, 'mods', fn))
    # the registry-dump helper goes in with the copy, so that it too sits where its name puts it
    helper = {'server_scripts': [(HELPER_NAME, os.path.join(HERE, 'sandbox', 'icboot_registry_dump.js'))]}
    for d in ('config', 'defaultconfigs', 'kubejs'):
        s = os.path.join(sd, d)
        if not os.path.isdir(s):
            raise Cannot('%s is not in the tree under test' % s)
        ordered_copy(s, os.path.join(run_dir, d), mode, helper if d == 'kubejs' else None)
    bad =[b for d in ('mods', 'config', 'defaultconfigs', 'kubejs') for b in unordered_dirs(os.path.join(run_dir, d))]
    if bad:
        raise Cannot('%d folder(s) of the sandbox do not list in NTFS name order (first: %s): the boot would load scripts in another order than the live server' % (len(bad), bad[0]))
    os.symlink(os.path.join(forge_dir(home, consts['forge_version']), 'libraries'), os.path.join(run_dir, 'libraries'))
    os.makedirs(os.path.join(run_dir, 'heapdumps'))
    os.makedirs(os.path.join(run_dir, 'icboot-out'))
    write_text(os.path.join(run_dir, 'eula.txt'), 'eula=true\n')

    notes = []
    port, vport = free_port(socket.SOCK_STREAM), free_port(socket.SOCK_DGRAM)
    props_src = os.path.join(sd, 'server.properties')
    props = read_text(props_src) if os.path.isfile(props_src) else ''
    write_text(os.path.join(run_dir, 'server.properties'), patch_properties(props, {
        'server-port': port, 'server-ip': '127.0.0.1', 'online-mode': 'false', 'level-seed': params['seed'],
        'level-name': 'world', 'enable-rcon': 'false', 'enable-query': 'false', 'white-list': 'false',
        'enforce-whitelist': 'false', 'motd': 'icboot sandbox'}))
    vc = os.path.join(run_dir, 'config', 'voicechat', 'voicechat-server.properties')
    if os.path.isfile(vc):
        write_text(vc, patch_properties(read_text(vc), {'port': vport}))
    else:
        notes.append('no config/voicechat/voicechat-server.properties in the tree: the voice chat port was not moved')

    # Chunky: the pack starts a pregeneration by itself in a world that has not had one
    # (kubejs/server_scripts/pregen/auto_chunky.js, a flag in the server's persistent data).
    # The flag is set in the empty world folder before the first boot; the script is not touched.
    ac = os.path.join(run_dir, 'kubejs', 'server_scripts', 'pregen', 'auto_chunky.js')
    flag = None
    if os.path.isfile(ac):
        m = re.search(r"var FLAG\s*=\s*'([A-Za-z0-9_]+)'", read_text(ac))
        flag = m.group(1) if m else None
        if flag is None:
            notes.append('pregen/auto_chunky.js has no `var FLAG = ...` line any more: the pregeneration could not be switched off beforehand')
    if flag:
        nbt_flag_file(os.path.join(run_dir, 'world', 'kubejs_persistent_data.nbt'), flag)

    flags = jvm_flags(consts, params['heap'], params['heap_min'], run_dir, params.get('jvm_extra'))
    return {'port': port, 'voice_port': vport, 'chunky_flag': flag, 'jvm_flags': flags, 'notes': notes, 'dir_order': mode}


def script_list(run_dir):
    """The scripts of the sandbox, per kind, in the order the live server loads them."""
    return {kind: production_script_order(os.path.join(run_dir, 'kubejs', kind + '_scripts')) for kind in ('server', 'startup')}


# -----------------------------------------------------------------------------
# one server, one host
# -----------------------------------------------------------------------------
class Lock:
    def __init__(self, home, wait_seconds, label):
        self.path = os.path.join(home, 'lock')
        self.wait, self.label, self.f = wait_seconds, label, None

    def __enter__(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        self.f = open(self.path, 'a+')
        t0, told = time.monotonic(), False
        while True:
            try:
                fcntl.flock(self.f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if time.monotonic() - t0 > self.wait:
                    self.f.seek(0)
                    raise Cannot('another boot holds the rig (%s) and did not finish in %d s: one full-pack server per host' % (self.f.read().strip() or 'unknown', self.wait))
                if not told:
                    self.f.seek(0)
                    say('waiting for the rig: another boot is running (%s)' % (self.f.read().strip() or 'unknown'))
                    told = True
                time.sleep(5)
        self.f.seek(0)
        self.f.truncate()
        self.f.write('%s, pid %d, since %s' % (self.label, os.getpid(), time.strftime('%H:%M:%S')))
        self.f.flush()
        return self

    def __exit__(self, *a):
        try:
            self.f.seek(0)
            self.f.truncate()
            fcntl.flock(self.f, fcntl.LOCK_UN)
        finally:
            self.f.close()


def foreign_jvms():
    out = []
    for pid in os.listdir('/proc'):
        if not pid.isdigit():
            continue
        try:
            with open('/proc/%s/cmdline' % pid, 'rb') as f:
                cmd = f.read().split(b'\0')
            if cmd and os.path.basename(cmd[0].decode('utf-8', 'replace')) == 'java':
                out.append((int(pid), os.readlink('/proc/%s/cwd' % pid)))
        except OSError:
            continue
    return out


def mem_available_mb():
    for line in read_lines('/proc/meminfo'):
        if line.startswith('MemAvailable:'):
            return int(line.split()[1]) // 1024
    return 0


def heap_mb(text):
    m = re.match(r'^(\d+)([GgMm])$', text)
    if not m:
        raise Cannot("heap size '%s': use a number followed by G or M (8G, 6144M)" % text)
    return int(m.group(1)) * (1024 if m.group(2) in 'Gg' else 1)


def proc_status_mb(pid, key):
    for line in read_lines('/proc/%d/status' % pid):
        if line.startswith(key + ':'):
            return int(line.split()[1]) // 1024
    return None


class Tail:
    """Reads what was appended to a log since the last look."""

    def __init__(self, path):
        self.path, self.pos, self.buf = path, 0, ''

    def new_lines(self):
        if not os.path.isfile(self.path):
            return []
        with open(self.path, 'rb') as f:
            f.seek(self.pos)
            data = f.read()
            self.pos = f.tell()
        self.buf += data.decode('utf-8', 'replace')
        parts = self.buf.split('\n')
        self.buf = parts.pop()
        return parts


RX_DONE = re.compile(r'\]: Done \((\d+\.\d+)s\)!')
RX_TPS = re.compile(r'Overall: Mean tick time: ([\d.]+) ms\. Mean TPS: ([\d.]+)')
RX_SEED = re.compile(r'\]: Seed: \[(-?\d+)\]')
RX_PREGEN = re.compile(r'Chunky pre-gen started|\[Chunky\] Task running')


def run_server(run_dir, consts, flags, params, boot):
    """Boot, wait for Done, let the helper write, idle, sample, stop. Fills `boot` in place."""
    args_file = os.path.join('libraries', 'net', 'minecraftforge', 'forge', consts['forge_version'], 'unix_args.txt')
    env = {k: v for k, v in os.environ.items() if k in ('PATH', 'HOME', 'LANG', 'LC_ALL', 'JAVA_HOME', 'TZ', 'USER')}
    console = open(os.path.join(run_dir, 'console.log'), 'wb')
    t0 = time.monotonic()
    proc = subprocess.Popen([java_cmd()] + flags + ['@' + args_file, 'nogui'], cwd=run_dir, stdin=subprocess.PIPE,
                            stdout=console, stderr=subprocess.STDOUT, env=env)
    boot.update({'pid': proc.pid, 'reached_done': False, 'died': None, 'pregen_started': False})
    tail = Tail(os.path.join(run_dir, 'logs', 'latest.log'))
    crash_dir = os.path.join(run_dir, 'crash-reports')
    seen = {'tps': None, 'seed': None}

    def send(cmd):
        try:
            proc.stdin.write((cmd + '\n').encode())
            proc.stdin.flush()
        except OSError:
            pass

    def crashed():
        return os.path.isdir(crash_dir) and any(f.endswith('.txt') for f in os.listdir(crash_dir))

    def pump():
        for line in tail.new_lines():
            m = RX_DONE.search(line)
            if m and not boot['reached_done']:
                boot['reached_done'] = True
                boot['done_seconds'] = float(m.group(1))
                boot['wall_to_done_s'] = round(time.monotonic() - t0, 1)
            m = RX_TPS.search(line)
            if m:
                seen['tps'] = (float(m.group(1)), float(m.group(2)))
            m = RX_SEED.search(line)
            if m:
                seen['seed'] = m.group(1)
            if RX_PREGEN.search(line):
                boot['pregen_started'] = True

    def wait_for(cond, seconds, step=1.0):
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            pump()
            if cond():
                return True
            if proc.poll() is not None:
                pump()
                return cond()
            time.sleep(step)
        return False

    say('JVM started (pid %d, %s heap): waiting for Done, up to %d s' % (proc.pid, params['heap'], params['boot_timeout']))
    wait_for(lambda: boot['reached_done'] or crashed(), params['boot_timeout'])
    if not boot['reached_done']:
        if proc.poll() is not None:
            boot['died'] = 'the JVM exited during the boot (exit %s)' % proc.returncode
        elif crashed():
            boot['died'] = 'a crash report was written during the boot'
        else:
            boot['died'] = 'no Done line after %d s' % params['boot_timeout']
        say('BOOT FAILED: ' + boot['died'])
    else:
        say('Done (%.3fs), %.0f s after the JVM start' % (boot['done_seconds'], boot['wall_to_done_s']))
        marker = os.path.join(run_dir, 'icboot-out', 'done.json')
        boot['dump_written'] = wait_for(lambda: os.path.isfile(marker), 180)
        if not boot['dump_written']:
            say('the registry dump was not written within 180 s of Done')
        t_idle = time.monotonic()
        wait_for(lambda: False, params['idle_seconds'])
        if boot['pregen_started']:
            say('WARNING: the pack started a Chunky pregeneration; cancelling it (timings of this run are not comparable)')
            send('chunky cancel')
            send('chunky confirm')
        if proc.poll() is None:
            boot['peak_rss_idle_mb'] = proc_status_mb(proc.pid, 'VmHWM')
            send('seed')
            send('forge tps')
            wait_for(lambda: seen['tps'] is not None, 20, 0.5)
            if seen['tps']:
                boot['mean_tick_ms'], boot['tps'] = seen['tps']
            boot['seed_reported'] = seen['seed']
            boot['idle_seconds'] = round(time.monotonic() - t_idle, 1)
            try:
                hi = subprocess.run(['jcmd', str(proc.pid), 'GC.heap_info'], capture_output=True, text=True, timeout=60).stdout
                m = re.search(r'total (\d+)K, used (\d+)K', hi)
                if m:
                    boot['heap_committed_mb'], boot['heap_used_mb'] = int(m.group(1)) // 1024, int(m.group(2)) // 1024
                m = re.search(r'Metaspace\s+used (\d+)K', hi)
                if m:
                    boot['metaspace_mb'] = int(m.group(1)) // 1024
                hist = subprocess.run(['jcmd', str(proc.pid), 'GC.class_histogram'], capture_output=True, text=True, timeout=180).stdout
                m = re.search(r'^Total\s+(\d+)\s+(\d+)\s*$', hist, re.M)
                if m:
                    boot['live_objects'], boot['live_heap_mb'] = int(m.group(1)), int(m.group(2)) // (1024 * 1024)
                m = re.search(r'^\s*\d+:\s+(\d+)\s+\d+\s+java\.lang\.Class \(', hist, re.M)
                if m:
                    boot['loaded_classes'] = int(m.group(1))
            except (OSError, subprocess.TimeoutExpired) as ex:
                boot['jcmd_error'] = str(ex)
            boot['peak_rss_mb'] = proc_status_mb(proc.pid, 'VmHWM')
            # console commands of the caller (-ConsoleFile), AFTER every measurement: what they print is in the
            # captured logs. Two seconds each: the pack's FIRED lines are printed once a second.
            # (the heap histogram above stops the server for some seconds: let it catch up first, or every
            # command lands in one tick and a selector does not find what the line before it summoned)
            if params.get('console'):
                wait_for(lambda: False, 20)
            for c in params.get('console') or []:
                if proc.poll() is not None:
                    break
                say('console  : ' + c)
                send(c)
                wait_for(lambda: False, 3)
            if params.get('console'):
                boot['console_commands'] = list(params['console'])
        else:
            boot['died'] = 'the JVM exited while idle after Done (exit %s)' % proc.returncode
            say('BOOT FAILED: ' + boot['died'])

    # stop
    t_stop = time.monotonic()
    if proc.poll() is None:
        send('stop')
        try:
            proc.wait(timeout=params['stop_timeout'] if boot['reached_done'] else 30)
        except subprocess.TimeoutExpired:
            boot['killed'] = True
            proc.kill()
            proc.wait()
    pump()
    console.close()
    boot['exit_code'] = proc.returncode
    boot['stop_seconds'] = round(time.monotonic() - t_stop, 1)
    boot['wall_total_s'] = round(time.monotonic() - t0, 1)
    boot['crash_reports'] = sorted(os.listdir(crash_dir)) if os.path.isdir(crash_dir) else []
    boot['crash_reports'] = [c for c in boot['crash_reports'] if c.endswith('.txt')]
    boot['heap_dumps'] = sorted(os.listdir(os.path.join(run_dir, 'heapdumps')))
    boot['clean_stop'] = bool(boot['reached_done'] and not boot.get('killed') and boot['exit_code'] == 0
                              and not boot['crash_reports'] and not boot['died'])
    return boot


# -----------------------------------------------------------------------------
# extraction: what a boot says, as sorted files
# -----------------------------------------------------------------------------
RX_UUID = re.compile(r'\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b')
RX_ADDR = re.compile(r'\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b')
RX_JSLINE = re.compile(r'(\.js)#\d+')
RX_FLT = re.compile(r'-?\d+\.\d+')
RX_INT = re.compile(r'(?<![#\w.])-?\d{2,}\b')


def signature(text):
    """The same reduction as loud-check.ps1 Get-Signature, so both speak of the same lines."""
    s = RX_UUID.sub('<uuid>', text)
    s = RX_ADDR.sub('<addr>', s)
    s = RX_JSLINE.sub(r'\1#<n>', s)
    s = RX_FLT.sub('<n>', s)
    s = RX_INT.sub('<n>', s)
    return s[:200]


RX_LATEST = re.compile(r'^\[[^\]]+\] \[[^\]]*/(ERROR|FATAL|WARN)\] (.*)$')
RX_KJS = re.compile(r'^\[[\d:]+\] \[(WARN|ERROR)\] (.*)$')
RX_LOADED = re.compile(r'Loaded script (\w+)_scripts:(\S+) in ')
RX_SUMMARY = re.compile(r'Loaded (\d+)/(\d+) KubeJS (\w+) scripts in .*? with (\d+) errors? and (\d+) warnings?')
RX_MIXING = re.compile(r'\[mixin/\]: Mixing (\S+) from (\S+) into (\S+)')
RX_MIXCFG = re.compile(r'\[mixin/\]: Registering mixin config: (\S+)')
RX_REJECT = (
    ('loot_tables', re.compile(r"Couldn't parse element loot_tables:(\S+)")),
    ('recipes', re.compile(r'Parsing error loading recipe (\S+)')),
    ('advancements', re.compile(r'Parsing error loading custom advancement (\S+?):? ')),
    ('tags', re.compile(r"Couldn't load tag (\S+) as it is missing following references")),
)
RX_REJECT_OTHER = re.compile(r"Couldn't parse element (\w+):(\S+)")
RX_LOOT_VALID = re.compile(r'Found loot table element validation problem in \{?([^}\s]+?)\}?[.:\[]')

SNAPSHOT_REGISTRIES = (       # file name in the snapshot <- registry key
    ('items', 'minecraft:item'), ('blocks', 'minecraft:block'), ('entity_types', 'minecraft:entity_type'),
    ('enchantments', 'minecraft:enchantment'), ('attributes', 'minecraft:attribute'),
    ('mob_effects', 'minecraft:mob_effect'), ('structures', 'minecraft:worldgen/structure'),
    ('structure_sets', 'minecraft:worldgen/structure_set'), ('biomes', 'minecraft:worldgen/biome'),
    ('dimension_types', 'minecraft:dimension_type'), ('fluids', 'minecraft:fluid'),
    ('block_entity_types', 'minecraft:block_entity_type'), ('potions', 'minecraft:potion'),
    ('recipe_types', 'minecraft:recipe_type'), ('villager_professions', 'minecraft:villager_profession'),
)


def registry_file(key):
    return key.replace(':', '__').replace('/', '--') + '.txt'


CORE_ATTRIBUTES = ('minecraft:generic.max_health', 'minecraft:generic.armor', 'minecraft:generic.armor_toughness',
                   'minecraft:generic.attack_damage', 'minecraft:generic.attack_knockback', 'minecraft:generic.attack_speed',
                   'minecraft:generic.movement_speed', 'minecraft:generic.flying_speed', 'minecraft:generic.follow_range',
                   'minecraft:generic.knockback_resistance')


def compact_entities(data):
    """The pack's mods give every living entity some 170 attributes, nearly all at the attribute's
    own default. Kept per entity: the vanilla combat and movement attributes it has, and every other
    attribute whose base value is not the default. `attribute_defaults` carries the rest."""
    def plain(v):
        # NaN and the infinities are not JSON: kept as the words (a NaN base is a mod's "not set")
        if isinstance(v, float) and (v != v or v in (float('inf'), float('-inf'))):
            return 'NaN' if v != v else ('Infinity' if v > 0 else '-Infinity')
        return v
    defaults = {k: plain(v) for k, v in (data.get('attribute_defaults') or {}).items()}
    out = {}
    for eid, rec in (data.get('types') or {}).items():
        r = {'category': rec.get('category')}
        if rec.get('tags'):
            r['tags'] = sorted(rec['tags'])
        if 'attributes' in rec:
            attrs = {k: plain(v) for k, v in rec['attributes'].items()}
            r['attributes'] = {k: v for k, v in attrs.items() if k in CORE_ATTRIBUTES or v != defaults.get(k)}
            r['attribute_count'] = len(attrs)
        for k in ('tags_error', 'attributes_error'):
            if k in rec:
                r[k] = rec[k]
        out[eid] = r
    return defaults, out


def entities_text(defaults, entities):
    # one entity per line: a changed attribute is a one-line diff
    j = lambda o: json.dumps(o, sort_keys=True, separators=(', ', ': '))
    rows = ['  %s: %s' % (json.dumps(eid), j(entities[eid])) for eid in sorted(entities)]
    drows = ['  %s: %s' % (json.dumps(a), json.dumps(defaults[a])) for a in sorted(defaults)]
    return '{\n"attribute_defaults": {\n' + ',\n'.join(drows) + '\n},\n"entities": {\n' + ',\n'.join(rows) + '\n}\n}\n'


def extract(result_dir, run_dir, scripts_in_tree):
    logs = os.path.join(result_dir, 'logs')
    ex = os.path.join(result_dir, 'extract')
    reg = os.path.join(result_dir, 'registry')
    for d in (ex, reg, os.path.join(reg, 'all')):
        os.makedirs(d, exist_ok=True)
    counts, problems = {}, []

    # ---- the registry dump (the helper's raw files were copied to <result>/dump) ----
    dump_dir = os.path.join(result_dir, 'dump')
    dump = {}
    for name in ('registries', 'entities', 'world', 'loot_tables', 'recipes', 'advancements', 'done'):
        p = os.path.join(dump_dir, name + '.json')
        if os.path.isfile(p):
            try:
                dump[name] = read_json(p)
            except Exception as e:
                problems.append('registry dump: %s.json is unreadable (%s)' % (name, e))
    done = dump.get('done')
    if done is None:
        problems.append('registry dump: the helper did not finish (no done.json); see logs/kubejs/server.log for [icboot] lines')
    else:
        for sec, err in sorted((done.get('errors') or {}).items()):
            problems.append('registry dump: section %s failed in game: %s' % (sec, err))
        write_json(os.path.join(ex, 'dump_done.json'), done)
    registries = (dump.get('registries') or {}).get('data') or {}
    reg_counts = {}
    for key in sorted(registries):
        ids = sorted(set(registries[key]))
        write_list(os.path.join(reg, 'all', registry_file(key)), ids)
        reg_counts[key] = len(ids)
    for fname, key in SNAPSHOT_REGISTRIES:
        if key in registries:
            write_list(os.path.join(reg, fname + '.txt'), sorted(set(registries[key])))
            counts[fname] = len(set(registries[key]))
    write_json(os.path.join(ex, 'registry_counts.json'), reg_counts)
    edata = (dump.get('entities') or {}).get('data') or {}
    if edata:
        defaults, entities = compact_entities(edata)
        write_text(os.path.join(reg, 'entities.json'), entities_text(defaults, entities))
        counts['entities_with_attributes'] = sum(1 for r in entities.values() if 'attributes' in r)
        bad = sum(1 for r in entities.values() if 'tags_error' in r or 'attributes_error' in r)
        if bad:
            problems.append('registry dump: tags or attributes could not be read for %d entity types (see registry/entities.json)' % bad)
    world = (dump.get('world') or {}).get('data') or {}
    if world:
        write_list(os.path.join(reg, 'dimensions.txt'), sorted(world.get('dimensions') or []))
        rules = world.get('game_rules') or {}
        write_list(os.path.join(reg, 'game_rules.txt'), sorted(rules))
        write_list(os.path.join(reg, 'game_rule_values.tsv'), ['%s\t%s' % (k, rules[k]) for k in sorted(rules)])
        counts['dimensions'], counts['game_rules'] = len(world.get('dimensions') or []), len(rules)
    if 'loot_tables' in dump:
        ids = sorted(set(dump['loot_tables']['data']['ids']))
        write_list(os.path.join(reg, 'loot_tables.txt'), ids)
        counts['loot_tables'] = len(ids)
    if 'recipes' in dump:
        rows = sorted(set(dump['recipes']['data']['rows']))
        write_list(os.path.join(reg, 'recipes.tsv'), rows)
        counts['recipes'] = len(rows)
        total = dump['recipes']['data'].get('total')
        if total is not None and int(total) != len(rows):
            problems.append('registry dump: the recipe manager holds %d recipes, %d were listed type by type' % (int(total), len(rows)))
        by_type = {}
        for r in rows:
            t = r.split('\t')[1] if '\t' in r else '?'
            by_type[t] = by_type.get(t, 0) + 1
        write_list(os.path.join(reg, 'recipe_type_counts.tsv'), ['%s\t%d' % (t, by_type[t]) for t in sorted(by_type)])
    if 'advancements' in dump:
        ids = sorted(set(dump['advancements']['data']['ids']))
        write_list(os.path.join(reg, 'advancements.txt'), ids)
        counts['advancements'] = len(ids)

    # ---- logs ---------------------------------------------------------------
    latest = read_lines(os.path.join(logs, 'latest.log'))
    debug = read_lines(os.path.join(logs, 'debug.log'))
    kjs = {k: read_lines(os.path.join(logs, 'kubejs', k + '.log')) for k in ('server', 'startup')}

    sigs = {}
    done_line = 0
    for i, l in enumerate(latest):
        if not done_line and RX_DONE.search(l):
            done_line = i + 1
        m = RX_LATEST.match(l)
        if m:
            key = 'latest.log|%s|%s' % (m.group(1), signature(m.group(2)))
            sigs[key] = sigs.get(key, 0) + 1
    for k, lines in kjs.items():
        for l in lines:
            m = RX_KJS.match(l)
            if m:
                key = 'kubejs/%s.log|%s|%s' % (k, m.group(1), signature(m.group(2)))
                sigs[key] = sigs.get(key, 0) + 1
    write_json(os.path.join(ex, 'signatures.json'), sigs)
    counts['signatures'] = {}
    for key in sigs:
        lg, lvl, _ = key.split('|', 2)
        counts['signatures'][lg + ' ' + lvl] = counts['signatures'].get(lg + ' ' + lvl, 0) + 1

    scripts = {'loaded': {'server': [], 'startup': []}, 'load_order': {}, 'summary': {}, 'in_tree': scripts_in_tree, 'order_matches_production': {}}
    for k, lines in kjs.items():
        seen, order = set(), []
        for l in lines:
            m = RX_LOADED.search(l)
            if m and m.group(1) == k:
                if m.group(2) not in seen:
                    order.append(m.group(2))
                seen.add(m.group(2))
                continue
            m = RX_SUMMARY.search(l)
            if m and m.group(3) == k:
                scripts['summary'][k] = {'loaded': int(m.group(1)), 'of': int(m.group(2)), 'errors': int(m.group(4)), 'warnings': int(m.group(5))}
        scripts['loaded'][k] = sorted(seen)
        scripts['load_order'][k] = order
        # the scripts that loaded must have loaded in the order the live server loads them in
        want = [s for s in scripts_in_tree[k] if s in seen]
        scripts['order_matches_production'][k] = (order == want)
        if order and order != want:
            first = next((i for i, (a, b) in enumerate(zip(order, want)) if a != b), min(len(order), len(want)))
            problems.append('KubeJS %s scripts did not load in the order the live server loads them in (position %d: %s here, %s there): '
                            'this boot says nothing about scripts that depend on load order' % (k, first + 1, order[first] if first < len(order) else '-', want[first] if first < len(want) else '-'))
    scripts['handler_errors'] = sorted(set(m.group(1) for lines in kjs.values() for l in lines for m in [re.search(r"Error in '([^']+)'", l)] if m))
    scripts['in_tree'] = {k: sorted(v) for k, v in scripts_in_tree.items()}
    write_json(os.path.join(ex, 'scripts.json'), scripts)
    counts['scripts_loaded'] = {k: len(v) for k, v in scripts['loaded'].items()}

    rejected = {k: set() for k, _ in RX_REJECT}
    other, valid = set(), set()
    for l in latest:
        hit = False
        for kind, rx in RX_REJECT:
            m = rx.search(l)
            if m:
                rejected[kind].add(m.group(1))
                hit = True
                break
        if not hit:
            m = RX_REJECT_OTHER.search(l)
            if m:
                other.add('%s:%s' % (m.group(1), m.group(2)))
            m = RX_LOOT_VALID.search(l)
            if m:
                valid.add(m.group(1))
    write_list(os.path.join(reg, 'loot_tables_rejected.txt'), sorted(rejected['loot_tables']))
    write_json(os.path.join(ex, 'data_rejected.json'), {
        'loot_tables': sorted(rejected['loot_tables']), 'recipes': sorted(rejected['recipes']),
        'advancements': sorted(rejected['advancements']), 'tags_missing_references': sorted(rejected['tags']),
        'other_elements': sorted(other), 'loot_validation_problems': sorted(valid)})
    counts['loot_tables_rejected'] = len(rejected['loot_tables'])
    counts['recipes_rejected'] = len(rejected['recipes'])

    # A mixin applies when its target class is first loaded. Up to Done that is the same in every boot of a
    # tree; after Done it depends on what the world happens to do (which mob spawns, which goal runs).
    cfgs, applied, late = [], set(), set()
    after_done = False
    for l in debug:
        if not after_done and RX_DONE.search(l):
            after_done = True
            continue
        m = RX_MIXING.search(l)
        if m:
            (late if after_done else applied).add((m.group(2), m.group(1), m.group(3)))
            continue
        m = RX_MIXCFG.search(l)
        if m and m.group(1) not in cfgs:
            cfgs.append(m.group(1))
    late -= applied
    per_cfg = {}
    for c, _mx, _t in applied | late:
        per_cfg[c] = per_cfg.get(c, 0) + 1
    if debug:
        os.makedirs(os.path.join(result_dir, 'mixins'), exist_ok=True)
        write_list(os.path.join(result_dir, 'mixins', 'configs_registered.txt'), sorted(cfgs))
        write_list(os.path.join(result_dir, 'mixins', 'configs_applied.txt'), sorted(per_cfg))
        write_list(os.path.join(result_dir, 'mixins', 'applied.tsv'), ['%s\t%s\t%s' % a for a in sorted(applied)])
        write_list(os.path.join(result_dir, 'mixins', 'applied_after_done.tsv'), ['%s\t%s\t%s' % a for a in sorted(late)])
        counts['mixin_configs_registered'], counts['mixin_configs_applied'] = len(cfgs), len(per_cfg)
        counts['mixins_applied'], counts['mixins_applied_after_done'] = len(applied), len(late)
    else:
        problems.append('logs/debug.log is missing: which mixins applied is not known for this boot')
    counts['registries'] = len(reg_counts)
    return counts, problems, done_line


def copy_tree(src, dst):
    if os.path.isdir(src):
        shutil.copytree(src, dst, dirs_exist_ok=True)


def config_generated(run_dir, src_root):
    sd = os.path.join(src_root, '.minecraft', 'server_distribution')
    out = []
    for d in ('config', 'defaultconfigs'):
        root = os.path.join(run_dir, d)
        for base, _dirs, files in os.walk(root):
            for f in files:
                rel = os.path.relpath(os.path.join(base, f), run_dir).replace(os.sep, '/')
                if not os.path.exists(os.path.join(sd, rel)):
                    out.append(rel)
    return sorted(out)


# -----------------------------------------------------------------------------
# the checker's inputs: the tree's own lists plus the rig's differences
# -----------------------------------------------------------------------------
def compose_check(result_dir, src_root, scripts_in_tree, label):
    """loud-check.ps1 runs on the result's logs with: the liveness manifest and the baseline of the
    TREE UNDER TEST, plus rig_baseline.json next to this file (what a fresh world on Linux prints and
    does not print). The live baseline is read, never written."""
    out = os.path.join(result_dir, 'check')
    os.makedirs(out, exist_ok=True)
    notes = []
    rig = read_json(os.path.join(HERE, 'rig_baseline.json'))
    loud_tree = os.path.join(src_root, '.minecraft', 'dev', 'loud')
    loud_tool = os.path.normpath(os.path.join(HERE, '..', 'loud'))

    def pick(name):
        p = os.path.join(loud_tree, name)
        if os.path.isfile(p):
            return p
        notes.append('%s is not in the tree under test: the one next to the tool is used' % name)
        return os.path.join(loud_tool, name)

    base = read_json(pick('baseline.json'))
    sig = {(e['log'], e['sig']): e for e in base.get('signatures') or []}
    defects = {(e['log'], e['sig']): e for e in base.get('defects') or []}
    for e in rig.get('signatures') or []:
        k = (e['log'], e['sig'])
        if k in defects:
            continue                      # the pack lists it as a defect: it stays one on the rig
        sig.setdefault(k, e)
    for e in rig.get('defects') or []:
        k = (e['log'], e['sig'])
        if k not in sig:
            defects.setdefault(k, e)
    write_json(os.path.join(out, 'baseline.json'), {
        'version': 1, 'about': ['Composed by icboot.py for one run: the baseline of the tree under test plus rig_baseline.json. Not a file to edit.'],
        'signatures': list(sig.values()), 'defects': list(defects.values())})

    man = read_json(pick('liveness_manifest.json'))
    skip = {e['id']: e for e in rig.get('liveness_skip') or []}
    kept = [e for e in man.get('entries') or [] if e.get('id') not in skip]
    unknown = sorted(set(skip) - set(e.get('id') for e in man.get('entries') or []))
    if unknown:
        notes.append('rig_baseline.json skips liveness entries the manifest no longer has: ' + ', '.join(unknown))
    man['entries'] = kept
    write_json(os.path.join(out, 'liveness_manifest.json'), man)

    files = {}
    for kind in ('server', 'startup'):
        for s in scripts_in_tree[kind]:
            files['kubejs/%s_scripts/%s' % (kind, s)] = {}
    write_json(os.path.join(out, 'expected_state.json'), {'version': 1, 'generated_from': label, 'roots': ['kubejs'], 'files': files})

    # the tree's own expected_state.json, when it lists other scripts than the tree has
    es = os.path.join(src_root, '.minecraft', 'server_distribution', 'expected_state.json')
    if os.path.isfile(es):
        listed = set(m.group(1) + '/' + m.group(2) for m in re.finditer(r'"kubejs/(server|startup)_scripts/([^"]+\.js)"\s*:\s*\{', read_text(es)))
        have = set('%s/%s' % (k, s) for k in ('server', 'startup') for s in scripts_in_tree[k] if s != HELPER_NAME)
        if listed != have:
            notes.append("the tree's expected_state.json lists %d scripts the tree does not have and lacks %d it has (regenerate it before pushing)" % (len(listed - have), len(have - listed)))
    return notes


RX_FINDING = re.compile(r'^\s{2}(RED|AMBER)\s+(\S+)\s+(\S+)\s*$')


def parse_check(text):
    """loud-check.ps1's console report: findings and the last line."""
    findings, lines = [], text.replace('\r', '').split('\n')
    for i, l in enumerate(lines):
        m = RX_FINDING.match(l)
        if m:
            detail = lines[i + 1].strip() if i + 1 < len(lines) else ''
            findings.append({'sev': m.group(1), 'kind': m.group(2), 'id': m.group(3), 'detail': detail})
    verdict = None
    for l in lines:
        m = re.match(r'^\[loud-check\] (GREEN|AMBER|RED) - (.*)\(exit (\d)\)\s*$', l)
        if m:
            verdict = {'worst': m.group(1), 'tail': m.group(2).strip(), 'exit': int(m.group(3))}
    return findings, verdict


# -----------------------------------------------------------------------------
# run
# -----------------------------------------------------------------------------
def extract_source(req, home):
    """The tree under test: a working tree as it is on disk, or a commit unpacked from the archive boot.ps1 made."""
    src = req['source']
    if src['kind'] == 'tree':
        root = to_wsl(src['path'])
        if not os.path.isdir(os.path.join(root, '.minecraft', 'server_distribution')):
            raise Cannot('not a pack checkout: %s' % src['path'])
        return root
    root = os.path.join(home, 'src', src['sha'][:12])
    marker = os.path.join(root, '.complete')
    if not os.path.isfile(marker):
        tar = to_wsl(src['archive'])
        if not os.path.isfile(tar):
            raise Cannot('source archive not found: %s' % src['archive'])
        shutil.rmtree(root, ignore_errors=True)
        os.makedirs(root)
        with tarfile.open(tar) as t:
            t.extractall(root, filter='data')
        write_text(marker, src['sha'] + '\n')
    if src.get('archive'):
        try:
            os.remove(to_wsl(src['archive']))
        except OSError:
            pass
    # keep the few most recent unpacked commits
    base = os.path.join(home, 'src')
    old = sorted((os.path.getmtime(os.path.join(base, d)), d) for d in os.listdir(base))
    for _t, d in old[:-6]:
        if d != src['sha'][:12]:
            shutil.rmtree(os.path.join(base, d), ignore_errors=True)
    return root


def wsl_home(req):
    h = req.get('wsl_home') or os.environ.get('ICRAFT_BOOT_WSL_HOME') or '~/icraft-boot'
    return os.path.abspath(os.path.expanduser(h))


def cache_dirs_of(req, src_root):
    dirs = [to_wsl(d) for d in req.get('jar_cache') or []]
    dirs += [os.path.join(src_root, '.minecraft', 'mods'), os.path.join(src_root, '.minecraft', 'distribution', 'client', 'mods')]
    seen, out = set(), []
    for d in dirs:
        if d and d not in seen and os.path.isdir(d):
            seen.add(d)
            out.append(d)
    return out


def modset_of(req, src_root, consts):
    sd = os.path.join(src_root, '.minecraft', 'server_distribution')
    index_dir = to_wsl(req.get('index_dir')) if req.get('index_dir') else os.path.join(sd, 'mods', '.index')
    return compute_modset(index_dir, os.path.join(sd, 'mods'), os.path.join(sd, 'custom_jars_manifest.json'), consts)


def report_jar_problems(problems, cache_dirs):
    say('CANNOT RUN: %d jar%s of the mod set missing or wrong (nothing is downloaded: put the right file into a cache folder)' % (len(problems), '' if len(problems) == 1 else 's'))
    for p in problems:
        say('  %-10s %s: %s' % (p['problem'], p['filename'], p['detail']))
    say('  cache folders searched: ' + (', '.join(cache_dirs) or 'none'))


def cmd_modset(req):
    home = wsl_home(req)
    src_root = extract_source(req, home)
    consts = launcher_constants(src_root)
    ms = modset_of(req, src_root, consts)
    print_modset(ms)
    rc = EXIT_OK
    if req.get('expect_list'):
        cmp_ = compare_expected(ms, to_wsl(req['expect_list']))
        if cmp_['only_computed'] or cmp_['only_listed']:
            rc = EXIT_FINDINGS
            say('DIFFERS from %s (%d jars listed):' % (req['expect_list'], cmp_['listed']))
            for f in cmp_['only_computed']:
                say('  computed, not listed: ' + f)
            for f in cmp_['only_listed']:
                say('  listed, not computed: ' + f)
        else:
            say('identical to %s (%d jars)' % (req['expect_list'], cmp_['listed']))
        ms['expected'] = cmp_
    if not req.get('no_verify'):
        cache_dirs = cache_dirs_of(req, src_root)
        resolved, problems, hashed = resolve_jars(ms, os.path.join(src_root, '.minecraft', 'server_distribution', 'mods'), cache_dirs, Pool(os.path.join(home, 'pool')))
        if problems:
            report_jar_problems(problems, cache_dirs)
            rc = EXIT_CANNOT
        else:
            say('all %d jars present; %d match the hash on record (%d read and hashed now, the rest already in the pool)' % (len(resolved), len(resolved) - len(ms['unverified']), hashed))
            if ms['unverified']:
                say('  taken by name only, their metafile carries no hash: ' + ', '.join(ms['unverified']))
    if req.get('out'):
        write_json(to_wsl(req['out']), ms)
    return rc


def cmd_setup(req):
    home = wsl_home(req)
    say('java ' + java_version())
    src_root = extract_source(req, home)
    consts = launcher_constants(src_root)
    ensure_forge(home, consts)
    say('rig home: %s (Forge %s, jar pool, one run folder)' % (home, consts['forge_version']))
    return EXIT_OK


def cmd_run(req):
    home = wsl_home(req)
    result_dir = to_wsl(req['result_dir'])
    params = {'heap': req.get('heap') or '8G', 'seed': str(req.get('seed') or '20261012'),
              'idle_seconds': int(req.get('idle_seconds') or 45), 'boot_timeout': int(req.get('boot_timeout') or 900),
              'stop_timeout': int(req.get('stop_timeout') or 240), 'jvm_extra': req.get('jvm_extra') or [],
              'console': [c for c in (req.get('console') or []) if c and c.strip()]}
    hm = heap_mb(params['heap'])
    params['heap_min'] = req.get('heap_min') or ('%dM' % (hm // 2))
    heap_mb(params['heap_min'])
    jv = java_version()
    src_root = extract_source(req, home)
    consts = launcher_constants(src_root)
    label = req['source'].get('label') or req['source'].get('sha', '')[:12] or 'tree'
    say('source: %s' % label)

    ms = modset_of(req, src_root, consts)
    print_modset(ms)
    cache_dirs = cache_dirs_of(req, src_root)
    t = time.monotonic()
    resolved, problems, hashed = resolve_jars(ms, os.path.join(src_root, '.minecraft', 'server_distribution', 'mods'), cache_dirs, Pool(os.path.join(home, 'pool')))
    if problems:
        report_jar_problems(problems, cache_dirs)
        return EXIT_CANNOT
    say('jars: %d of %d verified against a hash on record (%d read and hashed now, %.0f s)' % (len(resolved) - len(ms['unverified']), len(resolved), hashed, time.monotonic() - t))

    shutil.rmtree(result_dir, ignore_errors=True)
    os.makedirs(result_dir)
    result = {'tool_version': TOOL_VERSION, 'name': req['name'], 'source': {k: v for k, v in req['source'].items() if k != 'archive'},
              'params': params, 'started': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
              'env': {'java': jv, 'kernel': os.uname().release, 'cpus': os.cpu_count(), 'mem_available_mb_before': mem_available_mb()},
              'forge': consts['forge_version'], 'problems': [], 'notes': []}
    write_json(os.path.join(result_dir, 'modset.json'), ms)
    result['modset'] = {'count': ms['count'], 'arithmetic': ms['arithmetic'], 'metafiles': ms['metafiles'], 'by_side': ms['by_side'],
                        'force_skipped': [s['filename'] for s in ms['force_skipped']], 'committed_extra': [e['filename'] for e in ms['committed_extra']],
                        'dropped': ms['dropped'], 'duplicates': ms['duplicates'], 'unverified': ms['unverified']}
    write_list(os.path.join(result_dir, 'mods.txt'), [m['filename'] for m in ms['mods']])
    write_list(os.path.join(result_dir, 'mods.tsv'), ['%s\t%s' % (m['filename'], m['sha256']) for m in ms['mods']])
    if ms['unverified']:
        result['notes'].append('%d jar(s) were taken by name only, their metafile carries no hash: %s' % (len(ms['unverified']), ', '.join(ms['unverified'])))

    run_dir = default_run_dir()
    with Lock(home, int(req.get('lock_wait') or 1800), label):
        try:
            for pid, cwd in foreign_jvms():
                result['notes'].append('another JVM was running in WSL when this boot started (pid %d in %s): timings and memory may be off' % (pid, cwd))
                say('note: ' + result['notes'][-1])
            need = hm + 4096           # the heap, the JVM's own memory, and the run folder (it is on a tmpfs: jars, world, logs)
            if mem_available_mb() < need:
                raise Cannot('%d MB of memory available in WSL, the boot needs about %d (heap %s, the JVM itself, the run folder in memory): stop another JVM or pass -Heap' % (mem_available_mb(), need, params['heap']))
            ensure_forge(home, consts, allow_install=bool(req.get('allow_install', True)))
            t = time.monotonic()
            asm = assemble(run_dir, src_root, home, consts, resolved, params)
            scripts_in_tree = script_list(run_dir)
            result['rig'] = {'run_dir': run_dir, 'dir_order': asm['dir_order'], 'port': asm['port'], 'voice_port': asm['voice_port'],
                             'chunky_flag': asm['chunky_flag'], 'jvm_flags': asm['jvm_flags']}
            result['notes'] += asm['notes']
            say('sandbox ready in %.0f s on %s: %d mods, %d server scripts, %d startup scripts, port %d, voice chat port %d'
                % (time.monotonic() - t, run_dir, len(resolved), len(scripts_in_tree['server']), len(scripts_in_tree['startup']), asm['port'], asm['voice_port']))
            boot = {}
            try:
                run_server(run_dir, consts, asm['jvm_flags'], params, boot)
            finally:
                # capture, whatever happened
                copy_tree(os.path.join(run_dir, 'logs'), os.path.join(result_dir, 'logs'))
                copy_tree(os.path.join(run_dir, 'crash-reports'), os.path.join(result_dir, 'crash-reports'))
                copy_tree(os.path.join(run_dir, 'icboot-out'), os.path.join(result_dir, 'dump'))
                if os.path.isfile(os.path.join(run_dir, 'console.log')):
                    shutil.copyfile(os.path.join(run_dir, 'console.log'), os.path.join(result_dir, 'console.log'))
            boot.pop('pid', None)
            result['boot'] = boot
            counts, problems, _done_line = extract(result_dir, run_dir, scripts_in_tree)
            result['counts'] = counts
            result['problems'] += problems
            write_list(os.path.join(result_dir, 'config_generated.txt'), config_generated(run_dir, src_root))
            result['notes'] += compose_check(result_dir, src_root, scripts_in_tree, label)
            if boot.get('heap_dumps'):
                result['problems'].append('the JVM wrote a heap dump (out of memory): %s' % ', '.join(boot['heap_dumps']))
            if boot.get('pregen_started'):
                result['problems'].append('the pack started a Chunky pregeneration in the sandbox (the flag in pregen/auto_chunky.js no longer stops it): timings are not comparable')
            if boot.get('seed_reported') and boot['seed_reported'] != params['seed']:
                result['problems'].append('the world seed is %s, not the pinned %s' % (boot['seed_reported'], params['seed']))
        finally:
            # the run folder holds a generated world and sits in memory: it never outlives the run unless asked
            if req.get('keep'):
                say('run folder kept: %s (it is in memory and holds a generated world: delete it by hand)' % run_dir)
            else:
                shutil.rmtree(run_dir, ignore_errors=True)
    result['finished'] = time.strftime('%Y-%m-%dT%H:%M:%S%z')
    result['booted'] = bool(boot.get('clean_stop'))
    write_json(os.path.join(result_dir, 'result.json'), result)
    if not boot.get('reached_done'):
        say('result: %s' % req['result_dir'])
        return EXIT_BOOT
    say('stopped: exit code %s after %.0f s, %d crash report(s)' % (boot.get('exit_code'), boot.get('stop_seconds', 0), len(boot.get('crash_reports', []))))
    return EXIT_OK if boot.get('clean_stop') else EXIT_BOOT


# -----------------------------------------------------------------------------
# finish: the verdict of one boot
# -----------------------------------------------------------------------------
def cmd_finish(req):
    result_dir = to_wsl(req['result_dir'])
    result = read_json(os.path.join(result_dir, 'result.json'))
    check = {'ran': False}
    txt = os.path.join(result_dir, 'loud-check.txt')
    if os.path.isfile(txt):
        raw = open(txt, 'rb').read()
        text = raw.decode('utf-16') if raw[:2] in (b'\xff\xfe', b'\xfe\xff') else raw.decode('utf-8-sig', 'replace')
        findings, verdict = parse_check(text)
        check = {'ran': verdict is not None, 'findings': findings, 'verdict': verdict}
        if verdict is None:
            result['problems'].append('the boot-log checker did not report a verdict: see loud-check.txt')
    elif not req.get('no_check'):
        result['problems'].append('the boot-log checker was not run')
    result['check'] = check
    boot = result.get('boot') or {}
    new = [f for f in check.get('findings', []) if not (f['kind'] == 'NEW' and f['id'].startswith('defect:'))]
    known = [f for f in check.get('findings', []) if f['kind'] == 'NEW' and f['id'].startswith('defect:')]
    if not boot.get('clean_stop'):
        verdict, code = 'BOOT FAILED', EXIT_BOOT
    elif new or result['problems']:
        verdict, code = 'FINDINGS', EXIT_FINDINGS
    else:
        verdict, code = 'PASS', EXIT_OK
    result['verdict'], result['exit_code'] = verdict, code
    write_json(os.path.join(result_dir, 'result.json'), result)
    # what boot.ps1 reads back: flat, plain keys (Windows PowerShell 5.1 has a narrow JSON reader)
    write_json(os.path.join(result_dir, 'summary.json'), {
        'name': result['name'], 'verdict': verdict, 'exit_code': code, 'tool_version': result['tool_version'],
        'heap': result['params']['heap'], 'seed': result['params']['seed'], 'label': result['source'].get('label') or '',
        'sha': result['source'].get('sha') or '', 'kind': result['source']['kind'], 'finished': result.get('finished') or ''})

    c = result.get('counts') or {}
    say()
    say('=== %s: %s ===' % (result['name'], verdict))
    say('source   : %s' % (result['source'].get('label') or result['source'].get('sha')))
    say('mods     : %s' % result['modset']['arithmetic'])
    if boot.get('reached_done'):
        say('boot     : Done (%.3fs), %.0f s after the JVM start; stop %.0f s; exit code %s; %d crash report(s)' % (
            boot['done_seconds'], boot['wall_to_done_s'], boot.get('stop_seconds', 0), boot.get('exit_code'), len(boot.get('crash_reports', []))))
        say('idle     : %s TPS, %s ms a tick, after %s s' % (boot.get('tps'), boot.get('mean_tick_ms'), boot.get('idle_seconds')))
        say('memory   : %s MB live after a full GC, %s MB heap in use before it, %s MB peak resident (heap %s, pre-touched from %s)' % (
            boot.get('live_heap_mb'), boot.get('heap_used_mb'), boot.get('peak_rss_mb'), result['params']['heap'], result['params']['heap_min']))
    else:
        say('boot     : %s' % boot.get('died'))
    if c:
        order = [n for n, _ in SNAPSHOT_REGISTRIES] + ['dimensions', 'game_rules', 'loot_tables', 'loot_tables_rejected', 'recipes', 'recipes_rejected', 'advancements']
        say('registry : ' + ', '.join('%s %s' % (k, c[k]) for k in order if k in c))
        if 'mixins_applied' in c:
            say('mixins   : %d classes applied up to Done and %d after it, from %d of %d registered configs' % (
                c['mixins_applied'], c.get('mixins_applied_after_done', 0), c['mixin_configs_applied'], c['mixin_configs_registered']))
        sl = c.get('scripts_loaded') or {}
        say('scripts  : %s server, %s startup loaded (the server count includes the rig helper)' % (sl.get('server'), sl.get('startup')))
    if check.get('verdict'):
        v = check['verdict']
        say('checker  : %s - %s; %d known defect(s) of the pack, %d other finding(s)' % (v['worst'], v['tail'], len(known), len(new)))
        for f in new[:25]:
            say('  %-5s %-12s %s' % (f['sev'], f['kind'], f['id']))
            say('        %s' % f['detail'][:260])
        if len(new) > 25:
            say('  ... and %d more: loud-check.txt' % (len(new) - 25))
    for p in result['problems']:
        say('PROBLEM  : ' + p)
    for n in result['notes']:
        say('note     : ' + n)
    say('result   : %s' % req['result_dir'])
    return code


# -----------------------------------------------------------------------------
# diff
# -----------------------------------------------------------------------------
def _sets(a_dir, b_dir, rel):
    a, b = set(read_list(os.path.join(a_dir, rel))), set(read_list(os.path.join(b_dir, rel)))
    return sorted(b - a), sorted(a - b)


def load_entities(d):
    p = os.path.join(d, 'registry', 'entities.json')
    return (read_json(p).get('entities') or {}) if os.path.isfile(p) else {}


# Two boots of the SAME tree differ in a few WARN lines: a duration that crosses from seconds to minutes, a lag
# figure glued to its unit, a default list printed in hash order. The diff compares signatures reduced a step
# further than the checker's, so that these do not come up as new and gone. (signatures.json keeps the checker's form.)
RX_DIFF_DIGITS = re.compile(r'\d+')
DIFF_CUTS = (
    (re.compile(r'(Initial datapack load took) .*$'), r'\1 <time>'),
    (re.compile(r'(was corrected from .*? to its default),.*$'), r'\1'),
)


def diff_signatures(sigs):
    out = {}
    for key, n in sigs.items():
        lg, lvl, text = key.split('|', 2)
        text = RX_DIFF_DIGITS.sub('<n>', text.replace('<n>', '\0')).replace('\0', '<n>')
        for rx, rep in DIFF_CUTS:
            text = rx.sub(rep, text)
        k = '%s|%s|%s' % (lg, lvl, text)
        out[k] = out.get(k, 0) + n
    return out


def diff_results(a_dir, b_dir):
    """A = the base, B = the tree under test. Everything is 'in B and not in A' (added) or the reverse (removed)."""
    ra, rb = read_json(os.path.join(a_dir, 'result.json')), read_json(os.path.join(b_dir, 'result.json'))
    out = {'base': {'name': ra['name'], 'source': ra['source']}, 'new': {'name': rb['name'], 'source': rb['source']},
           'regressions': [], 'registries': {}, 'comparable': True, 'notes': []}
    for side, r in (('base', ra), ('new', rb)):
        if any('another JVM was running' in n for n in r.get('notes', [])):
            out['notes'].append('another JVM ran in WSL during the %s boot: its times and its resident memory say little' % side)
    if ra.get('tool_version') != rb.get('tool_version'):
        out['notes'].append('the two results were made by different versions of the tool (%s, %s)' % (ra.get('tool_version'), rb.get('tool_version')))
    for k in ('heap', 'heap_min', 'seed'):
        if ra['params'].get(k) != rb['params'].get(k):
            out['notes'].append('%s differs: %s against %s (timings and memory are not comparable)' % (k, ra['params'].get(k), rb['params'].get(k)))
    ba, bb = ra.get('boot') or {}, rb.get('boot') or {}
    out['boot'] = {k: [ba.get(k), bb.get(k)] for k in ('reached_done', 'clean_stop', 'done_seconds', 'wall_to_done_s', 'stop_seconds', 'exit_code',
                                                      'tps', 'mean_tick_ms', 'live_heap_mb', 'heap_used_mb', 'peak_rss_mb', 'metaspace_mb', 'loaded_classes')}
    if ba.get('clean_stop') and not bb.get('clean_stop'):
        out['regressions'].append('the base boots and stops cleanly, the new tree does not (%s)' % (bb.get('died') or 'exit code %s' % bb.get('exit_code')))
    if not bb.get('reached_done') or not ba.get('reached_done'):
        out['comparable'] = False
        out['notes'].append('one side did not reach Done: its registries and logs are those of a partial boot')

    add, rem = _sets(a_dir, b_dir, 'mods.txt')
    sha_a = dict(l.split('\t', 1) for l in read_list(os.path.join(a_dir, 'mods.tsv')) if '\t' in l)
    sha_b = dict(l.split('\t', 1) for l in read_list(os.path.join(b_dir, 'mods.tsv')) if '\t' in l)
    out['mods'] = {'added': add, 'removed': rem, 'rebuilt': sorted(f for f in sha_a if f in sha_b and sha_a[f] != sha_b[f])}

    names = sorted(set(os.listdir(os.path.join(a_dir, 'registry', 'all')) if os.path.isdir(os.path.join(a_dir, 'registry', 'all')) else [])
                   | set(os.listdir(os.path.join(b_dir, 'registry', 'all')) if os.path.isdir(os.path.join(b_dir, 'registry', 'all')) else []))
    for n in names:
        add, rem = _sets(a_dir, b_dir, os.path.join('registry', 'all', n))
        if add or rem:
            out['registries'][n[:-4].replace('__', ':').replace('--', '/')] = {'added': add, 'removed': rem}
    for label, rel in (('dimensions', 'registry/dimensions.txt'), ('game_rules', 'registry/game_rules.txt'), ('loot_tables', 'registry/loot_tables.txt'),
                       ('advancements', 'registry/advancements.txt'), ('recipes', 'registry/recipes.tsv'),
                       ('game_rule_values', 'registry/game_rule_values.tsv')):
        add, rem = _sets(a_dir, b_dir, rel)
        if add or rem:
            out[label] = {'added': add, 'removed': rem}

    ea, eb = load_entities(a_dir), load_entities(b_dir)
    changed = []
    for eid in sorted(set(ea) & set(eb)):
        if ea[eid] == eb[eid]:
            continue
        ch = {'id': eid}
        if ea[eid].get('category') != eb[eid].get('category'):
            ch['category'] = [ea[eid].get('category'), eb[eid].get('category')]
        aa, ab = ea[eid].get('attributes') or {}, eb[eid].get('attributes') or {}
        at = {k: [aa.get(k), ab.get(k)] for k in sorted(set(aa) | set(ab)) if aa.get(k) != ab.get(k)}
        if at:
            ch['attributes'] = at
        ta, tb = set(ea[eid].get('tags') or []), set(eb[eid].get('tags') or [])
        if ta != tb:
            ch['tags'] = {'added': sorted(tb - ta), 'removed': sorted(ta - tb)}
        changed.append(ch)
    if changed:
        out['entities_changed'] = changed

    da = read_json(os.path.join(a_dir, 'extract', 'data_rejected.json')) if os.path.isfile(os.path.join(a_dir, 'extract', 'data_rejected.json')) else {}
    db = read_json(os.path.join(b_dir, 'extract', 'data_rejected.json')) if os.path.isfile(os.path.join(b_dir, 'extract', 'data_rejected.json')) else {}
    out['rejected'] = {}
    for kind in sorted(set(da) | set(db)):
        new, gone = sorted(set(db.get(kind, [])) - set(da.get(kind, []))), sorted(set(da.get(kind, [])) - set(db.get(kind, [])))
        if new or gone:
            out['rejected'][kind] = {'newly_rejected': new, 'no_longer_rejected': gone}
        if new and kind != 'loot_validation_problems':
            out['regressions'].append('%d %s newly rejected by the game: %s' % (len(new), kind.replace('_', ' '), ', '.join(new[:8]) + (' ...' if len(new) > 8 else '')))

    ma, mb = os.path.join(a_dir, 'mixins'), os.path.join(b_dir, 'mixins')
    if os.path.isdir(ma) and os.path.isdir(mb):
        started, stopped = _sets(a_dir, b_dir, 'mixins/configs_applied.txt')
        cadd, crem = _sets(a_dir, b_dir, 'mixins/configs_registered.txt')
        # Class by class. A mixin applies when its target class is first loaded, and which classes a boot loads
        # varies a little (what the spawn area generated, which mob spawned): two boots of ONE tree differ in up
        # to seven mixin classes. So a mixin counts as stopped (started) only when the other boot DID load its
        # target class (some other mixin went into it there) or its config is not registered there at all.
        def rows(d):
            got = set(read_list(os.path.join(d, 'applied.tsv'))) | set(read_list(os.path.join(d, 'applied_after_done.tsv')))
            return set(tuple(r.split('\t')) for r in got if r.count('\t') == 2)
        all_a, all_b = rows(ma), rows(mb)
        targets_a, targets_b = set(r[2] for r in all_a), set(r[2] for r in all_b)
        reg_a, reg_b = set(read_list(os.path.join(ma, 'configs_registered.txt'))), set(read_list(os.path.join(mb, 'configs_registered.txt')))
        mrem = sorted(r for r in all_a - all_b if r[2] in targets_b or r[0] not in reg_b)
        madd = sorted(r for r in all_b - all_a if r[2] in targets_a or r[0] not in reg_a)
        unsure = sorted((all_a ^ all_b) - set(mrem) - set(madd))
        out['mixins'] = {'configs_stopped_applying': stopped, 'configs_started_applying': started, 'configs_registered_added': cadd,
                         'configs_registered_removed': crem, 'mixins_stopped': ['\t'.join(r) for r in mrem],
                         'mixins_started': ['\t'.join(r) for r in madd], 'target_not_loaded_on_one_side': ['\t'.join(r) for r in unsure]}
        gone_with_jar = set(crem)
        real = [c for c in stopped if c not in gone_with_jar]
        if real:
            out['regressions'].append('%d mixin config(s) still registered and no longer applying anything: %s' % (len(real), ', '.join(real[:8])))
        lost = [r for r in mrem if r[0] in reg_b]
        if lost:
            out['regressions'].append('%d mixin class(es) no longer apply although their config is registered and their target class is loaded: %s'
                                      % (len(lost), ', '.join('%s (%s)' % (r[1], r[0]) for r in lost[:6])))
    else:
        out['notes'].append('no debug.log on one side: mixins not compared')

    sa = read_json(os.path.join(a_dir, 'extract', 'scripts.json'))
    sb = read_json(os.path.join(b_dir, 'extract', 'scripts.json'))
    out['scripts'] = {}
    for kind in ('server', 'startup'):
        la, lb = set(sa['loaded'][kind]), set(sb['loaded'][kind])
        ta, tb = set(sa['in_tree'][kind]), set(sb['in_tree'][kind])
        not_loaded = sorted(tb - lb)
        out['scripts'][kind] = {'loaded_added': sorted(lb - la), 'loaded_removed': sorted(la - lb), 'in_tree_not_loaded': not_loaded,
                                'summary': [sa['summary'].get(kind), sb['summary'].get(kind)]}
        newly = sorted(set(not_loaded) - (ta - la))
        if newly:
            out['regressions'].append('%d %s script(s) in the tree did not load: %s' % (len(newly), kind, ', '.join(newly[:8])))
        s = sb['summary'].get(kind)
        if s and (s['errors'] or s['loaded'] != s['of']) and not (sa['summary'].get(kind) or {}).get('errors'):
            out['regressions'].append('KubeJS %s scripts: loaded %d/%d with %d errors' % (kind, s['loaded'], s['of'], s['errors']))
    newh = sorted(set(sb.get('handler_errors', [])) - set(sa.get('handler_errors', [])))
    if newh:
        out['regressions'].append("handler(s) that now abort: " + ', '.join("Error in '%s'" % h for h in newh))

    ga = diff_signatures(read_json(os.path.join(a_dir, 'extract', 'signatures.json')))
    gb = diff_signatures(read_json(os.path.join(b_dir, 'extract', 'signatures.json')))
    sig = {}
    for key in sorted(set(ga) | set(gb)):
        lg, lvl, text = key.split('|', 2)
        bucket = sig.setdefault('%s %s' % (lg, lvl), {'new': [], 'gone': []})
        if key not in ga:
            bucket['new'].append({'sig': text, 'count': gb[key]})
        elif key not in gb:
            bucket['gone'].append({'sig': text, 'count': ga[key]})
    out['signatures'] = {k: v for k, v in sig.items() if v['new'] or v['gone']}
    for k, v in out['signatures'].items():
        if v['new'] and (k.endswith('ERROR') or k.endswith('FATAL')):
            out['regressions'].append('%d new %s signature(s), first: %s' % (len(v['new']), k, v['new'][0]['sig'][:140]))

    ca, cb = (ra.get('check') or {}), (rb.get('check') or {})
    ida = set(f['id'] for f in ca.get('findings', []))
    out['checker'] = {'base': (ca.get('verdict') or {}).get('worst'), 'new': (cb.get('verdict') or {}).get('worst'),
                      'findings_new': [f for f in cb.get('findings', []) if f['id'] not in ida],
                      'findings_gone': [f for f in ca.get('findings', []) if f['id'] not in set(x['id'] for x in cb.get('findings', []))]}
    for f in out['checker']['findings_new']:
        if f['sev'] == 'RED':
            out['regressions'].append('checker: %s %s (%s)' % (f['kind'], f['id'], f['detail'][:140]))
    return out


def _cap(items, n=12, fmt=str):
    lines = ['      ' + fmt(i) for i in items[:n]]
    if len(items) > n:
        lines.append('      ... and %d more (diff.json has all)' % (len(items) - n))
    return lines


def diff_text(d):
    L = []
    L.append('BOOT DIFF   base: %s   new: %s' % (d['base']['name'], d['new']['name']))
    L.append('  base source: %s' % (d['base']['source'].get('label') or d['base']['source'].get('sha')))
    L.append('  new source : %s' % (d['new']['source'].get('label') or d['new']['source'].get('sha')))
    for n in d['notes']:
        L.append('  note: ' + n)
    L.append('')
    L.append('REGRESSIONS: %d' % len(d['regressions']))
    for r in d['regressions']:
        L.append('  ! ' + r)
    L.append('')
    b = d['boot']

    def pair(k, unit=''):
        x, y = b[k]
        if isinstance(x, (int, float)) and isinstance(y, (int, float)) and not isinstance(x, bool):
            return '%s -> %s%s (%+.1f)' % (x, y, unit, y - x)
        return '%s -> %s%s' % (x, y, unit)
    L.append('boot and memory')
    L.append('  Done            : ' + pair('done_seconds', ' s'))
    L.append('  JVM start to Done: ' + pair('wall_to_done_s', ' s'))
    L.append('  idle TPS        : ' + pair('tps') + '   tick: ' + pair('mean_tick_ms', ' ms'))
    L.append('  live heap       : ' + pair('live_heap_mb', ' MB') + '   peak resident: ' + pair('peak_rss_mb', ' MB'))
    L.append('  loaded classes  : ' + pair('loaded_classes') + '   clean stop: ' + pair('clean_stop') + '   exit code: ' + pair('exit_code'))
    L.append('')
    m = d['mods']
    L.append('mod jars: +%d -%d, %d with other bytes under the same name' % (len(m['added']), len(m['removed']), len(m.get('rebuilt', []))))
    L += ['      + ' + x for x in m['added'][:20]] + ['      - ' + x for x in m['removed'][:20]] + ['      ~ ' + x for x in m.get('rebuilt', [])[:20]]
    L.append('')
    L.append('registries with a change: %d' % len(d['registries']))
    for key in sorted(d['registries']):
        r = d['registries'][key]
        L.append('  %s: +%d -%d' % (key, len(r['added']), len(r['removed'])))
        L += _cap(r['added'], 8, lambda x: '+ ' + x) + _cap(r['removed'], 8, lambda x: '- ' + x)
    for label in ('dimensions', 'game_rules', 'game_rule_values', 'loot_tables', 'recipes', 'advancements'):
        if label in d:
            L.append('  %s: +%d -%d' % (label, len(d[label]['added']), len(d[label]['removed'])))
            L += _cap(d[label]['added'], 8, lambda x: '+ ' + x.replace('\t', '  ')) + _cap(d[label]['removed'], 8, lambda x: '- ' + x.replace('\t', '  '))
    if 'entities_changed' in d:
        L.append('  entity types whose category, tags or base attributes changed: %d' % len(d['entities_changed']))
        L += _cap(d['entities_changed'], 12, lambda c: c['id'] + ': ' + json.dumps({k: v for k, v in c.items() if k != 'id'}, sort_keys=True)[:200])
    L.append('')
    L.append('data the game rejected at load')
    if not d['rejected']:
        L.append('  no change')
    for kind in sorted(d['rejected']):
        r = d['rejected'][kind]
        L.append('  %s: %d newly rejected, %d no longer rejected' % (kind, len(r['newly_rejected']), len(r['no_longer_rejected'])))
        L += _cap(r['newly_rejected'], 12, lambda x: '! ' + x) + _cap(r['no_longer_rejected'], 6, lambda x: 'ok ' + x)
    L.append('')
    if 'mixins' in d:
        mx = d['mixins']
        L.append('mixins: %d config(s) stopped applying, %d started; %d mixin class(es) stopped, %d started' % (
            len(mx['configs_stopped_applying']), len(mx['configs_started_applying']), len(mx['mixins_stopped']), len(mx['mixins_started'])))
        L += _cap(mx['configs_stopped_applying'], 12, lambda x: 'stopped: ' + x) + _cap(mx['configs_started_applying'], 12, lambda x: 'started: ' + x)
        L += _cap(mx['mixins_stopped'], 10, lambda x: '- ' + x.replace('\t', '  ')) + _cap(mx['mixins_started'], 10, lambda x: '+ ' + x.replace('\t', '  '))
        if mx.get('target_not_loaded_on_one_side'):
            L.append('      (%d more differ only because one boot never loaded their target class: not a change, see the README)' % len(mx['target_not_loaded_on_one_side']))
        L.append('')
    L.append('scripts')
    for kind in ('server', 'startup'):
        s = d['scripts'][kind]
        L.append('  %s: +%d -%d loaded; in the tree and not loaded: %d; summary %s -> %s' % (
            kind, len(s['loaded_added']), len(s['loaded_removed']), len(s['in_tree_not_loaded']),
            json.dumps(s['summary'][0], sort_keys=True), json.dumps(s['summary'][1], sort_keys=True)))
        L += _cap(s['loaded_added'], 10, lambda x: '+ ' + x) + _cap(s['loaded_removed'], 10, lambda x: '- ' + x) + _cap(s['in_tree_not_loaded'], 10, lambda x: '! not loaded: ' + x)
    L.append('')
    L.append('log signatures (a line without its clock, numbers and ids)')
    if not d['signatures']:
        L.append('  no new and no vanished signature')
    order = sorted(d['signatures'], key=lambda k: (0 if k.endswith(('ERROR', 'FATAL')) else 1, k))
    for k in order:
        v = d['signatures'][k]
        L.append('  %s: %d new, %d gone' % (k, len(v['new']), len(v['gone'])))
        cap = 15 if k.endswith(('ERROR', 'FATAL')) or k.startswith('kubejs') else 6
        L += _cap(v['new'], cap, lambda x: 'new  x%d: %s' % (x['count'], x['sig'][:170])) + _cap(v['gone'], cap, lambda x: 'gone x%d: %s' % (x['count'], x['sig'][:170]))
    L.append('')
    c = d['checker']
    L.append('boot-log checker: %s -> %s; %d finding(s) only in the new boot, %d only in the base' % (c['base'], c['new'], len(c['findings_new']), len(c['findings_gone'])))
    L += _cap(c['findings_new'], 15, lambda f: 'new : %s %s %s: %s' % (f['sev'], f['kind'], f['id'], f['detail'][:150]))
    L += _cap(c['findings_gone'], 8, lambda f: 'gone: %s %s %s' % (f['sev'], f['kind'], f['id']))
    return '\n'.join(L) + '\n'


def cmd_diff(req):
    a, b = to_wsl(req['base_dir']), to_wsl(req['new_dir'])
    for d in (a, b):
        if not os.path.isfile(os.path.join(d, 'result.json')):
            raise Cannot('not a result folder (no result.json): %s' % d)
    d = diff_results(a, b)
    text = diff_text(d)
    out_dir = to_wsl(req.get('out_dir') or req['new_dir'])
    stem = 'diff-vs-' + re.sub(r'[^A-Za-z0-9._-]+', '_', d['base']['name'])
    write_json(os.path.join(out_dir, stem + '.json'), d)
    write_text(os.path.join(out_dir, stem + '.txt'), text)
    print(text, flush=True)
    say('written: %s\\%s.txt and .json' % (req.get('out_dir') or req['new_dir'], stem))
    return EXIT_FINDINGS if d['regressions'] else EXIT_OK


# -----------------------------------------------------------------------------
# the committed snapshot
# -----------------------------------------------------------------------------
SNAPSHOT_EXTRA = ('dimensions.txt', 'game_rules.txt', 'game_rule_values.tsv', 'loot_tables.txt', 'loot_tables_rejected.txt',
                  'recipes.tsv', 'recipe_type_counts.tsv', 'advancements.txt', 'entities.json')


def cmd_snapshot(req):
    result_dir, out = to_wsl(req['result_dir']), to_wsl(req['out_dir'])
    result = read_json(os.path.join(result_dir, 'result.json'))
    if not result.get('booted'):
        raise Cannot('that boot did not finish cleanly: no snapshot is written from it')
    if result['source']['kind'] != 'ref':
        raise Cannot('the snapshot is taken from a commit (boot.ps1 -Ref origin/main -WriteSnapshot), not from a working tree')
    os.makedirs(out, exist_ok=True)
    keep = set(['README.md'])
    files = {}
    reg = os.path.join(result_dir, 'registry')
    for name in [n + '.txt' for n, _ in SNAPSHOT_REGISTRIES] + list(SNAPSHOT_EXTRA):
        src = os.path.join(reg, name)
        if os.path.isfile(src):
            shutil.copyfile(src, os.path.join(out, name))
            files[name] = len(load_entities(result_dir)) if name == 'entities.json' else sum(1 for _ in open(src, 'rb'))
            keep.add(name)
    for name, rel in (('mixin_configs_applied.txt', 'mixins/configs_applied.txt'), ('mods.txt', 'mods.txt')):
        src = os.path.join(result_dir, rel)
        if os.path.isfile(src):
            shutil.copyfile(src, os.path.join(out, name))
            files[name] = sum(1 for _ in open(src, 'rb'))
            keep.add(name)
    write_json(os.path.join(out, 'SOURCE.json'), {
        'commit': result['source'].get('sha'), 'forge': result.get('forge'), 'mods': result['modset']['count'],
        'seed': result['params']['seed'], 'tool_version': result['tool_version'], 'entries': files,
        'made_by': '.minecraft/dev/boot/boot.ps1 -Ref <commit> -WriteSnapshot (a full-pack offline server boot; see .minecraft/dev/boot/README.md)'})
    keep.add('SOURCE.json')
    for f in os.listdir(out):
        if f not in keep and os.path.isfile(os.path.join(out, f)):
            os.remove(os.path.join(out, f))
    say('snapshot of %s written to %s: %s' % (result['source'].get('sha', '')[:12], req['out_dir'], ', '.join('%s %d' % (k[:-4] if k.endswith('.txt') else k, v) for k, v in sorted(files.items()))))
    return EXIT_OK


# -----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description='offline full-pack boot gate (engine; use boot.ps1)')
    ap.add_argument('command', choices=['setup', 'modset', 'run', 'finish', 'diff', 'snapshot'])
    ap.add_argument('--request', required=True, help='JSON file with the parameters (written by boot.ps1)')
    a = ap.parse_args()
    req = read_json(to_wsl(a.request))
    try:
        return {'setup': cmd_setup, 'modset': cmd_modset, 'run': cmd_run, 'finish': cmd_finish, 'diff': cmd_diff, 'snapshot': cmd_snapshot}[a.command](req)
    except Cannot as ex:
        say('CANNOT RUN: %s' % ex)
        return EXIT_CANNOT


if __name__ == '__main__':
    sys.exit(main())
