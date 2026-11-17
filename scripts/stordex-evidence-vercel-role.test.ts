import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const roleTemplate = read("../infra/aws/stordex-evidence-vercel-role.json");
const sandboxTemplate = read("../infra/aws/stordex-evidence-sandbox.json");
const role = roleTemplate.Resources.VercelEvidenceRole.Properties;
const statement = role.Policies[0].PolicyDocument.Statement;
const templateVars = {
  VercelTeamSlug: "example-team",
  ProviderArn: "arn:aws:iam::123456789012:oidc-provider/oidc.vercel.com/example-team",
  IssuerHostPath: "oidc.vercel.com/example-team",
};

describe("isolated Stordex evidence OIDC role", () => {
  it("creates only one runtime role and requires an existing team issuer", () => {
    expect(Object.keys(roleTemplate.Resources)).toEqual(["VercelEvidenceRole"]);
    expect(roleTemplate.Resources.VercelEvidenceRole.Type).toBe("AWS::IAM::Role");
    expect(role.MaxSessionDuration).toBe(3600);
    expect(role.AssumeRolePolicyDocument["Fn::Sub"][1]).toEqual({
      ProviderArn: { "Fn::Sub": "arn:${AWS::Partition}:iam::${AWS::AccountId}:oidc-provider/oidc.vercel.com/${VercelTeamSlug}" },
      IssuerHostPath: { "Fn::Sub": "oidc.vercel.com/${VercelTeamSlug}" },
    });
  });

  it("trusts precisely one project and environment, not the shared app project or pull request previews", () => {
    const trust = JSON.parse(role.AssumeRolePolicyDocument["Fn::Sub"][0]
      .replace(/\$\{(\w+)\}/g, (_: string, key: keyof typeof templateVars) => templateVars[key]));
    expect(trust.Statement).toEqual([{
      Effect: "Allow",
      Principal: { Federated: templateVars.ProviderArn },
      Action: "sts:AssumeRoleWithWebIdentity",
      Condition: { StringEquals: {
        "oidc.vercel.com/example-team:aud": "https://vercel.com/example-team",
        "oidc.vercel.com/example-team:sub": "owner:example-team:project:stordex-evidence-staging:environment:production",
      } },
    }]);
  });

  it("grants only synthetic-version reads/writes and bucket checks, without listing or deleting objects", () => {
    expect(statement.map((s: { Action: string[] }) => s.Action)).toEqual([
      ["s3:GetBucketTagging", "s3:GetBucketPublicAccessBlock", "s3:GetBucketVersioning", "s3:GetBucketOwnershipControls", "s3:GetEncryptionConfiguration"],
      ["s3:PutObject", "s3:GetObjectVersion"],
      ["kms:GenerateDataKey", "kms:Decrypt"],
    ]);
    const bucketName = sandboxTemplate.Resources.SandboxBucket.Properties.BucketName["Fn::Sub"];
    const scope = "arn:${AWS::Partition}:s3:::" + bucketName;
    expect(statement[0].Resource["Fn::Sub"]).toBe(scope);
    expect(statement[1].Resource["Fn::Sub"]).toBe(scope + "/b2b-credit-evidence/uat-synthetic-seller/uat-synthetic-invoice/*");
    expect(statement.every((s: { Effect: string }) => s.Effect === "Allow")).toBe(true);
  });

  it("allows KMS use only through regional S3 for the same synthetic object prefix", () => {
    expect(statement[2].Resource["Fn::Sub"]).toBe("arn:${AWS::Partition}:kms:${AWS::Region}:${AWS::AccountId}:key/${SandboxKeyId}");
    expect(statement[2].Condition).toEqual({
      StringEquals: { "kms:ViaService": { "Fn::Sub": "s3.${AWS::Region}.${AWS::URLSuffix}" } },
      StringLike: { "kms:EncryptionContext:aws:s3:arn": statement[1].Resource },
    });
    expect(sandboxTemplate.Resources.SandboxBucket.Properties.BucketEncryption
      .ServerSideEncryptionConfiguration[0].BucketKeyEnabled ?? false).toBe(false);
  });
});
