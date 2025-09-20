import { defineAuth, secret } from '@aws-amplify/backend';

/**
 * Define and configure your auth resource
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
    externalProviders: {
      google: {
        clientId: secret('GOOGLE_CLIENT_ID'),
        clientSecret: secret('GOOGLE_CLIENT_SECRET'),
        attributeMapping: {
          email: 'email',
          nickname: 'given_name'
        },
        scopes: ['email', 'profile', 'openid']
      },
      signInWithApple: {
        clientId: secret('APPLE_CLIENT_ID'),
        keyId: secret('APPLE_KEY_ID'),
        privateKey: secret('APPLE_PRIVATE_KEY'),
        teamId: secret('APPLE_TEAM_ID'),
        attributeMapping: {
          email: 'email',
          nickname: 'name'
        },
        scopes: ['email', 'name']
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
