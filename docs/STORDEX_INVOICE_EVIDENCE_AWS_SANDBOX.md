# Stordex 請求書証跡 AWS サンドボックス

既存の Vercel / Neon Staging と切り離し、コードで生成した合成 PDF だけで S3 保存、上書き拒否、同じバージョンの読み戻し、独立確認の前処理を検証する。Staging 本体の AWS 移行先や、本番システムの構成をこのスタックで決めるものではない。

## 実行前

- AWS CLI v2 と Node 22、セットアップ済みの **非本番 AWS プロファイル**が必要。既存の本番デプロイ用認証情報は使わない。承認済みのアカウント ID とリージョンは運用者が明示する。
- CloudFormation は専用の KMS キー1個と、非公開のバージョニング付き S3 バケット1個を作成する。IAM ロールや既存インフラは変更しない。KMS キー、保存したテストデータ等の費用はアカウントに発生しうる。
- スモークテストのロールに必要な権限は、バケットに対する `s3:GetBucketTagging`、`s3:GetBucketPublicAccessBlock`、`s3:GetBucketVersioning`、`s3:GetBucketOwnershipControls`、`s3:GetEncryptionConfiguration`、対象キー名前空間に対する `s3:PutObject` と `s3:GetObjectVersion`、専用 KMS キーの `kms:GenerateDataKey` と `kms:Decrypt`。オブジェクト削除権限は不要。プロビジョニング用の権限はこれとは別に管理する。

## デプロイ

リポジトリ直下で Bash から実行する。変数は既に合意した値を入力する。

```bash
export STORDEX_SANDBOX_PROFILE='replace-with-sandbox-profile'
export STORDEX_EVIDENCE_SMOKE_ACCOUNT='replace-with-approved-12-digit-account'
export STORDEX_EVIDENCE_SMOKE_REGION='replace-with-approved-region'

(
  set -euo pipefail
  stack=stordex-evidence-sandbox
  profile="$STORDEX_SANDBOX_PROFILE"
  region="$STORDEX_EVIDENCE_SMOKE_REGION"
  actual="$(aws sts get-caller-identity --profile "$profile" --region "$region" --query Account --output text)"
  test "$actual" = "$STORDEX_EVIDENCE_SMOKE_ACCOUNT"
  aws cloudformation validate-template --profile "$profile" --region "$region" \
    --template-body file://infra/aws/stordex-evidence-sandbox.json >/dev/null
  aws cloudformation deploy --profile "$profile" --region "$region" \
    --stack-name "$stack" --template-file infra/aws/stordex-evidence-sandbox.json \
    --no-fail-on-empty-changeset
)
```

初めてバージョニングを有効にしたバケットでは、AWS が推奨する設定の伝播時間（15分）を置いてから書き込みを試す。エラーが起きた場合は別のバケットを選んで再試行しない。バケットポリシーは TLS、条件付き書き込み、専用 KMS キーを要求する。

## 合成 PDF の保存・読み戻し

```bash
(
  set -euo pipefail
  stack=stordex-evidence-sandbox
  profile="$STORDEX_SANDBOX_PROFILE"
  region="$STORDEX_EVIDENCE_SMOKE_REGION"
  actual="$(aws sts get-caller-identity --profile "$profile" --region "$region" --query Account --output text)"
  test "$actual" = "$STORDEX_EVIDENCE_SMOKE_ACCOUNT"
  for output in BucketName KmsKeyArn; do
    value="$(aws cloudformation describe-stacks --profile "$profile" --region "$region" \
      --stack-name "$stack" --query "Stacks[0].Outputs[?OutputKey=='${output}'].OutputValue | [0]" --output text)"
    case "$output" in
      BucketName) export STORDEX_EVIDENCE_SMOKE_BUCKET="$value" ;;
      KmsKeyArn) export STORDEX_EVIDENCE_SMOKE_KMS_ARN="$value" ;;
    esac
  done
  # 環境変数の固定キーが AWS プロファイルより優先されるのを防ぐ。
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_WEB_IDENTITY_TOKEN_FILE AWS_ROLE_ARN
  export AWS_PROFILE="$profile" STORDEX_EVIDENCE_SMOKE_CONFIRM=WRITE_SYNTHETIC_PDF
  ./node_modules/.bin/tsx scripts/smoke-stordex-evidence-sandbox.ts
)
```

成功時は `PASS: synthetic PDF stored with SSE-KMS ...` と、合成オブジェクトのキー・バージョンが出る。実際の請求書は受け付けない。この処理は DB、Vercel のフラグ、CreditNote を変更しない。オブジェクトや KMS キーを自動削除せず、スタック削除時もバケットとキーを保持する。不要になったときは書き込みを止め、対象を確認してから別途廃止する。

根拠となる AWS ドキュメントは [条件付き書き込み](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html) と [バージョニングの有効化](https://docs.aws.amazon.com/AmazonS3/latest/userguide/manage-versioning-examples.html)。
