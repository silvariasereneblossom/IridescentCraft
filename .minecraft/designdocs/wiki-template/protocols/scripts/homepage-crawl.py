#!/usr/bin/env python3
"""
Protocol 6: Exhaustive homepage reachability crawl.

Creates a temporary SQLite database, spiders from home.md through all
internal wiki links (BFS), then reports any .md files that exist on disk
but are not reachable from the homepage through any link chain.

Usage:
    python3 protocols/scripts/homepage-crawl.py [wiki_root]

If wiki_root is omitted, defaults to the repository root (two levels up
from this script).

The SQLite database is written to /tmp and its path is printed so Claude
or the user can query it after the run.
"""

import os
import re
import sqlite3
import sys
import tempfile
from collections import deque
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Regex for Wiki.js internal links: [text](/en/path/to/page)
# Also handles optional anchor fragments: /en/path/to/page#section
LINK_RE = re.compile(r'\[([^\]]*)\]\(/en/([^)#]+)(?:#[^)]*)?\)')

# Files that are not wiki pages (exact relative paths from wiki root)
EXCLUDE_FILES = {
    'CLAUDE.md',
    'README.md',
}

# Top-level directories that are not wiki content
EXCLUDE_DIRS = {
    'scratch',
    '.claude',
    '.git',
    'essays',
}

# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------

def wiki_root_default() -> Path:
    """Derive wiki root from script location: protocols/scripts/ -> root."""
    return Path(__file__).resolve().parents[2]


def link_path_to_file(link_path: str) -> str:
    """Convert a wiki link path to a relative .md file path.

    /en/infrastructure/overview  ->  infrastructure/overview.md
    The /en/ prefix is already stripped by the regex capture group.
    """
    return link_path.rstrip('/') + '.md'


def extract_links(filepath: Path) -> list[tuple[str, str]]:
    """Return [(link_text, relative_md_path), ...] from a markdown file."""
    try:
        content = filepath.read_text(encoding='utf-8', errors='replace')
    except OSError:
        return []

    results = []
    for m in LINK_RE.finditer(content):
        link_text = m.group(1)
        wiki_path = m.group(2)
        results.append((link_text, link_path_to_file(wiki_path)))
    return results


def gather_all_md_files(wiki_root: Path) -> set[str]:
    """Return the set of all .md relative paths that count as wiki pages."""
    pages = set()
    for md in wiki_root.rglob('*.md'):
        rel = md.relative_to(wiki_root)
        rel_str = str(rel)

        # Skip excluded exact files and any CLAUDE.md in subdirectories
        if rel_str in EXCLUDE_FILES or rel.name == 'CLAUDE.md':
            continue

        # Skip excluded top-level directories
        if rel.parts[0] in EXCLUDE_DIRS:
            continue

        pages.add(rel_str)
    return pages


def init_db(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.executescript('''
        CREATE TABLE pages (
            path        TEXT PRIMARY KEY,
            parent      TEXT,
            depth       INTEGER NOT NULL,
            on_disk     INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE links (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            source      TEXT NOT NULL,
            target      TEXT NOT NULL,
            link_text   TEXT,
            target_exists INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE orphans (
            path TEXT PRIMARY KEY
        );
    ''')
    conn.commit()
    return conn


def crawl(wiki_root: Path, conn: sqlite3.Connection) -> tuple[set[str], set[str]]:
    """BFS from home.md. Returns (reachable, orphans)."""
    visited: set[str] = set()
    queue: deque[tuple[str, str | None, int]] = deque()

    seed = 'home.md'
    queue.append((seed, None, 0))
    visited.add(seed)
    conn.execute(
        'INSERT INTO pages (path, parent, depth, on_disk) VALUES (?,?,?,?)',
        (seed, None, 0, int((wiki_root / seed).exists())),
    )

    while queue:
        current, _parent, depth = queue.popleft()
        current_file = wiki_root / current

        if not current_file.exists():
            continue

        for link_text, target_path in extract_links(current_file):
            target_exists = (wiki_root / target_path).exists()

            conn.execute(
                'INSERT INTO links (source, target, link_text, target_exists) '
                'VALUES (?,?,?,?)',
                (current, target_path, link_text, int(target_exists)),
            )

            if target_path not in visited:
                visited.add(target_path)
                conn.execute(
                    'INSERT INTO pages (path, parent, depth, on_disk) VALUES (?,?,?,?)',
                    (target_path, current, depth + 1, int(target_exists)),
                )
                if target_exists:
                    queue.append((target_path, current, depth + 1))

    conn.commit()

    # Compare against all files on disk
    all_pages = gather_all_md_files(wiki_root)
    orphans = all_pages - visited

    for orphan in sorted(orphans):
        conn.execute('INSERT INTO orphans (path) VALUES (?)', (orphan,))
    conn.commit()

    return all_pages, orphans


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def print_report(conn: sqlite3.Connection, all_pages: set[str],
                 orphans: set[str], db_path: str) -> None:
    total_links = conn.execute('SELECT COUNT(*) FROM links').fetchone()[0]
    broken_links = conn.execute(
        'SELECT COUNT(*) FROM links WHERE target_exists = 0'
    ).fetchone()[0]
    reachable_on_disk = conn.execute(
        'SELECT COUNT(*) FROM pages WHERE on_disk = 1'
    ).fetchone()[0]

    print('=' * 64)
    print('  PROTOCOL 6 — HOMEPAGE REACHABILITY CRAWL')
    print('=' * 64)
    print()
    print(f'  Database: {db_path}')
    print()
    print('  STATS')
    print('  ' + '-' * 60)
    print(f'  Wiki pages on disk (excl. scratch/CLAUDE.md): {len(all_pages):>4}')
    print(f'  Pages reachable from home.md:                 {reachable_on_disk:>4}')
    print(f'  Internal links found:                         {total_links:>4}')
    print(f'  Broken links (target missing on disk):        {broken_links:>4}')
    print(f'  Orphaned pages (on disk, unreachable):        {len(orphans):>4}')
    print()

    # Broken links
    if broken_links:
        print('  BROKEN LINKS')
        print('  ' + '-' * 60)
        rows = conn.execute(
            'SELECT source, target, link_text FROM links '
            'WHERE target_exists = 0 ORDER BY source, target'
        ).fetchall()
        for source, target, text in rows:
            print(f'  {source}')
            print(f'    -> {target}  ("{text}")')
        print()

    # Orphans
    if orphans:
        print('  ORPHANED PAGES')
        print('  ' + '-' * 60)
        for orphan in sorted(orphans):
            print(f'  {orphan}')
        print()
    else:
        print('  No orphaned pages. Every wiki page is reachable from home.md.')
        print()

    # Depth distribution
    print('  DEPTH DISTRIBUTION')
    print('  ' + '-' * 60)
    for depth, count in conn.execute(
        'SELECT depth, COUNT(*) FROM pages WHERE on_disk = 1 '
        'GROUP BY depth ORDER BY depth'
    ):
        label = 'home.md' if depth == 0 else f'depth {depth}'
        bar = '#' * count
        print(f'  {label:>10}: {count:>3}  {bar}')
    print()

    # Deepest pages
    max_depth = conn.execute(
        'SELECT MAX(depth) FROM pages WHERE on_disk = 1'
    ).fetchone()[0]
    if max_depth and max_depth >= 3:
        print(f'  DEEPEST PAGES (depth >= 3)')
        print('  ' + '-' * 60)
        for path, parent, depth in conn.execute(
            'SELECT path, parent, depth FROM pages '
            'WHERE depth >= 3 AND on_disk = 1 ORDER BY depth DESC, path'
        ):
            print(f'  [depth {depth}] {path}')
            print(f'            via {parent}')
        print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    wiki_root = Path(sys.argv[1]) if len(sys.argv) > 1 else wiki_root_default()
    wiki_root = wiki_root.resolve()

    if not (wiki_root / 'home.md').exists():
        print(f'ERROR: {wiki_root / "home.md"} not found.', file=sys.stderr)
        return 2

    db_fd, db_path = tempfile.mkstemp(suffix='.db', prefix='p6_')
    os.close(db_fd)

    print(f'Crawling from {wiki_root / "home.md"} ...')
    print()

    conn = init_db(db_path)
    all_pages, orphans = crawl(wiki_root, conn)
    print_report(conn, all_pages, orphans, db_path)
    conn.close()

    return 1 if orphans else 0


if __name__ == '__main__':
    raise SystemExit(main())
