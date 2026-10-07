"""Package a deterministic Chrome extension ZIP from the bundled build/ directory.

The ZIP contains every file in build/ plus PRIVACY.md (and LICENSE when
present), with `manifest.json` at its root. Entries are sorted, stored
without compression and use fixed timestamps and permissions, so the
archive bytes are reproducible. A `.sha256` file is written next to it.

Usage:
    python3 scripts/package.py [--source build] [--output dist]
"""

import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_STORED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parent.parent
# Fixed ZIP entry timestamp for reproducible archives.
TIMESTAMP = (2026, 1, 1, 0, 0, 0)


def package_files(source):
    """Return the packaged files (archive name -> path), sorted by name.

    Raises ValueError when the build is missing or contains a symbolic link.
    """
    if not (source / 'manifest.json').is_file():
        raise ValueError('The build is missing. Run npm run build first.')
    files = {}
    for path in source.rglob('*'):
        if path.is_symlink():
            raise ValueError(f'Unsafe runtime file: {path}')
        if path.is_file():
            files[path.relative_to(source).as_posix()] = path
    files['PRIVACY.md'] = ROOT / 'PRIVACY.md'
    if (ROOT / 'LICENSE').is_file():
        files['LICENSE'] = ROOT / 'LICENSE'
    return dict(sorted(files.items()))


def write_zip(source, output):
    """Write the reproducible ZIP and its checksum; return the ZIP path."""
    manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
    output.mkdir(parents=True, exist_ok=True)
    target = output / f"mail-checker-{manifest['version']}.zip"
    with ZipFile(target, 'w', ZIP_STORED) as archive:
        for name, path in package_files(source).items():
            info = ZipInfo(name, TIMESTAMP)
            info.external_attr = 0o644 << 16
            info.compress_type = ZIP_STORED
            archive.writestr(info, path.read_bytes())
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    target.with_suffix('.sha256').write_text(f'{digest}  {target.name}\n', encoding='utf-8')
    return target


def main():
    """Parse arguments and package the build."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--source', type=Path, default=ROOT / 'build')
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    args = parser.parse_args()
    target = write_zip(args.source.resolve(), args.output.resolve())
    print(f'Packaged {target.relative_to(ROOT) if target.is_relative_to(ROOT) else target}')


if __name__ == '__main__':
    main()
