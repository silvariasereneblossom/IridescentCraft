# -*- coding: utf-8 -*-
"""The checks of the Codex's HAND-WRITTEN text against the registries. A placeholder is never a finding (it is the
registry); generated pages are not read here (they are the registry too).

  TYPED FACT   a number the registries or scripts own, typed into the text: a difficulty multiplier, a death
               penalty, a boss-rush share, a token threshold, a boss's health. Write the placeholder the message
               names instead, and the number follows the source from then on.
  TIER         a boss named under a tier it is not at. The tier a phrase speaks of is a tier word ("Tier 3", "T3",
               "T3+", "T3-T4") in its clause (split at , ; and dashes outside parentheses), else the heading before
               it on the line ("Tier 1 -- Gob ..."), else later in the same sentence, else the page title, else the
               entry's name ("Tier 1 Bosses"). The boss passes when its tier, its boss-rush tier or its arena's
               tier is in that range. A name two bosses share (Naga) passes when either does.
  PLACE        a boss name followed by a parenthesis that names a place (an arena, a structure, a dimension) that
               is not where the registry's arena row puts it: "Thunker (Chthonic Cathedral)".
  ID           a namespaced id in the text (attributeslib:mining_speed) that the game does not register (the
               registry snapshot, dev/registry). Only namespaces the snapshot knows are read as ids.

Every finding names the entry, the page and the words, and says what to change.
"""
import os
import re

import codex_render

MACRO = re.compile(r'\$\(([^)]*)\)')
NEUTRAL = '⁣'      # stands in for a filled placeholder in the TYPED FACT patterns: never a digit


class Finding(object):
    def __init__(self, rule, where, msg):
        self.rule, self.where, self.msg = rule, where, msg

    def __str__(self):
        return '%s: [%s] %s' % (self.where, self.rule, self.msg)


# ---- TYPED FACT -----------------------------------------------------------------------------------------------
M = r'(?:\$\([^)]*\)\s*)*'          # any style macros between the words
TYPED = [
    (re.compile(r'Difficulty:?\s*' + M + r'~?\d+(?:\.\d+)?x', re.I),
     'a typed difficulty multiplier: write {{dim <id> difficulty}} or {{tier <n> difficulty}} (the difficulty mod\'s band)'),
    (re.compile(r'Death Penalty:?\s*' + M + r'~?\d+(?:\.\d+)?%', re.I),
     'a typed death penalty: write {{dim <id> death}} (dimensions.json deathPenalty)'),
    (re.compile(r'~?\d+(?:\.\d+)?(?:\s*[-–]\s*\d+)?%' + M + r'\s*(?:durability\s+)?loss\b', re.I),
     'a typed death penalty: write {{dim <id> death}} or {{tier <n> deathrange}}'),
    (re.compile(r'death penalt\w*[^.]{0,40}?\d+(?:\s*[-–]\s*\d+)?%', re.I),
     'a typed death penalty: write {{dim <id> death}} or {{tier <n> deathrange}}'),
    (re.compile(r'\d+%' + M + r'\s*(?:→|->)\s*T[2-4]'),
     'a typed boss-rush share: write {{tier <n> rushpct}} (codex_boss_rush.js)'),
    (re.compile(r'\d+%' + M + r'\s*/\s*' + M + r'\d+%'),
     'typed boss-rush shares: write {{tier <n> rushpct}} for each (codex_boss_rush.js)'),
    (re.compile(r'\d+%' + M + r'\s*(?:boss[- ]rush\s+)?clear\b', re.I),
     'a typed boss-rush share: write {{tier <n> rushpct}} (codex_boss_rush.js)'),
    (re.compile(r'\bclear\s+' + M + r'\d+%', re.I),
     'a typed boss-rush share: write {{tier <n> rushpct}} (codex_boss_rush.js)'),
    (re.compile(r'(?<![\d,.])\d[\d,]*' + M + r'\s*(?:→|->)\s*T[2-4]'),
     'a typed token threshold: write {{tier <n> threshold}} (codex_progression_engine.js)'),
    (re.compile(r'\bbank\s+' + M + r'\d[\d,]*', re.I),
     'a typed token threshold: write {{tier <n> threshold}} (codex_progression_engine.js)'),
    (re.compile(r'\d{1,3}(?:,\d{3})+\s+health|\b\d{3,}\s+health', re.I),
     'a typed boss health: write {{boss <id> health}} (bosses.json hp, with the x3)'),
]


def typed_facts(raw, where):
    text = codex_render.PLACEHOLDER.sub(NEUTRAL, raw)
    out, taken = [], []
    for rx, msg in TYPED:
        for m in rx.finditer(text):
            if any(a < m.end() and m.start() < b for a, b in taken):
                continue
            taken.append((m.start(), m.end()))
            out.append(Finding('TYPED FACT', where, '"%s": %s' % (plain(m.group(0)).strip(), msg)))
    return out


# ---- plain text -----------------------------------------------------------------------------------------------
def plain(text):
    """The words a player reads: macros out, line and paragraph breaks kept as \\n and \\n\\n."""
    def rep(m):
        c = m.group(1)
        if c in ('br2', '2br', 'p'):
            return '\n\n'
        if c == 'br':
            return '\n'
        if re.fullmatch(r'li\d?', c):
            return '\n• '
        return ''
    return MACRO.sub(rep, text)


TIER_RANGE = re.compile(r'\b(?:Tiers?|T)\s?([1-4])\s*(?:-|–|to|and|or)\s*(?:Tier\s|T)?([1-4])\b')
TIER_PLUS = re.compile(r'\b(?:Tier\s|T)([1-4])\+')
TIER_ONE = re.compile(r'\bTier\s([1-4])\b|\bT([1-4])\b')


def tier_markers(s):
    """[(start, end, set of tiers)] of the tier words in a string"""
    found, taken = [], []
    for rx, kind in ((TIER_RANGE, 'range'), (TIER_PLUS, 'plus'), (TIER_ONE, 'one')):
        for m in rx.finditer(s):
            if any(a < m.end() and m.start() < b for a, b in taken):
                continue
            g = [int(x) for x in m.groups() if x]
            tiers = set(range(min(g), max(g) + 1)) if kind == 'range' else \
                set(range(g[0], 5)) if kind == 'plus' else {g[0]}
            found.append((m.start(), m.end(), tiers))
            taken.append((m.start(), m.end()))
    return sorted(found)


def clauses(line):
    """[(start, end)] of the clauses of one line: split at , ; : and dashes outside parentheses, and at sentence ends"""
    out, start, depth = [], 0, 0
    for i, c in enumerate(line):
        if c == '(':
            depth += 1
        elif c == ')':
            depth = max(0, depth - 1)
        elif depth == 0:
            cut = c in ',;—–' or (c == '-' and line[i - 1:i] == ' ' and line[i + 1:i + 2] == ' ') or \
                (c in '.!?' and re.match(r'\s+[A-Z0-9•]', line[i + 1:]) is not None)
            if cut:
                out.append((start, i))
                start = i + 1
    out.append((start, len(line)))
    return out


def headings(line, marks):
    """the tier words that head what follows them: at the start of the line or of a sentence, or followed by a dash
    or a colon ("Tier 1 -- Gob ...", "Stalwart Dungeons T3+ -- ...")"""
    out = []
    for mk in marks:
        before, after = line[:mk[0]], line[mk[1]:]
        if not before.strip(' •') or re.search(r'[.!?]\s+$', before) or \
                re.match(r'\+?\s*(?:—|–|-|:)', after):
            out.append(mk)
    return out


class Names(object):
    """the match words of every boss and dimension, longest first"""

    def __init__(self, facts):
        self.facts = facts
        words = {}
        self.ignore = set()
        for b in facts.bosses.values():
            for w in b.match:
                words.setdefault(w, set()).add(b.id)
                if w.startswith('The '):
                    words.setdefault('the ' + w[4:], set()).add(b.id)
        for b in facts.bosses.values():
            self.ignore.update(b.ignore)
        self.words = words
        alts = sorted(words, key=len, reverse=True)
        self.rx = re.compile(r'(?<![\w-])(' + '|'.join(re.escape(w) for w in alts) + r')(?![\w-])') if alts else None
        ign = sorted(self.ignore, key=len, reverse=True)
        self.ign_rx = re.compile('|'.join(re.escape(w) for w in ign)) if ign else None
        # place vocabulary (lower case): arena places and structures; dimension names and match words
        self.places = {}
        for b in facts.bosses.values():
            for p in b.place_names(facts):
                self.places.setdefault(p, set()).add(b.id)
        self.dim_words = {}
        for d in facts.dims.values():
            for w in set([d.name.lower(), d.name.lower()[4:] if d.name.lower().startswith('the ') else d.name.lower()]
                         + [x.lower() for x in d.match]):
                self.dim_words.setdefault(w, set()).add(d.id)

    def mentions(self, text):
        if self.rx is None:
            return []
        blocked = [(m.start(), m.end()) for m in self.ign_rx.finditer(text)] if self.ign_rx else []
        out = []
        for m in self.rx.finditer(text):
            if any(a <= m.start() < b or a < m.end() <= b for a, b in blocked):
                continue
            out.append((m.start(), m.end(), m.group(1), sorted(self.words[m.group(1)])))
        return out


def _clause_at(cls, pos, line):
    return next((c for c in cls if c[0] <= pos <= c[1]), (0, len(line)))


def _tiers_for(pos, line, marks, heads, cls, title_tiers, name_tiers):
    """the tiers a mention at `pos` is spoken of under: a tier word in its clause, else the heading before it,
    else the page title, else the entry name"""
    c0, c1 = _clause_at(cls, pos, line)
    inside = [mk for mk in marks if c0 <= mk[0] < c1]
    before = [mk for mk in inside if mk[0] < pos]
    if before:
        return before[-1][2]
    after = [mk for mk in inside if mk[0] > pos]
    if after:
        return after[0][2]
    head = [mk for mk in heads if mk[1] <= pos]
    if head:
        return head[-1][2]
    # later in the same sentence ("Swampjaw and the Bellringer, from the same mod, are Tier 2 minibosses")
    s1 = next((c[0] for c in cls if c[0] > pos and re.match(r'[.!?]', line[c[0] - 1:c[0]] or ' ')), len(line))
    later = [mk for mk in marks if pos < mk[0] < s1]
    if later:
        return later[0][2]
    return title_tiers or name_tiers


def boss_tiers(b):
    return set(t for t in (b.tier, b.rush, (b.arena or {}).get('tier')) if t)


def tier_and_place(names, text, where, title, entry_name):
    f = names.facts
    out = []
    t_marks = tier_markers(title or '')
    n_marks = tier_markers(entry_name or '')
    title_tiers = t_marks[0][2] if t_marks else None
    name_tiers = n_marks[0][2] if n_marks else None
    for line in plain(text).split('\n'):
        marks = tier_markers(line)
        heads = headings(line, marks)
        cls = clauses(line)
        for start, end, word, ids in names.mentions(line):
            bosses = [f.bosses[i] for i in ids if i in f.bosses]
            sent = _clause_at(cls, start, line)
            want = _tiers_for(start, line, marks, heads, cls, title_tiers, name_tiers)
            judged = [b for b in bosses if b.tier]
            if want and judged and not any(boss_tiers(b) & want for b in judged):
                b = judged[0]
                said = '-'.join(str(t) for t in sorted(want)) if len(want) > 1 else str(min(want))
                has = 'Tier %d' % b.tier + (', boss rush %d' % b.rush if b.rush and b.rush != b.tier else '')
                out.append(Finding('TIER', where, '"%s" puts %s at Tier %s; the boss registry has %s at %s '
                                   '(bosses.json %s). Change the text, or write {{boss %s tier}}.'
                                   % (excerpt(line, sent), word, said, b.name, has, b.id, b.id)))
            m = re.match(r'\s*\(([^()]*)\)', line[end:])
            if m:
                finding = place_check(names, bosses, m.group(1))
                if finding:
                    out.append(Finding('PLACE', where, '"%s (%s)": %s' % (word, m.group(1), finding)))
    return out


def place_check(names, bosses, inside):
    f = names.facts
    low = inside.lower()
    arenas = [b for b in bosses if b.arena]
    if not arenas:
        return None
    found = []
    for p in names.places:
        if re.search(r'(?<![\w])' + re.escape(p) + r'(?![\w])', low):
            found.append(('place', p))
    for w in names.dim_words:
        if re.search(r'(?<![\w])' + re.escape(w) + r'(?![\w])', low):
            found.append(('dim', w))
    # a dimension word inside a place's name ("the nether" in "nether keeper") is the place, not the dimension
    found = [x for x in found if not (x[0] == 'dim' and any(x[1] in p and x[1] != p for k, p in found if k == 'place'))]
    for kind, w in found:
        ok = False
        for b in arenas:
            if kind == 'place' and w in b.place_names(f):
                ok = True
            if kind == 'dim' and b.arena.get('dimension') in names.dim_words[w]:
                ok = True
        if not ok:
            b = arenas[0]
            return ('the registry\'s arena row puts %s at %s, %s (bosses.json %s arena). Write {{boss %s where}} '
                    'or {{boss %s place}}.' % (b.name, b.place, f.arena_dim_name(b), b.id, b.id, b.id))
    return None


def excerpt(line, sent):
    s = line[sent[0]:sent[1]].strip().lstrip('• ').strip()
    return s if len(s) <= 110 else s[:107] + '...'


# ---- ID -------------------------------------------------------------------------------------------------------
ID_RX = re.compile(r'(?<![\w/:.-])([a-z0-9_.-]+):([a-z0-9_/.-]*[a-z0-9_/-])')
ID_LISTS = ('items.txt', 'entity_types.txt', 'blocks.txt', 'dimensions.txt', 'structures.txt', 'biomes.txt',
            'advancements.txt', 'enchantments.txt', 'mob_effects.txt', 'attributes.txt', 'loot_tables.txt', 'potions.txt')


def load_ids(mc):
    ids = set()
    for fn in ID_LISTS:
        p = os.path.join(mc, 'dev', 'registry', fn)
        if os.path.isfile(p):
            with open(p, 'r', encoding='utf-8') as fh:
                ids.update(line.strip() for line in fh if line.strip() and not line.startswith('#'))
    return ids, set(i.split(':', 1)[0] for i in ids)


def id_check(ids, namespaces, text, where):
    out = []
    for m in ID_RX.finditer(plain(text)):
        ns, rid = m.group(1), m.group(0)
        if ns not in namespaces or rid in ids:
            continue
        out.append(Finding('ID', where, '"%s" is not an id the game registers (dev/registry: %s). Fix the id, '
                           'or refresh the snapshot if the mod set changed.' % (rid, ', '.join(ID_LISTS[:4]) + ', ...')))
    return out


# ---- the walk -------------------------------------------------------------------------------------------------
def check_entry(names, ids, data, where):
    """findings for one source entry (or category) object"""
    out = []
    entry_name = codex_render.fill(names.facts, data.get('name'), where) if isinstance(data.get('name'), str) else ''
    texts = []
    if isinstance(data.get('description'), str):
        texts.append((where + ' description', data['description'], ''))
    if isinstance(data.get('landing_text'), str):
        texts.append((where + ' landing text', data['landing_text'], ''))
    for i, page in enumerate(data.get('pages') or []):
        pw = '%s page %d' % (where, i + 1)
        if isinstance(page, str):
            texts.append((pw, page, ''))
        elif isinstance(page, dict) and page.get('type') != codex_render.GENERATED_TYPE:
            title = page.get('title') if isinstance(page.get('title'), str) else ''
            if isinstance(page.get('text'), str):
                texts.append((pw, page['text'], title))
    for pw, raw, title in texts:
        out += typed_facts(raw, pw)
        try:
            filled = codex_render.fill(names.facts, raw, pw)
            title = codex_render.fill(names.facts, title, pw)
        except codex_render.RenderError:
            continue                # the renderer reports it
        out += tier_and_place(names, filled, pw, title, entry_name)
        out += id_check(ids[0], ids[1], filled, pw)
    return out
