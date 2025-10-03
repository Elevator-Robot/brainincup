# Deployment Guide

This document explains how to deploy the Brain In Cup application with and without external authentication providers.

## Problem Statement

Previously, deploying the sandbox environment with `npx ampx sandbox` would fail if the required external provider secrets (Google, Facebook) were not configured in AWS Parameter Store:

```
AmplifySecretFetcherResource | Received response status [FAILED] from custom resource. 
Message returned: Failed to retrieve backend secret 'FACEBOOK_CLIENT_ID' for 'brain-in-cup'
```

This blocked development workflows when external provider secrets were not yet available.

## Solution

The authentication configuration now automatically provides default values for external provider secrets when they're not available:

- **Default behavior**: Uses real secrets when available, falls back to default values when missing
- **Development mode**: Set `AMPLIFY_EXTERNAL_PROVIDERS=false` to force default values
- **Production mode**: External providers work normally when secrets are properly configured

## Deployment Options

### Option 1: Local Development Deployment (Recommended)

Deploy with default values for external authentication providers:

```bash
npm run sandbox:local
```

This sets `AMPLIFY_EXTERNAL_PROVIDERS=false` and uses default values for Google/Facebook secrets, allowing deployment to succeed without configuring real secrets.

### Option 2: Production Deployment

Deploy with all external providers (requires secrets to be configured):

```bash
npm run sandbox
```

### Option 3: Using the Deployment Script

```bash
# For development
./scripts/sandbox-deploy.sh --no-external-providers

# For production
./scripts/sandbox-deploy.sh
```

### Option 4: Manual Environment Variable Control

```bash
# Disable external providers
AMPLIFY_EXTERNAL_PROVIDERS=false npx ampx sandbox

# Enable external providers (default)
AMPLIFY_EXTERNAL_PROVIDERS=true npx ampx sandbox
```

## Setting Up External Provider Secrets

When you're ready to enable external providers, configure the required secrets:

```bash
# Set Google secrets
npx ampx sandbox secret set GOOGLE_CLIENT_ID
npx ampx sandbox secret set GOOGLE_CLIENT_SECRET

# Set Facebook secrets
npx ampx sandbox secret set FACEBOOK_CLIENT_ID
npx ampx sandbox secret set FACEBOOK_CLIENT_SECRET
```

Then deploy with external providers enabled:

```bash
npm run sandbox
```

## CI/CD Integration

For CI/CD pipelines where external provider secrets might not be available:

```yaml
# GitHub Actions example
- name: Deploy Amplify Sandbox
  run: AMPLIFY_EXTERNAL_PROVIDERS=false npx ampx sandbox --once
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

## Configuration Details

The authentication configuration in `amplify/auth/resource.ts` uses conditional logic:

```typescript
const shouldIncludeExternalProviders = process.env.AMPLIFY_EXTERNAL_PROVIDERS !== 'false';

export const auth = defineAuth({
  loginWith: {
    email: true,
    externalProviders: shouldIncludeExternalProviders 
      ? externalProvidersWithSecrets 
      : baseExternalProviders
  },
  // ... rest of configuration
});
```

## Troubleshooting

**Q: I'm getting "Failed to retrieve backend secret" errors**
A: Use `npm run sandbox:no-external` to deploy without external providers

**Q: External providers aren't working after deployment**
A: Make sure you've configured the required secrets and deployed with `npm run sandbox`

**Q: How do I know if external providers are enabled?**
A: Check the console output during deployment for the warning message

**Q: Can I switch between modes after deployment?**
A: Yes, just redeploy with the desired configuration using the appropriate script