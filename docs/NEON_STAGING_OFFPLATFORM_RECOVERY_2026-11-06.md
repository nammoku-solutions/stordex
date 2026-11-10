# Stordex｜Neon Staging独立バックアップ・復元検証手順

更新日: 2026-11-06 / 対象Issue: #109

## 2026-11-06の確認済み結果

Neonプロジェクト: `dry-feather-14704968` / DB: `neondb`

- **稼働Staging（保護対象）**: `br-sparkling-boat-ao9nrctp` (`staging`)
- **Production（絶対に対象外）**: `br-dry-heart-ao0s2ngj` (`production`)
- オーナーが過去の検証ブランチ4件を削除済み（残6/上限10）
- **新規検証コピー**: `br-patient-lab-aoaa90nc` (`stordex-staging-recovery-verify-20261106`)、親Staging、branch LSN `0/239A750`、READY
- コピー元と検証コピーの `neondb` SQLスキーマ差分なし
- **public 22テーブル**（`_prisma_migrations`を含む）の件数と各行JSONを基にしたハッシュ：22/22一致。例: Tenant=2、User=2、Item=9、InventoryMovement=20、IntercompanyOrder=5、PurchaseOrder=7、Order=4、Prisma migration=5
- 検証コピー作成後のNeon残りスロットは3/10（現在7/10）

> **注意**：Neon同一プロジェクト内のブランチ複製は復元できる別状態を提供するが、障害・誤操作・アカウント喪失からの独立した完全バックアップではない。子ブランチのStagingは現状Neonのsnapshot / PITRの対象外。オーナーが管理する外部の安全な保管先へ**論理バックアップ**を作成し、別プロジェクトの空DBに復元するまでマイグレーションを許可しない。

公式文書: https://neon.com/docs/manage/backup-pg-dump
https://neon.com/docs/postgres/backup-restore/branch-restore

## 1. Stagingから論理バックアップを取得

使用端末：オーナーが管理するMacまたはWSL等。以下はUnix系シェルの例で、**データの保管先はGitのリポジトリ外**とする。

PostgreSQLクライアントをインストールし、`pg_dump --version`と`pg_restore --version`を確認。サーバと互換性のある新しいバージョンを使用する。

Neon Console → プロジェクト → **Connect** → ブランチ **staging** を指定。**Connection poolingをOFF**にして、接続情報（ホスト・ユーザー・DB名・パスワード）を取得。**production、過去のバックアップブランチ、その他の検証ブランチを選ばない**。接続情報はGitHub・Chat・CIログへ投稿しない。

```bash
set -euo pipefail
umask 077
BACKUP_DIR="$HOME/stordex-private-backups"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Neon Consoleのstaging、unpooled接続情報を以下に設定する
export PGHOST='STAGING_UNPOOLED_HOST_FROM_NEON'
export PGPORT=5432
export PGDATABASE=neondb
export PGUSER='STAGING_DB_USER_FROM_NEON'
export PGSSLMODE=require
# 資格情報をコマンドの履歴に残さず入力
read -r -s -p 'Staging DB password: ' PGPASSWORD
printf '\n'
export PGPASSWORD

DUMP="$BACKUP_DIR/stordex-staging-20261106.dump"
pg_dump --format=custom --no-owner --no-acl --file="$DUMP"
pg_restore --list "$DUMP" > "$DUMP.toc"
sha256sum "$DUMP" > "$DUMP.sha256"
unset PGPASSWORD
printf 'Backup created and catalog verified: %s\n' "$DUMP"
```

`pg_dump`はStagingを読む操作であり、Staging DBスキーマ・データを変更しない。生成ファイルには企業情報・メールアドレス等の個人情報、パスワードハッシュ等が含まれ得るため、**Gitへのコミット、公開リンク共有、無保護のクラウド保存は禁止**。バックアップは暗号化したうえで別の安全な保管先に保存し、鍵の紛失・保持期間・削除手順を管理する。

## 2. バックアップファイルの検証

```bash
sha256sum -c "$DUMP.sha256"
pg_restore --list "$DUMP" | grep -E 'TABLE DATA|TABLE' | head -40
```

**sha256とTOCが通るだけではDBが復元可能であることの証明にはならない。**

## 3. 完全に分離した空DBで復元

新しい別のNeonプロジェクトまたは同等の独立したPostgreSQLサーバに、**空の**`neondb`を用意する。**稼働しているStagingやProduction、バックアップ保持ブランチを復元先に選ばない**。

再びNeon Consoleで**復元専用の別プロジェクト**のunpooled接続を選び、以下の`PGHOST` / `PGUSER` / `PGPASSWORD`だけをターゲット用に設定し直す。誤配線を防ぐため、`psql -Atqc 'SELECT current_database(), current_user;'`でデータベース名とユーザーを再確認し、必ず新規空DBであることをテーブル一覧で確認する。

```bash
export PGHOST='RESTORE_TEST_UNPOOLED_HOST_FROM_NEW_PROJECT'
export PGPORT=5432
export PGDATABASE=neondb
export PGUSER='RESTORE_TEST_DB_USER_FROM_NEW_PROJECT'
export PGSSLMODE=require
read -r -s -p 'Restore-test DB password: ' PGPASSWORD
printf '\n'
export PGPASSWORD

# 新規空DBにだけ実施。元のStagingやProductionに絶対に実行しない。
psql -Atqc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"
# ここで結果が0（空DB）であることを人が確認してから次へ
pg_restore --no-owner --no-acl --exit-on-error --single-transaction --dbname=neondb "$DUMP"
unset PGPASSWORD
```

上記は確認用の手順であり、バックアップと独立の復元先が準備されるまで実行しない。既存DBへ`--clean`、`--create`、`DROP`等を使用して上書きすることは禁止。

## 4. 復元後のPASS基準

- source Stagingの取得時点と復元先の**全22テーブルのスキーマ・件数・行内容ハッシュ**が一致
- `_prisma_migrations`の履歴・順序・checksumが一致し、failed migrationなし
- FK・CHECK・UNIQUE制約と重要なDBトリガーが揃う
- 代表シナリオを読取専用で確認：商品9、在庫移動20、テナント2、企業間取引5など（取得時点の期待件数）
- 復元時の`pg_restore`終了コードが0。DBへ接続して利用可能
- 暗号化されたバックアップの保持場所・復旧担当・鍵管理・削除期限を記録
- リストア結果を記録して、リリース対象の**マイグレーション名ごと**にオーナー承認を取得

## 5. 未完了と承認ゲート

2026-11-06現時点の実施済みは**Staging同一プロジェクトのクローン作成と、22テーブルの一致検証まで**。外部`pg_dump`の取得・別プロジェクトでの`pg_restore`は**未実施**。この文書の存在やCloneのPASSをもって独立復元済みと扱わない。

Issue #82のB2B返品・クレジットノートDraft PR群とCSVアーカイブのマイグレーションは、上記の復元PASS、migration順序・データ保持/削除ポリシー、オーナーによる対象別の明示承認までStaging DBに適用しない。Productionは全機能UAT後のCodex Astra全コードレビューPASSが必須。

---

## 2026-11-10 更新：#133適用後のStagingバックアップ（現行6件の移行に対応）

**重要:** この文書前半は2026-11-06時点の手順と5件の移行履歴を記録した歴史的検証ログ。現在のStagingでは、オーナーの個別承認により `20261104150000_b2b_seller_line_provenance` が追加され、**移行履歴は6件**である。前回の `.dump.gpg` は#133移行前の復元ポイントのため、次の返品申請DB移行前に新しい復元ポイントを取得する。

このリポジトリの旧 `scripts/backup-neon-staging-baselined.mjs` は**4マイグレーション時点専用**で、現在の6件のStagingには使用しない。

### 現行Staging向けの安全なバックアップ取得

新スクリプト `scripts/backup-neon-staging-post-provenance.sh` は、接続時にNeon DB自身が返すproject/branch ID、DB名、テーブル数、移行6件、#133のマイグレーションSHA256、次の#134未適用を**照合してから処理する**。異なる環境ならバックアップを作成しない。

- GPGの`--symmetric --cipher-algo AES256`を使用し、`pg_dump -Fc`の標準出力を直接暗号化。平文の`.dump`を生成しない
- WSL/UbuntuのCA証明書でNeonホスト名を検証（`verify-full`）、コネクションプーラーを拒否
- Gitリポジトリ外かつ所有者専用パーミッション700の保存先のみ許可。生成した`.dump.gpg`は600
- 取得後にGPGで復号したストリームから`pg_restore --list`を検証し、主要テーブルとマイグレーションのTABLE / TABLE DATAエントリーを確認
- 取得の前後で環境識別・テーブル数・マイグレーション数を再確認し、暗号化済みファイルのSHA256を生成
- ソースDBは読み取りのみ。バックアップファイル・パスワード・顧客データをGitHub、チャット、CIへ保存しない

WSLでコマンドを実行する（パスワードはコマンド履歴に入力しない）：

実行はStagingを含むローカルworktree/checkoutの`scripts/`から行う。保管先はWSLのGit管理外の`$HOME/stordex-private-backups`を推奨。Windows共有フォルダーへの直接保存や暗号化前の平文出力をしない。

```bash
cd ~/app/web_page/stordex  # 実際のStordexリポジトリディレクトリに置き換える
git fetch origin
# 作業中の別ブランチ・未コミット変更があればgit switchせず、
# origin/stagingから専用worktreeを使う。
git worktree add --detach ../stordex-backup-check origin/staging
cd ../stordex-backup-check

# Neon Consoleのstordex-staging → branch=staging → neondb → unpooled
# 接続設定からホスト名とユーザー名のみ入力（パスワードは後で安全に対話入力）
read -r -p 'Staging direct host: ' STORDEX_STAGING_BACKUP_HOST
read -r -p 'Staging DB user: ' STORDEX_STAGING_BACKUP_USER
export STORDEX_STAGING_BACKUP_HOST STORDEX_STAGING_BACKUP_USER

bash scripts/backup-neon-staging-post-provenance.sh --check
bash scripts/backup-neon-staging-post-provenance.sh --execute

# 出力の .dump.gpg を検査。パスワードをコマンドやチャットには記載しない。
cd ~/stordex-private-backups
ls -lh *.dump.gpg
sha256sum -c "$(ls -t *.dump.gpg.sha256 | head -1)"
```

`--execute`ではStaging DBパスワードと**GPG暗号化用パスフレーズ**が求められる。パスフレーズはパスワードマネージャーで管理し、GPG復号ができるか確認する。暗号化ファイルは別のアクセス管理された場所にも安全に複製し、暗号化鍵の保管・保持期限・復旧担当を記録する。

### 現行バックアップの復元PASS基準

`.dump.gpg`取得成功・TOCとファイルSHAの検証は**まだ復元成功ではない**。

1. StagingやProduction、既存復旧確認DBとは異なる**空のPostgreSQL DB**を選び、宛先のproject/branch/databaseを確認する（同じ `neondb` 名でも別プロジェクト・別DBであることが必須）。
2. GPGで復号したストリームを `pg_restore` に渡す（ディスク上の平文ファイルを作らない）。例：`set -o pipefail; gpg --decrypt archive.dump.gpg | pg_restore --no-owner --no-acl --exit-on-error --single-transaction --dbname=neondb`。復元先にのみ接続情報を設定し、**source Stagingを復元先に設定することは厳禁**。
3. 22テーブルのデータ指紋とDB構造（新しい売り手受注明細ID列・FK・UNIQUE・トリガー）および**Prisma6件の移行名とchecksum**が新しいバックアップと一致することを確認する。復元前後のデータ比較はバックアップ取得時点を基準とし、Stagingに後から発生した変更を誤って欠損と扱わない。
4. アクセス権限、暗号化鍵の復旧、オフデバイスの安全な複製、保持/削除ポリシーを記録。新しい返品申請DB `20261104153000_b2b_return_requests` は、**復元検証と対象を指定したオーナーの明示承認後のみ**Stagingへ適用する。

### 未実施のこと

2026-11-10時点で、この更新後の6マイグレーション版`pg_dump`の取得、独立した空DBへの復元、移行承認はまだ報告されていない。Neon内部の複製やDraft PR #134〜#136のCI PASSをもって独立バックアップ完了やStaging移行承認と見なさない。
