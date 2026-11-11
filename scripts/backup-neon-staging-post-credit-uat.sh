#!/usr/bin/env bash
# Issue #82: exact Stordex Neon Staging AFTER CreditNote 2-box DRAFT UAT, BEFORE migration #11.
# Project stordex-staging dry-feather-14704968, branch staging br-sparkling-boat-ao9nrctp, DB neondb.
# Current baseline: 28 tables, 10 applied migrations, 1 issued original Invoice, 1 DRAFT credit, 2 reserved units.
# Restore MUST be independently verified on a new empty DB in the separate recovery project.
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
STAGING_MIGRATION="20261110170000_b2b_credit_note_drafts"
MIGRATION_SHA="afda7ae0b2dec24750359595884181f3d6bfa1cb721538544f2b6b4f93066bc5"

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
  (SELECT count(*)::text FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') || '|' ||
  (SELECT count(*)::text FROM "_prisma_migrations") || '|' ||
  (SELECT count(*)::text FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) || '|' ||
  (SELECT count(*)::text FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL) || '|' ||
  (SELECT count(*)::text FROM "_prisma_migrations"
    WHERE migration_name='20261110170000_b2b_credit_note_drafts'
      AND checksum='afda7ae0b2dec24750359595884181f3d6bfa1cb721538544f2b6b4f93066bc5'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) || '|' ||
  (SELECT count(*)::text FROM "_prisma_migrations"
    WHERE migration_name='20261111110000_b2b_credit_draft_void_and_audit') || '|' ||
  (CASE WHEN to_regclass('public."B2BCreditVoidEvent"') IS NULL THEN '1' ELSE '0' END) || '|' ||
  (SELECT count(*)::text FROM "B2BCreditNote") || '|' ||
  (SELECT count(*)::text FROM "B2BCreditNoteLine") || '|' ||
  (SELECT count(*)::text FROM "B2BCreditNote" WHERE id='cmwbh3b5z000008kz8t5ii32x'
    AND status='DRAFT' AND "proposedSubtotal" IS NULL
    AND "proposedTax" IS NULL AND "proposedTotal" IS NULL
    AND "originalInvoiceId"='cmwam6cdt000008jp4d37nhp3') || '|' ||
  (SELECT COALESCE(sum("creditedQuantity"),0)::text FROM "B2BCreditNoteLine"
    WHERE "creditNoteId"='cmwbh3b5z000008kz8t5ii32x') || '|' ||
  (SELECT count(*)::text FROM "Invoice") || '|' ||
  (SELECT count(*)::text FROM "InvoiceOrder") || '|' ||
  (SELECT count(*)::text FROM "Invoice" WHERE "invoiceNumber"='I-202611-0001'
    AND status='ISSUED' AND subtotal=4400 AND tax=440 AND total=4840) || '|' ||
  (SELECT count(*)::text FROM "B2BReturnRequest" WHERE id='cmwa55eah000008jsfs3r5dwk' AND status='INSPECTED') || '|' ||
  (SELECT count(*)::text FROM "B2BReturnStatusEvent") || '|' ||
  (SELECT count(*)::text FROM "B2BReturnStockEvent") || '|' ||
  (SELECT count(*)::text FROM "InventoryMovement") || '|' ||
  COALESCE((SELECT stock::text FROM "Item" WHERE code='D-PAPER' AND "tenantId"=
    (SELECT "buyerTenantId" FROM "IntercompanyOrder" WHERE "poNumber"='P-20261110-0001')),'') || '|' ||
  COALESCE((SELECT stock::text FROM "Item" WHERE code='A-PAPER' AND "tenantId"=
    (SELECT "sellerTenantId" FROM "IntercompanyOrder" WHERE "poNumber"='P-20261110-0001')),'');
SQL
)
get_state() {
  psql --no-psqlrc -v ON_ERROR_STOP=1 -At --dbname=neondb -c "$status_query"
}
before="$(get_state)" || die "Unable to verify Neon staging identity and migration status"
IFS='|' read -r project_id branch_id db_name table_count total_migrations completed failed tenth_checksum eleventh_history void_table_absent credits credit_lines exact_draft allocated invoice_count invoice_links issued_invoice inspected_return audit_events stock_events inventory_movements buyer_stock seller_stock <<< "$before"

[[ "$project_id" == "$STAGING_PROJECT" &&
   "$branch_id" == "$STAGING_BRANCH" &&
   "$db_name" == "neondb" &&
   "$table_count" == "28" &&
   "$total_migrations" == "10" &&
   "$completed" == "10" &&
   "$failed" == "0" &&
   "$tenth_checksum" == "1" &&
   "$eleventh_history" == "0" &&
   "$void_table_absent" == "1" &&
   "$credits" == "1" && "$credit_lines" == "1" &&
   "$exact_draft" == "1" && "$allocated" == "2" &&
   "$invoice_count" == "1" && "$invoice_links" == "1" &&
   "$issued_invoice" == "1" && "$inspected_return" == "1" &&
   "$audit_events" == "2" && "$stock_events" == "2" &&
   "$inventory_movements" == "24" &&
   "$buyer_stock" == "36" && "$seller_stock" == "138" ]] ||
  die "Wrong project/branch/database, credit UAT baseline or migration state: NO BACKUP MADE"

printf 'PASS: project=%s branch=%s tables=%s complete_migrations=%s eleventh_migration=%s\n' \
  "$project_id" "$branch_id" "$table_count" "$completed" "$eleventh_history"
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
file="stordex-staging-post-credit-uat-$timestamp-$nonce.dump.gpg"
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
for name in Tenant Item PurchaseOrder IntercompanyOrderItem B2BReturnRequest B2BReturnItem B2BReturnStatusEvent B2BReturnStockEvent InventoryMovement Invoice InvoiceOrder B2BCreditNote B2BCreditNoteLine _prisma_migrations; do
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
