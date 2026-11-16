#!/usr/bin/env bash
set -euo pipefail

# Read-only. The operator must supply the intended account ID separately
# from the profile so a valid login to the wrong account cannot pass.
if [[ $# != 2 || ! ${1:-} =~ ^[0-9]{12}$ || ! ${2:-} =~ ^[[:alnum:]][[:alnum:]_.-]*$ || ${2:-} == default ]]; then
  printf 'Usage: bash scripts/aws-staging-preflight.sh <NONPROD_ACCOUNT_ID> <NAMED_NONPROD_PROFILE>\n' >&2
  exit 2
fi

expected_account=$1
profile=$2
region=ap-northeast-1
engine_version=16.8 # Keep in sync with the aws-staging stage in sst.config.ts.

if ! command -v aws >/dev/null; then
  printf 'AWS CLI v2 is required for this check.\n' >&2
  exit 2
fi

aws_read() {
  aws --profile "$profile" --region "$region" --no-cli-pager "$@"
}

actual_account=$(aws_read sts get-caller-identity --query Account --output text)
if [[ "$actual_account" != "$expected_account" ]]; then
  printf 'Account mismatch: expected %s, got %s. No RDS calls made.\n' "$expected_account" "$actual_account" >&2
  exit 1
fi
printf 'AWS account verified: %s (%s)\n' "$actual_account" "$region"

version_status=$(aws_read rds describe-db-engine-versions \
  --engine aurora-postgresql --engine-version "$engine_version" \
  --query 'DBEngineVersions[0].Status' --output text)
if [[ "$version_status" != available ]]; then
  printf 'Aurora PostgreSQL %s is not available in %s (%s). Review the engine pin before deploying.\n' "$engine_version" "$region" "$version_status" >&2
  exit 1
fi

min_capacity=$(aws_read rds describe-db-engine-versions \
  --engine aurora-postgresql --engine-version "$engine_version" \
  --query 'DBEngineVersions[0].ServerlessV2FeaturesSupport.MinCapacity' --output text)
if [[ ! "$min_capacity" =~ ^0(\.0+)?$ ]]; then
  printf 'Aurora PostgreSQL %s did not report 0 ACU support (%s). Review the staging scaling configuration.\n' "$engine_version" "$min_capacity" >&2
  exit 1
fi

# Select a single page and a single result. A paginated text query can print
# several values when evaluated separately for each page.
orderable=$(aws_read rds describe-orderable-db-instance-options \
  --engine aurora-postgresql --engine-version "$engine_version" \
  --db-instance-class db.serverless --vpc --no-paginate \
  --query 'OrderableDBInstanceOptions[0].DBInstanceClass' --output text)
if [[ "$orderable" != db.serverless ]]; then
  printf 'db.serverless is not orderable for Aurora PostgreSQL %s in %s.\n' "$engine_version" "$region" >&2
  exit 1
fi

printf 'PASS: Aurora PostgreSQL %s / db.serverless / minimum 0 ACU. No AWS resources changed.\n' "$engine_version"
