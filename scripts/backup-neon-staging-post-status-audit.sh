#!/usr/bin/env bash
# Issue #109: exactly Stordex Staging AFTER the audited status reconciliation UAT (#149).
# Current baseline: 26 tables, 9 applied migrations, 2 status audit rows, 2 physical events, 24 movements.
# Read-only pg_dump streamed into AES256 GPG: no plaintext .dump on disk.
# This is a backup helper, NOT a restore, migration or production tool.
set -Eeuo pipefail
umask 077

die() { printf 'STOP: %s\n' "$*" >&2; exit 2; }
mode="${1:---check}"
[[ $# -le 1 && ( "$mode" == "--check" || "$mode" == "--execute" ) ]] ||
  die "Usage: $0 [--check|--execute]"
for tool in psql pg_dump pg_restore gpg sha256sum realpath mktemp; do
  command -v "$tool" >/dev/null || die "Missing command: $tool"
done

STAGING_PROJECT="dry-feather-14704968"
STAGING_BRANCH="br-sparkling-boat-ao9nrctp"
STAGING_MIGRATION="20261106110000_b2b_return_status_events"
MIGRATION_SHA="319dbb8eae4fe0d668a679a84f77a7e4539cdf919627b84b0b8c8e260d39c6f0"

host="${STORDEX_STAGING_BACKUP_HOST:-}"
role="${STORDEX_STAGING_BACKUP_USER:-}"
[[ -n "$host" ]] || read -r -p "Neon staging UNPOOLED host: " host
[[ -n "$role" ]] || read -r -p "Neon staging DB user: " role
[[ "$host" == *.neon.tech && "$host" != *-pooler.* ]] ||
  die "Only a direct, non-pooled Neon host is accepted"
[[ "$role" =~ ^[A-Za-z_][A-Za-z_0-9-]*$ ]] || die "Invalid DB username"
[[ -f /etc/ssl/certs/ca-certificates.crt ]] ||
  die "Ubuntu CA bundle missing. Install ca-certificates."

export PGHOST="$host" PGUSER="$role" PGDATABASE=neondb PGPORT=5432
export PGSSLMODE=verify-full
export PGSSLROOTCERT=/etc/ssl/certs/ca-certificates.crt
# No command-line passwords or connection URLs in shell history.
read -r -s -p "Staging database password (hidden): " PGPASSWORD
printf '\n' >&2
export PGPASSWORD
temp_dir=""
cleanup() {
  unset PGPASSWORD
  if [[ -n "$temp_dir" && -d "$temp_dir" ]]; then
    rm -f -- "$temp_dir/archive.gpg" "$temp_dir/archive.toc"
    rmdir -- "$temp_dir" 2>/dev/null || true
  fi
}
trap cleanup EXIT

status_query=$(cat <<'SQL'
SELECT
  COALESCE(current_setting('neon.project_id', true),'') || '|' ||
  COALESCE(current_setting('neon.branch_id', true),'') || '|' ||
  current_database() || '|' ||
  (SELECT count(*)::text FROM information_schema.tables
   WHERE table_schema='public' AND table_type='BASE TABLE') || '|' ||
  (SELECT count(*)::text FROM "_prisma_migrations") || '|' ||
  (SELECT count(*)::text FROM "_prisma_migrations"
   WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) || '|' ||
  (SELECT count(*)::text FROM "_prisma_migrations"
   WHERE finished_at IS NULL AND rolled_back_at IS NULL) || '|' ||
  (SELECT count(*)::text FROM "_prisma_migrations"
   WHERE migration_name='20261104150000_b2b_seller_line_provenance'
     AND checksum='7bec62454638cd6a8fc715797058c8580db32b103e79f4112d7968dc88a0e680'
     AND finished_at IS NOT NULL AND rolled_back_at IS NULL) || '|' ||
  (SELECT count(*)::text FROM "_prisma_migrations"
   WHERE migration_name='20261104153000_b2b_return_requests'
     AND checksum='005294b7421e8deeef315b379b2587a4474eb370107e4f1d53ed31a6d0ebc23e'
     AND finished_at IS NOT NULL AND rolled_back_at IS NULL) || '|' ||
  (SELECT count(*)::text FROM "_prisma_migrations"
   WHERE migration_name='20261105100000_b2b_return_stock_events'
     AND checksum='85d816bddec3ebdfa7a62bb850a5606d12ee6088dda557a31310acf255f91d07'
     AND finished_at IS NOT NULL AND rolled_back_at IS NULL) || '|' ||

  (SELECT count(*)::text FROM "_prisma_migrations"
   WHERE migration_name='20261106110000_b2b_return_status_events'
     AND checksum='319dbb8eae4fe0d668a679a84f77a7e4539cdf919627b84b0b8c8e260d39c6f0'
     AND finished_at IS NOT NULL AND rolled_back_at IS NULL) || '|' ||
  (SELECT count(*)::text FROM "_prisma_migrations"
   WHERE migration_name='20261110170000_b2b_credit_note_drafts') || '|' ||
  (SELECT count(*)::text FROM "B2BReturnStatusEvent") || '|' ||
  (SELECT count(*)::text FROM "B2BReturnStockEvent") || '|' ||
  (SELECT count(*)::text FROM "InventoryMovement") || '|' ||
  (SELECT count(*)::text FROM "Invoice") || '|' ||
  (SELECT count(*)::text FROM "InvoiceOrder") || '|' ||
  (SELECT count(*)::text FROM "B2BReturnRequest" WHERE status='INSPECTED');
SQL
)
get_state() {
  psql --no-psqlrc -v ON_ERROR_STOP=1 -At --dbname=neondb -c "$status_query"
}
before="$(get_state)" || die "Unable to verify Neon staging identity and migration status"
IFS='|' read -r project_id branch_id db_name table_count total_migrations completed failed provenance return_requests physical_stock_events status_migration pending_credit_migration audit_events stock_events inventory_movements invoice_count invoice_links inspected_returns <<< "$before"
[[ "$project_id" == "$STAGING_PROJECT" &&
   "$branch_id" == "$STAGING_BRANCH" &&
   "$db_name" == "neondb" &&
   "$table_count" == "26" &&
   "$total_migrations" == "9" &&
   "$completed" == "9" &&
   "$failed" == "0" &&
   "$provenance" == "1" &&
   "$return_requests" == "1" &&
   "$physical_stock_events" == "1" &&
   "$status_migration" == "1" &&
   "$pending_credit_migration" == "0" &&
   "$audit_events" == "2" &&
   "$stock_events" == "2" &&
   "$inventory_movements" == "24" &&
   "$invoice_count" == "0" &&
   "$invoice_links" == "0" &&
   "$inspected_returns" == "1" ]] ||
  die "Wrong branch or migration baseline. Expected EXACT Staging after #149 UAT, before credit-note draft migration; no dump performed."

printf 'PASS: project=%s branch=%s tables=%s complete_migrations=%s pending_credit_migration=%s\n' \
  "$project_id" "$branch_id" "$table_count" "$completed" "$pending_credit_migration"
if [[ "$mode" == "--check" ]]; then
  printf 'READ ONLY. Run with --execute to create an encrypted archive.\n'
  exit 0
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
backup_dir="${STORDEX_STAGING_BACKUP_DIR:-$HOME/stordex-private-backups}"
[[ "$backup_dir" == /* ]] || die "Backup destination must be an absolute path"
backup_dir="$(realpath -m "$backup_dir")"
case "$backup_dir/" in "$root/"*) die "Backups must be outside the Git repository";; esac
mkdir -p -- "$backup_dir"
chmod 700 -- "$backup_dir"
[[ "$(stat -c %a "$backup_dir")" == "700" ]] ||
  die "Private directory (mode 700) required; avoid shared/Windows mounts."

temp_dir="$(mktemp -d "$backup_dir/.stordex-backup.XXXXXXXX")"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
nonce="$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
file="stordex-staging-post-status-audit-$timestamp-$nonce.dump.gpg"
target="$backup_dir/$file"
[[ ! -e "$target" ]] || die "Refusing to overwrite existing backup"

printf 'Creating GPG AES256 archive without writing plaintext .dump...\n'
# Pipefail ensures either pg_dump or GPG failure stops this command.
pg_dump --format=custom --no-owner --no-acl --dbname=neondb |
  env -u PGPASSWORD gpg --no-symkey-cache --symmetric --cipher-algo AES256 \
    --output "$temp_dir/archive.gpg"

[[ -s "$temp_dir/archive.gpg" ]] || die "GPG archive missing or empty"
printf 'Checking decryption and custom-archive TOC...\n'
env -u PGPASSWORD gpg --no-symkey-cache --decrypt "$temp_dir/archive.gpg" |
  pg_restore --list > "$temp_dir/archive.toc"
for name in Tenant Item PurchaseOrder IntercompanyOrderItem B2BReturnRequest B2BReturnItem B2BReturnStatusEvent B2BReturnStockEvent InventoryMovement _prisma_migrations; do
  grep -Eq "TABLE public \"?$name\"? " "$temp_dir/archive.toc" ||
    die "Required table schema is absent from archive: $name"
  grep -Eq "TABLE DATA public \"?$name\"? " "$temp_dir/archive.toc" ||
    die "Required table data is absent from archive: $name"
done
after="$(get_state)"
[[ "$before" == "$after" ]] ||
  die "Staging migration/table baseline changed while exporting; discard archive"

mv -- "$temp_dir/archive.gpg" "$target"
chmod 600 -- "$target"
(cd "$backup_dir" && sha256sum "$file" > "$file.sha256")
chmod 600 -- "$target.sha256"
printf 'ENCRYPTED_BACKUP_PASS: %s\n' "$target"
printf 'Verify later: (cd %q && sha256sum -c %q)\n' "$backup_dir" "$file.sha256"
printf 'This is NOT a successful restore test. Restore into a new EMPTY off-source DB.\n'
