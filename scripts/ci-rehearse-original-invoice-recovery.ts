import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import pg from "pg";
import { createOriginalInvoiceRecordingCheckpoint } from "../src/lib/b2b-credit-original-document-checkpoint";
import { createOriginalInvoicePrivateStorage } from "../src/lib/b2b-credit-original-document-storage";
import type { OriginalInvoiceWriteIntent } from "../src/lib/b2b-credit-original-document-intake";
import type { recordConfirmedOriginalInvoice } from "../src/lib/b2b-credit-original-document-recording";
import { buildSyntheticPdf } from "./smoke-stordex-evidence-sandbox";

type RecordPort = Parameters<typeof recordConfirmedOriginalInvoice>[1]["recordIfCurrent"];
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

async function main() {
  const url = process.env.DATABASE_URL;
  assert.ok(process.env.CI === "true" && process.env.GITHUB_ACTIONS === "true" && process.env.APP_ENV === "ci" &&
    url === "postgresql://stordex:stordex@localhost:5432/stordex?schema=public",
    "Evidence recovery rehearsal requires the disposable GitHub Actions PostgreSQL service");
  const client = new pg.Client({ connectionString: url });
  const dir = await mkdtemp(join(tmpdir(), "stordex-recovery-"));
  try {
    await client.connect();
    const { rows: [database] } = await client.query(
      "SELECT current_database() AS db, current_setting('neon.project_id',true) AS neon_project",
    );
    assert.equal(database.db, "stordex");
    assert.equal(database.neon_project, null);
    const seller = "ci-m12-seller";
    const invoiceId = "ci-m12-invoice";
    const actor = "ci-m12-maker";
    const sourceInvoiceNumber = "CI-INV-0001";
    const config = {
      bucket: "stordex-synthetic-ci", expectedBucketOwner: "123456789012",
      kmsKeyArn: "arn:aws:kms:ap-northeast-1:123456789012:key/12345678-1234-1234-1234-123456789012",
    };
    const metadata = { ServerSideEncryption: "aws:kms", SSEKMSKeyId: config.kmsKeyArn, ContentType: "application/pdf" };
    const bytes = buildSyntheticPdf(randomUUID());
    const key = `b2b-credit-evidence/${seller}/${invoiceId}/${randomUUID()}.pdf`;
    const version = "committed-ci-version";
    let object: Buffer | undefined;
    let puts = 0;
    let reads = 0;
    const fakeS3 = {
      async send(command: PutObjectCommand | HeadObjectCommand | GetObjectCommand) {
        assert.equal(command.input.Key, key);
        if (command instanceof PutObjectCommand) {
          puts++;
          assert.equal(command.input.IfNoneMatch, "*");
          assert.equal(object, undefined);
          object = Buffer.from(command.input.Body as Uint8Array);
          throw new Error("synthetic lost response after PUT committed");
        }
        assert.ok(object);
        const headers = { ...metadata, VersionId: version, ContentLength: object.byteLength };
        if (command instanceof HeadObjectCommand) return headers;
        assert.ok(command instanceof GetObjectCommand);
        assert.equal(command.input.VersionId, version);
        reads++;
        return { ...headers, Body: Readable.from([object]) };
      },
    } as unknown as S3Client;
    const storage = createOriginalInvoicePrivateStorage(fakeS3, config);

    // A CI-only transaction port for this single known zero-order fixture.
    // The eventual application port must use the full canonical source snapshot.
    async function currentSource() {
      return (await client.query(
        'SELECT i."invoiceNumber", i.status, i.subtotal, i.tax, i.total, u.role, t.status AS "tenantStatus" ' +
        'FROM "Invoice" i JOIN "Tenant" t ON t.id=i."tenantId" JOIN "User" u ON u."tenantId"=t.id ' +
        'WHERE i.id=$1 AND t.id=$2 AND u.id=$3 FOR SHARE OF i,t,u',
        [invoiceId, seller, actor],
      )).rows[0];
    }
    const intent: OriginalInvoiceWriteIntent = {
      identity: { sellerTenantId: seller, invoiceId, key, sha256: hash(bytes), byteLength: bytes.byteLength },
      sourceInvoiceNumber, submittedByUserId: actor, invoiceSnapshotSha256: hash(JSON.stringify(await currentSource())),
    };
    const first = await createOriginalInvoiceRecordingCheckpoint(dir);
    const id = await first.saveIntent(intent);
    await assert.rejects(storage.put(intent.identity, bytes), /synthetic lost response/);
    assert.deepEqual(await first.pendingIds(), []);

    let loseDbResponse = true;
    const recordIfCurrent: RecordPort = async row => {
      const { receipt } = row;
      await client.query("BEGIN");
      let committed = false;
      try {
        const source = await currentSource();
        if (!source || source.invoiceNumber !== row.sourceInvoiceNumber || !["ISSUED", "PAID"].includes(source.status) ||
            !["ADMIN", "OWNER"].includes(source.role) || source.tenantStatus !== "ACTIVE" ||
            hash(JSON.stringify(source)) !== row.invoiceSnapshotSha256 ||
            receipt.sellerTenantId !== seller || receipt.invoiceId !== invoiceId || row.submittedByUserId !== actor) {
          await client.query("ROLLBACK");
          return { status: "SOURCE_CHANGED" };
        }
        const inserted = await client.query(
          'INSERT INTO "B2BInvoiceCurrencyEvidence" ("id","sellerTenantId","invoiceId","sourceInvoiceNumber",' +
          '"documentObjectRef","documentVersionId","documentByteLength","documentSha256","invoiceSnapshotSha256","submittedByUserId") ' +
          'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT ("documentObjectRef","documentVersionId") DO NOTHING',
          [row.evidenceId, seller, invoiceId, row.sourceInvoiceNumber, receipt.key, receipt.versionId,
            receipt.byteLength, receipt.sha256, row.invoiceSnapshotSha256, row.submittedByUserId],
        );
        const { rows: [stored] } = await client.query(
          'SELECT * FROM "B2BInvoiceCurrencyEvidence" WHERE "sellerTenantId"=$1 AND "invoiceId"=$2 ' +
          'AND "documentObjectRef"=$3 AND "documentVersionId"=$4',
          [seller, invoiceId, receipt.key, receipt.versionId],
        );
        await client.query("COMMIT");
        committed = true;
        if (loseDbResponse) throw new Error("synthetic lost acknowledgement after database commit");
        if (!stored) return { status: "CONFLICT" };
        return { status: inserted.rowCount ? "INSERTED" : "EXISTING", record: {
          evidenceId: stored.id, sourceInvoiceNumber: stored.sourceInvoiceNumber, submittedByUserId: stored.submittedByUserId,
          invoiceSnapshotSha256: stored.invoiceSnapshotSha256, receipt: {
            sellerTenantId: stored.sellerTenantId, invoiceId: stored.invoiceId, key: stored.documentObjectRef,
            versionId: stored.documentVersionId, sha256: stored.documentSha256, byteLength: stored.documentByteLength,
          },
        } };
      } catch (error) {
        if (!committed) await client.query("ROLLBACK");
        throw error;
      }
    };
    const second = await createOriginalInvoiceRecordingCheckpoint(dir);
    assert.deepEqual(await second.pendingIntentIds(), [id]);
    assert.deepEqual(await second.resumeIntent(id, { storage, recordIfCurrent }),
      { recorded: false, reason: "RECORD_UNCONFIRMED" });
    assert.deepEqual(await second.pendingIntentIds(), [id]);

    loseDbResponse = false;
    const result = await (await createOriginalInvoiceRecordingCheckpoint(dir)).resumeIntent(id, { storage, recordIfCurrent });
    assert.ok(result.recorded);
    assert.equal(result.currencyVerified, false);
    assert.equal(result.financialPostingAllowed, false);
    assert.deepEqual(await second.pendingIntentIds(), []);
    assert.equal(puts, 1);
    assert.equal(reads, 2);
    const { rows: [ledger] } = await client.query(
      'SELECT count(*)::int AS count, min("documentVersionId") AS version, min("documentSha256") AS digest ' +
      'FROM "B2BInvoiceCurrencyEvidence" WHERE "documentObjectRef"=$1', [key],
    );
    assert.deepEqual(ledger, { count: 1, version, digest: hash(bytes) });
    const { rows: [decisions] } = await client.query(
      'SELECT count(*)::int AS count FROM "B2BInvoiceCurrencyEvidenceEvent" WHERE "evidenceId"=$1', [result.evidenceId],
    );
    assert.equal(decisions.count, 0);
    console.log("ORIGINAL_INVOICE_RECOVERY_REHEARSAL_PASS (synthetic S3, real disposable PostgreSQL, one PUT and one ledger row)");
  } finally {
    await client.end();
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
