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
// PART git-env        the test's temporary repositories when GIT_DIR is set, as in a hook (see the note below)
// PART ratchet-base   `--ratchet-base=<ref>` in a temporary git repository: a grandfathered count that is
//                     raised by hand, a file that appears with a count, a deleted counts file are flagged; a
//                     lowered count, an untouched file and a script that MOVED with its count are not.
//
// Nothing in the real tree is touched: every case runs on a copy in a temporary folder.
//
// THE TEMPORARY REPOSITORIES AND A GIT HOOK (2026-10-13, it happened once). Git runs a hook with GIT_DIR set to
// the repository being pushed. A child `git -C <temp folder> ...` obeys GIT_DIR, not -C: the first run of this
// test from the real pre-push hook did `git init` and four `git config` writes on the REAL clone (core.bare =
// true, a test identity, autocrlf, gpgsign) and broke git for every worktree of it until the config was put back
// by hand. Three things keep that from happening again, each enough alone:
//   1. every child process is started without git's repository variables (CLEAN_ENV: the list
//      `git rev-parse --local-env-vars` prints);
//   2. newRepo() asks git where the repository it just made IS and stops unless that is inside the temp folder;
//   3. nothing is written with `git config`: identity and settings are -c options of the one commit.
// PART git-env proves 1 and 2 with GIT_DIR pointed at a second throwaway repository, never at a real one.
// Run by the pre-push hook when the lint, this test or a fixture changes (install-hooks.ps1, the block
// "Lint ratchets against the base commit") and by the `KubeJS script checks` Action.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const LINT = path.join(__dirname, 'lint_kubejs_traps.js');
const only = process.argv.slice(2);
const wanted = (part) => only.length === 0 || only.some(w => part.indexOf(w) >= 0);

// git's own list of the variables that tie a process to one repository (git rev-parse --local-env-vars)
const GIT_REPO_VARS = ['GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT', 'GIT_OBJECT_DIRECTORY',
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_IMPLICIT_WORK_TREE', 'GIT_GRAFT_FILE', 'GIT_INDEX_FILE', 'GIT_NO_REPLACE_OBJECTS', 'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX', 'GIT_SHALLOW_FILE', 'GIT_COMMON_DIR', 'GIT_INTERNAL_SUPER_PREFIX', 'GIT_NAMESPACE', 'GIT_CEILING_DIRECTORIES'];
function cleanEnv(from) {
  const e = Object.assign({}, from || process.env);
  for (const k of Object.keys(e)) if (GIT_REPO_VARS.indexOf(k.toUpperCase()) >= 0 || /^GIT_CONFIG_(KEY|VALUE)_\d+$/i.test(k)) delete e[k];
  return e;
}
const CLEAN_ENV = cleanEnv();
// identity and settings of the test's commits, on the command line: never written to a config file
const COMMIT_OPTS = ['-c', 'user.email=lint-test@example.invalid', '-c', 'user.name=lint test', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false'];
const real = (p) => { try { return fs.realpathSync.native(p); } catch (e) { return path.resolve(p); } };
// A new repository in `root`, and a function that runs git in it. Stops BEFORE anything is written when the
// repository git works on is not inside `root`.
function newRepo(root, env) {
  const run = (...a) => execFileSync('git', ['-C', root].concat(a), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: env || CLEAN_ENV });
  run('init', '-q');
  const gitDir = real(run('rev-parse', '--absolute-git-dir').trim());
  const inside = path.relative(real(root), gitDir);
  if (inside === '' || inside.startsWith('..') || path.isAbsolute(inside))
    throw new Error('REFUSING TO GO ON: git in ' + root + ' works on ' + gitDir + ', which is not inside that folder. ' +
      'Something ties this process to another repository (GIT_DIR?); nothing was written to it by this test.');
  return run;
}
const commitAll = (git, message) => { git.apply(null, COMMIT_OPTS.concat(['add', '-A'])); git.apply(null, COMMIT_OPTS.concat(['commit', '-q', '-m', message])); };

let cases = 0, bad = 0;
function check(name, ok, detail) {
  cases++;
  if (ok) { console.log('ok    ' + name); return; }
  bad++;
  console.log('FAIL  ' + name);
  if (detail) console.log('      ' + String(detail).trim().split(/\r?\n/).slice(-14).join('\n      '));
}
function runLint(lint, args, cwd) {
  const r = spawnSync(process.execPath, ['--expose-internals', lint].concat(args), { cwd: cwd || path.dirname(lint), encoding: 'utf8', env: CLEAN_ENV });
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
    git = newRepo(root);
    write(root, DEV + 'lint_kubejs_traps.js', fs.readFileSync(LINT));
    write(root, DEV + 'lint_kubejs_traps.exceptions.json', '{ "exceptions": [] }\n');
    write(root, COUNTS, counts({ 'server_scripts/a.js': 2, 'server_scripts/sub/b.js': 1 }));
    write(root, '.minecraft/kubejs/server_scripts/a.js', '// a\n');
    write(root, '.minecraft/kubejs/server_scripts/sub/b.js', '// b\n');
    write(root, '.minecraft/kubejs/server_scripts/c.js', '// c\n');
    commitAll(git, 'base');
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
      git('rm', '-q', '--cached', COUNTS); git.apply(null, COMMIT_OPTS.concat(['commit', '-q', '-m', 'no counts file yet']));
      write(root, COUNTS, counts({ 'server_scripts/a.js': 9 }));
    }, 0, ['nothing to compare', '0 counts file(s) compared'], ['RATCHET-RAISED']],
    ['an unknown ref', () => ['--ratchet-base=no-such-ref'], 2, ['is not a commit of this clone'], []],
    ['--ratchet-head: the committed counts are judged, not the working tree', (root) => {
      write(root, COUNTS, counts({ 'server_scripts/a.js': 5, 'server_scripts/sub/b.js': 1 }));
      commitAll(git, 'raised');
      write(root, COUNTS, counts({ 'server_scripts/a.js': 2, 'server_scripts/sub/b.js': 1 }));   // put back in the tree only
      return ['--ratchet-base=HEAD~1', '--ratchet-head=HEAD'];
    }, 1, ['server_scripts/a.js:0\tRATCHET-RAISED', '2 -> 5'], []],
    ['--ratchet-head: a moved script is looked up in that commit', (root) => {
      git('mv', '.minecraft/kubejs/server_scripts/a.js', '.minecraft/kubejs/server_scripts/sub/a_moved.js');
      write(root, COUNTS, counts({ 'server_scripts/sub/a_moved.js': 2, 'server_scripts/sub/b.js': 1 }));
      commitAll(git, 'moved');
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
    git = newRepo(root);
    write(root, DEV + 'lint_kubejs_traps.js', fs.readFileSync(LINT));
    write(root, DEV + 'lint_kubejs_traps.exceptions.json', '{ "exceptions": [] }\n');
    write(root, DEV + 'lint_kubejs_traps.silent_catches.json', '{ "files": {} }\n');
    if (withRulesFile) write(root, RULES, rulesFile({ 'ID-SET': { 'server_scripts/a.js': 2 } }));
    write(root, SCRIPT + 'a.js', TWO_SETS);
    write(root, SCRIPT + 'b.js', '// clean\n');
    commitAll(git, 'base');
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
// PART git-env
// =====================================================================================================
// The hook environment, simulated: GIT_DIR points at a repository. Here it is a SECOND throwaway repository
// (the "decoy"), never a real one. With that variable set:
//   - newRepo() with the test's clean environment makes its repository in the temp folder and leaves the
//     decoy's config byte for byte as it was;
//   - newRepo() with the variable left in (what the first version of this test did) is REFUSED before a write;
//   - a whole part of this test, run as a child with the variable set, passes and leaves the decoy alone.
function partGitEnv() {
  const decoy = tmpDir('decoy'), work = tmpDir('work');
  try {
    execFileSync('git', ['-C', decoy, 'init', '-q'], { stdio: 'ignore', env: CLEAN_ENV });
    const decoyGit = path.join(decoy, '.git');
    const cfg = path.join(decoyGit, 'config');
    const before = fs.readFileSync(cfg, 'utf8');
    const hookEnv = Object.assign({}, CLEAN_ENV, { GIT_DIR: decoyGit, GIT_INDEX_FILE: path.join(decoyGit, 'index'), GIT_PREFIX: '' });
    check('git-env: the clean environment drops what a hook sets', cleanEnv(hookEnv).GIT_DIR === undefined && cleanEnv(hookEnv).GIT_INDEX_FILE === undefined && cleanEnv(hookEnv).PATH === hookEnv.PATH,
      JSON.stringify(Object.keys(cleanEnv(hookEnv)).filter(k => /^GIT_/.test(k))));
    // 1. the test's own way, while this very process has GIT_DIR set
    const saved = {};
    for (const k of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_PREFIX']) { saved[k] = process.env[k]; process.env[k] = hookEnv[k]; }
    let made = '', threw = '';
    try {
      const git = newRepo(work);
      write(work, 'a.txt', 'a\n');
      commitAll(git, 'in the temp repository');
      made = git('log', '--oneline').trim();
    } catch (e) { threw = String(e.message || e); }
    finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
    check('git-env: with GIT_DIR set, the test still commits into ITS temp repository', threw === '' && /in the temp repository/.test(made) && fs.existsSync(path.join(work, '.git')), threw || made);
    check('git-env: and the repository GIT_DIR names is untouched (config byte for byte, no commit)', fs.readFileSync(cfg, 'utf8') === before && !fs.existsSync(path.join(decoyGit, 'refs', 'heads', 'master')) && !fs.existsSync(path.join(decoyGit, 'refs', 'heads', 'main')),
      fs.readFileSync(cfg, 'utf8'));
    // 2. the old way (the variable reaches git): refused before any write
    const work2 = tmpDir('work2');
    let refused = '';
    try { newRepo(work2, hookEnv); } catch (e) { refused = String(e.message || e); }
    rmrf(work2);
    check('git-env: a repository that is NOT in the temp folder is refused', refused.indexOf('REFUSING TO GO ON') === 0, refused || 'newRepo did not throw');
    // (git init itself, run with GIT_DIR set, re-initialises the decoy: that one write is git's, made before the
    // guard can look. It is why rule 1 exists; the guard is the backstop that stops everything after it.)
    const afterRefusal = fs.readFileSync(cfg, 'utf8');
    check('git-env: after the refusal the decoy carries no test identity', !/lint-test@example\.invalid|lint test/.test(afterRefusal), afterRefusal);
    // 3. a whole part of this test as a child process in the hook environment
    fs.writeFileSync(cfg, before);
    const child = spawnSync(process.execPath, [__filename, 'ratchet-base'], { encoding: 'utf8', env: hookEnv });
    check('git-env: PART ratchet-base passes when the test is started with GIT_DIR set (exit ' + child.status + ')', child.status === 0 && /16 case\(s\), 0 failed/.test(child.stdout || ''),
      ((child.stdout || '') + (child.stderr || '')).split(/\r?\n/).filter(l => !/^ok /.test(l)).slice(-12).join('\n'));
    check('git-env: and the decoy config is still byte for byte what it was', fs.readFileSync(cfg, 'utf8') === before, fs.readFileSync(cfg, 'utf8'));
    // 4. the lint's own --ratchet-base, started the way a hook of ITS repository starts it: GIT_DIR names the
    //    repository, the process sits somewhere inside it. A raised count must still be found. (With the
    //    variable left in, git answered an empty prefix, the counts file read as "not in the base", and the
    //    comparison passed without comparing: the first real hook run, 2026-10-13.)
    const repo = tmpDir('hookrepo');
    try {
      const DEV = '.minecraft/dev/';
      const counts = (n) => JSON.stringify({ files: { 'server_scripts/a.js': { count: n, ids: [] } } }) + '\n';
      const git = newRepo(repo);
      write(repo, DEV + 'lint_kubejs_traps.js', fs.readFileSync(LINT));
      write(repo, DEV + 'lint_kubejs_traps.exceptions.json', '{ "exceptions": [] }\n');
      write(repo, DEV + 'lint_kubejs_traps.silent_catches.json', counts(2));
      write(repo, '.minecraft/kubejs/server_scripts/a.js', '// a\n');
      commitAll(git, 'base');
      write(repo, DEV + 'lint_kubejs_traps.silent_catches.json', counts(3));
      commitAll(git, 'raised');
      const inHook = Object.assign({}, CLEAN_ENV, { GIT_DIR: path.join(repo, '.git'), GIT_INDEX_FILE: path.join(repo, '.git', 'index'), GIT_PREFIX: '' });
      const r = spawnSync(process.execPath, ['--expose-internals', path.join(repo, DEV, 'lint_kubejs_traps.js'), '--ratchet-base=HEAD~1', '--ratchet-head=HEAD'],
        { cwd: repo, encoding: 'utf8', env: inHook });
      const out = (r.stdout || '') + (r.stderr || '');
      check('git-env: --ratchet-base still compares when it is started from a hook (GIT_DIR set): a raised count is flagged (exit ' + r.status + ')',
        r.status === 1 && out.indexOf('server_scripts/a.js:0\tRATCHET-RAISED') >= 0 && out.indexOf('1 counts file(s) compared') >= 0 && out.indexOf('lint_kubejs_traps.silent_catches.json: 2 -> 3') >= 0, out);
      // and a lint that cannot find itself under the path it worked out says so instead of passing
      fs.mkdirSync(path.join(repo, 'elsewhere'), { recursive: true });
      for (const f of ['lint_kubejs_traps.js', 'lint_kubejs_traps.exceptions.json', 'lint_kubejs_traps.silent_catches.json'])
        fs.copyFileSync(path.join(repo, DEV, f), path.join(repo, 'elsewhere', f));
      write(repo, 'kubejs/server_scripts/a.js', '// a\n');
      const lost = spawnSync(process.execPath, ['--expose-internals', path.join(repo, 'elsewhere', 'lint_kubejs_traps.js'), '--ratchet-base=HEAD~1', '--ratchet-head=HEAD'],
        { cwd: repo, encoding: 'utf8', env: CLEAN_ENV });
      check('git-env: a lint that is not in the commit it judges cannot run (exit ' + lost.status + '), it does not pass',
        lost.status === 2 && ((lost.stdout || '') + (lost.stderr || '')).indexOf('CANNOT RUN') >= 0, (lost.stdout || '') + (lost.stderr || ''));
    } finally { rmrf(repo); }
  } finally { rmrf(decoy); rmrf(work); }
}

// =====================================================================================================
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); }
catch (e) { console.error('[trap-lint test] CANNOT RUN: git is not on PATH (' + e.message + ')'); process.exit(2); }
if (wanted('fixtures')) partFixtures();
if (wanted('known-false')) partKnownFalse();
if (wanted('rule-ratchet')) partRuleRatchet();
if (wanted('ratchet-base')) partRatchetBase();
if (wanted('git-env')) partGitEnv();
console.log('\n[trap-lint test] ' + cases + ' case(s), ' + bad + ' failed');
process.exit(bad ? 1 : 0);
