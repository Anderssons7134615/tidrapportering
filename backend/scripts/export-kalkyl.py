"""Export saved desktop revisions from a READ-ONLY SQLite source to new files.

Usage: python export-kalkyl.py source.sqlite3 NEW-output-directory
No HTTP requests or production writes. The source is never modified.
"""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import sys


def export(source: Path, output: Path):
    source = source.resolve(strict=True)
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    # SQLite backup gives a consistent snapshot even when the desktop app uses WAL.
    with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)) as original:
        original.execute('PRAGMA query_only=ON')
        with closing(sqlite3.connect(output / 'source-copy.sqlite3')) as copy:
            original.backup(copy)
    manifest = {'source': str(source), 'sourceHashBefore': source_hash, 'files': []}
    with closing(sqlite3.connect((output / 'source-copy.sqlite3').as_uri() + '?mode=ro', uri=True)) as db:
        db.execute('PRAGMA query_only=ON')
        for index, (estimate_id, revision, snapshot) in enumerate(db.execute(
                'SELECT estimate_id, revision, snapshot_json FROM estimate_revisions ORDER BY estimate_id, revision')):
            document = json.loads(snapshot)
            if document.get('id') != estimate_id or document.get('revision') != revision:
                raise ValueError('Snapshot identity does not match its database row')
            name = f'Kalkyl-{index + 1}-version-{revision}.json'
            content = json.dumps({'format': 'andersson-kalkyl-v1', 'document': document}, ensure_ascii=False, indent=2).encode('utf-8')
            with (output / name).open('xb') as file:
                file.write(content)
            manifest['files'].append({'file': name, 'name': document['name'], 'sourceId': estimate_id,
                                      'revision': revision, 'sha256': hashlib.sha256(content).hexdigest()})
    manifest['sourceHashAfter'] = hashlib.sha256(source.read_bytes()).hexdigest()
    manifest['sourceFileUnchanged'] = source_hash == manifest['sourceHashAfter']
    with (output / 'manifest.json').open('x', encoding='utf-8') as file:
        json.dump(manifest, file, ensure_ascii=False, indent=2)
    return manifest


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: export-kalkyl.py source.sqlite3 NEW-output-directory')
    result = export(Path(sys.argv[1]), Path(sys.argv[2]))
    print(json.dumps({'files': len(result['files']), 'sourceFileUnchanged': result['sourceFileUnchanged']}, ensure_ascii=False))
