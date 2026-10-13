#!/usr/bin/env python3
"""registry_current.py -- is the registry snapshot (.minecraft/dev/registry) still a snapshot of THIS pack?

The files of that folder are the ids a full-pack server boot registered (SOURCE.json says from
which commit). Validators read them as the truth: the quest validator, the boss and dimension
registries, the loot audit, the Codex validator. Nothing said when the pack moved on without them.

What is compared (no jar is opened, nothing boots; under a second):
  the server's mod set of the working tree, computed with the boot tool's own function
  (icboot.py compute_modset, next to this file: the launcher's filter on the server index), against
    mods.txt            the jar names of the snapshot's boot
    mods_recorded.tsv   what the index recorded for each of those jars (the metafile's hash, the
                        custom-jar manifest's sha256)

Two answers, on purpose:
  STALE    (exit 1)  the SET OF JARS differs: a mod was added, removed, or updated to another
                     file. The id lists are wrong for certain (mods.txt itself is), and an id of a
                     removed mod still validates. Refresh before the push:
                         powershell -File .minecraft\\dev\\boot\\boot.ps1 -Ref <commit> -WriteSnapshot
                     (-Ref takes a commit: commit the mod change first, snapshot it, commit this
                     folder as a second commit; the push carries both.)
  CHANGED  (exit 0)  the same jars, but the index records another hash for some of them: a
                     custom jar rebuilt under its name, a mod re-released in place. Its ids MAY
                     have changed. Printed loudly with the jar names, not blocking: most rebuilds
                     change code, not registrations, and a refresh costs a full boot. With
                     --strict it fails as well (the switch for whoever decides that every jar
                     release must be booted first).
  exit 2             could not run (no SOURCE.json, the launcher source moved, ...).

Not seen by this check: registrations made by the pack's own startup scripts and datapacks (a
new KubeJS item, a recipe, a loot table); what a jar really registers.

  python -I .minecraft/dev/boot/registry_current.py             # check the working tree
  python -I .minecraft/dev/boot/registry_current.py --strict    # CHANGED fails too
  python -I .minecraft/dev/boot/registry_current.py --backfill  # write mods_recorded.tsv for a snapshot
                                                                # made before the boot tool wrote it:
                                                                # computed from the tree of SOURCE.json's
                                                                # commit (through git), refused unless
                                                                # its jar names equal mods.txt
Where it runs: the pre-push hook (dev/install-hooks.ps1, block "Registry snapshot"), when a pushed
commit touches the server mod index, the custom-jar manifest, the launcher's mod filter, the
snapshot or the boot tool;
and the GitHub Action registry-snapshot.yml. registry_current_test.py plants each case.
(It lives here and not in dev/registry because -WriteSnapshot deletes every file of that folder
that is not part of the snapshot.)
"""
import importlib.util
import json
import os
import subprocess
import sys
import tarfile
import tempfile
import io

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.join('.minecraft', 'server_distribution')
# what the mod set is computed from; the hook and the workflow trigger on the same paths
INPUTS = ['.minecraft/server_distribution/mods', '.minecraft/server_distribution/custom_jars_manifest.json',
          'iridescent-launcher/icraft-core/src/packwiz.rs', 'iridescent-launcher/icraft-core/src/config.rs']
REFRESH = 'powershell -File .minecraft\\dev\\boot\\boot.ps1 -Ref <commit> -WriteSnapshot'


class Cannot(Exception):
    pass


def load_icboot(repo):
    path = os.path.join(repo, '.minecraft', 'dev', 'boot', 'icboot.py')
    if not os.path.isfile(path):
        raise Cannot('the boot tool is not at %s (its compute_modset is the one definition of the server mod set)' % path)
    spec = importlib.util.spec_from_file_location('icboot_for_registry_check', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def recorded_of_tree(icboot, tree):
    """mods_recorded lines of the server mod set of a pack tree (a checkout, or an export of a commit)"""
    sd = os.path.join(tree, SERVER)
    try:
        consts = icboot.launcher_constants(tree)
        ms = icboot.compute_modset(os.path.join(sd, 'mods', '.index'), os.path.join(sd, 'mods'),
                                   os.path.join(sd, 'custom_jars_manifest.json'), consts)
    except icboot.Cannot as e:
        raise Cannot(str(e))
    return icboot.modset_recorded(ms['mods'])


def read_lines(path):
    with open(path, 'r', encoding='utf-8') as f:
        return [l.rstrip('\r\n') for l in f if l.strip()]


def by_name(lines):
    out = {}
    for l in lines:
        c = l.split('\t')
        out[c[0]] = tuple(c[1:])
    return out


def compare(snapshot_dir, now_lines):
    """-> (verdict, text lines). verdict: 'current' | 'changed' | 'stale'"""
    src_path = os.path.join(snapshot_dir, 'SOURCE.json')
    if not os.path.isfile(src_path):
        raise Cannot('no SOURCE.json in %s: not a registry snapshot' % snapshot_dir)
    with open(src_path, 'r', encoding='utf-8') as f:
        source = json.load(f)
    mods_txt = os.path.join(snapshot_dir, 'mods.txt')
    if not os.path.isfile(mods_txt):
        raise Cannot('no mods.txt in %s: the snapshot does not say which jars it was taken with' % snapshot_dir)
    snap_names = set(read_lines(mods_txt))
    commit = str(source.get('commit') or '?')[:12]
    out = []
    problems = []
    if source.get('mods') != len(snap_names):
        problems.append('SOURCE.json says %s mods, mods.txt lists %d: the snapshot is not one boot' % (source.get('mods'), len(snap_names)))
    now = by_name(now_lines)
    added = sorted(set(now) - snap_names, key=str.lower)
    removed = sorted(snap_names - set(now), key=str.lower)
    for n in added:
        problems.append('in the pack, not in the snapshot: %s' % n)
    for n in removed:
        problems.append('in the snapshot, no longer in the pack: %s' % n)
    if problems:
        out.append('STALE: the registry snapshot (of commit %s, %d jars) is not of this pack (%d jars):' % (commit, len(snap_names), len(now)))
        out += ['  ' + p for p in problems]
        out.append('  The id lists in .minecraft/dev/registry are what validators trust. Commit the mod change, then refresh from that commit:')
        out.append('      ' + REFRESH)
        out.append('  and commit .minecraft/dev/registry as a second commit.')
        return 'stale', out
    rec_path = os.path.join(snapshot_dir, 'mods_recorded.tsv')
    if not os.path.isfile(rec_path):
        out.append('current by jar names (%d jars, snapshot of commit %s). NOT compared: the hash the index records for each jar,' % (len(snap_names), commit))
        out.append('  because the snapshot has no mods_recorded.tsv (made before the boot tool wrote it): registry_current.py --backfill')
        return 'current', out
    snap = by_name(read_lines(rec_path))
    if set(snap) != snap_names:
        out.append('STALE: mods_recorded.tsv and mods.txt of the snapshot name different jars: the folder is not one boot. Refresh:')
        out.append('      ' + REFRESH)
        return 'stale', out
    changed = sorted((n for n in now if now[n] != snap[n]), key=str.lower)
    if changed:
        out.append('CHANGED: %d jar(s) of the pack carry another recorded hash than at the snapshot (commit %s); the jar set is the same.' % (len(changed), commit))
        for n in changed:
            what = [w for w, a, b in (('index hash', snap[n][0], now[n][0]), ('custom-jar manifest sha256', snap[n][1], now[n][1])) if a != b]
            out.append('  %s (%s)' % (n, ', '.join(what)))
        out.append('  A rebuilt or re-released jar MAY register other ids. If it added, removed or renamed an item, entity, block,')
        out.append('  effect, enchantment, structure or loot table, refresh the snapshot: ' + REFRESH)
        return 'changed', out
    out.append('current: the pack\'s %d server jars are the snapshot\'s (commit %s), each with the hash the index recorded then' % (len(now), commit))
    return 'current', out


def export_commit(repo, commit, dest):
    """the INPUTS of one commit, through git, into dest (jar blobs included: only their names are read)"""
    r = subprocess.run(['git', '-C', repo, 'archive', '--format=tar', commit, '--'] + INPUTS, capture_output=True)
    if r.returncode != 0:
        raise Cannot('git archive %s failed (%s): the commit of SOURCE.json is not in this clone' % (commit[:12], r.stderr.decode('utf-8', 'replace').strip()))
    with tarfile.open(fileobj=io.BytesIO(r.stdout)) as tf:
        try:
            tf.extractall(dest, filter='data')
        except TypeError:        # python < 3.11.4 has no filter argument
            tf.extractall(dest)


def backfill(repo, snapshot_dir, icboot):
    with open(os.path.join(snapshot_dir, 'SOURCE.json'), 'r', encoding='utf-8') as f:
        source = json.load(f)
    commit = source.get('commit')
    if not commit:
        raise Cannot('SOURCE.json names no commit')
    rec_path = os.path.join(snapshot_dir, 'mods_recorded.tsv')
    if os.path.isfile(rec_path):
        raise Cannot('mods_recorded.tsv exists: a snapshot is backfilled once; after that only boot.ps1 -WriteSnapshot writes it')
    with tempfile.TemporaryDirectory(prefix='registry-backfill-') as tmp:
        export_commit(repo, commit, tmp)
        lines = recorded_of_tree(icboot, tmp)
    names = set(l.split('\t')[0] for l in lines)
    snap_names = set(read_lines(os.path.join(snapshot_dir, 'mods.txt')))
    if names != snap_names:
        raise Cannot('the mod set computed from commit %s (%d jars) is not the snapshot\'s mods.txt (%d jars; %d differ): '
                     'nothing written, the snapshot must be taken again' % (commit[:12], len(names), len(snap_names), len(names ^ snap_names)))
    with open(rec_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(''.join(l + '\n' for l in lines))
    source.setdefault('entries', {})['mods_recorded.tsv'] = len(lines)
    with open(os.path.join(snapshot_dir, 'SOURCE.json'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(source, indent=2, sort_keys=True, ensure_ascii=True) + '\n')
    print('[registry] mods_recorded.tsv written: %d jars as the index of commit %s recorded them (jar names equal mods.txt)' % (len(lines), commit[:12]))
    return 0


def main(argv):
    flags = set(a for a in argv if a.startswith('--'))
    rest = [a for a in argv if not a.startswith('--')]
    unknown = flags - {'--strict', '--backfill'}
    if unknown or len(rest) > 2:
        print('usage: registry_current.py [--strict] [--backfill] [<repo root> [<snapshot folder>]]')
        return 2
    repo = os.path.abspath(rest[0]) if rest else os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
    snapshot_dir = os.path.abspath(rest[1]) if len(rest) > 1 else os.path.join(repo, '.minecraft', 'dev', 'registry')
    try:
        icboot = load_icboot(repo)
        if '--backfill' in flags:
            return backfill(repo, snapshot_dir, icboot)
        verdict, lines = compare(snapshot_dir, recorded_of_tree(icboot, repo))
    except Cannot as e:
        print('[registry] CANNOT RUN: %s' % e)
        return 2
    for l in lines:
        print('[registry] ' + l)
    failed = verdict == 'stale' or (verdict == 'changed' and '--strict' in flags)
    if verdict == 'changed' and not failed and os.environ.get('GITHUB_ACTIONS'):
        # a yellow annotation on the run: the one place a non-blocking answer is seen after the push
        print('::warning title=Registry snapshot::' + lines[0] + ' See the job log for the jars.')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
