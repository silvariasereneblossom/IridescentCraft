"""A small, dependency-free Markdown renderer for the IridescentCraft wiki.

It covers the GitHub-flavoured Markdown the wiki pages actually use:
ATX and setext headings (with GitHub-style anchor ids), paragraphs,
block quotes, nested ordered / unordered / task lists, GFM tables,
fenced code blocks, thematic breaks, footnotes, code spans, emphasis,
strikethrough, links, images, gollum [[wiki links]], <autolinks> and
bare URLs.

Raw HTML is never passed through: every '<' in the source is escaped,
so placeholders such as `<namespace>` written in prose show up as text,
and a page cannot inject markup into the site. HTML comments are dropped.

Links are not resolved here. The caller passes `resolve_link(href)`,
which returns either a dict {"href": ..., "class": ..., "title": ...}
or None (render the link text as plain text), and `resolve_wikilink(page)`
with the same contract.
"""

from __future__ import annotations

import html
import re
import unicodedata

__all__ = ["Renderer", "slugify", "plain_text"]

# --------------------------------------------------------------------------
# Block-level patterns
# --------------------------------------------------------------------------
RE_FENCE = re.compile(r"^( {0,3})(`{3,}|~{3,})\s*([^`\s]*)[^`]*$")
RE_ATX = re.compile(r"^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$")
RE_HR = re.compile(r"^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$")
RE_SETEXT_H1 = re.compile(r"^ {0,3}=+[ \t]*$")
RE_SETEXT_H2 = re.compile(r"^ {0,3}-+[ \t]*$")
RE_QUOTE = re.compile(r"^ {0,3}> ?(.*)$")
RE_LIST = re.compile(r"^( {0,3})([-*+]|(\d{1,9})([.)]))(?:([ \t]+)(.*)|[ \t]*)$")
RE_TABLE_DELIM = re.compile(r"^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$")
RE_FOOTDEF = re.compile(r"^ {0,3}\[\^([^\]\s]+)\]:[ \t]*(.*)$")
RE_TASK = re.compile(r"^\[([ xX])\][ \t]+")

# --------------------------------------------------------------------------
# Inline patterns
# --------------------------------------------------------------------------
PH = "\x00"  # placeholder delimiter; never present in the source text
RE_PH = re.compile(PH + r"(\d+)" + PH)
ESCAPABLE = set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")
RE_BARE_URL = re.compile(r"(?<![\w/\"'=])(https?://[^\s<>\x00]+)")
RE_AUTOLINK = re.compile(r"<((?:https?|mailto):[^\s<>]+)>")
RE_STRONG_STAR = re.compile(r"\*\*(?=\S)(.+?)(?<=\S)\*\*")
RE_STRONG_US = re.compile(r"(?<![\w])__(?=\S)(.+?)(?<=\S)__(?![\w])")
RE_EM_STAR = re.compile(r"(?<![\*\w])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\*])")
RE_EM_US = re.compile(r"(?<![\w])_(?=[^\s_])(.+?)(?<=[^\s_])_(?![\w])")
RE_STRIKE = re.compile(r"~~(?=\S)(.+?)(?<=\S)~~")


def slugify(text: str) -> str:
    """GitHub's heading-anchor algorithm (as used by github-markup / gollum)."""
    text = text.strip().lower()
    out = []
    for ch in text:
        if ch in "-_ ":
            out.append(ch)
        elif ch.isalnum():
            out.append(ch)
        else:
            cat = unicodedata.category(ch)
            if cat.startswith("M"):  # combining marks stay attached to letters
                out.append(ch)
    return "".join(out).replace(" ", "-")


def plain_text(rendered_html: str) -> str:
    """Strip tags and unescape: the visible text of an inline HTML fragment."""
    return html.unescape(re.sub(r"<[^>]+>", "", rendered_html))


def _attr(value: str) -> str:
    return html.escape(value, quote=True)


class Renderer:
    """Render one Markdown document to HTML.

    After `render()`, `self.headings` holds (level, text, slug) for every
    heading, and `self.links` holds every link target the page asked for.
    """

    def __init__(self, resolve_link=None, resolve_wikilink=None, resolve_image=None,
                 id_prefix: str = ""):
        self.resolve_link = resolve_link or (lambda href: {"href": href})
        self.resolve_wikilink = resolve_wikilink or (lambda page: {"href": page})
        self.resolve_image = resolve_image or (lambda src: src)
        self.id_prefix = id_prefix
        self.headings: list[tuple[int, str, str]] = []
        self._slug_counts: dict[str, int] = {}
        self._footnotes: dict[str, str] = {}
        self._footnote_order: list[str] = []
        self._footnote_refs: dict[str, int] = {}

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------
    def render(self, text: str) -> str:
        text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\t", "    ")
        if text.startswith("﻿"):
            text = text[1:]
        lines = self._strip_comments(text.split("\n"))
        lines = self._collect_footnotes(lines)
        body = self._blocks(lines)
        return body + self._render_footnotes()

    # ------------------------------------------------------------------
    # Pre-passes
    # ------------------------------------------------------------------
    @staticmethod
    def _strip_comments(lines: list[str]) -> list[str]:
        """Drop HTML comments outside fenced code."""
        out: list[str] = []
        in_fence = None
        in_comment = False
        for line in lines:
            if in_comment:
                if "-->" in line:
                    in_comment = False
                    rest = line.split("-->", 1)[1]
                    if rest.strip():
                        out.append(rest)
                continue
            m = RE_FENCE.match(line)
            if in_fence:
                if m and m.group(2)[0] == in_fence[0] and len(m.group(2)) >= len(in_fence) and not m.group(3):
                    in_fence = None
                out.append(line)
                continue
            if m:
                in_fence = m.group(2)
                out.append(line)
                continue
            # Comments inside code spans are left alone; only strip comments
            # that start a line, or full comments in running text that are
            # outside backticks.
            if line.lstrip().startswith("<!--"):
                head, sep, tail = line.partition("<!--")
                if "-->" in tail:
                    after = tail.split("-->", 1)[1]
                    joined = head + after
                    if joined.strip():
                        out.append(joined)
                    continue
                if head.strip():
                    out.append(head)
                in_comment = True
                continue
            out.append(line)
        return out

    def _collect_footnotes(self, lines: list[str]) -> list[str]:
        out: list[str] = []
        in_fence = None
        i = 0
        while i < len(lines):
            line = lines[i]
            m = RE_FENCE.match(line)
            if in_fence:
                if m and m.group(2)[0] == in_fence[0] and len(m.group(2)) >= len(in_fence) and not m.group(3):
                    in_fence = None
                out.append(line)
                i += 1
                continue
            if m:
                in_fence = m.group(2)
                out.append(line)
                i += 1
                continue
            fm = RE_FOOTDEF.match(line)
            if fm:
                key, body = fm.group(1), [fm.group(2)]
                i += 1
                while i < len(lines) and lines[i].startswith("    ") and lines[i].strip():
                    body.append(lines[i].strip())
                    i += 1
                self._footnotes[key.lower()] = " ".join(body)
                continue
            out.append(line)
            i += 1
        return out

    # ------------------------------------------------------------------
    # Block parsing
    # ------------------------------------------------------------------
    def _is_block_start(self, lines: list[str], i: int, in_paragraph: bool) -> bool:
        line = lines[i]
        if RE_FENCE.match(line) or RE_ATX.match(line) or RE_QUOTE.match(line):
            return True
        if RE_HR.match(line):
            return True
        lm = RE_LIST.match(line)
        if lm:
            if not in_paragraph:
                return True
            # A list interrupts a paragraph only when it is not empty and,
            # for an ordered list, when it starts at 1 (CommonMark rule).
            if lm.group(6) and lm.group(6).strip():
                if lm.group(3) is None or lm.group(3) == "1":
                    return True
        if "|" in line and i + 1 < len(lines) and RE_TABLE_DELIM.match(lines[i + 1]) and "-" in lines[i + 1]:
            return True
        return False

    def _blocks(self, lines: list[str], tight: bool = False) -> str:
        out: list[str] = []
        i = 0
        n = len(lines)
        while i < n:
            line = lines[i]
            if not line.strip():
                i += 1
                continue

            # Fenced code -------------------------------------------------
            m = RE_FENCE.match(line)
            if m:
                indent, fence, lang = len(m.group(1)), m.group(2), m.group(3)
                i += 1
                code: list[str] = []
                while i < n:
                    cm = RE_FENCE.match(lines[i])
                    if cm and cm.group(2)[0] == fence[0] and len(cm.group(2)) >= len(fence) and not cm.group(3):
                        i += 1
                        break
                    ln = lines[i]
                    strip = min(indent, len(ln) - len(ln.lstrip(" ")))
                    code.append(ln[strip:])
                    i += 1
                cls = f' class="language-{_attr(lang)}"' if lang else ""
                body = html.escape("\n".join(code), quote=False)
                out.append(f'<div class="code"><pre><code{cls}>{body}</code></pre></div>')
                continue

            # ATX heading ---------------------------------------------------
            m = RE_ATX.match(line)
            if m:
                out.append(self._heading(len(m.group(1)), m.group(2) or ""))
                i += 1
                continue

            # Thematic break -----------------------------------------------
            if RE_HR.match(line):
                out.append("<hr>")
                i += 1
                continue

            # Block quote ---------------------------------------------------
            if RE_QUOTE.match(line):
                inner: list[str] = []
                while i < n:
                    qm = RE_QUOTE.match(lines[i])
                    if qm:
                        inner.append(qm.group(1))
                        i += 1
                        continue
                    # Lazy continuation of a paragraph inside the quote.
                    if lines[i].strip() and inner and inner[-1].strip() and not self._is_block_start(lines, i, True):
                        inner.append(lines[i])
                        i += 1
                        continue
                    break
                out.append(self._blockquote(inner))
                continue

            # Table ---------------------------------------------------------
            if "|" in line and i + 1 < n and RE_TABLE_DELIM.match(lines[i + 1]) and "-" in lines[i + 1]:
                header = self._split_row(line)
                aligns = []
                for cell in self._split_row(lines[i + 1]):
                    c = cell.strip()
                    if c.startswith(":") and c.endswith(":"):
                        aligns.append("center")
                    elif c.endswith(":"):
                        aligns.append("right")
                    elif c.startswith(":"):
                        aligns.append("left")
                    else:
                        aligns.append(None)
                if len(header) == len(aligns):
                    i += 2
                    rows = []
                    while i < n and lines[i].strip() and "|" in lines[i]:
                        row = lines[i]
                        if not row.lstrip().startswith("|") and (
                                RE_FENCE.match(row) or RE_ATX.match(row) or RE_QUOTE.match(row)):
                            break
                        rows.append(self._split_row(row))
                        i += 1
                    out.append(self._table(header, aligns, rows))
                    continue

            # List ----------------------------------------------------------
            m = RE_LIST.match(line)
            if m:
                html_list, i = self._list(lines, i)
                out.append(html_list)
                continue

            # Paragraph (or setext heading) ---------------------------------
            para = [line]
            i += 1
            setext = 0
            while i < n and lines[i].strip():
                if RE_SETEXT_H1.match(lines[i]):
                    setext = 1
                    i += 1
                    break
                if RE_SETEXT_H2.match(lines[i]):
                    setext = 2
                    i += 1
                    break
                if self._is_block_start(lines, i, True):
                    break
                para.append(lines[i])
                i += 1
            if setext:
                out.append(self._heading(setext, " ".join(p.strip() for p in para)))
            else:
                inner = self._inline_lines(para)
                out.append(inner if tight else f"<p>{inner}</p>")
        return "\n".join(out)

    def _heading(self, level: int, raw: str) -> str:
        inner = self.inline(raw.strip())
        text = plain_text(inner).strip()
        base = slugify(text) or "section"
        count = self._slug_counts.get(base, 0)
        self._slug_counts[base] = count + 1
        slug = base if count == 0 else f"{base}-{count}"
        self.headings.append((level, text, slug))
        sid = _attr(self.id_prefix + slug)
        return (f'<h{level} id="{sid}"><a class="anchor" href="#{sid}" aria-label="Link to this section"></a>'
                f"{inner}</h{level}>")

    def _blockquote(self, inner: list[str]) -> str:
        # GitHub alert syntax: > [!NOTE]
        kind = None
        if inner:
            am = re.match(r"^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$", inner[0], re.I)
            if am:
                kind = am.group(1).lower()
                inner = inner[1:]
        body = self._blocks(inner)
        if kind:
            return (f'<div class="callout callout-{kind}"><p class="callout-title">{kind.title()}</p>'
                    f"{body}</div>")
        return f"<blockquote>{body}</blockquote>"

    @staticmethod
    def _split_row(line: str) -> list[str]:
        s = line.strip()
        if s.startswith("|"):
            s = s[1:]
        if s.endswith("|") and not s.endswith("\\|"):
            s = s[:-1]
        cells, cur, i = [], [], 0
        while i < len(s):
            ch = s[i]
            if ch == "\\" and i + 1 < len(s) and s[i + 1] == "|":
                cur.append("|")  # GFM: an escaped pipe is a literal pipe, even in code
                i += 2
                continue
            if ch == "|":
                cells.append("".join(cur))
                cur = []
            else:
                cur.append(ch)
            i += 1
        cells.append("".join(cur))
        return [c.strip() for c in cells]

    def _table(self, header, aligns, rows) -> str:
        def cell(tag, content, align):
            style = f' class="al-{align}"' if align else ""
            return f"<{tag}{style}>{self.inline(content)}</{tag}>"

        ncol = len(header)
        parts = ['<div class="table-wrap"><table>', "<thead><tr>"]
        parts += [cell("th", h, aligns[k]) for k, h in enumerate(header)]
        parts.append("</tr></thead>")
        if rows:
            parts.append("<tbody>")
            for row in rows:
                row = (row + [""] * ncol)[:ncol]
                parts.append("<tr>" + "".join(cell("td", c, aligns[k]) for k, c in enumerate(row)) + "</tr>")
            parts.append("</tbody>")
        parts.append("</table></div>")
        return "".join(parts)

    def _list(self, lines: list[str], i: int) -> tuple[str, int]:
        n = len(lines)
        first = RE_LIST.match(lines[i])
        ordered = first.group(3) is not None
        bullet = first.group(4) if ordered else first.group(2)
        start = int(first.group(3)) if ordered else 1
        base_indent = len(first.group(1))
        items: list[list[str]] = []
        loose = False
        while i < n:
            m = RE_LIST.match(lines[i])
            if not m or len(m.group(1)) > base_indent + 3:
                break
            is_ord = m.group(3) is not None
            if is_ord != ordered or (m.group(4) if is_ord else m.group(2)) != bullet:
                break
            marker_w = len(m.group(1)) + len(m.group(2))
            spaces = len(m.group(5) or "")
            content = m.group(6) or ""
            if spaces >= 5 or not content:
                content_indent = marker_w + 1
                content = (" " * (spaces - 1) + content) if spaces >= 5 else content
            else:
                content_indent = marker_w + spaces
            item = [content]
            i += 1
            saw_blank = False
            while i < n:
                ln = lines[i]
                if not ln.strip():
                    item.append("")
                    saw_blank = True
                    i += 1
                    continue
                ind = len(ln) - len(ln.lstrip(" "))
                if ind >= content_indent:
                    item.append(ln[content_indent:])
                    saw_blank = False
                    i += 1
                    continue
                if (not saw_blank and item[-1].strip() and not RE_LIST.match(ln)
                        and not self._is_block_start(lines, i, True)):
                    item.append(ln)  # lazy paragraph continuation
                    i += 1
                    continue
                break
            # Trailing blanks belong between items, not inside this one.
            trailing = 0
            while item and not item[-1].strip():
                item.pop()
                trailing += 1
            items.append(item)
            if self._has_top_level_blank(item):
                loose = True
            if trailing and i < n:
                nm = RE_LIST.match(lines[i])
                if nm and len(nm.group(1)) <= base_indent + 3 and (nm.group(3) is not None) == ordered:
                    loose = True
        parts = []
        for item in items:
            task = ""
            if item and RE_TASK.match(item[0]):
                checked = item[0][1] in "xX"
                item[0] = RE_TASK.sub("", item[0], count=1)
                task = f'<input type="checkbox" disabled{" checked" if checked else ""}> '
            body = self._blocks(item, tight=not loose)
            cls = ' class="task"' if task else ""
            parts.append(f"<li{cls}>{task}{body}</li>")
        if ordered:
            start_attr = f' start="{start}"' if start != 1 else ""
            return f"<ol{start_attr}>" + "".join(parts) + "</ol>", i
        return "<ul>" + "".join(parts) + "</ul>", i

    @staticmethod
    def _has_top_level_blank(item: list[str]) -> bool:
        """True when two direct children of a list item are separated by a
        blank line (CommonMark's 'loose' rule). Blanks inside a fenced block
        or inside a nested, deeper-indented block do not count."""
        fence = None
        for k, ln in enumerate(item):
            fm = RE_FENCE.match(ln)
            if fence:
                if fm and fm.group(2)[0] == fence[0] and not fm.group(3):
                    fence = None
                continue
            if fm:
                fence = fm.group(2)
                continue
            if not ln.strip() and 0 < k < len(item) - 1:
                nxt = next((x for x in item[k + 1:] if x.strip()), None)
                if nxt is not None and not nxt.startswith(" "):
                    # A blank between two items of a nested list loosens
                    # that list, not this item.
                    if RE_LIST.match(nxt) and any(RE_LIST.match(x) for x in item[1:k]):
                        continue
                    return True
        return False

    # ------------------------------------------------------------------
    # Inline parsing
    # ------------------------------------------------------------------
    def _inline_lines(self, para: list[str]) -> str:
        pieces = []
        for k, ln in enumerate(para):
            last = k == len(para) - 1
            hard = False
            s = ln.strip() if k else ln.lstrip()
            if not last:
                if ln.endswith("  "):
                    hard = True
                elif ln.rstrip().endswith("\\") and not ln.rstrip().endswith("\\\\"):
                    hard = True
                    s = s.rstrip()[:-1]
            pieces.append((s.strip(), hard))
        text = ""
        for k, (s, hard) in enumerate(pieces):
            text += s
            if k < len(pieces) - 1:
                text += "\x01" if hard else "\n"
        return self.inline(text).replace("\x01", "<br>\n")

    def inline(self, text: str) -> str:
        store: list[str] = []

        def keep(fragment: str) -> str:
            store.append(fragment)
            return f"{PH}{len(store) - 1}{PH}"

        text = self._code_spans(text, keep)
        text = self._escapes(text, keep)
        text = self._inline_rest(text, keep)
        for _ in range(16):
            if PH not in text:
                break
            text = RE_PH.sub(lambda m: store[int(m.group(1))], text)
        return text

    def _inline_rest(self, text: str, keep) -> str:
        """Links, bare URLs, escaping and emphasis. Code spans and backslash
        escapes are already placeholders in `keep`'s store, which nested
        calls (link labels) share."""
        text = RE_AUTOLINK.sub(lambda m: keep(self._link_html(m.group(1), html.escape(m.group(1)), is_auto=True)), text)
        text = self._links(text, keep)
        text = RE_BARE_URL.sub(lambda m: self._bare_url(m.group(1), keep), text)
        text = html.escape(text, quote=False)
        text = RE_STRONG_STAR.sub(r"<strong>\1</strong>", text)
        text = RE_STRONG_US.sub(r"<strong>\1</strong>", text)
        text = RE_EM_STAR.sub(r"<em>\1</em>", text)
        text = RE_EM_US.sub(r"<em>\1</em>", text)
        text = RE_STRIKE.sub(r"<del>\1</del>", text)
        return text

    @staticmethod
    def _code_spans(text: str, keep) -> str:
        out, i, n = [], 0, len(text)
        while i < n:
            if text[i] == "`" and (i == 0 or text[i - 1] != "\\"):
                j = i
                while j < n and text[j] == "`":
                    j += 1
                ticks = text[i:j]
                close = text.find(ticks, j)
                while close != -1 and (close + len(ticks) < n and text[close + len(ticks)] == "`"):
                    k = close
                    while k < n and text[k] == "`":
                        k += 1
                    close = text.find(ticks, k)
                if close == -1:
                    out.append(ticks)
                    i = j
                    continue
                code = text[j:close].replace("\n", " ")
                if code.startswith(" ") and code.endswith(" ") and code.strip():
                    code = code[1:-1]
                out.append(keep(f"<code>{html.escape(code, quote=False)}</code>"))
                i = close + len(ticks)
                continue
            out.append(text[i])
            i += 1
        return "".join(out)

    @staticmethod
    def _escapes(text: str, keep) -> str:
        out, i = [], 0
        while i < len(text):
            if text[i] == "\\" and i + 1 < len(text) and text[i + 1] in ESCAPABLE:
                out.append(keep(html.escape(text[i + 1], quote=False)))
                i += 2
                continue
            out.append(text[i])
            i += 1
        return "".join(out)

    @staticmethod
    def _match_bracket(text: str, i: int, open_ch: str, close_ch: str) -> int:
        depth = 0
        for j in range(i, len(text)):
            if text[j] == open_ch:
                depth += 1
            elif text[j] == close_ch:
                depth -= 1
                if depth == 0:
                    return j
        return -1

    def _links(self, text: str, keep) -> str:
        out: list[str] = []
        i, n = 0, len(text)
        while i < n:
            ch = text[i]
            # [[Wiki Link]] or [[Text|Page]]
            if text.startswith("[[", i):
                end = text.find("]]", i + 2)
                if end != -1 and "\n" not in text[i:end]:
                    inner = text[i + 2:end]
                    if "|" in inner:
                        label, page = inner.split("|", 1)
                    else:
                        label, page = inner, inner
                    out.append(keep(self._wikilink_html(label.strip(), page.strip())))
                    i = end + 2
                    continue
            # Footnote reference [^id]
            if text.startswith("[^", i):
                end = text.find("]", i)
                key = text[i + 2:end].lower() if end != -1 else ""
                if end != -1 and key in self._footnotes:
                    out.append(keep(self._footnote_ref(key)))
                    i = end + 1
                    continue
            is_img = ch == "!" and i + 1 < n and text[i + 1] == "["
            if ch == "[" or is_img:
                b = i + 1 if is_img else i
                close = self._match_bracket(text, b, "[", "]")
                if close != -1 and close + 1 < n and text[close + 1] == "(":
                    pclose = self._match_bracket(text, close + 1, "(", ")")
                    if pclose != -1:
                        label = text[b + 1:close]
                        dest = text[close + 2:pclose].strip()
                        title = None
                        tm = re.match(r'^(\S+)\s+"(.*)"$', dest)
                        if tm:
                            dest, title = tm.group(1), tm.group(2)
                        if dest.startswith("<") and dest.endswith(">"):
                            dest = dest[1:-1]
                        if is_img:
                            src = self.resolve_image(dest)
                            alt = plain_text(RE_PH.sub("", self._inline_rest(label, keep)))
                            t = f' title="{_attr(title)}"' if title else ""
                            out.append(keep(f'<img src="{_attr(src)}" alt="{_attr(alt)}"{t} loading="lazy">'))
                        else:
                            label_html = self._inline_rest(label, keep)
                            out.append(keep(self._link_html(dest, label_html, title=title)))
                        i = pclose + 1
                        continue
            out.append(ch)
            i += 1
        return "".join(out)

    def _bare_url(self, url: str, keep) -> str:
        trail = ""
        while url and url[-1] in ".,:;!?*_~'\"":
            trail = url[-1] + trail
            url = url[:-1]
        while url.endswith(")") and url.count(")") > url.count("("):
            trail = ")" + trail
            url = url[:-1]
        return keep(self._link_html(url, html.escape(url), is_auto=True)) + trail

    def _link_html(self, href: str, label_html: str, title=None, is_auto=False) -> str:
        res = self.resolve_link(href)
        if res is None:
            return f'<span class="unlinked">{label_html}</span>'
        attrs = [f'href="{_attr(res["href"])}"']
        if res.get("class"):
            attrs.append(f'class="{_attr(res["class"])}"')
        t = res.get("title") or title
        if t:
            attrs.append(f'title="{_attr(t)}"')
        if res.get("external"):
            attrs.append('rel="noopener"')
        return f"<a {' '.join(attrs)}>{label_html}</a>"

    def _wikilink_html(self, label: str, page: str) -> str:
        res = self.resolve_wikilink(page)
        label_html = html.escape(label, quote=False)
        if res is None:
            return f'<span class="unlinked">{label_html}</span>'
        attrs = [f'href="{_attr(res["href"])}"']
        if res.get("class"):
            attrs.append(f'class="{_attr(res["class"])}"')
        if res.get("title"):
            attrs.append(f'title="{_attr(res["title"])}"')
        if res.get("external"):
            attrs.append('rel="noopener"')
        return f"<a {' '.join(attrs)}>{label_html}</a>"

    # ------------------------------------------------------------------
    # Footnotes
    # ------------------------------------------------------------------
    def _footnote_ref(self, key: str) -> str:
        if key not in self._footnote_order:
            self._footnote_order.append(key)
        num = self._footnote_order.index(key) + 1
        count = self._footnote_refs.get(key, 0) + 1
        self._footnote_refs[key] = count
        ref_id = f"{self.id_prefix}fnref-{slugify(key)}" + (f"-{count}" if count > 1 else "")
        return (f'<sup class="fnref"><a id="{_attr(ref_id)}" href="#{_attr(self.id_prefix)}fn-{_attr(slugify(key))}">'
                f"{num}</a></sup>")

    def _render_footnotes(self) -> str:
        if not self._footnote_order:
            return ""
        items = []
        for key in self._footnote_order:
            body = self.inline(self._footnotes[key])
            fid = f"{self.id_prefix}fn-{slugify(key)}"
            back = f' <a class="fnback" href="#{_attr(self.id_prefix)}fnref-{_attr(slugify(key))}" aria-label="Back to text">&#8617;</a>'
            items.append(f'<li id="{_attr(fid)}">{body}{back}</li>')
        return '\n<section class="footnotes"><h2 class="fn-title">Notes</h2><ol>' + "".join(items) + "</ol></section>"
