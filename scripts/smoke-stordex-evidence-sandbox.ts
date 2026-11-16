import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  GetBucketEncryptionCommand, GetBucketOwnershipControlsCommand,
  GetBucketTaggingCommand, GetBucketVersioningCommand, GetPublicAccessBlockCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { prepareOriginalInvoiceForPrivateStorage } from "../src/lib/b2b-credit-original-document-policy";
import { prepareIndependentOriginalInvoiceReview } from "../src/lib/b2b-credit-original-document-review";
import { createOriginalInvoicePrivateStorage } from "../src/lib/b2b-credit-original-document-storage";

type Env = Readonly<Record<string, string | undefined>>;
const scope = { sellerTenantId: "uat-synthetic-seller", invoiceId: "uat-synthetic-invoice" };
const invoiceNumber = "UAT-SYNTHETIC-001";

export function readSandboxConfig(env: Env) {
  const { STORDEX_EVIDENCE_SMOKE_CONFIRM: confirmation, STORDEX_EVIDENCE_SMOKE_ACCOUNT: account,
    STORDEX_EVIDENCE_SMOKE_REGION: region, STORDEX_EVIDENCE_SMOKE_BUCKET: bucket,
    STORDEX_EVIDENCE_SMOKE_KMS_ARN: kmsKeyArn } = env;
  assert.equal(confirmation, "WRITE_SYNTHETIC_PDF");
  assert.ok(account && /^\d{12}$/.test(account));
  assert.ok(region && /^[a-z]{2}-[a-z]+-\d$/.test(region));
  assert.ok(bucket && bucket === `stordex-evidence-sandbox-${account}-${region}`);
  assert.ok(kmsKeyArn && new RegExp(`^arn:aws:kms:${region}:${account}:key/(?:[a-f0-9-]{36}|mrk-[a-f0-9]{32})$`).test(kmsKeyArn));
  return { bucket, region, expectedBucketOwner: account, kmsKeyArn };
}

export function buildSyntheticPdf(marker: string) {
  assert.match(marker, /^[a-f0-9-]{36}$/);
  const stream = `BT /F1 14 Tf 50 720 Td (SYNTHETIC STORDEX UAT - ${invoiceNumber} - JPY) Tj 0 -30 Td (${marker}) Tj ET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.7\n";
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${offsets.length} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

export async function runEvidenceSandboxSmoke(client: S3Client, config: ReturnType<typeof readSandboxConfig>) {
  const address = { Bucket: config.bucket, ExpectedBucketOwner: config.expectedBucketOwner };
  const [tags, privacy, versioning, owner, encryption] = await Promise.all([
    client.send(new GetBucketTaggingCommand(address), { abortSignal: AbortSignal.timeout(15_000) }),
    client.send(new GetPublicAccessBlockCommand(address), { abortSignal: AbortSignal.timeout(15_000) }),
    client.send(new GetBucketVersioningCommand(address), { abortSignal: AbortSignal.timeout(15_000) }),
    client.send(new GetBucketOwnershipControlsCommand(address), { abortSignal: AbortSignal.timeout(15_000) }),
    client.send(new GetBucketEncryptionCommand(address), { abortSignal: AbortSignal.timeout(15_000) }),
  ]);
  assert.ok(tags.TagSet?.some(t => t.Key === "StordexScope" && t.Value === "synthetic-evidence-sandbox"));
  const block = privacy.PublicAccessBlockConfiguration;
  assert.ok(block?.BlockPublicAcls && block.BlockPublicPolicy && block.IgnorePublicAcls && block.RestrictPublicBuckets);
  assert.equal(versioning.Status, "Enabled");
  assert.deepEqual(owner.OwnershipControls?.Rules?.map(r => r.ObjectOwnership), ["BucketOwnerEnforced"]);
  assert.ok(encryption.ServerSideEncryptionConfiguration?.Rules?.some(r =>
    r.ApplyServerSideEncryptionByDefault?.SSEAlgorithm === "aws:kms" &&
    r.ApplyServerSideEncryptionByDefault.KMSMasterKeyID === config.kmsKeyArn));

  const bytes = buildSyntheticPdf(randomUUID());
  const prepared = prepareOriginalInvoiceForPrivateStorage({
    bytes, filename: "synthetic-stordex-invoice.pdf", mimeType: "application/pdf",
    context: {
      authenticatedUserId: "uat-synthetic-uploader", authenticatedTenantId: scope.sellerTenantId,
      authenticatedRole: "ADMIN", tenantActive: true, trustedInvoiceId: scope.invoiceId,
      trustedInvoiceSellerTenantId: scope.sellerTenantId, trustedInvoiceStatus: "ISSUED",
    },
  });
  assert.ok(prepared.accepted);
  const storage = createOriginalInvoicePrivateStorage(client, config);
  const identity = { ...scope, key: prepared.proposedPrivateObjectKey, sha256: prepared.sha256, byteLength: bytes.length };
  const receipt = await storage.put(identity, bytes);
  await assert.rejects(storage.put(identity, bytes), (error: unknown) =>
    typeof error === "object" && error !== null &&
    "$metadata" in error && (error.$metadata as { httpStatusCode?: number })?.httpStatusCode === 412);
  assert.deepEqual(await storage.read(scope, receipt), bytes);

  const snapshotSha256 = createHash("sha256").update("synthetic invoice snapshot only").digest("hex");
  const result = await prepareIndependentOriginalInvoiceReview({
    reviewer: { userId: "uat-synthetic-reviewer", ...scope, role: "OWNER", tenantActive: true },
    invoice: { id: scope.invoiceId, sellerTenantId: scope.sellerTenantId, invoiceNumber, status: "ISSUED", snapshotSha256 },
    submission: { submittedByUserId: "uat-synthetic-uploader", invoiceSnapshotSha256: snapshotSha256, receipt },
    observation: { originalInvoiceNumber: invoiceNumber, explicitCurrency: "JPY", inspectedOriginal: true },
  }, storage.read);
  assert.ok(result.ready && !result.reviewRecorded && !result.currencyVerified && !result.financialPostingAllowed);
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = readSandboxConfig(process.env);
    const client = new S3Client({ region: config.region, ignoreConfiguredEndpointUrls: true, maxAttempts: 1 });
    try {
      const receipt = await runEvidenceSandboxSmoke(client, config);
      console.log("PASS: synthetic PDF stored with SSE-KMS, overwrite denied, exact version read and rehashed, review preflight only");
      console.log(JSON.stringify({ sandboxBucket: config.bucket, syntheticObjectKey: receipt.key, syntheticVersion: receipt.versionId }));
    } finally {
      client.destroy();
    }
  } catch (error) {
    const value = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    console.error("FAIL: Stordex evidence sandbox smoke", value?.name ?? "UnknownError", value?.$metadata?.httpStatusCode ?? "");
    process.exitCode = 1;
  }
}
