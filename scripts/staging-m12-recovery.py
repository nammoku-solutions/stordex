#!/usr/bin/env python3
"""Local, interactive logical backup and independent restore for Stordex #12."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
from getpass import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
BASE = "be798a9087af04433a226cdf72456944d057115d"
SOURCE = ("dry-feather-14704968", "br-sparkling-boat-ao9nrctp", "neondb")
RECOVERY = ("delicate-rice-23940930", "br-ancient-voice-aoutl8qq", "neondb")
IDENTITY = """SELECT json_build_array(current_setting('neon.project_id', true),
  current_setting('neon.branch_id', true), current_database())"""
TABLES = """SELECT COALESCE(json_agg(tablename ORDER BY tablename COLLATE "C"), '[]'::json)
  FROM pg_catalog.pg_tables WHERE schemaname='public'"""
LEDGER = """SELECT json_agg(json_build_array(migration_name,checksum,finished_at IS NOT NULL,
  rolled_back_at IS NOT NULL) ORDER BY migration_name COLLATE "C")
  FROM public."_prisma_migrations" """
PSQL = ["psql", "-XqAtw", "-v", "ON_ERROR_STOP=1"]
FORMAT = """SET LOCAL TIME ZONE 'UTC';
SET LOCAL DateStyle TO 'ISO, YMD'; SET LOCAL IntervalStyle TO iso_8601;
SET LOCAL bytea_output TO hex; SET LOCAL extra_float_digits TO 3;
SET LOCAL client_encoding TO 'UTF8';"""
OPEN = "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;"
RECOVERY_DB = re.compile(r"stordex_m12_restore_\d{8}t\d{6}z_[0-9a-f]{8}")


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def without_pg():
    return {k: v for k, v in os.environ.items() if not k.startswith("PG")}


def credentials(target, read_only=False):
    print(f"Neon project {target[0]}, branch {target[1]}, database {target[2]}")
    host = input("Direct (non-pooler) Neon hostname: ").strip().lower()
    user = input("PostgreSQL role: ").strip()
    require(re.fullmatch(r"(?:[a-z0-9-]+\.)+neon\.tech", host) and
            "-pooler." not in host, "Only a direct Neon hostname is accepted.")
    require(re.fullmatch(r"[A-Za-z_][A-Za-z_0-9-]*", user), "Invalid PostgreSQL role.")
    env = dict(without_pg(), PGHOST=host, PGUSER=user, PGPORT="5432", PGDATABASE=target[2],
               PGSSLMODE="verify-full", PGSSLROOTCERT="/etc/ssl/certs/ca-certificates.crt",
               PGCONNECT_TIMEOUT="15", PGCLIENTENCODING="UTF8",
               PGOPTIONS="-c search_path=pg_catalog" +
               (" -c default_transaction_read_only=on" if read_only else ""))
    env["PGPASSWORD"] = getpass("PostgreSQL password (local, hidden): ")
    require(env["PGPASSWORD"], "No password entered.")
    return env


def sql(env, command):
    return subprocess.run(PSQL, input=command, env=env, check=True,
                          capture_output=True, encoding="utf-8").stdout.strip()


def attest(env, expected):
    require(tuple(json.loads(sql(env, IDENTITY + ";"))) == expected,
            "Neon project, branch, or database did not match.")


def git(*args):
    return subprocess.check_output(["git", "-C", ROOT, *args])


def expected_ledger():
    root = BASE + ":prisma/migrations"
    names = sorted(git("ls-tree", "-d", "--name-only", root).decode().splitlines())
    require(len(names) == 11, "The repository baseline must contain exactly 11 migrations.")
    return [[name, hashlib.sha256(git("show", f"{root}/{name}/migration.sql")).hexdigest(),
             True, False] for name in names]


def sha_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def quoted_ident(name):
    return '"' + name.replace('"', '""') + '"'


@contextmanager
def snapshot(env, expected):
    attest(env, expected)
    with subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL, env=env, encoding="utf-8") as process:
        try:
            # The transaction stays open while its snapshot is imported by pg_dump and the census.
            process.stdin.write(OPEN + "\n" + IDENTITY + ";\nSELECT pg_catalog.pg_export_snapshot();\n")
            process.stdin.flush()
            identity = process.stdout.readline()
            require(identity and tuple(json.loads(identity)) == expected, "Snapshot identity mismatch.")
            snap = process.stdout.readline().strip()
            require(re.fullmatch(r"[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+", snap),
                    "Server did not export a PostgreSQL snapshot.")
            yield snap
        finally:
            if process.poll() is None:
                # Closing the client rolls back the read-only transaction and releases the snapshot.
                process.terminate()
                process.wait(timeout=15)


def census(env, snap):
    # Import before any SELECT. All hashes are over sorted canonical JSONB, with
    # a stable session format, and include every column and duplicate row.
    require(re.fullmatch(r"[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+", snap), "Invalid snapshot ID.")
    tx = OPEN + "\nSET TRANSACTION SNAPSHOT '" + snap + "';\n" + FORMAT + "\n"
    tables = json.loads(sql(env, tx + TABLES + "; ROLLBACK;"))
    require(isinstance(tables, list) and len(tables) == 29 and
            "_prisma_migrations" in tables, "Expected the 29-table pre-Migration #12 schema.")
    queries = []
    for name in tables:
        # Escape identifiers independently; the table labels come from the catalog.
        queries.append("""SELECT json_build_array(count(*), encode(sha256(convert_to(
          COALESCE(string_agg(doc,E'\\n' ORDER BY doc COLLATE "C"),''),'UTF8')),'hex'))
          FROM (SELECT to_jsonb(t)::text AS doc FROM public.""" + quoted_ident(name) + " t) r;")
    out = sql(env, tx + LEDGER.rstrip() + ";\n" + "\n".join(queries) + "\nROLLBACK;").splitlines()
    require(len(out) == 30, "The census did not return a complete ledger and 29 table fingerprints.")
    history, *records = map(json.loads, out)
    require(history == expected_ledger(), "Migration ledger does not match the exact 11-file Git baseline.")
    return {"ledger": history, "tables": dict(zip(tables, records, strict=True))}


def gpg_env():
    env = without_pg()
    env["GPG_TTY"] = os.ttyname(sys.stdin.fileno())
    return env


def pipe(left, right, left_env, right_env):
    with subprocess.Popen(left, stdout=subprocess.PIPE, env=left_env) as a:
        try:
            b = subprocess.run(right, stdin=a.stdout, env=right_env)
        finally:
            a.stdout.close()
            # A spawn failure must not leave a streaming pg_dump running.
            if sys.exc_info()[0] and a.poll() is None:
                a.terminate()
        require(a.wait() == 0 and b.returncode == 0, "Backup or restore pipeline failed.")


def decrypt_command(archive):
    return ["gpg", "--no-symkey-cache", "--decrypt", str(archive)]


def verify_archive(archive, env):
    subprocess.run(decrypt_command(archive), env=env, stdout=subprocess.DEVNULL, check=True)


def backup(env, out, crypto):
    with snapshot(env, SOURCE) as snap:
        manifest = census(env, snap)
        archive = out / "staging.dump.gpg"
        pipe(["pg_dump", "-w", "--format=custom", "--no-owner", "--no-acl",
              "--schema=public", "--snapshot=" + snap],
             ["gpg", "--no-symkey-cache", "--symmetric", "--cipher-algo", "AES256",
              "--output", str(archive)], env, crypto)
    verify_archive(archive, crypto)
    manifest.update(source=list(SOURCE), baseline=BASE, archive_sha256=sha_file(archive),
                    backup_utc=datetime.now(timezone.utc).isoformat())
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def restore(env, out, crypto):
    attest(env, RECOVERY)
    archive = out / "staging.dump.gpg"
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    require(manifest["source"] == list(SOURCE) and manifest["baseline"] == BASE and
            manifest["ledger"] == expected_ledger() and len(manifest["tables"]) == 29,
            "Select a matching Migration #12 backup directory.")
    require(sha_file(archive) == manifest["archive_sha256"], "Encrypted archive checksum mismatch.")
    verify_archive(archive, crypto)
    name = "stordex_m12_restore_" + datetime.now(timezone.utc).strftime("%Y%m%dt%H%M%Sz_") + uuid4().hex[:8]
    require(RECOVERY_DB.fullmatch(name), "Invalid recovery DB name.")
    print(f"New recovery DB: {name}", flush=True)
    # CREATE DATABASE fails on conflict. No IF EXISTS, clean, drop, or overwrite path.
    sql(env, "CREATE DATABASE " + quoted_ident(name) + " TEMPLATE template0;")
    dest = dict(env, PGDATABASE=name)
    attest(dest, (*RECOVERY[:2], name))
    require(json.loads(sql(dest, TABLES + ";")) == [], "The new recovery DB is not empty.")
    pipe(decrypt_command(archive),
         ["pg_restore", "-w", "--dbname=" + name, "--no-owner", "--no-acl",
          "--single-transaction", "--exit-on-error"], crypto, dest)
    with snapshot(dest, (*RECOVERY[:2], name)) as snap:
        observed = census(dest, snap)
    require(observed["tables"] == manifest["tables"], "Restored table content differs from the backup snapshot.")
    require(observed["ledger"] == manifest["ledger"], "Restored migration ledger mismatch.")
    receipt = (f"RESTORE_PASS project={RECOVERY[0]} branch={RECOVERY[1]} db={name} "
               f"tables=29 migrations=11 sha256={manifest['archive_sha256']} "
               f"backup_utc={manifest['backup_utc']} verified_utc={datetime.now(timezone.utc).isoformat()}")
    (out / (name + ".pass")).write_text(receipt + "\n", encoding="utf-8")
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["backup", "restore"])
    parser.add_argument("directory", type=Path, nargs="?")
    args = parser.parse_args()
    require((args.phase == "restore") == (args.directory is not None),
            "Use backup (no path) or restore <backup directory>.")
    require(sys.version_info >= (3, 10), "Python 3.10 or newer required.")
    require(sys.stdin.isatty(), "Run this interactively in your local WSL terminal.")
    for tool in ("git", "psql", "pg_dump", "pg_restore", "gpg"):
        require(shutil.which(tool), f"Missing local command: {tool}")
    os.umask(0o077)
    crypto = gpg_env()
    if args.phase == "backup":
        env = credentials(SOURCE, read_only=True)
        directory = Path.home() / "stordex-private-backups"
        directory.mkdir(mode=0o700, exist_ok=True)
        out = Path(tempfile.mkdtemp(prefix="m12-", dir=directory))
        print(f"Local backup directory: {out}", flush=True)
        m = backup(env, out, crypto)
        print(f"BACKUP_PASS tables=29 migrations=11 sha256={m['archive_sha256']}")
    else:
        env = credentials(RECOVERY)
        print(restore(env, args.directory.expanduser().resolve(), crypto))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.SubprocessError, KeyboardInterrupt) as exc:
        # psql errors captured by sql() are intentionally not printed. Only
        # phase/check information is emitted in success output.
        print(f"STOP: {exc}", file=sys.stderr)
        sys.exit(2)
