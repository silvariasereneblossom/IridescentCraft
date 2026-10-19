# -*- coding: utf-8 -*-
"""Does every page of the Codex fit? A model of how Patchouli 1.20.1-85 lays out this book, run on the book the jar
ships (placeholders filled, generated pages written, page titles styled).

It is a MODEL: the numbers below were read out of Patchouli-1.20.1-85-FORGE.jar and the 1.20.1 client (javap and
Vineflower, 2026-10-18) and the glyph widths out of the game's font files (codex_fonts.json, gen_font_widths.py); only a
client shows a page. What it models:

  - the font: book.json "use_blocky_font": false, so Book.getFontStyle() is minecraft:uniform (unifont glyphs, a space
    4 px, most letters 4 px, bold +0.5 a glyph and +1 a space); page titles and entry names are drawn in
    minecraft:default (the bitmap font) and are only measured for width;
  - the parser (BookTextParser): the book's macros, $(br) $(br2) $(p), $(li) (a bullet span "section-sign 0 + bullet"
    indented 4 px a level, then a space), bold and the other styles, colours (a $(#rgb) keeps bold, a section-sign
    colour code inside a string clears it), links and command links (their text keeps the style around them),
    $(k:<keybind>) (the key the Default Options seed binds: config/defaultoptions/keybindings.txt), $(playername)
    (16 characters, the longest name), "[ERROR]" for a style-stack underflow;
  - the layout (TextLayouter): 116 px wide, 9 px a line; a span's width is the font's width of its text (rounded up)
    plus its indents; a line that overflows is broken at Java's line BreakIterator (the JDK's rule-based one, ported in
    java_line_breaks below) before the first character that does not fit, measuring that span one character at a time
    with each width rounded up and +1 for bold (so bold text breaks early); a word longer than the line is cut;
  - where text starts and where it must end. A page fits while its last line's top is at or above 147 (y + 9 <= 156):
    past that, the pack's textOverflowMode = RESIZE shrinks the whole page (OVERFLOW would run it off the page,
    TRUNCATE would drop it). Text starts at:
        text page   22 on an entry's first page (under the entry name), 12 under a page title, -4 with no title
        spotlight   40 (under the item)    crafting  59 (one recipe; two: 137, 147 with a second title)
        smelting family  26
        entity, multiblock 115    image 120    quest 22    relations 22 + 11 a listed entry
  - the landing page: the text starts at x 15, y 43; the row of 11 px buttons (history, resize) starts at y 118, the
    "Unlock Progress:" label at 135, the bar at 144; so a line may not reach 118 (8 lines);
  - a category page: the description starts at y 40; the progress label at 135 (10 lines);
  - widths: a page title, an entry name (the first page's header) and a category name in the default font within
    122 px (centred on the page, that keeps the ink on the paper of book_brown.png on either page); an entry name in the
    uniform font within 99 px (the chapter list draws it at x + 12, after the icon, and the unread marker at x + 111).

Checked against the game: it reproduces line for line the landing page and a category page in the operator's
screenshots of 2026-10-18 (codex_test.py FitModelTest). What it cannot see: a player's own key bindings, a resource pack
that replaces the fonts, a page type it does not model (FitError names it).
"""
import json
import math
import os
import re
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS_FILE = os.path.join(HERE, 'codex_fonts.json')
REPO_MC = os.path.dirname(os.path.dirname(HERE))       # this repo's .minecraft

PAGE_WIDTH = 116            # GuiBook.PAGE_WIDTH; BookTextRenderer's default width
LINE_HEIGHT = 9             # GuiBook.TEXT_LINE_HEIGHT
GLYPH_HEIGHT = 8            # a uniform-font line is drawn from y to y + 8
PAGE_LIMIT = 156            # TextLayouter: overflow once the last line's y + 9 > 156 (RESIZE then shrinks the page)
LIST_INDENT = 4             # $(li): spacingLeft = 4 a level; spacingRight = the width of a space
PLAYER_NAME = 'M' * 16      # $(playername): the widest a name can be (16 characters)
LANDING = {'x': 15, 'top': 43, 'limit': 118, 'what': 'the button row (history, resize) at y 118, above the '
                                                       '"Unlock Progress:" label (135) and the bar (144)'}
CATEGORY = {'x': 15, 'top': 40, 'limit': 135, 'what': 'the "Unlock Progress:" label at y 135'}
ENTRY_LIST_NAME = 99        # GuiButtonEntry: the name drawn at x + 12 in the book's font, the unread marker at x + 111
TITLE_WIDTH = 122           # a header is centred on its page (x 58): 122 px keeps its ink on the paper of either page

TEXT_TOPS = {'spotlight': 40, 'entity': 115, 'multiblock': 115, 'image': 120, 'quest': 22}
RECIPE_HEIGHTS = {'crafting': 78, 'smelting': 45, 'blasting': 45, 'smoking': 45, 'campfire': 45,
                  'stonecutting': 45}
NO_TEXT = {'empty'}

PATCHOULI_MACROS = {'$(list': '$(li', '/$': '$()', '<br>': '$(br)', '$(item)': '$(#b0b)', '$(thing)': '$(#490)'}
SECTION = '\u00a7'
COMMAND = re.compile(r'\$\(([^)]*)\)')


class FitError(Exception):
    pass


# ---- fonts ---------------------------------------------------------------------------------------------------
class Font(object):
    def __init__(self, data, name):
        self.name = name
        self.adv = {}
        for row, line in enumerate(data['advances']):
            for col, c in enumerate(line):
                if c != '.':
                    self.adv[row * 64 + col] = int(c, 36)
        self.bold = {}
        for first, last, off in data['bold']:
            for cp in range(first, last + 1):
                self.bold[cp] = off
        self.limit = len(data['advances']) * 64
        self.missing = set()

    def advance(self, c, bold):
        cp = ord(c)
        a = self.adv.get(cp)
        if a is None:
            self.missing.add(c)
            return 6.0 + (1.0 if bold else 0.0)       # SpecialGlyphs.MISSING: a 5 px box
        return a + (self.bold.get(cp, 0.5) if bold else 0.0)

    def width(self, text, bold=False):
        """Font.width(Component.literal(text).withStyle(style)): the advances summed, rounded up; a section-sign code
        is skipped (a colour code clears bold, l sets it, r resets it to the component's style), a lone trailing
        section sign ends the string"""
        total, b, i = 0.0, bold, 0
        while i < len(text):
            c = text[i]
            if c == SECTION:
                if i + 1 >= len(text):
                    break
                code = text[i + 1].lower()
                if code in '0123456789abcdef':
                    b = False
                elif code == 'l':
                    b = True
                elif code == 'r':
                    b = bold
                i += 2
                continue
            total += self.advance(c, b)
            i += 1
        return int(math.ceil(total))


_FONTS = {}


def fonts():
    if not _FONTS:
        try:
            with open(FONTS_FILE, 'r', encoding='utf-8') as fh:
                data = json.load(fh)
        except (OSError, ValueError) as e:
            raise FitError('%s: not readable (%s): run gen_font_widths.py' % (os.path.basename(FONTS_FILE), e))
        _FONTS['uniform'] = Font(data['uniform'], 'uniform')
        _FONTS['default'] = Font(data['default'], 'default')
        _FONTS['lang'] = data['lang']
    return _FONTS


# ---- Java's line BreakIterator (the JDK's rule-based iterator, BreakIterator.getLineInstance) --------------------
# The JDK's own line rules (java.base sun/text/resources/BreakIteratorRules.java, "LineBreakRules"), written out as a
# longest match over character classes; the iterator puts a boundary at the end of the longest segment that matches,
# and a segment that would be empty takes one character:
#     number    = (pre-word | dash)* digit+ (mid-num digit+)*
#     core      = char* | kanji | number
#     suffix    = dash+ | post-word*
#     word      = pre-word* core suffix
#     segment   = word ((space* glue+ space? | hack3) word)* space* enclosing* ("(" ")" post-word*)? enclosing*
#                 CR? break?
#               | CR break
# hack3 is the apostrophe and the dollar sign (they join two words: "it's"); "ignore" characters (format characters
# and controls other than the breaking ones) are skipped and stay with the text before them. Checked against the
# JDK 17 iterator (codex_test.py holds a recorded sample; dev/codex/README.md says how to record it again).
def _cp(*codes):
    return frozenset(chr(c) for c in codes)


def _cprange(first, last):
    return frozenset(chr(c) for c in range(first, last + 1))


_BREAK = _cp(0x03, 0x09, 0x0a, 0x0c, 0x2028, 0x2029)
_CR = chr(13)
_GLUE = _cp(0xa0, 0xf0c, 0x2007, 0x2011, 0x202f, 0xfeff)
_DANDA = _cp(0x964, 0x965)
_SOFT_HYPHEN = chr(0xad)
_CENT = chr(0xa2)
_PRE_EXTRA = frozenset('"' + "'")
_POST_EXTRA = (frozenset('"!%.,:;?') | _cp(0xa2, 0xb0, 0x66a, 0x2103, 0x2105, 0x2109) | _cprange(0x2030, 0x2034) |
               _cp(0x3001, 0x3002, 0x3005, 0x3041, 0x3043, 0x3045, 0x3047, 0x3049, 0x3063, 0x3083, 0x3085, 0x3087,
                   0x308e, 0x30a1, 0x30a3, 0x30a5, 0x30a7, 0x30a9, 0x30c3, 0x30e3, 0x30e5, 0x30e7, 0x30ee, 0x30f5,
                   0x30f6, 0xff01, 0xff05, 0xff0c, 0xff0e, 0xff1a, 0xff1b, 0xff1f) |
               _cprange(0x3099, 0x309e) | _cprange(0x30fc, 0x30fe))
_KANJI_RANGES = ((0x4e00, 0x9fa5), (0xac00, 0xd7a3), (0xf900, 0xfa2d), (0xfa30, 0xfa6a), (0x3041, 0x3094),
                 (0x30a1, 0x30fa))
_HACK3 = frozenset('$' + "'")
PRE_WORD_QUOTES = True      # whether " and ' are pre-word too (the rule's [:Sc::Ps::Pi:^[cent]\"\'] reads both ways)

CLASS_OVERRIDES = {}


def _classes(c):
    """the classes of one character: a subset of break ignore enclosing danda glue space dash pre post kanji digit mid
    char hack1 hack2 hack3 cr"""
    if c in CLASS_OVERRIDES:
        return CLASS_OVERRIDES[c]
    cat = unicodedata.category(c)
    if c in _BREAK:
        return frozenset(['break'])
    if c == _CR:
        return frozenset(['cr'])
    if c == _SOFT_HYPHEN:
        return frozenset(['dash'])                  # a format character, but the dash set wins (as in the JDK)
    if cat == 'Cf' or cat == 'Cc':
        return frozenset(['ignore'])
    out = set()
    if cat in ('Mn', 'Me'):
        out.add('enclosing')
    if c in _DANDA:
        out.add('danda')
    if c in _GLUE:
        out.add('glue')
    elif cat == 'Zs':
        out.add('space')
    if (cat == 'Pd' or c == _SOFT_HYPHEN) and c not in _GLUE:
        out.add('dash')
    if ((cat in ('Sc', 'Ps', 'Pi') and c != _CENT) or (PRE_WORD_QUOTES and c in _PRE_EXTRA)):
        out.add('pre')
    if cat in ('Pe', 'Pf') or c in _POST_EXTRA:
        out.add('post')
    if any(a <= ord(c) <= b for a, b in _KANJI_RANGES) and 'post' not in out:
        out.add('kanji')
    if cat in ('Nd', 'No'):
        out.add('digit')
    if c in '.,':
        out.add('mid')
    if not out & {'space', 'dash', 'kanji', 'glue', 'pre', 'post', 'mid', 'danda'}:
        out.add('char')
    if c == '(':
        out.add('hack1')
    if c == ')':
        out.add('hack2')
    if c in _HACK3:
        out.add('hack3')
    return frozenset(out)


def java_line_breaks(text):
    """the boundaries BreakIterator.getLineInstance gives, 0 and len(text) included"""
    keep = [i for i, c in enumerate(text) if 'ignore' not in _classes(c)]
    cls = [_classes(text[i]) for i in keep]
    n = len(keep)

    def step(name, S):
        return {p + 1 for p in S if p < n and name in cls[p]}

    def step_any(names, S):
        return {p + 1 for p in S if p < n and cls[p] & names}

    def star(f, S):
        out, frontier = set(S), set(S)
        while frontier:
            new = f(frontier) - out
            out |= new
            frontier = new
        return out

    def plus(f, S):
        return star(f, f(S))

    def opt(f, S):
        return set(S) | f(S)

    def number(S):
        a = star(lambda X: step_any({'pre', 'dash'}, X), S)
        d = plus(lambda X: step('digit', X), a)
        return star(lambda X: plus(lambda Y: step('digit', Y), step('mid', X)), d)

    def word(S):
        p = star(lambda X: step('pre', X), S)
        core = star(lambda X: step('char', X), p) | step('kanji', p) | number(p)
        return plus(lambda X: step('dash', X), core) | star(lambda X: step('post', X), core)

    def joiner(S):
        glued = plus(lambda X: step('glue', X), star(lambda X: step('space', X), S))
        return opt(lambda X: step('space', X), glued) | step('hack3', S)

    bounds, i = [0], 0
    while i < n:
        w = word({i})
        w = star(lambda X: word(joiner(X)), w)
        w = star(lambda X: step('space', X), w)
        w = star(lambda X: step('enclosing', X), w)
        w = opt(lambda X: star(lambda Y: step('post', Y), step('hack2', step('hack1', X))), w)
        w = star(lambda X: step('enclosing', X), w)
        w = opt(lambda X: step('cr', X), w)
        w = opt(lambda X: step('break', X), w)
        w |= step('break', step('cr', {i}))
        end = max(w)
        i = end if end > i else i + 1
        bounds.append(i)
    # back to positions in the text: a skipped character stays with the text before it
    return sorted(set(len(text) if b >= n else keep[b] for b in bounds if b) | {0})


def preceding(bounds, offset):
    """BreakIterator.preceding: the last boundary before offset"""
    best = 0
    for b in bounds:
        if b < offset:
            best = b
        else:
            break
    return best


def java_is_whitespace(c):
    if c in '\u00a0\u2007\u202f':
        return False
    return c in '\t\n\u000b\f\r\u001c\u001d\u001e\u001f' or unicodedata.category(c) in ('Zs', 'Zl', 'Zp')


# ---- the parser (BookTextParser) -------------------------------------------------------------------------------
class Span(object):
    __slots__ = ('text', 'bold', 'line_breaks', 'spacing_left', 'spacing_right', 'error')

    def __init__(self, st, text, error=False):
        self.text = text
        self.bold = st.bold()
        self.line_breaks, self.spacing_left, self.spacing_right = st.line_breaks, st.spacing_left, st.spacing_right
        st.line_breaks = st.spacing_left = st.spacing_right = 0
        self.error = error


class _State(object):
    """SpanState, reduced to what changes a width: bold, the style stack, the pending breaks and indents"""

    def __init__(self, space_width):
        self.stack = [False]            # bold of each pushed style; the base style is not bold
        self.line_breaks = self.spacing_left = self.spacing_right = 0
        self.external = self.ending_external = False
        self.space_width = space_width

    def bold(self):
        return self.stack[-1]


class Context(object):
    """what the parser needs from the pack: the book's macros and the key each keybind is bound to"""

    def __init__(self, macros=None, keybinds=None):
        self.macros = dict(PATCHOULI_MACROS)
        self.macros.update(macros or {})
        self.keybinds = keybinds or {}
        self.notes = []

    def key_label(self, name):
        """KeyMapping.getTranslatedKeyMessage() of the mapping named name or key.<name>, as the seed binds it"""
        bound = self.keybinds.get(name) or self.keybinds.get('key.' + name)
        if bound is None:
            return None
        lang = fonts()['lang']
        parts = bound.split(':')
        code = parts[0]
        if code.startswith('key.keyboard.'):
            rest = code[len('key.keyboard.'):]
            # glfwGetKeyName for a printable key (upper-cased), else the translated name; the longer of the two for
            # the keypad (Keypad 5 or 5, depending on the platform)
            label = rest.upper() if len(rest) == 1 else lang.get(code, code)
        elif code.startswith('key.mouse.'):
            rest = code[len('key.mouse.'):]
            label = lang.get(code) or (lang.get('key.mouse', 'Button %1$s').replace('%1$s', str(int(rest) + 1))
                                       if rest.isdigit() else code)
        else:
            label = code
        if len(parts) > 1 and parts[1] in ('ALT', 'SHIFT', 'CONTROL'):
            fmt = lang.get('forge.controlsgui.' + parts[1].lower(), parts[1] + ' + %s')
            label = fmt.replace('%s', label)
        return label


def load_keybinds(mc):
    path = os.path.join(mc, 'config', 'defaultoptions', 'keybindings.txt')
    out = {}
    try:
        with open(path, 'r', encoding='utf-8') as fh:
            for line in fh:
                m = re.match(r'^key_([^:]+):(.+)$', line.strip())
                if m:
                    out[m.group(1)] = m.group(2)
    except OSError:
        return None
    return out


_CONTEXTS = {}


def book_context(mc):
    """a Context with the macros of the book source's book.json and the keybind seed of the pack at mc"""
    if mc not in _CONTEXTS:
        ctx = Context(keybinds=load_keybinds(mc) or {})
        path = os.path.join(mc, 'datapack_sources', 'iridescent_codex', 'data', 'icraft', 'patchouli_books',
                            'iridescent_codex', 'book.json')
        try:
            with open(path, 'r', encoding='utf-8-sig') as fh:
                ctx.macros.update(json.load(fh).get('macros') or {})
        except (OSError, ValueError):
            pass
        _CONTEXTS[mc] = ctx
    return _CONTEXTS[mc]


def lines(text, ctx):
    """the lines a page text takes"""
    return Layout(parse(text, ctx)).last + 1


def title_fits(title):
    return fonts()['default'].width(title) <= TITLE_WIDTH


def expand_macros(text, macros):
    for _ in range(10):
        new = text
        for k, v in macros.items():
            new = new.replace(k, v)
        if new == text:
            break
        text = new
    return text


def parse(text, ctx):
    """BookTextParser.parse: the spans of one text"""
    st = _State(fonts()['uniform'].width(' '))
    text = expand_macros(text, ctx.macros)
    spans, pos = [], 0
    for m in COMMAND.finditer(text):
        spans.append(Span(st, text[pos:m.start()]))
        try:
            res = _command(st, m.group(1), ctx)
        except IndexError:
            spans.append(Span(st, '[ERROR]', error=True))
            res = ''
        if res:
            spans.append(Span(st, res))
        pos = m.end()
    spans.append(Span(st, text[pos:]))
    return spans


def _command(st, cmd, ctx):
    st.ending_external = False
    res = _command_inner(st, cmd, ctx)
    if st.ending_external:
        res = res + SECTION + '7\u21aa'
    return res


def _command_inner(st, cmd, ctx):
    if len(cmd) == 1 and cmd in '0123456789abcdef':
        return ''                                                       # a colour: bold stays
    if cmd.startswith('#') and len(cmd) in (4, 7):
        return ''
    m = re.fullmatch(r'li(\d?)', cmd)
    if m:
        level = int(m.group(1)) if m.group(1) else 1
        st.line_breaks = 1
        st.spacing_left = level * LIST_INDENT
        st.spacing_right = st.space_width
        return SECTION + '0' + ('\u25e6' if level % 2 == 0 else '\u2022')
    i = cmd.find(':')
    if i > 0:
        fname, param = cmd[:i], cmd[i + 1:]
        if fname == 'k':
            label = ctx.key_label(param)
            if label is None:
                ctx.notes.append('$(k:%s) matches no keybind in the Default Options seed: it prints "N/A"' % param)
                return 'N/A'
            return label
        if fname in ('l', 'c', 'command'):
            st.stack.append(st.stack[-1])                               # a link colour over the current style
            st.external = fname == 'l' and bool(re.match(r'^https?:', param))
            return ''
        if fname in ('t', 'tooltip'):
            return ''
        return '[MISSING FUNCTION: %s]' % fname
    if cmd == 'br':
        st.line_breaks = 1
        return ''
    if cmd in ('br2', '2br', 'p'):
        st.line_breaks = 2
        return ''
    if cmd in ('/l', '/c'):
        if cmd == '/l':
            st.ending_external = st.external
            st.external = False
        if len(st.stack) <= 1:
            raise IndexError('style stack underflow')
        st.stack.pop()
        return ''
    if cmd == '/t':
        return ''
    if cmd == 'playername':
        return PLAYER_NAME
    if cmd in ('l', 'bold'):
        st.stack[-1] = True
        return ''
    if cmd in ('k', 'obf', 'm', 'strike', 'n', 'underline', 'o', 'italic', 'italics', 'nocolor'):
        return ''
    if cmd in ('', 'reset', 'clear'):
        st.ending_external = st.external
        st.external = False
        st.stack = [False]
        return ''
    return '$(%s)' % cmd


# ---- the layout (TextLayouter) ---------------------------------------------------------------------------------
class _Tail(object):
    __slots__ = ('span', 'start', 'width', 'length')

    def __init__(self, font, span, start):
        self.span, self.start = span, start
        self.width = font.width(span.text[start:], span.bold) + span.spacing_left + span.spacing_right
        self.length = len(span.text) - start


class Layout(object):
    """TextLayouter.layout with page width w: .lines = {line index: [(x, text)]}, .last = the last line's index"""

    def __init__(self, spans, width=PAGE_WIDTH):
        self.font = fonts()['uniform']
        self.width = width
        self.words = []
        self.y = 0
        self.pending = []
        self.width_so_far = 0
        self.line_start = 0
        self.bounds = [0]
        paragraph = []
        for span in spans:
            if span.line_breaks > 0:
                self._paragraph(paragraph)
                self.width_so_far = 0
                self.y += span.line_breaks
                paragraph = []
            paragraph.append(span)
        if paragraph:
            self._paragraph(paragraph)
        self.last = self.y
        self.lines = {}
        for y, x, text in self.words:
            self.lines.setdefault(y, []).append((x, text))

    def _paragraph(self, paragraph):
        self.bounds = java_line_breaks(''.join(s.text for s in paragraph))
        self.line_start = 0
        for s in paragraph:
            self._span(s)
        self._flush()

    def _span(self, span):
        t = _Tail(self.font, span, 0)
        self.width_so_far += t.width
        self.pending.append(t)
        while self.width_so_far > self.width:
            self._break_where()
            self.width_so_far = sum(p.width for p in self.pending)

    def _place(self, t, x, length):
        self.words.append((self.y, x + t.span.spacing_left, t.span.text[t.start:t.start + length]))

    def _flush(self):
        x = 0
        for t in self.pending:
            self._place(t, x, t.length)
            x += t.width
        self.pending = []

    def _break_where(self):
        width = sum(p.width for p in self.pending)
        offset = sum(p.length for p in self.pending)
        last = self.pending[-1]
        width -= last.width
        offset -= last.length
        chars = last.span.text
        for i in range(last.start, len(chars)):
            width += self.font.width(chars[i], last.span.bold)
            if last.span.bold:
                width += 1
            if width > self.width:
                over = self.line_start + offset + i - last.start
                at = over + 1
                if not java_is_whitespace(chars[i]):
                    at = preceding(self.bounds, at)
                if at <= self.line_start:
                    at = over - 1
                self._break_at(at)
                return
        self._flush()
        self.y += 1

    def _break_at(self, at):
        line_start, x, i = self.line_start, 0, 0
        while i < len(self.pending):
            t = self.pending[i]
            if line_start + t.length < at:
                self._place(t, x, t.length)
                line_start += t.length
                x += t.width
            else:
                self._place(t, x, at - line_start)
                self.pending[i] = _Tail(self.font, t.span, t.start + at - line_start)
                break
            i += 1
        del self.pending[:i]
        self.line_start = at
        self.y += 1

    def line_texts(self):
        out = []
        for y in range(self.last + 1):
            out.append(''.join(t for _x, t in sorted(self.lines.get(y, []))).replace(SECTION + '0', ''))
        return out


# ---- the book ---------------------------------------------------------------------------------------------------
class Finding(object):
    def __init__(self, where, what, kind='overflow', lines=None, spare=None):
        self.where, self.what, self.kind, self.lines, self.spare = where, what, kind, lines, spare

    def __str__(self):
        return '%s: %s' % (self.where, self.what)


class PageFit(object):
    """one text area: where it is, how many lines it holds, how many it takes"""

    def __init__(self, where, text, top, limit, ctx, label):
        self.where, self.label, self.top, self.limit = where, label, top, limit
        self.spans = parse(text, ctx)
        self.layout = Layout(self.spans)
        self.used = self.layout.last + 1
        self.capacity = capacity(top, limit)
        self.errors = [s.text for s in self.spans if s.error]

    @property
    def spare(self):
        return self.capacity - self.used

    @property
    def overflows(self):
        return self.used > self.capacity


def capacity(top, limit):
    """lines an area holds when its text starts at y = top: on a page the last line's y + 9 stays within 156
    (TextLayouter's own bound); above an obstacle (a button, the progress label) the last line's glyphs, y to y + 8,
    stay above it"""
    room = (PAGE_LIMIT - LINE_HEIGHT) if limit == PAGE_LIMIT else (limit - GLYPH_HEIGHT)
    return (room - top) // LINE_HEIGHT + 1


def text_top(page, index, entry):
    """where Patchouli starts a page's text (getTextHeight), or None for a page with no text"""
    kind = str(page.get('type', '')).split(':')[-1]
    if kind in NO_TEXT:
        return None
    if kind in ('text', 'link'):
        if index == 0:
            return 22
        return 12 if page.get('title') else -4
    if kind in TEXT_TOPS:
        return TEXT_TOPS[kind]
    if kind == 'relations':
        return 22 + 11 * len(page.get('entries') or [])
    if kind in RECIPE_HEIGHTS:
        two = bool(page.get('recipe2'))
        title2 = bool(page.get('title2')) if two else False
        return 4 + RECIPE_HEIGHTS[kind] * (2 if two else 1) - (13 if title2 else 23)
    raise FitError('%s page %d: page type %s is not modelled by codex_fit.py' % (entry, index + 1, page.get('type')))


class BookFit(object):
    """every text area of the built book: .areas (PageFit), .findings (what does not fit), .notes"""

    def __init__(self, files, ctx):
        self.areas, self.findings = [], []
        self.ctx = ctx
        f = fonts()
        for font in (f['uniform'], f['default']):
            font.missing.clear()
        book = _load(files, 'data/icraft/patchouli_books/iridescent_codex/book.json')
        ctx.macros.update(book.get('macros') or {})
        self._area('book.json landing text', book.get('landing_text', ''), LANDING['top'], LANDING['limit'],
                   'the landing page (%s)' % LANDING['what'])
        base = 'assets/icraft/patchouli_books/iridescent_codex/en_us/'
        for path in sorted(files):
            if not path.startswith(base) or not path.endswith('.json'):
                continue
            inner = path[len(base):]
            data = _load(files, path)
            if inner.startswith('categories/'):
                label = 'category icraft:%s' % inner[len('categories/'):-5]
                self._width(label + ' name', data.get('name', ''), 'default', TITLE_WIDTH, 'the category header')
                self._area(label + ' description', data.get('description', ''), CATEGORY['top'], CATEGORY['limit'],
                           'the category page (%s)' % CATEGORY['what'])
                continue
            if not inner.startswith('entries/'):
                continue
            label = 'icraft:%s' % inner[len('entries/'):-5]
            name = data.get('name', '')
            self._width(label + ' name', name, 'default', TITLE_WIDTH, 'the header of its first page')
            self._width(label + ' name', name, 'uniform', ENTRY_LIST_NAME, 'its row in the chapter list')
            for i, page in enumerate(data.get('pages') or []):
                if isinstance(page, str):
                    page = {'type': 'patchouli:text', 'text': page}
                if not isinstance(page, dict):
                    continue
                where = '%s page %d' % (label, i + 1)
                if page.get('title'):
                    self._width(where + ' title', page['title'], 'default', TITLE_WIDTH, 'the page header')
                top = text_top(page, i, label)
                if top is None or not page.get('text'):
                    continue
                kind = str(page.get('type')).split(':')[-1]
                self._area(where, page['text'], top, PAGE_LIMIT, '%s page, text from y %d' % (kind, top))
        missing = f['uniform'].missing | f['default'].missing
        unmeasured = sorted(c for c in missing if ord(c) >= f['uniform'].limit)
        boxes = sorted(c for c in missing if ord(c) < f['uniform'].limit)
        if boxes:
            self.findings.append(Finding('the book', 'no glyph for %s in the game\'s font (drawn as a box)'
                                         % ', '.join('U+%04X' % ord(c) for c in boxes), kind='glyph'))
        if unmeasured:
            names = ', '.join('U+%04X' % ord(c) for c in unmeasured)
            self.findings.append(Finding('the book', '%s is past the measured range (U+%04X): raise LIMIT in '
                                         'gen_font_widths.py and run it' % (names, f['uniform'].limit), kind='glyph'))

    def _width(self, where, text, font, limit, what):
        w = fonts()[font].width(text)
        if w > limit:
            self.findings.append(Finding(where, '"%s" is %d px wide in the %s font; %s holds %d'
                                         % (text.replace(SECTION + 'o', ''), w, font, what, limit), kind='width'))

    def _area(self, where, text, top, limit, label):
        a = PageFit(where, text, top, limit, self.ctx, label)
        self.areas.append(a)
        for e in a.errors:
            self.findings.append(Finding(where, 'Patchouli prints %s here (a $(/l) or $(/c) with no link open)' % e,
                                         kind='error'))
        if a.overflows:
            self.findings.append(Finding(where, '%d lines on %s, which holds %d'
                                         % (a.used, label, a.capacity), lines=a.used, spare=a.spare))


def _load(files, path):
    raw = files.get(path)
    if raw is None:
        raise FitError('%s is not in the built book' % path)
    return json.loads(raw.decode('utf-8'))


def check(files, mc):
    """BookFit of the built jar's files ({path: bytes})"""
    keybinds = load_keybinds(mc)
    ctx = Context(keybinds=keybinds or {})
    return BookFit(files, ctx)
