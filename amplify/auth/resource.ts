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
      facebook: {
        clientId: secret('FACEBOOK_CLIENT_ID'),
        clientSecret: secret('FACEBOOK_CLIENT_SECRET'),
        attributeMapping: {
          email: 'email',
          nickname: 'name'
        },
        scopes: ['email', 'public_profile']
      },
      callbackUrls: [
        'https://brainincup.com/',
        'https://www.brainincup.com/',
        'http://localhost:5173/'
      ],
      logoutUrls: [
        'https://brainincup.com/',
        'https://www.brainincup.com/',
        'http://localhost:5173/'
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
