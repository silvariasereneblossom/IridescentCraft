#!/usr/bin/env python3
"""lint_kubejs_scope.py - find cross-file name collisions in KubeJS's shared script scopes.

KubeJS 6 evaluates every file of one script type (server_scripts / startup_scripts /
client_scripts) in ONE shared Rhino scope. A top-level `var` / `function` declared with the
same name in two files is silently replaced by whichever file loads later, for EVERY caller
(2026-10-09 audit: `scanPlayer`, `getEnchLevel`, `getPlayerTier`, `resolvedAttrs`,
`resolveAttr` each killed a feature this way). A top-level `const` / `let` redeclared in a
second file aborts that whole file at load.

What counts as "top-level": a declaration at brace depth 0 only. In this Rhino build
(rhino 2001.2.3) a `var` declared inside ANY block - `try {}`, `if {}`, a loop body - is
scoped to that block, exactly like `let`; it never reaches the shared scope. (Verified
2026-10-10 by loading the pack's scripts on the production Rhino jar, and visible in
production: cherry_spawn_biome.js declared `var pdata` inside a `try` and every later
`if (pdata)` threw.) So a file whose whole body sits in one top-level `try { ... }` or
`;(function () { ... })()` exports nothing by accident.

Also flagged: `catch {` without a binding. node accepts it, this Rhino does not (the
whole file fails to load), so `node --check` gives a false pass.

Usage:
  python lint_kubejs_scope.py            # report; exit 1 if any DIFFERING collision exists
  python lint_kubejs_scope.py --all      # also list identical-body duplicates (harmless today)
  python lint_kubejs_scope.py --warn     # never fail (report only)
  python lint_kubejs_scope.py --uses server_scripts death_penalty.js
                                         # per top-level name of one file: which OTHER files
                                         # mention it (none = safe to make local / wrap)

Fix a hit by wrapping the file in `;(function () { ... })()` (export through `global.*`) or
by renaming. Names in ALLOW are intentional cross-file globals.
"""
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
KUBEJS = os.path.normpath(os.path.join(HERE, '..', 'kubejs'))
SCOPES = ('server_scripts', 'startup_scripts', 'client_scripts')

# Intentional shared globals (declared once, used across files) never collide by themselves;
# list a name here only if two files MUST declare it.
ALLOW = set()

IDENT = r'[A-Za-z_$][A-Za-z0-9_$]*'
DECL_RE = re.compile(r'\b(var|let|const)\s+(' + IDENT + r')')
FUNC_RE = re.compile(r'\bfunction\s*\*?\s*(' + IDENT + r')\s*\(')
REGEX_PREV = set('(,=:[!&|?{};\n')


def strip_code(src):
    """Replace comments, strings, template literals and regex literals with spaces
    (newlines kept) so brace counting and declaration regexes see only code."""
    out = []
    i, n = 0, len(src)
    prev_sig = '\n'  # last significant (non-space) char emitted
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ''
        if c == '/' and nxt == '/':
            j = src.find('\n', i)
            j = n if j < 0 else j
            out.append(' ' * (j - i)); i = j; continue
        if c == '/' and nxt == '*':
            j = src.find('*/', i + 2)
            j = n if j < 0 else j + 2
            out.append(''.join('\n' if ch == '\n' else ' ' for ch in src[i:j])); i = j; continue
        if c in '\'"':
            j = i + 1
            while j < n and src[j] != c:
                if src[j] == '\\': j += 1
                if j < n and src[j] == '\n': break
                j += 1
            j = min(j + 1, n)
            out.append(c + ' ' * (j - i - 2) + c if j - i >= 2 else ' ' * (j - i))
            prev_sig = c; i = j; continue
        if c == '`':
            j = i + 1
            while j < n and src[j] != '`':
                if src[j] == '\\': j += 1
                j += 1
            j = min(j + 1, n)
            out.append(''.join('\n' if ch == '\n' else ' ' for ch in src[i:j]))
            prev_sig = '`'; i = j; continue
        if c == '/' and prev_sig in REGEX_PREV:
            j = i + 1
            in_class = False
            while j < n and src[j] != '\n':
                if src[j] == '\\': j += 2; continue
                if src[j] == '[': in_class = True
                elif src[j] == ']': in_class = False
                elif src[j] == '/' and not in_class: break
                j += 1
            if j < n and src[j] == '/':
                j += 1
                while j < n and src[j].isalpha(): j += 1
                out.append(' ' * (j - i)); prev_sig = 'x'; i = j; continue
        out.append(c)
        if not c.isspace(): prev_sig = c
        elif c == '\n' and prev_sig not in ')]}' and not (prev_sig.isalnum() or prev_sig in '_$'):
            pass
        i += 1
    return ''.join(out)


def top_level_decls(code, src):
    """Yield (kind, name, line, fingerprint) for declarations at brace depth 0.
    `code` is strip_code(src) (same length/offsets); the fingerprint is cut from `src` so
    string contents take part in the comparison."""
    n = len(code)
    def line_of(pos):
        return code.count('\n', 0, pos) + 1

    def fingerprint(pos, is_function):
        # statement text: a function through the close of its body; a var/let/const up to
        # the first ';' or newline at bracket depth 0 (this codebase omits semicolons).
        j = pos
        depth = 0
        seen_brace = False
        while j < n:
            ch = code[j]
            if ch in '{([':
                depth += 1
                if ch == '{': seen_brace = True
            elif ch in '})]':
                depth -= 1
                if is_function and ch == '}' and depth <= 0 and seen_brace: j += 1; break
                if depth < 0: break
            elif depth == 0 and not is_function and (ch == ';' or ch == '\n'):
                # a line ending in an operator/comma continues on the next line
                k = j - 1
                while k > pos and code[k] in ' \t\r': k -= 1
                if ch == ';' or code[k] not in '=+-*/%&|?:,(.<>': break
            j += 1
        return re.sub(r'\s+', '', src[pos:j])

    # brace depth at every offset (strings/comments are already blanked in `code`)
    depth_at = [0] * (n + 1)
    d = 0
    for i, ch in enumerate(code):
        depth_at[i] = d
        if ch == '{': d += 1
        elif ch == '}': d -= 1
    depth_at[n] = d

    for m in DECL_RE.finditer(code):
        # var/let/const are all block-scoped in this Rhino: shared only at brace depth 0
        if depth_at[m.start()] == 0:
            yield m.group(1), m.group(2), line_of(m.start()), fingerprint(m.start(), False)
    for m in FUNC_RE.finditer(code):
        if depth_at[m.start()] == 0:
            # skip function EXPRESSIONS (`x = function name(`, `(function name(`, `: function name(`)
            k = m.start() - 1
            while k >= 0 and code[k] in ' \t': k -= 1
            if k >= 0 and code[k] in '=(:,!&|?+-': continue
            yield 'function', m.group(1), line_of(m.start()), fingerprint(m.start(), True)


# A duplicate is harmless only when every file declares the SAME immutable thing: an
# identical function body, or an identical primitive / Java.loadClass initializer.
# `var cache = {}` in two files is one shared mutable object -> a real collision.
HARMLESS_INIT = re.compile(
    r"""^var[A-Za-z_$][\w$]*=(?:'[^']*'|"[^"]*"|-?\d[\d.]*|true|false|null|"""
    r"""Java\.loadClass\((?:'[^']*'|"[^"]*")\))$""")


def is_harmless(entries):
    fps = {fp for _r, _l, _k, fp in entries}
    if len(fps) != 1: return False
    kinds = {k for _r, _l, k, _f in entries}
    if kinds == {'function'}: return True
    if kinds == {'var'}: return bool(HARMLESS_INIT.match(next(iter(fps))))
    return False  # let/const redeclared across files aborts the later file


def cross_file_uses(scope, target_rel):
    """For one file, list each top-level name it declares and the OTHER files in the same
    scope that mention that identifier. Empty list for a name = safe to make it local."""
    root = os.path.join(KUBEJS, scope)
    sources = {}
    for dp, _dn, fns in os.walk(root):
        for fn in fns:
            if fn.endswith('.js'):
                path = os.path.join(dp, fn)
                rel = os.path.relpath(path, root).replace('\\', '/')
                with open(path, 'r', encoding='utf-8', errors='replace') as fh:
                    src = fh.read()
                sources[rel] = (src, strip_code(src))
    if target_rel not in sources:
        print(f'[kubejs-scope] {scope}/{target_rel}: not found'); return 2
    src, code = sources[target_rel]
    names = []
    for _kind, name, line, _fp in top_level_decls(code, src):
        if name not in [n for n, _l in names]: names.append((name, line))
    print(f'[kubejs-scope] {scope}/{target_rel}: {len(names)} top-level name(s)')
    shared = 0
    for name, line in names:
        pat = re.compile(r'(?<![\w$.])' + re.escape(name) + r'(?![\w$])')
        users = [rel for rel, (_s, c) in sorted(sources.items()) if rel != target_rel and pat.search(c)]
        if users:
            shared += 1
            print(f'  SHARED  {name} (line {line}) <- {", ".join(users[:6])}{" ..." if len(users) > 6 else ""}')
        else:
            print(f'  local   {name} (line {line})')
    print(f'[kubejs-scope] {shared} name(s) referenced by other files '
          f'({"keep them global" if shared else "safe to wrap the whole file"})')
    return 0


def main(argv):
    if '--uses' in argv:
        i = argv.index('--uses')
        return cross_file_uses(argv[i + 1], argv[i + 2])
    show_all = '--all' in argv
    warn_only = '--warn' in argv
    differing = 0
    # Rhino-only syntax trap that `node --check` passes
    bare_catch = re.compile(r'\bcatch\s*\{')
    for scope in SCOPES:
        root = os.path.join(KUBEJS, scope)
        if not os.path.isdir(root): continue
        for dp, _dn, fns in os.walk(root):
            for fn in sorted(fns):
                if not fn.endswith('.js'): continue
                path = os.path.join(dp, fn)
                with open(path, 'r', encoding='utf-8', errors='replace') as fh:
                    code = strip_code(fh.read())
                for m in bare_catch.finditer(code):
                    differing += 1
                    rel = os.path.relpath(path, KUBEJS).replace('\\', '/')
                    print(f'  SYNTAX     {rel}:{code.count(chr(10), 0, m.start()) + 1}  '
                          f'`catch {{` without a binding does not parse in Rhino (use `catch (e) {{`)')
    for scope in SCOPES:
        root = os.path.join(KUBEJS, scope)
        if not os.path.isdir(root): continue
        names = defaultdict(list)
        files = 0
        for dp, _dn, fns in os.walk(root):
            for fn in sorted(fns):
                if not fn.endswith('.js'): continue
                path = os.path.join(dp, fn)
                rel = os.path.relpath(path, root).replace('\\', '/')
                with open(path, 'r', encoding='utf-8', errors='replace') as fh:
                    src = fh.read()
                code = strip_code(src)
                files += 1
                seen_here = set()
                for kind, name, line, fp in top_level_decls(code, src):
                    if (name, rel) in seen_here: continue
                    seen_here.add((name, rel))
                    names[name].append((rel, line, kind, fp))
        hits = {k: v for k, v in names.items() if len(v) > 1 and k not in ALLOW}
        diff = {k: v for k, v in hits.items() if not is_harmless(v)}
        same = {k: v for k, v in hits.items() if k not in diff}
        print(f'[kubejs-scope] {scope}: {files} files, {len(names)} top-level names, '
              f'{len(diff)} differing collision(s), {len(same)} identical duplicate(s)')
        for name in sorted(diff):
            differing += 1
            print(f'  COLLISION  {name}')
            for rel, line, kind, _fp in diff[name]:
                print(f'      {kind:8s} {rel}:{line}')
        if show_all:
            for name in sorted(same):
                where = ', '.join(f'{rel}:{line}' for rel, line, _k, _f in same[name])
                print(f'  duplicate  {name}  ({where})')
    if differing and not warn_only:
        print(f'[kubejs-scope] FAIL: {differing} cross-file collision(s). Wrap the file in an IIFE '
              f'or rename; see the header of this script.')
        return 1
    print('[kubejs-scope] OK' if not differing else '[kubejs-scope] collisions reported (warn-only)')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
