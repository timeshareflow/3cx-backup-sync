#!/usr/bin/env python3
"""
3CX iPad Chat Recovery Script
==============================
Extracts 3CX chat messages from an iTunes/Finder device backup.

REQUIREMENTS:
  Python 3.7+  (no extra packages needed — uses only stdlib)

HOW TO USE:
  Step 1: On the iPad, go to Settings > [your name] > iCloud > iCloud Backup — turn it OFF.
           (We want a LOCAL backup, not iCloud.)

  Step 2: Connect the iPad to a Windows PC or Mac with a USB cable.

  Step 3: Make an UNENCRYPTED local backup:
    - Windows: Open iTunes → click the iPad icon → "This Computer" → "Back Up Now"
               Do NOT check "Encrypt local backup"
    - Mac:     Open Finder → click the iPad in the sidebar → "Back up all data on this iPad to this Mac"
               Do NOT enable encryption

  Step 4: Wait for the backup to finish.

  Step 5: Run this script:
    python 3cx-ipad-extract.py

  Step 6: A file named "3cx-ipad-recovery-TIMESTAMP.json" will be created.
          Upload it at the BackupWiz admin panel → Message Recovery page.

BACKUP LOCATIONS (auto-detected):
  Windows (iTunes):         %APPDATA%\\Apple Computer\\MobileSync\\Backup\\
  Windows (Microsoft Store iTunes): %USERPROFILE%\\Apple\\MobileSync\\Backup\\
  Mac:                      ~/Library/Application Support/MobileSync/Backup/
"""

import os
import sys
import json
import sqlite3
import shutil
import tempfile
import hashlib
import platform
import datetime
import glob
import plistlib
from pathlib import Path

SCRIPT_VERSION = "1.0.0"
RECOVERY_START = datetime.datetime(2026, 3, 4, tzinfo=datetime.timezone.utc)
RECOVERY_END   = datetime.datetime(2026, 3, 23, tzinfo=datetime.timezone.utc)

# Known 3CX iOS app bundle IDs (try all variants)
THREECX_BUNDLE_IDS = [
    "com.3cx.phone",
    "com.3cx.client",
    "com.3cx.webclient",
    "com.3cx.3cxphone",
    "com.3cx.voip",
    "net.3cx.phone",
    "com.3cxphone",
]


# ─── Helpers ─────────────────────────────────────────────────────────────────

def log(msg):
    print(msg, flush=True)

def err(msg):
    print(f"  [!] {msg}", flush=True)

def get_backup_dirs():
    """Return candidate iTunes backup base directories for this OS."""
    system = platform.system()
    candidates = []

    if system == "Windows":
        appdata = os.environ.get("APPDATA", "")
        userprofile = os.environ.get("USERPROFILE", "")
        candidates = [
            os.path.join(appdata, "Apple Computer", "MobileSync", "Backup"),
            os.path.join(userprofile, "Apple", "MobileSync", "Backup"),
            os.path.join(appdata, "Apple", "MobileSync", "Backup"),
        ]
    elif system == "Darwin":  # macOS
        home = str(Path.home())
        candidates = [
            os.path.join(home, "Library", "Application Support", "MobileSync", "Backup"),
        ]
    else:
        err(f"Unsupported OS: {system}. Run this on Windows or Mac.")
        sys.exit(1)

    return [c for c in candidates if os.path.isdir(c)]


def list_backups(backup_base):
    """Return list of (backup_dir, device_name, backup_date) for each backup."""
    backups = []
    for entry in os.scandir(backup_base):
        if not entry.is_dir():
            continue
        backup_dir = entry.path
        manifest_path = os.path.join(backup_dir, "Manifest.db")
        info_path = os.path.join(backup_dir, "Info.plist")

        if not os.path.exists(manifest_path):
            continue

        device_name = "Unknown device"
        backup_date = "Unknown date"

        if os.path.exists(info_path):
            try:
                with open(info_path, "rb") as f:
                    info = plistlib.load(f)
                device_name = info.get("Device Name") or info.get("Product Name") or "Unknown"
                last_backup = info.get("Last Backup Date")
                if last_backup:
                    backup_date = str(last_backup)[:19]
            except Exception:
                pass

        backups.append((backup_dir, device_name, backup_date))

    return sorted(backups, key=lambda x: x[2], reverse=True)


def find_threecx_files(backup_dir):
    """
    Find all files belonging to 3CX in the Manifest.db.
    Returns list of (file_id, relative_path, domain).
    """
    manifest_path = os.path.join(backup_dir, "Manifest.db")
    if not os.path.exists(manifest_path):
        err("Manifest.db not found — backup may be encrypted or incomplete.")
        return []

    results = []
    try:
        conn = sqlite3.connect(manifest_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        # Query for all files in any 3CX app domain
        for bundle_id in THREECX_BUNDLE_IDS:
            domain_pattern = f"AppDomain-{bundle_id}%"
            cur.execute(
                "SELECT fileID, domain, relativePath, flags FROM Files "
                "WHERE domain LIKE ? AND flags != 2",  # flags=2 = directory
                (domain_pattern,)
            )
            rows = cur.fetchall()
            results.extend([(r["fileID"], r["relativePath"], r["domain"]) for r in rows])

        conn.close()
    except sqlite3.DatabaseError as e:
        if "encrypted" in str(e).lower() or "file is not a database" in str(e).lower():
            err("Manifest.db is encrypted. Please make an UNENCRYPTED backup.")
            err("In iTunes: uncheck 'Encrypt local backup' and back up again.")
        else:
            err(f"Could not read Manifest.db: {e}")
        return []

    return results


def get_backup_file_path(backup_dir, file_id):
    """Get the actual path of a backup file given its file_id hash."""
    prefix = file_id[:2]
    return os.path.join(backup_dir, prefix, file_id)


def copy_db(backup_dir, file_id, dest_path):
    """Copy a backup file to a temp location for reading."""
    src = get_backup_file_path(backup_dir, file_id)
    if not os.path.exists(src):
        return False
    shutil.copy2(src, dest_path)
    return True


def is_in_range(ts):
    """Check if a timestamp is in the recovery range."""
    if ts is None:
        return False
    try:
        if isinstance(ts, (int, float)):
            # Could be Unix seconds or milliseconds
            if ts > 1e12:
                ts = ts / 1000
            dt = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
        elif isinstance(ts, str):
            # Try ISO parse
            ts_clean = ts.replace("Z", "+00:00")
            dt = datetime.datetime.fromisoformat(ts_clean)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=datetime.timezone.utc)
        elif isinstance(ts, datetime.datetime):
            dt = ts
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=datetime.timezone.utc)
        else:
            return False
        return RECOVERY_START <= dt <= RECOVERY_END
    except Exception:
        return False


def scan_sqlite_db(db_path, file_id, relative_path):
    """
    Open a SQLite DB from the backup, enumerate all tables,
    find message-like data in the recovery range.
    Returns (messages, tables_info).
    """
    messages = []
    tables_info = {}

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        # Get all tables
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [r[0] for r in cur.fetchall()]

        for table in tables:
            try:
                cur.execute(f"SELECT COUNT(*) FROM \"{table}\"")
                count = cur.fetchone()[0]
                tables_info[table] = count

                if count == 0 or count > 500000:
                    continue

                # Get column names
                cur.execute(f"PRAGMA table_info(\"{table}\")")
                cols = [r["name"].lower() for r in cur.fetchall()]

                # Check if table looks like it contains messages
                has_content = any(c in cols for c in [
                    "message", "text", "body", "content", "msg", "chat"
                ])
                has_time = any(c in cols for c in [
                    "time", "date", "timestamp", "createdat", "created_at",
                    "timesent", "time_sent", "sentat", "sent_at"
                ])

                if not (has_content and has_time):
                    continue

                # Read all rows
                cur.execute(f"SELECT * FROM \"{table}\"")
                rows = cur.fetchall()

                for row in rows:
                    row_dict = dict(row)

                    # Find the timestamp field
                    ts_value = None
                    ts_key = None
                    for k in ["time_sent", "timesent", "sent_at", "sentat",
                               "timestamp", "created_at", "createdat", "time", "date"]:
                        if k in row_dict and row_dict[k] is not None:
                            ts_value = row_dict[k]
                            ts_key = k
                            break

                    if ts_value is None:
                        # Try any field that could be a timestamp
                        for k, v in row_dict.items():
                            if v is None:
                                continue
                            if isinstance(v, (int, float)) and 1e9 < v < 2e9:
                                ts_value = v
                                ts_key = k
                                break
                            elif isinstance(v, str) and len(v) >= 10:
                                try:
                                    datetime.datetime.fromisoformat(v[:19])
                                    ts_value = v
                                    ts_key = k
                                    break
                                except Exception:
                                    pass

                    if not is_in_range(ts_value):
                        continue

                    # Convert any bytes fields to hex for JSON serialization
                    serializable = {}
                    for k, v in row_dict.items():
                        if isinstance(v, bytes):
                            try:
                                serializable[k] = v.decode("utf-8", errors="replace")
                            except Exception:
                                serializable[k] = v.hex()
                        else:
                            serializable[k] = v

                    messages.append({
                        "_source": "ipad_backup",
                        "_db_file": relative_path,
                        "_db_table": table,
                        "_ts_key": ts_key,
                        "_recoveredAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        **serializable,
                    })

            except sqlite3.Error as e:
                err(f"  Could not scan table '{table}': {e}")
                continue

        conn.close()
    except sqlite3.DatabaseError as e:
        err(f"Could not open {relative_path}: {e}")

    return messages, tables_info


def extract_media_files(backup_dir, threecx_files, tmpdir):
    """
    Extract media files (images/videos) from the backup.
    Returns list of media dicts with base64 data.
    """
    import base64

    MEDIA_EXTENSIONS = {
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif",
        ".mp4", ".mov", ".m4v", ".avi", ".webm",
        ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    }
    MAX_MEDIA_BYTES = 20 * 1024 * 1024  # 20 MB

    media_items = []

    for file_id, relative_path, domain in threecx_files:
        ext = os.path.splitext(relative_path)[1].lower()
        if ext not in MEDIA_EXTENSIONS:
            continue

        # Only pull from chat/media-related paths
        path_lower = relative_path.lower()
        looks_like_media = any(kw in path_lower for kw in [
            "chat", "message", "media", "image", "photo", "file", "attachment",
            "document", "upload", "download", "cache"
        ])
        if not looks_like_media:
            continue

        src_path = get_backup_file_path(backup_dir, file_id)
        if not os.path.exists(src_path):
            continue

        file_size = os.path.getsize(src_path)
        filename = os.path.basename(relative_path)

        if file_size > MAX_MEDIA_BYTES:
            log(f"      [skip - too large] {filename} ({file_size / 1024 / 1024:.1f} MB)")
            media_items.append({
                "filename": filename,
                "relativePath": relative_path,
                "domain": domain,
                "sizeBytes": file_size,
                "skipped": True,
                "reason": "Exceeds 20 MB limit",
            })
            continue

        # Read and base64 encode
        try:
            with open(src_path, "rb") as f:
                data = f.read()

            mime = ext_to_mime(ext)
            b64 = base64.b64encode(data).decode("ascii")
            data_url = f"data:{mime};base64,{b64}"

            log(f"      ✓ {filename} ({file_size / 1024:.1f} KB)")
            media_items.append({
                "filename": filename,
                "relativePath": relative_path,
                "domain": domain,
                "contentType": mime,
                "sizeBytes": file_size,
                "base64": data_url,
                "cacheName": "ipad_backup",
                "url": f"ipad://{domain}/{relative_path}",
            })
        except Exception as e:
            err(f"Could not read {filename}: {e}")

    return media_items


def ext_to_mime(ext):
    MIME_MAP = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".gif": "image/gif",
        ".webp": "image/webp", ".heic": "image/heic", ".heif": "image/heif",
        ".mp4": "video/mp4", ".mov": "video/quicktime",
        ".m4v": "video/x-m4v", ".webm": "video/webm",
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
    return MIME_MAP.get(ext, "application/octet-stream")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    log("=" * 62)
    log(f"  3CX iPad Chat Recovery Script v{SCRIPT_VERSION}")
    log(f"  Extracting data from: March 4 – March 22, 2026")
    log("=" * 62)

    # ── Find backup directories ──────────────────────────────────────────────
    log("\n[1/5] Searching for iTunes/Finder backups...")
    backup_bases = get_backup_dirs()

    if not backup_bases:
        err("No iTunes/Finder backup folder found on this computer.")
        err("Connect the iPad and make a local backup first.")
        input("\nPress Enter to exit.")
        sys.exit(1)

    all_backups = []
    for base in backup_bases:
        log(f"      Looking in: {base}")
        all_backups.extend(list_backups(base))

    if not all_backups:
        err("No device backups found. Connect the iPad and run 'Back Up Now' in iTunes/Finder.")
        input("\nPress Enter to exit.")
        sys.exit(1)

    log(f"\n      Found {len(all_backups)} backup(s):")
    for i, (bdir, name, date) in enumerate(all_backups):
        log(f"      [{i + 1}] {name}  —  {date}")

    # ── Select backup ────────────────────────────────────────────────────────
    if len(all_backups) == 1:
        chosen_idx = 0
        log(f"\n      Using: {all_backups[0][1]}")
    else:
        log("")
        while True:
            try:
                choice = input(f"      Select backup [1-{len(all_backups)}]: ").strip()
                chosen_idx = int(choice) - 1
                if 0 <= chosen_idx < len(all_backups):
                    break
            except (ValueError, EOFError):
                pass
            err(f"Enter a number between 1 and {len(all_backups)}")

    backup_dir, device_name, backup_date = all_backups[chosen_idx]
    log(f"\n      Using backup: {device_name}  ({backup_date})")
    log(f"      Path: {backup_dir}")

    # ── Find 3CX files in backup ─────────────────────────────────────────────
    log("\n[2/5] Scanning for 3CX app files...")
    threecx_files = find_threecx_files(backup_dir)

    if not threecx_files:
        err("No 3CX app data found in this backup.")
        err("Possible reasons:")
        err("  - 3CX was not installed on this device when the backup was made")
        err("  - The backup is encrypted (re-backup without encryption)")
        err("  - 3CX uses a different bundle ID not yet in our list")
        err(f"\nKnown bundle IDs searched: {', '.join(THREECX_BUNDLE_IDS)}")
        input("\nPress Enter to exit.")
        sys.exit(1)

    log(f"      Found {len(threecx_files)} 3CX file(s):")
    for _, rpath, domain in threecx_files[:20]:
        log(f"        {domain}/{rpath}")
    if len(threecx_files) > 20:
        log(f"        ... and {len(threecx_files) - 20} more")

    # ── Extract messages from SQLite databases ───────────────────────────────
    log("\n[3/5] Extracting messages from databases...")

    all_messages = []
    db_info = []
    tmpdir = tempfile.mkdtemp(prefix="3cx_recovery_")

    try:
        db_files = [(fid, rp, d) for fid, rp, d in threecx_files
                    if rp.lower().endswith(".db") or rp.lower().endswith(".sqlite")]

        log(f"      Database files found: {len(db_files)}")

        for file_id, relative_path, domain in db_files:
            tmp_db = os.path.join(tmpdir, f"{file_id}.db")
            if not copy_db(backup_dir, file_id, tmp_db):
                err(f"Could not copy {relative_path}")
                continue

            log(f"\n      Scanning: {relative_path}")
            messages, tables = scan_sqlite_db(tmp_db, file_id, relative_path)

            log(f"      Tables: {', '.join(f'{t}({n})' for t, n in tables.items())}")
            log(f"      Messages in range: {len(messages)}")

            all_messages.extend(messages)
            db_info.append({
                "relativePath": relative_path,
                "domain": domain,
                "tables": tables,
                "messagesFound": len(messages),
            })

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

    # ── Extract media files ──────────────────────────────────────────────────
    log("\n[4/5] Extracting media files...")
    tmpdir2 = tempfile.mkdtemp(prefix="3cx_media_")
    try:
        media_items = extract_media_files(backup_dir, threecx_files, tmpdir2)
    finally:
        shutil.rmtree(tmpdir2, ignore_errors=True)

    media_captured = [m for m in media_items if not m.get("skipped")]
    media_skipped  = [m for m in media_items if m.get("skipped")]
    log(f"\n      Media captured: {len(media_captured)}, skipped (too large): {len(media_skipped)}")

    # ── Build output ─────────────────────────────────────────────────────────
    log("\n[5/5] Writing output file...")

    output = {
        "extractedAt":    datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "scriptVersion":  SCRIPT_VERSION,
        "source":         "ipad_itunes_backup",
        "deviceName":     device_name,
        "backupDate":     backup_date,
        "backupDir":      backup_dir,
        "origin":         f"ipad://{device_name}",
        "userAgent":      f"Python/{sys.version.split()[0]} on {platform.system()} {platform.release()}",
        "recoveryRange":  {
            "from": RECOVERY_START.isoformat(),
            "to":   RECOVERY_END.isoformat(),
        },
        "databases":       db_info,
        "recoveredMessages": all_messages,
        "recoveredMedia":    media_items,
    }

    timestamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    output_filename = f"3cx-ipad-recovery-{timestamp}.json"
    output_path = os.path.join(os.path.expanduser("~"), "Desktop", output_filename)

    # Fallback to current directory if Desktop doesn't exist
    if not os.path.isdir(os.path.dirname(output_path)):
        output_path = os.path.join(os.getcwd(), output_filename)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, default=str)

    size_mb = os.path.getsize(output_path) / 1024 / 1024

    log("\n" + "=" * 62)
    log(f"  DONE")
    log(f"  Messages found: {len(all_messages)}")
    log(f"  Media files:    {len(media_captured)}")
    log(f"  Output file:    {output_path}")
    log(f"  File size:      {size_mb:.1f} MB")
    log("=" * 62)
    log("\n  Upload this file at:")
    log("  BackupWiz → Admin → Message Recovery")
    log("")

    input("Press Enter to exit.")


if __name__ == "__main__":
    main()
