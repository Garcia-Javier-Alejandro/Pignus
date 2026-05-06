import axios from 'axios';
import { config } from '../config/env.js';
import { updateEnvValues } from '../utils/envFile.js';
import { withRetry } from '../utils/retry.js';

let currentAccessToken = config.meli.accessToken;
let currentRefreshToken = config.meli.refreshToken;
let currentTokenExpiresAt = config.meli.tokenExpiresAt;

const hasRefreshConfig = () => (
  Boolean(config.meli.appId)
  && Boolean(config.meli.clientSecret)
  && Boolean(currentRefreshToken)
);

const getExpiresAt = (expiresInSeconds) => {
  if (!expiresInSeconds) {
    return '';
  }

  return new Date(Date.now() + Number(expiresInSeconds) * 1000).toISOString();
};

export function getMeliAccessToken() {
  return currentAccessToken;
}

export function shouldRefreshMeliToken() {
  if (!hasRefreshConfig() || !currentTokenExpiresAt) {
    return false;
  }

  const expiresAt = Date.parse(currentTokenExpiresAt);

  if (Number.isNaN(expiresAt)) {
    return false;
  }

  const fiveMinutesMs = 5 * 60 * 1000;
  return expiresAt <= Date.now() + fiveMinutesMs;
}

export async function refreshMeliAccessToken() {
  if (!hasRefreshConfig()) {
    throw new Error('Missing MELI_APP_ID, MELI_CLIENT_SECRET, or MELI_REFRESH_TOKEN; cannot refresh Mercado Libre token.');
  }

  const response = await withRetry(
    () => axios.post(
      `${config.meli.baseUrl}/oauth/token`,
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.meli.appId,
        client_secret: config.meli.clientSecret,
        refresh_token: currentRefreshToken,
      }),
      {
        timeout: 30000,
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
      },
    ),
    { retries: config.meli.maxRetries },
  );

  const data = response.data;
  const expiresAt = getExpiresAt(data.expires_in);

  currentAccessToken = data.access_token;
  currentRefreshToken = data.refresh_token;
  currentTokenExpiresAt = expiresAt;

  updateEnvValues({
    MELI_ACCESS_TOKEN: data.access_token,
    MELI_REFRESH_TOKEN: data.refresh_token,
    MELI_TOKEN_EXPIRES_AT: expiresAt,
    MELI_SELLER_ID: data.user_id ? String(data.user_id) : config.meli.sellerId,
  });

  console.info('Mercado Libre token refreshed and .env updated.');

  return currentAccessToken;
}
