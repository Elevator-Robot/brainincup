import { defineAuth, secret } from '@aws-amplify/backend';

/**
 * Define and configure your auth resource
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */

// Check if we should include external providers based on environment
const shouldIncludeExternalProviders = process.env.AMPLIFY_EXTERNAL_PROVIDERS !== 'false';

// Log warning if external providers are disabled
if (!shouldIncludeExternalProviders) {
  console.warn('⚠️  External providers disabled. Set AMPLIFY_EXTERNAL_PROVIDERS=true to enable Google and Facebook login.');
}

// Base external providers configuration with callback URLs
const baseExternalProviders = {
  callbackUrls: [
    'http://localhost:5173/',
    'https://brainincup.com/'
  ],
  logoutUrls: [
    'http://localhost:5173/',
    'https://brainincup.com/'
  ]
};

// External providers with secrets (only included when enabled)
const externalProvidersWithSecrets = {
  ...baseExternalProviders,
  google: {
    clientId: secret('GOOGLE_CLIENT_ID'),
    clientSecret: secret('GOOGLE_CLIENT_SECRET'),
    attributeMapping: {
      email: 'email',
      nickname: 'given_name'
    },
    scopes: ['email', 'profile', 'openid']
  },
  facebook: {
    clientId: secret('FACEBOOK_CLIENT_ID'),
    clientSecret: secret('FACEBOOK_CLIENT_SECRET'),
    attributeMapping: {
      email: 'email',
      nickname: 'name'
    },
    scopes: ['email', 'public_profile']
  }
};

export const auth = defineAuth({
  loginWith: {
    email: true,
    externalProviders: shouldIncludeExternalProviders ? externalProvidersWithSecrets : baseExternalProviders
  },
  userAttributes: {
    nickname: {
      required: true,
      mutable: true
    },
    address: {
      required: false,
      mutable: true
    }
  }
});
