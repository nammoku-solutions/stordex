# GitHub Actions OIDC

Repository identity:

- Owner ID: `322632577`
- Repository ID: `1220810506`
- Region: `ap-northeast-1` (Tokyo)

Create one least-privilege deploy role per GitHub Environment. Trust subjects:

```text
repo:nammoku-solutions@322632577/stordex@1220810506:environment:staging
repo:nammoku-solutions@322632577/stordex@1220810506:environment:production
```

The audience is `sts.amazonaws.com`. Do not use repository wildcards or
long-lived AWS access keys. Store each role ARN as `AWS_DEPLOY_ROLE_ARN` in
its matching GitHub Environment. The role needs the CloudFormation, Lambda,
CloudFront, S3, Route 53, ACM, IAM and CloudWatch operations required by the
reviewed SST plan.
