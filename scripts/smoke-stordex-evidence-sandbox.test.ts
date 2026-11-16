import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { buildSyntheticPdf, readSandboxConfig, runEvidenceSandboxSmoke } from "./smoke-stordex-evidence-sandbox";

const env = {
  STORDEX_EVIDENCE_SMOKE_CONFIRM: "WRITE_SYNTHETIC_PDF",
  STORDEX_EVIDENCE_SMOKE_ACCOUNT: "123456789012",
  STORDEX_EVIDENCE_SMOKE_REGION: "ap-northeast-1",
  STORDEX_EVIDENCE_SMOKE_BUCKET: "stordex-evidence-sandbox-123456789012-ap-northeast-1",
  STORDEX_EVIDENCE_SMOKE_KMS_ARN: "arn:aws:kms:ap-northeast-1:123456789012:key/12345678-1234-1234-1234-123456789012",
};
const config = readSandboxConfig(env);

function mockS3({ publicAllowed = false, duplicateAllowed = false } = {}) {
  let bytes: Buffer | undefined;
  let checksum: string | undefined;
  const crypto = { ServerSideEncryption: "aws:kms", SSEKMSKeyId: config.kmsKeyArn };
  const send = vi.fn(async (command: { constructor: { name: string }; input: unknown }) => {
    switch (command.constructor.name) {
      case "GetBucketTaggingCommand": return { TagSet: [{ Key: "StordexScope", Value: "synthetic-evidence-sandbox" }] };
      case "GetPublicAccessBlockCommand": return { PublicAccessBlockConfiguration: {
        BlockPublicAcls: !publicAllowed, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true,
      } };
      case "GetBucketVersioningCommand": return { Status: "Enabled" };
      case "GetBucketOwnershipControlsCommand": return { OwnershipControls: { Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }] } };
      case "GetBucketEncryptionCommand": return { ServerSideEncryptionConfiguration: { Rules: [
        { ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "aws:kms", KMSMasterKeyID: config.kmsKeyArn } },
      ] } };
      case "PutObjectCommand": {
        if (bytes && !duplicateAllowed) throw Object.assign(new Error("PreconditionFailed"), { $metadata: { httpStatusCode: 412 } });
        const { Body, ChecksumSHA256 } = (command as PutObjectCommand).input;
        bytes = Buffer.from(Body as Uint8Array);
        checksum = ChecksumSHA256;
        return { ...crypto, VersionId: "mock-version", ChecksumSHA256: checksum };
      }
      case "GetObjectCommand": {
        expect((command as GetObjectCommand).input.VersionId).toBe("mock-version");
        return { ...crypto, VersionId: "mock-version", ContentType: "application/pdf",
          ContentLength: bytes?.length, Body: Readable.from([bytes!]) };
      }
      default: throw new Error("Unexpected command");
    }
  });
  return { send, client: { send } as unknown as S3Client };
}

describe("synthetic S3 sandbox smoke", () => {
  it("requires opt-in and an exact account/region/bucket/key binding", () => {
    expect(() => readSandboxConfig({})).toThrow();
    expect(() => readSandboxConfig({ ...env, STORDEX_EVIDENCE_SMOKE_BUCKET: "stordex-production" })).toThrow();
    expect(() => readSandboxConfig({ ...env, STORDEX_EVIDENCE_SMOKE_KMS_ARN: env.STORDEX_EVIDENCE_SMOKE_KMS_ARN.replace("123456789012", "234567890123") })).toThrow();
    expect(() => readSandboxConfig({ ...env, STORDEX_EVIDENCE_SMOKE_REGION: "us-east-1" })).toThrow();
  });

  it("generates a synthetic PDF with byte-accurate cross-reference offsets", () => {
    const pdf = buildSyntheticPdf("12345678-1234-1234-1234-123456789012").toString("ascii");
    expect(pdf).toContain("SYNTHETIC STORDEX UAT");
    const xref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
    expect(pdf.slice(xref, xref + 4)).toBe("xref");
    for (const [i, offset] of Array.from(pdf.matchAll(/^(\d{10}) 00000 n $/gm)).entries()) {
      expect(pdf.slice(Number(offset[1]))).toMatch(new RegExp(`^${i + 1} 0 obj`));
    }
  });

  it("uses the app adapter with the configured AWS account and exact version", async () => {
    const { send, client } = mockS3();
    await expect(runEvidenceSandboxSmoke(client, config)).resolves.toMatchObject({ versionId: "mock-version" });
    expect(send.mock.calls).toHaveLength(9);
    expect(send.mock.calls.every(([command]) => (command.input as { ExpectedBucketOwner?: string })
      .ExpectedBucketOwner === config.expectedBucketOwner)).toBe(true);
  });

  it("does not upload when privacy preflight fails", async () => {
    const { send, client } = mockS3({ publicAllowed: true });
    await expect(runEvidenceSandboxSmoke(client, config)).rejects.toThrow();
    expect(send.mock.calls.some(([command]) => command instanceof PutObjectCommand)).toBe(false);
  });

  it("does not pass if the duplicate key write is accepted", async () => {
    const { client } = mockS3({ duplicateAllowed: true });
    await expect(runEvidenceSandboxSmoke(client, config)).rejects.toThrow("Missing expected rejection");
  });

  it("checks that the template has no IAM grants or public policy allows", () => {
    const template = JSON.parse(readFileSync(new URL("../infra/aws/stordex-evidence-sandbox.json", import.meta.url), "utf8"));
    const resources = template.Resources;
    expect(Object.values(resources).map((r: unknown) => (r as {Type: string}).Type).sort())
      .toEqual(["AWS::KMS::Key", "AWS::S3::Bucket", "AWS::S3::BucketPolicy"]);
    expect(Object.values(resources.SandboxBucket.Properties.PublicAccessBlockConfiguration)).toEqual([true, true, true, true]);
    expect(resources.SandboxBucket.Properties.VersioningConfiguration.Status).toBe("Enabled");
    expect(resources.SandboxBucket.Properties.OwnershipControls.Rules).toEqual([{ ObjectOwnership: "BucketOwnerEnforced" }]);
    expect(resources.SandboxBucketPolicy.Properties.PolicyDocument.Statement
      .map((s: {Sid: string; Effect: string}) => [s.Sid, s.Effect]))
      .toEqual(["RequireTLS", "RequireConditionalCreate", "RequireKms", "RequireSandboxKey"].map(s => [s, "Deny"]));
  });
});
