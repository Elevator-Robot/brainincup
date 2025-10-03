import { defineAuth, secret } from '@aws-amplify/backend';
import { SecretValue } from 'aws-cdk-lib';
import type { BackendSecret } from '@aws-amplify/plugin-types';

/**
 * Define and configure your auth resource
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */

// Check if we're in a local/sandbox environment
const isLocalDevelopment = process.env.NODE_ENV === 'development' || 
                          process.env.AMPLIFY_ENVIRONMENT === 'sandbox' ||
                          process.env.AMPLIFY_EXTERNAL_PROVIDERS === 'false';

// Log warning for local development mode
if (isLocalDevelopment) {
  console.warn('⚠️  Using default values for external provider secrets in local development mode.');
  console.warn('   For production deployment, configure the required secrets using: npx ampx sandbox secret set');
}

// Helper function to create a BackendSecret with default value support
function createSecretOrDefault(secretName: string, defaultValue: string): BackendSecret {
  if (isLocalDevelopment) {
    return {
      resolve: (): SecretValue => SecretValue.unsafePlainText(defaultValue),
      resolvePath: (): { branchSecretPath: string; sharedSecretPath: string } => ({
        branchSecretPath: `local-default-${secretName}`,
        sharedSecretPath: `local-default-${secretName}`
      })
    };
  }
  return secret(secretName);
}

export const auth = defineAuth({
  loginWith: {
    email: true,
    externalProviders: {
      google: {
        clientId: createSecretOrDefault('GOOGLE_CLIENT_ID', 'default-google-client-id'),
        clientSecret: createSecretOrDefault('GOOGLE_CLIENT_SECRET', 'default-google-client-secret'),
        attributeMapping: {
          email: 'email',
          nickname: 'given_name'
        },
        scopes: ['email', 'profile', 'openid']
      },
      facebook: {
        clientId: createSecretOrDefault('FACEBOOK_CLIENT_ID', 'default-facebook-client-id'),
        clientSecret: createSecretOrDefault('FACEBOOK_CLIENT_SECRET', 'default-facebook-client-secret'),
        attributeMapping: {
          email: 'email',
          nickname: 'name'
        },
        scopes: ['email', 'public_profile']
      },
      callbackUrls: [
        'http://localhost:5173/',
        'https://brainincup.com/'
      ],
      logoutUrls: [
        'http://localhost:5173/',
        'https://brainincup.com/'
      ]
    }
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
