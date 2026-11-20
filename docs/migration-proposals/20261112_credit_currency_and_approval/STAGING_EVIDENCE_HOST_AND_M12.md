# Staging 専用ホストと Migration #12 の準備

**状態はレビュー候補まで。マージと実適用は未承認。** AWS リソース、DNS、現行 Vercel Staging、Neon DB、機能フラグは変更しない。本番は対象外。

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

## 東京リージョンの専用ホスト費用（参考）

2026-11-19 時点の Linux オンデマンド参考単価。AWS 非本番（`nammoku-nonprod` / `262741079258` / `ap-northeast-1`）向け。AWS の USD 請求額の概算で、730 時間、1 台、gp3 合計 30 GB、2 AZ の公開 ALB、1 台のゾーン NAT Gateway を仮定する。

| 項目 | 試算の前提 | 月額 |
| --- | --- | ---: |
| EC2 t3.medium | $0.0544/時間 | $39.71 |
| gp3 | ルートと再開記録の合計 30 GB × $0.096/GB月 | $2.88 |
| HTTPS ALB | $0.0243/時間 | $17.74 |
| ゾーン NAT Gateway | $0.062/時間 | $45.26 |
| Public IPv4 | ALB 2 個・NAT 1 個 × $0.005/時間 | $10.95 |
| KMS | 専用キー 1 個 | $1.00 |
| **固定費の目安** | VPC 内で全て新設 | **$117.54** |

7 日間だけ上記リソース全体が課金されると仮定した場合は約 **$27**。EC2 だけ停止しても ALB、NAT、EBS 等の課金は続く。実際には保持するチェックポイント用 EBS、KMS キー、オブジェクト、ログ等の契約・保存費用が続く。ALB の $0.008/LCU 時間、NAT の $0.062/処理 GB、転送、T3 追加 CPU クレジット、S3、ログ、KMS リクエスト、税は別途。VPC の既存 ALB と NAT を追加固定費なしで共用できる場合は、EC2・EBS・専用 KMS の合計で **約 $43.59/月＋従量費**。共用できるかは未確認。同じアカウント・VPC で、ルート、認証境界、許可 CIDR、証明書、管理者責任を確認して判断する。S3 への通信は既存の S3 Gateway Endpoint があれば経路とポリシーを確認する。

参考単価の確認先は [EC2](https://aws.amazon.com/ec2/pricing/on-demand/)、[EBS](https://aws.amazon.com/ebs/pricing/)、[ELB](https://aws.amazon.com/elasticloadbalancing/pricing/)、[VPC・IPv4](https://aws.amazon.com/vpc/pricing/)、[KMS](https://aws.amazon.com/kms/pricing/)。

## Migration #12 の正式ファイル候補

| 項目 | 値 |
| --- | --- |
| CI 確認元 | [CI #1259](https://github.com/nammoku-solutions/stordex/actions/runs/44472968031) の候補アーティファクト |
| Prisma 名 | `20261119120000_b2b_invoice_evidence_and_review` |
| SQL SHA-256 | `8ea57dda5cd5a8a7233e982d133b31a776c5d9e15520417ba50b57494634ed96` |
| レビュー候補 `prisma/schema.prisma` SHA-256 | `526d9541ef9fd73a0b611d0c0f5b77b8718cf5015f6d38a0d0e18588447162bd` |
| 実環境 preflight 基準 | `be798a9087af04433a226cdf72456944d057115d`（11本） |

SQL は CI で照合した候補からバイト単位でコピーしたため、先頭に設計提案時の警告コメントが残っている。正式ファイルは**このレビュー候補に限って Prisma の探索対象**。実 Staging への適用許可を意味しない。Prisma schema は既存の識別子とコメントを保持し、3 台帳と参照に必要な変更だけを移植した。CI の別 DB では先に 11 本を適用し、続いて正式ファイルとこのレビュー候補の schema を使って 12 本目、drift、再実行の no-op を検証する。DDL 内の PostgreSQL チェック制約、式インデックス、トリガーは Prisma schema では完全に表現できないので SQL レベルの検証も維持する。

## Migration #12 の順序

1. **候補を照合する。** CI の `stordex-credit-m12-candidate-not-approved` を取得して `sha256sum --check SHA256SUMS` を実行する。`deploy-rehearsal.json` の仮マイグレーション名、SQL と Prisma schema の SHA-256、29/11 → 32/12、6 ガード、3 空台帳、CI のコミットを照合する。照合元の提案版は `docs/migration-proposals` に保持する。
2. **最終案を準備する。** 承認対象にする SQL・Prisma schema をこのレビュー候補 PR に用意し、実ファイル名とハッシュを固定する。名前・バイト列が CI 候補と違う場合は再検証する。使い捨て DB 上では `prisma migrate deploy` を2回通し、2回目が no-op であることを確認する。11本の既存ファイルを書き換えない。
3. **実環境の適用前。** 対象を Neon `stordex-staging (dry-feather-14704968)` / `staging (br-sparkling-boat-ao9nrctp)` / `neondb` の非プール接続に固定する。事前の読み取り専用 preflight は、**11本だけがコミットされている上記適用前基準から**実行する。書き込み停止後に暗号化バックアップを1回採取し、別プロジェクト `stordex-recovery-test (delicate-rice-23940930)` / `production (br-ancient-voice-aoutl8qq)` の新しい復元 DB で独立 Restore を1回検証する。このブランチ名の `production` は本番サービスではない。29テーブルの件数と内容ハッシュ、および11本の履歴チェックサムが一致するまで適用しない。
4. **実適用と事後確認。** 正式ファイル、正確な SHA-256、対象、Restore PASS の確認と承認後に限り、12本を含む確定版から `prisma migrate deploy` を1回実行する。SQL 単体の手動実行と履歴の手入力を混ぜない。32テーブル、12本完了、未完了ゼロ、6ガード、3空台帳、既存29テーブルの内容不変を事後照合する。失敗時は再実行前に台帳とトランザクション結果を確認し、フラグは OFF のままにする。
5. **Staging UAT。** 合成 PDF のみを使用し、[Staging 検証手順](STAGING_EVIDENCE_UAT.md) を通す。元請求書、CreditNote、在庫、決済を変更しない。通し検証後はフラグを OFF に戻す。

詳細条件は [リリースゲート](RUNBOOK_AND_RELEASE_GATE.md)。このレビュー候補の準備で、バックアップ・Restore・実適用はいずれも実行しない。


### WSL でのバックアップと独立 Restore

Jun の WSL で、Python 3.11+、接続先 PostgreSQL と互換の `psql`・`pg_dump`・`pg_restore`、GPG を使う。いつもの Neon の**直接接続**（接続先に `-pooler` がないもの）のホスト名、DB ロール、パスワードを端末内だけで入力する。保管パスフレーズはローカルで管理し、チャットや Git に貼らない。

```bash
# Backup: stordex-staging (dry-feather-14704968)
# Branch: staging (br-sparkling-boat-ao9nrctp), database: neondb
python3 scripts/staging-m12-recovery.py backup

# Restore: stordex-recovery-test (delicate-rice-23940930)
# Branch: production (br-ancient-voice-aoutl8qq), maintenance database: neondb
# Restore destination: a NEW stordex_m12_restore_* database, created by the script
read -r -p 'Local backup directory: ' STORDEX_M12_BACKUP_DIR
python3 scripts/staging-m12-recovery.py restore "$STORDEX_M12_BACKUP_DIR"
unset STORDEX_M12_BACKUP_DIR
```

`backup` が表示した `~/stordex-private-backups/m12-...` の実際のフルパスを入力する。バックアップは `public` の29テーブルと11本の履歴を同じ PostgreSQL スナップショットから取得し、平文ファイルを作らず GPG AES-256 に直接流す。`restore` は暗号化ファイルの SHA-256 と復号を確認し、新しい空 DB にだけ復元する。復元後は全29テーブルの行数と内容ハッシュ、および11本の履歴を照合する。

共有するのは `RESTORE_PASS` の1行のみ。バックアップ、マニフェスト、パスフレーズはローカルに残す。再実行で既存の DB を使い回したり削除したりしない。失敗時は `STOP` と新規復元 DB 名が表示されていればその名前を連絡する。Staging への適用時は別途、書き込み停止とこのバックアップ以降の変更がないことを確認する。
