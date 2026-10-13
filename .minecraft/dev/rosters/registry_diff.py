#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""What an edit of the registries changes: the registry of this tree against the registry of a commit, entity by
entity and system by system. The cells it prints are every answer a script gets differently; no other cell moved.

    python .minecraft/dev/rosters/registry_diff.py                   # against origin/main
    python .minecraft/dev/rosters/registry_diff.py --base <commit>   # against another commit
    python .minecraft/dev/rosters/registry_diff.py --out diff.md     # ... and write the cells as a table
    python .minecraft/dev/rosters/registry_diff.py --expect 46       # exit 1 unless exactly that many cells differ

A cell is what one consuming system gets from one entry (rosters.BOSS_SYSTEMS / DIM_SYSTEMS: the statement suite
`registry` of dev/engine-tests holds the script-side reader to), so a flag two systems read counts twice: `boss`
answers both core.isBoss and the mob-tier exclusion. Also compared: the facts of an entry no system column shows
(tier, kind, absent), the order of the entries (the arena table and every roster iterate in file order), the
switches and the boot line. Put the output in the commit message of a registry edit.

A second id (`sameAs`) is a row of its own: its cells are what a script that asks WITH that id is answered, the
cells of the boss it is. It is in no list, so no roster size moves; `sameAs` is one more fact column.

Needs git. table.py is the other proof: this tree's registry against the lists the scripts held before.
"""
import argparse
import json
import os
import subprocess
import sys
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rosters  # noqa: E402

BOSS_FACTS = ('tier', 'kind', 'absent', 'sameAs')
DIM_FACTS = ('tier',)


def die(msg, code=2):
    sys.stderr.write('registry_diff.py: ' + msg + '\n')
    sys.exit(code)


def canon(v):
    if v is None:
        return '-'
    if v is True:
        return 'yes'
    if isinstance(v, float) and v == int(v):
        v = int(v)
    if isinstance(v, (dict, list)):
        return json.dumps(v, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return str(v)


def git_text(repo, ref, path):
    try:
        r = subprocess.run(['git', '-C', repo, 'show', '%s:%s' % (ref, path)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except OSError as e:
        die('git could not be started (%s)' % e)
    if r.returncode != 0:
        die('%s has no %s: %s' % (ref, path, r.stderr.decode('utf-8', 'replace').strip()))
    return r.stdout.decode('utf-8')


def load_ref(repo, ref):
    d = '.minecraft/' + rosters.REGISTRY_DIR.replace(os.sep, '/') + '/'
    try:
        return rosters.from_text(git_text(repo, ref, d + rosters.BOSS_FILE), git_text(repo, ref, d + rosters.DIM_FILE),
                                 '%s:' % ref)
    except rosters.RegistryError as e:
        die(str(e))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--base', default='origin/main', help='the commit whose registry is the BEFORE side (default %(default)s)')
    ap.add_argument('--pack', default=os.path.normpath(os.path.join(HERE, '..', '..')), help='the .minecraft folder whose registry is the AFTER side')
    ap.add_argument('--out', help='write the differing cells to this file (Markdown)')
    ap.add_argument('--expect', type=int, help='exit 1 unless exactly this many cells differ')
    args = ap.parse_args()

    pack = os.path.abspath(args.pack)
    repo = os.path.dirname(pack)
    try:
        new = rosters.load(pack)
    except rosters.RegistryError as e:
        die(str(e))
    r = subprocess.run(['git', '-C', repo, 'rev-parse', '--short=12', args.base + '^{commit}'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if r.returncode != 0:
        die('%s is not a commit here: %s' % (args.base, r.stderr.decode('utf-8', 'replace').strip()))
    base_name = '%s (%s)' % (args.base, r.stdout.decode().strip())
    old = load_ref(repo, args.base)

    cells = []      # (what, id, column, before, after)
    compared = 0

    def side(reg_entries, systems, facts, cell, what):
        nonlocal compared
        o_entries, n_entries = reg_entries
        ids = list(n_entries.keys()) + [i for i in o_entries if i not in n_entries]
        for i in ids:
            o, n = o_entries.get(i), n_entries.get(i)
            if o is None or n is None:
                cells.append((what, i, '(entry)', 'no entry' if o is None else 'entry', 'no entry' if n is None else 'entry'))
            for col in facts:
                compared += 1
                a = canon(o.get(col)) if o is not None else '-'
                b = canon(n.get(col)) if n is not None else '-'
                if a != b:
                    cells.append((what, i, col, a, b))
            for col in systems:
                compared += 1
                a = canon(cell(o, col)) if o is not None else '-'
                b = canon(cell(n, col)) if n is not None else '-'
                if a != b:
                    cells.append((what, i, col, a, b))

    def as_asked(reg):
        """id -> the entry a script that asks with that id is answered from, plus `sameAs` for a second id"""
        rows = OrderedDict(reg.bosses)
        for a, t in reg.aliases.items():
            rows[a] = dict(reg.bosses[t], sameAs=t)
        return rows

    side((as_asked(old), as_asked(new)), list(rosters.BOSS_SYSTEMS.keys()), BOSS_FACTS, rosters.boss_cell, 'boss')
    side((old.dims, new.dims), list(rosters.DIM_SYSTEMS.keys()), DIM_FACTS, rosters.dim_cell, 'dimension')

    other = []
    common_b = [i for i in new.bosses if i in old.bosses]
    if common_b != [i for i in old.bosses if i in new.bosses]:
        other.append('the ORDER of the boss entries changed (rosters and the arena table iterate in file order)')
    common_d = [i for i in new.dims if i in old.dims]
    if common_d != [i for i in old.dims if i in new.dims]:
        other.append('the ORDER of the dimension entries changed (the tier groups iterate in file order)')
    if list(old.arenas().keys()) != list(new.arenas().keys()):
        other.append('the arena keys or their order changed: %s -> %s' % (list(old.arenas().keys()), list(new.arenas().keys())))
    roster_sizes = [(sys_name, len(old.boss_ids(sys_name)), len(new.boss_ids(sys_name))) for sys_name in rosters.BOSS_SYSTEMS]
    moved = ['%s %d -> %d' % r for r in roster_sizes if r[1] != r[2]]
    if len(old.bosses) != len(new.bosses):
        moved.insert(0, 'bosses %d -> %d' % (len(old.bosses), len(new.bosses)))
    if canon(old.switches) != canon(new.switches):
        other.append('switches: %s -> %s' % (canon(old.switches), canon(new.switches)))
    line_old, line_new = rosters.boot_line(old), rosters.boot_line(new)

    lines = []
    out = lines.append
    out('registry of this tree against %s: %d cell(s) differ of %d compared (%d boss ids x %d columns, %d dimension ids x %d columns)'
        % (base_name, len(cells), compared, len(set(list(as_asked(old)) + list(as_asked(new)))), len(rosters.BOSS_SYSTEMS) + len(BOSS_FACTS),
           len(set(list(old.dims) + list(new.dims))), len(rosters.DIM_SYSTEMS) + len(DIM_FACTS)))
    by_col = {}
    for what, i, col, a, b in cells:
        by_col.setdefault((what, col, a, b), []).append(i)
    for (what, col, a, b), ids in by_col.items():
        out('  %s, %s: %s -> %s (%d): %s' % (what, col, a, b, len(ids), ', '.join(ids)))
    for o in other:
        out('  ' + o)
    if not other:
        out('  order of the entries, arena keys and switches: unchanged')
    out('  sizes of the lists (a second id is in none): ' + ('unchanged' if not moved else ', '.join(moved)))
    if line_old == line_new:
        out('  boot line: unchanged')
    else:
        out('  boot line before (as the reader of this tree words it): ' + line_old)
        out('  boot line after:  ' + line_new)
    print('\n'.join(lines))

    if args.out:
        md = ['# Registry of this tree against %s' % base_name, '',
              '%d cell(s) differ of %d compared. A cell is what one consuming system gets from one entry.' % (len(cells), compared), '',
              '| registry | id | column | before | after |', '|---|---|---|---|---|']
        md.extend('| %s | %s | %s | %s | %s |' % c for c in cells)
        md.extend(['', 'Other: %s.' % ('; '.join(other) if other else 'order of the entries, arena keys and switches unchanged'), '',
                   'Boot line before: `%s`' % line_old, '', 'Boot line after: `%s`' % line_new, ''])
        with open(args.out, 'w', encoding='utf-8', newline='\n') as f:
            f.write('\n'.join(md))

    if args.expect is not None and len(cells) != args.expect:
        sys.stderr.write('registry_diff.py: %d cell(s) differ, %d expected\n' % (len(cells), args.expect))
        sys.exit(1)
    sys.exit(0)


if __name__ == '__main__':
    main()
