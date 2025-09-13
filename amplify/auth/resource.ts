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
      callbackUrls: [
        'http://localhost:5173/',
        'https://main.d2x8xqk8qk8qk8.amplifyapp.com/' // Replace with your actual domain
      ],
      logoutUrls: [
        'http://localhost:5173/',
        'https://main.d2x8xqk8qk8qk8.amplifyapp.com/' // Replace with your actual domain
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
