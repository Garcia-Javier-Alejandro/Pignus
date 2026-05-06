import axios from 'axios';
import { config } from '../config/env.js';
import { updateEnvValues } from '../utils/envFile.js';

const authCode = process.env.MELI_AUTH_CODE;

if (!authCode) {
  throw new Error('Missing MELI_AUTH_CODE in .env');
}

let response;

try {
  response = await axios.post(
    `${config.meli.baseUrl}/oauth/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.meli.appId,
      client_secret: config.meli.clientSecret,
      code: authCode,
      redirect_uri: config.meli.redirectUri,
    }),
    {
      timeout: 30000,
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
    },
  );
} catch (error) {
  const status = error.response?.status;
  const data = error.response?.data;
  const message = data?.message || data?.error_description || error.message;
  throw new Error(`Mercado Libre token exchange failed${status ? ` (${status})` : ''}: ${message}`);
}

const data = response.data;

if (!data.access_token) {
  throw new Error('Mercado Libre did not return access_token');
}

if (!data.refresh_token) {
  throw new Error('Mercado Libre did not return refresh_token. Generate a new code with npm run meli:auth-url and confirm the URL includes scope=offline_access.');
}

const expiresAt = new Date(Date.now() + Number(data.expires_in) * 1000).toISOString();

updateEnvValues({
  MELI_ACCESS_TOKEN: data.access_token,
  MELI_REFRESH_TOKEN: data.refresh_token,
  MELI_TOKEN_EXPIRES_AT: expiresAt,
  MELI_SELLER_ID: data.user_id ? String(data.user_id) : config.meli.sellerId,
});

console.info(`Mercado Libre tokens saved. Seller id: ${data.user_id}. Expires at UTC: ${expiresAt}`);
