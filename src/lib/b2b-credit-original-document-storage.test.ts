import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOriginalInvoicePrivateStorage } from "./b2b-credit-original-document-storage";

const config = {
  bucket: "stordex-test-evidence", expectedBucketOwner: "123456789012",
  kmsKeyArn: "arn:aws:kms:ap-northeast-1:123456789012:key/12345678-1234-1234-1234-123456789012",
};
const bytes = Buffer.from("%PDF-1.7\nsynthetic\n%%EOF\n");
const candidate = {
  sellerTenantId: "seller-one", invoiceId: "invoice-one",
  key: "b2b-credit-evidence/seller-one/invoice-one/512a5555-1234-4321-9a12-123456789abc.pdf",
  sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length,
};
const receipt = { ...candidate, versionId: "immutable-version-1" };
const checksum = Buffer.from(candidate.sha256, "hex").toString("base64");
const encrypted = { ServerSideEncryption: "aws:kms", SSEKMSKeyId: config.kmsKeyArn };
const readResult = () => ({
  ...encrypted, VersionId: receipt.versionId, Body: Readable.from([bytes.subarray(0, 5), bytes.subarray(5)]),
  ContentLength: candidate.byteLength, ContentType: "application/pdf",
});
const send = vi.fn();
const store = createOriginalInvoicePrivateStorage({ send } as unknown as S3Client, config);

describe("version-bound, private original invoice storage", () => {
  beforeEach(() => send.mockReset());

  it("requires bucket ownership, KMS encryption, no overwrite, and the exact bytes' checksum", async () => {
    send.mockResolvedValue({ ...encrypted, VersionId: receipt.versionId, ChecksumSHA256: checksum });
    await expect(store.put(candidate, bytes)).resolves.toEqual(receipt);
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: config.bucket, ExpectedBucketOwner: config.expectedBucketOwner, Key: candidate.key,
      Body: bytes, ContentType: "application/pdf", ContentLength: bytes.length, IfNoneMatch: "*",
      ChecksumSHA256: checksum, ...encrypted,
    });
    expect(command.input).not.toHaveProperty("ACL");
    expect(send.mock.calls[0][1].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("rejects foreign object keys, invalid hashes and altered bytes before writing", async () => {
    await expect(store.put({ ...candidate, sellerTenantId: "seller-two" }, bytes)).rejects.toThrow();
    await expect(store.put({ ...candidate, sha256: "x".repeat(64) }, bytes)).rejects.toThrow();
    await expect(store.put(candidate, Buffer.alloc(bytes.length))).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it.each([{ VersionId: "null" }, { ChecksumSHA256: "wrong" }, { SSEKMSKeyId: "unexpected-key" }])(
    "does not return a receipt for an unverifiable provider response", async (override) => {
      send.mockResolvedValue({ ...encrypted, VersionId: receipt.versionId, ChecksumSHA256: checksum, ...override });
      await expect(store.put(candidate, bytes)).rejects.toThrow();
      expect(send).toHaveBeenCalledTimes(1);
    },
  );

  it("reads the recorded version, not the latest version", async () => {
    send.mockResolvedValue(readResult());
    await expect(store.read(candidate, receipt)).resolves.toEqual(bytes);
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({
      Bucket: config.bucket, ExpectedBucketOwner: config.expectedBucketOwner,
      Key: candidate.key, VersionId: receipt.versionId,
    });
  });

  it("blocks cross-tenant or cross-invoice reads without contacting S3", async () => {
    await expect(store.read({ ...candidate, sellerTenantId: "seller-two" }, receipt)).rejects.toThrow();
    await expect(store.read({ ...candidate, invoiceId: "invoice-two" }, receipt)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it("closes the response stream if the provider returns a different version", async () => {
    const response = readResult();
    send.mockResolvedValue({ ...response, VersionId: "other-version" });
    await expect(store.read(candidate, receipt)).rejects.toThrow();
    expect(response.Body.destroyed).toBe(true);
  });

  it.each([Buffer.alloc(bytes.length), Buffer.alloc(bytes.length + 1), Buffer.alloc(bytes.length - 1)])(
    "rejects changed, overlong, and truncated returned bytes", async (body) => {
      send.mockResolvedValue({ ...readResult(), Body: Readable.from([body]) });
      await expect(store.read(candidate, receipt)).rejects.toThrow();
    },
  );
});
