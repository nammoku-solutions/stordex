import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import pg from "pg";
import { createOriginalInvoiceRecordingCheckpoint } from "../src/lib/b2b-credit-original-document-checkpoint";
import { createOriginalInvoicePrivateStorage } from "../src/lib/b2b-credit-original-document-storage";
import type { OriginalInvoiceWriteIntent } from "../src/lib/b2b-credit-original-document-intake";
import { confirmedOriginalInvoiceEvidenceId,
  type ConfirmedOriginalInvoice, type recordConfirmedOriginalInvoice,
} from "../src/lib/b2b-credit-original-document-recording";
import { createOriginalInvoiceLedgerRecorder } from "../src/lib/b2b-credit-original-document-ledger";
import {
  createOriginalInvoiceDecisionRecorder, createOriginalInvoiceRevocationRecorder, type OriginalInvoiceDecisionInput,
} from "../src/lib/b2b-credit-original-document-decision";
import { loadTrustedOriginalInvoiceSource } from "../src/lib/b2b-credit-original-document-snapshot";
import { buildSyntheticPdf } from "./smoke-stordex-evidence-sandbox";

type RecordPort = Parameters<typeof recordConfirmedOriginalInvoice>[1]["recordIfCurrent"];
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

async function main() {
  const url = process.env.DATABASE_URL;
  assert.ok(process.env.CI === "true" && process.env.GITHUB_ACTIONS === "true" && process.env.APP_ENV === "ci" &&
    url === "postgresql://stordex:stordex@localhost:5432/stordex?schema=public",
    "Evidence recovery rehearsal requires the disposable GitHub Actions PostgreSQL service");
  const client = new pg.Client({ connectionString: url });
  const writerDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const dir = await mkdtemp(join(tmpdir(), "stordex-recovery-"));
  try {
    await client.connect();
    const { rows: [database] } = await client.query(
      "SELECT pg_backend_pid() AS pid, current_database() AS db, current_setting('neon.project_id',true) AS neon_project",
    );
    assert.equal(database.db, "stordex");
    assert.equal(database.neon_project, null);
    const seller = "ci-m12-seller";
    const invoiceId = "ci-recovery-invoice";
    const actor = "ci-m12-maker";
    const sourceInvoiceNumber = "CI-INV-RECOVERY";
    const orderId = "ci-recovery-order";
    const itemId = "ci-recovery-item";
    const replacementItemId = "ci-recovery-replacement-item";
    const lineA = "ci-recovery-line-a";
    const lineB = "ci-recovery-line-b";
    const customer = "ci-m12-customer";
    await client.query(
      'INSERT INTO "Invoice" ("id","tenantId","invoiceNumber","customerId","periodYear","periodMonth",' +
      '"status","subtotal","tax","total","updatedAt") ' +
      "VALUES ($1,$2,$3,$4,2026,11,'ISSUED',4400,440,4840,now())",
      [invoiceId, seller, sourceInvoiceNumber, customer],
    );
    await client.query(
      'INSERT INTO "Order" ("id","tenantId","orderNumber","customerId","subtotal","tax","total","updatedAt") ' +
      "VALUES ($1,$2,'CI-RECOVERY-ORDER',$3,4400,440,4840,now())",
      [orderId, seller, customer],
    );
    await client.query(
      'INSERT INTO "Item" ("id","tenantId","code","name","unit","updatedAt") ' +
      "VALUES ($1,$2,'CI-RECOVERY-ITEM','Synthetic recovery item','box',now())," +
      "($3,$2,'CI-RECOVERY-REPLACEMENT','Synthetic replacement item','box',now())",
      [itemId, seller, replacementItemId],
    );
    await client.query(
      'INSERT INTO "OrderItem" ("id","orderId","itemId","itemName","unit","quantity","unitPrice","amount") ' +
      "VALUES ($1,$3,$4,'Synthetic recovery item','box',1,2200,2200), ($2,$3,$4,'Synthetic recovery item','box',1,2200,2200)",
      [lineA, lineB, orderId, itemId],
    );
    await client.query('INSERT INTO "InvoiceOrder" ("invoiceId","orderId") VALUES ($1,$2)', [invoiceId, orderId]);
    const source = await writerDb.$transaction(tx =>
      loadTrustedOriginalInvoiceSource(tx, { id: actor, tenantId: seller }, invoiceId));
    assert.ok(source.accepted);
    const ledgerRecorder = createOriginalInvoiceLedgerRecorder(writerDb);
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

    const intent: OriginalInvoiceWriteIntent = {
      identity: { sellerTenantId: seller, invoiceId, key, sha256: hash(bytes), byteLength: bytes.byteLength },
      sourceInvoiceNumber, submittedByUserId: actor, invoiceSnapshotSha256: source.source.snapshotSha256,
    };
    const first = await createOriginalInvoiceRecordingCheckpoint(dir);
    const id = await first.saveIntent(intent);
    await assert.rejects(storage.put(intent.identity, bytes), /synthetic lost response/);
    assert.deepEqual(await first.pendingIds(), []);

    let loseDbResponse = true;
    const recordIfCurrent: RecordPort = async row => {
      const result = await ledgerRecorder.recordIfCurrent(row);
      assert.ok(result.status === "INSERTED" || result.status === "EXISTING");
      if (loseDbResponse) throw new Error("synthetic lost acknowledgement after database commit");
      return result;
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
    const confirmed: ConfirmedOriginalInvoice = {
      stored: true, evidenceRecorded: false, currencyVerified: false, financialPostingAllowed: false,
      submission: { sourceInvoiceNumber, submittedByUserId: actor, invoiceSnapshotSha256: intent.invoiceSnapshotSha256,
        receipt: { ...intent.identity, versionId: version } },
    };
    const pending = { ...confirmed.submission, evidenceId: confirmedOriginalInvoiceEvidenceId(confirmed) };
    const submit = ledgerRecorder.recordIfCurrent;
    assert.equal((await submit({ ...pending, evidenceId: "wrong-id" })).status, "CONFLICT");
    assert.equal((await submit({ ...pending, submittedByUserId: "ci-m12-foreign-admin" })).status, "SOURCE_CHANGED");
    assert.equal((await submit({ ...pending, receipt: { ...pending.receipt, sha256: "a".repeat(64) } })).status, "CONFLICT");
    assert.deepEqual((await Promise.all([submit(pending), submit(pending)])).map(x => x.status), ["EXISTING", "EXISTING"]);
    await client.query(`UPDATE "User" SET role='STAFF' WHERE id=$1`, [actor]);
    try {
      assert.equal((await submit(pending)).status, "SOURCE_CHANGED");
    } finally {
      await client.query(`UPDATE "User" SET role='ADMIN' WHERE id=$1`, [actor]);
    }

    // Exercise the actual writer with the exact-version storage adapter.
    const reviewer = "ci-m12-reviewer";
    const makeDecision = (
      userId: string, tenantId = seller,
      readStoredVersion: Parameters<typeof createOriginalInvoiceDecisionRecorder>[0]["readStoredVersion"] = storage.read,
    ) => createOriginalInvoiceDecisionRecorder({
      db: writerDb, requireReviewer: async () => ({ id: userId, tenantId }), readStoredVersion,
    });
    const decisionInput: OriginalInvoiceDecisionInput = {
      invoiceId, evidenceId: pending.evidenceId, eventId: randomUUID(), decision: "VERIFIED",
      reason: "Independent reviewer confirmed explicit JPY on the original",
      observation: { originalInvoiceNumber: sourceInvoiceNumber, explicitCurrency: "JPY", inspectedOriginal: true },
      inspectedVersionId: version, inspectedDocumentSha256: hash(bytes),
    };
    assert.equal((await makeDecision(actor)(decisionInput)).recorded, false);
    assert.equal((await makeDecision("ci-m12-foreign-admin", "ci-m12-foreign")(decisionInput)).recorded, false);
    assert.equal((await makeDecision(reviewer)({ ...decisionInput, inspectedVersionId: "other-version" })).recorded, false);
    assert.equal((await makeDecision(reviewer)({ ...decisionInput,
      observation: { ...decisionInput.observation, explicitCurrency: "USD" },
    })).recorded, false);
    assert.equal(reads, 2, "scope, version and observation must be checked before retrieving PDF bytes");
    const corruptRead = makeDecision(reviewer, seller, async (scope, receipt) => {
      await storage.read(scope, receipt);
      return Buffer.alloc(bytes.byteLength);
    });
    assert.deepEqual(await corruptRead(decisionInput), { recorded: false, reason: "DOCUMENT_UNAVAILABLE" });
    const roleChangedOnRead = makeDecision(reviewer, seller, async (scope, receipt) => {
      const fetched = await storage.read(scope, receipt);
      await client.query(`UPDATE "User" SET role='STAFF' WHERE id=$1`, [reviewer]);
      return fetched;
    });
    try {
      assert.equal((await roleChangedOnRead(decisionInput)).recorded, false);
    } finally {
      await client.query(`UPDATE "User" SET role='ADMIN' WHERE id=$1`, [reviewer]);
    }
    const changedOnRead = makeDecision(reviewer, seller, async (scope, receipt) => {
      const fetched = await storage.read(scope, receipt);
      await client.query('UPDATE "OrderItem" SET "itemId"=$2 WHERE id=$1', [lineA, replacementItemId]);
      return fetched;
    });
    try {
      assert.equal((await changedOnRead(decisionInput)).recorded, false);
    } finally {
      await client.query('UPDATE "OrderItem" SET "itemId"=$2 WHERE id=$1', [lineA, itemId]);
    }
    const verified = await makeDecision(reviewer)(decisionInput);
    assert.equal(verified.recorded, true);
    if (!verified.recorded) throw new Error("Decision recording failed");
    assert.equal(verified.financialPostingAllowed, false);
    assert.deepEqual(await makeDecision(reviewer)(decisionInput), { ...verified, replayed: true });
    assert.equal((await makeDecision(reviewer)({ ...decisionInput, reason: "An alternative review rationale" })).recorded, false);
    assert.equal((await makeDecision("ci-m12-checker")(decisionInput)).recorded, false);
    const { rows: decisionRows } = await client.query(
      'SELECT "eventType","reviewerUserId","observedCurrencyCode","observedDocumentSha256" ' +
      'FROM "B2BInvoiceCurrencyEvidenceEvent" WHERE "evidenceId"=$1', [pending.evidenceId],
    );
    assert.deepEqual(decisionRows, [{ eventType: "VERIFIED", reviewerUserId: reviewer,
      observedCurrencyCode: "JPY", observedDocumentSha256: hash(bytes) }]);

    const rejectedReceipt = { ...confirmed, submission: { ...confirmed.submission, receipt: {
      ...pending.receipt, key: `b2b-credit-evidence/${seller}/${invoiceId}/${randomUUID()}.pdf`,
    } } };
    const rejectedId = confirmedOriginalInvoiceEvidenceId(rejectedReceipt);
    assert.equal((await submit({ ...rejectedReceipt.submission, evidenceId: rejectedId })).status, "INSERTED");
    const mockExact = async (_scope: unknown, receipt: typeof pending.receipt) => {
      assert.deepEqual(receipt, rejectedReceipt.submission.receipt);
      return Buffer.from(bytes);
    };
    const rejectedInput = { ...decisionInput, evidenceId: rejectedId, eventId: randomUUID(),
      decision: "REJECTED" as const, reason: "Exact original did not establish JPY",
      observation: { ...decisionInput.observation, explicitCurrency: "USD" } };
    assert.equal((await makeDecision(reviewer, seller, mockExact)({ ...rejectedInput, eventId: decisionInput.eventId })).recorded, false);
    let readyCount = 0;
    let unblock!: () => void;
    const barrier = new Promise<void>(resolve => { unblock = resolve; });
    const concurrentReads: typeof mockExact = async (scope, receipt) => {
      const payload = await mockExact(scope, receipt);
      if (++readyCount === 2) unblock();
      await Promise.race([barrier, delay(5000, undefined, { ref: false }).then(() => { throw new Error("Both reviews must reach storage"); })]);
      return payload;
    };
    const competing = await Promise.all([
      makeDecision(reviewer, seller, concurrentReads)(rejectedInput),
      makeDecision("ci-m12-checker", seller, concurrentReads)({ ...rejectedInput, eventId: randomUUID() }),
    ]);
    assert.equal(competing.filter(result => result.recorded).length, 1);
    const { rows: rejections } = await client.query(
      'SELECT "eventType","observedCurrencyCode" FROM "B2BInvoiceCurrencyEvidenceEvent" WHERE "evidenceId"=$1', [rejectedId],
    );
    assert.deepEqual(rejections, [{ eventType: "REJECTED", observedCurrencyCode: null }]);
    assert.equal(readyCount, 2);
    console.log("ORIGINAL_INVOICE_DECISION_REHEARSAL_PASS (same version, reauthorization, replay and competing decisions)");

    // Change the referenced item and line details without altering invoice totals.
    // Confirm the writer waits for the change to commit before rereading.
    await client.query("BEGIN");
    let racing: ReturnType<RecordPort> | undefined;
    try {
      await client.query('UPDATE "OrderItem" SET amount=2199,"unitPrice"=2199,"itemId"=$2 WHERE id=$1', [lineA, replacementItemId]);
      await client.query('UPDATE "OrderItem" SET amount=2201,"unitPrice"=2201 WHERE id=$1', [lineB]);
      racing = submit(pending);
      // Attach a handler immediately so any early SQL error remains test output.
      void racing.catch(() => {});
      let blocked = false;
      for (let attempts = 0; attempts < 80; attempts++) {
        const { rows: [wait] } = await client.query(
          "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS blocked",
          [database.pid],
        );
        if (wait.blocked) { blocked = true; break; }
        await delay(50);
      }
      assert.ok(blocked, "writer must wait on an in-flight original line edit");
      await client.query("COMMIT");
      assert.equal((await racing).status, "SOURCE_CHANGED");
    } finally {
      await client.query("ROLLBACK");
      await racing?.catch(() => {});
    }
    const { rows: [unchanged] } = await client.query(
      'SELECT count(*)::int AS count, min("documentSha256") AS digest FROM "B2BInvoiceCurrencyEvidence" ' +
      'WHERE "sellerTenantId"=$1 AND "invoiceId"=$2 AND "documentObjectRef"=$3', [seller, invoiceId, key],
    );
    assert.deepEqual(unchanged, { count: 1, digest: hash(bytes) });
    console.log("ORIGINAL_INVOICE_RECOVERY_REHEARSAL_PASS (Prisma writer, exact replay, role removal and original line race)");

    // Revocation must work on historical evidence even after the source changed.
    const revokeAs = (id: string, tenantId = seller) => createOriginalInvoiceRevocationRecorder({
      db: writerDb, requireReviewer: async () => ({ id, tenantId }),
    });
    const revoke = revokeAs("ci-m12-checker");
    const revokeInput = {
      invoiceId, evidenceId: pending.evidenceId, eventId: randomUUID(),
      reason: "Original invoice details changed after the document was verified",
    };
    assert.equal((await revokeAs(actor)(revokeInput)).recorded, false);
    assert.equal((await revokeAs("ci-m12-foreign-admin", "ci-m12-foreign")(revokeInput)).recorded, false);
    assert.equal((await revokeAs("ci-m12-staff")(revokeInput)).recorded, false);
    assert.equal((await revoke({ ...revokeInput, evidenceId: rejectedId })).recorded, false);
    assert.equal((await revoke({ ...revokeInput, invoiceId: "ci-m12-invoice" })).recorded, false);
    const readsBeforeRevocation = reads;
    const revocations = await Promise.all([revoke(revokeInput), revoke(revokeInput)]);
    const [firstRevocation] = revocations.filter(r => r.recorded && !r.replayed);
    assert.ok(firstRevocation?.recorded);
    assert.deepEqual(revocations.filter(r => r.recorded && r.replayed), [{ ...firstRevocation, replayed: true }]);
    assert.equal(firstRevocation.financialPostingAllowed, false);
    assert.equal((await revoke({ ...revokeInput, eventId: randomUUID() })).recorded, false);
    assert.equal((await revoke({ ...revokeInput, reason: "A different reason for this decision" })).recorded, false);
    assert.equal(reads, readsBeforeRevocation);
    const { rows: history } = await client.query(
      'SELECT id,"eventType","observedCurrencyCode","observedDocumentSha256" FROM "B2BInvoiceCurrencyEvidenceEvent" ' +
      'WHERE "evidenceId"=$1 ORDER BY "eventType"', [pending.evidenceId],
    );
    assert.deepEqual(history, [
      { id: firstRevocation.decisionEventId, eventType: "REVOKED", observedCurrencyCode: null, observedDocumentSha256: hash(bytes) },
      { id: verified.decisionEventId, eventType: "VERIFIED", observedCurrencyCode: "JPY", observedDocumentSha256: hash(bytes) },
    ]);
    // Restore the synthetic source so the verification replay is blocked by
    // the revocation itself, not by stale invoice details.
    await client.query('UPDATE "OrderItem" SET amount=2200,"unitPrice"=2200,"itemId"=$2 WHERE id=$1', [lineA, itemId]);
    await client.query('UPDATE "OrderItem" SET amount=2200,"unitPrice"=2200 WHERE id=$1', [lineB]);
    assert.equal((await makeDecision(reviewer)(decisionInput)).recorded, false);
    assert.equal(reads, readsBeforeRevocation);
    console.log("ORIGINAL_INVOICE_REVOCATION_REHEARSAL_PASS (historical verification retained, no S3 call, no reactivation)");
  } finally {
    await Promise.all([client.end(), writerDb.$disconnect()]);
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
