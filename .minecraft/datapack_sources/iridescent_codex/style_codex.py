#!/usr/bin/env python3
"""Put the Codex's page titles in italics, on the STAGED copy of the book only.

build_codex.sh runs this on the staged data/ and assets/ book trees just before
packing. The sources under data/ stay plain, so a new page gets the styling on
the next build without anyone typing it.

How it works (read out of Patchouli-1.20.1-85-FORGE.jar and the 1.20.1 client,
CFR decompile, 2026-10-11):
  - Page titles are NOT macro-parsed: "$(o)" in a title prints raw.
  - They ARE drawn through vanilla's formatted-string path
    (GuiGraphics.drawString(String) / Component.getVisualOrderText ->
    StringDecomposer.iterateFormatted), which applies legacy section-sign codes.
    A title starting with section-sign + "o" renders italic, keeps the book's
    header_color, and keeps its centring (the codes are skipped when measuring).

What gets the code: the `title` of every page of a built-in titled page type.

What does NOT, on purpose:
  - entry `name`. The first page of an entry prints the entry name as its
    header, but the same string is the row text of every entry list
    (GuiButtonEntry), the link and bookmark tooltips, and the search key.
    Italic there would put italics on lists, so that header stays upright.
  - category `name`. Its page shares a spread with a header that comes from
    Patchouli's own lang file, which would stay upright next to it.
  - body text. Authors mark a flavour line with $(italic)...$() in the source.

The code is written as the JSON escape \\u00a7 so the jar never depends on how
a reader decodes the file.

Usage: python3 style_codex.py <staged book dir> [<staged book dir> ...]
       (a book dir holds <lang>/entries/**/*.json)
Exit code 1 if a file cannot be read back the way it was meant to be written.
"""
import json
import sys
from pathlib import Path

SECTION = chr(0xA7)  # the section sign; spelled this way to keep this file ASCII
ITALIC = SECTION + "o"
# Page types whose `title` Patchouli 85 draws as a header (PageText, PageLink,
# PageImage, PageQuest, PageRelations, PageSpotlight, PageDoubleRecipe and its
# subclasses). Multiblock/entity headers use `name`; templates name their own
# variables -- both are left alone.
TITLED_PAGE_TYPES = {
    "text", "link", "image", "quest", "relations", "spotlight", "crafting",
    "smelting", "blasting", "smoking", "campfire", "smithing", "stonecutting",
}


def styled_title(title):
    return title if title.startswith(ITALIC) else ITALIC + title


def style_entry(entry):
    """Italicise the page titles of one parsed entry; return how many changed."""
    changed = 0
    pages = entry.get("pages") if isinstance(entry, dict) else None
    for page in pages if isinstance(pages, list) else []:
        if not isinstance(page, dict):
            continue
        ptype = page.get("type")
        title = page.get("title")
        if not isinstance(ptype, str) or not isinstance(title, str) or not title:
            continue
        kind = ptype[len("patchouli:"):] if ptype.startswith("patchouli:") else ptype
        if kind not in TITLED_PAGE_TYPES:
            continue
        new = styled_title(title)
        if new != title:
            page["title"] = new
            changed += 1
    return changed


def style_tree(book_dir):
    files = titles = 0
    for path in sorted(book_dir.glob("*/entries/**/*.json")):
        entry = json.loads(path.read_bytes().decode("utf-8-sig"))
        changed = style_entry(entry)
        if not changed:
            continue
        text = json.dumps(entry, ensure_ascii=False, indent=2) + "\n"
        path.write_bytes(text.replace(SECTION, "\\u00a7").encode("utf-8"))
        if json.loads(path.read_bytes().decode("utf-8")) != entry:
            raise ValueError(f"{path}: does not read back as written")
        files += 1
        titles += changed
    return files, titles


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    for arg in sys.argv[1:]:
        book_dir = Path(arg)
        if not book_dir.is_dir():
            print(f"ERROR: {book_dir} is not a directory")
            return 1
        try:
            files, titles = style_tree(book_dir)
        except (OSError, ValueError) as e:
            print(f"ERROR: {e}")
            return 1
        print(f"[Codex Style] {book_dir}: {titles} page titles italicised in {files} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
