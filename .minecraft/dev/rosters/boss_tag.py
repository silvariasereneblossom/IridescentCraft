#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""The entity-type tag #icraft:registry_bosses, generated from the boss registry.

    python .minecraft/dev/rosters/boss_tag.py            # check: exit 0 when the committed tag is what the registry says, 1 stale
    python .minecraft/dev/rosters/boss_tag.py --write    # write it (then sync-distros.ps1 -Fix mirrors it)

What it holds, in registry order: every entry with the flag `boss` (what core.isBoss answers true for) and its second
ids (`sameAs`), then the separate body entities of two of those bosses (BODY below). Entries kept as `absent` are
left out (no entity type of that id exists), and so is a `seenAs` type (the Magehunter's `minecraft:vindicator` is
every vindicator). Each value is written `"required": false`, so a mod that leaves the pack later costs its own ids,
never the whole tag.

Who reads it: NoSeeNoTick (`config/noseenotick-common.toml`, entityIgnoreList `#icraft:registry_bosses`, three
distros). With 2 or more players online that mod stops every living entity more than 48 blocks across or 32 up or
down from every player, unless its type is on that list; on NoSeeNoTick 2.0.0 only `modid:*` and `#tag` entries
match, an exact id never does (decision of 2026-10-15: the boss entries go through a bosses tag, the ordinary mobs
stay as they are). A tag of the pack's own, because `#forge:bosses` (34 types in this pack) misses bosses the list
named (the elder guardian, the void worm) and many of the registry's.

validate.py runs the check, so the pre-push hook and CI fail on a stale tag after any registry edit.
"""
import argparse
import json
import os
import sys
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rosters  # noqa: E402

TAG_ID = 'icraft:registry_bosses'
TAG_PATH = os.path.join('kubejs', 'data', 'icraft', 'tags', 'entity_types', 'registry_bosses.json')

# A boss whose body is entities of ANOTHER type, which move themselves in their own tick: when only the boss's own
# type kept ticking far from every player, its body would stay behind (read from the jars' bytecode, 2026-10-15).
#   alexsmobs:void_worm_part   EntityVoidWormPart.tick() sets its own position from its parent (alexsmobs 1.22.9)
#   deep_aether:eots_segment   EOTSSegment is a FlyingMob with its own goals and move control; the controller only
#                              spawns and counts them (deep_aether 1.1.7); Deep Aether tags it #forge:bosses itself
# Neither is a boss of the registry (ruled `mob`, 2026-10-14): no tokens, no boss treatment, only this tag.
BODY = OrderedDict([
    ('alexsmobs:void_worm', ['alexsmobs:void_worm_part']),
    ('deep_aether:eots_controller', ['deep_aether:eots_segment']),
])


def values(reg):
    """the ids of the tag, in order"""
    out = []
    for i in reg.boss_ids('isBoss'):
        e = reg.bosses[i]
        if 'absent' in e:
            continue
        for x in reg.entity_ids(i) + BODY.get(i, []):
            if x not in out:
                out.append(x)
    return out


def document(reg):
    return OrderedDict([
        ('replace', False),
        ('values', [OrderedDict([('id', i), ('required', False)]) for i in values(reg)]),
    ])


def render(reg):
    doc = document(reg)
    lines = ['{', '  "replace": false,', '  "values": [']
    vals = doc['values']
    for n, v in enumerate(vals):
        lines.append('    { "id": %s, "required": false }%s' % (json.dumps(v['id']), ',' if n < len(vals) - 1 else ''))
    lines += ['  ]', '}', '']
    return '\n'.join(lines)


def problems(reg, pack, entity_types=None):
    """-> [text]: the committed tag differs from the registry, or BODY names an id the game does not register"""
    bad = []
    path = os.path.join(pack, TAG_PATH)
    want = render(reg)
    try:
        with open(path, 'r', encoding='utf-8', newline='') as f:
            have = f.read()
    except OSError:
        have = None
    if have is None:
        bad.append('%s is missing: python .minecraft/dev/rosters/boss_tag.py --write (NoSeeNoTick reads it as #%s)'
                   % (TAG_PATH.replace(os.sep, '/'), TAG_ID))
    elif have.replace('\r\n', '\n') != want:
        bad.append('%s is not what the registry says (a boss added, removed or flagged since): '
                   'python .minecraft/dev/rosters/boss_tag.py --write, then sync-distros.ps1 -Fix' % TAG_PATH.replace(os.sep, '/'))
    if entity_types is not None:
        for boss, parts in BODY.items():
            for p in [boss] + parts:
                if p not in entity_types:
                    bad.append('boss_tag.py BODY names %s, which is not a registered entity type' % p)
    return bad


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--pack', default=os.path.normpath(os.path.join(HERE, '..', '..')), help='the .minecraft folder')
    ap.add_argument('--write', action='store_true', help='write the tag')
    args = ap.parse_args()
    pack = os.path.abspath(args.pack)
    try:
        reg = rosters.load(pack)
        game = rosters.load_game_registry(pack)
    except rosters.RegistryError as e:
        print('[boss-tag] COULD NOT RUN: %s' % e)
        return 2
    n = len(values(reg))
    if args.write:
        path = os.path.join(pack, TAG_PATH)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(render(reg))
        print('[boss-tag] wrote %s: %d entity types' % (TAG_PATH.replace(os.sep, '/'), n))
    bad = problems(reg, pack, game['entities'])
    for b in bad:
        print('[boss-tag] STALE %s' % b)
    if bad:
        return 1
    print('[boss-tag] OK -- #%s: %d entity types (%d registry bosses + second ids, %d body types)'
          % (TAG_ID, n, n - sum(len(p) for p in BODY.values()), sum(len(p) for p in BODY.values())))
    return 0


if __name__ == '__main__':
    sys.exit(main())
