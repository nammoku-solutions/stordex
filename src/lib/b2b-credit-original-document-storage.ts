import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";

export const MAX_ORIGINAL_INVOICE_PDF_BYTES = 10 * 1024 * 1024;
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes);
const hashPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[A-Za-z0-9_-]{3,128}$/;
const objectName = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.pdf$/;

type Scope = Readonly<{ sellerTenantId: string; invoiceId: string }>;
type ObjectIdentity = Readonly<Scope & { key: string; sha256: string; byteLength: number }>;
export type OriginalInvoiceStorageReceipt = Readonly<ObjectIdentity & { versionId: string }>;
export type OriginalInvoiceStorageConfig = Readonly<{
  bucket: string;
  expectedBucketOwner: string;
  kmsKeyArn: string;
}>;

const fail = (): never => { throw new Error("Original invoice private storage verification failed"); };
const validVersion = (version: unknown): version is string =>
  typeof version === "string" && version !== "null" && /^[\x21-\x7e]{1,1024}$/.test(version);

function validIdentity(value: ObjectIdentity): boolean {
  if (typeof value.sellerTenantId !== "string" || !idPattern.test(value.sellerTenantId) ||
      typeof value.invoiceId !== "string" || !idPattern.test(value.invoiceId) ||
      typeof value.sha256 !== "string" || !hashPattern.test(value.sha256) || !Number.isInteger(value.byteLength) ||
      value.byteLength < 1 || value.byteLength > MAX_ORIGINAL_INVOICE_PDF_BYTES) return false;
  const prefix = `b2b-credit-evidence/${value.sellerTenantId}/${value.invoiceId}/`;
  return typeof value.key === "string" && value.key.startsWith(prefix) && objectName.test(value.key.slice(prefix.length));
}

export function isValidOriginalInvoiceStorageReceipt(receipt: OriginalInvoiceStorageReceipt): boolean {
  return validIdentity(receipt) && validVersion(receipt.versionId);
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

  return {
    async put(candidate: ObjectIdentity, bytes: Uint8Array): Promise<OriginalInvoiceStorageReceipt> {
      if (!validIdentity(candidate)) fail();
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
}
