"""Enable camera (video) media permission in the DSH desktop Electron shell.

Why this exists
---------------
DSH Desktop's Electron main process (`resources/app.asar -> lib/main.js`) installs
`installMicrophonePermissions()`, which accepts only `mediaType === "audio"`.
Every other media request is answered with `callback(false)`, so the startup
animation's `getUserMedia({video})` is rejected before the request ever reaches
Windows. There is no official switch for this.

What this script does
---------------------
Equal-length byte replacement inside `lib/main.js`, which lives uncompressed
inside app.asar. The file size does not change, therefore every asar offset,
the header and the entry size stay identical:

  1. permission check handler:
       details.mediaType === "audio"
     -> (details.mediaType || 1)      (space padded to the same length)
  2. permission request handler:
       details.mediaTypes.length === 1 && details.mediaTypes[0] === "audio"
     -> details.mediaTypes.length >= 1    (space padded to the same length)

The original trust checks (primary window, main frame, dsh-app://app origin) are
kept. Audio permission also keeps working because `>= 1` covers audio too.

Usage
-----
  python patch_camera.py                # preview only (no write)
  python patch_camera.py --check        # exit 0 if already patched, 1 if not
  python patch_camera.py --apply        # backup + patch + verify
  python patch_camera.py --asar PATH    # explicit app.asar path

A full backup is created next to the asar as app.asar.bak-camera-<timestamp>.
Its SHA-256 and size are recorded in app.asar.camera-backup.json so the
uninstaller can verify the backup before restoring it.
Only the newest backup is kept: older ones are pruned, because the app.asar is
~180 MB and the logon guard re-applies the patch after every DSH update - without
rotation the install folder grows by one full copy per update.
"""
import glob
import hashlib
import json
import os
import shutil
import struct
import sys
import time

BACKUP_SUFFIX = ".bak-camera-"
KEEP_BACKUPS = 1
# Written next to app.asar after a successful --apply. Records the SHA-256 and
# size of the backup we just made, so `uninstall.ps1 -RestoreAsar` can refuse a
# backup that was swapped in after the fact (see the 1.2.5 changelog).
MANIFEST_SUFFIX = ".camera-backup.json"

P1 = b'details.mediaType === "audio"'
R1 = b"(details.mediaType || 1)" + b" " * (len(P1) - len(b"(details.mediaType || 1)"))

P2 = b'details.mediaTypes.length === 1 && details.mediaTypes[0] === "audio"'
R2 = b"details.mediaTypes.length >= 1" + b" " * (len(P2) - len(b"details.mediaTypes.length >= 1"))

MARK1 = b"(details.mediaType || 1)"
MARK2 = b"details.mediaTypes.length >= 1"

CANDIDATE_GLOBS = [
    r"D:\deepseek\*\resources\app.asar",
    r"C:\Program Files\*\resources\app.asar",
    r"C:\Program Files (x86)\*\resources\app.asar",
    os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "*", "resources", "app.asar"),
]


def detect_asar(explicit=None):
    if explicit:
        return explicit if os.path.isfile(explicit) else None
    env = os.environ.get("DSH_DESKTOP_ASAR")
    if env and os.path.isfile(env):
        return env
    for pattern in CANDIDATE_GLOBS:
        if not pattern:
            continue
        for hit in sorted(glob.glob(pattern)):
            if os.path.isfile(hit):
                return hit
    return None


def read_entry(asar, rel_path):
    with open(asar, "rb") as f:
        _, _, _, jlen = struct.unpack("<4I", f.read(16))
        header = json.loads(f.read(jlen).decode("utf-8"))
        base = 16 + jlen

        def walk(node, prefix):
            for name, val in node.get("files", {}).items():
                p = f"{prefix}/{name}" if prefix else name
                if "files" in val:
                    yield from walk(val, p)
                else:
                    yield p, val

        for path, meta in walk(header, ""):
            if path == rel_path:
                f.seek(base + int(meta["offset"]))
                return base, meta, f.read(int(meta["size"]))
    return None, None, None


def prune_backups(asar, keep=KEEP_BACKUPS):
    """Keep only the newest `keep` backups; return the paths that were removed.

    Sort by file name, not mtime: shutil.copy2 preserves the source mtime, so the
    backup we just made can look older than an existing one. The name ends with
    YYYYMMDD-HHMMSS, so name order is time order.
    """
    if keep < 1:
        return []
    backups = sorted(glob.glob(asar + BACKUP_SUFFIX + "*"))
    if len(backups) <= keep:
        return []
    removed = []
    for old in backups[:-keep]:
        try:
            os.remove(old)
            removed.append(old)
        except OSError as err:
            print(f"WARN: could not remove old backup {old}: {err}")
    return removed


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_manifest(asar, backup):
    """Record the install-time hash of the backup we just created.

    `uninstall.ps1 -RestoreAsar` only restores a backup whose size and SHA-256
    match this manifest, so a poisoned app.asar.bak-camera-* dropped into the
    install folder later is not copied over the real asar.
    """
    manifest = asar + MANIFEST_SUFFIX
    payload = {
        "asar": asar,
        "backup": os.path.basename(backup),
        "sha256": sha256_of(backup),
        "size": os.path.getsize(backup),
        "created": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    tmp = manifest + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, manifest)
    return manifest


def main():
    argv = sys.argv[1:]
    explicit = None
    if "--asar" in argv:
        i = argv.index("--asar")
        if i + 1 < len(argv):
            explicit = argv[i + 1]
    check_only = "--check" in argv
    apply = "--apply" in argv

    asar = detect_asar(explicit)
    if not asar:
        print("ERROR: could not locate the DSH desktop app.asar.")
        print("       Pass it explicitly:  python patch_camera.py --asar <path>")
        return 3
    print(f"asar: {asar}")

    base, meta, data = read_entry(asar, "lib/main.js")
    if data is None:
        print("ERROR: lib/main.js not found inside app.asar (unsupported build?)")
        return 3

    already = (MARK1 in data) and (MARK2 in data)
    if check_only:
        print("status:", "PATCHED" if already else "NOT PATCHED")
        return 0 if already else 1
    if already:
        print("already patched; nothing to do")
        # Backfill the manifest for installs patched before 1.2.5 existed (or for
        # a backup whose manifest was deleted), so -RestoreAsar can still verify it.
        try:
            if not os.path.isfile(asar + MANIFEST_SUFFIX):
                backups = sorted(glob.glob(asar + BACKUP_SUFFIX + "*"))
                if backups:
                    print("backup manifest:", write_manifest(asar, backups[-1]))
        except OSError as err:
            print(f"WARN: could not write backup manifest: {err}")
        return 0

    c1, c2 = data.count(P1), data.count(P2)
    print(f"pattern 1 occurrences: {c1}")
    print(f"pattern 2 occurrences: {c2}")
    if c1 != 1 or c2 != 1:
        print("ERROR: expected exactly one occurrence of each pattern; this build differs.")
        print("       Refusing to patch. Inspect lib/main.js manually.")
        return 4

    patched = bytearray(data)
    patched[data.find(P1):data.find(P1) + len(P1)] = R1
    patched[data.find(P2):data.find(P2) + len(P2)] = R2
    assert len(patched) == len(data)

    if not apply:
        print("\nPREVIEW ONLY — run with --apply to write.")
        print("  check handler :", R1)
        print("  request handler:", R2)
        return 0

    backup = f"{asar}{BACKUP_SUFFIX}{time.strftime('%Y%m%d-%H%M%S')}"
    print(f"backup: {backup}")
    shutil.copy2(asar, backup)

    off1 = base + int(meta["offset"]) + data.find(P1)
    off2 = base + int(meta["offset"]) + data.find(P2)
    with open(asar, "r+b") as f:
        f.seek(off1)
        f.write(R1)
        f.seek(off2)
        f.write(R2)
        f.flush()
        os.fsync(f.fileno())

    _, _, after = read_entry(asar, "lib/main.js")
    ok = after is not None and MARK1 in after and MARK2 in after and len(after) == len(data)
    print("verify:", "OK" if ok else "FAILED")
    print("backup kept at:", backup)
    if ok:
        try:
            print("backup manifest:", write_manifest(asar, backup))
        except OSError as err:
            print(f"WARN: could not write backup manifest: {err}")
        for old in prune_backups(asar):
            print("old backup removed:", old)
    return 0 if ok else 5


if __name__ == "__main__":
    sys.exit(main())
