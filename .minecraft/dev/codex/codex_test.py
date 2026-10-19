#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests of the Codex generator and its gate (dev/codex), on a small pack built in a temporary folder.

    python .minecraft/dev/codex/codex_test.py          # CI: .github/workflows/codex.yml

The fixture is a .minecraft tree with two bosses, a miniboss and three dimensions, the script lines the facts are
read from, a names table, a registry snapshot and a book of one category and two entries that use placeholders
and generated pages. Each test changes one source the way a content chip would and asserts what the gate says.
No git repository is made (the gate reads the working tree).
"""
import contextlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
import zipfile

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import codex           # noqa: E402
import codex_facts as cf   # noqa: E402
import codex_fit as cfit   # noqa: E402
import codex_jar as cj     # noqa: E402
import codex_render as cr  # noqa: E402

REAL_MC = os.path.dirname(os.path.dirname(HERE))
CLASS_SRC = os.path.join(REAL_MC, cj.SOURCE, cj.CLASS)

BOSSES = {
    'about': ['fixture'], 'schema': 1, 'switches': {'perKill': {'on': True, 'why': 'fixture'}},
    'bosses': {
        'testmod:gob': {'tier': 1, 'kind': 'named', 'flags': ['boss', 'x3'], 'hp': 200, 'rush': 1,
                        'arena': {'key': 'testmod_gob', 'display': 'Gob', 'tier': 1, 'dimension': 'minecraft:overworld',
                                  'structure': 'testmod:court_of_gnomes', 'waystone': "Gob's Court"}},
        'testmod:thunker': {'tier': 2, 'kind': 'miniboss', 'flags': ['boss'], 'rush': 2,
                            'arena': {'key': 'testmod_thunker', 'display': 'Thunker', 'tier': 2,
                                      'dimension': 'testmod:deep', 'structure': 'testmod:chthonic_dungeon',
                                      'waystone': 'Chthonic Dungeon (Thunker)'}},
        'testmod:merlin': {'tier': 2, 'kind': 'named', 'flags': ['boss', 'x3'], 'rush': 2,
                           'arena': {'key': 'testmod_merlin', 'display': 'Merlin', 'tier': 2,
                                     'dimension': 'testmod:deep', 'structure': 'testmod:chthonic_cathedral',
                                     'waystone': 'Chthonic Cathedral (Merlin)'}},
    }}
DIMS = {
    'about': ['fixture'], 'schema': 1,
    'dimensions': {
        'minecraft:overworld': {'tier': 1, 'flags': ['loot'], 'deathPenalty': 0.1},
        'testmod:deep': {'tier': 2, 'flags': ['loot'], 'stageGate': 'modpack/dim_deep', 'deathPenalty': 0.14},
        'testmod:moon': {'tier': 4, 'stageGate': 'modpack/dim_moon', 'deathPenalty': 0.22},
    }}
NAMES = {
    'about': ['fixture'], 'schema': 1,
    'bosses': {'testmod:gob': {'name': 'Gob, King of Gnomes', 'match': ['Gob']},
               'testmod:thunker': {'name': 'Thunker', 'match': ['Thunker']},
               'testmod:merlin': {'name': 'Enchanter Merlin', 'match': ['Merlin']}},
    'dimensions': {'minecraft:overworld': {'name': 'the Overworld', 'match': ['Overworld']},
                   'testmod:deep': {'name': 'the Deep', 'match': ['Deep']},
                   'testmod:moon': {'name': 'the Moon', 'match': ['the Moon']}},
    'items': {'testmod:gob_sword': {'name': 'Gob Sword'}, 'testmod:merlin_bow': {'name': 'Merlin Bow'}},
    'structures': {},
}
DIFFICULTY = '''[tiers]
\t[tiers.t1]
\t\tstartPct = 150.0
\t\tcapPct = 300.0
\t\tcapHours = 100.0
\t\tdamageMultiplierPct = 130.0
\t[tiers.t2]
\t\tstartPct = 200.0
\t\tcapPct = 350.0
\t\tcapHours = 100.0
\t\tdamageMultiplierPct = 130.0
\t[tiers.t3]
\t\tstartPct = 300.0
\t\tcapPct = 450.0
\t\tcapHours = 100.0
\t\tdamageMultiplierPct = 130.0
\t[tiers.t4]
\t\tstartPct = 600.0
\t\tcapPct = 1000.0
\t\tcapHours = 200.0
\t\tdamageMultiplierPct = 130.0
[dimensions]
\tt1 = ["minecraft:overworld"]
\tt2 = ["testmod:deep"]
\tt3 = []
\tt4 = ["testmod:moon"]
\tuncapAfterEnderDragon = []
'''
SCRIPTS = {
    cf.RUSH_SCRIPT: "var BOSS_RUSH_TIERS = {\n  1: { pct: 0.80, grantsStage: 'tier_2' },\n  2: { pct: 0.90, grantsStage: 'tier_3' },\n"
                    "  3: { pct: 1.00, grantsStage: 'tier_4' },\n}\n",
    cf.ENGINE_SCRIPT: "  1: { item: 'icraft:progression_token_t1', threshold: 500,  grantsStage: 'tier_2' },\n"
                      "  2: { item: 'icraft:progression_token_t2', threshold: 1000, grantsStage: 'tier_3' },\n"
                      "  3: { item: 'icraft:progression_token_t3', threshold: 2000, grantsStage: 'tier_4' },\n",
    cf.KILLS_SCRIPT: "const EXPLORE_MINIBOSS_TOKENS   = { 1: 2,  2: 4,  3: 6,  4: 8  }\n"
                     "const EXPLORE_BOSS_FIRST_TOKENS = { 1: 10, 2: 15, 3: 20, 4: 25 }\n"
                     "const EXPLORE_BOSS_REPEAT_TOKENS= { 1: 4,  2: 8,  3: 12, 4: 16 }\n"
                     "const EXPLORE_TOKEN_ITEM = {\n  1: 'icraft:progression_token_t1',\n  2: 'icraft:progression_token_t2',\n"
                     "  3: 'icraft:progression_token_t3',\n  4: 'icraft:progression_token_t3',\n}\n"
                     "const EXPLORE_DIM_ENTRY_BONUS = 20\n",
    cf.DEATH_SCRIPT: "const DEFAULT_LOSS = 0.15\n",
    cf.X3_SCRIPT: "const BOSS_3X_HP_MULT         = 3.0\n",
    cf.UNIQUE_SCRIPT: "global.ICRAFT_UNIQUE_DROP_CHANCE = 0.15\nglobal.ICRAFT_UNIQUE_ITEMS = {\n"
                      "  // a comment\n"
                      "  'testmod:gob_sword': { tier: 1, kind: 'sword', boss: 'testmod:gob', addDrop: true },\n"
                      "  'testmod:merlin_bow': { tier: 2, kind: 'bow', boss: null, addDrop: false },\n}\n",
    cf.LOOT_SCRIPT: 'global.icraftEntityMod(event, "testmod:merlin")\n'
                    '  .addLoot(LootEntry.of("testmod:merlin_bow").when(c => c.randomChance(0.20)))\n',
}
REGISTRY_LISTS = {
    'items.txt': ['minecraft:diamond', 'testmod:gob_sword', 'testmod:merlin_bow'],
    'entity_types.txt': ['testmod:gob', 'testmod:thunker', 'testmod:merlin'],
    'dimensions.txt': ['minecraft:overworld', 'testmod:deep', 'testmod:moon'],
    'attributes.txt': ['testmod:spell_power'],
}
BOOK = {
    'book.json': {'name': 'Fixture Codex', 'landing_text': 'Climb to $(t2)Tier 2$().', 'use_resource_pack': True,
                  'macros': {'$(t1)': '$(#2d8a2d)', '$(t2)': '$(#2d5fa3)', '$(t3)': '$(#7a2da3)', '$(t4)': '$(#c8a951)'}},
    'en_us/categories/bosses.json': {'name': 'Bosses', 'description': 'Who to fight.', 'icon': 'minecraft:diamond'},
    'en_us/entries/bosses/t1_bosses.json': {
        'name': 'Tier 1 Bosses', 'icon': 'minecraft:diamond', 'category': 'icraft:bosses', 'pages': [
            {'type': 'patchouli:text', 'text': 'Hunt $(bold){{boss testmod:gob name}}$() at {{boss testmod:gob where}}: '
                                               '{{boss testmod:gob health}} health. Clear {{tier 1 rushpct}} of the rush.'},
            {'type': 'icraft:generated', 'generator': 'boss_roster', 'tier': 1},
        ]},
    'en_us/entries/progression/dims.json': {
        'name': 'Dimensions', 'icon': 'minecraft:diamond', 'category': 'icraft:bosses', 'pages': [
            {'type': 'patchouli:text', 'title': 'The Deep', 'text': 'Death penalty: {{dim testmod:deep death}}. '
                                                                    'Mobs: {{dim testmod:deep difficulty}}. Opens at {{dim testmod:deep gate}}.'},
            {'type': 'icraft:generated', 'generator': 'dimension_glance', 'tier': 2},
            {'type': 'icraft:generated', 'generator': 'unique_list', 'tier': 2},
            {'type': 'icraft:generated', 'generator': 'rush_targets'},
            {'type': 'patchouli:text', 'title': 'Classes', 'text': 'Pick one of {{layer class count}} classes '
                                                                   '({{layer race word}} race, {{layer origin Word}} origins).'},
        ]},
}
# the Origins layers of the fixture's origins jar (mods/iridescent_origins-1.0.0.jar)
LAYERS = {'origin': ['testmod:o1', 'testmod:o2'], 'race': ['testmod:r1'], 'class': ['testmod:c1', 'testmod:c2', 'testmod:c3']}
ORIGINS_JAR = 'mods/iridescent_origins-1.0.0.jar'


def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mode = 'wb' if isinstance(content, bytes) else 'w'
    with open(path, mode, **({} if mode == 'wb' else {'encoding': 'utf-8', 'newline': '\n'})) as f:
        f.write(content)


def origins_jar(layers, replace=True):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        for name, ids in layers.items():
            z.writestr(cf.LAYER_DIR + name + '.json', json.dumps({'order': 0, 'replace': replace, 'enabled': True, 'origins': ids}))
    return buf.getvalue()


def make_fixture(root):
    mc = os.path.join(root, '.minecraft')
    write(os.path.join(mc, ORIGINS_JAR), origins_jar(LAYERS))
    write(os.path.join(mc, cf.REGISTRY_BOSSES), json.dumps(BOSSES, indent=1))
    write(os.path.join(mc, cf.REGISTRY_DIMS), json.dumps(DIMS, indent=1))
    write(os.path.join(mc, cf.NAMES), json.dumps(NAMES, indent=1))
    write(os.path.join(mc, cf.DIFFICULTY), DIFFICULTY)
    for rel, text in SCRIPTS.items():
        write(os.path.join(mc, rel), text)
    for fn, ids in REGISTRY_LISTS.items():
        write(os.path.join(mc, 'dev', 'registry', fn), '\n'.join(ids) + '\n')
    src = os.path.join(mc, cj.SOURCE)
    for rel, obj in BOOK.items():
        write(os.path.join(src, cj.BOOK, rel), json.dumps(obj, indent=2))
    write(os.path.join(src, 'pack.mcmeta'), '{"pack": {"pack_format": 15, "description": "fixture"}}\n')
    write(os.path.join(src, 'META-INF', 'mods.toml'), 'modLoader="javafml"\n')
    with open(CLASS_SRC, 'rb') as f:
        write(os.path.join(src, cj.CLASS), f.read())
    shutil.copy(os.path.join(REAL_MC, cj.SOURCE, 'style_codex.py'), os.path.join(src, 'style_codex.py'))
    release(mc)
    return mc


def release(mc):
    """what `codex.py release` leaves: the jar in three distros, the three manifests and markers carrying its hash"""
    jar = cj.build(mc, cf.load(mc))
    import hashlib
    h = hashlib.sha256(jar).hexdigest()
    for d in cj.DISTROS:
        write(os.path.join(mc, d, cj.JAR_NAME), jar)
        write(os.path.join(mc, d, '.index', cj.MARKER), "filename = '%s'\n\n[download]\nhash = '%s'\n" % (cj.JAR_NAME, h))
    for m in cj.MANIFESTS:
        write(os.path.join(mc, m), json.dumps({'jars': {cj.JAR_NAME: {'sha256': h, 'size': len(jar)}}}, indent=1))
    return jar


def run(mc, *args):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        rc = codex.main(['--mc', mc] + list(args))
    return rc, out.getvalue()


def edit_json(mc, rel, fn):
    p = os.path.join(mc, rel)
    with open(p, encoding='utf-8') as f:
        d = json.load(f)
    fn(d)
    write(p, json.dumps(d, indent=1))


class CodexTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='codex-test-')
        self.mc = make_fixture(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def check(self):
        return run(self.mc, 'check', '--no-validate')

    def page_text(self, entry):
        with zipfile.ZipFile(os.path.join(self.mc, 'mods', cj.JAR_NAME)) as z:
            d = json.loads(z.read('%s/en_us/entries/%s.json' % (cj.ASSETS, entry)).decode('utf-8'))
        return [p.get('text', '') for p in d['pages']]

    # ---- the fresh fixture --------------------------------------------------------------------------------
    def test_fresh_fixture_is_current(self):
        rc, out = self.check()
        self.assertEqual(rc, 0, out)
        self.assertIn('[codex] OK', out)

    def test_placeholders_and_generated_pages_are_filled(self):
        pages = self.page_text('bosses/t1_bosses')
        self.assertIn("Gob, King of Gnomes$() at Gob's Court, the Overworld: 600 health. Clear 80% of the rush.", pages[0])
        self.assertTrue(any('Codex Token I:' in p and 'Gob, King of Gnomes' in p for p in pages[1:]), pages)
        dims = self.page_text('progression/dims')
        self.assertIn('Death penalty: 14%. Mobs: 2x to 3.5x. Opens at Tier 2.', dims[0])
        self.assertTrue(any('$(bold)The Deep$(): opens at Tier 2; death costs 14% durability.' in p for p in dims), dims)
        self.assertTrue(any('$(bold)Enchanter Merlin$(): Merlin Bow (20%)' in p for p in dims), dims)
        self.assertTrue(any('Tier 2 to 3$(): 2 of the 2 bosses' in p or 'all of the 2 bosses' in p for p in dims), dims)
        with zipfile.ZipFile(os.path.join(self.mc, 'mods', cj.JAR_NAME)) as z:
            names = z.namelist()
            self.assertIsNone(z.testzip())
        self.assertIn('com/iridescentcraft/codex/IridescentCodex.class', names)
        self.assertIn('%s/book.json' % cj.BOOK, names)
        self.assertNotIn('%s/book.json' % cj.ASSETS, names)
        self.assertFalse(any('{{' in p for p in pages + dims))

    def test_build_is_deterministic(self):
        a = cj.build(self.mc, cf.load(self.mc))
        b = cj.build(self.mc, cf.load(self.mc))
        self.assertEqual(a, b)
        with zipfile.ZipFile(io.BytesIO(a)) as z:
            infos = z.infolist()
        self.assertTrue(all(i.compress_type == zipfile.ZIP_STORED and i.date_time == (2000, 1, 1, 0, 0, 0) for i in infos))
        self.assertEqual(infos[0].filename, 'META-INF/')

    # ---- a content change makes the book stale --------------------------------------------------------------
    def test_boss_tier_change_makes_the_jar_stale_until_release(self):
        edit_json(self.mc, cf.REGISTRY_BOSSES, lambda d: d['bosses']['testmod:gob'].update(tier=2, rush=2))
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('STALE .minecraft/mods/%s' % cj.JAR_NAME, out)
        self.assertIn('icraft:bosses/t1_bosses', out)
        self.assertIn('codex.py release', out)
        release(self.mc)
        rc, out = self.check()
        self.assertEqual(rc, 0, out)
        roster = ' '.join(self.page_text('bosses/t1_bosses')[1:])
        self.assertNotIn('Gob', roster)

    def test_dimension_gate_change_makes_the_jar_stale(self):
        edit_json(self.mc, cf.REGISTRY_DIMS, lambda d: d['dimensions']['testmod:deep'].pop('stageGate'))
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('icraft:progression/dims page', out)
        release(self.mc)
        self.assertIn('Opens at none.', self.page_text('progression/dims')[0])
        self.assertTrue(any('no lock of its own' in p for p in self.page_text('progression/dims')))

    def test_difficulty_change_reaches_the_book(self):
        p = os.path.join(self.mc, cf.DIFFICULTY)
        with open(p, encoding='utf-8') as f:
            text = f.read()
        write(p, text.replace('startPct = 200.0', 'startPct = 250.0'))
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        release(self.mc)
        self.assertIn('Mobs: 2.5x to 3.5x.', self.page_text('progression/dims')[0])

    def test_removed_boss_is_named_on_the_page_that_uses_it(self):
        edit_json(self.mc, cf.REGISTRY_BOSSES, lambda d: d['bosses'].pop('testmod:gob'))
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('icraft:bosses/t1_bosses page 1: names testmod:gob, which the boss registry does not have', out)
        self.assertIn('names.json names testmod:gob, which the registry no longer has', out)

    def test_new_boss_without_a_name_fails(self):
        edit_json(self.mc, cf.REGISTRY_BOSSES, lambda d: d['bosses'].update(
            {'testmod:newcomer': {'tier': 1, 'kind': 'miniboss', 'flags': ['boss'], 'rush': 1}}))
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('testmod:newcomer is in the registry but has no name', out)

    def test_script_constant_rewritten_cannot_run(self):
        write(os.path.join(self.mc, cf.DEATH_SCRIPT), 'let lossDefault = 0.15\n')
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('death_penalty.js: DEFAULT_LOSS not found', out)

    def test_unknown_placeholder_names_the_page(self):
        edit_json(self.mc, os.path.join(cj.SOURCE, cj.BOOK, 'en_us/entries/bosses/t1_bosses.json'),
                  lambda d: d['pages'][0].update(text='{{boss testmod:gob colour}}'))
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('icraft:bosses/t1_bosses page 1: unknown boss field "colour"', out)

    # ---- the hand-written text ----------------------------------------------------------------------------
    def set_text(self, text):
        edit_json(self.mc, os.path.join(cj.SOURCE, cj.BOOK, 'en_us/entries/progression/dims.json'),
                  lambda d: d['pages'].append({'type': 'patchouli:text', 'text': text}))

    def test_prose_names_a_wrong_tier(self):
        self.set_text('Tier 1 brings Merlin to your door.')
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('[TIER]', out)
        self.assertIn('puts Merlin at Tier 1; the boss registry has Enchanter Merlin at Tier 2', out)

    def test_prose_tier_from_the_entry_name(self):
        edit_json(self.mc, os.path.join(cj.SOURCE, cj.BOOK, 'en_us/entries/bosses/t1_bosses.json'),
                  lambda d: d['pages'].append({'type': 'patchouli:text', 'text': 'Then fight Thunker, a nasty one.'}))
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('puts Thunker at Tier 1', out)

    def test_prose_right_tier_passes(self):
        self.set_text('$(t1)Tier 1$() — Gob (Court of Gnomes); $(t2)Tier 2$() — Thunker (Chthonic Dungeon), Merlin.')
        rc, out = self.check()
        self.assertNotIn('[TIER]', out)
        self.assertNotIn('[PLACE]', out)

    def test_prose_names_a_wrong_place(self):
        self.set_text('$(t2)Tier 2$() — Thunker (Chthonic Cathedral).')
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('[PLACE] "Thunker (Chthonic Cathedral)": the registry\'s arena row puts Thunker at Chthonic Dungeon, the Deep', out)

    def test_prose_typed_facts(self):
        self.set_text('Difficulty: $(bold)7.0x$(). Death Penalty: 22%. Bank $(t1)500$() to advance; clear 80% of the bosses. 3,000 health.')
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        for words in ('"Difficulty: 7.0x"', '"Death Penalty: 22%"', '"Bank 500"', '"clear 80%"', '"3,000 health"'):
            self.assertIn(words, out)

    def test_layer_counts_follow_the_origins_jar(self):
        self.assertIn('Pick one of 3 classes (one race, Two origins).', self.page_text('progression/dims')[-1])
        layers = dict(LAYERS, **{'class': LAYERS['class'] + ['testmod:c4']})
        write(os.path.join(self.mc, ORIGINS_JAR), origins_jar(layers))
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('icraft:progression/dims page', out)
        release(self.mc)
        self.assertIn('Pick one of 4 classes', self.page_text('progression/dims')[-1])

    def test_layer_that_does_not_replace_cannot_be_counted(self):
        write(os.path.join(self.mc, ORIGINS_JAR), origins_jar(LAYERS, replace=False))
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('is not "replace": true', out)

    def test_layer_defined_again_by_a_datapack_fails(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as z:
            z.writestr(cf.LAYER_DIR + 'class.json', '{}')
        write(os.path.join(self.mc, 'config', 'paxi', 'datapacks', 'shadow.zip'), buf.getvalue())
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('config/paxi/datapacks/shadow.zip defines an Origins layer again', out)

    def test_prose_typed_layer_count(self):
        self.set_text('There are 13 classes and Eleven Races; the three trinity classes cast.')
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('"13 classes": a typed count of an Origins layer', out)
        self.assertIn('"Eleven Races": a typed count of an Origins layer', out)
        self.assertNotIn('"three', out)

    def test_prose_unknown_id(self):
        self.set_text('Raises testmod:spell_power and testmod:spell_powr.')
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('"testmod:spell_powr" is not an id the game registers', out)
        self.assertNotIn('"testmod:spell_power" is not', out)

    # ---- the release state ---------------------------------------------------------------------------------
    def test_manifest_out_of_step_fails(self):
        edit_json(self.mc, cj.MANIFESTS[1], lambda d: d['jars'][cj.JAR_NAME].update(sha256='0' * 64))
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('server_distribution/custom_jars_manifest.json lists %s' % cj.JAR_NAME, out)

    def test_marker_out_of_step_fails(self):
        write(os.path.join(self.mc, 'distribution/client/mods/.index', cj.MARKER), "hash = '%s'\n" % ('1' * 64))
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('distribution/client/mods/.index/%s carries hash' % cj.MARKER, out)

    def test_one_distro_jar_differs(self):
        write(os.path.join(self.mc, 'server_distribution/mods', cj.JAR_NAME), b'PK\x05\x06' + b'\0' * 18)
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('STALE .minecraft/server_distribution/mods/%s' % cj.JAR_NAME, out)
        self.assertNotIn('STALE .minecraft/mods/%s' % cj.JAR_NAME, out)

    # ---- page fit -----------------------------------------------------------------------------------------
    def test_generated_pages_fit_and_continue(self):
        blocks = ['$(li)$(bold)Boss number %d$(): a place, the Overworld; 1,000 health.' % i for i in range(30)]
        pages = cr.paginate('Long Roster', 'Intro text.', blocks, mc=self.mc)
        self.assertGreater(len(pages), 2)
        self.assertTrue(all(cr.count_lines(p['text'], self.mc) <= cr.page_room(False) for p in pages))
        self.assertEqual(pages[1]['title'], 'Long Roster, cont.')
        self.assertEqual(sum(p['text'].count('Boss number') for p in pages), 30)
        first = cr.paginate('Long Roster', 'Intro text.', blocks, first_page=True, mc=self.mc)
        self.assertLessEqual(cr.count_lines(first[0]['text'], self.mc), cr.page_room(True))
        self.assertLess(cr.page_room(True), cr.page_room(False))      # under the entry name: two lines fewer

    def test_generated_continuation_title_stays_on_the_page(self):
        self.assertEqual(cr.continued('Tier 3 at a Glance', 1), 'Tier 3 at a Glance, cont.')
        long_title = 'Every Boss of the Fourth Tier'
        self.assertFalse(cfit.title_fits(long_title + ', cont.'))
        self.assertTrue(cfit.title_fits(cr.continued(long_title, 1)) or cr.continued(long_title, 1) == long_title)

    def test_fit_fresh_fixture_fits(self):
        rc, out = self.check()
        self.assertEqual(rc, 0, out)
        self.assertIn('every page fits', out)

    def test_fit_overflowing_text_page_fails(self):
        long_text = ' '.join(['Every sentence on this page adds another line of plain text.'] * 12)
        edit_json(self.mc, os.path.join(cj.SOURCE, cj.BOOK, 'en_us/entries/progression/dims.json'),
                  lambda d: d['pages'][0].update({'text': long_text}))
        release(self.mc)
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('FIT icraft:progression/dims page 1:', out)
        self.assertIn('which holds 14', out)                         # the entry's first page, under its name
        self.assertIn('fit --show', out)

    def test_fit_landing_text_reaching_the_bar_fails(self):
        landing = 'Climb to $(t2)Tier 2$().' + '$(br2)Another paragraph of the landing page.' * 4
        edit_json(self.mc, os.path.join(cj.SOURCE, cj.BOOK, 'book.json'), lambda d: d.update({'landing_text': landing}))
        release(self.mc)
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertRegex(out, r'FIT book\.json landing text: 13 lines on the landing page \(the button row')
        self.assertIn('which holds 8', out)

    def test_fit_long_placeholder_fails(self):
        # the source page is short; the name the registry gives it is not
        name = 'Gob, ' + ', '.join('Lord of the Seventh Gnome Court of the Deep Ring %d' % i for i in range(12))
        edit_json(self.mc, cf.NAMES, lambda d: d['bosses']['testmod:gob'].update({'name': name}))
        release(self.mc)
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('FIT icraft:bosses/t1_bosses page 1:', out)

    def test_fit_title_wider_than_the_page_fails(self):
        edit_json(self.mc, os.path.join(cj.SOURCE, cj.BOOK, 'en_us/entries/progression/dims.json'),
                  lambda d: d['pages'][0].update({'title': 'A Title Far Too Wide For Any Page'}))
        release(self.mc)
        rc, out = self.check()
        self.assertEqual(rc, 1, out)
        self.assertIn('FIT icraft:progression/dims page 1 title: "A Title Far Too Wide For Any Page"', out)

    def test_fit_command_shows_a_page(self):
        rc, out = run(self.mc, 'fit', '--show', 'icraft:bosses/t1_bosses page 1')
        self.assertEqual(rc, 0, out)
        self.assertIn('icraft:bosses/t1_bosses page 1:', out)
        self.assertIn('y  22', out)


SUB = {'<EM>': chr(0x2014), '<EN>': chr(0x2013), '<NBSP>': chr(0xa0), '<SHY>': chr(0xad), '<SECT>': chr(0xa7),
       '<BULLET>': chr(0x2022)}


def u(s):
    for k, v in SUB.items():
        s = s.replace(k, v)
    return s


# the boundaries the JDK 17 line BreakIterator gives (recorded 2026-10-18 with BreakIterator.getLineInstance(new
# Locale("en_us")), the call Patchouli makes); codex_fit.java_line_breaks must give the same
JDK_LINE_BREAKS = [
    ("Hello world, this is a test.", [0, 6, 13, 18, 21, 23, 28]),
    ("build-up and T3-T4 or T3+ x", [0, 6, 9, 13, 16, 19, 22, 26, 27]),
    ("a <EM> b<EM>c", [0, 2, 4, 6, 7]),
    ("(note) [x] {y}", [0, 7, 11, 14]),
    ("50% 1,000 3.5x +30% 6x-10x", [0, 4, 10, 13, 15, 20, 23, 26]),
    ("<SECT>0<BULLET> item text", [0, 4, 9, 13]),
    ("end. Next", [0, 5, 9]),
    ("foo/bar and/or", [0, 8, 14]),
    ("it's \"quoted\" text", [0, 5, 14, 18]),
    ("e.g. this", [0, 2, 5, 9]),
    ("a  b", [0, 3, 4]),
    ("word:next; semi", [0, 5, 11, 15]),
    ("x!'y and !$x", [0, 5, 9, 12]),
    ("Tier 1 -- Gob", [0, 5, 7, 10, 13]),
    ("1<EN>2 and I<EN>II", [0, 2, 4, 8, 10, 12]),
    ("keep<NBSP>together here", [0, 14, 18]),
    ("x;'t A;'t", [0, 5, 9]),
    ("F\"x and \"q\"", [0, 2, 4, 8, 11]),
    ("{c}x and x{c}", [0, 3, 5, 9, 10, 13]),
    ("$5 and 5$ and $x", [0, 3, 7, 10, 14, 16]),
    ("x<SHY>y soft", [0, 2, 4, 8]),
    ("call() then (x)y", [0, 6, 7, 12, 15, 16]),
    ("50/50 odds, 1.5x, 12% to 14%", [0, 6, 12, 15, 18, 22, 25, 28]),
    ("Codex Token III: 1,000.", [0, 6, 12, 17, 23]),
    ("(T3+) \"Tier 2\" '(a)' x:y", [0, 6, 12, 15, 21, 23, 24]),
    ("A<EM>B, a <EM> b, 3<EN>4", [0, 2, 5, 7, 9, 12, 14, 15]),
]

# two pages as the game drew them (the operator's screenshots, 2026-10-18 18:50, client 1.20.1, Patchouli 85)
SEEN_LANDING_TEXT = ('$(bold)New here? Open $(l:icraft:welcome/first_hour)Your First Hour$(/l).$()$(br2)You climb four '
                     'tiers on banked tokens. Four lanes earn them <EM> build, cast, explore, or fight <EM> and any one '
                     'lane alone is enough.$(br2)$(note)Quest log: $(k:heracles.open_quests). Chapters unlock as you '
                     'tier up.$()')
SEEN_LANDING_LINES = ['New here? Open Your', 'First Hour.', '', 'You climb four tiers on banked',
                      'tokens. Four lanes earn them <EM>', 'build, cast, explore, or fight <EM>', 'and any one lane alone is',
                      'enough.', '', 'Quest log: U. Chapters unlock', 'as you tier up.']
SEEN_CATEGORY_TEXT = ('New here? Read this chapter in order. Your first hour, your character choice, and the three commands '
                      'that run your progression.')
SEEN_CATEGORY_LINES = ['New here? Read this chapter in', 'order. Your first hour, your', 'character choice, and the',
                       'three commands that run your', 'progression.']


class FitModelTest(unittest.TestCase):
    """codex_fit against what the game does: recorded JDK boundaries, two pages seen in game, the glyph widths"""

    def ctx(self):
        c = cfit.Context(macros={'$(note)': '$(#666666)'}, keybinds={'key.heracles.open_quests': 'key.keyboard.u'})
        return c

    def lines(self, text, top, limit):
        a = cfit.PageFit('test', u(text), top, limit, self.ctx(), 'test')
        return a, [l.rstrip() for l in a.layout.line_texts()]

    def test_line_breaks_match_the_jdk(self):
        for text, want in JDK_LINE_BREAKS:
            self.assertEqual(cfit.java_line_breaks(u(text)), want, text)

    def test_the_landing_page_as_seen_in_game(self):
        a, got = self.lines(SEEN_LANDING_TEXT, cfit.LANDING['top'], cfit.LANDING['limit'])
        self.assertEqual(got, [u(x) for x in SEEN_LANDING_LINES])
        self.assertEqual(a.capacity, 8)
        self.assertTrue(a.overflows)                    # "Quest log" ran into the buttons and the progress label

    def test_a_category_page_as_seen_in_game(self):
        a, got = self.lines(SEEN_CATEGORY_TEXT, cfit.CATEGORY['top'], cfit.CATEGORY['limit'])
        self.assertEqual(got, SEEN_CATEGORY_LINES)
        self.assertEqual(a.capacity, 10)

    def test_glyph_widths_from_the_game_font(self):
        f = cfit.fonts()
        self.assertEqual([f['uniform'].width(c) for c in ('a', 'i', ' ', 'm')], [4, 3, 4, 4])
        self.assertEqual(f['uniform'].width('aa', bold=True), 9)            # +0.5 a glyph, rounded up once
        self.assertEqual(f['uniform'].width(' ', bold=True), 5)             # a space +1
        self.assertEqual(f['uniform'].width(u('<SECT>0<BULLET>')), 3)       # a section code has no width
        self.assertEqual(f['default'].width('a'), 6)                       # titles: the bitmap font

    def test_bold_wraps_early(self):
        words = 'Read each chapter in order'
        plain, bold = self.lines(words, 12, cfit.PAGE_LIMIT)[1], self.lines('$(bold)%s$()' % words, 12, cfit.PAGE_LIMIT)[1]
        self.assertEqual(len(plain), 1)
        self.assertEqual(len(bold), 2)

    def test_list_items_start_lines(self):
        a, got = self.lines('Intro.$(li)one$(li)two', 12, cfit.PAGE_LIMIT)
        self.assertEqual(got, ['Intro.', u('<BULLET>one'), u('<BULLET>two')])

    def test_capacities(self):
        self.assertEqual([cfit.capacity(t, cfit.PAGE_LIMIT) for t in (22, 12, -4, 40, 59)], [14, 16, 17, 12, 10])
        self.assertEqual(cfit.capacity(cfit.LANDING['top'], cfit.LANDING['limit']), 8)


class RealPackTest(unittest.TestCase):
    """the real pack's sources: every boss, dimension and unique has a name; the hook and CI run this gate"""

    def test_real_facts_load_with_every_name(self):
        f = cf.load(REAL_MC)
        self.assertEqual(f.missing_names, [])
        self.assertEqual(f.stale_names, [])
        self.assertGreater(len(f.uniques), 0)
        self.assertEqual(sorted(f.layers), ['class', 'origin', 'race'])
        self.assertTrue(all(f.layers.values()))

    def test_hook_and_workflow_run_the_gate(self):
        root = os.path.dirname(REAL_MC)
        with open(os.path.join(REAL_MC, 'dev', 'install-hooks.ps1'), encoding='utf-8') as fh:
            hook = fh.read()
        self.assertIn('dev/codex/codex.py', hook)
        self.assertIn('inputs --regex', hook)
        wf = os.path.join(root, '.github', 'workflows', 'codex.yml')
        with open(wf, encoding='utf-8') as fh:
            text = fh.read()
        self.assertIn('codex.py check', text)
        self.assertIn('codex_test.py', text)
        for p in codex.INPUT_PREFIXES:
            pat = p + '**' if p.endswith('/') else p
            self.assertIn("'%s'" % pat, text, 'the workflow does not trigger on %s (codex.py inputs)' % p)


if __name__ == '__main__':
    unittest.main(verbosity=1)
