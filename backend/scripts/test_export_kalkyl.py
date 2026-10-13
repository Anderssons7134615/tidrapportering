from contextlib import closing
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('export_kalkyl', Path(__file__).with_name('export-kalkyl.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReadOnlyExportTests(unittest.TestCase):
    def test_exports_exact_saved_revisions_and_never_overwrites_or_changes_source(self):
        with tempfile.TemporaryDirectory(prefix='tidapp-kalkyl-test-') as scratch:
            root = Path(scratch)
            source = root / 'test.sqlite3'
            with closing(sqlite3.connect(source)) as db, db:
                db.execute('CREATE TABLE estimate_revisions(estimate_id TEXT, revision INTEGER, snapshot_json TEXT)')
                for revision in [1, 2]:
                    doc = {'id': 'test', 'revision': revision, 'name': 'TEST åäö', 'manualBid': 123.45 + revision}
                    db.execute('INSERT INTO estimate_revisions VALUES (?,?,?)', ('test', revision, json.dumps(doc)))
            original = source.read_bytes()
            result = module.export(source, root / 'export')
            self.assertTrue(result['sourceFileUnchanged'])
            self.assertEqual(source.read_bytes(), original)
            self.assertEqual(len(result['files']), 2)
            for row in result['files']:
                payload = json.loads((root / 'export' / row['file']).read_text(encoding='utf-8'))
                self.assertEqual(payload['document']['revision'], row['revision'])
                self.assertEqual(payload['document']['name'], 'TEST åäö')
            with self.assertRaises(FileExistsError):
                module.export(source, root / 'export')
            self.assertEqual(source.read_bytes(), original)

    def test_rejects_snapshot_identity_mismatch_without_modifying_source(self):
        with tempfile.TemporaryDirectory(prefix='tidapp-kalkyl-test-') as scratch:
            root = Path(scratch); source = root / 'test.sqlite3'
            with closing(sqlite3.connect(source)) as db, db:
                db.execute('CREATE TABLE estimate_revisions(estimate_id TEXT, revision INTEGER, snapshot_json TEXT)')
                db.execute('INSERT INTO estimate_revisions VALUES (?,?,?)', ('test', 1, '{"id":"other","revision":1}'))
            original = source.read_bytes()
            with self.assertRaises(ValueError):
                module.export(source, root / 'export')
            self.assertEqual(source.read_bytes(), original)
            self.assertFalse((root / 'export' / 'manifest.json').exists())


if __name__ == '__main__':
    unittest.main()
