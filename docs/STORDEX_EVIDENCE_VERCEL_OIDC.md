# Stordex 検証用 S3 と Vercel OIDC

Stordex の通常の Staging は `staging.stordex.jp` / Vercel と Neon のまま。AWS は検証用の非公開・版管理付き S3、専用 KMS キー、接続用 IAM/OIDC に限定する。この手順では、本番、VPC、Aurora、Staging の DNS や Neon を変更しない。

## なぜ接続テストのプロジェクトを分けるか

Vercel の OIDC `sub` はチーム・プロジェクト・環境を識別するが、通常の `preview` 環境では Git ブランチまで識別しない。既存 `stordex` プロジェクトの `preview` を AWS IAM で信頼すると、既存の `staging` ブランチだけに絞れない。そのため、最初のクラウド接続テストは **合成データ専用の Vercel プロジェクト `stordex-evidence-staging`** に限定する。現在の Staging の置き換えではなく、既存アプリ・Neon には接続しない。ここでいう `production` は、この検証プロジェクトだけの Vercel 環境ラベルであり、Stordex の本番ではない。

接続テスト用プロジェクトは作成済み。管理者だけが production デプロイを操作でき、信頼済みソースのみがその環境に入るようにする。プレビューのコードに AWS 権限を付与しない。通常の Staging で実アプリから AWS を呼ぶ際は、ブランチと環境が分離される接続方法を別途検証する。テンプレートを適用しても Vercel の設定や DNS は変わらない。

## スタックと権限

1. AWS Organizations で確認した NonProd アカウントと、AWS CLI の `nammoku-nonprod` プロファイルの `sts get-caller-identity` が一致することを確認する。リージョンは東京 `ap-northeast-1`。本番用の `nammoku-prod` はこの手順で使わない。
2. [S3＋KMS サンドボックス手順](STORDEX_INVOICE_EVIDENCE_AWS_SANDBOX.md) の CloudFormation を使う。専用キーが1本作成される。S3 Bucket Key は無効のままにする。IAM の KMS 条件がバケット ARN ではなく、**合成オブジェクトの ARN** の暗号化コンテキストに縛られているため。
3. NonProd で対象 Vercel チームの OIDC 発行元 `https://oidc.vercel.com/<team-slug>` と audience `https://vercel.com/<team-slug>` を確認し、IAM の既存 OIDC プロバイダーを再利用する。なければ同じ発行元・audience で作成する。共有のプロバイダーを削除・上書きしない。
4. `infra/aws/stordex-evidence-vercel-role.json` を同じアカウント・リージョンへ**別スタック**として適用する。パラメータは `VercelTeamSlug` と、サンドボックスが出力した KMS ARN の末尾の `SandboxKeyId`。実行前に CloudFormation の変更セットを確認し、専用 IAM ロール1つだけを作ることを確かめる。
5. ロールは合成ファイル用 prefix の条件付き書き込みと版指定読み込み、バケットの設定確認、同じ prefix に対して S3 経由で使う KMS だけを許可する。オブジェクトの一覧取得・削除、他の請求書、Neon、SES、SQS、EventBridge への権限は付けない。

## 実機検証の記録（2026-11-18）

- 東京 NonProd の `stordex-evidence-sandbox` と `stordex-evidence-vercel-role` は `CREATE_COMPLETE`。
- Vercel 検証専用プロジェクトのビルド `dpl_F7g4VdoeGs3W28WsyUyB9YmEnZuY` は READY。固定 AWS キーを登録せず、Vercel OIDC で専用ロールを引き受けた。
- 合成 PDF 1件を専用キーによる SSE-KMS で保存し、同一キーへの上書きを拒否（HTTP 412）。元のバージョン指定で読み戻し、SHA-256 一致と独立レビューの前処理を確認した。
- 実機で確認したのは専用ビルドからの成功経路のみ。既存アプリの共有 Preview や別プロジェクトからの引き受けは、完全一致の trust policy によって対象外。実機の拒否テストと、NonProd CLI セッションによる同じ合成 PDF の別実行は今回行っていない。
- 本体 Staging、Neon、本番、実請求書、レビュー結果や金額の書き込みは対象外。これは画面 UAT でも、実請求書を扱う機能の稼働許可でもない。

Vercel の接続設定は [Vercel AWS OIDC の手順](https://vercel.com/docs/oidc/aws) と [トークンの項目](https://vercel.com/docs/oidc/reference) を参照。
