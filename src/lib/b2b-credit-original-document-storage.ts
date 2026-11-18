import { createHash } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";

export const MAX_ORIGINAL_INVOICE_PDF_BYTES = 10 * 1024 * 1024;
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes);
const hashPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[A-Za-z0-9_-]{3,128}$/;
const objectName = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.pdf$/;

type Scope = Readonly<{ sellerTenantId: string; invoiceId: string }>;
export type OriginalInvoiceObjectIdentity = Readonly<Scope & { key: string; sha256: string; byteLength: number }>;
type ObjectIdentity = OriginalInvoiceObjectIdentity;
export type OriginalInvoiceStorageReceipt = Readonly<ObjectIdentity & { versionId: string }>;
export type OriginalInvoiceStorageConfig = Readonly<{
  bucket: string;
  expectedBucketOwner: string;
  kmsKeyArn: string;
}>;

const fail = (): never => { throw new Error("Original invoice private storage verification failed"); };
const validVersion = (version: unknown): version is string =>
  typeof version === "string" && version !== "null" && /^[\x21-\x7e]{1,1024}$/.test(version);

export function isValidOriginalInvoiceObjectIdentity(value: unknown): value is ObjectIdentity {
  const candidate = value as Partial<ObjectIdentity> | null;
  if (!candidate || typeof candidate.sellerTenantId !== "string" || !idPattern.test(candidate.sellerTenantId) ||
      typeof candidate.invoiceId !== "string" || !idPattern.test(candidate.invoiceId) ||
      typeof candidate.sha256 !== "string" || !hashPattern.test(candidate.sha256) ||
      typeof candidate.byteLength !== "number" || !Number.isInteger(candidate.byteLength) ||
      candidate.byteLength < 1 || candidate.byteLength > MAX_ORIGINAL_INVOICE_PDF_BYTES) return false;
  const prefix = `b2b-credit-evidence/${candidate.sellerTenantId}/${candidate.invoiceId}/`;
  return typeof candidate.key === "string" && candidate.key.startsWith(prefix) && objectName.test(candidate.key.slice(prefix.length));
}

export function isValidOriginalInvoiceStorageReceipt(receipt: OriginalInvoiceStorageReceipt): boolean {
  return isValidOriginalInvoiceObjectIdentity(receipt) && validVersion(receipt.versionId);
}

export function originalInvoiceReceiptMatches(candidate: ObjectIdentity, receipt: OriginalInvoiceStorageReceipt): boolean {
  return isValidOriginalInvoiceStorageReceipt(receipt) && candidate.sellerTenantId === receipt.sellerTenantId &&
    candidate.invoiceId === receipt.invoiceId && candidate.key === receipt.key &&
    candidate.sha256 === receipt.sha256 && candidate.byteLength === receipt.byteLength;
}

/**
 * Internal S3 transport only. Inputs must originate from the server's authorization
 * and PDF scan workflow, never from a request-provided bucket, key, or receipt.
 * No public or presigned URLs, DB writes, or document/currency attestations.
 */
export function createOriginalInvoicePrivateStorage(client: S3Client, config: OriginalInvoiceStorageConfig) {
  const { bucket, expectedBucketOwner, kmsKeyArn } = config;
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
      !/^\d{12}$/.test(expectedBucketOwner) ||
      !/^arn:aws:kms:[a-z0-9-]+:\d{12}:key\/(?:[a-f0-9-]{36}|mrk-[a-f0-9]{32})$/.test(kmsKeyArn)) fail();

  const storage = {
    async put(candidate: ObjectIdentity, bytes: Uint8Array): Promise<OriginalInvoiceStorageReceipt> {
      if (!isValidOriginalInvoiceObjectIdentity(candidate)) fail();
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== candidate.byteLength) fail();
      // Snapshot before the asynchronous write so later caller mutations cannot change the bytes.
      const payload = Buffer.from(bytes);
      if (digest(payload).digest("hex") !== candidate.sha256) fail();
      const checksum = Buffer.from(candidate.sha256, "hex").toString("base64");
      const result = await client.send(new PutObjectCommand({
        Bucket: bucket, ExpectedBucketOwner: expectedBucketOwner, Key: candidate.key, Body: payload,
        ContentType: "application/pdf", ContentLength: payload.byteLength,
        IfNoneMatch: "*", ChecksumSHA256: checksum,
        ServerSideEncryption: "aws:kms", SSEKMSKeyId: kmsKeyArn,
      }), { abortSignal: AbortSignal.timeout(15_000) });
      const versionId = result.VersionId;
      if (!validVersion(versionId) || result.ChecksumSHA256 !== checksum ||
          result.ServerSideEncryption !== "aws:kms" || result.SSEKMSKeyId !== kmsKeyArn) return fail();
      return { ...candidate, versionId };
    },

    async read(scope: Scope, receipt: OriginalInvoiceStorageReceipt): Promise<Uint8Array> {
      if (scope.sellerTenantId !== receipt.sellerTenantId || scope.invoiceId !== receipt.invoiceId ||
          !isValidOriginalInvoiceStorageReceipt(receipt)) fail();
      const result = await client.send(new GetObjectCommand({
        Bucket: bucket, ExpectedBucketOwner: expectedBucketOwner, Key: receipt.key, VersionId: receipt.versionId,
      }), { abortSignal: AbortSignal.timeout(15_000) });
      const body = result.Body;
      if (!body || !(Symbol.asyncIterator in body)) return fail();
      // Acquire the iterator before metadata checks so the Node stream can be closed on every refusal.
      const chunks = body as AsyncIterable<Uint8Array>;
      if (result.VersionId !== receipt.versionId || result.ContentLength !== receipt.byteLength ||
          result.ContentType !== "application/pdf" || result.ServerSideEncryption !== "aws:kms" ||
          result.SSEKMSKeyId !== kmsKeyArn) {
        if ("destroy" in body && typeof body.destroy === "function") body.destroy();
        else await chunks[Symbol.asyncIterator]().return?.();
        return fail();
      }
      const output = Buffer.alloc(receipt.byteLength);
      let offset = 0;
      for await (const chunk of chunks) {
        if (!(chunk instanceof Uint8Array) || offset + chunk.byteLength > output.byteLength) fail();
        output.set(chunk, offset);
        offset += chunk.byteLength;
      }
      if (offset !== output.byteLength || digest(output).digest("hex") !== receipt.sha256) fail();
      return output;
    },
  };
  return {
    ...storage,
    /**
     * The private prefix must be write-once (conditional puts, no deletes or
     * key reuse). Discover a candidate version, then verify its exact bytes.
     * A missing object, permission failure or mismatch is not permission to PUT.
     */
    async recover(candidate: ObjectIdentity): Promise<OriginalInvoiceStorageReceipt> {
      if (!isValidOriginalInvoiceObjectIdentity(candidate)) fail();
      const identity = { ...candidate };
      const result = await client.send(new HeadObjectCommand({
        Bucket: bucket, ExpectedBucketOwner: expectedBucketOwner, Key: identity.key,
      }), { abortSignal: AbortSignal.timeout(15_000) });
      if (!validVersion(result.VersionId) || result.DeleteMarker || result.ContentLength !== identity.byteLength ||
          result.ContentType !== "application/pdf" || result.ServerSideEncryption !== "aws:kms" ||
          result.SSEKMSKeyId !== kmsKeyArn) return fail();
      const receipt = { ...identity, versionId: result.VersionId };
      await storage.read(identity, receipt);
      return receipt;
    },
  };
}
