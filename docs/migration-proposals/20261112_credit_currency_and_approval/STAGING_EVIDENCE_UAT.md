# 原本請求書の証拠審査 — Staging 接続・検証計画

この変更で請求書詳細に提出・一覧・取得・審査・取り消しを追加する。既定では表示されず、API は初期化前に 404 を返す。Migration #12 は提案段階のまま。Staging DB、AWS リソース、環境変数、ルーティングを変更しない。

## 有効化前に確定させる対象

| 対象 | 設定・範囲 |
| --- | --- |
| 検証入口 | `https://staging.stordex.jp` のみ。本番と一般の Preview は対象外 |
| Staging DB | Neon `stordex-staging (dry-feather-14704968)`、`staging (br-sparkling-boat-ao9nrctp)`、`neondb` |
| AWS | `nammoku-nonprod`、`262741079258`、東京 `ap-northeast-1`。既存の合成専用バケットとロールは使わない |
| バックアップ・Restore | 上記 Staging DB の暗号化バックアップを作り、別プロジェクト `stordex-recovery-test (delicate-rice-23940930)` の `production (br-ancient-voice-aoutl8qq)` で新規復元 DB に照合。本番環境ではない |

1. [リリースゲート](RUNBOOK_AND_RELEASE_GATE.md) に従い、別途承認された Migration #12 の実ファイルとチェックサム、暗号化バックアップと独立 Restore、適用・事後照合を先に確認する。API は Staging DB のプロジェクト・ブランチ・DB と新テーブル3個が一致しなければ動かない。
2. この実装は同一ホストの ClamAV Unix ソケットと専用の永続暗号化ボリュームを必要とする。現在の Vercel Staging にはこの構成がないため、Vercel 上ではフラグを設定しても有効にならない。承認後、同一オリジンを維持する専用 Node ホストで機能を提供する構成を確定する。Vercel の一時領域を代用しない。
3. スキャナー設定、署名更新、PDF の暗号化・サイズ制限、バケットのバージョン管理・上書き防止・削除拒否、IAM の権限範囲を実ランタイムで照合する。UAT は合成 PDF のみで行う。AWS SDK にはホストの専用 IAM ロールを使用する。`nammoku-nonprod` は管理確認用でアプリへ固定キーを渡さない。
4. 単一ホストで `APP_ENV=staging`、`STORDEX_B2B_EVIDENCE_UAT_ENABLED=true` と明示した場合だけ接続する。他の B2B フラグは変更しない。次の設定を Staging の秘密管理に置く。

| 環境変数 | 値 |
| --- | --- |
| `STORDEX_EVIDENCE_UAT_BUCKET` | 別途承認・構成する Staging 専用の非公開バケット |
| `STORDEX_EVIDENCE_UAT_KMS_KEY_ARN` | 同じ NonProd アカウント・東京リージョンの専用キー |
| `STORDEX_EVIDENCE_UAT_CLAMD_SOCKET` | 同一ホストのプライベート Unix ソケットの絶対パス |
| `STORDEX_EVIDENCE_UAT_CHECKPOINT_DIR` | ワーカー所有で他ユーザーからアクセスできない永続暗号化ディレクトリの絶対パス |
| `STORDEX_EVIDENCE_UAT_TICKET_KEY` | 32 ランダムバイトをパディングなし Base64URL にした値。他環境や既存の認証鍵と共有しない |

## 通し検証

1. フラグ OFF と本番・別 Preview では画面が出ず、API が DB や S3 を読む前に 404 になることを確認する。
2. 同じ売り手の管理者 A と B、売り手 STAFF、別テナントの管理者を用意する。A が発行済みの合成請求書から PDF を提出し、一覧への登録を1回だけ確認する。結果が未確定なら同じ PDF を再送しない。運用担当者が専用ディレクトリの保留意図と S3 の保存版を照合する。
3. B が対象の原本を取得する。A、STAFF、別テナントからの取得を拒否する。ホスト外への公開 URL は返さず、PDF はキャッシュしない添付ファイルで返す。
4. B が PDF を開いて JPY と請求書番号を確認し、審査を記録する。取得から15分を超えた場合は再取得する。取得時の審査票を別ユーザー・別証拠へ移しても有効にならない。相違を見つけた場合は却下を記録する。
5. 確認済みの証拠を売り手の独立した管理者が取り消す。確認と取り消しの両方を保持し、その後の審査に使えないことを確認する。元請求書、CreditNote の金額・ステータス、在庫、決済は変化しない。
6. フラグを OFF に戻し、OFF の動作を再確認する。保留意図や証拠の消去を UAT 後処理として自動実行しない。

今回実施するのはコードと CI の検証のみ。実環境の E2E、マイグレーション適用、フラグ変更、ワーカー・バケットの作成は含まない。
