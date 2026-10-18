# -*- coding: utf-8 -*-
"""Turn the Codex SOURCE (datapack_sources/iridescent_codex/data/...) into the book the jar ships: every fact
placeholder filled and every generated page written, from codex_facts.

PLACEHOLDERS, anywhere in a text, a title, a name, a description or the landing text:

    {{boss <id> <field>}}     name tier kind place where dim health health@<level> rush first repeat each
    {{dim <id> <field>}}      name tier gate death difficulty damage hours
    {{tier <n> <field>}}      difficulty damage hours deathrange dims Dims threshold token rushpct rushsize rushneed
                              first repeat each
    {{bosses <filter>... <format>}}   filters mod= tier= rush= kind= dim= ; formats count word Word names list
    {{dims <filter>... <format>}}     filters tier= flag= ; formats count word names Names
    {{uniques <filter>... <format>}}  filters tier= kind=sword|bow dropped=yes|no ; formats count word names list
                                      minchance maxchance (of the drops)
    {{const <name>}}          dimentry (tokens for a first arrival)

GENERATED PAGES: a page written as {"type": "icraft:generated", "generator": "<name>", ...} becomes one or more
text pages:
    boss_roster    {"tier": n}   every boss and miniboss of tier n: where, health, rush, tokens
    rush_targets   {}            the boss rush of each tier: roster size, share, kills needed
    dimension_glance {"tier": n} the dimensions of tier n: gate, death penalty, the difficulty band
    unique_list    {"tier": n}   the unique weapons of tier n, by the boss that drops each, with the chance

A placeholder or generator that cannot be filled is an error naming the file and the page (RenderError).
"""
import json
import re
from collections import OrderedDict

import codex_facts as cf

PLACEHOLDER = re.compile(r'\{\{\s*([^{}]*?)\s*\}\}')
GENERATED_TYPE = 'icraft:generated'


class RenderError(Exception):
    def __init__(self, where, msg):
        Exception.__init__(self, '%s: %s' % (where, msg))
        self.where = where
        self.msg = msg


# ---- placeholders --------------------------------------------------------------------------------------------
def _tier_arg(where, v):
    try:
        t = int(v)
    except (TypeError, ValueError):
        raise RenderError(where, 'tier "%s" is not a number' % v)
    if t not in cf.TIERS:
        raise RenderError(where, 'tier %d is not one of 1-4' % t)
    return t


def _boss_field(f, b, field, where):
    if field == 'name':
        return b.name
    if field == 'tier':
        return cf.tier_label(b.tier)
    if field == 'tiernum':
        return str(b.tier)
    if field == 'kind':
        return b.kind_word
    if field == 'place':
        if not b.place:
            raise RenderError(where, '%s has no arena in the registry: no place to name' % b.id)
        return b.place
    if field == 'where':
        if not b.place:
            raise RenderError(where, '%s has no arena in the registry: no place to name' % b.id)
        return '%s, %s' % (b.place, f.arena_dim_name(b))
    if field == 'dim':
        if not b.arena:
            raise RenderError(where, '%s has no arena in the registry: no dimension to name' % b.id)
        return f.arena_dim_name(b)
    if field.startswith('health@'):
        lv = (f.registry.bosses.get(b.id) or {}).get('levelHp') or {}
        level = field.split('@', 1)[1]
        if level not in lv:
            raise RenderError(where, '%s has no designed health for level %s (`levelHp`)' % (b.id, level))
        return cf.fmt_int(lv[level] * (f.x3_hp_mult if b.x3 else 1))
    if field == 'health':
        if not b.fight_hp:
            raise RenderError(where, '%s has no designed health (`hp`) in the registry' % b.id)
        return cf.fmt_int(b.fight_hp)
    if field == 'rush':
        return cf.tier_label(b.rush) if b.rush else 'none'
    if field in ('first', 'repeat', 'each'):
        tab = {'first': f.tokens_first, 'repeat': f.tokens_repeat, 'each': f.tokens_miniboss}[field]
        want = 'miniboss' if field == 'each' else 'named'
        if b.kind != want:
            raise RenderError(where, '%s is a %s: it has no "%s" token amount' % (b.id, b.kind_word, field))
        return str(tab[b.tier])
    raise RenderError(where, 'unknown boss field "%s"' % field)


def _dim_field(f, d, field, where):
    diff = f.difficulty[d.difficulty_tier]
    if field == 'name':
        return d.name
    if field == 'Name':
        return d.name[:1].upper() + d.name[1:]
    if field == 'tier':
        return cf.tier_label(d.tier)
    if field == 'gate':
        return cf.tier_label(d.tier) if d.stage_gate else 'none'
    if field == 'death':
        return cf.fmt_pct(d.death)
    if field == 'difficulty':
        return '%s to %s' % (cf.fmt_mult(diff['start']), cf.fmt_mult(diff['cap']))
    if field == 'damage':
        return '+' + cf.fmt_pct(diff['damage'] / 100.0 - 1)
    if field == 'hours':
        return '%g' % diff['hours']
    raise RenderError(where, 'unknown dimension field "%s"' % field)


def _tier_field(f, t, field, where):
    diff = f.difficulty[t]
    if field == 'difficulty':
        return '%s to %s' % (cf.fmt_mult(diff['start']), cf.fmt_mult(diff['cap']))
    if field == 'damage':
        return '+' + cf.fmt_pct(diff['damage'] / 100.0 - 1)
    if field == 'hours':
        return '%g' % diff['hours']
    if field == 'deathrange':
        vals = sorted(set(d.death for d in f.tier_dims(t)))
        if not vals:
            raise RenderError(where, 'tier %d has no listed dimension' % t)
        return cf.fmt_pct(vals[0]) if len(vals) == 1 else '%s to %s' % (cf.fmt_pct(vals[0]), cf.fmt_pct(vals[-1]))
    if field in ('dims', 'Dims'):
        s = cf.fmt_names(f.tier_dim_names(t))
        return s[:1].upper() + s[1:] if field == 'Dims' else s
    if field == 'token':
        return f.token_name(t)
    if field in ('first', 'repeat', 'each'):
        return str({'first': f.tokens_first, 'repeat': f.tokens_repeat, 'each': f.tokens_miniboss}[field][t])
    if field in ('threshold', 'rushpct', 'rushsize', 'rushneed'):
        if t not in f.threshold:
            raise RenderError(where, 'tier %d is the last tier: it has no %s' % (t, field))
        if field == 'threshold':
            return cf.fmt_int(f.threshold[t])
        if field == 'rushpct':
            return cf.fmt_pct(f.rush_pct[t])
        if field == 'rushsize':
            return str(len(f.rush_roster(t)))
        return str(f.rush_need(t))
    raise RenderError(where, 'unknown tier field "%s"' % field)


def _filters(args, allowed, where):
    out = {}
    for a in args:
        if '=' not in a:
            raise RenderError(where, 'filter "%s" is not key=value' % a)
        k, v = a.split('=', 1)
        if k not in allowed:
            raise RenderError(where, 'unknown filter "%s" (one of %s)' % (k, ', '.join(allowed)))
        out[k] = v
    return out


def select_bosses(f, flt, where):
    out = []
    for b in f.bosses.values():
        if b.phase_of or b.tier not in cf.TIERS:
            continue
        if 'mod' in flt and b.mod != flt['mod']:
            continue
        if 'tier' in flt and b.tier != _tier_arg(where, flt['tier']):
            continue
        if 'rush' in flt and b.rush != _tier_arg(where, flt['rush']):
            continue
        if 'kind' in flt and b.kind_word != flt['kind']:
            continue
        if 'dim' in flt and (b.arena or {}).get('dimension') != flt['dim']:
            continue
        out.append(b)
    return out


def _list_format(items, fmt, where):
    if fmt == 'count':
        return str(len(items))
    if fmt in ('word', 'Word'):
        w = cf.count_word(len(items))
        return w[:1].upper() + w[1:] if fmt == 'Word' else w
    if fmt in ('names', 'Names'):
        s = cf.fmt_names(items)
        return s[:1].upper() + s[1:] if fmt == 'Names' else s
    if fmt == 'list':
        return ''.join('$(li)' + n for n in items)
    raise RenderError(where, 'unknown format "%s" (count word Word names Names list)' % fmt)


def resolve(f, expr, where):
    parts = expr.split()
    if not parts:
        raise RenderError(where, 'empty placeholder {{}}')
    head, args = parts[0], parts[1:]
    try:
        if head == 'boss':
            if len(args) != 2:
                raise RenderError(where, '{{boss <id> <field>}} takes two words, got "%s"' % expr)
            try:
                b = f.boss(args[0])
            except cf.FactError:
                raise RenderError(where, 'names %s, which the boss registry does not have (%s)' % (args[0], cf.REGISTRY_BOSSES))
            return _boss_field(f, b, args[1], where)
        if head == 'dim':
            if len(args) != 2:
                raise RenderError(where, '{{dim <id> <field>}} takes two words, got "%s"' % expr)
            try:
                d = f.dim(args[0])
            except cf.FactError:
                raise RenderError(where, 'names %s, which the dimension registry does not have (%s)' % (args[0], cf.REGISTRY_DIMS))
            return _dim_field(f, d, args[1], where)
        if head == 'tier':
            if len(args) != 2:
                raise RenderError(where, '{{tier <n> <field>}} takes two words, got "%s"' % expr)
            return _tier_field(f, _tier_arg(where, args[0]), args[1], where)
        if head == 'bosses':
            if not args:
                raise RenderError(where, '{{bosses ... <format>}} needs a format')
            flt = _filters(args[:-1], ('mod', 'tier', 'rush', 'kind', 'dim'), where)
            items = select_bosses(f, flt, where)
            return _list_format([b.name for b in items] if args[-1] not in ('count', 'word', 'Word') else items,
                                args[-1], where)
        if head == 'dims':
            if not args:
                raise RenderError(where, '{{dims ... <format>}} needs a format')
            flt = _filters(args[:-1], ('tier', 'flag'), where)
            items = [d for d in f.dims.values() if not d.hidden
                     and ('tier' not in flt or d.tier == _tier_arg(where, flt['tier']))
                     and ('flag' not in flt or flt['flag'] in d.flags)]
            return _list_format([d.name for d in items], args[-1], where)
        if head == 'uniques':
            if not args:
                raise RenderError(where, '{{uniques ... <format>}} needs a format')
            flt = _filters(args[:-1], ('tier', 'kind', 'dropped'), where)
            items = [u for u in f.uniques.values()
                     if ('tier' not in flt or u.tier == _tier_arg(where, flt['tier']))
                     and ('kind' not in flt or u.kind == flt['kind'])
                     and ('dropped' not in flt or bool(u.drops) == (flt['dropped'] == 'yes'))]
            if args[-1] in ('minchance', 'maxchance'):
                chances = [ch for u in items for _b, ch in u.drops]
                if not chances:
                    raise RenderError(where, 'no unique of that selection drops from a boss')
                return cf.fmt_pct(min(chances) if args[-1] == 'minchance' else max(chances))
            return _list_format([u.name for u in items] if args[-1] not in ('count', 'word', 'Word') else items,
                                args[-1], where)
        if head == 'const':
            if args == ['dimentry']:
                return str(f.dim_entry_bonus)
            raise RenderError(where, 'unknown constant "%s"' % ' '.join(args))
    except RenderError:
        raise
    raise RenderError(where, 'unknown placeholder "{{%s}}" (boss, dim, tier, bosses, dims, const)' % expr)


def fill(f, text, where):
    if not isinstance(text, str) or '{{' not in text:
        return text
    out = PLACEHOLDER.sub(lambda m: resolve(f, m.group(1), where), text)
    if '{{' in out or '}}' in out:
        raise RenderError(where, 'an unclosed "{{" or a stray "}}"')
    return out


# ---- how much fits on a page (vanilla font advances; Patchouli 1.20.1-85 page geometry) -------------------------
# book.json has "use_blocky_font": false, so Patchouli draws the text in Minecraft's uniform (unicode) font, about
# three quarters of the vanilla font's width. The advances below are rounded UP from that font's glyph sizes.
WIDTH = {' ': 3.5, '!': 2, "'": 2, ',': 2, '.': 2, ':': 2, ';': 2, '|': 2, 'i': 2, 'l': 2.5, 'I': 3,
         '"': 3.5, '(': 3.5, ')': 3.5, '*': 3.5, '[': 3.5, ']': 3.5, '`': 3, '{': 3.5, '}': 3.5, 'f': 3.5, 't': 3.5,
         'm': 6, 'w': 6, 'M': 6, 'W': 6, '@': 6.5, '~': 6}
PAGE_WIDTH = 116            # GuiBook.PAGE_WIDTH
LIST_INDENT = 10            # a $(li) item's text starts after the bullet
LINES_PER_PAGE = 14         # a titled page that is not an entry's first: 156 px high, text from y 12, 9 px a line
MACRO = re.compile(r'\$\(([^)]*)\)')


def char_width(c, bold):
    if c in WIDTH:
        w = WIDTH[c]
    elif ord(c) < 128:
        w = 5 if (c.isupper() or c.isdigit()) else 4.5
    else:
        w = 6
    return w + (0.5 if bold and c != ' ' else 0)


def count_lines(text):
    """Lines the text takes on a page (word wrap at the page width). An estimate on the safe side."""
    lines, x, bold, indent = 1, 0, False, 0
    pos = 0
    words = []
    for m in MACRO.finditer(text):
        words.append(('t', text[pos:m.start()]))
        words.append(('m', m.group(1)))
        pos = m.end()
    words.append(('t', text[pos:]))
    for kind, val in words:
        if kind == 'm':
            if val == 'br':
                lines, x = lines + 1, indent
            elif val in ('br2', '2br', 'p'):
                lines, x, indent = lines + 2, 0, 0
            elif re.fullmatch(r'li\d?', val):
                lines, indent = lines + (1 if x or lines > 1 else 0), LIST_INDENT
                x = indent
            elif val == 'bold':
                bold = True
            elif val in ('', 'reset', 'clear'):
                bold = False
            continue
        for i, word in enumerate(re.split(r'(\s+)', val)):
            if not word:
                continue
            w = sum(char_width(c, bold) for c in word)
            if word.isspace():
                x += w
                continue
            if x + w > PAGE_WIDTH and x > indent:
                lines, x = lines + 1, indent
            x += w
    return lines


def paginate(title, intro, blocks, lines_per_page=LINES_PER_PAGE):
    """Text pages: the intro, then the blocks, as many to a page as fit. Continuation pages repeat the title."""
    pages, cur = [], intro
    for b in blocks:
        trial = cur + b if cur else b.replace('$(br2)', '', 1) if b.startswith('$(br2)') else b
        if cur and count_lines(trial) > lines_per_page:
            pages.append(cur)
            cur = b[len('$(br2)'):] if b.startswith('$(br2)') else b
        else:
            cur = trial
    if cur:
        pages.append(cur)
    out = []
    for i, text in enumerate(pages):
        t = title if i == 0 else '%s, cont.' % title
        out.append(OrderedDict([('type', 'patchouli:text'), ('title', t), ('text', text)]))
    return out


# ---- generated pages ----------------------------------------------------------------------------------------
def _boss_line(f, b, roster_tier):
    bits = []
    if b.place:
        bits.append('%s, %s' % (b.place, f.arena_dim_name(b)))
    if b.fight_hp:
        bits.append('%s health' % cf.fmt_int(b.fight_hp))
    if b.kind == 'unlisted':
        bits.append('pays no tokens')
    if b.rush and b.rush != roster_tier:
        bits.append('counts for the %s boss rush' % cf.tier_label(b.rush))
    elif not b.rush and roster_tier in f.rush_pct:
        bits.append('not on the boss rush')
    name = '$(bold)%s$()' % b.name if b.kind == 'named' else b.name
    return '$(li)' + name + (': ' + '; '.join(bits) if bits else '') + '.'


def gen_boss_roster(f, spec, where):
    t = _tier_arg(where, spec.get('tier'))
    bosses = [b for b in f.bosses.values() if b.counted and b.tier == t]
    named = [b for b in bosses if b.kind == 'named']
    minis = [b for b in bosses if b.kind == 'miniboss']
    other = [b for b in bosses if b.kind not in ('named', 'miniboss')]
    intro = ('%d bosses and %d minibosses. Each kill pays %s: a $(bold)boss$() %s on the first kill and %s after, '
             'a miniboss %s every time.' % (len(named), len(minis), f.token_name(t), f.tokens_first[t],
                                            f.tokens_repeat[t], f.tokens_miniboss[t]))
    blocks = []
    if named:
        blocks.append('$(br2)$(bold)Bosses$()')
        blocks += [_boss_line(f, b, t) for b in named]
    if minis:
        blocks.append('$(br2)$(bold)Minibosses$()')
        blocks += [_boss_line(f, b, t) for b in minis]
    if other:
        blocks.append('$(br2)$(bold)Also on the boss rush$()')
        blocks += [_boss_line(f, b, t) for b in other]
    return paginate(spec.get('title') or '%s Roster' % cf.tier_label(t), intro, blocks)


def gen_rush_targets(f, spec, where):
    blocks = []
    for t in sorted(f.rush_pct):
        size, need = len(f.rush_roster(t)), f.rush_need(t)
        if not size:
            continue
        blocks.append('$(li)$(t%d)%s to %d$(): %s of the %d bosses on its rush (%s).'
                      % (t + 1, cf.tier_label(t), t + 1, 'all' if need == size else str(need), size,
                         cf.fmt_pct(f.rush_pct[t])))
    intro = 'Clear a share of a tier\'s boss rush and you advance, tokens or not. A boss counts once.'
    return paginate(spec.get('title') or 'Boss Rush Targets', intro, ['$(br)'] + blocks if blocks else [])


def gen_dimension_glance(f, spec, where):
    t = _tier_arg(where, spec.get('tier'))
    diff = f.difficulty[t]
    intro = ('Mobs start at %s and reach %s after %g hours of play there, with %s damage on top.'
             % (cf.fmt_mult(diff['start']), cf.fmt_mult(diff['cap']), diff['hours'],
                '+' + cf.fmt_pct(diff['damage'] / 100.0 - 1)))
    uncap = [f.dims[d].name for d in f.uncap if d in f.dims and f.dims[d].tier == t]
    if uncap:
        intro += ' In %s the cap lifts once the Ender Dragon is dead.' % cf.fmt_names(uncap)
    blocks = ['$(br)']
    for d in f.tier_dims(t):
        gate = ('opens at %s' % cf.tier_label(d.tier)) if d.stage_gate else ('open from the start' if d.tier == 1
                                                                               else 'no lock of its own')
        blocks.append('$(li)$(bold)%s$(): %s; death costs %s durability.'
                      % (d.name[:1].upper() + d.name[1:], gate, cf.fmt_pct(d.death)))
    return paginate(spec.get('title') or '%s at a Glance' % cf.tier_label(t), intro, blocks)


def gen_unique_list(f, spec, where):
    t = _tier_arg(where, spec.get('tier'))
    mine = [u for u in f.uniques.values() if u.tier == t]
    swords = sum(1 for u in mine if u.kind == 'sword')
    bows = len(mine) - swords
    by_boss = {}
    for u in mine:
        for bid, ch in u.drops:
            by_boss.setdefault(bid, []).append((u, ch))
    intro = '%s Simply Swords sword%s and %s Too Many Bows bow%s.' % (
        cf.count_word(swords).capitalize(), '' if swords == 1 else 's', cf.count_word(bows), '' if bows == 1 else 's')
    blocks = []
    order = [b for b in f.bosses] + [b for b in by_boss if b not in f.bosses]
    for bid in order:
        if bid not in by_boss:
            continue
        name = f.bosses[bid].name if bid in f.bosses else bid
        items = ', '.join('%s (%s)' % (u.name, cf.fmt_pct(ch)) for u, ch in by_boss[bid])
        blocks.append('$(li)$(bold)%s$(): %s' % (name, items))
    if blocks:
        blocks.insert(0, '$(br)')
    loose = [u.name for u in mine if not u.drops]
    if loose:
        blocks.append('$(br2)Dropped by no boss yet: %s.' % cf.fmt_names(loose))
    return paginate(spec.get('title') or '%s Uniques' % cf.tier_label(t), intro, blocks)


GENERATORS = {'boss_roster': gen_boss_roster, 'rush_targets': gen_rush_targets,
              'dimension_glance': gen_dimension_glance, 'unique_list': gen_unique_list}


# ---- whole files --------------------------------------------------------------------------------------------
def render_entry(f, data, where):
    """One entry or category object, filled. Generated pages expand in place."""
    out = OrderedDict()
    for k, v in data.items():
        if k == 'pages' and isinstance(v, list):
            pages = []
            for i, page in enumerate(v):
                pw = '%s page %d' % (where, i + 1)
                if isinstance(page, dict) and page.get('type') == GENERATED_TYPE:
                    gen = GENERATORS.get(page.get('generator'))
                    if gen is None:
                        raise RenderError(pw, 'unknown generator "%s" (%s)' % (page.get('generator'), ', '.join(sorted(GENERATORS))))
                    made = gen(f, page, pw)
                    for j, p in enumerate(made):
                        if j == 0 and 'anchor' in page:
                            p['anchor'] = page['anchor']
                    pages.extend(made)
                elif isinstance(page, dict):
                    pages.append(OrderedDict((pk, fill(f, pv, pw) if pk in ('text', 'title', 'name') else pv)
                                             for pk, pv in page.items()))
                else:
                    pages.append(fill(f, page, pw))
            out[k] = pages
        elif k in ('name', 'description', 'landing_text', 'subtitle'):
            out[k] = fill(f, v, where)
        else:
            out[k] = v
    return out


def placeholders_in(data):
    """every placeholder expression a source object carries (for the tests and the report)"""
    found = []

    def walk(v):
        if isinstance(v, str):
            found.extend(m.group(1) for m in PLACEHOLDER.finditer(v))
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)
    walk(data)
    return found


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2) + '\n'
