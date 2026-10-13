// lint_kubejs_traps.test.js -- does lint_kubejs_traps.js still flag what it exists to flag?
//
//   node .minecraft/dev/lint_kubejs_traps.test.js            # every part
//   node .minecraft/dev/lint_kubejs_traps.test.js ratchet    # only the parts whose name holds the word
//
// Exit 0 when every case behaves, 1 otherwise, 2 when it could not run (no git).
//
// PART fixtures       every file under lint-fixtures/kubejs is linted, and the lint must report exactly the
//                     flags the file itself marks (// EXPECT RULE on the line). One fixture per rule of
//                     2026-10-13, each with the cases that must NOT be flagged next to those that must.
//                     Take a rule out of the lint and its fixture fails: that is the proof the rule works.
// PART known-false    every member NO-SUCH-MEMBER names is an entry of engine-tests/truth/known-false.json
//                     that the engine suite verifies absent: the lint claims nothing the engine does not.
// PART rule-ratchet   the per-rule counts (lint_kubejs_traps.ratchet.json): at its count a file is clean, one
//                     more site flags, an unlisted file holds none, --ratchet-down only lowers,
//                     --ratchet-start works once, --ratchet-base lets a rule start and never rise.
// PART ratchet-base   `--ratchet-base=<ref>` in a temporary git repository: a grandfathered count that is
//                     raised by hand, a file that appears with a count, a deleted counts file are flagged; a
//                     lowered count, an untouched file and a script that MOVED with its count are not.
//
// Nothing in the real tree is touched: every case runs on a copy in a temporary folder.
// Run by the pre-push hook when the lint, this test or a fixture changes (install-hooks.ps1, the block
// "Lint ratchets against the base commit") and by the `KubeJS script checks` Action.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const LINT = path.join(__dirname, 'lint_kubejs_traps.js');
const only = process.argv.slice(2);
const wanted = (part) => only.length === 0 || only.some(w => part.indexOf(w) >= 0);

let cases = 0, bad = 0;
function check(name, ok, detail) {
  cases++;
  if (ok) { console.log('ok    ' + name); return; }
  bad++;
  console.log('FAIL  ' + name);
  if (detail) console.log('      ' + String(detail).trim().split(/\r?\n/).slice(-14).join('\n      '));
}
function runLint(lint, args, cwd) {
  const r = spawnSync(process.execPath, ['--expose-internals', lint].concat(args), { cwd: cwd || path.dirname(lint), encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function tmpDir(tag) { return fs.mkdtempSync(path.join(os.tmpdir(), 'trap-lint-' + tag + '-')); }
function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* swallow-ok: a temp folder Windows still holds open; the OS clears it */ } }
function write(root, rel, text) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

// =====================================================================================================
// PART ratchet-base
// =====================================================================================================
function partRatchetBase() {
  const DEV = '.minecraft/dev/';
  const COUNTS = DEV + 'lint_kubejs_traps.silent_catches.json';
  const counts = (map) => JSON.stringify({ comment: 'test', taken: 'test', total: 0,
    files: Object.fromEntries(Object.entries(map).map(([k, n]) => [k, { count: n, ids: [] }])) }, null, 2) + '\n';
  let git;
  const mk = () => {
    const root = tmpDir('ratchet');
    git = (...a) => execFileSync('git', ['-C', root].concat(a), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    git('init', '-q');
    git('config', 'user.email', 'lint-test@example.invalid');
    git('config', 'user.name', 'lint test');
    git('config', 'core.autocrlf', 'false');
    git('config', 'commit.gpgsign', 'false');
    write(root, DEV + 'lint_kubejs_traps.js', fs.readFileSync(LINT));
    write(root, DEV + 'lint_kubejs_traps.exceptions.json', '{ "exceptions": [] }\n');
    write(root, COUNTS, counts({ 'server_scripts/a.js': 2, 'server_scripts/sub/b.js': 1 }));
    write(root, '.minecraft/kubejs/server_scripts/a.js', '// a\n');
    write(root, '.minecraft/kubejs/server_scripts/sub/b.js', '// b\n');
    write(root, '.minecraft/kubejs/server_scripts/c.js', '// c\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    return root;
  };
  const lintOf = (root) => path.join(root, DEV, 'lint_kubejs_traps.js');
  // (name, change(root) -> extra arguments or nothing, expected exit code, texts the output must hold, texts it must not hold)
  const CASES = [
    ['nothing changed', () => {}, 0, ['3 -> 3 grandfathered', '0 flag(s)'], ['RATCHET-RAISED']],
    ['a count lowered', (root) => write(root, COUNTS, counts({ 'server_scripts/a.js': 1, 'server_scripts/sub/b.js': 1 })), 0, ['3 -> 2 grandfathered'], ['RATCHET-RAISED']],
    ['a file fixed completely and dropped from the list', (root) => write(root, COUNTS, counts({ 'server_scripts/a.js': 2 })), 0, ['3 -> 2 grandfathered'], ['RATCHET-RAISED']],
    ['a count raised by hand', (root) => write(root, COUNTS, counts({ 'server_scripts/a.js': 3, 'server_scripts/sub/b.js': 1 })), 1,
      ['server_scripts/a.js:0\tRATCHET-RAISED', '2 -> 3', '1 flag(s)'], []],
    ['a file that appears with a count', (root) => write(root, COUNTS, counts({ 'server_scripts/a.js': 2, 'server_scripts/sub/b.js': 1, 'server_scripts/c.js': 1 })), 1,
      ['server_scripts/c.js:0\tRATCHET-RAISED', '0 -> 1'], []],
    ['one count lowered, another raised: the sum is the same, still a flag',
      (root) => write(root, COUNTS, counts({ 'server_scripts/a.js': 1, 'server_scripts/sub/b.js': 2 })), 1, ['server_scripts/sub/b.js:0\tRATCHET-RAISED', '1 -> 2'], ['server_scripts/a.js:0']],
    ['a script that moved takes its count along', (root) => {
      fs.renameSync(path.join(root, '.minecraft/kubejs/server_scripts/a.js'), path.join(root, '.minecraft/kubejs/server_scripts/sub/a_moved.js'));
      write(root, COUNTS, counts({ 'server_scripts/sub/a_moved.js': 2, 'server_scripts/sub/b.js': 1 }));
    }, 0, ['taken over from a script that no longer exists', '0 flag(s)'], ['RATCHET-RAISED']],
    ['a script that moved and gained one', (root) => {
      fs.renameSync(path.join(root, '.minecraft/kubejs/server_scripts/a.js'), path.join(root, '.minecraft/kubejs/server_scripts/sub/a_moved.js'));
      write(root, COUNTS, counts({ 'server_scripts/sub/a_moved.js': 3, 'server_scripts/sub/b.js': 1 }));
    }, 1, ['server_scripts/sub/a_moved.js:0\tRATCHET-RAISED', '0 -> 3'], []],
    ['a key renamed while the old script is still there', (root) =>
      write(root, COUNTS, counts({ 'server_scripts/c.js': 2, 'server_scripts/sub/b.js': 1 })), 1, ['server_scripts/c.js:0\tRATCHET-RAISED'], []],
    ['the counts file deleted', (root) => fs.unlinkSync(path.join(root, COUNTS)), 1, ['RATCHET-RAISED', 'is gone here'], []],
    ['a base from before the counts file existed', (root) => {
      git('rm', '-q', '--cached', COUNTS); git('commit', '-q', '-m', 'no counts file yet');
      write(root, COUNTS, counts({ 'server_scripts/a.js': 9 }));
    }, 0, ['nothing to compare', '0 counts file(s) compared'], ['RATCHET-RAISED']],
    ['an unknown ref', () => ['--ratchet-base=no-such-ref'], 2, ['is not a commit of this clone'], []],
    ['--ratchet-head: the committed counts are judged, not the working tree', (root) => {
      write(root, COUNTS, counts({ 'server_scripts/a.js': 5, 'server_scripts/sub/b.js': 1 }));
      git('add', '-A'); git('commit', '-q', '-m', 'raised');
      write(root, COUNTS, counts({ 'server_scripts/a.js': 2, 'server_scripts/sub/b.js': 1 }));   // put back in the tree only
      return ['--ratchet-base=HEAD~1', '--ratchet-head=HEAD'];
    }, 1, ['server_scripts/a.js:0\tRATCHET-RAISED', '2 -> 5'], []],
    ['--ratchet-head: a moved script is looked up in that commit', (root) => {
      git('mv', '.minecraft/kubejs/server_scripts/a.js', '.minecraft/kubejs/server_scripts/sub/a_moved.js');
      write(root, COUNTS, counts({ 'server_scripts/sub/a_moved.js': 2, 'server_scripts/sub/b.js': 1 }));
      git('add', '-A'); git('commit', '-q', '-m', 'moved');
      write(root, '.minecraft/kubejs/server_scripts/a.js', '// back in the tree only\n');
      return ['--ratchet-base=HEAD~1', '--ratchet-head=HEAD'];
    }, 0, ['taken over from a script that no longer exists'], ['RATCHET-RAISED']],
    ['--ratchet-base takes no file argument', () => ['--ratchet-base=HEAD', 'x.js'], 2, ['is a run of its own'], []],
    ['--ratchet-head without --ratchet-base', () => ['--ratchet-head=HEAD'], 2, ['needs --ratchet-base'], []],
  ];
  for (const [name, change, wantCode, want, wantNot] of CASES) {
    const root = mk();
    let r;
    try {
      const extra = change(root);
      r = runLint(lintOf(root), Array.isArray(extra) ? extra : ['--ratchet-base=HEAD'], root);
    } finally { rmrf(root); }
    const missing = want.filter(w => r.out.indexOf(w) < 0), present = wantNot.filter(w => r.out.indexOf(w) >= 0);
    check('ratchet-base: ' + name + ' (exit ' + r.code + ')', r.code === wantCode && !missing.length && !present.length,
      (r.code !== wantCode ? 'wanted exit ' + wantCode + '\n' : '') + missing.map(w => 'the output does not hold: ' + w + '\n').join('') +
      present.map(w => 'the output must not hold: ' + w + '\n').join('') + r.out);
  }
}

// =====================================================================================================
// PART fixtures
// =====================================================================================================
// Every file under lint-fixtures/kubejs is linted by name. A line that must be flagged says so itself:
//     code()                     // EXPECT RULE          (two rules, or one rule twice: // EXPECT RULE RULE)
//     /* EXPECT+2 RULE */                                 the rule is expected two lines further down
// and the lint must report EXACTLY those (line, rule) pairs for the file: a missing flag fails (the rule
// is gone or blind), an extra flag fails (the rule says more than it should). The fixtures sit under a
// folder named kubejs so that the lint keys them 'server_scripts/<name>.js' like a real script.
function partFixtures() {
  const root = path.join(__dirname, 'lint-fixtures', 'kubejs');
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) files.push(p);
    }
  })(root);
  files.sort();
  check('fixtures: there are fixtures (' + files.length + ')', files.length >= 11, 'no fixture found under ' + root);
  const r = runLint(LINT, files);
  const got = {};       // key -> ['line RULE', ...]
  for (const line of r.out.split(/\r?\n/)) {
    const m = /^\s*(\S+):(\d+)\t([A-Z][A-Z0-9-]+)\t/.exec(line);
    if (!m || m[2] === '0') continue;
    (got[m[1]] = got[m[1]] || []).push(m[2] + ' ' + m[3]);
  }
  const seenRules = new Set();
  for (const f of files) {
    const key = f.split(path.sep).join('/').split('/kubejs/')[1];
    const want = [];
    const src = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    src.forEach((text, i) => {
      let m = /\/\/ EXPECT ((?:[A-Z][A-Z0-9-]+[ ,]*)+)\s*$/.exec(text);
      if (m) for (const rule of m[1].split(/[ ,]+/).filter(Boolean)) want.push((i + 1) + ' ' + rule);
      m = /\/\* EXPECT\+(\d+) ([A-Z][A-Z0-9-]+) \*\//.exec(text);
      if (m) want.push((i + 1 + Number(m[1])) + ' ' + m[2]);
    });
    for (const w of want) seenRules.add(w.split(' ')[1]);
    const have = (got[key] || []).slice().sort(), need = want.slice().sort();
    const missing = need.filter(x => have.indexOf(x) < 0), extra = have.filter(x => need.indexOf(x) < 0);
    // a rule expected twice on one line: the counts must agree too
    const sameCount = have.length === need.length;
    check('fixtures: ' + key + ' (' + need.length + ' expected flag(s))', !missing.length && !extra.length && sameCount,
      missing.map(x => 'NOT FLAGGED   line ' + x + '   ' + (src[Number(x.split(' ')[0]) - 1] || '').trim().slice(0, 90) + '\n').join('') +
      extra.map(x => 'FLAGGED, not expected   line ' + x + '   ' + (src[Number(x.split(' ')[0]) - 1] || '').trim().slice(0, 90) + '\n').join('') +
      (sameCount ? '' : have.length + ' flag(s) reported, ' + need.length + ' expected\n'));
  }
  // every rule of 2026-10-13 has a fixture that expects it
  const RULES = ['FILE-PROPERTY', 'LOOP-CLOSURE', 'CHARCODEAT', 'ID-SET', 'NO-SUCH-MEMBER', 'ENTITY-TYPE', 'TICKCOUNT-SAVED', 'BLOCK-READ', 'DIRECT-HURT-REG', 'HELPER-COPY'];
  const without = RULES.filter(x => !seenRules.has(x));
  check('fixtures: each of the ' + RULES.length + ' rules is expected by a fixture', without.length === 0, 'no fixture expects: ' + without.join(', '));
}

// =====================================================================================================
// PART known-false
// =====================================================================================================
// NO-SUCH-MEMBER claims "this member does not exist on the engine". The engine suite is what knows:
// dev/engine-tests/truth/known-false.json, verified against the recorded member tables on every run.
// Every member the rule names must be an entry there (verified-on-engine), so the lint cannot assert a
// name the engine suite does not hold; if an engine update makes a name real, that suite fails, the entry
// goes, and this check then fails until the rule goes too.
function partKnownFalse() {
  const table = JSON.parse(fs.readFileSync(path.join(__dirname, 'engine-tests', 'truth', 'known-false.json'), 'utf8')).entries;
  const src = fs.readFileSync(LINT, 'utf8');
  const named = [];
  const rx = /noSuch\(node, (?:'([^']+)'|null), '([^']+)'/g;
  let m;
  while ((m = rx.exec(src)) !== null) named.push({ type: m[1] || null, member: m[2] });
  check('known-false: the rule names members (' + named.length + ')', named.length >= 12, 'found ' + named.length + ' noSuch(..) sites in the lint');
  for (const n of named) {
    const e = table.find(x => n.type ? (x.type === n.type && x.member === n.member) : (!x.type && x.member === n.member));
    check('known-false: ' + (n.type ? n.type.split('.').pop() + '.' : '') + n.member + ' is verified absent on the engine',
      !!e && e.status === 'verified-on-engine', e ? 'its status is ' + e.status : 'no such entry in known-false.json');
  }
}

// =====================================================================================================
// PART rule-ratchet
// =====================================================================================================
// The per-rule counts (lint_kubejs_traps.ratchet.json) in a temporary tree: a file at its count is clean,
// one site more flags every site, a file that is not listed may hold none, --ratchet-down only lowers,
// --ratchet-start works once, and --ratchet-base lets a rule START but not rise.
function partRuleRatchet() {
  const DEV = '.minecraft/dev/';
  const RULES = DEV + 'lint_kubejs_traps.ratchet.json';
  const SCRIPT = '.minecraft/kubejs/server_scripts/';
  const rulesFile = (rules) => JSON.stringify({ comment: 'test', rules: Object.fromEntries(Object.entries(rules).map(([r, f]) => [r, { started: 'test', total: 0, files: f }])) }, null, 2) + '\n';
  const TWO_SETS = "var a = new Set(['x'])\nvar b = new Set(['y'])\n";
  const ONE_SET = "var a = new Set(['x'])\n";
  let git;
  const mk = (withRulesFile) => {
    const root = tmpDir('rules');
    git = (...a) => execFileSync('git', ['-C', root].concat(a), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    git('init', '-q');
    git('config', 'user.email', 'lint-test@example.invalid');
    git('config', 'user.name', 'lint test');
    git('config', 'core.autocrlf', 'false');
    git('config', 'commit.gpgsign', 'false');
    write(root, DEV + 'lint_kubejs_traps.js', fs.readFileSync(LINT));
    write(root, DEV + 'lint_kubejs_traps.exceptions.json', '{ "exceptions": [] }\n');
    write(root, DEV + 'lint_kubejs_traps.silent_catches.json', '{ "files": {} }\n');
    if (withRulesFile) write(root, RULES, rulesFile({ 'ID-SET': { 'server_scripts/a.js': 2 } }));
    write(root, SCRIPT + 'a.js', TWO_SETS);
    write(root, SCRIPT + 'b.js', '// clean\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    return root;
  };
  const lintOf = (root) => path.join(root, DEV, 'lint_kubejs_traps.js');
  const CASES = [
    ['a file at its count is clean', true, () => [], 0, ['ID-SET 2 grandfathered', '0 flag(s)'], ['\tID-SET\t']],
    ['one site more: every site of the file is shown', true, (root) => { write(root, SCRIPT + 'a.js', TWO_SETS + ONE_SET); return []; }, 1,
      ['server_scripts/a.js:1\tID-SET', 'server_scripts/a.js:3\tID-SET', '3 site(s) in this file, 2 grandfathered'], []],
    ['a file that is not listed may hold none', true, (root) => { write(root, SCRIPT + 'b.js', ONE_SET); return []; }, 1,
      ['server_scripts/b.js:1\tID-SET', 'none is grandfathered'], ['server_scripts/a.js:1\tID-SET']],
    ['no counts file: the rule is strict', false, () => [], 1, ['server_scripts/a.js:1\tID-SET', 'none is grandfathered'], []],
    ['a site fixed: clean, and the summary says the count can go down', true, (root) => { write(root, SCRIPT + 'a.js', ONE_SET); return []; }, 0,
      ['ID-SET 1 grandfathered', '1 fewer than recorded'], []],
    ['--ratchet-down lowers the count', true, (root) => { write(root, SCRIPT + 'a.js', ONE_SET); return ['--ratchet-down']; }, 0, ['rule ratchet lowered: 2 -> 1'], []],
    ['--ratchet-down never raises', true, (root) => { write(root, SCRIPT + 'a.js', TWO_SETS + ONE_SET); return ['--ratchet-down']; }, 1, ['rule ratchet lowered: 2 -> 2', '3 site(s) in this file, 2 grandfathered'], []],
    ['--ratchet-start gives a rule its first counts', false, () => ['--ratchet-start=ID-SET'], 0, ['ID-SET starts: 2 site(s) grandfathered in 1 file(s)'], []],
    ['--ratchet-start refuses a rule that has its counts', true, () => ['--ratchet-start=ID-SET'], 2, ['already has its counts'], []],
    ['--ratchet-start refuses a rule that is not ratcheted', true, () => ['--ratchet-start=CHARCODEAT'], 2, ['not a ratcheted rule'], []],
    ['--ratchet-base: a rule that STARTS in this push passes, and is named', false, (root) => {
      write(root, RULES, rulesFile({ 'ID-SET': { 'server_scripts/a.js': 2 } })); return ['--ratchet-base=HEAD'];
    }, 0, ['nothing to compare'], ['RATCHET-RAISED']],
    ['--ratchet-base: a second rule starts next to one that exists', true, (root) => {
      write(root, RULES, rulesFile({ 'ID-SET': { 'server_scripts/a.js': 2 }, 'ENTITY-TYPE': { 'server_scripts/b.js': 4 } })); return ['--ratchet-base=HEAD'];
    }, 0, ['rule ENTITY-TYPE is not in HEAD: it starts in this push, with 4 grandfathered'], ['RATCHET-RAISED']],
    ['--ratchet-base: a count of an existing rule raised', true, (root) => {
      write(root, RULES, rulesFile({ 'ID-SET': { 'server_scripts/a.js': 3 } })); return ['--ratchet-base=HEAD'];
    }, 1, ['server_scripts/a.js:0\tRATCHET-RAISED\tID-SET', '2 -> 3'], []],
    ['--ratchet-base: a file added to an existing rule', true, (root) => {
      write(root, RULES, rulesFile({ 'ID-SET': { 'server_scripts/a.js': 2, 'server_scripts/b.js': 1 } })); return ['--ratchet-base=HEAD'];
    }, 1, ['server_scripts/b.js:0\tRATCHET-RAISED\tID-SET', '0 -> 1'], ['server_scripts/a.js:0']],
    ['--ratchet-base: a count lowered', true, (root) => {
      write(root, RULES, rulesFile({ 'ID-SET': { 'server_scripts/a.js': 1 } })); return ['--ratchet-base=HEAD'];
    }, 0, ['0 flag(s)'], ['RATCHET-RAISED']],
    ['--ratchet-base: the same count under ANOTHER rule is not a move', true, (root) => {
      write(root, RULES, rulesFile({ 'ID-SET': { 'server_scripts/b.js': 2 } })); return ['--ratchet-base=HEAD'];
    }, 1, ['server_scripts/b.js:0\tRATCHET-RAISED\tID-SET'], []],
  ];
  for (const [name, withFile, change, wantCode, want, wantNot] of CASES) {
    const root = mk(withFile);
    let r;
    try { r = runLint(lintOf(root), change(root) || [], root); } finally { rmrf(root); }
    const missing = want.filter(w => r.out.indexOf(w) < 0), present = wantNot.filter(w => r.out.indexOf(w) >= 0);
    check('rule-ratchet: ' + name + ' (exit ' + r.code + ')', r.code === wantCode && !missing.length && !present.length,
      (r.code !== wantCode ? 'wanted exit ' + wantCode + '\n' : '') + missing.map(w => 'the output does not hold: ' + w + '\n').join('') +
      present.map(w => 'the output must not hold: ' + w + '\n').join('') + r.out);
  }
}

// =====================================================================================================
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); }
catch (e) { console.error('[trap-lint test] CANNOT RUN: git is not on PATH (' + e.message + ')'); process.exit(2); }
if (wanted('fixtures')) partFixtures();
if (wanted('known-false')) partKnownFalse();
if (wanted('rule-ratchet')) partRuleRatchet();
if (wanted('ratchet-base')) partRatchetBase();
console.log('\n[trap-lint test] ' + cases + ' case(s), ' + bad + ' failed');
process.exit(bad ? 1 : 0);
