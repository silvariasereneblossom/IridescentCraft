#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Script calls of Java methods where ONE script value can fit TWO overloads.

    python .minecraft/dev/engine-tests/overload_calls.py            # the check (the engine suite runs it)
    python .minecraft/dev/engine-tests/overload_calls.py --all      # also list the calls that are known to be fine

Why. On this engine a call is AMBIGUOUS, and throws at the call, when the value a script passes fits two overloads
after KubeJS's type wrappers:

    entity.spawnAtLocation(Item.of(id))
    InternalError: The choice of Java method net.minecraft.world.entity.Entity.m_19998_ matching JavaScript argument
    types (net.minecraft.world.item.ItemStack) is ambiguous; candidate methods are:
        ItemEntity m_19998_(net.minecraft.world.level.ItemLike)
        ItemEntity m_19983_(net.minecraft.world.item.ItemStack)

The throw is catchable, so a handler's own `catch` turns it into one warning and a feature that never works:
loot/iss_boss_first_kill.js dropped no first-kill reward from 2026-10-11 to 2026-10-13, for five bosses, and
relic_boss_drops.js had the same call in its fallback for the Dragon's Eye.

What this reads. truth/engine-members.json holds, for the classes the engine suite models, every public method with
its parameter types as recorded on a real Forge server. A GROUP is one class's methods of one name and one argument
count with more than one signature. A group is RISKY when two of its signatures differ only in types one script
value can be wrapped into (FAMILIES below: an item stack or item id; an id string; a number; a block or fluid id;
an attribute id; anything against Object).

What it checks. Every `.name(` call in the pack's scripts with that many arguments is looked up in VERDICTS: what a
real full-pack server did with that call shape (2026-10-13, internal `dev/registries-2026-10-13/zzzz_dragon_probe.js`,
section U). It fails when
  * a script calls a method whose verdict is AMBIGUOUS (and the call is not listed in ACCEPTED with its reason), or
  * a script calls a risky method nobody has tried on the engine yet: try it (the probe's section U takes one line),
    then add the verdict here.
The scan is by NAME: it cannot know the class of the receiver. A name that is risky on a modelled class and is used
on quite another object (`event.add(tag, id)`, `Item.of(id)`, `nbt.remove(key)`) is filtered by OTHER_RECEIVERS.
"""
import json
import os
import re
import sys
from collections import OrderedDict, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.normpath(os.path.join(HERE, '..', '..'))
SCRIPT_DIRS = ('kubejs/server_scripts', 'kubejs/startup_scripts', 'kubejs/client_scripts')

# parameter types one script value can be turned into (KubeJS type wrappers, Rhino number conversion)
FAMILIES = [
    {'ItemStack', 'ItemLike', 'Item', 'Ingredient'},
    {'String', 'ResourceLocation', 'ResourceKey', 'Component', 'CharSequence'},
    {'int', 'float', 'double', 'long', 'short', 'byte'},
    {'Block', 'Fluid', 'BlockState', 'FluidState'},
    {'Attribute', 'Holder'},
]

# (name, argument count) -> (verdict, what was tried and what happened on a real full-pack server, 2026-10-13)
AMBIGUOUS, FINE = 'AMBIGUOUS', 'FINE'
VERDICTS = OrderedDict([
    (('spawnAtLocation', 1), (AMBIGUOUS, 'entity.spawnAtLocation(Item.of(id)) and entity.spawnAtLocation(\'id\') both THROW (ItemStack | ItemLike). '
                                         'Use new ItemEntity(level, x, y, z, stack) + level.addFreshEntity, or block.popItem(stack)')),
    (('spawnAtLocation', 2), (AMBIGUOUS, 'entity.spawnAtLocation(Item.of(id), 0.0) THROWS (ItemStack,float | ItemLike,int)')),
    (('getAttributeValue', 1), (FINE, 'player.getAttributeValue(\'irons_spellbooks:spell_power\') -> 1, and with an Attribute object: a string is taken as the Attribute')),
    (('getAttributeBaseValue', 1), (FINE, 'only called with an Attribute object (0_lib_core.js), the exact type of one overload')),
    (('getLevel', 1), (FINE, 'server.getLevel(\'minecraft:overworld\') -> the level: a string is taken as the ResourceLocation')),
    (('tell', 1), (FINE, 'server.tell(Text.aqua(..).append(..)) returns: a component goes to tell(Component)')),
    (('remove', 1), (FINE, 'javaList.remove(1) on [a, b, c] -> [a, c] and listTag.remove(1): a number is the index')),
    (('add', 2), (FINE, 'list.add(index, element) of a tooltip list (client scripts; not tried on the server): the index is a number, the element a component')),
    (('is', 1), (FINE, 'only called with a TagKey object, the exact type of one overload')),
])

# name/arity -> receivers (the text before the dot) that are NOT one of the modelled Java classes
OTHER_RECEIVERS = {
    'add/2': re.compile(r'\bevent\s*$'),                                        # tag and recipe events
    'of/1': re.compile(r'.'),                                                   # Item.of / Text.of / LootEntry.of / AABB.of: KubeJS bindings
    'set/2': re.compile(r'.'),
    'remove/1': re.compile(r'(data|pdata|pd|nbt|tag|Data|event|persistentData|forgeData|kills|map|Map|cache|\))\s*$'),   # a key, not an index
    'tell/1': re.compile(r'(player|p|killer|attacker|target|sender|plr|pl|src|source\.player|entity|\))\s*$'),           # a player: one tell
    'register/2': re.compile(r'.'),                                             # the pack's own handler registries
    'is/1': re.compile(r'\broster\s*$'),                                        # icraft.bosses.is
    'getLevel/1': re.compile(r'\basc\s*$'),                                     # the ascension helper
    'contains/1': re.compile(r'.'),
    'compareTo/1': re.compile(r'.'),
}

# file -> {name/arity: reason}: a call of an AMBIGUOUS method that is safe as written
ACCEPTED = {}


def strip(src):
    """comments and string contents blanked (same length, same lines)"""
    out = []
    i, n = 0, len(src)
    mode = None
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ''
        if mode is None:
            if c == '/' and nxt == '/':
                j = src.find('\n', i)
                j = n if j < 0 else j
                out.append(' ' * (j - i))
                i = j
                continue
            if c == '/' and nxt == '*':
                j = src.find('*/', i + 2)
                j = n if j < 0 else j + 2
                out.append(''.join(ch if ch == '\n' else ' ' for ch in src[i:j]))
                i = j
                continue
            if c in '\'"`':
                mode = c
            out.append(c)
            i += 1
        else:
            if c == '\\':
                out.append('  ')
                i += 2
                continue
            if c == mode:
                mode = None
                out.append(c)
            else:
                out.append(c if c == '\n' else ' ')
            i += 1
    return ''.join(out)


def arg_count(code, open_paren):
    depth = 0
    count = 0
    seen = False
    i = open_paren
    while i < len(code):
        c = code[i]
        if c in '([{':
            if depth >= 1:
                seen = True
            depth += 1
        elif c in ')]}':
            depth -= 1
            if depth == 0:
                return count + (1 if seen else 0)
        elif c == ',' and depth == 1:
            count += 1
        elif depth >= 1 and not c.isspace():
            seen = True
        i += 1
    return -1


def same_value_fits(a, b):
    if a == b:
        return True
    if a == 'Object' or b == 'Object':
        return True
    return any(a in f and b in f for f in FAMILIES)


def risky_groups():
    with open(os.path.join(HERE, 'truth', 'engine-members.json'), 'r', encoding='utf-8') as f:
        classes = json.load(f)['classes']
    risky = defaultdict(set)        # (name, arity) -> {(sig a, sig b, class)}
    ngroups = 0
    for cls, info in classes.items():
        per = defaultdict(set)
        for tok in re.findall(r'!?[A-Za-z_$][\w$]*\([^)]*\)', info.get('methods', '')):
            tok = tok.lstrip('!')
            name = tok[:tok.index('(')]
            params = tuple(a for a in tok[tok.index('(') + 1:-1].split(',') if a)
            per[(name, len(params))].add(params)
        for key, sigs in per.items():
            if len(sigs) < 2 or key[1] == 0:
                continue
            ngroups += 1
            sigs = sorted(sigs)
            for i in range(len(sigs)):
                for j in range(i + 1, len(sigs)):
                    if all(same_value_fits(a, b) for a, b in zip(sigs[i], sigs[j])):
                        risky[key].add((sigs[i], sigs[j], cls.split('.')[-1]))
    return risky, len(classes), ngroups


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')      # a script line may hold any character; a Windows console is cp1252
    except (AttributeError, ValueError):
        pass
    show_all = '--all' in sys.argv
    risky, nclasses, ngroups = risky_groups()
    calls = defaultdict(list)       # (name, arity) -> [(file, line, text)]
    files = 0
    for d in SCRIPT_DIRS:
        base = os.path.join(PACK, *d.split('/'))
        for root, _, names in os.walk(base):
            for fn in sorted(names):
                if not fn.endswith('.js'):
                    continue
                files += 1
                p = os.path.join(root, fn)
                rel = os.path.relpath(p, os.path.join(PACK, 'kubejs')).replace(os.sep, '/')
                with open(p, 'r', encoding='utf-8') as f:
                    src = f.read()
                code = strip(src)
                lines = src.split('\n')
                for m in re.finditer(r'\.\s*([A-Za-z_$][\w$]*)\s*\(', code):
                    name = m.group(1)
                    n = arg_count(code, m.end() - 1)
                    key = (name, n)
                    if key not in risky:
                        continue
                    other = OTHER_RECEIVERS.get('%s/%d' % key)
                    line_start = code.rfind('\n', 0, m.start()) + 1
                    receiver = code[line_start:m.start()]
                    if other is not None and other.search(receiver):
                        continue
                    line = code.count('\n', 0, m.start()) + 1
                    calls[key].append((rel, line, lines[line - 1].strip()[:140]))
    bad = []
    untried = []
    listed = 0
    for key in sorted(calls):
        name, n = key
        verdict = VERDICTS.get(key)
        pairs = sorted(risky[key])
        head = '%s/%d  %s' % (name, n, ' ; '.join('(%s) ~ (%s)' % (','.join(a), ','.join(b)) for a, b, _ in pairs[:3]))
        if verdict is None:
            untried.append(key)
            print(head)
            print('    NOT TRIED ON THE ENGINE: try the call on a real server, then add its verdict to VERDICTS')
            for rel, line, text in calls[key]:
                print('    %s:%d  %s' % (rel, line, text))
            continue
        kind, what = verdict
        if kind == AMBIGUOUS:
            print(head)
            print('    AMBIGUOUS on the engine: ' + what)
            for rel, line, text in calls[key]:
                ok = ACCEPTED.get(rel, {}).get('%s/%d' % key)
                if not ok:
                    bad.append((rel, line))
                print('    %s:%d  %s%s' % (rel, line, text, ('  [accepted: %s]' % ok) if ok else '  <-- THROWS'))
        elif show_all:
            print(head)
            print('    fine on the engine: ' + what)
            for rel, line, text in calls[key]:
                print('    %s:%d  %s' % (rel, line, text))
        listed += len(calls[key])
    status = 'OK' if not bad and not untried else 'FAIL'
    print('[overload-calls] %s -- %d script files; %d classes, %d same-arity overload groups in the member tables, %d of them risky '
          '(one value fits two signatures); %d call(s) of a risky method in the scripts: %d that throw, %d of a method not tried on the engine'
          % (status, files, nclasses, ngroups, len(risky), listed + sum(len(calls[k]) for k in untried), len(bad), sum(len(calls[k]) for k in untried)))
    return 0 if status == 'OK' else 1


if __name__ == '__main__':
    sys.exit(main())
