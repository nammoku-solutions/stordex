# Staging 専用ホストと Migration #12 の準備

**状態は構成案と CI 検証まで。** AWS リソース、DNS、現行 Vercel Staging、Neon DB、機能フラグは変更しない。本番は対象外。

## 採用する構成

| 層 | Staging UAT 案 |
| --- | --- |
| 公開入口 | 東京の HTTPS ALB と ACM 証明書。接続元は UAT 担当者または承認済み VPN の CIDR のみ。ホスト名は `staging.stordex.jp` |
| 実行ホスト | AWS 非本番 `262741079258` の東京 `ap-northeast-1`。Ubuntu 24.04 LTS、Node.js 22、単一のプライベート EC2。初期検証は x86 / 4 GiB クラスを候補にし、シグネチャ再読込時も含め RSS、空きメモリ、キューを計測して決める |
| 通信 | EC2 に公開 IP や SSH の受信許可を付けない。ALB のセキュリティグループからのみアプリの 3000/TCP を許可。管理は Systems Manager。Neon の 5432/TCP と AWS/ClamAV 更新先の 443/TCP への送信経路を実環境のネットワークで確認 |
| スキャン | 同一ホストの `/run/stordex-clamd/clamd.sock`、0660、専用グループ。TCP リスナーは作らない。署名本体は公式 freshclam 更新サービスで維持 |
| 再開記録 | 独立した暗号化 gp3 EBS を `/var/lib/stordex-evidence` にマウントし、インスタンス終了時にも残す。ワーカー専用 `checkpoints` は 0700。PDF 本体はディレクトリに保存しない |
| オブジェクト | 専用 Staging S3 と KMS キー。バージョン管理、条件付き PUT、対象プレフィックス外の拒否、削除・上書き禁止を適用。既存の合成専用バケットと Vercel ロールを再利用しない |
| DB | Neon `stordex-staging (dry-feather-14704968)` / `staging (br-sparkling-boat-ao9nrctp)` / `neondb` |

`infra/evidence-uat` の設定はレビュー対象。AMI、サブネット、ルール、S3/KMS、IAM、証明書、外向き通信を先に決め、専用ホストに導入する。専用 EBS がマウント済みでなければ Node サービスは起動しない。アプリサービスを元のホストと同時に書き込み有効で動かさない。スキャナー障害は提出を拒否するが、それだけを理由に既存証拠の取り消しを止めない。

- `clamd.conf` を `/etc/stordex/clamd.conf` に配置し、同じ署名保存先を既定の freshclam サービスに使う。公式 DB のみ、3 日超の署名 DB を拒否する設定。CI では公式署名の代わりに無害なローカル署名だけを読み、暗号化 PDF、正常 PDF、署名一致、ソケット不在を同じ検査設定で照合する。実ホストでは署名のロードと更新を別途確認する。
- 2 つの systemd ユニットは `/etc/systemd/system` への導入候補。専用ユーザー `stordex`、グループ `stordex-evidence`、暗号化 EBS、リリースディレクトリ、書き込み可能な `.next/cache` を先に用意する。`/etc/stordex/staging.env` は root 管理の 0600。認証・DB・審査票の秘密は Git、ユーザーデータ、ログに入れない。
- 本番用の認証秘密を共有しない。`NEXTAUTH_URL` は `https://staging.stordex.jp`。ALB 経由の HTTPS と Origin が一致することを確認する。切替前は機能 OFF のホストでヘルス確認まで行う。現在の Vercel Staging は維持し、DNS 切替と戻し先は別途確定する。Vercel 固有の既存 UAT フラグを EC2 に持ち込まない。
- 既存プロジェクト側に流用できる ALB、NAT、VPC エンドポイントの存在は未確認。専用 ALB と外向き経路を新設する場合は EC2 以外の固定費も発生するため、AWS のリソース作成前に既存構成と費用を確認する。

## Migration #12 の順序

1. **候補を照合する。** CI の `stordex-credit-m12-candidate-not-approved` を取得して `sha256sum --check SHA256SUMS` を実行する。`deploy-rehearsal.json` の仮マイグレーション名、SQL と Prisma schema の SHA-256、29/11 → 32/12、6 ガード、3 空台帳、CI のコミットを照合する。候補はまだ `prisma/migrations` に置いていない。
2. **最終案を準備する。** 承認対象にする SQL・Prisma schema を別 PR に用意し、実ファイル名とハッシュを固定する。名前・バイト列が CI 候補と違う場合は再検証する。使い捨て DB 上では `prisma migrate deploy` を2回通し、2回目が no-op であることを確認する。11本の既存ファイルを書き換えない。
3. **実環境の適用前。** 対象を Neon `stordex-staging (dry-feather-14704968)` / `staging (br-sparkling-boat-ao9nrctp)` / `neondb` の非プール接続に固定する。事前の読み取り専用 preflight は、**11本だけがコミットされている適用前基準から**実行する。書き込み停止後に暗号化バックアップを1回採取し、別プロジェクト `stordex-recovery-test (delicate-rice-23940930)` / `production (br-ancient-voice-aoutl8qq)` の新しい復元 DB で独立 Restore を1回検証する。このブランチ名の `production` は本番サービスではない。29テーブルの件数と内容ハッシュ、および11本の履歴チェックサムが一致するまで適用しない。
4. **実適用と事後確認。** 正式ファイル、正確な SHA-256、対象、Restore PASS の確認と承認後に限り、12本を含む確定版から `prisma migrate deploy` を1回実行する。SQL 単体の手動実行と履歴の手入力を混ぜない。32テーブル、12本完了、未完了ゼロ、6ガード、3空台帳、既存29テーブルの内容不変を事後照合する。失敗時は再実行前に台帳とトランザクション結果を確認し、フラグは OFF のままにする。
5. **Staging UAT。** 合成 PDF のみを使用し、[Staging 検証手順](STAGING_EVIDENCE_UAT.md) を通す。元請求書、CreditNote、在庫、決済を変更しない。通し検証後はフラグを OFF に戻す。

詳細条件は [リリースゲート](RUNBOOK_AND_RELEASE_GATE.md)。このリポジトリ変更の時点では、バックアップ・Restore・実適用はいずれも実行していない。
