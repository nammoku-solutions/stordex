"""End-to-end recovery test against the disposable GitHub PostgreSQL service."""
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

path = Path(__file__).with_name("staging-m12-recovery.py")
spec = importlib.util.spec_from_file_location("staging_m12_recovery", path)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
assert os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("CI") == "true"
m.require_pg16_clients()
os.umask(0o077)
base = dict(m.without_pg(), PGHOST="localhost", PGPORT="5432", PGUSER="stordex",
            PGPASSWORD="stordex", PGDATABASE="stordex", PGSSLMODE="disable")
m.sql(base, "CREATE DATABASE m12_source; CREATE DATABASE neondb;")
source = dict(base, PGDATABASE="m12_source", PGOPTIONS=
              f"-c neon.project_id={m.SOURCE[0]} -c neon.branch_id={m.SOURCE[1]}")
target = dict(base, PGDATABASE="neondb", PGOPTIONS=
              f"-c neon.project_id={m.RECOVERY[0]} -c neon.branch_id={m.RECOVERY[1]}")
m.SOURCE = (*m.SOURCE[:2], "m12_source")
m.sql(source, '''CREATE TABLE public."_prisma_migrations" (
 migration_name text primary key, checksum text, finished_at timestamptz, rolled_back_at timestamptz);''')
values = ",".join(f"('{name}','{sha}','2026-11-01T00:00:00Z',null)"
                  for name, sha, _, _ in m.expected_ledger())
m.sql(source, 'INSERT INTO public."_prisma_migrations" VALUES ' + values + ";")
m.sql(source, "".join(f"CREATE TABLE public.item_{i:02d}(name text);" for i in range(27)))
m.sql(source, '''CREATE TABLE public."Mixed""Name"(label text, payload bytea, stamp timestamptz);
INSERT INTO public."Mixed""Name" VALUES ('日本語' || chr(10) || 'é', decode('00ff','hex'), '2026-11-01T03:00:00Z');''')
with tempfile.TemporaryDirectory() as tmp:
    d = Path(tmp)
    crypto = dict(m.without_pg(), GNUPGHOME=str(d / "gnupg"), PATH=str(d) + ":" + os.environ["PATH"])
    (d / "gnupg").mkdir(mode=0o700)
    real_gpg = shutil.which("gpg")
    assert real_gpg
    wrapper = d / "gpg"
    wrapper.write_text(f'''#!/bin/sh
exec "{real_gpg}" --batch --pinentry-mode loopback --passphrase synthetic-test-only "$@"
''', encoding="utf-8")
    wrapper.chmod(0o700)
    with m.snapshot(source, m.SOURCE) as snap:
        before = m.census(source, snap)
        m.sql(source, "INSERT INTO public.item_00 VALUES ('after shared snapshot');")
        assert m.census(source, snap) == before
    try:
        m.attest(target, m.SOURCE)
    except RuntimeError:
        pass
    else:
        raise AssertionError("Wrong branch was not rejected")
    backup = m.backup(source, d, crypto)
    assert backup["tables"]["item_00"][0] == 1
    try:
        m.restore(source, d, crypto)
    except RuntimeError:
        pass
    else:
        raise AssertionError("Wrong restore branch was not rejected")
    result = m.restore(target, d, crypto)
    assert result.startswith("RESTORE_PASS ")
    assert len(list(d.glob("*.pass"))) == 1
    archive = d / "staging.dump.gpg"
    with archive.open("ab") as f:
        f.write(b"tamper")
    try:
        m.restore(target, d, crypto)
    except RuntimeError as exc:
        assert "checksum mismatch" in str(exc)
    else:
        raise AssertionError("Altered backup was not rejected")
print("STORDEX_M12_LOCAL_RECOVERY_SMOKE_PASS")
