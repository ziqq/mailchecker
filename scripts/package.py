# https://github.com/ziqq/mailchecker
# Copyright (C) 2026 Anton Ustinoff
# https://github.com/ziqq/mailchecker/blob/main/LICENSE

"""Package a deterministic Chrome extension ZIP from the bundled build/ directory.

The ZIP contains every file in build/ plus PRIVACY.md (and LICENSE when
present), with `manifest.json` at its root. Entries are sorted, stored
without compression and use fixed timestamps and permissions, so the
archive bytes are reproducible. A `.sha256` file is written next to it.

Usage:
    python3 scripts/package.py [--source build] [--output dist] [--tag vX.Y.Z]
    python3 scripts/package.py --verify dist/mailchecker-X.Y.Z.zip [--tag vX.Y.Z]
"""

import argparse
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZIP_STORED, BadZipFile, ZipFile, ZipInfo


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


def validate_tag(tag, version):
    """Require a stable vX.Y.Z tag matching the manifest and the newest changelog section."""
    if not re.fullmatch(r'v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)', tag):
        raise ValueError('Release tags must have the form vX.Y.Z.')
    if tag != f'v{version}':
        raise ValueError(f'Tag {tag} does not match manifest version {version}.')
    sections = re.findall(r'^## (\d+\.\d+\.\d+)$', (ROOT / 'CHANGELOG.md').read_text(encoding='utf-8'), re.MULTILINE)
    if not sections or sections[0] != version:
        raise ValueError('The newest changelog section must match the release tag.')


def verify(path, files):
    """Verify entry names, deterministic metadata, every byte and the SHA-256 file."""
    with ZipFile(path) as archive:
        if archive.namelist() != list(files):
            raise ValueError('Archive contents differ from the build.')
        if archive.testzip() is not None:
            raise ValueError('Archive CRC verification failed.')
        for entry in archive.infolist():
            if entry.date_time != TIMESTAMP or entry.compress_type != ZIP_STORED:
                raise ValueError(f'Non-deterministic ZIP metadata: {entry.filename}')
            if archive.read(entry) != files[entry.filename].read_bytes():
                raise ValueError(f'Packaged bytes differ from the build: {entry.filename}')
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if path.with_suffix('.sha256').read_text(encoding='utf-8') != f'{digest}  {path.name}\n':
        raise ValueError('SHA-256 file does not match the archive.')


def write_zip(source, output):
    """Write the reproducible ZIP and its checksum; return the ZIP path."""
    manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
    output.mkdir(parents=True, exist_ok=True)
    target = output / f"mailchecker-{manifest['version']}.zip"
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
    """Validate the release tag when given, then package or verify the build."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--source', type=Path, default=ROOT / 'build')
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    parser.add_argument('--verify', type=Path, help='Verify an existing ZIP against the build.')
    parser.add_argument('--tag', help='Validate the stable release tag first.')
    args = parser.parse_args()
    source = args.source.resolve()
    if args.tag:
        validate_tag(args.tag, json.loads((source / 'manifest.json').read_text(encoding='utf-8'))['version'])
    if args.verify:
        verify(args.verify, package_files(source))
        print(f'Verified {args.verify.name}')
        return
    target = write_zip(source, args.output.resolve())
    print(f'Packaged {target.relative_to(ROOT) if target.is_relative_to(ROOT) else target}')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, BadZipFile) as error:
        raise SystemExit(str(error)) from error
